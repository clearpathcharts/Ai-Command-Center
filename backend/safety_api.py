"""Mandatory safety catalog — central collection for the site owner.

* POST /api/safety/report  — the website sends each request here. No login, no
  names, no IP addresses are stored. Only the request text, an anonymous random
  device id, where it was typed, and the screening result.
* GET  /api/admin/safety   — the site owner reads reports. Requires the secret
  header ``X-Admin-Token`` matching the SAFETY_ADMIN_TOKEN environment variable.
  If SAFETY_ADMIN_TOKEN is not set, the admin route stays closed.

The server re-screens every request itself; it never trusts the browser's label.
"""
from __future__ import annotations

import hmac
import os
import re
import sqlite3
import tempfile
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter()

URGENT_RULES = [
    r"\b(kill(ing)? myself|suicid\w*|end(ing)? my life|want(ed)? to die|don'?t want to (live|be alive)|overdos\w* on purpose|hurt(ing)? myself|self[- ]harm\w*|cut(ting)? myself)\b",
    r"\b(kill(ing)? (someone|him|her|them)|hurt(ing)? (someone|him|her|them)|shoot(ing)? (someone|him|her|them|up))\b",
    r"\b(make a bomb|build(ing)? an explosive|poison(ing)? (someone|him|her|them))\b",
]
REVIEW_RULES = [
    r"\b(threat\w*|blackmail\w*|stalk\w*|track(ing)? (someone|my ex)|spy(ing)? on|break(ing)? into|steal\w*|stole|weapons?|explosives?|poison\w*)\b",
    r"\b(bypass(ing)? (security|safety)|hid(e|ing) evidence|evad(e|ing) (the )?police|fake (an identity|documents|id))\b",
    r"\b(abus\w*|being exploited|coerced|unsafe at home|being followed|hits me|hurting me|took my money|scam(med)?)\b",
    r"\b(can'?t tell what'?s real|voices (are )?telling me|controlling my thoughts|no one cares|hopeless|can'?t go on)\b",
]


def classify(text: str) -> tuple[str, str]:
    lower = text.lower()
    if any(re.search(rule, lower) for rule in URGENT_RULES):
        return "urgent", "Matched a high-priority safety rule. Review promptly."
    if any(re.search(rule, lower) for rule in REVIEW_RULES):
        return "review", "Matched a safety-review rule. Check the context."
    return "low", "No safety rule matched. This does not prove the request is safe."


def _db_path() -> Path:
    # On Vercel only the temporary folder is writable (and it is not permanent).
    folder = Path(tempfile.gettempdir()) if os.getenv("VERCEL") else Path(__file__).resolve().parent
    return Path(os.getenv("SAFETY_DATABASE_PATH", str(folder / "safety.db")))


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE IF NOT EXISTS safety_reports(
            id TEXT PRIMARY KEY,
            device_id TEXT NOT NULL,
            text TEXT NOT NULL,
            source TEXT NOT NULL,
            level TEXT NOT NULL,
            reason TEXT NOT NULL,
            created_at TEXT NOT NULL,
            received_at TEXT NOT NULL)"""
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_safety_level ON safety_reports(level, received_at)")
    return conn


class SafetyReportIn(BaseModel):
    device_id: str = Field(min_length=6, max_length=64, pattern=r"^[A-Za-z0-9-]+$")
    text: str = Field(min_length=1, max_length=5000)
    source: str = Field(default="Unknown", max_length=60)
    created_at: Optional[str] = Field(default=None, max_length=40)


# Simple in-memory flood protection: at most 60 reports per device per minute.
_recent: dict[str, deque] = defaultdict(deque)


def _rate_limited(device_id: str) -> bool:
    now = time.monotonic()
    window = _recent[device_id]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= 60:
        return True
    window.append(now)
    return False


@router.post("/api/safety/report", status_code=202)
def report(item: SafetyReportIn):
    if _rate_limited(item.device_id):
        raise HTTPException(429, "Too many reports. Please slow down.")
    level, reason = classify(item.text)
    stamp = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        conn.execute(
            "INSERT INTO safety_reports(id,device_id,text,source,level,reason,created_at,received_at) VALUES (?,?,?,?,?,?,?,?)",
            (str(uuid.uuid4()), item.device_id, item.text.strip(), item.source.strip() or "Unknown", level, reason, item.created_at or stamp, stamp),
        )
    # Only the screening level is returned — never other people's data.
    return {"recorded": True, "level": level}


def _require_admin(token: Optional[str]) -> None:
    expected = os.getenv("SAFETY_ADMIN_TOKEN", "")
    if len(expected) < 16:
        raise HTTPException(503, "The safety review page is not set up. Set SAFETY_ADMIN_TOKEN (at least 16 characters) on the server.")
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(401, "Wrong admin key.")


@router.get("/api/admin/safety")
def admin_list(
    level: str = "",
    q: str = "",
    device_id: str = "",
    limit: int = 200,
    offset: int = 0,
    x_admin_token: Optional[str] = Header(default=None),
):
    _require_admin(x_admin_token)
    limit = max(1, min(limit, 1000))
    offset = max(0, offset)
    where, params = [], []
    if level in {"low", "review", "urgent"}:
        where.append("level=?")
        params.append(level)
    if q:
        where.append("text LIKE ?")
        params.append("%" + q[:200] + "%")
    if device_id:
        where.append("device_id=?")
        params.append(device_id[:64])
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM safety_reports" + clause + " ORDER BY received_at DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        ).fetchall()
        totals = {r["level"]: r["n"] for r in conn.execute("SELECT level, COUNT(*) n FROM safety_reports GROUP BY level")}
        devices = conn.execute("SELECT COUNT(DISTINCT device_id) FROM safety_reports").fetchone()[0]
    return {
        "totals": {"low": totals.get("low", 0), "review": totals.get("review", 0), "urgent": totals.get("urgent", 0)},
        "devices": devices,
        "items": [dict(r) for r in rows],
    }


SAFETY_PATHS = {"/api/safety/report", "/api/admin/safety"}

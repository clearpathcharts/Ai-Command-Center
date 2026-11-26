"""Runs the safety catalog against a REAL Postgres database.
Skipped unless TEST_POSTGRES_URL is set (CI and local runs can set it)."""
import os
from pathlib import Path
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main
import safety_api

URL = os.getenv("TEST_POSTGRES_URL", "")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_POSTGRES_URL not set")


def test_reports_are_saved_permanently_in_postgres(monkeypatch):
    import psycopg
    with psycopg.connect(URL) as conn:
        conn.execute("DROP TABLE IF EXISTS safety_reports")
    safety_api._pg_ready.clear()
    monkeypatch.setenv("DATABASE_URL", URL)
    monkeypatch.setenv("SAFETY_ADMIN_PIN", "654321")
    safety_api._failed_by_ip.clear(); safety_api._failed_all.clear()
    device = "device-" + uuid.uuid4().hex[:8]
    with TestClient(main.app) as c:
        assert c.get("/api/safety/status").json() == {"storage": "permanent database", "permanent": True, "working": True}
        assert c.post("/api/safety/report", json={"device_id": device, "text": "Someone is STALKING me", "source": "Test"}).json()["level"] == "review"
        assert c.post("/api/safety/report", json={"device_id": device, "text": "help with my budget"}).status_code == 202
        data = c.get("/api/admin/safety", params={"q": "stalking"}, headers={"X-Admin-Token": "654321"}).json()
        assert data["totals"]["review"] == 1 and data["devices"] == 1
        assert [i["text"] for i in data["items"]] == ["Someone is STALKING me"]  # search ignores capitals
    # Brand-new connection, like a server restart: the reports are still there.
    with psycopg.connect(URL) as conn:
        assert conn.execute("SELECT COUNT(*) FROM safety_reports").fetchone()[0] == 2

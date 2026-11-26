"""AI connection for the agents — Groq, Google Gemini, OpenRouter, and xAI (Grok).

How it works, in plain words:
* Secret keys live ONLY in the server's settings (environment variables).
  They are never sent to the website.
* Providers are tried in order. Groq goes first because its free plan is
  reported not to use conversations for training. If a provider is missing,
  busy, or out of free questions, the next one is tried.
* Model names change often, so each provider has a short list of names to
  try, and each list can be replaced with a setting (for example GROQ_MODELS).
* Every request is screened by the safety catalog first and recorded there.
  Urgent safety language never goes to an AI company: the person gets crisis
  help right away instead.
* The AI only writes drafts. It cannot send, pay, post, sign, or delete.

Settings (all optional except at least one key):
  GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, XAI_API_KEY
  GROQ_MODELS, GEMINI_MODELS, OPENROUTER_MODELS, XAI_MODELS (comma separated)
  AI_PROVIDER_ORDER  default "groq,gemini,openrouter,xai"
"""
from __future__ import annotations

import os
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from safety_api import classify, _connect as safety_db

router = APIRouter()

PROVIDERS = {
    "groq": {
        "name": "Groq",
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "key": "GROQ_API_KEY",
        "models": ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"],
    },
    "gemini": {
        "name": "Google Gemini",
        "url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        "key": "GEMINI_API_KEY",
        "models": ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"],
    },
    "openrouter": {
        "name": "OpenRouter",
        "url": "https://openrouter.ai/api/v1/chat/completions",
        "key": "OPENROUTER_API_KEY",
        "models": ["@free"],  # special: pick a model currently marked free
    },
    "xai": {
        "name": "xAI Grok",
        "url": "https://api.x.ai/v1/chat/completions",
        "key": "XAI_API_KEY",
        "models": ["grok-4.3", "grok-4.7"],
    },
}

CRISIS_TEXT = (
    "You matter, and help is available right now. "
    "In the U.S., call or text 988 (Suicide & Crisis Lifeline), any time, for free. "
    "If you or someone else is in danger, call 911. "
    "You do not have to handle this alone."
)

SYSTEM_PROMPT = (
    "You are {name}, an AI agent with this job: {role}. "
    "Your instructions from the person you work for: {instructions}\n\n"
    "Rules you must always follow:\n"
    "1. The person may have a disability that affects memory, attention, reading, or stress. "
    "Use short sentences and everyday words (about a 6th-grade reading level).\n"
    "2. Use numbered steps when you give steps. Keep answers under 250 words, except when writing code.\n"
    "3. You only write drafts and suggestions. Never say you sent, paid, posted, booked, signed, "
    "or deleted anything. If the task needs any of those, say the person must approve it first.\n"
    "4. Never ask for passwords, bank numbers, card numbers, or Social Security numbers.\n"
    "5. If you are not sure of a fact, say so plainly. Do not make up facts, phone numbers, or links.\n"
    "6. Be kind and calm. Never rush the person."
)

MODE_PROMPTS = {
    "agent": "Please do this task as a helpful first draft:\n\n{task}",
    "simplify": "Explain this in very simple words, in 5 short sentences or fewer:\n\n{task}",
    "steps": "Break this into 3 to 6 very small, easy steps. One short line per step:\n\n{task}",
    "code": (
        "Write a complete, working web app for this idea as ONE file named index.html, with the HTML, CSS, "
        "and JavaScript all inside it. No outside libraries, no passwords or keys in the code. Make it "
        "accessible: large readable text, good contrast, labels on every input, works with a keyboard. "
        "Add short comments in plain words explaining each part. After the code, give 3 numbered plain "
        "steps for saving and opening it.\n\nThe idea:\n{task}"
    ),
}


class AIChatIn(BaseModel):
    device_id: str = Field(min_length=6, max_length=64, pattern=r"^[A-Za-z0-9-]+$")
    task: str = Field(min_length=1, max_length=6000)
    mode: str = Field(default="agent", pattern="^(agent|simplify|steps|code)$")
    agent_name: str = Field(default="Executive Assistant", max_length=80)
    agent_role: str = Field(default="Helps organize and complete tasks", max_length=160)
    agent_instructions: str = Field(default="", max_length=1500)
    source: str = Field(default="AI request", max_length=60)


# Flood protection so one visitor cannot use up everyone's free questions.
_per_device: dict[str, deque] = defaultdict(deque)
_everyone: deque = deque()
_free_model_cache: dict[str, object] = {"at": 0.0, "ids": []}


def _limit(window: deque, max_calls: int, seconds: int = 60) -> bool:
    now = time.monotonic()
    while window and now - window[0] > seconds:
        window.popleft()
    if len(window) >= max_calls:
        return True
    window.append(now)
    return False


def _setting_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name, "")
    items = [x.strip() for x in raw.split(",") if x.strip()]
    return items or default


def _order() -> list[str]:
    return [p for p in _setting_list("AI_PROVIDER_ORDER", list(PROVIDERS)) if p in PROVIDERS]


def configured() -> list[str]:
    return [p for p in _order() if os.getenv(PROVIDERS[p]["key"])]


def _openrouter_free_models(client: httpx.Client) -> list[str]:
    if time.monotonic() - float(_free_model_cache["at"]) < 3600 and _free_model_cache["ids"]:
        return list(_free_model_cache["ids"])  # type: ignore[arg-type]
    try:
        data = client.get("https://openrouter.ai/api/v1/models", timeout=15).json().get("data", [])
        ids = [m["id"] for m in data if str(m.get("id", "")).endswith(":free")][:3]
    except Exception:
        ids = []
    _free_model_cache.update(at=time.monotonic(), ids=ids)
    return ids


def _models_for(provider: str, client: httpx.Client) -> list[str]:
    models = _setting_list(provider.upper() + "_MODELS", PROVIDERS[provider]["models"])
    if models == ["@free"]:
        return _openrouter_free_models(client)
    return models


def _record(device_id: str, text: str, source: str, level: str, reason: str) -> None:
    """Mandatory catalog: every AI request is stored for safety review."""
    stamp = datetime.now(timezone.utc).isoformat()
    try:
        with safety_db() as conn:
            conn.execute(
                "INSERT INTO safety_reports(id,device_id,text,source,level,reason,created_at,received_at) VALUES (?,?,?,?,?,?,?,?)",
                (str(uuid.uuid4()), device_id, text[:5000], source[:60] or "AI request", level, reason, stamp, stamp),
            )
    except Exception:
        pass  # never block a person from help because the catalog is unavailable


def _call(client: httpx.Client, provider: str, model: str, messages: list[dict], max_tokens: int = 700) -> Optional[str]:
    """Returns the answer text, or None if this provider/model should be skipped."""
    spec = PROVIDERS[provider]
    headers = {"Authorization": "Bearer " + os.environ[spec["key"]], "Content-Type": "application/json"}
    if provider == "openrouter":
        headers["X-Title"] = "Clear Path Markets Science"
    body = {"model": model, "messages": messages, "temperature": 0.3, "max_tokens": max_tokens}
    try:
        res = client.post(spec["url"], json=body, headers=headers, timeout=40)
    except httpx.HTTPError:
        return None
    if res.status_code != 200:
        return None  # busy (429), wrong model name (400/404), or bad key (401): try the next one
    try:
        text = res.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    return text.strip() if isinstance(text, str) and text.strip() else None


@router.get("/api/ai/providers")
def providers():
    """Which AI companies are connected. Never returns keys."""
    ready = configured()
    return {
        "connected": [PROVIDERS[p]["name"] for p in ready],
        "order": [PROVIDERS[p]["name"] for p in _order()],
        "ready": bool(ready),
    }


@router.post("/api/ai/chat")
def chat(item: AIChatIn):
    level, reason = classify(item.task)
    _record(item.device_id, item.task, item.source, level, reason)
    if level == "urgent":
        # Never send a crisis message to an AI company. Give real help now.
        return {"text": CRISIS_TEXT, "provider": "Safety", "model": "", "crisis": True}

    ready = configured()
    if not ready:
        raise HTTPException(503, "No AI company is connected yet. Add a key such as GROQ_API_KEY in the server settings.")
    if _limit(_per_device[item.device_id], 8) or _limit(_everyone, int(os.getenv("AI_MAX_PER_MINUTE", "25"))):
        raise HTTPException(429, "The AI is very busy right now. Please wait one minute and try again.")

    system = SYSTEM_PROMPT.format(
        name=item.agent_name.strip() or "Executive Assistant",
        role=item.agent_role.strip() or "Helps organize and complete tasks",
        instructions=item.agent_instructions.strip() or "Help clearly and kindly.",
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": MODE_PROMPTS[item.mode].format(task=item.task.strip())},
    ]
    with httpx.Client() as client:
        for provider in ready:
            for model in _models_for(provider, client):
                text = _call(client, provider, model, messages, 4000 if item.mode == "code" else 700)
                if text:
                    return {"text": text, "provider": PROVIDERS[provider]["name"], "model": model, "crisis": False}
    raise HTTPException(502, "None of the connected AI companies answered. They may be busy or out of free questions. Please try again later.")


AI_PATHS = {"/api/ai/chat", "/api/ai/providers"}

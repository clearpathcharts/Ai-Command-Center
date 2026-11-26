from pathlib import Path
import sys

import httpx
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main
import ai_gateway

DEVICE = "device-ai-test-1"
KEYS = ["GROQ_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "XAI_API_KEY"]


def setup(monkeypatch, tmp_path, keys, handler):
    monkeypatch.setenv("SAFETY_DATABASE_PATH", str(tmp_path / "safety.db"))
    for k in KEYS:
        monkeypatch.delenv(k, raising=False)
    for k, v in keys.items():
        monkeypatch.setenv(k, v)
    real_client = httpx.Client
    monkeypatch.setattr(ai_gateway.httpx, "Client", lambda *a, **kw: real_client(transport=httpx.MockTransport(handler)))
    ai_gateway._per_device.clear()
    ai_gateway._everyone.clear()
    ai_gateway._free_model_cache.update(at=0.0, ids=[])
    return TestClient(main.app)


def answer(text):
    return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})


def test_groq_answers_first(monkeypatch, tmp_path):
    calls = []
    def handler(req):
        calls.append(req.url.host)
        assert req.headers["authorization"] == "Bearer groq-secret"
        return answer("1. Write the goal.")
    with setup(monkeypatch, tmp_path, {"GROQ_API_KEY": "groq-secret", "XAI_API_KEY": "x"}, handler) as c:
        r = c.post("/api/ai/chat", json={"device_id": DEVICE, "task": "plan my week"})
    assert r.status_code == 200
    assert r.json()["provider"] == "Groq" and r.json()["text"] == "1. Write the goal."
    assert calls == ["api.groq.com"]


def test_falls_back_when_busy_or_model_renamed(monkeypatch, tmp_path):
    def handler(req):
        if req.url.host == "api.groq.com":
            return httpx.Response(429, json={"error": "busy"})
        body = req.read().decode()
        if "gemini-3.8-flash" in body:
            return httpx.Response(404, json={"error": "model not found"})
        return answer("Here is a simple draft.")
    with setup(monkeypatch, tmp_path, {"GROQ_API_KEY": "g", "GEMINI_API_KEY": "m"}, handler) as c:
        r = c.post("/api/ai/chat", json={"device_id": DEVICE, "task": "write a thank you note"})
    assert r.status_code == 200
    assert r.json()["provider"] == "Google Gemini"
    assert r.json()["model"] == "gemini-3.5-flash"


def test_openrouter_picks_a_free_model(monkeypatch, tmp_path):
    def handler(req):
        if req.method == "GET":
            return httpx.Response(200, json={"data": [{"id": "paid/model"}, {"id": "some/model:free"}]})
        assert b"some/model:free" in req.read()
        return answer("ok")
    with setup(monkeypatch, tmp_path, {"OPENROUTER_API_KEY": "o"}, handler) as c:
        r = c.post("/api/ai/chat", json={"device_id": DEVICE, "task": "hello"})
    assert r.json()["model"] == "some/model:free"


def test_crisis_never_goes_to_ai_and_is_cataloged(monkeypatch, tmp_path):
    def handler(req):
        assert b"end my life" not in req.read(), "crisis text must not be sent to an AI company"
        return answer("budget steps")
    monkeypatch.setenv("SAFETY_ADMIN_TOKEN", "a-very-long-admin-key-123")
    with setup(monkeypatch, tmp_path, {"GROQ_API_KEY": "g"}, handler) as c:
        r = c.post("/api/ai/chat", json={"device_id": DEVICE, "task": "I want to end my life"})
        assert r.status_code == 200 and r.json()["crisis"] is True and "988" in r.json()["text"]
        c.post("/api/ai/chat", json={"device_id": DEVICE, "task": "help me budget"})
        admin = c.get("/api/admin/safety", headers={"X-Admin-Token": "a-very-long-admin-key-123"}).json()
    assert admin["totals"]["urgent"] == 1
    assert len(admin["items"]) == 2


def test_no_keys_and_status_never_leak(monkeypatch, tmp_path):
    with setup(monkeypatch, tmp_path, {}, lambda req: answer("x")) as c:
        assert c.post("/api/ai/chat", json={"device_id": DEVICE, "task": "hi"}).status_code == 503
        assert c.get("/api/ai/providers").json()["ready"] is False
    with setup(monkeypatch, tmp_path, {"GROQ_API_KEY": "super-secret-key"}, lambda req: answer("x")) as c:
        status = c.get("/api/ai/providers")
    assert status.json()["connected"] == ["Groq"]
    assert "super-secret-key" not in status.text


def test_rate_limit_per_device(monkeypatch, tmp_path):
    with setup(monkeypatch, tmp_path, {"GROQ_API_KEY": "g"}, lambda req: answer("x")) as c:
        codes = [c.post("/api/ai/chat", json={"device_id": DEVICE, "task": "hi"}).status_code for _ in range(9)]
    assert codes[:8] == [200] * 8 and codes[8] == 429

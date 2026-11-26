from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main

DEVICE = "device-test-123"


def client(tmp_path, monkeypatch, token="a-very-long-admin-key-123"):
    monkeypatch.setenv("SAFETY_DATABASE_PATH", str(tmp_path / "safety.db"))
    if token is None:
        monkeypatch.delenv("SAFETY_ADMIN_TOKEN", raising=False)
    else:
        monkeypatch.setenv("SAFETY_ADMIN_TOKEN", token)
    return TestClient(main.app)


def test_report_is_accepted_without_login_and_rescreened_by_server(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        r = c.post("/api/safety/report", json={"device_id": DEVICE, "text": "I want to end my life", "source": "Rescue Mode"})
        assert r.status_code == 202
        assert r.json() == {"recorded": True, "level": "urgent"}
        r = c.post("/api/safety/report", json={"device_id": DEVICE, "text": "help me pay my phone bill"})
        assert r.json()["level"] == "low"


def test_admin_requires_correct_key(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        c.post("/api/safety/report", json={"device_id": DEVICE, "text": "someone is stalking me"})
        assert c.get("/api/admin/safety").status_code == 401
        assert c.get("/api/admin/safety", headers={"X-Admin-Token": "wrong-key-wrong-key"}).status_code == 401
        ok = c.get("/api/admin/safety", headers={"X-Admin-Token": "a-very-long-admin-key-123"})
        assert ok.status_code == 200
        body = ok.json()
        assert body["totals"]["review"] == 1
        assert body["devices"] == 1
        assert body["items"][0]["text"] == "someone is stalking me"
        filtered = c.get("/api/admin/safety", params={"level": "urgent"}, headers={"X-Admin-Token": "a-very-long-admin-key-123"})
        assert filtered.json()["items"] == []


def test_admin_closed_when_key_not_configured(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, token=None) as c:
        assert c.get("/api/admin/safety", headers={"X-Admin-Token": "anything-at-all-here"}).status_code == 503


def test_report_rejects_bad_input(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        assert c.post("/api/safety/report", json={"device_id": "../../x", "text": "hi"}).status_code == 422
        assert c.post("/api/safety/report", json={"device_id": DEVICE, "text": ""}).status_code == 422


def test_uses_writable_temp_folder_on_vercel(monkeypatch):
    import importlib, tempfile
    import safety_api
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("SAFETY_DATABASE_PATH", raising=False)
    assert str(safety_api._db_path()).startswith(tempfile.gettempdir())
    monkeypatch.delenv("DATABASE_PATH", raising=False)
    reloaded = importlib.reload(main)
    assert str(reloaded.DB_PATH).startswith(tempfile.gettempdir())
    monkeypatch.delenv("VERCEL")
    importlib.reload(main)


def test_owner_pin_works_and_locks_after_wrong_tries(tmp_path, monkeypatch):
    import safety_api
    safety_api._failed_by_ip.clear(); safety_api._failed_all.clear()
    monkeypatch.setenv("SAFETY_ADMIN_PIN", "654321")
    with client(tmp_path, monkeypatch, token=None) as c:
        assert c.get("/api/admin/safety", headers={"X-Admin-Token": "654321"}).status_code == 200
        codes = [c.get("/api/admin/safety", headers={"X-Admin-Token": "000000"}).status_code for _ in range(5)]
        assert codes == [401] * 5
        # Locked now — even the right code is refused for 15 minutes.
        assert c.get("/api/admin/safety", headers={"X-Admin-Token": "654321"}).status_code == 429
    safety_api._failed_by_ip.clear(); safety_api._failed_all.clear()


def test_website_pages_are_served_but_source_is_not(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        home = c.get("/")
        assert home.status_code == 200 and "Clear Path Markets Science" in home.text
        assert c.get("/app.js").status_code == 200
        assert c.get("/styles.css").status_code == 200
        assert c.get("/admin").status_code == 200
        for secret in ["main.py", "safety_api.py", ".env", "README.md", "app.py", "requirements.txt", "..%2Fbackend%2Fmain.py"]:
            assert c.get("/" + secret).status_code == 404, secret
        assert c.get("/health").json()["status"] == "ok"


def test_root_requirements_match_backend():
    root = Path(__file__).resolve().parents[2]
    assert (root / "requirements.txt").read_text() == (root / "backend" / "requirements.txt").read_text()

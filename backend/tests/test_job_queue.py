from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


def test_health_is_available():
    with TestClient(main.app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_capabilities_report_personal_local_only_mode():
    with TestClient(main.app) as client:
        response = client.get("/api/capabilities")
    assert response.status_code == 200
    data = response.json()
    assert data["workspace_mode"] == "single-user-browser-local"
    assert data["cloud_api_enabled"] is False
    assert data["accounts_required"] is False
    assert data["persistent_storage"] == "browser localStorage"


def test_all_cloud_workspace_and_ai_routes_fail_closed_without_login():
    paths = [
        ("GET", "/api/departments"),
        ("POST", "/api/departments"),
        ("GET", "/api/agents"),
        ("POST", "/api/agents"),
        ("GET", "/api/tasks"),
        ("POST", "/api/tasks"),
        ("GET", "/api/approvals"),
        ("POST", "/api/approvals"),
        ("GET", "/api/memory"),
        ("POST", "/api/memory"),
        ("GET", "/api/agent-messages"),
        ("POST", "/api/agent-messages"),
        ("POST", "/api/brain/plan"),
        ("POST", "/api/ai/respond"),
        ("GET", "/api/ai/status"),
        ("POST", "/api/jobs"),
        ("GET", "/api/jobs"),
        ("POST", "/api/worker/claim"),
        ("POST", "/api/worker/complete"),
    ]
    with TestClient(main.app) as client:
        for method, path in paths:
            response = client.request(method, path, json={})
            assert response.status_code == 503, (method, path, response.status_code)
            assert response.json()["code"] == "LOCAL_ONLY_MODE"


def test_unknown_api_routes_are_also_closed():
    with TestClient(main.app) as client:
        response = client.get("/api/unlisted-endpoint")
    assert response.status_code == 503
    assert response.json()["code"] == "LOCAL_ONLY_MODE"

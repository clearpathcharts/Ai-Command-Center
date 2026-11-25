from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


def test_health_and_capabilities():
    with TestClient(main.app) as client:
        assert client.get("/health").status_code == 200
        capabilities = client.get("/api/capabilities").json()
        assert capabilities["workspace_mode"] == "single-user-browser-local"
        assert capabilities["cloud_api_enabled"] is False


def test_catalog_is_searchable_and_has_use_case_metadata():
    with TestClient(main.app) as client:
        response = client.get("/api/catalog", params={"q": "trading"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] >= 1
        item = next(entry for entry in payload["items"] if entry["slug"] == "markets-trading")
        assert "Market Research Analyst" in item["agent_roles"]
        assert "strategy review" in item["workflow_examples"]


def test_catalog_categories_are_indexed():
    with TestClient(main.app) as client:
        response = client.get("/api/catalog/categories")
    assert response.status_code == 200
    categories = {item["category"]: item["use_cases"] for item in response.json()}
    assert categories["Technology"] >= 1
    assert categories["Personal productivity"] >= 1


def test_catalog_usage_stores_only_category_counter():
    with TestClient(main.app) as client:
        first = client.post("/api/catalog/usage", json={"slug": "research"})
        second = client.post("/api/catalog/usage", json={"slug": "research"})
        assert first.status_code == 202
        assert second.status_code == 202
        assert second.json()["usage_count"] == first.json()["usage_count"] + 1
        assert "prompt" not in second.json()
        assert "user" not in second.json()


def test_catalog_rejects_unknown_or_malformed_entries():
    with TestClient(main.app) as client:
        assert client.post("/api/catalog/usage", json={"slug": "not-real"}).status_code == 404
        assert client.post("/api/catalog/usage", json={"slug": "../../private"}).status_code == 422


def test_private_workspace_and_agent_communication_routes_stay_closed():
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


def test_unknown_api_routes_are_closed():
    with TestClient(main.app) as client:
        response = client.get("/api/unlisted-endpoint")
    assert response.status_code == 503
    assert response.json()["code"] == "LOCAL_ONLY_MODE"

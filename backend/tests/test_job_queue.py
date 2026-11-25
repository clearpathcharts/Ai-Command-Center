import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# main.py imports auth as a sibling module; run tests from the backend directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "test.sqlite3")
    main.init_db()
    main.app.dependency_overrides[main.require_firebase_user] = lambda: {"uid": "user-a"}
    main.app.dependency_overrides[main.require_worker_token] = lambda: True
    with TestClient(main.app) as test_client:
        yield test_client
    main.app.dependency_overrides.clear()


def create_job(client, job_id="job-test-0001"):
    return client.post("/api/jobs", json={
        "id": job_id,
        "agent_id": "agent-research",
        "title": "Research a topic",
        "instructions": "Prepare a concise sourced research plan."
    })


def test_job_lifecycle_and_owner_scope(client):
    response = create_job(client)
    assert response.status_code == 202
    assert response.json()["status"] == "queued"

    listed = client.get("/api/jobs")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == "job-test-0001"

    detail = client.get("/api/jobs/job-test-0001")
    assert detail.status_code == 200
    assert detail.json()["title"] == "Research a topic"

    claimed = client.post("/api/worker/claim", json={})
    assert claimed.status_code == 200
    assert claimed.json()["job"]["status"] == "running"

    completed = client.post("/api/worker/complete", json={
        "id": "job-test-0001",
        "result": "Research plan prepared for human review.",
        "error": ""
    })
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"

    final = client.get("/api/jobs/job-test-0001")
    assert final.json()["result"] == "Research plan prepared for human review."


def test_only_queued_jobs_can_be_cancelled(client):
    assert create_job(client).status_code == 202
    cancelled = client.post("/api/jobs/job-test-0001/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    again = client.post("/api/jobs/job-test-0001/cancel")
    assert again.status_code == 409


def test_failed_job_can_be_retried(client):
    assert create_job(client).status_code == 202
    client.post("/api/worker/claim", json={})
    client.post("/api/worker/complete", json={
        "id": "job-test-0001", "result": "", "error": "temporary provider failure"
    })
    retried = client.post("/api/jobs/job-test-0001/retry")
    assert retried.status_code == 202
    assert retried.json()["status"] == "queued"


def test_user_cannot_read_another_users_job(client):
    assert create_job(client).status_code == 202
    main.app.dependency_overrides[main.require_firebase_user] = lambda: {"uid": "user-b"}
    response = client.get("/api/jobs/job-test-0001")
    assert response.status_code == 404


def test_unscoped_workspace_routes_are_locked(client):
    agents = client.get("/api/agents")
    assert agents.status_code == 200
    assert agents.json()["items"] == []

    ai_status = client.get("/api/ai/status")
    assert ai_status.status_code == 503

    health = client.get("/health")
    assert health.status_code == 200

    # The authenticated job queue remains available.
    assert create_job(client, "job-security-0001").status_code == 202


def test_memory_is_scoped_to_authenticated_user(client):
    payload = {
        "id": "memory-user-a-01",
        "workspace_id": "attacker-selected-workspace",
        "title": "Private note",
        "content": "Only user A should see this.",
        "tags": "private"
    }
    saved = client.post("/api/memory", json=payload)
    assert saved.status_code == 201
    assert saved.json()["workspace_id"] == "user-a"

    # A caller cannot read user A's memory by supplying their workspace ID.
    main.app.dependency_overrides[main.require_firebase_user] = lambda: {"uid": "user-b"}
    other_user = client.get("/api/memory", params={"workspace_id": "user-a"})
    assert other_user.status_code == 200
    assert other_user.json() == []


def test_agent_messages_are_scoped_to_authenticated_user(client):
    payload = {
        "id": "message-user-a-01",
        "workspace_id": "attacker-selected-workspace",
        "message": "Private handoff",
        "message_type": "handoff"
    }
    saved = client.post("/api/agent-messages", json=payload)
    assert saved.status_code == 201
    assert saved.json()["workspace_id"] == "user-a"

    main.app.dependency_overrides[main.require_firebase_user] = lambda: {"uid": "user-b"}
    other_user = client.get("/api/agent-messages", params={"workspace_id": "user-a"})
    assert other_user.status_code == 200
    assert other_user.json() == []


def test_memory_and_messages_require_authentication(client):
    main.app.dependency_overrides.pop(main.require_firebase_user, None)
    assert client.get("/api/memory").status_code == 401
    assert client.get("/api/agent-messages").status_code == 401


def test_core_workspace_records_are_isolated_by_user(client):
    department = {"id":"dept-a-001","name":"Research A","purpose":"Private"}
    assert client.post("/api/departments",json=department).status_code == 201
    agent = {"id":"agent-a-001","name":"Researcher A","role":"Research","department_id":"dept-a-001","instructions":"Private agent"}
    assert client.post("/api/agents",json=agent).status_code == 201
    task = {"id":"task-a-0001","title":"Private task","details":"Only A","agent_id":"agent-a-001","priority":"high"}
    assert client.post("/api/tasks",json=task).status_code == 201
    approval = {"id":"approval-a-01","title":"Private approval","description":"Only A","agent_id":"agent-a-001"}
    assert client.post("/api/approvals",json=approval).status_code == 201

    main.app.dependency_overrides[main.require_firebase_user] = lambda: {"uid":"user-b"}
    assert client.get("/api/departments").json() == []
    assert client.get("/api/agents").json()["items"] == []
    assert client.get("/api/tasks").json() == []
    assert client.get("/api/approvals").json() == []
    assert client.patch("/api/tasks/task-a-0001",json={"status":"done"}).status_code == 404
    assert client.patch("/api/approvals/approval-a-01?decision=approved").status_code == 404
    assert client.post("/api/agents",json={**agent,"id":"agent-b-001"}).status_code == 404


def test_core_workspace_endpoints_require_auth(client):
    main.app.dependency_overrides.pop(main.require_firebase_user,None)
    assert client.get("/api/departments").status_code == 401
    assert client.get("/api/agents").status_code == 401
    assert client.get("/api/tasks").status_code == 401
    assert client.get("/api/approvals").status_code == 401


def test_planner_is_authenticated_and_uses_verified_workspace(client):
    payload = {"workspace_id":"forged-workspace","request":"help me organize research"}
    planned = client.post("/api/brain/plan",json=payload)
    assert planned.status_code == 200
    assert planned.json()["workspace_id"] == "user-a"

    main.app.dependency_overrides.pop(main.require_firebase_user,None)
    assert client.post("/api/brain/plan",json=payload).status_code == 401


def test_ai_gateway_and_status_require_authentication(client):
    assert client.get("/api/ai/status").status_code == 200
    response = client.post("/api/ai/respond",json={"message":"Say hello"})
    assert response.status_code in (200,503)

    main.app.dependency_overrides.pop(main.require_firebase_user,None)
    assert client.get("/api/ai/status").status_code == 401
    assert client.post("/api/ai/respond",json={"message":"Say hello"}).status_code == 401

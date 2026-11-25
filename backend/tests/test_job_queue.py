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

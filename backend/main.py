"""API foundation for Accessible AI Command Center.

This service provides persistent workspace CRUD. It deliberately does not execute
AI actions yet; model-provider adapters and durable workers are separate milestones.
"""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from auth import require_firebase_user, require_worker_token

APP_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("DATABASE_PATH", str(APP_DIR / "workspace.db")))

app = FastAPI(title="Accessible AI Command Center API", version="0.1.0")
allowed_origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-Worker-Token"],
)

# This release is intentionally a single-user, browser-local application.
# No cloud API is enabled: without accounts, a remote API cannot safely distinguish
# the owner from another visitor. Keep all API routes closed until a local-only
# runtime is implemented and bound to the user's own machine.
@app.middleware("http")
async def enforce_local_only_mode(request, call_next):
    path = request.url.path
    if path.startswith("/api/") and path != "/api/capabilities":
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Cloud API is disabled. This release stores workspace data in this browser on this device.",
                "code": "LOCAL_ONLY_MODE"
            }
        )
    return await call_next(request)

@contextmanager
def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()

def now() -> str:
    return datetime.now(timezone.utc).isoformat()

def init_db():
    with db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS departments (
          id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, name TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, department_id TEXT,
          instructions TEXT NOT NULL DEFAULT '', permission_level TEXT NOT NULL DEFAULT 'approval',
          created_at TEXT NOT NULL, FOREIGN KEY(department_id) REFERENCES departments(id)
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
          agent_id TEXT, priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'todo',
          created_at TEXT NOT NULL, FOREIGN KEY(agent_id) REFERENCES agents(id)
        );
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'Memory',
          content TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agent_messages (
          id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, from_agent_id TEXT, to_agent_id TEXT,
          task_id TEXT, message TEXT NOT NULL, message_type TEXT NOT NULL DEFAULT 'handoff',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agent_jobs (
          id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, agent_id TEXT, title TEXT NOT NULL,
          instructions TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', result TEXT NOT NULL DEFAULT '',
          error TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL, started_at TEXT, completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_agent_jobs_owner_created ON agent_jobs(owner_uid, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_agent_jobs_status_created ON agent_jobs(status, created_at);
        CREATE TABLE IF NOT EXISTS approvals (
          id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
          agent_id TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL,
          reviewed_at TEXT, FOREIGN KEY(agent_id) REFERENCES agents(id)
        );
        """)
        # Safely upgrade existing SQLite workspaces while preserving legacy rows.
        for table in ("departments", "agents", "tasks", "approvals"):
            columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
            if "owner_uid" not in columns:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN owner_uid TEXT NOT NULL DEFAULT 'legacy-unassigned'")
        conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_departments_owner ON departments(owner_uid, created_at);
        CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_uid, created_at);
        CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_uid, created_at);
        CREATE INDEX IF NOT EXISTS idx_approvals_owner ON approvals(owner_uid, created_at);
        """)
init_db()

class DepartmentIn(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    purpose: str = Field(default="", max_length=500)

class AgentIn(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(min_length=1, max_length=120)
    department_id: Optional[str] = None
    instructions: str = Field(default="", max_length=5000)
    permission_level: str = Field(default="approval", pattern="^(approval|prepare|routine)$")

class TaskIn(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=5000)
    agent_id: Optional[str] = None
    priority: str = Field(default="normal", pattern="^(low|normal|high)$")

class TaskStatusIn(BaseModel):
    status: str = Field(pattern="^(todo|inprogress|done)$")

class ApprovalIn(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=3000)
    agent_id: Optional[str] = None

@app.get("/health")
def health():
    return {"status": "ok", "service": "accessible-ai-command-center-api", "time": now()}

@app.get("/api/departments")
def list_departments(user=Depends(require_firebase_user)):
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT id,name,purpose,created_at FROM departments WHERE owner_uid=? ORDER BY created_at", (user["uid"],))]

@app.post("/api/departments", status_code=201)
def create_department(item: DepartmentIn, user=Depends(require_firebase_user)):
    with db() as conn:
        try:
            conn.execute("INSERT INTO departments (id,owner_uid,name,purpose,created_at) VALUES (?,?,?,?,?)", (item.id,user["uid"],item.name,item.purpose,now()))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Department ID already exists")
    return item.model_dump()

@app.get("/api/agents")
def list_agents(q: str = "", limit: int = 100, offset: int = 0, user=Depends(require_firebase_user)):
    limit, offset = max(1,min(limit,500)), max(0,offset)
    pattern=f"%{q}%"
    with db() as conn:
        rows=conn.execute("SELECT id,name,role,department_id,instructions,permission_level,created_at FROM agents WHERE owner_uid=? AND (?='' OR name LIKE ? OR role LIKE ? OR instructions LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?",(user["uid"],q,pattern,pattern,pattern,limit,offset)).fetchall()
        total=conn.execute("SELECT COUNT(*) FROM agents WHERE owner_uid=? AND (?='' OR name LIKE ? OR role LIKE ? OR instructions LIKE ?)",(user["uid"],q,pattern,pattern,pattern)).fetchone()[0]
    return {"items":[dict(r) for r in rows],"total":total,"limit":limit,"offset":offset}

@app.post("/api/agents", status_code=201)
def create_agent(item: AgentIn, user=Depends(require_firebase_user)):
    with db() as conn:
        if item.department_id and not conn.execute("SELECT 1 FROM departments WHERE id=? AND owner_uid=?",(item.department_id,user["uid"])).fetchone():
            raise HTTPException(404,"Department not found")
        try:
            conn.execute("INSERT INTO agents (id,owner_uid,name,role,department_id,instructions,permission_level,created_at) VALUES (?,?,?,?,?,?,?,?)",(item.id,user["uid"],item.name,item.role,item.department_id,item.instructions,item.permission_level,now()))
        except sqlite3.IntegrityError:
            raise HTTPException(409,"Agent ID already exists")
    return item.model_dump()

@app.get("/api/tasks")
def list_tasks(user=Depends(require_firebase_user)):
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT id,title,details,agent_id,priority,status,created_at FROM tasks WHERE owner_uid=? ORDER BY created_at DESC",(user["uid"],))]

@app.post("/api/tasks", status_code=201)
def create_task(item: TaskIn, user=Depends(require_firebase_user)):
    with db() as conn:
        if item.agent_id and not conn.execute("SELECT 1 FROM agents WHERE id=? AND owner_uid=?",(item.agent_id,user["uid"])).fetchone():
            raise HTTPException(404,"Agent not found")
        try:
            conn.execute("INSERT INTO tasks (id,owner_uid,title,details,agent_id,priority,status,created_at) VALUES (?,?,?,?,?,?,?,?)",(item.id,user["uid"],item.title,item.details,item.agent_id,item.priority,"todo",now()))
        except sqlite3.IntegrityError:
            raise HTTPException(409,"Task ID already exists")
    return {**item.model_dump(),"status":"todo"}

@app.patch("/api/tasks/{task_id}")
def update_task(task_id: str, item: TaskStatusIn, user=Depends(require_firebase_user)):
    with db() as conn:
        result=conn.execute("UPDATE tasks SET status=? WHERE id=? AND owner_uid=?",(item.status,task_id,user["uid"]))
        if result.rowcount==0:
            raise HTTPException(404,"Task not found")
        return dict(conn.execute("SELECT id,title,details,agent_id,priority,status,created_at FROM tasks WHERE id=? AND owner_uid=?",(task_id,user["uid"])).fetchone())

@app.get("/api/approvals")
def list_approvals(user=Depends(require_firebase_user)):
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT id,title,description,agent_id,status,created_at,reviewed_at FROM approvals WHERE owner_uid=? ORDER BY created_at DESC",(user["uid"],))]

@app.post("/api/approvals", status_code=201)
def create_approval(item: ApprovalIn, user=Depends(require_firebase_user)):
    with db() as conn:
        if item.agent_id and not conn.execute("SELECT 1 FROM agents WHERE id=? AND owner_uid=?",(item.agent_id,user["uid"])).fetchone():
            raise HTTPException(404,"Agent not found")
        try:
            conn.execute("INSERT INTO approvals (id,owner_uid,title,description,agent_id,status,created_at,reviewed_at) VALUES (?,?,?,?,?,'pending',?,NULL)",(item.id,user["uid"],item.title,item.description,item.agent_id,now()))
        except sqlite3.IntegrityError:
            raise HTTPException(409,"Approval ID already exists")
    return {**item.model_dump(),"status":"pending"}

@app.patch("/api/approvals/{approval_id}")
def review_approval(approval_id: str, decision: str, user=Depends(require_firebase_user)):
    if decision not in {"approved","rejected"}:
        raise HTTPException(422,"Decision must be approved or rejected")
    with db() as conn:
        result=conn.execute("UPDATE approvals SET status=?,reviewed_at=? WHERE id=? AND owner_uid=? AND status='pending'",(decision,now(),approval_id,user["uid"]))
        if result.rowcount==0:
            raise HTTPException(404,"Pending approval not found")
        return dict(conn.execute("SELECT id,title,description,agent_id,status,created_at,reviewed_at FROM approvals WHERE id=? AND owner_uid=?",(approval_id,user["uid"])).fetchone())

@app.get("/api/capabilities")
def capabilities():
    return {
        "workspace_mode": "single-user-browser-local",
        "cloud_api_enabled": False,
        "accounts_required": False,
        "persistent_storage": "browser localStorage",
        "local_backup_restore": True,
        "live_model_execution": False,
        "background_workers": False,
        "web_research": False,
        "notice": "This release runs without accounts or cloud workspace storage. Agents, departments, tasks, approvals, workflows, and memory notes remain in this browser profile. Use the built-in JSON backup to move or protect your data."
    }


# Memory and agent-to-agent coordination foundations.
# Production MUST add authentication and derive workspace_id from the authenticated identity.
class MemoryIn(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    workspace_id: str = Field(min_length=1, max_length=120)
    title: str = Field(default="Memory", max_length=160)
    content: str = Field(min_length=1, max_length=12000)
    tags: str = Field(default="", max_length=1000)

class AgentMessageIn(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    workspace_id: str = Field(min_length=1, max_length=120)
    from_agent_id: Optional[str] = None
    to_agent_id: Optional[str] = None
    task_id: Optional[str] = None
    message: str = Field(min_length=1, max_length=12000)
    message_type: str = Field(default="handoff", pattern="^(handoff|result|question|status|review)$")

class BrainPlanIn(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=120)
    request: str = Field(min_length=1, max_length=5000)

@app.post("/api/memory", status_code=201)
def save_memory(item: MemoryIn, user=Depends(require_firebase_user)):
    stamp = now()
    owner_uid = user["uid"]
    with db() as conn:
        conn.execute("INSERT INTO memories VALUES (?,?,?,?,?,?,?)",
                     (item.id, owner_uid, item.title, item.content, item.tags, stamp, stamp))
    return {**item.model_dump(), "workspace_id": owner_uid, "created_at": stamp, "updated_at": stamp}

@app.get("/api/memory")
def search_memory(workspace_id: Optional[str] = None, q: str = "", limit: int = 50, offset: int = 0, user=Depends(require_firebase_user)):
    # Ignore caller-supplied workspace IDs; identity comes only from the verified token.
    workspace_id = user["uid"]
    limit, offset = max(1, min(limit, 200)), max(0, offset)
    with db() as conn:
        rows = conn.execute(
            """SELECT * FROM memories WHERE workspace_id=? AND
               (?='' OR title LIKE ? OR content LIKE ? OR tags LIKE ?)
               ORDER BY updated_at DESC LIMIT ? OFFSET ?""",
            (workspace_id, q, f"%{q}%", f"%{q}%", f"%{q}%", limit, offset)).fetchall()
        return [dict(r) for r in rows]

@app.delete("/api/memory/{memory_id}")
def delete_memory(memory_id: str, workspace_id: Optional[str] = None, user=Depends(require_firebase_user)):
    workspace_id = user["uid"]
    with db() as conn:
        result = conn.execute("DELETE FROM memories WHERE id=? AND workspace_id=?", (memory_id, workspace_id))
        if result.rowcount == 0:
            raise HTTPException(404, "Memory not found")
    return {"deleted": True, "id": memory_id}

@app.post("/api/agent-messages", status_code=201)
def send_agent_message(item: AgentMessageIn, user=Depends(require_firebase_user)):
    stamp = now()
    owner_uid = user["uid"]
    with db() as conn:
        conn.execute("INSERT INTO agent_messages VALUES (?,?,?,?,?,?,?,?)",
                     (item.id, owner_uid, item.from_agent_id, item.to_agent_id, item.task_id, item.message, item.message_type, stamp))
    return {**item.model_dump(), "workspace_id": owner_uid, "created_at": stamp}

@app.get("/api/agent-messages")
def list_agent_messages(workspace_id: Optional[str] = None, task_id: Optional[str] = None, limit: int = 100, user=Depends(require_firebase_user)):
    workspace_id = user["uid"]
    limit = max(1, min(limit, 500))
    with db() as conn:
        rows = conn.execute(
            """SELECT * FROM agent_messages WHERE workspace_id=? AND (? IS NULL OR task_id=?)
               ORDER BY created_at DESC LIMIT ?""",
            (workspace_id, task_id, task_id, limit)).fetchall()
        return [dict(r) for r in rows]

@app.post("/api/brain/plan")
def create_brain_plan(item: BrainPlanIn, user=Depends(require_firebase_user)):
    """Deterministic starter planner; model-powered planning is a later integration."""
    request = item.request.lower()
    catalog = [
        {"name":"Personal Memory Assistant","role":"Personal organization and memory support","department":"Personal Assistance","keywords":["remember","memory","forget","deadline","routine"],"instructions":"Help the user remember commitments and break requests into small steps."},
        {"name":"Appointment Coordinator","role":"Appointment and schedule organizer","department":"Administration","keywords":["appointment","calendar","schedule","doctor","meeting"],"instructions":"Organize appointment details and prepare reminder drafts for approval."},
        {"name":"Document Organizer","role":"Paperwork and document assistant","department":"Administration","keywords":["paperwork","document","form","records","letter"],"instructions":"Organize documents and explain forms in plain language. Never sign or submit."},
        {"name":"Research Specialist","role":"Research and source verification","department":"Research","keywords":["research","investigate","compare","verify","sources"],"instructions":"Prepare research plans and distinguish verified facts from uncertainty."},
        {"name":"Marketing Strategist","role":"Marketing and content planning","department":"Marketing","keywords":["marketing","campaign","advertising","social","content"],"instructions":"Prepare campaign plans and drafts. Require approval before publishing or spending."},
        {"name":"Technology Builder","role":"Software and technical project assistant","department":"Technology","keywords":["website","software","code","app","technical"],"instructions":"Break technical work into implementation steps and prepare changes for review."},
        {"name":"Communication Assistant","role":"Writing and communication support","department":"Personal Assistance","keywords":["email","write","message","letter","reply"],"instructions":"Draft communications and ask before sending."},
        {"name":"Accessibility Support Agent","role":"Task simplification and accessible workflows","department":"Personal Assistance","keywords":["disability","accessible","overwhelmed","simple","focus"],"instructions":"Reduce cognitive load and offer one clear next step at a time."}
    ]
    selected = [x for x in catalog if any(k in request for k in x["keywords"])] or [catalog[0], catalog[3]]
    with db() as conn:
        existing = [dict(r) for r in conn.execute("SELECT id,name,role FROM agents WHERE owner_uid=?", (user["uid"],))]
    output = []
    for suggestion in selected:
        match = next((a for a in existing if a["name"].casefold()==suggestion["name"].casefold() or a["role"].casefold()==suggestion["role"].casefold()), None)
        output.append({**suggestion, "existing_agent": match})
    return {"workspace_id": user["uid"], "suggestions": output, "planner": "deterministic-starter",
            "note": "This planner suggests agent templates; it does not run AI models or execute agent work."}


class AIRequest(BaseModel):
    model: Optional[str] = None
    system: str = Field(default="You are a careful, accessible assistant. Use plain language, be honest about uncertainty, and never claim to have performed actions you did not perform.", max_length=6000)
    message: str = Field(min_length=1, max_length=20000)
    temperature: float = Field(default=0.3, ge=0, le=1.5)

@app.post("/api/ai/respond")
def ai_respond(item: AIRequest, user=Depends(require_firebase_user)):
    """OpenAI-compatible server-side model gateway. Provider keys remain in server env."""
    import json
    import urllib.request
    import urllib.error

    api_key = os.getenv("AI_API_KEY")
    if not api_key:
        raise HTTPException(503, "AI provider is not configured. Add AI_API_KEY in the backend hosting environment.")
    base_url = os.getenv("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = item.model or os.getenv("AI_MODEL", "gpt-4.1-mini")
    payload = json.dumps({
        "model": model,
        "temperature": item.temperature,
        "messages": [
            {"role": "system", "content": item.system},
            {"role": "user", "content": item.message}
        ]
    }).encode("utf-8")
    req = urllib.request.Request(
        base_url + "/chat/completions",
        data=payload,
        headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            result = json.loads(response.read().decode("utf-8"))
        answer = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"model": model, "provider_endpoint": base_url, "answer": answer}
    except urllib.error.HTTPError as exc:
        # Never return provider request headers or API credentials to the client.
        detail = exc.read().decode("utf-8", errors="replace")[:1200]
        raise HTTPException(502, "AI provider returned an error: " + detail)
    except Exception:
        raise HTTPException(502, "Could not reach the configured AI provider.")

@app.get("/api/ai/status")
def ai_status(user=Depends(require_firebase_user)):
    return {
        "configured": bool(os.getenv("AI_API_KEY")),
        "provider_endpoint": os.getenv("AI_BASE_URL", "https://api.openai.com/v1"),
        "model": os.getenv("AI_MODEL", "gpt-4.1-mini"),
        "note": "The API key is stored server-side and is never returned."
    }


# Authenticated AI job queue. Model output is text only; no external tools/actions are exposed.
class AgentJobIn(BaseModel):
    id: str = Field(min_length=8, max_length=100)
    agent_id: Optional[str] = Field(default=None, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    instructions: str = Field(min_length=1, max_length=12000)

@app.post("/api/jobs", status_code=202)
def enqueue_agent_job(item: AgentJobIn, user=Depends(require_firebase_user)):
    stamp = now()
    with db() as conn:
        conn.execute(
            "INSERT INTO agent_jobs (id,owner_uid,agent_id,title,instructions,status,created_at,updated_at) VALUES (?,?,?,?,?,'queued',?,?)",
            (item.id, user["uid"], item.agent_id, item.title, item.instructions, stamp, stamp))
    return {"id": item.id, "status": "queued", "created_at": stamp}

@app.get("/api/jobs")
def list_agent_jobs(limit: int = 50, user=Depends(require_firebase_user)):
    limit = max(1, min(limit, 200))
    with db() as conn:
        rows = conn.execute(
            "SELECT id,agent_id,title,status,result,error,attempts,created_at,updated_at,started_at,completed_at FROM agent_jobs WHERE owner_uid=? ORDER BY created_at DESC LIMIT ?",
            (user["uid"], limit)).fetchall()
    return [dict(row) for row in rows]

@app.get("/api/jobs/{job_id}")
def get_agent_job(job_id: str, user=Depends(require_firebase_user)):
    """Return one job only when it belongs to the signed-in user."""
    with db() as conn:
        row = conn.execute(
            "SELECT id,agent_id,title,instructions,status,result,error,attempts,created_at,updated_at,started_at,completed_at FROM agent_jobs WHERE id=? AND owner_uid=?",
            (job_id, user["uid"])
        ).fetchone()
    if not row:
        raise HTTPException(404, "Job not found")
    return dict(row)


@app.post("/api/jobs/{job_id}/cancel")
def cancel_agent_job(job_id: str, user=Depends(require_firebase_user)):
    """Cancel a queued job. A running job cannot be force-stopped by this endpoint."""
    stamp = now()
    with db() as conn:
        result = conn.execute(
            "UPDATE agent_jobs SET status='cancelled', updated_at=?, completed_at=? WHERE id=? AND owner_uid=? AND status='queued'",
            (stamp, stamp, job_id, user["uid"])
        )
        if result.rowcount == 0:
            exists = conn.execute(
                "SELECT status FROM agent_jobs WHERE id=? AND owner_uid=?", (job_id, user["uid"])
            ).fetchone()
            if not exists:
                raise HTTPException(404, "Job not found")
            raise HTTPException(409, "Only queued jobs can be cancelled")
    return {"id": job_id, "status": "cancelled"}


@app.post("/api/jobs/{job_id}/retry", status_code=202)
def retry_agent_job(job_id: str, user=Depends(require_firebase_user)):
    """Requeue a failed job while preserving its attempt limit."""
    stamp = now()
    with db() as conn:
        result = conn.execute(
            """UPDATE agent_jobs SET status='queued', error='', result='', updated_at=?,
               started_at=NULL, completed_at=NULL
               WHERE id=? AND owner_uid=? AND status='failed' AND attempts < 3""",
            (stamp, job_id, user["uid"])
        )
        if result.rowcount == 0:
            row = conn.execute(
                "SELECT status,attempts FROM agent_jobs WHERE id=? AND owner_uid=?",
                (job_id, user["uid"])
            ).fetchone()
            if not row:
                raise HTTPException(404, "Job not found")
            if row["status"] != "failed":
                raise HTTPException(409, "Only failed jobs can be retried")
            raise HTTPException(409, "This job has reached its retry limit")
    return {"id": job_id, "status": "queued", "retried_at": stamp}


@app.post("/api/worker/claim")
def claim_agent_job(_worker=Depends(require_worker_token)):
    stamp = now()
    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM agent_jobs WHERE status='queued' AND attempts < 3 ORDER BY created_at LIMIT 1").fetchone()
        if not row:
            return {"job": None}
        conn.execute("UPDATE agent_jobs SET status='running', attempts=attempts+1, started_at=?, updated_at=? WHERE id=? AND status='queued'",
                     (stamp, stamp, row["id"]))
        claimed = conn.execute("SELECT * FROM agent_jobs WHERE id=?", (row["id"],)).fetchone()
    return {"job": dict(claimed)}

class AgentJobCompletion(BaseModel):
    id: str = Field(min_length=8, max_length=100)
    result: str = Field(default="", max_length=30000)
    error: str = Field(default="", max_length=3000)

@app.post("/api/worker/complete")
def complete_agent_job(item: AgentJobCompletion, _worker=Depends(require_worker_token)):
    stamp = now()
    status = "failed" if item.error else "completed"
    with db() as conn:
        result = conn.execute("UPDATE agent_jobs SET status=?, result=?, error=?, updated_at=?, completed_at=? WHERE id=? AND status='running'",
                              (status, item.result, item.error, stamp, stamp, item.id))
        if result.rowcount == 0:
            raise HTTPException(404, "Active job not found")
    return {"id": item.id, "status": status}

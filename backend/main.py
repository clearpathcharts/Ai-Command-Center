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

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("DATABASE_PATH", str(APP_DIR / "workspace.db")))

app = FastAPI(title="Accessible AI Command Center API", version="0.1.0")
allowed_origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

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
          id TEXT PRIMARY KEY, name TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, department_id TEXT,
          instructions TEXT NOT NULL DEFAULT '', permission_level TEXT NOT NULL DEFAULT 'approval',
          created_at TEXT NOT NULL, FOREIGN KEY(department_id) REFERENCES departments(id)
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
          agent_id TEXT, priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'todo',
          created_at TEXT NOT NULL, FOREIGN KEY(agent_id) REFERENCES agents(id)
        );
        CREATE TABLE IF NOT EXISTS memories (\n          id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'Memory',\n          content TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL\n        );\n        CREATE TABLE IF NOT EXISTS agent_messages (\n          id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, from_agent_id TEXT, to_agent_id TEXT,\n          task_id TEXT, message TEXT NOT NULL, message_type TEXT NOT NULL DEFAULT 'handoff',\n          created_at TEXT NOT NULL\n        );\n        CREATE TABLE IF NOT EXISTS approvals (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
          agent_id TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL,
          reviewed_at TEXT, FOREIGN KEY(agent_id) REFERENCES agents(id)
        );
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
def list_departments():
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM departments ORDER BY created_at")]

@app.post("/api/departments", status_code=201)
def create_department(item: DepartmentIn):
    with db() as conn:
        try:
            conn.execute("INSERT INTO departments VALUES (?,?,?,?)", (item.id, item.name, item.purpose, now()))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Department ID already exists")
    return item.model_dump()

@app.get("/api/agents")
def list_agents():
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM agents ORDER BY created_at")]

@app.post("/api/agents", status_code=201)
def create_agent(item: AgentIn):
    with db() as conn:
        try:
            conn.execute(
                "INSERT INTO agents VALUES (?,?,?,?,?,?,?)",
                (item.id, item.name, item.role, item.department_id, item.instructions, item.permission_level, now()),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Agent ID already exists or department is invalid")
    return item.model_dump()

@app.get("/api/tasks")
def list_tasks():
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM tasks ORDER BY created_at DESC")]

@app.post("/api/tasks", status_code=201)
def create_task(item: TaskIn):
    with db() as conn:
        try:
            conn.execute(
                "INSERT INTO tasks VALUES (?,?,?,?,?,?,?)",
                (item.id, item.title, item.details, item.agent_id, item.priority, "todo", now()),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Task ID already exists or assigned agent is invalid")
    return {**item.model_dump(), "status": "todo"}

@app.patch("/api/tasks/{task_id}")
def update_task(task_id: str, item: TaskStatusIn):
    with db() as conn:
        result = conn.execute("UPDATE tasks SET status=? WHERE id=?", (item.status, task_id))
        if result.rowcount == 0:
            raise HTTPException(404, "Task not found")
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        return dict(row)

@app.get("/api/approvals")
def list_approvals():
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM approvals ORDER BY created_at DESC")]

@app.post("/api/approvals", status_code=201)
def create_approval(item: ApprovalIn):
    with db() as conn:
        try:
            conn.execute(
                "INSERT INTO approvals VALUES (?,?,?,?,?,?,?)",
                (item.id, item.title, item.description, item.agent_id, "pending", now(), None),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Approval ID already exists or assigned agent is invalid")
    return {**item.model_dump(), "status": "pending"}

@app.patch("/api/approvals/{approval_id}")
def review_approval(approval_id: str, decision: str):
    if decision not in {"approved", "rejected"}:
        raise HTTPException(422, "Decision must be approved or rejected")
    with db() as conn:
        result = conn.execute(
            "UPDATE approvals SET status=?, reviewed_at=? WHERE id=? AND status='pending'",
            (decision, now(), approval_id),
        )
        if result.rowcount == 0:
            raise HTTPException(404, "Pending approval not found")
        return dict(conn.execute("SELECT * FROM approvals WHERE id=?", (approval_id,)).fetchone())

@app.get("/api/capabilities")
def capabilities():
    return {
        "workspace_crud": True,
        "persistent_storage": "sqlite",
        "live_model_execution": False,
        "persistent_memory_api": True,
        "agent_message_handoff_api": True,
        "agent_planner": "deterministic starter only",
        "web_research": False,
        "background_workers": False,
        "authentication": False,
        "notice": "Do not expose this API publicly until authentication, per-user authorization, and production database storage are configured."
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
def save_memory(item: MemoryIn):
    stamp = now()
    with db() as conn:
        conn.execute("INSERT INTO memories VALUES (?,?,?,?,?,?,?)",
                     (item.id, item.workspace_id, item.title, item.content, item.tags, stamp, stamp))
    return {**item.model_dump(), "created_at": stamp, "updated_at": stamp}

@app.get("/api/memory")
def search_memory(workspace_id: str, q: str = "", limit: int = 50, offset: int = 0):
    limit, offset = max(1, min(limit, 200)), max(0, offset)
    with db() as conn:
        rows = conn.execute(
            """SELECT * FROM memories WHERE workspace_id=? AND
               (?='' OR title LIKE ? OR content LIKE ? OR tags LIKE ?)
               ORDER BY updated_at DESC LIMIT ? OFFSET ?""",
            (workspace_id, q, f"%{q}%", f"%{q}%", f"%{q}%", limit, offset)).fetchall()
        return [dict(r) for r in rows]

@app.delete("/api/memory/{memory_id}")
def delete_memory(memory_id: str, workspace_id: str):
    with db() as conn:
        result = conn.execute("DELETE FROM memories WHERE id=? AND workspace_id=?", (memory_id, workspace_id))
        if result.rowcount == 0:
            raise HTTPException(404, "Memory not found")
    return {"deleted": True, "id": memory_id}

@app.post("/api/agent-messages", status_code=201)
def send_agent_message(item: AgentMessageIn):
    stamp = now()
    with db() as conn:
        conn.execute("INSERT INTO agent_messages VALUES (?,?,?,?,?,?,?,?)",
                     (item.id, item.workspace_id, item.from_agent_id, item.to_agent_id, item.task_id, item.message, item.message_type, stamp))
    return {**item.model_dump(), "created_at": stamp}

@app.get("/api/agent-messages")
def list_agent_messages(workspace_id: str, task_id: Optional[str] = None, limit: int = 100):
    limit = max(1, min(limit, 500))
    with db() as conn:
        rows = conn.execute(
            """SELECT * FROM agent_messages WHERE workspace_id=? AND (? IS NULL OR task_id=?)
               ORDER BY created_at DESC LIMIT ?""",
            (workspace_id, task_id, task_id, limit)).fetchall()
        return [dict(r) for r in rows]

@app.post("/api/brain/plan")
def create_brain_plan(item: BrainPlanIn):
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
        existing = [dict(r) for r in conn.execute("SELECT id,name,role FROM agents")]
    output = []
    for suggestion in selected:
        match = next((a for a in existing if a["name"].casefold()==suggestion["name"].casefold() or a["role"].casefold()==suggestion["role"].casefold()), None)
        output.append({**suggestion, "existing_agent": match})
    return {"workspace_id": item.workspace_id, "suggestions": output, "planner": "deterministic-starter",
            "note": "This planner suggests agent templates; it does not run AI models or execute agent work."}

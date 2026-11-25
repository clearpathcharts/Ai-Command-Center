# Accessible AI Command Center

An accessibility-first AI workforce platform. Create AI agents, assign jobs, organize departments, and coordinate work while keeping the human user in control.

## Product modules
- **Agent Factory:** create, configure, clone, and manage agents from reusable templates.
- **Quantum Core:** coordinate tasks, department workflows, agent handoffs, and shared project context.
- **Intelligence Engine:** research, source verification, classification, risk signals, and reporting.
- **Accessible Workspace:** plain-language controls, keyboard navigation, reduced cognitive load, adjustable display settings, and a focused Rescue Mode.

## Current release
This repository begins with a working browser-based frontend foundation. It supports agent creation, department assignment, task creation, task status changes, approvals, accessible display preferences, and local demo persistence.

**Important:** the first release is a frontend prototype. Live AI execution, multi-user persistence, speech services, and background workers require separately configured backend services and credentials. No API secrets belong in browser code or Git.

## Run
Open `index.html` in a browser or serve the folder with a static HTTP server.

## Planned architecture
- Frontend: accessible React/TypeScript application.
- API and orchestration: Python/FastAPI service.
- Durable execution: managed task queue and worker service.
- Data: authenticated database with per-user access controls.
- AI: server-side, provider-independent model gateway.

## Safety
Agents may prepare research, drafts, and recommendations within granted permissions. Sending messages, spending money, publishing, deleting data, changing accounts, signing documents, or other consequential actions require explicit user approval.

## Development principles
- Accessibility is a core requirement, not an add-on.
- Users control agent permissions, memory, and autonomy.
- Show task status, ownership, outputs, and approval requirements.
- Keep provider integrations replaceable.
- Use least-privilege access and auditable actions.

## Team Workflow Builder (current milestone)

The frontend includes a template-based workflow planner for general projects, research, business planning, marketing, and software projects. It turns an objective into reviewable task steps and assigns them to matching department agents where possible. Progress is derived from task status.

This is a deterministic planning scaffold, not autonomous AI execution. No agent model calls or external actions are made. Human review remains required. Workflow data currently lives in browser local storage; multi-user persistence and authenticated orchestration remain future work.


## Memory, scale, and agent coordination

The Agent Creator Brain provides searchable local agent discovery, duplicate checks for starter templates, and user-written memory notes. The backend includes memory CRUD, agent-to-agent message handoff records, a starter team planner, a provider-independent OpenAI-compatible model gateway, and paginated agent listing.

### Scale strategy

There is no artificial product rule limiting a user to 1, 10, or 100 agents. The architecture is designed for a large agent catalog, including thousands of saved agent definitions. "Unlimited" is not literal: practical limits depend on database capacity, storage, model-provider quotas, worker concurrency, and cost. Saved agents should be inexpensive dormant definitions; only assigned work should consume execution resources. Production scale requires a durable managed database, queue-backed workers, pagination, rate limits, quotas, and monitoring.

### AI provider configuration

Set these variables in the backend hosting environment, never in frontend JavaScript:

- AI_API_KEY — provider API key
- AI_BASE_URL — optional OpenAI-compatible API base URL (for xAI use https://api.x.ai/v1)
- AI_MODEL — model name supported by that provider

The key remains server-side. GET /api/ai/status reports whether a key is configured without revealing it. POST /api/ai/respond sends a single chat request.

### Firebase authentication readiness

backend/auth.py contains a Firebase ID-token verification helper. It must be applied to every user-data route and every database query must be scoped to the verified Firebase UID before this service is exposed to real users. This repository is not yet production-secure for multi-user private data. The current browser prototype stores its demo data locally on the device.

### Current limitations

- The browser Agent Creator Brain uses a deterministic starter catalog, not a connected LLM planner yet.
- Agent message endpoints store handoff messages; autonomous workers that execute and respond are not yet deployed.
- Browser speech input/output depends on device and browser support.
- SQLite is suitable for local development, not horizontally scaled production storage. Use managed PostgreSQL for production.

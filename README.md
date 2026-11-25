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


## AI execution queue (new)

The backend now includes an authenticated job queue:

- `POST /api/jobs` accepts a job only when a valid Firebase ID token is supplied.
- `GET /api/jobs` returns only jobs owned by the signed-in Firebase UID.
- `POST /api/worker/claim` and `POST /api/worker/complete` require the separate `WORKER_SHARED_SECRET`.
- `backend/worker.py` is a separate polling worker. It sends job instructions to the configured OpenAI-compatible model endpoint and stores a text result for review.
- The worker is deliberately text-only. It has no browser, shell, email, payment, publishing, or other action tools.

### Required server environment

Backend:
- `AI_API_KEY`
- `AI_BASE_URL` (optional; default OpenAI-compatible endpoint)
- `AI_MODEL`
- `WORKER_SHARED_SECRET` (long random secret)
- Firebase Admin credentials through `GOOGLE_APPLICATION_CREDENTIALS` or hosting-platform Application Default Credentials
- `DATABASE_PATH` only for local SQLite development

Separate worker process:
- `COMMAND_CENTER_API_URL`
- `WORKER_SHARED_SECRET` (same secret as backend)
- `AI_API_KEY`
- `AI_BASE_URL`
- `AI_MODEL`

### Production deployment warning

This repository still uses SQLite by default. A separate worker and API instance must share a durable database; do not deploy the SQLite queue across separate ephemeral containers and expect reliable coordination. Move the queue and workspace data to managed PostgreSQL before production multi-instance use. The frontend does not yet include Firebase sign-in/token wiring for submitting jobs, and legacy workspace CRUD endpoints are not all user-authenticated. Do not expose private workspace data publicly until those routes are secured.


## Workspace backup and restore

The browser workspace now supports portable JSON backups. Open **Accessibility & Settings → Data on this device** to download a backup or restore one. A backup contains agents, departments, tasks, approvals, workflows, and display preferences. Restore validates the file and asks before replacing the current browser workspace. Keep backups in a private, secure location: they may contain sensitive notes or business information.

Browser storage is still device-local. A downloaded backup is the user's recovery copy; it is not cloud synchronization. Do not treat a successful browser save as proof that data has been synced to a server.


## Job queue controls and verification

The authenticated job API now supports:
- Read one job by ID, restricted to its Firebase owner.
- Cancel a job only while it is still queued.
- Retry a failed job while it remains under the three-attempt limit.
- Read job status, result, error, and timestamps for the signed-in owner.

The backend test suite covers job creation, worker claim/completion, queued cancellation, failed-job retry, and cross-user read isolation. GitHub Actions runs these tests on pushes and pull requests.

A running job is not force-terminated by the cancel endpoint. The worker must finish or fail it. Production still requires a durable shared database, authenticated frontend integration, and security review of the older workspace endpoints before real customer data is stored.

## API security gate (current)

The API now fails closed on legacy workspace and model-gateway routes that do not yet enforce per-user ownership. Requests to those routes return HTTP 503 with `WORKSPACE_API_SECURITY_LOCK`. This is intentional: the earlier shared SQLite tables are not safe for multiple users until every record and relationship is scoped to the authenticated Firebase UID.

The health and capability endpoints remain available. The job queue remains Firebase-authenticated, and worker claim/completion endpoints remain protected by the worker shared secret. The frontend's browser-local workspace still works independently of these backend routes.

The backend dependency manifest has also been normalized so each Python package is on its own line. Automated tests now verify that unscoped endpoints stay locked while the secure job queue remains available.

**Not production complete yet:** the next backend milestone is a full owner-UID migration for departments, agents, tasks, approvals, memories, messages, and AI requests, followed by authenticated frontend sign-in and remote queue controls.

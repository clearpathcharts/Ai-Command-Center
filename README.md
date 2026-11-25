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
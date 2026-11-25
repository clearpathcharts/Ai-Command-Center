# AI Command Center

A personal, accessibility-first AI workforce workspace. The current release is designed for one person using one browser profile on one device.

## Product direction: personal and local-first

- **No accounts.** There is no sign-up, sign-in, Firebase, or user identity system.
- **No shared workspace.** Other visitors do not get access to your agents, projects, or notes.
- **Browser-local data.** Agents, departments, tasks, approvals, workflows, settings, and memory notes are stored in this browser profile using localStorage.
- **Portable backups.** Use Accessibility & Settings → Data on this device to download a JSON backup or restore one. Keep backup files private.
- **No cloud API in this release.** Backend workspace, AI, memory, job-queue, and worker endpoints return HTTP 503 with `LOCAL_ONLY_MODE`. This is intentional, not an app failure.

## Run

Open `index.html` in a modern browser, or serve the repository folder with any static HTTP server. No backend, account, API key, or external identity provider is required for the browser workspace.

## What works in the browser release

- Create, edit, search, and organize AI agent profiles.
- Organize agents into departments.
- Create tasks and workflows, assign agents, and track progress.
- Review approval requests and retain human control over consequential actions.
- Use Executive Brain planning scaffolds and the Agent Creator Brain.
- Use accessibility preferences, including simplified presentation and focus-oriented controls.
- Save the workspace in browser storage and export/import JSON backups.

The planning and workflow features organize work; they do not imply that autonomous AI execution, live web research, or external actions are running.

## Data and privacy boundaries

Browser storage belongs to the current browser profile on the current device. It is not automatically synchronized to another phone or computer. Clearing browser site data, using a different browser profile, or uninstalling/resetting the browser may remove local workspace data. Export backups regularly and store them somewhere secure.

This local-first model avoids a cloud account system, but it does not encrypt browser localStorage. Anyone with access to the unlocked browser profile or device may be able to access the workspace. Use device-level security and do not store passwords, API keys, or highly sensitive secrets in workspace notes.

## Backend safety lock

The Python backend remains in the repository as a disabled development scaffold. All `/api/*` routes other than `/api/capabilities` are blocked with `LOCAL_ONLY_MODE`. Firebase Admin has been removed from the backend dependencies. The separate worker is not part of the active product and cannot claim or complete jobs while the API is locked.

A future AI execution feature must be designed to preserve the single-user requirement—for example, by running a local service on the user's own machine with local-only network binding and server-side secret storage. Do not expose a no-login cloud API containing private workspace data.

## Safety principles

- The user remains in control.
- Drafts and recommendations must be distinguishable from completed external actions.
- Sending, publishing, purchasing, deleting, signing, or changing accounts must require explicit human approval.
- The application must clearly show what is stored locally and what, if anything, leaves the device.

## Development checks

GitHub Actions checks frontend JavaScript syntax, Python syntax, and backend tests. The backend tests verify that the personal local-only boundary stays closed.


## Use-case catalog and agent coordination direction

The backend now maintains a curated, searchable use-case catalog with entries for personal organization, memory support, accessibility, research, business planning, finance, markets and trading, software development, data analysis, marketing, sales, operations, project management, administration, education, health administration, recruiting, creative work, defensive security, travel, home management, communications, translation, QA, procurement, and nonprofit work.

Catalog endpoints:
- `GET /api/catalog?q=...` searches use cases, categories, agent roles, and workflow examples.
- `GET /api/catalog/categories` lists category totals and aggregate selection counts.
- `POST /api/catalog/usage` records a catalog entry selection by slug only.

The usage index stores only a counter and last-used timestamp per catalog entry. It does not accept or store prompts, names, account identifiers, IP addresses, or private workspace content. The catalog is shared reference metadata; it is not a shared user workspace.

### Agent-to-agent communication (#2)

The product direction is structured agent-to-agent messages: handoff, question, status, result, and review. The existing private message/job endpoints remain disabled in the no-account release because a public server cannot safely determine which visitor owns a private message. The catalog is public and searchable; private handoff messages must remain in the user's local workspace until a private local runtime or an explicit secure identity boundary is implemented. No private messages are sent to the catalog.

# ClearPath AI Command Center

A **free** AI workforce workspace built for people with disabilities — and usable by anyone.
The software adapts to the person, not the other way around.

- **No accounts. No login. No Firebase.** Nobody is ever asked for their name.
- **Unlimited AI agents.** Make one agent or thousands. Organize them into departments with managers.
- **Built for memory challenges.** The app warns you before you make an agent you already have, keeps a searchable memory, and gives a "What was I doing?" recap.
- **Mandatory safety catalog.** Everything typed is recorded and screened. People are told this on their first visit. Urgent language shows crisis help (988) right away.

## What is inside

| Area | What it does |
|---|---|
| **Rescue Mode** (pink "I'm overwhelmed" button, every page) | Hides everything else, explains what is going on in plain words, shows ONE next step, can make that step smaller, reads it out loud, or hands the rest of the task to an agent. |
| **Focus Mode** | Shows only the current task and its small steps. |
| **Agent Creator Brain** | Suggests specialist agents from everyday words, skips ones you already have, and creates 1–5,000 agents at a time (no total limit). |
| **Executive Brain** | One goal (e.g. "Help me start a small business") becomes a team plan. Missing specialists are created automatically. Every task is broken into small steps. |
| **Team Workflows** | Plans with progress bars. "Run step by step" walks through the plan one step at a time. |
| **Approval Center** | Any task that would send, pay, publish, book, sign, or delete stops here until you say yes. |
| **Intelligence Engine** | Research links, website address checker, scam & fraud warning-sign checker, document reader (deadlines, dates, money, phone numbers), list sorter, workspace report, scheduled check-ins. |
| **Social Media Studio** | Write posts per platform with character limits, plan dates, get approval. The app never posts for you. |
| **Knowledge Base** | Your own how-to library. Its search box searches the whole workspace. |
| **Accessibility settings** | Text size, spacing, color style (ClearPath signature, Calm, Light), high contrast, reduce motion, Simple Mode, read-aloud speed, voice typing everywhere. |
| **Safety Catalog** | Every request screened as Lower concern / Needs review / Urgent. Users cannot delete entries. |

**Honest note:** no AI model is connected yet. Agents organize, assign, and track the work and walk the person through it. They do not secretly do work by themselves, and the app never says they did.

## Where data is kept

- Each person's agents, tasks, and notes are saved **in their own browser on their own device**, for free. Settings → "Download workspace backup" makes a copy.
- Safety catalog entries are kept on the device **and**, once you turn it on (below), sent to your private Safety Review page with a random device number — never a name.

## Turning on your private Safety Review page

You need the `backend` folder running on a server you control.

**Step 1.** On the server, set these two settings (see `backend/.env.example`):
- `SAFETY_ADMIN_TOKEN` = a long secret key that only you know (16+ characters).
- `CORS_ORIGINS` = the web address of your site, for example `https://yoursite.com`.

**Step 2.** Open the file `config.js`. Find this line:

```js
  safetyReportUrl: ""
```

Replace it with your server address, ending in `/api/safety/report`:

```js
  safetyReportUrl: "https://your-server-address/api/safety/report"
```

Save the file.

**Step 3.** Open `admin.html` on your site. Type your server address and your secret key. Press "Show reports".

Until Step 2 is done, the Safety Catalog page in the app says "Central reporting is OFF" and entries stay on each device.

## Checks

GitHub runs these on every change:

- JavaScript and Python syntax checks.
- Backend tests (`backend/tests`), including the safety endpoints: no login needed to report, admin key required to read.
- `tests/ui-smoke.js` — opens the app in a real browser and clicks through every feature above (including creating 5,000 agents), and fails on any error.

## Safety principles

- The person stays in control. Nothing is sent, paid, published, signed, or deleted without their yes.
- Warning signs are not proof. Screening results say so.
- People are told plainly that what they type is recorded for safety. No secret monitoring.
- Do not type passwords, bank numbers, or Social Security numbers into the app.

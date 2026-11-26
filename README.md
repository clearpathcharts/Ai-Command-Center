# Clear Path Markets Science — AI Command Center

A **free** AI workforce workspace built for people with disabilities — and usable by anyone.
The software adapts to the person, not the other way around.

- **No accounts. No login. No Firebase.** Nobody is ever asked for their name.
- **Unlimited AI agents.** Make one agent or thousands. Organize them into departments with managers.
- **Built for memory challenges.** The app warns you before you make an agent you already have, keeps a searchable memory, and gives a "What was I doing?" recap.
- **Mandatory safety catalog.** Everything typed is recorded and screened. People are told this on their first visit. Urgent language shows crisis help (988) right away.

## Where the files are

- `backend/web/` — the website pages (open `backend/web/index.html` in a browser to try it on one device).
- `backend/` — the server. It also hands out the website, so the whole platform lives at one address.

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
| **Build Your Own App** | 10 lessons from the first line of code to pushing to GitHub, with copy buttons and read-aloud. Project starter files to download, and an agent that can write the app code (when AI is connected). |
| **AI Money & Models** | 6 lessons for making your own AI model by fine-tuning a free open model, a Training File Maker that downloads a ready .jsonl file, and 7 real ways to earn with AI — each can become a team workflow in one click. |
| **Safety Catalog** (owner only) | Every request and creation screened as Lower concern / Needs review / Urgent. Hidden from users; opens only when the server accepts the owner code. Users cannot delete entries. |

**AI agents:** press "🤖 Agent: do this" on any task and the assigned agent writes a draft using AI. The server connects to **Groq** first (free plan, reported not to train on free-plan data), then **Google Gemini**, **OpenRouter** free models, and **xAI Grok** as backups. Keys stay on the server. Agents only write drafts — they never send, pay, post, sign, or delete. Crisis language is never sent to an AI company; the person gets 988/911 help instead. Every AI request is recorded in the safety catalog.

## Where data is kept

- Each person's agents, tasks, and notes are saved **in their own browser on their own device**, for free. Settings → "Download workspace backup" makes a copy.
- Safety catalog entries are kept on the device **and**, once you turn it on (below), sent to your private Safety Review page with a random device number — never a name.

## Turning on your private Safety Review page

You need the `backend` folder running on a server you control.

**Step 1.** On the server, set these settings (see `backend/.env.example`):
- `SAFETY_ADMIN_PIN` = your private owner code (6+ digits). It is only ever stored on the server. After 5 wrong tries, the code locks for 15 minutes.
- Optional: `SAFETY_ADMIN_TOKEN` = a longer secret key (16+ characters) that also works.
- `CORS_ORIGINS` = the web address of your site, for example `https://yoursite.com`.

**Step 2.** Open the file `config.js`. Find this line:

```js
  serverAddress: ""
```

Put your server address between the quotes, with nothing after it:

```js
  serverAddress: "https://your-server-address"
```

This one setting turns on both safety reporting and the AI agents.

Save the file.

**Step 3.** Open `admin.html` on your site. Type your server address and your owner code. Press "Show reports".

Until Step 2 is done, the Safety Catalog page in the app says "Central reporting is OFF" and entries stay on each device.

## Permanent safety storage

On Vercel the server can only write to a temporary folder, so safety reports need a permanent database. Connect a free **Neon Postgres** database to the project (Vercel → Storage → Create Database → Neon). Vercel adds `DATABASE_URL` automatically and the server starts using it on the next deploy. Check it at `/api/safety/status` — it should say `"permanent": true`.

## Connecting AI companies

Add one or more of these keys in the **server's** settings (never in `config.js`, never in chat):

| Setting name | Where to get the key |
|---|---|
| `GROQ_API_KEY` | console.groq.com → API Keys |
| `GEMINI_API_KEY` | aistudio.google.com → Get API key |
| `OPENROUTER_API_KEY` | openrouter.ai → Keys |
| `XAI_API_KEY` | console.x.ai → API Keys |

Optional: `GROQ_MODELS`, `GEMINI_MODELS`, `OPENROUTER_MODELS`, `XAI_MODELS` (comma-separated model names) if a company renames its models, and `AI_PROVIDER_ORDER` (default `groq,gemini,openrouter,xai`).

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

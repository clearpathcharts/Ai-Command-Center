/*
 * Browser test: clicks through every feature like a real person would.
 * Run with:  node tests/ui-smoke.js
 * Fails (exit code 1) if anything breaks or any page error happens.
 */
const path = require("path");
const { chromium } = require("playwright");
const URL = "file://" + path.resolve(__dirname, "..", "backend", "web", "index.html");
let failures = 0;
function check(ok, label) { console.log((ok ? "PASS " : "FAIL ") + label); if (!ok) failures++; }

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await page.goto(URL);
  const S = () => page.evaluate(() => window.AICC.getState());

  // 1. First-visit safety notice must be shown and accepted.
  check(await page.isVisible("#safety-notice-dialog"), "safety notice shows on first visit");
  await page.click("#safety-notice-accept");
  check(!(await page.isVisible("#safety-notice-dialog")), "safety notice closes after 'I understand'");

  // 2. Agent Creator Brain agents survive other saves (old data-loss bug).
  await page.click('[data-view="brain"]');
  await page.fill("#brain-request", "I need help with appointments and paperwork");
  await page.click("#brain-analyze");
  await page.click('[data-create-suggestion="0"]');
  await page.click('[data-view="departments"]');
  await page.click('[data-action="new-department"]');
  await page.fill("#department-name", "Family");
  await page.click("#department-form button[type=submit]");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("accessible-ai-command-center-v1")).agents.length);
  check(stored === 4, "Brain-created agent is still saved after another change (agents=" + stored + ")");

  // 3. Executive Brain approve (old crash) + creates missing specialists.
  await page.click('[data-view="executive"]');
  await page.fill("#executive-request", "Help me start a small business");
  await page.click("#executive-plan");
  await page.click("#executive-approve");
  let s = await S();
  check(s.workflows.length === 1 && s.tasks.length >= 5, "Executive Brain created a workflow and " + s.tasks.length + " tasks");
  check(s.agents.some(a => a.department === "finance") && s.agents.some(a => a.department === "marketing"), "Executive Brain created missing specialist agents");
  check(s.tasks.every(t => t.steps.length > 0), "every workflow task is broken into small steps");

  // 4. Command box creates a broken-down task; consequential task needs approval.
  await page.click('[data-view="overview"]');
  await page.fill("#command-input", "Send an email to my landlord about the repair");
  await page.click("#command-form button[type=submit]");
  s = await S();
  const emailTask = s.tasks.find(t => t.title.startsWith("Send an email"));
  check(emailTask && emailTask.steps.length === 5, "command creates a task with small steps");
  check(s.approvals.some(a => a.taskId === emailTask.id && a.status === "pending"), "sending task automatically requires approval");
  await page.selectOption(`[data-task-status="${emailTask.id}"]`, "done");
  check((await S()).tasks.find(t => t.id === emailTask.id).status === "todo", "cannot complete a task before approving it");

  // 5. Rescue Mode: one step, done, smaller, hand off.
  await page.click("[data-rescue-open] >> nth=0");
  check(await page.isVisible("#rescue-step"), "Rescue Mode shows one next step");
  const firstStep = await page.textContent("#rescue-step");
  await page.click("#rescue-done");
  check((await page.textContent("#rescue-step")) !== firstStep, "'I did this step' moves to the next step");
  const before = (await S()).tasks.reduce((n, t) => n + t.steps.length, 0);
  await page.click("#rescue-smaller");
  check((await S()).tasks.reduce((n, t) => n + t.steps.length, 0) === before + 2, "'Make it smaller' splits the step");
  await page.click("#rescue-handoff");
  check((await S()).tasks.some(t => t.handedOff), "'Let an AI agent take the rest' hands off the task");
  await page.click('#rescue-dialog [data-close="rescue-dialog"] >> nth=-1');

  // 6. Focus Mode shows one task only + workflow runner.
  await page.click("#focus-toggle");
  check(await page.isVisible("#focus-panel .focus-card") && !(await page.isVisible("#view-overview")), "Focus Mode shows only the current task");
  await page.click("#focus-step-done");
  await page.click("#focus-toggle");
  await page.click('[data-view="workflows"]');
  await page.click("[data-run-workflow]");
  check((await page.textContent("#focus-panel .eyebrow")).includes("RUNNING WORKFLOW"), "workflow runs step by step");
  await page.click("#focus-toggle");

  // 7. Unlimited agents: bulk create 5000 + duplicate memory check.
  await page.click('[data-view="brain"]');
  await page.fill("#bulk-name", "Helper");
  await page.fill("#bulk-count", "5000");
  await page.click("#bulk-form button[type=submit]");
  s = await S();
  check(s.agents.filter(a => a.name.startsWith("Helper #")).length === 5000, "created 5000 agents at once");
  await page.fill("#bulk-name", "Helper");
  await page.fill("#bulk-count", "3");
  await page.click("#bulk-form button[type=submit]");
  s = await S();
  check(s.agents.some(a => a.name === "Helper #5003"), "second batch continues numbering (memory check)");
  await page.click('[data-view="agents"]');
  check((await page.locator("#agent-grid .agent-card").count()) === 60, "agent list shows 60 at a time (fast with thousands)");
  await page.click("#org-toggle");
  check(await page.isVisible("#org-chart details"), "team chart renders");

  // 8. Safety: urgent language shows crisis help and is cataloged.
  await page.click('[data-view="overview"]');
  await page.fill("#command-input", "I want to end my life");
  await page.click("#command-form button[type=submit]");
  check(await page.isVisible("#crisis-dialog"), "urgent language shows crisis help (988)");
  await page.click("#crisis-close");
  const cat = await page.evaluate(() => JSON.parse(localStorage.getItem("aicc-safety-request-catalog-v1")));
  check(cat.some(e => e.level === "urgent") && cat.some(e => e.source === "Executive Brain"), "safety catalog recorded requests from several places");
  check((await page.locator("[data-safety-delete], #safety-clear").count()) === 0, "users cannot delete safety entries");
  const stalk = await page.evaluate(() => window.AICC_SAFETY.screen("someone is stalking me").level);
  check(stalk === "review", "'stalking' is flagged for review");

  // 8b. Owner code: catalog hidden from users, opens only when the server accepts the code.
  check(!(await page.isVisible('[data-view="safety"]')), "Safety Catalog is hidden from regular users");
  check(!(await page.content()).match(/ownerCodeHash|SAFETY_ADMIN_PIN/), "no owner code or scrambled code is in the website");
  const owner = await browser.newPage();
  owner.on("pageerror", e => errors.push(e.message));
  await owner.route("**/config.js", r => r.fulfill({contentType: "application/javascript", body: 'window.AICC_CONFIG={serverAddress:"https://fake-server.test",ownerCheckUrl:"https://fake-server.test/api/admin/safety?limit=1",safetyReportUrl:""};'}));
  await owner.route("https://fake-server.test/**", r => {
    const ok = r.request().headers()["x-admin-token"] === "246810"; // made-up test code, not the real one
    return r.fulfill(ok ? {json: {totals: {}, items: []}} : {status: 401, json: {detail: "Wrong code."}});
  });
  await owner.goto(URL);
  await owner.click("#safety-notice-accept");
  await owner.evaluate(() => window.AICC.showView("settings"));
  await owner.fill("#owner-code", "111111");
  await owner.click("#owner-form button[type=submit]");
  await owner.waitForTimeout(200);
  check(!(await owner.isVisible("#view-safety")), "wrong owner code does not open the catalog");
  await owner.fill("#owner-code", "246810");
  await owner.click("#owner-form button[type=submit]");
  await owner.waitForSelector("#view-safety.active");
  check(await owner.isVisible('[data-view="safety"]'), "correct owner code (checked by the server) opens the Safety Catalog");
  await owner.evaluate(() => window.AICC.showView("settings"));
  await owner.click("#owner-lock");
  check(!(await owner.isVisible('[data-view="safety"]')), "owner area locks again");
  await owner.close();

  // 8c. Build Your Own App.
  await page.click('[data-view="builder"]');
  check((await page.locator("#builder-list .builder-step").count()) === 10, "app course has 10 lessons");
  await page.click("#builder-done");
  check((await page.textContent("#builder-lesson h2")).includes("folder"), "'I did this lesson' moves to the next lesson");
  await page.click('[data-lesson="8"]');
  check((await page.textContent("#builder-lesson pre")).includes("git push -u origin main"), "course ends with pushing to GitHub");
  await page.fill("#builder-name", "Medicine Reminder");
  await page.fill("#builder-idea", "A list of which medicine I took and when");
  await page.click("#builder-form button[type=submit]");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-project-download]")]);
  const html = require("fs").readFileSync(await dl.path(), "utf8");
  check(html.startsWith("<!doctype html>") && html.includes("Medicine Reminder"), "project starter file downloads as a working index.html");
  const cat2 = await page.evaluate(() => JSON.parse(localStorage.getItem("aicc-safety-request-catalog-v1")));
  check(cat2.some(e => e.source === "App Builder project"), "app projects are recorded in the safety catalog");

  // 8d. AI Money & Models.
  await page.click('[data-view="money"]');
  check((await page.locator("#money-lessons .builder-step").count()) === 6, "model course has 6 lessons");
  await page.fill("#training-q", "What does Four Up, Three Down mean?");
  await page.fill("#training-a", "It is a pattern-based trading method.");
  await page.click("#training-form button[type=submit]");
  const [tdl] = await Promise.all([page.waitForEvent("download"), page.click("#training-download")]);
  const line = JSON.parse(require("fs").readFileSync(await tdl.path(), "utf8").trim());
  check(line.messages[0].role === "user" && line.messages[1].content.includes("trading method"), "training file downloads in the correct format");
  const wfBefore = (await S()).workflows.length;
  await page.click('[data-money-path="grants"]');
  s = await S();
  check(s.workflows.length === wfBefore + 1 && s.tasks.some(t => t.title.includes("disability, accessibility")), "money path becomes a team workflow with tasks");
  check((await page.title()) === "Clear Path Markets Science", "site is branded Clear Path Markets Science");

  // 9. Intelligence Engine tools.
  await page.click('[data-view="intelligence"]');
  await page.fill("#intel-research-topic", "disability benefits");
  await page.click("#intel-research-go");
  check((await page.locator("#intel-research-out a").count()) === 5, "research desk gives 5 sources");
  await page.click('[data-intel-tab="source"]');
  await page.fill("#intel-source-url", "http://paypal-secure-login-verify.xyz/account");
  await page.click("#intel-source-go");
  check(await page.isVisible("#intel-source-out .intel-level.danger"), "website checker flags a fake PayPal address");
  await page.click('[data-intel-tab="scam"]');
  await page.fill("#intel-scam-text", "URGENT: You have won a prize! Pay the processing fee with gift cards now or your account will be suspended. Don't tell anyone.");
  await page.click("#intel-scam-go");
  check(await page.isVisible("#intel-scam-out .intel-level.danger"), "scam checker flags an obvious scam");
  await page.click('[data-intel-tab="doc"]');
  await page.fill("#intel-doc-text", "Dear customer. Your bill of $142.50 is due by March 15, 2027. Call 555-123-4567 with questions.");
  await page.click("#intel-doc-go");
  const doc = await page.textContent("#intel-doc-out");
  check(doc.includes("$142.50") && doc.includes("March 15, 2027") && doc.includes("555-123-4567"), "document reader finds money, date, and phone");
  await page.click('[data-intel-tab="classify"]');
  await page.fill("#intel-classify-text", "pay electric bill\ndentist appointment\ncall mom");
  await page.click("#intel-classify-go");
  check((await page.textContent("#intel-classify-out")).includes("Money & bills"), "list sorter groups items");
  await page.click('[data-intel-tab="report"]');
  await page.click("#intel-report-go");
  check(await page.isVisible("#intel-report-out pre"), "report is generated");
  await page.click('[data-intel-tab="monitor"]');
  await page.fill("#intel-monitor-title", "check bank account");
  await page.fill("#intel-monitor-when", "2020-01-01T09:00");
  await page.click("#intel-monitor-form button[type=submit]");
  await page.evaluate(() => window.AICC_INTEL.runMonitors());
  check((await S()).tasks.some(t => t.title === "Check-in: check bank account"), "due check-in creates a task");

  // 10. Social Media Studio approval flow.
  await page.click('[data-view="social"]');
  await page.selectOption("#social-platform", "x");
  await page.fill("#social-text", "Hello from ClearPath!");
  await page.click("#social-form button[type=submit]");
  await page.click("[data-social-approve]");
  s = await S();
  const ap = s.approvals.find(a => a.title.includes("Publish post on X"));
  check(!!ap, "social post goes to the Approval Center");
  await page.click('[data-view="approvals"]');
  await page.click(`[data-approval="${ap.id}"][data-decision="approved"]`);
  await page.click('[data-view="social"]');
  check(await page.isVisible("[data-social-posted]"), "approved post can be marked as posted");

  // 11. Knowledge base: search everything.
  await page.click('[data-view="knowledge"]');
  await page.fill("#kb-search", "scam");
  check((await page.locator("#kb-results .kb-result").count()) >= 1, "knowledge search finds articles");

  // 12. Settings: themes, size, spacing persist.
  await page.click('[data-view="settings"]');
  await page.selectOption("#theme", "light");
  await page.selectOption("#spacing", "wide");
  await page.selectOption("#font-scale", "130");
  await page.reload();
  check(await page.evaluate(() => document.body.classList.contains("theme-light") && document.body.classList.contains("spacing-wide")), "display settings persist after reload");
  check(!(await page.isVisible("#safety-notice-dialog")), "safety notice not repeated after accepted");

  // 13. Phone width: no sideways scrolling.
  await page.evaluate(() => { const s = window.AICC.getState(); s.settings.fontScale = 100; window.AICC.save(); });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const v of ["overview", "agents", "intelligence", "brain"]) {
    await page.evaluate(n => window.AICC.showView(n), v);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(!wide, "no sideways scrolling on phone: " + v);
  }

  // 14. AI agents (with a pretend server so no real keys are needed).
  const ai = await browser.newPage();
  ai.on("pageerror", e => errors.push(e.message));
  ai.on("dialog", d => d.accept());
  const sent = [];
  await ai.route("**/config.js", r => r.fulfill({contentType: "application/javascript", body: 'window.AICC_CONFIG={serverAddress:"https://fake-server.test"};(function(){var b="https://fake-server.test";window.AICC_CONFIG.safetyReportUrl=b+"/api/safety/report";window.AICC_CONFIG.aiChatUrl=b+"/api/ai/chat";window.AICC_CONFIG.aiStatusUrl=b+"/api/ai/providers";})();'}));
  await ai.route("https://fake-server.test/**", r => {
    const u = r.request().url();
    if (u.endsWith("/api/ai/providers")) return r.fulfill({json: {ready: true, connected: ["Groq", "Google Gemini"]}});
    if (u.endsWith("/api/ai/chat")) { sent.push(JSON.parse(r.request().postData())); return r.fulfill({json: {text: "1. Call the landlord office.\n2. Ask about the repair.", provider: "Groq", model: "test", crisis: false}}); }
    return r.fulfill({status: 202, json: {recorded: true}});
  });
  await ai.goto(URL);
  await ai.click("#safety-notice-accept");
  await ai.fill("#command-input", "Write a note to my landlord about the broken heater");
  await ai.click("#command-form button[type=submit]");
  await ai.click("[data-ai-run] >> nth=0");
  await ai.waitForSelector(".ai-draft p");
  check((await ai.textContent(".ai-draft p")).includes("Call the landlord office"), "'Agent: do this' shows the AI draft on the task");
  check(sent[0] && sent[0].agent_name === "Executive Assistant" && sent[0].task.includes("landlord"), "agent name and task are sent to the AI server");
  check(!JSON.stringify(sent).toLowerCase().includes("api_key"), "no AI key is ever in the website");
  await ai.evaluate(() => window.AICC.showView("settings"));
  check((await ai.textContent("#ai-status")).includes("Groq"), "settings page shows which AI is connected");
  await ai.close();

  check(errors.length === 0, "no JavaScript errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await browser.close();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
})();

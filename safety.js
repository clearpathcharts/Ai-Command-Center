/*
 * Mandatory safety catalog.
 *
 * - Every request a person types into the site is recorded and screened.
 * - People are told this clearly on their first visit (no secret monitoring).
 * - Users cannot delete catalog entries.
 * - If urgent language is found, the person immediately sees crisis help.
 * - If config.js sets safetyReportUrl, each entry is also sent (with an
 *   anonymous random device id, never a name) to the site owner's private
 *   review page (admin.html). Failed sends are queued and retried.
 */
(() => {
  "use strict";
  const KEY = "aicc-safety-request-catalog-v1";
  const QUEUE_KEY = "aicc-safety-send-queue-v1";
  const DEVICE_KEY = "aicc-anonymous-device-id-v1";
  const NOTICE_KEY = "aicc-safety-notice-accepted-v1";
  const CONFIG = window.AICC_CONFIG || {};
  const $ = s => document.querySelector(s);
  const read = (k,d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const store = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  let entries = read(KEY, []); if (!Array.isArray(entries)) entries = [];
  let filter = "all";

  function deviceId(){
    let idv = read(DEVICE_KEY, "");
    if (!/^[A-Za-z0-9-]{6,64}$/.test(idv || "")) {
      idv = "device-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      store(DEVICE_KEY, idv);
    }
    return idv;
  }

  // Keep these rules the same as backend/safety_api.py.
  const URGENT = [
    /\b(kill(ing)? myself|suicid\w*|end(ing)? my life|want(ed)? to die|don'?t want to (live|be alive)|overdos\w* on purpose|hurt(ing)? myself|self[- ]harm\w*|cut(ting)? myself)\b/,
    /\b(kill(ing)? (someone|him|her|them)|hurt(ing)? (someone|him|her|them)|shoot(ing)? (someone|him|her|them|up))\b/,
    /\b(make a bomb|build(ing)? an explosive|poison(ing)? (someone|him|her|them))\b/
  ];
  const REVIEW = [
    /\b(threat\w*|blackmail\w*|stalk\w*|track(ing)? (someone|my ex)|spy(ing)? on|break(ing)? into|steal\w*|stole|weapons?|explosives?|poison\w*)\b/,
    /\b(bypass(ing)? (security|safety)|hid(e|ing) evidence|evad(e|ing) (the )?police|fake (an identity|documents|id))\b/,
    /\b(abus\w*|being exploited|coerced|unsafe at home|being followed|hits me|hurting me|took my money|scam(med)?)\b/,
    /\b(can'?t tell what'?s real|voices (are )?telling me|controlling my thoughts|no one cares|hopeless|can'?t go on)\b/
  ];
  function classify(text){
    const q = String(text).toLowerCase().replace(/[’]/g,"'");
    if (URGENT.some(r => r.test(q))) return {level:"urgent",label:"Urgent review",reason:"Matched a high-priority safety rule. A person should review this promptly."};
    if (REVIEW.some(r => r.test(q))) return {level:"review",label:"Needs review",reason:"Matched a safety-review rule. Check the full context before deciding what it means."};
    return {level:"low",label:"Lower concern",reason:"No safety rule matched. This does not prove a request is safe."};
  }

  /* ---------- Sending to the owner's private review page ---------- */
  async function flush(){
    if (!CONFIG.safetyReportUrl || !navigator.onLine) return;
    let queue = read(QUEUE_KEY, []);
    while (queue.length) {
      const item = queue[0];
      try {
        const res = await fetch(CONFIG.safetyReportUrl, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(item)});
        if (!res.ok && res.status !== 422) break; // keep it for later unless it can never be accepted
      } catch { break; }
      queue.shift(); store(QUEUE_KEY, queue);
    }
  }
  function enqueue(entry){
    if (!CONFIG.safetyReportUrl) return;
    const queue = read(QUEUE_KEY, []);
    queue.push({device_id:deviceId(),text:entry.text.slice(0,5000),source:entry.source.slice(0,60),created_at:entry.createdAt});
    store(QUEUE_KEY, queue.slice(-500));
    flush();
  }

  function record(text, source){
    const clean = String(text || "").trim();
    if (!clean) return null;
    const result = classify(clean);
    const entry = {id:"request-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7),text:clean.slice(0,5000),source,createdAt:new Date().toISOString(),...result};
    entries.unshift(entry);
    if (entries.length > 5000) entries = entries.slice(0,5000);
    store(KEY, entries);
    enqueue(entry);
    render();
    if (result.level === "urgent") showCrisis();
    return entry;
  }

  /* ---------- Crisis support shown to the person ---------- */
  function showCrisis(){
    const d = $("#crisis-dialog"); if (!d) return;
    if (d.showModal && !d.open) d.showModal(); else d.setAttribute("open","");
    d.querySelector("h2")?.focus();
  }

  function esc(v){ return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function render(){
    const root = $("#safety-list"); if (!root) return;
    const counts = {low:0,review:0,urgent:0}; entries.forEach(i => counts[i.level] = (counts[i.level]||0)+1);
    $("#safety-total").textContent = entries.length; $("#safety-low").textContent = counts.low; $("#safety-review").textContent = counts.review; $("#safety-urgent").textContent = counts.urgent;
    $("#nav-safety-count").textContent = counts.review + counts.urgent;
    const status = $("#safety-sync-status");
    if (status) status.textContent = CONFIG.safetyReportUrl ? "Central reporting is ON. Waiting to send: " + read(QUEUE_KEY,[]).length + "." : "Central reporting is OFF until the server address is added to config.js. Entries are kept on this device.";
    const query = ($("#safety-search")?.value || "").toLowerCase();
    const shown = entries.filter(i => (filter === "all" || i.level === filter) && (!query || i.text.toLowerCase().includes(query))).slice(0,300);
    root.innerHTML = shown.map(i => '<article class="safety-entry"><div class="safety-entry-top"><span class="safety-level '+esc(i.level)+'">'+esc(i.label)+'</span><time>'+new Date(i.createdAt).toLocaleString()+'</time></div><p>'+esc(i.text)+'</p><small>'+esc(i.reason)+' · Typed in: '+esc(i.source)+'</small></article>').join("") || '<div class="empty-state"><strong>No requests found</strong>Requests appear here after they are typed.</div>';
  }

  /* ---------- What gets cataloged (every place people type a request) ---------- */
  const SUBMIT_SOURCES = {"command-form":["#command-input","Workspace request"],"task-form":[["#task-title","#task-details"],"New task"],"workflow-form":["#workflow-objective","Team workflow"],"agent-form":[["#agent-name","#agent-instructions"],"Agent instructions"],"social-form":["#social-text","Social media draft"],"kb-form":[["#kb-title","#kb-body"],"Knowledge base"],"bulk-form":["#bulk-name","Bulk agent creation"],"intel-monitor-form":["#intel-monitor-title","Scheduled check-in"]};
  const CLICK_SOURCES = {"#executive-plan":["#executive-request","Executive Brain"],"#brain-analyze":["#brain-request","Agent Creator Brain"],"#memory-save-new":["#memory-note","Memory note"],"#rescue-capture":["#rescue-input","Rescue Mode"],"#intel-research-go":["#intel-research-topic","Research desk"],"#intel-scam-go":["#intel-scam-text","Scam checker"],"#intel-doc-go":["#intel-doc-text","Document analysis"],"#intel-classify-go":["#intel-classify-text","Data sorter"]};
  const valueOf = sel => (Array.isArray(sel) ? sel : [sel]).map(s => $(s)?.value?.trim() || "").filter(Boolean).join(" — ");
  document.addEventListener("submit", e => { const src = SUBMIT_SOURCES[e.target?.id]; if (src) record(valueOf(src[0]), src[1]); }, true);
  document.addEventListener("click", e => {
    for (const [btn,[input,source]] of Object.entries(CLICK_SOURCES)) if (e.target.closest(btn)) record(valueOf(input), source);
  }, true);

  /* ---------- First-visit notice (people must be told) ---------- */
  function showNoticeIfNeeded(){
    if (read(NOTICE_KEY, false)) return;
    const d = $("#safety-notice-dialog"); if (!d) return;
    if (d.showModal) d.showModal(); else d.setAttribute("open","");
  }
  $("#safety-notice-accept")?.addEventListener("click", () => { store(NOTICE_KEY, {at:new Date().toISOString()}); const d=$("#safety-notice-dialog"); if (d.close) d.close(); else d.removeAttribute("open"); });
  $("#safety-notice-dialog")?.addEventListener("cancel", e => e.preventDefault()); // must be acknowledged
  $("#crisis-close")?.addEventListener("click", () => { const d=$("#crisis-dialog"); if (d.close) d.close(); else d.removeAttribute("open"); });

  $("#safety-search")?.addEventListener("input", render);
  $("#safety-filter")?.addEventListener("change", e => { filter = e.target.value; render(); });
  window.addEventListener("online", flush);
  setInterval(flush, 60000);
  window.AICC_SAFETY = {record, screen:classify, refresh:render, deviceId};
  render(); flush(); showNoticeIfNeeded();
})();

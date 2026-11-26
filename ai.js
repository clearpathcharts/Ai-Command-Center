/*
 * AI agents — asks the server's AI connection (Groq first, then Gemini,
 * OpenRouter, xAI) to write a draft for a task. The AI only writes drafts.
 * Nothing is ever sent, paid, posted, or signed by the AI.
 */
(() => {
  "use strict";
  const A = window.AICC;
  if (!A) { console.error("AI agents need app.js to load first."); return; }
  const CONFIG = window.AICC_CONFIG || {};
  const $ = s => document.querySelector(s);
  const esc = A.esc;
  let status = {checked:false, ready:false, connected:[]};
  const busy = new Set();

  const enabled = () => !!CONFIG.aiChatUrl;

  async function checkStatus(){
    if (!CONFIG.aiStatusUrl) { status = {checked:true, ready:false, connected:[]}; renderStatus(); return; }
    try { const r = await fetch(CONFIG.aiStatusUrl); status = {...(await r.json()), checked:true}; }
    catch { status = {checked:true, ready:false, connected:[], unreachable:true}; }
    renderStatus();
  }
  function renderStatus(){
    const el = $("#ai-status"); if (!el) return;
    el.textContent = !enabled() ? "AI is not connected yet. The server address in config.js is empty."
      : status.unreachable ? "AI server could not be reached right now."
      : status.ready ? "AI connected: " + status.connected.join(", ") + ". Agents can write drafts."
      : status.checked ? "The AI server is running, but no AI company key has been added yet." : "Checking AI connection…";
  }

  async function ask({task, agent, mode="agent", source="AI request"}){
    if (!enabled()) throw new Error("AI is not connected yet. Ask the site owner to add the server address.");
    // Recorded on this device only — the server records it in the central catalog itself.
    window.AICC_SAFETY?.record(task, source, {localOnly:true});
    const res = await fetch(CONFIG.aiChatUrl, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({
      device_id: window.AICC_SAFETY?.deviceId() || "device-unknown",
      task: String(task).slice(0,6000), mode, source,
      agent_name: agent?.name || "Executive Assistant",
      agent_role: agent?.role || "Helps organize and complete tasks",
      agent_instructions: (agent?.instructions || "").slice(0,1500)
    })});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || "The AI could not answer right now. Please try again later.");
    return data;
  }

  async function runTask(taskId){
    const s = A.getState(), t = s.tasks.find(x => x.id === taskId); if (!t || busy.has(taskId)) return;
    const agent = s.agents.find(a => a.id === t.agent) || s.agents.find(a => a.id === "agent-executive");
    busy.add(taskId); A.render(); A.toast((agent?.name || "Your agent") + " is working on a draft…");
    try {
      const steps = t.steps.filter(x => !x.done).map((x,i) => (i+1) + ". " + x.text).join("\n");
      const r = await ask({task: t.title + (t.details ? "\nDetails: " + t.details : "") + (steps ? "\nSteps still to do:\n" + steps : ""), agent, source:"Agent task"});
      const fresh = A.getState().tasks.find(x => x.id === taskId);
      if (fresh) { fresh.aiDraft = {text:r.text, by:agent?.name || "Agent", provider:r.provider, at:new Date().toISOString(), crisis:!!r.crisis}; }
      A.save(); A.toast(r.crisis ? "Please read this message." : "Draft ready. Please check it before using it.");
    } catch (e) { A.toast(e.message); }
    finally { busy.delete(taskId); A.render(); }
  }

  function draftHtml(t){
    if (busy.has(t.id)) return '<div class="ai-draft working">● '+esc(A.agentName(t.agent))+' is writing a draft…</div>';
    if (!t.aiDraft) return "";
    const d = t.aiDraft;
    return '<div class="ai-draft'+(d.crisis?" crisis":"")+'"><div class="ai-draft-head"><strong>'+(d.crisis?"Please read":"Draft from "+esc(d.by))+'</strong><small>'+(d.crisis?"":"Written by AI ("+esc(d.provider)+") · check it before you use it · ")+esc(new Date(d.at).toLocaleString())+'</small></div><p>'+esc(d.text)+'</p><div class="card-actions"><button class="mini-button" data-ai-read="'+esc(t.id)+'">🔊 Read</button><button class="mini-button" data-ai-copy="'+esc(t.id)+'">Copy</button><button class="mini-button" data-ai-run="'+esc(t.id)+'">Try again</button><button class="mini-button" data-ai-clear="'+esc(t.id)+'">Remove draft</button></div></div>';
  }

  document.addEventListener("click", e => {
    const s = A.getState(), pick = attr => { const b = e.target.closest("["+attr+"]"); return b ? s.tasks.find(t => t.id === b.getAttribute(attr)) : null; };
    let t;
    if ((t = pick("data-ai-run"))) { if (!enabled()) { A.toast("AI is not connected yet. The site owner needs to add the server address and an AI key."); return; } runTask(t.id); return; }
    if ((t = pick("data-ai-read")) && t.aiDraft) { A.speak(t.aiDraft.text); return; }
    if ((t = pick("data-ai-copy")) && t.aiDraft) { navigator.clipboard?.writeText(t.aiDraft.text).then(() => A.toast("Copied."), () => A.toast("Could not copy. Select the text by hand.")); return; }
    if ((t = pick("data-ai-clear"))) { delete t.aiDraft; A.save(); return; }
    if (e.target.closest("#intel-doc-explain")) {
      const text = $("#intel-doc-text")?.value.trim(); if (!text) { A.toast("Paste the document text first."); return; }
      const out = $("#intel-doc-ai"); out.hidden = false; out.textContent = "Explaining in simple words…";
      ask({task:text, mode:"simplify", source:"Document explain"}).then(r => { out.innerHTML = '<h4>In simple words</h4><p>'+esc(r.text)+'</p><p class="intel-note">Written by AI ('+esc(r.provider)+'). Always check the original document.</p>'; })
        .catch(err => { out.textContent = err.message; });
    }
  });

  window.AICC_AI = {ask, runTask, draftHtml, enabled, isBusy: id => busy.has(id)};
  A.onRender(renderStatus);
  checkStatus();
})();

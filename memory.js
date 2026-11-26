/*
 * Memory support — saved notes, workforce search, and the
 * "What was I doing?" recap. Data lives in the shared workspace (state.memories).
 */
(() => {
  "use strict";
  const A = window.AICC;
  if (!A) { console.error("Memory needs app.js to load first."); return; }
  const SESSION_KEY = "accessible-ai-command-center-last-session-v1";
  const $ = s => document.querySelector(s);
  const esc = A.esc;
  const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
  const writeSession = v => { try { localStorage.setItem(SESSION_KEY, JSON.stringify(v)); } catch {} };
  const lastVisit = readSession();
  const dateLabel = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? "Not recorded" : d.toLocaleString([], {month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}); };
  const CATEGORY = {personal:"Personal preference",project:"Project",instruction:"Important instruction",reminder:"Reminder",agent:"Agent information"};

  function renderNotes(){
    const list=$("#memory-list");if(!list)return;
    const notes=A.getState().memories.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    list.innerHTML=notes.slice(0,20).map(n=>'<div class="memory-item"><div class="memory-item-head"><strong>'+esc(CATEGORY[n.category]||"Memory")+'</strong><small>'+dateLabel(n.createdAt)+'</small></div><p>'+esc(n.text)+'</p><button class="mini-button" data-memory-read="'+esc(n.id)+'">🔊 Read</button> <button class="mini-button" data-memory-delete="'+esc(n.id)+'" aria-label="Delete this memory">Delete</button></div>').join("")||'<p class="resume-muted">No saved memories yet. Add one above whenever something is important to remember.</p>';
  }
  function renderSearch(){
    const root=$("#brain-search-results");if(!root)return;
    const s=A.getState(),q=($("#brain-search")?.value||"").trim().toLowerCase();
    if(!q){root.innerHTML="";return}
    const agents=s.agents.filter(a=>(a.name+" "+a.role+" "+a.instructions).toLowerCase().includes(q)).slice(0,20);
    const tasks=s.tasks.filter(t=>(t.title+" "+(t.details||"")).toLowerCase().includes(q)).slice(0,20);
    const notes=s.memories.filter(n=>n.text.toLowerCase().includes(q)).slice(0,20);
    root.innerHTML=agents.map(a=>'<div class="brain-result"><strong>✧ Agent: '+esc(a.name)+'</strong><small>'+esc(a.role)+' · '+esc(A.departmentName(a.department))+'</small></div>').join("")
      +tasks.map(t=>'<div class="brain-result"><strong>☷ Task: '+esc(t.title)+'</strong><small>'+esc(t.status==="done"?"Completed":t.status==="inprogress"?"In progress":"To do")+' · '+esc(A.agentName(t.agent))+'</small></div>').join("")
      +notes.map(n=>'<div class="brain-result"><strong>▤ Memory</strong><small>'+esc(n.text)+'</small></div>').join("")
      ||'<div class="empty-state"><strong>Nothing found</strong>Try another word, or save a new memory below.</div>';
  }
  function resume(){
    const root=$("#resume-summary");if(!root)return;
    const s=A.getState();
    const open=s.tasks.filter(t=>t.status!=="done"),active=open.filter(t=>t.status==="inprogress");
    const notes=s.memories.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    const taskRows=open.slice(0,6).map(t=>'<div class="resume-item"><span class="resume-dot"></span><div><strong>'+esc(t.title)+'</strong><small>'+esc(t.status==="inprogress"?"In progress":"Not started")+' · '+esc(A.agentName(t.agent))+'</small></div></div>').join("");
    const flowRows=s.workflows.slice(0,4).map(w=>{const wt=s.tasks.filter(t=>t.workflowId===w.id),done=wt.filter(t=>t.status==="done").length;return '<div class="resume-item"><span class="resume-dot purple"></span><div><strong>'+esc(w.title)+'</strong><small>'+done+' of '+wt.length+' steps complete</small></div></div>'}).join("");
    const noteRows=notes.slice(0,4).map(n=>'<div class="resume-item"><span class="resume-dot cyan"></span><div><strong>'+esc(n.text)+'</strong><small>'+esc(CATEGORY[n.category]||"Memory")+' · '+dateLabel(n.createdAt)+'</small></div></div>').join("");
    root.innerHTML='<div class="resume-stats"><div><strong>'+open.length+'</strong><small>unfinished tasks</small></div><div><strong>'+active.length+'</strong><small>in progress</small></div><div><strong>'+s.agents.length+'</strong><small>saved agents</small></div><div><strong>'+s.workflows.length+'</strong><small>team workflows</small></div></div><div class="resume-columns"><section><h3>Your next tasks</h3>'+(taskRows||'<p class="resume-muted">No unfinished tasks. You can start something new whenever you are ready.</p>')+'</section><section><h3>Recent projects</h3>'+(flowRows||'<p class="resume-muted">No team workflows saved yet.</p>')+'</section><section><h3>Things to remember</h3>'+(noteRows||'<p class="resume-muted">No saved memories yet.</p>')+'</section></div><p class="resume-last">Your last visit before this one: '+(lastVisit?dateLabel(lastVisit.at):"Not recorded")+'. This recap uses information saved in this browser.</p><button class="quiet-button" id="resume-read">🔊 Read my recap to me</button>';
  }

  $("#memory-save-new")?.addEventListener("click",()=>{
    const text=$("#memory-note")?.value.trim();if(!text){A.toast("Write a memory first.");$("#memory-note")?.focus();return}
    A.getState().memories.push({id:A.id("memory"),text,category:$("#memory-category")?.value||"personal",createdAt:new Date().toISOString()});
    $("#memory-note").value="";A.save();A.toast("Saved. You can search for this memory later on this device.");
  });
  $("#memory-voice")?.addEventListener("click",e=>A.listen($("#memory-note"),e.currentTarget));
  $("#memory-list")?.addEventListener("click",e=>{
    const del=e.target.closest("[data-memory-delete]");
    if(del&&confirm("Delete this memory?")){const s=A.getState();s.memories=s.memories.filter(n=>n.id!==del.dataset.memoryDelete);A.save();A.toast("Memory deleted from this device.");return}
    const rd=e.target.closest("[data-memory-read]");
    if(rd){const n=A.getState().memories.find(x=>x.id===rd.dataset.memoryRead);if(n)A.speak(n.text)}
  });
  $("#brain-search")?.addEventListener("input",renderSearch);
  $("#brain-resume")?.addEventListener("click",()=>{resume();A.toast("Your work summary is ready.")});
  $("#resume-summary")?.addEventListener("click",e=>{if(e.target.closest("#resume-read"))A.speak($("#resume-summary").innerText.replace("🔊 Read my recap to me",""))});
  window.addEventListener("pagehide",()=>writeSession({at:new Date().toISOString()}));
  writeSession({at:new Date().toISOString()});

  A.onRender(()=>{renderNotes();renderSearch();resume()});
})();

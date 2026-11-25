(() => {
  "use strict";
  const WORKSPACE_KEY="accessible-ai-command-center-v1";
  const MEMORY_KEY="accessible-ai-command-center-memory-v1";
  const SESSION_KEY="accessible-ai-command-center-last-session-v1";
  const $=s=>document.querySelector(s);
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const dateLabel=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?"Not recorded":d.toLocaleString([], {month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})};
  const getNotes=()=>read(MEMORY_KEY,[]);
  function notify(message){const el=$("#toast");if(!el)return;el.textContent=message;el.classList.add("show");window.clearTimeout(notify.timer);notify.timer=window.setTimeout(()=>el.classList.remove("show"),2800)}
  function renderNotes(){
    const list=$("#memory-list");if(!list)return;
    const notes=getNotes().slice().reverse();
    list.innerHTML=notes.slice(0,12).map(n=>'<div class="memory-item"><div class="memory-item-head"><strong>'+escape(n.category||"personal")+'</strong><small>'+dateLabel(n.createdAt)+'</small></div><p>'+escape(n.text)+'</p><button class="mini-button" data-memory-delete="'+escape(n.id)+'" aria-label="Delete memory">Delete</button></div>').join("")||'<p class="resume-muted">No saved memories yet. Add one above whenever something is important to remember.</p>';
  }
  function resume(){
    const root=$("#resume-summary");if(!root)return;
    const s=read(WORKSPACE_KEY,{agents:[],tasks:[],workflows:[],departments:[]});
    const tasks=s.tasks||[],open=tasks.filter(t=>t.status!=="done"),active=open.filter(t=>t.status==="inprogress");
    const workflows=s.workflows||[],agents=s.agents||[],notes=getNotes().slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    const last=read(SESSION_KEY,null);
    const agentName=id=>agents.find(a=>a.id===id)?.name||"Not assigned";
    const taskRows=open.slice(0,6).map(t=>'<div class="resume-item"><span class="resume-dot"></span><div><strong>'+escape(t.title)+'</strong><small>'+escape(t.status==="inprogress"?"In progress":"Not started")+' · '+escape(agentName(t.agent))+'</small></div></div>').join("");
    const flowRows=workflows.slice().reverse().slice(0,4).map(w=>{const wt=tasks.filter(t=>t.workflowId===w.id),done=wt.filter(t=>t.status==="done").length;return '<div class="resume-item"><span class="resume-dot purple"></span><div><strong>'+escape(w.title)+'</strong><small>'+done+' of '+wt.length+' steps complete</small></div></div>'}).join("");
    const noteRows=notes.slice(0,4).map(n=>'<div class="resume-item"><span class="resume-dot cyan"></span><div><strong>'+escape(n.text)+'</strong><small>'+escape(n.category||"Personal memory")+' · '+dateLabel(n.createdAt)+'</small></div></div>').join("");
    root.innerHTML='<div class="resume-stats"><div><strong>'+open.length+'</strong><small>unfinished tasks</small></div><div><strong>'+active.length+'</strong><small>in progress</small></div><div><strong>'+agents.length+'</strong><small>saved agents</small></div><div><strong>'+workflows.length+'</strong><small>team workflows</small></div></div><div class="resume-columns"><section><h3>Your next tasks</h3>'+(taskRows||'<p class="resume-muted">No unfinished tasks found. You can start something new whenever you are ready.</p>')+'</section><section><h3>Recent projects</h3>'+(flowRows||'<p class="resume-muted">No team workflows saved yet.</p>')+'</section><section><h3>Things to remember</h3>'+(noteRows||'<p class="resume-muted">No saved memories yet.</p>')+'</section></div><p class="resume-last">Last recorded visit: '+(last?dateLabel(last.at):"Not recorded")+'. This recap uses information saved in this browser.</p>';
    write(SESSION_KEY,{at:new Date().toISOString(),view:"brain"});
  }
  $("#memory-save-new")?.addEventListener("click",()=>{
    const text=$("#memory-note")?.value.trim();if(!text){notify("Write a memory first.");$("#memory-note")?.focus();return}
    const notes=getNotes();notes.push({id:"memory-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7),text,category:$("#memory-category")?.value||"personal",createdAt:new Date().toISOString()});
    write(MEMORY_KEY,notes);$("#memory-note").value="";renderNotes();resume();notify("Saved. You can search for this memory later on this device.");
  });
  $("#memory-list")?.addEventListener("click",e=>{
    const btn=e.target.closest("[data-memory-delete]");if(!btn)return;
    write(MEMORY_KEY,getNotes().filter(n=>n.id!==btn.dataset.memoryDelete));renderNotes();resume();notify("Memory deleted from this device.");
  });
  $("#brain-resume")?.addEventListener("click",()=>{resume();notify("Your saved work summary is ready.");});
  document.addEventListener("click",e=>{const nav=e.target.closest("[data-view]");if(nav)write(SESSION_KEY,{at:new Date().toISOString(),view:nav.dataset.view});});
  window.addEventListener("pagehide",()=>write(SESSION_KEY,{at:new Date().toISOString()}));
  renderNotes();resume();
})();
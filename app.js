/*
 * AI Command Center — core workspace.
 *
 * This file owns the ONE shared workspace state. Every other module
 * (brain.js, executive.js, memory.js, assist.js, intelligence.js, safety.js)
 * reads and changes data through window.AICC so that no module can silently
 * overwrite another module's work.
 */
(() => {
  "use strict";
  const KEY = "accessible-ai-command-center-v1";
  const LEGACY_MEMORY_KEY = "accessible-ai-command-center-memory-v1";
  const LEGACY_HANDOFF_KEY = "accessible-ai-command-center-handoffs-v1";

  const defaultDepartments = [
    {id:"executive",name:"Executive Office",purpose:"Leads the workforce, splits big goals into jobs, and checks the results.",icon:"◉"},
    {id:"research",name:"Research",purpose:"Find information, compare sources, and prepare reports.",icon:"⌕"},
    {id:"admin",name:"Administration",purpose:"Organize documents, schedules, and everyday work.",icon:"▤"},
    {id:"marketing",name:"Marketing",purpose:"Plan campaigns, content, and communications.",icon:"✧"},
    {id:"technology",name:"Technology",purpose:"Plan software, troubleshoot, and build digital tools.",icon:"⌘"},
    {id:"personal",name:"Personal Assistance",purpose:"Break down goals and make daily tasks easier.",icon:"♡"},
    {id:"finance",name:"Finance",purpose:"Organize financial information and prepare analysis for review.",icon:"＄"}
  ];
  const starterAgents = [
    {id:"agent-executive",name:"Executive Assistant",role:"Leads and coordinates the whole workforce",department:"executive",reportsTo:"",instructions:"Help clarify requests, break work into manageable tasks, create specialist agents when needed, and coordinate the user's workforce.",permission:"approval"},
    {id:"agent-research",name:"Research Specialist",role:"Research and source review",department:"research",reportsTo:"agent-executive",instructions:"Prepare research plans, organize source links, and summarize evidence without inventing facts.",permission:"prepare"},
    {id:"agent-organizer",name:"Organization Assistant",role:"Documents and planning",department:"admin",reportsTo:"agent-executive",instructions:"Turn complex work into clear, small steps and organize the user's task list.",permission:"prepare"}
  ];
  const defaultSettings = {fontScale:100,spacing:"normal",theme:"clearpath",highContrast:false,reduceMotion:false,simpleMode:false,readRate:0.9};
  const starterKnowledge = [
    {id:"kb-rescue",title:"Feeling overwhelmed? Use Rescue Mode",body:"Press the pink 'I'm overwhelmed' button at the top of any page. Everything else goes away. You will see one small next step. You can make that step smaller, have it read out loud, or hand the rest of the job to one of your agents. Your work is always saved.",tags:"help, rescue, overwhelmed, calm",createdAt:"2026-01-01T00:00:00.000Z"},
    {id:"kb-approvals",title:"Why some tasks wait for your yes",body:"If a task would send, pay, publish, book, sign, or delete something, it stops and waits in the Approval Center. Nothing leaves this device without your yes. This protects you from mistakes and from scams.",tags:"approval, safety, control",createdAt:"2026-01-01T00:00:00.000Z"},
    {id:"kb-scams",title:"Five signs of a scam",body:"1. They rush you. 2. They want gift cards, crypto, or wire transfers. 3. They ask for passwords or codes. 4. They say you won something. 5. They tell you to keep it secret. Use the Scam checker in the Intelligence Engine, and ask someone you trust.",tags:"scam, fraud, money, safety",createdAt:"2026-01-01T00:00:00.000Z"},
    {id:"kb-forget",title:"Forgot which agents you made?",body:"Open My AI Agents and use the search box, or open the Agent Creator Brain and search. The app also warns you if you try to make an agent you already have. You can make as many agents as you need.",tags:"memory, agents, forget, search",createdAt:"2026-01-01T00:00:00.000Z"}
  ];
  const initial = {departments:defaultDepartments,agents:starterAgents,tasks:[],approvals:[],workflows:[],memories:[],handoffs:[],monitors:[],socialPosts:[],projects:[],knowledge:starterKnowledge,settings:defaultSettings};
  const VIEW_NAMES = {money:"AI Money & Models",builder:"Build Your Own App",social:"Social Media Studio",knowledge:"Knowledge Base",overview:"Overview",agents:"My AI Agents",brain:"Agent Creator Brain",executive:"Executive Brain",departments:"Departments",tasks:"Tasks & Projects",approvals:"Approval Center",intelligence:"Intelligence Engine",settings:"Accessibility & Settings",workflows:"Team Workflows",safety:"Safety & Request Catalog"};

  // Words that mean an action reaches the outside world. Tasks containing them
  // automatically get an approval request so a person stays in control.
  const CONSEQUENTIAL = /\b(send|sends|sending|email|e-mail|publish|post|posting|purchase|buy|pay|payment|delete|sign|submit|book|cancel|transfer|wire|trade|invest|order|file taxes|apply)\b/i;

  const renderHooks = [];
  let state = loadState();
  let activeTaskFilter = "all";
  let agentLimit = 60;
  let toastTimer;
  const $ = (s,root=document) => root.querySelector(s);
  const $$ = (s,root=document) => [...root.querySelectorAll(s)];

  function clone(v){return JSON.parse(JSON.stringify(v))}
  function readJSON(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback}}

  function normalize(raw){
    const s={...clone(initial),...raw};
    ["departments","agents","tasks","approvals","workflows","memories","handoffs","monitors","socialPosts","projects"].forEach(k=>{if(!Array.isArray(s[k]))s[k]=[]});
    if(!Array.isArray(s.knowledge))s.knowledge=clone(starterKnowledge);
    s.settings={...defaultSettings,...(raw.settings||{})};
    // Older versions used a "largeText" checkbox.
    if(raw.settings&&raw.settings.largeText&&!raw.settings.fontScale)s.settings.fontScale=115;
    delete s.settings.largeText;
    s.tasks.forEach(t=>{if(!Array.isArray(t.steps))t.steps=[];if(!t.priority)t.priority="normal";if(!t.status)t.status="todo"});
    s.agents.forEach(a=>{if(a.reportsTo===undefined)a.reportsTo=""});
    return s;
  }
  function loadState(){
    const saved=readJSON(KEY,null);
    const s=normalize(saved&&typeof saved==="object"?saved:{});
    // Bring in data that older versions kept under separate keys.
    const legacyNotes=readJSON(LEGACY_MEMORY_KEY,null);
    if(Array.isArray(legacyNotes)&&legacyNotes.length){
      const known=new Set(s.memories.map(m=>m.id));
      legacyNotes.forEach(n=>{if(n&&n.text&&!known.has(n.id))s.memories.push(n)});
    }
    const legacyHandoffs=readJSON(LEGACY_HANDOFF_KEY,null);
    if(Array.isArray(legacyHandoffs)&&legacyHandoffs.length){
      const known=new Set(s.handoffs.map(h=>h.id));
      legacyHandoffs.forEach(h=>{if(h&&!known.has(h.id))s.handoffs.push(h)});
    }
    return s;
  }
  function persist(){
    try{
      localStorage.setItem(KEY,JSON.stringify(state));
      localStorage.removeItem(LEGACY_MEMORY_KEY);
      localStorage.removeItem(LEGACY_HANDOFF_KEY);
      return true;
    }catch(error){
      console.error("Workspace save failed",error);
      toast("This device could not save the latest change. Download a backup and free some browser storage.");
      return false;
    }
  }
  function save(){const ok=persist();render();return ok}

  function validBackup(data){
    if(!data||typeof data!=="object"||Array.isArray(data))return false;
    const required=["departments","agents","tasks","approvals","workflows"];
    if(!required.every(key=>Array.isArray(data[key])))return false;
    if(data.settings!==undefined&&(!data.settings||typeof data.settings!=="object"||Array.isArray(data.settings)))return false;
    const max={departments:5000,agents:100000,tasks:100000,approvals:50000,workflows:20000,memories:50000,handoffs:100000,monitors:1000,socialPosts:20000,knowledge:20000,projects:20000};
    return Object.keys(max).every(key=>!Array.isArray(data[key])||data[key].length<=max[key]);
  }
  function downloadFile(name,text,type="application/json"){
    const blob=new Blob([text],{type});
    const url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download=name;
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function downloadBackup(){
    const backup={format:"aicc-workspace-backup",version:2,exportedAt:new Date().toISOString(),workspace:state};
    downloadFile("ai-command-center-backup-"+new Date().toISOString().slice(0,10)+".json",JSON.stringify(backup,null,2));
    toast("Backup downloaded. Keep it somewhere safe.");
  }

  function id(prefix){return prefix+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7)}
  function escapeHtml(value=""){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function toast(message){const el=$("#toast");if(!el)return;el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),4200)}
  function departmentName(key){return state.departments.find(d=>d.id===key)?.name||"Unassigned"}
  function agentName(key){return state.agents.find(a=>a.id===key)?.name||"Unassigned"}
  function pendingApprovalFor(taskId){return state.approvals.find(a=>a.taskId===taskId&&a.status==="pending")}

  /* ---------- Speech: read aloud and dictation ---------- */
  function speak(text){
    if(!("speechSynthesis" in window)){toast("Read aloud is not supported in this browser.");return false}
    const clean=String(text||"").replace(/\s+/g," ").trim();
    if(!clean){toast("There is nothing to read yet.");return false}
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(clean);
    u.rate=Number(state.settings.readRate)||0.9;
    window.speechSynthesis.speak(u);
    return true;
  }
  function stopSpeaking(){if("speechSynthesis" in window)window.speechSynthesis.cancel()}
  function listen(target,button){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){toast("Voice typing is not supported in this browser. Chrome and Edge support it. You can still type.");return}
    const rec=new SR();rec.lang=navigator.language||"en-US";rec.interimResults=false;
    const label=button?button.textContent:"";
    if(button){button.textContent="● Listening…";button.disabled=true}
    rec.onresult=e=>{target.value+=(target.value?" ":"")+e.results[0][0].transcript;target.focus()};
    rec.onerror=()=>toast("Voice typing could not start. Check microphone permission, or type instead.");
    rec.onend=()=>{if(button){button.textContent=label;button.disabled=false}};
    try{rec.start()}catch{toast("Voice typing could not start. Please try again.")}
  }

  /* ---------- Task breakdown (turns a big job into small steps) ---------- */
  const BREAKDOWNS = [
    [/research|investigat|compare|find out|look up|study/i,["Write the question you want answered in one sentence","Find three trustworthy sources","Write one line about what each source says","Compare them: where do they agree or disagree?","Write a short summary in plain words"]],
    [/paperwork|document|form|record|application|contract|letter from/i,["Gather every paper or file for this job in one place","Read the first page only and note what it asks for","List any information you are missing","Fill in one section at a time","Check everything once, then ask for approval before signing or submitting"]],
    [/email|message|reply|write to|letter|call/i,["Decide who this is for and the one thing you want them to know","Write three short bullet points","Turn the bullet points into a short draft","Read the draft out loud once","Approve before it is sent"]],
    [/business|startup|company|side hustle|llc/i,["Describe the business idea in one sentence","Describe who the customer is","Look at three similar businesses","List the costs to get started","Pick one small first action for this week"]],
    [/market|campaign|social|advertis|promot|brand|content/i,["Decide who you want to reach","Write the main message in one sentence","Pick one place to share it (one platform only)","Draft the first post or piece of content","Approve before anything is published"]],
    [/appointment|doctor|dentist|meeting|schedule|calendar/i,["Write down who you need to see and why","List two or three times that work for you","Ask for approval, then call or book","Add it to your calendar with a reminder","Write down questions to bring"]],
    [/budget|money|bill|invoice|expense|financ|tax|pay/i,["List money coming in","List bills and money going out","Add up each list","Compare the two totals","Choose one small change or next action"]],
    [/website|app|software|code|program|build|platform/i,["Describe what the finished thing should do in one sentence","List the three most important features","Pick the very first feature to build","Build or test only that one piece","Check it works, then choose the next piece"]],
    [/\b(clarify|define|goal)\b/i,["Write the goal in one sentence","Write what 'finished' looks like","Write one thing you will NOT do (to keep it small)","Write who else needs to agree, if anyone","Save it so you don't have to remember it"]],
    [/\b(review|check|decision|decide|verify)\b/i,["Open the finished work","Look through each part once","Write down anything missing or unclear","Decide: is it ready, or does it need changes?","Write the next decision in one sentence"]],
    [/clean|organi[sz]e|tidy|declutter|room|house/i,["Pick only one small area","Set a 10-minute timer","Put things in three piles: keep, move, throw away","Deal with the throw-away pile","Stop and rest — that counts as progress"]]
  ];
  const GENERIC_STEPS=["Write what 'finished' looks like in one sentence","Gather what you need (files, links, names)","Do the first small part — about 10 minutes","Check what you did","Mark it finished, or choose the next small step"];
  // Uses the task's own words first; only falls back to the bigger goal if needed.
  function breakDown(text,fallback=""){
    const match=BREAKDOWNS.find(([re])=>re.test(text||""))||BREAKDOWNS.find(([re])=>re.test(fallback||""));
    return (match?match[1]:GENERIC_STEPS).map(t=>({id:id("step"),text:t,done:false}));
  }

  /* ---------- Creating work ---------- */
  function requestApprovalIfNeeded(task){
    const text=(task.title+" "+(task.details||""));
    if(!CONSEQUENTIAL.test(text)||pendingApprovalFor(task.id))return null;
    const approval={id:id("approval"),taskId:task.id,title:"Approve: "+task.title,description:"This task may reach the outside world (for example sending, paying, publishing, booking, signing, or deleting). Nothing happens until you approve it.",agent:task.agent||"",status:"pending",createdAt:new Date().toISOString()};
    state.approvals.unshift(approval);
    return approval;
  }
  function addTask({title,details="",agent="",priority="normal",workflowId="",steps=null}){
    const task={id:id("task"),title,details,agent,priority,status:"todo",workflowId,steps:steps||[],createdAt:new Date().toISOString()};
    state.tasks.unshift(task);
    requestApprovalIfNeeded(task);
    return task;
  }
  function createTask(title,details="",agent="",priority="normal",opts={}){
    const task=addTask({title,details,agent,priority,steps:opts.breakDown?breakDown(title+" "+details):null});
    save();
    toast(pendingApprovalFor(task.id)?"Task added. It needs your approval before anything is sent, paid, or published.":"Task added to your workspace.");
    if(opts.show!==false)showView("tasks");
    return task;
  }

  function showView(name){
    if(!VIEW_NAMES[name])name="overview";
    $$(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+name));
    $$(".nav-link[data-view]").forEach(b=>{const on=b.dataset.view===name;b.classList.toggle("active",on);if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
    $("#breadcrumb-current").textContent=VIEW_NAMES[name];
    $("#sidebar").classList.remove("open");
    window.scrollTo({top:0,behavior:state.settings.reduceMotion?"auto":"smooth"});
    const heading=$("#view-"+name+" h1");if(heading){heading.setAttribute("tabindex","-1");heading.focus({preventScroll:true})}
  }
  function empty(title,detail){return '<div class="empty-state"><strong>'+escapeHtml(title)+'</strong>'+escapeHtml(detail)+'</div>'}

  /* ---------- Rendering ---------- */
  function render(){
    const pending=state.approvals.filter(a=>a.status==="pending").length;
    $("#stat-agents").textContent=state.agents.length;$("#stat-departments").textContent=state.departments.length;$("#stat-tasks").textContent=state.tasks.filter(t=>t.status!=="done").length;$("#stat-approvals").textContent=pending;
    $("#nav-agent-count").textContent=state.agents.length;$("#nav-approval-count").textContent=pending;
    $("#today-label").textContent=new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric"}).format(new Date()).toUpperCase();
    $("#overview-tasks").innerHTML=state.tasks.filter(t=>t.status!=="done").slice(0,5).map(t=>'<div class="mini-task"><span class="task-dot"></span><div class="task-main"><strong>'+escapeHtml(t.title)+'</strong><small>'+escapeHtml(agentName(t.agent))+' · '+escapeHtml(t.status==="inprogress"?"In progress":"To do")+'</small></div><span class="status '+t.status+'">'+(t.status==="inprogress"?"Active":"Open")+'</span></div>').join("")||empty("No active tasks yet","Create a task and assign it to an agent.");
    $("#overview-departments").innerHTML=state.departments.slice(0,7).map(d=>'<div class="mini-department"><div class="dept-icon">'+escapeHtml(d.icon||"▦")+'</div><div class="dept-main"><strong>'+escapeHtml(d.name)+'</strong><small>'+(n=>n+(n===1?' agent':' agents'))(state.agents.filter(a=>a.department===d.id).length)+'</small></div></div>').join("")||empty("No departments yet","Add a department to organize your agents.");
    const deptOptions=state.departments.map(d=>'<option value="'+escapeHtml(d.id)+'">'+escapeHtml(d.name)+'</option>').join("");
    const filterValue=$("#agent-department-filter").value;
    $("#agent-department").innerHTML='<option value="">No department</option>'+deptOptions;
    $("#agent-department-filter").innerHTML='<option value="">All departments</option>'+deptOptions;
    $("#agent-department-filter").value=state.departments.some(d=>d.id===filterValue)?filterValue:"";
    $("#task-agent").innerHTML='<option value="">Leave unassigned</option>'+state.agents.map(a=>'<option value="'+escapeHtml(a.id)+'">'+escapeHtml(a.name)+'</option>').join("");
    renderAgents();renderDepartments();renderTasks();renderApprovals();renderWorkflows();applySettings();
    renderHooks.forEach(fn=>{try{fn(state)}catch(error){console.error("Render hook failed",error)}});
  }
  function renderAgents(){
    const q=($("#agent-search")?.value||"").toLowerCase(),dept=$("#agent-department-filter")?.value||"";
    const all=state.agents.filter(a=>(!dept||a.department===dept)&&[a.name,a.role,a.instructions].join(" ").toLowerCase().includes(q));
    const list=all.slice(0,agentLimit);
    const counter=$("#agent-count-line");if(counter)counter.textContent=all.length===state.agents.length?"You have "+state.agents.length+" agent"+(state.agents.length===1?"":"s")+".":"Showing "+all.length+" of your "+state.agents.length+" agents.";
    const more=$("#agent-more");if(more){more.hidden=all.length<=agentLimit;more.textContent="Show more agents ("+(all.length-list.length)+" more)"}
    renderOrgChart();
    $("#agent-grid").innerHTML=list.map(a=>{
      const manages=state.agents.filter(x=>x.reportsTo===a.id).length;
      const open=state.tasks.filter(t=>t.agent===a.id&&t.status!=="done").length;
      const boss=a.reportsTo?agentName(a.reportsTo):"";
      return '<article class="agent-card"><div class="agent-top"><div class="agent-avatar">✦</div><div><strong>'+escapeHtml(a.name)+'</strong><small>'+escapeHtml(a.role)+'</small></div></div><p>'+escapeHtml(a.instructions||"No additional instructions yet.")+'</p><div class="agent-chain">'+(boss?'<span>Reports to <b>'+escapeHtml(boss)+'</b></span>':'<span>Top of the team</span>')+(manages?'<span>Manages <b>'+manages+'</b> agent'+(manages>1?"s":"")+'</span>':'')+'<span><b>'+open+'</b> open task'+(open===1?"":"s")+'</span>'+(a.createdAt?'<span>Made '+escapeHtml(new Date(a.createdAt).toLocaleDateString())+(a.createdBy?' by '+escapeHtml(a.createdBy):'')+'</span>':'')+'</div><div class="card-meta"><span class="pill">'+escapeHtml(departmentName(a.department))+'</span><div class="card-actions"><button class="mini-button" data-edit-agent="'+escapeHtml(a.id)+'">Edit</button><button class="mini-button" data-delete-agent="'+escapeHtml(a.id)+'">Delete</button></div></div></article>';
    }).join("")||empty("No agents match","Create an agent or change your search.");
  }
  function renderOrgChart(){
    const root=$("#org-chart");if(!root||root.hidden)return;
    const kids={};state.agents.forEach(a=>{const k=state.agents.some(x=>x.id===a.reportsTo)?a.reportsTo:"";(kids[k]=kids[k]||[]).push(a)});
    let budget=1500;
    const branch=(key,depth)=>{
      const list=kids[key]||[];if(!list.length||budget<=0)return "";
      return '<ul>'+list.map(a=>{if(--budget<0)return "";const sub=kids[a.id]?.length||0;
        const label='<span class="org-node"><b>'+escapeHtml(a.name)+'</b> <small>'+escapeHtml(a.role)+' · '+escapeHtml(departmentName(a.department))+'</small></span>';
        return '<li>'+(sub?'<details'+(depth<1?" open":"")+'><summary>'+label+' <small>('+sub+' report'+(sub>1?"s":"")+')</small></summary>'+branch(a.id,depth+1)+'</details>':label)+'</li>'}).join("")+'</ul>';
    };
    root.innerHTML='<h2>Team chart — who reports to whom</h2>'+(branch("",0)||'<p>No agents yet.</p>')+(budget<0?'<p class="resume-muted">The chart is very large. Use search to find a specific agent.</p>':'');
  }
  function renderDepartments(){
    $("#department-grid").innerHTML=state.departments.map(d=>{
      const members=state.agents.filter(a=>a.department===d.id);
      return '<article class="department-card"><div class="dept-icon">'+escapeHtml(d.icon||"▦")+'</div><h3>'+escapeHtml(d.name)+'</h3><p>'+escapeHtml(d.purpose||"A team in your AI workforce.")+'</p><div class="dept-count">'+members.length+' <span class="dept-count-label">agents</span></div><div class="dept-members">'+(members.map(a=>'<span class="pill">'+escapeHtml(a.name)+'</span>').join("")||'<small>No agents yet</small>')+'</div><div class="card-meta"><span class="pill">Department</span><button class="mini-button" data-delete-department="'+escapeHtml(d.id)+'">Remove</button></div></article>';
    }).join("")||empty("No departments yet","Add a department to organize your agents.");
  }
  function stepsHtml(t){
    if(!t.steps.length)return "";
    const done=t.steps.filter(s=>s.done).length;
    return '<details class="task-steps"'+(t.status==="inprogress"?" open":"")+'><summary>Small steps: '+done+' of '+t.steps.length+' done</summary><ol>'+t.steps.map(s=>'<li><label><input type="checkbox" data-step-task="'+escapeHtml(t.id)+'" data-step="'+escapeHtml(s.id)+'"'+(s.done?" checked":"")+'> <span>'+escapeHtml(s.text)+'</span></label></li>').join("")+'</ol></details>';
  }
  function renderTasks(){
    const list=state.tasks.filter(t=>activeTaskFilter==="all"||t.status===activeTaskFilter);
    $("#task-board").innerHTML=list.map(t=>{
      const waiting=pendingApprovalFor(t.id);
      return '<article class="task-row"><div class="task-row-top"><div class="task-row-main"><h3>'+escapeHtml(t.title)+'</h3><p>'+escapeHtml(t.details||"No extra details")+' · '+escapeHtml(agentName(t.agent))+' · '+escapeHtml(t.priority)+' priority</p>'+(waiting?'<p class="needs-approval">⚑ Waiting for your approval before anything leaves this device</p>':'')+(t.handedOff?'<p class="handed-off">↗ Handed to '+escapeHtml(agentName(t.agent))+' — waiting in their queue</p>':'')+'</div><span class="status '+t.status+'">'+({todo:"To do",inprogress:"In progress",done:"Completed"}[t.status]||"To do")+'</span><select aria-label="Change status for '+escapeHtml(t.title)+'" data-task-status="'+escapeHtml(t.id)+'"><option value="todo" '+(t.status==="todo"?"selected":"")+'>To do</option><option value="inprogress" '+(t.status==="inprogress"?"selected":"")+'>In progress</option><option value="done" '+(t.status==="done"?"selected":"")+'>Completed</option></select><div class="card-actions">'+(t.steps.length?'':'<button class="mini-button" data-breakdown-task="'+escapeHtml(t.id)+'">Break into steps</button>')+'<button class="mini-button ai-button" data-ai-run="'+escapeHtml(t.id)+'">🤖 Agent: do this</button><button class="mini-button" data-read-task="'+escapeHtml(t.id)+'" aria-label="Read this task aloud">🔊 Read</button><button class="mini-button" data-delete-task="'+escapeHtml(t.id)+'">Delete</button></div></div>'+(window.AICC_AI?window.AICC_AI.draftHtml(t):"")+stepsHtml(t)+'</article>';
    }).join("")||empty("Nothing here yet","Create a task to get your work moving.");
  }
  function renderWorkflows(){
    const root=$("#workflow-list");
    if(!state.workflows.length){root.innerHTML=empty("No team workflows yet","Build a workflow to turn a larger goal into smaller assignments for your agents.");return}
    root.innerHTML=state.workflows.map(w=>{
      const tasks=state.tasks.filter(t=>t.workflowId===w.id).slice().sort((a,b)=>(a.order??0)-(b.order??0)),done=tasks.filter(t=>t.status==="done").length;
      const pct=tasks.length?Math.round(done/tasks.length*100):0;
      return '<article class="workflow-card"><div class="workflow-top"><div><span class="pill">TEAM PLAN</span><h2>'+escapeHtml(w.title)+'</h2><p>'+escapeHtml(w.objective)+'</p></div><div class="workflow-progress"><strong>'+pct+'%</strong><small>'+done+'/'+tasks.length+' complete</small></div></div><div class="progress-track"><span style="width:'+pct+'%"></span></div><div class="workflow-steps">'+tasks.map((t,i)=>'<div class="workflow-step"><span class="step-number">'+(i+1)+'</span><div class="step-copy"><strong>'+escapeHtml(t.title)+'</strong><small>'+escapeHtml(agentName(t.agent))+' · '+escapeHtml(t.status==="done"?"Completed":t.status==="inprogress"?"In progress":"To do")+'</small></div><span class="status '+t.status+'">'+({todo:"To do",inprogress:"Active",done:"Done"}[t.status]||"To do")+'</span></div>').join("")+'</div><div class="workflow-footer"><small>Created '+new Date(w.createdAt).toLocaleDateString()+'</small><div class="card-actions">'+(pct<100?'<button class="primary-button" data-run-workflow="'+escapeHtml(w.id)+'">▶ Run step by step</button>':'<span class="status done">Finished</span>')+'<button class="text-button" data-view-link="tasks">Manage tasks →</button></div></div></article>';
    }).join("");
  }
  function renderApprovals(){
    const list=state.approvals.filter(a=>a.status==="pending");
    const history=state.approvals.filter(a=>a.status!=="pending").slice(0,10);
    $("#approval-list").innerHTML=(list.map(a=>'<article class="approval-card"><span class="pill">AWAITING YOUR DECISION</span><h3>'+escapeHtml(a.title)+'</h3><p>'+escapeHtml(a.description)+'</p><p>Requested by '+escapeHtml(agentName(a.agent))+'</p><div class="approval-actions"><button class="primary-button" data-approval="'+escapeHtml(a.id)+'" data-decision="approved">Approve</button><button class="danger-button" data-approval="'+escapeHtml(a.id)+'" data-decision="rejected">Decline</button></div></article>').join("")||empty("No approvals waiting","When a task would send, pay, publish, book, sign, or delete something, it will appear here first."))
      +(history.length?'<h2 class="approval-history-title">Recent decisions</h2>'+history.map(a=>'<div class="approval-history"><span class="status '+(a.status==="approved"?"done":"")+'">'+(a.status==="approved"?"Approved":"Declined")+'</span> '+escapeHtml(a.title)+'</div>').join(""):"");
  }
  function applySettings(){
    const s=state.settings,b=document.body;
    b.classList.toggle("high-contrast",!!s.highContrast);
    b.classList.toggle("reduce-motion",!!s.reduceMotion);
    b.classList.toggle("simple-mode",!!s.simpleMode);
    ["theme-clearpath","theme-dark","theme-light","theme-calm"].forEach(c=>b.classList.remove(c));b.classList.add("theme-"+(["clearpath","dark","light","calm"].includes(s.theme)?s.theme:"clearpath"));
    ["spacing-normal","spacing-relaxed","spacing-wide"].forEach(c=>b.classList.remove(c));b.classList.add("spacing-"+(["normal","relaxed","wide"].includes(s.spacing)?s.spacing:"normal"));
    document.documentElement.style.zoom=String((Number(s.fontScale)||100)/100);
    const set=(sel,prop,val)=>{const el=$(sel);if(el)el[prop]=val};
    set("#high-contrast","checked",!!s.highContrast);set("#reduce-motion","checked",!!s.reduceMotion);set("#simple-mode","checked",!!s.simpleMode);
    set("#font-scale","value",String(s.fontScale));set("#spacing","value",s.spacing);set("#theme","value",s.theme);set("#read-rate","value",String(s.readRate));
  }
  function openDialog(name){const el=$("#"+name);if(!el)return;if(el.showModal){if(!el.open)el.showModal()}else el.setAttribute("open","")}
  function closeDialog(name){const el=$("#"+name);if(!el)return;if(el.close)el.close();else el.removeAttribute("open")}
  function startAgentEdit(agent){
    $("#agent-modal-title").textContent=agent?"Edit your AI agent":"Create your AI agent";
    $("#agent-id").value=agent?.id||"";$("#agent-name").value=agent?.name||"";$("#agent-role").value=agent?.role||"";
    $("#agent-department").value=agent?agent.department:(state.departments[0]?.id||"");
    $("#agent-instructions").value=agent?.instructions||"";$("#agent-permission").value=agent?.permission||"approval";
    $("#agent-reports-to").innerHTML='<option value="">Nobody — top of the team</option>'+state.agents.filter(a=>!agent||a.id!==agent.id).map(a=>'<option value="'+escapeHtml(a.id)+'">'+escapeHtml(a.name)+'</option>').join("");
    $("#agent-reports-to").value=agent?(agent.reportsTo||""):(state.agents.some(a=>a.id==="agent-executive")?"agent-executive":"");
    openDialog("agent-dialog");
  }
  function setTaskStatus(task,status){
    if(status!=="todo"&&pendingApprovalFor(task.id)){toast("This task needs your approval first. Open the Approval Center.");return false}
    task.status=status;
    if(status==="done")task.steps.forEach(s=>s.done=true);
    return true;
  }
  function wouldCreateLoop(agentId,bossId){
    let cur=bossId;const seen=new Set();
    while(cur&&!seen.has(cur)){if(cur===agentId)return true;seen.add(cur);cur=state.agents.find(a=>a.id===cur)?.reportsTo}
    return false;
  }

  /* ---------- Events ---------- */
  document.addEventListener("click",e=>{
    const nav=e.target.closest("[data-view]");if(nav){showView(nav.dataset.view);return}
    const link=e.target.closest("[data-view-link]");if(link){showView(link.dataset.viewLink);return}
    const action=e.target.closest("[data-action]")?.dataset.action;
    if(action==="new-agent"){startAgentEdit(null);return}
    if(action==="new-task"){openDialog("task-dialog");return}
    if(action==="new-workflow"){openDialog("workflow-dialog");return}
    if(action==="new-department"){openDialog("department-dialog");return}
    const close=e.target.closest("[data-close]");if(close){closeDialog(close.dataset.close);return}
    const prompt=e.target.closest("[data-prompt]");if(prompt){$("#command-input").value=prompt.dataset.prompt;$("#command-input").focus();return}
    const edit=e.target.closest("[data-edit-agent]");if(edit){startAgentEdit(state.agents.find(a=>a.id===edit.dataset.editAgent));return}
    const delAgent=e.target.closest("[data-delete-agent]");if(delAgent){const a=state.agents.find(x=>x.id===delAgent.dataset.deleteAgent);if(a&&confirm("Delete "+a.name+"? Their tasks will become unassigned. Agents who report to them will move up one level.")){state.agents=state.agents.filter(x=>x.id!==a.id);state.agents.forEach(x=>{if(x.reportsTo===a.id)x.reportsTo=a.reportsTo||""});state.tasks.forEach(t=>{if(t.agent===a.id){t.agent="";t.handedOff=false}});save();toast("Agent deleted.")}return}
    const delDept=e.target.closest("[data-delete-department]");if(delDept){const d=state.departments.find(x=>x.id===delDept.dataset.deleteDepartment);if(d&&confirm("Remove "+d.name+"? Agents in this department will become unassigned.")){state.departments=state.departments.filter(x=>x.id!==d.id);state.agents.forEach(a=>{if(a.department===d.id)a.department=""});save();toast("Department removed.")}return}
    const delTask=e.target.closest("[data-delete-task]");if(delTask){const t=state.tasks.find(x=>x.id===delTask.dataset.deleteTask);if(t&&confirm("Delete the task \""+t.title+"\"?")){state.tasks=state.tasks.filter(x=>x.id!==t.id);state.approvals=state.approvals.filter(a=>!(a.taskId===t.id&&a.status==="pending"));save();toast("Task deleted.")}return}
    const brk=e.target.closest("[data-breakdown-task]");if(brk){const t=state.tasks.find(x=>x.id===brk.dataset.breakdownTask);if(t){t.steps=breakDown(t.title+" "+(t.details||""));save();toast("Done. This task is now "+t.steps.length+" small steps.")}return}
    const rd=e.target.closest("[data-read-task]");if(rd){const t=state.tasks.find(x=>x.id===rd.dataset.readTask);if(t)speak(t.title+". "+(t.details||"")+(t.steps.length?" Steps: "+t.steps.map((s,i)=>"Step "+(i+1)+", "+s.text+(s.done?", done":"")).join(". "):""));return}
    const approval=e.target.closest("[data-approval]");if(approval){const item=state.approvals.find(a=>a.id===approval.dataset.approval);if(item){item.status=approval.dataset.decision;item.reviewedAt=new Date().toISOString();save();toast(item.status==="approved"?"Approved. You can now move this task forward. Nothing was sent automatically.":"Declined. The task stays paused.")}return}
    const filter=e.target.closest("[data-task-filter]");if(filter){activeTaskFilter=filter.dataset.taskFilter;$$("[data-task-filter]").forEach(b=>{const on=b===filter;b.classList.toggle("selected",on);b.setAttribute("aria-pressed",String(on))});renderTasks();return}
    const readPage=e.target.closest("#read-page");if(readPage){const view=$(".view.active");speak(view?view.innerText:"");return}
    if(e.target.closest("#stop-reading")){stopSpeaking();return}
    const run=e.target.closest("[data-run-workflow]");if(run){window.AICC_ASSIST?.runWorkflow(run.dataset.runWorkflow);return}
    if(e.target.closest("#agent-more")){agentLimit+=120;renderAgents();return}
    if(e.target.closest("#org-toggle")){const c=$("#org-chart");c.hidden=!c.hidden;$("#org-toggle").setAttribute("aria-expanded",String(!c.hidden));$("#org-toggle").textContent=c.hidden?"Show team chart":"Hide team chart";renderOrgChart();return}
  });
  $("#agent-form").addEventListener("submit",e=>{
    e.preventDefault();
    const existing=state.agents.find(a=>a.id===$("#agent-id").value);
    const agentId=existing?.id||id("agent");
    let boss=$("#agent-reports-to").value;
    if(boss&&wouldCreateLoop(agentId,boss)){toast("That would make a loop (an agent reporting to someone who reports to them). Choose a different manager.");return}
    const data={id:agentId,name:$("#agent-name").value.trim(),role:$("#agent-role").value.trim(),department:$("#agent-department").value,reportsTo:boss,instructions:$("#agent-instructions").value.trim(),permission:$("#agent-permission").value};
    if(!data.name||!data.role){toast("Please give the agent a name and a job.");return}
    if(!existing){
      const twin=state.agents.find(a=>a.name.toLowerCase()===data.name.toLowerCase()||a.role.toLowerCase()===data.role.toLowerCase());
      if(twin&&!confirm("Memory check: you already have an agent called \""+twin.name+"\" ("+twin.role+")"+(twin.createdAt?", made on "+new Date(twin.createdAt).toLocaleDateString():"")+".\n\nPress OK to make a new one anyway, or Cancel to keep using the one you have.")){closeDialog("agent-dialog");showView("agents");$("#agent-search").value=twin.name;agentLimit=60;renderAgents();toast("Here is the agent you already have.");return}
    }
    if(existing)Object.assign(existing,data);else state.agents.push({...data,createdAt:new Date().toISOString()});
    save();closeDialog("agent-dialog");toast(existing?"Agent updated.":"Your new agent is ready.");showView("agents");
  });
  $("#task-form").addEventListener("submit",e=>{e.preventDefault();const title=$("#task-title").value.trim();if(!title){toast("Please give the task a title.");return}createTask(title,$("#task-details").value.trim(),$("#task-agent").value,$("#task-priority").value,{breakDown:$("#task-breakdown").checked});closeDialog("task-dialog");$("#task-form").reset();$("#task-breakdown").checked=true});
  $("#workflow-form").addEventListener("submit",e=>{
    e.preventDefault();
    const objective=$("#workflow-objective").value.trim(),kind=$("#workflow-template").value;
    if(!objective){toast("Describe what you are trying to accomplish.");return}
    const plans={
      general:[["Clarify the goal and success criteria","executive"],["Gather information and requirements","research"],["Prepare the first deliverable","admin"],["Review the result and identify next steps","executive"]],
      research:[["Define the research question and scope","research"],["Gather relevant sources and evidence","research"],["Check source quality and record uncertainties","research"],["Prepare an easy-to-understand findings report","admin"]],
      business:[["Clarify the business idea, audience, and goals","executive"],["Research the market and competitors","research"],["Outline operations and required resources","admin"],["Prepare a financial information checklist","finance"],["Review the plan and next decisions","executive"]],
      marketing:[["Define the audience, offer, and campaign goal","marketing"],["Research audience needs and competing messages","research"],["Prepare campaign messaging and content ideas","marketing"],["Create a launch checklist and measurement plan","admin"]],
      software:[["Document the user problem and requirements","technology"],["Research technical options and constraints","research"],["Create an implementation plan","technology"],["Prepare accessibility and quality checks","admin"],["Review milestones and release readiness","executive"]]
    };
    const workflowId=id("workflow"),title=objective.length>65?objective.slice(0,62)+"…":objective;
    state.workflows.unshift({id:workflowId,title,objective,template:kind,createdAt:new Date().toISOString()});
    (plans[kind]||plans.general).forEach(([step,dept],i)=>{
      const agent=state.agents.find(x=>x.department===dept)||state.agents.find(x=>x.id==="agent-executive")||state.agents[0]||null;
      const t=addTask({title:step,details:"Part of workflow: "+title,agent:agent?.id||"",workflowId,steps:breakDown(step)});t.order=i;
    });
    save();closeDialog("workflow-dialog");$("#workflow-form").reset();toast("Team plan created. Review the assignments before work begins.");showView("workflows");
  });
  $("#department-form").addEventListener("submit",e=>{e.preventDefault();const name=$("#department-name").value.trim();if(!name){toast("Please name the department.");return}state.departments.push({id:id("dept"),name,purpose:$("#department-purpose").value.trim(),icon:"▦"});save();closeDialog("department-dialog");$("#department-form").reset();toast("Department created.");showView("departments")});
  $("#command-form").addEventListener("submit",e=>{e.preventDefault();const text=$("#command-input").value.trim();if(!text){toast("Tell us what you need help with first.");$("#command-input").focus();return}createTask(text,"Created from your executive assistant request.","agent-executive","normal",{breakDown:true});$("#command-input").value=""});
  $("#agent-search").addEventListener("input",()=>{agentLimit=60;renderAgents()});$("#agent-department-filter").addEventListener("change",()=>{agentLimit=60;renderAgents()});
  $("#task-board").addEventListener("change",e=>{
    const statusId=e.target.dataset.taskStatus;
    if(statusId){const task=state.tasks.find(t=>t.id===statusId);if(task){if(setTaskStatus(task,e.target.value)){save();toast("Task status updated.")}else render()}return}
    const stepTask=e.target.dataset.stepTask;
    if(stepTask){const task=state.tasks.find(t=>t.id===stepTask),step=task?.steps.find(s=>s.id===e.target.dataset.step);if(step){step.done=e.target.checked;if(task.steps.every(s=>s.done)&&!pendingApprovalFor(task.id)){task.status="done";toast("Every step is done. Task completed — well done.")}else if(step.done&&task.status==="todo"){task.status="inprogress"}save()}}
  });
  const settingInputs={"high-contrast":"highContrast","reduce-motion":"reduceMotion","simple-mode":"simpleMode"};
  Object.entries(settingInputs).forEach(([elId,key])=>$("#"+elId).addEventListener("change",e=>{state.settings[key]=e.target.checked;save()}));
  $("#font-scale").addEventListener("change",e=>{state.settings.fontScale=Number(e.target.value)||100;save()});
  $("#spacing").addEventListener("change",e=>{state.settings.spacing=e.target.value;save()});
  $("#theme").addEventListener("change",e=>{state.settings.theme=e.target.value;save()});
  $("#read-rate").addEventListener("change",e=>{state.settings.readRate=Number(e.target.value)||0.9;save();speak("This is how fast I will read to you.")});
  $("#reset-settings").addEventListener("click",()=>{state.settings={...defaultSettings};save();toast("Display settings are back to normal.")});
  $("#menu-toggle").addEventListener("click",()=>{const open=$("#sidebar").classList.toggle("open");$("#menu-toggle").setAttribute("aria-expanded",String(open))});
  $("#export-data").addEventListener("click",downloadBackup);
  $("#import-data").addEventListener("change",async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      if(file.size>10*1024*1024)throw new Error("Backup file is larger than 10 MB.");
      const parsed=JSON.parse(await file.text());
      const candidate=parsed?.format==="aicc-workspace-backup"?parsed.workspace:parsed;
      if(!validBackup(candidate))throw new Error("This file is not a valid AI Command Center workspace backup.");
      if(!confirm("Replace the workspace on this device with the backup? Download a backup of the current workspace first if you want to keep it."))return;
      const previous=state;state=normalize(candidate);
      if(!save()){state=previous;render();throw new Error("The restored workspace could not be saved. Your current workspace has been kept.");}
      toast("Workspace restored successfully.");
    }catch(error){console.error("Backup import failed",error);toast(error.message||"Could not read this backup file.");}
    finally{event.target.value="";}
  });
  $("#voice-button").addEventListener("click",e=>listen($("#command-input"),e.currentTarget));
  $("#task-voice").addEventListener("click",e=>listen($("#task-title"),e.currentTarget));
  // Keep data in sync if the workspace is open in two tabs.
  window.addEventListener("storage",e=>{if(e.key===KEY&&e.newValue){try{state=normalize(JSON.parse(e.newValue));render()}catch{}}});

  window.AICC={
    getState:()=>state,save,persist,render,showView,toast,createTask,addTask,breakDown,requestApprovalIfNeeded,pendingApprovalFor,setTaskStatus,
    agentName,departmentName,id,esc:escapeHtml,speak,stopSpeaking,listen,openDialog,closeDialog,downloadFile,
    onRender:fn=>{renderHooks.push(fn);try{fn(state)}catch(error){console.error(error)}}
  };
  render();
})();

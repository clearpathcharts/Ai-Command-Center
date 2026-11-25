(() => {
  "use strict";
  const KEY = "accessible-ai-command-center-v1";
  const defaultDepartments = [
    {id:"research",name:"Research",purpose:"Find information, compare sources, and prepare reports.",icon:"⌕"},
    {id:"admin",name:"Administration",purpose:"Organize documents, schedules, and everyday work.",icon:"▤"},
    {id:"marketing",name:"Marketing",purpose:"Plan campaigns, content, and communications.",icon:"✧"},
    {id:"technology",name:"Technology",purpose:"Plan software, troubleshoot, and build digital tools.",icon:"⌘"},
    {id:"personal",name:"Personal Assistance",purpose:"Break down goals and make daily tasks easier.",icon:"♡"},
    {id:"finance",name:"Finance",purpose:"Organize financial information and prepare analysis for review.",icon:"＄"}
  ];
  const starterAgents = [
    {id:"agent-executive",name:"Executive Assistant",role:"Task coordinator",department:"personal",instructions:"Help clarify requests, break work into manageable tasks, and coordinate the user's workforce.",permission:"approval"},
    {id:"agent-research",name:"Research Specialist",role:"Research and source review",department:"research",instructions:"Prepare research plans, organize source links, and summarize evidence without inventing facts.",permission:"prepare"},
    {id:"agent-organizer",name:"Organization Assistant",role:"Documents and planning",department:"admin",instructions:"Turn complex work into clear, small steps and organize the user's task list.",permission:"prepare"}
  ];
  const initial = {departments:defaultDepartments,agents:starterAgents,tasks:[],approvals:[],settings:{largeText:false,highContrast:false,reduceMotion:false,simpleMode:false}};
  let state = loadState();
  let activeTaskFilter = "all";
  let toastTimer;
  const $ = (s,root=document) => root.querySelector(s);
  const $$ = (s,root=document) => [...root.querySelectorAll(s)];
  function loadState(){try{const saved=JSON.parse(localStorage.getItem(KEY));return saved?{...initial,...saved,settings:{...initial.settings,...saved.settings}}:structuredClone(initial)}catch{return structuredClone(initial)}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state));render()}
  function id(prefix){return prefix+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7)}
  function escapeHtml(value=""){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function toast(message){const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),3000)}
  function departmentName(key){return state.departments.find(d=>d.id===key)?.name||"Unassigned"}
  function agentName(key){return state.agents.find(a=>a.id===key)?.name||"Unassigned"}
  function showView(name){$$(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+name));$$(".nav-link[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===name));$("#breadcrumb-current").textContent=({overview:"Overview",agents:"My AI Agents",departments:"Departments",tasks:"Tasks & Projects",approvals:"Approval Center",intelligence:"Intelligence Engine",settings:"Accessibility & Settings"})[name]||"Overview";$("#sidebar").classList.remove("open");window.scrollTo({top:0,behavior:"smooth"})}
  function empty(title,detail){return '<div class="empty-state"><strong>'+escapeHtml(title)+'</strong>'+escapeHtml(detail)+'</div>'}
  function render(){
    $("#stat-agents").textContent=state.agents.length;$("#stat-departments").textContent=state.departments.length;$("#stat-tasks").textContent=state.tasks.filter(t=>t.status!=="done").length;$("#stat-approvals").textContent=state.approvals.filter(a=>a.status==="pending").length;
    $("#nav-agent-count").textContent=state.agents.length;$("#nav-approval-count").textContent=state.approvals.filter(a=>a.status==="pending").length;
    $("#today-label").textContent=new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric"}).format(new Date()).toUpperCase();
    $("#overview-tasks").innerHTML=state.tasks.filter(t=>t.status!=="done").slice(0,5).map(t=>'<div class="mini-task"><span class="task-dot"></span><div class="task-main"><strong>'+escapeHtml(t.title)+'</strong><small>'+escapeHtml(agentName(t.agent))+' · '+escapeHtml(t.status==="inprogress"?"In progress":"To do")+'</small></div><span class="status '+t.status+'">'+(t.status==="inprogress"?"Active":"Open")+'</span></div>').join("")||empty("No active tasks yet","Create a task and assign it to an agent.");
    $("#overview-departments").innerHTML=state.departments.slice(0,6).map(d=>'<div class="mini-department"><div class="dept-icon">'+escapeHtml(d.icon||"▦")+'</div><div class="dept-main"><strong>'+escapeHtml(d.name)+'</strong><small>'+state.agents.filter(a=>a.department===d.id).length+' agents</small></div></div>').join("");
    const deptOptions=state.departments.map(d=>'<option value="'+escapeHtml(d.id)+'">'+escapeHtml(d.name)+'</option>').join("");
    $("#agent-department").innerHTML=deptOptions;$("#agent-department-filter").innerHTML='<option value="">All departments</option>'+deptOptions;
    $("#task-agent").innerHTML='<option value="">Leave unassigned</option>'+state.agents.map(a=>'<option value="'+escapeHtml(a.id)+'">'+escapeHtml(a.name)+'</option>').join("");
    renderAgents();renderDepartments();renderTasks();renderApprovals();applySettings();
  }
  function renderAgents(){
    const q=($("#agent-search")?.value||"").toLowerCase(),dept=$("#agent-department-filter")?.value||"";
    const list=state.agents.filter(a=>(!dept||a.department===dept)&&[a.name,a.role,a.instructions].join(" ").toLowerCase().includes(q));
    $("#agent-grid").innerHTML=list.map(a=>'<article class="agent-card"><div class="agent-top"><div class="agent-avatar">✦</div><div><strong>'+escapeHtml(a.name)+'</strong><small>'+escapeHtml(a.role)+'</small></div></div><p>'+escapeHtml(a.instructions||"No additional instructions yet.")+'</p><div class="card-meta"><span class="pill">'+escapeHtml(departmentName(a.department))+'</span><div class="card-actions"><button class="mini-button" data-edit-agent="'+escapeHtml(a.id)+'">Edit</button><button class="mini-button" data-delete-agent="'+escapeHtml(a.id)+'">Delete</button></div></div></article>').join("")||empty("No agents match","Create an agent or change your search.");
  }
  function renderDepartments(){
    $("#department-grid").innerHTML=state.departments.map(d=>'<article class="department-card"><div class="dept-icon">'+escapeHtml(d.icon||"▦")+'</div><h3>'+escapeHtml(d.name)+'</h3><p>'+escapeHtml(d.purpose||"A team in your AI workforce.")+'</p><div class="dept-count">'+state.agents.filter(a=>a.department===d.id).length+' <span style="font-size:12px;color:var(--muted)">agents</span></div><div class="card-meta"><span class="pill">Department</span><button class="mini-button" data-delete-department="'+escapeHtml(d.id)+'">Remove</button></div></article>').join("")||empty("No departments yet","Add a department to organize your agents.");
  }
  function renderTasks(){
    const list=state.tasks.filter(t=>activeTaskFilter==="all"||t.status===activeTaskFilter);
    $("#task-board").innerHTML=list.map(t=>'<article class="task-row"><div class="task-row-main"><h3>'+escapeHtml(t.title)+'</h3><p>'+escapeHtml(t.details||"No extra details")+' · '+escapeHtml(agentName(t.agent))+' · '+escapeHtml(t.priority)+' priority</p></div><span class="status '+t.status+'">'+({todo:"To do",inprogress:"In progress",done:"Completed"}[t.status])+'</span><select aria-label="Change status for '+escapeHtml(t.title)+'" data-task-status="'+escapeHtml(t.id)+'"><option value="todo" '+(t.status==="todo"?"selected":"")+'>To do</option><option value="inprogress" '+(t.status==="inprogress"?"selected":"")+'>In progress</option><option value="done" '+(t.status==="done"?"selected":"")+'>Completed</option></select><button class="mini-button" data-delete-task="'+escapeHtml(t.id)+'">Delete</button></article>').join("")||empty("Nothing here yet","Create a task to get your work moving.");
  }
  function renderApprovals(){
    const list=state.approvals.filter(a=>a.status==="pending");
    $("#approval-list").innerHTML=list.map(a=>'<article class="approval-card"><span class="pill">AWAITING YOUR DECISION</span><h3>'+escapeHtml(a.title)+'</h3><p>'+escapeHtml(a.description)+'</p><p>Requested by '+escapeHtml(agentName(a.agent))+'</p><div class="approval-actions"><button class="primary-button" data-approval="'+escapeHtml(a.id)+'" data-decision="approved">Approve</button><button class="danger-button" data-approval="'+escapeHtml(a.id)+'" data-decision="rejected">Decline</button></div></article>').join("")||empty("No approvals waiting","When an agent requests approval for a consequential action, it will appear here.");
  }
  function applySettings(){const s=state.settings;document.body.classList.toggle("large-text",!!s.largeText);document.body.classList.toggle("high-contrast",!!s.highContrast);document.body.classList.toggle("reduce-motion",!!s.reduceMotion);document.body.classList.toggle("simple-mode",!!s.simpleMode);for(const k of Object.keys(s)){const el=$("#"+k.replace(/[A-Z]/g,m=>"-"+m.toLowerCase()));if(el)el.checked=!!s[k]}}
  function openDialog(name){const el=$("#"+name);if(el.showModal)el.showModal();else el.setAttribute("open","")}
  function closeDialog(name){const el=$("#"+name);if(el.close)el.close();else el.removeAttribute("open")}
  function createTask(title,details="",agent="",priority="normal"){state.tasks.unshift({id:id("task"),title,details,agent,priority,status:"todo",createdAt:new Date().toISOString()});save();toast("Task added to your workspace.");showView("tasks")}
  function startAgentEdit(agent){$("#agent-modal-title").textContent=agent?"Edit your AI agent":"Create your AI agent";$("#agent-id").value=agent?.id||"";$("#agent-name").value=agent?.name||"";$("#agent-role").value=agent?.role||"";$("#agent-department").value=agent?.department||state.departments[0]?.id||"";$("#agent-instructions").value=agent?.instructions||"";$("#agent-permission").value=agent?.permission||"approval";openDialog("agent-dialog")}
  document.addEventListener("click",e=>{
    const nav=e.target.closest("[data-view]");if(nav){showView(nav.dataset.view);return}
    const link=e.target.closest("[data-view-link]");if(link){showView(link.dataset.viewLink);return}
    const action=e.target.closest("[data-action]")?.dataset.action;
    if(action==="new-agent"){startAgentEdit(null);return}
    if(action==="new-task"){openDialog("task-dialog");return}
    if(action==="new-department"){openDialog("department-dialog");return}
    if(action==="research-task"){createTask("Research request","Collect useful sources and prepare a summary.");return}
    if(action==="verification-task"){createTask("Verify sources and claims","Record sources, dates, evidence, and open questions.");return}
    if(action==="risk-task"){createTask("Review potential risk signals","Collect evidence and warning signs for human review.");return}
    const close=e.target.closest("[data-close]");if(close){closeDialog(close.dataset.close);return}
    const prompt=e.target.closest("[data-prompt]");if(prompt){$("#command-input").value=prompt.dataset.prompt;$("#command-input").focus();return}
    const edit=e.target.closest("[data-edit-agent]");if(edit){startAgentEdit(state.agents.find(a=>a.id===edit.dataset.editAgent));return}
    const delAgent=e.target.closest("[data-delete-agent]");if(delAgent){const a=state.agents.find(x=>x.id===delAgent.dataset.deleteAgent);if(a&&confirm("Delete "+a.name+"? Existing tasks will become unassigned.")){state.agents=state.agents.filter(x=>x.id!==a.id);state.tasks.forEach(t=>{if(t.agent===a.id)t.agent=""});save();toast("Agent deleted.")}return}
    const delDept=e.target.closest("[data-delete-department]");if(delDept){const d=state.departments.find(x=>x.id===delDept.dataset.deleteDepartment);if(d&&confirm("Remove "+d.name+"? Agents in this department will become unassigned.")){state.departments=state.departments.filter(x=>x.id!==d.id);state.agents.forEach(a=>{if(a.department===d.id)a.department=""});save();toast("Department removed.")}return}
    const delTask=e.target.closest("[data-delete-task]");if(delTask){state.tasks=state.tasks.filter(t=>t.id!==delTask.dataset.deleteTask);save();toast("Task deleted.");return}
    const approval=e.target.closest("[data-approval]");if(approval){const item=state.approvals.find(a=>a.id===approval.dataset.approval);if(item){item.status=approval.dataset.decision;item.reviewedAt=new Date().toISOString();save();toast(item.status==="approved"?"Approval recorded. No external action was executed.":"Request declined.")}return}
    const filter=e.target.closest("[data-task-filter]");if(filter){activeTaskFilter=filter.dataset.taskFilter;$$("[data-task-filter]").forEach(b=>b.classList.toggle("selected",b===filter));renderTasks()}
  });
  $("#agent-form").addEventListener("submit",e=>{e.preventDefault();const existing=state.agents.find(a=>a.id===$("#agent-id").value);const data={id:existing?.id||id("agent"),name:$("#agent-name").value.trim(),role:$("#agent-role").value.trim(),department:$("#agent-department").value,instructions:$("#agent-instructions").value.trim(),permission:$("#agent-permission").value};if(existing)Object.assign(existing,data);else state.agents.push(data);save();closeDialog("agent-dialog");toast(existing?"Agent updated.":"Your new agent is ready to organize work.");showView("agents")});
  $("#task-form").addEventListener("submit",e=>{e.preventDefault();createTask($("#task-title").value.trim(),$("#task-details").value.trim(),$("#task-agent").value,$("#task-priority").value);closeDialog("task-dialog");$("#task-form").reset()});
  $("#department-form").addEventListener("submit",e=>{e.preventDefault();state.departments.push({id:id("dept"),name:$("#department-name").value.trim(),purpose:$("#department-purpose").value.trim(),icon:"▦"});save();closeDialog("department-dialog");$("#department-form").reset();toast("Department created.");showView("departments")});
  $("#command-form").addEventListener("submit",e=>{e.preventDefault();const text=$("#command-input").value.trim();if(!text){toast("Tell us what you need help with first.");$("#command-input").focus();return}createTask(text,"Created from your executive assistant request.");$("#command-input").value=""});
  $("#agent-search").addEventListener("input",renderAgents);$("#agent-department-filter").addEventListener("change",renderAgents);
  $("#task-board").addEventListener("change",e=>{const id=e.target.dataset.taskStatus;if(!id)return;const task=state.tasks.find(t=>t.id===id);if(task){task.status=e.target.value;save();toast("Task status updated.")}});
  ["largeText","highContrast","reduceMotion","simpleMode"].forEach(k=>{$("#"+k.replace(/[A-Z]/g,m=>"-"+m.toLowerCase())).addEventListener("change",e=>{state.settings[k]=e.target.checked;save()})});
  $("#focus-toggle").addEventListener("click",()=>{const on=document.body.classList.toggle("focus-mode");$("#focus-toggle").setAttribute("aria-pressed",String(on));$("#focus-toggle").textContent=on?"◉ Exit focus mode":"◉ Focus mode"});
  $("#menu-toggle").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
  $("#rescue-button").addEventListener("click",()=>openDialog("rescue-dialog"));
  $("#export-data").addEventListener("click",()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="ai-command-center-workspace.json";a.click();URL.revokeObjectURL(url);toast("Workspace export prepared.")});
  $("#voice-button").addEventListener("click",()=>{const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SpeechRecognition){toast("Voice input is not supported in this browser. You can still type your request.");return}const rec=new SpeechRecognition();rec.lang=navigator.language||"en-US";rec.interimResults=false;rec.onresult=e=>{$("#command-input").value+=($("#command-input").value?" ":"")+e.results[0][0].transcript;$("#command-input").focus()};rec.onerror=()=>toast("Voice input could not start. Please try typing instead.");rec.start()});
  $("#rescue-dialog").addEventListener("click",e=>{if(e.target===e.currentTarget)closeDialog("rescue-dialog")});
  render();
})();
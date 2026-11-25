/*
 * Assist — Rescue Mode and Focus Mode.
 *
 * Rescue Mode (one button, always visible):
 *   1. stops showing everything that is not needed,
 *   2. explains what is happening in plain language,
 *   3. shows ONE next action,
 *   4. offers to hand the rest of the work to an AI agent.
 *
 * Focus Mode shows only the current task and its steps.
 */
(() => {
  "use strict";
  const A = window.AICC;
  if (!A) { console.error("Assist needs app.js to load first."); return; }
  const $ = s => document.querySelector(s);
  const esc = A.esc;
  const PRIORITY = {high:0,normal:1,low:2};
  let skipped = new Set();
  let workflowFocus = "";

  /* Picks the single most useful next thing to do. */
  function nextAction(){
    const s=A.getState();
    if(workflowFocus&&!s.workflows.some(w=>w.id===workflowFocus))workflowFocus="";
    const open=s.tasks.filter(t=>t.status!=="done"&&!t.handedOff&&!skipped.has(t.id)&&(!workflowFocus||t.workflowId===workflowFocus));
    const ready=open.filter(t=>!A.pendingApprovalFor(t.id));
    const order=workflowFocus?(a,b)=>(a.order??0)-(b.order??0):(a,b)=>(a.status==="inprogress"?0:1)-(b.status==="inprogress"?0:1)||(PRIORITY[a.priority]??1)-(PRIORITY[b.priority]??1)||(a.workflowId&&a.workflowId===b.workflowId?(a.order??0)-(b.order??0):0)||new Date(a.createdAt)-new Date(b.createdAt);
    const task=ready.sort(order)[0];
    if(task){
      if(!task.steps.length){task.steps=A.breakDown(task.title+" "+(task.details||""));A.persist()}
      return {kind:"task",task,step:task.steps.find(x=>!x.done)||null};
    }
    const approval=s.approvals.find(a=>a.status==="pending");
    if(approval)return {kind:"approval",approval};
    return {kind:"none"};
  }
  function situation(){
    const s=A.getState();
    const open=s.tasks.filter(t=>t.status!=="done").length;
    const waiting=s.approvals.filter(a=>a.status==="pending").length;
    const handed=s.tasks.filter(t=>t.handedOff&&t.status!=="done").length;
    const parts=[];
    parts.push(open?"You have "+open+" unfinished task"+(open>1?"s":"")+". That is okay. You only need to do one small thing right now.":"You have no unfinished tasks right now.");
    if(waiting)parts.push(waiting+" thing"+(waiting>1?"s are":" is")+" waiting for your yes or no. Nothing gets sent, paid, or published without you.");
    if(handed)parts.push(handed+" task"+(handed>1?"s have":" has")+" been handed to your agents, so you don't need to hold "+(handed>1?"them":"it")+" in your head.");
    parts.push("Everything is saved on this device. You cannot lose your work by stopping.");
    return parts.join(" ");
  }

  /* ---------- Rescue Mode ---------- */
  function renderRescue(message){
    const root=$("#rescue-body");if(!root)return;
    const n=nextAction();
    let action="";
    if(n.kind==="task"){
      const stepText=n.step?n.step.text:"Mark this task as finished";
      const pos=n.step?(n.task.steps.indexOf(n.step)+1)+" of "+n.task.steps.length:"";
      action='<div class="rescue-next"><span class="eyebrow">YOUR ONE NEXT STEP</span><h3 id="rescue-step">'+esc(stepText)+'</h3><p>Part of: <b>'+esc(n.task.title)+'</b>'+(pos?' · step '+pos:'')+'</p></div>'
        +'<div class="rescue-actions"><button class="primary-button big" id="rescue-done">✓ I did this step</button><button class="secondary-button big" id="rescue-smaller">Make it smaller</button><button class="secondary-button big" id="rescue-handoff">Let an AI agent take the rest</button><button class="quiet-button big" id="rescue-skip">Not this one — show another</button></div>';
    }else if(n.kind==="approval"){
      action='<div class="rescue-next"><span class="eyebrow">YOUR ONE NEXT STEP</span><h3 id="rescue-step">Say yes or no to: '+esc(n.approval.title.replace(/^Approve: /,""))+'</h3><p>'+esc(n.approval.description)+'</p></div><div class="rescue-actions"><button class="primary-button big" data-rescue-approval="approved">Yes, approve</button><button class="danger-button big" data-rescue-approval="rejected">No, decline</button><button class="quiet-button big" id="rescue-later">Decide later</button></div>';
    }else{
      action='<div class="rescue-next"><span class="eyebrow">NOTHING IS WAITING</span><h3 id="rescue-step">What is the one thing on your mind?</h3><p>Say it or type it. I will turn it into small steps for you.</p><label class="sr-only" for="rescue-input">What is on your mind?</label><textarea id="rescue-input" rows="3" placeholder="Example: I need to pay my phone bill"></textarea></div><div class="rescue-actions"><button class="primary-button big" id="rescue-capture">Turn it into small steps</button><button class="secondary-button big" id="rescue-voice">🎙 Say it</button></div>';
    }
    root.innerHTML=(message?'<p class="rescue-message" role="status">'+esc(message)+'</p>':'')
      +'<p class="rescue-explain" id="rescue-explain">'+esc(situation())+'</p>'+action
      +'<div class="rescue-footer"><button class="quiet-button big" id="rescue-read">🔊 Read this to me</button><button class="quiet-button big" data-close="rescue-dialog">I feel better — close</button></div>';
    root.querySelector("#rescue-done,#rescue-capture,[data-rescue-approval]")?.focus();
  }
  function openRescue(){
    skipped=new Set();
    document.body.classList.add("rescue-active");
    A.openDialog("rescue-dialog");
    renderRescue();
  }
  function readRescue(){
    const step=$("#rescue-step")?.innerText||"";
    A.speak($("#rescue-explain")?.innerText+" Your one next step is: "+step+".");
  }
  function handOff(task){
    const s=A.getState();
    const agent=s.agents.find(a=>a.id===task.agent)||s.agents.find(a=>a.id==="agent-executive")||s.agents[0];
    if(!agent){A.toast("There are no agents yet. Create one first.");return null}
    task.agent=agent.id;task.handedOff=true;task.handedOffAt=new Date().toISOString();
    s.handoffs.push({id:A.id("handoff"),from:"You",to:agent.name,task:task.title,at:task.handedOffAt,kind:"HANDED OFF"});
    A.save();
    return agent;
  }
  $("#rescue-dialog")?.addEventListener("click",e=>{
    const n=nextAction();
    if(e.target.closest("#rescue-read")){readRescue();return}
    if(e.target.closest("#rescue-done")&&n.kind==="task"){
      if(n.step)n.step.done=true;
      if(n.task.steps.every(x=>x.done)){A.setTaskStatus(n.task,"done");A.save();renderRescue("Task finished: "+n.task.title+". Well done.")}
      else{if(n.task.status==="todo")n.task.status="inprogress";A.save();renderRescue("Good. That step is done.")}
      return;
    }
    if(e.target.closest("#rescue-smaller")&&n.kind==="task"&&n.step){
      const i=n.task.steps.indexOf(n.step);
      const tiny=[{id:A.id("step"),text:"Open or get out what you need for: "+n.step.text,done:false},{id:A.id("step"),text:"Spend just 2 minutes on: "+n.step.text,done:false},{id:A.id("step"),text:"Stop and check: is \""+n.step.text+"\" done? If not, do 2 more minutes",done:false}];
      n.task.steps.splice(i,1,...tiny);A.save();renderRescue("Okay. I made that step smaller.");
      return;
    }
    if(e.target.closest("#rescue-handoff")&&n.kind==="task"){
      const agent=handOff(n.task);
      if(agent)renderRescue("Done. "+agent.name+" now owns the rest of \""+n.task.title+"\". Honest note: no AI engine is connected yet, so the agent will not secretly do the work. The task is safely parked in "+agent.name+"'s queue and you do not need to think about it right now.");
      return;
    }
    if(e.target.closest("#rescue-skip")&&n.kind==="task"){skipped.add(n.task.id);renderRescue();return}
    if(e.target.closest("#rescue-later")){A.closeDialog("rescue-dialog");return}
    const ap=e.target.closest("[data-rescue-approval]");
    if(ap&&n.kind==="approval"){n.approval.status=ap.dataset.rescueApproval;n.approval.reviewedAt=new Date().toISOString();A.save();renderRescue(n.approval.status==="approved"?"Approved.":"Declined.");return}
    if(e.target.closest("#rescue-voice")){A.listen($("#rescue-input"),e.target.closest("#rescue-voice"));return}
    if(e.target.closest("#rescue-capture")){
      const text=$("#rescue-input").value.trim();
      if(!text){A.toast("Say or type one thing first.");return}
      A.createTask(text,"Captured in Rescue Mode.","agent-executive","normal",{breakDown:true,show:false});
      renderRescue("Saved. Here is the first small step.");
    }
  });
  $("#rescue-dialog")?.addEventListener("close",()=>{document.body.classList.remove("rescue-active");A.stopSpeaking()});
  document.querySelectorAll("[data-rescue-open]").forEach(b=>b.addEventListener("click",openRescue));

  /* ---------- Focus Mode ---------- */
  function renderFocus(){
    const root=$("#focus-panel");if(!root||!document.body.classList.contains("focus-mode"))return;
    const n=nextAction();
    if(n.kind!=="task"&&workflowFocus){
      const w=A.getState().workflows.find(x=>x.id===workflowFocus);
      const waiting=A.getState().tasks.some(t=>t.workflowId===workflowFocus&&t.status!=="done"&&A.pendingApprovalFor(t.id));
      root.innerHTML='<div class="focus-card"><span class="eyebrow">WORKFLOW</span><h1 tabindex="-1">'+(waiting?"The next step is waiting for your approval.":"Workflow finished!")+'</h1><p>'+esc(w?w.title:"")+'</p>'+(waiting?'<button class="primary-button big" data-view-link="approvals" id="focus-to-approvals">Open the Approval Center</button> ':'')+'<button class="quiet-button big" id="focus-exit-inline">Exit focus mode</button></div>';
      return;
    }
    if(n.kind!=="task"){
      root.innerHTML='<div class="focus-card"><span class="eyebrow">FOCUS MODE</span><h1 tabindex="-1">Nothing to focus on right now.</h1><p>'+(n.kind==="approval"?"One item is waiting for your approval.":"You have no open tasks.")+'</p><button class="primary-button big" id="focus-exit-inline">Exit focus mode</button></div>';
      return;
    }
    const t=n.task,done=t.steps.filter(x=>x.done).length;
    root.innerHTML='<div class="focus-card"><span class="eyebrow">'+(workflowFocus?"RUNNING WORKFLOW · STEP "+((t.order??0)+1):"FOCUS MODE · ONE TASK ONLY")+'</span><h1 tabindex="-1">'+esc(t.title)+'</h1>'+(t.details?'<p>'+esc(t.details)+'</p>':'')
      +'<div class="progress-track"><span style="width:'+(t.steps.length?Math.round(done/t.steps.length*100):0)+'%"></span></div><p class="focus-progress">'+done+' of '+t.steps.length+' steps done</p>'
      +'<ol class="focus-steps">'+t.steps.map(x=>'<li class="'+(x.done?"done":x===n.step?"current":"")+'">'+(x===n.step?'<strong>'+esc(x.text)+'</strong>':esc(x.text))+'</li>').join("")+'</ol>'
      +'<div class="rescue-actions"><button class="primary-button big" id="focus-step-done">✓ Done with this step</button><button class="quiet-button big" id="focus-read">🔊 Read to me</button><button class="quiet-button big" id="focus-skip">Show a different task</button></div></div>';
  }
  function setFocus(on){
    document.body.classList.toggle("focus-mode",on);
    const btn=$("#focus-toggle");btn.setAttribute("aria-pressed",String(on));btn.textContent=on?"◉ Exit focus mode":"◉ Focus mode";
    if(on){skipped=new Set();renderFocus();$("#focus-panel h1")?.focus()}else{workflowFocus="";A.render()}
  }
  $("#focus-toggle")?.addEventListener("click",()=>setFocus(!document.body.classList.contains("focus-mode")));
  $("#focus-panel")?.addEventListener("click",e=>{
    const n=nextAction();
    if(e.target.closest("#focus-exit-inline,#focus-to-approvals")){setFocus(false);return}
    if(e.target.closest("#focus-read")&&n.kind==="task"){A.speak(n.task.title+". Your current step is: "+(n.step?n.step.text:"mark this task as finished"));return}
    if(e.target.closest("#focus-skip")&&n.kind==="task"){skipped.add(n.task.id);renderFocus();return}
    if(e.target.closest("#focus-step-done")&&n.kind==="task"){
      if(n.step)n.step.done=true;
      if(n.task.steps.every(x=>x.done)){A.setTaskStatus(n.task,"done");A.toast("Task finished. Here is the next one.")}
      else if(n.task.status==="todo")n.task.status="inprogress";
      A.save();
    }
  });

  A.onRender(renderFocus);
  function runWorkflow(id){workflowFocus=id;setFocus(true)}
  window.AICC_ASSIST={openRescue,nextAction,setFocus,runWorkflow};
})();

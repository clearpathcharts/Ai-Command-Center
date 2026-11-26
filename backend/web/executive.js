/*
 * Executive Brain — turns one goal into a coordinated team plan.
 * If a step needs a specialist the user does not have yet, the plan says so and
 * the Executive Brain creates that agent (through the Agent Creator Brain) when
 * the user approves. Everything is saved through window.AICC.
 */
(() => {
  "use strict";
  const A = window.AICC;
  if (!A) { console.error("Executive Brain needs app.js to load first."); return; }
  const $ = s => document.querySelector(s);
  const esc = A.esc;
  let proposed = null;

  function chooseAgent(s,dept,terms){
    const text=a=>(a.name+" "+a.role+" "+a.instructions).toLowerCase();
    const byDept=s.agents.filter(a=>a.department===dept);
    const best=byDept.find(a=>terms.some(t=>text(a).includes(t)));
    return best||byDept[0]||null;
  }
  function buildPlan(goal,s){
    const q=goal.toLowerCase(),steps=[];
    const add=(title,dept,terms,description)=>{
      if(steps.some(x=>x.title===title))return;
      const agent=chooseAgent(s,dept,terms);
      const newSpecialist=agent?null:window.AICC_BRAIN?.templateForDepartment(dept,goal);
      steps.push({title,department:dept,agent,newSpecialist,description});
    };
    add("Clarify the goal and define what success looks like","executive",["executive","assistant","coordinat"],"Turn the request into clear outcomes and limits.");
    if(/research|market|competitor|compare|investigat|source|find out|business|startup|launch/.test(q))add("Research the topic and collect relevant evidence","research",["research","analyst"],"Gather information and keep verified facts separate from open questions.");
    if(/scam|fraud|suspicious|legit|trust/.test(q))add("Check for scam and fraud warning signs","research",["scam","fraud","risk"],"List warning signs in plain words. Warning signs are not proof.");
    if(/website|software|app|code|technical|platform/.test(q))add("Prepare the technical requirements and build plan","technology",["developer","technology","software"],"Break the technical work into small, checkable milestones.");
    if(/business|company|startup|operations|launch|llc/.test(q))add("Organize business requirements and day-to-day operations","admin",["business","operations","planning"],"List the resources, dependencies, and decisions needed.");
    if(/money|budget|financial|cost|revenue|invoice|pricing|business|startup/.test(q))add("Prepare the money and cost checklist","finance",["finance","budget"],"Organize the numbers and assumptions for your review.");
    if(/marketing|campaign|advertis|social|brand|content|launch|business|customers/.test(q))add("Prepare the marketing plan and content outline","marketing",["marketing","content","social"],"Draft messaging and a campaign outline. Nothing is published or paid for without approval.");
    if(/email|letter|message|communicat|customer|client/.test(q))add("Draft the needed messages for approval","personal",["communication","writing"],"Draft messages. Nothing is sent without your approval.");
    if(/document|paperwork|form|record|contract|policy|appointment/.test(q))add("Organize the documents and review checklist","admin",["document","paperwork","appointment"],"Find needed documents and missing information. Nothing is signed or submitted.");
    add("Review the results and choose the next decisions","executive",["executive","assistant","coordinat"],"Check everything is complete, note open questions, and ask for your approval.");
    return steps.slice(0,9);
  }
  function stepOwner(x){return x.agent?x.agent.name:x.newSpecialist?x.newSpecialist.name+" (new agent will be created)":"Executive Assistant"}

  function renderHandoffs(){
    const root=$("#executive-handoff-log");if(!root)return;
    const log=A.getState().handoffs.slice().sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,12);
    root.innerHTML=log.map(x=>'<div class="handoff-row"><div class="handoff-icon">↗</div><div><strong>'+esc(x.from)+' → '+esc(x.to)+'</strong><small>'+esc(x.task)+' · '+new Date(x.at).toLocaleString()+'</small></div><span class="pill">'+esc(x.kind||"PLANNED")+'</span></div>').join("")||'<div class="resume-placeholder">No handoffs yet. When you approve a team plan, the handoffs between agents are listed here.</div>';
  }
  function renderPlan(){
    const root=$("#executive-plan-output");if(!root||!proposed)return;
    const s=A.getState();
    const newCount=proposed.steps.filter(x=>x.newSpecialist).length;
    root.innerHTML='<div class="notice-box">Review this plan. Approving it creates the tasks'+(newCount?' and '+newCount+' new specialist agent'+(newCount>1?"s":""):"")+'. Tasks that would send, pay, publish, or sign anything will also wait for your approval.</div><div class="executive-goal"><strong>Goal</strong><p>'+esc(proposed.goal)+'</p></div><div class="executive-steps">'+proposed.steps.map((x,i)=>'<article class="executive-step"><span class="executive-step-number">'+(i+1)+'</span><div class="executive-step-body"><strong>'+esc(x.title)+'</strong><p>'+esc(x.description)+'</p><small>'+esc(stepOwner(x))+' · '+esc(s.departments.find(d=>d.id===x.department)?.name||x.department)+'</small></div></article>').join("")+'</div><div class="brain-actions"><button class="primary-button" id="executive-approve">✓ Approve plan and create '+proposed.steps.length+' tasks</button><button class="quiet-button" id="executive-read">🔊 Read plan to me</button><button class="quiet-button" id="executive-discard">Discard plan</button></div>';
  }

  $("#executive-plan")?.addEventListener("click",()=>{
    const goal=$("#executive-request").value.trim();
    if(!goal){A.toast("Tell the Executive Brain what you want to accomplish.");$("#executive-request").focus();return}
    proposed={id:A.id("workflow"),goal,createdAt:new Date().toISOString(),steps:buildPlan(goal,A.getState())};
    renderPlan();
  });
  $("#executive-plan-output")?.addEventListener("click",e=>{
    if(e.target.closest("#executive-read")){A.speak($("#executive-plan-output").innerText.replace(/✓ Approve plan.*$/s,""));return}
    if(e.target.closest("#executive-open-workflows")){A.showView("workflows");return}
    if(e.target.closest("#executive-discard")){proposed=null;$("#executive-plan-output").innerHTML='<div class="resume-placeholder">Plan discarded. Your existing tasks were not changed.</div>';return}
    if(!e.target.closest("#executive-approve")||!proposed)return;
    const s=A.getState();
    const title=proposed.goal.length>65?proposed.goal.slice(0,62)+"…":proposed.goal;
    s.workflows.unshift({id:proposed.id,title,objective:proposed.goal,template:"executive-brain",createdAt:proposed.createdAt});
    let created=0;
    // Agents building agents: create the specialists the plan needs.
    proposed.steps.forEach(step=>{
      if(!step.agent&&step.newSpecialist&&window.AICC_BRAIN){const r=window.AICC_BRAIN.createAgent(step.newSpecialist);step.agent=r.agent;if(r.created)created++}
      if(!step.agent)step.agent=s.agents.find(a=>a.id==="agent-executive")||s.agents[0]||null;
    });
    proposed.steps.forEach((step,i)=>{
      const prior=i?proposed.steps[i-1].title:null;
      const t=A.addTask({title:step.title,details:step.description+(prior?" Starts after: "+prior+".":"")+" Created by the Executive Brain.",agent:step.agent?.id||"",workflowId:proposed.id,steps:A.breakDown(step.title,proposed.goal)});
      t.order=i;
      if(i)s.handoffs.push({id:A.id("handoff"),from:proposed.steps[i-1].agent?.name||"Previous step",to:step.agent?.name||"Next step",task:step.title,at:new Date().toISOString(),workflowId:proposed.id,kind:"PLANNED"});
    });
    A.save();
    proposed=null;
    $("#executive-plan-output").innerHTML='<div class="notice-box">Your team plan and tasks have been added'+(created?' and '+created+' new specialist agent'+(created>1?"s were":" was")+' created':"")+'. Each task is already broken into small steps.</div><button class="primary-button" id="executive-open-workflows">Open team workflows</button>';
    A.toast("Team plan created. Review the tasks in Team Workflows.");
  });
  $("#executive-voice")?.addEventListener("click",e=>A.listen($("#executive-request"),e.currentTarget));

  A.onRender(renderHandoffs);
})();

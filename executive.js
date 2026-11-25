(() => {
  "use strict";
  const $=s=>document.querySelector(s),KEY="accessible-ai-command-center-v1",LOG_KEY="accessible-ai-command-center-handoffs-v1";
  const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const makeId=p=>p+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);
  let proposed=null;
  function state(){return window.AICC?.getState?.()||read(KEY,{agents:[],departments:[],tasks:[],workflows:[]})}
  function chooseAgent(s,dept,terms=[]){
    const agents=s.agents||[];
    const byDept=agents.filter(a=>a.department===dept);
    const byWords=agents.filter(a=>(a.name+" "+a.role+" "+a.instructions).toLowerCase().includes(terms.join(" ").toLowerCase())||terms.some(t=>(a.name+" "+a.role+" "+a.instructions).toLowerCase().includes(t)));
    return byDept[0]||byWords[0]||agents.find(a=>a.id==="agent-executive")||agents[0]||null;
  }
  function buildPlan(goal,s){
    const q=goal.toLowerCase(),steps=[];
    const add=(title,dept,terms,description)=>steps.push({title,department:dept,agent:chooseAgent(s,dept,terms),description});
    add("Clarify the goal and define what success looks like","personal",["executive","assistant","organizer"],"Turn the request into clear outcomes and boundaries.");
    if(/research|market|competitor|compare|investigat|source|find out/.test(q))add("Research the topic and collect relevant evidence","research",["research","analyst"],"Gather information and distinguish verified facts from open questions.");
    if(/website|software|app|code|build|technical|platform/.test(q))add("Prepare the technical requirements and implementation plan","technology",["developer","technology","software"],"Break the technical work into reviewable milestones.");
    if(/business|company|startup|operations|launch/.test(q))add("Organize business requirements and operating workstreams","admin",["business","operations","project"],"List the resources, dependencies, and decisions needed.");
    if(/money|budget|financial|cost|revenue|invoice|pricing/.test(q))add("Prepare the financial information and cost checklist","finance",["finance","budget"],"Organize the relevant numbers and assumptions for human review.");
    if(/marketing|campaign|advertis|social|brand|content|launch/.test(q))add("Prepare the marketing strategy and content outline","marketing",["marketing","content","social"],"Draft messaging and a campaign outline. Do not publish or spend.");
    if(/email|letter|message|communicat|customer|client/.test(q))add("Prepare the required communications for approval","personal",["communication","writing","assistant"],"Draft communications. Do not send without explicit approval.");
    if(/document|paperwork|form|record|contract|policy/.test(q))add("Organize the required documents and review checklist","admin",["document","administrator","paperwork"],"Identify needed documents and outstanding information. Do not sign or submit.");
    add("Review the proposed results and identify the next decisions","personal",["executive","assistant","organizer"],"Check completeness, record open questions, and request user approval.");
    const unique=[];for(const step of steps)if(!unique.some(x=>x.title===step.title))unique.push(step);
    return unique.slice(0,8);
  }
  function renderHandoffs(){
    const root=$("#executive-handoff-log");if(!root)return;
    const log=read(LOG_KEY,[]).slice().reverse().slice(0,12);
    root.innerHTML=log.map(x=>'<div class="handoff-row"><div class="handoff-icon">↗</div><div><strong>'+esc(x.from)+' → '+esc(x.to)+'</strong><small>'+esc(x.task)+' · '+new Date(x.at).toLocaleString()+'</small></div><span class="pill">PLANNED</span></div>').join("")||'<div class="resume-placeholder">No handoffs recorded yet. When you approve a team plan, its proposed handoffs will be listed here.</div>';
  }
  function renderPlan(){
    const root=$("#executive-plan-output");if(!root||!proposed)return;
    const s=state();
    root.innerHTML='<div class="notice-box">Review this plan. Creating it adds tasks to your workspace; it does not start autonomous execution.</div><div class="executive-goal"><strong>Goal</strong><p>'+esc(proposed.goal)+'</p></div><div class="executive-steps">'+proposed.steps.map((x,i)=>'<article class="executive-step"><span class="executive-step-number">'+(i+1)+'</span><div class="executive-step-body"><strong>'+esc(x.title)+'</strong><p>'+esc(x.description)+'</p><small>'+esc(x.agent?.name||"No matching agent — unassigned")+' · '+esc((s.departments||[]).find(d=>d.id===x.department)?.name||x.department)+'</small></div></article>').join("")+'</div><div class="brain-actions"><button class="primary-button" id="executive-approve">✓ Approve plan and create '+proposed.steps.length+' tasks</button><button class="quiet-button" id="executive-discard">Discard plan</button></div>';
  }
  $("#executive-plan")?.addEventListener("click",()=>{
    const goal=$("#executive-request").value.trim();if(!goal){window.AICC?.toast?.("Tell the Executive Brain what you want to accomplish.");$("#executive-request").focus();return}
    const s=state();if(!(s.agents||[]).length){window.AICC?.toast?.("Create at least one AI agent before assigning work.");window.AICC?.showView?.("agents");return}
    proposed={id:makeId("workflow"),goal,createdAt:new Date().toISOString(),steps:buildPlan(goal,s)};
    renderPlan();
  });
  $("#executive-plan-output")?.addEventListener("click",e=>{
    if(e.target.closest("#executive-discard")){proposed=null;$("#executive-plan-output").innerHTML='<div class="resume-placeholder">Plan discarded. Your existing tasks were not changed.</div>';return}
    if(!e.target.closest("#executive-approve")||!proposed)return;
    const s=state();s.workflows=s.workflows||[];s.tasks=s.tasks||[];
    const title=proposed.goal.length>65?proposed.goal.slice(0,62)+"…":proposed.goal;
    s.workflows.unshift({id:proposed.id,title,objective:proposed.goal,template:"executive-brain",createdAt:proposed.createdAt});
    const handoffs=[];
    proposed.steps.forEach((step,i)=>{
      const taskId=makeId("task");
      const prior=i?proposed.steps[i-1].title:null;
      s.tasks.unshift({id:taskId,title:step.title,details:step.description+(prior?" Complete after: "+prior:"")+" Created by Executive Brain. Human review required.",agent:step.agent?.id||"",priority:"normal",status:"todo",workflowId:proposed.id,createdAt:new Date().toISOString()});
      if(i){handoffs.push({id:makeId("handoff"),from:proposed.steps[i-1].agent?.name||"Previous step",to:step.agent?.name||"Next step",task:step.title,at:new Date().toISOString(),workflowId:proposed.id})}
    });
    const log=read(LOG_KEY,[]);write(KEY,s);write(LOG_KEY,log.concat(handoffs));
    window.AICC?.save?.();
    proposed=null;$("#executive-plan-output").innerHTML='<div class="notice-box">Your team plan and tasks have been added. Agents have not started executing them.</div><button class="primary-button" id="executive-open-workflows">Open team workflows</button>';
    renderHandoffs();window.AICC?.toast?.("Team plan created. Review the tasks in Team Workflows.");
    $("#executive-plan-output")?.querySelector("#executive-open-workflows")?.addEventListener("click",()=>window.AICC?.showView?.("workflows"));
  });
  $("#executive-voice")?.addEventListener("click",()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){window.AICC?.toast?.("Voice input is not supported in this browser.");return}
    const rec=new SR();rec.lang=navigator.language||"en-US";rec.onresult=e=>{$("#executive-request").value+=($("#executive-request").value?" ":"")+e.results[0][0].transcript};rec.onerror=()=>window.AICC?.toast?.("Voice input did not start. Please type your goal.");rec.start();
  });
  renderHandoffs();
})();
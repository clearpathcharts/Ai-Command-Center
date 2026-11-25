/*
 * Agent Creator Brain — reads a plain-language request, checks the existing
 * workforce, and builds the missing specialist agents. All changes go through
 * window.AICC so they are saved in the one shared workspace.
 */
(() => {
  "use strict";
  const A = window.AICC;
  if (!A) { console.error("Agent Creator Brain needs app.js to load first."); return; }
  const $ = s => document.querySelector(s);
  const esc = A.esc;
  let suggestions = [];

  const DEPARTMENTS = {
    executive:{name:"Executive Office",purpose:"Leads the workforce, splits big goals into jobs, and checks the results.",icon:"◉"},
    research:{name:"Research",purpose:"Find information, compare sources, and prepare reports.",icon:"⌕"},
    admin:{name:"Administration",purpose:"Organize documents, schedules, and everyday work.",icon:"▤"},
    marketing:{name:"Marketing",purpose:"Plan campaigns, content, and communications.",icon:"✧"},
    technology:{name:"Technology",purpose:"Plan software, troubleshoot, and build digital tools.",icon:"⌘"},
    personal:{name:"Personal Assistance",purpose:"Break down goals and make daily tasks easier.",icon:"♡"},
    finance:{name:"Finance",purpose:"Organize financial information and prepare analysis for review.",icon:"＄"}
  };

  const templates = [
    ["Personal Memory Assistant","Personal organization and memory support","personal",["remember","memory","remind","forget","deadline","routine","daily","organize my life"],"Help the user remember commitments, organize information, and turn requests into small, clear steps. Ask before creating external reminders or contacting anyone."],
    ["Appointment Coordinator","Appointment and schedule organizer","admin",["appointment","calendar","schedule","meeting","doctor","dentist"],"Organize appointment details, prepare checklists, and draft reminders. Never book, cancel, or send messages without approval."],
    ["Document Organizer","Paperwork and document assistant","admin",["paperwork","document","form","file","records","mail","letter"],"Help sort documents, explain forms in plain language, and keep a checklist of missing items. Do not submit or sign documents."],
    ["Research Specialist","Research and source verification","research",["research","investigate","compare","find information","verify","sources","market"],"Prepare research plans, gather source links when connected tools are available, and keep confirmed facts separate from uncertainty."],
    ["Fraud & Scam Checker","Scam and risk warning signs","research",["scam","fraud","suspicious","phishing","fake","too good to be true"],"Look for warning signs in messages, offers, and websites. Explain risks in plain words. Warning signs are not proof."],
    ["Business Planning Agent","Business planning and operations","admin",["business","company","startup","plan","operations","llc"],"Break business goals into workstreams, track decisions, and prepare plans for user review."],
    ["Marketing Strategist","Marketing and content planning","marketing",["marketing","social media","campaign","advertising","promotion","content","brand"],"Develop campaign ideas, content calendars, and draft copy. Require approval before publishing or spending."],
    ["Social Media Manager","Social media drafts and schedules","marketing",["social","facebook","instagram","tiktok","youtube","x.com","twitter","linkedin","post"],"Draft posts and a posting calendar in the user's voice. Never post without approval."],
    ["Financial Information Organizer","Financial records and analysis preparation","finance",["finance","budget","money","invoice","expense","financial","bills","tax"],"Organize user-provided financial information and prepare calculations or questions. Do not move money, trade, or make financial decisions."],
    ["Technology Builder","Software and technical project assistant","technology",["website","software","code","app","program","technical","developer"],"Break technical requests into implementation steps, document changes, and prepare code for review. Never expose passwords or keys."],
    ["Communication Assistant","Writing and communication support","personal",["email","write","message","communication","letter","reply"],"Help draft, simplify, and organize communications in the user's preferred tone. Ask before sending."],
    ["Learning Coach","Learning and step-by-step teaching","personal",["learn","teach","course","study","explain","training"],"Explain topics in plain language, break learning into short steps, and check understanding without overwhelming the user."],
    ["Accessibility Support Agent","Task simplification and accessible workflows","personal",["disability","accessible","overwhelmed","simple","break down","focus","adhd","autism","memory problems","brain injury","tbi","ptsd"],"Reduce mental load, offer one next step at a time, and adapt explanations to the user's stated preferences."],
    ["Customer Support Agent","Customer questions and support drafts","admin",["customer","support","client","service","ticket"],"Organize support requests, draft helpful responses, and pass sensitive or unresolved issues to the user."]
  ].map(([name,role,department,keywords,instructions])=>({name,role,department,keywords,instructions}));

  function findExisting(t,agents){
    return agents.find(a=>a.name.toLowerCase()===t.name.toLowerCase()||a.role.toLowerCase()===t.role.toLowerCase());
  }
  function makeSuggestions(request){
    const s=A.getState(),lower=request.toLowerCase();
    let found=templates.filter(t=>t.keywords.some(k=>lower.includes(k)));
    if(!found.length)found=[templates[0],templates[3]];
    return [...new Map(found.map(t=>[t.name,t])).values()].map(template=>({template,existing:findExisting(template,s.agents)}));
  }
  // Makes sure the department exists (recreating it if the user removed it).
  function ensureDepartment(key){
    const s=A.getState();
    let dep=s.departments.find(d=>d.id===key);
    if(!dep&&DEPARTMENTS[key]){dep={id:key,...DEPARTMENTS[key]};s.departments.push(dep)}
    return dep;
  }
  // Finds who a new agent should report to: the lead of its department,
  // otherwise the Executive Assistant.
  function managerFor(dept){
    const s=A.getState();
    const lead=s.agents.find(a=>a.department===dept&&(!a.reportsTo||a.reportsTo==="agent-executive"));
    return lead?.id||s.agents.find(a=>a.id==="agent-executive")?.id||"";
  }
  // Creates one agent without saving. Returns the agent (existing or new).
  function createAgent(t){
    const s=A.getState();
    const existing=findExisting(t,s.agents);
    if(existing)return {agent:existing,created:false};
    const dep=ensureDepartment(t.department);
    const agent={id:A.id("agent"),name:t.name,role:t.role,department:dep?.id||"",reportsTo:managerFor(dep?.id),instructions:t.instructions,permission:"approval",createdBy:"Agent Creator Brain",createdAt:new Date().toISOString()};
    s.agents.push(agent);
    return {agent,created:true};
  }
  function templateForDepartment(dept,text=""){
    const lower=String(text).toLowerCase();
    return templates.find(t=>t.department===dept&&t.keywords.some(k=>lower.includes(k)))||templates.find(t=>t.department===dept)||null;
  }

  function renderPlan(){
    const root=$("#brain-plan");if(!root)return;
    if(!suggestions.length){root.innerHTML="";return}
    const missing=suggestions.filter(x=>!x.existing).length;
    root.innerHTML='<div class="notice-box">'+(missing?missing+" new specialist"+(missing>1?"s":"")+" suggested. Agents you already have are marked so you don't get duplicates.":"Your existing workforce already covers this. Nothing new needed.")+'</div>'
      +suggestions.map((x,i)=>'<article class="brain-suggestion"><strong>'+esc(x.template.name)+'</strong><p>'+esc(x.template.role)+' · '+esc(x.template.instructions)+'</p><small>'+(x.existing?"✓ Already in your workforce":"✧ New agent · joins "+esc(DEPARTMENTS[x.template.department]?.name||"a department"))+'</small>'+(x.existing?'<button class="mini-button" data-open-agent="'+esc(x.existing.id)+'">Show existing agent</button>':'<button class="mini-button" data-create-suggestion="'+i+'">Create this agent</button>')+'</article>').join("")
      +(missing>1?'<button class="primary-button" id="brain-create-all">＋ Create all '+missing+' new agents</button>':"")
      +'<button class="quiet-button" id="brain-speak">🔊 Read this plan to me</button>';
  }
  function refresh(){suggestions=makeSuggestions($("#brain-request").value||"");renderPlan()}

  $("#brain-analyze")?.addEventListener("click",()=>{
    const q=$("#brain-request").value.trim();
    if(!q){A.toast("Tell the brain what you need help with first.");$("#brain-request").focus();return}
    suggestions=makeSuggestions(q);renderPlan();
  });
  $("#brain-plan")?.addEventListener("click",e=>{
    const c=e.target.closest("[data-create-suggestion]");
    if(c){const x=suggestions[Number(c.dataset.createSuggestion)];if(x){const r=createAgent(x.template);A.save();A.toast(r.created?x.template.name+" joined your workforce.":"You already have this specialist.");refresh()}return}
    if(e.target.closest("[data-open-agent]")){A.showView("agents");A.toast("Your existing agent is in My AI Agents.");return}
    if(e.target.closest("#brain-create-all")){let n=0;suggestions.filter(x=>!x.existing).forEach(x=>{if(createAgent(x.template).created)n++});A.save();refresh();A.toast(n+" new agent"+(n===1?"":"s")+" added to your workforce.");return}
    if(e.target.closest("#brain-speak")){A.speak($("#brain-plan").innerText)}
  });
  $("#brain-voice")?.addEventListener("click",e=>A.listen($("#brain-request"),e.currentTarget));

  /* ---------- Bulk creation: 1 to 5,000 agents at a time, unlimited overall ---------- */
  function fillBulkSelects(){
    const s=A.getState(),dep=$("#bulk-department"),boss=$("#bulk-reports-to");if(!dep||!boss)return;
    const dv=dep.value,bv=boss.value;
    dep.innerHTML=s.departments.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+'</option>').join("");
    if(s.departments.some(d=>d.id===dv))dep.value=dv;
    const options=s.agents.slice(0,2000);
    boss.innerHTML='<option value="">Nobody — top of the team</option>'+options.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join("");
    boss.value=s.agents.some(a=>a.id===bv)?bv:(s.agents.some(a=>a.id==="agent-executive")?"agent-executive":"");
  }
  $("#bulk-form")?.addEventListener("submit",e=>{
    e.preventDefault();
    const s=A.getState();
    const base=$("#bulk-name").value.trim(),role=$("#bulk-role").value.trim()||base,count=Math.floor(Number($("#bulk-count").value));
    if(!base){A.toast("Give the agents a name first.");return}
    if(!(count>=1&&count<=5000)){A.toast("Choose a number from 1 to 5000. You can repeat this as many times as you need.");return}
    const lower=base.toLowerCase();
    const same=s.agents.filter(a=>a.name.toLowerCase()===lower||a.name.toLowerCase().startsWith(lower+" #"));
    if(same.length&&!confirm("Memory check: you already have "+same.length+" agent"+(same.length>1?"s":"")+" named \""+base+"\".\n\nPress OK to add "+count+" more, or Cancel to use the ones you have.")){A.showView("agents");$("#agent-search").value=base;A.render();return}
    let start=same.reduce((m,a)=>{const n=Number((a.name.match(/#(\d+)$/)||[])[1]);return Number.isFinite(n)&&n>m?n:m},same.length?1:0);
    const dept=$("#bulk-department").value,boss=$("#bulk-reports-to").value,instructions=$("#bulk-instructions").value.trim()||("Help with: "+role+". Ask before any important action.");
    const stamp=new Date().toISOString();
    for(let i=1;i<=count;i++){
      s.agents.push({id:A.id("agent"),name:count===1&&!same.length?base:base+" #"+(start+i),role,department:dept,reportsTo:boss,instructions,permission:"approval",createdBy:"Bulk creator",createdAt:stamp});
    }
    if(!A.save()){s.agents.splice(s.agents.length-count,count);A.toast("This device ran out of storage space. No agents were added. Try a smaller number, or download a backup and clear old data.");A.render();return}
    $("#bulk-form").reset();fillBulkSelects();
    A.toast(count+" agent"+(count>1?"s":"")+" created. You now have "+s.agents.length+" agents in total.");
  });

  A.onRender(fillBulkSelects);
  window.AICC_BRAIN={templates,createAgent,ensureDepartment,templateForDepartment,makeSuggestions};
})();

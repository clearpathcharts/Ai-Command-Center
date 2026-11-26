/*
 * Intelligence Engine — research and verification tools that run on this
 * device. Nothing here pretends to be an AI. Each tool says exactly what it
 * checked. Warning signs are not proof.
 */
(() => {
  "use strict";
  const A = window.AICC;
  if (!A) { console.error("Intelligence Engine needs app.js to load first."); return; }
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = A.esc;

  /* ---------- Tabs: only one tool is visible at a time ---------- */
  function showTool(name){
    $$("[data-intel-tab]").forEach(b=>{const on=b.dataset.intelTab===name;b.classList.toggle("selected",on);b.setAttribute("aria-selected",String(on));b.tabIndex=on?0:-1});
    $$(".intel-tool").forEach(p=>p.hidden=p.id!=="intel-"+name);
  }
  $("#intel-tabs")?.addEventListener("click",e=>{const b=e.target.closest("[data-intel-tab]");if(b)showTool(b.dataset.intelTab)});
  $("#intel-tabs")?.addEventListener("keydown",e=>{
    if(!["ArrowRight","ArrowLeft"].includes(e.key))return;
    const tabs=$$("[data-intel-tab]"),i=tabs.indexOf(document.activeElement);if(i<0)return;
    const next=tabs[(i+(e.key==="ArrowRight"?1:tabs.length-1))%tabs.length];next.focus();showTool(next.dataset.intelTab);e.preventDefault();
  });
  function result(id,html){const el=$("#"+id);if(el){el.innerHTML=html;el.hidden=false}}
  function readButton(target){return '<button class="quiet-button" data-intel-read="'+target+'">🔊 Read results to me</button>'}

  /* ---------- 1. Research desk ---------- */
  function researchLinks(topic){
    const q=encodeURIComponent(topic);
    return [
      ["General web search (DuckDuckGo)","https://duckduckgo.com/?q="+q],
      ["Encyclopedia overview (Wikipedia)","https://en.wikipedia.org/w/index.php?search="+q],
      ["Academic papers (Google Scholar)","https://scholar.google.com/scholar?q="+q],
      ["Recent news (Google News)","https://news.google.com/search?q="+q],
      ["U.S. government sources (USA.gov)","https://www.usa.gov/search?query="+q]
    ];
  }
  $("#intel-research-go")?.addEventListener("click",()=>{
    const topic=$("#intel-research-topic").value.trim();
    if(!topic){A.toast("Type a topic to research first.");return}
    result("intel-research-out",'<p>Open these one at a time. Each opens in a new tab so you do not lose your place here.</p><ul class="intel-links">'+researchLinks(topic).map(([label,url])=>'<li><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a></li>').join("")+'</ul><button class="secondary-button" id="intel-research-task">Save as a research task with steps</button>');
  });
  $("#intel-research-out")?.addEventListener("click",e=>{
    if(!e.target.closest("#intel-research-task"))return;
    const topic=$("#intel-research-topic").value.trim();
    const agent=A.getState().agents.find(a=>a.department==="research");
    A.createTask("Research: "+topic,"Use the research links in the Intelligence Engine. Record each source and what it says.",agent?.id||"","normal",{breakDown:true});
  });
  $("#intel-research-voice")?.addEventListener("click",e=>A.listen($("#intel-research-topic"),e.currentTarget));

  /* ---------- 2. Source check (website address) ---------- */
  const SHORTENERS=["bit.ly","tinyurl.com","t.co","goo.gl","ow.ly","is.gd","buff.ly","cutt.ly","rb.gy","shorturl.at"];
  const RISKY_TLDS=["zip","mov","xyz","top","click","work","loan","gq","tk","ml","cf","ga","rest","country"];
  const BRANDS=["paypal","apple","amazon","microsoft","google","netflix","chase","wellsfargo","bankofamerica","irs","ssa","medicare","coinbase","facebook","instagram","usps","fedex","ups"];
  function checkSource(raw){
    let url;
    try{url=new URL(/^[a-z]+:\/\//i.test(raw)?raw:"https://"+raw)}catch{return null}
    const host=url.hostname.toLowerCase(),labels=host.split("."),tld=labels[labels.length-1],root=labels.slice(-2).join(".");
    const good=[],warn=[];
    if(url.protocol==="https:")good.push("Uses a secure connection (https). This protects the connection, but does not prove the site is honest.");else warn.push("Does not use a secure connection (no https).");
    if(/\.(gov|mil)$/.test(host))good.push("This is a U.S. government address (.gov or .mil).");
    if(/\.edu$/.test(host))good.push("This is a U.S. education address (.edu).");
    if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host))warn.push("The address is a raw number (IP address) instead of a name. Real organizations rarely do this.");
    if(host.includes("xn--"))warn.push("The address uses special characters that can imitate a real name (punycode).");
    if((host.match(/-/g)||[]).length>=3)warn.push("The address has many dashes. Fake sites often look like 'secure-login-account-update'.");
    if(labels.length>4)warn.push("The address has many parts before the real domain ("+esc(root)+"). The real owner is the last part.");
    if(SHORTENERS.includes(host))warn.push("This is a link shortener. You cannot see where it really goes.");
    if(RISKY_TLDS.includes(tld))warn.push("The ending '."+esc(tld)+"' is often used by spam and scam sites.");
    if(url.username||raw.includes("@"))warn.push("The address contains an '@' sign, which can hide the real destination.");
    const brand=BRANDS.find(b=>host.replace(/-/g,"").includes(b));
    if(brand&&!new RegExp("(^|\\.)"+brand+"\\.(com|gov|org|net)$").test(host.replace(/-/g,"")))warn.push("The address mentions '"+brand+"' but the real domain is "+esc(root)+". This is a common trick.");
    return {host,root,good,warn,href:url.href};
  }
  $("#intel-source-go")?.addEventListener("click",()=>{
    const raw=$("#intel-source-url").value.trim();
    if(!raw){A.toast("Paste a website address first.");return}
    const r=checkSource(raw);
    if(!r){result("intel-source-out",'<p class="intel-level warn">That does not look like a website address. Check for typos.</p>');return}
    const level=r.warn.length>=2?["danger","Several warning signs"]:r.warn.length===1?["warn","One warning sign"]:["ok","No warning signs found in the address"];
    result("intel-source-out",'<p class="intel-level '+level[0]+'">'+level[1]+' — '+esc(r.host)+'</p>'
      +(r.warn.length?'<h4>Warning signs</h4><ul>'+r.warn.map(w=>'<li>⚑ '+w+'</li>').join("")+'</ul>':'')
      +(r.good.length?'<h4>Good signs</h4><ul>'+r.good.map(g=>'<li>✓ '+g+'</li>').join("")+'</ul>':'')
      +'<h4>Check it yourself</h4><ul><li>Who wrote it, and are they named?</li><li>When was it published or updated?</li><li>Do two other trusted sources say the same thing?</li></ul>'
      +'<ul class="intel-links"><li><a href="https://lookup.icann.org/en/lookup?name='+encodeURIComponent(r.root)+'" target="_blank" rel="noopener noreferrer">Look up who registered '+esc(r.root)+' ↗</a></li><li><a href="https://web.archive.org/web/*/'+encodeURIComponent(r.href)+'" target="_blank" rel="noopener noreferrer">See older copies of this page ↗</a></li></ul>'
      +'<p class="intel-note">This only checks the address itself. It did not open or read the website.</p>'+readButton("intel-source-out"));
  });

  /* ---------- 3. Scam & fraud warning signs ---------- */
  const SCAM_RULES=[
    ["Pressure to act fast",/\b(urgent|immediately|right away|within 24 hours|act now|final notice|last chance|expires today|limited time)\b/i],
    ["Asks for payment in a hard-to-trace way",/\b(gift ?cards?|itunes card|google play card|steam card|wire transfer|western union|moneygram|bitcoin|crypto|usdt|zelle|cash ?app|venmo)\b/i],
    ["Asks for private information",/\b(password|passcode|pin number|social security|ssn|verification code|one[- ]time code|otp|bank login|account number|routing number|date of birth)\b/i],
    ["Says you won something",/\b(you('ve| have)? won|winner|lottery|sweepstakes|prize|inheritance|unclaimed (money|funds)|grant (has been )?approved)\b/i],
    ["Threats or fear",/\b(arrest|warrant|lawsuit|deport|suspended|locked|frozen|legal action|police will)\b/i],
    ["Too good to be true",/\b(guaranteed|risk[- ]free|double your money|\d{2,}\s?% (return|profit|gains)|get rich|no experience needed|work from home and earn)\b/i],
    ["Asks you to keep it secret",/\b(don'?t tell|do not tell|keep (this|it) (secret|confidential|between us))\b/i],
    ["Asks to control your device",/\b(anydesk|teamviewer|remote access|install (this|the) app|screen ?share)\b/i],
    ["Asks you to send money",/\b(send (me )?money|need money|loan me|help me pay|pay the fee|processing fee|release fee|customs fee)\b/i],
    ["Contains a link",/(https?:\/\/\S+|\bwww\.\S+|bit\.ly|tinyurl)/i],
    ["Claims to be a well-known company or agency",/\b(irs|social security administration|medicare|fbi|amazon|apple support|microsoft|paypal|bank of america|wells fargo|chase|usps|fedex|ups)\b/i]
  ];
  $("#intel-scam-go")?.addEventListener("click",()=>{
    const text=$("#intel-scam-text").value.trim();
    if(!text){A.toast("Paste the message or offer first.");return}
    const hits=SCAM_RULES.filter(([,re])=>re.test(text)).map(([label,re])=>({label,example:(text.match(re)||[""])[0]}));
    const strong=hits.filter(h=>!["Contains a link","Claims to be a well-known company or agency"].includes(h.label)).length;
    const level=strong>=3?["danger","Many warning signs — treat this as a likely scam"]:strong>=1||hits.length>=2?["warn","Some warning signs — be careful"]:["ok","No common warning signs found"];
    result("intel-scam-out",'<p class="intel-level '+level[0]+'">'+level[1]+'</p>'
      +(hits.length?'<ul>'+hits.map(h=>'<li>⚑ <b>'+esc(h.label)+'</b> — found: "'+esc(h.example)+'"</li>').join("")+'</ul>':'')
      +'<h4>Safe next steps</h4><ul><li>Do not pay, and do not share codes or passwords.</li><li>Do not use the phone number or link in the message. Look up the official number yourself.</li><li>Ask someone you trust before acting.</li><li>In the U.S., you can report scams at <a href="https://reportfraud.ftc.gov/" target="_blank" rel="noopener noreferrer">reportfraud.ftc.gov ↗</a>.</li></ul>'
      +'<p class="intel-note">This looks for common warning words. It is not proof that something is a scam, and "no warning signs" does not prove it is safe.</p>'+readButton("intel-scam-out"));
  });
  $("#intel-scam-voice")?.addEventListener("click",e=>A.listen($("#intel-scam-text"),e.currentTarget));

  /* ---------- 4. Document analysis ---------- */
  const STOP=new Set("about above after again against their there these those which while where would could should other being having under until whose your yours this that with from have will shall been were they them then than what when into only also more most such very just over each some because before between through during".split(" "));
  function analyze(text){
    const words=text.match(/[A-Za-z][A-Za-z'’-]*/g)||[];
    const sentences=text.split(/(?<=[.!?])\s+|\n+/).map(s=>s.trim()).filter(s=>s.length>3);
    const dates=[...new Set(text.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{2}-\d{2}|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}(st|nd|rd|th)?(,? \d{4})?)\b/gi)||[])];
    const money=[...new Set(text.match(/\$\s?\d[\d,]*(\.\d{2})?/g)||[])];
    const emails=[...new Set(text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g)||[])];
    const phones=[...new Set(text.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g)||[])];
    const deadlines=sentences.filter(s=>/\b(due|deadline|no later than|must|required|before|expires?|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|the end))\b/i.test(s)).slice(0,8);
    const freq={};words.forEach(w=>{const k=w.toLowerCase();if(k.length>4&&!STOP.has(k))freq[k]=(freq[k]||0)+1});
    const keywords=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k])=>k);
    return {words:words.length,sentences,dates,money,emails,phones,deadlines,keywords,minutes:Math.max(1,Math.round(words.length/200))};
  }
  let lastDoc=null;
  $("#intel-doc-go")?.addEventListener("click",()=>{
    const text=$("#intel-doc-text").value.trim();
    if(!text){A.toast("Paste the document text first.");return}
    const r=lastDoc=analyze(text);
    const list=(title,items)=>items.length?'<h4>'+title+'</h4><ul>'+items.map(i=>'<li>'+esc(i)+'</li>').join("")+'</ul>':"";
    result("intel-doc-out",'<p class="intel-level ok">'+r.words+' words · about '+r.minutes+' minute'+(r.minutes>1?"s":"")+' to read</p>'
      +'<h4>The beginning, in short</h4><p>'+esc(r.sentences.slice(0,3).join(" "))+'</p>'
      +list("Deadlines and must-do sentences",r.deadlines)+list("Dates found",r.dates)+list("Money amounts found",r.money)+list("Email addresses",r.emails)+list("Phone numbers",r.phones)
      +(r.keywords.length?'<h4>Main words</h4><p>'+r.keywords.map(k=>'<span class="pill">'+esc(k)+'</span>').join(" ")+'</p>':"")
      +(r.deadlines.length?'<button class="secondary-button" id="intel-doc-tasks">Make a task for each deadline ('+r.deadlines.length+')</button> ':'')+readButton("intel-doc-out")
      +'<p class="intel-note">This pulls out dates, amounts, and deadline sentences using patterns. Always check the original document.</p>');
  });
  $("#intel-doc-out")?.addEventListener("click",e=>{
    if(!e.target.closest("#intel-doc-tasks")||!lastDoc)return;
    const agent=A.getState().agents.find(a=>a.department==="admin");
    lastDoc.deadlines.forEach(d=>A.addTask({title:d.length>110?d.slice(0,107)+"…":d,details:"Found in a document you analyzed.",agent:agent?.id||"",priority:"high",steps:A.breakDown(d)}));
    A.save();A.toast(lastDoc.deadlines.length+" deadline task"+(lastDoc.deadlines.length>1?"s":"")+" created.");A.showView("tasks");
  });

  /* ---------- 5. Data classification ---------- */
  const CLASSES=[
    ["Money & bills",/\b(bill|pay|paid|bank|rent|invoice|budget|tax|money|credit|loan|\$\d)/i],
    ["Health & medical",/\b(doctor|dentist|medic|pharmacy|prescription|therapy|hospital|clinic|insurance|appointment)/i],
    ["Paperwork & legal",/\b(form|document|contract|license|application|court|lawyer|sign|id card|passport|registration)/i],
    ["Work & business",/\b(client|customer|meeting|project|invoice|business|work|email|report|marketing|sales)/i],
    ["Home & errands",/\b(groceries|shop|buy|clean|laundry|repair|car|home|house|errand|store)/i],
    ["Family & friends",/\b(mom|dad|wife|husband|son|daughter|kids?|family|friend|birthday|call)/i],
    ["Learning & research",/\b(learn|read|study|research|course|class|book|watch)/i]
  ];
  $("#intel-classify-go")?.addEventListener("click",()=>{
    const lines=$("#intel-classify-text").value.split(/\n|;/).map(l=>l.trim()).filter(Boolean);
    if(!lines.length){A.toast("Paste a list first — one item per line.");return}
    const groups={};
    lines.forEach(l=>{const c=CLASSES.find(([,re])=>re.test(l));const k=c?c[0]:"Other";(groups[k]=groups[k]||[]).push(l)});
    result("intel-classify-out",'<p class="intel-level ok">'+lines.length+' items sorted into '+Object.keys(groups).length+' groups</p>'
      +Object.entries(groups).sort((a,b)=>b[1].length-a[1].length).map(([k,items])=>'<h4>'+esc(k)+' ('+items.length+')</h4><ul>'+items.map(i=>'<li>'+esc(i)+'</li>').join("")+'</ul>').join("")
      +'<button class="secondary-button" id="intel-classify-tasks">Turn every item into a task</button> '+readButton("intel-classify-out"));
  });
  $("#intel-classify-out")?.addEventListener("click",e=>{
    if(!e.target.closest("#intel-classify-tasks"))return;
    const lines=$("#intel-classify-text").value.split(/\n|;/).map(l=>l.trim()).filter(Boolean);
    if(!confirm("Create "+lines.length+" tasks?"))return;
    lines.forEach(l=>A.addTask({title:l,details:"Created from a sorted list."}));
    A.save();A.toast(lines.length+" tasks created.");A.showView("tasks");
  });
  $("#intel-classify-voice")?.addEventListener("click",e=>A.listen($("#intel-classify-text"),e.currentTarget));

  /* ---------- 6. Analytics & reporting ---------- */
  function buildReport(){
    const s=A.getState(),t=s.tasks;
    const done=t.filter(x=>x.status==="done").length,pct=t.length?Math.round(done/t.length*100):0;
    const byAgent=s.agents.map(a=>{const mine=t.filter(x=>x.agent===a.id);return [a.name,mine.filter(x=>x.status!=="done").length,mine.filter(x=>x.status==="done").length]}).filter(r=>r[1]||r[2]);
    const byDept=s.departments.map(d=>[d.name,s.agents.filter(a=>a.department===d.id).length,t.filter(x=>s.agents.find(a=>a.id===x.agent)?.department===d.id&&x.status!=="done").length]);
    const lines=["AI Command Center — workspace report","Created: "+new Date().toLocaleString(),"",
      "Tasks: "+t.length+" total, "+done+" completed ("+pct+"%), "+t.filter(x=>x.status==="inprogress").length+" in progress, "+t.filter(x=>x.status==="todo").length+" not started.",
      "Waiting for your approval: "+s.approvals.filter(a=>a.status==="pending").length+".",
      "Handed to agents: "+t.filter(x=>x.handedOff&&x.status!=="done").length+".",
      "Agents: "+s.agents.length+". Departments: "+s.departments.length+". Team workflows: "+s.workflows.length+". Scheduled check-ins: "+s.monitors.length+".","",
      "Work by agent (open / done):",...(byAgent.length?byAgent.map(r=>"  "+r[0]+": "+r[1]+" open, "+r[2]+" done"):["  No tasks are assigned yet."]),"",
      "Departments (agents / open tasks):",...byDept.map(r=>"  "+r[0]+": "+r[1]+" agents, "+r[2]+" open tasks")];
    return {lines,pct,done,total:t.length};
  }
  $("#intel-report-go")?.addEventListener("click",()=>{
    const r=buildReport();
    result("intel-report-out",'<p class="intel-level ok">'+r.pct+'% of all tasks completed ('+r.done+' of '+r.total+')</p><div class="progress-track"><span style="width:'+r.pct+'%"></span></div><pre class="intel-report">'+esc(r.lines.join("\n"))+'</pre><button class="secondary-button" id="intel-report-download">Download report</button> '+readButton("intel-report-out"));
  });
  $("#intel-report-out")?.addEventListener("click",e=>{if(e.target.closest("#intel-report-download"))A.downloadFile("workspace-report-"+new Date().toISOString().slice(0,10)+".txt",buildReport().lines.join("\n"),"text/plain")});

  /* ---------- 7. Scheduled monitoring (check-ins) ---------- */
  const STEP_MS={hourly:3600e3,daily:86400e3,weekly:7*86400e3};
  function advance(m,from){
    if(m.frequency==="once"){m.active=false;return}
    let next=new Date(m.next).getTime();
    while(next<=from)next+=STEP_MS[m.frequency]||86400e3;
    m.next=new Date(next).toISOString();
  }
  function runMonitors(){
    const s=A.getState(),now=Date.now();let fired=0;
    s.monitors.forEach(m=>{
      if(m.active===false||new Date(m.next).getTime()>now)return;
      A.addTask({title:"Check-in: "+m.title,details:"Scheduled check-in ("+m.frequency+").",agent:m.agent||"",priority:"normal",steps:A.breakDown(m.title)});
      m.lastRun=new Date().toISOString();advance(m,now);fired++;
      if("Notification" in window&&Notification.permission==="granted"){try{new Notification("AI Command Center check-in",{body:m.title})}catch{}}
    });
    if(fired){A.save();A.toast(fired===1?"A scheduled check-in is due. It was added to your tasks.":fired+" scheduled check-ins are due. They were added to your tasks.")}
  }
  function renderMonitors(){
    const root=$("#intel-monitor-list");if(!root)return;
    const s=A.getState();
    root.innerHTML=s.monitors.map(m=>'<div class="monitor-row"><div><strong>'+esc(m.title)+'</strong><small>'+(m.active===false?"Finished":"Next: "+new Date(m.next).toLocaleString())+' · '+esc(m.frequency)+(m.lastRun?' · last ran '+new Date(m.lastRun).toLocaleString():'')+'</small></div><button class="mini-button" data-monitor-delete="'+esc(m.id)+'">Remove</button></div>').join("")||'<p class="resume-muted">No check-ins scheduled yet.</p>';
  }
  $("#intel-monitor-form")?.addEventListener("submit",e=>{
    e.preventDefault();
    const title=$("#intel-monitor-title").value.trim(),when=$("#intel-monitor-when").value,frequency=$("#intel-monitor-frequency").value;
    if(!title||!when){A.toast("Write what to check and choose a start time.");return}
    const start=new Date(when);if(Number.isNaN(start.getTime())){A.toast("That start time is not valid.");return}
    A.getState().monitors.push({id:A.id("monitor"),title,frequency,next:start.toISOString(),active:true,agent:$("#intel-monitor-agent").value,createdAt:new Date().toISOString()});
    A.save();$("#intel-monitor-form").reset();
    if("Notification" in window&&Notification.permission==="default")Notification.requestPermission().catch(()=>{});
    A.toast("Check-in scheduled.");
  });
  $("#intel-monitor-list")?.addEventListener("click",e=>{const b=e.target.closest("[data-monitor-delete]");if(b){const s=A.getState();s.monitors=s.monitors.filter(m=>m.id!==b.dataset.monitorDelete);A.save();A.toast("Check-in removed.")}});

  document.addEventListener("click",e=>{const r=e.target.closest("[data-intel-read]");if(r){const el=$("#"+r.dataset.intelRead);if(el)A.speak(el.innerText.replace(/🔊 Read results to me|Download report|Make a task for each deadline.*|Turn every item into a task|Save as a research task with steps/g,""))}});

  A.onRender(s=>{
    renderMonitors();
    const sel=$("#intel-monitor-agent");if(sel){const v=sel.value;sel.innerHTML='<option value="">No agent</option>'+s.agents.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join("");sel.value=s.agents.some(a=>a.id===v)?v:""}
  });
  showTool("research");
  runMonitors();
  setInterval(runMonitors,30000);
  window.AICC_INTEL={checkSource,analyze,runMonitors,scamRules:SCAM_RULES};
})();

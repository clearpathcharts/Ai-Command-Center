/*
 * Knowledge Base — a searchable library of how-tos, instructions, and notes.
 * The search box at the top searches EVERYTHING in the workspace:
 * knowledge articles, agents, tasks, memories, workflows, and social posts.
 */
(() => {
  "use strict";
  const A = window.AICC;
  if (!A) { console.error("Knowledge Base needs app.js to load first."); return; }
  const $ = s => document.querySelector(s);
  const esc = A.esc;

  function search(q){
    const s=A.getState(),has=t=>String(t||"").toLowerCase().includes(q);
    const out=[];
    s.knowledge.forEach(k=>{if(has(k.title+" "+k.body+" "+k.tags))out.push(["Article",k.title,k.body.slice(0,160),"knowledge",k.id])});
    s.agents.forEach(a=>{if(has(a.name+" "+a.role+" "+a.instructions))out.push(["Agent",a.name,a.role+" · "+A.departmentName(a.department),"agents"])});
    s.tasks.forEach(t=>{if(has(t.title+" "+t.details))out.push(["Task",t.title,(t.status==="done"?"Completed":"Open")+" · "+A.agentName(t.agent),"tasks"])});
    s.memories.forEach(m=>{if(has(m.text))out.push(["Memory",m.text.slice(0,80),new Date(m.createdAt).toLocaleDateString(),"brain"])});
    s.workflows.forEach(w=>{if(has(w.title+" "+w.objective))out.push(["Workflow",w.title,w.objective.slice(0,160),"workflows"])});
    s.socialPosts.forEach(p=>{if(has(p.text))out.push(["Social post",p.text.slice(0,80),p.platform,"social"])});
    return out;
  }
  function render(){
    const list=$("#kb-list");if(!list)return;
    const q=($("#kb-search")?.value||"").trim().toLowerCase();
    const res=$("#kb-results");
    if(q){
      const found=search(q);
      res.hidden=false;
      res.innerHTML='<h2>'+found.length+' result'+(found.length===1?"":"s")+' for "'+esc(q)+'"</h2>'+found.slice(0,100).map(([type,title,detail,view,kbId])=>'<button class="kb-result" '+(kbId?'data-kb-open="'+esc(kbId)+'"':'data-view-link="'+esc(view)+'"')+'><span class="pill">'+esc(type)+'</span> <strong>'+esc(title)+'</strong><small>'+esc(detail)+'</small></button>').join("")+(found.length?"":'<p class="resume-muted">Nothing found. Try a shorter word.</p>');
    }else{res.hidden=true;res.innerHTML=""}
    const s=A.getState();
    list.innerHTML=s.knowledge.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(k=>'<article class="kb-article" id="kb-'+esc(k.id)+'"><h3>'+esc(k.title)+'</h3><p>'+esc(k.body)+'</p>'+(k.tags?'<p>'+k.tags.split(",").map(t=>t.trim()).filter(Boolean).map(t=>'<span class="pill">'+esc(t)+'</span>').join(" ")+'</p>':'')+'<div class="card-actions"><button class="mini-button" data-kb-read="'+esc(k.id)+'">🔊 Read to me</button><button class="mini-button" data-kb-delete="'+esc(k.id)+'">Delete</button></div></article>').join("")||'<div class="empty-state"><strong>No articles yet</strong>Add your first one above.</div>';
  }
  $("#kb-search")?.addEventListener("input",render);
  $("#kb-voice")?.addEventListener("click",e=>{A.listen($("#kb-body"),e.currentTarget)});
  $("#kb-form")?.addEventListener("submit",e=>{
    e.preventDefault();
    const title=$("#kb-title").value.trim(),body=$("#kb-body").value.trim();
    if(!title||!body){A.toast("Add a title and some text.");return}
    A.getState().knowledge.push({id:A.id("kb"),title,body,tags:$("#kb-tags").value.trim(),createdAt:new Date().toISOString()});
    A.save();$("#kb-form").reset();A.toast("Saved to your knowledge base.");
  });
  document.addEventListener("click",e=>{
    const s=A.getState();
    const open=e.target.closest("[data-kb-open]");if(open){$("#kb-search").value="";render();document.getElementById("kb-"+open.dataset.kbOpen)?.scrollIntoView({block:"center"});return}
    const rd=e.target.closest("[data-kb-read]");if(rd){const k=s.knowledge.find(x=>x.id===rd.dataset.kbRead);if(k)A.speak(k.title+". "+k.body);return}
    const del=e.target.closest("[data-kb-delete]");if(del){const k=s.knowledge.find(x=>x.id===del.dataset.kbDelete);if(k&&confirm("Delete the article \""+k.title+"\"?")){s.knowledge=s.knowledge.filter(x=>x.id!==k.id);A.save();A.toast("Article deleted.")}}
  });
  A.onRender(render);
})();

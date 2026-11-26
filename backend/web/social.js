/*
 * Social Media Studio — draft posts for each platform, check the length,
 * plan when to post, and get approval. This app never posts by itself:
 * the person copies the approved post and posts it, then marks it posted.
 */
(() => {
  "use strict";
  const A = window.AICC;
  if (!A) { console.error("Social Media Studio needs app.js to load first."); return; }
  const $ = s => document.querySelector(s);
  const esc = A.esc;
  const PLATFORMS = {
    facebook:{name:"Facebook",limit:63206,url:"https://www.facebook.com/"},
    instagram:{name:"Instagram",limit:2200,url:"https://www.instagram.com/"},
    x:{name:"X (Twitter)",limit:280,url:"https://x.com/compose/post"},
    threads:{name:"Threads",limit:500,url:"https://www.threads.net/"},
    bluesky:{name:"Bluesky",limit:300,url:"https://bsky.app/"},
    linkedin:{name:"LinkedIn",limit:3000,url:"https://www.linkedin.com/feed/"},
    tiktok:{name:"TikTok caption",limit:2200,url:"https://www.tiktok.com/upload"},
    youtube:{name:"YouTube description",limit:5000,url:"https://studio.youtube.com/"}
  };
  const STATUS = {draft:"Draft",waiting:"Waiting for approval",approved:"Approved — ready to post",posted:"Posted"};

  function counter(){
    const p=PLATFORMS[$("#social-platform").value],n=$("#social-text").value.length,el=$("#social-count");
    el.textContent=n+" of "+p.limit+" characters";
    el.classList.toggle("over",n>p.limit);
  }
  function statusOf(post){
    if(post.status==="posted")return "posted";
    const task=A.getState().tasks.find(t=>t.id===post.taskId);
    if(!task)return "draft";
    const ap=A.getState().approvals.find(a=>a.taskId===task.id);
    if(ap&&ap.status==="approved")return "approved";
    if(ap&&ap.status==="rejected")return "draft";
    return "waiting";
  }
  function render(){
    const root=$("#social-list");if(!root)return;
    const posts=A.getState().socialPosts.slice().sort((a,b)=>(a.when||"9999").localeCompare(b.when||"9999"));
    root.innerHTML=posts.map(p=>{
      const st=statusOf(p),pl=PLATFORMS[p.platform]||PLATFORMS.facebook;
      return '<article class="social-card '+st+'"><div class="social-top"><span class="pill">'+esc(pl.name)+'</span><span class="status '+(st==="posted"||st==="approved"?"done":st==="waiting"?"inprogress":"")+'">'+esc(STATUS[st])+'</span></div><p>'+esc(p.text)+'</p><small>'+(p.when?"Planned for "+esc(new Date(p.when).toLocaleString()):"No date planned")+' · '+p.text.length+'/'+pl.limit+' characters</small><div class="card-actions">'
        +(st==="draft"?'<button class="mini-button" data-social-approve="'+esc(p.id)+'">Ask for approval</button>':'')
        +(st==="approved"?'<button class="mini-button" data-social-copy="'+esc(p.id)+'">Copy text</button><a class="mini-button" href="'+esc(pl.url)+'" target="_blank" rel="noopener noreferrer">Open '+esc(pl.name)+' ↗</a><button class="mini-button" data-social-posted="'+esc(p.id)+'">I posted it</button>':'')
        +(st==="waiting"?'<button class="mini-button" data-view-link="approvals">Open Approval Center</button>':'')
        +'<button class="mini-button" data-social-read="'+esc(p.id)+'">🔊 Read</button><button class="mini-button" data-social-delete="'+esc(p.id)+'">Delete</button></div></article>';
    }).join("")||'<div class="empty-state"><strong>No posts yet</strong>Write your first post above. Nothing is ever posted for you.</div>';
  }
  $("#social-platform")?.addEventListener("change",counter);
  $("#social-text")?.addEventListener("input",counter);
  $("#social-voice")?.addEventListener("click",e=>{A.listen($("#social-text"),e.currentTarget);setTimeout(counter,500)});
  $("#social-form")?.addEventListener("submit",e=>{
    e.preventDefault();
    const text=$("#social-text").value.trim(),platform=$("#social-platform").value;
    if(!text){A.toast("Write the post first.");return}
    if(text.length>PLATFORMS[platform].limit&&!confirm("This post is longer than "+PLATFORMS[platform].name+" allows. Save it anyway so you can shorten it later?"))return;
    A.getState().socialPosts.push({id:A.id("post"),platform,text,when:$("#social-when").value?new Date($("#social-when").value).toISOString():"",status:"draft",createdAt:new Date().toISOString()});
    A.save();$("#social-form").reset();counter();A.toast("Draft saved. Ask for approval when it is ready.");
  });
  $("#social-list")?.addEventListener("click",e=>{
    const s=A.getState(),find=attr=>{const b=e.target.closest("["+attr+"]");return b?s.socialPosts.find(p=>p.id===b.getAttribute(attr)):null};
    let p;
    if((p=find("data-social-approve"))){
      const marketer=s.agents.find(a=>a.department==="marketing");
      const t=A.addTask({title:"Publish post on "+(PLATFORMS[p.platform]?.name||"social media"),details:p.text.slice(0,300),agent:marketer?.id||""});
      p.taskId=t.id;A.requestApprovalIfNeeded(t);A.save();A.toast("Sent to the Approval Center. Nothing will be posted for you.");return;
    }
    if((p=find("data-social-copy"))){navigator.clipboard?.writeText(p.text).then(()=>A.toast("Copied. Paste it into "+(PLATFORMS[p.platform]?.name||"the platform")+"."),()=>A.toast("Could not copy. Select the text and copy it by hand."));return}
    if((p=find("data-social-posted"))){p.status="posted";p.postedAt=new Date().toISOString();const t=s.tasks.find(x=>x.id===p.taskId);if(t)A.setTaskStatus(t,"done");A.save();A.toast("Marked as posted.");return}
    if((p=find("data-social-read"))){A.speak(p.text);return}
    if((p=find("data-social-delete"))&&confirm("Delete this post?")){s.socialPosts=s.socialPosts.filter(x=>x.id!==p.id);A.save();A.toast("Post deleted.")}
  });
  A.onRender(render);
  if($("#social-platform"))counter();
})();

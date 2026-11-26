/*
 * Build Your Own App — a step-by-step course from the first line of code
 * all the way to pushing to GitHub, plus a starter-file maker and an AI
 * agent that can write the code. Every project made here is saved in the
 * workspace and recorded in the safety catalog.
 */
(() => {
  "use strict";
  const A = window.AICC;
  if (!A) { console.error("Builder needs app.js to load first."); return; }
  const $ = s => document.querySelector(s);
  const esc = A.esc;
  const PROGRESS_KEY = "aicc-builder-progress-v1";

  const LESSONS = [
    {title:"Get the free tools", where:"On your computer, in a web browser.", steps:[
      "Go to github.com and make a free account. Write your username down.",
      "Go to git-scm.com and download Git. Install it and click Next on every screen. This also installs a program called Git Bash.",
      "Go to code.visualstudio.com and download VS Code. Install it. This is where you write code.",
      "That's it. All three are free."], code:""},
    {title:"Make a folder for your app", where:"Open the program called Git Bash. Type each line, then press Enter.", steps:[
      "We use Git Bash for ALL typed commands in this course, so you never have to wonder which window to use.",
      "The first line makes a folder. The second line goes into it. The third line opens it in VS Code."],
      code:"mkdir my-first-app\ncd my-first-app\ncode ."},
    {title:"Write your first line of code", where:"In VS Code.", steps:[
      "Click File, then New File. Name it exactly: index.html",
      "Copy the code below and paste it into index.html.",
      "Press Ctrl and S together to save."],
      code:"<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>My First App</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <h1>Hello! This is my app.</h1>\n  <p id=\"message\">Press the button.</p>\n  <button id=\"my-button\">Press me</button>\n  <script src=\"app.js\"></script>\n</body>\n</html>"},
    {title:"Make it look nice", where:"In VS Code.", steps:[
      "Click File, then New File. Name it exactly: style.css",
      "Copy the code below, paste it in, and save (Ctrl + S)."],
      code:"body {\n  background: #000000;\n  color: #ffffff;\n  font-family: Arial, sans-serif;\n  font-size: 20px;\n  padding: 24px;\n}\nh1 {\n  color: #00FFFF;\n}\nbutton {\n  background: #FF1493;\n  color: #000000;\n  font-size: 20px;\n  font-weight: bold;\n  border: none;\n  border-radius: 12px;\n  padding: 14px 24px;\n}"},
    {title:"Make the button do something", where:"In VS Code.", steps:[
      "Click File, then New File. Name it exactly: app.js",
      "Copy the code below, paste it in, and save (Ctrl + S)."],
      code:"// Find the button and the message on the page\nconst button = document.getElementById(\"my-button\");\nconst message = document.getElementById(\"message\");\n\n// When the button is pressed, change the message\nlet count = 0;\nbutton.addEventListener(\"click\", function () {\n  count = count + 1;\n  message.textContent = \"You pressed the button \" + count + \" times!\";\n});"},
    {title:"Test your app", where:"In your file folder.", steps:[
      "Open the my-first-app folder on your computer.",
      "Double-click index.html. It opens in your web browser.",
      "Press the button. The message should change. If it works — you built an app!",
      "If something is wrong, check the file names are exactly index.html, style.css, and app.js."], code:""},
    {title:"Save your work with Git", where:"In Git Bash, inside your my-first-app folder. Type each line, then press Enter.", steps:[
      "The first two lines tell Git who you are. Use your GitHub username and email. You only do this once ever.",
      "The next lines save a snapshot of your app. A snapshot is called a commit."],
      code:"git config --global user.name \"YOUR-GITHUB-USERNAME\"\ngit config --global user.email \"you@example.com\"\ngit init\ngit add .\ngit commit -m \"My first app\""},
    {title:"Make an empty home on GitHub", where:"On github.com, in your web browser.", steps:[
      "Click the + at the top right, then New repository.",
      "Name it: my-first-app",
      "Do NOT check any boxes (no README). Click Create repository.",
      "Leave that page open. You need its address in the next lesson. It looks like https://github.com/YOUR-USERNAME/my-first-app.git"], code:""},
    {title:"Push your app to GitHub", where:"In Git Bash, inside your my-first-app folder. Type each line, then press Enter.", steps:[
      "Change YOUR-USERNAME to your GitHub username in the first line.",
      "The first time, a window may pop up asking you to sign in to GitHub. Sign in and approve it.",
      "Refresh your GitHub page. Your files are there. You pushed your app to GitHub!"],
      code:"git remote add origin https://github.com/YOUR-USERNAME/my-first-app.git\ngit branch -M main\ngit push -u origin main"},
    {title:"Change something and push again", where:"VS Code, then Git Bash.", steps:[
      "Change any words in index.html and save.",
      "In Git Bash, type these three lines. You do this every time you change your app."],
      code:"git add .\ngit commit -m \"Describe what you changed\"\ngit push"}
  ];

  let open = 0;
  const progress = () => { try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch { return {}; } };
  const saveProgress = p => { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {} };

  function renderLesson(){
    const root=$("#builder-lesson");if(!root)return;
    const L=LESSONS[open],done=progress();
    $("#builder-progress").textContent=Object.keys(done).length+" of "+LESSONS.length+" lessons done";
    $("#builder-list").innerHTML=LESSONS.map((l,i)=>'<button class="builder-step'+(i===open?" current":"")+(done[i]?" done":"")+'" data-lesson="'+i+'" aria-current="'+(i===open?"step":"false")+'"><span>'+(done[i]?"✓":(i+1))+'</span> '+esc(l.title)+'</button>').join("");
    root.innerHTML='<span class="eyebrow">LESSON '+(open+1)+' OF '+LESSONS.length+'</span><h2 tabindex="-1">'+esc(L.title)+'</h2><p class="builder-where"><strong>Where:</strong> '+esc(L.where)+'</p><ol class="builder-instructions">'+L.steps.map(s=>'<li>'+esc(s)+'</li>').join("")+'</ol>'
      +(L.code?'<div class="code-box"><div class="code-head"><span>Copy this exactly</span><button class="mini-button" id="builder-copy">Copy code</button></div><pre><code>'+esc(L.code)+'</code></pre></div>':'')
      +'<div class="rescue-actions"><button class="primary-button big" id="builder-done">✓ I did this lesson</button><button class="quiet-button big" id="builder-read">🔊 Read to me</button>'+(open>0?'<button class="quiet-button big" id="builder-back">← Back</button>':'')+'</div>';
  }
  function starterFile(name,idea,color){
    const safeName=esc(name),safeIdea=esc(idea);
    return '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>'+safeName+'</title>\n  <style>\n    /* Colors and text size — change these to change the look */\n    body { background:#000; color:#fff; font-family:Arial, sans-serif; font-size:20px; line-height:1.6; padding:24px; max-width:760px; margin:auto; }\n    h1 { color:'+color+'; }\n    label { display:block; font-weight:bold; margin-top:16px; }\n    input, button { font-size:20px; padding:12px; border-radius:10px; }\n    input { width:100%; box-sizing:border-box; }\n    button { background:'+color+'; color:#000; border:none; font-weight:bold; margin-top:12px; cursor:pointer; }\n    button:focus-visible, input:focus-visible { outline:3px solid #fff; outline-offset:3px; }\n    li { margin:8px 0; }\n  </style>\n</head>\n<body>\n  <h1>'+safeName+'</h1>\n  <p>'+safeIdea+'</p>\n\n  <!-- A simple list people can add to. It is saved in the browser. -->\n  <label for="item">Add something</label>\n  <input id="item" placeholder="Type here">\n  <button id="add">Add</button>\n  <ul id="list"></ul>\n\n  <script>\n    // Load anything saved before\n    const saved = JSON.parse(localStorage.getItem("my-app-items") || "[]");\n    const list = document.getElementById("list");\n    function show() {\n      list.innerHTML = "";\n      saved.forEach(function (text) {\n        const li = document.createElement("li");\n        li.textContent = text;\n        list.appendChild(li);\n      });\n    }\n    // When the Add button is pressed, save the new item\n    document.getElementById("add").addEventListener("click", function () {\n      const box = document.getElementById("item");\n      if (!box.value.trim()) return;\n      saved.push(box.value.trim());\n      localStorage.setItem("my-app-items", JSON.stringify(saved));\n      box.value = "";\n      show();\n    });\n    show();\n  </script>\n</body>\n</html>\n';
  }
  function renderProjects(){
    const root=$("#builder-projects");if(!root)return;
    const list=A.getState().projects||[];
    root.innerHTML=list.slice().reverse().map(p=>'<article class="kb-article"><h3>'+esc(p.name)+'</h3><p>'+esc(p.idea)+'</p><small>Made '+esc(new Date(p.createdAt).toLocaleString())+(p.aiCode?' · has AI-written code':'')+'</small><div class="card-actions"><button class="mini-button" data-project-download="'+esc(p.id)+'">Download index.html</button><button class="mini-button" data-project-ai="'+esc(p.id)+'">🤖 Have an agent write the code</button><button class="mini-button" data-project-delete="'+esc(p.id)+'">Delete</button></div>'+(p.aiCode?'<details class="code-box"><summary>Code written by the agent (check it before using)</summary><pre><code>'+esc(p.aiCode)+'</code></pre></details>':'')+'</article>').join("")||'<p class="resume-muted">No projects yet. Make one above.</p>';
  }
  function extractHtml(text){
    const m=String(text).match(/```(?:html)?\s*([\s\S]*?)```/i);
    return (m?m[1]:text).trim();
  }

  document.addEventListener("click",e=>{
    const L=LESSONS[open];
    const pick=e.target.closest("[data-lesson]");if(pick){open=Number(pick.dataset.lesson);renderLesson();$("#builder-lesson h2")?.focus();return}
    if(e.target.closest("#builder-copy")){navigator.clipboard?.writeText(L.code).then(()=>A.toast("Copied. Now paste it where the lesson says."),()=>A.toast("Could not copy. Select the code and copy it by hand."));return}
    if(e.target.closest("#builder-read")){A.speak(L.title+". Where: "+L.where+". "+L.steps.map((s,i)=>"Step "+(i+1)+". "+s).join(" "));return}
    if(e.target.closest("#builder-back")){open=Math.max(0,open-1);renderLesson();return}
    if(e.target.closest("#builder-done")){const p=progress();p[open]=true;saveProgress(p);if(open<LESSONS.length-1){open++;A.toast("Great work. Here is the next lesson.")}else A.toast("You finished every lesson. You pushed an app to GitHub!");renderLesson();$("#builder-lesson h2")?.focus();return}
    const s=A.getState();s.projects=s.projects||[];
    const find=attr=>{const b=e.target.closest("["+attr+"]");return b?s.projects.find(p=>p.id===b.getAttribute(attr)):null};
    let p;
    if((p=find("data-project-download"))){A.downloadFile("index.html",p.aiCode?extractHtml(p.aiCode):starterFile(p.name,p.idea,p.color||"#00FFFF"),"text/html");A.toast("Downloaded index.html. Put it in your app folder (lesson 2), then follow lessons 6 to 9.");return}
    if((p=find("data-project-delete"))){if(confirm("Delete the project \""+p.name+"\"?")){s.projects=s.projects.filter(x=>x.id!==p.id);A.save()}return}
    if((p=find("data-project-ai"))){
      if(!window.AICC_AI?.enabled()){A.toast("AI is not connected yet. You can still download the starter file.");return}
      const btn=e.target.closest("[data-project-ai]");btn.disabled=true;btn.textContent="● The agent is writing code…";
      const agent=s.agents.find(a=>a.department==="technology")||s.agents.find(a=>a.id==="agent-executive");
      window.AICC_AI.ask({task:"App name: "+p.name+"\nWhat it should do: "+p.idea,agent,mode:"code",source:"App Builder (AI code)"})
        .then(r=>{const fresh=A.getState().projects.find(x=>x.id===p.id);if(fresh){fresh.aiCode=r.text;fresh.aiProvider=r.provider}A.save();A.toast("Code is ready. Open it below, then download it.")})
        .catch(err=>{A.toast(err.message);renderProjects()});
    }
  });
  $("#builder-form")?.addEventListener("submit",e=>{
    e.preventDefault();
    const name=$("#builder-name").value.trim(),idea=$("#builder-idea").value.trim(),color=$("#builder-color").value;
    if(!name||!idea){A.toast("Give your app a name and say what it should do.");return}
    const s=A.getState();s.projects=s.projects||[];
    s.projects.push({id:A.id("project"),name,idea,color,createdAt:new Date().toISOString()});
    A.save();$("#builder-form").reset();A.toast("Project saved. Download the starter file or have an agent write the code.");
  });
  $("#builder-voice")?.addEventListener("click",e=>A.listen($("#builder-idea"),e.currentTarget));

  A.onRender(()=>{renderProjects()});
  renderLesson();
  window.AICC_BUILDER={lessons:LESSONS,starterFile};
})();

/*
 * AI Money & Models — plain-language lessons for (1) making your own AI
 * model by fine-tuning a free open model, and (2) real ways to earn money
 * with AI. Includes a training-file maker and a button that turns any money
 * path into a team workflow with small steps.
 */
(() => {
  "use strict";
  const A = window.AICC;
  if (!A) { console.error("AI Money & Models needs app.js to load first."); return; }
  const $ = s => document.querySelector(s);
  const esc = A.esc;

  const MODEL_LESSONS = [
    {title:"Understand the 3 levels", steps:[
      "Level 1 — Custom agent: give an existing AI a name, job, and rules. Free. You already do this in My AI Agents.",
      "Level 2 — Fine-tuning: teach a free open model with YOUR examples so it talks and teaches like you. Costs about $0 to $50.",
      "Level 3 — Training from zero: costs millions. Only giant companies do this. Skip it.",
      "These lessons teach Level 2."]},
    {title:"Collect your examples", steps:[
      "Write questions people ask you, and the answer YOU would give. Example: a student's trading question and your Four Up, Three Down answer.",
      "Start with 100 examples. 500 to 1,000 is better.",
      "Use the Training File Maker below. It saves your examples in the exact format training tools need (a .jsonl file).",
      "Never put private information about real people in training examples."]},
    {title:"Make free accounts", steps:[
      "Go to huggingface.co and make a free account. Hugging Face is where free AI models and training tools live.",
      "Go to colab.research.google.com and sign in with a Google account. Colab lends you a free graphics computer for training.",
      "In Hugging Face, open Settings, then Access Tokens, then create a token with 'write' permission. Keep it private. Never paste it in a chat."]},
    {title:"Train your model", steps:[
      "On huggingface.co, search for 'Unsloth'. Unsloth publishes free, ready-made Colab training notebooks for popular open models.",
      "Open one of their beginner notebooks for a small model (about 1 to 8 billion parameters). Small models train fast on the free computer.",
      "In the notebook, find the part that loads the training data. Upload your .jsonl file from the Training File Maker there.",
      "Click Runtime, then Run all. Training a small model on a few hundred examples usually takes under an hour."]},
    {title:"Test it and save it", steps:[
      "At the end of the notebook there is a part that lets you type a question. Ask it 10 questions it has never seen.",
      "If answers are wrong or strange, add more and better examples, then train again. This is normal.",
      "Use the notebook's 'save to Hugging Face' part to upload your model to your account. Set it to Private until you are ready."]},
    {title:"Use it and earn from it", steps:[
      "To try it on your own computer for free, the notebook can export it for a program called Ollama.",
      "To let customers use it, it needs a server that runs it. Hugging Face offers paid hosting for this.",
      "Then sell access as a subscription, for example an 'AI trading coach' that teaches your method.",
      "Always tell customers it is an AI, and never let it promise money results."]}
  ];

  const PATHS = [
    {id:"membership", title:"Membership platform", earn:"Monthly subscriptions", steps:["Write down exactly who it helps and the one problem it solves","Decide 3 price levels (for example Bronze, Silver, Gold)","Set up a payment page with a payment company","Invite 10 people to try it free and ask what they think","Fix the top 3 complaints, then open sign-ups"]},
    {id:"agents-for-business", title:"Build AI helpers for small businesses", earn:"Setup fee plus monthly fee", steps:["Pick one kind of business (for example restaurants or salons)","List 3 boring jobs AI could do for them (answering questions, booking, reminders)","Build one demo agent in this platform","Show it to 5 local businesses","Charge a setup fee and a small monthly fee to run it"]},
    {id:"courses", title:"Teach a course", earn:"One-time course sales", steps:["Pick one skill you know well (trading, building apps, AI)","Break it into 8 to 10 short lessons, like the Build Your Own App page","Record short videos or write the lessons","Put it on a course website with a payment button","Give the first lesson free so people can try it"]},
    {id:"expert-model", title:"Sell your own expert AI model", earn:"Subscriptions to your AI", steps:["Finish the 'Make your own AI model' lessons","Test it with 10 real people","Add a clear note: it is an AI, not financial advice","Host it so customers can use it","Charge monthly for access"]},
    {id:"digital-products", title:"Digital products", earn:"Downloads people buy", steps:["Make something people can download: agent packs, app templates, checklists","Test it yourself from start to finish","Write a simple page explaining what they get","Sell it on a digital-product store","Make a new product each month"]},
    {id:"grants", title:"Grants for accessibility tech", earn:"Grant money (no repayment)", steps:["Write one page: who you help, how, and how you will measure it","Search for disability, accessibility, and assistive-technology grants","Make a list with each grant's deadline","Have someone you trust read your application","Apply to at least 3"]},
    {id:"consulting", title:"AI setup consulting", earn:"Hourly or per-project fees", steps:["Write what you offer in 3 sentences","Make a simple checklist for setting up AI for a person or business","Do 2 setups free in exchange for reviews","Set your price per hour or per project","Ask every happy customer for one referral"]}
  ];

  let lesson = 0;
  const training = [];

  function render(){
    const L = MODEL_LESSONS[lesson];
    const list = $("#money-lessons"); if (!list) return;
    list.innerHTML = MODEL_LESSONS.map((l,i)=>'<button class="builder-step'+(i===lesson?" current":"")+'" data-money-lesson="'+i+'"><span>'+(i+1)+'</span> '+esc(l.title)+'</button>').join("");
    $("#money-lesson").innerHTML = '<span class="eyebrow">MAKE YOUR OWN AI MODEL · LESSON '+(lesson+1)+' OF '+MODEL_LESSONS.length+'</span><h2 tabindex="-1">'+esc(L.title)+'</h2><ol class="builder-instructions">'+L.steps.map(s=>'<li>'+esc(s)+'</li>').join("")+'</ol><div class="rescue-actions">'+(lesson<MODEL_LESSONS.length-1?'<button class="primary-button big" id="money-next">Next lesson →</button>':'')+'<button class="quiet-button big" id="money-read">🔊 Read to me</button>'+(lesson>0?'<button class="quiet-button big" id="money-back">← Back</button>':'')+'</div>';
    $("#money-paths").innerHTML = PATHS.map(p=>'<article class="kb-article"><h3>'+esc(p.title)+'</h3><p><strong>How you earn:</strong> '+esc(p.earn)+'</p><ol class="builder-instructions">'+p.steps.map(s=>'<li>'+esc(s)+'</li>').join("")+'</ol><div class="card-actions"><button class="primary-button" data-money-path="'+esc(p.id)+'">Make this my project</button><button class="mini-button" data-money-read="'+esc(p.id)+'">🔊 Read</button></div></article>').join("");
    $("#training-count").textContent = training.length + " example" + (training.length===1?"":"s") + " added";
  }

  document.addEventListener("click", e => {
    const pick = e.target.closest("[data-money-lesson]"); if (pick) { lesson = Number(pick.dataset.moneyLesson); render(); $("#money-lesson h2")?.focus(); return; }
    if (e.target.closest("#money-next")) { lesson = Math.min(MODEL_LESSONS.length-1, lesson+1); render(); $("#money-lesson h2")?.focus(); return; }
    if (e.target.closest("#money-back")) { lesson = Math.max(0, lesson-1); render(); return; }
    if (e.target.closest("#money-read")) { const L = MODEL_LESSONS[lesson]; A.speak(L.title+". "+L.steps.map((s,i)=>"Step "+(i+1)+". "+s).join(" ")); return; }
    const rd = e.target.closest("[data-money-read]"); if (rd) { const p = PATHS.find(x=>x.id===rd.dataset.moneyRead); A.speak(p.title+". You earn from: "+p.earn+". "+p.steps.map((s,i)=>"Step "+(i+1)+". "+s).join(" ")); return; }
    const path = e.target.closest("[data-money-path]");
    if (path) {
      const p = PATHS.find(x=>x.id===path.dataset.moneyPath), s = A.getState();
      const workflowId = A.id("workflow");
      s.workflows.unshift({id:workflowId,title:p.title,objective:"Earn with AI: "+p.title+" ("+p.earn+")",template:"money",createdAt:new Date().toISOString()});
      const lead = s.agents.find(a=>a.department==="finance") || s.agents.find(a=>a.id==="agent-executive");
      p.steps.forEach((step,i)=>{ const t = A.addTask({title:step,details:"Part of your money project: "+p.title,agent:lead?.id||"",workflowId,steps:A.breakDown(step)}); t.order = i; });
      A.save(); window.AICC_SAFETY?.record("Started money project: "+p.title, "AI Money & Models");
      A.toast("Project created with "+p.steps.length+" tasks. Opening Team Workflows."); A.showView("workflows");
      return;
    }
    if (e.target.closest("#training-download")) {
      if (!training.length) { A.toast("Add at least one example first."); return; }
      const lines = training.map(t => JSON.stringify({messages:[{role:"user",content:t.q},{role:"assistant",content:t.a}]})).join("\n") + "\n";
      A.downloadFile("training-data.jsonl", lines, "application/jsonl");
      A.toast("Downloaded training-data.jsonl. Upload it in lesson 4.");
    }
  });
  $("#training-form")?.addEventListener("submit", e => {
    e.preventDefault();
    const q = $("#training-q").value.trim(), a = $("#training-a").value.trim();
    if (!q || !a) { A.toast("Write both the question and your answer."); return; }
    training.push({q, a});
    window.AICC_SAFETY?.record(q + " — " + a, "Training File Maker");
    $("#training-form").reset(); render(); $("#training-q").focus();
    A.toast("Example added. Keep going — 100 or more is best.");
  });

  render();
  window.AICC_MONEY = {lessons: MODEL_LESSONS, paths: PATHS, training};
})();

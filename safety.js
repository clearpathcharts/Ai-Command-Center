(() => {
  "use strict";
  const KEY = "aicc-safety-request-catalog-v1";
  const $ = (selector) => document.querySelector(selector);
  let entries = read();
  let filter = "all";
  function read() { try { const value = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
  function write() { try { localStorage.setItem(KEY, JSON.stringify(entries)); return true; } catch { window.AICC?.toast?.("The safety catalog could not save. Please export or free browser storage."); return false; } }
  function classify(text) {
    const q = text.toLowerCase();
    const urgent = [
      /\b(kill myself|suicide|end my life|want to die|overdose on purpose|hurt myself|self[- ]harm)\b/,
      /\b(kill (someone|him|her|them)|hurt (someone|him|her|them)|shoot (someone|him|her|them))\b/,
      /\b(make a bomb|build an explosive|poison (someone|him|her|her))\b/
    ];
    const review = [
      /\b(threaten|blackmail|stalk|track (someone|my ex)|spy on|break into|steal|weapon|explosive|poison)\b/,
      /\b(bypass (security|safety)|hide evidence|evade law enforcement|fake (an identity|documents))\b/,
      /\b(abuse|being abused|being exploited|coerced|unsafe at home|being followed)\b/,
      /\b(can't tell what's real|voices telling me|someone is controlling my thoughts)\b/
    ];
    if (urgent.some(rule => rule.test(q))) return {level:"urgent",label:"Urgent review",reason:"Language matched a high-priority safety rule. A human should review the context promptly."};
    if (review.some(rule => rule.test(q))) return {level:"review",label:"Needs review",reason:"Language matched a safety-review rule. Check the full context before deciding what it means."};
    return {level:"low",label:"Lower concern",reason:"No current keyword rule matched. This does not prove a request is safe."};
  }
  function record(text, source) {
    const clean = String(text || "").trim();
    if (!clean) return;
    const result = classify(clean);
    entries.unshift({id:"request-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7),text:clean,source,createdAt:new Date().toISOString(),...result});
    if (entries.length > 2000) entries = entries.slice(0,2000);
    write();
    render();
  }
  function esc(value) { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function render() {
    const root=$("#safety-list"); if (!root) return;
    const counts={low:0,review:0,urgent:0}; entries.forEach(item=>counts[item.level]=(counts[item.level]||0)+1);
    $("#safety-total").textContent=entries.length; $("#safety-low").textContent=counts.low; $("#safety-review").textContent=counts.review; $("#safety-urgent").textContent=counts.urgent;
    $("#nav-safety-count").textContent=counts.review+counts.urgent;
    const query=($("#safety-search")?.value||"").toLowerCase();
    const shown=entries.filter(item=>(filter==="all"||item.level===filter)&&(!query||item.text.toLowerCase().includes(query)));
    root.innerHTML=shown.map(item=>'<article class="safety-entry"><div class="safety-entry-top"><span class="safety-level '+item.level+'">'+esc(item.label)+'</span><time>'+new Date(item.createdAt).toLocaleString()+'</time></div><p>'+esc(item.text)+'</p><small>'+esc(item.reason)+' · Source: '+esc(item.source)+'</small><button class="mini-button" data-safety-delete="'+esc(item.id)+'" aria-label="Delete this locally stored request">Delete request</button></article>').join("")||'<div class="empty-state"><strong>No requests found</strong>Submitted requests will appear here after cataloging.</div>';
  }
  // Capture before the app's submit handlers process the request.
  document.addEventListener("submit", event => {
    if (event.target?.id === "command-form") record($("#command-input")?.value,"Workspace request");
  }, true);
  // Executive Brain uses a button to generate a plan rather than a form.
  document.addEventListener("click", event => {
    if (event.target.closest("#executive-plan")) record($("#executive-request")?.value,"Executive Brain");
    const del=event.target.closest("[data-safety-delete]");
    if (del) { entries=entries.filter(item=>item.id!==del.dataset.safetyDelete); write(); render(); }
    if (event.target.closest("#safety-clear")) {
      if (entries.length && confirm("Clear every locally cataloged request on this device? This cannot be undone.")) { entries=[]; write(); render(); }
    }
  }, true);
  $("#safety-search")?.addEventListener("input",render);
  $("#safety-filter")?.addEventListener("change",event=>{filter=event.target.value;render();});
  window.AICC_SAFETY={record,screen:classify,refresh:render};
  render();
})();
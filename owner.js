/*
 * Owner area — the Safety Catalog is hidden from regular users and only
 * opens with the owner's private code. The code is checked by the owner's
 * server (which locks after 5 wrong tries). It is never in this website.
 * Unlocking lasts until this browser tab is closed.
 */
(() => {
  "use strict";
  const A = window.AICC;
  if (!A) return;
  const CONFIG = window.AICC_CONFIG || {};
  const $ = s => document.querySelector(s);
  const FLAG = "aicc-owner-unlocked-v1";
  const unlocked = () => { try { return sessionStorage.getItem(FLAG) === "yes"; } catch { return false; } };

  function apply(){
    const on = unlocked();
    document.body.classList.toggle("owner-unlocked", on);
    const status = $("#owner-status");
    if (status) status.textContent = on ? "Owner area is open in this tab." : "Locked.";
    $("#owner-lock")?.toggleAttribute("hidden", !on);
    $("#owner-form")?.toggleAttribute("hidden", on);
    if (!on && document.querySelector("#view-safety.active")) A.showView("settings");
  }

  // The code is checked by the owner's server, so it never appears in this website.
  $("#owner-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const code = $("#owner-code").value.trim();
    $("#owner-code").value = "";
    if (!code) { A.toast("Type the owner code first."); return; }
    if (!CONFIG.ownerCheckUrl) { A.toast("The owner area needs the server address in config.js."); return; }
    try {
      const res = await fetch(CONFIG.ownerCheckUrl, {headers: {"X-Admin-Token": code}});
      if (res.ok) {
        try { sessionStorage.setItem(FLAG, "yes"); } catch {}
        apply(); A.showView("safety"); A.toast("Owner area unlocked.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      A.toast(data.detail || "Wrong code.");
    } catch { A.toast("Could not reach the server to check the code. Please try again."); }
  });

  $("#owner-lock")?.addEventListener("click", () => {
    try { sessionStorage.removeItem(FLAG); } catch {}
    apply(); A.toast("Owner area locked.");
  });

  // Block opening the catalog by any other route while locked.
  document.addEventListener("click", e => {
    if (e.target.closest('[data-view="safety"]') && !unlocked()) {
      e.stopImmediatePropagation(); e.preventDefault();
      A.showView("settings"); A.toast("The Safety Catalog needs the owner code.");
    }
  }, true);

  apply();
})();

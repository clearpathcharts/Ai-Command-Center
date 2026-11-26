/*
 * Site settings. This is the ONLY file you need to change.
 *
 * serverAddress: the web address of YOUR backend server, with nothing after it.
 *   Example: "https://safety.yourdomain.com"
 *   When this is filled in:
 *     - safety reports are sent to your private Safety Review page, and
 *     - agents can use the connected AI companies (Groq, Gemini, OpenRouter, xAI).
 *   Leave it as "" (empty) to keep everything on each person's device, with no AI.
 */
window.AICC_CONFIG = {
  serverAddress: ""
};
(function(){
  var base = String(window.AICC_CONFIG.serverAddress || "").trim().replace(/\/+$/, "");
  window.AICC_CONFIG.safetyReportUrl = window.AICC_CONFIG.safetyReportUrl || (base ? base + "/api/safety/report" : "");
  window.AICC_CONFIG.aiChatUrl = base ? base + "/api/ai/chat" : "";
  window.AICC_CONFIG.aiStatusUrl = base ? base + "/api/ai/providers" : "";
  // The owner code is checked by the server. It is never stored in this website.
  window.AICC_CONFIG.ownerCheckUrl = base ? base + "/api/admin/safety?limit=1" : "";
})();

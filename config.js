/*
 * Site settings. This is the ONLY file you need to change to turn on
 * central safety reporting.
 *
 * safetyReportUrl: the web address of YOUR backend server, ending in
 *   /api/safety/report
 *   Example: "https://safety.yourdomain.com/api/safety/report"
 *   Leave it as "" (empty) to keep safety entries only on each person's device.
 */
window.AICC_CONFIG = {
  safetyReportUrl: ""
};

/* home-page.js -- fills in live stats on the home page from localStorage */

document.addEventListener("DOMContentLoaded", () => {
  const stats = getStats();
  const scansEl = document.getElementById("statScansRun");
  const threatsEl = document.getElementById("statThreatsFlagged");
  if (scansEl) scansEl.textContent = stats.total;
  if (threatsEl) threatsEl.textContent = stats.threats_caught;
});

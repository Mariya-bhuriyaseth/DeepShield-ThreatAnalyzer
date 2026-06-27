/* common.js -- shared helpers used by every page */

/**
 * Show a small Bootstrap toast in the bottom-right corner.
 * type: 'success' | 'danger' | 'info'
 */
function dsToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const icons = {
    success: "bi-check-circle-fill",
    danger: "bi-exclamation-triangle-fill",
    info: "bi-info-circle-fill",
  };
  const colors = {
    success: "var(--safe)",
    danger: "var(--critical)",
    info: "var(--accent)",
  };

  const el = document.createElement("div");
  el.className = "toast align-items-center border-0";
  el.setAttribute("role", "alert");
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body d-flex align-items-center gap-2">
        <i class="bi ${icons[type] || icons.info}" style="color:${colors[type] || colors.info};"></i>
        <span>${message}</span>
      </div>
      <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>`;
  container.appendChild(el);

  if (typeof bootstrap !== "undefined" && bootstrap.Toast) {
    const toast = new bootstrap.Toast(el, { delay: 4200 });
    toast.show();
    el.addEventListener("hidden.bs.toast", () => el.remove());
  } else {
    // Bootstrap's JS bundle failed to load (blocked CDN, offline, ad-blocker).
    // Show the toast element plainly instead of throwing, so a missing
    // third-party script can never silently break the calling code.
    el.classList.add("show");
    setTimeout(() => el.remove(), 4200);
  }
}

/**
 * Build the markup for the signature "scan-ring" gauge.
 * score: 0-100, levelKey: 'low' | 'moderate' | 'high' | 'critical'
 * sizeClass: '' for full size, 'scan-ring-mini' for the small variant
 */
function dsScanRingMarkup(score, levelKey, sizeClass = "") {
  return `
    <div class="scan-ring-wrap level-${levelKey} ${sizeClass}">
      <div class="scan-ring-sweep"></div>
      <div class="scan-ring-track"></div>
      <div class="scan-ring-core">
        <div class="scan-ring-score">${score}</div>
        <div class="scan-ring-score-max">/ 100</div>
      </div>
    </div>`;
}

function dsRiskBadgeMarkup(levelKey, levelLabel) {
  return `<span class="risk-badge level-${levelKey}">${levelLabel}</span>`;
}

function dsEscapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function dsFormatDate(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch (e) {
    return isoString;
  }
}

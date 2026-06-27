/* dashboard-page.js -- powers dashboard.html (localStorage-based, no backend) */

const LEVEL_KEY_MAP = {
  "Low Risk": "low",
  "Moderate Risk": "moderate",
  "High Risk": "high",
  "Critical Risk": "critical",
};

const TYPE_LABEL_MAP = { url: "Link", text: "Message", qr: "QR Code" };

let currentHistory = [];
let riskChart = null;

document.addEventListener("DOMContentLoaded", () => {
  // All event listeners are attached FIRST, before refreshAll() runs.
  // refreshAll() renders the Chart.js doughnut, and if that CDN script ever
  // fails to load (ad-blocker, restrictive network, offline CDN), it must
  // not be able to throw and silently prevent these listeners -- and with
  // them, every button on the page -- from ever being attached.
  document.getElementById("refreshBtn").addEventListener("click", () => refreshAll(true));
  document.getElementById("searchInput").addEventListener("input", applyFilters);
  document.getElementById("filterType").addEventListener("change", applyFilters);
  document.getElementById("clearAllBtn").addEventListener("click", () => {
    if (typeof bootstrap !== "undefined") {
      new bootstrap.Modal(document.getElementById("clearConfirmModal")).show();
    } else {
      dsToast("Could not open the confirmation dialog — a required script failed to load. Please refresh and try again.", "danger");
    }
  });
  document.getElementById("confirmClearBtn").addEventListener("click", clearAllHistory);

  document.getElementById("historyTableBody").addEventListener("click", (e) => {
    const viewBtn = e.target.closest("[data-action='view']");
    const delBtn = e.target.closest("[data-action='delete']");
    if (viewBtn) showDetails(parseInt(viewBtn.dataset.id, 10));
    if (delBtn) deleteEntry(parseInt(delBtn.dataset.id, 10));
  });

  refreshAll(false);
});

function applyFilters() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const type = document.getElementById("filterType").value;

  const filtered = currentHistory.filter((item) => {
    const matchesType = type === "all" || item.scan_type === type;
    const matchesQuery =
      !query ||
      item.input_summary.toLowerCase().includes(query) ||
      item.risk_level.toLowerCase().includes(query);
    return matchesType && matchesQuery;
  });

  renderTable(filtered);
}

function renderTable(items) {
  const tbody = document.getElementById("historyTableBody");
  const emptyState = document.getElementById("emptyState");

  if (!items.length) {
    tbody.innerHTML = "";
    emptyState.classList.remove("d-none");
    return;
  }
  emptyState.classList.add("d-none");

  tbody.innerHTML = items
    .map((item) => {
      const levelKey = LEVEL_KEY_MAP[item.risk_level] || "low";
      const typeLabel = TYPE_LABEL_MAP[item.scan_type] || item.scan_type;
      return `
        <tr>
          <td class="text-muted-soft small mono">${dsFormatDate(item.created_at)}</td>
          <td><span class="scan-type-chip">${typeLabel}</span></td>
          <td style="max-width: 320px;" class="text-truncate">${dsEscapeHtml(item.input_summary)}</td>
          <td class="mono fw-bold">${item.risk_score}</td>
          <td>${dsRiskBadgeMarkup(levelKey, item.risk_level)}</td>
          <td class="text-end">
            <div class="d-inline-flex gap-2">
              <button class="icon-btn" data-action="view" data-id="${item.id}" title="View details">
                <i class="bi bi-eye"></i>
              </button>
              <button class="icon-btn danger" data-action="delete" data-id="${item.id}" title="Delete">
                <i class="bi bi-trash3"></i>
              </button>
            </div>
          </td>
        </tr>`;
    })
    .join("");
}

function renderChart(stats) {
  const ctx = document.getElementById("riskChart");
  const chartEmptyState = document.getElementById("chartEmptyState");

  if (typeof Chart === "undefined") {
    // Chart.js failed to load (blocked CDN, offline, ad-blocker). The table
    // and stat cards still work fine off local data -- just skip the chart
    // instead of letting this throw and break the rest of the page.
    ctx.classList.add("d-none");
    chartEmptyState.classList.remove("d-none");
    const msgEl = chartEmptyState.querySelector("p");
    if (msgEl) msgEl.textContent = "Chart could not load, but your scan data is safe and visible in the table.";
    return;
  }

  const dataValues = [stats.low, stats.moderate, stats.high, stats.critical];
  const hasData = dataValues.some((v) => v > 0);

  ctx.classList.toggle("d-none", !hasData);
  chartEmptyState.classList.toggle("d-none", hasData);
  if (!hasData) return;

  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  if (riskChart) riskChart.destroy();
  riskChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Low", "Moderate", "High", "Critical"],
      datasets: [
        {
          data: dataValues,
          backgroundColor: [cssVar("--safe"), cssVar("--moderate"), cssVar("--high"), cssVar("--critical")],
          borderColor: cssVar("--surface"),
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: cssVar("--text-muted"), font: { family: "Inter", size: 12 }, padding: 14 },
        },
      },
      cutout: "68%",
    },
  });
}

function refreshAll(showToast) {
  currentHistory = getHistory(200);
  applyFilters();

  const stats = getStats();
  updateStatCards(stats);
  renderChart(stats);

  if (showToast) dsToast("Dashboard refreshed.", "success");
}

function updateStatCards(stats) {
  document.getElementById("statTotal").textContent = stats.total;
  document.getElementById("statLow").textContent = stats.low;
  document.getElementById("statModerate").textContent = stats.moderate;
  document.getElementById("statDangerous").textContent = stats.high + stats.critical;
}

function deleteEntry(id) {
  const ok = deleteScan(id);
  if (ok) {
    refreshAll(false);
    dsToast("Scan record deleted.", "success");
  } else {
    dsToast("Could not delete this record.", "danger");
  }
}

function clearAllHistory() {
  clearHistory();
  if (typeof bootstrap !== "undefined") {
    const modalEl = document.getElementById("clearConfirmModal");
    const instance = bootstrap.Modal.getInstance(modalEl);
    if (instance) instance.hide();
  }
  refreshAll(false);
  dsToast("All scan history cleared.", "success");
}

function showDetails(id) {
  const item = currentHistory.find((h) => h.id === id) || getScan(id);
  if (!item) return;

  const levelKey = LEVEL_KEY_MAP[item.risk_level] || "low";
  const body = document.getElementById("detailsModalBody");
  body.innerHTML = `
    <div class="d-flex flex-wrap gap-4 align-items-center mb-3">
      <div>${dsScanRingMarkup(item.risk_score, levelKey, "scan-ring-mini")}</div>
      <div>
        ${dsRiskBadgeMarkup(levelKey, item.risk_level)}
        <p class="small text-muted-soft mt-2 mb-1">${dsFormatDate(item.created_at)} &middot; ${TYPE_LABEL_MAP[item.scan_type] || item.scan_type}</p>
        <p class="mono small mb-0" style="word-break: break-all;">${dsEscapeHtml(item.full_input)}</p>
      </div>
    </div>
    <hr style="border-color: var(--border-soft);">
    <div class="row g-4">
      <div class="col-md-6">
        <div class="ds-section-label"><i class="bi bi-exclamation-triangle"></i> Reasons detected</div>
        <ul class="reason-list">
          ${item.reasons.map((r) => `<li><i class="bi bi-dot"></i><span>${dsEscapeHtml(r)}</span></li>`).join("")}
        </ul>
      </div>
      <div class="col-md-6">
        <div class="ds-section-label"><i class="bi bi-lightbulb"></i> Recommended actions</div>
        <ul class="advice-list">
          ${item.advice.map((a) => `<li><i class="bi bi-check2"></i><span>${dsEscapeHtml(a)}</span></li>`).join("")}
        </ul>
      </div>
    </div>
  `;
  if (typeof bootstrap !== "undefined") {
    new bootstrap.Modal(document.getElementById("detailsModal")).show();
  } else {
    dsToast("Could not open the details dialog — a required script failed to load. Please refresh and try again.", "danger");
  }
}

/* ==========================================================================
   storage.js
   --------------------------------------------------------------------------
   Replaces the SQLite database from the Flask version. Since this is a
   static site with no backend server, scan history is saved in the
   visitor's own browser using localStorage. History is per-browser/per-
   device -- it will not be the same across different devices, and clearing
   browser data will clear it.
   ========================================================================== */

const DS_STORAGE_KEY = "deepshield_history";

function _dsReadAll() {
  try {
    const raw = localStorage.getItem(DS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function _dsWriteAll(items) {
  try {
    localStorage.setItem(DS_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    // localStorage can throw if full or disabled (e.g. private browsing) --
    // fail silently rather than breaking the scan flow.
    console.warn("DeepShield: could not save to localStorage.", e);
  }
}

function dsSummarize(text, length = 160) {
  const clean = (text || "").trim().replace(/\n/g, " ");
  if (clean.length <= length) return clean;
  return clean.slice(0, length).trim() + "...";
}

/**
 * Save a completed scan result to history.
 * `result` is the object returned by runAnalysis() in analyzer-engine.js.
 * `fullInput` is the original raw input (link, message, or decoded QR text).
 * Returns the new record's id.
 */
function saveScan(result, fullInput) {
  const items = _dsReadAll();
  const nextId = items.length ? Math.max(...items.map((i) => i.id)) + 1 : 1;

  const record = {
    id: nextId,
    scan_type: result.scan_type,
    input_summary: dsSummarize(fullInput),
    full_input: fullInput,
    risk_score: result.risk_score,
    risk_level: result.risk_level,
    reasons: result.reasons,
    advice: result.advice,
    created_at: new Date().toISOString(),
  };

  items.unshift(record); // newest first
  _dsWriteAll(items);
  return record.id;
}

function getHistory(limit = 200) {
  return _dsReadAll().slice(0, limit);
}

function getScan(id) {
  return _dsReadAll().find((i) => i.id === id) || null;
}

function deleteScan(id) {
  const items = _dsReadAll();
  const filtered = items.filter((i) => i.id !== id);
  const changed = filtered.length !== items.length;
  if (changed) _dsWriteAll(filtered);
  return changed;
}

function clearHistory() {
  _dsWriteAll([]);
}

function getStats() {
  const items = _dsReadAll();
  const total = items.length;
  const low = items.filter((i) => i.risk_level === "Low Risk").length;
  const moderate = items.filter((i) => i.risk_level === "Moderate Risk").length;
  const high = items.filter((i) => i.risk_level === "High Risk").length;
  const critical = items.filter((i) => i.risk_level === "Critical Risk").length;

  return {
    total,
    low,
    moderate,
    high,
    critical,
    threats_caught: high + critical,
  };
}

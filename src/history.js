const fs = require("fs");
const path = require("path");

const DEFAULT_HISTORY_LIMIT = 120;

function toHistoryEntry(report) {
  return {
    scannedAt: report.scannedAt,
    score: report.score,
    summary: report.summary,
    fileCount: report.fileCount,
    durationMs: report.durationMs,
    preset: report.config && report.config.preset ? report.config.preset : null,
    changedSince: report.config && report.config.changedSince ? report.config.changedSince : null
  };
}

function normalizeEntries(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object" && Array.isArray(value.entries)) {
    return value.entries;
  }
  return [];
}

function loadHistory(historyPath) {
  const resolved = path.resolve(historyPath);
  if (!fs.existsSync(resolved)) {
    return { path: resolved, entries: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (_error) {
    throw new Error(`Invalid JSON in history file: ${resolved}`);
  }

  return {
    path: resolved,
    entries: normalizeEntries(parsed)
  };
}

function trimHistory(entries, limit) {
  if (!Array.isArray(entries)) {
    return [];
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    return entries;
  }
  return entries.slice(-limit);
}

function appendHistory(historyPath, entry, limit = DEFAULT_HISTORY_LIMIT) {
  const loaded = loadHistory(historyPath);
  const nextEntries = trimHistory([...loaded.entries, entry], limit);
  fs.mkdirSync(path.dirname(loaded.path), { recursive: true });
  fs.writeFileSync(
    loaded.path,
    JSON.stringify(
      {
        tool: "repo-sleep-doctor",
        version: "0.2.0",
        entries: nextEntries
      },
      null,
      2
    ),
    "utf8"
  );
  return nextEntries;
}

module.exports = {
  DEFAULT_HISTORY_LIMIT,
  toHistoryEntry,
  loadHistory,
  appendHistory,
  trimHistory
};


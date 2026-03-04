const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function sortObjectEntries(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const sorted = {};
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    sorted[key] = value[key];
  }
  return sorted;
}

function createConfigSignature(config) {
  const payload = {
    textExtensions: Array.from(new Set((config.textExtensions || []).map((ext) => String(ext).toLowerCase()))).sort(),
    maxFileSizeMb: Number(config.maxFileSizeMb || 0),
    maxTextFileSizeKb: Number(config.maxTextFileSizeKb || 0),
    maxFindingsPerRule: Number(config.maxFindingsPerRule || 0),
    disabledRules: Array.from(new Set((config.disabledRules || []).map((rule) => String(rule).trim()))).sort(),
    severityOverrides: sortObjectEntries(config.severityOverrides || {})
  };
  const serialized = JSON.stringify(payload);
  return crypto.createHash("sha1").update(serialized).digest("hex");
}

function fileSignature(file) {
  const size = Number.isFinite(Number(file && file.sizeBytes)) ? Number(file.sizeBytes) : 0;
  const mtimeMs = Number.isFinite(Number(file && file.mtimeMs)) ? Number(file.mtimeMs) : 0;
  return `${size}:${Math.trunc(mtimeMs)}`;
}

function normalizeCacheEntries(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized = {};
  for (const [relPath, entry] of Object.entries(value)) {
    if (typeof relPath !== "string" || !relPath.trim()) {
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    if (typeof entry.signature !== "string" || !entry.signature) {
      continue;
    }
    if (!Array.isArray(entry.findings)) {
      continue;
    }
    normalized[relPath] = {
      signature: entry.signature,
      findings: entry.findings,
      meta: entry.meta && typeof entry.meta === "object" && !Array.isArray(entry.meta) ? entry.meta : {}
    };
  }
  return normalized;
}

function loadScanCache(cachePath, configSignature) {
  const resolved = path.resolve(cachePath);
  if (!fs.existsSync(resolved)) {
    return {
      path: resolved,
      status: "missing",
      entries: {}
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (_error) {
    return {
      path: resolved,
      status: "invalid",
      entries: {}
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      path: resolved,
      status: "invalid",
      entries: {}
    };
  }

  if (parsed.configSignature !== configSignature) {
    return {
      path: resolved,
      status: "stale",
      entries: {}
    };
  }

  return {
    path: resolved,
    status: "ready",
    entries: normalizeCacheEntries(parsed.entries)
  };
}

function saveScanCache(cachePath, configSignature, entries) {
  const resolved = path.resolve(cachePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(
    resolved,
    JSON.stringify(
      {
        tool: "repo-sleep-doctor",
        cacheVersion: 1,
        generatedAt: new Date().toISOString(),
        configSignature,
        entries: normalizeCacheEntries(entries)
      },
      null,
      2
    ),
    "utf8"
  );
  return resolved;
}

module.exports = {
  createConfigSignature,
  fileSignature,
  loadScanCache,
  saveScanCache
};

const fs = require("fs");
const path = require("path");
const { disabledRulesForPreset, normalizePreset } = require("./rule-catalog");

const DEFAULT_CONFIG = Object.freeze({
  ignoreDirs: [
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    ".turbo",
    ".idea",
    ".vscode"
  ],
  ignorePatterns: ["**/*.min.js", "**/*.map"],
  useGitIgnore: true,
  additionalIgnoreFiles: [".repo-sleep-doctorignore"],
  textExtensions: [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".md",
    ".txt",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".c",
    ".cc",
    ".cpp",
    ".h",
    ".hpp",
    ".css",
    ".scss",
    ".html",
    ".yaml",
    ".yml",
    ".toml",
    ".sh",
    ".ps1"
  ],
  maxFileSizeMb: 1,
  maxTextFileSizeKb: 256,
  maxFiles: 6000,
  maxFindingsPerRule: 80,
  disabledRules: [],
  severityOverrides: {},
  extends: [],
  rulePacks: [],
  ruleOverrides: {},
  suppressions: []
});

function mergeStringArrays(defaultList, customList) {
  const values = [...(defaultList || [])];

  if (Array.isArray(customList)) {
    for (const item of customList) {
      if (typeof item === "string" && item.trim().length > 0) {
        values.push(item.trim());
      }
    }
  }

  return Array.from(new Set(values));
}

function safePositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function safeBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

function normalizeSeverity(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "p0" || normalized === "p1" || normalized === "p2") {
    return normalized;
  }
  return null;
}

function normalizeSeverityOverrides(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result = {};
  for (const [ruleId, severity] of Object.entries(value)) {
    if (typeof ruleId !== "string" || !ruleId.trim()) {
      continue;
    }
    const normalized = normalizeSeverity(severity);
    if (normalized) {
      result[ruleId.trim()] = normalized;
    }
  }
  return result;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    throw new Error(`Invalid JSON file: ${filePath}`);
  }
}

function normalizeRuleOverrides(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result = {};
  for (const [ruleId, entry] of Object.entries(value)) {
    if (!ruleId || typeof ruleId !== "string") {
      continue;
    }
    const normalized = {
      enabled: undefined,
      severity: undefined
    };
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      if (typeof entry.enabled === "boolean") {
        normalized.enabled = entry.enabled;
      }
      const severity = normalizeSeverity(entry.severity);
      if (severity) {
        normalized.severity = severity;
      }
      if (normalized.enabled !== undefined || normalized.severity !== undefined) {
        result[ruleId.trim()] = normalized;
      }
    }
  }
  return result;
}

function normalizeSuppressions(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const next = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const ruleId = typeof item.ruleId === "string" ? item.ruleId.trim() : "";
    const pathPattern = typeof item.path === "string" ? item.path.trim() : "";
    if (!ruleId && !pathPattern) {
      continue;
    }
    next.push({
      ruleId: ruleId || null,
      path: pathPattern || null,
      reason: typeof item.reason === "string" ? item.reason.trim() : null,
      expiresAt: typeof item.expiresAt === "string" ? item.expiresAt.trim() : null
    });
  }
  return next;
}

function normalizePackConfig(raw, packPath) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  return {
    id: typeof raw.id === "string" ? raw.id.trim() : path.basename(packPath),
    disabledRules: mergeStringArrays([], raw.disabledRules),
    severityOverrides: normalizeSeverityOverrides(raw.severityOverrides),
    ruleOverrides: normalizeRuleOverrides(raw.ruleOverrides),
    suppressions: normalizeSuppressions(raw.suppressions)
  };
}

function loadRulePacks(rootPath, packPaths) {
  const loaded = [];
  for (const item of packPaths || []) {
    if (typeof item !== "string" || !item.trim()) {
      continue;
    }
    const resolved = path.isAbsolute(item) ? item : path.resolve(rootPath, item);
    const payload = readJsonIfExists(resolved);
    if (!payload) {
      continue;
    }
    const normalized = normalizePackConfig(payload, resolved);
    if (normalized) {
      loaded.push({
        path: resolved,
        ...normalized
      });
    }
  }
  return loaded;
}

function readConfigFile(configPath) {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const raw = fs.readFileSync(configPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in config file: ${configPath}`);
  }
}

function loadConfig(rootPath, cliOptions = {}) {
  const configPath = cliOptions.configPath
    ? path.resolve(cliOptions.configPath)
    : path.join(rootPath, ".repo-sleep-doctor.json");

  const fileConfig = readConfigFile(configPath);
  const extendsList = mergeStringArrays([], fileConfig.extends);
  const presetFromExtends = extendsList.length > 0 ? extendsList[0] : null;
  const presetInput = cliOptions.preset !== undefined ? cliOptions.preset : fileConfig.preset || presetFromExtends;
  const preset = normalizePreset(presetInput);
  const rulePacks = mergeStringArrays([], fileConfig.rulePacks);
  const loadedRulePacks = loadRulePacks(rootPath, rulePacks);

  const presetDisabledRules = disabledRulesForPreset(preset);
  let mergedDisabledRules = mergeStringArrays(presetDisabledRules, fileConfig.disabledRules);
  for (const pack of loadedRulePacks) {
    mergedDisabledRules = mergeStringArrays(mergedDisabledRules, pack.disabledRules);
  }
  const ruleOverrides = normalizeRuleOverrides(fileConfig.ruleOverrides);
  for (const pack of loadedRulePacks) {
    Object.assign(ruleOverrides, pack.ruleOverrides);
  }

  const severityOverrides = normalizeSeverityOverrides(fileConfig.severityOverrides);
  for (const pack of loadedRulePacks) {
    Object.assign(severityOverrides, pack.severityOverrides);
  }
  for (const [ruleId, override] of Object.entries(ruleOverrides)) {
    if (override && typeof override === "object") {
      if (override.enabled === false) {
        mergedDisabledRules = mergeStringArrays(mergedDisabledRules, [ruleId]);
      }
      if (override.enabled === true) {
        mergedDisabledRules = mergedDisabledRules.filter((item) => item !== ruleId);
      }
      if (override.severity) {
        severityOverrides[ruleId] = override.severity;
      }
    }
  }

  const suppressions = [
    ...normalizeSuppressions(fileConfig.suppressions),
    ...loadedRulePacks.flatMap((pack) => pack.suppressions || [])
  ];

  const merged = {
    ignoreDirs: mergeStringArrays(DEFAULT_CONFIG.ignoreDirs, fileConfig.ignoreDirs),
    ignorePatterns: mergeStringArrays(DEFAULT_CONFIG.ignorePatterns, fileConfig.ignorePatterns),
    useGitIgnore: safeBoolean(fileConfig.useGitIgnore, DEFAULT_CONFIG.useGitIgnore),
    additionalIgnoreFiles: mergeStringArrays(DEFAULT_CONFIG.additionalIgnoreFiles, fileConfig.additionalIgnoreFiles),
    textExtensions: mergeStringArrays(DEFAULT_CONFIG.textExtensions, fileConfig.textExtensions),
    maxFileSizeMb: safePositiveNumber(fileConfig.maxFileSizeMb, DEFAULT_CONFIG.maxFileSizeMb),
    maxTextFileSizeKb: safePositiveNumber(fileConfig.maxTextFileSizeKb, DEFAULT_CONFIG.maxTextFileSizeKb),
    maxFiles: safePositiveNumber(fileConfig.maxFiles, DEFAULT_CONFIG.maxFiles),
    maxFindingsPerRule: safePositiveNumber(fileConfig.maxFindingsPerRule, DEFAULT_CONFIG.maxFindingsPerRule),
    preset,
    extends: extendsList,
    rulePacks,
    loadedRulePacks,
    ruleOverrides,
    suppressions,
    disabledRules: mergeStringArrays(DEFAULT_CONFIG.disabledRules, mergedDisabledRules),
    severityOverrides,
    configPath: fs.existsSync(configPath) ? configPath : null
  };

  if (cliOptions.maxFiles !== undefined) {
    merged.maxFiles = safePositiveNumber(cliOptions.maxFiles, merged.maxFiles);
  }
  if (cliOptions.maxFileSizeMb !== undefined) {
    merged.maxFileSizeMb = safePositiveNumber(cliOptions.maxFileSizeMb, merged.maxFileSizeMb);
  }
  if (cliOptions.maxTextFileSizeKb !== undefined) {
    merged.maxTextFileSizeKb = safePositiveNumber(cliOptions.maxTextFileSizeKb, merged.maxTextFileSizeKb);
  }
  if (cliOptions.maxFindingsPerRule !== undefined) {
    merged.maxFindingsPerRule = safePositiveNumber(cliOptions.maxFindingsPerRule, merged.maxFindingsPerRule);
  }
  if (cliOptions.useGitIgnore !== undefined) {
    merged.useGitIgnore = safeBoolean(cliOptions.useGitIgnore, merged.useGitIgnore);
  }

  return merged;
}

module.exports = {
  DEFAULT_CONFIG,
  loadConfig
};

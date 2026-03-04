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
  severityOverrides: {}
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
  const presetInput = cliOptions.preset !== undefined ? cliOptions.preset : fileConfig.preset;
  const preset = normalizePreset(presetInput);

  const presetDisabledRules = disabledRulesForPreset(preset);
  const mergedDisabledRules = mergeStringArrays(presetDisabledRules, fileConfig.disabledRules);

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
    disabledRules: mergeStringArrays(DEFAULT_CONFIG.disabledRules, mergedDisabledRules),
    severityOverrides: normalizeSeverityOverrides(fileConfig.severityOverrides),
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

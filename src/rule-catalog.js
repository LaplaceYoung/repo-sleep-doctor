const ALL_RULE_IDS = Object.freeze([
  "merge-marker",
  "private-key-block",
  "aws-key",
  "generic-secret",
  "console-call",
  "debugger",
  "print-call",
  "todo-comment",
  "large-file",
  "missing-readme",
  "readme-install",
  "readme-usage",
  "missing-build-script",
  "missing-test-script",
  "missing-lint-script",
  "invalid-package-json",
  "missing-tests"
]);

const PRESET_RULES = Object.freeze({
  all: Object.freeze([...ALL_RULE_IDS]),
  release: Object.freeze([
    "merge-marker",
    "console-call",
    "debugger",
    "print-call",
    "todo-comment",
    "large-file",
    "missing-readme",
    "readme-install",
    "readme-usage",
    "missing-build-script",
    "missing-test-script",
    "missing-lint-script",
    "invalid-package-json",
    "missing-tests"
  ]),
  security: Object.freeze(["merge-marker", "private-key-block", "aws-key", "generic-secret"])
});

function normalizePreset(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (!PRESET_RULES[normalized]) {
    throw new Error(`Invalid preset: ${value}. Supported presets: ${Object.keys(PRESET_RULES).join(", ")}`);
  }

  return normalized;
}

function disabledRulesForPreset(preset) {
  const normalized = normalizePreset(preset);
  if (!normalized || normalized === "all") {
    return [];
  }

  const enabled = new Set(PRESET_RULES[normalized]);
  return ALL_RULE_IDS.filter((ruleId) => !enabled.has(ruleId));
}

module.exports = {
  ALL_RULE_IDS,
  PRESET_RULES,
  normalizePreset,
  disabledRulesForPreset
};


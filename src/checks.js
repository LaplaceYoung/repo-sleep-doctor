const fs = require("fs");
const path = require("path");

const MERGE_MARKER_RE = /^(<{7}|={7}|>{7})/;
const TODO_RE = /\b(TODO|FIXME|HACK|XXX)\b/i;
const README_INSTALL_RE = /^#{1,3}\s*(installation|install)\b/im;
const README_USAGE_RE = /^#{1,3}\s*(usage|quick start|get started)\b/im;

const MERGE_HINTS = ["<<<<<<<", "=======", ">>>>>>>"];
const SECRET_HINTS = ["PRIVATE KEY", "AKIA", "API_KEY", "API-KEY", "SECRET", "TOKEN", "PASSWORD"];
const DEBUG_HINTS = ["console.", "debugger", "print("];
const TODO_HINTS = ["TODO", "FIXME", "HACK", "XXX"];

const SECRET_RULES = [
  {
    id: "private-key-block",
    test: (line) => /-----BEGIN ([A-Z ]+)?PRIVATE KEY-----/.test(line),
    message: "Private key material appears to be committed."
  },
  {
    id: "aws-key",
    test: (line) => /AKIA[0-9A-Z]{16}/.test(line),
    message: "Possible AWS access key found."
  },
  {
    id: "generic-secret",
    test: (line) =>
      /\b(api[_-]?key|secret|token|password)\b\s*[:=]\s*["'][^"']{8,}["']/i.test(line) &&
      !/\b(example|placeholder|changeme|dummy)\b/i.test(line),
    message: "Possible hardcoded credential found."
  }
];

const DEBUG_RULES = [
  {
    id: "console-call",
    test: (line) => /\bconsole\.(log|debug|info|warn)\s*\(/.test(line),
    message: "Debug console call left in source code."
  },
  {
    id: "debugger",
    test: (line) => /^\s*debugger\s*;?\s*$/.test(line),
    message: "Debugger statement left in source code."
  },
  {
    id: "print-call",
    test: (line) => /^\s*print\s*\(/.test(line),
    message: "Possible debug print statement left in source code."
  }
];

const SPECIAL_TEXT_FILES = new Set([
  "readme.md",
  "dockerfile",
  "makefile",
  ".env.example",
  ".gitignore",
  "package.json"
]);

const CODE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".java", ".rs", ".c", ".cpp", ".h"]);

function pushFinding(findings, ruleCounts, context, finding) {
  if (context.disabledRules.has(String(finding.id || "").trim())) {
    return;
  }

  const overrideSeverity = context.severityOverrides[finding.id];
  const normalizedSeverity = String(overrideSeverity || "").toLowerCase();
  const severity =
    normalizedSeverity === "p0" || normalizedSeverity === "p1" || normalizedSeverity === "p2"
      ? normalizedSeverity
      : finding.severity;

  const count = ruleCounts.get(finding.id) || 0;
  if (count >= context.maxFindingsPerRule) {
    return;
  }
  ruleCounts.set(finding.id, count + 1);
  findings.push({
    ...finding,
    severity
  });
}

function isTestFile(relPath) {
  return (
    /(^|\/)(test|tests)\//i.test(relPath) ||
    /\.test\.[a-z0-9]+$/i.test(relPath) ||
    /\.spec\.[a-z0-9]+$/i.test(relPath)
  );
}

function isTextCandidate(file, textExtensions) {
  const ext = (file.ext || "").toLowerCase();
  const base = path.basename(file.relPath).toLowerCase();
  return textExtensions.has(ext) || SPECIAL_TEXT_FILES.has(base);
}

function isCodeLikeFile(file) {
  const ext = (file.ext || "").toLowerCase();
  return CODE_EXTENSIONS.has(ext);
}

function isCommentLikeTodo(line) {
  const trimmed = line.trim();
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("--")
  ) {
    return true;
  }

  const todoIndex = line.search(TODO_RE);
  if (todoIndex < 0) {
    return false;
  }

  const slashComment = line.indexOf("//");
  if (slashComment >= 0 && slashComment < todoIndex) {
    return true;
  }

  const hashComment = line.indexOf("#");
  if (hashComment >= 0 && hashComment < todoIndex) {
    return true;
  }

  return false;
}

function tryReadTextFile(absPath) {
  try {
    return fs.readFileSync(absPath, "utf8");
  } catch (_error) {
    return null;
  }
}

function hasAnyNeedle(haystack, needles) {
  for (const needle of needles) {
    if (haystack.includes(needle)) {
      return true;
    }
  }
  return false;
}

function runChecks(rootPath, files, config, scanOptions = {}) {
  const findings = [];
  const ruleCounts = new Map();
  const context = {
    disabledRules: new Set((config.disabledRules || []).map((rule) => String(rule || "").trim())),
    severityOverrides: config.severityOverrides || {},
    maxFindingsPerRule: config.maxFindingsPerRule
  };
  const textExtensions = new Set((config.textExtensions || []).map((ext) => ext.toLowerCase()));
  const largeFileLimit = Math.floor(config.maxFileSizeMb * 1024 * 1024);
  const maxTextBytes = Math.floor(config.maxTextFileSizeKb * 1024);

  let hasTests = false;
  let rootReadme = null;
  let rootPackage = null;
  let codeFileCount = 0;
  const analysis = {
    textCandidates: 0,
    textFilesRead: 0,
    lineScanSkippedFiles: 0,
    linesScanned: 0
  };

  for (const file of files) {
    if (isTestFile(file.relPath)) {
      hasTests = true;
    }

    if (file.sizeBytes > largeFileLimit) {
      pushFinding(findings, ruleCounts, context, {
        id: "large-file",
        severity: "p1",
        title: "Large file detected",
        file: file.relPath,
        line: 1,
        message: `File is ${(file.sizeBytes / (1024 * 1024)).toFixed(2)} MB, above ${config.maxFileSizeMb} MB limit.`,
        suggestion: "Move large assets to artifact storage or add explicit ignores."
      });
    }

    const ext = (file.ext || "").toLowerCase();
    const isCodeFile = CODE_EXTENSIONS.has(ext);
    if (isCodeFile) {
      codeFileCount += 1;
    }

    if (!isTextCandidate(file, textExtensions) || file.sizeBytes > maxTextBytes) {
      continue;
    }
    analysis.textCandidates += 1;

    const content = tryReadTextFile(file.absPath);
    if (content === null) {
      continue;
    }
    analysis.textFilesRead += 1;

    if (file.relPath.toLowerCase() === "readme.md") {
      rootReadme = content;
    }
    if (file.relPath === "package.json") {
      rootPackage = content;
    }

    const upperContent = content.toUpperCase();
    const lowerContent = isCodeFile ? content.toLowerCase() : "";
    const hasMergeHints = hasAnyNeedle(upperContent, MERGE_HINTS);
    const hasSecretHints = hasAnyNeedle(upperContent, SECRET_HINTS);
    const hasDebugHints = isCodeFile && hasAnyNeedle(lowerContent, DEBUG_HINTS);
    const hasTodoHints = isCodeFile && hasAnyNeedle(upperContent, TODO_HINTS);
    const needsLineScan = hasMergeHints || hasSecretHints || hasDebugHints || hasTodoHints;
    if (!needsLineScan) {
      analysis.lineScanSkippedFiles += 1;
      continue;
    }

    const lines = content.split(/\r?\n/);
    analysis.linesScanned += lines.length;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineNumber = index + 1;
      const trimmed = line.trim();

      if (hasMergeHints && MERGE_MARKER_RE.test(trimmed)) {
        pushFinding(findings, ruleCounts, context, {
          id: "merge-marker",
          severity: "p0",
          title: "Unresolved merge marker",
          file: file.relPath,
          line: lineNumber,
          message: "Git conflict marker is present in file content.",
          suggestion: "Resolve conflicts and remove all merge markers."
        });
      }

      if (hasSecretHints) {
        for (const secretRule of SECRET_RULES) {
          if (secretRule.test(line)) {
            pushFinding(findings, ruleCounts, context, {
              id: secretRule.id,
              severity: "p0",
              title: "Potential secret exposure",
              file: file.relPath,
              line: lineNumber,
              message: secretRule.message,
              suggestion: "Rotate the secret and move it to environment configuration."
            });
          }
        }
      }

      if (hasDebugHints) {
        for (const debugRule of DEBUG_RULES) {
          if (debugRule.test(line)) {
            pushFinding(findings, ruleCounts, context, {
              id: debugRule.id,
              severity: "p1",
              title: "Debug statement found",
              file: file.relPath,
              line: lineNumber,
              message: debugRule.message,
              suggestion: "Remove or guard debug statements before release."
            });
          }
        }
      }

      if (hasTodoHints && TODO_RE.test(line) && isCommentLikeTodo(line)) {
        pushFinding(findings, ruleCounts, context, {
          id: "todo-comment",
          severity: "p2",
          title: "Pending TODO/FIXME/HACK marker",
          file: file.relPath,
          line: lineNumber,
          message: "Work marker found in source code.",
          suggestion: "Close or link this marker to a tracked issue."
        });
      }
    }
  }

  if (!scanOptions.skipGlobalChecks && !rootReadme) {
    pushFinding(findings, ruleCounts, context, {
      id: "missing-readme",
      severity: "p1",
      title: "README.md is missing at repository root",
      file: "README.md",
      line: 1,
      message: "No root README file found.",
      suggestion: "Add a README with install and usage instructions."
    });
  } else if (!scanOptions.skipGlobalChecks) {
    if (!README_INSTALL_RE.test(rootReadme)) {
      pushFinding(findings, ruleCounts, context, {
        id: "readme-install",
        severity: "p2",
        title: "README lacks installation section",
        file: "README.md",
        line: 1,
        message: "Installation heading was not detected.",
        suggestion: "Add an Installation section with exact setup commands."
      });
    }
    if (!README_USAGE_RE.test(rootReadme)) {
      pushFinding(findings, ruleCounts, context, {
        id: "readme-usage",
        severity: "p2",
        title: "README lacks usage section",
        file: "README.md",
        line: 1,
        message: "Usage heading was not detected.",
        suggestion: "Add a Usage section with executable examples."
      });
    }
  }

  if (!scanOptions.skipGlobalChecks && rootPackage) {
    try {
      const parsed = JSON.parse(rootPackage);
      const scripts = parsed.scripts || {};
      if (!scripts.build) {
        pushFinding(findings, ruleCounts, context, {
          id: "missing-build-script",
          severity: "p2",
          title: "package.json missing build script",
          file: "package.json",
          line: 1,
          message: "No npm build script found.",
          suggestion: "Add a deterministic build command under scripts.build."
        });
      }
      if (!scripts.test) {
        pushFinding(findings, ruleCounts, context, {
          id: "missing-test-script",
          severity: "p1",
          title: "package.json missing test script",
          file: "package.json",
          line: 1,
          message: "No npm test script found.",
          suggestion: "Add scripts.test and wire it to your test runner."
        });
      }
      if (!scripts.lint) {
        pushFinding(findings, ruleCounts, context, {
          id: "missing-lint-script",
          severity: "p2",
          title: "package.json missing lint script",
          file: "package.json",
          line: 1,
          message: "No npm lint script found.",
          suggestion: "Add scripts.lint to enforce coding standards."
        });
      }
    } catch (_error) {
      pushFinding(findings, ruleCounts, context, {
        id: "invalid-package-json",
        severity: "p1",
        title: "package.json parse error",
        file: "package.json",
        line: 1,
        message: "package.json exists but cannot be parsed as JSON.",
        suggestion: "Fix JSON syntax errors in package.json."
      });
    }
  }

  if (!scanOptions.skipGlobalChecks && !hasTests && codeFileCount > 0) {
    pushFinding(findings, ruleCounts, context, {
      id: "missing-tests",
      severity: codeFileCount > 10 ? "p1" : "p2",
      title: "No test files detected",
      file: "test/",
      line: 1,
      message: `Detected ${codeFileCount} code files but no test files.`,
      suggestion: "Add at least smoke tests before release."
    });
  }

  return {
    findings,
    analysis
  };
}

module.exports = {
  runChecks
};

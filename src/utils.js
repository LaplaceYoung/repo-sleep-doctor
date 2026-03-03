const path = require("path");

const SEVERITY_ORDER = {
  p0: 0,
  p1: 1,
  p2: 2
};

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function wildcardToRegExp(pattern) {
  let normalized = toPosixPath(String(pattern || "").trim()).replace(/\/+/g, "/");
  const leadingGlobStar = normalized.startsWith("**/");
  if (leadingGlobStar) {
    normalized = normalized.slice(3);
  }

  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const withDoubleStar = escaped.replace(/\*\*/g, "__DOUBLE_STAR__");
  const withSingleStar = withDoubleStar.replace(/\*/g, "[^/]*");
  const source = withSingleStar.replace(/__DOUBLE_STAR__/g, ".*");
  const prefix = leadingGlobStar ? "(?:.*/)?" : "";
  return new RegExp(`^${prefix}${source}$`);
}

function createPathMatcher(patterns) {
  const regexes = (patterns || [])
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map(wildcardToRegExp);

  return (relPath) => {
    const normalized = toPosixPath(relPath || "");
    return regexes.some((regex) => regex.test(normalized));
  };
}

function compareFindings(a, b) {
  const orderA = SEVERITY_ORDER[a.severity] ?? 99;
  const orderB = SEVERITY_ORDER[b.severity] ?? 99;

  if (orderA !== orderB) {
    return orderA - orderB;
  }

  if ((a.file || "") !== (b.file || "")) {
    return (a.file || "").localeCompare(b.file || "");
  }

  return (a.line || 0) - (b.line || 0);
}

function formatDuration(durationMs) {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = (seconds % 60).toFixed(1);
  return `${minutes}m ${remaining}s`;
}

module.exports = {
  SEVERITY_ORDER,
  toPosixPath,
  wildcardToRegExp,
  createPathMatcher,
  compareFindings,
  formatDuration
};

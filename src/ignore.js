const fs = require("fs");
const path = require("path");

const { wildcardToRegExp, toPosixPath } = require("./utils");

function readLinesIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  try {
    return fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  } catch (_error) {
    return [];
  }
}

function cleanGitIgnoreLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  return trimmed;
}

function buildGlobVariants(pattern, options = {}) {
  const normalized = toPosixPath(pattern).replace(/^\/+/, "").replace(/\/+/g, "/");
  const anchored = Boolean(options.anchored);
  const dirOnly = Boolean(options.dirOnly);
  const hasSlash = normalized.includes("/");
  const variants = [];

  if (!normalized) {
    return variants;
  }

  if (anchored) {
    variants.push(normalized);
  } else if (hasSlash) {
    variants.push(normalized, `**/${normalized}`);
  } else {
    variants.push(normalized, `**/${normalized}`);
  }

  if (dirOnly) {
    const dirVariants = [];
    for (const value of variants) {
      dirVariants.push(value, `${value}/**`);
    }
    return Array.from(new Set(dirVariants));
  }

  return Array.from(new Set(variants));
}

function compileGlobRule(rawPattern, negative = false) {
  const normalized = toPosixPath(String(rawPattern || "").trim()).replace(/\/+/g, "/");
  if (!normalized) {
    return null;
  }

  const regex = wildcardToRegExp(normalized);
  return {
    source: rawPattern,
    negative,
    match: (relPath) => regex.test(relPath)
  };
}

function compileGitIgnoreLine(line) {
  let value = cleanGitIgnoreLine(line);
  if (!value) {
    return [];
  }

  let negative = false;
  if (value.startsWith("!")) {
    negative = true;
    value = value.slice(1).trim();
  }

  if (!value) {
    return [];
  }

  const anchored = value.startsWith("/");
  const dirOnly = value.endsWith("/");
  const variants = buildGlobVariants(value, { anchored, dirOnly });

  return variants
    .map((variant) => compileGlobRule(variant, negative))
    .filter(Boolean);
}

function loadGitIgnoreRules(rootPath, fileName) {
  const absPath = path.join(rootPath, fileName);
  const lines = readLinesIfExists(absPath);
  const rules = [];
  for (const line of lines) {
    rules.push(...compileGitIgnoreLine(line));
  }
  return rules;
}

function createIgnoreMatcher(rootPath, config) {
  const rules = [];
  const appendRules = (items, negative = false) => {
    for (const pattern of items || []) {
      const compiled = compileGlobRule(pattern, negative);
      if (compiled) {
        rules.push(compiled);
      }
    }
  };

  appendRules(config.ignorePatterns || [], false);

  if (config.useGitIgnore) {
    rules.push(...loadGitIgnoreRules(rootPath, ".gitignore"));
  }

  for (const fileName of config.additionalIgnoreFiles || []) {
    rules.push(...loadGitIgnoreRules(rootPath, fileName));
  }

  return (relPath, isDir = false) => {
    const normalized = toPosixPath(relPath).replace(/^\.\/+/, "").replace(/\/+/g, "/");
    if (!normalized) {
      return false;
    }

    let ignored = false;
    for (const rule of rules) {
      const target = isDir ? `${normalized}/` : normalized;
      if (rule.match(normalized) || (isDir && rule.match(target))) {
        ignored = !rule.negative;
      }
    }
    return ignored;
  };
}

module.exports = {
  createIgnoreMatcher
};

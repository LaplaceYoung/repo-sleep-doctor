const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { loadConfig } = require("./config");
const { runChecks } = require("./checks");
const { createIgnoreMatcher } = require("./ignore");
const { compareFindings, toPosixPath } = require("./utils");

function summarizeFindings(findings) {
  const summary = { total: findings.length, p0: 0, p1: 0, p2: 0 };
  for (const finding of findings) {
    if (finding.severity === "p0") summary.p0 += 1;
    if (finding.severity === "p1") summary.p1 += 1;
    if (finding.severity === "p2") summary.p2 += 1;
  }
  return summary;
}

function calculateScore(summary) {
  const score = 100 - summary.p0 * 25 - summary.p1 * 8 - summary.p2 * 2;
  return Math.max(0, score);
}

function collectFiles(rootPath, config) {
  const files = [];
  const skipped = [];
  const stack = [rootPath];
  const ignoreDirSet = new Set((config.ignoreDirs || []).map((name) => String(name).toLowerCase()));
  const ignorePath = createIgnoreMatcher(rootPath, config);
  let truncated = false;

  while (stack.length > 0) {
    const dirPath = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      skipped.push({
        path: toPosixPath(path.relative(rootPath, dirPath) || "."),
        reason: "Cannot read directory"
      });
      continue;
    }

    for (const entry of entries) {
      const absPath = path.join(dirPath, entry.name);
      const relPath = toPosixPath(path.relative(rootPath, absPath));

      if (!relPath) {
        continue;
      }

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        const lowerName = entry.name.toLowerCase();
        if (ignoreDirSet.has(lowerName)) {
          continue;
        }
        if (ignorePath(relPath, true)) {
          continue;
        }
        stack.push(absPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (ignorePath(relPath, false)) {
        continue;
      }

      let stats;
      try {
        stats = fs.statSync(absPath);
      } catch (_error) {
        skipped.push({
          path: relPath,
          reason: "Cannot read file metadata"
        });
        continue;
      }

      files.push({
        absPath,
        relPath,
        ext: path.extname(entry.name),
        sizeBytes: stats.size
      });

      if (files.length >= config.maxFiles) {
        truncated = true;
        break;
      }
    }

    if (truncated) {
      break;
    }
  }

  if (stack.length > 0) {
    truncated = true;
  }

  return { files, skipped, truncated };
}

function listChangedPaths(rootPath, changedSince) {
  const ref = String(changedSince || "").trim();
  if (!ref) {
    return null;
  }

  const diffSpec = `${ref}...HEAD`;
  const result = spawnSync("git", ["-C", rootPath, "diff", "--name-only", "--diff-filter=ACMR", diffSpec], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "").trim() || "git diff failed";
    throw new Error(`Unable to resolve changed files for --changed-since ${ref}: ${details}`);
  }

  return new Set(
    (result.stdout || "")
      .split(/\r?\n/)
      .map((line) => toPosixPath(String(line || "").trim()))
      .filter(Boolean)
  );
}

function scanRepository(targetPath, cliOptions = {}) {
  const start = Date.now();
  const rootPath = path.resolve(targetPath || process.cwd());
  const config = loadConfig(rootPath, cliOptions);
  const changedSince = cliOptions.changedSince ? String(cliOptions.changedSince).trim() : null;

  const { files: collectedFiles, skipped, truncated } = collectFiles(rootPath, config);
  const changedPaths = changedSince ? listChangedPaths(rootPath, changedSince) : null;
  const files = changedPaths
    ? collectedFiles.filter((file) => changedPaths.has(toPosixPath(file.relPath)))
    : collectedFiles;

  const checkResult = runChecks(rootPath, files, config, {
    skipGlobalChecks: Boolean(changedSince)
  });
  const findings = (checkResult.findings || []).sort(compareFindings);
  const summary = summarizeFindings(findings);
  const score = calculateScore(summary);

  return {
    tool: "repo-sleep-doctor",
    version: "0.2.0",
    rootPath,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    fileCount: files.length,
    collectedFileCount: collectedFiles.length,
    truncated,
    skipped,
    summary,
    score,
    configPath: config.configPath,
    config: {
      useGitIgnore: config.useGitIgnore,
      preset: config.preset || null,
      changedSince
    },
    analysis: checkResult.analysis || null,
    findings
  };
}

module.exports = {
  scanRepository,
  summarizeFindings,
  calculateScore
};

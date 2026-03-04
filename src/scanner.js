const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { createConfigSignature, fileSignature, loadScanCache, saveScanCache } = require("./cache");
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
        sizeBytes: stats.size,
        mtimeMs: stats.mtimeMs
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
  const cacheFile = cliOptions.cacheFile ? String(cliOptions.cacheFile).trim() : null;
  const configSignature = createConfigSignature(config);

  const { files: collectedFiles, skipped, truncated } = collectFiles(rootPath, config);
  const changedPaths = changedSince ? listChangedPaths(rootPath, changedSince) : null;
  const scopedFiles = changedPaths
    ? collectedFiles.filter((file) => changedPaths.has(toPosixPath(file.relPath)))
    : collectedFiles;
  const resolvedCachePath = cacheFile ? path.resolve(cacheFile) : null;
  const files = resolvedCachePath
    ? scopedFiles.filter((file) => path.resolve(file.absPath) !== resolvedCachePath)
    : scopedFiles;

  let cacheLoadStatus = "disabled";
  let cacheEntries = {};
  if (cacheFile) {
    const loadedCache = loadScanCache(cacheFile, configSignature);
    cacheLoadStatus = loadedCache.status;
    cacheEntries = loadedCache.entries;
  }

  const activeFileCache = new Map();
  const fileSignatures = new Map();
  const staleCacheEntries = {};
  for (const file of files) {
    const signature = fileSignature(file);
    fileSignatures.set(file.relPath, signature);

    const cachedEntry = cacheEntries[file.relPath];
    if (cachedEntry && cachedEntry.signature === signature) {
      activeFileCache.set(file.relPath, {
        findings: cachedEntry.findings,
        meta: cachedEntry.meta
      });
      staleCacheEntries[file.relPath] = cachedEntry;
    }
  }

  const checkResult = runChecks(rootPath, files, config, {
    skipGlobalChecks: Boolean(changedSince),
    fileCache: cacheFile ? activeFileCache : null
  });
  const findings = (checkResult.findings || []).sort(compareFindings);
  const summary = summarizeFindings(findings);
  const score = calculateScore(summary);

  const analysis = checkResult.analysis || null;
  if (analysis && checkResult.cache) {
    const hits = Number(checkResult.cache.hits || 0);
    const misses = Number(checkResult.cache.misses || 0);
    const total = hits + misses;
    analysis.cacheHits = hits;
    analysis.cacheMisses = misses;
    analysis.cacheHitRate = total > 0 ? Number((hits / total).toFixed(3)) : 0;
    analysis.cacheStatus = cacheLoadStatus;
  }

  if (cacheFile) {
    const nextCacheEntries = changedSince ? { ...cacheEntries } : {};
    for (const file of files) {
      const relPath = file.relPath;
      const signature = fileSignatures.get(relPath);
      if (!signature) {
        continue;
      }
      if (staleCacheEntries[relPath]) {
        nextCacheEntries[relPath] = staleCacheEntries[relPath];
        continue;
      }
      const nextResult = checkResult.fileResults && checkResult.fileResults[relPath];
      if (!nextResult) {
        continue;
      }
      nextCacheEntries[relPath] = {
        signature,
        findings: nextResult.findings || [],
        meta: nextResult.meta || {}
      };
    }
    try {
      const cachePath = saveScanCache(cacheFile, configSignature, nextCacheEntries);
      if (analysis) {
        analysis.cacheFile = cachePath;
      }
    } catch (_error) {
      if (analysis) {
        analysis.cacheSaveError = true;
      }
    }
  }

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
      changedSince,
      cacheFile: cacheFile ? path.resolve(cacheFile) : null
    },
    analysis,
    findings
  };
}

module.exports = {
  scanRepository,
  summarizeFindings,
  calculateScore
};

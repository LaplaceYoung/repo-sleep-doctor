const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { createConfigSignature, fileSignature, loadScanCache, saveScanCache } = require("./cache");
const { loadConfig } = require("./config");
const { runChecks } = require("./checks");
const { createIgnoreMatcher } = require("./ignore");
const { verifySecretFindings } = require("./secret-verify");
const { compareFindings, toPosixPath } = require("./utils");
const { version: PACKAGE_VERSION } = require("../package.json");

function toSafeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

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
  const timing = {
    walkMs: 0,
    filterMs: 0,
    readMs: 0,
    ruleEvalMs: 0,
    aggregateMs: 0,
    cacheLoadMs: 0,
    cacheSaveMs: 0,
    totalMs: 0
  };
  const rootPath = path.resolve(targetPath || process.cwd());
  const config = loadConfig(rootPath, cliOptions);
  const changedSince = cliOptions.changedSince ? String(cliOptions.changedSince).trim() : null;
  const cacheFile = cliOptions.cacheFile ? String(cliOptions.cacheFile).trim() : null;
  const configSignature = createConfigSignature(config);

  const collectStartMs = Date.now();
  const { files: collectedFiles, skipped, truncated } = collectFiles(rootPath, config);
  timing.walkMs = Date.now() - collectStartMs;

  const filterStartMs = Date.now();
  const changedPaths = changedSince ? listChangedPaths(rootPath, changedSince) : null;
  const scopedFiles = changedPaths
    ? collectedFiles.filter((file) => changedPaths.has(toPosixPath(file.relPath)))
    : collectedFiles;
  const resolvedCachePath = cacheFile ? path.resolve(cacheFile) : null;
  const files = resolvedCachePath
    ? scopedFiles.filter((file) => path.resolve(file.absPath) !== resolvedCachePath)
    : scopedFiles;
  timing.filterMs = Date.now() - filterStartMs;

  let cacheLoadStatus = "disabled";
  let cacheEntries = {};
  if (cacheFile) {
    const cacheLoadStartMs = Date.now();
    const loadedCache = loadScanCache(cacheFile, configSignature);
    cacheLoadStatus = loadedCache.status;
    cacheEntries = loadedCache.entries;
    timing.cacheLoadMs = Date.now() - cacheLoadStartMs;
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

  const checksStartMs = Date.now();
  const checkResult = runChecks(rootPath, files, config, {
    skipGlobalChecks: Boolean(changedSince),
    fileCache: cacheFile ? activeFileCache : null
  });
  timing.aggregateMs += Date.now() - checksStartMs;
  const rawFindings = (checkResult.findings || []).sort(compareFindings);
  const verified = verifySecretFindings(rawFindings, {
    enabled: Boolean(cliOptions.verifySecrets),
    provider: cliOptions.verifyProvider || "auto",
    timeoutMs: cliOptions.verifyTimeoutMs,
    maxCount: cliOptions.verifyMax || 20,
    safeMode: cliOptions.verifySafeMode !== undefined ? Boolean(cliOptions.verifySafeMode) : true
  });
  const findings = verified.findings;
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

  const fileMetaByPath = new Map();
  for (const file of files) {
    const fromCheck = checkResult.fileResults && checkResult.fileResults[file.relPath];
    const fromCache = activeFileCache.get(file.relPath);
    const meta = fromCheck && fromCheck.meta ? fromCheck.meta : fromCache && fromCache.meta ? fromCache.meta : null;
    if (meta) {
      fileMetaByPath.set(file.relPath, meta);
    }
  }

  const slowFilesRaw = Array.from(fileMetaByPath.entries())
    .map(([relPath, meta]) => {
      const fileTiming = meta && meta.timing ? meta.timing : {};
      return {
        file: relPath,
        readMs: toSafeNumber(fileTiming.readMs, 0),
        ruleEvalMs: toSafeNumber(fileTiming.ruleEvalMs, 0),
        totalMs: toSafeNumber(fileTiming.totalMs, 0),
        sizeBytes: toSafeNumber(meta && meta.sizeBytes, 0)
      };
    });

  for (const item of slowFilesRaw) {
    timing.readMs += item.readMs;
    timing.ruleEvalMs += item.ruleEvalMs;
  }
  const slowFiles = slowFilesRaw
    .sort((a, b) => b.totalMs - a.totalMs || b.readMs - a.readMs || a.file.localeCompare(b.file))
    .slice(0, 10);

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
      const cacheSaveStartMs = Date.now();
      const cachePath = saveScanCache(cacheFile, configSignature, nextCacheEntries);
      timing.cacheSaveMs = Date.now() - cacheSaveStartMs;
      if (analysis) {
        analysis.cacheFile = cachePath;
      }
    } catch (_error) {
      if (analysis) {
        analysis.cacheSaveError = true;
      }
    }
  }

  const durationMs = Date.now() - start;
  timing.totalMs = durationMs;
  if (analysis) {
    analysis.hotspots = {
      slowFiles
    };
    analysis.summary = {
      filesPerSecond: files.length > 0 ? Number((files.length / Math.max(durationMs / 1000, 0.001)).toFixed(2)) : 0,
      linesPerSecond:
        toSafeNumber(analysis.linesScanned, 0) > 0
          ? Number((toSafeNumber(analysis.linesScanned, 0) / Math.max(durationMs / 1000, 0.001)).toFixed(2))
          : 0
    };
    analysis.timing = timing;
  }

  return {
    tool: "repo-sleep-doctor",
    version: PACKAGE_VERSION,
    rootPath,
    scannedAt: new Date().toISOString(),
    durationMs,
    fileCount: files.length,
    collectedFileCount: collectedFiles.length,
    truncated,
    skipped,
    summary,
    verificationSummary: {
      verifiedSecrets: verified.stats.verifiedSecrets,
      invalidSecrets: verified.stats.invalidSecrets,
      unverifiedSecrets: verified.stats.unverifiedSecrets,
      skippedSecrets: verified.stats.skippedSecrets
    },
    score,
    configPath: config.configPath,
    config: {
      useGitIgnore: config.useGitIgnore,
      preset: config.preset || null,
      changedSince,
      cacheFile: cacheFile ? path.resolve(cacheFile) : null,
      verifySecrets: Boolean(cliOptions.verifySecrets),
      verifyProvider: cliOptions.verifyProvider || "auto",
      verifyTimeoutMs: cliOptions.verifyTimeoutMs || null,
      verifyMax: cliOptions.verifyMax || null,
      verifySafeMode: cliOptions.verifySafeMode !== undefined ? Boolean(cliOptions.verifySafeMode) : true
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

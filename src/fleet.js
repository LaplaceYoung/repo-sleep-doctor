const path = require("path");

const { loadHistory } = require("./history");

const VALID_FLEET_FORMATS = new Set(["text", "json", "markdown", "md", "html"]);

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return numeric;
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return safeNumber(sorted[index], 0);
}

function detectDirectoryTag(repoPath, discoverRoot) {
  if (!repoPath) {
    return "(unknown)";
  }
  const normalizedPath = path.resolve(String(repoPath));
  if (discoverRoot) {
    const root = path.resolve(String(discoverRoot));
    const rel = path.relative(root, normalizedPath);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
      const segment = rel.split(path.sep).find(Boolean);
      return segment || "(root)";
    }
  }
  const parent = path.basename(path.dirname(normalizedPath));
  return parent || "(root)";
}

function summarizeRecoveryCadence(repos) {
  const metrics = {
    riskyLatestRepos: 0,
    recoveredLatestRepos: 0,
    regressions: 0,
    recoveryEvents: 0,
    avgScansToRecovery: 0,
    avgHoursToRecovery: 0
  };

  let totalRecoveryScans = 0;
  let totalRecoveryHours = 0;
  let recoveryHoursCount = 0;

  for (const repo of repos || []) {
    const cadence = repo && repo.cadence ? repo.cadence : null;
    if (!cadence) {
      continue;
    }
    if (cadence.latestRisk) {
      metrics.riskyLatestRepos += 1;
    }
    if (cadence.recoveredLatest) {
      metrics.recoveredLatestRepos += 1;
    }
    if (cadence.regressionLatest) {
      metrics.regressions += 1;
    }
    for (const event of cadence.recoveryEvents || []) {
      metrics.recoveryEvents += 1;
      totalRecoveryScans += safeNumber(event.scansToRecovery, 0);
      if (Number.isFinite(Number(event.hoursToRecovery))) {
        totalRecoveryHours += Number(event.hoursToRecovery);
        recoveryHoursCount += 1;
      }
    }
  }

  if (metrics.recoveryEvents > 0) {
    metrics.avgScansToRecovery = Number((totalRecoveryScans / metrics.recoveryEvents).toFixed(2));
  }
  if (recoveryHoursCount > 0) {
    metrics.avgHoursToRecovery = Number((totalRecoveryHours / recoveryHoursCount).toFixed(2));
  }

  return metrics;
}

function summarizeExecution(execution) {
  if (!execution || typeof execution !== "object") {
    return null;
  }

  const totalRepos = safeNumber(execution.totalRepos, 0);
  const scannedRepos = safeNumber(execution.scannedRepos, 0);
  const failedRepos = safeNumber(execution.failedRepos, 0);
  const errorRepos = safeNumber(execution.errorRepos, 0);
  const durationMs = safeNumber(execution.durationMs, 0);
  const successRate = totalRepos > 0 ? Number(((Math.max(totalRepos - failedRepos, 0) / totalRepos) * 100).toFixed(1)) : 100;
  const failRate = totalRepos > 0 ? Number(((failedRepos / totalRepos) * 100).toFixed(1)) : 0;
  const errorRate = totalRepos > 0 ? Number(((errorRepos / totalRepos) * 100).toFixed(1)) : 0;
  const repoRuns = Array.isArray(execution.repoRuns) ? execution.repoRuns : [];

  const slowRepos = repoRuns
    .filter((repo) => typeof repo === "object" && repo && Number.isFinite(Number(repo.durationMs)))
    .map((repo) => ({
      repoId: String(repo.repoId || ""),
      durationMs: safeNumber(repo.durationMs, 0),
      status: String(repo.status || ""),
      path: String(repo.path || "")
    }))
    .sort((a, b) => b.durationMs - a.durationMs || a.repoId.localeCompare(b.repoId))
    .slice(0, 5);

  const cacheRank = repoRuns
    .filter((repo) => repo && repo.cache && Number.isFinite(Number(repo.cache.hitRate)))
    .map((repo) => ({
      repoId: String(repo.repoId || ""),
      hitRate: Number((safeNumber(repo.cache.hitRate, 0) * 100).toFixed(1)),
      hits: safeNumber(repo.cache.hits, 0),
      misses: safeNumber(repo.cache.misses, 0)
    }))
    .sort((a, b) => b.hitRate - a.hitRate || b.hits - a.hits || a.repoId.localeCompare(b.repoId))
    .slice(0, 5);

  const missingRepos = repoRuns
    .filter((repo) => repo && repo.status === "error")
    .map((repo) => ({
      repoId: String(repo.repoId || ""),
      path: String(repo.path || ""),
      error: String(repo.error || "")
    }))
    .slice(0, 10);

  const discoverRoot = execution.discoverRoot || null;
  const groupMap = new Map();
  for (const repo of repoRuns) {
    if (!repo || typeof repo !== "object") {
      continue;
    }
    const tag = detectDirectoryTag(repo.path, discoverRoot);
    if (!groupMap.has(tag)) {
      groupMap.set(tag, {
        tag,
        total: 0,
        scanned: 0,
        failed: 0,
        errors: 0,
        durationMs: 0
      });
    }
    const group = groupMap.get(tag);
    group.total += 1;
    group.durationMs += safeNumber(repo.durationMs, 0);
    if (repo.status !== "error") {
      group.scanned += 1;
    } else {
      group.errors += 1;
    }
    if (repo.failed) {
      group.failed += 1;
    }
  }

  const directoryGroups = Array.from(groupMap.values())
    .map((group) => ({
      tag: group.tag,
      total: group.total,
      scanned: group.scanned,
      failed: group.failed,
      errors: group.errors,
      avgDurationMs: group.total > 0 ? Math.round(group.durationMs / group.total) : 0,
      successRate: group.total > 0 ? Number((((group.total - group.failed) / group.total) * 100).toFixed(1)) : 100
    }))
    .sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag))
    .slice(0, 10);

  const repoDurations = repoRuns
    .map((repo) => safeNumber(repo && repo.durationMs, NaN))
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  const avgRepoMs =
    repoDurations.length > 0
      ? Math.round(repoDurations.reduce((sum, duration) => sum + duration, 0) / repoDurations.length)
      : 0;
  const p95RepoMs = Math.round(percentile(repoDurations, 95));

  const timing = {
    totalMs: durationMs,
    avgRepoMs,
    p95RepoMs
  };
  const hotspots = {
    slowRepos,
    cacheRank
  };
  const stability = {
    successRate,
    failRate,
    errorRate
  };

  return {
    totalRepos,
    scannedRepos,
    failedRepos,
    errorRepos,
    durationMs,
    successRate,
    failOn: execution.failOn || "p0",
    continueOnError: Boolean(execution.continueOnError),
    startedAt: execution.startedAt || null,
    finishedAt: execution.finishedAt || null,
    timing,
    hotspots,
    stability,
    slowRepos,
    cacheRank,
    missingRepos,
    directoryGroups
  };
}

function detectRepoName(historyPath) {
  const resolved = path.resolve(historyPath);
  const stem = path.basename(resolved, path.extname(resolved));
  const parent = path.basename(path.dirname(resolved));
  const grand = path.basename(path.dirname(path.dirname(resolved)));

  if (stem === "history" && parent === "reports" && grand) {
    return grand;
  }
  if (stem === "history" && parent) {
    return parent;
  }
  return stem || resolved;
}

function summarizeRepo(historyPath, entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      repo: detectRepoName(historyPath),
      historyPath: path.resolve(historyPath),
      scans: 0,
      latestScore: 0,
      avgScore: 0,
      scoreDelta: 0,
      latestSummary: { p0: 0, p1: 0, p2: 0 },
      latestRuleCounts: {},
      latestScannedAt: null,
      cadence: {
        latestRisk: false,
        previousRisk: false,
        recoveredLatest: false,
        regressionLatest: false,
        recoveryEvents: []
      }
    };
  }

  const first = entries[0];
  const latest = entries[entries.length - 1];
  const scoreSeries = entries.map((entry) => safeNumber(entry.score, 0));
  const sumScore = scoreSeries.reduce((sum, score) => sum + score, 0);
  const avgScore = sumScore / scoreSeries.length;
  const scoreDelta = scoreSeries[scoreSeries.length - 1] - scoreSeries[0];
  const riskFlags = entries.map((entry) => {
    const summary = entry && entry.summary ? entry.summary : {};
    return safeNumber(summary.p0, 0) > 0 || safeNumber(summary.p1, 0) > 0;
  });
  const previousRisk = riskFlags.length > 1 ? Boolean(riskFlags[riskFlags.length - 2]) : false;
  const latestRisk = Boolean(riskFlags[riskFlags.length - 1]);
  const recoveryEvents = [];
  let openRiskStart = null;
  for (let i = 0; i < riskFlags.length; i += 1) {
    const isRisk = riskFlags[i];
    const prevRisk = i > 0 ? riskFlags[i - 1] : false;
    if (isRisk && !prevRisk) {
      openRiskStart = i;
      continue;
    }
    if (!isRisk && prevRisk && openRiskStart !== null) {
      const riskyEntry = entries[openRiskStart];
      const recoveredEntry = entries[i];
      let hoursToRecovery = null;
      const startMs = Date.parse(riskyEntry && riskyEntry.scannedAt ? riskyEntry.scannedAt : "");
      const endMs = Date.parse(recoveredEntry && recoveredEntry.scannedAt ? recoveredEntry.scannedAt : "");
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
        hoursToRecovery = Number((((endMs - startMs) / 36e5)).toFixed(2));
      }
      recoveryEvents.push({
        scansToRecovery: i - openRiskStart,
        hoursToRecovery,
        recoveredAt: recoveredEntry && recoveredEntry.scannedAt ? recoveredEntry.scannedAt : null
      });
      openRiskStart = null;
    }
  }

  return {
    repo: detectRepoName(historyPath),
    historyPath: path.resolve(historyPath),
    scans: entries.length,
    latestScore: scoreSeries[scoreSeries.length - 1],
    avgScore: Number(avgScore.toFixed(2)),
    scoreDelta: Number(scoreDelta.toFixed(2)),
    latestSummary: latest && latest.summary ? latest.summary : { p0: 0, p1: 0, p2: 0 },
    latestRuleCounts: latest && latest.ruleCounts ? latest.ruleCounts : {},
    latestScannedAt: latest && latest.scannedAt ? latest.scannedAt : null,
    cadence: {
      latestRisk,
      previousRisk,
      recoveredLatest: !latestRisk && previousRisk,
      regressionLatest: latestRisk && !previousRisk,
      recoveryEvents
    }
  };
}

function buildFleetReport(historyPaths, options = {}) {
  const repos = [];
  const ruleTotals = new Map();
  let totalScans = 0;

  for (const historyPath of historyPaths || []) {
    const loaded = loadHistory(historyPath);
    const repoSummary = summarizeRepo(loaded.path, loaded.entries);
    repos.push(repoSummary);
    totalScans += repoSummary.scans;

    for (const [ruleId, count] of Object.entries(repoSummary.latestRuleCounts || {})) {
      ruleTotals.set(ruleId, (ruleTotals.get(ruleId) || 0) + safeNumber(count, 0));
    }
  }

  repos.sort((a, b) => {
    const aP0 = safeNumber(a.latestSummary && a.latestSummary.p0, 0);
    const bP0 = safeNumber(b.latestSummary && b.latestSummary.p0, 0);
    if (aP0 !== bP0) {
      return bP0 - aP0;
    }
    if (a.latestScore !== b.latestScore) {
      return a.latestScore - b.latestScore;
    }
    return a.repo.localeCompare(b.repo);
  });

  const scannedRepos = repos.filter((repo) => repo.scans > 0);
  const avgLatestScore =
    scannedRepos.length > 0
      ? Number(
          (scannedRepos.reduce((sum, repo) => sum + safeNumber(repo.latestScore, 0), 0) / scannedRepos.length).toFixed(2)
        )
      : 0;
  const riskRepos = scannedRepos.filter(
    (repo) => safeNumber(repo.latestSummary.p0, 0) > 0 || safeNumber(repo.latestSummary.p1, 0) > 0
  ).length;

  const topRules = Array.from(ruleTotals.entries())
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId))
    .slice(0, options.topRules || 10);

  const recovery = summarizeRecoveryCadence(scannedRepos);

  return {
    tool: "repo-sleep-doctor",
    generatedAt: new Date().toISOString(),
    stats: {
      repoCount: repos.length,
      scannedRepoCount: scannedRepos.length,
      totalScans,
      avgLatestScore,
      riskRepos
    },
    repos: repos.slice(0, options.topRepos || 20),
    topRules,
    recovery
  };
}

function formatFleetText(report) {
  const lines = [];
  lines.push("Repo Sleep Doctor Fleet Report");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(
    `Repos=${report.stats.repoCount} scanned=${report.stats.scannedRepoCount} totalScans=${report.stats.totalScans} avgLatestScore=${report.stats.avgLatestScore} riskRepos=${report.stats.riskRepos}`
  );
  lines.push("");
  lines.push("Top Rules:");
  if (report.topRules.length === 0) {
    lines.push("- none");
  } else {
    for (const rule of report.topRules) {
      lines.push(`- ${rule.ruleId}: ${rule.count}`);
    }
  }
  lines.push("");
  lines.push("Repositories:");
  for (const repo of report.repos) {
    lines.push(
      `- ${repo.repo}: score=${repo.latestScore}, avg=${repo.avgScore}, delta=${repo.scoreDelta >= 0 ? "+" : ""}${repo.scoreDelta}, scans=${repo.scans}, P0=${repo.latestSummary.p0 || 0}, P1=${repo.latestSummary.p1 || 0}, P2=${repo.latestSummary.p2 || 0}`
    );
  }

  const executionSummary = summarizeExecution(report.execution);
  if (executionSummary) {
    lines.push("");
    lines.push("Execution:");
    lines.push(
      `- total=${executionSummary.totalRepos} scanned=${executionSummary.scannedRepos} failed=${executionSummary.failedRepos} errors=${executionSummary.errorRepos} successRate=${executionSummary.successRate}% durationMs=${executionSummary.durationMs}`
    );
    lines.push(
      `- timing(totalMs=${executionSummary.timing.totalMs}, avgRepoMs=${executionSummary.timing.avgRepoMs}, p95RepoMs=${executionSummary.timing.p95RepoMs})`
    );
    lines.push(
      `- stability(successRate=${executionSummary.stability.successRate}%, failRate=${executionSummary.stability.failRate}%, errorRate=${executionSummary.stability.errorRate}%)`
    );
    lines.push(`- failOn=${executionSummary.failOn} continueOnError=${executionSummary.continueOnError}`);
    if (executionSummary.directoryGroups.length > 0) {
      lines.push("- directory groups:");
      for (const group of executionSummary.directoryGroups) {
        lines.push(
          `  - ${group.tag}: total=${group.total}, scanned=${group.scanned}, failed=${group.failed}, errors=${group.errors}, successRate=${group.successRate}%`
        );
      }
    }
    if (executionSummary.missingRepos.length > 0) {
      lines.push("- missing/error repos:");
      for (const repo of executionSummary.missingRepos) {
        lines.push(`  - ${repo.repoId || "(unknown)"}: ${repo.error}`);
      }
    }
  }
  if (report.recovery) {
    lines.push("");
    lines.push("Recovery:");
    lines.push(
      `- riskyLatest=${report.recovery.riskyLatestRepos} recoveredLatest=${report.recovery.recoveredLatestRepos} regressions=${report.recovery.regressions}`
    );
    lines.push(
      `- recoveryEvents=${report.recovery.recoveryEvents} avgScansToRecovery=${report.recovery.avgScansToRecovery} avgHoursToRecovery=${report.recovery.avgHoursToRecovery}`
    );
  }
  if (report.ownership) {
    lines.push("");
    lines.push("Ownership:");
    lines.push(`- orphanFindings=${safeNumber(report.ownership.orphanFindings, 0)}`);
    for (const owner of (report.ownership.topOwners || []).slice(0, 5)) {
      lines.push(`- ${owner.owner}: ${owner.findingCount}`);
    }
  }
  if (report.sla) {
    lines.push("");
    lines.push("SLA:");
    lines.push(`- breaches=${Array.isArray(report.sla.breachedItems) ? report.sla.breachedItems.length : 0}`);
  }
  return lines.join("\n");
}

function formatFleetMarkdown(report) {
  const lines = [];
  lines.push("# Repo Sleep Doctor Fleet Report");
  lines.push("");
  lines.push(`- Generated: \`${report.generatedAt}\``);
  lines.push(`- Repositories: \`${report.stats.repoCount}\``);
  lines.push(`- Scanned Repositories: \`${report.stats.scannedRepoCount}\``);
  lines.push(`- Total Scans: \`${report.stats.totalScans}\``);
  lines.push(`- Average Latest Score: \`${report.stats.avgLatestScore}\``);
  lines.push(`- Repos With P0/P1: \`${report.stats.riskRepos}\``);
  if (report.recovery) {
    lines.push(`- Recovery Events: \`${report.recovery.recoveryEvents}\``);
    lines.push(`- Avg Scans To Recovery: \`${report.recovery.avgScansToRecovery}\``);
    lines.push(`- Avg Hours To Recovery: \`${report.recovery.avgHoursToRecovery}\``);
  }
  lines.push("");

  lines.push("## Top Rules");
  lines.push("");
  if (report.topRules.length === 0) {
    lines.push("No rule usage data.");
  } else {
    lines.push("| Rule | Count |");
    lines.push("| --- | ---: |");
    for (const rule of report.topRules) {
      lines.push(`| \`${rule.ruleId}\` | ${rule.count} |`);
    }
  }

  lines.push("");
  lines.push("## Repositories");
  lines.push("");
  lines.push("| Repo | Latest Score | Avg Score | Delta | Scans | P0 | P1 | P2 |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const repo of report.repos) {
    lines.push(
      `| ${repo.repo} | ${repo.latestScore} | ${repo.avgScore} | ${repo.scoreDelta >= 0 ? "+" : ""}${repo.scoreDelta} | ${repo.scans} | ${
        repo.latestSummary.p0 || 0
      } | ${repo.latestSummary.p1 || 0} | ${repo.latestSummary.p2 || 0} |`
    );
  }

  const executionSummary = summarizeExecution(report.execution);
  if (executionSummary) {
    lines.push("");
    lines.push("## Execution");
    lines.push("");
    lines.push(`- Total Repos: \`${executionSummary.totalRepos}\``);
    lines.push(`- Scanned Repos: \`${executionSummary.scannedRepos}\``);
    lines.push(`- Failed Repos: \`${executionSummary.failedRepos}\``);
    lines.push(`- Error Repos: \`${executionSummary.errorRepos}\``);
    lines.push(`- Success Rate: \`${executionSummary.successRate}%\``);
    lines.push(`- Fail Rate: \`${executionSummary.stability.failRate}%\``);
    lines.push(`- Error Rate: \`${executionSummary.stability.errorRate}%\``);
    lines.push(`- Duration: \`${executionSummary.durationMs}ms\``);
    lines.push(
      `- Timing: \`totalMs=${executionSummary.timing.totalMs} avgRepoMs=${executionSummary.timing.avgRepoMs} p95RepoMs=${executionSummary.timing.p95RepoMs}\``
    );
    lines.push(`- Fail On: \`${executionSummary.failOn}\``);
    lines.push(`- Continue On Error: \`${executionSummary.continueOnError}\``);
    if (executionSummary.directoryGroups.length > 0) {
      lines.push("- Directory Groups:");
      for (const group of executionSummary.directoryGroups) {
        lines.push(
          `  - \`${group.tag}\`: total=${group.total}, scanned=${group.scanned}, failed=${group.failed}, errors=${group.errors}, successRate=${group.successRate}%`
        );
      }
    }
    if (executionSummary.missingRepos.length > 0) {
      lines.push("- Missing/Error Repos:");
      for (const repo of executionSummary.missingRepos) {
        lines.push(`  - \`${repo.repoId || "(unknown)"}\`: ${repo.error}`);
      }
    }
  }
  if (report.ownership) {
    lines.push("");
    lines.push("## Ownership");
    lines.push("");
    lines.push(`- Orphan Findings: \`${safeNumber(report.ownership.orphanFindings, 0)}\``);
  }
  if (report.sla) {
    lines.push("");
    lines.push("## SLA");
    lines.push("");
    lines.push(`- Breaches: \`${Array.isArray(report.sla.breachedItems) ? report.sla.breachedItems.length : 0}\``);
  }
  return lines.join("\n");
}

function formatFleetHtml(report) {
  const executionSummary = summarizeExecution(report.execution);
  const recovery = report.recovery || summarizeRecoveryCadence(report.repos || []);
  const topRuleMax = report.topRules.length > 0 ? report.topRules[0].count : 1;
  const ruleRows =
    report.topRules.length === 0
      ? `<div class="empty">No rule usage data.</div>`
      : report.topRules
          .map(
            (rule) => `<div class="bar-row"><div class="bar-label">${escapeHtml(rule.ruleId)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(
              8,
              Math.round((rule.count / topRuleMax) * 100)
            )}%"></div></div><div class="bar-value">${rule.count}</div></div>`
          )
          .join("");

  const repoRows =
    report.repos.length === 0
      ? `<tr><td colspan="8">No repository history data.</td></tr>`
      : report.repos
          .map(
            (repo) => `<tr>
        <td>${escapeHtml(repo.repo)}</td>
        <td>${repo.latestScore}</td>
        <td>${repo.avgScore}</td>
        <td>${repo.scoreDelta >= 0 ? "+" : ""}${repo.scoreDelta}</td>
        <td>${repo.scans}</td>
        <td>${repo.latestSummary.p0 || 0}</td>
        <td>${repo.latestSummary.p1 || 0}</td>
        <td>${repo.latestSummary.p2 || 0}</td>
      </tr>`
          )
          .join("");

  const executionMetrics = executionSummary
    ? `<section class="metrics exec-metrics">
        <div class="metric"><div class="k">Success Rate</div><div class="v">${executionSummary.successRate}%</div></div>
        <div class="metric"><div class="k">P95 Repo</div><div class="v">${executionSummary.timing.p95RepoMs}ms</div></div>
        <div class="metric"><div class="k">Failed</div><div class="v">${executionSummary.failedRepos}</div></div>
        <div class="metric"><div class="k">Errors</div><div class="v">${executionSummary.errorRepos}</div></div>
        <div class="metric"><div class="k">Duration</div><div class="v">${executionSummary.durationMs}ms</div></div>
      </section>`
    : "";

  const slowRepoRows = executionSummary
    ? executionSummary.hotspots.slowRepos
        .map(
          (repo) =>
            `<tr><td>${escapeHtml(repo.repoId || "(unknown)")}</td><td>${repo.durationMs}</td><td>${escapeHtml(repo.status)}</td></tr>`
        )
        .join("")
    : "";
  const cacheRows = executionSummary
    ? executionSummary.hotspots.cacheRank
        .map(
          (repo) =>
            `<tr><td>${escapeHtml(repo.repoId || "(unknown)")}</td><td>${repo.hitRate}%</td><td>${repo.hits}/${repo.misses}</td></tr>`
        )
        .join("")
    : "";
  const executionBlock = executionSummary
    ? `<section class="panel exec-panel">
        <h2>Execution Overview</h2>
        <div class="exec-meta">
          <span>failOn=${escapeHtml(executionSummary.failOn)}</span>
          <span>continueOnError=${executionSummary.continueOnError}</span>
          <span>scanned=${executionSummary.scannedRepos}/${executionSummary.totalRepos}</span>
        </div>
        <div class="exec-grid">
          <div class="mini-table">
            <h3>Slowest Repositories</h3>
            <table>
              <thead><tr><th>Repo</th><th>Duration (ms)</th><th>Status</th></tr></thead>
              <tbody>${slowRepoRows || '<tr><td colspan="3">No run data.</td></tr>'}</tbody>
            </table>
          </div>
          <div class="mini-table">
            <h3>Cache Hit Ranking</h3>
            <table>
              <thead><tr><th>Repo</th><th>Hit Rate</th><th>Hits/Misses</th></tr></thead>
              <tbody>${cacheRows || '<tr><td colspan="3">No cache data.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </section>`
    : "";

  const groupRows = executionSummary
    ? executionSummary.directoryGroups
        .map(
          (group) =>
            `<tr><td>${escapeHtml(group.tag)}</td><td>${group.total}</td><td>${group.scanned}</td><td>${group.failed}</td><td>${group.errors}</td><td>${group.successRate}%</td></tr>`
        )
        .join("")
    : "";

  const missingRows = executionSummary
    ? executionSummary.missingRepos
        .map(
          (repo) =>
            `<tr><td>${escapeHtml(repo.repoId || "(unknown)")}</td><td>${escapeHtml(repo.path || "-")}</td><td>${escapeHtml(
              repo.error || "-"
            )}</td></tr>`
        )
        .join("")
    : "";

  const directoryBlock = executionSummary
    ? `<section class="panel exec-panel">
        <h2>Directory Groups</h2>
        <div class="mini-table">
          <table>
            <thead><tr><th>Tag</th><th>Total</th><th>Scanned</th><th>Failed</th><th>Errors</th><th>Success</th></tr></thead>
            <tbody>${groupRows || '<tr><td colspan="6">No group data.</td></tr>'}</tbody>
          </table>
        </div>
      </section>`
    : "";

  const missingBlock = executionSummary
    ? `<section class="panel exec-panel">
        <h2>Missing / Error Repositories</h2>
        <div class="mini-table">
          <table>
            <thead><tr><th>Repo</th><th>Path</th><th>Error</th></tr></thead>
            <tbody>${missingRows || '<tr><td colspan="3">No missing repositories.</td></tr>'}</tbody>
          </table>
        </div>
      </section>`
    : "";

  const recoveryBlock = `<section class="panel exec-panel">
      <h2>Recovery Cadence</h2>
      <section class="metrics exec-metrics">
        <div class="metric"><div class="k">Risky Latest</div><div class="v">${recovery.riskyLatestRepos}</div></div>
        <div class="metric"><div class="k">Recovered Latest</div><div class="v">${recovery.recoveredLatestRepos}</div></div>
        <div class="metric"><div class="k">Regressions</div><div class="v">${recovery.regressions}</div></div>
        <div class="metric"><div class="k">Events</div><div class="v">${recovery.recoveryEvents}</div></div>
        <div class="metric"><div class="k">Avg Scans</div><div class="v">${recovery.avgScansToRecovery}</div></div>
      </section>
      <div class="meta">Avg hours to recover: ${recovery.avgHoursToRecovery}</div>
    </section>`;
  const ownershipBlock = report.ownership
    ? `<section class="panel exec-panel">
      <h2>Ownership</h2>
      <div class="meta">Orphan findings: ${safeNumber(report.ownership.orphanFindings, 0)}</div>
      <div class="mini-table">
        <table>
          <thead><tr><th>Owner</th><th>Findings</th></tr></thead>
          <tbody>${
            (report.ownership.topOwners || []).length > 0
              ? report.ownership.topOwners
                  .slice(0, 10)
                  .map((owner) => `<tr><td>${escapeHtml(owner.owner)}</td><td>${safeNumber(owner.findingCount, 0)}</td></tr>`)
                  .join("")
              : '<tr><td colspan="2">No owner data.</td></tr>'
          }</tbody>
        </table>
      </div>
    </section>`
    : "";
  const slaBlock = report.sla
    ? `<section class="panel exec-panel">
      <h2>SLA</h2>
      <div class="meta">Breaches: ${Array.isArray(report.sla.breachedItems) ? report.sla.breachedItems.length : 0}</div>
    </section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Repo Sleep Doctor Fleet Report</title>
  <style>
    :root { --bg: #f2f7fb; --card: #fff; --line: #d6e1ea; --ink: #123; --muted: #617387; --accent: #145a7a; }
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; background: radial-gradient(circle at 0 0, #d8eefb, transparent 45%), var(--bg); color: var(--ink); }
    .wrap { max-width: 1200px; margin: 24px auto; padding: 0 16px 24px; }
    .hero, .panel, .table-wrap { background: var(--card); border: 1px solid var(--line); border-radius: 14px; }
    .hero { padding: 18px; }
    h1 { margin: 0 0 8px; color: var(--accent); }
    .meta { color: var(--muted); font-size: 13px; }
    .metrics { margin-top: 12px; display: grid; grid-template-columns: repeat(5, minmax(100px, 1fr)); gap: 10px; }
    .metric { border: 1px solid var(--line); border-radius: 10px; padding: 10px; background: #fafdff; }
    .metric .k { font-size: 12px; color: var(--muted); text-transform: uppercase; }
    .metric .v { font-size: 22px; font-weight: 700; margin-top: 3px; color: var(--accent); }
    .grid { margin-top: 14px; display: grid; grid-template-columns: 1fr; gap: 12px; }
    .panel { padding: 12px; }
    .panel h2 { margin: 0 0 8px; font-size: 16px; color: #24455f; }
    .exec-metrics { margin-top: 12px; }
    .exec-panel { margin-top: 12px; }
    .exec-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: #3f5c74; margin-bottom: 8px; }
    .exec-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .mini-table h3 { margin: 0 0 6px; font-size: 14px; color: #24455f; }
    .mini-table table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .mini-table th, .mini-table td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #edf3f8; }
    .bar-row { display: grid; grid-template-columns: 160px 1fr 50px; gap: 8px; align-items: center; margin-bottom: 8px; }
    .bar-label { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-track { background: #edf3f8; border-radius: 999px; height: 10px; overflow: hidden; }
    .bar-fill { background: linear-gradient(90deg, #4f84c9, #145a7a); height: 100%; }
    .bar-value { text-align: right; font-size: 12px; color: #456; }
    .table-wrap { margin-top: 12px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; font-size: 13px; padding: 10px 12px; border-bottom: 1px solid #ebf1f6; }
    th { background: #f7fbff; color: #355; }
    tr:last-child td { border-bottom: 0; }
    .empty { color: #617387; font-size: 13px; }
    @media (max-width: 760px) {
      .metrics { grid-template-columns: repeat(2, minmax(100px, 1fr)); }
      th:nth-child(3), td:nth-child(3), th:nth-child(4), td:nth-child(4) { display: none; }
      .bar-row { grid-template-columns: 120px 1fr 40px; }
      .exec-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>Repo Sleep Doctor Fleet Report</h1>
      <div class="meta">Generated: ${report.generatedAt}</div>
      <div class="metrics">
        <div class="metric"><div class="k">Repos</div><div class="v">${report.stats.repoCount}</div></div>
        <div class="metric"><div class="k">Scanned</div><div class="v">${report.stats.scannedRepoCount}</div></div>
        <div class="metric"><div class="k">Total Scans</div><div class="v">${report.stats.totalScans}</div></div>
        <div class="metric"><div class="k">Avg Latest</div><div class="v">${report.stats.avgLatestScore}</div></div>
        <div class="metric"><div class="k">Risk Repos</div><div class="v">${report.stats.riskRepos}</div></div>
      </div>
    </section>
    ${executionMetrics}
    <section class="grid">
      <article class="panel">
        <h2>Top Rules (latest snapshots)</h2>
        ${ruleRows}
      </article>
    </section>
    ${executionBlock}
    ${directoryBlock}
    ${missingBlock}
    ${recoveryBlock}
    ${ownershipBlock}
    ${slaBlock}
    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Repo</th>
            <th>Latest Score</th>
            <th>Avg Score</th>
            <th>Delta</th>
            <th>Scans</th>
            <th>P0</th>
            <th>P1</th>
            <th>P2</th>
          </tr>
        </thead>
        <tbody>${repoRows}</tbody>
      </table>
    </section>
  </div>
</body>
</html>`;
}

function formatFleetReport(report, format = "text") {
  const normalized = String(format || "text").toLowerCase();
  if (!VALID_FLEET_FORMATS.has(normalized)) {
    throw new Error(`Invalid fleet format: ${format}`);
  }
  if (normalized === "json") {
    const executionSummary = summarizeExecution(report.execution);
    const payload = executionSummary ? { ...report, executionSummary } : report;
    return JSON.stringify(payload, null, 2);
  }
  if (normalized === "markdown" || normalized === "md") {
    return formatFleetMarkdown(report);
  }
  if (normalized === "html") {
    return formatFleetHtml(report);
  }
  return formatFleetText(report);
}

module.exports = {
  VALID_FLEET_FORMATS,
  buildFleetReport,
  formatFleetReport,
  formatFleetText,
  formatFleetMarkdown,
  formatFleetHtml
};

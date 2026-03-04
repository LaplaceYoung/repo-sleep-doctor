const { SEVERITY_ORDER, formatDuration, toPosixPath } = require("./utils");

function findingLocation(finding) {
  if (!finding.file) {
    return "(global)";
  }
  if (!finding.line) {
    return finding.file;
  }
  return `${finding.file}:${finding.line}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatComparisonText(report) {
  if (!report.baseline) {
    return [];
  }

  const lines = [];
  lines.push(`Baseline: ${report.baseline.baselinePath}`);
  if (report.baseline.baselineScannedAt) {
    lines.push(`Baseline scanned at: ${report.baseline.baselineScannedAt}`);
  }
  lines.push(
    `Delta: new=${report.baseline.counts.new} unchanged=${report.baseline.counts.unchanged} resolved=${report.baseline.counts.resolved}`
  );
  if (report.currentSummary) {
    lines.push(
      `Current summary (all findings): P0=${report.currentSummary.p0} P1=${report.currentSummary.p1} P2=${report.currentSummary.p2} | Score=${report.currentScore}/100`
    );
  }

  return lines;
}

function formatAnalysisSummary(analysis) {
  if (!analysis || typeof analysis !== "object") {
    return "";
  }

  const parts = [];
  parts.push(`textCandidates=${analysis.textCandidates}`);
  parts.push(`textRead=${analysis.textFilesRead}`);
  parts.push(`lineScanSkipped=${analysis.lineScanSkippedFiles}`);
  parts.push(`linesScanned=${analysis.linesScanned}`);

  if (Number.isFinite(Number(analysis.cacheHits)) || Number.isFinite(Number(analysis.cacheMisses))) {
    const hits = Number.isFinite(Number(analysis.cacheHits)) ? Number(analysis.cacheHits) : 0;
    const misses = Number.isFinite(Number(analysis.cacheMisses)) ? Number(analysis.cacheMisses) : 0;
    const hitRate = Number.isFinite(Number(analysis.cacheHitRate)) ? Number(analysis.cacheHitRate) : 0;
    parts.push(`cacheHits=${hits}`);
    parts.push(`cacheMisses=${misses}`);
    parts.push(`cacheHitRate=${(hitRate * 100).toFixed(1)}%`);
  }

  return parts.join(" ");
}

function formatText(report) {
  const lines = [];
  lines.push(`Repo Sleep Doctor v${report.version}`);
  lines.push(`Target: ${report.rootPath}`);
  lines.push(`Scanned: ${report.scannedAt}`);
  lines.push(`Duration: ${formatDuration(report.durationMs)} | Files: ${report.fileCount}`);
  if (report.config && report.config.preset) {
    lines.push(`Preset: ${report.config.preset}`);
  }
  if (report.config && report.config.changedSince) {
    lines.push(`Changed since: ${report.config.changedSince}`);
  }
  lines.push(
    `Findings: P0=${report.summary.p0} P1=${report.summary.p1} P2=${report.summary.p2} | Score=${report.score}/100`
  );
  if (report.analysis) {
    lines.push(`Analysis: ${formatAnalysisSummary(report.analysis)}`);
  }
  if (Array.isArray(report.history)) {
    lines.push(`History points: ${report.history.length}`);
  }

  if (report.configPath) {
    lines.push(`Config: ${report.configPath}`);
  }
  if (report.truncated) {
    lines.push("Notice: file scan was truncated by maxFiles limit.");
  }
  if (report.skipped.length > 0) {
    lines.push(`Notice: ${report.skipped.length} paths were skipped due to read errors.`);
  }

  lines.push(...formatComparisonText(report));
  lines.push("");

  if (report.findings.length === 0) {
    lines.push("No findings detected.");
    return lines.join("\n");
  }

  for (let index = 0; index < report.findings.length; index += 1) {
    const finding = report.findings[index];
    lines.push(`${index + 1}. [${finding.severity.toUpperCase()}] ${finding.title}`);
    lines.push(`   ${findingLocation(finding)}`);
    lines.push(`   ${finding.message}`);
    if (finding.suggestion) {
      lines.push(`   Fix: ${finding.suggestion}`);
    }
  }

  return lines.join("\n");
}

function formatMarkdown(report) {
  function escapeMarkdownCell(value) {
    return String(value ?? "")
      .replace(/\|/g, "\\|")
      .replace(/\r?\n/g, "<br>");
  }

  const lines = [];
  lines.push("# Repo Sleep Doctor Report");
  lines.push("");
  lines.push(`- Target: \`${report.rootPath}\``);
  lines.push(`- Scanned: \`${report.scannedAt}\``);
  lines.push(`- Duration: \`${formatDuration(report.durationMs)}\``);
  lines.push(`- Files: \`${report.fileCount}\``);
  if (report.config && report.config.preset) {
    lines.push(`- Preset: \`${report.config.preset}\``);
  }
  if (report.config && report.config.changedSince) {
    lines.push(`- Changed since: \`${report.config.changedSince}\``);
  }
  lines.push(`- Score: \`${report.score}/100\``);
  lines.push(`- Findings: \`P0=${report.summary.p0} P1=${report.summary.p1} P2=${report.summary.p2}\``);
  if (report.analysis) {
    lines.push(`- Analysis: \`${formatAnalysisSummary(report.analysis)}\``);
  }
  if (Array.isArray(report.history)) {
    lines.push(`- History points: \`${report.history.length}\``);
  }

  if (report.baseline) {
    lines.push(`- Baseline: \`${report.baseline.baselinePath}\``);
    lines.push(
      `- Delta: \`new=${report.baseline.counts.new} unchanged=${report.baseline.counts.unchanged} resolved=${report.baseline.counts.resolved}\``
    );
    if (report.currentSummary) {
      lines.push(
        `- Current summary: \`P0=${report.currentSummary.p0} P1=${report.currentSummary.p1} P2=${report.currentSummary.p2} score=${report.currentScore}/100\``
      );
    }
  }

  lines.push("");
  if (report.findings.length === 0) {
    lines.push("No findings detected.");
    return lines.join("\n");
  }

  lines.push("| Severity | Location | Rule | Title | Message |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const finding of report.findings) {
    lines.push(
      `| ${finding.severity.toUpperCase()} | ${escapeMarkdownCell(findingLocation(finding))} | ${escapeMarkdownCell(
        finding.id
      )} | ${escapeMarkdownCell(finding.title)} | ${escapeMarkdownCell(finding.message)} |`
    );
  }

  return lines.join("\n");
}

function severityToSarifLevel(severity) {
  if (severity === "p0") return "error";
  if (severity === "p1") return "warning";
  return "note";
}

const SARIF_RULE_DOC_BASE = "https://github.com/LaplaceYoung/repo-sleep-doctor/blob/main/docs/rules.md";

function inferRuleTags(ruleId) {
  if (/(key|secret)/i.test(ruleId)) {
    return ["security", "secrets", "release-risk"];
  }
  if (/merge-marker/.test(ruleId)) {
    return ["quality", "merge", "release-risk"];
  }
  if (/(console-call|debugger|print-call|todo-comment)/.test(ruleId)) {
    return ["quality", "debug", "release-risk"];
  }
  if (/readme/.test(ruleId)) {
    return ["documentation", "release-readiness"];
  }
  if (/(build|test|lint|package-json|missing-tests)/.test(ruleId)) {
    return ["ci", "release-readiness"];
  }
  if (/large-file/.test(ruleId)) {
    return ["repository-health", "release-readiness"];
  }
  return ["release-risk"];
}

function formatSarif(report) {
  const ruleMap = new Map();
  for (const finding of report.findings) {
    if (!ruleMap.has(finding.id)) {
      ruleMap.set(finding.id, {
        id: finding.id,
        name: finding.title,
        shortDescription: {
          text: finding.title
        },
        fullDescription: {
          text: finding.message
        },
        helpUri: `${SARIF_RULE_DOC_BASE}#${finding.id}`,
        defaultConfiguration: {
          level: severityToSarifLevel(finding.severity)
        },
        properties: {
          severity: finding.severity,
          tags: inferRuleTags(finding.id)
        }
      });
    }
  }

  const results = report.findings.map((finding) => {
    const result = {
      ruleId: finding.id,
      level: severityToSarifLevel(finding.severity),
      message: {
        text: `${finding.title}. ${finding.message}`
      },
      properties: {
        severity: finding.severity,
        suggestion: finding.suggestion || ""
      }
    };

    if (finding.file) {
      result.locations = [
        {
          physicalLocation: {
            artifactLocation: {
              uri: toPosixPath(finding.file)
            },
            region: {
              startLine: finding.line || 1
            }
          }
        }
      ];
    }

    return result;
  });

  const sarif = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "repo-sleep-doctor",
            version: report.version,
            informationUri: "https://github.com",
            rules: Array.from(ruleMap.values())
          }
        },
        invocations: [
          {
            executionSuccessful: true
          }
        ],
        properties: {
          rootPath: report.rootPath,
          scannedAt: report.scannedAt,
          score: report.score,
          summary: report.summary,
          baseline: report.baseline
            ? {
                path: report.baseline.baselinePath,
                counts: report.baseline.counts
              }
            : null
        },
        results
      }
    ]
  };

  return JSON.stringify(sarif, null, 2);
}

function formatJunit(report) {
  const testcases =
    report.findings.length === 0
      ? [
          `<testcase classname="repo-sleep-doctor" name="scan-clean"><system-out>No findings detected.</system-out></testcase>`
        ]
      : report.findings.map((finding) => {
          const location = findingLocation(finding);
          const testcaseName = `${finding.id} ${location}`;
          const failureMessage = `${finding.title}. ${finding.message}`;
          const suggestion = finding.suggestion ? ` Suggestion: ${finding.suggestion}` : "";
          return `<testcase classname="${escapeXml(finding.id)}" name="${escapeXml(testcaseName)}"><failure type="${escapeXml(
            finding.severity.toUpperCase()
          )}" message="${escapeXml(failureMessage)}">${escapeXml(
            `${failureMessage}${suggestion}`
          )}</failure></testcase>`;
        });

  const failures = report.findings.length;
  const tests = Math.max(report.findings.length, 1);

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="${tests}" failures="${failures}" errors="0" skipped="0" name="repo-sleep-doctor">
  <testsuite name="repo-sleep-doctor" tests="${tests}" failures="${failures}" errors="0" skipped="0" timestamp="${escapeXml(
    report.scannedAt
  )}" time="${(report.durationMs / 1000).toFixed(3)}">
    ${testcases.join("\n    ")}
  </testsuite>
</testsuites>`;
}

function severityChipClass(severity) {
  if (severity === "p0") return "sev sev-p0";
  if (severity === "p1") return "sev sev-p1";
  return "sev sev-p2";
}

function formatHtml(report) {
  const cacheHitRate =
    report.analysis && Number.isFinite(Number(report.analysis.cacheHitRate))
      ? Math.round(Number(report.analysis.cacheHitRate) * 100)
      : null;
  const cacheMetric = cacheHitRate === null
    ? ""
    : `<div class="metric"><div class="label">Cache Hit</div><div class="value">${cacheHitRate}%</div></div>`;
  const summaryBlocks = `
    <div class="metric"><div class="label">P0</div><div class="value">${report.summary.p0}</div></div>
    <div class="metric"><div class="label">P1</div><div class="value">${report.summary.p1}</div></div>
    <div class="metric"><div class="label">P2</div><div class="value">${report.summary.p2}</div></div>
    <div class="metric"><div class="label">Score</div><div class="value">${report.score}</div></div>
    ${cacheMetric}
  `;

  const comparisonBlock = report.baseline
    ? `<div class="comparison">
      <strong>Baseline:</strong> ${escapeHtml(report.baseline.baselinePath)}<br/>
      <strong>Delta:</strong> new=${report.baseline.counts.new} unchanged=${report.baseline.counts.unchanged} resolved=${report.baseline.counts.resolved}
      ${
        report.currentSummary
          ? `<br/><strong>Current:</strong> P0=${report.currentSummary.p0} P1=${report.currentSummary.p1} P2=${report.currentSummary.p2} score=${report.currentScore}`
          : ""
      }
    </div>`
    : "";

  const analysisBlock = report.analysis
    ? `<div class="analysis">
      <strong>Fast Path:</strong> ${escapeHtml(formatAnalysisSummary(report.analysis))}
    </div>`
    : "";

  const historyEntries = Array.isArray(report.history) ? report.history.slice(-30) : [];
  const trendEntries = historyEntries.length > 0 ? historyEntries : [{ scannedAt: report.scannedAt, score: report.score }];
  const trendScores = trendEntries.map((entry) => {
    const raw = Number(entry && entry.score);
    if (!Number.isFinite(raw)) {
      return 0;
    }
    if (raw < 0) return 0;
    if (raw > 100) return 100;
    return raw;
  });
  const trendWidth = 760;
  const trendHeight = 170;
  const trendPadding = 20;
  const trendStep = trendScores.length > 1 ? (trendWidth - trendPadding * 2) / (trendScores.length - 1) : 0;
  const trendPoints = trendScores.map((score, index) => {
    const x = trendPadding + trendStep * index;
    const y = trendPadding + ((100 - score) / 100) * (trendHeight - trendPadding * 2);
    return { x, y, score };
  });
  const trendPolyline = trendPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const trendMin = Math.min(...trendScores);
  const trendMax = Math.max(...trendScores);
  const trendLatest = trendScores[trendScores.length - 1];
  const trendDelta = trendScores.length > 1 ? trendLatest - trendScores[0] : 0;
  const recentHistoryRows = trendEntries
    .slice(-6)
    .reverse()
    .map((entry) => {
      const summary = entry && entry.summary ? entry.summary : { p0: 0, p1: 0, p2: 0 };
      const preset = entry && entry.preset ? entry.preset : "all";
      return `<tr><td>${escapeHtml(String(entry.scannedAt || ""))}</td><td>${escapeHtml(String(entry.score || 0))}</td><td>${escapeHtml(
        preset
      )}</td><td>P0=${summary.p0 || 0} P1=${summary.p1 || 0} P2=${summary.p2 || 0}</td></tr>`;
    })
    .join("");

  const latestHistory = trendEntries[trendEntries.length - 1] || {};
  const previousHistory = trendEntries.length > 1 ? trendEntries[trendEntries.length - 2] : null;
  const latestRuleCounts =
    latestHistory && latestHistory.ruleCounts && typeof latestHistory.ruleCounts === "object" ? latestHistory.ruleCounts : {};
  const previousRuleCounts =
    previousHistory && previousHistory.ruleCounts && typeof previousHistory.ruleCounts === "object"
      ? previousHistory.ruleCounts
      : {};

  const total = Math.max(report.summary.total || report.findings.length, 1);
  const p0Pct = ((report.summary.p0 / total) * 100).toFixed(2);
  const p1Pct = ((report.summary.p1 / total) * 100).toFixed(2);
  const donut = `conic-gradient(#d14b3b 0 ${p0Pct}%, #d98a00 ${p0Pct}% ${Number(p0Pct) + Number(p1Pct)}%, #4f84c9 ${Number(p0Pct) + Number(p1Pct)}% 100%)`;

  const byRule = new Map();
  const byFile = new Map();
  for (const finding of report.findings) {
    byRule.set(finding.id, (byRule.get(finding.id) || 0) + 1);
    const fileKey = finding.file || "(global)";
    byFile.set(fileKey, (byFile.get(fileKey) || 0) + 1);
  }
  const topRules = Array.from(byRule.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, 8);
  const topFiles = Array.from(byFile.entries())
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
    .slice(0, 8);
  const topRuleMax = topRules.length > 0 ? topRules[0].count : 1;

  const normalizedLatestRuleCounts =
    Object.keys(latestRuleCounts).length > 0 ? latestRuleCounts : Object.fromEntries(byRule.entries());
  const momentumRules = Array.from(new Set([...Object.keys(normalizedLatestRuleCounts), ...Object.keys(previousRuleCounts)]))
    .map((ruleId) => {
      const latest = Number(normalizedLatestRuleCounts[ruleId] || 0);
      const previous = Number(previousRuleCounts[ruleId] || 0);
      return {
        ruleId,
        latest,
        delta: latest - previous
      };
    })
    .sort((a, b) => b.latest - a.latest || Math.abs(b.delta) - Math.abs(a.delta) || a.ruleId.localeCompare(b.ruleId))
    .slice(0, 8);
  const momentumRows =
    momentumRules.length === 0
      ? `<tr><td colspan="3">No rule momentum data.</td></tr>`
      : momentumRules
          .map(
            (item) =>
              `<tr><td>${escapeHtml(item.ruleId)}</td><td>${item.latest}</td><td>${item.delta >= 0 ? "+" : ""}${item.delta}</td></tr>`
          )
          .join("");

  const ruleBars =
    topRules.length === 0
      ? `<div class="empty">No rule distribution available.</div>`
      : topRules
          .map(
            (item) => `<div class="bar-row">
              <div class="bar-label">${escapeHtml(item.id)}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, Math.round((item.count / topRuleMax) * 100))}%"></div></div>
              <div class="bar-value">${item.count}</div>
            </div>`
          )
          .join("");

  const hotspotRows =
    topFiles.length === 0
      ? `<tr><td colspan="2">No hotspots.</td></tr>`
      : topFiles
          .map((item) => `<tr><td>${escapeHtml(item.file)}</td><td>${item.count}</td></tr>`)
          .join("");

  const rows =
    report.findings.length === 0
      ? `<tr><td colspan="5">No findings detected.</td></tr>`
      : report.findings
          .map(
            (finding) => `
    <tr data-sev="${escapeHtml(finding.severity)}">
      <td><span class="${severityChipClass(finding.severity)}">${finding.severity.toUpperCase()}</span></td>
      <td>${escapeHtml(finding.id)}</td>
      <td>${escapeHtml(finding.title)}</td>
      <td>${escapeHtml(findingLocation(finding))}</td>
      <td>${escapeHtml(finding.message)}${
                finding.suggestion ? `<div class="suggestion">Fix: ${escapeHtml(finding.suggestion)}</div>` : ""
              }</td>
    </tr>`
          )
          .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Repo Sleep Doctor Report</title>
  <style>
    :root { --bg: #f2f7fb; --fg: #123; --card: #fff; --accent: #145a7a; --muted: #6b7785; --border: #d6e1ea; --p0:#d14b3b; --p1:#d98a00; --p2:#4f84c9; }
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: var(--fg); background: radial-gradient(circle at 0 0, #d8eefb, transparent 45%), var(--bg); }
    .wrap { max-width: 1200px; margin: 24px auto; padding: 0 16px 32px; }
    .hero { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 20px; box-shadow: 0 8px 24px rgba(9, 33, 52, 0.08); }
    h1 { margin: 0 0 8px; color: var(--accent); font-size: 28px; }
    .meta { color: var(--muted); font-size: 13px; line-height: 1.6; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-top: 14px; }
    .metric { border: 1px solid var(--border); border-radius: 12px; padding: 12px; background: #fafdff; }
    .metric .label { font-size: 12px; color: var(--muted); text-transform: uppercase; }
    .metric .value { font-size: 24px; font-weight: 700; margin-top: 4px; color: var(--accent); }
    .comparison, .analysis { margin-top: 12px; padding: 10px 12px; border: 1px dashed var(--border); border-radius: 10px; background: #f9fcff; font-size: 13px; color: #365066; }
    .panels { margin-top: 18px; display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: 14px; }
    .panel { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 14px; }
    .panel h2 { margin: 0 0 10px; font-size: 15px; color: #24455f; }
    .donut-wrap { display: flex; gap: 16px; align-items: center; }
    .donut { width: 140px; height: 140px; border-radius: 50%; background: ${donut}; position: relative; }
    .donut::after { content: ""; position: absolute; inset: 18px; background: white; border-radius: 50%; box-shadow: inset 0 0 0 1px #e6eef5; }
    .legend { font-size: 13px; color: #425a70; line-height: 1.8; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 999px; margin-right: 6px; }
    .dot-p0 { background: var(--p0); } .dot-p1 { background: var(--p1); } .dot-p2 { background: var(--p2); }
    .bar-row { display: grid; grid-template-columns: 120px 1fr 36px; gap: 8px; align-items: center; margin-bottom: 8px; }
    .bar-label { font-size: 12px; color: #345; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { background: #edf3f8; height: 10px; border-radius: 999px; overflow: hidden; }
    .bar-fill { background: linear-gradient(90deg, #4f84c9, #145a7a); height: 100%; border-radius: 999px; }
    .bar-value { font-size: 12px; color: #456; text-align: right; }
    .hotspots table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .hotspots th, .hotspots td { border-bottom: 1px solid #edf3f8; text-align: left; padding: 8px 4px; }
    .hotspots tr:last-child td { border-bottom: 0; }
    .controls { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; align-items: center; }
    .pill { border: 1px solid var(--border); background: #fff; color: #2c4f67; border-radius: 999px; padding: 6px 11px; font-size: 12px; cursor: pointer; }
    .pill.active { background: #e7f1f8; border-color: #b6d2e3; font-weight: 600; }
    .search { margin-left: auto; min-width: 220px; max-width: 320px; width: 100%; border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; font-size: 13px; }
    .table-wrap { margin-top: 10px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 11px 12px; border-bottom: 1px solid #ebf1f6; vertical-align: top; text-align: left; font-size: 13px; }
    th { background: #f7fbff; color: #345; font-weight: 700; }
    tr:last-child td { border-bottom: 0; }
    .trend { margin-top: 14px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 14px; }
    .trend-head { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: baseline; margin-bottom: 10px; }
    .trend-head h2 { margin: 0; font-size: 16px; color: #24455f; }
    .trend-meta { font-size: 12px; color: #4d6378; }
    .trend-grid { stroke: #e7eff6; stroke-width: 1; }
    .trend-line { fill: none; stroke: #145a7a; stroke-width: 2.5; }
    .trend-dot { fill: #145a7a; }
    .trend-axis { font-size: 11px; fill: #5f7589; }
    .history-mini table, .momentum table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    .history-mini th, .history-mini td, .momentum th, .momentum td { border-bottom: 1px solid #edf3f8; text-align: left; padding: 6px 4px; }
    .sev { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 700; color: white; }
    .sev-p0 { background: var(--p0); } .sev-p1 { background: var(--p1); } .sev-p2 { background: var(--p2); }
    .suggestion { margin-top: 6px; color: #4e647a; }
    .empty { color: #668097; font-size: 13px; padding: 8px 0; }
    @media (max-width: 980px) { .panels { grid-template-columns: 1fr; } .search { margin-left: 0; max-width: none; } }
    @media (max-width: 740px) { .metrics { grid-template-columns: repeat(2, minmax(120px, 1fr)); } th:nth-child(2), td:nth-child(2) { display: none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>Repo Sleep Doctor</h1>
      <div class="meta">
        <div><strong>Target:</strong> ${escapeHtml(report.rootPath)}</div>
        <div><strong>Scanned:</strong> ${escapeHtml(report.scannedAt)}</div>
        <div><strong>Duration:</strong> ${escapeHtml(formatDuration(report.durationMs))} | <strong>Files:</strong> ${report.fileCount}</div>
        ${report.config && report.config.preset ? `<div><strong>Preset:</strong> ${escapeHtml(report.config.preset)}</div>` : ""}
        ${report.config && report.config.changedSince ? `<div><strong>Changed since:</strong> ${escapeHtml(report.config.changedSince)}</div>` : ""}
      </div>
      <div class="metrics">${summaryBlocks}</div>
      ${comparisonBlock}
      ${analysisBlock}
    </section>
    <section class="panels">
      <article class="panel">
        <h2>Severity Mix</h2>
        <div class="donut-wrap">
          <div class="donut" aria-label="severity distribution"></div>
          <div class="legend">
            <div><span class="dot dot-p0"></span>P0: ${report.summary.p0}</div>
            <div><span class="dot dot-p1"></span>P1: ${report.summary.p1}</div>
            <div><span class="dot dot-p2"></span>P2: ${report.summary.p2}</div>
          </div>
        </div>
      </article>
      <article class="panel">
        <h2>Top Rules</h2>
        ${ruleBars}
      </article>
      <article class="panel hotspots">
        <h2>Hotspot Files</h2>
        <table>
          <thead><tr><th>File</th><th>Findings</th></tr></thead>
          <tbody>${hotspotRows}</tbody>
        </table>
      </article>
    </section>
    <section class="trend">
      <div class="trend-head">
        <h2>Score Trend</h2>
        <span class="trend-meta">points=${trendScores.length}</span>
        <span class="trend-meta">latest=${trendLatest}</span>
        <span class="trend-meta">min=${trendMin}</span>
        <span class="trend-meta">max=${trendMax}</span>
        <span class="trend-meta">delta=${trendDelta >= 0 ? "+" : ""}${trendDelta.toFixed(1)}</span>
      </div>
      <svg viewBox="0 0 ${trendWidth} ${trendHeight}" width="100%" height="170" role="img" aria-label="score trend chart">
        <line class="trend-grid" x1="${trendPadding}" y1="${trendPadding}" x2="${trendPadding}" y2="${trendHeight - trendPadding}" />
        <line class="trend-grid" x1="${trendPadding}" y1="${trendHeight - trendPadding}" x2="${trendWidth - trendPadding}" y2="${trendHeight - trendPadding}" />
        <line class="trend-grid" x1="${trendPadding}" y1="${trendPadding + ((100 - 75) / 100) * (trendHeight - trendPadding * 2)}" x2="${trendWidth - trendPadding}" y2="${trendPadding + ((100 - 75) / 100) * (trendHeight - trendPadding * 2)}" />
        <line class="trend-grid" x1="${trendPadding}" y1="${trendPadding + ((100 - 50) / 100) * (trendHeight - trendPadding * 2)}" x2="${trendWidth - trendPadding}" y2="${trendPadding + ((100 - 50) / 100) * (trendHeight - trendPadding * 2)}" />
        <line class="trend-grid" x1="${trendPadding}" y1="${trendPadding + ((100 - 25) / 100) * (trendHeight - trendPadding * 2)}" x2="${trendWidth - trendPadding}" y2="${trendPadding + ((100 - 25) / 100) * (trendHeight - trendPadding * 2)}" />
        <polyline class="trend-line" points="${trendPolyline}" />
        ${trendPoints
          .map(
            (point) =>
              `<circle class="trend-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3"><title>score=${point.score}</title></circle>`
          )
          .join("")}
        <text class="trend-axis" x="${trendPadding}" y="${trendPadding - 4}">100</text>
        <text class="trend-axis" x="${trendPadding}" y="${trendHeight - trendPadding + 14}">0</text>
      </svg>
      <div class="history-mini">
        <table>
          <thead><tr><th>Scanned At</th><th>Score</th><th>Preset</th><th>Summary</th></tr></thead>
          <tbody>${recentHistoryRows}</tbody>
        </table>
      </div>
      <div class="momentum">
        <table>
          <thead><tr><th>Rule</th><th>Latest</th><th>Delta vs Prev</th></tr></thead>
          <tbody>${momentumRows}</tbody>
        </table>
      </div>
    </section>
    <section class="controls">
      <button class="pill active" data-filter="all">All</button>
      <button class="pill" data-filter="p0">P0</button>
      <button class="pill" data-filter="p1">P1</button>
      <button class="pill" data-filter="p2">P2</button>
      <input id="finding-search" class="search" placeholder="Search rule / file / message..." />
    </section>
    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Rule</th>
            <th>Title</th>
            <th>Location</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody id="findings-body">${rows}</tbody>
      </table>
    </section>
  </div>
  <script>
    (function() {
      const buttons = Array.from(document.querySelectorAll("[data-filter]"));
      const rows = Array.from(document.querySelectorAll("#findings-body tr[data-sev]"));
      const searchInput = document.getElementById("finding-search");
      let activeFilter = "all";

      function applyFilters() {
        const keyword = (searchInput.value || "").toLowerCase().trim();
        for (const row of rows) {
          const sev = row.getAttribute("data-sev");
          const matchSeverity = activeFilter === "all" || sev === activeFilter;
          const matchKeyword = !keyword || row.textContent.toLowerCase().includes(keyword);
          row.style.display = matchSeverity && matchKeyword ? "" : "none";
        }
      }

      for (const button of buttons) {
        button.addEventListener("click", function() {
          activeFilter = button.getAttribute("data-filter");
          for (const b of buttons) b.classList.toggle("active", b === button);
          applyFilters();
        });
      }

      searchInput.addEventListener("input", applyFilters);
      applyFilters();
    })();
  </script>
</body>
</html>`;
}

function shouldFail(report, failOn) {
  const threshold = failOn || "p0";
  if (threshold === "none") {
    return false;
  }

  const thresholdOrder = SEVERITY_ORDER[threshold];
  if (thresholdOrder === undefined) {
    return false;
  }

  return report.findings.some((finding) => {
    const order = SEVERITY_ORDER[finding.severity];
    return order !== undefined && order <= thresholdOrder;
  });
}

function formatReport(report, format) {
  const normalized = format || "text";
  if (normalized === "json") {
    return JSON.stringify(report, null, 2);
  }
  if (normalized === "markdown" || normalized === "md") {
    return formatMarkdown(report);
  }
  if (normalized === "sarif") {
    return formatSarif(report);
  }
  if (normalized === "html") {
    return formatHtml(report);
  }
  if (normalized === "junit") {
    return formatJunit(report);
  }
  return formatText(report);
}

module.exports = {
  formatReport,
  formatText,
  formatMarkdown,
  formatSarif,
  formatHtml,
  formatJunit,
  shouldFail
};

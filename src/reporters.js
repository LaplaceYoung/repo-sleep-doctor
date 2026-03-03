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

function formatText(report) {
  const lines = [];
  lines.push(`Repo Sleep Doctor v${report.version}`);
  lines.push(`Target: ${report.rootPath}`);
  lines.push(`Scanned: ${report.scannedAt}`);
  lines.push(`Duration: ${formatDuration(report.durationMs)} | Files: ${report.fileCount}`);
  if (report.config && report.config.changedSince) {
    lines.push(`Changed since: ${report.config.changedSince}`);
  }
  lines.push(
    `Findings: P0=${report.summary.p0} P1=${report.summary.p1} P2=${report.summary.p2} | Score=${report.score}/100`
  );

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
  if (report.config && report.config.changedSince) {
    lines.push(`- Changed since: \`${report.config.changedSince}\``);
  }
  lines.push(`- Score: \`${report.score}/100\``);
  lines.push(`- Findings: \`P0=${report.summary.p0} P1=${report.summary.p1} P2=${report.summary.p2}\``);

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

const SARIF_RULE_DOCS = Object.freeze({
  "merge-marker": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "private-key-block": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "aws-key": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "generic-secret": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "console-call": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  debugger: "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "print-call": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "todo-comment": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "large-file": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "missing-readme": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "readme-install": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "readme-usage": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "missing-build-script": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "missing-test-script": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "missing-lint-script": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "invalid-package-json": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include",
  "missing-tests": "https://github.com/LaplaceYoung/repo-sleep-doctor#rule-ids-currently-exposed-include"
});

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
        helpUri: SARIF_RULE_DOCS[finding.id] || "https://github.com/LaplaceYoung/repo-sleep-doctor",
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
  const summaryBlocks = `
    <div class="metric"><div class="label">P0</div><div class="value">${report.summary.p0}</div></div>
    <div class="metric"><div class="label">P1</div><div class="value">${report.summary.p1}</div></div>
    <div class="metric"><div class="label">P2</div><div class="value">${report.summary.p2}</div></div>
    <div class="metric"><div class="label">Score</div><div class="value">${report.score}</div></div>
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

  const rows =
    report.findings.length === 0
      ? `<tr><td colspan="5">No findings detected.</td></tr>`
      : report.findings
          .map(
            (finding) => `
    <tr>
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
    :root { --bg: #f2f7fb; --fg: #123; --card: #fff; --accent: #145a7a; --muted: #6b7785; --border: #d6e1ea; }
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: var(--fg); background: radial-gradient(circle at 0 0, #d8eefb, transparent 45%), var(--bg); }
    .wrap { max-width: 1100px; margin: 24px auto; padding: 0 16px 32px; }
    .hero { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 20px; box-shadow: 0 8px 24px rgba(9, 33, 52, 0.08); }
    h1 { margin: 0 0 8px; color: var(--accent); font-size: 28px; }
    .meta { color: var(--muted); font-size: 13px; line-height: 1.6; }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 12px; margin-top: 14px; }
    .metric { border: 1px solid var(--border); border-radius: 12px; padding: 12px; background: #fafdff; }
    .metric .label { font-size: 12px; color: var(--muted); text-transform: uppercase; }
    .metric .value { font-size: 24px; font-weight: 700; margin-top: 4px; color: var(--accent); }
    .comparison { margin-top: 12px; padding: 10px 12px; border: 1px dashed var(--border); border-radius: 10px; background: #f9fcff; font-size: 13px; color: #365066; }
    .table-wrap { margin-top: 18px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 11px 12px; border-bottom: 1px solid #ebf1f6; vertical-align: top; text-align: left; font-size: 13px; }
    th { background: #f7fbff; color: #345; font-weight: 700; }
    tr:last-child td { border-bottom: 0; }
    .sev { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 700; color: white; }
    .sev-p0 { background: #d14b3b; }
    .sev-p1 { background: #d98a00; }
    .sev-p2 { background: #4f84c9; }
    .suggestion { margin-top: 6px; color: #4e647a; }
    @media (max-width: 740px) {
      .metrics { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      th:nth-child(2), td:nth-child(2) { display: none; }
    }
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
          ${
            report.config && report.config.changedSince
              ? `<div><strong>Changed since:</strong> ${escapeHtml(report.config.changedSince)}</div>`
              : ""
          }
        </div>
      <div class="metrics">${summaryBlocks}</div>
      ${comparisonBlock}
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
        <tbody>${rows}</tbody>
      </table>
    </section>
  </div>
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

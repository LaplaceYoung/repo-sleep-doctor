const fs = require("fs");
const path = require("path");

const { summarizeFindings, calculateScore } = require("./scanner");
const { compareFindings } = require("./utils");

function findingKey(finding) {
  const id = String(finding.id || "");
  const file = String(finding.file || "");
  const line = Number.isFinite(Number(finding.line)) ? Number(finding.line) : 0;
  const message = String(finding.message || "");
  return `${id}::${file}::${line}::${message}`;
}

function normalizeBaselineFindings(value) {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value.findings)) {
    return value.findings;
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [];
}

function loadBaseline(baselinePath) {
  const resolvedPath = path.resolve(baselinePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Baseline file not found: ${resolvedPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (_error) {
    throw new Error(`Invalid JSON in baseline file: ${resolvedPath}`);
  }

  return {
    path: resolvedPath,
    findings: normalizeBaselineFindings(parsed),
    scannedAt: parsed.scannedAt || null
  };
}

function compareWithBaseline(report, baseline) {
  const currentByKey = new Map();
  const baselineByKey = new Map();

  for (const finding of report.findings) {
    currentByKey.set(findingKey(finding), finding);
  }
  for (const finding of baseline.findings) {
    baselineByKey.set(findingKey(finding), finding);
  }

  const newFindings = [];
  const unchangedFindings = [];
  const resolvedFindings = [];

  for (const [key, finding] of currentByKey.entries()) {
    if (baselineByKey.has(key)) {
      unchangedFindings.push(finding);
    } else {
      newFindings.push(finding);
    }
  }
  for (const [key, finding] of baselineByKey.entries()) {
    if (!currentByKey.has(key)) {
      resolvedFindings.push(finding);
    }
  }

  newFindings.sort(compareFindings);
  unchangedFindings.sort(compareFindings);
  resolvedFindings.sort(compareFindings);

  return {
    baselinePath: baseline.path,
    baselineScannedAt: baseline.scannedAt,
    baselineSummary: summarizeFindings(baseline.findings || []),
    newFindings,
    unchangedFindings,
    resolvedFindings,
    counts: {
      new: newFindings.length,
      unchanged: unchangedFindings.length,
      resolved: resolvedFindings.length
    }
  };
}

function createOnlyNewReport(report, comparison) {
  const findings = comparison.newFindings;
  const summary = summarizeFindings(findings);
  return {
    ...report,
    currentSummary: report.summary,
    currentScore: report.score,
    findings,
    summary,
    score: calculateScore(summary),
    baseline: comparison
  };
}

module.exports = {
  compareWithBaseline,
  createOnlyNewReport,
  loadBaseline
};

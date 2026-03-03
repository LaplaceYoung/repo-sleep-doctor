const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { compareWithBaseline, createOnlyNewReport, loadBaseline } = require("../src/baseline");
const { formatSarif, formatMarkdown, shouldFail } = require("../src/reporters");
const { scanRepository } = require("../src/scanner");

const badRepo = path.join(__dirname, "fixtures", "bad-repo");
const goodRepo = path.join(__dirname, "fixtures", "good-repo");
const ignoreRepo = path.join(__dirname, "fixtures", "ignore-repo");

test("scanRepository finds high-severity issues in bad fixture", () => {
  const report = scanRepository(badRepo, {
    maxFiles: 100,
    maxFileSizeMb: 0.0001
  });

  assert.ok(report.summary.p0 >= 2, "Expected at least two P0 findings");
  assert.ok(report.summary.p1 >= 1, "Expected at least one P1 finding");
  assert.ok(report.score < 100, "Expected score to be reduced");
});

test("scanRepository keeps good fixture mostly clean", () => {
  const report = scanRepository(goodRepo, { maxFiles: 100 });

  assert.equal(report.summary.p0, 0, "Expected zero P0 findings");
  assert.ok(report.score >= 90, "Expected high score for clean repository");
});

test("shouldFail honors severity threshold", () => {
  const report = scanRepository(badRepo, { maxFiles: 100 });

  assert.equal(shouldFail(report, "none"), false);
  assert.equal(shouldFail(report, "p0"), true);
  assert.equal(shouldFail(report, "p1"), true);
  assert.equal(shouldFail(report, "p2"), true);
});

test("baseline comparison returns deterministic deltas", () => {
  const currentReport = scanRepository(badRepo, { maxFiles: 100 });
  const baseline = {
    path: "memory-baseline.json",
    scannedAt: null,
    findings: currentReport.findings.slice(0, 3)
  };

  const comparison = compareWithBaseline(currentReport, baseline);
  assert.equal(comparison.counts.unchanged, 3);
  assert.equal(comparison.counts.new, currentReport.findings.length - 3);
  assert.equal(comparison.counts.resolved, 0);

  const newOnlyReport = createOnlyNewReport(currentReport, comparison);
  assert.equal(newOnlyReport.summary.total, comparison.counts.new);
  assert.equal(newOnlyReport.findings.length, comparison.counts.new);
});

test("loadBaseline reads json baseline file", () => {
  const report = scanRepository(goodRepo, { maxFiles: 100 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-doctor-"));
  const baselinePath = path.join(dir, "baseline.json");
  fs.writeFileSync(baselinePath, JSON.stringify(report, null, 2), "utf8");

  const loaded = loadBaseline(baselinePath);
  assert.equal(loaded.path, baselinePath);
  assert.equal(Array.isArray(loaded.findings), true);
  assert.equal(loaded.findings.length, report.findings.length);
});

test("formatSarif returns valid sarif envelope", () => {
  const report = scanRepository(badRepo, { maxFiles: 100 });
  const sarif = JSON.parse(formatSarif(report));

  assert.equal(sarif.version, "2.1.0");
  assert.equal(Array.isArray(sarif.runs), true);
  assert.equal(sarif.runs.length > 0, true);
  assert.equal(Array.isArray(sarif.runs[0].results), true);
  assert.equal(sarif.runs[0].results.length, report.findings.length);
});

test("formatMarkdown escapes table-breaking characters", () => {
  const markdown = formatMarkdown({
    version: "0.2.0",
    rootPath: "/tmp/example",
    scannedAt: "2026-03-03T00:00:00.000Z",
    durationMs: 5,
    fileCount: 1,
    score: 98,
    summary: { p0: 0, p1: 1, p2: 0 },
    findings: [
      {
        severity: "p1",
        id: "demo-rule",
        title: "Title with | pipe",
        file: "src/app.js",
        line: 8,
        message: "line1\nline2 | pipe"
      }
    ]
  });

  assert.match(markdown, /Title with \\| pipe/);
  assert.match(markdown, /line1<br>line2 \\| pipe/);
});

test(".gitignore patterns are applied by default and bypassed when disabled", () => {
  const defaultReport = scanRepository(ignoreRepo, { maxFiles: 100 });
  const bypassReport = scanRepository(ignoreRepo, { maxFiles: 100, useGitIgnore: false });

  const defaultIgnoredConflict = defaultReport.findings.some((finding) => finding.file === "ignored/conflict.txt");
  const bypassIgnoredConflict = bypassReport.findings.some((finding) => finding.file === "ignored/conflict.txt");
  const customIgnoredConflictDefault = defaultReport.findings.some(
    (finding) => finding.file === "custom-ignored/conflict.txt"
  );
  const customIgnoredConflictBypass = bypassReport.findings.some(
    (finding) => finding.file === "custom-ignored/conflict.txt"
  );

  assert.equal(defaultIgnoredConflict, false);
  assert.equal(bypassIgnoredConflict, true);
  assert.equal(customIgnoredConflictDefault, false);
  assert.equal(customIgnoredConflictBypass, false);
});

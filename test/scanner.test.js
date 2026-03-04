const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const { compareWithBaseline, createOnlyNewReport, loadBaseline } = require("../src/baseline");
const { buildFleetReport, formatFleetReport } = require("../src/fleet");
const { formatSarif, formatMarkdown, formatJunit, formatHtml, shouldFail } = require("../src/reporters");
const { scanRepository } = require("../src/scanner");

const badRepo = path.join(__dirname, "fixtures", "bad-repo");
const goodRepo = path.join(__dirname, "fixtures", "good-repo");
const ignoreRepo = path.join(__dirname, "fixtures", "ignore-repo");

function writeCacheFixtureRepo(rootDir) {
  fs.mkdirSync(path.join(rootDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "test"), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, "README.md"),
    "# Demo\n\n## Installation\n\nnpm install\n\n## Usage\n\nnpm run scan\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(rootDir, "package.json"),
    JSON.stringify(
      {
        name: "cache-demo",
        version: "1.0.0",
        scripts: {
          build: "echo build",
          test: "echo test",
          lint: "echo lint"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(path.join(rootDir, "src", "app.js"), "const answer = 42;\n", "utf8");
  fs.writeFileSync(path.join(rootDir, "test", "app.test.js"), "module.exports = {};\n", "utf8");
}

function writeFleetFixtureRepo(rootDir, options = {}) {
  writeCacheFixtureRepo(rootDir);
  if (options.withDebugIssue) {
    fs.appendFileSync(path.join(rootDir, "src", "app.js"), "debugger;\n", "utf8");
  }
}

function initGitRepo(rootDir) {
  execFileSync("git", ["init", "-b", "main"], { cwd: rootDir });
  execFileSync("git", ["config", "user.name", "test-user"], { cwd: rootDir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: rootDir });
}

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

test("scanRepository exposes analysis stats for performance visibility", () => {
  const report = scanRepository(goodRepo, { maxFiles: 100 });
  assert.equal(typeof report.analysis, "object");
  assert.equal(typeof report.analysis.textCandidates, "number");
  assert.equal(typeof report.analysis.textFilesRead, "number");
  assert.equal(typeof report.analysis.lineScanSkippedFiles, "number");
  assert.equal(typeof report.analysis.linesScanned, "number");
  assert.ok(report.analysis.textCandidates >= report.analysis.textFilesRead);
});

test("scanRepository reuses cache file across unchanged runs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-doctor-cache-"));
  writeCacheFixtureRepo(dir);
  const cachePath = path.join(dir, ".cache", "scan-cache.json");

  const first = scanRepository(dir, { maxFiles: 100, cacheFile: cachePath });
  const second = scanRepository(dir, { maxFiles: 100, cacheFile: cachePath });

  assert.equal(first.analysis.cacheHits, 0);
  assert.ok(first.analysis.cacheMisses >= first.fileCount);
  assert.ok(second.analysis.cacheHits >= second.fileCount);
  assert.equal(second.analysis.cacheMisses, 0);
  assert.deepEqual(second.summary, first.summary);
});

test("scanRepository rescans changed files when cache signature changes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-doctor-cache-change-"));
  writeCacheFixtureRepo(dir);
  const cachePath = path.join(dir, ".cache", "scan-cache.json");

  const first = scanRepository(dir, { maxFiles: 100, cacheFile: cachePath });
  assert.equal(first.findings.length, 0);

  fs.appendFileSync(path.join(dir, "src", "app.js"), "debugger;\n", "utf8");
  const second = scanRepository(dir, { maxFiles: 100, cacheFile: cachePath });

  assert.ok(second.analysis.cacheMisses >= 1);
  assert.ok(second.analysis.cacheHits >= 1);
  assert.equal(second.findings.some((finding) => finding.id === "debugger"), true);
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

test("baseline comparison ignores message text-only changes", () => {
  const currentReport = {
    findings: [
      {
        id: "demo-rule",
        severity: "p1",
        file: "src/index.js",
        line: 10,
        message: "new wording"
      }
    ]
  };
  const baseline = {
    path: "memory-baseline.json",
    scannedAt: null,
    findings: [
      {
        id: "demo-rule",
        severity: "p1",
        file: "src/index.js",
        line: 10,
        message: "old wording"
      }
    ]
  };

  const comparison = compareWithBaseline(currentReport, baseline);
  assert.equal(comparison.counts.new, 0);
  assert.equal(comparison.counts.unchanged, 1);
  assert.equal(comparison.counts.resolved, 0);
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
  assert.equal(Array.isArray(sarif.runs[0].tool.driver.rules), true);
  assert.equal(sarif.runs[0].tool.driver.rules.length > 0, true);
  assert.equal(typeof sarif.runs[0].tool.driver.rules[0].helpUri, "string");
  assert.equal(Array.isArray(sarif.runs[0].tool.driver.rules[0].properties.tags), true);
});

test("formatJunit returns valid junit-like xml payload", () => {
  const report = scanRepository(badRepo, { maxFiles: 100 });
  const xml = formatJunit(report);

  assert.match(xml, /<testsuites/);
  assert.match(xml, /<testsuite name="repo-sleep-doctor"/);
  assert.match(xml, /<testcase /);
  assert.match(xml, /<failure /);
});

test("formatHtml contains dashboard panels and filter controls", () => {
  const report = scanRepository(badRepo, { maxFiles: 100 });
  report.history = [
    {
      scannedAt: "2026-03-04T00:00:00.000Z",
      score: 92,
      summary: { p0: 0, p1: 1, p2: 0 },
      preset: "all",
      ruleCounts: { "console-call": 1 }
    },
    {
      scannedAt: "2026-03-04T00:10:00.000Z",
      score: 88,
      summary: { p0: 0, p1: 2, p2: 0 },
      preset: "release",
      ruleCounts: { "console-call": 2, "missing-test-script": 1 }
    }
  ];
  const html = formatHtml(report);
  assert.match(html, /Top Rules/);
  assert.match(html, /Hotspot Files/);
  assert.match(html, /Score Trend/);
  assert.match(html, /Scanned At/);
  assert.match(html, /Delta vs Prev/);
  assert.match(html, /data-filter="p0"/);
  assert.match(html, /finding-search/);
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

test("changed-since scans only files introduced in newer commits", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-doctor-git-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "test"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "README.md"),
    "# Demo\n\n## Installation\n\nUse npm.\n\n## Usage\n\nRun scanner.\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "demo",
        version: "1.0.0",
        scripts: {
          build: "echo build",
          test: "echo test",
          lint: "echo lint"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "test", "index.test.js"), "console.log('test placeholder');\n", "utf8");
  fs.writeFileSync(path.join(dir, "src", "old.js"), "console.log('legacy debug');\n", "utf8");

  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "test-user"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "baseline"], { cwd: dir });

  fs.writeFileSync(path.join(dir, "src", "new.js"), "debugger;\n", "utf8");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "add new issue"], { cwd: dir });

  const fullReport = scanRepository(dir, { maxFiles: 100 });
  const changedReport = scanRepository(dir, { maxFiles: 100, changedSince: "HEAD~1" });

  assert.equal(fullReport.findings.some((finding) => finding.file === "src/old.js"), true);
  assert.equal(fullReport.findings.some((finding) => finding.file === "src/new.js"), true);
  assert.equal(changedReport.findings.some((finding) => finding.file === "src/old.js"), false);
  assert.equal(changedReport.findings.some((finding) => finding.file === "src/new.js"), true);
  assert.equal(changedReport.config.changedSince, "HEAD~1");
});

test("release preset excludes secret-focused rules", () => {
  const report = scanRepository(badRepo, { maxFiles: 100, preset: "release" });
  const ids = new Set(report.findings.map((finding) => finding.id));

  assert.equal(ids.has("generic-secret"), false);
  assert.equal(ids.has("private-key-block"), false);
  assert.equal(ids.has("aws-key"), false);
  assert.equal(ids.has("console-call"), true);
  assert.equal(report.config.preset, "release");
});

test("security preset focuses on security and excludes release-readiness rules", () => {
  const report = scanRepository(badRepo, { maxFiles: 100, preset: "security" });
  const ids = new Set(report.findings.map((finding) => finding.id));

  assert.equal(ids.has("generic-secret"), true);
  assert.equal(ids.has("merge-marker"), true);
  assert.equal(ids.has("console-call"), false);
  assert.equal(ids.has("missing-build-script"), false);
  assert.equal(ids.has("readme-install"), false);
  assert.equal(report.config.preset, "security");
});

test("invalid preset is rejected", () => {
  assert.throws(() => scanRepository(badRepo, { preset: "unknown-preset" }), /Invalid preset/i);
});

test("cli can list built-in presets", () => {
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const result = spawnSync(process.execPath, [cliPath, "--list-presets"], {
    encoding: "utf8",
    cwd: path.join(__dirname, "..")
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Built-in presets:/);
  assert.match(result.stdout, /release/);
  assert.match(result.stdout, /security/);
});

test("cli can persist scan history to json file", () => {
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-doctor-history-"));
  const historyPath = path.join(dir, "history.json");

  const run1 = spawnSync(
    process.execPath,
    [cliPath, goodRepo, "--history-file", historyPath, "--history-limit", "2", "--format", "text", "--fail-on", "none"],
    { encoding: "utf8", cwd: path.join(__dirname, "..") }
  );
  const run2 = spawnSync(
    process.execPath,
    [
      cliPath,
      goodRepo,
      "--history-file",
      historyPath,
      "--history-limit",
      "2",
      "--preset",
      "release",
      "--format",
      "text",
      "--fail-on",
      "none"
    ],
    { encoding: "utf8", cwd: path.join(__dirname, "..") }
  );

  assert.equal(run1.status, 0);
  assert.equal(run2.status, 0);
  const payload = JSON.parse(fs.readFileSync(historyPath, "utf8"));
  assert.equal(Array.isArray(payload.entries), true);
  assert.equal(payload.entries.length, 2);
  assert.equal(typeof payload.entries[0].score, "number");
  assert.equal(payload.entries[1].preset, "release");
  assert.equal(typeof payload.entries[1].ruleCounts, "object");
});

test("cli cache-file option reuses cached file analysis", () => {
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-doctor-cli-cache-"));
  const cachePath = path.join(dir, ".cache", "scan-cache.json");
  writeCacheFixtureRepo(dir);

  const run1 = spawnSync(
    process.execPath,
    [cliPath, dir, "--cache-file", cachePath, "--format", "json", "--fail-on", "none"],
    { encoding: "utf8", cwd: path.join(__dirname, "..") }
  );
  const run2 = spawnSync(
    process.execPath,
    [cliPath, dir, "--cache-file", cachePath, "--format", "json", "--fail-on", "none"],
    { encoding: "utf8", cwd: path.join(__dirname, "..") }
  );

  assert.equal(run1.status, 0);
  assert.equal(run2.status, 0);
  const report2 = JSON.parse(run2.stdout);
  assert.ok(report2.analysis.cacheHits >= report2.fileCount);
  assert.equal(report2.analysis.cacheMisses, 0);
});

test("cli fleet-scan aggregates repositories and writes repo artifacts", () => {
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-doctor-fleet-scan-"));
  const repoA = path.join(dir, "repo-a");
  const repoB = path.join(dir, "repo-b");
  const historyDir = path.join(dir, "history");
  const scanOutDir = path.join(dir, "repo-reports");
  writeFleetFixtureRepo(repoA);
  writeFleetFixtureRepo(repoB, { withDebugIssue: true });

  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      "fleet-scan",
      repoA,
      repoB,
      "--history-dir",
      historyDir,
      "--scan-out-dir",
      scanOutDir,
      "--scan-format",
      "json",
      "--format",
      "json",
      "--fail-on",
      "none"
    ],
    { encoding: "utf8", cwd: path.join(__dirname, "..") }
  );

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.stats.repoCount, 2);
  assert.equal(parsed.execution.totalRepos, 2);
  assert.equal(fs.readdirSync(historyDir).length, 2);
  assert.equal(fs.readdirSync(scanOutDir).length, 2);
});

test("cli fleet-scan can load repository paths from repos-file", () => {
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-doctor-fleet-list-"));
  const repoA = path.join(dir, "repo-a");
  const repoB = path.join(dir, "repo-b");
  const historyDir = path.join(dir, "history");
  writeFleetFixtureRepo(repoA);
  writeFleetFixtureRepo(repoB);
  initGitRepo(repoA);
  initGitRepo(repoB);

  const listPath = path.join(dir, "repos.txt");
  fs.writeFileSync(listPath, `# repositories\n${repoA}\n${repoB}\n`, "utf8");

  const result = spawnSync(
    process.execPath,
    [cliPath, "fleet-scan", "--repos-file", listPath, "--history-dir", historyDir, "--format", "json", "--fail-on", "none"],
    { encoding: "utf8", cwd: path.join(__dirname, "..") }
  );

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.stats.repoCount, 2);
  assert.equal(parsed.execution.totalRepos, 2);
});

test("cli fleet-scan returns exit code 1 when any repo breaches fail-on threshold", () => {
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-doctor-fleet-fail-"));
  const repoA = path.join(dir, "repo-a");
  const repoB = path.join(dir, "repo-b");
  const historyDir = path.join(dir, "history");
  writeFleetFixtureRepo(repoA);
  writeFleetFixtureRepo(repoB, { withDebugIssue: true });

  const result = spawnSync(
    process.execPath,
    [cliPath, "fleet-scan", repoA, repoB, "--history-dir", historyDir, "--format", "json", "--fail-on", "p1"],
    { encoding: "utf8", cwd: path.join(__dirname, "..") }
  );

  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.execution.failedRepos >= 1, true);
});

test("cli fleet-scan can auto-discover repositories from a root folder", () => {
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-doctor-fleet-discover-"));
  const workspace = path.join(dir, "workspace");
  const repoA = path.join(workspace, "group-a", "repo-a");
  const repoB = path.join(workspace, "group-b", "repo-b");
  const historyDir = path.join(dir, "history");
  writeFleetFixtureRepo(repoA);
  writeFleetFixtureRepo(repoB);
  initGitRepo(repoA);
  initGitRepo(repoB);

  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      "fleet-scan",
      "--discover-root",
      workspace,
      "--discover-depth",
      "4",
      "--history-dir",
      historyDir,
      "--format",
      "json",
      "--fail-on",
      "none"
    ],
    { encoding: "utf8", cwd: path.join(__dirname, "..") }
  );

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.execution.totalRepos, 2);
  assert.equal(parsed.execution.scannedRepos, 2);
  assert.equal(typeof parsed.execution.discoverRoot, "string");
});

test("cli fleet-scan writes execution log with repo-level run metrics", () => {
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-doctor-fleet-exec-log-"));
  const repoA = path.join(dir, "repo-a");
  const historyDir = path.join(dir, "history");
  const cacheDir = path.join(dir, "cache");
  const executionLog = path.join(dir, "execution.json");
  writeFleetFixtureRepo(repoA);

  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      "fleet-scan",
      repoA,
      "--history-dir",
      historyDir,
      "--cache-dir",
      cacheDir,
      "--execution-log",
      executionLog,
      "--format",
      "json",
      "--fail-on",
      "none"
    ],
    { encoding: "utf8", cwd: path.join(__dirname, "..") }
  );

  assert.equal(result.status, 0);
  const parsedLog = JSON.parse(fs.readFileSync(executionLog, "utf8"));
  assert.equal(parsedLog.totalRepos, 1);
  assert.equal(Array.isArray(parsedLog.repoRuns), true);
  assert.equal(parsedLog.repoRuns.length, 1);
  assert.equal(typeof parsedLog.repoRuns[0].durationMs, "number");
  assert.equal(typeof parsedLog.repoRuns[0].cache.hits, "number");
});

test("cli fleet-scan can continue when one repository path is invalid", () => {
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-doctor-fleet-continue-"));
  const repoA = path.join(dir, "repo-a");
  const invalidRepo = path.join(dir, "missing-repo");
  const historyDir = path.join(dir, "history");
  writeFleetFixtureRepo(repoA);

  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      "fleet-scan",
      repoA,
      invalidRepo,
      "--history-dir",
      historyDir,
      "--continue-on-error",
      "--format",
      "json",
      "--fail-on",
      "none"
    ],
    { encoding: "utf8", cwd: path.join(__dirname, "..") }
  );

  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.execution.totalRepos, 2);
  assert.equal(parsed.execution.scannedRepos, 1);
  assert.equal(parsed.execution.errorRepos, 1);
});

test("fleet report aggregates multiple history sources", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-doctor-fleet-"));
  const repoAPath = path.join(dir, "repo-a.history.json");
  const repoBPath = path.join(dir, "repo-b.history.json");

  fs.writeFileSync(
    repoAPath,
    JSON.stringify(
      {
        entries: [
          { scannedAt: "2026-03-01T00:00:00.000Z", score: 90, summary: { p0: 0, p1: 1, p2: 1 }, ruleCounts: { "console-call": 1 } },
          { scannedAt: "2026-03-02T00:00:00.000Z", score: 86, summary: { p0: 1, p1: 1, p2: 0 }, ruleCounts: { "merge-marker": 1, "console-call": 1 } }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    repoBPath,
    JSON.stringify(
      {
        entries: [
          { scannedAt: "2026-03-01T00:00:00.000Z", score: 98, summary: { p0: 0, p1: 0, p2: 1 }, ruleCounts: { "todo-comment": 1 } }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const report = buildFleetReport([repoAPath, repoBPath], { topRepos: 10, topRules: 10 });
  assert.equal(report.stats.repoCount, 2);
  assert.equal(report.stats.totalScans, 3);
  assert.equal(report.topRules.length > 0, true);
  const json = formatFleetReport(report, "json");
  const parsed = JSON.parse(json);
  assert.equal(parsed.repos.length, 2);
});

test("cli fleet command outputs json report", () => {
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sleep-doctor-fleet-cli-"));
  const historyPath = path.join(dir, "history.json");
  fs.writeFileSync(
    historyPath,
    JSON.stringify(
      {
        entries: [{ scannedAt: "2026-03-01T00:00:00.000Z", score: 95, summary: { p0: 0, p1: 0, p2: 1 }, ruleCounts: { "todo-comment": 1 } }]
      },
      null,
      2
    ),
    "utf8"
  );

  const result = spawnSync(process.execPath, [cliPath, "fleet", historyPath, "--format", "json"], {
    encoding: "utf8",
    cwd: path.join(__dirname, "..")
  });

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.stats.repoCount, 1);
  assert.equal(Array.isArray(parsed.repos), true);
});

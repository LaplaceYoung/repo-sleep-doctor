#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const { compareWithBaseline, createOnlyNewReport, loadBaseline } = require("./baseline");
const { VALID_FLEET_FORMATS, buildFleetReport, formatFleetReport } = require("./fleet");
const { DEFAULT_HISTORY_LIMIT, appendHistory, toHistoryEntry, trimHistory } = require("./history");
const { PRESET_RULES } = require("./rule-catalog");
const { scanRepository } = require("./scanner");
const { formatReport, shouldFail } = require("./reporters");

const VALID_FORMATS = new Set(["text", "json", "markdown", "md", "sarif", "html", "junit"]);
const VALID_FAIL_ON = new Set(["none", "p0", "p1", "p2"]);

function printHelp() {
  const message = `
Repo Sleep Doctor - repository release risk scanner

Usage:
  node src/cli.js [path] [options]
  node src/cli.js scan [path] [options]
  node src/cli.js fleet <history-file...> [options]
  node src/cli.js fleet-scan <repo-path...> [options]

Scan options:
  --format <text|json|markdown|sarif|html|junit>  Output format (default: text)
  --out <file>                              Write report to file
  --config <file>                           Use custom config path
  --preset <all|release|security>          Use built-in rule preset
  --cache-file <file>                       Reuse file-level scan cache across runs
  --no-cache                                Disable cache reuse even if cache file is set
  --max-files <number>                      Limit scanned files
  --changed-since <git-ref>                 Scan only files changed since git ref
  --fail-on <none|p0|p1|p2>                 Exit 1 if findings hit threshold (default: p0)
  --baseline <file>                         Compare against a previous JSON report
  --only-new                                Show only findings not present in baseline
  --save-baseline <file>                    Save current JSON report for future baseline runs
  --history-file <file>                     Append scan summary to history JSON file
  --history-limit <number>                  Keep only latest N history entries (default: 120)
  --no-gitignore                            Ignore .gitignore and scan all matched files
  --list-presets                            Print built-in presets and their enabled rules
  --help                                    Show help

Fleet options:
  --format <text|json|markdown|html>        Fleet report format (default: text)
  --out <file>                              Write fleet report to file
  --top-repos <number>                      Limit repos shown in fleet report (default: 20)
  --top-rules <number>                      Limit top rules shown in fleet report (default: 10)

Fleet-scan options:
  --repos-file <file>                       Read repository paths from newline-delimited file
  --history-dir <dir>                       Directory for per-repo history files (default: reports/fleet-history)
  --history-limit <number>                  Keep only latest N history entries per repo (default: 120)
  --format <text|json|markdown|html>        Fleet report format (default: text)
  --out <file>                              Write fleet report to file
  --top-repos <number>                      Limit repos shown in fleet report (default: 20)
  --top-rules <number>                      Limit top rules shown in fleet report (default: 10)
  --scan-format <text|json|markdown|sarif|html|junit>  Optional per-repo report format
  --scan-out-dir <dir>                      Directory to write per-repo reports (defaults scan-format=html)
  --preset <all|release|security>           Apply preset to every repository scan
  --cache-dir <dir>                         Directory for per-repo cache files
  --max-files <number>                      Limit scanned files per repository
  --changed-since <git-ref>                 Scan only files changed since git ref for each repository
  --config <file>                           Use same config file path for each repository
  --no-gitignore                            Ignore .gitignore for every repository
  --fail-on <none|p0|p1|p2>                 Exit 1 if any repository hits threshold (default: p0)
`;
  process.stdout.write(message.trimStart());
}

function printPresets() {
  const lines = ["Built-in presets:"];
  for (const [name, rules] of Object.entries(PRESET_RULES)) {
    lines.push(`- ${name} (${rules.length} rules)`);
    lines.push(`  ${rules.join(", ")}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function requireOptionValue(args, index, optionName) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${optionName}`);
  }
  return value;
}

function parseScanArgs(argv) {
  const args = [...argv];
  if (args[0] === "scan") {
    args.shift();
  }

  const options = {
    targetPath: ".",
    format: "text",
    outFile: null,
    configPath: null,
    preset: undefined,
    cacheFile: null,
    useCache: true,
    maxFiles: undefined,
    changedSince: null,
    failOn: "p0",
    baselinePath: null,
    onlyNew: false,
    saveBaselinePath: null,
    historyFile: null,
    historyLimit: DEFAULT_HISTORY_LIMIT,
    useGitIgnore: undefined,
    listPresets: false,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--only-new") {
      options.onlyNew = true;
      continue;
    }

    if (token === "--no-gitignore") {
      options.useGitIgnore = false;
      continue;
    }
    if (token === "--no-cache") {
      options.useCache = false;
      continue;
    }
    if (token === "--list-presets") {
      options.listPresets = true;
      continue;
    }

    if (token.startsWith("--")) {
      if (token === "--format") {
        options.format = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--out") {
        options.outFile = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--config") {
        options.configPath = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--preset") {
        options.preset = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--cache-file") {
        options.cacheFile = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--max-files") {
        options.maxFiles = Number(requireOptionValue(args, index, token));
        index += 1;
        continue;
      }
      if (token === "--changed-since") {
        options.changedSince = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--fail-on") {
        options.failOn = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--baseline") {
        options.baselinePath = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--save-baseline") {
        options.saveBaselinePath = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--history-file") {
        options.historyFile = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--history-limit") {
        options.historyLimit = Number(requireOptionValue(args, index, token));
        index += 1;
        continue;
      }

      throw new Error(`Unknown option: ${token}`);
    }

    if (options.targetPath === ".") {
      options.targetPath = token;
    } else {
      throw new Error(`Unexpected argument: ${token}`);
    }
  }

  if (!VALID_FORMATS.has(options.format)) {
    throw new Error(`Invalid --format value: ${options.format}`);
  }
  if (!VALID_FAIL_ON.has(options.failOn)) {
    throw new Error(`Invalid --fail-on value: ${options.failOn}`);
  }
  if (options.maxFiles !== undefined && (!Number.isInteger(options.maxFiles) || options.maxFiles <= 0)) {
    throw new Error(`Invalid --max-files value: ${options.maxFiles}`);
  }
  if (!Number.isInteger(options.historyLimit) || options.historyLimit <= 0) {
    throw new Error(`Invalid --history-limit value: ${options.historyLimit}`);
  }
  if (options.onlyNew && !options.baselinePath) {
    throw new Error("--only-new requires --baseline <file>");
  }

  return options;
}

function parseFleetArgs(argv) {
  const args = [...argv];
  if (args[0] === "fleet") {
    args.shift();
  }

  const options = {
    format: "text",
    outFile: null,
    topRepos: 20,
    topRules: 10,
    help: false,
    historyPaths: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token.startsWith("--")) {
      if (token === "--format") {
        options.format = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--out") {
        options.outFile = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--top-repos") {
        options.topRepos = Number(requireOptionValue(args, index, token));
        index += 1;
        continue;
      }
      if (token === "--top-rules") {
        options.topRules = Number(requireOptionValue(args, index, token));
        index += 1;
        continue;
      }
      throw new Error(`Unknown option: ${token}`);
    }

    options.historyPaths.push(token);
  }

  if (!VALID_FLEET_FORMATS.has(options.format)) {
    throw new Error(`Invalid --format value for fleet: ${options.format}`);
  }
  if (!Number.isInteger(options.topRepos) || options.topRepos <= 0) {
    throw new Error(`Invalid --top-repos value: ${options.topRepos}`);
  }
  if (!Number.isInteger(options.topRules) || options.topRules <= 0) {
    throw new Error(`Invalid --top-rules value: ${options.topRules}`);
  }
  if (!options.help && options.historyPaths.length === 0) {
    throw new Error("fleet requires at least one history file path");
  }

  return options;
}

function parsePathListFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Repository list file not found: ${resolved}`);
  }
  const content = fs.readFileSync(resolved, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function sanitizeRepoId(repoPath, existing) {
  const base = path.basename(path.resolve(repoPath)) || "repo";
  const normalized = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "repo";
  let candidate = normalized;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${normalized}-${suffix}`;
    suffix += 1;
  }
  existing.add(candidate);
  return candidate;
}

function extensionForFormat(format) {
  const normalized = String(format || "text").toLowerCase();
  if (normalized === "markdown" || normalized === "md") {
    return "md";
  }
  if (normalized === "json" || normalized === "sarif" || normalized === "html") {
    return normalized;
  }
  if (normalized === "junit") {
    return "xml";
  }
  return "txt";
}

function parseFleetScanArgs(argv) {
  const args = [...argv];
  if (args[0] === "fleet-scan") {
    args.shift();
  }

  const options = {
    repoPaths: [],
    reposFile: null,
    historyDir: path.join("reports", "fleet-history"),
    historyLimit: DEFAULT_HISTORY_LIMIT,
    format: "text",
    outFile: null,
    topRepos: 20,
    topRules: 10,
    scanFormat: null,
    scanOutDir: null,
    preset: undefined,
    cacheDir: null,
    maxFiles: undefined,
    changedSince: null,
    configPath: null,
    useGitIgnore: undefined,
    failOn: "p0",
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--no-gitignore") {
      options.useGitIgnore = false;
      continue;
    }

    if (token.startsWith("--")) {
      if (token === "--repos-file") {
        options.reposFile = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--history-dir") {
        options.historyDir = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--history-limit") {
        options.historyLimit = Number(requireOptionValue(args, index, token));
        index += 1;
        continue;
      }
      if (token === "--format") {
        options.format = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--out") {
        options.outFile = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--top-repos") {
        options.topRepos = Number(requireOptionValue(args, index, token));
        index += 1;
        continue;
      }
      if (token === "--top-rules") {
        options.topRules = Number(requireOptionValue(args, index, token));
        index += 1;
        continue;
      }
      if (token === "--scan-format") {
        options.scanFormat = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--scan-out-dir") {
        options.scanOutDir = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--preset") {
        options.preset = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--cache-dir") {
        options.cacheDir = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--max-files") {
        options.maxFiles = Number(requireOptionValue(args, index, token));
        index += 1;
        continue;
      }
      if (token === "--changed-since") {
        options.changedSince = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--config") {
        options.configPath = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      if (token === "--fail-on") {
        options.failOn = requireOptionValue(args, index, token);
        index += 1;
        continue;
      }
      throw new Error(`Unknown option: ${token}`);
    }

    options.repoPaths.push(token);
  }

  const filePaths = options.reposFile ? parsePathListFile(options.reposFile) : [];
  options.repoPaths = [...options.repoPaths, ...filePaths];

  if (options.scanOutDir && !options.scanFormat) {
    options.scanFormat = "html";
  }

  if (!VALID_FLEET_FORMATS.has(options.format)) {
    throw new Error(`Invalid --format value for fleet-scan: ${options.format}`);
  }
  if (options.scanFormat && !VALID_FORMATS.has(options.scanFormat)) {
    throw new Error(`Invalid --scan-format value: ${options.scanFormat}`);
  }
  if (!VALID_FAIL_ON.has(options.failOn)) {
    throw new Error(`Invalid --fail-on value: ${options.failOn}`);
  }
  if (!Number.isInteger(options.historyLimit) || options.historyLimit <= 0) {
    throw new Error(`Invalid --history-limit value: ${options.historyLimit}`);
  }
  if (!Number.isInteger(options.topRepos) || options.topRepos <= 0) {
    throw new Error(`Invalid --top-repos value: ${options.topRepos}`);
  }
  if (!Number.isInteger(options.topRules) || options.topRules <= 0) {
    throw new Error(`Invalid --top-rules value: ${options.topRules}`);
  }
  if (options.maxFiles !== undefined && (!Number.isInteger(options.maxFiles) || options.maxFiles <= 0)) {
    throw new Error(`Invalid --max-files value: ${options.maxFiles}`);
  }
  if (!options.help && options.repoPaths.length === 0) {
    throw new Error("fleet-scan requires at least one repository path (or --repos-file)");
  }

  return options;
}

function writeTextFile(filePath, content) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, "utf8");
}

function toBaselineSnapshot(report) {
  const snapshot = { ...report };
  delete snapshot.baseline;
  delete snapshot.currentSummary;
  delete snapshot.currentScore;
  return snapshot;
}

function main() {
  try {
    const argv = process.argv.slice(2);
    const command = argv[0];

    if (command === "fleet-scan") {
      const options = parseFleetScanArgs(argv);
      if (options.help) {
        printHelp();
        return;
      }

      const existingIds = new Set();
      const historyPaths = [];
      const repoRuns = [];
      let hasFailure = false;

      for (const inputPath of options.repoPaths) {
        const resolvedRepoPath = path.resolve(inputPath);
        if (!fs.existsSync(resolvedRepoPath) || !fs.statSync(resolvedRepoPath).isDirectory()) {
          throw new Error(`Invalid repository directory: ${resolvedRepoPath}`);
        }

        const repoId = sanitizeRepoId(resolvedRepoPath, existingIds);
        const historyPath = path.resolve(options.historyDir, `${repoId}.history.json`);
        const cacheFile = options.cacheDir ? path.resolve(options.cacheDir, `${repoId}.scan-cache.json`) : null;
        const scanReport = scanRepository(resolvedRepoPath, {
          configPath: options.configPath,
          preset: options.preset,
          maxFiles: options.maxFiles,
          changedSince: options.changedSince,
          cacheFile,
          useGitIgnore: options.useGitIgnore
        });

        const history = appendHistory(historyPath, toHistoryEntry(scanReport), options.historyLimit);
        scanReport.history = history;
        historyPaths.push(historyPath);

        if (options.scanOutDir && options.scanFormat) {
          const extension = extensionForFormat(options.scanFormat);
          const outputPath = path.resolve(options.scanOutDir, `${repoId}.scan.${extension}`);
          const output = formatReport(scanReport, options.scanFormat);
          writeTextFile(outputPath, output);
        }

        const failed = shouldFail(scanReport, options.failOn);
        if (failed) {
          hasFailure = true;
        }

        repoRuns.push({
          repoId,
          path: resolvedRepoPath,
          score: scanReport.score,
          summary: scanReport.summary,
          failed
        });
      }

      const fleetReport = buildFleetReport(historyPaths, {
        topRepos: options.topRepos,
        topRules: options.topRules
      });
      fleetReport.execution = {
        failOn: options.failOn,
        totalRepos: repoRuns.length,
        failedRepos: repoRuns.filter((repo) => repo.failed).length,
        repoRuns
      };

      const fleetOutput = formatFleetReport(fleetReport, options.format);
      process.stdout.write(fleetOutput);
      process.stdout.write("\n");
      if (options.outFile) {
        writeTextFile(options.outFile, fleetOutput);
      }
      if (hasFailure) {
        process.exitCode = 1;
      }
      return;
    }

    if (command === "fleet") {
      const fleetOptions = parseFleetArgs(argv);
      if (fleetOptions.help) {
        printHelp();
        return;
      }
      const fleetReport = buildFleetReport(fleetOptions.historyPaths, {
        topRepos: fleetOptions.topRepos,
        topRules: fleetOptions.topRules
      });
      const fleetOutput = formatFleetReport(fleetReport, fleetOptions.format);
      process.stdout.write(fleetOutput);
      process.stdout.write("\n");
      if (fleetOptions.outFile) {
        writeTextFile(fleetOptions.outFile, fleetOutput);
      }
      return;
    }

    const options = parseScanArgs(argv);
    if (options.help) {
      printHelp();
      return;
    }
    if (options.listPresets) {
      printPresets();
      return;
    }

    const currentReport = scanRepository(options.targetPath, {
      configPath: options.configPath,
      preset: options.preset,
      maxFiles: options.maxFiles,
      changedSince: options.changedSince,
      cacheFile: options.useCache ? options.cacheFile : null,
      useGitIgnore: options.useGitIgnore
    });

    let outputReport = currentReport;
    if (options.baselinePath) {
      const baseline = loadBaseline(options.baselinePath);
      const comparison = compareWithBaseline(currentReport, baseline);
      currentReport.baseline = comparison;
      outputReport = options.onlyNew ? createOnlyNewReport(currentReport, comparison) : currentReport;
    }

    const currentHistoryEntry = toHistoryEntry(currentReport);
    if (options.historyFile) {
      outputReport.history = appendHistory(options.historyFile, currentHistoryEntry, options.historyLimit);
    } else {
      outputReport.history = trimHistory([currentHistoryEntry], options.historyLimit);
    }

    const output = formatReport(outputReport, options.format);
    process.stdout.write(output);
    process.stdout.write("\n");

    if (options.outFile) {
      writeTextFile(options.outFile, output);
    }
    if (options.saveBaselinePath) {
      writeTextFile(options.saveBaselinePath, JSON.stringify(toBaselineSnapshot(currentReport), null, 2));
    }

    if (shouldFail(outputReport, options.failOn)) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 2;
  }
}

main();

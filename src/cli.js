#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const { compareWithBaseline, createOnlyNewReport, loadBaseline } = require("./baseline");
const { scanRepository } = require("./scanner");
const { formatReport, shouldFail } = require("./reporters");

const VALID_FORMATS = new Set(["text", "json", "markdown", "md", "sarif", "html"]);
const VALID_FAIL_ON = new Set(["none", "p0", "p1", "p2"]);

function printHelp() {
  const message = `
Repo Sleep Doctor - repository release risk scanner

Usage:
  node src/cli.js [path] [options]
  node src/cli.js scan [path] [options]

Options:
  --format <text|json|markdown|sarif|html>  Output format (default: text)
  --out <file>                              Write report to file
  --config <file>                           Use custom config path
  --max-files <number>                      Limit scanned files
  --fail-on <none|p0|p1|p2>                 Exit 1 if findings hit threshold (default: p0)
  --baseline <file>                         Compare against a previous JSON report
  --only-new                                Show only findings not present in baseline
  --save-baseline <file>                    Save current JSON report for future baseline runs
  --no-gitignore                            Ignore .gitignore and scan all matched files
  --help                                    Show help
`;
  process.stdout.write(message.trimStart());
}

function requireOptionValue(args, index, optionName) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${optionName}`);
  }
  return value;
}

function parseArgs(argv) {
  const args = [...argv];
  if (args[0] === "scan") {
    args.shift();
  }

  const options = {
    targetPath: ".",
    format: "text",
    outFile: null,
    configPath: null,
    maxFiles: undefined,
    failOn: "p0",
    baselinePath: null,
    onlyNew: false,
    saveBaselinePath: null,
    useGitIgnore: undefined,
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
      if (token === "--max-files") {
        options.maxFiles = Number(requireOptionValue(args, index, token));
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
  if (options.onlyNew && !options.baselinePath) {
    throw new Error("--only-new requires --baseline <file>");
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
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }

    const currentReport = scanRepository(options.targetPath, {
      configPath: options.configPath,
      maxFiles: options.maxFiles,
      useGitIgnore: options.useGitIgnore
    });

    let outputReport = currentReport;
    if (options.baselinePath) {
      const baseline = loadBaseline(options.baselinePath);
      const comparison = compareWithBaseline(currentReport, baseline);
      currentReport.baseline = comparison;
      outputReport = options.onlyNew ? createOnlyNewReport(currentReport, comparison) : currentReport;
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

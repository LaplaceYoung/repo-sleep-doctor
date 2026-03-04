# Repo Sleep Doctor

Language: English | [简体中文](README.zh-CN.md)

`repo-sleep-doctor` is a zero-dependency Node CLI that scans repositories and outputs release risk reports with severity levels (`P0/P1/P2`).

Inspiration sources:
- GitHub [`ianlewis/todos`](https://github.com/ianlewis/todos) (actionable TODO extraction)
- GitHub [`DavidAnson/markdownlint`](https://github.com/DavidAnson/markdownlint) (rule-driven quality checks)
- Common repo health check patterns used in CI pipelines

## What it does

The scanner detects practical release blockers:
- unresolved merge markers
- potential hardcoded secrets
- debug statements in code
- TODO/FIXME/HACK comments in code
- missing README install/usage sections
- missing `build/test/lint` scripts in `package.json`
- missing test files
- oversized files
- interactive HTML dashboard with severity/rule/file hotspot views
- fast-path heuristics that skip expensive line scans for low-signal files

## Installation

```bash
npm install
```

No external runtime dependencies are required.

## Quick Start

```bash
# text report
npm run scan

# markdown report
node src/cli.js . --format markdown --out reports/scan.md --fail-on none

# SARIF report for code scanning platforms
npm run scan:sarif

# HTML visual report
npm run scan:html

# JUnit XML report for CI test dashboards
npm run scan:junit

# only scan files changed since main
node src/cli.js . --changed-since main --fail-on p1

# run with built-in preset (release-focused rules)
node src/cli.js . --preset release --fail-on p1

# persist trend history for dashboard reports
node src/cli.js . --history-file reports/history.json --history-limit 120 --format html --out reports/scan.html --fail-on none
```

## CLI Usage

```bash
node src/cli.js [path] [options]
node src/cli.js scan [path] [options]
```

Options:
- `--format <text|json|markdown|sarif|html|junit>` output format, default `text`
- `--out <file>` write formatted output to file
- `--config <file>` use a custom config file path
- `--preset <all|release|security>` use built-in rule presets
- `--max-files <number>` cap total scanned files
- `--changed-since <git-ref>` only scan files changed since the given git ref
- `--fail-on <none|p0|p1|p2>` set process exit threshold, default `p0`
- `--baseline <file>` compare current scan against previous JSON report
- `--only-new` show only findings introduced after baseline
- `--save-baseline <file>` save current JSON report for future comparison
- `--history-file <file>` append summary snapshot to history JSON
- `--history-limit <number>` keep only latest N history entries (default 120)
- `--no-gitignore` disable `.gitignore` matching
- `--list-presets` print available built-in presets and enabled rules

## Baseline Workflow

```bash
# create baseline snapshot
node src/cli.js . --format json --save-baseline reports/baseline.json --fail-on none

# compare against baseline and show only new issues
node src/cli.js . --baseline reports/baseline.json --only-new --format text --fail-on p1
```

## Config

Create `.repo-sleep-doctor.json` in repository root:

```json
{
  "ignoreDirs": [".git", "node_modules", "dist"],
  "ignorePatterns": ["**/*.min.js", "**/*.map"],
  "useGitIgnore": true,
  "preset": "release",
  "additionalIgnoreFiles": [".repo-sleep-doctorignore"],
  "textExtensions": [".js", ".ts", ".tsx", ".md"],
  "maxFileSizeMb": 1,
  "maxTextFileSizeKb": 256,
  "maxFiles": 6000,
  "maxFindingsPerRule": 80,
  "disabledRules": ["todo-comment"],
  "severityOverrides": {
    "console-call": "p2"
  }
}
```

Preset notes:
- `all`: enable all built-in rules (default behavior)
- `release`: focus on release-readiness and quality rules, disable secret-only checks
- `security`: focus on security/secret exposure checks, disable release-readiness rules

Rule IDs currently exposed include (details in [`docs/rules.md`](docs/rules.md)):
- `merge-marker`
- `private-key-block`
- `aws-key`
- `generic-secret`
- `console-call`
- `debugger`
- `print-call`
- `todo-comment`
- `large-file`
- `missing-readme`
- `readme-install`
- `readme-usage`
- `missing-build-script`
- `missing-test-script`
- `missing-lint-script`
- `invalid-package-json`
- `missing-tests`

Integration guide:
- GitHub Actions setup: [`docs/guides/github-action.md`](docs/guides/github-action.md)

## Scoring

Score starts at `100` and deductions apply:
- each `P0`: `-25`
- each `P1`: `-8`
- each `P2`: `-2`

Score is clamped at `0`.

## Development

```bash
npm run lint
npm test
npm run example
```

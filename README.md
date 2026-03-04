# Repo Sleep Doctor

[![Node.js >=18](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./package.json)
[![Version](https://img.shields.io/badge/version-0.3.0-0d6b94)](./package.json)

Language: English | [简体中文](README.zh-CN.md)

A zero-dependency Node.js CLI for **release-risk scanning** across single repositories and multi-repo fleets.

Repo Sleep Doctor helps engineering teams detect blockers before release, standardize CI gates, and track fleet-level execution quality over time.

## Why This Project

Most scanners stop at "finding issues". Repo Sleep Doctor is designed for **execution**:

- consistent risk severity (`P0/P1/P2`)
- machine-friendly outputs (JSON/SARIF/JUnit)
- human-friendly dashboards (HTML/Markdown)
- fleet workflows (discover -> export -> batch scan -> trend)
- observability metrics (timing, hotspots, throughput, stability)

## Key Features

### Scan capabilities

- unresolved merge markers
- hardcoded secret patterns
- debug statements (`console.*`, `debugger`, `print(...)`)
- `TODO/FIXME/HACK/XXX` comments
- missing README install/usage sections
- missing `build/test/lint` scripts in `package.json`
- missing tests
- oversized files

### Report formats

- `text`
- `json`
- `markdown`
- `html`
- `sarif`
- `junit`

### Fleet workflows

- aggregate multiple history files
- batch-scan multiple repos in one run
- discover repos from a workspace root
- export discovered repos for downstream CI stages
- continue-on-error for resilient execution

### Observability (v0.3)

- scan stage timing: `analysis.timing`
- slow file hotspots: `analysis.hotspots.slowFiles`
- scan throughput: `analysis.summary`
- fleet execution grouping:
  - `executionSummary.timing`
  - `executionSummary.hotspots`
  - `executionSummary.stability`

## Installation

```bash
npm install
```

No runtime dependencies are required.

## Quick Start

```bash
# 1) Basic scan (text)
npm run scan

# 2) HTML report
npm run scan:html

# 3) SARIF for code scanning platforms
npm run scan:sarif

# 4) JUnit for CI dashboards
npm run scan:junit
```

## Common Workflows

### Single-repo gate

```bash
node src/cli.js . --preset release --fail-on p1 --format html --out reports/scan.html
```

### Baseline and only-new findings

```bash
# create baseline
node src/cli.js . --format json --save-baseline reports/baseline.json --fail-on none

# show only newly introduced findings
node src/cli.js . --baseline reports/baseline.json --only-new --format text --fail-on p1
```

### Fleet scan with discovery

```bash
# discover repos and export list
node src/cli.js fleet-scan --discover-root ../workspace --discover-depth 4 --export-repos reports/repos.txt --export-only

# scan all exported repos
node src/cli.js fleet-scan --repos-file reports/repos.txt --history-dir reports/fleet-history --format html --out reports/fleet.html --continue-on-error --fail-on p1
```

## CLI Overview

```bash
node src/cli.js [path] [options]
node src/cli.js scan [path] [options]
node src/cli.js fleet <history-file...> [options]
node src/cli.js fleet-scan <repo-path...> [options]
```

For full flags and examples, see:

- [docs/guides/github-action.md](docs/guides/github-action.md)
- [docs/guides/report-schema-migration.md](docs/guides/report-schema-migration.md)
- [docs/releases/v0.3.0.md](docs/releases/v0.3.0.md)

## Configuration

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

## Scoring Model

Score starts at `100` and deductions apply:

- each `P0`: `-25`
- each `P1`: `-8`
- each `P2`: `-2`

Final score is clamped at `0`.

## Marketing Site

The bilingual promo site is under `site/`:

- Chinese: `site/index.html`, `site/competitive.html`, `site/blueprint.html`
- English: `site/en/index.html`, `site/en/competitive.html`, `site/en/blueprint.html`

Local preview:

```bash
npx serve site
```

## Development

```bash
npm run lint
npm test
npm run build
```

## License

MIT

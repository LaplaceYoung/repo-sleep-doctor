# GitHub Actions Integration

Use Repo Sleep Doctor in pull requests and pushes with dual tracks:
- `security` preset for SARIF (code scanning)
- `release` preset for JUnit (CI dashboards)

## Example workflow

```yaml
name: Repo Sleep Doctor

on:
  pull_request:
  push:
    branches: [main]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install --no-audit --no-fund
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - run: node src/cli.js . --preset security --format sarif --out reports/scan-security.sarif --fail-on p0
      - run: node src/cli.js . --preset release --format junit --out reports/scan-release.junit.xml --fail-on p0
      - run: node src/cli.js . --preset release --history-file reports/history.json --history-limit 200 --format text --fail-on none
```

## PR-diff scan mode

For pull requests, scan only changed files:

```bash
node src/cli.js . --changed-since "${{ github.event.pull_request.base.sha }}" --fail-on p1
```

## Preset mode

- Release quality gate:

```bash
node src/cli.js . --preset release --fail-on p1
```

- Security-focused gate:

```bash
node src/cli.js . --preset security --fail-on p0
```

## Multi-repository fleet scan

When you want one workflow run to scan multiple repositories and publish a fleet dashboard:

```bash
node src/cli.js fleet-scan repo-a repo-b repo-c \
  --history-dir reports/fleet-history \
  --scan-out-dir reports/fleet-reports \
  --scan-format html \
  --format html \
  --out reports/fleet.html \
  --preset release \
  --cache-dir reports/fleet-cache \
  --fail-on p1
```

Path list mode (for generated repo inventories):

```bash
node src/cli.js fleet-scan --repos-file reports/repos.txt --history-dir reports/fleet-history --format markdown --out reports/fleet.md --fail-on none
```

Auto-discovery mode (scan all Git repos under a workspace root):

```bash
node src/cli.js fleet-scan \
  --discover-root ../workspace \
  --discover-depth 4 \
  --history-dir reports/fleet-history \
  --format json \
  --execution-log reports/fleet.execution.json \
  --continue-on-error \
  --fail-on p1
```

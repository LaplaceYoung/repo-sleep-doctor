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

# Report Schema Migration (v0.2 -> v0.3)

This guide documents report schema updates introduced in `v0.3.0`.

## Compatibility Policy

- CLI commands and flags stay compatible.
- Existing report fields are preserved where practical.
- New grouped fields are introduced for observability:
  - `analysis.timing`
  - `analysis.hotspots`
  - `analysis.summary`
  - `executionSummary.timing`
  - `executionSummary.hotspots`
  - `executionSummary.stability`

## Scan Report Additions

`scan --format json` now includes:

```json
{
  "analysis": {
    "timing": {
      "walkMs": 0,
      "filterMs": 0,
      "readMs": 0,
      "ruleEvalMs": 0,
      "aggregateMs": 0,
      "cacheLoadMs": 0,
      "cacheSaveMs": 0,
      "totalMs": 0
    },
    "hotspots": {
      "slowFiles": [
        {
          "file": "src/index.js",
          "readMs": 0,
          "ruleEvalMs": 0,
          "totalMs": 0,
          "sizeBytes": 0
        }
      ]
    },
    "summary": {
      "filesPerSecond": 0,
      "linesPerSecond": 0
    }
  }
}
```

## Fleet JSON Additions

`fleet` and `fleet-scan` JSON outputs now include `executionSummary` when execution data exists:

```json
{
  "executionSummary": {
    "timing": {
      "totalMs": 0,
      "avgRepoMs": 0,
      "p95RepoMs": 0
    },
    "hotspots": {
      "slowRepos": [],
      "cacheRank": []
    },
    "stability": {
      "successRate": 0,
      "failRate": 0,
      "errorRate": 0
    }
  }
}
```

## Migration Tips

1. Prefer new grouped fields in dashboards and scripts.
2. Keep fallback readers for legacy fields during `v0.3.x`.
3. If you parse fleet JSON, read `executionSummary` first, then fallback to raw `execution`.

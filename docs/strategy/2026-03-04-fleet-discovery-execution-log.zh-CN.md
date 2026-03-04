# 2026-03-04 Fleet 扫描编排升级（二）

## 本轮目标

在已上线 `fleet-scan` 基础上，继续向“组织级可执行治理”推进：
- 自动发现仓库
- 执行可观测（日志化）
- 失败容错（不中断全局扫描）

## 已落地能力

### 1) 自动发现 Git 仓库

`fleet-scan` 新增：
- `--discover-root <dir>`
- `--discover-depth <number>`
- `--discover-max <number>`
- `--discover-hidden`

可在一个工作区下自动识别 `.git` 仓库并加入扫描队列，支持与显式路径/`--repos-file` 混用并自动去重。

### 2) 执行日志增强

`fleet-scan` 新增：
- `--execution-log <file>`

输出 JSON 执行明细：
- 全局：`startedAt/finishedAt/durationMs/totalRepos/scannedRepos/failedRepos/errorRepos`
- 单仓：`status/score/summary/findingCount/fileCount/durationMs/historyPath/scanOutputPath/cache(hits/misses/hitRate/status)`

### 3) 容错扫描

`fleet-scan` 新增：
- `--continue-on-error`

当某仓路径无效或扫描异常时，记录 `status=error` 并继续扫描其他仓；最终以退出码反映整体风险状态。

## 命令示例

```bash
# 自动发现 + 容错 + 执行日志
node src/cli.js fleet-scan \
  --discover-root ../workspace \
  --discover-depth 4 \
  --history-dir reports/fleet-history \
  --format json \
  --execution-log reports/fleet.execution.json \
  --continue-on-error \
  --fail-on p1
```

## 测试覆盖

新增自动化用例：
- 自动发现仓库成功（`discover-root`）
- 执行日志文件生成并包含单仓运行指标
- 容错模式下遇到无效仓库仍继续执行

全量状态：`lint/test/build` 通过。

## 下一步建议

1. 在 fleet HTML 中增加执行态面板（成功率、错误仓、最慢仓、缓存命中排行）。
2. 支持发现结果导出（`repos.txt`）以便跨流程复用。
3. 增加按标签分组汇总（业务线/团队维度）提升管理视角。

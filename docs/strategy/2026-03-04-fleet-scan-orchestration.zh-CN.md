# 2026-03-04 多仓编排升级（fleet-scan）

## 升级目标

将 Repo Sleep Doctor 从“单仓扫描工具”升级到“组织级扫描编排入口”，降低多仓治理接入成本。

## 本轮新增能力

- 新命令：`fleet-scan`
  - 输入多仓路径（参数或 `--repos-file`）。
  - 对每个仓库执行统一扫描策略（preset/fail-on/max-files 等）。
  - 自动写入每仓历史文件（`--history-dir`）。
  - 统一生成 Fleet 汇总报告（`--format/--out`）。
- 编排增强参数：
  - `--scan-out-dir` + `--scan-format`：落盘每仓报告（如 HTML）。
  - `--cache-dir`：每仓缓存文件目录，重复运行提速。
  - `--fail-on`：任一仓触发阈值时整体退出码为 1，便于 CI 门禁。
- 宣传页升级：
  - 修复 `site/index.html` 编码问题（去除乱码）。
  - 更新文案，突出 Fleet + Cache + 上线门禁能力。

## 典型用法

```bash
# 路径列表方式
node src/cli.js fleet-scan ../repo-a ../repo-b \
  --history-dir reports/fleet-history \
  --scan-out-dir reports/fleet-reports \
  --scan-format html \
  --format html \
  --out reports/fleet.html \
  --preset release \
  --cache-dir reports/fleet-cache \
  --fail-on p1

# 文件清单方式
node src/cli.js fleet-scan \
  --repos-file reports/repos.txt \
  --history-dir reports/fleet-history \
  --format markdown \
  --out reports/fleet.md \
  --fail-on none
```

## 质量验证

- 新增测试覆盖：
  - `fleet-scan` 聚合与产物落盘。
  - `--repos-file` 路径清单输入。
  - 失败阈值退出码行为。
- 全量结果：`lint/test/build` 均通过。

## 下一步建议

1. 增加 `fleet-scan` 机器可读执行日志（repo 耗时、缓存命中、失败原因）。
2. 增加仓库发现模式（从根目录自动发现 Git 仓库）。
3. 将 `reports/fleet.html` 接入 GitHub Pages 自动发布，形成公开示例看板。

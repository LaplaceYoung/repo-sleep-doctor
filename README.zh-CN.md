# Repo Sleep Doctor

Language: [English](README.md) | 简体中文

`repo-sleep-doctor` 是一个零依赖 Node CLI，用于扫描仓库并输出 `P0/P1/P2` 分级的发布风险报告。

灵感来源：
- GitHub [`ianlewis/todos`](https://github.com/ianlewis/todos)（可执行 TODO 提取）
- GitHub [`DavidAnson/markdownlint`](https://github.com/DavidAnson/markdownlint)（规则驱动质量检查）
- CI 场景常见的仓库健康检查模式

## 能力概览

扫描器可识别常见发布阻断项：
- 未解决的 merge 冲突标记
- 可能的硬编码密钥
- 代码中的调试语句
- 代码中的 TODO/FIXME/HACK 注释
- README 缺少安装/使用章节
- `package.json` 缺少 `build/test/lint` 脚本
- 缺少测试文件
- 超大文件
- HTML 可视化仪表盘（严重级别、规则分布、热点文件、分数趋势）
- Fleet 聚合仪表盘（跨仓库历史汇总）
- 可选文件级缓存（重复扫描提速）

## 安装

```bash
npm install
```

无需额外运行时依赖。

## 快速开始

```bash
# 文本报告
npm run scan

# Markdown 报告
node src/cli.js . --format markdown --out reports/scan.md --fail-on none

# SARIF 报告（代码扫描平台）
npm run scan:sarif

# HTML 可视化报告
npm run scan:html

# JUnit XML 报告（CI 测试看板）
npm run scan:junit

# 仅扫描相对 main 的变更文件
node src/cli.js . --changed-since main --fail-on p1

# 使用内置规则预设（发布导向）
node src/cli.js . --preset release --fail-on p1

# 持久化趋势历史并输出 HTML 仪表盘
node src/cli.js . --history-file reports/history.json --history-limit 120 --format html --out reports/scan.html --fail-on none

# 开启文件级缓存，提升重复扫描速度
node src/cli.js . --cache-file reports/scan.cache.json --format text --fail-on none

# 聚合多个仓库历史，输出 fleet 看板
node src/cli.js fleet reports/repo-a.history.json reports/repo-b.history.json --format html --out reports/fleet.html

# 一次执行多仓扫描，自动写历史并生成 fleet 报告
node src/cli.js fleet-scan ../repo-a ../repo-b --history-dir reports/fleet-history --scan-out-dir reports/fleet-repos --scan-format html --format html --out reports/fleet.html --preset release --cache-dir reports/fleet-cache --fail-on p1

# 从工作区根目录自动发现 Git 仓库，并输出执行日志
node src/cli.js fleet-scan --discover-root ../workspace --discover-depth 4 --history-dir reports/fleet-history --format json --execution-log reports/fleet.execution.json --continue-on-error --fail-on p1
```

## CLI 用法

```bash
node src/cli.js [path] [options]
node src/cli.js scan [path] [options]
node src/cli.js fleet <history-file...> [options]
node src/cli.js fleet-scan <repo-path...> [options]
```

扫描参数：
- `--format <text|json|markdown|sarif|html|junit>` 输出格式，默认 `text`
- `--out <file>` 写入输出文件
- `--config <file>` 指定自定义配置文件路径
- `--preset <all|release|security>` 使用内置规则预设
- `--cache-file <file>` 启用文件级缓存加速扫描
- `--no-cache` 即使提供缓存文件也禁用缓存复用
- `--max-files <number>` 限制扫描文件总数
- `--changed-since <git-ref>` 仅扫描相对指定 git 引用的变更文件
- `--fail-on <none|p0|p1|p2>` 设置退出阈值，默认 `p0`
- `--baseline <file>` 与历史基线 JSON 报告对比
- `--only-new` 仅输出相对基线新增的问题
- `--save-baseline <file>` 保存当前扫描作为基线
- `--history-file <file>` 追加扫描摘要到历史 JSON
- `--history-limit <number>` 仅保留最近 N 条历史（默认 120）
- `--no-gitignore` 禁用 `.gitignore` 匹配
- `--list-presets` 输出所有内置预设及启用规则

Fleet 参数：
- `--format <text|json|markdown|html>` 输出格式，默认 `text`
- `--out <file>` 写入 fleet 报告文件
- `--top-repos <number>` 输出中展示的仓库数量上限（默认 20）
- `--top-rules <number>` 输出中展示的规则数量上限（默认 10）

Fleet-scan 参数：
- `--repos-file <file>` 从文本文件加载仓库路径（按行分隔）
- `--discover-root <dir>` 在目录下自动发现 Git 仓库
- `--discover-depth <number>` 自动发现最大目录深度（默认 3）
- `--discover-max <number>` 每个根目录最多发现仓库数量（默认 300）
- `--discover-hidden` 自动发现时包含隐藏目录
- `--history-dir <dir>` 每个仓库历史文件输出目录（默认 `reports/fleet-history`）
- `--history-limit <number>` 每个仓库仅保留最近 N 条历史（默认 120）
- `--format <text|json|markdown|html>` fleet 输出格式，默认 `text`
- `--out <file>` 写入 fleet 报告文件
- `--top-repos <number>` fleet 报告中展示仓库数量上限（默认 20）
- `--top-rules <number>` fleet 报告中展示规则数量上限（默认 10）
- `--scan-format <text|json|markdown|sarif|html|junit>` 每个仓库报告格式
- `--scan-out-dir <dir>` 输出每个仓库报告目录（默认 `scan-format=html`）
- `--preset <all|release|security>` 统一应用到全部仓库的规则预设
- `--cache-dir <dir>` 每个仓库缓存文件目录（重复扫描提速）
- `--max-files <number>` 每个仓库扫描文件上限
- `--changed-since <git-ref>` 每个仓库只扫描相对 git 引用的变更
- `--config <file>` 所有仓库统一使用同一配置文件路径
- `--no-gitignore` 所有仓库都禁用 `.gitignore` 匹配
- `--continue-on-error` 单仓失败后继续执行其他仓库
- `--execution-log <file>` 将 fleet 执行详情写入 JSON 文件
- `--fail-on <none|p0|p1|p2>` 只要任一仓库达到阈值，命令退出码为 1

## 基线工作流

```bash
# 生成基线
node src/cli.js . --format json --save-baseline reports/baseline.json --fail-on none

# 对比基线，仅输出新增问题
node src/cli.js . --baseline reports/baseline.json --only-new --format text --fail-on p1
```

## 历史 + Fleet 工作流

```bash
# 单仓库写入历史（在每个仓库执行）
node src/cli.js . --history-file reports/history.json --history-limit 200 --format text --fail-on none

# 聚合多个仓库历史（可在任意位置执行）
node src/cli.js fleet repo-a/reports/history.json repo-b/reports/history.json --format markdown --out reports/fleet.md

# 一条命令完成多仓扫描 + 历史刷新 + fleet 汇总
node src/cli.js fleet-scan repo-a repo-b --history-dir reports/fleet-history --scan-out-dir reports/fleet-reports --scan-format html --format markdown --out reports/fleet.md --fail-on none

# 自动发现模式 + 容错执行日志
node src/cli.js fleet-scan --discover-root ../workspace --discover-depth 4 --history-dir reports/fleet-history --format json --execution-log reports/fleet.execution.json --continue-on-error --fail-on p1
```

## 配置

在仓库根目录创建 `.repo-sleep-doctor.json`：

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

预设说明：
- `all`：启用全部内置规则（默认）
- `release`：聚焦发布准备度与代码质量
- `security`：聚焦密钥/安全风险

规则清单见 [`docs/rules.md`](docs/rules.md)。

集成指南：
- GitHub Actions：[`docs/guides/github-action.md`](docs/guides/github-action.md)

## 评分规则

初始分为 `100`，按严重级别扣分：
- 每个 `P0`：`-25`
- 每个 `P1`：`-8`
- 每个 `P2`：`-2`

最低为 `0` 分。

## 开发

```bash
npm run lint
npm test
npm run build
```

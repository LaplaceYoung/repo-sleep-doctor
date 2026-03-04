# Repo Sleep Doctor

Language: [English](README.md) | 简体中文

`repo-sleep-doctor` 是一个零依赖 Node CLI，用于扫描仓库发布风险并输出 `P0/P1/P2` 分级报告。

## 能做什么

可检测常见发布阻断项：

- 未解决的 merge 冲突标记
- 可能的硬编码密钥
- 调试语句残留
- 代码中的 TODO/FIXME/HACK 标记
- README 缺少安装/使用章节
- `package.json` 缺少 `build/test/lint` 脚本
- 缺少测试文件
- 超大文件

## 安装

```bash
npm install
```

## 快速开始

```bash
# 文本报告
npm run scan

# Markdown 报告
node src/cli.js . --format markdown --out reports/scan.md --fail-on none

# SARIF 报告（代码扫描平台）
npm run scan:sarif

# JUnit XML 报告（CI 测试面板）
npm run scan:junit

# HTML 可视化报告
npm run scan:html

# 仅扫描相对 main 的变更文件
node src/cli.js . --changed-since main --fail-on p1

# 使用内置规则预设（发布导向）
node src/cli.js . --preset release --fail-on p1
```

## CLI 参数

- `--format <text|json|markdown|sarif|html|junit>` 输出格式，默认 `text`
- `--out <file>` 写入输出文件
- `--config <file>` 指定配置文件路径
- `--preset <all|release|security>` 使用内置规则预设
- `--max-files <number>` 限制扫描文件数
- `--changed-since <git-ref>` 仅扫描相对指定 git 引用的变更文件
- `--fail-on <none|p0|p1|p2>` 设置退出阈值，默认 `p0`
- `--baseline <file>` 与历史基线报告对比
- `--only-new` 仅输出相对基线的新问题
- `--save-baseline <file>` 保存当前扫描作为基线
- `--no-gitignore` 不使用 `.gitignore` 规则
- `--list-presets` 输出内置预设及启用规则

## 预设说明

- `all`：启用全部内置规则（默认行为）
- `release`：聚焦发布准备与代码质量，关闭纯安全密钥类规则
- `security`：聚焦密钥泄露与冲突风险，关闭发布准备类规则

## 基线工作流

```bash
# 生成基线
node src/cli.js . --format json --save-baseline reports/baseline.json --fail-on none

# 对比基线，仅输出新增问题
node src/cli.js . --baseline reports/baseline.json --only-new --format text --fail-on p1
```

## 规则列表

详见 [docs/rules.md](docs/rules.md)。

## 集成指南

- GitHub Actions 接入：[`docs/guides/github-action.md`](docs/guides/github-action.md)

## 开发

```bash
npm run lint
npm test
npm run build
```

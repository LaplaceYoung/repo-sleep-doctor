# 2026-03-04 Fleet + Cache 升级与竞品裂变方案

## 1) 本轮已落地（工程产出）

- 新增 `fleet` 命令：可聚合多个仓库历史文件，输出 `text/json/markdown/html` 报告。
- 历史快照增强：`history` 记录新增 `ruleCounts/fileCounts`，支持规则动量趋势分析。
- 新增文件级增量缓存：`--cache-file` 可跨次运行复用未变化文件检查结果，显著降低重复扫描开销。
- 可视化增强：HTML 报告新增规则动量表、缓存命中率展示，保留严重级别/热点/趋势看板。
- 完整测试补齐：缓存命中、缓存失效重扫、CLI 缓存参数、fleet 聚合均有自动化验证。

## 2) 同类项目优势拆解（GitHub）

### Gitleaks
- 优势：规则体系成熟、Git 历史扫描能力强、CLI 与 CI 生态完善。
- 可借鉴点：规则包版本化、结果基线管理、企业级治理文档化。
- 参考：<https://github.com/gitleaks/gitleaks>

### TruffleHog
- 优势：多源扫描（git/cloud/filesystem）+ 验证机制（verified secrets）提升误报控制。
- 可借鉴点：检测结果可信度分层（verified/unverified）、多后端接入策略。
- 参考：<https://github.com/trufflesecurity/trufflehog>

### Semgrep
- 优势：规则表达能力强，SAST + Secrets + SCA 一体化，产品化看板成熟。
- 可借鉴点：规则市场化（registry）、组织级策略模板、策略即代码。
- 参考：<https://github.com/semgrep/semgrep>

### detect-secrets
- 优势：基线工作流轻量，便于在存量仓库逐步治理。
- 可借鉴点：基线审批机制、PR 变更扫描默认化。
- 参考：<https://github.com/Yelp/detect-secrets>

## 3) 对我们产品的竞争力升级路线

### A. 结构整理（单仓 -> 多仓 -> 组织级）
- 当前：单仓扫描 + 历史趋势 + fleet 聚合。
- 下一步：组织级目录约定（`org/*/reports/history.json`）+ 一键 fleet 汇总脚本。
- 目标：将“工具”升级为“治理平台入口”。

### B. 功能裂变（以高价值场景为核心）
- P1：规则包版本化（`preset@version`）、规则变更日志。
- P1：误报抑制机制（文件级/规则级 ignore with expiry）。
- P2：结果质量分层（`verified/suspected`）和修复建议模板。
- P2：组织级排行榜（风险仓库 TOPN、恢复速度 TOPN）。

### C. 代码审查与质量闸门
- PR 必过：`lint + test + build + scan --preset release`。
- 主干必出：`history.json` 与 HTML 看板 artifact。
- 质量门禁：`p0` 阻断合并，`p1` 需说明并挂追踪 issue。

### D. 静态网页托管宣传（GitHub Pages）
- 产物：`reports/scan.html` + `reports/fleet.html`。
- 发布方式：`gh-pages` 分支自动部署，首页放“在线示例看板 + 快速接入命令”。
- 目标：让潜在用户不 clone 就能直观看到产品价值。

### E. 推流策略（增长分发）
- GitHub：每个版本发布 1 个明确主题（如 Fleet/Cache/CI Gate），附对比截图。
- 内容平台：技术拆解文（性能数据、误报率改进、CI 落地模板）。
- 社区协作：开 `good first issue` 与规则征集，拉动外部贡献。
- 企业导向：输出“30 分钟接入模板仓库”，降低试用门槛。

## 4) 上线执行节奏（建议）

- Day 1：发布 `v0.3.x`（fleet + cache + 动量可视化），同步更新 README 与示例报告。
- Day 2：上线 GitHub Pages 示例站，打通 workflow artifact -> pages 自动更新。
- Day 3-5：完成规则包版本化与误报抑制最小可用版，准备下一次功能推流。

## 5) 验收指标（可量化）

- 重复扫描耗时下降：目标 `30%+`（中型仓库）。
- 看板可读性提升：规则热点定位时间目标减少 `50%`。
- CI 接入效率：从零到可用目标 `<= 30 分钟`。
- 版本裂变节奏：每周至少 1 次可演示升级。

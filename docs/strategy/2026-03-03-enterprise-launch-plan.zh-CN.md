# Repo Sleep Doctor 大厂化优化上线方案（30/60/90 天）

## 北极星目标

1. 30 天内建立“可被发现、可被试用、可被接入 CI”的最小增长闭环。
2. 60 天内提升“规则命中价值与可治理性”，降低误报导致的流失。
3. 90 天内形成“开源增长 + 团队协作能力”的产品分层。

## 一、结构整理（工程与仓库）

### 目标结构

```txt
src/
  cli/
  core/
  rules/
  reporters/
  integrations/
docs/
  strategy/
  guides/
site/
.github/
  workflows/
  ISSUE_TEMPLATE/
```

### 立即执行项

1. 将扫描主流程拆分为 `core`（文件收集、调度）与 `rules`（检测规则）两层，便于插件化。
2. 增加 `docs/guides`：`quickstart`, `ci-integration`, `baseline-workflow` 三篇。
3. 在 `.github/workflows` 增加“自扫描+发布质量门禁”。

## 二、功能增加/优化/迭代升级

### P0（本周）

1. `--changed-since <git-ref>`：仅扫描增量文件，提升 CI 时延表现。
2. `--format junit`：直接接入企业常见测试报告平台。
3. `--strict-readme` 配置：支持自定义 README 必备章节（中英/团队模板）。

### P1（2-4 周）

1. 规则包机制：`@repo-sleep-doctor/rules-security`、`rules-release`。
2. `allowlist`/`suppressions` 文件：对已知误报做有审计的抑制。
3. SARIF 增强：补充 `helpUri`、`properties.tags`，提升平台展示质量。

### P2（4-8 周）

1. 趋势对比报告：多次扫描得分趋势图。
2. 目录/模块维度统计：定位高风险区域。
3. 初版 Web Dashboard（静态读取 JSON）用于管理层汇报。

## 三、代码审查结论（本轮）

### 已完成修复

1. 扫描顺序稳定化：在文件收集阶段对目录项排序，降低 `maxFiles` 截断下的结果漂移风险。
2. Markdown 报告转义：修复 `|` 与换行导致表格破坏的问题，并补充自动化测试。

### 仍需跟进

1. README 规则当前只匹配英文标题，可扩展多语言标题词典。
2. 基线对比键可进一步去除文案耦合，减少版本升级造成的“伪新增”。
3. 增加 ignore 规则语义测试（复杂 `!` 反选、目录通配边界）。

## 四、托管静态网页宣传方案

### 资产

1. `site/index.html` 作为产品宣传落地页。
2. 内容模块：价值主张、30 秒上手、CI 接入示例、真实案例、路线图。

### 发布

1. GitHub Pages：最低成本，适合开源项目冷启动。
2. Netlify/Vercel：便于预览分支与自定义域名（推荐绑定 `docs` 子域）。
3. Cloudflare Pages：全球加速与缓存策略更灵活。

### 页面指标（上线首月）

1. UV（唯一访问）与 CTA 点击率（复制命令、打开文档）。
2. “安装 -> 首次扫描”转化率。
3. 来自 README、Action Marketplace、技术文章的来源占比。

## 五、推流策略（增长）

### 渠道矩阵

1. GitHub 内：README 优化、Topics、Releases、Discussions、Action 集成示例仓库。
2. 开发者内容：每周 1 篇“真实仓库体检案例”（前后对比、风险清单）。
3. 社区扩散：在 DevSecOps/工程效率社区投放“CI 门禁模板”。
4. 生态联名：提供与 `super-linter`、`scorecard`、`gitleaks` 协同实践文档。

### 推流节奏（建议）

1. 每周一：发布版本 + Changelog + 示例截图。
2. 每周三：案例内容（问题到修复过程）。
3. 每周五：社区问答与下周路线图预告。

## 六、上线验收标准（Definition of Launch Done）

1. 工程质量：`lint/test/build` 全绿，关键路径覆盖率达标。
2. 接入体验：本地 CLI + GitHub Action + Docker 任一方式 5 分钟可跑通。
3. 文档体验：Quickstart 到 CI 接入无断层。
4. 增长闭环：落地页上线、至少 2 篇内容发布、首批用户反馈回收。


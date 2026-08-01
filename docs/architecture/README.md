# 项目架构总览

这里回答三个问题：项目现在分成什么、每类功能放在哪里、当前重构做到哪一步。

## 当前功能地图

| 区域 | 放什么 | 人话说明 |
|---|---|---|
| `packages/` | contracts、parser、generation、workflows、Intake、爬虫、图片资产 | 可以被命令行、网页或其他功能复用的公共能力 |
| `apps/cli/` | 命令行入口 | 从终端执行 Markdown → Foundry JSON 转换 |
| `apps/web/` | Web 入口 | 上传、预览、后台生成和下载 JSON/ZIP |
| `foundry-modules/` | Chat Memory Guard、Session Monitor、Monster Spell Resolver | 真正安装进 Foundry 浏览器运行时的独立模块 |
| `tools/foundry-ops/` | Foundry Lab、资产盘点、世界检查、受限生产只读操作 | 管理和检查 Foundry 环境，不属于 JSON 生成器核心 |
| `src/`、`scripts/` | 旧入口兼容层和暂缓迁移功能 | 不是新功能的默认归属地；修改前应先寻找上面的真实 owner |

Monster Spell Resolver 的源码、manifest、构建、本地安装生命周期和测试已经统一归入
`foundry-modules/monster-spell-resolver/`。旧 `src/foundry/monster-spell-resolver/` 以及专用的旧构建、安装实现已经退役，
不再保留重复实现或兼容副本。

## 当前重构状态

- 公共包、CLI、Web、Chat Memory Guard、Session Monitor 和 Foundry Ops 的分类与主要物理迁移已经完成；
- Foundry Lab 和 reference cache 已切换到 `F:\FoundryLab`；
- Monster Spell Resolver 的最终物理归位已经完成；
- 文档索引、历史工作树治理和最终架构验收仍在进行；
- 当前权威进度以执行总账为准，不以本页的概述替代。

## 从哪里继续阅读

- 全局规则和功能路由：[根 AGENTS.md](../../AGENTS.md)
- 项目使用说明：[根 README](../../README.md)
- 原始架构重整计划：[项目分类与架构重整计划](../plans/2026-07-31-project-classification-and-architecture-reorganization.md)
- 当前实际进度：[架构执行总账](../remediation/2026-07-31-architecture-reorganization/EXECUTION_LEDGER.md)
- 长期缺陷与功能验收状态：[项目整改总账](../remediation/2026-07-15-project-hardening/EXECPLAN.md)
- 已批准的架构决定：[架构决策索引](../decisions/README.md)
- 当前真正支持到什么程度：[支持矩阵](../acceptance/current-support-matrix.md)
- 架构工具基线：[架构工具与调用边界审计](../audits/2026-07-31-architecture-tooling-baseline.md)
- 仓库工件边界：[Repository Artifact Policy](../artifact-policy.md)
- 版本参考缓存：[Versioned Reference Cache](../REFERENCE_INDEX.md)

## 文档分区

- `docs/decisions/`：已经作出的架构决定；
- `docs/runbooks/`：真实操作和恢复步骤；
- `docs/acceptance/`：功能实际通过到什么程度；
- `docs/remediation/`：仍在处理的缺陷、计划和执行记录；
- `docs/archive/`：确认不再活跃、但仍需保留的历史文档。

# ADR-0006：武器精通由自有模块实现，上游提供参考

- 状态：Accepted（当前方向）；下方旧草稿的“不自建官方八种”判断已被替代
- 原草稿日期：2026-09-22；整理日期：2026-10-01
- 决策依据：用户已明确的自有实现要求，见[交付审计的澄清与纠错](../reviews/2026-09-28-custom-module-delivery-adversarial-audit.md)、[流程复盘第 7 节](../reviews/2026-09-29-development-flow-postmortem.md)和[试点计划的模块边界](../plans/2026-09-29-development-feedback-pilot.md)
- 关联：[外部付费模块评估](../reviews/2026-09-22-paid-module-evaluation.md)

## 当前决策

1. **官方八种精通及已约定的额外特性，最终由本项目自己的 mod 实现。** 不把安装 `wm5e` 或其他上游模块作为交付这八种功能的替代方案，也不把“参考上游”理解成缩减自研范围。
2. **上游用于学习实现方式和真实接口。** 对照精确版本、许可、hook 时序、消息关联、优势消费和伤害处理，再适配自有架构；不因为已有免费替代就改变用户已定的产品目标。
3. **生成数据和运行行为分别验收。** 原生字段能表达的内容优先保持原生可移植数据；需要运行协作的规则在自有模块边界内实现。不能用一个字段尚未输出的旧判断，禁止整条运行链开发；也不能靠 schema 或单测通过宣布玩法完成。
4. **本 ADR 记录方向，不宣布全部交付完成。** WMP 业务工作树、精确候选与运行证据仍按原有归属维护；本次整理不复制业务源码、不整合其他 dirty worktree，也不推导所有目标版本都已可用。方向明确不等于实现已进入 master。

## 后果

- 本项目承担已约定武器精通功能的实现与维护；外部模块调研继续用于参考和比较。
- 付费武器精通模块保留“不购买”的既有结论，但理由改为遵循自有实现方向，不能写成“改装免费模块就完成了交付”。
- 版本支持、额外特性、生成字段及运行效果，以各自来源与验收记录为准。旧草稿的“v12 零覆盖”“生成器完全没有建模”等时点判断不作为今天的状态。

## 旧草稿保留：已被替代，不作为执行依据

以下保留 2026-09-22 草稿的技术线索和错误方向，便于追溯；其中“官方八种不自建”“第三方承担运行时”及其推进顺序均不再生效。旧草稿曾标为 Accepted 并署名用户，后续审计已明确这是代理对用户意思的误解，不能据此说用户改变了目标。版本、安装量和源码扫描也仅属于原调研时点，本次没有重新验证外部来源或业务树。

### 旧背景

dnd5e 官方系统自 4.0.0（PR #3983）起支持 2024 武器精通，但只做到"记录 + 展示"：武器 `system.mastery`、角色 `system.traits.weaponProf.mastery.{value,bonus}`、Trait Advancement 授予、角色会多种掌握时骰面板下拉选择；攻击卡的掌握名在 5.x 只是属性行纯文本，6.0 起才做成可点的规则书 content-link。**命中后的效果结算（伤害 / 豁免 / 状态 / 追加攻击 / 位移）官方至今没有任何自动化**——`cleave / graze / nick / push / sap / slow / topple / vex` 在 dnd5e `module/` 源码里只出现在 `config.mjs` 的 label + compendium 引用和 `lang/en.json`。该结论按 3.0.0 → 6.0.3 全部 release 复核过，并在 `6.0.x` 分支源码上验证。

免费模块 `wm5e` 覆盖官方 8 种且默认可自动结算，但 Forge 安装份额仅 0.4339（小众，不能假设用户已装），且不支持 v12。

本项目生成器侧目前**完全没有精通建模**：`packages/generation`、`packages/contracts`、`packages/models` 中 `mastery` 零命中——连记录层都没吃到。但 `damage.critical.bonus`（重击额外伤害骰）已在 [packages/models/src/item.ts:200](../../packages/models/src/item.ts) 建模，`packages/generation/src/activity.ts` 却从未输出。

### 旧决策（已被替代）

1. **官方 8 种精通不自建运行时。** v14 目标装 `wm5e v14.533.6` + 现有 `automated-conditions-5e 14.533.7.2`，纳入 [foundry-v14-module-health.md](../acceptance/foundry-v14-module-health.md) 语义验收。理由：免费、8/8、读官方原生数据（不违反 core profile）、版本与锁定的 `14.364 + 5.3.3` 逐字命中、作者持续维护。自己重写等于与已占位的自动化层重叠。
2. **自定义武器特质从生成器起手，不从运行层起手。** 新增精通能力时，第一顺位是原生 dnd5e 数据（例如重击额外骰写 `system.damage.critical.bonus`），因为它对所有目标同时生效——包括装不了任何自动化模块的 v12。
3. **先补 `damage.critical.bonus` 输出链路。** 模型层已建模、生成器从未输出，这是当前唯一没有替代品的缺口，也是自定义精通的入口。
4. **运行层只在两种情况下新建**：需要"改写骰面"级别的精确效果，或自定义精通必须与本项目自有条件系统（流血 / 燃烧）联动。落点为 `fvtt-house-rules` 或 `fvtt-custom-conditions`，复用 trigger-engine 底座，不新开第三个自动化框架。
5. **PF2e 武器特质（Deadly / 致命、Fatal / 夺命）不作为模块移植**：它们在 `src/module/system/damage/weapon.ts` 里是 pf2e 系统原生伤害管线（`critical: true` 的 `DamageDicePF2e`，Fatal 另有 `override: { dieSize }`），dnd5e 无法加载。只移植机制，并按代价分级处理。

### 旧后果（不作为当前状态）

- 精通自动化在 v14 上由第三方承担，本项目只负责验收与文档，不承担长期维护。
- v12 目标继续零精通自动化。若日后必须补齐，是从零写而非移植，且需自行渲染掌握名（dnd5e 4.3.9 的攻击卡不显示掌握名）。
- 自定义精通的第一个交付物是**生成器字段输出**，不是模块。`damage.critical.bonus` 链路打通前不宜启动运行层工作。
- PF2e 机制代价分级：**Deadly**（重击加固定骰面的骰）≈ 原生 `critical.bonus`，零运行时代价；**Fatal**（所有伤害骰骰面顶到更大值再加一颗）原生数据无法表达，近似方案是输出更大基础骰面 + 一颗 `critical.bonus`，精确方案才需动 DiceTerm 层——项目已有 `critmax<N>` modifier 基建（[critical-die.ts](../../foundry-modules/fvtt-house-rules/src/core/critical-die.ts)），但它做的是"取最大值"而非"换骰面"。
- PF2e 的 striking 符文乘数（让致命骰变 2 颗 / 3 颗）在 5e 无对应物，采用前需自定义规则，例如魔力加值 +1 / +2 / +3 → 1 / 2 / 3 颗。

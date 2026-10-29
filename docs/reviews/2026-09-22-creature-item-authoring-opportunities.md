# 怪物、反派与物品创作研究（2026-09-22 历史归档）

- 日期：2026-09-22；代码基线：`e2739f0`。
- 范围：Archive Creature Brewer、Game Master Tools – Creating Villains and Lairs，以及能改进本项目 FVTT 模块或本地 Actor/Item creator 的相近工具。
- 交付：功能取舍与实施建议；未购买、安装、修改产品代码或操作世界。所有外部模块的本项目运行验收均为 **NOT_EXECUTED / Untested**。
- 原研究载体：`codex/20260922-135223-creature-authoring-research`；以下调研事实、统计与原提案均保留 2026-09-22 的时间边界。
- 复用基准：[付费模块评估](2026-09-22-paid-module-evaluation.md)。已阅读主工作区当时的最新记录作为背景，但不修改或依赖其未提交决策文件。

## 2026-10-08 归档状态

本次把独有研究依据纳入主线，对照基线为 `a84d5e633a33d7738cc3f393bc72081801e4bd9e`。外部模块的版本、价格、热度和许可描述是原调查及 2026-10-07 固定来源复核的记录，未刷新为当前行情；运行状态继续为 Untested，静态来源不升级为本项目实机接受。

| 原提案 | 主线归档时的状态 | 当前依据 |
| --- | --- | --- |
| 生物蓝图、受限能力组件、中文来源与派生差异 | 已实现；仍遵守现有严格 schema 与来源验证 | [蓝图模型](../../packages/forge-browser-runtime/src/creatureBlueprint.ts)、[编辑器](../../foundry-modules/fvtt-json-forge/src/creatureBlueprintEditor.ts) |
| 可读 Actor 资料块、草稿与正式结果分层 | 已实现；Item 的可读创作预览不由此自动完成 | [资料块 renderer](../../foundry-modules/fvtt-json-forge/src/actorStatblock.ts)、[呈现依据](2026-09-24-dnd2024-statblock-preview-reference.md) |
| 统一工作台、共享连接、来源改变使候选失效 | 已由后继实现保留；归档不恢复旧单窗或旧连接表单 | [工作台 host](../../foundry-modules/fvtt-json-forge/src/workspaceApplication.ts)、[Forge 说明](../../foundry-modules/fvtt-json-forge/README.zh-CN.md) |
| Item 配方、CR/职责设计辅助、反派/巢穴、供应商批量流程 | 保留为研究提案；本次没有批准新功能排期、安装或购买 | 以下固定来源、能力边界和待判断清单 |

下面的 P0/P1、产品比较和验收切片是原研究记录。蓝图和 Actor 预览不再作为待开发功能重复提出；其他建议也不因资料归档成为任务。未来复用代码或数据时，仍需对精确版本和相应许可重新判断。

## 1. 原研究结论与优先级（2026-09-22）

**值得吸收；重点是把已有“来源转 Actor/Item”管线向前延伸成可审阅、可复用的创作流程。** 不需要另造一套生成器，也不需要将这些模块全部装成运行依赖。

| 优先级 | 可吸收能力 | 主要参考 | 建议归属 | 相对工作量判断 |
| --- | --- | --- | --- | --- |
| P0 | 可读 statblock / Item 预览、来源定位、修改差异 | Creature Brewer；我们现有 preview | Forge UI、可共享的预览模型 | 中；沿用已有候选生成与失效判断 |
| P0 | 基础怪物 + 能力组件 + 变体的创作蓝图 | Creature Brewer、GMMC | 共享创作层；CLI 和 Forge 共用 | 中高；先限制组件种类 |
| P0 | 基础物品 + 附魔/属性的确定性组合 | Item Creator | Item workflow + 目标版本适配器 | 中高；先支持少量可验证配方 |
| P1 | CR / 战斗职责调整提案、联动差异和预算说明 | Boss Loot、GMMC、Lazy GM 资源文档 | CLI 先行，Forge 消费同一结果 | 高；复杂机制不能靠比例保证平衡 |
| P1 | 反派多阶段设计、巢穴行动卡、配套物品/随从 | Creating Villains and Lairs | Encounter 创作与审阅层 | 设计卡中，通用运行时高 |
| P1 | 强化现有 Item stages：分组替换、条件、阶段差异 | Item Creator；本地 stages | 现有 Item 模型/workflow | 中高；动态换装另算 |
| P2 | 主题物品池/商人库存批量生成 | Item Creator Supplier | 本地 Item 批量工具 | 中；不扩展交易经济系统 |

P0/P1 为本次判断，不是已批准开发排期。工作量仅描述相对复杂度，不是工期承诺。

此前把 Creature Brewer 归为低优先，适用于“买来作为另一个编辑器”的判断；**作为交互与创作模型的参考，应提高优先级**。来源审阅与手工创作并不冲突：手工创作只要形成明确的新来源，再走现有正式管线即可。

## 2. 两个指定对象的核查

### 2.1 Archive Creature Brewer：最值得吸收创作方式

官方包页明确列出分步创建、实时 statblock、蓝图复用/remix、traits/actions/saves/attack、传奇动作、施法、SRD 2014 + 2024 的 Feature/spell 库、公开 lore 与 GM-only lore、Actor 导出和 system adapter。[官方功能](https://foundryvtt.com/packages/archive-creature-brewer)

精确公开 manifest：`3.0.0`，Foundry minimum `13` / verified `14.359`；只列 English；**必须依赖 `archive-tab` 和 `archive-brewer-core`**，不是单模块独立安装。该 manifest 没有精确 dnd5e 版本范围，不能推断 5.3.3 / 6.x 已验收。[3.0.0 manifest](https://r2.foundryvtt.com/packages-public/archive-creature-brewer/module-3.0.0.json)

找到了作者公开仓库，但其 main manifest 仍为 `1.0.0` / verified `13.351`，和发行版明显不同。旧源码里的 blueprint 分为 `meta / identity / notes / stats / actions / attachments`，包含 schemaVersion、systemId、publicDescription、gmNotes；这只能说明旧实现的组织方式，**不能用来证明 3.0.0 的内部实现或完整性**。[旧 blueprint 源码](https://github.com/DamondSD/archive-creature-brewer/blob/6a1e05fc2e9a6487403906666ea73056fc85e7ae/scripts/core/blueprint.mjs)

建议吸收：

1. **步骤化编辑 + 即时可读预览。** 基础属性 → 防御/移动 → 能力 → 施法/传奇 → 审阅。字段变化先更新创作草稿；正式生成预览后显示 Activity、效果、资源实际产物。预览必须来自同一规范数据，避免“描述看起来对，骰子实际不同”。
2. **能力积木。** 例如冲锋、喷吐、反击、召唤，按动作经济、触发方式、范围、资源、适用规则版本筛选。组件同时携带来源、参数与当前自动化支持程度；不能只粘贴一段描述就称为可运行。
3. **派生蓝图。** 从一个守卫派生精英、队长、亡灵版，保留父来源与派生差异。固定的源数值保持锁定，改动形成新的 homebrew 来源。重用现有 Source Library，不另建平行收藏系统。
4. **公开与 GM 资料分区。** 可以用于反派公开身份/秘密动机，但分区不等于权限隔离；落地时要按 Foundry 文档权限设计并用玩家账号验证。不要只依靠隐藏的界面字段。

不照搬：再建一个 Actor exporter、再建一套 AI provider 配置或按中文/英文名称模糊串接 SRD 2014/2024。我们已有生成与审核管线；SRD 素材覆盖也不能证明任何特定 2024 自动化规则完整实现。

### 2.2 Creating Villains and Lairs：适合转化为反派设计流程

官方资料确认其内容包括反派动机、成长建议、物品增益、巢穴强化与设计文章；商城本次显示 US$6.95。[官方介绍](https://foundryvtt.com/packages/game-master-tools)、[商城](https://www.foundryvtt.store/products/game-master-tools)

对“纯文章/表格”要补充：`1.0.3` manifest 声明 **JournalEntry、Actor、Item、RollTable 四种 pack**；未声明 `scripts` / `esmodules`。因此它是包含结构化内容的工具包，但没有证据支持把它描述为独立自动化引擎。未读取付费 pack，条目数与各 Actor/Item 的完整性未知。[1.0.3 manifest](https://r2.foundryvtt.com/packages-public/game-master-tools/module-1.0.3.json)

建议将下面的设计流程做成我们自己的功能；这些是本次产品提案，不是声称原模块已有对应按钮：

- **反派设计卡**：目标、表面动机、隐秘动机、资源、弱点、撤退条件、可谈判条件。生成时把剧情信息与机械数据分开，缺省不替 GM 决定剧情。
- **成长版本**：初遇、再次交锋、最终战分别关联 Actor、能力和物品版本；阶段转换先由 GM 选择，产物默认是独立 Actor，不自动覆盖在场 Token 的 HP/资源。
- **巢穴行动卡**：触发时机、可选目标、范围、豁免、伤害、持续时间、地形联动、GM 步骤。先交付可用卡片及原生 Activity；任意先攻点、跨回合效果和场景联动属于后续运行时能力。
- **遭遇组合**：反派 + 随从 + 特殊物品 + 巢穴卡，连接现有 Forge Encounter。不要把“已有召唤物包”误写成“已经支持通用巢穴”。

它最有价值的是逼创作者回答“反派如何变化、玩家可以如何应对”。不建议把付费文章整体翻译进仓库，也不建议先建一个只展示随机动机表的新模块。

## 3. 相近候选与具体吸收点

### 3.1 Item Creator (DnD 5e) — Item 方向首选参考

作者 Hammer。公开页描述了类型 → 基础 Item → 增强 → 授予效果 → 法术/资源 → 描述 → 审阅；已有物品可重新编辑；原生字段与需要模块的动态效果分层；还有成长阶段、Scroll Factory、Supplier、Materialization Core。[包页](https://foundryvtt.com/packages/dnd5e-item-creator)

包页最高列出 `v0.6.1`，但本次 GitHub release/manifest 实际为 **`0.7.7b1`**，发布于 2026-09-10；标签带 b1，不能仅因 GitHub 未标 prerelease 就当成稳定性保证。manifest：Foundry minimum `14` / verified `14.365`；dnd5e **minimum = verified = maximum = `5.3.3`**；English。[仓库](https://github.com/hammer-PvP/DnD-5e-Item-Creator)、[release](https://github.com/hammer-PvP/DnD-5e-Item-Creator/releases/tag/v0.7.7b1)

源码已核对到：

- `materialization/index.mjs` 识别 enchant Activity / enchantment effect，将模板应用于基础 Item，并检查临时结果；recipe registry 是原生流程不足时的确定性补充，不是让 AI 自由填写最终 JSON。
- `recipes.mjs` 为物品族记录 schemaVersion、适用类型/类别、变体与输出验证。例如护甲类型限制与基础物品选择分别处理。
- `selectProgressionTier()` 按角色等级与 tier 顺序选择最高合格项，避免同组成长无意叠加。
- Scroll Factory 调用原生 `createScrollFromSpell`，而不是自己猜卷轴字段；这不证明同一函数可直接用于无 Foundry 的 Node/Bun CLI。

[Materialization 源码](https://github.com/hammer-PvP/DnD-5e-Item-Creator/blob/04c28e5a1a606377c2d905b61caaed56c6820267/scripts/core/materialization/index.mjs)、[配方](https://github.com/hammer-PvP/DnD-5e-Item-Creator/blob/04c28e5a1a606377c2d905b61caaed56c6820267/scripts/core/materialization/recipes.mjs)、[阶段选择](https://github.com/hammer-PvP/DnD-5e-Item-Creator/blob/04c28e5a1a606377c2d905b61caaed56c6820267/scripts/services/level-progression.mjs)、[卷轴工厂](https://github.com/hammer-PvP/DnD-5e-Item-Creator/blob/04c28e5a1a606377c2d905b61caaed56c6820267/scripts/apps/scroll-factory-app.mjs)

最值得用于本地 creator 的增量：

| 能力 | 用户可见价值 | 本项目做法 |
| --- | --- | --- |
| 基础物品 + 属性组合 | “长剑 + 火焰伤害 + 每日次数”不再每次写完整物品 | 可验证 recipe 先生成规范来源/IR，再交正式 workflow |
| 物品自身 / 持有者效果区分 | 不把“这把剑 +1”误写为所有武器 +1 | 编辑与审核显式显示作用域、装备/同调条件 |
| 机制说明与叙事文本分区 | 改充能不遗漏说明文字；保留用户风味文案 | 机制说明从结构数据渲染，用户段落独立保留 |
| 分组阶段替换 | +1 → +2 是替换，不是错误累计到 +3 | 扩展现有 Item stages，而非重新实现分阶段输出 |
| 模板落成具体 Item | “某种抗性护甲”必须选护甲和抗性才成为完整装备 | 未填必要参数阻止完成；源身份/版本明确 |
| 法术转卷轴 | 少写一份易错数据 | FVTT 端可研究原生工厂；CLI 端另做锁定版本适配及语义对照 |

运行时 Triggered Effects、资源重算、等级动态换装和全套商店不是第一期：前者与自有 Trigger Engine/Custom Conditions 接壤，需要统一事件与效果生命周期。静态 Item 可移植性与可选运行时增强应分别交付。

### 3.2 Boss Loot Monster Tools — 缩放预览的最佳直接参考

免费；官方列出 CR 调整、攻防/多重攻击/先攻缩放、预览、恢复原 CR、Token 另存 Actor、可导入导出的 Guidelines Table、同 Actor 多 Token 更新。[包页](https://foundryvtt.com/packages/boss-loot-monster-tools)

`1.0.0` release 为 2026-08-18；manifest minimum Foundry `13` / verified `14`，没有精确 dnd5e 范围；包含 `zh-CN`。包页更新时间与 release 时间不同，分别记录。[release](https://github.com/boss-loot/boss-loot-monster-tools/releases/tag/1.0.0)

**源码边界很重要**：`addMultiattack()` 导入或修改 Multiattack Item 的说明，不能据此称为完整攻击序列自动执行；`scaleDamageDiceOnItems()` 明确跳过 spell Item。因而施法怪、充能爆发和不同攻击替代关系不能被“任意怪物一键平衡”的表述掩盖。中文文件将 DPR 写为“每秒伤害”，也说明有中文文件不等于术语验收。[缩放源码](https://github.com/boss-loot/boss-loot-monster-tools/blob/79a65cbdbdb17f51f000189fb8c746513ab792b3/scripts/actor-updates.js)、[中文资源](https://github.com/boss-loot/boss-loot-monster-tools/blob/79a65cbdbdb17f51f000189fb8c746513ab792b3/lang/zh-CN.json)

建议我们做 **“调整提案 → 联动差异 → 新来源 → 重新生成”**：显示 HP、AC、命中、DC、单次伤害、攻击次数和资源哪些改了、哪些没有改；锁定不想变的字段。CLI 可批量生成同一敌人的多个强度版本。数值缩放不应偷偷覆盖导入来源，也不应默认改场上战斗状态。

其原地恢复依靠模块 flags 内的原始数据；本项目不采用这套复制/恢复方式，而是保留既有来源身份及派生变更，使用现有 create-only 路径。

### 3.3 Giffyglyph's 5e Monster Maker Continued — 职责与能力参数化

当前 fork 支持四种 rank（minion、standard、elite、paragon）、六种战斗 role（controller、defender、lurker、skirmisher、striker、supporter）、等级缩放、可缩放 Action 和 shortcode。勿把旧版宣传中的七个 role 当成当前 fork 的六个。[当前说明](https://github.com/Skyl3lazer/giffyglyph-monster-maker-continued/blob/79e7cb3d54f22da2eb9a1339000e1d2e40577a01/docs/README.md)

`2.0.1.5` release 为 2026-09-12；manifest Foundry minimum `13.347` / verified `14.365`，dnd5e minimum `5.3.2` / verified & maximum `5.3.3`；必须依赖 lib-wrapper；English。**不能直接用于 server-next dnd5e 6.x**。[manifest](https://github.com/Skyl3lazer/giffyglyph-monster-maker-continued/blob/79e7cb3d54f22da2eb9a1339000e1d2e40577a01/module.json)

可吸收的是“这只怪在战斗中干什么”的模板轴，而非只有 CR：同样强度下，守卫重防御，突击者重机动/爆发，支援者增强盟友。能力参数（攻击/豁免/伤害/次数）绑定统一设计数据。我们的产物应编译成确定的原生数据，不要求最终 Actor 持有该模块 shortcode 才能工作。

该设计是第三方怪物构建体系，不等于官方 CR 规则；其新状态与自有条件系统还可能同名异义，因此不整体引入十八种状态。README 明确提示 scalar 与 vanilla Action 来回切换不会同步另一边修改，值得在我们自己的派生/编辑设计中避免。[模块说明](https://foundryvtt.com/packages/giffyglyph-monster-maker-continued)

### 3.4 Lazy Monster Builder / Lazy GM 资源文档 — 取数据参考，不迁移旧模块

Lazy Monster Builder 官方包页仍为 `0.2.4` / Foundry `11`，一年以上未更新；不建议作为 v14 安装候选。[包页](https://foundryvtt.com/packages/lazy-monster-builder)

更有价值的是上游 **The Lazy GM's 5e Monster Builder Resource Document**：包含 CR 数值基准、怪物职责、Boss/杂兵和遭遇检查清单，且该资源文档明确使用 **CC BY 4.0**。可作为我们未来明确署名、独立命名的自制怪物 preset 数据源，不能标成“官方 2024 CR 算法”。[作者发布的资源文档](https://slyflourish.com/lazy_5e_monster_building_resource_document.html)

不要把 Sly Flourish 普通文章上的 CC BY-NC 与这份资源文档的 CC BY 混淆，也不要把 Boss Loot 实现的许可证当作这份上游数据的许可证。

### 3.5 其他筛选结果

| 对象 | 有用之处 | 结论 |
| --- | --- | --- |
| [Monstershuffler](https://www.monstershuffler.com/) | race/class/template 组合、参数表达式、NPC 派生、CR 编辑 | 网站级设计补充；其官方说明警告切换模板会替换已编辑统计/动作。我们应提供字段锁定和差异审阅；不是已验证的 Foundry 导出适配器 |
| [PF1 Magic Item Generator](https://github.com/websterguy/pf1-magic-item-gen) | 基础武器/护甲 + 材质/附魔选择，派生价格等字段 | 跨系统参考；其 README 明说特殊能力只加入说明，不自动实现。不能搬 PF1 价格/加值规则到 dnd5e；2025-08 后未更新，低优先 |
| [D&D Item Auto Maker](https://foundryvtt.com/packages/DnDItemMaker) | 自然语言造 Item、历史重放/修订、JSON 导出 | 与现有 AI Item Intake 重叠较多；包页只 verified 13。保留历史修订 UX 作为旁证，不为它重建 AI 管线 |

TheRipper93 等大热综合模块只作对照：本项目已有相关评估，本次不重复展开，也不因流行度提升其优先级。

## 4. 热度、版本与证据强度

指定的两家作者 494 / 879 patrons 是用户提供及既有记录的快照，本次未刷新，不当作实时订阅人数。新候选使用 GitHub API 的 stars 与 release ZIP download_count 作为可量化代理信号；**下载包含升级和重复下载，不等于安装数或活跃用户**。

| 新候选 | Stars | Release ZIP 累计下载 | 计数范围 | 归类 |
| --- | ---: | ---: | --- | --- |
| Boss Loot Monster Tools | 0 | 783 | API 返回全部 1 个 release 的 ZIP | 小众、有一定分发 |
| Item Creator | 0 | 984 | API 返回全部 62 个 release 的 ZIP | 小众、有一定分发 |
| GMMC Continued | 8 | 1,391 | API 返回全部 27 个 release 的 ZIP | 小众、有一定分发 |

这些都不是“数百 stars 的热门模块”。按本次采样的发布包计数，500–5,000 仅作为小众候选内部的中等分发档，不与 Patreon 300–1,000 patrons 等同。没有足够依据声称它们是整个 Foundry 生态的中等活跃度模块；纳入理由是功能贴合度，不虚构热度。

计数入口：[Boss Loot API](https://api.github.com/repos/boss-loot/boss-loot-monster-tools/releases?per_page=100)、[Item Creator API](https://api.github.com/repos/hammer-PvP/DnD-5e-Item-Creator/releases?per_page=100)、[GMMC API](https://api.github.com/repos/Skyl3lazer/giffyglyph-monster-maker-continued/releases?per_page=100)。统计日期均为 2026-09-22。

证据层次：官方产品页证明作者宣称的功能；manifest 证明版本/语言/pack 声明；源码证明检查到的路径；均不替代本地语义验收。包页的 Supported Game Systems 中显示“dnd5e 6.0.3”是系统目录当前版本，**不能覆盖模块 manifest 的 5.3.3 上限**。

## 5. 2026-09-22 的本地产品比较

本节记录当时的实现基线。现行蓝图、Actor 资料块和统一工作台以本文件的归档状态及当前 owner 为准。

| 本地已核对能力 | 文件证据 | 本次新增建议 |
| --- | --- | --- |
| Actor/Item 生成、accepted-only、create-only、readback、Source Library、Collection/Queue | [Forge README](../../foundry-modules/fvtt-json-forge/README.zh-CN.md)、[sourceLibrary.ts](../../packages/forge-browser-runtime/src/sourceLibrary.ts) | 不重复建设存储/生成入口；在来源之前加入蓝图组合与派生 |
| 当时 Actor preview 以 `JSON.stringify(buildSafePreview(...))` 显示；现行已采用可读资料块 | [application.ts](../../foundry-modules/fvtt-json-forge/src/application.ts)、[模板](../../foundry-modules/fvtt-json-forge/src/templates/forge-actor.hbs) | 可读 statblock、字段到来源的定位、变更对照；不是声称项目完全无预览 |
| 锁定版本法术 catalog、identifier/name 双重一致解析 | [v14SpellCatalog.ts](../../packages/forge-browser-runtime/src/adapters/v14SpellCatalog.ts) | 在已有解析之上加用户可选能力/法术组件库；不另做模糊法术查找 |
| 原生 Item 属性、稀有度、同调、uses、stages | [item.ts](../../packages/models/src/item.ts)、[itemGenerationWorkflow.ts](../../packages/workflows/src/itemGenerationWorkflow.ts) | 配方组合、替换组、阶段差异及明确触发条件；已有阶段输出不是动态装备升级 |
| stage 展开与 sourceMechanicsPresent / needs_review 诊断 | 同上 `expandParsedItemStages()` | 继续用此能力做静态成长物品。不能把未结构化阶段直接升级为 accepted |
| 2–6 生物战斗包与有界固定自动化 | [战斗包指南](../../tools/forge-encounter/README.md)、[capabilities](../../packages/intake-ai/src/encounter-capabilities.ts) | 反派/巢穴设计面板、额外事件类型与新组件需要分别实现 |
| Trigger Engine：Actor 更新、回合开始、回合结束、active GM、队列与因果链 | [Trigger Engine README](../../foundry-modules/fvtt-trigger-engine/README.zh-CN.md) | 可作为未来巢穴/阶段运行时基础；没有证据称任意 initiative=20 巢穴调度已存在 |
| CLI 已有 monster/item Intake、resume、dry-run、版本/profile 选择 | [CLI](../../apps/cli/src/main.ts) | 新增创作提案、recipe/variant 批量展开、预览报告能力；本报告没有新增可执行命令 |

这里的“未有”只针对检查到的产品入口与公开 workflow，不把关键字搜索无结果当作全仓数学证明。

## 6. 建议的产品路径与验收目标

### A. 先做共享创作数据，再做多个入口

建议的流程（设计提案）：

```text
作者填写蓝图 / 选择组件 / 提交派生变更
  → 确定性展开成新来源（保留父来源、选择与参数）
  → 现有 parser / workflow / generation / verifier
  → 可读 Actor/Item 预览 + 机制差异 + 待裁决项
  → CLI 正式 artifact / Forge accepted-only create
```

“忠实转换”与“homebrew 创作”应有明确模式：转换不主动平衡或补规则；创作的修改记录成为新来源。外部来源、用户创作、算法建议分开记录，绝不把原创数值伪造成原文引文。

共享创作层负责确定性 recipe、组件版本、参数、冲突诊断；CLI 负责文件/批量；Forge 负责交互、世界引用与导入。最终 JSON 仍由已有 workflow 生成。用户安装第三方运行模块与 core 输出可移植性是两件事，不能仅因模块存在 flags 就一概否决其设计。

蓝图最少记录：schemaVersion、父来源身份/hash、规则版次、组件 id/version、参数、锁定字段、显式覆盖、目标版本/profile。蓝图不是最终 Actor JSON 的副本；未知条件不得悄悄简化。

### B. 第一批可验收的切片

1. **一只基础守卫 → 三个明确派生版本**：固定来源字段不变；新增能力都有来源/作者选择；重复展开一致；预览数值、攻击骰、资源与最终 Actor 一致。
2. **三到五种能力组件**：先选原生 attack/save/uses 可表达的类型；分类显示“原生可用 / 需固定运行能力 / GM 操作”。组件文字与可执行机制分别验收。
3. **一个基础物品 → 三种组合**：局部武器加值与 Actor 加值不得混淆；同调、次数恢复、替代 Activity、描述同步都核对。非法基础物品组合必须有明确诊断。
4. **现有分阶段物品增强**：验证同组替换、跨组累积；不存在“重复展开导致 +1/+2/+3 一起叠加”。先交付静态阶段，不顺便承诺运行时自动升级。
5. **CLI / Forge 一致性**：同一来源、参数、组件库版本和目标产生相同机械结果；UI 修改后旧候选失效；失败不进入正式 output。

### C. 第二批：数值设计辅助与反派/巢穴

CR preset 明示来源与算法版本。显示基础 DPR、攻击次数、DC、范围命中人数假设、充能与传奇动作预算；若采用多回合估算，必须由用户看到假设。控制、召唤、免疫、飞行/地形优势单列风险，不能给出“保证平衡”的绿灯。不要为了实现这一步先建设完整战斗模拟器。

巢穴先生成设计卡和手动可执行 Activity；新增运行时之后才验收指定先攻点、来源死亡/离场、停用与刷新、单次执行、多人 GM、Token 与 Actor 区别。使用现有 Trigger Engine 的适用事件，缺的事件明确扩展，不硬塞成“反派自己回合开始”。

## 7. 代码与内容复用边界

- Item Creator 的仓库 [LICENSE](https://github.com/hammer-PvP/DnD-5e-Item-Creator/blob/04c28e5a1a606377c2d905b61caaed56c6820267/LICENSE) 为 MIT，是可以进一步评估代码复用的对象；需要保留其声明，且其代码许可证不自动涵盖玩家安装的商业 compendium 内容。
- Boss Loot 仓库 [LICENSE](https://github.com/boss-loot/boss-loot-monster-tools/blob/79a65cbdbdb17f51f000189fb8c746513ab792b3/LICENSE) 为 CC BY-NC-SA 4.0；功能思路可参考，本报告不建议直接复制其实现进未明确发行方式的项目。
- GMMC API 未识别出标准代码 license，README 只链接 Foundry 模块开发许可；不把“公开仓库”写成“可任意复制”。优先独立设计职责/缩放结构；数据/代码复用前另核实具体授权。
- Creature Brewer 旧公开源码与商业新版本不同；Creating Villains and Lairs 付费正文未读取。本次只从公开功能与 manifest 提炼产品方向，不声称已审计其付费内容。
- Lazy GM 的专门资源文档明确 CC BY 4.0，若纳入数据应保留其要求的署名与改动说明，单独标明这是第三方创作 preset。

## 8. 待判断本地化清单与后续复查

这里的“本地化”同时区分纳入本地 Lab、中文化和独立实现。状态遵循 [module health](../acceptance/foundry-v14-module-health.md)：未做运行验收不升为可用。此次不改既有健康矩阵。

- [ ] Creature Brewer：如需交互实测，取得合法 3.0.0 及两个依赖；核对精确 dnd5e 目标、离线启动与 GM lore 权限。当前建议功能参考优先，购买决定未作。
- [ ] Creating Villains and Lairs：如需借鉴具体表格组织，先取得内容；核对 pack 内条目与语义。本次只设计独立反派/巢穴流程。
- [ ] Item Creator：优先深入小范围 materialization / tier 模型；中文界面需自建。直接安装暂受 dnd5e 5.3.3 上限限制，6.x 需另评。
- [ ] Boss Loot：可作为缩放 A/B 对照候选；已含中文，但需修正 DPR 等术语并核实翻译覆盖。施法/多重攻击边界单独验收。
- [ ] GMMC：职责与能力参数化参考；如装 Lab 仅精确目标候选，6.x 当前不适用；不同时导入同名自定义状态。
- [ ] Lazy GM 资源文档：若选择作为可复用 preset，固定版本、署名、中文术语表和数值 fixture；不移植停在 v11 的模块。
- [x] 第一期方向已由后继实现确定并完成 Actor 蓝图与可读预览；Item 配方保持研究提案，不重复启动 Actor 蓝图开发。

新候选复查顺序：

1. 先读本报告与原付费评估，避免重新收集已评估对象。
2. 核对官方功能、发布包和源码是否同一版本；不能用 latest URL 掩盖版本漂移。
3. 读取 manifest 的 Foundry/dnd5e 范围与依赖；区分 14.364/5.3.3 和 server-next，不擅自升级环境。
4. 检查一个核心功能真实代码路径，分清描述、原生数据和运行模块依赖。
5. 用 patrons、安装份额或 release 下载等可追溯信号描述热度，注明单位与局限。
6. 查语言、内容来源与具体 license；公共仓库不代表商业内容可复用。
7. 对照本地 owner，列出真正增量、冲突面与最小语义样本。
8. 若之后获准安装/实现，再做 Lab 行为、来源、多人及停用后的检查，更新健康矩阵与适用手册；未跑保留 Untested。

## 9. 原调研与检查记录（2026-09-22）

- 使用 AnySearch 公共检索/正文抽取；已发现 gaming 垂直域仅覆盖电竞/Steam，code.snippet 结果不相关，后续使用普通公共检索。没有将搜索摘要当作最终功能证据。
- 用 GitHub 官方 API/原始文件补核 release、下载计数、manifest、license 及上列源码；未访问账号私有数据。
- 已只读核对当前本地 Forge、CLI、Item stages、法术解析及 Encounter/Trigger Engine 的对应路径。
- 文档检查 **PASS**：13 个相对链接全部存在，233 行文档无行尾空白，代码围栏成对，`git diff --check` 通过；worktree 只新增本报告，主工作区仍为开始时的三个既有改动路径。
- **NOT_EXECUTED**：付费包运行、交互视觉验收、Foundry 安装、dnd5e 6.x 迁移、实际战斗平衡、多人/长时测试。本任务为研究文档，不跑与结果无关的全仓测试。

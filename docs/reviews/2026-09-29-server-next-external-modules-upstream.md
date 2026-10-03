# 10个外部模块：官方状态与本地适配可行性（2026-09-29）

这是有日期的来源调查，不是第二份进度清单。当前决定只在[唯一迁移入口](../plan/server-next-migration-handoff-20260927.md)维护。目标Foundry14.368/dnd5e6.0.2；下述调查完成时未安装、未改世界、未发Issue/PR。随后新主任务的首批固定源码/构建/安装证据见文末，当前验收状态仍只维护唯一入口。

## 查询方法及纠错

通过AnySearch公共搜索、官方GitHub网页/API、固定tag源码、正式发布manifest及ZIP复查。GitHub匿名API遇速率限制后改用现有gh认证只读API及公开网页；不输出凭据。检查完整release正文、open/closed issue与PR、公开分支、近期提交和相关评论。作者本机worktree、私下Discord或非公开代码不可见，不做无依据断言。

**纠正9/28报告：DFreds Convenient Effects9.2.7明确适配dnd5e6.0+。**旧“三个D&D模块支持复查”称无D&D6声明，是阅读遗漏；不是作者后来才发布，也不是一次新的运行验证。

## 1. DFreds Droppables

- 当前最新正式[v6.2.1](https://github.com/DFreds/dfreds-droppables/releases/tag/v6.2.1)，2026-08-17；main等于tag，没有后续公开修复提交。ZIP digest `d67e9813496e8186a167d821713fb881b003ba5aecba3465ebf3caa80d4893f1` 与旧本地证据一致。
- [固定源码constants.ts](https://github.com/DFreds/dfreds-droppables/blob/v6.2.1/src/ts/constants.ts)写的是`moduleData.id`；正式ZIP产物却将旧module.json对象赋给MODULE_ID，内含version1.2.5。11处settings register/get/set和1处模板路径使用它。[Foundry14 ClientSettings](https://foundryvtt.com/api/classes/foundry.helpers.ClientSettings.html)要求namespace字符串。结论是确定的源码/构建不一致及静态路径风险，未在Next运行复现。
- 已检索25个公开Issue、8个PR的正文，以及72条Issue评论并用具体术语搜索；未找到同症状记录。[#18](https://github.com/DFreds/dfreds-droppables/issues/18)是2022年另一旧版修复没进ZIP的问题，不能当成本问题已报告。
- [MIT源码许可](https://github.com/DFreds/dfreds-droppables/blob/v6.2.1/LICENSE)；可以自己修。优先复现构建差异，将模块ID保证为固定字符串，重新构建并验产物；核设置读写、模板请求和实际拖拽。不能把改过的包称为未修改官方6.2.1。

## 2. Global Progress Clocks

- 当前最新正式[v1.3.3](https://github.com/CarlosFdez/global-progress-clocks/releases/tag/v1.3.3)，2026-07-23；main等于tag，未见后续公开修复提交。ZIP digest `cb498adab49ee2b0bf9714b24f86c467aec0fe23d802af7453773690d7781c8e`与旧证据一致。
- [module.json](https://github.com/CarlosFdez/global-progress-clocks/blob/v1.3.3/module.json)声明greensock/dist/gsap.min.js，正式ZIP和tag树都没有；[发布workflow](https://github.com/CarlosFdez/global-progress-clocks/blob/v1.3.3/.github/workflows/main.yml)打包白名单也没有greensock。[clock-panel.mjs](https://github.com/CarlosFdez/global-progress-clocks/blob/v1.3.3/module/clock-panel.mjs)仍有一处gsap.fromTo。包缺件已证实，Next运行后果未测。
- 检查38个公开Issue、9个PR正文及164条Issue评论，未找到同症状记录。[#43](https://github.com/CarlosFdez/global-progress-clocks/issues/43)是已关闭的V14 Handlebars helper问题，不能冒充GSAP修复。
- [MIT许可](https://github.com/CarlosFdez/global-progress-clocks/blob/v1.3.3/LICENSE)。可本地修复：将唯一淡入动画改为浏览器原生动画，再移除缺失的GSAP声明，并按源码重新打包。不仅删manifest路径而保留调用，也不必额外引入一套第三方依赖。需要核文件完整、无gsap/404、新建淡入、进度更新和GM/玩家可见性。

上面“没找到相同Issue”限定于本次公开查询范围，不表示作者从未收到私下反馈。

## 3. Item Piles / Item Piles D&D5e

- 基础包[3.3.4](https://github.com/fantasycalendar/FoundryVTT-ItemPiles/releases/tag/3.3.4)正式manifest为Foundry13–14，依赖socketlib/lib-wrapper。作者[#731](https://github.com/fantasycalendar/FoundryVTT-ItemPiles/issues/731)说明系统独立化：基础功能与系统配置分离。
- D&D配套包[1.1.0](https://github.com/fantasycalendar/FoundryVTT-ItemPilesDnD5e/releases/tag/1.1.0)正式[发行manifest](https://github.com/fantasycalendar/FoundryVTT-ItemPilesDnD5e/releases/download/1.1.0/module.json)和ZIP内部都写1.1.0、Foundry12–14，并**必需item-piles至少3.2.7**。所以要两个都装，适配包没有取代基础包。
- 纠正先前模糊点：[tag源码manifest](https://github.com/fantasycalendar/FoundryVTT-ItemPilesDnD5e/blob/1.1.0/module.json)写1.0.0不代表实际发行资产错版，发行资产已核1.1.0。
- 配套包1.1.0发行说明只写Foundry14；公开检查未找到明确D&D6适配声明/对应修复。这是未确认，不是实测不兼容。下一步可以针对D&D适配字段做源码差异与精确目标的物品/货币/容器代表流程验证，不再仅凭无声明无限搁置。

## 4. DFreds Convenient Effects

- 最新[v9.2.7](https://github.com/DFreds/dfreds-convenient-effects/releases/tag/v9.2.7)，2026-09-21。完整正文明确增加D&D6分级效果处理及迁移到6.0+；[提交1302409](https://github.com/DFreds/dfreds-convenient-effects/commit/1302409b6e8f6b7a0c35ea4e4ddb62e35bd68ff7)以system.version>=6.0.0为迁移门槛。
- 正式ZIP manifest=9.2.7，Foundry minimum/verified/maximum均14；依赖socketlib、lib-dfreds-ui-extender、lib-dfreds-migrations。
- **有明确上游6.0+适配依据，解除原HOLD_SUPPORT，进入正式包候选。**按用户规则核依赖/安装/启用/重登新增错误，不要求额外全量预制效果玩法验收。本轮尚未安装，不把官方支持声明当成本机通过。

## 5. Vision5e

- 最新[v3.2.2](https://github.com/dev7355608/vision-5e/releases/tag/v3.2.2)正式ZIP验证Foundry14，系统仅minimum5.0.0、verified5.3.3。
- 官方公开分支只有main，open/closed PR和近期提交未核到D&D6适配分支或声明。已有[Foundry14效果适配提交](https://github.com/dev7355608/vision-5e/commit/f7246b130a244de259419ffa5287912fc01ca313)，不能说作者完全没做V14。
- [MIT许可](https://github.com/dev7355608/vision-5e/blob/main/LICENSE)，有[Rollup构建](https://github.com/dev7355608/vision-5e/blob/main/package.json)，可以本地适配。先查[actor.mjs](https://github.com/dev7355608/vision-5e/blob/main/scripts/actor.mjs)感官/物品/效果读取与[_index.mjs](https://github.com/dev7355608/vision-5e/blob/main/scripts/_index.mjs)Foundry类扩展，按6.0.2准确API形成最小差异。不能仅改verified=6.0.2；源码可改不等于已经证明全部行为适用。

## 6. Item Macro

- 最新[v3.0.1](https://github.com/Foundry-Workshop/Item-Macro/releases/tag/v3.0.1)，正式ZIP只验证Foundry13.344，没有D&D版本声明。公开分支只有master，open/closed PR未核到Foundry14/D&D6适配。
- [#20](https://github.com/Foundry-Workshop/Item-Macro/issues/20)活动宏需求仍open；[#25](https://github.com/Foundry-Workshop/Item-Macro/issues/25)是D&D5.1.10事件作用域问题，不能说是6.0.2实测失败或官方6.x开发计划。
- [MIT许可](https://github.com/Foundry-Workshop/Item-Macro/blob/master/LICENSE)，可本地适配。重点是[DND5e handler](https://github.com/Foundry-Workshop/Item-Macro/blob/master/scripts/systems/handlers/DND5e.mjs)已有dnd5e.preUseActivity/activity.use调用与[ItemMacro.mjs](https://github.com/Foundry-Workshop/Item-Macro/blob/master/scripts/ItemMacro.mjs)事件读取；分开验证Foundry14界面和D&D6活动/手动宏，不一概重写。

## 7. Plutonium CN

按用户明确指示暂停，用户已有官方渠道且确认未更新；本轮不再查找或修改模块。雅灵来源的本机数据只读查阅不构成迁移该模块。

## 8. 5e DLC Monster：可以评估自用迁移

旧本地manifest1.2.0，无运行脚本，声明两个Actor合集monster-heji、modengken-duoyuanguaiwu；磁盘另有未声明目录，不自动纳入。只读SST结构抽样确见npc/feat/weapon/spell等数据，_stats.systemVersion混有5.1.10与5.3.3。SST含历史记录和嵌入文档，未将原始记录数当成现存怪物数，也未导出整包。

本机精确dnd5e6.0.2的`Data/systems/dnd5e/dnd5e.mjs`包含migrateCompendium、migrateActorData、migrateItemData；migrateCompendium通过pack.getDocuments及正常doc.update迁移并恢复合集状态。这提供具体技术路线，**可以做用户已持有包的本地自用迁移评估，不必因没有公开发行URL无限搁置**。

执行时先保留来源/ID和语义对照，在Next按正常合集迁移处理，核攻击/伤害/法术/次数/效果及图片与跨包依赖。无法载入的旧记录需先诊断，不能保证内置迁移自动全修。无外部再分发授权，不发布此内容包；不修改正在使用的Mirror合集、不复制世界、不直接写其LevelDB。

## 9. Dungeon Strugglers Collection

旧本地1.1.1、Foundry验证12；[官方Patreon介绍](https://www.patreon.com/dungeonstrugglers/about)仍介绍Foundry Item Packs，但未给出当前精确包版本/6.x适配。[作者GitHub组织](https://github.com/Dungeon-Strugglers)当前没有公开仓库；精确ID及作者Foundry更新搜索未找到可核的新发行。

结论是**没有查到公开可验证的升级包**，不能断言会员区一定没有新版。不访问私人下载或擅自下载付费内容；按用户指示暂停。

## 10. 雅灵缺的具体能力（只解释，不提前修）

已有只读诊断cn-source-inspection-readback.json显示：雅灵来源MPMM p13，生物类型、黑暗视觉、妖精血统、妖精步伐、敏锐感官、缺失引用oFrdemKo1y1Hcrx0、语言。旧本地`plutonium-cn/data/races.json`中同名同来源p13的条目顺序对应第六项“出神”（ENG_name=Trance）。因此能力名称高度可信地定位为出神；原物品ID完整文档仍未恢复，Mirror的SST精确ID只读检索无命中，也不能以名称/顺序自动替代完整来源。

出神涉及免睡眠/魔法睡眠、保持意识的4小时长休、长休后切换季节及临时武器/工具熟练。这里不写玩家人物；按用户顺序留到模块之后。旧报告只写“缺一个能力”不够具体，已在唯一入口补充名称和证据层级。

## 11. 9/29首批候选实施证据（不是另一份当前清单）

新主任务01a0ec3b-9fad-72a0-9869-c6f58a0220b6通过官方GitHub API刷新CE/Droppables/Clocks及三个依赖的完整正式release和资产。三主包版本/digest未变；依赖现有socketlib v1.1.4、lib-dfreds-ui-extender2.5.0、lib-dfreds-migrations1.0.4与正式ZIP逐文件一致，没有替换依赖。

固定commit、源码ZIP及正式资产SHA-256、完整release正文在[upstream-lock.json](../../foundry-modules/server-next-external-candidates/upstream-lock.json)。本地修复与重建说明见[候选README](../../foundry-modules/server-next-external-candidates/README.md)：Droppables固定模块ID字符串并按上游TypeScript/Vite生产流程构建6.2.1+servernext.1；Clocks单处gsap.fromTo改Element.animate，移除失效scripts项，按源码打包1.3.3+servernext.1。保留MIT许可，两个本地manifest显式标版本/标题并移除官方更新URL；未冒充未修改的官方发行包。

`npm run build`通过；候选`npm test`4/4通过，覆盖实际构建产物namespace注册/读写、原生动画只作用新clock、持久Macro部分创建失败后的精确恢复、误目标/外来ID拒绝。包声明资源检查通过。9/29 16:27三个候选在离线Next完成安装及逐文件SHA-256对账，证据见[install-receipt.json](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/external-first-20260929/install-receipt.json>)；安装前后无Next进程/30002监听、世界LOCK可独占只读打开，Mirror30001/PID43716保持不变。以上仅证明来源、构建、安装与离线工具行为，不证明实际客户端/拖拽/玩家可见性；这些由同批Chrome契约承接。

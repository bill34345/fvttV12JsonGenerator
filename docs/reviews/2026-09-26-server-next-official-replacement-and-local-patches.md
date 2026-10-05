# ServerNext 官方正式版与本地补丁替代路线（2026-09-26）

> **专项证据，不是当前进度表。**本页保留标题日期的来源和检查经过；其中“当前”“未执行”等只属于当时。新对话以[唯一迁移交接报告](../plan/server-next-migration-handoff-20260927.md)为准，仅在核对应证据时读本页。

## 结论

旧服启用、新服缺失的包不能统一“从Mirror复制”。先按模块ID和功能判断：同ID的作者正式新版若明确适配目标且已包含旧补丁功能，改用作者正式版；作者新版仍缺本团功能时，保留该缺口，按当前目标源码移植最小补丁或暂缓；完全自制且无官方同ID替代的模块只能走本团正式来源和关键行为验收。通用工具若不依赖D&D系统，先核官方Foundry14版和依赖，再逐个安装并重新进世界看启动错误；不把“通用”写成“作者明确验证D&D6玩法”。本轮**没有安装或开启下列任何缺失包**。

## Babele 表格嵌入翻译：官方Babele不能直接代替

- 旧服独立模块 `fvtt-babele-rolltable-embed-translation` 0.1.0 是本团自制补丁，锁定F14.364/D5.3.3/Babele2.9.1；其目的不是普通表格翻译，而是让 `@Embed` 渲染已翻译随机表时显示中文行。它只包装 `RollTable.prototype._buildEmbedHTML`，不改世界资料。[本团源码和说明](../../foundry-modules/fvtt-babele-rolltable-embed-translation/README.zh-CN.md)。
- [Babele官方GitLab标签](https://gitlab.com/riccisi/foundryvtt-babele/-/tags)最新正式仍为2.9.1；Next已安装并启用同版。[官方说明](https://gitlab.com/riccisi/foundryvtt-babele/-/blob/master/README.md)确有 `tableResults` 合集翻译，但本机正式Babele源码没有 `RollTable.prototype._buildEmbedHTML` 包装，不能直接断言解决嵌入渲染。
- 只读进入Next原世界后，用原生 `_buildEmbedHTML` 渲染 `Compendium.dnd-players-handbook.tables.RollTable.phbWildMagicSurg`：标题是“狂野魔法浪涌”，但首五行和嵌入HTML仍为英文；[译包来源](<F:/FoundryLab/foundry-v14/data/server-next/Data/modules/dnd-simplified-chinese-babele-patch/translation/cn/dnd-players-handbook.tables.json>)明确有这些行的中文译文。[无写入现场读回](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/module-activation-20260926/babele-embed-readonly.json>)。
- **决定：不复制旧模块到Next，也不因Babele官方包已装就删除缺口。**先按F14.368/D6.0.2目标核 `RollTable` 与Babele2.9.1 API，只移植本团必要包装，构建正式新包；验25行狂野魔法浪涌、5行困惑术、文档型结果链接和重载，同时查启动错误。若Babele后续正式版真的覆盖这些结果，再用原生对照证明后撤去本地补丁。

## Simple Cover 5e：优先作者正式新版，不复制旧补丁

- Mirror的 `simplecover5e` 是作者2.2.0加本团 `-cor-cotn.1` 修订；[旧补丁记录](<F:/FoundryLab/foundry-v14/data/server-mirror/Data/modules/simplecover5e/LOCAL_PATCH.zh-CN.md>)说明它对同一人物的掩护状态写入排队，防重复创建固定ID效果。旧版只在F14.364/D5.3.3验证。
- [作者GitHub正式发布](https://github.com/Kapuzenjoe/simplecover5e/releases)最新2.2.3；其2.2.2发布说明明确写“Initial support for D&D System Version 6.0.0”，2.2.3正式清单锁Foundry14且同ID `simplecover5e`。2.2.3又修了快速连续移除效果时的竞态错误。
- 本轮只读下载作者2.2.3官方ZIP，SHA-256 `7BF3295DC7FE4A03B78FF7696FA5E102AFF3DCD3D487DE017938A428633DB74F`；其 `scripts/cover/status.mjs` 有按Actor UUID保存的 `foundry.utils.Semaphore(1)`，请求路径都走 `_applyCoverStatus`。这与本团补丁“同人物写入串行、不同人物不互相阻塞”的核心目的相符；作者实现与本团旧补丁源码已经逐段对比。
- **决定：优先把作者正式2.2.3列为Next候选，不复制Mirror的2.2.0本地修订，也不把补丁叠加到作者新版。**仍需按官方ZIP清单核包身份/依赖、旧设置是否能迁移、目标正常启动与旧补丁所防的特定并发错误；通过后才称替代完成。当前Next仍未装。

## 12个通用工具：作者正式版逐个取代旧版的候选

它们的正式manifest均列出Foundry14范围，且未声明只限某个D&D系统版本；这只把它们放入“通用工具候选”，**不**等于作者已经明确验证D&D6。逐包核用途、授权、依赖与旧设置后才进入小批操作，不从Mirror复制旧版。

| 模块 | Mirror旧版 → 作者正式版 | 正式包依赖 | 处理顺序与限制 |
|---|---|---|---|
| [3ds-atlas](https://github.com/Sayshal/3DS-ATLAS/releases/latest/download/module.json) | 1.0 → 1.4.3 | 无必需模块 | 先作日历依赖基座，后验Calendaria。 |
| [calendaria](https://github.com/Sayshal/Calendaria/releases/latest/download/module.json) | 1.2.0 → 1.4.2 | 3ds-atlas | 需先有3ds-atlas；装后只复查旧日历页启动错误。 |
| [color-picker](https://github.com/Larkinabout/fvtt-color-picker/releases/latest/download/module.json) | 1.7 → 1.8 | 无必需模块 | 逐项核正版/来源和设置，再只验安装、启用及启动错误。 |
| [dfreds-droppables](https://github.com/DFreds/dfreds-droppables/releases/latest/download/module.json) | 6.1.2 → 6.2.1 | 无必需模块 | 逐项核正版/来源和设置，再只验安装、启用及启动错误。 |
| [global-progress-clocks](https://github.com/CarlosFdez/global-progress-clocks/releases/latest/download/module.json) | 1.3.2 → 1.3.3 | 无必需模块 | 逐项核正版/来源和设置，再只验安装、启用及启动错误。 |
| [item-piles](https://github.com/fantasycalendar/FoundryVTT-ItemPiles/releases/latest/download/module.json) | 3.3.4 → 3.3.4 | socketlib, lib-wrapper | 逐项核正版/来源和设置，再只验安装、启用及启动错误。 |
| [multiple-document-selection](https://github.com/ironmonk108/multiple-document-selection/releases/latest/download/module.json) | 14.01 → 14.01 | 无必需模块 | 逐项核正版/来源和设置，再只验安装、启用及启动错误。 |
| [psfx](https://github.com/JimHPerry/psfx/releases/latest/download/module.json) | 0.15.0 → 0.17.0 | 无必需模块 | 逐项核正版/来源和设置，再只验安装、启用及启动错误。 |
| [quickscale](https://github.com/unsoluble/quickscale/releases/latest/download/module.json) | 1.7.0 → 1.7.0 | 无必需模块 | 逐项核正版/来源和设置，再只验安装、启用及启动错误。 |
| [share-media](https://github.com/mech-tools/share-media/releases/latest/download/module.json) | 3.14.2 → 3.14.3 | 无必需模块 | 逐项核正版/来源和设置，再只验安装、启用及启动错误。 |
| [sync-token-actor](https://github.com/kagangtuya-star/sync-token-actor/releases/latest/download/module.json) | 3.1.0 → 3.1.0 | 无必需模块 | 逐项核正版/来源和设置，再只验安装、启用及启动错误。 |
| [z-scatter](https://github.com/elizeuangelo/fvtt-module-z-scatter/releases/latest/download/module.json) | 2.2.4 → 2.3.0 | 无必需模块 | 逐项核正版/来源和设置，再只验安装、启用及启动错误。 |

## 对总计划的修订和剩余门槛

[Server Mirror → ServerNext总计划](../plan/server-mirror-to-server-next.md)须把上述分流写为当前可执行路线，把旧“冷备份/黄金副本/一股脑恢复”步骤标成历史，不能再用于本轮。每个模块记录 `旧版/官方正式版/本地补丁差异/Foundry范围/D&D范围与相关性/依赖/实际来源/安装/开关/重新登录错误`；这九项未齐不得写“已迁”。37项付费继续按现有授权只记录，用户关闭的保持关闭。

待判断本地化：Babele嵌入表格翻译需要本团目标版补丁，除非后续Babele正式版有可复现的原生替代；Simple Cover旧补丁则先以作者2.2.3的同功能源码取代，不重复本地化。其余通用工具不新增本地化需求，若只存在旧设置或依赖缺口则逐项记录。新候选复查：每次操作前重读上表链接的最新正式清单、发行说明、依赖与D&D系统关联；作者若改目标范围或补丁功能，先更新这份判断再动Next。

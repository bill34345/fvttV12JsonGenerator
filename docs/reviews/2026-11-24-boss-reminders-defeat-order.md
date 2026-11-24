# 2026-11-24 Boss 战提醒归零与死亡结算顺序调研

## 实机基线

本地 30002 使用 Core 14.370、dnd5e 6.1.1、Boss 战提醒 0.1.2 和官方 Monster Manual 1.4.0。巴洛炎魔 Balor 的生命值从 287 降至 0，未出现焚身爆 Death Throes 卡。这项特性有一个原生豁免 Activity，激活条件为空。僵尸 Zombie 受到 18 点钝击伤害，生命值从 15 降至 0，未出现不死坚韧 Undead Fortitude 卡。这项特性的条件写在特性描述中，没有 Activity。两次测试均核对了官方原件、世界 Actor 和 Token 特性数据。两份收据分别保存在仓库外 `acceptance/2026-11-24-boss-reminders-official-balor/result.json` 和 `acceptance/2026-11-24-boss-reminders-official-zombie/result.json`。

Boss 战提醒在 `updateActor` 收到已写入的生命值后判断触发。0.1.2 有上述漏报，也没有拦截其他模块抢先标记战败的机制。

## 状态与显示的来源

| 功能 | 已核对的行为 |
| --- | --- |
| Monk’s Combat Details 14.03 | 在 `preUpdateActor` 看到新 HP 后发起自动战败处理。开启自动战败时可以写入参战者的 `defeated`，接着同步死亡状态。启用 `invisible-dead` 时会在状态生效后对适用的场景 Token 写入 `hidden`。 |
| Monk’s Bloodsplats 14.01 | 根据参战者的战败标记或所选死亡状态绘制血迹。依设置可淡出 Token 的图像或禁用点选。Token 图像透明与 `hidden` 是独立状态。 |
| Core 14.370 与 dnd5e 6.1.1 | dnd5e 依据自动施加倒地状态设置可以独立加上死亡状态。Core 判断参战者是否战败时会接受参战者的战败标记或 Actor 的死亡状态。只暂缓 Combat Details 的自动标记仍可能触发这条原生链。 |

两套本地环境安装了相同版本的上述 Monk’s 模块。同期线上清单显示 Combat Details、Bloodsplats 及 Little Details 均启用。安装源码把上述自动判定分配在前两项和系统中。本轮通过线上 GM 界面核对了现行设置，详见下方「线上设置只读核对」。2026-11-09 的线上测试收据与血迹截图确认临时 NPC 被主动标记战败后绘制血迹。实际 0 HP 自动链及与自研卡的结算顺序仍待实测。[Combat Details](https://github.com/ironmonk108/monks-combat-details) · [Bloodsplats 作者说明](https://github.com/ironmonk108/monks-module-wiki/wiki/Monk%27s-Bloodsplats)

## 可比案例与证据边界

- Bill 的实用配置文章描述了在他自己的战斗中，用 Bloodsplats 让战败 Token 淡出并留下血迹，也记录了偶发的显示残留。该案例证明这种消失可以来自血迹模组自己的渲染设置，未覆盖技能结算顺序。[实际使用记录](https://foundrymodules.com/articles/monks-modules.html)
- Nik’s DnD5e Tweaks 的作者以临时保留 1 HP 的方式先结算不死坚韧，再根据结果确定 HP 与死亡流程。可借鉴的是在自动战败之前设置裁定点。该模块的自动掷骰、伤害类型判定和暂时修改 HP 属于其自身做法，本项目待验证的设想是保留真实 0 HP，交由 GM 裁定。[作者实现说明](https://github.com/nschoenwald/niks-dnd5e-tweaks/blob/main/README.md#undead-fortitude-automation)

## 线上启用模块扩展审计

采用 Boss 战提醒上线后 GM 界面导出的模块启用回执（仓库外 `maintenance/2026-11-23-8080-boss-reminders/modules-after.json`），149 个列表项中 91 项启用。为每个启用 ID 匹配了本地 30002 安装包。85 项包含脚本入口，另外 6 项为无脚本入口的资料、汉化或展示内容。扫查死亡/归零、改状态、改透明度、隐藏、删除与相关监听，逐条核对命中代码与运行入口。对照 11 月 19 日线上清单，88 项本地和线上版本相同，其中 85 项 manifest 摘要完全相同。CAT 随后部署到与本地一致的 0.1.9+local.1，另有两个启用项不在 11 月 19 日基线。清单比对确认包身份，历史摘要不是当前每个生产脚本的字节证明。

| 路径 | 条件与后果 | 对 Boss 战提醒的影响 |
| --- | --- | --- |
| dnd5e 6.1.1 / Foundry 14.370 | 系统设置可在战斗中写入死亡或昏迷。Core 把 Actor 的战败状态或参战者的战败标记都当作战败。dnd5e 还可改变死亡 Token 的环颜色。 | 即使只阻止战败标记，死亡状态仍可让下游响应。 |
| Monk’s Combat Details 14.03 | `preUpdateActor` 发现归零时可启动自动标记战败。参战者状态可同步到 Actor 的死亡状态。另有单独的死亡时隐藏开关。 | 战败标记可能在 HP 提醒回调前出现。 |
| Monk’s Bloodsplats 14.01 | 订阅战败标记或指定状态，画血迹、改变 Token 图像透明度，依设置禁用交互或清理 Sequencer 效果。 | 即使 `Token.hidden=false`，图像也可能消失。 |
| Midi-QOL 14.7.0+local.1 | 可独立添加 0 HP 状态、设置战败，另有 Vitality 与死亡豁免路径。也可自动取消对归零目标的选中、结束专注，以及处理 DAE 的 `zeroHP` 时限。独立的召唤清理也可能删除召唤物。 | 归零和死亡副作用涉及不同设置，延后标死不会自动延后效果到期、取消目标或召唤清理。 |
| DAE 14.6.10.1 | 为已配置的效果计算条件或在结束时执行宏。若由 Midi 的 `zeroHP` 到期触发，特定效果可执行收尾宏或通过 `flags.dae.deleteUuid` 删除绑定文档。 | 有一条从 HP 直接走到宏或删除的配置路径。未发现面向普通 NPC 的通用淡出功能。 |
| Chris Premades 2.1.8+local.2 / CAT 0.1.9+local.1 | CPR 绑定到能力上的 `preventDeath` 在伤害阶段可能防止归零，`useOnDeath` 可在新增死亡状态时使用绑定能力。致死的解离术动画可隐藏 Token。CAT 的 `dismissAtZero` 可在 GM 确认后删除自己的召唤物，已配置墙段也能归零拆除。Midi 内有对已配置死亡事件能力的调用。 | 特定生物可能已有自动保命、死亡能力或退场，需要核对单项绑定，避免重复用同一能力。 |
| Monk’s TokenBar 14.01+local.1 / Item Piles 3.3.4+servernext.2 | 战斗结束可开战利品面板。GM 执行转换时，按目的地及选项改变 Token 展示、隐藏原 Token 或转为物品堆。Item Piles 的空堆删除发生在物品堆已建立、且符合清理条件时。 | 属于战后流程，可让战败 Token 消失，但触发点和归零即时处理不同。 |
| 场景自动化、宏与动画 | Monk’s Active Tiles 可按配置隐藏对象或运行宏，自研触发引擎可按 Actor 变化执行绑定宏，Automated Animations 可根据匹配的活动效果播动画。Sequencer 按调用和文档状态播放或结束动画，未查到独立通用归零触发。 | 需按具体 NPC、场景或效果的配置核对。全局模块名单无法给出任意自定义宏的运行结果。 |

其他逐项排查：DFreds 可供 Midi 选作状态来源，AuraEffects 可在 Token 已隐藏时调整光环，Simple Cover 读取战败状态以排除掩护，Hide NPC Names 处理显示名。Automated Evocations 的现有入口处理伴侣操作，未查到通用 HP 归零删除。自研伤势直接标死需要 GM 选择，Fading Spirits 的归零监听可开启记录，不改 Token 显示。Monk’s Little Details 未发现活跃的通用归零处理。Token Magic FX 在线上启用回执中未勾选。资料包与自定义 CSS 中存在各自的场景或展示能力，扫查未发现给任意 NPC 提供通用的归零退场钩子。对具体 Token 的临时宏、场景规则、Actor/Item 效果，将随遇到的对象单独核验。

源码定位：dnd5e `dnd5e.mjs:47120`；Monk’s Combat Details `monks-combat-details.js:550,899,921,971`；Bloodsplats `monks-bloodsplats.js:270,321,536`；Midi-QOL source map 的 `patching.ts:362–475,2462–2507`、`Hooks.ts:54–65`、`utils.ts:1315–1325,2742–2746`、`settings.ts:254–256`、`Workflow.ts:3955–3960` 和 `catMacros/features/auraTurn.mjs:89–97`；DAE `module/dae.js:1021–1077,2412–2424,3105–3146` 与 `module/GMAction.js:160–174`；CPR source map 的 `scripts/macros/generic/useOnDeath.mjs`、`preventDeath.mjs` 和 `scripts/macros/animations/spells/disintegrate.mjs`；CAT source map 的 `scripts/events/actor.mjs:4–9` 和 `scripts/lib/summons.mjs:265–283,382–386`；TokenBar `monks-tokenbar.js:800–823` 和 `apps/lootables.js:719,831–836,934–938`；Item Piles source map 的 `src/API/private-api.js:85–88,1112`；[触发引擎宏执行](../../foundry-modules/fvtt-trigger-engine/src/runtime.ts#L993)。

### 线上设置只读核对

2026-11-24 通过线上 GM 的正常配置界面读取。未改值、保存或触发战斗。实际读回如下。

| 项目 | 当前值及意义 |
| --- | --- |
| Combat Details | 自动战败 = NPC 0 HP，死亡后隐藏 Token = 开启，隐藏战败者侧栏 = 关闭。源码中 NPC 归零模式按非友方 Token 筛选，并要求 Token 有 Combatant。 |
| Bloodsplats | 「显示血迹效果」选择「对玩家隐藏 Token」，死亡状态标识为 `dead`，移除战败特效开启，死亡透明度 0.6，血迹比例 1.5。源码中透明度 0.6 对应 GM 可见的战败图像，玩家侧图像透明。Combat Details 的文档隐藏与此为两个独立机制。 |
| dnd5e | 自动应用倒下状态 = 从不。 |
| Midi-QOL | 归零更新死亡效果 = 不更新，死亡和昏迷效果 = 无，自动标记 PC/NPC 战败 = 都关闭。取消目标 = 掷骰后死亡的目标，对源码中满足 HP≤0 条件的当前目标生效。受伤专注为仅发聊天，失能时移除专注开启。物品失效／专注移除时自动移除 dnd5e 召唤物开启。可选游戏规则总开关关闭。Vitality 的保存值在界面不显示，源码通过总开关读取该规则，当前分支不运行。 |
| TokenBar / Item Piles | 敌人转战利品 = Do not convert；隐藏参战者关闭；Item Piles 自动删除空物品堆关闭。 |
| 自研 Trigger Engine 与其他候选 | 触发器管理器显示尚未配置触发器。CPR 和 Automated Evocations 通用设置中未见针对任意 NPC 的死亡退场开关。特性、效果、召唤、场景或宏自身的绑定需检查具体对象。 |

对常规参战 NPC，当前配置已能解释用户所见的表现。Combat Details 先标记战败并可写 Token 隐藏，Bloodsplats 消费战败或死亡状态，在玩家侧处理血迹与淡出。该结论为设置和源码比对，尚未采集用户当时那只 Token 的写入事件，也没有在线上重演归零。

### 可比使用案例

- 一位 GM 同时使用 Monk’s Combat Details 和 Midi-QOL，发现 0 HP 玩家被提前标死。他关闭了 Midi 的 0 HP 效果开关后解决，随后用另一套触发器实现自己的规则。该案例印证同一世界可有多个标死入口，版本较早且对象为玩家。当前版本以安装源码和设置读回为准。[问题原帖与作者回访](https://www.reddit.com/r/FoundryVTT/comments/14it3lq/why_are_player_characters_automatically_marked_as/)
- 一位 GM 依回帖安装 Item Piles 后恢复了 Monk’s TokenBar 的战利品转换选项。该案例确认两个模块可以协同处理战后尸体，当前安装版本的 Token 隐藏与转换分支已有源码依据。[战利品转换原帖](https://www.reddit.com/r/FoundryVTT/comments/18ssy5d/cant_distrivute_loot_with_monks_token_bar/)
- 有 GM 用 CPR 版本的不死坚韧替换原特性，由 Midi 配合自动豁免。此案例明确需要配置替换，与本项目保留官方生物原数据的前提不同。现行 CPR 的泛用保命与死亡触发代码仍说明同一能力可能已有自动绑定，需防止重复触发。[不死坚韧配置讨论](https://www.reddit.com/r/FoundryVTT/comments/1bu76e7/undead_fortitude_with_midiqol/)

### 兼容验收增补

首批在本地分开启用和组合 dnd5e 自动状态、Combat Details 与 Midi-QOL，再检查 Bloodsplats。另选有 DAE `zeroHP` 效果、已有自动死亡能力和普通战利品对象的用例。逐项记录是 HP、Actor 状态、战斗标记、自动取消目标、真实 Token 显隐、仅图像淡出还是删除，避免只凭画面判定来源。只有严格可识别的集成适用稳定的暂缓和恢复；若存在自定义宏或特定动画导致的绕行，需要具体配置和复现证据。该段记录开工前的验证计划。

## 待判断的兼容范围与复查

用户要求先由 GM 结算「死亡时」及「降至 0 HP 时」的 NPC 特性，再允许自动战败、隐藏和血迹。伤害量、光耀、重击和豁免结果由 GM 裁定。以下保留调研阶段提出的方案。具体裁定与 0.2.0 的实施见下节。

1. 只有识别到对应特性的 NPC 归零后进入待结算。先提示归零特性。GM 裁定存活时结束这次待结算。裁定死亡后，如有死亡特性，先让 GM 处理，再恢复已启用的战败和尸体显示流程。只有死亡特性的 NPC 可在归零时直接给出死亡能力卡，由 GM 结算并确认。
2. 原生 Activity 发起后可能还有放模板、选择目标、等待豁免和应用伤害。建议提供明确的处理完毕与跳过收尾，等待 GM 操作。关闭窗口和推进回合是否影响待结算，由交互讨论确认。
3. 首批候选是 Core/dnd5e 原生状态、Combat Details、Midi-QOL 的自动战败／死亡和 Bloodsplats。Bloodsplats 消费已有状态，能否自然随状态一起延后要实测。对其他自动施加死亡状态的模块只记录已验证范围，兼容状态为 Untested。[模块健康矩阵](../acceptance/foundry-v14-module-health.md)

产品规则确认后，在专用本地世界核实现行设置，并用原样导入的两个官方生物对照。僵尸验证存活与死亡两种裁定，巴洛炎魔验证豁免发起后仍保留 Token 直到 GM 确认。另外用同时具备两类特性的自建 NPC 验证先后顺序，以普通 NPC 对照自动战败未被延误。每个用例检查真实 HP、参战者战败标记、Actor 死亡状态、Token 显隐和血迹。前述 0.1.2 状态为历史基线。

## 0.2.0 实施

用户确认前述四项按建议执行，并明确要求「先留着这两个 Monk’s」「全部做成可选兼容」「用没改过数据的官方巴洛炎魔和 2024 僵尸在本地测，纯原生和带我线上这套模组的都测一遍」。第三方为可选依赖，线上设置未改。

- 正数 HP 降到 0 时识别归零与死亡能力。官方文本里的 `[[lookup @name lowercase]]` 指向能力所有者。归零能力先由 GM 裁定，恢复正数 HP 解除待结算。确认死亡后处理死亡能力，再由 GM 结束。
- 卡片可在 Token 工具栏重开。推进回合保留待结算，结束战斗先提示待结算的怪物。受覆盖的自动状态和战败写入在 GM 确认前暂缓。
- Monk’s Combat Details 14.03 的自动战败入口按对象联动，Bloodsplats 14.01 随已提交状态刷新。已选目标保护覆盖 Midi-QOL 14.7.0+local.1 和 Combat Details 14.03 的自动取消目标调用。DAE 14.6.10.1 延后已识别、会删除待结算 Token 的 `zeroHP` 效果。CPR 2.1.8+local.2 与 CAT 0.1.9+local.1 接入明确绑定的 `useOnDeath`，按对应 Item 去重。

线上模组组合的首轮对照发现，Babele 汉化中使用本体名称引用和中文词组「在死亡时」「因受……伤害而使其生命值减至 0 时」，与原生包暴露的英文描述不同。首轮中文僵尸未建立待结算，此时 Monk’s 正常执行了战败、死亡和隐藏。随后按真实中文句式修正识别，并增加中英文 lookup 与「目标归零」反例测试。修复改动只在 Boss 战提醒。

战斗切回合的浏览器调用链显示，Combat Details 的回合清目标与 Midi-QOL 的归零目标清理独立触发。最初仅兼容 Midi 时，待结算和卡片仍在，但 GM 已选目标被 Combat Details 清除。兼容范围随后补齐该回合自动调用，手动取消目标沿用 Foundry。

## 本地实际结果

环境为 ServerNext 30002、Foundry 14.370、dnd5e 6.1.1、官方 Monster Manual 1.4.0。通过同一专用测试世界中的 GM 页面，先测仅启用 Boss 战提醒和官方内容包的 dnd5e 运行路径，再按线上回执启用准确的 91 个模块并设置相关死亡选项。期间只写测试对象的战斗状态和必要的本地测试设置，官方 Pack 源 Actor、世界导入 Actor 与 Token 上的 Item/Activity 数据保持原样。

| 检查 | 结果 |
| --- | --- |
| 纯原生，原版僵尸 | 归零提示不死坚韧，状态可操作且没有自动死亡。恢复正数 HP 时解除待结算。再次归零后，GM 确认才写死亡与战败。 |
| 纯原生，原版巴洛炎魔 | 归零后弹焚身爆，可继续保持目标并推进回合。实际发起原生豁免活动后仍待结算，点处理完毕才写死亡与战败。 |
| 91 模组组合，原版中文僵尸 | 归零时无死亡、无战败、无隐藏和血迹。GM 选择存活并恢复到 1 HP 时取消退场，另一次归零由 GM 确认后才标死并触发隐藏和血迹。 |
| 91 模组组合，原版中文巴洛炎魔 | 归零提示焚身爆，关闭后可使用 Token 工具栏重开。使用原生活动产生 Midi 聊天消息后仍未退场，点处理完毕才标死、隐藏并显示血迹。最终候选覆盖两条自动清目标调用，再次实测跨回合仍保留目标。 |
| 普通 NPC 对照 | 纯原生时走系统自动死亡，组合下由 Monk’s 按现有设置标死、隐藏并绘制血迹。两种运行方式均未出现额外卡。 |
| 最终构建，纯原生结束战斗 | 两只原版生物同时在 0 HP 待结算时，通过原生结束战斗按钮确认操作。警告列出 Balor 和 Zombie，战斗和两张待结算卡均保留。 |

真实官方用例的退场顺序和目标保护已运行。官方两只生物自身没有专门绑定 DAE 的 Token 删除效果或 CPR 的死亡自动化，这两项适配另外做了受控 V8 逻辑验证，尚无对应绑定的 Foundry 端到端用例。构建、模块测试、Foundry 模块类型检查和手册一致性检查通过。

验收回执保存在仓库外 `acceptance/2026-11-24-boss-reminders-defeat-order/`。最终本地安装浏览器脚本 SHA-256 为 `2730C45B0D0D179800FE201CCB82456EA88C12EEE84D3DFFEF985EA2B4724997`。测试后恢复原模块启用集合及相关设置。全模块启动时由 Calendaria 自动生成的 19 条节日笔记和两个空文件夹，逐项核对创建时间和归属后移除。Midi 设置回写补齐了一个默认空数组，其他记录字段一致。

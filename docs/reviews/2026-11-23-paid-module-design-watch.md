# 2026-11-23 外部付费 Foundry 模块复查

本轮按 2026-09-22 之后的新工具和有实质变化的版本筛选。优先看能减少 GM 台上操作、适合自有模块借鉴的设计。范围包含 Foundry 官方付费目录前 11 页的 552 条目录行、发行方说明、公开 manifest 和社区原帖。目录按最近更新排序，含置顶、素材包、旧包和冒险，552 是扫描行数。AnySearch 用于通用与 Reddit 搜索，个别检索出现 TLS 中断，相关公开资料由网页搜索和发行方直链补核。

目标为 Core 14.370 / dnd5e 6.1.1。两套本地目标的系统清单均读到 6.1.1，30001、30002 的常用对照均已有 Sequencer 4.3.0+local.1、Monk’s Active Tile Triggers 14.01、Midi-QOL 14.7.0+local.1、Vision 5e 3.2.3+servernext.3。下列优先项均未在两套目标的数据目录查到同 ID 清单。旧候选与已有裁定沿用 [9 月评估](2026-09-22-paid-module-evaluation.md#4-分层结论)。本轮仅调研与记录，所有待装候选按 [健康矩阵](../acceptance/foundry-v14-module-health.md) 的 `Untested` 口径理解，矩阵和操作手册无需增项。[Foundry 付费目录](https://foundryvtt.com/packages/premium) · [版本字段说明](https://foundryvtt.com/article/package-management/)

## 已定的下一个自研 Mod

用户原话：“就定这个作为我们的下一个开发mod吧”。这里的“这个”指上一条讨论的 Boss Effect Reminder。项目决定是把 **Boss 战提醒** 定为下一个自研 Foundry Mod，以 FutureHax 的公开演示作为交互参考。“Boss 战提醒”是当前工作名。

首个原生试用版已确认。传奇动作、传奇抗力、巢穴动作、死亡触发和即时浴血响应均使用可点选的 GM 私密弹卡。具体桌上行为、用户原话和开发顺序见[首个原生试用版规格](../plans/2026-11-23-boss-combat-reminders.md)。

用户确认的依赖边界是以原生 dnd5e 为基础，Midi-QOL 作为可选兼容。用户原话：“我们一定要接midi-qol吗？我也觉得我们应该做成一个可选兼容才对”。

### 原版依赖与自研接入证据

- 原版是受保护的付费包，1.3.3 清单要求 dnd5e，Ready Set Roll 系两项标为建议，未声明第三方模块硬依赖。公开演示足以研究提示的时机、内容和操作步骤。购买原版可用来做使用对照，原版在本项目 Midi-QOL 配置下的表现仍未实测。[原版清单](https://r2.foundryvtt.com/packages-public/boss-effect-reminder/module-1.3.3.json) · [作者操作与价格](https://www.reddit.com/r/FoundryVTT/comments/1y2ugqi/dd5e_boss_effect_reminder_legendary_villain_and/)
- 本地 30002 的 dnd5e 6.1.1 源码显示，原生失败豁免卡已有「传奇抗力」操作，调用 NPC 的原生处理，扣一次抗力并给原豁免消息标记改判。自研可复用这一动作，把提示放到 GM 好找的位置。传奇动作可从原生 Activity 使用入口接入。[原生豁免卡源码](https://github.com/foundryvtt/dnd5e/blob/release-6.1.1/module/data/chat-message/save-message-data.mjs) · [原生 NPC 处理](https://github.com/foundryvtt/dnd5e/blob/release-6.1.1/module/data/actor/npc.mjs)
- 本地 Midi-QOL 14.7.0+local.1 源码显示，自动豁免分支有自己的按目标结算记录和豁免完成事件。建议自研包以原生 dnd5e 为基础，启用 Midi 时按其公开工作流适配。实机重点是先确认自动结算前的决策时机，再验证采用传奇抗力后该目标按成功结算伤害和效果，提醒及消耗各一次。仅看原生卡片改判无法证明 Midi 同步改判。[Midi-QOL 的 Activity 与工作流文档](https://github.com/tposney/midi-qol/blob/dnd6/MACROS.md#triggering-workflows)

## 第一批值得借鉴

### Canvas Macros — 机关入口留在地图上

Zhell 的 1.0.0 正式版于 11 月 17 日进入目录。把已有宏拖到场景坐标，形成类似门把手的点击控件。GM 可设外观、透明度、尺寸、Scene Levels 和可用对象。脚本仍以有宏执行权限的客户端运行。对本项目，最有价值的是让玩家看见并能点到一个机关，GM 放置时能看清入口在哪一层、谁能用。一个水闸、祭坛或隐藏暗号就足以比较操作步数。对照 [触发引擎](../../foundry-modules/fvtt-trigger-engine/README.zh-CN.md) 的事件动作和现有 Monk’s Active Tiles，优先比较摆放体验和跨楼层表现。已有真人案例用 Monk’s 的点击 Tile 跑通过三张场景的单玩家切换，发帖人最初会把其他玩家一起拉走，取消场景 Activate 后确认符合预期。案例支持先用已有模块建立基准，版本较早，Canvas Macros 本身暂无同配置独立案例。[模块与配置图](https://foundryvtt.com/packages/canvas-macros) · [初版记录](https://support.metamorphic-digital.com/changelog/canvas-macros) · [真人对照](https://www.reddit.com/r/FoundryVTT/comments/sem8b6)

### Boss Effect Reminder — 在决策时显示可用能力

PC 回合结束，给 GM 私发 Boss 当前可用的传奇动作和剩余点数。Boss 豁免失败且仍有传奇抗力时提示。GM 从卡片点原生 Use 扣点。11 月 7 日的 1.3.2 更新日志明确适配 dnd5e 6.0 的 Item 卡与豁免消息，11 月 11 日 1.3.3 又修过漏提醒。我们已有 [Forge 的原生传奇点数处理](../handbook/modules.json) 和 [开团面板的回合及撤回](../../foundry-modules/open-session-deck/README.zh-CN.md)，所以值得借鉴的是提醒出现的时机、剩余额度和点击后的原生反馈。厂商另有 Villain Actions 共用点数的做法，留在参考产品自己的机制内。6.1.1、Midi-QOL、回合撤回后再次前进以及单次扣点仍待核。厂商演示展示操作链，未找到同版本独立上桌验证。 [模块页](https://foundryvtt.com/packages/boss-effect-reminder) · [更新日志](https://downloads.r2plays.games/futurehax/boss-effect-reminder/CHANGELOG.md) · [作者演示与买断价](https://www.reddit.com/r/FoundryVTT/comments/1y2ugqi/dd5e_boss_effect_reminder_legendary_villain_and/)

同作者的 **Death Effect Reminder** 适合给 Forge 生成的怪物做另一个对照。它把死亡爆炸、复生豁免等容易漏掉的条目并入 Oh You Dead 的同一张提示卡。可按 Item 标记自动识别、强制包含或跳过，有原生 dnd5e 按钮的免费适配器。我们可借鉴由已确认的能力触发一条 GM 提示，保留人工判断。它的产品识别靠文本启发式，中文数据和复杂死亡条件仍是实机复查项。[模块页](https://foundryvtt.com/packages/death-effect-reminder) · [Death Effect Reminder 1.9.2 清单](https://r2.foundryvtt.com/packages-public/death-effect-reminder/module-1.9.2.json) · [dnd5e 适配器](https://foundryvtt.com/packages/death-effect-reminder-dnd5e)

### BLFX Animation Editor Premium — 特效原型可以按动作阶段编辑

3.6.1 公开清单验证到 Core 14.370，可用已注册到 Sequencer 的素材，包括 JB2A。一次并排预览最多六个素材，再给 Item 的 Activity 挑触发时机，例如攻击后、模板放置后。作者还演示了自定义识别配置的保存和跨世界 JSON 导入导出。对现在的特效工作，适合借鉴「同一动作快速比较几个候选、固定播放位置与节奏、单独存绑定」。我们在做的岩石撞击或闪现都可作设计对照。Baileywiki 的 v14 流程公开把 BLFX 列入动画栈并演示战斗动作，资料未标每段实际启用哪一套动画，也未给出 6.1.1 下 BLFX 编辑器的读回。Boss Loot 宣布从 11 月起面向 dnd5e v6 制作新内容，但官方包页编辑器列表仍只列 dnd5e v3–v5。3.6.1 manifest 未写 dnd5e 版本，故精确行为仍待实机核对。[模块与预览](https://foundryvtt.com/packages/boss-loot-assets-premium) · [3.6.1 清单](https://r2.foundryvtt.com/packages-public/boss-loot-assets-premium/module-3.6.1.json) · [作者的导出说明](https://www.patreon.com/BossLoot/posts/blfx-custom-auto-158582493) · [v6 方向](https://www.patreon.com/BossLoot/posts/blfx-reaches-4-172548857) · [Baileywiki 演示](https://baileywiki.com/videos/2026-new-complete-combat-automation-for-d-d-5e-das-automation-suite-foundryvtt-dnd)

### SessionFlow — 把备团资料变成当前场景的操作台

1.2.0 公共清单于 10 月下旬更新。工作流按剧情节点和场景组织，把 NPC、线索、图片、计时器和音频提示放在当前场景的工作区。对玩家可按需亮出材料、时钟或任务。作者展示自己真实 Exalted 战役的王室晚宴准备稿，场景图片、人物和线索的用法可见，素材与写好的内容属于作者战役。另有独立推荐帖提到用组件备团，缺当前版本详细上桌反馈。对我们最值得借鉴的是从 Obsidian 准备稿进入 Foundry 后，当场只看到这幕要用的资料与按钮。与开团面板已有的队伍／战斗操作，以及 Session Monitor 已有的标记／会话导出存在相邻功能，各自的现有数据可作为对照。[真实战役截图与工作流](https://foundryvtt.com/packages/sessionflow) · [1.2.0 清单](https://r2.foundryvtt.com/packages-public/sessionflow/module-1.2.0.json) · [独立用户讨论](https://www.reddit.com/r/FoundryVTT/comments/1rfxanr/what_modules_do_you_guys_love/)

## 有明确用途时再比较

- **Selective Sights and Sounds** 1.7.5。适合幻觉、只有一人能见到的幽灵或私人线索。大家留在一张地图上，GM 分配对象可见性并按玩家预览。当前 Foundry 包页明确展示 Tile、绘图、Token、标记。免费开源的 Perceived Reality 1.2.0 也能做感知分组，还列出光源和门，适合先拿两位玩家做对照。付费版的亮点是按对象分配给单个玩家和预览的操作量。作者演示有据，尚缺 14.370 下两个客户端的独立对照，尤其要核 Vision 5e、重连以及场景楼层切换。作者公开价为 US$9.99 单购，或 First Mate US$10/月。[付费包](https://foundryvtt.com/packages/selective-sight) · [1.7.5 清单](https://r2.foundryvtt.com/packages-public/selective-sight/module-1.7.5.json) · [作者操作与价格](https://www.reddit.com/r/FoundryVTT/comments/1xm5fhl/system_agnostic_selective_sight_show_different/) · [免费方案](https://foundryvtt.com/packages/perceived-reality)
- **Skill Challenge** 1.2.0，11 月 7 日。用 4e 风格走追逐、谈判或仪式，GM 点名，玩家从允许的技能／工具里掷原生检定，双方看共享进度。GM 可撤回上一掷、临时改后续 DC，结束后显示结果。值得借鉴的是可见进度和 GM 控制节奏。成败计数与大成功选项属于该挑战模块的玩法，当前战役的 D&D 2024 裁定独立。dnd5e 5.1+ 是 manifest 最低要求，6.1.1 待验。作者发布有操作图，未取得精确目标成功案例。[模块与操作图](https://foundryvtt.com/packages/skill-challenge) · [1.2.0 清单](https://r2.foundryvtt.com/packages-public/skill-challenge/module-1.2.0.json) · [作者发布帖](https://www.reddit.com/r/FoundryVTT/comments/1xsr99e/dd5e_skill_challenge_4e_style_group_challenges/)
- **MapForge** 1.2.1，10 月下旬。图库分组、批量散布与整笔撤回，布置好的组合可存预制件，Living Objects 可加点击或靠近的交互。TRPG-Maps 可参考前两项怎样从散装资产快速摆出一小片市场，战场画笔可参考整笔撤回的操作粒度。作者展示了地图制作与模块早期反馈，14.370 下运行及导入现有素材的损耗尚待确认。Core 最低与验证均为 14，建议 FXMaster，英语／葡萄牙语，走 Wand & Widgets Patreon。其可复查案例是发布者实际演示，暂未核到同版独立用户的可重做步骤和成品对照。[模块与演示](https://foundryvtt.com/packages/mapforge) · [1.2.1 清单](https://r2.foundryvtt.com/packages-public/mapforge/module-1.2.1.json) · [发布原帖](https://www.reddit.com/r/FoundryVTT/comments/1spey55/system_agnostic_i_spent_months_building_a/) · [我方战场画笔](../../foundry-modules/fvtt-battlefield-painter/README.zh-CN.md)
- **VTT Deck Premium** 1.3.2。硬件上把队伍 HP、先攻与环境场景做成即时键，开战自动切到战斗页。可以参考上下文切换，实际引入的价值取决于是否用 Stream Deck。已有开团面板负责 HP、状态和先攻。Core 13+／验证 14，需免费模块 1.5.1+ 和硬件插件。**Smart Combat NPC** 1.0.2 可设 NPC 行为与中途接管，付费档公告 US$3/月。其 manifest 强依赖 Midi-QOL，缺 dnd5e 6.1.1 证据，接管、目标选择及修改原生文档的面较大，优先级较低。[VTT Deck 清单](https://r2.foundryvtt.com/packages-public/vtt-deck-premium/module-1.3.2.json) · [VTT Deck 操作说明](https://www.reddit.com/r/FoundryVTT/comments/1xw7zog/vtt_deck_premium_is_out_initiative_party_hp/) · [Smart Combat NPC 清单](https://r2.foundryvtt.com/packages-public/smart-combat-npc/module-1.0.2.json) · [作者发布与定价](https://www.patreon.com/LenexTL/posts/smart-combat-npc-165490904)
- 老候选只记本轮差异。Enhanced Inventory 1.6.0 的清单仍只验证 dnd5e 5.3.3。高热度对照只留一项，TheRipper93 的 Mastercrafted／Gatherer 新增以原生 Regions 定义工作台和采集点，若将来做现场采集可借用「工作台有场景位置」的思路。[Enhanced Inventory 清单](https://r2.foundryvtt.com/packages-public/enhanced-inventory/module-1.6.0.json) · [Mastercrafted／Gatherer 作者更新](https://www.reddit.com/r/FoundryVTT/comments/1xtiq8v/mastercrafted_gatherer_big_update_premiumagnostic/)

## 待判断本地化

价格和人数为本轮公开来源。Graphtreon 可见 Wand & Widgets 616 位付费会员、Boss Loot 732 位，均落在旧评估的中等区间，这是作者级数据。Canvas Macros 和 FutureHax 的模块销量／活跃安装量未取得可比数值。市场商品页未能核实 Canvas Macros 实际结算价，Patreon 当次公开会员页也未显示另外两家的有效档价。下列付费候选清单均声明保护，已核对清单并读本机文件目录，离线授权与运行在将来获准试装后才能判断。[Wand & Widgets 热度](https://graphtreon.com/creator/WandAndWidgets) · [Boss Loot 热度](https://graphtreon.com/creator/BossLoot) · [Foundry 授权说明](https://foundryvtt.com/article/premium-content/)

| 判断顺序 | 公开版本和获取 | 汉化及依赖 | 最小验收样本 |
| --- | --- | --- | --- |
| 1. Canvas Macros | [1.0.0](https://sigil-fvtt.s3.amazonaws.com/canvas-macros/module-1.0.0.json)，Core 最低 14.367，验证 14，跨系统，Marketplace 单品 | 清单仅英语，无硬依赖。借鉴时比较现装 Monk’s Active Tiles | 两层场景放同位置控件，GM 与普通玩家各点击一次，读回所在层、执行者和结果。 |
| 2. Boss Effect Reminder | [1.3.3](https://r2.foundryvtt.com/packages-public/boss-effect-reminder/module-1.3.3.json)，Core 13–14，验证 14。dnd5e 最低 4.0，更新日志有 6.0 卡片支持。US$9.99 单购，或 First Mate US$10/月 | 清单仅英语，建议 Ready Set Roll 或 RSR Reforged，现有栈为 Midi-QOL。死亡提醒另依赖 Oh You Dead，原生按钮再加 dnd5e 适配器 | PC 回合结束后提示一次，Boss 首次失败豁免后提示传奇抗力，执行时核对剩余值和私密可见性，回合撤回再前进后复核。 |
| 3. BLFX | [3.6.1](https://r2.foundryvtt.com/packages-public/boss-loot-assets-premium/module-3.6.1.json)，Core 14–14，验证 14.370，Boss Loot Patreon | 内置 `zh-CN`。依赖 Sequencer、两套 BLFX Assets，保留现有特效绑定作为对照 | 一种单体攻击和一种范围模板，各挂一次动作效果。预览、播放、关闭自动识别与刷新读回，确认播放次数和时机。 |
| 4. SessionFlow | [1.2.0](https://r2.foundryvtt.com/packages-public/sessionflow/module-1.2.0.json)，Core 13+／验证 14，跨系统，Wand & Widgets Patreon | 清单仅英语，无硬依赖，Narrator’s Jukebox、Exalted Scenes 为可选扩展 | 一幕备团只放一个 NPC、一条私密线索和一张可出示图，核对 GM 取用步骤和玩家视图。 |
| 5. Selective Sights and Sounds | [1.7.5](https://r2.foundryvtt.com/packages-public/selective-sight/module-1.7.5.json)，Core 13–14／验证 14，跨系统。US$9.99 单购，或 First Mate US$10/月 | 清单仅英语，建议 Player Perspective。先与免费 Perceived Reality 对照 | 一人可见的 Tile／Token／Note，两名玩家测试重连及切层，核对实际画面与 GM 预览。 |

## 下一轮复查入口

1. 从 [官方付费目录](https://foundryvtt.com/packages/premium) 与发行方更新查新增模块、重要版本，记录精确 ID，再对照本页及 [9 月基准](2026-09-22-paid-module-evaluation.md#5-待办清单)。目录里冒险和资产仍可提供设计例子，本轮优先选以操作行为为主要卖点的工具。
2. 用 [八步清单](2026-09-22-paid-module-evaluation.md#6-复查清单每个新候选都要走这-8-步) 读公开 manifest、发行日志、中文字段、依赖、计价与热度，核对实际本机版本和同领域已装模块。优先找独立玩家实操及失败复现，发行者演示标明身份。
3. 经授权开展对应的最小样本，记录实机可见结果、关闭付费模块时的影响、许可证与本地运行情况。达到验收范围后再回填健康矩阵和用户手册。保留以中文跑团中的操作步数、看懂反馈和避免重复结算作为比较依据。

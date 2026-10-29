# 副屏与原生先攻栏的能力对照

2026-10-27。用户要求以现成 FVTT 原生面板为参照，自行核查数值修改、排序、显示隐藏、战败、指示物标记及投先攻能力。本轮为核查记录，不代表缺失功能已经实现，也不改变既有 R17 完成收据。

## 当前目标与证据

- 本任务 worktree：`20261026-164419-next606-deck-splitter`；原生 MCP `foundry_next.get_world_info` 实际读回 `localhost:30002`、`cor-cotn`、Core14.368、dnd5e6.0.6，当前一名 GM 在线，PID39696复用。
- 官方 Chrome3 复用本任务主页651352023及副屏651352163，检查原生先攻栏、原生参战者右键菜单、选中NPC后的副屏动作与遭遇工具；没有投骰或写入角色／战斗数据。可见证据保存在 `.local/status-alignment-20261027/r18-native-combat-audit/`。
- 精确版本原生实现：`F:/FoundryLab/foundry-v14/app/14.368/client/applications/sidebar/tabs/combat-tracker.mjs`、`client/documents/combat.mjs`、`client/documents/combatant.mjs`、`templates/sidebar/tabs/combat/tracker.hbs`；系统实现为本机6.0.6的`dnd5e.mjs`中`CombatTracker5e`。
- 官方说明经 AnySearch 原文读取：[Combat Encounters](https://foundryvtt.com/article/combat/)。说明含历史截图，具体当前行为优先对照上述精确源码及当前界面。

## 逐项结论

| 用户关注 | 当前副屏 | 与原生的差异 |
|---|---|---|
| 直接修改先攻 | 已有；先攻列为数字输入，调用`Combat.setInitiative` | 外观接近只读文字，缺少明显编辑提示；不能用空输入清除先攻，也不支持原生的增减输入语法 |
| 拖动调整顺序 | 没有；遭遇工具提供选择两名参战者交换先攻值 | 当前本机Core及dnd5e tracker没有拖动重排实现；若增加拖动，属于便捷增强，不能称为已接通原生拖动 |
| 对玩家隐藏／显示 | 选中非队伍成员后有眼睛按钮，更新`Combatant.hidden` | 队伍成员的入口被模板省略；隐藏整个参战者条目，不是仅隐藏先攻数字，也不是隐藏地图Token |
| 快速标记战败 | 未接入专用操作，也未投影`Combatant.isDefeated` | 原生同时更新参战者`defeated`和Actor对应战败覆盖效果；普通死亡状态或HP为0不能代替该操作 |
| 指示物标记 | 只有平移定位，没有原生`Ping Token` | 原生调用`canvas.ping(token.center)`，要求当前画布／场景相符及权限；当前战斗不在正在查看的场景，因此现场原生也不显示Ping按钮。对原生标记能力已独立核查，不再要求用户解释现有按钮 |
| 单个投先攻 | 选中非队伍成员后显示“私密投先攻” | 队伍成员无该按钮；调用固定`gmroll`，还会先把NPC条目隐藏，与原生普通单个投骰行为不同；dnd5e原生按钮另接系统投骰设置窗口 |
| 一键为NPC投先攻 | 遭遇工具已有“为NPC投先攻” | 只处理尚无先攻值者；现按`actor.type === npc`筛选，原生按`Combatant.isNPC`即是否无玩家所有者判断；现实现同时强制私密投骰和隐藏NPC条目 |

现有实现定位：`foundry-modules/open-session-deck/src/templates/deck.hbs`第31–35行、`src/dnd5e-adapter.ts`第356–385行、`src/tracker-privacy.ts`。其中`unless partyMember`控制了单个投骰／可见性入口；现有“交换先攻”不能描述成拖动排序。

原生右键菜单现场还包括更新参战者、清除先攻、重掷先攻、移除参战者；源码另有按条件出现的清除移动记录。原生全局还有全部掷骰、NPC掷骰、重置先攻、轮次切换和遭遇管理。当前副屏未完整接入这些能力，已有上一／下一回合不能代表原生全量覆盖。

## 待实现判断

建议保留记录夹布局，在参战者行提供清晰的编辑、投骰、隐藏显示、战败和指示物标记入口；跨场景标记按原生条件禁用并说明原因。全局投骰放在容易发现的位置，明确“为尚未投骰者投掷”和“重新投掷”的区别。拖动排序需定义改变实际先攻值还是只交换两人，再接入共享撤回。涉及显示隐藏和投骰的旧隐私约定应对照确认，不把本轮核查自动解释为已批准改掉原隐私策略。

本轮没有修改产品源码、重跑 R17 测试或改变生产；未把代码存在、历史原生数据验收和本轮只读入口核查混称为全功能实机验收。

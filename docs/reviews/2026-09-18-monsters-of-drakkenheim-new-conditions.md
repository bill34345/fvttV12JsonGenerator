# Monsters of Drakkenheim 条件整理

> 范围：整理《Monsters of Drakkenheim》Appendix C 的 Conditions 条目，记录规则效果，并用怪物特性说明这些状态在 stat block 中如何出现。本文只做规则与示例整理，不定义 FVTT 自动化实现。
>
> 版本说明：Appendix C 当前索引列出 22 个条件。Bloodied 在 2024 D&D Rules Glossary 中也有定义；Burning 在 2024 官方规则内容中也有对应概念。这里保留它们，是因为《Monsters of Drakkenheim》仍把它们纳入自己的 Conditions 条件包，并在怪物 stat block 中直接引用。

## 条件表

| Condition | 中文工作名 | 效果摘要 | 解除、参数与实现语义 | 怪物特性示例 |
| --- | --- | --- | --- | --- |
| **Addled** | 心智混乱 | Intelligence、Wisdom、Charisma 的攻击检定、属性检定与豁免检定具有劣势。 | 没有统一解除规则，持续时间由施加它的具体特性决定。 | **Eldritch Dreg, Hazewarp Hex**：失败后可令目标获得 Addled、Clumsy、Enfeebled 或 Sickened 之一。 |
| **Bewildered** | 迷乱 | 不能施法，仅可施放施法时间为 1 Action 的 cantrip。 | 通常由来源写明 `save ends` 或固定持续时间。 | **Gravekeeper, Dispelling Blast**：失败后目标受到 Psychic 伤害，身上的魔法效果结束，并获得 Bewildered，豁免成功结束。 |
| **Bleeding [X]** | 流血 [X] | 每个自身回合结束时失去 X 点生命值。这里使用的是 **lose Hit Points**，语义上不等同于普通伤害。 | 恢复任意生命值后结束。自己或 5 ft 内另一生物可花 1 Action 并使用 medicine kit 止血，无需检定。X 可以是 `2d4`、`4d4` 等任意表达式。 | **Ascendant Vladimir von Drakken, Bloodmourne**：命中后给予 **Bleeding 4d4**。公开 Beta 中 **Scissorhand** 也会给予 **Bleeding 4d4**。 |
| **Bloodied** | 濒血 / 重伤 | 当前生命值不高于生命值上限的一半时，即处于 Bloodied。 | 这是根据 HP 自动成立或解除的阈值状态。2024 core 也使用 Bloodied 术语。 | **Garmyr, Feast**：可对 Bloodied 目标追加 Bite。许多 Epic Boss 也有“becomes Bloodied”触发的 Reaction。 |
| **Burning [X]** | 燃烧 [X] | 每个自身回合结束时受到 X 所指定的伤害，X 同时包含骰式与伤害类型，例如 `2d6 Fire` 或 `2d4 Acid`。 | 自己或 5 ft 内另一生物可花 1 Action 扑灭火焰或刮除酸液；浸水等合适环境效果也可结束。 | **Crystalline Dreg, Refracted Beam**：当伤害被折射为 Acid 或 Fire 时，目标同时获得 **Burning 2d6** 对应伤害类型。 |
| **Clumsy** | 笨拙 | Dexterity 的攻击检定、属性检定与豁免检定具有劣势。 | 没有统一解除规则，跟随来源持续时间。 | **Eldritch Dreg, Hazewarp Hex**：可在 Addled、Clumsy、Enfeebled、Sickened 中选择一种施加。 |
| **Contamination** | 污染 | 累积型 1 至 6 级状态。1 级无症状；2 级短休消耗 Hit Dice 恢复的 HP 减半；3 级长休结束不恢复 HP；4 级获得 Weakened；5 级获得 Dazed；6 级触发 Monstrous Transformation。获得污染等级时还会按规则检查 mutation。 | 通常只能通过指定魔法或专门效果降低。降至 0 时条件结束。它应保存“等级”，不能只用普通布尔状态表示。 | **Haze Wight, Contaminated Blast**：目标第一次在一回合中被命中时，失败会获得 1 级 Contamination。 |
| **Dazed** | 恍惚 | 自己回合中只能在“移动”和“执行 Action”之间选择一个，并且不能执行 Bonus Action。 | 通常由来源给出固定时长或 `save ends`。 | **Chitter, Chitter**：失败后目标获得 Dazed，持续到 Chitter 下一回合结束。 |
| **Defenseless** | 无防备 | 对你的攻击检定具有优势。 | 没有统一解除规则，跟随来源。 | **Lenore, Octarine Wall**：穿过第二层失败时，目标获得 Contamination 并同时获得 Defenseless。 |
| **Distracted** | 分心 | 不能执行 Reaction。 | 公开 Beta 曾写作 “Distracted or Unreactive”。持续时间由来源决定。 | **Bloated Hive, Distracting Swarm**：令 5 ft 内目标直到其回合结束前不能执行 Reaction，机械效果与 Distracted 相同。 |
| **Drakkenheim Madness** | 德拉肯海姆疯狂 | 获得一项 Drakkenheim Madness 特质。规则表提供 10 种妄想或行为倾向，没有统一的数值减益。 | 具体持续时间由造成 Madness 的来源决定。实现时更适合保存随机表结果，而非单一数值。 | **Ancient Delerium Dragon, Order Over Chaos**：当场上需要在 Drakkenheim Madness 表上掷骰时，龙额外掷一次并选择采用哪个结果。 |
| **Enfeebled** | 衰弱 | Strength 的攻击检定、属性检定与豁免检定具有劣势。 | 没有统一解除规则，跟随来源。 | **Belfray, Bite**：命中后目标获得 Enfeebled，持续到 Belfray 下一回合结束。 |
| **Frozen [DC X]** | 冻结 [DC X] | 同时获得 Immobilized 与 Defenseless；对于使用造成 Bludgeoning 伤害武器的攻击，还视为 Helpless。 | 自己或另一生物可花 1 Action，进行 Strength (Athletics) 对抗标注 DC，成功结束。累计受到 20 点 Bludgeoning 或 Fire 伤害也结束。 | **Ice Troll, Freezing Breath**：失败后受到 Cold 伤害并获得 **Frozen, escape DC 15**。其 Bite 暴击也可造成相同 Frozen。 |
| **Helpless** | 无助 | 任何命中你的攻击都算 Critical Hit。 | 没有 5 ft 限制，条件本身只要求攻击命中。持续时间由来源决定。 | **Lenore, Octarine Wall**：穿过第三层失败时，目标获得 3 级 Contamination 并同时获得 Helpless。 |
| **Immobilized** | 定身 | Speed 变为 0，且不能受益于任何速度加值；飞行中获得该状态会坠落。 | 没有统一解除规则，跟随来源。 | **Striga, Blood Howl**：失败后同时获得 **Jinxed 1d6** 与 Immobilized，成功豁免可结束两者。 |
| **Jinxed [X]** | 厄运 [X] | 每次进行攻击检定或豁免检定时，额外掷 X 指定的骰，并从结果中减去该骰值。 | X 是参数，例如 `1d6`、`1d8`。来源通常决定是否可豁免结束。 | **Striga, Blood Howl**：失败后给予 **Jinxed 1d6** 与 Immobilized。公开 Beta 的 **Last Memory** 也可造成 Jinxed 1d6。 |
| **Shocked** | 电击 / 震慑 | 同时视为 Dazed 与 Defenseless；立刻掉落手中物品；之后要拿起、收起或拔出物品都必须花 1 Action。 | 复合状态，自动继承 Dazed 和 Defenseless 的所有规则。持续时间跟随来源。 | **Minazorond, Lightning Breath**：失败后受到 Lightning 伤害并获得 Shocked。 |
| **Sickened** | 病弱 | Constitution 豁免检定具有劣势。 | 没有统一解除规则，跟随来源。 | **Tanker, Chemical Stench**：在其附近开始回合并豁免失败，会获得 Sickened，持续到下一回合开始。 |
| **Slowed** | 减速 | Speed 减半。 | 只处理速度倍率，额外限制由施加来源另外说明。 | **Ice Troll, Bite**：命中后令目标 Slowed，持续到 Troll 下一回合结束。 |
| **Staggered** | 踉跄 | 自己回合内最多只能进行一次 weapon attack，不受额外攻击次数、法术或魔法物品影响。 | 限制的是 weapon attack 数量。 | **Bigger Linda, Stomp**：失败后目标获得 Staggered，豁免成功结束。 |
| **Valor [X]** | 英勇 [X] | 将条件指定的骰加入攻击检定与豁免检定。公开 Beta 示例值为 `1d4`，当前条件名保留 `[X]` 参数形式。 | X 应作为骰式参数保存，而不是写死在状态本体。 | **Faction Squire, Helping Hand**：给予 5 ft 内一个生物 Valor，持续到该生物下一回合结束。 |
| **Weakened** | 虚弱 | 武器攻击与法术造成的伤害减半。 | 影响 damage dealt。不要把它实现成攻击检定劣势。 | **Ratling Oracle, Death Toll**：失败后受到 Necrotic 伤害，并获得 Weakened，豁免成功结束。 |

## 对 FVTT 数据化最关键的字段

这张表后续如果转成固定 Status Effect 数据，至少要保留三类信息：

1. **纯布尔状态**：Addled、Bewildered、Dazed、Defenseless、Distracted、Enfeebled、Helpless、Immobilized、Shocked、Sickened、Slowed、Staggered、Weakened。
2. **参数化状态**：Bleeding `[X]`、Burning `[X]`、Frozen `[DC X]`、Jinxed `[X]`、Valor `[X]`。这些状态必须把骰式、伤害类型或 DC 作为实例数据保存。
3. **派生或分级状态**：Bloodied 从 HP 阈值派生；Contamination 保存等级；Drakkenheim Madness 保存具体随机表结果。

## 怪物数据中的本地交叉样本

当前仓库已有一些转换数据可以用于之后验证生成链路：

- `obsidian/dnd数据转fvttjson/input/light-devourer__噬光鮟鱇.md`：Bleeding `2d6`。
- `obsidian/dnd数据转fvttjson/input/scuttling-serpentmaw__蛇口蛮蟹.md`：Bleeding `1d6`，并有针对 Bloodied 目标的交互。
- `obsidian/dnd数据转fvttjson/input/corrupted-giant-shark__腐化巨鲨.md`：Bloodied 触发和 Dazed。
- `obsidian/dnd数据转fvttjson/input/alyxian-aboleth__底栖魔鱼“阿利克辛”.md`：Dazed。

其中本地 `light-devourer` 文本当前把 Bleeding 写成“回合开始时”触发，而《Monsters of Drakkenheim》公开规则文本是“自身回合结束时”结算。后续若将 Drakkenheim Bleeding 作为固定规则实现，应以选定的正式规则来源为准，并单独处理这些既有本地转换文本的版本差异。

## 参考来源

- D&D Beyond, *Monsters of Drakkenheim* source index: <https://www.dndbeyond.com/sources/dnd/modr>
- D&D Beyond Marketplace, *Monsters of Drakkenheim*: <https://marketplace.dndbeyond.com/beyond-digital/DB4KDB0Q1>
- Foundry VTT official package listing, *Monsters of Drakkenheim*: <https://foundryvtt.com/packages/drakkenheim-monsters>
- RuneRollers book index, Appendix C condition list: <https://runerollers.com/apps/platform/library/books/monsters-of-drakkenheim-monstersofdrakkenheim>
- Publicly indexed *Monsters of Drakkenheim* beta text used for effect wording and monster examples: <https://www.scribd.com/document/873137275/Drakkenheim-Monsters-of-Drakkenheim-Beta>
- Dungeon Dudes, April 2025 Eldritch Experiment appendix, used to cross-check Burning, Dazed, Defenseless, Frozen, Immobilized, and Shocked wording.

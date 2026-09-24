# Drakkenheim 自定义状态文案核对（2026-09-23）

> 后续变更：2026-09-24 起，本项目按用户决定把自定义 Dazed 改为「自主移动／动作／附赠动作三选一」，Shocked 继承该规则。本页记录的是当时的 Beta 文本与旧实现对照；当前规则和验收以[三选一变更记录](2026-09-24-dazed-three-choice-rule.md)为准。

## 证据范围

[D&D Beyond 的《Monsters of Drakkenheim》目录](https://www.dndbeyond.com/sources/dnd/modr)确认正式书的 Appendix C 含有 Conditions，但公开目录不提供该章逐条规则全文。本轮可逐字核对的条件规则来自[公开流传的 Beta 文本](https://www.scribd.com/document/873137275/Drakkenheim-Monsters-of-Drakkenheim-Beta)。因此下述 Frozen、Shocked、Valor 等措辞是对 **Beta 规则与本项目既有实现**的说明修订，不宣称已与正式版 Appendix C 全文逐条核对。将来取得正式正文后，应复核并修订差异。

## 本轮判断

| 条目 | 文案决策 | 边界 |
| --- | --- | --- |
| Shocked | 中文工作名改为「震愕」。复合效果直接写出 Dazed 的移动或动作二选一、不可使用附赠动作，Defenseless 的受攻击优势，以及掉落手持物品、拿取／拔出／收起物品各需动作。 | 「电击」容易误导为只由闪电伤害造成。Beta 的状态定义描述行为与防御损失，并非一种伤害类型；「震愕」是项目的语义翻译，不声称为官方中文译名。 |
| Frozen | 直接写出 Immobilized 的速度 0、无速度加值及飞行坠落，Defenseless 的受攻击优势。重击限于**使用造成钝击伤害的武器**攻击冻结目标而命中的情况。 | “造成钝击伤害”单独不足以触发该重击条款，法术和徒手攻击不能只因伤害类型是钝击就算在内。另可通过标注 DC 的力量（运动）检定或达到该实例累计钝击／火焰伤害阈值解除；阈值默认 20，但可由实例参数修改。后一个解除途径不要求伤害来自武器。 |
| Valor [X] | 与 Jinxed [X] 采用对称句式：攻击检定或豁免检定时额外掷 X，并将结果**加**到检定结果。 | X 保留实例骰式，不在状态文案写死 1d4。 |
| Weakened | 写明武器攻击或法术伤害**总值**减半，结果向下取整。 | [2024 基本规则的 Round Down 条目](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary)规定除乘后得到小数时向下取整。本轮只修正文案；运行时核对由本任务其他分支完成。 |
| Dazed | HUD 的状态标题只显示「恍惚」或 Dazed；内部状态 ID 仍为 `fvtt-custom-conditions.dazed`。 | 不借可见后缀区分另一模组的裸 `dazed`，由 ID 区分。 |
| Staggered | 文字改为自己的回合最多进行一次**武器或徒手攻击**；运行时按 dnd5e Attack Activity 的 `attack.type.classification` 统计已完成的攻击骰，并在活动使用及攻击骰预处理两个入口拦截下一次。 | 此项是用户要求的项目扩展，超出已可核对的 Beta 原文（仅 weapon attack）。锁定的 dnd5e 5.3.3 源码 `module/data/activity/attack-data.mjs` 与夹具 `packs/_source/equipment24/weapons/unarmed-strike.yml` 将 `unarmed` 和 `weapon` 分类区分；非攻击活动和 `spell` 分类不计。持久计数字段沿用 `weaponAttacks`，不迁移旧回合状态。 |

[2024 基本规则](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary)将武器和徒手打击分别列出，徒手打击条目明确以“不使用武器”描述。对于被规则明确指定为武器的天生武器，[官方 Sage Advice Compendium](https://www.dndbeyond.com/sources/dnd/sac/sage-advice-compendium)则将其视为武器。这解决了 Frozen 文字上的边界；Foundry 具体活动是否能被识别为武器，仍需针对目标 dnd5e 版本的活动数据单独验收，不能仅凭文案断言自动覆盖所有天生武器。

## 后续复核

1. 取得正式版 Appendix C 后，对照 Frozen、Shocked、Valor、Weakened 的原文及解除条款，更新本表和模块文案。
2. 如目标世界将天生武器表示为非 `weapon` 类型的 Foundry Item，测试 Frozen 自动判定是否遗漏；此项属于运行规则核对，不通过扩大文案范围来掩盖。
3. 在 CoTN 的实际 Token Action HUD 核查中英文切换、状态标题和换段；静态测试不等于浏览器视觉验收。

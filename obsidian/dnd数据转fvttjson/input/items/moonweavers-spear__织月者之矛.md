---
layout: item
名称: 织月者之矛
英文名: MOONWEAVER'S SPEAR
类型: 武器
稀有度: 稀有
require-attunement: true
item-mechanics:
  schemaVersion: 1
  uses:
    max: 3
    recovery:
      - period: dawn
        type: recoverAll
  abilities:
    - id: moonlight
      name: 月光
      kind: light
      activation: bonus
      consumption: 0
      bright: 10
      dim: 20
      extinguish: disable-effect
    - id: moonweavers-touch
      name: 织月者之触
      englishName: Moonweaver's Touch
      kind: save
      activation: action
      consumption: 1
      scale-consumption: true
      scale-max: 3
      dc: 15
      ability: con
      outcome: half
      range:
        value: 30
        units: ft
      target:
        type: creature
        count: 1
        special: 你能看见的生物
      duration:
        value: 1
        units: minute
        concentration: true
      damage:
        formula: 2d8
        type: radiant
        scaling:
          mode: whole
          number: 2
      description: >-
        豁免失败时，目标还会变形成一只由你选择的、挑战等级0的微型野兽，持续1分钟，如同受到变形术（Polymorph）影响；此期间你需要维持专注，如同你专注一个法术一般。目标可以在自己的每个回合结束时重复该豁免，成功则提前结束自身受到的变形效果。

---

## 织月者之矛（MOONWEAVER'S SPEAR）

*武器（长矛），稀有（需要同调）*

这柄魔法长矛散发着微弱的银色光芒。

当你手持这柄长矛时，可以使用一个**附赠动作**，令其散发：

- 半径10尺的明亮光照；
- 再向外10尺的微光光照。

你也可以使用附赠动作熄灭这些光芒。

### 织月者之触（Moonweaver's Touch）

长矛拥有 **3发充能**，并在每天黎明时恢复所有已消耗的充能。

当你手持长矛时，可以使用一个动作并消耗**1发或更多充能**，向你能看见的30尺内一个生物射出一道月光。

目标必须进行一次 **DC 15 体质豁免**。

每消耗1发充能：

- **豁免失败：**受到 **2d8光耀伤害**；
- **豁免成功：**受到一半伤害。

如果豁免失败，目标还会变形成一只由你选择的、**挑战等级0的微型野兽**，持续1分钟，如同受到 *变形术（Polymorph）* 影响，而此期间你需要维持专注，如同你专注一个法术一般。

目标可以在自己的每个回合结束时重复该豁免，成功则提前结束自身受到的变形效果。


> GM 辅助边界：失败后的受限变形及每回合结束重复豁免由 GM 按上述原文处理；此物品不提供独立的免费《变形术》施放。

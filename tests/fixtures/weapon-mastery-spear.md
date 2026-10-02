---
layout: item
名称: 试验长矛
英文名: Test Spear
类型: 武器（长矛）
原生精通: graze
weapon-properties:
  schemaVersion: 1
  enabled: true
  mastery: native
  grantMastery: false
  rules:
    - ruleId: house.deadly
      kind: deadly
      label: Deadly d8
      params:
        dice: 1
        die: 8
      stackingGroup: house.deadly
item-mechanics:
  schemaVersion: 1
  abilities:
    - id: spear-attack
      name: 长矛攻击
      englishName: Spear Attack
      kind: attack
      attackType: mwak
      toHit: 5
      range: reach 5 ft.
      damage:
        formula: 1d6
        type: piercing
---
## 试验长矛（Test Spear）

这是一把用于生成链验收的长矛。

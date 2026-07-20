---
名称: 佩利诺斯特神甫Parson Pellinost
类型: npc
体型: 中型
生物类型: 类人生物
生物类型备注: 任意种族
阵营: 任何阵营
能力:
  力量: 10
  敏捷: 10
  体质: 12
  智力: 13
  感知: 16
  魅力: 13
护甲等级: 13
生命值: 27 (5d8 + 5)
速度: 步行 30 尺
熟练加值: 2
挑战等级: 2
经验值: 450
技能:
  医药: 7
  游说: 3
  宗教: 5
感官:
  被动察觉: 13
语言备注: 任意两种语言
传记: |-
  N.B. 佩利诺斯特佩有一只假肢Prosthetic limb(右手)。

  护甲等级：13（链甲衫）
施法属性: wis
施法者等级: 5
法术位:
  "1": 4
  "2": 3
  "3": 2
法术清单:
  schemaVersion: 1
  manifestId: intake-c883dbb17d987116-parson-pellinost-spellcasting-1-1393
  sourceSha256: c883dbb17d987116c8bab77935835722b37f02eec90a07cabe79782d915ef528
  rulesPreference: "2024"
  spellcastingGroups:
    - groupId: spellcasting-1
      featureItemKey: spellcasting-1
      ability: wis
      saveDc: 13
      attackBonus: 5
      spellRefs:
        - refId: light
          identifier: light
          originalName: 光亮术light
          englishName: light
          chineseName: 光亮术
          aliases: []
          method: at-will
          ignoresMaterialComponents: false
          restrictions: []
          evidence:
            - start: 1479
              end: 1487
              quote: 光亮术light
        - refId: sacred-flame
          identifier: sacred flame
          originalName: 圣焰sacred flame
          englishName: sacred flame
          chineseName: 圣焰
          aliases: []
          method: at-will
          ignoresMaterialComponents: false
          restrictions: []
          evidence:
            - start: 1489
              end: 1503
              quote: 圣焰sacred flame
        - refId: spare-the-dying
          identifier: spare the dying
          originalName: 维生术spare the dying
          englishName: spare the dying
          chineseName: 维生术
          aliases: []
          method: at-will
          ignoresMaterialComponents: false
          restrictions: []
          evidence:
            - start: 1505
              end: 1523
              quote: 维生术spare the dying
        - refId: command
          identifier: command
          originalName: 命令术command
          englishName: command
          chineseName: 命令术
          aliases: []
          method: prepared
          castingLevel: 1
          ignoresMaterialComponents: false
          restrictions: []
          evidence:
            - start: 1532
              end: 1542
              quote: 命令术command
        - refId: cure-wounds
          identifier: cure wounds
          originalName: 疗伤术cure wounds
          englishName: cure wounds
          chineseName: 疗伤术
          aliases: []
          method: prepared
          castingLevel: 1
          ignoresMaterialComponents: false
          restrictions: []
          evidence:
            - start: 1544
              end: 1558
              quote: 疗伤术cure wounds
        - refId: guiding-bolt
          identifier: guiding bolt
          originalName: 曳光弹guiding bolt
          englishName: guiding bolt
          chineseName: 曳光弹
          aliases: []
          method: prepared
          castingLevel: 1
          ignoresMaterialComponents: false
          restrictions: []
          evidence:
            - start: 1560
              end: 1575
              quote: 曳光弹guiding bolt
        - refId: lesser-restoration
          identifier: lesser restoration
          originalName: 次级复原术 lesser restoration
          englishName: lesser restoration
          chineseName: 次级复原术
          aliases: []
          method: prepared
          castingLevel: 2
          ignoresMaterialComponents: false
          restrictions: []
          evidence:
            - start: 1584
              end: 1608
              quote: 次级复原术 lesser restoration
        - refId: spiritual-weapon
          identifier: spiritual weapon
          originalName: 灵体武器spiritual weapon
          englishName: spiritual weapon
          chineseName: 灵体武器
          aliases: []
          method: prepared
          castingLevel: 2
          ignoresMaterialComponents: false
          restrictions: []
          evidence:
            - start: 1610
              end: 1630
              quote: 灵体武器spiritual weapon
        - refId: dispel-magic
          identifier: dispel magic
          originalName: 解除魔法dispel magic
          englishName: dispel magic
          chineseName: 解除魔法
          aliases: []
          method: prepared
          castingLevel: 3
          ignoresMaterialComponents: false
          restrictions: []
          evidence:
            - start: 1639
              end: 1655
              quote: 解除魔法dispel magic
        - refId: revivify
          identifier: revivify
          originalName: 回生术revivify
          englishName: revivify
          chineseName: 回生术
          aliases: []
          method: prepared
          castingLevel: 3
          ignoresMaterialComponents: false
          restrictions: []
          evidence:
            - start: 1657
              end: 1668
              quote: 回生术revivify
特性:
  - 名称: 施法. Spellcasting
    类型: utility
    描述: |
      **施法. Spellcasting**. 神甫是一名5级的施法者。他的施法关键属性是感知（法术豁免DC 13，法术攻击加值+5)。牧师准备了以下牧师法术：
      戏法（随意）：光亮术light, 圣焰sacred flame, 维生术spare the dying
      1环（4法位）：命令术command, 疗伤术cure wounds, 曳光弹guiding bolt
      2环（3法位）：次级复原术 lesser restoration, 灵体武器spiritual weapon
      3环（2法位）：解除魔法dispel magic, 回生术revivify
    spellcastingFeatureKey: spellcasting-1
  - 名称: 神之荣耀. Divine Eminence
    类型: damage
    激活: bonus
    描述: 作为一个附赠动作，神甫可以消耗一个法术环位，使其近战武器攻击可以额外造成10（3d6）的光耀伤害。此效果持续到他回合结束。如果神甫消耗了2环或更高的法术环位，每比一环高一级的环位会额外让这次伤害增加1d6。
动作:
  - 名称: 硬头锤Mace
    类型: attack
    激活: action
    描述: 近战武器攻击：+2命中，触及5尺，一个目标。命中：3（1d6）钝击伤害。
    攻击类型: mwak
    命中: 2
    范围: 触及 5 尺
    伤害:
      - 公式: 1d6
        类型: bludgeoning
---

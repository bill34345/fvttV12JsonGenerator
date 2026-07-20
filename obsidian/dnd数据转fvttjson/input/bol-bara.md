---
名称: 波'巴拉Bol’bara
类型: npc
体型: 小型
生物类型: 类人生物
生物类型备注: 地精类
阵营: 混乱善良
能力:
  力量: 11
  敏捷: 14
  体质: 12
  智力: 10
  感知: 13
  魅力: 14
护甲等级: 13
生命值: 40 (9d6 + 9)
速度: 步行 30 尺
熟练加值: 2
挑战等级: 3
经验值: 700
感官:
  黑暗视觉: 60
  被动察觉: 11
语言:
  - 通用语
  - 地精语
传记: |-
  当她完全被她的宗主控制时，波'巴拉可以采取 2 传奇动作，从以下选项中选择。传奇动作只能在另一个生物的回合结束时使用，且一次只能使用一项。波'巴拉在她的回合开始时恢复所有已消耗的传奇动作。

  护甲等级：13（皮甲）（使用法师护甲时15）
传奇动作次数: 2
法术清单:
  schemaVersion: 1
  manifestId: intake-c883dbb17d987116-bol-bara-innate-1-297
  sourceSha256: c883dbb17d987116c8bab77935835722b37f02eec90a07cabe79782d915ef528
  rulesPreference: "2024"
  spellcastingGroups:
    - groupId: innate-1
      featureItemKey: innate-1
      ability: cha
      saveDc: 12
      attackBonus: 4
      spellRefs:
        - refId: eldritch-blast
          identifier: eldritch-blast
          originalName: 魔能爆 Eldritch Blast
          englishName: Eldritch Blast
          chineseName: 魔能爆
          aliases: []
          method: at-will
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 367
              end: 385
              quote: 魔能爆 Eldritch Blast
        - refId: false-life
          identifier: false-life
          originalName: 虚假生命False Life
          englishName: False Life
          chineseName: 虚假生命
          aliases: []
          method: at-will
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 386
              end: 400
              quote: 虚假生命False Life
        - refId: mage-armor
          identifier: mage-armor
          originalName: 法师护甲Mage Armor
          englishName: Mage Armor
          chineseName: 法师护甲
          aliases: []
          method: at-will
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 401
              end: 415
              quote: 法师护甲Mage Armor
        - refId: mage-hand
          identifier: mage-hand
          originalName: 法师之手Mage Hand
          englishName: Mage Hand
          chineseName: 法师之手
          aliases: []
          method: at-will
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 416
              end: 429
              quote: 法师之手Mage Hand
        - refId: charm-person
          identifier: charm-person
          originalName: 魅惑人类Charm Person
          englishName: Charm Person
          chineseName: 魅惑人类
          aliases: []
          method: innate
          uses:
            value: 1
            recovery: day
            shared: false
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 436
              end: 452
              quote: 魅惑人类Charm Person
        - refId: hex
          identifier: hex
          originalName: 脆弱诅咒Hex
          englishName: Hex
          chineseName: 脆弱诅咒
          aliases: []
          method: innate
          uses:
            value: 1
            recovery: day
            shared: false
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 453
              end: 460
              quote: 脆弱诅咒Hex
        - refId: hold-person
          identifier: hold-person
          originalName: 人类定身术Hold Person
          englishName: Hold Person
          chineseName: 人类定身术
          aliases: []
          method: innate
          uses:
            value: 1
            recovery: day
            shared: false
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 461
              end: 477
              quote: 人类定身术Hold Person
        - refId: invisibility
          identifier: invisibility
          originalName: 隐形术Invisibility
          englishName: Invisibility
          chineseName: 隐形术
          aliases: []
          method: innate
          uses:
            value: 1
            recovery: day
            shared: false
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 478
              end: 493
              quote: 隐形术Invisibility
特性:
  - 名称: 天生施法 (Innate Spellcasting)
    类型: utility
    描述: |-
      **天生施法**. 波'巴拉的天生施法属性为魅力（法术豁免DC 12，法术攻击命中+4）。她天生就可以施展以下法术，且无需任何构材：
      随意：魔能爆 Eldritch Blast，虚假生命False Life，法师护甲Mage Armor，法师之手Mage Hand
      1次/每日：魅惑人类Charm Person，脆弱诅咒Hex，人类定身术Hold Person，隐形术Invisibility
    spellcastingFeatureKey: innate-1
  - 名称: 黑暗赐福 (Dark One's Blessing)
    类型: utility
    描述: 当波'巴拉将一个敌对生物的生命值归零时，她将获得6点临时生命值
  - 名称: 灵敏脱逃 (Nimble Escape)
    类型: utility
    激活: bonus
    描述: 波'巴拉可以在每个她的回合以一个附赠动作来采取撤离或躲藏动作。
  - 名称: 附身阵营 (Possessed Alignment)
    类型: utility
    描述: 当波'巴拉被完全附身时，她的阵营将变为混乱邪恶。
动作:
  - 名称: 多重攻击Multiattack
    类型: utility
    激活: action
    描述: 波'巴拉进行两次近战武器攻击。
  - 名称: 匕首Dagger
    类型: attack
    激活: action
    描述: 近战或远程武器攻击：命中+4，触及5尺或远程20/60尺，单个目标。命中：4 (1d4 + 2)穿刺伤害。
    攻击类型: mwak
    命中: 4
    范围: 触及 5 尺或射程 20/60 尺
    伤害:
      - 公式: 1d4 + 2
        类型: piercing
  - 名称: 魔能爆Eldritch Blast
    类型: attack
    激活: action
    描述: 远程法术攻击：命中+4，射程120尺，单个生物，命中：7 (1d10 + 2) 力场伤害。
    攻击类型: rsak
    命中: 4
    范围: 120 尺
    伤害:
      - 公式: 1d10 + 2
        类型: force
传奇动作:
  - 名称: 无形冲刺. Incorporeal Dash
    类型: utility
    激活: legendary
    描述: 波'巴拉可以进行移动，距离等同于她的速度。她可以穿过其他生物和物体，此过程中它们视为困难地形。如果她在自己的回合结束时处于物体内部，她将受到 5（1d10）点力场伤害。
  - 名称: 灾祸之域（需要2动作）Zone of Calamity
    类型: utility
    激活: legendary
    描述: 一个半径15英尺的魔法混乱球体从一个波'巴拉可以看到的60尺内的地点延伸到各个角落。每个在该区域内开始其回合的生物都将受到*困惑术confusion*的影响（豁免DC 12）。只要波巴拉保持专注，这个球将会持续1分钟（如同维持一个法术的专注）。
    传奇动作消耗: 2
---

---
名称: 武器精通 Actor Fixture
类型: npc
体型: 中型
生物类型: 人形生物
护甲等级: 12
生命值: 18
能力:
  力量: 16
  敏捷: 12
  体质: 12
  智力: 10
  感知: 10
  魅力: 10
熟练加值: 3
挑战等级: 1
动作:
  - 名称: 配置长矛
    类型: attack
    描述: 命中后按来源配置处理武器精通。
    攻击类型: mwak
    命中: 5
    范围: 触及 5 尺
    原生精通: vex
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
    伤害:
      - 公式: 1d6
        类型: piercing
---
## 武器精通 Actor Fixture

来源明确授予该武器 Vex 原生精通，并显式配置 Deadly d8。

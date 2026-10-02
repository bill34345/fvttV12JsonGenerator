---
名称: 双武器精通 Actor Fixture
类型: npc
体型: 中型
生物类型: 类人生物
护甲等级: 12
生命值: 24
能力:
  力量: 16
  敏捷: 14
  体质: 12
  智力: 10
  感知: 10
  魅力: 10
熟练加值: 2
挑战等级: 1
动作:
  - 名称: Deadly 长矛
    类型: attack
    描述: 第一把来源明确配置为 Deadly。
    攻击类型: mwak
    命中: 5
    范围: 触及 5 尺
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
    伤害:
      - 公式: 1d6
        类型: piercing
  - 名称: Fatal 战锤
    类型: attack
    描述: 第二把来源明确配置为 Fatal。
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
        - ruleId: house.fatal
          kind: fatal
          label: Fatal d10
          params:
            die: 10
          stackingGroup: house.fatal
    伤害:
      - 公式: 1d8
        类型: bludgeoning
---
## 双武器精通 Actor Fixture

两件武器的原生精通和家规特性必须按来源身份分别回读。

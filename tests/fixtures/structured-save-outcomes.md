---
名称: Save Outcome Fixture
类型: npc
体型: 中型
生物类型: 龙
护甲等级: 12
生命值: 30
能力:
  力量: 12
  敏捷: 12
  体质: 12
  智力: 12
  感知: 12
  魅力: 12
挑战等级: 1
动作:
  - 名称: 冰雾
    类型: save
    充能: [5, 6]
    AoE: {形状: cone, 范围: 30}
    内嵌效果:
      - 类型: 恐慌
        描述: 豁免失败目标恐慌 1 分钟，盟友救援可提前结束。
        持续: 1 分钟
    DC: 13
    DC来源: literal
    属性: 体质
    伤害:
      - 公式: 2d6
        类型: cold
    描述: 三十尺锥形内生物进行 DC 13 体质豁免，失败受到 2d6 寒冷伤害并陷入恐慌，持续 1 分钟，成功受到一半伤害。5 尺内盟友可援助结束恐慌。
  - 名称: Fire Wave
    类型: save
    充能: [4, 6]
    AoE: {形状: sphere, 范围: 20}
    内嵌效果:
      - 类型: dazed
        描述: The target is dazed for 2 rounds.
        持续: 2 rounds
    DC: 15
    DC来源: literal
    属性: 敏捷
    伤害:
      - 公式: 3d8
        类型: fire
    描述: Each creature makes a DC 15 Dexterity saving throw, taking 3d8 fire damage and becoming dazed on a failed save, or half as much damage on a successful one. The target is dazed for 2 rounds. An ally within 5 feet can remove the condition.
  - 名称: 压力脉冲
    类型: save
    充能: [6, 6]
    AoE: {形状: line, 范围: 60}
    内嵌效果:
      - 类型: 恍惚
        描述: 压力脉冲导致恍惚一轮。
        持续: 1 轮
    DC: 14
    DC来源: literal
    属性: 力量
    伤害:
      - 公式: 1d10
        类型: force
    描述: 生物进行 DC 14 力量豁免，失败受到 1d10 力场伤害并陷入恍惚，成功仍受到完整伤害。5 尺内盟友可援助结束恍惚。
  - 名称: 闪避尖刺
    类型: save
    DC: 12
    DC来源: literal
    属性: 敏捷
    伤害:
      - 公式: 2d4
        类型: piercing
    描述: 生物进行 DC 12 敏捷豁免，失败受到 2d4 穿刺伤害，成功不受伤害。
  - 名称: 无伤害豁免
    类型: save
    DC: 11
    DC来源: literal
    属性: 感知
    描述: 生物进行 DC 11 感知豁免；失败陷入倒地，成功无效果。
  - 名称: 普通爪击
    类型: attack
    攻击类型: mwak
    命中: 3
    范围: 触及 5 尺
    伤害:
      - 公式: 1d6+1
        类型: slashing
    描述: 近战武器攻击，+3 命中，触及 5 尺，命中受到 1d6+1 挥砍伤害。
---

---
名称: Damage-only regression creature
类型: npc
体型: 中型
生物类型: 精类
能力:
  力量: 10
  敏捷: 12
  体质: 10
  智力: 10
  感知: 10
  魅力: 10
护甲等级: 12
生命值: 20
速度: 步行 30 尺
挑战等级: 1
动作:
  - 名称: Claw
    类型: attack
    攻击类型: 近战武器攻击
    命中: 4
    范围: 触及5尺
    伤害:
      - 公式: 1d6
        类型: slashing
        关系: base
  - 名称: Frost Save
    类型: save
    DC: 12
    属性: 敏捷
    伤害:
      - 公式: 1d4
        类型: cold
        关系: base
附赠动作:
  - 名称: 寒潮 (Cold Surge)
    类型: damage
    描述: 目标受到 1d6 寒冷伤害。
    伤害:
      - 公式: 1d6
        类型: cold
        关系: base
反应:
  - 名称: Courage to Dread
    类型: damage
    激活: reaction
    描述: "Trigger: A creature within 30 feet succeeds on an Intelligence or Wisdom Saving Throw. Response: The hag deals 9 (2d8) Necrotic damage to it."
    伤害:
      - 公式: 2d8
        类型: necrotic
        关系: base
传奇动作:
  - 名称: Malice Deeps
    类型: damage
    激活: legendary
    描述: An ice wave roils forth; each creature Cursed by or Indebted to the hag within 40 feet of it takes 9 (2d8) Cold damage and is pushed up to 10 feet in a direction of the hag’s choice.
    伤害:
      - 公式: 2d8
        类型: cold
        关系: base
---

---
名称: Drop-to-zero healing regression creature
类型: npc
体型: 中型
生物类型: 精类
能力:
  力量: 10
  敏捷: 10
  体质: 10
  智力: 10
  感知: 10
  魅力: 10
护甲等级: 10
生命值: 20
速度: 步行 30 尺
挑战等级: 1
动作:
  - 名称: Arcane Bite
    类型: attack
    攻击类型: 近战武器攻击
    命中: 4
    范围: 触及5尺
    描述: "Hit: 6 (2d6) Necrotic damage. If this damage reduces a creature to 0 Hit Points, the caster regains 10 (3d6) Hit Points."
    伤害:
      - 公式: 2d6
        类型: necrotic
  - 名称: 寒潮摄取
    类型: damage
    描述: "目标受到 4d6 冷伤害。若此伤害使目标的生命值降至 0，则施法者恢复 7（2d6）点生命值。"
    伤害:
      - 公式: 4d6
        类型: cold
  - 名称: Final Blow
    类型: damage
    描述: "The strike deals 1d8 piercing damage. When a creature drops to 0 HP from this strike, you recover 1d12 HP."
    伤害:
      - 公式: 1d8
        类型: piercing
  - 名称: Bilebrine
    类型: save
    DC: 18
    属性: 体质
    描述: "(Level 5 Spell). Stinging brine surges over a creature the hag can see within 60 feet, forcing it to make a Constitution Saving Throw: DC 18. Failure: 22 (5d8) Acid damage plus 22 (5d8) Necrotic damage. Success: Half damage. A creature reduced to 0 Hit Points by this damage is infected with Merthirst."
    伤害:
      - 公式: 5d8
        类型: acid
      - 公式: 5d8
        类型: necrotic
  - 名称: Mortal Blade
    类型: damage
    描述: "The blade deals 2d8 slashing damage. If a target is reduced to 0 Hit Points by this damage, it dies."
    伤害:
      - 公式: 2d8
        类型: slashing
  - 名称: Shade Caller
    类型: damage
    描述: "The attack deals 2d8 psychic damage. If a target drops to 0 HP, summon a shade."
    伤害:
      - 公式: 2d8
        类型: psychic
  - 名称: Delayed Recovery
    类型: damage
    描述: "The spell deals 2d8 force damage. If a target drops to 0 HP, it falls unconscious. At the start of your next turn, you regain 3d8 HP."
    伤害:
      - 公式: 2d8
        类型: force
  - 名称: Later Recovery
    类型: damage
    描述: "The spell deals 2d8 force damage. If a target drops to 0 HP, it falls unconscious, and at the start of your next turn you regain 3d8 HP."
    伤害:
      - 公式: 2d8
        类型: force
  - 名称: No Recovery
    类型: damage
    描述: "The spell deals 2d8 force damage. If a target drops to 0 HP, you cannot regain 3d8 HP."
    伤害:
      - 公式: 2d8
        类型: force
  - 名称: Postponed Healing
    类型: damage
    描述: "The spell deals 2d8 force damage. If a target drops to 0 HP, you regain 3d8 HP at the start of your next turn."
    伤害:
      - 公式: 2d8
        类型: force
---

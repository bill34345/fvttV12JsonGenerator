---
名称: Structured Activation Test
类型: npc
特性:
  - 名称: Skulker
    类型: utility
    激活: bonus
    描述: The creature can take the Hide action as a bonus action.
  - 名称: Passive Feature
    类型: utility
    描述: This feature uses the section default.
动作:
  - 名称: Bite
    类型: attack
    描述: A normal action using the section default.
    攻击类型: mwak
    命中: 4
    范围: 触及 5 尺
    伤害:
      - 公式: 1d4 + 2
        类型: piercing
  - 名称: Radiant Burst
    类型: save
    描述: A save action with structured damage.
    DC: 21
    属性: dex
    伤害:
      - 公式: 4d10
        类型: psychic
---

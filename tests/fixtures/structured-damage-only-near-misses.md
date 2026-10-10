---
名称: Damage-only near misses
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
生命值: 10
速度: 步行 30 尺
挑战等级: 1
动作:
  - 名称: Cautionary Tale
    类型: utility
    描述: A legend mentions 2d8 necrotic damage, but this action deals none.
    伤害:
      - 公式: 2d8
        类型: necrotic
        关系: base
  - 名称: Optional Surge
    类型: damage
    描述: The target can choose a different surge instead.
    伤害:
      - 公式: 3d6
        类型: fire
        关系: conditional
      - 公式: 4d6
        类型: lightning
        关系: replacement
  - 名称: Harmless Wave
    类型: damage
    描述: A wave pushes the target without harm.
---

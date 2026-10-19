---
名称: 图标验收兽 (Icon Acceptance Beast)
类型: npc
体型: 中型
生物类型: 魔物
能力:
  力量: 16
  敏捷: 14
  体质: 14
  智力: 10
  感知: 12
  魅力: 10
护甲等级: 14
生命值: 45
速度: 步行 30 尺
挑战等级: 2
特性:
  - 名称: 借面 (Borrowed Face)
    描述: It can perfectly imitate the voice and appearance of a humanoid.
  - 名称: 结伴 (Fellowship)
    描述: While allies are nearby, its attack rolls have advantage.
动作:
  - 名称: 爪击 (Claw)
    类型: attack
    攻击类型: 近战武器攻击
    命中: 5
    范围: 触及5尺
    伤害:
      - 公式: 1d6+3
        类型: slashing
        关系: base
  - 名称: 火球术 (Fireball)
    类型: attack
    攻击类型: 远程法术攻击
    命中: 4
    范围: 射程120尺
    描述: 对一个目标发射火球，命中造成 1d10 火焰伤害。此来源定义的是单体攻击。
    伤害:
      - 公式: 1d10
        类型: fire
        关系: base
  - 名称: 寒霜投射 (Frost Bolt)
    类型: attack
    攻击类型: 远程法术攻击
    命中: 4
    范围: 射程60尺
    伤害:
      - 公式: 1d8
        类型: cold
        关系: base
附赠动作:
  - 名称: 啃咬 (Bite)
    类型: attack
    攻击类型: 近战武器攻击
    命中: 5
    范围: 触及5尺
    伤害:
      - 公式: 1d4+3
        类型: piercing
        关系: base
传奇动作:
  - 名称: 尾击 (Tail Attack)
    类型: attack
    激活: legendary
    攻击类型: 近战武器攻击
    命中: 5
    范围: 触及10尺
    伤害:
      - 公式: 1d8+3
        类型: bludgeoning
        关系: base
---

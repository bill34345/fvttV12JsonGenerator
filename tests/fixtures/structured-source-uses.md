---
名称: Source Uses Fixture
类型: npc
体型: 中型
生物类型: 龙
护甲等级: 12
生命值: 30
能力: {力量: 12, 敏捷: 12, 体质: 12, 智力: 12, 感知: 12, 魅力: 12}
挑战等级: 1
特性:
  - 名称: 每日能力
    类型: utility
    激活: special
    使用次数: {max: 2, period: day}
    描述: 每日可使用两次。确切重置时点由GM决定。
  - 名称: 短休能力
    类型: utility
    激活: bonus
    使用次数: {max: 3, period: shortRest}
    描述: 三次使用，短休恢复。
  - 名称: 黎明能力
    类型: utility
    激活: action
    使用次数: {max: 4, period: dawn}
    描述: 四次使用，黎明恢复。
  - 名称: 旧长休入口
    类型: utility
    perLongRest: 1
    描述: 一次使用，长休恢复。
  - 名称: 被动特性
    类型: utility
    描述: 可在水中呼吸，没有使用次数。
---

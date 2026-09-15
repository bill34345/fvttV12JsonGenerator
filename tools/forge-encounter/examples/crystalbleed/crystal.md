---
名称: "月石晶体 (Moonstone Crystal)"
类型: npc
体型: 中型
生物类型: 构装体
阵营: 无阵营
img: "icons/commodities/gems/gem-cluster-red.webp"
tokenImg: "icons/commodities/gems/gem-cluster-red.webp"
能力:
  力量: 10
  敏捷: 10
  体质: 10
  智力: 1
  感知: 10
  魅力: 1
护甲等级: 17
生命值: 15
速度: "步行 0 尺，飞行 0 尺，游泳 0 尺，攀爬 0 尺，掘穴 0 尺"
先攻: 0
挑战等级: 0
熟练加值: 2
语言: []
背景: "由晶血龙兽晶片齐射生成的固定晶体。AC 17，HP 15，不能移动；在自己的先攻回合戳刺周围生物。"
特性:
  - 名称: "固定晶体 (Immobile Crystal)"
    类型: utility
    描述: "晶体是不能移动的构装体，所有速度为 0。生成在齐射目标旁边的空位，立即投掷先攻并加入战斗。被摧毁后停止行动。"
  - 名称: "月石腐化 (Moonstone Corruption)"
    类型: save
    激活: special
    DC: 18
    属性: 魅力
    DC来源: literal
    描述: >-
      只对月石戳刺的敏捷豁免失败目标进行第二阶段结算：目标进行一次 DC 18 魅力豁免，成功无效果。
      失败时受到绯晶腐化（月石腐化）；若已经受到绯晶腐化，则改为获得 1 级力竭。两个名称代表同一状态。
动作:
  - 名称: "月石戳刺 (Moonstone Spikes)"
    类型: save
    DC: 18
    属性: 敏捷
    DC来源: literal
    AoE:
      形状: sphere
      范围: 10
    伤害:
      - 公式: "2d6"
        类型: piercing
    描述: >-
      在晶体自己的回合开始时，它向周围 10 尺内除自身外的所有生物伸出不规则月石尖刺，不区分敌友。
      每个生物进行 DC 18 敏捷豁免。失败：受到 7（2d6）点穿刺伤害，随后使用独立的月石腐化 (Moonstone Corruption) 特性进行第二阶段豁免；成功：不受伤害，也不进行腐化豁免。
      每个晶体每回合只戳刺一次，刚生成时不额外戳刺，生命值为 0 时不戳刺。
行为机制:
  版本: 1
  机制:
    - ID: salvo-crystal-pulse
      类型: area
      名称: 月石晶体回合戳刺
      载体:
        分区: 动作
        名称: "月石戳刺 (Moonstone Spikes)"
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: turnStart
        频率: oncePerTurn
        条件: 晶体仍存活；对十尺内所有其他生物
      引用:
        - ID: corruption-after-failed-dex
          角色: 仅初始敏捷豁免失败后进行独立腐化豁免
          项目:
            分区: 特性
            名称: "月石腐化 (Moonstone Corruption)"
      操作:
        - ID: inspect-pulse
          名称: 查看戳刺范围
          激活: special
          类型: manual
          状态: []
          引用: [corruption-after-failed-dex]
          说明: 以晶体为中心十尺，不区分敌友，每回合一次；使用月石戳刺原始豁免活动。
      GM步骤:
        - 战斗控制宏启用时自动结算；宏关闭时在晶体回合使用戳刺活动。
    - ID: salvo-crystal-corruption
      类型: externalRule
      名称: 月石腐化
      载体:
        分区: 特性
        名称: "月石腐化 (Moonstone Corruption)"
      表达覆盖: structured
      执行模式: external-rule
      规则来源: source-derived
      状态:
        - ID: corrupted
          名称: 绯晶腐化（月石腐化）
          目标: selected
          状态: []
          变化: []
          解除: [按战役规则由 GM 移除腐化]
      操作:
        - ID: inspect-crystal-corruption
          名称: 查看腐化规则
          激活: special
          类型: manual
          状态: []
          引用: []
          说明: 只在戳刺敏捷豁免失败后进行魅力豁免，首次腐化与已有腐化后的一级力竭分别处理。
      GM步骤:
        - 仅当敏捷豁免失败后才使用此能力，不能把力竭直接应用于戳刺失败目标。
      外部规则:
        名称: 绯晶腐化（月石腐化）
        DC: 18
        属性: cha
        结果: 失败时首次受到腐化；已有腐化则获得 1 级力竭；成功无效果。
---

新召唤体由用户规则整理。未指定的属性采用普通静态晶体数值，不额外添加伤害抗性或状态免疫。晶体敏捷豁免和腐化难度统一为 18，腐化沿用龙兽的魅力豁免规则。

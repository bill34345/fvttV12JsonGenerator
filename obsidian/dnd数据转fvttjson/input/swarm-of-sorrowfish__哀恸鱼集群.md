---
名称: 哀恸鱼集群 (Swarm of Sorrowfish)
类型: npc
体型: 中型
生物类型: 异怪
生物类型备注: 微型异怪集群
阵营: 无阵营
能力:
  力量: 16
  敏捷: 19
  体质: 14
  智力: 1
  感知: 11
  魅力: 3
护甲等级: 14
生命值: 104 (16d8 + 32)
速度: 步行 0 尺, 游泳 30 尺
伤害抗性:
  - 钝击
  - 穿刺
  - 挥砍
伤害免疫:
  - 心灵
状态免疫:
  - 魅惑
  - 恐慌
  - 擒抱
  - 麻痹
  - 石化
  - 倒地
  - 束缚
  - 震慑
感官:
  盲视: 60
  特殊: 盲视范围外视为目盲
  被动察觉: 10
挑战等级: 6
经验值: 2300
熟练加值: 3
背景: |-
  官方原型：《Critical Role: Call of the Netherdeep》附录 A，哀恸鱼集群。
  本优化版保留官方集群、致命哀恸与忧伤吸食的身份，只限制重复触发，并加入可被雷鸣伤害利用的驱散窗口与主动穿行战场的能力。
行为机制:
  版本: 1
  机制:
    - ID: sorrowfish-virulent-and-scatter
      类型: trigger
      名称: 致命哀恸首次触发与震散
      英文名: First Virulent Sorrow and Thunder Scatter
      载体:
        分区: 特性
        名称: 致命哀恸 (Virulent Sorrow)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: damageTaken
        频率: oncePerTurn
        条件: 集群每回合第一次受到伤害
      条件:
        - 成功目标免疫到集群下一回合开始
        - 雷鸣伤害后到集群下一回合开始失去三种物理抗性并不能触发致命哀恸
      引用:
        - ID: scatter-shoal
          角色: 雷鸣伤害抑制与抗性移除
          项目:
            分区: 特性
            名称: 震散鱼群 (Scatter the Shoal)
      状态:
        - ID: virulent-sorrow-failed
          名称: 致命哀恸失败
          英文名: Virulent Sorrow Failed
          目标: selected
          状态: []
          变化: []
          持续:
            特殊: 直到目标下一回合结束；攻击劣势、不能反应、速度减半
          解除:
            - 目标下一回合结束
        - ID: virulent-sorrow-immune
          名称: 暂时免疫致命哀恸
          英文名: Temporarily Immune to Virulent Sorrow
          目标: selected
          状态: []
          变化: []
          持续:
            特殊: 直到集群下一回合开始
          解除:
            - 集群下一回合开始
        - ID: sorrowfish-scattered
          名称: 鱼群震散
          英文名: Shoal Scattered
          目标: self
          状态: []
          变化: []
          持续:
            特殊: 直到集群下一回合开始
          解除:
            - 集群下一回合开始
      操作:
        - ID: apply-virulent-failure
          名称: 应用致命哀恸失败
          英文名: Apply Virulent Sorrow Failure
          激活: special
          类型: apply
          状态:
            - virulent-sorrow-failed
          引用: []
          说明: 仅对首次触发感知豁免失败目标应用。
        - ID: apply-virulent-immunity
          名称: 应用致命哀恸成功免疫
          英文名: Apply Virulent Sorrow Success Immunity
          激活: special
          类型: apply
          状态:
            - virulent-sorrow-immune
          引用: []
          说明: 对豁免成功目标应用到集群下一回合开始。
        - ID: apply-sorrowfish-scatter
          名称: 应用鱼群震散
          英文名: Apply Shoal Scattered
          激活: special
          类型: apply
          状态:
            - sorrowfish-scattered
          引用:
            - scatter-shoal
          说明: 雷鸣伤害后标记；存在时手工移除钝击、穿刺、挥砍抗性并禁用致命哀恸。
      GM步骤:
        - 每回合只处理第一次受伤触发，并跳过已有成功免疫的目标。
        - 豁免失败目标的所有移动速度减半；不要只修改步行速度。
        - 震散标记存在时忽略三种物理抗性且不触发致命哀恸。
    - ID: sorrowfish-bloodied-bites
      类型: stage
      名称: 半血啃咬伤害档位
      英文名: Bloodied Bites Damage Tier
      载体:
        分区: 动作
        名称: 群聚啃咬 (Swarm of Bites)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: hpThreshold
        频率: unlimited
        条件: 当前生命值不高于上限一半
      操作:
        - ID: choose-sorrowfish-bites-damage
          名称: 选择满血或半血啃咬
          英文名: Choose Normal or Bloodied Bites
          激活: special
          类型: choose
          状态: []
          引用: []
          说明: 高于半血使用 6d6；半血或更低使用 3d6，二者不叠加。
      GM步骤:
        - 攻击前检查当前生命值并只结算对应伤害档位。
    - ID: sorrowfish-drain-lifecycle
      类型: lifecycle
      名称: 同格吸食与救援解除
      英文名: Same-space Drain and Rescue Removal
      载体:
        分区: 动作
        名称: 忧伤吸食 (Desolate Drain)
      表达覆盖: structured
      执行模式: core-operable
      规则来源: source-derived
      条件:
        - 目标必须与集群占据同一空间；5 尺只属于盟友救援距离
      状态:
        - ID: sorrowfish-drain-stunned
          名称: 忧伤吸食震慑
          英文名: Desolate Drain Stunned
          目标: selected
          状态:
            - stunned
          变化: []
          持续:
            特殊: 直到目标下一回合结束、集群离开、盟友拉出或集群受雷鸣伤害
          解除:
            - 集群离开目标空间
            - 5 尺内盟友以动作通过 DC 14 力量检定并拉出目标
            - 集群受到雷鸣伤害
            - 目标下一回合结束
      操作:
        - ID: apply-sorrowfish-drain-stun
          名称: 应用忧伤吸食震慑
          英文名: Apply Desolate Drain Stun
          激活: special
          类型: apply
          状态:
            - sorrowfish-drain-stunned
          引用: []
          说明: 仅对同格且感知豁免失败目标应用。
        - ID: rescue-from-sorrowfish
          名称: 拉出目标并解除震慑
          英文名: Pull Target Out and End Stun
          激活: action
          类型: remove
          状态:
            - sorrowfish-drain-stunned
          引用: []
          说明: 5 尺内盟友 DC 14 力量检定成功后移动目标出集群并移除效果。
---

哀恸鱼是被深海恶意扭曲的细小异怪。单只哀恸鱼几乎毫无威胁；当鱼群聚合时，它们会把猎物困在由牙齿、哀鸣和绝望构成的漩涡中。

### 特性

- **集群 (Swarm)**：集群可以进驻另一生物所占据的空间，反之亦然；集群可以穿过任何至少 1 尺宽的开口。集群不能恢复生命值，也不能获得临时生命值。

- **致命哀恸 (Virulent Sorrow)**：集群每回合第一次受到伤害时，位于其 5 尺内的每个其他生物必须进行一次 **DC 14 感知 (Wisdom) 豁免检定**。
  - **豁免失败**：直到该生物下一回合结束前，其攻击检定具有劣势，不能执行反应，且速度减半。
  - **豁免成功**：该生物免疫致命哀恸，直到集群下一回合开始。

- **震散鱼群 (Scatter the Shoal)**：集群受到雷鸣伤害 (Thunder Damage) 后，鱼群被震散。直到其下一回合开始，集群失去对钝击、穿刺和挥砍伤害的抗性，且不能触发**致命哀恸 (Virulent Sorrow)**。这一变化清晰可见。

- **水下呼吸 (Water Breathing)**：集群只能在水下呼吸。

### 动作

- **群聚啃咬 (Swarm of Bites)**：近战武器攻击：+8 命中，触及 0 尺，集群所在空间内的一个目标。
  - **命中**：21（`6d6`）点穿刺伤害；若集群的生命值不高于其生命值上限的一半，则改为 10（`3d6`）点穿刺伤害。

- **忧伤吸食 (Desolate Drain, 充能 5–6)**：集群空间内的每个其他生物必须进行一次 **DC 14 感知 (Wisdom) 豁免检定**。
  - **豁免失败**：受到 24（`7d6`）点心灵伤害，并陷入震慑 (Stunned) 状态，直到其下一回合结束。
  - **豁免成功**：受到一半伤害，且不陷入震慑。
  - 集群离开受影响生物的空间时，该生物身上的震慑结束。集群 5 尺内的另一生物也可以用一个动作进行一次 **DC 14 力量检定 (Strength Check)**，成功则把受影响生物拉出集群并结束震慑。若集群受到雷鸣伤害，所有以此方式被震慑的生物也会立即脱离集群并结束震慑。

### 附赠动作

- **哀潮穿行 (Sorrowful Flow)**：集群移动至多其游泳速度的一半。此次移动不会引发借机攻击 (Opportunity Attacks)，且可以穿过其他生物的空间，但不能在同一回合内第二次进入同一生物的空间。

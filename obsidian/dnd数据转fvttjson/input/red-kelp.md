---
名称: 红海带群落 (Red Kelp Colony)
类型: npc
体型: 大型
生物类型: 植物
阵营: 无阵营
能力:
  力量: 14
  敏捷: 1
  体质: 14
  智力: 1
  感知: 10
  魅力: 1
护甲等级: 12 (纤维根网)
生命值: 45 (6d10 + 12)
速度: 步行 0 尺
伤害易伤:
  - 挥砍
伤害抗性:
  - 寒冷
  - 毒素
  - 钝击
状态免疫:
  - 魅惑
  - 恐慌
  - 中毒
  - 倒地
  - 震慑
感官:
  震颤感知: 30
  被动察觉: 10
挑战等级: 2
经验值: 450
熟练加值: 2
背景: |-
  来源：Call of the Netherdeep: Additional Netherdeep Monsters
  作者：Frozenfeet2
  原文：https://www.gmbinder.com/share/-N-lZxHyITwITQjoeP10
  优化方向：把几乎无法作为 Actor 使用的单株植物整理为一片大型群落；保留吸收魔法、缠握与藻华主题，但让法术先转化为可见资源，而不是直接无效。
资源机制:
  资源:
    - ID: bloom-energy
      名称: 藻华能量
      英文名: Bloom Energy
      载体:
        分区: 特性
        名称: 奥术滋养 (Arcane Feeding)
      初始: 0
      最大: 3
      恢复: none
      操作:
        - ID: gain-bloom-energy
          名称: 获得藻华能量
          英文名: Gain Bloom Energy
          激活: special
          模式: gain
          数量: 1
          条件: 每轮第一次吸收 1 环或更高环阶法术时
        - ID: lose-bloom-energy
          名称: 割断一层藻华能量
          英文名: Sever One Bloom Energy
          激活: special
          模式: spend
          数量: 1
          条件: 从单一来源受到至少 10 点挥砍伤害，且当前至少有 1 层时
  消费:
    - ID: algal-bloom-radius
      资源: bloom-energy
      来源:
        分区: 动作
        名称: 藻华 (Algal Bloom)
      模式: variable
      最小: 1
      最大: 3
      可选: true
      额外活动:
        名称: 藻华：扩大范围
        英文名: "Algal Bloom: Expanded Area"
      缩放:
        范围:
          基础: 15
          每额外层: 5
  转换:
    - ID: bloom-energy-conversion
      名称: 转化三层藻华能量
      英文名: Convert Three Bloom Energy
      载体:
        分区: 动作
        名称: 藻华 (Algal Bloom)
      激活: special
      条件: 获得第三层藻华能量时
      变化:
        - 类型: resource
          资源: bloom-energy
          模式: spend
          数量: 3
        - 类型: itemUses
          目标:
            分区: 动作
            名称: 藻华 (Algal Bloom)
          模式: recover
          数量: 1
行为机制:
  版本: 1
  机制:
    - ID: red-kelp-event-triggers
      类型: trigger
      名称: 藻华获得、割断与黏握
      英文名: Bloom Gain, Severing, and Sticky Hold
      载体:
        分区: 特性
        名称: 奥术滋养 (Arcane Feeding)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: activityUsed
        频率: oncePerRound
        条件: 30 尺内施放 1 环或更高法术
      条件:
        - 每轮第一次附近施法获得 1 层；第三层立即通过转换活动恢复藻华
        - 单次至少 10 点挥砍伤害时失去 1 层；零层时抑制黏性缠握到下一回合开始
        - 黏性缠握每个生物每回合首次在群落空间内发动近战攻击时触发
      引用:
        - ID: sever-roots
          角色: 失去资源或抑制黏握
          项目:
            分区: 特性
            名称: 割断根网 (Sever the Roots)
        - ID: sticky-hold
          角色: 同格首次近战攻击触发
          项目:
            分区: 特性
            名称: 黏性缠握 (Sticky Hold)
        - ID: root-lash
          角色: 命中后可拉近 5 尺
          项目:
            分区: 动作
            名称: 根须抽打 (Root Lash)
      状态:
        - ID: sticky-hold-suppressed
          名称: 黏性缠握失效
          英文名: Sticky Hold Suppressed
          目标: self
          状态: []
          变化: []
          持续:
            特殊: 直到红海带下一回合开始
          解除:
            - 红海带下一回合开始
        - ID: sticky-hold-grapple
          名称: 黏性缠握擒抱
          英文名: Sticky Hold Grapple
          目标: selected
          状态:
            - grappled
          变化: []
          持续:
            特殊: 直到逃脱 DC 12 或效果结束
          解除:
            - 成功逃脱 DC 12
      操作:
        - ID: suppress-sticky-hold
          名称: 标记黏性缠握失效
          英文名: Mark Sticky Hold Suppressed
          激活: special
          类型: apply
          状态:
            - sticky-hold-suppressed
          引用:
            - sever-roots
          说明: 零层时受到阈值挥砍伤害后应用；下一回合开始移除。
        - ID: apply-sticky-hold
          名称: 应用黏性缠握擒抱
          英文名: Apply Sticky Hold Grapple
          激活: special
          类型: apply
          状态:
            - sticky-hold-grapple
          引用:
            - sticky-hold
          说明: 同一生物本回合首次在群落空间内近战攻击且力量豁免失败时应用。
        - ID: resolve-root-lash-pull
          名称: 结算根须抽打拉拽
          英文名: Resolve Root Lash Pull
          激活: special
          类型: move
          状态: []
          引用:
            - root-lash
          说明: 大型或更小目标命中后可向群落拉近 5 尺。
      GM步骤:
        - 每轮记录附近高环法术的首次触发；达到第三层时立即使用三换一转换活动。
        - 挥砍阈值触发时有层数则扣 1 层，无层数则应用黏握抑制标记。
        - 分别记录每个攻击者本回合是否已触发黏性缠握。
    - ID: red-kelp-bloom-area
      类型: area
      名称: 藻华持续区域
      英文名: Algal Bloom Area
      载体:
        分区: 动作
        名称: 藻华 (Algal Bloom)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: enterArea
        频率: oncePerTurn
        条件: 每回合第一次进入毒云或在其中结束回合
      条件:
        - 基础半径 15 尺，每消费 1 层藻华能量增加 5 尺
        - 区域持续到红海带下一回合结束
      状态:
        - ID: bloom-healing-suppressed
          名称: 藻华：无法恢复生命
          英文名: Bloom Healing Suppressed
          目标: selected
          状态: []
          变化: []
          持续:
            特殊: 直到目标下一回合开始
          解除:
            - 目标下一回合开始
      操作:
        - ID: place-red-kelp-bloom
          名称: 放置藻华区域
          英文名: Place Algal Bloom Area
          激活: action
          类型: template
          状态: []
          引用: []
          说明: 按实际消费层数放置 15+5×层数尺半径区域，持续到红海带下一回合结束。
          模板:
            形状: radius
            尺寸: 15
            单位: ft
        - ID: apply-bloom-healing-suppression
          名称: 应用藻华治疗压制
          英文名: Apply Bloom Healing Suppression
          激活: special
          类型: apply
          状态:
            - bloom-healing-suppressed
          引用: []
          说明: 仅对体质豁免失败目标应用，并在目标下一回合开始移除。
      GM步骤:
        - 将模板尺寸改为本次资源缩放活动显示的最终半径。
        - 每个生物每回合只在第一次进入或结束回合时结算一次。
        - 失败目标应用治疗压制；区域结束时删除模板。
---

红海带群落依附沉船和遗迹生长，以附近释放的奥术能量为食。施法会令其囊泡逐渐发亮，而挥砍根茎可以在爆发前消耗这些能量。

### 特性

- **扎根群落 (Rooted Colony)**：红海带群落不能被迫移动，也不会陷入倒地。其占据的空间是困难地形；其他生物可以进入并停留在该空间。

- **奥术滋养 (Arcane Feeding)**：每轮一次，当红海带 30 尺内的生物施展 1 环或更高环阶的法术时，红海带获得 1 层**藻华能量 (Bloom Energy)**，最多 3 层。发光囊泡会清楚显示当前层数。红海带获得第 3 层时，消耗全部层数并恢复一次已消耗的**藻华 (Algal Bloom)**使用次数。

- **割断根网 (Sever the Roots)**：红海带从单一来源受到至少 10 点挥砍伤害时，失去 1 层藻华能量；若它没有藻华能量，则直到其下一回合开始前失去**黏性缠握 (Sticky Hold)**。

- **黏性缠握 (Sticky Hold)**：生物每回合第一次在红海带占据的空间内发动近战攻击时，必须成功通过一次 **DC 12 力量 (Strength) 豁免检定**，否则被红海带擒抱 (Grappled，逃脱 DC 12)。

### 动作

- **根须抽打 (Root Lash)**：近战武器攻击：+4 命中，触及 15 尺，一个目标。
  - **命中**：9（`2d6 + 2`）点钝击伤害；若目标为大型或更小生物，红海带可以将其拉近 5 尺。

- **藻华 (Algal Bloom, 1/日)**：红海带释放一团覆盖其周围 15 尺半径的浑浊毒云，持续到其下一回合结束。红海带可以消耗任意层藻华能量，使半径每层增加 5 尺。一个生物每回合第一次进入毒云或在其中结束回合时，必须进行一次 **DC 13 体质 (Constitution) 豁免检定**。
  - **豁免失败**：受到 18（`4d8`）点毒素伤害，且直到其下一回合开始前不能恢复生命值。
  - **豁免成功**：受到一半伤害，且仍可恢复生命值。

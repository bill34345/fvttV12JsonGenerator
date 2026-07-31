---
名称: 凯利安海蜗牛 (Caelian Sea Snail)
类型: npc
体型: 大型
生物类型: 野兽
阵营: 无阵营
能力:
  力量: 16
  敏捷: 8
  体质: 20
  智力: 3
  感知: 12
  魅力: 6
护甲等级: 14 (天生护甲)
生命值: 73 (7d10 + 35)
速度: 步行 15 尺, 游泳 15 尺
伤害免疫:
  - 毒素
状态免疫:
  - 中毒
感官:
  黑暗视觉: 60
  震颤感知: 60
  被动察觉: 11
挑战等级: 4
经验值: 1100
熟练加值: 2
背景: |-
  来源：Call of the Netherdeep: Additional Netherdeep Monsters
  作者：Frozenfeet2
  原文：https://www.gmbinder.com/share/-N-lZxHyITwITQjoeP10
  优化参考：连枷蜗牛的反魔法甲壳，以及 Better Monsters 对“主动、可理解、可反制”甲壳机制的设计原则。
资源机制:
  资源:
    - ID: shell-resonance
      名称: 甲壳共鸣
      英文名: Shell Resonance
      载体:
        分区: 特性
        名称: 反魔法甲壳 (Antimagic Shell)
      初始: 0
      最大: 1
      恢复: none
      操作:
        - ID: gain-shell-resonance
          名称: 获得甲壳共鸣
          英文名: Gain Shell Resonance
          激活: special
          模式: gain
          数量: 1
          条件: 成功通过对抗法术的豁免检定，或法术攻击未命中时
        - ID: clear-shell-resonance
          名称: 破坏并清空甲壳共鸣
          英文名: Break and Clear Shell Resonance
          激活: special
          模式: clear
          条件: 从单一来源受到至少 10 点钝击或雷鸣伤害时
  消费:
    - ID: dazzling-refraction-cost
      资源: shell-resonance
      来源:
        分区: 附赠动作
        名称: 耀目折光 (Dazzling Refraction)
      模式: fixed
      数量: 1
    - ID: iridescent-haste-cost
      资源: shell-resonance
      来源:
        分区: 附赠动作
        名称: 流光加速 (Iridescent Haste)
      模式: fixed
      数量: 1
    - ID: force-resonance-cost
      资源: shell-resonance
      来源:
        分区: 附赠动作
        名称: 力场谐振 (Force Resonance)
      模式: fixed
      数量: 1
行为机制:
  版本: 1
  机制:
    - ID: caelian-resonance-relations
      类型: relation
      名称: 共鸣后续关系
      英文名: Resonance Follow-ups
      载体:
        分区: 特性
        名称: 反魔法甲壳 (Antimagic Shell)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: saveSuccess
        频率: unlimited
        条件: 成功通过对抗法术的豁免，或法术攻击未命中
      条件:
        - 点击资源操作获得甲壳共鸣；单次至少 10 点钝击或雷鸣伤害时清空
        - 破坏共鸣后反魔法甲壳失效到海蜗牛下一回合开始
      引用:
        - ID: antler
          角色: 力场谐振的下一次命中
          项目:
            分区: 动作
            名称: 角击 (Antler)
        - ID: dazzling
          角色: 目标下一次攻击劣势
          项目:
            分区: 附赠动作
            名称: 耀目折光 (Dazzling Refraction)
        - ID: break-resonance
          角色: 清空资源并抑制甲壳
          项目:
            分区: 特性
            名称: 破坏共鸣 (Break the Resonance)
      状态:
        - ID: force-resonance-primed
          名称: 力场谐振蓄势
          英文名: Force Resonance Primed
          目标: self
          状态: []
          变化: []
          持续:
            特殊: 本回合下一次角击命中或回合结束
          解除:
            - 下一次角击命中并结算 2d6 力场伤害后
            - 当前回合结束
        - ID: antimagic-shell-suppressed
          名称: 反魔法甲壳失效
          英文名: Antimagic Shell Suppressed
          目标: self
          状态: []
          变化: []
          持续:
            特殊: 直到海蜗牛下一回合开始
          解除:
            - 海蜗牛下一回合开始
      操作:
        - ID: prime-force-resonance
          名称: 应用力场谐振蓄势
          英文名: Prime Force Resonance
          激活: bonus
          类型: apply
          状态:
            - force-resonance-primed
          引用:
            - antler
          说明: 消费共鸣后应用标记；下一次角击命中追加 2d6 力场伤害并移除。
        - ID: suppress-caelian-shell
          名称: 标记甲壳失效
          英文名: Mark Shell Suppressed
          激活: special
          类型: apply
          状态:
            - antimagic-shell-suppressed
          引用:
            - break-resonance
          说明: 清空共鸣并标记反魔法甲壳失效，下一回合开始移除。
        - ID: resolve-dazzling-next-attack
          名称: 结算耀目折光下一次攻击
          英文名: Resolve Dazzling Next Attack
          激活: special
          类型: manual
          状态: []
          引用:
            - dazzling
          说明: 失败目标的下一次攻击具有劣势；该次攻击结算后移除标记。
      GM步骤:
        - 根据法术豁免成功或法术攻击未命中点击资源获得操作。
        - 力场谐振只在本回合下一次角击命中结算；耀目折光只影响目标下一次攻击。
        - 破坏共鸣时同时清空资源并应用甲壳失效标记。
    - ID: caelian-one-attack-defense
      类型: lifecycle
      名称: 单次甲壳防御
      英文名: One Attack Shell Defense
      载体:
        分区: 反应
        名称: 甲壳防御 (Shell Defense)
      表达覆盖: structured
      执行模式: core-operable
      规则来源: corpus-derived
      触发:
        事件: attackHit
        频率: unlimited
        条件: 海蜗牛将要被一次攻击命中
      条件:
        - AC +4 只针对触发攻击
      状态:
        - ID: caelian-shell-defense-ac
          名称: 甲壳防御 +4 AC
          英文名: Shell Defense +4 AC
          目标: self
          状态: []
          变化:
            - 键: system.attributes.ac.flat
              模式: 2
              值: "4"
          持续:
            特殊: 仅针对触发攻击
          解除:
            - 触发攻击结算后立即移除
      操作:
        - ID: apply-caelian-shell-defense
          名称: 应用单次甲壳防御
          英文名: Apply One Attack Shell Defense
          激活: reaction
          类型: apply
          状态:
            - caelian-shell-defense-ac
          引用: []
          说明: 应用 AC +4；触发攻击结算后立即移除。
---

这种大型海蜗牛原生于凯尔·莫罗的水下遗迹。它的魔法甲壳不会立刻随机反射每个法术，而会先储存一道清晰可见的共鸣，再由海蜗牛将其转化为光芒、速度或冲击力。

### 特性

- **反魔法甲壳 (Antimagic Shell)**：凯利安海蜗牛对抗法术进行的豁免检定具有优势，任何生物对它发动法术攻击时，其攻击检定具有劣势。若海蜗牛成功通过对抗法术的豁免检定，或一次法术攻击未命中它，则其甲壳获得 1 层**甲壳共鸣 (Shell Resonance)**；它同时只能拥有 1 层。

- **破坏共鸣 (Break the Resonance)**：若海蜗牛从单一来源受到至少 10 点钝击伤害或雷鸣伤害，它失去甲壳共鸣，且其**反魔法甲壳 (Antimagic Shell)** 失效，直到其下一回合开始。甲壳暗淡时，所有生物都能看出这一变化。

- **水下呼吸 (Water Breathing)**：海蜗牛只能在水下呼吸。

### 动作

- **多重攻击 (Multiattack)**：海蜗牛发动一次**角击 (Antler)**和两次**爪击 (Claw)**。

- **角击 (Antler)**：近战武器攻击：+5 命中，触及 5 尺，一个目标。
  - **命中**：8（`1d10 + 3`）点钝击伤害。

- **爪击 (Claw)**：近战武器攻击：+5 命中，触及 5 尺，一个目标。
  - **命中**：6（`1d6 + 3`）点挥砍伤害。

### 附赠动作

- **耀目折光 (Dazzling Refraction)**：海蜗牛消耗其甲壳共鸣。海蜗牛 15 尺内由它选择的每个生物必须成功通过一次 **DC 14 感知 (Wisdom) 豁免检定**，否则其下一次攻击检定具有劣势。

- **流光加速 (Iridescent Haste)**：海蜗牛消耗其甲壳共鸣，移动至多 15 尺，且此次移动不会引发借机攻击。

- **力场谐振 (Force Resonance)**：海蜗牛消耗其甲壳共鸣。本回合内，它下一次以**角击 (Antler)**命中时，额外造成 7（`2d6`）点力场伤害。

### 反应

- **甲壳防御 (Shell Defense)**：当海蜗牛将要被一次攻击命中时，它暂时缩入甲壳，使自己针对该次攻击的 AC 获得 +4 加值。

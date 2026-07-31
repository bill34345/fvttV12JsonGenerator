---
名称: 行为契约测试兽 (Behavior Contract Beast)
类型: npc
体型: 大型
生物类型: 异怪
阵营: 无阵营
能力:
  力量: 18
  敏捷: 12
  体质: 16
  智力: 6
  感知: 12
  魅力: 8
护甲等级: 15 (天生护甲)
生命值: 90 (12d10 + 24)
速度: 步行 30 尺
挑战等级: 6
熟练加值: 3
行为机制:
  版本: 1
  机制:
    - ID: next-hit-force
      类型: relation
      名称: 下一次命中附伤
      英文名: Next Hit Force
      载体:
        分区: 特性
        名称: 控制节点 (Control Node)
      表达覆盖: structured
      执行模式: core-operable
      规则来源: source-derived
      触发:
        事件: activityUsed
        频率: oncePerTurn
        条件: 使用蓄力后
      条件:
        - 只影响下一次重击命中
      引用:
        - ID: heavy-strike
          角色: 下一次命中活动
          项目:
            分区: 动作
            名称: 重击 (Heavy Strike)
      状态:
        - ID: force-primed
          名称: 力场蓄势
          英文名: Force Primed
          目标: self
          状态: []
          变化: []
          持续:
            特殊: 本回合下一次重击命中或回合结束
          解除:
            - 重击命中并结算附加伤害后
            - 当前回合结束
      操作:
        - ID: prime-force
          名称: 准备力场附伤
          英文名: Prime Force Damage
          激活: bonus
          类型: apply
          状态:
            - force-primed
          引用:
            - heavy-strike
          说明: 应用蓄势标记；下一次重击命中后结算 2d6 力场伤害并移除标记。
        - ID: resolve-force
          名称: 结算并移除力场附伤
          英文名: Resolve Force Damage
          激活: special
          类型: remove
          状态:
            - force-primed
          引用:
            - heavy-strike
          说明: 在下一次重击命中后结算附伤并移除蓄势标记。
      GM步骤: []
    - ID: shell-guard
      类型: lifecycle
      名称: 单次甲壳防护
      英文名: One Attack Shell Guard
      载体:
        分区: 反应
        名称: 甲壳防护 (Shell Guard)
      表达覆盖: structured
      执行模式: core-operable
      规则来源: corpus-derived
      触发:
        事件: attackHit
        频率: unlimited
        条件: 将要被一次攻击命中
      条件:
        - 仅对触发攻击有效
      引用: []
      状态:
        - ID: shell-guard-ac
          名称: 甲壳防护 +4 AC
          英文名: Shell Guard +4 AC
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
        - ID: apply-shell-guard
          名称: 应用单次甲壳防护
          英文名: Apply One Attack Shell Guard
          激活: reaction
          类型: apply
          状态:
            - shell-guard-ac
          引用: []
          说明: 应用 AC +4，结算触发攻击后立即移除。
      GM步骤: []
    - ID: grasp-capacity
      类型: capacity
      名称: 双爪容量
      英文名: Twin Claw Capacity
      载体:
        分区: 特性
        名称: 控制节点 (Control Node)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      条件:
        - 每只爪至多擒抱一个大型或更小生物
      引用: []
      状态: []
      操作: []
      GM步骤:
        - 命中并开始擒抱时点击占用槽位。
        - 擒抱结束时点击释放槽位。
      容量:
        槽位: 2
        体型限制: 大型或更小
        逃脱DC: 15
        获取: 每次成功开始擒抱时占用一个槽位。
        释放: 对应擒抱结束时释放一个槽位。
    - ID: planar-pool
      类型: choicePool
      名称: 位面选择
      英文名: Planar Choices
      载体:
        分区: 特性
        名称: 控制节点 (Control Node)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: corpus-derived
      条件:
        - 每回合选择两个互异选项
      引用: []
      状态: []
      操作: []
      GM步骤:
        - 回合开始依次点击两个不同的选择。
        - 选项被消费时移除对应标记，回合开始重置池。
      选择池:
        选择数: 2
        互异: true
        重置: turnStart
        候选:
          - ID: fire
            名称: 火焰
            英文名: Fire
            说明: 下一次命中附加火焰伤害。
          - ID: water
            名称: 潮汐
            英文名: Water
            说明: 下一次命中推开目标。
          - ID: earth
            名称: 大地
            英文名: Earth
            说明: 下一次命中施加束缚前置状态。
    - ID: undertow-area
      类型: area
      名称: 暗流区域
      英文名: Undertow Area
      载体:
        分区: 动作
        名称: 暗流 (Undertow)
      表达覆盖: structured
      执行模式: core-operable
      规则来源: source-derived
      触发:
        事件: activityUsed
        频率: unlimited
      条件:
        - 使用 60 尺长、15 尺宽的线形模板
      引用: []
      状态: []
      操作:
        - ID: place-undertow
          名称: 放置暗流模板
          英文名: Place Undertow Template
          激活: action
          类型: template
          状态: []
          引用: []
          说明: 放置 60×15 尺线形模板并按原动作结算。
          模板:
            形状: line
            尺寸: 60
            宽度: 15
            单位: ft
      GM步骤: []
    - ID: corruption-rule
      类型: externalRule
      名称: 绯晶腐化
      英文名: Ruidium Corruption
      载体:
        分区: 特性
        名称: 控制节点 (Control Node)
      表达覆盖: structured
      执行模式: external-rule
      规则来源: source-derived
      触发:
        事件: saveFailure
        频率: unlimited
        条件: 指定能力要求腐化豁免
      条件: []
      引用: []
      状态: []
      操作:
        - ID: resolve-corruption
          名称: 结算绯晶腐化
          英文名: Resolve Ruidium Corruption
          激活: special
          类型: manual
          状态: []
          引用: []
          说明: 进行 DC 14 魅力豁免，并按外部绯晶腐化规则结算。
      GM步骤:
        - 让目标进行 DC 14 魅力豁免。
        - 失败时查阅战役的绯晶腐化规则；本 Actor 不创建未定义的腐化层级。
      外部规则:
        名称: 绯晶腐化 (Ruidium Corruption)
        DC: 14
        属性: cha
        结果: 豁免失败则受到绯晶腐化；已经腐化则获得 1 级力竭。
---

### 特性

- **控制节点 (Control Node)**：承载行为契约测试。

### 动作

- **重击 (Heavy Strike)**：近战武器攻击：+7 命中，触及 10 尺，一个目标。命中：13（`2d8 + 4`）点钝击伤害。

- **暗流 (Undertow)**：测试区域操作。

### 反应

- **甲壳防护 (Shell Guard)**：当测试兽将要被一次攻击命中时，它针对该次攻击的 AC 获得 +4。

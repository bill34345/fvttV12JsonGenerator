---
名称: 污染壳爬兽 (Tainted Shellcreeper)
类型: npc
体型: 大型
生物类型: 异怪
阵营: 无阵营
能力:
  力量: 17
  敏捷: 5
  体质: 20
  智力: 3
  感知: 10
  魅力: 5
护甲等级: 13 (天生护甲)
生命值: 66 (6d10 + 18)
速度: 步行 15 尺, 游泳 15 尺
伤害抗性:
  - 火焰
伤害免疫:
  - 毒素
  - 心灵
状态免疫:
  - 中毒
感官:
  黑暗视觉: 60
  震颤感知: 60
  被动察觉: 10
挑战等级: 4
经验值: 1100
熟练加值: 2
背景: |-
  原始数据板：RAINING_DAYS，Made some homebrew Ruidium-corrupted enemies。
  来源帖：https://www.reddit.com/r/CalloftheNetherdeep/comments/wkmjjq/made_some_homebrew_ruidiumcorrupted_enemies/
  本地图片：Tainted Shellcreeper.png
  优化方向：把原版立即爆炸的反魔法甲壳改为可见的蓄能—释放循环；玩家可用钝击或雷鸣伤害主动过载甲壳。
资源机制:
  资源:
    - ID: shell-overload
      名称: 甲壳过载
      英文名: Shell Overload
      载体:
        分区: 特性
        名称: 反魔法甲壳 (Antimagic Shell)
      初始: 0
      最大: 2
      恢复: none
      操作:
        - ID: gain-shell-overload
          名称: 获得甲壳过载
          英文名: Gain Shell Overload
          激活: special
          模式: gain
          数量: 1
          条件: 成功通过对抗法术的豁免检定，或法术攻击未命中时
        - ID: clear-shell-overload
          名称: 击穿并清空甲壳过载
          英文名: Crack and Clear Shell Overload
          激活: special
          模式: clear
          条件: 从单一来源受到至少 10 点钝击或雷鸣伤害时
  消费:
    - ID: psychic-reverberations-overload
      资源: shell-overload
      来源:
        分区: 动作
        名称: 心灵回震 (Psychic Reverberations)
      模式: variable
      最小: 1
      最大: 2
      可选: true
      额外活动:
        名称: 心灵回震：释放甲壳过载
        英文名: "Psychic Reverberations: Release Shell Overload"
      缩放:
        伤害:
          基础: "3"
          每额外层: "3"
          类型: force
行为机制:
  版本: 1
  机制:
    - ID: shellcreeper-overload-lifecycle
      类型: trigger
      名称: 甲壳过载触发与破裂
      英文名: Shell Overload Trigger and Crack
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
        - 触发时获得 1 层甲壳过载，最多 2 层
        - 单次至少 10 点钝击或任何雷鸣伤害时清空过载、AC 降至 11 并抑制反魔法甲壳
      引用:
        - ID: crack-overload
          角色: 清空资源与甲壳破裂
          项目:
            分区: 特性
            名称: 击穿过载 (Crack the Overload)
        - ID: reverberations
          角色: 按消费量缩放并可能触发腐化
          项目:
            分区: 动作
            名称: 心灵回震 (Psychic Reverberations)
      状态:
        - ID: shellcreeper-cracked
          名称: 甲壳破裂：AC 11
          英文名: Cracked Shell AC 11
          目标: self
          状态: []
          变化:
            - 键: system.attributes.ac.flat
              模式: 5
              值: "11"
          持续:
            特殊: 直到壳爬兽下一回合开始
          解除:
            - 壳爬兽下一回合开始
      操作:
        - ID: apply-shellcreeper-crack
          名称: 应用甲壳破裂与抑制
          英文名: Apply Cracked Shell and Suppression
          激活: special
          类型: apply
          状态:
            - shellcreeper-cracked
          引用:
            - crack-overload
          说明: 先清空全部过载，再应用 AC 11 标记；标记存在时反魔法甲壳不生效。
        - ID: resolve-shellcreeper-overload
          名称: 结算过载获得或释放
          英文名: Resolve Overload Gain or Release
          激活: special
          类型: manual
          状态: []
          引用:
            - reverberations
          说明: 触发获得时点击资源获得；释放时使用按数量缩放的心灵回震活动。
      GM步骤:
        - 根据豁免成功或法术攻击未命中点击获得过载。
        - 破裂时点击清空资源并应用 AC 11 标记；下一回合开始移除标记。
        - 半血且一次消费 2 层、目标感知豁免失败时，再执行绯晶腐化操作。
    - ID: shellcreeper-defense-posture
      类型: lifecycle
      名称: 缩壳防御姿态
      英文名: Shell Defense Posture
      载体:
        分区: 动作
        名称: 缩壳防御 (Shell Defense)
      表达覆盖: structured
      执行模式: core-operable
      规则来源: source-derived
      引用:
        - ID: emerge-shell
          角色: 结束姿态
          项目:
            分区: 附赠动作
            名称: 破壳伸展 (Emerge from Shell)
      状态:
        - ID: shellcreeper-defending
          名称: 缩壳防御
          英文名: Shell Defense
          目标: self
          状态:
            - restrained
          变化:
            - 键: system.attributes.ac.flat
              模式: 2
              值: "4"
          持续:
            特殊: 直到使用破壳伸展
          解除:
            - 使用破壳伸展附赠动作
      操作:
        - ID: enter-shell-defense
          名称: 进入缩壳防御
          英文名: Enter Shell Defense
          激活: action
          类型: apply
          状态:
            - shellcreeper-defending
          引用: []
          说明: 应用 AC +4 与束缚。
        - ID: emerge-and-remove-defense
          名称: 破壳伸展并移除姿态
          英文名: Emerge and Remove Defense
          激活: bonus
          类型: remove
          状态:
            - shellcreeper-defending
          引用:
            - emerge-shell
          说明: 移除缩壳防御效果，同时结束 AC +4 与束缚。
    - ID: shellcreeper-ruidium-corruption
      类型: externalRule
      名称: 绯晶腐化
      英文名: Ruidium Corruption
      载体:
        分区: 特性
        名称: 绯晶腐化 (Ruidium Corruption)
      表达覆盖: structured
      执行模式: external-rule
      规则来源: source-derived
      触发:
        事件: saveFailure
        频率: unlimited
        条件: 半血且心灵回震一次消费 2 层，目标感知豁免失败
      操作:
        - ID: resolve-shellcreeper-corruption
          名称: 结算绯晶腐化
          英文名: Resolve Ruidium Corruption
          激活: special
          类型: manual
          状态: []
          引用: []
          说明: 目标进行 DC 14 魅力豁免，并按外部绯晶腐化规则结算。
      GM步骤:
        - 确认壳爬兽半血、一次消费 2 层且目标前置豁免失败。
        - 进行 DC 14 魅力豁免；失败时查阅外部腐化规则。
      外部规则:
        名称: 绯晶腐化 (Ruidium Corruption)
        DC: 14
        属性: cha
        结果: 失败则受到绯晶腐化；已经腐化则获得 1 级力竭。
---

污染壳爬兽的甲壳会吞入落空的法术，并在裂缝间积蓄破坏能量。蓄能越高，甲壳越明亮；沉重冲击可以在它主动释放能量前将共鸣震散。

### 特性

- **反魔法甲壳 (Antimagic Shell)**：壳爬兽对抗法术进行的豁免检定具有优势，任何生物对它发动法术攻击时，其攻击检定具有劣势。若壳爬兽成功通过对抗法术的豁免检定，或一次法术攻击未命中它，则获得 1 层**甲壳过载 (Shell Overload)**，最多 2 层。

- **击穿过载 (Crack the Overload)**：若壳爬兽从单一来源受到至少 10 点钝击伤害或雷鸣伤害，它失去所有甲壳过载层数；直到其下一回合开始，它的 AC 降至 11，且**反魔法甲壳 (Antimagic Shell)**失效。裂开的甲壳会明显暗淡。

- **绯晶腐化 (Ruidium Corruption)**：当一个生物因壳爬兽的能力进行绯晶腐化豁免时，它必须成功通过一次 **DC 14 魅力 (Charisma) 豁免检定**，否则受到绯晶腐化。若它已经受到绯晶腐化，则改为获得 1 级力竭。

### 动作

- **多重攻击 (Multiattack)**：壳爬兽发动两次**伪足 (Pseudopod)**攻击。

- **伪足 (Pseudopod)**：近战武器攻击：+5 命中，触及 10 尺，一个目标。
  - **命中**：4（`1d8`）点钝击伤害，外加 4（`1d8`）点心灵伤害。

- **心灵回震 (Psychic Reverberations, 充能 6)**：壳爬兽释放一道心灵脉冲。其 30 尺内由它选择的每个生物必须进行一次 **DC 15 感知 (Wisdom) 豁免检定**。壳爬兽可以消耗任意层甲壳过载，使伤害每层增加 3 点力场伤害。
  - **豁免失败**：受到 9（`2d8`）点心灵伤害。若壳爬兽消耗了甲壳过载，目标还受到过载产生的力场伤害。直到其下一回合结束前，目标对壳爬兽进行的攻击检定具有劣势。
  - **豁免成功**：受到一半伤害，且攻击检定不受影响。
  - 若壳爬兽的生命值不高于其生命值上限的一半，且它以此能力同时消耗 2 层甲壳过载，则豁免失败的生物还必须进行一次绯晶腐化豁免。

- **缩壳防御 (Shell Defense)**：壳爬兽缩入甲壳。直到它重新伸展身体前，其 AC 获得 +4 加值，且它陷入束缚。它可以在自己的回合用一个附赠动作结束此效果。

### 附赠动作

- **破壳伸展 (Emerge from Shell)**：壳爬兽结束自身的**缩壳防御 (Shell Defense)**。

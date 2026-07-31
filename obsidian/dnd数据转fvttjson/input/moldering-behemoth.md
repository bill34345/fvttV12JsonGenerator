---
名称: 腐朽巨兽 (Moldering Behemoth)
类型: npc
体型: 大型
生物类型: 异怪
阵营: 无阵营
能力:
  力量: 20
  敏捷: 9
  体质: 18
  智力: 11
  感知: 8
  魅力: 3
护甲等级: 14 (天生护甲)
生命值: 133 (14d10 + 56)
速度: 步行 30 尺
技能:
  运动: 9
  察觉: 3
伤害易伤:
  - 雷鸣
伤害抗性:
  - 心灵
伤害免疫:
  - 毒素
状态免疫:
  - 魅惑
  - 恐慌
  - 麻痹
  - 中毒
感官:
  黑暗视觉: 60
  被动察觉: 13
语言备注: 理解通用语但不会说
挑战等级: 9
经验值: 5000
熟练加值: 4
背景: |-
  原始数据板：RAINING_DAYS，Made some homebrew Ruidium-corrupted enemies。
  来源帖：https://www.reddit.com/r/CalloftheNetherdeep/comments/wkmjjq/made_some_homebrew_ruidiumcorrupted_enemies/
  本地图片：Moldering Behemoth.png
  优化方向：保留鲁莽、冲锋、顺劈与较弱魔法吸收；加入可由雷鸣或重击开启的晶体裂隙，以及半血时防御下降、机动增强的阶段变化。
行为机制:
  版本: 1
  机制:
    - ID: behemoth-turn-and-charge
      类型: relation
      名称: 鲁莽与冲锋联动
      英文名: Reckless and Charge Relations
      载体:
        分区: 特性
        名称: 鲁莽 (Reckless)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      条件:
        - 回合开始选择鲁莽后，本回合近战攻击有优势且到下一回合开始前攻击它也有优势
        - 直线移动至少 10 尺且同回合晶拳命中才触发冲锋
      引用:
        - ID: behemoth-fist
          角色: 冲锋命中活动
          项目:
            分区: 动作
            名称: 晶拳 (Crystal Fist)
        - ID: behemoth-charge
          角色: 冲锋附加效果
          项目:
            分区: 特性
            名称: 冲锋 (Charge)
      状态:
        - ID: behemoth-reckless-state
          名称: 鲁莽
          英文名: Reckless
          目标: self
          状态: []
          变化: []
          持续:
            特殊: 直到巨兽下一回合开始
          解除:
            - 巨兽下一回合开始
      操作:
        - ID: apply-behemoth-reckless
          名称: 应用鲁莽回合状态
          英文名: Apply Reckless Turn State
          激活: special
          类型: apply
          状态:
            - behemoth-reckless-state
          引用: []
          说明: 标记本回合近战攻击优势与敌方攻击优势窗口。
        - ID: resolve-behemoth-charge
          名称: 结算晶拳冲锋
          英文名: Resolve Crystal Fist Charge
          激活: special
          类型: forward
          状态: []
          引用:
            - behemoth-fist
            - behemoth-charge
          说明: 验证 10 尺直线移动与晶拳命中后，追加 2d8 穿刺并结算推开与倒地。
      GM步骤:
        - 回合开始决定是否应用鲁莽标记，并在下一回合开始移除。
        - 只有移动与命中条件同时满足时结算冲锋。
    - ID: behemoth-fault-and-bloodied-stage
      类型: stage
      名称: 晶体裂隙与首次濒血阶段
      英文名: Crystal Fault and First Bloodied Stage
      载体:
        分区: 特性
        名称: 濒血崩晶 (Bloodied Crystal Rupture)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: hpThreshold
        频率: firstOccurrence
        条件: 生命值第一次降至 66 或更低
      条件:
        - 单次至少 15 点钝击或任何雷鸣伤害时，魔法抗性与弱效魔法吸收到下一回合开始失效
        - 濒血阶段永久将 AC 改为 12、步行速度改为 40 尺，且只能触发一次
      引用:
        - ID: crystal-fault
          角色: 临时抑制魔法特性
          项目:
            分区: 特性
            名称: 晶体裂隙 (Crystal Fault)
        - ID: magic-absorption
          角色: 裂隙抑制与动态实伤
          项目:
            分区: 反应
            名称: 弱效魔法吸收 (Lesser Magic Absorption)
      状态:
        - ID: behemoth-crystal-fault
          名称: 晶体裂隙：魔法特性失效
          英文名: Crystal Fault Suppression
          目标: self
          状态: []
          变化: []
          持续:
            特殊: 直到巨兽下一回合开始
          解除:
            - 巨兽下一回合开始
        - ID: behemoth-bloodied-stage
          名称: 永久濒血阶段
          英文名: Permanent Bloodied Stage
          目标: self
          状态: []
          变化:
            - 键: system.attributes.ac.flat
              模式: 5
              值: "12"
            - 键: system.attributes.movement.walk
              模式: 5
              值: "40"
          持续:
            特殊: 永久；首次触发后不得重复
          解除:
            - 不自动解除
      操作:
        - ID: apply-behemoth-crystal-fault
          名称: 应用晶体裂隙抑制
          英文名: Apply Crystal Fault Suppression
          激活: special
          类型: apply
          状态:
            - behemoth-crystal-fault
          引用:
            - crystal-fault
          说明: 标记魔法抗性与弱效魔法吸收暂时失效。
        - ID: enter-behemoth-bloodied-stage
          名称: 进入永久濒血阶段
          英文名: Enter Permanent Bloodied Stage
          激活: special
          类型: apply
          状态:
            - behemoth-bloodied-stage
          引用: []
          说明: 首次降至 66 HP 时结算爆裂后应用永久 AC 12 与速度 40。
        - ID: resolve-lesser-magic-absorption
          名称: 结算弱效魔法吸收
          英文名: Resolve Lesser Magic Absorption
          激活: reaction
          类型: manual
          状态: []
          引用:
            - magic-absorption
          说明: 巨兽只承受实际法术伤害的一半；60 尺内施法者豁免失败则承受另一半。
      GM步骤:
        - 裂隙状态存在时禁用魔法抗性和弱效魔法吸收。
        - 用永久阶段标记记录首次触发，生命值后来回升或再次跨越阈值不得重复爆裂。
        - 弱效魔法吸收按触发的实际伤害手工取半并转移，核心不监听跨 Actor 伤害。
    - ID: behemoth-ruidium-corruption
      类型: externalRule
      名称: 濒血崩晶腐化
      英文名: Bloodied Rupture Corruption
      载体:
        分区: 特性
        名称: 绯晶腐化 (Ruidium Corruption)
      表达覆盖: structured
      执行模式: external-rule
      规则来源: source-derived
      触发:
        事件: saveFailure
        频率: firstOccurrence
        条件: 首次濒血崩晶的敏捷豁免失败
      操作:
        - ID: resolve-behemoth-corruption
          名称: 结算濒血腐化
          英文名: Resolve Bloodied Corruption
          激活: special
          类型: manual
          状态: []
          引用: []
          说明: 目标进行 DC 16 魅力豁免并查阅外部腐化规则。
      GM步骤:
        - 只对首次爆裂敏捷豁免失败的目标执行。
        - 进行 DC 16 魅力豁免；失败时按外部规则结算。
      外部规则:
        名称: 绯晶腐化 (Ruidium Corruption)
        DC: 16
        属性: cha
        结果: 失败则受到绯晶腐化；已经腐化则获得 1 级力竭。
---

腐朽巨兽是一团被绯晶勉强维持形体的腐败肌肉。它起初依赖完整晶壳抵御魔法；晶壳破裂后，它会放弃防御，以更快、更凶暴的步伐碾过战场。

### 特性

- **鲁莽 (Reckless)**：腐朽巨兽在其回合开始时可以令本回合所有近战武器攻击检定具有优势；若如此做，直到其下一回合开始前，对它进行的攻击检定也具有优势。

- **冲锋 (Charge)**：若巨兽沿直线向一个目标移动至少 10 尺，并在同一回合以**晶拳 (Crystal Fist)**命中该目标，则目标额外受到 9（`2d8`）点穿刺伤害。若目标为生物，其必须成功通过一次 **DC 16 力量 (Strength) 豁免检定**，否则被推开 10 尺并陷入倒地。

- **魔法抗性 (Magic Resistance)**：巨兽对抗法术和其他魔法效应进行的豁免检定具有优势。

- **晶体裂隙 (Crystal Fault)**：若巨兽从单一来源受到至少 15 点钝击伤害或任何雷鸣伤害，则直到其下一回合开始，它失去**魔法抗性 (Magic Resistance)**，且不能使用**弱效魔法吸收 (Lesser Magic Absorption)**。晶体失去光泽时，所有生物都能看出这一变化。

- **濒血崩晶 (Bloodied Crystal Rupture)**：巨兽第一次被降至 66 点生命值或更低时，晶体从其身体爆裂。其 10 尺内的每个其他生物必须进行一次 **DC 16 敏捷豁免**，豁免失败受到 10（`3d6`）点穿刺伤害，成功则受到一半伤害。豁免失败的生物还必须进行一次绯晶腐化豁免。此后巨兽的 AC 降至 12，步行速度提高至 40 尺。

- **绯晶腐化 (Ruidium Corruption)**：当一个生物因巨兽的能力进行绯晶腐化豁免时，它必须成功通过一次 **DC 16 魅力 (Charisma) 豁免检定**，否则受到绯晶腐化。若它已经受到绯晶腐化，则改为获得 1 级力竭。

### 动作

- **多重攻击 (Multiattack)**：巨兽发动两次攻击：一次**巨斧 (Greataxe)**和一次**晶拳 (Crystal Fist)**。它可以用**横扫 (Cleaving Swing)**替代其中一次攻击。

- **巨斧 (Greataxe)**：近战武器攻击：+9 命中，触及 5 尺，一个目标。
  - **命中**：11（`1d12 + 5`）点挥砍伤害，外加 6（`1d12`）点心灵伤害。

- **晶拳 (Crystal Fist)**：近战武器攻击：+9 命中，触及 5 尺，一个目标。
  - **命中**：14（`2d8 + 5`）点心灵伤害。

- **横扫 (Cleaving Swing)**：巨兽挥动巨斧横扫。其 5 尺内由它选择的每个生物必须进行一次 **DC 16 敏捷 (Dexterity) 豁免检定**。
  - **豁免失败**：受到 18（`4d8`）点挥砍伤害。
  - **豁免成功**：受到一半伤害。

### 反应

- **弱效魔法吸收 (Lesser Magic Absorption)**：当巨兽因法术受到伤害时，它只承受触发伤害的一半，向下取整。若施法者位于巨兽 60 尺内，施法者必须成功通过一次 **DC 14 敏捷 (Dexterity) 豁免检定**，否则承受触发伤害的另一半。

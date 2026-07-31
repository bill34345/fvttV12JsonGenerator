---
名称: 腐化海龙 (Corrupted Seadragon)
类型: npc
体型: 大型
生物类型: 异怪
阵营: 无阵营
能力:
  力量: 16
  敏捷: 12
  体质: 15
  智力: 6
  感知: 12
  魅力: 10
护甲等级: 14 (天生护甲)
生命值: 93 (11d10 + 33)
速度: 步行 0 尺, 游泳 40 尺
豁免熟练:
  体质: 5
  感知: 4
  魅力: 4
伤害免疫:
  - 毒素
感官:
  盲视: 20
  被动察觉: 11
挑战等级: 4
经验值: 1100
熟练加值: 2
背景: |-
  来源：Call of the Netherdeep: Additional Netherdeep Monsters
  作者：Frozenfeet2
  原文：https://www.gmbinder.com/share/-N-lZxHyITwITQjoeP10
  优化方向：保留冲锋与心灵漩涡，形成“冲入—喷吐—借水流撤离”的单一循环，并让光耀或雷鸣伤害可以暂时打断绯晶共鸣。
行为机制:
  版本: 1
  机制:
    - ID: seadragon-combat-relations
      类型: relation
      名称: 冲锋、漩涡与回流联动
      英文名: Charge, Maelstrom, and Slipstream Relations
      载体:
        分区: 特性
        名称: 冲锋 (Charge)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      条件:
        - 直线移动至少 20 尺且同回合撞击命中才结算冲锋附伤、推开与豁免
        - 心灵漩涡只在每个生物每回合第一次于 10 尺内开始回合时触发
        - 只有本回合使用撞击或吐息后才可使用回流撤离
      引用:
        - ID: seadragon-ram
          角色: 冲锋命中活动
          项目:
            分区: 动作
            名称: 撞击 (Ram)
        - ID: seadragon-maelstrom
          角色: 每生物每回合一次光环
          项目:
            分区: 特性
            名称: 心灵漩涡 (Psychic Maelstrom)
        - ID: seadragon-breath
          角色: 回流撤离前置与半血腐化
          项目:
            分区: 动作
            名称: 腐毒吐息 (Corrosive Poison Breath)
        - ID: seadragon-slipstream
          角色: 使用撞击或吐息后的移动
          项目:
            分区: 附赠动作
            名称: 回流撤离 (Slipstream Retreat)
      操作:
        - ID: resolve-seadragon-charge
          名称: 结算冲锋命中
          英文名: Resolve Charge Hit
          激活: special
          类型: forward
          状态: []
          引用:
            - seadragon-ram
          说明: 验证 20 尺直线移动与撞击命中后，追加 2d8 钝击并结算 DC 14 力量豁免与推开。
        - ID: resolve-seadragon-maelstrom
          名称: 结算心灵漩涡首次触发
          英文名: Resolve First Maelstrom Trigger
          激活: special
          类型: manual
          状态: []
          引用:
            - seadragon-maelstrom
          说明: 仅在该生物本回合第一次于 10 尺内开始回合时结算。
        - ID: resolve-seadragon-slipstream
          名称: 确认回流撤离
          英文名: Confirm Slipstream Retreat
          激活: bonus
          类型: move
          状态: []
          引用:
            - seadragon-breath
            - seadragon-slipstream
          说明: 本回合已使用撞击或吐息时游动 15 尺且不引发借机攻击。
      GM步骤:
        - 分别记录本回合直线移动距离、撞击/吐息使用历史与每个目标的漩涡首次触发。
        - 只有前置条件满足时使用对应结算操作。
    - ID: seadragon-fracture-and-corruption
      类型: externalRule
      名称: 绯晶裂隙与半血腐化
      英文名: Ruidium Fracture and Bloodied Corruption
      载体:
        分区: 特性
        名称: 绯晶裂隙 (Ruidium Fracture)
      表达覆盖: structured
      执行模式: external-rule
      规则来源: source-derived
      触发:
        事件: damageTaken
        频率: unlimited
        条件: 单次至少 10 点光耀或雷鸣伤害
      条件:
        - 裂隙抑制心灵漩涡与腐化到海龙下一回合开始
        - 半血吐息且目标体质豁免失败时才进行腐化豁免
      状态:
        - ID: seadragon-ruidium-suppressed
          名称: 绯晶能力失效
          英文名: Ruidium Abilities Suppressed
          目标: self
          状态: []
          变化: []
          持续:
            特殊: 直到海龙下一回合开始
          解除:
            - 海龙下一回合开始
      操作:
        - ID: apply-seadragon-fracture
          名称: 应用绯晶裂隙抑制
          英文名: Apply Ruidium Fracture Suppression
          激活: special
          类型: apply
          状态:
            - seadragon-ruidium-suppressed
          引用: []
          说明: 标记心灵漩涡与腐化暂时失效。
        - ID: resolve-seadragon-corruption
          名称: 结算半血吐息腐化
          英文名: Resolve Bloodied Breath Corruption
          激活: special
          类型: manual
          状态: []
          引用: []
          说明: 对满足半血吐息失败条件的目标进行 DC 13 魅力豁免。
      GM步骤:
        - 裂隙状态存在时不要触发心灵漩涡或腐化。
        - 确认海龙半血且吐息前置豁免失败，再进行 DC 13 魅力豁免。
      外部规则:
        名称: 绯晶腐化 (Ruidium Corruption)
        DC: 13
        属性: cha
        结果: 失败则受到绯晶腐化；已经腐化则获得 1 级力竭。
---

腐化海龙身上的绯晶增生物持续向周围放射痛苦。它们并不恋战，而是借助长直水道反复冲过敌阵，在掠过猎物后迅速回身准备下一次冲锋。

### 特性

- **冲锋 (Charge)**：若腐化海龙沿直线向一个目标移动至少 20 尺，并在同一回合以**撞击 (Ram)**命中该目标，则目标额外受到 9（`2d8`）点钝击伤害，并必须成功通过一次 **DC 14 力量 (Strength) 豁免检定**，否则被推开 10 尺。

- **心灵漩涡 (Psychic Maelstrom)**：一个生物每回合第一次在腐化海龙 10 尺内开始回合时，必须成功通过一次 **DC 13 感知 (Wisdom) 豁免检定**，否则受到 7（`2d6`）点心灵伤害，且直到其回合结束前不能执行反应。

- **绯晶裂隙 (Ruidium Fracture)**：若腐化海龙从单一来源受到至少 10 点光耀伤害或雷鸣伤害，其绯晶增生物失去光泽。直到其下一回合开始，**心灵漩涡 (Psychic Maelstrom)** 失效，且它不能令生物进行绯晶腐化豁免。

- **绯晶腐化 (Ruidium Corruption)**：当一个生物因腐化海龙的能力进行绯晶腐化豁免时，它必须成功通过一次 **DC 13 魅力 (Charisma) 豁免检定**，否则受到绯晶腐化。若它已经受到绯晶腐化，则改为获得 1 级力竭 (1 Level of Exhaustion)。

- **水下呼吸 (Water Breathing)**：腐化海龙只能在水下呼吸。

### 动作

- **撞击 (Ram)**：近战武器攻击：+6 命中，触及 5 尺，一个目标。
  - **命中**：12（`2d8 + 3`）点钝击伤害。

- **腐毒吐息 (Corrosive Poison Breath, 充能 5–6)**：腐化海龙喷出覆盖 15 尺锥形区域的毒雾。区域内的每个生物必须进行一次 **DC 14 体质 (Constitution) 豁免检定**。
  - **豁免失败**：受到 24（`7d6`）点毒素伤害。
  - **豁免成功**：受到一半伤害。
  - 若腐化海龙的生命值不高于其生命值上限的一半，豁免失败的生物还必须进行一次绯晶腐化豁免。

### 附赠动作

- **回流撤离 (Slipstream Retreat)**：腐化海龙在本回合使用撞击或腐毒吐息后，可以游动至多 15 尺，且此次移动不会引发借机攻击。

---
名称: 晶血龙兽 (Crystalbleed Drakon)
类型: npc
体型: 超巨型
生物类型: 龙
阵营: 通常中立邪恶
能力:
  力量: 18
  敏捷: 14
  体质: 16
  智力: 12
  感知: 14
  魅力: 16
护甲等级: 17 (天生护甲)
生命值: 133 (14d12 + 42)
速度: 步行 40 尺, 掘穴 30 尺, 飞行 80 尺, 游泳 40 尺
豁免熟练:
  敏捷: 6
  体质: 7
  感知: 6
  魅力: 7
技能:
  察觉: 6
  游说: 7
  隐匿: 6
伤害抗性:
  - 毒素
  - 心灵
状态免疫:
  - 魅惑
  - 恐慌
  - 中毒
感官:
  盲视: 60
  黑暗视觉: 150
  被动察觉: 16
语言:
  - 通用语
  - 龙语
  - 地下通用语
挑战等级: 9
经验值: 5000
熟练加值: 4
背景: |-
  原始数据板：RAINING_DAYS，Made some homebrew Ruidium-corrupted enemies。
  来源帖：https://www.reddit.com/r/CalloftheNetherdeep/comments/wkmjjq/made_some_homebrew_ruidiumcorrupted_enemies/
  本地图片：Crystalbleed Drakon.png
  优化方向：保留原版吐息与传奇动作；把传奇抗性改成会碎裂晶甲、暂时降低防御的绯晶拒绝，并为持续恐慌加入盟友可执行的救援动作。
行为机制:
  版本: 1
  机制:
    - ID: drakon-defiance-state
      类型: lifecycle
      名称: 绯晶拒绝代价
      英文名: Ruidium Defiance Cost
      载体:
        分区: 特性
        名称: 绯晶拒绝 (Ruidium Defiance)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: saveFailure
        频率: unlimited
        条件: 消耗每日次数把失败改为成功
      条件:
        - 到龙兽下一回合结束前 AC 15 且失去心灵抗性
      状态:
        - ID: drakon-defiance-cost
          名称: 绯晶拒绝：AC 15 且无心灵抗性
          英文名: Defiance AC 15 and No Psychic Resistance
          目标: self
          状态: []
          变化:
            - 键: system.attributes.ac.flat
              模式: 5
              值: "15"
          持续:
            特殊: 直到龙兽下一回合结束
          解除:
            - 龙兽下一回合结束
      操作:
        - ID: apply-drakon-defiance
          名称: 将失败改为成功并应用代价
          英文名: Convert Failure and Apply Cost
          激活: special
          类型: apply
          状态:
            - drakon-defiance-cost
          引用: []
          说明: 先消耗绯晶拒绝次数，再把豁免改为成功并应用 AC 15 标记；标记存在时手工移除心灵抗性。
      GM步骤:
        - 使用原 Item 次数记录每日两次。
        - 标记存在时忽略心灵抗性，下一回合结束移除标记。
    - ID: drakon-tail-and-legendary-relations
      类型: relation
      名称: 尾击分支与传奇转发
      英文名: Tail Choice and Legendary Forwarding
      载体:
        分区: 动作
        名称: 尾击 (Tail)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: attackHit
        频率: unlimited
        条件: 尾击命中生物后
      条件:
        - 每次命中只选择推退或扫倒之一
        - 传奇尾击调用同一尾击攻击及其二选一分支
        - 血液支配要求另一 Actor 使用反应发动真实近战攻击
      引用:
        - ID: tail-shove
          角色: 命中后二选一
          项目:
            分区: 特性
            名称: 尾击推退 (Tail Shove)
        - ID: tail-sweep
          角色: 命中后二选一
          项目:
            分区: 特性
            名称: 尾击扫倒 (Tail Sweep)
        - ID: legendary-tail
          角色: 转发尾击
          项目:
            分区: 传奇动作
            名称: 尾击 (Tail Attack)
        - ID: command-blood
          角色: 强迫其他 Actor 反应攻击
          项目:
            分区: 传奇动作
            名称: 血液支配 (Command the Blood)
      操作:
        - ID: resolve-drakon-tail-choice
          名称: 选择尾击推退或扫倒
          英文名: Choose Tail Shove or Sweep
          激活: special
          类型: choose
          状态: []
          引用:
            - tail-shove
            - tail-sweep
          说明: 命中后只结算一个 DC 16 力量豁免分支。
        - ID: forward-legendary-tail
          名称: 传奇动作转发尾击
          英文名: Forward Legendary Tail
          激活: special
          类型: forward
          状态: []
          引用:
            - legendary-tail
          说明: 使用现有尾击攻击，不创建数值副本；命中后仍选择一个分支。
        - ID: resolve-command-blood
          名称: 结算血液支配
          英文名: Resolve Command the Blood
          激活: special
          类型: manual
          状态: []
          引用:
            - command-blood
          说明: 目标豁免失败且能执行反应时，由该目标 Actor 发动一次合法近战武器攻击。
      GM步骤:
        - 尾击命中后只点选一个分支。
        - 传奇尾击从主尾击 Item 执行；血液支配切换到目标 Actor 并消耗其反应。
    - ID: drakon-nightmare-lifecycle
      类型: lifecycle
      名称: 噩梦吐息恐慌与盟友救援
      英文名: Nightmare Fright and Ally Rescue
      载体:
        分区: 动作
        名称: 噩梦吐息 (Nightmare Breath)
      表达覆盖: structured
      执行模式: core-operable
      规则来源: corpus-derived
      触发:
        事件: saveFailure
        频率: unlimited
      条件:
        - 攻击区域为 60 尺锥形；5 尺只属于盟友救援距离
      状态:
        - ID: drakon-nightmare-fright
          名称: 噩梦吐息恐慌
          英文名: Nightmare Breath Fright
          目标: selected
          状态:
            - frightened
          变化: []
          持续:
            轮: 10
            特殊: 每回合结束重复 DC 16 感知豁免
          解除:
            - 回合结束重复豁免成功
            - 5 尺内盟友以动作通过 DC 15 运动或医药检定
      操作:
        - ID: apply-drakon-nightmare-fright
          名称: 应用噩梦恐慌
          英文名: Apply Nightmare Fright
          激活: special
          类型: apply
          状态:
            - drakon-nightmare-fright
          引用: []
          说明: 仅对初始感知豁免失败目标应用。
        - ID: rescue-drakon-nightmare
          名称: 拔除晶刺并解除恐慌
          英文名: Remove Shard and End Fright
          激活: action
          类型: remove
          状态:
            - drakon-nightmare-fright
          引用: []
          说明: 5 尺内盟友 DC 15 运动或医药检定成功后移除。
    - ID: drakon-ruidium-corruption
      类型: externalRule
      名称: 绯晶腐化
      英文名: Ruidium Corruption
      载体:
        分区: 特性
        名称: 绯晶腐化 (Ruidium Corruption)
      表达覆盖: structured
      执行模式: external-rule
      规则来源: source-derived
      操作:
        - ID: resolve-drakon-corruption
          名称: 结算绯晶腐化
          英文名: Resolve Ruidium Corruption
          激活: special
          类型: manual
          状态: []
          引用: []
          说明: 进行 DC 16 魅力豁免并按外部规则结算。
      GM步骤:
        - 只在源能力明确要求腐化豁免时执行。
        - 失败时查阅外部腐化规则。
      外部规则:
        名称: 绯晶腐化 (Ruidium Corruption)
        DC: 16
        属性: cha
        结果: 失败则受到绯晶腐化；已经腐化则获得 1 级力竭。
---

晶血龙兽全身的晶体会随心跳渗出暗红液体。它能借晶体拒绝一次致命魔法，但每次这样做都会暴露一段失去光泽的软鳞；其噩梦吐息留下的绯晶刺也可以被盟友强行拔除。

### 特性

- **两栖 (Amphibious)**：晶血龙兽可以在空气和水中呼吸。

- **绯晶拒绝 (Ruidium Defiance, 2/日)**：若龙兽豁免失败，它可以改为豁免成功。作为代价，晶体护甲碎裂；直到其下一回合结束，AC 降至 15，且失去心灵伤害抗性。此变化清晰可见。

- **绯晶腐化 (Ruidium Corruption)**：当一个生物因龙兽的能力进行绯晶腐化豁免时，它必须成功通过一次 **DC 16 魅力 (Charisma) 豁免检定**，否则受到绯晶腐化。若它已经受到绯晶腐化，则改为获得 1 级力竭。

- **尾击推退 (Tail Shove)**：当龙兽以**尾击 (Tail)**命中一个生物并选择推退时，目标必须成功通过一次 **DC 16 力量豁免**，否则被推开 10 尺。

- **尾击扫倒 (Tail Sweep)**：当龙兽以**尾击 (Tail)**命中一个生物并选择扫倒时，目标必须成功通过一次 **DC 16 力量豁免**，否则陷入倒地 (Prone) 状态。

### 动作

- **多重攻击 (Multiattack)**：龙兽发动三次攻击：一次**啃咬 (Bite)**和两次**爪击 (Claw)**。

- **啃咬 (Bite)**：近战武器攻击：+9 命中，触及 10 尺，一个目标。
  - **命中**：17（`2d10 + 4`）点穿刺伤害，外加 3（`1d6`）点心灵伤害。

- **爪击 (Claw)**：近战武器攻击：+9 命中，触及 5 尺，一个目标。
  - **命中**：11（`2d6 + 4`）点挥砍伤害。

- **尾击 (Tail)**：近战武器攻击：+9 命中，触及 15 尺，一个目标。
  - **命中**：8（`1d8 + 4`）点钝击伤害。若目标为生物，龙兽随后选择并解析**尾击推退 (Tail Shove)**或**尾击扫倒 (Tail Sweep)**。

- **噩梦吐息 (Nightmare Breath, 充能 5–6)**：龙兽吐出覆盖 60 尺锥形区域的红雾。区域内每个生物必须进行一次 **DC 16 感知 (Wisdom) 豁免检定**。
  - **豁免失败**：受到 22（`4d10`）点心灵伤害，并陷入恐慌，持续 1 分钟。
  - **豁免成功**：受到一半伤害，且不陷入恐慌。
  - 受影响的生物可以在其每个回合结束时重复该豁免，成功则结束恐慌。其 5 尺内的另一生物也可以用一个动作进行一次 **DC 15 运动或医药检定 (Athletics or Medicine Check)**，拔除引发幻觉的绯晶刺并结束该生物的恐慌。

### 传奇动作

晶血龙兽拥有 3 个传奇动作，可从以下选项中选择。每次只能使用一个传奇动作选项，且只能在另一个生物的回合结束时使用。龙兽在其回合开始时恢复所有已消耗的传奇动作。

- **尾击 (Tail Attack)**：龙兽发动一次尾击。

- **血液支配 (Command the Blood)**：龙兽选择一个它能看见且位于 30 尺内的生物。目标必须成功通过一次 **DC 16 感知豁免**；生命值未受损的目标进行此次豁免时具有优势。豁免失败时，目标必须使用其反应对龙兽选择的、位于目标触及范围内的另一个生物发动一次近战武器攻击。若没有合法目标或目标不能执行反应，则此效果无效。

- **晶片齐射 (Shard Salvo，消耗 2 动作)**：龙兽向一个它能看见且位于 30 尺内的生物射出水晶碎片。目标必须进行一次 **DC 16 体质 (Constitution) 豁免检定**。
  - **豁免失败**：受到 14（`4d6`）点心灵伤害，并陷入中毒，持续 1 分钟。目标可以在其每个回合结束时重复该豁免，成功则结束中毒。
  - 若龙兽的生命值不高于其生命值上限的一半，豁免失败的目标还必须进行一次绯晶腐化豁免。

- **掠流滑翔 (Current Glide)**：龙兽移动至多其速度的一半，且此次移动不会引发借机攻击。

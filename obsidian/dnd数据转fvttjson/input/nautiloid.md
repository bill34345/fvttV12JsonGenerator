---
名称: 鹦鹉螺巨兽 (Nautiloid)
类型: npc
体型: 超巨型
生物类型: 异怪
阵营: 无阵营
能力:
  力量: 22
  敏捷: 8
  体质: 20
  智力: 14
  感知: 13
  魅力: 6
护甲等级: 17 (天生护甲)
生命值: 232 (15d20 + 75)
速度: 步行 0 尺, 游泳 60 尺
伤害免疫:
  - 寒冷
  - 毒素
  - 心灵
感官:
  黑暗视觉: 120
  被动察觉: 11
语言备注: 理解深潜语但不会说；心灵感应 120 尺
挑战等级: 13
经验值: 10000
熟练加值: 5
背景: |-
  来源：Call of the Netherdeep: Additional Netherdeep Monsters
  作者：Frozenfeet2
  原文：https://www.gmbinder.com/share/-N-lZxHyITwITQjoeP10
  优化方向：保留八种位面触手，但把随机结果改为每回合公开的三种不同调谐；加入有代价的传奇抗性与低伤害传奇动作，使它能作为五名 13 级角色面对的独立大型威胁。
行为机制:
  版本: 1
  机制:
    - ID: nautiloid-planar-choice-pool
      类型: choicePool
      名称: 位面调谐
      英文名: Planar Attunement
      载体:
        分区: 特性
        名称: 位面调谐 (Planar Attunement)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      条件:
        - 每回合开始选择三个互异调谐并公开
        - 本回合前三次触手命中各消费一个尚未使用的已选调谐
      GM步骤:
        - 回合开始点击三个不同候选并公开 Actor 上的选择标记。
        - 每次触手命中后选择一个尚未消费的标记，结算其效果并移除。
        - 回合开始重置选择池并移除旧标记；位面排斥禁用的候选在窗口内不得选择。
      选择池:
        选择数: 3
        互异: true
        重置: turnStart
        候选:
          - ID: feywild
            名称: 妖精荒野
            英文名: Feywild
            说明: DC 17 感知失败则魅惑 1 分钟，回合末重复豁免，巨兽伤害目标时结束。
          - ID: shadowfell
            名称: 堕影冥界
            英文名: Shadowfell
            说明: 以目标为中心产生 15 尺半径魔法黑暗到巨兽下一回合开始。
          - ID: water
            名称: 水元素位面
            英文名: Plane of Water
            说明: DC 17 力量失败则推开 30 尺。
          - ID: earth
            名称: 土元素位面
            英文名: Plane of Earth
            说明: DC 17 体质失败则束缚，并在目标下一回合结束进入第二阶段豁免。
          - ID: celestia
            名称: 七重天堂山
            英文名: Mount Celestia
            说明: 触手命中额外造成 2d6 光耀伤害。
          - ID: pandemonium
            名称: 喧癫空隧
            英文名: Pandemonium
            说明: DC 17 感知失败则困惑到目标下一回合结束。
          - ID: abyss
            名称: 无底深渊
            英文名: Abyss
            说明: DC 17 感知失败则恐慌 1 分钟并在回合末重复豁免。
          - ID: avernus
            名称: 阿弗纳斯
            英文名: Avernus
            说明: 触手命中额外造成 2d6 火焰伤害；目标在水中时减半。
    - ID: nautiloid-earth-state-machine
      类型: lifecycle
      名称: 土元素调谐两阶段石化
      英文名: Earth Attunement Two-stage Petrification
      载体:
        分区: 特性
        名称: 土元素位面调谐 (Plane of Earth Attunement)
      表达覆盖: structured
      执行模式: core-operable
      规则来源: source-derived
      触发:
        事件: saveFailure
        频率: unlimited
        条件: 土元素调谐触手命中后的第一次 DC 17 体质豁免失败
      引用:
        - ID: complete-petrification
          角色: 第二阶段豁免
          项目:
            分区: 特性
            名称: 完成石化 (Complete Petrification)
      状态:
        - ID: earth-mineralizing
          名称: 矿化束缚
          英文名: Mineralizing Restraint
          目标: selected
          状态:
            - restrained
          变化: []
          持续:
            特殊: 直到目标下一回合结束的第二次 DC 17 体质豁免
          解除:
            - 第二次豁免成功
            - 第二次豁免失败后由石化替代
        - ID: earth-petrified
          名称: 完成石化
          英文名: Complete Petrification
          目标: selected
          状态:
            - petrified
          变化: []
          持续:
            特殊: 直到高等复原术或类似魔法解除
          解除:
            - 高等复原术或类似魔法
      操作:
        - ID: apply-earth-mineralizing
          名称: 应用矿化束缚
          英文名: Apply Mineralizing Restraint
          激活: special
          类型: apply
          状态:
            - earth-mineralizing
          引用: []
          说明: 第一次体质豁免失败时应用。
        - ID: complete-earth-petrification
          名称: 第二次失败：替换为石化
          英文名: "Second Failure: Replace with Petrified"
          激活: special
          类型: apply
          状态:
            - earth-petrified
          引用:
            - complete-petrification
          说明: 目标下一回合结束第二次豁免失败时，先移除矿化束缚再应用石化。
        - ID: clear-earth-mineralizing
          名称: 第二次成功：结束矿化
          英文名: "Second Success: End Mineralizing"
          激活: special
          类型: remove
          状态:
            - earth-mineralizing
          引用:
            - complete-petrification
          说明: 第二次体质豁免成功时移除矿化束缚。
    - ID: nautiloid-rejection-and-forwarding
      类型: relation
      名称: 位面排斥、暗流与无调谐触手
      英文名: Planar Rejection, Undertow, and Unattuned Tentacle
      载体:
        分区: 特性
        名称: 位面排斥 (Planar Rejection)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      条件:
        - 位面排斥消耗次数把失败改为成功，禁用一个当前调谐到下一回合结束，并受到不可减免的 10 点力场伤害
        - 位面暗流为 60 尺长、15 尺宽线形
        - 无调谐触手转发主触手攻击但不消费或触发调谐
      引用:
        - ID: nautiloid-tentacle
          角色: 传奇动作转发的主攻击
          项目:
            分区: 动作
            名称: 触手 (Tentacle)
        - ID: nautiloid-undertow
          角色: 线形区域与拉近
          项目:
            分区: 动作
            名称: 位面暗流 (Planar Undertow)
        - ID: unattuned-tentacle
          角色: 不带调谐的传奇转发
          项目:
            分区: 传奇动作
            名称: 无调谐触手 (Unattuned Tentacle)
      状态:
        - ID: rejected-attunement
          名称: 指定调谐暂时禁用
          英文名: Selected Attunement Disabled
          目标: self
          状态: []
          变化: []
          持续:
            特殊: 直到鹦鹉螺巨兽下一回合结束
          解除:
            - 鹦鹉螺巨兽下一回合结束
      操作:
        - ID: apply-planar-rejection
          名称: 将失败改为成功并禁用调谐
          英文名: Convert Failure and Disable Attunement
          激活: special
          类型: apply
          状态:
            - rejected-attunement
          引用: []
          说明: 消耗次数、记录被禁用调谐，并对自身结算不可减免的 10 点力场伤害。
        - ID: place-nautiloid-undertow
          名称: 放置位面暗流线形
          英文名: Place Planar Undertow Line
          激活: action
          类型: template
          状态: []
          引用:
            - nautiloid-undertow
          说明: 放置 60×15 尺线形并对失败目标拉近最多 20 尺与倒地。
          模板:
            形状: line
            尺寸: 60
            宽度: 15
            单位: ft
        - ID: forward-unattuned-tentacle
          名称: 转发无调谐触手
          英文名: Forward Unattuned Tentacle
          激活: special
          类型: forward
          状态: []
          引用:
            - nautiloid-tentacle
            - unattuned-tentacle
          说明: 使用主触手攻击数值，但明确不消费或触发当前调谐。
      GM步骤:
        - 位面排斥后在标记说明记录被禁用选项，并从本回合选择中移除。
        - 每次普通触手命中手工消费一个指定已选调谐；无调谐触手不得消费。
        - 暗流失败目标分别处理伤害、拉近和倒地。
---

鹦鹉螺巨兽是拥有灵能的远古海洋生物。它的每根触手都能与不同存在位面共鸣；战斗时，触手会提前显现对应位面的色彩、温度或声响，让观察敏锐的敌人有机会预判即将到来的效果。

### 特性

- **两栖 (Amphibious)**：鹦鹉螺巨兽可以在空气和水中呼吸。

- **攻城怪物 (Siege Monster)**：鹦鹉螺巨兽对物件和建筑造成双倍伤害。

- **位面调谐 (Planar Attunement)**：鹦鹉螺巨兽在其每个回合开始时，从下列八种位面调谐效果中选择或随机决定三种不同效果，并公开描述三根触手呈现的征兆。本回合前三次**触手 (Tentacle)**命中分别触发并消耗其中一种尚未使用的效果；同一回合不能重复一种效果。各效果是命中后的特殊触发，不会替代触手攻击。

- **妖精荒野调谐 (Feywild Attunement)**：被调谐触手命中的目标必须成功通过一次 **DC 17 感知豁免**，否则陷入魅惑 (Charmed) 状态，持续 1 分钟或直到鹦鹉螺巨兽伤害它为止。目标可以在其每个回合结束时重复该豁免。

- **堕影冥界调谐 (Shadowfell Attunement)**：被调谐触手命中后，魔法黑暗覆盖以目标为中心、半径 15 尺的区域，持续到鹦鹉螺巨兽下一回合开始。

- **水元素位面调谐 (Plane of Water Attunement)**：被调谐触手命中的目标必须成功通过一次 **DC 17 力量豁免**，否则被推开 30 尺。

- **土元素位面调谐 (Plane of Earth Attunement)**：被调谐触手命中的目标必须成功通过一次 **DC 17 体质豁免**，否则身体开始矿化并陷入束缚。目标在其下一回合结束时必须进行下列后续体质豁免。

- **完成石化 (Complete Petrification)**：受**土元素位面调谐 (Plane of Earth Attunement)**束缚的目标必须重复一次 **DC 17 体质豁免**。成功则结束束缚；失败则束缚结束，目标陷入石化，直到被高等复原术 (Greater Restoration) 或类似魔法解除。

- **七重天堂山调谐 (Mount Celestia Attunement)**：被调谐触手命中的目标额外受到 7（`2d6`）点光耀伤害。

- **喧癫空隧调谐 (Pandemonium Attunement)**：被调谐触手命中的目标必须成功通过一次 **DC 17 感知豁免**，否则受到困惑术 (Confusion) 的效果，直到其下一回合结束。

- **无底深渊调谐 (Abyss Attunement)**：被调谐触手命中的目标必须成功通过一次 **DC 17 感知豁免**，否则陷入恐慌，持续 1 分钟。目标可以在其每个回合结束时重复该豁免。

- **阿弗纳斯调谐 (Avernus Attunement)**：被调谐触手命中的目标额外受到 7（`2d6`）点火焰伤害；若目标身处水中，该火焰伤害减半。

- **位面排斥 (Planar Rejection, 2/日)**：若鹦鹉螺巨兽豁免失败，它可以改为豁免成功。作为代价，它选择一种当前调谐的位面效果并使其崩解；该效果直到其下一回合结束前不能被选择，且鹦鹉螺巨兽受到 10 点力场伤害。此伤害不能被减免。

### 动作

- **多重攻击 (Multiattack)**：鹦鹉螺巨兽发动三次**触手 (Tentacle)**攻击。

- **触手 (Tentacle)**：近战武器攻击：+11 命中，触及 20 尺，一个目标。
  - **命中**：16（`3d6 + 6`）点钝击伤害。若鹦鹉螺巨兽仍有尚未使用的位面调谐效果，则随后解析并消耗其中一种。

- **位面暗流 (Planar Undertow, 充能 5–6)**：鹦鹉螺巨兽在 60 尺长、15 尺宽的线上撕开一道短暂裂隙。线内每个生物必须进行一次 **DC 17 力量 (Strength) 豁免检定**。
  - **豁免失败**：受到 36（`8d8`）点力场伤害，被拉向鹦鹉螺巨兽最多 20 尺，并陷入倒地。
  - **豁免成功**：受到一半伤害，且不被拉动或倒地。

### 传奇动作

鹦鹉螺巨兽拥有 3 个传奇动作，可从以下选项中选择。每次只能使用一个传奇动作选项，且只能在另一个生物的回合结束时使用。鹦鹉螺巨兽在其回合开始时恢复所有已消耗的传奇动作。

- **深海漂移 (Abyssal Drift)**：鹦鹉螺巨兽游动至多其游泳速度的一半，且此次移动不会引发借机攻击。

- **无调谐触手 (Unattuned Tentacle，消耗 2 动作)**：鹦鹉螺巨兽发动一次触手攻击，但此次攻击不附带位面调谐效果。

- **相位脉冲 (Phase Pulse，消耗 2 动作)**：鹦鹉螺巨兽 10 尺内的每个其他生物必须成功通过一次 **DC 17 力量豁免**，否则被推开 15 尺，且直到当前回合结束前不能执行反应。

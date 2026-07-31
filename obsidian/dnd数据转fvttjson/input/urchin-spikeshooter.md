---
名称: 海胆刺射兽 (Urchin Spikeshooter)
类型: npc
体型: 中型
生物类型: 异怪
阵营: 无阵营
能力:
  力量: 5
  敏捷: 10
  体质: 16
  智力: 2
  感知: 6
  魅力: 4
护甲等级: 20 (天生护甲；参见消耗棘刺)
生命值: 90 (12d8 + 36)
速度: 步行 0 尺, 游泳 10 尺
感官:
  盲视: 60
  被动察觉: 8
挑战等级: 5
经验值: 1800
熟练加值: 3
背景: |-
  来源：Call of the Netherdeep: Additional Netherdeep Monsters
  作者：Frozenfeet2
  原文：https://www.gmbinder.com/share/-N-lZxHyITwITQjoeP10
  优化方向：把“射击会降低 AC”明确为十二根战斗棘刺，并加入消耗三根棘刺的压制齐射与以棘刺换位移的反应。
资源机制:
  资源:
    - ID: combat-spikes
      名称: 战斗棘刺
      英文名: Combat Spikes
      载体:
        分区: 特性
        名称: 消耗棘刺 (Depleting Spikes)
      初始: 12
      最大: 12
      恢复: lr
      派生:
        - ID: combat-spikes-ac
          类型: ac
          档位:
            - 最小: 0
              最大: 2
              值: 12
            - 最小: 3
              最大: 5
              值: 14
            - 最小: 6
              最大: 8
              值: 16
            - 最小: 9
              最大: 11
              值: 18
            - 最小: 12
              最大: 12
              值: 20
  消费:
    - ID: spike-cost
      资源: combat-spikes
      来源:
        分区: 动作
        名称: 棘刺 (Spike)
      模式: fixed
      数量: 1
    - ID: pinning-volley-cost
      资源: combat-spikes
      来源:
        分区: 动作
        名称: 钉刺齐射 (Pinning Volley)
      模式: fixed
      数量: 3
    - ID: recoil-drift-cost
      资源: combat-spikes
      来源:
        分区: 反应
        名称: 反冲漂移 (Recoil Drift)
      模式: fixed
      数量: 1
行为机制:
  版本: 1
  机制:
    - ID: urchin-spike-thresholds
      类型: trigger
      名称: 棘刺阈值与攻击限制
      英文名: Spike Thresholds and Attack Limits
      载体:
        分区: 特性
        名称: 消耗棘刺 (Depleting Spikes)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      条件:
        - 多重攻击至多进行三次棘刺攻击，且不得超过剩余棘刺数
        - 棘刺外皮仅在 AC 至少为 16，即剩余棘刺至少 6 根时触发
        - 反冲漂移只在近战攻击未命中时触发并消耗 1 根棘刺
      引用:
        - ID: urchin-multiattack
          角色: 受剩余棘刺限制
          项目:
            分区: 动作
            名称: 多重攻击 (Multiattack)
        - ID: spiked-hide
          角色: 至少 6 根棘刺时有效
          项目:
            分区: 特性
            名称: 棘刺外皮 (Spiked Hide)
        - ID: recoil-drift
          角色: 未命中触发并消费
          项目:
            分区: 反应
            名称: 反冲漂移 (Recoil Drift)
      操作:
        - ID: check-urchin-spike-threshold
          名称: 检查棘刺阈值
          英文名: Check Spike Threshold
          激活: special
          类型: manual
          状态: []
          引用:
            - urchin-multiattack
            - spiked-hide
            - recoil-drift
          说明: 按资源剩余值限制攻击次数、判断棘刺外皮，并使用对应 AC 档位。
      GM步骤:
        - 每次攻击或反应由原生消费目标扣除棘刺。
        - 资源变化后应用唯一正确的 AC 档位，并移除旧档位。
        - 多重攻击只执行 min(3, 剩余棘刺) 次；不足 3 根时不要继续攻击。
    - ID: urchin-pinning-lifecycle
      类型: lifecycle
      名称: 钉刺束缚与拔除
      英文名: Pinning and Spike Removal
      载体:
        分区: 动作
        名称: 钉刺齐射 (Pinning Volley)
      表达覆盖: structured
      执行模式: core-operable
      规则来源: corpus-derived
      触发:
        事件: saveFailure
        频率: unlimited
        条件: 钉刺齐射敏捷豁免失败
      条件:
        - 被钉住者或 5 尺内盟友可用动作进行 DC 14 力量检定
      状态:
        - ID: pinned-by-spike
          名称: 被棘刺钉住
          英文名: Pinned by Spike
          目标: selected
          状态:
            - restrained
          变化: []
          持续:
            特殊: 直到成功拔出棘刺
          解除:
            - 自己或 5 尺内盟友以动作通过 DC 14 力量检定
      操作:
        - ID: apply-pinned-by-spike
          名称: 应用棘刺束缚
          英文名: Apply Pinned by Spike
          激活: special
          类型: apply
          状态:
            - pinned-by-spike
          引用: []
          说明: 仅对豁免失败目标应用束缚。
        - ID: remove-pinning-spike
          名称: 拔除棘刺并解除束缚
          英文名: Remove Pinning Spike
          激活: action
          类型: remove
          状态:
            - pinned-by-spike
          引用: []
          说明: DC 14 力量检定成功后移除对应束缚效果。
---

海胆刺射兽像一座缓慢漂浮的堡垒。它越积极地攻击，越会暴露柔软的表皮；玩家可以选择顶着高 AC 抢攻，也可以逼它倾泻棘刺后再集中火力。

### 特性

- **消耗棘刺 (Depleting Spikes)**：海胆刺射兽在战斗开始时拥有 12 根棘刺。每次发动**棘刺 (Spike)**攻击消耗 1 根，使用**钉刺齐射 (Pinning Volley)**消耗 3 根。它的棘刺数量决定护甲等级：剩余 12 根时 AC 20；剩余 9–11 根时 AC 18；剩余 6–8 根时 AC 16；剩余 3–5 根时 AC 14；剩余 0–2 根时 AC 12。它完成长休后恢复所有棘刺与 AC。

- **棘刺外皮 (Spiked Hide)**：当海胆刺射兽的 AC 至少为 16 时，位于其 5 尺内的生物对它发动近战攻击后，必须成功通过一次 **DC 14 敏捷 (Dexterity) 豁免检定**，否则受到 3（`1d6`）点穿刺伤害。

- **水下呼吸 (Water Breathing)**：海胆刺射兽只能在水下呼吸。

### 动作

- **多重攻击 (Multiattack)**：海胆刺射兽发动三次**棘刺 (Spike)**攻击。若剩余棘刺不足，它发动尽可能多的攻击。

- **棘刺 (Spike)**：远程武器攻击：+6 命中，射程 60/120 尺，一个目标。
  - **命中**：12（`2d8 + 3`）点穿刺伤害。

- **钉刺齐射 (Pinning Volley, 充能 5–6)**：海胆刺射兽消耗 3 根棘刺，向 30 尺锥形区域射出密集棘刺。区域内每个生物必须进行一次 **DC 15 敏捷 (Dexterity) 豁免检定**。
  - **豁免失败**：受到 18（`4d8`）点穿刺伤害，并被一根棘刺钉住，陷入束缚 (Restrained) 状态。
  - **豁免成功**：受到一半伤害，且不被束缚。
  - 被钉住的生物或其 5 尺内的另一生物可以用一个动作进行一次 **DC 14 力量检定 (Strength Check)**，成功则拔出棘刺并结束束缚。

### 反应

- **反冲漂移 (Recoil Drift)**：当一次近战攻击未命中海胆刺射兽时，它可以消耗 1 根棘刺并游动至多其游泳速度。此次移动不会引发借机攻击。

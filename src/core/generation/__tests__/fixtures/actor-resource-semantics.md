---
名称: 资源契约测试体 (Resource Contract Test Creature)
类型: npc
体型: 中型
生物类型: 异怪
阵营: 无阵营
能力:
  力量: 12
  敏捷: 12
  体质: 14
  智力: 8
  感知: 10
  魅力: 8
护甲等级: 20 (天生护甲)
生命值: 52 (8d8 + 16)
速度: 步行 20 尺
挑战等级: 3
资源机制:
  资源:
    - ID: shell-energy
      名称: 甲壳能量
      英文名: Shell Energy
      载体:
        分区: 特性
        名称: 反魔甲壳 (Antimagic Carapace)
      初始: 0
      最大: 2
      恢复: none
      操作:
        - ID: gain-shell-energy
          名称: 获得甲壳能量
          英文名: Gain Shell Energy
          激活: special
          模式: gain
          数量: 1
          条件: 成功通过法术豁免或法术攻击未命中后
        - ID: clear-shell-energy
          名称: 清空甲壳能量
          英文名: Clear Shell Energy
          激活: special
          模式: clear
          条件: 甲壳被击穿后
    - ID: spikes
      名称: 战斗棘刺
      英文名: Combat Spikes
      载体:
        分区: 特性
        名称: 棘刺储备 (Spike Reserve)
      初始: 12
      最大: 12
      恢复: lr
      派生:
        - ID: spike-ac
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
    - ID: bloom
      名称: 绽放能量
      英文名: Bloom Energy
      载体:
        分区: 特性
        名称: 奥术滋养 (Arcane Feeding)
      初始: 0
      最大: 3
      恢复: none
      操作:
        - ID: gain-bloom
          名称: 获得绽放能量
          英文名: Gain Bloom Energy
          激活: special
          模式: gain
          数量: 1
          条件: 每轮第一次吸收法术后
  消费:
    - ID: spike-shot-cost
      资源: spikes
      来源:
        分区: 动作
        名称: 棘刺射击 (Spike Shot)
      模式: fixed
      数量: 1
    - ID: spike-volley-cost
      资源: spikes
      来源:
        分区: 动作
        名称: 棘刺齐射 (Spike Volley)
      模式: fixed
      数量: 3
    - ID: shell-burst-variable
      资源: shell-energy
      来源:
        分区: 动作
        名称: 心灵爆发 (Psychic Burst)
      模式: variable
      最小: 1
      最大: 2
      可选: true
      额外活动:
        名称: 心灵爆发：释放甲壳能量
        英文名: "Psychic Burst: Release Shell Energy"
      缩放:
        伤害:
          基础: "3"
          每额外层: "3"
          类型: force
    - ID: bloom-cloud-variable
      资源: bloom
      来源:
        分区: 动作
        名称: 绽放云 (Bloom Cloud)
      模式: variable
      最小: 1
      最大: 3
      可选: true
      额外活动:
        名称: 绽放云：扩大范围
        英文名: "Bloom Cloud: Expanded Area"
      缩放:
        范围:
          基础: 15
          每额外层: 5
  转换:
    - ID: bloom-conversion
      名称: 转化三层绽放能量
      英文名: Convert Three Bloom Energy
      载体:
        分区: 动作
        名称: 绽放云 (Bloom Cloud)
      激活: special
      条件: 获得第三层绽放能量时
      变化:
        - 类型: resource
          资源: bloom
          模式: spend
          数量: 3
        - 类型: itemUses
          目标:
            分区: 动作
            名称: 绽放云 (Bloom Cloud)
          模式: recover
          数量: 1
---

### 特性

- **反魔甲壳 (Antimagic Carapace)**：测试体会储存甲壳能量。
- **棘刺储备 (Spike Reserve)**：测试体拥有十二根战斗棘刺。
- **奥术滋养 (Arcane Feeding)**：测试体会吸收附近法术并积累绽放能量。

### 动作

- **棘刺射击 (Spike Shot)**：远程武器攻击：+4 命中，射程 60/120 尺，一个目标。
  - **命中**：7（`1d8 + 3`）点穿刺伤害。
- **棘刺齐射 (Spike Volley)**：测试体消耗三根棘刺攻击一个目标。
- **心灵爆发 (Psychic Burst)**：测试体 15 尺内的生物必须进行一次 DC 13 感知豁免，失败受到 7（`2d6`）点心灵伤害。
- **绽放云 (Bloom Cloud, 1/日)**：测试体周围形成 15 尺半径云雾。范围内生物必须进行一次 DC 13 体质豁免，失败受到 9（`2d8`）点毒素伤害。

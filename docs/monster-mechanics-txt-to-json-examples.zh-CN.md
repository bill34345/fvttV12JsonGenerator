# 非常规怪物机制：TXT → Markdown → Foundry JSON 示例手册

> [!important] 这份手册适合谁
> 本手册面向编写、整理或导入 D&D 5e 怪物资料的用户。你不需要理解 TypeScript，也不需要手写 Actor JSON。你只需要把怪物机制写得足够明确，并在生成后检查标准 Markdown 和验证报告。

## 1. 先了解当前支持边界

项目中有三种相关输入方式：

| 输入方式 | 适用场景 | 非常规机制支持 |
|---|---|---|
| `--intake-monsters` | 第一次收到 TXT、聊天记录或格式混乱的 Markdown | 推荐入口；能够整理普通数值和能力，但当前 Intake IR 尚未自动生成本文的高级 `资源机制`／`行为机制`契约 |
| `--ingest-plaintext-actors` | 已经符合 Legacy 固定格式的 TXT 合集 | 只适合常规属性、攻击、豁免、次数和充能；不适合推断复杂资源和状态机 |
| 标准 Markdown → CLI | 已经拥有项目标准 MD | 当前能够解析本文展示的 `资源机制`／`行为机制`，并投影为 v12 或 v14 Actor JSON |

> [!warning] 不要误解“正确 TXT”
> 本文中的“正确 TXT”表示：原文已经把生成机制所需的信息写完整。当前版本不会仅凭这些自然语言自动生成全部高级契约。现阶段仍需在 Intake 审阅阶段补齐标准 MD 中的 `资源机制`／`行为机制`，或等待 Intake 接入这些契约。

完整链路应当是：

```text
原始 TXT
  ↓ 发现怪物、提取证据、人工审阅
标准 Markdown
  ↓ 资源机制 / 行为机制 parser
v12 或 v14 Actor JSON
  ↓ verify:actor + 人工语义检查
Foundry 导入与操作
```

本文不会要求你手写最终 JSON。所有最终 Actor JSON 都应由项目 CLI 生成。

### 示例快速索引

| 示例 | 适用机制 |
|---|---|
| 示例一 | 多个特性和动作共享一个资源 |
| 示例二 | 固定消费、可变消费和资源转换 |
| 示例三 | 剩余资源决定 AC 档位 |
| 示例四 | 只影响下一次命中的效果 |
| 示例五 | 进入姿态与主动退出 |
| 示例六 | 重复豁免、受伤重试和盟友救援 |
| 示例七 | 首次半血后的永久阶段 |
| 示例八 | 多触手、多螯钳的独立容量 |
| 示例九 | 互异选择池、逐次消费与重置 |
| 示例十 | 两阶段石化等复合状态机 |
| 示例十一 | 传奇动作调用已有攻击 |
| 示例十二 | 区域模板及进入/离开生命周期 |
| 示例十三 | 根据实际伤害影响另一个 Actor |
| 示例十四 | 强迫另一个 Actor 使用反应攻击 |
| 示例十五 | 外部战役规则 |

## 2. 写非常规机制时，TXT 至少要说清楚什么

复杂能力最好明确写出以下信息：

1. **谁拥有或受到该效果。**
2. **在什么事件发生时触发。**
3. **每次增加、减少或消费多少。**
4. **最小值、最大值或容量是多少。**
5. **何时恢复、重置或解除。**
6. **是否每回合、每轮或每场战斗只能触发一次。**
7. **关联的是哪一个攻击、动作、反应或状态。**
8. **失败和成功分别发生什么。**
9. **Foundry 无法自动判断时，GM 具体要做什么。**

下面两种写法看起来都像规则，但只有第一种足以结构化：

```text
正确：目标在自己的每个回合结束时重复一次 DC 15 感知豁免，成功则结束恐慌。

不完整：目标可以稍后尝试摆脱恐慌。
```

## 3. 执行模式是什么意思

生成结果会区分以下执行模式：

| 模式 | 含义 |
|---|---|
| `core-operable` | Foundry core/dnd5e 的 Activity、Effect、uses 或模板能够执行主要操作，但触发时点仍可能需要 GM 确认 |
| `gm-assisted` | JSON 中会生成资源、状态、按钮或操作说明，但 GM 必须确认事件、目标或实际数值 |
| `external-rule` | Actor 只保存触发、DC 和结果摘要，完整规则必须查阅外部战役规则 |
| `automatic` | 当前 core 行为契约不接受此声明；没有经过独立运行时验证的监听器不得自称全自动 |

`needs_review` 不一定表示生成失败。若怪物包含 `gm-assisted` 或 `external-rule` 能力，保留 `needs_review` 是正确结果。

---

## 4. 示例一：多个特性和动作共享同一资源

### 4.1 正确 TXT 写法

```text
甲壳能量。怪物初始拥有0层甲壳能量，最多拥有2层。
当它成功通过对抗法术的豁免检定，或法术攻击未命中它时，它获得1层甲壳能量。
甲壳能量不会通过休息自动恢复。

心灵爆发。使用心灵爆发时，怪物可以选择消耗1层或2层甲壳能量。
每消耗1层，心灵爆发额外造成3点力场伤害。
结算后移除已消费的层数。

击穿甲壳。当怪物从单一来源受到至少10点钝击伤害或任意雷鸣伤害时，
它失去全部甲壳能量。
```

### 4.2 错误或歧义写法

```text
怪物能从法术中吸收能量。
积蓄的能量越多，心灵爆发越强。
猛烈攻击可以打散这些能量。
```

问题：

- 没有资源上限；
- 没有说明每次获得多少；
- 没有说明最少和最多消费多少；
- 没有给出伤害缩放值；
- “猛烈攻击”没有伤害类型和阈值；
- 没有说明恢复方式。

### 4.3 标准 MD 中应出现的资源契约

以下片段应放在怪物标准 Markdown 的 YAML frontmatter 中：

```yaml
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
          条件: 从单一来源受到至少10点钝击伤害或任意雷鸣伤害后
  消费:
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
```

### 4.4 JSON 中应看到什么

- 一个拥有 `0/2` uses 的甲壳能量 Item；
- 获得 1 层和清空资源的操作；
- 心灵爆发引用同一个资源 Item，而不是创建自己的独立次数；
- 可选择消费 1–2 层；
- 每层产生 3 点力场伤害缩放；
- 触发事件的自动识别仍应标记为 GM 辅助。

---

## 5. 示例二：固定消费、可变消费和资源转换

### 5.1 正确 TXT 写法

```text
怪物拥有12根战斗棘刺，完成长休后恢复到12根。

棘刺射击每次消耗1根棘刺。
棘刺齐射每次消耗3根棘刺；剩余棘刺不足3根时不能使用。

每当怪物获得第3层绽放能量时，它立即失去3层绽放能量，
并恢复1次已经消耗的绽放云。
```

### 5.2 常见错误

```text
怪物会用掉一些棘刺。
集满绽放能量后，它可以重新使用绽放云。
```

“一些”“集满”“可以重新使用”都不足以确定消费数量、上限、是否立即发生和恢复次数。

### 5.3 标准 MD 契约

```yaml
资源机制:
  资源:
    - ID: spikes
      名称: 战斗棘刺
      英文名: Combat Spikes
      载体:
        分区: 特性
        名称: 棘刺储备 (Spike Reserve)
      初始: 12
      最大: 12
      恢复: lr
    - ID: bloom
      名称: 绽放能量
      英文名: Bloom Energy
      载体:
        分区: 特性
        名称: 奥术滋养 (Arcane Feeding)
      初始: 0
      最大: 3
      恢复: none
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
```

### 5.4 JSON 检查

- 射击和齐射的消费必须引用同一个棘刺 Item；
- 齐射不能拥有一套与总棘刺无关的独立 uses；
- 转换活动应同时减少资源并恢复指定 Item 的 uses；
- 所有引用应落到稳定 Item ID，不能只靠名称在运行时搜索。

---

## 6. 示例三：剩余资源决定 AC 档位

### 6.1 正确 TXT 写法

```text
怪物最多拥有12根棘刺。
剩余0至2根时 AC 为12；3至5根时 AC 为14；6至8根时 AC 为16；
9至11根时 AC 为18；剩余12根时 AC 为20。
```

### 6.2 错误写法

```text
怪物的棘刺越多，护甲越高。
```

这句话没有提供任何可计算档位。工具不应自行发明 `12/14/16/18/20`。

### 6.3 标准 MD 契约

```yaml
资源机制:
  资源:
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
```

### 6.4 JSON 检查

- 必须生成五个可见 AC 档位；
- 档位必须完整覆盖 `0..12`，不能有空档或重叠；
- v14 应修改最终派生 AC 值；
- core 当前不会自动监听资源变化切换档位，因此 GM 需要点击对应档位。

---

## 7. 示例四：只影响下一次命中的效果

### 7.1 正确 TXT 写法

```text
力场蓄势（附赠动作）。怪物为重击积蓄力量。
在本回合结束前，它下一次以重击命中时额外造成2d6力场伤害。
附加伤害结算后立即结束力场蓄势；如果本回合没有命中，回合结束时该效果也结束。
```

### 7.2 错误写法

```text
怪物蓄力后，攻击会造成额外力场伤害。
```

没有说明是哪次攻击、是否限本回合、是否只触发一次以及何时解除。

### 7.3 标准 MD 契约

```yaml
行为机制:
  版本: 1
  机制:
    - ID: next-hit-force
      类型: relation
      名称: 下一次命中附伤
      英文名: Next Hit Force
      载体:
        分区: 特性
        名称: 力场蓄势 (Force Priming)
      表达覆盖: structured
      执行模式: core-operable
      规则来源: source-derived
      触发:
        事件: activityUsed
        频率: oncePerTurn
        条件: 使用力场蓄势后
      条件:
        - 只影响本回合下一次重击命中
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
          说明: 应用蓄势标记。
        - ID: resolve-force
          名称: 结算并移除力场附伤
          英文名: Resolve Force Damage
          激活: special
          类型: remove
          状态:
            - force-primed
          引用:
            - heavy-strike
          说明: 在下一次重击命中后结算2d6力场伤害并移除标记。
      GM步骤: []
```

### 7.4 JSON 检查

- 应生成可见的“力场蓄势”状态；
- 应明确引用重击，而不是给所有攻击永久加伤；
- 应有结算并移除状态的操作；
- core 不会自动监听命中事件，GM 必须在命中后使用结算操作。

---

## 8. 示例五：进入姿态与主动退出姿态

### 8.1 正确 TXT 写法

```text
缩壳防御（动作）。怪物缩入甲壳，AC获得+4，并陷入束缚。
该效果持续到它使用破壳伸展。

破壳伸展（附赠动作）。怪物结束缩壳防御，同时移除AC加值和束缚。
```

### 8.2 错误写法

```text
怪物缩进甲壳后更难被击中，但行动不便。它之后可以出来。
```

缺少 AC 数值、具体状态、退出动作类型和解除关系。

### 8.3 标准 MD 契约

```yaml
行为机制:
  版本: 1
  机制:
    - ID: shell-defense-posture
      类型: lifecycle
      名称: 缩壳防御姿态
      英文名: Shell Defense Posture
      载体:
        分区: 动作
        名称: 缩壳防御 (Shell Defense)
      表达覆盖: structured
      执行模式: core-operable
      规则来源: source-derived
      条件:
        - 缩壳时同时获得AC加值与束缚
      引用:
        - ID: emerge-shell
          角色: 结束姿态
          项目:
            分区: 附赠动作
            名称: 破壳伸展 (Emerge from Shell)
      状态:
        - ID: shell-defending
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
            - shell-defending
          引用: []
          说明: 应用AC+4与束缚。
        - ID: emerge-and-remove-defense
          名称: 破壳伸展并移除姿态
          英文名: Emerge and Remove Defense
          激活: bonus
          类型: remove
          状态:
            - shell-defending
          引用:
            - emerge-shell
          说明: 移除缩壳防御效果。
      GM步骤: []
```

### 8.4 JSON 检查

- 缩壳应应用一个同时包含 AC 和束缚的 Effect；
- 破壳应移除同一个 Effect；
- 不能只把解除文字写在描述里；
- v14 AC 应落到正确的最终计算阶段。

---

## 9. 示例六：重复豁免、受到伤害重试与盟友救援

### 9.1 正确 TXT 写法

```text
噩梦吐息。豁免失败的生物陷入恐慌，持续1分钟。
目标在自己的每个回合结束时重复一次DC 16感知豁免，成功则结束恐慌。
目标每次受到伤害后也可以立即重复该豁免。
目标5尺内的一个盟友可以使用一个动作拔出绯晶碎片，使该效果结束。
```

### 9.2 错误写法

```text
目标会持续恐慌，但之后可以再次豁免，也可以由同伴救援。
```

缺少 DC、属性、重试时点、救援距离、救援动作消耗和解除结果。

### 9.3 标准 MD 契约

```yaml
行为机制:
  版本: 1
  机制:
    - ID: nightmare-lifecycle
      类型: lifecycle
      名称: 噩梦恐慌生命周期
      英文名: Nightmare Fright Lifecycle
      载体:
        分区: 动作
        名称: 噩梦吐息 (Nightmare Breath)
      表达覆盖: structured
      执行模式: core-operable
      规则来源: source-derived
      触发:
        事件: saveFailure
        频率: unlimited
        条件: 噩梦吐息感知豁免失败
      条件:
        - 每个目标在自己回合结束时重复DC 16感知豁免
        - 受到伤害后也可立即重试
        - 5尺内盟友可用一个动作结束效果
      引用: []
      状态:
        - ID: nightmare-frightened
          名称: 噩梦恐慌
          英文名: Nightmare Frightened
          目标: selected
          状态:
            - frightened
          变化: []
          持续:
            秒: 60
          解除:
            - 回合结束时DC 16感知豁免成功
            - 受到伤害后重复豁免成功
            - 5尺内盟友使用一个动作救援
      操作:
        - ID: apply-nightmare-fright
          名称: 应用噩梦恐慌
          英文名: Apply Nightmare Fright
          激活: special
          类型: apply
          状态:
            - nightmare-frightened
          引用: []
          说明: 对豁免失败的目标应用恐慌状态。
        - ID: remove-nightmare-fright
          名称: 移除噩梦恐慌
          英文名: Remove Nightmare Fright
          激活: action
          类型: remove
          状态:
            - nightmare-frightened
          引用: []
          说明: 重复豁免成功或盟友救援成功后移除恐慌。
      GM步骤: []
```

### 9.4 JSON 检查

- 恐慌 Effect 必须作用于选中的目标生物，而不是怪物自己；
- 救援距离不能被错误写成吐息攻击距离；
- 应有明确移除操作；
- core 不会自动监听“每次受到伤害”，GM 仍需在正确时点要求重试。

---

## 10. 示例七：首次半血后的永久阶段变化

### 10.1 正确 TXT 写法

```text
崩解阶段。当怪物的生命值第一次降至生命值上限的一半或更低时，
它的AC从14变为12，步行速度从30尺变为40尺。
该变化是永久的，即使它之后恢复到半血以上也不会逆转，
且在生命值再次跨过半血线时不会重复触发。
```

### 10.2 错误写法

```text
怪物受重伤后护甲降低，但移动更快。
```

缺少阈值、具体数值、是否可恢复以及是否能重复触发。

### 10.3 标准 MD 契约

```yaml
行为机制:
  版本: 1
  机制:
    - ID: bloodied-permanent-stage
      类型: stage
      名称: 首次半血永久阶段
      英文名: First Bloodied Permanent Stage
      载体:
        分区: 特性
        名称: 崩解阶段 (Moldering Stage)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: hpThreshold
        频率: firstOccurrence
        条件: 生命值第一次降至上限的一半或更低
      条件:
        - 阶段永久存在，治疗不会移除
      引用: []
      状态:
        - ID: bloodied-stage-active
          名称: 崩解阶段已激活
          英文名: Moldering Stage Active
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
            特殊: 永久
          解除: []
      操作:
        - ID: enter-bloodied-stage
          名称: 进入永久崩解阶段
          英文名: Enter Permanent Moldering Stage
          激活: special
          类型: apply
          状态:
            - bloodied-stage-active
          引用: []
          说明: 首次跨过半血阈值时应用永久阶段标记。
      GM步骤:
        - 第一次降至半血时点击进入阶段。
        - 标记存在时不得再次触发，也不得因治疗自动移除。
```

### 10.4 JSON 检查

- 应生成一个持久的阶段 Effect；
- Effect 同时修改 AC 和步行速度；
- 阶段状态必须可见，用于避免重复触发；
- core 不会自动监听 HP 阈值，因此执行模式必须是 `gm-assisted`。

---

## 11. 示例八：多根触手或多只爪的独立容量

### 11.1 正确 TXT 写法

```text
怪物拥有两根可用于擒抱的触手。
每根触手至多擒抱一个大型或更小的生物，因此它最多同时擒抱两个生物。
目标可以使用一个动作进行DC 15力量或敏捷检定以逃脱。
每当一个擒抱开始时占用一个触手槽位；对应擒抱结束时释放一个槽位。
```

### 11.2 错误写法

```text
怪物可以用触手抓住多个敌人。
```

没有槽位数量、体型限制、逃脱 DC 和释放条件。

### 11.3 标准 MD 契约

```yaml
行为机制:
  版本: 1
  机制:
    - ID: tentacle-capacity
      类型: capacity
      名称: 双触手容量
      英文名: Twin Tentacle Capacity
      载体:
        分区: 特性
        名称: 双触手 (Twin Tentacles)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      条件:
        - 每根触手至多擒抱一个大型或更小生物
      引用: []
      状态: []
      操作: []
      GM步骤:
        - 成功开始擒抱时点击占用一个槽位。
        - 对应擒抱结束时点击释放一个槽位。
      容量:
        槽位: 2
        体型限制: 大型或更小
        逃脱DC: 15
        获取: 每次成功开始擒抱时占用一个槽位。
        释放: 对应擒抱结束时释放一个槽位。
```

### 11.4 JSON 检查

- 应生成最大值为 2 的容量 Item；
- 第三次占用不能让资源越过上限；
- 释放操作不得让已用槽位低于 0；
- 容量不会自动判断场上哪些 Token 正被哪根触手擒抱，因此是 GM 辅助。

---

## 12. 示例九：互异选择池、逐次消费与重置

### 12.1 正确 TXT 写法

```text
怪物在自己每个回合开始时，从火焰、潮汐和大地三种调谐中选择两个不同的调谐。
当前选择必须公开。
每当怪物使用一个已选择的调谐时，该调谐被消费，且在本回合不能再次使用。
怪物下个回合开始时清除旧选择并重新选择两个不同调谐。
```

### 12.2 错误写法

```text
怪物每回合可以选择几个位面能力使用。
```

没有选择数量、是否必须互异、候选列表、每项能使用几次和重置时点。

### 12.3 标准 MD 契约

```yaml
行为机制:
  版本: 1
  机制:
    - ID: planar-choice-pool
      类型: choicePool
      名称: 位面调谐选择
      英文名: Planar Attunement Choices
      载体:
        分区: 特性
        名称: 位面调谐 (Planar Attunement)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      条件:
        - 每回合选择两个互异调谐
        - 每个选择在本回合只能消费一次
      引用: []
      状态: []
      操作: []
      GM步骤:
        - 回合开始先重置旧选择。
        - 依次选择两个不同候选项。
        - 使用调谐后移除对应选择标记。
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
            说明: 下一次命中施加矿化状态。
```

### 12.4 JSON 检查

- 选择池 uses 最大值应为 2；
- 三个候选项都应生成可见选择标记；
- 第三次选择应被容量阻止；
- “互异”仍由 GM 确认，不能把同一选项点两次当成两个不同选择；
- 回合开始需要执行重置操作。

---

## 13. 示例十：两阶段石化或其他复合状态机

### 13.1 正确 TXT 写法

```text
大地调谐命中时，目标进行DC 16体质豁免。
第一次失败时，目标陷入矿化，并受到束缚。
矿化目标在自己下个回合结束时再次进行DC 16体质豁免。
第二次豁免成功时，矿化和束缚结束。
第二次豁免失败时，先移除矿化和束缚，然后目标陷入石化。
```

### 13.2 错误写法

```text
目标第一次豁免失败会逐渐石化，第二次失败后完全石化。
```

缺少 DC、属性、第二次豁免时点、前置状态内容，以及成功时如何恢复。

### 13.3 标准 MD 契约

```yaml
行为机制:
  版本: 1
  机制:
    - ID: earth-petrification-state-machine
      类型: lifecycle
      名称: 大地调谐两阶段石化
      英文名: Earth Attunement Two-Stage Petrification
      载体:
        分区: 特性
        名称: 大地调谐 (Earth Attunement)
      表达覆盖: structured
      执行模式: core-operable
      规则来源: source-derived
      条件:
        - 第一次失败只施加矿化
        - 第二次失败才施加石化
      引用: []
      状态:
        - ID: mineralizing
          名称: 矿化中
          英文名: Mineralizing
          目标: selected
          状态:
            - restrained
          变化: []
          持续:
            特殊: 直到目标下个回合结束时完成第二次豁免
          解除:
            - 第二次体质豁免成功
            - 转换为石化状态
        - ID: petrified-by-earth
          名称: 大地石化
          英文名: Petrified by Earth
          目标: selected
          状态:
            - petrified
          变化: []
          持续:
            特殊: 按能力原文
          解除:
            - 按能力原文指定方式解除
      操作:
        - ID: apply-mineralizing
          名称: 应用矿化
          英文名: Apply Mineralizing
          激活: special
          类型: apply
          状态:
            - mineralizing
          引用: []
          说明: 第一次DC 16体质豁免失败时应用矿化。
        - ID: clear-mineralizing
          名称: 成功抵抗矿化
          英文名: Resist Mineralizing
          激活: special
          类型: remove
          状态:
            - mineralizing
          引用: []
          说明: 第二次豁免成功时移除矿化。
        - ID: advance-to-petrified
          名称: 转换为石化
          英文名: Advance to Petrified
          激活: special
          类型: apply
          状态:
            - petrified-by-earth
          引用: []
          说明: 第二次豁免失败时先移除矿化，再应用石化。
      GM步骤: []
```

### 13.4 JSON 检查

- 第一次失败不能同时生成束缚和石化；
- 第二次成功必须能移除前置状态；
- 第二次失败必须结束前置状态并应用石化；
- 状态名称不参与机制推断，转换关系来自显式契约。

---

## 14. 示例十一：传奇动作调用已有攻击

### 14.1 正确 TXT 写法

```text
传奇动作：尾击。怪物花费1个传奇动作，并进行一次现有的尾击攻击。
该传奇动作不创建另一套尾击伤害，也不改变原尾击的命中、触及或伤害。
```

### 14.2 错误写法

```text
传奇尾击。怪物进行一次尾击，造成15点钝击伤害。
```

若原尾击以后被修改，重复写死的传奇尾击可能继续保留旧伤害，造成内容漂移。

### 14.3 标准 MD 契约

```yaml
行为机制:
  版本: 1
  机制:
    - ID: legendary-tail-forward
      类型: relation
      名称: 传奇尾击转发
      英文名: Legendary Tail Forward
      载体:
        分区: 传奇动作
        名称: 尾击 (Tail Attack)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      条件:
        - 花费1个传奇动作并调用现有尾击
      引用:
        - ID: base-tail
          角色: 被调用的已有攻击
          项目:
            分区: 动作
            名称: 尾击 (Tail)
      状态: []
      操作:
        - ID: forward-base-tail
          名称: 发动已有尾击
          英文名: Use Existing Tail
          激活: special
          类型: forward
          状态: []
          引用:
            - base-tail
          说明: 消费传奇动作后，使用动作区现有尾击攻击。
      GM步骤:
        - 消费1个传奇动作。
        - 点击或转发动作区的现有尾击，不复制伤害公式。
```

### 14.4 JSON 检查

- 传奇动作应保存对原尾击 Item 的稳定引用；
- 不应产生一份独立、可能漂移的攻击公式；
- core 目前不会自动替玩家点击另一个 Item，因此是 GM 辅助。

---

## 15. 示例十二：区域模板与区域生命周期

### 15.1 正确 TXT 写法

```text
暗流。怪物创造一条60尺长、15尺宽的线形暗流区域，持续到怪物下个回合开始。
生物第一次进入区域或在其中开始回合时进行DC 16力量豁免。
离开区域时，暗流施加的束缚结束。
```

### 15.2 错误写法

```text
怪物在前方制造一片暗流。进入暗流的生物会受到影响。
```

缺少模板形状、长度、宽度、持续时间、触发时点、DC 和离开后的处理。

### 15.3 可放置模板、生命周期需 GM 辅助的契约

```yaml
行为机制:
  版本: 1
  机制:
    - ID: undertow-area
      类型: area
      名称: 暗流区域
      英文名: Undertow Area
      载体:
        分区: 动作
        名称: 暗流 (Undertow)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: activityUsed
        频率: unlimited
      条件:
        - 使用60尺长、15尺宽的线形模板
        - 进入或在其中开始回合时进行DC 16力量豁免
        - 离开区域时移除区域状态
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
          说明: 放置60×15尺线形模板，并由GM结算进入、回合开始和离开事件。
          模板:
            形状: line
            尺寸: 60
            宽度: 15
            单位: ft
      GM步骤:
        - 生物进入区域或在其中开始回合时要求DC 16力量豁免。
        - 生物离开区域时移除暗流施加的状态。
        - 怪物下个回合开始时删除模板。
```

### 15.4 JSON 检查

- 应生成 60×15 尺线形模板；
- 模板尺寸不能从攻击射程或救援距离猜测；
- core 不会自动监听 Token 进入和离开区域，因此完整区域生命周期必须是 GM 辅助；
- 如果只需要放置模板而没有进入/离开监听，模板活动本身可以是 `core-operable`。

---

## 16. 示例十三：根据实际伤害影响另一个 Actor

### 16.1 正确 TXT 写法

```text
吸血啃咬。目标受到2d12+5点穿刺伤害和3d6点黯蚀伤害。
目标的生命值上限降低，降低量等于本次实际受到的黯蚀伤害。
怪物恢复等于该实际黯蚀伤害的生命值，但不能超过生命值上限。
目标完成长休后恢复被降低的生命值上限。
```

### 16.2 错误写法

```text
啃咬会吸取目标的生命，并治疗怪物。
```

没有说明采用掷骰结果、实际伤害还是伤害公式，也没有恢复上限降低的时点。

### 16.3 标准 MD 契约

```yaml
行为机制:
  版本: 1
  机制:
    - ID: actual-necrotic-drain
      类型: relation
      名称: 实际黯蚀伤害吸取
      英文名: Actual Necrotic Damage Drain
      载体:
        分区: 动作
        名称: 吸血啃咬 (Vampiric Bite)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      条件:
        - 使用目标实际受到的黯蚀伤害，不使用公式平均值
        - 同步降低目标生命值上限并治疗怪物
      引用: []
      状态: []
      操作:
        - ID: resolve-actual-necrotic-drain
          名称: 结算实际黯蚀吸取
          英文名: Resolve Actual Necrotic Drain
          激活: special
          类型: manual
          状态: []
          引用: []
          说明: 记录目标实际受到的黯蚀伤害；目标生命值上限降低相同数值，怪物恢复相同生命值。
      GM步骤:
        - 先完成抗性、免疫和其他减伤后的实际黯蚀伤害结算。
        - 将该实际数值同时用于目标生命值上限降低和怪物治疗。
        - 目标完成长休后恢复被降低的生命值上限。
```

### 16.4 JSON 检查

- 啃咬攻击仍应正常掷伤害；
- 额外操作必须明确要求读取“实际黯蚀伤害”；
- core 不能安全地跨 Actor 同步修改生命值上限和治疗攻击者；
- 不得把平均伤害或伤害公式误当作实际伤害。

---

## 17. 示例十四：强迫另一个 Actor 使用反应攻击

### 17.1 正确 TXT 写法

```text
鲜血命令。选择怪物30尺内一个能看见它且可以执行反应的生物。
目标必须进行DC 16感知豁免。
豁免失败时，目标必须立即使用自己的反应，对怪物指定的、位于目标触及范围内的生物进行一次近战武器攻击。
若目标无法执行反应、没有合法目标或不能进行近战武器攻击，则此效果不发生。
```

### 17.2 错误写法

```text
怪物控制敌人的血液，迫使它攻击同伴。
```

缺少距离、可见性、豁免、反应消耗、目标选择和无法攻击时的处理。

### 17.3 推荐契约

```yaml
行为机制:
  版本: 1
  机制:
    - ID: command-blood-reaction
      类型: relation
      名称: 鲜血命令反应攻击
      英文名: Command Blood Reaction Attack
      载体:
        分区: 传奇动作
        名称: 鲜血命令 (Command Blood)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      条件:
        - 目标必须在30尺内且能看见怪物
        - 目标必须能够执行反应并有合法近战目标
        - DC 16感知豁免失败后才发动攻击
      引用: []
      状态: []
      操作:
        - ID: resolve-command-blood
          名称: 结算鲜血命令
          英文名: Resolve Command Blood
          激活: special
          类型: manual
          状态: []
          引用: []
          说明: 豁免失败后，由目标Actor消费反应并对指定合法生物进行一次近战武器攻击。
      GM步骤:
        - 检查30尺、可见性、目标反应和合法近战目标。
        - 要求DC 16感知豁免。
        - 失败时切换到目标Actor，消费其反应并发动其自身的近战攻击。
```

### 17.4 JSON 检查

- 不能在怪物自己的 Actor 上伪造目标生物的攻击；
- 不能忽略目标的反应是否可用；
- 必须明确由另一个 Actor 发动其自身攻击；
- 在 core 下只能作为 GM 辅助操作。

---

## 18. 示例十五：外部战役规则

### 18.1 正确 TXT 写法

```text
绯晶腐化。当目标因该能力需要进行腐化豁免时，它进行DC 14魅力豁免。
豁免失败时，目标受到绯晶腐化；如果目标已经腐化，则改为获得1级力竭。
绯晶腐化的完整阶段和解除规则使用战役书中的外部规则，本怪物条目不重复定义。
```

### 18.2 错误写法

```text
目标可能会受到绯晶腐化。
```

缺少触发、DC、豁免属性和失败结果。

### 18.3 标准 MD 契约

```yaml
行为机制:
  版本: 1
  机制:
    - ID: ruidium-corruption
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
        条件: 指定能力要求腐化豁免
      条件: []
      引用: []
      状态: []
      操作:
        - ID: resolve-ruidium-corruption
          名称: 结算绯晶腐化
          英文名: Resolve Ruidium Corruption
          激活: special
          类型: manual
          状态: []
          引用: []
          说明: 进行DC 14魅力豁免，并按外部绯晶腐化规则结算。
      GM步骤:
        - 确认前置能力已经要求腐化豁免。
        - 让目标进行DC 14魅力豁免。
        - 失败时查阅战役规则；本Actor不创建未定义的腐化层级。
      外部规则:
        名称: 绯晶腐化 (Ruidium Corruption)
        DC: 14
        属性: cha
        结果: 豁免失败则受到绯晶腐化；已经腐化则获得1级力竭。
```

### 18.4 JSON 检查

- JSON 应保存 DC、魅力豁免和失败结果；
- 应生成明确的 GM 操作入口；
- 不应自行发明腐化层数、持续时间或解除条件；
- 验证状态应保留 `needs_review`。

---

## 19. 常见错误与工具应有的反应

| 错误 | 正确反应 |
|---|---|
| 同一个资源 ID 出现两次 | 阻止解析并指出重复 ID |
| 操作引用不存在的状态或 Item | 阻止生成并指出悬空引用 |
| 资源 AC 档位存在空档或重叠 | 阻止生成 |
| 选择数大于候选数量 | 阻止生成 |
| 声明 `automatic`，但没有经过验证的运行时 projector | 阻止生成 |
| `gm-assisted` 没有写 GM 步骤 | 阻止生成 |
| 复杂机制只出现在普通描述，没有结构化契约 | 不应发明自动化；应在 Intake/人工审阅中标记缺失 |
| 实际伤害、跨 Actor 或环境监听被写成 core 全自动 | 语义验收失败 |
| 作用于受害者的状态被生成成 `self` | 结构或运行时验收失败 |
| “所有速度减半”只修改步行速度 | 语义验收失败；应改为完整实现或 GM 辅助 |

## 20. 推荐的用户操作流程

### 20.1 从原始 TXT 开始

推荐使用 AI-first Intake：

```powershell
bun run src/index.ts `
  --intake-monsters "path/to/monsters.txt" `
  --vault "obsidian/dnd数据转fvttjson" `
  --fvtt-version 14 `
  --effect-profile core
```

如果只是预览发现结果：

```powershell
bun run src/index.ts `
  --intake-monsters "path/to/monsters.txt" `
  --vault "obsidian/dnd数据转fvttjson" `
  --dry-run
```

> [!warning] 当前 Intake 限制
> 当前 `MonsterIntakeIR` 和确定性 Markdown renderer 尚未携带本文的高级资源/行为契约。对包含这些机制的 TXT，必须审阅生成的标准 MD，并补充本文展示的契约后再生成最终 Actor。

### 20.2 从标准 MD 生成 v14 JSON

```powershell
bun run src/index.ts `
  "obsidian/dnd数据转fvttjson/input/example.md" `
  -o "obsidian/dnd数据转fvttjson/output/example.v14.json" `
  --fvtt-version 14 `
  --effect-profile core
```

### 20.3 验证 Actor

```powershell
bun run verify:actor -- `
  --source "obsidian/dnd数据转fvttjson/input/example.md" `
  --actor "obsidian/dnd数据转fvttjson/output/example.v14.json"
```

验证通过后仍需人工检查：

- 资源是否被多个能力正确共享；
- 目标是自身还是选中的生物；
- DC、距离、持续时间和解除条件是否一致；
- `gm-assisted` 操作是否足够让 GM 在战斗中执行；
- 是否把外部规则或动态实伤错误写成自动化；
- v14 的 AC 和其他派生值是否在 Foundry 中实际生效。

## 21. 最后检查表

提交非常规怪物 TXT 前，可以逐项确认：

- [ ] 所有资源都有名称、初始值、最大值和恢复方式。
- [ ] 所有资源获得和消费都有明确数量。
- [ ] 可变消费写明最小值、最大值和缩放公式。
- [ ] 所有触发都有事件、条件和频率。
- [ ] 所有临时状态都有明确解除方式。
- [ ] 所有重复豁免都有 DC、属性和重试时点。
- [ ] 所有救援都有距离、动作消耗和结果。
- [ ] 所有容量都有槽位、获取和释放条件。
- [ ] 所有选择池都有选择数量、候选、互异要求和重置时点。
- [ ] 所有阶段变化都说明是否永久、是否恢复和是否只能发生一次。
- [ ] 所有区域都写明形状、尺寸、持续时间和进入/离开条件。
- [ ] 所有实际伤害联动都明确使用实际伤害，而不是公式或平均值。
- [ ] 所有跨 Actor 操作都明确由哪个 Actor 执行。
- [ ] 所有外部规则都保留触发、DC、属性和结果，但不擅自补写规则正文。
- [ ] 无法自动执行的能力明确标记为 GM 辅助。
- [ ] 最终 JSON 由项目 CLI 生成，没有手工修改。

## 22. 当前结论

本文展示的资源与行为契约已经能够由标准 Markdown parser 投影到 v12/core 和 v14/core Actor JSON，并经过真实 Netherdeep 怪物语料和本地 v14 运行时验收。

当前仍需补齐的是 TXT Intake 层：让 `MonsterIntakeIR` 保存这些资源、触发、关系、生命周期、容量、选择池、区域和外部规则，并让确定性 Markdown renderer 输出同样的契约。在该功能完成前，本手册是用户写作、人工审阅和标准 MD 补全指南，不应被描述为“任意 TXT 已经可以自动生成全部高级怪物机制”。

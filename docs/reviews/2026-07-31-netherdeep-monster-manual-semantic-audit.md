# Netherdeep 怪物 Actor JSON 人工语义审计

- 日期：2026-07-31
- 范围：11 个 Netherdeep 怪物的源 Markdown 与当前工作流生成的 v12 Actor JSON
- 性质：问题清单与产品/工作流需求候选，不是实现方案或完成声明
- 目标版本：Foundry VTT v12 或 v14；v13 暂时保留，但本轮不为它新增独立语义

## 1. 为什么需要这份审计

当前生成物能够保存大量原文，也能生成合法的 Actor、攻击、豁免和伤害活动，但“文字被放进 JSON”不等于“该怪物在 Foundry 中可以按原设计操作”。

本审计不把现有校验脚本、JSON 可解析、生成命令成功或描述文本存在当成语义验收。判断方式是人工逐项阅读每个怪物的源 Markdown 与生成 JSON，回答以下问题：

1. 怪物的核心战斗循环是什么？
2. 需要记录哪些状态、层数、弹药或阶段？
3. 哪些事件会改变这些状态？
4. 哪些动作会消费状态，消费后伤害、范围、AC 或可用动作如何变化？
5. 生成 JSON 是否为操作者提供了实际可用的记录、消费、应用和解除入口？
6. 即使不能全自动，能否在不靠纸笔和临时口算的情况下可靠地手动操作？

## 2. 验收等级

本文使用三个等级区分“有描述”和“能使用”：

### 2.1 文字可读（Literal）

能力原文存在于 Actor 或 Item 描述中，但关键状态、消费、触发或效果只能靠 GM 自行记忆。

这只能证明资料没有完全丢失，不能证明核心玩法已经实现。

### 2.2 核心可操作（Core-operable）

即使没有自动判断所有战斗事件，Foundry 内至少具备：

- 可见、可修改、可重置的资源或状态；
- 正确的初始值、上限和消费量；
- 明确的“获得、消费、清空、应用、解除”入口；
- 与消费量一致的伤害、范围、AC 或效果变化；
- 关联动作不会被误当作无限次独立动作；
- 需要 GM 确认触发时，界面和聊天卡会明确提示，而不是要求回读整段描述。

这是核心规则配置默认应达到的最低可玩标准。

### 2.3 自动触发（Modded-automated）

通过目标版本已验证的 Foundry/dnd5e API，或明确锁定版本的 MIDI-QOL、DAE 等模块，在命中、未命中、豁免成功、受伤、回合开始、进入区域等事件发生时自动改变状态。

自动化是更高层，不应成为“没有模块就连资源也无法记录”的理由。

## 3. 总结结论

当前 11 个生成 JSON 都能承载基础数值和相当一部分攻击/豁免/伤害，但没有一个达到其完整核心玩法的“核心可操作”标准。主要问题不是翻译，而是结构化语义不足。

最集中的缺口是：

1. **没有真正的命名资源**：甲壳共鸣、甲壳过载、针刺、绽放层数和位面调谐都只有文字，没有当前值、上限、恢复和消费。
2. **触发事件没有结构化**：成功豁免、法术未命中、达到伤害阈值、首次进入区域、首次受伤、血量过半等只能人工回忆。
3. **主动作与派生效果没有绑定**：冲锋伤害、下次命中附伤、尾击分支、传奇动作调用攻击等变成互不关联的独立按钮。
4. **状态缺少生命周期**：有些 JSON 能施加状态，却没有正确持续时间、重复豁免、解除动作或来源效果联动。
5. **动态派生值缺失**：针刺余量影响 AC、半血改变伤害、阶段切换改变 AC 和速度等没有落实。
6. **范围解析被次级条款污染**：部分动作把“附近盟友解除状态”的 5 尺误当成攻击或吐息的射程。
7. **少数枚举值不合法或语义丢失**：例如中文状态名或语言名被直接写入本应使用 dnd5e 键值的字段。

因此，Tainted Shellcreeper 和 Urchin Spikeshooter 不是孤例，而是同一类工作流缺陷的两个最直观样本。

### 3.1 逐只结论速览

这里的“否”指完整的定义性战斗循环尚不能在 Foundry 内可靠操作，不表示所有基础攻击或伤害都不可用。

| 生物 | 完整核心循环可操作 | 主要阻断点 |
|---|---:|---|
| Caelian Sea Snail | 否 | 共鸣无记录/消费；下次命中附伤与一次攻击 AC 未绑定 |
| Corrupted Seadragon | 否 | 冲锋、回合开始光环、伤害破坏和半血腐化未联动 |
| Crystalbleed Drakon | 否 | 豁免替换、临时失去抗性、尾击分支和恐慌解除不完整 |
| Eye of the Deep | 否 | 眼梗瞄准、每钳容量、重复豁免和成功豁免反应缺失 |
| Moldering Behemoth | 否 | 一次性血量阶段、速度改变和伤害重定向未实现 |
| Nautiloid | 否 | 三个互异调谐的选择、逐次消费和状态机不存在 |
| Red Kelp Colony | 否 | Bloom 资源、上限转换、范围消费和持续区域触发不存在 |
| Swarm of Sorrowfish | 否 | 每回合首次触发、抗性破坏、半血伤害和位置解除不完整 |
| Tainted Shellcreeper | 否 | 过载没有获得、记录、消费、缩放、清空和姿态解除 |
| Urchin Spikeshooter | 否 | 针刺总量/消费、AC 区间、动作门槛和长休恢复不存在 |
| Ruidium Vampire Squid | 否 | 光照/再生、擒抱容量、生命上限吸取和遮蔽区域不完整 |

## 4. 逐个生物的人工审计

### 4.1 Caelian Sea Snail

源文件：

- `obsidian/dnd数据转fvttjson/input/caelian-sea-snail.md`
- `obsidian/dnd数据转fvttjson/output/caelian-sea-snail.json`

#### 核心玩法

- 对法术豁免成功或法术攻击未命中时，获得 1 层 **Shell Resonance / 甲壳共鸣**，最多 1 层。
- 单次受到至少 10 点钝击伤害或任何雷鸣伤害时，共鸣被清除，反魔法甲壳暂时失效。
- 三个附赠动作都会消费共鸣：
  - 让目标下一次攻击具有劣势；
  - 移动 15 尺且不引发借机攻击；
  - 让本回合下一次 Antler 命中额外造成力场伤害。
- Shell Defense 是针对一次触发攻击的反应 AC 加值。

#### 当前 JSON 中的问题

- 没有甲壳共鸣的当前值、最大值、获得、清除和消费入口。
- 三个消费共鸣的附赠动作可以像普通无限次动作一样使用。
- 反魔法甲壳的豁免优势和法术攻击劣势只在描述中。
- Break Resonance 没有伤害类型/阈值触发，也不会清除资源或暂时禁用反魔法特性。
- Dazzling Refraction 有豁免，但“下一次攻击劣势”没有可靠的效果生命周期。
- Force Resonance 被拆成独立伤害活动，没有绑定“下一次 Antler 命中”，也没有本回合结束失效。
- Shell Defense 的 AC 效果没有限定为“仅针对触发攻击”，存在残留风险。

#### 需要的鲁棒能力

- 二元资源；
- 命中结果/豁免结果触发；
- 多动作共享消费；
- “准备下一次命中附伤”的一次性状态；
- 一次攻击有效的反应 AC；
- 特性临时禁用与自动恢复。

### 4.2 Corrupted Seadragon

源文件：

- `obsidian/dnd数据转fvttjson/input/corrupted-seadragon.md`
- `obsidian/dnd数据转fvttjson/output/corrupted-seadragon.json`

#### 核心玩法

- 直线移动至少 20 尺后以 Ram 命中，会追加伤害、推开并可能击倒。
- Psychic Maelstrom 在生物每回合首次于 10 尺内开始回合时触发。
- 单次受到至少 10 点光耀或雷鸣伤害会暂时关闭 Psychic Maelstrom 和腐化能力。
- 吐息在半血后会对豁免失败者追加 Ruidium Corruption。
- 使用 Ram 或吐息后可以短距离撤离且不引发借机攻击。

#### 当前 JSON 中的问题

- 冲锋被拆成独立伤害/豁免活动，没有移动距离前置条件，也没有与 Ram 命中绑定。
- Psychic Maelstrom 没有回合开始光环、每目标每回合一次限制、禁用反应效果或成功豁免后的处理。
- Ruidium Fracture 只有文字，不会临时关闭相关特性。
- Ruidium Corruption 只有一次魅力豁免入口，没有对应的腐化状态或递进后果。
- 吐息的基础锥形、伤害、豁免和充能基本存在，但半血后的附加腐化没有与吐息绑定。
- Slipstream Retreat 没有 Ram/吐息前置条件，也没有结构化移动和免借机攻击。

#### 需要的鲁棒能力

- 移动距离条件下的命中附加效果；
- 回合开始光环和每目标冷却；
- 受特定伤害后的特性抑制窗口；
- 半血条件分支；
- “本回合使用过某动作”的历史条件。

### 4.3 Crystalbleed Drakon

源文件：

- `obsidian/dnd数据转fvttjson/input/crystalbleed-drakon.md`
- `obsidian/dnd数据转fvttjson/output/crystalbleed-drakon.json`

#### 核心玩法

- Defiance 每日 2 次，把失败豁免改为成功；代价是暂时降至 AC 15 并失去心灵抗性。
- Tail 命中后可选择推开或范围扫击。
- Nightmare Breath 会造成持续恐慌，允许回合末重复豁免，也允许附近盟友用动作解除。
- 传奇动作包含尾击、强迫另一个生物用反应攻击、以及消耗 2 次行动的碎晶齐射。

#### 当前 JSON 中的问题

- Defiance 有次数和 AC 15 效果，但没有“失败改成功”，也没有暂时移除心灵抗性。
- 尾击的推开和横扫是独立活动，没有与 Tail 命中和二选一绑定。
- Nightmare Breath 的锥形范围存在，但活动射程被附近盟友解除条款中的 5 尺污染。
- 恐慌效果没有正确持续时间、回合末重复豁免和盟友解除动作。
- Command Blood 需要目标用反应执行一次真实近战攻击；当前只能文字提示，无法可靠调用目标动作。
- Shard Salvo 的中毒没有完整持续时间和重复豁免，也没有半血后的腐化分支。
- Current Glide 的移动与免借机攻击仍需全文人工处理。

#### 需要的鲁棒能力

- 有次数的失败豁免替换；
- 临时移除伤害抗性；
- 命中后的可选分支；
- 由盟友执行的解除动作；
- 传奇动作转发真实攻击；
- 条件性二次豁免。

### 4.4 Eye of the Deep

源文件：

- `obsidian/dnd数据转fvttjson/input/eye-of-the-deep.md`
- `obsidian/dnd数据转fvttjson/output/eye-of-the-deep.json`

#### 核心玩法

- 玩家可以对暴露眼梗进行特殊瞄准：攻击同时具有劣势和 -5；命中不造成伤害，但会暂时禁用指定射线。
- 两只钳分别擒抱，存在体型限制、逃脱 DC 和每只钳的独立容量。
- Paralyzing Ray 持续 1 分钟并允许重复豁免。
- Pincer Reel 拉近所有被它擒抱的生物并拖带移动。
- 当生物成功通过射线豁免时，它可以反应撤离。

#### 当前 JSON 中的问题

- 暴露眼梗的瞄准、无伤命中和指定射线禁用没有结构化。
- 多重攻击中“两道射线不能以同一目标为目标”的限制只在描述中。
- 钳击可以施加擒抱状态，但没有体型限制、逃脱 DC 和两只钳的独立容量。
- 麻痹效果没有正确持续时间和回合末重复豁免。
- Pincer Reel 的全体拉近、拖带和移动仍是人工操作。
- Crabwise Retreat 没有“目标成功通过射线豁免”的触发，也没有针对该目标的免借机攻击处理。
- 语言字段使用了中文值 `深潜语`；dnd5e 的结构字段应使用对应语言键，而中文名称应留给显示层。

#### 需要的鲁棒能力

- 身体部位瞄准与子能力禁用；
- 每肢体独立容量；
- 多重攻击的目标分配约束；
- 对目标成功豁免的反应；
- 拖带一组被擒抱目标；
- 枚举值规范化与显示文本分离。

### 4.5 Moldering Behemoth

源文件：

- `obsidian/dnd数据转fvttjson/input/moldering-behemoth.md`
- `obsidian/dnd数据转fvttjson/output/moldering-behemoth.json`

#### 核心玩法

- Reckless 是每回合可选择的风险/收益开关。
- 冲锋后 Crystal Fist 会追加伤害、推开和击倒。
- 单次特定伤害达到阈值时，Magic Resistance 和 Lesser Magic Absorption 暂时失效。
- 首次降至 66 HP 或更低时发生一次 Bloodied Rupture，随后永久进入 AC 12、速度 40 尺的新阶段。
- Lesser Magic Absorption 把自己受到的法术伤害减半，并把另一半反射给施法者。

#### 当前 JSON 中的问题

- Reckless 只有描述，没有方便的回合开关或对应攻防效果。
- 冲锋效果未与移动条件和 Crystal Fist 命中绑定。
- Magic Resistance 没有结构化优势；Crystal Fault 不会临时关闭相关特性。
- Bloodied Rupture 有伤害活动和 AC 12 效果，但没有一次性血量阈值触发、永久速度 40 或腐化结果。
- Cleaving Swing 没有可靠的选区/目标集合表达。
- Lesser Magic Absorption 只留下施法者豁免活动，没有基于实际触发伤害计算“自己一半、施法者另一半”。

#### 需要的鲁棒能力

- 回合级可选开关；
- 一次性血量阈值事件；
- 永久阶段转换并修改多个派生属性；
- 暂时关闭特性；
- 基于触发伤害值的拦截与重定向；
- 以一次攻击替换多重攻击中的某一击。

### 4.6 Nautiloid

源文件：

- `obsidian/dnd数据转fvttjson/input/nautiloid.md`
- `obsidian/dnd数据转fvttjson/output/nautiloid.json`

#### 核心玩法

- 每回合开始选择或随机获得 3 个互不重复的位面调谐，并公开显示。
- 本回合前三次 Tentacle 命中各消费一个尚未使用的调谐，产生对应效果。
- 八个调谐包含魅惑、黑暗、推开、束缚到石化的两阶段过程、附伤、困惑、恐慌，以及水下减伤等差异。
- Planar Rejection 每日 2 次，把失败豁免改为成功，暂时禁用当前调谐，并对自身造成不可减免的力场伤害。
- 传奇动作可以执行无调谐触手攻击或范围脉冲。

#### 当前 JSON 中的问题

- 没有每回合 3 个调谐槽、互斥选择、公开当前选择、命中后逐个消费或回合重置。
- 八个调谐被拆成可随意点击的动作，无法保证每回合只使用选中的三个且各一次。
- 多数调谐的状态、区域、持续时间和环境条件只有文字。
- Earth 到 Complete Petrification 的两阶段状态机没有关联。
- Celestia/Avernus 的伤害没有绑定触手命中；Avernus 的水下减半也没有结构化。
- Planar Rejection 虽有次数，却没有失败豁免替换、当前调谐禁用和自身不可减免伤害。
- Undertow 的伤害和击倒部分存在，但缺少正确的 60×15 尺线形模板与拉近。
- “无调谐触手”传奇动作没有真正转发 Tentacle 攻击。
- Phase Pulse 的推开和禁用反应仍需人工处理。

#### 需要的鲁棒能力

- 回合范围内的互异选择队列；
- 命中后依序或指定消费；
- 两阶段状态机；
- 环境条件修正；
- 转发/复用既有攻击活动；
- 线形区域与位移。

### 4.7 Red Kelp Colony

源文件：

- `obsidian/dnd数据转fvttjson/input/red-kelp.md`
- `obsidian/dnd数据转fvttjson/output/red-kelp.json`

#### 核心玩法

- 在附近施放 1 环或更高法术时，每轮一次获得 Bloom，最多 3 层。
- 达到 3 层时自动消费全部层数，并恢复 Algal Bloom 的一次使用。
- 单次达到阈值的挥砍伤害会减少 Bloom；没有 Bloom 时还会暂时关闭 Sticky Hold。
- Sticky Hold 每回合首次对同格内的近战攻击者触发擒抱豁免。
- Algal Bloom 可以消费任意 Bloom 来扩大半径，并形成持续到下回合的区域；进入或结束回合时触发伤害、中毒和禁止恢复生命。

#### 当前 JSON 中的问题

- 没有 Bloom 当前层数、上限、每轮获得限制、达到 3 层后的自动转换或恢复另一个动作次数。
- Rooted 的难行地形、允许占据同一空间、免疫强制移动/倒地主要依赖文字。
- Sever Roots 不会减少资源或在零层时关闭 Sticky Hold。
- Sticky Hold 有豁免入口，但没有“每回合首次、同一空间、受到近战攻击”的触发，也没有完整擒抱结果。
- Root Lash 的拉近没有结构化。
- Algal Bloom 有基础次数、球形范围和伤害，但没有消费 Bloom 扩大半径。
- 持续区域、进入/结束回合触发、禁止恢复生命和区域消失时机均未完整表达。

#### 需要的鲁棒能力

- 附近法术事件产生资源；
- 达到上限后自动消费并恢复另一活动次数；
- 消费任意资源扩大区域；
- 持续区域的进入/回合结束触发；
- 禁止生命恢复；
- 同格与每回合首次触发。

### 4.8 Swarm of Sorrowfish / 哀恸鱼集群

源文件：

- `obsidian/dnd数据转fvttjson/input/swarm-of-sorrowfish__哀恸鱼集群.md`
- `obsidian/dnd数据转fvttjson/output/swarm-of-sorrowfish__哀恸鱼集群.json`

#### 核心玩法

- 每回合首次受到伤害时，附近其他生物进行豁免；失败者攻击劣势、不能反应、速度减半，成功者获得短暂免疫。
- 雷鸣伤害会暂时移除钝击/穿刺/挥砍抗性并关闭 Virulent Sorrow。
- Bites 在半血后由 6d6 降为 3d6。
- Desolate Drain 只影响与集群同一空间的生物；震慑可因集群离开、盟友拉出或雷鸣伤害而解除。
- Flow 允许特殊穿越，但不能重复进入同一生物空间。

#### 当前 JSON 中的问题

- Virulent Sorrow 没有“每回合首次受伤”触发、成功者免疫窗口和失败效果的完整生命周期。
- Thunder Scatter 不会临时移除物理抗性或关闭 Virulent Sorrow。
- Bites 只有满血伤害，没有半血替代伤害。
- Desolate Drain 的目标应在同一空间，但活动射程被盟友 5 尺解除条款污染。
- 震慑没有与位置、盟友拉出动作和雷鸣解除绑定。
- Flow 的特殊移动限制只能人工判断。
- 状态免疫中出现中文值 `擒抱`；结构字段应使用 dnd5e 的状态键。
- “微型异怪的中型集群”的集群类型信息没有完整保留为可用结构。

#### 需要的鲁棒能力

- 每回合首次触发与逐目标免疫窗口；
- 临时移除伤害抗性；
- 半血伤害替换；
- 同一空间目标条件；
- 与位置或救援动作关联的效果解除；
- 集群类型与状态枚举规范化。

### 4.9 Tainted Shellcreeper

源文件：

- `obsidian/dnd数据转fvttjson/input/tainted-shellcreeper.md`
- `obsidian/dnd数据转fvttjson/output/tainted-shellcreeper.json`

#### 核心玩法

- 对法术豁免成功或法术攻击未命中时获得 **Shell Overload / 甲壳过载**，最多 2 层。
- 单次受到至少 10 点钝击伤害或任何雷鸣伤害时清空过载、AC 降至 11，并暂时关闭 Antimagic Shell。
- Psychic Reverberations 可以消费任意层过载，每消费 1 层追加 3 点力场伤害。
- 半血且消费 2 层时，豁免失败者还承受 Ruidium Corruption。
- Shell Defense 提供 AC 加值并使自身受束缚，直到用附赠动作 Emerge 解除。

#### 当前 JSON 中的问题

- 没有过载层数的记录位置、最大值、获得方式、消费选择和清空动作。
- Psychic Reverberations 不会消费层数，也不会按消费层数增加力场伤害。
- 半血且消费 2 层的腐化分支不存在。
- Crack Overload 虽生成了 AC 11 效果，但没有伤害阈值/类型触发、清空层数或禁用 Antimagic Shell。
- Antimagic Shell 的优势/劣势仍是描述。
- Shell Defense 只有 AC +4，没有自身受束缚。
- Emerge 不会移除 Shell Defense 对应的 AC 与束缚效果。

#### 判断

这是一个明确的核心玩法阻断问题。当前 JSON 能显示规则，却不能在 Foundry 内可靠执行“获得层数 → 选择消费 → 伤害增幅 → 被打破清空 → 防御姿态解除”的循环。

#### 需要的鲁棒能力

- 可堆叠资源；
- 豁免/未命中事件获得资源；
- 消费任意层并按消费量缩放固定伤害；
- 清空全部资源；
- 进入姿态与明确取消动作；
- 资源、半血和动作结果的组合条件。

### 4.10 Urchin Spikeshooter

源文件：

- `obsidian/dnd数据转fvttjson/input/urchin-spikeshooter.md`
- `obsidian/dnd数据转fvttjson/output/urchin-spikeshooter.json`

#### 核心玩法

- 初始拥有 12 根针刺。
- 每次 Spike 消耗 1 根；Volley 消耗 3 根；Recoil 也消耗 1 根。
- AC 随剩余针刺落入不同区间而变化：20 / 18 / 16 / 14 / 12。
- 长休恢复全部针刺。
- Spiked Hide 仅在 AC 至少 16 时有效。
- 多重攻击最多三次，但实际次数受剩余针刺限制。
- Volley 会束缚目标，并允许目标或盟友用动作拔除。

#### 当前 JSON 中的问题

- 没有针刺总量、当前余量、最大值或长休重置。
- Spike、Volley 和 Recoil 都不会消费针刺。
- AC 不会随针刺余量落入区间而变化。
- 针刺耗尽后攻击仍可无限使用，多重攻击也不会按余量缩减。
- Spiked Hide 没有 AC/针刺余量门槛，也没有相邻近战攻击后的触发。
- Volley 的充能、锥形、伤害和束缚大体存在，但没有 3 根针刺成本。
- Volley 的活动射程被附近盟友解除条款中的 5 尺污染；解除动作也没有与束缚效果绑定。
- Recoil 没有“近战攻击未命中”的触发、资源消费和移动免借机攻击。

#### 判断

这与 Shellcreeper 属于同一类结构缺口，但更能说明“资源会驱动派生属性和动作可用性”。如果只增加一个次数框而不实现 AC 区间、多个消费者和可用性门槛，仍然不能算完成。

#### 需要的鲁棒能力

- 有初始值和长休恢复的弹药资源；
- 多个活动以不同数量消费同一资源；
- 当前资源区间映射到 AC；
- 资源不足时禁用或缩减动作；
- 资源阈值控制被动特性；
- 反应动作消费资源。

### 4.11 Ruidium Vampire Squid

源文件：

- `obsidian/dnd数据转fvttjson/input/vampire-squid.md`
- `obsidian/dnd数据转fvttjson/output/vampire-squid.json`

#### 核心玩法

- 明亮光照会在回合开始造成伤害，并使攻击和属性检定具有劣势。
- 再生会被光耀、钝击或明亮光照抑制，并带有特殊的 0 HP 死亡时机。
- 两根触手分别擒抱并束缚，存在体型、逃脱 DC 和最大两个目标的容量。
- Bite 只能攻击被擒抱/束缚目标，并会降低生命上限、治疗乌贼；半血目标还可能承受腐化。
- Bloodtide Allure 会强迫目标安全靠近，并在受伤时重复豁免。
- Crimson Veil 是水下受伤时的反应，生成遮蔽区域、移动并可拖带一个目标；魔法明亮光照会压制遮蔽。

#### 当前 JSON 中的问题

- 光照伤害、光照中的劣势、再生抑制条件和 0 HP 死亡规则都是文字。
- 腐化豁免没有对应状态。
- 触手能施加擒抱/束缚效果，但没有体型门槛、逃脱 DC 和两根触手的容量管理。
- Bite 的目标条件可能部分保留，但生命上限降低、自身治疗、长休恢复、生命上限归零死亡和半血腐化没有完整落实。
- Bloodtide Allure 缺少强制靠近、持续时间和受伤时重复豁免。
- Crimson Veil 有每日次数，但没有水下受伤触发、遮蔽区域、移动/拖带或明亮光照压制。

#### 需要的鲁棒能力

- 环境光照条件；
- 再生抑制窗口和特殊 0 HP 生命周期；
- 擒抱容量；
- 基于实际死灵伤害的生命上限降低与治疗；
- 强制移动行为；
- 可被环境条件压制的区域效果。

## 5. 跨生物的鲁棒功能需求

### 5.1 命名资源与计数器

建议工作流中建立通用的资源语义，而不是按怪物名称写分支。至少需要：

- 稳定 ID、双语显示名；
- 初始值、当前值、最小值、最大值；
- 恢复周期；
- 增加、减少、设置、全部清空；
- 一个资源被多个活动消费；
- 固定消费、消费任意数量、消费全部；
- 资源不足时的活动可用性；
- 消费量传递给伤害、范围或其他派生值。

覆盖例子：

- Shell Resonance；
- Shell Overload；
- Spikes；
- Bloom；
- Planar Attunement slots。

对于 NPC，优先考虑由嵌入 Item/Activity 的 uses 承载可见资源；不要假设 NPC Actor 本体有任意命名资源槽。若一个资源被多个 Item 共享，则需要明确的 Actor 级状态载体或受控的共享引用，而不是复制多个互不一致的次数框。

### 5.2 事件触发器

需要能表示或至少提示以下通用事件：

- 攻击命中/未命中；
- 某类攻击未命中自身；
- 豁免成功/失败；
- 单次伤害达到阈值；
- 受到特定伤害类型；
- 回合开始/结束；
- 每回合首次、每轮一次；
- 进入、离开或结束回合于区域；
- 本回合使用过某活动；
- HP 首次低于阈值；
- 目标是否半血、是否具有某状态；
- 明亮光照、水下等环境状态。

核心规则不必自动监听全部事件，但必须能生成清晰的 GM 确认入口和正确的后续状态变化。

### 5.3 状态生命周期与阶段转换

一个 Active Effect 存在不代表能力正确。工作流必须区分：

- 直到自己下回合开始；
- 直到自己下回合结束；
- 直到目标下回合结束；
- 仅对一次触发攻击；
- 直到下一次命中；
- 直到受到指定伤害；
- 直到某解除动作；
- 持续一分钟并在回合末重复豁免；
- 永久阶段转换；
- 一场战斗只能触发一次。

还要支持：

- 暂时关闭/恢复某个特性；
- 暂时移除/恢复伤害抗性；
- 多个效果由同一个“解除/恢复”动作一起撤销；
- 阶段转换同时改变 AC、速度、伤害和可用特性。

### 5.4 主动作、附加效果与转发动作

许多能力不是独立动作，而是：

- 某攻击命中后的可选附加效果；
- 满足移动条件后的追加伤害；
- 下一次指定攻击的附伤；
- 传奇动作执行一个已有攻击；
- 多重攻击中用另一个活动替换一次攻击；
- 由另一个 Actor 用反应执行攻击；
- 由盟友执行解除动作。

工作流需要稳定的活动引用和转发机制，避免把所有条款都拆成可无限单独点击的 Item。

### 5.5 动态数值和区间

需要通用表达：

- 资源区间 → AC；
- HP 区间 → 伤害骰；
- 消费数量 → 固定附伤；
- 消费数量 → 区域半径；
- 进入阶段 → 多个永久属性变化；
- 环境条件 → 伤害减半或特性禁用。

这类规则应由结构化源数据或可泛化语法产生，不能靠 `Urchin`、`Spike` 等名称判断。

### 5.6 位置、区域和目标约束

需要正确区分主动作范围与从属条款中的距离：

- 攻击/吐息本身的范围；
- 附近盟友执行解除动作的距离；
- 目标必须与施法者同一空间；
- 自身周围光环；
- 锥形、线形、球形区域；
- 移动、推、拉、拖带；
- 每个肢体的擒抱容量；
- 多重攻击中不能重复选择同一目标。

当前至少三个能力暴露了“解除条款的 5 尺污染主活动射程”的解析风险，因此需要基于条款归属，而不是就近抽取数字。

### 5.7 外部规则引用

Ruidium Corruption 的完整定义目前不应凭怪物段落或名称推测。工作流应允许：

- 引用一个明确的外部状态/规则定义；
- 在该定义缺失时保留豁免和原文；
- 标记为 `needs_review` 或“外部规则未解析”；
- 不伪造疲乏层数、持续时间或恢复方法。

后续若提供统一的腐化规则，可以由稳定 ID 让所有怪物复用，而不是复制并逐只漂移。

## 6. 建议的中间语义层

以下是候选模型，不代表本轮已授权实现：

```ts
type SemanticResource = {
  id: string;
  label: { zh: string; en: string };
  initial: number;
  min: number;
  max: number;
  recovery?: "turn" | "shortRest" | "longRest" | "never";
};

type SemanticTrigger = {
  event:
    | "attackHit"
    | "attackMiss"
    | "saveSucceeded"
    | "saveFailed"
    | "damageTaken"
    | "turnStart"
    | "turnEnd"
    | "areaEntered"
    | "hpThresholdCrossed";
  conditions?: SemanticCondition[];
  frequency?: "oncePerTurn" | "oncePerRound" | "oncePerCombat";
};

type SemanticMutation =
  | { kind: "resource"; resourceId: string; operation: "add" | "spend" | "set" | "clear"; value?: number | "any" | "all" }
  | { kind: "effect"; effectId: string; operation: "apply" | "remove" | "suppress" | "restore" }
  | { kind: "derived"; field: "ac" | "speed" | "damage" | "area"; mapping: unknown }
  | { kind: "forwardActivity"; activityId: string };
```

关键不是采用上述具体 TypeScript 形状，而是先在解析结果中保留“资源—触发—消费—变化—恢复”的关系，再分别投影到 v12 和 v14。否则直接从自然语言生成 Foundry Item 时，这些关系会继续被压扁成描述文本。

## 7. v12、v13 与 v14 的版本判断

### 7.1 v14 不会自动解决语义缺口

显式生成 v14 JSON，只会切换目标 Foundry/dnd5e 结构和可用模块契约。没有中间语义和投影逻辑时：

- Shell Overload 仍不会自动出现；
- Spikes 仍不会自动成为共享弹药；
- 动态 AC 仍不会根据余量变化；
- 成功豁免/攻击未命中仍不会自动增加资源；
- 解除动作仍不会自动撤销来源效果。

因此不能把“升到 v14”当作修复。

### 7.2 本地资料是否足够

对于本轮的人工审计，以及设计 `core-operable` 的资源、次数、Activity、Active Effect 和版本投影，本地资料足够：

- 当前 11 份源 Markdown；
- 当前生成的 v12 JSON；
- 项目内的 Foundry v14 与 dnd5e 5.3.3 锁定参考；
- v12/dnd5e 4.3.9 的既有生成与测试基线；
- 当前项目的支持矩阵和验证规范。

本地资料不足以自动补全未提供的 Ruidium Corruption 世界规则，也不能仅凭本地 schema 证明某个模块事件钩子在目标版本的运行时行为。后者在实现自动触发前仍需按锁定版本逐项核实和运行时验收。

### 7.3 推荐版本策略

- 保留现有默认 v12，除非另行决定修改产品默认值。
- v13 暂时继续走已有兼容路径，不为本轮问题新增第三套语义实现。
- 先建立版本无关的中间语义和 `core-operable` 行为。
- 分别由 v12 与 v14 projector 输出对应结构。
- 若用户主要实跑 v14，可优先对 v14 做运行时验收，但不能让 v12 输出静默退化为纯文字。
- 模块自动化作为显式 profile；核心资源和手动操作能力不依赖模块。

## 8. 对工作流验收规则的建议

后续实现时，生成器的“accepted”不能只表示 JSON/schema 通过。建议为每条源能力建立条款账本：

| 状态 | 含义 |
|---|---|
| `structured` | 已由目标版本结构或已验证自动化完整表达 |
| `core-operable` | 触发需 GM 确认，但记录、消费、效果和解除都可在 Foundry 内操作 |
| `literal-only` | 只有描述文本，核心状态或关系不可操作 |
| `unsupported` | 目标版本或当前工作流无法表达 |
| `external-reference` | 依赖未提供的统一外部规则 |

若一个生物的定义性战斗循环含有 `literal-only` 或 `unsupported` 条款，生成物不应被标记为语义 accepted。可以继续输出用于审阅，但必须返回可见警告。

每个新增通用规则都应至少验证：

1. 两个应当命中的正例；
2. 一个语句相近但不应命中的负例；
3. 一个无关 Actor/Item 不发生变化；
4. v12 和 v14 结构投影；
5. 至少一个代表性运行时操作流程；
6. 源条款到 JSON 能力的人工语义复核。

## 9. 建议的实施分组

这不是已经批准的开发计划，只是根据复用价值排列的候选顺序。

### 第一组：资源与消费基础

覆盖：

- Tainted Shellcreeper；
- Urchin Spikeshooter；
- Caelian Sea Snail；
- Red Kelp Colony。

目标：

- 资源初始值/上限/恢复；
- 手动获得、消费、清空；
- 多活动共享消费；
- 资源不足门槛；
- 消费量进入伤害/范围；
- 区间映射 AC。

### 第二组：生命周期与关联活动

覆盖：

- Shell Defense / Emerge；
- Force Resonance / Antler；
- Tail / Push or Sweep；
- Volley / Remove Spikes；
- Frightened / Ally Rescue；
- Legendary action forwarding。

目标：

- 一次性状态；
- 来源与解除动作关联；
- 主活动与派生活动关联；
- 转发既有活动；
- 重复豁免和盟友解除。

### 第三组：事件和阶段

覆盖：

- 伤害阈值打破特性；
- 首次降血阶段；
- 每回合首次/每轮一次；
- 半血条件；
- 回合开始光环；
- 光照和水下条件。

目标：

- core profile 中提供明确的确认式按钮和提醒；
- modded profile 中只对已验证钩子增加自动化；
- 不能自动化时保持“可操作”，而不是退回纯文字。

### 第四组：复杂状态机与跨 Actor 行为

覆盖：

- Nautiloid 三个互异调谐；
- Earth → Complete Petrification；
- Command Blood；
- 伤害重定向；
- 擒抱容量；
- 区域进入/离开触发。

这些应在资源、生命周期和活动引用稳定后再实现。

## 10. 本轮未做的事情

- 没有修改任何怪物 Markdown。
- 没有手改任何 Actor JSON。
- 没有修改解析器、生成器、验证器或测试。
- 没有把 v12 默认目标改为 v14。
- 没有删除 v13 支持。
- 没有自行补写 Ruidium Corruption 的统一规则。
- 没有把“本地资料足够设计”表述成“所有模块自动化已经得到运行时证明”。

## 11. 当前结论

用户发现的两个例子都属于真实问题：

- **Tainted Shellcreeper** 缺的是“过载资源及其完整生命周期”，不是单独少一个计数框。
- **Urchin Spikeshooter** 缺的是“弹药驱动的攻击消费、AC 区间、被动门槛和恢复”，不是只给 Spike 加一个次数。

其余九个生物也存在同类问题，只是分别表现为阶段转换、光环频率、状态解除、主从动作关联、环境条件或跨 Actor 行为。

下一步应先把这些重复问题转化为版本无关的语义能力和清晰的支持层级，再修改生成器。若直接逐只补 JSON 或根据怪物/动作名称写分支，会让当前 11 个样本看似可用，却不能形成鲁棒工作流。

## 12. 修复后人工语义验收

本节是对第 1–11 节“修复前审计”的追加验收记录，不改写历史结论。2026-07-31 已按里程碑 16–19 实现资源与行为语义层，并由项目 CLI 重新生成 11 份 v12/core 与 11 份 v14/core Actor JSON。

所有 22 份 Actor 均有意保持 `needs_review`。这不是生成失败，而是因为完整机制中包含 `gm-assisted` 或 `external-rule` 条款；输出不会把它们误称为自动化。

### 12.1 源条款 → 契约 → JSON → 执行模式对照

| 生物 | 源机械条款 | `行为机制` 契约 | JSON 载体与操作入口 | 执行模式与人工结论 |
|---|---|---|---|---|
| Caelian Sea Snail | 共鸣获得/打破；Force Resonance 下一次 Antler；Dazzling 下一次攻击；Shell Defense 单次 AC | `caelian-resonance-relations`；`caelian-one-attack-defense` | `Antimagic Shell` 上的蓄势、抑制、下一次攻击结算；`Shell Defense` 上的 AC +4 Effect | 关系触发为 `gm-assisted`；单次防护为 `core-operable`。下一次命中/攻击均有可见一次性状态和明确移除时点。 |
| Tainted Shellcreeper | 过载获得/清空/按量释放；破裂 AC 11；半血腐化；缩壳/破壳 | `shellcreeper-overload-lifecycle`；`shellcreeper-defense-posture`；`shellcreeper-ruidium-corruption` | 资源 Item 与心灵回震消费；破裂 Effect；缩壳 AC +4/束缚 Effect；Emerge 移除操作；腐化 DC 14 操作 | 过载触发为 `gm-assisted`，姿态为 `core-operable`，腐化为 `external-rule`。运行时确认 AC 13→17→13 与 13→11→13。 |
| Urchin Spikeshooter | 30 根刺针；攻击/齐射/反冲消费；剩余量限制多重攻击、Spiked Hide 与 AC；钉刺束缚/拔除 | `urchin-spike-thresholds`；`urchin-pinning-lifecycle` | 刺针资源、消费与 AC 档位；阈值检查操作；目标生物上的束缚 Effect 与拔除操作 | 数量/阈值判断为 `gm-assisted`，束缚生命周期为 `core-operable`。受害者操作已验证指向 `creature`，不再错误指向射手自身。 |
| Red Kelp Colony | 每轮首次法术获得藻华；挥砍失去/抑制 Sticky Hold；Root Lash 拉拽；缩放毒云、治疗压制与删除 | `red-kelp-event-triggers`；`red-kelp-bloom-area` | 藻华资源；抑制/擒抱 Effect；拉拽操作；半径模板与治疗压制操作 | 两组均为 `gm-assisted`。模板尺寸基于资源活动显示值调整；每目标频率和区域进入/结束由 GM 记录。 |
| Corrupted Seadragon | Charge→Ram；Maelstrom 每目标每回合一次；Fracture 抑制；半血吐息腐化；Slipstream | `seadragon-combat-relations`；`seadragon-fracture-and-corruption` | 冲锋转发、漩涡、撤离操作；绯晶能力失效 Effect；腐化 DC 13 操作 | 联动为 `gm-assisted`，腐化为 `external-rule`。运行时确认抑制标记及“下一回合开始”解除信息存在。 |
| Crystalbleed Drakon | Defiance 失败改成功、AC 15、失去心灵抗性；Tail 二选一与传奇转发；恐慌重复豁免/盟友拔刺；Command Blood | `drakon-defiance-state`；`drakon-tail-and-legendary-relations`；`drakon-nightmare-lifecycle`；`drakon-ruidium-corruption` | Defiance 次数与 AC Effect；尾击选择/转发/跨 Actor 操作；目标恐慌 Effect 与救援操作；腐化 DC 16 | Defiance、尾击、Command Blood 为 `gm-assisted`；恐慌生命周期为 `core-operable`；腐化为 `external-rule`。心灵抗性明确要求标记期间由 GM 忽略，没有伪装成自动移除。 |
| Eye of the Deep | 指定眼梗/射线禁用；两只螯钳独立容量；麻痹重复豁免；Reel；成功抵抗后的 Retreat | `eye-eyestalk-disable`；`eye-pincer-capacity`；`eye-ray-and-reel-lifecycle` | 射线禁用标记；2 槽容量 Item 的占用/释放；麻痹、拖拽和退避操作 | 均为 `gm-assisted`。运行时确认容量 `0→1→2→2→1`，第三次占用不会越界。 |
| Moldering Behemoth | Reckless 回合状态；Charge→Crystal Fist；Crystal Fault；首次半血永久阶段；Lesser Magic Absorption | `behemoth-turn-and-charge`；`behemoth-fault-and-bloodied-stage`；`behemoth-ruidium-corruption` | Reckless/裂隙/永久阶段 Effect；冲锋、实际伤害转移与腐化操作 | 前两组为 `gm-assisted`，腐化 DC 16 为 `external-rule`。运行时确认永久阶段 AC 14→12、步行 30→40，且可见状态用于阻止重复触发。 |
| Nautiloid | 每回合选 3 个互异调谐、逐次消费/重置；八选项；Earth 两阶段石化；Planar Rejection；Undertow；Unattuned Tentacle | `nautiloid-planar-choice-pool`；`nautiloid-earth-state-machine`；`nautiloid-rejection-and-forwarding` | 3 次选择池、8 个候选标记与重置；矿化/石化 Effect 与成功/失败操作；60×15 尺线形模板；转发/禁用操作 | 选择池与转发为 `gm-assisted`，两阶段状态为 `core-operable`。运行时确认 3 个标记、第四次阻止、重置归零，以及束缚→清除→石化转换。 |
| Swarm of Sorrowfish | 每回合首次受伤触发；成功免疫；雷鸣震散；半血啃咬；同格 Drain；离开/盟友/雷鸣解除 | `sorrowfish-virulent-and-scatter`；`sorrowfish-bloodied-bites`；`sorrowfish-drain-lifecycle` | 失败/免疫/震散 Effect；满血/半血选择操作；同格震慑 Effect 与 5 尺盟友救援操作 | 首次触发和伤害档为 `gm-assisted`，Drain 生命周期为 `core-operable`。人工审计移除了错误的“只减半 walk”投影；现在明确要求 GM 减半所有移动速度。 |
| Ruidium Vampire Squid | 光照/伤害抑制再生；两触手容量；实际死灵伤害吸血；Allure；墨雾/移动/拖带；腐化 | `squid-light-and-regeneration`；`squid-tentacle-capacity`；`squid-bite-and-allure`；`squid-crimson-veil-area`；`squid-ruidium-corruption` | 回合开始与抑制操作；2 槽容量 Item；实际伤害结算与魅惑 Effect；20 尺半径模板与移动操作；腐化 DC 16 | 前四组均为 `gm-assisted`，腐化为 `external-rule`。实际伤害、环境、跨 Actor HP 与拖带均未误报自动化。 |

### 12.2 运行时推翻并修复的问题

人工/运行时验收没有把结构测试通过当作完成，实际发现并修复了两个问题：

1. **受害者状态错误指向自身**：最初所有行为 Activity 都生成 `target.affects.type=self`。这会让钉刺束缚、噩梦恐慌、麻痹、震慑和魅惑错误作用于怪物自己。通用 projector 现在依据被引用状态的 `target` 输出 `self` 或 `creature`，并在一个操作混合两类目标时失败关闭。两组正例、对应移除操作和自身 AC 反例均覆盖 v12/v14。
2. **哀恸鱼速度投影不完整**：最初只修改 `system.attributes.movement.walk`，无法代表“所有速度减半”。该不完整自动变化已删除，状态与 GM 步骤明确要求减半所有移动方式，避免制造错误自动化。

### 12.3 Foundry v14.364 / dnd5e 5.3.3 本地运行时证据

一次性本地世界实际导入全部 11 只 v14/core Actor，并完成：

- Caelian 单次防护 AC `14→18→14`，以及下一次 Antler 命中标记的施加与移除；
- Tainted Shellcreeper 缩壳 AC `13→17→13`、束缚状态联动、破裂 AC `13→11→13`；
- 目标生物上的棘刺束缚、噩梦恐慌、重复豁免/盟友救援移除；
- Corrupted Seadragon 临时抑制标记；
- Moldering Behemoth 永久濒血阶段 AC `14→12`、步行速度 `30→40`；
- Eye of the Deep 双槽容量 `0→1→2→2→1`；
- Nautiloid 三个互异选择标记、第四次容量阻止、重置归零、Earth 束缚前置状态到石化状态；
- 真实放置 60×15 尺 `ray` 位面暗流模板与 20 尺 `circle` 绯潮墨雾模板；
- GM 辅助卡正确显示实际法术伤害分流、跨 Actor 反应攻击、实际死灵伤害吸血、光照/再生结算顺序；
- 五个绯晶腐化外部规则分别保留 DC 14、13、16、16、16，均为魅力豁免且不生成未定义的腐化层级。

测试结束后删除了 11 个临时 Actor、11 个 Token、23 条测试消息和 2 个模板；端口 30001 已释放，项目本地 `options.json` 已恢复到 `cor-cotn`。没有访问或修改生产 Foundry。

### 12.4 最终支持边界

- `automatic`：本轮没有任何 core 行为声明为自动监听。
- `core-operable`：Foundry 原生 Activity/Effect/uses 可承担状态、数值、容量和模板；触发时点及移除仍由 GM 确认。
- `gm-assisted`：动态实伤、跨 Actor、环境、每目标频率、命中联动和选择互异等均有明确操作卡、状态或资源，但不宣称自动监听。
- `external-rule`：绯晶腐化仅保留源触发、DC、属性和失败结果，并明确要求查阅外部战役规则。

机械门禁与语义验收均通过后，本批 22 份 JSON 可作为“结构化、可在 core 中操作、但需要 GM 审阅”的最终产物；它们不是全自动 Actor。

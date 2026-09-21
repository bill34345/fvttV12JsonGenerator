# Custom Conditions + Trigger Engine 重规划

> 当前版本的验收与交付摘要以[候选收尾表](../reviews/2026-09-21-custom-conditions-release-readiness.md)为准；日常操作见[使用说明](../runbooks/custom-conditions-and-trigger-engine-usage.md)。本文件后半部保留历史检查点与故障经过，不能只读某个旧检查点推断当前状态。

- 日期：2026-09-18
- 状态：候选版本收尾中；当前结论见 [2026-09-21 收尾表](../reviews/2026-09-21-custom-conditions-release-readiness.md)，下文按日期保留的检查点属于历史记录
- 工作树：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20260916-154837-trigger-engine`
- 目标环境：Foundry `14.364` / dnd5e `5.3.3`

## 一、核心决定

当前 worktree 中已经实现的 Bleeding 方案不再作为后续架构基础。

原因：新的自定义 Condition 体系已经确定采用统一的“Condition 定义 + Condition 实例参数 + 通用触发事件”模型，现有 Bleeding 的专属管理器、专属数据结构和 Trigger Engine 内置结算职责与这个方向不一致。

本计划从统一 Condition 模型重新设计，Bleeding 仅作为 19 个自定义状态中的一个参数化状态重新实现。

后续开发继续使用当前 trigger-engine worktree，不另外开 Conditions worktree。两个 Mod 在同一个开发阶段完成，最终仍作为两个独立 Foundry Mod 发布。

## 二、最终产品结构

### `fvtt-trigger-engine`

定位：通用触发器与事件调度基础设施。

只负责：

- 监听 Foundry 通用事件。
- 构造稳定的 trigger context。
- 根据配置筛选是否触发。
- 调用 Macro 或其他 Mod 的公开动作。
- active GM 单执行者控制。
- 同 Actor 更新排队。
- 因果链与防递归。
- Trigger Manager 的创建、编辑、启停和持久化。

Trigger Engine 不拥有任何具体 Condition 规则，也不维护 Bleeding、Burning、Frozen 等状态专属运行时。

### `fvtt-custom-conditions`

定位：自定义状态定义、参数、规则、UI 和运行时行为。

负责：

- 注册自定义 Condition。
- Token/Actor 手动施加与解除。
- Condition 参数输入和编辑。
- 保存每个 Condition 实例的数据。
- 应用可由 ActiveEffect 表达的规则。
- 执行需要运行时逻辑的规则。
- 提供公开 API 给 Trigger Engine 调用。
- 读取 Generator 写入的 Condition 模板。

## 三、本期 Condition 范围

本期做 19 个自定义状态：

1. Addled
2. Bewildered
3. Bleeding `[X]`
4. Burning `[X]`
5. Clumsy
6. Dazed
7. Defenseless
8. Distracted
9. Enfeebled
10. Frozen `[DC X]`
11. Helpless
12. Immobilized
13. Jinxed `[X]`
14. Shocked
15. Sickened
16. Slowed
17. Staggered
18. Valor `[X]`
19. Weakened

明确排除：

- Bloodied：使用 dnd5e/FVTT 原生能力。
- Drakkenheim Madness：本期不做。
- Contamination：本期不做。

## 四、统一 Condition 模型

每个状态分成两层。

### Condition Definition

定义固定规则元数据，例如：

- 稳定 ID。
- 名称与本地化名称。
- 图标。
- 规则说明。
- 是否参数化。
- 参数 schema。
- 是否需要 Trigger Engine 事件。
- 是否可以纯 ActiveEffect 表达。
- 施加、编辑、解除入口。

### Condition Instance

表示某个 Actor 当前实际拥有的一次状态，例如：

- `Bleeding` + `2d6`
- `Burning` + `2d6` + `fire`
- `Frozen` + `DC 15`
- `Jinxed` + `1d6`
- `Valor` + `1d4`

同一个 Condition Definition 可以产生不同参数的实例。

## 五、参数化状态模型

### Bleeding `[X]`

实例至少需要：

- 骰式 `X`。
- 结算时机。
- HP loss 或 damage 语义。
- 伤害类型，如规则来源有写。
- 重复施加策略。
- 恢复 HP 是否解除。
- 其他结束条件说明。

本期重新实现，不继承旧 Bleeding manager 的结构假设。

### Burning `[X]`

实例至少需要：

- 骰式。
- 伤害类型。
- 结算时机。
- 结束条件。

### Frozen `[DC X]`

实例至少需要：

- 解除 DC。
- 与 Immobilized、Defenseless、Helpless 的规则关系。
- 指定伤害解除规则。

### Jinxed `[X]`

实例至少需要：

- 惩罚骰式。

### Valor `[X]`

实例至少需要：

- 加值骰式。

## 六、先废弃现有 Bleeding 专属设计

在开始新实现前，先把当前 Bleeding 工作按“废弃实现”处理。

需要完成：

- 列出 Trigger Engine 中所有 Bleeding 专属代码、UI、API、测试和文档。
- 列出 Generator 中所有为旧 Bleeding contract 写入的逻辑。
- 区分可复用的通用能力与 Bleeding 专属能力。
- 通用能力保留，例如 combat turn 事件、active GM、因果链、队列。
- Bleeding 专属 manager、API、flags schema、测试断言不作为兼容目标。
- 新 Condition schema 确定后再重写 Generator 输出。

这一步的目标是避免为了兼容已经失去意义的 Bleeding 结构，污染新的 Condition 设计。

## 七、Trigger Engine 优化阶段

### T1：冻结通用核心

确认并保留已有通用能力：

- `documentUpdate`
- combat turn 生命周期
- active GM 权限
- queue
- causal ancestry
- Trigger Manager
- Macro/action dispatch

删除架构上属于具体 Condition 的职责。

### T2：建立本期需要的通用事件

只增加 19 个 Conditions 实际需要的事件。

优先事件：

- Actor document update
- combat turn start
- combat turn end

如实现过程中确实需要，再增加：

- ActiveEffect create
- ActiveEffect update
- ActiveEffect delete

不提前扩展成完整 Foundry Hook 总线。

### T3：公开稳定调用边界

Trigger Engine 向其他 Mod 提供稳定的事件 context 与 action 调用能力。

Custom Conditions 通过公开接口消费事件，不导入 Trigger Engine 私有源码。

完成标准：Trigger Engine 本身不包含任何 `bleeding`、`burning`、`frozen` 等具体状态判断。

## 八、Custom Conditions 实现阶段

### C1：模块骨架

新建：

`foundry-modules/fvtt-custom-conditions/`

具备独立：

- manifest
- package
- build
- tests
- README
- lang
- styles
- templates
- ZIP artifact

### C2：状态目录与注册

一次性定义 19 个稳定 Condition ID、名称、图标、说明和参数类型。

先保证：

- FVTT 能识别。
- Token HUD 能显示。
- 可以手动添加/移除。
- 世界重载后仍保持。

### C3：Condition Manager

提供 GM 可用的管理 UI：

- 查看目标当前 Conditions。
- 添加 Condition。
- 参数化 Condition 填写参数。
- 编辑实例参数。
- 解除 Condition。
- 查看规则摘要与来源。

参数输入示例：

- Bleeding `2d6`
- Burning `2d6 Fire`
- Frozen `DC 15`
- Jinxed `1d6`
- Valor `1d4`

### C4：静态规则状态

先实现无需定时触发、可以由 dnd5e/ActiveEffect 或 Condition runtime 直接表达的状态。

优先：

- Addled
- Bewildered
- Clumsy
- Dazed
- Defenseless
- Distracted
- Enfeebled
- Helpless
- Immobilized
- Jinxed
- Shocked
- Sickened
- Slowed
- Staggered
- Valor
- Weakened

每个状态逐个验证真实 dnd5e 行为，不仅检查图标存在。

### C5：动态规则状态

随后实现：

1. Bleeding
2. Burning
3. Frozen

Bleeding 作为第一条完整动态 Condition 链路，但使用新的统一 Condition schema。

验证链路：

`施加 Condition → 保存实例参数 → Trigger Engine 事件 → Custom Conditions 执行规则 → 更新 Actor → 满足解除条件后移除`

## 九、Generator 重接计划

Generator 不再输出旧 Bleeding contract。

等新 Condition schema 稳定后统一接入。

正式目标：

`来源 Markdown/YAML → Generator → Condition template → Actor/Item JSON → Foundry → Custom Conditions`

规则：

- 只提取来源明确写出的参数。
- 不猜骰式。
- 不猜 DC。
- 不猜伤害类型。
- 不猜叠加策略。
- 不猜解除条件。
- 怪物的攻击携带“可施加 Condition 的模板”，怪物本体不会因此获得该 Condition。
- 手工施加与 Generator 模板使用同一数据 schema。

## 十、Monster of Drakkenheim 规则基准

状态规则整理继续使用：

`docs/reviews/2026-09-18-monsters-of-drakkenheim-new-conditions.md`

其中 `[X]` / `[DC X]` 只表示实例参数。

实现时逐个对照规则效果，不把规则文本中的参数占位符变成多套独立状态。

## 十一、开发顺序

建议严格按以下顺序：

1. 审计并标记旧 Bleeding 专属实现。
2. 固定新的 Condition Definition / Instance schema。
3. 固定 Trigger Engine 与 Custom Conditions 的公开边界。
4. 优化 Trigger Engine，移除具体 Condition 所有权。
5. 创建 Custom Conditions 模块骨架。
6. 注册 19 个 Conditions。
7. 完成 Condition Manager。
8. 实现静态规则状态。
9. 实现新的 Bleeding。
10. 实现 Burning。
11. 实现 Frozen。
12. 完成 Jinxed / Valor 参数化行为。
13. 重接 Generator。
14. 做完整自动测试。
15. 做 Foundry v14 本地 runtime 验收。
16. 更新 handbook 和模块文档。
17. 形成可 review 的候选提交。

## 十二、验收标准

### Trigger Engine

- 不含具体 Condition 规则。
- turn start / turn end / document update 等事件稳定。
- active GM 不重复执行。
- 同 Actor 并发更新顺序稳定。
- 回写不会形成递归循环。
- 一个 Trigger 失败不破坏其他独立 Trigger。

### Custom Conditions

19 个 Condition 全部验证：

- 状态注册。
- 手工施加。
- 参数保存。
- 参数编辑。
- 规则实际生效。
- 手工解除。
- 自动解除。
- 世界 reload 后保持正确。

### 参数化状态

至少验证：

- 同一种 Condition 使用不同参数。
- 多个来源施加。
- 重复施加策略。
- Trigger Engine 自动结算一次且仅一次。
- 参数修改后下一次结算使用新值。

### Generator E2E

至少选：

- Bleeding 样本
- Burning 样本
- Frozen 样本
- Jinxed 或 Valor 样本

验证：

`来源 → JSON → Foundry 导入 → 能力施加 → Condition 实例 → 自动/静态规则 → 解除`

## 十三、本期明确不做

- 不保留旧 Bleeding API 的兼容承诺。
- 不为了旧 Bleeding 数据结构设计迁移层。
- 不实现 Bloodied。
- 不实现 Drakkenheim Madness。
- 不实现 Contamination。
- 不合并 Trigger Engine 与 Custom Conditions 两个发布单元。
- 不依赖 Midi-QOL、DAE、Times Up、Effect Macro 才能运行核心功能。
- 不把 Trigger Engine 扩张成全量 Foundry Hook 平台。
- 不在本阶段 commit、merge、push 或生产部署，除非另有明确授权。

## 十四、完成定义

本计划完成时：

- `fvtt-trigger-engine` 是可独立复用的通用触发 Mod。
- `fvtt-custom-conditions` 是可独立安装的自定义状态 Mod。
- 19 个状态全部可在 FVTT 内直接操作。
- `[X]` / `[DC X]` 使用统一实例参数模型。
- Bleeding 已按新模型重新实现。
- Generator 使用新的 Condition schema。
- 怪物生成和 GM 手工操作走同一条状态链路。
- 日常 GM 使用无需修改代码。
- Foundry v14 runtime 验收通过后，才标记对应功能为 PASS。

## 十五、当前实现记录（2026-09-18）

已完成：

- Trigger Engine 已移除旧 Bleeding runtime、manager、API 和旧模板；保留通用 Actor update、Combat turn start/end、active GM、队列、因果链、宏分发和 Trigger Manager。
- Trigger Engine 已公开 `api.subscribe(listener)` 事件边界，Custom Conditions 不导入 Trigger Engine 私有实现。
- 已新增 `fvtt-custom-conditions` 独立模块、manifest、构建、安装校验、管理器、19 个 Condition Definition 和统一 Condition Instance schema。
- 已实现模板 → Actor 实例的参数复制链路，以及 Bleeding / Burning 的回合事件结算、恢复生命值解除、重复结算 checkpoint 和 Jinxed / Valor 骰式处理。
- Generator 已改写为 `flags.fvtt-custom-conditions.condition` 模板，并保留来源明确的骰式、伤害类型、结算时机、叠加和结束条件。
- `bun install --frozen-lockfile`、全 workspace 类型检查、两个模块构建、模块测试、生成器受影响验收、handbook 和 architecture cycles 已通过；全仓测试最终为 2796 pass / 0 fail。

尚未标记 PASS：

- 当前本地 Foundry Lab 中已经存在旧版 `fvtt-trigger-engine` 目录。安装器按 no-overwrite 保护拒绝覆盖，当前 trigger-engine 构建没有安装到该目录；本次没有把旧安装当作新实现的运行时证据。
- 本次尚未在 Foundry 14.364 / dnd5e 5.3.3 的真实世界中完成管理器 UI、ActiveEffect、Combat 回合、伤害骰和多客户端 active GM 验收。
- Weakened、Helpless、Frozen 的部分系统内部语义依赖 dnd5e 公开 roll/use 边界；当前保留为模块内规则/GM 辅助边界，必须经过真实 Foundry 验收后再扩大自动化承诺。

## 十六、Chrome E2E 暂停检查点（2026-09-20）

> 后续更新：用户授权先修正规则、暂不 E2E，已完成的离线修复和边界见 [2026-09-20 规则修复记录](../reviews/2026-09-20-custom-conditions-rule-fixes.md)。下列 E2E 记录均属于修复前历史版本，不自动作为新候选的 PASS。测试环境明确为 server-mirror / fvtt-v14-module-matrix，不是 server-next。

按用户要求，本轮在 C3 子任务返回后暂停，不再继续派发浏览器批次。当前唯一 Lab 已停止，PID `42500` 不存在，`127.0.0.1:30001` 无监听；active Scene 保持 `8zSGuclJ3zae7Fe5` / `Task8 Bleed Arena`，Trigger Engine enabled、Custom Conditions disabled，已知 `CC-R3*` 测试前缀残留为 0。没有访问生产 `8080/51020`。

本轮已修正并重新构建/安装的运行时代码包括：Trigger Engine 的 `updateCombat` 延迟兜底与原生 `combatTurnChange` 去重；Custom Conditions 的异步 ready 订阅恢复、Frozen 火焰/钝击累计解除、Dazed 移动与 Action 互斥、Shocked 物品 Action、Helpless 命中后重击。两个模块定向测试为 Trigger Engine `27 pass`、Custom Conditions `9 pass`；Foundry 模块与 contracts 类型检查通过。当前安装校验哈希为 Trigger Engine `e522fb6c5e668582e9db02daeb6d3b34a06139b32b9de2b7ff43f7cd58e9108a`、Custom Conditions `b050483972311fca2a53aeb7b5ad0bb2c498c08623361b5795921ace2418e3ba`。

真实 Foundry `14.364` / dnd5e `5.3.3` 已取得以下证据：

- Manager UI 冒烟通过；19/19 状态的 apply、flags/statuses、disable、enable、remove、reapply 与 reload 读回通过；Frozen 与 Shocked composite statuses 通过。
- Bleeding / Burning 的真实 active Scene + active Combat 调度链已证明可运行：Burning 在 `startCombat()` 将 HP `100→98`（`1d4=2`）；两个 Bleeding 实例在 `nextTurn()` 分别产生 `1d4=2`、`1d6=4`；真实治疗 `92→93` 后两个 Bleeding 均解除。但该 fixture 错把 Bleeding 当作可多层分别结算，因此只能证明 Trigger Engine、骰式、HP、ChatMessage 与治疗解除链路，不构成 Bleeding/Burning 最终规则 PASS。
- Addled、Clumsy、Enfeebled、Sickened 的真实 dnd5e roll 公式/选项通过；Jinxed 与 Valor 在 attack/save 公式中分别出现 `-(1d4)` / `+(1d4)`；Defenseless 针对已选目标生成 `2d20adv + 5`。dnd5e 在构造最终公式时会把优势/劣势消费进 `2d20dis` / `2d20adv`，不能仅以最终 `options` 布尔值判断失败。
- Immobilized 实测 walk `30→0`；Slowed 实测 walk `30→15`；Staggered 实测本回合第一次 weapon Activity 允许、第二次阻止、下一回合恢复允许。

因此，19 个状态中当前具备完整或满足本期规则门的真实行为证据共 10 个：Addled、Clumsy、Defenseless、Enfeebled、Immobilized、Jinxed、Sickened、Slowed、Staggered、Valor。

仍未完成完整行为验收的 9 个状态：Bleeding、Burning、Bewildered、Dazed、Distracted、Frozen、Helpless、Shocked、Weakened。C2 对四个行动类状态的 Harness 已真实运行，但 Foundry 返回 embedded Items 时重排集合，旧脚本错误地按数组位置解构，导致 Action/Bonus/Reaction/Cantrip/Weapon fixture 错配；这些观测不能判为模块失败。脚本已改为按 Item 名称映射，SHA-256 为 `8E7378AE30BB28AE189E81558D7C63BEE12F7C9372D14B9C363838209AF862AA`，但 C3 因执行者把窗口耗在只读 CDP 审计上而未运行，故保持 `NOT_EXECUTED`。

### Bleeding / Burning 重复施加语义纠正

用户再次确认的目标语义是：Bleeding 与 Burning 都不是多层叠加状态。同一 Actor 同时只保留一个同名 Condition；再次施加时比较来源特性给出的参数 `X`，保留较高值，较低值不新增实例也不单独结算。这个比较跨 origin 生效，不能只在同一个攻击、Item 或怪物来源内去重。

`X` 来自实际施加状态的怪物特性。Generator 应从特性文本或结构化字段中提取例如 `Bleeding 4d4`、`Burning 2d6 Fire`，写入该 Item 的 `template=true` Condition ActiveEffect；运行时由 `applyFromItem` 将模板参数复制到目标 Actor。状态值不是根据目标 Actor、攻击者 CR 或通用默认值现场推算。

Burning 的 `X` 是“骰式 + 伤害类型”的一组参数，例如 `4d6 Fire` 或 `2d4 Acid`。不同伤害类型仍然是同一个 Burning Condition，不分别占一层，也不同时结算；比较后由较高的 Burning 覆盖较低的 Burning，并同时采用胜出来源的骰式、伤害类型和 origin。例如已有 `2d4 Acid` 后再获得 `4d6 Fire`，最终只保留 `4d6 Fire`。若两个公式强度相同但伤害类型不同，原规则公开文本没有给出明确的自动选择顺序，Mod 实现前需要固定平局规则；在未决定前不能擅自让两种类型并存。

当前候选与上述语义不一致：Bleeding definition/default 仍为 `stack`；Runtime 的重复检查限定 `conditionId + origin`；Burning 的 `replace` 也只替换同 origin 实例。因此不同来源可以产生多个 Bleeding/Burning，A5 的双层 Bleeding 也错误地分别结算。后续恢复开发时应先修正 contract、Generator、Runtime、Manager 默认值和测试，再重新做 Bleeding/Burning E2E。对于任意安全骰式如何机械比较“较高 X”，实现前需固定一个确定性比较规则并写入 contract，不能依赖字符串排序。

### 暂停后的规则代码复核

进一步按原始 Condition 文义复核后，不能把其余缺口都归类为“仅差 E2E”。当前可直接从代码确认还需要整改：Bewildered 的 `preUseActivity` 会阻止所有非 1 Action cantrip Activity，而规则只限制施法、不应阻止普通攻击与其他非施法动作；Staggered 目前按 `item.type === weapon` 计数，会把武器上的 utility 等非 attack Activity 也算成 weapon attack；Immobilized/Frozen 与 Slowed 只修改 `movement.walk`，尚未覆盖 fly/swim/climb/burrow、Immobilized 的速度加值与飞行坠落；Frozen 虽保存 `escapeDC`，尚无花费 Action 进行 Strength (Athletics) 解除的运行时入口。

Dazed、Staggered、Shocked 的回合计数仅由 active GM 收到的 Trigger Engine 事件写入本客户端 `turnStates`；玩家客户端自己发起 Activity、Token movement 或装备更新时可能没有对应状态，属于多客户端执行边界，需要代码层权威协调后再验收。Frozen 的累计伤害更新也限定 active GM 本地 `dnd5e.applyDamage` hook，玩家客户端自行应用伤害时存在同类边界。

因此当前可保持完整真实行为 PASS 的状态收窄为 7 个：Addled、Clumsy、Defenseless、Enfeebled、Jinxed、Sickened、Valor。Immobilized、Slowed 只有 walk 子门 PASS；Staggered 的现有 E2E 使用 weapon utility Activity，只证明当前实现按 Item 类型计数，不能证明“weapon attack”规则正确。Bewildered、Dazed、Distracted、Shocked 的修正 Harness 尚未获得最终有效结果；Frozen、Helpless、Weakened 仍需在相应代码整改或风险确认后做真实运行验收。

其余未完成门：自包含 `Item template=true → applyFromItem → Actor instance` 浏览器链；Frozen 累计伤害与钝击武器 Helpless；Helpless 命中/未命中边界；Weakened 真实 weapon/spell damage；完整 Generator 样本 `来源 → JSON → 导入 → 模板 → 实例 → 解除`；多客户端 active GM。静态、单元测试、生命周期与部分真实玩法证据不能替代这些未执行门。

关键证据目录：

- `F:\FoundryLab\foundry-v14\evidence\custom-conditions-e2e\2026-09-19-all-conditions-round2-luna-max`
- `F:\FoundryLab\foundry-v14\evidence\custom-conditions-e2e\2026-09-19-microbatch-a5-active-combat-luna-max`
- `F:\FoundryLab\foundry-v14\evidence\custom-conditions-e2e\2026-09-19-microbatch-b-roll-modifiers-luna-max`
- `F:\FoundryLab\foundry-v14\evidence\custom-conditions-e2e\2026-09-19-microbatch-c2-action-restrictions-luna-max`
- `F:\FoundryLab\foundry-v14\evidence\custom-conditions-e2e\2026-09-19-microbatch-c3-action-restrictions-luna-max`

## 2026-09-20 用户恢复 E2E：默认环境与本轮边界

用户指定本功能后续 E2E 默认使用 serverMirror：F:\FoundryLab\foundry-v14\data\server-mirror，http://127.0.0.1:30001/。本轮使用 fvtt-v14-module-matrix 世界，禁止替换为 server-next 或另建 Lab。

按 chrome-delegation-dev 派发独立 Chrome 执行任务，测试当前 trigger-engine worktree 的未提交修复版。首批聚焦 Bleeding/Burning 最高值规则、生成模板、真实 Combat 生命周期及治疗解除。其余状态仍需逐项新版本验收，历史 PASS 不自动沿用。

本轮包含停止状态下两模块的精确安装与正式 hash 校验、最长 30 分钟运行窗口（至少 6 分钟留给清理）、恢复原场景和模块开关、停止本轮服务。沿用用户对本任务临时测试对象的清理授权。子任务返回后记录证据、停止并向用户汇报，不自动启动下一批。

## 2026-09-20 R4 E2E 父任务复核与暂停

子任务 01a0bcbc-518d-7590-bd11-8645c0d1ff9a 已回传。测试使用 serverMirror / fvtt-v14-module-matrix / Foundry 14.364 / dnd5e 5.3.3，两个修复版模块正式安装校验通过。

- PASS（本批覆盖）：管理面板应用和编辑；Bleeding/Burning 同来源重复、跨来源弱/强/均值平手；Burning 跨伤害类型取较高值；真实激活 Combat 后两次 nextTurn 的 turnEnd 结算；首次正 HP 变化解除 Bleeding。
- 实测：Bleeding 1d6=6，HP40→34；Burning 1d6=3，HP40→37；治疗34→35后Bleeding由1→0。
- 宏原始断言因 ChatMessage.rolls 为空失败。父任务核对 runtime.ts 使用 ChatMessage.content 写骰式和总点，与报告的聊天文本和HP差一致，接受这两次结算的有限PASS；不据此声称抗性/免疫已验证。
- NOT_EXECUTED：正式生成core.json导入和模板套用；编辑/禁用/重新启用后的最高值一致性；其他状态的新版本E2E。
- 子任务记录本轮前缀对象全部归零、场景恢复；模块开关已保存恢复但重载后未重新登录读回。截图仅在子任务内联，未保存PNG。
- 父任务只读复核30001无监听、PID37596不存在。未重启Lab或浏览器。
- 执行耗时33分16秒，超过30分钟上限3分16秒，明确记为流程失败，不算时间门禁通过。
- report.md顶部旧NOT_EXECUTED/清理Pending已由父任务纠正；results.json保留原宏失败及解释。未修改业务源码。

证据：F:\FoundryLab\foundry-v14\evidence\custom-conditions-e2e\2026-09-20-r4-bleeding-burning-luna-max\results.json 与 report.md。
按用户要求，本批记录后停止，不自动派发下一批。

## 2026-09-20 R5 剩余17状态 E2E：父任务审阅后停止

证据目录：F:\FoundryLab\foundry-v14\evidence\custom-conditions-e2e\2026-09-20-r5-remaining-conditions-luna-max（CC-R5-results.json / CC-R5-report.md）。候选与R4相同，两模块verify-install通过，未改业务源码。

状态级结果：8 PASS（Addled、Clumsy、Enfeebled、Jinxed、Valor、Distracted、Slowed、Staggered）；Sickened存在负向对照异常，记FAIL/待定位，尚不能认定业务bug；其余8种尚未完成，不应以局部通过冒充整状态通过。

- 部分已证实：Weakened武器伤害公式减半、类型与重击配置保留；Bewildered非施法Action允许；Immobilized所有有效速度归零；Shocked卸武器和盾、保留护甲、允许Reaction、装备消耗Action。
- 测试夹具/API阻碍：不存在的game.user.updateTokenTargets挡住Defenseless/Helpless/Frozen；错误Scene.moveTokens movement method挡住Immobilized移动；Fire Bolt/Shillelagh缺预期Activity挡住施法/Dazed；缺focus挡住Shocked相应子项。
- Sickened：CON save劣势通过，但CON check的options=false与2d20dis公式矛盾，缺同Actor无状态基线，必须对照后定位，不能直接改业务规则。
- Addled/Clumsy/Enfeebled应以实际2d20dis公式判劣势，不以缺失options字段误报；Slowed实际五速度均减半/移除后恢复，固定预期因fixture重复+10而错。
- 运行12:54:50至13:30:44，共35分54秒，超30分钟5分54秒；runner在停止新场景截止后才执行，时间门禁失败。
- 子任务未清理。遗留23 Actor、24 embedded Item、19 tracked effect、1 Scene、10 Token、1 Combat/6 Combatant、1 ChatMessage、1 Macro，精确ID在JSON。临时Scene仍active，原Scene未恢复。不得标clean。
- 子任务将computer-use confirmations.md的“Always Confirm at Action-Time (Even If Pre-Approved)”删除规则作为阻碍。父任务核对该文字存在，但当前更高层开发指令明确用户授权优先于skill，并且用户已明确后续清理均确认；这里不应再次向用户索取同一授权。后续恢复须沿用已有授权，遇实际工具审批拒绝则如实报告，不绕过。
- 两模块开关据子任务已恢复；父任务只读复核30001无监听、PID7144不存在。未开服/浏览器，未触碰server-next。

按此前用户要求，回传后记录并停止汇报，不自动另开测试轮。下一轮首先清理并恢复R5遗留，然后修正fixture再覆盖未完成项。此轮并未完成“剩余全部状态”的验收目标。

## 2026-09-20 R6 完整补测回传与父任务源码核对

证据：F:\FoundryLab\foundry-v14\evidence\custom-conditions-e2e\2026-09-20-r6-complete-remaining-luna-max\CC-R6-report.md、CC-R6-results.json、CC-R6-cleanup.json。18 case / 102子断言均执行，原始11 PASS/7 FAIL，子断言92 PASS/10 FAIL，原始JSON不改写。

- 7个失败子断言为options字段误判：Addled3、Clumsy1、Enfeebled1、Defenseless1、Frozen advantage1；实际2d20dis/2d20adv及相应基线支持通过，不能当成7个业务bug。
- 明确业务错误：Sickened普通CON check从1d20变2d20dis。父任务定位runtime.ts:608，其条件(kind === save || kind === check)包含check，与contracts仅CON save的约定冲突。尚未修改源码。
- Frozen API移动：速度0却从x900移至969.72，属于本轮路径失败。Immobilized x/y不变但elevation0→8.136，保留移动行为不完整/待定位。GM、paused、Scene.moveTokens(method api)是测试边界，没有玩家鼠标拖拽证明。runtime.preMoveToken当前仅拦截Dazed，速度状态注册noMovement并不证明所有API路径都被阻止；修复前需区分自愿/强制/GM移动语义。
- 剩余行为覆盖：Helpless、Weakened武器/法术/治疗/tempHP、Bewildered、Dazed、Distracted、Staggered、Shocked及Frozen伤害阈值/破冰取消成功失败均有本轮通过子项。
- core.json原生Import Data导入、公开applyFromItem模板参数、highest编辑及禁用启用、真实回合扣血、Burning火抗火免全部通过。Bleeding4d4 hpLoss turnEnd highest；Burning2d6 fire来源指定turnStart highest。
- R6 exact-ID清理通过，残留为空，世界计数恢复10Actor/53embedded Item/4Actor effect/3Scene/4Token/1Combat/63Chat/6Macro，Task8 Bleed Arena恢复，模块重载后读回Trigger on/CC off。
- 父任务只读复核30001及30009无监听。server-next未触碰。服务窗口约2h0m11，runner约2m30；用户已明确允许本轮超过旧时间限制。
- Full Access未实际配置，本轮依赖逐命令授权；完成测试不代表权限设置问题已解决。

本轮仅核对证据、定位问题并记录，未改业务源码、未启动新E2E。下一阶段应统一修复Sickened、审定并修复移动路径，再定向回归。

## 2026-09-20 R7 并行补测与明确缺陷修复

用户要求继续补齐所有覆盖并同时修复明确bug。父任务已只读核实原Chrome任务01a0bd04-e479-7953-84b9-c9fb6ac44994实际权限现在为approval_mode=never、sandbox_policy.type=disabled，Full Access前提满足，已发送R7补测任务。继续serverMirror，同一已安装R6版本，要求不build/reinstall，防止并行修改污染测试基线。

父任务已修复runtime.ts的Sickened错误分支：只对CON saving throw设置劣势，不再对CON ability check设置。新增回归测试先复现失败（普通CON check收到true），修改后一共26测试/108断言通过。覆盖CON save、CON check、其他save、attack、既有其他原因的劣势不被清除、移除状态后不再施加。现有说明与契约本来就规定只影响CON save，因此无需变更用户规则。

修复暂仅存在worktree源码，未替换Lab运行包；R7继续检验已安装基线，修复版浏览器回归需单独记录。另委派只读覆盖审计，按19个状态的规则子项与实际证据比对，不再以case执行数代替覆盖充分性。

R7独立审计首批确认：Shocked的Dazed/Defenseless composite未测；Addled/Clumsy/Enfeebled缺不应受影响能力负向对照；Weakened仅DamageRoll公式验证，缺武器/法术伤害实际落到目标HP；Frozen/Immobilized缺未暂停玩家拖拽。已将精确补测清单送往当前Chrome任务，避免重复全量跑已证明的项目。模块typecheck已完成通过。Full Access来自任务实际配置核验，不是委派文字声明。

## R7 回传与最终缺口处理

R7报告15case/56断言，13case通过、2未执行；补足Shocked组合、Helpless聊天至critical伤害、同Item Frozen Activity隔离、Weakened真实HP落地、Cure Wounds解除Bleeding、模板持有者负对照、面板自救/助手破冰、高空飞行速度等。剩余：只有GM导致玩家拖拽未测，以及GM moveTokens接受但坐标不变。不能宣称整体验收完成。R7清理恢复通过，父任务复核30001/30009无监听。

用户仍要求全部补齐，故继续原任务R8定向收尾：创建仅本轮使用的临时测试玩家（不改既有账号），完成owner端未暂停拖拽和同步，清理该User；调查移动动画/请求接受与最终文档坐标的区别，保留明确失败，不用无理由NOT_EXECUTED逃避。Sickened修复版已build成功，需停服核对后精确替换CC模块并正式verify-install，再做CON check/save前后对照。Full Access再次核对approval=never、sandbox=disabled。

## R8 回传核对与后续定位

R8使用修复版CC安装树997754ad16c459a6527ea0e8d55ab3d3a59d32e904f2f67d9c3239feba8d4de6。Sickened同Actor前后CON check/save及DEX负向对照已真实PASS，关闭该缺陷的浏览器回归缺口。

新增明确失败：Player关闭未掷骰Attack Roll dialog后actionUsed变true；runtime.postUseActivity无条件记Action，已委派worker核对dnd5e5.3.3生命周期修复并回归。暂未部署修复。

R8移动没有可靠单Token正对照（首次拖拽同时移动6个selected Token，后来单Token拖拽不提交）。因此即便有状态时未移动，也不能以此证明状态拦截通过；移除后恢复、move-first依然未闭环。设备取消没有可取消窗口，应以当前UI不适用说明，不能无期限列NOT_EXECUTED。高度仍缺实际输入覆盖。

父任务只读本机Foundry14.364源码：Token._canDrag要求controlled/select；_initializeDragLeft为所有clones建立context；_getDragPathfindingOptions delay250；_prepareDragLeftDropUpdates在foundPath<=1时不提交；_getDragConstrainOptions允许GM unconstrainedMovement忽略cost/walls。这些是下一轮fixture诊断方向，不是已证实单Token失败原因。不将GM强制API移动自动当普通玩家bug。

R8清理报告恢复所有基线含Users=1，原场景active/paused，模块开关恢复；父任务复核30001/30009无监听。

### R9 最小移动夹具协议（待修复包就绪后执行）

为避免连续多轮测试脚本缺陷，移动场景仅放一个Actor/一个Token，Player仅owner该Actor，无walls/regions/其他tokens。玩家unpaused/select工具，controlled IDs必须仅目标1个；状态为空时先真实拖动两格，路径计算待完成后放开，记录坐标与movementUsed。若基线失败，先诊断交互/图层/level/视野/权限/路径，不施加状态，不把不动算状态阻止。

本机dnd5e5.3.3 TokenLayer的getRelevantOccupyingTokens忽略同组controlled tokens，但其他tokens可阻挡路径；与R8全选6个可移动、单选不动相容，尚是待验证假设。新场景只有一个token可排除此干扰。

同一已验证Token顺序进行Immobilized前/中/后、Frozen前/中/后、Dazed移动后Action/Action后移动及取消攻击不耗Action、Shocked相同组合，真实nextTurn重置；场景不要为每个状态再堆新Token。高度不依赖已被工具拒绝的CDP键盘路由，可用文档支持的公开UI输入，标明自主移动vsGM位置编辑差别。装备UI无取消窗口，记录N/A并验证成功toggle才耗Action与被拒toggle不耗Action。

### R8取消攻击缺陷修复就绪

已核对精确dnd5e5.3.3：postUseActivity发生在后续Attack dialog之前，空roll不会发rollAttack。因此改为攻击类Action在非空rollAttack完成后记账，普通非攻击Action仍postUse成功后记账；武器攻击计数仍限weapon。捕获preRoll独立config的combatKey，经postAttackRollConfiguration转存具体roll数组，防止迟到结果记入新回合，不用共享Activity作为窗口身份。

worker仅修改runtime.ts和conditions.test.ts，27测试/126断言通过，模块typecheck通过。父任务审阅后build通过，新CC ZIP SHA256=23E44358D4B1C1BF7C68163FA56F4C96AC8C76767679BFF858051EDFB454EAD8。R9任务已先行诊断单Token移动，新包交接后只在停服边界更新并回归取消攻击，不混淆测试版本。未修改法术资源消耗/退款规则。

## 2026-09-21 R9复核与自主移动修复

R9提供干净Player基线与移除恢复，确认Immobilized速度0时仍实际拖动是缺陷；取消攻击与Staggered记账已实机PASS。R9后续drag context为空导致Frozen/Dazed/Shocked矩阵未执行，继续保留缺口，不把其计作通过。

已修复preMoveToken：按Foundry14.364 movement.method分类自主移动，dragging/keyboard及非GM hud/config；有效路径上Immobilized（含Frozen composite）直接拒绝，不依赖combat。API/GM位置编辑保留用于调用方强制位移/裁定；不是针对不可信脚本的权限防护，API方法本身无法自动区分自愿/强制移动。Dazed postMove只计自主移动，接收Foundry moveToken第四参数User，避免GM观察Player操作时误判。

新增回归先复现缺陷，修复后29tests/154assertions PASS；模块typecheck PASS；手册人工对照后review/build/check PASS（28项），两README与手册已同步。新ZIP SHA256=22FB086C1C86F3FD16A2A48F9A625AF70FF208AC00E0BCD80518D5B693538674。尚待R10新包玩家回归。

独立只读核对：preMoveToken确切参数document/move/options；moveToken第四参数发起User；movement.method支持api/config/hud/dragging/keyboard/paste/undo，没有forced/teleport枚举。相关发现已整合，未修改Foundry/dnd5e。Full Access再次核实never/disabled，30001/30009无监听。

## R10执行偏离（不是功能结果）

子任务回传R10全部NOT_EXECUTED。父任务read_thread确认同一旧request_user_input_async的R5 cleanup回复再次出现在该任务上下文；执行者转去已完成的R5清理并重新套用30分钟限制，忽略用户已经授权超时完成。R10只setup/cleanup，无任何行为操作，不增加任何状态覆盖。

实际权限仍never/disabled，不是Full Access阻碍。R10已安装当前移动修复包（ZIP22FB086C...538674），安装树应以正式verify记录复核；之后清理恢复并停服。继续任务必须把R5旧回复视为已履行的历史授权，不得取代当前R10目标；用户撤销的旧时间门禁不再适用。

## 2026-09-21 用户限定四状态收尾

用户明确本轮仅处理Immobilized、Dazed、Shocked、Frozen未收尾部分，不重跑其余状态。
已修正Shocked继承Dazed限制时的提示名称（Bonus、移动后Action、Action后移动、直接attack路径）；机制不变。29tests/154assertions、模块typecheck、handbook review/build/check与模块build通过。新ZIP SHA256=55EE2D4A66E3C9B7F814EA416094A8CDCC0B782CC53DCB3E250177F70699D6BD。任务真实权限再次核实never/disabled。
R11仅验证：Immobilized解除恢复；Dazed/Shocked玩家移动与Action双向互斥/回合重置/准确提示；Frozen/Immobilized玩家HUD高度编辑及移除恢复。不把“没移动”当阻止证据，需同客户端同路径前后成功对照；旧R5清理授权已履行，不取代当前目标，旧30分钟限制用户已取消。

## 2026-09-21 崩溃后恢复核查：R11已保存证据

用户报告E2E期间电脑死机，要求检查续作。父任务读取子任务最新turn（interrupted）与F盘R11证据：功能操作和exact-ID cleanup在中断前已完成，最后停在callback确认；不能据此断定电脑崩溃的准确时点/原因。当前30001/30009无监听。原任务FullAccess仍never/disabled。

R11新包ZIP55EE2D4A66E3C9B7F814EA416094A8CDCC0B782CC53DCB3E250177F70699D6BD，正式安装树db78b57213b0b1e7dde1b679c960b2a74a1bedb69c856f8c96b17a00ceaaa1dd。

原始snapshot证据：Player HUD高度0→5、5→10成功并记movementUsed；Immobilized 10→15被阻止，移除后同路径10→15成功；Frozen15→20被阻止，移除后成功；Dazed回合5 Action先阻止HUD移动，回合6重置后20→25成功再Action拒绝；Shocked回合7/8同理25→30与双方互斥，记录准确名称通知。仅此HUD路径可认PASS，不提升为水平拖拽PASS。

水平拖拽/方向键基线始终无坐标变化，观察文件显示controlled=true/isOwner=true但canControl=false，是继续排查UI交互前提的明确线索，尚未确定原因。后续仅补水平路径及归档R11报告，避免重跑已成功HUD逻辑。

cleanup countsMatchExpected=true，所有saved IDs及前缀为空，基线10Actor53Item4Effect3Scene4Token1Combat63Chat6Macro1User；originalSceneRestored/pausedRestored=true。cleanup快照时两个模块均on（恢复模块开关发生在之后，需以最后UI记录确认，不能将该快照说成off）。子任务声称最后恢复完毕但尚缺最终回传，续作要求补读回。

## R11R复核：更正控制诊断与剩余任务

R11R证明_canControl/_canDrag等真实谓词均true；token.canControl实际undefined，此前用undefined===true得到false属于Inspector误判，不能作为Foundry权限拒绝。宏Execute按钮位于form令keyboard.hasFocus=true；关闭宏并点击画布后的hasFocus/selected状态未实际捕获，仅AXWebArea不足以证明移动前提满足。焦点修正后只按一次KeyD，未重试drag，四状态未执行。KeyD确是Foundry14.364 moveRight默认绑定，但是否被用户重绑、实际输入key/code/target/selected尚需捕获。

清理对象计数与scene/pause恢复通过，但模块快照仍CC on/TE on，未完成长期基线CC off。后续必须恢复并重载读回。当前不动业务源码；水平基线须用实际事件时的焦点/selected/keybinding/Hook链路定位，禁止再靠运行Inspector时的状态推断执行输入时的状态。

## 2026-09-21 用户要求server-mirror常驻到关机：已执行

父任务核对进度：R11的HUD四状态逻辑与cleanup已保存；R11F尚未创建任何world fixture/执行条件测试，错误进程10540及receiver44376已由原执行者停止。确切错误目录为项目less任务工作区根，证据由进程命令行+其startup log与Foundry argv resolver相互印证。未读取/删除误目录的Config/许可证等，不将该空Setup作为F盘镜像证据。

父任务使用隐藏独立后台Node启动正确原数据目录，无复制/重建，PID43532。已实时核对listener127.0.0.1:30001、命令行连续--dataPath=F:\FoundryLab\foundry-v14\data\server-mirror、API active=true/world=fvtt-v14-module-matrix/system=dnd5e5.3.3/core14.364。serverNext30002仍active cor-cotn/dnd5e6.0.2/core14.368，未改。

常驻证据与交接：F:\FoundryLab\foundry-v14\evidence\server-mirror-resident-20260921\resident-launch.json、resident-verified.json、HANDOFF.md。标准server.pid已写对应新PID。服务不随本轮结束停止，直到用户关机/明确停止，不设置开机自启。tools/foundry-ops/AGENTS.md已记录用户例外和owner边界；E2E任务只复用该服务，不再启停Foundry。四状态剩余水平路径继续，不重跑已PASS项目。

## 2026-09-21 R11F最终复核：水平核心规则与常驻服务

父任务读取CC-R11F-report/results/events/cleanup。正确实例PID43532/serverMirror30001，14.364/5.3.3/module-matrix。R11F baseline5ft真实drag及preMove/move事件通过；Immobilized有效时不动、移除后同5ft路径恢复；Dazed Action先阻止移动、新回合移动先阻止Action；Shocked同类双向顺序有最终位置/turnState/UI通知证据，长20ft轨迹observer已停止，不能声称捕获精确pointer时长/hook。Frozen本子轮未重跑，保留R10B水平与R11 HUD拦截/解除恢复、破冰等既有证据。

KeyD单次无状态基线仍未动且无移动hook；事件key/code正确、非form焦点、选中/图层正确，暂作为独立输入路径未解决，不能据此认定四状态业务失败或声称keyboard E2E通过。R11F不扩大至其他15状态。无新增已确认四状态业务缺陷。

cleanup countsMatchExpected=true，临时User/Actor等所有saved IDs和prefix归零，Task8Scene active/pause恢复。模块UI保存并reload后读回CC off、TE on、enabled10。父任务复核30009无监听；30001仍PID43532，API active module-matrix14.364/dnd5e5.3.3；30002仍PID36368未动。常驻Foundry没有停服或重启，用户到关机的要求已保持。

报告：F:\FoundryLab\foundry-v14\evidence\custom-conditions-e2e\2026-09-21-r11-four-condition-closeout-luna-max\input-diagnostics\CC-R11F-report.md。
最终口径：四状态核心规则的上述实际路径已有累计证据；不能将单次KeyD输入或所有客户端/所有输入形式概括为全部通过。

## 2026-09-21 整体候选收尾启动

用户同意补生成样本、reload持久化、activeGM切换、键盘输入诊断与文档整理；本轮不提交/合并/部署，不切serverNext。已派生成样本worker和原FullAccess Chrome任务并行。常驻serverMirror43532状态已核实active module-matrix14.364/5.3.3，E2E不得启停。

新增当前验收摘要docs/reviews/2026-09-21-custom-conditions-release-readiness.md与使用说明docs/runbooks/custom-conditions-and-trigger-engine-usage.md，明确现有Manager是JSON配置而非任意新规则无代码编辑器，模板导入不等于所有命中都自动套用，API自动化和已测试入口分开。计划首部链接当前摘要，历史记录保留。

Chrome收尾合同：参数/来源/实例ID/停用状态跨reload一致及结算checkpoint不重放；临时GM切换和Actor更新/Combat事件一次执行；TriggerManager真实配置与Macro context；KeyD真实输入链路；Frozen/Jinxed/Valor正式生成链路待worker提供源与JSON后接入。只清理本轮所有fixture及临时receiver，保留常驻Foundry。

### 整体收尾首批离线交付

正式补充样本已交Chrome：.pui/custom-conditions-closeout/source.md、core.json、report.md；core SHA521BEFC7B45A25B83FB7E9763D26C351DBD12CAF015D943605DF2B6840B3316F。FrozenDC14/Jinxed1d6为必需链，Valor1d4为GM显式选择目标的补充链。新CLI和兼容入口verifier均无warnings/sourceIntegrityErrors，但两入口生成Effect IDs变化、各自内部引用正确，列稳定性风险未闭合；Valor utility target/range null列GM辅助边界，未伪称全自动目标。

修复actor-localizer的Ranged/Melee Spell Attack短语及range词界，4定向tests PASS、packages typecheck PASS、父任务architecture:verify PASS、anti-overfit PASS10sources。未修改已安装Foundry模块JS、不重启常驻服务、不提交合并发布。浏览器收尾已并行执行，待完整回传后更新release-readiness中的待验收门。

### 整体收尾首次回传（尚未结束）

已核对final-acceptance-report/raw-observations。Frozen/Jinxed/Valor源导入至公开模板套用及真实骰式/破冰链路PASS；Trigger Manager UI创建编辑启停/重开读回、真实HP更新匹配1次/无关0次/停用0次、真实Combat start1次PASS。Bleeding live turnEnd两次单次扣2、checkpoint完成，只证明live事件，未做reload/no-advance。

执行者未创建临时GM，未做activeGMhandoff，且错误地将第二GM缺失视为单客户端reload门无法执行的原因；父任务已要求继续独立reload验证。KeyD原生短按仅2ms，>100ms hold未执行，CDP被拒为工具限制不绕过。

CC-FINAL清理尚未执行，剩3Actor/1Scene/3Macro/14Chat/2disabled Trigger。场景/pause恢复、模块CC off/TE on读回，Foundry43532仍常驻、30002未改。执行者称browser-policy要求直达用户action-time确认，但尚无精确条款/实际reject证据；父任务要求提供依据，不撤销已存在的用户永久临时对象清理授权，不绕过真正高优先级限制。

### 收尾重载门已通过；清理确认来源澄清

单GM的reload/no-advance已补：HP21/Chat78/同Bleeding effect与instanceID/params/origin/turnState/checkpoints保持，0次结算；下一真实NextTurnroll3仅一次，HP18/Chat79，新round2key完成。恢复Task8Scene/pause/CCoff/TEon，常驻43532保留，30002未改。

执行者明确阻碍来自其developer-provided mcp__cua_repl Computer/Browser Use Confirmation Policy → Confirmation Required at Action time：Permanently delete data: Confirm before any deletion the user cannot reverse through the product’s normal recovery flow, including emptying Trash or purging an account。没有实际删除尝试/删除reject，不称自动审批拒绝；唯一实际工具拒绝是rawCDP Input.dispatchKeyEvent不支持，不能绕过。activeGM临时账号测试未执行、清理留存，需精确一次动作确认，不扩大到既有账号/真实world/服务。

### 整体收尾activeGM与清理门通过

已核对最终报告与cleanup-report：2临时GM在线时A只处理HP18→19一次和combatTurnStart一次；A正常退出后B只处理HP19→20一次。精确清理3Actor/关联Item与effect、Scene/2Token、3Macro、19Chat、2Trigger及2GM完成，原GM权限/密码不改。最终基线10Actor/13worldItem/53embeddedItem/3Scene/6Macro/1Combat/63Chat/1User，原Task8/pause/CCoff/TEon恢复，30001常驻43532保留。activeGM和清理等待记录现在均为历史，不再当前阻碍。

只剩KeyD长按工具能力边界、Valor目标范围需GM辅助、发布授权之外的交付步骤，以及父任务正在修复的Effect ID稳定性。模块READMEs与手册已去掉旧“尚未安装/移动修复待测”结论，链接当前使用说明。模块源码不再变更，最终打包会核对JS与已验收安装bundle相同，文档变更不冒充新的E2E。

## 2026-09-21 本地候选收尾记录

Effect稳定ID修复完成：实际Enhanced生成路径用既有createStableDocumentId；ItemGenerator加入action.logicalPath避免同Item不同group/index同名同desc碰撞。新完整Actor/Item定向回归3tests49assert、packages typecheck、anti-overfit11sources通过；父任务generator相关278tests1239assert通过，architecture最终复跑通过；独立review已关闭原P2，无新增重大问题。正式CLI三入口/重复的Activity/Effect IDs/params/refs一致，只有_stats时间戳允许变化。新样本.pui/custom-conditions-id-stability/core.json SHA AB4B56A35CE43C8ED9215C818F98825ED38AD183A47DC54C5474B612C5655D70；旧已做browser的样本SHA521...3316F保留不变，新ID工件不宣称又导入过Foundry。

两模块重打包成功，JS SHA与已验收安装逐字节相同，仅README更新；ZIP TE=0C3FCC1076D5058D8201002104EAACDA4FF76F5666D9E65C83592097EC3D881C，CC=B4EA0E0287A3B44450153217AB1275EFB0D0746F1754261C526A2B61FB0A67DB。常驻服务未重装/重启，最终复核PID43532仍active module-matrix14.364/dnd5e5.3.3，30002PID36368未改。

使用说明、README、手册已人工核对并review/build/check通过28项。当前摘要docs/reviews/2026-09-21-custom-conditions-release-readiness.md为单一当前状态入口；原计划保留历史轨迹。没有commit/merge/push/生产部署，未碰无关injury dirty内容。未重新运行无关全仓测试，不假称当前树全仓全绿。

本地候选可进入review/合并准备；保留已明确限制：KeyD真实长按工具未覆盖，Valor utility target/range需GM辅助，任意新状态规则不是无代码生成，serverNext6.0.2兼容性未测。浏览器核心收尾/reload/activeGM及exact-ID清理已过，不再留临时GM或CC-FINAL对象。

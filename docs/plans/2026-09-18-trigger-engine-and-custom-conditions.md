# Trigger Engine 优化与 Custom Conditions Mod 实施计划

- 日期：2026-09-18
- 状态：计划已创建，尚未开始本计划的新实现阶段
- 工作树：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20260916-154837-trigger-engine`
- 目标运行环境：Foundry `14.364` / dnd5e `5.3.3`
- 相关规则整理：`docs/reviews/2026-09-18-monsters-of-drakkenheim-new-conditions.md`

## 一、目标

建立两个职责独立、可以长期复用的 Foundry Mod：

1. `fvtt-trigger-engine`：继续作为通用事件触发器，负责“什么时候发生了什么，以及应该调用哪个动作”。
2. `fvtt-custom-conditions`：新建自定义状态模块，负责“这个状态是什么、有哪些参数、如何手动管理、规则如何生效”。

最终使用目标：安装两个 Mod 后，GM 可以直接在 Foundry 内创建、施加、修改、解除自定义状态和配置触发关系；普通使用不需要重新开发模块。生成器导入的怪物与 GM 手工施加的状态使用同一套状态数据和规则。

## 二、已经确定的产品边界

### Trigger Engine

Trigger Engine 保持通用，不拥有具体 Condition 的规则。

它负责：

- Actor 文档变化触发。
- 回合开始、回合结束等战斗时机触发。
- 后续按实际需求扩展 ActiveEffect 创建/删除等通用事件。
- 根据 Trigger Manager 中的条件筛选目标事件。
- 调用 Macro 或其他模块公开动作。
- 保持 active GM 单执行者、事件排队、因果链和防递归能力。

它可以服务 Conditions，也继续服务伤势系统、Boss 阶段、资源变化、剧情机制及其他自定义 Macro。

### Custom Conditions

Custom Conditions 拥有状态定义与状态规则。

它负责：

- 注册自定义状态、名称、图标和说明。
- 在 FVTT 内手动施加、编辑和解除状态。
- 保存参数化状态的实例数据。
- 执行具体状态规则。
- 提供公开 API/动作给 Trigger Engine 调用。
- 提供状态管理 UI 和必要的参数输入 UI。
- 读取生成器写入 Actor/Item/Effect 的同一份状态契约。

两个 Mod 之间不得互相导入私有实现，只通过最小公开接口协作。

## 三、本期 Conditions 范围

本期实现以下 19 个自定义状态：

| 类型 | Conditions |
| --- | --- |
| 属性/检定限制 | Addled、Clumsy、Enfeebled、Sickened |
| 行动与防御限制 | Bewildered、Dazed、Defenseless、Distracted、Helpless、Immobilized、Slowed、Staggered、Weakened |
| 复合状态 | Shocked |
| 参数化持续效果 | Bleeding `[X]`、Burning `[X]`、Frozen `[DC X]`、Jinxed `[X]`、Valor `[X]` |

明确排除：

- `Bloodied`：使用 dnd5e/FVTT 已有能力。
- `Drakkenheim Madness`：本期不做。
- `Contamination`：本期不做。

## 四、参数化 Condition 的统一模型

所有参数化状态使用“固定 Condition 定义 + 每次施加时保存实例参数”的模型，不为每个骰式或 DC 注册一个新状态。

需要支持的核心参数：

| Condition | 实例参数 |
| --- | --- |
| Bleeding | 骰式、结算模式、伤害类型（如有）、叠加规则、治疗解除、结束条件 |
| Burning | 骰式、伤害类型、结束条件 |
| Frozen | 解除 DC、累计解除伤害规则所需状态 |
| Jinxed | 惩罚骰式 |
| Valor | 加值骰式 |

GM 手工施加与生成器生成必须产生等价的实例数据。

## 五、Trigger Engine 优化计划

### Phase T1：收束通用职责

- 保留现有 Trigger Manager、Actor documentUpdate、active GM 执行、队列与因果链机制。
- 将现有 Bleeding 专属运行时能力视为过渡实现。
- 定义稳定的通用触发事件边界，先覆盖本期 Conditions 真正需要的事件。
- 明确 Trigger Engine 只负责调度，不解释 Bleeding、Burning、Frozen 等规则。

完成标准：Trigger Engine 在不依赖 Custom Conditions 私有实现的情况下，可以产生稳定事件并调用公开动作。

### Phase T2：补齐战斗时机

本期至少验证：

- combat turn start
- combat turn end
- Actor document update

只有在具体 Condition 确实需要时，再加入 ActiveEffect create/delete 等事件，避免一次扩张成完整事件总线。

完成标准：Bleeding/Burning 等回合结算规则可以通过通用事件驱动，不需要 Trigger Engine 内置状态名称。

### Phase T3：迁出 Bleeding 所有权

- 将 Bleeding 的状态定义、参数管理、结算规则和管理 UI 迁入 Custom Conditions。
- Trigger Engine 仅保留通用触发能力。
- 现有生成器 Bleeding 数据契约调整为 Custom Conditions 所拥有的公开契约。
- 清理重复结算路径，确保同一层 Bleeding 在一个时机只结算一次。

完成标准：关闭 Custom Conditions 后 Trigger Engine 仍可正常运行通用触发器；关闭 Trigger Engine 时 Custom Conditions 的静态/手动状态管理仍可使用，需要自动时机的功能明确显示不可用原因。

## 六、Custom Conditions 实施计划

### Phase C1：模块骨架与状态目录

建立独立发布单元 `foundry-modules/fvtt-custom-conditions/`：

- 独立 manifest、版本、README、构建、测试和安装产物。
- 中文/英文名称与说明。
- 19 个状态的稳定 ID。
- 状态图标与 Token 状态菜单注册。
- 不复制 Trigger Engine 私有实现。

完成标准：启用 Mod 后，19 个状态可在目标 Foundry 环境中被识别、显示、添加和移除。

### Phase C2：状态管理 UI

提供 GM 可直接使用的 Conditions 管理入口：

- 当前 Token/Actor 已有自定义状态列表。
- 添加状态。
- 编辑参数。
- 暂停/恢复需要自动结算的状态。
- 解除单个状态。
- 查看状态来源与规则摘要。

参数化状态在施加时直接输入参数，例如 Bleeding `2d6`、Burning `2d6 Fire`、Frozen `DC 15`、Jinxed `1d6`、Valor `1d4`。

完成标准：GM 不需要打开开发者工具或编辑 JSON，即可完整管理参数化状态。

### Phase C3：先实现无定时结算状态

优先实现可以直接验证规则效果的状态：

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

每个状态优先使用 dnd5e/Foundry 正式支持的 ActiveEffect 或系统能力；只有无法表达的规则才由模块自己的规则层处理。

完成标准：状态从手工施加到实际骰子、行动或伤害行为的结果与规则定义一致。

### Phase C4：实现定时/参数化状态

按顺序完成：

1. Bleeding
2. Burning
3. Frozen

Bleeding 作为首个完整模板，验证“参数输入 → 状态实例 → Trigger Engine 时机 → Condition 规则 → 解除”的整条链路。

Burning 复用同一参数化和回合结算框架，同时加入伤害类型。

Frozen 负责 DC 参数、复合状态效果和指定解除逻辑。

完成标准：三者都可由 GM 手工施加并自动结算，参数可编辑，解除条件可验证。

## 七、Generator 集成计划

生成器继续作为制作工具，不成为第三个 Foundry Mod。

正式链路：

`来源文本 → Generator → Actor/Item/Effect 参数模板 → Foundry 导入 → Custom Conditions → Trigger Engine 时机`

需要保证：

- 来源明确写出参数时，生成器写入对应 Condition 参数。
- 来源没有给出参数或规则不明确时，不猜测，由 GM 在 FVTT 内补充。
- 怪物导入不会因为携带“可施加 Bleeding 的攻击”而让怪物自己获得 Bleeding。
- 生成器产生的数据与 GM 手工创建的数据使用同一 schema。
- 本地现有“回合开始 Bleeding”文本与 Monsters of Drakkenheim“回合结束 Bleeding”规则分开处理，不能静默改义。

## 八、GM 最终工作流

### 手工操作

1. 选中 Token 或指定 Actor。
2. 打开 Custom Conditions。
3. 选择 Condition。
4. 参数化 Condition 填写骰式、伤害类型或 DC。
5. 应用。
6. 需要自动时机时，由 Trigger Engine 自动调用对应规则。
7. GM 可随时编辑、暂停或解除。

### 怪物生成

1. Markdown/YAML 中写明怪物能力。
2. Generator 识别对应 Condition 和参数。
3. 导入 Actor JSON。
4. 怪物能力携带可施加的 Condition 模板。
5. GM 在实战中触发该能力后，将模板应用到目标。
6. 后续结算与手工状态完全相同。

## 九、验收顺序

### A. 模块机械检查

每个 Mod 分别完成：

- 单元测试。
- TypeScript 类型检查。
- manifest/package/build 版本一致。
- 浏览器运行时无 Node/Bun/generator 私有依赖。
- 确定性 ZIP 构建。

共同检查至少包括：

- `bun run typecheck:foundry-modules`
- 对应模块自己的 test/build 入口。
- 受影响时再运行 handbook、architecture 和项目 CI 检查。

### B. 状态语义检查

19 个 Condition 逐个核对：

- 手工添加。
- 图标和名称。
- 参数保存。
- 规则效果。
- 编辑。
- 解除。
- 重载世界后状态保持。

参数化状态额外验证多实例、不同参数及重复施加策略。

### C. Trigger 集成检查

至少验证：

- 回合开始/结束只触发一次。
- active GM 切换不会双重执行。
- 回退回合、跳回合、刷新页面不造成重复结算。
- Condition 动作回写 Actor 不形成触发循环。
- 一个 Condition 失败不阻断其他独立 Trigger。

### D. Generator 到 Foundry 端到端

选至少一个带 Bleeding 的现有怪物作为第一条端到端样本，再为 Burning、Frozen、Jinxed/Valor 各选一个最小样本。

验收必须覆盖：

- 来源文本。
- 生成 JSON。
- 导入 Foundry。
- 施加状态。
- 自动/静态规则实际生效。
- 解除。

## 十、实施顺序

推荐顺序：

1. 固定两个 Mod 的公开职责和 Condition schema。
2. 新建 Custom Conditions 模块骨架。
3. 完成状态目录与手动管理 UI。
4. 先实现无定时结算的状态。
5. 以 Bleeding 为参数化/触发式状态模板，并从 Trigger Engine 迁出 Bleeding 所有权。
6. 补齐 Trigger Engine 的 turn end 等必要事件。
7. 实现 Burning、Frozen。
8. 完成剩余 Jinxed/Valor 参数化细节。
9. 接通 Generator。
10. 做本地 Foundry v14 真实语义验收。
11. 同步 handbook 和模块说明。

## 十一、本期不做

- 不实现 Bloodied。
- 不实现 Drakkenheim Madness。
- 不实现 Contamination。
- 不把 Trigger Engine 与 Custom Conditions 合并。
- 不要求 Midi-QOL、DAE、Times Up、Effect Macro 作为核心依赖。
- 不一次性扩展 Trigger Engine 为所有 Foundry Hook 的完整事件总线。
- 不自动推断来源没有写明的骰式、DC、伤害类型、叠加或解除规则。
- 不在本计划授权下 commit、merge、push 或部署到生产 Foundry。

## 十二、完成定义

本计划完成时，应满足以下用户体验：

- 两个 Mod 可以独立构建和安装。
- Trigger Engine 可以继续被其他模块和 Macro 使用。
- Custom Conditions 提供 19 个状态并在 FVTT 内可直接管理。
- `[X]` / `[DC X]` 状态支持每个实例自己的参数。
- Bleeding/Burning 等自动结算通过 Trigger Engine 通用事件运行。
- Generator 生成的状态模板与手工创建状态完全兼容。
- GM 日常使用不需要修改代码或重新开发模块。
- 本地 Foundry 真实运行验收通过后，才把对应能力标记为 runtime PASS。

# Custom Conditions 全 19 项 HUD / 状态 ID 审计

日期：2026-09-24。目标是 server-mirror 的 CoTN `cor-cotn`、Foundry 14.364 / dnd5e 5.3.3，并保留该世界原有启用模组组合。本页记录用户发现「自定义流血」没有独立 HUD 入口后的系统性审计、候选修复和 CoTN 页面复验。页面复验覆盖 19 项的**入口可见性**；不等于逐项施加、结算及跨客户端玩法验收。

## 已确认的同名 ID 与问题范围

安装在 server-mirror 的 dnd5e 5.3.3 源码 `Data/systems/dnd5e/dnd5e.mjs` 的 `DND5E.conditionTypes` 同时定义裸 ID `bleeding` 与 `burning`（约 47158、47169 行）。CoTN 已启用的 `mcdm-flee-mortals-where-evil-lives` 的 `Data/modules/.../index.js` 定义裸 `dazed`（约 1972 行）；先前 CoTN 浏览器曾同时看到该裸项和本模块独立的自定义 Dazed，见[图标及状态现场记录](2026-09-23-existing-condition-icons.md)。裸 ID 被其他来源先注册后，本模块不能用同一个 ID 覆写其规则和入口。此前[灼烧入口修复](2026-09-24-custom-burning-hud.md)仅解决 Burning，不能代表 Bleeding 或其余状态已检查。

用户现场看到的 dnd5e 原生 `bleeding` 中文按钮叫「失血」，希望本模块自定义 Bleeding 继续叫「流血」；两者的**中文名称不同、状态 ID 不同、作用规则不同**。不要把「失血」按钮或原生「燃烧」按钮当成已配置本模块骰式参数的入口，也不要为区分它们重命名底层语义 ID。

下表的「修复前」指本次全量修复启动前的候选实现：Dazed 与 Burning 已有独立投影，Shocked 虽被特设点击桥接接管但仍需纳入统一投影，其余 16 项未完成通用 HUD 接管。已确认同 ID 来源的是 Bleeding、Burning、Dazed **3 项**；其余 **16 项**未发现当前同 ID 来源。「未发现同 ID」只表示上述精确安装版本与已知启用组合的审计没有证据，**不保证未来安装或启用的模块不会再定义同名 ID**。不把图标复用、显示名相同或未看见按钮单独当成 ID 冲突证据。

| # | 本模块语义 ID | 中文名 | 修复前状态 ID | 修复前已知裸 ID 冲突 | 修复前 HUD 点击路径 | 目标独立状态 ID |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `addled` | 心智混乱 | `addled` | 未发现 | 系统默认切换，未统一接管 | `fvtt-custom-conditions.addled` |
| 2 | `bewildered` | 迷乱 | `bewildered` | 未发现 | 系统默认切换，未统一接管 | `fvtt-custom-conditions.bewildered` |
| 3 | `bleeding` | 流血 | `bleeding` | dnd5e 原生 `bleeding`，界面「失血」 | 本模块入口被占用；系统默认切换不能填写实例骰式 | `fvtt-custom-conditions.bleeding` |
| 4 | `burning` | 灼烧 | `fvtt-custom-conditions.burning` | dnd5e 原生 `burning`，界面「燃烧」 | 已有独立入口，点击打开绑定 Actor 的参数管理器 | `fvtt-custom-conditions.burning` |
| 5 | `clumsy` | 笨拙 | `clumsy` | 未发现 | 系统默认切换，未统一接管 | `fvtt-custom-conditions.clumsy` |
| 6 | `dazed` | 恍惚 | `fvtt-custom-conditions.dazed` | MCDM 裸 `dazed` | 已有独立入口，经本模块 API 切换 | `fvtt-custom-conditions.dazed` |
| 7 | `defenseless` | 无防备 | `defenseless` | 未发现 | 系统默认切换，未统一接管 | `fvtt-custom-conditions.defenseless` |
| 8 | `distracted` | 分心 | `distracted` | 未发现 | 系统默认切换，未统一接管 | `fvtt-custom-conditions.distracted` |
| 9 | `enfeebled` | 衰弱 | `enfeebled` | 未发现 | 系统默认切换，未统一接管 | `fvtt-custom-conditions.enfeebled` |
| 10 | `frozen` | 冻结 | `frozen` | 未发现 | 系统默认切换，无法填写解除 DC | `fvtt-custom-conditions.frozen` |
| 11 | `helpless` | 无助 | `helpless` | 未发现 | 系统默认切换，未统一接管 | `fvtt-custom-conditions.helpless` |
| 12 | `immobilized` | 定身 | `immobilized` | 未发现 | 系统默认切换，未统一接管 | `fvtt-custom-conditions.immobilized` |
| 13 | `jinxed` | 厄运 | `jinxed` | 未发现 | 系统默认切换，无法填写骰式 | `fvtt-custom-conditions.jinxed` |
| 14 | `shocked` | 震愕 | `shocked` | 未发现 | 特设桥接经本模块 API 切换，需统一接管 | `fvtt-custom-conditions.shocked` |
| 15 | `sickened` | 病弱 | `sickened` | 未发现 | 系统默认切换，未统一接管 | `fvtt-custom-conditions.sickened` |
| 16 | `slowed` | 减速 | `slowed` | 未发现 | 系统默认切换，未统一接管 | `fvtt-custom-conditions.slowed` |
| 17 | `staggered` | 踉跄 | `staggered` | 未发现 | 系统默认切换，未统一接管 | `fvtt-custom-conditions.staggered` |
| 18 | `valor` | 英勇 | `valor` | 未发现 | 系统默认切换，无法填写骰式 | `fvtt-custom-conditions.valor` |
| 19 | `weakened` | 虚弱 | `weakened` | 未发现 | 系统默认切换，未统一接管 | `fvtt-custom-conditions.weakened` |

五个需要参数的状态是 Bleeding、Burning、Frozen、Jinxed、Valor。HUD 直接使用 `actor.toggleStatusEffect()` 会生成没有 `flags.fvtt-custom-conditions.condition` 的普通 ActiveEffect，不能替代本模块的实例校验、来源参数、最高值结算或解除逻辑。其余 14 项虽无必填参数，也必须由本模块 API 施加或切换，使规则 Hook、复合状态和图标高亮都读取同一种实例；旧版 Shocked 曾因走普通 HUD 路径而只有自身高亮、缺少 Dazed/Defenseless 投影，见[现场与补救记录](2026-09-23-existing-condition-icons.md)。本段是代码路径审计，不能代替对每一项的 CoTN 点击结果。

## 全量修复的行为边界

1. 所有 19 个语义 ID 都投影为 `fvtt-custom-conditions.<id>`；原生 dnd5e 的「失血」/「燃烧」与 MCDM Dazed 保留原有 ID、名称、图标与行为。本模块自有项须可按当前 Foundry 语言显示名称与规则卡。
2. 本模块的 19 项在 Foundry 原生 Token 状态 HUD 中隐藏普通点击入口，避免其默认切换绕过 API；Token Action HUD 从注册状态读到这些项，但点击由本模块的 roll-handler extender 接管。五个参数项打开已绑定当前**单个** Actor、已预选该状态的管理器，不直接施加空参数实例；其余 14 项按本模块 API 的实例/启停规则切换。目标或 GM 权限不明确时应提示并拒绝，不退回默认切换。
3. 保留旧 Actor/Item ActiveEffect 的 `flags.fvtt-custom-conditions.condition`、`conditionId`、实例参数与来源，不按显示名猜测归属，也不迁移、删除用户既有实例。更新旧实例时投影新的命名空间状态；复合 Frozen/Shocked 的子状态仍应与本模块一致，高亮、停用和再启用须对应实际实例。dnd5e 的 `noMovement` / `halfMovement` 映射也应同步使用新状态 ID。
4. 既有 Token Action HUD 用户布局可能保存旧 action ID。新 ID 应在默认布局中可见；自定义保存布局是否能迁移，必须按其实际存储与页面行为核对，不能仅凭默认 HUD 截图推断。不能擅自清空或重写玩家的 HUD 偏好。

生成链路也属于同一次 ID 审计。除 `packages/generation/src/actor-effects.ts` 的投影路径外，`packages/generation/src/actor.ts` 原有两处直接写 `statuses: ['bleeding']`，会绕开通用投影；本轮候选实现已将其改为 `projectedConditionStatusId('bleeding')` 并补回归。只把这个结果称为候选源码与测试结果，导入到 CoTN 后的实际 Actor/Item 行为须另列验收。

## 验收分层与后续核查

- **已发生的历史页面证据**：CoTN 的原生 Burning 与自定义「灼烧」并列、点击灼烧打开绑定 Actor 的空参数管理器；自定义 Dazed 与 MCDM Dazed 并列；Shocked 复合高亮经前次专项复查。各结论限于当时的模块字节、Token 与页面，见所链记录。
- **PASS — 全 19 项入口可见性**：2026-09-24 在常驻 server-mirror 的真实 CoTN 页面正常重载，Token Action HUD「效应」组中 19 个自定义中文按钮各出现一次，均有图标；未发现缺失或重复。原生「失血」与自定义「流血」、原生「燃烧」与自定义「灼烧」、MCDM「Dazed」与自定义「恍惚」同屏并列。页面显示已启用 77 个模组，复验前后没有修改模组配置或 HUD 保存布局。截图见 [全 19 项 HUD 画面](F:/FoundryLab/foundry-v14/evidence/condition-optimizations-20260924/chrome-all-19/all-19-hud-line-261-0.jpg)，原始 AX 摘录、运行时和边界见 [Chrome 现场记录](F:/FoundryLab/foundry-v14/evidence/condition-optimizations-20260924/chrome-all-19/ax-evidence.md)。浏览器 AX 未暴露 TAH actionId；19 个命名空间 ID 是安装源码的静态核对结果，不冒充 DOM 读取。
- **PASS — 自定义流血入口打开管理器**：只点击自定义「流血」一次，管理器绑定所选 Token 的 Actor「泽菲尔·艾什伍德」，预选「流血」，公式仍为空。没有点击施加，也没有新增或修改状态；原生「失血」未点击。候选实现的 Custom Conditions **80/80** 单测、模块类型检查与安装树核对通过；这些是代码和安装层证据，不代替页面行为。
- **NOT_EXECUTED — 其余点击和玩法结算**：本轮没有逐项切换其余 18 个按钮、提交流血参数、重验冻结五段悬停说明、检查浏览器控制台或多客户端/持久化结果；本轮使用的 Chrome UI 接口未提供悬停操作。旧布局的自动迁移也未验证。若以后修改上述逻辑，再按具体风险补定向验收，不无理由重跑独立测试世界的全套 E2E。

## 可追溯来源

- 19 项语义目录与实例 flag：`packages/contracts/src/conditions.ts`；注册与速度映射：`foundry-modules/fvtt-custom-conditions/src/runtime.ts`；点击桥接和 tooltip：`foundry-modules/fvtt-custom-conditions/src/hud.ts`；生成模板：`packages/generation/src/actor-effects.ts`、`packages/generation/src/actor.ts`。
- 锁定的本地 dnd5e 5.3.3：`F:/FoundryLab/foundry-v14/data/server-mirror/Data/systems/dnd5e/dnd5e.mjs` 的 `DND5E.conditionTypes.bleeding` / `.burning`；锁定的本地 MCDM 模组：`F:/FoundryLab/foundry-v14/data/server-mirror/Data/modules/mcdm-flee-mortals-where-evil-lives/index.js` 的 `dazed` 注册。二者只读核对，没有修改 Lab 文件。
- 同名状态的先前 CoTN 页面证据：[图标与 Dazed/Shocked 记录](2026-09-23-existing-condition-icons.md)、[原生 Burning 记录](2026-09-23-cotn-burning-hud.md)、[自定义灼烧入口记录](2026-09-24-custom-burning-hud.md)。这些是历史节点，不自动覆盖本轮全量修复。
- 本轮安装核对：`F:/FoundryLab/foundry-v14/evidence/condition-optimizations-20260924/20260924-095456/verified.json`；外部 Chrome 原始截图提取来源及 SHA-256：`F:/FoundryLab/foundry-v14/evidence/condition-optimizations-20260924/chrome-all-19/screenshot-provenance.json`。截图为子任务 CUA 原样返回字节，未重绘。

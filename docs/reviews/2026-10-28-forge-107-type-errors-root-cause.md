# Forge 107 条既有类型错误：根因、实际影响与修复方案

日期：2026-10-28。状态：只读审查完成，未实施修复。

用户原话：

> 先看这107条既有类型错误，按根因分类，说明哪些会影响实际生成或本轮修复，列出确认的问题和修复方案。先不扩大修改范围，不新增模型调用，也不提交、合并或推送。

工作树：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`；HEAD `5dc5702767bbcb0818a05a02e45c925289e66758`。本次只新增本报告与私有审查记录，产品、测试、配置、冻结材料、手册及上一轮修复均未修改。

## 判断

107条来自31个文件：85条在测试、21条在诊断脚本、1条在测试helper；没有直接报在生产实现文件。它们是9类根因的重复表现，不是107个独立生成故障。

**确认影响全仓验收：** `package.json:120` 的 `ci:verify:steps` 按顺序执行 `typecheck:all`，失败会使同一命令链后续检查不能继续；GitHub CI在 `.github/workflows/ci.yml:71` 调用此入口。全仓类型和CI不能记为通过。Bun已执行的局部测试、已有生成产物和Mirror证据不会因此被撤回。

**未从这107条确认新的生产生成缺陷，未发现足以推翻上一轮F01–F10／D01–D02专门验证的证据。** 这不等于证明所有代码无错：本次追踪的是这107条及直接调用路径，没有重新审计所有生成机制，也没有新增模型或世界测试。

需要优先处理的实际测试问题是：两个当前测试仍锁旧提示词版本；三个测试传入当前API不读取的图标参数；一处伤害反例同时缺必填字段。另有五处proof断言未适配对象形状、一个枚举测试混淆内部保留类型与模型输出类型。它们应修测试／辅助代码；现有证据不支持为此扩大产品修改。

## 9 类根因

| 类别 | 数量 | 根因 | 实际影响 | 最小拟议改法 |
|---|---:|---|---|---|
| R01 | 22 | 测试／诊断provider配置缺 `authMode` 或 `reviewModel` | 编译阻塞；已查生产入口提供完整配置。注入假HTTP的Monster调用有reviewModel回退，不因这些缺项直接失去Actor | 补测试的显式api-key与fixture review model，保持假HTTP和调用计数；不放宽生产类型 |
| R02 | 6 | 禁止网络的fetch替身缺Bun `preconnect` | 类型不完整；普通fetch仍抛错，已查路径未用preconnect | 用完整stub，并令preconnect同样抛错；不转交真实网络，不用unknown强转消错 |
| R03 | 3 | 两处当前测试的旧版本断言、一处历史live脚本的v39锁 | 前两处执行到版本断言必然失败；历史脚本在网络前拒跑 | 核对当前内容后更新两测试的显式版本；保留历史脚本的版本保护，以类型兼容方式表达，不直接升v52 |
| R04 | 8 | 测试对领域契约的假设落后 | 包括内部枚举、proof联合类型、finding投影及不完整伤害反例；不能全部用强转处理 | 按真实层级整理fixture和断言，保留来源约束与反例的单一差异 |
| R05 | 9 | 品牌类型／unknown边界未在测试收窄 | 完整字符串比较仍有效；未发现sourceId或hash真的错误。unknown断言缺静态结构证明 | 用公共sourceId工厂；hash保持完整值比较；在测试入口证明Actor结构／准确声明期望类型 |
| R06 | 26 | 数组、固定键记录、可选字段的存在性未表达 | 多数对象在fixture中明确存在；类型只承诺可能缺省。不能由此推断实际丢能力 | 明确取值和存在性断言，固定记录准确声明；真正可选字段按公开语义处理 |
| R07 | 10 | 元组／只读数组／JSON字面量的推断不准确 | 具体测试行完整，但推断为普通数组、readonly或宽number/string | 固定表使用tuple／as const，复制readonly数组，fixture使用准确schema／条件类型 |
| R08 | 20 | helper的any传播、压缩声明丢失上下文类型 | 回调无类型，部分TS7022；未确认运行时自引用或业务失败 | 在helper边界补provider、翻译服务和返回值类型，拆开局部声明；不逐个加any |
| R09 | 3 | `iconMode`传到了不接收它的API层 | 该参数运行时被忽略，不能证明测试显式关闭了图标；现默认禁用端口没有造成已确认图标变化 | workflow用`iconOptions:{mode:'off'}`；直接ActorGenerator保留正确iconResolver边界或移除无效参数 |

总数22+6+3+8+9+26+10+20+3=107。附录给出每条唯一归类，没有排除或重复计数。

## 确认问题与具体处理

### 1. 旧版本断言造成真实测试失败；历史锁须单独保留

- **T003**：`src/core/intake/__tests__/provider.test.ts:187` 期望v49，当前 `packages/intake-ai/src/provider.ts:41` 为v52。该断言位于一组prompt内容检查之前，运行至此会阻止本用例后续断言继续。
- **T035**：`tests/forge-ai-owned-boundary.test.ts:34` 期望v50。它在该用例最后，之前的模型内容所有权断言仍会执行；不能夸大成所有内容检查都没跑。
- **T025**：`tests/diagnostics/forge-four-official-2024-real.ts:34` 锁v39，是历史实时测试的快照保护。当前版本下会在联网前退出，不可作为当前v52实时诊断使用。修类型时仍应保持这个拒跑行为，不能顺手恢复模型请求或复用旧预算。

拟议修复：先核两当前测试的行为断言仍对应v52，再更新明确版本值，保留行为断言；不用“实际常量等于自身”的无效断言。历史脚本继续保留v39锁，可用接受string的版本核对表达式消除静态不相交比较，标明适用快照。新版本实时诊断属于新的执行范围，本次未建议启动。

### 2. 不完整测试输入与错误控制参数会降低反例的说服力

**T096**：`tests/forge-source-validation-followup.test.ts:283` 用99d6 fire制造伤害冲突，却同时遗漏 `CanonicalDamagePart.relationship`。定义在 `packages/models/src/canonicalMonster.ts:10–16`。拟议补 `relationship:'base'`，只改变目标伤害；保留冲突检查。当前类型错误不证明正式输入会被错误接受。

**T046／T081／T093**：三个测试传 `iconMode:'off'`。`ActorGeneratorOptions`只接收底层iconResolver，`ConvertMarkdownContentOptions`接收iconOptions／iconWorkflow；当前实现不读顶层iconMode。workflow默认采用disabledIconWorkflowPort，因此没有证据表明这些测试真的触发了网络图标处理，但显式控制并未生效。拟议只改调用项，不能为迁就测试在低层新增一套图标参数。

**T085**：测试把 `IntakeFinding[]` 当成已投影的 `ForgeIntakeFindingProjection[]`，后者要求evidence数组。生产 `intakeReview.ts:409–417` 已用 `(value.evidence ?? []).map(...)` 正常投影；本条没有证明生产崩溃。拟议在测试准备正确的投影输入，并核对序列化后的evidence数组，不让生产投影字段变成可选。

### 3. proof断言需要覆盖真实联合类型，但当前冻结样本不能被错报为全部失败

T057／T060／T061／T067／T070都使用 `Object.values(op.proof).flat()` 后把每个值当字符串。`packages/models/src/sourceOperationTypes.ts:50–52` 已允许 `upgrade:{sourceText,quote}`；这些断言与可接受契约确实不一致。

本次只读扫描五段循环当前选中的31个冻结case、56个原操作，未发现输入含upgrade。不能据类型错误断言这些现有case运行时都失败；也没有重跑它们。确认的是断言无法正确表达现行完整proof类型。

拟议：普通proof逐字符串核对本feature来源子句；upgrade按其sourceText与quote的同源规则核对。不得把对象stringify或直接filter掉以消除错误。必要时增加一个已有升级机制的定点正反例，不重写原冻结样本、不把升级规则降回文字。

### 4. 内部保留值与模型输出枚举不是同一个集合

T002的编译期双向相等断言要求prompt攻击枚举等于全部内部attack.type。内部多出`unclassified`，由 `packages/models/src/sourceInput.ts:81` 整理未知分类时产生，用于保留操作及问题；下游结构与GM攻击构造支持它。当前prompt指导输出的是六类已知攻击类型。

拟议分清“prompt可输出集合”和“入口可保留集合”，断言前者与prompt一致，同时保留unknown→unclassified的真实回归。仅为清类型错误把unclassified加入prompt，会改变提取行为，超出当前已有证据支持的窄修。这里没有发现未知分类阻止完整回答交付的新缺陷。

### 5. provider与网络替身的缺项主要是测试契约维护

R01涉及Monster，也包括 `forge-chm-transport-reception.test.ts:61,63` 的Item／Species构造，不能全称Monster错误。公共配置要求authMode和reviewModel；已查Monster构造不直接消费authMode，reviewModel有回退。Species相关fixture本身已提供reviewModel，主要缺authMode。

当前真实入口已核：`intake-ai/src/factory.ts:23–29` 经config loader；Web `ai-connections/providers.ts` 的site／BYOK／companion配置；Forge `ai.ts:234–241` 与 `encounterIntake.ts:158–159` 都提供所需字段。未发现实际入口从这些测试复制出缺项。

拟议在共享测试配置或各独立构造点补准确字段，保持现有假HTTP，不引入真实凭据。六处fetch禁止器补同样拒绝联网的preconnect即可；不能把禁网函数强转为正确形状后继续忽略其缺项。

### 6. 其余声明问题可以窄修，不应改变业务规则

- R06的12条集中在 `forge-46-macrofail-package.ts`：Object.fromEntries遍历固定unicorn／mimic键，类型却是可能缺键的记录。应让两键构造与类型对应，读取冻结文件时核必要结构；无需增加生产层反复校验。
- `forge-46-mirror-fixture.ts:291` 的bundleHash已受前面参数检查约束，但正则校验不会向TypeScript表达字符串收窄；显式取得确定字符串即可。
- `forge-brass-cast-replay.ts:67` 的reviewFindings接口可选，而当前 `prepareForgeEncounter` 返回时总构造数组。测试应按公开可选语义取空数组或要求存在；这条报错未证实当前运行会崩溃。该旧诊断的accepted条件也不能代替当前候选交付语义。
- 数组首项、find结果和已加载single记录先明确存在，再核字段；不能用可选链使“能力丢了”也通过“字段为空”的检查。
- `forge-company-neutral-runtime.test.ts:35,53` 的provider:any让5条回调丢类型；`reviewed-localization.test.ts:911` 的service:any引出10条错误。优先改helper边界为准确公共端口，保留真实生成／翻译草稿／GM确认流程。
- `forge-broad-rule-regression.test.ts:652,857` 的TS7022来自any与压缩声明推断，源码没有确认运行时自引用。拆开声明、使用已有返回类型并验证查找结果，不把它解释成生产死循环。
- sourceId使用公共工厂或真实验证后收窄；hash比较继续逐字保持完整值，不能重算期望来掩盖冻结hash变化。unknown Actor需证明结构后再检查items，不能降低为只比较数量。

## 对上一轮修复的影响

| 本轮机制 | 相关类型错误／证据边界 | 判断 |
|---|---|---|
| F01–F04 法术、模式、共享资源、坏附带成员 | provider测试缺配置、品牌sourceId、旧版本断言 | 生产入口配置完整；上一轮使用已修类型的新preservation测试与重放器，并有Priest七Cast及资源Mirror读回。这些旧错误不推翻专门证据 |
| F05–F08 状态、替代分支、父子活动 | proof union、数组存在性、旧语义测试helper | 专门generation反例与状态回归、实际Activity／Effects读回独立存在。旧proof或blocked负例不能被追加当作当前完整交付证明 |
| F09–F10 包成员与宏隔离 | 旧包构造脚本固定键记录的12条类型错误 | 当前冻结包确实已构造并完成独立导入验收；类型错误本身不证明包漏成员。修类型不得重写旧包和失败回执 |
| D01–D02 读回与写入身份 | 品牌hash/sourceId、unknown输出检查 | 这些都是旧测试调用／断言类型；本轮真实写入边界反例、读回字段差异与Mirror同源复用证据独立，未确认新的覆盖或身份错误 |

`tests/helpers/forge-semantic-chain.ts:68–75` 会主动把validator／verifier问题变成blocked，validator阻断时不调用生成。它适合独立来源规则检查，不能用来证明“有问题仍交付Actor”。这是证据用途边界，**不是本次确认的新生产故障，也不另计入107条根因**。上一轮已对modes负例明确使用SourceAudit，并用专门preservation入口验证实际交付；无需因为读到这个helper就重跑全部旧矩阵或把旧blocked断言全部改绿。

## 拟议修复顺序与验收

1. 先修测试的真实契约漂移：R03两个当前版本断言、R04的枚举／proof／finding／伤害反例、R09错误API参数。保留历史v39脚本拒跑保护。此步不改生成器、prompt内容或世界写入规则。
2. 修共享helper及测试入口类型：R01配置、R02完整禁网替身、R05身份与unknown、R08服务／provider上下文。优先从根声明消除重复错误，不逐行堆any或非空断言。
3. 整理R06／R07的固定数据与存在性证明，保持原样本、原断言含义与失败证据；只修本报告107条所涉位置，不借机重构全测试架构。
4. 类型修复后运行根 `typecheck:all`；先对实际修改过的测试使用现有安全包装入口做局部检查。只有断言含义或调用参数变化时补对应冻结正式链。若生产源码无变化，已有效Mirror证据继续复用，无须模型调用、投骰或重装世界。

不采用关闭strict／noUncheckedIndexedAccess、排除tests／diagnostics、批量as any／ts-ignore、删断言或更新冻结hash的清错方案。如果未来修复揭示新的生产行为失败，先单列原始输入、复现路径及拟议产品范围，不在类型维护中顺手扩大改动。

## 证据与方法

私有审查目录：`H:/CodexData/visualizations/2026/10/28/01a18034-1e26-7870-8d8b-041ab59fa313/forge-107-type-audit`。

- 复用上一轮 `baseline-type-errors.json`、`test-source-types-r2.log`、`type-errors-comparison.json`：当前107条与虚拟HEAD按文件／错误码／消息多重集合一致。本轮开始时核对上一轮53个工作树文件hash均未变化，因此没有重复跑全仓类型或已通过矩阵。
- 两个独立只读审阅分别覆盖33条provider／传输／版本项和43条fixture／业务断言项，根代理覆盖其余31条并核对全部映射；关键发现另由根对照实际源码。
- `classification.json` 保存107条唯一编号、原错误、根因和方案；`static-evidence.json`保存当前版本与三处旧锁的比较、五组冻结proof输入的只读统计。
- 最终保护与审查范围收据为 `final-audit.json`。本次没有执行真实模型请求、生成新Actor、调用Foundry、修改产品／测试或提交／合并／推送。只读检索辅助过程中的路径／编码错误已纠正，不用它们作功能失败证据。

## 逐条归类索引

编号T001–T107按既有编译收据顺序。行号对应本轮核对的工作树；R编号对应上表的根因和窄修方案。

| 编号 | 位置 | 类型错误 | 根因 |
|---|---|---|---|
| T001 | `src/core/intake/__tests__/orchestrator.test.ts:1715` | TS2322 | R07 |
| T002 | `src/core/intake/__tests__/provider.test.ts:34` | TS2344 | R04 |
| T003 | `src/core/intake/__tests__/provider.test.ts:187` | TS2769 | R03 |
| T004 | `tests/core/generator/structuredActionItems.test.ts:260` | TS2532 | R06 |
| T005 | `tests/core/generator/structuredActionItems.test.ts:260` | TS2532 | R06 |
| T006 | `tests/core/generator/structuredActionItems.test.ts:261` | TS2532 | R06 |
| T007 | `tests/diagnostics/forge-46-frozen.check.ts:19` | TS2352 | R02 |
| T008 | `tests/diagnostics/forge-46-frozen.check.ts:159` | TS2345 | R01 |
| T009 | `tests/diagnostics/forge-46-macrofail-package.ts:16` | TS18048 | R06 |
| T010 | `tests/diagnostics/forge-46-macrofail-package.ts:17` | TS2532 | R06 |
| T011 | `tests/diagnostics/forge-46-macrofail-package.ts:17` | TS2532 | R06 |
| T012 | `tests/diagnostics/forge-46-macrofail-package.ts:18` | TS18048 | R06 |
| T013 | `tests/diagnostics/forge-46-macrofail-package.ts:26` | TS2532 | R06 |
| T014 | `tests/diagnostics/forge-46-macrofail-package.ts:26` | TS2532 | R06 |
| T015 | `tests/diagnostics/forge-46-macrofail-package.ts:26` | TS2532 | R06 |
| T016 | `tests/diagnostics/forge-46-macrofail-package.ts:27` | TS2532 | R06 |
| T017 | `tests/diagnostics/forge-46-macrofail-package.ts:27` | TS2532 | R06 |
| T018 | `tests/diagnostics/forge-46-macrofail-package.ts:27` | TS2532 | R06 |
| T019 | `tests/diagnostics/forge-46-macrofail-package.ts:32` | TS2532 | R06 |
| T020 | `tests/diagnostics/forge-46-macrofail-package.ts:33` | TS18048 | R06 |
| T021 | `tests/diagnostics/forge-46-mirror-fixture.ts:291` | TS2345 | R06 |
| T022 | `tests/diagnostics/forge-brass-cast-replay.ts:67` | TS18048 | R06 |
| T023 | `tests/diagnostics/forge-chm-berserker-offline.ts:8` | TS2352 | R02 |
| T024 | `tests/diagnostics/forge-chm-berserker-offline.ts:23` | TS2345 | R01 |
| T025 | `tests/diagnostics/forge-four-official-2024-real.ts:34` | TS2367 | R03 |
| T026 | `tests/diagnostics/forge-official-status-replay.ts:16` | TS2352 | R02 |
| T027 | `tests/diagnostics/forge-official-status-replay.ts:62` | TS2345 | R01 |
| T028 | `tests/forge-46-core.test.ts:31` | TS2345 | R01 |
| T029 | `tests/forge-46-core.test.ts:41` | TS2345 | R01 |
| T030 | `tests/forge-46-core.test.ts:54` | TS2345 | R01 |
| T031 | `tests/forge-46-core.test.ts:77` | TS2345 | R01 |
| T032 | `tests/forge-46-core.test.ts:87` | TS2345 | R01 |
| T033 | `tests/forge-46-core.test.ts:102` | TS2345 | R01 |
| T034 | `tests/forge-46-core.test.ts:148` | TS2532 | R06 |
| T035 | `tests/forge-ai-owned-boundary.test.ts:34` | TS2769 | R03 |
| T036 | `tests/forge-batch-queue-indexed-db.test.ts:11` | TS2532 | R06 |
| T037 | `tests/forge-batch-queue-indexed-db.test.ts:16` | TS2532 | R06 |
| T038 | `tests/forge-broad-rule-regression.test.ts:399` | TS2532 | R06 |
| T039 | `tests/forge-broad-rule-regression.test.ts:466` | TS2532 | R06 |
| T040 | `tests/forge-broad-rule-regression.test.ts:468` | TS2532 | R06 |
| T041 | `tests/forge-broad-rule-regression.test.ts:498` | TS2532 | R06 |
| T042 | `tests/forge-broad-rule-regression.test.ts:652` | TS7022 | R08 |
| T043 | `tests/forge-broad-rule-regression.test.ts:652` | TS7006 | R08 |
| T044 | `tests/forge-broad-rule-regression.test.ts:857` | TS7022 | R08 |
| T045 | `tests/forge-browser-runtime.test.ts:871` | TS18046 | R05 |
| T046 | `tests/forge-category-form-v2.test.ts:435` | TS2353 | R09 |
| T047 | `tests/forge-chm-spell-projection.test.ts:17` | TS2345 | R01 |
| T048 | `tests/forge-chm-spell-projection.test.ts:34` | TS2345 | R05 |
| T049 | `tests/forge-chm-spell-projection.test.ts:35` | TS2345 | R05 |
| T050 | `tests/forge-chm-spell-projection.test.ts:158` | TS2769 | R05 |
| T051 | `tests/forge-chm-transport-reception.test.ts:21` | TS2345 | R01 |
| T052 | `tests/forge-chm-transport-reception.test.ts:61` | TS2345 | R01 |
| T053 | `tests/forge-chm-transport-reception.test.ts:63` | TS2345 | R01 |
| T054 | `tests/forge-chm-transport-reception.test.ts:77` | TS2345 | R01 |
| T055 | `tests/forge-cli-delivery.test.ts:152` | TS2345 | R01 |
| T056 | `tests/forge-cli-delivery.test.ts:233` | TS2345 | R01 |
| T057 | `tests/forge-common-source-operations.test.ts:743` | TS2769 | R04 |
| T058 | `tests/forge-common-source-operations.test.ts:749` | TS18048 | R07 |
| T059 | `tests/forge-common-source-operations.test.ts:825` | TS7006 | R08 |
| T060 | `tests/forge-common-source-operations.test.ts:827` | TS2769 | R04 |
| T061 | `tests/forge-common-source-operations.test.ts:928` | TS2769 | R04 |
| T062 | `tests/forge-common-source-operations.test.ts:933` | TS7006 | R08 |
| T063 | `tests/forge-common-source-operations.test.ts:933` | TS2769 | R07 |
| T064 | `tests/forge-common-source-operations.test.ts:973` | TS2345 | R07 |
| T065 | `tests/forge-common-source-operations.test.ts:974` | TS2538 | R07 |
| T066 | `tests/forge-common-source-operations.test.ts:1017` | TS2538 | R07 |
| T067 | `tests/forge-common-source-operations.test.ts:1035` | TS2769 | R04 |
| T068 | `tests/forge-common-source-operations.test.ts:1149` | TS2345 | R07 |
| T069 | `tests/forge-common-source-operations.test.ts:1149` | TS2769 | R07 |
| T070 | `tests/forge-common-source-operations.test.ts:1162` | TS2769 | R04 |
| T071 | `tests/forge-company-neutral-runtime.test.ts:102` | TS7006 | R08 |
| T072 | `tests/forge-company-neutral-runtime.test.ts:103` | TS7006 | R08 |
| T073 | `tests/forge-company-neutral-runtime.test.ts:103` | TS7006 | R08 |
| T074 | `tests/forge-company-neutral-runtime.test.ts:148` | TS7006 | R08 |
| T075 | `tests/forge-company-neutral-runtime.test.ts:150` | TS7006 | R08 |
| T076 | `tests/forge-creature-blueprint.test.ts:85` | TS2322 | R06 |
| T077 | `tests/forge-current-input-recovery.test.ts:48` | TS2769 | R05 |
| T078 | `tests/forge-current-input-recovery.test.ts:48` | TS2769 | R05 |
| T079 | `tests/forge-current-input-recovery.test.ts:48` | TS2769 | R05 |
| T080 | `tests/forge-current-input-recovery.test.ts:54` | TS2769 | R05 |
| T081 | `tests/forge-current-input-recovery.test.ts:121` | TS2353 | R09 |
| T082 | `tests/forge-empty-fields-vulnerability.test.ts:62` | TS2345 | R01 |
| T083 | `tests/forge-empty-fields-vulnerability.test.ts:79` | TS2345 | R01 |
| T084 | `tests/forge-empty-fields-vulnerability.test.ts:112` | TS2345 | R01 |
| T085 | `tests/forge-empty-fields-vulnerability.test.ts:133` | TS2322 | R04 |
| T086 | `tests/forge-empty-fields-vulnerability.test.ts:181` | TS2345 | R01 |
| T087 | `tests/forge-empty-fields-vulnerability.test.ts:199` | TS2345 | R01 |
| T088 | `tests/forge-generation-preservation.test.ts:22` | TS2769 | R07 |
| T089 | `tests/forge-generation-preservation.test.ts:86` | TS2352 | R02 |
| T090 | `tests/forge-generation-preservation.test.ts:105` | TS2352 | R02 |
| T091 | `tests/forge-input-field-policy.test.ts:13` | TS2352 | R02 |
| T092 | `tests/forge-input-field-policy.test.ts:129` | TS2345 | R01 |
| T093 | `tests/forge-legacy-resource-migration.test.ts:41` | TS2353 | R09 |
| T094 | `tests/forge-literal-condition-boundary.test.ts:68` | TS2769 | R06 |
| T095 | `tests/forge-literal-condition-boundary.test.ts:119` | TS2345 | R07 |
| T096 | `tests/forge-source-validation-followup.test.ts:283` | TS2741 | R04 |
| T097 | `tests/helpers/forge-legacy-provider.ts:47` | TS2769 | R05 |
| T098 | `tests/reviewed-localization.test.ts:789` | TS7006 | R08 |
| T099 | `tests/reviewed-localization.test.ts:810` | TS7006 | R08 |
| T100 | `tests/reviewed-localization.test.ts:816` | TS7006 | R08 |
| T101 | `tests/reviewed-localization.test.ts:820` | TS7006 | R08 |
| T102 | `tests/reviewed-localization.test.ts:826` | TS7006 | R08 |
| T103 | `tests/reviewed-localization.test.ts:827` | TS7006 | R08 |
| T104 | `tests/reviewed-localization.test.ts:838` | TS7006 | R08 |
| T105 | `tests/reviewed-localization.test.ts:868` | TS7006 | R08 |
| T106 | `tests/reviewed-localization.test.ts:868` | TS7006 | R08 |
| T107 | `tests/reviewed-localization.test.ts:876` | TS7006 | R08 |

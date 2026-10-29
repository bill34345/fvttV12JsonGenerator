# Forge 22 项行为失败复审与修复方案

日期：2026-10-28。工作树：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20261019-forge-ab-fixed-replies`。分支：`codex/20261019-forge-ab-fixed-replies`。HEAD：`5dc5702767bbcb0818a05a02e45c925289e66758`。

本轮授权是逐项复审、确认问题和列出修复方案。产品、测试及配置修复尚未执行；没有新增生成、审核、修复或翻译模型调用，没有世界写入，也没有提交、合并或推送。此前完成的 107 条类型修复及 12 类保留能力修复均保留。

## 结论

22 项均已定位其失败入口、当前行为及与前一轮修改的关系。16 项主要是旧协议、旧审计入口、旧错误码或旧快照预期；另 6 项涉及两个已确认的旧产品缺陷，以及缺治疗目标、缺传奇资源台账这两个不完整输入边界，不能简单改断言使其通过。

- **Brass 哈希变化已完整解释。** 旧快照到当前 Actor 只增加 Sleep Breath 的两个 GM 效果模板及对应 Activity 链接。移除这两处新增数组后，完整 Actor 与旧快照严格相等；当前与 12 类修复前 HEAD 的完整 Actor 相等。没有发现本轮错误增加其他效果、删除能力或改变资源的证据。
- **三项传奇样本确实生成了上限为 0 的资源配置。** 来源正文写有 3 次、巢穴 4 次，但旧测试输入没有提供结构化传奇台账；当前默认链不再从正文补造它。显式台账正控能保留基础上限 3、巢穴上限字段 4。旧断言属于旧推断契约，当前不完整输入仍会造成实际配置缺口，两点必须一起处理。
- **Aboleth 的治疗目标没有变错；War Cry 的缺省目标确实收窄。** 两份旧输入均缺治疗目标。Aboleth 生成自身治疗，与来源一致，只缺测试期待的补写元数据；War Cry 生成自身目标，遗漏来源允许选择的另一个生物。显式目标均能完整保留。
- **另有两个已确认旧产品缺陷。** 新回复的空字段补齐记录被清除；双语名称超过宏绑定长度时返回已翻译 Actor 和旧英文绑定宏，并给出不准确的回退提示。
- **未确认这些失败机制由本轮 F01–F10、D01/D02 修复引入。** 优先样本已用修复前生产模块做动态对照；其余结合未改动的失败入口、历史提交及定向诊断确认。这个因果结论不代表产品已经完整可用，也不代表未走到的后续能力测试通过。

## 证据与比较方法

本轮证据根目录为：

`H:\CodexData\visualizations\2026\10\28\01a18034-1e26-7870-8d8b-041ab59fa313\forge-22-behavior-audit`

下文的 `E/` 均指此目录。原 22 项失败名和失败原件仍在同级 `forge-107-type-fixes`，本轮没有覆盖。

1. 上一轮 `behavior-baseline-comparison.json` 用 HEAD 的测试/helper 搭配当时的产品代码复现 22/22，证明它们早于 107 条类型修复；**这不足以排除 12 类产品修复的影响**。
2. 本轮选出 26 个相关 dirty 生产 TS 模块，通过 Bun loader 在内存读取 HEAD 版本。优先生成路径实际加载 17 个，均验证 Git blob 完整性后使用；其余不在这些调用路径内。没有替换磁盘源码或建立源码副本。
3. 以原安全包装 `src/tools/runHermeticFoundryScript.ts` 运行任务独立的 `.local/forge-22-behavior-audit/package.json` 入口。网络默认抛错，提供的回复均为冻结 IR 或测试自有固定回复；正控只在内存添加明确字段，另存产物，原答不变。
4. `current-r2` 与 `head-r3` 的 Brass 加三传奇、两治疗原样/正控共 11 条结果摘要严格相等；Brass 还比较完整 Actor。空字段、状态及 review 元数据诊断也分别保存当前和 HEAD 结果。
5. `localized-*/localized-return.json` 是把原测试最后的 reject 断言在内存替换为实际返回读回。其“1 pass”只表示完成取证，**不表示原业务测试已通过**。`binding-*` 的“3 pass / 115 assertions”是显式加入既有程序 source audit 后的诊断结果，**不表示默认 binder 的原测试已修复**。
6. 两支已完成的独立只读审查分别覆盖资源/治疗与旧协议/本地化；父代理核对实际源码和产物后采纳。没有把未执行的后续业务分支记为通过。

汇总文件：`E/brass-three-way-comparison.json`、`E/priority-comparison.json`、`E/review-results.json`、`E/historical-boundaries.json`。`review-results.json` 保留原始完整测试名并逐一绑定 B01–B22。

初次探针的导入失败 `current-r1.log`、HEAD 读取不完整导致的 `head-r2.log` 均保留。后者只修复诊断 loader，改成完整缓冲读取并校验 Git blob；没有因此重写产品或冻结材料。

## 优先复审结果

### B13：Brass 的旧整卡哈希已经过时

旧 Actor：`H:\CodexData\visualizations\2026\10\25\01a1720b-4563-7511-82df-e8cb00ed7e53\forge-regression-recovery\brass-current\candidate.json`。

| 比较对象 | 完整 Actor 哈希 |
| --- | --- |
| 10 月 25 日旧快照 | `64f9db3b1f98a83a2b8b79836084b588befb6c6623f23614d1c51b09cc03367e` |
| 12 类修复前 HEAD | `7c9f0548c4762cebd3eea2d1a12bcd10927f72c489d4408318d939bcee209255` |
| 当前工作树 | `7c9f0548c4762cebd3eea2d1a12bcd10927f72c489d4408318d939bcee209255` |

仅两处数组由空变为两项：`/items/5/effects`、`/items/5/system/activities/ea765c5d65735a9b/effects`，所属 Item 为 Sleep Breath。新增内容为：

- 第一次失败的失能 Incapacitated 模板，保留回合末再豁免条件。
- 第二次失败的昏迷 Unconscious 模板，包含其伴随失能，持续 600 秒，保留第二次失败和提前结束正文。
- 两者各链接到 `sleep-breath-save`，均带 `conditionLifecycle.mode=gm`。完整效果、阶段条件、时长和链接保存在三方比较文件中。

这与 HEAD 前已有的 `b2c89eda` 官方状态模板提交一致。模块 `manualConditionEffects.ts` 的界面要求 GM 按原文选择模板、目标及适用时机，保留对 Midi 自动应用的排除逻辑。本轮没有实际掷骰或应用效果，不能把生成模板等同于已经验收多阶段战斗结算。

**修复方案：** 保留旧快照，新增有版本说明的预期与两处允许差异，强断言状态、阶段条件、600 秒时长和链接，并对其他全部字段继续严格比较。不能只把预期哈希换成当前值，也不能为保留旧哈希删除新增模板。

### B20–B22：传奇资源缺结构字段，旧推断测试与真实配置缺口并存

涉及 Kraken Toxic Ink、Lich Deathly Teleport、Sphinx of Lore Weight of Years。原测试先在 IR 的传奇上限断言失败，之前不能据此断定最终 Actor 配置；本轮已补齐正式链读回。

| 层级 | 冻结原样输入 | 仅加显式台账的内存正控 |
| --- | --- | --- |
| 来源 | 都有 `Legendary Action Uses: 3 (4 in Lair)` | 同一来源 |
| 输入 | 无 `creature.legendary`，context 无 `legendaryMax`；能力有 cost 1 | 明确提供 max 3、lairMax 4、recovery 与正文证据 |
| 正式 IR | 不补写台账 | 台账字段保留 |
| Actor | `legact.max=0`，lair false；传奇能力和 cost 1 保留 | `legact.max=3`，lair true；IR 的 lairMax 4 保留 |
| 当前/HEAD | 一致 | 一致 |

`tests/helpers/forge-semantic-chain.ts:35–37` 只从明确的 `unit.legendaryMax` 建台账。默认 `anchorIrEvidence` 不再执行正文语义补全，旧 `ensureLegendarySourceResources` 在显式 `anchorIrEvidenceSourceAudit` 内；这次分离来自 `a85e97da`，早于本轮修复。

这不是一份已经给出 max 3 的输入被 F03 删除，也不说明原样产物可正常使用：在系统默认行动消耗开启时，0 次资源会使传奇动作不可用。现有原样结果仍被接受且 findings 为空，缺少“有传奇成本但无可用资源池”的结构关系提示。

**没有确认额外的 consumption.targets 缺失缺陷。** 已对照 dnd5e 5.3.3 本地完整源码，HEAD `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`：`module/config.mjs:1053–1056` 将 legendary 激活绑定 `resources.legact`；`module/documents/activity/mixin.mjs:427–439,538–562` 默认启用行动消耗，根据 `activation.value` 增加 spent，并对 0 次资源报错。显式 attribute target 仅用于避免重复消耗，不能为使数组非空再加一次同池消耗。本轮没有实际使用 Activity。

**修复方案：** 当前 complete-IR 测试提供明确台账；历史正文推断测试移到显式离线 SourceAudit。另增加成本/资源关系提示，保留 Actor、传奇能力、原答和缺字段事实，不默猜 3 次，不恢复默认正文推断，不迁移旧 Actor。巢穴 4 次切换的运行时验收本轮未执行。

### B15/B16：治疗目标分开判断

两份旧输入都只有治疗公式和类型，没有 `healing.target`。`packages/generation/src/activity.ts:223–237` 的既有缺省是自身、一个目标、special 空；显式非自身目标会保留目标文字并打开目标选择。

| 样本 | 来源要求 | 原样结果及失败原因 | 显式字段正控 |
| --- | --- | --- | --- |
| B15 Aboleth Psychic Drain | Aboleth 自身恢复生命 | 1d10 healing，自身一个目标，行为与来源一致；测试读取未补写的 `healing.target.special` 失败 | self / 1 / `The aboleth` 保留，骰子不变 |
| B16 Frost Giant War Cry | 巨人自身，或一个能看见或听见巨人的自选生物，获得临时生命 | 2d10+5 temphp 保留，但目标成为自身；来源允许的另一生物选项没有配置 | creature / 1 / 完整来源目标句保留，prompt true，骰子和 recharge 消耗不变 |

两组当前与 HEAD 结果相同，默认目标文件不属于本轮 dirty 修改。B15 是旧补元数据预期；B16 同时存在旧输入不完整和默认目标收窄，不能仅降低断言。

**修复方案：** 当前样本显式给出目标，历史推断断言使用显式离线审计。对旧格式缺失 recipient 的治疗保留实际治疗、完整正文及 Actor，同时提示目标未确认，不把 schema 缺省 self 认证为来源确定目标；采用现有 GM 选择出口处理这一项。不要从任意描述猜目标，也不要为了缺目标删除治疗或退整项文字。是否调整旧格式缺省，应在此窄边界修复中覆盖 self、creature、缺省三组，不能影响完整显式字段。

## 另外两个已确认产品缺陷

### B01 — P2：程序补齐记录被随后清除

当前与 HEAD 的两组固定回复读回均显示：模型伪造的 `normalizedEmptyFields` 被清除，原答不变；但当回复省略 reactions 时，程序补出 `reactions:[]` 后仍没有 `/creature/reactions` 的程序记录。

原因在 `packages/intake-ai/src/provider.ts:586,602–603`：先 `normalizeProjectionContainers` 补字段并记历史，随后为防止新模型回复伪造历史而删除整个记录，最后 `normalizeEmptyMonsterFields` 看见字段已经存在，无法再记录。这一调用次序早于本轮修复，历史入口见 `22d0c094`。

后果是补齐审计记录不准确，没有发现这里删除 Actor 能力。**修复方案：** fresh extract 先清除不可信历史，再做程序补齐；已保存草稿的历史按现有恢复边界处理。保留“假历史不继承”和“真实新增路径留下记录”两项相反方向断言，继续核对原答未改。

### B10 — P2：本地化失败回退留下旧宏并误报 Actor 语言

原测试要求整个准备过程因 256 字符限制 reject，这与保留可用 Actor 的方向不一致；但真实返回也存在产品缺陷。

`tests/reviewed-localization.test.ts:890–897` 的英文能力名为 200 个 A，中文名为 60 字；双语 Item 名实际为 261 字符。当前与 HEAD 的实际返回均为：

- 一份已中文化的 Actor，完整 261 字符双语 Item 名保留。
- 一份 `gm-manual` 宏，command 与原包完全相同，仍引用 200 个 A 的旧英文 Item 名。
- finding 却说“中文展示未完成……原语言 Actor 保留”，与返回 Actor 不符。

`packages/forge-browser-runtime/src/encounterPreparation.ts:122–135` 先准备并翻译 Actor，初始化 presentation 为原宏；`encounterLocalizationProjection.ts:127–129` 因过长名称抛错后，catch 只加提示，于是返回了不一致的配对。相关文件未在本轮 12 类修复中修改，该保留部分产物的回退来自 `ce1f9e39`。

**影响边界：** 旧宏仍进入准备结果，可以沿宏计划继续传递，不能称为已被剔除。但该样本是 gm-manual；`encounterAutomationRuntime.ts:336–341` 的唯一 Item 名检查会在安装规则前拒绝旧名称。原 fixture 的 key 还是 `control`，真实启动前置要求 `battle-control`。本轮未导入或启动，**没有证据表明错误效果已执行**，也不能拿这份 fixture 证明完整启动链通过。

**修复方案：** 按每个宏隔离本地化投影失败，从准备导入清单剔除失败宏，保留其原始记录和准确 finding，Actor 与其他有效宏继续保留；提示说明 Actor 已翻译、哪个宏未准备。不得截断身份、放宽启动匹配或恢复整包拒绝。与前轮 F09/F10 属于同一保留配套失败的方向，但本分支不在那些修复的实际失败入口内；需要自己的准备→计划→启动拒绝检查。

## 其余旧测试机制

### B02–B09：八项 Company/Vampire 在假请求协议处提前失败

`tests/helpers/forge-legacy-provider.ts:8–15` 仍把 `stagedExtraction` 当作历史协议的有效开关。当前 `provider.extract:229–230` 已固定发送完整 IR 请求；`22d0c094` 已移除旧分阶段分支。

`tests/forge-company-neutral-runtime.test.ts:35–44` 的 fake fetch 只接受 base 切片或 template+units，收到完整来源后主动抛 `No real HTTP, repair or automation operation is permitted`。provider 将这个测试适配器异常包装为传输失败。该分支在本轮 normalizer 和后续能力生成前就退出，不是真实 HTTP 或模型调用。

因此这八项不能证明中性攻击、同池消费、吸血鬼目标身份或缺目标 finding 发生回归；它们也没有证明这些行为通过。**修复方案：** 历史协议通过测试自有、明确离线的适配入口执行；当前公开 factory 使用同来源的固定完整 IR 回复。两边分别保留完整 Actor、中性攻击、伤害折半、同池消费、不凭空制造 Heal、身份 finding 及原答不变等强断言。不能重启默认旧协议，也不能删掉这八项来获得绿色。

### B11：支持的 stunned 字段仍在，旧测试期待降成正文

在原失败所调用的 `normalizeCreatureFeatureInput` 层，当前与 HEAD 都保留 `sourceOperations[0].failureStatuses=['stunned']`、攻击加值及伤害，没有把该状态丢掉。旧测试要求 description 出现 `stunned`，与状态现在可由原生字段承载的事实不符。

**修复方案：** 断言状态保留在正确操作上，在正式生成检查中核对 Effect 和 Activity 链接；未知状态另测局部 GM 提示。不能为满足正文字符串断言，强制把支持状态退成文字。本探针只确认该入口字段保留，没有新增整卡状态应用验收。

### B12/B14/B19：默认 binder 不再承担语义 source audit

`packages/models/src/sourceOperations.ts:1505` 的 `bindSourceOperations` 负责证据准备与绑定，不再通过来源推理直接 throw。文件本轮未修改，边界来自 `22d0c094`。

三个负例的实际错误仍可被既有 `sourceOperationErrors` 找出。仅在内存显式加入该离线程序审计后，当前与 HEAD 的三项原负例均达到原预期，共 115 条断言。这验证的是审计能力仍在，不是默认 binder 恢复拒绝。

**修复方案：** 组合/并列攻击模式、created-entity THEN 攻击、Cylinder 半径与高度的语义负例调用显式审计；默认绑定单独验证候选及输入保留，不以来源核对结果撤销整只 Actor。

### B17/B18：结构校验、来源审计及错误码已分开

`packages/intake-ai/src/validator.ts:98–107` 的默认 `validateMonsterIntakeIR` 调用结构校验；来源核对在 `auditMonsterIntakeSource`。分离来自 `a85e97da`。

- B17：saveDc 改为 99 时，默认结构校验没有来源不匹配 finding；显式程序审计仍给出 `SPELL_SAVE_DC_EVIDENCE_MISMATCH`。候选 review 元数据没有抑制此审计。
- B18：向 review 元数据塞 `execute:'attack'` 时，默认结构校验实际给出 `INVALID_STRUCTURE`，路径 `/creature/spellcasting/0/candidateReview`；旧测试只找 `INVALID_CANDIDATE_REVIEW`。显式旧审计仍使用后者。没有确认注入字段被接受或执行。

**修复方案：** 来源蕴含负例走显式离线 source audit；默认入口断言真实结构错误码、路径及 inert 数据约束，不能把代码不同当作校验缺失。程序离线审计不涉及恢复 AI 内容复核。

## 22 项逐项对应

完整原始测试名见 `E/review-results.json`。此表只缩写标题；编号沿用原失败列表排序，覆盖无遗漏、无重复。

| 编号 | 失败对象 | 确认分类与修复方向 |
| --- | --- | --- |
| B01 | fresh model completion history | 旧产品缺陷；清除假历史应早于程序补齐 |
| B02 | Company neutral attack/outgoing half | 旧假请求协议；后续机械断言未执行，修离线适配及 current IR 对照 |
| B03 | neutral Attack + Save shared pool | 同 B02；保留同池与后续伤害不额外消耗断言 |
| B04 | Vampire stable id/self/no Heal | 同 B02；保留 ID 与自身绑定、无虚构 Heal 断言 |
| B05 | Vampire stable name/self/no Heal | 同 B02；保留名称绑定及无虚构 Heal 断言 |
| B06 | Vampire missing-target candidate | 同 B02；必须继续检查可用候选和缺目标 finding |
| B07 | Vampire unbound-owner candidate | 同 B02；必须继续检查归属身份 finding |
| B08 | Vampire wrong-reference candidate | 同 B02；必须继续检查错误引用 finding |
| B09 | Company missing creature target | 同 B02；必须继续检查候选保留、缺目标与原答未修写 |
| B10 | bilingual binding >256 | 旧整包拒绝预期 + 旧产品回退缺陷；保留 Actor，隔离旧名宏 |
| B11 | supported stunned as GM prose | 旧正文断言；改测状态结构与归属，保留未知状态负例 |
| B12 | legacy attack modes negative | 旧 binder API 预期；显式来源审计，默认绑定保持候选 |
| B13 | Brass full Actor hash | 旧快照；严格记录两个模板/链接的语义增量 |
| B14 | created-entity THEN attack | 旧 binder API 预期；显式审计前置/真实加值与来源 |
| B15 | Aboleth Psychic Drain target | 旧输入缺元数据；自身治疗正确，补明确目标正控 |
| B16 | Frost Giant War Cry target | 旧输入 + 真实缺省收窄；目标未确认提示及显式范围保留 |
| B17 | review metadata/source DC findings | 旧默认来源审计预期；显式审计仍能检出 DC 99 |
| B18 | malformed review findings code | 旧错误码；默认实际检出 INVALID_STRUCTURE，并未放行注入 |
| B19 | Cylinder radius/height/range | 旧 binder API 预期；显式程序审计及默认候选保留分测 |
| B20 | Kraken Toxic Ink legendary pool | 旧输入缺台账 + 真实 0 次配置缺口；显式台账与非阻断提示 |
| B21 | Lich Deathly Teleport legendary pool | 同 B20，独立原样/正控产物保留 |
| B22 | Sphinx Weight of Years legendary pool | 同 B20，独立原样/正控产物保留 |

## 与 F01–F10、D01/D02 的关系

当前/HEAD 动态相等的范围包括 Brass 完整 Actor、三传奇与两治疗原样/正控结果、空字段历史、stunned 入口、review 元数据校验及本地化 Actor/宏/finding。三项 binder 负例在显式审计模式下也相等。旧协议八项的阻塞入口早于 HEAD，未到 F01–F08 所改生成路径；不能推广为其全部后续效果相等。

| 前轮机制 | 本轮关联判断 |
| --- | --- |
| F01 法术保留、F04 局部附带字段隔离、F08 混合子活动 | B17/B18 的失败在校验入口契约；旧 Vampire 未走到后续生成，不能据这些失败判定法术/Heal 被新删改 |
| F02 执行模式与状态归属 | B11 的状态原字段保留，当前/HEAD 相同；B12/B14/B19 是 binder 审计入口错层，未确认来自 F02 |
| F03 共享资源 | B03 被旧协议阻塞；B20–B22 输入没有传奇台账，不是 F03 删除已给资源，正控可保留 |
| F05/F06/F07 状态施加与链接 | Brass 变化在此前 b2c89eda 已存在；完整 HEAD/当前一致，没有发现这三修复给 Brass 新加错误效果的证据 |
| F09 包成员、F10 坏宏隔离 | B10 是相邻的本地化投影回退缺口，已在 ce1f9e39 存在；不能因 F10 的坏宏检查通过就认为这一分支也正确 |
| D01 读回保真、D02 写入身份 | 本轮没有世界写入或保存读回，不能扩大对这两边界的运行时结论 |

## 拟议修复顺序与检查范围

以下是下一轮可审阅的方案，本轮未执行：

1. **先处理会返回不一致配置的产品边界。** B10 逐宏隔离失败并校正提示；B16 对缺治疗目标给出明确待确认出口；B20–B22 对成本/资源池缺损给出结构关系提示。保留完整 Actor 与原回复，不默猜正文、不增加模型调用。复用这次原样和显式字段正控，增加失败项与有效相邻项共存的检查。
2. **修 B01 补齐历史顺序。** 只改变 fresh reply 可信边界，检查伪造历史删除、程序实际路径记录和草稿恢复，不扩到通用历史重建。
3. **修旧测试入口和契约。** B02–B09 的历史适配与当前完整 IR 分测；B12/B14/B19/B17 走明确离线审计；B18 保留结构拒绝断言；B11 检查状态结构；B15 提供显式自身目标。不能删机械断言或扩大 mock 来绕过原来的业务目标。
4. **最后更新 Brass 的版本化预期。** 保留旧原件，严格核对只有两处新增，再运行受影响的当前安全入口。修完做独立代码审查；再依据真实跨入口变化决定是否需要补 Foundry 导入/启动等验收，不先扩成全仓 CI 或长时测试。

本轮的终点是确认问题和方案，22 个原测试没有因此全部转绿。没有新实现改变用户入口、支持版本或操作步骤，因此未重生成手册、未重跑上一轮已经完成且未失效的类型/手册检查。现有工作树文件和冻结证据的最终保持核对见 `E/final-validation.json`。

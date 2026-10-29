# Forge 46 项能力保留代码复审

日期：2026-10-28，Asia/Shanghai。状态：**审查和局部离线验证完成；没有实施修复。**

工作树：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`；分支 `codex/20261019-forge-ab-fixed-replies`；代码 HEAD `5dc5702767bbcb0818a05a02e45c925289e66758`。

## 结论与证据等级

46 项均按原编号重新追踪了当前实现。**“有 Actor”与“不丢已有能力”仍未统一：检查分支、展示模式、资源身份、活动合并及配套入口都还存在损伤内容或阻断交付的路径。** 下文确认问题不是修复结果，也不把未发现新问题的项目标成完整通过。

用户本次原话：

> 那先把46项逐项重新做一次代码审查，重点查删除能力、降级成文字和错误新增效果的路径，用现有冻结材料验证。先列出确认的问题和修复方案，不新增模型调用。

保持原要求：“只有 AI 没正常返回才能阻止整只 Actor 生成，其他问题不得挡住产物获取或删掉已有能力。”官方状态应进入对应 Activity 的 effects。规则材料年份与软件版本分开；本次代码链固定 v14 / dnd5e 5.3.3，未更新系统或模块。

证据按下列等级区分：

- **A 原样冻结材料**：Priest、Ettercap 当前完整原答重放；Rakshasa 未修改的原答解析后经正常草稿／生成入口；已有 Mirror 证据只用于它实际测过的对象。
- **B 单变量派生对照**：在内存副本改变一个附带记录、技术标识、模式或缺省字段；原来源、其他机械字段与原文件保持。它证明该实现分支可触发，不表示原冻结样本已经有该错误。
- **C 机制构造反例**：在冻结 Mimic 的结构上明确追加分支状态或子活动，验证当前已接受组合怎样丢失内容。不是官方 Mimic 的规则或真实模型首答。
- **D 检测／身份边界缺口**：实际执行到检测或解码，随后代码链确认；不声称 Mirror 实际发生删除或错误写入。

父代理保存了 10 个当前本地生成链对照结果；四个独立只读审阅分段覆盖 1–13、14–25、26–36、37–46，并执行针对性内存检查。另对 14 份冻结 Actor 做当前导入适配器全字段差异审计。没有重复运行旧的大矩阵，没有网络／生成／复核／翻译模型请求，没有浏览器、世界写入、投骰、Use/Cast/Apply 或服务操作。产物全部通过现有 renderer/parser/workflow/generator 生成，没有手改最终 Actor JSON。

本轮只新增本报告和 `.local/forge-46-preservation-audit-20261028/replay.ts` 诊断源码及私有证据；产品、既有测试、冻结材料和三份原有未提交文档未修改。无提交、合并、推送。

私有证据根 E：

`H:/CodexData/visualizations/2026/10/28/01a18034-1e26-7870-8d8b-041ab59fa313/forge-46-preservation-audit`

关键记录：`selection.md`、`replay-results.json`、`boundaries/replay-results.json`、`missing-ability/replay-results.json`、`reviewer-receipts.json`、`final-audit-check-final.json`。每个父代理生成案例另存完整 analysis/generation/actor/规范来源；原件读取前后 SHA-256 比较保存在对应 receipt。独立审查的内存结果按审阅者回报归档，不冒充父代理另跑了一遍。

首次收尾辅助脚本取得空 Git 输出，整体退出码为 1；`final-audit-check.json` 保留为失败收据，不能当作最终通过。已用正常 shell 核对身份，只修辅助脚本的 Git 可执行路径和输出捕获后补齐报告检查，没有重跑生成、适配或其他已有效行为。

## 确认的问题与修复方案

### F01 — P1：附带引文或局部施法字段问题仍删除完整法术

影响原项：3、5、11、12、13、18、19、25。

**A：Priest 七条明确法术被全部删除。** 原答有两组、七法术、WIS、独立 1/day 和共享 3/day；逐 ref evidence 缺省。provider 将其补为 `[]`，renderer 仍写入，portable validator 报错，parser 按 finding 路径删 ref，再删空组。当前重放仍生成 Actor，但 resolver manifest 不存在。已有四怪 Mirror 记录还确认 0 Cast。基础攻击和 Divine Aid 的 3/day 计数存在，不能写成整只没产物或次数全部消失。

**B：删除范围不止 ref.evidence。** Dust Sleep 只清空已有 restriction 的 evidence，法术身份、规则限制、次数与来源均保持：对照有 1 组／1 ref；变体 Actor flags 变空，manifest 消失。此时“Sleep 说明 Feature 仍在”不能算合同保留。

**B：另一个更早的整组过滤。** 仅从 Dust 的 IR 省略施法 ability，Sleep ref／DC10／1/day 仍在，renderer 却不输出整个组。便携 validator 本身允许 ability 缺省。父代理复用了已保存的 Dust control，只补这个变体，没有重跑 control。

代码：`packages/intake-ai/src/provider.ts:833–834`；`renderer.ts:128–162`；`packages/spell-manifest-contracts/src/validator.ts:122–124,269–325`；`packages/parser/src/yaml.ts:215–248`。删除分支来自 46 整改 `22d0c0941`；逐条非空证据要求更早已存在，不能归因于最近状态修复。

**修复方案：** 明确区分引文／技术记录问题和法术本身缺失；前者只给诊断，不筛掉完整 ref 或组。统一 Monster 入口与下游的缺省契约，技术 ID 由程序重建并同步关联；缺施法属性保留 ref、资源及未完成字段，不猜默认属性。真正有歧义的使用或世界关联单独报告。Item／Species 的独立消费者不能随之整体放宽。

**最小验收：** 原 Priest 7 ref、两分组及资源完整到达 resolver；Dust 无 restriction evidence、无 ability 的变体均仍有 Sleep ref，问题正确显示；保留既有法术正常对照与独立 Item／Species 反例。缺 ability 的候选是否能完成世界可用施法须另核目标契约，不能提前承诺完整可用。

### F02 — P1：执行模式标签把完整操作退成说明，状态还会换错归属

影响原项：2、4、7、9、10、13、14、25。

**B：** Ghoul 冻结 Claw 原有攻击、`1d4+2` 伤害与 CON10 后续豁免。仅将 `executionMode` 从 `native-with-gm` 改为 `gm-manual`，IR 的 sourceOperations 不变。当前完整链从三项活动变为一个 Utility；麻痹／失能由原 Save 的 `onSave:false` 链接变为 Utility 链接。独立局部检查也证实未知非空模式 `bad-mode` 会使完整 OP 不进入 Markdown。

代码：`packages/models/src/sourceInput.ts:234–239` 只给缺省模式补值；`packages/intake-ai/src/renderer.ts:271–282` 只在精确模式下输出 OP／后续豁免；`packages/parser/src/structuredAction.ts:72–73` 的补救已来不及。renderer 门槛为旧 `f637f77f2`，是 46 项没有消除的残留。

**修复方案：** 明确机械字段的传递和投影独立于模式／审阅标签；冲突标签只产生问题。完整 OP 应保持操作、伤害和效果的原归属；真正没有明确机械字段的纯说明仍保留原边界。

**最小验收：** 同一 Ghoul 的正常、缺模式、gm-manual 冲突、未知模式四种表示均保留已明确操作；状态只能绑定到来源对应的失败 Save。其他纯 GM 手工能力不凭标签自动生成攻击。

### F03 — P1：共享资源可因技术 ID 整池丢失；原样多活动成员也漏掉消费

影响原项：5、11、13、14。

**B：** 现有 `tests/fixtures/forge-ordinary-protocol-failures.json` 的 ordinary 冻结协议材料，Force Pulse／Soul Mark 明确共享 3/day。材料为既有控制生物，不当作新增官方怪。原样 normalize→render→parse 得 1 资源／2 消费；仅给 pool 加 `id: shared_pool`，其他内容不变，变成 0 资源／0 消费。

父代理最终 Actor 对照：原控制的 Force Pulse 有 `uses.max=3`、day 恢复及指向资源载体的消费；下划线 ID 变体这些字段全部缺失。renderer 已因共享成员身份抑制成员自己的次数，不能通过其原说明仍有“3/Day”判为保留。

**A，原样冻结控制材料中的另一处实际失败：** 在没有改 pool ID 的同一 control 最终 Actor 中，Soul Mark 主攻击也没有共享消费，辅助 Save 的 targets 为空。它们没有其他 resourceConsumption flags。Actor 的诊断明确写 `must resolve to exactly one source Activity, found 2`，proposal 对应 Soul Mark 的 fixed/amount:1 绑定。因此 control 只能证明池本身存在，不能算两个成员都能正确扣次。

这条根因为 `packages/generation/src/actor.ts:1378` 给 flat attack 增加独立后续 Save，但两个活动只有 sourceLogicalPath，没有 sourceOperation 角色；`actor-resource-semantics.ts:271–290` 找不到主活动标记，落入 `:263–268` 的单活动要求后抛错。`:461–464` 的 catch 把完整消费绑定降为诊断。catch 来自 `22d0c0941`，单活动限制更早已存在。本次直接读取已生成 control 和代码确认，未重跑生成。

代码：`packages/intake-ai/src/source-operation-contract.ts:137,182` 只补缺省 pool ID；`renderer.ts:61–62,166–173,337`；`packages/parser/src/resourceSemantics.ts:25–26,76–80,162–187,311–327`。catch→空列表来自 `22d0c0941`。

**修复方案：** 在外部入口统一分配合法 pool/member ID 并同步关联，原值留诊断。共享池建立与成员次数迁移必须一致；不能先抹成员计数，再允许下游因技术格式删整池。不能简单恢复两套独立 3/day，造成总次数翻倍。

同时为 flat 主攻击和辅助 Save 保留明确的操作角色，让共享资源只由主攻击消费、辅助 Save 不重复消费；不能用“取数组第一个活动”替代角色判断，也不能给两项都扣次。

**最小验收：** 原样及下划线／重复技术 ID 变体仍只有一个共享 3/day 池、正确恢复与两个成员消费；不是只检查有一个 uses 对象。

### F04 — P1：一个坏附带条目仍能阻止整只 Actor 生成

影响原项：1、2、4、12、16、25。

**B：** Dust 的既有 `componentWaivers` 数组前增加一个 `null`，保留原有效条目和全部能力。入口接受数组后未隔离坏成员，renderer `.some(waiver => waiver.component...)` 抛错。父代理全链结果 `candidateAvailable=false`、`CANONICAL_RENDER_FAILED`，而完整输入和回复都已存在。

代码：`packages/intake-ai/src/provider.ts:702–704,817`；`renderer.ts:158`；`packages/forge-browser-runtime/src/ai.ts:566–630`；CLI `packages/intake-ai/src/orchestrator.ts:294`。这是产物产生前的失败，不能由“生成后 catch 会保留 artifact”覆盖，也不能归成 AI 没正常返回。

**修复方案：** 入口按项整理附带列表，坏项保留原记录并报具体问题，合法 waiver 和其他内容继续传递；内部使用确定形状。不在每层重复加防御检查，不用整只文字卡兜底。

**最小验收：** 相同 frozen Dust 的原样／单坏项变体均得到 Actor、Sleep manifest 和原活动；坏项诊断独立，零额外 provider 请求。

### F05 — P2：Reel 的已受束缚前置被误当成本次施加束缚

影响原项：10、14、19、25。

**A：** 原样 Ettercap 重放仍为 Reel Utility 新增 restrained Effect `73eac2116a39eff5`。来源只是把“因其绞网动作陷入束缚的一名生物”拉近；原答没有本动作 appliedConditions。Bite 中毒、Web Strand 束缚在本次原样重放仍保持正确归属。

代码：`packages/generation/src/actor.ts:1322–1324`；`actor-effects.ts:290–318`。gm-manual 进入推断的路径来自 `b2c89eda6`，中文宽匹配来自更早 `950f5e073`，两个层次不能混成一个引入提交。

**修复方案：** 在已有状态提取逻辑内区分施加结果与目标资格／别的动作造成的状态，再建立效果。GM 标记不改变多余效果的错误性质；不能全关状态推断来回避反例。

**最小验收：** 原 Reel 无新增效果；原 Bite、Web Strand 正确；近似的“已处于某状态的目标”句式不能误加；真正施加句式仍生效。

### F06 — P2：原样 Rakshasa 的并列官方状态完全漏生成

影响原项：10、14、19、25。

**A：** 使用 `forge-vulnerability-new-extraction-20261026/browser/rakshasa/case.json` 中未改的 `evidence[0].content` 和 `capture.source`。Baleful Command 明确写目标具有 Frightened 与 Incapacitated，直到罗刹下回合开始；原 IR 一个 Save OP，没有显式状态数组。当前正常草稿→生成入口保留 WIS18、8d6 psychic、30 尺和 recharge5，却得到 Item.effects=[]、Save.effects=[]；没有这两个状态缺失的 finding。

代码：`packages/generation/src/actor-effects.ts:296–297` 只识别单个 `[a-z]+ condition`；调用 `actor.ts:1237–1240`。本例单 OP、proof.save 可定位，不能归因于多 OP 定位失败。

**修复方案：** 在确定的施加结果范围内识别并列官方状态和复数 conditions，共享原结束条件，绑定到同一个失败 Save。与 F05 一起改和验证，避免为修漏识别又扩大误识别。

**最小验收：** 原样罗刹两状态都有、归属同一 Save；换行与单数／复数表达等价；Reel 前置仍无新增状态。这里只证明本地配置缺失，未执行世界施法。

### F07 — P1：替代伤害合并删除了独有状态的 Activity 链接，核对器也跳过它

影响原项：9、10、14、15、19、25。

**C：** 在冻结 Mimic 结构上为替代伤害明确追加“Only the replacement damage makes the target Prone.”及对应 appliedConditions；主分支无该状态。原文件不变。这是构造机制反例，不是声称 Mimic 官方规则含倒地。

当前产物有 Prone Effect `4ee8b866d4411918`，标记 `sourceOperationId=operation-2`，但攻击检定、普通伤害、替代伤害三项活动的 effects 全空。生成不是没保留 Effect 对象，而是保留了无法从所属活动选择的孤立效果。

代码：`packages/models/src/sourceAttackModes.ts:99–100` 的吸收条件未排除独立状态语义；`packages/generation/src/source-attack-modes.ts:14,33–36` 删原 OP 活动并克隆主分支；`packages/intake-ai/src/verifier.ts:913–921` 用同一个合并结果先过滤 absorbedIds，核对前已删掉该 OP，故没有状态缺失 finding。

**修复方案：** 最小保真方案是有独立状态／目标／资源／结果限定的 OP 不参与纯伤害吸收，保留原活动；若继续合并，则明确迁移每个分支的完整状态链接。验证从原 OP 声明取得预期，不能先调用同一损失性变换删掉被验证对象。

**最小验收：** 派生 Prone 仅在替代分支可选，普通分支没有；所有明确状态都有正确引用；原样 Mimic 两伤害分支保持。本次原样 Mimic 已排除 Bite 错加 Grappled 的初始推测。

### F08 — P1：sourceOperations 与标准子活动共存时，已生成的子活动被清空

影响原项：13、14、25。

**C：** 从冻结 Mimic 的规范来源副本为同一动作加入一个明确 DC15／CON 后续 Save 子活动及说明。parser 确实读回 subActions；正常 `buildForgeActorRequest → convertFinalActorSource` 生成后，只剩原攻击检定和两伤害活动，Save 消失，diagnostics=[]。不是官方 Mimic 原规则，也不是手修最终 Actor。

代码：`packages/parser/src/structuredAction.ts:93,233–234` 接受子活动；`packages/generation/src/actor.ts:1160–1163` 递归生成后整体 `activities={}; effects=[]`，只重建 sourceOperations，`:1248` 返回。清空语句为旧 `f637f77f2`；当前解除混合输入拒绝后未把这类组合保全。

**修复方案：** 将独立子活动纳入保留稳定身份的操作列表，或只移除占位活动，保留已生成的独立子活动及效果／资源归属。不整容器清零。

**最小验收：** 同一规范来源的混合表示保留额外 Save、DC、属性和关联；仅 OP、仅子活动的旧行为不变；不得把子活动再复制进每个伤害分支。

### F09 — P2：单成员技术 key 错误仍使完整遭遇包整体不可读

影响原项：5、40、43。

**B：** 真实冻结 `forge46-20261027-macrofail.json` control 正常解码／准备 2 Actor、1 Macro。只把第二成员 key 改成空串，两个完整 Actor 的 hash 均保持，公开 decode 和 prepare 入口却整包抛出 `$.actors[1].key must be a bounded non-empty string`。它发生在成员级 catch 之前，不是世界身份冲突。

代码：`packages/forge-browser-runtime/src/encounterPackage.ts:188–193,243–248`；`encounterPreparation.ts:48`。

**修复方案：** Actor 条目逐成员解码与结算；可重建的技术 key 用程序稳定唯一标识并保留原值。坏成员原记录和诊断可见，其他完整成员继续。涉及该成员的宏绑定歧义只限制对应宏，不放宽宏启动身份校验。

**最小验收：** 原包、空 key、单坏 artifact 三种情况；完整成员 hash 保持，空技术 key 不吞两份完整 Actor，坏 artifact 不吞另一成员。

### F10 — P2：坏固定宏配置在真实 App.apply 前置阶段阻止全部 Actor 导入

影响原项：41、45、46。

**B：** 同一冻结包只改固定宏配置 version 1→2 并重算命令 hash，Actor 字节不变。prepare 仍得到 2 Actor、1 Macro；调用真实 `createForgeEncounterApplicationClass` 的 apply，使用仅计数的内存文档端口，得到 `Unsupported automation parameter value.`，Actor.create=0、Macro.create=0、无 import result。

代码：`foundry-modules/fvtt-json-forge/src/encounterApplication.ts:880–889` 的固定配置解码在逐宏 catch 外；抛出源 `packages/intake-ai/src/encounter-capabilities.ts:95–100`。下层 `encounterRuntime` 的独立结算无法补救入口提前退出。`_prepareContext():110` 的同类展示读取也需检查，但本轮没有把它另记为已动态复现。

**修复方案：** 固定宏配置解码和条件检查纳入逐宏隔离，返回该宏失败，完整 Actor 导入继续。坏宏本身仍不能创建／启动，不放宽命令完整性或绑定要求。

**最小验收：** 调用真实 App 方法，坏宏变体的两个 Actor 仍进入正常创建，坏宏单列失败；宏启动继续拒绝。没有请求本轮实际写入 Mirror。

## 另两项确认的检查与写入边界缺口

### D01 — P2：保存读回比较漏掉资源、免疫、移动和法术清单

对应 34，关联 19。`foundry-modules/fvtt-json-forge/src/runtime.ts:472,569–589` 的比较不包含 system.resources、traits.di/dr/ci、attributes.movement、Resolver spellManifest。Item 及 Effect 的说明、duration 等也有覆盖缺口（`:592–613,693–716`）。

真实 `actorReadbackWarnings` 对冻结 Dust 的内存副本逐项删 di、ci、movement 或 manifest，均返回空 warnings；冻结 Unicorn 删除原 3 传奇动作／3 传奇抗性 resources 也为空。正控删除 Dust 的 dv 则报告三条差异。**这只证明检测漏报，不证明世界真的删过这些内容。**

建议扩展现有语义比较投影，保留锁定版本必要的等价表示；差异仍只报告，不取消／回滚 Actor。验证应逐字段有反例，同时原样副本零提示。

### D02 — P2：宽容解码后的坏来源身份没有在世界写入边界重新核对

对应 20、33。冻结 Ghoul response 只删 sourceIdentity 或改成 bad/bad，真实 decoder 均成功且 artifact hash 不变。`schema.ts:429–447` 容错得到空／坏字符串；`runtime.ts:98–113,156–179` 的创建入口只核目标，随后按该 sourceId 派生文档 ID；`:437–456` 只要求读回等于同一坏值。

**动态证据到 decoder，后续是代码确认；没有调用真实或假 Document.create，不声称世界损失已发生。** 风险是不同无效来源共用派生身份、错误复用或冲突。

建议保持查看／下载宽容，在世界写入入口复用已有 ID/hash 契约核对必要身份；只停对应写入，候选仍可获取。不恢复 accepted 或零 findings 门槛，不增加另一个内容审核系统。

## 46 项逐项审查矩阵

“未见新增问题”仅表示列明路径的静态追踪、既有证据和本轮指定对照未确认另一处问题，不是全部输入／全部世界行为通过。

| 项 | 原检查／门槛 | 当前代码追踪与结论 |
|---|---|---|
| 1 | AI 无正常答复 | provider `233–405`，sourceAnswer 一次接收、空答单列；后续 **F04** 仍使完整回复无新 Actor。旧 Actor 保留另属交付层。 |
| 2 | 外壳／取证数组 | provider `623–733` 容错存在；嵌套 waiver **F04**、执行标签 **F02** 仍越权影响内容。 |
| 3 | 引文／行号／offset | provider `554–605` 和 source binding 对 OP 只诊断；法术 parser **F01** 又按 evidence finding 删能力。 |
| 4 | 根结构／未知字段 | provider、yaml `168–187` 保留未知记录；完整 OP 受 **F02**、局部列表受 **F04** 影响。 |
| 5 | 技术 ID／名称 | sourceInput `210–220` 会重分配 OP ID；法术、资源、包成员身份并未统一，见 **F01/F03/F09**。 |
| 6 | 操作／伤害数量 | sourceInput `21–119`、sourceOperationStructure 未见旧列表截断；现有 14 段断言核公式与数量。未重跑 128+ 压测。 |
| 7 | 公式／类型／范围／治疗／Save | 局部坏字段隔离、未知类型中性处理存在；完整操作仍可能被 **F02** 吞掉。无法解析值只留说明不一概算 bug。 |
| 8 | 引文与伤害逐段配对 | materializeStructuredSourceOperations `1449–1496`、sourceInput `69–71` 未因 proof 缺省删伤害；法术 evidence 问题单列 **F01**。 |
| 9 | 互斥／条件伤害 | sourceInput 独立条件伤害路径保留；模式门槛 **F02** 和合并语义 **F07** 仍有损失。 |
| 10 | 攻击附带状态 | 入口含官方 exhaustion/dead；**F02/F05/F06/F07** 分别出现错归属、错误新增、漏状态、丢链接。 |
| 11 | 法术／次数／资源关联 | **F01/F03** 确认；旧坏别名、空名、坏池测试没有覆盖同一完整能力仅附带记录不合要求的分支。 |
| 12 | renderer 施法／体型 | 体型说明保留路径存在；缺 ability 整组过滤 **F01**、坏 waiver 整只失败 **F04**。未穷举 prepared profile 冲突。 |
| 13 | parser 重复检查／throw | 整只 throw 改局部处理是真实变化，但 spell/resource 的 catch/filter 仍删能力，见 **F01/F03**；混合子活动见 **F08**。 |
| 14 | generator 模式／资源／唯一项 | actor `680–686` 多处转诊断；**F02/F03/F05–F08** 表明局部投影仍有损失／新增。 |
| 15 | neutral/review 与伤害分支 | 原样 Mimic 两分支保留；有独立状态的被吸收 OP **F07** 丢链接，不能推广原样成功。 |
| 16 | 总 catch 吞 artifact | actor `694–709`、generationPipeline、browser index 后置 catch 保留已有对象；**F04** 是对象产生前缺口，不能靠后置 catch 解决。 |
| 17 | 重复生成验证 | 共同 pipeline 一次投影后复用验证；未发现新撤回／重生路径。并不证明验证内容完整。 |
| 18 | 旧 validator／摘要／法术 | singleFileConversion `173–203` 先保存产物，后置异常保留；法术内容缺失 **F01** 另报。 |
| 19 | IR／MD／Actor 保真 | 候选不会因比对结果撤回；**F07** 验证器复用同一损失性合并导致漏报，**F06/D01** 也暴露语义覆盖缺口。 |
| 20 | 内部响应元数据解码 | schema `413–447` 保留 artifact；同时身份宽容没有在写入边界收住，见 **D02**。Item 独立 decoder 未被扩大。 |
| 21 | 状态／诊断严格组合 | accepted/needs_review/failed 均可携带 artifact，未发现重新按状态过滤 Actor。 |
| 22 | AI 复核 | aiReviewPolicy、ai `533–550`、orchestrator `279–332` 当前没有自动 review；本次零新请求。 |
| 23 | 自动纠错／repair 失败 | ai `458–529` 只显式 repair，文本分支不自动调用；UI 失败恢复旧 candidate。没有扩大本轮纠错权限。 |
| 24 | SourceAudit/staged 旧严格链 | provider `229–234` 正式路径未回到历史 staged helper；仅看到旧函数定义不算可达删除证据。 |
| 25 | 删操作／整卡文字兜底 | candidate-delivery 当前只 clone；下游 **F01/F02/F05–F08** 仍可局部丢失或改义，不能以兜底函数移除宣布完成。 |
| 26 | 新工作台生成／下载 | intakeApplication `896–970,1514–1573` 按 artifact 交付，失败保留旧产物；未见额外内容删除。上游缺陷不由此修复。 |
| 27 | plaintext 非 accepted | intakeApplication `978–1000`、plaintext `57–106`、singleFileConversion 保留 response/输出。未得到 canonical source 与已有产物被撤回分开。 |
| 28 | 旧 UI／蓝图门槛 | application、creatureBlueprint 全量 map，无旧 8 项限制；复用 9/600 项证据，未重跑。未见新增内容过滤。 |
| 29 | 环境／连接／长度 | Actor 本地读取、旧回答转换与写入权限分开；旧文件长度门槛移除。Item 保留独立边界。 |
| 30 | 来源／目标／候选身份 | 当前编辑与再分析失败不抹旧 candidate 及其快照；**D02** 是协议缺损身份的另一分支。 |
| 31 | 单 Item 形状否决 | schema `453–455`、runtime 获取条件不再由单 Item 摘要否决；不代表任意损坏 JSON 可在 Foundry 保存。 |
| 32 | Midi／活动／范围／旧法术适配 | 本轮 14 份冻结 Actor 全字段差异仅允许的 Midi/DAE GM 字段，无额外能力删除或 Effect 新增。不是生成保真或世界兼容总通过。 |
| 33 | 世界权限／ID／归属 | GM、目标、source hash 冲突与占用隔离仍在；**D02** 缺损来源身份未在创建前核对。 |
| 34 | 保存内容／身份读回 | 内容差异只 warning，身份冲突单独处理；**D01** 漏检明确能力字段，不能据零 warning 证明完整一致。 |
| 35 | 本地保存失败 | intakeApplication `2220–2235`、recovery `51–71,152–190` 只影响持久化；8MiB 写限制不抹页面产物。真实 IndexedDB 满额仍未验。 |
| 36 | 草稿年龄／契约／重生 | recovery `110–144` 直接 clone v1/v2 artifact，清旧批准不清 candidate；现有冻结草稿是 ready 状态，不能覆盖所有历史失败队列状态。 |
| 37 | 队列状态过滤 | batchQueue 与 runBatch 对当前可用 artifact 逐项结算；旧 needs_review/failed 队列恢复仍有覆盖缺口，未获得合法冻结反例，不列确认损失。 |
| 38 | 发现分区／数量 | 可定位候选继续；无法分开的相交段有诊断及 unassigned 原文。未发现静默删除已生成能力；未跑压力测试。 |
| 39 | 单成员失败提前退出 | encounterIntake `300–378`、orchestrator `187–212` 局部失败继续，resume 无 IR 可保留文本/旧结果；复用既有反例。 |
| 40 | 全员可用才交付包 | 已有成员可组成部分包，但更早的整体 decoder **F09** 仍可吞掉该机会。 |
| 41 | 配套目录／宏／素材 | 多处局部 catch 已存在；真实 App 的宏配置前置 **F10** 又阻断全部 Actor 写入。 |
| 42 | 手工规则／控制覆盖 | 缺覆盖追加问题、过滤对应宏，不改已保存 Actor；staged/manual 效果撤除旧路径尚未建立当前损失反例，见未确认项。 |
| 43 | 打包重生／宏绑定 | 已有 artifact 分支复用，hash 差异提示，旧 source-only 才转换；入口整体解码 **F09** 在这些逻辑之前。 |
| 44 | 翻译失败 | 原 hash 先核；失败保留原语言 artifact，显示投影独立。没有调用翻译，也没有确认新增能力损失。 |
| 45 | 宏／成员全事务回滚 | encounterRuntime `48–137` 按文档独立结算；App 前置 **F10** 在进入下层前整体退出。 |
| 46 | 宏启动检查 | encounterRuntime `194–225` hash/绑定拒绝只停宏、无删 Actor 路径；**F10** 应在导入入口隔离，不能通过放宽启动检查修复。 |

CLI／Web 同时追踪了 `apps/cli/src/main.ts:469–480`、`apps/web/src/server/jobs/jobRunner.ts:130–178,619–677`、`apps/web/src/client/App.tsx:2890–2897`：有输出的 Actor 独立于检查状态登记与下载。未启动 Web 或重跑浏览器。

## 没有升级为确认问题的疑点与保持证据

- 原样冻结 Mimic 当前 Bite 没有新增 Grappled；普通／替代伤害无该错误效果，Pseudopod／Adhesive 保持。初始仅从正则推测的失败已撤回。多 OP 的旧 proof 换行定位失败会抑制这次推断，但不能由此证明所有相似句式安全。
- staged/manual 遭遇 renderer 确有删除内嵌／失败效果声明的旧代码，旧测试甚至期望 0 Effect；当前模板的 `sourceDerivedEmbeddedEffect` 标记又被后续过滤排除。现有 operation-level 冻结状态未证明这个旧分支造成最终官方状态丢失，暂列覆盖缺口，不称确认删除。
- 条件化非官方自定义状态已有 GM 边界；没有建立违反当前支持约定的冻结反例，不把自定义状态都按官方状态处理。
- 官方 exhaustion 已在当前入口允许集合中；旧测试的预期文字不足以证明当前仍删除力竭。未为了旧断言重跑无关矩阵。
- 有些历史 normalizer 只有定义、未进入正式路径；不能搜到 delete/filter 就报可触发损失。
- 14 份适配器审计均未变更输入。前十份是旧 46 批冻结产物，后四份是最新四怪产物；当前 adapter 仅添加明确的 Midi 防重复链、GM 效果关闭和 DAE dontApply 字段。Reel 错效果由上游带入，Priest 法术已在上游缺失。

## 建议修复顺序与结束条件

以下为本次审查提出的方案，**尚未执行**：

1. 先修共同内容链 **F01–F04**：附带记录与技术标识只影响诊断；已明确 OP、法术和资源保留。入口整理一次，不在各层反复防御；不扩大 Item／Species 的宽容边界。
2. 合并处理状态语义 **F05/F06**，同时修活动所有权 **F07/F08**。所有效果都对照所属操作、失败条件及分支；验证预期不复用会删除被核对对象的变换。
3. 修配套入口 **F09/F10**：逐成员、逐宏结算。保留真实世界身份、宏命令与绑定检查；内容可获取与写入成功分开。
4. 补 **D01/D02** 的现有检查出口。读回差异只报告；身份仅限制相应世界写入。不要增加新的模型复核、整只内容否决权或全面流程平台。

每项只跑对应反例、必要正控和实际受影响的共同链；后续若批准实现，再补受影响的真实导入／配置读取，复用仍有效的旧证据。没有新模型预算，不靠扩大付费样本碰运气，不以局部测试全绿宣布 46 项所有输入均无损。

本报告不改写旧通过事实，也不延续已撤回的“46 项整体已修好”保证。当前可以确认的是上列具体缺陷、反例和审查覆盖；修复、世界接受与发布均未完成。

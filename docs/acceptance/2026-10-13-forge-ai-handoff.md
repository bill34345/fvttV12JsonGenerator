# Forge 配套配置减负与完整正文引文修复

任务于2026-10-12开始，2026-10-13继续。**最终为PARTIAL：配置阶段已在唯一一次同源全新生成中通过，配置模型请求为0；完整中文流程仍FAIL，因校验器把原文骰式的乘号x误认作未翻译英文。失败后已停止产品修改和模型调用，未安装、导入或刷新。** 用户约束保持：完整校验，付费AI审核关闭；成功才导入刷新，失败停；不commit/merge/push。

## 本次范围

- 完整规则正文可以不含标题/编号，但仍须原文中唯一、属于同一能力的精确字节引文，且规则全文、DC、属性、距离、方向完整。缺文与冲突继续拦截。
- 配套配置模型使用完整原文、能力引用和紧凑原生事实，工具补齐ID、载体、完整引文、固定入口及通用显示文案；新模型提案v3扩展回既有v2配置，持久包/固定宏格式不变。旧v2仍走原严格编译，坏v3不回退冒充v2。
- 来源已证明的普通推离若是单Actor唯一配套要求，且确定性来源核验、原生数据和GM标记均匹配，可由工具生成同一gm-manual配置，不调用配置模型。施法、资源、阶段效果、已识别自动触发/其他要求、反馈及多Actor不走该省请求分支；完整编译、准备及GM确认仍必需。
- 编译拒绝有安全诊断code/path和可选有界脱敏提案回调；坏JSON也能保留脱敏正文。不会把headers、服务原始信封或隐藏推理保存为证据。保留一次既有数据纠正；unresolved直接待审，传输错误不触发配置纠正。

## 回归、复核与量测

新IR fixture来自上轮首次失败result SHA256 9a44cd15969c8340a05ee531000d5ae3b5c6487cf42579139f4c44aab06f3b33，未改数据；与原Gazer失败fixture共同保留。完整正文引文先RED，随后有标题/无标题通过，缺文/冲突/错能力/错Actor/非manual/缺宏覆盖仍拦截。

独立只读审查发现并修正：外部prior丢失、前缀相似引用1/10误替换、施法载体遗漏、41条手工规则超出全局步骤上限，以及坏v2载体阻止既有一次纠正。对应mock与正式编译回归通过；复核未发现剩余阻断。这是代码审查，不代替真实模型或浏览器证据。

- 配置/推离定点最终20项、190断言通过；其中compact组14项覆盖零调用正例、原生漂移/来源冲突、自动能力保留、引用/跨Actor拒绝、脱敏、坏JSON、prior、施法与容量。
- Forge含GM手工组558 PASS；战斗包组541 PASS。最终显示标题文案调整后复验受影响20项，不重复无关矩阵。
- package/全仓类型、1321模块/3142依赖与循环检查、5个产品文件anti-overfit、Forge构建通过。
- 保存的新IR经完整公开Intake→render→workflow→prepare离线重放，模型调用0，得到ready_for_gm_review。verify:actor通过且warnings/sourceIntegrityErrors为空；verify:intake仍以ACTOR_FORCED_MOVEMENT_REQUIRES_GM返回needs_review/退出2，明确保留GM处理边界。
- 请求组装只用本地fake transport量测：完整来源保留，配套user content由38,004降到4,434字符（88.33%）；system content为9,350字符。此数字是字符量，不是token、费用或速度提升。真实模型的效果另记。
- 手册六个受影响条目已人工核对并重建，handbook:check通过。

候选JS SHA256：88642c9c214deeea86b7895096ddb38416e7c3125aaa959ab261557912c37441。

原文仍为Beholders.pdf第4页Gazer CR1/2完整资料块，1732 UTF-16字符，SHA256 a9c9cfc009ee19152ab64755bbda600628eabc3add772f32ecbad05a174b9a9b。源文、PDF页及旧失败身份沿用[PDF对照](2026-10-12-forge-gazer-pdf-control.md)。任务证据位于.local/forge-ai-handoff-20261012；复用旧原文只用于保持同源，本批fresh不会读取保存IR、译文、配置或人工修正。

## 唯一全新生成

2026-10-13北京时间00:23:56开始，00:25:51结束；流程耗时114.982秒。使用同一完整Gazer原文，deepseek-flash / reasoning low / json_object；本批外层提交1次，不读取旧IR、译文、配置或人工修正。产品既有的一次IR修复属于本次流程内调用，单独计数，没有用第二次外层提交凑通过。

| 阶段 | 实际模型HTTP次数 | 请求耗时 | 首次结果 |
| --- | ---: | ---: | --- |
| 提取 | 1 | 24.754秒 | needs_review；MOD SAVE表头被列为mechanical但claimPaths为空 |
| 既有IR修复 | 1 | 18.269秒 | 随后通过来源门禁并进入配置 |
| 配套配置 | 0 | 程序阶段6毫秒 | 来源证明的Force Ray推离由工具构造gm-manual，经原严格编译通过 |
| 中文标题 | 1 | 21.949秒 | 返回结果，继续正文 |
| 中文正文 | 1 | 49.770秒 | 三个字段因骰式x被中文残留检查拒绝 |
| 付费AI审核 | 0 | 未执行 | reviewPolicy=deferred，禁用审核调用；意外审核尝试0 |

合计4次模型HTTP，均为200；耗时是本次实测，不构成一般速度或成功率保证。本批配置拒绝0次；新增拒绝证据回调已接入，但此批没有真实配置拒绝可供检查，其拒绝/脱敏行为依据本地回归。

原语言prepared包存在、外层report.status=ready_for_gm_review，但hasChineseDraft=false，31个中文字段仅以待审draft保留。**外层状态不能解释为中文生成或验收通过；encounter-package.json也是原语言准备包，不用于本轮导入。** 真实Force Ray Item保留STR/DC12原生Save及完整推离正文，另有GM手动活动，effects为空；共7个Item。此处是文件数据读回，尚非Foundry运行时结果。

## 本次失败的精确原因

保存的三个拒绝字段分别为Force Ray的HTML描述、Save聊天正文和GM手动说明：

- text-79b7eeb39bcf2aa085436a6a
- text-0b6777a266e749a6fec523ca
- text-c0f9cd2641825bdde8e3486c

源文是“pushed 25 (1d10 x 5) feet away from the gazer.”，对应译文保留“目标被推离凝视者25（1d10 x 5）尺”。三处来源与译文的公式序列逐项相同，第三处各包含两次公式；所有x都位于原文已有的乘法表达式。没有为复现替换x、手改译文或构造一个能通过的新候选。

packages/contracts/src/localization.ts第192—197行先核数字/骰式token及标记，第199行移除骰式和允许的缩写，第200行拒绝其余ASCII字母。当前骰式正则处理加减但未纳入乘法x，因此移除1d10后剩余x被当作英文。对保存的整份request/draft和三个原样字段再次调用现有validateLocalizationDraft，稳定复现相同拒绝；0网络，原result/summary/IR的SHA未变。

**已确认结论：这三个字段存在工具校验误拦截，不能归因于模型遗漏翻译x。** 这不证明全部31字段语义均正确，也不证明放过x后完整生成必然成功；未完成的其余语义/包级/原生验收继续保持未验证。当前校验器在本次修复范围外，失败后未修改。

首次提取仍依赖一次内置修复。原first-analysis明确保存coverage[6]的quote为`MOD SAVE MOD SAVE MOD SAVE\n`、classification=mechanical、claimPaths=[]，失败码UNCLAIMED_MECHANICAL_COVERAGE；不能把本次称作提取零修复成功。它与本次最后的x阻断是两个阶段的问题。

## 已证明的收益与剩余边界

- 完整正文引文误拒绝已修复，并有正反回归；旧批两次实际配置失败的具体字段仍因当时证据缺失而UNKNOWN，不用本轮结果改写历史根因。
- 本例由程序承担确定性GM配置的分支已获真实全新生成证据：配置HTTP为0，严格编译通过；没有把STR/DC12降为文字或自动执行推离。
- 紧凑请求从38,004降到4,434字符属于离线请求量测。本例真实运行跳过配置模型，尚未验证真实模型对新v3提案的成功率，不能把mock或零调用分支当作该结论。
- 仍待处理：本次骰式乘法记号误拦截、首次提取表头修复依赖、此前海鬼婆包级规则编号残留。后两项不是本次扩修范围；海渴症食物留存专项的既有通过证据不受本次失败影响。
- 下一项最小修复候选为：用本次三份原样译文补回归，只在与来源逐项匹配的完整骰式内识别乘法记号；真实英文残留、数值/运算符变化、缺文和冲突仍须拦截。这是后续建议，本轮未实现，未启动再次生成。

## 收尾与证据

冻结的202个产品源码在生成及收尾时均未变；候选JS仍为88642c9c214deeea86b7895096ddb38416e7c3125aaa959ab261557912c37441。89个既有dirty/untracked基线路径中，本次修改11个已授权路径，另78个保持；新增/新修改的6个路径均在本次实现、测试、fixture和报告范围。实现HEAD仍f79c25fbac747a7e08f98c48779f052c3db68599；主工作区HEAD仍3734eb2de0b19b0f3d4cfb38bd1e0c8478635281且仅保留原有`.omo/`未跟踪目录。详见收尾记录。

失败后仅做原样validator读回、证据身份检查与报告收尾。未续译、未再次生成、未改候选、未安装Lab、未派发Chrome、未导入或刷新；未commit/merge/push。旧候选原生验收不能替代本候选的NOT_EXECUTED。

| 原件 | SHA-256 |
| --- | --- |
| 本次summary.json | 8709a316b592b1fa2eb01b932604f82f879e0dd4f436986a4a29b541f40459a4 |
| 本次result.json | af9455b6d6bf9787a178a7f3e576805255ed917c57a5e7c01f8b5ec90de4c15b |
| 失败原样复现failure-analysis.json | f4cc9c52374017d6f8653879bb23dd35319928e1588907504f90734ef7f53c9d |
| first-analysis.json | 8193806d87661d9bf5259d0b31b6fbc477d8e243c5b94afc0b290b32c5ff4eb1 |
| fresh-extracted-ir.json | 027a9a8100c360b1d3b1f4bbe3ef62008a956cb88ff82167933a1a81109c9b0f |

- [本次首次结果](../../.local/forge-ai-handoff-20261012/fresh-attempt-1/summary.json)
- [完整原始结果与31字段待审译文](../../.local/forge-ai-handoff-20261012/fresh-attempt-1/result.json)
- [三个失败字段、生产validator复现及阶段判定](../../.local/forge-ai-handoff-20261012/fresh-attempt-1/failure-analysis.json)
- [冻结身份与检查日志哈希](../../.local/forge-ai-handoff-20261012/freeze.json)
- [收尾边界](../../.local/forge-ai-handoff-20261012/closure.json)

# Forge 最小复现、单点修复与剩余失败：当前完整报告

最后更新：2026-10-13（Asia/Shanghai）。本报告合并原复盘、后续限定修复和各批首次结果。**最新批次为新PDF首怪Mezzoloth Sellblade CR5：193.876秒、4次模型请求，英文准备包生成，中文固定状态标题“被擒抱”与术语要求“受擒”不一致而FAIL；icon为3项明确匹配、1项部分匹配、3项默认回退。另有Abyssal语言代码静态错误。失败后停止，未安装、导入或刷新。** 前批Gazer配置减负的通过证据保留，骰式x问题未修；以下各旧批次只描述其历史时点。

## 新PDF第一只怪物与icon（2026-10-13 00:57批次）

用户要求从Better Monsters找近期新PDF并试其中第一只，明确强调icon。选择作者2026-08-26《Ecology of the Yugbugs》帖的首份公开附件Mezzoloths.pdf；4页，PDF元数据创建时间2026-08-25，不宣称它是整个站点绝对最新。下载后渲染目视确认第一只statblock是第2页左栏Mezzoloth Sellblade CR5，完整原生提取2085字符，没有挑简单怪替换。

本轮不改产品，用当前88642c9c…构建仅提交一次全新来源，不复用IR、译文、配置或人工修正。提取1次、既有IR修复1次、翻译2次，共4次HTTP、193.876秒；付费审核/配置0。修复后的英文7Item/7Activity包来源核验accepted，但最终27字段中文中固定状态标题未使用受擒，整体hasChineseDraft=false；未将外层ready_for_gm_review记为完整中文通过。

原样validator复现与代码对照确认：生成器给出的源标题就是“被擒抱 (Grappled)”，待审译稿保留“被擒抱”，而共用术语表要求“受擒”；相关正文已使用受擒。另发现已生成语言value保留大写Abyssal，锁定dnd5e5.3.3配置要求小写abyssal且标签按key精确匹配；属于静态代码/产物证据，未宣称已做真实UI复现。

icon实际safe模式，7Item和7Activity均有catalog路径，文件存在且对应图标一致。多重攻击/爪击/毒雾目视匹配，倒刺只匹配暗蚀部分；魔抗/撕裂/黑暗传送仍feature.svg默认图。不能报“全图标完成”；因中文失败未做HTTP/原生导入刷新。所有新旧问题保留，未扩修，master未变。

[新PDF完整报告](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/acceptance/2026-10-13-forge-mezzoloth-first-pdf.md) · [首次summary](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-bettermonsters-newpdf-20261013/fresh-attempt-1/summary.json) · [失败与icon证据](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-bettermonsters-newpdf-20261013/fresh-attempt-1/failure-analysis.json)。

## 配置减负实施与本批唯一全新结果（2026-10-13 00:25批次）

本次完成三项限定修改：完整规则正文可以不含标题编号但须完整且唯一绑定原文；模型配置输入改为完整原文加紧凑原生事实，工具组装ID/载体/完整引文；纯来源证明的单Actor GM推离由工具生成配置。缺文、冲突、错能力和未知要求继续拦截，原生Save及严格编译保留。编译失败另能保留有界脱敏提案与具体诊断。

定点最终20项/190断言通过；Forge含GM手工558项、战斗包541项通过，类型、架构、anti-overfit、构建、verify:actor和手册通过，独立只读审查发现的5项兼容风险均修正并补回归。离线配套user content由38,004降至4,434字符；这是88.33%的字符缩减，未测得相同比例的token、成本或速度变化。

同一Gazer 1732字符原文提交一次，不复用IR、译文、配置或人工修正。实际4次HTTP：提取24.754秒、既有IR修复18.269秒、中文标题21.949秒、中文正文49.770秒；总114.982秒，付费审核0。首次提取将MOD SAVE表头标为mechanical且claimPaths为空，仍依赖一次内置修复。配置由工具构造并通过，HTTP为0；原语言7个Item准备包生成，Force Ray仍有STR/DC12原生Save与GM手动推离。

最终中文draft没有完成。三个字段原文和译文都保留`1d10 x 5`，现有中文残留正则移除`1d10`却留下`x`。对原样保存request/draft及三个字段调用生产validator，0网络稳定复现；确认是这些字段的校验误拦截，不能归因“模型没翻译x”。外层ready_for_gm_review只表示原语言包可供GM看，不能记为完整中文通过。

本次没有在失败后继续修x、重试模型或操作Foundry。当前剩余为：来源骰式乘法记号的有限识别、表头提取仍需修复，以及前批海鬼婆包级编号残留；未把后两项拉入本轮。新紧凑提案的实际模型成功率仍未验证，因为此次真实分支没有调用配置模型。旧两份配置失败的精确字段仍UNKNOWN。

[本次完整报告](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/acceptance/2026-10-13-forge-ai-handoff.md) · [首次summary](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-ai-handoff-20261012/fresh-attempt-1/summary.json) · [原样失败复现](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-ai-handoff-20261012/fresh-attempt-1/failure-analysis.json)。候选JS88642c9c214deeea86b7895096ddb38416e7c3125aaa959ab261557912c37441，202个产品文件冻结未变，78个无关既有路径保持，未commit/merge/push。

## Gazer 推离单点处理与全新结果（2026-10-12 19:59历史批次）

保存的失败 IR 原样补 fixture，红测复现 Save literal-only 阻断。新增完整来源证明与 GM 准备/最终核源衔接，保留 STR/DC12 原生 Save；推离不自动执行。5 项新回归/100 断言通过，Forge 含旧 GM manual 共543项、战斗包541项通过；类型、依赖、anti-overfit、构建、verify:actor 和手册一致性通过。测试绿色仅覆盖记录中的形态。

同一1732字符原文全新生成一次，不带旧 IR、译文、配置或人工修正：117.777秒、3次请求（提取1、配套配置1、流程内置配置纠正1），IR修复0、翻译0、付费审核0。全新IR直接通过来源校验，Force Ray 已给出 ACTOR_FORCED_MOVEMENT_REQUIRES_GM 并进入配置；两次配置均被来源绑定编译拒绝，最终 needs_review，无 prepared/中文草稿。失败后没有再提交、安装、Chrome派发、导入或刷新。

**确定的剩余缺陷**：离线编译探针确认，去掉编号/能力标题后的完整规则正文仍是唯一精确原文、仍在同一能力证据内，Save/推离全部保留，但被新 quote 相等 guard 拒绝；含标题的完整引文通过。当前候选引文边界还过严，因此单点处理不能标记完全完成。

**本次实际配置失败的具体字段仍 UNKNOWN**：原报告只保存通用编译 finding，没有保留两份被拒绝的模型配置或具体底层 TypeError。不能用上述独立反例推定模型恰好输出了这种引文，也不能归因网络或模型质量。该证据保留缺口已明确记录。

本轮按“失败就停”保留候选，不继续产品修改。后续最小处理是补有效完整正文引文回归、校正来源范围等价判断，并保存脱敏的编译拒绝字段/配置，再根据真实失败限定修复。原文唯一位置、完整正文、DC/属性/距离/方向及冲突检查继续保留。

[本轮完整记录](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/acceptance/2026-10-12-forge-gazer-forced-movement.md) · [首次结果](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-gazer-push-20261012/fresh-attempt-1/summary.json) · [引文反例](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-gazer-push-20261012/quote-boundary-diagnosis.json)。候选JS为bb0f14d17a278f9d7f4d3547fb29b0b7487fd2c40c6cff638142c73f5a34b1f8，200个产品源码在运行及收尾时未变。75个无关既有路径保持，master与实现HEAD未变，无commit/merge/push。

## 眼魔PDF对照（17:28历史批次）

用户要求换一个怪物测试。选原Beholders.pdf第4页Gazer CR1/2完整statblock，渲染目视对照后原生提取，保留2特性/随机两条不重复射线/4种射线，产品代码不变。输入准备曾因Windows换行与收据hash不一致在模型调用前拒绝，修正仅涉及输入LF记录，0模型；该前置失败独立保留。

真实原文提交只有一次：90.715秒、2次HTTP（提取1、原有IR修复1）。IR修复解决了MOD SAVE表头的空claimPaths，之后已经生成7个Item的Actor结构草稿，Intake来源比较accepted；正式语义门禁因Force Ray失败后推离25(1d10×5)尺为literal-only而needs_review，尚未进入配套配置或翻译。已将原mechanic ID对应到actor/structuredActions/动作/4/save，确认STR/DC12 Save存在、推离仍为文字后果。

结果暴露了手动后果进入GM准备的衔接边界，不能仅按CR高低解释生成成败。本轮没有修产品、改候选、换第二只重试、安装或导入，付费审核0。详见[Gazer对照记录](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/acceptance/2026-10-12-forge-gazer-pdf-control.md)。

## 最新食物留存修复（16:44批次）

根因已经核实：之前只修过候选正文，没有把keep food down的含义纳入通用校验与回归；原validator主要检查数字、HTML、中文和术语，关键规则保护也不覆盖此句。本次实际HTML还把keep solid food与down分开，单段匹配不足。

现在共用译文入口对明确来源核对“固体食物不吐出＋海水必要条件”，覆盖草稿/续跑/批准/读回；原数值、标记和英文残留检查保持。最新原始坏译文作为fixture未改，8项目标检查纳入44项本地化组；542项Forge/保护、类型、架构、anti-overfit、构建和33项手册检查通过。检查范围有限，不宣称全部自然语言语义已经自动验证。

唯一一次全新提交465.226秒、9次HTTP（提取1、原有IR修复1、配置1、翻译6），审核0。角色76字段draft_ready；海渴句实际返回“它只有用海水送服，吃下的固体食物才不会吐出”，通过共用validator，无人工改稿。

最终包级说明含5个sea-hag-auntie-…-manual编号。显示映射只识别rule id <编号>，本次英文生成采用gm-manual rule <编号>，因此原有中文检查正确阻断。已核5个编号存在于本次配置，尚未修这一显示入口。整份中文草稿未完成，按约定停止；无额外重试、安装/导入/刷新或master合并。

详见[本轮原因、修复、首次结果与停止证据](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/acceptance/2026-10-12-forge-food-retention.md)、[首次summary](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-food-retention-20261012/fresh-attempt-1/summary.json)。下面16:06及第1—9节保留历史时点，当前剩余阻断以上述16:44批次为准。

## 上一轮续修结果（16:06批次，历史）

用户批准上一版方案后，已修复完整复合属性、原文数字单位连字符断行和引用边界空白的有限来源表示，补齐安全修复诊断。原生单属性、原始引文和缺文/冲突校验保持。30项定点/诊断、525项Forge整合、50项来源/手动表示定向、541项Intake检查通过；各组有交集。类型、架构、anti-overfit、构建及33项手册检查通过。

唯一一次同源全新提交：391.523秒，8次HTTP（提取1、原有自动修复1、配置1、翻译5），审核0。提取又给出缩写int or wis，经原有一次自动修复才通过，不能称零修复首次成功。正式英文候选的Seed Terror为3个Utility、0个Save/自动Effect；新中文保留由目标选择INT/WIS、DC15、范围、时长及结束豁免。

停止原因是海渴症将keep solid food down译成“咽下固体食物”，把吃后能留住、不吐出改成吞咽能力。程序ready_for_gm_review未改写为成功接受；原始结果完整保留，独立核源记录FAIL。没有修译文、第二次提交、中文批准、安装、导入或刷新。新JS f0bff6ac178165cd01921643926ee23163ee7b86518c4314572da458a3a94da3留在工作树；Lab仍是旧ee6dd6…，未commit/merge/push。

当前剩余：本次明确的海渴症译义错误及一般关键译义保证；缩写IR仍依赖这次已成功的有限自动修复；上一轮repair无效响应的历史具体原因仍UNKNOWN。没有在本轮失败后扩大修复范围。

详见[本轮实现、首次结果和停止证据](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/acceptance/2026-10-12-forge-target-choice-format.md)、[首次summary](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-format-20261012/fresh-attempt-1/summary.json)、[核源失败原件](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-format-20261012/fresh-attempt-1/semantic-review.json)。

以下第1—9节保留本轮实施前的完整证据快照，描述的是15:59提交前的状态；其中“尚未修复”的三种结构/排版/诊断待办应以上述最新续修结果为准。历史记录不覆盖新的失败，也不替代最新候选的原生验收。

## 1. “已经处理好了吗”的准确答案

| 要求 | 当前判定 | 已有证据和不能越过的边界 |
| --- | --- | --- |
| 保存的旧失败输入能够最小复现 | VERIFIED | 原始 IR 及来源固定，公开分析入口先获得失败，再修复；没有靠修改失败输入消除问题 |
| 旧形态：完整目标自选规则被模型标为歧义 | VERIFIED，限定形态已修复 | 正式生成得到 Utility/GM 处理，保留完整规则，不擅选 INT 或 WIS |
| 新形态：Save 对象存在但缺 ability | VERIFIED，前置校验与来源转换已修复 | 新 fixture 与前次 result 中的来源、IR 逐字段相等；原生 Save 缺属性直接拒绝，来源充分的目标自选规则可走手动表示 |
| 判断不依赖模型的错误码 | VERIFIED，限定来源条件 | 错误码变化、完全没有 uncertainty 的用例均通过；已有冲突不被擦除 |
| 缺文、缺选择者、错误证据、冲突继续阻断 | VERIFIED，已有反例范围 | 21 项定点测试包括上述反例和普通单属性 Save；不能由此推广成任意自然语言均已覆盖 |
| 实际导入和刷新 | VERIFIED，仅旧候选 | 旧构建 ee6dd6… 完成一次正常导入、一次刷新和精确清理；没有新模型提取或新中文翻译 |
| 最新构建的同源全新生成 | **FAIL** | 164.551 秒，2 次模型 HTTP，needs_review，无完整候选、无中文草稿 |
| 最新候选的导入与刷新 | **NOT_EXECUTED** | 全新生成失败后按要求停止；最新构建没有安装到 Lab |
| 一般首次成功率、未见来源可靠性 | **UNKNOWN** | 两次全新尝试使用不同代码版本，不能合并成某个固定版本的稳定成功率 |

因此，可以确认“两个已保存失败形态的定点修复通过”；不能确认“目标自选 INT/WIS 的全新生成问题已经全部解决”。若将前者的完成措辞理解成后者，就是范围说大了，应以这里的限定结论纠正。

## 2. 三种 IR 形态与实际结果

同一来源为 4314 个 UTF-16 字符的海鬼婆原文，包含 Hag Debts 与 Merthirst 定义。原文 SHA-256 为 `0960bd91a4d3704371324d4cfa1e24c010a80f2a2afcc6b41032818cedc326c1`。这三种结构表达的目标规则相同，但当前实现对它们的覆盖不同。

| 输入形态 | 关键内容 | 原失败层位 | 当前状态 |
| --- | --- | --- | --- |
| 最早保存 IR | activityType=save；没有 save 对象；有 AMBIGUOUS_SAVE_ABILITY，候选 int/wis，blocking=true | 原文确定的手动机制被当成真实歧义，提前阻断 | 已有 fixture 回归、正式入口检查和旧候选原生验收 |
| 第一次全新生成 IR | save={dc:15, condition:…}，没有 ability；uncertainties 为空；根 claim 保留证据 | 缺字段通过初始校验，投影出现 ability=["undefined"]，到后置 verifier 才拒绝 | 已补新 fixture、前置字段校验和按来源识别，离线正式入口通过 |
| 修复后的再次全新 IR | save={dc:15, ability:"intelligence or wisdom"}；另有排版和证据范围差异 | 前置校验拒绝非法原生枚举；来源转换未接受该形态；自动修复响应校验失败 | **尚未修复；首次结果保留，停止** |

第一次修复依赖了模型特定错误码及旧 IR 形态，覆盖不足。第二次去掉该依赖，并补齐缺字段检查，但来源等价判定和可转换的 Save 形态仍然过窄。这是本地代码与保存输入能支持的结论，不需要用“模型随机性”代替解释。

### 两次全新生成计量

| 批次 | 北京时间 | 流程耗时 | 实际请求 | 首次结果 |
| --- | --- | ---: | --- | --- |
| 旧候选修复后，第一次同源全新生成 | 14:28:28.941–14:30:29.414 | 120.473 秒 | 提取 1 次 / 93.051 秒；流程内自动修复 1 次 / 27.199 秒 | ACTOR_SAVE_ABILITY_DRIFT，无 prepared，无中文草稿 |
| 新 IR 回归及前置校验修复后，第二批同源全新生成 | 15:09:44.942–15:12:29.494 | 164.551 秒 | 提取 1 次 / 94.298 秒；流程内自动修复 1 次 / 70.189 秒 | INVALID_FEATURE_SAVE_ABILITY、SOURCE_TARGET_CHOICE_UNVERIFIED、REPAIR_INVALID_RESPONSE |

每批均为一次原文提交，含产品原有的一次有限自动修复；没有外层重复提交、旧 IR、旧译文、缓存配置或人工内容修正。两批共 4 次生成相关 HTTP，配套配置、翻译与付费 AI 审核均为 0 次。生成模型请求与付费审核是不同阶段，不能把“审核 0 次”说成“模型调用 0 次”。

两批都失败后停止，没有为得到通过而继续提交。耗时仅为生成流程，不含开发、测试、浏览器或报告时间；停在不同阶段的时间不能直接解释为性能变化。

证据：[第一次全新结果](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-sea-hag-fresh-20261012/attempt-1/summary.json)、[第二批全新结果](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-source-20261012/fresh-attempt-1/summary.json)。

## 3. 最新失败：已经证明什么，尚不知道什么

### 3.1 来源等价检查误拒绝了已观察到的排版变化

本次重新读取第一分析结果与原文，确认：

- 根 claim 为 [1569,1856)，coverage 为 [1569,1857)，两者各自的 quote 都精确匹配原始来源。
- 多出的一个字符只有末尾换行。
- 原文的 `15-\nfoot` 在能力正文中被合并为 `15-foot`。
- 只合并这一处连字符断行，再折叠普通空白，能力正文与完整来源引文相等。

因此，这个 SOURCE_TARGET_CHOICE_UNVERIFIED **不能被解释成已经发现规则缺文或语义冲突**。当前实现同时要求范围完全相同、正文折叠空白后完全相同，尚未表达这些排版等价关系。原始 quote/offset 的真实性仍然应严格检查；需要修复的是允许哪些可证明的格式等价。

代码：[来源完整性条件](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/packages/intake-ai/src/source-facts.ts:99)。原件：[first-analysis](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-source-20261012/fresh-attempt-1/first-analysis.json)；分析：[failure-analysis](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-source-20261012/fresh-attempt-1/failure-analysis.json)。

### 3.2 多属性字符串不能作为原生单属性 Save，但仍需识别其手动表示

`"intelligence or wisdom"` 不在原生字段允许的六个单属性枚举中，前置 INVALID_FEATURE_SAVE_ABILITY 拦截正确，已经防止了上一轮非法结构继续投影。

与此同时，来源已明确是“由目标选择 INT/WIS”。当前转换只接纳无 Save 或缺 ability 的有限形态；已经填入这个复合字符串的形态没有被覆盖。不能为了通过，把原生枚举放宽为任意字符串，也不能擅自选其中一个属性。

观察到的本次流程先被来源完整性条件拒绝。根据后续代码条件，即使修好上述排版等价，当前复合字符串也不会满足 incompleteChoiceSave；这是**代码推导**，不是已经另跑模型证明“只改排版之后”的结果。两处应分开补回归，不能保证仅修改空白比较就会打通全链。

代码：[有限 Save 转换条件](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/packages/intake-ai/src/source-facts.ts:125)、[前置 Save 属性校验](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/packages/intake-ai/src/validator.ts:245)。

### 3.3 自动修复失败可确认，精确 schema 缺陷仍为 UNKNOWN

第二个请求返回 HTTP 200、finish_reason=stop，但 provider 报 invalid_response / REPAIR_INVALID_RESPONSE。repairCount 为 1，最终 creature 与第一分析中的 creature 完全相等，没有成功应用新的 IR。

原始修复响应没有保存，现有记录不能区分 JSON 解析错误、补丁结构错误、字段缺失或其他 schema 失败。不能根据正文长度 18424 字符推断返回了什么，也不能把 HTTP 200 当作有效业务响应。

这是一个实际的诊断证据缺口。当前能做的正确判断是“修复未生效且原因尚未精确定位”，而不是提高重试次数或再发一遍请求补猜测。

## 4. 剩余处理项与建议次序

以下是待办方案，不是本次已经执行的修复，也不是新一轮模型调用授权。优先继续完成同一个目标选择问题，不扩成整体生成器重构。

| 次序 | 待处理项 | 建议的最小动作 | 完成证据 |
| --- | --- | --- | --- |
| 1 | 最新第三种 IR 尚无持久回归 | 从已保存的新原件提取 fixture，不手改原始 IR；先在公开入口得到同一失败 | 保存来源、IR、首个失败和文件身份 |
| 2 | 连字符断行与边界空白误阻断 | 只对可追溯回原文的限定排版等价建立比较；原始 quote/offset 仍精确核对 | 最新正文及多一个尾换行通过；删句、改否定、改选择者、改 DC、跨能力串证仍失败 |
| 3 | 已填复合属性字符串未进入手动表示 | 根据完整原文及冲突检查识别确切的目标选择；输出 Utility/GM 规则，不放宽原生 Save 枚举 | 三种 IR 都得到相同含义；真实单属性/不同 DC/字段 claim 冲突不能被清除；普通单属性 Save 保持原生 |
| 4 | repair invalid_response 无法细分 | 在现有错误出口保留安全的解析阶段、schema 字段路径及结构摘要；不收集凭据、隐藏推理或全部未脱敏响应 | 离线错误样本能区分失败阶段；若修复响应再失败，可直接定位，不追加重试 |
| 5 | 最新版本完整出口未验收 | 相关离线检查通过后冻结代码；按授权的一次同源全新提交规则，完整候选核源合格才导入、刷新 | 同一新来源生成链、首次结果、调用次数、中文关键规则与最新构建原生读回都对应同一候选；失败立即停 |

第 4 项是为了能解释既有自动修复失败，不应变成新建通用诊断平台的前置工程；也不能还原本次没有保存的历史响应。第 5 项目前未执行，不应先安装旧内容或用人工改好的候选替代新鲜结果。

付费 AI 审核保持关闭，不增加审核模型，不提高重试次数，不合并 master。原始复盘中“更多未见来源、多次测量”的建议属于更远的可靠性评估，**不纳入这轮单点修复**。

## 5. 原复盘中的其他问题现在是什么状态

这里列的是已识别问题的处理范围，不能把“曾修好一个样本”写成“所有同类问题都已关闭”。

| 问题 | 已有处理 / 证据 | 当前判断 |
| --- | --- | --- |
| Hag Debts、Merthirst 被提取遗漏 | 按精确来源保留引用定义；第一次全新结果中两定义仍在 | 已有修复及后续保存结果支持；不默认重开 |
| Faldric 的 @mod 公式被误判伤害漂移 | 历史三阻断修复及该候选验收通过 | 已知样本已处理，不是当前海鬼婆失败原因 |
| DM 缩写、内部 rule ID / actor ID / legendaryRecovery 残留在显示文字 | 历史显示投影与本地化处理 | 有限定回归和候选证据；不靠放宽中文检查解决 |
| Steal Passion 限定名重复导致绑定失败；PDF 换行造成旧 literal-save 误判 | 历史针对性修复 | 已处理已知形式；不等于本次新暴露的连字符/范围等价已修好 |
| Faldric range.long 原生读回丢失 | 按 dnd5e 5.3.3 的有限远程 reaction/bonus 情况改用适当父 Item 载体，并完成历史原生验收 | 限定修复有证据；不推广到所有版本和活动 |
| 中文关键含义漂移 | “keep food down→咽下”“目标选择→GM 决定”“必须拖动→可以拖动”“追加后果→instead”等曾靠核源修正 | **通用保证未解决。** 最近两次没有进入翻译阶段，不能宣称新鲜中文正确 |
| 包级摘要与实际能力不一致 | 旧候选说明曾单独修正并复用不变 Actor 的证据 | 当次候选已处理；自动生成摘要的一般一致性尚未证明 |
| 最早 discovery 空正文 | 历史诊断后来成功；原失败缺 finish_reason/usage | **精确根因 UNKNOWN**；不能定性本地网络、客户端或某个 provider 缺陷 |
| 最早聊天 stream disconnected | 未在此次 Forge 业务调查中复现或定位服务端 | 独立未知项；不能用来解释后来的确定性业务失败 |
| 未见来源/固定版本首次成功率 | 原三例曾 0/3，另一个修复版本曾 2/3；这两次海鬼婆全新提交均失败 | 样本与版本边界分别保留；不估算普遍可靠性 |

历史经多轮续跑的海鬼婆最终候选曾累计 12 次模型 HTTP、10 个正文槽人工修正，之后另修 1 处包级说明再验收。它证明经核源修正的候选可用，不能成为“同一原文全新一次自动成功”的证据。

详细历史依据：[原反复失败复盘](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261012-132706-forge-failure-review/docs/reviews/2026-10-12-forge-repeated-failure-analysis.md)、[三阻断记录](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/acceptance/2026-10-12-forge-three-blockers.md)、[引用定义修复记录](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/acceptance/2026-10-12-forge-reference-definitions.md)。

## 6. 分析与验收本身的失误

这些问题需要修正结论或证据层，不能不加区分地重新跑整条业务链。

1. **最初把修复条件绑定在旧模型错误码上。** 保存旧输入的诊断是成立的，但这不足以覆盖同源模型的另一种结构；第一次新鲜失败提供了反证。现在错误码依赖已去掉，第三种结构又明确显示范围仍未闭合。
2. **前置 schema 检查遗漏 Save 属性。** 导致非法结构直到生成投影后才被拒绝。该项已补，最新一次真实提取中已观察到前置拦截。
3. **把证据范围完全相同当成前提。** 最新分析读回时曾断言 claim 与 coverage 必然同 span，实际多一个换行；已改为读取真实范围。该分析错误已纠正，没有重跑模型。
4. **来源拒绝诊断容易被误读为真实缺文。** 本次全文对照表明只是已观察到的格式差异；报告已区分“检查未能证明”和“规则确实遗漏”。
5. **历史人工语义复核漏过 keep food down 的含义。** 浏览器验收后来发现并纠正。这表明结构测试和单次人工核对都不能保证所有译义；必须保持来源逐条核对的边界。
6. **旧原生验收的 Effect 截图保存错位。** seed-after-effects.png 与 GM 活动图逐字节相同，已排除其图证效力。空 Effect 的结论来自原生页面前后文本读回，不再声称有有效截图。
7. **附加原生 JSON 导出未捕获。** 菜单操作后下载监听超时，没有原生导出文件。UI 预览 JSON 不冒充持久化导出；已有刷新后的对象身份、正文、活动类型和页面文本证据仍然有效。
8. **连接 Key 的存在性没有基线。** 设置页未打开，记录为 UNKNOWN；零 Key 写入/探测与付费审核零请求是另外的已记录事实。该项不是生成失败的已证实原因。

第 6–8 项不构成把已验收旧候选再导入一遍的理由。需要补的是缺失的证据层或未来相应任务的记录方式，而不是为了报告好看重新开展业务。旧浏览器观察到的 tooltip 异常未阻断本次对象读取，未扩修相关外部模块。

原始收据：[browser/receipt.json](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-20261012/browser/receipt.json)；父控取舍：[parent-review.json](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-20261012/parent-review.json)。

## 7. 外部调研确实做过，但它不能替代本地证据

此前同日调查已读取原始 Issue、维护者讨论、修复 PR 和官方文档；本次重读已有研究记录，没有为状态报告重复外部搜索。AnySearch 当时在 TLS 建立前报错，随后按现有授权使用网页工具读原页。外部案例用于选择诊断方法，不证明本地某一次失败必然同因，也不表示本项目依赖这些 Python 库。

| 外部原始来源 | 可确认的处理经验 | 对当前工作的有限启示 |
| --- | --- | --- |
| [LangExtract #358](https://github.com/google/langextract/issues/358) | 用户发现吞掉解析错误会静默丢块，关闭抑制后既有错误处理能捕获失败，报告同组提取 51→64；维护者确认相关行为 | 保留错误与完整性约束；不能以跳过缺项换取通过。数值是原作者报告，未在本地复现 |
| [LangExtract #545](https://github.com/google/langextract/issues/545) | 同一用户报告领域筛选减少调用；同时更小分块仍可能整组失败 | 不复制会丢规则的筛选方案，不把重复缩块或重试当必然修复 |
| [Pydantic AI #5178](https://github.com/pydantic/pydantic-ai/issues/5178) / [合并 PR #5181](https://github.com/pydantic/pydantic-ai/pull/5181) | 用户报告验证反馈删 input 后出现重复错误参数；维护者按路径恢复所需输入 | 修复反馈应保留失败值、字段路径和约束；作者“参数完全不在上下文”的解释被维护者质疑，不能引用为已证实机制 |
| [Pydantic AI #1192](https://github.com/pydantic/pydantic-ai/issues/1192) | 有人换模型改善但更慢，也有人多次重试无效；维护者要求精确复现与 trace | 先定位 schema/适配层，不承诺换模型或加重试必好 |
| [DeepSeek JSON Output 官方说明](https://api-docs.deepseek.com/guides/json_mode/) | JSON 输出可能偶发空内容，有格式提示及输出预算建议 | 能说明可能性，不能还原本地最早空响应根因 |
| [OpenAI Structured Outputs 官方说明](https://developers.openai.com/api/docs/guides/structured-outputs) | 结构化输出仍可能有内容错误，schema 与程序类型需一致 | 结构正确和规则正确分开核；不据此声称 DeepSeek 当前接口具备同样 strict 保证 |

没有新增外部模块安装、本地化或框架迁移建议。未来若另评新候选，先确认与本地失败层位相同，再核精确版本原 Issue/修复，最后做单一反证；不因“别人也失败”就认定本地根因。

## 8. 检查、运行环境与发布状态

### 已执行的开发检查

保存日志中，新增回归首先获得 5 个预期 RED。修复后：

- 定点测试 **21 项通过**，包括旧、新保存 IR 正式入口、普通单属性，以及缺文/冲突/错误绑定/续跑重新核证反例。
- Forge 相关整合 **564 pass / 0 fail / 5427 assertions / 39 files**，上述 21 项包含在其中。
- Intake/encounter 回归 **540 pass / 0 fail / 2367 assertions / 40 files**。
- package 与全仓类型检查、架构检查、两处实现的 anti-overfit、模块构建通过。
- 架构检查覆盖 1312 模块、3109 依赖；手册人工核对并生成后，33 项 handbook:check 通过。

两组测试可能覆盖相同逻辑，不能简单相加当成独立来源样本数。测试通过也不能覆盖本次真实新鲜失败。

本次重新读回日志，并校对新 fixture 原件、最新六份失败记录的 SHA、199 个产品源码文件及候选 bundle；全部与记录一致。最新修复范围之外的 67 个 dirty/untracked 基线文件仍未变。因此复用已经通过的检查，没有为纯报告重跑产品测试。

检查原件：[integration.log](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-source-20261012/integration.log)、[intake-regression.log](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-source-20261012/intake-regression.log)、[red.log](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-source-20261012/red.log)、[handbook-final.log](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-source-20261012/handbook-final.log)。

### 不能混用的两个候选身份

| 对象 | 本次重新读取的 SHA-256 / 身份 | 已验证层级 |
| --- | --- | --- |
| 最新本地构建 JS | 9b81de30c3a5d9c3cc671edb706b6514952f14acb45e0bdee04b1baed4e9e901 | 离线测试、构建、单次新鲜失败现场；未安装 |
| Lab 安装的前一版 JS | ee6dd617aceb9aeb2d3aa1a20c56c3f9fa3bd71f7a23fc62b6c4da1b50ef0dd3 | 旧保存输入候选的一次原生导入/刷新/清理 |
| 旧原生验收环境 | Foundry 14.368 / dnd5e 5.3.3 / cor-cotn / loopback 30001 | 当时收据记录的目标；本次不重新操作浏览器或服务 |
| 实现工作树 HEAD | f79c25fbac747a7e08f98c48779f052c3db68599，加未提交修改 | 不能仅凭 HEAD 代表当前实现 |
| master HEAD | 3734eb2de0b19b0f3d4cfb38bd1e0c8478635281 | 本次只读核对，未改动 |

旧原生验收刷新后保留同一 Actor/Item/Activity 身份、完整规则和 GM 指引，三个活动均为 utility，清理后恢复原对象集合。没有执行复杂战斗能力，所以导入/刷新通过不代表战斗自动化通过。

当前没有 commit、merge 或 push；master 没有接收本修复。付费审核在两次全新流程均为 0 次，最新失败后没有新的调用。本报告仅新增/关联报告文件，不改变这些边界。

## 9. 证据索引与原件身份

| 文件 | SHA-256 |
| --- | --- |
| 最早失败 result | 828202835197881c3de8379b7e67e48a934f484aaacfc45a37efcea2e12d40e5 |
| 第一次全新失败 result | a039560b42a10917c3a77694282c945682bdec6abdd5ecdac7b4986fdd5fbba4 |
| 最新 summary.json | 5fd850b4cecf9b7988a910c73bae3caa88088c39532fa8c382cfb093b62ff2d8 |
| 最新 fresh-extracted-ir.json | 2addc07b6b383e23038de002b648347b8aac4df97849c31bf59a4aa9ad45c0b7 |
| 最新 first-analysis.json | aacbfb79f17cae09aa969ec846278d4e860fd779e791c2dc9f00ed4f0cba075c |
| 最新 result.json | 0a68ab945c15d38acf96803a15443bc0880d6b8a35f5f11bf8344df0147427e0 |
| 旧原生 receipt.json | 19b5ca50d9f2324f83b6d1cd87e438c5dc7bcbd2e295d2703d92bb35ece109b1 |

Hash 固定的是原件身份；结论还依赖源码路径、字段对照、反例和原生读回，不能只凭 hash 宣称功能正确。

- [限定旧输入修复与原生验收完整记录](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/acceptance/2026-10-12-forge-target-choice.md)
- [第一次全新提交记录](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/acceptance/2026-10-12-forge-sea-hag-fresh.md)
- [新 IR 回归、前置校验和最新失败完整记录](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/docs/acceptance/2026-10-12-forge-source-choice-validation.md)
- [最新提取 IR](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-source-20261012/fresh-attempt-1/fresh-extracted-ir.json)
- [最新最终结果](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-source-20261012/fresh-attempt-1/result.json)
- [当前测试源](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/tests/intake-target-choice.test.ts)
- [新保存失败 fixture](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/tests/fixtures/forge-target-choice-fresh-intake.json)
- [当前收尾边界](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-source-20261012/closure.json)


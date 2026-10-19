# Forge 共用契约与原文整理恢复

2026-10-17。用户批准按完整链路核对后的方案实施，复用当前 Forge 工作树；保留旧卡、dirty/untracked 与失败原件，不提交、合并或推送。目标是攻击、伤害、豁免、次数和真实施法逐项可用，复杂后果保留完整来源并明确交给 GM；不按怪物名称或单一句式补丁。

截至2026-10-18，本轮共用恢复的功能验收限定PASS：完整父能力与来源坐标贯穿普通Intake、分步提取、修复、正式生成与导入；基础操作和真实Cast保留，条件后果由GM分别决定。最终v53/r9离线332项native及对应整合门通过，独立r11四旧链通过；两份真实CHM、构造机制staged和普通full-IR均保留原始失败后完成正常DeepSeek同源修复复测。r4/r5代表真实攻击/伤害、Save、共享池/耗尽、Cast和GM条件隔离已验；ordinary6另正常新建卡并实际Mirror Image，V/S/M豁免、独立池消费、Chat及刷新后读回通过root28项核对。更广的任意新资料首次成功、动态复杂执行器、画布放置和新卡效果Apply/自然到期仍按支持矩阵Partial，未冒称完成。

核心原件在`.local/forge-common-contract-repair-20261017/`：`worker-source-freeze-v53-final.json`、`independent-audit-report-r11.json`、`ordinary-run-6/receipt.json`与`root-semantic-review.json`、`native-semantic-review-r9-final.json`、`ordinary-native-r9-final-semantic-review.json`、`browser-native-r1/055-native-readback.json`。所有旧报告、首次失败和中间失败保留；以下为过程记录，当前结论以本段、末尾验收状态及最终收尾记录为准。

## 当前范围与证据

- 当前工作树：`20261006-111625-bettermonsters-eye-deep-sample`，HEAD `f79c25fbac747a7e08f98c48779f052c3db68599` 加现有未提交改动。保留基线在 `.local/forge-common-contract-repair-20261017/preexisting-baseline.json`，仅保存位置、大小与 SHA-256，不复制源码或世界。
- 目标 Mirror：Core 14.368 / dnd5e 5.3.3 / core；正式 portable 契约继续使用现有 14.364/5.3.3 标识，不升级环境。
- 旧标准来源、普通 AI Intake、战斗包 staged、修复/恢复、中文重生成、导入读回、Resolver 和固定控制器均须保持对应边界。
- 旧 `trigger` 字段不证明自动触发。基础操作应有原生按钮；GM 判断触发前提，复杂后果不伪造执行。来源缺文、数值冲突、错误条件和无归属资源继续阻断。

## 执行顺序

1. 固定旧功能和真实失败基线，逐项记录来源期待及已经有效的证据，不把手动占位当正确答案。
2. 扩展兼容的多操作/关系/资源契约，连通提取、validator、renderer、parser、generation、verifier；保持来源证据。
3. 原文切分保留原文位置；确定性快速路径不足时使用有界完整能力事实提取，不能只允许 AI 重复旧整句正则。格式变体不得丢掉基础操作。
4. 先运行受影响离线正式链、格式变体、反例、跨入口不退步及 anti-overfit，再做必要整合、构建和手册检查。
5. 冻结候选后执行正常 DeepSeek 与真实操作验收，分别保存首次结果与修复复测。保留旧卡，最终读回覆盖活动、法术、次数、GM 边界和刷新持久化。

## 本轮恢复与执行边界

| 来源规则 | 本轮处理 | 尚需执行器的部分 |
| --- | --- | --- |
| 攻击加值、基础及无条件追加伤害、固定DC豁免、范围/目标 | 来源逐项核实后生成原生Attack/Save/Damage；同一能力可有多个按钮，基础操作不可因复杂后果降为文字 | 自动命中后依序触发、自动判断命中/失败分支不由多个按钮本身提供 |
| 条件追加/替代伤害、攻击后豁免 | 保留完整前提和独立GM按钮；条件伤害不并入主伤害，后续Save不再次消费主次数 | 自动判断prone、降至0HP或其他资格并串联，需要明确事件/目标/来源/取消/重复执行契约；本轮交GM |
| 固定每日次数、Recharge、明确固定cost=1的跨能力共享池 | 连接原生计数器与Activity消费；主操作消费一次，后续操作零再次消费 | 变量cost、阈值/阶段切换、跨卡资源衍生仍须专门执行器；不猜池归属 |
| 明确法术授予 | portable manifest→目标世界Resolver匹配/缓存→真实Cast；多个共享池分别拥有carrier，随意施法独立 | 未支持的射线数量、特殊任意限制与法术独有生命周期不能靠开放无约束Cast处理 |
| 推离/移动、临时禁疗/减速、守护范围与反应AC/反击资格 | 完整规则留在对应Item，GM依据原文使用现有按钮/裁定，不跨能力复制数值 | 自动移动、临时修改其他卡、受伤/回合结束解除与对手施法DC动态取值需要各自受审执行器；本轮未新增 |
| 已有状态/控制器、24小时法术变体 | 保留已有闭合能力与历史限定证据，不以本轮资料修复重写旧卡 | 原生字段、应用效果、重载和自然到期是不同证据；历史86400秒应用/重载不冒称等待24小时或所有法术均支持 |

旧CLI的`subActions/trigger`字段、宏模板或绿色历史测试不等于已存在通用自动执行器。本轮恢复可准确生成和实际调用的原生部分；未知后果完整交GM。已保存但缺完整来源父单元或遗漏基础操作的旧AI IR需要重新提取，既有旧卡与canonical来源包不自动迁移。

## 实现检查

开工检查理由：共享模型与 staged 提取、来源 verifier、renderer 和生成映射之间有已证实的表达缺口；需要恢复多个基础操作，同时证明复杂后果没有被提升为错误自动效果。优先复用 legacy restoration、native basics、staged/manual、Save 分支和 source uses 的安全包装入口。法术契约变化补 Resolver 检查；整合前检查受影响类型、架构、浏览器构建与手册。

首轮实现检查理由：`sourceOperations` 跨包出口、行 ID 来源回退、多共享法术池承接需要先核对包类型，再运行现有相关安全包装和完整 Actor 正反例。独立审查已要求固定以下可构造反例：截断条件/否定子句变成无条件伤害；同一引用内跨操作借用 DC/属性/攻击数值；新操作路径丢失既有 range/AoE/target；成功/失败伤害关系颠倒；后续 Save 被声明为主操作并重复扣次。上述均须来源独立校验，不能只检查 IR 与生成结果自洽。尚未判定通过。

补充不退步出口：对四份已有 accepted canonical source-package（屠戮、复仇、死亡天使及 Mezzoloth Company）走未修改的公共 `prepareForgeEncounter`，完整比较既有 source-actors 与当前重新生成结果。比较器不改来源、不裁剪机械字段、不自动接受差异；差异逐项审查。另固定重复操作/伤害原子、普通 IR 修复后的错位子证据及 includeBase 双伤害突变反例。

首轮独立旧包比较已执行：屠戮、Company全字段一致；复仇只新增施法动作flag；死亡天使两处新增动作/附赠动作flag和chatFlavor的p/br包装，共4处差异。原始报告保持REVIEW_REQUIRED，待逐条核对。相关spell-manifest/item-builder/actor-text源文件SHA与开工基线相同，不能把历史产物相对当前行为差异直接归因为本轮回退。

下一轮检查理由：新增真实`generateEncounterFromHumanMarkdown`入口重放暴露下游仍按单操作carrier校验activation/uses的接线缺口；共享池Map返回shape影响旧直接消费者；Company保存base的mock无法回答新增partial-feature请求。分别修复业务适配、保持公共返回兼容，并明确source-only重放与auto提取证据的不同含义。未跳过正式workflow gate；失败日志保留，当前仍未冻结、未调用真实模型、未写世界。

v3聚焦检查为native139、staged241、legacy19及package类型检查通过。独立审查随后仍发现五类共用缺口：条件伤害可塞入主Attack；Success跨句后丢分支；成功no damage误否定整句的失败伤害；Failure后句期限变永久状态；多个非施法特性共用次数被各自建池。正在修复，v3不构成最终冻结或实机放行。类型依赖环另以独立纯类型模块解除，不更改执行含义。

资源接线范围：以有来源证据的固定cost=1共享次数契约桥到旧`ActorResourceSemantics`，保留成员身份、总量和恢复；不新增执行器，不开放derived/variable/transition等复杂规则。旧普通资源exactly-one-Activity保护继续存在；多操作成员按明确primary/alternative绑定同池，follow-up零再次消费。成员、总量、恢复或cost不明确时阻断，不能以GM剩余文字掩盖错误独立计数。

独立非浏览器审计r5已通过真实复仇天使full-IR、staged LF/CRLF、多共享法术池到Cast消费、旧CLI Bloodfin正式生成。它是当时源码的证据，作者仍在修最终审查问题；输入hash不等于业务源码冻结。构造机制来源已另存`source-mechanisms/contract-sentinel.md`，明确标为人为机制fixture，不称真实陌生资料；冻结前不做该来源产品预检或模型调用。

整合检查理由：有限非施法共享池现已跨Intake/renderer/旧资源owner接线，普通extract/repair也接入新契约及来源绑定；需要确认既有encounter/原始契约、来源字面核验、事实与规则中文链、全量类型没有被接口变化破坏。root运行现有安全包装的encounter、raw-contracts、facts、rule-meaning、literal-source-verification及typecheck:all，保留各自失败，区分正确的新遗漏诊断与既有合法机制回退；不运行全仓CI或覆盖率矩阵。

Lab保护基线已在旧业务字节下取得：candidate-r1仅将旧Forge业务`6d52a210…a96a1cd`加只读reader，组合`fe91b498…2319d80`；其余24文件不变、无重启、无世界写。正常UI刷新／登录后保存310Actor、94Macro及旧Scene/Combat/Chat身份，首次读回均无变化，世界时间/活动场景/模块配置一致。此为保护基线，不是新候选实机PASS。当前浏览器恢复的旧上传包及部分译文保留；无需控制器的新卡可用空的标准资料入口创建，仍走正式workflow及Resolver，不覆盖旧任务。

root整合r1：encounter618/620、raw-contracts76/77、facts63/65；rule-meaning100/100和literal-source-verification3/3通过。typecheck:all仅两处旧prompt字面版本断言失败。实际facts回归为新遗漏guard未规范化历史`Slashing/Piercing/Poison`大小写，作者已修比较规范化，保持旧测试ready预期与原件；其余为v22→v23 prompt断言和只会回base的旧成本mock，需相应更新并复验失败项。r1日志不覆盖。

普通full-IR的独立内存突变probe已证明：删除真实Engulfing Slam攻击/伤害后，完整父证据及仅标题证据两种情况均被明确挡住。原旧IR自身另有`飓灭Whirlwind of Death`仅GM/Utility导致基本Save/伤害缺失，新门禁会要求重新提取，不能把旧原件或旧通过记录改成新成功。此负例probe不是新模型成功；旧canonical包全字段比较和旧IR再提取是不同证据。

v8候选：native167／staged241／legacy19及最终packages类型通过，architecture1393模块/3505依赖和anti-overfit95源码通过。root整合r2已620／77／65全通过；仅all类型检查因新增mock漏timeoutMs/repairTimeoutMs，已补测试选项，待复验。最终资源静态复查确认候选范围及三成员漏一问题关闭。

冻结自查又发现已知真源反向属性格式`Intelligence or Wisdom Saving Throw: (Target’s Choice) DC15`未进入新原生路径，以及同一次纯Save→AND Save可误标alternative并重复扣次。v8因此仍是候选，未做模型调用或新业务实装。按同一契约补反向OR完整来源绑定与AND关系/资源守卫，双属性事实和中文摘要不能偷选第一项；随后只补受影响检查，再冻结。

v15离线冻结完成：native170、staged241、legacy19、facts68，packages/all类型、architecture1393模块/3510依赖、anti-overfit95源码均通过。38文件清单`worker-source-freeze-v15-final.json`自身SHA为`a63dc2dc023c621ca617ae4510183ae991f48128bc638d8a268b915f44682664`。新增反向Save、AND零重复消费及只用于生成后显示的同源中文事实经窄审未发现新增阻断；独立审计r6再次通过真实复仇IR、LF/CRLF、多施法池与旧CLI Bloodfin，38文件前后哈希不变。旧断言调整逐项记录在`worker-handoff-v15.md`，不是全部旧断言原样保持。

四份旧accepted包差异人工核对完成：复仇与死亡合计5个精确路径只涉及既有施法动作flag和HTML呈现，死亡chatFlavor去标签后文字完全相同；其余字段全等，涉及3个owner文件与开工基线相同。保留原始REVIEW_REQUIRED比较报告，并另存`difference-review.json`，不改旧产物。

候选r2冻结351个生产源码/构建输入，Forge纯业务SHA`7f7f8145d2dd7d778e8cba41152d5d4845289e0da3a3782f830c02b8a1666432`，Resolver维持`dbda100f…23a21`。26个白名单文件已装入已核对的Mirror PID12252/30001，无重启和世界写；新业务加载保护读回待浏览器执行。

正常模型首轮结果必须保留：`normal-run-1`为明确构造的机制fixture，4个实际HTTP请求，Soul Mark提取返回invalid schema，未prepared、未导入；`normal-run-2`为r2冻结后才读取的真实CHM执念天使，原HTML文本节点完整保留、无手改来源，2个HTTP请求，line-ID分段的`SOURCE_LINE_CONTEXT /units/1`被拦住，未prepared、未导入。两者均不算产品通过，正在按实际回复定位共用协议；修复后只能称repair-retest，该CHM不再称未见样本。请求/回复及首次失败不覆盖。

两份原回复诊断：Attack的`targetSpecial`有完整攻击引文但漏冗余`proof.target`；line-ID的context章节标题正确，但提示未给完整context结构而model漏section。将由程序仅在完整攻击句中目标精确唯一时补目标证据、由明确来源章节标题推导section，显式冲突仍拒，不增加盲重试。另顺查发现通用施法句`casts one of the following spells`未进入列表识别，manual回复可能静默漏掉全部真实授予；必须修识别及普通IR遗漏守卫，以原回复完整重放证明五个refs、两独立共享池和at-will组。私有line partition回复的sourceHash为空串hash属于证据接线问题，独立修正且保留原记录。以上均为共用协议，不按怪物名放行。

r2加载保护已由root独立解析`003-native-readback.json`确认：310旧Actor、94旧Macro、66旧Scene、10旧Combat及1195旧消息ID无变化／缺失；无新Actor，worldTime21085811、activeScene和moduleConfiguration保持，served组合SHA与candidate-r2完全一致，errors为空。仅刷新／登录和只读保存，不算新卡操作通过。

v20修复冻结41路径（清单SHA`03950cd45b1a89feb9b8ea3dc3162cc80c2d986d5d7914b1002aa48a24289273`），native190、staged241、legacy19、raw77、facts68、all/packages、architecture1394/3512、anti95通过。独立审计r7四项通过且41hash前后一致。准确变动和旧12项Utility-only断言承接见`worker-handoff-v20.md`。GitNexus对当前工作树`--index-only`增量更新，2037文件、29878节点、72238边；其symbol入边仍明确lower-bound，跨包调用以实际源码和测试补核，不从缺边推断无调用。

candidate-r3冻结354个源码/构建/数据输入，纯业务SHA`e6c6afd20e449c1a0775cef8c9e7fda816707c044bffd79f8d72fc9f59cfb27b`，含只读reader组合`9be88b98…55de502`。装入同一Mirror后，004加载保护读回继续无旧数据变化。

`normal-run-3`是构造机制来源的正常DeepSeek同源修复复测：8个实际HTTP请求（含尚未人工批准的中文草稿），1个Actor、0宏、ready_for_gm_review；`verify:actor`无warning/来源完整性错误，`verify:intake` accepted/findings=[]。正式来源/Actor未手改，五个refs、独立共享法术池1/2与非施法共享3次、攻击后独立CON14、INT/WIS DC16、30尺锥形及条件冷伤害分别核对。使用原语言正式来源从空标准资料入口进入实机，不把未批准译文记为中文接受。

`normal-run-4`真实CHM同源修复复测10HTTP，到反应能力仍拒绝：模型从另一矛攻击借+8/触及10/2d8+5，而本反应只给条件引用，没有自己的数值；原跨能力引文被正确挡住。待补共用提示，明确这种引用由GM按原文使用已存在按钮，不复制数值或自动连锁。`normal-run-5`为r3冻结后才读的另一真实CHM发条恐怪（1344字符，所有HTML文本节点保留、无手改），首轮2HTTP在跨行能力标题处报SOURCE_LINE_LABEL /units/2；原文整理的标签完整绑定待诊断。两次失败原件保留，不宣称全部真源成功。

r3机制卡真实创建失败：标准资料入口生成验证accepted、macros/requirements均空，正常确认创建一次在`$.items[2].activities[0].value.damage.includeBase`读回不符后事务回滚。005读回newActors=[]，旧Actor/Macro/Scene/Combat/Chat、time、active和config均无变化；未操作能力、未新建Scene/目标。锁定5.3.3源码确认Save.damage只定义onSave/parts，Damage只定义critical/parts，Attack才定义includeBase且默认true；新SourceOperations曾对三类统一写false。须修生成和typed verifier，非Attack不输出该字段、Attack保持显式false防重复；reader继续严格，另拒Save/Damage的伪造includeBase额外字段。不能重用错误r3 JSON，原正式来源须重新生成。readonly reader新增仅本任务manifest来源的新Actor createHook，在下一候选正常创建时保存读回/回滚前的实际Doc，不做独立重复故障或世界写。

原文标签的独立诊断已明确：`非寻常天性 Unusual\nNature`及另两个英文名跨行，模型name正确，旧firstLine-only比较误拒。改为完整unit开头的连续标签行排版对齐，要求紧接真实终止符，不跨空段/分区/引用标题/已有能力结束符；原文和坐标不变。引用既有攻击仅补共用提示，不静默抹去非法提取结果。

普通full-IR验证补门理由：独立构造同一否定施法来源、正确source/group description/evidence/coverage/hash但仍保留AtWill:Light组，现有ordinary validator曾blocking=[]。必须以真实来源完整parent拒绝否定/引用授予，包含模型缩短description/evidence的反例，不能只修staged。保留旧prepared/header无cast动词格式及相邻独立正向组。此接口也需一次真实普通AI入口补验：使用同一已知机制来源，经公共createBrowserAiProvider→analyze→（仅在正常needs_review时显式一次repair）→generateBrowserActorIntakeCandidate，不作GM批准、不写世界、不伪称浏览器CORS/按钮E2E；与现有encounter/staged正常模型证据分别记录。

v31/candidate-r4离线冻结44路径（清单SHA `a210a378dedad6c442fa1d4a51c47af1dea0d2d18c5a48035222c7b3da7c0419`）。native282、legacy19、staged241、raw77、facts68、Forge583、encounter620及受影响类型检查通过；architecture1394/3516与anti-overfit95的复用边界见`worker-handoff-v31.md`。普通施法完整parent的新守卫补入旧prepared/header、中文`1次/每日`、独立正向组、能力继承和恶意截断的反例；旧Chinese每日语义回归已恢复，未削弱既有断言。独立r8四项通过，44业务hash前后一致。

r4纯业务SHA `84f7c0b0a8639e788d13a7adbd712e1d8dab3f392edbc852ef1024ab93b385a4`，只读helper组合 `e7235c57e8018c3dcbb6d61b7c6133382758b222659e16516e6065af9fa40a49`，Resolver仍为`dbda100f…23a21`。354个源码/构建/数据输入已冻结，使用原normal3正式来源经公共prepare重新生成，整张Actor只删除4处Save/Damage不支持的includeBase=false，其余全部字段相等；verify:intake accepted/findings=[]，verify:actor通过。不是修补r3最终JSON。

r4标准资料入口正常生成/验证/GM确认创建成功。`008-native-readback.json`读回Contract Sentinel及11个Item，其中5个是真实Resolver缓存法术；INT/DC16与无需VSM已在实际prepared cache确认，两个法术共享池分别1/2，Force/Soul共享3次，后续CON14不再次消费。旧310Actor/94Macro/66Scene/10Combat、旧1195消息身份、time21085811、activeScene、模块配置无差异，errors=[]。这只接受创建和hydration层，实际点击消费及刷新持久化继续执行。

真实模型r4：`normal-run-6`（执念天使修复复测，6HTTP）和`normal-run-7`（发条恐怪修复复测，3HTTP）仍needs_review，没有正式产物或世界写。前者正确同句的两段伤害只给一条完整proof而契约要求两条；后者中文“构装”短称未被静态字典接受。原文、回复和失败均保留，按通用协议/类型别称诊断，不改真实来源。`ordinary-run-1`是公共普通AI入口的正常两HTTP（extract及一次既有repair），仍needs_review，涉及多法术共享池组和非施法共享资源/混合操作证据；不能把staged成功推广到普通入口，继续逐条审查实际提示及回复。

普通入口实际回复的后续诊断：短能力名省略Recharge括号，validator却只看短名，误拒已在完整来源标题保留的正确次数；共享非施法池binder未复用现有完整feature-index claim，且在成员身份缺失时提前造pool ID；普通prompt缺逐法术组claims/coverage与独立key示例，还残留“复制被引用攻击”的矛盾指导。更严重的是旧flat attack+save可以让后续Save在render/parser/generator中丢失，而遗漏守卫只检查IR里有没有save。已按同一共用协议修复，不降低错数、错证、错误合池或跨能力借证的门禁；计划保持生成、reader、Resolver字节不变，以精确hash及同源整张Actor比较决定已有原生行为证据能否复用。

GitNexus r4增量刷新首次失败于本工具的`file_fts`文档删除一致性异常，日志保留。已检查实际CLI源码/帮助，使用现有`analyze --index-only --repair-fts`成功恢复，仅修当前工作树缓存，不删除目录、重装、启用watcher或注入AGENTS。公开原始报告[GitNexus issue2589](https://github.com/abhigyanpatwari/GitNexus/issues/2589)描述相同类别的增量索引失败，但环境是Linux/WSL、CLI1.6.10-rc.47，且其repair也失败；本机Windows的repair已实际成功，不能套用其恢复序列。AnySearch找到原报告但原页提取失败，使用现有网页工具读取原页。最终业务冻结后另做刷新并核绑定。

v36/candidate-r5冻结50路径，清单SHA `b16a731c1f1566c8a5b41a89afdd59bd6fe0f18f7769c1d5b34a062b395056ce`。同句无条件伤害冗余proof仅在完整同句/逐项唯一/同分支关系时规范化；核心类型别称、完整来源标题次数、缺省成员claim、独立法术组及ordinary flatAttack丢Save守卫已修。Deep Speech与native deep的既有标准等价在最终verifier承接，其他语言漂移继续拒绝。native297、Forge590、encounter620、legacy19/staged241/raw77/facts68、三类types、architecture1398/3541、anti95通过；独立r9四旧链及50hash前后一致。六个核心审查文件与最终freeze逐项一致，静态窄审无新增阻断。

r4实际操作及保护已由原件确认：Spined攻击14与穿刺5，Soul两次攻击/暗蚀伤害；008→012→014→015共享池spent0→1→2→3，013独立CON后仍1，016第四次默认消费拒绝且无新chat。Blur耗尽1池，第二池用两次MirrorImage耗尽，两池耗尽后MageHand真实Cast仍可用。临时本人character指派到本任务blankNPC后，生成卡Chat按钮实际CON14得8、Gaze INT16得9/WIS16得6；恢复本人空指派并重开核实。027刷新后14条新消息及计数保持，旧310Actor/94Macro/66Scene/10Combat/1195消息身份、time/active/config均保持。Invisibility未完成不计成功；Token/模板/召唤放置因官方连接无画布拖动能力未执行，消费未关闭，正常UI仅推迟放置。

r4实机另发现条件Cold被Midi14.0.11唯一Other Activity默认链自动弹窗，执行器在Cold掷骰前取消，实际失败保留。源码、版本、MIT许可及竞争解释见[精确接口研究](../reviews/2026-10-17-forge-midi-independent-source-operations.md)。F修复仅在Forge新建导入clone中对来源绑定sourceOperations排除Other/trigger链，Attack显式none；core portable artifact及hash不变，single/Encounter/reuse均检查，未知activeMidi版本写前拒绝，旧不安全卡拒绝复用且不迁移。strict reader明确核安全字段；不能当默认噪音忽略。

r5重新公开prepare normal3原包后，整张Actor对r4全等、delta=[]，formal source hash仍`9d99546fc0b10bb85f0e95c2b489da2ad45a117fa3b4b7fec7acd2c65fe4e447`。四个generation文件对v31、35个Resolver源码对开工基线byte-identical；reader/导入适配明确有变。r5纯业务SHA `68469e7db47707713e84862a3e370a07c6ababd3a228a606465c3a9c2e7cc86a`，helper组合`7951d77e…97ef5`，Resolver仍`dbda100f…23a21`；守卫安装同PID/端口26文件，无重启或世界写。正常模型8/9/ordinary2已分别发起，同源修复复测不称首次成功；F新卡受影响链已派发，r4有效次数/施法/Save证据按相同generation/Resolver及完整Actor相等复用。

`normal-run-8/9`在r5冻结下分别12/13个实际HTTP完成，均ready_for_gm_review、1Actor/0宏、原source/IR/正式Markdown/Actor/中文未批准草稿齐全；两份verify:intake accepted/findings=[]，verify:actor无warning/sourceIntegrityErrors。root独立来源事实检查`chm-model-semantic-review-r5.json`通过：Obsession三攻击/双伤害、WardingBonus1/day及完整GM规则、WIS15/仅忽略M的两随意真法术与24h变体；Clockwork构装基础/三攻击、无虚构manifest，外部施法者DC和1min/受伤解除完整交GM。属于同源修复复测，不改写首次失败。

r5新卡F实机通过：Spined23/穿刺8后等待不自动弹Cold，GM主动Cold独立2d6=9；Soul18/暗蚀5后不自动CON，主动CON及目标真实Save后共享池仍spent1。Obsession新卡Bite13/穿刺9/光耀8，真DisguiseSelf Cast和Warding1/day消费；Clockwork LightningJolt+4/120ft实际7、闪电10。045重载后6新Actor、23新消息保持，旧差异/缺失空、time/active/config保持、本人characterId=null。新增法师之手Actor是正常原生召唤依赖，保留。易容的Cast24h/仅V/S、enchantment期限覆盖及cache baseEffect86400秒已读到；实际Apply未执行，UI候选出现旧landing目标时没有点击，旧hash保护继续成立，不能冒称新卡效果实际应用或自然到期通过。

`ordinary-run-2`的r5正常调用失败另有明确分层：HTTP200、finish_reason=stop、18559字符JSON完整；原Force/Gaze把Failure伤害做为独立follow-up但标base，且Intelligence引文被改写成its，原来源门禁拒绝正确。错误在binder抛域错误后被一律映为network/CORS，丢掉IR与既有一次repair出口。仅AI/证据层继续修：ordinary保留可解析的错误字段交validator逐项finding及needs_review，staged严格拒绝保持；HTTP后内部异常明确invalid_response，不伪装网络问题；提示给出Save内Failure+half的完整布局。原字段不自动纠正。F/runtime/generation/Resolver保持冻结，已成立的r5实机与CHM证据不会因报告层变化重做。

保留证据补门：完成的本轮来源/失败案例和r4原生原件共247文件另封存SHA清单`retained-case-originals-r5-seal.json`，与开工734份历史证据及7份指定原件分开核验。只保存哈希和原件位置，不建立备份/回滚目录。

r6/v41冻结50路径，清单SHA `5c1d95942633d9d5a9456343bd44e8e47c2e4053696b0ad8aa628328124583ec`，native300、staged241、raw77、encounter620、packages/all类型、anti95通过；F两runtime及测试、4generation、35Resolver共43项hash不变。独立r10四旧链通过。公共prepare将机制/Obsession/Clockwork三原包重投影，整张Actor全部delta=[]，原formal source与机制/真CHM实机证据可按依赖复用。candidate-r6已构建但未装入，仍保留r5进行只补缺口。

root审045时发现r5 CON只有activation，目标三条Save全属于r4，撤回早先r5索引该项过度结论；执行器保留原索引，另写`chrome-r5-con-save-amendment.json`。在任务空Scene零Token、临时本人character为自有blankTarget时，新roll `mlB53v9lrqCLL0b7`准确originatingMessage=`sO6VXoy7LiKRfb3T`，con/DC14/结果14，池仍spent1，048恢复null、049刷新保持。root独立语义审计`native-semantic-review-r5-con-amended.json`已通过12项实际安全操作及对应roll/source/Spell/旧保护；原审计失败日志不覆盖。另一审计错误是实际RangeField为字符串"120"，改任务审计的数值类型比较而不改产品。详情`native-review-notes.md`。

`ordinary-run-3`正常2HTTP进入一次repair后仍needs_review，不能算普通入口通过。只读逐项定位：三个parent及所有OP都严格valid，两个平铺aoe与各自唯一Save OP完全一致却被旧白名单拒；第三项把暂时禁疗误放appliedConditions，属于未支持自动状态，原守卫拒绝正确。提示前段让模型填aoe/appliedConditions、后段没有完整列明OP互斥字段，且repair只收到整能力笼统错误。仅AI/来源证据层继续修：有据且唯一严格等价的旧平铺字段去冗余；矛盾/歧义保留具体字段阻断；未支持的自动状态必须由正常repair明确删除执行字段、完整原文仍留GM，不盲删放行。F/runtime/generation/Resolver保持，后续只重测ordinary，不重跑已成立的CHM模型/原生矩阵。

v43的普通carrier修复只折叠完整父能力内、严格有效且唯一主操作拥有的等价aoe/range/targetSpecial镜像；条件/时序、独立child claim、多个候选、错值或错证均保留阻断。未支持appliedConditions不盲删，给出具体字段finding并保留完整GM原文。native307、encounter620、packages/all类型、anti95通过；staged241/raw77沿用v42对应检查，F/runtime/generation/Resolver的43项边界字节相同。candidate-r7只构建未安装。

`ordinary-run-4`正常extract加一次repair后仍needs_review，剩余4条finding只涉及两个spellcasting.abilityEvidence：模型把原文“using Intelligence as the spellcasting ability”改成“using Intelligence as its spellcasting ability”，repair只扩大范围，错误its未改。保留的实际patch与最终IR完全一致，不是binder覆盖模型正确回复。旧hint需要前32个非空白字符精确前缀及既有编辑距离，错词位于前缀内，未提供真实slice。下一修复只补已报告合法范围的原文对照与精确quotePath，要求当前sourceHash、独立完整父能力及范围归属成立；不自动换词、不放宽证据匹配、不修改原IR/finding或原fuzzy阈值。正常模型复测仍为独立必需门。

旧恢复任务另经正常页面只读确认，仍显示“已恢复上传战斗包与部分译文”，资料名“多生物战斗资料”及既有导入控制身份保持。没有触发生成、继续、预览、翻译、批准、导入、清空或导出；页面没有文件名或精确进度，不能从可见状态推断字节级完整性。证据为`chrome-old-encounter-checkpoint-retained-receipt.json`及对应截图/DOM。

v45最终离线冻结50路径，清单SHA `b889d8d8ea8faa4aa2c9cabdc1452bb8cb641eecf8bc59db028ed79efc1b6197`。仅reported-range提示、prompt版本断言及原回复回归增量；native314/314、encounter620/620、packages/all类型、architecture1398模块/3543依赖零违规循环、anti95通过。实际ordinary4错误回复仍原样阻断，正向修复回归明确为test-authored。独立静态窄审与最终5文件hash逐项绑定，43项F/runtime/generation/Resolver边界零漂移。candidate-r8冻结354构建输入，pure业务SHA `759b1310904d14585465e0cf1a924e82273aadfcf03ebe9118d5939091975ef7`；三原包公共prepare重投影整张Actor全部delta=[]，来源hash亦保持。r8已从实际r5守卫安装，无重启/世界写，最终加载读回待执行。

`ordinary-run-5`在v45下真实1HTTP、无需repair即ready_for_gm_review，两个正式verifier accepted/findings=[]；但root独立逐项源语义审计判为`FAIL_SOURCE_SEMANTICS`，不能计为产品通过。五个refs、双独立法术池1/2、非施法共享3次、Force/Soul/Gaze/Spined全部基础及条件按钮通过核对，唯一失败为全成分豁免：完整来源“requiring no spell components”只进入material waiver，五ref没有casting restriction，现有Resolver将仍保留V/S。继续修共用Intake完整施法条款到受支持restriction的接线和遗漏门禁，保留r5实机及两CHM有效证据。该次模型成功没有实际触发新hint修复，不作为hint模型修复成功。

ordinary辅助runner另曾从不存在的generation.response导出Actor，导致后续两个verifier首次ENOENT。已仅修任务辅助脚本到实际candidateResponse.result.artifact，从保存generation原样提取Actor，再跑两verifier-r2通过；不重跑模型、不修最终JSON，首次两个失败log保留。语义失败原件与`root-semantic-review.json`同样保留。

050最终r8加载读回已通过组合hash及旧310/94/66/10/1195身份保护，6新Actor/24新消息持久，time/active/config保持，本人characterId=null，errors=[]、pending0。DisguiseSelf raw缓存仍1hour、Cast override24hour、prepared24hour分别核到；实际新卡Effect Apply仍未执行。当前保留helper待新的Intake修复冻结后最终读回，不移除旧卡或失败原件。

全成分修复所需新增行为门：正常ordinary复测的受验正式来源，在标准资料入口正常生成/确认新卡，再实际使用一个需要V/S的真实法术，核对当前新卡prepared属性已免V/S/M及原生消费/Chat/重载；不能仅凭staged既有实机或portable字段绿色接受这次ordinary遗漏。只增加这一受影响真施法出口，不重复全部攻击/豁免/池耗尽矩阵，不修改旧卡或目标效果。

v53最终共用成分修复：复用原staged条款owner，完整当前父能力的无条件组前言明确免全成分时，为每个真实授予保留已有受支持casting restriction；只补缺省，不覆盖显式错误。独立validator逐ref检查遗漏、原子范围与grant/parent归属。仅M不能扩大为V/S/M；具名法术、反向尾句、条件/否定/引用和未知限定不推广；manual-header不能取消仍有真实ref的父条款，整组无usage不造ref。同父manual行另一M句不能借作全组证明。普通5原IR经最终正式verify:intake确切needs_review/exit2、五条`SPELL_ALL_COMPONENT_WAIVER_MISSING`，最初误接受记录不覆盖。normal3已有staged成分投影保持。

最终51路径清单`worker-source-freeze-v53-final.json` SHA `d6668b15dbda56cf37b311d45e70b5cf36f0f7b2acfe05534bfa5bab6622cf62`；native332、staged241、encounter620、raw77、legacy19、facts68、packages/all类型、architecture1398/3548零违规循环、anti95均通过。独立r11四旧链通过，51hash前后一致；最终静态审查五项hash与清单绑定，43运行/生成/Resolver边界零漂移。必要旧fixture/断言变动逐条在`worker-handoff-v53.md`，不称全部原样不变。candidate-r9纯业务SHA `b16cca0eae4e886994594d9083f9f60daef6cdeb6e84d25c0119e188b14cf62a`，354输入冻结，Resolver仍`dbda100f…23a21`；三包再次公共prepare整张Actor全等、delta=[]。ordinary6正常复测运行中。

`ordinary-run-6`正常2HTTP（extract加既有一次repair）完成ready_for_gm_review，初次仅可选attackBonus=null/缺证据被拒，正常repair移除无来源空字段。没有先前IR、草稿或手改；五ref全成分绑定正确，两个正式verifier accepted，root14项完整源语义审计通过，基础操作/两个施法池与一个非施法共享池/GM前提均保留。它是同源修复复测，不称陌生首过；没有实际用到引文hint的模型修复，hint只保留对应离线边界证据。新的普通产物尚待一次真实Cast专项。

r9首次安装前，原Mirror PID12252已不存在且30001无监听，守卫在任何写入前停止；退出原因未知，不归咎于产品或其他任务。用户随后明确授权“启动原Mirror并继续验收”，按原Node24.17.0/Core14.368、原server-mirror/cor-cotn/loopback30001、no-backups配置恢复同一实例，freshPID47244/Administrator核对通过，未触碰Next/生产。首次readiness检查发生在正常world启动尚未监听时，未写业务；启动日志确认完成后再次核身份，再从实际r8白名单安装r9。浏览器原tab停在/no的Critical Failure原件保留，同tab正常进入/game即恢复登录页；没有重复/no或绕向/setup。最终新卡操作前仍须原310/94/66/10/1195/time/active/config完整读回无漂移。

ordinary6专项实机已完成：正常标准资料生成/验证后新建Actor `0e0fc9cfc786cf90`，完整manifest与受验正式ordinary6产物相等，六个sourceOperations的GM隔离字段全部保持。Mirror Image基础缓存为V/S、Cast ignored为V/S/M、prepared只有mgc；默认consume下第二施法池spent0→1/2、第一池仍0/1，非施法3次池未动。真实原生Spell Chat `qGQ6bwxpj74QJHXr`精确关联该新卡及缓存Item，最终055刷新后保持。root独立28项新卡核对与旧12项原生语义复核均PASS；旧310Actor/94Macro/66Scene/10Combat/1195消息无差异/缺失，time/active/config及本人空character均保持，errors=[]、pending0。七个新Actor和所有失败原件保留，当前不删除卡、目标、场景或消息。

## 验收状态

- 基线：已固定。2474 个既有源码/文件和 734 个历史证据逐项 SHA-256；Bun 1.3.14 下 native basics 112、legacy restoration 19、staged/manual 241 均通过，0 fail。PATH 1.3.8 的先前结果单独保留，不替代锁版结果。日志在证据根。
- 共用契约与原文整理：v53冻结；A–F、普通AI证据/错误分层及共用成分条款修复已实现，复杂后果保持GM边界。
- 离线正式链：上述聚焦与整合检查通过；独立r11四条旧链通过，最终43边界字节与三包整张Actor相等核对通过。
- 正常 DeepSeek：机制staged、两份真实CHM同源修复复测均ready并通过两个正式来源验证；普通6正常两HTTP及完整源语义通过。普通5语义失败原件现被最终正式守卫阻断，首次失败与247份封存原件均保留。
- 实际操作与最终读回：r4/r5代表基础、GM条件隔离及两CHM攻击通过；普通6新卡的Mirror Image免V/S/M、真实Chat、正确独立共享池消费及055重载通过。最终候选r9身份和旧完整保护通过。
- 本轮共用恢复功能目标：限定PASS。手册/索引及owned reader/receiver收尾另在最终记录核对；产品整体继续Partial，不推广任意新来源首过、额外执行器或未执行的效果/画布层。

运行时目标：Mirror 为 `cor-cotn`、origin loopback30001、Core14.368、dnd5e5.3.3、instanceId=mirror；原PID12252退出后经本次用户明确授权恢复为PID47244，Node24.17.0及dataPath保持。只使用本轮自有新卡/目标/场景/消息，原有卡与状态保持；未推进世界时钟或接触Next/生产，验收结束保留常驻Mirror。

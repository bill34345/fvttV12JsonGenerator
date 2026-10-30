# Forge 本轮施法、中文与共用解析验收

状态：**本轮非PDF三项修复已按来源、代码回归、正常DeepSeek和实际原生操作完成有界接受，并已完成无助手普通模块重载。** Gith普通攻击/伤害、同Item独立Save、真实法术与独立次数，以及Shared共享池/耗尽/独立池/刷新均有实机证据；最后Company中文距离缺口也补了修后正常生成。完整范围和未证明部分见[最终目标核账](../reviews/2026-10-17-forge-final-goal-readback.md)，不宣称任意来源或所有旧组合稳定。新Gith和Shared卡保留；307旧Actor/94Macro、时间/activeScene/模块配置均未变。未提交、合并或推送，PDF由另一thread处理。

工作树：`20261006-111625-bettermonsters-eye-deep-sample`，基线HEAD `f79c25fbac747a7e08f98c48779f052c3db68599`。本轮基线、所有red/green日志、独立报告、来源和候选构建保存在`.local/forge-spell-and-rule-repair-20261017/`。

## 当前接受状态（优先于下方阶段历史）

最后收尾：Company r8正常页面一次生成，2连接+4正式流程HTTP200，零repair/付费审核/人工改译，28项中文与来源逐条核对。传送明确“距其当前位置120尺”，浴血/独立受擒、球心/半径、成功/失败结束低环法术关系都保留。正常GM批准后由精确页面包正式重生成Actor，三个verifier exit0；不导入或覆盖旧Company。016/017完整读回旧卡不变，清理后的两张新Actor与048逐字段相同。精确移除唯一助手及还原纯业务入口后真实刷新，两张实际卡分别打开/展开，计数和独立Save仍正确；只读MCP补充消费归属，未写结果。r5/r6桥正常退出，60495消失，Foundry PID12252持续运行。`pure-business-r8-readback.json`、`final-environment-r8.json`和上述最终核账为本轮最终状态；下方“尚欠/等待”均为保留的阶段历史，不代表当前缺口。

Shared控制例经正常文件选择、正式重生成预览及GM核对导入，Actor `ab8df4f05e4886e2`。不是官方新怪或新AI结果。正常Resolver已匹配PHB2024三法术；043至048实际读回证明：Blur施法消息`6UbJpCdSbAzYlOZH`令同一Item共享池spent0→1；Disguise Self正常Midi效用施法消息`IrqzzqstlVwkEmje`令spent1→2；第三次Blur保留默认消费，原生红字“没有可用的…Shared Casting…需要1”拒绝，没有第三次消息和越扣。随后See Invisibility消息`AgJy11JKq4H3aQnJ`仅改独立Activity spent0→1/max3，共享池仍2。048真实刷新后保持共享剩余0/2、独立剩余2/3，Gith此前1/3、1/1、0/1和Temporal spent1均不变。三个preparedCache为附赠动作、V/S/M均免；原始缓存来源不改。完整“隐形法师之手”正文可见，只有三个准确Cast。`shared-r8-parent-native-receipt.json`和官方截图`browser-native-r5/shared-r8-reloaded-card.jpg`保留精确原件及哈希。当前无已派发浏览器任务，根复用原拥有的官方Chrome继续收尾，不能继续写成等待回调。

本轮触及的生成、解析和Resolver局部门已完成；只是记录与fixture变化没有使其失效，因此不重复模型或绿色测试。最终需要对照原始目标核清证据边界、确认311生产源码和26安装文件无漂移、临时Scene/靶归属读回，再精确恢复纯业务入口和删除唯一助手，普通页面重载后查看已生成卡和已用次数。旧卡、失败原件、Gith和Shared卡都保留。

父原会话已直接完成Gith有界原生层：子任务续接报tab仍归父session，未操作；为避免循环claim/另建页，根保留原官方Chrome并接续。036独立Save使用卡l0JYDPw3QpijXwTr绑定Activity5bef…及唯一5尺独立靶；随后正常控制靶、点该卡DC16，037消息QkZbAYKS3g5lEBNv的speaker为靶IFVa…/Token blw…，真实WIS Save Roll.options.target16及originatingMessage精确关联原卡。Temporal保持spent1，靶HP10且无自动消失Effect，未重投攻击/恢复充能。038正常SeeInvisibility施法仅自身spent1/3；PlaneShift首次无target被Midi拦截且039仍spent0，正常选择自愿的自身目标后040仅自身spent1/1，Teleport仍0/1。041在真实刷新后保持1/3、1/1、0/1及Temporal spent1、3/3缓存无V/S/M，旧307Actor/94Macro和时间/activeScene均未变。首次等待helper超时是80模块尚在加载，读取实际页面后完成同一次刷新，不重复刷新。`gith-r8-parent-native-receipt.json`记录边界，Shared及纯业务最终读回仍待执行，不能据Gith局部通过关闭目标。

Token前置根接手已完成：独立执行器两次拖放未落地后，根通过原Chrome3/同tab检查真实DOM热点与覆盖窗口，从目录LI本体拖到清晰画布，创建Source Token Kt1tlzi5RQAXLgrW（4200,2300）；正常Token配置将它链接到原Gith世界Actor，prototype仍false。MCP重复防护读回已发现Token，因此没有调用manage_actors(place)重复创建；所有MCP操作仅只读。默认NPC独立靶IFVaB6WhyDjjbysW由正常UI创建，Token blwHA0k1oJuKN2RE位于4300,2300，相邻5尺。靶在测试开始前经正常HP配置初始化10/10，不是伤害或Save结果。仅自有Scene by9gBUnDBlcUpBNY关闭视野裁剪并启全局光照，旧场景/模块设置不改；全局activeScene仍EBJYd289N5uyTmlC。Source受控、靶有target标记的官方截图已保存，tab交回；此时仍未执行Save/Cast。035读回确认newActors2（Gith+明确临时靶），旧307Actor/94Macro零变更、世界时间21085811、SourceHP112和prototype不变，Temporal仍spent1，三个Cast仍0已用。`parent-token-preconditions-ready.json`及官方父截图记录准确准备范围；靶和Scene保留到最后读回后再精确收尾，不能把fixture准备记为能力通过。

r8实机实际层：029/030/031读回确认Resolver served hash dbda100f…423a21、Forge组合仍fe82352d…bae7258（回调摘要误抄一处hash，不改原件，以原读回为准）。三ref准确选PHB2024 See Invisibility/Plane Shift/Teleport，Cast独立3/1/1，实际cachedSpell.properties只有mgc，V/S/M已移除。普通徒手攻击及关联两部分伤害正常产生消息；Temporal Attack正常消费Item spent0→1/max1，未自动Save。随后点击独立Save时UI报Cannot read properties of undefined(reading _id)，同时提示Token目标不足；未建立来源Token/受影响受控Token，不能据此判生成器损坏或把Save算通过。Save数据保留WIS16、单一creature、无额外消耗和无Effect；special保留原文命中资格上下文，尚未完成实际目标操作。助手errors=[]仅代表取证，不抵消UI错误。当前Midi14.0.11入口hash与既有2026-10-16前置研究完全相同；原生聊天Save使用controlled目标，单纯target标记不能代替。`gith-r8-token-blocker-review.json`和官方本turn图片原件已保留。没有重投已过的攻击、恢复充能或进行后续Cast/Shared。继续通过正常UI在唯一自有测试场景放来源与独立靶，不改旧场景和旧Actor，不改模块设置。

r7实机失败原件：`browser-native-r5/027-resolver-preflight-report.json`为UI可见报告，唯一UNSUPPORTED_CAST_USES对See Invisibility3/日，results空；026原生读回保留唯一新Actor及pending三ref，无缓存、无旧卡变更。根已查看真实NPC空法术页图片。`src/core/spell-resolution/planner.ts`是实际planner owner，其旧1/day-only门禁未随Cast适配更新；现改为每日安全正整数，结构契约仍核同组共享一致，hydrator仍在写前核来源特性池。保存fixture同时含真实失败manifest与已明确标注人工控制的共享manifest；新增public planner及正常Actor resolve service测试，不再把合法多次/共享当应拒绝的旧测试通过。Prepared/pact、at-will带次数、非法周期/数字和冲突共享仍阻断。r8冻结补入真实owner共311生产源码，Forge业务保持ba6fec4b…94a28，Resolver变dbda100f4275b64a20523c498fa3ac3b08e1609aa7f9586c1b31006ebb423a21；26文件从r7精确安装，无服务重启。`planner-r8-repair-receipt.json`记录完整范围。助手新增served Resolver入口hash；它是传输字节证据，真实新门禁还需正常UI行为证明。未改变生成链，不重发AI、不重新批准/导入Gith。尚欠同一卡的真实解析、匹配、Cache成分及使用/重载，再共享控制例和最终纯业务读回。

r7正常结果父审：`gith-r7-source-chain/`按产品JSON原值保存完整917字符源（保留CRLF，未用文本换行规范化替代）、真实IR/Markdown/Actor；源hash8295ff67…862fb9。`verify-gith-r7-intake.log`、`verify-gith-r7-actor.log`均exit0，后者warnings/sourceIntegrityErrors空，spellResolution仍pending3。根查看官方Chrome图片8/11/14，逐项核完整六能力和中文正文。初次把“componentWaivers仅material”判断为组件语义缺口过早，现更正：每个实际ref另有精确“不需要法术成分”casting restriction；两个实际产物经当前适配器的共6个ref投影均产生V/S/M全免，`component-review.json`记录纯适配验证，不冒充真实匹配。dnd5e5.3.3 Cast源码按该properties集合删除缓存成分。未改产品代码，不重发模型；下一步真实水合后读native Cast与cachedSpell的V/S/M，再实际使用。

重启后r7前置回传：原owned Chrome3/tab651346486已恢复登录，002原生读回核Core14.368/5.3.3/cor-cotn、组合入口fe82352d…bae7258，307旧Actor/94Macro零变更，http0/pending0/errors0。执行器因read_thread不暴露model/effort停在生成前；根从本机该执行器最新真实turn_context核实turn01a148c4…为gpt-6-luna/medium/never/danger-full-access，收据executor-actual-context-r7-callback.json；这不是产品失败或权限缺失，不重跑已有页面前检，已给同一任务精确filesystem核验路径继续剩余正常生成。003阻断收据原件保留。尚无本轮新DeepSeek结果。

完整接续入口：[重启交接](../plans/2026-10-17-forge-restart-handoff.md)。本节证据均在本轮`.local`目录。

- Company r4：一次正常生成，2个连接和4个正式流程HTTP均200；零repair、付费审核、人工修订、批准或导入。保存后关闭、重开及正式重预览，报告/包内容逐字相同，无新增HTTP；源→IR→Markdown→Actor两个verifier通过。`company-r4-source-chain/receipt.json`记录完整结果。Company已有旧source身份，不覆盖旧卡。r3请求分类也应为2连接+4正式流程，历史“4探针+2生成”记法已纠正，原件不改。
- Gith首次正常：发现及基础提取两个HTTP200，模型正确给humanoid，但代码缺“类人”别名，报`UNSUPPORTED_STATIC_FACT`。完整917字符及开头叙述实际保留，未进入翻译、repair或导入。原件`browser-native-r4/021`至`027`和fixture `tests/fixtures/forge-gith-first-ui-base-failure.json`保留；这次仍是失败，不能计为生成成功。
- Gith本地修复：已知类型词、唯一来源的同类型附注、AC引用完整同源特性、加粗章节的施法时机及后续Traits重置。正式Actor保留AC18和完整GM防御规则，不从名称推断自动加值/效果；冲突、歧义、缺定义继续阻断。类型附注沿用既有custom字段，未声称原生subtype标题显示已验收。最终staged 228项通过；未修改模型原回复或最终JSON。
- 施法代码已支持独立N/日、同能力一个共享池和来源动作时机；复杂授予完整交GM，其余准确法术继续真实引用。后续AI修复不会丢纯GM或混合组中的手动行。新卡匹配、Cast、共享/独立池分别消耗、耗尽及重载仍未验收。
- Company球形原生参数本已正确；仅摘要表缺sphere别名导致误报未覆盖，已补且65项事实回归通过。软换行传送距离的中文保护已补，100项意义回归通过。结束法术等复杂规则仍完整交GM，不能把警告消失称为能力全自动。

最新代码检查：`gith-header-green-r4.log`228通过、`native-restart-final.log`111通过、`encounter-restart-final.log`620通过、all/packages类型及3个最新生产源码anti-overfit通过。65/100项事实/意义、395项Resolver、287项generation及架构沿用未失效证据；套件交叠，不相加为独立案例数。六个手册条目逐项核对、补说明和review后重建，`handbook-restart-check.log`33项通过；本轮未新做手册页面视觉验收。

最新candidate-r6只构建、不安装，301业务源码指纹无漂移。Forge纯业务SHA-256 `ba6fec4bf1871d964f1a5d4dbea6930111c9ee072551989a4ba61cbc29794a28`，Resolver `226733474c5a0606553b0c299b51d41d8e3b5af2f7c8f43994064727cf112a3c`。r5是中间构建。实际安装仍r4，26归属文件逐项匹配r4收据；r6没有浏览器加载或运行证据。

最后原生读回027：307旧Actor和94旧Macro均无改变，无新Actor，pending0/errors0。自有记录桥PID34840/57599已正常关闭，退出及端口消失已核对；Foundry PID14420/30001继续运行、没有重启。**已安装r4助手仍引用停用的桥，重启后不能直接点击生成；先恢复记录能力并生成新候选。** 助手保留，纯业务重载未完成；未清理任何旧卡、失败或未知文件。`restart-freeze-readback.json`、`restart-environment.json`及`browser-native-r4/bridge-stop.json`保存准确状态。HEAD不变、索引空；无commit/merge/push。重启后重新核对进程身份，不把PID当永久事实。

## 阶段历史（当前结论以上节为准）

### 已获得证据

| 范围 | 当前证据 | 不能代替的证据 |
| --- | --- | --- |
| 每项N/日、共享池、部分/全部复杂GM施法、来源时机 | native-final-component-scope：111通过；resolver-r3：395通过；正式共享来源IR/Markdown/Actor及两个verifier通过 | 实际Cast和共享次数消费 |
| 后续AI修复保留完整GM施法 | 保存red为557通过/1失败；最终encounter-final-flags为558通过/0失败，原GM组仍在且没有伪manifest | 正常模型可能出现的新缺漏 |
| 混合能力后续修复丢复杂GM部分 | 独立审查反例先558通过/2失败；修后mixed-repair-green为560通过，保留6个原生法术和完整GM行/正文，原生/手动重叠仍阻断 | 页面新来源结果 |
| staged完整能力与未知/冲突阻断 | staged-final：223通过 | 全新来源的生成结果 |
| 半伤条件、球形中心/半径、集群成员体型、旧批准稿错义阻断 | meaning-final-pre-native：98通过；Company原译失败fixture；独立反例已评估 | 本轮DeepSeek实际中文与原文逐项核对 |
| 旧中文近战命中/额外伤害/DC语序 | CHM原文fixture与正式链回归；未改来源规则 | 新卡真实攻击、附带Save操作 |
| 精确5.3.3接口 | references-final与runtime-identity-r2通过，核实际bundle/source map | 浏览器实际加载身份和新bundle |

这些套件有交叠，不相加为独立案例数。人工构造fake provider不是正常DeepSeek成功；保存输入重放不是首次生成成功。历史Company等已通过的原生动作继续有效，历史失败统计不重写。

## 本轮实际操作案例

| 案例 | 用途及来源边界 | 状态 |
| --- | --- | --- |
| Company原来源 | 正常页面重新生成，验证实际中文关系；旧卡和五处修订原稿保留，不称新来源/盲测 | r3首次正常生成已保存：4次正式流程HTTP、零repair/付费审核/人工修订/批准/导入；保存失败与中文表达已修，r4复验待回传 |
| CHM吉斯泽莱开悟者 | 同一CHM的此前未生成新怪；来源已参与语法预检，非盲测。旧中文近战+独立WIS16 Save；隐形法师之手保留GM；识破隐形3/日、异界传送和传送术各1/日。反应和充能完整承接 | 未执行 |
| Shared Casting Test | 明确标注的人工控制样例，经正式来源链生成。两法术共用2/日，另一个独立3/日；复杂法师之手行GM。不是官方怪或真实AI成功 | 已离线生成；页面未执行 |

真实验收检查卡片显示、法术匹配和可正常投掷；核Save属性/DC/效应范围与GM边界、来源动作时机、消耗归属和刷新保存。不重测Foundry内置命中/DC判定或伤害算术。

共享例要实际依次施放两种共享法术，读回同一池0→1→2；独立池不变，单独用一次后只改自身。耗尽不允许再消耗/施放，持久化读回不恢复已用次数。复杂行完整可见且不产生无限制Cast。

## 当前环境与剩余门

Mirror已启动PID14420，127.0.0.1:30001，server-mirror/cor-cotn，Core14.368/dnd5e5.3.3。实际包目录是其`Data/modules`子目录。MCP桥未连接，不修改桥配置。Chrome预检已成功，拥有的新工作页651346486保留，未操作历史或用户页；根端从实际turn_context确认执行器是gpt-6-luna/medium、Full Access。

已读回80个启用模块的安装manifest和入口hash，UI记录中Monk's Wall Enhancement版本徽标14.02与本地manifest14.01不一致，需下次实际读回已加载模块版本区分。没有据此升级或改动其他模块。当前业务精确版本门通过。

最终类型检查all/packages/foundry-modules通过；223项staged、4个最新影响源码anti-overfit通过；架构和generation复用有效记录。手册已对照4个新增stale条目核对并重新构建，handbook-freeze-check为33项通过。

candidate-r1构建成功：16个Forge业务文件、9个Resolver文件、1个临时读回助手。纯业务index为a19c4d60ac482538d052a079827aa9cbef9dcf257496eae0cccc895e43bd2b16，Resolver为226733474c5a0606553b0c299b51d41d8e3b5af2f7c8f43994064727cf112a3c；301个生产来源文件已冻结。旧发布档案未改，未宣称ZIP发布门通过。

当前官方Chrome接口没有文件到密码框/response-body落盘的通道。新增本轮临时内存传递及证据助手：Key仍来自既有外部文件，一次传递至正常密码框，不写本地设置或证据；正常页面仍直连DeepSeek。仅127.0.0.1监听PID31720/51841，限制来源Origin，证据追加保存。无Origin/错误Origin/错误用途/越界文件名及追加读回已作5项无Key能力检查；Key未传递、模型未请求。新独立静态审查待回传，候选尚未安装，不在审查前使用该助手。

第二轮独立审查后：混合施法丢manual已修；SSE/JSON仅白名单保存完整可见答案、status和数值usage，私有reasoning不落盘，8项合成断言通过；读回有界等待pending并在模型取证错误或cachedSpell getter异常时失败；最终补实际模块id/version及Resolver运行信息。原报告误称oldHash在构建之后读取，r2独立报告已更正：实际在spawn前采集；原件均保留。r2审查任务提前关闭了本轮临时桥，根核对PID49476/65056确已退出，未交Key/发模型请求；已明确该只读任务不得再操作服务。Foundry未受影响。

当前candidate-r3已按精确白名单安装26文件，服务PID14420未重启、安装不写世界。业务16/9文件与前候选相同，helper更新已冻结；新的记录服务仅PID40116/127.0.0.1:54500，Key只在一次传递handler内读取，没有进程级Key引用。旧r1/r2及其stop原件保留；最终需要关闭r3并核对进程/端口退出。

正常Company阶段已接受派发给原Chrome执行器thread01a142ad-0656-79f1-80ea-975431d99aa4、原拥有tab651346486：刷新载入候选、保存全旧卡基线、正常连接和文件输入、仅一次AI生成、保存原始回答/报告/包及关键截图；不付费审核、不人工改译文、不审批导入。根收到后核对完整来源与中文，再继续Gith/共享新卡。Company有旧确定来源ID，不覆盖旧卡。请求数及实际状态等待真实回传，不能沿用安装前0次作运行结果。

旧功能最后一轮legacy-final为19通过；类型all/packages及影响源码anti-overfit再次通过；handbook-mixed-check为33项通过。准备、安装和派发仍不能代替后续真实验收。

## 首次正常页面回传及实际缺口修复

r3原件在browser-native-r3：016报告、017原生读回和6组请求/回复。按原始body复核：index1/2为models与结构化连接探针；index3基础提取、4显示名称翻译、5Actor正文翻译、6包显示翻译，共4个正常流程请求。原回传及父先前“前4探针、后2生成”的分类有误，现按原件纠正，不修改请求/回复。source与原文件hash4468a368一致，源→IR→正式Markdown→Actor提取不改值，company-first-ui-chain可复核；verify-first-ui-intake和verify-first-ui-actor通过，后者warnings/sourceIntegrityErrors均空。307旧Actor/94Macro、世界时间/活动场景不变，没有新Actor。Resolver实际0.1.7、supported/canMutate为true；Monks实际loaded14.01，与安装一致，先前14.02不能当真实版本。

独立中文逐项比较28条：浴血半伤和独立受擒、Sphere15/距离60、成功/失败均结束2环以下法术、目盲及擒抱/随同传送完整。审核不建议直接批准，要求距离原点更清晰、环阶术语及重复分隔标点。共用保护模板已增强：使用此能力的生物为球心测距参照、自身传送明确当前位置、法术Level写环阶、仅去自有条件标记前重复标点；他人目标相对原点不改。100项意义回归通过。r3原译不改写为修后结果，仍未批准。

页面保存实际失败是旧recovery的package.includes(rawSourceHash)把合法单生物无宏包误拒，不是模型/API失败。新增真实保存fixture，安全集成入口纳入recovery和application检查；red为618通过/2失败，修后620通过：按decode后的正式包内容hash比报告packageHash，合法原件可恢复，保留旧source哈希但篡改包仍拒。恢复后仍要求正式重预览和新GM确认，不继承批准。

回传所称“AoE待核/structuredActions未覆盖”尚无当前Company证据：实际IR有aoe:sphere15/range60，生成findings和正式校验均无错误；structuredActions是正常sourceLogicalPath标记。r4执行器须明确当前候选的具体面板/JSON路径，排除背景Guard蓝图，不因该未证实判断改规则。

官方Chrome图片已从精确executor turn的tool image原件提取，根已查看；r3图片停在输入/连接区，未覆盖候选正文视图，因此r4必须补实际候选/关键规则区域截图。

r4已冻结并安装，业务入口043acc3af840181058868b7cb729eb4031e3f9b92f27fd8d04a1ad81f874cb27，Resolver仍22673347开头；所有当前文件安装前与r3归属hash逐项相同。类型all/packages、架构1381模块/3444依赖、影响源码anti-overfit、手册33项通过。r3桥在确认pending0后由根正常关闭并核PID40116/54500退出，所有证据保留。r4桥PID34840/57599；不由独立只读审查任务操作。

后续已接受派发原Chrome thread/tab：新构建Company正常生成一次以验证实际修复，保存后同页关闭/重开/正式重预览，核恢复草稿且无新请求/批准/导入；通过才同页首次正常生成Gith，保存完整原件并待根审。失败不重发或跳过。此阶段仍不导入、消耗次数或运行共享测试；原生验收在根审Gith来源链后继续。r3部分通过和r4派发不等于整体完成。

剩余：最终类型/手册与构建冻结；确认浏览器身份/连接和安全填Key能力；精确白名单安装候选；正常页面DeepSeek与保留首次结果；来源、中文和正式输出核对；GM审核导入、原生操作及刷新读回；最后业务bundle读回后才移除本轮自有证据助手。测试旧卡不删除，其他世界对象不清理。任何一项失败保留原件，修正结论再修复，不能由其他绿色检查抵消。

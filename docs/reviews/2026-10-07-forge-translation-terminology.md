# Forge 中文翻译与术语核对首期

日期：2026-10-07。当前状态：首期实现、两只真实来源的正式中文生成、语义／机械核对、限定Mirror运行与实际审核下载接受、完整owned清理及父审完成。最终JS为 `77a23af2f481c5b79d69d1d328a856b742b2e7c3a9b1d2dceada74b3be23f00a`；C1–C4及world终验按各自精确版本的有效证据复用，最后仅对报告UI差异做新实测。主工作树保持干净，本候选位于 `20261006-111625-bettermonsters-eye-deep-sample`，分支 `codex/20261006-111625-bettermonsters-eye-deep-sample`，HEAD `6a7845650a04b8a78b458e5edd5f74fb2bb35ab3`，索引为空，改动尚未提交。接管前52条dirty／untracked路径、原文件与旧接受证据保留。没有提交、合并、推送、生产或备份操作。

## 来源与术语

继续使用用户提供的同一 `Beholders.pdf`，SHA-256 `cc7f114b0dcf7e96386665488ee57ec27139440fb46be94aaadca763d0ed2034`。Eye英文提取MD当前文件hash为 `c3731324bd4be655c3b70f01150284d92e3264b2f85ec42ded80fa10ccc0763b`；CR13第14页来源hash为 `f0fb9ec14cef73ce8b4351c2742aba768a60301511ee8873a3cc76f2c3ac5355`。源包由此前正式来源链产生，本次重新走共享workflow生成，不重新声称做过PDF提取或上一轮玩法。

术语只按需要核小批条目。AnySearch读取了用户指定[《玩家手册2024》术语速查](https://5echm.kagangtuya.top/topics/玩家手册2024/术语汇编/术语速查.htm)、[状态](https://5echm.kagangtuya.top/topics/玩家手册2024/术语汇编/状态.htm)、[其他术语](https://5echm.kagangtuya.top/topics/玩家手册2024/术语汇编/其他术语.htm)与[效应区域](https://5echm.kagangtuya.top/topics/玩家手册2024/术语汇编/效应区域.htm)。该站是用户指定译法参考，非发行方官方中文译本；只取中文对应，不改原PDF机制。Bloodied“浴血”与项目 `data/cn.json` 一致。Grappled使用“受擒”状态名，句子中不能机械写成“被受擒”。

项目已确认状态名称来自Custom Conditions的 `src/localization.ts`：Enfeebled衰弱、Clumsy笨拙、Slowed减速。Dazed以“恍惚”、Dominated以“受支配”显示；本PDF中其完整定义尚未找到，保持待核、GM裁定，不等同于Stunned震慑，也不因为同名就接管项目自定义状态。Activity采用“能力活动”，不与普通动作成本混淆。译法版本和实际术语表内容均绑定候选。

## 实现与保护

- 新代码的owner位于contracts／generation／workflows／intake-ai及Forge browser runtime，复用Intake transport和当前连接；不向旧兼容层或浏览器增加Node文件I/O。
- 来源先正常解析、生成、机械验证。翻译仅获得程序枚举的名称、正文、GM步骤等显示槽；稳定ID、状态key、资源、范围、豁免、伤害和规则引用不属于模型输出。HTML、数字、骰式和链接受保护。中文能力标题与载体引用及固定控制配置由程序映射、重编，AI不写宏逻辑。
- 翻译／独立审阅分开请求；正文不重复英文全文。译文、来源、目标版本、语言、策略、术语内容及名称上下文发生变化时旧批准失效。包仍需GM确认；包自称accepted不能授权执行。
- 预览保持单窗口，中文正文、逐能力标题与GM步骤可读，原始英文来源和完整定义按需展开。普通原语言路径不新增翻译请求。翻译失败保存候选，不返回中文正式包；后续只修正有实际问题的文本，已符合身份的来源证据与批准按绑定复用。
- 原生Effect ID仍使用英文来源产生的seed，避免译名改变Activity到Effect引用。256字符控制器绑定上限在准备阶段检查；不截断原始英文。

## 本轮检查和实际失败

证据根为本worktree `.local/forge-translation-20261007/`。新增最初两项失败分别是占位符交换测试写法和预览来源UUID的比较范围，修正断言后通过；没有将它们当作玩法失败。独立代码审阅发现并修复换包后旧翻译记录串包、双语长名运行时才拒绝两项风险。补了对应回归。

架构首轮查出三个循环依赖，拆出纯契约与纯显示映射后，`architecture:verify`通过1258模块／2903依赖；局部anti-overfit六源码通过。聚焦整合112项／738断言通过，后续transport工作清单及恢复检查13项／81断言通过。package及module类型已通过对应阶段；最终代码冻结后仍需补受影响类型与bundle一致性检查。

真实DS调用不是离线fixture。首只Eye的候选实际触发英文残留、Grappled旧译名、原生Activity中文歧义、CC缩写与自定义术语问题；候选与失败保留。独立术语审阅逐项核了53项Eye候选，确认数值、失败差值、目标、开始／结束、Abyssal Mirage两种结束分支及麻痹受伤解除关系未漂移，同时提出上述中文修正；这些问题未通过放宽状态身份或英文fallback绕过。

分批翻译还发现模型可能将上下文名称的ID混入本批工作列表；上下文改为无ID的名称对照，输出仍严格拒绝多余／缺失ID，并保存已还原的合法候选供针对性恢复。新transport回归证明标题与正文分别请求、正文批没有额外标题ID。曾出现Provider空内容，保留有效候选，只补缺失审核；没有重新提取IR或重做旧玩法。

后续独立复核169项Tyrant文本，修正了Slowing的“目标每个回合结束重复豁免、成功才结束”、射线译名一致性、Eye的明确豁免类型、Mirage的填充关系、原生数据取自Item及包级Adjust Gaze的整项传奇动作和至多半飞行距离。更正的是来源绑定的译文草稿，随后独立审核和正式再生，不改正式Actor。对“受眼魔支配”这类正常中文语序修正了过严的术语匹配，保留“不能变成魅惑”的反例；没有改变状态key或分支。

包级英文摘要曾把“moves up to half its Fly Speed”简写成“half-Fly-Speed movement”，导致仅看摘要的审阅要求删掉正确的“至多”。现包级翻译与审阅同时获得同包正式来源解析出的完整能力描述及分区，该证据进入审核hash；完整规则优先于简写摘要。该修复只补实际证据缺口，不扩展自动化。更新后两包的包级审核均通过，旧失败原件保留。

真实生成还暴露了本地化绑定只接受中文传奇分区、未识别生成器已有 `Legendary Actions` 别名的问题。按既有分区契约补齐映射，正式生成恢复，相关正反例通过。独立整图比较工具最初有一处语法错误和“新增localization父对象”分类过粗，修工具后仅补读比较；没有因此重做翻译或撤销已通过的语义证据。

## 最终正式候选与机械接受

| 候选 | 正式目录（证据根下） | Item／Activity／控制规则 | 包hash | Actor artifact hash |
| --- | --- | --- | --- | --- |
| 深海之眼（EYE OF THE DEEP） | `eye-r11` | 10／15／5 | `86d597d433e695ebcbbac3f1900e31d6ddd8dd968dab6852535cc7574c071984` | `744888598ffb626440d9814f57ba6c626d55067fdf31ea01d1fa30378ad6fc75` |
| 眼魔暴君（Beholder Eye Tyrant） | `tyrant-r8` | 18／41／16 | `8a35dd82fba129d19ca9af798663eedaf256ef7e86d6060357201edf2307dfd0` | `79eff53fe97da5a03a9832708bd63b250f7896d60356310839e6a14af973ff77` |

每个目录包含正式MD、Actor JSON、可导入JSON／ZIP、翻译审核过程、`receipt.json`、`independent-mechanics-audit.json`与`verify-actor.log`。真实翻译及独立Provider审阅使用现有DS Flash；另有只读代理逐项语义审阅及root核对。两次最终再生分别与导出artifact hash一致，原始来源和原固定配置不变；Eye共72项显示／审核元数据差异、Tyrant共257项，没有数值、骰式、资源、状态ID、Activity／Effect结构或原生数据的越界变化，控制配置只改明确的名称绑定。两次 `verify:actor` 均为零warnings／零sourceIntegrityErrors。它们是需GM最终确认的整包候选，不宣称普通单Actor入口已放宽。

最终相关检查：原有与新增112项聚焦整合／738断言、浏览器bundle与发布归档等67项／1317断言通过；最后受影响本地化／证据上下文13项／86断言通过。package与module类型、browser forbidden-import检查、构建／manifest与归档验证通过；架构和局部anti-overfit有对应收据。9个受影响手册条目按实际入口人工核对，生成HTML并通过33条一致性检查。这里的静态／语义证据不代替后述运行验收。

最终架构复核为1258模块／2904依赖，无违规与循环；最后5个实际变更源码的局部anti-overfit通过。术语经browser-runtime已有公开依赖出口供模块读取，最后一次构建与冻结r2的JS／CSS／模板／ZIP逐字节hash相同，未产生另一待安装候选。独立译义代理最后实查Tyrant r8的原生数据来源与Adjust Gaze两处最终文本，确认此前已知译义问题闭合；仅对来源／中文语义作结论。

## 运行边界与接受过程

目标是既有Mirror Core14.368／dnd5e5.3.3／cor-cotn／30001。接管时实际没有30001监听，旧PID49012只是历史收据。先核目标与共享占用，安装仅改变Forge的script／CSS／encounter模板，CC／Trigger Engine／WMP的manifest与脚本hash不变。随后本次冷启动PID50212，参数包含精确app/data/world、loopback及noBackups；初次就绪探针早于原生加载完成，约37秒后同一PID完成启动，127.0.0.1监听和join HTTP200验证通过，没有停止／重启其他服务。共享server.pid已从失效49012登记为实际50212；服务按约定常驻到关机。

增加包级证据上下文后，只热更新同一PID下的Forge脚本。最终JS `478bb52aa78d4a62e17d8acee5f7b8442a35e30a4869f23b54dbf30d342fe9ad`，CSS `027dead44dbaf5a713d3da2726839eb0bc36b49320091200020847b93ef41eb9`，模板 `28b0cabe51894bbfcd79b7206ed9feafc48ac8bfbb646e814e94ea59e1444155`，ZIP `24c7b01ac0de52c6e4c5ee90e2b58b6719699783b53d206eff23f0288b77ead0`。原r4英文ZIP保留原件和原SHA于 `accepted-english-r4-release`，不是新建副本。安装与就绪不等于客户端已加载或功能通过。既有英文C0–C4／r4UI／C5继续指向原hash。

用户于2026-10-07明确授权复用“Forge 0.5.0 统一工作台：Chrome 验收”并向当前新聊天回传。直接userMessage已核对，派发前实查PID50212／30001／HTTP200、冻结构建和两正式包均一致。Codex app跨聊天工具已接受原执行聊天01a10b1b-3a61-7843-a584-8391d8bca8a3，callback目标为01a1143a-4fd4-7530-aa62-322e1ea8cc2d；首次派发ID为forge-translation-20261007-r1-dispatch-1，收据见dispatch-receipt.json。首次派发时运行结果、owned清理和父审为PENDING，后续真实接续见下文及最终接受。实际配置由执行器核实；合同位于chrome-acceptance.md，父聊天每当下一步依赖回传即结束回合，不轮询或监控。

中文候选需要实际检查：同名能力原生Save与效果、来源下回合结束及正伤害解除麻痹；GM禁用／恢复绑定正确能力，另一个来源不受影响；中文规则页与英文证据可读；清理仅限本批自有对象，最后工具删除后实际全集合读回。第三方Dazed／Dominated、石化阶段、反魔法、射线随机与可见性等既有GM边界继续保留，不新增自动化。本地接受不替代生产或长时会话。

### Chrome 回传与伤害解除诊断

第一次真实回传已收到（`chrome/blocker-receipt-r1.json`）。两个中文包已正常预览、GM审核导入及另行启动；C1原生绑定读回通过。Eye实际原生WIS DC15豁免失败／成功／失败为-85／115／-85，下一来源结束有真实到期history，但随后`Actor.applyDamage(1)`使目标HP300→299而麻痹仍在。C0审核下载两次工具事件超时未取得文件；C2瞬态KEEP快照因工具抛断言未导出，旧有效骰／history／Combat操作保留，未重构缺失快照。Tyrant、C3、C4和清理尚未执行，owned对象和服务保留。

诊断依据是已安装dnd5e5.3.3 `dnd5e.mjs:36705`（SHA256 `79ca2c817017a27c2fcea11d53d4b2a1b0238fe72e5597dde14197a629e77c4f`）及`release-5.3.3`精确源码：数值重载仍调用正常preApplyDamage／updateActor／applyDamage，并非绕过钩子。Forge共享`committedDamageOptions`由首个控制器无条件删除，而其`ownedGroups`只认自己包；实机Tyrant先于Eye恢复，存在首个无关控制器吞掉Eye伤害观察的竞争路径。新增局部回归覆盖两包注册顺序、真实提交、同options的新提交、取消及旧post重放；仅此实际失败使伤害入口运行证据需补。原始来源、中文生成／译义和导入身份未改变，继续复用其有效证明。

原实现回归实测为无关包先注册时红、owner先注册时绿，与现场一致。修复为每次已提交伤害创建共享的短期观察，所有包在同步post派发中读取并只排队删除自己拥有的组；每控制器去重，pre清旧，microtask按观察身份清除，旧post／取消／同options的新提交有反例。活动GM路径本来不写远程`encounterDamageFact`，现场该flag为null不能单独证明事实入口失效。只读独立窄审未发现新增实质问题；真实两包并行复验仍必要。

修复后运行时45项／425断言、导入与GM规则34项／178断言、bootstrap与归档7项／37断言通过；模块类型和一个实际变更源码的anti-overfit通过。手册Forge条目人工对照现有入口／期限／真实伤害说明，记录本次不改变步骤或权限的具体结论，生成HTML并通过33条检查。归档测试在隔离测试环境构建，随后恢复正常构建环境并冻结实际安装候选；两次正常构建ZIP一致。最终r3 JS `d67ed9fed5df64635c85f9eba0a8d80c771cb303b13f076de3c78c3f0eb57e50`，ZIP `08806fdc5700ba61664cf5ddcebbef658a548f96ef448cfe90a185e62f824d59`，CSS／模板与r2一致。只更新同一PID50212的脚本，安装及HTTP服务字节hash一致，CC／TE／WMP仍不变；见`frozen-build-r3.json`、`install-receipt-r3.json`。未重启、未改数据库、未建立备份。C0视觉及C1实际导入的原始证据已由root读回／看图；下载与后续运行仍待续。

### r2 实机与父审接续

相同执行聊天正确回传r2（`chrome/blocker-receipt-r2.json`）：实际Tyrant在前、Eye在后的两个控制器启用顺序下，保留Eye claim受到正常正伤害，HP299→298，pre／updateActor／post同options与claim移除均有真实记录，麻痹／失能解除。Eye缺失的三KEEP快照由新真实失败的完整序列补齐；第一次原生使用因owned来源传奇资源spent2/max2取消，未出现新Save，仅补足该Token资源后成功，取消及准备证据保留。Tyrant实际CON DC16失败／成功、来源下回合结束和正伤害300→299解除均通过，每一步即时persist。

Root已核原件：Eye两中文射线与Tyrant十射线／第十Death绑定正确；禁用Death真实返回false且Save／damage／post／消息均0、前后Token全等；第二来源进入原生Death伤害提示，第一来源其他Paralyzing真实Save和效果发生。该固定效果入口会取消原始use并在控制队列执行真实Activity，因此“原始返回false”不能单独判不可用。治疗221→220→221、刷新、停用、再启用均保留来源1的Death锁，明确恢复后锁空并可进入原生Activity。C4三Item的真实Token UUID、中文步骤、无HP／状态／资源／history／完整九集合副作用已核对；root已看480px窄面板和当前审核窗口截图。这些结果不扩大石化阶段、Dazed／Dominated、射线随机、可见性或反魔法自动化边界。

C0导出层新证据：root只读检查实际下载文件，发现此前两次Eye正常按钮已于04:40:33／04:42:36 UTC生成`H:/Download/encounter-intake-review.json`及`encounter-intake-review (1).json`，均48052字节／SHA256 `b63c81a049d38accbaa318e1d22f7e6a62d34fde93de74ca15d9daf14d6fd006`。整份sourcePackage和localization与正式Eye r11逐对象完全相等；两份accepted审核的语言／术语／requestHash／translationHash和零findings均通过共享解码／哈希核对。未复制、重建或修补下载产物，见`chrome/root-actual-download-verification.json`。当前官方Chrome组件的下载等待实现先等待paused Document网络响应；产品Blob导出不提供该响应，故工具timeout不能据此断言文件未产生。Tyrant当前未发现新文件，仍待一次正常点击及实际文件观察。产品源码无新增修改，业务C1–C4有效结果保留；最终owned清理／原视图恢复和删除Audit后全集合读回尚待接续。

### r3 收尾阻断及限定恢复

r3再次只读核Eye真实下载通过；Tyrant一次不启动下载等待器的正常点击记录为isTrusted／userActivation均true、无windowerror／rejection，仍未出现对应新文件，保持NOT_VERIFIED。旧GM页651341090在大预检报告后持续Page.enable超时，执行器只修报告传输层去除重复caseEvidence，世界flags及原件保留；同一官方Chrome新GM页651341150复用全部旧对象，未重建fixture。旧页的正常reload／close失败已记录，不强停浏览器或共享服务。

真实cleanup已停两owned控制器、恢复原scene／combat／camera／pause／worldTime／controlled／targets并native删除owned Combat，随后两个RoundEnd使唯一归属检查报错，停止剩余删除。原始九集合成员无缺失，所有原内容除原Combat既有native modifiedTime变化外均相同；settings／modules／view完全恢复。Scene／4Actor／2Controller／Audit、26条已证明消息及3条归属不唯一的新提示仍保留；见r3-cleanup-failure-readback、r3-partial-restoration-comparison及r3-cleanup-blocker-receipt。两个RoundEnd不能仅凭两个同GM页面推断唯一来源，不删除。

本次恢复只改owned测试工具：r4-resume-cleanup使用已发生的Combat缺失状态、精确RID／ID、恢复后的原文档／设置／视图门禁；26消息逐一来自r3已通过preflight且立即再核完整来源摘要，含糊项保留。独立窄审指出Scene可能在暂停期间新增未知嵌入对象，已修为7份剩余Scene／Actor／Controller完整来源摘要在preflight及每个删除紧前都重验，变化即保留／报错；两次白名单复核均0差异，P2闭合。每次成功删除在owned Audit记进度，Audit留至原finalize，最终仍要求真实独立post-delete读回。不是降低唯一消息阈值，也不重播已删除Combat或有效业务。产品脚本和服务此阶段仍冻结r3。

剩余导出检查依据：Tyrant可信正常点击无异常且未出现文件，确切浏览器原因未证明。限定改进为同一窗口保留当前审核文件的可点击下载链接，继续正常下载请求，并让文件准备状态／异常可见；链接只对应当前候选，在换源、重新预览／生成／翻译及关闭时撤销。先用两正式包核序列化内容、链接身份／寿命、换源及保密拒绝反例，再做模块类型和手册核对。业务与正式来源不变，安装及纯导出UI复验等本次续清理结束后进行，当前执行器仍验冻结r3。

r4续清理已实际成功，父审读取原始独立终验并看最终恢复截图：26消息和7个剩余文档native删除、Audit最后删除，随后实际点击独立collector。Actor286／Item180／Scene65／Combat10／Macro93／Journal67／Table12／Cards0恢复全部原成员；没有world owned fixture残留。Chat1099为原1096加明确保留的3条提示，原5条历史Monks完整hash／mtime未变。所有原完整内容／mtime相同，唯一原Combat native modifiedTime仍是已记录的1791355212636；完整其它字段／settings／modules／view／camera／pause／worldTime／controlled／targets均相同。见r4-independent-post-audit-delete、r4-final-baseline-comparison及final-receipt-r4。新GM页正常关闭；旧651341090在新对象已删除这一新状态后正常close仍Page.enable超时，作为未关闭UI残留保留，不强停或宣称所有页已清理。

审核链接离线改进已通过11项／48断言（原5项加6个当前候选、URL寿命、换源和保密反例）、模块类型、一个实际变更源码的anti-overfit，独立窄审无新增实质问题。两份真实正式包通过独立有界导出检查：完整sourcePackage／localization对象一致，Eye48052／Tyrant141184字节，链接保留至关闭；检查不冒充实际浏览器下载。早期该检查路径未被Bun发现，显式路径修复；Bun附加合法JSON charset后改按MIME主类型校验，生产实现未为检查修改。Forge手册条目与README同步人工核对可见链接、撤销与“准备不等于保存”说明，生成HTML并通过33条检查。该变化只影响报告准备／窗口展示，原C1–C4机制与完整世界恢复证明继续有效，剩余仅纯导出UI复验。

r5实际验证链接及换源／关闭，但每候选的正常报告按钮和可见链接都产生一个Blob新页，合计4页，无新下载文件；派生页与工作页均正常关闭，旧失败页不动，没有世界写。Root对照已安装Core14.368 `foundry.mjs:207848`：document-level `_onClickHyperlink`无条件preventDefault并window.open普通a[href]，未排除download。这直接解释本轮已连接自动anchor和可见链接被转为新页的反证；不将其推广为原r3无文件现象的完整原因。局部修复只在自己的下载anchor停止冒泡而不preventDefault，普通术语链接仍遵从Core；新增真实DOM事件回归模拟该全局代理，分别核自动／可见下载与普通链接，不用更换浏览器通道或放宽安全检查。原r5失败及文件未执行核对记录保留。

## 最终接受（r6／父审）

同一执行聊天实际以6.1-sol／medium／Full Access、当前官方Chrome在最后冻结r5构建完成纯UI接续。Tyrant与Eye正常FileChooser／preview／报告按钮／可见链接后，真实下载文件已产生，实际JSON解析及完整sourcePackage／localization等于各自正式输入，intake为null。Root独立读取磁盘原件、校验完整对象及共享审核绑定，并核冻结／安装SHA和原r4完整post-Audit-delete原件，写入`chrome/root-final-acceptance.json`。

| 文件 | 实际大小 | SHA256 | 内容与正式输入 |
| --- | --- | --- | --- |
| `H:/Download/encounter-intake-review (3).json`（Tyrant） | 141184字节 | `80141e9d70d5a71faa98162fe20097d5e82a2651416eb173f3799d1282b45239` | 完整整包／译文／审核元数据一致 |
| `H:/Download/encounter-intake-review (2).json`、`(4).json`（Eye） | 各48052字节 | `b63c81a049d38accbaa318e1d22f7e6a62d34fde93de74ca15d9daf14d6fd006` | 完整整包／译文／审核元数据一致 |

文件时间对应2026-10-07 16:10:43至16:13:01（Asia/Shanghai）。最初有界文件观察为空的原件仍保留，后来才按真实落盘核对，没有追加无依据点击／伪造文件／覆盖早期失败。当前候选切换即撤销旧链接；最后点击不产生Blob导航页，窗口及本批GM651341199正常关闭。此前旧651341090在本批开始已不在官方库存，原因UNKNOWN，不宣称由本执行器关闭；本批结束没有拥有的页面残留。r6未创建世界文档／工具、未导入角色、未运行AI或战斗控制，已有C1–C4与r4原世界恢复证明因此继续复用。

最终C0–C4均在所述范围内接受：中文同窗审阅／真实文件导出，原生Document／活动／效果身份绑定，真实豁免与期限及正伤害解除，多来源中文锁的零副作用拦截／明确恢复，正确Token Item规则查看无结算。world owned fixture全部删除；原成员／完整内容及settings／modules／view恢复，唯一已知变化为原Combat的native modifiedTime与3条精确保留的非唯一归属提示。服务PID50212／30001保持常驻，无备份、生产、重启或数据库直接编辑。

最终冻结r5：JS `77a23af2f481c5b79d69d1d328a856b742b2e7c3a9b1d2dceada74b3be23f00a`、CSS `027dead44dbaf5a713d3da2726839eb0bc36b49320091200020847b93ef41eb9`、模板 `fc305b8f0f4ae95473b93607b80627209f7c6e7e27dd93d57804e40cc00f83fc`、ZIP `76c3fb2af84954e07d1d8d8b1918747d96e96ed54892e3b05eb8ce902f031b7c`。最后局部DOM／报告与两个正式包检查13项／73断言、模块类型、局部anti-overfit、33条手册一致性均通过；早期有效整合及架构检查未因纯报告差异重播。源码／参考／失败／测试工具及收据全部保留。

本地首期接受不代表生产、长时或任意怪物／系统版本接受。Dazed／Dominated完整定义仍待查，石化阶段／射线随机／可见性／反魔法等继续GM裁定；没有扩展自动化承诺。尚未提交、合并、推送或发布。可交付物为两份正式中文战斗包／Actor／来源与审核资料、本地未发布0.5.1模块及本接受记录。
## 2026-10-08 后续名称改为空格分隔

用户明确选择“中英文并列，用空格分隔”。今后受审中文生成默认采用`zh-CN-space-separated-titles-v2`：例如`深海之眼 EYE OF THE DEEP`、`麻痹射线 Paralyzing Ray`，不再用括号包裹英文名。名称自身的来源限定（如使用次数、Concentration、Recharge）仍完整保留。已有`zh-CN-bilingual-titles-v1`包按原policy读取，再生不更改旧显示结果或审核身份。

policy进入request与审核hash，旧格式的批准或恢复草稿不能隐式复用为新格式；Actor与包级policy不同则拒绝。包级名称对照取纯中文译名，固定控制配置明确绑定新显示名，程序ID与规则参数保持不变。普通原语言入口未改变，已接受的`eye-r11`／`tyrant-r8`产物未改写。

真实格式检查使用上述两份包保留的原始来源和完全相同的受审中文文本。只读代理独立核对新v2请求／草稿及全部65个标题后，返回4组精确request／draft hash；Root保存该新格式审核，再由`localizeForgeEncounter`经共享正式workflow生成验证产物，没有手改最终Actor JSON。收据与可重跑的局部检查在`.local/forge-name-spacing-20261008/`。Eye与Tyrant分别有43／111项变化，全部为名称、明确名称绑定及本地化审核元数据；正文、GM步骤、数值、资源、Activity／Effect身份与其余机械字段差异为零。两包的固定控制规则和GM锁定列表均唯一对应正确Item，原始来源／固定宏配置不变。

新格式Actor SHA-256分别为Eye `53b030974a7f15d4db8c434861366fca1966c6a66aaa33b4f2c9e44334c5c944`、Tyrant `42ed92e40721d5bdd614e15458678fa63ae227a1cdd8f712775d3ec14b646cea`；10／18个Item、15／41个Activity与5／16条控制规则保持原身份和机制。两次`verify:actor`均无warnings／sourceIntegrityErrors。旧v1真实包经本次代码再生，与已保存Actor完整hash相同。

本轮18项格式／审核／兼容用例包含在299项生成器回归中，共1380断言通过；真实两包的旧格式兼容和新格式再生4项／57断言通过，浏览器包／构建／归档44项／1190断言通过。package类型、架构与5个修改来源的局部anti-overfit通过。新增边缘用例确保已有空格双语名末尾的来源括号限定不被误认为整个英文名。README、人类MD手册和Forge手册条目同步为新格式，相关共享watch均人工核对后重新生成离线手册。

本轮完成的是后续生成名称默认规则与来源／绑定兼容核对；没有新格式Chrome实机证据，不把上节v1实机PASS改写为v2PASS。本轮未更新Lab安装，未提交、合并、推送或发布。

## 2026-10-08 明确授权安装与启动

上段为命名修改完成时的状态。用户随后明确要求启动server-mirror并更新Forge。Root实查服务停止、旧安装为77a23af...，重新构建同一工作树0.5.1本地候选并只更新scripts/index.js；全部9文件安装读回匹配，其他CC／TE／WMP保护文件不变。新脚本SHA为`1b9ae04e1bd6e08b381f45fe9dab62e5dc68055b36dd127fa8d0f115320935ce`。同一Mirror14.368／dnd5e5.3.3／cor-cotn启动为PID47984，loopback30001、noBackups，join及实际模块文件均HTTP200／服务字节与候选相同；共享server.pid更新为经实查的47984，服务保留供用户。

原Chrome执行聊天已接受本次只读页面核对，但标准官方Chrome连接报`Browser is not available: chrome`，只有iab／mcpapps可用。执行器已核实际6.1-sol／medium／Full Access、Chrome在运行、扩展启用及native host正常；未换通道或修改宿主。入口／语言选择／新v2包页面预览全部未执行，实际客户端加载版本未知；没有页面、world fixture、AI请求、导入或宏启动。Root核原阻塞收据及回传后的服务／脚本，接受安装与启动，保留新格式实机缺口。没有把上节旧v1实机或源生成结果当成本次UI通过。

本批原件在`.local/forge-mirror-update-20261008/`，最终分层结论见`parent-installation-acceptance.json`。Reddit来源使用说明已交付：完整规则文字／MD／TXT经Forge生物的战斗包入口，显式选择中文并审核，再确认导入；图片、PDF或帖子链接先取得完整文字。没有提交、合并、推送或生产操作。

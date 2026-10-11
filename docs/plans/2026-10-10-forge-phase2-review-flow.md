# Forge 第二轮：问题定位、单模型复核与审核导航

本记录保留第二轮当时的实施与验收事实。其自动模型复核默认政策已被后续用户决定取代；当前默认关闭付费AI审核、允许GM人工确认的行为见[显式审核记录](2026-10-11-forge-explicit-model-review.md)。本轮未变的导航、来源绑定和交互证据继续按影响复用。

当时状态：已实现并完成本轮限定范围的本地验收，尚未提交。开发分支 `codex/20261006-111625-bettermonsters-eye-deep-sample`，基线 `65b7a4d568988756e245014f2c7eb4b8a0eb3600`。主checkout收尾核对仍clean、master `3734eb2de0b19b0f3d4cfb38bd1e0c8478635281`；该验收阶段没有commit/merge/push、集成master或部署生产。随后用户授权本文件与显式可选审核最终实现、手册一起提交当前分支，当前提交整理见[显式审核记录](2026-10-11-forge-explicit-model-review.md#当前分支提交整理)。

## 用户决定与范围

用户授权直接做第二轮问题定位、连接预检及审核导航，同时明确不要第二个重审核模型，使用生成模型作简要复核，最后由人审核。当前模型保持用户选定值；旧独立审核模型设置不能在后台继续生效。

同一模型复核按现有完整候选/整包/译文阶段进行，失败修正后才再次核对；多生物与中文可能各有复核请求，不将整个多生物任务冒称只有一个HTTP请求。复核只处理明确遗漏、数值、来源、条件及GM边界，不做额外文风润色。现有来源/参数/hash/正式prepare/GM确认及真实accepted契约保留，不编造省略的审核记录。共享CLI默认政策不连带改变。

## 实施内容

1. 问题清单：从当前来源报告与翻译进度精确映射到Actor、能力或包字段，显示原文、待译内容、原因和合法下一动作。未知ID/归属明确待核，跨Actor和相似名不猜。复用已有失败字段重译及同源已批准译文，不手改最终JSON。
2. 单模型预检：设置仅使用当前生成模型，测试一次连通性/协议/结构化输出；配置变化撤旧测试。局部必填检查在耗时生成前执行，连接检查不冒称规则验收。保留原输入/草稿，提供共享连接窗口入口。
3. 审核导航：Actor/自动规则/GM规则/阻塞项汇总，按Actor定位和待处理/GM筛选。GM完整覆盖与真正失败分开；中文名称仅复用同Actor已批准精确映射，保留英文及来源引文。筛选与折叠不改报告、包hash或审核资格，换源不留旧问题。

本轮不扩展战斗包多任务归档、后台队列、Actor覆盖更新、新规则自动化、版本支持或生产。保留现有Operate工作台的布局与视觉体系。

## 所有权与验证选择

- 模型/连接writer负责settings/connection及Forge Provider options/简要复核policy，先核实际调用与契约再实施。UI writer负责encounterApplication、问题/卡片投影、模板/CSS与对应回归；共享接缝为可选`openAiConnection`入口。根负责文档、整合与实机接受。
- 验证依据为实际改变：模型路由/旧设置兼容/单模型探测/测试身份失效需请求model及调用回归；问题映射、GM分类、过滤/定位、恢复/换源与HTML需纯投影及HBS/JSDOM回归。只运行已有安全包装入口，Bun1.3.14。
- 模块与相关package types、架构、scoped anti-overfit、bundle/release作为组合门禁。生成/翻译复核prompt影响需要复核正式产物与来源参数；未改变的运行时命中/治疗/状态生命周期不重放全矩阵。
- Chrome复用新独立执行器`01a1256e-2e8f-7561-8537-57bc3602a62c`及保留的官方Chrome标签；派发前重核实际服务owner/PID/端口/路径、候选安装身份及执行器配置。只补单模型真实生成/简要复核、问题恢复动作与导航中英文/窄窗读回，最后恢复本批设置和草稿。不用IAB/CDP/隐藏状态替代，不创建世界文档。
- 可复用第一轮R5两Actor已接受/包字段失败原件做定位回归，不把旧accepted作为新运行许可；已有第一轮恢复/CAS/原包保留证据不因报告/UI改动自动作废。真正新增失败或证据缺口按受影响层修复，不重复相同失败。
- 手册同步单模型政策、问题动作、导航与最终GM确认，人工核对所有stale watch项，review/build/check根HTML。

## 结果

三项授权内容完成：当前生成模型简要复核与连接预检、可操作问题面板、按生物及处理范围的审核导航。第二审核模型选项移除，旧设置不再生效；来源/数值/参数/hash/正式prepare及GM最终确认保留。实现与验收发现的旧译文绑定、上传问题显示、未知归属、中文selector、编辑撤旧及首次点击问题已修复。

| 层级 | 结果与范围 |
| --- | --- |
| 模块回归 | 最终423通过，包含真实HBS事件、来源失效、首击连接/清除与AI零调用负例。 |
| 相关业务与翻译 | 战斗包538通过；受审本地化26通过。后续仅UI事件修复，复用这些有效结果，没有重跑无关全仓矩阵。 |
| 类型、结构与构建 | all/package/module types、scoped anti-overfit、architecture1297模块/3046依赖、确定性release用例及最终build通过；后续UI变化未改推断或依赖边。 |
| 手册 | 受影响条目逐项人工核对、review并生成根HTML，handbook:check 33项通过；没有缩小watch。 |
| 真实生成与审核 | R1在Mirror14.368/dnd5e5.3.3用deepseek-flash完成两Fey英文生成及中文复核；报告model/reviewModel一致。来源数值、2固定规则/1GM规则和6GM机制核对，Twilight光照/受伤限定完整保留给GM。 |
| 真实续翻与问题 | Actor2术语失败和包说明残留英文经正常续翻仅修失败字段，同源已批准译文绑定保持；缺HP来源保留needs_review，不猜值，唯一原文引用可精确定位。 |
| 导航与交互 | 中英筛选不改变包字节或GM确认；R2中文selector同key正式双语、编辑未blur即撤旧问题/候选/报告/下载通过。R3编辑后的首次鼠标点击连接、label转焦、首次clear及关闭重开空全部通过。 |
| 实机与清理 | 复用同一官方Chrome标签及原Lab服务，原10项可见连接设置精确恢复，Key absent/persistfalse，本批本地任务清空；未创建世界文档或操作服务。最终install-r4的16HTTP文件与构建相等。 |

最终脚本SHA `c90d3577a30c86af428c7897e1758c49cd7a83c6c153866cfacebb6904308bd7`。R1/R2有效证据按受影响层复用，R3只用普通草稿、Provider调用0。父控已独立核对原件hash/正式prepare、源参数与译文绑定、过滤前后包字节、设置恢复，并查看关键截图/DOM。

接受边界：完整候选/整包/译文仍可能各有同模型复核请求，未抓取HTTP总次数；普通Actor正式prepare仍可能needs_review，整包另经审核，不能推广普通Actoraccepted。本批没有世界导入/控制器启用/战斗生命周期重放，既有范围证据保留；ZIP blob未执行。宽窄实机最低为1024窗口，800触发Core最小1024×768警告，不宣称800支持。原恢复连接配置只恢复，不宣称它已连通。

原始证据保存在忽略的 `.local/forge-phase2-review-flow-20261010`：R1父控核对 `parent-chrome-r1.json`，R1/R2/R3原收据与DOM/截图在chrome/，最终安装与HTTP身份分别为install-receipt-r4.json/http-identity-r4.json。最新R3收据SHA `aa0fcec91ef0e6c1cd42a3190dc7d1b148f493368d81933ca089d836daa8274b`。Provider凭据与原始服务响应不进入仓库。

## 实施与修复记录

模型writer局部验证缺口已固定：旧reviewModel/useSeparateReviewModel不能影响任何Forge真实请求；当前模型的连接探测只发一次；真实review请求仍执行、needs_review不升级；Actor/Item/整包/译文的阶段调用按实际路径记录，不伪报整任务单请求。该变化验证settings/provider及模块局部测试与package/module types；UI后续新增映射/导航集成需最终模块组合检查，模型已通过业务部分按影响范围复用。

初步稳定组合419模块/537战斗包、package/module types通过。初次release确定性用例失败的assert因输出截断未取得，不能把并发编辑推测写成已证实原因；冻结后该用例随419模块组合通过。原失败保留，不撤销其他有效证据。

独立只读审查新增3项P2展示问题：上传正式包无Intake时翻译失败被隐藏；恢复progress未经request/translation hash及当前Actor来源核对便展示已批准名称；未知actorKey被降为包级后可能跨Actor定位。另有legacy宏包GM统计可能把未知当0。UI owner修复对应真实context/template与恢复负例，需局部映射/绑定/失败动作回归和稳定组合复验；来源数值/导入契约未被绕过，既有537业务证据不因此作废。

上述问题与窄复核追加的上传旧MD定位变体已闭合：新增纯runtime adapter按当前正式候选构造canonical请求并核requestHash/translationHash/findings；无Intake上传仍展示真实失败字段与继续入口，但不能定位未绑定的旧输入。未知Actor不猜，legacy固定规则统计明确未知并单列GM机制。422模块、module/runtime types与根alltypes通过。父控用第一轮真实R5报告及正式prepare核新投影：2Actor译文经过当前绑定校验、2固定规则/1GM规则、仅包名称与控制宏说明2项待处理，原件与包未改，无Provider或世界写入。

组合检查：11修改源scoped anti-overfit及最后导航predicate窄复验通过；architecture1297 modules/3044 dependencies无违规/循环；reviewed-localization26通过。手册7项stale逐项人工核对、review/build/check33通过。Impeccable检测仅报既有蓝图tab的3px底边指示（border-radius0，非本轮新卡片），保留既定视觉，无需无关重构。初次npx入口等待与取消仅属检查入口层，改用已缓存且实测版本为1.3.14的Bun并仅设置该子进程PATH；未改变全局工具或业务结果。

实机准备：install-r1仅Forge JS/CSS/连接与战斗包模板变化，16文件HTTP核等、PID43560及14.368/5.3.3/cor-cotn/noBackups身份保持、guide及CC/TE/WMP保护项未变。最终文义核对发现导航中文名仍套旧括号格式，需按当前/legacy受审policy分别用空格/括号，并复用已批准能力名；这项仅显示修复后build/install-r2，再派原新Chrome执行器。真实单模型、问题导航及清理尚待回传。

标题policy修复稳定：422模块/模块types及diffcheck通过，父控R5真实译文投影的Actor与feature标题逐项等于R6正式中文artifact名称，引用与hash不变。新helper依赖组合architecture1297/3046通过；模块手册再次人工核对、build/check33通过。build/install-r2仅再变Forge JS，SHA6f1f782298c84fe933d7a5d5531b57b70d112848cfd1f2a4e4d8d243b6db991a，16HTTP文件核等。

Chrome批次`forge-phase2-review-flow-20261010-r1`/revision1已成功派发复用新独立执行器01a1256e；最小交接为本轮`.local`证据根的CHROME_HANDOFF.md。唯一回传当前主聊天01a123a1，实际新上下文配置/拥有标签/单模型真实生成与中文复核/问题与导航/清理仍待收据，不先宣称通过。主控完成独立准备后结束回合，不轮询或重复已通过门禁。本轮没有commit/merge/push，master3734eb2且clean。

R1真实验收回传PARTIAL：实际6.1-sol/medium/Full Access、原Chrome标签/服务身份正确，无世界/服务操作。单模型设置/未测试阻断/共享连接入口、完整两Fey真实生成（报告model/reviewModel均deepseek-flash）、英文与中文规则/GM筛选、窄1024窗口与原文完整限定通过；800触发Core最小1024×768提示，不冒称支持800。中文先Actor2五字段术语失败，续翻修正后accepted；包说明legendaryRecovery残留英文，再仅修该字段后全accepted。已批准Actor译文绑定逐次保持，真实失败/重试原件保留。缺HP正常处理一次返回needs_review及INVALID_HP/missing_hit_points，无猜值；实际定位125..139精确选择Hit Points 未提供。正常文件上传正式preview通过，缺Intake引文保持明确。清本批/关闭重开空、原10个可见设置恢复、key absent/persistfalse通过；HTTP次数未抓取、ZIP blob未执行。

R1剩余3项：中文成功后生物selector仍英文（卡片双语正确）；改回完整source并Tab后旧缺HP面板/report仍可见，直到upload重绘撤下；无效model错误被笼统误报协议/endpoint。父控独立正式prepare、源文/参数/引文核对、中英过滤前后包字节一致、真实失败续翻绑定及设置恢复均通过，实际查看中英GM/问题/选区图。中英包SHA分别79f1ab3f231f652798257ce506e39daae6c0a96e59b4d1cac1c9b7bf206feafc和14a37bf6be5e4cf71017bea9073b220c61609bd925e9d40c76bb152ccec199b2。独立prepare普通Actor仍needs_review，报告generation accepted不等于普通Actor正式门禁接受；整包另受审。

对应最小修复与验证选择：中文selector只取当前正式prepared同key名称；来源/名称/语言编辑同步撤旧派生DOM/错误/报告与链接，输入保原节点/焦点/光标，blur/change才正常重绘，补mounted真实HBS/JSDOM事件而非只看context；probe错误按安全HTTP状态分别引导模型/请求、协议与服务，不能泄原body或断言未证实的根因。422模块/模块类型与538业务/package类型通过；R1具体无效modelHTTP码未知。仅补这三项Chrome，正常上传已接受中文包无需重译；旧缺HP页已清则只再跑一次小单Actor例，不重放双Actor/中文或第一轮生命周期。

窄复核未发现新增必要代码修复：撤回wrapper包含候选/报告/导入与恢复控件，已安装控制位于其外；中文名称按正式同key候选映射，探测不回显原响应。剩余真实焦点转换在R2一并核对。新增连接状态union需一次alltypes检查消费者与测试组合，沿用422/538及已通过来源/翻译/架构证据；本次不改变依赖边或推断规则，不重跑无关矩阵。新构建/安装身份和三项stale手册核对是R2前必需门禁。

R2前门禁通过：Bun1.3.14的alltypes、git diff --check；三项stale人工核对并同步中文selector与即时撤旧步骤，review/build/check33项通过。新build/install-r3只变Forge JS/CSS/encounter模板，16HTTP内容核等、原PID与保护项保持，JS SHA f0b9df8b129b585fa48b6258c828d0d461bbd330a1b7f8fe1c2b1cdcbca18e7f。master3734eb2仍clean，未提交/合并/推送。本批最小交接为CHROME_R2_HANDOFF.md：中文原包上传、一次无效模型探测、必要时一次小缺HP任务和编辑/点击焦点；R1完整生成与翻译证据不重放。

R2回传PARTIAL：三处补修均真实通过，中文selector分别为“恢复追猎者 Recovery Stalker”/actor-1、“审查哨兵 Review Sentinel”/actor-2，筛选后JSON SHA14a37bf6...逐字节保持且GM未勾选。无效模型单次探测显示安全模型/参数提示（UI报告HTTP400，不冒称原HTTP捕获或确定根因），同协议endpoint的Flash一次正常测试通过。一次小缺HP来源仍needs_review且不猜HP；完整来源输入后未blur就撤下旧问题/导航/JSON/报告/包/下载/导入，输入节点AX856及光标保持，Tab后无旧内容。父控核原件SHA、过滤包字节与原10项可见设置恢复，实际查看首击前后截图。

唯一失败为真实blur→鼠标首次点击：输入框聚焦时一次点击可见共享连接按钮，页面重绘跳顶且窗口未打开。当前source/label onblur的全窗render需窄修，不能用stub render或重复第二次点击冒称解决。初次清除后重开仍有source，后从最新页清除再重开全空并已核对；未证实首次清除原因，R3首次clear可顺手覆盖。R2收据SHA093e20eca8bc5a78a321d76e2e47dbc74229b12f6eaf325ac1bd3ba98d5723cf与全部原件保留。后续只跑相关mounted事件回归/module types/build/安装及手册门禁，R3普通草稿即可核点击和清除，不再调用Provider或重跑生成翻译。交接中文包错误别名由执行器用已保存同SHA的phase2-r1-chinese-package.json恢复，此为文件指针问题，不撤有效UI证据。

首击修复已冻结：source/label不再在blur重绘；稳定clear容器只同步hidden，旧resume/repreview仍撤回，初始无草稿时隐藏而输入后显露。新增mounted真实HBS回归用会替换按钮的Base.render建模旧危险，验证blur后同一按钮首击连接/清除及AI零调用。423模块、module types/diffcheck通过，只读窄审无必要问题，清除与保存沿现有有序存储路径。共享Provider/翻译/依赖未变，沿用538业务/26翻译/alltypes/架构等已通过证据。本次唯一stale为fvtt-json-forge，人工核对入口与即时撤旧/草稿清除说明仍准确后review/build/check；新build/install-r4及普通草稿R3为最后运行缺口。

R3前门禁已完成：唯一stale手册人工review/build/check33通过，build/install-r4只再变Forge JS与encounter模板，16HTTP内容核等、原PID及保护项未变；JS c90d3577a30c86af428c7897e1758c49cd7a83c6c153866cfacebb6904308bd7。最小交接CHROME_R3_HANDOFF.md只用普通输入草稿，不需Key/模型探测/Provider；首次鼠标点连接、label焦点、首次clear及关闭重开空为最后实机缺口。清除按钮现为稳定hidden容器，验收检查不可见而非误要求DOM节点不存在。

R3正式回传PASS，收据SHA aa0fcec91ef0e6c1cd42a3190dc7d1b148f493368d81933ca089d836daa8274b。最新实际6.1-sol/medium/Full Access及install-r4/原Lab身份重核；label→source首次鼠标转焦成功，source输入AX801/焦点/光标保持，未预先Tab/blur的一次真实点击直接打开共享连接（model输入1，可见截图成立）。来源再次聚焦后首次clear成功，关闭重开source空且无恢复/报告/问题/包，clear隐藏。设置读回10项完全不变、Key absent/persistfalse，Provider0、世界/服务写入0，原标签保留。父控核安装SHA、原件SHA、设置精确一致，并实际查看开窗与重开空截图和DOM；最后运行缺口闭合。

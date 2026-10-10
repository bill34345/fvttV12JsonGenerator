# Forge 中文翻译和术语核对交接

本期将英文来源制作成中文怪物卡，并核对术语和规则含义。用户已认可这项功能，并于2026年10月7日确认名称旁保留英文、描述正文只显示中文，以及不确定术语优先查阅指定速查站。用户随后明确同意“新建并开始”；翻译专用聊天`01a1143a-4fd4-7530-aa62-322e1ea8cc2d`已创建，接管本工作树作为唯一写入者。现有机制开发已完成限定验收，本聊天不并行修改翻译实现。

## 用户确认的输出格式

- 生物名称采用“中文名（English Name）”。
- 特性、动作、附赠动作、反应、传奇动作及相应能力标题同样采用“中文名（English Name）”。
- 描述、规则正文和GM操作步骤以中文呈现，不在卡片正文重复整段英文。
- 英文原始资料、准确来源引用和核对关系仍保留在来源／审核资料中，供审阅查看；保留来源不等于在卡片描述里重复英文。
- 翻译不改变DC、骰式、HP、AC、范围、次数、恢复方式、状态身份或结束条件，也不将本来手动处理的机制改成自动化。

## 术语参考顺序

用户指定[5E不全书](https://5echm.kagangtuya.top/?page=%E5%86%99%E5%9C%A8%E5%89%8D%E9%9D%A2.html)作为中文术语参考。不确定的基础规则术语，优先查《玩家手册2024》对应的[术语速查](https://5echm.kagangtuya.top/topics/%E7%8E%A9%E5%AE%B6%E6%89%8B%E5%86%8C2024/%E6%9C%AF%E8%AF%AD%E6%B1%87%E7%BC%96/%E6%9C%AF%E8%AF%AD%E9%80%9F%E6%9F%A5.htm)，再进入具体条目核对英文及含义。目录还有旧版2014和其他书籍，引用时记录版本，不能把不同版本的规则混用。

速查目录已实际读取，包含麻痹、束缚、石化、震慑等条目。该站作为用户指定的中文译法参考，不宣称是发行方官方中文译本，也不据中文译法改写原英文来源的机制。第三方特有术语先查对应书籍；自定义状态同时核对项目已确认的定义。找不到或出现冲突时列为待核对，避免自行建立错误对应，例如把第三方Dazed当成Stunned。

检索优先使用AnySearch。对本次动态首页，AnySearch返回“Unable to extract content”，正常网页读取显示它是JavaScript文档壳；已通过公开静态目录`webhelpcontents.htm`定位上述术语速查。后续可直接读取术语页，无需每次从首页重新查。详细条目若读取失败，应保留缺口并通过允许的正式路径再核，不把目录标题当作完整定义。按实际需要查小批条目、保存译法和出处，不批量复制整站书籍。

## 工作树和保护范围

接管的唯一工作树为：

`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample`

分支：`codex/20261006-111625-bettermonsters-eye-deep-sample`。HEAD：`6a7845650a04b8a78b458e5edd5f74fb2bb35ab3`。

2026年10月7日交接前，这个工作树有51条既有tracked dirty／untracked路径，本交接文件另增加一条文档。旧改动包括Forge固定能力、Custom Conditions攻击适配、来源事实恢复、GM裁定标记及相关回归，已经验收但尚未提交／合并／推送。主工作区`I:/OpenCode/fvttV12JsonGenerator`保持干净，HEAD相同；主区没有这些未提交能力，不能在那里开始翻译实现或从该HEAD新建工作树后宣称已承接完整候选。

新聊天先核对实际HEAD／status／index和局部AGENTS，再在这个已有工作树继续，由它成为唯一写入者。本聊天完成交接后不与它并行修改。保留所有旧dirty、untracked和`.local`证据，不reset、stash、复制工作树或自动提交。若决定另开Git工作树，先解决已提交依赖基线与用户授权；新聊天不等于必须新开Git工作树。

commit、merge、push、生产操作、服务停止／重启及备份没有新增授权。不得直接编辑运行世界数据库。现有工作协议和对应范围AGENTS继续适用。

## 已有实现可复用

- `packages/generation/src/actor-localizer.ts`：已有双语名称及部分描述本地化；当前只覆盖有限字段，名字拼接格式、HTML处理和失败回退不能直接等同于本期完整标准。
- `src/core/translation/`：已有Provider适配、缓存和翻译服务；新共享实现遵守包边界，不向旧兼容路径增加新owner，浏览器也不能带入Node文件I/O或服务端凭据。
- `packages/ingest-documents/src/translation.ts`：已有骰式、DC、数字与距离等受保护占位符及失败出口。可复用机械字段保护思路，但保护数字还不足以识别“开始／结束”“来源／目标”“首次／第二次失败”等含义变化。
- `packages/generation/src/ports.ts`和`packages/workflows/src/`：已有翻译端口及正式生成组合。翻译应成为共享生成流程中的受审显示文本投影，CLI／Web／Forge沿同一协议消费。
- `data/cn.json`及Custom Conditions的现有定义／语言文件：提供现有中文术语线索。与用户指定参考发生差异时记录并核对，不自动批量改名原生状态或已有模块。
- 当前Monster Intake orchestrator显式传`translationService: null`；Forge AI／战斗包路线没有完整接入翻译与术语审核。普通Web转换也保留无隐式翻译网络调用的行为。
- 旧`--translate-json`会原地修改指定目录中的JSON。本期中文正式产物须经正常workflow重新生成、验证及来源核对，不以改写已验收JSON替代正式链。

## 首期实现和验收

先从原始英文来源取得已校验的数据与证据，再生成名称、描述、说明和GM步骤的中文投影。保留原始引用，原始DC／骰式／状态key等由已校验数据控制。创建中文卡之前，对术语、机械数值及规则关系做确定性检查和独立语义核对；漏译／失败／冲突如实呈现，不能以英文回退冒充中文完成。

输出语言和术语版本进入候选身份及翻译缓存的有效性判断；改语言或规则文本后重新生成和审核。当前Provider配置可作为接入候选，沿已授权连接和正式入口工作，不加入无关翻译SaaS或新的强制订阅。

能力中文化后，要让同一能力的Native Activity、效果／期限与GM禁用绑定继续对应。当前固定控制器有按`itemName`匹配的路径，不能只改名称字符串。保留稳定的原始能力身份，通过明确映射同步可见名称及固定配置，重新编译并验证控制入口；AI不翻译程序key、不编写新宏逻辑。特殊GM承载保留现有语义，不把手动规则升级成自动化。

首期只覆盖怪物名称、相关能力标题、描述、GM步骤及审核呈现，使用同一PDF的Eye of the Deep与CR13 Beholder Eye Tyrant验证。复用当前单窗口工作台，中文正文为主，来源按需展开核对；不重新设计整个编辑器或增加翻页流程。

完成标准：译文与英文逐项对照；仅允许规定的显示文本／本地化绑定变化，数值、活动、效果、资源、原始身份和引用不漂移；中文名下仍能正确施加／解除麻痹和禁用／恢复对应射线；不相关中文或英文输入不变。使用正常CLI／workflow／verifier及限定Mirror运行接受，维护README／手册并保留原失败与有效证明。已有共同门禁只在相关变化使其失效时重跑。

## 来源和已有验收材料

本任务PDF原件：

`H:/CodexData/visualizations/2026/10/03/01a10117-3f4e-77c2-b7d3-e99e6da803af/eye-deep-source-20261006/Beholders.pdf`

SHA256：`cc7f114b0dcf7e96386665488ee57ec27139440fb46be94aaadca763d0ed2034`。CR13来源为第14页。来源抽取及正式英文包在本工作树`.local/bettermonsters-second/`，正式文件在`gm-final-review-r1/`。Source SHA为`f0fb9ec14cef73ce8b4351c2742aba768a60301511ee8873a3cc76f2c3ac5355`；英文包hash为`7dcd666a40d38d33c31bc28d467df8e9835bd048d8991623ef6790395bc9fdb5`。

先读取这三份已有记录，不重跑整个旧任务：

- `docs/reviews/2026-10-06-bettermonsters-eye-of-the-deep-workflow.md`
- `docs/reviews/2026-10-06-forge-special-mechanics-routing.md`
- `docs/reviews/2026-10-07-beholder-eye-tyrant-reuse-test.md`

CR13模块接受候选JS SHA为`762a2bb6c17f3f003b363747d3635a9350468e53181cfee0cbd3894626f525a0`；ZIP SHA为`5cd8e7fc41195bfcc9698f27438baaf5f8d6c015472fbf7a6c295aa77de23143`。证据根：

`H:/CodexData/visualizations/2026/10/03/01a10117-3f4e-77c2-b7d3-e99e6da803af/beholder-gm-rules-20261007-r1`

`root-acceptance-r4.json`及`r4-independent-post-delete-readback.json`提供旧运行接受和删除最后Audit后的真实九集合读回。旧测试Actor／Scene／Combat／Macro已清理，不重新使用旧对象ID作当前fixture；五条缺直接Combat归属的Monks提示保留，一个原Combat在正常恢复后仅mtime变化。旧C0至C4仍绑8d2d原哈希，r4的新UI／C5按差异证明接受，不能把旧PASS重新标为新中文候选fresh PASS。

## Lab和浏览器入口

目标Lab为Mirror Core14.368／dnd5e5.3.3／cor-cotn／127.0.0.1:30001，dataPath为`F:/FoundryLab/foundry-v14/data/server-mirror`。交接本轮实际查询没有30001监听；上一轮记录PID49012仅是历史收据，不宣称当前仍运行。后续先查进程／端口／版本／占用及已有启动入口，按当前授权和运维规则安排启动或接受，不擅自停止他人服务，不重建Lab，不创建备份。

普通Chrome操作按最新`chrome-delegation-dev`及项目协议执行。历史执行器聊天`01a10b1b-3a61-7843-a584-8391d8bca8a3`只是复用线索；跨聊天派发仍核对适用的人类授权、最新实际模型／effort／权限、官方组件与回调目的地。不要沿用旧tab或SDK路径。新聊天默认配置遵从用户与宿主设置，不因为旧Chrome执行角色是Sol6.1／medium就给主控指定模型。

新聊天的首个动作是核对本工作树及上述小范围资料、确认实际术语出处和现有端口，然后开始首期实现。无须复制整段历史、反复浏览旧聊天或重建已完成的机制开发。

## 2026-10-07 接管与当前执行

翻译聊天已接管，root 为本工作树唯一 writer。实查 HEAD／分支与上文一致、索引为空，52条既有路径的指纹保存于 `.local/forge-translation-20261007/baseline.json`；此文件只记录元数据，不复制旧文件。

实现采用共享 workflow 中的显式受审显示投影：英文来源先正常解析、生成与核验，翻译仅处理程序枚举的名称、描述和 GM 步骤；独立语义审阅与术语／数字检查通过后再生成中文候选。原始规则键、状态、Activity／Effect身份、机械参数保持不变；本地化的承载名称及固定控制配置由程序明确映射。原始来源和审阅译文作为包内可审核资料保留，默认原语言入口不隐式联网。

当前检查依据：新增语言投影、可携带审核身份和控制器名称映射影响正式生成、包预览及导入，先补聚焦正反例（漏译、数字／术语漂移、过期审核、非显示字段变更、原语言不变），再做包／模块类型、架构、局部anti-overfit、两只真实来源的正式生成／来源核验。中文候选改变实际Item显示名，须补Mirror中文名下的麻痹期限／伤害解除、GM禁用／恢复与审核页可读性；旧C0–C4不标为新候选通过。术语研究只读委派；实际译文形成后独立审阅。

当前状态：首期实现、正式中文生成、来源／语义与机械核对、限定Mirror运行、两个真实审核下载文件、完整owned清理与父审全部完成。最终接受见`docs/reviews/2026-10-07-forge-translation-terminology.md`末节和`.local/forge-translation-20261007/chrome/root-final-acceptance.json`。改动仍在唯一工作树、索引为空，主工作区干净；没有提交、合并、推送、生产或备份操作／新增授权。以下接续段保留当时状态与修复证据，末尾为最终出口。

早期检查记录（已由下段最终接续取代）：换包审核记录串包与双语长名超过runtime256限制已修并回归；三处循环依赖拆为纯契约、纯显示映射和编排，架构复验通过。真实候选触发了DC16缩写误判、Grappled旧译名、CC／Enfeebled术语和Activity动作成本歧义，已保存失败及逐条审阅意见；不是重跑旧机制矩阵。恢复草稿／批准复用、不同来源拒绝与翻译批次上下文ID混入分别补了局部反例，112项整合和随后13项翻译检查通过。当时真实运行是 `.local/forge-translation-20261007/eye-r7` 与 `tyrant-r3`，由CLI正式生成、限定恢复、独立审阅；接受前不写正式包。详细证据及余项转至 `docs/reviews/2026-10-07-forge-translation-terminology.md`。旧r4英文ZIP原件已移到该证据根 `accepted-english-r4-release` 并核原hash，无复制／备份。当时新build尚非安装或运行接受。

最终接续（取代上段的当时运行状态，保留旧失败原件）：正式输入为证据根下 `eye-r11` 与 `tyrant-r8`。两包与Actor精确hash、实际源码／译义修正、全图显示差异72／257且非显示差异0、verify:actor零问题，均见上述review。最后独立代理确认已知译义问题闭合。新增包级完整能力上下文进入审核hash，避免简写摘要覆盖原始限定；相关13项／86断言通过。浏览器／归档67项、包／模块类型、构建及手册检查有记录。

Mirror已经冷启动并保持常驻，真实PID50212／30001／14.368／5.3.3／cor-cotn，noBackups，HTTP200。只安装Forge脚本、CSS、encounter模板；最终脚本SHA `478bb52aa78d4a62e17d8acee5f7b8442a35e30a4869f23b54dbf30d342fe9ad`，冻结清单 `frozen-build-r2.json`，安装收据 `install-receipt-r2.json`，服务身份 `resident-service.json`。没有本批Chrome操作／测试世界对象。用户已于2026-10-07明确选择复用原Chrome聊天并回传本聊天，派发已接受（dispatch-receipt.json）。执行器按chrome-acceptance.md核真实权限并执行C0–C4及最终owned清理。下一步在正确callback到达后核原始证据、看图与父审；父聊天不轮询。安装／HTTP就绪与运输接受均不算运行PASS。

接续回传已证明两中文包导入与绑定，root已核原生数据及截图。Eye正伤害未解除麻痹的真实失败现场完整保留，Tyrant／C3／C4／清理未执行。root用聚焦单测确认多包控制器争用同一伤害观察，并修复共享短期观察及各包去重；45＋34＋7项局部检查、类型／anti-overfit／手册通过，独立窄审无新增问题。最新实际安装候选为r3 JS `d67ed9fed5df64635c85f9eba0a8d80c771cb303b13f076de3c78c3f0eb57e50`／ZIP `08806fdc5700ba61664cf5ddcebbef658a548f96ef448cfe90a185e62f824d59`，仍PID50212，只有脚本热更新，无重启／DB／备份。r2上文“没有本批对象”为当时派发前状态，现有精确owned ID只以`chrome/owned-identities.json`为准，不重建。续验复用相同执行聊天／GM tab651341090，合同`chrome-acceptance-r2.md`，从保留Eye伤害分支、缺失瞬态期限证据及剩余项目继续；下载两次超时先诊断，不重做有效导入／翻译。

r2真实回传已完成C2–C4，root核原件／截图接受：伤害入口修复反证、两来源期限／成功失败、中文锁与明确恢复、GM只读规则查看均有证据。Eye额外时点第一次原生资源取消和限定补足owned资源记录保留，不标成一次成功。C0两次Eye下载实际已在H:/Download落盘，root逐对象核整包及审核哈希通过，见chrome/root-actual-download-verification.json。工具下载等待依赖网络response而产品使用Blob，timeout没有否定实际文件；Tyrant下载尚未实证。最新接续只处理一次不使用该等待器的正常Tyrant按钮文件观察，以及完整owned清理／原世界恢复／最后Audit删除后的实际独立九集合读回。新owned测试工具collector-source-r3-export-observer.mjs仅添加被动click/error观察，未安装／执行；产品脚本仍r3、正式包不变，已通过业务不再重播。当前Tab／preview／Audit和fixture仍在，源于r2合同要求下载缺口回传，不能误当已清理。

后续r3 cleanup真实删除Combat并恢复原view后遇到2条RoundEnd保护阻断，保留余项；r4使用精确现状、已通过白名单与每delete紧前完整文档hash恢复，已实际删除余33项、Audit最后删除并实际独立九集合终验。root已看原件及恢复截图：所有world owned fixture不存在，原成员／内容／设置／模块／view一致，仅原Combat native mtime与3条归属不唯一的新提示明确保留。新651341150页关闭；旧651341090 Page.enable超时仍保留未关闭UI，详见final-receipt-r4及r4-final-baseline-comparison。

Tyrant普通可信按钮点击仍无文件／无异常，当前只针对报告增加可见原生下载链接；不把确切原因猜测成事实。11项局部／48断言、两真实包完整报告准备18断言、模块类型／局部anti-overfit／独立窄审／手册与归档检查通过。最新r4已仅热更新脚本与模板：JS93706b2ed1e7c03fa09a5a68df1c64fd2c820296df1e104c659223ce4af9b49d／模板fc305b8f0f4ae95473b93607b80627209f7c6e7e27dd93d57804e40cc00f83fc／ZIPd12f0e9e47265559051f8464afee55c483c2631bb18f3a73ae759b4f8fb7e918；同PID50212，CSS／其它模块不变，无DB／重启／备份。冻结和安装收据分别frozen-build-r4与install-receipt-r4。下一步只用正常GM新页preview最终两个包，点击报告／可见链接并读真实下载文件；不创建Audit或世界fixture、不再import／AI／业务重播，r4的有效post-delete证明继续复用。

r5纯UI观察证实换源／关闭及Blob准备，但按钮和可见链接各被转为新Blob页，两候选共4派生页，未落盘；本轮文件内容比较保持NOT_EXECUTED，4派生页及工作页全部正常关闭，仅旧651341090保留。Root随后定位installed Core14.368 foundry.mjs:207848的document-level外链代理，它未排除download，会preventDefault并window.open；只在本模块下载anchor停止冒泡，保留浏览器默认下载及正常术语链接。新增真实DOM代理回归与两个正式包共13pass／73断言，类型／anti-overfit／手册通过。最新冻结r5只热更新JS77a23af2f481c5b79d69d1d328a856b742b2e7c3a9b1d2dceada74b3be23f00a，模板仍fc305b...，ZIP76c3fb2af84954e07d1d8d8b1918747d96e96ed54892e3b05eb8ce902f031b7c。服务PID50212/HTTP字节一致，无worlddata写／重启／备份；install-receipt-r5和frozen-build-r5。续验仍限定同执行器正常preview／原生下载，C1–C4及世界清理证明不重播。

最终r6实际下载已完成并由root独立读磁盘／校验父审：Tyrant141184字节、Eye48052字节的完整整包／localization／accepted审核绑定均与正式r8／r11一致；两个原Eye下载不动，实际新文件及SHA见review末节与root-final-acceptance.json。所有下载动作无Blob派生页，换源旧链接立即撤销、当前窗口和GM页正常关闭。旧651341090开始已不在库存，原因未知／没有关闭归因，最后本批页面无残留。世界终验沿用r4真正删除Audit后的九集合读回；本批只preview／下载，没有世界写。C0–C4及限定清理父审已完成，未留待重播的必要工作；GM复杂规则和生产／长时范围维持原边界。

## 2026-10-08 后续名称格式

用户明确选择今后采用“中文名 English Name”，中英文之间用空格分隔。受审中文投影的默认名称策略升为v2，策略进入request／审核hash；旧v1包继续按其原审核显示括号格式，既有r11／r8输出原件不改写。普通来源语言流程保持其原行为。

本次核对依据：名称会影响Item与控制器对应、包级名称对照和来源核验，需补空格标题、旧v1读取、跨策略审核拒绝及缓存失效的聚焦测试；实际旧包要再生比对既有artifact hash。另以真实来源通过共享workflow生成空格格式检查候选，逐图核对仅显示名称／审核元数据和明确名称绑定变化。沿用先前机械与语义证据，只补本次格式相关缺口；不把旧Chrome接受推广为新格式实机PASS，也不为显示格式重跑C0–C4。

新增边缘核对：已有空格双语名后面若带来源限定（如Recharge 5–6），v2应保留完整英文名，不能把最后括号中的限定误当全部英文名；仅v2优先识别空格后的完整英文部分，v1仍保持旧解释。

共享浏览器包的policy解码和导入准备已改变，因此补现有浏览器运行包／模块build／archive检查，确认v2可以打包且旧可携带资料继续可读；纯名称格式无需重播世界机制。手册实际更新Forge和人类MD条目，其他共享watch仅核对对应入口与限制并记录不变原因。

后续命名规则已完成：299项生成器回归（含18项格式／审核兼容）、4项真实两包再生／绑定和44项浏览器包／构建归档检查通过；两次verify:actor零问题，类型、架构、局部anti-overfit与handbook:build/check通过，已读回离线HTML中的两个新格式条目。独立格式审核、4组新请求哈希及43／111项纯名称／身份差异的原件见`.local/forge-name-spacing-20261008/`，结论见review的2026-10-08段。旧包原件保留，主区干净、本worktree索引为空；未更新Lab安装，未提交或发布，新格式实机验收未执行。

## 2026-10-08 用户授权更新Mirror并提供使用说明

用户明确要求启动server-mirror、将Forge最新版更新进去，并以Reddit Better Monsters单只怪物为例说明操作。实查30001无监听、无本地Foundry进程，旧安装为上批77a23af...脚本。Root在同一工作树重新构建0.5.1本地候选，仅scripts/index.js发生变化，安装后的9个模块文件逐项读回匹配、CC／TE／WMP6个保护文件不变，无备份／数据库编辑。

已启动本次PID47984：F:/FoundryLab/foundry-v14/app/14.368，data/server-mirror，cor-cotn，loopback30001，dnd5e5.3.3，noBackups，父聊天owner保持常驻。HTTP join与模块脚本均200，实际服务字节SHA为1b9ae04e1bd6e08b381f45fe9dab62e5dc68055b36dd127fa8d0f115320935ce；共享server.pid从已确认不存在的50212更新为47984。本批原件在`.local/forge-mirror-update-20261008/`。

本次安装改变实际客户端脚本，因此补必要的原生UI读回：继续使用已授权独立Chrome执行聊天01a10b1b-3a61-7843-a584-8391d8bca8a3和本父回传。核实际配置／加载脚本、目录入口、单怪物文字输入与中文选项，并只预览新v2 Eye包确认空格名称；不重复C1–C4、不调用Provider、不创建Actor／Macro／Audit，不修改现有内容。新包由原来源与已经独立格式核对的v2批准经正式workflow重建，Actor hash与上段一致，生成收据见preview-receipt.json。完成后关闭本批窗口及拥有的临时页，保留服务器给用户操作；真正的新格式实机结果以回传父审为准。

实际回传为Chrome前置阻塞：当前官方包26.1002.52244的标准setupBrowserRuntime成功，但browsers.get('chrome')明确报Browser is not available: chrome，列出的类型只有iab／mcpapps；Chrome运行、扩展已安装启用、native host正确仍不足以提供官方Chrome连接。未创建／claim页面，页面入口／中文控件／v2 FileChooser预览均NOT_EXECUTED，client-loaded build UNKNOWN；未换通道或修改宿主。实际6.1-sol／medium／Full Access及诊断收据在chrome/permission-and-blocker-receipt.json，正确跨聊天回传已收到。

Root在回传后复核PID47984、loopback30001、join HTTP200及当前服务脚本1b9ae04e...，安装与常驻状态接受；新格式页面验收继续保留未执行。父审结果在parent-installation-acceptance.json。已向用户说明Reddit完整文字来源到中文审核／导入的步骤；服务保留给用户使用。没有Chrome fixture、世界写入或额外清理待办，余缺口仅为官方Chrome恢复后的受阻UI项目。

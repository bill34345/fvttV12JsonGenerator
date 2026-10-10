# Forge 战斗包恢复、规则审核卡片与进度提示

状态：本轮实现及验收完成。失败续跑、输入/中文候选刷新恢复、中英文规则卡片与真实双页旧记录冲突保护均通过；实机后发现的立即导出报告元信息问题已修复，并以模块组件回归补齐。当前候选位于 `codex/20261006-111625-bettermonsters-eye-deep-sample`，基线提交 `3c79c954c336e2ca38dc8ec4c6c02567cd6f9263`。按用户随后授权，将本阶段实现、回归与手册一起提交到该分支；不合并到 master，不推送或部署生产。

## 授权目标与边界

用户授权第一轮：战斗包恢复、规则审核卡片、进度提示；复用现有能力，完成失败续跑、刷新恢复和中英文审核实测，同步手册。普通 Actor/Item、资料库/队列、Actor 原位更新、运行时状态机制和性能缓存不在本阶段扩展。

恢复复用 `EncounterIntakeInput.drafts` / `draftParentHash` 的 fresh-validation-and-review。历史报告、浏览器保存记录和恢复后的候选都不是导入许可；不自动重发 AI 请求、创建文档或启用控制器。来源、目标版本、当前组合状态定义及新审核绑定需要核对；凭据、服务地址、原始 Provider envelope 不进入恢复记录或导出。中文版失败保留已审核原语言候选，但不把原语言结果称为中文完成。

规则卡片展示原文与已解析参数、自动/GM 范围及限制；缺失引文须明确显示，不能补造证据。进度反映真实阶段、当前生物及已发生的修正/重试，不以虚构百分比表示进展。

## 本批验证选择

- 新增本地持久化与续跑边界：定向测试同源失败后复用 IR、重新来源审核、来源/目标/目录变化、world/user 隔离、旧异步任务不能覆盖新来源、恢复不自动执行、敏感信息拒绝与存储失败。
- 翻译失败路径：证明原语言已审核包保留，中文重试只调用本地化链，恢复后仍正式准备及重新 GM 确认。
- 审核卡片：中英文原文、六字段 evidence、GM 完整规则、缺失证据与 HTML 转义。
- 模块整合：本次代码影响 browser runtime、模块界面与 browser bundle，运行现有安全 `test:forge-encounter`、`test:fvtt-json-forge`、package/module 类型、architecture、模块构建与必要 release 一致性检查。检查统一使用 CI 锁定 Bun 1.3.14；当前全局 Bun 1.3.8 不用于此批。
- 真实界面：复用现有独立 Chrome 执行聊天，实际读取新候选。提取模型正确、独立审核模型故意无效的受控失败，保存真实 partial report；恢复正确连接后通过 UI 续跑，核对提取草稿复用及新审核。刷新前后核对同源草稿、无自动 AI/世界写入，再显式继续。英文/中文审核页核对实际原文、参数和 GM 限制。翻译失败另做限定检查，不伪称普通 Provider 自发故障。
- 既有命中/流血/治疗与状态生命周期未改，可复用上一阶段的限定运行证据，不重放整个战斗矩阵。若实现触及这些机制，先补影响说明并重验受影响链。
- 手册：同步模块 README、人类 MD 指南与 handbook；人工核对所有 stale watch 项，更新 review、生成根 HTML 并运行 `handbook:check`。不缩小 watch。

## 实机身份与回传

本批复用 `F:/FoundryLab/foundry-v14/data/server-mirror`，预核 PID 43560 / `127.0.0.1:30001` / Foundry 14.368 / dnd5e 5.3.3 / `cor-cotn` / `--noBackups`；安装、派发与实测前再次核对。常驻服务由用户/父任务管理，不停止或复制 Lab，不触碰线上、LevelDB 或其他任务的数据。

执行模式为 independent-chat；用户要求换新任务后，后续使用“Forge 第一轮恢复与中文审核验收” `01a1256e-2e8f-7561-8537-57bc3602a62c`，原“Forge 0.5.0 统一工作台：Chrome 验收”仅移交保留的官方Chrome页面，不继续测试。按本项目约定验证实际 `gpt-6.1-sol / medium / Full Access` 上下文。用户已明确“从此开始只能回传到本聊天”，唯一回传目标 `01a123a1-57a4-78c3-a02a-7fb90d7627c9`，不得回故障旧线程。实际浏览器使用当前项目指定的官方 Chrome 连接器；旧 IAB 证据不能冒称本轮 Chrome 能力。

## 结果

实施中间检查：Bun 1.3.14 的 `typecheck:packages` 通过；`architecture:verify` 通过（1295 modules / 3014 dependencies，无依赖违规与循环）。新增恢复测试的根 `typecheck:all` 发现一个只读 fixture 字段赋值错误，交由实现 owner 改成不可变构造后窄复验。独立审查发现旧窗口覆盖、清空来源不清除存储、切换连接后的新旧凭据扫描三项恢复边界，已纳入本批修复与定向回归。

手册初次 status 仅三项 stale：verification-development、human-encounter-intake、fvtt-json-forge。前者核对新增安全测试与恢复边界，入口、运行目标和正式生成规则保持；后两者同步恢复、规则卡片及进度步骤。待代码稳定后记录人工 review 并生成页面。

静态门禁已闭合：模块测试405 pass、战斗包测试532 pass；all/package/module类型通过，根只读fixture错误在r2修复，原失败保留。最终architecture1295 modules / 3017 dependencies通过，新增卡片共享摘要依赖已计入；build与release一致性测试1 pass / 9 assertions通过，diffcheck通过。三个手册条目逐项人工review、根HTML生成和handbook:check33项通过。

R1本地安装只改变Forge脚本和战斗包模板，16文件HTTP字节SHA与候选一致，原guide及CC/TE/WMP不变；无服务启停、备份或世界数据编辑。真实界面交由复用Chrome执行器，状态源为本批`.local/forge-encounter-recovery-20261010/CURRENT.md`。真实AI/界面及清理待实测后填写；本阶段未commit、merge或push，master保持原样。

R1实机前置回传：官方Chrome可用，唯一新自有tab进入本地/join；原GM在上轮自有IAB在线而禁选，备用GM空密钥一次被拒后按skill停止重试。全部功能场景NOT_EXECUTED，AI/草稿/设置/世界写入和服务操作均0，不归类为产品失败。R2采用正常退出自有旧GM客户端到登录页并保留tab，交接到官方Chrome；须先核无未保存工作，不能踢其他客户端或改密码/服务。独立修复复核已确认三项持久化与损坏Actor记录问题闭合，无剩余阻断；原静态/安装证据复用。

R2登录交接通过：自有旧IAB无未保存编辑，正常登出到/join并保留tab；官方Chrome原GM一次空密钥登录成功。未生成输入的来源/label/中文语言刷新恢复通过，无自动AI或世界导入。受控无效review模型的真实调用已得到首个Actor IR，页面提供1个可续草稿并显示HTTP400审核失败；没有重做提取或修改来源。

本批新增导出层缺口：官方Chrome在正常报告按钮和可见下载链接两次等待均超时，没有下载文件；同一官方工具明确返回“Blob downloads are not supported by this browser.”。保留A与真实B前段证据，不把它归为AI/玩法失败，不换IAB/CDP/隐藏对象取报告。当前活页仍保留102402字节的失败报告blob和已保存IR。追加最小正常产品入口：显式查看/复制同一序列化审核JSON，以及既有正式格式的战斗包JSON；只修导出层、补对应UI/安全测试、模块types/build和handbook，不重跑532项战斗包业务。恢复后先导出同一失败记录，再继续C-H；原B不重放。JSON包正式预览与ZIP传输能力分别判定，不冒称Chrome下载过ZIP。

导出层修复已通过410模块测试/alltypes/diffcheck、build-r2/release-check-r2；相同serializer的下载/只读视图、刷新失败报告、HTML转义、密钥轮换、换源失效和剪贴板不可用均有回归。原生成链和自动化机制未改，复用532战斗包与架构门禁。候选install-r2只更新Forge JS/template，16文件HTTP字节核等，保护模块与guide不变，服务常驻。3项手册按新JSON步骤重新review、build/check33项通过。R3在同一Chrome会话读取可见完整JSON并保存普通文件，再接续既有失败草稿与中英文审核，不借此宣称ZIP下载能力已解决。

R3可见导出及旧失败记录恢复通过：完整102402字节，source/model/首IR匹配，原件SHAe9e1d620f1272be499a48f9073d2c98a454f11cfa26fc65a4344f9fbf5fbff6b。已显式启动续跑，最后状态首Actor正式生成；其后官方Chrome DOM/AX/dispatch均超时，最终结果UNKNOWN，没有刷新、取消或重复提交。父控确认Foundry健康，Chrome短CPU样本未见持续增长；同一已保存IR公开正式投影离线38.38ms返回、诊断[]、无Provider/世界写入，仅用于诊断，不升级为实机accepted。R4采用文档化官方REPL重置及同tab重取一次，保留运行页面；必要一张静态guide比较tab区分页面/整体transport，禁止裸CDP/替代浏览器/杀进程或重跑AI。

R4文档化REPL重置后原Chrome页恢复响应，没有导航或重提交；既有续跑已ready_for_gm_review/findings[]。父审实际报告与原IR逐字段相等，actor1 origin=prior-proposal/extraction0/repair0/freshreview1，actor2正常提取及freshreview。正式JSON包重新prepare、source参数与6项引文核对通过：HP90/AC15/Speed30/CR5，Echo恐慌1分钟/WIS10、Quiet目盲2轮/CON13，均目标末可选豁免，Twilight光照和受伤解除完整GM裁定。两Actor的单独formal status仍needs_review，明确绑定整包审核接受，不升级普通Actor门禁。父审原件`parent-english-evidence.json`；英文原包在两次翻译失败后字节不变，截图实际核可读来源摘要/六引文/GM双限定，早先遮挡截图不计通过。

E新失败经逐项源文比较：5处one minute/one-minute被译为新增裸数字1，触发现有严格literal gate；括号样式没有导致本次拒绝。第一次虽设置无效reviewmodel，也在数字门禁先失败，不能称已执行独立review HTTP400；翻译失败保留原包的真实行为仍成立。最小修复是翻译/修复提示要求源词写数量使用等义中文词写数量，原digit/dice/markup保护不变；确定性验证失败把当前field诊断与原稿写入进度，不手改候选或最终JSON。中文卡片GM步骤复用同Actor已批准译文，缺映射标来源语言。新增`test:reviewed-localization`使用现有hermetic wrapper，增加真实失败fixture与变体/近反例；类型、受影响模块和局部anti-overfit在修改点执行，不重跑已接受的A-D或532战斗包。

此修复静态稳定点：localization23项、module411项、all/package types、diffcheck通过。局部anti-overfit使用现有入口显式传入翻译服务/本地化流程/审核卡片/界面四个修改文件；默认3来源扫描不覆盖本次范围，不能拿默认PASS替代。其余IR/生成/运行机制未改，原532业务证据复用。

新增定向修复review确认无阻断；4文件anti-overfit、architecture1295modules/3022edges、build-r3/release-check-r3通过。install-r3只变Forge JS，16文件HTTP核等，原模板/guide/保护模块保持。手册6项逐项核对：三类CLI不自动使用本次中文服务，命令/target/promotion保持；开发条目新增安全focused命令，Forge/战斗包补定向修复、完整独立审核与GM同Actor译文/缺映射说明；build/check33项通过。R5仅正确模型续翻译和F-H，不因修补重放已接受A-D或人为再造第三次错误。

R5 两只 Actor 中文已通过独立审核，包级仅标题轮次 `R2` 与解释性 `configured.*` 的英文残留未通过。保留已批准 Actor 的绑定、原英文包和失败报告，仅修翻译/repair提示及未批准旧标题误作词表的fallback；数字、HTML、身份与英文门禁不变。新增两轮次/两namespace说明变体及双Actor包级两字段续翻译回归：localization26、all/package types、diffcheck通过，窄review无新增阻断。后续check依据为prompt变更的scoped anti-overfit、候选build/release/install身份及handbook watch；UI与规则机制未改，复用411模块、532业务及架构证据。

用户要求后续改用新独立Chrome任务，旧执行器停止测试、仅移交原页面和最小收据。新任务须复用保留的Chrome/标签、核对实际配置和正式接管结果，只补包级续翻译与中文审核、中文候选刷新重预览、双窗口CAS和清理恢复；现有有效A-D不重放。唯一回传仍为当前主聊天，禁止回故障旧聊天。阶段未commit/merge/push。

install-r4准备闭合：scoped anti-overfit1文件、build/release1pass/9assertions通过；Forge仅JS变化，16文件HTTP核等，模板/guide/保护模块不变，未操作服务或世界数据。handbook本次4项stale逐项人工核对并review/build/check33项通过。R6以最小交接派发新独立聊天，不带旧长历史；实际配置与浏览器接管、剩余真实验收等待新执行器收据。

R6真实验收完成：新执行器实际turn_context为gpt-6.1-sol/medium/danger-full-access，官方Chrome按当次openTabs精确对象接管原tab一次成功。包级两个失败字段正常续翻并完整独立审核accepted，两Actor已批准译文及四项绑定未变；Echo/Quiet中文摘要、原文六项引文和Twilight中文GM步骤的光照/受伤双限定均实际可读。中文包刷新后显式正式重预览逐字节相等，确认勾选不继承。双页真实CAS验证较新label保存后旧页clear拒绝，刷新仍保留新记录；随后最新页清理本批，关闭重开为空，原连接12项恢复、key缺席/persistfalse、比较tab关闭、主tab保留，服务与世界文档操作0。未独立抓取HTTP次数，不把代码路径推断当作网络计数；ZIP blob仍NOT_EXECUTED。

父控另用原件与正式prepare独立核对：中文包SHA b2ecd707a08ae6c02b8fc39220d27f310e0cb385c1e56f284f18ee9c78b79a4d、来源hash准确、中文重预览完全相等、两Actor译文对象与R5已批准对象完全相等、数值/原来源/状态参数不变、完整GM限定保留、设置恢复逐值一致；实际查看三张可读卡片及清理截图。证据`parent-chinese-evidence.json`，不替代实机原收据；普通Actor仍needs_review，整包审核与普通门禁分开。

R6发现报告层剩余缺口：成功瞬间的可见/下载报告intake仍source及旧英文packageHash，顶层localization与sourcePackage已正确中文；刷新重预览报告已zh-CN/正确hash。两个原件保留，未改写。源码确认translatePrepared只更新recoveryReport、导出仍取aiReport。追加最小成功后同步修复及定向回归，失败/取消保持原语言、上传包无intake不虚构；相关检查依据是报告同步/serializer与保存恢复边界，需局部模块测试、类型、build/release/install身份及手册watch，不重放已接受的真实Provider或战斗矩阵。

报告层修复闭合：仅在正式中文准备、取消/身份/GM/runtime/敏感内容检查均通过后，将新恢复报告同步为当前可见报告。新组件回归证明立即查看、下载、保存和刷新正式重预览均为相同zh-CN/current packageHash；失败保持原语言报告，上传包无Intake仍为空。414模块测试、all类型、diffcheck通过，窄review无阻断。既有26翻译、532业务、package/module类型和架构证据按影响范围复用。build-r5/release-check-r5通过；install-r5仅Forge JS变更，16文件HTTP核等（JS SHA a224b013e060ce615c4cc79455f9f77a45c804573a7de6ff31ce56fdad2746ab），原模板/guide/保护模块未变，服务未启停。

手册最终核对：恢复/审核/进度/显式JSON入口、失败字段续翻及GM译文边界已同步README、人类MD工具说明与根HTML。报告修复只影响一致性，不增加用户步骤；最新受影响模块条目人工review后build/check33项通过。R6实机使用install-r4，最后报告同步增量用组件真实流程及保存/恢复回归验证，未为内部报告赋值改动重放Provider；该边界不推广为ZIP下载或战斗生命周期新证据。主checkout保持clean；后续用户授权仅提交当前分支，本阶段不merge/push。

提交整理边界：本轮22个源码、测试、fixture、说明与生成手册路径作为一个功能提交，原始Chrome收据/截图/Provider报告留在既有忽略的`.local`证据根。未改业务代码与验收输入，复用既有414模块/26翻译/532业务及类型/架构/构建/真实验收证据；本次提交前执行规定的agents生成/检查、手册一致性和暂存差异检查。不新开浏览器、不重放Provider、不启动服务或清理worktree。

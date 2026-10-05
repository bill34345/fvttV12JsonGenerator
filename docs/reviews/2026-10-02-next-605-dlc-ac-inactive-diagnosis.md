# ServerNext 6.0.5：DLC Other AC Bonus 的 Inactive 归因

日期：2026-10-02（Asia/Shanghai）。本轮用户恢复非暂停 ServerNext 迁移主线；此前“仅同步源码和进度”的边界已被本轮授权取代。五个明确暂停模块及其他明确暂停项继续暂停。当前状态与后续动作仍只由[唯一总表](../plan/server-next-migration-handoff-20260927.md)汇总。

## 当前结果

**ACCEPTED_SINGLE_EFFECT_FUNCTION_AND_ATTRIBUTION。** 精确源码与当前6.0.5实机共同证明Other AC Bonus的+1确实生效，不能再把旧Inactive提示写成来源加值失效。DAE14.0.14常规 `shouldApplyChange` 不调用设置 `change.applied` 的dnd5e原方法；当前值为null，正常Effects DOM仍显示Change Inactive。数值来源无需修复，DAE状态显示／条件链风险单独开放。没有修改效果、AC、合集锁、模块或服务；折叠效果变化行的完整视觉证据仍INCOMPLETE。

## 当前实机父审

revision3原件 `fresh-executor/recovery-editor-r3/native-ac-readonly.json` SHA-256 `f2ac3db2f53e3202ae8f10a1dfee359d3907c9b3d4cf0a22163ce9824348aa04`。父独立解析冻结完整command、一次execution claim和实际输出，核准确Actor/effect/nonce与6.0.5身份，结果为原Actor AC21、memory enabled21／disabled20、delta=1；prepared bonus=1，overrides为+1，disabled=false／suppressed=false／applied=null。仅在非持久内存对照禁用该效果，原Actor来源双摘要保持，pack锁保持，既有文档写入／迁移0。

父实际查看 `ac-attribution.png`：正确火巨人无畏者、护甲21，tooltip逐项18全身板甲＋2盾牌＋1 Other AC Bonus，总21。Effects DOM／AX存在同一effect的Change Inactive；正常Toggle Description操作后行仍collapsed，截图未展开内部change行。因此AC归属视觉PASS，错误状态的DOM证据成立，完整change视觉仍INCOMPLETE，不为补图解锁或改数据。

父复算Macro baseline与after完整90 ID数组，二者相同，且与revision2最初baseline相同；旧RS6wcQZkQpyilF1l及本次MYikJDxU5zc7wtyA均在after缺席。command SHA与冻结候选完全一致，一次领取早于真实输出。页面关闭与service保留沿用执行器原件，父未重新进入浏览器。最终父审 `parent-final-acceptance.json` 记录分层结论与原件hash，不以执行器的PASS标签替代原件。

本切片闭合的是“这一效果是否贡献原+1”，不是DAE全功能、所有条件、全部DLC、所有UI或修复DAE源码。DAE状态提示与原方法被绕过的条件风险继续记录；本轮不叠加+1、不改玩家规则、不自动安装DAE补丁。

## 当前身份与来源

- 工作树：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration`，分支 `codex/20260919-151319-server-next-migration`，HEAD `61974058f1af4e0f70fc675a0c856cae07d99a8f`。开工展开 status 为 220 个 dirty/untracked 路径，索引为空；初始逐文件 SHA-256 记录在本树 `.local/next-continuation-20261002/initial-dirty-fingerprints.json`，未建立文件备份。
- 本轮重新查询 listener、进程 command line 和 OS owner：PID 39528，`127.0.0.1:30002`，`F:/FoundryLab/foundry-v14/data/server-next`，world `cor-cotn`，Core `14.368`、dnd5e `6.0.5`、Node `24.17.0`，owner `WIN-3TTP5EKR0CD/Administrator`。正常 `/api/status` 返回 active=true、users=0；此结果不是其他任务已释放服务的证明。
- 官方发布 API 本轮比较仍选最新非 draft、非 prerelease 的 [release-6.0.5](https://github.com/foundryvtt/dnd5e/releases/tag/release-6.0.5)，没有系统更新需求。AnySearch 提取 API 返回 `Unable to extract content`，web open 亦不可访问；直接只读官方 API 请求取得版本与发布日期，未改配置或密钥。
- Context7 `/foundryvtt/dnd5e` 的限定查询只返回官方 Wiki 的通用 AC 路径说明，未当作 6.0.5 固定来源。对应本地 tag 源码为 `F:/FoundryLab/reference-cache/dnd5e/6.0.5/repo`，提交 `3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc`；实际安装 bundle 中的相关方法与缓存方法在归一 CRLF 后逐字相同。
- DAE 使用实际安装的 14.0.14 `module/dae.js` 及 `module/Systems/DAEdnd5e.js`，[作者清单](https://gitlab.com/tposney/dae/raw/v14/package/module.json)是来源入口，不以清单声明代替行为接受。本轮未升级或重新安装 DAE。

## 精确问题与反证

目标为 `Compendium.5e-dlc-monster.modengken-duoyuanguaiwu.Actor.0NvFibF8HEHoRR10` 的效果 `WhNngS9xnhhHeTRv`，名称 Other AC Bonus。私有原始来源记录保存 `system.attributes.ac.bonus`、value=`+1`、type=`add`、phase=`initial`、priority=7；效果未 disabled，Actor 使用 default AC，装备包含板甲18与盾牌2。来源不是建议新加一条 +1，更不能为消除提示叠加第二条效果。

精确 Core14.368 的 Actor 在收集效果变化时调用 `effect.shouldApplyChange(change,{phase,replacementData})`，随后复制变化供实际应用。dnd5e6.0.5 原方法在阶段／条件检查后设置 `change.applied=true`。效果控制模板根据 `ctx.applied` 选择 Change Active／Change Inactive。

安装的 DAE 注册为 `MIXED`，常规路径的 `daeShouldApplyChange` 直接返回有效阶段是否等于当前阶段，没有调用 `wrapped`。从实际 DAE／Core／精确系统源码提取函数的窄 VM 复现结果为：

| 检查 | 实际结果 | 接受边界 |
|---|---|---|
| 原生阶段匹配 | eligible=true，applied=true | 精确源码控制 |
| DAE 阶段匹配 | eligible=true，nativeCalls=0，applied=null | 标记缺失机制成立 |
| DAE 阶段不匹配 | eligible=false，nativeCalls=0 | 没有把所有变化放行 |
| 条件 false 的额外反证 | DAE 返回 true，nativeCalls=0 | 显示绕过不只影响标记；仅源码风险，不是本轮完整条件实机接受 |

最小可推翻检查：在当前6.0.5客户端，读取原 Actor 的准备 AC／bonus／overrides 与 applied，再以其当前完整来源构造启用／禁用该单一效果的两个非持久内存 Actor。如果差值不是1，或原对象来源变化，撤回“仅显示提示”的候选解释，保留实际失败并进一步归因。内存差分与普通 UI 是不同接受层，不能相互替代。

## 共用工具的实际使用

没有修改共用工具。先读取旧文件侧合同 resume：阶段 REVIEW，收据 `593a68a8-f374-4e09-bd17-c81f56e83721`，原操作未重放。新检查绑定当前 HEAD、适用 AGENTS 与本轮两份探针候选：

1. 首个新合同 `54ba6bdf-485c-4e20-88fa-2b465455c4c5` 正式检查在比较缓存 LF 与安装 CRLF 的方法文本时拒绝，收据 `b2dcb9f3-50c9-43e7-8150-be1f0c0c623b` 为 INCOMPLETE/tool。真实方法内容相同，修复本轮检查器的换行归一；原失败原件保留。
2. 候选变化后建立新合同 `122769fe-5d83-4fdc-868d-a4bf228aaac2`，prepare／ready／execute 通过。首次显式 collect 命令的 PowerShell 参数表达式产生空 `--receipt=`；先 resume 读取既有操作，再用准确绝对路径 collect，没有再次 execute。
3. 新收据 `9249cda1-4a7b-40e9-8b5e-76f5a7a4adc3` 为 behavior=PASS、evidence=COMPLETE、cleanup=NOT_REQUIRED、自动 parentReview=PENDING；父读取真实 stdout、源码与反证结果后只接受 SOURCE_ATTRIBUTION。原件 SHA-256 `bb516abe926976259771e5cca35f739abfb046531d7e336e039a45d06fcf734a`。resume 仍返回 REVIEW，不改写自动父审字段。

本树 `.local/next-continuation-20261002/ac-source-reproduction.json` 保存相关实际源码 SHA-256、逐项结果与 runtime=NOT_EXECUTED；`ac-runtime-readonly.js` 已过语法检查，不能因此写实机 PASS。

## 下一动作与边界

**最新工具层恢复：** 全新执行器revision2保存／重开读回探针后停止于BLOCKED_COMMAND_BYTE_GATE，probe执行0、executionClaim不存在、Actor UI未执行。父解析完整command原件：原文件3172 UTF-8字节，实际保存3171字节，除唯一末尾LF外逐字节无差异；执行器的3160／3159是JS字符串长度，不能作为UTF-8字节数。原源码与全部失败原件保留。提供新的 `ac-runtime-readonly-editor.js`，直接冻结已经实际读回的3171字节，SHA-256 `a6d894117268e72c73da3a351e21b7e7f7ed03be6e29c386d28e6cabfad184ef`；没有对任意内容放宽哈希门禁或修改业务规则。

新文件合同 `8822e67c-5df2-4cdc-8bf6-21a80896bb23` 对新候选执行syntax／真实来源-读回字节核对，经prepare→ready→execute→collect→resume完整往返；收据 `c48485e6-5e3b-4700-b79a-f2f41231d3c5` 为PASS／COMPLETE／NOT_REQUIRED、自动父审PENDING，父只接受EDITOR_BYTE_BOUNDARY。旧源归因检查未重跑，共用工具未修改。runtime合同现在revision3，证据根为fresh-executor/recovery-editor-r3，不覆盖revision2原件。

旧出生Macro `RS6wcQZkQpyilF1l` 的首次删除后即时目录仍旧，执行器新页面核缺席／90基线不变并正常关闭两页。父已读取完整保存命令、清理摘要并看清理画面，但旧收据没有保留完整after ID数组；下一切片创建前须保存新的完整baseline并与原90 ID逐项核对，同时确认旧ID缺席，最终清理保存完整before/after数组。当前完整集合不变的旧自动摘要不是独立逐项父审证据。没有把这种证据补齐变成重新执行AC或迁移。

**当前路由已按用户最新要求改为全新执行聊天。** 用户指出旧聊天上下文过多，明确要求新thread配合现有共用工具。父取消旧派发，读回 `runtime-readonly/cancelled-before-browser-receipt.json`：CANCELLED_BEFORE_BROWSER_WORK、browserSetup=false、pages=[]、macros=[]、executionClaim=null、probeExecutions=0、既有文档写入0，无需移交或清理浏览器对象。

全新聊天“ServerNext 6.0.5 DLC AC 独立验收” UUID `01a0f84f-d578-7000-adb1-260bf20a1861` 已创建，未fork历史。当前合同改为 `.local/next-continuation-20261002/fresh-executor/current-chrome-dispatch.json`，dispatch `5bc938c1-cd4d-49d1-b5e5-8fabf0eaf373`／revision2；正确父回调UUID保持 `01a0f838-b129-76f1-af31-8f26ec995bbe`。前置通过后已获一次限定检查与精确清理授权，工具确认新聊天与放行消息均已接受。创建后只按宿主要求做一次timeoutMs=0快照，无后续轮询。

新聊天只读取当前合同、适用指令、冻结探针和共用工具合同／原件，使用现有acceptance resume，不重开发工具、不重放文件侧检查、不读取旧聊天历史。先自行核最新实际model/effort/权限、宿主原生Chrome能力与服务／客户端，随后只做限定只读AC检查。新聊天实际配置与实机结果仍待其回调收据，不以父期望字段提前确认。

下列旧派发过程仅作历史归属记录，已被新路由取代：

新的 6.0.5 只读合同为本树 `.local/next-continuation-20261002/current-chrome-dispatch.json`，dispatch `38b66e23-0777-49a0-aa11-33c4a73bc012`、revision=2（补入用户明确发送授权及冻结command哈希），回调父 UUID 是当前聊天 `01a0f838-b129-76f1-af31-8f26ec995bbe`。它不复用旧6.0.2运行adapter或旧父 UUID。

拟复用已有聊天“ServerNext 外部模块首批 Chrome 验收” `01a0ec4b-9484-7dc0-a727-e8d4b9b347b5`，期望配置 `gpt-6.1-sol / medium / Full Access`，仍须执行器核最新实际上下文与共用服务。合同只允许当前单一 Actor 的读取、两个内存对照、普通 Effects／AC UI 与本次出生 Macro 的精确清理；不投骰、不重载、不迁移、不写既有文档、不改模块开关／安装、不停止服务。

宿主跨聊天发送工具要求用户明确授权向目标聊天发送。用户已明确回复“允许复用该执行聊天并回传”，在用途说明后再次回复“行，继续处理”；发送与回调授权已满足。本轮重新核listener／status／HEAD／冻结command哈希并读取文件合同resume后进入派发步骤；最终派发收据与原件放在本树同一证据目录。收据及实际源码／版本变化时重新核对绑定。

本合同已通过native send_message_to_thread发送一次，工具返回正确执行聊天UUID且无错误；发送收据为同目录 `dispatch-delivery-receipt.json`，状态DISPATCH_ACCEPTED_AWAITING_CALLBACK。这只证明派发被接受，效果行为／新UI／Macro清理的实际结果尚未收到，不能提前接受。父不轮询，在完成或真实阻塞回调后审查原件。其他DLC图标、雅灵、旧Pixi错误仍开放，五个明确暂停模块仍暂停。此前十模块、Midi、VM与49字段修复证据没有重跑；本轮没有commit、合并、push或新增Foundry实例。

派发前父指纹复核为初始220路径／当前221路径，仅唯一总表发生本轮授权变动，其余219既有文件不变，新增路径为本轮专题报告，索引为空。两份文档的相对链接和尾空白检查通过。文件侧操作已领取后ready按设计拒绝重放；没有把该拒绝转成新的运行操作，也没有再次execute。运行合同使用独立dispatch，不冒用文件合同作为Chrome运行adapter。

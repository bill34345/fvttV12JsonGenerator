# 开发反馈工具：Vision5e + Item Macro 实机接续

日期：2026-09-30。状态：父审 ACCEPTED_LIMITED_SCOPE，限定实机链与恢复／清理闭合。范围为既有 ServerNext 的 Vision5e 3.2.2+servernext.1 与 Item Macro 3.0.1+servernext.1；完整模块支持、后续迁移、生产和长时测试不在本轮。

用户继续[试点计划](../plans/2026-09-29-development-feedback-pilot.md)的下一步；本任务承接该限定实机试用及原有提交／合并授权，暂不 push。旧业务树、候选与暂停合同保留，不自动提交既有内容。

## 进入实机前的结果

- 原服务聊天无运行中工作；检查时 Next／Mirror 均无监听或对应进程。旧服务 PID 不作现状证据，既有 Next 需要一次精确冷恢复。
- 原两个候选的安装校验通过，目标目录为空，未安装时即完成候选资源与身份核对。
- 复用原 Chrome 执行聊天做了一次无服务前检：实际本机 turn_context 为 gpt-6.1-sol／max、danger-full-access／never；官方 Chrome 初始化、现有标签读取通过。未导航 Foundry、未登录或修改世界。
- 前检原生消息回传到当前父 UUID；运输回执中的实际接收者与期待值一致，父任务收到同一 dispatch／revision。它证明这次消息送达；不推断结束父 turn 后一定自动唤醒，也不推断后端实际计算模型。
- 主区5条、审计树12条、ServerNext368条与 WMP161条既有未提交路径已记录字节指纹，索引为空；整合前后按同一算法核对。

## 本轮共用增量与验证

新增 `prepare-runtime`、`ready-runtime`、`claim-runtime`、`collect-runtime`。运行合同引用原文件侧合同及当前明确恢复记录，绑定当前父／原执行聊天、实际配置、服务收据和实现字节。派发前再核对当前服务 PID／创建时间／owner／命令行、HTTP 世界与版本，以及安装候选字节。失配不进入消息回调，领取后不自动重放；实际聊天发送仍由获准宿主负责。

证据收集核对新运行 dispatch／revision／父子 UUID／合同指纹与旧宏 sourceDispatchId，固定原生读回、独立上下文及其他证据的指纹，幂等读回。数值和事件记录用于 API 数据观察；界面、玩家视野、刷新和完整清理仍由父任务看实际证据。收集成功保持 behavior INCOMPLETE、parentReview PENDING，不把标签当接受。

| 检查 | 实际结果与范围 |
| --- | --- |
| `bun install --frozen-lockfile` | PASS；仅新任务工作树的锁定依赖。 |
| `bun run test:acceptance-tools` | PASS，63项／407断言；包含原文件侧与离线接入，以及5组新的恢复／配置／服务拒绝、运输领取与回执检查。合成上下文和服务探针仅是协议向量。 |
| `bun run typecheck:tools` | PASS。 |
| `bun run architecture:verify` | PASS；依赖与循环检查。 |
| `bun run test-isolation:check` | PASS；测试不读写持久 Lab。 |
| `bun run agents:generate`／`agents:check` | PASS，32个必需指令文件；生成无差异。 |
| PowerShell 服务探针／私有冷启动脚本 | 语法 PASS；实际两个候选安装字节一致、既有 Next 冷恢复及精确现场身份 PASS。当前进程创建时间通过，合成错1秒收据被拒绝；仅只读核对服务。 |
| `bun run handbook:check` | 合并前 PASS，28条工具；已人工对照新增入口、授权、结果和限制。合并后另记。 |

首轮聚焦检查的两个失败已处理：测试把 JSONL 元数据写成多行 JSON；另一次在检查运行期间修改了受绑定的实现，合同按预期过期。类型检查的两处类型声明已修正。修正后相关整合检查63项通过；这些准备期返工不算业务验收通过。

本轮按当前用户要求保持主控与执行聊天模型／effort一致，与原计划 Astra/max 的比较边界不同；未做模型 A/B、三任务时间／token对比或提速结论。

实际接入发现两处准备边界差异并已处理：读取被宿主持有的 JSONL 时使用共享只读方式；PowerShell 7.6.5 自动将 ISO 时间转为 DateTime，进程创建时间改为比较 UTC ticks。后者已用当前真实服务的原收据及明确标注的错时间收据做反证，接受前者、拒绝后者；不是绕过创建时间检查。安装／启动成功后没有重放这些写操作。Mirror 启动前后均无监听，状态保持原样。

## 实机验收与剩余项

这些所需步骤已实际完成：仅启用两个候选；宏的 UI 保存／重开／执行；60→90→60 API；手动参数与真实活动 API；玩家近处可见／远处不可见及刷新；GM刷新读回；错误分阶段记录；精确归属清理和原场景／设置恢复。归属诊断与准备修正只重做受影响的清理入口，未重复 WMP 或本批已通过行为。

父任务必须看实际原件和画面后再判断此限定范围是否通过，记录保留对象／服务及清理结果。全 Vision5e 感官／墙体／语言与 Item Macro 其他系统／旧用法仍未接受；本地结果不能代替生产或长时接受。

本地证据保留在专属 evidence 目录，完整日志和图片不进入仓库。源合同 `NEXT-VM-20260929-03` 保持只读；新运行合同的派发 ID 单独生成，并由当前持久交接文件指向。

## 实机回传与限定清理接续

原批次已取得界面保存／重开／单次执行、60→90→60、手动及活动 API、Player 初始／刷新视野、GM 刷新持久化的真实原件。父任务查看实际截图和数据，独立复算101个模块开关，只有两个候选由 false 变 true。共用收据收集得到四项 API 数据观察 PASS，整体仍保持 INCOMPLETE／父审待完成；实际收据 ID 为 `6ffc6d2c-efc8-4829-9179-6d6736ff4229`。

原 Cleanup 单次在恢复／删除之前被归属 guard 拦住，没有重放。只读诊断定位到测试 Target Actor 上额外的持久化 `dnd5einaudible00` Condition，三个本任务 marker 视图均为空；`isTemporary:true` 不能把它认作非持久化对象。原始 Actor 在 Prepare 前不存在，输入 `NXVM2901SilentAA` 与该条件创建间隔15ms。诊断还确认三枚 Token 的 source/runtime hidden 均false、alpha均1，玩家画面不依赖手动隐藏。

精确现场 DAE14.0.14 的 `module/dae.js` 显示：`updateStatusEffects` 排队，`reconcileActorStatuses` 从活动输入效果推导状态，`toggleActorStatusEffect` 用 `fromStatusEffect` 在同一 Actor 下创建标准 Condition，并设 `flags.dae.autoCreated:true`。此前诊断未读取这个标记，因此限定恢复先做只读 readiness，必须读到 actual/source 自动标记并匹配父／ID／输入／状态／出生时间／完整集合，才允许一次恢复清理。未知、手动或额外对象仍拒绝，不能给条件补归属。

新增专属纯归属检查先通过5项／17断言与类型检查。实际恢复 readiness 已读到该条件 actual/source `dae.autoCreated:true`、正确 subtype/input/status/birth，归属事实补齐；但准备包的 IIFE 没有建立 `NextVmCleanup` 绑定，返回 ReferenceError，检查函数未执行，零次恢复／删除且没有 started ledger。这是父任务准备错误；语法和函数单测不足以证明打包后的实际入口。

改用显式本地 CJS exports 绑定，新增真实旧 IIFE 反证与新编译入口正反检查，共7项／21断言通过。修正编译产物实际调用已保存的真实只读 snapshot 通过，不连接世界、不制造数据；这是入口回归，不是新实机清理结果。准备修正包复用原 Recovery ID `H5iVmCFvcmSjILou`，同一恢复 dispatch revision2，只通过正常原生导入替换本轮自己创建的工具；旧 Controls、业务树及所有原件不变。实际原值恢复、完整缺席和宏闭合仍待此次回传，尚不宣布整体通过。

Revision2又停在父任务追加的导入前证据条件：精确ID、唯一 nonce 的原生 gate、旧命令指纹及完整 `phase:not-started` 回执已取得，但普通界面不暴露第二个批次标签；一次正常导出下载超时。没有换工具表面、API、CDP 或重试去绕行。父任务澄清自己写的冗余要求：这些实际证据足以证明当前新建辅助宏归属，同一已审核 Macro 的正常原生导入不需要另读一般分批标签。Revision3依此接续，Actor／效果等所有删除归属门禁保持原样，不新增读取宏。该准备期沟通返工单独记录，不能计作业务复测或用户授权问题。

已观察到的旧 Item 初始化／Pixi 视频回调错误按阶段保存原文指纹和调用帧，根因仍开放，不宣称零错误。手册正常 file: 浏览器导航被 URL policy 拒绝，渲染抽查为 NOT_EXECUTED；源码文义、生成一致性继续核对，没有用其他浏览器表面、文件服务或重包装绕过。

## 最终父审与闭合

恢复 dispatch `4daf5cf4-d3d3-402a-939e-f5896759469e` revision3 已在同一精确 Recovery 上完成正常导入、重开与命令读回。新现场 readiness 对 actual/source 自动标记、完整对象集合、身份、出生时间及恢复值通过；恢复清理只执行一次，原生10个操作全部 completed。执行窗口为 UTC 11:54:59.537–11:55:01.478，仅是该操作时长，不是总验收耗时。

原 active/viewed `k0tDQjWqrbvHbjdu`、paused=true、defaultmacro=false由原生回执和正常UI再次核对。本轮两Actor及已核对后代、Scene／三Token、Folder、Player、Controls、Inspector全部缺席；保存完整回执后正常UI删除精确 Recovery，三个 Macro均无残留。自动Condition仅随本轮新Target Actor删除，不扫描其他Actor或给未知对象补owner。101个开关与after-enable基线零差异，初始差异仍仅两个候选 false→true。Next PID508留常驻，Mirror状态未改。

父任务看实际玩家／编辑器／最终缺席画面，独立比对原值与集合，再核对64份旧 native/context/input/artifact指纹均未改变。最终证据输入引用原业务与新恢复原件，保持旧失败回执不变。共用收据 `5065ee6e-e95a-478b-9c94-3401ce54dfec` 自动层仍为 OBSERVED／INCOMPLETE／PENDING；独立父审 `parent-final-review.json` 接受本限定行为、恢复与清理。这两个层级不混用，第三方模块全面兼容性仍未接受。

证据根为 `F:\FoundryLab\foundry-v14\evidence\server-next-migration\vision-macro-20260930-feedback`。关键原件是根目录的 `parent-final-review.json`、`parent-final-runtime-evidence.json` 与 `native-pre-cleanup-gm-reload.json`，以及 `cleanup-recovery-3/readiness-native.json`、`recovery-native.json`、`clearance-proof.json`、`macro-closure-proof.json`、`module-switches-final-ui.json` 和实际完成回调收据。当前持久交接阶段已设 PARENT_ACCEPTED_CLOSED，只关闭这两个模块试用；旧源合同和其他迁移批次的暂停不被扩大解除。

聚焦检查最终为原有63项控制流检查加专属7项归属／编译入口检查，分别记录、不重复全仓或玩法。类型、架构、隔离、指令生成与手册一致性门禁通过。手册渲染抽查的政策拒绝和旧世界错误族仍作为独立限制保留。

描述性测量：一组fixture、零次已通过业务重放、一次原归属拒绝、一次编译命名空间失败、一次冗余导入前置阻断／下载超时、一次最终恢复清理；没有再次向人类索取恢复／清理授权。主动／等待分离及token未归账，未完成三任务对照，不报告提速百分比。经验是先验证保存后实际入口，再派发；对已明确归属的新辅助宏复用足够的任务 nonce／ID／命令／ledger证据，避免制造额外前置。

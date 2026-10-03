# Batch6AB：全新任务，原始证据与原生日志验收

唯一workdir：I:\OpenCode\fvttV12JsonGenerator-worktrees\20260919-151319-server-next-migration。
branch codex/20260919-151319-server-next-migration；HEAD b0396c3b6f3950d0dfdc5ec88de2bf558c1bff6d；保留dirty，不切换/创建worktree、不提交。

目标仅外部Chrome / http://127.0.0.1:30002/game / cor-cotn / Foundry14.368 / dnd5e6.0.2 / local.7。ServerNext data F:\FoundryLab\foundry-v14\data\server-next；主任务已验证PID34548，但执行前只读再核实；不启停、不重启、不清锁。Mirror/30001只读。浏览器传输已修复，不改工具代码/策略/代理。

## 范围与已有事实

本轮只执行C06/G03/G04/G05及当次Z02。既有A01–A05、B01–B04、C01–C05、D01–D04、E01–E03、F01–F04、G01–G02、Z01不重测。C06/G03仍未关闭，不能用旧summary当PASS；Z03/Z04归主任务。

AA原始C06第一轮已证明正常回合里active→expired、AC bonus5→0；但duration/start采集为空，自编聚合谓词错读before.effect（实际在before.actor.effect）。AA补交G03 own/offscene raw实际是9/21旧Q聊天，不能作为本轮renderer验证。AA日志wrapper对象省略且时间/URL空，不能归因32个console.error与1个rejection。此次是针对这些具体证据缺口的短验收，不重新跑整个矩阵。

## 必须先建立可靠证据通道

1. 主任务实际核实本新任务Luna Max和Full Access/never后才执行。不递归委派。读官方浏览器工具最新文档，明确选择Chrome，按当前URL取得有效tab。若旧id无效，重新按已知URL绑定/新建目标tab，不在释放后的旧tab取日志。
2. 用户已授权ServerNext Gamemaster空密码正常登录。核对目标版本及local.7六函数指纹；bundle SHA256 1BF57FB02BCBB0C67A53CEBF38763F527DE11D872C7DB8ED5A32249871048BAC。只读确认9个自有root的ID/名字仍吻合交接。先保存本轮完整baseline，包括实际shared/viewed Scene UUID、active/viewed Combat UUID及round/turn、worldTime、targets、配置、仅准备过的自有HP/slot。不要用历史常量恢复。
3. 在活跃tab读取官方tab.dev.logs及tab.capabilities.list()。如列出cdp，用capabilities.get('cdp').documentation()读当前API。官方API为capability.send(method,params)及readEvents({afterSequence,methods,limit,timeoutMs})；禁止外接CDP/原始socket。
4. 用官方CDP被动观察Runtime.exceptionThrown、Runtime.consoleAPICalled、Log.entryAdded、Network.responseReceived、Network.loadingFailed（需要时正常enable对应domain）。开始操作前取得cursor并记录本次开始UTC；按readEvents返回cursor/hasMore分页，truncated必须明确记录。期间每一病例后立即落盘，不等释放tab后再取。
5. 仅保存允许字段：console的level/UTC/primitive value或协议已给的description/stack callFrames（URL去query/hash）、资源URL origin+pathname/status/type/errorText/timing。不要保存headers、Cookie、Authorization、POST/request body、response body、任意对象内容、远程objectId或账号身份数据。被动采集，不写页面状态、不修改workflow。不要使用AA自编console wrapper；不需要完整网络body来满足G05。
6. 原生console logs若只有有限历史，记录窗口起点并按时间/事件序号区分基线与新增。记录当前Troubleshooter实际列表，与历史10条Calendaria对照。G04要求实际分析新增错误；不能因capture成功/drop0判PASS。G05按实际资源异常及归因、覆盖限制验收，不把status0直接视为成功或失败。

## 两个功能病例：使用主任务固定脚本

通过正常Macro编辑/执行UI使用现有Macro.GcNaY7ZO5aaqZo4n（保留名字）。必须从文件原文填入，不自行重写缩短逻辑，不另造聚合结果。

- ab-damage-tray-readback.js SHA256 D74B6B89C8A27274A37A8BD62634EC7CD330470B101139592AF9DF674877CECC
- ab-shield-expiry-diagnostic.js SHA256 B43E5C0AB17A6AE1E1FF0A8C1E419708AA9511EDC3FD6FD3D5EDE0486F1C8BCB

两者相对已审查原R脚本只改case和发布过程：正常ChatMessage.create取得真实uuid后写入report.messageUuid并更新完整JSON，whisper只发当前GM。已语法检查及独立审查通过。执行后以通知和报告内messageUuid为锚定位本次消息，立即保存完整原始JSON。必须核对case以AB开头、at为本轮、messageUuid与实际message DOM对应；不要从聊天历史里随意抓第一个同名报告，更不能拼接不同运行。

### G03

- 只测试ChatMessage.90TrRGP4xYe3ppO2中的midi-damage-application真实组件。
- 本客户端正常view自有Scene.RyluHOjH0iBC7xro；按正常UI选择tray recorded/targeted模式；运行AB readback，确认actualMidiRenderer=true、presentation.shouldBuild=true及真实Token行可操作。
- 正常view共享/无此Token场景，再运行同文件生成另一独立AB消息，确认Actor-only行unavailable/disabled、没有option且HP不变。
- 返回自有scene再运行同文件确认有效Token恢复，正常Apply一次，读取HP变化与实际damageList，然后仅恢复自己造成的HP差值。
- 每个phase保存自己的完整原始报告及messageUuid，包含本轮timestamp。不要用hit/target-select header或Shield效果卡代替。

### C06

- 正常view自有Scene，再运行原q-combat-view-preflight.js；确认game.combat为自有inactive Combat.xYa05YifCrc4A3Dh，不激活共享遭遇，不推进worldTime。
- 如需slot仅为自有Target正常准备并记录原值；经正常角色卡施放/Apply Shield，确认唯一active Imperceptible Barrier。不要手动创建效果或写expired/start/registry。
- **在正常新施法之后**原样运行ab-shield-expiry-diagnostic.js。它自带active effect count及GM/registry guard、完整e.toObject、startCombatUuid、sourceActor、expectedExpiryPredicate、Hook事件、own native next round、sharedBefore/After。
- 保存此一次运行完整报告，包括before.effect.duration、start/source、after.effect.duration、active/registered/AC变化与事件。若guard/调用失败，保留实际错误并回传根处理，不自行改宏继续试、不把失败包装成已通过。
- 第一轮到期后不要对同一expired效果再推进回合来“补证明”。不要使用AA错字段谓词。

## 收尾与证据

- 在tab仍有效时收齐原生logs/CDP事件并保存分页/截断/时间信息、Troubleshooter读回，分析归因。若有具体Midi缺陷，保存最小复现与异常栈；不修改源码。
- Z02按本轮baseline compare-before-restore设置/视图/tracker/targets/自有准备状态；他人介入值不能硬覆盖。正常API完成后保存完整UUID和前后字段。若使用临时观测订阅，结束相应订阅；不要更改工具权限或刷新抹掉证据。
- 不删除九个root；给根实时UUID/状态清单，保留ChatMessage。关闭自己开的Macro/Actor编辑窗口，释放浏览器给根作Z03。自建目标tab若需根继续使用须markHandoff；不得final之后才想起取证。
- 无总体时间上限，每步合理超时，不无限重复失败。不能切换控制通道绕过实际拒绝。

证据目录 F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6AB-midi-qol-native-observability-20260922。
逐编号results-by-id.md，引用原始JSON/日志与确切messageUuid，summary必须与raw一致。真实callbackThreadId=01a0c666-44c3-7010-8d64-7eb1582a5d7f；完成或实质阻碍先send_message_to_thread，前缀Chrome 子任务回传，说明已释放浏览器，再final。不要归档、不递归委派、不修改总清单。
# Batch 6 AG：DAE / Tidy 功能验收与 AC5e 升级前基线

主任务：01a0c7c6-7a6d-7b41-9928-8046cab1de36。仅在独立Luna Max执行器的真实turn_context核实never / danger-full-access后放行业务；预检阶段不执行Chrome。Fast未经配置证明，不宣称启用。

## 精确目标与边界

- 唯一仓库workdir：I:\OpenCode\fvttV12JsonGenerator-worktrees\20260919-151319-server-next-migration。branch codex/20260919-151319-server-next-migration；HEAD b0396c3b6f3950d0dfdc5ec88de2bf558c1bff6d。全部命令显式workdir；不新建worktree、不提交、不编辑源码、不安装模块。
- Chrome唯一测试目标：http://127.0.0.1:30002/game，server-next / cor-cotn / Foundry14.368 / dnd5e6.0.2。先核对当前listener/PID/dataPath。PID34548是派发前证据，不能替代实时核对。
- 保持服务常驻；不启停/重启/退出世界/清锁，不写mirror/30001，不直接读写运行中LevelDB，不创建备份。仅精确自有正常API测试文档，可清理自己创建的精确UUID。
- 当前Midi local.7 bundle SHA256：1BF57FB02BCBB0C67A53CEBF38763F527DE11D872C7DB8ED5A32249871048BAC。已完成35项不重跑。DAE14.0.14、Tidy14.1.2、AC5e旧14.533.19.2。AC5e新14.603.2只在外部证据目录下载，尚未安装；本轮不为旧版AC5e做整套失败测试。
- 已有ServerNext Gamemaster空密码登录授权有效。若无法登录，不搜索凭据、不读取profile/cookie，报告准确阻碍。
- 用户已取消整体E2E时间上限；每次网络/动作有界超时，不无限重试。预留自有fixture恢复和清理。

## Z0 现场基线与证据

真实采样URL/world/version、六模块及HUD core的installed/active/version、当前user、active/viewed scene、当前Combat UUID/round/turn、worldTime、targets、Midi config及workflow集合。Midi配置必须用MidiQOL.configSettings()；Workflow集合如Map用keys()。记录本轮读取时间，不硬覆盖旧值。

采集DAE相关settings、CONFIG.ActiveEffect.expiryAction、Tidy实际sheet注册和当前客户端偏好；AC5e的lastMigratedPoint、设置与ready API（有则如实读，没有不能伪造）、模块告警、当前加载资源版本。AC5e新旧迁移阈均14.533.6.2，父方更新前需要确认真实实值。

证据根：F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6AG-dae-tidy-ac-baseline-20260922。证据需要真实完整工具输出或页面原始报告及ChatMessage UUID；不可手工转写摘要命名raw。报告分别记PASS/FAIL/NOT_EXECUTED。说明观察窗口和截断状态，输出不能夹带Cookie/headers/凭据。

## 独立玩法范围

DAE：真实打开DAE效果列表/配置UI、在自有Actor/Item上配置并保存支持的效果字段；验证效果派生值、禁用/重新启用/正常删除恢复；证明transfer/equipped状态下效果行为。DAE独有功能需通过具体代码/文档支持的路径测试。普通Shield自然到期由dnd5e原生负责，不能冒充DAE特有PASS。已有Midi C01-C06、D01-D04和F02覆盖保留原证据，不复建旧fixtures。

Tidy：在自有PC/NPC明确选择并打开Tidy卡，核实真实sheet class；分别验证PC/NPC的可见字段和嵌入Item/Activity编辑保存、关闭重开读回；从Tidy卡实际发起一个Activity，经当前Midi工作流得到真实聊天/骰子与自有目标HP或资源变化，恢复自有资源。单纯调用API activity.use且没点击Tidy界面不能冒充Tidy集成操作通过。

AC5e：本轮仅升级前只读基线和当前ready/设置读回，不改模块设置来让旧版通过，不修改manifest。发现现有异常保留原文与触发操作，父方决定新版更新范围。无需为此关闭其他模块。

### 本轮逐项门禁

| 编号 | 操作与预期 |
|---|---|
| DAE-1 | 自有Actor正常DAE效果UI配置movement.walk变化，读system.changes/phase及derived walk；禁用/启用/精确删除后值按基线恢复。普通派生值通过同时记录其原生实现边界。 |
| DAE-2 | 自有装备Item上的transfer effect，装备/卸下或效果启用/禁用时读回Item原effect、origin、Actor实际applicable effects及派生值。dnd6可能直接应用Item effect，不强制要求Actor.effects有复制文档；以实际应用/恢复为判据。 |
| DAE-3 | DAE独有stackable=count或countDeleteDecrement：正常API/UI创建相同origin/name的自有效果，核对实际stacks和name；按对应策略正常减栈/删除。预期由DAE合并为count=2，再恢复；先阅读安装包module/lib/stackingPolicy.js确认触发条件，不直接写stacks来造PASS。 |
| DAE-4 | 当前Midi active时，按DAEdnd5e注册的isDamaged specialDuration让自有效果收到一次实际Midi伤害后到期/移除并恢复derived值；记录实际effect/workflow/chat及expiry设置。无需推进shared combat/time，不构造假的hook。 |
| TIDY-1 | 自有character/NPC实际选择Tidy卡，分别核对constructor与.tidy5e-sheet DOM、切换tab；UI改HP/resource等可控字段，关闭重开读回持久化。 |
| TIDY-2 | 自有Item/Activity从Tidy界面编辑，再从Actor row/action实际点击使用一次；确认ChatMessage、消耗与当前Midi链。Tidy入口与Midi后续结果分别归因，可与DAE-4共用一次操作但分别保存断言。 |
| TIDY-3 | 自有效果在Tidy Effects页的名称/状态/持续显示正确，正常UI删除精确effect后absent、派生字段恢复。 |
| TIDY-4 | Tidy Actor或Item Add Effect创建temporary/inactive效果，关闭重开仍正确，读回duration/disabled/parent，正常UI删除并清理。 |
| AC-BASELINE | 旧14.533.19.2当前active/ready API、lastMigratedPoint、受影响settings和控制栈基线读回；新版14.603.2未装，不判新版功能PASS。 |
| Z-FINAL | 自有root全部absent；本轮改变的偏好/targets/scene view/settings恢复；shared Combat/worldTime无本任务改动，workflow集合正确读回且无本轮残留，服务保持运行。 |

实现导航（已安装锁定包，不是运行通过）：DAE dae.js约35–59/104–107将turn expiry交给dnd6；module/Systems/DAEdnd5e.js约565–578/650–680为派生效果和Midi事件注册；module/lib/stackingPolicy.js约63–97为stack策略。Tidy bundle约56731–56795注册Quadrone character/NPC，约46439–46457为Add Effect入口。行号仅作定位，实际对象与UI以当次运行读回为准。

## 自有fixture与恢复

自有命名采用B6AG-和本次随机标识；每个root记录UUID及owner标记。使用最小PC/NPC、Item、必要Scene/Token；不复用旧AG-MIDI6/AG-L6 fixtures，不借用CRITMAX-HOOK-DEBUG宏，不动未知root。若需要Combat则只创建自有Combat；不推进shared Combat/worldTime。普通接口不满足这个条件就标记未执行并报告，不patch prototype或伪造hook。

结束恢复本轮改变的客户端偏好、目标、场景view和设置；共享世界基线若出现其他用户改变，记录差异，不硬覆盖。仅删除本轮清单中且owner一致的精确自有root；ChatMessages证据保留。最终核对每个root absent、targets/workflow、共享状态及服务运行。任何不确定API动作先读回，不能盲目重复Apply。

## 独立执行器与回传

执行器本人使用官方Chrome工具，读computer-use技能及实际API文档，不递归派生另一个Chrome任务。工具不可用按chrome-delegation-dev/references/troubleshooting.md核实库存和官方入口；保留URL/策略校验，不走替代控制通道。native能力没有就明确报告，不能编造Console/Network证据。

完成后主动send_message_to_thread到callbackThreadId 01a0c7c6-7a6d-7b41-9928-8046cab1de36，以“Chrome 子任务回传”开头，给出自包含结论、模块构建、编号结果、完整证据绝对路径/消息UUID、清理和共享状态、耗时及剩余项，请主任务复核。不向旧主任务回传、不归档。回传成功后自己的final也保留同一结果。
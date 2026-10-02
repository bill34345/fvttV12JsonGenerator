# 伤势所有权迁移候选与整合证据

日期：2026-10-02。topic：`codex/20261002-134635-injury-condition-ownership`，master基线 `61974058f1af4e0f70fc675a0c856cae07d99a8f`。**最终代码、组合CI、Mirror代表行为及恢复均PASS；按已有授权进行本地master整合。** 早期PENDING／FAIL保留时间与构建边界，当前结果以文末为准。

## 用户决定与最终行为

伤势归 Custom Conditions；Trigger Engine 提供 HP 变更事件；消逝灵魂保留独立复活，之后再决定退役。Forge 工作台与 Creature Blueprint 留给用户另开的讨论。instruction-scope 先形成[逐项评估](2026-10-02-instruction-scope-evaluation.md)，随后按用户授权在独立 `codex/20261002-162723-instruction-scope-integration` 中落实选择性规则并完成指令／手册检查，尚未发布；没有直接覆盖旧七份规则。完整验收出口见[所有权计划](../plans/2026-10-02-injury-condition-ownership.md)。

候选为 Custom Conditions `0.2.0`、Trigger Engine `0.2.0`、消逝灵魂 `1.1.0`。CC 拥有 0–3 层伤势、旧数据迁移、HP／休息／自然19–20、投影、管理器及 HUD；复活模块没有 CC 也能开始后续死亡和复活，旧伤势 API 在 CC 存在时转发。旧 injury 原件与未知字段保留，复活只写 fadingSpirits 子路径。

伤势精确门为 14.364／5.3.3、14.368／6.0.5；十九种通用状态和 WMP 的 5.3.3 边界不扩大。伤势没有加入共享生成器的 ConditionId。

## 已修正的实际缺口

独立静态审查发现并完成回归修复：仅含复活字段的新 Actor 伤势迁移；无 CC 的第二次死亡与复活；混合效果的第三方字段和禁用状态保留；同 base Actor 的不同 Token 休息隔离；排队执行重新解析当前 Actor；等待后复核 active GM；死亡 episode 桥接失败后的持久补偿；伤势错误与 WMP／普通状态路径隔离；复活内部读取不依赖伤势 schema；公开迁移入口的版本／开关／队列门；落零和恢复两个事件都迟到时的恢复抑制。

最终定点审查没有仍需阻止集成的静态代码发现。它未将 GM／玩家真实 socket、GM 切换、重载或实际 UI 接受判为通过。

图标已恢复之前选定的 `e8604d64` 原字节：四份 IFS 兼容图和三份 CC 图均为1138字节，SHA-256 `0bbf9c29d30da4e1fbfa55e612adad767282cd8d4c66beefc806fa81d9b832b1`，与 Lorc／Bandaged／CC BY 3.0 署名一致。层数由实际标签与 HUD 数字显示。

## 机械证据

| 检查 | 实际结果 |
| --- | --- |
| CC／TE／IFS 定点测试 | 124／38／54 通过，零失败 |
| 精确旧新安装集合 fixture | 2 通过；随机临时根，已清理，不调用持久 Lab |
| 三模块 typecheck／build | 通过；ZIP 与 build tree 文件字节核对通过 |
| frozen install | Bun1.3.14 通过；bun.lock 未产生差异 |
| Ruler／根规则 | agents:generate 与 CI 幂等检查通过；根 AGENTS 与 .ruler 未改 |
| 手册 | 六个受影响条目逐项核对；28项页面 build／check 通过 |
| 完整 ci:verify | 修正配套工具的旧0.1.1常量后，重新完整运行通过 |
| CI 测试及覆盖率 | CLI24项通过；3056通过、1跳过、0失败，324个文件；生产行85.43%、函数86.66% |
| 其余组合门禁 | 全部类型检查、架构、431来源 anti-overfit、1649 tracked路径 hygiene、5.3.3及current-6参考缓存、Web build通过；White Tusk Shaman离线六物品、零警告／网络调用 |

首次 CI 在 production typecheck 因配套安装工具仍写死0.1.1而停止，失败日志保留为 `ci-verify.log`；修复后的完整通过日志为 `ci-verify-final.log`。没有把首次失败或部分阶段冒充完整通过。

## 本地运行准备与产物身份

证据目录：`H:/CodexData/visualizations/2026/10/02/01a0fa67-2bb8-7e93-bed9-ce2b29452f7d/injury-ownership-20261002/`。本地安装前确认 Mirror 没有 listener／Foundry进程，按完整旧树哈希与精确文件集预检并安装 CC／TE 0.1.1→0.2.0；IFS 按11个既有拥有文件及逐文件前后SHA安装1.0.0→1.1.0。没有删除文件或创建备份；文件安装不构成运行时通过。

| 模块 | ZIP SHA-256 | browser runtime SHA-256 |
| --- | --- | --- |
| Custom Conditions0.2.0 | `9306152004d735efd60caa44150e1486b779076a369479207cbd840a2fe4c09c` | `e3deb57f26bec141dce34d1c5bca351960d61476a05b336fe8ae25245d4ac364` |
| Trigger Engine0.2.0 | `c8b56fc227cbdb7415ab41f232fa6e5f88fd8b8afc740be4658c7bcd121f990e` | `bef0559c20c049dd24fd666a61b3fc4c3994017aa93930ee055cddb16fa5fba2` |
| 消逝灵魂1.1.0 | `c023e07fd0515f350e8f9c211409672304eaf9816c1a6a9b5726cc87d7cf44ca` | `42ca364f2e86fec9c3b35a0759391fcba5f3d15cde475421f08a0b85865855c1` |

隔离目标为同一个 server-mirror 的 `fvtt-v14-module-matrix`，不另建 Lab。停服期间只读记录：原十个 Actor、三份既有伤势状态、两个伤势投影和十个启用模块清单，均无数据库写入。启用新 CC 后的自动迁移及测试清理须按该选定字段收据核对；场景、模块设置和既有数据恢复属于验收出口。

启动时首次误用世界环境变量，进入 cor-cotn；预检明确判为目标不符，未派发浏览器。确认是本轮启动的PID58492后，通过正常工具停止；改用实现规定的 `FVTT_OPS_WORLD_ID` 再启动隔离世界，保存前后收据。这次纠正不触碰 Next。

Next 30002 的正确状态端点为 `/api/status`，已返回14.368／6.0.5／cor-cotn；之前 `/api/game` 失败只是错误端点，不能解释成世界或模块为空。Next本轮仍未安装候选、重启或写入世界，不将其身份读回提升为新伤势接受。

## 真实接受与发布剩余

用户已明确授权新建独立本地验收 thread，并向本对话回传完成／阻塞。执行模型按项目选择为gpt-6.1-sol／medium，实际权限须由执行器从当前 turn_context 核对 Full Access。

尚需证明客户端加载上述候选：旧状态／同ID投影迁移，只有CC时的伤势全链、真实短休／长休与自然19–20、HUD／TAH点击、重载防重、GM／玩家验权、只有IFS时的连续死亡与独立复活、联合恢复抑制，以及既有状态／设置和拥有临时对象的最终恢复。双版本接受分开记录，5.3.3结果不代替Next6.0.5；未取得Next候选的真实证据前保持未完成。

本次候选也不表示其余工作树全部闭合。首批139文件整合候选保持原样；主线、首次候选与本次增量的最终组合仍须在真实接受结果返回后按范围集成。未执行commit、merge、push或生产写入。

### 用户范围与连接修正（同日后续）

用户明确本轮E2E只在Server Mirror做，ServerNext改为本轮范围外，不再是这次必需接受门；6.0.5代码候选仍不宣称实机通过。父任务按用户授权在独立 `20261002-162723-instruction-scope-integration` 中落实选择性规则，不改变本轮候选模块或服务字节。

首次执行器误用Computer Use，创建拥有的空白窗口596192后被URL-confidence安全检查明确停止。未登录Foundry、未创建fixture或写入世界；不能报告客户端接受或最终恢复PASS。保留原安全拒绝，不清除检查或用旁路执行同一拒绝动作。

现场核对发现当前官方Chrome组件存在且配置已启用；完整官方Chrome技能与标准连接预检实际成功，返回Chrome/type=extension/ID3并读到完整documentation/capabilities。父任务之前把未显示Chrome技能误判为连接器不可用，现已纠正。用户明确指定直接Chrome tab验收；独立任务继续使用官方Chrome标准接口，先通过实际URL／网站许可检查，再进行Mirror业务。Computer Use不再使用，也不回退其他浏览器或原始CDP。连接元数据PASS不代表任何玩法PASS。

连接与安全证据为 `executor-browser-blocker.json`、`executor-official-chrome-preflight.json`；当前Mirror运行PID63516／30001／14.364／5.3.3／fvtt-v14-module-matrix。浏览器业务完成／阻塞仍由原独立thread向父任务回调，父任务不轮询或监控日志。

### Chrome实机首批接受与UI修复

官方Chrome正常打开并登录Mirror，没有网站许可拒绝；未再使用Computer Use。旧CC runtime `e3deb57f…4ac364` 的有界实机证据通过：客户端版本／active GM／模块与资源身份；三原IFS伤势原件和processed ID迁移、两AE同ID移交；CC-only HP落零／首次恢复／正HP后续治疗／满血；原生短休／长休消息；真实系统rollDeathSave配合控制RNG输入的保留19／20、18+5不复活及被丢弃19不复活；未知schema拒绝和原件保留。控制骰是输入控制的系统行为证据，不称为随机骰自然出19／20。原全flags探针受DAE新增空scope干扰的失败收据保留，修正受保护伤势字段比较后通过。

真实管理器全局说明仍显示 `{stacks}/{max}`，因此中止后续业务，不报告最终接受／cleanup。修复把全局说明改为独立的0–3层指引，Actor行仍分别格式化当前层数；中英双角色回归、CC125项、安装fixture3项、CC及production typecheck／build、手册检查通过。修改不扩展规则或API。

候选仍为未发布0.2.0；补丁精确仅替换 `lang/en.json`、`lang/zh-CN.json`、`scripts/index.js`，完整旧树 `4c3659fa…90972`→新树 `b1dab0f9…d1cc`。按正常停服门操作本轮父任务拥有的服务、无备份或删除；首次停止配置遗漏matrix world时被identity门拒绝，未停止／安装，核对实际world参数并补正确 `FVTT_OPS_WORLD_ID` 后才执行，没有跳过身份检查。

新CC ZIP SHA `8a4a03149b8742493c0e60fe5a0dc0848ea7a63677f418b4ecdcefd0acb333cd`，runtime SHA `07f321fcd462a133ccde442d67615bf67f46b6b11f1653236866a3e5c3e7dbb3`；ZIP／build／install31文件一致。旧行为证据保留旧build边界，不自动改写SHA为新PASS。同一matrix已正常恢复，当前PID28264、30001、14.364／5.3.3；接续只复验受影响UI并执行未完HUD／TAH、重载、独立及联合复活、玩家／双GM、最终恢复等门。

保留owned PC／未知schema Actor、Scene／Token、INITIALIZER／PROBE及rest／death消息。原三份新CC flags、两投影归属迁移与测试设置尚未恢复；最终以 `client-baseline.json`、INITIALIZER持久state和外部prestart收据核对原10Actor及既有ID。未报告清理PASS。

### 管理器修复接受与 DAE 空壳效果修复

同一官方Chrome tab `651338418` 对 runtime `07f321fc…e7dbb3` 的实机回调新增通过：中英管理器不再显示占位符，Actor行增减2→3→2；Token HUD左键增层、右键减层；正常重载保持伤势flags、episode、账本和投影ID且不重复计层；TAH Core2.1.1／dnd5e2.1.0的“伤势1/3”按钮与完整规则tooltip。对应证据为 `client-manager-fixed.json`、`manager-fixed-zh.jpg`、`client-reload-tah.json`、`token-hud-before.jpg`。

同时发现真实失败：拥有PC `LDMSr9W96NDEinqi` 在多次清零后留下五个仍启用、仍以伤势命名的空壳ActiveEffect，TAH Passive Effects显示重复项。先前“满血／休息清除”只证明伤势状态和status清零，不能证明展示没有残留；展示清除结论改为FAIL，最终接受与恢复仍INCOMPLETE。保留 `client-dae-ghost-effects.json`、`tah-injury.jpg`、`executor-mirror-dae-blocker.md`，没有删去失败证据。

精确本地Core14.364源码 `common/documents/active-effect.mjs` 和 `client/documents/active-effect.mjs` 表明：持久duration默认值为null、units为seconds、expiry为null、expired为false，准备后的duration.value会变成Infinity。DAE14.0.12的 `module/apps/DAEActiveEffectConfig.js` 会补入 `flags.dae.specialDuration=[]`。旧逻辑把这些默认字段当作实际第三方内容而只移除伤势标记，形成空壳。

修复仅在当前拥有的伤势投影上排除精确空 `dae.specialDuration` 和持久Core默认时长；通过公开 `toObject()` 判断持久duration，避免把派生Infinity当作时限，读取原生 `system.changes`。非空DAE配置、未知字段（包括false）、实际changes、显式零时限／expiry、其他状态、origin、transfer或禁用状态仍保留。没有新增全世界空壳扫描或删除。定点独立审查未发现仍需阻止集成的问题；CC128项／1232断言、CC与production typecheck、build通过。完整CI的3056通过收据属于之前的源码版本；此补丁只重跑受影响检查，不把旧CI改写为新字节的完整重跑。

正常停止本轮拥有的PID28264后只更新 `scripts/index.js`，完整旧树 `b1dab0f9…d1cc`→新树 `dcf02f6f…3fc2f9`，31文件ZIP／build／install字节一致，未创建备份或删除原模块文件。新ZIP SHA-256 `8bc2c20a74cab2f0918f8a617bcd8259e9a3b70b2a262a6a99ef15847aede57c`，runtime SHA-256 `d62f11a4e36a6f3cc10c501e0d8458539056efa5f66df1c8fcb6bcddf0ab55e5`。Mirror恢复为PID64672、127.0.0.1:30001、14.364／5.3.3／matrix，HTTP200；收据为 `dae-ghost-preview.json`、`dae-ghost-install.json`、`dae-ghost-artifact-receipt.json`、`dae-ghost-runtime-identity.json`。

新的实机清除复验仍PENDING。执行器可记录并清理本轮拥有PC上的五个精确空壳ID以重置fixture，再在DAE启用时复验增减、满血及真实短／长休后的效果与TAH残留；这项拥有fixture清理不授权删除原Actor效果。之后完成尚未闭合的复活、真实消息验权、手册视觉及原值恢复。Next仍是本轮范围外。

### DAE修复实机通过与独立复活锁参数修复

最新Chrome回调对CC runtime `d62f11a4…ab55e5` 新增PASS：只复位五个已知owned空壳；1→2保持同ID，两轮手动清零、满血、真实短休／长休后没有伤势空壳；非空DAE、原生system.changes、显式30秒时限三个近似反例保留原字段。TAH清零0/3时没有Passive伤势残留，恢复1/3时仅一个投影，nameOnly tooltip通过。证据为 `client-dae-fixed-final.json`、`client-tah-name-only-final.json`、`tah-fixed-single-projection.jpg`。首次探针误计原生Bloodied和漏场景选择的失败收据保留，仅修正探针范围／前置，没有删除Bloodied或重复无关规则。

IFS独立、CC关闭的真实HP10→0能开始死亡episode，/ifs面板、普通仪式向导和pendingRitual创建通过；实际点击结算却警告另一个结算正在进行中。读回successfulReturns=0、history为空、pending仍在且claim字段为空，未生成blind结果。“提交结算”不能称为“完成结算”，第一复活及后续门仍INCOMPLETE。现场为ownedPC的既有pending仪式和消息 `Y4yA1MaoxXHSiBhk`，没有重复业务重试。

执行器在真实Core14.364做了两组公开ChatMessage.create对照：普通拥有消息和与模块相同的空content／GM whisper／resolutionLock payload，分别只改变operation.keepId；缺少keepId时指定ID被换成随机ID，keepId:true时保留。对照消息经正常API清理，空content可以创建。权威本地源码 `common/abstract/document.mjs` 的create把operation传给createDocuments，与真实对照一致。失败及对照保留在 `client-ifs-lock-failure.json`、`client-exact-ifs-lock-payload.json`、`executor-mirror-ifs-lock-blocker.md`。

修复仅为结算锁创建添加 `{ keepId: true }`，使确定性的世界消息ID成为实际互斥门；不放宽active GM、锁归属或删除检查。UI测试中的ChatMessage模型同步按真实Core默认换ID、确定ID不得重复建模。先运行新增回归，旧实现1失败／1通过；修复后模块56项／373断言零失败，IFS与production typecheck、build通过。新增行为检查覆盖并发只能有一个成功锁、重复本token可复用、其他token不能释放、foreign消息碰撞不删除也不写Actor。真实双GM仍待执行器，测试模型不代替实传输。

按原11文件安装收据核对完整旧树，并正常停止本轮PID64672后只更新 `scripts/index.js`；旧树 `8e68e82b…6a20b`→新树 `e2d01031…8dbd80`，无备份、无删除，完整安装读回与11文件ZIP／build一致。IFS1.1.0新ZIP SHA-256 `edce76a5b58dc654d94e83c43f2397d4ada907a25fc1627b1832880d6522bd6e`，runtime SHA-256 `fa75368f65cdc1c7e23a46856325b0f582bd41891ef34ee93f98fd2a852cbb44`。18:44实际服务为PID63516、127.0.0.1:30001、14.364／5.3.3／matrix，HTTP200；以本次时间与新SHA区分历史上同数字PID的旧收据。CC和TE安装字节未改变。新安装／身份收据为 `ifs-lock-preview.json`、`ifs-lock-install.json`、`ifs-lock-artifact-receipt.json`、`ifs-lock-runtime-identity.json`。

实机仪式结算修复仍PENDING，接续既有pending，不重做已通过的伤势清除。新增owned测试User `21VQ0ZwTsgg8Svtp` 与 `hOQDdsDboIhOQUuR` 及原User集合已存INITIALIZER，两个新User在回调时inactive，既有角色／凭据未改。最终恢复须清理这些owned用户并读回原集合；原三flags／两投影、其他fixture和设置恢复仍PENDING。独立两episode成功、blind／history、联合抑制与旧API、玩家／双GM、可选仪式入口、手册视觉及最终cleanup保持INCOMPLETE，Next保持OUT_OF_SCOPE。未提交、合并或push。

### 独立复活实机通过与可选仪式入口模板修复

IFS runtime `fa75368f…2cbb44` 的最新实机回调新增PASS：继续原pending仪式结算成功，真实恢复HP后再次落零产生新的第二episode，第二普通仪式通过真实Actor.rollSkill与系统requestResult关联贡献检定，GM确认对话读回结果，再次结算成功。successfulReturns／history均为2、pending为null、没有残留锁，重复入口不额外写入，控制RNG已恢复。两次blindroll whisper仅包含两个GM；玩家端可见性仍未验，不因此称完整blind隐私PASS。贡献请求的原UI按钮点击尚无成功关联证据，native接口关联及确认UI通过不能代替该按钮路径。证据为 `client-ifs-independent-complete.json`、`client-ifs-contribution.json`、`ifs-linked-contribution-confirm.jpg`。

联合模块公开withSuppressed的实际HP0→2保持原1层，旧IFS setInjury仅一次CC伤势写入、IFS原flags未变，无双写；`client-joint-suppression.json`通过。经真实成功复活再恢复HP的联合路径仍待完成，不用这项API检查代替。

新的真实FAIL为可选仪式入口：CC／IFS均active且公开wizard为function，管理器仍没有按钮。`client-optional-entry-final.json`和`optional-entry-missing.jpg`确认根因：管理器把resurrectionAvailable放在injury对象内，Actor循环模板却读取根的同名字段。修复只将条件路径改为 `../injury.resurrectionAvailable`。首次diagnostic受覆盖层影响，误执行旧joint probe；`client-optional-entry-failure.json`实际stage为joint，不算缺按钮反证，保留原收据。

不新增依赖，使用Core14.364安装包中的Handlebars4.7.9编译候选模板，并直接调用管理器_prepareContext取得两个目标的实际context：旧模板在可选模块启用时缺两个按钮；修复后每个目标均正确绑定UUID，可选模块关闭时没有按钮。初次检查工具漏setStacks前置导致伤势区未启用，保留 `optional-entry-render-prerequisite-failure.json`；修正工具并显式检查前置后的真实失败／通过分别为 `optional-entry-render-red.json`、`optional-entry-render-green.json`。这属于非浏览器模板检查，实际按钮点击仍PENDING。CC build、手册人工核对／28项build与check通过；TS与runtime字节未改，不重复已有128项单元测试或类型检查。

正常停止父任务拥有的PID63516后仅更新 `templates/condition-manager.hbs`，完整旧树 `dcf02f6f…3fc2f9`→新树 `cee298e3…ac4ec1`。模板SHA-256 `79826f1793edf031fab70fc4c6e7de87439e1a055950727665e520653386f9fe`，CC新ZIP SHA-256 `fe6bdf997a7ac1c82ef8aa7f346cb696eec0a1aafba2adc8f7a5633314d58572`；31文件ZIP／build／install一致，runtime仍为 `d62f11a4e36a6f3cc10c501e0d8458539056efa5f66df1c8fcb6bcddf0ab55e5`，IFS／TE字节未动，无备份或删除。19:15新Mirror PID67592、127.0.0.1:30001、14.364／5.3.3／matrix及HTTP200已核对，收据为 `optional-entry-preview.json`、`optional-entry-install.json`、`optional-entry-artifact-receipt.json`、`optional-entry-runtime-identity.json`。

接续现场为GM tab651338418与玩家tab651338459；玩家在前次回调时active、GM2 inactive，重启后须实际重验各tab身份。CC／IFS／TE启用、TAHpair启用且nameOnly，PC为0HP／1层、成功2次、新joint episode已开但未起第三仪式。原三flags／两投影、模块与设置、所有owned fixture／消息／新增User的最终恢复仍PENDING。下一步仅验新入口并完成未完联合复活、请求按钮、玩家／双GM、手册与恢复；Next仍OUT_OF_SCOPE，master未合并。

### Mirror最终接受与恢复闭合

执行器完成本轮代表接受：新按钮真实打开正确PC，贡献请求按钮在关闭覆盖层并滚动正确chat容器后打开原生检定，实际随机17关联请求并在GM确认UI读回。两个GM共在线时authority切到GM2，原GM入口拒绝，GM2以一个确定ID锁完成第三仪式、history只加一次、锁释放；成功后的真实HP0→2消耗抑制标记且保持1层。

实际role2玩家落零／恢复只计一次，八个观察到的伤势flag写入均来自active GM2。伪payload自报原GM，接收端server sender仍为玩家，无Owner目标保持1层。玩家的三条blind消息isContentVisible=false、DOM面值为原生?且无原骰值，history不含face／roll／total。手册同字节页面三条说明实读通过。证据为 `client-optional-entry-fixed.json`、`client-joint-success-hp.json`、`client-gm2-authenticated-transport.json`、`client-player-transport-reviewed.json`、`handbook-browser-receipt.json` 和 `executor-mirror-final-report.md`。

关闭自动化后按保存的原值恢复，重载再次读回 `client-final-persistent-cleanup.json`：pass=true；原十Actor ID、三旧IFS flags、两原AE数据（排除正常Core审计_stats）、原三Scene／六Macro／唯一原User、六项原Setting ID／值、原active十模块与配置均恢复。新增CC三个设置删除，TAH tooltip／原User flags、cn语言、原view／paused／controlled恢复；原HP未定向修改，清理前后十份HP相同。三个ownedActor、一个Scene、两个User、三个Macro和23消息已清，原消息保留。四个官方Chrome拥有tab已关闭，预览进程退出；旧CU空白窗口596192无法确认Chrome映射，单独NOT_CLEANED。

父任务读回清理字段和ledger SHA均匹配。完整ledger文件实际为240350字节，SHA-256 `2e76b2a72560cc8fe44b3679cad9d62c6eebced59ca64ce9dca795d82743bc4e`；执行器报告中239848的计量名称不能代替实际文件字节数。原失败和工具修正记录保留，后来的真实证据关闭相应缺口。最后服务67592／30001、14.364／5.3.3／matrix、users=0继续运行；Next OUT_OF_SCOPE，生产／长时NOT_EXECUTED，完整复活模式分支及并发压力未宣称通过。

### 首批与规范最终组合的依赖适配

按用户认可的首批清单合成139文件增量，并按已完成逐项评估纳入Scope11文件中的源规则。保留本轮CC／TE／IFS和受控升级工具，根AGENTS／手册由正常生成器重建，其他旧工作树只读且不清理。metadata三方合成没有语义冲突，来源和路径清单保存在 `final-source-inventory.json`、`final-copy-first-receipt.json`、`final-metadata-merge.json`。

独立源码审查发现WMP仍只接受0.1.x依赖，会拒绝当前CC／TE0.2.0。已在WMP目录精确增加0.2.0接受，同步manifest／build／README，保留旧0.1.1起0.1.x、API版本／能力／方法和14.364／5.3.3门；0.2.1、缺方法、错误能力仍拒绝。模块239项、typecheck／build／artifact通过，buildId `70c9edaf71b4d1d0faee3d9d7526a0caa45babc889f459b53bf8d33ede624819`、runtimeCodeSHA `b6c4772747d20c847187b0c4049af5a62cfbc1329c72762f859fb76f9544d969`。最终组合完整CI及这项WMP依赖实机接通仍待完成，不把历史WMP接受或伤势Mirror PASS冒充新依赖组合接受。

### 最终组合CI及交付身份

新组合单次 `ci:verify` 实际退出0：CLI24项；3341通过、1跳过、0失败，350文件／3342测试。全类型、架构、Session Monitor构建、432来源anti-overfit、参考5.3.3／current-6、Web及White Tusk Shaman离线六物品／零警告／零网络通过。日志 `final-composed-ci-verify.log`；不沿用第一候选中断的CI作这次PASS。按187条确切任务路径暂存后，hygiene重新覆盖1754 tracked路径通过；没有未知路径或tracked删除。首次diff检查发现WMP README尾部空行，已修正且cached diff check通过。

独立冻结审查没有P1／P2代码阻断，确认首批generation／parser／models／contracts业务源码保留、Scope没有降低来源门。锁文件三个workspace版本仍旧的metadata已与实际package0.2.0／0.2.0／1.1.0同步：Bun1.3.14 lockfile-only未更新这些字段，随后仅同步这三个版本字段、核对resolved依赖部分逐字节不变，再frozen install通过；未更新外部依赖。评估记录已链接后续Scope实施。根Ruler／32必需文件和30项手册通过。

CC／TE／IFS包交付分别匹配已接受runtime `d62f11a4…ab55e5`／`bef0559c…f5ba2`／`fa75368f…2cbb44`，CC模板仍 `79826f17…86f9fe`。IFS在根目录CI构建生成不同的Bun源banner；正常模块package build后回到已接受SHA，去源banner后两份脚本逐字相同，不构成业务变化。

锁版本和README空行收尾会改变WMP输入fingerprint及注入build身份，交付包已重建并通过artifact检查。最终WMP buildId `6c66968ed7beec6b776471b7a93c1888b3a4865cff84be1c82d92d870c3b201e`、runtime SHA `65a407fd844b585cfea3f8207dce5b62c8c6640118f78798804301c83fe2d8db`、ZIP SHA `950960d2a323194430ba85596f26f13042507ab4691059128bb48751a6af95f6`、树SHA `eb5a73eb95fbae3a92032c0c58929138702f89740a49a29d487265ef3180e497`。正常停止本轮服务67592后仅更新WMP四个拥有文件，无备份／删除，八文件ZIP／build／install相同。22:36新Mirror PID40952、14.364／5.3.3／matrix、loopback／HTTP200／users0已核对。

同一官方Chrome执行器已接收WMP依赖接通窄检查：新baseline、0.2.0实际API ready、一个代表公开攻击／TE事件／CC武器效果生命周期链、原值恢复及owned对象清理。先暂设injurySettingsImported=true／injuryEnabled=false，避免本次启用CC重迁原傷勢；完毕按原值删去新增设置。伤势／复活与玩家／双GM旧PASS不重做。实机接通仍PENDING，原窗口残留仍单列，Next OUT_OF_SCOPE，未提交／合并／push。

### WMP 0.2依赖实机接通闭合

同一Mirror客户端实际读到最终WMP build `6c66968e…3b201e`、runtime `65a407fd…2d8db`；CC／TE均0.2.0、API1及必要方法／externalEvents能力齐全，dependencies.ready=true，没有版本拒绝。CC加载前的sentinel设置生效，injuryEnabled=false，原十Actor全flags／HP／全部AE保持原值，没有再迁移旧伤势。

owned官方Rapier副本通过公开configure明确授予Vex；公开attack进入真实原生检定／伤害，实际HP100→91并建立一个Vex。公开prepareUse预留该效果并授予优势，cancelUse解除预留而保留效果；下一次真实原生优势攻击／伤害使HP91→82，旧效果消费且仅新效果重授一次。TE外部监听实际观察两攻击各一次prepared／committed，两条对应ledger唯一；取消事件分开。RNG仅作真实系统输入且finally恢复，不称自然随机或全手动UI／全属性覆盖。首次探针误读effects结构，在已执行首击后失败；修探针并读回复用首击，仅继续下一消费，没有重放。

重载后的 `wmp-final-persistent-cleanup.json` pass=true：原十Actor全flags／HP／全部AE含审计字段相同、原Items／Scene／Macro／messages／User role／character／flags准确，无owned残留；原Combat active=false／round2／turn0恢复，正常审计_stats更新未伪造。两个sentinel与本批TE ledger删除，原trigger setting ID／值保持，模块／语言／view／paused／controlled恢复。两Actor／embedded武器、一Scene／两Token、一Combat、四消息、两Macro和拥有tab已清。Core删除owned Combat自动激活原Combat的首次FAIL保留，正常恢复active后再重载接受。

关键证据：`wmp-cs020-final-report.md`、`wmp-client-identity.json`、`wmp-first-chain-readback.json`、`wmp-native-chain-final.json`、`wmp-final-persistent-cleanup.json`及完整source。最后服务40952／30001继续运行、users0，旧CU596192继续单独保留。此项关闭WMP＋CC／TE0.2.0代表接通；旧WMP其余属性保留原身份，Next／生产／长时／并发压力均未推广。

### 本地master整合（2026-10-03）

主工作区在合并前为master `61974058…dd99a8f`、tracked／untracked与索引均空，topic仅暂存187条任务路径且没有tracked文件删除。依据用户认可首批清单、要求Trigger／伤势合入master及后续Scope处理授权，topic提交 `d477ef7c9f52610070f4c09a76a8e407cc7dd3b4`；00:05在主工作区正常fast-forward至该提交。主区status／索引仍空，用户基线保持，frozen install和30项手册check通过。未push、生产写入或清理旧工作树。

合并后的AGENTS检查实际发现两个新tracked说明未在显式目录清单中：WMP与Crystalbleed V12。初轮CI在它们尚未tracked时只查到原32项，不能用那次PASS掩盖该集成失败。已在topic明确登记两路径，并仅为对应说明添加Scope／Verification标题；业务内容、版本、权限和运行代码未改，WMP build输入也不含这些说明或检查器。修复后的实际34项Ruler／目录链检查、19项检查器／save回归和production typecheck通过，手册受影响三项按纯规则登记变化复核。最终主线收尾与检查以 `local-master-merge-receipt.json` 和后续 `local-master-final-receipt.json` 为准。

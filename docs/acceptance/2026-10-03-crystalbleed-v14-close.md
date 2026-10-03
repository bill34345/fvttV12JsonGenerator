# 晶血龙兽 V14 当前战斗包收尾

2026-10-03。实机业务与原世界保持 **PASS**：r5正式导入并启动2.1.2，独立恍惚与完整到期通过；r6通过完整场景哈希的唯一反事实证明，精确恢复测试工具引发的Monks TokenBar原Token flag副作用，重载后原R5基线全部匹配。当前候选的本地验收整体 **PASS**：按仓库CI固定Bun1.3.14完成完整CI退出0；本地Git集成按最终收据核实。r4/r5原失败记录保留，不倒改为PASS。

## 当前候选与权限

- master基线 a6cbd37dcaaf367ce11bd8e999a4d1445d8ce4ce；候选分支 codex/20261003-031024-crystalbleed-v14-close；工作树 I:/OpenCode/fvttV12JsonGenerator-worktrees/20261003-031024-crystalbleed-v14-close。
- 用户授权本项开发、本地Server Mirror验收、本地提交及满足门禁后的本地集成；不push、不操作生产、不启停常驻Mirror。
- 旧树20260912-130943-crystalbleed-v14的19个未提交文件保持只读，不覆盖、不自动提交、不清理。
- 继续复用Chrome执行聊天01a0ff82-8040-73f3-9d43-8f5bea6dc556，gpt-6.1-sol/medium。原生回调到父聊天01a0fdf7-35f6-79c3-b1c5-4812d1a8f54d；不轮询。
- 仅使用F:/FoundryLab/foundry-v14/data/server-mirror、127.0.0.1:30001、cor-cotn、Foundry14.364/dnd5e5.3.3。r4进程PID45740由父任务拥有；复验前刷新身份，不切世界，不要求用户处理Setup密码。

## 正式来源和包身份

选择已整理来源及受审核样本宏路径：build-example.ts携带来源，prepareForgeEncounter经过正式browser workflow→parser/generation→verifier。目标14.364/5.3.3/core/icon off；没有调用Provider或手工修补Actor JSON。

| 对象 | r5身份 |
| --- | --- |
| 包JSON与packageHash | ea9b257ec123fc5086ae3b740e0deeb66cea23cb4dbe2350ee0cfc8e2bccf1a2 |
| ZIP SHA-256 | 2754d398d016a28141720cdb930dab961b88a1cdbb2a3b6ff21ca7a20ae30bd9 |
| 未绑定样本宏commandHash | 51e2f9292464927b02887328bf4fc57bbc0d1de391484a5e7daebb59d816c9f3 |
| 预期绑定宏commandHash | 25c9cc90c94299795b2a33c3ced218a79b6a7625b19acc8a9ecdc6189fc49781 |
| 龙兽UUID | Actor.4ffe914190ff8157 |
| 晶体UUID | Actor.a8139b242e679eef |
| 控制宏ID | 9dcb48629e517e2a |
| 样本运行时 | 2.1.2 |
| 龙兽artifactHash | b740b84cdb92ea73556eac9b3b4e1be3334a8bde080c551ecb49e2bc2188452c |
| 晶体artifactHash | e33d16d7f98b513c1c3c63f1dd5eb17c009e0723a2c738613a9d5cf4cb83d848 |

r5已通过当前正式ZIP预览、GM确认和实际导入读回上述Document ID；native Macro command字节SHA-256等于flags.commandHash和表中预期值，packageHash及bindings正确。runtimeBefore=null，正式单独启动后为2.1.2及精确bindingSignature。两Actor的needs_review由实际两个GM辅助提示及已核实Application映射推导，UI未直接暴露status字段；五配套要求均展示，未提升为单Actor accepted。

r5两artifact与首次候选canonical hash相同，来源原文件字节与候选HEAD一致，复用原来源人工核对和两份verifier退出0、warnings/sourceIntegrityErrors为空的证据。旧candidate-receipt.json的sourceHash属于注入sourceId后的workflow请求；新candidate-receipt-r5.json明确区分rawSourceHash和workflowRequestSourceHash。随机sourceId使后者随准备变化，不能冒充原文件哈希。

## 恍惚修复及精确来源

1. 通过公共condition契约查找当前独立fvtt-custom-conditions.dazed效果，同时兼容旧dazed和来源behaviorState，拒绝其他模块同后缀状态。
2. Item的template=true不能原样作为Actor实例；应用时创建enabled实际条件、独立instanceId及来源，刷新同来源实例保留instanceId。
3. r4实际导入的齐射模板634026d2d16c240f保留custom-condition标记，但statuses为[dazed]。已加载Forge0.4.0 bundle的actor-effects生成代码直接输出statuses:[info.en]，与保存的Creator源码一致；没有把该差异误归因于CC或DAE预创建Hook。宏2.1.1复制它后，DAE14.0.12按原生status补出autoCreated的dnd5edazed000000，源实例到期后这份额外效果仍启用。
4. 样本宏2.1.2按有效condition标记投影应用实例；applyEffect使用投影后的状态做免疫和注册检查，避免再次用模板原生状态覆盖。语义ID和独立ID的免疫均生效，其他模块同名状态保持独立。没有改写正式模板、更换已安装Forge、禁用DAE或删除其他来源效果。没有注册独立状态时保留具名效果和期限，由GM裁定行动。

回归由r4真实status/flag模式驱动，并覆盖完整salvo应用出口、目标回合结束到期、免疫及未注册独立状态的具名回退。先红：513pass/3fail；其中一次初始测试替身缺Foundry DamageField的formula计算属性，已修正并记录第二次同症状失败。修复后518pass/0fail/2202 assertions，40文件。工具typecheck通过。它们是非浏览器证据，r5实机仍待复验。

## r4实际行为及恢复

| 门 | 结果与边界 |
| --- | --- |
| 有界业务基线 | PASS：14parts/53858bytes；原286Actors、65Scenes、10Combats、93Macros、1089消息ID。边界是world ready后、测试写入前。 |
| 正式ZIP预览和确认导入 | PASS：两Actor及控制Macro；导入前后未自动启动控制器。两needs_review复用正式准备收据，UI和flags未独立暴露。 |
| 独立启动和绑定 | PASS：runtime2.1.1及精确bindingSignature；读回UUID、版本marker、绑定flags，整段command字节hash尚未独立计算。 |
| 新龙兽守护 | PASS：实际40伤害，HP176→156。 |
| 旧对象隔离 | PASS：明确归属的同名legacy fixtures在导入前创建，Actor完整hash不变，无新效果；旧晶体TokenDocument.move完成true且managed=false。 |
| 真实齐射失败分支 | PASS：实际按钮、CON总值-16/DC18、HP200→188、传奇动作spent2、召唤Token绑定新晶体Actor。 |
| 恍惚实例 | PASS：CC.list识别唯一非template实例。 |
| 独立状态及完整到期 | FAIL：状态为原生dazed；源实例到目标回合结束禁用，但DAE额外原生效果仍启用。 |
| 清理及重载恢复 | PASS：精确owned Actors/Scene/Combat/Macro和消息清理；原文档hash、相关settings、完整module清单、消息ID集、paused/view/active/controlled/targets/combat/viewport恢复。 |
| 最终退出 | PASS：helper原生删除后再次登录证实宏93、helper/controller皆不存在，最后登出0/7并关闭自有tab，无剩余owned tabs；Node保持运行。 |

Actor/Macro保存完整原生source哈希；Scene/Combat仅排除顶层_stats.modifiedTime与lastModifiedBy，嵌入Token仍严格。基线不是启动前字节证明。额外Monks回合标记经移除该确切ID后的消息集hash等于原集，才按归属清理；没有按“所有新消息”删除。

保留r4内容寻址素材fvtt-json-forge/encounters/3d6f5473aff7f9164c60f9b3f6b11362875e2f96698ad45c3362186fa4290c9d/dragon-art-dragon.png，没有删除共享资产。r3巨型导出导致tab失去响应的失败证据保留，后续同一执行器完成tab/helper/logout恢复；不声称该次未完成基线能证明全业务无漂移。

## 静态门及剩余范围

原完整ci:verify退出0：3346pass/1skip/0fail，432来源anti-overfit，类型、架构、coverage、hygiene、references、Web build及离线smoke通过。Bun Knip未返回及一次Species CLI超时的原件保留，Node同一Knip入口和最终CI已通过。此为a9f91fa历史候选证据，未直接推广为本次新增修改的完整CI；下文的Bun1.3.14完整门覆盖本次修改和吸收后的主线组合。

r5完整CI实际退出1：未修改的crawl-sites v14 dry-run子进程50秒无输出，随后单进程coverage达到300秒上限；原件ci-verify-r5.log保留。安全入口test:robustness复查为79pass/1fail：前次失败的v14 target通过，另一个modded profile子进程出现同样50秒无输出。没有扩大超时、降低coverage或把此运行器失败记为绿色。浏览器受影响路径的正式构建、宏回归、类型及手册前置均通过，可继续窄验收；当时本地集成门保持未关闭，随后按固定CI版本校准后完成新完整检查。

r5实际齐射按钮完成CON-32/DC18失败、HP200→194、传奇动作spent2、召唤Token nnmKG4p3EgM4Y90I绑定新晶体Actor。effect gYu89yW6KYby1d9r的instance8230874bcee04af5a3e6ad107c5a7ba5唯一非template，只有fvtt-custom-conditions.dazed；目标回合开始active，回合结束disabled=true/active=false，Actor.statuses为空，CC active=false，六个独立check均true。此为真实按钮加owned Combat update/settle证据，不扩展为完整战斗矩阵。

r5清理首次检测原landing Scene哈希不同，严格保留FAIL。父只读物理WAL发现原Token cLkAllpE1o3tUJNi新增monks-tokenbar.movement:null；Monks14.01在round1/turn0将当前TokenBar条目的单独移动设置清空，r5测试工具先启动Combat才view自有Scene，因而命中原场景条目。WAL未核CRC，只作为线索；r6真正证明来自live完整Scene反事实哈希：五变体仅删除新增的单键monks-tokenbar命名空间精确复现原冻结hash ba608ea8c54401a0e4a235cba046c29091a02242e1a13f96b16f6cd401914a0b。执行一次原生TokenDocument.update({'flags.-=monks-tokenbar':null})后，实际及重载hash均精确匹配，Token.flags={}。

r6恢复后，286原Actors、65Scenes、10Combats、93Macros完整原hash一致、无新增，捕获的相关settings、完整module表、1089消息ID集以及paused/view/active/controlled/targets/combat/viewport均匹配原R5冻结基线；只按确切ID排除本轮owned helper，未重采baseline或放宽Token边界。helper原生删除后再登入确认absence/Macros93，最后登出0/7并关闭owned tab，Node与用户tab保留。未重复业务案例。

已保存future fixture修正fixture-view-order-corrected.mjs：先view自有Scene，并通过Monks公开TokenBar API刷新和守护entries只指向自有Scene，之后才启动Combat；保留本次执行失败的原工具源码。此为工具修正，不改变包或主宏；没有凭修正源码重标历史Scene FAIL。Monks全局movement的指定world SettingDocument f41fK82gx9y7kqRm实际value为combat，原生modifiedTime1788247412268对应北京时间2026-09-01 15:23:32，早于本项；这项历史配置未由本轮修改，不猜默认free或回写设置。原生systemVersion2.3.1作为历史文档元数据保存，不误当当前runtime5.3.3版本。读取后helper删除、再登入Macro93及登出tab关闭均通过。相关settings白名单不冒充全部world设置。

CI最新独立安全入口test:cli在诊断preload下24pass/0fail；trace捕获10次真实Bun子进程的spawn、stdout、exit、close，最长477ms，无零输出deadline样本。没有据此确认先前间歇启动问题的根因。原未修改完整CI再执行仍退出1（ci-verify-after-cli-trace-exit.json）：不同的未改plaintext dry-run子进程15秒零输出超时。独立早drain探针在另一item CLI发生同样超时，不能归因为输出读取顺序；生命周期探针观察到一个safe-icon子进程在2441ms仍存在、CPU2.40625秒/29线程，4023ms被原watchdog终止。它确实执行但未产生输出，不能说成仅丢exit事件；精确运行器根因仍未确认，已交独立只读诊断。当时未扩大deadline、缩检查或合入master。业务、包及已闭合世界恢复不重复执行。

生产、Next/其他版本、长时及全部战斗矩阵均NOT_EXECUTED。旧dirty树不退役；其parser/generation增量已由master后继承接，来源和图片的对比证据保留，独有历史材料尚在原树。

外部证据根：H:/CodexData/visualizations/2026/10/02/01a0fdf7-35f6-79c3-b1c5-4812d1a8f54d/crystalbleed-v14-close-20261003。当前主要文件：candidate-receipt-r5.json、prepare-r5-receipt.ts、r5-candidate-generation.log、runtime-r4/runtime-receipt.json、condition-expiry-readback.json、comparison-after-reload.json、final-helper-persistence.json、macro-projection-regression-red-callsite.log、macro-projection-regression-final.log。机器证据不进入仓库。

## 最终整合检查

主线在本任务期间推进到721fb6f（只读任务交接和内容保留工具）。候选在topic worktree吸收该提交，生成HTML冲突通过合并后的catalog/review来源重新构建，30项覆盖与说明一致；没有从其他worktree移动master。组合commit0d15af9的actor/macro代码及测试包未改变，复用已闭合r5/r6运行证据。

实际.github/workflows/ci.yml钉Bun1.3.14，而本机默认1.3.8。独立诊断确认超时跨native Bun.spawn/Node.spawn，未证明精确卡顿阶段；公开Bun1.3.14 issue32011涉及另一类compiled-binary/Rust执行，不能归因或作为升级保证。Root从官方bun-v1.3.14 release下载到任务目录，ZIP SHA-256为0a0620930b6675d7ba440e81f4e0e00d3cfbe096c4b140d3fff02205e9e18922，exe SHA-256为0187f68d843f825a72ada4a7eca60db896ed753759a7f8252edcd31ac1bf1b9c，--version读回1.3.14。只在该命令进程设置PATH，未改变系统安装或仓库测试门。

Bun1.3.14的公开test:cli为24pass/0fail。随后原公开ci:verify在组合0d15af9实际退出0：3372pass/1skip/0fail，3373tests/352files，coverage门、全部类型/架构、Session Monitor构建、432来源anti-overfit、1762tracked路径hygiene、34项指令、30项手册、精确references、Web build及White Tusk Shaman离线smoke全部通过；smoke为6来源物品、0 verifier警告、0网络。日志ci-verify-pinned-1.3.14.log及退出收据保留。它证明按仓库规定版本完成本轮门，不将版本差异强行定义为所有旧超时的根因。

最后只更新本验收记录；功能源码、正式包身份与已通过CI组合不变，复用完整检查，文档/指令/手册另作一致性核对。本地master集成及其前后clean/index/祖先证明保存于最终Git收据；没有push、生产操作或删除旧dirty树。候选/旧树的清理继续遵精确授权、内容读回和推送门，不因本地集成宣称可整棵删除。

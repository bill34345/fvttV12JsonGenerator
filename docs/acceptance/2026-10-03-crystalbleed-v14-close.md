# 晶血龙兽 V14 当前战斗包收尾

2026-10-03。整体 **INCOMPLETE**：r4 已在 Server Mirror 的 cor-cotn 完成正式预览、导入、UUID绑定、守护和旧对象隔离，但独立恍惚及完整到期 **FAIL**。失败原件保留；样本宏已修复为2.1.2并正式重新生成包，r5受影响路径的Chrome复验仍待执行。当前记录取代首次启动受拒、重启前暂停及强制切换matrix的旧接续说明。

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

r4已实际创建并读回上述Document ID；r5包及绑定宏哈希仍是正式流程加内存Document port推导的预期值，不代替新包实机读回。两Actor仍needs_review，五条配套要求未变，须包级GM确认和单独启动。

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

原完整ci:verify退出0：3346pass/1skip/0fail，432来源anti-overfit，类型、架构、coverage、hygiene、references、Web build及离线smoke通过。Bun Knip未返回及一次Species CLI超时的原件保留，Node同一Knip入口和最终CI已通过。此为a9f91fa候选证据，不能直接推广为本次新增修改的完整CI；r5聚焦测试和typecheck已通过，最终集成门仍待执行。

r5完整CI实际退出1：未修改的crawl-sites v14 dry-run子进程50秒无输出，随后单进程coverage达到300秒上限；原件ci-verify-r5.log保留。安全入口test:robustness复查为79pass/1fail：前次失败的v14 target通过，另一个modded profile子进程出现同样50秒无输出。没有扩大超时、降低coverage或把此运行器失败记为绿色。浏览器受影响路径的正式构建、宏回归、类型及手册前置均通过，可继续窄验收；本地集成仍须解决当前CI门。

下一步只在同一cor-cotn复验新包导入、完整bound-command哈希、runtime2.1.2绑定，以及失败齐射的独立恍惚实例、目标回合结束后无残留原生恍惚；保存新业务基线并精确清理、恢复、重载读回。核对正式预览中两条“有配套宏/GM辅助规则”提示及五要求；该提示经已加载Application源码的assisted=status===needs_review映射推导，UI没有直接status字段，不使用flags猜测或要求不存在的准备API。既有40→20、legacy隔离及历史战斗矩阵按受影响分析复用，不重跑无关路径。实机门关闭后完成文档、最终集成检查和已授权本地集成。

生产、Next/其他版本、长时及全部战斗矩阵均NOT_EXECUTED。旧dirty树不退役；其parser/generation增量已由master后继承接，来源和图片的对比证据保留，独有历史材料尚在原树。

外部证据根：H:/CodexData/visualizations/2026/10/02/01a0fdf7-35f6-79c3-b1c5-4812d1a8f54d/crystalbleed-v14-close-20261003。当前主要文件：candidate-receipt-r5.json、prepare-r5-receipt.ts、r5-candidate-generation.log、runtime-r4/runtime-receipt.json、condition-expiry-readback.json、comparison-after-reload.json、final-helper-persistence.json、macro-projection-regression-red-callsite.log、macro-projection-regression-final.log。机器证据不进入仓库。

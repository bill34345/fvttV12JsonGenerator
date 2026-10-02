# 武器精通与特性：本地交付终审

更新：2026-09-29。**本地交付候选已完成，尚未提交、合并、推送或生产部署。** 下方历史文字仅记录过程，不再作为待执行指令。

## 交付范围与身份

- 自有 WMP 实现官方八种精通 Cleave/Graze/Nick/Push/Sap/Slow/Topple/Vex，以及 Deadly/Fatal/重击流血。临时状态与事件使用项目自己的 Custom Conditions/Trigger Engine；借鉴外部代码设计不改变自有实现的交付要求。
- 精确支持：Foundry14.364 / dnd5e5.3.3；已验收 CoTN + Midi14.0.11 和独立原生代表性路径。自有依赖为 Custom Conditions0.1.1、Trigger Engine0.1.1。
- 实机接受构建：a56a09da0dc04f2cfc082598900477ed78d7155f30f80646d1fffd940bb2edf0。Lab仍运行这个构建，服务PID43716/127.0.0.1:30001/server-mirror/cor-cotn。
- 最终文档打包构建：05f3c3a4947fa9e7fd032ece209f46e0c0f285b49ff84530a4b3835884c880e6。仅两份README更新及内嵌buildId改变；主控逐字节验证，替换buildId后的运行脚本完全相等。未为文档重打包重复玩法或重启服务。证明在证据目录的wmp-documentation-repack-equivalence-20260929.json。
- [WMP ZIP](../../foundry-modules/fvtt-weapon-mastery-properties/dist/fvtt-weapon-mastery-properties.zip)，SHA256 56bf08f1bf3319ac4d325abc4eac9e20b0f270d3f89bcd5ddcc58a374c359a10。[CC ZIP](../../foundry-modules/fvtt-custom-conditions/dist/fvtt-custom-conditions.zip)；[TE ZIP](../../foundry-modules/fvtt-trigger-engine/dist/fvtt-trigger-engine.zip)。构建产物为本地交付文件，不构成发布授权。

证据目录B：F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-generated-acceptance-20260929/。旧检查点目录A：F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/。

## 已闭合的玩法与生成范围

| 项目 | 证据结论与覆盖方式 |
| --- | --- |
| Vex | Midi两击/取消/来源下一回合结束到期已有761证据；a56原生首击21、伤害7、HP200→193，第二击自动优势18/8取18、总23，旧效果先消费，伤害4后HP189并产生不同新实例。额外点击聊天Attack没有第二窗口；两击committed、case关闭无pending。 |
| Cleave | 913真实父子攻击、合法第二目标、子伤害不含正属性修正、一次额度与无递归。164真实取消子攻击不扣次目标HP，主目标选择恢复；负修正/非法几何/并发边界复用相关自动化。 |
| Nick | 913同回合两把Light武器、offhand额外攻击、一次额度与附赠动作保留。普通Club首击伤害未应用的历史事实保留；Nick前置要求攻击，不把该未应用伤害计为玩法通过。 |
| Graze | 历史真实未命中实际扣血，负修正与非武器等资格由当前core/运行时回归覆盖。 |
| Push | 真实合法直线10尺位移；阻挡/超距/非法方向/取消和尺寸边界由当前actions/core回归覆盖。 |
| Topple | 真实CON豁免失败后Prone；精确DC、成功/取消/免疫由当前actions/core回归覆盖。 |
| Sap | 真实下一击劣势、消费、来源下一回合开始到期；当前原生/Midi取消预约和早期模式输入由运行时回归覆盖。 |
| Slow | 实际30→20及自然到期恢复30；a56追加真实SY玩家使用/伤害应用，在线GM完成Slow结算，详见下节。 |
| Deadly | 历史自然20额外配置d8并扣血；正式生成导入的固定骰伤害2d6+1d8=18，HP192→174；移除配置与其它附伤保留由配置/生成回归覆盖。 |
| Fatal | 913完整收据2d10critmax10+3+1d10=28；正式生成导入2d10+1d10=9、HP174→165。仅替换基础骰、普通命中和附伤由当前core/生成回归覆盖。 |
| 重击流血 | a56原生同usage攻击/伤害、HP200→189、新实例51fJFpY5VRAm1kjR；正常目标回合结束tick文本1d6=5、HP184；恢复1HP到185后同实例解除。原始来源/参数与配置恢复经父14项核对通过。重击阈值2是记录的fixture准备条件。 |
| 配置与正式生成 | Actor/core/modded Item通过正式CLI/workflow生成、导入与刷新往返；自定义Slow复制/独立规则身份/保存刷新且保留Deadly通过；生成Deadly/Fatal实际使用通过。 |

这些结论组合历史真实运行证据与后续受影响回归；每份收据保留原构建，不把它们改写成全部在最后一个build逐项重测。

## 当前真实玩家权限门禁

a56 / Midi14.0.11，SY用户HF1ShlQokLfqMCJ6通过真实玩家页面使用Slow武器并应用伤害，GM保持在线。攻击Pmi7S8ooqoQ5XR6I，卡5iT7LJHuDg28eiDa，命中13、伤害6，目标HP200→194、walk30→20，新效果6WMTVgYEnaruGuyW。完整Actor damageProof.requesterId和sourceLedger.requesterId均为SY；UI作者也为SY，GM侧proof validated/committed与状态读回一致。

- 完整收据wmp-slow-ui-activity-receipt-20260929.json，SHAf3ad6297e0f5c9e8be2b1f256085fb0ac001d6284b1491e7556706d80d7ae12f；verify:weapon-evidence退出0，Slow PASS，其余规则在这张收据中仍NOT_EXECUTED。
- 导出后UI独立快照是summary证据，不能称为完整Snapshot；完整关闭台账另由cleanup保留的ledger原件确认activeCase null、slow exported。
- 临时SY Owner与pause恢复；SY退出并关闭玩家页，User.character未因本任务修改。
- 自动化还覆盖JSON序列化GM query、非Owner拒绝、来源/目标/消息伪造拒绝、不同目标效果隔离、同时commit幂等、未开始预约取消、未知已开始预约保留及运行时重载恢复。不声称手工覆盖全部多人并发或Linked/Unlinked多Token组合；Actor身份使用完整UUID，linked副本仍共享同一Actor状态。

## 清理与恢复终审

父已独立核对原件，B/wmp-final-parent-verdict-20260929.json的14项检查全部PASS。

- 精确清理11批次、34个任务Actor、11个Scene、11个Combat、2个独立导入Item、7个诊断/控制Macro、89条关联聊天，11份ledger在外部清理收据保存后finalized。
- Apply完整收据wmp-final-cleanup-apply-20260929.json，SHA626df79a8d99540e0f0e675696a550b3f734c6212db0bbe2569013adc94063b3。11批均cleaned，无skip或残留关联聊天。
- 一条历史登记聊天Z8Lt9KoFUp4ZaSRK在本次清理前已不存在，未被本轮删除；该事实单列，不伪称本轮核验其owner。
- Finalize收据wmp-final-cleanup-finalize-20260929.json，SHAc57f19ecd8196662a6254c171496d2fa513518aa044b13bd769f7af5823b9260；11份ledger均确认不存在。
- 独立正常UI目录与画面读回wmp-final-restored-ui-readback-20260929.json，SHA252801fc91dceb47026742a03f849c2ba64e19177b42fb69a3fcea20f34d3cca。原landing page场景EBJYd289N5uyTmlC、Combat8WCtc3bOyudYuHzh/轮11、pause=true恢复，原78个启用模块及完整moduleConfiguration恢复。
- 未列入核实清单的WMP-UI-20260925场景/Actor及3个旧Macro保留；不以名称前缀扩大删除范围。常驻Foundry继续运行，源码与证据保存。

## 检查与交付边界

- 最新功能修改：253 pass / 0 fail / 1072 assertions；模块typecheck、产物校验通过。
- 集成组成门禁：3082 pass / 0 fail，336文件，覆盖率行85.26%/函数86.24%；类型、架构、430源anti-overfit、仓库hygiene、锁定参考、Web构建与6项离线Actor smoke分步通过。既往CI中断及修复保留，不冒称单次无中断ci:verify成功。
- 最终README、健康索引、手册和active-case同步；文档打包产物验证通过，运行代码与已接受a56的差异只在buildId。最终手册检查结果由收尾命令核对。
- 原生Vex自动关联仅支持Midi形态，流血tick未在原工具newMessages中收集，导致部分原件仍INCOMPLETE；父以原始消息、效果和HP链独立判断PASS。未改写原件，未以绿色标签代替玩法证据。
- 接受范围为本地锁定版本；生产、其它系统版本、所有手工组合和四小时会话均不包含在本次结论中。

## 本轮暴露的交付问题

[上游对照](2026-09-29-wmp-vex-upstream-comparison.md)确实带来修正：保留系统攻击专用窗口、在公开rollAttack调用前提供自有优势输入、阻止同预约重复roll、修正mock中反转的hook/dialog顺序。此前未优先对照真实接口，是主控失误。

收尾中还暴露主控准备问题：合同路径省略导致执行者查错master；只读宏textarea.value在序列化渲染时丢失；要求旧空目标使用卡随新选择更新是错误门禁。markHandoff不转移跨聊天所有权。上述问题都留下事实记录，本轮不能据此宣称总体耗时或token已经优化。

用户的原始架构/规范审查继续以既存对抗性审查结论为基点；本轮先完成WMP，没有扩大到全项目重构。下一步讨论改进时，先处理这些已实际发生的问题。

<details>
<summary>历史过程与旧状态（已由上方终审覆盖，不作为当前执行指令）</summary>

# 武器精通与特性：唯一主进度清单

更新：2026-09-29（北京时间）。本文件是新 thread 的第一阅读入口，文件名日期不代表状态日期。
当前结论：**Vex 的 Midi 主链/取消/到期及原生两击主链均已实测通过；完整 WMP 仍 INCOMPLETE。** Cleave/Nick/Fatal、Slow/Sap到期、正式生成导入/持久化及生成Deadly/Fatal已有证据。当前进入原生重击流血与最终权限影响复核、资料/批末恢复清理；不再重跑 Vex。整体原因调查搁置，本轮用户明确要求的上游代码对照已落实到具体修复。

## 当前执行计划：完成 WMP 本地交付候选

用户决定先搁置原因调查，完成 WMP 后再讨论全项目推广。本地审查基点仍在 [2026-09-28 对抗性审查](I:/OpenCode/fvttV12JsonGenerator-worktrees/20260928-103500-module-delivery-audit/docs/reviews/2026-09-28-custom-module-delivery-adversarial-audit.md)，本阶段不重复外部调研、历史聊天审计或模型配对实验。由当前主控亲自处理代码和验收判断，新建一个专用 Luna/max 独立 Chrome 执行任务，并在后续批次复用；回报只发给主控 01a0e5db-97f8-7411-85e4-47f18fc64fec。

| 阶段 | 状态 | 完成条件与动作 |
| --- | --- | --- |
| 1. Vex 剩余生命周期 | PASS | 7619585 下取消保留同一效果、当前预约移除、攻击 cancelled、HP 不变。正常 Combat 在来源下一回合结束时移除效果；主控已核对五个边界原始 Snapshot 与 SHA-256。 |
| 2. 工具候选安装与面板 | PASS | 5b75f834 已安装并客户端读回；Load selected saved receipt 正确关联 Vex 两击并分类 PASS，收据保留7619585身份；批次已显式接纳新构建并复用。 |
| 3. 剩余规则 | 主链已测、终审待闭合 | Cleave/Nick/Fatal实测通过，流血UI链通过但结构化来源字段待补。Slow/Sap自然到期已补齐；其他规则复用现有证据并按源码影响核对，不全部重跑。 |
| 4. 跨路径与配置生成 | 进行中 | 正式生成导入/刷新、管理器复制/持久化、生成Deadly/Fatal、Cleave取消目标恢复及原生Vex两击已通过。原生流血执行中；必要权限影响仍待最终复核。 |
| 5. 集成与交付资料 | 组成门禁通过，最终同步中 | 全仓3082测试与类型/架构/anti-overfit/参考/Web/offline smoke已分步通过；最新攻击修复253回归、模块typecheck与产物/安装一致性通过，不冒称一次完整ci:verify成功。 |
| 6. 批次清理与终审 | 待执行 | 证据先保存，按归属清理本任务临时对象并读回；恢复场景/Combat/暂停等原状态，保留常驻服务、测试源码和证据；逐项报告实际完成与剩余外部门槛。 |

每阶段完成直接更新本表及下方规则矩阵；当前复杂用例只维护既有 active-case。独立 Chrome 派发后主控结束当轮，收到完成/阻塞回报自动续作，不把一次交接当作 WMP 结束。完成标准是功能与必要验收闭合的本地可交付候选；commit、合并、push、生产部署不在本次既有授权内。没有明确长时指标，不运行四小时测试。

### 当前安装、证据与下一步（主控维护）

- **原生重击流血终审PASS。** 补取现有tick消息后，父只读核对脚本14项断言全部通过，B/wmp-native-bleeding-a56-parent-verdict-20260929.json记录原始文件/hash、来源、同usage关联、critical已提交、HP200→189→184→185、实例施加/保留/解除及配置恢复。tick是content文本1d6=5，原ChatMessage.rolls为空，明确这一证据形式；未伪造骰对象或可选createdAt，未修改带拼写错误的手填observations。
- **最后一轮：真实玩家单例与清理。** 旧SY玩家测试早于当前跨客户端伤害证明适配，故仅补a56一次SY Slow攻击及玩家Apply/GM在线结算，复用原Midi批次；不重跑其它精通。其后执行B/wmp-final-cleanup-controller.js的Validate→Cleanup→先保存外部收据→Finalize；限定11批/34 Actor/2独立Item/准确6诊断宏和控制宏。盘点SHAeaa4c2acd948933d56ec54df664ca6b7cd1b18abd667732ee270af2041b83ba7已核对，唯一额外Token归属正式导入验收。清理脚本通过语法检查及无写入的有效清单/陌生Token/宏内容变更三项预检。终态须恢复最早原场景EBJYd289N5uyTmlC、Combat8WCtc3bOyudYuHzh、pause=true、原模块profile。收到执行结果前不记完成。

- **最新：原生重击流血生命周期已回报，父核对了中间与结束原件；原配置已恢复。** a56同批74d979，唯一usage Jk21HtJLrkExlJfh，attack o5NjACIGhrICZ97v，damage eVf6wNRjyd45bMR2，均同usage。重击阈值2为任务武器准备条件；普通d20=16/总21，2d6critmax6+3=11，HP200→189；目标新Bleeding51fJFpY5VRAm1kjR。完整原始flags的origin为Actor.xizLNGmp2IP73evg.Item.VIN1LmBEY1T3VFwn.Activity.rkjuC3ZV4s9UpD0i，参数1d6/slashing/turnEnd/highest/endOnHealing=true。正常目标回合结束HP189→184，Actor表恢复1HP后185、该实例消失；closed Snapshot确认exported/activeCase null、无pending。中间收据SHAada4d9356359eac9718927bdee397aaab083646dfe873470c928b3df698d4954，最终b99d8f8a21843a11e2b1f94aef19cec01f1f349a23daaaebfca449516d2e1570。手填observations的两个来源ID存在拼写错误，父以原始flags/ledger为准，未改原件；tick消息viYYRfIUSjyrq0nF未被原harness收集，当前只读补取现有消息，不重跑战斗。ConditionInstance.createdAt是可选字段，其缺失不是再次测试的理由。
- **恢复验收PASS。** B/wmp-native-profile-after-restore-inspect-a56-20260929.json SHA5242f571f3103c7656d25c757a31ff4de1d5040c644cf4e70a7b8c7e59480d8b：原moduleConfiguration完全恢复、78/78 activeModules一致，Midi已启用、自有依赖ready。PID43716/30001保持，pause=true。Chrome651336839由专用执行任务持有，不跨线程强行接管。
- **当前只读收尾阶段：** 专用任务读取现有tick消息及限定11个已知WMP批次/准确额外对象的归属、恢复链；尚未执行cleanup。父按清单安排精确清理，不能按名称前缀清空世界。真实多客户端新适配器门禁仍需最终确认，旧9月24日玩家证据与当前253项模拟transport/权限/并发检查分开标注。

- **最新：原生 Vex 两击 PASS，a56 已安装并真实验收。** buildId a56a09da0dc04f2cfc082598900477ed78d7155f30f80646d1fffd940bb2edf0；script1e9b32ac16eac829021ffbc7e760989a33158884b81432a59084400eea260856；tree5c4854c1cb512bfffd7b9d90fec492c6a7c0e20fb3a4b119133c2c53274efa02。server-mirror/cor-cotn/PID43716/30001，保留native profile。原批次WMP-E2E-74d979023cbf接纳构建并reset复用。首击21、伤害7、HP200→193，新效果9xOzF8Mgp77XVH2H；第二击角色卡单次使用自动显示优势，实际18/8取18、总23，原效果在伤害前消费；伤害4、HP193→189、新效果WZOaqtg6GtGoE1E6。原窗口存在时再点一次聊天Attack未创建第二窗。两个攻击均committed，关闭后独立Snapshot确认activeCase null、无pending。完整最终收据SHA4efb103a5527ad8a0b1272aea74abce0380f9a1b1e50d45e4ebacb08e7f862b9，首击206bd1b7…、消费c58572bc…；同B目录wmp-native-vex-a56-parent-verdict-20260929.json逐项核对。原分类器仅支持Midi自动关联，原生标签仍INCOMPLETE，主控按完整原始证据判定玩法PASS，未改写原件或重跑。
- **上游对照已落实。** 见[固定版本源码比较](2026-09-29-wmp-vex-upstream-comparison.md)。AC5e14.533.8的输入捕获/默认窗口模式解释了过晚注入优势；WMP改为公开rollAttack调用前提供自有预约优势，保留攻击专用窗口，禁止同预约重复roll。模拟测试顺序改为系统真实的hook→dialog。253pass/1072assertions、typecheck、产物和安装一致性PASS。参考w15p的生命周期分层；wm5e限制许可代码未复制。此前过度沿自身流程补丁、未先对照真实接口，是主控失误，不归因于用户prompt。
- 下列安装/阻塞条目为历史过程，不能覆盖本节最新身份。下一步按 active-case 完成同批原生流血，复用已充分的规则证据，结束后恢复模块配置、复核权限与集成边界、清理准确归属对象。

- **原生失败分层及46fa修复候选：** Midi已准确关闭、其它CoTN模块保留、自有依赖ready。原生098dfd首击attack aQsiHY1SwfNpQg3t来自U0dDtt2lkJlMywuv，但damage QRfEqDn7rotlhmo2来自另一已取消TP2cF6VloCUQhSsA；拒绝跨卡关联正确，不放宽校验。另对照锁定dnd5e.mjs:17442发现使用卡是type=usage，原实现只认旧flag；已支持原生type及旧flag，保留同卡/ID/作者/目标约束与反例。首击检查点也不再把带attackId的无骰使用卡误认成攻击消息，只选唯一实际attack roll，收据增加message.type。249pass/1049assertions、typecheck及artifact检查通过。
- **旧原生现场隔离及实际安装：** 父已用公开Reconcile操作将FlxuOdnC7oHgIBgi设isolated/activeCase null/requireNewBatchtrue，旧attack仍stepattack作为未知证据，HP191无效果，不补造terminal；隔离收据SHA0bdd07d88a7fac877adf091f8484753325e8ea1b879e2c9f868205c25b0fc97e。父通过正常Space快捷键恢复暂停。实际已安装build46fa34e59ac9147e8fe73c5a42338b6c853912cd869c264a6062306dce831547，script301ac872796e04cdc0f821706931155b313bee54f94ac1f38f2754b73bb3b1e4，tree3910f66fd5f741a4bef014f17f88de37919fb866966256a9cafadbff3776da7b；PID46732/30001/cor-cotn/join200，native profile保留。aa519是先安装的中间版，尚未浏览器实测即被完整46fa替代。仅WMP脚本更新，无备份、未改依赖与30002。
- **下一步干净原生Vex/流血：** 先在原恢复Macro vTLGvP6l4i5nUyzD更新脚本以接受新build及原164配置记录，原moduleConfiguration不重捕获、不覆盖。再按工具要求建立一个干净native批次；首击用公开API一次并记录publicResult.messageId，仅从同一使用卡继续Damage/Apply。原生全批后准确恢复原profile，所有对象最终统一清理。新旧批次准确ID、恢复脚本SHA和卡片约束已重写active-case；原生仍INCOMPLETE。
- **164 Cleave取消目标恢复PASS，已收尾可进入原生：** 主控先读取真正完整台账，确认执行者上一轮父MAXjSPPQtgLdSLKm committed、子cancelled，空选择基线结束也为空；此前文件只是面板摘要。随后主控在同一保留页明确选中primary并存基线，再一次API父攻击自然2+5=7、伤害2+3=5、HP200→195，选择secondary并正常取消未掷骰子攻击。父6seK1gJAvvEGNiBx committed/子cancelled、secondaryHP200，最终selectedTokenIds恢复原primary且matchestrue。完整Snapshot SHA37816e2e31c24f6e37b87dd6f837f8aa5cc6db00126a5bbd5e749b1dc1d09a2a；fullExport SHA90944a617eafa83a5a99d5b779fc5a753c93f93466eaa37809ff2ceaa6c6b39c；独立closedSnapshot SHA0788c1437490aaec2945ceaa7c45c720dd6d8821c34eb7bf1dfa412b065141e9确认activeCase=null/exported。机器成功伤害分类器保持INCOMPLETE，因为此处刻意取消子攻击，不能为分类虚构子命中。GUI截图/完整文件均在B目录wmp-cleave-primary-restored-*；下一步直接捕获原profile、禁用Midi并创建一个原生批次，不重跑Cleave。
- **Cleave准备阻塞已恢复，尚未复验目标恢复：** 164下执行者第一次Reset最后几何检查失败。父亲自通过普通UI新Snapshot发现实际已复位HP200及Large合法几何，5/5ft/preflightPASS，因此撤回“Reset未写HP/位置”的旧说法；Reset的准备写入早于其最后检查。父没有修改规则/位置，只基于新合法快照完成正常Reset，现在activeCase=cleave/statusreset，待执行父攻击及子取消。两份完整记录及SHA在active-case；旧错误仅摘要，不能确证当时为什么瞬时距离失败。Midi profile未切、原生仍未执行，服务/构建未变。
- **集成门禁已分步补齐，原生实测仍待回报：** 三次ci:verify日志保留，未声称某次完整命令零退出。首次止于既有测试3处nullable访问，补显式fixture/effects前置断言后所有类型门禁通过。第二次发现WMP fixture-macro测试留下game等全局对象，导致后续resolver 35项连带失败；新增before/afterEach准确恢复原descriptor。第三次通过前置/类型/架构/CLI与Session Monitor构建后，coverage在Web API测试启动处卡顿，被原有120秒watchdog回收，没有延长时限。定向同进程WMP+两份受影响resolver测试273pass/0fail；通过已有hermetic wrapper只重跑公开coverage脚本后，3082pass/0fail、336文件、92.07秒，生产行85.26%/函数86.24%达标。anti-overfit全430源、hygiene1540tracked、锁定dnd5e参考、Web build、offline Actor smoke（6项来源/0警告/0联网）全部通过。证据汇总B/wmp-integration-gates-resumed-20260929.json含各日志路径及SHA；未触碰执行中的浏览器或服务。最终资料与原生证据仍需收尾。
- **当前已安装164921338：** 冻结buildId164921338bd55d7b5aa96b475745ee317fd365fd98e23fe6c9b0a00e78632210，script78168ae057e8b805c8cc8d93f44203ea8efd25e4a72fb597619bb0c02304a585，treef7cd624b755ab19c6688f4233538492c89748244c426004d8eb1a135ce3c77fa。确认生成Fatal所有台账terminal、旧PID752归属和端口后，受保护patch仅改WMP脚本，verify-install PASS；现server-mirror/cor-cotn PID11220、30001、join200。证据目录B的wmp-164-preflight/patch-result/verify-install/postflight-20260929.json。客户端新build及Cleave取消目标恢复待本轮读回，不能把已安装当玩法PASS。
- **生成Fatal PASS（f442）：** 只一次公开Activity.use启动，正常UI攻击自然7+5=12、critical伤害2d10+1d10=9（3+4+2），无额外属性伤害；Apply后HP174→165，attack ChatMessage.rkCZKD6bwT1NHJky:0/native ULrASBkpuj3cGrNN committed、damageDealt9，准确nonce proof一致。完整after-inspect SHA9880a02d6f26fb3a70a529cfa502125962b1cb6594575bcb0161bedf288dce17；trace SHA647a4af5be43835d6062cda7e4e1cffdd6aa6bd1b0717787cef4115deb8c800e，各入口hook一次；前后截图和汇总同B目录。导入、管理器、生成两把武器已闭合，不重做。
- **依赖构建一致性已闭合，无需重装CC：** 原CC verify-install失败仅因Bun按调用cwd写入不同路径注释。已将已知源码banner固定为模块相对路径，加入从模块/仓库根构建ZIP一致性断言；41pass/353assertions、typecheck PASS。根verify-install现PASS，实际安装树4daf90768ca21d03ebdf9811b029c6f9b5bd3809f4892975f21fd58417b49926；Trigger Engine安装树a32e5cbb09030fb174ad98452aea9c8e80efc67da4d870f56a57429699698cab亦PASS。CC运行脚本实际字节未变，不声称重新实测全部状态。
- **下一阶段：** 原Midi批次仅补Cleave子攻击取消后的目标恢复。结束后通过新任务宏先捕获精确moduleConfiguration并落盘，再只禁用Midi、reload并核对；在同Lab/world为不同profile创建一个原生批次，先Vex两击与完整流血生命周期/来源快照。恢复宏、源UUID目录、当前PID/所有旧对象和不重复范围均见active-case；原生尚NOT_EXECUTED。
- **Cleave目标恢复兼容修复（源码已通过，未安装）：** 主控在Chrome Fatal验收之外完成独立必要修复。用v14公开TokenLayer.setTargets替换旧User方法，并防止场景/图层已切换或用户已另选目标时覆盖新选择。测试fixture不再提供虚构旧接口，针对原目标/空目标恢复和不应恢复的边界，安全test入口23pass/0fail/85assertions、模块typecheck通过。现运行仍f442，下一安装边界再实测必要恢复分支；不重跑已闭合伤害主链。
- **管理器与生成Deadly已闭合：** 管理器自定义Slow复制/保存/刷新及core/Actor隔离PASS；v2往返证明SHA4ac7ad6dfebc95245619ffcb5b54fccceb26c870279c1589b1b00a8855a02c69，完整读回SHAb9b3e8a430fd8269f76b9bb7e115a08f4509226a15550ffb6c827e2af0fb5435。主控亲自定位诊断宏旧目标API报错，修复本任务宏（非业务模块）后一次公开Activity.use→真实UI重击→Apply成功：Deadly自然12/总17、2d6+1d8=18、HP192→174，攻击GyWy85I29l8xBfz5/native BcIsk9yLBV7GbwY6，committed且damageProof nonce/前后HP匹配。完整parent-inspect SHA32cf3db6025aeb4766703822afa8f2660b8326a9a67a650062e901fa41f509dd；parent-trace SHA0db5c6ff6d8ee8fe663dcd278a9106aa3ed562d1c508bd9481d9a5d03cb8df22，记录一次启动及各攻击hook一次。截图wmp-generated-deadly-parent-ui-20260929.png。旧双窗未定位根因，但单次API流程未复现；不把该结果冒充原角色表重复点击路径修复。接下来只补生成Fatal，然后原生路径。
- **集成新增确切风险：** Midi子攻击目标恢复仍调用v14不存在的旧updateTokenTargets可选方法，会静默不恢复；在后续安装边界修复setTargets及针对性终态测试。诊断宏现已用公开canvas.tokens.setTargets，新SHA与Macro ID见active-case；旧宏错误属于主控准备失误，不能归为WMP伤害FAIL。主控诊断hooks已移除、自己的Chrome标签已关闭，现场无pending攻击。
- **正式导入/刷新往返PASS（f442客户端）：** 原始baseline SHA714c6f5d4925e81ea6d17b331d25e5632867a06529c5a0060f8292beea5d6ad9；刷新后SHA32009d2981759c2b394c92795d2d1feeca8126cae59b21c2ddd20d035c55a2e3。主控对照完整documents相等，Actor数值/两武器不同规则与1d6/1d8无额外属性伤害、core/modded配置隔离均正确；文件在generated-acceptance目录。Deadly首次使用出现双攻击窗后取消、HP192未变，尚无伤害成功证据。动作记录既有重复Activity入口点击，也有单次聊天卡点击后同时出现两窗，原因未定；先完成独立管理器检查，再用一次公开Activity.use及公开Hooks诊断，不未经证实改实现、不重复导入。新对象准确ID和诊断步骤见active-case；旧阻塞报告保留。
- **导入验收尚未执行：Chrome连接阻塞。** 专用任务发现Chrome清单ID4、旧绑定ID2，稳定Chrome选择器仍报旧ID不可用；未改世界/服务，未创建导入对象。阻塞报告位于generated-acceptance目录wmp-generated-acceptance-chrome-blocker-20260929.json，SHA256 cac82cfd2e277d076896c85bec63177b904e7cacc6f28045f968f4e064368305。主控针对回报核对实际调用，发现未走当前官方运行时的bootstrap/chrome故障文档，改为先走该支持流程；停止内部函数/包导出探查和opaque ID尝试。这是工具连接问题，不是WMP玩法FAIL，既有通过证据保留。
- **实际安装已更新为f442b786：** 依据已关闭Sap快照及精确旧进程/端口/世界核验，受保护stop→patch预览→apply→verify-install→launch成功，仅修改WMP两份README及脚本，无备份。现PID752、server-mirror/cor-cotn/30001、join200，脚本/分发树与冻结候选一致；客户端读回及生成导入仍待本轮Chrome完成。安装前后和patch/verify-install证据以wmp-f442-前缀保存于checkpoint目录。手册3个受影响条目已人工核对，handbook:build/check通过。
- **2026-09-29最新审查：** Fatal完整收据 `wmp-fatal-full-saved-receipt-build-913-20260929.json` SHA256 `3738f4d9262051722166925cfd0996d86e0bb3357b33d97af88b842896af1c46` 已取回；原始伤害roll含isCritical=true、house.fatal、2d10critmax10+3+1d10，总28、HP200→172。原机器分类缺人工骰观察仍INCOMPLETE，主控按真实roll判定该玩法PASS，不重写原件。流血完整收据 `wmp-criticalBleeding-full-saved-receipt-build-913-20260929.json` SHA256 `29e81306683b60d582e97108a3bb6bfe8b17863d06690b234006e7125466a389` 已取回；保留UI伤害11/tick6/恢复1解除的结论，未猜填已删除效果的createdAt/sourceUuid。后续原生流血验收时及时存中间完整效果快照。
- **Slow/Sap到期：** Slow实际HP200→196，speed30→20，来源下一回合开始恢复30；最终完整收据SHA256 `a788ee493565fee73f8004952f047c517f15eb35cc2673edfecb6392cfe0bae9`、分类PASS。Sap实际HP200→192，新效果在来源下一回合开始移除，最终完整收据SHA256 `65a27de897deac6712a644c5fef0280d717db4a39375aeceefd6d6f33c13c823`；本次有意不攻击消费，机器分类缺下一击属于覆盖口径，旧实际劣势/消费证据独立保留。两项均先保存中间完整收据再正常推进Combat，未直接删除效果冒充到期。文件同下述checkpoint证据目录。
- **生成链修复及工具修复：** 配置WMP的v14固定伤害Activity只保留一次来源伤害，并以签名标记准确基础骰；实际骰序或内容变化时拒绝错误绑定。原生基础骰路径保持不变。verifier拒绝丢失绑定和重复基础伤害。远程配置武器使用dnd5e v14实际melee/ranged判别值。收据按同一攻击damageProof计算武器伤害，不把后续流血和恢复的净HP变化当作武器伤害。245pass/0fail/1025assertions；模块及packages类型检查、架构检查、局部anti-overfit通过。新增候选f442b78651ebf6a108acd9ab710672b00ddeac49de3ffc0345fe11ce41438440；脚本049eaf35b2655c5305598e6dcf629d2ab8d8c0191e0c7dbdfae07ca3b3d13f74，分发树d3ea9fdc7198216c5e02f315ca7e917f27dc9586425332f5b914e634fc2a8ef4，安装/客户端实测分别记录，不把单测提升为玩法通过。
- **正式导入输入：** `F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-generated-acceptance-20260929/ready-import-manifest.json` 列出actor-ready.json、item-modded-ready.json、item-core-ready.json的准确SHA与公开Foundry导入宏。仅用ready文件，不用同目录早期fixed/roundtrip试验产物。合成Actor校准为标准humanoid及CR1/proficiency2；武器来源未改，固定1d6/1d8不得擅加STR+3。本轮服务更新后在同一世界/批次测试，新增对象逐项登记，批末统一清理。

### 历史步骤日志（仅保留追溯；旧“下一步”和安装身份不作为当前指令）

- **最新UI结果与证据缺口：** 913下Fatal正确选择critical，UI回报公式`2d10critmax10+3+1d10=28`、目标200→172，攻击Z8Lt9KoFUp4ZaSRK/native UpadIVopomMUwrmf；重击流血7yqR9YIfCXhxzE7z/native f8cArhqNsZV1QzXf实际伤害11、HP200→189，观察到新Bleeding gqDRAtfWh4j555Y3及精确Activity origin/1d6 slashing/turnEnd/highest/endOnHealing。目标正常回合结束tick6，HP189→183；正常角色表恢复+1到184后效果列表为空。相关截图和UI读回支持这些行为，tick的unmatched-attack-link属于条件伤害没有武器攻击来源的诊断，不能单独算玩法FAIL。
- **尚未取得这两项完整原始收据：** 名为wmp-fatal-corrected-export-build-913-20260929-incomplete.json和wmp-criticalBleeding-export-build-913-20260929-incomplete.json的文件实际只有面板摘要（约2KB），不是包含before/after/newMessages/classifiedInput的完整export。保持原件；不将摘要冒充原始proof或猜填sourceUuid/createdAt。已准备独立只读view-saved-receipt-macro.js从已保存台账显示完整JSON，下一步取回，不重做Fatal/流血。随后在同批次补Slow/Sap尚缺的真实到期分支。

- **Nick 主链 PASS（913真实UI），普通Club伤害缺口独立保留：** 回合8:1，Club首击 `ChatMessage.JDpnIfhnt6E6fL0R:0` / gpw1P1EkjBS19Oke committed/lightAttack；取消的未掷骰Dagger尝试未占用额外额度；Dagger `ChatMessage.LlvtwHjdgtlmCYuA:0` / UUbxhw8PceDJdo0L committed/offhand/lightExtraAttack、usedRuleIds仅Nick一次，实际伤害3、HP200→197。两把武器不同且都有Light；前后只读宏显示bonusActionsUsed未增加、hasUsedBonusAction=false，恰两次committed。回报中宏SHA有拼接笔误，主控核实真实SHA为 `81594abb9e49be9563ed79916f1d9c2277f719905d9338a44a737d00b4b1f0bc`。原Nick收据485d0e…保留INCOMPLETE，主控以原收据及前后宏关联推导extraAttack并回放PASS：[派生输入](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/wmp-nick-parent-derived-input-20260929.json)，SHA `c7aca56b2e37a9389bed285e8f43e0c0184167fcd7e596ebc4937c7dbd93b348`；分类文件wmp-nick-parent-replay-20260929.json，SHA `bf39b32197b137be2d0036a22f30fe254f9273e6ff3508d7ca7c1efda664b97b`。首击Club的7点伤害仍NOT_APPLIED，不能用Dagger扣血冒充Club也应用。Nick只要求前一Light攻击完成，不要求其造成伤害。
- **Fatal回报FAIL已撤回：本轮损伤模式选错，未证明实现故障。** 执行者在“投出Fatal暴击伤害骰”工具调用里确认窗口2d6+3后实际执行 `await normal.click()`；锁定dnd5e.mjs:65464以action是否critical设置config.isCritical。原伤害卡Midi.isCritical=false、1d6+3=5，HP200→195，与用户主动选择普通伤害一致；攻击台账critical=true不代表随后仍选择重击伤害。主控未改Fatal代码，保留原收据eff0bab…与5点扣血，另存 [操作复核](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/wmp-fatal-normal-selection-parent-review-20260929.json)，SHA `b3569341ef9b883f804eb39eb131826fba14bd2a5b4ba688a274248fc9b94d9f`。Fatal已exported/activeCasenull、source120/target195。下一步在913上只重测Fatal，明确伤害提交critical；通过后继续重击流血，不重做Nick/Cleave/Vex。保留新只读Nick宏8oHfxw7NPsKREmhN，批末与AGfrOUKVm4WFfTeS一同核对归属清理。

- **Cleave 正常父子攻击 PASS（913，API发起/真实UI选择与掷骰/Apply）：** 父 `ChatMessage.5XfG1PnR4i2QuQu7:0`，原生消息yXZLuIOn816YA2cc，攻击24命中、伤害14，primary200→186；子 `ChatMessage.5XfG1PnR4i2QuQu7:0:cleave:Actor.Jwg539TkIYAKZXFP`，原生消息veqtEZrhJBOv0nl5、Midi卡uTIV1HVOZgQMjpVd，攻击23命中、伤害 `1d12+0=2`，secondary200→198。实际source属性+3未加入子伤害；父/子committed，父本回合usedRuleIds仅一次Cleave、子无递归，几何5/5/reach5。原始收据 `wmp-cleave-export-build-913-20260929-incomplete.json` SHA256 `171c4c10cccce4087b20a568224f023f9bc88892c08afe5015f90c2d478da300` 保持INCOMPLETE原样。主控新增严格只读关联并回放为PASS：[派生分类](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/wmp-cleave-parent-replay-20260929.json)，SHA256 `a674fb0b374ee70a2d30da26ef1b50bbf787784dd4077c1e0f68b945d0c5f490`。真实post-export Snapshot SHA256 `9597897e74cb5d343f540e372c46e6d3049597b0d40c021d2d5583e1b48df1a8` 确认caseexported/activeCasenull，HP120/186/198。后续不重跑Cleave主链。
- **只读关联工具待统一安装：** Cleave新关联器拒绝重复子攻击、不同目标/回合/批次、缺失伤害证明/几何，并把错误加入正属性修正判FAIL；保留显式人工观察。239pass/0fail/994assertions及类型检查通过。进程启动型构建测试曾两次碰到5秒默认超时，仅将该测试改为有界15秒；最终全套实际2.67秒，不是长时测试。最新工具候选8c66306403bb099fd5c7e942f35e4ef9f999552e8a0f70f71395f584d9918536尚未安装；实际继续913/PID37276，避免纯分类改动打断下一玩法。准备了只读Nick action-state宏，核对两击前后Midi bonus action与本回合台账。下一步同批次Nick，然后Fatal，原始数据完整但仅分类缺字段时可收尾后继续，真实玩法/终态不明才停。
- **当前实际安装913abd6a，下一步定向复验：** 旧case通过独立可见Snapshot确认为exported/activeCase=null/batchready/pausedtrue、HP120/190；这次没有得到新完整ledger，只以此前原始完整记录确认父committed/子cancelled。摘要原文件尾部多了字面的反斜杠n，原件保留；主控从第一个完整JSON提取visibleSummary并另存wmp-cleave-post-export-visible-summary-parent-parsed-20260928.json（SHA256 bbaca0efb317986f08e8152891aa9799fe80e850aeacad95c468cd00fadd4f2a）。受保护patch预览确认仅script变化、实际patch和verify-install成功；新服务PID37276/30001/cor-cotn，/join200。913完整build/script/tree见下条，新客户端待读回。安装证据同目录wmp-cleave-913-artifact/patch-preview/patch-result/verify-install/postflight.json。下一步仅重载/接纳913、Reset清除旧case检查点、合法几何下Cleave复验再Nick，不重复Vex。正常Copy last后用标准Windows剪贴板读回并核对对象结构，browser clipboard的陈旧缓存不作为新证据。

- **当前待安装合并候选913abd6a，先独立确认旧case关闭：** 在Cleave等待修复上追加两项证据工具修复。Reset以前把新case对象赋给flag后保存，但Foundry递归合并保留省略的旧primaryAttackId/primaryAfter等；本次导出因此把旧`80PgVaHD51pqJZzn`攻击ID与新`KzQz73tNzexp8FOV`消息混配，并让旧build快照导致MISMATCH。原始错误收据SHA256 `28ba7e43f8227591be8be4e977d27a84ecfc133715979f35ade98f9aaab747cd`保留。现在Reset在同一Document更新中显式删除旧case省略字段，不修改原始外部证据；增加真实递归合并语义回归。面板现从实时ledger读取activeCase，避免把导出前after快照的旧activeCase与实时exported拼接。224pass/0fail/973assertions、类型检查与构建/产物回归通过；首次红测另遇到一次构建测试5秒超时，后续正常通过，未放宽超时。新候选 `913abd6a000c86e646d832d104d36cb652ed49bfe22f37fb76924f693725de89`，script `17a351ecbd535ef0cb0f3a5dfe4622037839348fb744de14a9d616ae6f33f40e`，tree `f5913b12478ec5da49a957b7061c0916873be804aade593449751cc2ae8ae20f`；913候选尚未安装，a95草案也未安装，实际仍8f。旧Export已返回完整receipt并closeCase=true/pendingUi=false，分类PRECONDITION_FAILED不等于关闭动作抛错；下一步只读一次独立Snapshot确认ledger.exported/activeCase=null后由主控安装，不重复导出或攻击。

- **最新真实故障与候选：Cleave 子攻击被等待超时误取消。** 8f构建的公开Activity入口已完成主攻击、合法secondary选择和子卡创建。原始Snapshot `wmp-cleave-runtime-api-after-primary-snapshot-01a0e7f1-20260928.json`（SHA256 `69e1db9249b527496fc583d20b86007dda1eeac79caa77e7e302ce190657abbd`）显示：parent `ChatMessage.CZI9DzHz1Jlo20FP:0` committed，child `ChatMessage.CZI9DzHz1Jlo20FP:0:cleave:Actor.Jwg539TkIYAKZXFP` cancelled；子卡 `FvADPqLlrUn9djRV` 创建1790608062295，到child更新1790608152287为89992ms。锁定Midi14.0.11的completeActivityUse有maxWait=90并在超时返回undefined；WMP旧代码随后取消尚未开始的child。晚些时候点已取消子卡不能继续，不能把它报告为新pending。主目标HP190、次目标200、来源120。
- **修复已离线验证，未安装：** 新适配器直接使用公开Activity.use，并以本次唯一sequenceId关联公开preAbort/postCleanup事件；卡片创建不等于结束，也不以90秒无结果判用户取消。真实拒绝/异常/终止清理监听，停止观察保留需复核语义，目标恢复不覆盖用户后续选择。Cleave接入该适配器，原生路径保持原实现。新运行时回归先221pass/1fail，修复后222pass/0fail/962assertions，类型与产物校验PASS。候选buildId `a95ef35272f1aba0a039d7d9eab33d9eb63757e195a4e9c0f8b3ebccf842f53f`，脚本 `27a8b50da6c6e842756fc61fbb4c35e93892b3812c603ebcae0134d21292d43a`，树 `3df93e97682035282b31f255c002fb92e60235b451106250d0b5574b17306bf9`；实际仍安装8f/PID23600。当前唯一动作是保存并关闭旧Cleave case，再由主控安装候选并复验，不点击旧取消卡、不开始Nick。

- **当前动作（8f）：** 首次Reset暂态失败后，独立新Snapshot证明合法几何和无pending，授权的一次Reset重试已成功；原始新before SHA256 `36be6738e721b956d8c99e8e51f30c408e7032871c84b05939f8d7dd484d92b6`。一次角色表单Midi活动点击未出现攻击窗或新增记录，不能宣称规则失败。当前已armed且HP不变，改用既有harness公开Activity入口及其未启动检查继续后续真实Cleave UI，准确标记runtime-api来源；本次表单启动未证实单独保留。禁止为了切入口直接改台账、重复Reset或掩盖pending。

- **Cleave 诊断已闭合，当前继续复验：** 实际grid.diagonals=1；Foundry14.364 `common/constants.mjs` 明确1=EXACT、0=EQUIDISTANT。源码与真实测量一致：source→secondary为7.071尺、primary→secondary为5尺、武器reach5，因此无合法第二目标是正确拒绝，不能归咎装备或认定Cleave实现失败。原classifier INCOMPLETE保留，主控将本次前提判为PRECONDITION_FAILED。[诊断JSON](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/wmp-cleave-selection-diagnostic-01a0e7f1-20260928.json) SHA256 `312853a828b830bf082095dcc7785d8075255379a85f8c8c0130480bb36f04f0`。旧case已exported、activeCase=null、无pending；原始export与收尾Snapshot分别为 `24258cf8867a1a66ae455940e3fab3c5d2164fbe6b3a59276ba8791816b94b58`、`02d51054786c2e4f2e83bf41810fd23743367771a2cefe222faeb707d43e0f3d`。
- **当前安装8f2cb9b4：** 只改测试准备、面板距离摘要及说明：Cleave用大型2×2来源、两中型目标不重叠且都在真实5尺范围；其他用例恢复中型1×1。Snapshot新增真实cleaveGeometry，超距/测距缺失在攻击前拒绝；没有修改玩法判定、武器reach或世界grid设置。回归先215pass/1fail，修复后216pass/0fail/931assertions，类型检查和产物校验通过。完整buildId `8f2cb9b4bebad3d9ca39f1e819cc5a567019d1a986f8d3399a9bea9f9ec9ff83`，脚本 `d47187756b7d8bccdd2c5f0aae1c2b2cf31adee267ab69e789e43ad963e82711`，安装树 `b8a94bdb02cc2834ab4cf4ea22df8c5ed5e247bed1ed9bcf957a5c230e24d839`。受保护patch与verify-install通过，新服务PID23600/30001/cor-cotn、/join200；客户端重载与新几何待读回。同目录 `wmp-cleave-fixture-artifact/patch-preview/patch-result/verify-install-20260928.json` 保存实际文件清单和前后哈希。
- **批末额外清理归属：** 只读诊断 Macro `AGfrOUKVm4WFfTeS`，名称 `WMP-E2E-12767f4e0f86 inspect Cleave`，保存待批末精确清理，不能替换初始化宏。该历史宏按当时中型棋子单格中心测距；新大型夹具用新版harness的完整占用格测量，不再重复旧诊断宏。

- **最新阻塞：Cleave 次级攻击未出现。** 5b75f834 的真实 UI 主攻击 `ChatMessage.80PgVaHD51pqJZzn:0`，原生消息 `4yCxr0eH3HfIuqCK`，d20 15+5=20 命中AC1；Midi卡Apply8后目标HP200→192、来源120，主攻击已committed、usedRuleIds为空，无子攻击。case awaiting-observation/activeCase=cleave，Combat4:1，暂停true。配置为enabled/grantMastery/selected=dnd2024.cleave；equipped=false不能单独定根因，现有几何和资格代码也没有装备门槛。需要实际grid测距和weapon.range/reach输入，不能凭相邻坐标或猜测装备作修复。[原始Snapshot](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/wmp-cleave-post-primary-snapshot-01a0e7f1-20260928.json)，SHA256 `544dbcb0a38970c2ad7eb1417426ec90c54c82346af3be7c1c303dd219668673`。新建独立只读诊断宏源码 `e2e/inspect-cleave-macro.js`（不替换初始化器），执行者通过正常Foundry宏界面读取输入并保存，随后关闭已终止主攻击用例；暂不重复攻击或进入Nick。
- **面板证据已复核：** `wmp-tool-load-vex-receipt-result-01a0e7f1-20260928.json` 的 classification.rules.vex=PASS、evidenceAssociation.scope=advantage-consumption-and-regrant、原收据buildIdentity仍7619585；`wmp-tool-accept-build-result-01a0e7f1-20260928.json` 为build-adopted、fixturesRetained=true，新build5b75f834。两文件在同一外部证据目录。

- Vex 生命周期证据：[到期阶段收据](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/wmp-vex-expiry-stage-result-01a0e7f1-20260928.json)，SHA-256 `70f43f5b6ea83c954ae4bf39d2ed4282f8c96b564916dfd340d8e66819cdb522`。来源当前回合结束、下一回合开始仍有同一效果；来源下一回合结束移除。HP120/178不变，终态Combat3:2、paused=true、case exported、activeCase=null。
- 构建指纹补漏：将已编入浏览器的 `e2e/receipt-evidence.ts` 纳入 source identity。新增覆盖先出现214 pass/1 fail，再修复至215 pass/0 fail/920 assertions，模块类型检查通过。只修复构建校验，不改Vex玩法。
- 已安装 buildId `5b75f8340996b9b7c50073b12f1798a4709ac2c762553baac9d13fbfec9f19b8`，脚本 SHA-256 `2539064ad4cf7551f7d4c298199453f8530237c5f2b4a11eca0595dc7c95649b`，安装树 `da8bb28d25f0f5efe888182496c18e32be6260fc72841f609afa27d4f5a18750`。`e92d2ff` 为已被替代、从未安装的工具候选；`7619585` 保留玩法证据身份。
- 本地主控核对归属后用受保护流程 stop/patch-preview/patch-apply/verify-install/launch，仅替换 WMP 的 scripts/index.js。server-mirror/cor-cotn 现为 PID35424、30001、/join HTTP200，客户端新构建待读回；未创建备份、未操作30002/生产。[安装核对](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/wmp-tool-verify-install-20260928.json)，同目录保存 artifact、patch-preview/result、preflight/postflight。
- 下一步由同一专用执行者 `01a0e7f1-7a3e-7950-ae23-b532413a4e05` 完成面板旧收据分类及正常重载恢复，再显式接纳新构建、复用原批次依次执行 Cleave 和 Nick；首个真实阻塞回报本主控。完整十一项和跨路径仍按上表推进，不能以 Vex 通过宣布 WMP 完成。

### 2026-09-28 Vex 干净复验：历史阶段记录（旧安装及停止点不再执行）

- **未掷骰取消 PASS（主控复核纠正执行者误判）：** 新独立执行任务 `01a0e7f1-7a3e-7950-ae23-b532413a4e05` 在真实 UI 打开 Vex 优势攻击窗并正常关闭。攻击 `ChatMessage.hWPUUgi9Oxvf8IfE:0` 已 cancelled；效果 `GQuotJPwswS0M1WO` 保留且启用，当前效果 flags 中 reservation 从存在变成不存在、revision 从 1 到 2，双方 HP 120/178 不变，聊天消息 ID 集合恢复至开窗前。执行者把历史 moduleLedger 中保留的 reserved 票据误当成当前预约，原 FAIL 回报保留，主控依据前后原始 Snapshot 和取消源码纠正为 PASS，不改玩法代码、不重跑取消。见 [独立复核收据](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/wmp-vex-cancel-parent-review-01a0e5db-20260928.json)。正常 Combat 到期仍 NOT_EXECUTED；当前下一步只做该到期链。

- **分类缺口已关闭：** 新增共享只读收据关联器，用检查点、唯一原生攻击消息、Midi卡、对应预约和效果读回恢复第二击身份，并检查第二次命中后的新效果。原始成功收据以新版CLI得到PASS，旧失败收据得到FAIL/`vex-regrant-effect-instance-absent`；两份原文件哈希保持不变。[正反回放记录](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/vex-receipt-association-replay-20260928.json)。未提供规则及cleanup仍NOT_EXECUTED。
- **工具候选与实测构建分开：** 已实测且仍安装的构建是7619585…。收据关联/面板摘要改进已构建为 `e92d2ffaffd01773e230c07da981553e1cfd13f94804356366abeb8ec13ba49d`，脚本SHA256 `81dc20ba188c28e97187d5b952f24f8391d63dc36d2683cceb5459bae4ddf3f2`、分发树 `b3218606f9a50b71c42e58b1a0c19871f7d42553afb1136bda7f3ae07d3bc323`，尚未安装或客户端验证。215项测试/918 assertions、模块类型检查和产物验证通过；runtime.ts、伤害证明恢复adapter与fixture-macro的哈希均未因本次分类改进变化。历史7619585玩法PASS不改写为e92d2ff已实测。

- **源码身份：** worktree I:/OpenCode/fvttV12JsonGenerator-worktrees/20260922-132850-weapon-traits-research，分支 codex/20260922-132850-weapon-traits-research，HEAD e2739f0d507c35e5395c9a9744b840618b0f4e5a；工作区有既存 dirty/untracked 内容。当前源码指纹：runtime.ts SHA-256 e2336ae7b94a1cd0d5ea7c519762a903f45bbf72cd2a9a670c42b8f7df80b65f，e2e/fixture-macro.js f517562c5e1c5785d0e6a8b9b958cce03f6aaed2c462fd2215e4d0e31ed1f256，src/e2e-harness.ts 0c8e23f32da8ea69355c1b1981b22f2e8984646193e8d0c297159bb41acf2887。此前记录的 harness 源码指纹 af48... 已过时。
- **安装与客户端身份：** Foundry 模块 fvtt-weapon-mastery-properties 0.1.0。server-mirror 当前安装目录 scripts/index.js SHA-256 056e05392630fd0bce3515097231fe4ee259600d320bdfc3bab7ee66f0200e4c；已有 verify-install 收据记录安装 buildId 76195852942e16bab42bc39ba7e1d7b30aeabf665b93e7d2dd1d9ba5481add24、安装树 SHA-256 1d62218e81fbd1c105abf472d8905d79dad9b49a8c73af0c4f6b101529383f0c、runtimeVerified=false。本轮 Chrome /game 当前客户端和完整两击收据均读回同一 7619585 buildId、buildIdentity=PASS。Foundry 为 server-mirror/cor-cotn，PID 20656，127.0.0.1:30001，14.364 / dnd5e 5.3.3 / Midi-QOL 14.0.11。当前 worktree 的冻结候选为 e92d2ffaffd01773e230c07da981553e1cfd13f94804356366abeb8ec13ba49d，候选 scripts/index.js SHA-256 81dc20ba188c28e97187d5b952f24f8391d63dc36d2683cceb5459bae4ddf3f2、候选树 SHA-256 b3218606f9a50b71c42e58b1a0c19871f7d42553afb1136bda7f3ae07d3bc323，尚未安装或客户端验证。今天只读运行 bun run verify-install:weapon-mastery-properties 返回退出码 1，原因为 Installed module bytes differ from the frozen artifact；这是当前候选与旧安装树不同的身份结果，不是 Vex 玩法失败。本轮未安装、重启或停止服务。
- **本轮玩法结果：** 干净批次 WMP-E2E-12767f4e0f86（ledger message pBGLgKaEeAkhlPPJ）真实 UI 两击链 PASS：首击自然 d20 9 / 总值 14 命中 AC 1，Apply 7，目标 HP 200→193，checkpoint SAVED，首次效果 ya1w85tUD6h5CEJf；第二击对同目标由 MidiQOL 的 Weapon mastery effect 自然提供优势，最终模式 advantage，旧效果在 Apply 前消费；自然 d20 20（另骰 8）、总值 25 重击，Apply 15，目标 HP 193→178，来源 HP 保持 120，proof seen/validated/committed，并生成不同的新 Vex GQuotJPwswS0M1WO。随后 case 通过 closeCase 收尾；紧接的独立 Snapshot 是最终 ledger 状态依据：caseStatus=exported、batchStatus=ready、activeCase=null、paused=true，source/target HP 120/178，新效果仍存在且 disabled=false。没有再次攻击或 Apply。
- **正式导出边界与未完成 workflow：** 原始正式导出 environment/buildIdentity 均 PASS，但 Vex 分类继续保留 INCOMPLETE / next-attack-identity-missing；原文件未修补。e92d2ff 的共享关联器正反回放已在 vex-receipt-association-replay-20260928.json 中分别判 PASS / FAIL，不能改写 7619585 的历史客户端身份。当前新效果仍在来源 Actor，生命周期锚为 Combat.m4vvFQWcmpFaL5Fk round 2 turn 1 end、turns=1。未掷骰取消、Combat 正常到期均 NOT_EXECUTED。case 已导出；harness resetCase 会移除该用例记录的效果并复位 HP、Token 坐标与 Combat 回合，因此本轮未 reset、未另开攻击，也未用未记录的 UI 操作冒充验收。
- **本轮完整证据：** 所有文件均在 `F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/`，执行器写入后按内容读回并核对 SHA-256。

  | 证据 | 文件 | SHA-256 |
  | --- | --- | --- |
  | 干净批次预检 | `vex-clean-preflight-WMP-E2E-12767f4e0f86-20260928.json` | `61b1a2532298e7ca8a94648f419f126027084722e02ab49cc371c0d72aa2338a` |
  | 首击前装备与资格 | `vex-clean-pre-attack-WMP-E2E-12767f4e0f86-20260928.json` | `67e8311c191ef63d68bf3ece77bbf18e7033ec264423d34f3ddf25edbf77dcfe` |
  | 首击完整回执 / Vex 检查点 | `vex-clean-first-hit-WMP-E2E-12767f4e0f86-20260928.json` | `251dc19637c8d426029314ddcad723e3694ba19b7b97b906bdf41f14ece5a517` |
  | 首击检查点截图 | `vex-clean-first-hit-checkpoint-WMP-E2E-12767f4e0f86-20260928.png` | `657455ec19c677fdd98f40265b15b3a36d44e174c6de6669c7e3544fe8b7659e` |
  | 第二击掷骰前来源/模式记录 | `vex-clean-preroll-WMP-E2E-12767f4e0f86-20260928.json` | `5edeef20292445ebdd43e2cecc502613273bcc111fe801cb634ef6fe102b7719` |
  | 第二击优势窗口截图 | `vex-clean-preroll-dialog-WMP-E2E-12767f4e0f86-20260928.png` | `b760d637bff12150069e530ec3ef1b1204a9436cefd4b7de1002f57b28acba8d` |
  | 第二击 Apply 前消费快照 | `vex-clean-before-second-damage-WMP-E2E-12767f4e0f86-20260928.json` | `a7c863be46f928181f7701eb2cc39875f7342767fc1c4d5c3f605f93a0c37ceb` |
  | 第二击 Apply 后完整对象快照 | `vex-clean-post-second-hit-WMP-E2E-12767f4e0f86-20260928.json` | `b64a9c2f2867107f7a46bc8266f228c1a240ee1714d6ddc94731e7ba9278c93d` |
  | 正式导出与判定器结果 | `vex-clean-export-WMP-E2E-12767f4e0f86-20260928.json` | `4ffa668116d80817b45f74481e0c15dc0b7647d516bc72ba6a9c84b4e5f92df7` |
  | 第二击重击、Apply 与重新授予截图 | `vex-clean-second-hit-reapply-WMP-E2E-12767f4e0f86-20260928.png` | `3f588c98b67d0d6e2dc60acc75c8f29d0d287399b9beea4d44efbf8c3f864f12` |
  | closeCase 导出（记录关闭请求；最终 ledger 状态以随后 Snapshot 为准） | vex-case-close-WMP-E2E-12767f4e0f86-20260928.json | 1b95bc3a8c02e86caa1d910232b452b008cc596d7733f8fd9ec7bfd37b1fe702 |
  | closeCase 后终态 Snapshot（exported / activeCase=null / paused=true） | vex-case-close-snapshot-WMP-E2E-12767f4e0f86-20260928.json | f1eb1452b07353ff287fae967e424681a1e5e84a31593b5bf329e1d44d0b6f15 |
  | 最终 Foundry 暂停现场截图 | vex-paused-handoff-WMP-E2E-12767f4e0f86-20260928.jpg | 26bb0df7b206c7eb4dd1ade3872df5c0787324c772e75dc5a33c71d71ccc6c26 |
  | 正反只读收据关联回放 | vex-receipt-association-replay-20260928.json | 35008ffd12fdcdabc58f510e7a47c3167813c9de051b8dd1b5164ed6a591f75e |

- **辅助过程快照（保留但不作最终结论）：** `vex-clean-first-attack-no-damage-WMP-E2E-12767f4e0f86-20260928.json` SHA-256 `1d27b1612551a356748c99934c1d71257746c89970dd4a830bfe35367c09331d` 与同名 `.png` SHA-256 `f3406824d7262f011fb9e830e5d4a5184cad9b8ca4238268a5a102d53ecd923b` 是首击与 Apply 间的过渡快照；`vex-ui-start-activity-no-attack-WMP-E2E-12767f4e0f86-20260928.json` SHA-256 `b9a1dcb70748af1fae527fe335c1c996477a56471c939a8d8b7806da1e45df42` 与同名 `.png` SHA-256 `13635970d78d94906551202d4d2683a021ff29057dfc470809429c7f63136255` 是 Activity 点击后攻击窗尚未渲染的中间状态。它们均由后续攻击/Apply 读回取代；现场保留，不删除。

- **保留现场与批次：** 当前批次 WMP-E2E-12767f4e0f86 / ledger pBGLgKaEeAkhlPPJ 保持 ready、Vex exported、activeCase=null、paused=true；Scene WoCU2Dyisn9RBVUu、Combat m4vvFQWcmpFaL5Fk。来源 Actor/Token FZIE4kdQEVpQVYiQ / 1M4trnKxEyQUiyCE，目标 Actor/Token pK1IvOfDbOWpXQPp / yZmjMErmwmVL5cer；Vex Item/Activity Kz3Yz6n1MzCuxUsj / rkjuC3ZV4s9UpD0i。保留首次效果 ya1w85tUD6h5CEJf 的消费历史和当前效果 GQuotJPwswS0M1WO。最终 Snapshot 显示 sourceSelection / targetSelection 均不匹配，新 UI 测试若后续进行必须先用普通界面重选并读回。旧失败批次 WMP-E2E-7cc7492a00fa 仍 isolated / requireNewBatch=true。保留全部夹具和初始化工具；不清理、不停止共享 PID 20656 / 30001、不提交、合并或推送。
- **唯一主控与下一步：** 聊天“审查开发流程并制定优化方案”（threadId 01a0e5db-97f8-7411-85e4-47f18fc64fec）继续负责代码、验收判断和安排。此前将主控交给旧聊天“修复武器精通 Vex 验收链”是错误路由，现已撤销；该旧聊天本轮仅只读核对，未修改代码、报告或游戏状态。后续按用户要求新建专用独立 GPT-6 Luna/max Chrome 验收任务，只向当前主控回报，不自行转交或修改代码、进度报告。剩余三项是 Vex 未掷骰取消、正常 Combat 到期，以及 e92d2ff 候选面板的收据分类；与已通过的 7619585 两击玩法结果分别记账。当前两击批次作为历史证据保留，不重写原始收据。WMP 用于验证可复用的开发与验收改进；单项修复不代表整个模块交付，更不代表流程优化目标已完成。
- **旧停止点失效声明：** 本节已覆盖先前“case 尚未关闭、awaiting-observation、pendingUi=true、暂停未恢复，以及随后先关闭再做取消/到期”的当前状态描述。现在以 case-close-snapshot 与最终暂停截图为准：case exported、activeCase=null、paused=true。旧 build 8dd4edd9…、失败批次 WMP-E2E-7cc7492a00fa、死机后批次 WMP-E2E-0948eca4b1c6 及旧 Chrome browser id 均为各自历史，不得映射到本轮 build 7619585 与批次 WMP-E2E-12767f4e0f86。

### 2026-09-28 11:52 北京时间：上一线程交接记录（历史，已由上节接手状态覆盖）

- **源码与检查：** dirty worktree 分支 `codex/20260922-132850-weapon-traits-research`，HEAD `e2739f0d507c35e5395c9a9744b840618b0f4e5a`；`src/runtime.ts` SHA-256 `7601a58b16e0d564e44bcfa77ef0211a36dd5ba725643bb301cd3ba90280d662`，`tests/runtime-integration.test.ts` SHA-256 `e31ccd4b346a2fc0a36bf00b4d8067164e40e4c8cc56b9b4abe6811072b5e26a`。源码增加了 Activity 精确身份恢复、Foundry 第二次伤害证明差异更新的存储字段核对及回归；后者离线通过但本轮运行时拒绝。`bun run test:weapon-mastery-properties` 为 **187 pass / 0 fail / 871 assertions**，`bun run typecheck:foundry-modules`、`git diff --check -- foundry-modules/fvtt-weapon-mastery-properties`、构建及 `verify-artifact` 通过；不把这些当成玩法 PASS。
- **安装与客户端：** 本地候选 buildId `8dd4edd9428bd1efda6ed216bca1f9aefb6bc7e34a7929498fe9be3d5975adc1`，运行脚本 SHA-256 `f39ee5c6f43af18c94c584e1aa575dc129116fa30e371d81bfa55926557b1af5`，分发/安装树 SHA-256 `19aeeed7d9720e1fbe0df7a3a39d70a90b620885f2b3f08d759ebfbbe36529e7`。受保护 patch 只改变 `scripts/index.js`，`verify-install` PASS；浏览器 GM harness 与完整回执均读回同一 buildId。`server-mirror/cor-cotn` 为 PID `39764`、127.0.0.1:30001、Foundry 14.364 / dnd5e 5.3.3 / Midi 14.0.11，`/join` 200。共享服务保持运行。
- **本轮结果：** 新批次 `WMP-E2E-7cc7492a00fa`，首击 d20=17/总22、伤害9，目标 HP 200→191，首效果 `FUaLzLWuDwXauLxT`，checkpoint `SAVED`。第二击 UI 对同一目标自然显示 `1d20adv+3+2` 与 `MidiQOL 优势: Weapon mastery effect`，骰19/10、总24；伤害前快照证明旧效果已消失。第二次伤害7经 Midi 卡 `WjLYMPs6oGd9Z5wM` Apply，HP191→184，但攻击者无新 Vex。目标 Actor 持久化证明含完整 `actorUuid`；`updateActor` 诊断为 `proof-partial-proof-mismatch`，来源台账仍 `step=attack`、旧预约 `started`。正式导出判定器因未填 next-attack identity 返回 `INCOMPLETE`，不能掩盖此运行时 FAIL。
- **原始证据：** [首击完整回执](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/vex-clean-first-20260928-112600.json) SHA-256 `62c783846401fe891a30b5be0be00abb6d2011fb9a7eb05125c09187a064ec60`；[掷骰前记录](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/vex-clean-preroll-20260928-114000.json) `68af42176319ba9ce61af56f02410ec8a929638085f8bc22ab1c6eb66b43aaa9`；[伤害前消费快照](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/vex-clean-consumed-before-damage-20260928-114200.json) `26fed99d0432561090a60a65856839bed9c4267eda433fb4ba1bba9bbd958256`；[第二击诊断快照](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/vex-clean-second-failure-20260928-114500.json) `e4c5433ebc942a215f95b54ce242f01f26dee85749c74744fcbc97ba866c1522`；[正式导出 INCOMPLETE 回执](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/vex-clean-export-incomplete-20260928-114700.json) `4dbf002d3191d45e23205781278c279a11b6ceb6b829c8f0e3bfefba43aa4045`。文件均已按内容读回并核对身份/哈希。
- **保留现场：** ledger message `GhIBAiV61nHz1lwO`；Scene `aDblqBhauoe2GcEA`，Combat `tdhjQ02lUE4yk0Ub`；来源 Actor/Token `PgTRQGB5OqoTXsi2` / `qpAeFgtHQman18li`，目标 `wY4ieVFqvvOa3c3d` / `WCswmA4lHYJYYym7`，Vex Item/Activity `lF6mkSoqUtn3Mnmg` / `rkjuC3ZV4s9UpD0i`。批次 `ready`、Vex `awaiting-observation`，第二攻击 `ChatMessage.WjLYMPs6oGd9Z5wM:0` 未终止；无攻击/伤害骰窗，GM harness 和攻击者表单仍开，paused=true，Chrome 标签 `651336443` 留在 `/game`。**没有 reconcile、reset、清理、停止服务、提交、合并或推送。**
- **唯一下一步（另一条聊天）：** 先只读对照第二击原始回执中 `updateActor` 差异证明、目标持久化证明与来源台账，定位 `proof-partial-proof-mismatch` 的精确字段/时序差异；核对现场身份后再决定最小修复及新批次复验。当前聊天已暂停，无后续写入。

以下旧 PID、buildId、批次、浏览器阻塞和“首击前/待第二击”的停止描述均是**历史记录，已被本节覆盖**；下方长期清单仍供后续接手参考，不代表本聊天继续执行。

## 0. 新 thread 先读这里

- [x] 用户要求把本模块的进度报告收敛到最多两份：本主清单 + [当前难点子 Plan（Vex）](../plans/weapon-mastery-active-case.md)。
- [x] 当前已知进度、旧证据边界、待办与现场恢复点已合并；被替代的八份本模块计划/报告移除，原始 JSON、截图、测试源码保留。
- [x] **开发已恢复。** 用户在 2026-09-27 明确要求阅读本清单及子 Plan 后开始执行；离线代码诊断已继续。游戏 E2E 仍须从子 Plan 的 V0 开始。
- [x] **原服务已自行恢复：** 2026-09-27 接手时 `127.0.0.1:30001` 无监听；随后使用受保护的 `bun run foundry:lab launch server-mirror` 恢复原实例。PID `14800` 独占本机 30001，命令行指向 `F:/FoundryLab/foundry-v14/app/14.364/main.js`、`data/server-mirror`、`cor-cotn`，`/join` 返回 200，日志显示 World Complete；30002 仍由独立的 server-next 进程占用。**尚未进入世界核对旧窗口、台账和暂停。**
- [x] **旧浏览器入口的拒绝已换成受支持的新 URL 绑定：** 独立执行器首次只读读取 Chrome 窗口时收到 Computer Use URL 置信度拒绝并停止；主任务随后在同一 Chrome 用官方标签接口显式打开并核对本地 `30001/join`，没有重试被拒绝的窗口接口。[官方浏览器扩展排查](https://learn.chatgpt.com/docs/chrome-extension)仅提供通用连接/profile 检查，不宣称修复此精确错误。
- [x] **浏览器连接已用受支持的新绑定恢复：** 主任务没有重试被拒绝的旧 Windows 窗口读取；通过官方 Chrome 标签接口显式打开已核对的本地 `http://127.0.0.1:30001/join`，新标签 `651335478` 读回该 URL、世界加入页和 Foundry 14 Build 364，已保留供独立执行器接手。此项仅证明 Chrome 能读取新页面；世界内旧攻击和状态仍未核对，V0/V1 不据此改为 PASS。
- [x] **V0 现场核对 PASS：** 同一执行器经新标签用 Gamemaster 空密码登录一次，浏览器读回旧安装 buildId `addfcd1ffca2c90de727d13943fe736abbd29e4d0a5afd6c44901d655e1c3f13`、CoTN+Midi、任务场景/战斗。旧 app-159/app-167 攻击窗口已不在当前页面；正式 `reconcileCase` 将旧批次隔离并要求新批次。目标 HP193、攻击者 HP120、旧 Vex 效果 `RAP7OpgFn8stf8ms` enabled、`paused=true` 已读回。证据：[V0/V1 恢复读回](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/vex-v0-v1-recovery-20260927-032155-767.json)，SHA-256 `e7ef2426deebb89292da0347b689032262f287ac6f000a005785eeb9d6ccfd25`。
- [x] **V1 已收束 PASS：** 两条旧 `prepared` 台账 `ChatMessage.xC9rRcGgi1F3E2B9:0`、`ChatMessage.0DDuQizNPtW0xKVn:0` 经精确前检后通过旧构建公开 `cancelUse` 顺序取消；均读回 `cancelled`，效果 `RAP7OpgFn8stf8ms` 的预约为 `null`，效果 enabled、HP193/120、`paused=true` 保持。旧批次仍 isolated，Vex 仍 INCOMPLETE。[V1 收据](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/vex-v1-cancel-prepared-eb74-20260927-034628-710.json)，SHA-256 `078c1048f2ffbf6cdb620aaE9d4c5d685e34fa8a74a2dfb864051ad0a2e12901`。临时宏 `c542s92jHkFGC16U` 留到批末清理；全量 Blob 下载失败，紧凑收据和既有首击原始检查点保留。
- [x] **固定候选已安装到原 Lab：** 旧批次隔离、悬挂攻击取消后，主任务记录安装前 8 文件清单与哈希，受保护停止 `server-mirror`，按旧完整树哈希 `7b13b9...` 预览并 patch 武器模块的 3 个文件。`verify-install` 返回新 buildId `0025cd81b3be40ebd0f4f73f1baba07d5c8f2d2bad9a35f607e62ec820beac1c`、树哈希 `26d44a9889cf2a9e3fcc3eba497ac33184ed568c1fd5359913ab099202fd6f27`；同一服务当时恢复为 PID `37448`、`127.0.0.1:30001`、`cor-cotn`、`/join` 200。浏览器后来读回新 buildId，但玩法尚未执行。[patch 结果](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/wmp-patch-result-20260927.json)，SHA-256 `e61ba1bfb814b4c28a1e713d304af4f7d66f0ccdba1cece4d43762f8bb14f5df`。
- [ ] **死机后续点（2026-09-27 晚）：** 上一独立浏览器回合被系统中断，尚无最终 E2E 回执。回合记录显示已在新安装 buildId `0025cd81…` 下创建新批次 `WMP-E2E-0948eca4b1c6`、准备 Combat、复位 Vex，并打开任务场景 `KSQ0YR7I71b3Xo9R` 的 Scene Config 查看照明；未见首击/掷骰/Apply 记录。主任务只核实 worktree 未变、已安装脚本哈希与候选一致；死机后 `30001` 无监听，已用受保护入口恢复原 `server-mirror/cor-cotn`，新 PID `39340`、`/join` 200。继续前由执行器读回该批 ledgerMessageId、场景/Combat/HP/效果、暂停与窗口状态，不重建批次，也不把回合记录当作玩法 PASS。
- [ ] **浏览器权限服务阻塞（2026-09-27 晚）：** 独立执行器在新回合没有统一 Chrome CUA 工具；主任务按受支持的官方 Browser 客户端连接同一 Chrome，扩展可列出标签，但打开 `http://127.0.0.1:30001/join` 时被安全校验拒绝：`saved browser permissions could not be verified`。这不是 Foundry `/join` 不可达（HTTP 200）或已证实的网站拒绝；保存权限快照无法核实，未进入游戏、未运行新攻击。已停止浏览器操作，未换 Sky/CDP、未改权限配置或读取浏览器 profile。参照[官方扩展权限与排查说明](https://learn.chatgpt.com/docs/chrome-extension)；当前尚无受支持的浏览器游戏操作通路。新批次对象保留，不清理或重建。
- [ ] **权限服务排障补充：** 全新 Luna 子任务同样未获得统一 CUA 工具；本机插件虽启用，其 manifest 声明在当前 code mode 隐藏该工具。官方 Browser 客户端能连接 Chrome 扩展，`node_repl` 重置后同一 URL 再次被保存权限快照校验拒绝；本地 `browser/config.toml` 存在且 TOML 可解析，Codex 更新器回报 `up_to_date`。这些事实没有证明权限快照失败的底层原因，也不授权修改允许列表、关闭自动审查或换控制通道。游戏状态仍停在新批次首击前。
- [ ] **用户确认 Chrome 可用后的再核（2026-09-27）：** `server-mirror` PID39340、30001、`/join` HTTP200、已安装 WMP 脚本 SHA-256 `3125258f57249163e15b08037bc6f69556caf78c2fdc0f900c37750b170f2cfa` 均保持；官方 Browser 客户端重新发现 Chrome 扩展，但对同一 URL 的正常权限校验仍返回 `saved browser permissions could not be verified`，随即停止。旧独立执行器也确认统一 CUA 工具仍未提供。只读核对表明自动审查路径在审批模式判断之前就要求完整保存权限快照；改变 `approval_mode` 不能解决，且本轮没有改该配置。Chrome 用户界面可用不等于本代理的浏览器权限桥已恢复；新批次仍在首击前。
- [ ] **新独立任务的能力核对 INCOMPLETE（2026-09-27）：** 新任务 `01a0e332-f05a-7de0-b78b-48dc9c764ead` 只有确认 `mcp__node_repl__js` 可见，误以为它不是浏览器控制入口，因此没有尝试正式 Browser 客户端或页面读取。主任务随后在当前会话通过 `mcp__node_repl__js` 正式导入 `@oai/browser-desktop`，`setupBrowserRuntime({environment:'codex-app'})` 成功列出 Chrome 扩展和本会话内置浏览器；这只证明正式入口存在，不能推断新任务的页面访问权限已恢复。主任务本轮未重试已被拒绝的页面访问。独立只读核实 `PID 39340` 由当前管理员运行，`127.0.0.1:30001` 指向 `server-mirror/cor-cotn`、Foundry `14.364`，安装目录 `Data/systems/dnd5e/system.json` 报告 `5.3.3`（不是本次客户端加载证据），`/join` HTTP 200；30002 的 `server-next` PID `41620` 未触碰。`bun run verify-install:weapon-mastery-properties` 返回 buildId `0025cd81b3be40ebd0f4f73f1baba07d5c8f2d2bad9a35f607e62ec820beac1c`、运行脚本 SHA-256 `3125258f57249163e15b08037bc6f69556caf78c2fdc0f900c37750b170f2cfa`、分发树哈希 `26d44a9889cf2a9e3fcc3eba497ac33184ed568c1fd5359913ab099202fd6f27`，但明示 `runtimeVerified:false`。没有登录或进入世界，未读 harness selector/ledgerMessageId、窗口、暂停、HP、效果或场景设置；因此没有调用 `ensureBatch`/reset、没有重建批次或运行攻击。现有 `WMP-E2E-0948eca4b1c6` 及场景 `KSQ0YR7I71b3Xo9R` 保留，当前没有新玩法证据；上一回合“首击前”的状态仍待浏览器核实。
- [ ] **用户要求主任务亲自验证 Chrome 后的分层结果（2026-09-27）：** 主任务正式 Browser 客户端能列 Chrome、创建并关闭空标签；在新标签对 `http://127.0.0.1:30001/join` 调用 `goto` 时，宿主返回 `Browser Use could not request permission ... saved browser permissions could not be verified`，页面未加载，随即停止。主任务 `node_repl_auto_review_required=true`，新独立任务为 `false`；[Codex 当前模型清单](https://github.com/openai/codex/blob/main/codex-rs/models-manager/models.json)将此项分别固定在 GPT-6 Sol 与 Luna 上，说明两者的浏览器审查要求不同，但完整权限快照为何无法刷新仍未证实。两任务均为 `approval_policy=never`、`danger-full-access`，差异不在文件沙箱。新任务经正式 Chrome 客户端成功读取 `/join`、登录 Gamemaster、进入 `cor-cotn` 并打开 GM harness，只将 Batch 选择到现有 `WMP-E2E-0948eca4b1c6 (ready)`，selector 值 `5twdNfJXS822mlwK`；未运行 Snapshot/selected，未读 ledgerMessageId，也未调用 ensureBatch/reset、攻击或 Apply。用户要求先由主任务解决自身 Chrome 操作后再恢复独立任务，故该任务已暂停，测试现场保留。
- [x] **2026-09-28 主任务 Chrome 复验 PASS，游戏验收仍 INCOMPLETE：** 同一正式 Chrome 扩展新标签打开 `https://example.com/`，DOM 读到 Example Domain，点击 `Learn more` 后 URL/标题及 DOM 读回 IANA Example Domains；自建测试标签已关闭。首次访问本地 `/join` 返回 `net::ERR_CONNECTION_REFUSED`，不再是保存权限校验错误。核对 30001/30002 均无监听及原 Lab 路径后，用受保护 `bun run foundry:lab launch server-mirror` 恢复精确 `F:/FoundryLab/foundry-v14/data/server-mirror`、`cor-cotn`，新 PID `15596`、30001、`/join` HTTP 200。主任务 Chrome 读到 CoTN 加入页/Foundry 14 Build 364，选择 Gamemaster 并按本地约定空密码提交一次，URL 进入 `/game`；加载中的深层 DOM 快照超时，不声称已读回模块或批次，额外标签随后确认关闭。独立任务恢复后须重新登录、核对安装 buildId 与 `WMP-E2E-0948eca4b1c6` 的 ledger/对象/暂停/视野，再从 Vex 首击前继续；本条不构成 Vex PASS。
- [ ] **2026-09-28 Vex 首击检查点 SAVED，外部收据 INCOMPLETE：** 原独立任务的消息接口本轮未暴露，主任务继续使用已验证的正式 Chrome。在 PID 15596 / `cor-cotn` / WMP buildId `0025cd81b3be40ebd0f4f73f1baba07d5c8f2d2bad9a35f607e62ec820beac1c` 读回现有 `WMP-E2E-0948eca4b1c6`（ledgerMessageId `5twdNfJXS822mlwK`）、Scene `KSQ0YR7I71b3Xo9R`、Combat `KndphQjk2cycno6A`；初始 HP 200/120、无效果/攻击、paused=true。受保护 Vex 复位后控制的来源 Token `2uuXsMP8dwG5uLwT` 与目标 `c0K2zeYnkxpVJIDZ` 均匹配；真实角色表单装备专属手斧，Snapshot 读回 `equipped=true`、Activity `rkjuC3ZV4s9UpD0i` canUse。UI start 后先确认活动点击中心落在 Vex 子行，仅点击一次；只出现一个攻击窗口。首击 d20=9、总值14 对 AC1，普通伤害骰 1+3=4，当前 Midi 卡 `qJBBZj1nkRcqsjmX` 的唯一 Apply 后目标 HP 200→196，攻击者仍120。紧接着 `checkpointVex` 返回 `SAVED`，攻击 ID `ChatMessage.qJBBZj1nkRcqsjmX:0`、原生攻击消息 `bvvPLSBkOoQXAZQg`、攻击者新 Vex effect `mO6RmAbNSzhRMQSw` enabled；伤害证明诊断为 seen/validated/committed。完整收据的 Download last JSON 在 Chrome 打开 `blob:` 标签但未形成下载；正式 Browser 客户端随后明确拒绝读取该协议，原文为 `The requested URL protocol is not allowed. Allowed protocols: http:, https:`。该标签已关闭，没有用剪贴板、替代浏览器、原始 CDP 或 API 绕过；**未保存完整外部收据，故不进入第二击**，游戏内批次与检查点保留。父任务的 Chrome 现场标签 `651336415` 保留用于恢复。
- [ ] **2026-09-28 Vex 新证据与失败点：** 项目 runbook 规定的应用内 `Copy last` 在原 `/game` 页面成功导出首击完整收据，逐字段核对 runId/build/伤害/效果并落盘为 [首击原始 JSON](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/vex-ui-first-hit-checkpoint-20260928-101500-705.json)，SHA-256 `26a80c9c6c0ec2617c19caa142c78d081254410119d5a744845a3030a2604caa`。Verifier 环境与构建 PASS；当时 Vex 因第二击尚缺而 INCOMPLETE。`prepareVexNext=READY_FOR_DIALOG` 后同目标只点一次 Activity，唯一攻击窗为 `1d20adv+3+2`、优势自然选中，AC5E 来源 `MidiQOL 优势: Weapon mastery effect`，`recordVexPreRoll=READY`；[掷骰前完整 JSON](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/vex-ui-preroll-2026-09-28T02-20-42-643Z.json)，SHA-256 `a52fdf412820c419ce9d26ffde6a99289cd75ee6bf94775d844f390c9722b761`。第二击优势骰 20/1、总25 对 AC1；伤害应用前，[独立快照](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/vex-second-roll-consumption-2026-09-28T02-22-27-164Z.json) 证明旧效果 `mO6RmAbNSzhRMQSw` 已消失，SHA-256 `2f4810f9ffbe99cfd16ca23417ebc8034e2726afe7f4c8ec6367bcf6ad44e6dc`。重击伤害10经第二 Midi 卡 `eNCa0GElFzc8GGtP` Apply 后目标 HP 196→186；稳定后攻击者仍无 Vex 效果。[第二击完整诊断 JSON](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/vex-second-hit-diagnostic-2026-09-28T02-24-54-397Z.json)，SHA-256 `869e331588a4653a2805a9053f74c6f4a675fa5f699da0988cf60ecdd3fae73c`：第二攻击 `ChatMessage.eNCa0GElFzc8GGtP:0` 的证明先被 updateActor 看见，随后 `proof-state-unavailable`；其来源 ledger `step=attack`、预约 `started`，没有 commit/新效果。现有判定器因尚未填第二击身份只返回 `INCOMPLETE`，不能用该结果掩盖真实运行时故障。当前批次保留，先定位修复，不展开其他用例。
- [ ] 用户希望明天完成；按本次日期记录目标日为 **2026-09-28 北京时间**。按下方顺序收敛，实际完成以验收证据为准，不再给无依据的完成时刻。
- [x] 主任务负责代码、证据复核和本清单；Chrome 执行器仅操作游戏并返回短收据。曾发生执行器跨批次写错报告，已撤回；旧“普通单骰=Vex FAIL”不能沿用。
- [ ] 接手时先核对 Git 状态和服务身份；下列 PID、构建、窗口和对象是最后记录，均非本轮现场验证。

## 1. 工作区、范围与权限

| 项目 | 当前约定 |
| --- | --- |
| 工作区 | `I:/OpenCode/fvttV12JsonGenerator-worktrees/20260922-132850-weapon-traits-research` |
| 分支 / HEAD | `codex/20260922-132850-weapon-traits-research` / `e2739f0d507c35e5395c9a9744b840618b0f4e5a`；本轮只读 Git 核对 |
| 主模块 | `foundry-modules/fvtt-weapon-mastery-properties`（武器精通与特性） |
| 配套模块 | `fvtt-custom-conditions`、`fvtt-trigger-engine`；候选依赖 API v1，模块 0.1.1 |
| 验收环境 | server-mirror / cor-cotn / Foundry 14.364 / dnd5e 5.3.3；Midi 14.0.11、DAE 14.0.12，保留 CoTN 模组组合 |
| 本地地址与数据 | `127.0.0.1:30001`；`F:/FoundryLab/foundry-v14/data/server-mirror` |
| 交付范围 | 官方八种 Cleave、Graze、Nick、Push、Sap、Slow、Topple、Vex；家规 Deadly、Fatal、重击流血；配置 UI 与正式生成链 |
| 范围外 | PF2e 系统、三行动制、连续攻击减值、AC+10 重击、dnd5e 6.x / v12 运行适配、生产部署 |
| Git / 服务边界 | worktree 有大量既有 dirty/untracked；未 commit/merge/push。保护主区既有改动；不得直接改运行中 LevelDB、停他人服务、创建备份或复制 Lab |

用户已允许本任务测试超出原来的 30 分钟限制；时间授权不解除后来的暂停，也不授权发布。恢复时适用的 AGENTS 与工具权限仍须核对，不能拿旧规则或旧 PID 直接操作。

## 2. 已完成（只勾实际完成的层级）

- [x] 自有模块、规则身份/来源/目标契约、11 项规则候选代码、配置管理器、生成投影与 verifier 已实现；这不是 11 项玩法全部通过。
- [x] 状态模块已有 Sap/Slow/Vex 独立效果，以及 `apply/list/reserve/start/commit/cancel` 生命周期接口；触发引擎提供通用事件。
- [x] 正式 CLI 曾生成 core/modded-v14 Item 与一/二武器 Actor；Actor verifier 无错误，Item 经 workflow 值级核验。不是 Foundry 导入后完整往返验收。
- [x] Vex 工具链已增加首击检查点、第二击目标/效果前检、真实优势来源记录、双方 HP/效果摘要、伤害证明诊断。
- [x] 9 月 26 日新 Vex 首击：真实 API 发起、实际扣血 7，攻击者新效果 ID 与攻击编号固定，完整 JSON 已保存且哈希核对。
- [x] 第二击曾在真实 UI 出现 `Weapon mastery effect` 优势来源；净模式被视线条件抵消为常规时，记录 STOP 并取消，未强制掷骰。
- [x] 本批场地照明经受控宏开启；全局光照开启已由 Scene Config 读回。源码中未来夹具的明亮照明与 Token 60 尺视野也已补齐。
- [x] 源码中旧收据载入时遗漏分类的问题已修正并包含在新安装构建；浏览器读回与玩法待验证。
- [x] 2026-09-27 离线诊断发现 Midi 启用且预检状态缺失时，`preRollAttack` 会落入自有 `attack()` 回退，存在二次开窗风险；新安装候选已阻止该回退并加入回归。**旧双窗口归属与实际根因未现场证实；不能记运行时 PASS。**
- [x] 本次改动后 `bun run test:weapon-mastery-properties`：186 pass / 0 fail / 860 assertions，新增运行时重载后取消未开始 Vex 预约的回归；`bun run typecheck:foundry-modules`、本次源码/测试 `git diff --check` 通过。候选构建、`verify-artifact`、本地 `verify-install` 通过；浏览器/玩法层仍待执行。
- [x] 最近代码检查（9 月 26 日）：模块包 `bun run test` **168 pass / 0 fail / 761 assertions**，类型检查通过；聚焦 harness 曾为 53/0，最后夹具检查 20/0。入口范围不同，不能相加或当作玩法通过。
- [x] 历史静态整合曾通过架构、生成、参考缓存、离线 smoke 等单项检查。完整 `ci:verify` 当时在三个同 HEAD 主区可复现的 strict-null 错误停止，不能写成完整 CI PASS。

## 3. 玩法清单（历史局部 PASS 不等于最终候选全通过）

| 完成 | 项目 | 已有证据 | 仍未闭合 |
| --- | --- | --- | --- |
| [x] | Vex 主链/生命周期 | Midi两击/取消/到期PASS；a56原生两击自动优势、消费/再授予及重复入口保护PASS，完整证据见文首 | 不重跑两击链；权限与同Actor多Token仍在整体影响复核中，不暗算作实机覆盖 |
| [x] | Slow | 实际命中减速30→20、来源下一回合开始恢复30，完整收据a788ee493565fee73f8004952f047c517f15eb35cc2673edfecb6392cfe0bae9 | 最终资料/清理；纯数值、叠加和单位边界复用已通过低层检查 |
| [ ] | Push | 零点后一次真实命中、伤害 8、合法直线 10 尺位移 PASS；旧 API 收据已在磁盘核对 | 最终候选关联和批次收尾；不重复已足够的位移证明 |
| [ ] | Graze | 历史真实未命中 HP 49→46，局部 PASS | 最终候选相关路径与必要边界复核 |
| [x] | Sap | 新实例、实际劣势/消费与来源回合自然到期PASS；原生取消保留、输入劣势在最新253回归覆盖 | 最终资料/清理；不将低层检查称作新的多人实机验收 |
| [ ] | Topple | 历史失败 CON 豁免后 prone，局部 PASS | 精确 DC、免疫/成功分支的证据闭合 |
| [ ] | Deadly | 历史自然 20 多出配置的 d8 并实际扣血，局部 PASS | 移除配置保留其他 bonus、最终候选影响复核 |
| [x] | Cleave 主链 | 913合法第二目标、独立子攻击/伤害、正修正排除、一次额度和无递归；原收据只读回放PASS | 原生/多客户端及负值边界按跨路径计划映射已有低层证据，工具新分类待统一安装 |
| [x] | Nick 主链 | 913同回合两把Light真实UI，offhand额外攻击、一次额度、附赠动作保留；父任务关联回放PASS | 首击Club普通伤害NOT_APPLIED独立记录；共享额度/并发边界按跨路径计划复用低层检查 |
| [x] | Fatal | 913完整收据核对2d10critmax10+3+1d10=28；正式生成导入武器2d10+1d10=9实际扣血PASS | 普通命中/附伤/基础骰选择边界已由core-critical和生成测试覆盖；最终资料/清理 |
| [x] | 重击流血 | 913已有UI链；a56原生施加/正常目标回合tick5/治疗1解除与完整来源参数已由父14项原件核对PASS | 保留原分类器INCOMPLETE及手填ID错误原件；不以可选createdAt缺失为重测理由；批末清理待完成 |
| [x] | 配置与生成 | 正式Actor/core/modded Item导入刷新一致；复制自定义Slow预设保留Deadly、保存刷新通过；生成两武器实际使用通过 | 最终手册同步与准确导入对象清理 |
| [ ] | 原生 / 多客户端 | 历史玩家攻击后 GM 应用伤害局部 PASS | 独立 native 路径；玩家/GM 权限、同 Actor 多 Token、并发一次性效果、取消/GM 恢复的必要路径 |

不能删减上述范围来宣称“明天完成”。不做全排列：规则组合尽量用受影响低层检查和真实公开 API，不同交互机制保留 UI 实测。

## 4. 恢复后执行顺序

**本节为长期路线图；当前现场、唯一主控与即时下一步以文首最新记录为准。11:52 停止点属于历史，不再用于任务路由。**

- [x] **P0：旧现场已收束。** 旧窗口随服务重启消失，无法再还原其工作流归属；正式 reconcile 将旧批次隔离，两条未开始攻击经公开 API 取消并核对预约释放，`paused=true`。保留旧对象和证据，不混入新批次。
- [ ] 原 `server-mirror` 服务恢复后重核端口、PID、路径、运行者、世界与构建；若旧浏览器/窗口已随服务中断消失，先查台账与预约状态，不能假定取消或消费已发生。
- [ ] **P1：定位单次攻击入口。** 查清重复启动或旧窗口残留；Midi 与原生适配只选一条负责启动本次掷骰，条件模块负责效果生命周期。记录根因后才修改。
- [ ] **P2：关闭 Vex。** 一套清楚可见的任务场地，一次首击检查点，一次第二击，旧 effect ID 消费与新实例分开；原始文件存在且判定器结果支持结论。
- [ ] **P3：继续剩余四项。** 在可复用批次中依次做 Cleave、Nick、Fatal、重击流血；每项先复位用例，失败停该项，返回具体调用/结果/原因。复杂项占用同一个子 Plan 槽位，不另铺新报告。
- [ ] **P4：关闭跨路径缺口。** 根据最终代码影响补 native、玩家/GM、取消、并发与到期门禁，复用有效旧证据，不从十一项起点重新跑。
- [ ] **P5：形成可交付本地候选。** 固定构建 → 核对安装 → 证据归属 → 受影响检查与集成门禁 → README/手册/健康索引一致 → 精确清理任务对象并读回世界恢复。
- [ ] 每个工作段结束直接更新本清单的结果、证据、下一步。若同一 UI 动作两次没有产生可解释的新证据，转为代码/工作流诊断，不继续重复点击和导出大 JSON。

## 5. 构建与验证边界

- **当前安装与候选身份以文首最新记录为准：** 安装为 `7619585...`，Vex 两击链 PASS；待安装工具候选为 `e92d2ff...`。`8dd4edd9...` 的 FAIL、`0025cd81...` / PID `39340` 均属于历史，不再是当前安装或停止点。
- **旧批次使用的历史构建** buildId `addfcd1ffca2c90de727d13943fe736abbd29e4d0a5afd6c44901d655e1c3f13`、完整树 `7b13b9eff7e1f095f9833fb37edfc093f658a0035bf0d137cced71ce101f920d`；不得将旧首击检查点算入新候选验收。
- Trigger Engine `verify-install` 通过。Custom Conditions 的 `verify-install` 因脚本字节不同停止；剔除构建路径注释后安装与候选执行代码逐字一致，故本轮未扩大更新范围。最终精确安装一致性仍需处理，不能写成全依赖 `verify-install` PASS。
- 两击 Vex case 已关闭，剩余生命周期先在现有安装上完成并保存独立收据；新候选安装前确认没有未完成 workflow，之后显式接纳新构建，旧证据保留原身份。
- 恢复后按改动选安全包装入口：`bun run test:weapon-harness`、`bun run test:weapon-mastery-properties`；需要时运行模块类型检查、`bun run build:weapon-mastery-properties`、产物/安装核对。
- `bun run verify:weapon-evidence <receipt.json>` 只核对提供的证据，不能证明浏览器真的执行过；测试数、安装一致性、UI 与玩法分别记账。
- 本次文档整合仅核对内容、链接、两份清单数量及手册生成一致性，不重新运行 Foundry 或代码测试。

## 6. 保留的重要契约

- 官方八种全部自研；家规最多一项新增特性，Deadly/Fatal 默认互斥。资格显式配置，NPC 不因拿着武器就自动获得精通。
- Deadly：仅重击后加指定骰；Fatal：仅重击替换武器基础骰并另加一骰，附伤隔离。例：1d6+4 → Deadly d8 为 2d6+4+1d8；Fatal d10 为 2d10+4+1d10。
- Cleave：合法第二目标，独立攻击 ID，正能力伤害修正不加入、负修正保留，每回合一次且不递归。Nick：使用 Light 原有额外攻击，不凭空增加次数。
- Sap/Slow/Vex 有独立 ruleId、source、target、stackingGroup、expiry；不复用既有 Slowed 偷换语义。
- 效果预约必须排他，取消未开始攻击释放预约，结果未知的已开始攻击不自动再授予；旧 Vex 先消费，新命中得到的新 Vex 再创建。
- 活动 GM 验证身份、权限与真实来源；不直接写最终效果/血量制造验收结果。最终 JSON 走正式生成链，不手工补成通过。
- 已提交主区与本 worktree 既有改动不自动整合；主区旧 ADR 若方向冲突，在获发布授权后的整合阶段处理。

## 7. 最少证据入口

以下文件本次仅核对存在性/已列文件哈希；不新增游戏证据。

- Slow：[真实通过摘要](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-final-20260925/slow-pass-summary.json)。
- Push：[旧构建原始 API 收据](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-vex-checkpoint-20260926/previous-push-receipt-copied.json)，SHA-256 `3bdb2e5236d4f5dc7c9ad9b5a03714596c7b42c2c2f4d13f4bddcb3dbf70ce6d`。此前已核对环境/Push PASS；不代表当前 UI 或所有规则通过。
- Graze/管理器等历史与 Sap/Deadly/Topple/玩家局部证据：[9 月 24 日独立收据](F:/FoundryLab/foundry-v14/evidence/server-mirror/weapon-mastery-cotn-chrome-fresh-20260924/weapon-mastery-cotn-chrome-e2e-receipt.md)；更早 Graze 在 `weapon-mastery-cotn-chrome-20260924/e2e-report.md`，恢复只读所需片段。
- Vex 的原始检查点、故障证据、对象和宏 ID 仅在子 Plan 维护。
- 操作用法：[模块 README](../../foundry-modules/fvtt-weapon-mastery-properties/README.zh-CN.md)、[CoTN runbook](../runbooks/weapon-mastery-cotn-e2e.md)。这些是稳定使用文档，不另承担进度台账。

## 8. 两份文档的维护规则

- [ ] 每关闭一项，在本文件直接勾选并补“构建/入口/API或UI/读回/证据”；不另建日报、交接、暂停或修复报告。
- [ ] 当前唯一子 Plan 为 Vex。完成后把结论压回本文件；遇到下一项复杂问题，复用并改写同一路径 `weapon-mastery-active-case.md`，在其中标明当前规则。
- [ ] 同时存在多个难点时，未开始的只列在本文件；不同时生成多个子 Plan。原始 JSON/截图放既有证据目录，不能包装成额外报告。
- [ ] 新 thread 只先读本文件；处理当前难点才读子 Plan；不默认遍历历史聊天或整个证据目录。

</details>

# Forge 通用状态的 Midi 命中桥接

本轮用户已授权补充通用命中状态。真实 ServerMirror 的攻击结果由现有 Midi-QOL 同卡流程处理，需在 Forge 适配该边界；不修改或重新安装 Midi、AC5e、Trigger Engine、Custom Conditions 或 WMP。

## 来源与接口事实

锁定本机 Foundry 14.368、dnd5e5.3.3、Midi-QOL14.0.11。Midi 已安装 `midi-qol.js` SHA-256 为 `ca530b51fc4883067c5571f1d985931087c09bb21887f9a24c3ab95d48f3a966`；安装目录的 LICENSE 为 MIT。上游项目地址为 <https://gitlab.com/tposney/midi-qol>。本次依据本机完整构建及 dnd5e5.3.3 reference cache，未将最新文档推广到此版本。

- `dnd5e.preRollAttack(config, dialog, message)` 的签名未变。Midi workflow 将 `chatMessage=false`，原生 `BasicRoll.buildPost` 不创建独立消息，也不设置 `roll.parent`。
- `midi-qol.AttackRollComplete(workflow)` 在 `checkHits` 和 `displayHits` 后触发；普通攻击的 `setAttackRoll` 和 `PersistedFieldStore.setRoll` 缓存原 Roll 对象。额外机制替换 Roll 不可据此推定等价。
- Midi 的 `chatCard` 可能是带待写更新的缓存 clone。实际消息中的攻击计数、结果、目标及 Roll 必须与已确认 workflow 对应；卡片更新可以晚于完成事件。
- 本机阶段 B 的普通 +7 攻击分别为 12/19、目标 AC15，真实卡分别记录 `isHit=false/true`、空/唯一 `hitTargetUuids`。两者均无 Forge 独立消息标记，19 后实际无状态，这条失败仍保留。

精确入口：Lab `Data/modules/midi-qol/midi-qol.js` 的 `rollAttack`、`WorkflowState_AttackRollComplete`、`displayAttackRoll`、`getCachedDocument2`、`PersistedFieldStore.roll/setRoll`；reference cache `module/dice/basic-roll.mjs` 与 `module/documents/activity/attack.mjs`。完整原件与阶段收据在任务 `.local/forge-status-lifecycle-20261009/`。

## 本项目采用的差异与最小反证

Forge 保留原生独立消息路径，同时增加精确14.0.11的单目标 Midi 路径：preRoll 保存一次性来源/目标/注册 workflow/卡片身份，postAttackRollConfiguration 保存真实 Roll 引用；命中完成后核 workflow、来源 Activity/Item/Token、目标和命中集合，再等实际持久卡的攻击计数、骰结果及 UUID 一致才执行。两路不能重复结算。未知版本或 Roll 被替换时由 GM 核对，不以卡片文字猜测结果。

确认命中时捕获持续时间与原 Combat 锚点；延迟持久化不重开期限。排队执行时已到期则记录而不施加。真实卡形状回归先红后绿，当前运行家族64项533断言通过；独立复核发现的延迟期限 P2 已修复并复核。真实 R5 命中及后续回合末行为仍待复验，不能用这些检查关闭玩法接受。

待判断本地化清单：本轮无新增候选。Midi 仅为既有兼容对象，不引入外部代码或内容本地化。

新版本复查步骤：重新核安装 manifest/code hash，核 pre/post 事件参数、workflow 注册/普通 Roll 身份和持久卡时序；先运行同卡 miss/hit、缓存 clone/延迟写入、重复、目标变化和到期回归，再进行一条真实命中链。若任一事实改变，不沿用本轮 PASS；不自动扩大到 ServerNext 或生产。

R5真实窄链与回合末补记：新的自然16对AC15命中自动产生原生目盲及唯一来源claim；14 miss和自然1总8不施加。刷新不回放旧消息，启用状态准确恢复。跳过、带状态重载保持和一次真实体质19对DC15成功解除已获接受；剩余分支仍待执行。Midi `setRollDialogOptions` 在未指定configure时可采用既有快掷设置，B3因此没有原生Save窗口；R6对Forge这次重复豁免显式传configure:true，使取消和情境加值入口可用，不修改世界设置。接口调用契约保留红例并复验，不撤销已有效的成功解除证据。

R6真实剩余分支补记：显式原生窗口取消后同组保留且无完成Save消息；实际劣势9、优势14均失败保留，优势23成功解除。情境加值输入未改变可见或持久公式，未将其算作生效，测试实际bonus为0；按正常优势/劣势的真实结果判定。第二规则在来源自身轮8/turn1以原生18命中唯一目标，应用恐慌/感知DC13，目标回合末可跳过，轮10/turn0仍存在、10/turn1到期清除。停用后enabled=false/runtimeOwners为空，世界时间21085811及全部外部效果source快照不变。瞬时误选自身/无目标等准备失误原件保留，不列为有效命中覆盖。父已核11份阶段读回hash、3Save和命中卡/source claim及原锚点，详见执行记录。夹具精确清理在最终查看/下载批次独立记录；没有重跑AI或将局部修复失败改写为通过。

最终C收尾已核：正常清理本批原生ChatMessage后，对应15条消息及Midi workflow key均无残留，未调用私有cache清理或修改Midi代码；独立audit确认原视图、Combat、世界时间、外部效果与海鬼婆对象恢复/保护通过，两个辅助宏随后原生删除。证据为任务chrome/iab-generic-stage-c-receipt.json、accepted-closeout-c.json及下载final-audit SHA4f372118e6c744f587c01f563251430245e472c62c7275e39d28aed6594266d4。该结论仅绑定本机14.368/5.3.3/Midi14.0.11及R6脚本，不覆盖未知Midi版本、生产、分钟真实时钟到期或任意额外规则。

## 2026-10-10 原生状况目录与独立倒地后果

锁定dnd5e5.3.3 reference commit965ad2d0cf5d063dac675ba078b5bd3c3c0dd449，仓库LICENSE.txt为MIT。reference module/config.mjs与已安装dnd5e.mjs的conditionTypes正文逐字一致；排除pseudo标记和带levels的力竭后，14种普通原生状况可由同一闭合参数契约表达。incapacitated附在麻痹、石化、震慑、昏迷主效果内；unconscious另有riders:['prone']。本项目保持原生factory元数据，不把系统隐含状况拆成Forge独立来源，也不把力竭层数或未知自定义定义近似成开关。完整来源hash与精确fixture在任务catalog-expansion/native-status-provenance.json及模块tests/fixtures/native-conditions-5.3.3.json。

锁定module/documents/active-effect.mjs的createRiderConditions通过canonical static ID查重并独立创建倒地。独立审阅据此发现：先Forge定时prone占用canonical，再unconscious时独立rider会被查重跳过，之后仅prone声明解除会误丢系统后果。校准factory double后的双规则红例复现该身份冲突。最小修复只让Forge定时prone始终使用独立ID，保留canonical给系统rider；成功先解除Forge prone、再解除unconscious时，独立倒地始终保留。69项运行/构建/归档检查及独立复核通过；代表性实机与精确恢复在执行记录分别记载，目录覆盖不能代替逐项实机。没有新增外部模块、本地化候选或第三方执行代码。

后续复查：若目标系统、原生factory/rider语义或安装模块对condition配置的修改发生变化，先重新核conditionTypes及createRiderConditions，再运行双来源倒地/昏迷反例；不能沿用本轮canonical身份结论。未知状态定义需明确注册及独立机制参数后再接入。

## DAE14.0.12 自动镜像与独立后果

实际resume-r1仅Toppling命中后已有Forge随机prone及canonical dnd5eprone000000，后者dae.autoCreated=true；Slumber未执行，不能把它叫作unconscious rider。锁定本机DAE14.0.12 module/dae.js SHAa3d4497a59e9755093ec2d2af26487896bf1bf83e1242a26dab42f293337b73b，manifest上游https://gitlab.com/tposney/dae；已安装包未包含license文件或manifest许可声明，本次没有复制DAE执行代码。reconcileActorStatuses把非canonical active效果的statuses与canonical子状态作为输入，补缺失canonical并标autoCreated，输入消失时删除这些输出；condition immunity可删除含手动canonical的受免疫项。DAEdnd5e.preCreateActiveEffect只调用同一个native createRiderConditions，未自动将已有DAE投影转成独立rider。

因此仅让Forge prone使用随机ID仍不足：DAE先补autoCreated canonical，使native rider查重跳过，再在原Forge prone结束时删除它。校准唯一测试ID后的等价DAE模型正确复现这一P1，prone-only对照通过。最小适配放在Forge的nativeStatusRiders中，主效果已创建且active、同Actor写锁持有时调用native rider接口；仅exact14.0.12纯自动canonical投影，通过公开Document update把autoCreated改false，保留ID、其它规则/来源数据及正常原生站起操作。独立rider不加入主状态的回滚/期限删除列表。未知版本、额外foreign metadata、失活或异常形状不猜测接管；已有非autoCreated canonical原样保留。效果正常_stats审计变化不伪装为旧值。

新增错误的created主效果回滚、已有主效果复用后再次倒地、未知版本/foreign metadata不改均有回归。独立审阅另指出只免疫rider的目标不可因rider被DAE删除而撤销主状态；接口红例后按确切CI Set/Array过滤，并在主控制器确认unconscious/claim保留。最终76项784断言及模块类型/架构通过，P1/P2独立复核关闭；实际组合与prone-only对照仍由R9浏览器批次单独接受，不把源码反证或单测当实机。DAE旧删除快照与外部并发操作没有因此获得全矩阵保证，不接私有调度队列。

新候选复查：除前述native rider代码，还需核DAE自动投影资格、CI过滤、创建/删除时序及autoCreated语义；重跑上述反例与同一来源的真实窄链。无新增待判断本地化项目，未升级或重新安装DAE。

2026-10-10 R9真实窄链已接受：定时prone总15命中后，unconscious新卡总24命中；纯DAE canonical同ID仅autoCreated true→false及正常审计时间变化，旧Forge效果/claim及其它规则/来源字段保持。目标回合末CON10分别总12、总17成功，先只解除Forge prone，再解除unconscious/隐含incapacitated及其镜像，系统独立prone始终保留。正常原生站起后另做仅prone对照，总26命中/总20成功，Forge及DAE自动投影均清除。该站起只作重置，不算自动解除证据；伤害未应用，确认命中/来源声明链独立获得接受。执行器收据 `catalog-expansion/chrome/resume-r2-receipt.json` SHA `d10f1b19737748805d81ace36455d35e0f2e7f7386b97e036128b2a347d20b95`，父独立核24文件/12原生消息及真实下载，`accepted-resume-r2.json` PASS。精确清理与独立audit通过、外部效果/世界时间及原场景战斗恢复，2辅助宏已删除，同一Mirror保持运行。该实机结论绑定R9/DAE14.0.12/本机固定版本与稳定顺序；仅rider免疫仍属聚焦测试，未知版本及外部并发删除不获额外保证。

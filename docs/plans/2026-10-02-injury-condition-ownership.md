# 伤势归入 Custom Conditions，复活功能独立保留

日期：2026-10-02。基线：master `61974058f1af4e0f70fc675a0c856cae07d99a8f`。本轮候选工作树：`20261002-134635-injury-condition-ownership`。

## 用户决定与完成目标

用户决定把伤势作为 condition 交给 Custom Conditions，通过现有 Trigger Engine 接收生命值事件；独立复活仪式保留，之后再决定是否退役。Forge GM 工作台与 Creature Blueprint 的统一由用户另开讨论，本轮不改 Forge 产品界面。instruction-scope 经[逐项评估](../reviews/2026-10-02-instruction-scope-evaluation.md)后按后续授权[选择性实现](../reviews/2026-10-02-instruction-scope-integration.md)，保留来源回归、验权和版本底线。

伤势迁移包括状态、0–3 层规则、HP 归零／恢复／满血、成功短休／长休、死亡豁免保留的自然 19／20、管理器和 HUD。Custom Conditions 不依赖复活模块才能处理伤势。复活模块只拥有消逝的灵魂状态机、仪式、快速复活锁及历史；没有 Custom Conditions 时也能继续开启新的死亡 episode 和下一次复活。

## 所有权与兼容边界

- 新伤势权威状态位于 `flags.fvtt-custom-conditions.injury`。旧 `flags.fvtt-injury-fading-spirits` 原件保留；后续复活写入只更新 `fadingSpirits` 子路径，不整块覆盖 flags 或删除未知字段。
- 旧 injury 字段、已处理事务 ID 和精确识别的投影按既有规则迁移；未知 schema、重复投影或相互矛盾的数据拒绝自动改写并报告。迁移继续沿用已有 ActiveEffect ID，保留其他功能的数据。没有旧 injury 字段的新复活状态不构成损坏伤势数据。
- 只由当前 active GM 写入；队列执行和跨模块入口重新核对权限。Actor 原生值不会被已过时的排队事件倒写。事务账本随伤势状态持久化，避免重载后重复计层。
- HP 事件由 Trigger Engine 的通用订阅接收；休息与死亡豁免使用系统原生接口。来自其他客户端的休息请求必须以实际消息、Actor 关联、发送者和 Actor 权限证明，不能信任 payload 声称的 GM 身份。
- 复活成功通过公开接口抑制该次恢复计层；新死亡 episode 通过公开接口通知可选的复活模块。新 Custom Conditions 不能与仍写伤势的旧复活模块形成两个所有者。
- 迁移沿用原世界 enabled／manageNpcs 意图，不自动打开新自动化或扩大 NPC 管理范围。共享生成器的十九种 `ConditionId` 不扩展；本轮伤势属于运行时分层 condition，不宣称新增 Actor JSON 生成功能。
- 保留首批整合候选的 `weaponEffects` 和 Trigger Engine external-event API；武器专精的既有 5.3.3 支持边界不因伤势迁移扩大。

## 精确版本事实

伤势代码的精确配对为 Foundry `14.364` / dnd5e `5.3.3`，以及候选 ServerNext `14.368` / `6.0.5`。用户后续明确本轮实机验收只在 Server Mirror；Next 为 OUT_OF_SCOPE，6.0.5 保持未实机验收。十九种通用 Custom Conditions 与武器效果仍限定 `14.364` / `5.3.3`。

2026-10-02 从官方 releases API 核实最新稳定 6.x 为 6.0.5。精确本地来源为 reference cache：5.3.3 commit `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`，6.0.5 commit `3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc`。两版 `actor.mjs` 都在更新完成并生成原生 rest 消息后调用 `dnd5e.restCompleted`；消息关联实际 Actor，`type` 为 `rest`，`system.type` 为 `short` 或 `long`。Context7 返回的 Wiki／6.0.x 只用作导航，不能代替这两个固定来源。

主线 2026-10-01 的 Next 伤势公共 API／设置恢复代表接受仍属旧所有者证据；不能直接推广为本轮迁移后的 HP、休息、自然 19／20 或仪式联合接受。

精确本机 Core 14.364／14.368 的 `dist/server/sockets.mjs` 中，`handleCustomSocket` 在指定接收者和广播两条分支都把服务器当前 `this.user.id` 作为监听器第二参数发送。因此发送者验权使用该参数，不读取 payload 自报身份。文件 SHA／路径另存 `socket-provenance.json`；这项固定源码证据仍不能代替实际 GM／玩家跨客户端传输接受。

## 验收出口

| 层级 | 必须证明的结果 |
| --- | --- |
| 聚焦测试 | 伤势规则、旧数据保留／冲突拒绝、active GM 与发送者验权、重复／延迟事件、独立第二次复活、跨模块恢复抑制及旧 API 兼容 |
| 构建与版本 | 三模块 typecheck、ZIP／manifest／实际 runtime 一致；精确版本门与 6.0.5 通用状态拒绝；图标原字节与署名匹配 |
| 组合边界 | 保留 WMP 公开契约；更新依赖锁文件后 frozen install；手册逐项核对、生成及 check；组合后的必要集成检查 |
| Foundry 真实行为 | 实际客户端加载候选版本；旧 injury migration、HP 归零／恢复／满血、原生休息与自然 19／20、HUD／管理器、重载防重、独立复活与联合恢复抑制 |
| 发布 | 上述门禁闭合后再按已有明确授权集成；记录主索引和用户基线、合并结果与手册检查。未授权 push／生产写入不执行 |

首次服务只读检查中 Mirror 没有 listener；Next 的一次HTTP读取失败不是零启用模块证明。之后父任务按身份门启动并管理同一个Mirror／matrix；独立Chrome执行器完成实际验收和恢复。Next全程保持本轮范围外。

## 当前实际接受

Server Mirror 14.364／5.3.3／matrix 的本轮代表行为、玩家和双GM、原值恢复及Foundry fixture清理均PASS。包括旧数据迁移、伤势HP／休息／保留19–20、管理器／HUD、重载、DAE空元数据清除与外部字段保留、独立两次成功复活、真实请求按钮、联合成功复活HP抑制、伪payload的服务器sender验权和玩家blind可见性。19／20及仪式20为控制输入的真实系统调用；贡献按钮17为真实自然随机，二者分开报告。

最终CC runtime `d62f11a4…ab55e5`、模板 `79826f17…86f9fe`、IFS runtime `fa75368f…2cbb44`、TE runtime `bef0559c…f5ba2`在Chrome实读。原十Actor／三旧flags／两投影、原用户与模块／设置已恢复；三个Actor、一个Scene、两个User、三个Macro、23消息及四个官方Chrome拥有tab已清。正常Core审计_stats更新不伪造为旧时间。旧CU空白窗口因无法从官方Chrome确认映射，单独NOT_CLEANED；生产及长时NOT_EXECUTED，完整模式分支／并发压力未宣称通过。完整状态和证据在[整合记录](../reviews/2026-10-02-injury-condition-integration.md)。

最后服务PID67592／30001仍由父任务保留运行。之后合成用户认可的首批恢复增量与规范，须重新完成组合门禁，并验证WMP与CC／TE0.2.0的实际接通；旧CI与旧WMP历史接受不自动成为新组合PASS。

## 图标恢复依据

`e8604d64e48b354b2954210f2959ce8cf734ecc9` 中四个伤势 SVG 均为已选定的 Game-icons Bandaged 原文件，1138 字节，SHA-256 `0bbf9c29d30da4e1fbfa55e612adad767282cd8d4c66beefc806fa81d9b832b1`。主线 `6197405` 恢复 Next 内容时把图标回退到旧心形／数字文件，却保留 Bandaged 的 CREDITS。本轮恢复已选定的原字节到新归属资产和旧兼容路径，保留 Lorc／CC BY 3.0 署名；层数继续由实际状态标签显示。

## 准备记录

首批候选的必要依赖按显式清单复制到本工作树，共 24 个文件。清单原有的 `fvtt-trigger-engine/tests/lab-owned-upgrade.test.ts` 在源候选不存在，复制报错；当时脚本末尾的 25 计数不成立。已逐项核对存在文件，未把末尾成功退出当完整复制通过，也未改动源候选。已有 frozen install 通过；模块版本改变后仍需更新并再次核对本工作树锁文件。

此文是完成目标与证据边界，测试绿色或构建产物存在不单独关闭 Foundry 语义验收。最终结果及未完成层级登记在同日期的伤势整合 review 中。

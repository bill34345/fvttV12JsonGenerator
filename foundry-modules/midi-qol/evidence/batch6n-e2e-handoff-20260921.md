# batch6N：恢复后的明确 E2E 执行单

目标：ServerNext `http://127.0.0.1:30002` / cor-cotn / Foundry 14.368 / dnd5e 6.0.2 / Midi local.6。父方已恢复原服务并核对 PID 36368、loopback、API 身份、join 200、磁盘/HTTP bundle 哈希一致。恢复记录在 F 盘迁移证据根 `batch6N-service-recovery-20260921/recovery-result.json`。

父方负责全部源码分析/修复、测试工具、构建安装、服务恢复和验收清单。执行器只做下面列明的 E2E、采证及自己测试状态的恢复/清理；不调研源码、设计补丁、修服务器。无整体时间上限，但单个操作失败需有限重试和准确错误。

## 浏览器入口

仍用 external Chrome，不用 IAB。旧 CUA provider 报不可用，但父方通过受支持的 `computer-use` 插件已确认 `@oai/sky` 可用，`sky.list_apps()` 返回运行中的 `Chrome` 及新标签页窗口（当时 ID 594088，仅供重新发现，不复用旧截图/元素）。使用该插件文档初始化自己的 node_repl、重新选择唯一 Chrome 窗口，通过正常 UI 操作。本次明确采用原生桌面工具控制外部 Chrome，不能声称已修好旧 CUA 连接。若工具仍不可用，回传精确错误，不切换浏览器或重启服务。

## 先恢复遗留状态

1. 空密码 Gamemaster 登录已授权。确认 world/system/build、实际页面 local.6；记录当前设置和现场，不假定上次值仍在。
2. **Z02 优先**：若 `ConfigSettings` 的 gmDoReactions/enforceReactions/reactionTimeout 仍为本任务临时 all/all/60，恢复原 none/none/10。字段逐项 compare-before-restore；若已有别人改变，记录冲突，不覆盖。恢复原客户端场景/遭遇 view，不 activate 共享场景/遭遇，不修改时钟。
3. 保存本次可用 Console/Troubleshooter 基线。后续每个 case 立即落盘，不能等 ring 满了再导出。记录工具不支持的证据能力。

## 本次要测

| 编号 | 操作 | 必须验证的结果 |
|---|---|---|
| B04 | 对保留的真实 5 环 Fireball 卡，在客户端刷新后从正常伤害入口**再次掷伤害**，观察恢复的活动/物品和新 roll | 新 roll 仍 10d6，源活动仍 base8d6，无 null.getFlag 或双缩放。原 39 点 roll 的 Apply 不算重新掷伤害 |
| E03 | 在本任务 inactive Combat 的客户端 tracker view 中验证 used-reaction 效果的正常 reset；必要时再次正常接受/拒绝 Shield | actor.inCombat 为真；真实 used-state/资源证据已有，可引用 M；新增正常 reset，不直接改 flags。对上次 disabled Shield 从正常卡 Apply Active Effects，验证 AC，勿把有文档视为已应用 |
| C06 | 自有遭遇中使用正常活动建立适用回合到期效果，经正常回合推进验证到期 | 正常回合事件使效果失效、属性恢复，共享 worldTime 不变；不手填 expired/remaining。不能用已通过短休代替回合到期 |
| G03 | 使用自有目标的正常伤害卡，在客户端不同场景 view 中观察不可用，再返回可用并正常 Apply 一次 | 不可用行无可操作目标且 HP 不变；恢复可用后实际 HP 按伤害变化一次，捕获 DOM/UI 与前后 HP |
| G04/G05 | 每例采集 Console/Troubleshooter 增量、网络故障与 workflow 状态 | 不遗漏新错误；既有附魔错误保留编号，不重复施放制造日志；BFP404/Calendaria 单独归因，不修它们 |
| Z02/Z03 | 结束恢复设置/view，逐 UUID 清理本任务文档并读回缺失 | 无本任务挂起 workflow、测试残留或临时配置；ServerNext 继续运行 |

如果正常 UI/API 无法在不影响共享状态的前提下执行某条，保存具体行为与限制，不伪造通过、不自行改业务逻辑。可以编写本任务测试宏/证据采集代码，但不能要求执行器承担源码修复。

## 不重测与待父方事项

- 不重测：A01–A05、B01–B03、C01/C02/C05、D01–D04、E01/E02、F01–F04、G01/G02、Z01；必要的 E/G 步骤经过已过路径不算另起完整重跑。
- **B02 已在 L 通过**，不得再次写未执行。A 的早期证据为 local.3，不得全称 local.6。
- **C03/C04 暂不测**：附魔创建失败已有完整诊断，父方负责最小修复；不重复同一失败，不将此项阻断当成忽略其他独立项的理由。
- Z04 由父方复核全部证据后完成。

## 自有对象清理范围

L/fixture-inventory-pre-cleanup.evidence.json 为原始清单；增加 M Combat.xYa05YifCrc4A3Dh 及本次确切新建对象。五 Actor：waaKKOrQv76aNNG3、UFma7YaMRS6e20JT、6G73ekCjdnN2UUZU、vJb8pcWFJJh6vQj7、t7W3isT6GdOFeeyd；Scene.RyluHOjH0iBC7xro；Macro.8e4OhzBcxoQ6eaQy。删除前核对 UUID、任务名称/标记及引用，只删自己创建的对象；保留必要 ChatMessage 证据。用户已经授权清理，不重复请求 action-time confirmation。不得直接写 LevelDB、删锁或停服务。

## 回传格式

新目录：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6N-midi-qol-local6-e2e-20260921`。

必须维护 `results-by-id.md`，按 **B04、E03、C06、G03、G04、G05、Z02、Z03** 逐行返回，而不是 A/B/C 大组；每行提供 PASS/FAIL/PARTIAL/NOT_EXECUTED、实际 build/time、预期/实际、原始证据文件、UUID、剩余问题。C03/C04 单列待父方修复，不改成通过。

回传至父任务 `01a0b8d1-e8db-70f2-9662-fd9beb035162`，以“Chrome 子任务回传”开头。执行器不修改总清单；父方复核后更新勾选。

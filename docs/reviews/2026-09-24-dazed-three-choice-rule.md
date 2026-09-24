# 自定义恍惚／震愕：回合选项三选一

日期：2026-09-24。用户明确决定修改本项目 Custom Conditions 的自定义 Dazed「恍惚」：在自己的回合从**自主移动、执行动作、执行附赠动作**中选择一种；选择后不能再执行另外两种。Shocked「震愕」由复合状态继承 Dazed，因此必须同步规则与完整悬停说明。这是本项目的用户规则调整，不声称与 Drakkenheim 正式版 Appendix C 逐字相同。此前[文案核对](2026-09-23-drakkenheim-condition-wording.md)中的「移动／动作二选一、不能使用附赠动作」是历史状态。

## 行为边界

- 选择移动：可按该回合的移动规则继续自主移动，不能随后执行动作或附赠动作；GM 强制位移、API 位置变化仍按原有裁定边界处理。
- 选择动作：不能随后自主移动或执行附赠动作。选择附赠动作：不能随后自主移动或执行动作。两种状态都不额外禁止反应。
- 活动真正完成后才记录所选类别；正常关闭攻击配置弹窗产生空掷骰，不消耗动作或附赠动作。攻击配置弹窗关闭后到掷骰与聊天发布完成前，在本客户端为当前 Actor/回合临时预留该类别，阻止并行选择另一种。若掷骰异常失败或被后续其他 Hook 否决、没有成功 Hook，预留会保守地保留到本回合结束并在阻断时提示，下一回合自动清除。旧回合旗标没有附赠动作字段时按 `false` 读取，不迁移或直接编辑世界 LevelDB。
- 震愕仍让目标立刻掉落手中物品，针对其进行的攻击检定仍有优势；拿取、拔出或收起物品仍需要动作。若本回合已选择移动或附赠动作，则不能再完成这些物品动作。冻结的「破冰（动作）」在协助者受恍惚或震愕时，也必须遵守同一选择。
- 仅针对本模块带 `flags.fvtt-custom-conditions.condition` 的实例及其复合效果；其他模块的裸 `dazed`、系统原生状态与既有 Actor/Item 内容不改。

## 验证分层

- **PASS — 源码／测试层**：`ConditionRuntime` 的回合旗标加入 `bonusActionUsed`，与 `actionUsed`、`movementUsed` 在同一回合键下共享和合并；动作、附赠动作、自主移动互斥。Shocked 经复合 Dazed 进入相同检查；Shocked 物品动作、Frozen 破冰动作和取消的附赠攻击都有定向回归。精确的 dnd5e 5.3.3 源码表明 `dnd5e.postAttackRollConfiguration` 在弹窗结束后、掷骰求值前可返回 `false` 取消攻击；本轮在此复查已选类别并设临时预留，测试覆盖弹窗期间和配置后的异步等待、不同 Actor 隔离、回合重置。`bun run test:custom-conditions` 88/88、`bun run test:npc` 64/64、`bun run typecheck:foundry-modules` 通过。中英文说明与旧版默认描述的显示兼容也有断言。
- **PASS — 安装层**：精确核对了 30001 的进程、连续 `--dataPath`、`cor-cotn`、Foundry 14.364 / dnd5e 5.3.3；仅将 Custom Conditions 构建产物中变动的 5 个文件同步到其现有安装目录，没有停服、重启、创建备份或直接编辑世界数据。`bun run verify-install:custom-conditions` 通过，安装树 SHA-256 为 `6a2c6c8f44b37c26f78dea24cf5e908dc52ee0df37b9397ef8175af1475724ca`。操作前后文件哈希及进程证据位于 `F:/FoundryLab/foundry-v14/evidence/condition-optimizations-20260924/dazed-three-choice-20260924-105957/`。
- **PASS — CoTN 页面／普通顺序玩法**：新的 GPT-6 Luna 外部 Chrome 任务在同一 30001 `cor-cotn` 世界完整重载后，状态管理器实际显示恍惚、震愕的中文三选一说明；震愕另外显示受攻击优势、掉落手持物品和拿取／拔出／收起需要动作。临时 Actor 的真实 Combat 中，恍惚的「先附赠动作→动作拒绝／自主移动拒绝」「先移动 5 ft→附赠动作拒绝」「先动作→附赠动作拒绝」均通过；震愕的「先动作→附赠动作拒绝」也通过。震愕的 Reaction Attack Activity 到达攻击配置窗口，证明该阶段未被本模块额外拦截。每个拒绝都有页面通知或 Token 位置证据。详细逐项结果见 [Chrome 回传](F:/FoundryLab/foundry-v14/evidence/condition-optimizations-20260924/dazed-three-choice-20260924-105957/chrome/report.md)。
- **PASS — 临时对象清理／服务保持**：Chrome 任务记录并通过 Foundry UI 清理本轮唯一前缀 `CODEX-DAZED-20260924-` 的 Scene、Actor、Token、Combat、嵌入 Item/Activity 及 8 条聊天记录的 exact IDs；最终搜索未见临时 Scene/Actor，测试聊天 DOM 前缀计数为 0。原场景、原 Combat 第 11 轮和暂停状态恢复；30001 仍为 PID 32428、`cor-cotn`，没有停服、切世界或修改模组启用清单。截图原始字节的提取来源与 SHA-256 见 [截图 provenance](F:/FoundryLab/foundry-v14/evidence/condition-optimizations-20260924/dazed-three-choice-20260924-105957/chrome/screenshot-provenance.json)；其中截图取于清理前，最终清理由页面文字与 AX/DOM 记录证明。
- **NOT_EXECUTED — 本轮未覆盖**：Reaction Attack 只进入配置阶段，没有实际掷攻击；MCDM 裸 Dazed 只确认来源身份分立，没有成功启用测试其规则；没有验证地面拾取流程、HUD 悬停浮框、攻击配置后的本地预约实战、跨客户端同 Actor 并发或两个非攻击 Activity 弹窗交错。它们不计入上述普通顺序 PASS。
- **限制 — 并发边界**：临时攻击预留只在发起攻击的浏览器客户端内存中，成功后的回合旗标才写入 Actor 并跨客户端同步；多个客户端几乎同时控制同一 Actor 尚未验证。dnd5e 的两个独立非攻击 Activity 配置弹窗可以在各自的 `preUseActivity` 检查后交错完成，现有公开 Hook 缺少可靠的取消清理点；本轮不把这种并发场景标为通过。普通顺序的动作、附赠动作和移动仍由共享回合旗标拦截。

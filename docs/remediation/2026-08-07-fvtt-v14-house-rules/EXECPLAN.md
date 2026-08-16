# Foundry VTT v14 村规自动化执行总账

> 目标：Foundry VTT `14.364`、dnd5e `5.3.3`。
> 发布单元：`fvtt-injury-fading-spirits` 与 `fvtt-house-rules`，互不依赖。
> 当前主任务：`2026-08-08-sol-implementation`。
> 状态枚举：`planned / in_progress / blocked / done`。

## 接力协议

1. 工作前在对应工作包填写 `Owner / Task ID` 并设为 `in_progress`；同一工作包只能有一个 owner。
2. 只修改“文件所有权”列出的文件。中央文档、根脚本和最终集成只由主 Sol 修改。
3. 机械验证和人工/语义验收分别记录；任一缺失都不能标 `done`。
4. 证据写绝对或仓库相对路径，必须足以复现；测试通过不能代替运行时行为判断。
5. 当前脏工作区是事实来源。不得重置、覆盖、暂存、提交或清理无关改动。
6. 本地 Lab 不是生产。不得连接或修改远程 8080 Foundry。

## 总览

| ID | Status | Owner / Task ID | 内容 | 前置 |
|---|---|---|---|---|
| HR-00 | done | Sol / `2026-08-08-sol-implementation` | 分析报告与本总账 | 无 |
| HR-01 | done | Sol / `2026-08-08-sol-implementation` | 两模块脚手架、安全底座、根集成 | HR-00 |
| IFS-01 | done | Sol / `2026-08-08-sol-implementation` | 伤势状态机 | HR-01 |
| IFS-02 | done | Sol / `2026-08-08-sol-implementation` | Fading Spirits | HR-01、IFS-01 |
| HR-02 | done | Sol / `2026-08-08-sol-implementation` | 药水、生命骰、低属性 | HR-01 |
| HR-03 | done | Sol / `2026-08-08-sol-implementation` | 弹药与隐匿 | HR-01 |
| HR-04 | done | Sol / `2026-08-09-natural20-rolled-maximum` | N1/N20 | HR-01 |
| INT-01 | in_progress | Sol / `2026-08-08-sol-implementation` | 自动测试、构建、根门禁、独立复核 | 所有实现 |
| INT-02 | in_progress | Sol / `2026-08-08-sol-implementation` | 本地真实 Foundry E2E、清理、收口；最新并发认领锁路径尚未重新浏览器回放 | INT-01 |

## HR-00 — 文档与能力矩阵

- Status：`done`
- Owner / Task ID：Sol / `2026-08-09-natural20-rolled-maximum`
- 文件所有权：
  - `docs/fvtt-v14-house-rules-automation-analysis.zh-CN.md`
  - `docs/remediation/2026-08-07-fvtt-v14-house-rules/EXECPLAN.md`
- 前置：无
- 验收项：
  - [x] 两模块边界、原生复用和不开发范围与用户最终决定一致。
  - [x] 删除旧单模块、英雄激励、VSM、强制位移、斜走和休息追踪工作包。
  - [x] 建立跨任务 owner、机械/语义证据和精确剩余工作字段。
  - [x] 实现结束后补最终能力状态、已知限制和真实证据。
- 机械验证：`bun run agents:check` 通过；`bun run typecheck:all` 通过；完整仓库 `test/ci` 的超时与阶段结果记录在本总账和本地 E2E 报告。
- 人工/语义验收：已复读最终分析报告、两个模块 README、设置边界和本地 E2E 报告；不开发范围与用户最终决定一致。
- 证据：`docs/fvtt-v14-house-rules-automation-analysis.zh-CN.md`、`evidence/local-e2e-20260808/LOCAL-E2E-REPORT.zh-CN.md`。
- 精确剩余工作：只剩 INT-01 的根全仓测试/CI 超时定位和 sol_reviewer 只读复核。

## HR-01 — 两模块脚手架与安全底座

- Status：`done`
- Owner / Task ID：Sol / `2026-08-09-natural20-rolled-maximum`
- 文件所有权：
  - `foundry-modules/fvtt-injury-fading-spirits/**`
  - `foundry-modules/fvtt-house-rules/**`（最终由 Sol 集成/复核；任何 worker 回执不替代最终证据）
  - 根 `package.json` 的专属脚本
- 前置：HR-00
- 验收项：
  - [x] 两个 manifest 精确锁定 14.364 / dnd5e 5.3.3，独立启用且无私有互相导入。
  - [x] 每模块具备局部 AGENTS、README、语言、样式、build/test/typecheck 和受保护本地安装器。
  - [x] 修改行为的规则默认关闭，并提供首次 GM 设置入口。
  - [x] 确定性活动 GM 单写、事件幂等、schema 迁移、无 GM 失败关闭。
  - [x] 玩家/socket payload 在 GM 端重新验证。
- 机械验证：两个模块测试/类型检查/构建/产物验证通过；`bun run typecheck:foundry-modules`、`bun run typecheck:all`、`bun run agents:check` 通过。
- 人工/语义验收：本地矩阵验证独立模块、双模块、无 GM、双 GM、MIDI/DAE 和 Tidy 组合；清理与 options 恢复通过。
- 证据：`evidence/local-e2e-20260808/LOCAL-E2E-REPORT.zh-CN.md` 及两个模块目录。
- 精确剩余工作：无模块实现剩余；根仓库测试/CI 超时归 INT-01。

## IFS-01 — 伤势状态机

- Status：`done`
- Owner / Task ID：Sol / `2026-08-08-sol-implementation`
- 文件所有权：`foundry-modules/fvtt-injury-fading-spirits/**`
- 前置：HR-01
- 验收项：
  - [x] 同一倒地 episode 只在首次 0→正 HP 时叠一层；稳定、临时 HP、max HP、导入/重载不误触发。
  - [x] 真实治疗到满或成功短/长休清零；降低 max HP 不清零。
  - [x] 0–2 层写入对应起始死亡失败；3+ 层决定前不写死亡。
  - [x] 最终保留裸骰 19/20 大成功；优势/劣势舍弃骰不算。
  - [x] 复活抑制、linked/unlinked Actor、重复 hook 和 GM 切换幂等。
  - [x] 状态投影删除后可从 flags 重建，GM 可手动修正。
- 机械验证：injury/Fading `41 pass / 0 fail / 106 expect`；模块 typecheck/build/install verify 通过；根 `typecheck:production`、`typecheck:all` 通过。
- 人工/语义验收：单 GM、玩家治疗、双 GM、无 GM、三层分支、死亡豁免和抑制复活回放通过。
- 证据：`evidence/local-e2e-20260808/LOCAL-E2E-REPORT.zh-CN.md`、`foundry-modules/fvtt-injury-fading-spirits/tests/**`。
- 精确剩余工作：无本工作包实现剩余；生产/长期跑团不在本地验收范围。

## IFS-02 — 消逝的灵魂

- Status：`done`
- Owner / Task ID：Sol / `2026-08-08-sol-implementation`
- 文件所有权：`foundry-modules/fvtt-injury-fading-spirits/**`
- 前置：HR-01、IFS-01
- 验收项：
  - [x] Actor flags 独立记录成功次数、永久惩罚、常规锁、最终机会和当前死亡 episode 快速锁。
  - [x] 普通仪式最多三名不同参与者，复用原生 Roll Request，GM 确认结果并支持代投/手填。
  - [x] 普通、快速、奇迹、最终机会、拒绝和重复提交的全部状态转移符合计划。
  - [x] 最终骰为 blindroll；flags、公开消息和审计摘要不含原始值。
  - [x] 成功回归使用伤势抑制并只增加一次历史。
- 机械验证：injury/Fading `41 pass / 0 fail / 106 expect`，其中包含普通/快速/最终机会/拒绝/重复提交、稳定事务 ID、当前死亡消费标记、持久进行中锁和唯一 Foundry 锁 ID，以及快速失败后奇迹阻断、仪式 resolve 后锁清理测试；还包含 Socket 的禁用、非活动发送者、非托管/Compendium/不可写 Actor 和伪造 rest 消息反例。
- 人工/语义验收：原生 Roll Request、GM-only resolve、blind final die、DC 惩罚/锁定、最终机会和抑制恢复均已在双客户端回放；最后新增的服务端唯一 `_id` 认领锁路径没有重新开启浏览器。
- 证据：`evidence/local-e2e-20260808/LOCAL-E2E-REPORT.zh-CN.md`、`foundry-modules/fvtt-injury-fading-spirits/tests/fading.test.ts`。
- 精确剩余工作：模块实现无剩余；最新服务端唯一 `_id` 认领锁的双 GM 真实回放和长期真实跑团未执行。

## HR-02 — 药水、生命骰、低属性

- Status：`done`
- Owner / Task ID：Sol / `2026-08-08-sol-implementation`
- 文件所有权：`foundry-modules/fvtt-house-rules/**`
- 前置：HR-01
- 验收项：
  - [x] 治疗药水三 Activity 可预览、应用和恢复；只最大化治疗骰，固定调整值保留。
  - [x] 第一级不介入；赌博按 Actor+Class+Level 锁定，首次 1 只重投一次并写原生 Advancement。
  - [x] 低属性只在上下文提醒，不修改 Actor、不全世界扫描。
- 机械验证：house rules `23 pass / 0 fail`；typecheck/build/artifact verify 通过。
- 人工/语义验收：三种药水 Activity、生命骰重投/锁、选中 Token 低属性提醒均在真实 v14 回放。
- 证据：`evidence/local-e2e-20260808/LOCAL-E2E-REPORT.zh-CN.md`、`foundry-modules/fvtt-house-rules/tests/house-rules.test.ts`。
- 精确剩余工作：无本工作包实现剩余；根全仓门禁超时归 INT-01。

## HR-03 — 弹药与隐匿

- Status：`done`
- Owner / Task ID：Sol / `2026-08-08-sol-implementation`
- 文件所有权：`foundry-modules/fvtt-house-rules/**`
- 前置：HR-01
- 验收项：
  - [x] 原生消费后只记录射出的单发 `+3→+2→+1→+0`，剩余堆不降级。
  - [x] Actor 持久账本不依赖 Combat；自动删除来源可从攻击消息 snapshot 恢复。
  - [x] 找回只在 GM 确认后发生，连续射击、重复事件与重复找回幂等。
  - [x] 隐匿为显式状态；战斗内三种限速只警告，Dash 破隐，传送/GM 调整可忽略。
- 机械验证：house rules `23 pass / 0 fail`，包含点号 UUID 账本去重、v14 原生消息 ID 回退、消费钩子乱序排队，以及 Activity/Actor/Item/完整 snapshot/autoDestroy 伪造反例测试；typecheck/build/artifact verify 通过。
- 人工/语义验收：原生消费、自动删除 snapshot、战斗删除、重复找回和真实 Token 移动警告均已回放。
- 证据：`evidence/local-e2e-20260808/LOCAL-E2E-REPORT.zh-CN.md`、`foundry-modules/fvtt-house-rules/tests/house-rules.test.ts`。
- 精确剩余工作：无本工作包实现剩余；第三方未知版本仍按失败关闭。

## HR-04 — N1/N20

- Status：`done`
- Owner / Task ID：Sol / `2026-08-08-sol-implementation`
- 文件所有权：`foundry-modules/fvtt-house-rules/**`
- 前置：HR-01
- 验收项：
  - [x] 最终保留自然 1 只生成 GM 后果卡，未确认时零副作用；PC/NPC 同入口。
  - [x] 后果分类、候选目标、反击、半/全伤和累计武器损坏符合规则。
  - [x] N20 保留武器攻击和攻击检定法术的完整原生重击骰池，仅让第一伤害部分首颗真实骰以 `minX` 按满值结算；`1d8`、`2d6`、`msak`、`rsak`、rider、豁免法术与未知结构均有测试。
  - [x] core 与精确 MIDI 14.0.11 适配隔离，未知版本失败关闭。
- 机械验证：原 HR-04 验证已通过；2026-08-09 扩展当前为 house rules `30 pass / 0 fail / 167 expect`，模块 typecheck/build/artifact verify 与根 `typecheck:foundry-modules` 通过。
- 人工/语义验收：原 N1/core 与 MIDI/DAE 回放已完成；新增 `minX` 武器与攻击法术路径在真实 Foundry 14.364 / dnd5e 5.3.3 Roll/Hook 中通过，独立 `sol_reviewer` 只读复核为 PASS。
- 证据：`evidence/local-e2e-20260808/LOCAL-E2E-REPORT.zh-CN.md`、`evidence/local-e2e-20260809-natural20/LOCAL-E2E-REPORT.zh-CN.md`、`foundry-modules/fvtt-house-rules/tests/house-rules.test.ts`、`foundry-modules/fvtt-house-rules/tests/natural-twenty-runtime.test.ts`。
- 精确剩余工作：本工作包无实现剩余；MIDI 只承诺精确锁定版本，生产与长期跑团仍是外部验收。

## INT-01 — 自动验证与只读复核

- Status：`in_progress`
- Owner / Task ID：Sol / `2026-08-08-sol-implementation`
- 文件所有权：两个模块、根 `package.json`、本总账证据段；reviewer 只读。
- 前置：所有实现工作包
- 验收项：
  - [x] 两模块各自 `test / build / typecheck`。
  - [x] ZIP/manifest/package 版本和内容一致。
  - [x] `bun run typecheck:foundry-modules`。
  - [x] `bun run agents:check`。
  - [ ] `bun run test`（15 分钟超时，未通过）。
  - [ ] `bun run ci:verify`（覆盖率 CLI 子阶段超过 15 分钟，未完整通过）。
  - [ ] `sol_reviewer` 只读复核为 PASS；所有 REVISE/BLOCKED 已解决。
- 机械验证：模块级与根类型/架构阶段通过；根 `test` 和 `ci:verify` 的超时证据见报告，不能标记为完全通过。
- 人工/语义验收：模块真实行为由 INT-02 通过；仓库级门禁尚未闭合。
- 证据：`evidence/local-e2e-20260808/LOCAL-E2E-REPORT.zh-CN.md`。
- 精确剩余工作：定位全仓 `bun test` 与 coverage CLI plaintext 子进程的超时；运行只读 `sol_reviewer` 并处理其意见。

## INT-02 — 本地 Foundry 真实 E2E 与收口

- Status：`in_progress`
- Owner / Task ID：Sol / `2026-08-08-sol-implementation`
- 文件所有权：本地 `F:\FoundryLab\foundry-v14` 矩阵世界的本轮临时对象与 evidence；README/总账。
- 前置：INT-01
- 验收项：
  - [x] 开始前确认 server-mirror PID、目录归属和当前 `game.modules`；占用时停止协调。
  - [x] 仅 IFS、仅 HR、两者、两者+MIDI/DAE 四个启用矩阵。
  - [x] 原生/Tidy Sheet；单 GM+玩家、双 GM、无 GM、GM 恢复/切换。
  - [x] 逐项人工检查 flags、状态、死亡失败、blind 隐私、库存、Activity、Token 和控制台。
  - [x] 清除本轮 Actor/Item/Token/Combat/Message/用户，恢复模块启用、默认世界/options，停止 Foundry并释放端口。
  - [x] 分开报告机械、本地语义、未执行生产和真实跑团长期验收。
- 机械验证：Foundry Lab 已停止；options 与备份 SHA-256 完全一致；无 Lab 进程。
- 人工/语义验收：本地真实双客户端回放和 Tidy/MIDI 复测通过；具体场景见 E2E 报告。
- 证据：`evidence/local-e2e-20260808/LOCAL-E2E-REPORT.zh-CN.md`、`evidence/local-e2e-20260808/options.before.json`。
- 精确剩余工作：无本地 E2E 清理剩余；生产和长期跑团不执行于本工作包。

## 进度日志（只追加）

### 2026-08-08 — Sol 开始实施

- 已确认根和 `foundry-modules/AGENTS.md` 生效；工作区已有大量无关脏改动，全部保留。
- 已把旧的单模块计划替换为用户批准的两模块计划，并移除不开发功能。
- 已认领 HR-00、HR-01、IFS-01、IFS-02；HR-02/03/04 预留给具名 Terra worker。
- 尚未连接生产、尚未修改本地 Lab。

### 2026-08-08 — Terra 接管

- 首个 Terra `019fdd3f-a6e5-7441-8872-2cb4232547cb` 在写入大部分 `fvtt-house-rules` 后因代理用量限制异常退出，未提供最终验收回执。
- 缩小后的接管任务由 Terra `019fdf73-dc95-7681-84be-32ba8ab86bfb` 认领，只允许完成该模块并运行模块内门禁。

### 2026-08-08 — Sol 本地 E2E 与收口

- 两个模块已完成实现；模块级单测、类型检查、构建和产物验证通过。当前 house rules 为 `23 pass / 0 fail / 109 expect`，injury/Fading 为 `41 pass / 0 fail / 106 expect`。
- 本地 Foundry `14.364` / dnd5e `5.3.3` 矩阵已完成 injury-only、house-only、双模块、MIDI-QOL `14.0.11` + DAE `14.0.12`、原生 sheet、Tidy 5e Sheets `13.5.0`、单 GM/玩家、双 GM、无 GM和 GM 恢复路径；结果见 `evidence/local-e2e-20260808/LOCAL-E2E-REPORT.zh-CN.md`。
- 发现并修复两个根门禁问题：Foundry v14 live damage config 的非可克隆对象处理，以及严格 `noUncheckedIndexedAccess` 下源码/测试索引收窄。修复后 `typecheck:production`、`typecheck:all` 和 `typecheck:foundry-modules` 通过。
- `bun run test` 在 15 分钟内未结束；`bun run ci:verify` 在覆盖率 CLI plaintext 子进程阶段也在 15 分钟内未结束。两次超时均只停止精确测试/CI 进程树，未停止其他 Node、未修改生产环境；因此 INT-01 保持 `in_progress`。
- 上一轮清理记录在追加复测前被发现不完整：矩阵中残留了含无效 `hrPotionQuick` Activity ID 的旧临时 Actor。Sol 以 core-only 公共 API 清除明确残留后重新安装模块；追加复测的临时 Actor 和 10 条关联消息已清理，最终 Actor/Message 基线和 options SHA-256 已核对，Lab 已停止、端口释放。
- 本轮未安装/修改生产 8080，未宣称真实跑团长期验收。

### 2026-08-08 — 委派与只读复核状态

- Terra/Luna 实现 worker 的本轮可观察运行时回执不可用，不能以请求角色冒充实际模型或完成证明；最终由 Sol 集成、复测和语义验收。最终汇报标记 `EXPECTED_DELEGATION_NOT_OBSERVED`。
- E2E 明确由 Sol 全程执行，符合用户要求；未将 Foundry 浏览器操作委派给 worker。
- `sol_reviewer` 待本轮最终代码、文档和证据稳定后启动，权限范围为只读代码/测试/文档复核，不允许写入或运行生产操作。

### 2026-08-08 — Sol 修复 v14 原生弹药时序并追加 E2E

- 首次只读复核指出弹药提交必须绑定真实 dnd5e 攻击消息、不能信任客户端事件 ID；同时指出 runtime/socket 路径需要 fixture 覆盖。Sol 已补充精确 ChatMessage/Actor/Activity 校验、发送者校验、删除快照回退、v14 `Roll.id` 缺失时的消息 ID回退，以及消费前同步快照和 post-hook 乱序提交队列。
- 模块门禁更新为 house rules `22 pass / 0 fail / 104 expect`、injury/Fading `31 pass / 0 fail / 75 expect`；house/injury build、artifact/install verify、两个模块类型检查和根类型检查通过。
- 本地真实 v14 追加复测由 Sol 直接执行：非销毁弹药实际消费 `2→1` 并写入一发 `+3→+2`；带原生 `roll.ammunitionData` 关联的自动销毁攻击删除弹药并只写入一发 `+3→+2`；浏览器未观察到模块运行时 error，唯一 error 为视口低于 Foundry 建议尺寸。
- 追加复测后关闭全部 house-rules 功能开关，删除 `[E2E] Ammo Security Retest` Actor 及其 10 条消息；最终世界核对为 8 Actor、56 ChatMessage、仅 Gamemaster 用户。options 恢复为备份 SHA-256 `49F52FD27AD44CDFB2FAC141A753ABE7F02BFF363AFB5814A270813769F9DD15`。
- 精确剩余工作：启动最终只读 `sol_reviewer`，处理其意见；根 `bun run test`/`bun run ci:verify` 超时保持未通过，不得改写为 PASS。

### 2026-08-08 — Sol 处理最终复核意见

- 最终复核指出的弹药 P0 已修复：GM 侧现在要求 ChatMessage 的原生攻击标记、关联 Activity、关联 Item、Actor、弹药 ID 和完整 snapshot facts 一致；`autoDestroy` 只来自 GM 侧 Item 或 dnd5e 原生 `ammunitionData`，并新增篡改 Activity/Item/snapshot/autoDestroy 负例。
- 最终复核指出的 Injury Socket P1 已修复：入口重新验证版本、enabled、活动发送者、受管理且可写的世界 Actor；rest 只接受顶层 `type: "rest"`、rest 类型、speaker 和 dnd5e `getAssociatedActor()` 同时匹配的消息，并新增禁用/非活动/非托管/Compendium/不可写/伪造 rest/setInjury 测试。
- 修复后门禁为 house `23/23`、injury/Fading `40/40`，两个模块 typecheck/build/install verify 通过；当前浏览器 E2E 不重开，严格 fail-closed 补丁由模块测试覆盖，既有本地 happy-path E2E 证据仍保留并单独标明时间边界。
- 精确剩余工作：运行新的 `sol_reviewer` 只读复核；根 `bun run test`/`bun run ci:verify` 的历史超时仍保持未通过，不能将 INT-01 标记完成。

### 2026-08-08 — Sol 处理第二轮只读复核的 P0/P1
- Status：in_progress
- Owner / Task ID：Sol / `2026-08-08-sol-final-hardening`
- 修改文件：`foundry-modules/fvtt-house-rules/src/runtime.ts`、`foundry-modules/fvtt-house-rules/tests/house-rules.test.ts`、`foundry-modules/fvtt-injury-fading-spirits/src/{state,fading,injury,ui}.ts`、对应测试/语言/分析报告
- 机械验证：house rules `23 pass / 0 fail / 109 expect`；injury/Fading `40 pass / 0 fail / 105 expect`；两个模块 typecheck 通过。弹药 GM 侧原生攻击消息观察现在提供消费前数量与完整快照，客户端数量只能匹配而不能决定事实；Fading 的 normal/rapid/miracle 事务 ID 绑定 Actor+死亡 episode+模式+持久序号，并在投 blind die 前先创建服务端唯一 `_id` 的 GM whisper 锁消息，再写入带非事务 lock token 的 Actor 进行中锁，回读 token 后才继续。
- 人工/语义验收：独立数量伪造反例被拒绝；同一死亡 episode 的成功回归被消费标记拒绝；持久锁阻止不同事务并发 resolve，快速失败阻止奇迹重试而保留长仪式入口。浏览器不重开，沿用已完成并清理的本地 happy-path E2E；本轮改动由模块测试覆盖。
- 证据：`foundry-modules/fvtt-house-rules/tests/house-rules.test.ts`、`foundry-modules/fvtt-injury-fading-spirits/tests/fading.test.ts`、`evidence/local-e2e-20260808/LOCAL-E2E-REPORT.zh-CN.md`
- 精确剩余工作：重新 build/install 两个模块，运行根级类型/架构/agents 门禁；启动新的 `sol_reviewer` 只读复核；根 `bun run test` 与 `bun run ci:verify` 历史超时仍不能写成 PASS。

### 2026-08-08 — Sol 处理最终 reviewer 的原子认领意见
- Status：in_progress
- Owner / Task ID：Sol / `2026-08-08-sol-atomic-resolution-claim`
- 修改文件：`foundry-modules/fvtt-injury-fading-spirits/src/ui.ts`、对应状态/测试/分析报告/证据
- 只读复核结论：最终 `sol_reviewer` Godel 返回 `REVISE`，指出 Actor flags 的读—写—回读不是跨客户端 compare-and-set，不能单独证明同一复活 attempt 只有一个 blind resolve。
- 修复：normal/final/rapid/miracle 现在在 Actor flags 之前申请一个由 Foundry 服务端唯一 `_id` 约束的 GM whisper ChatMessage 锁；重复 `_id` 创建失败即放弃，不写 Actor。活动 GM 内部再用按 Actor+attempt 串行的 claim queue，Actor 回读和 token 校验作为第二层；异常/失权会释放或留给不活跃 owner 接管。
- 机械验证：injury/Fading `41 pass / 0 fail / 106 expect`；build、typecheck、根 `typecheck:production`、`typecheck:all`、`typecheck:foundry-modules`、`agents:check`、`architecture:verify` 通过；锁 ID 的确定性、Foundry 16 字符 ID 格式和仪式 resolve 后清理有单测。
- 人工/语义验收：源码已覆盖服务端唯一锁失败时 fail-closed、成功写入后清理、异常/失权不猜测状态；尚未重新开启浏览器，不能把新增 ChatMessage 唯一锁路径写成新的浏览器 E2E 通过。
- 精确剩余工作：重新 build/install 当前最新 injury 产物，并由新的只读 `sol_reviewer` 复核；根 `bun run test`/`ci:verify` 历史超时仍未闭合，生产与长期跑团仍未执行。

### 2026-08-08 — Sol 收尾检查：最新认领锁仍需真实回放
- Status：`in_progress`
- Owner / Task ID：Sol / `2026-08-08-sol-final-e2e-boundary`
- 修改文件：`foundry-modules/fvtt-injury-fading-spirits/src/ui.ts`、`docs/remediation/2026-08-07-fvtt-v14-house-rules/evidence/local-e2e-20260808/LOCAL-E2E-REPORT.zh-CN.md`、本总账
- 机械验证：锁实现改为从 `globalThis.ChatMessage` 取得创建器，并修复仪式 resolve 后 pending 清除导致的锁消息遗留；模块测试 `house 23/109`、`injury/Fading 41/106`、模块 build/typecheck、根类型/架构/agents 门禁均通过。
- 人工/语义验收：Hegel 只读复核在限定等待和中断后未返回 PASS/REVISE，已关闭并记为无结论；新增 Foundry 唯一 `_id` ChatMessage 锁路径没有重新开启浏览器，因此不能写成最新浏览器 E2E 通过。
- 精确剩余工作：重新开启本地矩阵后重放最新 normal/final/rapid/miracle 双 GM 认领路径；解决根 `bun run test` 与 `bun run ci:verify` 超时；随后才可重新判断 INT-01/INT-02 是否 done。

### 2026-08-08 — Sol 修复仪式锁清理并重新安装
- Status：`in_progress`
- Owner / Task ID：Sol / `2026-08-08-sol-final-e2e-boundary`
- 修改文件：`foundry-modules/fvtt-injury-fading-spirits/src/ui.ts`、`foundry-modules/fvtt-injury-fading-spirits/tests/fading.test.ts`、本总账与本地 E2E 报告
- 机械验证：injury/Fading `41 pass / 0 fail / 106 expect`；build、typecheck、Lab install/verify-install 通过，最新安装 hash 为 `3e9765bc4c079394d76c8816a05c395c37ce0f5ee472ed44d79967d7fa3c7d40`；根 `typecheck:foundry-modules`、`typecheck:production`、`typecheck:all`、`agents:check`、`architecture:verify`、`git diff --check` 通过；`bun run test:cli` 为 `17 pass / 0 fail / 89 expect`。
- 人工/语义验收：修复普通/最终仪式 resolve 清除 `pendingRitual` 后未释放唯一锁消息的缺陷，并加入回归测试；Lab 未启动，最新锁路径仍未浏览器重放。
- 精确剩余工作：最新 Franklin 只读 reviewer 在中断后仍无结论，不能算 PASS；重新开启本地矩阵重放最新双 GM 锁竞争；根 `bun run test` 与 `bun run ci:verify` 全量超时仍未闭合；生产和真实长期跑团未执行。

### 2026-08-09 — Sol 修复模块本地化并更新本地矩阵
- Status：`done`
- Owner / Task ID：Sol / `2026-08-09-localization-follow-up`
- 修改文件：两个模块的 `src/lang/en.json`、`src/lang/zh-CN.json`、`src/ui.ts`/`src/runtime.ts`、manifest、README 与本地化回归测试；分析报告同步补充语言边界。
- 机械验证：伤势/消逝的灵魂 `42 pass / 0 fail / 276 expect`；村规 `25 pass / 0 fail / 111 expect`；两个模块 typecheck/build、村规 artifact verify、语言 key 集合一致性与 dotted-key 前缀冲突检查均通过。新包已安装到精确本地 `F:\FoundryLab\foundry-v14\data\server-mirror`，旧模块保存在 `evidence/manual-verification/module-backup-20260809-180200-prefix-fix`；Foundry HTTP `200`，矩阵世界页面可访问。
- 人工/语义验收：在真实 Foundry v14.364 矩阵世界中确认核心“语言”下拉框选中“中文”，实际对应 Foundry 中文包 locale `cn`；重启客户端后，伤势与消逝的灵魂设置页显示中文设置名/提示，村规设置页的开关、阈值、倍率与提示全部显示中文。浏览器控制台只观察到两个模块加载 `lang/zh-CN.json` 的成功记录，没有 `Cannot create property` 或 localization parse error。根因是两个 manifest 未声明 `cn`，以及伤势语言包 `IFS.Fading.Result` 与 `IFS.Fading.Result.*` 的 dotted-key 前缀冲突；两处均已修复。
- 证据：两个模块 README 的语言说明、`docs/fvtt-v14-house-rules-automation-analysis.zh-CN.md`、模块 `tests/*localization*`/`tests/build.test.ts`、构建包、本地模块备份目录与本轮浏览器现场。
- 风险/未运行：模块分类标题仍使用中英双语 manifest 标题，这是为了同时适配中英文世界，不代表设置内容未翻译；已经存在的旧 ChatMessage 不会被回写翻译，新建卡片会使用当前语言。没有执行生产安装或真实跑团长期验收；根 `bun run test`/`bun run ci:verify` 历史超时仍未闭合。
- 精确剩余工作：本地化问题已无待办；若继续执行总计划，剩余仍是 INT-01 的根级测试/CI 超时定位、完整功能矩阵的长期真实跑团验收，以及生产部署（本轮不执行）。

### 2026-08-09 — 自然 20 真实投骰取满扩展

- Status：`done`
- Owner / Task ID：Sol / `2026-08-09-natural20-rolled-maximum`
- 用户锁定语义：武器攻击和进行攻击检定的法术均适用；仍由 dnd5e 投出全部重击骰，第一伤害部分的第一颗骰保留原始骰面但以 Foundry `minX` 按满值结算；其他骰和其他伤害部分保持原生重击。豁免类法术不触发。
- 文件所有权：Terra 只修改 `src/core/natural-roll.ts` 与 `tests/house-rules.test.ts`；Sol 修改 runtime、语言、README、中央文档、构建/安装和 E2E 证据。
- 机械验证：纯 split、post-configuration runtime 与 fail-closed fixtures 已完成；house rules `30 pass / 0 fail / 167 expect`，模块 typecheck/build/artifact verify 与根 `typecheck:foundry-modules` 通过。
- 人工/语义验收：真实 Foundry 14.364 / dnd5e 5.3.3 中，武器 `1d8` 路径观察到 `1d8min8 + 1d8 + 3`、首颗原始 5/计入 8；攻击法术 `2d6` 路径观察到 `1d6min6 + 3d6`、首颗原始 1/计入 6。两者独立 rider 均保持原生重击且无 `minX`。
- 证据：`docs/remediation/2026-08-07-fvtt-v14-house-rules/evidence/local-e2e-20260809-natural20/LOCAL-E2E-REPORT.zh-CN.md`。
- 只读复核：第二次收敛后的 `sol_reviewer` 在限定 5 文件/8 次只读命令内给出 PASS；确认 hook 时序、目标 roll 选择、term 原子替换、raw/count 语义、rider 保留和证据边界。第一次 reviewer 因未在有界等待内返回而关闭，未作为验收证据。
- 风险/未运行：本轮真实运行通过临时宏在真实 DamageRoll/Die/已注册 Hook 中强制回放，没有逐一点击所有角色卡或第三方 Activity；未知结构仍失败关闭。生产和长期跑团不在本轮范围；根测试/CI 旧超时仍未关闭。
- 精确剩余工作：实现与本地锁定版本验收无剩余。

### 2026-08-09 — 后续真实测试世界分工调整

- Status：`done`
- Owner / Task ID：Sol / `2026-08-09-server-mirror-world-policy`
- 用户锁定语义：`server-mirror` 是 Foundry 数据目录，不是单个世界。今后需要现成角色卡、场景、物品和合集的手动验收/玩法语义 E2E 默认进入其中的持久世界 `cor-cotn`（“溟渊的呼唤”）；`fvtt-v14-module-matrix` 只保留给干净隔离、模块启用组合、迁移/恢复、故障注入或其他可能污染世界的测试。
- 机械验证：确认 `server-mirror/Data/worlds` 同时存在 `cor-cotn` 与 `fvtt-v14-module-matrix`，两者均锁定 Foundry 14.364 / dnd5e 5.3.3；根与 Foundry Ops 指令已同步该分工，并由 `bun run agents:check` 校验生成副本一致性。
- 人工/语义验收：`cor-cotn` 含大量现成场景、物品、日志和合集资源，适合用户直接切场景并复用既有角色；矩阵世界保持低内容、可丢弃的隔离定位。过去已经在矩阵世界完成的 E2E 证据保持原样，不追溯改写。
- 风险/未运行：本条只调整后续验收入口，不代表已经在 `cor-cotn` 重新跑过两个模块的全部功能。使用既有持久角色测试时必须记录并恢复 HP、flags、物品/弹药和 Active Effect 等改动；临时对象必须可追踪并清理。
- 精确剩余工作：下一轮用户手动验收或真实玩法 E2E 启动前，将当前默认世界从矩阵切换为 `cor-cotn`，并先确认 `server-mirror` 未被其他任务占用。

### 2026-08-09 — 安装并启用到 `cor-cotn`

- Status：`done`
- Owner / Task ID：Sol / `2026-08-09-install-enable-cor-cotn`
- 用户授权范围：只把两个模块的当前构建安装到本地 `server-mirror`，切换并启动 `cor-cotn`，在该世界的“管理模组”中勾选；不做功能语义验收，不连接生产 8080。
- 机械验证：两个模块 build/typecheck 通过；村规 artifact verify 通过；安装后 `verify-install:injury-fading-spirits` 与 `verify-install:house-rules` 通过。伤势模块安装 hash 为 `916d031190abf773f5921cecac3d88a78a186951b40d7c5ca8f32c69972c5abb`。旧模块目录和切换前 `options.json` 均已保存在 F 盘 Lab 的 `backups` 下。
- 运行状态：`server-mirror` 已以世界 `cor-cotn`（“溟渊的呼唤”）在 `127.0.0.1:30001` 启动。Foundry 管理模组页中 `fvtt-house-rules` 与 `fvtt-injury-fading-spirits` 均为 checked，已启用模组计数由 70 增至 72；伤势模块首次启动主开关已选择“启用”。村规模块各条具体规则仍保持默认关闭，等 GM 按需配置。
- 人工/语义验收：按用户要求未执行规则触发、角色卡、伤势层数、复活仪式或 N1/N20 等功能验收；本条只能证明安装、世界切换、模块激活和首次主开关状态。
- 精确剩余工作：由用户在当前本地页面自行查看与手动验证；生产部署和真实跑团验收仍未执行。

### 2026-08-09 — 伤势三层上限与 Token HUD 状态

- Status：`done`
- Owner / Task ID：Sol / `2026-08-09-injury-cap-token-hud`
- 修改文件：`foundry-modules/fvtt-injury-fading-spirits/src/{constants,state,injury,projection,runtime,ui}.ts`、`src/icons/*.svg`、语言包、测试、构建与 README；追加验收报告和本总账。
- 用户锁定语义：伤势最多 3 层；Token 左上显示带层数的伤势图标；Token 状态列表存在并高亮“伤势”；左键逐层增加且在 3 停止，右键逐层减少。
- 机械验证：模块 `52 pass / 0 fail / 328 expect`、module typecheck/build、根 `typecheck:foundry-modules`、`agents:check`、`git diff --check` 通过。最终本地安装 hash 为 `dc2f85902627bba73c6fa1ba924caa9971b12d71f6b9dea4813ce1e95a615c91`，HTTP 200。
- 人工/语义验收：真实 Foundry 14.364 / dnd5e 5.3.3 `cor-cotn` 中，真实 HP 四次倒地恢复得到 `[1,2,3,3]`；状态列表显示中文“伤势”，左键得到 `0→1→2→3→3` 且始终一个投影；旧 4 层被活动 GM 写回 3。首次右键回放遗漏核心 `auxclick`，只读复核判为 REVISE；修复后以完整 `contextmenu + auxclick` 重跑，0 层保持 0/effect 0，3 层降到 2/effect 1，两个事件均被取消。
- 证据：`docs/remediation/2026-08-07-fvtt-v14-house-rules/evidence/local-e2e-20260809-injury-hud/LOCAL-E2E-REPORT.zh-CN.md`。
- 清理：两轮临时 Actor/Token 均已删除并核对不存在；未连接生产 8080。`server-mirror` 保持运行，供用户继续手动查看。
- 只读复核：首轮 `sol_reviewer` 发现 P1（遗漏 Foundry 核心 `auxclick`）并判定 REVISE；修复和补测后，同一 reviewer 的限定收敛复查为 PASS，无 P0/P1，原 P2 覆盖缺口已补齐。可观察角色为 `sol_reviewer`；额外模型/推理元数据为 `OBSERVED_METADATA_UNAVAILABLE`。
- 风险/未运行：本轮没有重跑完整双 GM、玩家客户端或长期跑团矩阵；根 `bun run test`/`ci:verify` 的既有超时仍未关闭。
- 精确剩余工作：本次两项缺陷无实现剩余；用户可在当前运行的 `server-mirror/cor-cotn` 手动查看。生产部署与长期跑团仍是外部验收。

### 2026-08-16 — 重击首骰最大化改为任意重击触发

- Status：`done`
- Owner / Task ID：Sol / `2026-08-16-critical-first-die-any-crit`
- 用户锁定语义：不要求攻击骰为自然 20；只要 dnd5e 将武器攻击或攻击检定法术的伤害 Roll 标记为重击（包括手动点重击），仍保留完整原生重击骰池，并将第一伤害部分的首颗真实骰按 `minX` 计为满值。普通非暴击、豁免类法术、非唯一基础伤害和未知骰结构继续失败关闭。
- 修改文件：`foundry-modules/fvtt-house-rules/src/runtime.ts`、模块测试、模块语言包与 README、`docs/fvtt-v14-house-rules-automation-analysis.zh-CN.md`。
- 机械验证：模块 `37 pass / 0 fail / 207 expect`；模块 typecheck、根 `typecheck:foundry-modules`、build、artifact verify、`agents:check` 和 `git diff --check` 通过。
- 人工/语义验收：已在本地 `server-mirror/cor-cotn`（Foundry `14.364` / dnd5e `5.3.3`）通过真实运行时 Hook E2E 验收。模拟攻击骰为 `19`、伤害 Roll 明确为 critical 时，实际公式为 `1d6min6 + 1d6`，并设置 `criticalFirstDieApplied=true`；同样模拟攻击骰为 `19` 但非暴击时，公式保持 `1d6` 且无该标记。测试创建的临时宏、7 条标记聊天消息和活动场景均已清理，`server-mirror` 已停止。
- 风险/未运行：现有设置键仍保留为 `featureNaturalTwenty` 以兼容已有世界，但界面语义已改为“重击首颗伤害骰按满值结算”；自然 20 GM 提示卡仍只由自然 20 生成。上述验收覆盖真实模块加载和 dnd5e Hook/骰子行为，不等同于完整角色卡按钮、双 GM、玩家客户端、生产安装或长期跑团验收；这些仍未执行。生产安装和生产写入未执行。
- 精确剩余工作：本代码变更及本地 Hook E2E 没有待实现项；若要扩大验收范围，剩余是完整角色卡交互、双客户端/长期跑团和生产接受。

## 任务停止/交接模板

```markdown
### YYYY-MM-DD HH:mm — 工作包 / Task ID

- Status：planned | in_progress | blocked | done
- Owner / Task ID：
- 修改文件：
- 机械验证：命令、结果、证据
- 人工/语义验收：场景、观察、结论
- 风险/未运行：
- 精确剩余工作：
- 无关脏改动：已保留；未暂存、未提交、未覆盖
```

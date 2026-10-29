# Monster Spell Resolver / 怪物法术解析器规则

## 这个功能是做什么的

本 Foundry 模块读取生成 Actor 携带的可移植法术清单（manifest），并把明确归本模块所有的内嵌法术（Spell）与施法活动（Activity）解析到目标世界已启用的法术资料包（Item compendium）。它不会全世界扫描并按名称替换法术。

## 目标世界硬门禁

- 只有携带有效 resolver manifest 的 Actor 才有资格处理。
- 只允许修改模块拥有的 embedded Spells，以及明确链接到生成 feature 的模块拥有 Cast Activities。
- 不得修改 compendium、patch Foundry/dnd5e prototype、按名称删除文档或运行自动全世界迁移。
- 实际解析写入（hydration）必须按 Actor 全有或全无；中途失败要通过补偿回滚恢复操作前状态。
- 遇到人工修改只能选择 Keep、Overwrite 或 Cancel；关闭 review 窗口等同 Cancel。
- manifest 不得携带目标世界专属 ID；契约变化同步读取 `packages/spell-manifest-contracts/AGENTS.md`。
- 本模块是目标世界 hydration owner：它从 portable `pending` manifest 选择目标世界法术并原子地写入 owned 缓存 Spell/Cast Activity；不得反向修改生成阶段的 manifest，或把静态契约合法误报为 hydration/runtime 成功。

## 构建、安装与运行时

- 本目录是唯一功能 owner：浏览器源码和 manifest 位于 `src/`，构建位于 `build.ts`，本地 Lab 安装与一次性世界准备位于 `lab.ts`、`labCli.ts` 和 `labConfig.ts`。旧 `src/foundry/monster-spell-resolver`、`scripts/buildSpellResolver.ts` 与 `scripts/foundry-lab/spellResolver*.ts` 不得恢复为实现或兼容副本。
- 本地构建、安装与短时 runtime 目标是 `F:\FoundryLab\foundry-v14` 的 v14 集成测试环境；生产只指远程服务器 8080 Foundry。生产只读核对可在目标明确、带 `--apply` 与 `--allow-production-read`、并通过外部配置 guard 时自主执行；生产安装、hydration 和其他写入仍须再次明确授权。
- 本地 Lab 安装与短时测试可在完成 PID、端口、路径和运行者预检，且确认 mirror 未被他人占用后自主执行；若被占用则等待协调或释放，不得自行停止、复用或替换该环境。
- 本地事务测试只能使用停止状态的一次性测试世界，保留 hash、锁和清理证据，遵守根级无备份规则；事务的运行时补偿契约仍须验证。会故意损坏、删除、链接、锁定或替换路径的 fixture 必须使用随机临时根；只能从 F 盘只读加载匹配 14.364 的 `classic-level`。
- Foundry/dnd5e hook、Activity 和 Item 结构必须对照锁定版本资料，不得凭最新版或记忆实现。
- 历史ServerNext14.368/6.0.2的0.1.6 Rat Warlock水合/指定Cast有接受，但Undo/补偿失败；0.1.7任务怪物十法术水合、普通UI Undo到pending/0缓存和重载通过。故意失败补偿只有离线证据。14.368/6.0.5另于2026-10-01通过十法术自动水合、Undo、重载和精确清理，未扩大Review/Apply及完整Cast矩阵。当前适配保留14.364/5.3.3、14.368/5.3.3、14.368/6.0.2与6.0.5，新增精确14.368/6.0.6静态候选；606已接受限定Rat NPC十法术水合/精确Cast引用、一次Misty Step资源消耗、Undo/重载与清理；全库、纯Core、真实传送和其他Activity仍待验，verified保持旧5.3.3，交叉/未来版本拒绝。Mirror专用安装器不能直接用于Next。
- 请求Compendium索引前按pack.indexFields去除默认父字段覆盖的子字段，getIndex会合并默认与请求。6.0.2默认system.source，5.3.3不默认；固定6.0.5/6.0.6源码未改变此契约。各目标均保留准确rules/book及fail-closed规则判断。
- View Report 的顶层状态必须由当前运行时、manifest 和严格管理文档决定，不得仅因持久化 `hydrated` 就宣告当前水合；历史提交报告需与当前 manifest 哈希及完整唯一逻辑引用集合绑定后才可显示，且与无决策预检分区。DialogV2 的 Apply 回调须再次读取当前表单值。

## 验证

- 按本次变化选择现有检查；需要对应逻辑／构建验证时使用 `bun run test:spell-resolver`、`bun run build:spell-resolver`。manifest 契约或producer变化再补受影响 contract／generator 检查，相关输入未变的有效结果继续复用。
- hydration 运行时变化在本地 mirror 窄验受影响路径：资格、owned 文档、成功写入、失败补偿或 Keep／Overwrite／Cancel／关闭即取消，依具体改动选取。纯说明／指令修改只核文义、引用、作用域及生成一致性。
- native Cast 是独立证据层，验证本模块负责的来源、缓存、参数交接、资源消费／持久化及自有适配；hydration成功不替代这些真实使用证据。攻击、豁免、目标限制、禁用后缓存可用性按受影响行为或已知故障选择，不在每次续接重新执行完整矩阵。
- 原生交接已证明后，系统／第三方法术的通用召唤、移动、攻击、专注及到期不自动成为本模块待办。我方改动了相应缓存／效果投影、出现实际异常或用户明确另设目标时，仍验证对应后果。例如修改Geas条件伤害拆分须查实际施法与独立GM入口；仅链接灵体武器不顺带要求全部生命周期验收。
- 复用根约定及[现有检查选择](../../docs/runbooks/development-feedback-loop.md#本批先选范围再运行前置检查)，在已有记录说明缺口和最小检查；先核fixture身份／版本／可见性及正常提交，再区分前置、工具、产品失败。所选证据充分即停止，本地runtime与生产接受分别报告；未验限制不伪称通过，也不自动阻挡独立工作。

## 完成标准

- 只触及明确 owned 文档，失败后 Actor 恢复到操作前状态。
- manifest producer、contract、resolver 和目标版本结构一致。
- portable/static manifest、目标世界 hydration、native Cast runtime 是三个不同层级。单测/build 通过不等于 hydration；hydration 成功也不等于原生施法或生产接受已验收。

## Mirror Core patch continuation (2026-10-03)

The user authorized Mirror Foundry `14.368` with dnd5e `5.3.3`. Runtime gates now include this exact pair while preserving the previous supported pairs; this does not accept other Core/system combinations. Record actual new-Core behavior separately from legacy tests and historical Next evidence. Current maintenance and acceptance: [Mirror patch review](../../docs/reviews/2026-10-03-foundry-14-365-mirror-upgrade-and-tile-arsenal.md). The new pair overrides older exact-364-only wording for this scoped continuation; existing authority and data protections remain applicable.

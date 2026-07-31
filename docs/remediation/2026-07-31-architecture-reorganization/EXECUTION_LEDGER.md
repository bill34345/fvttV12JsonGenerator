# Architecture Reorganization Execution Ledger

- 状态：in_progress
- 开始日期：2026-07-31
- 执行分支：`codex/architecture-reorganization-20260731`
- 基线提交：`64ad9b79c71fdc38d1113e5983dc2394680c4ab9`
- 执行方案：`docs/plans/2026-07-31-project-classification-and-architecture-reorganization.md`
- 原 hardening 权威账本：`docs/remediation/2026-07-15-project-hardening/EXECPLAN.md`
- 当前支持边界：`docs/acceptance/current-support-matrix.md`

## 权威边界

本文件只管理 2026-07-31 开始的架构重整进度、决策、证据和停止点。它不复制或重写原 hardening
finding 的历史与验收状态。原 finding 的状态仍以 2026-07-15 ExecPlan 为准；本文件只记录其未来
owner 和迁移约束。

## 完成规则

- 机械验证与语义验收必须分别记录；
- 目录移动不能被当作功能完成；
- 结构重构不得顺便改变 actor/item mechanics；
- support matrix 不因 package 或仓库变化自动升级；
- 每个停止点必须记录实际完成、未完成、风险和下一条命令；
- 用户已有脏工作树内容不得被覆盖或误提交。

## 已批准决策

| 决策 | 状态 | ADR |
|---|---|---|
| 模块化单体优先，稳定后拆仓 | accepted | `docs/decisions/0001-modular-monolith-before-repository-splits.md` |
| Foundry Ops 最终独立为 `fvtt-foundry-ops` | accepted | `docs/decisions/0002-foundry-operations-product-boundary.md` |
| Foundry modules 按独立发布单元治理 | accepted | `docs/decisions/0003-foundry-modules-release-boundaries.md` |
| 代码重整期间保持 vault 路径兼容 | accepted | `docs/decisions/0004-preserve-vault-paths-during-code-reorganization.md` |

## 阶段状态

| 阶段 | 状态 | 当前边界 |
|---|---|---|
| 0. 决策、基线与 finding 映射 | completed | ADR、迁移 ledger 和当前行为清单已建立 |
| 1. 入口、依赖与架构护栏 | completed | 无业务目录搬迁，正式 CI 已通过 |
| 2. 稳定 conversion facade/contracts | completed | 7 个生产调用方和 use-case 入口已迁移 |
| 3. Bun workspace 物理迁移 | in_progress | `packages/contracts` 已独立验收；parser/generation/workflows 尚未迁移 |
| 4. 独立 module/ops 产品拆分 | pending | workspace 边界验收后开始 |
| 5. 数据、reference 与 runtime root | pending | 只读 inventory 先行 |
| 6. 文档、分支与 worktree 治理 | pending | 不自动删除 |
| 7. 最终架构验收 | pending | 机械与语义双验收 |

## 原 finding 迁移矩阵

| Finding | 当前状态 | 当前权威 owner | 架构迁移约束 | 未来产品边界 |
|---|---|---|---|---|
| `MOD-I18N-001` | deferred | 原 ExecPlan | 不因 module 拆分关闭；所有 module 继续受双语 gate 约束 | 各 Foundry module |
| `SPELL-002` | in_progress | 原 ExecPlan | 保留失败 Actor/recovery 证据和 exact-online acceptance | spell resolver |
| `SPELL-003` | in_progress | 原 ExecPlan | recovery-required 状态优先级不能因 facade/拆包回归 | spell resolver |
| `BH-ACT-003` | in_progress | 原 ExecPlan | 不把运维工具搬迁当成 runtime repair | Foundry Ops |
| `MON-001` | partial | 原 ExecPlan | module + companion 必须作为一个产品迁移 | session monitor |
| `SEQ-MEM-001` | blocked_external | 原 ExecPlan | 保留现有外部登录阻塞和精确运行时验收条件 | Foundry Ops |
| `WORLD-ASSET-001` | in_progress | 原 ExecPlan | 数据 root 迁移不能删除 archive/evidence 或升级 finding | Foundry Ops |

## 当前行为清单

| 工作流 | 当前入口 | 重构期间必须保持 |
|---|---|---|
| 单文件 Actor/Item 转换 | `src/index.ts` | 参数、默认路径、诊断、生成语义 |
| collection / Vault Sync | `src/index.ts` + `src/core/workflow` | canonical verifier 和正式输出 gate |
| AI Intake | CLI/Web + `src/core/intake` | accepted/needs_review/failed 边界 |
| legacy plaintext ingest | CLI + `src/core/ingest` | 现有显式入口，不扩大支持声明 |
| GoddessFantasy crawl | `src/tools/crawlSites.ts` | 与主转换 CLI 解耦 |
| assets/token/icons | CLI/tools + `src/core/assets`/`icons` | 人工复核 gate 与 actor/token artwork 语义 |
| Web jobs | `src/web/server` | API/job schema 和正式 artifact gate |
| spell manifest/resolver | generator + Foundry module | contract、all-or-nothing、rollback、manual edit policy |
| chat memory guard | build script + module | 独立 module 行为 |
| session monitor | module + companion | 协议、版本、冷重启与权限边界 |
| Foundry Lab / world audit | package scripts/tools | read-only/local/production 权限边界 |

## 进度日志

### 2026-07-31：分支与阶段 0 启动

- 从本地 `master` @ `64ad9b7` 创建 `codex/architecture-reorganization-20260731`；
- `master` 当时比 `origin/master` 领先 6 个提交；
- 保留用户已有 `EXECPLAN.md` 修改和未跟踪 `obsidian/dnd数据转fvttjson/images/`；
- 将已批准方向写入 ADR；
- 阶段 0 只做文档和基线，不改变产品行为；
- 修正 package 入口/依赖事实，建立 dependency-cruiser、Knip 和循环依赖门禁。

### 2026-07-31：阶段 1 完成

- 删除 root Hello World 假入口和确认未使用的 `actor-consts.ts`；
- 清理 `marked` / `bun-types`，补齐 `domhandler` 直接依赖；
- 建立 dependency-cruiser、Knip 和 `architecture:verify` CI 门禁；
- 消除 evidence、token review、Foundry runtime API 三个循环；
- 将 canonical Actor verifier 从 tools 层移入 core；
- 修正 Windows `knip-bun.exe` 不退出的问题，正式脚本直接由 Bun 执行 Knip JS 入口；
- 给真实 CLI 子进程 Item 测试设置显式 30 秒测试预算，不改变生产超时或业务断言。

### 2026-07-31：阶段 2 完成

- 建立 `src/core/application/conversion.ts` 稳定 facade；
- 7 个生产调用方全部迁到 facade，旧 workflow 入口只保留实现与测试兼容；
- 建立 `src/core/application/workflows.ts`，统一 collection、sync、plaintext、Item、AI Intake use cases；
- 提取中立 contracts：Evidence、target/profile、diagnostics、artifact identity；
- delivery/operator 层不再直接导入 generator 或 workflow orchestration 内部文件；
- 增加 conversion facade characterization tests，锁定 v14 Actor、path write 和 fail-closed 行为；
- 生成证据保存在默认 vault 的 `output/architecture-reorganization-stage2/` 与
  `crawls/architecture-reorganization-stage2/`。

### 2026-07-31：阶段 3A `packages/contracts` 完成

- 根仓库启用 Bun workspaces，并建立 `@fvtt-json-generator/contracts`；
- Evidence、target/profile、diagnostics、artifact identity 的权威定义迁入该 package；
- `src/core/contracts/*` 保留为带弃用说明的薄兼容转发，不再拥有重复定义；
- 生产调用方全部改为 package subpath 导入；
- dependency-cruiser 新增两条强制边界：contracts 不得依赖实现/交付/运维层，生产代码不得回流旧适配层；
- Knip 扫描范围扩展到 `packages/`，兼容入口由契约测试显式覆盖；
- `bun install --frozen-lockfile` 已证明当前 workspace lockfile 可重复解析；
- 本迁移只移动类型契约，没有修改 parser、generator 或 Foundry mechanics。

## 验证证据

### 阶段 0

- 机械：分支、基线、dirty-worktree 清单、ADR 与 finding 映射均已写入持久文件；
- 语义：原 hardening finding 状态与 support matrix 未因新架构计划被改写。

### 阶段 1

- 机械：0 dependency violations、0 cycles；完整 `ci:verify` 通过；
- 语义：Nightgaunt v12/v14 core 由项目 CLI 重新生成，Actor verifier 0 warnings；人工核对身份、属性、
  AC/HP、移动、感官、语言、6 个 Item、攻击/伤害/射程与文字保留，未发现本阶段结构修复造成的行为漂移；
- 风险：Knip 的 37 个 export 与 46 个 exported type 候选维持 report-only，不作为删除依据。

### 阶段 2

- 机械：
  - dependency-cruiser：366 modules / 854 dependencies，0 violations；
  - Knip cycles：0；
  - `ci:verify`：1,579 tests / 0 failed / 7,465 expectations / 150 files；
  - coverage：85.44% lines / 88.14% functions；
  - anti-overfit 204 sources、hygiene 1,905 paths、reference/Web build/offline smoke 均通过。
- 语义：
  - 中文 YAML Actor：Slithering Bloodfin，9 个来源 Item，verifier 0 warnings；
  - 英文 bestiary Actor：White Tusk Shaman，6 个来源 Item，verifier 0 warnings；
  - caster：Warlock of the Rat God 保留 1 个 manifest group / 10 refs / 原 source SHA-256，
    0 embedded Spells、0 Cast Activities，状态仍为 `pending`；
  - Item：Shield of the Cavalier 保留 `veryRare`、required attunement、盾牌 2 + magical bonus 2、
    Forceful Bash 与 reaction Protective Field、dawn recovery 和来源文字；
  - crawl fixture：2 records → 1 matched Yithian → plaintext → project Markdown → v14 Actor，
    verifier 0 warnings；
  - AI Intake：accepted portable caster 仍明确报告 target-world resolution pending，不伪称 hydrated；
  - Web：真实 handler upload/download、单文件、collection ZIP、AI Intake job 测试均通过，下载 Actor
    与注册 artifact 一致。
- 未宣称：真实 Foundry runtime、在线 resolver hydration、生产部署或 support matrix 升级。

### 阶段 3A：`packages/contracts`

- 机械：
  - workspace 软链接实际指向 `packages/contracts`；
  - package-local、production 与全仓类型检查通过；
  - dependency-cruiser：372 modules / 867 dependencies，0 violations；
  - Knip cycles：0；unused files/dependencies/devDependencies/unlisted/unresolved：0；
  - 完整 `ci:verify`：1,580 tests / 0 failed / 7,466 expectations / 151 files；
  - coverage：85.42% lines / 88.14% functions；
  - anti-overfit 213 sources、hygiene 1,923 paths、reference/Web build/offline smoke 均通过。
- 语义：
  - 项目 CLI 从 `slithering-bloodfin__滑行血鳍.md` 重新生成 v14/core Actor；
  - canonical Actor verifier 返回 0 warnings；
  - 人工核对姓名、aberration、AC 16、HP 143、CR 9、盲视 100 尺、9 个来源 Item，
    以及攻击、伤害、状态和活动结构；
  - 与阶段 2 产物的差异仅为重新生成的 Effect `_id` 与时间戳；排除这些运行时身份后，
    完整 JSON 语义投影相等。
- 未宣称：parser/generation/workflows package 已迁移、Foundry runtime 验收、在线 hydration、
  生产部署或 support matrix 升级。

## 当前停止点

阶段 0–2 与阶段 3A 已形成可回滚稳定检查点。下一条执行路径是阶段 3B：
分析并迁移 `packages/parser`；在 parser package 独立验收前不移动 generation、CLI、Web、module 或 ops。

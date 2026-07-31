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

### 2026-07-31：阶段 3B1 parser kernel 完成

- 建立 `@fvtt-json-generator/parser` 的首个独立内核边界；
- 迁入中英文 action parser、structured action parser、中文文本正规化、parser i18n 与 action IR；
- 高层 YAML/English bestiary/router/item parser 尚留在 `src/core/parser`，避免把 mapping、item model 与
  spell-manifest validator 在同一提交中强行搬迁；
- 生产调用方改经 package exports；原 parser/model/mapper 路径只保留薄兼容转发；
- `opencc-js` 改由 parser package 自己声明，精确 ambient type 也随 package 迁移；
- 为保持当前 CLI/vault 行为，i18n 运行时仍读取仓库 `data/cn.json`；这是阶段 5 的 data-root
  迁移约束，不伪称 parser 已具备仓库外独立发布能力；
- dependency-cruiser 阻止 parser package 穿透 `src/` 或其他实现 package，并阻止生产代码回流旧适配层；
- 发现原 anti-overfit `--all` 只枚举已跟踪的 `src/`/`scripts/`，会漏掉新 workspace 和未提交 package；
  已把 `packages/` 纳入 tracked、untracked、diff 三种发现路径，并增加回归测试。

### 2026-07-31：阶段 3B2 spell-manifest contracts 完成

- 根据 parser 的真实依赖顺序，提前建立计划内的
  `@fvtt-json-generator/spell-manifest-contracts`；
- 迁入 portable manifest schema、类型、结构/来源验证及目标世界标识符禁入检查；
- 新 package 只依赖 `@fvtt-json-generator/contracts`，不依赖 resolver、intake、parser 或 Foundry runtime；
- 通用 browser-safe SHA-256 迁入 `@fvtt-json-generator/contracts/hash`；
- Session Monitor 和 resolver runtime 的 hash 调用不再穿过 spell-resolution 私有路径；
- YAML parser、Intake 与 Actor spell-manifest generator 直接使用 contract package；
- 原 schema/validator/types/hash 路径保留兼容转发并由行为测试覆盖。
- Bun 1.3.8 test runner 内嵌 `Bun.build` 在读取同一进程已加载的 workspace 源时触发
  `Unexpected reading file`；正式独立构建本身正常。构建器现将 browser bundle 隔离到
  单独 Bun 子进程，同时保留仓库根、输出 mutation boundary、内容扫描与 byte-identical ZIP 断言。

### 2026-07-31：阶段 3B3a models package 完成

- 高层 parser 的真实依赖闭包先指向 action/item/resource/behavior 中间模型，因此先建立计划内的
  `@fvtt-json-generator/models`，避免 models 反向依赖 parser；
- action IR 从 parser package 移入 models，parser 保留已发布 subpath 的兼容转发；
- item、actor resource 与 actor behavior 模型从 `src/core/models` 移入 workspace package；
- 全部生产调用方直接使用 models package，旧 `src/core/models/*` 只保留测试覆盖的兼容 adapter；
- dependency-cruiser 新增强制规则：models 不得依赖 parser、generation、delivery、Foundry runtime
  或 operator 实现，生产代码不得回流旧 model adapter；
- 本提交只移动类型与接口所有权，不改 parser 或 generator 算法。

### 2026-07-31：阶段 3B3b high-level actor parser 完成

- YAML、English bestiary、Chinese strategy、route factory、field mapping、resource semantics 与
  behavior semantics 迁入 `@fvtt-json-generator/parser`；
- parser package 显式声明 models、spell-manifest contracts 与 `js-yaml` 依赖；
- production 直接使用 parser package 的 mapping/types/router exports，旧 `src/config/mapping.ts`
  与 `src/core/parser/*` 路径保留为测试覆盖的兼容 adapter；
- dependency-cruiser 阻止生产代码回流高层 parser adapter；
- item parser 留待独立检查点，避免把 1,500 行 item 解析器混入 actor parser 迁移。

### 2026-07-31：阶段 3B3c item parser 完成

- ItemParser、item route detection 与 parser strategy 迁入 `@fvtt-json-generator/parser`；
- workflow 生产调用方改用 package exports，旧 item parser 路径保留兼容 adapter；
- 兼容测试锁定 class/function identity 与 strategy contract；
- 首次完整 CI 的 Knip cycles 子进程出现一次持续高 CPU；核对并只终止该次 CI 进程树后，
  standalone Knip 1.09 秒通过，第二次完整 CI 通过，未形成稳定复现的依赖图回归。

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

### 阶段 3B1：parser kernel

- 机械：
  - package-local、production、全仓类型检查与冻结安装通过；
  - dependency-cruiser：425 modules / 880 dependencies，0 violations；
  - Knip cycles：0；unused files/dependencies/devDependencies/unlisted/unresolved：0；
  - parser kernel 专项：86 tests / 0 failed / 326 expectations；
  - anti-overfit 修正后覆盖 226 个 tracked/untracked production sources，0 findings；
  - 修正 anti-overfit 扫描后的完整 `ci:verify`：1,581 tests / 0 failed /
    7,467 expectations / 151 files；
  - coverage：85.40% lines / 88.16% functions；
  - hygiene 1,931 tracked paths、reference/Web build/offline smoke 均通过。
- 语义：
  - 项目 CLI 再次生成 Slithering Bloodfin v14/core，canonical verifier 0 warnings；
  - 与阶段 3A 产物排除 Effect `_id` 和时间戳后完整语义投影相等；
  - Slithering Bloodfin 的 28 条真实 acceptance assertions 全部通过；
  - action parser、English action、structured action、normalize 与 i18n 专项行为均通过。
- 未宣称：高层 YAML/router/item parser 已进入 package，或完整 Stage 3 已完成。
- 已知边界债：parser i18n 的 `data/cn.json` runtime asset 尚未封装进 package。

### 阶段 3B2：spell-manifest contracts

- 机械：
  - package-local、production、全仓类型检查与冻结安装通过；
  - dependency-cruiser：439 modules / 906 dependencies，0 violations；
  - Knip cycles：0；unused files/dependencies/devDependencies/unlisted/unresolved：0；
  - contract/YAML/generator 专项：75 tests / 0 failed / 183 expectations；
  - spell resolver deterministic build 专项：18 tests / 0 failed / 99 expectations；
  - 完整 `ci:verify`：1,584 tests / 0 failed / 7,476 expectations / 153 files；
  - coverage：85.36% lines / 88.18% functions；
  - anti-overfit 232 sources、hygiene 1,941 tracked paths、reference/Web build/offline smoke 均通过。
- 语义：
  - 项目 CLI 重新生成 Warlock of the Rat God v14/core Actor；
  - canonical verifier 返回 0 warnings；
  - 仍为 `pending`，1 个 manifest group、10 个 refs、原 source SHA-256；
  - 仍为 0 embedded Spells、0 Cast Activities，没有伪称 target-world hydration；
  - 排除重新生成的 Effect `_id` 和时间戳后，与阶段 2 Actor 完整语义相等。
- 未宣称：Foundry 内 hydration、native cast 或 runtime acceptance 已完成。

### 阶段 3B3a：models package

- 机械：
  - 冻结安装、models/parser package-local、production 与全仓类型检查通过；
  - dependency-cruiser：450 modules / 927 dependencies，0 violations；
  - Knip cycles、unused files/dependencies/devDependencies/unlisted/unresolved：0；
  - models/parser 专项：116 tests / 0 failed / 390 expectations；
  - 完整 `ci:verify`：1,585 tests / 0 failed / 7,480 expectations / 154 files；
  - coverage：85.36% lines / 88.18% functions；
  - anti-overfit 237 sources、hygiene 1,951 tracked paths、reference/Web build/offline smoke 均通过。
- 语义：
  - 项目 CLI 从 `slithering-bloodfin__滑行血鳍.md` 重新生成 v14/core Actor；
  - canonical verifier 返回 0 warnings；
  - 人工核对 aberration、AC 16、HP 143、CR 9、盲视 100 尺、9 个来源 Item 及名称；
  - 排除运行时 `_id` 与时间戳后，与 parser-kernel 检查点 Actor 完整语义相等。
- 未宣称：高层 YAML/English/router/item parser 已物理迁入 package，或 Stage 3 已完成。

### 阶段 3B3b：high-level actor parser

- 机械：
  - 冻结安装、package-local、production 与全仓类型检查通过；
  - dependency-cruiser：500 modules / 977 dependencies，0 violations；
  - Knip cycles、unused files/dependencies/devDependencies/unlisted/unresolved：0；
  - parser 专项：116 tests / 0 failed / 393 expectations；
  - 完整 `ci:verify`：1,586 tests / 0 failed / 7,488 expectations / 155 files；
  - coverage：85.38% lines / 88.20% functions；
  - anti-overfit 245 sources、hygiene 1,959 tracked paths、reference/Web build/offline smoke 均通过。
- 语义：
  - 中文 YAML：项目 CLI 重生成 Slithering Bloodfin v14/core，verifier 0 warnings；
  - 英文 bestiary：项目 CLI 重生成 White Tusk Shaman v14/core，verifier 0 warnings；
  - 人工核对两者身份、HP、AC、CR、感官及 9/6 个来源 Item；
  - 排除运行时 `_id` 与时间戳后，两者分别与上一检查点/Stage 2 基线完整语义相等。
- 未宣称：item parser 已迁入 package，或 parser 的 `data/cn.json` 仓库外发布债已关闭。

### 阶段 3B3c：item parser

- 机械：
  - package-local、production 与全仓类型检查通过；
  - dependency-cruiser：503 modules / 989 dependencies，0 violations；
  - Knip cycles、unused files/dependencies/devDependencies/unlisted/unresolved：0；
  - item parser/router/compatibility 专项：48 tests / 0 failed / 175 expectations；
  - 完整 `ci:verify` 复验：1,586 tests / 0 failed / 7,492 expectations / 155 files；
  - coverage：85.36% lines / 88.20% functions；
  - anti-overfit 248 sources、hygiene 1,968 tracked paths、reference/Web build/offline smoke 均通过。
- 语义：
  - 项目 CLI 从真实 `input/items/骑士之盾.md` 重生成 v14/core Item；
  - 人工核对名称、equipment、very rare、required attunement、AC +2、Forceful Bash、
    Protective Field 与 prone effect；
  - 新旧整树唯一原始差异是 Effect `origin` 内嵌本次随机 Item `_id`；
  - 排除 `_id`、时间戳及其派生 `origin` 后，与 Stage 2 Item 完整语义相等。
- 未宣称：parser 的 `data/cn.json` 仓库外发布债已关闭，或 generation package 已迁移。

## 当前停止点

阶段 0–2、阶段 3A、parser kernel、spell-manifest contracts、models 与 high-level actor parser
及 item parser 已形成可回滚稳定检查点。`packages/parser` 的代码迁移已完成；下一条执行路径是
阶段 3C：迁移 generation package，在其独立验收前不移动 CLI、Web、module 或 ops。

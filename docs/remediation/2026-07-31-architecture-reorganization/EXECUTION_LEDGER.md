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
| 3. Bun workspace 物理迁移 | completed | 目标 apps/packages 均已物理迁移并独立双验收 |
| 4. 独立 module/ops 产品拆分 | completed | 4A、4B、4C、4D 均已验收；Monster Spell Resolver 已物理归入 `foundry-modules/` |
| 5. 数据、reference 与 runtime root | completed | Foundry Lab 与完整 reference cache 均已 copy-first 外置、切换并通过旧路径隐藏验收；旧 reference 副本保留兼容窗口，删除属于独立授权清理 |
| 6. 文档、分支与 worktree 治理 | completed | 六类文档总索引已齐；全部附加 worktree 和已合并本地分支已清理；历史资料已审计并决定原位保留 |
| 7. 最终架构验收 | completed | 完整机械门禁和代表性语义验收均已完成；外部长时验收继续按支持矩阵单独管理 |

## 原 finding 迁移矩阵

| Finding | 当前状态 | 当前权威 owner | 架构迁移约束 | 未来产品边界 |
|---|---|---|---|---|
| `MOD-I18N-001` | deferred | 原 ExecPlan | 不因 module 拆分关闭；所有 module 继续受双语 gate 约束 | 各 Foundry module |
| `SPELL-002` | closed | 原 ExecPlan | 在线失败 Actor 已由用户完成恢复、清理和重导入验收 | spell resolver |
| `SPELL-003` | closed | 原 ExecPlan | 用户确认恢复后错误状态消失且修复行为正确 | spell resolver |
| `BH-ACT-003` | in_progress | 原 ExecPlan | 不把运维工具搬迁当成 runtime repair | Foundry Ops |
| `MON-001` | partial | 原 ExecPlan | module + companion 必须作为一个产品迁移 | session monitor |
| `SEQ-MEM-001` | blocked_external | 原 ExecPlan | 保留现有外部登录阻塞和精确运行时验收条件 | Foundry Ops |
| `WORLD-ASSET-001` | in_progress | 原 ExecPlan | 数据 root 迁移不能删除 archive/evidence 或升级 finding | Foundry Ops |

## 当前行为清单

| 工作流 | 当前入口 | 重构期间必须保持 |
|---|---|---|
| 单文件 Actor/Item 转换 | `apps/cli/src/main.ts`；`src/index.ts` 为兼容入口 | 参数、默认路径、诊断、生成语义 |
| collection / Vault Sync | `apps/cli/src/main.ts` + `@fvtt-json-generator/workflows` | canonical verifier 和正式输出 gate |
| AI Intake | CLI/Web + `@fvtt-json-generator/intake-ai` | accepted/needs_review/failed 边界 |
| legacy plaintext ingest | CLI + `src/core/ingest` | 现有显式入口，不扩大支持声明 |
| GoddessFantasy crawl | `src/tools/crawlSites.ts` | 与主转换 CLI 解耦 |
| assets/token/icons | CLI/tools + `src/core/assets`/`icons` | 人工复核 gate 与 actor/token artwork 语义 |
| Web jobs | `apps/web/src/server` | API/job schema 和正式 artifact gate |
| spell manifest/resolver | generator + Foundry module | contract、all-or-nothing、rollback、manual edit policy |
| chat memory guard | `foundry-modules/chat-memory-guard` | 独立 manifest/version/build/test/install/acceptance |
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

### 2026-07-31：阶段 3C1 canonical source models 完成

- generation 仍从 AI Intake 私有 `types.ts` 获取 CanonicalMonster，形成错误依赖方向；
- CanonicalMonster、CanonicalFeature、damage/condition 与 spellcasting source IR 迁入
  `@fvtt-json-generator/models/canonical-monster`；
- Intake 保留兼容 re-export，generation 直接依赖 models package；
- dependency-cruiser 阻止 generation/generator 回流 Intake canonical type adapter；
- 这是 generation package 迁移前置边界，不改 Intake 或 generator 算法。

### 2026-07-31：阶段 3C2 generation package 完成

- 建立 `@fvtt-json-generator/generation`，先收敛 Foundry target registry、stable document ID、
  translation service 与 icon resolver 窄端口；
- portable `hashManifest` 下沉到 spell-manifest contracts，resolver runtime 只保留 managed
  document projection hash；
- actor/item projectors、generation verification、generator、source-derived mechanics 与 legacy
  spell mapper 物理迁入 generation package；
- workflow、verification 与 validator 生产调用方改用 package subpath exports；
- 旧 `src/core/generation`、`src/core/generator`、相关 mapper/mechanics 路径只保留兼容转发，
  并由 class/function identity 测试锁定；
- generation package 不依赖 `src`、delivery、Intake 私有类型、Foundry runtime 或 operator
  implementation；dependency-cruiser 阻止生产代码回流旧 adapter；
- parser 的 `opencc-js` ambient declaration 通过入口 reference 显式纳入，使 parser 作为
  generation 的独立 package dependency 编译时不依赖根 tsconfig 的隐式文件集合；
- generation 专属 anti-overfit 规则复制到 package 根；本阶段是结构迁移，没有新增 mechanics
  或推断规则。

### 2026-07-31：阶段 3D workflows package 完成

- 建立 `@fvtt-json-generator/workflows`，迁入 Actor/Item generation orchestration、single-file
  conversion、Vault Sync、JSON translation sync、plaintext actor、item text 与 collection conversion；
- 图标、图片资产、AI normalizer、翻译服务与 ingest 具体实现留在 `src/core` 外围，通过窄 port
  注入 package，不把适配器反向搬入业务用例；
- `src/core/application/workflows.ts` 成为实际 composition root，CLI/Web 直接依赖该应用入口；
  `src/core/workflow/*` 仅保留兼容适配与原测试入口；
- dependency-cruiser 新增 package 独立性与 production 禁止回流 legacy workflow adapter 的门禁；
- collection conversion 不再通过 application facade 反向调用自身，而是直接组合 package 内
  single-file conversion；
- plaintext ingest port 根据真实 CLI 用法补齐 `sections` 与 `rawNotes`，没有用类型断言掩盖契约缺口；
- Bun 1.3.8 Windows 覆盖率在并发 4 下两次于 1,587 个测试执行完后稳定触发同一内部 assertion；
  workflows 检查点曾以并发 2 通过，但 CLI 物理迁移后再次触发同类 runner crash，因此“并发 2 已稳定”
  不再作为最终结论；最终处理记录在阶段 3E。

### 2026-07-31：阶段 3E `apps/cli` 完成

- 建立 `apps/cli` workspace，原 390 行命令入口迁入 `apps/cli/src/main.ts`；
- `src/index.ts` 缩减为薄兼容入口，原命令、参数、默认 vault 路径、诊断与退出码继续可用；
- 新增 `src/core/application/cli.ts` 作为 CLI 唯一 composition surface；应用入口不再穿透
  parser、generation、workflow 或 operator 私有文件；
- dependency-cruiser 将 `apps/` 纳入正式扫描，禁止 core 反向依赖 app，并限制 CLI 只能导入
  `src/core/application/cli.ts`；
- 根 CI 新增 apps 类型检查，workspace lockfile 与 frozen install 均覆盖 CLI package；
- Bun 覆盖率不采集 CLI 启动的子进程代码，且把这些子进程测试置于 coverage runner 内会触发
  Windows/Bun 1.3.8 内部 assertion；因此 CI 将 12 个 CLI 子进程行为测试串行独立执行，
  其余 1,575 个测试由 coverage runner 执行，二者仍由同一 `test:coverage` 门禁汇总；
- CLI 子进程测试并发 4 曾出现一次 15 秒启动超时，随后连续 5 轮均通过；为消除无收益的
  Windows/Bun 子进程启动争用，正式 CLI 门禁固定为串行，普通测试并发规则不变。

### 2026-07-31：阶段 3F `apps/web` 启动

- 完整读取并沿用原 `src/web/AGENTS.md`，其应用范围随代码迁至 `apps/web/AGENTS.md`；
- client、server、job、安全与测试代码物理迁入 `apps/web/src`，根入口、Vite、Knip、覆盖率分组、
  apps 类型检查与 workspace lockfile 已同步；
- 建立 browser-safe `web-client` 与 server-only `web-server` composition surface；生产 Web 代码
  不再穿透散落的 core 私有目录，dependency-cruiser 新增强制门禁；
- 首轮 apps/production 类型检查、Web production build、dependency-cruiser 及 55 个
  Web/API/job/security/client/coverage 专项测试通过；
- gstack `browse` 的 Windows 缓存虽含 `browse.exe`，但缺少其运行所需 `src/server.ts`，且该分发
  没有文档所述 `setup`；因此没有修改项目代码绕过工具缺口，改用已安装的 in-app Browser 完成
  同一真实浏览器验收；
- 迁移后发现 anti-overfit source discovery 未包含 `apps/`，会使移出 `src/` 的生产代码逃逸审计；
  已将 `apps/` 纳入 tracked、untracked 与 diff 发现根并增加回归测试，最终覆盖 304 个生产源。

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

### 阶段 3C1：canonical source models

- 机械：
  - 冻结安装、package-local、production 与全仓类型检查通过；
  - dependency-cruiser：541 modules / 1,045 dependencies，0 violations；
  - Knip cycles、unused files/dependencies/devDependencies/unlisted/unresolved：0；
  - Intake/generation/models 专项：265 tests / 0 failed / 1,077 expectations；
  - 完整 `ci:verify`：1,586 tests / 0 failed / 7,493 expectations / 155 files；
  - coverage：85.38% lines / 88.20% functions；
  - anti-overfit 249 sources、hygiene 1,971 tracked paths、reference/Web build/offline smoke 均通过。
- 语义：
  - 项目 CLI 重生成 Warlock of the Rat God v14/core Actor；
  - canonical verifier 返回 0 warnings；
  - 排除随机身份与时间戳后，与 spell-manifest contracts 检查点完整语义相等；
  - 仍无 embedded Spell，未伪称 target-world hydration。
- 未宣称：generation/generator 已物理迁入 package。

### 阶段 3C2：generation package

- 机械：
  - 冻结安装、package-local、production 与全仓类型检查通过；
  - dependency-cruiser：756 modules / 1,287 dependencies，0 violations；
  - generation/workflow/mechanics/validator 专项：325 tests / 0 failed / 1,411 expectations；
  - legacy adapter identity：1 test / 0 failed / 4 expectations；
  - 完整 `ci:verify`：1,587 tests / 0 failed / 7,497 expectations / 156 files；
  - coverage：85.39% lines / 88.25% functions，其中 generator group 为 93.60% lines /
    92.67% functions；
  - anti-overfit 283 sources、hygiene 2,010 tracked paths、reference/Web build/offline smoke
    均通过。
- 语义：
  - 项目 CLI 分别重生成 Slithering Bloodfin v12/core 与 v14/core，均为 9 个来源 Item，
    canonical verifier 均为 0 warnings；
  - 人工核对 aberration、AC 16、HP 143、CR 9、盲视 100 尺，以及 Death Burst、Bite、
    Tail Crash、Swallow、Slippery、Pelagic Screech 的攻击/伤害/状态/射程结构；
  - 项目 CLI 分别重生成 Shield of the Cavalier v12/core 与 v14/core；人工核对
    equipment、veryRare、required attunement、AC +2、Forceful Bash、Protective Field、
    reaction、dawn recovery、1 minute concentration、5-foot radius 与 prone effect；
  - 项目 CLI 重生成 Warlock of the Rat God v14/core；verifier 0 warnings，portable manifest
    保留 10 个 source-backed spell refs、状态 `pending`、0 embedded Spell，未伪称 target-world
    hydration；
  - 项目 CLI 重生成 White Tusk Shaman v14/core；verifier 0 warnings，6 个来源 Item；
  - Bloodfin、Shield、Rat 与 White Tusk 的 v14 输出，排除随机 document ID 与时间戳后，
    分别与上一已验收检查点完整 JSON 语义投影相等。
- 已知债：
  - `spellsMapper` 仍从 repository cwd 的 `data/spells.ldb` 读取，generation package 当前是
    monorepo-internal workspace package，不宣称可在仓库外独立发布；runtime/data root 归阶段 5。

### 阶段 3D：workflows package

- 机械：
  - package-local、production 与全仓类型检查通过；
  - dependency-cruiser：1,145 modules / 1,806 dependencies，0 violations；Knip cycles 为 0；
  - 完整默认 `ci:verify`：1,587 tests / 0 failed / 7,497 expectations / 156 files；
  - coverage：85.32% lines / 88.04% functions，其中 workflow group 为 87.90% lines /
    81.82% functions；
  - anti-overfit 300 sources、hygiene 2,029 tracked paths、dnd5e 5.3.3 reference、Web build 与
    offline Actor smoke 均通过；
  - CLI plaintext/item、Vault Sync、JSON translation、Web API/collection ZIP 等针对性入口测试
    均通过。
- 语义：
  - 项目 CLI 通过新 application composition root 重生成 Slithering Bloodfin、Shield of the
    Cavalier 与 Warlock of the Rat God 的 v14/core 正式输出；
  - Bloodfin 与 Rat 的 canonical verifier 均为 0 warnings；
  - 三个输出排除随机 `_id`、时间戳及派生 `origin` 后，分别与 Stage 3C2 已验收产物完整 JSON
    语义投影相等；
  - 人工核对 Shield 仍为 equipment / veryRare / required，armor value 与 magical bonus 均为 2；
    Forceful Bash 为 5-foot attack 并链接 prone，Protective Field 仍是 reaction、dawn recovery、
    1 minute concentration 与 5-foot radius；
  - Rat 仍为 1 个 spellcasting group / 10 refs / `pending`，0 embedded Spells、0 Cast Activities，
    未伪称 target-world hydration；
  - Web 真实 monster-collection job 仍生成可下载 ZIP；plaintext actor 与 item-text workflow 的
    真实 vault promotion/output 行为由专项测试覆盖。
- 已知债：
  - workflows package 是 monorepo-internal orchestration 包；图片、图标、翻译、ingest 与 vault
    路径仍由 repository composition root 注入，不宣称仓库外独立发布；
  - 旧 `src/core/workflow/*` 尚保留测试兼容适配，后续只在确认无外部消费者后治理，不在本阶段删除。

### 阶段 3E：`apps/cli`

- 机械：
  - frozen install、app-local、production、packages 与全仓类型检查通过；
  - dependency-cruiser：1,366 modules / 2,101 dependencies，0 violations；Knip cycles 为 0；
  - CLI 子进程门禁：12 tests / 0 failed / 57 expectations；连续 5 轮复验共 60 tests 均通过；
  - coverage 主组：1,575 tests / 0 failed / 7,440 expectations / 156 files；12 个 CLI 子进程测试
    被显式分离而非删除，合计仍为 1,587 tests / 7,497 expectations；
  - coverage：85.32% lines / 88.04% functions；generator 93.60% / 92.67%，workflow
    87.90% / 81.82%，Web 59.38% / 75.86%；
  - 完整默认 `ci:verify` 从根脚本通过；anti-overfit 301 sources、hygiene 2,033 tracked paths、
    dnd5e 5.3.3 reference、Web production build 与 offline Actor smoke 均通过。
- 语义：
  - 分别从兼容入口 `src/index.ts` 和新应用入口 `apps/cli/src/main.ts` 生成 Slithering
    Bloodfin v14/core；排除随机身份与时间戳后，两份 Actor 完整语义投影相等；
  - 新应用入口生成的 Bloodfin v14/core 与 Stage 3D 检查点相等，v12/core 与 Stage 3C2
    检查点相等，canonical verifier 均为 0 warnings；
  - 新应用入口生成 Shield of the Cavalier v14/core，与 Stage 3D Item 检查点语义相等；
  - Bloodfin v14/modded-v14 仍保留 9 个来源 Item，canonical verifier 0 warnings；该样本没有
    产生 MIDI-QOL/DAE flags，因此只证明 CLI/profile 路由与核心 Actor 语义未漂移，不将此样本
    夸大为全部 module-integrated behavior 的运行时验收；
  - CLI AI Intake、safe icon、Item import、plaintext actor dry-run 的参数、诊断、输出路径与
    fail-closed 行为由真实子进程测试覆盖。
- 已知债：
  - `apps/cli` 当前仍通过 monorepo 的 `src/core/application/cli.ts` 组合尚未迁移的
    intake、ingest、assets 与 operator adapter；它是独立 workspace 应用边界，但尚不宣称
    可脱离本仓库发布；
  - `src/index.ts` 为现有脚本和外部调用者保留兼容入口；只有确认消费者完成迁移后才可删除。

### 阶段 3F：`apps/web`

- 机械：
  - frozen install、Web app-local、production、packages、apps 与全仓类型检查通过；
  - dependency-cruiser：1,757 modules / 2,099 dependencies，0 violations；Knip cycles 为 0；
  - Web/API/job/security/client/coverage 专项：55 tests / 0 failed / 234 expectations；
  - 完整默认 `ci:verify`：CLI 子进程 12 tests 与 coverage 主组 1,575 tests 均通过，
    合计 1,587 tests / 0 failed / 7,497 expectations / 156 files；
  - coverage 统计 242 个 production files：85.32% lines / 88.04% functions；Web group
    59.23% lines / 75.86% functions；
  - anti-overfit 304 sources、hygiene 2,033 tracked paths、dnd5e 5.3.3 reference、
    Web production build 与 offline Actor smoke 均通过；
  - Vite 产物大小与迁移前一致：CSS 13.79 kB、JS 232.35 kB，未把 server-only composition
    surface 或 Node adapter 带入浏览器 bundle。
- 语义：
  - in-app Browser 从迁移后的页面上传真实
    `slithering-bloodfin__滑行血鳍.md`，选择 v14/core，页面进入“已完成”；
  - 页面只暴露 job 注册的唯一 JSON 下载链接，真实浏览器 download event 成功；
  - 对该 Web job 的实际输出运行 canonical verifier，返回 0 warnings；
  - 输出仍为 aberration、AC 16、HP 143、CR 9、盲视 100 尺与 9 个来源 Item；人工查看结果区、
    JSON 预览、warning 区和下载按钮均可读，无控件重叠，浏览器 console 无 warning/error；
  - 排除随机 `_id`、时间戳及派生 `origin` 后，Web 输出与 Stage 3E CLI v14/core 检查点完整
    JSON 语义投影相等；
  - API 专项继续覆盖 loopback 默认、显式 authenticated public/proxied mode、可信代理、
    请求体上限、rate/job caps、注册文件下载与 crawl/intake job 边界。
- 已知债：
  - `apps/web` 仍通过 monorepo 的 `src/core/application/web-server.ts` 与 browser-safe
    `web-client.ts` 组合尚未迁移的 intake、ingest、crawl 与 assets adapter；不宣称仓库外独立发布；
  - gstack `browse` 的本机 Windows 分发缺失运行时 source，浏览器验收由 in-app Browser 完成；
    这是外部技能安装问题，不影响 Web 产物或应用行为。

### 阶段 3G：`packages/intake-ai`

- 结构：
  - 将 AI Intake 的 config、provider、orchestrator、IR types、renderer、validator 与 verifier
    迁入 `@fvtt-json-generator/intake-ai`；旧 `src/core/intake/*` 只保留兼容 re-export；
  - provider 改用包内最小 HTTP transport contract，不再借用 translation 私有类型；
  - verifier 直接依赖 portable spell manifest contracts，不再绕经 resolver runtime；
  - orchestrator 通过显式 conversion port 调用 generation workflow；repository application
    composition root 注入现有 conversion application，因此 CLI/Web 的 safe icon adapter 与正式
    Actor 生成路径未被包内默认实现替换；
  - dependency-cruiser 新增 Intake package 独立性与 legacy adapter 禁止规则。
- 机械：
  - package-local、production、packages、apps 与全仓类型检查通过；frozen install 通过；
  - dependency-cruiser：2,432 modules / 3,002 dependencies，0 violations；Knip cycles 为 0；
  - Intake/verify/Web job 专项：213 tests / 0 failed / 699 expectations；CLI 子进程门禁：
    12 tests / 0 failed / 57 expectations；
  - 新增 conversion port 回归测试，确认 candidate verifier 与 final promotion 均经注入端口，
    没有只迁移类型而继续反向调用 `src/core/application`；
  - 完整默认 `ci:verify`：CLI 子进程 12 tests 与 coverage 主组 1,576 tests 均通过，
    合计 1,588 tests / 0 failed / 7,501 expectations / 156 files；
  - coverage 统计 248 个 production files：85.32% lines / 88.09% functions；anti-overfit
    313 sources、hygiene 2,037 tracked paths、dnd5e 5.3.3 reference、Web production build 与
    offline Actor smoke 均通过。
- 语义：
  - 实际 v14/core Lurker promotion 仍为 `暗影潜妖 (Lurker in the Dark)`、npc、AC 14、
    HP 65、CR 4、6 个来源 Item；deterministic report 为 accepted 且 0 findings；
  - CLI 实际生成的 Rat Warlock 仍携带 1 个 portable spellcasting group / 10 个 source-backed
    spell refs，resolution 为 `pending`，0 embedded Spell、0 Cast Activity，未伪称 hydrated；
  - 实际 `needs_review` 样本保留 `REVIEW_REVISE`、不写入 promoted Actor；实际 provider
    failure 样本为 `failed` / `PROVIDER_FAILURE`、spell resolution failed，同样不推广 Actor；
  - 专项测试继续覆盖 immutable source/evidence、独立 review/repair budget、conflict backup、
    decisions resume、accepted/needs_review/failed aggregation、provider dedicated env、严格 JSON、
    portable caster pending、Web 下载 gate 与 verification bundle。
- 已知债：
  - `packages/intake-ai` 是 monorepo-internal package；真实模型调用、图标适配、vault promotion
    与生成实现仍由 repository composition root 提供，不宣称仓库外独立发布；
  - Intake 测试与 fixtures 暂留在旧 `src/core/intake/__tests__` 作为路径兼容资产；生产代码已受
    dependency gate 约束，不允许回到 legacy adapter。测试物理迁移留到兼容路径治理阶段。

### 阶段 3H：`packages/ingest-plaintext`

- 结构：
  - 将 legacy plaintext 的 split、normalize、parse、Markdown emission 与 audit 迁入
    `@fvtt-json-generator/ingest-plaintext`；Item ingest 未混入本次提交；
  - package workflow 默认不读取 repository env，也不依赖 `src/core/translation`；AI normalizer
    改为 translation factory port；
  - `src/core/ingest/plaintextAdapter.ts` 作为 repository composition adapter，继续以原有
    translation config/client 提供“有配置则启用、无配置则规则回退”的历史行为；
  - collection ingestion adapter 直接使用 package 的纯 split/parse API；旧 plaintext/audit
    路径只保留兼容入口；
  - dependency-cruiser 新增 plaintext package 独立性与 legacy adapter 禁止规则；coverage gate
    将新 package 继续归入 `parser-ingest`，没有通过搬路径规避覆盖率。
- 机械：
  - package-local、production、packages、apps 与全仓类型检查通过；frozen install 通过；
  - dependency-cruiser：2,597 modules / 3,126 dependencies，0 violations；Knip cycles 为 0；
  - plaintext split/parse/audit、PlainTextActor、Web 与 3 个 acceptance 样本专项：
    85 tests / 0 failed / 449 expectations；另有 1 个真实本地 HTTP port 接线测试 /
    3 expectations，确认 package prompt、repository translation client 与响应解析确实串通；
  - CLI 子进程门禁最终为 12 tests / 0 failed / 57 expectations；第一次整组运行中 Rat Warlock
    本地假 HTTP 子进程出现一次 20 秒超时，随后的单测、完整 CLI 组与正式全量 CI 均通过，
    未复现且不在 plaintext 改动路径，因此记录为一次性进程抖动而非隐藏为首次通过；
  - 完整默认 `ci:verify`：CLI 子进程 12 tests 与 coverage 主组 1,577 tests 均通过，
    合计 1,589 tests / 0 failed / 7,504 expectations / 156 files；
  - coverage 统计 251 个 production files：85.70% lines / 88.17% functions；
    `parser-ingest` 为 95.09% lines / 94.83% functions；anti-overfit 317 sources、hygiene
    2,048 tracked paths、dnd5e 5.3.3 reference、Web production build 与 offline Actor smoke
    均通过。
- 语义：
  - 项目 CLI 从真实 `月蚀矿腐化生物数据.md` 运行 legacy plaintext actor workflow，
    检出 7 个 creature，生成 7 份 middle/input Markdown 与 7 份 v14/core Actor JSON；
  - 7/7 Actor 分别运行 canonical verifier，全部 0 warnings；CLI 报告 7 processed、0 skipped、
    0 failed、0 warnings，AI normalize 在无配置路径明确为 disabled；
  - 人工抽查 Slithering Bloodfin 仍为 aberration、AC 16、HP 143、CR 9、盲视 100 尺与
    9 个来源 Item；Scuttling Serpentmaw 仍为 AC 17、HP 75、CR 5、盲视 60 尺；
  - Bloodfin v14/core 排除随机 `_id`、时间戳与派生 `origin` 后，与 Stage 3E 已验收 CLI
    检查点完整 JSON 语义投影相等；
  - acceptance tests 继续逐项覆盖 Alyxian Aboleth、Scuttling Serpentmaw 与 Slithering
    Bloodfin 的 actions、reactions、legendary resources、damage/save/effect 与 false-effect
    边界；PlainTextActor 专项继续覆盖 repeated run、vault promotion 与 actor/token artwork。
- 已知债：
  - 该包明确是 legacy compatibility ingress，不升级为推荐的语义 Intake，也不扩大支持声明；
  - OpenAI-compatible normalizer 的真实外部模型调用未在本阶段执行；只验证了端口接线、
    配置关闭路径和注入/fallback 行为，外部 provider 质量仍受模型与凭据影响；
  - plaintext tests/fixtures 暂留旧路径作为兼容资产；生产代码已受 dependency gate 约束。

### 阶段 3I：`packages/crawl-goddessfantasy`

- 结构与规则：
  - 将 board/topic/print parser、认证与 cookie file adapter、Crawlee orchestration、records schema、
    GoddessFantasy plaintext renderer 和 records-to-plaintext workflow 迁入
    `@fvtt-json-generator/crawl-goddessfantasy`；
  - `src/tools/crawlSites.ts` 与 `goddessFantasyPipeline.ts` 直接使用 package exports，主 Actor CLI
    仍不导入 crawl；Web 只经 server application composition surface 使用；
  - 旧 `src/core/crawl/*` 仅保留兼容 re-export；专属 `AGENTS.md` 与 root/Ruler 路由更新到 package，
    并修正先前 Web AGENTS 的陈旧路径；
  - package 独立性、legacy adapter 禁止与 crawl-to-main-CLI 解耦均写入 dependency-cruiser。
- 机械：
  - package-local、production、packages、apps 与全仓类型检查通过；frozen install 通过；
  - dependency-cruiser：2,733 modules / 3,138 dependencies，0 violations；Knip cycles 为 0；
  - board/topic/auth/print、incremental/full/dry-run/failure、records-to-plaintext、工具 CLI、
    pipeline stop states 与 v14 fixture acceptance 专项：50 tests / 0 failed / 250 expectations；
  - 完整默认 `ci:verify`：CLI 子进程 12 tests 与 coverage 主组 1,577 tests 均通过，
    合计 1,589 tests / 0 failed / 7,504 expectations / 156 files；
  - coverage 统计 254 个 production files：85.70% lines / 88.18% functions；anti-overfit
    324 sources、hygiene 2,054 tracked paths、dnd5e 5.3.3 reference、Web production build 与
    offline Actor smoke 均通过。
- 语义：
  - 未访问真实 GoddessFantasy；所有 crawl/parser 验收均使用仓库 fixture 或测试内 loopback
    server，没有读取或写入真实 cookie、账号、密码；
  - 项目 crawl CLI 从 2 条真实格式 fixture records 中匹配 1 条 monster、按分类跳过 1 条，
    输出 1 个 Yithian plaintext，0 needs_review / 0 failed / 0 warnings；
  - 该 plaintext 经项目 CLI 的既有 ingest/generator workflow 生成 v14/core Yithian Actor，
    1 processed / 0 skipped / 0 failed / 0 warnings；canonical verifier 为 0 warnings；
  - 人工核对最终 Actor 仍为 `伊斯人 (Yithian)`、aberration、AC 14、HP 180 / `19d10+76`、
    CR 15、真实视觉 60 尺与 5 个来源 Item；Mind Swap 仍为 DC 18 Intelligence save；
  - 当前 fixture-to-v14 acceptance test 在迁移前后的完整 CI 均通过。历史
    `.local/final-verification` Yithian 来自 Foundry 14.361 与旧生成器，包含旧 Activity IDs、
    无 chatFlavor 及 save-on-success 差异；它被明确视为历史证据，不冒充当前 14.364 等值基线。
- 已知债：
  - 真实站点认证、登录态、限流与远端 HTML 变化未在本阶段验证；需要凭据和外部状态时仍是独立
    运行验收，不能由 fixture 测试代替；
  - crawl artifacts 仍是 source artifacts；`.crawlee-storage`、cookie header 与本地凭据文件
    继续禁止提交，package 也不升级这些文件为正式 Actor 产物；
  - tests/fixtures 暂留旧 `src/core/crawl/__tests__` 兼容路径，生产代码已受 dependency gate 约束。

### 阶段 3J：`packages/assets-icons`

- 结构：
  - 将 image asset、SSH uploader、token crop/candidates、visual hints、token review/contact sheet
    与 v14 safe icon catalog/resources/resolver/report 迁入 `@fvtt-json-generator/assets-icons`；
  - browser-safe Web composition 只导入纯 `token-crop` 子路径；Node-only sharp/child_process/SSH
    实现没有进入浏览器 bundle；
  - application/workflow、CLI/Web、crawl pipeline、operator tools 与 icon catalog builder 全部改用
    package exports；旧 `src/core/assets/*`、`src/core/icons/*` 只保留兼容 re-export；
  - icon catalog 与 override 默认路径按 package 新深度指向同一 tracked
    `references/foundry-v14-icons/catalog.json` 和 `config/icon-overrides.v14.json`；
  - dependency-cruiser 新增 package 独立性与 legacy adapter 禁止规则。
- 机械：
  - package-local、production、packages、apps 与全仓类型检查通过；frozen install 通过；
  - dependency-cruiser：3,301 modules / 3,819 dependencies，0 violations；Knip cycles 为 0；
  - image/SSH mock、crop、candidate、visual hints、token review/contact sheet、icon catalog/resolver、
    CLI/Web artifact gate 与 pipeline 专项：87 tests / 0 failed / 401 expectations；
  - CLI 子进程最终 12 tests / 0 failed / 57 expectations；第一次全量 CI 中 safe-icon 子进程
    一次触发 5 秒测试超时，随后的精确单测、完整 CLI 组与完整 CI 均通过。复跑时另一个 Item
    子进程曾耗时约 10 秒但成功，证据指向 Windows 子进程偶发调度抖动，不把首次失败隐藏为通过；
  - 最终完整 `ci:verify`：CLI 子进程 12 tests 与 coverage 主组 1,577 tests 均通过，
    合计 1,589 tests / 0 failed / 7,504 expectations / 156 files；
  - coverage 统计 262 个 production files：85.69% lines / 88.20% functions；anti-overfit
    340 sources、hygiene 2,063 tracked paths、dnd5e 5.3.3 reference、Web production build 与
    offline Actor smoke 均通过。
- 语义：
  - 项目 CLI 对真实 Slithering Bloodfin v14/core 运行 `--icon-mode safe`，Actor verifier
    0 warnings；9 个 Item 均产生 review entry，5 exact、4 type-default fallback，0 invalid path、
    0 missing reason；
  - 全部 selected path 属于 tracked `icons/` 或 `systems/dnd5e/`；fallback 保持显式 review，
    没有被夸大为 semantic match；
  - 排除随机 `_id`、时间戳、派生 `origin` 与预期变化的 `img` 后，safe-icon Actor 与 Stage 3H
    无图标 Actor 的完整 JSON 语义投影相等；
  - 本地合成竖幅角色图经正式 image workflow 生成 actor PNG 与 512×512 framed WebP token，
    mock uploader/public verifier 返回 0 warnings；实际查看两张图确认上半身居中、圆框完整、
    透明外缘正常，没有裁掉主体头部；
  - 专项继续覆盖下载失败、上传失败、SSH PowerShell 编码、slug/source-hash crop 优先级、
    crop re-upload、共享图片风险、确认 gate、contact sheet 可读性与 Web server preset 禁用边界。
- 已知债：
  - 未执行真实 SSH 上传或远端公开 URL 读回；这些外部写入需要单独授权/目标与网络状态，
    mock 验收不能替代生产资产发布；
  - token crop candidate 仍只提出候选，人工确认 gate 未被自动化绕过；safe icon fallback 也仍需
    review，不因 package 迁移升级为已人工接受；
  - assets/icons tests 暂留旧路径作为兼容资产，生产代码已受 dependency gate 约束。

### 阶段 4 inventory：module、companion 与 Ops 发布边界

| 单元 | 只读核对结果 | 当前裁决 |
|---|---|---|
| Chat Memory Guard | 运行时只导入包内文件；原根 build script 同时被 Session Monitor 借用 ZIP helper | 第一拆分对象；先消除反向 build 耦合 |
| Session Monitor | Foundry module 与 Windows/Chrome companion 共享 schema；companion 直接读取 module schema；module 的 hash 只依赖 `contracts/hash` | module + companion 保持一个产品，阶段 4B 一起迁移 |
| Monster Spell Resolver | production 仍多处直接导入 `src/core/spell-resolution`；测试还使用 Intake/parser fixtures | 按 ADR 延后，不伪称可独立拆仓 |
| Foundry Ops | Foundry Lab、world audit、production migration 与本地 mirror 管理仍分散；config 仍含仓库路径、SSH target 与远端 data path | 阶段 4C 先收敛权限分级 CLI 和外部配置，不直接复制成新仓库 |

### 阶段 4A：`foundry-modules/chat-memory-guard`

- 结构：
  - 将完整 module source、manifest、双语资源、样式、模板、测试和 build 入口迁入
    `foundry-modules/chat-memory-guard`；
  - 新增自包含 `package.json`、`tsconfig.json` 与 release README；package version 与
    `module.json` version 由测试锁定；
  - 根 `build:*`、`install:*`、`test:*` 命令保留为兼容入口，但直接路由到新 release unit；
  - Bun workspaces、TypeScript、Knip 与 dependency-cruiser 均纳入 `foundry-modules/*`；
  - 新 dependency rule 禁止 Chat Memory Guard 导入 generator、delivery、operator 或兄弟 module
    内部实现；
  - 全仓检查发现 Session Monitor build 曾从旧 Chat Memory Guard builder 借用 ZIP helper；
    已将 archive 能力放回 Session Monitor 产品边界，并增加稳定顺序、确定性与 traversal 拒绝测试。
- 机械：
  - package typecheck、26 个 module tests / 71 expectations、release build 与 frozen workspace
    install 均通过；
  - build 输出固定为 6 个条目：双语资源、manifest、browser bundle、CSS 与设置模板；
  - 迁移前后 5 个静态文件 byte-identical；browser bundle 只因 Bun 保留的源码路径注释从
    `src/foundry/...` 变为 `foundry-modules/...` 而字节不同，去除这些注释后完整 executable
    text 相等；不把 ZIP hash 不同隐藏为 byte-identical；
  - Session Monitor archive 解耦专项 7 tests / 24 expectations 通过，旧/新 build 的 runtime
    bundle 同样只存在构建根路径注释差异；
  - dependency-cruiser 最终：3,416 modules / 3,820 dependencies，0 violations；Knip cycles 为 0；
  - 完整 `ci:verify` 通过：CLI 子进程 12 tests / 57 expectations，coverage 主组
    1,579 tests / 7,452 expectations，合计 1,591 tests / 0 failed / 7,509 expectations；
  - coverage 统计 263 个 production files：85.73% lines / 88.21% functions；
    anti-overfit 333 sources、hygiene 2,081 tracked paths、dnd5e 5.3.3 reference、Web production
    build 与 offline Actor smoke 均通过；
  - 新 release 安装到项目本地 mirror 后逐文件与 build 目录相等；旧 v1.0.0 安装已备份到忽略的
    `.local/foundry-v14/backups/chat-memory-guard/1.0.0-1785496805326`；
  - 使用官方 `git-filter-repo` 源码的本地固定提交
    `d7b75aca907380f608892cc289e616f195427b99`，从 fresh clone 只保留 Chat Memory Guard
    的历史路径并重写为独立仓库根；候选位于忽略的
    `.local/architecture-reorganization/extractions/chat-memory-guard`；
  - 独立候选保留 3 个原项目相关提交，另有 1 个仅属于候选仓库的 lockfile/ignore 提交
    `ae0707e`；`git-filter-repo` 自动移除了 origin，未创建或推送任何远端；
  - 独立候选拥有自己的 `bun.lock`，并重新通过 `bun install --frozen-lockfile`、package
    typecheck、26 tests / 71 expectations 与 6 文件 release build；构建后 Git 工作区保持干净；
  - 独立候选与主 workspace release 的文件集合一致，5 个静态文件 byte-identical；browser
    bundle 仅有 `foundry-modules/chat-memory-guard/src/...` 与 `src/...` 源路径注释差异，去除
    7 条注释后 executable text 长度均为 22,953 且逐字相等。
- 语义：
  - 使用本地 Foundry 14.364、dnd5e 5.3.3、`cor-cotn` copied world 与无密码普通玩家 `SY`
    完成真实运行时验收；未访问生产服务器；
  - module `1.0.0` 在首次加载和页面重载后均 active，`getStats()` API 可用，listener count 为 1，
    browser console 无 warning/error，服务端启动/加载日志无本模块错误；
  - Foundry 14.364 本地源码
    `.local/foundry-v14/app/14.364/common/packages/base-package.mjs` 证明 v14 `styles` 是
    `{src, layer?}` schema；运行时确认 module CSS 已进入 Foundry 聚合 `@import`；
  - 向上阅读历史时渲染聊天卡由 25 增至 49，`atBottom=false`、`trimmedMessages=0`；
    回到底部后收敛到 40，`trimmedMessages=9`、pending 为 0；
  - 整个 A/B 前后 `game.messages.size` 均为 552，证明本次裁剪未删除 ChatMessage 文档；
  - 当前 `SY` 有效设置为 hidden avatar；收敛后的 40/40 卡片均保留 sender，头像 media 节点为 0，
    模块 thumbnail cache 为 0；
  - 重载后 module、API、CSS、默认上限与 552 条 ChatMessage 均保持；测试只改变当前客户端滚动/
    DOM 状态，没有创建聊天消息、修改世界设置或写入生产数据。
- 边界：
  - 物理迁移没有升级历史长时间跑团或完整第三方聊天卡支持声明；
  - 主仓库内的 workspace release 与 fresh-clone 本地历史候选均已形成；新 remote 与对外发布
    尚未授权或执行，不能把本检查点称为已发布远端仓库；
  - 本地 Foundry server-mirror 验收后已安全停止，30001 端口释放。

### 阶段 4B：`foundry-modules/session-monitor`

- 结构：
  - 将 Foundry browser module、schema v1、IndexedDB、GM UI、Windows/Chrome companion、
    report generator、测试、build、installer 与 runbook 一起迁入
    `foundry-modules/session-monitor`，没有把 module 与 companion 拆成两个发布物；
  - 新增自包含 `package.json` 与 `tsconfig.json`；package、module 和 companion 产品版本统一锁定为
    `1.1.1`，根 build/install/test/monitor 命令保留为兼容 wrapper；
  - companion 与 module 共享本产品 schema；唯一上游运行时依赖收敛为
    `@fvtt-json-generator/contracts/hash`，不再穿过 spell-resolution 私有实现；
  - dependency-cruiser 新增独立 release 与 contract surface 门禁；Knip、Bun workspace 和根
    typecheck 同步覆盖新边界；
  - 中文 runbook 明确专用 Chrome、CDP/Windows 读取范围、本地 `.local/` profile/evidence、
    可配置参数、GM 正常登录、项目 mirror 安装和生产单独授权边界。
- 机械：
  - package-local typecheck、19 tests / 71 expectations、build，以及根
    `typecheck:foundry-modules`、focused suite、build 均通过；
  - 提交前审计发现命令识别曾把任意值为 `report` 的 option 误当 report 子命令；parser 现先跳过
    有值 options，再识别 wrapper 后的位置子命令，并由 root-wrapper/report-path 回归测试锁定；
  - dependency-cruiser 最终为 3,536 modules / 3,829 dependencies / 0 violations；
    Knip cycles 为 0；
  - 完整 `ci:verify` 通过：独立 build subprocess 1 test / 1 expectation、CLI 子进程
    12 tests / 57 expectations、coverage 主组 1,582 tests / 7,462 expectations，合计
    1,595 tests / 0 failed / 7,520 expectations；
    coverage 统计 264 个 production files：85.55% lines / 88.11% functions；anti-overfit
    321 sources、hygiene 2,090 tracked paths、dnd5e 5.3.3 reference、Web production build
    与 offline Actor smoke 均通过；
  - 迁移前后 release file set 均为 5 项；4 个静态文件 byte-identical；browser bundle 仅有 6 条
    Bun source-path 注释变化，移除这些注释后 executable text 均为 38,531 字符且逐字相等；
    最终 builder 显式规范化并逐一计数这 6 条标签，因此根 wrapper 与 package-local build 现在
    生成 byte-identical ZIP；
  - 最终 build ZIP SHA-256 为
    `044EEEE98566B7ABEFCF0B6E3B145C24D02AF6051BB9AFD1D26E86FC7DDE1B04`；
    安装到项目本地 mirror 后 5 个文件及逐文件 hash 完全等于 build；旧 1.1.0 安装备份在
    `.local/foundry-v14/backups/fvtt-session-monitor/1.1.0-1785498376448`，规范化前的 1.1.1
    安装备份在 `.local/foundry-v14/backups/fvtt-session-monitor/1.1.1-1785499480257`；
  - 第一次把双 Bun build 子进程放进 coverage 进程时，全部断言结束后 Bun 1.3.8 在 shutdown
    阶段 internal assertion、exit 3；该轮没有记为通过。最终 CI 将跨入口制品测试作为独立门禁，
    coverage 精确过滤同一 suite，随后整条命令稳定 exit 0。
- 语义：
  - 使用普通 Foundry UI 在本地 Foundry 14.364 / dnd5e 5.3.3 的 disposable
    `fvtt-v14-module-matrix` 世界仅启用 Session Monitor；明确取消可选 MIDI-QOL 与
    Sequencer，确认 module 1.1.1 active、8 个 API 方法和 GM panel；
  - 完成“开始 → 刚才卡顿 → 停止并导出”UI 烟雾：同一 session 最终 4 个 browser samples，
    事件包含 start、2 个 capability gaps、jank marker 和 stop，errors 为 0；API/IndexedDB
    导出不含 `worldKey` 或 raw aliases。浏览器 download event listener 超时，故没有把下载事件
    本身记为已观察；停止状态、最终导出对象与面板状态由独立路径确认；
  - 真实 companion `runRecord` 启动自己的 dedicated headless Chrome，与本地 module 完成握手；
    session `a9319c13-55ca-460f-a792-e8dd1f50f7c8` 产生 2 个 browser samples、2 个 companion
    samples、100% coverage、独立 browser/GPU/renderer/network/storage 信号、0 gaps、0 errors；
  - 人工阅读报告确认 JS heap `84.9 -> 86.3 MiB`、renderer private
    `476.4 -> 477.0 MiB`、frame p95/max `7.0/7.1 ms`、Long Tasks 0；隐私复核没有发现
    world key、raw Scene/Combat identity、GM 名称或用户 ID。`cookies`/`passwords` 仅存在于
    `privacy.forbiddenContent` 声明，不是采样值；
  - 验收后通过正常 module management 恢复原四个 active modules，仅保留已安装但 disabled 的
    Session Monitor；默认世界恢复为 `cor-cotn`，本地 server 停止，30001 释放，companion
    Chrome 全部退出。
- 边界：
  - 本次只访问项目本地 mirror，没有访问、修改或重启生产服务器；
  - package 迁移没有关闭 `MON-001`，也没有替代生产 1.1.1 post-restart UI smoke、四小时真实
    跑团与非 GM 设备证据；
  - 用户明确规定：任何超过 30 分钟的 Chrome/Foundry/Session Monitor 持续监测均不得由代理
    启动、等待、轮询或用多个短测试拼接代替；四小时验收只在用户真实跑团时由用户亲自运行，
    代理只做事前检查和事后证据分析；
  - 阶段 4B 的 workspace release、协议/依赖/权限边界与本地端到端握手均已满足。计划没有要求
    这一单元在本阶段做 fresh-history extraction，因此未创建本地候选仓库、远端或发布。

### 阶段 4C.1：Foundry Ops 权限和配置边界

- 新建 `tools/foundry-ops` 私有 Bun workspace，提供 `bun run foundry:ops` 中文统一入口和
  `catalog` 权限清单；旧 `bun run foundry:lab ...` 继续可用，但先经过同一权限检查再转给旧实现；
- 命令同时记录目标（本地或生产）、影响（只读、本地修改、生产修改）、owner 和是否可执行；
  生产修改只作为 `runbook-only` 分类存在，统一 CLI 故意不提供执行路由；
- 生产 `inventory` 和可能读取 server-only 包的 `acquire` 被明确归为 production read；实际执行必须
  同时带 `--apply`、`--allow-production-read`，并从 `FVTT_OPS_PRODUCTION_*` 外部配置读取 SSH
  target、data path 和 identity。仓库中的具体 SSH target、IP 和生产 data path 已移除；
- world audit 与两个历史 production migration 脚本都只处理本地/离线副本，因此归为 local mutation，
  不再因名称被误解为会修改线上服务器；
- `scripts/foundry-lab/config.ts` 变成兼容 adapter；权威配置、路径安全和生产连接 fail-closed 检查位于
  `tools/foundry-ops/src/config.ts`。lab/evidence/backup/Foundry ZIP/default world root 均可由外部变量配置；
- dependency-cruiser 禁止 Foundry Ops 直接导入 generator、Web、Foundry module 或旧 operator 私有实现；
  当前统一 CLI 只通过明确的 CLI entrypoint contract 路由旧实现；
- open finding owner 保持不变：`BH-ACT-003`、`SEQ-MEM-001`、`WORLD-ASSET-001` 属于 Foundry Ops，
  `MON-001` 属于 Session Monitor，`SPELL-002/003` 属于 Monster Spell Resolver；目录整理不关闭任何 finding；
- 机械验证：新权限/路由/config tests 与全部 Foundry Lab、world audit、离线 migration tests 合计
  290 tests / 2,225 expectations；production/all/tools typecheck、dependency-cruiser、Knip cycles 与
  `git diff --check` 通过；完整 `ci:verify` 也通过，三组测试合计 1,607 tests / 7,642 expectations，
  production coverage 为 85.54% lines / 88.09% functions；
- 语义复核：中文帮助和 README 清楚解释每类工具实际做什么；生产只读缺少单独授权或外部配置时在
  建立连接前失败；离线迁移明确不宣称线上修改。整个阶段没有启动 Foundry/Chrome、没有连接生产、
  没有运行任何长时间监测；
- 下一批才物理迁移 `scripts/foundry-lab`、world audit 和离线 migration 的实现及测试。路径安全函数有
  39 个直接调用点并被影响分析评为 critical，因此下一批必须小批移动、每批跑完整 Foundry Ops suite，
  不在当前稳定检查点继续扩大改动。

### 阶段 4C.2：Foundry Ops 实现和测试物理迁移

- 按公共基础、本地工具、生产只读、统一入口、world audit/离线 migration 五个小组完成物理迁移；
  `config`、类型、子进程封装、Foundry Lab 实现、停止世界快照、隐私安全审计报告、三方世界比较和
  离线候选构建现在都由 `tools/foundry-ops` 拥有；
- `scripts/foundry-lab` 与 `src/tools/world-audit`、`src/tools/production-migration`、三个历史工具入口
  只保留兼容 adapter；旧 `scripts/foundry-lab/cli.ts` 会先进入统一权限边界，再执行新实现；
- Monster Spell Resolver 的本地 build/install/world-preparation 集成没有被错误搬入 Foundry Ops。
  `spellResolver.ts` 和专用 CLI 暂留兼容目录，通过统一权限入口调用，物理迁移归阶段 4D；
- classpack v14 runtime 资源与实现一起迁入产品目录，并由 `import.meta.url` 定位，不再依赖仓库根字符串；
  Knip 明确忽略该 Foundry runtime-only `.mjs` 的 `/modules/dae/...` 绝对导入，专属 13 项测试继续验证其内容；
- 每个小组迁移后都运行完整 Foundry Ops suite。最终为 292 tests / 2,231 expectations；其中新增
  deferred spell-resolver 路由测试与旧/new world-audit、离线 migration 函数 identity 测试；
- 第一次把生产只读小组紧接 dependency-cruiser 后运行完整 suite 时，`remoteInventory` 的无 SSH
  子进程测试一次超过 5 秒；同一测试单独复跑为 12/12，随后完整 suite 两次通过，最终耗时约 22 秒，
  未复现为权限或实现回归；
- 机械验证：frozen install 无变化；production/all/packages/apps/foundry-modules/tools 类型检查通过；
  dependency-cruiser 为 3,685 modules / 3,877 dependencies、0 violations；Knip cycles 为 0；
  unused report 不再含本次 Foundry Ops 路径，保留原有 report-only 候选；`git diff --check` 通过；
  完整 `ci:verify` 通过，Session Monitor build 1 test / 1 expectation、CLI 12 / 57、instrumented
  1,596 / 7,590，合计 1,609 tests / 7,648 expectations。production coverage 为 85.53% lines /
  88.04% functions；anti-overfit 321 sources、hygiene 2,101 tracked paths、dnd5e 5.3.3 reference、
  Web production build 和 offline Actor smoke 均通过；
- 语义验收：人工阅读中文 help/catalog/README；新旧 `bootstrap` 默认 dry-run 均返回同一 17 项
  `planned` 计划且没有写入；生产 inventory 带 `--apply` 但缺少 `--allow-production-read` 时在联网前
  exit 1；world audit 与 migration 命令继续明确为本地/离线修改；
- 本阶段没有启动 Foundry、Chrome 或真实 Session Monitor，没有连接生产，没有运行超过 30 分钟的
  监测，也没有改变任何 hardening finding、support matrix 或生产部署状态。

### 2026-07-31：阶段 5A Foundry Lab 注册资产只读清单

- 在 Foundry Ops 内新增独立的资产分类核心、文件系统扫描适配器和报告输出层；统一入口为
  `bun run foundry:ops assets inventory --hash-concurrency=4`；
- 分类固定为 app binaries、modules、systems、worlds、backups、evidence、archives 与
  scratch/cache。world 和 backup 一律标记为 critical / not-assumed-rebuildable；evidence 与 archive
  默认 preserve；cache 即使可重建也只标记 review-before-removal，不生成自动删除决定；
- 每个普通文件记录相对路径、字节数、SHA-256、mtime 和 filesystem atime；根 digest 由排序后的
  `path + bytes + hash` 计算。模块、系统和世界读取顶层 package manifest 的 ID、版本及公开 HTTP(S)
  来源，本地 file URL 不写入报告；
- 输出使用新 timestamp 目录和 exclusive create，不覆盖旧报告；不跟随 symlink/junction；凭据、认证
  cookie 和 profile `Config` 显式排除；默认输出位于忽略的
  `.local/foundry-v14/inventory/asset-inventory/<timestamp>/`；
- 第一次真实扫描读取 180,754 files / 85,894,981,998 bytes，因
  `evidence/cor-cotn-world-audit-20260724/node_modules` 是指向 Codex 共享依赖缓存的 Windows junction，
  正确返回 `complete: false` / exit 1。只读核实 target 后，将这一个非证据依赖 junction 写入显式
  policy exclusion，没有放宽链接安全规则；
- 第二次真实扫描位于
  `.local/foundry-v14/inventory/asset-inventory/2026-07-31T14-04-11-949Z`，返回 exit 0、
  `complete: true`、180,754 files、85,894,981,998 bytes、0 issues；两次所有注册根的 file count、
  bytes 与 root SHA-256 完全一致；
- 八类实物为：app binaries 21,153 files / 339.6 MiB；modules 56,297 / 22.7 GiB；systems
  2,874 / 258.0 MiB；worlds 1,928 / 640.2 MiB；backups 12,334 / 3.00 GiB；evidence
  70,649 / 47.2 GiB；archives 1,109 / 3.13 GiB；scratch/cache 14,410 / 2.75 GiB；所有
  module/system/world 顶层 manifest 均可解析；
- 精确重复报告为 21,258 groups / 125,706 file locations / 50.7 GiB theoretical duplicate bytes，
  其中 18,739 组跨类别。最大组包含 13 份相同的 `MapImageOptimizer.exe`，约 1.94 GiB 理论重复量；
  其余大组大量横跨 world snapshot、backup、evidence 和 archive。这里只证明字节相同，不能据此删除；
- 内部一致性复核重新计算八个 category manifest 的所有 root digest，检查 180,754 个文件 hash 格式，
  并确认 21,258 个重复组的每个 location 均能回指 manifest，全部通过；
- Foundry Ops 完整 suite 为 298 tests / 2,262 expectations；production/all/packages/apps/modules/tools
  类型检查通过；dependency-cruiser 为 3,691 modules / 3,893 dependencies、0 violations，Knip cycles
  为 0，新增 inventory 路径没有进入 unused report；
- 最终 `ci:verify` 通过：Session Monitor build 1 test / 1 expectation、CLI 12 / 57、instrumented
  1,602 / 7,621，合计 1,615 tests / 7,679 expectations；production coverage 为 85.50% lines /
  88.03% functions，anti-overfit 321 sources、hygiene 2,131 tracked paths、dnd5e 5.3.3 reference、
  Web production build 与 offline Actor smoke 均通过；CI 输出中的 Session Monitor 等待文字来自隔离的
  临时目录 build subprocess 测试，不是真实 Chrome/Foundry 长时运行；
- 发现但未在本批修复：`FVTT_OPS_BACKUP_ROOT` 默认解析到不存在的 `evidence/backups`，而实际约 3 GiB
  备份由 module build 等流程写在 `.local/foundry-v14/backups`；需在下一批核对配置 owner 后统一；
- 本批注册范围覆盖 Foundry Lab 和 legacy world archive，尚未把 `.local/8080`、`rr-*`、
  `gstack-source`、`.local/references`、多个浏览器 profile/工具源码缓存等剩余约 8 GiB 从名称直接猜成
  cache 或 evidence；下一批必须逐根确认 producer/consumer/敏感性后再纳入；
- 全程没有连接生产、启动 Foundry/Chrome、执行长时间监测、复制/移动/删除运行数据，也没有关闭
  `WORLD-ASSET-001` 或其他 hardening finding。

### 2026-07-31：阶段 5B `.local` 全范围登记与备份根目录统一

- 新增 `bun run foundry:ops assets scope`。分类 policy、文件系统元数据扫描和机器 JSON/中文报告输出继续分层；
  顶层出现任何未登记文件或目录时 `coverageComplete: false` / exit 1，不会因名称相似自动归类；
- 隐私条目强制使用 top-level metadata：Chrome profile、Session Monitor profile、OAuth 相关目录、认证
  cookie、浏览器/MCP bridge 和屏幕截图均不递归、不读取正文、不计算 hash。普通非隐私目录只统计元数据，
  不读正文；`.local/foundry-v14` 复用阶段 5A 已验收清单中 `$FVTT_OPS_LAB_ROOT` 内注册根的检查点；
- 人工复核推翻了第一次机械成功：最初直接使用阶段 5A category totals，错误地把单独顶层登记的
  `cor-cotn.7z` 也算进 `foundry-v14`。实现现按 root `displayPath` 过滤，回归测试锁定外部 root 不得混入；
  最终 `foundry-v14` 检查点为 180,753 files / 84,246,439,023 bytes，`cor-cotn.7z` 单独为
  1,648,542,975 bytes；
- 最终真实报告位于
  `.local/foundry-v14/inventory/scope-coverage/2026-07-31T14-39-32-176Z/`：当前 52 个 `.local`
  顶层条目全部有声明，29 个已分类、20 个隐私排除、3 个待人工判断，unexpected 0、missing declaration 0、
  measurement issue 0；`coverageComplete: true`、`measurementComplete: true`，但因待判断项存在，
  `classificationComplete: false`；
- 三个待判断项保留明确保护：`.local/8080` 是 2,284 files / 3.29 GiB 的完整世界目录加 ZIP，来源、
  canonical copy 和消费者未证实，标记 critical；`.local/map` 是 4 个地图/遮罩/UVTT 文件，无法证明是
  输入、交付还是 scratch，标记 preserve；`.local/tools` 混合 Auto-Wall 与 git-filter-repo 源码，未找到
  durable consumer，保持 review-before-removal。三者都不是本批 blocker，也绝不是删除候选；
- `.local/references` 由 tracked manifest/REFERENCE_INDEX/bootstrap 证明为可重新获取的版本参考缓存；
  `rr-20260728-220757` 由生产迁移报告证明为唯一通过的本地恢复演练；`intake-runs`、final verification、
  resolver/icon/diagnostic 等由现有验收记录证明为 evidence；公开 gstack clone 与覆盖率复现输出和证据分开；
- 接受前检查发现 `rr-20260728-220757` 内有 95 个链接/联接点；扫描器现在规定普通递归目录只要跳过链接
  就必须把计量判为不完整。该恢复演练根改为只登记顶层并引用既有 runbook，不再用不完整遍历伪装当前体积；
- `FVTT_OPS_BACKUP_ROOT` 默认值由不存在的 `evidence/backups` 修正为实际 owner 使用的
  `FVTT_OPS_LAB_ROOT/backups`；显式外部 override 不变，README 与 config test 同步锁定；
- 机械验证：聚焦 scope/config/route/CLI tests 通过；Foundry Ops 完整 suite 为 306 tests / 2,292
  expectations；production/all/packages/apps/modules/tools 类型检查通过；dependency-cruiser 为 3,697
  modules / 3,910 dependencies、0 violations，Knip cycles 为 0；最终 `ci:verify` 的 Session Monitor build
  1 / 1、CLI 12 / 57、instrumented 1,610 / 7,651，合计 1,623 tests / 7,709 expectations；production
  coverage 85.54% lines / 88.02% functions，anti-overfit 321 sources、hygiene 2,143 tracked paths、locked
  dnd5e 5.3.3 reference、Web build 与 offline Actor smoke 全部通过；
- 语义验收：人工阅读最终中文报告，确认“范围完整”和“所有权全部解决”被明确分开，三项未知来源没有被
  猜成 cache，world/recovery/evidence 仍保持高保护，隐私报告没有内部文件名或 token-pattern 命中；CI 中
  Session Monitor 等待文字仍来自隔离临时目录的 subprocess 测试，不是真实 Chrome/Foundry 长时运行；
- 本阶段没有连接生产、启动 Foundry/Chrome、运行长时监测、复制/移动/删除任何 `.local` 数据，也没有
  改变 `WORLD-ASSET-001` 或其他 hardening finding 状态。

### 2026-07-31：阶段 5C.1 外置迁移只读方案与独立 reference cache root

- 新增 `bun run foundry:ops assets migration-plan`。该入口只读取最近一份 `complete: true` 的资产清单并
  写 JSON/中文方案，代码中没有复制、移动、删除、切换或启动 Foundry 的执行路径；没有目标时状态固定为
  `target-required`，提供目标也只可能到 `ready-for-copy-authorization`，`copyAuthorized` 和
  `deletionAuthorized` 永远为 `false`；
- 目标安全门禁拒绝磁盘根、仓库内部、当前 lab 内部/父目录、链接或 junction；已存在非空目录只生成
  `target-not-empty` 报告，不改变其中内容。缺失的外部目标只做路径校验，不会被命令创建；
- 方案按“世界与备份、证据与归档、程序/模组/系统、可重建缓存”四批组织。每个根都保留来源清单中的
  file count、bytes 和 root SHA-256；明确规定将来只能按完整 category manifest 复制，并继续排除隐私、
  链接、未登记内容和单独的 `cor-cotn.7z`；每批都必须重新盘点并精确对账；
- 最新真实计划位于
  `.local/foundry-v14/inventory/migration-plans/2026-07-31T15-01-39-258Z/`。它从 2026-07-31T14-04-11-949Z
  已验收清单解析 20 个 lab 内注册根、180,753 files / 84,246,439,023 bytes；四批汇总与来源总数、字节数
  完全相等，状态为 `target-required`。人工阅读确认中文报告没有残留英文批次说明，明确写有兼容窗口、
  回滚、恢复抽样、无长时监测以及复制/删除均未授权；
- 新增独立 `FVTT_REFERENCE_CACHE_ROOT`。tracked `references/reference-cache-manifest.json` 继续保留
  `.local/references/...` 逻辑标识，reference verify/bootstrap/index 工具会把该前缀安全映射到配置根；
  绝对、逃逸、磁盘/仓库根和链接路径被拒绝。生成目标 metadata 也可通过纯参数投影到外置根，不让核心
  package 读取进程环境；v12/v13 tracked reference 路径保持不变；
- 默认旧路径真实 `references verify` 仍返回 dnd5e 5.3.3 `ok`；外置 bootstrap dry-run 只报告
  `Planned: dnd5e-5.3.3 / Installed: none`，确认没有创建外部目录；fixture 还覆盖外置 verify 和 index
  输出不写回仓库 `.local/references`；
- 机械验证：聚焦 31 tests / 200 expectations；Foundry Ops 310 / 2,314；production/all/packages/apps/
  foundry-modules/tools typecheck、dependency-cruiser 3,702 modules / 3,920 dependencies、0 violations、
  Knip cycles 与 diff check 通过。完整 `ci:verify` 通过：Session Monitor build 1 / 1、CLI 12 / 57、
  instrumented 1,618 / 7,684，合计 1,631 tests / 7,742 expectations；production coverage 85.52% lines /
  88.04% functions，anti-overfit 322 sources、hygiene 2,143 tracked paths、locked reference、Web build 与
  offline Actor smoke 全部通过。随后只增加“显式 reference cache 必须位于仓库外”的安全检查和 1 个
  聚焦测试；该最终代码的 typecheck、聚焦测试和 diff check 通过，dependency-cruiser 更新为 3,702 /
  3,921、0 violations；但最终完整 CI 复跑不能记为通过：与本改动无调用关系的 2 个 crawl 测试和 2 个
  Web crawl job 测试在机器高负载下超时，instrumented 为 1,615 pass / 4 fail / 7,672 expectations。
  单独复跑两个 core crawl 测试分别通过 1 / 8 和 1 / 7；两个 Web 测试仍因内部约 1.5 秒 job 等待窗超时。
  同时只读诊断发现一个早于本轮验证启动、来源不明的 `bun -` 进程持续占用约 2.3 GiB 和大量 CPU；未获
  授权，未终止该用户进程，也没有修改无关测试来掩盖环境抖动。因此当前 tip 的“完整 CI 最终复跑”保持
  未通过记录，前一轮通过只证明最后一条安全检查之前的完整状态；
- 语义边界：本阶段只完成“如何安全迁移”的可审阅方案和 reference cache 配置，不宣称已经迁移 78.5 GiB，
  也不宣称所有 Foundry 邻接消费者已经能从新 root 运行。审计仍发现 Session Monitor/Chat Memory Guard
  installer、Session Monitor companion、icon catalog/review、world audit、classpack 与 Monster Spell Resolver
  的旧布局约束；这些必须在下一小批逐个改成显式根并跑原有安全测试后，才能满足“所有当前工具可从新 root
  解析相同资源”的阶段机械标准；
- 3 个 scope pending（`8080`、`map`、`tools`）仍留在原处且不进入 Foundry root；没有连接生产、启动
  Foundry/Chrome、运行长时监测或复制/移动/删除任何运行数据。`WORLD-ASSET-001` 保持 `in_progress`，
  恢复抽样、实际迁移和旧路径退役仍未完成。

### 2026-08-01：阶段 5C.1 当前提交验证刷新

- 复查确认前一日来源不明、约占 2.3 GiB 且持续高 CPU 的 `bun -` 进程已经不存在；分支仍为
  `codex/architecture-reorganization-20260731` @ `4df2999`，工作树只保留既有 ExecPlan 修改和未跟踪图片；
- 前一日因负载超时的两个 Web crawl job 测试先单独复跑，分别约 0.75 秒和 0.64 秒完成，2 tests /
  14 expectations 全部通过，证明失败是当时机器负载下的时间窗抖动，不是 Stage 5C.1 行为回归；
- 当前提交的完整 `ci:verify` 随后 exit 0：Session Monitor build 1 / 1、CLI 12 / 57、instrumented
  1,620 / 7,688，合计 1,633 tests / 7,746 expectations，0 failures；dependency-cruiser 3,702 modules /
  3,921 dependencies、0 violations；production coverage 85.53% lines / 88.05% functions；anti-overfit
  322 sources、hygiene 2,148 tracked paths、dnd5e 5.3.3 reference、Web build 和 offline Actor smoke 全部通过；
- 因此阶段 5C.1 的当前-tip 机械验证现已补齐为通过。前一日失败记录保留作为测试环境诊断历史，但不再是
  当前阻塞；没有为此终止用户进程、放宽测试、修改爬虫实现或接触生产/Foundry/Chrome。

### 2026-08-01：阶段 5C.2 第一批外置 root 消费者适配

- Session Monitor 和 Chat Memory Guard 继续保持互不依赖的发布边界，但两个 installer 现在都在 CLI 边缘读取
  `FVTT_OPS_LAB_ROOT` / `FVTT_OPS_BACKUP_ROOT`。默认值仍是仓库内 `.local/foundry-v14`；配置外置根后只把
  destination 和 backup 投影到相同相对目录，安装目标仍必须精确等于该产品的配置后 module 目录；磁盘根或
  仓库根继续被拒绝；
- Session Monitor 产品内新增薄路径层，由 module installer 和 companion 共用。companion 的默认 evidence
  现在跟随 `FVTT_OPS_EVIDENCE_ROOT`（未配置时跟随 lab root），显式 `--output-root` 仍优先；专用 Chrome
  profile 刻意保留在 `.local/fvtt-session-monitor/chrome-profile`，因为它是隐私排除项而不是可迁移 Foundry
  lab 资产；两个 installer 还会在写入前拒绝路径组成中的 symbolic link / junction / reparse point，避免
  “词法目标正确、物理目标越界”；
- v14 icon catalog 的 Compendium 输入、core icon 和 dnd5e icon 读取根会跟随 lab/evidence 配置；生成的
  tracked `references/foundry-v14-icons/catalog.json` 仍留在仓库。icon review gallery 使用同一外置 lab 约定
  解析逻辑路径，不复制 artwork；显式 report/output 参数保持不变；
- 聚焦 fixture 通过 18 tests / 56 expectations，覆盖默认路径不变、外置路径保持相同相对资源、显式参数优先、
  宽泛 root 拒绝、错误配置不会被默认配置接受，以及两个 owned module 真正在临时外置目录完成安装；模块完整
  suite 另外通过 Session Monitor 23 / 83 和 Chat Memory Guard 28 / 80，图标聚焦套件 5 / 18；
- dependency-cruiser 通过 3,705 modules / 3,925 dependencies、0 violations，Knip cycles、modules/tools
  typecheck 和 diff check 通过。最终 `ci:verify` exit 0：Session Monitor build 1 / 1、CLI 12 / 57、
  instrumented 1,629 / 7,719，合计 1,642 tests / 7,777 expectations、0 failures；production coverage
  85.63% lines / 88.14% functions；anti-overfit 323 sources、hygiene 2,148 tracked paths、dnd5e 5.3.3
  reference、Web build 与 offline Actor smoke 全部通过；
- 完整 Session Monitor suite/CI 自带一个约 3 秒的临时专用 Chrome restart smoke；它使用临时目录和伪造
  session，不连接真实 Foundry，不是持续监测。没有连接生产、启动真实 Foundry、选择或创建迁移目标、复制/
  移动/切换/删除 runtime 数据，也没有执行任何超过 30 分钟或四小时验收；
- 人工语义复核确认：旧默认命令仍解析到原资源；外置配置只改变 runtime/evidence/backup 物理根，不改变产品
  发布边界、module ID、报告逻辑路径、tracked catalog 输出或 installer 的 owned-module/精确目标保护。
  `MON-001` 和 `WORLD-ASSET-001` 状态不变，长期真实验收仍由用户运行。

### 2026-08-01：阶段 5C.3 第二批外置 root 消费者适配

- 新增 Foundry Lab 的“精确配置路径”公共检查：调用方声明资源相对 lab root 的固定位置，检查器同时确认最终
  绝对路径完全相等且没有经由 symbolic link / junction / reparse point 越界。它不是放宽安全范围，而是把
  原来“必须位于仓库内 `.local/foundry-v14`”改成“必须位于当前显式配置的 lab root”；
- World Footprint Audit（读取本地世界副本并生成体积/内容审计证据）不再由 `package.json` 写死四个旧路径。
  无参数命令现在从 `FVTT_OPS_LAB_ROOT` 和 `FVTT_OPS_EVIDENCE_ROOT` 推导同一 `cor-cotn` 世界、Foundry
  14.364 应用和证据目录；显式 CLI 参数仍保留，世界 ID、Foundry 版本、dnd5e 5.3.3、同一 lab root、
  输出不得落入源世界等原门禁不变；
- dnd5e Classpack v14 工具（只为该模块准备本地 v14 兼容文件，并只修改一次性测试世界的启用状态）现在统一
  从配置投影 module、manifest、macro、runtime、ClassicLevel 和一次性世界路径。审查还发现 runtime 源文件
  的仓库归属断言仍指向迁移前旧目录；已修正为实际的 `tools/foundry-ops/src/lab/assets`，源码继续固定在仓库，
  只有运行副本随 lab root 移动；
- Monster Spell Resolver（构建、安装、校验、卸载本项目的法术解析模块，并为一次性测试世界准备启用设置）
  的安装目录、临时安装目录、Foundry/dnd5e 运行时、ClassicLevel 和一次性世界均改为精确配置路径。构建产物
  仍固定在仓库 `dist`，备份仍固定在 evidence/backup root；原有外来模块占位拒绝、安装前后 hash、原版本
  可恢复备份、失败隔离、LevelDB 停服锁和一次性世界限制全部保留；
- 审计时额外发现 Package Acquisition（把校验过的模块包和 dnd5e 系统装进两个本地测试环境）仍先生成旧
  `.local` 目标，再从仓库根拼接。现在 action 在组成阶段就接收 server-mirror 的配置后 modules root，执行
  阶段直接使用该绝对目标；没有配置就不能凭隐藏默认值生成安装计划。临时外置 fixture 真实完成一个 module
  和两个 dnd5e system 的事务安装，确认没有写回仓库；
- 聚焦验证通过 92 tests / 981 expectations；Foundry Ops 完整 suite 通过 315 / 2,340；tools 与全仓
  TypeScript 检查、diff check、Knip cycles 通过，dependency-cruiser 为 3,705 modules / 3,928 dependencies、
  0 violations。第一次完整 CI 在测试执行前发现新增测试对可选 dry-run 字段的直接读取，已改为安全访问且仍
  要求值严格为 `true`；修正后完整 `ci:verify` exit 0：Session Monitor build 1 / 1、CLI 12 / 57、
  instrumented 1,634 / 7,745，合计 1,647 tests / 7,803 expectations、0 failures；production coverage
  85.65% lines / 88.15% functions，anti-overfit 323 sources、hygiene 2,151 tracked paths、dnd5e 5.3.3
  reference、Web production build 与 offline Actor smoke 全部通过；
- 人工语义复核确认：四个消费者的旧默认路径仍指向原资源；配置外置根只改变运行数据和证据的物理位置，
  不改变世界/module ID、锁定版本、仓库源码/build 归属、事务安装/回滚语义或生产权限。适配文件中已无
  `.local/foundry-v14` 硬编码；仍指向仓库 `docs/acceptance` 的诊断/对账报告属于 tracked 文档输出，不是
  待迁移的 runtime consumer；
- 全程没有连接生产、启动真实 Foundry/Chrome、创建迁移目标、复制/移动/切换/删除真实 runtime 数据，也没有
  执行 30 分钟或四小时验收。CI 中只有使用临时目录和伪 session 的几秒钟 Chrome restart smoke。
  `MON-001` 与 `WORLD-ASSET-001` 状态不变；本阶段完成的是“已识别消费者可从外置根解析同一资源”的代码和
  fixture 验收，不是 78.5 GiB 实际迁移或真实运行验收。

### 2026-08-01：阶段 5C.4 真实 Foundry Lab 外置迁移与短时运行验收

- 用户明确授权选择/创建外置目标、复制约 78.5 GiB 的真实 Foundry Lab、切换配置、移动或删除旧目录、短时
  启动真实本地 Foundry，并允许严格只读的生产连接；用户此前规定的四小时或超过 30 分钟 Chrome/Foundry
  持续监测仍禁止由代理执行。本轮因此没有启动任何长期监测；
- 只读容量检查在 C–I 盘中选择 NTFS 的 `F:\FoundryLab\foundry-v14`，创建独立控制目录
  `F:\FoundryLab\migration-control\2026-08-01-stage5c4`。F 盘迁移前约有 341.6 GiB 可用；目标不在仓库、
  不是磁盘根、不是链接/联接路径，与 I 盘源目录不同卷；
- 迁移前重新运行资产清单。源报告
  `.local/foundry-v14/inventory/asset-inventory/2026-07-31T17-47-59-018Z/` 完整扫描 180,768 个文件、
  85,895,304,914 bytes、21,258 个精确重复组和 0 个问题；相较上一快照只有 inventory provenance 因新增
  报告增长，全部业务/运行数据根以及单独登记的 `cor-cotn.7z` 都未漂移。冻结计划
  `.local/foundry-v14/inventory/migration-plans/2026-07-31T17-54-12-088Z/` 将 lab 内 19 个根、180,767 个
  文件、84,246,761,939 bytes 分四批复制；仓库 `.local/cor-cotn.7z` 仍是单独根，不属于本次目录退役目标；
- copy-first 执行按冻结 manifest 逐文件复制，拒绝链接并为每个根重算 file count、bytes 与 SHA-256。
  第一次在 `foundry-evidence` 遇到父根清单刻意排除两个独立登记嵌套备份根而物理遍历多 200 个文件；执行
  安全停止，未切换或删除源。验证器随后只排除已独立完成验证的嵌套根，并增加原子进度续跑；最终四批、19 根
  全部完成。目标端独立全量报告位于
  `F:\FoundryLab\foundry-v14\inventory\asset-inventory\2026-07-31T18-55-41-934Z\`：两端 19 个计划根的
  file count、bytes、root SHA-256 全部逐项相同，complete 均为 true，0 个 root issue；
- 恢复抽样使用真实生产世界备份
  `backups/production/fvtt-production/8080/cor-cotn`，复制到控制目录而不接触 active worlds。Robocopy 曾对
  临时占用文件重试，但最终返回成功；源与恢复样本均为 2,505 个文件、1,795,088,065 bytes，逐文件路径、
  长度和 SHA-256 清单完全相同，manifest SHA-256 均为
  `748614368b2286fe9bd366c4638e2ef563d9f969264ee6da3c70e51b4ef1a5d4`；报告为
  `F:\FoundryLab\migration-control\2026-08-01-stage5c4\recovery-sample-report.json`，样本继续保留；
- 常规资产清单为防泄密故意排除了两个 profile 的 `Config` 和 lab `credentials`。删除旧根前另行迁移
  core-test 配置 2 文件 / 1,463 bytes、server-mirror 配置 2 文件 / 1,480 bytes 和 credentials 1 文件 /
  13 bytes，内容逐文件 SHA-256 相同。跨卷无法保留从 I 盘父目录继承的 ACL 标记；逐项规则复核确认 owner
  相同，F 盘目标没有新增任何访问规则，只少了源盘继承的额外 SID 规则，因此权限没有放宽；
- Windows 用户级 `FVTT_OPS_LAB_ROOT`、`FVTT_OPS_EVIDENCE_ROOT`、`FVTT_OPS_BACKUP_ROOT` 已持久化为 F 盘
  lab/evidence/backups。新进程解析到三个外置根，并确认应用入口和两个 profile Config 都存在；
- 第一次真实短启由 F 盘 Node 24.17.0 运行 F 盘 Foundry Virtual Tabletop 14 Build 364 和 F 盘 core-test
  data path；启动器与独立检查均确认 PID 所有权、仅 `127.0.0.1:30000` 监听和 `/license` HTTP 302，随后
  正常停止并确认端口释放、PID 文件删除。旧根最初因 Explorer 持有
  `evidence/cor-cotn-world-audit-20260724` 目录句柄而拒绝改名；通过 AnySearch 确认 Microsoft 官方
  Sysinternals Handle v5.0，下载 ZIP SHA-256 为
  `279AAF8ECCB6F79147F4DCC6BA091FB895C4CB8B199A0DD186A4C76BC519D2CD`，可执行文件 Authenticode 签名为
  Microsoft Corporation。Handle 只读定位到 Explorer，重启 Explorer 释放句柄后，源根成功改名为
  `.local/foundry-v14.retired-20260801-0349`，原 `.local/foundry-v14` 路径不存在；
- 在旧路径不存在的状态下第二次真实短启再次通过：进程可执行文件、main.js、preload、dataPath 全部明确位于
  `F:\FoundryLab\foundry-v14`，只监听 loopback，HTTP 302；随后再次正常停止，端口与 PID 文件清理完成。
  这证明当前切换没有暗中依赖旧路径；
- 严格只读生产盘点使用本机现有 `fvtt-production` SSH 别名、tracked 历史计划证明的
  `X:/FoundryData` 和默认 SSH identity 建立连接，线上无写入。服务器返回 234 个模块，而工具固定的
  验收基线是 249；CLI 因数量不符 fail-closed，没有把结果写成新的合格盘点。生产模块数量减少 15 是独立的
  线上漂移/基线问题，不能在本地目录迁移中顺手改基线；
- 重启后的受控删除会话重新核对了精确 retired 绝对路径、目录类型、F 盘目标、独立资产报告、恢复样本、三项
  Windows 用户级根配置和 Foundry 停服状态；确认没有链接/联接点歧义后，经用户在动作发生时再次确认，通过
  Windows 资源管理器对 `.local/foundry-v14.retired-20260801-0349` 执行永久删除。资源管理器实际处理
  205,017 个项目；末尾仅遇到一个清单中已有、物理上已不存在的 `node_modules` 联接点并选择跳过，随后删除流程
  正常结束。retired 绝对路径与原 `.local/foundry-v14` 均已不存在；I 盘可用空间从
  68,360,339,456 bytes 增至 153,678,999,552 bytes，净释放 85,318,660,096 bytes（79.46 GiB）。删除后
  `F:\FoundryLab\foundry-v14`、14.364 `main.js`、complete 资产报告（20 个已登记根、0 个缺失根、0 个问题根）
  和 2,505 文件 / 1,795,088,065 bytes 的精确恢复样本仍存在；Foundry 进程为 0，30000/30001 监听均为 0。
  这完成了旧 I 盘副本退役，而没有触碰 F 盘正式根或生产服务器；
- 本次只迁移忽略的运行数据与追加文档台账，不改变 Actor/item 语义、support matrix、module ID 或 finding
  状态。`WORLD-ASSET-001` 仍等待其原有 authenticated Chrome `ready` preflight，`MON-001` 的长时生产验收
  仍只由用户真实跑团时执行；本轮 migration/runtime success 不能关闭二者。

### 2026-08-01：AGENTS.md 分层治理与真实 Lab 测试环境安全门禁

- 用户批准按“根级总说明 + 稳定功能边界局部说明”重写 Agent 工作说明。本阶段把 `.ruler/AGENTS.md`
  设为根说明唯一编辑来源，根 `AGENTS.md` 保持规范生成头和逐内容一致；根文件现在只承担项目目标、权威恢复
  入口、中文功能地图、全局安全门禁、目标版本、公共验证和完成标准，不再重复生成器、Web、爬虫、Foundry
  module、Monster Spell Resolver 或 Foundry Ops 的完整局部规则；
- 新增 `packages/AGENTS.md`、`apps/AGENTS.md`、`foundry-modules/AGENTS.md`、`tools/AGENTS.md` 四个分类层，
  并为 parser、generation、workflows、AI Intake、plaintext ingest、GoddessFantasy crawl、assets/icons、spell
  manifest contracts、CLI、Web、Chat Memory Guard、Session Monitor、Foundry Ops 和 Monster Spell Resolver 建立或
  重写中文局部说明。纯类型/模型包继续由 `packages/AGENTS.md` 管理，没有为了追求文件数量机械增加说明；旧
  `src/core/generator/AGENTS.md` 已退役，generation 规则的唯一功能 owner 是 `packages/generation/AGENTS.md`；
- 新增 `bun run agents:check`：验证 `.ruler` 到根文件的规范生成结果、19 个必需运行时 AGENTS 文件、根导航、
  真实 scope 目录、局部功能说明/完成标准、旧 generator 文件不存在，以及每条根到功能目录的组合指令链不
  超过 Codex 默认 32 KiB。当前检查通过；19 个运行时文件最长局部文件约 2.8 KiB，没有发现 70 字符以上
  完全重复的局部规则条目。该检查已接入 `ci:verify`；
- 聚焦机械验证通过：所有 package/app/module/tool TypeScript 检查，parser 116 tests / 400 expectations，
  Monster Spell Resolver 260 / 1,276，新增 CI 环境预检 3 / 6，dependency-cruiser 3,708 modules / 3,929
  dependencies、0 violations，325-source anti-overfit，2,151-path repository hygiene，dnd5e 5.3.3 locked
  reference、Web production build 和 White Tusk Shaman 离线 Actor smoke（6 个 source items、0 warnings、
  0 network calls）均通过；
- 第一次完整 `ci:verify` 暴露了一个严重的既有测试隔离缺陷：Windows 用户级 `FVTT_OPS_LAB_ROOT`、
  `FVTT_OPS_EVIDENCE_ROOT`、`FVTT_OPS_BACKUP_ROOT` 被旧 Foundry Ops fixture 继承，临时 app/system/junction
  操作被投射到真实 `F:\FoundryLab\foundry-v14`。该轮 instrumented suite 为 1,597 pass / 37 fail；其中
  `spellResolver.test.ts` 的 junction 用例在真实 `config.appRoot` 上先递归删除再建立测试链接，导致正式
  `F:\FoundryLab\foundry-v14\app\14.364` 被意外删除。这是本阶段执行测试造成的真实损坏，未被隐藏；
- 立即停止其他工作并做只读损害盘点。迁移后接受清单逐文件证明 server-mirror dnd5e 1,436 / 1,436、
  spell resolver module 8 / 8、一次性 module-matrix world 117 / 117 的路径、长度和 SHA-256 全部相同，受损
  范围收敛为 Foundry app root。原始 `D:\Download\FoundryVTT-Node-14.364.zip` SHA-256 为
  `51939B0FAB81D605C9E45188C768C8A34EF8BDB852D753C9E7245D4AE35CFBF3`；新版 7-Zip 因 13 个 `.bin`
  相对链接安全拒绝而没有形成可提升结果，随后严格复用项目 bootstrap 的 PowerShell `Expand-Archive` 语义，
  并补执行既有 `license.html` 投影。在独立 staging 中对接受的 foundry-app manifest 完成 19,211 文件、
  251,059,095 bytes 逐文件 SHA-256 核对，0 missing、0 extra、0 byte/hash mismatch 后，同盘提升到正式
  `app\14.364`；提升后版本 `14.364.0`、`main.js`、`classic-level/index.js`、文件数、字节数和 0 reparse
  points 再次通过。没有启动 Foundry；这是内容恢复，不是新的 runtime 验收；
- 失败的 7-Zip staging 清理被宿主安全策略拒绝且未绕过，当前保留在
  `F:\FoundryLab\foundry-v14\tmp\codex-recovery-20260801-app-14.364`，共 19,210 files /
  251,051,208 bytes、0 reparse points。它不是正式 app 或备份，后续需单独安全删除；
- 新增 `bun run test-env:check` 并置于 `ci:verify` 第一项。只要当前进程继承任一真实 `FVTT_OPS_*` 运行根，
  门禁就在进入测试前用中文拒绝，不要求或建议删除持久 Windows 配置。预检的 live-env 拒绝和清空的纯子进程
  接受均已验证；当前机器运行 `ci:verify` 会在约 0.2 秒安全停止，不能再重演真实 Lab fixture 写入；
- 完整 CI 仍诚实记录为未通过。只在测试子进程清除三个变量后，23 个环境投射失败消失，但剩余 14 个真实
  LevelDB 测试仍直接硬编码已退役的仓库路径
  `.local/foundry-v14/app/14.364/node_modules/classic-level/index.js`，instrumented suite 为
  1,620 pass / 14 fail。不得重建旧目录或制作 junction 让它们假通过；后续必须把 fixture 隔离和
  classic-level runtime source 一起改为显式安全依赖，再刷新完整 CI。本阶段没有连接生产、启动真实 Foundry、
  运行 Chrome 或执行任何超过 30 分钟的监测，finding 状态和 support matrix 均未改变。

### 2026-08-01：本地 v14 测试环境定义与 14 个 LevelDB 测试修复

- 用户确认环境身份：`F:\FoundryLab\foundry-v14` 是持久保留的本地 Foundry v14 集成测试环境；唯一生产环境
  是远程服务器 8080 Foundry。根、Foundry module、Foundry Ops 和 Monster Spell Resolver 的分层
  `AGENTS.md` 已同步这一边界，并进一步区分“持久本地集成 Lab”和“每次测试创建、允许故意破坏的临时沙箱”；
- 新增 `resolveConfiguredClassicLevelEntry()`：从配置后的 F 盘 Lab 精确解析 Foundry 14.364 自带
  `classic-level/index.js`，保留 exact-lab-path 与 reparse/junction 防护。两个 LevelDB 测试套件不再硬编码已删除
  的仓库 `.local` 路径；它们只读加载该运行组件，而数据库、世界、锁、备份、快照、链接和失败恢复目标继续
  位于 `mkdtemp()` 创建的随机 Windows 临时目录，没有复制整套 Foundry；
- 首轮聚焦运行中，原 14 项已经通过，但 `config.test.ts` 的 3 个旧调用仍隐式继承用户级 F 盘根，其中两个
  junction fixture 尝试清理该根时被 Windows 以 `EPERM` 拒绝。操作没有成功；事后 F 盘 app 仍为 19,211 files /
  251,059,095 bytes，`main.js` 与 `classic-level` 存在，后者 SHA-256 仍为
  `6958A1D105BE7ECA861E18D244A42B3A6E7FC28C3CF9DBE6DD24720C529A171C`。随后把该配置测试文件所有默认布局调用
  改成显式空环境，使其只能投影到各自 fixture 路径；
- 最终聚焦验证为 76 tests / 253 expectations、0 fail，真实覆盖原 9 个 Spell Resolver LevelDB 安全测试、5 个
  World Audit snapshot/lock 测试和 11 个配置边界测试。14 个旧路径失败已关闭；这证明了临时数据库上的锁、备份、
  漂移、链接和关闭语义。World Audit suite 也新增统一 `afterEach` 清理，只允许删除由 `mkdtemp()` 返回且父目录
  精确等于 Windows temp 的本轮根；最终运行后只读扫描没有发现本轮新建的测试根残留。这不等于启动 F 盘
  Foundry 或接受远程 8080 生产行为；
- 完整 `ci:verify` 本阶段仍未运行：安全预检会继续拒绝尚未全部隔离的其他 fixture 继承持久 F 盘根。下一步应
  系统性把剩余测试的隐式 `createLabConfig(..., process.env)` 投影改为显式临时环境，验证后再决定是否收窄或移除
  该临时总门禁。本轮没有连接远程 8080、启动 Foundry/Chrome 或运行长时监测。

### 2026-08-01：其余 Foundry 测试隔离与完整仓库门禁恢复

- 对最初按函数名得到的“12 个文件、66 次 `createLabConfig()` 调用”做了 import-aware 复核：其中
  `acquire.test.ts` 和 `remoteInventory.test.ts` 已通过各自包装器注入空的远程测试环境，实际需要迁移的是其余
  10 个文件、51 次直接调用。新增 `createHermeticLabConfig()` 作为测试专用配置入口，默认环境为 `{}`，没有改变
  生产 `createLabConfig()` 继续读取显式参数或真实进程环境的行为；
- 10 个真实未隔离文件全部改用 hermetic helper。新增 TypeScript AST 静态门禁 `bun run test-isolation:check`：
  Foundry 测试若直接导入生产配置工厂，则每次调用都必须显式提供环境；使用 hermetic helper 的测试也被明确识别。
  该门禁已接入完整 CI，防止以后又悄悄继承 Windows 用户级 F 盘根；
- 新增通用安全测试包装器。`bun run test`、`bun run test:foundry-ops`、`bun run test:foundry-lab` 和
  `bun run ci:verify` 现在都会在 Windows temp 下创建名称以 `fvtt-ci-sandbox-` 开头的直接子目录，把可写
  Lab/evidence/backup/ZIP/world 全部投影到该沙箱；它会先按 Windows 大小写不敏感语义清除所有继承的
  `FVTT_OPS_*`，再只写入受控测试值，因此生产连接变量不会进入子进程；只读依赖则用独立的
  `FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY` 把 F 盘 Foundry 14.364 的 `classic-level` 作为只读依赖传入。结束清理前会
  再次验证目标是 temp 的普通直接子目录、名称前缀正确且不是 reparse point，验证失败就拒绝递归删除；
- CI 环境预检现在只在所有可写根都是声明的 `FVTT_OPS_CI_SANDBOX_ROOT` 严格后代时接受；持久 F 盘 Lab 作为
  可写根仍会被拒绝。内部 `*:raw` 脚本只由包装器调用，AGENTS 公共命令改为安全包装入口；
- 第一轮完整 Foundry Ops 聚焦测试为 317 pass / 1 fail。失败不是 F 盘写入：`diagnose.test.ts` 的 CLI 子进程
  继承了外层 CI 沙箱，而父测试数据位于它自己的临时根，二者因此看不到同一个 fixture。修复为给该子进程显式
  传入父测试的临时 Lab/evidence/backup 根后，单文件为 14 / 0，完整 Foundry Ops 为 318 tests /
  2,345 expectations / 0 fail；
- 最终完整 `bun run ci:verify` 退出码为 0、耗时约 103 秒：环境预检、测试隔离、AGENTS、全部类型检查通过；
  dependency-cruiser 为 3,712 modules / 3,934 dependencies / 0 violations；Session Monitor build 1 / 1、
  CLI 12 / 57、instrumented 1,645 / 7,774（另有 13 项按既有分组过滤）全部通过；production coverage 为
  85.60% lines / 88.15% functions；327-source anti-overfit、2,151-path hygiene、锁定 dnd5e reference、Web
  build 和 White Tusk Shaman 离线 Actor smoke（6 items、0 warnings、0 network）均通过；
- 语义验收确认：测试可以正常执行临时世界、数据库、链接、锁、备份和恢复行为，但没有可写路径指向持久
  `F:\FoundryLab\foundry-v14`；F 盘只读 `classic-level` 的 SHA-256 在前后均为
  `6958A1D105BE7ECA861E18D244A42B3A6E7FC28C3CF9DBE6DD24720C529A171C`。生产变量在测试子进程内被删除，
  因而不会连接远程 8080。CI 输出中的短暂 Session Monitor 等待来自既有临时 companion smoke，不是真实
  Chrome/Foundry，也没有运行四小时或任何超过 30 分钟的监测。

### 2026-08-01：阶段 5C.5 reference cache 实际外置与旧路径隐藏验收

- 用户同意继续实际外置。只读预检确认仓库 `.local/references` 是可重建的版本参考缓存，不是世界、生产数据或
  tracked provenance：共 12,774 files / 669,810,859 bytes、0 reparse points；dnd5e checkout revision 为
  `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`，按排序后的相对路径、字节数和逐文件 SHA-256 生成的整根
  digest 为 `18a0c9c1edbe26089762938f3a47c7c1a69f57db76ba3dd3d81c5924b6733b3c`；
- 在确认 `F:\FoundryLab` 是普通目录、目标与 staging 均不存在、F 盘空间充足后，先复制到
  `F:\FoundryLab\reference-cache.staging-20260801`。F 盘 staging 重新得到完全相同的 12,774 files、
  669,810,859 bytes 和 root digest，0 reparse points；随后同盘原子改名为
  `F:\FoundryLab\reference-cache`。用户级 `FVTT_REFERENCE_CACHE_ROOT` 从未设置变为该精确路径，CLI
  `references verify` 返回 `dnd5e-5.3.3: ok`。仓库旧缓存没有删除，继续作为兼容窗口副本；
- 外置配置第一次进入聚焦测试时暴露两个 ambient-environment 缺陷：`verifyReferenceCache()`、
  `bootstrapReferenceCache()` 和 `buildReferenceIndexes()` 的库级默认值会读取 `process.env`，使临时 fixture
  误用真实 F 盘缓存。现在库函数默认始终使用调用方 project root 下的确定性布局，只有 CLI 边缘显式投影
  `process.env`；20 项 reference/target 聚焦测试随后通过；
- 第一次把仓库旧缓存临时改名后运行完整 CI，reference-index fixture 因上述真实 F 盘扫描超过 5 秒而失败；旧
  目录按 `finally` 恢复。修复后第二次完整运行没有出现 reference 错误，但一个通常约 0.2 秒的同步 CLI 图标
  子进程偶发卡死，五分钟外层上限终止了 PowerShell，留下本轮 CI Bun 进程树、兼容目录名和两个空 temp
  目录。只终止了精确追踪到本轮 `ci:verify` 根 PID 的 7 个 Bun 进程，没有终止既有 Foundry MCP bridge；旧
  缓存目录名已恢复。两个已证明为 Windows temp 直接普通子目录且内容为空的
  `fvtt-ci-sandbox-qIvK2C`、`fvtt-cli-icons-0KrlXn` 因宿主策略拒绝删除而保留；未绕过策略；
- 为防同步 `spawnSync` 再次无限阻塞测试调度，CLI icon 两个子进程现各有 4 秒硬上限并显式断言无子进程错误；
  外置环境下最终聚焦结果为 22 tests / 68 expectations、0 fail；
- 第三次完整验收再次临时把仓库 `.local/references` 改名，确保旧默认路径真实不存在，然后用 F 盘配置运行
  `bun run ci:verify`。最终 exit 0、约 103 秒：Session Monitor build 1 / 1、CLI 12 / 59、instrumented
  1,645 / 7,774、13 filtered / 0 fail；dependency-cruiser 3,712 modules / 3,934 dependencies / 0
  violations；production coverage 85.59% lines / 88.15% functions；327-source anti-overfit、2,151-path
  hygiene、外置 dnd5e verify、Web build 和 White Tusk Shaman 离线 Actor smoke 均通过。运行中没有工具重新
  创建旧路径，结束后兼容副本恢复原名；这证明项目可以只从外置 root 解析同一参考资料；
- 第三次验收后按完成标准重新计算整根指纹，主动推翻了“F 盘主缓存仍与原件完全一致”的暂时结论：第一次
  ambient reference-index fixture 曾在修复前向真实 F 盘写入 11 个 `generated-text` 文件并覆盖 5 个
  `indexes` 文件，使目标变为 12,785 files / 668,289,665 bytes；0 个源文件缺失，差异精确限定为这 16 个
  rebuildable 产物。没有用 dnd5e revision 正确来掩盖整根漂移；
- 为避免宿主删除策略下的半截修补，从仓库兼容副本重新建立完整 repair staging；它再次匹配 12,774 files /
  669,810,859 bytes、0 reparse 和原 root digest。当前漂移目标原子改名为
  `F:\FoundryLab\reference-cache.drifted-20260801` 保留回滚/调查证据，干净 staging 提升为正式
  `F:\FoundryLab\reference-cache`。第四次完整验收继续隐藏仓库旧路径并 exit 0、约 105.5 秒：测试数字、
  dependency、coverage（85.60% lines / 88.15% functions）、anti-overfit、hygiene、外置 verify、Web build 与
  Actor smoke 均通过。验收后再算 F 盘主缓存仍为 12,774 files / 669,810,859 bytes，root digest 仍为
  `18a0c9c1edbe26089762938f3a47c7c1a69f57db76ba3dd3d81c5924b6733b3c`，证明修复后的测试不再写入主缓存；
- 本阶段没有启动真实 Foundry/Chrome、连接远程 8080、修改生产、执行长时监测或删除旧参考缓存。阶段 5 的
  runtime/reference 外置目标已完成；仓库旧 reference 兼容副本、F 盘 drifted 隔离副本、恢复事故 staging 和
  两个空 temp 目录的删除都是后续独立清理，不应与外置验收混称。

## 2026-08-01：阶段 5 历史停止点（已由后续阶段取代）

阶段 5C 的代码适配、真实 copy-first 迁移、19 个计划根独立内容对账、敏感配置迁移、恢复抽样、Windows 用户级
切换、旧路径隔离、“旧路径不存在”状态下的第二次真实 Foundry 14.364 短启，以及旧 I 盘 retired 副本的永久
删除均已完成。当前唯一正式 Foundry Lab 根为 `F:\FoundryLab\foundry-v14`；原默认路径和 retired 路径均不存在，
I 盘已净释放 79.46 GiB。AGENTS 分层治理也已完成，19 份运行时说明由根中文地图和分类/功能规则导航，并有
自动漂移检查。环境身份现明确为“F 盘是本地 v14 集成测试 Lab、远程 8080 才是唯一生产”；原 14 个旧路径
LevelDB 测试已改为只读使用 F 盘 `classic-level`、只破坏随机临时数据根，并以 76 / 0 聚焦结果关闭。其余
Foundry 测试也已完成隔离，所有公开整仓/Foundry 测试命令现自动使用临时沙箱，静态回归门禁与完整
`ci:verify` 均已通过。测试事故
删除的 F 盘 Foundry app 已从原始锁定 ZIP 经 19,211 文件逐哈希恢复；data、system、module、world、backup 和
evidence 未发现接受清单漂移，Foundry 保持未启动。
完整 reference cache 也已 copy-first 外置到 `F:\FoundryLab\reference-cache`；用户级配置已切换，12,774 个
文件逐哈希对账一致，并在仓库旧缓存路径临时不存在时通过完整 `ci:verify`。阶段 5 的数据、reference 与 runtime
root 治理因此完成；仓库 `.local/references` 只作为兼容窗口副本保留，不再是当前主缓存。

下一次可从以下互不混淆的工作继续：

1. 决定是否在兼容窗口后单独删除仓库 `.local/references` 旧参考缓存副本（约 638.78 MiB）；当前主缓存已经是
   F 盘，删除仍需独立明确授权和删除前复核；
2. 单独删除已明确隔离、不再作为主缓存的 `F:\FoundryLab\reference-cache.drifted-20260801`（约
   637.33 MiB）；它保留的是第一次错误索引写入后的回滚/调查副本，当前未经删除授权；
3. 单独安全删除本阶段失败的 7-Zip staging
   `F:\FoundryLab\foundry-v14\tmp\codex-recovery-20260801-app-14.364`（约 239.42 MiB）；宿主本轮拒绝了递归
   清理，目录仍存在且不应被当作正式副本；
4. 若宿主策略允许，清理由第二次外置 CI 超时留下的两个已确认空目录
   `C:\Users\Administrator\AppData\Local\Temp\fvtt-ci-sandbox-qIvK2C` 和
   `C:\Users\Administrator\AppData\Local\Temp\fvtt-cli-icons-0KrlXn`；它们没有内容，不影响功能；
5. 单独调查生产只读盘点的 234 vs 249 模块基线差异；不能简单把 expected count 改成 234，也不能把本地迁移
   成功当作生产清单验收；
6. 进入阶段 6 文档、历史工具与 branch-worktree 治理；任何删除继续单独盘点和授权。

`WORLD-ASSET-001` 的 authenticated Chrome `ready` preflight 与 `MON-001` 的长时真实会话验收仍未完成；四小时或
任何超过 30 分钟的 Chrome/Foundry/Session Monitor 监测仍只登记给用户在真实使用时运行，代理不得代跑。

### 2026-08-01：阶段 6A 文档总索引与 worktree 只读分类

- 按计划建立 `docs/architecture/README.md`、`docs/runbooks/README.md`、`docs/acceptance/README.md`、
  `docs/remediation/README.md` 和 `docs/archive/README.md`；连同既有 `docs/decisions/README.md`，六类文档入口
  已齐。索引分别说明当前功能地图、操作步骤、真实支持边界、未完成事项、架构决定和历史归档规则，没有把
  计划、测试或历史报告误写成当前完成状态；
- 对六份索引中的 55 个本地 Markdown 链接逐一按相对路径解析，0 个断链；UTF-8 复核没有替换字符；
- 只读核对 7 个附加 worktree。Bloodfin、GoddessFantasy、Item、Tailcrash 和 Actor Refactor 五个 worktree
  都是 clean，分支 tip 已同时被本地 `master`、`origin/master` 和当前架构分支包含，没有仅存在于这些分支的
  提交；它们不需要再次合并，但物理 worktree 和已合并本地分支尚未移除；
- Codex 临时 worktree 有 21 条未提交状态，NPC/Monster worktree 有 8 条未提交状态。两者的已提交 tip 也已进入
  `master`，但未提交文件内容不能由“分支已合并”推定为可丢弃；本阶段未覆盖、移动、暂存、提交或删除其中任何
  文件；
- 本阶段没有归档旧文档、删除 `.sisyphus/`、移除 worktree、删除本地或远程分支。下一步必须先对两个 dirty
  worktree 的未提交内容做逐项保留/已替代判断，再提议可执行的清理清单。

### 2026-08-01：阶段 6B 两个 dirty worktree 内容判定与 Spell Resolver 状态纠正

- 用户明确纠正：原在线环境中的修复模块安装、失败 Rat Warlock 恢复/清理、重新导入、残留内容和错误状态清除
  均已由用户执行并确认正确。原整改总账此前仍记为 open，属于过期状态；现以“用户执行的外部语义验收”关闭
  `SPELL-002`、`SPELL-003`，同时明确本轮代理没有重复在线写入或独立取得新的服务器工件；
- Codex 临时 worktree 的全部 dirty 文件内容时间为 2026-03-21；正式 plaintext Actor workflow 于 2026-03-22
  进入仓库，之后持续演进并在 2026-07-31 迁入 `packages/ingest-plaintext` 和 `packages/workflows`。其 8 份怪物
  输入在当前仓库都有后续正式输入或 fixture；当前工作流、parser、generator、CLI 和验收实现均更新；
- NPC/Monster worktree 的 8 个 dirty 文件最后写于 2026-04-27。其三项实质内容——plaintext 先写 `middle`
  再推广到 `input`、旧式 object action 不生成空 structured action、Bloodfin 双产物说明/验收——均已存在于当前
  package 实现、正式文档和后续验收结果中；当前实现还增加依赖注入、强制重处理、v14/图片/图标参数和更多
  来源语义门禁；
- 对当前正式路径运行 plaintext ingest、plaintext Actor workflow、YAML parser 和 Slithering Bloodfin acceptance
  四组测试，结果 68 tests / 329 expectations、0 fail。结合时间线、正式提交历史、当前代码和语义测试，两个
  dirty worktree 都是被当前实现取代的旧开发现场，不是比当前 `master` 更新的待合并实现；
- 本阶段仍未删除这两个 worktree。清理动作必须在用户明确授权后进行，并遵守全局 `Remove-Item` 不使用
  `-Force` 的规则。

### 2026-08-01：阶段 6C 两个被替代 worktree 移除

- 用户明确授权删除 Codex 临时 worktree
  `C:\Users\Administrator\.codex\worktrees\abc2\fvttV12JsonGenerator` 和 NPC/Monster worktree
  `C:\Users\Administrator\.config\superpowers\worktrees\fvttV12JsonGenerator\npc-monster-workflow-repair`；
- 删除前再次确认两者都是普通目录、不是 reparse point、均登记为本仓库附加 worktree、都不是当前工作目录，
  且各自 HEAD 已进入 `master`。前一阶段已证明其未提交功能被当前正式实现取代；
- 使用 `git worktree remove --force <exact-path>` 移除 dirty worktree；没有使用 PowerShell
  `Remove-Item -Force`，没有删除任何分支。NPC 本地分支 `codex/npc-monster-workflow-repair` 仍保留在
  `aa87a0a2192343f6a87e5280378601704e24de7e`；Codex 临时 worktree 原为 detached HEAD；
- 删除后两个精确目录均不存在，`git worktree list --porcelain` 中也无对应登记；当前架构工作树仍为
  `codex/architecture-reorganization-20260731` / `8aa1c092af9d7b7f7e378813df7b7c12ec39db58`，既有用户修改未被触碰；
- 当前还剩五个 clean worktree：Bloodfin、GoddessFantasy、Item、Tailcrash 和 Actor Refactor。它们的代码均已
  进入 `master`，但本阶段没有扩大授权去移除这些目录或删除对应本地分支。

### 2026-08-01：阶段 6D 五个 clean worktree 移除

- 用户明确授权继续移除 Bloodfin、GoddessFantasy、Item、Tailcrash 和 Actor Refactor 五个 clean worktree；
- 删除前逐个确认：精确目标是普通目录而不是 reparse point，均为本仓库已登记附加 worktree，`git status`
  为 0 条，HEAD 同时被本地 `master` 和 `origin/master` 包含，并且都不是当前工作目录；
- 使用不带强制参数的 `git worktree remove <exact-path>` 逐个移除。删除后五个目录均不存在，Git worktree
  登记只剩当前主工作树 `I:\OpenCode\fvttV12JsonGenerator`；当前架构分支和 HEAD 保持为
  `codex/architecture-reorganization-20260731` / `8aa1c092af9d7b7f7e378813df7b7c12ec39db58`；
- 本次没有删除对应本地分支。`bloodfin-acceptance-gate`、`codex/goddessfantasy-clean-merge`、
  `codex/item-generation-workflow-repair`、`codex/tailcrash-heavy-hit`、`codex/actor-refactor` 均继续保留；
  前一阶段保留的 `codex/npc-monster-workflow-repair` 也未删除；
- 仓库内 `.worktrees` 容器目录当前为空，但本次授权对象是五个 worktree，不扩大为删除父目录或本地分支。

### 2026-08-01：阶段 6E 已合并本地分支清理

- 用户明确授权清理已经合并但仍保留的本地分支；删除前确认 worktree 登记只剩当前主工作树，当前分支为
  `codex/architecture-reorganization-20260731`，该分支尚未进入 `master`，因此明确保留；
- 逐个用 `git merge-base --is-ancestor <branch> master` 证明候选 tip 已完整进入本地 `master`，并再次确认没有
  worktree 占用；随后只使用非强制的 `git branch -d` 删除 15 个本地分支：
  `bloodfin-acceptance-gate` (`65c46f3`)、`codex/actor-refactor` (`54e5109`)、
  `codex/actor-refactor-v2` (`aa87a0a`)、`codex/cor-cotn-world-footprint-audit` (`2d7cef4`)、
  `codex/crawlee-goddessfantasy` (`7bb8021`)、`codex/foundry-v14-stable-support` (`d6e8c16`)、
  `codex/general-rider-v12` (`265a55d`)、`codex/goddessfantasy-clean-merge` (`4d7dfb6`)、
  `codex/goddessfantasy-image-assets-workbench` (`7bb8021`)、
  `codex/item-generation-workflow-repair` (`31d99b7`)、
  `codex/merge-remaining-branches-20260729` (`014fb16`)、
  `codex/netherdeep-mechanics-semantics` (`709eac4`)、
  `codex/npc-monster-workflow-repair` (`aa87a0a`)、`codex/tailcrash-heavy-hit` (`65c46f3`) 和
  `codex/tailcrash-heavy-hit-live` (`cb969f3`)；
- 本次没有删除、修改或推送任何远程分支。清理后本地只保留 `master` 和当前未合并的架构重构分支；既有工作区
  修改、未跟踪图片和提交内容均未被触碰。

### 2026-08-01：阶段 4D 怪物法术解析器物理归位

- 怪物法术解析器的源码、manifest、样式、模板、语言文件、单元测试、Foundry Lab 生命周期测试、构建入口、
  本地安装入口和模块说明已经统一迁入 `foundry-modules/monster-spell-resolver/`。原
  `src/foundry/monster-spell-resolver/`、根级 `scripts/buildSpellResolver.ts`、旧 Foundry Lab 实现、旧专用 CLI
  和旧测试文件均已消失，没有保留旧入口转发或第二份实现；
- 新模块拥有自己的 `package.json`、`tsconfig.json`、`build.ts`、`lab.ts`、`labCli.ts` 和 `labConfig.ts`。
  构建产物现在落在模块自己的 `dist/`；Foundry Ops 只保存带权限分类的字符串路由，不再拥有解析器实现；
- 搬迁前先保存旧构建基线并运行旧路径测试。搬迁后发布包仍是完全相同的 8 个文件；7 个静态文件逐字节相同，
  JavaScript bundle 只有 Bun 生成的源码路径注释从旧目录变为新目录，去掉该注释差异后逐字符相同。这证明本次
  目录调整没有偷偷改变运行代码；
- 聚焦机械验证通过：`typecheck:foundry-modules`；怪物法术解析器 296 tests / 1,429 expectations；AGENTS 分层
  19 个必需文件；dependency-cruiser 3,845 modules / 3,962 dependencies / 0 violations；全部根 TypeScript
  检查；Foundry Lab 157 tests / 1,000 expectations；Foundry Ops 命令目录 8 tests / 131 expectations；
- 使用正式路由在本地测试环境 `F:\FoundryLab\foundry-v14` 完成 build、install 和 verify-install。安装目标是
  `data/server-mirror/Data/modules/fvtt-json-generator-spell-resolver`，构建与安装目录的 SHA-256 均为
  `a63410ed1bc122ae752d15454df5fb5193b9923ce8e7433e7a47741040e25d7f`；目标环境为 Foundry 14.364、
  dnd5e 5.3.3，并保留了安装前备份；
- 本轮没有启动 Foundry、连接远程 8080、修改生产数据或进行长时间监测。此前 Rat Warlock 在线恢复与重新导入
  已由用户亲自验证正确；本轮只验证物理归位没有改变发布内容和本地安装行为，不把旧的外部验收冒充成本轮新跑。
- 最终 `bun run ci:verify` 退出码为 0、耗时约 121 秒：1,645 tests / 7,774 expectations / 0 fail，
  production coverage 为 85.57% lines / 88.16% functions；309-source anti-overfit、2,151-path repository
  hygiene、锁定 dnd5e reference、Web production build 和 White Tusk Shaman 离线 Actor smoke 均通过。

### 2026-08-01：阶段 6F 历史资料审计与最终架构验收

- 对 `.sisyphus/` 完成消费者审计：目录内有 38 个已跟踪的旧计划、notepad 和验收日志；目录外只有归档索引、
  本架构计划和本执行总账提到它，没有生产代码、构建入口、当前 runbook 或测试依赖它。裁决为“作为已跟踪历史
  证据原位保留”，不再把是否移动或删除它视为架构完成条件，也不为了目录整齐破坏旧证据中的相对链接；
- 文档治理完成：六类总索引已经建立，历史与当前状态分开；7 个附加 worktree 已安全移除；15 个已经进入
  `master` 的本地分支已用非强制方式删除；远程分支未修改；
- 最终人工架构检查确认：CLI、Web、公共 packages、三个 Foundry modules 和 Foundry Ops 都有唯一归属、明确
  入口、局部 `AGENTS.md` 和验证命令；怪物法术解析器旧实现路径为 0，根命令直接路由新模块，不需要旧入口转发；
- 代表性语义证据没有因搬目录被替换：中文/英文 Actor、Item、Intake、crawl、图片/图标、Web 和离线 Actor smoke
  都由完整门禁覆盖；怪物法术解析器搬迁前后发布内容等价，并在本地 v14 Lab 完成安装校验；在线 Rat Warlock
  恢复由用户亲自验收。v12/v14 支持矩阵、生产权限边界和长时 Session Monitor 外部验收边界均未被虚假升级；
- 最终机械门禁为 `bun run ci:verify` exit 0：1,645 tests / 7,774 expectations / 0 fail，全部类型检查、
  workspace/module/tool 检查、0 dependency violations、0 cycle、coverage、anti-overfit、repository hygiene、
  锁定 reference、Web build 和离线 Actor smoke 均通过；`git diff --check` 也通过；
- 本次架构重整的代码、目录、文档和本地 Git 治理目标均已满足，执行总账状态正式改为 `completed`。
  `MON-001` 四小时真实跑团监测等明确交给用户在真实使用时完成的外部验收，继续留在支持矩阵中单独跟踪，
  不属于本次目录和架构重整的未完成工作。

### 2026-08-01：阶段 6G 公开仓库提交边界清理

- 用户明确推翻阶段 6F 对代理历史资料“原位跟踪”的暂时裁决：代理/编辑器状态、机器专属生产运维资料、生成候选和大型上游镜像不应继续发布到 GitHub。本阶段直接在 `master` 执行，没有创建新分支；
- 从当前 Git 索引移除 1,277 个路径，但全部保留在本机并由 `.gitignore` 接管：38 个 `.sisyphus` 文件、Gemini/Qwen 设置、22 份 Superpowers 代理计划、23 个 Obsidian 配置/插件文件、1,168 个 v12 API 镜像文件、9 份机器专属生产计划/报告/脚本、14 个待翻译 JSON 和 1 份无正式消费者的 DOCX。10 张 `images/generated-monsters` 图片和原本未跟踪的 `.superpowers` 状态也已加入忽略规则；
- `repositoryHygiene` 新增可执行门禁，拒绝重新跟踪代理工具状态、私有运维资料、完整 `.obsidian`、大型 v12 API 镜像、生成图片候选、待翻译队列和 `data/*.docx`。清理后当前索引从 2,179 个路径降至 902 个路径；抽查所有移除目录均仍存在且被 Git 忽略，没有物理删除用户资料；
- Web 图片上传不再内置真实 SSH 目标、远端目录或公开 URL；三个目标值都必须由服务器环境变量显式提供，明文 HTTP 也由默认允许改为仅在 `FVTT_WEB_IMAGE_ALLOW_HTTP=1` 时允许。机器专属生产 runbook 继续留在操作者本机，公开索引只说明权限边界；源码、测试和保留历史中的真实主机/账号形式/个人磁盘根已替换为示例值；
- 公开树的高置信扫描得到 0 个真实机器目标匹配、0 个私钥头/GitHub token/AWS access key/OpenAI 风格 key 匹配。此结果是当前树扫描，不清除既有公开 Git 历史；本阶段没有重写历史、强制推送或推送远端；
- 第一次专项测试为 86 pass / 1 fail，唯一失败是 plaintext 图片 URL 正则仍写旧测试地址；修正为精确 `assets.example.invalid` HTTPS 断言后，同一批 87 tests / 386 expectations 全部通过。最终 `bun run ci:verify` exit 0、耗时约 114 秒：1,645 tests / 7,776 expectations / 13 filtered / 0 fail，85.57% production lines / 88.16% functions，3,845 modules / 3,962 dependencies / 0 violations，309-source anti-overfit、902-path hygiene、AGENTS、所有类型检查、Web build、锁定 dnd5e reference 和 White Tusk Shaman 离线 smoke 全部通过；
- 人工语义复核确认：被清理内容没有生产代码消费者；Web 默认状态显示图片能力未配置，只有测试显式注入示例目标时才启用；v12 必需的 `data/cn.json`、`data/spells.ldb`、`data/golden-master.json`、小型 dnd5e 4.3.9 证据、v14 图标 catalog 和正式 Markdown 输入仍保留。后者是否允许公开取决于用户拥有的内容许可，不能由路径扫描代替版权判断，继续作为单独的发布决定而不是本次自动删除项；
- 本阶段没有访问远程 8080、启动真实 Foundry/Chrome、执行长时监测或改变既有功能支持声明。架构重整仍为 `completed`；本次仅收紧公开提交边界。

### 2026-08-11：Species TXT Intake 与食人魔纵向切片

- 在 clean `master` (`890af88ae407f06851e5c2077204de06a76770c2`) 的 sibling worktree
  `I:\OpenCode\fvttV12JsonGenerator-worktrees\20260811-011304-species-intake-ogre` 和分支
  `codex/20260811-011304-species-intake-ogre` 实现；没有提交、合并、推送或生产写入。后续仅把构建产物安装到受保护的本地
  `fvtt-v14-module-matrix` disposable world；
- 新增独立的 Species canonical model、Markdown parser/router、Foundry 14.364 / dnd5e 5.3.3 / Core
  projector/validator、Evidence IR/provider/orchestrator、CLI intake/resume 入口、accepted ledger 及 content-only
  `fvtt-homebrew-species` 两包模块。Markdown 原始资料区使用来源哈希与 UTF-16 长度精确保留候选，人工编辑会使
  ledger stale，模块构建 fail-closed；复杂规则只能以明确的 `gm-assisted` / `external-rule` 边界进入 accepted；
- 食人魔 fixture 的人工语义复核确认：正式显示 `食人魔（Ogre）`，原始 `Orge` 拼写保留；race 为 giant/Ogre、
  Large、40 ft、darkvision 60；0级授予四项特性，5级授予附赠动作脱困；巨武器四条无 Activity/Effect/武器写入，
  身强力壮未扩大为全局优势，脱困为 Bonus、2/LR、消费1且不消费 spell slot，刚毅为每级 HP +3，笨拙为 AC -2，
  起身/推击/建筑伤害保持 assisted，未增加 ASI、语言、触及、负重、熟练、徒手伤害或抗性；
- 专项 hermetic 门禁为 14 tests / 84 expectations / 0 fail；CLI Species 为 2 tests / 6 expectations / 0 fail。
  首次全仓 CI 在 1,882 tests 通过后发现 Species artifact test 错把 hermetic 临时 Lab 当作 `classic-level` 来源；
  修正为优先使用 runner 注入的只读 `FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY` 后，原失败测试在 hermetic 环境通过；
- 只读 Sol reviewer 首轮给出 `REVISE`：package validator 未双向验证 coverage/Effect/Activity/grant，Evidence IR
  允许笼统 `/species` claim，resume 缺少旧 run/decision hash 追溯，installer 没有把 artifact verifier 用作安装门禁。
  修正后新增字段级 claims↔coverage、mechanics↔Effect/Activity↔grant 闭合和重算 logical hash mutation tests；
  resume manifest/ledger 写入 `resumedFromRunId` 与 `decisionsSha256`；installer 在 source artifact、staging 和最终
  module 三层验证 manifest、content-only 文件面、LevelDB 与 UUID，并对 missing/foreign/escape fail-closed；
- 修正证据按要求交回同一 reviewer；第一次复核回合未在等待窗口内返回，因此当时没有记录虚假的 `PASS`。真实 OAuth、
  模块和 Lab 证据就绪后的同一 reviewer 复核确认代码与运行语义无阻断，只要求把三份仍停留在 fake-provider-only 状态的
  文档同步为当前事实；本段与支持矩阵/Species 指南即为该最小修正；
- reviewer 修正后的第一次全仓 CI 在 coverage Item CLI 子进程持续高 CPU 数分钟而不推进，按精确 PID/命令行终止并
  清理本次孤儿进程；精确 Item 单元 6/6 与 CLI 3/3 随后通过。再次完整运行 `bun run ci:verify` exit 0、耗时约
  116 秒：1,885 tests / 9,230 expectations / 14 filtered / 0 fail，production coverage 84.14% lines / 86.57%
  functions，5,743 modules / 5,503 dependencies / 0 violations，
  345-source anti-overfit、1,059-path hygiene、25 个 AGENTS、全部类型检查、dnd5e 5.3.3 reference、Web build 和
  White Tusk Shaman 离线 Actor smoke 均通过；
- 本机 `codex login status` 为 ChatGPT OAuth 已登录，Intake doctor 确认 loopback `codex-oauth` bridge 可达。真实运行
  `species-20260811022558-9a41c4a1` 无 repair accepted；accepted ledger 记录 Markdown SHA-256
  `872e098b…cc63`、来源 SHA-256 `6b237425…6d94` 与 package logical hash `78496f64…8e0e`。模块重新 build/verify
  得到 1 race / 5 features，module logical hash `d9bd6759…258fd`，ZIP SHA-256
  `38390d2e1554eac683c5e065c6c2404d4f569b4f662868319f4523977290581e`；
- 本地 Foundry `14.364` / dnd5e `5.3.3` 的 `fvtt-v14-module-matrix` world 已安装并启用模块。原生 Add Species 应用后
  角色为 giant/Ogre、Large、40 ft、darkvision 60、AC 10→8；1级 HP 为 12+3=15，5级最大 HP 为 40+15=55；
  5级附赠动作脱困 2/2 消耗、0/2 第三次无聊天卡、Long Rest 恢复 2/2。两张聊天卡均要求手动进行原受擒检定，
  不选择属性/技能、不自动解除状态；“体型不超过你二级”没有系统判断、推击、移动或武器写入；
- 文档同步后的完整 `bun run ci:verify` exit 0、耗时 123.2 秒：1,891 tests / 9,256 expectations /
  14 filtered / 0 fail，production coverage 84.23% lines / 86.66% functions，5,744 modules / 5,506 dependencies /
  0 violations，345-source anti-overfit、1,059-path hygiene、25 个 AGENTS、全部类型检查、dnd5e 5.3.3 reference、
  Web build 与 White Tusk Shaman 离线 Actor smoke 均通过；artifact verifier 随后再次通过；
- 尚未完成精确 2×2 Token 放置、现有武器前后字节比较或 Actor 导出/读回；远程生产 8080 未接触，长期跑团未验收。

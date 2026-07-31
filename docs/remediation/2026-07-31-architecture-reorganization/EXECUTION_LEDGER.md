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
| 4. 独立 module/ops 产品拆分 | in_progress | 4A、4B、4C 已验收；4D Monster Spell Resolver 按既定条件延后 |
| 5. 数据、reference 与 runtime root | in_progress | 5A/5B 盘点与范围门禁、5C.1 只生成方案和独立 reference cache root 已完成；实际目标、复制、切换与全消费者适配尚未开始 |
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

## 当前停止点

阶段 5C.1 已形成一个可安全暂停的检查点：真实迁移方案和 reference cache 外置配置均已完成并双验收，但
没有目标盘，也没有任何复制授权；当前提交的完整 CI 已在 2026-08-01 刷新通过。下一批先做“外置 root 消费者适配”，从独立 module installer、companion
和 icon 工具开始，再处理 world audit、classpack/Monster Spell Resolver 的精确路径安全约束；每个产品继续
保持自己的独立边界和回归测试。只有所有当前工具在临时外置 fixture 下解析到相同资源后，才向用户询问具体
目标盘和复制批次。之后仍必须 copy-first、逐批 hash/count 对账、恢复抽样、短时本地 Foundry 验收和旧路径
兼容窗口；任何大规模复制、切换、移动、删除以及四小时监测都不在未授权范围内。

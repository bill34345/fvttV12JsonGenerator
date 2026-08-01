# Agent Notes

## 项目目标

- 本项目把 Obsidian 中的中文 YAML/Markdown、英文 bestiary Markdown，以及经正式 Intake 接受的文本资料，转换为 Foundry Virtual Tabletop（Foundry VTT）dnd5e Actor/Item JSON。
- 默认输入位于 `obsidian/dnd数据转fvttjson/input`，默认正式输出位于 `obsidian/dnd数据转fvttjson/output`。
- 最终交付物必须由项目 CLI 或正式 workflow 生成；不得手写、手工修补或把临时 JSON 冒充正式结果。

## 每次任务开始的硬门禁

- `AGENTS.md` 在整个任务中生效。第一次工作更新必须明确说明：
  - `AGENTS.md` 已生效；
  - 本次使用的项目路径（CLI、workflow、parser、Web、Foundry module、Foundry Ops 等）；
  - 什么才算有效完成。
- 修改任一目录前，读取该目录路径上最近的局部 `AGENTS.md`。根文件提供全局规则，局部文件只补充该功能的差异规则；明确的用户要求优先。
- 工作区有未提交修改时，以当前工作区为事实来源。不得从 `HEAD` 创建一个丢失脏改动的 worktree，也不得覆盖、丢弃、暂存或提交无关用户改动。
- 对非微小任务，开始前从用户目标提炼机械验证和语义验收标准。命令退出码、测试通过、文件存在或 JSON 可解析都不能单独证明任务完成。

## 权威状态与恢复入口

- 长期整改总账：`docs/remediation/2026-07-15-project-hardening/EXECPLAN.md`。
- 架构重整计划：`docs/plans/2026-07-31-project-classification-and-architecture-reorganization.md`。
- 架构执行记录：`docs/remediation/2026-07-31-architecture-reorganization/EXECUTION_LEDGER.md`。
- 当前支持边界：`docs/acceptance/current-support-matrix.md`。
- Actor JSON 验收方法：`docs/generated-actor-verification.md`。
- 整改或架构任务改动代码前必须读取对应权威计划；每个停止点同步记录进度、发现、决定、验证证据和精确剩余工作。
- 不得因为目录迁移、测试通过或工具返回成功而关闭 finding；只有机械验证和真实语义验收都有记录时才能关闭。

## 功能地图

| 功能 | 人话说明 | 当前目录 | 局部说明 |
|---|---|---|---|
| 公共领域包 | 数据契约、解析、生成、工作流、Intake、纯文本导入、爬虫和图片资产 | `packages/` | `packages/AGENTS.md`，并读取对应功能目录的 `AGENTS.md` |
| 命令行应用 | 用户从终端运行的转换入口；`src/index.ts` 是兼容入口 | `apps/cli/` | `apps/AGENTS.md`、`apps/cli/AGENTS.md` |
| 网页应用 | 上传、后台任务、预览和下载 JSON/ZIP 的中文 Web 工具 | `apps/web/` | `apps/AGENTS.md`、`apps/web/AGENTS.md` |
| Foundry 模块 | 安装进 Foundry 浏览器运行时的独立发布物 | `foundry-modules/` | `foundry-modules/AGENTS.md` 和模块自己的 `AGENTS.md` |
| Foundry 运维工具 | 本地实验环境、资产盘点、离线世界检查和经授权的生产只读盘点 | `tools/foundry-ops/` | `tools/AGENTS.md`、`tools/foundry-ops/AGENTS.md` |
| 怪物法术解析器 | 在目标世界中把可移植法术清单解析为世界已有法术 | `foundry-modules/monster-spell-resolver/` | `foundry-modules/AGENTS.md`、`foundry-modules/monster-spell-resolver/AGENTS.md` |
| 兼容层 | 为旧导入路径和旧命令保留的薄适配器，不是新实现归属地 | `src/`、`scripts/` 的标注路径 | 修改前先找到上表中的真实 owner |

## 正式转换路径

- Actor JSON 默认路径：源 Markdown → `apps/cli` 或 Web → `@fvtt-json-generator/workflows` → parser/generation → 正式 JSON。
- 站点抓取路径：`src/tools/crawlSites.ts` → `packages/crawl-goddessfantasy` → crawl artifacts → plaintext → 既有 Intake/generator 流程。爬虫不得与主 Actor CLI 偷偷耦合。
- 默认从 `obsidian/dnd数据转fvttjson/input` 读取，从 `obsidian/dnd数据转fvttjson/output` 交付；用户明确指定其他位置时除外。
- 若偏离正式项目流程去“先手工做出一个能用的结果”，立即停止、明确说明并回到项目路径。
- 生成 Actor JSON 后必须按照 `docs/generated-actor-verification.md` 对照源 Markdown；结构正确、测试通过和成功生成都不足以证明语义正确。

## Foundry 环境分层与安全边界

- 远程服务器的 8080 Foundry 实例是本项目唯一生产环境。本地 Foundry、fixture、mirror、临时世界和短时 smoke 都不是生产；任何生产读取或修改仍需当前任务中的单独授权。
- 不得自主启动、维持、看守、轮询或拼接任何超过 30 分钟的 Chrome、Foundry、Session Monitor、性能、内存或 soak 运行。
- 四小时 Session Monitor 验收只由用户在真实跑团中运行。代理可以准备命令、存储/隐私预检，并在结束后分析用户导出的证据。
- `F:\FoundryLab\foundry-v14` 是持久保留的本地 Foundry v14 集成测试环境，使用配置后的 `FVTT_OPS_LAB_ROOT`；它可以提供真实版本运行组件、短时启动和一次性测试世界，但不得被普通 fixture 当成可递归删除或任意损坏的临时根。
- 完整上游参考缓存当前通过用户级 `FVTT_REFERENCE_CACHE_ROOT` 外置到 `F:\FoundryLab\reference-cache`；Git 只跟踪 `references/` 中的 manifest、版本锁和小型 provenance。仓库 `.local/references` 暂时保留为兼容副本，`F:\FoundryLab\reference-cache.drifted-20260801` 是隔离的旧漂移副本；两者未经单独授权都不得删除或重新当作主缓存。
- 会故意删除、损坏、锁定、替换路径、制造链接或测试失败恢复的自动测试，必须把所有可变 app/data/world/backup/evidence 目标放进本次测试创建的随机临时目录。允许只读加载 F 盘 Foundry 14.364 的 `classic-level`，不得复制整套 Foundry，也不得把其 app/data 目录传给破坏性测试。
- 不要重新假定仓库 `.local/foundry-v14` 仍存在，也不要重建旧路径或扫描整机猜测路径。
- `C:\Users\Administrator\AppData\Local\FoundryVTT` 是桌面默认数据壳，不是本项目已验证的测试镜像。
- 凭据、Cookie、浏览器 profile、私钥和生产目标不得写入仓库、日志、测试 fixture 或最终报告。
- 删除、移动、覆盖真实数据前，必须精确解析绝对目标、证明目标身份、确认备份/恢复路径，并取得覆盖该动作的明确授权。

## 目标版本与证据

- 默认目标：Foundry VTT v12、dnd5e 4.3.9、effect profile `core`；可选 `modded-v12` 使用 MIDI-QOL 12.4.27.1、DAE 12.0.18、Times Up 11.3.20、Item Macro 2.2.0。
- 显式 v14 目标：Foundry VTT 14.364、dnd5e 5.3.3、effect profile `core` 或 `modded-v14`；`modded-v14` 锁定 MIDI-QOL 14.0.11、DAE 14.0.12，不使用 Times Up，Item Macro 不是已证明的必需依赖。
- 不得用 `modded-v12` 语义证明 v14 正确，也不得默认使用“最新版”文档。
- 模块相关行为优先查 `references/` 中的 tracked provenance 和配置后的完整 reference cache；缺失时才使用精确版本的 Context7 或官方包/源码。
- 不得凭记忆推断 module flags、hook 名、macro pass、Active Effect 字段或兼容行为。最终验证记录必须注明查过的版本化来源。

## 代码与测试公共规则

- 除非任务明确要求重构，不扩大行为范围，不在同一修改中混入无关 bug fix、新功能和结构调整。
- parser bug 必须增加或更新 fixture-backed 测试。
- 结构输出变化必须使用 `assertEqualStructure()` 或更严格的等价检查。
- 测试默认不依赖网络，除非测试对象本身就是翻译、抓取或经授权的外部集成。
- 全仓和 Foundry 自动测试必须通过 `package.json` 中的安全包装命令运行；包装器会创建随机临时沙箱、把所有可写 Foundry 根重定向进去并清除生产变量。内部 `*:raw` 脚本不得作为人工入口。
- parser/generation/inference 变更必须遵守局部 anti-overfit 规则，并运行 `bun run audit:anti-overfit` 或 `bun run audit:anti-overfit:all`。
- 修改最终 Actor 语义时，至少检查两个应命中的真实例子、一个接近但不应命中的反例和一个不相关对象，并对照真实输入/生成 JSON 做人工语义检查。

## 公共命令

- 安装锁定依赖：`bun install --frozen-lockfile`
- 全部测试（临时沙箱、有界并发）：`bun run test`
- 根 TypeScript 配置检查：`bun run typecheck:all`；完整仓库还需 package/app/module/tool 分类检查，统一由 `ci:verify` 执行。
- 完整仓库门禁：`bun run ci:verify`。它会自动创建 Windows 临时沙箱，把 Lab/evidence/backup 等可写根限制在沙箱内，清除远程生产变量，只把 F 盘 Foundry 14.364 的 `classic-level` 作为只读测试依赖传入，并在结束时校验后删除沙箱。
- 架构依赖与循环：`bun run architecture:verify`
- Actor 离线 smoke：`bun run smoke:actor:offline`
- 单文件转换：`bun run src/index.ts "obsidian/dnd数据转fvttjson/input/example.md" -o "obsidian/dnd数据转fvttjson/output/example.json"`
- Vault 同步：`bun run sync:vault`
- Actor 验证：`bun run verify:actor <source.md> <output.json>`
- AGENTS 分层检查：`bun run agents:check`

## 完成与汇报标准

- 机械层：记录执行过的检查、命令和结果；没有运行的检查必须明确写出。
- 语义层：阅读或运行最终结果，说明它为何满足用户目标；数据转换要抽样对照输入输出，文档要阅读最终文字，运行时功能要区分本地 smoke 与真实生产/长时验收。
- 后续发现不符合用户目标时，主动推翻先前结论，说明失败点和最小修复范围；不得用“测试绿了”掩盖语义失败。
- 最终答复必须分别说明已通过的机械验证、人工/语义验收和仍存在的风险或未完成外部验收。

## AGENTS.md 维护规则

- `.ruler/AGENTS.md` 是根说明唯一编辑来源；根 `AGENTS.md` 是生成副本，不得只修改其中一份。
- 根文件只保存全局规则和功能导航；局部文件只写所属功能的用途、范围、特殊禁令、修改入口、验证和完成标准，不复制整段根规则。
- 架构、入口、权限、支持版本或验证命令变化时，在同一修改中更新对应 `AGENTS.md`。
- 详细用户教程放 README，逐步生产/恢复操作放 runbook，长期进度与证据放 ExecPlan/Ledger，可重复自动流程才放 Skill；不要把历史日志堆进 `AGENTS.md`。
- 提交前运行 `bun run agents:check`，确认根生成副本、路由、必需文件和退役路径没有漂移。

## 项目理解缓存

- 用户要求项目理解、架构审查、影响分析或代码库导航时，`project-understanding` 可以在根目录创建或更新 `.pui/`，无需额外编辑授权。
- `.pui/` 是本地工具缓存，不是源码或交付物；除非用户明确授权代码修改，不得借项目理解任务修改源码。

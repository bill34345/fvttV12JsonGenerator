# Agent Notes

## 项目与默认目标

- 本项目把 Obsidian 中文 YAML/Markdown、英文 bestiary Markdown 和正式 Intake 接受的文本，转换为 Foundry Virtual Tabletop（Foundry VTT）dnd5e Actor/Item JSON。默认输入、输出分别位于 `obsidian/dnd数据转fvttjson/input` 与 `obsidian/dnd数据转fvttjson/output`。
- 最终交付物必须由项目 CLI 或正式 workflow 生成；不得手写、手工修补或把临时 JSON 冒充正式结果。
- 用户未指定目标时，代理必须显式使用 `--fvtt-version 14 --effect-profile core`，并按 Foundry `14.364` / dnd5e `5.3.3` 验证。这是代理操作默认，不改变 CLI/Web 的历史产品默认；用户明确要求 v12、`modded-v14` 或其他已支持目标时按请求执行。
- 版本相关行为优先查 `references/` 的 tracked provenance 和配置的完整 reference cache；缺失时才查精确版本官方源码/文档。不得凭记忆或“最新版”推断 flags、hooks、schema 或模块行为。

## 每次任务开始的硬门禁

- 第一次工作更新必须说明：`AGENTS.md` 已生效、本次使用的功能路径、机械验证与真实语义验收分别是什么。
- 修改目录前读取路径上最近的局部 `AGENTS.md`。根文件只放全仓不变量和导航；局部文件只补该 owner 的用途、边界、入口和验收。
- 只读审计可在主工作区执行；任何会修改仓库的任务必须按 [`docs/runbooks/worktree-development.md`](docs/runbooks/worktree-development.md) 创建唯一、短寿命的 sibling worktree 和 `codex/<timestamp>-<task-slug>` 分支，不得直接在 `master` 工作区开发。
- 创建 worktree 前检查 `git status --short --branch` 和 `git worktree list --porcelain`。若任务不依赖主工作区未提交成果，从已提交的 `master` 建立；若依赖，停止并让用户决定如何整合，禁止自动 stash、自动提交或忽略相关成果。
- 保护所有无关 tracked/untracked 用户文件；不得覆盖、丢弃、暂存或提交任务范围外的改动。

## 功能与权威入口

| 功能 | Owner | 局部说明 |
|---|---|---|
| 公共契约、解析、生成、workflow、Intake、纯文本、爬虫、图片 | `packages/` | `packages/AGENTS.md` 及最近的 package `AGENTS.md` |
| CLI 与 Web 用户入口 | `apps/` | `apps/AGENTS.md`、`apps/cli/AGENTS.md`、`apps/web/AGENTS.md` |
| 独立 Foundry 浏览器模块 | `foundry-modules/` | `foundry-modules/AGENTS.md` 及模块自己的 `AGENTS.md` |
| 本地 Lab、离线世界、资产与生产只读盘点 | `tools/foundry-ops/` | `tools/AGENTS.md`、`tools/foundry-ops/AGENTS.md` |
| 旧导入路径与旧命令兼容层 | `src/`、`scripts/` 的标注路径 | 先找到以上真实 owner，不在兼容层新增实现 |

- 当前支持边界：`docs/acceptance/current-support-matrix.md`。
- Actor/Item 来源语义验收：`docs/generated-actor-verification.md`。
- 长期整改与架构记录：`docs/remediation/2026-07-15-project-hardening/EXECPLAN.md`、`docs/plans/2026-07-31-project-classification-and-architecture-reorganization.md`、`docs/remediation/2026-07-31-architecture-reorganization/EXECUTION_LEDGER.md`。
- 整改或架构任务改代码前必须读取对应权威计划，并在停止点同步证据、决定和精确剩余工作。

## 全仓不变量

- 正式 Actor 路径是源 Markdown → CLI/Web → `@fvtt-json-generator/workflows` → parser/generation → verifier → 正式 JSON；Intake 只有达到对应 promotion gate 才能进入正式输出。
- 生成 Actor/Item 后必须按 `docs/generated-actor-verification.md` 对照来源。文件存在、JSON 可解析、schema/test/verifier 绿色只属于机械证据。
- 代理生成需要图标的 JSON 时默认保持 `--icon-mode off`；只有用户明确要求才启用 `safe` 或人工确认的 override。
- 除非任务明确要求，不混入无关重构、bug fix 或新功能。parser bug 必须有 fixture-backed 回归；结构输出变化使用 `assertEqualStructure()` 或更严格检查；parser/generation/inference 变更执行局部 anti-overfit 门禁。
- 测试默认离线，并通过 `package.json` 的安全包装入口运行；不得把内部 `*:raw` 脚本当人工入口。
- 凭据、Cookie、浏览器 profile、私钥、真实生产目标和未脱敏日志不得进入仓库、fixture 或最终报告。
- 项目理解任务可以创建/更新 `.pui/`；它是本地缓存，不授权修改源码。

## Foundry 环境与权限

- `F:\FoundryLab\foundry-v14\data\server-mirror` 是可自主使用的本地 v14 测试环境。先核对 PID、端口、路径和运行者；若被其他参与者占用则等待/协调，不擅自停止，也不复制另一整套 Lab。世界选择和恢复规则见 `tools/foundry-ops/AGENTS.md`。
- 远程 8080 是唯一生产环境。production inventory/acquire 等只读动作无需逐次询问，但仍必须通过目标身份核对、`--apply`、`--allow-production-read` 和外部 `FVTT_OPS_PRODUCTION_*` 配置。
- 生产安装、重启、世界 hydration、迁移、LevelDB 或任何其他写入必须再次取得明确授权；本地 smoke、生产接受和长时接受必须分别报告。
- 不得自主启动、等待、轮询或拼接超过 30 分钟的 Chrome、Foundry、Session Monitor、性能、内存或 soak；四小时真实会话由用户运行，代理只做事前预检和事后分析。
- 破坏性 fixture 的所有可写 app/data/world/backup/evidence 必须位于该测试创建的随机临时根；持久 Lab 和 reference cache 不得作为破坏性目标。

## 删除与发布安全

- 本任务创建的临时文件/目录在解析绝对路径、核对身份和范围后可以删除；PowerShell `Remove-Item` 仍遵守全局禁止 `-Force` 的规则。
- 删除任务开始前已存在的 tracked 文件必须先询问；未知既有 untracked 文件必须保留。
- worktree/branch 只有在证明由本任务创建、状态 clean、改动已按授权集成并推送后才能清理；细节见 worktree runbook。
- commit、合并和 push 需要一次明确发布授权。发布前必须证明主工作区索引为空、topic 与既有 dirty/untracked 路径不重叠、用户基线保持不变；无法证明时停止，禁止 stash 或在其他 worktree 背后更新 `master` ref。

## 关键命令

- 安装锁定依赖：`bun install --frozen-lockfile`
- 生成根说明：`bun run agents:generate`
- AGENTS/Ruler 分层检查：`bun run agents:check`
- 全部测试：`bun run test`
- 完整仓库门禁：`bun run ci:verify`
- 架构依赖与循环：`bun run architecture:verify`
- Actor 离线 smoke：`bun run smoke:actor:offline`
- Actor 来源验证：`bun run verify:actor <source.md> <output.json>`

`<source.md>` 与 `<output.json>` 分别替换为本次真实来源 Markdown 和由正式 workflow 生成的 JSON 路径；不得把示例占位符原样执行。

## 完成与维护

- 最终报告分开列出：执行过的机械检查；人工/语义验收及样本；本地 Lab、生产或长时验收中尚未进行的层级；仍有的风险。
- 后续发现结果不符合用户目标时，必须推翻先前结论，说明失败点和最小修复范围，不能用测试绿色掩盖语义失败。
- `.ruler/AGENTS.md` 是根说明唯一编辑源；根 `AGENTS.md` 只能由项目锁定的 Ruler 生成，禁止手工同步。局部 `AGENTS.md` 直接维护，但不得复制根规则。
- 详细教程放 README，逐步操作/恢复放 runbook，长期进度放 ExecPlan/Ledger，可重复且按需加载的流程才放 Skill。
- 提交前运行 `bun run agents:generate`、`bun run agents:check`，并阅读最终根/局部文档确认作用域、链接和表达正确。

## 用户明确授权的无备份运维规则（2026-08-13）

- 用户已明确要求：以后本地和线上任何任务都不创建备份；不要把“在线人数必须为零”作为已授权生产操作的执行门槛。执行仍须记录实际目标、前后文件清单、SHA-256、进程、端口和日志结果。
- 该规则不扩大任务授权：生产写入仍须有当次明确授权、精确目标核对；不得直接编辑运行中的世界 LevelDB，不得升级 Foundry/dnd5e，不得触碰未授权实例。生产线上只允许操作授权的 `8080`；`51020` 仍保持只读。
- 不保留旧副本，不使用临时复制、隐藏目录或“回滚目录”变相创建备份；失败时停止、报告，并等待新的明确修复授权。

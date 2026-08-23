# Forge FVTT Task D：Intake 与 review-required 垂直闭环

日期：2026-08-24

## 1. 结论与编号重基线

Task D、E、F、G 不合并实现。

| 实际 Task | 对应产品路线阶段 | 依赖与边界 |
|---|---|---|
| D | Phase F：Intake 与 review-required | 依赖 Task B Actor create-only 和 Task C Item create-only；本计划覆盖 |
| E | Phase G：Collection、source library 与可恢复任务 | 依赖 Task D 稳定的单对象审阅状态与导出结构；单独计划 |
| F | Phase H：其他能力产品化决策 | 只能合并做只读产品决策；不同能力的实现仍应拆分 |
| G | Phase I：发布、兼容与可靠性 | 必须最后执行；不得与功能开发并行宣称发布就绪 |

旧产品 Plan 第 13 节曾把“Task D”称为 Actor create-only；实际执行已由 Task B 完成 Actor、Task C 完成 Item。本文件按实际交付历史把 Task D 重基线为产品路线的 Phase F。旧 Plan 和浏览器架构修订保持原文，不做事后改写。

Task D 内部的 plaintext Actor、AI Monster Intake、AI Item Intake 共用一个审阅状态机和安全边界，且按该顺序分阶段通过门禁，因此可以放在同一 Task D 中；它们不能与批量恢复、其他产品类型或发布工作合并。

## 2. 目标、基线与 Goal

Task D 的用户结果是：GM 在 Foundry 中先看到单个 Actor 或 Item 的来源、抽取结果、证据、诊断和修复历史，再决定拒绝、请求一次有界修复、重新分析或生成候选；只有完整链路最终为 `accepted` 的结果才可以进入 Task B/C 已有的世界 Document create-only/readback 适配器。

固定目标为 Foundry `14.364`、dnd5e `5.3.3`、`core`、`iconMode: off`。

计划编写基线：

- 产品 WorkTree：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20260822-150000-forge-fvtt-product`
- 产品分支：`codex/forge-fvtt-product`
- Task C 集成提交：`df11d86fe67b4a798ccb55cf7a5c9d18b5285272`
- 本计划 WorkTree：`I:\OpenCode\fvttV12JsonGenerator-worktrees\20260824-014602-forge-fvtt-intake-task-d-plan`
- 本计划分支：`codex/20260824-014602-forge-fvtt-intake-task-d-plan`

开始实现时第一步调用 `create_goal`，不设置 `token_budget`，objective 精确使用：

> 完成 Forge FVTT Task D 的 bounded Intake 与 review-required 垂直闭环：基于用户确认的 codex/forge-fvtt-product 精确提交创建独立 WorkTree，为 plaintext Actor、AI Monster Intake 和 AI Item Intake 建立浏览器可审计 review workspace，严格保持 needs_review 阻断，只让 accepted 单对象结果进入既有 Actor/Item create-only adapter，并完成自动门禁、独立 Code Review 和真实 Foundry E2E；未经授权不 commit、push、merge 或清理 WorkTree。

实现 WorkTree 必须从届时用户确认、且已包含本计划的 `codex/forge-fvtt-product` 精确提交创建；不得从 `master`、旧 Plan WorkTree、Task B/C 临时分支或其他功能分支派生。开始时记录精确 base SHA，不把上面的计划编写基线冒充未来实现基线。

Goal 在代码、机械门禁、父任务语义核对、独立 Review、真实 Foundry E2E 和精确清理证据全部通过前保持 `active`。上下文压缩、单阶段完成或测试绿色都不是完成条件。

## 3. 当前事实与 Task D 的真实缺口

### 已有能力

- Task B 已提供 `convertRawActorSourceWithAi()`：浏览器内完成 Monster discovery、extract、validate、bounded repair、render、generate、AI review 和最终状态合并；Forge Actor UI 能显示阶段、findings、evidence、最终 Markdown，并严格阻止非 accepted Actor 创建。
- Task C 已提供独立 Item protocol、确定性 browser runtime、Forge Item UI、世界 Item create/readback、重复保护和冲突门禁。
- Node/CLI/Web 的 AI Monster Intake 已有 source-scoped evidence IR、deterministic validator、renderer、formal workflow、review、repair、run bundle 和 `needs_review` promotion gate。
- Node/CLI/Web 的 AI Item Intake 已有独立 Item evidence IR、provider prompt versions、validator、renderer、formal Item generation/review、run bundle 和 promotion gate；当前 support matrix 只声明 exact-target static/application partial acceptance。
- legacy `ingest-plaintext` 已有确定性单/多实体切分、规范化、Markdown 投影和 audit，但 owner 仍包含 Node 文件 I/O，也不构成 Forge 浏览器审阅闭环。

### Task D 必须补齐的缺口

- Task B 的 AI Monster 路径仍是“一次调用跑到最终结果”，没有独立、可操作、可导出的 review workspace，也没有用户可见的拒绝、修复和重新生成闭环。
- plaintext Actor 没有 browser-safe、单对象、先审阅后生成的入口。
- AI Item Intake 的规则和 IR 已存在，但 Node orchestrator 依赖文件系统；Forge browser runtime 和 Item 世界闭环尚未连接。
- 当前 UI 没有统一展示 provider/model/prompt version、修复次数、review verdict、来源证据和每次尝试之间的身份关系。
- Task D 必须闭合 AI Item 的 bounded Foundry lifecycle gate，但不能把单一样本升级成任意 Item/任意模型支持。

## 4. 不变量与范围边界

### 保持不变

- Forge Gateway Protocol 继续为 v1；Task A/B/C 的 capability、Actor/Item request/response、sourceId、hash、decoder 和 wire shape 不变。
- Actor 与 Item 的来源身份、response、preview 和 world adapter 继续类型分离。Task D 的 review bundle 不是 Actor/Item response，也不能作为 world adapter 的替代输入。
- 普通 CLI/Web Actor/Item 输出路径、原始 JSON、hash、run bundle 和 resume 行为保持兼容。
- 只有 decoded response、formal verification 和 Intake review 三者均为 `accepted`，且零 warning/error/blocking finding，才允许世界写入。
- `needs_review`、`failed`、`rejected`、过期 snapshot、多候选、多 artifact、未知 target 或非 GM 始终零世界写入；界面不得提供“仍然继续”“忽略并创建”或手工提升状态。
- 所有世界写入继续只调用 Task B/C 已有的 Foundry Document API adapter；不直接编辑 LevelDB，不另写第二套 create/readback/rollback 规则。
- 同一最终 canonical source 必须同时进入 type-specific sourceId、source hash、parser、generation、verification 和 artifact hash；raw source 另有不可变 `rawSourceHash`。
- browser runtime 不依赖 Node、Bun、filesystem、CLI/Web server、Windows、SSH、Sharp 或 Crawlee。

### 明确不进入 Task D

- 多 Actor/Item 批量审阅、Collection/ZIP、source library、resume/import review bundle、后台可恢复任务和跨会话队列；它们属于 Task E。
- 既有 Actor/Item 更新、覆盖、按名称去重、world folder 管理、embedded Item 产品入口或自动附加到 Actor。
- Species、Class、Feat、Spell、PC Builder、document ingest、PDF/OCR/image Intake、GoddessFantasy crawl、翻译、Vault Sync、icon safe mode、Codex OAuth Companion 或 Gateway 服务端。
- 任意文本、任意 Item、任意模型质量、生产环境、Foundry/dnd5e 升级或外部模块组合。
- review bundle 导入或断点恢复。Task D 只导出；未来 Task E 若消费，必须另写兼容和冲突计划。

## 5. Review bundle 与状态机

新增独立、严格投影的 `ForgeIntakeReviewBundleV1`，使用 Actor/Item 判别联合，不扩展 Forge Gateway Protocol。它至少保存：

- schema/version、object kind、mode、request/attempt identity；
- 原始来源及 `rawSourceHash`、单一 candidate 范围和引用片段；
- evidence IR、claims、coverage、uncertainties；
- deterministic findings、AI review findings、review verdict；
- provider name、extraction/review model、prompt contract versions、各阶段调用次数和修复次数；
- canonical source、type-specific sourceId/finalSourceHash（仅在已生成时）；
- generator/target identity、候选 response 的安全投影和最终状态；
- 用户执行的 reject、repair、regenerate 动作历史。

bundle 严禁包含 API Key、Authorization header、Cookie、完整 endpoint、完整 provider request/response、内部路径、cache、Node workflow 对象、世界数据或未声明字段。浏览器导出是用户主动下载的 JSON，明确提示其中包含原始来源文本；相同 run 的导出必须稳定，非语义时间戳不进入 hash 或验收投影。

UI 状态机至少区分：

```text
empty
  -> analyzing
  -> ready_to_generate | needs_review | failed
ready_to_generate
  -> generating_and_reviewing
  -> accepted | needs_review | failed
needs_review
  -> repairing -> ready_to_generate | needs_review | failed
  -> regenerating -> analyzing
  -> rejected
accepted
  -> committing_and_reading_back -> accepted
```

- `ready_to_generate` 只表示 evidence/IR deterministic gate 无阻塞项，仍没有 creatable artifact。
- `repair` 只允许 provider 根据当前 immutable source、IR 和 findings 做一次有界修复，然后从 deterministic validation 开始完整重验；不能通过 decision/override 修改 source claim。一个 attempt 最多一次 repair，耗尽后只能修改来源或显式开启新的 regenerate attempt。
- `regenerate` 创建新的 attempt identity，但仍绑定同一个当前 UI snapshot；旧 attempt 永不回填。
- `reject` 终止当前 attempt、清除 creatable response，但保留可导出的审阅记录；拒绝不能改成 accepted。
- `accepted` 仍须在每次渲染和点击创建时重验动态 GM、target、snapshot、response decoder、verification、diagnostics 和 findings。
- 来源、display name、mode、object kind、endpoint identity、model、review model 或 target 变化立即使旧 review/preview 过期并中止旧请求。API Key 不进入 snapshot、日志或 bundle。

## 6. 三条 Intake 路径

### 6.1 Plaintext Actor

- 从 `ingest-plaintext` 提取 browser-safe 的纯切分、规范化、单实体解析和 audit 投影；Node 文件读写 workflow 继续只是 adapter。
- Forge 只支持一次一个实体。零实体、多实体、边界重叠、无法可靠识别、audit warning/error 或来源覆盖缺口均返回 `needs_review`，不静默取首项。
- 生成 `IngestedCreatureFile` 的安全审阅投影、source range/原文引用和 canonical Markdown；先展示后进入现有 `buildForgeActorRequest()` / `convertFinalActorSource()`。
- 不调用 AI normalizer，不吞异常，不写中间文件，不宣称 legacy collection 已浏览器化。
- 规范 YAML/English bestiary Markdown 的 Task B 直接路径保持原行为；plaintext 模式不能抢占或猜测 canonical 模式。

### 6.2 AI Monster Intake

- 把现有 browser AI Monster pipeline 拆成可暂停的 analysis、repair、generation/review 阶段，同时保留 `convertRawActorSourceWithAi()` 作为兼容 facade；旧调用结果和 accepted Actor response 保持兼容。
- 复用 `intake-ai` 的 discovery normalization/partition、IR validator、renderer、verifier、provider schemas 和 prompt versions，不复制第二套规则。
- 第一次 analysis 先返回 candidate、evidence IR 和 deterministic findings。只有单候选且无阻塞项才进入 `ready_to_generate`。
- 生成后把同一 canonical Markdown 交给正式 Actor runtime；AI review、formal response 和 deterministic verifier 任一非 accepted 均合并为 `needs_review`/`failed`。
- 多候选、无候选、evidence 漂移、repair 后仍阻塞、provider `revise/needs_review`、formal warning/error 都没有 artifactHash，不可创建。

### 6.3 AI Item Intake

- 新增 browser-safe Item provider/Intake core，直接复用 `ITEM_INTAKE_PROMPT_VERSIONS`、Item IR、validator、renderer、locked dnd5e `5.3.3` spell evidence、正式 Item parser/generator/verifier 和 Task C deterministic Forge projection。
- Node `runItemIntake()` 继续负责 run directory、manifest、promotion、resume 和 Vault adapter；纯分析/验证核心与浏览器共享，Node/CLI/Web 现有输出不得变化。
- 一次只接受一个 Item candidate 和一个最终 Item artifact；多 candidate、多 stage/multi-artifact、无法唯一解析的 spell 或不完整 evidence 一律 `needs_review`，不得选第一个。
- accepted 结果进入 Task C 的 `ForgeItemResponse` 和既有 Item world adapter；禁止新增直接 Item.create 路径。
- bounded 正样本使用单阶段的“三祷之坠（休眠态）”来源切片：AC `+1`、action 产生 bright `15` / dim outer edge `30` 且零 charge、`3` 次 dawn recovery、消耗 `1` 次 item use 施展 Invisibility、`spellSlot: false`。完整三阶段“三祷之坠”继续作为 multi-stage 阻断负样本。
- 该正样本通过真实 Foundry lifecycle 只证明 exact target 和上述 mechanics，不升级为任意 Item Intake runtime Pass。

## 7. 浏览器安全与凭据

本计划遵循 `2026-08-22-forge-fvtt-browser-architecture-revision.md`：浏览器直接调用用户配置的 OpenAI-compatible HTTPS endpoint，Codex OAuth Companion 不是 Task D 前置条件。旧产品 Plan 中“模型凭据只在 Companion”的表述已被该修订替代，但旧文件保持不改。

- API Key 默认只在当前内存；只有用户明确勾选后才保存到现有 client-only setting，并持续显示同页其他 Foundry 模块理论上可读取的警告。
- endpoint 只允许 HTTPS、不得带 URL credentials、不得跨站 redirect；401/403、429、timeout、invalid response、browser transport/CORS 使用现有诚实分类。
- review bundle、Forge response、flags、world Documents、Chat、通知、console、诊断、测试快照和截图均不得包含 Key、Authorization 或完整敏感响应。
- Actor 和 Item AI 共用一个模块级活动 AI job 上限；取消只在世界提交前有效。提交后的不可取消边界继续复用 Task B/C 文案和行为。

## 8. Foundry “Forge Intake”审阅工作台

在 `fvtt-json-forge` 中新增独立 GM-only “Forge Intake”菜单、ApplicationV2 和模板；保留现有 “Forge Actor”与“Forge Item”入口、直接模式和测试。

工作台至少提供：

- object/mode 选择：Plaintext Actor、AI Monster、AI Item；
- 原始来源、display name、现有 AI 连接设置；
- 分阶段 Analyze、Repair、Generate Candidate、Regenerate、Reject/Clear、Export Review Bundle；
- 来源片段、candidate 边界、IR/claims/coverage/uncertainties、findings、review verdict、provider/model/prompt version 和修复计数；
- canonical source、安全语义摘要、可展开候选 JSON；
- accepted 后的 type-specific Confirm Create。

创建时不把 review bundle写入 flags。world flags 仍严格使用 Task B/C 已有协议字段、source/hash/artifactHash 和 generator/target identity；适用的 Actor AI rawSourceHash 延续 Task B。审阅 bundle 是本地用户下载物，不是世界状态或恢复日志。

创建前失败零世界写入。Actor accepted 只调用已有 Actor adapter；Item accepted 只调用已有 Item adapter。重复、并发、source/hash 冲突、foreign deterministic-ID collision、readback drift 和 cleanup failure 的行为不分叉。Item 操作继续断言世界 Actor 数量不变；E2E 为验证 Item lifecycle 创建的 disposable Actor 不属于产品 apply 路径，必须精确标识和清理。

## 9. 实现顺序与 GitNexus 门禁

1. 建立 implementation Goal、独立 WorkTree、锁定依赖和精确 baseline evidence；读取根及最近局部 `AGENTS.md`。
2. 刷新 Task D WorkTree 的 GitNexus 索引。修改任何既有函数、类或方法前逐个执行 upstream impact，记录直接调用者、流程和风险。
3. 先定义 review bundle/status/snapshot 测试，再提取 browser-safe 纯核心；Node I/O/promotion 和 browser UI/adapters 保持在边界两侧。
4. 依次完成 Plaintext Actor、AI Monster、AI Item；每一阶段都先通过 focused tests 和真实语义样本，再进入下一阶段。
5. 最后连接新的 Foundry Intake UI、existing Actor/Item adapters、review export 和动态门禁。

用户已明确授权：GitNexus HIGH/CRITICAL 结果不再自动停止。执行时必须先报告 blast radius、直接调用者、受影响流程和风险，优先通过新 facade/adapter 缩小影响，并继续测试；只有发现真实安全边界、授权范围、协议兼容或不可保持现有行为的问题时才停止。

## 10. 自动门禁

### Focused tests

- review bundle：严格安全投影、Actor/Item union、状态转移、unknown/internal-field 泄漏、稳定导出和凭据扫描；
- plaintext：单实体、零/多实体、双语、audit warning/error、来源范围、canonical Markdown、Node/browser parity；
- AI Monster：analysis pause、evidence-first、repair budget、regenerate identity、reject、provider/model/prompt metadata、现有兼容 facade 回归；
- AI Item：browser/Node IR/renderer/verification parity、single candidate/artifact、single-stage Jewel slice、完整 Jewel multi-stage 阻断、unresolved spell、weak evidence；
- stale race：来源、名称、模式、object kind、endpoint/model/target 变化后旧 Promise 不回填；
- Foundry：非 GM、错误 runtime、ready/needs_review/failed/rejected 零写入，accepted type routing，动态点击重验，提交状态锁定；
- adapter 回归：Actor/Item repeat、concurrent、hash conflict、foreign collision、readback drift、cleanup failure；Item 产品操作不改变 Actor 数量；
- security：bundle/build/log/diagnostics/flags 不含 API Key、Authorization、完整 endpoint 或 provider raw payload；browser bundle forbidden-import scan；
- 完整回归 Task B Actor 和 Task C Item 专项测试，以及 CLI/Web AI Monster/AI Item tests。

### 仓库门禁

依次执行适用命令：

```text
bun run typecheck:packages
bun run typecheck:apps
bun run typecheck:foundry-modules
bun run architecture:verify
bun run build:fvtt-json-forge
bun run test:fvtt-json-forge
bun run web:build
bun run agents:generate
bun run agents:check
bun run test
bun run ci:verify
git diff --check
```

另行执行 Intake、plaintext、Forge protocol/runtime/module focused tests，browser bundle forbidden-import/secret scan，Node/browser parity，必要时 anti-overfit，以及最终 `gitnexus_detect_changes`。继承的、与 Task D 无关的基线失败必须单列证据，不得通过修改无关模块掩盖。

## 11. 人工语义验收

父 Sol 必须逐项读取 UI 中的 raw source、candidate/evidence、IR、canonical source、formal response 和 readback，不以测试断言代替：

- Plaintext Actor：一份真实单实体来源的名称、属性、HP/AC、感官、Activity、damage/save/uses 与 canonical Actor/readback 一致；多实体输入停在 review。
- AI Monster：复用一个已有 accepted fixture；检查 evidence ranges、claims/coverage、repair/review history、最终 Markdown、Actor artifact 和 readback 属于同一 raw source/run。
- AI Item：检查单阶段 Jewel slice 的 AC `+1`、15/30 light、3 次黎明恢复、Invisibility 消耗 1 item use 且 `spellSlot: false`；完整多阶段 Jewel 无 artifactHash、不可创建。
- 所有路径：reject、needs_review、failed、stale snapshot 和错误 target 均零残留；review export 无凭据/内部字段且足以复核同一 run。

## 12. 独立 Code Review 门禁

机械与父任务语义证据就绪后，整理相对实现 base 的完整 diff/stat、状态机不变量、实现/测试映射、Node/browser parity、安全扫描、全部门禁、GitNexus 和基线失败。

Goal 保持 active，并进入一次独立 GPT-5.6 Sol 只读 Code Review：检查完整未提交 WorkTree，报告 P1/P2；不得修改、commit、push、merge、stash 或清理。修复全部 P1 和用户指定 P2，重跑受影响门禁；只有用户确认独立 Review 无阻塞 P1 才进入 E2E。

## 13. Luna Max 定向 E2E

Review 清除 P1 后创建独立 GPT-5.6 Luna Max E2E 任务，prompt 写入 Task D 未提交 WorkTree 的精确绝对路径。该任务自行 `create_goal`，使用 `fvtt-local-lab-login` skill，只操作 `127.0.0.1:30001` 的 `cor-cotn`，访问密码字段留空；不备份、不碰生产 `8080/51020`、不改代码、不 commit/push/merge/stash、不直接改 LevelDB。

E2E 至少覆盖：

- 模块安装启用，旧 Forge Actor/Item 入口回归；
- Plaintext Actor evidence-first、accepted create/readback、多实体阻断；
- AI Monster accepted、reject、repair/regenerate、needs_review/failed 零写入；
- AI Item 单阶段 Jewel preview/create/readback、相同 UUID 复用、完整 flags/hash；
- 把本次世界 Item 的临时副本嵌入本次 disposable Actor，仅用于 lifecycle 验证：AC 基线到 `+1`、light Apply Effect 15/30、disable/remove、3 次 charge exhaustion、Invisibility 不消耗 spell slot、dawn recovery；该动作不构成 embedded Item 产品支持；
- 完整三阶段 Jewel、unresolved spell、错误版本和非 GM 阻断；
- 提交前可取消，提交/readback 时显示不可取消并动态锁定；
- review bundle 下载后验证 raw source/hash、evidence、history、provider/model/prompt identity，且无 API Key/Authorization/endpoint secret；
- 最后只删除本次精确创建的 Item、Actor、Token/Effect/Chat 等测试对象，证明对应 sourceId 世界计数和 Actor/Item 基线恢复。

E2E 返回截图、UUID/hash、readback、Activity/lifecycle 数值、bundle secret scan、清理记录及 PASS/FAIL。真实模型调用需要用户提供或已配置的授权凭据；没有真实凭据时 fake-provider 与自动门禁不能替代真实 AI 直连验收，Goal 保持 active。

## 14. 完成与停止条件

只有代码、全部适用机械门禁、父任务语义核对、独立 Review 无阻塞 P1、真实 Foundry E2E PASS、AI Item lifecycle、review export 安全扫描和精确清理全部核实，才调用 `update_goal(status: complete)`。

以下情况立即停止并报告，不通过扩大范围解决：

- 必须复制第二套 parser/generator/verifier/Intake 规则，或 Node/browser 无法保持同一来源语义；
- Task B/C protocol、source identity、create-only、deterministic world ID 或 readback 不变量必须改变；
- 普通 CLI/Web 输出、resume/promotion 行为或既有 Actor/Item 回归发生不可接受变化；
- `needs_review` 只能靠手工 override、选第一个 candidate/artifact 或丢弃 evidence 才能继续；
- review bundle 必须保存凭据、内部路径或 provider raw payload；
- 单阶段 AI Item 无法通过正式 workflow 或真实 lifecycle，或多阶段 Item 只能静默降级；
- 需要 Gateway/Companion、服务端权限、生产、LevelDB、embedded Item 产品功能、批量恢复、任意 Item/文本支持或 Foundry/dnd5e 升级。

Task D 完成不代表 Task E/F/G 或发布完成。commit、合并到 `codex/forge-fvtt-product`、push 和 WorkTree 清理继续分别等待用户明确授权。

# Forge FVTT Task E：可恢复审阅与后续批量路线

- 日期：2026-08-30
- 状态：权威计划草案，等待用户审阅；未授权实现
- 计划基线：`codex/forge-fvtt-product@7cea7c15e321f37ac822bf9766649d43629ec1b4`
- 计划 WorkTree：`C:\Users\Administrator\.codex\worktrees\d42e\fvttV12JsonGenerator`
- 计划分支：`codex/20260830-forge-fvtt-task-e-plan`

## 1. 权威关系与结论

本文件是 Forge FVTT Task E 的独立权威计划。它承接：

- `2026-08-21-forge-fvtt-module-product-execution-plan.md` 的 Phase G；
- `2026-08-22-forge-fvtt-browser-architecture-revision.md` 的 browser-first 与“不复刻 ZIP 交付层”决定；
- `2026-08-24-forge-fvtt-intake-task-d-plan.md` 的单对象审阅状态机、review bundle 导出结构、accepted-only 世界写入和 Task E 停止边界；
- `2026-08-25-forge-fvtt-ai-provider-connections-plan.md` 的 Provider/凭据/长请求边界；
- `2026-08-29-forge-task-d-real-e2e-repair-plan.md` 的 fail-closed 语义修复边界。

Task E 不把“多 Actor/Item 批量审阅、Collection/ZIP、source library、review bundle 导入/恢复、后台可恢复任务、跨会话队列”一次全部实现。当前推荐且唯一进入首个实现切片的是：

> **E1：严格导入 Task D review bundle，在 GM-only Forge Intake 中恢复为只读审阅记录，并由用户显式开启一个全新的、重新验证的 attempt。导入文件无论历史状态如何，都不能直接创建世界 Document。**

source library、批量审阅、apply manifest 和跨会话工作列表属于后续独立切片；真正能在 Foundry 页面关闭后继续运行的后台任务需要新的外部运行时/服务边界，不属于 E1，也不能用“把队列描述保存下来”冒充。

## 2. 接管审计结论

### 2.1 Git、WorkTree 与 Task D 基线

- 当前计划 WorkTree 开始时为 detached、clean，HEAD 精确为 `7cea7c15e321f37ac822bf9766649d43629ec1b4`。
- 本地 `codex/forge-fvtt-product` 与 `origin/codex/forge-fvtt-product` 均指向同一 SHA；Task D 计划提交 `bb8842d2a6f9caaeca5dbd37dc600191950b0d24` 是当前 HEAD 的祖先。
- `7cea7c1` 的提交主题为 `feat(forge): complete governed intake task d`；相对 Task D 计划基线包含 60 个路径、Task D Intake Application、review bundle、Plaintext/AI Monster/AI Item browser core、Provider transport、测试与最终计划证据。
- 产品集成分支的既有 WorkTree 位于 `I:\OpenCode\fvttV12JsonGenerator-worktrees\20260822-150000-forge-fvtt-product`，本计划没有在其中写入。
- 旧 Task D WorkTree 仍位于原路径；本计划不读取、复用、清理或改变其中的浏览器、Lab、Key、Document 或未提交现场。

### 2.2 当前代码已经提供的稳定边界

- `packages/forge-browser-runtime/src/intakeReview.ts` 已定义 Task D 状态机、snapshot、安全 bundle 投影和稳定序列化。
- `ForgeIntakeReviewBundleV1` 保存 raw source/hash、candidate/evidence、findings、provider/model/prompt identity、calls、repair count、canonical source/hash、accepted response 的安全摘要和动作 history。
- Task D 只提供由可信运行时对象构建 bundle 的 builder；当前没有面向不可信 JSON 文件的严格 decoder、版本迁移、大小/深度/数量门禁或导入 API。
- accepted bundle 只保存 `candidateResponse` 的安全摘要，不保存完整 Actor/Item response 或完整 artifact。因此它天然不足以调用世界 adapter；Task E 必须保留这一安全性质。
- `ForgeIntakeApplication` 的 analysis、generation、response、snapshot、history 和 request/attempt identity 都只在窗口内存中；Clear、关闭或页面刷新不会形成可恢复任务。
- Task D 只有 Export Review Bundle；模板和 Application 没有文件导入或恢复动作。
- Actor/Item 世界写入继续分别由 `createAcceptedForgeActor()` 与 `createAcceptedForgeItem()` 承担；它们重新 decode accepted response、核对精确 runtime、使用 type-specific deterministic Document ID、create-only、readback 和冲突/清理规则。
- 模块级 AI job gate 当前只允许一个活动任务；E1 不改变并发上限。

### 2.3 不能直接当作 Task E 浏览器实现的既有能力

- `packages/workflows/src/collectionConversion.ts` 是 Node/filesystem 输出 workflow，直接创建目录和 JSON 文件；它不是 browser-safe collection core，默认值还保留历史产品默认，不能直接导入 Foundry module。
- Node Monster/Item Intake 的 resume 依赖 run directory、manifest、IR 文件和 decisions 文件。Task D review bundle 是更窄的浏览器安全投影，二者不是可互换格式。
- Web `jobStore` 会把 job result 写到临时目录，但活动集合、调度和运行进程仍在内存；现状没有证明进程重启后会自动重新排队或继续未完成请求。它不能作为“跨会话后台队列已经存在”的证据。
- browser-first Forge 没有持久服务端、任意本机文件访问或进程所有权。关闭 Foundry 页面后，浏览器 fetch/Promise/AbortController 不能诚实承诺继续执行。

## 3. 产品优先级与切片决定

| 候选 | 用户价值 | 依赖/风险 | Task E 决定 |
|---|---|---|---|
| Review bundle 导入与恢复 | 直接补上 Task D 刷新/关闭后丢失审阅现场的缺口；已有稳定导出可作为输入 | 需要不可信 JSON decoder、迁移、hash/evidence 复核和不可创建门禁 | **E1，推荐 MVP** |
| Source library | 可搜索、复用来源，减少重复粘贴 | 必须先决定 browser client storage、显式文件库或 Companion；同源其他模块可读取 browser storage，不能假称加密 | E2，先做存储 ADR，再实现 |
| 多 Actor/Item 批量审阅 | 高价值，但状态和部分失败复杂 | 依赖可恢复的单对象记录、稳定 source identity、限额、逐项状态和 apply manifest | E3，E1/E2 后单独批准 |
| Collection | 可以把已有集合输入拆成逐项任务 | Node collection 不是 browser-safe；Actor/Item/Intake 边界不同 | E3 的输入 adapter，不是独立世界写入路径 |
| ZIP | Web 离线下载已有价值 | 浏览器架构修订明确不复刻 ZIP 交付层；ZIP 不等于世界内批量审阅 | 不进 E1-E3；有新用户结果时另立产品计划 |
| 跨会话工作列表 | 页面重开后知道哪些项待处理 | 依赖持久 record、迁移、配额和清理策略 | E4a；只恢复描述和状态，不声称后台仍在跑 |
| 真后台可恢复任务 | 页面关闭后 AI/生成仍继续 | 需要 Companion/Gateway/服务端 job owner、凭据和认证威胁模型 | E4b，新的架构与授权，不由 Task E MVP 默认实现 |

## 4. E1 用户结果与完成定义

GM 可以在 Foundry 14.364 / dnd5e 5.3.3 的 Forge Intake 中选择一个 Task D 导出的 review bundle：

1. 系统在任何状态恢复前严格解析、验证版本、对象类型、大小、来源 hash、evidence ranges/quotes、canonical hash、状态与 accepted 摘要的一致性；
2. 合法 bundle 被显示为**导入的只读历史记录**，完整呈现来源、candidate、evidence、findings、provider/prompt identity、calls、repair 和 history；
3. 导入不会调用 Provider、不会测试连接、不会生成 artifact、不会触发 Actor/Item adapter、不会写 settings/世界/Chat；
4. 历史 `accepted` 只表示“该 bundle 记录了过去的一次 accepted 结果”，Confirm Create 仍保持禁用；
5. 用户可以选择“以当前来源开启新 attempt”。系统只预填 raw source、mode 和可安全推导的显示标签；用户确认当前 target、显示名和 AI 连接后，生成新的 requestId/attemptId/snapshot，并从 Analyze 重新进入 Task D 正式状态机；
6. 新 attempt 的导出保留 `recoveredFrom` lineage，但世界 adapter 仍只接受该新 attempt 重新产生的完整、当前、decoded accepted response；
7. 非法、篡改、过大、未知版本或不兼容 target 的 bundle 被拒绝，既有工作台状态不变且零外部副作用。

只有机械门禁与真实 Foundry 语义验收都通过，才可以说 E1 完成。E1 完成不代表 source library、批量、队列或发布完成。

## 5. E1 范围与非范围

### 5.1 进入 E1

- browser-safe 的 `ForgeIntakeReviewBundleV1` strict decoder；
- V1 到内部只读 `ImportedForgeIntakeReviewRecord` 的确定性迁移；
- 新的 Task E bundle 版本，用于记录 `sourceLabel` 与 `recoveredFrom` lineage；旧 V1 序列化字节和 Task D 导出兼容性保持不变；
- 导入前文件大小、JSON 形状、递归深度、数组数量、字符串长度和 source 限额；
- imported/read-only UI、明确历史状态文案、导入错误定位和清除；
- “开启新 attempt”动作；所有 AI/生成/创建继续复用 Task D 入口与门禁；
- V1/V2 round-trip、migration、tamper、stale、GM/runtime、secret scan 和零副作用测试；
- Task B/C/D 回归与真实 Foundry import/recovery E2E。

### 5.2 不进入 E1

- 从 bundle 直接创建 Actor/Item，或把 bundle 转换成伪造 Forge response/artifact；
- 恢复中断的 HTTP/SSE 请求、Provider 内部会话、AbortController 或进行到一半的 repair/generate；
- 导入时自动调用 Provider、自动测试 Key、自动重新分析或自动重试；
- 保存 API Key、Authorization、Cookie、endpoint、provider raw payload、完整 request/response、Node run path 或世界数据；
- source library、批量 collection、批量 apply、ZIP、后台 scheduler、Service Worker、Companion/Gateway；
- update/overwrite、按名称去重、folder 管理、embedded Item 产品入口；
- 生产、Foundry/dnd5e 升级、LevelDB、备份或发布。

## 6. E1 状态机

导入状态与 Task D live review 状态保持分离，不能把历史状态塞回 live state：

```text
live_empty
  -> import_selecting
  -> import_validating
       -> import_rejected -> live_empty
       -> imported_read_only

imported_read_only
  -> clear_import -> live_empty
  -> start_new_attempt -> recovery_draft

recovery_draft
  -> user_confirms_current_fields
  -> live_empty with recoveredFrom metadata
  -> Analyze -> Task D analyzing -> ...
```

硬规则：

- `imported_read_only` 不等于 Task D 的 `accepted`、`needs_review` 或 `failed` live state；历史状态只作为带前缀的显示字段。
- imported record 没有 `response`、live `snapshot` 或 apply capability；Confirm Create 必须保持禁用。
- `start_new_attempt` 不沿用旧 requestId、attemptId、repair budget、calls、Provider 连接测试或旧 response。
- 新 attempt 使用当前页面、当前 target 和当前连接重新构造 snapshot；AI 模式仍要求当前连接测试通过。
- raw source 或 mode 被用户修改后，旧 bundle lineage 只能标记为“由导入来源派生”，不能声称是同一不可变 source；hash 必须重新计算。
- 导入失败是原子失败：不清空当前 live attempt、不改变 connection settings、不改变 AI job gate。

## 7. 数据与安全边界

### 7.1 不可信文件 decoder

decoder 必须先检查 UTF-8 文件总大小，再 `JSON.parse`，并逐字段 exact-key 解码。禁止用 TypeScript cast、`structuredClone(parsed)` 或现有 trusted builder 代替 decoder。

首版硬上限：

- bundle 文件总量最多 4 MiB UTF-8；
- `rawSource` 最多 200,000 UTF-8 bytes，并同时遵守当前 Intake 的 UTF-16 source/range 规则；
- evidence/candidate range 必须为安全整数，满足 `0 <= start <= end <= rawSource.length` 且 `rawSource.slice(start, end) === quote`；
- nested arrays、history、findings、claims、coverage 和 diagnostics 使用集中维护的显式数量上限；上线前以最大合法 Task D fixture 做边界测试，不能设为无限；
- unknown schema/version、unknown key、prototype key、非有限数字、错误 union、重复/乱序 history、非法 sourceId/hash、objectKind/mode 不符、accepted consistency 失败一律拒绝。

decoder 输出新的冻结/深拷贝内部记录；后续 UI 不保留或执行未解码的原始对象。所有不可信字符串以 textContent/escaped template 显示，不使用来源 HTML。

### 7.2 版本与 lineage

- V1 decoder 必须继续接受 Task D 正式导出的合法 V1；不得修改 V1 builder/serializer 的既有输出。
- Task E 新版本只增加恢复所需的安全字段：`sourceLabel` 与 `recoveredFrom`。
- `recoveredFrom` 至少包含原 schema/version、规范化 bundle SHA-256、原 requestId、attemptId、历史 status 与 rawSourceHash；不包含文件路径、导入时间、endpoint 或 Key。
- bundle SHA-256 对严格 decode 后的规范化稳定序列化计算，避免 JSON whitespace/key order 造成伪冲突；原始文件 bytes 可用于错误诊断 hash，但不得进入新导出。
- V1 缺少可靠 display name 时，不猜成最终 Document name；可显示 candidate label，但开启新 attempt 前要求 GM 确认显示名。

### 7.3 accepted-only、GM 与世界边界

- 导入和只读展示仍只存在于 GM-only Forge Intake 菜单；非 GM 既不能打开，也不能通过隐藏 action 调用恢复/create。
- import 可以在 target 不兼容时展示“历史记录不兼容”，但不能开启新 attempt；开启和每个后续动作继续重验 Foundry `14.364`、dnd5e `5.3.3`、`core`、`iconMode: off`。
- imported accepted summary 永远不是 world adapter input。
- 新 attempt 只有 decoded response、formal verification、Intake review 均 accepted，零 warning/error/blocking finding，snapshot 当前且 GM/runtime 当前，才可进入既有 type-specific adapter。
- Task E 不新增 generic Document adapter，不更改 deterministic world ID、repeat、conflict、readback 或 cleanup 行为。

### 7.4 凭据与持久化

- 导入、decoder error、UI、console、diagnostic、bundle、tests snapshot、flags、Actor/Item/Chat 都不得出现 Key、Authorization、Cookie、完整 endpoint 或 provider raw payload。
- bundle 内 provider name/model/protocol 是历史标签，不自动配置当前连接，也不触发 model discovery。
- E1 不把来源或 imported record写入 Foundry world settings、flags、localStorage、IndexedDB 或文件系统；它只存在于当前窗口内存，用户可再次显式导出。
- source library 需要另行存储 ADR；browser client storage 对同一 Foundry origin 的其他模块并非加密隔离，未来 UI 必须诚实提示。

## 8. 分阶段实施路径与停止点

### Stop 0 — 当前计划审阅

本文件完成后停止。用户批准计划前：不实现、不启动 Lab、不调用真实 Provider、不写世界 Document。

计划若获批准，先按发布权限把本计划单独 commit/fast-forward 到用户确认的 `codex/forge-fvtt-product` 精确提交；再从该提交创建新的 `codex/<timestamp>-forge-fvtt-task-e-review-recovery` sibling WorkTree。不得在本计划 WorkTree 或产品集成 WorkTree 直接开发。

### E1.1 — Contract、decoder 与迁移

- 先写 V1/V2 schema、strict decoder、normalized hash、migration 和 lineage tests；
- 固定合法 V1 fixtures 来自当前 Task D builder，不从旧浏览器下载目录或旧 WorkTree 取现场；
- 补齐大小、深度、数量、range/quote、hash、union、unknown key/prototype、accepted summary 与恶意 HTML 字符串测试；
- 不改 UI、不接 world adapter。

**Stop 1：** contract 无法在不保存完整 artifact/provider raw payload 的前提下支持只读恢复，或必须弱化 V1 安全投影时停止并回报。

### E1.2 — Imported read-only UI

- 新增显式 JSON file picker/input 和 Import Review Bundle 动作；
- 导入事务先在临时内存 decode，成功后一次性替换 imported view；
- 显示历史 status、来源、evidence、findings、metadata、history、target 与 lineage；
- `accepted` 使用“历史 accepted；不可直接创建”文案；
- invalid import 不改变 live attempt、settings、AI job 或现有 imported record。

**Stop 2：** 文件导入必须借助任意路径、本机 Node API、世界存储或无法避免的 HTML 注入时停止。

### E1.3 — Fresh-attempt recovery

- 从 imported record 创建 recovery draft，只复制 raw source/mode 和安全标签；
- 用户确认 display name、当前 target 与连接；
- 生成全新 requestId/attemptId/snapshot，修复预算与 calls 归零；
- normal Task D Analyze 之前不进行外部调用；后续 generate/create 完全复用 Task D gate；
- 新导出保留 normalized bundle lineage。

**Stop 3：** 只有复用旧 response/artifact、跳过当前 formal verification、沿用旧 Provider session 或降低 GM/runtime gate 才能继续时停止。

### E1.4 — 代码审查与真实验收

- focused/full mechanical evidence 和父 Sol 语义核对完成后，进行一次独立 Sol 只读 Code Review；
- 清除全部阻塞 P1 后，等待用户授权真实 Foundry Lab E2E；
- 真实 AI Provider 只在用户另行授权并提供安全凭据路径后执行；没有真实 Provider 证据时，AI fresh-attempt recovery 只能报告机械/fixture 层，不能声称真实 AI 恢复 PASS；
- 世界 Document 创建只在真实 E2E 明确授权后执行，并精确标识、readback、清理。

**Stop 4：** E1 证据报告后停止，等待用户决定 commit、集成与是否规划 E2。不得自动进入 source library 或批量实现。

## 9. 后续切片路线（不随 E1 获得实现授权）

### E2 — Managed source library 与恢复记录

先写存储 ADR，比较：

1. 用户显式导入/导出文件；
2. client-local IndexedDB；
3. 可选 Companion/Gateway source store。

ADR 必须回答容量、同源模块可见性、加密声明、删除/导出、schema migration、quota、崩溃一致性、sourceId/hash conflict 和多客户端同步。没有决定前不把大段 source 塞进 Foundry world settings 或 flags。

E2 用户结果是搜索/打开/删除/导出受管理来源和历史 review record；它仍不自动生成或写世界。

### E3 — Collection 与多对象批量审阅

E3 先做批量拆分与逐项审阅，不先做批量 world apply：

- browser-safe Actor/Item collection splitter 只能抽取纯核心，Node I/O 保留 adapter；
- 每项有独立 immutable source、type-specific identity、request/attempt、status、findings 和 retry/cancel；
- 聚合状态仅由逐项状态派生，不能让一个 accepted 项替另一个失败项通过；
- concurrency 默认 1，设置明确上限和背压；不能提高并发来掩盖 Provider 长时请求；
- 部分失败保留成功/失败项，逐项恢复；不静默取第一个 candidate/artifact；
- 第一切片的 world create 仍逐项调用 Task B/C adapter。

批量 apply 若以后进入 E3b，必须先生成 immutable apply manifest，列出每个 selected item 的 kind、sourceId/sourceHash/artifactHash、deterministic Document ID、target 和当前 accepted proof；GM 对该精确 manifest 做一次确认，点击时逐项重验。部分 apply 结果必须逐项报告，不宣称跨多个 Foundry Document 的原子事务。

### E4a — 跨会话可恢复工作列表

持久化的是任务描述、已完成的安全 review record 和下一步动作，不是活着的 Promise/HTTP stream。页面重开后所有 `running` 项必须归类为 `interrupted`，由 GM 显式选择重新分析；不得自动重发可能计费的 Provider 请求。

### E4b — 真后台任务

若目标是 Foundry 页面关闭后继续 AI/生成，必须新增 Companion/Gateway/服务端 job owner，并单独定义认证、origin/session、Key custody、加密、配额、取消、幂等、重启恢复、升级迁移和部署边界。该架构变更需要新的权威计划与用户批准，不能借 E4a 的 persisted queue UI 冒充完成。

## 10. E1 机械门禁

### Focused tests

- V1 合法 fixture、V1→internal、V2 stable serialize/decode、lineage normalized hash；
- unknown schema/version/key、prototype keys、JSON primitive/array root、超大文件、深层嵌套、数组洪泛、非有限数字；
- raw/canonical hash、sourceId、objectKind/mode、target、accepted response consistency；
- 每个 evidence/candidate range 和 quote 与 exact UTF-16 source slice 一致；
- imported accepted/needs_review/failed/rejected 全部不可 apply；
- import 不调用 Provider、connection probe、Actor/Item adapter、settings write、Chat 或 download；
- invalid import 原子失败；live attempt、connection、job gate 不变；
- fresh attempt 使用新 identity、当前 snapshot、归零 repair/calls，旧 Promise 不回填；
- non-GM、错误 runtime、stale source/target、wrong object kind；
- secret scan、HTML injection、browser forbidden import；
- Task B Actor、Task C Item、Task D Intake 全回归。

### 仓库门禁

实现时按受影响范围依次执行：

```text
bun test tests/forge-intake-review.test.ts foundry-modules/fvtt-json-forge/tests/intake-application.test.ts --max-concurrency 1
bun run test:fvtt-json-forge
bun run typecheck:packages
bun run typecheck:foundry-modules
bun run architecture:verify
bun run build:fvtt-json-forge
bun run agents:generate
bun run agents:check
bun run test
bun run ci:verify
git diff --check
```

另行执行 decoder fuzz/bounds、bundle secret scan、actual browser bundle forbidden-import scan、必要的 anti-overfit 和最终影响分析。继承的无关基线失败必须单列，不修改无关模块掩盖。

## 11. E1 人工/语义验收

父 Sol 必须逐项阅读导入前原 bundle 与导入后 UI，不能只看 decoder/test 绿色：

- V1 accepted Actor：raw source/hash、candidate、evidence、findings、provider/prompt/calls/history、canonical hash、target 和安全摘要逐项一致；UI 明确历史 accepted 但 Confirm Create 禁用；Actor/Item/Chat 计数不变。
- V1 needs_review Item：blocking finding、repair count、review verdict 和 evidence 完整恢复；不出现 artifact/create；Item 与 Actor 计数不变。
- 篡改 bundle：分别改 raw source、quote/range、final hash、requestId、accepted artifactHash、object kind、version 和未知字段；每项明确拒绝且当前工作不丢失。
- malicious display strings：`<script>`、HTML attributes、超长 Unicode 和路径样式文本只作为文本显示，不执行、不打开路径。
- fresh plaintext attempt：从 imported record 显式开启新 attempt，核对新 identity/current snapshot，从 Analyze 重新走到 formal response；若获世界写授权，再执行 Actor create/readback、UUID reuse 与精确清理。
- fresh AI attempt：导入本身零 Provider 请求；只有 GM 明确点击 Analyze 且当前连接测试通过才产生一个新请求。若未获真实 Provider 授权，标记该层 `NOT_EXECUTED`。

## 12. 真实 Foundry 14.364 / dnd5e 5.3.3 验收层级

| 层级 | 必须证明 | 不能替代 |
|---|---|---|
| Contract/unit | strict decoder、migration、hash/range、状态机、零副作用 | ApplicationV2、真实文件选择、真实世界计数 |
| Browser bundle/module | 无 Node/Bun/filesystem import，模板/action/build 正确 | Foundry 真实 UI 行为 |
| 本地 Foundry GM import | 文件选择、只读展示、错误反馈、accepted 禁用 create、target/GM 动态门禁 | fresh AI Provider 语义或 world readback |
| 本地 Foundry fresh attempt | 新 identity、当前 snapshot、Task D 状态机不被绕过 | world create/readback，除非另行执行 |
| 本地 world create/readback | 仅新 attempt 当前 accepted response 进入既有 adapter，语义 readback 与精确清理 | 生产、批量、任意输入 |
| 真实 AI Provider | 一个新请求的当前模型/协议/证据/accepted-only 结果 | 任意模型质量、后台恢复 |
| 生产/长时 | 不在 E1 范围，需独立授权 | 不得由本地 Lab 推断 |

每一层分别报告 `PASS`、`FAIL` 或 `NOT_EXECUTED`。Provider 完成、JSON 解析、文件导入、测试绿色或 bundle 历史 accepted 均不能单独升级更高层。

## 13. 清理、发布与权限边界

- 当前阶段只新增本计划文件；不 commit、push、merge、stash、reset、备份或清理 WorkTree。
- 计划批准不自动授权实现；计划 commit/产品分支 fast-forward 与新 implementation WorkTree 创建按用户后续明确指令执行。
- 实现批准不自动授权 Lab、真实 Provider、世界 Document、commit、push、merge 或清理；这些层级按计划停止点分别确认。
- 本地 E2E 只允许经核对的 `F:\FoundryLab\foundry-v14\data\server-mirror`、`cor-cotn`、`127.0.0.1:30001`；生产 `8080/51020` 不是替代证据。
- 不直接访问 LevelDB。所有授权的临时世界对象必须通过公共 Document API 创建、记录 exact UUID/sourceId/hash、readback，并只删除本次精确对象。
- 不创建备份，不保留隐蔽副本；失败时停止并报告。
- topic commit、fast-forward 到 `codex/forge-fvtt-product`、push、WorkTree/branch 清理均等待明确发布授权；真实 `master` 不进入 Task E。

## 14. 风险与明确停止条件

发生以下任一情况立即停止，不通过扩大范围或降低门禁解决：

- V1 合法 bundle 无法在不修改旧字节契约的情况下严格解码；
- 只读恢复必须保存完整 artifact、provider raw payload、Key、endpoint 或内部路径；
- imported accepted 只有直接构造/伪造 Forge response 才能继续；
- fresh attempt 无法生成新 identity、重新 snapshot 或重新 formal verify；
- 必须改变 Task B/C world adapter、Forge Protocol v1、deterministic ID、create-only/readback 规则；
- browser bundle 必须依赖 Node/Bun/filesystem、任意路径或服务端权限；
- import 能改变 connection settings、触发外部请求或在失败时破坏当前 live attempt；
- background/cross-session 目标只有自动持久化 Key、重发请求或假称浏览器关闭后 Promise 仍运行才能成立；
- 需要 source library、batch、ZIP、Companion/Gateway、生产、LevelDB、update/overwrite、Foundry/dnd5e 升级或任意输入支持才能完成 E1；
- 发现与当前 Task E 计划文件之外的用户改动重叠，或无法区分当前 WorkTree baseline。

## 15. 当前停止点

Task E 接管审计和权威计划已完成到“等待用户审阅”状态。下一步只能是用户对以下决定给出反馈或批准：

1. E1 是否以“strict import + imported read-only + explicit fresh attempt”为唯一 MVP；
2. imported accepted 是否继续严格禁止直接创建（本计划推荐且要求禁止）；
3. E1 完成后是否先停下，再单独决定 E2 source library 存储 ADR。

在批准前不进入实现、不启动 Foundry Lab、不调用真实 AI Provider、不写世界 Document。

# Forge FVTT Task E：可恢复 Library、Collection/ZIP、批量审阅与跨会话队列

- 日期：2026-08-30
- 状态：**Task E complete and published to `codex/forge-fvtt-product`**；A–E 产品基线为 `925377eb97d53c5995718be8a90b96a497fac9e5`。后续统一发行收口由 [`2026-08-30-forge-fvtt-release-closure.md`](2026-08-30-forge-fvtt-release-closure.md) 接管，不把它扩写成 Task F。
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

Task E 是一个用户目标和一个持续 goal。E1、E2、E3、E4 仅是依赖有序的内部实施阶段，不是四个需要用户逐次启动、批准或发布的任务：

- E1 已提供严格 review bundle 导入、只读恢复与 fresh attempt；
- E2 已提供 `worldId:userId` scope 的 client-local source/review library；
- 当前从同一 E2 WorkTree 继续实现 E3 Collection/ZIP、多 Actor/Item 批量审阅与 accepted-only 批量处理；
- 随后继续实现 E4 browser-local 可恢复工作队列：页面重开后恢复任务描述、逐项安全 review 与明确下一步，原 `running` 项变为 `interrupted`，只能由 GM 显式重启，绝不自动重发可能计费的 Provider 请求。

真正要求 Foundry 页面关闭后 AI/HTTP 仍继续执行的常驻后台 owner 必须是 Companion/Gateway/服务端，涉及新的外部系统、认证和 Key custody。Task E 会诚实标出该物理边界，但它不阻止本轮完成无需外部服务的持久队列、中断恢复、页面打开期间的 concurrency-1 runner 与逐项 apply。

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
| 多 Actor/Item 批量审阅 | 一次接收多个来源，逐项审阅并保留部分成功/失败 | 依赖 E1/E2、稳定 identity、限额、逐项状态和 apply manifest | **进入完整 Task E；concurrency 固定为 1** |
| Collection | 把显式 collection JSON 拆成独立 Actor/Item job | Node collection 不是 browser-safe；Actor/Item/Intake 边界不同 | **进入完整 Task E；新增 browser-safe strict contract** |
| ZIP | 便携导入/导出 collection、来源和 review records | 需要 zip-slip、CRC、method、entry 数量与解压大小门禁；不能导出完整 artifact/Key | **进入完整 Task E；标准 ZIP 只是 portable container，不是世界写入路径** |
| 跨会话工作列表 | 页面重开后恢复 pending/interrupted/review/applied 状态 | 依赖持久 record、迁移、配额和清理策略 | **进入完整 Task E；running 重开后转 interrupted，GM 显式恢复** |
| 页面打开期间后台 runner | 一个显式批次按 concurrency 1 顺序执行，窗口可继续展示进度 | 必须复用 AI job gate、可取消、逐项结算且不自动 apply | **进入完整 Task E** |
| 关页后仍运行的真后台 owner | Foundry 页面关闭后 AI/生成仍继续 | 需要 Companion/Gateway/服务端 job owner、凭据和认证威胁模型 | **外部系统停止条件**；没有该授权时明确 unsupported，不用假后台冒充 |

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

## 8. 连续实施路径与真实停止点

### 已完成阶段 — E1/E2

E1 已发布，E2 已在当前独立 WorkTree 实现、验收和清理。它们是后续 E3/E4 的可信基线，不回退、不重做、不把当前 dirty scope 拆到新的 WorkTree。当前 goal 授权从此处连续开发完整 Task E；commit、push、merge、产品 WorkTree 写入和 WorkTree/branch 清理仍保持最终发布授权边界。

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

**历史停止点（已解除）：** E1 与 E2 的阶段性停止点已由当前完整 Task E goal 取代；其安全不变量继续有效，但不再触发逐阶段用户启动。

## 9. 完整 Task E 剩余实施范围

### E2 — Managed source library 与恢复记录（已完成）

先写存储 ADR，比较：

1. 用户显式导入/导出文件；
2. client-local IndexedDB；
3. 可选 Companion/Gateway source store。

ADR 必须回答容量、同源模块可见性、加密声明、删除/导出、schema migration、quota、崩溃一致性、sourceId/hash conflict 和多客户端同步。没有决定前不把大段 source 塞进 Foundry world settings 或 flags。

E2 用户结果是搜索/打开/删除/导出受管理来源和历史 review record；它仍不自动生成或写世界。实现与证据见独立 E2 ADR。

### E3 — Collection/ZIP 与多对象批量审阅/处理

E3 完成以下统一用户结果：

- strict browser-safe collection V1 同时接受 Actor 与 Item 条目；每条显式携带 mode、label、raw source 与稳定 entry identity；
- 标准 ZIP V1 用固定 manifest 与受限 entry 路径承载来源/安全 review，导入检查 CRC、compression method、重复路径、zip-slip、entry 数、压缩/解压大小和 collection identity；导出不含 Key、endpoint、raw Provider payload、完整 response/artifact 或世界数据；
- browser-safe Actor/Item collection splitter 只抽取纯核心，Node I/O 保留 adapter；
- 每项有独立 immutable source、type-specific identity、request/attempt、status、findings 和 retry/cancel；
- 聚合状态仅由逐项状态派生，不能让一个 accepted 项替另一个失败项通过；
- concurrency 默认 1，设置明确上限和背压；不能提高并发来掩盖 Provider 长时请求；
- 部分失败保留成功/失败项，逐项恢复；不静默取第一个 candidate/artifact；
- runner 仅在当前页面打开期间、由 GM 显式启动，以 concurrency `1` 顺序执行；重新打开页面时不自动产生 Provider 请求；
- world create 仍逐项调用 Task B/C adapter，不新增 generic/bulk Document adapter。

批量 apply **进入本轮完整 Task E**，但必须先生成 immutable apply manifest，列出每个 selected item 的 kind、sourceId/sourceHash/artifactHash、deterministic Document ID、target 和当前 accepted proof；GM 对该精确 manifest 做一次确认，点击时逐项重验。只有本页面当前 runner 产生并仍在内存中的完整 accepted response 可进入 manifest；从持久队列恢复的历史 accepted review 没有完整 artifact，必须重新执行。部分 apply 结果逐项报告，不宣称跨多个 Foundry Document 的原子事务，也不因前项成功而跳过后项 gate。

### E4a — 跨会话可恢复工作列表

持久化的是版本化 collection、任务描述、逐项状态、安全 review record、apply 结果和下一步动作，不是活着的 Promise/HTTP stream，也不保存完整 response/artifact。页面重开后所有 `running`/`applying` 项原子归类为 `interrupted`，由 GM 显式选择重新分析；不得自动重发可能计费的 Provider 请求。队列与 source library 一样按 `worldId:userId` 隔离，使用 strict decoder、bounds、revision、乐观并发、单事务替换、BroadcastChannel、显式导入/导出和删除。

### E4b — 真后台任务

若目标是 Foundry 页面关闭后继续 AI/生成，必须新增 Companion/Gateway/服务端 job owner，并单独定义认证、origin/session、Key custody、加密、配额、取消、幂等、重启恢复、升级迁移和部署边界。该外部系统是当前明确停止条件；没有新增外部系统与凭据权限时，Task E UI 必须显示“关页会中断、重开后手动恢复”，不能借 E4a persisted queue 或 Service Worker 冒充真后台。

## 10. 完整 Task E 机械门禁

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
- collection JSON/ZIP strict round-trip、稳定序列化、CRC、zip-slip/重复路径/unsupported method/zip bomb/entry bounds；
- mixed Actor/Item collection 保持输入次序与逐项 identity，不静默选首项、不互相传播状态；
- queue strict decoder、schema migration、revision conflict、quota/atomicity、BroadcastChannel/close 和 authority loss；
- `running`/`applying` reload recovery 必定转为 `interrupted`，没有自动 Provider/Document side effect；
- concurrency `1`、显式 start/pause/cancel/resume、逐项 failure isolation 与 safe review persistence；
- immutable apply manifest、accepted-only selection、点击前 GM/runtime/current-response 重验、逐项 adapter 调用和部分失败报告；
- persistent/exported queue、collection、ZIP 与 review 全量 secret scan，禁止完整 artifact/response、endpoint、Key、Authorization、Cookie、内部路径和世界数据。

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

## 11. 完整 Task E 人工/语义验收

父 Sol 必须逐项阅读导入前原 bundle 与导入后 UI，不能只看 decoder/test 绿色：

- V1 accepted Actor：raw source/hash、candidate、evidence、findings、provider/prompt/calls/history、canonical hash、target 和安全摘要逐项一致；UI 明确历史 accepted 但 Confirm Create 禁用；Actor/Item/Chat 计数不变。
- V1 needs_review Item：blocking finding、repair count、review verdict 和 evidence 完整恢复；不出现 artifact/create；Item 与 Actor 计数不变。
- 篡改 bundle：分别改 raw source、quote/range、final hash、requestId、accepted artifactHash、object kind、version 和未知字段；每项明确拒绝且当前工作不丢失。
- malicious display strings：`<script>`、HTML attributes、超长 Unicode 和路径样式文本只作为文本显示，不执行、不打开路径。
- fresh plaintext attempt：从 imported record 显式开启新 attempt，核对新 identity/current snapshot，从 Analyze 重新走到 formal response；若获世界写授权，再执行 Actor create/readback、UUID reuse 与精确清理。
- fresh AI attempt：导入本身零 Provider 请求；只有 GM 明确点击 Analyze 且当前连接测试通过才产生一个新请求。若未获真实 Provider 授权，标记该层 `NOT_EXECUTED`。
- mixed collection：真实 file chooser 导入至少一个 plaintext Actor 与一个 Item/AI 条目，逐项来源、mode、label、hash、顺序和 queue 状态与输入一致；ZIP 导出后重新导入字段逐项保真；
- 批量 runner：GM 一次显式启动后 concurrency 始终为 `1`，一个 `needs_review`/failed 项不把其他项升级为 accepted，取消只中断当前/后续任务，不丢失已结算结果；
- 跨会话：运行中刷新页面后没有自动外部请求，原 running 项显示 interrupted；GM 显式 resume 后产生新的 request/attempt，旧安全 review 保留但旧 response/artifact 不复活；
- batch apply：只有当前 session 的 accepted 项进入 immutable manifest；确认前后逐项核对 identity/target，Actor/Item adapter 分开调用，existing/created/failed 逐项显示；失败不回滚或隐藏其他完整 Document；
- 清理：只删除本任务 exact queue/collection 测试记录与通过公共 API 创建的 exact Document，重开后无遗留，世界集合计数恢复基线。

## 12. 真实 Foundry 14.364 / dnd5e 5.3.3 验收层级

| 层级 | 必须证明 | 不能替代 |
|---|---|---|
| Contract/unit | strict decoder、migration、hash/range、状态机、零副作用 | ApplicationV2、真实文件选择、真实世界计数 |
| Browser bundle/module | 无 Node/Bun/filesystem import，模板/action/build 正确 | Foundry 真实 UI 行为 |
| 本地 Foundry GM import | 文件选择、只读展示、错误反馈、accepted 禁用 create、target/GM 动态门禁 | fresh AI Provider 语义或 world readback |
| 本地 Foundry fresh attempt | 新 identity、当前 snapshot、Task D 状态机不被绕过 | world create/readback，除非另行执行 |
| 本地 world create/readback | 仅新 attempt 当前 accepted response 进入既有 adapter，语义 readback 与精确清理 | 生产、批量、任意输入 |
| 真实 AI Provider | 一个新请求的当前模型/协议/证据/accepted-only 结果 | 任意模型质量、后台恢复 |
| Collection/ZIP | 真实 file chooser、mixed entries、strict ZIP/JSON、round-trip 保真和安全拒绝 | runner、跨会话或 world apply |
| Batch runner | concurrency 1、逐项状态、部分失败、取消/恢复和安全 review 保存 | 关页后仍运行或批量 world apply |
| Cross-session queue | 重载后 pending/finished 恢复、running→interrupted、零自动请求 | Companion/Gateway 真后台 |
| Batch apply/readback | immutable manifest、accepted-only、逐项 Actor/Item create/reuse/readback/结果与清理 | 多 Document 原子事务或生产 |
| 生产/长时 | 不在 E1 范围，需独立授权 | 不得由本地 Lab 推断 |

每一层分别报告 `PASS`、`FAIL` 或 `NOT_EXECUTED`。Provider 完成、JSON 解析、文件导入、测试绿色或 bundle 历史 accepted 均不能单独升级更高层。

## 13. 清理、发布与权限边界

- 本计划阶段、实现阶段与发布阶段保持独立授权；已经完成的动作及其证据以第 15、16 节为准，不由较早阶段的授权外推。
- 用户已分别授权 E1 实现、本地 Foundry 文件导入只读验收、本地 fresh plaintext recovery 与临时世界 Document create/readback/reuse/cleanup，以及本轮 E1 topic commit、产品分支 `--ff-only` 集成和产品分支 push。
- 当前 active goal 已授权在现有 E2 WorkTree 连续完成完整 Task E 的 E3/E4 browser-local 范围；不需要在内部阶段逐次停工。该 goal 不授权真实 AI Provider、Companion/Gateway/外部服务、生产或发布动作。
- 本地 E2E 只允许经核对的 `F:\FoundryLab\foundry-v14\data\server-mirror`、`cor-cotn`、`127.0.0.1:30001`；生产 `8080/51020` 不是替代证据。
- 不直接访问 LevelDB。所有授权的临时世界对象必须通过公共 Document API 创建、记录 exact UUID/sourceId/hash、readback，并只删除本次精确对象。
- 不创建备份，不保留隐蔽副本；失败时停止并报告。
- E1 topic commit、fast-forward 到 `codex/forge-fvtt-product` 与该产品分支 push 已获得明确授权；topic push 和 WorkTree/branch 清理仍未授权，真实 `master` 不进入 Task E。

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
- browser-local collection、ZIP、batch 或跨会话队列只有保存 Key、完整 artifact/response、自动重发 Provider 请求、弱化 accepted-only 或写 world settings/LevelDB 才能成立；
- 用户目标明确要求关页后仍继续 AI/HTTP，从而必须新增 Companion/Gateway/服务端 job owner、认证与 Key custody；
- 发现与当前 Task E 计划文件之外的用户改动重叠，或无法区分当前 WorkTree baseline。

## 15. 当前停止点

E1 已完成并进入产品基线。E2 实现位于独立 WorkTree `I:\OpenCode\fvttV12JsonGenerator-worktrees\20260830-165605-forge-fvtt-task-e2-source-library`、分支 `codex/20260830-165605-forge-fvtt-task-e2-source-library`，以产品提交 `91d87dd256b4be34d61f51acb0b349cfc8c32dfe` 为基线；E2 ADR 与实施/验收证据见 [`2026-08-30-forge-fvtt-task-e2-source-library-adr.md`](2026-08-30-forge-fvtt-task-e2-source-library-adr.md)。

E2 的实现、标准 Forge 门禁、独立安全复核和真实 Foundry revision `0→3`、跨页面恢复、搜索/只读打开、portable export/import、非法导入原子拒绝与 accepted-only 零副作用路径均已完成。用户授权后又完成精确清理：review-only 删除为 revision `4` 且保留 source，随后删除两个 source（最后一次级联 needs_review）至 revision `6`、`0 sources / 0 reviews`；刷新整页并重开 Intake 后仍为 `0/0`，世界集合计数保持 Actor `283`、Item `179`、ChatMessage `973`、Scene `64`、Journal `67`、Playlist `0`、RollTable `12`，删除窗口与重开 Intake 均为零网络请求。agent-owned 页面已关闭，Lab PID `33008` 已停止，`30001` 无监听且空锁文件不存在。

**当前不是 E2 停止点。** 当前 active goal 要求直接在本 WorkTree 继续 E3/E4，直到完整 Task E 一次性交付审阅。发布边界仍是：没有 commit、push、merge、stash、产品 WorkTree 写入或 WorkTree/branch 清理授权；真实 Provider、Companion/Gateway 和生产仍需新增权限。

## 16. E1 实施与发布证据（2026-08-30）

### 16.1 已实现边界

- 保持 Task D `ForgeIntakeReviewBundleV1` builder/serializer 不变；新增 browser-safe V1/V2 strict decoder、V1→只读 V2 internal migration、normalized bundle hash、deep freeze、`sourceLabel` 与 `recoveredFrom` lineage。
- decoder 在 `JSON.parse` 前执行 4 MiB UTF-8 文件门禁，随后逐对象 exact-key 解码，并限制 200,000-byte raw source、递归深度、总节点、数组和各集合数量；拒绝 prototype keys、错误 union/target、非安全整数、错误 hash/sourceId/canonical identity、乱序 history、accepted 摘要不一致与 evidence UTF-16 range/quote 漂移。
- Forge Intake 新增显式 JSON file picker。导入记录与 live state 分离；invalid import 原子失败，既有 live/imported 状态保持；导入展示只使用 `textContent` 或逐项 HTML escaping。
- imported accepted 不携带完整 response/artifact，`isApplyable()` 与所有 live analyze/generate/repair/regenerate/reject/connection 隐藏动作均额外 fail-closed；Confirm Create 始终禁用。
- “开启新 attempt”只建立 recovery draft，复制 raw source/mode/安全 label；要求 GM、精确 runtime、兼容 target 和非空显示名。新 requestId/attemptId/snapshot 只在后续显式 Analyze 时创建；旧 calls/repair/history/response 不继承，新导出记录 normalized lineage。

### 16.2 机械证据

- focused contract/Application：`38 pass / 0 fail / 246 expect()`；同时覆盖 accepted 与 needs_review 的精确导入提示。
- `bun run test:fvtt-json-forge`：`125 pass / 0 fail / 1600 expect()`。
- `bun run typecheck:packages`：PASS。
- `bun run typecheck:foundry-modules`：PASS。
- `bun run architecture:verify`：PASS，`10923 modules / 12136 dependencies` 无依赖违规，cycle gate 无输出失败。
- `bun run build:fvtt-json-forge`：PASS，产生精确 manifest、browser script、stylesheet 与三份 template。
- `bun run agents:generate`：PASS，未引入新的 WorkTree 状态差异。
- `git diff --check`：PASS。
- `bun run agents:check`：**继承基线 FAIL**；唯一报告仍是 `foundry-modules/fvtt-selected-token-sync/AGENTS.md` 未列入显式清单，本 E1 不修改无关 owner 掩盖该失败。
- `bun run ci:verify`：**FAIL at inherited `agents:check`**；此前 `test-env:check` 与 `test-isolation:check` 均 PASS，后续 CI steps 因 fail-fast 未执行。
- `bun run test`：**未完成且按失败报告**；同一 hermetic wrapper 问题本轮再次复现：既有 species fixture 子命令 `bun --no-env-file run src/index.ts --intake-species ...\\tests\\fixtures\\species\\ogre.txt --fvtt-version 12 --effect-profile core` 在前序测试通过后持续无新输出，约 60 秒有界观察后中断本次测试进程树，exit `1`；所有相关 PID 均已退出。此前同一 WorkTree 曾观察约七分钟仍不结算。E1 focused/module 门禁独立绿色不能替代该全仓失败。

### 16.3 父 Sol 语义验收

- fixture 层逐字段读取 V1 accepted Actor 的 raw source/hash、candidate/evidence、provider/prompt/calls/history、canonical identity、target 与 accepted 安全摘要；迁移后字段保真且 malicious HTML 字符串保持为惰性文本。
- 历史 accepted 在按钮与隐藏方法两层都不能进入 Actor/Item adapter；Provider、connection test 与 world create spy 均为 0。
- invalid/篡改/过大/错误 GM/错误 target 输入均 fail-closed；async 读取期间失去 GM 权限也不会落入 imported state；既有 live accepted attempt 不丢失。
- fresh plaintext recovery 先形成无 identity 的 draft，后续 Analyze 才获得不同于历史记录的新 requestId/attemptId；calls、repair、history 归零，V2 导出保留 normalized `recoveredFrom`。
- 独立只读 Sol 首轮复核判定 `REVISE`：发现 accepted 跨字段一致性不足、unknown-key error 回显、imported raw source 未独立展示、隐藏 clear-key handler 可改 settings；二次复核又发现 toggle-key/toggle-endpoint 隐藏 handler 可绕过 disabled UI。全部问题均已按最小范围修正并补负例；同一 reviewer 第三轮判定 `PASS`，当前 diff 未发现剩余 P1/P2。

### 16.4 真实本地 Foundry 只读导入证据

- 精确环境：唯一 `server-mirror` Lab，`127.0.0.1:30001`、`cor-cotn`、Foundry `14.364`、dnd5e `5.3.3`；本轮启动 PID `42324`，结束后 PID 已退出且 30001 无监听。当前 E1 build 仅覆盖目标模块既有六文件，源/目标 SHA-256 全部一致；browser script 为 `4DAF5193DF7A55FC50080F53722E9C234BA6A6F8A70ADE32831B30EB05F2FA72`。未创建第二 Lab、备份或世界副本。
- GM `Gamemaster` 通过真实 JSON file chooser 导入 V1 accepted Actor。ApplicationV2 明确显示“导入的只读历史状态：accepted”；raw source、candidate、evidence、provider/model/prompt/calls/history、canonical source、sourceId/hash、target 与 accepted safe summary 逐项保真，`<script>`/`<b>` 字符串只作为文本，未形成 HTML 元素。Confirm Create、Generate、Repair、Regenerate 均禁用；仅兼容 target 的“开启新 attempt”可见可用，但本次未点击。
- 篡改样本在顶层加入未知 `authorization` 字段后明确拒绝；错误只显示 unknown-key 类别，不回显字段名、Bearer 内容或 attacker 文本，导入前 accepted 状态和来源保持不变。
- V1 needs_review Item 通过真实 file chooser 导入；状态、raw source、15/30 light evidence、blocking uncertainty/finding、`reviewVerdict: revise`、repairCount `1`、repair history 和兼容 target 完整显示。Confirm Create 与所有旧 attempt 操作保持禁用。
- 同一 Item 的 Foundry target 改为 `14.365` 后仍只读展示，metadata 标记 `compatibleWithCurrentRecoveryTarget: false`，且“开启新 attempt”禁用。
- 非 GM 用户 `SY` 真实登录后 `isGM: false`；配置页不显示 `FVTT JSON Forge` 分组或 `Forge Intake` 菜单。未调用隐藏 module API，也未尝试绕过禁用控件。
- 导入前后主页面读取的世界计数始终为 Actor `283`、Item `179`、ChatMessage `973`、Scene `64`。CDP `Network.requestWillBeSent` 在 accepted、tampered、needs_review 和 incompatible 四段观测窗口内均为零；没有 Provider 请求、connection probe、Actor/Item/Chat/Scene 写入。
- 视觉核对：实际窗口的只读说明、needs_review 状态、blocking finding、独立 raw source/evidence 与禁用的 Generate/Confirm Create/Repair/Regenerate/Reject 按钮均可见且语义一致。
- 上轮发现的 toast 文案风险已按最小范围修复：accepted 精确显示“历史状态为 accepted”，needs_review 精确显示“历史状态为 needs_review”；状态值来自 strict decoder enum。focused test 同时锁定两条完整文案；真实 needs_review 导入确认不再含误导性的“历史 accepted”。
- 本轮四个文件导入窗口均在动作前建立网络游标；accepted、tampered、needs_review、incompatible 各自观测到 `0` 个 `Network.requestWillBeSent`，且世界计数始终为 Actor `283`、Item `179`、ChatMessage `973`、Scene `64`。任务临时夹具目录在验收后按精确路径删除，浏览器页签关闭，Lab 正常停止。

本地 Foundry 14.364 / dnd5e 5.3.3 GM import 层：`PASS`。这只证明 E1 的文件导入、只读展示、错误反馈、target/GM 门禁和零副作用，不升级 fresh attempt、世界写入或真实 Provider 层。

### 16.5 真实本地 fresh attempt 与世界 readback 证据

- 使用当前可信 V1 builder 从 tracked plaintext fixture 的单一生物块生成 `needs_review` Actor bundle，再由当前 strict decoder round-trip；文件 SHA-256 为 `8028259202FA21D8C353C2DC4A2594EA09ACC3D1DAFF877210453E4DB0A53CF1`。没有读取旧 Task D 下载、旧浏览器或旧 WorkTree 现场。
- GM 导入后显式点击“以当前来源开启新 attempt”。恢复草稿立即变为 `empty`，复制精确 `1979` 字符 raw source、`plaintext-actor` mode 和安全 candidate label；`requestId`、`attemptId` 为空，`repairCount` 为 `0`、history 为空，且动作窗口没有 HTTP 请求或世界计数变化。
- 显式 Analyze 后产生新的 requestId `forge-intake-plaintext-actor-9bc819f4-9125-49db-84f1-035fb43cc77e`、attemptId `...:attempt-1` 与当前 snapshot `0badb500f5abc5b255fbc63cdb340eec1162b12fa800a28307521481559bdbcc`；旧 request/attempt 未继承，状态进入 `ready_to_generate`。
- 浏览器 Export 动作传给 `URL.createObjectURL` 的实际 Blob 内容经临时、随后恢复的测试探针读取：V2 bundle 的 `recoveredFrom` 精确保留旧 request/attempt、V1 bundle hash、raw source hash 与旧 `needs_review` 状态；当前 calls 四项均为 `0`、repairCount `0`、history 空，且不含 Authorization、Bearer 或 API Key。应用同时显示导出成功通知；当前自动化表面没有交付可核对的磁盘下载句柄，因此本证据不冒充“磁盘文件已保存”。
- Generate Candidate 从新 snapshot 重新执行正式 plaintext generation/verification，得到 `accepted`；预览为 NPC `E1恢复蛮蟹 (E1 Recovery Serpentmaw 20260830)`、HP `75`、AC `17`、CR `5`、aberration、七个 embedded Item，Confirm Create 仅此时启用。accepted V2 bundle 绑定新的 sourceId `actor:v1:22aa5b0e-be23-4821-ad08-4a819b92b025`、finalSourceHash `3bb9d4ab6f84c936f11bc332d0bcd9d598a24258f8cb53a7cd9414b5148fea8f` 和 artifactHash `c4b0d6f46ff0043c6e6ffe3d320d32c0240190246589c47d9bdab5e41fad6ca6`。
- 写入前按精确 sourceId 与测试名称确认世界中无匹配 Actor。首次 Confirm Create 通过既有 Actor adapter 创建并回读 `Actor.7e911f7c71127f88`；Actor 计数 `283→284`，Item/ChatMessage/Scene 保持 `179/973/64`，readback 的名称、type、HP、AC、CR、creature type、七个 embedded Item 与完整 Forge identity 均匹配。
- 第二次 Confirm Create 返回“已复用 Actor”，UUID 仍为 `Actor.7e911f7c71127f88`，Actor 数保持 `284`，没有重复对象。随后仅对该精确 UUID/sourceId/artifactHash 调用公共 Document API `delete()`；剩余匹配为空，计数恢复 Actor `283`、Item `179`、ChatMessage `973`、Scene `64`。
- Analyze、Generate 与两个 Confirm 窗口均无新的 `Network.requestWillBeSent`；完整观察期只有八个 `127.0.0.1:30001` 静态资源请求，外部请求为 `0`。未调用真实 Provider。启动 PID `30968` 已退出，30001 无监听；代理页签关闭，未创建第二 Lab、备份、世界副本或 LevelDB 访问。

本地 Foundry fresh plaintext attempt 层：`PASS`。本地 Actor create/readback/UUID reuse/cleanup 层：`PASS`。这是 E1 的完整 plaintext import/recovery 用户路径，不代表真实 AI Provider 或生产验收。

### 16.6 未执行验收层级

- 真实 AI Provider：没有当次凭据使用授权，`NOT_EXECUTED`；不影响已经独立完成的 plaintext E1 路径，也不能据此宣称 AI recovery PASS。
- 生产、长时、source library、batch、queue：不在 E1 范围，`NOT_EXECUTED`。

### 16.7 发布批次与边界

- E1 实现提交：`090df31c29c40a24a7730d5677051c1eaa578ccf`，精确包含七个 Forge runtime/module/test/package 路径；敏感词复核只命中 UI 字段名、拒绝恶意字段的负例，以及 `keep-me` / `keep-secret` 惰性测试哨兵，没有真实凭据。
- 发布前产品 WorkTree `I:\OpenCode\fvttV12JsonGenerator-worktrees\20260822-150000-forge-fvtt-product` 状态 clean、索引为空，本地 `codex/forge-fvtt-product` 为 `91435d1f5bbd1429c23ca4d7df2aa2f700e4dfc3`；远端发布前为 `7cea7c15e321f37ac822bf9766649d43629ec1b4`，本地仅领先已批准但此前未 push 的 Task E 计划提交。
- 本发布批次只允许 `--ff-only` 集成 topic 最终提交并 push `origin codex/forge-fvtt-product`。发布完成以 topic/product/tracking/`ls-remote` 精确 SHA 一致和两个 WorkTree clean 为机械证据；不 push topic，不清理 WorkTree/branch，不进入 E2。

## 17. 完整 Task E 实现与验收证据（2026-08-30，实现完成、待发布授权）

本节记录从已发布 E1 和已完成 E2 继续得到的 E3/E4 证据。它是同一个 Task E goal 的完整 ledger，不是新的独立产品任务。当前实现 WorkTree 为 `I:\OpenCode\fvttV12JsonGenerator-worktrees\20260830-165605-forge-fvtt-task-e2-source-library`，分支 `codex/20260830-165605-forge-fvtt-task-e2-source-library`，基线 HEAD `91d87dd256b4be34d61f51acb0b349cfc8c32dfe`；所有 Task E 改动仍为未提交状态，产品 WorkTree 未写入。

### 17.1 已实现范围

- `batchCollection.ts` 定义 strict mixed Actor/Item Collection V1、稳定 collection/entry identity、200 条目/64 MiB collection/200,000-byte 单来源门禁、凭据扫描，以及标准 ZIP encode/decode。ZIP decoder 逐项核对 EOCD、central/local header、canonical path、重复/重叠 entry、flag、method `0/8`、CRC、压缩/展开大小、UTF-8 与未引用记录；deflate 采用有界 stream，在声明大小或 collection 总量越界时主动取消。
- `batchQueue.ts` 定义 browser-local queue V1 与 `pending/running/interrupted/accepted/needs_review/failed/rejected/cancelled/applying/applied/apply_failed` 状态；持久层与 runner 的并发均固定为 `1`。`running/applying` 重开只转为 `interrupted`，不自动重试；accepted proof、source/object kind/hash、artifact hash、精确 target 与 deterministic UUID 在 apply 前重新核对。
- `batchQueueIndexedDb.ts` 使用 `worldId:userId` scope、事务 revision/optimistic concurrency、quota 映射、authority guard 与同 scope `BroadcastChannel` 通知；不写 world setting/flag 或 LevelDB。
- Forge Intake UI 支持 Collection JSON、标准 ZIP 与 portable queue 的真实 file chooser import，portable queue/ZIP export，逐项只读 source/review，concurrency-1 runner、显式 stop、逐项可逆 cancel/requeue、current-session accepted response map、immutable apply manifest、一次确认与 Actor/Item type-specific adapter。cancelled job 不参与 runner，GM 显式恢复为 pending 后才可再次启动；安全 review 不丢失。跨会话恢复的 accepted safe review 不能直接 apply；它只会使 runner 可用，GM 显式重跑后才以新 attempt 重建当前 session response。没有自动重放、自动 apply、generic Document adapter、跨 Document 原子性或关页后伪后台。
- GM/runtime 权限在 Provider 创建、异步存储提交、apply 每项与 UI availability hook 上重复核对；权限丢失时 Source Library 与 Batch Queue metadata 立即 fail-closed 隐藏并禁用全部入口。独立安全 reviewer 对最终权限竞态修复判定 `PASS`。

### 17.2 当前机械证据

- `bun run test:fvtt-json-forge`：最终 `183 pass / 0 fail / 1913 expect()`，覆盖 13 个 Forge/runtime/module test 文件；除既有 runner/recovery/cancel 回归外，新增真实 readback 发现对应的嵌入 feat attack range 回归，以及 `apply_failed` 只有经 GM 显式 fresh run 才能恢复、保留旧 accepted proof 但清除失败 apply result 的状态机回归。
- `bun run typecheck:packages`：PASS。
- `bun run typecheck:foundry-modules`：PASS。
- `bun run architecture:verify`：PASS；`10940 modules / 12191 dependencies` 无 dependency violation，cycle gate exit `0`。
- `bun run build:fvtt-json-forge`：PASS；输出仍精确为 `module.json`、`scripts/index.js`、stylesheet 与三份 template 共六文件。
- `git diff --check`：PASS。
- `agents:check`/`ci:verify` 仍只有既有 `foundry-modules/fvtt-selected-token-sync/AGENTS.md` 未列入显式清单这一继承失败；Task E 不修改无关 owner 掩盖它。
- 全仓 `bun run test` 仍在既有 hermetic/species fixture 子进程处不结算；有界观察后中断且按未完成报告，没有把 focused/module 绿色升级为全仓 PASS。

### 17.3 真实 Foundry Collection/ZIP 与跨会话证据

- 当前唯一 Lab 由项目 CLI 启动：PID `37112`，命令行精确指向 Foundry `14.364`、`F:\FoundryLab\foundry-v14\data\server-mirror`、world `cor-cotn`、`127.0.0.1:30001`；真实页面显示 dnd5e `5.3.3`、GM `FccwB5HfAhy1F49a`。安装前目标模块恰为六文件，最终安装后六个 source/target SHA-256 逐项相等；当前 browser script SHA-256 为 `7102ed679141b760c1c411ef943b6bc344fd7b95fecc4e118fd3cdaf67dbef8e`，最终 Intake template SHA-256 为 `4892a74b28aa3c4921983885f5e8bff44c75bee249e02409de7331354640428d`。没有第二 Lab、备份或 LevelDB 访问。
- 初始 Source Library 为 revision `6`、`0 source / 0 review`；Batch Queue 为 revision `0`、`0 collection / 0 job`；世界基线 Actor `283`、Item `179`、ChatMessage `973`。
- 真实 file chooser 导入 mixed JSON：Collection `collection:v1:ecbda1a79ec9989bd41b3a9b9c4e94f572705ea3f371a2ef2fe96b19559ec950` 精确显示一个 `plaintext-actor` Actor 与一个 `ai-item` Item，顺序、label、kind/mode/hash 与生成 contract 一致；queue revision `0→1`、`1 collection / 2 pending jobs`。
- 同一 Collection 的标准 ZIP 经真实 file chooser 导入后保持 revision `1`、`1 collection / 2 jobs`，证明 strict decoder 与 identity merge 幂等，没有重复 job。真实 UI 点击该 collection 的“导出 ZIP”后，页面内临时且随即恢复的 Blob 探针读取到文件名 `forge-collection-Task-E-mixed-Actor-Item-acceptance.zip`、MIME `application/zip`、大小 `5291` bytes、ZIP magic `504b030414000008` 与 SHA-256 `d7d6c85ca9e7e4749534fd20877d27f17f069bad3af15d679fca167533f45b43`；它与此前由同一正式 encoder 生成、通过真实 file chooser 导入的 `mixed-collection.zip` 大小及 SHA-256 完全一致。因此真实 UI export→strict import 字节 round-trip 已证明；当前 Browser 控制层仍未交付可核对的磁盘下载句柄，本计划不冒充用户磁盘保存结果。
- portable queue 含一个持久 `running` job。真实导入后立即变为 `interrupted`、attempt `1`，错误明确写明页面关闭/刷新中断且不会自动重发；queue revision `1→3`、`2 collections / 3 jobs`。导入/恢复前后 Provider resource 为空，世界计数保持 `283/179/973`。

### 17.4 真实 runner 当前证据与未完成项

- 首次在没有已测试 AI connection 的情况下显式启动 runner，普通结构化 Actor Markdown 被正确结算为 `needs_review`、attempt `1`；旧实现随后在 `ai-item` 前停止。queue revision `3→5`，Source Library revision `6→7`；世界计数与 Provider resource 均不变。该 `needs_review` 是真实输入语义而不是 runner 缺陷：结构化 Actor Markdown 不是 plaintext collection block，不能被错误提升为 accepted。
- 真实现场暴露的调度效率问题已按产品范围修复：缺少当前已测试 AI connection 的 job 现在保持 `pending/attempt 0`、本轮零请求跳过，并继续后续可离线运行项；不是把它伪造为 cancelled/failed/accepted。新增 focused 与完整 Forge 回归均通过，更新后的六文件重新安装并逐项 SHA-256 相等。
- tracked `tests/fixtures/plaintext/月蚀矿腐化生物数据.md` 经正式 `splitCollection()` 得到两个单实体 block，并由正式 `createForgeBatchCollection()` 生成 Collection `collection:v1:8a2b0e79d0635dfc6b27d58df75879a5fac3d7f4fabed8ce6108048101e6ecac`。真实 file chooser 导入后 queue revision `5→6`、`3 collections / 5 jobs`，两个新 job 初始均为 `pending/attempt 0`。
- 更新后显式运行一次：两个既有结构化 Markdown job 各自保持 `needs_review`，未连接 AI Item 保持 `pending/attempt 0`，随后 `Scuttling Serpentmaw` 与 `Slithering Bloodfin` 依次成为 `accepted/attempt 1`。最终 queue revision `14`；Source Library revision `11`、`3 sources / 5 reviews`，其中两个 accepted review 各绑定独立 request/attempt/source hash。全过程 Provider resource 为空，世界仍为 Actor `283`、Item `179`、ChatMessage `973`，证明没有自动 apply。
- current-session apply 按钮仅在这两个完整 accepted response 仍在内存时启用。打开但不确认的首个真实 manifest 为 `apply:v1:35d43a9f4a1827b84bc616edbe98f4c7d0b8c29e9538702a4706bf6ac030c55a`，精确列出两个 Actor 的 sourceId、artifactHash 与 deterministic Document ID，并明确不是跨 Document 原子事务；选择“否”后世界计数不变。刷新页面后两个 persisted review 仍显示 accepted，但完整 response 不复活，apply 按钮变为 disabled，且零 Provider 请求。
- 上述刷新现场暴露并修正了最后一个跨会话闭环缺口：历史 accepted 原先既不能 apply 也不能重新启动。现在 accepted proof 仍持久保留，但仅当本页面缺少其完整 response 时才显示 runner 可用；不会在载入时自动运行。真实页面刷新后观测 `batch-run enabled / batch-apply disabled`，GM 单次显式启动后 concurrency 仍为 `1`：两个 needs-review job 从 attempt `2→3`、未连接 AI Item 保持 `pending/attempt 0`，两个 accepted plaintext Actor 从 attempt `1→2`；queue revision `14→22`，Source Library revision `11→15`、`3 sources / 9 reviews`，旧 review 与新 review 同时保留。
- 显式重跑后 apply 再次启用，证明只有当前 session 新 response 可用。打开但选择“否”的新 manifest 为 `apply:v1:ef2e665deff4019598fd180670b416e5c4c6f3eaee9f0946af0a0466b3b3f256`：`actor:v1:795c6bb9-5f6c-489e-b97c-571392aa03f7 → 47c09124d81aa4ab · 36164e109db17a9608ade1d378ed5a36221b34181702ffd78362192f00f2b098`，以及 `actor:v1:2e68aa77-8416-498b-918d-5023e7d0c45b → 97466da651df779f · 39c7d6c12b72875e50bc9c169fdafdcc4ec7d308a43055f6919bcf0a7711affd`。全过程外部 fetch/XHR 为 `0`，世界保持 Actor `283`、Item `179`、ChatMessage `973`。
- 完成审计又发现 `cancelled` 原先只有 schema 状态、没有逐项产品入口，且会被全局 runner 当作可运行。现已增加逐项可逆 cancel/requeue；真实页面对既有 `Task E Knight Shield Item` 执行一次 `pending/attempt 0 → cancelled/attempt 0 → pending/attempt 0`，queue revision `22→23→24`。cancelled UI 明确“只有显式恢复为 pending 后才会再次运行”，恢复按钮不会直接启动；全过程外部请求为 `0`，世界保持 `283/179/973`，且最终业务状态精确返回原来的 pending。
- 加载上述最终实现的页面刷新按设计使旧 current-session manifest 失效。为把写入授权边界准备到真正可执行的当前状态，GM 又显式运行一次：两个 needs-review job 进入 attempt `4`，AI Item 仍为 `pending/attempt 0`，两个 plaintext Actor 进入 `accepted/attempt 3`；queue revision `24→32`，Source Library revision `15→19`、`3 sources / 13 reviews`。外部 fetch/XHR 仍为 `0`，世界仍为 `283/179/973`。当前打开核对后选择“否”的最新 manifest 为 `apply:v1:2273b2743fe4e84e7d1135475d9ef6ed47650a934b9f876707aa8819b87460a3`：`actor:v1:f291f754-10fd-4959-967e-cda927a79f1a → c193f20b547260ac · 36164e109db17a9608ade1d378ed5a36221b34181702ffd78362192f00f2b098`，以及 `actor:v1:5ec0898b-4eff-47b3-b4e4-ac77aea65656 → 6d4601f55aaf9a81 · 39c7d6c12b72875e50bc9c169fdafdcc4ec7d308a43055f6919bcf0a7711affd`；Apply 按钮保持 current-session enabled，但尚未写世界。
- 最终 UI 审计把误导性的“顺序运行 Pending / Interrupted”修正为真实范围“顺序运行可恢复 Jobs”；最终构建真实页面显示该文案，刷新后仍为 `runner enabled / apply disabled`。GM 显式运行最终构建后，两个 needs-review job 进入 attempt `5`、AI Item 仍为 `pending/attempt 0`、两个 plaintext Actor 进入 `accepted/attempt 4`；queue revision `32→40`，Source Library revision `19→23`、`3 sources / 17 reviews`，外部请求 `0`、世界 `283/179/973`。此前 manifest 因最终模板加载而按设计失效；当前可执行但已选择“否”的最终 manifest 为 `apply:v1:313e38b4870b15c31209835505b26b13c7e3065cfa795e9d1d6055dc22f2277f`：`actor:v1:a47261ac-18bb-4e11-8df3-4ceb7b03d270 → de16fe0549d11cd0 · 36164e109db17a9608ade1d378ed5a36221b34181702ffd78362192f00f2b098`，以及 `actor:v1:ab123aee-ba21-48ad-bdec-adaa8ed1568c → 49edf73bca8225a8 · 39c7d6c12b72875e50bc9c169fdafdcc4ec7d308a43055f6919bcf0a7711affd`。
- 真实 Provider、关页后仍运行的 Companion/Gateway owner、生产和长时验收保持 `NOT_EXECUTED`。其中 Provider/Companion/生产是明确外部权限边界；browser-local interrupted recovery 已按诚实边界通过。

### 17.5 真实 batch apply/readback、失败恢复与 UUID reuse

- 用户明确授权本地批量写入、readback/reuse 与精确清理后，对 manifest `apply:v1:313e38b4870b15c31209835505b26b13c7e3065cfa795e9d1d6055dc22f2277f` 执行 accepted-only apply。`Scuttling Serpentmaw` 首项创建并回读为 `Actor.de16fe0549d11cd0`；`Slithering Bloodfin` 第二项在 `$.items[6].activities[2].value.range.reach` 发生真实语义 readback 不匹配，adapter 自动删除仅该失败新建 Actor，队列精确成为 `applied / apply_failed`，世界只增加首项至 `284/179/973`。本 ledger 明确推翻“机械绿色足够”的旧预期，没有把部分写入冒充成功。
- 失败 Actor 的一次受控捕获证明 dnd5e `5.3.3` 的 Activity `RangeField` 不支持旧 `reach`，实际会丢弃该字段。武器 Item 已有父 `system.range` 可重建 reach，失败对象却是没有父 range 的嵌入 feat。最小修复因此只把这类 v14 embedded attack 投影为 `override:true / value:5 / units:ft`，不改写 weapon/thrown range，也不放宽 readback 比较；Foundry 持久化后将 `value` 规范为语义等价的字符串 `"5"`。focused Actor/Item/browser tests 与完整 Forge suite 均通过。
- 首项仍在当前 session 时，用同一 accepted response 再次调用既有 Actor adapter，返回 `existing`、UUID 仍为 `Actor.de16fe0549d11cd0`，Actor 数保持 `284`，证明 deterministic reuse，而不是重复创建。
- 真实失败又暴露 `apply_failed` 原先无法进入 runner 的恢复缺口。状态机现允许 GM 显式 fresh run：旧 accepted proof 保留用于审计，attempt 递增，失败 apply result 清除；没有自动重试。刷新加载修复后，Bloodfin 从 `apply_failed/attempt 4` 经一次显式 runner 成为 `accepted/attempt 5`；其他历史 job 各自保持 `needs_review` 或 `pending/attempt 0`，新增外部 fetch/XHR 为 `0`，世界仍为 `284/179/973`。
- 最终单项确认 manifest 为 `apply:v1:46d24f91f6f28db0d53218f9b74b4931d7d2dc1fedb73262e8f1a0b914a0cd62`：`actor:v1:1469e948-7007-4381-ac4e-16b4c710f171 → eebeefe394990cae · 97ae36044a853a99c8687edf3183bb21b85a20b6c7227dd7e13f56a130baec52`。真实确认后创建并回读 `Actor.eebeefe394990cae`，队列 revision `52`、两个目标 job 均为 `applied`，世界为 `285/179/973`。
- 对 Bloodfin 同一 response 再次调用 adapter 返回 `existing`、UUID 不变、Actor 数保持 `285`。独立 readback 抽样核对名称 `滑行血鳍 (Slithering Bloodfin)`、`npc`、HP `143`、AC `16`、CR `9`、九个 embedded Item 与 Swallow `5 ft` 均与 accepted artifact 语义一致；完整 adapter readback/reuse 门禁同时通过。

### 17.6 精确清理与最终零残留

- 清理前逐项核对两个临时 Actor 的精确 Document ID、`sourceId` 与 `artifactHash`，然后只通过公共 `Actor.deleteDocuments()` 删除 `de16fe0549d11cd0` 与 `eebeefe394990cae`。返回名称分别为 Scuttling Serpentmaw 与 Slithering Bloodfin；世界从 `285` 恢复 Actor `283`，Item/ChatMessage 保持 `179/973`，两个精确 ID 均不存在。
- browser-local 清理前精确列出本验收从空基线创建的三个 Collection、五个 job、三个 source 与二十条 review；依次按精确 identity 删除 collection 及其 job、source 及其 review。整页刷新后 Batch Queue 持久为 revision `55`、`0 collection / 0 job`，Source Library 持久为 revision `29`、`0 source / 0 review`。
- 临时夹具根 `C:\Users\Administrator\AppData\Local\Temp\forge-task-e-20260830-1919` 先解析并确认位于预期 Temp 根，随后用不含 `-Force` 的递归删除移除六个条目；路径最终不存在。
- 最终模块仍精确为六文件，source/target SHA-256 全部相等；browser script 为 `9eff9fc71d5671d6bb77e84b55187e486274285ceafb9baf359121ae52055939`，Intake template 为 `4892a74b28aa3c4921983885f5e8bff44c75bee249e02409de7331354640428d`。最终整页加载确认 Foundry `14.364`、dnd5e `5.3.3`、active GM/module、世界 `283/179/973`、零 Task E browser-local 记录和零本次临时 Actor；随后关闭代理页签并通过项目 CLI 停止 `server-mirror`，PID `37112` 已退出且端口 `30001` 无监听。

### 17.7 Task E 完成边界与发布停止点

- 用户结果已覆盖同一 Task E 的 review bundle import/recovery、source library、mixed Actor/Item Collection、标准 ZIP、跨会话 browser-local concurrency-1 queue、interrupted/accepted/cancelled/apply_failed 显式恢复、accepted-only manifest、真实 Actor batch write/readback/reuse 与精确清理。E1/E2/E3/E4 只是本计划内部实施顺序，不是四个需分别等待或发布的产品任务。
- 机械层：Forge `183/183`、packages/modules typecheck、architecture、build、六文件 hash、`git diff --check` 均 PASS。`agents:check`/`ci:verify` 的既有 selected-token-sync AGENTS 清单失败，以及全仓 test 的既有 hermetic/species 不结算，仍按继承问题报告，不伪装为 Task E 绿色。
- 真实语义层：Foundry `14.364` / dnd5e `5.3.3` 的 Collection/ZIP、跨会话恢复、zero-request plaintext runner、partial apply failure、最小修复、apply-failed recovery、两个 Actor readback/reuse 与零残留均 PASS。
- 不在本次完成声明内：真实 AI Provider、生产、四小时长时会话，以及浏览器关闭后仍执行的独立 Companion/Gateway。Task E 明确交付诚实的 browser-local 可恢复队列；不会把页面关闭后的 `interrupted` 恢复冒充真正后台守护进程。
- 明确停止点：实现和本地验收完成，但当前 WorkTree 仍未提交，产品 WorkTree 未写入。下一动作只剩用户另行授权的 commit / fast-forward integration / push；不得自动 commit、push、merge、stash、reset 或清理 WorkTree/branch。

上述停止点是实现 WorkTree 的历史记录。Task E 随后以提交 `925377eb97d53c5995718be8a90b96a497fac9e5` fast-forward 到 `codex/forge-fvtt-product` 并推送远端；Release Closure 只统一发行身份、文档、ZIP 和干净 Lab 安装 smoke，不新增 Task F 产品能力。

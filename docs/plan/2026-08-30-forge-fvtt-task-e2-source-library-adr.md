# Forge FVTT Task E2：Managed Source Library 存储 ADR

- 日期：2026-08-30
- 状态：E2 已实现并通过本地真实语义验收与清理；尚未提交或发布
- 基线：`codex/forge-fvtt-product@91d87dd256b4be34d61f51acb0b349cfc8c32dfe`
- 关联计划：[`2026-08-30-forge-fvtt-task-e-plan.md`](2026-08-30-forge-fvtt-task-e-plan.md)

## 1. 决策目标

E2 必须让 GM 在 Foundry 14.364 / dnd5e 5.3.3 中跨页面会话管理来源和历史 review record：显式保存、搜索、打开、删除、导入和导出。持久记录只用于恢复来源或打开 E1 的只读历史；它不能自动调用 Provider、恢复旧 HTTP/SSE、构造 accepted response、创建世界 Document 或充当后台队列。

## 2. 候选比较

| 方案 | 能满足的结果 | 主要边界 | 决定 |
|---|---|---|---|
| 仅显式文件导入/导出 | 可移植、用户掌握文件 | 无索引、无跨会话搜索；每次必须重新选择文件 | 保留为完整 library 与逐记录的 portable export/import，不作为唯一 store |
| client-local IndexedDB | 同一浏览器/Foundry origin 下跨页面会话搜索与恢复；单事务写入大于 localStorage | 同源脚本理论上可读；不是加密保险箱；浏览器清站点数据会删除 | **E2 主存储** |
| Companion/Gateway store | 可做跨设备同步、服务端配额和后台 job owner | 新认证、Key custody、部署、升级和攻击面；超出 browser-first E2 | 不实现；若未来需要跨设备/后台任务，另立 E4b 架构计划 |

## 3. 决定

使用一个 browser-safe managed library core，加一个 Foundry-origin IndexedDB adapter；同时提供严格版本化 JSON 的显式导入/导出。业务契约不依赖 Foundry、Node、Bun、filesystem 或 world Document API。

### 3.1 数据模型

- Library envelope：固定 schema、version、单调 `revision`、`updatedAt`、`sources[]`、`reviews[]`。
- Source record：由 `objectKind + mode + rawSourceHash` 派生稳定 ID；保存原始来源、安全显示标签、创建/更新时间和逐记录 revision。
- Review record：以 strict E1 decoder 得到的 normalized bundle hash 为稳定 ID，引用对应 source record，保存冻结的规范化 V2 review bundle、历史状态和保存时间。
- 同一 source ID 若出现不同 bytes/hash/kind/mode，视为冲突并拒绝；不得按名称覆盖。相同 review hash 只有规范化 bundle 完全相同才允许幂等复用。
- 删除 source 默认级联删除其 review records；删除 review 不删除 source。所有删除均由 GM 显式触发。

### 3.2 容量与 quota

- 单 raw source 继续服从 E1 的 200,000 UTF-8 bytes 上限。
- 单 review bundle 继续服从 E1 的 4 MiB 上限。
- 首版最多 500 个 source、每个 source 最多 50 个 review、总计最多 5,000 个 review；规范化 library JSON 最多 64 MiB。
- 写入前在内存中完成 strict validation 与规范化大小检查；`QuotaExceededError` 显示为可操作错误，不删除旧状态、不自动淘汰记录。

### 3.3 同源可见性与加密声明

- IndexedDB 属于当前 Foundry origin 的 client-local storage，不写 Foundry world settings、flags、Chat、Actor、Item 或 LevelDB。
- 实际 database 以 `worldId + GM userId` 作为 record scope，避免 UI 中意外混用不同世界或不同 GM 的 library；portable export 不携带该本机 scope，可由接收方显式导入。
- 它没有模块级加密隔离；同一 origin 中具有脚本执行能力的其他模块理论上可读取。UI 必须持续显示这一事实。
- Library 永不保存 API Key、Authorization、Cookie、完整 endpoint、provider raw payload、完整可提交 artifact、内部路径或世界数据。导出前再次执行敏感字段和值扫描。

### 3.4 事务、崩溃一致性与多客户端

- IndexedDB 只保存一个规范化 envelope；每次变更在单个 `readwrite` transaction 中读取当前 revision、比较 expected revision、再原子替换。
- 浏览器在事务提交前崩溃时保留旧 envelope；提交后得到完整新 envelope，不接受半写记录。
- 同一 origin 的多窗口通过 envelope revision 做 optimistic concurrency；revision 不匹配时拒绝 stale write、重新加载并要求用户重试，不静默 last-write-wins。
- 使用 `BroadcastChannel`（可用时）通知其他窗口刷新；它是体验优化，revision gate 才是正确性边界。
- 不提供跨设备同步；portable JSON 是 E2 的显式转移路径。

### 3.5 Schema migration

- IndexedDB database version 与 library envelope version 分离。
- 首版只接受 envelope V1；未知未来版本 fail-closed，旧状态保持不变。
- 后续 migration 必须是逐版本、纯函数、先完整验证再原子替换；不得在读取时部分修改。
- 导入文件使用同一 strict decoder。Merge 以稳定 ID 幂等合并；任何 hash/identity 冲突使整个导入原子失败。

## 4. E2 用户结果与范围

E2 完成时，GM 可以：

1. 把当前非空来源显式保存进 library；有当前或 imported review 时同时保存规范化安全 review record；
2. 按显示名、source ID、hash、mode、kind、历史状态和 review attempt/request 搜索；
3. 打开 source 为无 identity 的草稿，或打开 review 为 E1 imported read-only record；两者都不会自动 Analyze、测试连接、调用 Provider或写世界；
4. 单独导出 source、review bundle，或导出完整 library；严格导入完整 library 并原子 merge；
5. 显式删除单个 review 或 source（source 删除级联其 reviews），并在页面重开后看到已提交状态；
6. 遇到 quota、schema、冲突、损坏、非 GM 或错误 runtime 时看到明确错误，旧 library 与当前 live attempt 不变。

E2 不包括 E3 collection/批量审阅/批量 apply/ZIP，不包括 E4 跨会话任务队列、自动重发或后台执行，也不改变 Task B/C world adapter、accepted-only、deterministic ID、readback 或 cleanup 规则。

## 5. 验收与停止点

机械门禁包括 strict decoder、bounds/quota、atomic merge/conflict、migration/version、IndexedDB transaction、search/open/delete/export、secret scan、GM/runtime 和 Task B/C/D/E1 回归，以及 package/module typecheck、architecture、build 和 browser forbidden-import。

真实语义验收必须在 Foundry 14.364 / dnd5e 5.3.3 中证明：保存后关闭并重新打开 Forge Intake 仍能搜索；打开 source 只是草稿；打开 accepted review 仍不能 Create；删除后重开仍不存在；portable export/import 字段保真；期间 Provider 请求和世界 Actor/Item/Chat/Scene 计数不变。

实现与离线测试获得本轮用户授权；用户随后单独授权精确本地 Lab 的只读导入/恢复验收。该授权不包含真实 Provider、世界 Document 写入、commit、push、产品分支集成或 WorkTree/branch 清理。发现必须保存凭据/完整 artifact、写 world settings/LevelDB、弱化 E1 decoder 或引入 Companion 才能完成时立即停止。

## 6. E2 实施与验收证据（2026-08-30）

### 6.1 已实现边界

- `@fvtt-json-generator/forge-browser-runtime` 新增严格 V1 managed library core 与 IndexedDB adapter；Foundry module 只组合当前 `worldId:userId` scope，不把业务契约耦合到 Foundry 或 filesystem。
- 保存、导入和每次 mutation 都先在内存中完成 strict normalize、bounds、safe-integer revision、完整 serialize/decode round-trip 与 configured-secret 扫描；标签与最终候选 envelope 也在扫描范围内。
- IndexedDB 在一个 `readwrite` transaction 中读取当前 envelope、比较 expected revision、最后一次复核 GM/runtime、再执行 `put`。权限变化、冲突、quota 或 decoder 失败均保留旧 envelope；`BroadcastChannel` 只通知同 scope 页面，close 后不再发送。
- ApplicationV2 支持显式保存、搜索、打开来源草稿、打开 E1 只读 review、逐项/完整导出、strict merge import、删除 review 和 source cascade。所有异步 refresh/import/delete/save 在跨 `await` 后以及最终存储提交前重验 GM 与精确 `14.364/5.3.3`。
- E2 没有引入 Provider 调度、自动 Analyze、完整 response/artifact 恢复、世界 settings/flags/Document、Collection/ZIP、批量 apply 或跨会话后台队列。

### 6.2 机械证据

- 标准 `bun run test:fvtt-json-forge`：`150 pass / 0 fail / 1700 expect()`；其中新增 IndexedDB adapter 测试真实覆盖 commit/load、乐观冲突、quota 原子保留、pending get 期间撤权、scope 广播和 close。
- `@fvtt-json-generator/forge-browser-runtime` 与 `@fvtt-json-generator/fvtt-json-forge` typecheck：PASS。
- `bun run build:fvtt-json-forge`：PASS，产物仍是 manifest、browser script、stylesheet 与三份 template 六文件；最终 browser script SHA-256 为 `F0954542DA93BA6F48BA3EC3371E4169BD26A87BE0040A4F21BE26684F5B3AFA`。
- `bun run architecture:verify`：PASS，`10931 modules / 12153 dependencies` 无违规，cycle gate PASS；`git diff --check` PASS。
- 独立只读 Sol 安全复核先后指出标签 secret、safe revision、异步权限和 IndexedDB 最后提交竞态；全部按最小范围修正并补负例，同一 reviewer 最终判定 `PASS`，未发现剩余 P1/P2/P3。
- 全仓 `bun run test` 本轮记录为 `2280 pass / 2 fail`；两项失败分别位于未修改的 Forge Item closed summary 与既有 v14 generator AC formula 断言，均可在当前 E2 WorkTree 单独复现，不能用 E2 focused 绿色掩盖。产品 WorkTree 没有依赖安装，未在其上执行可比运行。
- `agents:generate` PASS；`agents:check` 与 `ci:verify` 仍在既有 `fvtt-selected-token-sync/AGENTS.md` 显式清单问题处 fail-fast，环境与 isolation 前置项 PASS。E2 不修改无关 owner 掩盖继承失败。

### 6.3 真实 Foundry 语义证据

- 精确目标为唯一 `F:\FoundryLab\foundry-v14\data\server-mirror`、`cor-cotn`、`127.0.0.1:30001`、Foundry `14.364`、dnd5e `5.3.3`、GM `FccwB5HfAhy1F49a`；最终六文件安装 SHA-256 与 build 完全一致。
- 从 revision `0` 显式保存来源后得到 revision `1`；保存 `needs_review` 后得到 revision `2`；新页面/重新打开 Intake 后仍可按标签、hash、mode、来源文本和状态搜索。打开来源只形成无 identity 的未分析草稿；打开历史 review 只进入 E1 imported read-only，Analyze 与 Confirm Create 均禁用。
- 完整 library 导出为 strict V1、`3504` bytes，包含一个 source/review 样本且不含 Key、Authorization、Cookie、endpoint、raw response、完整 artifact 或本机路径；同文件 strict import 幂等保持 revision `2`。非法 JSON 导入原子拒绝且既有状态不变；任务下载和临时文件已精确删除。
- 使用 tracked plaintext Serpentmaw fixture 经正式 plaintext Analyze/Generate 得到当前 accepted review，但未点击 Confirm Create；显式保存后 revision `3`。最终 build 重启、新页面和新 Intake 中仍读出 `2 sources / 2 reviews`，accepted review 明确显示历史 accepted、无完整 response/artifact，Analyze 与 Confirm Create 禁用；打开窗口内 `Network.requestWillBeSent` 为 `0`。
- 全程世界集合计数保持 Actor `283`、Item `179`、ChatMessage `973`、Scene `64`、Journal `67`、Playlist `0`、RollTable `12`；未调用真实 Provider，未写世界 Document、settings/flags 或 LevelDB。
- 用户明确授权删除后，在同一精确 Lab 中先从 revision `3` 删除 Serpentmaw 的 accepted review，得到 revision `4`、`2 sources / 1 review`，证明 review-only 删除保留 source；再删除 Serpentmaw source，得到 revision `5`、`1 source / 1 review`；最后删除 Rat source 并级联其 needs_review，得到 revision `6`、`0 sources / 0 reviews`。三段删除窗口均观测到 `0` 个网络请求。
- 完整刷新 Foundry 页面并重新打开 Intake 后仍为 revision `6`、`0 sources / 0 reviews`；世界集合计数仍为 Actor `283`、Item `179`、ChatMessage `973`、Scene `64`、Journal `67`、Playlist `0`、RollTable `12`。四条 client-local 测试记录已不可恢复地删除，未删除任何其他 library 记录；未调用 Provider，未写世界 Document、settings/flags 或 LevelDB。
- 清理完成后仅关闭 agent-owned 页面，浏览器 tab 列表为空；精确 Lab PID `33008` 已停止，权威复核为 `30001` 无监听、Lab 进程 `0`、PID 不存在、`options.json.lock` 不存在。没有遗留测试下载、临时文件或运行时现场。

### 6.4 发布边界

E2 当前位于独立 WorkTree `I:\OpenCode\fvttV12JsonGenerator-worktrees\20260830-165605-forge-fvtt-task-e2-source-library`、分支 `codex/20260830-165605-forge-fvtt-task-e2-source-library`，基线 `91d87dd256b4be34d61f51acb0b349cfc8c32dfe`。没有 commit、push、merge、stash、产品 WorkTree 写入或 WorkTree/branch 清理授权；产品集成分支 WorkTree 保持 clean。E3/E4 仍须新的计划与批准。

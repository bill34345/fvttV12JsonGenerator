# Forge：将现有生成能力带入 Foundry VTT 的产品执行计划

**状态：** 重建草案，等待产品决策确认  
**日期：** 2026-08-21  
**基线：** `codex/20260821-144739-forge-protocol-task-a` / `997e76fd126a8d26ee34e6704c7c09e38f2b2864`  
**计划分支：** `codex/20260821-210609-forge-fvtt-module-plan`  
**权威边界：** 本文是依据当前仓库、Task A 和 2026-08-21 外部调研重建的新计划，不是另一台电脑上遗失的原始 Plan，也不声称恢复了原 Plan 中未进入 Git 的决定。

## 1. 北极星目标

最终产品不是再做一套 Actor 生成器，而是让用户在 Foundry VTT 世界内使用本项目已经存在、且通过各自验收门禁的生成能力。

用户应当能够在 Foundry 中完成一条可理解、可预览、可拒绝、可追溯的闭环：

1. 选择或创建来源；
2. 选择明确受支持的能力，例如 Actor、Item 或 Intake；
3. 由外部 Gateway/Companion 调用仓库现有的公开 workflow；
4. 在写入世界前查看结果、诊断和语义差异；
5. 由有权限的用户明确确认写入；
6. 通过 Foundry 公共 Document API 创建或更新内容；
7. 导出或读回实际 Document，与来源和生成 artifact 做语义核对；
8. 保留来源身份、hash、生成器版本、Foundry/dnd5e 版本和验收状态。

“功能进入 FVTT mode”只有在这条用户闭环成立时才算完成。仅有协议、接口返回、JSON、构建产物或模块能够加载，都不等于产品目标完成。

## 2. 不可偷换的产品边界

### 2.1 必须复用现有业务能力

Foundry 模块不得复制 parser、generator、verifier 或 Intake 实现。它只负责 Foundry 内的交互、权限、Document 适配和读回；Gateway/Companion 只通过公开 workflow 调用业务能力。

### 2.2 模块不是 Node/Bun 应用

Foundry 模块运行在浏览器环境。文件系统、Bun/Node、Sharp、Crawlee、模型调用、Cookie 和本机进程能力必须留在模块外部。浏览器安全包只允许共享协议、纯类型、纯校验和无环境副作用的代码。

### 2.3 生成与写入必须分离

生成 artifact 不得自动写入世界。`generate`、`preview`、`apply` 和 `readback` 是不同状态；用户必须能在 apply 前停止。

### 2.4 支持声明逐层成立

协议 conformance、workflow 生成、Foundry 导入、真实运行行为、导出读回、模块共存、远程部署和长期会话是不同层级。某一层通过不得升级其他层。

### 2.5 高风险能力不伪装成普通按钮

认证爬取、批量生成、批量写入、生产世界操作、外部模型调用和远程 Gateway 都必须有独立授权、配额、审计和失败边界。第一版不因“已有 CLI 命令”就把它们全部暴露在模块 UI 中。

## 3. 当前事实与 Task A 的位置

### 3.1 Task A 已完成的基础

commit `997e76f` 新增了浏览器安全的 `@fvtt-json-generator/forge-gateway-protocol`。当前封闭能力集只有：

- `actor.standard.generate.v1`
- `source.actor.create.v1`

它还提供：

- Forge Protocol v1、服务身份和严格 schema decoder；
- Foundry 12、13、14 的 generator 路由及超前版本警告；
- 来源 `forge-source-id`、不泄露路径的 opaque `sourceRef`；
- source/artifact SHA-256；
- health、capabilities、结构化错误和诊断；
- 固定 `effectProfile=core`、`iconMode=off`、200,000 输入上限和单并发；
- 对当前 conversion application 的 v12/v13/v14 conformance 测试。

Task A 因而是“跨进程产品边界的契约地基”。它没有实现：

- Gateway 服务和真实 transport；
- 认证、会话、任务持久化、进度或取消；
- Foundry 模块 UI；
- preview、apply、readback；
- 本地/远程部署与安装；
- Item、Intake、collection、crawl 等后续能力。

### 3.2 现有产品能力的迁移分类

| 当前能力 | 当前 owner/入口 | 进入 Forge 的方式 | 优先级 | 说明 |
|---|---|---|---|---|
| 标准 Actor 生成与验证 | workflows、CLI、Web | 第一条完整垂直切片 | P0 | Task A 已有协议能力 |
| 标准 Item 生成与验证 | workflows、CLI、Web | 第二条完整垂直切片 | P1 | 必须单独建 Item protocol，不能把 Actor schema 泛化冒充完成 |
| Actor/Item collection | workflows、CLI/Web ZIP | 建立单对象闭环后再加批次 orchestration | P2 | 需要逐项 preview、部分失败和配额设计 |
| Vault Sync / 已管理来源 | CLI/workflows | 作为 Companion source library，不让模块直接碰磁盘 | P2 | 依赖稳定 sourceRef 和冲突处理 |
| 纯文本 Actor ingest | ingest-plaintext | 先产出可审查来源，再进入标准 Actor 生成 | P1 | 不允许绕过来源/IR/verification |
| 文档输入与 doctor | ingest-documents、CLI | 先做诊断/预处理能力，再进入正式来源 | P2 | 当前支持不等于 OCR/PDF/image 任意输入 |
| AI Monster Intake | intake-ai、Web/CLI | 独立的 review-required 流程 | P1 | `needs_review` 必须在模块中保持阻断状态 |
| AI Item Intake | intake-ai、Web/CLI | Item 闭环稳定后接入 | P2 | 当前只是 bounded static/application acceptance |
| Species Intake / 模块 artifact | species workflow/module | 独立内容产品流程 | P3 | 输出可能是模块包而非单个世界 Document |
| 图标解析与 review | assets-icons | 作为显式 opt-in 子能力 | P2 | 第一版继续 `iconMode=off`；不得静默开启 |
| GoddessFantasy crawl | crawl-goddessfantasy | 暂留 Companion/operator surface | P3 | 登录态、Cookie、授权和来源合规不适合普通模块按钮 |
| JSON 翻译/待翻译流程 | CLI legacy/product edge | 先重新定义用户闭环再决定 | Decision | 不因命令存在就自动纳入 Forge |
| Web 现有 job/API | apps/web | 可复用实现模式，不作为模块直接依赖 | P0 | Gateway 应复用应用层边界，不能让模块导入 Web 私有实现 |

### 3.3 已有 Foundry modules 的关系

仓库已经包含 chat-memory-guard、session-monitor、monster-spell-resolver、Blood Hunter、homebrew species、Babele rolltable translation、injury fading spirits、house rules、selected-token-sync 等独立模块。

它们证明仓库具备 module manifest、browser runtime、build、Lab install 和若干 runtime acceptance 经验，但它们不是“把生成器变成 Forge”的替代品。默认决策是：

- 保持独立产品和独立发布单元；
- 只抽取可复用的 module shell、设置、构建、Lab 安装和验收模式；
- 不把所有模块功能塞进一个 Forge 巨型模块；
- session-monitor 的 module + companion 结构可作为本仓架构先例；
- monster-spell-resolver 的 contract 边界可作为版本锁定先例。

## 4. 推荐产品架构

```text
Foundry VTT world
  Forge module (browser-only)
    - ApplicationV2 UI
    - GM permission and explicit confirmation
    - protocol client + diagnostics
    - Foundry Document preview/apply/readback adapter
                 |
                 | versioned Forge Protocol
                 v
Forge Gateway / local Companion
    - transport, auth, origin/session checks
    - job state, timeout, cancellation, quotas
    - opaque source store and artifact store
    - calls only public application/workflow APIs
                 |
                 v
Existing workflows -> parser/generation/intake/assets -> verifier
                 |
                 v
Artifact + diagnostics + provenance + verification evidence
```

### 4.1 为什么推荐 module + Companion/Gateway

这不是为了多造一层服务，而是由运行时边界决定：现有能力包含本地文件、Bun/Node、图片、爬虫、模型和长任务；Foundry module 是浏览器代码。外部项目 Foundry MCP Bridge 也采用“Foundry module + 独立服务”，并为本地 WebSocket 和远程连接分别处理 transport。这是可行性证据，不是要求复用其实现或 MCP 产品形态。

### 4.2 Transport 不在 Task A 中提前锁死

MVP 先只支持同机本地 Lab，做一个有时间盒的 transport spike，比较：

- loopback HTTP JSON + polling；
- loopback WebSocket；
- HTTPS/WSS 或反向代理下的远程连接；
- 浏览器在 HTTP/HTTPS、CORS、Private Network Access 和 mixed-content 下的实际行为。

决策门禁：用目标 Foundry 14.364 浏览器实际连接成功、断线恢复、错误可见、非 GM 被拒绝，并证明 Gateway 默认不监听公网。没有这个证据，不把某个 transport 写成长期承诺。

### 4.3 能力必须是封闭、版本化的产品动作

后续沿用 `noun.action.vN` 风格，每次只增加一个可验收能力。禁止增加 `run-command`、任意脚本、任意路径或“万能 JSON”接口。推荐演进顺序：

1. `actor.standard.generate.v1`（已有）
2. `source.actor.create.v1`（已有）
3. `item.standard.generate.v1`
4. `source.item.create.v1`
5. `actor.intake.monster.v1`
6. `item.intake.v1`
7. `collection.actor.generate.v1` / `collection.item.generate.v1`
8. 经过单独产品定义后才考虑 species、document 和 crawl 能力

## 5. 用户体验状态机

每个 capability 共用同一套可见状态，不用一个无限 spinner 掩盖过程：

1. **Disconnected**：说明 Companion 未运行、版本不兼容或连接被拒绝；
2. **Ready**：显示 Gateway、protocol、Foundry、dnd5e 和 capability 版本；
3. **Source draft**：来源尚未固定身份；
4. **Source saved**：返回 opaque sourceRef、sourceId、sourceHash；
5. **Generating**：显示 capability、requestId、超时和取消入口；
6. **Needs review**：诊断、warning、缺失证据或 Intake finding 阻止 apply；
7. **Preview ready**：展示将创建/更新的 Document、关键 mechanics 和差异；
8. **Apply confirmation**：显示目标 world、folder、document、创建/更新模式；
9. **Applied**：记录 Foundry UUID 和 apply 结果，但尚不宣称完成；
10. **Readback verified**：导出/读回后的来源相关投影相符；
11. **Runtime acceptance pending/passed**：只有需要真实行为测试的能力才进入该层。

关闭 UI、刷新浏览器或 Gateway 重启后，不得把未知任务显示为成功。重复请求必须通过 requestId/sourceHash/artifactHash 明确幂等或明确拒绝。

## 6. 分阶段执行

### Phase A — Forge Protocol 与版本/身份基础（已完成）

**基线：** `997e76f`

**完成定义：** 当前只认定协议包、严格解码、身份/hash、路由和 conformance 已实现。它不是模块 MVP。

**保留门禁：** 后续任何 schema 变更必须保持浏览器安全、封闭 capability、版本兼容测试和明确迁移策略。

### Phase B — Gateway/Companion 最小垂直切片

**用户结果：** 模块客户端可以发现一个真实 Gateway，协商版本，并提交一次 Actor 生成请求。

**范围：**

- 新建独立 Gateway/Companion application owner；
- health、capabilities、Actor generate transport；
- 默认 loopback、随机 instanceId、明确 origin/session 策略；
- 单并发、输入上限、超时、取消、结构化日志；
- sourceRef/artifactRef 由服务管理，客户端永远看不到文件路径；
- 调用现有 conversion application/workflow，不复制 generator；
- transport spike 与 ADR。

**机械验收：**

- schema/conformance、边界值、未知字段、版本不匹配、hash 不匹配、超时、取消测试；
- Gateway 只监听预期地址；
- 产物由正式 workflow 生成且 verifier 结果随 response 返回；
- 进程重启和重复 requestId 的状态有确定行为。

**语义验收：**

- 用真实来源生成的 Actor 与 CLI 同源结果在来源相关投影上相同；
- 错误信息能让用户区分“连接失败、来源失败、生成失败、验证失败”；
- 未接受结果不会被标成可 apply。

**停止条件：** transport 在目标浏览器安全策略下不成立，或必须公开监听/泄露路径才能工作时，停止并先改架构。

### Phase C — Foundry v14 Forge module shell

**用户结果：** GM 在 Foundry 内打开 Forge，看到真实连接状态、能力和版本，不需要开发者控制台才能判断问题。

**范围：**

- 独立 module manifest、ApplicationV2 UI、设置、localization；
- browser-safe protocol client；
- GM-only 写入，非 GM 只读或完全隐藏；
- 连接设置、健康检查、capability negotiation、诊断导出；
- 不包含真实 apply，先完成假 artifact preview。

**机械验收：** build、manifest、固定文件名、无 Node/Bun/private import、模块安装、启用、重载和卸载 smoke。

**语义验收：** 在 Foundry 14.364 / dnd5e 5.3.3 真实世界中打开 UI；连接/断开/版本错误/权限错误均有可操作说明；现有世界无额外 Document 写入。

### Phase D — Actor 完整闭环（第一个 MVP）

**用户结果：** 在模块内粘贴或创建 Actor 来源，预览并确认后创建 Actor，随后完成读回核对。

**范围：**

- managed source 创建与已有 Markdown 导入；
- Actor 生成、诊断、关键字段/mechanics preview；
- create-only 先行；update 必须等冲突/覆盖策略通过后开启；
- 通过 `Actor.create` / Document 公共 API 写入；
- 导出或 `toObject()` 读回并做来源相关语义投影；
- 保存 sourceId/sourceHash/artifactHash/generator/target 元数据到安全的 module flags；
- `needs_review`、warning 和 verification failure 的阻断规则。

**机械验收：** protocol、module adapter、重复提交、权限、folder、name collision、失败清理和无孤儿 Document 测试。

**语义验收：** 至少覆盖中文 Actor、英文 Actor、一个复杂 Activity/Effect Actor；逐个检查来源忠实度、sheet 可打开、代表 Activity 可执行、导出读回一致。必须在受保护的本地 Lab 中完成，不以 mocks 代替。

**MVP 完成定义：** 新用户只按 UI 指引即可完成上述闭环；发生失败时不会误以为内容已安全写入。

### Phase E — Item 完整闭环

**用户结果：** 与 Actor 同等级的 Item source → generate → preview → apply → readback。

**范围：** 新建 Item protocol，而不是给 Actor request 加可选字段；先 create-only，再支持附加到 Actor；world Item 和 embedded Item 分开确认。

**语义验收：** 使用当前 bounded Shield workflow，检查 AC 生命周期、Activity、uses、duration/concentration、导出读回；这只证明该代表流程，不升级成任意 Item 支持。

### Phase F — Intake 与 review-required 流程

**顺序：** plaintext Actor → AI Monster Intake → AI Item Intake。

**产品要求：**

- 先展示抽取/IR/来源证据，再生成正式 artifact；
- `needs_review` 是一等状态，不能被“继续”按钮默认跳过；
- review finding、修复次数、模型/提供方和可复现材料可导出；
- 模型凭据只在 Companion，绝不进入 Foundry flags、聊天消息或 module bundle；
- AI Item 只有在其 Foundry Lab lifecycle gate 通过后才能宣称 runtime Pass。

**语义验收：** 复用当前 accepted fixtures，并增加真实 UI 中的拒绝、修复、重新生成和 apply 前后对照。

### Phase G — Collection、source library 与可恢复任务

**用户结果：** 批量操作仍然逐项可审查，不因一个失败而丢失全部工作。

**范围：**

- managed source library、搜索和 stale/hash 冲突提示；
- Actor/Item collection；
- 每项状态、部分失败、重试和取消；
- 显式 dry-run/preview；
- 世界写入前生成 apply manifest；
- 限额和背压，不提高并发来掩盖长任务。

**验收：** 证明重复执行不会制造不可解释的重复 Document；失败项和成功项可分别恢复；批量 apply 仍需 GM 明确确认。

### Phase H — 其他能力的产品化决策

以下能力不得自动继承前面阶段的“已纳入”结论，必须各写一页产品定义：

- document ingest/doctor；
- icon safe mode 与人工 override；
- Species 或其他 module artifact 生成/安装；
- GoddessFantasy 或其他认证 crawl；
- 翻译工作流；
- Vault Sync 的双向冲突处理。

每页必须回答：目标用户、输入、输出、权限、凭据、preview、apply、回滚/恢复、版本范围、机械门禁、语义样本和明确非目标。

### Phase I — 发布、兼容与长期可靠性

**范围：**

- module 与 Companion 分开版本，建立 compatibility matrix；
- manifest/download/release artifact、确定性构建、安装器或明确手动安装；
- Foundry v14/dnd5e 精确版本门禁；
- v12/v13 只有在各自 UI + runtime matrix 通过后才升级为产品支持；
- 断线、升级、旧协议、旧来源、旧 artifact 的迁移；
- 可导出但脱敏的支持包；
- 与代表模块集的共存 smoke；
- 本地 Lab、生产接受和长时会话分开报告。

**发布门禁：** 没有 signed-off support matrix、安装/升级/卸载证据、真实 Actor 和 Item 闭环、失败恢复证据，不发布 1.0。

## 7. 版本策略

推荐第一版只承诺 Foundry `14.364` / dnd5e `5.3.3` / `core` / `iconMode=off` 的完整产品闭环。

- Task A 的 v12/v13 路由继续保留并测试；
- 路由存在不等于模块 UI/runtime 已支持；
- `>14` 的 v14 forward fallback 必须显示显著 warning，不能列为 verified；
- modded-v14、MIDI-QOL、DAE 和其他 module profile 进入独立兼容阶段；
- 每次版本相关结论使用锁定 reference cache、目标安装源码或官方精确版本 API，不凭最新文档猜测。

## 8. 安全、权限与数据策略

- Gateway 默认只监听 loopback，远程模式默认关闭；
- 远程模式必须使用 TLS、认证、origin allowlist、速率/任务上限和明确部署文档；
- Foundry 写入只允许有权限的 GM，并在每次 apply 前确认精确目标；
- 模块只调用 Foundry 公共 Document API，不直接编辑 LevelDB；
- 不把 API key、Cookie、绝对路径、原始未脱敏日志写入 flags、artifact 或仓库；
- sourceRef/artifactRef 必须 opaque，路径解析只在 Gateway 内；
- 生成内容和来源可包含不可信文本，UI 渲染必须防止 HTML/script 注入；
- capability negotiation 必须 fail closed；未知能力、未知字段、未知版本一律拒绝；
- 批量/生产写入不因本计划获得授权，仍需当次明确批准。

## 9. 测试与验收金字塔

| 层级 | 工具/环境 | 能证明什么 | 不能证明什么 |
|---|---|---|---|
| 纯函数/协议 | Bun tests、schema fixtures | decoder、hash、routing、状态机 | Foundry runtime |
| workflow conformance | 现有 conversion application/verifier | Gateway 未复制业务逻辑、artifact 结构 | UI 和 Document 行为 |
| module unit | mocks + browser-safe build | adapter 分支、权限和错误映射 | 真实 hooks/sheets |
| Foundry 内测试 | 目标 Lab，必要时 Quench spike | 初始化后的 API、hooks、Document 行为 | 完整用户旅程 |
| 浏览器 E2E | Playwright/现有 browser control | 登录、UI、preview、confirm、apply、readback | 长时桌面体验 |
| 人工语义验收 | 来源、artifact、readback、实际 Activity | 是否真的符合产品目标 | 任意输入的普遍正确性 |
| 共存/生产/长时 | 独立授权和报告 | 指定环境的兼容与稳定性 | 其他未测试环境 |

每个阶段的报告必须分开写机械证据和人工/语义证据。

## 10. 外部工具、Skill 与 Plugin 调研结论

### 10.1 立即采用或继续采用

| 工具/实践 | 决策 | 用途与依据 |
|---|---|---|
| 官方 Foundry module/API 文档 + 精确版本源码/reference cache | 采用 | 官方文档定义 manifest、ES modules、Document 与 module 边界；最终结论仍锁定 v14.364/dnd5e 5.3.3 |
| Vite 固定名称构建 | 继续采用 | Foundry 社区指南和 FVTT skill 都使用 Vite；本仓已使用 Vite。必须禁用影响 manifest 路径的 asset hash |
| 项目级 `AGENTS.md` / context 文档 | 采用 | 活跃 Foundry 项目 Nimble 用它记录 globals、Document update、build、测试和 agent 易错规则；本仓已有更严格分层规则 |
| Playwright 浏览器 E2E | 采用为方向，先复用现有 Lab/browser harness | 社区测试讨论和 Foundry 专用框架都使用 Playwright 驱动真实实例；它适合完整 UI 闭环，不取代语义核对 |
| Git worktree + 独立功能分支 | 继续采用 | 允许计划、Gateway、module 和验收切片隔离，保护 dirty master |

### 10.2 先做 spike，不直接纳入依赖

| 候选 | 当前证据 | 决策 |
|---|---|---|
| `fcsouza/agent-skills@foundry-vtt-module-dev` | FVTT 专用 skill，覆盖 v13+、ApplicationV2、Vite、Quench、types、libWrapper/socketlib；2026-05 首见，18 installs、repo 19 stars，安全页含 Snyk Warn | 不盲装。先审计完整 SKILL、references、templates 和 license，再提炼与本仓 v14/边界一致的部分；若采用，优先做受控的 repo-local skill |
| Quench | Foundry 内 Mocha/Chai/fast-check；官方包页当前最新仅 Verified 13 | 在隔离 v14 Lab 做兼容 spike。通过后用于少量 Foundry 内 integration tests；未通过则不成为门禁 |
| `foundry-vtt-types` | 社区常用非官方类型，151 stars；版本覆盖和缺口需要精确核对 | 不替代锁定源码/reference。只有 v14 类型与本仓 globals 模型确实减少错误时才引入 |
| Developer Mode | debug flag、Document inspection、template cache；官方包页长期未更新且 verified 版本旧 | 只在 disposable Lab 测试，不设为用户依赖，不让它进入生产 bundle |
| `Tiamanti/foundryvtt-test-framework` | 真实 Foundry + persistent Playwright + isolated data 的方向正确，但当前 0 stars、无 release | 只借鉴架构；先代码/许可证审计和 PoC，不立即依赖 |
| `foundry-mcp-bridge` | 活跃、Verified 14，真实采用 module + 独立 server、本地 WebSocket/远程连接、GM-only 和写操作开关 | 作为 transport/权限/安装体验参考，不作为 Forge 依赖，也不复制其 MCP/Claude 产品设计 |
| socketlib/libWrapper | FVTT skill 和社区指南推荐的特定问题工具 | Forge MVP 不需要 monkey patch；跨 Foundry 客户端调用只有出现真实需求才评估，避免无必要依赖 |

### 10.3 不建议直接使用

- 通用 `playwright-e2e-init` skill 偏向 Next.js/React 脚手架，可能改 CI、安装浏览器并生成错误项目结构；可读其检查思路，不直接运行初始化。
- 通用 Vite skill 只提供构建常识，不能替代 Foundry 固定路径、globals、manifest 和目标版本规则。
- 任何把 Microsoft/Azure Foundry 当作 Foundry VTT 的 skill 都是同名误命中。
- 目前没有找到一个被广泛使用、专门为“Codex 开发 Foundry VTT module”提供完整工具链的 Codex Plugin。不能为了填 Plugin 一栏而安装无关插件。
- GitHub/Figma/浏览器等通用 Plugin 只有在具体工作需要其权限时才启用；它们不是 FVTT 正确性的来源。
- Foundry MCP Bridge 是运行时产品和架构参考，不是开发测试 Plugin，也不应获得当前世界写权限来帮助开发。

### 10.4 建议建立的项目本地开发能力

外部生态没有一件工具能直接满足本项目的精确版本和语义门禁。经过 Phase B-D 的真实经验后，建议创建一个本仓 repo-local `forge-fvtt-module-dev` skill，内容只包含已验证步骤：

- 精确版本资料路由；
- browser-only import 边界；
- protocol capability 增量方法；
- module build/install/verify；
- Gateway + module 联调；
- Lab 登录、preview/apply/readback；
- Actor/Item 语义样本；
- 证据分层和停止条件。

这项工作在流程至少重复两次并稳定后再做，避免把未验证猜测固化成 skill。

## 11. 外部调研来源与采用方式

- [Foundry 官方：Introduction to Module Development](https://foundryvtt.com/article/module-development/)：manifest、模块结构、ES module、兼容和浏览器运行边界。
- [Foundry Community Wiki：Using Vite to build for Foundry](https://foundryvtt.wiki/en/development/guides/vite)：Vite proxy/hot reload 的社区实践。
- [League FoundryVTT Module Template](https://github.com/League-of-Foundry-Developers/FoundryVTT-Module-Template)：版本化 CI/CD 模板；只参考，不直接替换本仓模块结构。
- [Nimble 的 AGENTS.md](https://github.com/Nimble-Co/FoundryVTT-Nimble/blob/main/AGENTS.md) 与 [PROJECT_CONTEXT.md](https://github.com/Nimble-Co/FoundryVTT-Nimble/blob/main/docs/PROJECT_CONTEXT.md)：真实 Foundry 项目如何给 coding agents 固化 globals、Document 持久化、Vite、测试和 worktree 规则。
- [Foundry VTT Module Dev skill](https://skills.sh/fcsouza/agent-skills/foundry-vtt-module-dev)：FVTT 专用 agent skill 候选；低采用量且存在审计 warning，必须先审计后使用。
- [Quench](https://foundryvtt.com/packages/quench)：Foundry 进程内测试；当前 Verified 13，所以只列 spike。
- [Developer Mode](https://github.com/League-of-Foundry-Developers/foundryvtt-devMode)：调试开关和 Document inspection；版本陈旧风险明确。
- [Foundry VTT MCP Bridge](https://foundryvtt.com/packages/foundry-mcp-bridge) 与 [源码](https://github.com/adambdooley/foundry-vtt-mcp)：Verified 14 的 module + external server 现实案例；用于架构比较。
- [FoundryVTT test framework](https://github.com/Tiamanti/foundryvtt-test-framework)：Playwright + 隔离 Data + 真实 Foundry 的试验性实现；成熟度不足，暂不依赖。
- [foundry-vtt-types](https://github.com/League-of-Foundry-Developers/foundry-vtt-types)：非官方 TypeScript 类型候选；不能取代精确版本源码。

## 12. 决策记录与当前推荐默认值

### Decision 1 — 是否允许独立 Companion/Gateway

**推荐：允许。** 否则必须删除或重写大量依赖 Node/文件/模型/爬虫的既有能力，且会把凭据带进浏览器。

### Decision 2 — 首发版本范围

**推荐：v14 完整闭环优先。** v12/v13 保留 protocol/workflow compatibility，但不承诺同等级 UI/runtime，直到矩阵逐项通过。

### Decision 3 — Actor MVP 的来源入口

**推荐：模块内粘贴/创建来源是第一入口，已有 Markdown 导入是同阶段第二入口。** 两者都必须进入 managed source 和同一生成/验收链。

### Decision 4 — 单一 Forge module 还是多个能力 module

**推荐：一个轻量 Forge shell + 一个 Gateway，capability 插件化但不拆成多个用户可见模块。** 已有独立 Foundry modules 保持独立。只有 capability 出现不同权限、发布节奏或目标用户时再拆。

### Decision 5 — update 还是 create-only

**推荐：Actor/Item 首个切片 create-only。** update 需要来源身份、目标 identity、并发修改、差异 preview 和冲突策略，不能与首次 apply 混做。

## 13. 首三个可执行 Task

### Task B — Transport/Gateway spike 与真实 Actor request

- ADR 比较 local HTTP、WebSocket 和未来远程安全路径；
- 实现最小 Gateway health/capabilities/Actor request；
- 在 Foundry 14.364 浏览器中完成真实连接；
- 不做完整 UI，不做 apply；
- 产出 transport 决策、威胁边界和 conformance evidence。

### Task C — Forge module shell

- manifest、ApplicationV2、连接/版本/错误 UI；
- browser-safe protocol client；
- 本地 Lab build/install/enable/open/disconnect smoke；
- 无世界 Document 写入。

### Task D — Actor create-only MVP

- source create/import；
- generate + diagnostics + preview；
- GM confirm + Actor.create；
- flags/provenance + readback；
- 三个来源样本的人工语义验收。

每个 Task 使用独立 topic worktree。每个 Task 的产品设计先写清并由用户确认；实现、commit、push、merge 分别取得授权。

## 14. 完成标准追踪

| 最终目标 | 最早产生用户价值的阶段 | 最终证明 |
|---|---|---|
| 在 FVTT 内生成 Actor | Phase D | 用户可在 UI 完成 source→preview→apply→readback，真实 Actor 行为与来源相符 |
| 在 FVTT 内生成 Item | Phase E | 同等级 Item 闭环和 bounded runtime lifecycle |
| 在 FVTT 内使用 Intake | Phase F | review/needs_review 不能被绕过，accepted artifact 才能 apply |
| 批量和来源库 | Phase G | 部分失败可恢复、hash 冲突明确、无不可解释重复内容 |
| 其他非 FVTT 能力产品化 | Phase H | 每项有独立用户闭环和验收，不是简单暴露 CLI |
| 可发布且可维护 | Phase I | 安装、升级、兼容、失败恢复、support matrix 和真实使用证据 |

## 15. 明确非目标

- 不从 master 重做 Task A；
- 不在第一版承诺任意文本、任意 Actor/Item、OCR/PDF/image 或任意模型质量；
- 不在第一版支持任意生产环境、任意 Foundry/dnd5e 版本或任意模块组合；
- 不把 CLI 命令终端嵌入 Foundry；
- 不让 Foundry 模块读取任意本机路径或执行任意命令；
- 不直接写 LevelDB；
- 不自动安装外部 skill、module、MCP server 或 plugin；
- 不因为外部项目流行、stars 高或工具能运行就跳过本仓语义验收；
- 不修改既有产品设计文档来让它们事后符合本计划。

## 16. 本计划定稿前的开放项

- [ ] 用户确认 Decision 1：Companion/Gateway；
- [ ] 用户确认 Decision 2：v14-first；
- [ ] 用户确认 Decision 3：Actor 来源入口；
- [x] 已基于 package/app/module owner、support matrix 和 Task A 对当前能力路径做只读复核；
- [x] 按用户明确指定使用 `docs/plan/`，不改为既有 `docs/plans/`；
- [ ] Task B 开始前单独写产品设计和 transport ADR；
- [ ] 未经授权不 commit、push、merge 或清理本计划 worktree。

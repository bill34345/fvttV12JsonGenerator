# Forge FVTT AI Provider Connections 与 Intake 配置体验修订计划

日期：2026-08-25

## 1. 权威关系与执行边界

本计划是 `2026-08-24-forge-fvtt-intake-task-d-plan.md` 的定向增补，只修订 Forge Intake 的 AI Provider 连接、协议适配和配置界面。原 Task D Plan 的 review-required 状态机、accepted-only 世界写入、Task B/C create-only/readback adapter、source identity、review bundle 安全投影、GM/runtime 门禁、真实 Foundry E2E 和发布权限继续保持权威。

本计划覆盖并取代原 Task D Plan 中以下较窄假设：

- AI 配置只能由用户手工输入一组 OpenAI-compatible endpoint/model/API Key；
- browser AI provider 只有隐藏的 Chat Completions transport；
- Provider、协议、模型能力和 reasoning 参数不需要产品化建模。

本计划不引入 Companion、Gateway、Web server、生产、LevelDB、CLI 登录、OAuth、代理服务或新的世界写入路径。浏览器仍只直接调用用户明确选择和配置的 HTTPS Provider。

实现继续位于既有 Task D implementation WorkTree：

`I:\OpenCode\fvttV12JsonGenerator-worktrees\20260824-021316-forge-fvtt-intake-task-d`

该 WorkTree 已有 Task D 未提交 dirty baseline。执行者必须保留全部既有改动，不得 stash、覆盖、回退、提交、推送、合并或清理。新增改动必须与既有 Task D diff 一起保持未提交。

## 2. 用户结果与完成标准

GM 在 Forge Intake 选择常见 AI 厂商后，应立即得到正确的官方默认连接配置和只包含有效选项的表单：

- Provider 选择自动填入官方 HTTPS base URL、默认协议和推荐模型候选；
- 模型使用可搜索选择器，同时始终允许输入 Provider 接受的精确 model ID；
- 默认由一个模型承担提取和复核，用户可显式开启独立 review model；
- API 协议只显示当前 Provider 支持的 Chat Completions、Responses API 或 Anthropic Messages 组合；只有多种有效协议时才允许切换；
- Reasoning 控件只在当前 Provider/协议/模型能力允许时出现，不发送无效或被静默忽略的参数；
- Custom Provider 允许用户配置 HTTPS base URL、协议、认证方式、模型发现和 model ID，但不能绕过凭据隔离、安全投影或 accepted-only 门禁；
- 连接测试能区分认证、模型列表、协议、结构化输出、限流、timeout 和 browser transport/CORS 层级，不输出原始敏感响应；
- 普通用户默认只看到 Provider、API Key、模型和测试连接；endpoint、协议、reasoning、独立 review model 与 Custom 细节按能力或高级设置渐进展示；
- Monster 与 Item 共享同一连接和 transport 层，不复制第二套 Provider 规则。

机械完成要求类型、构建和 focused tests 通过；真实完成仍需要在实际 Foundry UI 中检查交互、布局、键盘/焦点、状态反馈和至少一条真实 Provider 的 Monster/Item 语义链路。机械绿色不能代替真实 Provider/Foundry 验收。

## 3. 已锁定的产品决定

### 3.1 Provider presets

第一版内置以下 Provider：

| Provider | 默认协议 | 可选协议 | 说明 |
|---|---|---|---|
| OpenAI | `openai-responses` | Responses、Chat | Auto 默认优先 Responses；Chat 保持可选 |
| Anthropic (Claude) | `anthropic-messages` | Messages | 不伪装成 OpenAI Chat |
| Google Gemini | `openai-chat` | Chat | 第一版使用官方 OpenAI-compatible 入口；Gemini native 延后 |
| DeepSeek | `openai-chat` | Chat | 不默认或静默选择 Pro；模型由官方列表/用户选择决定 |
| xAI (Grok) | `openai-responses` | Responses、Chat | 按所选模型能力限制 |
| Mistral | `openai-chat` | Chat | 使用官方 API base URL |
| OpenRouter | `openai-chat` | Chat、Responses | 能力可能随下游模型变化 |
| Alibaba Qwen | `openai-chat` | Chat、Responses | 先选区域，再填对应官方地址 |
| Moonshot/Kimi | `openai-chat` | Chat | 先选账号区域/平台 |
| Zhipu GLM | `openai-chat` | Chat | 区域和平台地址显式区分 |
| Custom Provider | 用户选择 | Chat、Responses、Messages | 所有连接字段可配置，但安全不变量不可关闭 |

Provider preset 是版本化的 browser-safe 数据，不包含 API Key、价格、账号信息或无法从官方契约验证的模型质量承诺。官方 URL 和默认候选必须集中维护，不散落在模板、Application 和 Monster/Item provider 中。

### 3.2 模型发现与默认值

- 每个 preset 定义模型发现能力、官方模型文档/控制台链接和少量 Intake 推荐候选；不把易过期的完整模型表硬编码成唯一来源。
- 用户点击“测试连接并加载模型”后才发送认证请求；不得在输入 Key 时后台静默请求。
- 模型发现成功后生成可搜索列表；失败时保留精确 model ID 手输，并显示发现失败原因。
- 模型列表不能可靠证明 structured output、reasoning、CORS 或协议支持；这些能力来自版本化 capability registry、精确模型 override 和实际 probe 的组合。
- DeepSeek 不得静默默认 `deepseek-v4-pro`。若官方列表含用户确认的 Flash 模型，可优先展示但仍由用户选择。

### 3.3 协议与结构化输出

新增三个明确 transport：

- `openai-chat`：`/chat/completions`；
- `openai-responses`：`/responses`；
- `anthropic-messages`：`/v1/messages` 或 preset 定义的 Messages path。

“API 协议”和“结构化输出模式”必须分离。Intake 内部按 Provider 能力选择 `json_schema`、`json_object`、Provider 原生 schema 或严格 prompt JSON fallback。任何 fallback 都仍须经过既有 IR validator、formal verifier 和 review gate；解析失败、空内容、截断、未知 envelope 或多 artifact 继续 fail closed。

所有 transport 返回同一最小 normalized provider result，供现有 Monster/Item Intake 消费；不得把 Provider response envelope 泄漏到 renderer、review bundle、Forge response 或世界 Document。

### 3.4 Reasoning

Reasoning 不是跨厂商同义参数。capability registry 至少表达：

- 不支持或必须隐藏；
- `reasoning_effort`/Responses reasoning effort 的允许值；
- Anthropic adaptive/budget/effort 形态；
- Provider-specific thinking 开关或模型固有 reasoning；
- Custom 明确声明的能力。

UI 默认 `auto`。只有已知支持时才显示其他值，transport 负责映射为厂商原生 request shape。未知 Custom 模型不得默认发送 reasoning 参数。

## 4. UI 与交互

### 4.1 默认连接卡片

替换当前平铺的 endpoint/model/reviewModel/API Key fieldset，建立一个有层级的连接卡片：

1. Provider 选择器：名称清楚，Provider 改变后重置不兼容的协议/模型能力。
2. API Key：password input、显示/隐藏、清除、官方获取 Key 链接；默认仅当前内存。
3. 模型 combobox：推荐候选、动态发现结果、刷新和精确手输共存。
4. “测试连接并加载模型”主操作和可访问的 live status。
5. 连接摘要：Provider、协议、模型、Key 已设置/未设置和最后测试结果，不显示 Key 或完整敏感 endpoint。

### 4.2 渐进高级设置

高级区域只在需要时展开：

- 使用独立复核模型；
- 协议切换（仅多协议 Provider）；
- Reasoning（仅支持时）；
- endpoint override（preset 默认只读展示）；
- Custom 的认证方式、模型路径和 endpoint path；
- timeout 保持产品安全上限，不提供无限等待。

Preset endpoint 被覆盖后，连接身份标记为 `customized`，不能继续显示为未经修改的官方默认。

### 4.3 状态与操作层级

- 未测试、测试中、已连接、认证失败、模型不可用、限流、timeout、invalid response、browser transport/CORS 使用独立、安全的状态文案。
- 不显示或回显 Provider raw body、Authorization、Key、Cookie、内部路径或完整 endpoint secret。
- Intake 的 Analyze/Repair/Generate/Regenerate/Reject/Cancel/Clear/Export/Create 继续遵守原状态机，但视觉上区分当前主操作、次操作和危险/清理操作；不让九个同权按钮长期挤在一行。
- AI 配置改变立即取消提交前请求并使旧 snapshot/review/preview stale；plaintext 模式隐藏并忽略连接设置。
- 表单必须有明确 label/description、键盘操作、可见 focus、`aria-live` 状态、合理 reflow；移除依赖固定 `min-width: 44rem` 的布局假设。

## 5. 凭据与连接身份

- API Key 默认只存在 Application/活动连接的内存状态；只有用户明确勾选后才进入当前浏览器 client-only setting。
- 持久化按连接档案隔离，并提供单个连接清除和“清除全部已保存 Key”；不得伪称浏览器存储已加密。
- DOM、通知、console、diagnostic、tests snapshot、review bundle、Forge response、flags、Actor/Item/Chat 和导出不得包含 Key、Authorization 或 Provider raw payload。
- HTTPS、无 URL credentials、禁止跨站 redirect 继续为强制规则。Custom Provider 不得以“自由配置”为由关闭这些规则。本机 HTTP、arbitrary headers、Cookie auth、客户端脚本和代理代码不进入本计划。
- auth scheme 仅允许 adapter 支持的安全枚举，例如 Bearer、`x-api-key`、`api-key` 或 none；自定义 secret header 若未来需要必须另行安全计划。
- snapshot/attempt identity 加入 provider preset id、region、normalized base URL identity、protocol、extraction/review model、reasoning 和 structured-output identity；API Key 永不进入 identity。

## 6. 代码架构与所有权

### `packages/intake-ai`

- 提取 transport-neutral request/result 和最小 transport interface；
- 新增/整理 OpenAI Chat、OpenAI Responses、Anthropic Messages adapters；
- Monster 与 Item provider 共用 transport、错误分类、timeout/cancel、response extraction 和安全 audit；
- 保持现有 Node/CLI/Web API、输出、prompt version、resume/promotion 行为兼容；当前 OpenAI Chat 路径作为兼容 facade。

### `packages/forge-browser-runtime`

- 新增 browser-safe Provider preset/capability registry、连接解析、模型发现和 probe 核心；
- 不导入 Node/Bun/filesystem/apps；
- 将 provider connection 转换为 `intake-ai` transport 配置；Monster 与 Item 共享；
- 保持 plaintext 路径不触发任何模型请求。

### `foundry-modules/fvtt-json-forge`

- 扩展 client settings schema 并迁移当前 endpoint/model/reviewModel/key 设置，不能丢弃用户已有 client-only 配置；
- 重构 Intake Application 表单状态、stale snapshot 和 active-job behavior；
- 更新 Handlebars/CSS 为 Provider-first、渐进高级设置和响应式布局；
- 不改变 Actor/Item world adapters、Forge Protocol v1 或世界 flags。

## 7. 实现顺序与 GitNexus

1. 记录当前 WorkTree status/diff 和新增计划文件，确认只在该 WorkTree 写入。
2. 修改任何既有函数、类或方法前执行 GitNexus upstream impact；报告直接调用者、流程、风险。HIGH/CRITICAL 本身不停止，但真实安全、兼容、授权或计划边界问题必须停止。
3. 先新增 provider/protocol/capability 类型和 registry tests。
4. 抽象现有 Chat transport，保持当前 Monster/Item 行为和调用次数回归。
5. 新增 Responses 与 Anthropic Messages adapters 及严格 fixtures；不得复制 IR/parser/generator/verifier。
6. 新增连接解析、模型发现、probe、reasoning/structured-output 映射和错误分类 tests。
7. 迁移 Foundry settings，并完成 Provider-first template/Application/CSS。
8. 补齐 stale race、secret scan、accessibility/state tests 和现有 Task D 回归。
9. 运行 focused tests、typecheck、module build、diff check，并整理未提交证据后停止。

## 8. 自动测试与机械门禁

至少覆盖：

- 每个 preset 的官方默认 URL identity、region、协议 allowlist、auth scheme、官方链接和不含 secret；
- Provider 改变时协议/model/reasoning 的兼容重置；
- `/models` 成功、无列表、401/403、429、timeout、invalid envelope 和 browser transport；
- 可搜索模型选择、手输 model ID、同模型 review 默认和独立 review model；
- OpenAI Chat/Responses、Anthropic Messages request shape 和 normalized output；
- JSON Schema、JSON Object、Provider schema、prompt fallback 和空/截断/非法内容 fail closed；
- reasoning 只对受支持组合发送，Custom unknown 不发送；
- 旧 client settings 到新连接档案的无损迁移；
- Key 内存默认、显式保存、单个/全部清除、bundle/log/diagnostic/snapshot secret scan；
- endpoint/protocol/model/reasoning/region 改变触发 stale，Key 改变不进入 snapshot hash；
- plaintext 零 AI 请求，Monster/Item 共用活动 job gate；
- 既有 Task D、Task B Actor、Task C Item、CLI/Web provider tests 不回归；
- browser bundle forbidden-import scan、模板/build 文件清单和响应式/可访问状态结构。

执行适用命令，优先 focused 再扩大：

```text
bun test <provider/transport/connection/Forge Intake focused tests> --max-concurrency 4
bun run typecheck:packages
bun run typecheck:foundry-modules
bun run architecture:verify
bun run test:fvtt-json-forge
bun run build:fvtt-json-forge
git diff --check
```

如果 focused 绿色且时间允许，再运行受影响的完整 `bun run test`/`bun run ci:verify`；继承基线失败单列，不改无关范围掩盖。

## 9. 实现线程停止点

本计划的 Luna Max 实现线程只负责代码和机械自验。完成后必须停止并返回：

- 相对当前 WorkTree baseline 的完整 changed-path 列表和 diff stat；
- provider/protocol/capability 设计摘要；
- GitNexus impact 的直接调用者、流程和风险；
- 执行过的 tests/typecheck/build 与结果；
- 未执行的真实 Provider、Foundry UI、可访问性、E2E 和安全验收；
- 已知风险、未解决失败和最小后续工作。

线程不得启动 Foundry、浏览器、Lab、真实 Provider 请求或 E2E；不得读取、输出或保存用户 API Key；不得创建 Goal、子线程、commit、push、merge、stash、备份或清理 WorkTree/分支。

## 10. 后续独立验收

实现线程结束后，父任务仍不能宣称完成。后续需要用户另行启动：

1. 父 Sol 检查完整未提交 diff、状态迁移、安全不变量和 UI 文案；
2. 一次独立 Sol 只读 Code Review，清除 P1；
3. 实际 Foundry 视觉/交互/键盘审计；
4. 真实 DeepSeek Chat 的 Monster 与 Item Intake，使用用户选择的非 Pro/Flash 模型；
5. 在有独立凭据时分别验证 OpenAI Responses 和 Anthropic Messages；没有真实凭据的 preset 只能报告机械契约通过，不能冒充真实 Provider PASS；
6. accepted-only 世界 create/readback、非 accepted 零写入、review bundle secret scan 和精确清理；
7. 最终全部门禁通过后才讨论 commit、合并、push 或 WorkTree 清理。

## 11. 停止条件

发生以下任一情况立即停止，不扩大范围解决：

- 需要 Companion、Gateway、服务端秘密存储、生产、LevelDB、本机 HTTP 或任意脚本/headers 才能实现；
- 必须改变 Forge Protocol v1、Actor/Item world adapters、source/hash/artifact identity 或 accepted-only 门禁；
- 必须复制 Monster/Item parser、IR、validator、renderer、generator 或 verifier；
- 旧 Node/CLI/Web provider 行为无法保持兼容；
- Provider raw response、Key、Authorization、Cookie 或完整敏感 endpoint 必须进入 snapshot、bundle、日志、diagnostic 或世界数据；
- UI 只能通过允许无效 Provider/协议/模型组合或手工 override accepted 状态才能工作；
- 当前 dirty baseline 无法与本计划改动可靠区分，或发现其他参与者正在修改同一文件。

未经用户后续明确授权，不 commit、不合入 `codex/forge-fvtt-product`、不 push、不启动真实 E2E、不清理 implementation WorkTree。

# Task B：在 Foundry 中生成、确认创建并核对 Actor

## 目标

Task B 把一个 Actor 的完整路径放进 Foundry：GM 输入中文/英文规范文本，或者明确选择把普通文本发送给外部模型；系统生成并严格验证 Actor，显示预览；只有 accepted 结果可以由 GM 确认创建；创建后必须从世界重新读取并核对来源相关语义。

目标固定为 Foundry `14.364`、dnd5e `5.3.3`、`core`、`iconMode: off`。

旧产品 Plan 不修改。架构差异以同目录的 `2026-08-22-forge-fvtt-browser-architecture-revision.md` 为依据。

## 工作基线

1. 从 Task A 接受提交 `3d16388089f1e486a5cffa67442d76ae043bd754` 创建 `codex/forge-fvtt-product` 及其 sibling WorkTree。
2. 原产品 Plan 必须原字节复制到产品分支；复制前后 SHA-256 必须一致。
3. 产品基线另存架构修订和本 Task B Plan，并做一个本地文档提交；未获新的发布授权前不 push、不合入真实 `master`。
4. 从产品基线提交创建 `codex/<timestamp>-forge-fvtt-actor-task-b` 和新的 sibling WorkTree。
5. 保留 master 的 `AGENTS.md`、`.claude/` 及其他 WorkTree 的无关改动；不自动 stash、覆盖、删除或提交它们。
6. 只在 Task B WorkTree 修改代码。旧 Plan WorkTree 和 Task A WorkTree 只有在内容已核对、提交可达且确认冗余后才可清理；不使用强制删除，不删除历史分支。

## 实现

### Browser runtime

新增 `packages/forge-browser-runtime`，提供：

```ts
convertFinalActorSource(request: ForgeActorRequest): Promise<ForgeActorResponse>
convertRawActorSourceWithAi(input, provider, signal): Promise<BrowserActorIntakeResult>
```

实现要求：

- 只调用 parser、generation、verification 的公开出口；
- 不读取文件、不写 artifact、不依赖 Node/Bun/Windows/Sharp/Crawlee/SSH；
- 用 browser-safe hash 和显式注入的只读资源替代 Node crypto、工作目录、模板文件和法术 catalog 读取；
- 与 CLI/Web 共用同一套业务规则；
- 对同一最终来源，浏览器和 Node workflow 的 artifact hash、verification 和安全摘要必须一致；
- Task A protocol 类型和 decoder 保持 v1，不破坏现有 import，不删除 health/capabilities 类型。

### 来源路径

规范文本：验证或附加合法 `forge-source-id`，然后让同一份最终内容进入 source hash、parser、generation 和 verifier。

普通文本：只有用户明确选择 AI 模式才调用模型；复用当前 Monster Intake 的 discover、extract、evidence、确定性检查、repair、review、renderer 和状态门禁；最终 Markdown 附加 Forge ID 后进入同一 Actor workflow。一次只接受一个 Actor，多个候选必须停止并提示拆分来源。

### AI 连接

第一版支持 OpenAI-compatible HTTPS endpoint、提取模型、复核模型和 API Key。API Key 保存到 browser client-only 设置，默认掩码，可清除，并明确警告同页其他模块可能读取。不得写入世界、Actor、Chat、日志、诊断、Forge request 或导出。

必须区分 CORS、401/403、429、timeout、network 和 invalid JSON。AI 模式显示 discover、extract、validate、repair、generate、review、finalize 阶段；只允许一个活动任务；使用 `AbortController` 取消未完成的模型请求。刷新页面会中止当前任务，第一版不做断点恢复。

Codex OAuth Companion 只保留可替换 provider 接口，本 Task 不实现。

### Foundry module

新增 `foundry-modules/fvtt-json-forge`，module id 为 `fvtt-json-forge`，使用 Foundry 14 `ApplicationV2`/`HandlebarsApplicationMixin`，通过 GM-only 模块菜单打开“Forge Actor”。

窗口至少提供：

- 规范 Actor 文本（不调用 AI）；
- 普通文本（明确发送给模型）；
- 来源输入、模型设置、生成、取消、清除；
- 阶段进度和诊断；
- name/type/HP/AC/CR/senses/abilities/embedded Items 预览；
- 候选 JSON 展开查看；
- 确认创建 Actor。

创建按钮只有在 response 和 verification 都是 `accepted`、artifact/hash 存在、没有 warning/error、版本正确且当前用户仍为 GM 时启用。

### 创建和 readback

使用 Foundry 公开 Document API，不直接改 LevelDB：

1. 创建本次操作专用临时 Actor。
2. 调用公开 `importFromJSON()` 导入已验证 artifact。
3. 写入 `flags.fvtt-json-forge`：protocolVersion、requestId、sourceId、sourceHash、适用时的 rawSourceHash、artifactHash。
4. 调用 `toObject()` 重新投影。
5. 核对 name、type、hp、ac、cr、senses、Activities、damage/save/uses、effects/linkage 和 Forge identity。
6. 一致后返回 Actor UUID；任何失败只删除本次临时 Actor。

重复规则：同一 `sourceId + artifactHash` 返回既有 Actor；同一 sourceId 不同 artifactHash 报冲突；Task B 不覆盖、不更新、不删除既有 Actor。

## 测试和验收

自动测试覆盖：

- 中文 YAML、英文 Markdown、Forge ID 合法/非法/重复；
- 空内容、UTF-8 200000/200001 bytes；
- browser 与 Node artifact hash/verification 相同；
- 普通非 Forge CLI/Web 输出不变；
- bundle 不含 Node、Bun、filesystem、Sharp、Crawlee、SSH、`process.env`；
- AI 显式触发、fake provider 的四阶段、重试、取消、超时、429、401、CORS、network 和非法 JSON；
- API Key 保存/清除/日志脱敏；
- 非 GM、错误版本、needs_review、failed 不可创建；
- 确认前无世界写入；重复点击不重复创建；hash 冲突阻断；import/flag/readback 失败回滚临时 Actor。

机械门禁：

```text
bun run typecheck:packages
bun run typecheck:foundry-modules
bun run architecture:verify
bun run agents:generate
bun run agents:check
bun run test
bun run ci:verify
git diff --check
```

另行执行 Forge Protocol/parser/generation/AI/browser/module 专项测试、browser bundle forbidden-import scan、GitNexus impact 和提交前 `gitnexus_detect_changes()`。

真实本地 Foundry 验收：

- 中文 Nightgaunt 和一个 tracked English bestiary 来源各走一次生成、预览、确认创建和 readback；
- 人工核对 name/type/HP/AC/CR/senses、embedded Item、Activities、damage/save/uses/effects/linkage；
- 打开 Actor sheet 执行一个代表性 Activity；
- 使用用户明确授权的真实外部模型完成一次普通文本 Intake，核对 evidence、最终 Markdown、Actor 和 readback；
- 错误 API Key、CORS、取消和 needs_review 不留下 Actor；
- 检查 API Key 不在世界数据、日志、诊断和导出中；
- 只使用本地 Lab，不碰生产。

没有用户授权的真实模型凭据时，可以报告 fake-provider 和机械门禁通过，但不能声称真实 AI 直连已验收。

## 范围边界

本 Task 不做 Item/Species 创建、Codex OAuth Companion、强制 Gateway、WebSocket、GoddessFantasy 抓取、Collection/ZIP、Vault Sync、翻译同步、PDF/OCR、Sharp/SSH 图片、批量多 Actor、既有 Actor 更新、生产部署或旧产品 Plan 修改。

遇到浏览器/Node hash 不一致、必须复制业务规则、普通 CLI/Web 输出变化、readback 语义漂移、API Key 泄露、需要新增服务端权限或 GitNexus HIGH/CRITICAL 影响时停止并报告。

最终 diff 必须经过一次只读 Code Review；P1 全部修复后才能讨论保存 Task B。Task B 代码的 commit、push、合回 Forge 产品分支仍需用户分别授权，真实 `master` 保持不动。

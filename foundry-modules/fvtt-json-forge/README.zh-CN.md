# FVTT JSON Forge 0.1.0

FVTT JSON Forge 是 Foundry VTT 内的 GM-only Actor / Item 生成与证据审阅模块。0.1.0 把 Forge A–E 作为一个产品交付，精确锁定 Foundry `14.364`、dnd5e `5.3.3` 和 `core` profile；其他版本会 fail closed。

> English summary: FVTT JSON Forge is a GM-only, exact-target browser module for reviewed Actor/Item generation, safe recovery, client-local source management, mixed collections, and an accepted-only recoverable batch queue. Version 0.1.0 supports exactly Foundry 14.364 and dnd5e 5.3.3. It is not a generic JSON importer or a background server.

## 安装

### Foundry Setup 安装

在 Foundry 的 Setup 页面打开 **Add-on Modules → Install Module**，把下面的 manifest URL 粘贴到 **Manifest URL**：

```text
https://raw.githubusercontent.com/bill34345/fvttV12JsonGenerator/master/foundry-modules/fvtt-json-forge/src/module.json
```

安装后进入目标世界的 **Manage Modules**，启用 **FVTT JSON Forge**，再刷新世界。

### ZIP 手工安装

从 GitHub Release `fvtt-json-forge-v0.1.0` 下载 `fvtt-json-forge-0.1.0.zip` 和 `SHA256SUMS.txt`，先核对 SHA-256。停止 Foundry 后，把 ZIP 解压为：

```text
<Foundry Data>/Data/modules/fvtt-json-forge/module.json
<Foundry Data>/Data/modules/fvtt-json-forge/scripts/index.js
...
```

ZIP 内是 module 根内容，不能再多套一层版本目录。不要覆盖身份不明的同名目录；升级前先确认旧目录确实是本模块。此仓库的运维规则不创建备份，失败时停止并核对目标。

## 三个入口

只有 GM 能在 **Configure Settings → Module Settings → FVTT JSON Forge** 看到入口：

- **Forge Actor**：把结构化 Actor Markdown 转为当前目标的完整 Actor，预览后执行 create-only、readback 和 deterministic reuse。
- **Forge Item**：对单一、受支持的 world Item 做同样的 preview、create-only、readback 和 reuse；不会隐式创建或修改 Actor。
- **Forge Intake**：处理 `plaintext-actor`、`ai-monster` 和 `ai-item`。Analyze 只建立来源证据与审阅状态；Generate Candidate 后仍须 formal verification 与 review 同时 `accepted`，Confirm Create 才可用。

`needs_review`、`failed`、`rejected`、多 candidate、多 artifact、过期 snapshot、权限或版本变化都保持零世界写入。模块没有“忽略并继续”按钮，也不会把 review bundle 当成可创建 response。

## Provider 与凭据

AI 模式必须先选择 Provider、协议和精确 model ID，并完成当前连接/结构化输出测试。界面提供 OpenAI、Anthropic、Gemini、DeepSeek、xAI、Mistral、OpenRouter、Qwen、Kimi、GLM 与 Custom presets；preset 只代表连接配置，不代表每个 provider/model 都有同等语义验收。

当前真实 Provider 验收是有边界的 DeepSeek `deepseek-v4-flash` AI Monster 路径。其他组合必须自行验证，任何证据或 review 漂移都会停在 `needs_review` / `failed`。

API Key 默认只存在当前页面内存。只有显式勾选持久化时才会写入当前浏览器的 local storage；它不会进入世界 Document、Chat、review bundle、Collection/ZIP、日志或 Forge response。浏览器存储不是加密保险箱；推荐保持持久化关闭，并在结束后使用清除 Key 操作。

## Review、Library 与恢复

- **Review Bundle**：导入后只显示严格解码的历史记录。历史 `accepted` 仍不可直接创建；“以当前来源开启新 attempt”会生成新的 identity、snapshot、calls 和 review。
- **Managed Source Library**：来源与安全 review 保存在当前浏览器、当前 `worldId:userId` scope 的 IndexedDB。它不写世界 settings/flags，不自动 Analyze，也不保存完整 artifact/response。
- **Portable export/import**：Library、Collection、标准 ZIP 和 Queue 都有 strict decoder、identity/hash/size/path/CRC 门禁；导出不含 Key、完整 endpoint、provider raw payload 或世界数据。

## Collection 与 Batch Queue

Forge Intake 可以导入 mixed Actor/Item Collection JSON 或标准 ZIP。每项拥有独立 source、kind/mode、identity、attempt、status 和 review；输入顺序保留，单项失败不会让其他项升级为 accepted。

Runner 固定 concurrency `1`，只有 GM 显式点击才运行。刷新或关闭页面时，`running` / `applying` 项变为 `interrupted`，不会自动重发可能计费的 Provider 请求。跨会话恢复的历史 accepted review 不含完整 response，必须显式 fresh run 后才能重新进入 apply manifest。

批量 Apply 只接受当前页面仍持有完整 accepted response 的项目。确认框会列出 immutable manifest、Document ID、source/artifact hash 和 target；Actor 与 Item 继续走各自 adapter。多 Document 操作不是原子事务，部分成功/失败会逐项报告，不会伪装为全成功或回滚已完成的其他 Document。

## 明确限制

- 只支持 Foundry `14.364` / dnd5e `5.3.3` / `core`；不是 v12/v13 模块。
- 只允许 GM；不是玩家 JSON 导入工具。
- 不是任意文本、任意模型、任意 Actor/Item 都能 accepted 的保证。
- 不支持 OCR/PDF/图片 Intake、update/overwrite、按名称合并、embedded Item 产品入口或跨 Document 原子事务。
- 页面关闭后不会继续 AI/HTTP。真正后台执行需要另行设计 Companion/Gateway、认证与 Key custody。
- 本地 Lab PASS 不代表生产、任意模块组合或四小时真实桌面会话 PASS。

当前分层证据见 [support matrix](../../docs/acceptance/current-support-matrix.md)，A–E 实施与边界见 [产品计划](../../docs/plan/2026-08-21-forge-fvtt-module-product-execution-plan.md)、[Task D](../../docs/plan/2026-08-24-forge-fvtt-intake-task-d-plan.md) 与 [Task E](../../docs/plan/2026-08-30-forge-fvtt-task-e-plan.md)。

## 维护者构建

```powershell
bun install --frozen-lockfile
bun run test:fvtt-json-forge
bun run release:fvtt-json-forge
bun run verify-release:fvtt-json-forge
```

发行输出位于 `foundry-modules/fvtt-json-forge/dist/release/`：

- `fvtt-json-forge-0.1.0.zip`
- `fvtt-json-forge-module.json`
- `SHA256SUMS.txt`

构建器固定 ZIP 排序与时间戳；两次 fresh build 必须产生相同 ZIP SHA-256，并验证 archive、独立 manifest、package version 和下载 URL 一致。

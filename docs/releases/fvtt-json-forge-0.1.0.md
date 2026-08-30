# FVTT JSON Forge 0.1.0

首个正式发行版把 Forge A–E 作为一个完整的 Foundry 模块交付，而不是一组独立实验入口。

## 主要能力

- GM-only Actor 与 bounded world Item create-only / readback / deterministic reuse。
- Plaintext Actor、AI Monster、AI Item 的 evidence-first Analyze、正式 generation/verification 和 accepted-only Confirm Create。
- strict review bundle 导入、只读历史与 fresh-attempt lineage。
- 当前浏览器/世界/GM scope 的 Managed Source Library。
- mixed Actor/Item Collection JSON、标准 ZIP、portable queue。
- concurrency-1 runner、跨页面 `interrupted` 恢复、逐项 cancel/requeue、immutable apply manifest 和部分失败报告。

## 兼容范围

- Foundry `14.364`
- dnd5e `5.3.3`
- `core` profile
- GM only

模块会在错误 runtime 或权限下 fail closed。Provider preset 不等于任意模型语义保证；当前真实 Provider accepted 证据只覆盖计划中记录的 bounded DeepSeek `deepseek-v4-flash` Monster 路径。

## 安全与数据

只有 decoded、current、formal verification 与 review 全部 `accepted` 的完整 response 可以进入 type-specific world adapter。API Key 不进入世界、日志、review/collection/queue 导出或 release artifact。Source Library 与 Queue 使用 browser-local IndexedDB，不是加密隔离。页面关闭后不会继续 AI/HTTP，也不会自动重发请求。

## 不包含

生产部署、任意 Foundry/dnd5e 版本、AI Item 完整 live lifecycle、任意 provider/model/source 正确性、OCR/PDF、update/overwrite、跨 Document 原子事务，以及页面关闭后仍运行的 Companion/Gateway owner。

## 发布验证说明

本版本的模块级测试、完整普通测试和本地 Foundry 安装 smoke 已通过；完整普通测试为 `2325 pass / 0 fail`。发布者明确接受以下仓库级工程门禁债务，仅作为本次 `0.1.0` 的 waiver，不把它们记为绿色：aggregate `ci:verify` 未完整通过；Knip cycles 在持续高 CPU 20 分钟后仍未结束；coverage 主组虽为 `2311 pass / 0 fail`，但 production lines/functions 为 `78.27%` / `75.65%`，低于 `84%` / `85%` 门槛；独立串行 `test:cli` 入口存在尚未完成根因验收的高 CPU 问题。

English summary: This first formal release unifies Forge A–E into one GM-only, exact-target Foundry module with reviewed Actor/Item creation, strict recovery, client-local source management, mixed collections, and a recoverable accepted-only batch queue. It supports exactly Foundry 14.364 and dnd5e 5.3.3; production and page-closed background execution are not claimed.

# Babele RollTable Embed Translation

## 用途

这个独立 Foundry 模块只修复 Babele 已经翻译的 Compendium RollTable 在 Foundry v14 `@Embed` 渲染时仍显示英文结果的问题。它不修改 Babele、Foundry、dnd5e 原型，也不写入世界文档。

## 目标与边界

- 锁定 Foundry `14.364`、dnd5e `5.3.3`、Babele `2.9.1` 和 libWrapper `1.13.5.1` 的本地 Server Mirror 验证。
- 只包装 `RollTable.prototype._buildEmbedHTML`；翻译失败时保留原生输出。
- TableResult 按 `_id` 优先、`range` 回退匹配；文档型结果必须保留 `documentUuid` 和 content-link 语义。
- 渲染只使用临时数据和 DOM，不调用 `update`、`updateSource`、`updateEmbeddedDocuments` 或 `game.settings.set`。
- 本地安装只允许指向配置的 `F:\FoundryLab\foundry-v14\data\server-mirror`，替换已有同 ID 模块必须先备份并验证归属。

## 验证

- `bun run test:fvtt-babele-rolltable-embed-translation`
- `bun run build:fvtt-babele-rolltable-embed-translation`
- `bun run typecheck:foundry-modules`
- `bun run install:local`（仅在明确授权的本地 Lab 上）
- `bun run verify-install`

机械检查通过后，仍需在 Server Mirror 的实际 Foundry UI 中验收 Wild Magic Surge 的 25 行、Confusion Behavior 的 5 个结果，以及文档型结果的中文 anchor 和原 UUID。

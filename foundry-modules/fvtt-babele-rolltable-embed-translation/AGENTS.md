# Babele RollTable Embed Translation

## 用途

这个独立 Foundry 模块只修复 Babele 已经翻译的 Compendium RollTable 在 Foundry v14 `@Embed` 渲染时仍显示英文结果的问题。它不修改 Babele、Foundry、dnd5e 原型，也不写入世界文档。

## 目标与边界

- 当前 `0.2.1` 候选的 manifest 兼容范围为 Foundry `14.368`、dnd5e `6.0.2–6.0.5`（`verified` 保持 `6.0.2`）、Babele `2.9.1` 和 libWrapper `1.13.5.1`；6.0.2 上已有的 UI 证据不替代 6.0.5 读回。原 `0.1.0` 的 Server Mirror 通过证据只作历史对照。
- 只包装 `RollTable.prototype._buildEmbedHTML`；翻译失败时保留原生输出。
- TableResult 按 `_id` 优先、`range` 回退匹配；文档型结果必须保留 `documentUuid` 和 content-link 语义。
- 渲染只使用临时数据和 DOM，不调用 `update`、`updateSource`、`updateEmbeddedDocuments` 或 `game.settings.set`。
- 当前 Next 候选只从本工作树构建并更新精确 `F:\FoundryLab\foundry-v14\data\server-next\Data\modules` 目标；先正常关闭世界、核精确服务身份和世界锁，再核任务已安装旧文件及构建文件的清单与 SHA-256。旧 `install:local` 入口只服务原 Mirror 版本，当前新源码会提前拒绝，不运行它；不创建备份、不直接编辑世界数据库。

## 验证

- `bun run test:fvtt-babele-rolltable-embed-translation`
- `bun run build:fvtt-babele-rolltable-embed-translation`
- `bun run typecheck:foundry-modules`
- Next 安装完成后逐文件对照 `dist/module` 与精确目标，使用正常客户端核版本、开关、重载及启动错误；不运行旧 Mirror 的 `install:local` / `verify-install`。

机械检查通过后，仍需在 ServerNext 的实际 Foundry UI 中验收 Wild Magic Surge 的 25 行、Confusion Behavior 的 5 个结果、文档型结果的中文 anchor 和原 UUID，以及重复渲染不写源资料。

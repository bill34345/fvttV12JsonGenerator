# 自制种族内容模块

这是 Foundry `14.364` / dnd5e `5.3.3` / Core 的纯内容模块。它只提供两个 Item Compendium：`species` 和 `features`；没有浏览器 JavaScript、socket、自动迁移或世界扫描。

`bun run build:homebrew-species` 只读取 Species accepted ledger 和当前规范 Markdown，并重新走 parser、v14 projector 与 validator。Markdown 被人工编辑后，其 SHA-256 会 stale；重新执行 `--intake-species <species.md> --fvtt-version 14 --effect-profile core` 并通过 AI review 前，构建会拒绝继续。

散装 JSON 是与本模块绑定的审阅/构建输入，ItemGrant UUID 指向本模块的 `features` pack，不承诺脱离模块独立导入。

当前自动化边界：种族基础字段、allowlist 内的每级生命值/AC永久 Effect，以及明确次数和恢复的 Utility 可原生投影；复杂武器、推击、建筑物、移动和规则判定保持 `gm-assisted` 或 `external-rule`。

# 自制种族内容模块

这是同一 module ID、pack 名和文档 ID 下的纯内容 Species 模块。V14 产物精确绑定 Foundry `14.364` / dnd5e `5.3.3` / Core；V12 候选产物精确绑定 Foundry `12.331` / dnd5e `4.3.9` / Core / 2024，并明确标记 `supportStatus: "static-candidate"`。两者都只提供 `species` 和 `features` 两个 Item Compendium，没有浏览器 JavaScript、socket、自动迁移或世界扫描。

`bun run build:homebrew-species` 保持现有 V14 默认。`bun run build:homebrew-species:v12-candidate` 与 `bun run verify:homebrew-species:v12-candidate` 使用 ledger 中独立的 V12/core/2024 条目并输出 `dist/v12-candidate/`。build 会重新走 parser、目标 projector 与 validator；Markdown、package 或目标 hash 任一 stale 都会拒绝继续。V12 candidate build/verify 不调用安装器，也不证明 Add Species、升级、HP/AC、次数、Long Rest 或重开读回。

accepted ledger schema v2 以 `(identifier, fvttVersion, effectProfile, rules)` 为身份。旧 schema v1 只按 V14/core/2024 读取，单纯 build 不改写；下一次成功 promotion 才原子升级。V14 package 保持 `output/species/<identifier>.json`，V12 package 使用 `output/species/v12/<identifier>.json`。

散装 JSON 是与本模块绑定的审阅/构建输入，ItemGrant UUID 指向本模块的 `features` pack，不承诺脱离模块独立导入。已经授予 Actor 的嵌入 Feature 是快照，本轮没有迁移器。

当前自动化边界：种族基础字段、allowlist 内的每级生命值/AC永久 Effect，以及明确次数和恢复的 Utility 可原生投影；复杂武器、推击、建筑物、移动和规则判定保持 `gm-assisted` 或 `external-rule`。

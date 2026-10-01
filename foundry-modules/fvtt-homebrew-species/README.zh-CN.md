# 自制种族内容模块

这是同一 module ID、pack 名和文档 ID 下的纯内容 Species 模块。既有 V14 产物精确绑定 Foundry `14.364` / dnd5e `5.3.3` / Core；V12 候选产物精确绑定 Foundry `12.331` / dnd5e `4.3.9` / Core / 2024；ServerNext 内容身份保留 Foundry `14.368` / dnd5e `6.0.2` / Core / 2024。Next manifest 可用显式 `--dnd5e-runtime-maximum 6.0.5` 扩大运行时兼容上限；其 `minimum/verified` 与 accepted package identity 仍为 `6.0.2`，不会新增或改写 `6.0.5` 来源接受记录。两个候选都标记 `supportStatus: "static-candidate"`。所有目标都只提供 `species` 和 `features` 两个 Item Compendium，没有浏览器 JavaScript、socket、自动迁移或世界扫描。

`bun run build:homebrew-species` 保持现有 V14 默认。`bun run build:homebrew-species:v12-candidate` 与 `bun run verify:homebrew-species:v12-candidate` 使用 ledger 中独立的 V12/core/2024 条目并输出 `dist/v12-candidate/`。Next 内容候选仍使用已接受的 `14.368/core/2024` ledger 项和 `dist/v14-368-candidate/`。默认 Next manifest 最大版本仍为 6.0.2；需要为本次 ServerNext 6.0.5 兼容候选生成对应 manifest 时，使用本包入口 `build:v14-368-605-candidate` 与 `verify:v14-368-605-candidate`（等价参数为 `--fvtt-version 14.368 --dnd5e-runtime-maximum 6.0.5`）。这个参数只改变 manifest 的运行时兼容最大值和说明，不改变 6.0.2 内容身份、来源 Markdown、accepted ledger 或逻辑 hash。若运行构建，LevelDB 会重新物理生成；本次服务器安装必须保留现有已安装 pack 文件，仅更新经过验证的 manifest。已有 6.0.2 的代表性游戏内验收见 [ServerNext 候选记录](docs/server-next-candidate.md)；6.0.5 的启用与 pack 读回应单独记录。静态结果不代替后续种族功能或升级验收。

accepted ledger schema v2 以 `(identifier, fvttVersion, effectProfile, rules)` 为身份。旧 schema v1 只按 V14/core/2024 读取，单纯 build 不改写；下一次成功 promotion 才原子升级。旧 V14 package 保持 `output/species/<identifier>.json`，V12 package 使用 `output/species/v12/<identifier>.json`，ServerNext package 使用 `output/species/v14-368/<identifier>.json`。新目标的 logical hash 与旧目标不同，旧接受记录不可跨目标复用。

散装 JSON 是与本模块绑定的审阅/构建输入，ItemGrant UUID 指向本模块的 `features` pack，不承诺脱离模块独立导入。已经授予 Actor 的嵌入 Feature 是快照，本轮没有迁移器。

当前自动化边界：种族基础字段、allowlist 内的每级生命值/AC永久 Effect，以及明确次数和恢复的 Utility 可原生投影；复杂武器、推击、建筑物、移动和规则判定保持 `gm-assisted` 或 `external-rule`。

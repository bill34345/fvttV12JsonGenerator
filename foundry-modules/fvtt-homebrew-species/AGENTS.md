# fvtt-homebrew-species

## 范围

- 本目录是同一 module/pack/document identity 下的纯内容 Species 模块发布单元：既有 V14 精确绑定 Foundry `14.364` / dnd5e `5.3.3` / Core；V12 candidate 精确绑定 Foundry `12.331` / dnd5e `4.3.9` / Core / 2024；ServerNext 内容身份保留 `14.368` / dnd5e `6.0.2` / Core / 2024，单独的 manifest runtime maximum 可明确设为 `6.0.5`，不改写目标身份或 accepted ledger。
- build 只消费 target-aware accepted ledger、当前 Species Markdown 和 `@fvtt-json-generator/generation/species` 公共接口；不得把 Intake/provider/compiler带入浏览器运行时。

## 构建与安全

- 模块只有 `species` 与 `features` 两个 Item Compendium，不含 runtime JavaScript、socket、自动迁移或世界扫描。
- ledger、Markdown SHA-256、来源 SHA-256、logical hash 任一 stale/缺失/不一致时 fail-closed。
- LevelDB 只在随机临时根写入；V14 普通运行从 `FVTT_OPS_LAB_ROOT/app/14.364` 只读加载 `classic-level`。V12 static candidate 可使用 hermetic runner 注入的 `FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY`；任何未来可安装 V12 build 必须改用真实 `app/12.331/node_modules/classic-level`。不得把临时 Lab 根误当成依赖安装。
- V12 identity 必须包含 `supportStatus: "static-candidate"`；不得调用现有 V14 installer、不得把 ZIP/LevelDB 验证称为 V12 runtime Pass。
- ServerNext identity 也必须包含 `supportStatus: "static-candidate"`；现有 V14 installer 不能安装候选。旧 `14` accepted ledger 不授权 `14.368` 构建；这里沿用已接受的 `14.368` / `6.0.2` 来源投影，不得将其重标为 `6.0.5`，runtime maximum 只用于 manifest 的兼容范围。
- 安装目标只能是配置后的本地 Lab `data/server-mirror/Data/modules/fvtt-homebrew-species`；拒绝生产路径、路径逃逸、reparse 和 foreign same-ID。

## 验收

- 两次 clean build 的 documents、UUID、logical hash 与 ZIP SHA-256 必须一致。
- manifest、两个 pack、ItemGrant UUID、Effect allowlist 和 accepted ledger 必须闭合。
- 静态构建不等于 Foundry runtime 验收；本地 Lab、生产和长期跑团分别报告。

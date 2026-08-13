# fvtt-homebrew-species

## 范围

- 本目录是 Foundry `14.364` / dnd5e `5.3.3` / Core 的纯内容 Species 模块发布单元。
- build 只消费 accepted ledger、当前 Species Markdown 和 `@fvtt-json-generator/generation/species-v14` 公共接口；不得把 Intake/provider/compiler带入浏览器运行时。

## 构建与安全

- 模块只有 `species` 与 `features` 两个 Item Compendium，不含 runtime JavaScript、socket、自动迁移或世界扫描。
- ledger、Markdown SHA-256、来源 SHA-256、logical hash 任一 stale/缺失/不一致时 fail-closed。
- LevelDB 只在随机临时根写入；普通运行从 `FVTT_OPS_LAB_ROOT/app/14.364` 只读加载 `classic-level`，隔离测试优先使用 hermetic runner 注入的 `FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY`，不得把临时 Lab 根误当成依赖安装。
- 安装目标只能是配置后的本地 Lab `data/server-mirror/Data/modules/fvtt-homebrew-species`；拒绝生产路径、路径逃逸、reparse 和 foreign same-ID。

## 验收

- 两次 clean build 的 documents、UUID、logical hash 与 ZIP SHA-256 必须一致。
- manifest、两个 pack、ItemGrant UUID、Effect allowlist 和 accepted ledger 必须闭合。
- 静态构建不等于 Foundry runtime 验收；本地 Lab、生产和长期跑团分别报告。

# fvtt-homebrew-species

## 范围

- 本目录是同一module/pack/document identity下的纯内容Species发布单元：V14精确14.364/5.3.3/core，V12候选12.331/4.3.9/core/2024，Next内容身份保留14.368/6.0.2/core/2024。manifest runtime maximum可显式设6.0.5或6.0.6；后者已有Ogre新角色授予、1/5级HP/移动、资源/长休、重载和清理限定接受；不改写内容身份或accepted ledger，不推广全物种/等级。
- build 只消费 target-aware accepted ledger、当前 Species Markdown 和 `@fvtt-json-generator/generation/species` 公共接口；不得把 Intake/provider/compiler带入浏览器运行时。

## 构建与安全

- 模块只有 `species` 与 `features` 两个 Item Compendium，不含 runtime JavaScript、socket、自动迁移或世界扫描。
- ledger、Markdown SHA-256、来源 SHA-256、logical hash 任一 stale/缺失/不一致时 fail-closed。
- LevelDB 只在随机临时根写入；V14 普通运行从 `FVTT_OPS_LAB_ROOT/app/14.364` 只读加载 `classic-level`。V12 static candidate 可使用 hermetic runner 注入的 `FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY`；任何未来可安装 V12 build 必须改用真实 `app/12.331/node_modules/classic-level`。不得把临时 Lab 根误当成依赖安装。
- V12 identity 必须包含 `supportStatus: "static-candidate"`；不得调用现有 V14 installer、不得把 ZIP/LevelDB 验证称为 V12 runtime Pass。
- ServerNext identity也必须含`supportStatus: "static-candidate"`；旧14 ledger不授权14.368构建。Next使用已接受的14.368/6.0.2来源投影，不能重标为6.0.5或6.0.6。既有V14 installer不能安装候选；本批已安装Next内容只允许经独立身份核对更新manifest，不替换已迁移pack。
- 既有V14安装器仅指向配置的Mirror模块目录。Next候选使用独立的精确目标、owned identity和逐文件hash核对；拒绝生产、逃逸、reparse及foreign same-ID。

## 验收

- 两次 clean build 的 documents、UUID、logical hash 与 ZIP SHA-256 必须一致。
- manifest、两个 pack、ItemGrant UUID、Effect allowlist 和 accepted ledger 必须闭合。
- 静态构建不等于 Foundry runtime 验收；本地 Lab、生产和长期跑团分别报告。

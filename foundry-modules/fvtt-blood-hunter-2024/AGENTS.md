# fvtt-blood-hunter-2024

## 范围

- 本目录是 Foundry VTT 14.364 / dnd5e 5.3.3 的独立 Blood Hunter 2024 模块。
- 模块只消费冻结的 `packages/blood-hunter-v14/src/index.ts` 公共接口；不得复制、改写或在浏览器端重建编译器匹配规则。
- 所有构建、安装、迁移和测试代码必须留在本模块目录；根 `scripts/`、`package.json`、`tools/` 和 `docs/` 不属于本模块 worker 的写入范围。

## Runtime 与数据边界

- Foundry 浏览器 runtime 只能加载 `module.json`、browser-safe JavaScript 和构建生成的 canonical/migration 契约；不得导入 Node、Bun、编译器、LevelDB、文件系统、SSH 或生产连接代码。
- 模块不得自动 ready 扫描或修改 Actor。迁移必须是 GM-only、Preview 只读、先复制后应用；Apply original 需要副本验证、Actor copy、JSON backup 和精确名称确认。
- 通过 Foundry 公共 Document API 修改 Actor；禁止直接写世界或 compendium LevelDB。歧义、手改 Activity/Effect/说明冲突和失败均 fail-closed，并支持补偿回滚。
- 只允许把 `FVTT_OPS_LAB_ROOT` 解析为配置后的本地 Lab 模块目录；拒绝生产变量、8080、路径逃逸、symlink/junction/reparse、foreign same-ID 和锁定目标。

## Build 与验证

- build 输入必须是显式绝对 JSON 路径，raw bytes 交给冻结编译器并由 validator fail-closed；不得手写正式 pack 内容。
- 每次 build 先在随机临时根创建三个 LevelDB pack、模块树、ledger/review/identity/manifest/ZIP，再比较两次构建的 docs、UUID 和 logical identity，最后原子发布到本目录 `dist/`。
- `classic-level` 只能从配置的只读入口加载；测试不得把真实 Lab app/data/world 当作数据库，也不得修改真实 Lab 或生产 8080。
- 测试须同时记录机械结果（命令、结构、哈希、文件完整性）和语义结果（迁移保留字段、重复/引用/选择、Callum fixture 的 Preview/copy/apply/rollback）。mock Foundry API 不得冒充真实 Foundry E2E。

## 局部完成标准

- manifest、pack 声明、UUID 前缀、版本和依赖精确符合任务契约。
- deterministic build/archive/LevelDB/index/安装安全测试通过，生成 ZIP SHA-256、logical hash 和 UUID 清单。
- GM-only 迁移行为、冲突 Keep/Overwrite/Cancel、失败补偿和 Callum 5/2 fixture 通过模块内语义测试。
- README 说明构建、安装、迁移、使用，以及 Core/Modded/assisted/external 边界；明确快照不实时同步、旧 side-data 非权威、线上不在本任务部署。

# fvttV12JsonGenerator

把 Obsidian 中的中文 YAML/Markdown、英文 bestiary 文本和批量怪物资料转换成 Foundry VTT dnd5e Actor/Item JSON。项目默认兼容 Foundry v12，同时支持显式生成 Foundry v14 JSON，并提供来源核对、GoddessFantasy 采集流水线、图片处理、Web 工作台和隔离的 Foundry v14 验收环境。

## 支持范围

| 目标 | 系统版本 | Effect profile | 当前状态 |
| --- | --- | --- | --- |
| Foundry v12 | dnd5e 4.3.9 | `core`、`modded-v12` | 默认目标 |
| Foundry v13 | dnd5e 4.3.9 | `core`、`modded-v12` | 保留兼容路径 |
| Foundry v14 | dnd5e 5.3.3 | `core`、`modded-v14` | Actor 核心与最小模组运行验收通过 |

`modded-v14` 锁定 MIDI-QOL 14.0.9 和 DAE 14.0.12。完整生产模组集合仍存在已复现错误，整体兼容性状态是 **Partial**，不能表述为全部通过。详见 [`docs/acceptance/v14-live-runtime-smoke-test.md`](docs/acceptance/v14-live-runtime-smoke-test.md)。

## 安装

需要 [Bun](https://bun.sh/) 1.3 或兼容版本：

```powershell
cd I:\OpenCode\fvttV12JsonGenerator
bun install --frozen-lockfile
bun run cli:help
```

仓库中的 `data/cn.json`、`data/spells.ldb` 和 v12 golden master 为现有 v12 工作流提供映射与模板。v14 正常生成不需要完整的 dnd5e/Foundry 上游仓库。

## 单文件转换

默认生成 Foundry v12 core JSON：

```powershell
bun run src/index.ts "templates/npc-example.md" `
  -o "obsidian/dnd数据转fvttjson/output/example.json"
```

显式生成 Foundry v14：

```powershell
bun run src/index.ts "templates/npc-example.md" `
  -o "obsidian/dnd数据转fvttjson/output/example-v14.json" `
  --fvtt-version 14 `
  --effect-profile core
```

需要锁定的 MIDI-QOL/DAE 自动化时使用：

```powershell
bun run src/index.ts "templates/npc-example.md" `
  -o "obsidian/dnd数据转fvttjson/output/example-v14-modded.json" `
  --fvtt-version 14 `
  --effect-profile modded-v14
```

最终 Actor/Item JSON 必须由 CLI 或项目 workflow 生成；不要手工拼装或修补最终 JSON。

## Obsidian 工作流

默认数据路径：

```text
obsidian/dnd数据转fvttjson/input
  → parser / generator / workflow
  → obsidian/dnd数据转fvttjson/output
```

批量增量同步：

```powershell
bun run sync:vault
```

同步会：

- 处理 `input/` 中新增或变化的 Markdown；
- 把生成 JSON 写入 `output/`；
- 覆盖前把旧 JSON 放入 `output_backup/`；
- 通过 `.fvtt-sync-manifest.json` 跳过未变化输入；
- 在源文件删除后移除过期输出。

## 纯文本与批量怪物

仅拆分纯文本资料为项目 Markdown：

```powershell
bun run src/index.ts `
  --ingest-plaintext "path/to/collection.txt" `
  --emit-dir "obsidian/dnd数据转fvttjson/input"
```

从纯文本直接生成中间 Markdown 和 Actor JSON：

```powershell
bun run src/index.ts `
  --ingest-plaintext-actors "path/to/collection.txt" `
  --vault "obsidian/dnd数据转fvttjson" `
  --fvtt-version 14 `
  --effect-profile core
```

先用 `--dry-run` 检查识别数量和警告。AI normalization 是可选路径；未配置服务时使用规则化处理，测试不依赖外部翻译服务。

## GoddessFantasy 流水线

采集结果默认写入 `obsidian/dnd数据转fvttjson/crawls`。cookie、账号和密码只能通过忽略文件或环境变量提供，不得提交到 Git。

```powershell
# 板块增量采集
bun run src/tools/crawlSites.ts goddessfantasy-board `
  --board-url "<board-url>" `
  --cookie-header-file ".local/goddessfantasy.cookie" `
  --out-dir "obsidian/dnd数据转fvttjson/crawls/goddessfantasy/board-2318" `
  --mode incremental

# records.json 转换为纯文本怪物
bun run src/tools/crawlSites.ts records-to-plaintext `
  --records "obsidian/dnd数据转fvttjson/crawls/goddessfantasy/board-2318/records.json" `
  --out-dir "obsidian/dnd数据转fvttjson/crawls/goddessfantasy/board-2318/plaintext/monsters"
```

`--force` 是 `--mode full` 的兼容别名。真实登录采集不属于离线验收，运行前应先 dry-run 并保护本地凭据。

## Web 工作台

```powershell
# 本地开发
bun run web:dev

# API 服务
bun run web:api

# 生产构建
bun run web:build
```

`web:api` / `web:start` 默认只监听 `127.0.0.1:5174`。非回环或反向代理公开模式必须显式启用并配置服务器端 bearer token；浏览器不能提交 VPS 凭据。Web/API 支持上传 Markdown、单文件转换、批量怪物 job、下载 ZIP、来源核对及受限的 workspace path 模式。完整部署、鉴权、可信代理与资源上限见 [`docs/web-deployment.md`](docs/web-deployment.md)。

## 参考缓存

完整 dnd5e 5.3.3 源码、Foundry API 页面和生成索引存放在忽略的 `.local/references`，不是生成器运行依赖：

```powershell
bun run references bootstrap --dry-run
bun run references bootstrap
bun run references verify
bun run src/tools/referenceIndex.ts
```

获取器先在 staging 中检出 manifest 固定的 revision，通过验证后才原子替换本地缓存。详情见 [`docs/REFERENCE_INDEX.md`](docs/REFERENCE_INDEX.md)。

## 验证与验收

```powershell
# 全量测试；限制并发以避免 CLI/Crawlee 子进程在 Windows 上资源饥饿
bun run test

# parser/generator 反过拟合审计
bun run audit:anti-overfit

# Actor 来源对照
bun run verify:actor -- "path/to/source.md" "path/to/actor.json"

# Foundry Lab 单元测试
bun run test:foundry-lab
```

测试、JSON 可解析、文件存在和命令退出 0 都只是机械验证。生成结果只有在按照 [`docs/generated-actor-verification.md`](docs/generated-actor-verification.md) 核对身份、数值、动作、豁免、效果、施法、自动化和来源覆盖后，才可以声明正确。

当前 v14 真实验收边界：

- 六个 core Actor 在 Foundry 14.364 / dnd5e 5.3.3 中导入并执行代表性 Activity：通过；
- 六个 minimal modded Actor 与来源驱动的 MIDI-QOL OverTime：通过；
- `cor-cotn` 本地副本的角色卡、豁免聊天卡、Journal、Scene 和 Token 抽样流程：通过；
- 完整生产模组集合无错误共存：失败，仍为 Partial；
- 来源驱动的 DAE `isDamaged` 标记与独立 Item v14 已通过源码、CLI 和结构验收，但两者的 Foundry 实机导入/行为仍未完成；真实账号 GoddessFantasy 采集也尚未授权验收。当前分层结论见 [`docs/acceptance/current-support-matrix.md`](docs/acceptance/current-support-matrix.md)。

## 更多资料

- [`docs/manual.md`](docs/manual.md)：以 v12 为主的旧版详细使用手册；涉及版本时以本 README 和 `AGENTS.md` 为准。
- [`docs/generated-actor-verification.md`](docs/generated-actor-verification.md)：生成 Actor 的强制语义验收清单。
- [`scripts/foundry-lab/README.md`](scripts/foundry-lab/README.md)：隔离 Foundry v14 实验环境的安全边界与操作手册。
- [`docs/acceptance/foundry-v14-module-compatibility.md`](docs/acceptance/foundry-v14-module-compatibility.md)：模组矩阵、已知冲突和生产世界抽样证据。

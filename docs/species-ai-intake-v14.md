# Species AI Intake：TXT → Markdown → Foundry V14 race/feat

`--intake-species` 是不规则 TXT 或已人工编辑 Species Markdown 的正式入口，目标固定为 Foundry `14.364` / dnd5e `5.3.3` / `core` / 2024 角色创建规则。

## 数据链与状态

```text
TXT → discovery → Species Evidence IR → deterministic Markdown
    → parser → V14 race/feat package → deterministic validator → AI review
    → accepted ledger → 独立模块 build
```

一个 TXT 最多发现 50 个互不重叠候选。每个候选单独得到 `accepted`、`needs_review` 或 `failed`；整次运行可为 `succeeded`、`partial`、`needs_review` 或 `failed`。运行包位于 `.local/species-intake-runs/<run-id>/`，保存不可变来源、discovery、逐候选 IR、Markdown、JSON package、确定性报告、AI review、provider audit 和 manifest。

AI 不直接编写正式 JSON。证据范围、完整 coverage、字段范围、mechanic allowlist、Markdown parser、V14 projector、package validator 与 AI cross-review 全部通过后，候选才会推广到：

- `input/species/<identifier>.md`
- `output/species/<identifier>.json`
- `output/species/accepted-ledger.json`

## Markdown 契约

Species Markdown 的 frontmatter 使用 `layout: species`、`species-schema: 1`、稳定 identifier、2024 rules、生物类型、体型、移动、感官、私有 homebrew 来源哈希与精确 UTF-16 长度，以及显式 feature/part ID。正文每个特性都有 `species-feature:<id>` 稳定标记；文末的原始资料区按记录长度逐字符保留候选全文，包括首尾空白和 CRLF。

允许的 v1 mechanics 只有：

- `descriptive-passive`
- `gm-assisted`
- `external-rule`
- `hp-per-level`
- `ac-bonus`
- `limited-utility`

Markdown 不允许填写任意 Foundry system path 或任意 Active Effect change。复杂但来源明确的规则可以诚实地以 `gm-assisted` / `external-rule` accepted；必须保留完整规则、触发条件和未自动化边界，不能用空 Utility 冒充实现。

Evidence IR 使用字段级 claim：身份、规则版本、生物类型、体型、移动、感官和每个 feature 都必须有唯一 JSON-pointer path 与精确来源区间。coverage 必须无缝分割候选，并与这些 claim 双向引用；`ignored-with-reason` 必须写明原因。一个笼统的 `/species` claim 不能通过晋升门禁。

## 命令

```powershell
bun run src/index.ts --intake-species "path/to/species.txt" `
  --vault "obsidian/dnd数据转fvttjson" `
  --fvtt-version 14 `
  --effect-profile core
```

`--dry-run` 不调用 provider、不创建 run bundle、不推广正式文件。其他 target/profile 会在 provider 调用前失败。

处理精确 target conflict 或恢复 provider 故障：

```powershell
bun run src/index.ts --resume-species-intake ".local/species-intake-runs/<run-id>" `
  --decisions ".local/species-intake-runs/<run-id>/decisions.json" `
  --vault "obsidian/dnd数据转fvttjson" `
  --fvtt-version 14 `
  --effect-profile core
```

decision 只能批准精确 `target-conflict:<identifier>` 的 replace；不能覆盖来源证据、coverage、语义或 unsupported mechanic finding。
恢复会创建新的 immutable run；新 manifest 和 accepted ledger 同时记录 `resumedFromRunId` 与 decisions 文件 SHA-256，从而能回溯被恢复的旧 run，而不是改写旧证据。

accepted Markdown 可以编辑，但 ledger 保存了当前 Markdown SHA-256。任何字节变化都会使条目 stale，模块 build 立即 fail-closed。编辑后必须再次把该 Markdown 交给 `--intake-species`，重新生成 run、IR、review、JSON 和 ledger revision。

## 累计内容模块

```powershell
bun run build:homebrew-species
bun run test:homebrew-species
bun run verify:homebrew-species
```

`fvtt-homebrew-species` 是纯内容模块，只有 `species` 和 `features` 两个 Item Compendium。build 只读取 accepted ledger 和当前 Markdown，重新走 parser/projector/validator，在随机临时根生成两次 LevelDB 与确定性 ZIP，通过 identity/coverage/UUID 闭合后才发布 `dist/`。模块没有 browser runtime、socket、自动迁移或世界扫描。

安装器会在复制前验证完整 build artifact，在 staging 和最终目标再次验证 manifest、content-only 文件面、LevelDB documents 和 ItemGrant UUID 闭合；`verify-install:homebrew-species` 要求目标已经存在并完成同一目标验证。路径逃逸、production/non-canonical target 和 foreign same-ID 都会 fail-closed。

散装 JSON 是模块绑定的审阅/构建输入；race ItemGrant 使用 `Compendium.fvtt-homebrew-species.features.Item.<id>`，因此不承诺脱离模块独立导入。已经授予 Actor 的嵌入 Item 是快照，v1 不提供迁移器。

## 食人魔 v1 自动化边界

- race 原生表达 giant / Ogre、Large、40尺、60尺黑暗视觉和 2024/private-homebrew 来源。
- 巨武器四条完整保留为 `gm-assisted`；不写武器、不生成 Activity/Effect/flag、不解释“体型不超过你二级”、不判定建筑、不移动 Token、不重复已有推击。
- 身强力壮的受擒脱困优势仅为描述性被动，不扩大成全局属性优势，也不自动移除 Grappled。
- 5级附赠动作脱困是 2/LR、每次消费1的 Bonus Action Utility；聊天卡要求按原规则进行相应属性检定，不固定力量/敏捷/技能。
- 食人魔刚毅使用 transfer ADD `system.attributes.hp.bonuses.level = 3`，即总等级 N 时增加 `3N` 最大生命值。
- 食人魔笨拙使用 transfer ADD `system.attributes.ac.bonus = -2`；倒地后花费全部速度站起保持 `gm-assisted`。
- 不添加来源未声明的 ASI、语言、触及、负重、武器熟练、徒手伤害、抗性或大型生物额外收益。

## 当前验收边界

自动测试继续使用 fake provider，以保持离线、确定和可重复；正式食人魔另以本机 Codex OAuth provider 完成了真实运行 `species-20260811022558-9a41c4a1`。该 run 的 deterministic report 与 AI review 均为 `accepted`，没有 repair；正式 ledger、Markdown 与 JSON 的来源/内容/logical hash 闭合。模块 build/verify 得到 1 个 race、5 个 feat，ZIP SHA-256 为 `38390d2e1554eac683c5e065c6c2404d4f569b4f662868319f4523977290581e`。

本地 `fvtt-v14-module-matrix` disposable world 已在 Foundry `14.364` / dnd5e `5.3.3` 中安装并启用该模块。原生 Add Species 流程确认 giant/Ogre、Large、40尺、60尺黑暗视觉和 AC 10→8；1级 Barbarian 的最大生命值为 12+3=15，5级为 40+15=55；5级附赠动作脱困连续消耗至 0/2，第三次没有生成聊天卡，Long Rest 恢复为 2/2。聊天卡明确要求手动执行原受擒检定，不选择属性/技能、不自动解除状态，并保留身强力壮优势。巨武器与“体型不超过你二级”始终是 DM 现场判断，未生成系统体型测试、武器写入、推击或 Token 移动。

这仍不是无边界的 runtime Pass：本次没有完成精确 2×2 Token 放置、现有武器应用种族前后的字节级比较或 Actor 导出/读回。长期跑团也未验收。

## 2026-08-13 线上 8080 部署记录

- 用户明确授权把该模块安装到线上 `8080` 并重启；本次只操作 `fvtt-production` 的 `8080`，`51020` 的 v14 进程保持运行且未写入。
- 用户同时明确要求本地和线上不创建备份，也不以在线人数为执行门槛。本次没有创建模块或世界备份；只使用唯一的 ZIP 暂存与构建验证目录，不保留旧模块副本。
- 远端模块目录 `E:\Bill\fvtt_v13\data\Data\modules\fvtt-homebrew-species` 已落盘 10 个文件、31,577 bytes；manifest 为 `fvtt-homebrew-species` / `1.0.0`，包含 `species` 与 `features` 两个 Item pack。线上 HTTP 可读 `module.json` 与 `data/identity-manifest.json`，logical hash 为 `d9bd6759dc378333f314431e7839d2d3beadd6eb0e6faf9b9a440168f07258fd`，1 race / 5 features。
- 重启后的精确命令为 `E:\Bill\v14\code\main.js --port=8080 --dataPath="E:\Bill\fvtt_v13\data" --world=cor-cotn`；最终 `/api/status` 为 active、Foundry `14.364`、dnd5e `5.3.3`、world `cor-cotn`，监听 PID 为 9852。日志记录 `Server started and listening on port 8080`，没有新增该模块错误。
- 为清除无进程占用的启动锁，删除了 `E:\Bill\fvtt_v13\data\Config\options.json.lock`；没有直接编辑世界 LevelDB。
- 生产模块文件已安装并可由 Foundry 服务提供，但未取得 `Gamemaster` 密码，不能通过 UI 证明 `cor-cotn` 已启用该模块；因此“已安装/服务已恢复”为 Pass，“世界已启用/食人魔已在生产界面可用”保持未验收，不把文件落盘冒充启用。
- 线上部署使用的 ZIP SHA-256 是 `38390d2e1554eac683c5e065c6c2404d4f569b4f662868319f4523977290581e`。master 集成前的 Markdown revision review 只更新 accepted Markdown hash/run 证据，Foundry documents 与 module logical hash 未变；当前本地重建 ZIP SHA-256 为 `77281eac8e0c5e3f7bd6f2ec3d44603da53b9d2eb0845b450bf4721cd9466e11`，本轮合并没有重新部署线上模块。

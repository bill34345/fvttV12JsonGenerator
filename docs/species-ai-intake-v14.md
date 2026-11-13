# Species AI Intake：TXT → Markdown → Foundry V12/V14 race/feat

`--intake-species` 是不规则 TXT 或已人工编辑 Species Markdown 的正式入口。常规 `--fvtt-version 14` 与省略版本均生成 Foundry `14.370` / dnd5e `6.0.6` / `core` / 2024 原生数据。显式 `14.368` 保留既有 dnd5e `6.0.2` 内容身份和接受来源链；显式 V12 保留 `12.331 / 4.3.9 / core / 2024` 静态候选。V13、legacy/2014、`modded-v12` 和第三方模块兼容均 fail-closed。旧 `14.364 / 5.3.3` 包与记录只读保留，不能直接充当新 6.x accepted artifact。

## 数据链与状态

```text
TXT → discovery → Species Evidence IR → deterministic Markdown
    → parser → target race/feat package → target validator → AI review
    → accepted ledger → 独立模块 build
```

一个 TXT 最多发现 50 个互不重叠候选。每个候选单独得到 `accepted`、`needs_review` 或 `failed`；整次运行可为 `succeeded`、`partial`、`needs_review` 或 `failed`。运行包位于 `.local/species-intake-runs/<run-id>/`，保存不可变来源、discovery、逐候选 IR、Markdown、JSON package、确定性报告、AI review、provider audit 和 manifest。

AI 不直接编写正式 JSON。证据范围、完整 coverage、字段范围、mechanic allowlist、Markdown parser、目标 projector、package validator 与 AI cross-review 全部通过后，候选才会推广到：

- 普通 V14：`input/species/<identifier>.md`；既有 `14.368`：`input/species/v14-368/<identifier>.md`；V12：`input/species/v12/<identifier>.md`。各目标的已接受来源分别保存，避免一次修改使另一个版本的 ledger 失效。
- V14：`output/species/<identifier>.json`
- 既有 `14.368`：`output/species/v14-368/<identifier>.json`
- V12：`output/species/v12/<identifier>.json`
- `output/species/accepted-ledger.json`

accepted ledger schema v2 以 `(identifier, fvttVersion, effectProfile, rules)` 为唯一身份，V12 与 V14 可以共存且互不覆盖。schema v1 只解释为 V14/core/2024；读取、验证或 build 不会改写旧 ledger，只有一次新的成功 promotion 才原子升级为 v2。同一目标的 Markdown、package、ledger hash 必须闭合，另一目标的 package 不能冒充证据。

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

V12 static candidate 使用同一入口：

```powershell
bun run src/index.ts --intake-species "path/to/species.txt" `
  --vault "obsidian/dnd数据转fvttjson" `
  --fvtt-version 12 `
  --effect-profile core
```

`--dry-run` 不调用 provider、不创建 run bundle、不推广正式文件。V13、modded/legacy 和其他 target/profile 会在 provider 调用前失败。

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
resume 命令中的版本/profile 必须与原 run 完全一致；目标漂移在 provider 调用前拒绝。

accepted Markdown 可以编辑，但 ledger 保存了当前 Markdown SHA-256。任何字节变化都会使条目 stale，模块 build 立即 fail-closed。编辑后必须再次把该 Markdown 交给 `--intake-species`，重新生成 run、IR、review、JSON 和 ledger revision。

## 累计内容模块

```powershell
bun run build:homebrew-species
bun run test:homebrew-species
bun run verify:homebrew-species
bun run build:homebrew-species:v12-candidate
bun run verify:homebrew-species:v12-candidate
```

`fvtt-homebrew-species` 是纯内容模块，只有 `species` 和 `features` 两个 Item Compendium。build／verify 省略版本或选择 `14` 时使用 `14.370 / 6.0.6` 当前目标，输出 `dist/`；显式 `14.368` 使用既有 `6.0.2` 来源，输出 `dist/v14-368-candidate/`。V12 static candidate 输出为 `dist/v12-candidate/`，identity 带 `supportStatus: "static-candidate"`。build 只读取当前目标的 accepted ledger 条目和 Markdown，重新走 parser/projector/validator，在随机临时根生成两次 LevelDB 与确定性 ZIP，并检查 identity/coverage/UUID 闭合。V12/V14 的 module ID、pack 名、Race/Feature/Effect/Advancement ID 与 Compendium UUID 相同，版本 metadata 和 Activity 形状是允许差异。

旧 5.3.3 ledger 不会被改标成 6.0.6：当前默认 build 要求先对当前目标重新 Intake，缺少对应 accepted artifact 时拒绝构建。本轮可复用已接受的 `14.368 / 6.0.2` 原生来源重建本地包，保留其目标、来源 hash 和历史接受身份；这不等于所有物种已经通过新环境玩法验收。

V12 candidate 可以在隔离测试中使用显式 `FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY` 写入并回读 LevelDB；任何未来可安装 V12 build 必须使用真实 `app/12.331/node_modules/classic-level`。本轮没有扩展安装器、创建 V12 Lab、安装模块或运行 Foundry。

现有安装器仍只属于已验收的 V14 路径；V12 candidate 不得调用它。V12 ZIP 构建成功、LevelDB 回读或静态 validator 绿色都不构成 V12 Runtime Pass。

散装 JSON 是模块绑定的审阅/构建输入；race ItemGrant 使用 `Compendium.fvtt-homebrew-species.features.Item.<id>`，因此不承诺脱离模块独立导入。已经授予 Actor 的嵌入 Item 是快照，v1 不提供迁移器。

## 食人魔 v1 自动化边界

- race 原生表达 giant / Ogre、Large、40尺、60尺黑暗视觉和 2024/private-homebrew 来源。
- 巨武器四条完整保留为 `gm-assisted`；不写武器、不生成 Activity/Effect/flag、不解释“体型不超过你二级”、不判定建筑、不移动 Token、不重复已有推击。
- 身强力壮的受擒脱困优势仅为描述性被动，不扩大成全局属性优势，也不自动移除 Grappled。
- 5级附赠动作脱困是 2/LR、每次消费1的 Bonus Action Utility；聊天卡要求按原规则进行相应属性检定，不固定力量/敏捷/技能。
- 食人魔刚毅使用 transfer ADD `system.attributes.hp.bonuses.level = 3`，即总等级 N 时增加 `3N` 最大生命值。
- 食人魔笨拙使用 transfer ADD `system.attributes.ac.bonus = -2`；倒地后花费全部速度站起保持 `gm-assisted`。
- 不添加来源未声明的 ASI、语言、触及、负重、武器熟练、徒手伤害、抗性或大型生物额外收益。

## 历史验收边界与当前目标

下列 V14 食人魔结果属于当时的 `14.364 / 5.3.3`，V12 仍是静态候选；它们不会因默认目标更新而升级为 `14.370 / 6.0.6` 实机 Pass。既有 6.0.2 原生包及限定 6.0.6 运行记录独立保留，新目标的实际结果见[兼容范围](acceptance/2026-11-13-native-dnd5e6.md)。

V12 当前只通过静态候选层：锁定 4.3.9 模型的 Race、Size、ItemGrant、Utility Activity、itemUses、lr/sr recoverAll、Race 升级流以及 HP/AC Effect 路径有参考契约；Ogre V12 package 已逐条核对语义；两次 clean candidate build 的树、logical hash、UUID 和 ZIP 可确定重现。当前机器没有 V12 Lab，因此尚未验收 Token 2×2、真实 Add Species UI、1→5 级升级、AC/HP 运行值、次数消耗、Long Rest 或重开读回。只能声明“V12 静态候选支持”，不能声明“V12 可用”或“V12 正式支持”。

自动测试继续使用 fake provider，以保持离线、确定和可重复；正式食人魔另以本机 Codex OAuth provider 完成了真实运行 `species-20260811022558-9a41c4a1`。该 run 的 deterministic report 与 AI review 均为 `accepted`，没有 repair；正式 ledger、Markdown 与 JSON 的来源/内容/logical hash 闭合。模块 build/verify 得到 1 个 race、5 个 feat，ZIP SHA-256 为 `38390d2e1554eac683c5e065c6c2404d4f569b4f662868319f4523977290581e`。

本地 `fvtt-v14-module-matrix` disposable world 已在 Foundry `14.364` / dnd5e `5.3.3` 中安装并启用该模块。原生 Add Species 流程确认 giant/Ogre、Large、40尺、60尺黑暗视觉和 AC 10→8；1级 Barbarian 的最大生命值为 12+3=15，5级为 40+15=55；5级附赠动作脱困连续消耗至 0/2，第三次没有生成聊天卡，Long Rest 恢复为 2/2。聊天卡明确要求手动执行原受擒检定，不选择属性/技能、不自动解除状态，并保留身强力壮优势。巨武器与“体型不超过你二级”始终是 DM 现场判断，未生成系统体型测试、武器写入、推击或 Token 移动。

这仍不是无边界的 runtime Pass：本次没有完成精确 2×2 Token 放置、现有武器应用种族前后的字节级比较或 Actor 导出/读回。长期跑团也未验收。

## 既有 ServerNext 内容身份与运行兼容

接续既有 Next 来源链时，Species Intake／resume 和内容构建可显式使用 `--fvtt-version 14.368 --effect-profile core`。这个内容目标仍绑定 dnd5e **6.0.2** 的来源投影、接受记录和 logical hash；`14.368` 是该既有来源的兼容别名，普通 `14` 已使用 `14.370 / 6.0.6`。它只属于 Species 路径，不扩大 Actor／Item CLI 的版本集合。

`--dnd5e-runtime-maximum` 只用于显式 `14.368` 的旧 6.0.2 内容，接受 `6.0.2`、`6.0.5`、`6.0.6` 或默认的 `6.999.999`；Core 默认上限为 `14.999`，同主版本向前准入不代表未来玩法已验。需要复现限定的 6.0.6 包时：

```text
bun run build:homebrew-species --fvtt-version 14.368 --dnd5e-runtime-maximum 6.0.6
bun run verify:homebrew-species --fvtt-version 14.368 --dnd5e-runtime-maximum 6.0.6
```

运行兼容上限不重标接受来源，也不扩大玩法验收；既有模块恢复保留已安装合集数据。历史入口及范围见[十模块恢复记录](reviews/2026-10-01-next-605-custom-module-restoration.md)，后续 6.0.6 限定接受与本轮开发状态按[环境维护入口](runbooks/foundry-environment-maintenance.md)查阅。

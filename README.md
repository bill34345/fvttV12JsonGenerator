# fvttV12JsonGenerator

本仓库包含 Foundry VTT 的资料生成工具与独立跑团模块。中文 YAML/Markdown、英文 bestiary 和正式 Intake 来源通过共享流程生成 dnd5e Actor/Item JSON；Web 工作台与 Forge 提供不同使用入口。

当前主要平台为 Foundry V14，dnd5e 5.3.3 与 6.x 按功能分别适配和验收。CLI 省略版本仍默认 V12，常规生成请显式使用 `--fvtt-version 14 --effect-profile core --icon-mode off`；模块的 6.x 适配不代表生成器全部支持 6.x。详见[当前支持矩阵](docs/acceptance/current-support-matrix.md)和[版本流程](docs/runbooks/dnd5e-version-following.md)。

## 离线中文工具手册

双击根目录的 [工具手册.html](工具手册.html)，从“开始使用”选择入口，并在“版本与兼容性”核对目标。页面提供按用途的目录、全文搜索、操作步骤、本页导航、命令和可展开的离线原始说明，阅读无需联网或启动服务。建议收藏 master 工作区里的文件；单独复制出去的文件是版本快照。

新功能或用户可见行为变化应在同一分支更新工具说明，人工核对后重新生成页面，与功能一起合并到 master。`bun run handbook:check` 已纳入完整仓库门禁。维护命令、核对记录和合并后步骤见 [手册维护流程](docs/runbooks/handbook-maintenance.md)。

## 支持范围

| 目标 | 系统版本 | Effect profile | 当前状态 |
| --- | --- | --- | --- |
| Foundry v12 | dnd5e 4.3.9 | `core`、`modded-v12` | 默认目标；严格结构验证 |
| Foundry v13 | dnd5e 4.3.9 | `core`、`modded-v12` | 与 v12 共用 4.3.9 投影器；严格结构验证 |
| Foundry v14 | dnd5e 5.3.3 | `core`、`modded-v14` | 独立 5.3.3 投影器；运行时证据按验收报告限定 |

`modded-v14` 当前锁定 MIDI-QOL 14.0.11 和 DAE 14.0.12；旧的 14.0.9 实机结果保留为历史证据，不能自动升级为 14.0.11 的运行时验收。完整生产模组集合整体兼容性状态仍是 **Partial**。详见 [`docs/acceptance/current-support-matrix.md`](docs/acceptance/current-support-matrix.md)。

Actor、Item、单文件、合集、Vault Sync、CLI 和 Web Job 共享 `parse → canonical IR → validate IR → target projector → validate output → write` 管线。Actor 一经生成即交付文件和实际路径，`failed`／`needs_review` 只表达检查结论；正式登记及已有目标覆盖分别处理。独立 Item／Species 保持各自接受与推广契约。`core` profile 不包含 MIDI-QOL、DAE、Times Up 或 Item Macro 专属字段。

## FVTT JSON Forge（Foundry 模块）

`fvtt-json-forge` 是面向 GM 的浏览器模块。当前候选支持 Foundry `14.364`／`14.368`、dnd5e `5.3.3`、`core`，提供生物及关联召唤物生成、独立 Item 生成、来源库、审核记录、完整候选恢复，以及顺序执行的可恢复批量队列。当前分支实现及限定验收见模块说明和唯一当前状态；本地候选通过不代表已发布或部署到生产。

2026-10-17共用契约候选将同一能力的攻击、伤害、独立豁免与次数分别保留，完整特殊规则明确交GM；多个来源明确的共享法术池分别计次，真实施法继续交目标世界Resolver匹配。排版整理使用原文行身份，完整能力事实仍逐项核对来源，不能因后果复杂而整体变成文字占位。旧卡、旧失败原件和CLI默认版本保留，旧卡不自动迁移。本轮离线、正常DeepSeek与实机进度见[执行记录](docs/plans/2026-10-17-forge-common-contract-restoration.md)，未完成层级不算通过。

正式发行版通过 Foundry Setup 的 **Install Module** 安装，manifest URL 为：

```text
https://raw.githubusercontent.com/bill34345/fvttV12JsonGenerator/master/foundry-modules/fvtt-json-forge/src/module.json
```

生物只有在AI没有正常答复时才允许本次整只无产物；可读回答的格式、局部字段、引文、内部协议及后置检查问题均单独显示，已有攻击、伤害、法术、次数和完整规则保持。可查看、下载已有Actor并由GM正常采用；世界权限、文档归属和覆盖冲突只限制相应写入。Item仍要求自身严格`accepted`。Forge额外AI内容复核暂时关闭，开发和测试均不启用。正式v1/v2 Actor草稿直接读取保存产物，不以期限、模型、契约或重新生成一致为取回条件，也不继承旧GM确认；恢复不自动请求模型。当前实施与实机验收状态见[46项记录](docs/acceptance/2026-10-27-forge-generation-delivery-remediation.md)，详细操作见 [`foundry-modules/fvtt-json-forge/README.zh-CN.md`](foundry-modules/fvtt-json-forge/README.zh-CN.md)。

## 安装

需要 [Bun](https://bun.sh/) 1.3 或兼容版本：

```powershell
cd I:\OpenCode\fvttV12JsonGenerator
bun install --frozen-lockfile
bun run cli:help
```

仓库中的 `data/cn.json`、`data/spells.ldb` 和 v12 golden master 为现有 v12 工作流提供映射与模板。v14 正常生成不需要完整的 dnd5e/Foundry 上游仓库。

## 本地开发与检查

仓库本地开发与验证使用 **Bun 1.3.14**，本批命令及其子进程沿用同一运行时；环境未变时复用版本核对结果。未采用 Bun 1.4.0 升级试验。

GitHub 自动 CI 已停用，专用工作流与依赖配置已移除；push 和 PR 不再触发这套检查。本地安全测试、类型、架构、覆盖率和手册检查入口继续保留，按实际改动选择执行。`bun run ci:verify` 保留为手动综合检查命令，局部修改不默认运行整套检查。

本地综合检查默认使用完整测试清单；依赖固定历史来源的专项检查与准备步骤见[历史回归测试输入](docs/runbooks/legacy-next-test-inputs.md)。测试通过、来源语义核对和真实 Foundry 接受分别记录。

## 单文件转换

技能可以明确写总加值，避免与旧格式的熟练倍率混淆：

```yaml
技能:
  察觉: {总加值: 2}
  隐匿: {总加值: -1}
```

`总加值` 必须是唯一字段且为整数；AI Intake 生成的 Markdown 使用此写法。旧 `察觉: 1`／`熟练`、`察觉: 2`／`专精` 和 `0.5`／`半熟练` 仍表示熟练倍率，原有含义不变。该新增写法沿用原生技能与额外加值投影，不要求 Foundry 新接口或模块。

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

dnd5e 4.3.9 Item 不再输出 legacy `system.activation` 或 `uses.value/uses.per`。迁移细节见 [`docs/migrations/2026-07-30-dnd5e-4.3.9-generation-schema.md`](docs/migrations/2026-07-30-dnd5e-4.3.9-generation-schema.md)。

## v14 名称驱动图标

v14 可以显式启用安全的名称驱动 Item 图标解析：

```powershell
bun run src/index.ts "templates/npc-example.md" `
  -o "obsidian/dnd数据转fvttjson/output/example-v14.json" `
  --fvtt-version 14 `
  --effect-profile core `
  --icon-mode safe
```

`safe` 只使用锁定的 Foundry `14.364` 核心图标和 dnd5e `5.3.3` 图标。解析顺序为外部 override、已有有效图标、精确 Compendium 名称、带来源结构证据的高置信语义匹配、dnd5e 类型默认图标；低置信候选不会强行采用。生成结果旁会写入 `*.icon-review.json`，合集和 Vault Sync 会生成聚合 `icon-review.json`。

可用 `--icon-overrides <path>` 指定独立 override 文件；Web 服务器只从 `FVTT_V14_ICON_OVERRIDES` 读取该服务器端路径。v12/v13 不接受 `safe`。

本地人工审阅：

```powershell
bun run review:icons:v14 `
  --report "obsidian/dnd数据转fvttjson/output/example-v14.icon-review.json" `
  --output ".local/icon-review/example-v14.html"
```

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

纯文本 Item 合集可以先拆分到 `middle/items`，也可以在同一次项目工作流中推广 Markdown 并生成最终 JSON：

```powershell
# 只拆分中间 Markdown
bun run src/index.ts --ingest-items "path/to/items.md" `
  --vault "obsidian/dnd数据转fvttjson"

# 生成 middle/items、input/items 和 output/items
bun run src/index.ts --ingest-items-json "path/to/items.md" `
  --vault "obsidian/dnd数据转fvttjson" `
  --fvtt-version 14 `
  --effect-profile core
```

Item 专用运行只处理本次推广的 Item 文件，不会顺带重生成或清理 vault 中其他 Actor 输出。

## AI Item Intake（Foundry V14/core）

原始 TXT 或格式不规则的 Item Markdown 使用正式 `--intake-items`，而不是旧的 `--ingest-items` / `--ingest-items-json`。它先由 AI 提取带原文位置的 Item IR，再由确定性规则验证证据、渲染项目 Markdown 的 `item-mechanics` 契约、走既有 Item generator，并逐项验证生成 JSON。AI 从不直接写最终 JSON；任一证据、法术唯一性或机制投影不成立都会停在 `needs_review` / `failed`，不会以空能力或 Utility Activity 退化。正式法术必须由 identifier 与英文名共同唯一命中锁定 dnd5e `5.3.3` 目录，且不使用角色法术位。

```powershell
bun run src/index.ts --intake-items "path/to/raw-item.txt" `
  --vault "obsidian/dnd数据转fvttjson" `
  --fvtt-version 14 `
  --effect-profile core
```

此入口只接受 Foundry `14.364` / dnd5e `5.3.3` / `core`。单次最多 50 个物品、200,000 个 UTF-16 字符。accepted 的 Markdown 和 JSON 分别推广到 vault `input/items/` 与 `output/items/`；完整来源、IR、诊断、审查与 provider 审计保留在 `.local/item-intake-runs/<run-id>/`。恢复审查使用：

```powershell
bun run src/index.ts --resume-item-intake ".local/item-intake-runs/<run-id>" `
  --decisions ".local/item-intake-runs/<run-id>/decisions.json" `
  --vault "obsidian/dnd数据转fvttjson"
```

Item Intake 与 Monster Intake 共用 `MONSTER_INTAKE_*` 的 provider/doctor 配置、凭据隔离和本机 OAuth bridge 边界；变量名是历史兼容名称，不表示 Item 会走旧的 Monster IR。完整机械契约、已验证范围和仍待运行时验收的边界见 [`docs/item-ai-intake-v14.md`](docs/item-ai-intake-v14.md)。

## Species Intake 与累计种族模块（Foundry V14/core）

不规则种族 TXT 或人工编辑后的规范 Species Markdown 使用 `--intake-species`。它建立独立的来源证据 IR、确定性 Species Markdown、原生 race/feat package 和 accepted ledger；复杂规则可以诚实保留为 `gm-assisted` / `external-rule`，但不能伪装成空 Utility 或任意 Effect。单个 TXT 最多包含 50 个候选。

```powershell
bun run src/index.ts --intake-species "path/to/species.txt" `
  --vault "obsidian/dnd数据转fvttjson" `
  --fvtt-version 14 `
  --effect-profile core

bun run build:homebrew-species
bun run test:homebrew-species
bun run verify:homebrew-species
```

Intake 成功不会自动重建模块；`build:homebrew-species` 是独立显式步骤。任何 accepted Markdown 编辑都会使 ledger hash stale，必须再次经 `--intake-species` 审查，未更新前模块 build 会拒绝。模块只有 `species` 与 `features` 两个 Item Compendium，无 runtime JavaScript 或世界扫描。完整契约、食人魔自动化边界与验收层级见 [`docs/species-ai-intake-v14.md`](docs/species-ai-intake-v14.md)。

## AI 怪物资料整理（推荐）

第一次拿到 TXT 或格式混乱的 Markdown 时，可让 AI 负责发现生物边界并整理资料，再由现有 workflow 生成标准 Markdown 和 Actor JSON。AI 不直接写最终 Actor；检查结论与产物获取分别记录，局部问题不取消整只生物。模型返回完整可读的 Markdown 数值卡时，同一入口复用已有文本转换继续生成，分别保留原始输入、AI全文和规范来源，不要求用户切模式或追加模型请求。

配置专用环境变量，不会读取 `TRANSLATION_*` 或通用 `OPENAI_*`：

```text
# Repository/GitHub-safe default: use API key mode in committed configuration.
MONSTER_INTAKE_AUTH_MODE=api-key
MONSTER_INTAKE_API_KEY=<provider key>
MONSTER_INTAKE_BASE_URL=https://api.openai.com/v1
MONSTER_INTAKE_MODEL=<extraction model>
MONSTER_INTAKE_REVIEW_MODEL=<optional reviewer model; defaults to extraction model>
MONSTER_INTAKE_TIMEOUT_MS=60000
```

For this machine only, put the following override in the ignored local `.env`; do not commit it. The bridge owns the OAuth token.

```text
MONSTER_INTAKE_AUTH_MODE=codex-oauth
MONSTER_INTAKE_CODEX_OAUTH_BASE_URL=http://127.0.0.1:8787/v1
MONSTER_INTAKE_CODEX_OAUTH_BRIDGE_TOKEN=codex-oauth-local
MONSTER_INTAKE_MODEL=gpt-5.6-luna
MONSTER_INTAKE_CODEX_OAUTH_REASONING_EFFORT=xhigh
```

这里的 `xhigh` 对应 Codex 界面里说的 `ultra`。不填写模型时，`codex-oauth` 模式也会默认使用 `gpt-5.6-luna`；这只是旧的本机兼容桥设置，不是网页的 Companion。Companion 留空时始终使用这台电脑当前 Codex CLI 的默认模型，不会偷偷填入 Luna。

怪物Intake由AI理解内容，外部回答在接收处统一整理一次；程序产生必要技术ID和容器，不猜补来源数值。结构、引用及IR／文本到Markdown和Actor的保真问题具体列出，未映射内容保留在对应说明和导出中，不再重判AI理解以否决整只。生物入口不自动调用内容review或repair；Forge的AI内容复核继续关闭，用户显式纠错失败仍保留原答与已有Actor。生物本体和关联召唤物沿同一生成链处理，普通装备不作为遗漏。旧SourceAudit及V2原文事实恢复仅作显式离线历史入口，Item／Species各自契约保持。

默认完整IR提示词采用单一精确引文协议，程序按当前生物范围定位，历史行号／子句引用继续可读；不要求逐字段证明或空白覆盖账本。AI根据完整能力理解独立／共享法术次数，未自动支持的限定保留完整GM说明，实际不确定仍明确显示。

Forge单条生物工作台直接提取一只生物的完整资料，不再先请求AI发现；无需把纯文本标题改成Markdown标题。多只生物资料在“生物与召唤物”入口先识别、划分，已划分出的每只直接提取。目录任务仍逐文件识别，含多只的文件不会静默选第一只。CLI既有识别流程保持。

运行单只或合集：

```powershell
bun run src/index.ts `
  --intake-monsters "path/to/raw.txt" `
  --vault "obsidian/dnd数据转fvttjson" `
  --fvtt-version 14 `
  --effect-profile core
```

`--dry-run` 只检查配置并估算生物数和最大调用数，不调用AI、不推广文件。每个已生成Actor都返回可访问文件和`actorPath`；`accepted`的正式登记写入vault `input/`／`output/`，目标冲突不撤回候选。原答、标准来源与检查记录保存在`.local/intake-runs/<run-id>/`；需要继续明确选择时，可提交decisions，已有回答的本地转换不要求Key或再次调用模型。

可以用下面的命令检查 Intake。API Key 模式只检查配置；Codex OAuth 模式还会检查本机桥接服务的 `/health`：

```powershell
bun run src/index.ts --intake-doctor
```

Codex OAuth 这里指“本机 OpenAI-compatible 兼容桥接服务”，不是把 Codex OAuth token 直接当成 OpenAI Platform API key。项目默认只允许连接 `127.0.0.1`、`localhost` 或 `::1`，桥接服务没有启动时会明确失败。模型列表没有列出 `gpt-5.6-luna` 时 doctor 会给出提示，但不会武断阻止首次 Intake 请求，因为部分桥会接受模型别名但不把它列在 `/v1/models` 中。该兼容层不是本项目内置的官方 OpenAI API 认证方式。

```powershell
bun run src/index.ts `
  --resume-intake ".local/intake-runs/<run-id>" `
  --decisions ".local/intake-runs/<run-id>/decisions.json" `
  --vault "obsidian/dnd数据转fvttjson"
```

退出码：`0`表示全部accepted或仅预览，`2`表示存在needs_review且没有failed，`1`表示存在failed；退出码不撤回已返回的Actor文件。实际AI请求受当批授权额度约束，额度不限制已有回答的本地转换；生物数量、展示长度和来源记录不是取得答复后的整只生成门槛。Item／Species仍各自最多50个候选、200,000个JavaScript UTF-16字符，并固定V14/core。TXT/MD只在真实请求时发送到所选provider；凭据不进入日志。三个文本入口均不做图片/PDF OCR，生成产物也不等于任意规则已自动实现。

## 血猎手 2024 原生合集模块（Foundry v14）

`fvtt-blood-hunter-2024` 锁定 Foundry `14.364` / dnd5e `5.3.3`，提供 `classes`、`subclasses`、`features` 三个原生 Item 合集。它不依赖 Plutonium 或旧 classpack；旧 `build-blood-hunter-homebrew` 仍只生成标记为 `plutonium-side-data` 的历史 side-data，不是该模块的权威内容。

```powershell
bun run build:blood-hunter-v14 --source="C:\absolute\path\blood-hunter-2024.activities.json"
bun run test:blood-hunter-v14
bun run install:blood-hunter-v14 --apply
bun run verify:blood-hunter-v14-install
```

构建严格校验锁定源 SHA-256、94 条 coverage ledger、117 个 Activities、稳定 UUID、Advancement 引用、三个 LevelDB packs、确定性 ZIP 以及 dnd5e `5.3.3` 的 12 个官方内容 UUID。安装只允许配置后的本地 Lab，拒绝生产路径、外来同名模块、链接路径和被占用的 Pack，并在替换既有自有模块前建立恢复备份。`verify-install` 只证明安装字节和 pack 内容一致，不代表真实 Foundry 运行时或线上生产验收。

玩家从模块 `classes` 合集把“血猎手”拖入角色卡，再通过 dnd5e 原生 Advancement 升级和选择结社；已经复制到 Actor 的 Item 是快照，不会随模块更新实时同步。旧角色应使用模块中的 GM-only“血猎手 2024：角色迁移”执行 Preview、迁移副本验证，再决定是否应用原角色。完整构建、安装、迁移和自动化边界见 [`foundry-modules/fvtt-blood-hunter-2024/README.zh-CN.md`](foundry-modules/fvtt-blood-hunter-2024/README.zh-CN.md)。

## Foundry 目标世界法术解析（v14）

带法术清单的 AI Intake Actor 会保持便携：项目生成阶段只写入带来源证据的法术清单，并将状态标为 `pending`；不会写占位 Spell、世界内 UUID 或本机 Compendium UUID。把 Actor JSON 正常导入 Foundry 后，由目标世界模块扫描所有已启用且当前 GM 可读取的 Item Compendium，完成实际法术选择和水合。

当前解析器只支持 Foundry `14.364` / dnd5e `5.3.3`。匹配规则是精确身份优先：存在同名且事实一致的 2024 法术时只能选择 2024；只有不存在同键 2024 候选项时，才允许使用带明确报告的唯一 2014 回退。模糊、冲突、缺失或人工修改都会进入检查，不会部分写入。

```powershell
bun run foundry:lab spell-resolver build
bun run foundry:lab spell-resolver install --apply
bun run foundry:lab spell-resolver verify-install
bun run foundry:lab spell-resolver prepare-world --world=fvtt-v14-module-matrix --apply
```

模块源码、构建和本地安装工具统一位于 [`foundry-modules/monster-spell-resolver/`](foundry-modules/monster-spell-resolver/README.zh-CN.md)。普通使用、升级、卸载、诊断和安全边界见 [`docs/foundry-spell-resolver-install.zh-CN.md`](docs/foundry-spell-resolver-install.zh-CN.md)。模块不支持 Foundry v12、生产世界自动安装或全世界批量迁移。

## 旧纯文本命令兼容

网页的旧“纯文本 Actor”任务已经删除；请在网页使用“自动转换”入口。CLI 仍保留下面的旧命令，方便历史脚本平滑迁移。它会先在临时区域生成标准 Actor Markdown，再走当前 Actor 流程；正式写入前会一次检查所有同名输入和输出，发现任何冲突就停止，不覆盖也不自动改名。

它不会把识别失败或有警告的资料冒充正式结果，且不会在 AI Intake 不可用时偷偷改走 AI。

仅拆分纯文本资料为项目 Markdown：

```powershell
bun run src/index.ts `
  --ingest-plaintext "path/to/collection.txt" `
  --emit-dir "obsidian/dnd数据转fvttjson/input"
```

从纯文本转换为正式 Actor：

```powershell
bun run src/index.ts `
  --ingest-plaintext-actors "path/to/collection.txt" `
  --vault "obsidian/dnd数据转fvttjson" `
  --fvtt-version 14 `
  --effect-profile core
```

先用 `--dry-run` 检查识别数量和警告。`--ingest-plaintext-actors` 是兼容入口；新项目应优先使用标准 Actor Markdown 或网页“自动转换”。

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

`web:api` / `web:start` 默认只监听 `127.0.0.1:5174`。非回环或反向代理公开模式必须显式启用并配置服务器端 bearer token；浏览器不能提交 VPS 凭据。Web/API 支持上传 Markdown、单文件转换、批量怪物 job、下载 ZIP、来源核对及受限的 workspace path 模式。完整部署、鉴权、可信代理与资源上限见 [`docs/web-deployment.md`](docs/web-deployment.md)；三种 AI 连接方式和 Windows Companion 见 [`docs/web-ai-connections.md`](docs/web-ai-connections.md)。

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
- 来源驱动的 DAE `isDamaged` 已通过 DAE 14.0.12 + MIDI-QOL 14.0.9 的历史实机移除与 core 保留对照；当前生成目标已锁定 MIDI-QOL 14.0.11，但这项旧证据尚未在新版本重新执行。独立 Item v14 已通过导入、AC、两项 Activity、倒地、次数、专注及无文件弹框导出回读。完整生产模组共存仍为 Partial。当前分层结论见 [`docs/acceptance/current-support-matrix.md`](docs/acceptance/current-support-matrix.md)。

## 更多资料

- [`docs/manual.md`](docs/manual.md)：以 v12 为主的旧版详细手册；涉及版本时以本 README 和 `AGENTS.md` 为准，也包含 AI Intake、便携施法者和兼容纯文本命令说明。
- [`docs/generated-actor-verification.md`](docs/generated-actor-verification.md)：生成 Actor 的强制语义验收清单。
- [`tools/foundry-ops/README.zh-CN.md`](tools/foundry-ops/README.zh-CN.md)：Foundry 本地测试、离线审计、生产只读盘点的统一入口、权限分类与外部配置说明。
- [`scripts/foundry-lab/README.md`](scripts/foundry-lab/README.md)：旧 Foundry Lab 命令的兼容说明和详细操作手册。
- [`docs/acceptance/foundry-v14-module-compatibility.md`](docs/acceptance/foundry-v14-module-compatibility.md)：模组矩阵、已知冲突和生产世界抽样证据。

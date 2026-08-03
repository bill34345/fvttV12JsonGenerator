# Foundry VTT NPC 导入器使用手册

一个将 Obsidian NPC 笔记转换为 Foundry VTT 可导入 JSON 的命令行工具。支持中文笔记格式和英文 Bestiary，适配 Foundry VTT v12 + dnd5e 4.3.x。

---

## 场景 1：5 分钟快速上手

**目标**：把一份写好的 NPC 笔记转换成 FVTT 可导入的 JSON 文件。

### 第一步：安装 Bun

Bun 是这个工具的运行环境，类似 Node.js 但更快。

```powershell
# Windows PowerShell（用管理员打开）
powershell -c "irm bun.sh/install.ps1 | iex"
```

macOS / Linux 用户：
```bash
curl -fsSL https://bun.sh/install | bash
```

装好后打开终端，验证：
```bash
bun --version
```

### 第二步：准备数据文件

在 `data/` 目录下放三个文件（缺一不可）：

| 文件名 | 从哪来 | 干什么用 |
|--------|--------|----------|
| `cn.json` | dnd5e 中文汉化包 | 中文属性名 → 英文缩写（如"力量"→"str"） |
| `spells.ldb` | Foundry 的 `packs/spells` | 法术名 → UUID，自动给法术加链接 |
| `golden-master.json` | **自己导出** | 生成 JSON 的模板基准 |

`golden-master.json` 获取方法：
1. 打开 Foundry VTT（需要 dnd5e 4.3.x）
2. 创建一个空白 NPC Actor，命名为 `Adult Red Dragon`
3. 右键 → **Export Data** → 保存为 JSON
4. 改名为 `golden-master.json` 放入 `data/`

### 第三步：转换一份笔记

```bash
bun run src/index.ts templates/npc-example.md -o output/dragon.json
```

成功会看到：
```
Successfully generated output/dragon.json
Name: 成年红龙
Items: 5
```

### 第四步：导入 Foundry VTT

1. 打开 Foundry VTT
2. 创建或选择一个 NPC Actor
3. 右键 → **Import Data** → 选 `output/dragon.json`
4. 完成

---

## 场景 2：写你的第一份 NPC 笔记

**目标**：掌握笔记格式，自己写一份完整的 NPC。

### 基础格式

笔记文件是 Markdown，分两部分：**YAML 头**（元数据）和**正文**（背景故事）。

```markdown
---
名称: 暗影豹
类型: npc
挑战等级: 0
---

# 背景故事
这种魔法生物生活在阴影位面的边缘...
```

### 所有字段说明

| 字段 | 怎么填 | 例子 |
|------|--------|------|
| `名称` | 怪物名字 | `暗影豹` |
| `类型` | 填 `npc` | `npc` |
| `体型` | 超巨型/巨型/大型/中型/小型/微型 | `大型` |
| `生物类型` | 龙类/类人/野兽/etc | `异界生物` |
| `阵营` | 守序善良/中立邪恶... | `混乱中立` |
| `挑战等级` | 数字 | `5` |
| `力量` `敏捷` `体质` `智力` `感知` `魅力` | 属性值（不用填修正值，程序自动算） | `18` `14` `16` `10` `12` `8` |
| `生命值` | 格式：`256 (19d12+133)` | `HP（骰子公式）` 形式，自动拆出数值和公式 |
| `护甲等级` | 格式：`19 (天生护甲)` | 数字 + 括号里写护甲类型 |
| `速度` | 格式：`40尺, 飞行80尺, 攀爬30尺` | 多个速度用逗号分隔 |
| `豁免熟练` | 格式：`[敏捷, 体质, 感知]` | 哪些豁免有熟练 |
| `技能` | 格式：`{ 察觉: 专精, 隐匿: 熟练 }` | 技能名: 等级 |
| `伤害免疫` | 格式：`[火焰, 毒素]` | 中括号，逗号分隔 |
| `状态免疫` | 格式：`[恐慌, 魅惑]` | 同上 |
| `感官` | 格式：`{ 盲视: 60尺, 被动察觉: 15 }` | 特殊感官用花括号 |
| `语言` | 格式：`[通用语, 龙语]` | 同上 |
| `施法` | 格式：`[火球术, 侦测魔法]` | 会放的法术列在这里 |

### 动作怎么写

动作是最重要的部分，支持自然语言格式。

#### 1. 普通攻击（近战/远程）

```
- 啮咬 [近战武器攻击]: +14命中, 触及10尺, 2d10+8穿刺 + 2d6火焰
```

格式：`名称 [攻击类型]: +命中, 范围, 伤害`

攻击类型可选：`近战武器攻击`、`远程武器攻击`

#### 2. 豁免能力

```
- 骇人威仪: { 豁免: DC19感知, 失败: 恐慌, 成功: 免疫 }
```

格式：`名称: { 豁免: DC难度, 失败: 效果, 成功: 效果 }`

#### 3. 充能能力（5-6 充能）

```
- 火焰吐息 [充能5-6]: { 豁免: DC21敏捷, 失败: 18d6火焰, 成功: 减半 }
```

格式：`名称 [充能X-Y]: { 豁免: DC难度, 失败: 伤害, 成功: 减半 }`

#### 4. 传奇动作

```yaml
传奇动作:
  - 侦测 (消耗1): 龙进行一次感知（察觉）检定
  - 尾击 (消耗1): 龙进行一次尾击
```

传奇动作格式：`名称 (消耗N): 描述`

### 完整示例

```markdown
---
名称: 暗影猎手
类型: npc
体型: 中型
生物类型: 异界生物
阵营: 中立邪恶
挑战等级: 3
经验值: 200

能力:
  力量: 14
  敏捷: 16
  体质: 12
  智力: 10
  感知: 14
  魅力: 11

生命值: 45 (7d8+14)
护甲等级: 15 (皮甲)
速度: 40尺

豁免熟练: [敏捷, 感知]
技能:
  察觉: 熟练
  隐匿: 专精
伤害免疫: [黯蚀]
状态免疫: [目眩]
感官:
  黑暗视觉: 60尺
  被动察觉: 13
语言: [通用语, 精灵语]

动作:
  - 多重攻击: 暗影猎手进行两次近战攻击
  - 暗影打击 [近战武器攻击]: +5命中, 触及5尺, 2d6+3挥砍 + 1d6黯蚀
  - 恐惧领域 [范围]: 30尺范围内生物DC12感知豁免，失败视为震慑1轮

传奇动作:
  - 暗影步 (消耗1): 暗影猎手瞬间移动最多30尺
  - 斩首 (消耗2): +5命中, 触及5尺, 4d6+3挥砍
---
# 背景故事
暗影猎手是穿梭于物质世界与阴影位面之间的杀手...
```

---

## 场景 3：用 Obsidian 管理大量 NPC

**目标**：在 Obsidian 库中写笔记，批量生成 FVTT JSON，自动跟踪哪些改过。

### 建立目录结构

在 Obsidian 仓库下运行同步命令，它会自动建立目录：

```bash
bun run src/index.ts --sync --vault "你的Obsidian仓库路径"
```

首次运行后，仓库下会多出这些文件夹：

| 文件夹 | 放什么 |
|--------|--------|
| `input/` | 你的 NPC `.md` 笔记 |
| `middle/` | plaintext collection 规范化后的中间 Markdown |
| `output/` | 生成的 FVTT JSON 文件 |
| `output_backup/` | JSON 被覆盖前的备份 |
| `examples/` | 示例模板 |

对于 raw plaintext collections，工具会先把规范化后的中间 Markdown 写入 `middle/`。Dual-artifact 命令会再把这些中间文件复制到 `input/`，并通过正常同步流程在 `output/` 生成最终 JSON。这样保留了可审计的中间阶段，同时维持 Obsidian `input/`/`output/` 合约。

> 上述 plaintext collection 是 Legacy 规则流程，只适合已有兼容格式。第一次收到 TXT 或乱 Markdown 时，推荐使用下面的 AI Intake；Legacy 识别 0 只怪物会失败，其格式 audit 不能当作来源语义验收。

### 增量同步原理

工具会记住每个文件的状态（MD5 hash）：

| 情况 | 怎么处理 |
|------|----------|
| 新增 `.md` | 生成对应 `.json` |
| 修改过的 `.md` | 重新生成，旧 `.json` 移到 `output_backup/` |
| 没改过的 `.md` | 跳过，不重复工作 |

### 常用命令

```bash
# 基本同步
bun run src/index.ts --sync --vault "obsidian/dnd数据转fvttjson"

# 同步完顺便清理旧备份
bun run src/index.ts --sync --vault "obsidian/dnd数据转fvttjson" --clear-backup

# 单次转换（不需要 Obsidian）
bun run src/index.ts "path/to/npc.md" -o "path/to/output.json"
```

---

## 场景 3A：把 TXT 或乱 Markdown 整理为项目格式

**目标**：输入未经标记的怪物/NPC 文本，由 AI 提取带原文证据的结构，再让项目 workflow 生成标准 Markdown 和 Actor JSON。

先配置独立的 Intake provider：

```bash
MONSTER_INTAKE_AUTH_MODE=api-key
MONSTER_INTAKE_API_KEY=<provider key>
MONSTER_INTAKE_BASE_URL=https://api.openai.com/v1
MONSTER_INTAKE_MODEL=<extraction model>
MONSTER_INTAKE_REVIEW_MODEL=<optional reviewer model>
MONSTER_INTAKE_TIMEOUT_MS=60000
MONSTER_INTAKE_REPAIR_TIMEOUT_MS=180000

# 可选：本机 Codex OAuth 兼容桥
MONSTER_INTAKE_AUTH_MODE=codex-oauth
MONSTER_INTAKE_CODEX_OAUTH_BASE_URL=http://127.0.0.1:8787/v1
MONSTER_INTAKE_CODEX_OAUTH_BRIDGE_TOKEN=codex-oauth-local
MONSTER_INTAKE_MODEL=gpt-5.6-luna
MONSTER_INTAKE_CODEX_OAUTH_REASONING_EFFORT=xhigh
```

这些变量不会回退到翻译服务的 `TRANSLATION_*` 或通用 `OPENAI_*`。运行前可做零网络预检：

```powershell
bun run src/index.ts --intake-monsters "path/to/raw.txt" --vault "obsidian/dnd数据转fvttjson" --dry-run
```

连接检查：

```powershell
bun run src/index.ts --intake-doctor
```

`codex-oauth` 模式默认使用 `gpt-5.6-luna`。这里的 `xhigh` 对应 Codex 界面里的 `ultra`。模式只连接本机 OpenAI-compatible 兼容桥，OAuth 凭据由桥接服务自己保管；本项目不会读取、记录或把 OAuth token 当作普通 API key 发送。桥接服务没有运行时 doctor 会失败；如果 `/v1/models` 没列出这个模型，doctor 会提示，但仍允许首次 Intake 请求验证模型别名。

正式运行：

```powershell
bun run src/index.ts `
  --intake-monsters "path/to/raw.txt" `
  --vault "obsidian/dnd数据转fvttjson" `
  --fvtt-version 14 `
  --effect-profile core
```

流水线会依次做怪物边界发现、evidence-backed IR、确定性校验、标准 Markdown 渲染、现有 parser/generator 生成、IR/Markdown/Actor 核对和独立 AI review。AI 不直接生成或修补最终 JSON。

涉及共享资源、可变消费、下一次命中、阶段变化、容量、选择池、复合状态机、区域生命周期或跨 Actor 结算时，请参阅[《非常规怪物机制：TXT → Markdown → Foundry JSON 示例手册》](monster-mechanics-txt-to-json-examples.zh-CN.md)。当前 Intake IR 尚未自动生成手册中的高级 `资源机制`／`行为机制`契约，因此这些能力必须在标准 Markdown 审阅阶段补齐，不能仅凭候选 JSON 通过就视为完成。

- `accepted`：标准 Markdown 进入 `input/`，正式 Actor JSON 进入 `output/`；CLI 退出 `0`。
- `needs_review`：保留 source、IR、候选 Markdown/Actor 和报告，但不把候选 Actor 当正式 Web 下载；CLI 退出 `2`。
- `failed`：存在 provider/执行失败；CLI 退出 `1`。

需要人工确认时，复制 `decisions.template.json` 为 decisions 文件，按 issue 选择 `select`、`set`、`preserve-literal` 或允许的 `exclude`，然后恢复原 run：

```powershell
bun run src/index.ts `
  --resume-intake ".local/intake-runs/<run-id>" `
  --decisions ".local/intake-runs/<run-id>/decisions.json" `
  --vault "obsidian/dnd数据转fvttjson"
```

恢复会重新执行确定性校验、Markdown 渲染、项目生成和独立 review，不会从旧候选 JSON 继续打补丁。提交的 TXT/MD 会发送给配置的 AI provider；首版只支持怪物/NPC，最多 50 只、200,000 个 UTF-16 字符，不支持图片/PDF OCR 或 Item。

---

## 场景 3B：把便携施法者水合为目标世界原生法术

AI Intake 生成的施法者 Actor 在项目输出阶段应保持 `pending`。这个状态不是失败：它表示来源法术清单已经通过项目核对，但真正的 Spell 文档必须等 Actor 进入目标 Foundry 世界后，依据该世界实际启用的法术来源解析。

使用顺序：

1. 用项目 CLI 或 AI Intake 生成 Foundry v14 Actor JSON；不要手工添加 Spell 或 Compendium UUID。
2. 在 Foundry `14.364` / dnd5e `5.3.3` 世界中启用目标世界法术解析器。
3. 通过 Foundry 的普通 Actor JSON 导入功能导入 Actor。
4. 以 GM 身份检查 Actor 标题栏中的解析状态；必要时选择“解析或重新解析法术”。
5. 如果出现歧义或人工修改，明确选择来源、保留人工修改、用生成内容覆盖，或取消。取消和关闭窗口都不得修改 Actor。
6. 状态变为“已水合”后，打开缓存 Spell 和 Cast Activity，实际检查攻击、豁免、次数、目标和文字限制。

模块会自动扫描全部已启用、可读的 Item Compendium，而不是维护固定包白名单。2024 精确候选优先；只有没有同键 2024 候选项时才允许唯一 2014 回退，并在 Actor 状态和报告中显式标记。水合以 Actor 为单位原子执行，任何缺失、歧义、冲突或写入失败都会阻止部分成功。

完整安装和诊断步骤见 [`foundry-spell-resolver-install.zh-CN.md`](foundry-spell-resolver-install.zh-CN.md)。当前不支持 v12 解析器、OCR/PDF Intake、生产世界自动部署或全世界批量迁移。

---

## 场景 4：把已有 JSON 补成中文

**目标**：你有一批从其他地方来的 FVTT NPC JSON，想把字段补成中文。

把 JSON 放到 `data/need_tran/` 目录，然后：

```bash
bun run src/index.ts --translate-json
```

**它会：**
- 扫描 JSON 里所有文本字段
- 已经有中文的跳过
- 翻译缺失的字段（通过 AI API）
- 直接**原地修改**原文件

**行为细节：**
- 角色名称 → `中文名 (English)` 格式
- 动作/特性名称 → 同样双语格式
- 动作描述 → 翻成中文写进去
- 翻译失败（如 API 超时）→ 保留英文原文，不阻塞其他字段

### 配置翻译

翻译需要 AI API 支持。创建 `.env` 文件：

```bash
TRANSLATION_API_KEY=sk-your-key
TRANSLATION_BASE_URL=https://api.openai.com/v1
TRANSLATION_MODEL=gpt-4o-mini
TRANSLATION_CACHE_FILE=.cache/translation-cache.json
TRANSLATION_TIMEOUT_MS=15000
```

**不用 AI 行不行？** 可以。工具不会主动调用翻译服务，流程仍然正常生成 JSON，只是字段保持原文。

---

## 场景 5：导入英文怪物（Bestiary）

**目标**：把英文 D&D 怪物数据转成 FVTT JSON，同时生成中文动作描述。

### 怎么用

在笔记头部加一行 `layout: creature` 即可：

```markdown
---
layout: creature
name: Adult Red Dragon
---

# Description
The most powerful of the chromatic dragons...
```

运行：
```bash
bun run src/index.ts "path/to/bestiary.md" -o "output/dragon.json"
```

### 自动双语输出

工具会：
1. 名称 → `成年红龙Adult Red Dragon`（中文在前）
2. 动作描述 → 尽力翻译成中文（依赖 AI API）
3. 动作名称 → 保留英文（程序无法翻译名称）

### 没有 AI API 怎么办

英文 bestiary 仍然可以转换，只是动作描述保留英文原文，不影响 FVTT 导入。

---

## 场景 6：常见问题

### 导入后没有图片

目前工具不处理图片。请在 Foundry 中手动设置：
1. 导入完成后，选中 Actor
2. 在左侧 Token 面板设置头像
3. 或者在笔记 YAML 头加 `img: "path/to/image.png"`（如果你的笔记支持）

### 法术没有链接

检查 `data/spells.ldb` 是否包含这个法术。

- **有法术**：自动生成 UUID 链接，FVTT 打开后点击法术名可以跳转
- **没有法术**：生成一个未链接的 Item，名字对但点不了

### 报错 "Invalid damage format"

伤害公式格式不对。正确格式：

```
2d6+5挥砍          ✓
2d6+5              ✓
2d10+8穿刺 + 2d6火焰  ✓（多段伤害用 + 连接）
```

常见错误：
```
2d6 + 5        ✗ 有空格
2d6-5          ✗ 不支持负伤害
```

### 报错 "Cannot find field: XXX"

笔记里用了工具不认识的字段名。请对照场景 2 的字段表检查。

常见情况：
- 用了英文字段名（如 `Strength` 而不是 `力量`）
- 字段名拼写错误
- 用了不支持的字段（如 `特殊能力` 目前不支持）

### 报错 "golden-master.json not found"

`data/` 目录下缺少 `golden-master.json`。按场景 1 第二步重新获取。

### 所有 JSON 生成出来都是空的

很可能是 `cn.json` 格式不对或缺失。请确认 `data/cn.json` 是 dnd5e 中文汉化包的完整版本。

---

## 附录：字段名中英对照

| 中文 | 英文 |
|------|------|
| 力量 | Strength / str |
| 敏捷 | Dexterity / dex |
| 体质 | Constitution / con |
| 智力 | Intelligence / int |
| 感知 | Wisdom / wis |
| 魅力 | Charisma / cha |
| 生命值 | HP / hitPoints |
| 护甲等级 | AC / armorClass |
| 挑战等级 | CR / challenge |
| 近战武器攻击 | Melee Weapon Attack |
| 远程武器攻击 | Ranged Weapon Attack |

## Foundry v14 Item artwork

Name-driven artwork is opt-in and restricted to the locked Foundry `14.364` /
dnd5e `5.3.3` target:

```bash
bun run src/index.ts "obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md" \
  --output "obsidian/dnd数据转fvttjson/output/nightgaunt__夜魇.json" \
  --fvtt-version 14 \
  --effect-profile core \
  --icon-mode safe
```

The resolver uses only catalogued Foundry core and dnd5e artwork. It preserves
known existing artwork, prefers exact Compendium names, requires both lexical
and structured evidence for non-exact semantic matches, and otherwise uses the
dnd5e type default. Its decision is written to `*.icon-review.json`; fallback
entries are audit data and do not turn an otherwise accepted document into
`needs_review`.

Use `--icon-overrides <json-path>` for a version-locked external override file.
The browser cannot submit a filesystem override path; Web deployment may set
`FVTT_V14_ICON_OVERRIDES` on the server. `--icon-mode safe` fails closed for
v12/v13.

Render a local review gallery without copying Foundry artwork:

```bash
bun run review:icons:v14 --report "path/to/actor.icon-review.json" --output ".local/icon-review/gallery.html"
```

## Item Text Workflows

Item split only writes normalized item Markdown to `vault/middle/items`:

```bash
bun run src/index.ts --ingest-items "obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md" --vault "obsidian/dnd数据转fvttjson"
```

Item dual artifact writes `middle/items`, promotes Markdown to `input/items`, and generates final Item JSON under `output/items`. The same workflow accepts `--fvtt-version 12`, `13`, or `14` and the matching effect profile:

```bash
bun run src/index.ts --ingest-items-json "obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md" --vault "obsidian/dnd数据转fvttjson" --fvtt-version 14 --effect-profile core
```

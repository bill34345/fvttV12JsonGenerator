# Foundry VTT NPC Importer (Obsidian → dnd5e)

一个强大的命令行工具，用于将 Obsidian 中的 NPC 笔记（YAML Frontmatter + Markdown）转换为 Foundry VTT (v12 + dnd5e 4.3.x) 可导入的 JSON 格式。

## ✨ 特性

- **中文友好**：直接使用中文属性名（如 `力量`、`敏捷`、`动作`）。
- **智能解析**：
  - 自动识别自然语言动作（如 `啮咬 [近战武器攻击]: +14命中, 触及10尺, 2d10+8穿刺`）。
  - 支持 `spells.ldb` 二进制提取，自动链接法术 UUID。
  - 支持繁简自动转换（输入繁体自动转为简体匹配）。
- **高精度**：基于 "Golden Master" 模板生成，确保系统数据结构完美兼容 dnd5e 4.3.x。
- **完整覆盖**：支持属性、技能、豁免、抗性/免疫、感官、语言、动作、传奇动作、施法等。

## 📦 安装与配置

### 1. 环境准备
本项目基于 [Bun](https://bun.sh/) 运行时开发。请先安装 Bun：
```bash
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS / Linux
curl -fsSL https://bun.sh/install | bash
```

### 2. 获取代码并安装依赖
```bash
# 进入项目目录
cd I:\OpenCode\fvttV12JsonGenerator

# 安装依赖
bun install
```

### 3. 数据准备 (关键!)
工具需要依赖 Foundry VTT 的原始数据来保证转换准确性。请确保 `data/` 目录下有以下文件：

| 文件名 | 来源 | 用途 |
|--------|------|------|
| `cn.json` | dnd5e 中文汉化包 | 用于中英字段映射 (如 `力量` -> `str`) |
| `spells.ldb` | Foundry `packs/spells` | 用于提取法术 UUID (支持二进制片段) |
| `golden-master.json` | **必须**从 Foundry 导出 | 用于作为生成的基准模板 |

**如何获取 `golden-master.json` (必须):**
1. 打开 Foundry VTT (dnd5e 4.3.x)。
2. 创建一个新的 NPC Actor，命名为 `Adult Red Dragon` (成年红龙)。
3. (可选) 手动填入一些标准数值，确保数据结构完整。
4. 右键点击该 Actor -> **Export Data** -> **Export to JSON**。
5. 将下载的文件重命名为 `golden-master.json` 并放入 `data/` 目录。

## 🚀 使用方法

### 基本命令
```bash
bun run src/index.ts <输入文件> [-o 输出文件]
```

### 英文 Bestiary 输入（自动识别）

当输入文件 frontmatter 包含 `layout: creature` 时，会自动走英文 bestiary 解析分支；未命中该标记时，仍走现有中文模板分支。

```yaml
---
layout: creature
name: Adult Red Dragon
---
```

```bash
# 英文 bestiary 示例（仓库内样本）
bun run src/index.ts src/core/parser/__tests__/fixtures/english-bestiary-adult-red-dragon.md -o output/english-dragon.json
```

英文路线会在可用时输出双语名称与中文动作描述，同时保持现有中文工作流不变。

### 英文翻译配置（OpenAI-compatible）

英文路线的翻译配置支持 `TRANSLATION_*` 优先，`OPENAI_*` 作为回退：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TRANSLATION_API_KEY` / `OPENAI_API_KEY` | API Key（至少提供其一） | 空（未配置则不发起翻译请求） |
| `TRANSLATION_BASE_URL` / `OPENAI_BASE_URL` | OpenAI 兼容接口地址 | `https://api.openai.com/v1` |
| `TRANSLATION_MODEL` / `OPENAI_MODEL` | 模型名 | `gpt-4o-mini` |
| `TRANSLATION_CACHE_FILE` | 翻译缓存文件路径 | `.cache/translation-cache.json` |
| `TRANSLATION_TIMEOUT_MS` | 单次翻译超时（毫秒） | `15000` |

`.env` 示例：

```bash
TRANSLATION_API_KEY=sk-xxxx
TRANSLATION_BASE_URL=https://your-openai-compatible-endpoint/v1
TRANSLATION_MODEL=gpt-4o-mini
TRANSLATION_CACHE_FILE=.cache/translation-cache.json
TRANSLATION_TIMEOUT_MS=15000
```

### 英文输出规则、缓存与 fail-soft

- 名称双语规则：`中文English`（无空格）。
- 若未获得中文翻译（或翻译结果不含中文），名称回退为原英文名称。
- 动作描述翻译写入 `item.system.description.value`；失败时保留英文原文。
- 翻译失败（如超时/限流/上游错误）仅记录 warning，不阻塞整次转换。
- 未配置 API Key 时不会调用翻译服务，流程仍正常生成 JSON。
- 翻译缓存按文本 + 上下文 + provider/model/baseURL 生成 key，命中后直接复用结果。

### JSON 原地翻译（`data/need_tran` 增量）

当你已经有一批 Foundry JSON（例如 `data/need_tran`）并希望把未翻译字段补齐为中文时，可使用原地翻译模式：

```bash
bun run src/index.ts --translate-json
```

自定义目录：

```bash
bun run src/index.ts --translate-json --translate-dir "data/need_tran"
```

行为说明：
- 直接修改原 `.json` 文件（in-place）。
- 每次运行都会先扫描字段：已包含中文的字段会自动跳过。
- 仅翻译常见可读文本字段（如 `name`、`description.value`、`chatFlavor`、部分 `effects.description`）。
- `角色名称`、`动作/特性名称`、`法术名称` 会输出为双语格式：`中文 (English)`（中文在前）。
- 若名称原本只有中文，会自动反向补英文并转成同样的双语格式。
- 自动复用翻译缓存（`TRANSLATION_CACHE_FILE`），避免重复请求。
- 若出现单条翻译失败，会保留原文并继续处理其他字段。

### Obsidian 批量同步（增量）

当你在 Obsidian 库内维护大量 NPC 笔记时，推荐使用同步模式：

```bash
bun run src/index.ts --sync --vault "obsidian/dnd数据转fvttjson"
```

同步模式会自动在 vault 下维护以下目录/文件：

| 路径 | 用途 |
|------|------|
| `input/` | 放待转换的 `.md` 笔记（支持子目录） |
| `examples/` | 示例模板（首次会自动放入 `npc-example.md`） |
| `output/` | 生成的 `.json` 输出 |
| `output_backup/` | 同名输出被覆盖前的备份 |
| `.fvtt-sync-manifest.json` | 增量状态文件（记录 hash、状态、输出路径） |

增量规则：
- 新增 `.md`：会生成对应 `.json`
- 修改过的 `.md`：会重新生成，并把旧 `.json` 先移到 `output_backup/`
- 未变化的 `.md`：跳过处理

清理备份目录：

```bash
bun run src/index.ts --sync --vault "obsidian/dnd数据转fvttjson" --clear-backup
```

### 示例
```bash
# 将模板转换为 JSON
bun run src/index.ts templates/npc-example.md -o output/dragon.json
```

成功后，你会看到：
```
Successfully generated output/dragon.json
Name: 成年红龙
Items: 5
```

### 导入到 Foundry VTT
1. 打开 Foundry VTT。
2. 创建一个新的 NPC Actor（或者选择一个现有的）。
3. 右键点击该 Actor -> **Import Data**。
4. 选择生成的 `output/dragon.json` 文件。
5. 导入完成！所有属性、动作、法术应该都已正确填充。

## 📝 笔记格式规范 (Obsidian)

请参考 `templates/npc-example.md`。文件必须包含 **YAML Frontmatter** 和 **Markdown 正文**。

### 基础结构
```yaml
---
名称: 成年红龙
类型: npc
挑战等级: 17
...
---
# 背景故事
这里是 Markdown 格式的传记内容...
```

### 支持的字段 (YAML)

| 分类 | 字段名示例 | 格式说明 |
|------|------------|----------|
| **基础** | 名称, 类型, 阵营, 生物类型, 体型 | 文本 |
| **属性** | 力量, 敏捷, 体质... | 数字 (如 `27`) |
| **核心** | 生命值 | `256 (19d12+133)` (自动解析公式) |
| **核心** | 护甲等级 | `19 (天生护甲)` (自动识别类型) |
| **核心** | 速度 | `40尺, 飞行80尺` (自动解析) |
| **技能** | 技能 | `{ 察觉: 专精, 隐匿: 熟练 }` |
| **豁免** | 豁免熟练 | `[敏捷, 体质, 感知, 魅力]` |
| **抗性** | 伤害免疫, 状态免疫 | `[火焰]`, `[恐慌]` |
| **感知** | 感官 | `{ 盲视: 60尺, 被动察觉: 23 }` |
| **动作** | 动作 | 列表 (见下文) |

### 动作格式 (自然语言)

**1. 近战/远程攻击**
```yaml
- 啮咬 [近战武器攻击]: +14命中, 触及10尺, 2d10+8穿刺 + 2d6火焰
```
*   格式：`名称 [类型]: +N命中, 范围, 伤害公式+类型`

**2. 豁免/特质**
```yaml
- 骇人威仪: { 豁免: DC19感知, 失败: 恐慌, 成功: 免疫 }
```

**3. 充能能力**
```yaml
- 火焰吐息 [充能5-6]: { 豁免: DC21敏捷, 失败: 18d6火焰, 成功: 减半 }
```

**4. 传奇动作**
```yaml
传奇动作:
  - 侦测 (消耗1): 龙进行一次感知（察觉）检定
```

## 🛠️ 开发与测试

```bash
# 运行单元测试
bun test

# 运行覆盖率检查
bun test --coverage
```

## ⚠️ 常见问题

**Q: 导入后没有图片？**
A: 目前版本不处理图片路径。请在 Foundry 中手动设置 Token 和 头像，或者确保源数据中包含 `img` 字段（虽然目前主要通过默认图标处理）。

**Q: 法术没有链接？**
A: 请检查 `data/spells.ldb` 是否包含该法术。如果法术名无法在数据库中找到，工具会生成一个未链接 of Item。

**Q: 报错 "Invalid damage format"？**
A: 请检查动作描述中的伤害公式是否符合 `2d6+5类型` 的格式。

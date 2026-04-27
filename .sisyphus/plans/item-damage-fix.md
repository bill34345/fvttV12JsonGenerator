# 物品生成管道修复计划

## TL;DR

> **目标**: 修复物品markdown拆分和伤害公式解析，使生成的JSON可以被Foundry正确导入
>
> **核心问题**:
> 1. 伤害公式中的属性引用（`你力量调整值的`）未被转换为 Foundry 格式（`@str`）
> 2. 模板内容被错误拆分成物品文件
> 3. Frontmatter 缺少物品名称字段
>
> **修复后预期**: `2d6 + 2 + 你力量调整值的力场伤害` → `parts: [{ formula: "2d6+2+@str", type: "force" }]`

---

## Context

### 源文件结构
文件: `obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md`

```
行1-47:   # 物品模版 / ## 物品名（English Name）  <- 模板内容，应跳过
行48:     # 下面是两个示例物品                      <- 标记，应跳过
行49-87:  ## 三祷之坠（Jewel of Three Prayers）   <- 物品1（有3个阶段）
行89-103: ## 骑士之盾（Shield of the Cavalier）   <- 物品2（无阶段）
```

### 问题示例：骑士之盾的伤害公式

**源文本** (line 97):
```
若命中，盾牌会对目标造成 2d6 + 2 + 你力量调整值的力场伤害。
```

**当前错误输出** (`temp-items/shield-e2e-out.json` line 91):
```json
"formula": "2d6 + 2 + 你力量调整值的"
```

**期望 Foundry 格式**:
```json
"formula": "2d6+2+@str"
```

---

## Work Objectives

### Must Have
1. ✅ 修复 `items.ts` - frontmatter 包含 `名称` 和 `英文名`
2. ✅ 修复 `items.ts` - 跳过模板标题 `# 物品模版` 和 `# 下面是两个示例物品`
3. ✅ 修复 `item-parser.ts` - 正确解析属性引用伤害公式
4. ✅ 验证拆分结果正确（模板内容不出现）

### Must NOT Have
- 不修改 NPC 相关代码（只修改物品相关）
- 不添加 AI-slop 注释或过度工程化

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **Automated tests**: Tests-after
- **Framework**: bun test

### QA Policy
- 每个修复必须通过 `bun test` 验证
- E2E 验证：`bun run src/index.ts --ingest-items "obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md" -o "obsidian/dnd数据转fvttjson/output/items"`
- 检查生成的文件不包含模板内容
- 检查伤害公式使用 Foundry 属性引用格式

---

## TODOs

- [x] 1. 修复 items.ts - frontmatter 包含名称

  **What to do**:
  - 修改 `ItemsIngestionWorkflow.ingest()` 方法中的 frontmatter 生成逻辑
  - 将 `名称` 和 `英文名` 添加到 frontmatter

  **当前代码** (items.ts line 31):
  ```typescript
  const frontmatter = '---\nlayout: item\n---\n';
  ```

  **修复后**:
  ```typescript
  const frontmatter = '---\nlayout: item\n名称: ${block.chineseName}\n英文名: ${block.englishName}\n---\n';
  ```

  **References**:
  - `src/core/ingest/items.ts:31` - frontmatter 生成位置
  - `src/core/parser/item-parser.ts:83-89` - ItemParser.parseName() 如何读取名称

  **QA Scenarios**:

  \`\`\`
  Scenario: Frontmatter contains item names
    Tool: Bash
    Preconditions: 已运行 --ingest-items 生成物品文件
    Steps:
      1. Read generated file: obsidian/dnd数据转fvttjson/output/items/*三祷*__*.md
      2. Check frontmatter contains "名称: 三祷之坠"
      3. Check frontmatter contains "英文名: Jewel of Three Prayers"
    Expected Result: Frontmatter has both 名称 and 英文名 fields
    Failure Indicators: "layout: item" only, missing name fields
    Evidence: .sisyphus/evidence/task-1-frontmatter.md

  Scenario: Template content excluded
    Tool: Bash  
    Preconditions: 已运行 --ingest-items
    Steps:
      1. List all generated .md files in obsidian/dnd数据转fvttjson/output/items/
      2. Verify no file named "english-name__物品名*.md" (template)
    Expected Result: No template files generated
    Failure Indicators: Files like "english-name__物品名 (Dormant State).md" exist
    Evidence: .sisyphus/evidence/task-1-template-excluded.md
  \`\`\`

  **Commit**: YES
  - Message: `fix(items): add name fields to frontmatter`
  - Files: `src/core/ingest/items.ts`

---

- [x] 2. 修复 items.ts - 跳过模板标题

  **What to do**:
  - 在 `splitItemCollection()` 中添加逻辑，跳过以下内容：
    - `# 物品模版` 标题（行1-2）
    - `# 下面是两个示例物品` 标题（行48）
    - `## 物品名（English Name）` 标题（行3）- 这是模板示例

  **如何检测模板标题**:
  - `# 物品模版` - 一级标题，直接跳过
  - `# 下面是两个示例物品` - 一级标题，作为分隔标记
  - `## 物品名（English Name）` - 二级标题，是模板示例

  **实现方案**:
  在 `splitItemCollection()` 的匹配循环中，添加跳过逻辑：

  ```typescript
  // Skip template section headings
  if (heading.includes('物品模版') || 
      heading.includes('下面是两个示例物品') ||
      heading === '物品名（English Name）') {
    continue;
  }
  ```

  **References**:
  - `src/core/ingest/items.ts:185-229` - splitItemCollection() 完整逻辑
  - `obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md` - 源文件结构

  **QA Scenarios**:

  \`\`\`
  Scenario: Template headings are skipped during splitting
    Tool: Bash
    Preconditions: 已运行 --ingest-items
    Steps:
      1. Count generated .md files in output/items/
      2. Expected: 7 files (三祷之坠x3 stages + 骑士之盾x1 + 3个temp files + 1个template? 需要确认)
      3. Actually expected: 4 files (三祷之坠 Dormant + Awakened + Exalted + 骑士之盾)
      4. Verify NO file contains template content ("这里写物品的总描述")
    Expected Result: Only actual item content, no template text
    Failure Indicators: Files contain "这里写物品的总描述" or similar template text
    Evidence: .sisyphus/evidence/task-2-template-skipped.md
  \`\`\`

  **Commit**: YES
  - Message: `fix(items): skip template section headings`
  - Files: `src/core/ingest/items.ts`

---

- [x] 3. 修复 item-parser.ts - 正确解析属性引用伤害公式

  **What to do**:
  - 重写 `parseAttackDamage()` 方法中的伤害公式解析逻辑
  - 正确处理 `你力量调整值的力场伤害` 这类格式

  **问题分析**:
  ```
  源文本: "2d6 + 2 + 你力量调整值的力场伤害"
  
  正确解析:
  - 伤害公式: "2d6+2+@str"
  - 伤害类型: "force" (力场)
  
  错误原因:
  - 正则 (?<=的)([\u4e00-\u9fa5]+)伤害 匹配到 "你力量调整值的力场伤害"
  - [\u4e00-\u9fa5]+ 贪婪匹配，把 "你力量调整" 也当成伤害类型了
  ```

  **正确伤害类型列表** (应在最后匹配 `伤害` 之前):
  ```
  穿刺, 钝击, 挥砍, 火焰, 寒冷, 闪电, 雷鸣, 光耀, 暗蚀, 力场, 毒素, 强酸, 心灵
  ```

  **属性引用模式** (在伤害类型之前):
  ```
  你力量调整值的 -> @str
  你敏捷调整值的 -> @dex  
  你体质调整值的 -> @con
  你智力调整值的 -> @int
  你感知调整值的 -> @wis
  你魅力调整值的 -> @cha
  ```

  **修复方案**:
  1. 首先识别伤害类型关键词（使用更精确的正则）
  2. 然后在伤害类型之前查找属性引用并转换为 `@str` 等格式
  3. 公式 = 骰子 +加成 + @属性

  **新正则方案**:
  ```typescript
  // 伤害公式 + 伤害类型 的完整匹配
  // 识别: 2d6 + 2 + [属性引用]的[伤害类型]伤害
  const fullPattern = /(\d+d\d+(?:\s*[+\-]\s*(?:\d+|@\w+))*)\s*(?:[+\-]\s*)?((?:你(?:力量|敏捷|体质|智力|感知|魅力)调整值的?)?)([\u4e00-\u9fa5]+)伤害/gi;
  ```

  **References**:
  - `src/core/parser/item-parser.ts:571-618` - parseAttackDamage() 当前实现
  - `src/core/generator/activity.ts:112-139` - formatDamage() 如何处理公式
  - `temp-items/shield-e2e-out.json:91` - 当前错误输出示例

  **QA Scenarios**:

  \`\`\`
  Scenario: Shield bash damage formula uses Foundry attribute reference
    Tool: Bash
    Preconditions: 修复代码后运行转换
    Steps:
      1. bun run src/index.ts "temp-items/shield-e2e.md" -o temp-items/shield-fixed.json
      2. Read temp-items/shield-fixed.json
      3. Check activities[].damage.parts[].custom.formula
    Expected Result: formula contains "@str" not Chinese text
    Failure Indicators: formula still contains "你力量调整值的"
    Evidence: .sisyphus/evidence/task-3-formula-fixed.json

  Scenario: All damage types correctly parsed
    Tool: Bash
    Preconditions: 修复代码后运行测试
    Steps:
      1. bun test src/core/parser/__tests__/item-parser.test.ts
    Expected Result: All attack parsing tests pass
    Failure Indicators: Any test fails related to attack/damage parsing
    Evidence: .sisyphus/evidence/task-3-tests-pass.txt
  \`\`\`

  **Commit**: YES
  - Message: `fix(item-parser): correctly parse attribute references in damage formulas`
  - Files: `src/core/parser/item-parser.ts`

---

- [x] 4. E2E 验证 - 三祷之坠完整生成

  **What to do**:
  - 运行完整流程生成三祷之坠 JSON
  - 验证所有三个阶段都正确生成
  - 验证没有模板内容泄露

  **验证命令**:
  ```bash
  bun run src/index.ts --ingest-items "obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md" --emit-dir "obsidian/dnd数据转fvttjson/output/items"
  ```

  **期望输出**:
  - `obsidian/dnd数据转fvttjson/output/items/jewel-of-three-prayers__三祷之坠 (Dormant State).md`
  - `obsidian/dnd数据转fvttjson/output/items/jewel-of-three-prayers__三祷之坠 (Awakened State).md`
  - `obsidian/dnd数据转fvttjson/output/items/jewel-of-three-prayers__三祷之坠 (Exalted State).md`
  - `obsidian/dnd数据转fvttjson/output/items/shield-of-the-cavalier__骑士之盾.md`

  **References**:
  - `obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md` - 源文件

  **QA Scenarios**:

  \`\`\`
  Scenario: Three Prayers generates all three stages
    Tool: Bash
    Preconditions: 修复后运行完整流程
    Steps:
      1. List files in obsidian/dnd数据转fvttjson/output/items/
      2. Count files containing "三祷" or "Jewel"
      3. Verify 3 files exist for three stages
    Expected Result: 3 files for 三祷之坠 (Dormant, Awakened, Exalted)
    Failure Indicators: Missing stages, or wrong number of files
    Evidence: .sisyphus/evidence/task-4-stages.txt

  Scenario: No template content in output
    Tool: Bash
    Preconditions: 生成完成后
    Steps:
      1. grep -r "这里写物品的总描述" obsidian/dnd数据转fvttjson/output/items/
      2. grep -r "物品名（English Name）" obsidian/dnd数据转fvttjson/output/items/
    Expected Result: No matches found
    Failure Indicators: Template content found in output
    Evidence: .sisyphus/evidence/task-4-no-template.txt
  \`\`\`

  **Commit**: NO

---

- [x] 5. 调查 "The abacus" 内容问题 - FIXED

  **Status**: FIXED
  - Root cause: frontmatter missing `类型` field, defaults to `loot`
  - This caused `loadReferenceTemplate` to load `abacus.json` from loot directory
  - Fix: Added `parseItalicLine()` in items.ts to extract `类型`/`稀有度`/`require-attunement` from italic line
  - Verification: No "abacus" content in generated JSON

---

## Final Verification Wave

- [x] F1. Plan Compliance Audit — `oracle`
  验证所有 Must Have 都已实现，所有 Must NOT Have 都未出现

- [x] F2. Code Quality Review — `unspecified-high`
  运行 `bun test` 确保所有测试通过

- [x] F3. Real Manual QA — `unspecified-high`
  手动检查生成的 JSON 文件内容

- [x] F4. Scope Fidelity Check — `deep`
  确保没有修改 NPC 相关代码

---

## Completed Tasks Summary

| Task | Status | Description |
|------|--------|-------------|
| 1. items.ts frontmatter | ✅ | 添加了 `名称` 和 `英文名` 字段 |
| 2. items.ts skip template | ✅ | 跳过了模板标题 |
| 3. item-parser.ts damage formula | ✅ | 正确解析属性引用 `@str` |
| 4. E2E verification | ✅ | 三祷之坠3个阶段 + 骑士之盾 |
| 5. "abacus" issue | ✅ | 添加了 `类型`/`稀有度` 解析 |

## Deferred Issues

| Issue | Root Cause | Status |
|-------|-----------|--------|
| ItemGenerator 模板选择 | `loadReferenceTemplate` 使用字母顺序第一个文件 | 超出范围，需单独修复 |

---

## Success Criteria

### Verification Commands
```bash
# 1. 运行测试
bun test src/core/parser/__tests__/item-parser.test.ts

# 2. 物品拆分
bun run src/index.ts --ingest-items "obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md" --emit-dir "obsidian/dnd数据转fvttjson/output/items"

# 3. 验证拆分结果 - 不应包含模板文件
ls obsidian/dnd数据转fvttjson/output/items/
# 期望: jewel-of-three-prayers__* (3) + shield-of-the-cavalier__* (1) = 4 files

# 4. 转换单个物品验证伤害公式
bun run src/index.ts "obsidian/dnd数据转fvttjson/output/items/shield-of-the-cavalier__骑士之盾.md" -o temp-items/verify-shield.json

# 5. 检查伤害公式 - 不应包含中文
cat temp-items/verify-shield.json | grep "formula"
# 期望: "@str" 而非 "你力量调整值的"
```

### Final Checklist
- [ ] 所有 item-parser 测试通过
- [ ] frontmatter 包含 名称 和 英文名
- [ ] 没有模板内容被拆分成物品文件
- [ ] 伤害公式使用 Foundry 属性引用格式（@str 等）
- [ ] 三祷之坠三个阶段都正确生成

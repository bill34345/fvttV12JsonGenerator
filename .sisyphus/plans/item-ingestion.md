# Plan: Items Plaintext Ingestion

## TL;DR

实现物品文本 ingestion 工作流：拆分多物品markdown为单独文件，生成JSON。

> **Quick Summary**: 实现 `--ingest-items` 命令，自动拆分 `## 物品名` 格式的markdown，按 `english-slug__chinese.md` 格式输出到 `middle/items/`，并生成JSON到 `output/items/`。

> **Deliverables**:
> - `src/core/ingest/items.ts` - ItemsIngestionWorkflow + splitItemCollection()
> - `src/index.ts` 更新 - 添加 `--ingest-items` 和 `--emit-dir` 选项
> - `src/core/ingest/__tests__/items.test.ts` - 单元测试
> - 更新 README.md 文档

> **Estimated Effort**: Medium
> **Parallel Execution**: NO - sequential (implementation depends on understanding existing patterns)
> **Critical Path**: Read plaintext.ts → Create items.ts → Update index.ts → Add tests → Verify E2E

---

## Context

### User Requirements
1. 忽略模板部分（# 物品模版），只处理实际物品
2. 只添加 `layout: item` frontmatter，不自动提取其他字段
3. 使用 `english-slug__chinese.md` 命名格式
4. 多阶段物品（3阶段）拆成3个独立文件
5. 输出markdown到 `middle/items/`，并提供完整命令从markdown生成JSON

### NPC Plaintext Workflow Reference
`--ingest-plaintext-actors` 命令的工作流：
1. 读取多NPC markdown
2. `splitCollection()` 按 `# **Name**` 拆分
3. 输出到 `middle/` 目录
4. `ObsidianSyncWorkflow` 生成JSON到 `output/`

用户希望物品使用类似模式。

### Reference Implementation
- `src/core/ingest/plaintext.ts:308-343` - `splitCollection()` 函数
- `src/core/workflow/plainTextActor.ts` - PlainTextActorWorkflow
- 物品格式: `## 三祷之坠（Jewel of Three Prayers）` (二级标题)

---

## Work Objectives

### Core Objective
实现 `--ingest-items` 命令，自动：
1. 拆分多物品markdown文件
2. 每个物品输出到 `middle/items/english-slug__chinese.md`
3. 可选：直接生成JSON到 `output/items/`

### Concrete Deliverables
- `src/core/ingest/items.ts`: `splitItemCollection()` + `ItemsIngestionWorkflow`
- `src/index.ts`: 添加 `--ingest-items` CLI选项
- `src/core/ingest/__tests__/items.test.ts`: 拆分逻辑测试
- README.md: 添加使用文档

### Definition of Done
- [ ] `bun run src/index.ts --ingest-items "input.md" --emit-dir "middle/items"` 成功拆分
- [ ] 输出文件命名正确: `jewel-of-three-prayers__三祷之坠.md`
- [ ] 多阶段物品生成3个文件
- [ ] 完整命令 `bun run src/index.ts --ingest-items ... --vault ...` 可生成JSON

### Must Have
- 拆分逻辑正确识别 `## 中文名（English）` 格式
- 自动添加 `layout: item` frontmatter
- 模板部分（以 `# 物品模版` 开头）被正确忽略

### Must NOT Have
- 不自动提取 rarity/attunement 等字段到frontmatter
- 不修改原有物品生成逻辑（ItemParser, ItemGenerator）

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **Automated tests**: YES (tests-after for new code)
- **Framework**: bun test
- **If TDD**: No - implementing against existing patterns

### QA Policy
Every task MUST include agent-executed QA scenarios.

---

## Execution Strategy

### Sequential Tasks

```
Task 1: Create items.ts with splitItemCollection()
  → Task 2: Add ItemsIngestionWorkflow class
    → Task 3: Update src/index.ts CLI options
      → Task 4: Add unit tests
        → Task 5: E2E verification
```

---

## TODOs

- [x] 1. **Create splitItemCollection()** — `src/core/ingest/items.ts`

  **What to do**:
  - 读取 `src/core/ingest/plaintext.ts:308-343` 的 `splitCollection()` 作为参考
  - 创建 `splitItemCollection()` 函数
  - 正则匹配 `## 中文名（English）` 格式（注意是二级标题 `##`）
  - 解析中英文名称
  - 返回数组: `{ rawBlock, heading, chineseName, englishName }`
  - **忽略模板部分**: 如果文件以 `# 物品模版` 开头，跳过该部分

  **Pattern to match**:
  ```javascript
  /^##\s+(.+?)（(.+?)）\s*$/gm
  // or more flexible:
  /^##\s+([^\n（]+)（([^）]+)）\s*$/gm
  ```

  **Must NOT do**:
  - 不处理 `# 物品模版` 开头的部分
  - 不生成frontmatter（在ItemsIngestionWorkflow中处理）

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要理解现有splitCollection模式并适配物品格式
  - **Skills**: []

  **References**:
  - `src/core/ingest/plaintext.ts:308-343` - splitCollection() 参考实现
  - `src/core/ingest/plaintext.ts:381-394` - parseCreatureBlock() 名称解析参考

  **QA Scenarios**:
  ```
  Scenario: Split multi-item file
    Tool: Bash
    Steps:
      1. Read test file with 2 items
      2. Call splitItemCollection(content)
      3. Verify returns 2 blocks
    Expected Result: 2 blocks with correct names

  Scenario: Ignores template section
    Tool: Bash
    Steps:
      1. Read file with template + 2 items
      2. Call splitItemCollection(content)
      3. Verify returns 2 items (not 3)
    Expected Result: template ignored
  ```

---

- [x] 2. **Add ItemsIngestionWorkflow class** — `src/core/ingest/items.ts`

  **What to do**:
  - 创建 `ItemsIngestionWorkflow` 类
  - `ingest()` 方法:
    - 调用 `splitItemCollection()`
    - 为每个block生成frontmatter: `layout: item\n\n`
    - 生成文件名: `english-slug__chinese.md`
    - 写入 `emitDir` 目录
  - 返回结果对象

  **Frontmatter生成**:
  ```markdown
  ---
  layout: item
  ---
  ## 三祷之坠（Jewel of Three Prayers）
  ... (原始内容，去掉##标题行)
  ```

  **文件名生成**:
  ```typescript
  const slug = slugifyEnglishName(names.englishName);
  const fileName = `${slug}__${sanitizeFileName(names.chineseName)}.md`;
  // 例: jewel-of-three-prayers__三祷之坠.md
  ```

  **Must NOT do**:
  - 不调用ItemGenerator（由CLI流程中的后续步骤处理）

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要参考PlainTextIngestionWorkflow模式
  - **Skills**: []

  **References**:
  - `src/core/ingest/plaintext.ts:208-300` - PlainTextIngestionWorkflow参考

---

- [x] 3. **Update src/index.ts CLI** — `src/index.ts`

  **What to do**:
  - 添加 `--ingest-items` 选项
  - 添加 `--emit-dir` 选项（或复用现有）
  - 添加处理逻辑:

  ```typescript
  if (options.ingestItems) {
    const workflow = new ItemsIngestionWorkflow();
    const result = await workflow.ingest({
      sourcePath: options.ingestItems,
      emitDir: options.emitDir,
      dryRun: Boolean(options.dryRun),
    });
    // ... console.log结果
    return;
  }
  ```

  **完整命令示例**:
  ```bash
  # 拆分并生成JSON（一条命令）
  bun run src/index.ts \
    --ingest-items "obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md" \
    --emit-dir "obsidian/dnd数据转fvttjson/middle/items" \
    --vault "obsidian/dnd数据转fvttjson"
  ```

  **Must NOT do**:
  - 不修改现有的 `--ingest-plaintext` 或 `--ingest-plaintext-actors` 逻辑

---

- [ ] 4. **Add unit tests** — `src/core/ingest/__tests__/items.test.ts`

  **What to do**:
  - 测试 `splitItemCollection()`:
    - 基本拆分（2个物品）
    - 忽略模板部分
    - 多阶段物品（应该拆成3个？）
    - 空文件处理
  - 测试 `ItemsIngestionWorkflow.ingest()`:
    - 文件输出正确
    - frontmatter正确

  **QA Scenarios**:
  ```
  Scenario: Full E2E with 骑士之盾
    Tool: Bash
    Steps:
      1. bun run src/index.ts --ingest-items "input.md" --emit-dir "temp/items"
      2. Verify output file exists
      3. Verify content has layout: item frontmatter
    Expected Result: File created with correct frontmatter
  ```

---

- [x] 5. **E2E Verification** — Manual test

  **What to do**:
  执行完整命令：
  ```bash
  bun run src/index.ts \
    --ingest-items "obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md" \
    --emit-dir "obsidian/dnd数据转fvttjson/middle/items" \
    --vault "obsidian/dnd数据转fvttjson"
  ```

  **验证点**:
  - [ ] `middle/items/` 下有正确拆分的文件
  - [ ] 三祷之坠拆成3个文件（Dormant/Awakened/Exalted）
  - [ ] 骑士之盾有1个文件
  - [ ] 每个文件有 `layout: item` frontmatter

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  验证所有 "Must Have" 存在，所有 "Must NOT Have" 不存在

- [ ] F2. **Code Quality Review** — `unspecified-high`
  运行 `bun test src/core/ingest/__tests__/items.test.ts`

- [ ] F3. **E2E Test** — `unspecified-high`
  执行完整命令验证

---

## Commit Strategy

- **1**: `feat(items): add plaintext ingestion workflow`
  - Files: `src/core/ingest/items.ts`, `src/index.ts`, `src/core/ingest/__tests__/items.test.ts`

---

## Success Criteria

### Verification Commands
```bash
# 拆分物品（只需要markdown）
bun run src/index.ts \
  --ingest-items "obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md" \
  --emit-dir "obsidian/dnd数据转fvttjson/middle/items"

# 完整流程（拆分+生成JSON）
bun run src/index.ts \
  --ingest-items "obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md" \
  --emit-dir "obsidian/dnd数据转fvttjson/middle/items" \
  --vault "obsidian/dnd数据转fvttjson"
```

### Expected Output
```
middle/items/
├── jewel-of-three-prayers__三祷之坠.md      # Dormant
├── jewel-of-three-prayers__三祷之坠 (Awakened).md
├── jewel-of-three-prayers__三祷之坠 (Exalted).md
└── shield-of-the-cavalier__骑士之盾.md
```

### Final Checklist
- [ ] `splitItemCollection()` 正确识别 `## 中文名（English）` 格式
- [ ] 模板部分被忽略
- [ ] frontmatter包含 `layout: item`
- [ ] 文件命名使用 `english-slug__chinese.md` 格式
- [ ] 多阶段物品正确拆分

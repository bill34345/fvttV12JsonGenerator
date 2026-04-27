# Item Generation Plan

## TL;DR

> **Quick Summary**: 为项目添加独立的物品（Item）生成功能，支持从 Obsidian markdown 转换为 Foundry VTT dnd5e 物品 JSON。
>
> **Deliverables**:
> - `src/core/parser/item-router.ts` - 路由检测 `layout: item`
> - `src/core/parser/item-parser.ts` - 物品解析器
> - `src/core/generator/item-generator.ts` - 物品生成器
> - `src/core/models/item.ts` - ParsedItem 接口
> - 扩展 CLI 支持 `--item` 输入模式
>
> **Estimated Effort**: Large (5 waves, 20+ tasks)
> **Parallel Execution**: YES - Wave 1 tasks can run in parallel after foundation
> **Critical Path**: Wave 1 foundation → Wave 2 core parsing → Wave 5 E2E

---

## Context

### Original Request
用户希望在 NPC 处理完成后，下一步处理自定义物品（item）转换。需要支持全部物品类型（weapon, armor, consumable, wand, staff, ring 等）。

### Input Format
Obsidian markdown with `layout: item` in frontmatter. Example from `obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md`:
```markdown
---
layout: item  # <-- key identifier
---
## 三祷之坠（Jewel of Three Prayers）

*奇物，传说（需同调）*

三祷之坠是一件诀别遗物...

**休眠态（Dormant State）.** 在这个状态下...

**觉醒态（Awakened State）.** ...

**升华态（Exalted State）.** ...
```

### Key Requirements
1. **支持全部类型**: weapon, equipment, consumable, loot, tool, ammunition, armor, rod, wand, staff, container
2. **独立生成**: 物品是独立的 JSON 文件，不嵌入 actor
3. **多阶段物品**: Dormant → Awakened → Exalted，每个阶段包含所有前阶段能力（累积）
4. **零破坏风险**: 新代码全部写到新文件，不修改现有 ActorGenerator

### Research Findings

**dnd5e Item Structure**:
- Top-level: `_id`, `name`, `type`, `img`, `system`, `effects`, `flags`, `folder`
- `system` varies by type:
  - Physical: `quantity`, `weight`, `price`, `rarity`, `identified`
  - Equippable: `attunement`, `attuned`, `equipped`
  - Weapon: `damage`, `range`, `properties`, `type.value`, `mastery`
  - Equipment: `armor`, `strength`, `type.value`
  - Consumable: `uses` (with recovery formula), `type.value` (potion/scroll/etc)

**Activities System**:
- Stored in `system.activities` as object keyed by activity ID
- Types: `attack`, `cast`, `save`, `damage`, `utility`, `enchant`, `summon`, `heal`, `check`
- Each activity has: `activation`, `consumption`, `duration`, `range`, `target`, `damage`, etc.

**Multi-Stage NOT Native to dnd5e**:
- Dormant/Awakened/Exalted 阶段在 dnd5e 4.3.x 中不是原生字段
- 解决方案：生成多个独立物品，每阶段包含所有前阶段能力

**Existing Architecture to Reuse**:
- `actor-item-builder.ts`: `createDailyUses`, `resolveItemActivationCost`, `buildItemRange`, `structuredActionToActivityData` 等工具函数
- `ActivityGenerator`: 可直接复用生成 attack/save/cast/utility activities
- `references/dnd5e-4.3.9/repo/packs/_source/items/`: 100+ 物品 JSON 参考

---

## Work Objectives

### Core Objective
实现从 Obsidian markdown（`layout: item`）到 Foundry VTT dnd5e 物品 JSON 的完整转换管道。

### Concrete Deliverables
- [ ] 路由系统识别 `layout: item`
- [ ] ParsedItem 中间格式接口
- [ ] ItemParser 解析 frontmatter + body
- [ ] ItemGenerator 生成物品 JSON
- [ ] ItemValidator 验证输出
- [ ] CLI 集成（`--item` 模式）

### Definition of Done
- [ ] `bun test` 全部通过
- [ ] `bun run src/index.ts input/items/xxx.md -o output/xxx.json` 生成有效物品 JSON
- [ ] 导入 Foundry VTT 后物品正确显示
- [ ] 现有 NPC 生成功能完全不受影响

### Must Have
- 支持 weapon, equipment, consumable, armor, wand, staff, rod 类型
- 支持 charges/uses 系统
- 支持 attunement
- 支持 activities (attack, save, utility)
- 支持多阶段物品（累积能力）

### Must NOT Have (Guardrails)
- 不修改 `src/core/generator/actor.ts`
- 不修改 `src/core/generator/actor-item-builder.ts` 现有函数签名
- 不修改 `src/core/parser/router.ts` 现有路由逻辑
- 不修改 `src/index.ts` 现有 CLI 结构

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - 新文件，不影响现有代码):
├── T1:  创建 src/core/models/item.ts (ParsedItem 接口)
├── T2:  创建 src/core/parser/item-router.ts (路由检测)
├── T3:  创建 src/core/parser/item-strategy.ts (ParserStrategy 接口)
├── T4:  创建 src/core/generator/item-generator.ts 框架
├── T5:  扩展 src/index.ts 添加 --item CLI
└── T6:  创建 src/core/validator/item-validator.ts 框架

Wave 2 (Core Parsing):
├── T7:  解析 frontmatter (名称, 类型, 稀有度, attunement)
├── T8:  解析 charges/uses/recovery
├── T9:  解析 body sections (特性列表, 描述)
├── T10: 物品类型分类 (weapon/armor/consumable/etc.)
└── T11: 生成基础物品 system 结构

Wave 3 (Activity Generation):
├── T12: 复用 ActivityGenerator 生成 activities
├── T13: 实现 attack activity (武器攻击)
├── T14: 实现 save activity (豁免)
├── T15: 实现 utility activity (被动能力)
└── T16: 实现 cast activity (物品施法)

Wave 4 (Multi-Stage Items):
├── T17: 检测 Dormant/Awakened/Exalted 阶段
├── T18: 生成多阶段物品（每阶段独立 JSON）
├── T19: 累积能力合并（前阶段 + 当前阶段）
└── T20: 阶段命名规范 (名称, 名称 (Awakened), 名称 (Exalted))

Wave 5 (Output & Tests):
├── T21: ItemValidator 验证逻辑
├── T22: Golden Master 验证（参考 references 物品结构）
├── T23: 单元测试 (item-parser.test.ts)
└── T24: 集成测试 (item-generator.test.ts)

Wave FINAL (E2E + Regression):
├── T25: 端到端测试 (三祷之坠, 骑士之盾)
├── T26: 运行全部 bun test 确保无回归
└── T27: 手动验证导入 Foundry VTT
```

### Dependency Matrix

| Task | Blocks | Blocked By |
|------|--------|------------|
| T1 | T2, T3 | - |
| T2 | T4, T5 | T1 |
| T3 | T4 | T1 |
| T4 | T11, T25 | T2, T3 |
| T5 | T25 | T2 |
| T6 | T21, T25 | T4 |
| T7 | T8, T9, T10 | T1 |
| T8 | T11 | T7 |
| T9 | T11 | T7 |
| T10 | T11 | T7 |
| T11 | T12, T17 | T4, T8, T9, T10 |
| T12 | T13, T14, T15, T16 | T11 |
| T13 | T17 | T12 |
| T14 | T17 | T12 |
| T15 | T17 | T12 |
| T16 | T17 | T12 |
| T17 | T18, T19, T20 | T13, T14, T15, T16 |
| T18 | T21 | T17 |
| T19 | T21 | T17 |
| T20 | T21 | T17 |
| T21 | T22 | T18, T19, T20 |
| T22 | T23 | T21 |
| T23 | T24 | T22 |
| T24 | T25 | T23 |
| T25 | T26 | T4, T5, T6, T18, T19, T20, T24 |
| T26 | T27 | T25 |
| T27 | - | T26 |

---

## TODOs

- [x] T1. **Create ParsedItem Interface** — `src/core/models/item.ts`

  **What to do**:
  ```typescript
  // Define the intermediate representation for parsed items
  export interface ParsedItem {
    name: string;
    englishName?: string;
    type: ItemType;  // 'weapon' | 'equipment' | 'consumable' | 'loot' | 'tool' | 'armor' | 'rod' | 'wand' | 'staff' | 'container'
    rarity: string;  // 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary' | 'artifact'
    attunement: boolean;
    description: {
      value: string;  // HTML content
      chat: string;
    };
    source?: {
      book: string;
      page: string;
      license: string;
    };
    quantity: number;
    weight?: { value: number; units: string };
    price?: { value: number; denomination: string };
    
    // Type-specific
    damage?: DamageData;
    armor?: ArmorData;
    uses?: UsesData;
    properties?: string[];
    
    // Activities
    activities?: ActivityData[];
    
    // Multi-stage
    stages?: ItemStage[];  // For Dormant/Awakened/Exalted items
    
    // Item traits/special abilities (like **Forceful Bash**.)
    traits?: Trait[];
  }
  
  export interface ItemStage {
    name: string;  // 'Dormant' | 'Awakened' | 'Exalted'
    description: string;
    abilities: Trait[];
  }
  
  export interface Trait {
    name: string;
    description: string;
    activation?: { type: string; cost?: number };
    damage?: DamageData;
    save?: SaveData;
  }
  ```

  **Must NOT do**:
  - Do NOT create `ParsedNPC` modifications - keep separate
  - Do NOT modify existing models

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Type definition requires understanding full item structure
  - **Skills**: []
    - No specific skills needed for interface design

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3)
  - **Blocks**: T2, T3
  - **Blocked By**: None

  **References**:
  - `src/config/mapping.ts:ParsedNPC` - Reference for intermediate format pattern
  - `references/dnd5e-4.3.9/repo/packs/_source/items/weapon/staff-of-the-magi.json` - Complex item reference (lines 1-100 for system structure)

  **Acceptance Criteria**:
  - [ ] File created at `src/core/models/item.ts`
  - [ ] All types exported properly
  - [ ] TypeScript compiles without errors

  **QA Scenarios**:
  ```
  Scenario: TypeScript compilation check
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. Run: bun run tsc --noEmit
    Expected Result: No errors related to item.ts
    Evidence: .sisyphus/evidence/t1-tsc.json
  ```

  **Commit**: YES
  - Message: `feat(item): add ParsedItem interface`
  - Files: `src/core/models/item.ts`

---

- [x] T2. **Create Item Router** — `src/core/parser/item-router.ts`

  **What to do**:
  ```typescript
  // Add item route detection to ParserFactory or create standalone router
  export function detectItemRoute(content: string): boolean {
    const frontmatter = extractFrontmatter(content);
    return /^layout\s*:\s*['"]?item['"]?\s*$/im.test(frontmatter);
  }
  ```

  **Must NOT do**:
  - Do NOT modify `src/core/parser/router.ts` - create new file
  - Do NOT change existing ParserFactory behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple regex matching, similar to existing router pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3)
  - **Blocks**: T4, T5
  - **Blocked By**: T1

  **References**:
  - `src/core/parser/router.ts:10-14` - Reference for detectRoute pattern

  **Acceptance Criteria**:
  - [ ] Function detects `layout: item` correctly
  - [ ] Returns false for `layout: creature` and other layouts
  - [ ] Existing tests still pass

  **QA Scenarios**:
  ```
  Scenario: Detect layout item
    Tool: Bash
    Preconditions: Test file with layout: item
    Steps:
      1. Run: bun test src/core/parser/__tests__/item-router.test.ts
    Expected Result: PASS (1 test, 0 failures)
    Evidence: .sisyphus/evidence/t2-router-test.json

  Scenario: Does not match creature layout
    Tool: Bash
    Preconditions: Test file with layout: creature
    Steps:
      1. Run: bun test src/core/parser/__tests__/item-router.test.ts
    Expected Result: PASS (detects as non-item)
    Evidence: .sisyphus/evidence/t2-router-negative.json
  ```

  **Commit**: YES
  - Message: `feat(item): add item route detection`
  - Files: `src/core/parser/item-router.ts`

---

- [x] T3. **Create Item Strategy Interface** — `src/core/parser/item-strategy.ts`

  **What to do**:
  ```typescript
  import type { ParsedItem } from '../models/item';
  
  export interface ItemParserStrategy {
    readonly type: 'item';
    parse(content: string): ParsedItem;
    canParse(content: string): boolean;
  }
  ```

  **Must NOT do**:
  - Do NOT modify `ParserStrategy` interface
  - Do NOT change existing parser implementations

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple interface definition following existing pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2)
  - **Blocks**: T4
  - **Blocked By**: T1

  **References**:
  - `src/core/parser/types.ts:ParserStrategy` - Reference for interface pattern

  **Acceptance Criteria**:
  - [ ] File created at `src/core/parser/item-strategy.ts`
  - [ ] Interface matches existing patterns
  - [ ] TypeScript compiles

  **QA Scenarios**:
  ```
  Scenario: Interface compiles
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. Run: bun run tsc --noEmit src/core/parser/item-strategy.ts
    Expected Result: No errors
    Evidence: .sisyphus/evidence/t3-interface.json
  ```

  **Commit**: YES
  - Message: `feat(item): add ItemParserStrategy interface`
  - Files: `src/core/parser/item-strategy.ts`

---

- [x] T4. **Create ItemGenerator Framework** — `src/core/generator/item-generator.ts`

  **What to do**:
  ```typescript
  export class ItemGenerator {
    constructor(private options: ItemGeneratorOptions) {}
    
    async generate(parsed: ParsedItem): Promise<ItemDocument> {
      // 1. Load reference item JSON based on type
      // 2. Clone as base structure
      // 3. Patch with parsed data
      // 4. Generate activities
      // 5. Return item document
    }
    
    private loadReferenceTemplate(type: ItemType): ItemDocument { ... }
    private patchBasicFields(item: ItemDocument, parsed: ParsedItem): void { ... }
    private generateActivities(item: ItemDocument, activities: ActivityData[]): void { ... }
  }
  ```

  **Must NOT do**:
  - Do NOT modify `src/core/generator/actor.ts`
  - Do NOT call any ActorGenerator methods

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core generator requires understanding of item structures and builder patterns
  - **Skills**: []
    - Reference: `src/core/generator/actor.ts:301-551` for generator pattern

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T11, T25
  - **Blocked By**: T2, T3

  **References**:
  - `src/core/generator/actor.ts:ActorGenerator` - Reference for generator class pattern
  - `src/core/generator/actor-item-builder.ts` - Reusable utilities: `createDailyUses`, `resolveItemActivationCost`, `buildItemRange`, `structuredActionToActivityData`
  - `references/dnd5e-4.3.9/repo/packs/_source/items/weapon/staff-of-the-magi.json` - Complex item structure reference

  **Acceptance Criteria**:
  - [ ] Class created with generate method
  - [ ] Uses golden-master-like reference items
  - [ ] Can generate basic item JSON

  **QA Scenarios**:
  ```
  Scenario: Generate basic item
    Tool: Bash
    Preconditions: T1-T3 complete
    Steps:
      1. bun run src/index.ts "obsidian/dnd数据转fvttjson/input/items/骑士之盾.md" -o temp-shield.json
      2. cat temp-shield.json | head -50
    Expected Result: Valid JSON with name "骑士之盾", type "equipment", system fields present
    Evidence: .sisyphus/evidence/t4-basic-gen.json
  ```

  **Commit**: YES
  - Message: `feat(item): add ItemGenerator class`
  - Files: `src/core/generator/item-generator.ts`

---

- [x] T5. **Extend CLI for Item Mode** — `src/index.ts`

  **What to do**:
  - Add `--item` flag OR detect `layout: item` in frontmatter and route accordingly
  - Call ItemGenerator instead of ActorGenerator when item detected

  **Must NOT do**:
  - Do NOT change existing NPC/actor generation behavior
  - Do NOT modify existing CLI options structure

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: CLI extension is straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T25
  - **Blocked By**: T2

  **References**:
  - `src/index.ts:169-196` - Reference for CLI parse/generate flow

  **Acceptance Criteria**:
  - [ ] `layout: item` files route to ItemGenerator
  - [ ] `layout: creature` files still route to ActorGenerator
  - [ ] No existing functionality broken

  **QA Scenarios**:
  ```
  Scenario: Item route
    Tool: Bash
    Preconditions: T4 complete
    Steps:
      1. bun run src/index.ts "obsidian/dnd数据转fvttjson/input/items/骑士之盾.md" -o temp-shield-out.json
    Expected Result: Item JSON generated successfully
    Evidence: .sisyphus/evidence/t5-item-cli.json

  Scenario: Actor route unchanged
    Tool: Bash
    Preconditions: T4 complete
    Steps:
      1. bun run src/index.ts "obsidian/dnd数据转fvttjson/input/chuul-screecher.md" -o temp-actor-out.json
    Expected Result: Actor JSON generated successfully (no change)
    Evidence: .sisyphus/evidence/t5-actor-cli.json
  ```

  **Commit**: YES
  - Message: `feat(item): route layout:item to ItemGenerator`
  - Files: `src/index.ts`

---

- [x] T6. **Create ItemValidator Framework** — `src/core/validator/item-validator.ts`

  **What to do**:
  ```typescript
  export class ItemValidator {
    validate(parsed: ParsedItem, item: ItemDocument): string[] {
      // Check: name matches
      // Check: type matches
      // Check: required fields present based on type
      // Check: activities have valid structure
    }
  }
  ```

  **Must NOT do**:
  - Do NOT modify `src/core/generator/validator.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple validation, similar pattern to existing validator
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T21
  - **Blocked By**: T4

  **References**:
  - `src/core/generator/validator.ts:ActorValidator` - Reference for validator pattern

  **Acceptance Criteria**:
  - [ ] Basic validation logic in place
  - [ ] Can be extended in later tasks

  **QA Scenarios**:
  ```
  Scenario: Validation runs
    Tool: Bash
    Preconditions: T4 complete
    Steps:
      1. bun test src/core/validator/__tests__/item-validator.test.ts
    Expected Result: Tests pass
    Evidence: .sisyphus/evidence/t6-validator.json
  ```

  **Commit**: YES
  - Message: `feat(item): add ItemValidator`
  - Files: `src/core/validator/item-validator.ts`

---

- [x] T7. **Parse Frontmatter (Basic Fields)** — `src/core/parser/item-parser.ts`

  **What to do**:
  - Parse `名称`, `类型`, `稀有度`, `require-attunement` from frontmatter
  - Handle Chinese field names via mapping

  **Must NOT do**:
  - Do NOT modify `src/core/parser/yaml.ts`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Parsing logic requires understanding of frontmatter structure
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T8, T9, T10
  - **Blocked By**: T1

  **References**:
  - `src/core/parser/yaml.ts` - Reference for YAML parsing pattern
  - `src/config/mapping.ts:FIELD_MAPPING` - Reference for Chinese field mapping
  - `obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md` - Input format reference

  **Acceptance Criteria**:
  - [ ] Parses 名称, 类型, 稀有度 correctly
  - [ ] Handles attunement flag
  - [ ] Returns ParsedItem with basic fields

  **QA Scenarios**:
  ```
  Scenario: Parse shield frontmatter
    Tool: Bash
    Preconditions: T1, T7 complete
    Steps:
      1. bun test src/core/parser/__tests__/item-parser.test.ts
    Expected Result: PASS (parse shield correctly)
    Evidence: .sisyphus/evidence/t7-frontmatter.json
  ```

  **Commit**: YES
  - Message: `feat(item): parse item frontmatter`
  - Files: `src/core/parser/item-parser.ts`

---

- [x] T8. **Parse Charges/Uses/Recovery** — `src/core/parser/item-parser.ts`

  **What to do**:
  - Parse 充能 pattern: "3 充能，并且在每天黎明恢复所有被消耗的充能"
  - Extract max charges, recovery formula

  **Must NOT do**:
  - Do NOT modify existing action parsing

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex regex/text parsing for Chinese charges description
  - **Skills**: []
    - Reference: `src/core/parser/action.ts` for action parsing patterns

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T11
  - **Blocked By**: T7

  **References**:
  - `references/dnd5e-4.3.9/repo/module/data/shared/uses-field.mjs` - Uses/recovery structure
  - `references/dnd5e-4.3.9/repo/packs/_source/items/weapon/staff-of-the-magi.json:38-48` - Uses structure example

  **Acceptance Criteria**:
  - [ ] Parses "X 充能" correctly
  - [ ] Parses "每天黎明恢复" as dawn recovery
  - [ ] Generates correct uses structure

  **QA Scenarios**:
  ```
  Scenario: Parse charges from 三祷之坠
    Tool: Bash
    Preconditions: T7, T8 complete
    Steps:
      1. bun test src/core/parser/__tests__/item-parser.test.ts
    Expected Result: PASS (charges: { value: 3, max: 3, recovery: [{ period: 'dawn' }] })
    Evidence: .sisyphus/evidence/t8-charges.json
  ```

  **Commit**: YES
  - Message: `feat(item): parse charges and uses`
  - Files: `src/core/parser/item-parser.ts`

---

- [x] T9. **Parse Body Sections (Traits)** — `src/core/parser/item-parser.ts`

  **What to do**:
  - Parse trait sections like `**休眠态（Dormant State）.**` 
  - Parse individual traits like `**强力猛击（Forceful Bash）.**`
  - Extract trait name, description, and any mechanical data

  **Must NOT do**:
  - Do NOT modify existing markdown parsing

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex markdown parsing for trait patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T11
  - **Blocked By**: T7

  **References**:
  - `src/core/parser/yaml.ts:extractBodySections` - Reference for section extraction
  - `src/core/parser/action.ts:33-208` - Reference for action parsing patterns

  **Acceptance Criteria**:
  - [ ] Parses trait names with Chinese/English
  - [ ] Extracts trait descriptions
  - [ ] Identifies activation type if present

  **QA Scenarios**:
  ```
  Scenario: Parse traits from 骑士之盾
    Tool: Bash
    Preconditions: T7, T9 complete
    Steps:
      1. bun test src/core/parser/__tests__/item-parser.test.ts
    Expected Result: PASS (traits: [Forceful Bash, Protective Field])
    Evidence: .sisyphus/evidence/t9-traits.json
  ```

  **Commit**: YES
  - Message: `feat(item): parse body sections and traits`
  - Files: `src/core/parser/item-parser.ts`

---

- [x] T10. **Classify Item Type** — `src/core/parser/item-parser.ts`

  **What to do**:
  - Map input type string to dnd5e item types
  - Handle: 武器→weapon, 护甲→equipment, 药水→consumable, etc.

  **Must NOT do**:
  - Do NOT assume type - handle unknown types gracefully

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple mapping logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T11
  - **Blocked By**: T7

  **References**:
  - `src/config/mapping.ts` - Reference for field mapping pattern

  **Acceptance Criteria**:
  - [ ] Maps 武器 to weapon
  - [ ] Maps 护甲/盾牌 to equipment
  - [ ] Maps 奇物 to equipment (Wondrous item)
  - [ ] Handles unknown types

  **QA Scenarios**:
  ```
  Scenario: Type classification
    Tool: Bash
    Preconditions: T7, T10 complete
    Steps:
      1. bun test src/core/parser/__tests__/item-parser.test.ts
    Expected Result: PASS (骑士之盾 → equipment, 奇物 → equipment)
    Evidence: .sisyphus/evidence/t10-types.json
  ```

  **Commit**: YES
  - Message: `feat(item): classify item types`
  - Files: `src/core/parser/item-parser.ts`

---

- [x] T11. **Generate Base Item Structure** — `src/core/generator/item-generator.ts`

  **What to do**:
  - Clone reference item JSON based on type
  - Patch basic fields (name, description, price, weight, rarity, attunement)

  **Must NOT do**:
  - Do NOT call any ActorGenerator methods
  - Do NOT modify reference item files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Item structure generation requires understanding of dnd5e schemas
  - **Skills**: []
    - Reference: `src/core/generator/actor.ts:301-306` for golden-master pattern

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T12, T17
  - **Blocked By**: T4, T8, T9, T10

  **References**:
  - `references/dnd5e-4.3.9/repo/packs/_source/items/weapon/staff-of-the-magi.json` - Complex weapon reference
  - `references/dnd5e-4.3.9/repo/packs/_source/items/equipment/shield-of-the-cavalier.json` (if exists) - Shield reference
  - `references/dnd5e-4.3.9/repo/packs/_source/items/equipment/cloak-of-protection.json` - Simple equipment reference

  **Acceptance Criteria**:
  - [ ] Generates valid base item JSON
  - [ ] All required system fields present
  - [ ] Type-specific fields populated

  **QA Scenarios**:
  ```
  Scenario: Generate shield item
    Tool: Bash
    Preconditions: T11 complete
    Steps:
      1. bun run src/index.ts "obsidian/dnd数据转fvttjson/input/items/骑士之盾.md" -o temp-shield.json
      2. Verify JSON has type: "equipment", system.armor exists
    Expected Result: Valid equipment JSON
    Evidence: .sisyphus/evidence/t11-base.json
  ```

  **Commit**: YES
  - Message: `feat(item): generate base item structure`
  - Files: `src/core/generator/item-generator.ts`

---

- [x] T12. **Integrate ActivityGenerator** — `src/core/generator/item-generator.ts`

  **What to do**:
  - Reuse existing ActivityGenerator to generate activities from trait data

  **Must NOT do**:
  - Do NOT modify `src/core/generator/activity.ts`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Activity integration requires understanding existing generator
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T13, T14, T15, T16
  - **Blocked By**: T11

  **References**:
  - `src/core/generator/activity.ts:ActivityGenerator` - Reference for activity generation
  - `src/core/generator/actor-item-builder.ts:structuredActionToActivityData` - Reference for activity data conversion

  **Acceptance Criteria**:
  - [ ] Can call ActivityGenerator.generate()
  - [ ] Activities attached to item.system.activities

  **QA Scenarios**:
  ```
  Scenario: Activity generation
    Tool: Bash
    Preconditions: T12 complete
    Steps:
      1. bun run src/index.ts "obsidian/dnd数据转fvttjson/input/items/骑士之盾.md" -o temp-activity.json
      2. Verify item.system.activities contains entries
    Expected Result: Activities generated
    Evidence: .sisyphus/evidence/t12-activities.json
  ```

  **Commit**: YES
  - Message: `feat(item): integrate ActivityGenerator`
  - Files: `src/core/generator/item-generator.ts`

---

- [x] T13. **Implement Attack Activity** — `src/core/generator/item-generator.ts`

  **What to do**:
  - Generate attack activities from traits like "Forceful Bash"
  - Map to dnd5e attack activity structure

  **Must NOT do**:
  - Do NOT duplicate existing attack generation logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Attack activity structure is complex
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T14, T15, T16)
  - **Blocks**: T17
  - **Blocked By**: T12

  **References**:
  - `references/dnd5e-4.3.9/repo/module/data/activity/attack-data.mjs` - Attack activity schema
  - `references/dnd5e-4.3.9/repo/packs/_source/items/weapon/staff-of-the-magi.json:109-196` - Attack activity example

  **Acceptance Criteria**:
  - [ ] Attack activities have correct damage structure
  - [ ] Range and target populated

  **QA Scenarios**:
  ```
  Scenario: Attack from 骑士之盾 Forceful Bash
    Tool: Bash
    Preconditions: T13 complete
    Steps:
      1. bun run src/index.ts "obsidian/dnd数据转fvttjson/input/items/骑士之盾.md" -o temp-attack.json
      2. Verify activities contain attack type with damage parts
    Expected Result: Attack activity with 2d6+2+str force damage
    Evidence: .sisyphus/evidence/t13-attack.json
  ```

  **Commit**: YES
  - Message: `feat(item): implement attack activity`
  - Files: `src/core/generator/item-generator.ts`

---

- [x] T14. **Implement Save Activity** — `src/core/generator/item-generator.ts`

  **What to do**:
  - Generate save activities from traits with DC
  - Map to dnd5e save activity structure

  **Must NOT do**:
  - Do NOT duplicate existing save generation logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Save activity structure
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T13, T15, T16)
  - **Blocks**: T17
  - **Blocked By**: T12

  **References**:
  - `references/dnd5e-4.3.9/repo/module/data/activity/save-data.mjs` - Save activity schema

  **Acceptance Criteria**:
  - [ ] Save activities have DC and ability
  - [ ] onSave half/full handling

  **Commit**: YES
  - Message: `feat(item): implement save activity`
  - Files: `src/core/generator/item-generator.ts`

---

- [x] T15. **Implement Utility Activity** — `src/core/generator/item-generator.ts`

  **What to do**:
  - Generate utility activities from passive traits
  - Handle concentration if applicable

  **Must NOT do**:
  - Do NOT duplicate existing utility generation logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Utility activity structure
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T13, T14, T16)
  - **Blocks**: T17
  - **Blocked By**: T12

  **References**:
  - `references/dnd5e-4.3.9/repo/module/data/activity/utility-data.mjs` - Utility activity schema

  **Acceptance Criteria**:
  - [ ] Utility activities generated
  - [ ] Duration and concentration handled

  **Commit**: YES
  - Message: `feat(item): implement utility activity`
  - Files: `src/core/generator/item-generator.ts`

---

- [x] T16. **Implement Cast Activity** — `src/core/generator/item-generator.ts`

  **What to do**:
  - Generate cast activities for items with spell casting (wands, staffs)
  - Link to spell UUIDs via spell lookup

  **Must NOT do**:
  - Do NOT duplicate existing spell linking logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Cast activity with spell UUID reference
  - **Skills**: []
    - Reference: `src/core/generator/actor.ts:876-878` for spell linking

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T13, T14, T15)
  - **Blocks**: T17
  - **Blocked By**: T12

  **References**:
  - `references/dnd5e-4.3.9/repo/module/data/activity/cast-data.mjs` - Cast activity schema
  - `references/dnd5e-4.3.9/repo/packs/_source/items/wand/wand-of-fireballs.json` - Wand with cast activities

  **Acceptance Criteria**:
  - [ ] Cast activities have spell UUID
  - [ ] Level and properties populated

  **Commit**: YES
  - Message: `feat(item): implement cast activity`
  - Files: `src/core/generator/item-generator.ts`

---

- [x] T17. **Detect Multi-Stage Patterns** — `src/core/parser/item-parser.ts`

  **What to do**:
  - Detect Dormant State, Awakened State, Exalted State sections
  - Parse each stage's abilities

  **Must NOT do**:
  - Do NOT lose any ability from any stage

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multi-stage parsing is complex
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T18, T19, T20
  - **Blocked By**: T11, T13, T14, T15, T16

  **References**:
  - `obsidian/dnd数据转fvttjson/input/items/物品模版以及两个示例物品.md` - Input format with stages

  **Acceptance Criteria**:
  - [ ] Detects all three stages
  - [ ] Parses abilities per stage
  - [ ] Cumulative nature preserved

  **QA Scenarios**:
  ```
  Scenario: Parse 三祷之坠 stages
    Tool: Bash
    Preconditions: T17 complete
    Steps:
      1. bun test src/core/parser/__tests__/item-parser.test.ts
    Expected Result: PASS (3 stages parsed, all abilities present)
    Evidence: .sisyphus/evidence/t17-stages.json
  ```

  **Commit**: YES
  - Message: `feat(item): detect multi-stage patterns`
  - Files: `src/core/parser/item-parser.ts`

---

- [x] T18. **Generate Multi-Stage Items** — `src/core/generator/item-generator.ts`

  **What to do**:
  - Generate one item JSON per stage
  - Stage 1 (Dormant): base abilities
  - Stage 2 (Awakened): base + new abilities
  - Stage 3 (Exalted): all abilities

  **Must NOT do**:
  - Do NOT forget: Awakened includes ALL Dormant abilities PLUS new ones
  - Do NOT generate items with missing abilities

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Cumulative ability generation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T21
  - **Blocked By**: T17

  **References**:
  - T17 acceptance criteria for cumulative requirements

  **Acceptance Criteria**:
  - [ ] 3 separate JSON files generated for 三祷之坠
  - [ ] Each stage has correct cumulative abilities
  - [ ] File naming: `三祷之坠.json`, `三祷之坠 (Awakened).json`, `三祷之坠 (Exalted).json`

  **QA Scenarios**:
  ```
  Scenario: Generate 三祷之坠 items
    Tool: Bash
    Preconditions: T18 complete
    Steps:
      1. bun run src/index.ts "obsidian/dnd数据转fvttjson/input/items/三祷之坠.md" -o temp-jewel/
      2. ls temp-jewel/
    Expected Result: 3 files: 三祷之坠.json, 三祷之坠 (Awakened).json, 三祷之坠 (Exalted).json
    Evidence: .sisyphus/evidence/t18-multistage.json
  ```

  **Commit**: YES
  - Message: `feat(item): generate multi-stage items`
  - Files: `src/core/generator/item-generator.ts`

---

- [x] T19. **Merge Cumulative Abilities** — `src/core/generator/item-generator.ts`

  **What to do**:
  - For Awakened: merge Dormant abilities + Awakened abilities
  - For Exalted: merge (Dormant + Awakened) + Exalted abilities

  **Must NOT do**:
  - Do NOT lose any ability during merge

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Ability merging logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T21
  - **Blocked By**: T17

  **Acceptance Criteria**:
  - [ ] Awakened item has all 3 Dormant abilities PLUS 2 Awakened abilities
  - [ ] Exalted item has all 5 Awakened abilities PLUS 3 Exalted abilities
  - [ ] No duplicate abilities

  **QA Scenarios**:
  ```
  Scenario: Verify cumulative abilities
    Tool: Bash
    Preconditions: T19 complete
    Steps:
      1. bun run src/index.ts "obsidian/dnd数据转fvttjson/input/items/三祷之坠.md" -o temp-jewel/
      2. cat "temp-jewel/三祷之坠 (Awakened).json" | grep -c "ability"
      3. cat "temp-jewel/三祷之坠 (Exalted).json" | grep -c "ability"
    Expected Result: Awakened has 5 ability entries, Exalted has 8
    Evidence: .sisyphus/evidence/t19-cumulative.json
  ```

  **Commit**: YES
  - Message: `feat(item): merge cumulative abilities`
  - Files: `src/core/generator/item-generator.ts`

---

- [x] T20. **Stage Naming Convention** — `src/core/generator/item-generator.ts`

  **What to do**:
  - Name format: `基础名称`, `基础名称 (Awakened)`, `基础名称 (Exalted)`
  - Example: `三祷之坠`, `三祷之坠 (Awakened)`, `三祷之坠 (Exalted)`

  **Must NOT do**:
  - Do NOT use stage names as prefixes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple string formatting
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T21
  - **Blocked By**: T17

  **Acceptance Criteria**:
  - [ ] Naming follows convention
  - [ ] Files have correct names

  **Commit**: YES
  - Message: `feat(item): apply stage naming convention`
  - Files: `src/core/generator/item-generator.ts`

---

- [x] T21. **Implement ItemValidator Logic** — `src/core/validator/item-validator.ts`

  **What to do**:
  - Validate required fields based on item type
  - Validate activity structures
  - Validate multi-stage items

  **Must NOT do**:
  - Do NOT modify existing ActorValidator

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Validation logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T22
  - **Blocked By**: T18, T19, T20, T6

  **References**:
  - `src/core/generator/validator.ts:ActorValidator` - Reference for validator pattern

  **Acceptance Criteria**:
  - [ ] Validates item type-specific required fields
  - [ ] Validates activities have correct structure
  - [ ] Returns warnings, not errors

  **Commit**: YES
  - Message: `feat(item): implement item validation`
  - Files: `src/core/validator/item-validator.ts`

---

- [x] T22. **Golden Master Verification** — Reference items for structure validation

  **What to do**:
  - Compare generated items against reference item structures
  - Ensure required fields match dnd5e schema

  **Must NOT do**:
  - Do NOT modify reference files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires comparison against multiple reference files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T23
  - **Blocked By**: T21

  **References**:
  - `references/dnd5e-4.3.9/repo/packs/_source/items/` - 100+ reference items
  - `src/core/utils/assertEqualStructure.ts` - Structure comparison utility

  **Acceptance Criteria**:
  - [ ] Generated items match expected structure
  - [ ] No missing required fields

  **Commit**: YES
  - Message: `test(item): verify against golden master`
  - Files: `tests/`

---

- [x] T23. **Unit Tests: item-parser** — `src/core/parser/__tests__/item-parser.test.ts`

  **What to do**:
  - Test frontmatter parsing
  - Test charges parsing
  - Test trait parsing
  - Test multi-stage parsing

  **Must NOT do**:
  - Do NOT modify existing parser tests

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Test writing with parser logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T24
  - **Blocked By**: T22

  **Acceptance Criteria**:
  - [ ] All item parser tests pass
  - [ ] Coverage includes edge cases

  **Commit**: YES
  - Message: `test(item): add item parser tests`
  - Files: `src/core/parser/__tests__/item-parser.test.ts`

---

- [x] T24. **Unit Tests: item-generator** — `src/core/generator/__tests__/item-generator.test.ts`

  **What to do**:
  - Test item generation
  - Test activity generation
  - Test multi-stage generation

  **Must NOT do**:
  - Do NOT modify existing generator tests

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Test writing with generator logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T25
  - **Blocked By**: T23

  **Acceptance Criteria**:
  - [ ] All item generator tests pass
  - [ ] Tests use fixture files

  **Commit**: YES
  - Message: `test(item): add item generator tests`
  - Files: `src/core/generator/__tests__/item-generator.test.ts`

---

- [x] T25. **E2E Test: 骑士之盾 and 三祷之坠**

  **What to do**:
  - Generate both example items
  - Verify JSON structure
  - Run full test suite

  **Must NOT do**:
  - Do NOT break existing NPC generation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full E2E testing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T26
  - **Blocked By**: T4, T5, T6, T18, T19, T20, T24

  **Acceptance Criteria**:
  - [ ] 骑士之盾 generates correctly
  - [ ] 三祷之坠 generates 3 stage items
  - [ ] All abilities present

  **QA Scenarios**:
  ```
  Scenario: Full E2E
    Tool: Bash
    Preconditions: T25 complete
    Steps:
      1. bun run src/index.ts "obsidian/dnd数据转fvttjson/input/items/骑士之盾.md" -o temp-e2e/shield.json
      2. bun run src/index.ts "obsidian/dnd数据转fvttjson/input/items/三祷之坠.md" -o temp-e2e/jewel/
      3. bun test
    Expected Result: All tests pass, E2E succeeds
    Evidence: .sisyphus/evidence/t25-e2e.json
  ```

  **Commit**: YES
  - Message: `test(item): e2e tests for shield and jewel`
  - Files: `tests/acceptance/`

---

- [x] T26. **Full Regression Test** — `bun test`

  **What to do**:
  - Run full test suite
  - Ensure no NPC generation tests broken

  **Must NOT do**:
  - Do NOT skip any tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T27
  - **Blocked By**: T25

  **Acceptance Criteria**:
  - [ ] All existing tests pass
  - [ ] All new tests pass
  - [ ] No regressions

  **QA Scenarios**:
  ```
  Scenario: Full regression
    Tool: Bash
    Preconditions: T25 complete
    Steps:
      1. bun test
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/t26-regression.json
  ```

  **Commit**: NO
  - Message: (already committed in T25)

---

- [x] T27. **Manual Foundry VTT Verification**

  **What to do**:
  - Import generated items into Foundry VTT
  - Verify display and functionality

  **Must NOT do**:
  - Do NOT claim success without manual verification

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Manual verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: T26

  **Acceptance Criteria**:
  - [ ] Item appears in item directory
  - [ ] Properties display correctly
  - [ ] Activities work when activated

  **Commit**: NO

---

## Final Verification Wave

- [ ] F1. **NPC Generation Regression** — `oracle`
  Run existing NPC tests to ensure ActorGenerator still works.
  Output: `NPC tests [N/N pass] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Item Structure Audit** — `unspecified-high`
  Verify generated items match dnd5e schema structure.
  Output: `Schema [N/N match] | VERDICT`

- [ ] F3. **Cumulative Ability Check** — `deep`
  For multi-stage items, verify Awakened has Dormant+Awakened abilities.
  Output: `Abilities [N/N correct] | VERDICT`

---

## Success Criteria

### Verification Commands
```bash
bun test  # All tests pass
bun run src/index.ts "obsidian/dnd数据转fvttjson/input/items/骑士之盾.md" -o temp/shield.json
bun run src/index.ts "obsidian/dnd数据转fvttjson/input/items/三祷之坠.md" -o temp/jewel/
```

### Final Checklist
- [ ] All "Must Have" items implemented
- [ ] All "Must NOT Have" constraints honored (no ActorGenerator modifications)
- [ ] All tests pass
- [ ] Multi-stage items have cumulative abilities
- [ ] Items importable to Foundry VTT

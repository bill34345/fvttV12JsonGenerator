# Foundry VTT NPC Importer - Work Plan (High Accuracy)

## Context

### Original Request
用户需要一个工具，将 Obsidian 中使用 YAML frontmatter + Markdown 编写的 NPC 数据转换为 Foundry VTT v12 + dnd5e 4.3.9 兼容的 JSON 文件。

### Momus Review Fixes
Based on strict review, the following critical adjustments were made:
1.  **Spells Data Source**: Identified `spells.ldb` as a raw LevelDB SSTable fragment. Added fallback parsing strategy (binary extraction) but prioritized full LevelDB directory or JSON export.
2.  **Schema Validation**: Added "Golden Master" requirement - a reference NPC JSON exported from dnd5e 4.3.9 to serve as the ground truth for schema verification.
3.  **Source of Truth**: Designated `src/config/mapping.ts` as the single source of truth for field mappings.
4.  **Toolchain Consistency**: Unified on **Bun** for package management, testing, and execution.

---

## Data Model Specification (Source of Truth)

### Supported Fields Checklist
Implementation MUST support exactly these fields in `src/config/mapping.ts`:

| Chinese Key | Target dnd5e Path | Type/Notes |
|-------------|-------------------|------------|
| 名称 | name | string |
| 类型 | type | "npc" (fixed) |
| 力量 | system.abilities.str.value | number |
| 敏捷 | system.abilities.dex.value | number |
| 体质 | system.abilities.con.value | number |
| 智力 | system.abilities.int.value | number |
| 感知 | system.abilities.wis.value | number |
| 魅力 | system.abilities.cha.value | number |
| 生命值 | system.attributes.hp.value | number + max |
| 护甲等级 | system.attributes.ac.flat | number (calc="flat") |
| 速度 | system.attributes.movement | object (walk, fly, etc) |
| 先攻 | system.attributes.init.bonus | number |
| 挑战等级 | system.details.cr | number |
| 经验值 | system.details.xp.value | number |
| 熟练加值 | system.attributes.prof | number |
| 豁免熟练 | system.abilities.*.proficient | 1 (proficient) |
| 技能 | system.skills.*.value | 1 (prof), 2 (expert) |
| 伤害抗性 | system.traits.dr | array (value) |
| 伤害免疫 | system.traits.di | array (value) |
| 状态免疫 | system.traits.ci | array (value) |
| 感官 | system.traits.senses | object (darkvision, etc) |
| 语言 | system.traits.languages | array (value) |
| 传记/背景 | system.details.biography.value | string (HTML) |

### Spell UUID Strategy
- **Source**: `data/spells.ldb` (Binary Fragment)
- **Extraction**:
  - Locate `!items!` marker.
  - Parse subsequent JSON payload using **Brace Counting**.
  - Extract `_id` from payload. This is the **UUID**.
  - **Fallback**: If `_id` missing, generate random ID and log warning (spell will not link to compendium).
- **Linkage**:
  - Store spell reference as an Item with `type: "spell"`.
  - Set `flags.core.sourceId` to `Compendium.dnd5e.spells.Item.${UUID}`.

---

## Work Objectives

### Core Objective
Build a robust TypeScript CLI tool to convert Obsidian NPC notes to Foundry VTT dnd5e 4.3.9 JSON.

### Concrete Deliverables
- `src/index.ts`: CLI entry point
- `src/core/`: Core logic modules
  - `parser/`: YAML & Action parsers
  - `mapper/`: Chinese -> dnd5e mapping
  - `generator/`: Actor/Activity generation
  - `utils/`: Comparison & Normalization tools
- `src/config/mapping.ts`: Definitive code source of mappings
- `data/golden-master.json`: Verified dnd5e 4.3.9 NPC export
- `templates/npc-example.md`: Comprehensive input template
- `tests/`: Integration and unit tests

### Definition of Done
- [x] `bun test` passes with >90% coverage of core logic
- [x] Generated JSON passes **Partial Deep Equality Check** against `golden-master.json`
- [x] Spells can be resolved from the provided `spells.ldb` fragment or a proper export
- [x] Foundry Import Data accepts the output without warnings

---

## Verification Strategy (High Accuracy)

### 1. The "Golden Master" (Template Strategy)
- **Requirement**: `data/golden-master.json` (Real Export).
- **Acquisition Steps**:
  1. Open Foundry VTT (dnd5e 4.3.9).
  2. Create an NPC named "Adult Red Dragon".
  3. Manually fill in all stats to match SRD.
  4. Right-click Actor in sidebar -> "Export Data" -> "Export to JSON".
  5. Save as `data/golden-master.json`.
- **Generator Logic**:
  1. **Load** `golden-master.json`.
  2. **Clone** it as the base object.
  3. **Overwrite** *only* the mapped fields (from Checklist above).
  4. **Replace** `items` array with generated Actions/Spells.
- **Comparison Logic (Partial Deep Equal)**:
  - **System Data**: Strict deep equality on `system.*` fields (excluding `_id`, `sort`).
  - **Items**: Structural match only.
    - Assert that for every action in input, a corresponding Item exists in output.
    - **CRITICAL**: Validate `system.activities` instead of legacy fields.
      - Assert `activities[id].damage.parts` matches expectation.
      - Assert `activities[id].save.dc` matches expectation.
    - Ignore Item IDs, Activity IDs, and Flags for equality check.

### 2. Spells Data Verification
- **Algorithm**: "Key Marker + Brace Counting"
  1. Scan binary stream for `!items!`.
  2. Skip until first `{`.
  3. Count `{` (+1) and `}` (-1) until balance is 0.
  4. Attempt `JSON.parse` on the captured block.
  5. If valid, extract `name` and `_id`.

### 3. Field Mapping Verification
- **Source of Truth**: `src/config/mapping.ts` (Code-first).
- **Test**: Unit tests verify `FIELD_MAPPING` constants cover the Checklist above.

### 4. Code Coverage
- **Command**: `bun test --coverage`
- **Threshold**: >90% for `src/core/parser` and `src/core/generator`.

---

## Task Flow

```
[0. Setup & Data Ingestion]
          ↓
[1. Mapping Config] → [2. cn.json Mapper]
          ↓               ↓
[3. Spells Reader]      [4. YAML Parser]
          ↓               ↓
[5. Action Parser] ←──────┘
          ↓
[6. Activity Generator]
          ↓
[7. Actor Generator (Template-Based)]
          ↓
[8. Example Template] → [9. E2E Test] → [10. CLI]
```

---

## TODOs

- [x] 0. Project Setup & Data Ingestion

  **What to do**:
  - Initialize Bun project: `bun init`
  - Install: `js-yaml`, `marked`, `commander`, `opencc-js`
  - **Data Prep**:
    - Create `data/` directory.
    - Copy/Move root `spells.ldb` to `data/spells.ldb`.
    - Copy root `cn.json` to `data/cn.json`.
  - **BLOCKER**: Check for `data/golden-master.json`.
    - If missing, LOG ERROR and EXIT.
  - Configure `bun test` with coverage enabled.

  **Acceptance Criteria**:
  - `bun test` runs.
  - `data/spells.ldb` exists.
  - `data/cn.json` exists.
  - `data/golden-master.json` exists.

- [x] 1. Define Field Mapping Config

  **What to do**:
  - Create `src/config/mapping.ts`.
  - Export `FIELD_MAPPING` constant.
  - **CRITICAL**: Must implement the "Supported Fields Checklist" table above exactly.
  - Define types for `ParsedNPC`.

  **Acceptance Criteria**:
  - `src/config/mapping.ts` exports all required keys.
  - Type definitions match dnd5e 4.3.9 expectations.

- [x] 2. Build cn.json Reverse Mapper

  **What to do**:
  - Create `src/core/mapper/i18n.ts`.
  - Load `data/cn.json`.
  - Build `Map<string, string>` for Chinese -> Key.
  - normalization: Simplified/Traditional Chinese handling via opencc-js.
  - Test against `src/config/mapping.ts` keys.

  **Acceptance Criteria**:
  - Unit test: `mapper.get("力量")` returns "str".
  - Unit test: `mapper.get(" 力量 ")` (trimmed) returns "str".

- [x] 3. Build Spells Data Parser (Binary Extract)

  **What to do**:
  - Create `src/core/mapper/spells.ts`.
  - Implement **Brace Counting Extraction**:
    - Read `data/spells.ldb` as Buffer/Stream.
    - Find `!items!` -> Find start `{` -> Count braces -> Extract JSON -> `JSON.parse`.
    - Extract `name` and `_id` (UUID).
    - Store in `Map<string, SpellInfo>`.

  **Acceptance Criteria**:
  - `bun test` reads `data/spells.ldb`.
  - Successfully parses "Fireball" JSON payload.
  - Returns correct UUID from `_id` field.

- [x] 4. Build YAML Parser (Strict Mode)

  **What to do**:
  - Create `src/core/parser/yaml.ts`.
  - Parse frontmatter.
  - Iterate keys -> lookup in `FIELD_MAPPING`.
  - **Throw Error** on unknown keys.
  - Return typed `ParsedNPC` interface.

  **Acceptance Criteria**:
  - Test passes for valid "Adult Red Dragon" YAML.
  - Test throws for "InvalidField: 10".

- [x] 5. Build Action Parser

  **What to do**:
  - Create `src/core/parser/action.ts`.
  - Parse natural language action strings.
  - Extract: Name, Type (Melee/Ranged/Save), Range, Hit Bonus, Damage (dice + type), Save (DC + ability).
  - Output: Intermediate `ActionData` structure.

  **Acceptance Criteria**:
  - Input: `啮咬 [近战武器攻击]: +14命中, 触及10尺, 2d10+8穿刺`
  - Output matches expected `ActionData`.

- [x] 6. Build Activity Generator (dnd5e 4.3.x)

  **What to do**:
  - Create `src/core/generator/activity.ts`.
  - Convert `ActionData` to dnd5e `system.activities`.
  - **Strategy**: Construct strict schema-compliant object based on `ActionData`.
  - Handle: `type: "attack"`, `type: "save"`, `type: "utility"`.

  **Acceptance Criteria**:
  - Generated Activity JSON matches the structure of Golden Master activities (checked manually or via structural test).

- [x] 7. Build Actor Generator (Template-Based)

  **What to do**:
  - Create `src/core/generator/actor.ts`.
  - **Load** `data/golden-master.json`.
  - **Clone** and **Patch** fields from `ParsedNPC`.
  - **Regenerate** `items` array (Actions + Spells).
  - **Validation**: Perform **Partial Deep Equality Check** (System Exact, Items Structural - checking `activities`).

  **Acceptance Criteria**:
  - `bun test src/core/generator/actor.ts` passes.
  - Output contains correct Chinese -> dnd5e mappings.
  - Output contains valid spell references (UUIDs).

- [x] 8. Create Example NPC Template

  **What to do**:
  - Create `templates/npc-example.md` (Adult Red Dragon).
  - Must include ALL fields from the "Supported Fields Checklist".
  - Must include at least 1 Melee Attack, 1 Save Ability, 1 Spellcasting trait.

  **Acceptance Criteria**:
  - File exists and contains valid YAML frontmatter + Markdown body.

- [x] 9. End-to-End Test

  **What to do**:
  - Create `tests/e2e.test.ts`.
  - Load `templates/npc-example.md`.
  - Run full conversion pipeline.
  - Validate output against `data/golden-master.json` logic.

  **Acceptance Criteria**:
  - Test passes with 0 errors.

- [x] 10. CLI & Integration

  **What to do**:
  - Create `src/index.ts`.
  - Implement CLI: `bun run src/index.ts <file>`.
  - Error reporting: "Line X: Invalid damage format".
  - Success report: "Generated X.json with Y items".

  **Acceptance Criteria**:
  - Full conversion of `templates/npc-example.md` via CLI succeeds.

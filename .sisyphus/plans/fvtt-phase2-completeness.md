# Foundry VTT NPC Importer - Phase 2: Feature Completeness (Revised v5)

## Context
Momus identified schema inaccuracies:
- Passive items should OMIT `activation` field entirely.
- Activity `activation` is at root, not `system`.
- Documentation content was missing.

## Goals
Implement Feature, Reaction, Bonus, and Legendary parsing with **Golden-Master-verified schema**.

---

## Data Model Updates

### 1. Schema Validation (dnd5e 4.3.9)
- **Active Item**:
  - Item Level: `system.activation` exists (legacy/default).
  - Activity Level: `activity.activation` exists (source of truth).
- **Passive Item**:
  - Item Level: `system.activation` is **undefined/deleted**.
  - Activities: Empty object `{}`.

### 2. Cost Parsing Logic
- **Regex**: `/[\(（](?:Cost|消耗)[:\s]*(\d+)[\)）]/i`
- **Logic**: Extract `value`, strip match from name.

---

## Task Flow

```
[1. Config Update] → [2. YamlParser Update]
       ↓
[3. ActionParser Upgrade] (Value Extraction)
       ↓
[4. ActivityGen Upgrade] (Root Activation Override)
       ↓
[5. ActorGen Refactor] (Passive Omission & Orchestration)
       ↓
[6. Verification & Docs]
```

---

## TODOs

- [ ] 1. Update Config & Mappings
  - **File**: `src/config/mapping.ts`
  - **Action**: Add `features`, `reactions`, `bonus_actions` to `ParsedNPC`.
  - **Verification**: Check interface updates.

- [ ] 2. Update YamlParser
  - **File**: `src/core/parser/yaml.ts`
  - **Action**: Ensure `items` block handles `features`, `reactions`, `bonus_actions`.
  - **Verification**: Unit test checking these fields are populated.

- [ ] 3. Update ActionParser
  - **File**: `src/core/parser/action.ts`
  - **Action**:
    - Update `ActionData` interface: `activation?: { type: string, value?: number }`.
    - Add Regex `/\((?:Cost|消耗)[:\s]*(\d+)\)/i`.
    - Extract `value`, strip name.
  - **Verification**: Test case for `振翅 (消耗2)` -> `value: 2`.

- [ ] 4. Update ActivityGenerator
  - **File**: `src/core/generator/activity.ts`
  - **Action**:
    - Update `generate(action: ActionData, activationOverride?: any)`.
    - **Logic**: Apply `activationOverride` to `activity.activation` (ROOT level of activity object).
  - **Verification**: Test case ensuring `activation` is present on activity.

- [ ] 5. Update ActorGenerator (Orchestration)
  - **File**: `src/core/generator/actor.ts`
  - **Action**:
    - Update `createItemFromAction(action, activationOverride, isPassive)`.
    - **Active Logic**:
      - `item.system.activation = activationOverride` (Set item default).
      - Call `activityGen` with `activationOverride`.
    - **Passive Logic**:
      - `delete item.system.activation` (Strict Omission).
      - `item.system.activities = {}`.
    - **Loops**:
      - `features` -> `isPassive: true`.
      - `reactions` -> `override: { type: 'reaction', value: 1 }`.
      - `bonus_actions` -> `override: { type: 'bonus', value: 1 }`.
      - `legendary_actions` -> `override: { type: 'legendary', value: action.activation?.value || 1 }`.

- [ ] 6. Verification & Doc Creation
  - **File**: `tests/e2e.test.ts`
  - **Action**: Add test case:
    - `特性: [ 魔法抗性 ]` -> Item has NO `system.activation`.
    - `传奇动作: [ 振翅 (消耗2) ]` -> Activity has `activation.value: 2`.
  - **File**: `templates/universal-knowledge-base.md`
  - **Action**: Write the following content:

```markdown
# Foundry VTT NPC 导入标准格式 (通用知识库)

本文档定义了将 D&D 5e 怪物/NPC 数据转换为 Foundry VTT 可导入格式的标准规范。

## 2. 字段详解 (YAML)

### 动作与特性 (列表格式)
*   **动作** (`actions`): 标准动作。
*   **反应** (`reactions`): `名称: 描述`。
*   **附赠动作** (`bonus_actions`): `名称: 描述`。
*   **传奇动作** (`legendary_actions`): `名称 (消耗N): 描述`。
*   **特性** (`features`): 被动能力。`名称: 描述`。

### 示例
特性:
  - 魔法抗性: 对法术豁免具有优势。
反应:
  - 借机攻击: ...
传奇动作:
  - 振翅 (消耗2): ...
```

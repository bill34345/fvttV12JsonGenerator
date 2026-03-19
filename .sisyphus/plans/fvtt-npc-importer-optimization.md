# Foundry VTT NPC Importer - Optimization Plan (High Accuracy v2)

## Context

### Original Goal
A robust CLI tool to convert Obsidian NPC notes to Foundry VTT dnd5e 4.3.9 JSON.

### Current Status
- Basic importer works.
- `spells.ldb` binary parsing works.
- Basic fields mapped.

### Optimization Goals (Based on "Golden Master" & Socratic Dialogue)
The user provided a high-quality "Golden Master" (Ancient Brass Dragon) and we agreed on 4 key architectural upgrades:

1.  **Skills (0.5 Proficiency)**: Support "Jack of All Trades" logic.
    -   Input: `历史: 半熟练` or `value: 0.5`.
    -   Output: `system.skills.his.value = 0.5`.
2.  **Damage Modifications (`dm`/`dv`)**: Support complex damage adjustments.
    -   Input: `伤害易伤: [火焰]`, `伤害调整: { 火焰: -5 }`.
    -   Output: `traits.dv`, `traits.dm`.
3.  **Lair System**: Explicit separation of Actions vs Effects.
    -   Input: `巢穴动作:` (Init 20) vs `巢穴效应:` (Passive).
    -   Output:
        -   Lair Actions -> Items with activation `lair`.
        -   Regional Effects -> Items with flag `tidy5e-sheet.section: "巢穴效应"`.
4.  **Spellcasting (Hybrid Strategy)**:
    -   **Primary**: Consolidated "Spellcasting" Feature with `cast` activities linking to UUIDs (from `spells.ldb`).
    -   **Fallback**: If UUID not found, generate standalone "Innate Spell" Item (`type: spell`, `mode: innate`).

---

## Data Model Updates

### New Field Mappings (src/config/mapping.ts)

| Chinese Key | Target dnd5e Path | Type | Logic |
|-------------|-------------------|------|-------|
| 半熟练 | value = 0.5 | value | Special enum in `YamlParser` |
| 伤害易伤 | system.traits.dv | array | Standard array mapping |
| 伤害调整 | system.traits.dm | object | Complex object `amount: { type: value }` |
| 巢穴动作 | lair_actions | array | New parsing bucket |
| 巢穴效应 | regional_effects | array | New parsing bucket |

### Activity Schema (dnd5e 4.3.x)
- **Cast Activity**:
  ```json
  {
    "type": "cast",
    "spell": { "uuid": "Compendium...UUID" },
    "override": { "activation": true, "consumption": true }
  }
  ```

---

## Verification Strategy

### 1. Golden Master Validation (Partial)
- Use `data/golden-master.json` (Ancient Brass Dragon) to verify the *structure* of `dm` and `spellcasting` feature.
- **Key Check**: `traits.dm.amount.fire` should be `"-5"`.

### 2. Logic Verification
- **Skill 0.5**: Input `半熟练` -> Output `0.5`.
- **Spell Fallback**: Input "Unknown Spell" -> Output Item `type: spell`. Input "Fireball" -> Output Activity `type: cast` inside Feature.

---

## Task Flow

```
[1. Config Update] → [2. YamlParser Upgrade]
       ↓                     ↓
[3. ActivityGen Upgrade] ← [4. ActorGen Upgrade]
       ↓
[5. E2E Verification]
```

---

## TODOs

- [ ] 1. Update Config & Mappings
  - **File**: `src/config/mapping.ts`
  - **Action**:
    - Add `dv` (Vulnerability) mapping.
    - Add `dm` (Modification) mapping.
    - Add `lair_actions` and `regional_effects` to `ParsedNPC` interface.
    - Update `FIELD_MAPPING` keys.

- [ ] 2. Upgrade YamlParser (Skills & Complex Fields)
  - **File**: `src/core/parser/yaml.ts`
  - **Action**:
    - Update `parseSkills`: Handle "半熟练" -> 0.5.
    - Implement `parseDamageMod`: Handle `{ 火焰: -5 }` -> `dm.amount`.
    - Handle `lair_actions` and `regional_effects` buckets.

- [ ] 3. Upgrade ActivityGenerator (Cast Activity)
  - **File**: `src/core/generator/activity.ts`
  - **Action**:
    - Add `generateCast(uuid: string, overrides: any)` method.
    - Generate correct `cast` activity structure compatible with dnd5e 4.3.9.

- [ ] 4. Upgrade ActorGenerator (Hybrid Spells & Lair)
  - **File**: `src/core/generator/actor.ts`
  - **Action**:
    - **Spell Logic**:
      - Iterate `parsed.spellcasting`.
      - Lookup UUID in `spellsMapper`.
      - If found: Add to "Spellcasting" Feature activities.
      - If missing: Create standalone "Innate Spell" Item.
    - **Lair Logic**:
      - `lair_actions`: Generate Items with `activation: { type: "lair", value: 1 }`.
      - `regional_effects`: Generate Feats with `flags: { tidy5e-sheet: { section: "巢穴效应" } }`.
    - **Damage Mod**: Apply `dm` structure correctly.

- [ ] 5. Verification (E2E)
  - **File**: `tests/e2e.test.ts`
  - **Action**: Update test case to include:
    - Skill 0.5
    - Damage Mod
    - Mixed Spells (Known vs Unknown)
    - Lair Actions
  - Run `bun test`.

- [ ] 6. Final Template Update
  - **File**: `templates/npc-example.md`
  - **Action**: Update the template to include examples of all new features (Optimization showcase).

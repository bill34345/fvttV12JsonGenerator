# Foundry VTT NPC Importer - Comprehensive Optimization Plan v2

## Context

### Original Goal
A robust CLI tool to convert Obsidian NPC notes to Foundry VTT dnd5e 4.3.9 JSON.

### Audit Summary
Based on comprehensive audit against FVTT v12 + dnd5e 4.3.9 official schemas and cross-reference with 5e-statblock-importer (SBI), the following issues were identified:

| Issue | Severity | Category |
|-------|----------|----------|
| generateCast() wrong structure | ❌ Critical | Schema |
| Regional effects hardcoded Chinese | ❌ Critical | Localization |
| Skills initialization gaps | ❌ Critical | Data Loss |
| Lair action missing subtype | ⚠️ Minor | Schema |
| Damage bypasses not detected | ⚠️ Enhancement | Feature |
| Lair initiative not extracted | ⚠️ Enhancement | Feature |
| Legendary action count not extracted | ⚠️ Enhancement | Feature |
| AOE template mapping incomplete | ⚠️ Enhancement | Feature |

### Reference Implementation
- **5e-statblock-importer (SBI)**: https://github.com/Aioros/5e-statblock-importer
- **Key files**: `sbiParser.js`, `sbiActor.js`, `sbiRegex.js`
- **Patterns to adopt**: Damage bypass detection, lair initiative extraction, legendary action counting, AOE template mapping

---

## Task Dependency Graph

```
[Task 1: generateCast Fix] ──────┐
                                  ├─→ [Task 5: SBI Damage Bypasses]
[Task 2: Regional Effects Fix] ──┤
                                  ├─→ [Task 6: SBI Lair Initiative]
[Task 3: Skills Init Fix] ───────┤
                                  ├─→ [Task 7: SBI Legendary Actions]
[Task 4: Lair Subtype Fix] ──────┘
                                  └─→ [Task 8: AOE Template Verification]
                                           │
                                           └─→ [Task 9: E2E Verification]
```

**Parallel Execution Graph**:
- **Wave 1 (Independent)**: Tasks 1, 2, 3, 4 can run in parallel
- **Wave 2 (Depends on Wave 1)**: Tasks 5, 6, 7, 8 can run in parallel
- **Wave 3 (Depends on Wave 2)**: Task 9

---

## Data Model Updates

### Schema Fixes (dnd5e 4.3.9)

| Component | Current (Wrong) | Expected (Correct) |
|-----------|-----------------|-------------------|
| Cast Activity | `cast: { spell: uuid }` | `spell: { uuid: uuid }` |
| Regional Effects | `flags: { "tidy5e-sheet": { section: "巢穴效应" } }` | Localization-aware + `system.source` + `system.activities` |
| Skills (new) | Skipped if not in base | `{ value: val, ability: str, bonuses: {} }` |
| Lair Actions | No subtype | `system.type.subtype: 'lair'` |

### SBI Enhancements

| Feature | Input Pattern | Output Field |
|---------|--------------|--------------|
| Damage Bypasses | "nonmagical weapons" | `traits.dr.bypasses: ["mgc"]` |
| Damage Bypasses | "adamantine" | `traits.dr.bypasses: ["ada"]` |
| Damage Bypasses | "silvered" | `traits.dr.bypasses: ["sil"]` |
| Lair Initiative | "initiative count 20" | `system.resources.lair.initiative: 20` |
| Legendary Actions | "can take 3 legendary actions" | `system.resources.legact.max: 3` |

---

## Verification Strategy

### 1. Schema Validation
- Run `bun test` with updated test fixtures
- Verify `generateCast` output matches dnd5e 4.x schema
- Verify regional effects have complete structure

### 2. Golden Master Comparison
- Compare output against `data/golden-master.json`
- Focus on: `traits.dr.bypasses`, `system.resources.lair.initiative`, `system.resources.legact.max`

### 3. E2E Test Cases
- Legendary creature (Adult Red Dragon): 3 legendary actions, lair initiative 20
- Spellcaster: `cast` activity with `spell.uuid` structure
- Bypass creature: "resistance to bludgeoning from nonmagical attacks" → `mgc` in bypasses

---

## Final Verification Wave

- [ ] All tests pass: `bun test`
- [ ] Golden master comparison successful
- [ ] E2E test cases verified
- [ ] User approval before marking complete

---

## Task List

- [x] Task 1: Fix generateCast() Structure [CRITICAL]
- [x] Task 2: Fix Regional Effects Localization [CRITICAL]
- [x] Task 3: Fix Skills Initialization [CRITICAL]
- [x] Task 4: Add Lair Action Subtype [MINOR]
- [x] Task 5: Add Damage Bypasses Detection [ENHANCEMENT]
- [x] Task 6: Add Lair Initiative Extraction [ENHANCEMENT]
- [x] Task 7: Add Legendary Action Count Extraction [ENHANCEMENT]
- [x] Task 8: Verify AOE Template Mapping [ENHANCEMENT]
- [x] Task 9: E2E Verification [FINAL]

### Task 1: Fix generateCast() Structure [CRITICAL]

**File**: `src/core/generator/activity.ts`
**Method**: `generateCast()`
**Current Issue**: Generates `cast: { spell: uuid }` but dnd5e 4.x expects `spell: { uuid: uuid }`

**Changes**:
```typescript
// BEFORE (Wrong)
public generateCast(spellUuid: string): Record<string, any> {
  return {
    [id]: {
      _id: id,
      type: 'cast',
      cast: { spell: spellUuid },
      sort: 0
    }
  };
}

// AFTER (Correct)
public generateCast(spellUuid: string): Record<string, any> {
  return {
    [id]: {
      _id: id,
      type: 'cast',
      spell: { uuid: spellUuid },
      sort: 0
    }
  };
}
```

**Delegation Recommendation**:
- Category: `quick`
- Skills: [`Code`]

**Skills Evaluation**:
- TypeScript type changes: Low complexity
- API compatibility: None
- Data migration: None

**QA Scenario**:
1. Run `bun test src/core/generator/__tests__/activity.test.ts`
2. Verify `generateCast("Compendium.dnd5e.spells.Item.fireball")` returns structure with `spell: { uuid: "..." }`
3. Verify no `cast` property exists in output

**Expected Result**: Activity object with correct dnd5e 4.x spell UUID structure

---

### Task 2: Fix Regional Effects Localization [CRITICAL]

**File**: `src/core/generator/actor.ts`
**Location**: Lines 302-338 (regional effects generation)
**Current Issue**: 
1. Hardcoded Chinese `"巢穴效应"` breaks English route
2. Missing `system.source` and `system.activities`

**Changes**:
```typescript
// BEFORE
flags: { "tidy5e-sheet": { section: "巢穴效应", actionSection: "巢穴效应" } }

// AFTER
const isChinese = this.route === 'chinese';
flags: { 
  "tidy5e-sheet": { 
    section: isChinese ? "巢穴效应" : "Regional Effects", 
    actionSection: isChinese ? "巢穴效应" : "Regional Effects" 
  } 
},
system.source: { custom: 'Imported' },
system.activities: {}
```

**Delegation Recommendation**:
- Category: `quick`
- Skills: [`Code`]

**Skills Evaluation**:
- Localization handling: Medium complexity
- Schema compliance: Low complexity
- Backward compatibility: None (fixes broken behavior)

**QA Scenario**:
1. Run `bun test` with both Chinese and English fixtures
2. Verify Chinese route: `flags["tidy5e-sheet"].section === "巢穴效应"`
3. Verify English route: `flags["tidy5e-sheet"].section === "Regional Effects"`
4. Verify both routes have `system.source` and `system.activities`

**Expected Result**: Regional effects work in both Chinese and English routes with complete dnd5e 4.x structure

---

### Task 3: Fix Skills Initialization [CRITICAL]

**File**: `src/core/generator/actor.ts`
**Location**: Skills update section in `generate()` method
**Current Issue**: Only updates skills that already exist in base actor; new skills silently discarded

**Changes**:
```typescript
// BEFORE
if (actor.system.skills[key]) {
  actor.system.skills[key].value = val;
}

// AFTER
const SKILL_ABILITIES = {
  acr: 'dex', ani: 'wis', arc: 'int', ath: 'str',
  dec: 'cha', his: 'int', ins: 'wis', itm: 'cha',
  inv: 'int', med: 'wis', nat: 'int', prc: 'wis',
  prf: 'cha', per: 'cha', rel: 'int', slt: 'dex',
  ste: 'dex', sur: 'wis'
};

if (!actor.system.skills[key]) {
  actor.system.skills[key] = {
    value: 0,
    ability: SKILL_ABILITIES[key] || 'int',
    bonuses: { check: "", passive: "" }
  };
}
actor.system.skills[key].value = val;
```

**Delegation Recommendation**:
- Category: `unspecified-low`
- Skills: [`Code`]

**Skills Evaluation**:
- Data structure: Low complexity
- Mapping completeness: Medium complexity (need full SKILL_ABILITIES map)
- Silent failure prevention: High impact

**QA Scenario**:
1. Run `bun test` with fixture that includes non-standard skills (e.g., "历史" → `his`)
2. Verify `actor.system.skills.his` exists with `value`, `ability: 'int'`, `bonuses`
3. Verify existing skills (ste, prc) still update correctly

**Expected Result**: All parsed skills appear in output JSON with complete structure

---

### Task 4: Add Lair Action Subtype [MINOR]

**File**: `src/core/generator/actor.ts`
**Location**: `createItemFromAction()` method
**Current Issue**: Lair actions don't set `system.type.subtype`

**Changes**:
```typescript
// In createItemFromAction, after setting activation.type
if (activationType === 'lair') {
  item.system.type = { value: 'monster', subtype: 'lair' };
}
```

**Delegation Recommendation**:
- Category: `quick`
- Skills: [`Code`]

**Skills Evaluation**:
- Schema compliance: Low complexity
- UI impact: May improve Tidy5e categorization

**QA Scenario**:
1. Generate actor with lair actions
2. Verify `system.type.subtype === 'lair'` on lair action items
3. Verify non-lair items unaffected

**Expected Result**: Lair actions have proper subtype for schema compliance

---

### Task 5: Add Damage Bypasses Detection [ENHANCEMENT]

**Files**: 
- `src/core/parser/yaml.ts` (Chinese route)
- `src/core/parser/english.ts` (English route)
- `src/core/generator/actor.ts` (output generation)

**Reference**: `5e-statblock-importer/sbiParser.js` - `parseDamagesAndConditions()`

**Current Issue**: Damage resistances/immunities don't detect bypass keywords

**Changes**:
```typescript
// In parser, after extracting damage types
function detectBypasses(text: string): string[] {
  const bypasses = [];
  if (/nonmagical\s(weapons|attacks)/i.test(text)) bypasses.push('mgc');
  if (/adamantine/i.test(text)) bypasses.push('ada');
  if (/silvered/i.test(text)) bypasses.push('sil');
  return bypasses;
}

// In generator, when setting traits.dr/di/dv
if (parsed.traits.dr) {
  actor.system.traits.dr = { 
    value: parsed.traits.dr.value || parsed.traits.dr, 
    custom: '', 
    bypasses: parsed.traits.dr.bypasses || [] 
  };
}
```

**Delegation Recommendation**:
- Category: `unspecified-low`
- Skills: [`Code`]

**Skills Evaluation**:
- Regex complexity: Low
- Integration complexity: Medium (need to pass bypass data from parser to generator)
- Impact: High (critical for proper damage calculation in Foundry)

**QA Scenario**:
1. Parse creature with "resistance to bludgeoning, piercing, and slashing from nonmagical attacks"
2. Verify `traits.dr.value` contains damage types
3. Verify `traits.dr.bypasses` contains `['mgc']`
4. Test with adamantine and silvered keywords

**Expected Result**: Bypass codes correctly populate `traits.dr/di/dv.bypasses`

---

### Task 6: Add Lair Initiative Extraction [ENHANCEMENT]

**Files**:
- `src/core/parser/yaml.ts` or `src/core/parser/action.ts`
- `src/core/generator/actor.ts`

**Reference**: `5e-statblock-importer/sbiActor.js` - `setMajorActions(Blocks.lairActions.id)`

**Current Issue**: Lair initiative count not extracted from descriptions

**Changes**:
```typescript
// In parser, extract from lair actions description
const lairInitiativeRegex = /(?:on\s+)?initiative\s+(?:count\s+)?(\d+)/i;
const match = lairActionsDescription.match(lairInitiativeRegex);
if (match) {
  parsed.lairInitiative = parseInt(match[1]);
}

// In generator
if (parsed.lairInitiative) {
  actor.system.resources.lair = { 
    value: true, 
    initiative: parsed.lairInitiative 
  };
}
```

**Delegation Recommendation**:
- Category: `quick`
- Skills: [`Code`]

**Skills Evaluation**:
- Regex extraction: Low complexity
- Field mapping: Low complexity
- Impact: Medium (affects encounter automation in Foundry)

**QA Scenario**:
1. Parse creature with "On initiative count 20 (losing initiative ties)"
2. Verify `system.resources.lair.value === true`
3. Verify `system.resources.lair.initiative === 20`
4. Test with default (no explicit initiative) → should default to 20

**Expected Result**: Lair initiative correctly extracted and stored

---

### Task 7: Add Legendary Action Count Extraction [ENHANCEMENT]

**Files**:
- `src/core/parser/yaml.ts` or `src/core/parser/action.ts`
- `src/core/generator/actor.ts`

**Reference**: `5e-statblock-importer/sbiParser.js` - `parseMajorFeatureInfo()`

**Current Issue**: Legendary action count not extracted from descriptions

**Changes**:
```typescript
// In parser, extract from legendary actions section
const legendaryCountRegex = /(?:can\s+take\s+)?(\d+)\s+legendary\s+actions?/i;
const match = legendaryActionsDescription.match(legendaryCountRegex);
if (match) {
  parsed.legendaryActionCount = parseInt(match[1]);
}

// In generator
if (parsed.legendaryActionCount) {
  actor.system.resources.legact = { 
    value: parsed.legendaryActionCount, 
    max: parsed.legendaryActionCount 
  };
}
```

**Delegation Recommendation**:
- Category: `quick`
- Skills: [`Code`]

**Skills Evaluation**:
- Regex extraction: Low complexity
- Field mapping: Low complexity
- Impact: High (critical for legendary action economy)

**QA Scenario**:
1. Parse creature with "The dragon can take 3 legendary actions"
2. Verify `system.resources.legact.value === 3`
3. Verify `system.resources.legact.max === 3`
4. Test with "1 legendary action" → `value: 1, max: 1`

**Expected Result**: Legendary action count correctly extracted and stored

---

### Task 8: Verify AOE Template Mapping [ENHANCEMENT]

**Files**:
- `src/core/parser/action.ts` (AOE shape parsing)
- `src/core/generator/activity.ts` (template generation)

**Reference**: `5e-statblock-importer/sbiParser.js` - `parseTarget()`

**Current Issue**: Verify all AOE shapes map correctly to `target.template`

**Changes**:
```typescript
// Verify these mappings exist and work:
const AOE_SHAPES = {
  'cone': 'cone',
  'cube': 'cube', 
  'cylinder': 'cylinder',
  'line': 'line',
  'sphere': 'sphere',
  'square': 'rect'  // dnd5e uses 'rect' for squares
};

// In activity template
if (target.shape) {
  activity.target.template = {
    type: AOE_SHAPES[target.shape.toLowerCase()] || target.shape,
    size: target.range,
    units: 'ft'
  };
}
```

**Delegation Recommendation**:
- Category: `unspecified-low`
- Skills: [`Code`]

**Skills Evaluation**:
- Shape mapping: Low complexity
- Validation complexity: Medium (need to test all shapes)
- Impact: Medium (affects spell/ability targeting in Foundry)

**QA Scenario**:
1. Parse "15-foot cone of fire" → `target.template.type: 'cone'`, `size: 15`
2. Parse "20-foot-radius sphere" → `target.template.type: 'sphere'`, `size: 20`
3. Parse "30-foot line" → `target.template.type: 'line'`, `size: 30`
4. Parse "10-foot cube" → `target.template.type: 'cube'`, `size: 10`
5. Parse "5-foot square" → `target.template.type: 'rect'`, `size: 5`

**Expected Result**: All AOE shapes correctly map to dnd5e template types

---

### Task 9: E2E Verification [FINAL]

**File**: `src/core/generator/__tests__/e2e.test.ts` (create if missing)

**Current Issue**: Need comprehensive E2E tests for all fixes

**Changes**: Create test suite covering:
1. **Legendary creature test**: Adult Red Dragon
   - 3 legendary actions (`system.resources.legact.max === 3`)
   - Lair initiative 20 (`system.resources.lair.initiative === 20`)
   - Regional effects with proper flags and structure

2. **Spellcaster test**: Mage with Fireball
   - `cast` activity with `spell.uuid` structure
   - No `cast: { spell: uuid }` structure

3. **Bypass test**: Creature with "resistance to nonmagical attacks"
   - `traits.dr.bypasses` contains `['mgc']`

4. **Skills test**: Creature with "历史: 半熟练"
   - `actor.system.skills.his` exists with `value: 0.5`

**Delegation Recommendation**:
- Category: `unspecified-low`
- Skills: [`Code`]

**Skills Evaluation**:
- Test fixture creation: Medium complexity
- Assertion coverage: High complexity
- Impact: Critical (prevents regressions)

**QA Scenario**:
1. Run `bun test`
2. Verify all 4 test cases pass
3. Verify no existing tests broken
4. Verify code coverage ≥ 80%

**Expected Result**: Comprehensive test suite prevents regression of all fixes

---

## Category + Skills Recommendations

| Task | Category | Skills | Rationale |
|------|----------|--------|-----------|
| Task 1: generateCast Fix | `quick` | [`Code`] | Simple structure change, no complex logic |
| Task 2: Regional Effects | `quick` | [`Code`] | Localization flag fix + 2 fields |
| Task 3: Skills Init | `unspecified-low` | [`Code`] | Need skill-ability mapping constant |
| Task 4: Lair Subtype | `quick` | [`Code`] | One-line change |
| Task 5: Damage Bypasses | `unspecified-low` | [`Code`] | Regex extraction + data passing |
| Task 6: Lair Initiative | `quick` | [`Code`] | Simple regex extraction |
| Task 7: Legendary Actions | `quick` | [`Code`] | Simple regex extraction |
| Task 8: AOE Templates | `unspecified-low` | [`Code`] | Verification + mapping |
| Task 9: E2E Tests | `unspecified-low` | [`Code`] | Test creation + fixtures |

**Skills Evaluation Summary**:
- All tasks require `Code` skill (TypeScript implementation)
- No architecture changes needed
- No external API dependencies
- All tasks are low-to-medium complexity

---

## Actionable TODO List for Caller

### Wave 1: Critical Schema Fixes (Parallel Execution)

```bash
# Task 1: Fix generateCast() structure
task(category="quick", load_skills=["Code"], run_in_background=false, prompt="[Task 1] Fix generateCast() in src/core/generator/activity.ts. Change 'cast: { spell: uuid }' to 'spell: { uuid: uuid }' to match dnd5e 4.x schema. Verify with bun test.")

# Task 2: Fix Regional Effects localization
task(category="quick", load_skills=["Code"], run_in_background=false, prompt="[Task 2] Fix regional effects in src/core/generator/actor.ts lines 302-338. Add localization-aware tidy5e-sheet flags (Chinese vs English), add system.source and system.activities. Verify with bun test.")

# Task 3: Fix Skills initialization
task(category="unspecified-low", load_skills=["Code"], run_in_background=false, prompt="[Task 3] Fix skills initialization in src/core/generator/actor.ts. Add SKILL_ABILITIES constant mapping (acr→dex, ani→wis, etc.). Initialize missing skills with {value:0, ability:default, bonuses:{}} instead of skipping. Verify with bun test.")

# Task 4: Add Lair Action subtype
task(category="quick", load_skills=["Code"], run_in_background=false, prompt="[Task 4] Add lair action subtype in src/core/generator/actor.ts createItemFromAction(). When activationType==='lair', set item.system.type={value:'monster', subtype:'lair'}. Verify with bun test.")
```

### Wave 2: SBI Feature Enhancements (Parallel Execution)

```bash
# Task 5: Add Damage Bypasses detection
task(category="unspecified-low", load_skills=["Code"], run_in_background=false, prompt="[Task 5] Add damage bypasses detection. In parser (yaml.ts/english.ts), detect 'nonmagical weapons/attacks'→'mgc', 'adamantine'→'ada', 'silvered'→'sil'. Pass bypasses array to generator. In actor.ts, populate traits.dr/di/dv.bypasses. Verify with bun test.")

# Task 6: Add Lair Initiative extraction
task(category="quick", load_skills=["Code"], run_in_background=false, prompt="[Task 6] Add lair initiative extraction. Parse lair actions description for 'initiative count N'. Set system.resources.lair.initiative=N and system.resources.lair.value=true. Verify with bun test.")

# Task 7: Add Legendary Action Count extraction
task(category="quick", load_skills=["Code"], run_in_background=false, prompt="[Task 7] Add legendary action count extraction. Parse legendary actions description for 'N legendary actions'. Set system.resources.legact.value=N and system.resources.legact.max=N. Verify with bun test.")

# Task 8: Verify AOE Template mapping
task(category="unspecified-low", load_skills=["Code"], run_in_background=false, prompt="[Task 8] Verify AOE template mapping. Check src/core/parser/action.ts and src/core/generator/activity.ts. Ensure cone→cone, cube→cube, cylinder→cylinder, line→line, sphere→sphere, square→rect. Add tests for all shapes. Verify with bun test.")
```

### Wave 3: Final Verification (Sequential)

```bash
# Task 9: E2E Verification
task(category="unspecified-low", load_skills=["Code"], run_in_background=false, prompt="[Task 9] Create comprehensive E2E test suite in src/core/generator/__tests__/e2e.test.ts. Test cases: (1) Legendary creature with 3 actions + lair initiative 20, (2) Spellcaster with cast activity using spell.uuid structure, (3) Creature with damage bypasses 'mgc', (4) Creature with skill '半熟练'→0.5. Verify all pass with bun test.")
```

# Item Model Learnings

## Created: src/core/models/item.ts

### Patterns Applied

1. **ParsedNPC pattern** (from `src/config/mapping.ts`):
   - Nested interfaces for complex structures
   - Type unions for constrained values
   - Optional fields marked with `?`

2. **dnd5e item structure** (from `staff-of-the-magi.json`):
   - Physical: `quantity`, `weight` ({value, units}), `price` ({value, denomination})
   - Equippable: `attunement` ("required"/"optional"/"none"), `equipped`
   - Weapon: `damage` ({base, versatile}), `range` ({value, long, units, reach}), `properties` []
   - Equipment: `armor` ({value})
   - Consumable: `uses` ({max, recovery [{period, type, formula}], spent})
   - Activities: Record of complex activity objects with type, activation, consumption, damage, save, spell

### TypeScript Interface Design

- `ItemType`: Union of 11 dnd5e item types
- `ParsedItem`: Main interface mirroring ParsedNPC structure with optional sections
- `DamageData`: Base + versatile damage structure (from dnd5e JSON)
- `ActivityData`: Complex nested activity (attack, cast, save, utility)
- `UsesData`: Charge-based recovery mechanism
- `SaveData`: Save DC structure
- `Trait`: Resistance/immunity/vulnerability tracking

### Reference Files Used

- `src/config/mapping.ts` - ParsedNPC pattern
- `references/dnd5e-4.3.9/repo/packs/_source/items/weapon/staff-of-the-magi.json` - complex item JSON structure
- `src/core/models/action.ts` - StructuredActionData import reference

## Created: src/core/generator/item-generator.ts

### Patterns Applied

1. **Golden master pattern** (from `actor.ts` lines 290-306):
   - `JSON.parse(JSON.stringify(template))` to deep clone reference template
   - Fallback to minimal template if reference loading fails

2. **Reference item loading** (from `references/dnd5e-4.3.9/repo/packs/_source/items/`):
   - Load first JSON file from type-specific directory as template
   - Directory mapping: `ItemType` -> subdirectory name (e.g., `consumable` -> `potion`, `staff` -> `weapon`)
   - Fallback to equipment template if directory empty

3. **Activity generation** (from `activity.ts` and `actor-item-builder.ts`):
   - Reuse `ActivityGenerator` class for structured actions (attacks, saves, utilities)
   - Sort order increments by 100000 for each activity

4. **Field patching**:
   - Direct assignment for simple fields (name, rarity, attunement, quantity)
   - Nested object creation for complex fields (description, price, weight, range, damage, armor, uses)
   - Identifier sanitization: lowercase, replace spaces with hyphens

### Key Utilities from actor-item-builder.ts

- `createDailyUses(value)` - creates daily uses structure
- `resolveItemActivationCost(type, legendaryCost?)` - resolves activation cost
- `buildItemRange(action)` - builds range object for weapons
- `structuredActionToActivityData(action)` - converts structured action to activity data
- `attachSubActivities(item, subActions, activityGenerator)` - attaches sub-activities

### Reference Files Used

- `src/core/generator/actor.ts` - golden master loading pattern
- `references/dnd5e-4.3.9/repo/packs/_source/items/equipment/cloak-of-protection.json` - simple equipment template
- `references/dnd5e-4.3.9/repo/packs/_source/items/weapon/staff-of-the-magi.json` - complex item with activities
- `src/core/generator/actor-item-builder.ts` - utility functions
- `src/core/generator/activity.ts` - ActivityGenerator class
- `src/core/models/item.ts` - ParsedItem, ItemType, ActivityData interfaces
- `src/core/parser/item-strategy.ts` - ItemParserStrategy interface

## Created: src/core/parser/item-parser.ts

### Patterns Applied

1. **Strategy pattern** (from `item-strategy.ts`):
   - Implements `ItemParserStrategy` interface
   - `readonly type = 'item' as const`
   - `canParse()` delegates to `detectItemRoute()`
   - `parse()` returns stub ParsedItem (full impl in T7-T10)

2. **Stub pattern**:
   - Minimal return object for now: `{ name, type, rarity, attunement }`
   - Full implementation deferred to T7-T10

### Reference Files Used

- `src/core/parser/item-strategy.ts` - ItemParserStrategy interface
- `src/core/parser/item-router.ts` - detectItemRoute() function
- `src/core/models/item.ts` - ParsedItem interface

## T11: src/index.ts Item Integration

### Changes Made

1. **Added imports** (line 1-2):
   - `mkdirSync` from `fs` for creating output directories for multi-stage items
   - `join` from `path` for path manipulation

2. **Replaced TODO block** (lines 173-211):
   - Dynamic imports for `ItemParser` and `ItemGenerator`
   - Parsing and generation logic following actor pattern
   - Multi-stage handling: creates directory and generates one file per stage
   - Single-stage handling: generates one JSON file

### Multi-Stage Output Format

When `parsed.stages?.length > 1`:
- Output path treated as directory
- Creates `baseName (stageName).json` for each stage
- Example: `三祷之坠 (休眠态).json`, `三祷之坠 (觉醒态).json`, `三祷之坠 (升华态).json`

### Known Issue

ItemGenerator.generate() always uses first stage's name/description if `parsed.stages` exists, even when passed stage-specific data. This is a limitation of ItemGenerator that should be addressed separately.

### Verification

Tested with properly formatted item markdown:
- Single-stage: `bun run src/index.ts "temp-items/骑士之盾.md" -o "temp-items/骑士之盾.json"` ✓
- Multi-stage: `bun run src/index.ts "temp-items/三祷之坠.md" -o "temp-items/test.json"` ✓
- All item-parser tests pass (21 tests) ✓

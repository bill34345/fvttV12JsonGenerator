# Learnings

## Lair Actions
- Lair actions in Foundry VTT dnd5e (v12+) should have `system.type.subtype` set to `'lair'`.
- This is handled in `src/core/generator/actor.ts` within the `createItemFromAction()` function by checking the `activationType` parameter.

## generateCast() structure update
- Updated `generateCast()` in `src/core/generator/activity.ts` to match dnd5e 4.x schema.
- Changed `cast: { spell: uuid }` to `spell: { uuid: uuid }`.
- Verified with unit tests in `src/core/generator/__tests__/activity.test.ts`.

## Regional Effects Localization
- Regional effects now use localization-aware tidy5e-sheet flags.
- Chinese route uses "巢穴效应" for section and actionSection.
- English route uses "Regional Effects" for section and actionSection.
- Added `system.source: { custom: 'Imported' }` and `system.activities: {}` to regional effect items.
- Updated `ActorGenerator` to track `route` and pass it through `GenerateOptions`.
- Added SKILL_ABILITIES mapping to ensure missing skills are correctly initialized with their default abilities in Foundry VTT.

## AOE Template Mapping (2026-03-20)
- Added support for "正方形" (square) mapping to "rect" in Foundry VTT.
- Updated `CHINESE_ACTION_REGEX.AOE` to include "正方形".
- Updated `ActionParser` shapeMap to include `'正方形': 'rect'`.
- Verified that `ActivityGenerator` correctly passes the shape type to the Foundry JSON structure.
- Added unit tests for all AOE shapes in `activity.test.ts` and regex tests in `chinese-regex.test.ts`.
## Legendary Action Count Extraction
- Added regex for legendary action count in both Chinese and English.
- Updated `ParsedNPC` interface to include `legact` field.
- Updated `YamlParser` and `EnglishBestiaryParser` to extract count from the first line of legendary actions section.
- Updated `ActorGenerator` to set `system.resources.legact` in the generated actor JSON.
- Verified with custom tests using `tsx` as `bun` was not available in the environment.
### Damage Bypasses Detection
- Implemented detection for 'mgc' (nonmagical), 'ada' (adamantine), and 'sil' (silvered) bypasses.
- Bypasses are extracted from damage resistance/immunity/vulnerability fields in both YAML and English Bestiary formats.
- The  interface was updated to carry a shared  array in .
-  now correctly populates  in the output JSON.
### Damage Bypasses Detection
- Implemented detection for "mgc" (nonmagical), "ada" (adamantine), and "sil" (silvered) bypasses.
- Bypasses are extracted from damage resistance/immunity/vulnerability fields in both YAML and English Bestiary formats.
- The ParsedNPC interface was updated to carry a shared bypasses array in traits.
- ActorGenerator now correctly populates system.traits.dr/di/dv.bypasses in the output JSON.
### E2E Test Suite Created
- Created comprehensive E2E test suite in `src/core/generator/__tests__/e2e.test.ts`.
- Verified legendary actions (3) and lair initiative (20) generation.
- Verified spellcasting with `spell.uuid` structure for linked spells and fallback to spell items for unlinked spells.
- Verified damage bypasses (`mgc`) in traits.
- Verified skill proficiency (`0.5` for '半熟练') generation.
- Used `npx bun test` to run tests as `bun` was not in the system path but available via `npx`.

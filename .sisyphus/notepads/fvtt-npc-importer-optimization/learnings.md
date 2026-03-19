# Learnings - Task 4: Upgrade ActorGenerator

## Implementation Details
- Upgraded `ActorGenerator` to support `dv` (Damage Vulnerabilities) and `dm` (Damage Modifiers?) traits.
- Added support for Lair Actions:
  - Parsed using `ActionParser`.
  - Activation set to `type: 'lair'`, `cost: 1`.
- Added support for Regional Effects:
  - Parsed as Feats.
  - Added specific flags for `tidy5e-sheet`: `{ section: "巢穴效应", actionSection: "巢穴效应" }`.
- Added support for Spellcasting:
  - Links to existing spells via `spellsMapper` and `ActivityGenerator.generateCast`.
  - Creates standalone spells (Innate) for unknown spells.
  - Generates a "Spellcasting" Feature Item if linked spells exist.

## Architectural Changes
- Added `generateCast` method to `ActivityGenerator` to support spell linking.
- Assumed `ParsedNPC` structure allows `lair_actions` and `regional_effects` as arrays, and `spellcasting` as array or object.

## Verification
- Added `actor_upgrade.test.ts` covering all new features.
- Validated correct JSON structure generation for Lair Actions and Regional Effects.

## Template Updates
- Updated `templates/npc-example.md` to include examples of all new features (Damage Mods, Lair Actions, Regional Effects, Spellcasting).

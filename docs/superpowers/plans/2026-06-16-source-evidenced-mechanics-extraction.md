# Source-Evidenced Mechanics Extraction Plan

## Goal

Move compound action mechanics from name/keyword heuristics into a source-evidenced extraction layer, so generated Foundry actor JSON only emits save DCs, abilities, damage, statuses, uses, and metadata when they are supported by the source markdown or structured input.

## Scope

- Build a deterministic first-pass extractor for compound rider actions.
- Use evidence records for shared rules such as "all venom effects use Constitution save DC 14".
- Generate save activities for rider options when the shared or local source text provides save mechanics.
- Keep non-native outcomes as metadata and description, not invented damage/effects.
- Add validation/report scaffolding that can later accept AI review output without changing generator call sites.

## Tasks

- [x] Add RED tests for Scuttling Serpentmaw venom rider extraction from source markdown text.
- [x] Add RED acceptance coverage that Venomous Bite generates base attack plus three save activities.
- [x] Implement `src/core/mechanics/mechanicsExtraction.ts` with evidence-backed shared save and rider extraction.
- [x] Replace ad hoc compound rider parsing in `src/core/generator/actor.ts` with the extractor.
- [x] Preserve explicitly parsed status effects and daily uses, but do not infer mechanics from rider names alone.
- [x] Add metadata for non-native rider outcomes such as hit-die loss, temp HP, and follow-up saves.
- [x] Run targeted tests, `bun run audit:anti-overfit`, CLI regeneration, and actor verification against real source markdown.

## Completion Criteria

- `tests/acceptance/scuttling-serpentmaw.acceptance.test.ts` verifies three source-derived venom save activities.
- A focused extractor test verifies inherited `con`/`DC 14`, Needling Bite `1d6 piercing`, and Vampiric Bite metadata.
- The real `obsidian/dnd数据转fvttjson/input/scuttling-serpentmaw__蛇口蛮蟹.md` regenerates to output JSON whose Venomous Bite activities match the updated source.
- `verify:actor` reports no warnings for the regenerated actor.
- Anti-overfit audit has no unaddressed findings from the new extraction code.

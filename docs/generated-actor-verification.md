# Generated Actor Verification

## Required Source-To-JSON Checks

For each generated Actor JSON, manually compare the generated output against the source markdown:

- Identity: name, bilingual name handling, creature type, size, and alignment.
- Core stats: AC, HP, hit dice, speeds, abilities, saves, and skills.
- Traits: senses, languages, damage resistances, damage immunities, damage vulnerabilities, and condition immunities.
- Actions: action count, action names, attack bonuses, reach or range, damage formulas, damage types, and descriptions.
- Saves and effects: DCs, save abilities, success and failure behavior, conditions, durations, and repeated-save rules.
- Legendary, reaction, and bonus actions: count, cost, activation type, and descriptions.
- Spellcasting: spell list, spell save DC, spell attack bonus, preparation or innate-casting rules, and linked UUIDs where expected.
- Automation: activities, active effects, flags, module-specific fields, and effect-profile behavior.
- Description fidelity: important source text is preserved or intentionally transformed.
- Source coverage: every mechanically relevant source markdown section is represented or intentionally excluded.
- No false effects: prerequisite-only text does not create on-hit effects unless the source explicitly applies that effect.
- Output provenance: final JSON came from the project CLI or workflow, not manual construction or repair.

## Version-Specific Checks

When generating for `--fvtt-version 14`, also check:

- Actor, embedded Item, and ActiveEffect `_stats` use Foundry `14.361` and dnd5e `5.3.3`.
- NPC resources use v14/dnd5e 5.x source fields such as `max` and `spent`, not legacy `value`.
- Senses use `system.attributes.senses.ranges.<sense>` plus `special`, not direct legacy sense fields.
- Item activities carry activation data; item-level `system.activation` is not used as the v14 source of truth.
- Save activities use `save.dc.calculation` and `save.dc.formula`; `save.dc.value` is prepared by dnd5e and should not be emitted as source data.
- Uses data omits legacy `value` and `per`; generated source should use `spent`, `max`, and `recovery`.
- Spell fallback items use `method` and `prepared`, not legacy `preparation.mode`.
- Active Effect changes target schema-backed v14 fields, for example AC flat/formula fields rather than legacy AC bonus fields.

When generating for `--fvtt-version 14 --effect-profile modded-v14`, also check:

- The locked module evidence is MIDI-QOL `14.0.9` and DAE `14.0.12`.
- Times Up fields or assumptions are not required for v14 output.
- Item Macro is not treated as a required dependency unless a v14-verified version is separately documented.
- `flags.midi-qol.OverTime` is emitted only when the source text explicitly provides a repeated-effect formula and damage type.
- The OverTime formula comes from the repeated-effect clause, not from an earlier hit or attack damage clause.
- Any macro-style automation remains guarded and falls back to GM manual handling when MIDI-QOL workflow context is missing.

## v14 Batch Acceptance

For project-internal v14 core acceptance without a local Foundry runtime, run:

```powershell
bun run src/tools/v14AcceptanceSuite.ts --out-dir "obsidian/dnd数据转fvttjson/output/v14-acceptance" --report "docs/acceptance/v14-core-batch-verification.md"
```

For project-internal v14 module-profile acceptance, run:

```powershell
bun run src/tools/v14AcceptanceSuite.ts --effect-profile modded-v14 --out-dir "obsidian/dnd数据转fvttjson/output/v14-modded-acceptance" --report "docs/acceptance/v14-modded-batch-verification.md"
```

The batch suite must:

- Generate every JSON artifact through the project conversion workflow with `--fvtt-version 14` and `core` semantics.
- For the modded suite, generate every JSON artifact through the same workflow with `--fvtt-version 14 --effect-profile modded-v14`.
- Disable optional translation services so acceptance output is source-faithful and not affected by external model behavior.
- Include a local GoddessFantasy fixture pipeline sample that covers crawl -> records -> plaintext -> actor JSON.
- Record actorVerification warnings in the report instead of treating schema success as semantic success.
- Keep live Foundry v14 import as an explicit unresolved runtime check when no local Foundry v14 runtime is available.

## Completion Standard

A generated Actor JSON result is correct only when:

- The project CLI or workflow regenerated the target JSON.
- The JSON parses.
- Relevant tests passed, or known baseline failures are explicitly separated from the current change.
- The source markdown comparison above was completed.
- Any Foundry, dnd5e, or module-dependent behavior was checked against locked local references for the target version.
- Any remaining uncertainty is reported with the exact source field, generated field, and reference gap.

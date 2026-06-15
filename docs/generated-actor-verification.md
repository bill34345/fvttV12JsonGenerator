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

## Completion Standard

A generated Actor JSON result is correct only when:

- The project CLI or workflow regenerated the target JSON.
- The JSON parses.
- Relevant tests passed, or known baseline failures are explicitly separated from the current change.
- The source markdown comparison above was completed.
- Any Foundry, dnd5e, or module-dependent behavior was checked against locked local references for the target version.
- Any remaining uncertainty is reported with the exact source field, generated field, and reference gap.

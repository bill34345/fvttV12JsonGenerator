# Generated Actor / Item Verification

## Required Source-To-JSON Checks

For each generated Actor JSON, manually compare the generated output against the source markdown:

- Identity: name, bilingual name handling, creature type, size, and alignment.
- Language and source fidelity: a single-language source remains in its source language, while existing bilingual text keeps its original correspondence; translation is not a prerequisite for acceptance.
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

When the source entered through document extraction, plaintext ingestion, or AI Intake, also trace the exact source identity through its source-scoped evidence/run artifacts, evidence IR where applicable, rendered Markdown, portable manifest evidence where applicable, and final JSON. Confirm that page/coordinate/language/confidence/line-order evidence for documents, and per-entity/aggregate equivalence for plaintext collections, were not replaced by an unrelated source or run.

For each generated standalone Item, also compare:

- Identity and category: bilingual name, source category, normalized Foundry document type, rarity, attunement, weight, price, and equipment subtype.
- Activities: inspect each `system.activities` entry for activation, target/range, consumption, uses/recovery, save/attack/damage, and its actual source-derived stage membership.
- Effects: every structured embedded effect exists once, has a unique ID, and is referenced only by the Activities that apply it; check each Activity-to-Effect linkage rather than only counting effects.
- Profile isolation: `core` contains no MIDI-QOL, DAE, Times Up, or Item Macro fields; a modded profile uses only the locked target-version contract.
- Stage provenance: names, requirements, uses, and mechanics come from structured source data. A literal-only stage must remain `needs_review`.
- Complex-rule boundary: if the locked target cannot express the source rule natively, the result must say `gm-assisted` or `external-rule` with preserved source text. Static JSON, a utility-shaped placeholder, or a passing verifier is not native automation acceptance.

## Shared Verification Gate

All supported entry points must run the same canonical generation pipeline. Before a formal write:

- Every canonical attack, damage, save outcome, activation, use, effect, range, and stage is projected once or explicitly marked `literal-only`/`unsupported`.
- Activity/Effect IDs are stable, 16 characters, unique within their document, and map keys equal Activity `_id` values.
- Duplicate IDs, dangling Effect references, lost mechanics, save-outcome drift, invalid target fields, or profile leakage are blocking errors.
- `needs_review` and `failed` results do not enter formal single-file output or collection ZIP artifacts.
- A source-scoped `needs_review`/`failed` result cannot be promoted by editing rendered Markdown or JSON by hand; regenerate from the accepted upstream chain instead.

## Version-Specific Checks

When generating for `--fvtt-version 12` or `13`, check:

- Actor, embedded Item, standalone Item, and ActiveEffect `_stats.systemVersion` are dnd5e `4.3.9`.
- Item activation lives on Activities; legacy Item-level `system.activation` is absent.
- Uses use `spent`, `max`, and `recovery`; legacy `value` and `per` are absent.
- The result passed locked 4.3.9 structural assertions. Do not report a Foundry runtime pass unless that exact artifact was imported and exercised in a separately recorded runtime.

When generating for `--fvtt-version 14`, also check:

- Actor, embedded Item, and ActiveEffect `_stats` use Foundry `14.364` and dnd5e `5.3.3`.
- NPC resources use v14/dnd5e 5.x source fields such as `max` and `spent`, not legacy `value`.
- Senses use `system.attributes.senses.ranges.<sense>` plus `special`, not direct legacy sense fields.
- Item activities carry activation data; item-level `system.activation` is not used as the v14 source of truth.
- Save activities use `save.dc.calculation` and `save.dc.formula`; `save.dc.value` is prepared by dnd5e and should not be emitted as source data.
- Uses data omits legacy `value` and `per`; generated source should use `spent`, `max`, and `recovery`.
- Spell fallback items use `method` and `prepared`, not legacy `preparation.mode`.
- Active Effect changes target schema-backed v14 fields, for example AC flat/formula fields rather than legacy AC bonus fields.
- If `--icon-mode safe` was used, every embedded/standalone Item has a catalogued Foundry core or dnd5e path, the adjacent `*.icon-review.json` records the chosen source/confidence/reasons, and fallback decisions remain explicit rather than being reported as semantic matches.
- Review representative exact mappings and all semantic mappings visually. Confirm close negatives remain on a type default or an explicit reviewed override.
- Runtime import/readback is a separate gate. State whether the exact project-local Foundry 14.364 runtime was available for this run.

When generating for `--fvtt-version 14 --effect-profile modded-v14`, also check:

- The current locked module target is MIDI-QOL `14.0.11` and DAE `14.0.12`. Reports executed against MIDI-QOL `14.0.9` remain historical evidence and do not prove the `14.0.11` runtime.
- Times Up fields or assumptions are not required for v14 output.
- Item Macro is not treated as a required dependency unless a v14-verified version is separately documented.
- `flags.midi-qol.OverTime` is emitted only when the source text explicitly provides a repeated-effect formula and damage type.
- The OverTime formula comes from the repeated-effect clause, not from an earlier hit or attack damage clause.
- Any macro-style automation remains guarded and falls back to GM manual handling when MIDI-QOL workflow context is missing.

## Portable Spellcaster Verification

For an Actor carrying `flags.fvtt-json-generator-spell-resolver.spellManifest`, verify the project artifact before importing it:

- `spellResolution.status` is `pending`; `pending` is the correct portable-project state, not a failed hydration claim.
- Every manifest ref is backed by an exact source evidence range and retains its source usage, ability, DC, attack bonus, component waiver, and literal restrictions.
- The Actor contains no placeholder embedded Spell, resolver-managed Cast Activity, local Actor/Item UUID, or destination Compendium UUID.
- Each manifest group links to exactly one real generated source feature by stable identity rather than item order or translated display name.
- The Actor was regenerated by the CLI/workflow and checked with the Intake verifier; hand-repairing the Actor invalidates this layer.

This is the portable/static layer: it proves portability and source fidelity only. It does not prove that any destination-world Spell exists, that hydration occurred, or that any spell can be cast.

## Target-World Resolver Report Verification

After ordinary Actor import into the exact supported Foundry/dnd5e runtime, inspect the resolver report:

- The source index includes every enabled and readable Item pack, including packs without a spell-specific manifest hint.
- All refs resolve before the first write; any missing, ambiguous, contradictory, stale, or undecided manual conflict withholds the whole plan.
- A matching 2024 candidate wins; a 2014 selection is allowed only when no same-key 2024 candidate exists and is visibly reported as fallback.
- The hydrated graph contains one native Cast Activity and one native cached Spell for each ref, with exact `cachedFor`, `compendiumSource`, resolver ownership, source feature, and selected UUID linkage.
- No placeholder, duplicate cache, foreign item adoption, or unrelated Actor/item/activity/effect/flag mutation occurred.
- Manual Keep, Overwrite, Cancel, close, rollback, and recovery-required outcomes match the report and leave no hidden partial success.

This is the target-world hydration layer: it proves deterministic destination selection and document construction. It does not substitute for using the native activities.

## Live Native Spell-Use Acceptance

In the destination world, actually use representative hydrated spells:

- Run an attack workflow and confirm the native roll uses the source attack bonus.
- Run a save workflow and confirm the native card uses the source DC and ability.
- Open and cast a utility spell; verify source target restrictions such as self-only.
- Use a limited spell twice to confirm the first use spends only its own Activity and the second is blocked by native behavior.
- Use an at-will spell repeatedly and confirm no daily use is spent.
- Confirm component waivers are represented by native Cast data and literal-only restrictions remain visible without claiming unsupported automation.
- Disable the resolver after hydration and prove cached Spells still open and cast natively.

This is the native runtime layer. Portable/static verification, resolver hydration verification, and live-use acceptance are three separate gates. Passing any one of them cannot be used to claim the other two.

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

# Milestone 14: Actor / Item Generation Correctness Foundation

**Findings:** GEN-001, ITEM-001, VER-003, TARGET-001, ARCH-002.

**Authorized boundary:** Project source, tests, generated outputs produced by existing CLI/workflows, and documentation. Do not modify Foundry worlds, production, Folder/Compendium content, or unrelated `.pui/` state.

## Rule classification

- English spell-attack recognition, save outcomes, embedded effects, stages, and Item profile selection are `source-derived`.
- Foundry IDs, target field shapes, Item type projection, and profile/module separation are `schema-derived`.
- Parser/generator generalization requires at least three positives, one close negative, and one unrelated Actor/Item control.
- No creature, Item, action, or stage-name mechanics branches are permitted.

## Work

- [x] Add RED fixtures for English melee/ranged spell attacks and weapon-attack controls.
- [x] Add RED fixtures for explicit half, explicit none, failed-save-only, and ambiguous save outcomes.
- [x] Add RED fixtures for embedded effect projection/linking and non-application prose.
- [x] Add RED coverage for stable 16-character child IDs, collision rejection, and 10,000 generated IDs.
- [x] Add RED coverage for Item effect-profile isolation, normalized type/name validation, stage parity, and external-cwd generation.
- [x] Implement shared canonical Actor/Item generation types and compatibility adapters.
- [x] Implement explicit dnd5e 4.3.9 and 5.3.3 target projectors.
- [x] Implement typed generation diagnostics, mechanics coverage, target validation, and fail-closed output gating.
- [x] Route CLI, single-file, collection, Vault Sync, and Web jobs through the shared pipeline.
- [x] Regenerate real Oregg, Shield, and unrelated Jewel controls through the project flow.
- [x] Perform `docs/generated-actor-verification.md` source review for changed Actor output.
- [x] Run focused/full tests, both typechecks, coverage, anti-overfit, hygiene, references, Web build, smoke, and available Foundry Lab gates.
- [x] Record mechanical evidence, semantic acceptance, residual risks, and exact next action in the master ExecPlan.

## Final Evidence

- Aggregate: `1465 pass / 14 external-runtime failures`; all failures require the absent project-local Foundry 14.364 ClassicLevel path.
- Coverage gate: `85.83%` production lines and `89.43%` production functions.
- Foundry Lab: `176 pass / 9 external-runtime failures`.
- Pass: both TypeScript checks, 169-source anti-overfit, 1,822-path hygiene, locked dnd5e 5.3.3 verification, Web build, offline Actor smoke, and `git diff --check`.
- Exact official revisions inspected: dnd5e 4.3.9 tag commit `309046cc7548778f5f06812dc2038abb3fae66bb`; dnd5e 5.3.3 commit `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`.
- Runtime boundary: `.local/foundry-v14/app/14.364` and `.local/foundry-v14/data/server-mirror` are absent, so this milestone makes no new Foundry runtime Pass claim.

## Acceptance

- Oregg Firebolt is an `rsak` Activity with preserved attack/range/damage; Poison Spray does not apply half damage on a successful save.
- Structured effects are either projected and linked or rejected with a typed diagnostic; they are never silently dropped.
- Generated child IDs are stable, 16 characters, unique within the document, and collisions fail before map overwrite.
- The same Item source has equivalent stage semantics through every supported workflow; `core` contains no module-only behavior.
- v12/v13 output follows locked dnd5e 4.3.9 structure, v14 follows locked dnd5e 5.3.3, and unsupported subtype handling is explicit.
- A blocking diagnostic prevents formal output publication; collection and Web results expose the same typed result.
- Final Actor/Item JSON is regenerated only by project workflows and checked against real source text.

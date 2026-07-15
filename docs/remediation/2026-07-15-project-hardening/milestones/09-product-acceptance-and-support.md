# Milestone 9 Product Acceptance and Support Reconciliation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: use `superpowers:executing-plans`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`. Do not dispatch subagents because the active project instructions do not authorize delegation.

**Goal:** Close the authorized standalone Item, modded-v14 DAE/MIDI-specific, corpus, and documentation gaps with source-derived behavior and locked local-runtime evidence while keeping authenticated crawling and exact production-module coexistence visible as external blockers.

**Architecture:** Standalone Item documents will be generated from a neutral target-version schema skeleton instead of inheriting mechanics from the first reference file. The Item parser will expose only source- or schema-derived armor and Activity details, and the shared Activity generator will project those details into v12/v14 schemas. Existing explicit-condition extraction will attach source-derived riders without item-name branches. Module-specific behavior will be represented as a source-duration hint and converted to the DAE 14.0.12 `isDamaged` key only by `modded-v14`; MIDI-QOL 14.0.9 is the locked consumer that removes the effect after its damage workflow, while core output remains module-free. A single current support matrix will then link each claim to dated CLI/runtime evidence.

**Locked evidence:** Foundry 14.364, dnd5e 5.3.3, MIDI-QOL 14.0.9, DAE 14.0.12, local `server-mirror` only. For Item armor fields, check tracked dnd5e 4.3.9 Shield/Shield +2 plus locked 5.3.3 Shield of the Cavalier. For `isDamaged`, check DAE 14.0.12 registration plus MIDI-QOL 14.0.9 damage/removal consumption before coding or claiming runtime behavior.

## Constraints and classification

- No creature, item, or action name may select mechanics.
- Neutral schema defaults are `schema-derived`; explicit shield subtype, extra AC, duration, concentration, aura/range, recovery, and inflicted conditions are `source-derived`; accepted bilingual syntax is `corpus-derived` with positive and close-negative coverage.
- Final v12/v14 Item and v14 Actor outputs must be regenerated through `src/index.ts`; tests may construct reduced parser inputs but cannot substitute for CLI acceptance.
- Local Foundry runtime changes stay inside `.local/foundry-v14/data/server-mirror`; production remains untouched.
- No authenticated GoddessFantasy request is authorized. No protected-module signature bypass, production mutation, or claim upgrade is authorized.

## Task 1: Repair standalone Item schema and source mechanics (SEM-005)

**Files:**

- Modify: `src/core/models/item.ts`, `src/core/parser/action.ts`
- Modify: `src/core/parser/item-parser.ts`
- Modify: `src/core/generator/item-generator.ts`, `src/core/generator/activity.ts`
- Modify: `src/core/generator/__tests__/item-source-semantics.test.ts` and focused parser/generator tests as needed

- [x] Write RED tests proving generated Items do not inherit name-independent breastplate armor/type/properties/weight/price/effects; an explicit shield gets base shield armor without a magical bonus; an explicit extra AC bonus becomes `armor.magicalBonus` plus `mgc`; unrelated equipment remains mechanically neutral.
- [x] Add at least three bilingual/corpus positives plus a close negative for explicit extra-AC parsing; patch shield subtype/base fields from text and locked schema, never from an item name.
- [x] Add at least three duration/concentration/aura positives plus a close negative; project exact duration, range, and target template fields into generated Activities.
- [x] Preserve each trait description on its Activity and reuse explicit target-condition extraction so Forceful Bash's conditional prone rider becomes an attached non-transfer Active Effect while prerequisite/termination/bare-condition prose stays negative.
- [x] Prove the real Shield produces base shield `armor.value: 2`, `magicalBonus: 2`, `type.value/baseItem: shield`, `mgc`, correct Forceful Bash damage/range/prone linkage, and Protective Field reaction/dawn use/duration/concentration/range for v12 and v14.
- [x] Keep the unrelated Jewel and at least one weapon/loot output free of new mechanics; run focused tests, both typechecks, `bun run audit:anti-overfit`, and `git diff --check`; commit the generalized repair separately.

## Task 2: Standalone Item CLI and local Foundry acceptance (PROD-002)

**Files:**

- Generated only through: `obsidian/dnd数据转fvttjson/input/items/骑士之盾.md` -> CLI -> ignored acceptance output
- Modify: this plan and the parent ExecPlan evidence ledger

- [x] Regenerate the real Shield through the CLI for v12/core and v14/core; compare identity, rarity, attunement, armor, descriptions, two Activities, uses/recovery, duration/concentration/range, damage, and prone linkage to source and locked schemas.
- [x] Import the v14 Item into a disposable project-local Foundry world, open its sheet, attach/equip it on a disposable Actor, verify runtime armor contribution is the normal shield bonus plus the explicit magical bonus, and exercise both Activities.
- [ ] Apply/remove the conditional prone effect deliberately, confirm Protective Field renders the expected reaction, duration, concentration, range/template, and dawn use, then export/read back the runtime Item. Runtime readback passed; the supported UI export/download event timed out and produced no comparison file.
- [ ] Compare re-exported source-relevant fields to the CLI artifact. Record migration-only volatility separately; do not accept an HTTP/import success or visible sheet alone.

## Task 3: Source-derived DAE/MIDI behavior (PROD-001)

**Files:**

- Create: one generalized Actor source fixture in the default vault input or an artifact-policy-approved acceptance fixture path
- Modify: `src/core/generator/actor-effects.ts`, `src/core/generator/effectProfileApplier.ts`
- Modify/add: focused effect-profile and acceptance tests

- [x] Write RED tests for three source clauses meaning an inflicted condition lasts until the target takes damage, one close negative, one mixed-duration scoping negative, and one unrelated Actor; no action/name branch is allowed.
- [x] Preserve a neutral source-duration hint on the generated condition effect. For `modded-v14`, map only that hint to DAE 14.0.12 `flags.dae.specialDuration: ["isDamaged"]`; strip DAE flags from `core`.
- [x] Generate the fixture through the CLI for v14 core and modded-v14. Verify identical base Actor mechanics, no DAE flags in core, exactly one source-matched DAE duration in modded, and unchanged unrelated outputs.
- [x] Import the modded Actor into the locked minimal local runtime, apply the condition to a target through its Activity, deal damage, and prove the locked DAE 14.0.12 + MIDI-QOL 14.0.9 stack removes the effect. Repeat the pre-damage state with the core artifact or module consumer inactive to demonstrate that the behavior is module-specific rather than mere coexistence.
- [x] Run focused tests, locked-version source review, anti-overfit audit, typechecks, and aggregate CI; keep PROD-001 open until the runtime exercise passes.

## Task 4: Expand and publish the acceptance corpus (PROD-004)

**Files:**

- Create: `docs/acceptance/current-corpus-matrix.md` or an executable matrix tool/test if that is the narrower durable artifact
- Modify: relevant acceptance suite/tool inputs only when the new cases enter an existing supported flow

- [x] Record positive and close-negative controls across Chinese/English, Actor/Item, v12/v14, core/modded, condition/effect, parser, and unrelated regression categories.
- [x] Require every matrix row to name the real source/fixture, workflow command or test, target, semantic projection, and dated outcome.
- [x] Run the matrix and aggregate CI; do not infer broad parser confidence from a single Shield or DAE fixture.

## Task 5: Reconcile current support truth (DOC-002, PROD-003, PROD-005)

**Files:**

- Create: `docs/acceptance/current-support-matrix.md`
- Modify: `docs/delivery-checklist.md` and dated reports under `docs/acceptance/` by dated amendment only
- Modify: parent ExecPlan and this plan

- [x] Separate source fidelity, schema validity, CLI generation, minimal core runtime, module-specific runtime, copied-world sampled usability, exact production-equivalent coexistence, and production deployment.
- [x] Link each current support claim to dated evidence; preserve superseded failures and reconcile copied-world authentication chronology without rewriting history.
- [x] Run contradiction scans for stale blanket `Pass`, unauthenticated/copied-world, DAE-untested, standalone-Item-untested, crawler, and complete-module statements.
- [x] Keep PROD-003 `blocked_external` because authenticated crawl credentials/session were not authorized; state the exact safe resume command and secret boundary without running it.
- [x] Keep PROD-005 `blocked_external`/`Partial-Fail` unless the exact valid production package set and representative workflows pass. Do not use the reduced 84-module set or production deployment changes as exact coexistence proof.
- [x] Close DOC-002 only after the current matrix, dated amendments, delivery checklist, finding ledger, and contradiction scan agree.

## Acceptance boundary

Mechanical acceptance: focused RED/GREEN tests, typechecks, anti-overfit, aggregate CI/coverage/hygiene/reference/build gates, CLI generation, imports, Activity executions, effect state transitions, and export/readback operations succeed.

Semantic acceptance: no arbitrary template mechanic survives; the Shield's source and locked schema agree with both generated and runtime Item behavior; the DAE fixture proves one exact source-derived DAE-only expiry behavior rather than module activation; the corpus supports the generalized rules; every current support claim names its actual evidence layer; unauthorized external gaps remain explicit.

## Progress and evidence

- 2026-07-15 Task 1 GREEN: neutral bundled Item schemas replaced first-reference cloning. Explicit shield subtype, schema-derived base AC/weight, source-derived extra AC, attack ability, damage modifier, duration, concentration, aura, recovery, descriptions, and conditional prone linkage now project without item/action-name branches.
- Focused evidence: `item-source-semantics.test.ts` passed 35/35 with three-positive/close-negative corpora for extra AC, duration/aura, and explicit attack abilities; the broader Item/Web slice passed 122/122; both production/all typechecks passed.
- CLI semantic evidence: the real `骑士之盾.md` regenerated through `src/index.ts` for v12/core and v14/core. Both artifacts contain shield AC 2 plus magical bonus 2, `shield`/`shield`, `mgc`, 6 lb, STR Forceful Bash `2d6+2+@mod` with a linked non-transfer prone effect, and Protective Field as a reaction with 1-minute concentration, 5-foot radius, and one dawn-recovering use. The unrelated Jewel regression remained unchanged.
- Aggregate evidence: the first CI run correctly rejected a stale v14 test that still required Amulet-of-Health reference mechanics. Replacing it with an `assertEqualStructure()` neutral equipment contract made the gate meaningful; the rerun passed 731 tests / 2,896 expectations, both typechecks, coverage, 109-source anti-overfit, 1,602-path hygiene, locked dnd5e 5.3.3 reference verification, Web build, and offline Actor smoke.
- Earlier Task 1 handoff, now superseded by the runtime evidence below: import the freshly generated v14/core Shield, exercise/equip/export it, and compare runtime and re-export semantics to the CLI artifact.
- 2026-07-15 Task 2 runtime preflight: project-local Foundry 14.364/dnd5e 5.3.3 started loopback-only in `fvtt-v14-module-matrix`; Gamemaster login, world/UI readiness, Item directory, disposable equipment creation, context menu, and Foundry's Import Data dialog all worked. The ChatGPT Chrome Extension then rejected `fileChooser.setFiles` because Chrome's "Allow access to file URLs" permission is disabled. No JSON was imported, no runtime behavior was accepted, the server was stopped, port 30001 released, and `options.json` restored to `cor-cotn`. Temporary world Item `M9 Temporary Shield Import` remains for UI cleanup/resume.
- Superseded preflight boundary: Chrome file access was subsequently enabled and import/equip/exercise/readback completed. The downloaded UI export artifact remains the only open Task 2/SEM-005 evidence item.
- 2026-07-15 Task 3 code/CLI acceptance: generalized source clauses now preserve a neutral `untilDamaged` hint per modified status, including three positive forms, a neighboring-damage negative, and a mixed-duration scoping negative. `core` strips DAE flags; `modded-v14` adds exactly one `flags.dae.specialDuration: ["isDamaged"]`. The real Damage-Bound Warden fixture regenerated through the CLI in both profiles, both `verify:actor` runs reported zero warnings, and normalized full-Actor comparison differs only in that DAE flag plus volatile effect/activity IDs.
- Locked module evidence: DAE 14.0.12 registers `isDamaged` in `module/Systems/DAEdnd5e.js`; MIDI-QOL 14.0.9 declares DAE >=14.0.0 and its damage workflow reads `flags.dae.specialDuration`, then invokes `removeEffectUuids` for actual HP/temp damage. Runtime support must therefore be reported as locked DAE+MIDI `modded-v14` behavior, not DAE-alone behavior.
- Mechanical evidence: 14 focused tests / 57 expectations, both typechecks, two CLI generations, two verifier runs, changed-source and 109-source anti-overfit audits, and aggregate `ci:verify` passed 738 tests / 2,921 expectations, production coverage, 1,602-path hygiene, locked-reference, build, and offline smoke gates.
- 2026-07-15 Task 4 accepted: `docs/acceptance/current-corpus-matrix.md` records 19 bounded executable categories across Chinese/English, Actor/Item, v12/v14, core/modded, positive/close-negative, condition/effect, parser, and unrelated regressions. Its focused 11-file command passed 148 tests / 656 expectations; the aggregate gate passed 738 / 2,921. The matrix explicitly excludes the blocked Foundry imports, authenticated crawl, and production-equivalent module claim.
- 2026-07-15 Task 5 accepted and DOC-002 closed: the current support matrix separates thirteen evidence layers, links dated sources, and provides safe resume boundaries. README and the delivery checklist now agree; three dated reports received append-only amendments. The current-claim scan found no prohibited Pass upgrades, evidence paths exist, historical stale wording remains only before explicit amendments, PROD-003 stays `blocked_external`, and PROD-005 stays `blocked_external` / `Fail-Partial`.
- 2026-07-15 runtime resume: Chrome file access unblocked the supported UI imports. The v14 Shield imported after portable Item metadata stopped emitting invalid `lastModifiedBy`; equipped AC changed `10 -> 12`, attunement added the explicit magical bonus for `14`; Forceful Bash completed attack/damage and linked prone handling; Protective Field consumed exactly one self Activity use, rendered `0/1`, created 60-second concentration, and rejected a second use. Runtime `toObject()` readback matched the corrected Activity/uses schema. The UI export event timed out, so no downloaded re-export artifact exists and Task 2 remains open at that exact evidence boundary.
- 2026-07-15 Task 3 runtime acceptance: initial real execution rejected the static claim because dnd5e treated the generated instantaneous linked effect as already expired and DAE suppressed it. Locked dnd5e 5.3.3, Foundry 14.364, DAE 14.0.12, and MIDI-QOL 14.0.9 sources plus a live manual control isolated the required generalized Activity duration `spec`. After RED/GREEN repair and CLI regeneration, Dread Brand dealt 6 damage and left the source-derived Frightened effect active; a later CLI-generated Stone Fist dealt 4 and DAE+MIDI expired/removed it. The core artifact dealt 8, applied the same effect without `specialDuration`, then took 9 more damage and retained it. PROD-001 is closed.
- 2026-07-15 cleanup and mechanical evidence: temporary Shield/Warden Actors, world Item, and 30 test messages were removed; Bleeding Guardian returned to 22 HP with no test effects; Task8 Bleed Target returned to 35 HP with its original three Bleeding effects; MIDI-QOL returned to inactive while DAE/libWrapper/socketlib remained active. The focused four-file run passed 73 tests / 253 expectations. The first aggregate attempt hit the documented scheduling-sensitive token-review timeout at 20.016 seconds; that file passed 2/2 alone in 2.19 seconds, and the complete rerun passed 743 tests / 2,932 expectations, 87.55% line and 88.41% function production coverage, both typechecks, 109-source anti-overfit, 1,605-path hygiene, locked references, Web build, and offline smoke.
- Exact next action: repeat only the supported Shield Export Data download in the disposable matrix world, compare the downloaded JSON's source-relevant fields with the CLI artifact, then clean/stop/restore. Separately request explicit authorization/session before authenticated GoddessFantasy work and a valid authorized protected package set before exact production-equivalent coexistence work.

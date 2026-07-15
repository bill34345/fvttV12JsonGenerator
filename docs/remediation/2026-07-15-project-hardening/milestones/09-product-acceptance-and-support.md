# Milestone 9 Product Acceptance and Support Reconciliation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: use `superpowers:executing-plans`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`. Do not dispatch subagents because the active project instructions do not authorize delegation.

**Goal:** Close the authorized standalone Item, DAE-specific, corpus, and documentation gaps with source-derived behavior and locked local-runtime evidence while keeping authenticated crawling and exact production-module coexistence visible as external blockers.

**Architecture:** Standalone Item documents will be generated from a neutral target-version schema skeleton instead of inheriting mechanics from the first reference file. The Item parser will expose only source- or schema-derived armor and Activity details, and the shared Activity generator will project those details into v12/v14 schemas. Existing explicit-condition extraction will attach source-derived riders without item-name branches. DAE-only behavior will be represented as a source-duration hint and converted to exact DAE 14.0.12 flags only by `modded-v14`; core output will remain module-free. A single current support matrix will then link each claim to dated CLI/runtime evidence.

**Locked evidence:** Foundry 14.364, dnd5e 5.3.3, MIDI-QOL 14.0.9, DAE 14.0.12, local `server-mirror` only. For Item armor fields, check tracked dnd5e 4.3.9 Shield/Shield +2 plus locked 5.3.3 Shield of the Cavalier. For DAE flags and expiry, check the installed 14.0.12 `module/Systems/DAEdnd5e.js` and `module/specialDurations.js` before coding.

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
- [ ] Import the v14 Item into a disposable project-local Foundry world, open its sheet, attach/equip it on a disposable Actor, verify runtime armor contribution is the normal shield bonus plus the explicit magical bonus, and exercise both Activities.
- [ ] Apply/remove the conditional prone effect deliberately, confirm Protective Field renders the expected reaction, duration, concentration, range/template, and dawn use, then export/read back the runtime Item.
- [ ] Compare re-exported source-relevant fields to the CLI artifact. Record migration-only volatility separately; do not accept an HTTP/import success or visible sheet alone.

## Task 3: Source-derived DAE-only behavior (PROD-001)

**Files:**

- Create: one generalized Actor source fixture in the default vault input or an artifact-policy-approved acceptance fixture path
- Modify: `src/core/generator/actor-effects.ts`, `src/core/generator/effectProfileApplier.ts`
- Modify/add: focused effect-profile and acceptance tests

- [ ] Write RED tests for three source clauses meaning an inflicted condition lasts until the target takes damage, one close negative, and one unrelated Actor; no action/name branch is allowed.
- [ ] Preserve a neutral source-duration hint on the generated condition effect. For `modded-v14`, map only that hint to DAE 14.0.12 `flags.dae.specialDuration: ["isDamaged"]`; strip DAE flags from `core`.
- [ ] Generate the fixture through the CLI for v14 core and modded-v14. Verify identical base Actor mechanics, no DAE flags in core, exactly one source-matched DAE duration in modded, and unchanged unrelated outputs.
- [ ] Import the modded Actor into the locked minimal local runtime, apply the condition to a target through its Activity, deal damage, and prove DAE expires/suppresses the effect. Repeat the pre-damage state with DAE inactive or the core artifact to demonstrate the behavior is specifically provided by DAE rather than mere coexistence.
- [ ] Run focused tests, locked-version source review, anti-overfit audit, typechecks, and aggregate CI before closure.

## Task 4: Expand and publish the acceptance corpus (PROD-004)

**Files:**

- Create: `docs/acceptance/current-corpus-matrix.md` or an executable matrix tool/test if that is the narrower durable artifact
- Modify: relevant acceptance suite/tool inputs only when the new cases enter an existing supported flow

- [ ] Record positive and close-negative controls across Chinese/English, Actor/Item, v12/v14, core/modded, condition/effect, parser, and unrelated regression categories.
- [ ] Require every matrix row to name the real source/fixture, workflow command or test, target, semantic projection, and dated outcome.
- [ ] Run the matrix and aggregate CI; do not infer broad parser confidence from a single Shield or DAE fixture.

## Task 5: Reconcile current support truth (DOC-002, PROD-003, PROD-005)

**Files:**

- Create: `docs/acceptance/current-support-matrix.md`
- Modify: `docs/delivery-checklist.md` and dated reports under `docs/acceptance/` by dated amendment only
- Modify: parent ExecPlan and this plan

- [ ] Separate source fidelity, schema validity, CLI generation, minimal core runtime, module-specific runtime, copied-world sampled usability, exact production-equivalent coexistence, and production deployment.
- [ ] Link each current support claim to dated evidence; preserve superseded failures and reconcile copied-world authentication chronology without rewriting history.
- [ ] Run contradiction scans for stale blanket `Pass`, unauthenticated/copied-world, DAE-untested, standalone-Item-untested, crawler, and complete-module statements.
- [ ] Keep PROD-003 `blocked_external` because authenticated crawl credentials/session were not authorized; state the exact safe resume command and secret boundary without running it.
- [ ] Keep PROD-005 `blocked_external`/`Partial-Fail` unless the exact valid production package set and representative workflows pass. Do not use the reduced 84-module set or production deployment changes as exact coexistence proof.
- [ ] Close DOC-002 only after the current matrix, dated amendments, delivery checklist, finding ledger, and contradiction scan agree.

## Acceptance boundary

Mechanical acceptance: focused RED/GREEN tests, typechecks, anti-overfit, aggregate CI/coverage/hygiene/reference/build gates, CLI generation, imports, Activity executions, effect state transitions, and export/readback operations succeed.

Semantic acceptance: no arbitrary template mechanic survives; the Shield's source and locked schema agree with both generated and runtime Item behavior; the DAE fixture proves one exact source-derived DAE-only expiry behavior rather than module activation; the corpus supports the generalized rules; every current support claim names its actual evidence layer; unauthorized external gaps remain explicit.

## Progress and evidence

- 2026-07-15 Task 1 GREEN: neutral bundled Item schemas replaced first-reference cloning. Explicit shield subtype, schema-derived base AC/weight, source-derived extra AC, attack ability, damage modifier, duration, concentration, aura, recovery, descriptions, and conditional prone linkage now project without item/action-name branches.
- Focused evidence: `item-source-semantics.test.ts` passed 35/35 with three-positive/close-negative corpora for extra AC, duration/aura, and explicit attack abilities; the broader Item/Web slice passed 122/122; both production/all typechecks passed.
- CLI semantic evidence: the real `骑士之盾.md` regenerated through `src/index.ts` for v12/core and v14/core. Both artifacts contain shield AC 2 plus magical bonus 2, `shield`/`shield`, `mgc`, 6 lb, STR Forceful Bash `2d6+2+@mod` with a linked non-transfer prone effect, and Protective Field as a reaction with 1-minute concentration, 5-foot radius, and one dawn-recovering use. The unrelated Jewel regression remained unchanged.
- Aggregate evidence: the first CI run correctly rejected a stale v14 test that still required Amulet-of-Health reference mechanics. Replacing it with an `assertEqualStructure()` neutral equipment contract made the gate meaningful; the rerun passed 731 tests / 2,896 expectations, both typechecks, coverage, 109-source anti-overfit, 1,602-path hygiene, locked dnd5e 5.3.3 reference verification, Web build, and offline Actor smoke.
- Exact next action: Task 2 imports the freshly generated v14/core Shield into the disposable project-local Foundry world, exercises/equips/exports it, and compares runtime and re-export semantics to the CLI artifact.
- 2026-07-15 Task 2 runtime preflight: project-local Foundry 14.364/dnd5e 5.3.3 started loopback-only in `fvtt-v14-module-matrix`; Gamemaster login, world/UI readiness, Item directory, disposable equipment creation, context menu, and Foundry's Import Data dialog all worked. The ChatGPT Chrome Extension then rejected `fileChooser.setFiles` because Chrome's "Allow access to file URLs" permission is disabled. No JSON was imported, no runtime behavior was accepted, the server was stopped, port 30001 released, and `options.json` restored to `cor-cotn`. Temporary world Item `M9 Temporary Shield Import` remains for UI cleanup/resume.
- Runtime resume boundary: after the user enables the documented Chrome extension permission, restart the same matrix world, import `remediation-m9-shield.v14.json` through that existing Item's Import Data dialog, complete equip/exercise/export/readback, delete the disposable documents, stop the server, and restore the world option. Until then Task 2 and SEM-005 remain open.
- Exact next action while upload permission is external: execute Task 3 RED and complete all DAE parser/generator/CLI work that does not require runtime file import; retain the same runtime blocker for the final DAE exercise.

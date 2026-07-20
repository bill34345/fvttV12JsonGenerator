# Prepared NPC Spellcasting Intake Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Carry source-explicit prepared NPC spellcasting, including cantrips and per-level slot pools, through AI Intake, deterministic Markdown, v14/core Actor generation, and the portable pending resolver boundary without hand-editing final JSON.

**Architecture:** Extend the source-evidenced Intake usage-group union with prepared cantrip and prepared slot groups. Render native Actor spellcasting configuration separately from the target-world-independent spell references: the Actor owns ability/caster-level/slot pools, while manifest refs own stable spell identity, prepared method, and casting level. Permit prepared resolver plans and build dnd5e 5.3.3 native Cast Activities with `consumption.spellSlot=true`; keep pact and unsupported shared-use forms fail-closed.

**Tech Stack:** Bun/TypeScript, js-yaml, Foundry VTT v14 Actor JSON, dnd5e 5.3.3 locked references, fixture-backed Bun tests.

---

## Completion standard

- Mechanical: focused RED/GREEN tests, production/all typecheck, `bun run audit:anti-overfit`, real CLI AI Intake, `verify:intake`, and `verify:actor` pass.
- Semantic: both source NPCs retain every explicit stat/feature/action/spell/slot/note; Bol'bara has eight innate refs and Pellinost has ten prepared refs plus 4/3/2 native slot pools; both Actors remain portable and `pending` with no destination UUIDs.
- Explicit exclusion: no local Foundry start, runtime import/use test, or production-server operation. No runtime claim is allowed from this plan.

### Task 1: Define the source-evidenced prepared casting contract

**Files:**
- Modify: `src/core/intake/types.ts`
- Modify: `src/core/intake/validator.ts`
- Modify: `src/core/intake/provider.ts`
- Test: `src/core/intake/__tests__/spellcasting.test.ts`
- Test: `src/core/intake/__tests__/provider.test.ts`

- [x] Add a fixture-backed RED test for one level-5 prepared caster with cantrips and 4/3/2 slots.
- [x] Add close negatives for missing/contradictory level or slot evidence and unsupported zero/shared pools.
- [x] Implement the minimal discriminated usage-group fields and exact evidence checks.
- [x] Update extraction/review/repair prompts so the model emits the contract and does not invent destination levels/schools.
- [x] Run the focused Intake tests and record RED then GREEN evidence.

### Task 2: Preserve prepared configuration through Markdown and Actor JSON

**Files:**
- Modify: `src/core/intake/renderer.ts`
- Modify: `src/config/mapping.ts`
- Modify: `src/core/parser/yaml.ts`
- Modify: `src/core/generator/actor.ts`
- Modify: `src/core/intake/verifier.ts`
- Test: `src/core/intake/__tests__/renderer-verifier.test.ts`
- Test: `src/core/parser/__tests__/yaml.test.ts`
- Test: `src/core/generator/__tests__/actor-spell-manifest.test.ts`

- [x] Add RED structure tests for standard Markdown and a v14 Actor with `attributes.spellcasting=wis`, `details.spellLevel=5`, and `spell1/2/3.value=4/3/2`.
- [x] Implement deterministic render/parse/generate mapping; never derive slots from spell names.
- [x] Extend Intake verification to detect slot/ability/caster-level drift.
- [x] Prove an innate Rat/Bol'bara fixture remains structurally unchanged.

### Task 3: Support native prepared Cast Activities without runtime execution

**Files:**
- Modify: `src/core/spell-resolution/planner.ts`
- Modify: `src/foundry/monster-spell-resolver/cast-activity.ts`
- Test: `src/core/spell-resolution/__tests__/planner.test.ts`
- Test: `src/foundry/monster-spell-resolver/__tests__/cast-activity.test.ts`
- Test: `src/foundry/monster-spell-resolver/__tests__/transaction.test.ts`

- [x] Add RED tests showing prepared refs are accepted only with a source-derived casting level and produce `spellSlot=true` with no Activity daily uses.
- [x] Keep pact, prepared refs with per-spell `uses`, and malformed levels fail-closed.
- [x] Implement the narrow planner/builder change against locked dnd5e 5.3.3 structure.
- [x] Verify transaction/fake hydration retains all-or-nothing ownership and rollback behavior.

### Task 4: Run the real two-NPC workflow and semantic acceptance

**Files:**
- Input: `obsidian/dnd数据转fvttjson/middle/bolbara-pellinost.raw.txt`
- Output: `obsidian/dnd数据转fvttjson/input/`
- Output: `obsidian/dnd数据转fvttjson/output/`

- [x] Run the formal AI Intake CLI for v14/core and resolve only source-backed deterministic ambiguities.
- [x] Confirm exactly two accepted candidates and promote only workflow-generated Markdown/Actor JSON.
- [x] Run `verify:intake` for the accepted run and `verify:actor` for both generated Actors.
- [x] Run focused tests, typechecks, anti-overfit, and proportionate full regression.
- [x] Read both Markdown and Actor JSON against the original source; record every accepted projection and any literal/unautomated boundary.
- [x] Confirm both Actors carry a valid portable manifest, resolver `pending`, the exact spell count, and no target-world UUIDs.
- [x] Update the ExecPlan finding, Progress, discoveries, decisions, evidence, and exact remaining work.

### Task 5: Repair Bol'bara's generalized Intake fidelity blockers

**Files:**
- Modify: `src/core/intake/orchestrator.ts`
- Modify: `src/core/intake/validator.ts`
- Modify: `src/core/intake/types.ts`
- Modify: `src/core/intake/renderer.ts`
- Modify: `src/core/intake/provider.ts`
- Test: `src/core/intake/__tests__/orchestrator.test.ts`
- Test: `src/core/intake/__tests__/spellcasting.test.ts`
- Test: `src/core/intake/__tests__/renderer-verifier.test.ts`

- [x] Add RED tests proving request source hash/length replace provider bookkeeping drift.
- [x] Add `无需任何构材` positive and non-material close negatives.
- [x] Keep true duplicate spellcasting blocked while incidental claim overlap alone is not misclassified.
- [x] Preserve both reach 5 and thrown 20/60 for a source-explicit hybrid weapon using the existing `mwak` convention.
- [x] Carry legendary max and exact conditional preamble/availability prose to Actor-visible output without inventing conditional automation.
- [x] Treat `1次/每日` as an explicit per-creature decision, not a global automatic synonym for independent daily uses.

## Closure evidence

- Accepted run: `.local/intake-runs/2026-07-19T16-29-30-782Z-4bc3d00a`, status `succeeded`, exactly two accepted creatures, zero extraction/repair calls on the final resume.
- Both standalone `verify:intake` reports are `accepted` with zero findings; both `verify:actor` runs exit 0 with zero warnings. Reports are retained under `.local/final-verification/`.
- The Windows merged-state rerun exposed that `verify:intake` only recognized LF frontmatter delimiters. A CRLF-first RED test now protects portable manifest extraction, and both tracked Markdown inputs pass `verify:intake` after checkout without manual line-ending repair.
- Final merged-state aggregate `bun run ci:verify` exits 0 with `1301 pass / 0 fail` and `5162` assertions after independent-review and CRLF remediation, coverage gate, 145-source anti-overfit audit, repository hygiene, locked dnd5e 5.3.3 reference verification, Web build, and offline Actor smoke.
- Semantic acceptance confirms Bol'bara's source stats, conditional AC note, traits, hybrid Dagger, Eldritch Blast, conditional two-action legendary preamble/actions, and eight-ref innate manifest; Pellinost preserves stats, 7/3/5 skills, 4/3/2 slots, Divine Eminence, Mace, right-hand prosthetic note, and ten-ref prepared manifest. Both Actors have an empty unsourced initiative bonus, preserve creature subtype/custom race, carry resolver `pending`, and contain no embedded Spell or Cast Activity.
- Runtime import/use and production hydration remain deliberately untested by user instruction; this plan makes no runtime claim.

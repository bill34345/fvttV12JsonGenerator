# Plutonium Quick Insert and Blood Hunter Activity Repair Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the local Plutonium/Quick Insert `Omnidexer` console failure and produce an importable Blood Hunter 2024 homebrew artifact whose actionful class and requested subclass features carry native dnd5e 5.3.3 Activities.

**Architecture:** Keep both repairs outside world LevelDB. Patch the exact installed Plutonium bundle through a guarded, idempotent Foundry Lab command with an adjacent upstream backup. Build the user-owned Blood Hunter source into a deterministic local homebrew artifact by adding supported Plutonium `foundry*Feature` side data; importing that artifact remains the user's explicit action.

**Tech Stack:** Bun/TypeScript, Foundry Lab, Foundry VTT 14.364, dnd5e 5.3.3, Plutonium CN 2.15.6, Quick Insert 3.7.7.

---

## Completion standard

- Mechanical: focused RED/GREEN tests, exact-source patch dry-run/apply verification, homebrew fixture/structure checks, typecheck, anti-overfit audit, and one bounded Chrome smoke.
- Semantic: Quick Insert no longer takes the missing-global path; passive/choice Blood Hunter features remain display-only; actionful class, Order of the Mutant, Order of the Ghostslayer, and Order of the Profane Soul features receive source-faithful activation/target/save/damage/use structures without claiming unsupported automation.
- Explicit exclusion: no direct Actor or compendium editing, no world-wide migration, and no full combat/runtime acceptance. The user will import and manually validate the Blood Hunter package in play.

## Task 1: Record exact runtime contracts

- [x] Reproduce `ReferenceError: Omnidexer is not defined` in the active local world and isolate the direct bundle call.
- [x] Inventory the custom pack and Callum's embedded Blood Hunter feature structures without writes.
- [x] Confirm the remote homebrew has class/subclass text but no feature Activity side data.
- [x] Record locked dnd5e 5.3.3 Activity fields and Plutonium 2.15.6 side-data matching fields used by the implementation.

## Task 2: Guard the Plutonium Quick Insert integration

- [x] Add RED source-patcher tests for missing globals, idempotency, unexpected upstream shape, and adjacent backup preservation.
- [x] Implement the smallest version/source-guarded fallback and expose dry-run/apply through Foundry Lab.
- [x] Apply only to the exact local `plutonium-cn` bundle and verify the backup plus patched sentinel.

## Task 3: Build Blood Hunter Activity side data

- [x] Add RED fixture tests for actionful class features and each requested subclass plus passive close negatives.
- [x] Implement the explicit user-owned `BloodHunter2024` enrichment mapping with stable feature matching.
- [x] Emit a deterministic local homebrew JSON artifact through the Foundry Lab workflow; do not hand-edit the world pack or Actor.

## Task 4: Mechanical and semantic verification

- [x] Run focused tests and structure assertions.
- [x] Review every enriched Activity against its source feature text and record literal/unautomated boundaries.
- [x] Run production typecheck, Foundry Lab regression, and anti-overfit audit.

## Task 5: Bounded runtime smoke and handoff

- [x] Perform one short Chrome smoke proving the console error path is gone; verify the built homebrew artifact separately through the live HTTP endpoint because the Chrome extension blocks direct navigation to that local JSON asset.
- [x] Do not perform full Blood Hunter combat validation; give the user a short import/manual-test checklist.
- [x] Update this plan, the authoritative ExecPlan, and the dated review with exact pass/risk evidence.

## Closure evidence

- Exact Plutonium CN 2.15.6 `Bundle.js` was patched through `bun run foundry:lab patch-plutonium-quick-insert --apply`; an adjacent `.upstream-2.15.6.bak` remains and the next dry-run reports `changed:false`.
- The deterministic artifact is `.local/foundry-v14/data/server-mirror/Data/assets/homebrew/blood-hunter-2024.activities.json`: 4 class-feature side-data entries, 11 requested-subclass entries, 42 optional-feature entries, and 59 Activities with zero structural findings.
- A planted duplicate-ID scenario exposed three same-name subclass/optional Blood Curses; separate stable namespaces were added and the real artifact now has no duplicate Activity IDs.
- Foundry Lab passes `164 / 164` with `602` assertions; production/all TypeScript and the scoped anti-overfit audit pass.
- After one Chrome refresh, console evidence contains `Constructed index of world.and Compendium containing 44 entries` and zero `Omnidexer`, `FoundryOmnidexerUtils`, `ReferenceError`, or error-level entries.
- Live HTTP verification returns `200 application/json` and the exact 4/11/42/59 summary. Direct Chrome navigation to the local JSON was blocked by the browser extension (`ERR_BLOCKED_BY_CLIENT`), so that sub-check is not represented as a browser pass.
- No Actor, world pack, world LevelDB, remote server, or production world was modified. Full import/combat acceptance remains with the user by explicit instruction.

## 2026-07-26 semantic expansion

The original milestone remains historically closed for adding baseline Activities. The user subsequently rejected the generic Crimson Rite damage button and single-Activity Blood Curse model. Follow-up finding `BH-ACT-002` is tracked in the authoritative ExecPlan and reviewed in `docs/reviews/2026-07-26-blood-hunter-enchantment-amplification-report.md`; this section must not be read as evidence that enchantment or amplification semantics were already accepted.

`BH-ACT-002` closed on 2026-07-26 at the approved code/artifact boundary. The final generated artifact has 97 Activities, deterministic SHA-256 `33EAF23EB37C531342AF3E6DAF99BB24B057B7A42CD3F2AF3AFBC8EB8E064B50`, and a zero-error semantic matrix across seven rites, fourteen optional Blood Curses, and three same-name subclass Blood Curses. See `docs/reviews/2026-07-26-blood-hunter-enchantment-amplification-report.md`. Authenticated drag/drop and combat acceptance remains user-owned.

## 2026-07-26 runtime rejection and BH-ACT-003

Subsequent user runtime testing invalidated BH-ACT-002 as current functional acceptance. The generated structures were mechanically stable but not compatible with the imported dnd5e/MIDI/DAE runtime contract: save Activity effects were cleared, shared-use targets were unresolved, rite damage parts were malformed after enchantment, direct-loss macros were ineffective, and several larger feature families were omitted or represented by empty buttons.

The historical record above remains intact. Current repair and closure evidence is owned by `BH-ACT-003` and `docs/reviews/2026-07-26-blood-hunter-complete-runtime-repair-report.md`; this milestone must not be cited as proof that Blood Hunter runtime behavior is accepted.

## 2026-07-26 BH-ACT-003 implementation evidence

The complete-runtime repair now generates 9 class-feature, 23 subclass-feature, and 42 optional-feature side-data entries with 117 Activities. The machine-readable coverage ledger accounts for all 94 source features with zero silent omissions.

Representative Foundry 14.364 runtime probes pass identifier remapping, Effect references, native Enchant damage propagation, replacement of an old rite, short-rest cleanup, direct HP loss without temporary-HP absorption, MIDI damage neutralization, and fail-closed behavior. All probe Actors and weapons were deleted after inspection.

Mechanical evidence: Blood Hunter 15/15 (497 assertions), Foundry Lab 172/172 (1072 assertions), full repository 1382/1382 (6547 assertions), TypeScript, Web build, anti-overfit, and deterministic SHA-256 `3526E4F2F28A81052843D0FFE71FCCA54F49015E2AB5037F7F1DA7423BE6FB65`.

See `docs/reviews/2026-07-26-blood-hunter-complete-runtime-repair-report.md` for the exact automatic/assisted boundary. `BH-ACT-003` remains open only for the user's re-import, Callum migration, full UI/gameplay acceptance, and online synchronization.

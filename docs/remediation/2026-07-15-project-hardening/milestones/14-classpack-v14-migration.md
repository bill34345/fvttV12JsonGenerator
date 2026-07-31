# Local dnd5e Classpack v14 Migration

**Goal:** Make the project-local `dnd5e_classpack` 4.3.4 install usable on Foundry 14.364 with dnd5e 5.3.3 while preserving the module ID, the exact 21-pack identity surface, and all non-duplicate document and Compendium identities. The locked dnd5e migrator may remove only an ActiveEffect it proves is a duplicate transferred effect; every other identity addition or removal fails closed. The current local hardening release is `4.3.4-v14.2`.

**Scope:** Only `.local/foundry-v14/data/server-mirror/Data/modules/dnd5e_classpack` and the disposable `fvtt-v14-module-matrix` world. Production and `cor-cotn` world data are excluded.

**Recovery boundary:** The user explicitly declined a backup. A failed repair is recovered by disabling the module and reinstalling upstream 4.3.4. Disabling stops future module loading but does not reverse bytes already written to its compendium packs.

## Completion standard

- Mechanical: a dry-run-first, exact-path/version/source-shape Foundry Lab command; fixture-backed tests; all 21 packs readable; document and embedded-document counts reconciled; module/pack/document IDs and Compendium UUIDs unchanged except for a dnd5e-confirmed duplicate transferred effect; deterministic LF runtime comparison; no remaining removed API markers; TypeScript and Foundry Lab regressions pass.
- Data semantics: Actor and Item packs complete the locked dnd5e 5.3.3 migration through Foundry's public migration API; JournalEntry, RollTable, and Macro packs remain readable and their links/results/commands retain meaning.
- Feature semantics: all 12 macros are reviewed against Foundry 14.364, dnd5e 5.3.3, MIDI-QOL 14.0.11, and DAE 14.0.12; the six saving-throw macros use the current array-returning API correctly; representative Actor, Item, Journal, RollTable, and Macro documents can be opened or executed in the disposable world without a new classpack-caused error.
- Runtime: Foundry recognizes and enables the module only in `fvtt-v14-module-matrix`; all 21 Compendium packs index successfully; a module-disabled control still loads the world.
- Honest boundary: no production claim, no `cor-cotn` activation, and no claim that every third-party macro branch is fully gameplay-proven unless it is actually exercised.

## Task 1: Lock exact contracts and identity baseline

- [x] Inventory manifest, pack types, top-level and embedded LevelDB records, macro API markers, and module activation state.
- [x] Read locked Foundry 14.364 package compatibility and dnd5e 5.3.3 compendium migration code.
- [x] Recorded exact current MIDI-QOL 14.0.11 and DAE 14.0.12 contracts for every changed macro API family.
- [x] Produced a deterministic identity/count baseline before writes. The pre-runtime LevelDB inventory contained 13,559 records.

## Task 2: Add guarded migration workflow

- [x] Added tests for exact module/version/path gates, manifest conversion, macro transforms, idempotency, unexpected source rejection, activation isolation, and migration-marker preservation.
- [x] Added `foundry:lab classpack-v14` dry-run/apply support without any backup creation.
- [x] Kept runtime dnd5e migration separate from offline manifest/macro preparation so partial progress is observable and rerunnable.

## Task 3: Apply local repair

- [x] Patched the manifest first as local fork `4.3.4-v14.1`, then hardened the pre-commit local release as `4.3.4-v14.2` with exact Foundry/dnd5e/MIDI-QOL/DAE compatibility declarations, runtime migration version refusal, deterministic LF comparison, and an exact 21-pack identity gate.
- [x] Patched only exact known Macro IDs, names, command hashes, and source shapes; unknown or ambiguous inputs fail closed.
- [x] Ran the locked dnd5e 5.3.3 compendium migrator over every Actor and Item pack in Foundry, followed by DAE 14.0.12 migration for those same module-owned documents.
- [x] Validated JournalEntry, RollTable, and Macro packs without applying Actor/Item migration semantics to them.

## Task 4: Mechanical and semantic acceptance

- [x] Re-inventoried all packs: 21 packs, 5,655 top-level documents, 13,302 runtime document identities, and 13,558 LevelDB records. The one-record decrease is the logged dnd5e removal of duplicate transferred Invisible effect `dnd5einvisible00` from `summons` Actor `4XOCbibDwZcdgbhV`; no other identity change was accepted.
- [x] Ran the original 12 focused classpack tests and 197 Foundry Lab tests, then added the v14.2 pack-surface/version/line-ending regressions; both TypeScript configurations, final no-write migration verification, and `git diff --check` pass.
- [x] Enabled only in `fvtt-v14-module-matrix`; loaded all five document types, strictly validated all 5,655 top-level documents, compiled all 12 Macros with zero legacy markers, inspected representative Actor/Item/Journal/RollTable/Macro semantics, and executed the new dnd5e saving-throw API successfully (`D20Roll[]`, one evaluated roll).
- [x] Disabled the module and confirmed the disposable world reached `Launching World | Complete` and listened on port 30001.
- [x] Final current-tip gates pass 13 focused classpack tests, 198 Foundry Lab tests, 1,576 repository tests / 7,451 assertions, 85.40% production lines / 88.15% production functions, both TypeScript configurations, 205-source anti-overfit, 1,905-path hygiene, locked dnd5e 5.3.3 references, Web build, offline Actor smoke, and staged diff checking.

## Task 5: Ledger and handoff

- [x] Recorded exact commands, counts, runtime evidence, remaining macro risks, and recovery instructions here and in the authoritative ExecPlan.
- [x] Closed `CLASSPACK-001` after mechanical, data-semantic, representative feature, and disabled-control acceptance passed.

## Execution evidence and decisions

- The first offline apply updated the guarded Macro records and then failed before installing the runtime entry because upstream 4.3.4 had no `scripts` directory. The workflow now creates that exact parent directory and an idempotent rerun completed installation.
- The first runtime wait incorrectly required a DAE migration-version setting even when DAE auto migration was disabled. The predicate now treats disabled auto migration as ready and has a regression test.
- The first long browser command exceeded the browser transport's command-duration limit while Foundry continued migrating. Pack locks were monitored until every pack relocked before any second call; no concurrent migration was started.
- A deliberate second migration completed with `ok: true`, Foundry `14.364`, dnd5e `5.3.3`, DAE `14.0.12`, 21 packs, 5,655 top-level documents, 13,302 runtime identities, and zero further DAE effect rewrites.
- `bypassVersionCheck: true` makes dnd5e fine migration re-emit legacy `-=riders` compatibility warnings on forced repeats. A persisted `dataMigrationComplete` marker now makes the default runtime call inventory-only and no-write; `{ force: true }` remains an explicit diagnostic override.
- The identity reconciler implements the locked dnd5e 5.3.3 duplicate-transfer predicate. It permits removal only of those proven duplicate ActiveEffects and rejects every other identity addition or removal.
- The original full runtime acceptance ended at `4.3.4-v14.1`, with classpack enabled only in `fvtt-v14-module-matrix`, MIDI-QOL restored to disabled there, default Foundry world restored to `cor-cotn`, and the local server stopped.
- Pre-commit review found that Windows CRLF made the supposedly idempotent runtime comparison report `changed: true`, and that the manifest/runtime did not actually refuse dnd5e or active DAE version drift. Local `4.3.4-v14.2` fixes both issues and locks the complete pack identity surface. Applying v14.2 changed only the manifest/runtime: all 12 Macro hashes, 13,558 LevelDB records, and identity SHA-256 `1ceed323d42a302c0bc9d7b3c380516e5254b57382c1ad8c2ace06ea11b0055d` stayed unchanged; the immediate second dry-run returned `changed: false`.
- Production 8080 remains on the separately deployed and load/index-accepted `4.3.4-v14.1`. No v14.2 production deployment or fresh v14.2 Foundry browser/runtime acceptance is claimed.

## Remaining honest boundary

The repaired Macros were reviewed against tracked/local Foundry 14.364,
dnd5e 5.3.3, MIDI-QOL 14.0.11, and DAE 14.0.12 source and all compile in the
real world. A representative dnd5e save path was executed. The browser refused
a fresh local navigation after the restart, so a new MIDI-enabled client smoke,
interactive target selection, token movement, damage application, and every
third-party macro branch were not executed end to end. They remain residual
gameplay risk rather than claimed acceptance. The v14.2 hardening changes no
pack or Macro data, so the v14.1 data/feature evidence remains relevant, but
v14.2 itself currently has manifest/runtime installation and idempotency
evidence rather than a fresh authenticated Foundry session.

# Battlefield Painter Runtime Acceptance - 2026-08-14

## B90 final gate update — 2026-08-16

**B90 result: `PARTIAL — RELEASE GATE` (no new Battlefield Painter code error).** This is the final representative gate only; it does not rerun or reclassify B05—B12. B05/B06/B11 remain their existing accepted `PARTIAL` records, B08 remains `RETIRED — NOT APPLICABLE`, and the independent R01/R02/B12/SQ-011 conclusions remain unchanged.

The batch used the pinned local runtime: Foundry `14.364`, dnd5e `5.3.3`, world `cor-cotn`, `server-mirror`, loopback port `30001`, PID `32616`. The Lab was not restarted or stopped and ports `8080` and `51020` were not touched. GM was `Gamemaster [GM]` in command-line Chrome; player was `佐德` in an independent in-app Browser. Both clients ended on the same Square Scene, `BP-ACCEPT-20260816-B90-20260815-184258-Final` (`R1GW0k8Nsouz9Dla`); the player stayed `isGM=false`, `canMutate=false`, with no Painter controls.

### Representative semantic sample

- GM actually painted fire stage II, switched stage, erased one cell, and used undo/redo. The final fire, frost, and mature-brambles sample audit was `bundles=3, tiles=5, regions=3, lights=1, sounds=0, walls=6`.
- Fire `fire-embers.webm` advanced frames after a user gesture on both GM and player clients (`readyState=4`, `paused=false`, `currentTime` advanced). Frost's sampled Region used `modifyMovementCost` with walk/fly/swim/burrow difficulties all `2`. Player movement toward the brambles stopped before the bramble wall boundary.
- Reload and Scene switch/return preserved the same Scene ID and owned audit. A harmless foreign Tile (`5HmQ8zAkTzlSjC6Z`), Region (`Dh5zAGhOYJFwN6cK`), and AmbientLight (`EoGdrkbQEnrRevnv`) remained present. No module-owned `AmbientSound` was created.
- GM/player resource windows contained only the module JS/CSS; no Battlefield Painter `.ogg`, `audio`, or `assets/audio` request appeared. No retained Battlefield Painter console error was found. One malformed regular-expression query was an instrumentation typo and is recorded as test-operation noise, not a module failure.

### B90 mechanical gates

| Check | Result |
| --- | --- |
| Module `bun run test:coverage` | PASS — 106 passed, 0 failed; 93.25% lines / 89.29% functions |
| Module `bun run typecheck` | PASS |
| Module `bun run build` | PASS |
| Root `bun run agents:generate` | PASS — no unexpected tracked changes |
| Root `bun run agents:check` | PASS |
| Root `bun run typecheck:foundry-modules` | PASS |
| Root `bun run ci:verify` | **FAIL — existing whole-repo coverage gate only**: 2005 tests passed, 0 failed, but production lines were 82.82% (<84.00%) and functions 84.65% (<85.00%) |
| `git diff --check` | PASS |
| Build/install media inspection | PASS — ZIP SHA-256 `67D597929E228BE50273A15B57C403593C722AD05F08B6537F5E4E9E8601AC27`; six WebM, zero OGG, no `assets/audio`; installed tree also six WebM/zero OGG/no audio directory |

The clean structured evidence is at `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B90-20260815-184258\BP-E2E-B90-final.json`; GM/player screenshots and the original raw operation record are in the same directory. The only reason B90 is not a full mechanical PASS is the pre-existing root release/coverage threshold; the module-specific tests, typecheck, build, runtime sample, and media retirement checks passed.

**B99 has not started.** The B90 Scene, player Actor/Token, foreign fixtures, installed module state, and Lab remain in place. B99 will only begin after the user reviews this B90 result and gives explicit confirmation; it will then handle ownership-verified cleanup and the guarded `server-mirror` stop.

## B05—B10 continuous acceptance update — 2026-08-15

This is a later, append-only runtime record. It does not rewrite the historical B04, B07, B08, B09, or B10 entries below, and it does not replace the independent R01/R02 evidence. The six batches were executed in one sequence against fresh Scenes, with a command-line Chrome GM and an independent in-app Browser player. Each batch stayed below the 30-minute hard limit; no Lab restart, dependency install, source change, commit, merge, push, or production-port operation occurred.

Runtime identity remained Foundry `14.364`, dnd5e `5.3.3`, world `cor-cotn`, `server-mirror`, loopback port `30001`. Evidence root:

`F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B05-B10-20260815-170842`

| Batch | Scene | Timebox | Result | Current-contract evidence |
|---|---|---:|---|---|
| B05 | `BP-E2E-B05-B10-2026-08-15T17-08-42-847Z-B05-HexColumns` (`Z9Wfjgv8fC3iSbIj`) | 12m33s | **PARTIAL** | Radius 0/4 preview and commit counts, repeated-paint deduplication, bidirectional lines, four fill draws, leave/deactivate cleanup, stage/erase/undo/redo, and player synchronization were positive. The held fill-preview offset set and a direct Foundry `getDirectPath()` offset comparison were not captured completely; no code failure was observed. |
| B06 | `BP-E2E-B05-B10-2026-08-15T17-21-42-007Z-B06-Square` (`SPeOhuuaEsgCrBEp`) | 10m42s | **PARTIAL** | P0-only six static WebP paints, P0 fire lights, zero sounds, P0+P1 radius/line/fill/stage/erase/history, a radius-4 highlight sample, and player no-control evidence passed. Full preview/commit offset parity for every P1 operation was not captured; no code failure was observed. |
| B07 | `BP-E2E-B05-B10-2026-08-15T173228-B07-Square` (`GA8XWhiHyipq0Vio`) | 7m24s | **PASS** | Six WebM tiles were visibly present and their `HTMLVideoElement.currentTime` advanced while unpaused/ready. Eighteen continuous fire cells produced two 9-member clusters (each ≤16), zero owned sounds and zero OGG/audio resource entries were observed, full-Alpha representative operations and undo/redo passed, and owned-only clear/rebuild matched the expected six media/position/stage records. |
| B08 | Reused B07 read-only evidence | 0m30s | **RETIRED — NOT APPLICABLE** | Installed tree contained six WebM, zero OGG, and no `assets/audio`; B07 audit had `sounds=0` and no OGG/audio resource entries. No recording, listening, or audio PASS was manufactured. Legacy cleanup remains covered by R02. |
| B09 | `BP-E2E-B05-B10-2026-08-15T174057-B09-HexRows` (`DZjQHJoHsfVG52Tg`) | 7m10s | **PASS** | Hex Rows six WebM videos advanced frames; eighteen continuous fire cells split into 9+9 clusters; owned sounds stayed zero. Clear preview counted 58 owned documents and left the foreign Tile, Region, AmbientLight, and Wall intact. Rebuilding the same input matched all 24 normalized tile positions/media/stages and cluster sizes. |
| B10 | `BP-E2E-B05-B10-2026-08-15T174820-B10-HexColumns` (`YhsWw79nYqQh9ekQ`) | 3m45s | **PASS** | Hex Columns repeated the current P2 contract: six WebM videos advanced frames, 18 fire cells produced 9+9 clusters, zero owned sounds, foreign four-document survival after owned-only clear, and exact normalized 24-tile rebuild parity. |

Batch JSON and screenshots are stored beneath the evidence root; B05's files are at the root and B06—B10 use their named subdirectories. The B09 foreign Region fixture initially omitted Foundry's required `name` field and was rejected by Midi-QOL/Foundry; the fixture was corrected before the actual batch assertion and the corrected foreign Region survived clear. This was a test-fixture setup error, not a Battlefield Painter defect.

**Continuous-sequence conclusion:** B05—B10 was executed, but the sequence is **not all PASS** because B05 and B06 remain `PARTIAL` for missing exact preview/commit evidence. B08 is retired rather than passed. B11, B12, SQ-011, R01, and R02 retain their independent conclusions; B90/B99 remain outside this sequence.

## Final post-fix runtime acceptance update — 2026-08-16

**R01: PASS. R02: PASS. B90: not executed.** The two post-fix batches were run against the installed module in the pinned local Lab with a command-line Chrome GM and an independent in-app Browser player. The historical sections below, including the pre-fix FAIL/PARTIAL records and the earlier “R01/R02 pending” status, are retained as history and are superseded only by this dated update.

Runtime identity and artifact evidence:

- Lab: `F:\FoundryLab\foundry-v14\data\server-mirror`, world `cor-cotn`, loopback port `30001`, Foundry `14.364`, dnd5e `5.3.3`; the existing Lab process was left running (PID `32616`). Ports `8080` and `51020` were untouched.
- GM: `Gamemaster [GM]` in command-line Chrome. Player: `佐德` in the independent in-app Browser; player `isGM=false` and never exposed Painter controls.
- Built ZIP SHA-256: `61C66B6384CA48D5346B2B45919142A5B9DC90628ED36EC2BD7861B9E220BB4A`.
- `verify-install`: `ok=true`, module `0.3.0-alpha.1`, installed tree hash `3f9807a9f761b17fde9e591d4f8d94f393c89376f0b3e6083818f24fe82df52c`.
- Install tree and ZIP contain six WebM and six WebP assets, zero OGG files, and no `assets/audio` directory.

R01 evidence:

- Square radius-0 hover at three offsets produced one Foundry grid-highlight position each; radius 4 produced 81 positions and valid geometry. The real 81-cell release committed exactly the same offset set. Pointer leave cleared positions/geometry; deactivate destroyed the highlight layer; ApplicationV2 close left the controller inactive and the layer absent.
- Square line forward/reverse strokes and four fill endpoint directions all matched the preview offset sets and committed cell keys. Hex Rows and Hex Columns each produced valid radius-0/radius-4 highlights (61 cells at radius 4), and their line/fill strokes committed the same four-cell preview sets.
- The three initial grid scenes synchronized to the player; the player remained non-GM with no Painter/画笔/地形 controls. The Foundry v14 layer positions came from `canvas.grid.getTopLeftPoint`, not PIXI drawing internals.

R02 evidence:

- A clean Square scene covered fire, frost, and brambles stages I/II. All six probes produced the expected WebM, clustered lights/regions/walls, and zero owned `AmbientSound` documents. The final sweep audit was `bundles=6, tiles=6, regions=6, lights=2, sounds=0, walls=4`.
- Fresh Square, Hex Rows, and Hex Columns scenes covered P0-only, P0+P1, P0+P2, and P0+P1+P2. P0/P0+P1 committed WebP, P0+P2/full committed WebM, P1-off previews were empty, P1-on previews contained the hit cell, and every combination reported zero sounds.
- The legacy fixture showed the GM-only warning once per scene/fingerprint, DialogV2 cancel safety, stale-fingerprint rejection, and confirmation that deleted only owned legacy IDs while retaining the foreign `AmbientSound`. Erase, stage change, undo, redo, and clear did not create or restore sounds.
- Network windows during the new-scene sweeps contained no `modules/fvtt-battlefield-painter/assets/audio` or module OGG request on either client. Existing Foundry media `AbortError` noise was kept separate and was not attributed to Battlefield Painter.

Test-fixture containment note: one exploratory phase-matrix attempt initially failed to verify `canvas.scene.id` and briefly wrote four bundles to the B12 fixture. The run was stopped immediately; those exact four bundle IDs were removed through the public Foundry Document API, and B12 was rechecked against its pre-run IDs/counts: two owned tiles (`6:6`, `7:6`), one owned region, one owned light, one owned legacy sound, and one foreign document of each tested type. Foundry necessarily advanced the Scene `_stats.modifiedTime` while applying those public document writes; no LevelDB or direct metadata edit was attempted. This was a test-operation mistake, not a module defect, and the failed attempt is not used as R02 evidence.

The remaining next gate is B90 (final permissions/semantic/mechanical sampling). B11, B12, and SQ-011 were not rerun or downgraded. No commit, merge, push, dependency installation, production operation, or Lab stop was performed.

## Post-fix source reclassification — 2026-08-15

The historical runtime evidence below is preserved verbatim as the pre-fix record. A read-only source review then identified two concrete repair targets, and the authorized repair has now been implemented in this worktree:

- **Cursor preview:** `src/preview-renderer.ts` no longer relies on PIXI v8 `poly/fill/stroke`; it uses the Foundry 14.364 public grid-highlight layer and `canvas.grid.getTopLeftPoint`. Activation fails closed when that boundary is unavailable. R01 is the required real dual-client post-fix batch.
- **Audio:** new audio generation, catalog references, scene creation, OGG assets, and audio build output are retired. Legacy owned `AmbientSound` documents remain auditable and have a GM-only DialogV2 cleanup path with sorted ID fingerprint, stale rejection, foreign-document protection, and no SceneHistory restoration. R02 is the required real dual-client post-fix batch.
- **Acceptance reclassification:** the old B08/P2-006 player-audio recording requirement and the audio subclaim of SQ-012 are `RETIRED — NOT APPLICABLE`, not PASS and not an open playback-repair defect. Historical B03/B08 evidence remains unchanged.

The following are **not** new code defects: B11's 81-cell coordinate calibration, its 300-cell/player-movement evidence gaps, B03 sight/light evidence gaps, the normal-ground Foundry/Midi-QOL reset obstruction, B12 stale-fingerprint protection, and SQ-011's accepted functionality. No B11/B12/SQ-011 status is changed by this repair.

Post-fix mechanical checks completed after this append: module `bun run test:coverage` passed with 106 tests / 0 failures / 407 expect calls (93.25% lines, 89.29% functions), module `bun run typecheck` passed, module `bun run build` passed, root `bun run typecheck:foundry-modules` passed, root `bun run agents:check` passed, and `git diff --check` passed. The resulting ZIP SHA-256 is `61C66B6384CA48D5346B2B45919142A5B9DC90628ED36EC2BD7861B9E220BB4A`; its install tree contains six WebM, six WebP, zero OGG, and no `assets/audio`. No Lab, browser, installation, dependency installation, commit, merge, or push was performed by this repair turn. R01 and R02 remain pending; until both pass in exact Foundry 14.364 with independent GM/player clients, the module must not be reported as runtime-accepted.

## Final conclusion

PARTIAL

This is not Alpha real-machine acceptance passed. The pinned local runtime was reached, the formal module installation was verified, real GM and independent non-GM player sessions were used, and a substantial Square/Hex/phase/clear/rollback/performance matrix was executed. The remaining hard gates are material:

- measured player movement cost through every Region is not proven;
- stage-I bramble pass-through did not complete in the final controlled route, so the runtime discrepancy needs a focused follow-up before assigning a module defect;
- player-confirmed six WebM animations, three OGG spatial behaviors, wall attenuation, and audio review are not complete;
- the stale clear fingerprint mutation path is not complete;
- the complete repeated P1 matrix on both hex orientations and a unified P2 media/cluster/clear pass on all grids are not complete;
- the final repository ci:verify gate fails the unrelated global coverage threshold.

The user has not received an audio recording to review. No file named BP-E2E-018-player-media-audio.webm was created; the audio status remains PARTIAL - USER AUDIO REVIEW UNAVAILABLE. No PASS or PASS WITH RELEASE GATE conclusion is therefore allowed.

## Fixed scope and safety

- Worktree: I:\OpenCode\fvttV12JsonGenerator-worktrees\20260814-092014-battlefield-painter-runtime-acceptance
- Branch: codex/20260814-092014-battlefield-painter-runtime-acceptance
- Baseline and current HEAD: 92346b31d26b8d48b8c864a0d23b3908ef020068
- Lab: F:\FoundryLab\foundry-v14\data\server-mirror
- World: cor-cotn
- Port: 30001, loopback only
- Foundry: 14.364
- dnd5e: 5.3.3
- Module: fvtt-battlefield-painter 0.3.0-alpha.1
- Evidence: F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3

No master ref, target remote branch, production port 8080, port 51020, LevelDB, credentials, cookies, browser profiles, or user data was touched. No backup was created. No commit, merge, or push was performed. All temporary Foundry documents were created and removed through Foundry UI or public Document API.

## Mechanical verification

Passed:

- bun install --frozen-lockfile
- module bun run test:coverage: 89 pass, 0 fail, 376 expect() calls; aggregate line coverage 92.84%, function coverage 88.88%
- module bun run typecheck
- module bun run build
- root bun run agents:generate
- root bun run agents:check
- root bun run typecheck:foundry-modules
- git diff --check

The final module build artifact was:

- ZIP SHA-256: 86F7C5C6D8D03D1D83CE04ED979D94615745C81D05FF5D074B2EBC98B565CF06
- Installed tree SHA-256: 6f93f92d07b3c19d7261e1ea9933d287b70199c3673cdec532c4e7fc41d872e1
- verify-install: ok=true, module ID/version correct, runtimeVerified=false before the runtime run

The repository-wide final bun run ci:verify reached all typecheck, architecture, build, and test stages. It ran 1988 tests with 0 failures and 9656 expect() calls, then failed only at the repository coverage gate:

- production lines: 54636/65870 = 82.95%, required 84.00%
- production functions: 5869/6924 = 84.76%, required 85.00%

This is BP-STATIC-004, recorded at F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-STATIC-004-ci-verify-final-coverage-failure.log. The coverage deficit includes repository subsystems outside Battlefield Painter. No other package was modified. Earlier BP-STATIC-001, BP-STATIC-002, and BP-STATIC-003 records are retained.

Mechanical checks do not by themselves prove Foundry canvas semantics, player movement, media motion, spatial audio, or visual quality.

## Installation and runtime identity

The formal installer was used after stopping the previous Lab process and confirming port 30001 was free. The exact existing destination was removed with Remove-Item -LiteralPath <exact module directory> -Recurse and without -Force, then install:local dry-run, install:local -- --apply, and verify-install were run. The installed manifest and tree matched the recorded build.

The formal Lab launcher was used. The launcher returned before the world was ready on an earlier attempt, which is retained as BP-E2E-000; the exact pinned Foundry process was then verified by executable, main.js, dataPath, world, loopback listener, port, log, and HTTP response. The current runtime process used PID 12736 while the final client cases ran. No second Foundry process was started when the launcher returned early.

GM was opened in command-line-launched Chrome using:

    C:\Program Files\Google\Chrome\Application\chrome.exe --new-window http://127.0.0.1:30001/join

The player was an independent Codex in-app Browser session. The GM authenticated as Gamemaster [GM]; the player authenticated as 佐德. The player never received GM authority. Both sessions had Foundry's 1280x720 viewport warning because the available height was below Foundry's 1024x768 minimum. Battlefield Painter-filtered console errors were empty in the executed sessions; unrelated package warnings and the viewport warning remain external noise.

## Repairs and frozen failures

1. BP-E2E-011 and BP-E2E-016 froze the browser-native confirmation problem. The module used globalThis.confirm, which hung or was not a real Foundry modal. It was replaced with Foundry 14 DialogV2.wait, with explicit modal clear/cancel buttons, preserved counts, and false on cancel, close, or missing DialogV2. Focused tests cover acceptance, cancellation, close, counts, and rerender.
2. BP-E2E-024 froze a real internal defect: clear deleted the module documents but did not become an undoable history operation because clearAll reached #withHistory before #history was initialized. The minimal repair initializes scene history before clear. BP-E2E-025 re-ran clear, undo, redo, reload, and foreign-document survival successfully.
3. BP-E2E-015 froze another internal lifecycle defect: closing the ApplicationV2 window left pointer listeners active. The minimal repair deactivates the controller and unsubscribes when the window closes; the focused regression test confirms a later ordinary canvas click does not create another module bundle.
4. BP-STATIC-001 froze strict compiler failures in two existing test files. Only test typing was repaired in brush-engine.test.ts and p2-media-cluster.test.ts. No public contract or production behavior was changed.
5. BP-E2E-018 froze the first preview-only 300-cell attempt and the second wrong-grid retry. BP-E2E-019 is the final correctly measured 25/100/300 run.
6. BP-E2E-026 froze the remaining movement discrepancy. No source change was made because the observed stage-I entry stop may be Foundry/dnd5e movement-budget behavior or a fixture route issue; a focused reproduction is required before claiming a module bug.
7. `BP-E2E-B01-PREVIEW-20260815070722` froze a reproducible internal pointer-preview defect for `BP-CHECK-SQ-004`. On a new blank Square scene, radius-0 hover produced no visible semi-transparent preview and no additional interface Graphics while the Document count stayed zero. A radius-4 same-cell drag then lasted 2603 ms; the 50/150/300 ms screenshots were all captured before release and before any Document existed, but neither the screenshots nor the interface layer contained a preview. Releasing the pointer created the exact expected 81 owned offsets, proving that pointer input and final stroke submission worked while the preview did not. This confirms a module runtime defect, but does not yet identify its source-level root cause.
8. The post-B03 user review confirmed a separate audible runtime defect: while physically present at the workstation, the user heard white noise from the Battlefield Painter audio output regardless of the action being performed. The earlier Foundry `HTMLMediaElement.currentTime` errors do not isolate whether the immediate cause is the audio assets, playback integration, or Foundry/browser media handling, but the delivered audio feature is semantically unusable. The user recommends removing the audio feature in a later repair batch. B03 records the defect only; it does not diagnose, patch, rebuild, reinstall, or remove audio.
9. `BP-E2E-B04-190818-preview-failure` reproduced the pointer-preview defect on a Hex Rows scene. After the GM visibly enabled the Painter and moved the pointer over a Hex Rows cell, no preview highlight/overlay appeared, the interface layer had no preview child, and the module-owned Document count remained zero. This is a real runtime defect in the Hex Rows P1 preview path; no source diagnosis or repair was performed in B04.

By user decision on 2026-08-15, the item-7 defect is queued for deferred remediation. The remaining planned runtime-acceptance steps must be completed and the full defect list consolidated before any source diagnosis, patch, rebuild, reinstall, or preview regression run begins. A later user-authorized repair batch must start from the frozen evidence prefix `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B01-PREVIEW-20260815070722-` and keep the pre-fix failure separate from post-fix evidence.

The item-8 audio defect is also queued for later remediation. The currently preferred product direction is to remove the Battlefield Painter audio feature rather than repair or retain it, but no implementation work is authorized by this acceptance note. The final removal scope must be handled in a later user-authorized code batch.

All repairs preserve the module ID, flags schema, document ownership rules, and public API. The Alpha setDevelopmentPhase setter was deliberately retained; immutable release controls are a later release gate.

## One-to-one acceptance checklist matrix

Every line in docs/acceptance-checklist.md has one unique BP-CHECK case ID. PASS means the complete assertion for that line was observed in the real Foundry run. PARTIAL means a meaningful slice was observed but the full assertion was not closed. BLOCKED means the remaining assertion could not be safely completed in this run. No static-only result is promoted to PASS.

| Case ID | Checklist item | Result | Evidence and boundary |
|---|---|---|---|
| BP-CHECK-ENV-001 | Foundry executable/build reports 14.364 | PASS | Foundry UI build 364 and pinned process/app path; BP-E2E-000/003/025/027. |
| BP-CHECK-ENV-002 | World reports dnd5e 5.3.3 | PASS | Authenticated GM UI and pinned world/system; BP-E2E-025/027. |
| BP-CHECK-ENV-003 | Destination is the approved server-mirror module path | PASS | Formal dry-run/apply/verify-install and install hash. |
| BP-CHECK-ENV-004 | Module 0.3.0-alpha.1 appears and enables without a Battlefield Painter manifest warning | PASS | Formal manifest, real enablement, panel, and module-filtered logs. Existing unrelated bad/good/sample metadata warnings were not attributed to this module. |
| BP-CHECK-ENV-005 | No browser console error during init, ready, Scene load, and canvas teardown | PARTIAL | GM and player Battlefield Painter-filtered logs were empty; the full no-warning assertion is not closed because the viewport and unrelated package warnings were present. |
| BP-CHECK-SQ-001 | GM-only Tiles painter button appears | PASS | Real GM Tiles controls; player controls absent. |
| BP-CHECK-SQ-002 | ApplicationV2 shows six previews, Chinese labels, and states | PASS | Real panel rendered the three terrain cards with two stage previews and controls. |
| BP-CHECK-SQ-003 | Free/line/fill, radius 0-4, and undo/redo disabled states render | PASS | Real panel and phase-combination UI showed these controls and disabled states; BP-E2E-008/009/022. |
| BP-CHECK-SQ-004 | Pointer preview follows cells, respects radius, and disappears on leave/deactivation | PARTIAL | Real preview lifecycle and canvas-leave disappearance were observed; isolated every radius/follow assertion was not separately closed. |
| BP-CHECK-SQ-005 | Radius 0 and 4 strokes skip duplicate owned cells | PARTIAL | Duplicate skip was observed in real strokes; a complete isolated radius-0 and radius-4 duplicate matrix was not preserved. |
| BP-CHECK-SQ-006 | Both line directions match Foundry direct-path behavior | PARTIAL | Line rasterization and duplicate reporting were exercised; both-direction equality against canvas.grid.getDirectPath was not captured. |
| BP-CHECK-SQ-007 | All four fill endpoint directions match the preview | PARTIAL | Fill was exercised and final 5x5, 10x10, and 20x15 rectangles were measured; all four endpoint-direction comparisons were not separately captured. |
| BP-CHECK-SQ-008 | Connected and disconnected cells work for every terrain/stage | PASS | B02 ran six Square terrain/stage combinations, each with one three-cell connected stroke and one disconnected single cell; bundle, Region, offset, and mature-bramble Wall ownership matched the required matrix. |
| BP-CHECK-SQ-009 | Square Tiles align and transparent edges have no obvious seam | PASS | Square client visual inspection found cell alignment with no obvious transparent-edge seam. |
| BP-CHECK-SQ-010 | Player movement through every Region costs x2 | PARTIAL | B03 completed real player drags through fire, frost, and stage-I bramble. Terrain-aware measurements were 10 ft distance and 15 ft cost versus the 10 ft ordinary-grid baseline, all within the 120 ft token budget. A fresh ordinary-ground control could not be completed because a public Token reset triggered a Foundry/Midi-QOL animation error; the failure is frozen in `BP-E2E-B03-172526-normal-ground-reset-failure*`. |
| BP-CHECK-SQ-011 | Fire stages create intended light and torch animation | PASS | GM stage-I/stage-II screenshots and Document/API records show the intended visible light change and exact torch animation fields; the player saw the live fire/light. The post-run user review accepts the feature as working. The missing separate player screenshot for each stage is retained as an evidence-quality note, not a functional failure. |
| BP-CHECK-SQ-012 | Only stage-II brambles block movement and do not block sight/light/sound | PARTIAL | Real player stage-I traversal passed and the same stage-II route stopped at the Wall without crossing it. The four module Walls have move/sight/light/sound fields `20/0/0/0`, and the post-run user review accepts the player-side sight/light behavior as working despite the missing dedicated screenshot. The audio output was confirmed by the user to be white noise and is therefore a real product defect, so the combined case cannot pass. |
| BP-CHECK-SQ-013 | Middle-cell erase rebuilds the remainder and Region/Wall geometry | PASS | Square erase/rebuild and count sequence recorded in BP-E2E-002 and BP-E2E-025. |
| BP-CHECK-SQ-014 | Stage-switch cycles the complete original stroke | PASS | Stage transition replaced the bundle and changed the recorded stage/wall counts. |
| BP-CHECK-SQ-015 | Painting an owned cell skips it without duplication | PASS | Real status and audit showed duplicate cells skipped. |
| BP-CHECK-SQ-016 | Deactivation restores ordinary Foundry canvas controls | PASS | Close-window listener defect was fixed and retested; final module disable also removed the control. |
| BP-CHECK-SQ-017 | Undo/redo paint, erase, stage-switch while foreign docs remain unchanged | PASS | Real history and foreign-document audits remained ownership-scoped; BP-E2E-002/005/025. |
| BP-CHECK-SQ-018 | New edit after undo clears redo | PARTIAL | The behavior was exercised in the history branch, but the original dedicated observation was interrupted; the final record is not upgraded beyond PARTIAL. |
| BP-CHECK-HEX-001 | Three terrain paints on Hex Rows | PASS | Fire, frost, and mature bramble were painted and seen by the player; BP-E2E-006/023. |
| BP-CHECK-HEX-002 | Three terrain paints on Hex Columns | PASS | Fire, frost, and mature bramble were painted and seen by the player; BP-E2E-007/023. |
| BP-CHECK-HEX-003 | Hex Tile bounds do not displace artwork | PASS | Public bounds/center audits matched offset-derived centers for both orientations. |
| BP-CHECK-HEX-004 | Region polygons match six vertices | PASS | Public Document API audit found six vertices for each sampled Region polygon in both orientations. |
| BP-CHECK-HEX-005 | Shared bramble edges do not duplicate Walls | PASS | Canonical endpoint normalization found duplicateWallSegments=[] in both sampled orientations. |
| BP-CHECK-HEX-006 | Hex erase/stage-switch reconstruct identical offsets | PARTIAL | Rows stage/erase/undo reconstruction passed; Columns stage/erase lifecycle was not stable enough to close. |
| BP-CHECK-HEX-007 | Radius/line/fill/preview/undo/redo on both orientations | PARTIAL | The B04 Hex Rows half stopped at a reproduced preview failure before the remaining radius/line/fill/history checks could safely run. The overall Case remains PARTIAL because the Hex Columns half is reserved for B05. |
| BP-CHECK-REC-001 | Invalid Region behavior rolls back Tile creation | PASS | Disposable one-shot public createEmbeddedDocuments wrapper; counts returned to baseline and native method restored; BP-E2E-021. |
| BP-CHECK-REC-002 | auditScene counts match visible owned documents | PASS | Multiple real audits matched Foundry collections and separated foreign IDs; BP-E2E-019/025/027. |
| BP-CHECK-REC-003 | Reload preserves ownership flags for erase/stage | PASS | B02 compared GM and player Document/API snapshots before and after both-client refresh, then completed a post-refresh frost erase and fire stage operation with matching flags, offsets, and audit counts. |
| BP-CHECK-REC-004 | Disable leaves foreign Scene documents untouched | PASS | Fresh clear/disable audit left foreign Tile, Region, Light, Sound, and Wall documents until exact fixture cleanup; BP-E2E-025/027. |
| BP-CHECK-REC-005 | Alpha P1 disable falls back to free radius 0 without preview/history | PASS | Real setDevelopmentPhase state and panel fallback; BP-E2E-009/022. |
| BP-CHECK-REC-006 | Re-enable restores controls; formal release packaging is immutable | PARTIAL | Re-enable/fallback behavior was observed. Alpha setter remains intentionally present; immutable formal release gate was not executed. |
| BP-CHECK-REC-007 | Remove all P0 test documents before acceptance ends | PASS | Six exact BP-ACCEPT scenes, actor, token/embedded fixtures, and temporary macro were removed through Foundry UI/public API after disable-survival proof; BP-E2E-027. |
| BP-CHECK-P2-001 | Module and all nine media files load without console errors | PARTIAL | Static WebP/WebM/OGG checks and selected runtime media requests passed; all nine player-visible load/play assertions were not closed. |
| BP-CHECK-P2-002 | P0 only has static WebP, P0 fire light, and no AmbientSound | PARTIAL | P0 control state was observed; a dedicated P0 paint/media document matrix was not completed. |
| BP-CHECK-P2-003 | P0+P1 repeats radius/line/fill/preview/erase/stage/undo/redo | PARTIAL | P0+P1 controls and several real P1 operations were observed; a dedicated full combination replay was not completed. |
| BP-CHECK-P2-004 | P0+P2 has animated media, OGG, clustered lights, and no P1 controls | PARTIAL | P0+P2 control exclusion and phase state passed; player media motion, audio, and direct cluster membership proof remain open. |
| BP-CHECK-P2-005 | Full combination has interaction and max 16-cell clusters | PARTIAL | Full controls and P2 document generation were observed; direct runtime membership enumeration and complete unified replay remain open. |
| BP-CHECK-P2-006 | Stage ambience has volume and wall attenuation | PARTIAL | No player-confirmed audio/spatial recording exists; status is PARTIAL - USER AUDIO REVIEW UNAVAILABLE. |
| BP-CHECK-P2-007 | 25/100/300 connected cells have counts and visible performance | PARTIAL | Historical 25/100/300 measurements are retained. The B11 supplement completed fresh 25- and 100-cell fills and a partial 25-cell interaction check, but the 300-cell run and player movement evidence were not completed before the 30-minute stop boundary. |
| BP-CHECK-P2-008 | Clear preview counts only module-owned docs | PASS | DialogV2 preview counts and public audit excluded foreign docs; BP-E2E-016/025/027. |
| BP-CHECK-P2-009 | Scene mutation makes stale fingerprint block clear | PASS | B12 completed the real modal-time mutation path: a newly created owned Tile changed the fingerprint while the old DialogV2 preview was open; the old clear was rejected with the stale-scene warning and deleted zero owned or foreign documents. A fresh preview included the new Tile and matched the current fingerprint; cancel also deleted nothing. Evidence: `BP-E2E-B12-211130-*`. |
| BP-CHECK-P2-010 | Clear is one undoable operation and foreign docs survive clear/undo/redo/reload | PASS | Repaired DialogV2 clear, undo, redo, reload, and foreign survival passed in BP-E2E-025; final fresh clear/disable audit is BP-E2E-027. |
| BP-CHECK-P2-011 | Repeat P2 media/sound/cluster/clear on Square, Hex Rows, Hex Columns | PARTIAL | Terrain and geometry were run on all grids; unified P2 media/audio/cluster/clear replay on all three was not completed. |
| BP-CHECK-P2-012 | Formal release controls immutable and setter absent | PARTIAL | Alpha setter and fallback behavior were intentionally retained; formal release packaging gate is future work. |

## Square semantic results

The Square run provided the strongest complete slice: exact terrain types and stages, static and animated-looking fire visuals, fire light, mature-bramble walls, middle-cell erase/rebuild, stage replacement, duplicate skip, history, clear, foreign-document ownership, and two-client refresh. The player performed real token drags. Open-ground movement worked and mature stage-II bramble produced one actual refusal with an unchanged token document. The expected measured x2 movement through every Region and stage-I pass-through did not close. The final route was deliberately not substituted with a GM document-field claim.

The stage-I entry failure is recorded as a runtime discrepancy, not automatically as a module defect. The clean next action is a focused Foundry/dnd5e movement-budget fixture with a known token footprint and measured path entry before changing module code.

## Hex Rows and Hex Columns

Hex Rows and Hex Columns both passed the sampled terrain, tile alignment, six-vertex Region, and shared-edge Wall checks. Rows also passed the sampled stage-switch, middle erase, and undo offset reconstruction. Columns did not close a stable stage/erase lifecycle. The exact evidence is BP-E2E-023. The broad repeated P1/history matrix remains PARTIAL.

## Four development-phase combinations

| Combination | Runtime result | What was observed |
|---|---|---|
| P0 | PARTIAL | Terrain/stage/mode remained; free radius 0 fallback and no P1/P2 controls/history. |
| P0+P1 | PARTIAL | Free/line/fill, radius 0-4, and undo/redo returned; P2 section absent. |
| P0+P2 | PARTIAL | P2 section returned; P1 geometry/radius/history controls absent. |
| P0+P1+P2 | PARTIAL | Full control surface and dynamic document generation returned. Dedicated media/cluster replay remains open. |

Evidence: BP-E2E-009 and BP-E2E-022. Alpha setDevelopmentPhase remains present by explicit scope; removing it is not part of this acceptance run.

## Large-area measurements

The branch defines no numeric SLA. These are measurements only, not threshold claims.

| Cells | Input | Pointer elapsed | Tiles | Regions | Lights | Sounds | Walls | Cluster note |
|---:|---|---:|---:|---:|---:|---:|---:|---|
| 25 | 5 x 5 fill | 4598 ms | 25 | 1 | 2 | 2 | 0 | Deterministic plan; membership not independently enumerated |
| 100 | 10 x 10 fill | 7209 ms | 100 | 1 | 7 | 7 | 0 | Deterministic plan; membership not independently enumerated |
| 300 | 20 x 15 fill | 11832 ms | 300 | 1 | 21 | 21 | 0 | 21 light/sound docs consistent with clustered plan; membership cap not independently enumerated |

The final 300-cell audit covered 20 rows with 15 cells each. The operations completed and remained auditable. Full continued-interaction health after each operation was not recorded as a separate hard assertion.

## Media and audio

Static tests prove the six VP9 alpha WebM files and three OGG Opus files exist, decode, and have the expected signatures/parameters. Runtime fire visuals and selected media requests were seen. The required player-side proof that all six videos visibly move, that all three sounds spatially change with near/far/wall movement, and that stage-specific attenuation is correct was not completed.

No audio recording was produced. There is no BP-E2E-018-player-media-audio.webm in the evidence directory. The user must not be asked to infer audio acceptance from network requests or static asset tests.

## Clear, persistence, and cleanup

BP-E2E-024 froze the first clear-history failure. BP-E2E-025 passed the repaired DialogV2 clear, module-owned-only accounting, undo, redo, redo clearing, reload, and foreign-document survival. BP-E2E-027 then performed a fresh preview/clear, disabled the module through Foundry UI, rejoined the player through /join, confirmed painter controls absent for both clients, and preserved the foreign-document audit before cleanup.

The stale fingerprint mutation path remains PARTIAL because the real modal-time mutation could not be driven by a second GM while the modal occupied the session. Static fingerprint coverage does not replace this runtime case.

After the disable-survival proof, a visible GM Macro selected only BP-ACCEPT- scenes/actors plus the explicitly recorded unnamed task Tile ID lonhvixsxuabKRN8. The audit enumerated six scenes and one actor before removal and reported scenes=[], actors=[], currentScene=null after removal. The temporary Macro itself was then deleted with its Foundry UI context menu and confirmation. The final module installation directory was retained and disabled.

## Evidence timeline

Existing evidence retained from the prior continuation:

- BP-E2E-000: launcher wait failure and bounded exact-process startup
- BP-E2E-001 through BP-E2E-013: initial real Square/Hex/phase/foreign-document/browser/reload records
- BP-E2E-014: earlier Chrome-unavailable hard-gate attempt; superseded by command-line Chrome in this continuation, but preserved as the original failure

This continuation:

- BP-E2E-015: close-window active-pointer defect and frozen evidence
- BP-E2E-016: DialogV2 clear success and stale-fingerprint boundary
- BP-E2E-017: foreign Wall survival
- BP-E2E-018: two unsuccessful 300-cell attempts, retained as failure evidence
- BP-E2E-019: final 25/100/300 measurements
- BP-E2E-020: first player movement/cost partial
- BP-E2E-021: runtime invalid-Region rollback PASS
- BP-E2E-022: four phase combinations PARTIAL
- BP-E2E-023: Hex Rows/Columns geometry and rebuild sample
- BP-E2E-024: clear-not-undoable failure before repair
- BP-E2E-025: clear undo/redo/reload retest PASS
- BP-E2E-026: final mature-bramble refusal and stage-I movement discrepancy
- BP-E2E-027: clear/disable/foreign survival and exact Foundry cleanup
- BP-STATIC-004: final repository ci:verify coverage failure

## Final Lab state and remaining gates

The module is installed at the approved server-mirror destination but disabled. Battlefield Painter controls are absent after the final Foundry UI reload. Test documents and the temporary audit macro are removed. The formal stop returned {"ok":true,"profile":"server-mirror","stopped":true}; former PID 12736 was absent and ports 30001, 8080, and 51020 had no listeners in the post-stop check. Evidence: F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-028-final-lab-stop.log.

Remaining work before a PASS or PASS WITH RELEASE GATE decision:

1. Focused player movement fixture: measure x2 through every Region and resolve the stage-I entry discrepancy; then repeat mature-bramble collision and sight/light/sound non-blocking.
2. Complete the stale fingerprint mutation case with a safe second mutation path.
3. Finish six WebM motion, three OGG spatial playback, stage ambience, attenuation, and user audio review.
4. Re-run the full P1 matrix on both Hex Rows and Hex Columns, including both directions and all four fill endpoints.
5. Complete unified P2 media/cluster/clear checks on Square, Hex Rows, and Hex Columns, with direct cluster membership evidence.
6. Record post-operation pan/zoom/button/token interaction health for 25/100/300.
7. Resolve or obtain an integration-owner decision for the repository-wide coverage gate; no unrelated package was changed here.
8. For formal release only, make phase controls immutable and remove the Alpha setter. That action was intentionally not performed in this Alpha acceptance.

Valid final status for this run: PARTIAL.

## B00 micro-batch — 2026-08-15

Batch result: PASS for B00 scope only. B01 and all later micro-batches were not started.

The formal local Lab was launched with the existing `server-mirror` profile on `127.0.0.1:30001`; the pinned runtime reported Foundry `14.364`, dnd5e `5.3.3`, world `cor-cotn`, and Battlefield Painter `0.3.0-alpha.1`. The GM used a command-line-launched Chrome tab claimed through the explicit `chrome` backend and authenticated as `Gamemaster [GM]`. The independent Codex in-app Browser used the explicit `iab` backend and authenticated as `佐德`; both submitted the blank password exactly once. The exact PowerShell `Start-Process` wrapper was rejected by the host policy, so the same Chrome executable was launched directly from the command line; no Browser/Edge/Computer Use substitute was used.

The GM Tiles control and registered Battlefield Painter tool were present. The GM panel visibly rendered its terrain, stage, draw/erase/stage-switch, geometry, radius, history, and clear controls. The player had no Tiles or Painter control. On the player client, the module API exposed only diagnostics; `canMutate` was `false`, the draw/clear/stage and document CRUD entrypoints were unavailable, and `auditScene()` remained `bundles=0, lights=0, regions=0, sounds=0, tiles=0, totalDocuments=0, walls=0` before and after the read-only probe. No browser storage was read or saved.

The empty scene `BP-ACCEPT-20260815-B00-135200-Session` was created through Foundry UI. The client was switched to the existing `test` scene and returned to the B00 scene; the scene-navigation click did not transition under the open Foundry UI state, so the return loop was completed with the public Foundry Scene activation API through the GM Chrome CDP session. Both clients ended on the B00 scene, with zero module documents. Battlefield Painter-filtered console errors and network failures were empty on both clients. The server log evidence records a zero-byte/zero-line delta after the baseline and retains the current tail, including the scene creation entry.

Case status mapping for this B00 run:

| Case ID | Previous status | B00 status | Evidence boundary |
| --- | --- | --- | --- |
| BP-CHECK-ENV-001 | PASS | PASS | Foundry 14.364 visible/runtime probe |
| BP-CHECK-ENV-002 | PASS | PASS | dnd5e 5.3.3 and `cor-cotn` runtime probe |
| BP-CHECK-ENV-004 | PASS | PASS | Module 0.3.0-alpha.1 enabled, GM panel, filtered logs |
| BP-CHECK-ENV-005 | PARTIAL | PARTIAL | Module-filtered logs were empty, but existing viewport/unrelated warnings keep the broad no-warning gate partial |
| BP-CHECK-SQ-001 | PASS | PASS | GM Tiles/Painter visible; player Tiles/Painter absent |

Evidence prefix: `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B00-`. The Lab and both browser sessions were intentionally left running; the module remains enabled for the next user-directed batch.

## B01 micro-batch — 2026-08-15

Batch result: PARTIAL for B01 scope only. B02 and all later micro-batches were not started.

This batch stayed in the fixed runtime-acceptance worktree and used the existing `server-mirror` Lab at `127.0.0.1:30001`, world `cor-cotn`, Foundry `14.364`, dnd5e `5.3.3`, and Battlefield Painter `0.3.0-alpha.1`. The GM was the command-line-launched Chrome session controlled through the explicit `chrome` backend. The player was a fresh, independent Codex in-app Browser tab controlled through the explicit `iab` backend and authenticated as `佐德`; it was not a second tab or second identity in GM Chrome. The B01 scene was `BP-ACCEPT-20260815-B01-141619-Square` (`TVvuGsrZyztLuA6l`). Scene activation and the initial GM panel open used the public Foundry API through the GM Chrome CDP session after the normal scene navigation did not transition; no source file, module installation, fixture cleanup, Lab process, 8080, or 51020 was changed.

### B01 Case status mapping

| Case ID | Previous status | B01 status | Evidence boundary |
| --- | --- | --- | --- |
| BP-CHECK-SQ-004 | PARTIAL | FAIL | The focused recheck used a new blank Square scene. Radius-0 hover waited about 220 ms with zero Documents and no added preview Graphics; a radius-4, 220-point same-cell drag lasted 2603 ms, and the 50/150/300 ms frames were all before release with zero Documents and no preview. Release then created exactly the expected 81 owned offsets. |
| BP-CHECK-SQ-005 | PARTIAL | PARTIAL | Radius 0 duplicate reported `已绘制 0 格；1 格已有本模组地形，已跳过。`; radius 4 first paint created 81, exact repeat skipped 81, and a two-cell-shift partial overlap created 18/skipped 63. Owned offset/doc comparisons passed, but the required preview-offset comparison was not observable. |
| BP-CHECK-SQ-006 | PARTIAL | PARTIAL | Forward and reverse fixed A/B line commits both matched the sorted offset set from Foundry `canvas.grid.getDirectPath([A,B])` / reverse. Preview offset equality was not observable, so the Case is not closed. |
| BP-CHECK-SQ-007 | PARTIAL | PARTIAL | All four rectangle endpoint directions committed the same inclusive 12-cell offset set. Preview offset equality was not observable, so the Case is not closed. |
| BP-CHECK-SQ-018 | PARTIAL | PASS | The corrected flow painted an unowned cell, undid it, painted a different unowned cell, then left `canRedo=false`; the settled Redo control was disabled. The public API had no `redo` function; clicking the disabled Redo control caused no audit or owned-offset change. |

The mechanical Document/API end state on the GM was `bundles=8, tiles=125, regions=8, lights=14, sounds=14, walls=0, totalDocuments=161`; the B01 scene remained intentionally populated because this batch does not clean fixtures. The player received the same document audit but had `isGM=false`, no Painter controls in the visible DOM, and an inactive Painter API state. The semantic acceptance result is PARTIAL because all preview-dependent gates were not demonstrated; committed square-brush offsets, duplicate skip accounting, line path sets, fill sets, and the corrected redo no-op behavior were separately recorded rather than inferred from document totals.

Evidence prefix: `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B01-141619-`.

Core evidence: `BP-E2E-B01-141619-summary.json`, `BP-E2E-B01-141619-sq004-preview-all-radii.json`, `BP-E2E-B01-141619-sq004-preview-close-separate.json`, `BP-E2E-B01-141619-sq005-radius0-duplicate.json`, `BP-E2E-B01-141619-sq005-radius4-full-overlap.json`, `BP-E2E-B01-141619-sq005-radius4-partial-overlap.json`, `BP-E2E-B01-141619-sq006-line-expected.json`, `BP-E2E-B01-141619-sq006-line-forward.json`, `BP-E2E-B01-141619-sq006-line-reverse.json`, `BP-E2E-B01-141619-sq007-fill-expected.json`, `BP-E2E-B01-141619-sq007-fill-tl-br.json`, `BP-E2E-B01-141619-sq007-fill-br-tl.json`, `BP-E2E-B01-141619-sq007-fill-tr-bl.json`, `BP-E2E-B01-141619-sq007-fill-bl-tr.json`, `BP-E2E-B01-141619-sq018-corrected-valid-flow.json`, `BP-E2E-B01-141619-sq018-redo-call-result.json`, `BP-E2E-B01-141619-player-document-api-final.json`, `BP-E2E-B01-141619-console-network-final.json`, `BP-E2E-B01-141619-server-log-delta-redacted.txt`, `BP-E2E-B01-141619-server-log-summary.json`, and `BP-E2E-B01-141619-final-session-state.json`. The earlier exploratory `BP-E2E-B01-141619-sq018-undo-new-paint-redo.json` is retained as non-authoritative; the corrected valid flow is the acceptance record.

The B01 stop point leaves the Lab running, the module enabled, the GM Painter active, the independent player session connected without Painter controls, and the B01 scene documents in place. No B02 action was taken.

### B01 `BP-CHECK-SQ-004` preview专项复核 — 2026-08-15

This focused recheck changes only `BP-CHECK-SQ-004` from `PARTIAL` to `FAIL`; the overall B01 result remains `PARTIAL` because `BP-CHECK-SQ-005`, `BP-CHECK-SQ-006`, and `BP-CHECK-SQ-007` were not re-tested in this supplement. The new blank scene was `BP-ACCEPT-20260815-B01-070722-Preview` (`4w6z31BIL9xJXRPO`).

The GM moved onto a valid blank map cell and waited about 220 ms without pressing. The scene stayed at zero Documents and the interface layer had no new preview Graphics. The required drag timing proof then used radius 4 and 220 small same-cell jitter points. The drag lasted 2603 ms; screenshots captured at approximately 50 ms, 150 ms, and 300 ms were each captured before drag resolution and before any Document existed. All three original-resolution frames showed no semi-transparent preview. After release, the Document/API audit showed 81 tiles, 1 bundle, and 1 region; the 81 module-owned offsets exactly matched the expected 9×9 set. This proves the pointer and screenshot timing were valid, the stroke could commit, and the preview was not visibly displayed. It does not identify a particular source line as the cause.

The move-out-of-map and separate panel-close checks were not continued after the first clear preview failure, as required by the专项 plan's stop rule. The player remained on the same scene with `isGM=false` and no Painter controls in its visible DOM. The module stayed enabled, the Lab stayed running, and no B02 action was taken.

Supplemental evidence prefix: `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B01-PREVIEW-20260815070722-`.

## B02 micro-batch — 2026-08-15

Batch result: PASS for B02 scope only. B03 and all later micro-batches were not started.

This batch used only `SQ-008` and `REC-003` in a new Square fixture, `BP-ACCEPT-20260815-B02-164933-Square` (`8jqQwofORLPMG5k3`). The fixed local Lab remained `127.0.0.1:30001`, world `cor-cotn`, Foundry `14.364`, dnd5e `5.3.3`, and Battlefield Painter `0.3.0-alpha.1`. The GM was the command-line Chrome session controlled through the explicit `chrome` backend and authenticated as `Gamemaster [GM]`. The independent player was the Codex in-app Browser controlled through the explicit `iab` backend and authenticated as `佐德`; it was not a second Chrome tab or a second identity. No source file, module installation, fixture cleanup, Lab process, 8080, or 51020 was changed.

### B02 Case status mapping

| Case ID | Previous status | B02 status | Evidence boundary |
| --- | --- | --- | --- |
| BP-CHECK-SQ-008 | PARTIAL | PASS | Six Square terrain/stage combinations were painted. Each combination had a three-cell connected stroke and a separated one-cell stroke. The three connected Tiles shared one bundle and one Region; mature stage-II bramble produced module-owned Walls, while the other five combinations produced no module-owned Wall. GM and player both received 24 Tiles before the persistence edits, and the player visibly saw the terrain without Painter controls. |
| BP-CHECK-REC-003 | PARTIAL | PASS | A frost connected stroke had its middle cell erased, a fire connected stroke had its stage advanced, GM Chrome and the independent player Browser were refreshed, Scene re-entry succeeded on both, all Document/API flags/offsets and counts matched before/after refresh, and one further legal frost erase plus one fire stage operation succeeded after refresh. |

The authoritative SQ-008 pre-persistence audit was `bundles=12, tiles=24, regions=12, lights=4, sounds=12, walls=12, totalDocuments=64`. The group analysis proved six terrain/stage combinations, two bundles per combination, one three-Tile connected bundle and one one-Tile disconnected bundle per combination, one Region per connected bundle, no Wall outside mature bramble, and Walls for both mature-bramble bundles. After the required erase/stage operations, the final audit was `bundles=12, tiles=22, regions=12, lights=4, sounds=12, walls=12, totalDocuments=62`; the GM and player final audits matched.

The fresh scene defaulted to token vision, and the player had no Token. To make the required player-visible Tile check meaningful, the scene was changed through the public Foundry Scene Document API to `tokenVision=false`; this was a test-scene setting change, not a module/source change. The world was also unpaused through the public Foundry pause API with broadcast enabled so the independent player could see the canvas. The player then visibly saw the six terrain rows; the GM panel remained visible only on the GM, and the player DOM contained no Battlefield Painter heading or controls. The normal 1280×720 viewport warning remains environment noise and is recorded in the screenshots/log evidence.

The normal scene navigation did not provide a reliable transition after creation/refresh, so the public Foundry Scene activation API was used from the GM Chrome CDP session to enter the named fixture. After refresh, the GM Painter window was reopened through the module's public GM API so the required post-refresh operations could be performed; the actual erase/stage actions were still driven through the visible Painter UI and real canvas pointer events.

Evidence prefix: `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B02-164933-`.

Core evidence includes `BP-E2E-B02-164933-sq008-group-analysis.json`, `BP-E2E-B02-164933-sq008-final-document-api.json`, `BP-E2E-B02-164933-sq008-player-visible-tiles-final.png`, `BP-E2E-B02-164933-rec003-pre-refresh.json`, `BP-E2E-B02-164933-rec003-post-refresh-document-api.json`, `BP-E2E-B02-164933-rec003-post-refresh-after-frost-erase.json`, `BP-E2E-B02-164933-rec003-post-refresh-after-fire-stage.json`, `BP-E2E-B02-164933-final-document-api.json`, `BP-E2E-B02-164933-final-console.json`, `BP-E2E-B02-164933-final-network.json`, and `BP-E2E-B02-164933-final-player-clear.png`. The six per-combination Document/API snapshots, before/after operation snapshots, refresh screenshots, scene-visibility record, and server-log record are retained under the same absolute prefix.

The B02 stop point leaves the Lab running, the module enabled, the GM Painter active, the independent player connected on the B02 Scene without Painter controls, and the B02 fixture documents in place. B03 and all later micro-batches were not started.

## B03 micro-batch — 2026-08-15

Batch result: PARTIAL for B03 scope only. B04 and all later micro-batches were not started.

This batch used only `SQ-010`, `SQ-011`, and `SQ-012` in the new Square fixture `BP-ACCEPT-20260815-B03-172526-Square` (`bOerRKfSNOyVo6Zj`). The fixed local Lab remained `127.0.0.1:30001`, world `cor-cotn`, Foundry `14.364`, dnd5e `5.3.3`, and Battlefield Painter `0.3.0-alpha.1`. The GM used the command-line Chrome session through the explicit `chrome` backend and authenticated as `Gamemaster [GM]`. The independent player used the Codex in-app Browser through the explicit `iab` backend and authenticated as `佐德`; it was not a second Chrome tab or a second identity.

### B03 Case status mapping

| Case ID | Previous status | B03 status | Evidence boundary |
| --- | --- | --- | --- |
| BP-CHECK-SQ-010 | PARTIAL | PARTIAL | Fire, frost, and stage-I bramble each accepted a real player drag. The terrain-aware path record was 10 ft distance / 15 ft cost, and the Region behavior was x2. The new ordinary-ground control was stopped after a public reset caused a Foundry/Midi-QOL animation error; no source was changed. |
| BP-CHECK-SQ-011 | PARTIAL | PASS | GM stage-I/stage-II records and screenshots show the expected torch animation and visible light-field change. The player saw the live fire/light, and the post-run user review accepts the feature as complete. The missing separate player screenshot for each stage remains only an evidence-quality limitation. |
| BP-CHECK-SQ-012 | PARTIAL | PARTIAL | Stage-I bramble traversal passed. Repeating the same path after stage-II conversion stopped the player token at `x=1599` before the Wall at `x=1600`. Four module Walls were recorded with `move=20`, `sight=0`, `light=0`, `sound=0`; the user accepts sight/light behavior as working despite the screenshot gap. The user directly heard white noise from the audio output, so audio is now a confirmed product defect and the combined case remains PARTIAL. |

The B03 fixture contained one player-owned single-cell token with a 120 ft walk speed and no unrecorded module Wall or Region. The live player page showed the player token and the far-side token but no Battlefield Painter controls. The B03 audit at the stop point was `bundles=5, tiles=5, regions=5, lights=2, sounds=5, walls=4, totalDocuments=21`.

Post-run semantic acceptance on 2026-08-15 changes the interpretation of two B03 boundaries. `SQ-011` is accepted as functionally complete: the user considers the fire light behavior working, and the remaining omission is only the lack of two separately preserved player screenshots. For `SQ-012`, the user likewise considers the player sight/light behavior to be working and regards the missing screenshot as an evidence omission rather than a behavior failure. Audio is different: the user was present at the machine and heard white noise regardless of the action, so the audio portion is a confirmed product defect rather than an evidence gap. The requested later remediation direction is removal of Battlefield Painter audio, not a B03-time repair.

The fresh normal-ground control was deliberately not retried after the setup error. Its evidence records the exact Foundry exception (`Cannot set properties of undefined (setting 'last')`) in the Token movement-animation path while another enabled module (`midi-qol`) was on the call stack. This is recorded as a test-environment/fixture obstruction, not as a Battlefield Painter source defect. The existing B03 movement results and the obstruction are both retained.

Evidence prefix: `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B03-172526-`.

Core evidence includes `BP-E2E-B03-172526-final-document-api.json`, `BP-E2E-B03-172526-final-gm.png`, `BP-E2E-B03-172526-final-player.png`, `BP-E2E-B03-172526-final-console-network-server.json`, `BP-E2E-B03-172526-movement-fire-terrain-cost.json`, `BP-E2E-B03-172526-movement-fire-after-player.png`, `BP-E2E-B03-172526-movement-frost-before.json`, `BP-E2E-B03-172526-movement-frost-after.png`, `BP-E2E-B03-172526-movement-bramble-middle-stage-I-after.json`, `BP-E2E-B03-172526-movement-bramble-middle-stage-I-after.png`, `BP-E2E-B03-172526-movement-bramble-middle-stage-II-collision.json`, `BP-E2E-B03-172526-movement-bramble-middle-stage-II-collision-player.png`, `BP-E2E-B03-172526-fire-stage-I-document-api.json`, `BP-E2E-B03-172526-fire-stage-II-document-api.json`, `BP-E2E-B03-172526-wall-sides-player-visible-objects.json`, `BP-E2E-B03-172526-wall-sides-player-visible.png`, and `BP-E2E-B03-172526-normal-ground-reset-failure.json` with its GM/player screenshots.

B03 leaves the Lab running, the module enabled, the GM Painter active, the independent player connected on the B03 Scene without Painter controls, and the B03 fixture documents in place. No source, module installation, Lab process, 8080, or 51020 was changed by this batch. B04 and all later micro-batches were not started.

## B04 micro-batch — 2026-08-15

Batch result: FAIL for the B04 Hex Rows scope. B05 and all later micro-batches were not started.

This batch was limited to the Hex Rows half of `HEX-007`, in the new fixture `BP-ACCEPT-20260815-B04-190818-HexRows` (`CtIJObUaswBWEyMx`). The fixed local Lab remained `127.0.0.1:30001`, world `cor-cotn`, Foundry `14.364`, dnd5e `5.3.3`, and Battlefield Painter `0.3.0-alpha.1`. The GM used the command-line Chrome session through the explicit `chrome` backend and authenticated as `Gamemaster [GM]`. The independent player used the Codex in-app Browser through the explicit `iab` backend and authenticated as `佐德`; it was not a second Chrome tab or a second identity.

### B04 Case status mapping

| Case ID | Previous status | B04 Hex Rows result | Evidence boundary |
| --- | --- | --- | --- |
| BP-CHECK-HEX-007 | PARTIAL overall | FAIL for B04 Hex Rows scope; overall remains PARTIAL | The Painter was visibly enabled and the pointer was moved over a Hex Rows cell. No preview appeared, the module state remained active, the interface layer had no preview child, and the module-owned audit remained `bundles=0, tiles=0, regions=0, lights=0, sounds=0, walls=0, totalDocuments=0`. Per the common rule, B04 stopped before radius-4 duplicate, line, fill, leave/close, undo/redo, or redo-clearing checks. Hex Columns was not started and remains reserved for B05. |

The B04 player page showed the independent `佐德` identity and no Battlefield Painter GM controls. The B04 fixture and its player token remain in place. The failure is a module runtime behavior failure, not a missing screenshot: the GM screenshot shows the active Painter and the hovered Hex Rows canvas, while the API snapshot confirms the absence of preview state and the zero Document audit.

Evidence prefix: `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B04-190818-`.

Core failure evidence includes `BP-E2E-B04-190818-fixture-created.json`, `BP-E2E-B04-190818-pre-paint-gm.png`, `BP-E2E-B04-190818-pre-paint-player.png`, `BP-E2E-B04-190818-preview-radius0-hover.png`, `BP-E2E-B04-190818-preview-radius0-hover.json`, `BP-E2E-B04-190818-preview-failure.json`, `BP-E2E-B04-190818-preview-failure-gm.png`, and `BP-E2E-B04-190818-preview-failure-player.png`.

B04 stopped with the Lab running, the module enabled, the GM Painter still active, the independent player connected on the B04 Hex Rows Scene without Painter controls, and the B04 fixture documents in place. No source, module installation, Lab process, 8080, or 51020 was changed by this batch. B05 and all later micro-batches were not started.

## B11 微批次 — 2026-08-15

批次结果：PARTIAL，仅针对 B11 范围。B12 及任何后续批次未开始。

本批严格使用固定工作树和既有 `server-mirror` Lab。GM 使用命令行启动并通过明确 Chrome backend 控制的 Chrome，会话身份为 `Gamemaster [GM]`；玩家使用独立 Codex 内置 Browser，通过明确 `iab` backend 控制，会话身份为 `佐德`。没有把同一浏览器的两个标签页当成双客户端。未读取 Cookie、浏览器 profile、密码、local storage 或 LevelDB；未修改源码、重装模块、运行 CI、清理 fixture、停 Lab、触碰 8080 或 51020。

### B11 Case 状态

| Case ID | 旧状态 | B11 后状态 | 说明 |
| --- | --- | --- | --- |
| BP-CHECK-P2-007 | PARTIAL | PARTIAL | 旧的 4598/7209/11832 ms 及旧文档计数原样保留。B11 新增 25 和 100 格填充证据，并完成了 25 格的控件切换、撤销/重做、地图缩放和键盘平移观察；300 格、三种规模的玩家实际移动，以及完整的每规模交互闭环未能在时间上限内完成。 |

### B11 规模结果

| 规模 | B11 状态 | 新填充耗时 | Document/API 对照 | offsets |
| ---: | --- | --- | --- | --- |
| 25 | PARTIAL | 指针释放后 274 ms；文档稳定 2488 ms | Tiles 25，Regions 1，Lights 2，Sounds 2，Walls 0，bundle/cluster 1；状态为“已绘制 25 格” | `i=16..20`、`j=12..16`，共 25 个，排序后的完整列表见 API 证据 |
| 100 | PARTIAL（填充本身完成） | 指针释放后 300 ms；文档稳定 2501 ms | Tiles 100，Regions 1，Lights 7，Sounds 7，Walls 0，bundle/cluster 1；状态为“已绘制 100 格” | `i=16..25`、`j=12..21`，共 100 个，排序后的完整列表见 API 证据 |
| 300 | 未完成 | 未开始 | 无本批 300 格 Document/API 结果 | 无 |

这些耗时是本批实际记录，不是通过/失败门槛。25 格的正确填充使用 5×5 覆盖；前面出现过的 81 格是测试坐标校准错误，不是 Battlefield Painter 代码故障。100 格使用 10×10 覆盖，公开状态和 Document 数量相符。B04 已知的鼠标悬停预览缺失没有被当作 B11 失败条件；本批没有诊断或修复它。AmbientSound 只记录数量，没有播放或录音。

### B11 真实可见行为

- GM 端：25 格填充后，Fire→Frost→Fire、阶段 I→II→I、Fill→Line→Fill 均能通过可见 Painter 控件切换；撤销后本次填充文档归零，重做后恢复 25 Tiles、1 Region、2 Lights、2 Sounds，且没有重复文档。随后实际缩放改变了视图比例，键盘平移改变了 Foundry 视口中心。100 格的填充按钮和结果可见并完成；没有开始它的完整控件/撤销重做/平移缩放闭环。
- 玩家端：独立玩家跟随进入了 B11 场景，画面能看到填充后的地图，页面没有 Battlefield Painter 控件。25 和 100 格都没有在本批停止前完成玩家把 Token 拖到相邻空白格的验证，因此不能把玩家移动写成通过。
- 已知缺陷仍单独记录：B04 的鼠标预览问题和此前确认的音频白噪音问题没有在 B11 重新诊断或修复。

### B11 证据

证据目录：`F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3`

25 格证据：

- `BP-E2E-B11-25-201646-fill-gm.png`
- `BP-E2E-B11-25-201646-fill-player.png`
- `BP-E2E-B11-201646-api.json`
- `BP-E2E-B11-201646-api-25-complete.json`
- `BP-E2E-B11-25-201646-timing.json`
- `BP-E2E-B11-25-201646-interaction-gm.png`
- `BP-E2E-B11-25-201646-interaction-player.png`
- `BP-E2E-B11-25-201646-interaction-api.json`

100 格证据：

- `BP-E2E-B11-100-201646-fill-gm.png`
- `BP-E2E-B11-100-201646-fill-player.png`
- `BP-E2E-B11-201646-api-100.json`
- `BP-E2E-B11-100-201646-timing.json`
- `BP-E2E-B11-100-201646-console-gm.json`
- `BP-E2E-B11-100-201646-console-player.json`
- `BP-E2E-B11-100-201646-network.json`

环境和服务器证据：

- `BP-E2E-B11-201646-environment.json`
- `BP-E2E-B11-201646-server-log-tail.txt`
- `BP-E2E-B11-201646-final-session-state.json`

服务器日志已保存本批停止时的末尾 60000 字节；由于本批进入时间上限时优先冻结已有结果，未形成带明确起始偏移量的独立 delta 文件，这是证据缺口，不把它冒充为完整 server-log 对照。

### B11 停止状态

停止时 Git 工作树仍为既有验收分支，原有未提交改动保持不动；本批没有 commit、merge 或 push。Lab 进程 PID 为 `32616`，`127.0.0.1:30001` 仍在监听，`/join` 返回 HTTP 200；世界为 `cor-cotn`，Foundry `14.364`，dnd5e `5.3.3`，模块 `fvtt-battlefield-painter 0.3.0-alpha.1` 且已启用。8080 和 51020 没有被触碰。B11 到此停止，未开始 B12，正在等待用户决定下一步。

## B12 微批次 — 2026-08-15

批次结果：PASS，仅针对 B12 / `BP-CHECK-P2-009`。本批完成后立即停止，未开始 B90。报告整体仍可为 PARTIAL，因为其他 Case 的状态没有被 B12 连带改变。

本批严格使用固定工作树和既有 `server-mirror` Lab。GM 使用命令行新开的 Chrome，并通过明确 Chrome backend 控制，会话身份为 `Gamemaster`；玩家使用独立 Codex 内置 Browser，并通过明确 `iab` backend 控制，会话身份为 `佐德`。没有把同一浏览器的两个标签页当成双客户端。密码框保持空白；未读取 Cookie、浏览器 profile、密码、local storage 或 LevelDB。为释放仍占用 GM 身份的上一批旧客户端，只关闭了旧 B11 GM 浏览器标签页，没有停止 Lab。未修改源码、重装模块、运行 CI、清理 fixture、禁用模块、触碰 8080 或 51020。

### B12 Case 状态

| Case ID | 旧状态 | B12 后状态 | 说明 |
| --- | --- | --- | --- |
| BP-CHECK-P2-009 | PARTIAL | PASS | 旧确认窗口打开期间，通过同一 GM 页面公开 Scene Document API 新增了一个合法的 Battlefield Painter owned Tile；模块 audit 识别为第二个 bundle，旧 fingerprint 变为 stale，旧“清除”被拒绝且零删除。重新打开的预览显示新 counts/fingerprint，取消后所有文档仍在。 |

### B12 夹具和 fingerprint 对照

场景为 `BP-ACCEPT-20260815-B12-211130-Square`，玩家 Actor 为 `BP-ACCEPT-20260815-B12-211130-Player-Actor`。Painter 可见界面实际提交了 Fire、阶段 I、半径 0 的单格绘制，初始 owned audit 为 `bundles=1, totalDocuments=4, Tiles=1, Regions=1, Lights=1, Sounds=1, Walls=0`。

旧窗口打开前的 owned fingerprint（按 `Tile → Region → AmbientLight → AmbientSound → Wall` 收集后排序）为：

`AmbientLight:tReGoNxTuplt7xAj|AmbientSound:FYVsku2IJDlVHKEA|Region:coeUaLF9cnzFhgv5|Tile:tk6F0NGlcRuuNPii`

旧窗口保持打开时新增的 owned Tile 为 `7JAHmWIfcuCB1i5z`，flags 中保留了 `configurationId=fire`、`stageIndex=0`、`role=terrain-tile`，并使用新的 `bundleId`、`cellKey=7:6` 和 `offset={i:7,j:6}`。变化后的 fingerprint 为：

`AmbientLight:tReGoNxTuplt7xAj|AmbientSound:FYVsku2IJDlVHKEA|Region:coeUaLF9cnzFhgv5|Tile:7JAHmWIfcuCB1i5z|Tile:tk6F0NGlcRuuNPii`

变化后 audit 为 `bundles=2, totalDocuments=5, Tiles=2, Regions=1, Lights=1, Sounds=1, Walls=0`。这证明新增文档被模块自己的公开审计识别，且新 fingerprint 只比旧 fingerprint 多一个 owned Tile。

本批五类外部文档 ID 为 `Tile:J4xIjz3Pg4HW1vkv`、`Region:WX2IXukM8FcHGQPd`、`AmbientLight:GUDL1m1g90RNVkZr`、`AmbientSound:D55hYd7WfWrP42so`、`Wall:OfEzlFLu0FO3TmQ6`。它们都没有 `fvtt-battlefield-painter` ownership flags；旧窗口拒绝、重新预览和取消前后五类 ID 完全不变。

### B12 真实可见行为

- GM 先在可见 Painter 界面打开清理预览。旧窗口显示 `4` 个 Battlefield Painter 文档：`Bundles: 1; Tiles: 1; Regions: 1; Lights: 1; Sounds: 1; Walls: 0`。
- 对话框保持打开时，GM 页面通过公开 Scene Document API 新增 owned Tile。点击旧窗口的“清除”后，界面真实显示警告：`场景在确认期间发生变化，请重新预览清除范围。`；旧窗口没有继续清除，owned 和五类外部文档均为零删除。
- 再次打开新的清理预览后，界面显示 `5` 个 Battlefield Painter 文档：`Bundles: 2; Tiles: 2; Regions: 1; Lights: 1; Sounds: 1; Walls: 0`。点击“取消”后，新增 Tile、原有 owned 文档和五类外部文档全部仍在。本批没有执行真正的完整清理。
- 玩家确实以独立 `佐德` 会话跟随进入同一 B12 Square 场景。玩家截图和可见页面检查都没有 Painter 控件或清理按钮；玩家侧没有播放声音。

### B12 Document/API、console 和 server log

GM 端公开 API 同时确认了世界 `cor-cotn`、Foundry `14.364`、dnd5e `5.3.3`、模块 `fvtt-battlefield-painter 0.3.0-alpha.1` 且已启用；`auditScene` 的 owned counts、fingerprint 和实际 Scene embedded Document IDs 一致。玩家端公开页面确认身份为 `佐德`、`isGM=false`、当前场景为 B12 场景；可见页面检查 `Battlefield Painter/Clear module terrain/清理本场景地形/启用画笔/停用画笔` 均不存在，Painter 相关元素数量为 0。

本批 server log 使用明确字节起点 `11867020` 保存 delta，结束字节为 `11869437`，共 `2417` bytes。console/network 原始证据也分别保存了 GM 和玩家两端；无与 B12 stale fingerprint 断言直接相关的新错误。

### B12 证据

证据前缀：`F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-`

- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-fixture-owned-foreign.json`
- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-old-preview-gm.png`
- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-old-preview.json`
- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-modal-owned-mutation.json`
- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-stale-rejection-gm.png`
- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-stale-rejection.json`
- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-fresh-preview-gm.png`
- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-fresh-preview.json`
- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-player-before.png`
- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-player-after.png`
- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-console-network-gm.json`
- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-console-network-player.json`
- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-server-log-delta.txt`
- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-server-log-meta.json`
- `F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B12-211130-final-session-state.json`

本批未发现 B12 相关新缺陷。B01/B04 鼠标预览、B03 音频白噪音、B11 的未完成规模/证据问题没有复制到 B12 缺陷栏，也没有降低 B12 的 PASS；B11 章节和 `BP-CHECK-P2-007` 状态保持原样。

### B12 停止状态

报告更新后只做只读复查：Git 未提交状态只包含进入本批前已有的验收文档/源码改动和本报告更新，没有 commit、merge 或 push；Lab PID 为 `32616`，`127.0.0.1:30001` 仍在监听且 `/join` 可用；世界为 `cor-cotn`，模块 `fvtt-battlefield-painter 0.3.0-alpha.1` 已启用。8080 和 51020 未被触碰。B12 到此停止，未开始 B90，正在等待用户决定下一步。

## B99 清理与 Lab 停止 — 2026-08-16

B90 结果获用户明确确认后，B99 追加完成清理，不重跑或重新评价 B05—B12、R01、R02 或 SQ-011。Battlefield Painter 先通过 Foundry 模块管理界面禁用但保留安装（版本 `0.3.0-alpha.1`）；GM 和独立 `佐德` 玩家刷新后均没有 Painter 控件。

- 通过 Foundry GM 目录 UI 按逐 ID/名称证据清单删除 15 个验收 Scene（B00、B01 两 Scene、B02—B07、B09、B10、B11 两 Scene、B12、B90）。
- 上述 Scene 的 14 个嵌入 Token 随父 Scene 删除；没有单独操作 Token、LevelDB 或世界文件。
- 删除 6 个已确认验收 Actor（B03、B04、B11 player/foreign、B12、B90）；没有删除其他角色；没有 Macro 候选。
- B90 foreign Tile/Region/AmbientLight 仅随已确认的 B90 测试 Scene 一并移除，没有独立选取未知 foreign 文档。删除后目录不再存在本轮候选前缀。

证据：`F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-B99-20260816-delete-result.json`；删除前逐 ID 清单：`BP-E2E-B99-20260816-pre-delete.json`。

按计划执行 `bun run foundry:lab stop server-mirror` 成功（`{"ok":true,"profile":"server-mirror","stopped":true}`）。停止前 PID `32616` 已消失，`127.0.0.1:30001` 已释放；`8080`/`51020` 未被触碰。ZIP、安装模块关键文件 SHA-256 与 B90 相同，`git diff --check` 通过；B99 未修改源码、版本号或 Scene schema，也没有 commit、merge 或 push。

`B99 = PASS`：清理和 Lab 停止均完成；模块保持安装但禁用。该结论不改写 B90 的 `PARTIAL — RELEASE GATE`、B05/B06/B11 的既有 PARTIAL、B08 退役状态或其他历史结论。

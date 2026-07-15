# Foundry v14 Live Runtime Smoke Test

Status: **Partial**

Tested on: 2026-07-11; remediation regression retest: 2026-07-15

The narrow Actor runtime gates pass in both a zero-module core world and a locked minimal modded world. The authenticated copied-world smoke workflow also passes after an explicitly authorized local-only Gamemaster password reset. The overall Task 8 decision remains `Partial` because the production-equivalent complete-module gate still has reproducible runtime errors.

## Locked Environments

| Environment | Components actually used | Result |
| --- | --- | --- |
| Core disposable world | Foundry `14.364`, dnd5e `5.3.3`, zero third-party modules | Pass |
| Minimal modded disposable world | Foundry `14.364`, dnd5e `5.3.3`, MIDI-QOL `14.0.9`, DAE `14.0.12`, libWrapper `1.13.5.1`, socketlib `v1.1.4` | Pass |
| Production-equivalent candidate | 84-module reduced candidate after isolating known errors | Fail |
| Copied production world `cor-cotn` | Local server-mirror profile after authorized local-only Gamemaster password reset | Pass for sampled Actor/save-chat/journal/scene/token workflows |

Times Up and Item Macro were not enabled or required for the accepted minimal modded behavior. The generated `_stats.coreVersion` remains `14.361`, while the importing runtime was Foundry `14.364`; dnd5e remained exactly `5.3.3`.

## Mechanical Verification

- The project CLI regenerated both six-Actor batches on 2026-07-11.
- Each profile reported 6 samples, 6 passing schema checks, 0 failures, and 0 actor-verification warnings.
- Core runtime import produced six Actors; all six sheets opened, the specified Activities executed, and 21 chat messages were created during the test segment.
- The core segment recorded no browser-console or Foundry-server errors and no `midi-qol.OverTime` data.
- The minimal modded runtime imported all six Actors and opened all six sheets.
- Fixes used by the final Bleeding Guardian proof are recorded in commits `47f5477` and `2f1a52e`.

These checks establish that the files parse, import, migrate, and execute. They do not by themselves establish source fidelity or compatibility with the complete production module set.

## Core Runtime Semantic Acceptance

All six core-profile Actors imported into the zero-module disposable world. Their sheets rendered HP, AC, CR, senses, movement, and Activities. Representative interactions included attacks, saves, utilities, reactions, and bonus actions; Death Burst and Pelagic Screech opened their expected dialogs/templates rather than failing silently.

| Sample | Runtime evidence | Result |
| --- | --- | --- |
| Slithering Bloodfin | Sheet opened; Tail Crash, Death Burst, Swallow, and Pelagic Screech interaction paths exercised, including dialogs/templates | Pass |
| Chuul Nullifier | Sheet opened; Pincer and Tentacles interaction paths exercised | Pass |
| Bonebreaker Dorokor | Sheet opened; Multiattack, Longbow, and War Cry exercised | Pass |
| White Tusk Shaman | Sheet opened; Minion: Savage Horde, Multiattack, and Blood-Searing Spear exercised | Pass |
| Bleeding Guardian | Sheet opened; Bleeding Bite remained a normal core Activity with no module overtime behavior | Pass |
| GoddessFantasy Yithian | Sheet opened; Pincer and Mind Swap interaction paths exercised | Pass |

Re-export review preserved the source-relevant HP, AC, CR, senses, movement, and Activity semantics. The exported documents recorded Foundry core version `14.364` and dnd5e system version `5.3.3`, showing that the actual runtime migration occurred without erasing those semantics.

## Minimal Modded Runtime Semantic Acceptance

All six modded-profile Actors imported into the locked minimal runtime. All six sheets opened and representative Activities ran. The decisive source-derived automation check used Bleeding Guardian rather than treating module activation alone as proof.

### Bleeding Guardian proof

- An initial proof produced attack total `21` and initial damage `9`.
- After fixes `47f5477` and `2f1a52e`, the repeated proof produced initial damage `10` and exactly one `midi-qol.OverTime` change/effect.
- At the target's turn start, exactly one `1d6` piercing roll occurred; the roll was `5`, and target HP changed from `40` to `35`.
- The overtime damage therefore came from the source-defined repeated `1d6` clause, not from the initial `1d8 + 3` hit.
- Unrelated imported Actors had zero OverTime changes.
- Times Up and Item Macro were not required.
- With MIDI-QOL disabled, the Actor sheet and Bleeding Bite Attack Activity still opened and produced a chat message, preserving manual usability.

This passes the narrow MIDI-QOL `14.0.9` contract. DAE `14.0.12` coexistence passed, but no DAE-specific behavior is claimed because this corpus does not contain a source-derived DAE-only fixture.

## 2026-07-15 Semantic Remediation Regression Retest

The three Actors whose earlier acceptance artifacts were invalidated by the false AC parser and wrapped-title/condition findings were regenerated through `v14AcceptanceSuite` and re-imported. This section amends the earlier pass evidence; it does not erase the chronology of the defects discovered afterward.

| Profile | Runtime and exercised paths | Result |
| --- | --- | --- |
| Core | Foundry `14.364`, dnd5e `5.3.3`, zero modules; Bonebreaker `Multiattack`/`Longbow`/`War Cry`, Bleeding Guardian `Bleeding Bite`, and White Tusk `Minion: Savage Horde`/`Multiattack`/`Blood-Searing Spear` | Pass |
| Minimal modded | Foundry `14.364`, dnd5e `5.3.3`, MIDI-QOL `14.0.9`, DAE `14.0.12`, libWrapper `1.13.5.1`, socketlib `v1.1.4`; the same seven Activities | Pass |

Semantic observations:

- The three sheets opened in both profiles. Every listed Activity created a chat message.
- Bonebreaker, Bleeding Guardian, and White Tusk AC remained `16`, `13`, and `14` before and after every exercised Activity; no imported Actor-level or item-level effect contained the former false `ack:` AC change.
- White Tusk rendered six separate items. `Spirit-Bonded Body` appeared as its own Bonus Action, while `Minion: Savage Horde` stayed a separate feature; neither carried an invented `Unconscious` effect.
- The modded Bleeding Bite Activity referenced the single `Bleeding` effect, and the imported runtime value remained `flags.midi-qol.OverTime = turn=start,damageRoll=1d6,damageType=piercing,label=Bleeding`.
- No exercised Activity failed. The modded console emitted module/runtime deprecation warnings (`ChatMessage#applyRollMode` and dnd5e senses aliases); the generated files themselves use `system.attributes.senses.ranges`. The copied matrix world also reports pre-existing invalid Calendaria journal-page data while Calendaria is inactive. These observations are recorded as non-blocking compatibility debt, not hidden as a clean-console claim.
- Temporary Actors/folders were deleted, MIDI-QOL was returned to its prior disabled state in the matrix world, both local servers were stopped, and `server-mirror/Config/options.json` was restored to `cor-cotn`. Production was not inspected or modified.

## Production-Equivalent Compatibility Gate

This gate does **not** pass.

- The full 86-module candidate previously exposed errors from `monks-combat-marker` `12.01` and `translate-all` `2.1.0`; disabling those yielded an 84-module reduced candidate with a clean initial load.
- Activating and exercising a scene in that reduced candidate exposed a further `getSceneControlButtons` error involving `simple-quest` `2.3.10` and `monks-common-display` `14.01`.
- Therefore “84-module startup without initial errors” is only a mechanical observation, not semantic acceptance of the complete module set.
- The copied production world `cor-cotn` was authenticated after the user explicitly authorized resetting only the local copy's Gamemaster password. The users database was backed up in the ignored local runtime before the reset; no credential is recorded here.
- The real character sheet `卡勒姆·维雷` opened. Its Strength save produced a public chat card with formula `1d20 - 1` and total `6`.
- The `St. Patrick's Day` Journal rendered its page. The landing Scene loaded with five Tokens and four Walls, and a moved Token was restored to its original coordinates after the check.
- These sampled world workflows pass, but the same run reproduced the complete-module errors described below.

## Acceptance Decision

| Gate | Result | Evidence |
| --- | --- | --- |
| Core profile imports all six Actors | Pass | Six imports in Foundry `14.364` / dnd5e `5.3.3`, zero modules |
| Core profile sheet and Activity interactions | Pass | All sheets opened; specified Activity paths executed; 21 chat messages; Death Burst/Pelagic Screech dialogs/templates observed |
| Modded profile imports all six Actors | Pass | Six imports in locked minimal MIDI-QOL/DAE runtime |
| MIDI-QOL bleeding behavior | Pass | One effect, one `1d6` piercing turn-start roll, HP `40 -> 35`; initial hit remained separate |
| No unrelated module automation leakage | Pass | Unrelated Actors had zero OverTime changes |
| Re-export preserves source semantics | Pass | HP, AC, CR, senses, movement, and Activity semantics preserved after runtime migration |
| No blocking errors in accepted narrow segments | Pass | No browser/server errors in the core segment; minimal modded proof completed |
| Full production-equivalent module set | Fail | Additional scene-control error after earlier module isolations |
| Copied production-world workflow | Pass | Authenticated local copy; real character sheet, `1d20 - 1 = 6` save/chat, journal, landing Scene, and Token restoration exercised |
| 2026-07-15 contaminated-Actor regression retest | Pass | Three affected Actors, two profiles, six sheets, fourteen Activity executions total, unchanged AC, restored White Tusk item boundary, and preserved Bleeding OverTime binding |

Overall status: **Partial**. Core Actor runtime support, the locked minimal modded Actor contract, and sampled authenticated copied-world workflows pass. Full production-equivalent error-free module coexistence fails and must not be described as passing.

## Remaining Work Outside This Gate

1. Minimize and resolve the `simple-quest` / `monks-common-display` scene-control failure, then repeat complete-set scene and Actor workflows.
2. Add a source-derived DAE-specific behavior fixture before claiming DAE automation support beyond coexistence.
3. Complete standalone Item v14 end-to-end acceptance, a live authenticated GoddessFantasy crawl, and broader real-input corpus coverage as separate gates.

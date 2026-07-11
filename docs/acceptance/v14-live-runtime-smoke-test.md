# Foundry v14 Live Runtime Smoke Test

Status: **Partial**

Tested on: 2026-07-11

The narrow Actor runtime gates pass in both a zero-module core world and a locked minimal modded world. The overall Task 8 decision remains `Partial` because the production-equivalent module/world gate does not pass: the full module candidate has reproducible startup/runtime errors, and the copied production world cannot yet be entered without the Gamemaster password.

## Locked Environments

| Environment | Components actually used | Result |
| --- | --- | --- |
| Core disposable world | Foundry `14.364`, dnd5e `5.3.3`, zero third-party modules | Pass |
| Minimal modded disposable world | Foundry `14.364`, dnd5e `5.3.3`, MIDI-QOL `14.0.9`, DAE `14.0.12`, libWrapper `1.13.5.1`, socketlib `v1.1.4` | Pass |
| Production-equivalent candidate | 84-module reduced candidate after isolating known errors | Fail |
| Copied production world `cor-cotn` | Local server-mirror profile | Blocked at Gamemaster authentication |

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

## Production-Equivalent Compatibility Gate

This gate does **not** pass.

- The full 86-module candidate previously exposed errors from `monks-combat-marker` `12.01` and `translate-all` `2.1.0`; disabling those yielded an 84-module reduced candidate with a clean initial load.
- Activating and exercising a scene in that reduced candidate exposed a further `getSceneControlButtons` error involving `simple-quest` `2.3.10` and `monks-common-display` `14.01`.
- Therefore “84-module startup without initial errors” is only a mechanical observation, not semantic acceptance of the complete module set.
- The copied production world `cor-cotn` reached its Join page, but the blank Gamemaster password was rejected. No password was guessed, extracted, or bypassed, so production-world Actor behavior remains untested.

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
| Copied production-world workflow | Blocked | Gamemaster password required at Join page |

Overall status: **Partial**. Core Actor runtime support and the locked minimal modded Actor contract pass. Full production-equivalent coexistence and real-world acceptance remain unresolved and must not be described as passing.

## Remaining Work Outside This Gate

1. Minimize and resolve the `simple-quest` / `monks-common-display` scene-control failure, then repeat complete-set scene and Actor workflows.
2. Enter the copied world's Gamemaster password through the browser and repeat the Actor checks in `cor-cotn` without changing production.
3. Add a source-derived DAE-specific behavior fixture before claiming DAE automation support beyond coexistence.
4. Complete standalone Item v14 end-to-end acceptance, a live authenticated GoddessFantasy crawl, and broader real-input corpus coverage as separate gates.

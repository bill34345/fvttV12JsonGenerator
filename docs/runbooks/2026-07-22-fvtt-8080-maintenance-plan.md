# FVTT 8080 Production Maintenance Plan

Date: 2026-07-22
Target: `http://49.232.12.153:8080` only
World: `cor-cotn` / 溟渊的呼唤
Confirmed data path: `E:\Bill\fvtt_v13\data`
Confirmed process at inventory time: Node PID 5560, port 8080
Confirmed runtime split: v14.364 code under `E:\Bill\v14`; production data remains under `E:\Bill\fvtt_v13\data`

## Safety boundaries

- Do not inspect or modify the separate FVTT instance on port 51020 beyond the prior authorized read-only audit.
- Do not copy Filepicker Plus or other paid modules from the other instance. A separately licensed package is required.
- Do not write credentials into this file, shell history artifacts, reports, or repository configuration.
- Do not edit live LevelDB files. Stop the 8080 instance before taking a filesystem backup of the active world database.
- Preserve module directories when disabling modules so rollback remains possible.

## Authorized work

1. Capture the 8080 process, data-path, world, module, setting, and connected-user inventory.
2. Confirm no active players before any maintenance restart.
3. Stop only the 8080 Node process, back up the active world and relevant configuration, then restart v14 from `E:\Bill\v14` while retaining the special data path `E:\Bill\fvtt_v13\data`.
4. Disable Polyglot and Swipe VTT in world `cor-cotn`; retain `socketlib` and all other required libraries.
5. Install the official open-source Aura Effects release, enable it, and verify clean initialization and its exposed API without changing campaign Actors.
6. Identify the exact setting controlling NPC targetability and change only Secret/Unknown NPC defaults or tokens that must be player-targetable to Neutral. Do not blanket-convert intentional Friendly/Hostile dispositions without evidence.
7. Verify the GM/world A/V configuration. If a client-scoped setting remains, apply a documented one-time player-side disable method and verify it with a non-GM account.
8. Apply the low-load Dice So Nice world configuration so it covers GM and non-GM clients; preserve a before snapshot of all changed setting keys.
9. Reload and verify with GM plus non-GM: targetability, hidden NPC names, disabled A/V, dice cleanup/performance, module dependencies, and console initialization.
10. Produce a change report with backup location, exact before/after values, validation evidence, rollback steps, and deferred items.

## Deferred or excluded

- Filepicker Plus installation: blocked until the user has a separately licensed ZIP or manifest.
- Media Optimizer: not authorized for installation in this maintenance batch.
- Hide NPC Names: keep enabled; no configuration audit required.
- Calendaria journal repair, Babele cleanup, and broad AA/Sequencer remediation: observe for new errors only.

## Completion gate

Mechanical completion requires backups, exact before/after setting and module evidence, successful 8080 restart, and no new initialization errors. Semantic acceptance additionally requires a non-GM player to target an intended NPC, continue seeing the hidden replacement name, avoid A/V peer setup, and complete repeated Dice So Nice rolls without persistent dice accumulation under the configured profile.

## Result status

Completed on 2026-07-22. Detailed evidence and rollback notes are in `2026-07-22-fvtt-8080-maintenance-report.md`.

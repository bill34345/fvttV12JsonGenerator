# Foundry v14 Production Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce the locally accepted Foundry v14 optimizations on the production server while preserving the production world, deploying Swipe 2.3.0 and the validated Monk's Bloodsplats lifecycle patch, and proving real browser behavior after each change group.

**Architecture:** Treat `E:\Bill\fvtt_v13\data` as the production User Data root even though the active Foundry program is v14. Perform settings and module-state changes through the Foundry web UI wherever possible. Use SSH only for read-only inventory, backups, two controlled module-directory deployments, service/process verification, and rollback.

**Tech Stack:** Windows Server, OpenSSH, PowerShell, Foundry VTT 14.364, dnd5e 5.3.3, Chrome control, Foundry Admin/GM UI.

## Global Constraints

- Production SSH alias: `fvtt-production`; remote identity is `172_21_16_11\Administrator`.
- Active production command line observed on 2026-07-12: `code/main.js --port=8080 --dataPath=E:\Bill\fvtt_v13\data`.
- Production User Data root: `E:\Bill\fvtt_v13\data`; module root: `E:\Bill\fvtt_v13\data\Data\modules`.
- Foundry v14 program root is `E:\FVTT V14`. The active Node process was launched from an interactive `cmd.exe` and uses the relative argument `code/main.js`; capture the exact CMD launch command before any restart and reproduce it from `E:\FVTT V14`.
- Do not read or copy `password.txt`, `setup Code.txt`, license material, private keys, or unrelated server data.
- Do not edit live LevelDB files. Prefer Foundry UI and built-in backup facilities for world changes.
- One change group at a time, followed by reload and semantic browser acceptance.
- Final stability acceptance is a 15-20 minute human-paced high-frequency session, not a 50-minute soak. High frequency means reduced idle time and broad operation coverage, not machine-speed repeated clicks or animation flooding.
- Swipe and Item Piles remain enabled by user decision. Their shared `_onClickLeft2` libWrapper warning is a monitored coexistence risk, not a reason to disable either module without reproduced failure.
- Never replace a production module without a timestamped sibling backup and recorded SHA-256 hashes.
- A command succeeding or a setting being present is only mechanical verification; completion requires the sampled Foundry workflows to behave correctly in the browser.

---

### Task 1: Freeze the Production Baseline and Resolve the v14 Launcher

**Files:**
- Read only: remote process metadata and the startup task/script that launches port 8080
- Create locally: `.local/foundry-v14/evidence/production/<timestamp>/baseline.json`
- Update after execution: `docs/acceptance/foundry-v14-local-optimization-log.zh-CN.md`

**Interfaces:**
- Consumes: SSH alias `fvtt-production` and the running production process.
- Produces: exact program working directory, restart command, Foundry/dnd5e versions, active world, active module IDs/versions, current settings snapshot, and pre-change error baseline.

- [ ] **Step 1: Record the port-8080 process without changing it**

  Query `Win32_Process` for PID, executable, command line, parent PID, creation time, and owning session. The observed parent is interactive `cmd.exe` PID 4468 under Explorer; capture or reconstruct the exact CMD launch command rooted at `E:\FVTT V14`, and record the restart procedure without stopping the process.

- [ ] **Step 2: Record the Foundry runtime baseline from the web UI**

  In the already opened production page, verify Foundry `14.364`, dnd5e `5.3.3`, the active world, language, and currently enabled modules. Export or transcribe the enabled-module list before changing it.

- [ ] **Step 3: Capture the current operational baseline**

  Enter one lightweight scene and one heavy scene, open a representative Actor, produce one normal attack/chat-card workflow, and record new browser-console and server-log errors. Do not alter Actor, Scene, Item, or Token documents beyond ordinary temporary UI interaction.

- [ ] **Step 4: Gate continuation**

  Continue only if the runtime/version and restart path are known and the world is usable. If they differ from the expected v14.364/dnd5e 5.3.3 baseline, revise later steps before changing production.

### Task 2: Create Production Backups and a Rollback Ledger

**Files:**
- Create remotely: `E:\Bill\fvtt_v13\data\Backups\codex-v14-production-<timestamp>\`
- Create locally: `.local/foundry-v14/evidence/production/<timestamp>/rollback-ledger.json`

**Interfaces:**
- Consumes: Task 1 baseline and exact active-world ID.
- Produces: verified world backup, options/settings snapshot, module-state snapshot, and explicit rollback paths for both deployed modules.

- [ ] **Step 1: Create a Foundry built-in backup of the active world**

  Use the Foundry Setup UI backup action. Confirm the backup appears in the UI, has a non-zero size, and is associated with the correct world ID.

- [ ] **Step 2: Copy non-database configuration snapshots through SSH**

  Copy `Config` and relevant module/world configuration metadata into the timestamped backup folder without copying live LevelDB files while the world is running. Record source, destination, size, modification time, and SHA-256 where applicable.

- [ ] **Step 3: Back up existing module directories before replacement**

  Record that production currently has no `Data\modules\swipe-vtt`. Copy the existing `Data\modules\monks-bloodsplats` to `monks-bloodsplats.before-codex-<timestamp>` and hash its `monks-bloodsplats.js` before deployment.

- [ ] **Step 4: Prove rollback readability**

  List the backup contents, verify non-zero sizes, and confirm the copied Bloodsplats module contains `module.json` and `monks-bloodsplats.js`. Do not call the backup complete solely because copy commands exited successfully.

### Task 3: Apply Low-Risk Module and Performance Settings Through the Web UI

**Files:**
- Modify through Foundry UI: world module configuration and client/world settings
- Update after execution: `docs/acceptance/foundry-v14-local-optimization-log.zh-CN.md`

**Interfaces:**
- Consumes: Task 1 baseline and Task 2 rollback artifacts.
- Produces: a reload-stable production configuration matching locally accepted settings where the production use case agrees.

- [ ] **Step 1: Disable locally rejected or unnecessary modules as one reviewable group**

  In Manage Modules, disable `simple-quest`, `5e-chm-online`, `chat-media`, `scene-packer`, `monks-combat-marker`, `monks-common-display`, `tokenmagic`, and `translate-all` if currently enabled. The user confirmed `monks-common-display` is not required and may already be disabled. Keep `vision-5e` enabled unless production evidence changes the decision.

- [ ] **Step 2: Reload and accept the module-state change semantically**

  Confirm the world loads, Canvas becomes ready, Scene Controls render, the core combat-turn marker works, one lightweight and one heavy scene open, and no new startup error appears. If any required production feature is missing, restore only the responsible module and record the exception.

- [ ] **Step 3: Apply the accepted MIDI-QOL settings**

  Set MIDI-QOL Debug to `None`, enable `Save to Chat Card`, and enable `Use Weak References for Workflows`. Reload and re-open the settings to prove persistence.

- [ ] **Step 4: Test one real attack workflow**

  Select a normal Actor Token and a target, initiate an attack through the standard UI, produce the d20 result and damage flow, and verify the chat card identifies the correct attacker and target. A created card without the final d20 does not pass.

- [ ] **Step 5: Preserve Automated Animations and establish a human-paced test cadence**

  Keep Automated Animations enabled. Do not copy the local diagnostic setting that disabled animations. During high-frequency acceptance, trigger attacks and animations only at a plausible human cadence: wait for each visible animation/workflow to settle before the next attack, interleave navigation, sheets, chat, targeting, Token movement, and scene changes, and avoid repeated attack-button loops intended only to maximize animation count.

### Task 4: Evaluate and Retire Levels Safely

**Files:**
- Modify through Foundry UI/API exposed by Levels: active world's Scene/Compendium migration state
- Modify through Foundry UI: module activation state for `levels`

**Interfaces:**
- Consumes: verified built-in world backup from Task 2.
- Produces: migration evidence and either a safely disabled Levels module or a documented production exception.

- [ ] **Step 1: Inventory actual Levels dependence before migration**

  Count Scenes with non-empty legacy level definitions, Wall Height data, 3D Canvas indicators, elevators/stairs, or gameplay-critical height behavior. Do not treat the mere presence of empty `flags.levels` as active dependence.

- [ ] **Step 2: Stop for user review if real multilayer content exists**

  If any non-empty production dependency is found, list the affected Scene names and do not migrate or disable Levels until the user approves scene-by-scene handling.

- [ ] **Step 3: Run the official Levels 7.0.3 migration when eligible**

  Use the module's official Scene and Compendium migration functions from the Foundry runtime. Record counts and exceptions. A returned count of zero is acceptable only after Step 1 proves no eligible legacy layer definitions exist.

- [ ] **Step 4: Disable Levels and inspect representative scenes**

  Disable `levels`, reload, then inspect `B4`, `叛神殿 betrayers' rise`, `Poster Map`, plus any production scene identified in Step 1. Check walls, tiles, lighting, height transitions, elevators/stairs, Token movement, and Canvas errors.

### Task 5: Deploy Swipe 2.3.0 to Production User Data

**Files:**
- Source: `.local/foundry-v14/data/server-mirror/Data/modules/swipe-vtt/`
- Create remotely: `E:\Bill\fvtt_v13\data\Data\modules\swipe-vtt\`

**Interfaces:**
- Consumes: locally accepted Swipe 2.3.0 directory and active `socketlib` 1.1.4 or newer.
- Produces: production-installed `swipe-vtt` package with an exact local/remote file inventory and hashes.

- [ ] **Step 1: Preflight the package**

  Verify local `module.json` reports ID `swipe-vtt`, version `2.3.0`, Foundry minimum `14`, verified `14.363`, and socketlib dependency. Create a transfer archive that contains one `swipe-vtt` root directory and excludes logs, caches, test artifacts, and credentials; record its SHA-256.

- [ ] **Step 2: Enter a short maintenance window for the file copy**

  Return the production instance to Setup or stop the exact port-8080 process using the Task 1 restart procedure. Confirm no process is writing to the User Data path before replacing module files.

- [ ] **Step 3: Upload and atomically install Swipe**

  Transfer the archive through SSH/SCP to a timestamped staging directory, verify the remote archive hash equals the local hash, extract to staging, validate `module.json`, and rename the complete staged directory to `Data\modules\swipe-vtt`. Do not merge-copy an incomplete directory into the live module root.

- [ ] **Step 4: Restart and enable through the UI**

  Restart with the exact v14 launcher from Task 1, confirm port 8080 and server logs are healthy, then enable Swipe and socketlib in Manage Modules. Perform Patreon authorization in the browser only; never transfer Patreon credentials through SSH or store them in evidence.

- [ ] **Step 5: Perform tablet/touch semantic acceptance**

  With touch emulation initialized before page startup, verify mobile controls, Patreon-unlocked Combat, real Token drag, character drawer, Combat navigation, a complete attack d20 and damage flow, and chat targeting. Also double-tap a normal Actor Token, an Item Pile, and a merchant Token to exercise the Swipe/Item Piles `_onClickLeft2` coexistence risk.

### Task 6: Deploy the Validated Monk's Bloodsplats 14.01 Lifecycle Patch

**Files:**
- Source archive: `.local/foundry-v14/evidence/patched-modules/monks-bloodsplats-14.01-codex-v14-lifecycle.zip`
- Existing remote module: `E:\Bill\fvtt_v13\data\Data\modules\monks-bloodsplats\`
- Rollback source: `E:\Bill\fvtt_v13\data\Data\modules\monks-bloodsplats.before-codex-<timestamp>\`

**Interfaces:**
- Consumes: local archive SHA-256 `A4284D177C8D3DBBDF9726A8B68287779D0E8617EF8C326EC9351C60E3D356FF` and patched JS SHA-256 `8C6F677EC96A464A213797419B9CEBDEFFEB913C6EB2E34A7B5703428A78E491`.
- Produces: atomically deployed Bloodsplats 14.01 patch with exact rollback and behavioral evidence.

- [ ] **Step 1: Reconfirm the production source version and backup**

  Before maintenance, confirm the remote module is still version 14.01, hash the current `monks-bloodsplats.js`, and verify the Task 2 backup remains readable. If the version changed, stop and rebuild/retest the patch against that exact source instead of applying the 14.01 archive.

- [ ] **Step 2: Transfer and validate in staging**

  Upload the ZIP to a timestamped staging directory, verify remote ZIP SHA-256 equals `A4284D...356FF`, extract it, confirm the patched JS hash equals `8C6F...E491`, and verify the package contains `module.json`, the patched JS, assets, and `LOCAL-PATCH.zh-CN.md` but no `.bak` or credential file.

- [ ] **Step 3: Replace the module atomically during maintenance**

  Stop or return the exact production instance to Setup, rename the current module directory to its timestamped backup if not already done, and rename the validated staged directory to `monks-bloodsplats`. Do not patch the live JS in place.

- [ ] **Step 4: Restart and prove the lifecycle fix**

  Enter the world, repeatedly switch between a lightweight and heavy Scene while defeated/dead Tokens display blood splats. Confirm blood splats still render, Tokens remain usable, and the prior stale/destroyed Token promise exception does not recur. Record server logs and browser console for the sampled sequence.

- [ ] **Step 5: Roll back on regression**

  If Bloodsplats behavior disappears or a new error is introduced, stop production, rename the patched directory out of service, restore the timestamped original directory, restart, and rerun the same sample before proceeding.

### Task 7: Final Production Acceptance and Documentation

**Files:**
- Modify: `docs/acceptance/foundry-v14-local-optimization-log.zh-CN.md`
- Modify: `docs/acceptance/foundry-v14-module-compatibility.md`
- Keep raw evidence local only: `.local/foundry-v14/evidence/production/<timestamp>/`

**Interfaces:**
- Consumes: evidence and rollback ledger from Tasks 1-6.
- Produces: an honest production acceptance report separating mechanical proof, semantic passes, partials, failures, and remaining risk.

- [ ] **Step 1: Run the final representative workflow**

  Verify world login, lightweight/heavy Scene changes, Actor sheet, Token movement, targeting, complete attack and damage, chat card, journal, core combat marker, Swipe touch workflow, Item Piles Actor/pile/merchant interactions, and Bloodsplats on defeated Tokens.

- [ ] **Step 2: Run a 15-20 minute human-paced high-frequency acceptance session**

  Run for 15-20 minutes with short but realistic pauses between actions. Cover repeated light/heavy Scene changes, Actor and Item sheet open/close, Token selection and movement, targeting, chat/drawer use, journal access, combatant turn changes, and several complete attack/damage workflows. Allow each Automated Animations effect to visibly settle before initiating another animation-producing action. Log individual sampling gaps and continue when the visible browser and server remain healthy; do not equate a browser-control timeout with a server failure.

- [ ] **Step 3: Compare errors against the baseline**

  Classify each new browser/server error by module and action. The production change passes only if no new severity-increasing error or required-feature regression appears; known missing assets remain separately documented rather than attributed without evidence.

- [ ] **Step 4: Update tracked acceptance documents without secrets**

  Record versions, settings, hashes, sampled operations, pass/partial/fail results, rollbacks, and unresolved risks. Do not record IP credentials, Patreon data, passwords, license codes, world database contents, or raw user/player data.

- [ ] **Step 5: Declare the acceptance level**

  Report mechanical verification separately from semantic acceptance. Do not call the production optimization complete if the world starts but real attack, scene, Swipe, Item Piles, or Bloodsplats behavior fails.

## Self-Review

- Spec coverage: production v14 program plus v13 User Data split, web-first settings, Swipe upload, Bloodsplats patch upload, backups, rollback, and real UI acceptance are each assigned to a task.
- Placeholder scan: no TBD/TODO steps remain; conditional stops identify the evidence and decision required.
- Path consistency: every production module deployment targets `E:\Bill\fvtt_v13\data\Data\modules`; Foundry program operations are rooted at the user-confirmed `E:\FVTT V14`, with the exact interactive CMD launch command captured before restart.
- Safety: no task edits live LevelDB, reads credential files, or replaces a module without a verified backup and atomic staging.

# Project-Local Foundry v14 Mirror Design

**Date**: 2026-07-10
**Status**: Approved in conversation; awaiting written-spec review
**Version**: 1.0

## 1. Goal

Create a project-local Foundry VTT laboratory that can:

- run the exact production core line: Foundry VTT `14.364`, Node.js `24.17.0`, and dnd5e `5.3.3`;
- validate generated Actor JSON in a clean core-only world;
- reproduce the production world's currently enabled module combination in an isolated mirror world;
- assess module compatibility and conflicts with runtime evidence rather than manifest claims alone;
- avoid transferring every historical module folder from the server when an exact upstream package can be downloaded locally.

The production server remains the final smoke-test environment. The local mirror is the primary repeatable test environment.

## 2. Confirmed Production Evidence

The design is based on live read-only inspection performed on 2026-07-10:

| Component | Confirmed value |
| --- | --- |
| Public URL | `http://49.232.12.153:8080/game` |
| Core runtime | Foundry VTT `14.364` Stable |
| Game system | dnd5e `5.3.3` |
| Server OS | Windows Server 2022 Datacenter `10.0.20348` |
| Server Node.js | `24.17.0` |
| User Data path | `E:\Bill\fvtt_v13\data` |
| Module folders on disk | `249` |
| Modules eligible/visible in the active world | `191` |
| Modules enabled in the active world | `88` |
| SSH target | `Administrator@49.232.12.153` |

The `fvtt_v13` directory name is historical. It does not describe the current core runtime version.

The enabled set includes the project's locked automation versions MIDI-QOL `14.0.9` and DAE `14.0.12`, plus Item Macro `3.0.1`, Tidy 5e Sheets `13.5.0`, Token Action HUD, Automated Animations, DFreds modules, Monk's modules, Levels, Sequencer, JB2A Patreon, Token Magic FX, localization modules, and commercial/content packages.

## 3. Approved Approach

Use **inventory reconstruction plus differential transfer**.

Do not copy all 249 server module folders as the default path. Reconstruct the exact 88-module active set using four package classes:

1. `upstream-exact`: the installed manifest has a release-specific download URL for the exact version; download it directly to the local machine.
2. `account-protected`: official D&D, Patreon, premium, or otherwise protected content; install through the user's authorized Foundry/package account or the package's authorized installer.
3. `server-only`: private, locally modified, withdrawn, or otherwise unavailable packages; archive and transfer only these package directories over SSH.
4. `manual-review`: malformed manifests, ambiguous version metadata, or packages whose local folder does not match the runtime-visible package; preserve evidence and resolve individually.

After installation, compare IDs, versions, dependencies, and selected file hashes between the production inventory and the local mirror.

## 4. Project-Local Layout

All runtime-heavy or sensitive state lives under the repository's already-ignored `.local/` directory:

```text
I:\OpenCode\fvttV12JsonGenerator\
+-- .local\foundry-v14\
|   +-- app\14.364\
|   +-- runtime\node-v24.17.0-win-x64\
|   +-- data\core-test\
|   +-- data\server-mirror\
|   +-- cache\packages\
|   +-- inventory\
|   `-- evidence\
+-- scripts\foundry-lab\
`-- docs\acceptance\
```

Directory responsibilities:

| Path | Responsibility | Git status |
| --- | --- | --- |
| `.local/foundry-v14/app/14.364` | Extracted Foundry Node application | ignored |
| `.local/foundry-v14/runtime/node-v24.17.0-win-x64` | Version-isolated Node runtime | ignored |
| `.local/foundry-v14/data/core-test` | Clean core-only User Data | ignored |
| `.local/foundry-v14/data/server-mirror` | 88-module production mirror User Data | ignored |
| `.local/foundry-v14/cache/packages` | Downloaded exact package archives | ignored |
| `.local/foundry-v14/inventory` | Full inventories, URLs, hashes, and package classification | ignored |
| `.local/foundry-v14/evidence` | Raw local logs, screenshots, exports, and diagnostic artifacts | ignored |
| `scripts/foundry-lab` | Reusable inventory, install, launch, and comparison automation | tracked |
| `docs/acceptance` | Sanitized acceptance results and conflict findings | tracked |

Secrets, private keys, passwords, Foundry license state, authenticated URLs, and premium package archives must never be written to tracked paths.

## 5. Environment Isolation

### 5.1 Application Runtime

- Extract `D:\Download\FoundryVTT-Node-14.364.zip` into `.local/foundry-v14/app/14.364`.
- Use an isolated Node.js `24.17.0` runtime to match production.
- Do not replace the machine's global Node.js `25.4.0` installation.
- Launch Foundry with an explicit absolute `--dataPath` and a dedicated localhost port.
- Bind the local laboratory to loopback unless the user explicitly requests LAN exposure.

### 5.2 Core Test User Data

The `core-test` data path contains:

- dnd5e `5.3.3`;
- one disposable dnd5e world;
- no third-party automation modules;
- only the minimum localization needed for readable inspection, if localization does not alter tested mechanics.

This world proves whether project-generated v14 JSON works under Foundry/dnd5e itself.

### 5.3 Server Mirror User Data

The `server-mirror` data path contains:

- dnd5e `5.3.3`;
- the exact 88 active package IDs and versions, subject to authorized availability;
- required dependencies;
- a disposable mirror world;
- production-equivalent module settings when they can be copied safely and lawfully.

Do not use the production world database as the first acceptance world. Establish a clean 88-module startup baseline before importing a backed-up or selectively cloned production world configuration.

## 6. Inventory and Synchronization Flow

1. Read every server `Data/modules/<id>/module.json` using explicit UTF-8 decoding.
2. Export a disk inventory containing package ID, title, version, compatibility, manifest URL, download URL, dependency relationships, protected state, persistent-storage state, and selected file hashes.
3. Export the active 88-module set from the live world UI/runtime without changing module settings.
4. Reconcile disk folders against runtime-visible packages and classify each active module into one of the four package classes.
5. Download `upstream-exact` packages directly on the local machine.
6. Install `account-protected` packages through authorized channels.
7. Transfer only `server-only` packages and necessary persistent storage over SSH.
8. Hold `manual-review` packages out of the mirror until their identity and integrity are resolved.
9. Compare the completed local inventory with the production active inventory.
10. Enable the mirror modules in dependency-safe groups, then enable the full set only after group checks pass.

No live world database is copied with Dropbox, OneDrive, or another continuous sync service. Any world/settings transfer must use a Foundry backup or a copy taken while the relevant world data is not being written.

## 7. Compatibility and Conflict Assessment

Compatibility is evaluated at four levels.

### 7.1 Manifest and Dependency Checks

- core compatibility includes Foundry `14.364`;
- dnd5e compatibility includes `5.3.3` where declared;
- every required dependency is present at a compatible version;
- declared conflicts are recorded;
- protected or unavailable packages are not silently substituted with different versions.

Version labels such as `12.01`, `13.06`, or `13.5.0` are prioritization signals, not proof of incompatibility.

### 7.2 Startup and Console Checks

- no blocking module initialization error;
- no missing script, stylesheet, template, or dependency;
- no repeated Hook exception;
- no blocking browser-console or Foundry server-log error;
- the world reloads successfully after the intended module set is enabled.

### 7.3 Functional Group Checks

Test module families separately before the complete set:

- actor sheets and dnd5e UI;
- MIDI-QOL, DAE, Item Macro, conditions, and effects;
- Automated Animations, Sequencer, JB2A, Token Magic FX, and sound effects;
- Levels, walls, tiles, drawings, scene controls, and token movement;
- Token Action HUD, DFreds, Monk's utilities, calendars, journals, and search/UI tools;
- Chinese localization, Babele, compendium translation, and content packages.

### 7.4 Semantic Runtime Checks

The mirror is not accepted merely because Foundry starts. Confirm real behavior:

- Actor sheets open and retain correct values;
- attacks, saves, damage, recharge, reactions, and bonus actions execute;
- MIDI-QOL and DAE effects fire exactly once at the correct workflow phase;
- animations and chat cards appear without breaking the roll workflow;
- unrelated Actors do not gain automation flags or effects;
- disabling an optional automation module leaves the Actor usable manually;
- representative existing server content remains usable in the mirror.

When a conflict appears, reproduce it with the smallest module subset and record the exact pair or interaction. Do not call two modules conflicting merely because one has an old-looking version number.

## 8. Generated Actor Acceptance

After the environment baseline passes:

1. regenerate the v14 core and `modded-v14` acceptance Actors through the project workflow;
2. import the core outputs into `core-test`;
3. import the `modded-v14` outputs into `server-mirror`;
4. follow `docs/generated-actor-verification.md` and `docs/acceptance/v14-live-runtime-smoke-test.md`;
5. export imported Actors and compare source-relevant fields after Foundry/dnd5e preparation;
6. record browser-console, server-log, screenshot, and re-export evidence for every failure.

Final Actor JSON must never be hand-repaired to make runtime acceptance pass.

## 9. Error Handling and Safety

- Use SSH `BatchMode`, the existing local ED25519 identity, and strict host-key verification.
- Remote discovery is read-only until a later step explicitly authorizes a backup or package transfer.
- Do not read or copy server password files.
- Do not run `Update All` on production or local mirror packages during parity setup.
- Do not stop the production server merely to collect package manifests.
- Before copying world settings or persistent storage, create a verified backup and prevent concurrent writes to the copied data.
- If two attempts in a row fail, stop and report the root cause, evidence, and one narrow next fix.
- Preserve premium-content licensing and use the user's authorized installation channels.

## 10. Acceptance Criteria

### Mechanical validation

- local Foundry reports `14.364`;
- local Node reports `24.17.0` for the Foundry process;
- local dnd5e reports `5.3.3`;
- `core-test` and `server-mirror` use separate absolute data paths;
- the mirror inventory accounts for all 88 active production module IDs;
- exact versions match, or every authorized exception is documented;
- no required dependency is missing;
- no runtime-heavy or sensitive artifact is tracked by Git.

### Semantic validation

- the clean world imports and operates representative project-generated Actors;
- the 88-module mirror loads and completes its functional-group smoke tests;
- key MIDI-QOL/DAE/Item Macro behavior matches the source-defined expectations;
- module conflicts are reported with reproducible evidence and a minimal responsible set;
- remaining unavailable premium/private packages and resulting coverage gaps are explicit;
- the production URL is used only for final smoke comparison after local acceptance.

Only when both levels pass may the local mirror be called equivalent for the tested workflows.

## 11. Deliverables

- tracked scripts under `scripts/foundry-lab/`;
- ignored local runtime under `.local/foundry-v14/`;
- a sanitized active-module inventory summary;
- a package classification and parity report;
- a module compatibility/conflict report;
- completed core and modded live-runtime acceptance evidence;
- exact commands for repeatable local launch and inventory refresh.

## 12. Out of Scope

- updating or removing modules on the production server;
- copying all 249 historical module folders without classification;
- redistributing premium or protected packages;
- exposing the local test server to the public Internet;
- treating coexistence alone as proof that every module feature works;
- redesigning the Actor generator before runtime evidence identifies a project defect.

# FVTT 8080 Production Maintenance Report

Date: 2026-07-22
Target: `http://49.232.12.153:8080` only
World: `cor-cotn` / 溟渊的呼唤
Runtime: Foundry VTT 14.364, dnd5e 5.3.3
Code root: `E:\Bill\v14`
Special data path: `E:\Bill\fvtt_v13\data`

## Outcome

- Aura Effects 2.1.1 is installed from the author's official release and enabled.
- Polyglot 2.9.2 and Swipe VTT 2.3.0 are disabled but retained on disk.
- Socketlib and other library modules were not disabled.
- All 85 placed non-player Tokens that had Secret disposition were changed to Neutral. Intentional Friendly and Hostile Tokens were left unchanged.
- Hide NPC Names remains enabled. A player still sees a converted NPC as `未知生物`.
- Dice So Nice world settings `persistentDice` and `allowInteractivity` changed from `true` to `false`.
- Foundry A/V was already globally disabled through `core.rtcWorldSettings.mode = 0`; no player-side override or code mutation was needed.
- Foundry CHN was synchronized from the user's authorized shared server copy: 14.362 to 14.364, remaining enabled.
- Filepicker Plus was synchronized from the user's authorized jointly purchased shared server copy: 4.0 to 6.0.1, remaining installed but disabled.
- Port 51020 was not modified.

## Backup and recovery artifacts

- Consistent stopped-server backup: `E:\Bill\fvtt_v13\backups\codex-20260722-091339-8080-maintenance`
- Measured backup size after copying: 1,826,921,407 bytes.
- Backup contains the pre-change `cor-cotn` world and `Config\options.json`.
- The exact stale lock directory encountered during restart was moved, not deleted, into the backup as `stale-options-json-lock-20260722-092203`.
- Persistent v14 launcher: `E:\Bill\v14\fvtt-8080-start-v14.cmd`
- Local audited launcher source: `docs/runbooks/scripts/fvtt-8080-start-v14.cmd`
- Pre-upgrade module backup: `E:\Bill\fvtt_v13\backups\codex-20260722-100645-module-upgrade`
- The module backup contains `foundry_chn-14.362` and `filepicker-plus-4.0`; neither old module directory was deleted.
- Local audited synchronization script: `docs/runbooks/scripts/fvtt-8080-sync-friend-modules.ps1`

## Aura Effects provenance

- Package: `auraeffects` 2.1.1
- Official package page: `https://foundryvtt.com/packages/auraeffects`
- Official manifest: `https://github.com/roth-michael/Aura-Effects/releases/download/2.1.1/module.json`
- Declared compatibility: Foundry 14 only; verified through 14.362.
- Downloaded ZIP SHA-256: `65FACE2E24BE2610C62E80B88587FF1E3245A56D3D686983AC3E5420F7983D8D`
- Runtime verification: module active, version 2.1.1, API exposed `migrateActiveAuras`, and no Aura initialization error in GM or player console.
- No campaign Actor was edited solely to create a disposable aura test.

## Foundry CHN and Filepicker Plus synchronization

The source instance at port 51020 was treated as read-only. The user confirmed that Filepicker Plus is a joint purchase and explicitly authorized a server-local copy into the 8080 instance. The copy source was `E:\CARROT\FVTTV14\data\Data\modules`; the target was the special 8080 data path at `E:\Bill\fvtt_v13\data\Data\modules`.

| Module | Before | After | Runtime state | Exact-copy verification |
|---|---:|---:|---|---|
| `foundry_chn` | 14.362 | 14.364 | active | 2 files, 204,539 bytes, every SHA-256 equal to source |
| `filepicker-plus` | 4.0 | 6.0.1 | inactive | 19 files, 134,747 bytes, every SHA-256 equal to source |

Foundry CHN has an important content-level detail: the 14.364 source copy's `cn.json` has SHA-256 `DE869685BE218AAB29B6994C4CAECA4C8C15C5FB2E33F5E3BCECA9F41FD6A798`, exactly the same as the former 14.362 target copy. This synchronization therefore updated the manifest version and Foundry 14 compatibility declaration and removed three `__MACOSX` junk files; it did not introduce different translation strings. The source manifest itself still links its changelog and download fields to release 14.362, despite declaring version 14.364.

The world was cleanly unloaded through Foundry's GM shutdown flow before stopping the exact port-8080 v14 process. Both source modules were copied into a staging directory and hash-checked before the live module directories were moved into the backup and replaced. Port 51020 was never stopped or written to.

## Calendaria custom-page recovery

Calendaria 1.2.0 was disabled while the world still contained Journal pages whose registered type is `calendaria.calendarnote`. With the module inactive, Foundry v14 could load each parent Journal but could not construct its custom child page, producing errors such as:

`type: "calendaria.calendarnote" is not a valid type for the JournalEntryPage Document class`

This was a document-type registration failure, not a corrupt Journal and not a 3D-rendering failure. Before the repair, 39 Journals carrying `flags.calendaria.isCalendarNote = true` all loaded with zero pages. The reported `Christmas Day` Journal (`yLeapxVqGG0fh8xk`) was one of them.

Calendaria declares `3ds-atlas` as a required module. The dependency name means **3 Death Saves: Application Toolkit, Libraries, APIs & Services**, not 3D graphics. It provides the publisher's shared theme, logging, update-notice, and troubleshooting services. Official source and manifest:

- `https://github.com/Sayshal/3DS-ATLAS`
- `https://github.com/Sayshal/3ds-atlas/releases/latest/download/module.json`

The official 3DS:ATLAS 1.0 package declares Foundry minimum 14 and verified 14.364. It was staged and validated before installation:

- Download: `https://github.com/Sayshal/3DS-ATLAS/releases/download/release-1.0/module.zip`
- ZIP SHA-256: `8779B8A647D656AE303DB095686F419BBBC1FEDCC4938F214CA421F5386D99BE`
- Installed tree: 23 files, 1,967,587 bytes
- Installed path: `E:\Bill\fvtt_v13\data\Data\modules\3ds-atlas`
- Consistent stopped-world backup: `E:\Bill\fvtt_v13\backups\codex-20260722-103047-calendaria-enable`
- Backup size: 1,778,910,148 bytes
- Local audited install script: `docs/runbooks/scripts/fvtt-8080-backup-install-calendaria-dependency.ps1`

After installing 3DS:ATLAS and enabling both `3ds-atlas` and `calendaria`, all 39 affected Journals recovered one `calendaria.calendarnote` page each. Total loaded world Journal pages increased from 695 to 734, while the world Journal count stayed 415. `Christmas Day / QSJ0pJL3TiIGGysW` recovered its date, linked-festival metadata, and 107-character body; its sheet rendered visibly with the expected text.

The performance-sensitive Calendaria settings were checked after initialization. Cinematic time skip, automatic weather, intraday weather, scene darkness synchronization, weather/darkness synchronization, ambience synchronization, color-shift synchronization, FXMaster integration, weather sound effects, and HUD weather effects are all disabled. The normal calendar HUD and informational weather/moon labels retain their defaults. Disabling the test player's calendar HUD changed a hot-reload measurement from about 47.4 seconds to about 49.2 seconds, so the HUD was restored and is not the source of the observed delay.

The controlled in-app-browser measurements are useful but not a foreground-player benchmark. In that throttled environment, the test player's first load completed in about 59 seconds and two hot reloads completed in about 47-49 seconds. The server itself vended world data in about 5.6-6.3 seconds. 3DS:ATLAS's main script decoded to about 35 KB and Calendaria's to about 1.20 MB; both resources were delivered in under one second. The world also loads several larger scripts, including Tidy5e Sheet (4.46 MB), Automated Animations (3.62 MB), Plutonium CN (3.35 MB), Item Piles (3.06 MB), MIDI-QOL (1.92 MB), and Dice So Nice (1.91 MB). The delay is therefore recorded as cumulative client initialization risk, not attributed to 3DS:ATLAS or the calendar HUD alone.

## Token disposition changes

The update used Foundry's document API (`Scene.updateEmbeddedDocuments`) while the world was running after a stopped-server backup. It did not edit LevelDB files directly.

| Scene | Secret to Neutral |
|---|---:|
| B2.枯萎林 Withered Grove | 4 |
| B3.沉没骨冢 Sunken Boneyard | 5 |
| B4.破败哨塔 Crumbling Tower | 3 |
| B5.狂蛙人洞穴 Bullywug Cave | 6 |
| B7.残纱断崖 Brokenveil Bluffs | 4 |
| B9.梵卓堡 Fort Venture | 36 |
| Tavern | 10 |
| before prayer site | 5 |
| 乌尔津 Urzin | 5 |
| 二世二世 | 2 |
| 叛神殿 betrayers' rise | 1 |
| 沃登纳的树屋 | 1 |
| 翡翠石窟 Emerald Grotto | 3 |
| **Total** | **85** |

Final non-player Secret Token count across all scenes: 0.

## Before and after settings

| Scope | Key | Before | After |
|---|---|---:|---:|
| world | `core.moduleConfiguration.polyglot` | true | false |
| world | `core.moduleConfiguration.swipe-vtt` | true | false |
| world | `core.moduleConfiguration.auraeffects` | absent | true |
| world | `core.moduleConfiguration.3ds-atlas` | absent | true |
| world | `core.moduleConfiguration.calendaria` | false | true |
| world | `dice-so-nice.persistentDice` | true | false |
| world | `dice-so-nice.allowInteractivity` | true | false |
| world | `core.rtcWorldSettings.mode` | 0 | 0 (unchanged) |

## Prototype Token Overrides follow-up

Follow-up verification found that Foundry's built-in `core.prototypeTokenOverrides` setting was already configured with `npc.disposition = 0` (Neutral). No redundant world-setting write was performed.

- All 747 world Actors of type `npc` resolve their Prototype Token disposition to Neutral.
- All 15 Actors of type `character` remain Friendly, confirming that the override is scoped to NPCs rather than `[All Types]`.
- An unpersisted Token document generated from an NPC Actor resolved to disposition 0.
- The control sample generated from a character Actor remained disposition 1.
- The scene Token total stayed at 2,820 before and after the generation test, confirming that no test Token was placed or saved.

This built-in override covers NPC Prototype Tokens and therefore future Tokens generated by dragging NPC Actors into scenes. Existing placed Tokens are separate documents, which is why the earlier 85-Token migration was still required.

## Validation

### Mechanical verification

- Final runtime reports Foundry 14.364, dnd5e 5.3.3, world `cor-cotn`, and active scene `残纱沼泽Brokenveil Marsh`.
- Final module state: Aura active; Polyglot and Swipe VTT inactive; Dice So Nice, Socketlib, and Hide NPC Names active.
- Foundry CHN reports version 14.364 and active; Filepicker Plus reports version 6.0.1 and inactive.
- The synchronized target trees match the source trees file-for-file by path, byte length, and SHA-256.
- The restarted listener command line uses `E:\Bill\v14\code\main.js`, port 8080, and `E:\Bill\fvtt_v13\data`; the loaded world is `cor-cotn` on Foundry 14.364.
- Browser console and the current server log tail contain no Foundry CHN or Filepicker Plus initialization error and no `error`, `exception`, or `failed` entry attributable to this synchronization.
- Calendaria 1.2.0 and 3DS:ATLAS 1.0 are active. All 39 flagged calendar Journals have a loaded page and `Christmas Day` renders successfully.
- GM and player consoles contain no Calendaria, 3DS:ATLAS, `calendarnote`, or Journal-page validation error; the current server stderr tail is empty.
- Final world scan reports 0 non-player Secret Tokens.
- Dice So Nice reports persistent dice count 0 with both changed settings disabled.
- A/V reports world mode 0 and no TURN credentials.
- At final GM check, only the GM account was active; the test player had logged out.

### Semantic/player verification

- Logged in as non-GM player `SY` without a password.
- Temporarily activated Tavern, then restored the original active scene after the test.
- The converted neutral NPC was visible to the player as `未知生物`, confirming Hide NPC Names still masks its identity.
- With the mouse genuinely hovering that NPC, pressing the physical `T` key added it to the player's Foundry target set. Pressing `T` again cleared it.
- Triggered ten consecutive 3D d20 animations without creating chat messages. Persistent dice, the visible queue, and the hidden queue all remained at 0 afterward.
- Player console contained no `SimplePeer`, `RTCPeerConnection`, Aura Effects, or Sequencer error. The only Sequencer entry observed was the normal canvas-layer drawing log.
- After the module synchronization, the GM world loaded successfully and core UI labels such as Token Controls, targeting, measurement, chat, scenes, Actors, Items, Journals, and Settings rendered in Chinese, confirming that Foundry CHN is not merely listed as active but is visibly applied.
- Filepicker Plus was intentionally left inactive because it was inactive before the copy and the request was to place the jointly purchased module under `modules`, not to change the world's enabled-module set.

### Existing warnings not changed in this batch

- Spritesheet Generator requires a secure HTTPS context; plain HTTP disables it.
- MIDI-QOL still uses the deprecated `renderChatMessage` hook, supported through v14 but scheduled for removal in v15.
- Item Piles accesses the deprecated global `Tour`, also scheduled for removal in v15.

## Restart correction recorded

The original command line used relative `code/main.js`, while the data path name still contains `fvtt_v13`. The first restart therefore briefly used `E:\Bill\fvtt_v13` as the working directory and launched Foundry 13.351. This was detected from the startup log before a world session was active. The process was stopped, the actual v14 code root `E:\Bill\v14` was identified from package metadata, and the instance was restored with an absolute v14 entry point plus `--world=cor-cotn`. A stale `options.json.lock` directory left by the interrupted restart was archived after verifying that no Node process was using the data path.

## Rollback

For a full rollback, stop only the Node process whose command line contains all of the following:

- `E:\Bill\v14\code\main.js`
- `--port=8080`
- `--dataPath="E:\Bill\fvtt_v13\data"`

With port 8080 stopped, restore `worlds\cor-cotn` and `Config\options.json` from the backup path above, then launch `E:\Bill\v14\fvtt-8080-start-v14.cmd`. Do not copy the LevelDB world while it is live.

For a selective module/settings rollback, use Manage Modules to disable Aura and re-enable Polyglot/Swipe VTT, then set the two Dice So Nice settings back to true. Selectively restoring the 85 original Secret dispositions should use the stopped-server backup or a dedicated Foundry document migration; do not edit LevelDB manually.

To roll back only this module synchronization, cleanly unload the world, stop the exact validated port-8080 v14 process, move the current `foundry_chn` and `filepicker-plus` directories aside, and move `foundry_chn-14.362` and `filepicker-plus-4.0` from `E:\Bill\fvtt_v13\backups\codex-20260722-100645-module-upgrade` back under `E:\Bill\fvtt_v13\data\Data\modules`. Then restart with `E:\Bill\v14\fvtt-8080-start-v14.cmd`. Do not overwrite or delete the current directories while Foundry is running.

To roll back the Calendaria change exactly, restore `worlds\cor-cotn` and `Config\options.json` from `E:\Bill\fvtt_v13\backups\codex-20260722-103047-calendaria-enable` while the verified 8080 v14 process is stopped, and move `3ds-atlas` out of the live modules directory. That exact rollback intentionally restores the original Journal-page validation failure. If Calendaria is to be disabled permanently without errors, first export or migrate the 39 custom calendar pages to core text pages while Calendaria is still active; simply unchecking the module is not a valid long-term removal procedure.

## Residual risk

- The Dice So Nice test is a short ten-roll smoke test, not a multi-hour soak test. The two settings directly responsible for retaining interactive dice are disabled, but the next real session remains the meaningful long-duration confirmation.
- Aura Effects initialization and API exposure were verified. No temporary live aura was added to a campaign Actor, so individual aura configurations should still be tested when the first real aura is authored.
- Calendaria's graphics, weather, cinematic, ambience, and FX integrations are disabled, and its required ATLAS library is not a 3D renderer. Even so, the next real foreground-player session remains the correct long-duration performance test; the in-app-browser reload timings show that total client initialization for this heavily modded world is still substantial.

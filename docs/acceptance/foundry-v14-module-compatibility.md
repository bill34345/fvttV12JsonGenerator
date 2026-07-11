# Foundry v14 Module Compatibility Acceptance

## Scope

- Foundry VTT: 14.364
- dnd5e: 5.3.3
- Core baseline world: `fvtt-v14-core-baseline`
- Module matrix world: `fvtt-v14-module-matrix` in `server-mirror`
- Production-equivalent world: `cor-cotn` (`溟渊的呼唤`)

This report distinguishes installation and declared compatibility from behavior actually exercised in the current local runtime. Missing image assets in `cor-cotn` are tracked as non-blocking asset gaps unless they prevent the workflow under test.

## Acceptance Matrix

| Family | Status | Current evidence |
| --- | --- | --- |
| No-module Foundry/dnd5e baseline | Pass | Actor created, opened, edited (`TMP=5`), rolled, and exported; reload loaded 0 `/modules/` resources; 0 browser errors; 0 server warnings/errors after world creation |
| Dependency libraries and actor sheets | Pass | 10-module group loaded; Tidy NPC and PC sheets opened and rolled; 0 browser errors; 0 server warnings/errors |
| Automation and effects | Pass | 17-module cumulative set loaded; attack, damage, condition cycle, OverTime, and Item Macro executed; 0 reload browser errors |
| Animation and media | Partial | Nine-module group loaded; a JB2A WebM played through Sequencer and was fetched; a Token Magic filter completed an add/remove cycle; relevant packs opened. Share Media displayed the selected video, but player receipt could not be tested in the GM-only disposable world. The planned melee/ranged/save coverage is incomplete. |
| Scene, token, world utilities, localization, and content | Partial | In the cumulative utility/full-set runtime, a token moved and a wall, tile, and journal were created; utility controls and 90 packs were present. Calendar behavior, localization behavior, and representative feature correctness across the whole family remain incomplete. |
| Complete production-snapshot module set | Fail | Of 88 production-active IDs, 87 registered in this runtime; the protected MCDM package was rejected for an invalid signature. Excluding the user-disabled Dungeon Strugglers left 86 configurable modules. That set reproducibly emitted two browser errors. Disabling `monks-combat-marker` and `translate-all` produced an 84-module reload with 0 captured browser errors, but this is a reduced set, not acceptance of all 88. |
| Production-equivalent `cor-cotn` core workflow | Pass | After an explicitly authorized local-only Gamemaster password reset, the copied world opened. A real character sheet, saving throw/chat card, journal page, scene documents, and token restoration were exercised successfully. |
| Production-equivalent `cor-cotn` complete-module error-free gate | Fail | The world is usable for the sampled core workflows, but `simple-quest` 2.3.10 threw a `JournalEntryPage.buildTOC` exception; repeated missing `@resources.legres.value` and deprecation warnings were also present. |

## No-Module Baseline Evidence

- UI showed Foundry VTT 14 Build 364 and Dungeons & Dragons Fifth Edition 5.3.3.
- Created disposable world `FVTT v14 Core Baseline` with ID `fvtt-v14-core-baseline`.
- Created Actor `Core Baseline Hero` and opened its dnd5e sheet.
- Changed temporary HP to `5`; the open sheet displayed `TMP: 5`.
- Rolled a Strength Saving Throw. The public chat card showed formula `1d20 + 0` and result `8` for this run.
- Triggered Actor JSON export. CDP reported suggested filename `fvtt-Actor-core-baseline-hero-48gHglICPxa0VEtl.json` and 13,265 received bytes.
- Reload audit found 61 dnd5e system resources and no resource URL under `/modules/`.
- Reload audit recorded no browser `Runtime.exceptionThrown` or error-level log entry.
- The server-log segment beginning with world creation contained 0 warning/error entries.

## Dependency Libraries and Actor Sheets

Active group:

- `lib-wrapper` 1.13.5.1
- `socketlib` 1.1.4
- `lib-dfreds-migrations` 1.0.3
- `lib-dfreds-ui-extender` 2.3.0
- `scene-packer` 2.8.12
- `portal-lib` 4.0.0
- `tidy5e-sheet` 13.5.0
- `token-action-hud-core` 2.1.1
- `token-action-hud-dnd5e` 2.1.0
- `fvtt-party-resources` 1.9.0a

Behavior exercised:

- Confirmed the runtime reported exactly these 10 active modules after reload.
- Confirmed Tidy registered NPC and character sheet classes alongside the dnd5e core sheets.
- Opened `Step2 Library NPC` with `Tidy5eNpcSheetQuadrone`; its Strength Saving Throw produced a public chat card with result `12` in this run.
- Opened `Step2 Sheet PC` with `Tidy5eCharacterSheetQuadrone`; its Strength Saving Throw produced a public chat card with result `6` in this run.
- Party Resources added its sidebar control. Token Action HUD Core and D&D 5e loaded without a blocking error; token-specific behavior remains covered by the later token/complete-set steps.
- Reload loaded 96 module resource URLs, produced 0 captured browser errors, and the server-log segment from module-matrix world creation contained 0 warning/error entries.

## Observed Conflicts

Add rows only for failures reproduced during the current run.

| Symptom | Minimal enabled set | Reproduction | Console/server evidence | Result |
| --- | --- | --- | --- | --- |
| Monk's Combat Marker throws while transferring settings | Not minimized below the 86-module broad set; `monks-combat-marker` 12.01 was the isolated responsible module in that set | Reload the 86-module configuration; then disable only `monks-combat-marker` and reload | Browser exception: `"monks-little-details.token-highlight-remove" is not a registered game setting`, from `monks-combat-marker.js` `transferSettings`; absent after disabling the module | Reproduced and isolated for this configuration; leave `monks-combat-marker` disabled pending a compatible fix |
| Translate All makes an unauthorized OpenAI models request with no configured key | Not minimized below the 86-module broad set; `translate-all` 2.1.0 was the isolated responsible module in that set | Reload with `translate-all` enabled and no API key; then disable only it and reload | Request to `https://api.openai.com/v1/models` returned HTTP 401; local module source calls model discovery during initialization; absent after disabling the module | Reproduced and isolated for empty-key configuration; leave `translate-all` disabled unless initialization/key handling is corrected |
| Simple Quest fails while building a journal page table of contents | Production-equivalent `cor-cotn` with 87 registered active modules; interaction set not minimized | Open the copied world and render journal content during the authenticated production-world smoke test | Browser exception from `simple-quest` 2.3.10: `JournalEntryPage.buildTOC`, `t.forEach is not a function` | Reproduced in the real copied world; full-set error-free gate fails pending minimization/fix |

## Automation and Effects

Added `midi-qol` 14.0.9, `dae` 14.0.12, `itemacro` 3.0.1, `automated-conditions-5e` 14.533.7.2, `dfreds-convenient-effects` 9.0.2, `simplecover5e` 2.1.3, and `vision-5e` 3.1.3. The cumulative runtime reported 17 active modules after reload.

Behavior exercised:

- Created a linked test workflow with a PC Longsword Activity and a targeted NPC token.
- The attack configuration included Automated Conditions 5e controls. The attack rolled `20` total in this run.
- The Longsword damage roll produced `5` slashing damage. Applying it through the dnd5e/MIDI damage card changed the synthetic target Actor from 20 HP to 15 HP.
- DFreds Convenient Effects added `Prone` with status `prone` to the synthetic Actor and removed it cleanly, leaving no effect behind.
- Created `flags.midi-qol.OverTime` test effect `Step3 Test Bleed`. MIDI processed turn-start piercing rolls (`2` and `1` in the two invocations made while diagnosing the async call); applying the latest card changed target HP from 15 to 14. The test effect was then deleted.
- Item Macro stored and executed a script macro on the Longsword; `hasMacro()` returned true and execution returned `Longsword`.
- Reload with the cumulative 17-module set produced 0 captured browser errors. No server warning/error entry was present in the current server log.

Simple Cover 5e and Vision 5e loaded and initialized without errors; detailed wall, line-of-sight, hearing, and cover geometry behavior remains part of the scene/token utility step and complete-set acceptance.

## Animation and Media

Added the following nine modules to the cumulative matrix world:

- `autoanimations` 7.0.15
- `dnd5e-animations` 3.3.0
- `sequencer` 4.2.2
- `jb2a_patreon` 0.7.4
- `tokenmagic` 0.8.4
- `fxmaster` 8.2.4
- `share-media` 3.14.2
- `chat-media` 14.0.1
- `psfx` 0.15.0

Mechanical evidence:

- The runtime reported all nine modules active, for 26 cumulative active modules.
- D&D5e Animations exposed four macro-pack entries and three item-pack entries; FXMaster exposed three packs; PSFX exposed 31 macros.
- A Longsword attack still completed after activation and created one new attack message with 0 captured browser errors.
- A Sequencer effect using `modules/jb2a_patreon/artwork/Circle_Icon_4sec_400x400.webm` returned a successful play result, and the browser network trace recorded WebM fetches.
- A Token Magic glow filter was added to the token (one filter flag) and removed (zero remaining filters).
- Share Media accepted the same local JB2A video and displayed it in media history. Its UI remained `Not shared with any players` because this disposable world had no second player.

Semantic acceptance:

- The direct Sequencer/JB2A playback and Token Magic state cycle demonstrate usable animation and token-filter behavior, not merely module initialization.
- The family remains `Partial`: player-side media receipt was not observable, and the planned ranged and save-based animation workflows were not exercised. The Longsword check proves roll completion but does not by itself prove Automated Animations rendered exactly once.

Package-shape concerns observed during inventory review, not proven runtime conflicts:

- The JB2A manifest declared compatibility only through Foundry v12 and did not provide a manifest/download URL.
- Declared compendium paths for D&D5e Animations and FXMaster did not exactly match the inspected on-disk shapes. Their packs were nevertheless enumerated at runtime; this evidence does not establish every pack entry is usable.

## Scene, Token, and World Utilities

Behavior exercised in `Step3 Automation Arena` with the cumulative utility/full-set configuration:

- Moved the PC token from `x=200` to `x=300` and observed the updated scene state.
- Created wall `ohuu73IUZOPLJz90` with coordinates `[400,150,400,550]`.
- Created tile `Do6oDsnK6wypWb88` using `icons/svg/hazard.svg`.
- Created journal `Step5 Utility Journal` (`7C2Pq1c9IXDPraA7`).
- Enumerated 90 packs.
- Observed UI integrations including Tile Controls, Wall Controls, Journal, targeting, Global Clock, Calendaria editor integrations, Calendar Settings, and Levels filtering.

These state changes establish basic scene-document and journal usability in the combined runtime. Control visibility alone is mechanical evidence, not proof that each utility works. Calendar manipulation, Levels/Multilevel Token traversal, Monk's Active Tiles execution, localization output, content-pack semantics, and detailed wall/cover/vision behavior were not completed, so this family remains `Partial`.

## Complete-Set and Reduced Stable-Set Results

The production inventory contained 88 active module IDs. The local runtime could not reproduce an exact 88-active state:

- `mcdm-flee-mortals-where-evil-lives` was rejected before registration because its protected-module signature was invalid, leaving 87 runtime-registered production IDs.
- `dungeon-strugglers-collection` was intentionally left disabled by user decision, leaving 86 configurable active modules for the broad test.
- Reloading those 86 modules reproduced two browser errors described in the conflict table above.
- Disabling only `monks-combat-marker` and `translate-all` reduced the active set to 84. The subsequent reload recorded 0 captured browser errors.

The 84-module reload is mechanical evidence for a cleaner reduced configuration. It is not an exact-parity result, does not prove every enabled feature is correct, and does not turn the 86-module or production 88-ID set into a `Pass`. Initial FPS near `0.5` was observed during startup only and is retained as informational evidence; no steady-state performance conclusion was drawn from it.

## Production-Equivalent World Evidence

The copied `cor-cotn` world was exercised locally on Foundry `14.364` with dnd5e `5.3.3`. The user explicitly authorized resetting only the local copy's Gamemaster password. Before that reset, the local users database was backed up to `.local/foundry-v14/data/server-mirror/Data/worlds/cor-cotn/data/users.backup-before-local-gm-reset-20260711-135117`. This ignored runtime backup contains user data and is not a tracked deliverable; no credential is recorded in this report.

Mechanical inventory after authenticated entry:

- 87 registered active modules; the protected MCDM package remained unavailable because of its invalid signature.
- 729 Actors, 281 Scenes, 415 Journals, 1,427 Items, and 41 messages at initial inspection.
- The landing-page Scene contained five Tokens and four Walls.

Behavior exercised:

- Opened the real character sheet `卡勒姆·维雷`.
- Rolled its Strength saving throw. A public chat card was created with formula `1d20 - 1` and total `6` in this run.
- Opened the `St. Patrick's Day` Journal and rendered its one page.
- Verified that the inspected token was restored to its original coordinates, `x=2054`, `y=1833`, after the movement check.

This is semantic evidence that the copied world can load and that representative Actor, roll/chat, journal, scene, and token workflows are usable. It does **not** establish complete module compatibility. The browser recorded a `simple-quest` 2.3.10 exception in `JournalEntryPage.buildTOC` (`t.forEach is not a function`), repeated missing `@resources.legres.value` warnings, and deprecation warnings. Consequently, production-world core usability passes for the sampled workflows, while the complete-module error-free gate fails and overall Task 7 remains `Partial/Fail`, not `Pass`.

## Known Concerns Not Yet Accepted

- `mcdm-flee-mortals-where-evil-lives` currently reports an invalid protected-module signature at server startup. This is not a proven coexistence conflict, but the module cannot receive `Pass` until an authorized valid package loads.
- `dungeon-strugglers-collection` is installed but intentionally excluded from the active test set by user decision.
- `dnd-simplified-chinese-babele-patch` 1.0.76 and `dnd-heroes-faerun` 1.1.0 are user-approved local versions that differ from the production inventory snapshot.

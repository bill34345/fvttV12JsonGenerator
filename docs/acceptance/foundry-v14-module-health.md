# Foundry v14 module health report

Baseline generated: 2026-07-11T07:49:37.753Z

Incremental local update: 2026-07-28. Only the rows explicitly marked `Partial` below were
updated from later authenticated runtime and A/B evidence; the full 249-module inventory and
120-minute soak matrix were not rerun. `Partial` therefore means the named behavior was tested,
not that the module has passed complete long-session acceptance.

Foundry 14.364; dnd5e 5.3.3.

## Mechanical evidence

- 249 disk manifests inspected
- 88 active module records compared
- Production disk inventory refreshed read-only: 249 manifests, 0 parse failures
- Local runtime: Foundry 14.364, dnd5e 5.3.3, 87 active modules
- Find the Culprit 3.3.0 manifest SHA-256 30c1949966cb9d70440e9130f1b0b1f3ea5ace1bce69c31c1ee424874262be1f and ZIP SHA-256 40dd76155b2e72ce8b1e61140d6fb433a9f8001ee4825789c088cea6c66a048f
- Complete-set startup browser heap used 914 MB, 49,946 Blink nodes, 19,673 JS event listeners; server working set 241.5 MB
- Find the Culprit confirmation run reproduced the Simple Quest getSceneControlButtons exception with only Simple Quest, dependencies, and pinned localization/libraries active
- The required four-profile 120-minute soak and final A/B soak have not been completed

## Semantic acceptance

- Production language was read-only verified as cn.foundry_chn; local setup, join page, world description, world UI, module management, calendars, and module welcome dialogs rendered in Chinese after alignment
- Core and general module localization passed the observed UI paths; representative Babele Actor, Item, spell, and Activity content remains unreviewed
- The full production-like world is not acceptable as error-free: Simple Quest crashes Scene Controls, one Item damage formula is invalid, terrainmapper RegionBehavior types are unavailable, and legres resource references are unresolved
- Performance root cause remains unproven until the required soak matrix is complete

## Module matrix

| Module | Version | Status | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| 5e-chm-online | 251108 | Warning | manifest metadata is compatible; runtime behavior not yet accepted; repeated getSceneControlButtons warning: controls is not an array Object; remained independently observable during bisect | keep under review and run a dedicated single-module/combination test |
| recycle-bin | 2.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| advanced-drawing-tools | 14.0.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| always-hp | 14.01 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| autoanimations | 7.0.17 | Partial | 20 real AA API plays completed without accumulating TextureLoader, PIXI cache, DOM, persistent Effect, or JS heap; three-way animation-stack A/B completed; `killAllAnim=on` is the enabled state in 7.0.17 | keep active; preserve `killAllAnim=on`; long-session and visual acceptance remain |
| automated-conditions-5e | 14.533.7.2 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| automated-evocations | 6.0.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| babele | 2.9.1 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| multi-token-edit | 3.2.2 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| calendaria | 1.2.0 | Partial | dependency 3DS:ATLAS 1.0 enabled; 39 calendarnote pages restored and startup rechecked without the prior initialization failure | keep current low-load feature configuration; verify whether chat timestamp periodic updates have a supported setting before changing |
| _chatcommands | 2.0.6 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| chat-media | 14.0.1 | Warning | manifest metadata is compatible; runtime behavior not yet accepted; writes deprecated ChatLog.MESSAGE_PATTERNS during Foundry 14 startup | continue only with monitoring and update before Foundry removes compatibility support |
| color-picker | 1.7 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| custom-css | 2.4.4 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| dnd5e-animations | 3.3.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| dfreds-chat-pins | 6.1.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| dfreds-convenient-effects | 9.0.2 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| dfreds-droppables | 6.1.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| dice-so-nice | 6.2.9 | Partial | client-scope preference boundary verified; `persistentDice=false` and `allowInteractivity=false`; first 1d20 showed one 82.4 ms warm-up pause while repeated rolls were smooth | keep 3D dice; player settings require per-client handling; hidden-sidebar-statistics status still needs verification |
| dice-calculator | 3.6.7 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| fuzzy-foundry | 5.0.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| dungeon-strugglers-collection | 1.1.1 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| dnd-dungeon-masters-guide | 2.0.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| dnd-monster-manual | 1.3.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| dnd-players-handbook | 2.1.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| dae | 14.0.12 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| easy-target | 4.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| dnd-forge-artificer | 1.1.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| mcdm-flee-mortals-where-evil-lives | 2.0.1 | Untested | manifest metadata is compatible; runtime behavior not yet accepted; local runtime rejected the protected package because its signature is invalid | treat as authorization-environment untestable; do not bypass protection |
| fa-battlemaps | 1.2.2 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| dnd-adventures-faerun | 1.2.1 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| dnd-heroes-faerun | 1.0.0 | Warning | manifest metadata is compatible; runtime behavior not yet accepted; local runtime used user-approved 1.1.0 while the production snapshot records 1.0.0 | retain the approved local version for testing but do not claim exact parity |
| fxmaster | 8.2.4 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| global-progress-clocks | 1.3.2 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| scaleGrid | 1.5.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| hide-npc-names | 1.3.4 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| itemacro | 3.0.1 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| item-piles | 3.3.2 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| itempilesdnd5e | 1.1.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| jb2a_patreon | 0.7.4 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| levels | 7.0.3 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| lib-dfreds-migrations | 1.0.3 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| lib-dfreds-ui-extender | 2.3.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| scene-packer | 2.8.12 | Warning | manifest metadata is compatible; runtime behavior not yet accepted; accesses deprecated global CompendiumCollection during Foundry 14 startup | continue only with monitoring and update before Foundry 15 |
| lib-wrapper | 1.13.5.1 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| midi-qol | 14.0.11 | Partial | current local/target version; Blood Hunter structures are checked against its source, while older 14.0.9 runtime evidence remains historical | requires bounded 14.0.11 runtime and semantic acceptance |
| monks-active-tiles | 14.01 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| monks-bloodsplats | 14.01 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| monks-chat-timer | 14.01 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| monks-combat-details | 14.02 | Partial | combat tests covered `select-combatant=false`, `opencombat=none`, `popout-combat=false`, `auto-scroll=false`, and `pan-to-combatant=true` | retain settings; long-session acceptance still required |
| monks-combat-marker | 12.01 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| monks-common-display | 14.01 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| monks-enhanced-journal | 13.06 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| monks-little-details | 14.01 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| monks-scene-navigation | 14.02 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| monks-tokenbar | 14.01 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| monks-wall-enhancement | 14.01 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| multilevel-tokens | 14.1.2 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| multiple-document-selection | 14.01 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| fvtt-party-resources | 1.9.0a | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| plutonium-cn | 2.15.6 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| polyglot | 2.9.1 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| portal-lib | 4.0.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| psfx | 0.15.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| quick-insert | 3.7.6 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| quickscale | 1.7.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| dnd-ravenloft-horrors-within | 1.0.1 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| sequencer | 4.2.3 | Partial | rollbackable 7→2 spritesheet Worker patch completed 20 real AA plays; two ~286 MiB committed WASM regions were measured at only ~1.15 MiB resident each | keep exact-version patch with guards; Blob cache live usage and long-session acceptance remain open |
| share-media | 3.14.2 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| simplecover5e | 2.1.3 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| simple-quest | 2.3.10 | Incompatible | manifest metadata is compatible; runtime behavior not yet accepted; Find the Culprit confirmation run reproduced t.find is not a function in getSceneControlButtons with Simple Quest 2.3.10 active in the minimized set | disable by default on Foundry 14.364 pending a v14-compatible release or source fix |
| socketlib | v1.1.4 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| swarm | 14.0.2 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| sync-token-name | 2.0.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| tagger | 1.6.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| tidy5e-sheet | 13.5.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| tile-scroll | 5.0.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| token-action-hud-core | 2.1.1 | Partial | fair combat A/B covered turn changes, real clicks, automatic-selection-off, and manual token selection; TAH outperformed the tested Argon replacement | keep enabled; repeat only if module version changes and complete long-session acceptance |
| token-action-hud-dnd5e | 2.1.0 | Partial | tested together with TAH Core under the same combat A/B and retained as the dnd5e action-HUD adapter | keep enabled with TAH Core; complete long-session acceptance |
| tokenmagic | 0.8.4 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| translate-all | 2.1.0 | Incompatible | manifest metadata is compatible; runtime behavior not yet accepted; previous live isolation reproduced an unauthorized OpenAI models request and HTTP 401 when no key was configured; it was disabled for this diagnostic run | leave disabled unless initialization and credential handling are corrected |
| foundry_chn | 14.362 | OK | manifest metadata is compatible; runtime behavior not yet accepted; local setup, join, world, settings, and module management UI rendered in Chinese under cn.foundry_chn | continue enabled |
| dnd-simplified-chinese-babele-patch | 1.0.69 | Warning | manifest metadata is compatible; runtime behavior not yet accepted; local runtime used user-approved 1.0.76 while the production snapshot records 1.0.69; representative Actor and Item content was not fully reviewed | retain the approved local version for testing but do not claim exact parity |
| 5e_chn | 5.3.0 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| zzz_mod_chn | 13.93 | OK | manifest metadata is compatible; runtime behavior not yet accepted; representative third-party module dialogs and controls rendered in Chinese | continue enabled; untranslated modules still require per-module review |
| dd-import | 6.1.1 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| vision-5e | 3.1.3 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |
| z-scatter | 2.2.4 | Untested | manifest metadata is compatible; runtime behavior not yet accepted | requires runtime and semantic acceptance |

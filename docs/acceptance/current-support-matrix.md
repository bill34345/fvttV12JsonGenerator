# Current Support Matrix

**Current as of:** 2026-07-15
**Canonical role:** this file is the current support summary. Dated reports remain immutable evidence snapshots; later amendments clarify their present interpretation without erasing earlier failures or narrower passes.

## Status vocabulary

- **Pass:** the named layer has current mechanical and semantic evidence for the bounded scope stated in that row.
- **Partial:** some named workflows pass, but material behavior in the same layer is unaccepted or failing.
- **Fail:** a required behavior was reproduced as failing.
- **Blocked external:** safe completion needs user authorization, credentials, a valid protected package, or another user-controlled state change.
- A Pass at one layer never upgrades a deeper layer. JSON schema validity does not prove Foundry runtime behavior; sampled copied-world usability does not prove complete module coexistence; local evidence does not prove production deployment.

## Current product truth

| Layer | Current status | Accepted scope | Explicit boundary | Dated evidence |
|---|---|---|---|---|
| Source fidelity | **Pass, bounded corpus** | The 19-category corpus covers Chinese/English, Actor/Item, parser/generator, v12/v14, core/modded, positive/close-negative, effect/condition, and unrelated regressions. Real Shield and Damage-Bound Warden CLI outputs were also read against source. | This is not a claim for arbitrary Markdown or every D&D mechanic. | [Current corpus matrix](current-corpus-matrix.md); [source/JSON review](v14-source-json-full-review.md) |
| Schema validity | **Pass, current targets** | Generated v12 and explicit v14 Actor/Item structures pass characterized tests; v14 targets Foundry 14.361 document metadata and dnd5e 5.3.3 schemas. | Schema checks do not prove import migration, sheet rendering, or Activity execution. | [Core batch](v14-core-batch-verification.md); [modded batch](v14-modded-batch-verification.md); [current corpus](current-corpus-matrix.md) |
| CLI/workflow generation | **Pass, represented flows** | Actor and standalone Item generation, plaintext ingestion, vault sync, verification, and offline smoke are covered by the 743-test aggregate gate. Shield v12/v14 and Damage-Bound Warden core/modded-v14 were regenerated through `src/index.ts`. | Authenticated crawl and runtime import/export are separate layers. Generated JSON was not hand-repaired. | [Current corpus](current-corpus-matrix.md); `bun run ci:verify` result recorded there |
| Core Actor runtime | **Pass, six-Actor local sample** | Six v14/core Actors imported into Foundry 14.364 / dnd5e 5.3.3, opened, executed representative Activities, and re-exported with reviewed semantics retained. | This does not cover standalone Item runtime or arbitrary Actors. | [Live runtime smoke](v14-live-runtime-smoke-test.md); [source/JSON review](v14-source-json-full-review.md) |
| Minimal modded Actor runtime | **Pass for the locked MIDI bleeding and `isDamaged` contracts; Partial overall** | MIDI-QOL 14.0.9 + DAE 14.0.12 + dependencies retain the earlier Bleeding Guardian proof and now remove a CLI-generated Dread Brand effect after actual subsequent damage. | These are two bounded module contracts, not a blanket claim for arbitrary automation or the full production module set. | [Live runtime smoke](v14-live-runtime-smoke-test.md) |
| Source-derived `isDamaged` generation | **Pass at code/CLI/schema layer** | A neutral per-status source-duration hint is mapped only by `modded-v14` to DAE 14.0.12 `flags.dae.specialDuration: ["isDamaged"]`; core strips DAE flags. Core/modded fixture Actors are otherwise source-equivalent. | Locked source shows MIDI-QOL 14.0.9 consumes actual damage and removes the effect. Static evidence is not runtime proof. | [Current corpus](current-corpus-matrix.md); [M9 plan evidence](../remediation/2026-07-15-project-hardening/milestones/09-product-acceptance-and-support.md) |
| Source-derived `isDamaged` runtime | **Pass, locked stack** | The CLI modded-v14 Dread Brand dealt 6 damage and left Frightened active; a later CLI Stone Fist dealt 4 and DAE+MIDI expired/removed it. The CLI core artifact dealt 8, then 9 more damage, and retained the same source-derived effect without `specialDuration`. | This proves only DAE 14.0.12 + MIDI-QOL 14.0.9 with Foundry 14.364/dnd5e 5.3.3. It does not prove exact production coexistence. | [M9 plan evidence](../remediation/2026-07-15-project-hardening/milestones/09-product-acceptance-and-support.md); [live runtime smoke](v14-live-runtime-smoke-test.md) |
| Standalone Item generation | **Pass at source/CLI/schema layer** | The real Shield has neutral-template isolation, shield base AC 2 + magical bonus 2, correct type/properties/weight, Forceful Bash damage/prone linkage, Protective Field reaction/dawn/duration/concentration/radius, portable v14 metadata, and self-Activity use consumption. | The remaining gap is the runtime export artifact comparison, not generation or import. | [Current corpus](current-corpus-matrix.md); [M9 plan evidence](../remediation/2026-07-15-project-hardening/milestones/09-product-acceptance-and-support.md) |
| Standalone Item v14 runtime | **Partial; behavior Pass, export artifact open** | CLI JSON imported through Foundry UI; a disposable Actor showed AC `10 -> 12 -> 14`; Forceful Bash attack/damage/prone and Protective Field 1/day depletion, 60-second concentration, second-use rejection, and runtime readback passed. | The UI export event timed out and produced no downloaded JSON, so the required CLI-versus-re-export artifact comparison remains unaccepted. | [M9 plan evidence](../remediation/2026-07-15-project-hardening/milestones/09-product-acceptance-and-support.md) |
| Copied-world sampled usability | **Pass, narrowly sampled** | In the local `cor-cotn` copy, a real character sheet, save/chat card, Journal, Scene documents, and Token restoration were exercised after an explicitly authorized local-only Gamemaster reset. | This is not an error-free world or complete module result. Swipe production/touch acceptance remains Partial. | [Module compatibility](foundry-v14-module-compatibility.md); [live runtime smoke](v14-live-runtime-smoke-test.md) |
| Exact production-equivalent module coexistence | **Fail / Partial** | Reduced configurations and many representative module families have useful evidence. | The protected MCDM package has an invalid signature; the 86-module candidate emitted errors; the reduced 84-module startup is not parity; copied-world `simple-quest` errors and other warnings remain. | [Module compatibility](foundry-v14-module-compatibility.md); [module health](foundry-v14-module-health.md); [module parity](foundry-v14-module-parity.md) |
| Production deployment state | **Partial, historical evidence only for this remediation turn** | The dated production log records deployed Swipe/Bloodsplats changes and sampled light/heavy scene health. | Swipe session validation, Token drag, complete attack/damage, Item Piles touch coexistence, and exact module compatibility were not accepted. This remediation turn did not inspect or modify production. | [Local/production optimization log](foundry-v14-local-optimization-log.zh-CN.md); [module compatibility](foundry-v14-module-compatibility.md) |
| Authenticated GoddessFantasy crawl | **Blocked external / unaccepted** | Offline fixtures, mocked crawl tests, records-to-plaintext, and pipeline code pass. | No credential/session use was authorized. A fixture or unauthenticated dry run is not a live authenticated crawl. | [Current corpus](current-corpus-matrix.md); parent remediation ledger |
| Web/API deployment boundary | **Pass at application layer** | Loopback-only default, explicit authenticated public/proxied mode, trusted proxy identity, pre-materialization body checks, rate/job caps, cleanup, process probes, and real browser Actor/ZIP workflows pass. | Public TLS, reverse-proxy identity, firewalling, OS limits, and distributed quotas remain infrastructure responsibilities. | [Deployment guide](../web-deployment.md); remediation Milestone 8 evidence in the parent ledger |

## Safe resume boundaries

### Local Foundry Item export proof

Chrome file access is already enabled and the DAE/MIDI exercise is complete. Resume only in the project-local `fvtt-v14-module-matrix` world: import the existing CLI Shield through Foundry's Import Data dialog, capture the supported Export Data download, compare source-relevant fields while separating migration-only volatility, delete disposable documents, stop the local server, and restore `server-mirror/Config/options.json`. Do not write LevelDB directly and do not touch production.

### Authenticated GoddessFantasy crawl

Required new authority: the user must explicitly authorize use of a logged-in session or credentials. Keep secrets out of arguments, tracked files, logs, and reports. Prefer an ignored cookie-header file or the `GODDESSFANTASY_COOKIE` environment variable. The safe resume command is:

```powershell
bun run src/tools/crawlSites.ts goddessfantasy-pipeline --cookie-header-env GODDESSFANTASY_COOKIE --mode incremental --content-type monster --effect-profile core --fvtt-version 14
```

Do not add `--skip-auth-probe`; the authenticated board probe is part of acceptance. After crawling, review provenance plus representative `records.json` -> plaintext -> CLI Actor semantics. The command must not be run until that authorization/session exists.

### Exact production-equivalent coexistence

Required external state and authority: a valid authorized protected MCDM package, an exact intended package/version/activation set, and explicit authorization before any production change. Until representative workflows pass with that exact set, retain **Fail / Partial** regardless of clean reduced-set startup.

## Claim rule

The project currently supports source-faithful generation for the bounded corpus, v12 by default, explicit v14 generation, core Actor runtime samples, standalone Item v14 import/behavior readback, the narrow locked MIDI bleeding workflow, and the locked DAE+MIDI `isDamaged` contract. It does **not** currently support a blanket claim of full Foundry v14 production compatibility, complete module coexistence, live authenticated GoddessFantasy ingestion, or a completed standalone Item re-export artifact comparison.

## 2026-07-15 M10 Pre-Final Audit

- Mechanical repository gates: production and broad typechecks pass; 738 tests / 2,921 expectations pass; production coverage is 87.54% lines and 88.40% functions; all-source anti-overfit passes with 109 sources; dnd5e 5.3.3 reference verification and Web build pass; Foundry Lab passes 116 tests / 417 expectations; repository hygiene passes across 1,605 tracked paths.
- Regeneration: v12/core, v14/core, and v14/modded-v14 Damage-Bound Warden Actors, the v14/core Shield, and the unrelated v12 Jewel were regenerated only through `src/index.ts` into ignored output paths.
- Semantic review: all three Actor verifier runs have zero warnings. Explicit assertions pass for source identity/stats/type/version metadata, native attack damage and reach, exactly scoped frightened/DAE behavior, the complete Shield armor/Activity/prone/reaction/duration/range/recovery projection, and absence of Shield mechanics on the Jewel.
- At that pre-final checkpoint, the browser upload/download smoke, Shield live behavior, and DAE+MIDI removal were unaccepted alongside authenticated crawl and exact production coexistence. The runtime amendment below supersedes the first three items while preserving the dated audit chronology.

## 2026-07-15 Runtime Resume Amendment

- Chrome file access unblocked Foundry's supported Import Data path. Shield import exposed and drove generalized fixes for portable `_stats.lastModifiedBy` and limited self-Activity consumption; Damage-Bound Warden exposed and drove the generalized `untilDamaged` Activity duration `spec` fix.
- Semantic runtime acceptance now passes for Shield AC, Forceful Bash attack/damage/prone, Protective Field one-per-dawn depletion/concentration/second-use rejection/runtime readback, and the modded removal versus core retention `isDamaged` control.
- The complete rerun passes 743 tests / 2,932 expectations, 87.55% line / 88.41% function production coverage, both typechecks, 109-source anti-overfit, 1,605-path hygiene, locked reference verification, Web build, and offline smoke. One first-run token-review timeout passed 2/2 alone and the complete rerun; it remains recorded as scheduling debt rather than hidden.
- The only remaining local Item evidence gap is a downloaded UI Export Data artifact and CLI-versus-export semantic comparison. Authenticated crawl and exact protected/full module coexistence remain external boundaries.

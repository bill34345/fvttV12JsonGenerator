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
| CLI/workflow generation | **Pass, represented flows** | Actor and standalone Item generation, plaintext ingestion, vault sync, verification, and offline smoke are covered by the 738-test aggregate gate. Shield v12/v14 and Damage-Bound Warden core/modded-v14 were regenerated through `src/index.ts`. | Authenticated crawl and runtime file import are separate layers. Generated JSON was not hand-repaired. | [Current corpus](current-corpus-matrix.md); `bun run ci:verify` result recorded there |
| Core Actor runtime | **Pass, six-Actor local sample** | Six v14/core Actors imported into Foundry 14.364 / dnd5e 5.3.3, opened, executed representative Activities, and re-exported with reviewed semantics retained. | This does not cover standalone Item runtime or arbitrary Actors. | [Live runtime smoke](v14-live-runtime-smoke-test.md); [source/JSON review](v14-source-json-full-review.md) |
| Minimal modded Actor runtime | **Pass for the locked MIDI bleeding contract; Partial overall** | MIDI-QOL 14.0.9 + DAE 14.0.12 + dependencies imported six Actors; the source-derived Bleeding Guardian OverTime path dealt exactly one repeated `1d6` and remained separate from initial-hit damage. | DAE coexistence was observed, but the new `isDamaged` behavior has not yet been exercised. | [Live runtime smoke](v14-live-runtime-smoke-test.md) |
| Source-derived `isDamaged` generation | **Pass at code/CLI/schema layer** | A neutral per-status source-duration hint is mapped only by `modded-v14` to DAE 14.0.12 `flags.dae.specialDuration: ["isDamaged"]`; core strips DAE flags. Core/modded fixture Actors are otherwise source-equivalent. | Locked source shows MIDI-QOL 14.0.9 consumes actual damage and removes the effect. Static evidence is not runtime proof. | [Current corpus](current-corpus-matrix.md); [M9 plan evidence](../remediation/2026-07-15-project-hardening/milestones/09-product-acceptance-and-support.md) |
| Source-derived `isDamaged` runtime | **Blocked external / unaccepted** | Foundry login and Import Data workflow were reached in the disposable matrix world. | Chrome extension local-file selection is blocked until the user enables **Allow access to file URLs**. No effect-removal claim is accepted yet. | [M9 plan evidence](../remediation/2026-07-15-project-hardening/milestones/09-product-acceptance-and-support.md) |
| Standalone Item generation | **Pass at source/CLI/schema layer** | The real Shield now has neutral-template isolation, shield base AC 2 + magical bonus 2, correct type/properties/weight, Forceful Bash damage/prone linkage, and Protective Field reaction/dawn/duration/concentration/radius in v12 and v14. | It is not yet accepted as a live equipped/executed/re-exported Foundry Item. | [Current corpus](current-corpus-matrix.md); [M9 plan evidence](../remediation/2026-07-15-project-hardening/milestones/09-product-acceptance-and-support.md) |
| Standalone Item v14 runtime | **Blocked external / unaccepted** | Disposable world, Gamemaster session, temporary Item, context menu, and Import Data dialog were verified. | The same Chrome file-URL permission blocks import. Equip AC, both Activities, prone application/removal, export, and readback remain unaccepted. | [M9 plan evidence](../remediation/2026-07-15-project-hardening/milestones/09-product-acceptance-and-support.md) |
| Copied-world sampled usability | **Pass, narrowly sampled** | In the local `cor-cotn` copy, a real character sheet, save/chat card, Journal, Scene documents, and Token restoration were exercised after an explicitly authorized local-only Gamemaster reset. | This is not an error-free world or complete module result. Swipe production/touch acceptance remains Partial. | [Module compatibility](foundry-v14-module-compatibility.md); [live runtime smoke](v14-live-runtime-smoke-test.md) |
| Exact production-equivalent module coexistence | **Fail / Partial** | Reduced configurations and many representative module families have useful evidence. | The protected MCDM package has an invalid signature; the 86-module candidate emitted errors; the reduced 84-module startup is not parity; copied-world `simple-quest` errors and other warnings remain. | [Module compatibility](foundry-v14-module-compatibility.md); [module health](foundry-v14-module-health.md); [module parity](foundry-v14-module-parity.md) |
| Production deployment state | **Partial, historical evidence only for this remediation turn** | The dated production log records deployed Swipe/Bloodsplats changes and sampled light/heavy scene health. | Swipe session validation, Token drag, complete attack/damage, Item Piles touch coexistence, and exact module compatibility were not accepted. This remediation turn did not inspect or modify production. | [Local/production optimization log](foundry-v14-local-optimization-log.zh-CN.md); [module compatibility](foundry-v14-module-compatibility.md) |
| Authenticated GoddessFantasy crawl | **Blocked external / unaccepted** | Offline fixtures, mocked crawl tests, records-to-plaintext, and pipeline code pass. | No credential/session use was authorized. A fixture or unauthenticated dry run is not a live authenticated crawl. | [Current corpus](current-corpus-matrix.md); parent remediation ledger |
| Web/API deployment boundary | **Pass at application layer** | Loopback-only default, explicit authenticated public/proxied mode, trusted proxy identity, pre-materialization body checks, rate/job caps, cleanup, process probes, and real browser Actor/ZIP workflows pass. | Public TLS, reverse-proxy identity, firewalling, OS limits, and distributed quotas remain infrastructure responsibilities. | [Deployment guide](../web-deployment.md); remediation Milestone 8 evidence in the parent ledger |

## Safe resume boundaries

### Local Foundry Item and DAE/MIDI exercises

Required user-controlled change: in Chrome, open `chrome://extensions`, choose **Details** for the ChatGPT Chrome Extension, and enable **Allow access to file URLs**. After that, resume in the project-local `fvtt-v14-module-matrix` world only. Import the existing CLI artifacts through Foundry's Import Data dialogs, exercise/equip/export them, delete disposable documents, stop the local server, and restore `server-mirror/Config/options.json`. Do not write LevelDB directly and do not touch production.

### Authenticated GoddessFantasy crawl

Required new authority: the user must explicitly authorize use of a logged-in session or credentials. Keep secrets out of arguments, tracked files, logs, and reports. Prefer an ignored cookie-header file or the `GODDESSFANTASY_COOKIE` environment variable. The safe resume command is:

```powershell
bun run src/tools/crawlSites.ts goddessfantasy-pipeline --cookie-header-env GODDESSFANTASY_COOKIE --mode incremental --content-type monster --effect-profile core --fvtt-version 14
```

Do not add `--skip-auth-probe`; the authenticated board probe is part of acceptance. After crawling, review provenance plus representative `records.json` -> plaintext -> CLI Actor semantics. The command must not be run until that authorization/session exists.

### Exact production-equivalent coexistence

Required external state and authority: a valid authorized protected MCDM package, an exact intended package/version/activation set, and explicit authorization before any production change. Until representative workflows pass with that exact set, retain **Fail / Partial** regardless of clean reduced-set startup.

## Claim rule

The project currently supports source-faithful generation for the bounded corpus, v12 by default, explicit v14 generation, core Actor runtime samples, and a narrow locked MIDI bleeding workflow. It does **not** currently support a blanket claim of full Foundry v14 production compatibility, complete module coexistence, live authenticated GoddessFantasy ingestion, standalone Item v14 runtime acceptance, or executed DAE/MIDI `isDamaged` behavior.

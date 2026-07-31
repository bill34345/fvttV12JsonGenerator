# Project Hardening and Semantic Correctness Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan milestone by milestone. Do not use subagents unless the user or a later applicable instruction explicitly authorizes delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the confirmed semantic correctness defects, make the repository's quality gates fail closed, restore trustworthy v12/v14 acceptance evidence, and leave a maintainable engineering baseline that a fresh Codex task can resume from this file alone.

**Architecture:** This file is the authoritative program ledger and recovery document. Work is divided into independently reviewable milestones; when a milestone spans more than one coherent code change, create a focused child plan under `docs/remediation/2026-07-15-project-hardening/milestones/`, link it here, and keep this file's finding status authoritative. Generated Actor JSON must continue to flow from source Markdown through the project CLI/workflows; no final Actor JSON may be hand-authored or manually repaired.

**Tech Stack:** Bun 1.3.x, TypeScript 5.9.x, React 19, Foundry VTT v12 with dnd5e 4.3.9, Foundry VTT v14.364 with dnd5e 5.3.3, current MIDI-QOL 14.0.11, DAE 14.0.12, project-local Foundry mirror under `.local/foundry-v14`. Historical runtime evidence that names MIDI-QOL 14.0.9 remains version-specific and is not silently upgraded.

## Global Constraints

- Follow `.ruler/AGENTS.md`, root `AGENTS.md`, directory-specific `AGENTS.md` files, and `docs/generated-actor-verification.md` for the entire program.
- Preserve the current dirty working tree as the source of truth. At program creation, `.ruler/AGENTS.md` and `AGENTS.md` already contain user-owned local Foundry path changes, and `docs/baileywiki-mass-edit-guide.zh-CN.md` is an unrelated untracked user file. Do not overwrite, discard, stage, or commit those changes unintentionally.
- Default generated input and output paths remain `obsidian/dnd数据转fvttjson/input` and `obsidian/dnd数据转fvttjson/output`.
- Target Foundry/dnd5e versions remain exactly those declared in root `AGENTS.md`; do not substitute latest documentation or module semantics.
- Parser and generator rules must be classified as `schema-derived`, `source-derived`, `corpus-derived`, or an explicitly authorized `explicit-exception`.
- Every parser bug fix needs a fixture-backed regression test. Every structural output change needs `assertEqualStructure()` or a stricter equivalent.
- Do not combine an unrelated refactor with a semantic fix. Each commit must represent one reviewable outcome with its own test cycle.
- A finding reaches `closed` only after both mechanical verification and semantic acceptance are recorded below. Passing tests alone is insufficient.
- Do not inspect or modify the production Foundry server unless the user separately authorizes that exact production action. Use the project-local `server-mirror` first.
- Do not introduce network dependence into default generation or tests. Optional translation, AI normalization, crawling, SSH image upload, and live runtime operations must be explicit and observable.
- Do not use a worktree created from `HEAD` while relevant dirty changes exist unless the user confirms or those changes are migrated safely first.

---

## How to Resume This Program

A fresh task must do the following before editing code:

1. Read this entire file, root `AGENTS.md`, and the closest directory-specific `AGENTS.md` for files in the next milestone.
2. Run `git status --short` and compare it with the ownership notes in **Working Tree Safety**.
3. Run the commands in **Current Verified Baseline** whose results can drift cheaply.
4. Select the highest-priority finding whose dependencies are satisfied and whose scope is authorized.
5. Change its state to `in_progress`, add a timestamped Progress entry, and record any child plan path before editing production code.
6. At every stopping point, update Progress, Surprises & Discoveries, Decision Log, the finding row, verification evidence, and the exact next action.
7. Never ask the user for a generic “next step” while an authorized milestone has a clear next action. Pause only for a material product choice, new authority, irreversible operation, credentials, or an external-state dependency.

The state lifecycle is:

`discovered -> validated -> planned -> in_progress -> mechanically_verified -> semantically_accepted -> closed`

`blocked_external` may be used only for an external dependency or authorization boundary; it does not mean the finding is fixed.

## Purpose / Big Picture

The project should reliably convert source Markdown into Foundry Actor or Item JSON without inventing mechanics, silently weakening its own gates, or overstating support in acceptance documents. After this program, an operator can run the documented CLI and receive deterministic output, CI can reject semantic and structural regressions, and the v12/v14 support statements are backed by regenerated artifacts plus source-to-output and runtime evidence.

The immediate reason for this program is a confirmed P0 defect: the AC-effect parser treats the final `ac` characters in the English word `Attack` as the D&D abbreviation `AC`. As a result, text such as `Attack: +4` can create a false Active Effect that adds 4 AC. Existing verification returned no warning and acceptance documents described contaminated artifacts as source-faithful. The program begins by repairing that semantic chain before addressing broader quality, maintainability, security, and product-acceptance gaps.

## Working Tree Safety

State observed at plan creation on 2026-07-15:

    M .ruler/AGENTS.md
    M AGENTS.md
    ?? docs/baileywiki-mass-edit-guide.zh-CN.md

Ownership and handling:

- The existing modifications in `.ruler/AGENTS.md` and `AGENTS.md` document the project-local Foundry mirror and belong to prior user-approved work. This program may append its routing block but must preserve the existing diff.
- `docs/baileywiki-mass-edit-guide.zh-CN.md` is outside this program. Do not edit or stage it.
- The new program directory is `docs/remediation/2026-07-15-project-hardening/`.
- Before every commit, use path-scoped `git diff --` and `git add -- <intended paths>`; never stage the whole worktree with `git add -A`.

## Current Verified Baseline

This snapshot was rechecked on 2026-07-15 in `I:\OpenCode\fvttV12JsonGenerator`. Treat numeric values as a baseline to remeasure, not permanent truths.

### Mechanical baseline

- `bun test --coverage --max-concurrency 4`: **639 pass, 0 fail**, 2,654 assertions, 79 files, about 34 seconds.
- `bunx tsc --noEmit`: **1,007 TypeScript errors** in the current broad configuration. Filtering out tests and `src/temp` leaves **81 errors in 20 production files**.
- Largest current production type-error clusters: `src/core/generator/actor.ts` 12; `src/web/client/App.tsx` 10; `src/core/assets/imageAssetOptions.ts` 10; `src/web/server/imageAssetPreset.ts` 10; `src/core/assets/tokenReview.ts` 6; `src/core/assets/tokenReviewContactSheet.ts` 6.
- `bun run audit:anti-overfit:all`: pass, 99 production sources checked.
- `bun run references -- verify`: `dnd5e-5.3.3: ok` in the current shell.
- There is no `.github` directory and no repository CI workflow.
- `package.json` has no typecheck, lint, format, or CI aggregate script.

### Semantic defect baseline

- The output tree contains 133 JSON files.
- A recursive inspection finds 12 effects flagged `flags.fvttJsonGenerator.sourceDerivedAcEffect`.
- Eight of those 12 have `sourceText` matching `^ack: +N`, proving they came from the tail of `Attack: +N` rather than an explicit AC clause.
- Affected acceptance artifacts include Bonebreaker Dorokor (`+8`, `+5`), Bleeding Guardian (`+4`), and White Tusk Shaman (`+5`) in both v14 acceptance directories.
- Bleeding Guardian contains the intended repeated bleeding automation and an unintended `system.attributes.ac.formula += 4` effect.
- Running `bun run verify:actor -- <bleeding source> <bleeding output>` returns `warnings: []`; the verifier does not inspect or validate Active Effects deeply enough to catch the defect.

### Repository and artifact baseline

- Production source size hotspots include `src/core/generator/actor.ts` 3,568 lines, `src/core/parser/item-parser.ts` 1,383, `src/core/ingest/plaintext.ts` 1,286, `src/core/generator/actor-text.ts` 1,228, `src/core/parser/english.ts` 1,111, and `src/web/client/App.tsx` 835.
- The vault currently has 36 Markdown input files and 133 JSON output files; 80 output files have no direct input basename match after normalizing `.v14` suffixes. This count includes legitimate acceptance and derived artifacts, so it proves missing classification, not that all 80 files are wrong.
- Git tracks 28 files under the output tree despite generated-output ignore rules.
- Root debug files and many `temp-items` artifacts are tracked even though current ignore rules would exclude newly created equivalents.
- The coverage report includes test files alongside production files and there is no enforced threshold; the headline percentage is therefore not a trustworthy production-risk gate.

### Runtime and product-support baseline

- Core v14 and the locked minimal modded v14 Actor runtime gates have existing pass evidence.
- Acceptance documents themselves state that complete production-equivalent module coexistence is still `Partial/Fail`.
- Existing delivery documentation explicitly leaves DAE-specific source behavior, authenticated live GoddessFantasy crawling, standalone v14 Item live acceptance, and complete production-module coexistence outside the accepted gate.
- Some acceptance summaries contain stale chronology about Gamemaster authentication that conflicts with later evidence showing a local-only authorized reset and sampled copied-world workflow. Documentation must be reconciled instead of selecting the most favorable statement.

## Finding Ledger

This table is authoritative. A child plan may add detail but may not silently change status or acceptance.

| ID | Priority | State | Finding | Completion evidence |
|---|---:|---|---|---|
| SEM-001 | P0 | closed | AC parsing matches the `ac` suffix inside `Attack`, creating invented AC effects. | Boundary-safe generalized parser; positive/negative corpus tests; affected actors regenerated; no `^ack:` AC effects remain; core/modded runtime AC stays unchanged. |
| SEM-002 | P0 | closed | Wrapped emphasized English trait titles are merged into the preceding trait, omitting a source feature and allowing unrelated prose to create invented effects. | Fixture-backed generalized title-boundary tests; White Tusk Shaman regains a separate `Spirit-Bonded Body` item; `Minion: Savage Horde` contains no transformation prose or `Unconscious` effect; source/runtime review passes. |
| SEM-003 | P0 | closed | Condition-effect generation treats any condition word as an inflicted status, so prerequisites, termination clauses, immunity prose, and actor-state descriptions can create invented target effects. | Source-derived application-clause parser with positive/close-negative bilingual tests; White Tusk has no invented `Unconscious`; explicit target conditions and Bleeding automation survive full regression and runtime import. |
| SEM-004 | P1 | closed | Standalone Item parsing maps Chinese rarities incorrectly and drops an actionable trait when its trigger merely mentions a saving throw, so the real Shield of the Cavalier loses schema-valid `veryRare`, reaction activation, and dawn recovery semantics. | Source-derived rarity and actionable-trait parsing with generalized positive/close-negative fixtures; the real Shield source regenerates through the CLI as `veryRare` with Forceful Bash plus a Protective Field reaction limited to once per dawn; v12/v14 structural checks and an unrelated Jewel regression pass. |
| SEM-005 | P1 | closed | The former standalone Item template leakage and omitted Shield mechanics are repaired; live import/equip/Activity/readback passed, and Foundry's public `exportToJSON()` output was captured without a native dialog and matched the CLI artifact on every source-relevant field. | Generalized armor/action schema parsing backed by locked dnd5e 4.3.9 and 5.3.3 references; positive/negative/unrelated fixtures; v12/v14 CLI regeneration; PROD-002 local Foundry import/open/exercise/re-export comparison passes without template leakage or omitted source mechanics. |
| SEM-006 | P1 | closed | The authenticated live GoddessFantasy corpus exposed structured statline loss: fractional CR `1/2` became `1`, Chinese necrotic resistance `暗蚀` was omitted, qualified language phrases lost their qualifiers, and variable size/type/alignment taxonomy could disappear. | Fraction-aware YAML parsing, corpus-derived alias/qualifier preservation, and variable-taxonomy custom fields pass fixture tests; live projections pass for 1 fractional CR, 25 qualified-language records, and 10 variable-taxonomy records across the 47 regenerated Actors. |
| SEM-007 | P1 | closed | The authenticated live GoddessFantasy corpus exposed conditional-mechanics invention: replacement damage was emitted as simultaneous damage and staged save outcomes were linked as simultaneous immediate statuses. | Source-derived clause scoping keeps base plus additive damage while preserving replacement prose; staged saves retain literal text without invented simultaneous effects; three positives, close negatives, immediate-status controls, Gremishka, and Petrifying Death's Head pass. |
| SEM-008 | P1 | closed | The four first-corpus Netherdeep Actors carry explicit source-derived resource contracts and CLI-generated v12/v14 native counters, costs, scaling, transitions and manual AC tiers. Runtime exposed and repaired the v14 natural-AC phase defect. | Static schema/source acceptance plus local Foundry 14.364 / dnd5e 5.3.3 fixed spend, variable spend/scaling, bounded gain/recovery and chat-card AC `20 -> 18` pass. Automatic trigger recognition and automatic tier switching remain explicitly outside `core`. |
| SEM-009 | P1 | closed | The complete 11-Actor Netherdeep corpus now carries one strict source-derived behavior contract for activity relations, effect lifecycles, event/frequency/state changes, capacities, choice pools, areas and truthful execution-mode reporting. Runtime review exposed and repaired selected-target projection and an incomplete all-movement slowdown projection. | Milestones 17-19 are complete; 11 v12/core and 11 v14/core Actors were regenerated through the CLI and pass standalone verification, fail-closed parser/projector/verifier tests, the source-to-output semantic matrix, aggregate gates and bounded local Foundry 14.364 / dnd5e 5.3.3 runtime scenarios. `gm-assisted` and `external-rule` clauses remain explicit `needs_review`, never automatic. |
| GEN-001 | P1 | closed | English spell attacks, successful-save outcomes, structured embedded effects, and Activity IDs now pass one source-derived generation/verification contract. | Closed by generalized positive/close-negative fixtures, stable 16-character logical-path IDs with collision rejection and 10,000-ID coverage, real Oregg v12/v14 CLI regeneration, and source-semantic review. |
| ITEM-001 | P1 | closed | Standalone Item effect profiles and stage expansion now run through one shared workflow used by all supported entry points. | Closed by profile isolation/stage tests, no stage-name or fixed-count inference, real Shield/Jewel v12/v14 CLI regeneration, and source-semantic review. |
| VER-003 | P1 | closed | Actor and Item generation now returns one typed fail-closed mechanics/schema verification result. | Closed by planted missing-damage/save-drift/duplicate-ID/dangling-effect/profile-leak regressions and single-file/collection/Vault Sync/CLI/Web publication gates. |
| TARGET-001 | P1 | closed | Generation resources are module-relative/injectable and v12/v13 versus v14 use independent dnd5e 4.3.9/5.3.3 projectors. | Closed by external-cwd Actor/Item tests, strict target metadata/uses/Activity assertions, exact official 4.3.9 tag commit inspection, and the verified locked 5.3.3 cache. Fresh runtime acceptance remains a separate unavailable layer, not a structural claim. |
| ICON-001 | P1 | closed | v14 Actor and Item generation still emits placeholder artwork for most embedded Items instead of resolving version-locked, name-appropriate core/dnd5e artwork. | Closed by the opt-in Foundry 14.364 / dnd5e 5.3.3 `safe` resolver, deterministic versioned catalog, external overrides, review reports/gallery, shared CLI/Vault/collection/Intake/Web routing, v12/v13 fail-closed isolation, 1,093-Item corpus audit, real CLI regeneration, zero-missing-path proof, visual review, and cleaned local Foundry import/decode acceptance. |
| ARCH-002 | P2 | closed | Existing Intake Canonical Actor types and a same-layer Canonical Item form now feed one discriminated generation document union before target projection. | Closed by compatibility adapters, exhaustive projector selection, shared mechanics coverage, characterization tests, and anti-overfit success across 169 sources with no Actor/Item/action/stage-name mechanics branch. |
| VER-001 | P0 | closed | `actorVerification` does not validate embedded Active Effects or their source-derived claims. | Verifier summarizes effects and warns on invalid AC clauses/change mismatches; regression proves old Bleeding artifact is rejected and regenerated artifacts pass. |
| INTAKE-001 | P1 | closed | The Legacy plaintext workflow detects zero creatures for ordinary compact Chinese statblocks yet exits successfully, and AI normalization runs only after the failed rule-based split. | AI-first discovery accepts unmarked raw input, deterministic source partitioning prevents truncated statblocks, and Legacy zero-result paths fail closed in CLI and Web. |
| INTAKE-002 | P1 | closed | Adding minimal headings lets the Legacy workflow run but loses or replaces source semantics, including AC, HP, abilities, movement, defenses, senses, languages, traits, and action boundaries. | Evidence-backed IR, deterministic Markdown rendering, CLI generation, semantic comparison, independent AI review, real Lurker acceptance, collection discovery, and ambiguity failure behavior pass. |
| INTAKE-003 | P1 | closed | Prepared cantrips and source-evidenced per-level spell-slot groups now survive AI IR -> deterministic Markdown -> v14/core Actor and portable resolver planning. Pellinost retains Wisdom, caster level 5, native 4/3/2 pools, seven prepared refs plus three cantrips, and pending target-world hydration. | Closed on 2026-07-19 by focused prepared positive/negative tests, locked dnd5e 5.3.3 planner/Cast structure, accepted two-NPC CLI run `.local/intake-runs/2026-07-19T16-29-30-782Z-4bc3d00a`, both verifiers, source-semantic review, independent review remediation, and final `1300 / 1300` aggregate CI. Runtime import remains explicitly excluded and unclaimed. |
| INTAKE-004 | P1 | closed | The Bol'bara workflow now owns source metadata, recognizes source-explicit Chinese material waivers, rejects only real duplicate spellcasting, preserves hybrid reach/range and legendary max/cost/preamble, scopes standalone verification to the IR candidate, preserves creature subtype, and clears unsourced golden-master initiative. | Closed on 2026-07-19 by generalized fixture tests, fresh workflow regeneration, accepted zero-finding Intake/Actor verification, and direct source review of the final eight-ref pending Actor. No final JSON was hand-authored or hand-repaired. |
| VER-002 | P1 | closed | The existing plaintext audit and Actor verifier report no warning for gross source-to-output drift and default-template leakage. | Intake verifier rejects planted AC 20, HP 332, all-10 abilities, merged/lost actions, biography-only traits, unsourced skill automation, false non-attack to-hit, and conflicting explicit AC values; unaccepted JSON is not deliverable. |
| DOC-001 | P0 | closed | v14 source-fidelity and runtime acceptance claims include artifacts contaminated by SEM-001. | Reports preserve the defect chronology, affected actors were regenerated, source-reviewed, runtime-retested, and the copied-world authentication contradiction was amended. |
| GATE-001 | P1 | closed | `antiOverfitAudit.runGitText()` returns an empty string on Git failure, allowing `--all` to report success with zero checked sources. | Shared typed Git execution fails closed; actual non-repository and zero-source CLI probes exit 1; tests cover missing Git and explicit-file independence; real all-audit checks 99 sources. |
| GATE-002 | P1 | closed | Reference verification maps an unreadable Git checkout to generic `mismatch`, hiding safe-directory/access errors. | Status model distinguishes `missing`, `git-error`, `mismatch`, and `ok`; ownership/access diagnostics are actionable; real locked cache reports `ok`. |
| TYPE-001 | P1 | closed | Strict TypeScript baseline had 1,007 errors, including 81 across 20 production files, so type checking could not gate changes. | Production and supported broad typechecks are zero without blanket suppression; real v12/v14 CLI flows and the repaired browser download preserve source semantics. |
| CI-001 | P1 | closed | No CI runs tests, type checks, anti-overfit audit, reference verification, build, or acceptance smoke gates. | A bounded aggregate and Windows CI workflow run deterministic required gates; local YAML/command validation and planted regressions prove fail-closed behavior. |
| COV-001 | P2 | closed | Coverage includes tests and has no threshold, making its headline unsuitable as a regression gate. | Fail-closed LCOV filtering reports 88 production files at 86.92% lines/88.09% functions and enforces attainable 84%/85% floors with subsystem evidence. |
| ART-001 | P2 | closed | Input, generated output, acceptance fixture, historical artifact, and deliverable boundaries are not explicit. | Tracked artifact policy and inventory; every tracked output category has a reason; generated outputs are reproducible or intentionally retained fixtures. |
| ART-002 | P2 | closed | Historical debug and temp files remain tracked despite current ignore intent. | Each file is promoted to a named fixture/tool or removed in a scoped index cleanup; no useful evidence is deleted without replacement. |
| DET-001 | P2 | closed | Optional AI/network behavior is influenced by environment credentials, and deterministic/offline mode is not one uniform, enforced contract across workflows. | Ambient credentials cannot activate Actor/Web translation; explicit modes are observable; provider reasoning is sanitized; CLI/API/browser offline semantics pass. |
| ARCH-001 | P2 | closed | Large multi-responsibility modules increase regression and review risk, especially `actor.ts`, parsers, plaintext ingest, and `App.tsx`. | Measured selection plus two independently committed Actor extractions; six characterization tests; full v12/v14 pre/post CLI structure and semantic controls; 699-test aggregate gate. |
| WEB-001 | P1 if public, P3 if loopback-only | closed | Web API advertises public unauthenticated access while exposing expensive jobs and server-side configured capabilities. | Loopback-only default and explicit authenticated public/proxied mode are implemented, process-tested, browser-tested, and documented without exposing the bearer to browser users. |
| WEB-002 | P1 if proxied | closed | Client identity trusts forwarded headers without a trusted-proxy boundary; in-memory per-IP limiting can be spoofed or collapse clients. | Real socket identity, literal-IP trusted proxy chains, conservative malformed/missing fallback, forged-header tests, and atomic per-client/global windows pass. |
| WEB-003 | P2 | closed | Upload limits are checked after `request.text()` and process-local job/rate state is not a complete public resource-control boundary. | Pre-materialization Content-Length checks plus Bun's 25 MiB ceiling, per-client/global job caps, active-job-safe age/count cleanup, 200-identity abuse probe, and truthful deployment docs pass. |
| DOC-002 | P2 | closed | Acceptance documents previously contained chronology and support-boundary drift across source review, runtime smoke, module compatibility, and delivery checklist. | The canonical current support matrix separates thirteen layers and links dated evidence; three reports carry append-only amendments; README/checklist/ledger agree; current-claim contradiction scan is clean while historical text remains explicitly superseded. |
| PROD-001 | P2 | closed | The CLI-generated modded-v14 Dread Brand effect now survives initial application and is removed by subsequent real MIDI damage in the locked DAE 14.0.12 + MIDI-QOL 14.0.9 stack; the core artifact remains active after the same control damage. | Generalized fixture generated through CLI and exercised in the locked DAE 14.0.12 + MIDI-QOL 14.0.9 runtime with source-to-output review. |
| PROD-002 | P2 | closed | The real Shield passes supported Foundry import, sheet/readback, equipped+attuned AC `10 -> 12 -> 14`, Forceful Bash attack/damage/prone semantics, one-per-dawn Protective Field depletion/concentration semantics, and public `exportToJSON()` round-trip comparison without an operating-system file dialog. | Real source item generated by CLI, imported, opened, exercised, re-exported, and semantically compared; ignored export evidence retained under `.local/foundry-v14/evidence/remediation-m9/`. |
| PROD-003 | P2 | closed | The user-authorized authenticated Chrome crawl completed without exporting credentials; its initially rejected semantic sample was repaired under SEM-006 and SEM-007 and rerun. | In-place Chrome session; no cookie/credential inspection or export; 54 discovered / 37 crawled topics / 47 statblocks / zero pipeline failures; 47 CLI regenerations and 47/47 verifiers; expanded live semantic projections and aggregate gate pass. |
| PROD-004 | P2 | closed | The former acceptance corpus was too narrow to justify broad parser/generalization confidence. | The dated 19-category corpus matrix names real fixtures/tests, target/profile, semantic projection, close/unrelated controls, and outcomes; its focused 148-test run and 738-test aggregate gate pass while runtime/external gaps remain excluded. |
| PROD-005 | P2 | closed | The 2026-07-11 88-ID production snapshot was mistakenly promoted into a current completion blocker after the 2026-07-12 user-directed module cleanup changed the intended state. | Chronology audit preserves the 88-ID reproduction failure as historical evidence, records 79 only as the last verified local baseline, makes no unverified current production-count claim, and requires a fresh inventory plus explicit scope before any future production coexistence audit. Closure is a scope/report correction, not a compatibility Pass. |
| SPELL-001 | P1 | closed | Rat Warlock's AI Intake acceptance was false-green for functional spellcasting: the historical Actor retained prose but had no portable ten-spell resolver manifest, no embedded resolved Spell items, and no pending resolver state. | Closed on 2026-07-19 by the source-evidenced portable manifest, all-or-nothing native hydration/rollback, exact review and idempotency behavior, and real local Foundry 14.364 / dnd5e 5.3.3 use plus module-disable acceptance recorded in `docs/acceptance/2026-07-18-rat-warlock-spell-resolver.md`. |
| MOD-I18N-001 | P2 | deferred | The spell resolver follows Foundry's active client language and ships complete English/Chinese runtime dictionaries, but it has no module-local language selector and its manifest-facing title/functional description are English-only. The same bilingual requirement applies to every future Foundry module. | Complete the acceptance gate in `docs/foundry-module-localization-policy.md`: preferred per-client module-local switch or the documented full localized-artifact fallback, bilingual manifest/release descriptions, equal key coverage, and exact-runtime visual/behavior acceptance in both languages. Deferred by explicit user instruction on 2026-07-19; it does not reopen the completed spell-resolution mechanics. |
| CHAT-MEM-001 | P1 | closed | Foundry 14.364 chat cards can retain an unbounded rendered DOM/media/listener footprint during a long client session. The standalone `chat-memory-guard` module now bounds rendered messages without deleting ChatMessage documents, preserves re-rendered dnd5e/MIDI interactions, releases popout listeners, and enforces OBSERVER/GM-gated identity-avatar replacement. | Closed after the revised plan's automated gates, deterministic package/install safeguards, project-local Foundry recognition, enabled/disabled GM A/B, real re-rendered MIDI action, database non-mutation proof, GM avatar modes, and non-GM `SY` privacy/hidden-mode runtime acceptance all passed. Hidden mode leaves 21/21 cards with no avatar media nodes and zero module thumbnail-cache bytes while preserving sender text. Long-session and full third-party-card coverage remain explicitly user-observed boundaries. |
| SPELL-002 | P1 | in_progress | The first user-run online Rat Warlock hydration reached deterministic Faerie Fire Activity `116c319da6fcfdd2`, observed a public `createItem` cache with the correct Actor/`cachedFor`/Compendium identity, but rejected Foundry's HTML-equivalent `&Reference[...]` to `&amp;Reference[...]` storage normalization in the Spell and source Effect descriptions. The timeout happened before safe cache ownership, so rollback correctly refused to delete the unverified cache and its still-linked Activity. A narrow comparison fix and real local PHB ten-spell regression now pass. | Publish/install the rebuilt module only with user authorization, preserve the failed online Actor until recovery evidence is complete, verify the recovery-required marker before the write, perform one authorized recovery/reimport, prove full rollback cleanup plus retry, repeat ten-spell use and module-disable acceptance on the exact online Babele patch `1.0.89` / MIDI-QOL `14.0.11` stack, and confirm no residual paths remain. Do not close from the local pass or a successful retry alone. |
| SPELL-003 | P1 | in_progress | After the persisted online hydration state became `failed-recovery-required`, explicit re-resolution set an ephemeral `needs_review` state. The public status action and exported diagnostic top-level `status` then reported `needs_review` while `spellResolution.status` still correctly recorded the more severe recovery failure. `readResolverStatus()` now keeps active `resolving` transient but gives persisted recovery-required precedence over later non-active ephemeral review/stale states; focused tests pass. | Ship the same rebuilt module, then verify on the preserved online Actor that header status, report, diagnostic export, review cancel/close, and explicit re-resolution continue to show recovery-required until an authorized recovery actually succeeds. |
| MOD-COMPAT-001 | P1 | closed | Plutonium CN 2.15.6's bundled Quick Insert integration called the absent globals `Omnidexer` and `FoundryOmnidexerUtils`, so index construction threw before Quick Insert could finish. | Closed by a guarded/idempotent exact-source Foundry Lab patch, adjacent upstream backup, focused source-shape tests, and a bounded Foundry 14.364 / dnd5e 5.3.3 / Quick Insert 3.7.7 refresh with zero matching errors and a completed 44-entry `world.and` index. |
| BH-ACT-001 | P1 | closed | The user-owned Blood Hunter 2024 homebrew source provided class/subclass prose but no feature Activity side data; Callum therefore had actionful Blood Hunter features with zero Activities while passive choice features correctly remained display-only. | Closed at the user-authorized artifact boundary by a deterministic local homebrew build containing 4 class, 11 requested-subclass, 42 optional side-data entries and 59 structurally valid Activities; semantic review preserves passive close negatives and states every unautomated boundary. Full import/combat acceptance remains explicitly user-owned and unclaimed. |
| BH-ACT-002 | P1 | closed | The first enrichment modeled Crimson Rite and Blood Maledict as generic damage/single curse Activities, so it did not provide weapon enchantment, per-curse normal/amplified flows, or reliable amplification loss boundaries. | Closed at the authorized code/artifact boundary: deterministic Enchant/normal/amplified/direct-loss structures pass locked-source review, final tests, and a 7-rite/14-optional-curse/3-subclass-curse semantic matrix. Authenticated drag/drop and combat acceptance remains explicitly user-owned and unclaimed. |
| BH-ACT-003 | P1 | in_progress | User runtime acceptance overturned the BH-ACT-002 static closure: save Activities lose their Effect links, Blood Curses do not resolve shared Blood Maledict uses, Crimson Rite enchantments append an empty damage part, direct-loss macros do not reliably reduce HP, legacy DAE expiries remain, mutagens are empty buttons, and the Lycan subclass is omitted. | Implement `docs/superpowers/plans/2026-07-26-blood-hunter-complete-runtime-repair.md`; require exact dnd5e/MIDI/DAE contracts, complete source coverage, post-import DataModel checks, source-semantic review, and representative local runtime evidence before closure. Historical BH-ACT-001/002 evidence remains visible but is not current acceptance. |
| MON-001 | P1 | partial | The v1.1.1 GM module and Windows/Chrome companion auto-relaunch the same dedicated profile after a full Chrome exit, resume only the same active session ID, record browser/renderer generations, and report cold-restart memory deltas. Real Foundry 14.364 / dnd5e 5.3.3 joined-world evidence proved session `f8090595-9e2d-449f-9f23-07d2e61fe93c` across generations 1 and 2 with `refreshCount=1`; production 8080 separately received the public-HTTP SHA-256 fix, and a 2026-07-31 read-only recheck proved the complete 1.1.1 module remains installed and served. | Local implementation, companion-controlled cold-restart acceptance, production installation, and the historical normal module-management activation event are complete. Keep the finding `partial` only for the post-restart 1.1.1 start/mark/stop smoke, the actual four-hour GM/player run, and non-GM device evidence. See `milestones/15-fvtt-session-monitor.md`. |
| SEQ-MEM-001 | P1 | blocked_external | Sequencer 4.2.3 creates seven eager spritesheet WASM Workers on this 16-thread client, accounting for seven fixed 299,958,272-byte private committed regions before queued conversion buffers and other renderer memory. The exact local cap-2 patch is installed and served, but both available browsers currently require a fresh authenticated world login. | Code/disk/HTTP evidence is recorded in `docs/reviews/2026-07-26-sequencer-spritesheet-worker-memory-cap-report.md`: 13 focused and 185 Foundry Lab tests pass, hashes/backup/restore close, and the loopback mirror serves the sentinel. Resume after the user signs into local `/game`; require Canvas/Sequencer readiness, a safe existing WebM trigger, exactly two matching WASM regions, and no new fatal error before advancing. User visual, complex-scene, and long-session acceptance remains separate and unclaimed. |
| WORLD-ASSET-001 | P1 | in_progress | The first unused-scene-image archive used an incomplete runtime dependency model. It missed both (1) Map Image Optimizer outputs loaded by `verifyOutputImages(plan)` on world `ready`, and (2) package-manifest assets such as `world.json.background`, which Foundry loads on `/join` before authentication. Both omissions caused real browser 404s. | The complete move was first rolled back to a known-good baseline, then selectively reapplied. All 351 latest-plan outputs remain in the world, including 93 original candidates; `world.json.background` restored one further original candidate; the other 986 files remain externally archived. Mechanical verification covers current map paths, latest-plan outputs, and the manifest background. Unauthenticated `/join` now renders with zero browser errors after refresh. Close only after an authenticated Chrome world reload runs the real Bridge `ready` preflight with no new archive-caused 404. |

## Progress

### 2026-07-31 Foundry v14 Name-Driven Item Artwork

- [x] User approved the decision-complete v14-only implementation plan.
- [x] Locked product choices: Foundry 14.364 / dnd5e 5.3.3, opt-in `safe` mode, independent override JSON, no feature-level source `icon` field, no aggressive low-confidence guessing, and no third-party runtime icon-module dependency.
- [x] Preserved the current dirty workspace as source of truth. The existing session-monitor, classpack, documentation, image, and Foundry Lab changes are unrelated and must not be overwritten or staged by this milestone.
- [x] Opened `ICON-001` before production code changes.
- [x] Built the versioned metadata-only catalog from public `CompendiumCollection#getIndex()` output plus the installed core/dnd5e icon trees: 7,337 paths, 1,834 Compendium rows, stable SHA-256 `4b8f8c1d9fbcd2589245a489a61f3c5861d81976e64e1cebf7493056fd60aba2` across two rebuilds.
- [x] Implemented deterministic precedence: validated actor/global override, existing catalogued artwork, same-type exact Compendium match, exact spell bridge only for source-structured spell attacks/casts, high-threshold lexical-plus-structured semantic match, then dnd5e type default. Unknown, third-party, remote, traversal, duplicate and target-mismatched overrides fail closed.
- [x] Routed Actor, standalone Item, CLI, scoped/full Vault Sync, monster/item collection, plaintext Actor/Item, AI Intake reuse, and Web jobs through the shared v14 option and separate review-report contract. Web never accepts a browser-supplied override path; stale safe-mode reports are backed up when mode returns to `off`.
- [x] Added CLI `--icon-mode off|safe`, `--icon-overrides`, Web v14-only control, adjacent and aggregate JSON review reports, and a local HTML gallery that references installed artwork without copying it.
- [x] Focused tests cover exact 2024 priority, spell bridge, actor override, high-confidence semantic matching, close negatives, existing artwork, fallback, override validation, catalog integrity, gallery escaping/path mapping, CLI generation/v12 rejection, Web reports, and Vault safe-to-off cleanup.
- [x] Real existing-output audit covered 197 documents and 1,093 Items: 328 exact, 54 preserved existing, 711 safe fallbacks, zero high-confidence semantic claims in this corpus, 77 unique selected paths, and zero unavailable installed paths. Flyby, Multiattack, Sense Magic, Tentacle, Dagger and Eldritch Blast were reviewed positively; Transfer Harm, Entrapping Pod and Psychic Lash remained safe fallbacks.
- [x] The formal Nightgaunt v14/core Actor and sidecar were regenerated through `src/index.ts`; `verify:actor` exited 0. Visual review accepted the wings, multi-weapon strike, claw and Eldritch Blast artwork; generic fallback SVGs remained explicitly generic.
- [x] Foundry 14.364 / dnd5e 5.3.3 imported and prepared the exact formal Nightgaunt Actor. All six Item image requests returned HTTP 200 with correct image MIME types and decoded successfully; three WebPs were 256×256 and the three SVG fallbacks decoded. The temporary Actor was deleted by exact ID, zero same-name Actors remained, the browser closed, the mirror stopped, port 30001 released, and `options.json` restored to `cor-cotn`; production was not accessed.
- [x] Final mechanical gates pass on the completed source: `1575 / 1575` tests with `7443` assertions, both TypeScript checks, production coverage `85.41%` lines / `88.13%` functions, 185-source anti-overfit, 1,868-path hygiene, dnd5e 5.3.3 reference verification, Web build, offline Actor smoke, and diff checking.
- [x] Applied `safe` mode to the latest 11 Netherdeep v14/core Actors through the project CLI. All 11 review-required JSON files and adjacent icon reports were regenerated; `verify:actor` returned zero warnings for all 110 embedded Items. Their existing source-derived GM-assistance findings remain explicit CLI exit `2` and were not misreported as automatically operable mechanics.
- [x] Added 75 actor-scoped artwork corrections in the external override file. The final batch resolves 75 overrides, preserves 3 existing workflow icons, uses 32 locked-Compendium exact matches, and leaves zero type-default fallbacks, unavailable installed paths, or keyed Actor/report icon projection mismatches. Semantic review rejected the first mechanically exact fish `Swarm` result because it displayed a bee, replaced it with fish artwork, and narrowed Nautiloid's `Planar Attunement` selector after it initially collided with the separate selection-pool Item.
- [x] Visual acceptance covered four 12-image override contact sheets plus a 16-image exact-match sheet. Shell/antimagic, resonance/refraction, spikes, undersea plants, ruidium/crystal, blood/water, rays/eyestalks, squid light/veil, planar variants, tentacles and sorrowfish artwork were accepted against the Item names; generated galleries confirmed all 11 reports reference installed Foundry 14.364/dnd5e 5.3.3 assets.

**Closed boundary:** `safe` remains opt-in and v14-only. A fallback is an honest lack of sufficiently strong evidence, not a claim that every feature now has unique bespoke artwork. Third-party module art, remote URLs, production deployment, and future Foundry/dnd5e versions remain outside this closure.

### 2026-07-30 Actor / Item Generation Correctness Foundation

### 2026-07-31 Source-Derived Actor Resource Semantics

- [x] User authorized implementation after manually reviewing the 11 Netherdeep source/JSON pairs and accepting the first resource-foundation group.
- [x] Preserved the current dirty workspace as source of truth and opened `SEM-008` with focused Milestone 16 at `milestones/16-actor-resource-semantics.md`.
- [x] Classified explicit resource contracts as `source-derived` and native uses/consumption/scaling/IDs as `schema-derived`; no creature or action name will infer mechanics.
- [x] Added fixture-backed RED tests, then implemented the strict typed resource parser and canonical mechanic coverage. The meaningful RED was `InvalidField: Unknown field '资源'`; the accepted fixture suite now includes three positive resources, duplicate-ID and incomplete-tier failures, one close prose negative, and one unrelated control.
- [x] Implemented common source semantics with target-compatible v12/dnd5e 4.3.9 and v14/dnd5e 5.3.3 projection plus fail-closed verification. Locked sources confirm `itemUses`, cross-Item IDs, amount scaling, and the `@scaling` value/increase contract in both versions.
- [x] Updated Tainted Shellcreeper, Urchin Spikeshooter, Caelian Sea Snail, and Red Kelp Colony; regenerated eight v12/core and v14/core outputs through `src/index.ts`; all eight standalone Actor verifications exited 0.
- [x] Completed source-semantic review and added real-input assertions for both targets: Tainted 0/2 gain/clear and 1–2 layer force scaling plus AC 11 crack Effect; Urchin 12/12 long-rest Spikes with 1/3/1 costs and exact 12/14/16/18/20 manual AC tiers; Caelian 0/1 gain/clear and three one-point consumers; Red Kelp 0/3 gain/loss, 1–3 layer radius scaling, and bounded three-for-one daily-use recovery.
- [x] Final gates: focused resource suites `15 pass / 0 fail / 138 assertions`; production and all TypeScript checks pass; full bounded suite `1519 pass / 0 fail / 7115 assertions`; anti-overfit `24 sources checked`; dnd5e 5.3.3 reference cache verified; direct locked 4.3.9/5.3.3 source review completed; `git diff --check` reported no whitespace errors.

**Current boundary:** `superpowers:executing-plans` is named by this ExecPlan but is not installed in the current session. Work continues under this checked-in milestone and the same TDD, anti-overfit, workflow-generation and semantic-acceptance gates; no skill use is claimed.

**Runtime closure (2026-07-31):** all four v14/core Actors were imported into the disposable local mirror. Fixed spend, variable spend/scaling, bounded gain and the three-for-one bounded recovery transaction passed. Manual AC application initially failed semantically: the Effect was present but `initial`-phase `ac.flat` left natural AC at 20. Locked Foundry 14.364/dnd5e 5.3.3 inspection and a live control proved that a `final`-phase `system.attributes.ac.value` override produces AC 18. The target-specific generalized repair was fixture-tested, regenerated through the CLI, reimported and applied from the ordinary chat Effect card. Temporary runtime documents were removed, options restored to `cor-cotn`, and the local server stopped.

### 2026-07-31 Netherdeep Actor Behavior Semantics

- [x] Completed Milestones 17-19 with strict `行为机制` v1 parsing into `ParsedNPC.behaviorSemantics`; activity relations, lifecycle operations, triggers, one-shot/permanent stages, capacity, choice pools, areas and external rules reject invalid, duplicate, ambiguous and dangling references instead of silently degrading to prose.
- [x] Bumped the canonical-mechanics manifest to schema 2 and separated expression coverage (`structured`, `literal`, `missing`) from execution mode (`automatic`, `core-operable`, `gm-assisted`, `external-rule`). Resource contracts remain responsible only for counters, bounds, costs, recovery and scaling.
- [x] Migrated all 11 real Netherdeep Markdown sources and regenerated 11 v12/core plus 11 v14/core Actor JSON files only through `src/index.ts`. All 22 standalone `verify:actor` runs exited 0 while retaining intentional `needs_review` findings for assisted and external-rule mechanics.
- [x] Added generalized fixture and real-corpus regressions with positive, close-negative and unrelated controls. No creature, activity or state name is used as a mechanics branch; `bun run audit:anti-overfit:all` passes across 179 source files.
- [x] Runtime review rejected the first selected-target projection because helper actions such as Remove Spikes and Nightmare Breath rescue targeted `self`. The generalized projector now derives the Activity target from the referenced state, preserves true self operations, and fails closed when one operation mixes self and selected targets.
- [x] Manual review rejected Sorrowfish's initial walk-only speed change because the source halves every movement mode. The incomplete native change was removed; the truthful GM-assisted operation now instructs the GM to halve all current movement modes and restore them on removal.
- [x] The clause-to-contract-to-JSON-to-mode matrix covers every one of the 11 Actors, including bilingual names, values, targeting, distance, duration, triggers, removal, costs, recovery and Ruidium DC/result text. See `docs/reviews/2026-07-31-netherdeep-monster-manual-semantic-audit.md`.
- [x] Local Foundry 14.364 / dnd5e 5.3.3 imported all 11 v14 Actors and exercised one-shot AC, next-hit markers, Shell Defense/Emerge, cracked AC, target conditions/removal, suppression, permanent half-HP phase, two-slot capacity, three-distinct attunements/reset, two-stage petrification, 60×15-foot ray and 20-foot circle templates, and every GM-assisted/external-rule entry point. Cleanup removed 11 Actors, 11 Tokens, 23 messages and 2 templates, restored `cor-cotn`, stopped the mirror and released port 30001; production was not accessed.
- [x] Final mechanical gates pass: focused behavior `35 / 35` with `236` assertions; full bounded suite `1554 / 1554` with `7353` assertions; coverage `85.30%` lines / `88.18%` functions; both TypeScript checks; 179-source anti-overfit; 1844-path hygiene; dnd5e 5.3.3 reference verification; Web build; offline Actor smoke; and `git diff --check`.

**Closed boundary:** v14/core has direct local runtime evidence. v12/core has schema, structure, source-semantic and verifier evidence but no fresh controlled v12 runtime claim. Cross-Actor actual-damage transfer, forced attacks, actual-damage healing/max-HP changes, automatic environmental/event listeners and per-hit attunement consumption remain explicitly GM-assisted; Ruidium Corruption remains an external rule with exact source trigger, DC and result text.

- [x] User explicitly authorized the complete correctness-foundation implementation plan, including code, tests, documentation, generated workflow outputs, and this ledger.
- [x] Preserved the current workspace as source of truth: `master` at `f68b733`, with only unrelated untracked `.pui/`; no clean worktree or production Foundry action is authorized.
- [x] Opened `GEN-001`, `ITEM-001`, `VER-003`, `TARGET-001`, and `ARCH-002`, and created focused Milestone 14 at `milestones/14-actor-item-generation-correctness-foundation.md`.
- [x] Established fixture-backed RED evidence before production edits: the first focused run produced `30 pass / 12 fail / 1 syntax error`; after correcting only the malformed test key, the expected semantic failures remained in spell-attack classification, save outcomes, embedded-effect projection, and stable Activity IDs.
- [x] Completed the first RED/GREEN correctness slice: English `msak`/`rsak`, explicit save outcomes, stable 16-character Activity IDs with collision rejection, and source-derived embedded-effect projection/linking now pass `42 / 42` focused tests with `114` assertions, including 10,000 generated child IDs and close negatives.
- [x] Implemented the semantic fixes, shared `CanonicalGenerationDocument` contract and compatibility adapters, independent dnd5e 4.3.9/5.3.3 projectors, typed diagnostics/mechanics coverage, module-profile isolation, and fail-closed workflow gating.
- [x] Routed Actor, Item, single-file, collection, Vault Sync, CLI, AI Intake reuse, and Web jobs through the shared projection/verification path; compatibility wrappers retain legacy warning surfaces for one cycle.
- [x] Restored the frozen-lockfile `sharp` dependency with `bun install --frozen-lockfile`; no dependency version or lockfile change was introduced.
- [x] Regenerated Oregg, Shield, and unrelated Jewel controls for v12/core and v14/core only through `src/index.ts` under `obsidian/dnd数据转fvttjson/output/correctness-foundation`.
- [x] Completed source-semantic review: Oregg Firebolt is stable-ID `rsak`, 120 ft., `2d10` fire for both targets; Poison Spray is 10 ft., `2d12` poison and v14 `onSave: none`; Shield retains equipment/armor, Forceful Bash/prone linkage and Protective Field reaction/dawn/concentration mechanics; Jewel retains three source-derived stages and source `3` uses without stage-name or `3/5/7` inference.
- [x] Generalization checks include multiple spell-attack positives, a weapon close negative, an unrelated Actor; explicit half/none/failed-only/literal saves; embedded-effect positive/non-application negative; Wriggly movement-cost close negative and Body Shield source reaction-cost positive.
- [x] Focused generator/validator/intake/Web tests pass, both TypeScript checks pass, and the second full repository run reached `1464 pass / 15 fail` before the final reaction-cost repair. Fourteen failures are isolated to the absent project-local Foundry `classic-level` dependency; the one current-code failure was repaired and its focused regression now passes.
- [x] Ran the final mechanical gates. Both TypeScript checks, coverage threshold verification (`85.83%` lines / `89.43%` functions), 169-source anti-overfit, 1,822-path hygiene, exact dnd5e 5.3.3 reference verification, Web build, offline Actor smoke, and `git diff --check` pass.
- [x] Final aggregate test execution reached `1465 pass / 14 fail` with `6,791` assertions. Every failure requires the absent `.local/foundry-v14/app/14.364/node_modules/classic-level/index.js`; no current Actor/Item correctness test fails.
- [x] Available Foundry Lab execution reached `176 pass / 9 fail`; all nine failures require the same absent ClassicLevel/runtime path. No fresh Foundry import, DataModel preparation, behavior, or export-readback Pass is claimed.
- [x] Landed four local, scope-separated commits without staging `.pui/`: generator correctness `c3eb1d3`, canonical projection/verification `4bbfec7`, shared entry-point gating `6064025`, and migration/support documentation `95375c2`. No remote push or production operation was performed.

**Discovery:** The instructed runtime paths `.local/foundry-v14/app/14.364/main.js`, `.local/foundry-v14/app/14.364/node_modules/classic-level/index.js`, and `.local/foundry-v14/data/server-mirror` are absent in this checkout. Therefore this milestone ran structural and non-runtime Lab gates but could not add fresh Foundry 14.364 import/DataModel/export evidence. Historical runtime reports remain bounded evidence only.

**Exact next action:** If fresh runtime evidence is desired, restore the project-local Foundry 14.364 application/server mirror and rerun the 14 external-dependent tests plus representative Oregg/Shield import, DataModel preparation, use, and export readback. This is a follow-up evidence task; the correctness-foundation code milestone is closed.

### 2026-07-29 Remaining Branch Integration
### 2026-07-29 FVTT Session Monitor

- [x] Confirmed the product decisions: GM-only v1, compact floating controls,
  IndexedDB continuation, a Windows/Chrome companion in the same delivery, and
  no player-to-GM socket aggregation.
- [x] Re-read the locked Foundry 14.364, dnd5e 5.3.3, MIDI-QOL 14.0.11,
  Sequencer 4.2.3, Chat Memory Guard build/install, prior controlled sampling,
  and current four-hour acceptance boundaries.
- [x] Created focused implementation plan
  `milestones/15-fvtt-session-monitor.md` and moved `MON-001` to
  `in_progress` before changing production code.
  - [x] Implemented and documented the GM module, IndexedDB continuation,
    privacy-safe schema, dedicated Chrome/CDP companion, Windows process/native
    allocation sampler, JSONL merge, Markdown/SVG report, deterministic build,
    exact local install, and backup path.
  - [x] Focused tests passed `12 / 12` with `53` assertions; both typechecks
    passed; two builds
    produced the same ZIP SHA-256
    `7263ed2066b546f8a4d40fa68ad1c568e25ee6e772cfb9cb739791b4920af57d`;
    reinstall created
    `.local/foundry-v14/backups/fvtt-session-monitor/1.1.0-1785321428266`.
  - [x] Full `bun run ci:verify` passed `1476 / 1476` tests and `6,881`
    expectations plus coverage,
    anti-overfit, hygiene, locked reference verification, Web build, and
    offline Actor smoke. A preceding run timed out only the existing crawl CLI
    test at 60 seconds; its isolated `5 / 5` rerun and the clean full rerun
    passed.
  - [x] Real local Foundry 14.364 / dnd5e 5.3.3 GM smoke passed:
    eight samples, manual jank marker, same session across one refresh,
    sanitized planted error, stopped export, `refreshCount=1`, and no planted
    value, world key, or raw alias maps in the export.
  - [x] Real dedicated headless Chrome companion probe captured heap,
    36 Performance metrics, separate Chrome process groups, renderer private
    bytes, and a completed Windows native allocation scan. The disposable
    world's module selection and all launched processes were restored/stopped.
  - [x] Added Chrome ownership/relaunch supervision, browser and renderer
    generations, lifecycle JSONL, same-session enforcement, login waiting, and
    cold-restart deltas in Markdown/SVG. A real Chrome process-exit integration
    test covers the complete generation-1 to generation-2 path.
  - [x] Real joined-world acceptance first rejected the implementation because
    the module API was attached before IndexedDB recovery and could expose a
    transient idle state. API attachment now occurs only after recovery.
  - [x] Captured and inspected the companion-controlled joined session
    `f8090595-9e2d-449f-9f23-07d2e61fe93c`: same ID across browser generations
    `1,2`, `refreshCount=1`, two browser and two companion samples, all four
    expected Chrome lifecycle events, 100% companion coverage, and an
    intelligible cold-restart delta in JSON/Markdown/SVG.
  - [x] Restored the disposable world to exactly four enabled modules
    (`dnd5e_classpack`, DAE, libWrapper, socketlib); monitor, MIDI-QOL, and
    Sequencer are disabled. Stopped all acceptance Chrome processes and local
    Foundry, and confirmed port 30001 is closed.
  - [x] Production 8080 installation and normal module-management activation
    were separately authorized and completed. The first public-HTTP start
    rejected 1.1.0 because `crypto.subtle` was unavailable; 1.1.1 uses the
    browser-safe pure SHA-256 and passes `13 / 13` focused tests with `56`
    assertions. A 2026-07-31 read-only recheck proved the five-file 1.1.1
    module remains installed and served by 8080 without touching 51020.
  - [ ] Post-restart 1.1.1 start/mark/stop, the real four-hour session, and
    non-GM device evidence remain open. Current deployment/HTTP evidence does
    not substitute for those runtime layers.


- [x] Refreshed `origin/master` and audited every local/remote branch plus every attached worktree before integration. The clean branch tips not already reachable from `master` were `codex/item-generation-workflow-repair`, `codex/actor-refactor`, and `codex/crawlee-goddessfantasy`; `codex/goddessfantasy-image-assets-workbench` was an alias of the crawl tip.
- [x] Preserved the dirty detached worktree and the dirty `codex/npc-monster-workflow-repair` worktree byte-for-byte. Their uncommitted user-owned changes were not staged, copied, reset, or represented as branch content.
- [x] Merged the Item branch with an explicit merge commit while keeping the newer v12/v14 parser and generator already on `master`. The retained contribution adds `--ingest-items-json`, the default `middle/items` split path, scoped promotion to `input/items`, and final workflow-generated JSON under `output/items`.
- [x] Pre-landing review found that the historical Item workflow would synchronize the whole vault and could regenerate unrelated Actors or mark unrelated manifest outputs stale. Added `includeInputPaths` partial-sync semantics and a regression proving an unrelated Actor input/output remains untouched.
- [x] Recorded `codex/actor-refactor` and `codex/crawlee-goddessfantasy` with explicit `ours` merge commits because their actual code is superseded by the current actor-refactor-v2/semantic fixes and the clean/hardened crawl implementation. No historical encoded Actor modules, authenticated crawl HTML, sync manifests, generated JSON, or local Web artifacts were restored.
- [x] Focused Item/parser/workflow/CLI tests pass `61 / 61`; both TypeScript checks and the anti-overfit audit pass. A real four-Item source collection generated through the CLI for Foundry `14.361` / dnd5e `5.3.3`; direct semantic inspection confirmed equipment type, `legendary`/`veryRare`, required attunement, cast/save/utility/attack activity routing, and Shield damage formula `2d6+2+@mod`.
- [x] Final integration-candidate verification passes `ci:verify` with `1,452 / 1,452` tests and `6,792` expectations, production coverage `86.14%` lines / `89.72%` functions, 169-source anti-overfit, 1,822-path hygiene, locked dnd5e `5.3.3` reference verification, Web build, and offline Actor smoke. Foundry Lab passes `185 / 185` with `1,114` expectations; Chat Memory Guard passes `26 / 26` with `70` expectations.
- [x] Fast-forwarded the verified candidate to local `master` at `014fb16730e9fab984dee3fd7155c020fc58ea4b`, reran the complete master gate with the same passing counts, fetched and proved `origin/master` remained an ancestor, then pushed only `master` without force. The integration SHA was published as `origin/master`; no feature branch or dirty worktree was deleted.

### 2026-07-27 Unused Scene Image External Archive

- [x] User authorized moving no-longer-used `cor-cotn` scene images out of the world package while preserving their complete world-relative subdirectory structure inside one external archive folder.
- [x] Fixed the archive boundary at `.local/foundry-v14/archives/cor-cotn-unused-scene-images-20260727`, outside `server-mirror/Data/worlds/cor-cotn` so future world-package synchronization does not carry the archived bytes.
- [x] Confirmed project-local port 30001 was already stopped, copied the world without opening its LevelDB, and proved the pre-read source/snapshot trees were identical: 2,886 files, 2,423,058,276 bytes, SHA-256 `4cb7de9bd9f9855deb01b36801b51af8b674dbded167873b33b4a302ee32e7e5`.
- [x] Read only the copied LevelDB, excluded MIO setting-history `oldPath/newPath` strings from current-use evidence, and protected current Scene/Level/Tile fields plus other world-document and world-compendium asset references. The current scan found 400 world-relative runtime map-reference occurrences across 358 distinct paths.
- [x] Moved 1,080 unreferenced raster scene images (1,733,210,505 bytes) into the external archive. `manifest.json` records every preserved world-relative path, size, SHA-256, reason, source path, archive path, and rollback destination.
- [x] Independently verified all 1,080 archive hashes and preserved paths with zero failures, confirmed a second dry-run has zero remaining candidates, and proved the world decreased exactly from 2,423,058,276 to 689,847,771 bytes.
- [x] Restarted only `server-mirror`: PID 7144 listens on `127.0.0.1:30001`, HTTP returns 200, `cor-cotn` reaches `Launching World | Complete`, and all 356 distinct currently existing world-local map paths return HTTP 200.
- [x] Recorded two pre-existing missing Level backgrounds (`uploaded-chat-media/Urzin_by_Kent_Davis.webp` and `Exandria_-_Speculative-min.png`). They did not intersect the archive candidates and were not caused or repaired by this move.
- [x] User runtime acceptance rejected the archive: the client emitted many real 404s, including `scenes/Xhorhas_Bazzoxan_BetrayersRise_AbandonedChamber.__mio_v1_balanced_392x343_q88_8f44d513.webp`, which the manifest proved had been moved.
- [x] Root cause confirmed in the exact installed bridge: world `ready` auto-discovers the latest MIO plan; `loadPlan()` calls `verifyOutputImages(plan)`; that function creates an `Image()` for every plan output. These plan/run paths are live module dependencies, not passive audit history.
- [x] Stopped only verified loopback `server-mirror`, restored all 1,080 files and 1,733,210,505 bytes to their exact world-relative paths, and rechecked every restored SHA-256 with zero failures.
- [x] Restarted `server-mirror` as PID 29836 on `127.0.0.1:30001`; the world reached `Launching World | Complete`, root HTTP returned 200, the user-reported URL returned 200, and all 1,080 restored paths passed HTTP HEAD.
- [x] Continued from the rollback baseline instead of abandoning the archive: protected the exact 351 outputs loaded by the latest MIO plan, of which 93 had been in the original archive, and selectively re-archived the remaining 987 files (1,708,197,907 bytes).
- [x] Verified the selective archive with zero hash/path failures; all 351 latest-plan outputs and all 356 pre-existing current map paths were combined into 449 distinct URLs, and 449/449 returned HTTP success. The user-reported `AbandonedChamber.__mio...webp` is protected and returns 200.
- [x] User `/join` acceptance then exposed a second omitted dependency: `world.json.background` references `scenes/The_Creation_of_the_Dragons_-_Ameera.jpg`, so Foundry requests it before authentication. Restored that exact 275,705-byte file with SHA-256 `804299af409a0c6786b5be91d95ddbda15e14c1bb983b8ded61805992f4e9278`; 986 files and 1,707,922,202 bytes remain outside `server-mirror`.
- [x] Refreshed the existing Chrome `/join` page after restoration. The real page rendered the world title, join form, details, and description; the new browser error log contained zero entries. This closes the unauthenticated join-page gate, not the authenticated world/Bridge gate.
- [ ] Complete the final semantic gate after the user signs back into the existing Chrome `/join` page: reload the world with Bridge enabled and confirm no new archive-caused image 404s in the real client Console/network stream.

### 2026-07-27 Sequencer Spritesheet Worker Memory Cap

- [x] Reviewed the proposed plan against root instructions, the current dirty worktree, the project-local Foundry Lab boundary, and the real Sequencer 4.2.3 installation.
- [x] Confirmed the unique target bundle is `SpritesheetGenerator-Dw7_9Yk1.js`, the upstream worker formula has the planned shape, and its pre-patch SHA-256 is `8F907DBBFC0611D3EBC2D1456C118A74041A7492753AFDE5EA96F303D77CFB68`.
- [x] Accepted the narrow architecture: exact version/source-shape gates, dry-run by default, adjacent non-overwriting backup, explicit restore, and no production or world-data mutation.
- [x] Implemented the patcher, CLI command, exact version/path/source gates, non-overwriting backup, atomic replacement, explicit restore, and two-worker queue regressions.
- [x] Passed the focused suite (`13 / 13`, 42 assertions), Foundry Lab (`185 / 185`, 1114 assertions), `typecheck:all`, `git diff --check`, real dry-run, apply, and restore dry-run.
- [x] Applied the project-local patch: backup SHA-256 `8F907DBBFC0611D3EBC2D1456C118A74041A7492753AFDE5EA96F303D77CFB68`; patched SHA-256 `08540669C22A5DE4986F515716E9BECB3BC1833A04C5E0832E6F11CB8B7799B0`.
- [x] Restarted only `server-mirror`; PID `43672` listens on `127.0.0.1:30001`, HTTP returns 200, options retain `cor-cotn`, and the served bundle has the exact patch hash/sentinel.
- [x] Reconciled the previously split local-optimization documentation: the optimization log now records the 771 -> 555 Actor audit deletion, subsequent user cleanup to 516, Journal/Scene reductions, selective map downscaling/restoration, module/settings changes, and the exact `Data/worlds` versus `Data/modules` synchronization boundary.
- [ ] Resume runtime acceptance after the user authenticates the local GM session. Both available browsers currently redirect `/game` to `/join`; no password-store access or LevelDB bypass is authorized.
- [ ] Confirm Canvas/Sequencer readiness, trigger one existing safe persistent non-tiled WebM, observe 30 seconds without a new fatal error, and record exactly two 299,958,272-byte renderer regions before advancing `SEQ-MEM-001`.
- [ ] Keep user-owned multi-animation visuals, first-load latency, scene-return behavior, full combat, and long-session stability explicitly open after the bounded Codex smoke.

### 2026-07-26 Chat Memory Guard

- [x] Reviewed the proposed plan against locked Foundry 14.364 and dnd5e 5.3.3 sources before implementation.
- [x] Corrected three false assumptions before code: Core/dnd5e avatar Hook order, asynchronous animated DOM deletion after `deleteMessage()`, and the conflict between an enabled-only smoke and an enabled/disabled comparison deliverable.
- [x] User approved the revised architecture and acceptance boundary.
- [x] Implemented the standalone module through RED/GREEN tests, including bounded bottom-only DOM trimming, pending-removal convergence, privacy-safe avatar policy, bounded thumbnail caching, settings, diagnostics, deterministic packaging, and safe local installation.
- [x] Real GM loading overturned two static false-greens: the entrypoint required `game` too early and therefore never registered init/ready, and closed chat popouts retained their observer/listener. Both now have RED/GREEN regressions and pass exact Foundry 14.364 reload plus `closeChatLog` listener-count acceptance (`1 -> 2 -> 1`).
- [x] The first Chinese UI check exposed the world language-code mismatch (`cn` versus manifest-only `zh-CN`). The manifest now maps both codes to the same complete dictionary; after a server restart, the menu and full settings form render in Chinese.
- [x] Mechanical verification passes on the final source: focused module 26/26 (70 assertions), Foundry Lab 172/172 (1072 assertions), full repo 1421/1421 (6659 assertions), both TypeScript checks, `ci:verify`, Web build, anti-overfit, repository hygiene, and Actor smoke. One intervening full run hit two unrelated Crawlee temp-lock timeouts; the targeted API 28/28, full 1421/1421 rerun, and final CI all pass.
- [x] Rebuilt the final package twice with stable SHA-256 `807A40FE488F6FB2D60615B693A5EE0D0A36F754F07BB1C655C23A3F22850C6F` and safely reinstalled it into the project-local server mirror.
- [x] Authenticated GM A/B passes: disabled history reaches 50 DOM cards with zero trims; enabled while reading stays at 50; bottom convergence reaches 40; a trimmed message reloads; sidebar/popout both converge to 40 with the same final message.
- [x] A re-rendered 21-hour-old MIDI save card produced a real `1d20 = 16` result linked by `originatingMessage`; the pre-existing 510-message ID/content/speaker fingerprint remains byte-identical and the database contains only that one additional test roll.
- [x] GM avatar behavior passes token-thumbnail, hidden-with-sender-preserved, system-original, default restoration, cache, and diagnostics checks.
- [x] Recorded the evidence and explicit acceptance boundary in `docs/acceptance/chat-memory-guard-runtime-report.zh-CN.md`.
- [x] Completed the non-GM avatar/privacy check with the passwordless player `SY`: 17 sampled no-OBSERVER Actor cards retained Foundry/dnd5e system avatars rather than receiving module token Blob replacements, while an OBSERVER-authorized card did receive the bounded token thumbnail. Hidden mode removed avatar media from 21/21 rendered cards, preserved 21/21 sender labels, and reduced module thumbnail cache entries/estimated bytes to `0 / 0`; client defaults and the ready GM session were restored. Long-session and full third-party-card coverage remain user-observed boundaries.

### 2026-07-26 Blood Hunter Complete Runtime Repair

- [x] Saved the approved implementation plan at `docs/superpowers/plans/2026-07-26-blood-hunter-complete-runtime-repair.md`.
- [x] Reopened the rejected runtime semantics as `BH-ACT-003` without rewriting the historical BH-ACT-001/002 closure evidence.
- [x] Confirmed the systemic failures against the generated artifact and locked dnd5e 5.3.3, MIDI-QOL 14.0.11, and DAE 14.0.12 sources.
- [x] Replaced the false-green fixture contracts with RED/GREEN tests for Damage-type loss, identifier consumption, effect references, v14 duration, enchantment damage, all 21 mutagens, four subclasses, and lifecycle hooks.
- [x] Repaired the generator and regenerated the artifact twice with stable SHA-256 `3526E4F2F28A81052843D0FFE71FCCA54F49015E2AB5037F7F1DA7423BE6FB65`.
- [x] Recorded the full coverage and semantic boundary in `docs/reviews/2026-07-26-blood-hunter-complete-runtime-repair-report.md`: 94 source features, 0 missing, 117 Activities.
- [x] Ran the bounded local Foundry smoke with temporary Actors/weapons only: identifier remap, effect references, enchant damage, rite replacement/rest cleanup, direct HP loss, MIDI damage neutralization, and fail-closed behavior pass.
- [x] Mechanical verification passes: Blood Hunter 15/15 (497 assertions), Foundry Lab 172/172 (1072 assertions), full repo 1382/1382 (6547 assertions), both TypeScript checks, Web build, and anti-overfit.
- [ ] User re-import, Callum migration, full UI/gameplay semantics, and online synchronization remain explicitly user-owned; keep `BH-ACT-003` open until that acceptance is reported.

### 2026-07-26 Blood Hunter Enchantment and Amplification

- [x] Recorded the approved implementation plan at `docs/superpowers/plans/2026-07-25-blood-hunter-enchantment-and-amplification.md`.
- [x] Reopened the semantic gap as `BH-ACT-002` without rewriting the historical `BH-ACT-001` closure evidence.
- [x] Confirmed from local locked sources that dnd5e 5.3.3 supports Enchant Activities and activity-targeted enchantment changes, MIDI-QOL 14.0.11 supports Activity Macro plus triggered Activity links, and DAE 14.0.12 supports `shortRest`.
- [x] Added two RED/GREEN cycles for the feature structures and exact module lock; the final focused suite passes 13 tests / 304 expectations.
- [x] Regenerated the real artifact twice through Foundry Lab with identical SHA-256 `33EAF23EB37C531342AF3E6DAF99BB24B057B7A42CD3F2AF3AFBC8EB8E064B50`.
- [x] Final mechanical checks pass: Foundry Lab 170/170, production/all TypeScript, scoped anti-overfit, Web build, and full repository 1380/1380 with 6354 expectations at bounded concurrency 2. The concurrency-4 run's post-test Bun 1.3.8 crash is preserved rather than counted as a pass.
- [x] Final artifact semantic matrix checks 7 rites, 14 optional Blood Curses, and 3 same-name subclass Blood Curses with zero errors; exact automation/manual boundaries are recorded in `docs/reviews/2026-07-26-blood-hunter-enchantment-amplification-report.md`.
- [x] HTTP serving and the Foundry 14.364 join page pass. Authenticated Actor/weapon/combat smoke could not run without a GM session, so no Actor or world data was changed and final gameplay acceptance remains with the user.

### 2026-07-25 Plutonium Quick Insert and Blood Hunter Activities

- [x] Opened child plan `docs/remediation/2026-07-15-project-hardening/milestones/13-plutonium-blood-hunter-activities.md` before production edits.
- [x] Read-only runtime inspection isolated the Plutonium/Quick Insert failure to missing bundle globals and separated it from a transient homebrew network fetch.
- [x] Read-only pack/Actor inspection established the acceptance boundary: active Blood Hunter features need Activities; passive/choice features must not receive invented actions.
- [x] Implemented guarded TDD repairs and generated the local enriched homebrew artifact without touching the world, pack, or Actor.
- [x] Foundry Lab `164 / 164`, both TypeScript checks, scoped anti-overfit, the real artifact's zero-finding structure audit, live HTTP `200`, and one short Chrome refresh pass.
- [x] Full Blood Hunter import/combat verification remains reserved for the user and is not included in the closure claim.

### 2026-07-19 Prepared NPC Spellcasting Intake

- [x] Reproduced the user-supplied two-NPC Intake through the formal CLI. Discovery found exactly two creatures, but both remained `needs_review`; Bol'bara was blocked by evidence/representation ambiguities, and Pellinost retained only three cantrips because prepared slot groups are outside the current contract. No Markdown or Actor was promoted as a deliverable.
- [x] Traced the prepared-caster loss across the complete path: provider prompt and canonical IR allow only `at-will` / `1/day-each`; validator/renderer convert those only to `at-will` / `innate`; planner and Cast builder reject `prepared`; Actor reset forces every spell pool to zero.
- [x] Verified the intended native target against the locked dnd5e `5.3.3` source. The shipped Priest stores `spell1=4`, `spell2=3`, and `spell3=2`; native Cast Activities with `consumption.spellSlot=true` decrement the matching Actor pool.
- [x] Completed the focused TDD plan and real workflow. Accepted run `.local/intake-runs/2026-07-19T16-29-30-782Z-4bc3d00a` promoted exactly two v14/core Actors; Pellinost retains Wisdom, caster level 5, 4/3/2 slots, three cantrips and seven prepared refs; both standalone verifiers and direct source-semantic assertions pass. Runtime remains deliberately untested.

### 2026-07-19 Bol'bara Intake Fidelity

- [x] Audited the failed bundle and rejected direct resume. `source.txt` is 1,771 UTF-16 code units, while the repaired Bol'bara IR incorrectly records 2,111; current decisions cannot repair deterministic findings and some candidates are type-incompatible with their target paths.
- [x] Classified the source-backed representation choices: the repository's established hybrid-weapon convention is `mwak` while preserving reach and thrown range; conditional legendary availability must remain literal rather than becoming always-on automation; ambiguous `1次/每日` requires an explicit per-creature 1/day-each decision.
- [x] Added generalized RED/GREEN coverage and reran through the supported CLI. Bol'bara preserves the Chinese material waiver, 5-foot reach plus 20/60 thrown range, conditional two-action legendary preamble, action costs 1/2, subtype, conditional AC note, and eight source-backed pending refs. The final Actor has no embedded Spell/Cast/destination UUID and no unsourced initiative bonus.

### 2026-07-19 Two-NPC Intake Final Acceptance

- [x] Formal CLI run `.local/intake-runs/2026-07-19T16-29-30-782Z-4bc3d00a` ended `succeeded` with exactly two accepted candidates. Final Markdown/JSON was promoted only by the workflow; target-conflict replacement decisions applied only to earlier task-generated versions of those same four artifacts.
- [x] `verify:intake` accepted Bol'bara and Pellinost with zero findings after the standalone command learned the IR coverage range; `verify:actor` exited 0 with zero warnings for both. Machine and Markdown reports are under `.local/final-verification/`.
- [x] Controller source review rejected an intermediate mechanically green result that leaked golden-master initiative and dropped `地精类` / `任意种族`; generalized fixes plus CLI regeneration now preserve both custom types and leave the absent initiative bonus empty.
- [x] Final semantic assertions pass for Bol'bara AC/HP/CR/PB, conditional AC, traits, Dagger reach/ranges/damage, Eldritch Blast, legendary resource/preamble/costs, 4 at-will plus 4 independent daily refs, and no invented Zone save ability. Pellinost passes AC/HP/CR/PB, Medicine/Persuasion/Religion totals 7/3/5, Wisdom caster level 5, slots 4/3/2, Divine Eminence, Mace, right-hand prosthetic note, 3 cantrips plus 7 prepared refs.
- [x] Both Actors target Foundry `14.361` / dnd5e `5.3.3`, carry only the resolver namespace, remain `pending`, and contain zero Spell items and zero Cast Activities. Final hashes: Bol'bara Markdown `810c74503abd3646eb80d76eb693f3137e6bb65090d353b42e00b3d808a5ac7e`, JSON `9be7f3b0704a6c422845ce6221353f7907f705fd1465dfbfddb0d2225e7bd6c0`; Pellinost Markdown `d1af9ba81a35fd2b300a85e2da16a192ced061bf8eaca98cb396efc219b1f18c`, JSON `1b11317cbfb811812e2e7d9ed41d3b1edc3b79ed7a7ec838286c6296ed44c623`.
- [x] Final `bun run ci:verify` exited 0: `1300 pass / 0 fail` with `5159` assertions, coverage gate, 145-source anti-overfit audit, repository hygiene, locked dnd5e 5.3.3 reference verification, Web build, and offline Actor smoke. Local Foundry/runtime import and production operations were not run by explicit user instruction.

### 2026-07-19 Spell Resolver Task 1 Execution Note

The following pre-edit baseline was captured before Task 1 edited any project file. The `.ruler/AGENTS.md` and `AGENTS.md` diffs contain user-owned local Foundry/hardening routing hunks. They must remain byte-for-byte intact except for the later appended resolver hard gate; the BaileyWiki guide and crawl directory remain unrelated and untouched.

```text
git status --short
 M .ruler/AGENTS.md
 M AGENTS.md
?? docs/baileywiki-mass-edit-guide.zh-CN.md
?? "obsidian/dnd\346\225\260\346\215\256\350\275\254fvttjson/crawls/"
```

```diff
git diff -- .ruler/AGENTS.md AGENTS.md
@@ -27,6 +27,13 @@
 +## Long-Running Project Hardening Program
 +
 +- For the remediation program started on 2026-07-15, read and maintain `docs/remediation/2026-07-15-project-hardening/EXECPLAN.md` before changing code.
 +- Treat that ExecPlan as the authoritative finding ledger, progress record, decision log, evidence index, and cross-session recovery document. Chat summaries, Goal text, memories, and checkpoints are supporting context only.
 +- At every stopping point, update the ExecPlan's progress, discoveries, decisions, finding states, verification evidence, and exact remaining work.
 +- Do not close a finding until both mechanical verification and semantic acceptance are recorded. Continue to the next authorized milestone without asking for a generic next step; pause only for a material product choice, new authority, irreversible action, credentials, or an external-state dependency.
 +
@@ -105,6 +112,15 @@ For module-integrated JSON, "tests pass", "JSON parses", and "generated successf
 +- Local Foundry v14 application root: `.local/foundry-v14/app/14.364`.
 +- Local Foundry v14 server entry: `.local/foundry-v14/app/14.364/main.js`.
 +- Local Foundry v14 test data path: `.local/foundry-v14/data/server-mirror`.
 +- Local Foundry v14 test modules: `.local/foundry-v14/data/server-mirror/Data/modules`.
 +- Local Foundry v14 test systems: `.local/foundry-v14/data/server-mirror/Data/systems`.
 +- Local Foundry v14 test worlds: `.local/foundry-v14/data/server-mirror/Data/worlds`.
 +- For local Foundry runtime or module work, use the project-local `server-mirror` paths above first; do not rediscover them by scanning the machine unless a listed path is missing or the user asks for a fresh inventory.
 +- `C:\Users\Administrator\AppData\Local\FoundryVTT` is the desktop-default data shell on this machine, not the populated project test mirror; as last verified on 2026-07-14, its `Data/modules` contained no installed modules.
 +- The project-local mirror is not the production server. Do not inspect or modify production merely because a task refers to "local Foundry", "FVTT", or "mods".

The same two hunks, at `AGENTS.md` offsets `27` and `119`, had identical content.
```

**RED evidence — `SPELL-001` (2026-07-19):** `bun test src/core/intake/__tests__/rat-warlock-spell-baseline.test.ts` exited 1 after loading the current spell database. The intake flow produced one candidate Actor, then failed at the intended first functional assertion:

```text
error: expect(received).toBeDefined()

Received: undefined

at src/core/intake/__tests__/rat-warlock-spell-baseline.test.ts:115:22
```

The absent value was `actor.flags?.["fvtt-json-generator-spell-resolver"]?.spellManifest`. This is the expected RED baseline: description-only spellcasting cannot satisfy functional spell resolution. No production resolver implementation was added, so no GREEN result is claimed for `SPELL-001`.

**2026-07-19 review correction:** The Rat Warlock helper now returns `spellResolution` directly from the actual intake result through the narrow temporary bridge needed before Task 9 publishes that field, and the test asserts it directly without a masking result cast. The baseline uses the approved stable module ID `fvtt-json-generator-spell-resolver`. The focused rerun remains intentionally RED at the first manifest assertion (`Received: undefined`, line 116; `0 pass`, `1 fail`, exit 1), proving this correction did not weaken or move the functional acceptance boundary.

### 2026-07-19 Spell Resolver Task 2 Contract Note

Commit `da82c1e` defines the exact portable manifest, stable Chinese blocking findings, strict runtime validation, canonical manifest hashing, and a resolver-managed projection hash without importing Foundry globals. TDD evidence was `20 pass / 10 fail / 50 assertions` at the review-fix RED boundary, then `30 pass / 0 fail / 68 assertions`; `bun run typecheck:production` completed with no diagnostics. Manual contract review confirmed that the Rat manifest shape preserves source evidence and that casting-use state (`uses.spent`) does not look like a manual edit while attack, save, target, description, resolver ownership, `flags.dnd5e.cachedFor`, and compendium provenance remain managed.

The first mechanically green implementation was rejected during semantic review because unknown future fields could validate while being omitted from the manifest hash, foreign module flags caused false manual-conflict hashes, and non-finite restriction numbers collapsed to JSON `null`. The accepted implementation rejects unknown fields at every contract level, hashes only resolver-owned flags plus required dnd5e provenance, and fails closed on non-finite numbers in both validation and hashing. `SPELL-001` remains `open`: this contract does not yet extract, generate, resolve, hydrate, or exercise a Spell in Foundry.

### 2026-07-19 Spell Resolver Task 3 Intake Note

Commit `a5e4889` carries source-evidenced spellcasting through the AI Intake IR and deterministic Markdown boundary without adding Actor flags, embedded Spell items, destination UUIDs, spell levels, schools, books, damage, effects, or other destination mechanics. The Rat fixture preserves exactly two source groups and ten granted spells, DC 12, attack +4, Charisma, the material waiver, independent daily uses, and all three literal restrictions. Its coverage now partitions lore as narrative and the statblock as mechanical, and the visible spellcasting description must equal an exact verified source slice.

The first mechanically green revision was rejected because spell evidence could point outside its grant, visible descriptions could carry fabricated rules, renamed duplicate traits could pass, and malformed claim evidence could throw. A later green revision was rejected again after an exact whole-source evidence span swallowed both a usage label and an earlier AC-only Mage Armor mention with zero findings. The accepted source-derived rule requires every usage evidence ref to be a minimal, self-contained grant span: the usage label is anchored at the beginning, child spell/restriction evidence occurs after it, only list punctuation/Markdown/standalone conjunctions may separate children, and no unrelated text may follow the last child. Chinese one-line grants and English multiline Markdown lists remain supported; whole-source, label-to-end, missing-label, wrong-occurrence, extra-sibling, fabricated-description, duplicate-representation, and touched-path malformed-envelope negatives all block.

Controller verification passed the required focused suite at `55 / 55` tests and `213` assertions, all Intake tests at `78 / 78` and `287` assertions, `bun run typecheck:production`, a ten-case attack/no-throw matrix, and commit-scope/diff checks. A fresh independent read-only review reported no Critical, Important, or Minor findings. `SPELL-001` remains `open`: Task 3 proves source -> IR -> Markdown only and makes no Actor hydration or Foundry usability claim. Older unrelated non-string surfaces in the pre-existing Intake validator were observed during fuzzing but were not introduced by this spellcasting slice and are not represented as fixed here.

### 2026-07-19 Spell Resolver Task 4 Portable Actor Note

Commit `06c58da` carries the strictly structured manifest through the Markdown parser into a v14-only portable Actor boundary. The Actor stores the exact manifest plus deterministic hash at `flags.fvtt-json-generator-spell-resolver`, remains `pending`, links each source spellcasting feature one-to-one by a non-display stable key, and contains no embedded Spell, Cast Activity, placeholder, or destination-world Spell UUID. v12 manifests fail before the legacy mapper; no-manifest v12/v14 actors retain legacy behavior. Because rendered Markdown is not the original evidence source, parser validation explicitly performs schema, type, range, quote-length, and forbidden-identifier checks without falsely claiming source-slice verification; the stronger raw-source validator remains unchanged and succeeds for the exact Rat source.

The first green revision was rejected after controller attack testing found UUIDs could hide inside manifest strings or feature descriptions. A second independent review then found an English-route P1: post-generation localization could inject a UUID after the deep scan. The accepted revision scans the whole portable Actor at the manifest boundary and again after English localization, while ordinary `item`/`compendium` prose and no-manifest legacy actors remain unaffected. Controller verification passed `52 / 52` focused tests and `187` assertions, `414 / 414` affected tests and `1,506` assertions, production typecheck, the 125-source anti-overfit audit, direct real-Rat projection, adversarial UUID probes, commit-scope checks, and a clean independent re-review. `SPELL-001` remains `open`: Task 4 proves portable pre-hydration generation only, not destination matching, atomic hydration, or Foundry runtime usability.

### 2026-07-19 Spell Resolver Task 5 Deterministic Planning Note

Commit `8f8d199` implements the Foundry-independent candidate contract, exact normalization, ordered 2024-first resolution, review-only fuzzy suggestions, saved concrete mappings with truthful automatic/fallback/manual-review provenance, and all-or-nothing Actor preflight planning. A ready plan is bound to the manifest, the Task 6 authoritative source inventory SHA-256, the metadata-only candidate hash, policy configuration, current managed projection, and manual decisions. Any missing, ambiguous, contradictory, stale, malformed, or undecided ref withholds the entire plan.

The first green implementation was rejected during controller review because its logical ref key could collide, 2014 saved mappings were incorrectly hard-coded away, malformed projection sorting could still throw, and the plan hash did not bind configuration/current state. The submitted revision was rejected again because it could not represent package-version changes in the authoritative inventory hash, could not honestly record manual candidate selection, treated unrelated future rules strings as globally malformed, applied source-book hints inconsistently to first-time 2014 fallback, and allowed empty public identities. The accepted revision separates authoritative inventory and candidate metadata hashes, treats same-key unsupported rules as review while ignoring unrelated future generations, applies source-book constraints consistently, and prevents saved 2014 mappings from bypassing any same-key non-2014 candidate.

Controller verification passed `45 / 45` focused tests and `165` assertions, the full spell-resolution scope at `81 / 81` and `251` assertions, production typecheck, the 128-source anti-overfit audit, commit-scope checks, a real Rat ten-ref ready projection, and an all-or-nothing future-rules attack. A fresh independent reviewer confirmed all prior findings closed and reported no new issues. `SPELL-001` remains `open`: Task 5 produces no Foundry package index, module, Actor write, cached Spell, Cast Activity, transaction, or runtime evidence.

### 2026-07-19 Spell Resolver Task 6 Companion Module Note

Commit `ca4ca6d` packages the browser-safe companion module for exact Foundry `14.364` / dnd5e `5.3.3`, scans every enabled readable Item pack using only the eight approved index fields, admits only real `type === "spell"` rows with valid 16-character Foundry IDs, and binds candidate metadata to enabled source package versions. Eligible-pack index failures and malformed Spell rows preserve partial diagnostics but prohibit mutation, so an incomplete inventory cannot falsely prove that a same-name 2024 Spell is absent and trigger a 2014 fallback. Full Item documents remain unfetched until a concrete selected Compendium UUID exists.

Controller semantic review rejected an initially green lifecycle that allowed writes after an eligible pack failed. Fresh independent review then rejected two more false-greens: Foundry 14.364's native settings page would corrupt a visible `type: Array` source-priority setting through a StringField round trip, and non-empty but invalid short/symbol Document IDs entered the candidate inventory even though full fetch required a valid 16-character ID. The accepted revision keeps structured machine settings out of Foundry's lossy native StringField UI, retains the Boolean debug setting in native configuration, and applies the exact local Foundry ID validator boundary before candidate creation. Task 8 consumes and validates the structured setting through the module service; the approved Task 8 control list did not add a separate source-priority editor.

Controller verification on the amended commit passed the spell/module scope at `102 / 102` tests and `348` assertions, the whole repository at `969 / 969` tests and `3,673` assertions, both TypeScript checks, the 135-source anti-overfit audit, a 124-case SHA-256 cross-check, adversarial options/misleading/mixed/failing-pack and invalid-ID projections, commit-scope checks, and two byte-identical installable ZIP builds. The final ZIP SHA-256 is `d03280a8839b4d858985f8ae6872271ce96d1e25f10b87c37f6be4990d800483`; an independent ZIP reader confirmed the five fixed-timestamp root entries and no forbidden browser/local material. A fresh independent re-review closed both Important findings and approved the commit. `SPELL-001` remains `open`: Task 6 has no Cast Activity, cached Spell, Actor transaction, rollback, conflict UI, or real Foundry spell-use evidence.

### 2026-07-19 Spell Resolver Task 7 Native Hydration Note

Commit `6383b8d` implements deterministic native dnd5e 5.3.3 Cast Activities, eager cached Spells through the prepared Activity's public `getCachedSpellData()`, strict resolver ownership, Actor-local serialization, compensating transactions, single-snapshot undo, no-op reapplication, ordinary-use volatility exclusion, and Keep/Overwrite behavior. Rat Warlock's ten source-evidenced refs project as four at-will and six independent 1/day casts with the source attack/save overrides, CHA ability, ignored material component, self-only Mage Armor target, and literal-only unsupported restrictions; no placeholder Spell, local UUID rewrite, custom Activity, macro, prototype patch, or compendium mutation is introduced. Exact compatibility evidence was checked in the locked dnd5e 5.3.3 source for `cachedSpell`, `getCachedSpellData()`, Cast challenge/component data, Activity uses, Activity PseudoDocument ownership, and the Activity-update cached-enchantment lifecycle, plus Foundry 14.364 public embedded-document and embedded-collection behavior.

Controller review rejected three mechanically green revisions. The first used a fake `Activity.parent === feature` relation that is false for dnd5e's PseudoDocument and also used the new selected UUID to prove ownership of an old cache, preventing legitimate UUID A-to-B re-resolution. The second closed those findings but still let dnd5e's two Activity-ID lifecycle writes overwrite a manually edited native cache enchantment during Keep. The accepted revision models the real two-level Activity parent chain, proves old and new identities on their respective sides of a same-ref transition, covers automatic and manual A-to-B cache replacement plus rollback, snapshots the sole strictly owned cache before Keep, restores its complete user content after both lifecycle writes through the public embedded Item API, and rejects missing or multiple caches before any Keep write. Three independent review rounds found the defects, verified each closure, and the final round reported no further actionable issue.

Mechanical acceptance on the final amend passed `36 / 36` Task 7 focused tests and `317` assertions, the full spell-resolver scope at `138 / 138` and `665` assertions, both TypeScript checks, the 139-source anti-overfit audit, deterministic module build and browser-forbidden API scan, commit-scope/diff checks, and a final whole-repository run at `1,005 / 1,005` tests and `3,990` assertions. Earlier whole-repository runs exposed two unrelated non-stable failures: a crawl CLI 60-second timeout and one Bloodfin acceptance failure; each passed in isolation, and subsequent complete runs passed. These transients are retained as evidence rather than represented as fixed root causes.

Semantic acceptance passed against runtime-faithful fakes and the locked source: all ten Rat refs retain their source mechanics; auto-cache and manual-cache paths end with one correctly owned cache; A-to-B success and injected failure preserve deterministic replacement/rollback; Keep preserves edited enchantment changes, extra effects, nested system data, foreign and dnd5e runtime flags; unrelated Actor content remains deep-equal; and rollback reports residuals when exact recovery cannot be proven. This is not real-world runtime acceptance. `SPELL-001` remains `open` until the later local Foundry world import, resolve, cast, reload, undo, module-disable, and post-disable spell-use gates pass.

### 2026-07-19 Spell Resolver Task 8 Safe Lifecycle and Review Note

Commit `e999c94` adds the four locked Foundry 14.364 public hooks, GM-only single-Actor controls, eight truthful statuses, once-per-finding review, exact source/candidate/current/proposed evidence, persistent concrete mappings, read-only report/source views, diagnostics export, and compensated Undo. Task 8 does not patch Actor or dnd5e prototypes, register a custom Activity, expose a world-wide resolve action, or write a post-transaction metadata patch. The Task 7 commit boundary now atomically records configuration hash plus selected UUID/rules/origin so already-applied detection can compare current configuration, source inventory, candidate metadata, concrete selections, and strict owned Activity/cache structure without recomputing the pre-hydration projection hash.

Controller review rejected green revisions that left mapping decisions unsaved after successful hydration, patched configuration metadata after the Actor transaction, lost fallback evidence after service reload, omitted source quotes from the review, left templates unshipped, and allowed Undo prevalidation failures to remain visibly hydrated. The accepted revision saves mappings before Actor mutation with exact setting compensation, performs zero Actor writes when mapping persistence cannot be proven, reloads reports through a read-only preflight while retaining committed selections/literal restrictions, renders escaped quotes through packaged Foundry Handlebars templates, and exposes failed or recovery-required Undo outcomes without touching unrelated managed content.

Mechanical acceptance passed `33 / 33` focused hook/review tests and `168` assertions, the local spell-resolver directory at `85 / 85` and `557` assertions, both TypeScript checks, deterministic seven-entry module build including both templates, anti-overfit, commit-scope, and diff checks. Semantic acceptance covered GM authority, event coalescing/non-recursion, Cancel/close zero mutation, Keep/Overwrite gating, saved-mapping/config/source invalidation, exact full-document UUID validation, fallback visibility after reload, mapping and Undo compensation, foreign-cache refusal, and Resolve/Undo serialization. `SPELL-001` remains `open`: these are runtime-faithful tests and locked-source checks, not the real disposable-world import/cast/reload/module-disable acceptance.

### 2026-07-19 Spell Resolver Task 9 Portable Status Truth Note

Commit `2106517` adds a separate `PortableSpellResolutionStatus` and keeps source acceptance distinct from target-world hydration. The deterministic verifier compares the Actor manifest with the source-derived rendered manifest and raw-source validation, rejects dropped/duplicate refs, target UUIDs, fake manifest hashes, embedded Spells, spoofed/missing/duplicate feature links, altered usage/DC/attack/material/restrictions, and any pre-runtime `hydrated` claim. The intact Rat remains source-accepted with exactly ten refs, zero embedded Spells, and `pending`; non-casters remain `not-required`.

Controller review rejected an initially green implementation whose Web summary exposed an absolute report path, whose frontmatter extractor used the last Markdown `---`, and whose feature-link check accepted arbitrary flagged Items. The accepted revision projects only safe spell-status fields to Web clients, stops at the first exact frontmatter delimiter, and requires the exact flagged generated `feat` identity and source-derived feature content. CLI and Web now say the portable Actor still needs the FVTT v14 resolver; accepted Actor registration remains unchanged and the download label never claims hydrated spell functionality.

Mechanical acceptance passed `54 / 54` focused Task 9 tests and `197` assertions, all Intake tests at `96 / 96` and `333` assertions, both TypeScript checks, the Web production build, commit-scope, and diff checks. Semantic acceptance used the real Rat fixture through source -> IR -> Markdown -> project v14 Actor and planted every listed drift/spoof case. `SPELL-001` remains `open` until Task 10 tooling and Task 11 real local Foundry acceptance prove actual hydration and post-disable use.

**2026-07-19 post-commit review reopening:** Independent adversarial review reproduced mechanically green false acceptance in both commits. Task 8 still lacks full selected-document identity validation, combined manual/candidate gating, cross-Actor/world mapping serialization, hydrated-snapshot completeness, exact Undo residuals, affected-only priority staleness, the designed structured world settings UI, complete status/localization, and actual last/current/proposed managed projections. Task 9 reused an unverified old Actor, accepted source-to-IR changes to SpellRef identity/ability/DC/attack/material waiver under stale evidence, accepted spoofed feature linkage and pre-hydrated Cast Activities, coupled unrelated Intake review to spell status, and serialized an absolute report path into a downloadable report. The controller accepts the reproductions and withdraws the prior completion claims. Commits remain useful implementation checkpoints, but neither task is semantically closed and Task 10 must not start until follow-up commits plus fresh independent review close these findings.

**2026-07-19 follow-up closure:** Task 8 now validates the complete selected Spell document identity at the final transaction boundary; combines candidate and manual-edit decisions; serializes world mapping changes across Actors; proves complete hydrated projections before Keep/Overwrite/Undo; reports exact residuals; invalidates only actually affected priority changes; ships the structured settings application and complete localization; and renders truthful last/current/proposed projections. A real service-to-transaction regression covers whole managed-pair deletion instead of testing only a fake service seam. Controller reruns passed the focused hooks/transaction scope at `84 / 84` with `496` assertions and the full spell-resolver scope at `221 / 221` with `1,146` assertions, followed by both TypeScript checks, the 14-source changed anti-overfit audit, Web build, and two deterministic eight-file module builds. Fresh independent review reported no Critical, Important, or Minor finding.

Task 9 follow-up commit `ba7f09c` regenerates and re-verifies the Actor from the current raw source, binds raw-to-IR SpellRef identity and every source-derived mechanical field into the evidence comparison, rejects linkage and pre-hydrated Activity spoofing, keeps unrelated Intake review separate from portable spell status, and removes local paths from downloadable diagnostics. Controller adversarial checks and fresh independent review found no remaining actionable issue. Tasks 8 and 9 are mechanically and semantically closed at the tested project/runtime-faithful boundary; `SPELL-001` remains `open` because real Foundry runtime use is still Task 11.

### 2026-07-19 Spell Resolver Task 10 Safe Lab Tooling Remediation Checkpoint

The uncommitted Task 10 implementation was independently rejected after its first green tests. The review reproduced seven boundary failures: unsupported ClassicLevel `readOnly` still mutated LevelDB, Foundry/dnd5e/classic-level/build paths could escape through junctions, install dry-run accepted a foreign destination identity, world dry-run accepted a missing settings database, final install verification happened outside rollback, cleanup failure could prevent restoration, and the CLI ignored surplus arguments.

Generalized TDD remediation now enforces exact lexical and physical repository paths, including existing ancestors and version files; uses a snapshot-first world-settings preflight with `createIfMissing: false`; creates a durable backup before any original database open; preserves unrelated module choices; makes final install verification part of the compensated replacement transaction; restores the old module even when cleanup also fails; quarantines a failed replacement; validates existing destination identity in dry-run; and parses only the documented CLI shapes. Real ClassicLevel temporary databases cover missing, corrupt, locked, unchanged, and changed stores, including non-`LOCK` byte stability for dry-run/no-op, recoverable backup contents, unrelated module preservation, and temporary-artifact cleanup. Fresh mechanical evidence is `28 / 28` focused tests with `106` assertions plus both TypeScript checks and `git diff --check` at this checkpoint.

This is not operational or runtime acceptance. No distribution was built, no module was installed, and no actual Foundry world was opened or changed during this remediation. Task 10 remains open until a fresh independent read-only review accepts the corrected diff and the controller runs the separately authorized build/install/verify/prepare-world and full Foundry Lab gates. `SPELL-001` remains open for Task 11 real local-world import, hydration, spell-use, reload, Undo, module-disable, and post-disable-use evidence.

**2026-07-19 second-review remediation:** A fresh read-only review rejected the checkpoint with one Critical and three Important findings: the real builder mutated `dist` before physical-path validation; dangling junctions passed the existing-ancestor resolver and all filesystem guards remained check-then-use; internal LevelDB symlinks could survive snapshot copy and read an outside database; and the Windows `LOCK` handle was released before snapshot/backup copy. TDD follow-up now validates the real temp-repository builder before any destructive call, rejects existing and dangling reparse points component-by-component, revalidates install/uninstall/recovery/world paths at the closest practical mutation boundary, validates source and copied settings trees recursively with only ordinary single-link files, and holds the stopped-world `LOCK` handle across snapshot/backup copy plus post-copy validation. A real contender is rejected while the handle is held; holding the handle alone leaves the original non-`LOCK` tree byte-identical; source-tree drift fails closed while the durable backup remains logically openable. README wording now states the residual operating-system TOCTOU boundary instead of claiming ordinary path checks eliminate it. Focused temporary-fixture evidence is `38 / 38` tests with `138` assertions, followed by clean `typecheck:all` and scoped `git diff --check`. No actual build, install, verify, or world preparation was run. Task 10 remains open for controller review and the separately authorized operational gates.

**2026-07-19 final review and operational closure:** Two further independent findings were reproduced and closed before any real mutation. Install/recovery now rebinds the exact validated build hash before every relevant move, quarantine, or fallback removal and leaves a same-ID/different-hash injected destination plus both recoverable trees untouched with an explicit `recovery required` result. Durable world backups are never opened by ClassicLevel; only a task-owned temporary snapshot is opened, while the original backup is full-tree hashed before copy, after copy, and after read. Focused tests pass `42 / 42` with `162` assertions, both TypeScript checks pass, and final independent review reports no Critical, Important, or Minor finding.

The controller then ran the authorized real lifecycle. Two builds produced the same eight-file SHA-256 tree hash `645693b0a0564b70a9ce5363259e1961d4347810105cc894f743fa7fb6e60366`; install and `verify-install` matched that exact hash under the project-local server mirror and reported Foundry `14.364` plus dnd5e `5.3.3`. `prepare-world --world=fvtt-v14-module-matrix --apply` created the durable backup at `.local/foundry-v14/evidence/spell-resolver-world-backups/2026-07-19T01-58-39-134Z/settings`, preserved all 90 unrelated module choices, and enabled only `fvtt-json-generator-spell-resolver`. Independent copy-only LevelDB inspection proved the backup remained byte-stable, the backup had no resolver key, the live copy had the resolver set to `true`, and all unrelated key/value pairs were unchanged. The full Foundry Lab suite passed `152 / 152` tests with `562` assertions. Task 10 is closed; this is safe lab tooling and world-preparation acceptance, not Task 11 spell-use acceptance.

### 2026-07-19 Spell Resolver Task 11 Real Workflow and Runtime Closure

The exact accepted Intake bundle is `.local/intake-runs/2026-07-19T04-53-50-113Z-feb8d83c`: one accepted Rat Warlock, one independent review, zero repair calls, zero findings, ten portable refs, and target-world status `pending`. The promoted workflow artifacts are `obsidian/dnd数据转fvttjson/input/warlock-of-the-rat-god.md` (SHA-256 `65e4b6295d20b0a3b36e1ec2cea04424bf51d427671cf25c60a1b923d57ae0a0`) and the ignored CLI-generated output `obsidian/dnd数据转fvttjson/output/warlock-of-the-rat-god.json` (SHA-256 `a8d9a96cd2bd3b6d9fc05dff2d2b905fe7ae3db1406969ea3d3733378ac6a2a1`). Fresh `verify:intake` and `verify:actor` both pass with no Actor warning. Controller source review confirms the ten names/usages, Charisma, DC 12, +4 attack, material waiver, Mage Armor self-only, Eldritch Blast two rays, and Giant Rat restriction; the portable Actor has no Spell, Cast Activity, placeholder, or destination UUID.

The full local runtime evidence under `.local/spell-resolver-acceptance/2026-07-19-rat-warlock/` passes the intended behavioral matrix on Foundry `14.364` / dnd5e `5.3.3`. Its 1,070-candidate source index includes dnd5e `5.3.3`, dnd-players-handbook `2.1.0`, dnd-heroes-faerun `1.1.0`, and a temporary local 2014-only harness `0.0.1`. It proves expansion-only 2024 discovery without hard-coded package/UUID logic, same-key 2024 over 2014, configured PHB over `dnd5e.spells24`, and a visible unique 2014-only fallback. The Rat hydrates to exactly ten native Cast Activities and ten exact cached Spells. Attack/save/utility, independent daily use, repeated at-will use, ignored material components, literal restrictions, identical no-write re-resolution, Keep/Overwrite/Cancel/dialog-close, successful compensation, failed-recovery residuals, unrelated-Actor equality, and post-disable native sheet/cast/chat use all pass.

Runtime-driven lifecycle review rejected timing-based stable windows and then rejected an over-strict Hook-only revision when Chrome proved a same-value dnd5e enchantment update is a legal no-op with no `updateActiveEffect`. Commits `ad922bd` and `d5921f0` now use exact public `createItem`/`updateActiveEffect` correlation, exact complete cache projections, fail-closed Hook absence, and a write-after exact no-op comparison. Focused tests pass `45 / 45`, the spell-resolver scope passes `256 / 256` with `1,261` assertions, both typechecks pass, the 145-source anti-overfit audit passes, and two independent reviews report no finding. The latest module build/install hash is `8b8b90d252045ff61cbe691646b556dc2304c87b54615a231b44cc5ac4dc9638`; a fresh Chrome Actor on that exact build again reached `hydrated` with ten automatic 2024 selections, ten Cast Activities, and ten one-to-one cached Spells.

Cleanup is complete: no acceptance Actor/message or resolver setting remains, resolver/harness module configuration is absent, the original module configuration hash `c5cea8dd24eab7b5b34816c1f08fc1bd870e602381e73f5b44e637d050fa3241` and unrelated Actor hash `af9d3c77b576678cdca55e0ea46a246f8df5a91f74a7a3939f27cd31fe96949b` are restored, `options.json` is restored at hash `59e91f8d57553d9e23907d0108b11729907c7bdeb2ae80e1b1aad9b6029dcd81`, port 30001 is stopped, and production was untouched. Task 11 is mechanically and semantically closed. Task 12 remains open only for the fresh aggregate gate, final documentation audit, and scoped documentation commit.

### 2026-07-19 Spell Resolver Task 12 Final Gate and Closure

Fresh mechanical verification passed after the final runtime fixes. `bun run test:spell-resolver` passed `256 / 256`; the affected Intake/parser/generator/CLI slice passed; Foundry Lab passed `152 / 152` with `562` assertions; the deterministic eight-entry module build, both TypeScript checks, 145-source anti-overfit audit, and Web build passed. The exact aggregate command `bun test --max-concurrency 4` passed `1,258 / 1,258` with `5,051` assertions in 45.3 seconds. After adding the explicit Task 11 acceptance-artifact hygiene regression, the final `bun run ci:verify` passed `1,259 / 1,259` with `5,052` assertions in 54.4 seconds, 87.57% production line coverage, 89.81% production function coverage, 145 audited sources, 1,736 tracked-path hygiene, locked dnd5e `5.3.3` reference verification, Web build, and the offline Actor smoke. The first aggregate attempt was not hidden: a Bun child process stalled for ten minutes, was terminated by exact PID, and two subsequent full runs completed in approximately 45 seconds without recurrence.

Repository/package hygiene also passes. `git diff --check` is clean; `git ls-files .local dist` is empty; secret scanning finds only documented environment-variable names, placeholder values, test fixtures, and the Plan's own grep command. The Plan explicitly requires the CLI-generated Rat Actor to be tracked in the otherwise ignored vault output tree. The repository hygiene gate therefore has one documented `explicit-exception` for `obsidian/dnd数据转fvttjson/output/warlock-of-the-rat-god.json`; its regression proves that a neighboring generated output remains prohibited.

Controller semantic acceptance compared the original unmarked source, accepted Markdown, portable Actor, hydrated graph, resolver runtime report, disabled-module evidence, and final lifecycle smoke together. All ten refs select real destination Spells; the Rat uses ten automatic 2024 dnd5e `spells24` candidates, while separate real-package controls prove expansion discovery, same-key 2024 priority, configured PHB priority, and 2014 fallback only under same-key 2024 absence. Charisma, DC 12, +4 spell attack, four at-will versus six independent 1/day uses, ignored material components, Mage Armor self-only, Eldritch Blast two rays, and the Giant Rat restriction retain source meaning. Representative attack, save, utility, limited-use, and at-will workflows were actually exercised; already hydrated native spells still opened and cast after resolver disable. Identical re-resolution made zero writes, Keep/Overwrite/Cancel/dialog-close behaved as specified, successful compensation restored the managed boundary, failed compensation reported exact residuals, and the unrelated Actor remained byte-identical. Two-ray and Giant Rat rules remain deliberately visible literal restrictions rather than falsely claimed automation.

`SPELL-001` remains closed only for Foundry `14.364` / dnd5e `5.3.3` with source packages dnd5e `5.3.3`, dnd-players-handbook `2.1.0`, and dnd-heroes-faerun `1.1.0`; the temporary `0.0.1` harness existed only for the isolated fallback proof and was removed. Foundry v12 resolution, OCR/PDF intake, production installation, world-wide migration, later runtime compatibility, and complete automation of source-specific literal restrictions remain explicitly unsupported. This closes Task 12 and the twelve-task spell-resolver Plan without broadening the support claim.

The first final pre-commit rerun then exposed one unrelated but real deterministic-output defect instead of being accepted on retry: full GoddessFantasy crawl wrote concurrently completed records in response order, while its acceptance contract required stable topic order. A delayed fixture made the failure deterministic as `102, 101, 100`; the generalized fix now sorts full-crawl records by topic ID before writing and reuses the same stable ordering for incremental additions. The exact RED failed 9/10 at the order assertion; GREEN passed 10/10 twice, the affected crawl/CLI group passed 34/34 with 175 assertions, and anti-overfit passed. The final aggregate evidence below must include this fix; the earlier successful 1,259-test run remains historical pre-fix evidence, not the final completion claim.

The final fail-fast verification ran from `2026-07-19T18:17:10+08:00` through `18:18:27+08:00` and exited 0 at every step: spell-resolver tests, all 152 Foundry Lab tests, the deterministic eight-entry module build, `ci:verify`, `git diff --check`, and repository hygiene. The final CI aggregate is `1,259 / 1,259` tests with `5,052` assertions, 87.56% production line coverage, 89.84% production function coverage, 145 audited sources, 1,736 tracked paths, locked dnd5e `5.3.3` references, Web build, and offline Actor smoke. This post-fix run is the mechanical completion evidence for Task 12.

### 2026-07-19 Local Master Integration Note

The repository's actual default integration branch is `master` (tracking `origin/master`); no local `main` ref exists. After fetching and confirming `master == origin/master == f4f7408`, the completed `codex/ai-monster-intake` branch was 36 commits ahead with zero divergent `master` commits. A clean temporary worktree fast-forwarded local `master` to `e47dece` without a merge commit or conflict, the original dirty worktree was then switched between identical commit trees, and the merged feature branch was deleted. Nothing was pushed.

Post-merge verification ran on the real `master` worktree and passed the spell-resolver suite, all Foundry Lab tests, the deterministic eight-entry module build, and `bun run ci:verify`. The aggregate remains `1,259 / 1,259` tests with `5,052` assertions, 87.56% production line coverage, 89.84% production function coverage, 145 audited sources, 1,737 tracked paths, locked dnd5e `5.3.3` references, Web build, and offline Actor smoke. The count increase from the prior 1,736-path record is the committed final workflow documentation at `e47dece`.

Workspace preservation was verified before and after the fast-forward by exact SHA-256, not status alone: `.ruler/AGENTS.md`, `AGENTS.md`, and `docs/baileywiki-mass-edit-guide.zh-CN.md` retained identical bytes, while the untracked vault `crawls/` tree retained 96 files and the same aggregate SHA-256. Those user-owned changes remain unstaged and uncommitted. The integration has no remaining code, runtime, test, branch-cleanup, or documentation action; only a separately authorized future push could publish the now-integrated local commit series.

### 2026-07-19 Module Localization Backlog Note

The production settings screenshot showed a healthy 1,126-spell source index with `dnd-players-handbook` preferred before `dnd5e / spells24`; no priority change or debug logging is required for the current world. Repository inspection confirmed equal 101-key `en` and `zh-CN` dictionaries and localized settings templates. The English screenshot therefore reflects the active Foundry client language, not a missing Chinese dictionary.

Per explicit user direction, implementation stops here and `MOD-I18N-001` records the future product requirement: all current and future Foundry modules need bilingual settings, controls, reports, status/error text, module titles, and functional descriptions. A per-client module-local language selector is preferred; when dynamic switching or manifest localization is impractical, delivery must include a complete version-matched localized artifact or verified manual replacement path. The durable policy and acceptance gate are `docs/foundry-module-localization-policy.md`; this note does not claim the selector or localized manifest metadata has been implemented.

### 2026-07-19 Online Spell Hydration Failure Checkpoint

The user's first online import produced the exact error `Spell hydration failed: Timed out waiting for public Foundry createItem for .Item.I2XfEEis0enXBLnl.Activity.116c319da6fcfdd2. Native cache does not match the complete prepared Activity public getter projection.; rollback left residual differences.` Deterministic ID reconstruction against the tracked Rat manifest proves Activity `116c319da6fcfdd2` is `Faerie Fire`, the eighth of ten selections for the imported feature ID `I2XfEEis0enXBLnl`. The timeout text also proves a qualifying `createItem` was observed but its expected-shaped public projection differed; it does not yet identify which field or module caused the mutation.

The visible one-spell remainder and `MANUAL_CONFLICT_UNDECIDED` review are consistent with persisted `failed-recovery-required`, not a successful partial hydration. Apply is intentionally disabled until every manual conflict and required candidate decision is resolved. Systematic debugging therefore stops writes: Cancel/close the review, use the Actor header status control or Actor-directory actions to View Resolution Report and Export Diagnostic Report, retain the failed Actor until evidence is captured, and do not repeatedly Resolve, Apply, or Undo on guesswork. The exact next input is the exported redacted `spell-resolver-<actor-id>.json`; root cause and recovery choice remain open until its residual paths and runtime/module inventory are inspected.

The received 2,948-byte diagnostic has SHA-256 `43e9e08674f60ad4adbb565756c53bf70b7527838606afc686e91cd27fd17bae`. It confirms compatible Foundry `14.364` / dnd5e `5.3.3`, valid manifest, no source-index diagnostics, persisted `failed-recovery-required`, and three residual paths: unowned new Item `/items/3wrpM7R9feZ6BhLk`, managed Faerie Fire Activity `/managed/activities/116c319da6fcfdd2`, and `/rollback/errors`. Code tracing explains the residual shape: lifecycle verification fails before the mismatched native cache can be journaled/owned; rollback then refuses to delete the unverified cache and refuses to delete its Activity while that cache remains. The diagnostic intentionally redacts the cache body, so it cannot identify the mismatched expected field.

The same file exposes `SPELL-003`: top-level service status is `needs_review` after the user's explicit retry, while persisted `spellResolution.status` remains `failed-recovery-required`. `readResolverStatus()` currently returns the ephemeral value before the persisted value, so the later review state masks the higher-severity failure in the header and export. The console screenshot did not capture the requested active-module inventory because only the `console.log` return value `undefined` remained visible. Exact next evidence is therefore a native export of the preserved failed Actor plus a module-version expression evaluated without `console.log`; neither action writes to the world.

### 2026-07-19 Online Spell Hydration Root Cause and Local Repair

The preserved failed Actor export is 75,389 bytes with SHA-256 `324319604da415ae9704f90ff423a42b535e2d434f58bf0b7f62df0a53562ab0`; the supplied active-module inventory is 6,379 bytes with SHA-256 `6c15e39f76dede4b46fc1b77c744cdfe72e64e643ecddbaefc92b6ba4b5fdf82`. The Actor proves the residual Item `3wrpM7R9feZ6BhLk` is the unowned native Faerie Fire cache for Activity `116c319da6fcfdd2`, with exact `cachedFor` and `Compendium.dnd-players-handbook.spells.Item.phbsplFaerieFire` provenance. The runtime inventory confirms Foundry `14.364`, dnd5e `5.3.3`, resolver `0.1.0`, Babele `2.9.1`, the Simplified Chinese Babele patch `1.0.89`, DAE `14.0.12`, and MIDI-QOL `14.0.11` among the active modules.

An initial hypothesis that Foundry-owned `_stats` rewrites caused the failure was explicitly rejected rather than patched: a real local PHB getter/create probe found eleven top-level and Effect provenance differences, but the new test passed immediately because the existing managed projection already excludes those volatile fields. With Babele and the Chinese patch active, the only remaining expected-shaped differences were `/system/description/value` and `/effects/0/description`. Character-level alignment proved Foundry inserted exactly `amp;` after one ampersand in each field, converting Babele's `&Reference[...]` representation to the HTML-equivalent stored `&amp;Reference[...]`. The local created description lengths and SHA-256 values—`188` / `27bc6179433d36fb899a6ca53de0d607d3145d37b1648cb2e59eced6b5171d66` and `110` / `621247dbbe183b2b622ed651cd6089e0274d8dd77e34fff914770aa68764efca`—exactly match the preserved online cache without recording licensed description bodies.

TDD then reproduced the real failure against `assertNativeCacheProjectionMatches()`. The minimal repair canonicalizes one HTML ampersand-escape layer only in native-cache `system.description.value`, `system.description.chat`, and source Effect `description` before the strict expected-shape hash comparison. It does not remove descriptions, normalize arbitrary document strings, or weaken Effect/mechanics comparison; the same regression plants a different Effect description and confirms rejection. A separate red test proved persisted `failed-recovery-required` was masked by non-active ephemeral review/stale status; `readResolverStatus()` now preserves active `resolving` while recovery-required outranks those later ephemeral states.

Focused verification passes 61 tests / 337 expectations. The rebuilt eight-entry module installed into the project-local mirror with identical build/install SHA-256 tree hash `f957384b61c2e4366a9bf067a174d20bf6fa6865a38a40ce6bd49eafbfa50a5e`. In a disposable Foundry `14.364` / dnd5e `5.3.3` world using real PHB `2.1.0`, Babele `2.9.1`, local Chinese patch `1.0.76`, DAE `14.0.12`, and MIDI-QOL `14.0.9`, the clean CLI Rat Actor reached `hydrated` with ten managed Cast Activities and ten managed cached Spells, all linked to real PHB sources. Faerie Fire completed the native template workflow with a returned result; Mage Armor used successfully. After disabling the resolver and restarting, all ten pairs remained linked and Mage Armor still used successfully. The disposable Actor and template were deleted, the helper and Foundry listeners were stopped, the matrix world's original three-module configuration and empty resolver settings were restored, and `options.json` returned byte-for-byte to SHA-256 `59e91f8d57553d9e23907d0108b11729907c7bdeb2ae80e1b1aad9b6029dcd81` with world `cor-cotn`. Fresh final mechanical verification then passed resolver 258/258, Foundry Lab 152/152, both production/all TypeScript checks, and aggregate `ci:verify` 1261/1261 including coverage thresholds, the 145-source anti-overfit audit, repository hygiene, dnd5e `5.3.3` reference verification, Web build, and offline Actor smoke. Two consecutive release builds produced the byte-identical eight-entry ZIP SHA-256 `145f7ee253d528867c24952a5ed43b4eb046a6656c79c15190e25ec049c9f910`. These local results validate the repair mechanism but do not close either finding until the exact online stack is updated and recovery/retry evidence is collected.

### 2026-07-24 cor-cotn World Footprint Audit Checkpoint

- [x] Executed `docs/superpowers/plans/2026-07-24-cor-cotn-world-footprint-audit.md` through Task 4 on branch `codex/cor-cotn-world-footprint-audit`, implementation tip `ad28364`; the accepted static report checkpoint was committed at `9efc3c8`.
- [x] The exact project CLI copied the stopped local `cor-cotn` world to ignored evidence and opened only the verified snapshot. The accepted third run exited 0 after 1,082.9 seconds; manifest-last publishing, 7/7 evidence-file SHA-256 checks, equal source tree hashes, Foundry `14.364`, dnd5e `5.3.3`, and `remoteAccessed=false` all passed.
- [x] Mechanical reconciliation recorded 771 Actors, 6,337 Actor Items, 1,341 Actor Item Effects, 35 Actor Effects, 295 Scenes, 2,836 embedded Tokens, 415 Journals, and 734 Pages. The materialized view contains 2,835 valid-parent Tokens plus one explicit orphan; duplicate full identities are zero.
- [x] Mandatory semantic review rejected two earlier mechanically valid bundles instead of smoothing over their defects. TDD/review repairs first reconstructed normalized embedded LevelDB documents, then parsed real legacy `@Actor[ID]{label}` links. The accepted run reports 349 no-Scene Actors but only 2 `no-detected-reference` candidates, 533 broken Token/Actor rows, and a 274/274 raw-unique/report legacy-edge reconciliation with zero missing or extra edges.
- [x] Direct snapshot-to-report samples passed for Scene use, User binding, Journal links, no-Scene non-candidates, true candidates, duplicate/manual-review, Journal language/type/module ownership, chapter confidence, broken Token delta structure, the existing empty Adventure pack, and referenced/unreferenced/external assets. A modern verified UUID control passed; sensitive-field and User non-character negative controls emitted zero edges.
- [x] Published the privacy-safe tracked checkpoint at `docs/audits/2026-07-24-cor-cotn-world-footprint-audit.md`. Detailed IDs, field paths, content hashes, helper scripts, and both recoverable rejected bundles remain ignored under `.local`; no world object, user record, asset, pack, remote instance, or production server was modified.
- [x] Task 5 produced the exact 16-sheet Excel decision workbook through Artifact Tool and re-imported it for structural verification. All 16 expected names and order, 80,273 detailed rows, 16 decision-validation ranges, the five-value controlled vocabulary, zero formula errors, and 16 regenerated previews passed; after the final fixed-bundle regeneration, the manifest binds the 3,395,192-byte workbook at SHA-256 `a2c52128d271628106e95d8e5d91ecf634633ef7f5aa35ca20d0960fc2e31816`.
- [x] Task 6 completed at the plan's strict `partial` boundary on a fresh content-identical temporary copy. The measured disk layer records 1,824,483,516 source/snapshot bytes and a 5,345.705 ms guarded copy. Initialization, Canvas/GPU, and continuous runtime are explicitly `blocked` because the required in-app Browser backend was unavailable; no alternate browser, credential reset, user edit, or remote access was used.
- [x] The first copied-world start was rejected when Foundry listened on `::`; its owned PID was stopped, the rejected copy was preserved locally, and a fresh copy was made. The accepted server probe listened only on `127.0.0.1:30002`, returned HTTP 200 for the exact Foundry/dnd5e/world target, then stopped with the port released. Original world and `options.json` hashes remained unchanged. This checkpoint still does not authorize cleanup or claim the three blocked browser layers measured.
- [x] Commit `44e19a4` repaired the final summary projection after independent review found it counted packs by nonexistent `kind` rather than real `type` and still named Task 4 for runtime sampling. A new non-overwriting `snapshot-task6-summary-refresh` real-world run regenerated the fixed output: `summary.md` SHA-256 `2bab4f641a41a25891a6e4160a2a0cafa790f67d6915beb1919134d39f99d74c`, Adventure 1, other Compendium/pack 4, Task 6 wording, strict `partial`, `remoteAccessed=false`, equal source hashes, and 7/7 manifest evidence hashes all passed.
- [x] The final CLI refresh was:

      bun run src/tools/worldFootprintAudit.ts --world-root ".local/foundry-v14/data/server-mirror/Data/worlds/cor-cotn" --app-root ".local/foundry-v14/app/14.364" --output-dir ".local/foundry-v14/evidence/cor-cotn-world-audit-20260724" --snapshot-dir ".local/foundry-v14/evidence/cor-cotn-world-audit-20260724/snapshot-task6-summary-refresh" --baseline-file ".local/foundry-v14/evidence/cor-cotn-world-audit-20260724/baseline-task6-input.json"

  It exited 0, republished the seven-file manifest at exact current hashes, retained `remoteAccessed=false`, and removed the stale pre-refresh workbook binding before the verified workbook rebuild added the current one.
- [x] The accepted loopback-only copied-world probe used:

      node --require ".local/foundry-v14/evidence/cor-cotn-world-audit-20260724/loopback-listen-preload.cjs" ".local/foundry-v14/app/14.364/main.js" --dataPath=".local/foundry-v14/data/server-mirror" --hostname=127.0.0.1 --port=30002 --world=cor-cotn-audit-baseline --upnp=false --proxySSL=false --noIPDiscovery=true

  This command is evidence for server-side loopback readiness only. Because browser initialization, active-Scene Canvas/GPU, idle, and fixed-sequence samples were not collected, future comparison must treat those three layers as unavailable rather than zero or passing.
- [x] Final fixed-bundle verification passed 55/55 focused world-audit tests with 357 assertions and 1,356/1,356 repository tests with 5,519 assertions, both production/all TypeScript checks, the documentation-only anti-overfit gate, and repository hygiene across 1,756 tracked paths. Independent final checks reconfirmed the corrected summary semantics, 7/7 manifest evidence hashes, the workbook hash/bytes, all 16 previews, the unchanged 2,340-entry source tree hash, unchanged `options.json`, no audit listener/process, and no tracked secret or bulk world content.

- [x] (2026-07-16) Reproduced the real compact-Chinese plaintext failure: raw Lurker yields zero creatures with exit 0; minimally marked input mechanically generates but semantically becomes AC 20, HP 332, six abilities at 10, missing core fields, merged Multiattack/Claw, and biography-only traits while both audit layers remain green.
- [x] (2026-07-16) User approved a parallel AI-first intake pipeline, strict failure policy, per-field evidence IR, independent review plus one repair, ambiguity-only human review, CLI+Web delivery, monster-only v1, TXT/MD paste/upload, single+collection input, and bounded real OpenAI plus local Foundry acceptance.
- [x] (2026-07-16) Implemented the first AI Intake slice on `codex/ai-monster-intake`: versioned evidence/coverage IR, dedicated `MONSTER_INTAKE_*` provider, deterministic renderer/verifier, bounded orchestration and review bundles, conflict/resume backup flow, CLI exit semantics, Legacy zero-result failures, Web `needs_review` download gating, and a Chinese review UI. Focused intake/CLI/Web tests, both v12/v14 project generation paths, typechecks, API regressions, and Web build pass; planted AC/HP/ability/initiative/skill/defense/sense/language/reach/damage/DC drift is blocking.
- [x] (2026-07-16) Superseded the earlier credential/browser block without weakening the dedicated configuration boundary. A fixed-source, audited, loopback-only Codex OAuth compatibility proxy was run temporarily from ignored `.local`; no OAuth token or proxy configuration was copied into the repository. A real `gpt-5.4` extraction produced a complete Lurker IR, and a no-value-change resume reran renderer, project generator, deterministic verifier, and independent reviewer to `accepted` with zero findings and CLI exit 0.
- [x] (2026-07-16) After user approval, rebuilt the incomplete local `browse` helper from current gstack source, installed its pinned Playwright Chromium, and exercised the project-local Foundry `core-test` world. The renderer/project-workflow v14/core Lurker imported through Foundry's public `importFromJSON()`, its sheet opened, and runtime readback preserved Foundry 14.364 / dnd5e 5.3.3, AC 14, HP 65 / `10d8 + 20`, abilities 18/14/14/11/13/16, walk/climb 30, CR 4, three passive traits, two actions, one bonus action, Claw reach 10, and Dark Teleport CHA DC 13. The disposable Actor was deleted and the profile stopped.
- [x] (2026-07-16) OAuth research and bounded acceptance completed. The official Codex CLI path was rejected for this provider because it is an agent runtime with tool-loop semantics, not the plan's bounded schema call. `thkdog/codex-openai-proxy` commit `60a33ec5847d061e0f3e8ea8f3fc486e9694d205` was source-audited, production dependencies were updated to zero audit findings inside ignored `.local`, and the process listened only on `127.0.0.1:8787`. It was stopped after acceptance and the port was confirmed closed. This is recorded as an unofficial local compatibility path, not an OpenAI Platform API-key claim.
- [x] (2026-07-16) Real-model failure behavior was also exercised rather than hidden. Independent fresh extractions produced `needs_review` for non-unique short evidence and omitted repeated table-header coverage; CLI returned nonzero and promoted no formal artifacts. This proves the strict gate but also bounds the support claim: Codex OAuth can drive the intake, while stochastic extraction may legitimately require review.
- [x] (2026-07-17) Completed the bounded real-model matrix: the Lurker has an accepted zero-finding real IR and fresh v12/v14 project outputs; the two-monster sample discovered exactly two and failed closed as needs_review without merging; the missing-CR negative returned needs_review/exit 2; the conflicting-AC negative returned needs_review/exit 2 and drove deterministic full-source partition plus `CONFLICTING_SOURCE_VALUES` evidence for 14 versus 16.
- [x] (2026-07-17) Closed INTAKE-001, INTAKE-002, and VER-002. Final code passes `ci:verify` with 791 tests / 3,093 expectations, 87.94% production lines / 88.68% functions, 115-source anti-overfit, 1,668-path hygiene, locked references, Web build, and offline smoke; Foundry Lab separately passes 116 / 417. Mobile Web inspection confirmed the recommended AI Intake form, wrapping, no overflow, and no irrelevant Legacy/Vault toggles. Local Web/OAuth services and ports 5174/8787 were stopped.
- [x] (2026-07-17) Ran the user-supplied messy Rat Warlock TXT through the real Web v14/core flow and rejected multiple false-positive terminal states during manual semantic review. Generalized TDD repairs now preserve explicit feature activation independently from activity type, keep structured mechanics out of Markdown biography headings, verify IR-to-Actor activation drift, normalize exact repeated-title evidence by an unambiguous nearest-position rule, render conditional AC literals clearly, and label accepted Web creatures correctly. The final fresh browser run `70cef418-61fe-48ae-b879-6bc70d47a26b` completed with one extraction, one review, zero repair/findings, formal Actor/Markdown/ZIP downloads, no console errors, and an identical browser-download SHA-256. Fresh `verify:intake`, 804-test aggregate CI, 117-source anti-overfit, 1,673-path hygiene, and 116 Foundry Lab tests pass.
- [x] (2026-07-19) Spell Resolver Task 3 completed in `a5e4889`: exact source grants now become a deterministic portable Markdown manifest with no destination mechanics; two semantic review loops closed evidence-range, visible-description, duplicate, malformed-envelope, whole-source swallowing, minimal-span, multiline/conjunction, and manifest-ID defects. Controller gates passed 55 focused tests / 213 assertions, 78 Intake tests / 287 assertions, production typecheck, and ten adversarial probes; fresh independent review was clean. `SPELL-001` remains open for parser/generator, resolver module, hydration, and Foundry runtime work.
- [x] (2026-07-19) Spell Resolver Task 4 completed in `06c58da`: v14 portable Actors now carry the exact pending manifest/hash and stable feature links with zero placeholder Spell/Cast/destination UUID; v12 manifests fail closed and legacy actors remain unchanged. Controller and independent review closed manifest/description UUID hiding plus the post-localization English UUID bypass. Focused 52/52, affected 414/414, typecheck, 125-source anti-overfit, real Rat projection, and adversarial probes passed. `SPELL-001` remains open for destination planning, module hydration, rollback, and Foundry runtime work.
- [x] (2026-07-19) Spell Resolver Task 5 completed in `8f8d199`: metadata-only 2024-first resolution and all-or-nothing planning now bind authoritative inventory/package-version state, candidate metadata, configuration, managed projection, decisions, and truthful selection provenance. Controller and independent review closed identity collision, malformed-input throws, 2014 saved/fallback inconsistencies, future-rules poisoning, package-version invisibility, and manual-origin gaps. Focused 45/45, full spell-resolution 81/81, typecheck, 128-source anti-overfit, real Rat 10/10 planning, and adversarial all-or-nothing checks passed. `SPELL-001` remains open for Foundry discovery, hydration, rollback, and runtime work.
- [x] (2026-07-19) Spell Resolver Task 6 completed in `ca4ca6d`: the exact-version companion module now discovers all enabled readable Item packs without trusting hints, hashes valid Spell metadata with source package versions, fails closed on incomplete/malformed inventories, hides structured machine settings from Foundry's lossy native string UI, and builds a deterministic browser-safe ZIP. Controller and independent review closed partial-index mutation, complex-setting corruption, and invalid Document-ID gaps. Focused 102/102, whole repository 969/969, both typechecks, 135-source anti-overfit, SHA cross-checks, adversarial discovery probes, and deterministic ZIP verification passed. `SPELL-001` remains open for native Activity/cache hydration, transactions, UI, and runtime acceptance.
- [x] (2026-07-19) Spell Resolver Task 7 completed in `6383b8d`: native dnd5e 5.3.3 Cast Activities and eager caches now hydrate through public APIs under strict ownership and compensating transactions. Controller and three independent review rounds closed false Activity parent assumptions, A-to-B old/new identity authority, and Keep lifecycle data loss. Focused 36/36, spell resolver 138/138, whole repository 1,005/1,005, both typechecks, 139-source anti-overfit, deterministic build, browser scan, ten-ref Rat projection, cache replacement/rollback, Keep deep-preservation, and non-interference checks passed. `SPELL-001` remains open for hooks/UI, portable status reporting, Foundry Lab tooling, and real local-world runtime acceptance.
- [x] (2026-07-19) Spell Resolver Task 8 completed after reopening: generalized fixes close selected-document identity, combined decisions, mapping serialization, complete projections/Undo residuals, priority invalidation, settings/localization, and truthful review evidence. Focused `84 / 84`, full spell resolver `221 / 221`, both typechecks, anti-overfit, Web build, deterministic module build, controller semantic attacks, and fresh independent review pass. `SPELL-001` remains open for real runtime use.
- [x] (2026-07-19) Spell Resolver Task 9 completed in follow-up commit `ba7f09c`: fresh-source Actor verification now binds the complete SpellRef evidence and mechanics, rejects linkage/Activity spoofing, separates unrelated Intake review, and exports no local paths. Controller adversarial checks and independent review pass. `SPELL-001` remains open for real runtime use.
- [x] (2026-07-19) Spell Resolver Task 10 completed: sixteen reproduced lifecycle/path/LevelDB/CLI/recovery findings have generalized TDD coverage; focused `42 / 42`, Foundry Lab `152 / 152`, both typechecks, deterministic build, exact-hash install, exact Foundry/dnd5e version verification, durable backup, live disposable-world update, byte-stability, and logical preservation checks pass. `SPELL-001` remains open for Task 11.
- [x] (2026-07-19) Spell Resolver Tasks 11 and 12 completed: the real project workflow produced the evidence-backed ten-ref portable Rat Actor; local Foundry 14.364 / dnd5e 5.3.3 passed native hydration, use, disable, review, rollback, idempotency, and non-interference acceptance; final aggregate CI passed 1,259 tests / 5,052 assertions plus coverage, anti-overfit, hygiene, locked references, Web build, and offline smoke. `SPELL-001` is closed at the exact documented boundary.
- [x] (2026-07-15) Completed repository-wide orientation and identified semantic, gate, type, CI, coverage, artifact, architecture, Web, and product-acceptance gaps.
- [x] (2026-07-15) Reproduced SEM-001 against current generated artifacts and counted 12 flagged AC effects, including 8 false `ack: +N` effects.
- [x] (2026-07-15) Reproduced VER-001: Bleeding Guardian verification returns no warnings despite the false AC effect.
- [x] (2026-07-15) Re-ran the full test/coverage command: 639 pass, 0 fail.
- [x] (2026-07-15) Re-measured type errors: 1,007 total and 81 production errors across 20 files.
- [x] (2026-07-15) Re-ran anti-overfit all-source and reference verification success paths: 99 sources checked and `dnd5e-5.3.3: ok`.
- [x] (2026-07-15) Created this authoritative recovery document and added AGENTS routing without modifying business code.
- [x] (2026-07-15) Created an active persistent Goal whose objective points to this file and preserves the program's authorization and acceptance boundaries.
- [x] (2026-07-15) Milestone 1 completed mechanically: two RED→GREEN cycles covered `Attack` boundary rejection and verifier key/value validation; 31 focused tests and 652 full tests passed; anti-overfit passed for 3 changed and 99 total sources; old polluted JSON is rejected and a fresh CLI smoke output passes.
- [x] (2026-07-15) Ran both v14 acceptance suites with translation disabled in the suite: core 6/6 and modded-v14 6/6 passed with zero verifier warnings; all 12 regenerated JSON files contain zero invalid `ack:` AC effects.
- [x] (2026-07-15) SEM-002 reached mechanical verification: three generalized wrapped-title positives, one unmatched-emphasis negative, and the fixture-backed White Tusk structure pass; 19 focused tests and anti-overfit audit pass.
- [x] (2026-07-15) SEM-003 completed: source-derived bilingual application-clause extraction passes explicit-target/outcome/passive positives plus prerequisite, immunity, already-state, and self-state negatives; the full suite passes at bounded concurrency 2 with 656 tests and 2,687 assertions.
- [x] (2026-07-15) Regenerated core and modded-v14 batches both pass 6/6 with zero verifier warnings; six affected `verify:actor` checks pass and the 12-file effect scan finds no invalid `ack:` AC effects.
- [x] (2026-07-15) Completed affected-Actor source review and local Foundry semantic retest: both profiles imported Bonebreaker, Bleeding Guardian, and White Tusk; six sheets opened, fourteen Activity executions created messages, AC remained 16/13/14, White Tusk kept six distinct items without invented conditions, and modded Bleeding retained its one OverTime binding.
- [x] (2026-07-15) Amended the dated acceptance reports, preserved the false-pass chronology, and reconciled the copied-world authentication statement with the later authorized local-only evidence.
- [x] Milestone 1: Repair semantic AC extraction and effect verification (SEM-001, VER-001).
- [x] Milestone 2: Regenerate affected v14 artifacts and repair acceptance claims (DOC-001).
- [x] (2026-07-15) Milestone 3 completed through RED→GREEN: 18 focused tests pass; actual non-repository and zero-source `--all` invocations both exit 1 with distinct diagnostics; changed-source audit checks 8 sources, all-source audit checks 99, reference verification reports `dnd5e-5.3.3: ok`, and the full suite passes 662 tests/2,700 assertions at concurrency 4.
- [x] Milestone 3: Make anti-overfit and reference gates fail closed (GATE-001, GATE-002).
- [x] (2026-07-15) Milestone 4 started with a fresh 1,007-total/81-production diagnostic inventory and focused child plan `milestones/04-type-safety.md`; TYPE-001 moved to `in_progress`.
- [x] (2026-07-15) Milestone 4 mechanical work completed: production diagnostics 81 -> 0, supported broad diagnostics 86 -> 0, 664 tests pass, Web builds, and three real CLI target/profile conversions pass verifier review. A real browser conversion/download reproduced DET-001 because unchecked AI normalization still allowed `.env` translation and polluted two item names with `<think>` output; TYPE-001 remains short of semantic closure until Milestone 5 reruns this path cleanly.
- [x] (2026-07-15) Milestone 5 started with focused child plan `milestones/05-ci-coverage-determinism.md`; deterministic network selection was the first RED->GREEN cycle before coverage and CI wiring.
- [x] (2026-07-15) Milestones 4 and 5 semantically closed: ambient credentials no longer change ordinary Actor/Web generation, explicit network intent is observable, reasoning wrappers are sanitized, the real unchecked-AI browser download contains the exact six White Tusk source items with zero verifier warnings, and `ci:verify` passes 669 tests plus production coverage, audit, references, build, and zero-network Actor smoke.
- [x] Milestone 4: Establish and clear type-safety gates (TYPE-001).
- [x] Milestone 5: Add deterministic CI and meaningful coverage gates (CI-001, COV-001, DET-001).
- [x] (2026-07-15) Milestone 6 started with focused child plan `milestones/06-artifact-boundaries.md`; ART-001 and ART-002 moved to `in_progress` before any artifact retention change.
- [x] (2026-07-15) Milestone 6 inventory and hygiene enforcement completed: 178 prohibited tracked artifacts were classified and untracked without deleting ignored local recovery copies; the real hygiene gate passes and rejects a planted regression.
- [x] (2026-07-15) Closed SEM-004 after the source-identical Shield fixture, three-positive/close-negative parsing corpus, v12/v14 structural generation tests, real v12/v14 CLI regeneration, unrelated Jewel comparison, and the 693-test aggregate CI gate passed. Mandatory semantic review separately retained SEM-005 for the broader standalone Item mechanics still missing.
- [x] Milestone 6: Define and clean artifact boundaries (ART-001, ART-002).
- [x] (2026-07-15) Milestone 7 started with measured candidate evidence and focused child plan `milestones/07-risk-driven-architecture.md`; ARCH-001 moved to `in_progress`. `actor.ts` was selected for two sequential characterized extractions, while Item/Web refactors were deferred to avoid mixing SEM-005 or deployment behavior changes.
- [x] (2026-07-15) Milestone 7 closed: `ActorLocalizer` and pure target-metadata normalization were extracted in separate commits; six direct characterization tests, full v12/v14 pre/post CLI controls, semantic projections, and the 699-test aggregate gate passed with no behavior change.
- [x] Milestone 7: Perform risk-driven architecture extraction (ARCH-001).
- [x] (2026-07-15) Milestone 8 started with decision fallback and focused child plan `milestones/08-secure-web-deployment.md`; WEB-001/WEB-002/WEB-003 moved to `in_progress`. Default support is loopback-only, while explicit public/proxied mode requires a server-side bearer token injected after external user authentication.
- [x] (2026-07-15) Milestone 8 closed after fail-closed process probes, authenticated public-mode API proof, forged-header/global-cap/body/retention tests, real browser Actor and two-entry ZIP semantic inspection, documentation reconciliation, and the 717-test aggregate gate.
- [x] Milestone 8: Secure the chosen Web deployment model (WEB-001, WEB-002, WEB-003).
- [x] (2026-07-15) Milestone 9 started with inventory of the Shield source, Item parser/generator, locked dnd5e 4.3.9/5.3.3 armor schemas, installed DAE 14.0.12 expiry behavior, current acceptance reports, and local Foundry helpers. Focused child plan `milestones/09-product-acceptance-and-support.md` makes SEM-005 the first TDD task and retains PROD-003/PROD-005 as external boundaries.
- [x] (2026-07-15) M9 Task 1 completed: neutral Item schema generation and generalized source mechanics passed real v12/v14 CLI semantic review and the 731-test aggregate gate; SEM-005 remains `in_progress` until Task 2 proves the v14 runtime/import/exercise/export half.
- [x] (2026-07-16) M9 Task 2 closed after replacing the Chrome extension file-dialog boundary with Foundry's public document methods. The CLI v14 Shield imported via `importFromJSON()`; `exportToJSON()` produced a 9,727-byte JSON Blob captured before native download; the source-relevant projection matched exactly after normalizing only schema-default expansion. The disposable Item was deleted, the prototype wrapper was restored, the server stopped, and the original world option restored.
- [x] (2026-07-16) Closed PROD-005 as a scope/report correction. The ledger had mistaken the dated 2026-07-11 88-ID production snapshot for the current intended set despite the 2026-07-12 module-cleanup and production-change record. The last verified local baseline is 79; the current production count was not re-inventoried and is not claimed.
- [x] (2026-07-16) Milestone 11 completed under `milestones/11-live-crawl-semantic-acceptance.md`. The authorized Chrome session yielded 54 board topics, 37 matched/crawled topics, 47 plaintext statblocks, zero crawl/plaintext failures, and no exported cookies or credentials. Mandatory source review first rejected the JSON, then generalized repairs passed 52 focused tests, 47 CLI regenerations/verifiers, expanded 1/25/10/staged/replacement live projections, and the 753-test aggregate gate.
- [x] (2026-07-15) M9 Task 3 closed PROD-001: a dnd5e Activity duration bug discovered in real runtime was repaired with generalized `untilDamaged -> duration.units: spec` projection; the CLI modded artifact applied a live Frightened effect and subsequent MIDI damage removed it, while the CLI core control retained the effect after the same damage path.
- [x] (2026-07-15) M9 Task 4 closed PROD-004: the 19-category executable corpus matrix covers the required language/document/version/profile/positive/negative/regression dimensions; the focused matrix passed 148 tests / 656 expectations and aggregate CI passed 738 / 2,921 without upgrading blocked runtime or external claims.
- [x] (2026-07-15) M9 Task 5 initially closed DOC-002 with PROD-003 and PROD-005 recorded as external boundaries; the 2026-07-16 chronology correction supersedes only the PROD-005 interpretation and leaves PROD-003 as the sole external boundary.
- [x] (2026-07-15) M10 pre-final audit completed every then-unblocked repository/CLI/source gate and updated the current support evidence. The 2026-07-16 no-dialog round trip, chronology correction, and accepted authenticated crawl subsequently closed every remaining Goal boundary.
- [x] (2026-07-15) The historical blocked audit correctly recorded the then-current external boundaries. Later user authorization and accepted evidence resolved the final PROD-003 boundary; the Goal is ready for completion after scoped commit verification.
- [x] Milestone 9: Reconcile acceptance documentation and close authorized product gaps (DOC-002, PROD-001 through PROD-005).
- [x] Milestone 10: Run final repository and semantic acceptance, write retrospective, and close the program Goal.

**Exact next action:** None for the target-world spell-resolver Plan. Preserve the ignored local acceptance bundle and require a new scoped plan plus fresh runtime acceptance before widening versions, production scope, bulk migration, or literal-rule automation.

## Milestone 1: Repair Semantic AC Extraction and Verification

**Finding IDs:** SEM-001, VER-001.

**Files:**

- Create: `src/core/mechanics/acEffectExtraction.ts`
- Create: `src/core/mechanics/__tests__/acEffectExtraction.test.ts`
- Modify: `src/core/generator/actor.ts`
- Modify: `src/core/generator/__tests__/actor.test.ts`
- Modify: `src/tools/actorVerification.ts`
- Modify: `src/tools/__tests__/actorVerification.test.ts`
- Consult: `src/core/generator/AGENTS.md`, `docs/generated-actor-verification.md`

**Interface:**

    export interface ExtractedAcEffect {
      kind: 'flat' | 'bonus';
      value: number;
      sourceText: string;
    }

    export function extractSourceDerivedAcEffect(text: string): ExtractedAcEffect | null;

The parser must recognize `AC` only as a standalone abbreviation, for example `\bAC\b`, while retaining the existing Chinese `护甲等级` form. It must not match `Attack`, `attacks`, `Jack`, or any other containing word. Duration remains a generator concern unless the focused implementation plan demonstrates a clean typed boundary for it.

- [x] Write extraction tests for `AC becomes 14`, `gains +2 AC`, `AC +2`, and the Chinese flat/bonus forms.
- [x] Write close-negative tests for `Melee Weapon Attack: +4`, lowercase/uppercase attack variants, `attacks: +9`, and prose mentioning AC without a numeric change.
- [x] Add the Bleeding Guardian action text as a fixture-backed regression and include one unrelated action whose generated structure must remain unchanged.
- [x] Run the new test and confirm the negative fixture fails before production changes.
- [x] Move generalized extraction into `acEffectExtraction.ts` and make `ActorGenerator` consume the exported function.
- [x] Run `bun run audit:anti-overfit` and document the rule as `source-derived`; do not add actor-name branches.
- [x] Extend `ActorVerificationSummary` with an embedded-effect summary containing item name, effect name, changes, source-derived flags, and source text.
- [x] Make verification warn when a `sourceDerivedAcEffect` cannot be reparsed as an explicit AC clause or when its change key/value disagrees with the parsed clause for the selected Foundry target.
- [x] Prove the existing contaminated Bleeding JSON now yields a warning before regeneration.
- [x] Run targeted tests and expect all to pass:

      bun test src/core/mechanics/__tests__/acEffectExtraction.test.ts src/core/generator/__tests__/actor.test.ts src/tools/__tests__/actorVerification.test.ts --max-concurrency 4

- [x] Run `bun run audit:anti-overfit` and `bun run audit:anti-overfit:all`; observed 3 changed sources and 99 total production sources with zero findings.
- [x] Inspect the diff for unrelated generator changes and record mechanical plus semantic results here.

**Semantic acceptance:** Positive AC clauses still create the correct flat or bonus effect for v12 and v14; all attack-only negatives create no AC effect; Bleeding Guardian retains only its source-defined attack/bleeding behavior.

## Milestone 2: Regenerate Artifacts and Repair Acceptance Claims

**Finding IDs:** DOC-001; depends on Milestone 1.

**Files:**

- Regenerate through workflow: `obsidian/dnd数据转fvttjson/output/v14-acceptance/**`
- Regenerate through workflow: `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance/**`
- Modify: `docs/acceptance/v14-core-batch-verification.md`
- Modify: `docs/acceptance/v14-modded-batch-verification.md`
- Modify: `docs/acceptance/v14-source-json-full-review.md`
- Modify: `docs/acceptance/v14-live-runtime-smoke-test.md`

- [x] Run both documented v14 acceptance suites with optional translation disabled and record exact commands and output counts.
- [x] Recursively scan every regenerated JSON and assert there are zero source-derived AC effects whose `sourceText` begins with `ack:`.
- [x] Run `verify:actor` against Bonebreaker Dorokor, Bleeding Guardian, and White Tusk Shaman outputs; require zero invalid-effect warnings.
- [x] Compare each affected generated Actor back to its source Markdown using `docs/generated-actor-verification.md`, including item activities, effects, changes, flags, durations, and repeated damage.
- [x] In the project-local Foundry v14 mirror, import the affected core/modded Actors into disposable worlds, open their sheets, exercise affected Activities, and confirm no invented AC modification occurs. Production was not used.
- [x] Read the imported runtime documents back through Foundry and compare source-relevant stats, item/effect lists, Activity bindings, and the modded OverTime change; no separate retained export was needed.
- [x] Amend acceptance reports with the defect discovery date, invalidated prior evidence, regeneration command, corrected evidence, runtime result, and remaining boundary.
- [x] Restore `Pass` wording only after source comparison and the relevant local runtime checks passed.

**Semantic acceptance:** The reports tell the full chronology, the generated files contain only source-supported mechanics, and a reader cannot mistake the earlier contaminated run for current proof.

## Milestone 3: Make Quality Gates Fail Closed

**Finding IDs:** GATE-001, GATE-002.

**Files:**

- Modify: `src/tools/antiOverfitAudit.ts`
- Modify: `src/tools/__tests__/antiOverfitAudit.test.ts`
- Modify: `src/tools/referenceCache.ts`
- Modify: `src/tools/__tests__/referenceCache.test.ts`
- Modify if command contracts change: `docs/anti-overfit-risk-register.md`, `docs/REFERENCE_INDEX.md`

- [x] Change Git command helpers to return a typed success/failure result or throw an error containing command, exit status, and sanitized stderr; never translate command failure to an empty successful corpus.
- [x] Make `--all` exit nonzero if zero auditable production sources are found.
- [x] Add tests for missing Git, non-repository working directory/nonzero Git exit, and zero-source all-audit.
- [x] Keep an explicit-file audit independent from Git source discovery and test that path separately.
- [x] Extend reference status to distinguish `missing`, `git-error`, `mismatch`, and `ok`; preserve expected and actual revisions only when known.
- [x] Add a safe-directory/ownership diagnostic test and assert the formatter prints an actionable Git error rather than a false revision mismatch.
- [x] Run targeted tool tests, both real audit modes, reference verification, and the full repository test suite.

**Semantic acceptance:** A broken prerequisite cannot produce a green gate, and an operator can distinguish corrupted revision content from an environment/access problem.

## Milestone 4: Establish and Clear Type-Safety Gates

**Finding ID:** TYPE-001.

**Focused child plan:** `docs/remediation/2026-07-15-project-hardening/milestones/04-type-safety.md`

**Files:**

- Create: `tsconfig.production.json`
- Modify: `tsconfig.json`
- Modify: `package.json`
- Modify production files identified by the fresh type-error inventory; start with shared domain types before leaf assertions.
- Move or delete tracked scratch files only under Milestone 6 ownership rules.

- [x] Capture machine-readable error inventories for production, tests, scripts, and historical debug files without committing raw noisy logs.
- [x] Define `tsconfig.production.json` to include supported production source and exclude tests, temp, generated output, and historical debug scripts.
- [x] Add `typecheck:production` and `typecheck:all` scripts that use the installed TypeScript version without network fetching.
- [x] Fix shared model drift first: Actor activities, image asset options/presets, token review types, job runner contracts, and Foundry target shapes.
- [x] Do not use blanket `any`, `@ts-ignore`, `skipLibCheck` expansion, or broad exclusion to manufacture a pass.
- [x] Add or update behavioral tests whenever a type repair reveals an ambiguous runtime contract.
- [x] Reduce production errors to zero, then repair tests/scripts or reclassify obsolete debug programs under the artifact milestone.
- [x] Run `bun run typecheck:production`, `bun run typecheck:all`, `bun test --max-concurrency 4`, `bun run web:build`, and targeted CLI conversions.

**Semantic acceptance:** Runtime behavior is unchanged except where a type error exposed a real bug; both Actor generation and the Web workbench complete representative real workflows.

## Milestone 5: Add Deterministic CI and Coverage Gates

**Finding IDs:** CI-001, COV-001, DET-001; depends on Milestones 1, 3, and production typecheck from Milestone 4.

**Focused child plan:** `docs/remediation/2026-07-15-project-hardening/milestones/05-ci-coverage-determinism.md`

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: `package.json`
- Create or modify the supported Bun test configuration after verifying the exact installed Bun 1.3.8 coverage syntax.
- Add network-isolation tests near plaintext ingest, sync, translation, crawler, and Web job workflows.

- [x] Add one deterministic aggregate command that runs production typecheck, bounded full tests, anti-overfit all-source audit, reference verification, Web build, and a generated-actor smoke conversion.
- [x] Configure CI concurrency and timeouts so a hung crawler or child process fails visibly.
- [x] Ensure CI does not require API keys, login cookies, SSH access, production Foundry, or network translation.
- [x] Exclude test implementation files from production coverage reporting using Bun's supported configuration, then record the new baseline by subsystem.
- [x] Set initial thresholds no higher than the freshly measured production baseline; require critical semantic/gate modules to have direct branch tests even if the global threshold passes.
- [x] Add tests proving credentials present in environment do not trigger AI/network use without the explicit option.
- [x] Ensure opt-in network usage is reflected in CLI output/result metadata and failures are not swallowed silently.
- [x] Validate the CI workflow locally as far as possible and verify that a temporary planted regression makes each relevant gate fail; revert the planted regression immediately.

**Semantic acceptance:** A clean checkout can prove the supported offline product path, and CI cannot turn missing tools, zero-source audits, hidden network behavior, or low semantic coverage into green status.

## Milestone 6: Define and Clean Artifact Boundaries

**Finding IDs:** ART-001, ART-002.

**Files:**

- Create: `docs/artifact-policy.md`
- Modify: `.gitignore` only if the inventory proves a current gap.
- Modify or relocate tracked output/debug/temp artifacts in path-scoped commits.
- Add a repository hygiene check under `src/tools/` with tests if policy cannot be enforced by Git ignore alone.

- [x] Inventory every tracked file under vault output, root `debug-*`, root `temp-*`, and `temp-items/` with category, producer command, consumer, reproducibility, and retention reason.
- [x] Define five explicit categories: source input, generated disposable output, tracked golden fixture, tracked acceptance evidence, and local/sensitive runtime artifact.
- [x] For every tracked generated JSON, either document its stable fixture consumer or regenerate it into an ignored location and remove it from version control in a scoped commit.
- [x] Promote useful debug scripts to named tools/tests with documented entrypoints; remove only obsolete copies after preserving unique behavior as tests or documentation.
- [x] Preserve user data and unrelated files; do not bulk-delete based only on filename.
- [x] Add a hygiene gate that detects newly tracked disposable output, credentials, cookies, `.local` runtime state, and unclassified root scratch files.
- [x] Run all commands that consume retained fixtures and prove paths still resolve on Windows with Chinese filenames.

**Semantic acceptance:** A new contributor can tell which files are sources, deliverables, fixtures, evidence, and disposable state; cleaning does not erase the only copy of useful behavior or proof.

## Milestone 7: Perform Risk-Driven Architecture Extraction

**Finding ID:** ARCH-001; begins only after P0/P1 gates are green.

**Files:** Determined per focused child plan from change coupling and responsibility, with likely first candidates `src/core/generator/actor.ts`, `src/core/parser/item-parser.ts`, `src/core/ingest/plaintext.ts`, and `src/web/client/App.tsx`.

- [x] Measure change coupling, type-error concentration, test coverage, and responsibility boundaries; do not use line count alone as authorization.
- [x] Select one cohesive extraction at a time, beginning with logic already isolated by semantic fixes such as AC effect extraction.
- [x] Write characterization tests and `assertEqualStructure()` snapshots before moving logic.
- [x] Keep exported interfaces narrow and target-version behavior explicit.
- [x] Run v12 and v14 real-source conversions plus unrelated-actor structural comparisons after each extraction.
- [x] Commit each extraction separately from feature or bug changes.

**Semantic acceptance:** Modules have clearer responsibilities and lower change coupling while generated Actor/Item behavior, CLI output, and Web workflows remain semantically identical.

## Milestone 8: Secure the Web Deployment Model

**Finding IDs:** WEB-001, WEB-002, WEB-003.

**Decision gate:** Before changing public-access behavior, record whether the supported mode is loopback/private-only, authenticated public VPS, or both. If no user choice is available, implement the least-surprising secure default: loopback binding with public mode requiring explicit configuration; do not silently expose a previously local tool.

**Files:**

- Modify: `src/web/server/index.ts`, `src/web/server/api.ts`, `src/web/server/security/rateLimit.ts`
- Modify: `src/web/server/jobs/jobStore.ts`, `src/web/server/jobs/jobRunner.ts`
- Modify: `src/web/server/__tests__/api.test.ts`
- Modify: `src/web/AGENTS.md` and deployment documentation only to match implemented behavior.

- [x] Add tests for direct clients, trusted proxy chains, forged `x-forwarded-for`, shared proxy fallback, global request caps, global long-job caps, and oversized bodies.
- [x] Bind to loopback by default; require explicit host/public-mode configuration for remote exposure.
- [x] If public mode is supported, require an authenticated boundary appropriate to the deployment and keep secrets server-side.
- [x] Trust forwarded headers only from configured trusted proxies; otherwise derive the socket/server identity available from the runtime or use a conservative shared bucket.
- [x] Enforce body limits before unbounded JSON materialization where Bun's server API permits, and align reverse-proxy limits with application limits.
- [x] Add global as well as per-client concurrency limits, bounded job retention, and cleanup tests.
- [x] Run API tests, Web build, and a browser smoke test that uploads a real Markdown file and downloads generated JSON/ZIP.

**Semantic acceptance:** The documented deployment cannot be made publicly expensive or identity-spoofable merely by sending headers, and the normal Chinese-first workbench remains usable.

## Milestone 9: Reconcile Documentation and Close Product Gaps

**Finding IDs:** DOC-002, PROD-001, PROD-002, PROD-003, PROD-004, PROD-005.

**Files:**

- Create: `docs/acceptance/current-support-matrix.md`
- Modify relevant dated reports under `docs/acceptance/` without erasing historical evidence.
- Add source fixtures under the default vault input or test fixture directories according to `docs/artifact-policy.md`.

- [x] Build a current support matrix separating source fidelity, schema validity, minimal runtime behavior, module-specific behavior, production-equivalent coexistence, and production deployment.
- [x] Reconcile copied-world authentication chronology and other stale cross-report statements with dated amendments.
- [x] Add a generalized source-derived DAE/MIDI fixture with positive, close-negative, and unrelated controls; exercise it through the locked DAE 14.0.12 + MIDI-QOL 14.0.9 local runtime.
- [x] Select a real standalone Item source, generate it for v14 through the CLI, import/open/exercise/re-export it, and compare source-relevant fields.
- [x] Expand the corpus matrix across Chinese/English, actor/item, v12/v14, core/modded, positive/negative, and unrelated regression controls.
- [x] For authenticated GoddessFantasy crawling, request authorization only when all offline work is ready; later explicit authorization enabled the accepted 37-topic/47-Actor run without storing cookies/passwords in tracked files or chat artifacts.
- [x] Keep full production coexistence `Partial/Fail` unless the exact acceptance gate passes. Do not bypass protected module signatures or change production without explicit authorization.

**Semantic acceptance:** Every support claim names the layer it proves, dated evidence supports it, and unresolved external gaps remain visible rather than being converted into blanket success.

## Milestone 10: Final Acceptance and Goal Closure

- [x] Run `git status --short` and classify every remaining change by owner and milestone. Only the three pre-existing user-owned files remain outside committed remediation work.
- [x] Run production and broad type checks with zero supported-scope errors.
- [x] Run the aggregate suite and production-only coverage gate after runtime-driven repairs: 743/0 and 87.55% production lines / 88.41% production functions. The first aggregate attempt hit one documented scheduling-sensitive token-review timeout; the isolated test passed 2/2 and the complete rerun passed.
- [x] Run `bun run audit:anti-overfit` and `bun run audit:anti-overfit:all`; the docs-only changed-source run checks 0 sources, while the required all-source run checks a nonzero 109 and passes.
- [x] Run `bun run references -- verify` and require exact-version success or an explicit external blocker: `dnd5e-5.3.3: ok`.
- [x] Run `bun run web:build` and the browser upload/download smoke workflow. The build passes, and the supported Foundry `importFromJSON()` / `exportToJSON()` no-dialog workflow completed with source-relevant round-trip equality; the broken optional gstack executable is not used as product evidence.
- [x] Regenerate representative v12, v14 core, and v14 modded Actors plus a v14 Item through the project flow; also regenerate the unrelated Jewel control.
- [x] Perform source-to-output semantic review for every changed parser/generator behavior and sample unchanged unrelated outputs. Three `verify:actor` runs return zero warnings and the explicit M10 projection script passes.
- [x] Run the authorized local Foundry runtime matrix and preserve the boundary between minimal runtime, copied-world, and production claims. Shield behavior/readback/export and the locked modded/core `isDamaged` control pass. The historical 88-ID mirror failure remains evidence but is no longer a current completion gate; current production state is still not claimed.
- [x] Update every finding state, Outcomes & Retrospective, and the support matrix at the pre-final stopping point; open and external states remain explicit.
- [x] All authorized findings are `closed`; external blockers were either resolved by later authorization/evidence or removed as stale scope. Complete the persistent Goal after the scoped commit and fresh status check.

## Milestone 11: Repair Live-Crawl Semantic Fidelity and Accept PROD-003

**Finding IDs:** SEM-006, SEM-007, PROD-003.

**Focused plan:** `milestones/11-live-crawl-semantic-acceptance.md`.

This milestone converts the authenticated crawl from a mechanically successful but semantically rejected run into accepted evidence. It uses fixture-backed generalized rules, regenerates affected Actors only through the existing crawl/plaintext/CLI workflow, and closes PROD-003 only after source-to-output review of both repaired and unrelated controls.

## Validation and Acceptance

Mechanical verification proves commands, structure, and reproducibility:

- all supported-scope type checks pass;
- tests and production-only coverage gates pass;
- anti-overfit checks a nonzero corpus and passes;
- references are readable and revision-locked;
- Web build and API/browser smoke tests pass;
- generated JSON parses and comes from project workflows;
- hygiene checks find no unclassified tracked runtime/scratch artifacts.

Semantic acceptance proves the user's actual goal:

- no generated mechanic lacks a source, schema, corpus, or authorized exception basis;
- affected source Markdown and final Actor/Item JSON agree on identity, stats, actions, saves, effects, automation, and descriptions;
- Foundry/module claims match behavior exercised on the locked runtime version;
- reports distinguish narrow pass, partial support, failure, and untested scope;
- a fresh Codex task can resume accurately from this file without relying on chat history or local memory.

## Idempotence and Recovery

- Test, audit, reference-verify, build, and read-only inventory commands are safe to repeat.
- Acceptance generation may replace ignored outputs; the workflow's own backup/manifest behavior must be understood before repeating a vault-wide sync.
- Never repair generated JSON manually. If regeneration fails, repair source/parser/generator/workflow, then regenerate.
- Before moving or removing tracked artifacts, create an inventory and use a path-scoped commit so Git history remains the recovery path.
- Before local Foundry world changes, use the project-local mirror and its documented backups. Production remains untouched without new authorization.
- If a milestone is interrupted, update the relevant checkbox with completed and remaining portions and record the exact last command/result in Surprises & Discoveries.
- Optional `/checkpoint` snapshots may supplement recovery, but this checked-in ExecPlan remains authoritative.

## Surprises & Discoveries

- Observation: the current v14 output problem is concentrated in generator-owned Item placeholders, not Actor portrait ingestion or Active Effect status artwork.
  Evidence: the audited v14 corpus contained 658 placeholder Item images among 664 embedded Items, while existing Actor image ingestion and explicit status/effect artwork already use separate source/schema paths. `ICON-001` must therefore resolve generated Item artwork without rewriting Actor portraits or semantic effect icons.
- Observation: icon uncertainty cannot reuse the existing ordinary warning channel without changing publication semantics.
  Evidence: the shared generation pipeline maps warnings to `needs_review`; a low-confidence artwork fallback is intentionally safe and must remain observable in the icon review report without blocking an otherwise accepted Actor.
- Observation: same-type exact matching alone misses source-structured spell attacks that the generator correctly represents as weapon Items.
  Evidence: real Eldritch Blast Items are `weapon` documents with `rsak` Activities, while the locked exact artwork lives in the `spell` Compendium. The generalized bridge now requires both an exact spell name/identifier and a `cast`, `msak`, or `rsak` Activity; a same-name ordinary weapon close negative remains on the weapon default.
- Observation: conservative matching produced no non-exact semantic claims in the existing 1,093-Item audit.
  Evidence: the accepted distribution is 328 exact, 54 existing, zero semantic, and 711 fallback. This is intentional safe behavior: Transfer Harm, Entrapping Pod, and Psychic Lash do not inherit weakly related artwork, while synthetic lexical-plus-structured positive coverage proves the semantic branch remains available for genuinely separated candidates.
- Observation: the first full-suite run hit one unrelated 60-second GoddessFantasy dry-run timeout while every icon test passed.
  Evidence: the exact test passed alone in 1.954 seconds; after the local Foundry acceptance server was stopped, the complete suite passed 1,574/1,574 and the coverage-mode CI rerun passed the same 1,574 tests.

- Observation: “Unmerged branch” was not equivalent to “missing current implementation” in this repository.
  Evidence: the old actor branch was superseded by actor-refactor-v2 and later semantic fixes; the authenticated crawl branch was superseded by a clean merge plus hardened crawl/Web commits; only the Item branch retained a genuinely absent CLI/workflow capability. A literal content merge would have restored stale parser/generator code and local/authenticated artifacts.
- Observation: The historical Item dual-artifact workflow had a hidden whole-vault side effect even though its isolated tests passed.
  Evidence: `ObsidianSyncWorkflow.sync()` collected every Markdown under `input/` and treated unseen manifest entries as deleted. The new scoped run supplies exact promoted paths, skips unrelated inputs, suppresses global stale cleanup during partial sync, and preserves a planted unrelated output byte-for-byte.
- Observation: Non-GM privacy-safe replacement does not mean Foundry's own system avatar is anonymous, and hidden mode cannot guarantee zero transient decode before the module hook runs.
  Evidence: passwordless player `SY` had 17 visible no-OBSERVER Actor cards that correctly received no module token Blob replacement, but several Foundry/dnd5e system avatars were already the Actor portrait. Switching the client to hidden mode left 21/21 final cards with no `img`/`video` or avatar `src` and zero module thumbnail-cache bytes, while the locked Core/dnd5e hook order still permits a transient pre-removal request/decode.
- Observation: A successfully served patched bundle is not evidence that the world client instantiated the patched Worker pool.
  Evidence: after the local restart, the exact bundle returned HTTP 200 with the sentinel and patched SHA-256, but both browser surfaces redirected `/game` to the password-protected `/join`; the join page loads Foundry core assets, not the active world module graph.
- Observation: The current external blocker is authentication, not service readiness or an unavailable browser backend.
  Evidence: PID `43672` owns loopback-only 30001, `/join` returns 200 for `cor-cotn`, both browser backends are callable, and both expose the same Foundry user/password form without an authenticated GM session.

- Observation: Foundry 14 rejects `getFlag("fvttJsonGenerator", ...)` because the namespace is not a registered active module, even though direct `effect.flags.fvttJsonGenerator` data is preserved.
  Evidence: the first temporary rite-lifecycle probe threw the exact invalid-scope error; replacing all three custom-scope `getFlag` calls with direct flag reads made the lifecycle probe pass.
- Observation: dnd5e Enchantment damage is only prepared when the effect is applied through the native Enchant activity and therefore has a foreign Activity origin.
  Evidence: directly embedding an enchantment produced no damage part, while `EnchantActivity.applyEnchantment()` produced a locked fire part with formula `@scale.blood-hunter.crimson-rite`.
- Observation: DAE/MIDI `shortRest` does not remove enchantment effects embedded on an owned weapon through Actor effect expiration.
  Evidence: both `transfer:false` and `transfer:true` probe variants retained the weapon effect after short rest; a locked `dnd5e.restCompleted` lifecycle hook removed it and also handled long rest.
- Observation: a direct-loss macro that updates HP before proving `workflow.damageItem` exists can still double-apply damage.
  Evidence: the final macro now checks Actor, roll, and `damageItem` before the first write; a missing-damageItem probe leaves 20 HP/5 temporary HP unchanged.

- Observation: The visible Quick Insert failure is an internal Plutonium bundle boundary mismatch, not evidence that Quick Insert itself is absent.
  Evidence: the active client exposes `QuickInsert`, while Plutonium CN 2.15.6's `_pGetPlutoniumIndex()` directly references undefined `Omnidexer` and `FoundryOmnidexerUtils` globals even though equivalent helper implementations exist only in an unlisted source file.
- Observation: The Blood Hunter defect is selective rather than “every feature has no Activity.”
  Evidence: Callum's Anxiety Blood Curse already has a native save Activity; passive choices such as Fighting Style and Weapon Mastery appropriately have none. Blood Curse: Mark and Crimson Rite are actionful but have none, and the source supplies no feature-level Foundry side data for the requested class/subclasses.
- Observation: Same-name subclass features and optional Blood Curses cannot share a deterministic Activity-ID namespace.
  Evidence: the first real 59-Activity build produced duplicate IDs for Corrosion, Exorcist, and Soul Eater Blood Curses; the structure validator rejected it. Separate subclass/optional namespaces remove all three collisions and a planted regression protects the boundary.
- Observation: Direct Chrome navigation is not a valid fetchability gate for this local JSON asset in the current extension context.
  Evidence: the post-refresh game console and Quick Insert index passed, but a newly created Chrome tab returned `ERR_BLOCKED_BY_CLIENT` for the asset URL. A separate live HTTP request returned 200, `application/json`, and the exact 4/11/42/59 structure; the report keeps these two evidence layers separate.

- Observation: Real Foundry 14 storage and legacy content invalidated two mechanically green audit bundles before Task 4 could be accepted.
  Evidence: top-level parent arrays were empty while `journal.pages` and `scenes.*` embedded LevelDB namespaces held the real documents, producing the false claims `771 no-Scene Actors` and `0 Journal Pages`; after that repair, 39 Journal page strings contained 334 legacy `@Actor[ID]{label}` occurrences whose 274 unique edges were absent from the graph. The final generalized implementations materialize 734 Pages and 2,835 valid-parent Tokens, report one orphan Token, and reconcile all 274 legacy unique edges exactly.
- Observation: “No Scene Token” is not a usable deletion rule in this real world.
  Evidence: 349 Actors have no valid Scene Token, but User, Journal, structured, UUID, possible-script, player, chapter-shared, and manual-review evidence leaves only 2 Actors with the sole status `no-detected-reference`; each has zero incoming verified edges under the covered scan.
- Observation: Reference repair risk is materially larger than unused-Actor cleanup.
  Evidence: 533 Token rows across 104 Scenes point to 44 missing Actor IDs, including 497 linked Tokens and 114 embedded delta Items/Effects. The report keeps these rows separate from the 2 Actor candidates and assigns restoration/manual review before cleanup.
- Observation: The existing declared Adventure is not yet a usable chapter-package exemplar.
  Evidence: the redacted Adventure sample is declared and physically present, but direct read-only inspection of its snapshot LevelDB found zero records. Its existence cannot be promoted into a chapter-packaging success claim.

- Observation: The real Pellinost source exposes a supported-product gap rather than a model-only extraction failure.
  Evidence: the source explicitly grants a level-5 Wisdom prepared-spellcasting block with cantrips plus `1环（4法位）`, `2环（3法位）`, and `3环（2法位）`; the current canonical usage union and prompt cannot represent those lines, and the resolver explicitly emits `UNSUPPORTED_CAST_METHOD` for `prepared`.
- Observation: The exact locked dnd5e target already supplies the required native representation without a module-specific shared-use invention.
  Evidence: `.local/references/dnd5e/5.3.3/repo/packs/_source/monsters/humanoid/priest.yml` uses Actor `system.spells.spell1/2/3.value = 4/3/2`; dnd5e's Cast Activity mixin decrements those pools when `consumption.spellSlot` is true. The portable manifest therefore needs source-derived prepared refs and casting levels, while the generated Actor owns its native slot pools.
- Observation: The rejected Bol'bara bundle contains both stochastic provider drift and deterministic workflow defects, so a decisions-only resume cannot be semantically safe.
  Evidence: the current IR source length differs from the immutable run source; the waiver evidence exactly quotes `无需任何构材`; the trait array contains no duplicate spellcasting feature despite an incidental claim-span overlap; the renderer selects reach instead of retaining both reach and range; and current decision application can write explanatory strings into array/enum paths.

- Observation: A passing exact-shape test was insufficient until the validator and hash were checked together at the unknown-data boundary.
  Evidence: the first Task 2 implementation accepted an extra semantic property while `hashManifest()` omitted it, hashed foreign runtime flags as managed edits, and allowed `NaN`/infinities to collapse to JSON `null`; focused review regressions now reject all three classes.

- Observation: The authenticated crawl was mechanically perfect before it was semantically acceptable.
  Evidence: 37/37 topics, 47 statblocks, zero pipeline failures, and parseable JSON still produced a truncated fractional CR, omitted `暗蚀`, lost language/taxonomy qualifiers, simultaneous replacement damage, and simultaneous staged statuses; source review rejected the run before repair.
- Observation: Incremental source hashing can correctly skip unchanged Markdown while still leaving outputs stale after parser/generator code changes.
  Evidence: the post-repair pipeline reported 37 Actor skips because source hashes were unchanged; all 47 Actors therefore received explicit project-CLI regeneration before acceptance.
- Observation: Final semantic inspection found three incomplete variable-taxonomy outputs after the first green aggregate gate, and the next aggregate run hit one non-reproducible crawler scheduling failure.
  Evidence: Loup Garou, Waxwork, and Wereraven preserved custom taxonomy but initially had empty standard type; adding corpus aliases and rerunning plaintext plus CLI produced 10/10 standard/custom matches. The unrelated crawler full-mode test then passed 10/10 isolated and the complete aggregate rerun passed 753/753, matching the existing documented concurrency-sensitive test debt.

- Observation: The earlier report counted 82 production TypeScript errors; the fresh 2026-07-15 measurement found 81 across 20 production files while the total remained 1,007.
  Evidence: two fresh `bunx tsc --noEmit` inventories using the current working tree.
- Observation: The full suite now runs successfully in this environment; the earlier process-spawn limitation did not reproduce.
  Evidence: 639 pass, 0 fail in 34.44 seconds with coverage enabled.
- Observation: Reference verification currently passes, but code inspection confirms unreadable Git state is still represented as a generic mismatch.
  Evidence: `referenceCache.ts` converts any failed `rev-parse` to `null`, then emits `mismatch`; the current real cache reports `ok`.
- Observation: Output/input basename mismatch dropped from an earlier rough count to 80 after normalizing `.v14`; the count mixes legitimate acceptance/derived files and cannot justify deletion.
  Evidence: 36 recursive Markdown inputs, 133 recursive JSON outputs, 80 unmatched normalized basenames.
- Observation: Acceptance documentation contains chronology drift: one source-review summary says copied-world authentication is blocked, while later compatibility evidence says the local copy was opened after an authorized local-only password reset.
  Evidence: `docs/acceptance/v14-source-json-full-review.md` and `docs/acceptance/foundry-v14-module-compatibility.md`.
- Observation: Clearing `TRANSLATION_API_KEY` and `OPENAI_API_KEY` in the parent PowerShell process did not make a real CLI generation offline; Bun/project configuration loaded provider values from `.env`, attempted translation, hit rate limits, and fell back to source text.
  Evidence: the 2026-07-15 Aboleth Spawn remediation smoke generation logged `provider: openai-compatible`, `model: MiniMax-M2.7`, and `rate_limited` for actor/item translation namespaces. The generated mechanics remained correct, but DET-001 is now a reproduced behavior rather than only a design risk.
- Observation: The regenerated v14 batches removed the invalid AC effects, but manual source review found a separate pre-existing semantic failure that existing verification did not report.
  Evidence: `white-tusk-shaman.md` wraps `***Spirit-Bonded Body (Recharges after a Short or Long Rest).***` across two lines; generated core and modded Actors omit that item, append its transformation text to `Minion: Savage Horde`, and infer an unsupported `Unconscious` effect on the wrong item. This invalidates the current White Tusk `Pass` claim independently of SEM-001.
- Observation: Correcting the wrapped title boundary does not by itself make White Tusk source-faithful because condition automation scans for bare condition words rather than explicit target application semantics.
  Evidence: the fixture-backed generated Actor now contains a separate `Spirit-Bonded Body`, but `generateEnhancedConditionEffects()` attaches `Unconscious` solely from “the orc reverts ... if it falls unconscious.” This is a termination trigger, not an effect the feature inflicts.
- Observation: The first generalized condition-clause implementation was too narrow for real Chinese output even though focused tests passed.
  Evidence: the full regression initially lost Alyxian's charmed effect, Laughing Hand's Dazed replacement, Bloodfin's Death Burst poison, and a passive `目标被...` grapple effect. Added outcome/passive positives restored those four behaviors while the close negatives stayed clean; the final focused run passed 56/56.
- Observation: The full suite's fixed-timeout crawler/token-review tests can become scheduling-sensitive at concurrency 4 after the corpus grows.
  Evidence: the individual crawler file passed 5/5 in about 1.3 seconds, while two full-suite concurrency-4 attempts moved between unrelated timeout failures; `bun test --max-concurrency 2` passed 656 tests, 2,687 assertions, and 80 files in 20.02 seconds. This is recorded as gate debt rather than hidden as a semantic failure.
- Observation: The installed gstack headless-browser launcher is incomplete on this Windows machine.
  Evidence: `browse.exe` reports `Cannot find server.ts`, and its installed package contains `bin` and `dist` but no `server.ts`. Runtime QA used the project's Playwright package with the installed Chrome executable after the failure was stated; no browser download or production access occurred.
- Observation: The module-matrix world did not initially have MIDI-QOL active, despite the minimal modded acceptance contract requiring it.
  Evidence: the initial active set was DAE `14.0.12`, libWrapper `1.13.5.1`, and socketlib `v1.1.4`; MIDI-QOL `14.0.9` was installed but configured false. It was enabled only for the isolated retest, its exact version was confirmed, and the setting was restored to false afterward.
- Observation: The remediated modded Activities complete, but the locked stack emits compatibility warnings independent of the corrected generator fields.
  Evidence: MIDI-QOL uses deprecated `ChatMessage#applyRollMode`, and its damage-roll clone touches dnd5e 5.3 senses alias getters even though the generated v14 JSON uses `system.attributes.senses.ranges`. The copied matrix world also contains pre-existing inactive-Calendaria journal page types that error on load.
- Observation: Both fail-open gate defects reproduce at the process boundary, not only in synthetic tests.
  Evidence: running `antiOverfitAudit.ts --all` from a non-repository directory exits 1 with Git exit 128 and `not a git repository`; running it from an initialized but empty temporary repository exits 1 with `zero auditable production sources`. The real repository still passes with 99 sources.
- Observation: Bun 1.3.8 on Windows does not honor the documented test-source coverage exclusion safely for this full suite: enabling `coverageSkipTestFiles=true` caused the instrumented run to hang, while per-file coverage worked.
  Evidence: repeated bounded probes isolated the hang to the full-suite option. The accepted gate collects LCOV with `coverageSkipTestFiles=false`, filters 83 test-source records fail closed, reports 88 production files, and passes at concurrency 2 with 86.92% line and 88.09% function coverage.
- Decision: Expose the session-monitor API only after IndexedDB recovery has completed.
  Rationale: real Foundry cold-restart acceptance proved that attaching the API first exposed a transient idle state; a fast companion could create a second active session and then fail same-session recovery. Delaying API attachment removes that race without weakening the companion's strict session-ID check.
  Date/Author: 2026-07-29, Codex.
- Decision: Treat a full companion-owned Chrome exit as a recoverable browser-generation boundary, while keeping `Ctrl+C` and the panel Stop action as explicit session termination.
  Rationale: browser refresh alone does not reset all Chrome process memory. Relaunching the same dedicated profile gives a meaningful cold-restart A/B boundary, preserves ordinary login behavior, and lets the report compare memory before and after without pretending caches were cleared.
  Date/Author: 2026-07-29, Codex with user direction.
- Observation: A mechanical browser success was insufficient and exposed DET-001; the post-repair semantic rerun changed the acceptance outcome.
  Evidence: the first unchecked-AI download contained provider `<think>` text in two item names. The repaired browser download contains the exact six source item names, zero `<think>` occurrences, and zero verifier warnings, and port 5174 was released afterward.
- Observation: Milestone 6's path inventory found 178 policy violations rather than the smaller initial rough count, including tracked ignored outputs/backups, scratch scripts, two orphan Gitlinks, local workspace/manifest state, and one obsolete fixed-path verifier.
  Evidence: `docs/artifact-inventory.md` contains 178 exact classified paths; the pre-clean hygiene gate reported 178 findings, the post-untracking gate passes over 1,568 tracked paths, and `git ls-files -ci --exclude-standard` now reports only the intentionally tracked root `AGENTS.md`.
- Observation: Removing old Item scratch outputs was mechanically safe but not yet semantically acceptable because the supported replacement workflow regressed behavior that one historical scratch output happened to retain.
  Evidence: CLI regeneration of `骑士之盾.md` produced `uncommon` with only Forceful Bash; the source says `极珍稀` and defines `庇护领域（Protective Field）` as a reaction usable once until the next dawn. Parser inspection traced this to a wrong/ordered rarity map and a save-trait predicate that treats trigger prose containing `豁免检定` as an actual DC save.
- Observation: The first SEM-004 fixture draft was not source-identical and therefore produced a misleading direct-generator pass while the real CLI source still lacked dawn recovery.
  Evidence: a normalized byte/content comparison failed; the real source uses multiline text and `直至次日黎明`, while the draft used a shortened `直到下一个黎明` sentence. Replacing it with the source-identical fixture and extending the generalized syntax made the direct and CLI paths agree.
- Observation: Locked dnd5e schemas use the case-sensitive rarity key `veryRare`, so the project's pre-existing `veryrare` model was itself invalid even after the Chinese label was recognized.
  Evidence: `references/dnd5e-4.3.9/repo/module/config.mjs` and `.local/references/dnd5e/5.3.3/repo/module/config.mjs` both define `veryRare`; regenerated v12 and v14 Shield Items now emit that exact key.
- Observation: Source review beyond SEM-004 found broader standalone Item template leakage and incomplete action mechanics that the removed scratch outputs also did not solve.
  Evidence: the generated Shield inherits breastplate `armor.value: 14`/`dex: 2` and omits its extra magical AC, Protective Field duration/concentration/range, and Forceful Bash prone rider. The locked 5.3.3 `equipment24/armor/magical/shield-of-the-cavalier.yml` and 4.3.9 Shield/Shield +2 sources show the correct schema; SEM-005 now owns this work with PROD-002 runtime acceptance.
- Observation: The highest-coupling Actor module could be reduced without semantic drift by extracting two already-characterized responsibilities rather than performing a broad rewrite.
  Evidence: `actor.ts` moved from 3,514 lines / 157 private methods to 3,208 / 140; the two new collaborators have six direct tests; v12 and v14 CLI outputs are full normalized value-structure matches to controls regenerated from pre-extraction commit `86d0c56`; the aggregate gate passes 699 tests.
- Observation: The first real browser collection probe failed even though single-Actor generation was healthy, because the collection workflow intentionally requires monster-block headings and the probe supplied a single-Actor source.
  Evidence: the UI returned `No monster blocks found`; rerunning the same Web workflow with tracked collection `开发用数据2.md` succeeded 2/2, and the downloaded ZIP parsed to the two source identities with Foundry 14.361/dnd5e 5.3.3 metadata and 8/6 items. The failed probe was retained as input-contract evidence, not counted as acceptance.
- Observation: At the original Task 2 preflight, Local Foundry accepted the matrix-world login and exposed the correct Item import workflow, but the Chrome extension could not supply the CLI JSON because its user-controlled file-URL permission was then disabled.
  Evidence: the UI reached `导入数据: M9 Temporary Shield Import`; `waitForEvent("filechooser")` succeeded, then `fileChooser.setFiles` returned `Not allowed`. The plugin's packaged `chrome-file-upload-troubleshooting.md` identifies the required Chrome extension permission. No import/runtime claim was accepted; the server and options were cleanly restored.
- Observation: DAE 14.0.12 registers the `isDamaged` special-duration key, but MIDI-QOL 14.0.9 is the installed component that observes actual damage and removes matching effects.
  Evidence: DAE `module/Systems/DAEdnd5e.js` registers `isDamaged`; MIDI's manifest requires DAE >=14.0.0, and `midi-qol.js` reads `flags.dae.specialDuration` in its damage workflow before invoking `removeEffectUuids`. Static generation can accept the flag mapping, but runtime expiry cannot honestly be described as DAE-alone behavior.
- Observation: M10's headless browser fallback is not currently usable even though its executable exists, and project policy prevents auto-invoking it while gstack proactive behavior is disabled.
  Evidence: `browse.exe status` fails with `Cannot find server.ts. Set BROWSE_SERVER_SCRIPT env or run from the browse source tree`; the installed `gstack/browse` tree contains `bin/` and `dist/` but no `src/server.ts`, and `gstack-config get proactive` reports `false`. No browser result was accepted from this path.
- Observation: The final CLI/source projection remains stable after all M9 documentation work.
  Evidence: v12/core, v14/core, and v14/modded Damage-Bound Warden Actors plus v14/core Shield and the unrelated Jewel regenerated through `src/index.ts`; all Actor verifiers returned zero warnings, and explicit source assertions passed for metadata, stats, attacks, effect scoping, Shield armor/Activities/recovery, and Jewel non-leakage.
- Observation: The former deployment guide materially contradicted the implemented secure boundary until Milestone 8 documentation was rewritten.
  Evidence: the old guide described the first version as publicly open without application authentication. Current code, process probes, capabilities output, README, Web AGENTS rules, and deployment examples now agree on loopback default plus explicit authenticated public/proxied mode.
- Observation: Foundry v14 rejects portable Item JSON when `_stats.lastModifiedBy` names a non-existent user, even though the rest of the document is schema-valid.
  Evidence: the initial Shield import rejected `fvttJsonGenerator` as an invalid 17-character user id; omitting user-specific metadata allowed the same CLI Item to import through Foundry's supported UI.
- Observation: A limited dnd5e 5.3.3 Activity does not decrement its own `uses` merely because `uses.max` exists.
  Evidence: Protective Field remained at `0/1` until the source-derived limited utility Activity emitted `consumption.targets = [{type: "activityUses", value: "1"}]`; the regenerated Item then reached `1/1`, rendered `0/1`, and rejected a second use.
- Observation: DAE's `isDamaged` flag cannot work when dnd5e has already suppressed a linked instantaneous effect.
  Evidence: runtime showed `_source.duration.expired = true` and DAE suppression for the generated `inst` Activity. Locked dnd5e/Foundry/DAE sources plus a live control isolated `duration.units: "spec"`; the regenerated modded Actor then retained Frightened before damage and expired it after MIDI damage, while core retained the effect.

- Observation: Standalone `verify:intake` initially reported the second NPC as uncovered source even though the candidate Actor projection was otherwise exact.
  Evidence: the command passed the complete 1,771-code-unit source to `verifyMonsterIntake` without the current IR's coverage range; inferring `{start,end}` from the IR coverage changed both real reports to `accepted` with zero findings, and the multi-creature CLI regression passes.
- Observation: Mechanical verification initially missed two real semantic defects in the promoted Actors: golden-master `@prof * 2` initiative leakage and loss of `地精类` / `任意种族` between IR and Markdown.
  Evidence: direct final-JSON inspection exposed both; new generator/renderer/verifier tests fail on the old behavior, the workflow was rerun, and the final Actors now have `attributes.init.bonus: ""` plus source-exact `details.type.custom`.
- Observation: Independent AI review produced self-contradictory false positives for Pellinost after deterministic output was correct.
  Evidence: one raw review alleged a no-material-components grant while its own second finding stated Pellinost's candidate contains no such grant; another treated the hidden portable manifest plus the single visible Spellcasting feat as duplicate visible features. Deterministic adjudication now handles case/code variants only when IR evidence and the Actor projection mechanically disprove the claim; true duplicate/component-waiver findings remain blocking.
- Observation: Final independent code review found two generalized acceptance gaps after the real artifacts already passed: adjudication could trust an IR that omitted the same material-waiver sentence as the structured field, and multiple prepared groups could silently project only the first native Actor profile.
  Evidence: source-aware adjudication now keeps the finding whenever the original candidate still states a waiver; compatible prepared groups merge only with identical ability/caster level and consistent same-level slots, while validator/renderer/verifier fail closed on conflicts. RED/GREEN regressions pass and the post-review aggregate is `1300 / 1300` with `5159` assertions.
- Observation: The required in-app Browser backend was unavailable during the cor-cotn copied-world baseline, even though the isolated Foundry server itself reached loopback HTTP readiness.
  Evidence: browser selection returned `Browser is not available: iab` and the documented browser inventory returned an empty list. Initialization therefore retains no browser navigation/network/memory fields, and Canvas/GPU plus continuous-runtime sampling remain explicitly blocked rather than being inferred from server logs or process memory.
- Observation: Foundry 14.364's server entry did not honor the CLI hostname as a listen-address restriction for this run.
  Evidence: the first owned process listened on `::` and was rejected. After stopping it and rebuilding the temporary world from the unchanged source, a narrow ignored preload forced only port 30002 to `127.0.0.1`; the accepted process had no external listener or established remote connection and was stopped after the probe.
- Observation: The first Task 6 workbook refresh was mechanically valid but still failed visual acceptance because the new baseline panel shared columns with generic detail-table sizing.
  Evidence: export/re-import, formulas, validation ranges, and 16 previews passed, but the Overview preview visibly collapsed the heading, source hash, and blocker text. The ignored builder was corrected to restore panel widths after table styling and use a concise blocker summary, then the entire workbook and preview set were rebuilt and re-reviewed.
- Observation: A generated aggregate summary can contradict its own correct detail rows unless the projection is asserted against the real row schema.
  Evidence: the Compendiums and Adventures dataset correctly contained one `type: Adventure` row and four other pack rows, while the summary projected 0/5 by reading nonexistent `kind`; it also retained a stale Task 4 runtime reference. Commit `44e19a4` added positive real-schema coverage, switched the projection to `type`, corrected Task 6 wording, and the full real-world CLI regeneration now reports 1/4 consistently in summary and workbook detail.

## Decision Log

- Decision: implement v14 Item artwork as an opt-in generator capability with `off` and `safe` modes only.
  Rationale: the user explicitly chose no default output change. Safe mode accepts only deterministic overrides, existing semantic artwork, exact locked-compendium identities, or high-confidence generalized matches; every ambiguous result falls back to the locked dnd5e type default and remains visible in a separate review report.
  Date/Author: 2026-07-31, Codex with user direction.
- Decision: keep manual artwork corrections in a versioned external JSON selector map instead of expanding CanonicalFeature and source Markdown/YAML.
  Rationale: the requested capability is name-based output resolution. An external map provides stable actor-scoped/global corrections without coupling artwork preferences to parser semantics or widening the Intake verification contract.
  Date/Author: 2026-07-31, Codex with user direction.
- Decision: unify the supported v14 patch baseline at Foundry 14.364 with dnd5e 5.3.3.
  Rationale: the user selected the exact project-local runtime that can provide catalog provenance, path checks, and real import acceptance. Remaining 14.361 declarations must be updated rather than presenting mixed-version evidence.
  Date/Author: 2026-07-31, Codex with user direction.

- Decision: Integrate each remaining branch according to semantic ownership rather than replaying every historical tree change.
  Rationale: The Item branch owns one missing workflow and was merged with current v12/v14 semantics plus a side-effect repair. Actor and authenticated-crawl histories are already represented by newer accepted implementations, so `ours` merge commits truthfully close their topology without resurrecting stale code, sensitive captures, or generated artifacts. Dirty uncommitted worktrees remain outside branch integration.
  Date/Author: 2026-07-29, Codex with user authorization.
- Decision: Restrict Item dual-artifact sync to the files promoted by the current invocation.
  Rationale: An Item-only CLI command must not regenerate unrelated Actors or apply global stale-output cleanup. The shared sync workflow now distinguishes full-vault synchronization from explicit partial input selection, preserving existing full-sync behavior and manifest cleanup.
  Date/Author: 2026-07-29, Codex.

- Decision: Close `CHAT-MEM-001` at the approved bounded runtime boundary, while explicitly rejecting an absolute zero-render/zero-memory claim for hidden avatars.
  Rationale: all automated, deterministic-package, GM A/B, re-render, database-integrity, popout lifecycle, localization, avatar-mode, and non-GM privacy gates now pass. The plan explicitly leaves long-session and exhaustive third-party-card behavior user-observed, and the locked hook order proves only post-hook DOM/cache removal rather than prevention of every transient browser allocation.
  Date/Author: 2026-07-27, Codex.
- Decision: Keep the installed cap-2 patch in place while `SEQ-MEM-001` is `blocked_external`, and do not call the runtime acceptance complete from disk or HTTP evidence.
  Rationale: apply/backup/restore are mechanically closed and the server is healthy, while the remaining `/game` checks are read-only and recoverable once the user authenticates. Restoring now would discard the authorized implementation without resolving the authentication dependency.
  Date/Author: 2026-07-27, Codex.
- Decision: Do not use a password store, guess a local Foundry password, select a user account speculatively, or inspect world LevelDB to bypass the login.
  Rationale: the approved plan requires a current browser session and explicitly separates safe runtime inspection from credential or offline world-data access.
  Date/Author: 2026-07-27, Codex.

- Decision: Use dnd5e native `applyEnchantment` and versioned `dnd5e.applyEnchantment` / `dnd5e.restCompleted` hooks for rite lifecycle, rather than relying on DAE to expire Item-embedded enchantments.
  Rationale: exact local runtime probes proved the native damage bridge and disproved DAE rest cleanup for owned weapon effects.
- Decision: Keep context-sensitive Blood Hunter semantics visibly assisted when the locked runtime does not provide sufficient trigger context.
  Rationale: marking the target, providing an exact damage/effect helper, and stopping with a clear prompt is safer than guessing a damage type, controller, weapon, undead type, attack source, or Pact slot.

- Decision: Repair both 2026-07-25 findings through guarded project workflows outside world LevelDB.
  Rationale: an exact-source bundle patch is reversible and testable, while Plutonium's supported feature side-data boundary can enrich the user's homebrew without directly mutating Callum or the world compendium. The feature-name mapping is an `explicit-exception` authorized for this user-owned `BloodHunter2024` source, not a generalized parser inference.
- Decision: Limit runtime work to one short smoke and leave full Blood Hunter play acceptance to the user.
  Rationale: the user explicitly prefers code/data verification and will validate the resulting class in Foundry; this plan therefore cannot claim complete combat automation or full runtime acceptance.
- Decision: Represent source-proven action economy, rolls, targets, shared Blood Curse consumption, and uses with native dnd5e Activities, but retain conditional state/effect automation in chat flavor.
  Rationale: the locked dnd5e 5.3.3 schema and Plutonium 2.15.6 side-data/resource-reference contract support these fields. Automatically enforcing charm, fear, movement, weapon riders, form changes, and conditional amplification would require additional effect/module semantics not proven by this bounded task.

- Decision: Treat the accepted cor-cotn audit and final workbook as read-only decision support, and accept the copied-world performance baseline only as strict `partial`.
  Rationale: The graph narrows 349 no-Scene Actors to 2 static candidates but still cannot prove dynamic name lookup or module-private serialization absent; 533 broken Token/Actor rows and 2,289 missing world-local asset references require separate repair decisions. The workbook is complete and the disk layer is measured, but initialization, Canvas/GPU, and continuous runtime remain blocked until the required in-app Browser is available.
  Date/Author: 2026-07-24, Codex.
- Decision: Reject non-loopback copied-world startup and do not substitute another browser when the plan-required in-app Browser is unavailable.
  Rationale: A wildcard listener broadens local exposure, while another browser would change the specified observation boundary and could require unsupported authentication handling. Recopying from the unchanged source, accepting only `127.0.0.1:30002`, and publishing truthful blocked layers preserves the safety and evidence contracts.
  Date/Author: 2026-07-24, Codex.
- Decision: Preserve both rejected audit bundles as ignored recoverable evidence and publish only privacy-safe aggregates.
  Rationale: The failed bundles prove why command success and file hashes were insufficient, while their object IDs, field paths, and content-derived evidence do not belong in Git. The tracked report contains no player names, Journal bodies, Macro source, credentials, or bulk world content.
  Date/Author: 2026-07-24, Codex.

- Decision: Model prepared NPC casting as source-evidenced cantrip and per-level slot usage groups, generate native Actor spell pools, and hydrate each prepared ref with a native Cast Activity that consumes `spellSlot`.
  Rationale: This preserves the source's prepared-list and slot-pool semantics, matches locked dnd5e 5.3.3, and avoids misrepresenting shared spell slots as independent per-spell daily uses. It is a generalized source/schema rule, not a Pellinost or spell-name exception.
  Date/Author: 2026-07-19, Codex.
- Decision: Keep runtime import and production hydration outside INTAKE-003 acceptance for this user request.
  Rationale: The user explicitly prohibited starting local Foundry, runtime import testing, and production-server operations. Completion may prove the portable pending boundary through deterministic structure, locked references, fakes, verifiers, and source review, but must report runtime as untested in this run.
  Date/Author: 2026-07-19, Codex with user instruction.
- Decision: Reject the existing Bol'bara bundle and rerun from the immutable raw source after generalized TDD repairs.
  Rationale: The stored IR is the post-repair overwrite and cannot reconstruct the original extraction; decisions do not own deterministic findings and some generated decision candidates are structurally invalid. A fresh run through the supported workflow is safer than hand-editing IR or final JSON.
  Date/Author: 2026-07-19, Codex.
- Decision: Preserve source-explicit creature subtype/race text in `生物类型备注` and clear inherited initiative whenever the source omits initiative.
  Rationale: `humanoid` is the Foundry-compatible base type, while `地精类` / `任意种族` are distinct source semantics that belong in `details.type.custom`; golden-master initiative is not a schema default and must not become an unsourced mechanic.
  Date/Author: 2026-07-19, Codex.
- Decision: Treat AI review as an adversarial semantic layer whose blocking findings may be removed only by narrow deterministic disproof.
  Rationale: The Pellinost review showed cross-candidate and hidden-manifest false positives. Candidate evidence, source wording, canonical IR, and the generated Actor can prove those specific claims false without weakening true component-waiver or duplicate-feature gates.
  Date/Author: 2026-07-19, Codex.

- Decision: Canonicalize one HTML `&amp;` escape layer only in native cached Spell and source Effect rich-text descriptions before strict getter-versus-created projection comparison.
  Rationale: Foundry 14.364 legitimately stores Babele's `&Reference[...]` rich text as HTML-equivalent `&amp;Reference[...]`; accepting that representation change fixes the reproduced false mismatch while retaining exact comparison for names, Activities, Effect mechanics, non-description fields, and genuinely different description text.
  Date/Author: 2026-07-19, Codex.

- Decision: Treat the portable manifest as an exact versioned object at runtime and share one allowed-key traversal between validation and hashing.
  Rationale: TypeScript interfaces disappear at runtime. Rejecting unknown nested fields prevents future semantic data from validating without entering the manifest hash, while explicit flag projection prevents unrelated modules from creating false manual-edit conflicts.
  Date/Author: 2026-07-19, Codex.

- Decision: Keep feature `activityType` and `activationType` independent through AI IR, deterministic Markdown, parser, and Actor generation.
  Rationale: A utility trait may explicitly consume a bonus action; using the section or mechanic category as activation loses source action economy. The rule is source-derived and applies to action, bonus, reaction, legendary, and explicit special activation without a creature-name branch.
  Date/Author: 2026-07-17, Codex.
- Decision: Preserve conditional AC that has no native Actor note field as a deterministic biography line formatted `护甲等级：<base>（<literal condition>）`.
  Rationale: This keeps the exact conditional mechanic visible without inventing automation or contaminating the structured base AC. The renderer and independent review prompt share this bounded literal-preservation contract.
  Date/Author: 2026-07-17, Codex.

- Decision: Bridge the authorized Chrome session in place without reading browser credential stores.
  Rationale: Authenticated board and print-page HTML were available through the user-authorized session; saving page content for the project parser proved access while avoiding cookie, password, local-storage, or header export. Raw authenticated crawl/session artifacts remain local and untracked.
  Date/Author: 2026-07-16, Codex with user authorization.
- Decision: Preserve conditional mechanics literally when the target schema cannot represent their branching/staged behavior faithfully.
  Rationale: A replacement damage formula is not simultaneous damage, and first/second failed-save outcomes are not simultaneous effects. Base/additive mechanics remain structured while conditional branches stay in the item description rather than being invented as unconditional automation.
  Date/Author: 2026-07-16, Codex.

- Decision: Use this repository file, not chat context, memory, Goal text, or checkpoint files, as the authoritative issue ledger.
  Rationale: Context compression and generated memories are helpful but lossy; a versioned living document is reviewable and recoverable.
  Date/Author: 2026-07-15, Codex with user authorization.
- Decision: Keep one master plan and create focused milestone plans only when a milestone requires multiple independent code changes.
  Rationale: One ledger prevents split-brain status, while focused plans avoid an unmaintainable all-subsystem code recipe.
  Date/Author: 2026-07-15, Codex.
- Decision: Repair semantic AC generation, verifier coverage, and contaminated acceptance evidence before type, CI, architecture, or product expansion.
  Rationale: These form one P0 correctness chain and currently invalidate published acceptance claims.
  Date/Author: 2026-07-15, Codex.
- Decision: Treat current user changes as owned workspace state and append routing rules without replacing them.
  Rationale: Root instructions explicitly prohibit losing relevant dirty changes or creating a clean worktree from stale HEAD.
  Date/Author: 2026-07-15, Codex.
- Decision: Do not convert production-environment or authenticated crawl gaps into implicit authorization.
  Rationale: A long-running Goal extends persistence, not access or mutation authority.
  Date/Author: 2026-07-15, Codex.
- Decision: Share one boundary-safe `extractSourceDerivedAcEffect()` function between generation and verification.
  Rationale: Duplicated regex semantics would allow the verifier and generator to drift; the shared function is source-derived, covered by positive and close-negative corpus tests, and contains no creature/action-name branch.
  Date/Author: 2026-07-15, Codex.
- Decision: Track the wrapped English trait-title defect as SEM-002 and repair it in a separate TDD cycle before completing Milestone 2.
  Rationale: The defect is real and P0 for source fidelity, but it is independent of the AC boundary change; separating it preserves reviewability and prevents a passing batch command from hiding semantic failure.
  Date/Author: 2026-07-15, Codex.
- Decision: Treat bare condition-word automation as SEM-003 instead of weakening the White Tusk fixture expectation.
  Rationale: Moving an invented effect from the wrong item to the newly restored item is still semantic failure. Effects must come from a clause that explicitly applies a status to a target, not from mere word presence.
  Date/Author: 2026-07-15, Codex.
- Decision: Implement SEM-003 as one source-derived explicit-application extractor shared by legacy and enhanced condition generation.
  Rationale: Target clauses, save-failure outcomes, replacement outcomes, and Chinese passive application forms are corpus-supported sources of inflicted conditions; prerequisites, immunity, already-state, self-state, and termination clauses are not. Sharing the extracted status set prevents the two generator paths from drifting.
  Date/Author: 2026-07-15, Codex.
- Decision: Accept Milestone 2 only after rerunning both locked runtime profiles, not merely after clean JSON regeneration.
  Rationale: The invalid earlier reports proved that schema and verifier success could coexist with invented mechanics. The runtime retest confirmed actual sheets, Activity messages, unchanged AC, White Tusk item boundaries, and the Bleeding Activity/effect binding, while retaining the overall production-equivalent `Partial` boundary.
  Date/Author: 2026-07-15, Codex.
- Decision: Use one typed `gitCommand` boundary for both anti-overfit discovery and reference verification.
  Rationale: Command failure semantics should not drift between gates. The shared result retains the rendered command, status or spawn code, stdout, and sanitized stderr; callers either require success or expose a domain-specific `git-error` state.
  Date/Author: 2026-07-15, Codex.
- Decision: Actor generation is offline by construction unless a workflow explicitly injects a translation service; credentials alone are configuration data, not permission to use the network.
  Rationale: Ordinary CLI, vault, and Web output must be reproducible across machines and must not silently change because `.env` exists. Explicit translation and AI-normalize workflows remain available and observable.
  Date/Author: 2026-07-15, Codex.
- Decision: Derive a behavior operation's Activity target from the states it applies or removes, preserve true self-only operations, and fail closed when one operation mixes self and selected targets.
  Rationale: Local Foundry acceptance proved that a structurally valid self-targeted helper could not remove a condition from the intended creature. The referenced state target is the source-derived authority; failing mixed targets avoids silently choosing the wrong Actor.
  Date/Author: 2026-07-31, Codex.
- Decision: Keep all-movement changes GM-assisted when core projection cannot update every active movement mode faithfully.
  Rationale: Projecting only `system.attributes.movement.walk` for a source clause that halves speed is semantically incomplete for swimming or flying creatures. A visible exact operation is safer than partial automation that appears complete.
  Date/Author: 2026-07-31, Codex.

- Decision: Enforce production coverage through a repository-owned fail-closed LCOV filter instead of relying on Bun 1.3.8's hanging full-suite `coverageSkipTestFiles=true` path on Windows.
  Rationale: The gate still excludes test implementation records before computing thresholds, rejects zero production records, and records the runtime-specific workaround rather than hiding it.
  Date/Author: 2026-07-15, Codex.
- Decision: Run instrumented full-suite coverage at bounded concurrency 2 in the aggregate CI gate.
  Rationale: Concurrency 4 made child-process crawler tests scheduling-sensitive under instrumentation; concurrency 2 repeatedly completes in about 20-23 seconds while preserving the full 83-file/669-test scope.
  Date/Author: 2026-07-15, Codex.
- Decision: Keep ART-001/ART-002 open and track the Shield replacement failure separately as SEM-004 instead of accepting artifact cleanup on file-count evidence.
  Rationale: Git history preserves the removed scratch artifact, but the project's supported CLI must preserve the source's actual rarity, action boundary, activation, and recovery before those scratch outputs can be declared safely superseded. The repair must be source-derived and generalized; no Shield-name branch is authorized.
  Date/Author: 2026-07-15, Codex.
- Decision: Close Milestone 6 after SEM-004 restored and exceeded the useful behavior present in historical scratch output, while keeping the newly discovered broader Item defect visible as SEM-005 rather than expanding artifact cleanup indefinitely.
  Rationale: Artifact retention and Item feature completeness are separate concerns. The removed copies are reproducible, locally retained, and recoverable from Git; none contained the missing armor/duration/rider correctness. SEM-005 is tied to the planned standalone Item live acceptance so those defects cannot disappear from the program.
  Date/Author: 2026-07-15, Codex.
- Decision: Close ARCH-001 after two narrow Actor responsibility extractions and defer Item-parser and Web-client refactors to their semantic/security milestones.
  Rationale: Measured coupling selected `actor.ts`, but mixing SEM-005 feature work or M8 deployment behavior into a refactor would make output stability unprovable. Independent commits plus exact v12/v14 controls preserve reviewability.
  Date/Author: 2026-07-15, Codex.
- Decision: Support both a loopback-safe default and an explicit authenticated public/proxied Web mode, using the ExecPlan fallback because no different user deployment choice was provided.
  Rationale: Binding to `127.0.0.1` prevents accidental network exposure. Public/proxied operation remains possible only with explicit mode plus a server-side bearer token; browser users authenticate at the reverse proxy, which injects that token without exposing VPS secrets to the client application.
  Date/Author: 2026-07-15, Codex.
- Decision: Keep PROD-002/SEM-005 open at the browser-upload boundary and continue Task 3's authorized code/CLI work instead of bypassing the extension permission or writing Foundry data directly.
  Rationale: A direct database/runtime mutation would not prove the supported import workflow and would violate the browser skill's upload safety boundary. The user can enable the documented Chrome permission later; meanwhile DAE parsing/generation and corpus work are independent and reversible.
  Date/Author: 2026-07-15, Codex.
- Decision: Treat process-local request/job controls as bounded single-process defenses, not as a substitute for reverse-proxy user authentication, TLS, firewalling, or operating-system limits.
  Rationale: The implementation now prevents the confirmed header spoofing, unbounded-body, distributed-window, and retention defects within one Bun process, while the documentation keeps the remaining infrastructure boundary explicit instead of claiming a complete public identity or distributed quota system.
  Date/Author: 2026-07-15, Codex.
- Decision: Order Milestone 9 as standalone Item correctness/runtime, DAE/MIDI behavior/runtime, corpus expansion, then documentation reconciliation.
  Rationale: The support matrix must summarize accepted product behavior rather than planned behavior. Repairing and exercising the two missing semantic paths first prevents another mechanically polished report from hiding template leakage or an untested module claim.
  Date/Author: 2026-07-15, Codex.
- Decision: Describe `isDamaged` expiry as locked `modded-v14` DAE+MIDI behavior, not DAE-alone behavior.
  Rationale: DAE 14.0.12 owns and registers the duration key, while MIDI-QOL 14.0.9 consumes damage workflow state and removes the effect. Naming both components preserves the real runtime boundary and prevents source inspection from being overstated as execution proof.
  Date/Author: 2026-07-15, Codex.
- Decision: Publish a bounded corpus matrix rather than a single broad parser-confidence label.
  Rationale: Nineteen executable categories expose which language, document type, target, profile, and semantic/negative projections are actually covered. The same matrix names what it cannot prove, so a large passing test count cannot silently become a Foundry runtime or arbitrary-input support claim.
  Date/Author: 2026-07-15, Codex.
- Decision: Make `current-support-matrix.md` the canonical present-tense claim layer and amend dated reports append-only.
  Rationale: Historical reports must retain what was known and what failed at their timestamps. A separate current matrix can reconcile later evidence without erasing chronology, while explicit links and status vocabulary prevent narrow Pass rows from becoming blanket support claims.
  Date/Author: 2026-07-15, Codex.
- Decision: Treat M10 as pre-final evidence while M9 runtime and external findings remain open, rather than using a clean repository gate to close the Goal early.
  Rationale: Type, test, coverage, reference, build, CLI, and source checks prove repository and generation health, but they cannot prove Shield equip/Activity behavior, DAE+MIDI effect removal, authenticated crawling, or exact production-equivalent coexistence.
  Date/Author: 2026-07-15, Codex.
- Decision: Mark the persistent Goal `blocked` after the same external conditions remained at the third consecutive goal continuation.
  Rationale: All authorized repository-only work and the unblocked M10 audit are complete. Continuing automatically cannot enable the user's Chrome extension permission, authorize a login session, supply a valid protected package, authorize production changes, or accept those items as remaining scope. `blocked` preserves the full objective and avoids reporting an indefinitely active Goal with no legal next action.
  Date/Author: 2026-07-15, Codex.
- Decision: Treat Chrome file access and protected production modules as independent boundaries.
  Rationale: Enabling Chrome file-URL access unblocked local JSON import and allowed PROD-001 plus most of PROD-002 to run. It cannot repair an invalid MCDM package signature or grant a protected package license, so PROD-005 remains external instead of being misdiagnosed as a browser permission problem.
  Date/Author: 2026-07-15, Codex.
- Decision: Close PROD-005 as a stale-scope/report defect, not as a compatibility Pass.
  Rationale: The 88-ID figure was a 2026-07-11 production snapshot. The 2026-07-12 cleanup record explicitly limited 79 to the local baseline and separately recorded later production changes without a post-change count. Requiring exact 88-ID parity, including protected MCDM, therefore contradicted the later user-directed intended state. Future production coexistence work must begin with a fresh read-only inventory and explicit scope.
  Date/Author: 2026-07-16, Codex.
- Decision: Do not use native file selection or download dialogs for Chrome-extension-controlled Foundry document transfers.
  Rationale: Upstream Playwright MCP and OpenAI Codex reports reproduce `DOM.setFileInputFiles: Not allowed` in extension mode even though normal non-extension Playwright succeeds. Foundry 14.364 already exposes `importFromJSON()` and `exportToJSON()`; transferring JSON text into the former and capturing the latter's exact Blob preserves Foundry migration/export behavior while bypassing only the operating-system dialog and avoiding direct database writes.
  Date/Author: 2026-07-16, Codex.
- Decision: Keep Codex OAuth outside the formal provider contract and use it only through a short-lived, source-audited, loopback OpenAI-compatible bridge for local acceptance.
  Rationale: OpenAI documents ChatGPT sign-in for Codex and Platform API keys for general API use; an OAuth bridge is therefore an unofficial compatibility layer. Keeping the production provider API-key-compatible, forcing loopback, avoiding credential copies, and stopping the process after the run preserves the plan's bounded-call and secret-handling rules.
  Date/Author: 2026-07-17, Codex with user authorization.
- Decision: Scope Actor review projections to source-requested mechanics plus additional explicitly configured Actor mechanics.
  Rationale: Foundry's complete derived skill table and default-zero senses are runtime representation, not invented source claims. Conversely, nonzero unlisted proficiency, attack Activities, damage, saves, and statuses are explicit mechanics and remain visible and blocking. This avoids false reviewer findings without hiding real automation drift.
  Date/Author: 2026-07-17, Codex.

## Outcomes & Retrospective

Program initialization outcome on 2026-07-15:

- The complete known problem set is now represented by stable IDs and explicit acceptance conditions.
- Current baselines were remeasured instead of copied blindly from compressed conversation context.
- The repository now has a single recovery entrypoint suitable for a persistent Goal and future fresh tasks.
- The persistent Goal is active and points back to this file rather than attempting to carry the full program in Goal text.
- No business code or generated Actor JSON was modified during initialization.
- Implementation and closure outcomes will be appended here after each milestone; historical entries must not be rewritten to hide failed or superseded evidence.
- Milestone 7 reduced ActorGenerator responsibility and change coupling without changing real v12/v14 output: localization and target metadata now have narrow collaborators, independent commits, direct characterization, and exact CLI controls.
- Milestone 8 changed the Web deployment contract from implicit public/unauthenticated assumptions to a loopback-safe default and explicit authenticated public/proxied mode. Real browser Actor/ZIP workflows remained semantically usable, while trusted proxy, body, rate, job, and retention boundaries now fail closed and are documented honestly.
- Milestone 11 closed the last external Goal boundary through an explicitly authorized in-place Chrome session. The live run added 47 tracked project inputs and local ignored Actor outputs, exposed five semantic failure classes that mechanical success missed, repaired them with generalized tests, and accepted the corpus only after 47/47 verification plus expanded source projections.
- The cor-cotn world audit now has an accepted privacy-safe static checkpoint and final 16-sheet decision workbook after mandatory semantic and visual rejections. It distinguishes 349 no-Scene Actors from 2 static candidates, surfaces 533 broken Token/Actor rows, preserves all detailed evidence locally, and records a measured disk baseline. Runtime-performance acceptance remains deliberately partial: three browser-dependent layers are blocked and are not inferred from server readiness, JSON generation, or process memory.
- Final aggregate evidence is 753 tests / 2,959 expectations, 87.61% production lines / 88.50% production functions, 109 audited sources, locked dnd5e reference success, Web build success, and offline Actor smoke success; post-stage hygiene separately passes across 1,655 tracked paths. Production remains untouched and exact production-module coexistence remains a separately bounded Partial claim, not an unfinished Goal requirement.

- `ICON-001` closed the v14 placeholder-artwork gap without changing default output: a deterministic 7,337-path core/dnd5e catalog and shared opt-in resolver now produce reviewable exact/safe/fallback decisions across all supported generation entry points. The real Nightgaunt artifact passed source verification, visual inspection, Foundry import/preparation and six-image decode; the existing-output audit quantified the conservative boundary instead of claiming unique art for every feature.
- The latest 11-Actor Netherdeep batch now exercises the intended manual-review path rather than weakening the safe threshold: 75 actor-scoped external overrides plus 3 preserved and 32 exact locked-catalog decisions cover all 110 Items with no generic fallback. Visual review caught and corrected both a semantically wrong bee icon for a fish swarm and an overly broad bilingual selector collision. The Actors still carry their independent source-derived GM-assistance `needs_review` boundary; artwork acceptance does not promote those mechanics to automatic.

## Change Note

2026-07-19: Opened `INTAKE-003` after the user's real two-NPC Intake proved that prepared NPC spellcasting cannot traverse the current AI IR, deterministic Markdown, Actor slot pools, or resolver Cast support. The first AI result was rejected rather than promoted. The focused plan is `milestones/12-prepared-npc-spellcasting-intake.md`; production edits begin only after RED tests, and this run will not start Foundry or touch production.

2026-07-19: Opened `INTAKE-004` from a read-only audit of the rejected Bol'bara candidate. The run will not be resumed or manually repaired: source metadata ownership, Chinese waiver recognition, duplicate provenance, hybrid range preservation, and conditional legendary literal output require generalized workflow fixes plus fresh extraction.

2026-07-16: Started the separately authorized AI-first monster intake program after a real Lurker source disproved the Legacy plaintext support claim. Added INTAKE-001, INTAKE-002, and VER-002 as new in-progress findings without rewriting the earlier closed hardening chronology. The approved path is a parallel evidence-backed AI pipeline with deterministic Markdown/CLI generation, strict failure, independent AI review, bounded repair, and local-only runtime acceptance.

2026-07-16: The implementation now reaches CLI and Web with focused intake, CLI, runner, API, and v12/v14 workflow slices passing. Semantic projection coverage was expanded beyond the historical verifier to source-relevant totals and action mechanics, and needs-review candidates are not registered as formal Actor downloads. Closure remains intentionally withheld: the configured OpenAI key is empty, and local Foundry browser transfer awaits approval to build the `browse` helper. INTAKE-001, INTAKE-002, and VER-002 remain `in_progress` until real-model and runtime evidence is recorded.

2026-07-16: User approved the one-time browser helper build. The existing packaged binary was incomplete because its server bundle was absent, so current gstack source was cloned and built under ignored `.local`, and the matching Playwright Chromium was installed. The Lurker then passed the local Foundry 14.364/dnd5e 5.3.3 import, open-sheet, and runtime readback gate; cleanup and server stop completed. Real model acceptance remains the only product gate, pending a deliberate choice between official Codex CLI OAuth use and an unofficial OpenAI-compatible OAuth proxy.

2026-07-17: Completed the bounded Codex OAuth acceptance without treating OAuth as a Platform API key. A temporary loopback proxy drove real `gpt-5.4` discovery/extraction/review. TDD repairs moved unique quote anchoring out of the model, rejected or removed only unanchorable whitespace coverage, prevented YAML `null` leakage, and corrected the review projection so Foundry-derived skills/default senses and non-attack items are not presented as invented mechanics. One real source/IR resume reached accepted with zero deterministic and AI findings; independent fresh stochastic failures remained `needs_review` with no promotion. The proxy was stopped and port 8787 was closed.

2026-07-17: Closed the AI Intake program after the remaining collection, negative, deterministic-partition, explicit-AC-conflict, aggregate, Foundry Lab, and mobile Web gates passed. The accepted Lurker preserves the complete source projection in fresh v12/v14 Actors and local Foundry readback. A two-monster real run discovered exactly two and stayed review-gated; missing CR and conflicting AC negatives stayed unaccepted, with the latter independently detected from source even when AI omitted the uncertainty. Final aggregate evidence is 791 tests / 3,093 expectations and the local helper services are stopped.

2026-07-15: Created the initial self-contained remediation program after a repository review and fresh baseline verification. The plan records all confirmed findings, distinguishes in-repo work from external authorization boundaries, and defines mechanical plus semantic completion gates so context compression cannot silently drop work.

2026-07-16: User authorization resolved the final authenticated-session boundary. The live GoddessFantasy pipeline was first rejected on semantic review, repaired through SEM-006/SEM-007, rerun through the project CLI, and accepted with 47/47 verifiers plus expanded live projections. PROD-003 is closed and the persistent Goal has no remaining authorized finding or external blocker.

2026-07-15: Completed Milestone 1's implementation and mechanical verification. SEM-001 and VER-001 remain short of closure until the full affected v14 acceptance batches are regenerated and semantically reviewed in Milestone 2. Recorded the newly reproduced `.env`-driven network attempt under DET-001.

2026-07-15: Regenerated both v14 acceptance batches and confirmed the AC contamination is gone mechanically. During mandatory source review, discovered and validated SEM-002 in White Tusk Shaman; kept Milestone 2 open and moved to a separate fixture-backed parser/generator repair instead of preserving the prior false `Pass` claim.

2026-07-31: Prepared the standalone Session Monitor for a scope-separated `master` commit. Code review found and corrected the companion's stale `1.1.0` report/heartbeat version after the browser module had advanced to `1.1.1`; the real Chrome cold-restart test now asserts the recorded companion version. Release review also found that copying CRLF static resources produced a same-machine-stable but checkout-dependent archive; the builder now writes normalized LF resources, and two fresh Windows builds reproduce the deployed five-file ZIP SHA-256 `31098AD6EB861D641DC67BED9B51BA889058EA382CDDABC2BBC6D1C18C492CC4` plus every deployed file hash. The same read-only production check used for release truth proved that PID 6480 still binds port 8080 to `E:\Bill\fvtt_v13\data`, the complete five-file 1.1.1 module remains under that DataPath, all five module resources return HTTP 200 through loopback 8080, and the public 8080 manifest returns 1.1.1. No GM login or live LevelDB read was used, so current activation remains unclaimed; the historical normal module-management activation event, incomplete post-restart UI smoke, four-hour run, and non-GM evidence remain separately labeled.
Final Session Monitor repository verification passed `1575 / 1575` tests with `7,444` assertions, 85.41% production-line / 88.13% production-function coverage, 203-source anti-overfit, 1,901-path hygiene, both typechecks, locked dnd5e 5.3.3 references, Web build, offline Actor smoke, and staged diff checking.

2026-07-15: Mechanically repaired SEM-002 with generalized wrapped-emphasis handling and fixture-backed structural verification. The corrected item boundary exposed SEM-003: the bare condition scanner still invents `Unconscious` from a transformation termination clause, so Milestone 2 remains open pending a separate condition-semantics TDD cycle.

2026-07-15: Closed SEM-001, SEM-002, SEM-003, VER-001, and DOC-001 after a generalized condition-clause repair, 656-test full regression, two regenerated 6/6 v14 batches, six focused verifier checks, source review, and core/minimal-modded runtime re-acceptance. The reports now preserve the false-pass chronology and keep production-equivalent coexistence explicitly `Partial/Fail`.

2026-07-15: Closed GATE-001 and GATE-002. Git failures can no longer become empty successful audits, `--all` rejects a zero-source corpus, reference verification distinguishes unreadable Git state from a readable wrong revision, and both unit plus actual CLI failure paths were exercised before the real 99-source/reference success checks.

2026-07-15: Closed TYPE-001, CI-001, COV-001, and DET-001. Production and supported broad typechecks are zero; ordinary Actor/Web generation is offline despite ambient credentials; explicit AI modes are observable and provider reasoning is sanitized; production-only LCOV thresholds, Windows CI, and an offline source-faithful Actor smoke are enforced. A clean real browser rerun closed the earlier semantic failure rather than treating the first successful download as acceptance.

2026-07-15: Started Milestone 6 with a focused artifact-boundary plan. No tracked output or scratch file has been removed yet; retention decisions require a complete consumer/origin/reproducibility inventory first.

2026-07-15: Completed the 178-path artifact inventory, policy, fail-closed hygiene tool, planted regression, and path-scoped index cleanup while retaining ignored local recovery copies. Mandatory Item source review then rejected M6 closure: the current Shield workflow loses rarity and Protective Field semantics. Added SEM-004 and moved into a fixture-backed parser/generator repair before declaring the historical scratch outputs superseded.

2026-07-15: Closed SEM-004, ART-001, ART-002, and Milestone 6. The exact Shield source now generates schema-valid `veryRare`, two named Activities, a reaction, and one dawn-recovering use for v12/v14; all 693 tests and aggregate gates pass. The same semantic review discovered broader standalone Item template/mechanics defects and recorded them as SEM-005 for generalized repair plus PROD-002 live-runtime acceptance rather than overstating M6 completion.

2026-07-15: Closed ARCH-001 and Milestone 7. `ActorLocalizer` and target-version metadata normalization were extracted in separate commits with six direct characterization tests; pre/post CLI outputs for White Tusk Shaman were identical after normalization for both v12 and v14, semantic projections remained source-faithful, and the 699-test aggregate gate passed.

2026-07-15: Closed WEB-001, WEB-002, WEB-003, and Milestone 8. Default Web/API startup binds only to loopback; explicit public/proxied mode requires a server-side bearer and configured literal trusted proxies. Pre-materialization body checks, Bun's 25 MiB ceiling, per-client/global request and job caps, and active-safe bounded cleanup pass focused abuse tests. Process probes fail closed, authenticated capabilities agree with the deployment docs, the real browser produced source-faithful White Tusk JSON and a semantically inspected two-Actor ZIP, and the aggregate gate passes 717 tests.

2026-07-15: Completed M9 Task 1 while keeping SEM-005 open for its required runtime half. Neutral Item schemas no longer inherit the first reference item's mechanics; generalized bilingual/source-derived rules restore Shield base/magical armor, weight, STR attack/damage, activity descriptions, duration/concentration/aura/recovery, and conditional prone linkage. Real v12/v14 CLI artifacts match the source projection, an unrelated Jewel remains stable, and the aggregate gate passes 731 tests / 2,896 expectations plus typecheck, coverage, anti-overfit, hygiene, reference, build, and smoke gates. The first aggregate run exposed and rejected a stale structural test that required Amulet-of-Health mechanics; it was replaced by a neutral `assertEqualStructure()` contract before acceptance.

2026-07-15: M9 Task 2 reached real project-local Foundry import preflight but remains open: the matrix world and Import Data dialog worked, while Chrome's disabled file-URL extension permission blocked selection of the generated JSON. No import claim was made. The local server was stopped, port 30001 released, and options restored; PROD-002/SEM-005 retain an exact UI resume point. Started Task 3 and moved PROD-001 to `in_progress` so independent DAE code/CLI work can continue without bypassing the external browser permission.

2026-07-15: Completed M9 Task 3's code and CLI half without overstating runtime acceptance. A generalized per-status duration extractor passes English/Chinese/following-sentence positives plus neighboring-damage and mixed-duration negatives; core and modded-v14 CLI Actors are source-equivalent except for exactly one DAE `isDamaged` flag. The aggregate gate passes 738 tests / 2,921 expectations. Locked source inspection corrected the support model: DAE 14.0.12 registers the key, while MIDI-QOL 14.0.9 removes effects after actual damage, so PROD-001 remains open for a DAE+MIDI runtime exercise after Chrome upload permission is enabled. PROD-004 moved to `in_progress` for the independent corpus-matrix work.

2026-07-15: Closed PROD-004 with `docs/acceptance/current-corpus-matrix.md`. The matrix records 19 executable and bounded categories across the requested language, Actor/Item, version, profile, effect, parser, close-negative, and unrelated-regression dimensions. The focused command passes 148 tests / 656 expectations and aggregate CI passes 738 / 2,921; explicit exclusions prevent those results from upgrading the still-blocked Foundry runtime, authenticated crawl, or production-equivalent module claims.

2026-07-15: Closed DOC-002 after publishing the thirteen-layer current support matrix, reconciling README and the safe delivery checklist, appending dated amendments to the runtime/source/modded reports, preserving copied-world authentication chronology, recording safe external resume boundaries, validating every named evidence path, and running a clean current-claim contradiction scan. Historical statements remain visible before their amendments. PROD-003 remains blocked on explicit authenticated-session authorization and PROD-005 remains Fail/Partial on the exact production-equivalent gate.

2026-07-15: Completed M10's unblocked pre-final audit without closing the milestone or Goal. Both typechecks, 738 tests, production coverage (87.54% lines / 88.40% functions), 109-source anti-overfit, dnd5e 5.3.3 reference verification, Web build, 116 Foundry Lab tests, and 1,605-path hygiene pass. Five representative outputs were regenerated only through the CLI; three Actor verifiers and the explicit source projection pass. The browser workflow and new local Foundry runtime behaviors remain unaccepted, so M9/M10 stay open.

2026-07-15: The strict blocked audit reached its third consecutive goal continuation. Live state still shows only the three user-owned dirty files, port 30001 stopped, and `options.json` restored to `cor-cotn`; no new authority or external state appeared. The persistent Goal is therefore `blocked`, not complete. Resume it without changing scope after Chrome file-URL access is enabled, authenticated crawl authorization/session is granted or explicitly accepted as remaining, and the valid exact module-set/production boundary is supplied or explicitly accepted as remaining.

2026-07-15: Started Milestone 9 with focused plan `milestones/09-product-acceptance-and-support.md`. Inventory confirmed the Shield defect still originates in first-template inheritance, while locked dnd5e sources model a shield as base armor 2 plus a separate magical bonus 2. Installed DAE 14.0.12 exposes source-appropriate `isDamaged` special-duration behavior for the later DAE-only fixture. No authenticated crawl or production mutation was performed.

2026-07-15: Chrome file access was enabled and the blocked runtime work resumed without broadening scope. Foundry 14.364/dnd5e 5.3.3 exposed three additional generator defects: invalid portable `_stats.lastModifiedBy`, missing self-`activityUses` consumption, and an instantaneous Activity duration that caused DAE to suppress `untilDamaged` effects before MIDI could observe them. Generalized TDD repairs now pass 743 tests / 2,932 expectations and the complete CI gate. Shield import/equip/attack/damage/prone/limited-use/concentration semantics and the modded/core `isDamaged` runtime control pass; PROD-001 is closed. PROD-002 and SEM-005 remain open only for a captured supported UI export/download comparison. Temporary documents/messages were deleted, target state and the original three-module activation set were restored, and production was untouched.

2026-07-16: Closed PROD-002 and SEM-005 without user file-dialog assistance. External research confirmed the Chrome extension transport, not Foundry or the file-URL toggle, is the unstable boundary. In the project-local matrix world, Codex transferred the existing CLI Shield JSON text to Foundry's public `importFromJSON()`, called the public `exportToJSON()`, intercepted only the detached download anchor long enough to read its exact 9,727-byte Blob, and restored the native prototype in `finally`. The ignored export at `.local/foundry-v14/evidence/remediation-m9/fvtt-Item-骑士之盾-(shield-of-the-cavalier)-PVwnzhrGttcXR6UG.json` matches the CLI artifact on the complete source-relevant projection; differences are limited to Foundry 14.364 export provenance, timestamps/user/document identity, and default expansion. The disposable Item was deleted, port 30001 released, `options.json` restored to `cor-cotn`, and production remained untouched. The durable procedure is `docs/runbooks/foundry-json-transfer-without-file-dialog.md`.

2026-07-16: Closed PROD-005 by correcting a report chronology error. The 88 active IDs were a 2026-07-11 production inventory snapshot, not the current state. A later user-directed cleanup verified 79 enabled modules only in local `server-mirror` and then recorded selected production changes without a new active count. The old snapshot failure remains historical evidence, but exact 88-ID parity and the protected MCDM package are no longer Goal prerequisites. No current production count is claimed, and any future production audit requires a fresh read-only inventory plus explicit user scope.

2026-07-17: Added a second real, user-supplied messy-text acceptance case for the Rat Warlock. Manual semantic review overturned earlier false-green candidates that lost or misclassified Skulker's bonus-action economy, then generalized TDD repairs carried explicit activation through IR, deterministic Markdown, parser, Actor generation, verifier, and Web status rendering. The final fresh Web job `70cef418-61fe-48ae-b879-6bc70d47a26b` reached direct `accepted` with one extraction, one independent review, zero repair/findings, a browser-downloaded Actor whose SHA-256 matched the registered artifact, fresh `verify:intake`, 804/804 aggregate tests, and 116/116 Foundry Lab tests. This Rat Actor was not separately imported into Foundry; the existing Lurker remains the runtime-import evidence.

2026-07-19: Fast-forwarded the repository's real default branch `master` from `f4f7408` to the completed `e47dece` feature tip after synchronizing `origin/master`. The merge was conflict-free, post-merge resolver/Lab/build/full-CI verification passed, user-owned dirty files were byte-identical before and after, the merged feature branch was deleted, and no remote push or production operation occurred.

2026-07-19: Added deferred finding `MOD-I18N-001` and a repository-wide Foundry module localization policy after reviewing the production spell-resolver settings screenshot. The existing priority order and 1,126-spell index are healthy; English and Chinese runtime dictionaries have equal 101-key coverage, while the module-local selector and bilingual manifest-facing title/description remain explicitly deferred rather than falsely claimed complete.

2026-07-19: Opened `SPELL-002` after the user's first online Rat hydration failed at deterministic Faerie Fire Activity `116c319da6fcfdd2` and compensating rollback left visible residual managed content. The review Apply gate correctly remains disabled on undecided manual conflicts, but the online all-or-nothing claim is not accepted. No production write or speculative fix was performed; the next evidence is the Actor's exported redacted resolver diagnostic JSON plus exact runtime/module versions.

2026-07-19: The received resolver diagnostic confirmed three online rollback residuals—one unowned new Item, the managed Faerie Fire Activity, and rollback errors—and proved the cache mismatch occurs before safe journal ownership, leaving rollback intentionally unable to delete unverified content. Opened `SPELL-003` because explicit retry masks persisted `failed-recovery-required` as top-level `needs_review`. Root-cause field comparison still requires the preserved failed Actor export and active-module inventory; no code or production state was changed.

2026-07-19: Received the preserved failed Actor and exact online active-module inventory. Local Chrome reproduction matched both online Faerie Fire description hashes exactly and isolated the failure to Foundry's HTML-equivalent `&Reference[...]` to `&amp;Reference[...]` storage normalization in the Spell and source Effect descriptions; an earlier `_stats` hypothesis was invalidated by a test that passed immediately and was not used for implementation. TDD added the narrow rich-text comparison fix and the recovery-required status-precedence fix. Focused 61/61 passed, the rebuilt install hash matched, a real PHB-priority Rat Actor reached 10/10 hydrated pairs, Faerie Fire and Mage Armor native use passed, and resolver-disabled use passed. Local Actor/template/helper/server state was removed or stopped and the exact matrix/options baseline restored. Fresh resolver 258/258, Foundry Lab 152/152, aggregate CI 1261/1261, typechecks, deterministic release build, and repository gates passed. `SPELL-002` and `SPELL-003` remain open only for publication and authorized exact-online recovery/retry acceptance.

2026-07-19: Closed `INTAKE-003` and `INTAKE-004`. Generalized TDD now carries prepared cantrips/slot groups, hybrid ranges, legendary metadata/costs, Chinese component waivers, custom creature type, and source-scoped standalone verification through the formal v14/core workflow while clearing unsourced golden-master initiative. Accepted run `.local/intake-runs/2026-07-19T16-29-30-782Z-4bc3d00a` promoted exactly Bol'bara and Parson Pellinost; both `verify:intake` and `verify:actor` paths pass, direct source-semantic review passes, independent review findings are remediated, and final aggregate CI is `1300 / 1300`. Both Actors remain portable `pending` manifests with 8/10 refs, zero Spell items, and zero Cast Activities. No Foundry runtime, production server, or manual final-JSON repair was used.

2026-07-20: The pre-push Windows checkout rerun found a cross-platform verification gap: tracked CRLF Markdown was semantically identical but `extractRenderedSpellManifest()` searched only LF delimiters and falsely reported `RENDERED_SPELL_MANIFEST_MISSING`. A fixture-backed RED/GREEN test now normalizes line endings only for frontmatter extraction. Both checked-out NPC inputs again pass standalone `verify:intake` with zero findings and `verify:actor` with zero warnings; final merged-state `bun run ci:verify` passes `1301 / 1301` with `5162` assertions and the 145-source anti-overfit gate. Actor JSON was not edited.

2026-07-24: Completed the cor-cotn world-footprint audit plan at its authorized evidence boundary. The final snapshot/report bundle preserves equal source hashes, `remoteAccessed=false`, 771/349/2 Actor totals, 295 Scenes with 2,836 embedded Tokens, 415/734 Journal totals, 533 broken Token/Actor rows, and exact 274-edge legacy Journal-link reconciliation. Independent final review found the summary alone miscounted the correct pack detail rows and retained stale Task 4 wording; commit `44e19a4` repaired both, and a fresh non-overwriting real-world CLI run regenerated Adventure 1 / other pack 4 with Task 6 wording and exact 7/7 manifest hashes. The exact 16-sheet workbook passed export/re-import, 80,273-row, validation, formula, manifest-binding, and visual checks at final SHA-256 `a2c52128d271628106e95d8e5d91ecf634633ef7f5aa35ca20d0960fc2e31816`. A fresh content-identical copied world measured 1,824,483,516 bytes and 5,345.705 ms for the disk layer; the first wildcard-bound process was rejected and the accepted probe was loopback-only. Because the required in-app Browser was unavailable, initialization, Canvas/GPU, and continuous runtime are strictly blocked and no browser-memory or long-session claim is made. Original world/options hashes remained unchanged, owned processes and ports were released, and no cleanup, credential change, remote access, or production operation occurred.

2026-07-28: Began the user-authorized `cor-cotn` 8080 production migration under `docs/plans/2026-07-27-cor-cotn-production-migration.md` without touching 51020. Fresh read-only inventory, capacity gates, local candidate freeze, remote non-scanned staging, and 1,924-file hash parity are complete; AA/Bloodsplats are identical and will not be overwritten. Added a three-way LevelDB audit that strips duplicated materialized embedded arrays, assigns local Chat/Combat wholesale, merges only provable single-sided field changes, and blocks divergent edits; its 67,735-record common-ancestor control run has zero conflicts, 36 related tests pass, and both TypeScript checks pass. No 8080 stop or live-world mutation has occurred. Cutover remains blocked on the user's normal GM return-to-Setup plus Foundry built-in backup and explicit `5e-dlc-monster 1.2.0` server-use license confirmation; the paid package has not been uploaded.

2026-07-29: Continued the explicitly authorized `cor-cotn` 8080 migration after the user supplied a temporary GM credential. The GM shutdown and built-in backup gates passed; a stopped-server production snapshot was downloaded and verified, the real three-way merge closed without unresolved conflicts, and the final 1,704-file world plus five approved modules was atomically switched with zero per-file differences. `5e-dlc-monster` remained excluded because license approval was not supplied. Production GM/non-GM, attack/damage/animation, Simple Cover, Bloodsplats, Hide NPC Names, Chat Memory Guard, and seven-Adventure short acceptance passed. A copied pre-migration snapshot also passed loopback Foundry 14.364/dnd5e 5.3.3 startup, GM login, 7-user/permission and 67-active-module restoration; the archive original was never started. Two missing unchanged Czepeku modules were copied only during a second cleanly unloaded stopped-server window because their live LevelDB packs could not legally be copied; 8080 was unavailable for about 62 seconds, then restarted through the original entry while 51020 remained unchanged. The restarted same-PID/same-browser observation then completed 1,821.893 seconds and four controlled loops: startup heap released to a stable 448–463 MB idle plateau, WorkerGlobalScopes warmed once from 10 to 18, texture bytes stayed at 415,510,913, node/listener peaks released, and server metrics did not accumulate. Runtime cleanliness is still `Partial` because unchanged FXMaster 8.2.4 reproducibly raised two compositor `clear` TypeErrors when leaving the heavy scene in loops 3 and 4; the canvas, service, and cleanup remained healthy, and no pre-migration capture proves the finding migration-new. Overall migration remains `Partial`: public HTTP cannot exercise Sequencer's secure-context Spritesheet Generator, the FXMaster finding remains open, and the required four-hour real GM/player session is not complete. Detailed evidence is in `.local/foundry-v14/evidence/production/20260728-220757+0800/` and the tracked report is `docs/runbooks/2026-07-28-cor-cotn-production-migration-report.md`.

2026-07-29: Completed the separately authorized post-migration deployment under execution ID `20260729-013252+0800`. The Blood Hunter activity JSON was uploaded for later user-driven Plutonium custom import, with no import or gameplay acceptance claimed. The exact Plutonium 2.15.6 Quick Insert patch was deployed without creating a new backup, as explicitly directed by the user after local validation. `5e-dlc-monster` 1.2.0 was installed and enabled for `cor-cotn`; its two packs indexed 969 and 278 documents, 8080 remained healthy, and 51020 remained unchanged. This follow-up does not upgrade the main migration above `Partial`: four-hour real-session acceptance, the FXMaster finding, and the public-HTTP Sequencer secure-context boundary remain open. The historical candidate builder is now execution-ID-gated to `20260728-220757+0800` so its pre-DLC module decision cannot be mistaken for current production configuration.

2026-07-29: Prepared the accumulated dirty-worktree work for local landing without pushing. Eight path-scoped commits separate repository artifact safety (`dde8dbf`), world-audit retry (`2b0ea2b`), explicit v14 locks/lab routing (`107d474`), standalone Chat Memory Guard (`14bdc21`), standalone Blood Hunter/Plutonium/Sequencer Foundry Lab workflows (`32a31b1`), the execution-ID-frozen production migration workflow (`f519d73`), 8080 maintenance runbooks (`3527036`), and standalone runtime/performance acceptance records (`f833d29`). Every unrelated Foundry operations commit states that it does not change ordinary FVTT Actor JSON generation. Local operator artifacts remain ignored and untracked; staged and branch-wide scans found zero matches for the supplied temporary credential or private-key markers. Fresh current-tip verification passed `ci:verify` with 1,440 tests / 6,730 expectations, production coverage 85.98% lines / 89.66% functions, 168-source anti-overfit, 1,819-path hygiene, dnd5e 5.3.3 reference verification, Web build, and offline Actor smoke; Foundry Lab passed 185 / 1,114 and Chat Memory Guard passed 26 / 70 with a fresh build. Mechanical merge readiness is `Pass`; production migration acceptance remains `Partial` for the previously recorded four-hour session, FXMaster, and secure-context boundaries.

2026-07-29: Fast-forwarded the local `master` from `cbe2aa1` to verified feature tip `12c1423` after refreshing `origin/master`; both local and remote base commits were ancestors, so no conflict resolution or merge commit was needed. The same-tip post-merge rerun again passed `ci:verify` (1,440 tests / 6,730 expectations), Foundry Lab (185 / 1,114), and Chat Memory Guard (26 / 70). The repository worktree remained clean, the local-only/sensitive artifact exclusions remained effective, other worktrees were not changed, and no branch was pushed or deleted.

# Project Hardening and Semantic Correctness Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan milestone by milestone. Do not use subagents unless the user or a later applicable instruction explicitly authorizes delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the confirmed semantic correctness defects, make the repository's quality gates fail closed, restore trustworthy v12/v14 acceptance evidence, and leave a maintainable engineering baseline that a fresh Codex task can resume from this file alone.

**Architecture:** This file is the authoritative program ledger and recovery document. Work is divided into independently reviewable milestones; when a milestone spans more than one coherent code change, create a focused child plan under `docs/remediation/2026-07-15-project-hardening/milestones/`, link it here, and keep this file's finding status authoritative. Generated Actor JSON must continue to flow from source Markdown through the project CLI/workflows; no final Actor JSON may be hand-authored or manually repaired.

**Tech Stack:** Bun 1.3.x, TypeScript 5.9.x, React 19, Foundry VTT v12 with dnd5e 4.3.9, Foundry VTT v14.364 with dnd5e 5.3.3, MIDI-QOL 14.0.9, DAE 14.0.12, project-local Foundry mirror under `.local/foundry-v14`.

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
| VER-001 | P0 | closed | `actorVerification` does not validate embedded Active Effects or their source-derived claims. | Verifier summarizes effects and warns on invalid AC clauses/change mismatches; regression proves old Bleeding artifact is rejected and regenerated artifacts pass. |
| INTAKE-001 | P1 | closed | The Legacy plaintext workflow detects zero creatures for ordinary compact Chinese statblocks yet exits successfully, and AI normalization runs only after the failed rule-based split. | AI-first discovery accepts unmarked raw input, deterministic source partitioning prevents truncated statblocks, and Legacy zero-result paths fail closed in CLI and Web. |
| INTAKE-002 | P1 | closed | Adding minimal headings lets the Legacy workflow run but loses or replaces source semantics, including AC, HP, abilities, movement, defenses, senses, languages, traits, and action boundaries. | Evidence-backed IR, deterministic Markdown rendering, CLI generation, semantic comparison, independent AI review, real Lurker acceptance, collection discovery, and ambiguity failure behavior pass. |
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

## Progress

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

## Decision Log

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
- Final aggregate evidence is 753 tests / 2,959 expectations, 87.61% production lines / 88.50% production functions, 109 audited sources, locked dnd5e reference success, Web build success, and offline Actor smoke success; post-stage hygiene separately passes across 1,655 tracked paths. Production remains untouched and exact production-module coexistence remains a separately bounded Partial claim, not an unfinished Goal requirement.

## Change Note

2026-07-16: Started the separately authorized AI-first monster intake program after a real Lurker source disproved the Legacy plaintext support claim. Added INTAKE-001, INTAKE-002, and VER-002 as new in-progress findings without rewriting the earlier closed hardening chronology. The approved path is a parallel evidence-backed AI pipeline with deterministic Markdown/CLI generation, strict failure, independent AI review, bounded repair, and local-only runtime acceptance.

2026-07-16: The implementation now reaches CLI and Web with focused intake, CLI, runner, API, and v12/v14 workflow slices passing. Semantic projection coverage was expanded beyond the historical verifier to source-relevant totals and action mechanics, and needs-review candidates are not registered as formal Actor downloads. Closure remains intentionally withheld: the configured OpenAI key is empty, and local Foundry browser transfer awaits approval to build the `browse` helper. INTAKE-001, INTAKE-002, and VER-002 remain `in_progress` until real-model and runtime evidence is recorded.

2026-07-16: User approved the one-time browser helper build. The existing packaged binary was incomplete because its server bundle was absent, so current gstack source was cloned and built under ignored `.local`, and the matching Playwright Chromium was installed. The Lurker then passed the local Foundry 14.364/dnd5e 5.3.3 import, open-sheet, and runtime readback gate; cleanup and server stop completed. Real model acceptance remains the only product gate, pending a deliberate choice between official Codex CLI OAuth use and an unofficial OpenAI-compatible OAuth proxy.

2026-07-17: Completed the bounded Codex OAuth acceptance without treating OAuth as a Platform API key. A temporary loopback proxy drove real `gpt-5.4` discovery/extraction/review. TDD repairs moved unique quote anchoring out of the model, rejected or removed only unanchorable whitespace coverage, prevented YAML `null` leakage, and corrected the review projection so Foundry-derived skills/default senses and non-attack items are not presented as invented mechanics. One real source/IR resume reached accepted with zero deterministic and AI findings; independent fresh stochastic failures remained `needs_review` with no promotion. The proxy was stopped and port 8787 was closed.

2026-07-17: Closed the AI Intake program after the remaining collection, negative, deterministic-partition, explicit-AC-conflict, aggregate, Foundry Lab, and mobile Web gates passed. The accepted Lurker preserves the complete source projection in fresh v12/v14 Actors and local Foundry readback. A two-monster real run discovered exactly two and stayed review-gated; missing CR and conflicting AC negatives stayed unaccepted, with the latter independently detected from source even when AI omitted the uncertainty. Final aggregate evidence is 791 tests / 3,093 expectations and the local helper services are stopped.

2026-07-15: Created the initial self-contained remediation program after a repository review and fresh baseline verification. The plan records all confirmed findings, distinguishes in-repo work from external authorization boundaries, and defines mechanical plus semantic completion gates so context compression cannot silently drop work.

2026-07-16: User authorization resolved the final authenticated-session boundary. The live GoddessFantasy pipeline was first rejected on semantic review, repaired through SEM-006/SEM-007, rerun through the project CLI, and accepted with 47/47 verifiers plus expanded live projections. PROD-003 is closed and the persistent Goal has no remaining authorized finding or external blocker.

2026-07-15: Completed Milestone 1's implementation and mechanical verification. SEM-001 and VER-001 remain short of closure until the full affected v14 acceptance batches are regenerated and semantically reviewed in Milestone 2. Recorded the newly reproduced `.env`-driven network attempt under DET-001.

2026-07-15: Regenerated both v14 acceptance batches and confirmed the AC contamination is gone mechanically. During mandatory source review, discovered and validated SEM-002 in White Tusk Shaman; kept Milestone 2 open and moved to a separate fixture-backed parser/generator repair instead of preserving the prior false `Pass` claim.

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

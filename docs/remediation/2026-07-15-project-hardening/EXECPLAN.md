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
| SEM-005 | P1 | validated | Standalone Item generation inherits arbitrary mechanics from the first type template and does not yet model all source mechanics: Shield of the Cavalier receives breastplate armor values, omits its extra magical AC bonus, Protective Field duration/concentration/range, and Forceful Bash's conditional prone rider. | Generalized armor/action schema parsing backed by locked dnd5e 4.3.9 and 5.3.3 references; positive/negative/unrelated fixtures; v12/v14 CLI regeneration; the PROD-002 local Foundry import/open/exercise/re-export comparison passes without template leakage or omitted source mechanics. |
| VER-001 | P0 | closed | `actorVerification` does not validate embedded Active Effects or their source-derived claims. | Verifier summarizes effects and warns on invalid AC clauses/change mismatches; regression proves old Bleeding artifact is rejected and regenerated artifacts pass. |
| DOC-001 | P0 | closed | v14 source-fidelity and runtime acceptance claims include artifacts contaminated by SEM-001. | Reports preserve the defect chronology, affected actors were regenerated, source-reviewed, runtime-retested, and the copied-world authentication contradiction was amended. |
| GATE-001 | P1 | closed | `antiOverfitAudit.runGitText()` returns an empty string on Git failure, allowing `--all` to report success with zero checked sources. | Shared typed Git execution fails closed; actual non-repository and zero-source CLI probes exit 1; tests cover missing Git and explicit-file independence; real all-audit checks 99 sources. |
| GATE-002 | P1 | closed | Reference verification maps an unreadable Git checkout to generic `mismatch`, hiding safe-directory/access errors. | Status model distinguishes `missing`, `git-error`, `mismatch`, and `ok`; ownership/access diagnostics are actionable; real locked cache reports `ok`. |
| TYPE-001 | P1 | closed | Strict TypeScript baseline had 1,007 errors, including 81 across 20 production files, so type checking could not gate changes. | Production and supported broad typechecks are zero without blanket suppression; real v12/v14 CLI flows and the repaired browser download preserve source semantics. |
| CI-001 | P1 | closed | No CI runs tests, type checks, anti-overfit audit, reference verification, build, or acceptance smoke gates. | A bounded aggregate and Windows CI workflow run deterministic required gates; local YAML/command validation and planted regressions prove fail-closed behavior. |
| COV-001 | P2 | closed | Coverage includes tests and has no threshold, making its headline unsuitable as a regression gate. | Fail-closed LCOV filtering reports 88 production files at 86.92% lines/88.09% functions and enforces attainable 84%/85% floors with subsystem evidence. |
| ART-001 | P2 | closed | Input, generated output, acceptance fixture, historical artifact, and deliverable boundaries are not explicit. | Tracked artifact policy and inventory; every tracked output category has a reason; generated outputs are reproducible or intentionally retained fixtures. |
| ART-002 | P2 | closed | Historical debug and temp files remain tracked despite current ignore intent. | Each file is promoted to a named fixture/tool or removed in a scoped index cleanup; no useful evidence is deleted without replacement. |
| DET-001 | P2 | closed | Optional AI/network behavior is influenced by environment credentials, and deterministic/offline mode is not one uniform, enforced contract across workflows. | Ambient credentials cannot activate Actor/Web translation; explicit modes are observable; provider reasoning is sanitized; CLI/API/browser offline semantics pass. |
| ARCH-001 | P2 | in_progress | Large multi-responsibility modules increase regression and review risk, especially `actor.ts`, parsers, plaintext ingest, and `App.tsx`. | Characterization tests plus responsibility-based extraction; no line-count-only refactor; structural and semantic output stays stable. |
| WEB-001 | P1 if public, P3 if loopback-only | planned | Web API advertises public unauthenticated access while exposing expensive jobs and server-side configured capabilities. | Deployment mode explicitly chosen; secure default binding/auth policy implemented and tested; docs match actual exposure. |
| WEB-002 | P1 if proxied | validated | Client identity trusts forwarded headers without a trusted-proxy boundary; in-memory per-IP limiting can be spoofed or collapse clients. | Trusted proxy configuration, fallback identity behavior, global caps, and tests for forged headers and proxy chains. |
| WEB-003 | P2 | validated | Upload limits are checked after `request.text()` and process-local job/rate state is not a complete public resource-control boundary. | Request-body/server limits, global job cap, cleanup bounds, and load/abuse tests are documented and enforced for public deployment. |
| DOC-002 | P2 | validated | Acceptance documents contain chronology and support-boundary drift across source review, runtime smoke, module compatibility, and delivery checklist. | One current support matrix points to dated evidence; stale statements are amended, not silently overwritten; contradictions scan clean. |
| PROD-001 | P2 | planned | No source-derived DAE-only fixture exists, so DAE behavior beyond coexistence is not accepted. | Generalized fixture generated through CLI and exercised in locked DAE 14.0.12 runtime with source-to-output review. |
| PROD-002 | P2 | planned | Standalone Item v14 live Foundry acceptance is absent. | Real source item generated by CLI, imported, opened, exercised, re-exported, and semantically compared. |
| PROD-003 | P2 | blocked_external | Authenticated live GoddessFantasy crawl has not been accepted. | User-authorized credentials/session used without tracking secrets; live crawl, records-to-plaintext, generation, provenance, and semantic sample pass. |
| PROD-004 | P2 | planned | Current acceptance corpus is too narrow to justify broad parser/generalization confidence. | Corpus matrix adds positive, close-negative, bilingual, v12/v14, actor/item cases and records unchanged unrelated outputs. |
| PROD-005 | P2 | blocked_external | Complete production-equivalent module coexistence remains Partial/Fail. | Exact valid package set loads and defined representative workflows pass without unresolved runtime errors, or support claim stays explicitly partial. Production mutation requires separate authorization. |

## Progress

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
- [ ] (2026-07-15) Milestone 7 started with measured candidate evidence and focused child plan `milestones/07-risk-driven-architecture.md`; ARCH-001 moved to `in_progress`. `actor.ts` was selected for two sequential characterized extractions, while Item/Web refactors were deferred to avoid mixing SEM-005 or deployment behavior changes.
- [ ] Milestone 7: Perform risk-driven architecture extraction (ARCH-001).
- [ ] Milestone 8: Secure the chosen Web deployment model (WEB-001, WEB-002, WEB-003).
- [ ] Milestone 9: Reconcile acceptance documentation and close authorized product gaps (DOC-002, PROD-001 through PROD-005).
- [ ] Milestone 10: Run final repository and semantic acceptance, write retrospective, and close the program Goal.

**Exact next action:** Execute M7 Task 1 RED: add direct ActorLocalizer characterization tests for local fallback, injected translation, and provider failure before creating `actor-localizer.ts`.

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

- [ ] Capture machine-readable error inventories for production, tests, scripts, and historical debug files without committing raw noisy logs.
- [ ] Define `tsconfig.production.json` to include supported production source and exclude tests, temp, generated output, and historical debug scripts.
- [ ] Add `typecheck:production` and `typecheck:all` scripts that use the installed TypeScript version without network fetching.
- [ ] Fix shared model drift first: Actor activities, image asset options/presets, token review types, job runner contracts, and Foundry target shapes.
- [ ] Do not use blanket `any`, `@ts-ignore`, `skipLibCheck` expansion, or broad exclusion to manufacture a pass.
- [ ] Add or update behavioral tests whenever a type repair reveals an ambiguous runtime contract.
- [ ] Reduce production errors to zero, then repair tests/scripts or reclassify obsolete debug programs under the artifact milestone.
- [ ] Run `bun run typecheck:production`, `bun run typecheck:all`, `bun test --max-concurrency 4`, `bun run web:build`, and targeted CLI conversions.

**Semantic acceptance:** Runtime behavior is unchanged except where a type error exposed a real bug; both Actor generation and the Web workbench complete representative real workflows.

## Milestone 5: Add Deterministic CI and Coverage Gates

**Finding IDs:** CI-001, COV-001, DET-001; depends on Milestones 1, 3, and production typecheck from Milestone 4.

**Focused child plan:** `docs/remediation/2026-07-15-project-hardening/milestones/05-ci-coverage-determinism.md`

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: `package.json`
- Create or modify the supported Bun test configuration after verifying the exact installed Bun 1.3.8 coverage syntax.
- Add network-isolation tests near plaintext ingest, sync, translation, crawler, and Web job workflows.

- [ ] Add one deterministic aggregate command that runs production typecheck, bounded full tests, anti-overfit all-source audit, reference verification, Web build, and a generated-actor smoke conversion.
- [ ] Configure CI concurrency and timeouts so a hung crawler or child process fails visibly.
- [ ] Ensure CI does not require API keys, login cookies, SSH access, production Foundry, or network translation.
- [ ] Exclude test implementation files from production coverage reporting using Bun's supported configuration, then record the new baseline by subsystem.
- [ ] Set initial thresholds no higher than the freshly measured production baseline; require critical semantic/gate modules to have direct branch tests even if the global threshold passes.
- [ ] Add tests proving credentials present in environment do not trigger AI/network use without the explicit option.
- [ ] Ensure opt-in network usage is reflected in CLI output/result metadata and failures are not swallowed silently.
- [ ] Validate the CI workflow locally as far as possible and verify that a temporary planted regression makes each relevant gate fail; revert the planted regression immediately.

**Semantic acceptance:** A clean checkout can prove the supported offline product path, and CI cannot turn missing tools, zero-source audits, hidden network behavior, or low semantic coverage into green status.

## Milestone 6: Define and Clean Artifact Boundaries

**Finding IDs:** ART-001, ART-002.

**Files:**

- Create: `docs/artifact-policy.md`
- Modify: `.gitignore` only if the inventory proves a current gap.
- Modify or relocate tracked output/debug/temp artifacts in path-scoped commits.
- Add a repository hygiene check under `src/tools/` with tests if policy cannot be enforced by Git ignore alone.

- [ ] Inventory every tracked file under vault output, root `debug-*`, root `temp-*`, and `temp-items/` with category, producer command, consumer, reproducibility, and retention reason.
- [ ] Define five explicit categories: source input, generated disposable output, tracked golden fixture, tracked acceptance evidence, and local/sensitive runtime artifact.
- [ ] For every tracked generated JSON, either document its stable fixture consumer or regenerate it into an ignored location and remove it from version control in a scoped commit.
- [ ] Promote useful debug scripts to named tools/tests with documented entrypoints; remove only obsolete copies after preserving unique behavior as tests or documentation.
- [ ] Preserve user data and unrelated files; do not bulk-delete based only on filename.
- [ ] Add a hygiene gate that detects newly tracked disposable output, credentials, cookies, `.local` runtime state, and unclassified root scratch files.
- [ ] Run all commands that consume retained fixtures and prove paths still resolve on Windows with Chinese filenames.

**Semantic acceptance:** A new contributor can tell which files are sources, deliverables, fixtures, evidence, and disposable state; cleaning does not erase the only copy of useful behavior or proof.

## Milestone 7: Perform Risk-Driven Architecture Extraction

**Finding ID:** ARCH-001; begins only after P0/P1 gates are green.

**Files:** Determined per focused child plan from change coupling and responsibility, with likely first candidates `src/core/generator/actor.ts`, `src/core/parser/item-parser.ts`, `src/core/ingest/plaintext.ts`, and `src/web/client/App.tsx`.

- [ ] Measure change coupling, type-error concentration, test coverage, and responsibility boundaries; do not use line count alone as authorization.
- [ ] Select one cohesive extraction at a time, beginning with logic already isolated by semantic fixes such as AC effect extraction.
- [ ] Write characterization tests and `assertEqualStructure()` snapshots before moving logic.
- [ ] Keep exported interfaces narrow and target-version behavior explicit.
- [ ] Run v12 and v14 real-source conversions plus unrelated-actor structural comparisons after each extraction.
- [ ] Commit each extraction separately from feature or bug changes.

**Semantic acceptance:** Modules have clearer responsibilities and lower change coupling while generated Actor/Item behavior, CLI output, and Web workflows remain semantically identical.

## Milestone 8: Secure the Web Deployment Model

**Finding IDs:** WEB-001, WEB-002, WEB-003.

**Decision gate:** Before changing public-access behavior, record whether the supported mode is loopback/private-only, authenticated public VPS, or both. If no user choice is available, implement the least-surprising secure default: loopback binding with public mode requiring explicit configuration; do not silently expose a previously local tool.

**Files:**

- Modify: `src/web/server/index.ts`, `src/web/server/api.ts`, `src/web/server/security/rateLimit.ts`
- Modify: `src/web/server/jobs/jobStore.ts`, `src/web/server/jobs/jobRunner.ts`
- Modify: `src/web/server/__tests__/api.test.ts`
- Modify: `src/web/AGENTS.md` and deployment documentation only to match implemented behavior.

- [ ] Add tests for direct clients, trusted proxy chains, forged `x-forwarded-for`, shared proxy fallback, global request caps, global long-job caps, and oversized bodies.
- [ ] Bind to loopback by default; require explicit host/public-mode configuration for remote exposure.
- [ ] If public mode is supported, require an authenticated boundary appropriate to the deployment and keep secrets server-side.
- [ ] Trust forwarded headers only from configured trusted proxies; otherwise derive the socket/server identity available from the runtime or use a conservative shared bucket.
- [ ] Enforce body limits before unbounded JSON materialization where Bun's server API permits, and align reverse-proxy limits with application limits.
- [ ] Add global as well as per-client concurrency limits, bounded job retention, and cleanup tests.
- [ ] Run API tests, Web build, and a browser smoke test that uploads a real Markdown file and downloads generated JSON/ZIP.

**Semantic acceptance:** The documented deployment cannot be made publicly expensive or identity-spoofable merely by sending headers, and the normal Chinese-first workbench remains usable.

## Milestone 9: Reconcile Documentation and Close Product Gaps

**Finding IDs:** DOC-002, PROD-001, PROD-002, PROD-003, PROD-004, PROD-005.

**Files:**

- Create: `docs/acceptance/current-support-matrix.md`
- Modify relevant dated reports under `docs/acceptance/` without erasing historical evidence.
- Add source fixtures under the default vault input or test fixture directories according to `docs/artifact-policy.md`.

- [ ] Build a current support matrix separating source fidelity, schema validity, minimal runtime behavior, module-specific behavior, production-equivalent coexistence, and production deployment.
- [ ] Reconcile copied-world authentication chronology and other stale cross-report statements with dated amendments.
- [ ] Add a generalized source-derived DAE-only fixture with positive, close-negative, and unrelated controls; generate and test it through the project flow and DAE 14.0.12 local runtime.
- [ ] Select a real standalone Item source, generate it for v14 through the CLI, import/open/exercise/re-export it, and compare source-relevant fields.
- [ ] Expand the corpus matrix across Chinese/English, actor/item, v12/v14, core/modded, positive/negative, and unrelated regression controls.
- [ ] For authenticated GoddessFantasy crawling, request authorization only when all offline work is ready; do not store cookies/passwords in tracked files or chat artifacts.
- [ ] Keep full production coexistence `Partial/Fail` unless the exact acceptance gate passes. Do not bypass protected module signatures or change production without explicit authorization.

**Semantic acceptance:** Every support claim names the layer it proves, dated evidence supports it, and unresolved external gaps remain visible rather than being converted into blanket success.

## Milestone 10: Final Acceptance and Goal Closure

- [ ] Run `git status --short` and classify every remaining change by owner and milestone.
- [ ] Run production and broad type checks with zero supported-scope errors.
- [ ] Run `bun test --max-concurrency 4` and the production-only coverage gate.
- [ ] Run `bun run audit:anti-overfit` and `bun run audit:anti-overfit:all`; require a nonzero source count.
- [ ] Run `bun run references -- verify` and require exact-version success or an explicit external blocker.
- [ ] Run `bun run web:build` and the browser upload/download smoke workflow.
- [ ] Regenerate representative v12, v14 core, and v14 modded Actors plus a v14 Item through the project flow.
- [ ] Perform source-to-output semantic review for every changed parser/generator behavior and sample unchanged unrelated outputs.
- [ ] Run the authorized local Foundry runtime matrix and preserve the boundary between minimal runtime, copied-world, and production claims.
- [ ] Update every finding state, Outcomes & Retrospective, and the support matrix.
- [ ] Close the Goal only when all authorized findings are `closed` and external blockers are either resolved or explicitly accepted by the user as remaining scope.

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

## Decision Log

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

## Outcomes & Retrospective

Program initialization outcome on 2026-07-15:

- The complete known problem set is now represented by stable IDs and explicit acceptance conditions.
- Current baselines were remeasured instead of copied blindly from compressed conversation context.
- The repository now has a single recovery entrypoint suitable for a persistent Goal and future fresh tasks.
- The persistent Goal is active and points back to this file rather than attempting to carry the full program in Goal text.
- No business code or generated Actor JSON was modified during initialization.
- Implementation and closure outcomes will be appended here after each milestone; historical entries must not be rewritten to hide failed or superseded evidence.

## Change Note

2026-07-15: Created the initial self-contained remediation program after a repository review and fresh baseline verification. The plan records all confirmed findings, distinguishes in-repo work from external authorization boundaries, and defines mechanical plus semantic completion gates so context compression cannot silently drop work.

2026-07-15: Completed Milestone 1's implementation and mechanical verification. SEM-001 and VER-001 remain short of closure until the full affected v14 acceptance batches are regenerated and semantically reviewed in Milestone 2. Recorded the newly reproduced `.env`-driven network attempt under DET-001.

2026-07-15: Regenerated both v14 acceptance batches and confirmed the AC contamination is gone mechanically. During mandatory source review, discovered and validated SEM-002 in White Tusk Shaman; kept Milestone 2 open and moved to a separate fixture-backed parser/generator repair instead of preserving the prior false `Pass` claim.

2026-07-15: Mechanically repaired SEM-002 with generalized wrapped-emphasis handling and fixture-backed structural verification. The corrected item boundary exposed SEM-003: the bare condition scanner still invents `Unconscious` from a transformation termination clause, so Milestone 2 remains open pending a separate condition-semantics TDD cycle.

2026-07-15: Closed SEM-001, SEM-002, SEM-003, VER-001, and DOC-001 after a generalized condition-clause repair, 656-test full regression, two regenerated 6/6 v14 batches, six focused verifier checks, source review, and core/minimal-modded runtime re-acceptance. The reports now preserve the false-pass chronology and keep production-equivalent coexistence explicitly `Partial/Fail`.

2026-07-15: Closed GATE-001 and GATE-002. Git failures can no longer become empty successful audits, `--all` rejects a zero-source corpus, reference verification distinguishes unreadable Git state from a readable wrong revision, and both unit plus actual CLI failure paths were exercised before the real 99-source/reference success checks.

2026-07-15: Closed TYPE-001, CI-001, COV-001, and DET-001. Production and supported broad typechecks are zero; ordinary Actor/Web generation is offline despite ambient credentials; explicit AI modes are observable and provider reasoning is sanitized; production-only LCOV thresholds, Windows CI, and an offline source-faithful Actor smoke are enforced. A clean real browser rerun closed the earlier semantic failure rather than treating the first successful download as acceptance.

2026-07-15: Started Milestone 6 with a focused artifact-boundary plan. No tracked output or scratch file has been removed yet; retention decisions require a complete consumer/origin/reproducibility inventory first.

2026-07-15: Completed the 178-path artifact inventory, policy, fail-closed hygiene tool, planted regression, and path-scoped index cleanup while retaining ignored local recovery copies. Mandatory Item source review then rejected M6 closure: the current Shield workflow loses rarity and Protective Field semantics. Added SEM-004 and moved into a fixture-backed parser/generator repair before declaring the historical scratch outputs superseded.

2026-07-15: Closed SEM-004, ART-001, ART-002, and Milestone 6. The exact Shield source now generates schema-valid `veryRare`, two named Activities, a reaction, and one dawn-recovering use for v12/v14; all 693 tests and aggregate gates pass. The same semantic review discovered broader standalone Item template/mechanics defects and recorded them as SEM-005 for generalized repair plus PROD-002 live-runtime acceptance rather than overstating M6 completion.

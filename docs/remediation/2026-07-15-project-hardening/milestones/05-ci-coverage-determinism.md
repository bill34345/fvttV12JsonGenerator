# Milestone 5: Deterministic CI, Coverage, and Network Opt-In

Parent ledger: `docs/remediation/2026-07-15-project-hardening/EXECPLAN.md`

Findings: `CI-001`, `COV-001`, `DET-001`

## Objective

Make the supported offline product path deterministic and enforce it in one local/CI gate. Credentials in `.env` or the process environment must never change ordinary Actor generation, collection conversion, vault sync, or Web conversion unless the operator selected an explicit network-capable mode. Coverage must describe production modules rather than test implementations and must fail below a freshly measured, attainable baseline.

## Confirmed Evidence

- A real local browser run on 2026-07-15 left AI normalize unchecked, converted White Tusk Shaman for v14 modded, and successfully exposed/downloaded JSON.
- The downloaded Actor had six items, but two item names and descriptions contained provider `<think>` output because `ActorGenerator` constructed a translation service from `.env` whenever `translationService` was omitted.
- Running the CLI with Bun's `--no-env-file` produced the correct six source names and zero verifier warnings, proving environment-driven behavior is the differentiator.
- Bun's official documentation for the installed 1.3.x line identifies `coverageSkipTestFiles`, `coveragePathIgnorePatterns`, and `coverageThreshold` under `[test]` in `bunfig.toml`; current Bun also documents test-file exclusion as the default.

## Execution

### 1. Make network behavior explicit

- [x] Add a RED regression proving an `ActorGenerator`/single-file conversion does not call a configured translation provider merely because credentials exist.
- [x] Make Actor generation deterministic by default; inject a translation service only from an explicitly network-enabled workflow.
- [x] Add Web/API regressions for single and collection conversions with credentials present and network opt-in absent.
- [x] Preserve the dedicated `translate-json` workflow and explicit plaintext AI-normalize behavior; sync result/CLI metadata now reports whether AI normalization was requested/enabled and whether Actor translation was enabled.
- [x] Add an output sanitizer/regression so provider reasoning wrappers cannot silently become accepted translated fields when translation is explicitly enabled.

### 2. Establish production-only coverage

- [x] Run a fresh LCOV/text baseline with test files excluded and classify coverage by generator, parser/ingest, workflow, tools/gates, Web/API, and Foundry Lab.
- [x] Add Bun coverage configuration using only syntax verified against the installed runtime and official Bun docs.
- [x] Set initial line/function thresholds at or below the measured production baseline; document why they are useful and attainable.
- [x] Add focused tests for deterministic network selection and the fail-closed LCOV gate.

### 3. Add deterministic aggregate and CI

- [x] Add one package script that runs production and broad typecheck, bounded full tests with production coverage, all-source anti-overfit, locked reference verification, Web build, and an offline generated-Actor smoke.
- [x] Add `.github/workflows/ci.yml` using the repository's locked Bun version, a frozen install, job timeout, and concurrency cancellation.
- [x] Ensure no CI step needs API keys, cookies, SSH, a browser download, or Foundry production access.
- [x] Plant and revert representative temporary regressions to prove typecheck and Actor smoke fail closed; coverage zero/threshold failures, anti-overfit Git/zero-source failures, and reference Git/mismatch failures are covered by focused tests and the earlier real process probes.

## Verification Record - 2026-07-15

- `bun run ci:verify` passed from the current dirty workspace on a fresh rerun: both typechecks, 669 tests/2,727 assertions across 83 files, production-only coverage, 99-source anti-overfit, `dnd5e-5.3.3: ok`, Web build, and the offline Actor smoke.
- Production LCOV gate: 88 production files; 83 test-source records excluded; lines 17,510/20,144 = 86.92%; functions 1,502/1,705 = 88.09%. Enforced floors are 84% lines and 85% functions.
- Subsystems: Foundry Lab 83.03/90.99; generator 93.91/90.56; parser/ingest 87.57/90.25; workflow 85.31/83.58; tools/gates 81.85/78.83; Web 83.78/91.43; other 79.71/83.69 (lines/functions percent).
- Bun 1.3.8 on Windows hung in full-suite coverage when `coverageSkipTestFiles=true`; `bunfig.toml` therefore records the runtime-specific behavior, leaves LCOV collection inclusive, and the repository gate filters test records fail closed before applying thresholds. Bounded coverage concurrency 2 is the stable measured configuration.
- Temporary planted type and Actor-name regressions failed with nonzero exits and were reverted immediately; recovery typecheck/smoke passed and the probe file is absent.
- Real browser semantic rerun with AI unchecked produced the exact six White Tusk source item names, zero `<think>` occurrences, a real download, and zero verifier warnings. Port 5174 was released afterward.

## Acceptance

Mechanical:

- Both typecheck commands, full tests, coverage thresholds, audits, references, Web build, and the aggregate CI command pass from the current workspace.
- CI YAML is syntactically valid and every invoked script exists.

Semantic:

- With fake or real-looking translation credentials present, ordinary CLI and Web generation make zero translation calls and preserve source item names.
- Explicit AI normalize and translate-json remain available, observable, and tested.
- The real browser conversion/download smoke produces the same source-faithful six-item White Tusk result as the offline CLI.

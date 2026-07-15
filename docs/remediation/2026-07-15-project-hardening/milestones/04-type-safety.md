# Milestone 4: Production Type-Safety Recovery

Parent ledger: `docs/remediation/2026-07-15-project-hardening/EXECPLAN.md`

Finding: `TYPE-001`

## Objective

Create an honest zero-error TypeScript gate for the supported production graph, then classify and reduce the broader repository graph without excluding supported code or suppressing diagnostics. Compiler success is mechanical evidence; representative CLI, Actor-generation, Web, and asset workflows must still behave correctly before this milestone closes.

## Fresh Baseline — 2026-07-15

- Installed compiler: TypeScript `5.9.x`, invoked from the repository installation.
- Broad graph: 1,007 diagnostics.
- Supported `src` production candidates after excluding tests and `src/temp`: 81 diagnostics across 20 files.
- Tests: 86 diagnostics. Historical/root debug, fixture, and otherwise unclassified files account for most of the remaining broad errors; their retention/exclusion must be classified, not silently discarded.

Production clusters:

| Cluster | Files | Errors | Primary issue |
| --- | ---: | ---: | --- |
| Generator/domain models | 6 | 25 | `ActionData`, `StructuredActionData`, damage, summon, and optional-option drift |
| Image/token assets | 4 | 32 | optional crop normalization, array indexing, Sharp type usage, review-item contracts |
| Web/API/jobs | 3 | 16 | duplicated crop contract, response body typing, Foundry target parsing, result serialization |
| Parser/ingest/crawl/CLI/tools | 7 | 8 | unchecked indexing, optional values, Cheerio node typing, missing `opencc-js` declaration |

The exact baseline came from `tsc --noEmit --pretty false`, parsed in memory and summarized here; no raw 1,000-line log is retained.

## Supported Graph Contract

- `tsconfig.production.json` includes `src/**/*.ts` and `src/**/*.tsx`.
- It excludes only test/spec files, `__tests__`, and `src/temp` historical scratch code.
- Web client/server code, CLI entrypoints, project tools under `src/tools`, crawlers, generators, assets, and workflows remain in production scope.
- `skipLibCheck` remains at the existing value; it must not be expanded into source suppression.
- No new blanket `any`, `@ts-ignore`, `@ts-nocheck`, broad file exclusion, or disabled strict option is allowed.
- The broad `tsconfig.json` stays the repository-wide inventory until Milestone 6 classifies historical/debug artifacts. `typecheck:all` must remain truthful even if it cannot reach zero before that classification.

## Execution Order

### 1. Install the gate

- [x] Add `tsconfig.production.json` with the supported graph above.
- [x] Add `typecheck:production` and `typecheck:all` scripts using the installed `tsc` binary.
- [x] Run both and record the production/broad counts; the initial production gate failed with 81 production diagnostics and the supported broad graph reached zero after repair.

### 2. Repair shared generator/domain contracts

- [x] Reconcile source-derived fields on `ActionData` and `StructuredActionData` with their consumers; do not assert properties that the parser cannot produce.
- [x] Correct `Damage` and attack discriminated unions and optional generator options.
- [x] Fix actor summon/null filtering with real narrowing rather than non-null assertions where ordering can be empty.
- [x] Run generator/parser tests and representative v12/v14 conversions; full structural and acceptance regressions remained green.

### 3. Repair image/token asset contracts

- [x] Centralize one validated crop rectangle shape in `src/core/assets/tokenCrop.ts` after checking width, height, left, and top.
- [x] Fix token review array access and source/result item types without weakening required review metadata.
- [x] Replace the invalid `sharp` namespace usage with the package's exported parameter type.
- [x] Run image-option, token-review, contact-sheet, Web preset, and browser-facing tests; crop behavior did not change and no new contact sheet was produced.

### 4. Repair parser/ingest/crawl/CLI boundaries

- [x] Narrow optional regex/array results before use.
- [x] Correct Cheerio node generics from the installed Cheerio API.
- [x] Add a local declaration for the exact `opencc-js` surface actually consumed.
- [x] Preserve parser semantics with focused tests and real-source conversions.

### 5. Repair Web/API/job result contracts

- [x] Convert binary download bodies to a BodyInit accepted by the current DOM/Bun type intersection without copying incorrectly.
- [x] Parse and narrow Foundry target values at the API boundary.
- [x] Type serialized job metadata structurally instead of requiring every result interface to declare a string index signature.
- [x] Run Web API tests and build. The first real browser paste/convert/download path exposed pre-existing DET-001: environment credentials triggered translation without opt-in and polluted two item names with `<think>` text. After the Milestone 5 deterministic-network repair, the same unchecked-AI v14 modded browser path was rerun and downloaded a source-faithful six-item Actor with zero `<think>` content and zero verifier warnings.

### 6. Close the production gate and classify the broad graph

- [x] Require `bun run typecheck:production` to report zero diagnostics.
- [x] Re-run `bun run typecheck:all`; the supported graph now reports zero diagnostics. Root debug/temp programs and `src/temp` remain explicitly outside it pending Milestone 6 classification.
- [x] Fix supported tests/scripts here when they validate production contracts; defer deletion/movement of historical artifacts to Milestone 6 with an explicit inventory link.
- [x] Update the parent finding state and exact next action.

## Verification Record - 2026-07-15

- Production diagnostics: 81 -> 0.
- Supported broad diagnostics: 86 -> 0 after explicitly excluding only historical root scratch and `src/temp` from the supported graph.
- Full regression: 664 pass, 0 fail, 2,705 assertions across 82 files at concurrency 4.
- Web build, 99-source anti-overfit audit, and `dnd5e-5.3.3` reference verification pass.
- Project CLI regenerated White Tusk Shaman for v12 core, v14 core, and v14 modded; all three contain six source items and zero verifier warnings. v14 activation values remain correctly located on Activities.
- Browser semantic closure: the post-repair v14 modded paste/convert/download run produced `White Tusk Shaman` with the exact six source item names, zero `<think>` occurrences, and zero verifier warnings. The server was stopped and port 5174 was released after inspection.

## Verification Matrix

Mechanical:

- `bun run typecheck:production`
- `bun run typecheck:all`
- `bun test --max-concurrency 4`
- `bun run audit:anti-overfit` and `bun run audit:anti-overfit:all`
- `bun run web:build`

Semantic:

- Regenerate representative v12, v14 core, and v14 modded Actors through the CLI and compare source-relevant fields.
- Exercise the real Web upload/conversion/download path.
- Exercise image/token review behavior if those modules change.
- Confirm no type fix changes target-version, effect, parser, crop, or network behavior merely to satisfy the compiler.

## Recovery Rule

At each cluster boundary, update this file and the parent ledger with exact diagnostics remaining. If a compiler error reveals a behavioral defect, stop treating it as mechanical cleanup: add a focused regression test, classify the rule under project policy, and perform semantic acceptance before continuing.

# Milestone 6: Artifact Boundaries and Repository Hygiene

Parent ledger: `docs/remediation/2026-07-15-project-hardening/EXECPLAN.md`

Findings: `ART-001`, `ART-002`

## Objective

Classify every currently tracked generated output and scratch artifact before changing retention. Preserve unique source data, useful diagnostics, and acceptance evidence by promoting them to named fixtures/tools/docs; remove only reproducible or obsolete copies after their consumers and recovery path are proven. Add a fail-closed hygiene gate so the repository cannot silently reacquire disposable output, secrets, cookies, local runtime state, or unclassified root scratch files.

## Execution

### 1. Build the authoritative inventory

- [x] Enumerate every tracked file under the vault output tree, root `debug-*`, root `temp-*`, `temp-items/`, and `src/temp/`.
- [x] Record for every file: policy category, producer command or origin, current consumer, reproducibility, retention decision, and replacement/recovery path.
- [x] Search source, tests, docs, package scripts, and Git history for real consumers; a filename or ignore match alone is not deletion evidence.
- [x] Hash/group duplicates and compare source Markdown with generated JSON so unique source material is not mistaken for output.

### 2. Define and apply the policy

- [x] Create `docs/artifact-policy.md` defining source input, generated disposable output, tracked golden fixture, tracked acceptance evidence, and local/sensitive runtime artifact.
- [x] Keep generated Actor JSON in the ignored vault output path unless a named fixture/evidence consumer requires a tracked copy in a policy-approved location.
- [x] Promote reusable debug behavior into named tools or fixture-backed tests before removing obsolete scratch copies.
- [x] Relocate retained Item inputs/expected outputs from `temp-items/` to explicit fixture/source locations, update all consumers, and regenerate through project workflows where output is required. The source-identical Shield fixture and real v12/v14 CLI outputs restore the useful historical two-Activity behavior plus schema-valid rarity, activation, and recovery; broader missing Item mechanics are separately retained as parent finding SEM-005.
- [x] Preserve unrelated user files and current dirty changes; use only path-scoped edits/removals.

### 3. Enforce the boundary

- [x] Add a tested repository hygiene tool that inspects Git-tracked paths and fails on disposable vault output, credential/cookie patterns, `.local` runtime state, and unclassified root scratch files.
- [x] Make the gate fail closed on Git errors and zero/invalid repository state, reusing the typed Git boundary where appropriate.
- [x] Add the hygiene command to `ci:verify` only after the existing repository has been brought into policy compliance.
- [x] Plant and revert representative path-list regressions to prove every prohibited class is rejected.

## Acceptance

Mechanical:

- The inventory accounts for every in-scope tracked path and all retained consumer paths resolve on Windows, including Chinese filenames.
- All tests/typechecks/coverage/anti-overfit/reference/Web/offline smoke gates pass after relocation or removal.
- The hygiene command passes the real tracked tree and fails each planted prohibited-path case.

Semantic:

- A new contributor can identify source, disposable output, golden fixture, acceptance evidence, and sensitive local state without guessing from filenames.
- No unique source data, behavior, or historical proof is lost; retained generated evidence has a named consumer and regeneration story.
- Final Actor/Item deliverables used for acceptance still come from project CLI/workflows rather than manual JSON repair.

## Verification record

- Inventory: 178 exact path entries in `docs/artifact-inventory.md`; pre-clean hygiene reported 178 findings.
- Cleanup: 178 path-scoped staged deletions and zero staged non-deletions; unrelated `AGENTS.md` and Baileywiki paths are not staged; local ignored recovery copies remain.
- Enforcement: real hygiene passes over 1,568 tracked paths; a planted tracked root output failed with one finding and the gate recovered after removal.
- Item replacement: the test fixture equals the real Shield source after BOM/newline normalization; real CLI v12/4.3.9 and v14/5.3.3 outputs emit `veryRare`, Forceful Bash, and Protective Field with reaction plus dawn recovery. The unrelated Jewel identity/rarity/stages remain structurally unchanged.
- Aggregate verification: `bun run ci:verify` passed 693 tests/2,765 expectations, production typecheck, broad typecheck, 87.06% production lines, 88.10% production functions, 99-source anti-overfit audit, hygiene, locked reference verification, Web build, and zero-network Actor smoke.

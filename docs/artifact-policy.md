# Repository Artifact Policy

This policy defines what the repository may track and where each kind of
project artifact belongs. The path-by-path migration record is
`docs/artifact-inventory.md`; the executable enforcement is
`src/tools/repositoryHygiene.ts`.

## The five artifact categories

### 1. Source input

Source input is authored or curated information from which the project builds
an Actor, Item, crawl record, or other deliverable. It is not generated JSON.

- Default Actor/Item source: `obsidian/dnd数据转fvttjson/input/**/*.md`.
- Reusable test source: a named fixture below `src/**/__tests__/fixtures/` or
  `tests/fixtures/`.
- A source fixture must say what parser/workflow consumes it and why an inline
  string is insufficient.

Source input is tracked. A source must never be deleted merely because a file
with a similar basename exists in an output or temp directory.

### 2. Generated disposable output

This is reproducible output whose role is operator delivery, local inspection,
or intermediate processing rather than stable source control evidence.

- Vault output: `obsidian/dnd数据转fvttjson/output/`.
- Vault overwrite backups: `obsidian/dnd数据转fvttjson/output_backup/`.
- Intermediate Markdown: `obsidian/dnd数据转fvttjson/middle/` and
  `middle-test/`.
- Root/local output and scratch: `output/`, `output.json`, `temp/`,
  `temp-items/`, `temp-*`, coverage, build output, and Web job output.

These paths are ignored and must not be tracked. Final Actor JSON must still be
produced in the default vault output by the project CLI/workflow; “disposable”
means “not committed”, not “unimportant to the operator”. Never hand-repair a
generated Actor or Item JSON. Repair source/code/workflow, then regenerate.

### 3. Tracked golden fixture

A golden fixture is the smallest stable input or output needed by an automated
test. It belongs beside its consumer under a named fixture directory, not in a
generic output or temp tree.

Every tracked golden fixture must have:

- a direct automated consumer;
- a stable source or versioned schema basis;
- deterministic normalization for volatile IDs/timestamps;
- a regeneration command or a reason it is intentionally hand-authored input;
- `assertEqualStructure()` or a stricter semantic assertion for structural
  output changes.

Random CLI output is not a golden fixture merely because it once caught a bug.

### 4. Tracked acceptance evidence

Acceptance evidence is a dated, reviewed record supporting a declared product
claim. Narrative reports belong under `docs/acceptance/`. A generated JSON is
tracked as evidence only when a named report/test requires those exact bytes
and an ignored regeneration is insufficient.

If exact JSON evidence is necessary, place it in a clearly named acceptance
fixture/evidence directory and record:

- source path and source hash;
- exact CLI/workflow producer command;
- Foundry/dnd5e/module target versions;
- semantic review scope and report consumer;
- normalization/reproducibility contract.

The default vault output remains ignored even when a dated report links to its
expected local path. Historical evidence is amended when superseded; it is not
silently rewritten to make an old run appear current.

### 5. Local or sensitive runtime artifact

This category contains machine state, operator recovery state, credentials,
sessions, and local runtime data. It is never tracked.

- `.env*` except explicit example/sample/template files.
- `.local/`, local Foundry worlds/modules/data, browser/runtime profiles.
- cookies, cookie headers, credential/session/private-key paths.
- crawler storage and authenticated crawl state.
- `obsidian/dnd数据转fvttjson/.fvtt-sync-manifest.json`.
- `.obsidian/workspace.json` and `workspace-mobile.json`.
- local sync backups and Web job state.

The hygiene gate checks path boundaries; it does not make committing a secret
safe just because the filename is unusual. Secret/content scanning remains a
separate pre-stage obligation.

## Normal source and configuration

Application code, tests, documentation, package metadata, stable vault
configuration, and versioned reference provenance are normal repository
content rather than generated artifacts. `AGENTS.md` is intentionally tracked
even though Ruler's generated ignore block also matches it; the hygiene gate
therefore allows it explicitly. Obsidian plugin/config files may remain tracked
when they are shared project tooling, but workspace layout state may not.

## Retention and migration rules

1. Inventory producer, consumer, reproducibility, and retention before moving
   or untracking an existing artifact.
2. Preserve unique source/behavior first. Promote it to a named source,
   fixture, tool, test, or document before removing the scratch copy.
3. Keep local ignored output when it may still help the operator; removal from
   Git does not require destroying the local working copy.
4. Use path-scoped index/commit operations. Never use broad staging or bulk
   deletion based only on `debug`, `temp`, or `output` in a filename.
5. Git history is a recovery path for historical generated bytes, not a reason
   to keep every generation in the current tree.
6. Unrelated user files and current dirty changes remain owned by the user.

## Supported producer paths

- One Actor source:

      bun run src/index.ts "obsidian/dnd数据转fvttjson/input/example.md" -o "obsidian/dnd数据转fvttjson/output/example.json"

- Vault sync:

      bun run src/index.ts --sync --vault "obsidian/dnd数据转fvttjson"

- v14 acceptance batches:

      bun run src/tools/v14AcceptanceSuite.ts --out-dir "obsidian/dnd数据转fvttjson/output/v14-acceptance" --report "docs/acceptance/v14-core-batch-verification.md"
      bun run src/tools/v14AcceptanceSuite.ts --effect-profile modded-v14 --out-dir "obsidian/dnd数据转fvttjson/output/v14-modded-acceptance" --report "docs/acceptance/v14-modded-batch-verification.md"

Tracked reports may describe these ignored outputs. The output becomes a
deliverable only after the project verifier and source-to-output semantic
review pass; Git tracking is not an acceptance signal.

## Enforcement

Run:

    bun run hygiene:repository

The gate enumerates the real Git index and fails closed on:

- tracked vault output or output backup;
- tracked sync manifest or Obsidian workspace state;
- tracked `.local`, credential, cookie, session, or private-key paths;
- unclassified root `debug-*`, `temp*`, `output*`, `test_*.js`, or
  `verify.ts` scratch paths;
- Git command failure or a zero-path result.

The gate normalizes Windows separators and preserves Chinese filenames. Add a
new allow path only by documenting which category it belongs to and adding a
positive consumer-backed test; never weaken a rule merely to make the current
tree pass.

# 2026-06-02 Development Readiness Notes

## Completed

- Configured Git safe-directory access for `I:/OpenCode/fvttV12JsonGenerator` in the current user profile so future `git status`, diff, review, and push work can inspect the repository normally.
- Added stable package scripts for common project workflows:
  - `bun run test`
  - `bun run test:npc`
  - `bun run sync:vault`
  - `bun run translate:pending`
  - `bun run cli:help`
  - `bun run verify:actor`
- Added `src/tools/actorVerification.ts`, a reusable source-vs-actor summary tool for semantic review support.
- Added focused test coverage for the actor verification tool.
- Added `tmp-test-*/` to `.gitignore` to keep future scratch test directories out of Git status.

## Artifact Boundary

The following root-level artifacts look like temporary/debug material but are already tracked by Git, so they were not deleted or moved in this pass:

- `debug-*.ts`
- `debug-trace.js`
- `test_*.js`
- `verify.ts`
- `output/`
- `temp/`
- `temp-items/`
- `output.json`
- `temp-dragon.json`

Cleaning or reorganizing those tracked files should be a separate explicit change because it may affect existing historical fixtures, local reference material, or pending work.

## Existing Workspace State Not Touched

These changes existed before this pass and were left as-is:

- Modified Obsidian vault state files.
- Untracked Obsidian item input markdown files.
- Existing local-only item workflow agent plan.

## Verification Expectation

For future generated Actor JSON work, `bun run verify:actor -- <source.md> <actor.json>` should be used after project CLI/workflow regeneration. Its output is a review aid, not proof of correctness by itself; final acceptance still requires checking the summary against the source markdown and user goal.

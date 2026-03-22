# Agent Notes

## Project Goal

- Convert Obsidian NPC/monster markdown into Foundry VTT dnd5e Actor JSON.
- Current supported sources are Chinese YAML/Markdown and English bestiary-style markdown.
- Near-term roadmap also includes ingesting plain text and converting it into project-compatible markdown before JSON generation.

## Important Paths

- Workspace root: `I:\OpenCode\fvttV12JsonGenerator`
- Obsidian vault: `I:\OpenCode\fvttV12JsonGenerator\obsidian\dnd数据转fvttjson`
- Main CLI entry: `I:\OpenCode\fvttV12JsonGenerator\src\index.ts`
- Actor generator: `I:\OpenCode\fvttV12JsonGenerator\src\core\generator\actor.ts`
- Chinese action parser: `I:\OpenCode\fvttV12JsonGenerator\src\core\parser\action.ts`
- English action parser: `I:\OpenCode\fvttV12JsonGenerator\src\core\parser\englishAction.ts`

## Working Rules

- Preserve the current architecture unless the task explicitly calls for a redesign.
- Do not replace the Golden Master strategy with a from-scratch actor builder without adding schema-level tests first.
- Any parser bug fix must add or update a fixture-backed test.
- Any structural output change must be validated with `assertEqualStructure()` or a stricter equivalent.
- Keep tasks narrow. Do not combine bug fixes, refactors, and new features in one pass unless the tests force it.
- Avoid network dependence in tests. When a workflow or generator is tested, disable translation services unless the test is specifically about translation.
- Before answering or acting on any user request, explicitly use any applicable superpowers skill workflow first, especially `using-superpowers`, and state which skill(s) are being used.
- Do not expand the user's requested behavior. If the user asks for `attack -> damage`, do not silently add `save` or other chained activities unless the source markdown explicitly requires it or the user asks for it.
- For generated actor JSON, do not claim a fix is complete until the relevant JSON has been regenerated and manually re-checked against the source markdown for semantic correctness, not just test success.

## Baseline Commands

- Run all tests: `bun test`
- Run coverage: `bun test --coverage`
- Run one file: `bun test src/core/generator/__tests__/phase1-validation.test.ts`
- Convert one markdown file: `bun run src/index.ts templates/npc-example.md -o output/dragon.json`
- Sync the Obsidian vault: `bun run src/index.ts --sync --vault "obsidian/dnd数据转fvttjson"`
- Translate pending JSON in place: `bun run src/index.ts --translate-json --translate-dir "data/need_tran"`

## Test Expectations

- `bun test` must be green before starting the next task.
- Fix any timeout or flaky workflow test before adding new feature work.
- Prefer fixture-based regression tests over ad hoc assertions.
- For Golden Master comparisons, ignore volatile fields such as `_id`, `_stats`, `folder`, and activity ids.

## Fixture Workflow

- Put parser fixtures under `src/core/parser/__tests__/fixtures` when the goal is parser coverage.
- Put end-to-end or regression fixtures under `tests/fixtures` when the goal is generated actor validation.
- For each new hand-repaired case, keep:
  - source markdown
  - expected JSON or structural expectations
  - a focused test that explains the bug being locked down

## Priority Order For AI Work

1. Keep the test baseline stable.
2. Expand structural regression coverage.
3. Patch parser gaps revealed by fixtures.
4. Improve CLI and developer workflow.
5. Only then consider deeper architectural changes.

## Current Review Guidance

- Highest-value parser gaps are Chinese multi-damage parsing, Chinese legendary action cost extraction, and condition/effect binding edge cases.
- `sbiRegex.js` from `Aioros/5e-statblock-importer` is a reference for parsing ideas, not a drop-in source of truth for this project.
- Prefer incremental extraction of proven regex patterns over bulk porting.

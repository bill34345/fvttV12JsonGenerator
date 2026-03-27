# Agent Notes

## Hard Gates

- `AGENTS.md` is mandatory for the entire turn.
- In the first working update, explicitly say:
  - `AGENTS.md` is in effect,
  - which project path will be used (`CLI`, workflow fix, parser fix, test update, etc.),
  - what will count as valid completion.
- Default working input and output locations are inside the Obsidian vault, not the repository root.
- Read source markdown from `obsidian/dnd数据转fvttjson/input`.
- Treat generated deliverables inside `obsidian/dnd数据转fvttjson/output` as the default output location unless the user explicitly requests another path.
- Final deliverables must be produced by the project CLI or project workflows.
- Do not hand-author, hand-repair, or manually construct final actor JSON.
- Do not present temporary manual artifacts as results.
- Do not switch from “fix the project flow” to “produce something usable however possible”.
- Do not claim completion or correctness until the target JSON has been regenerated through the project flow and manually checked against the source markdown.
- If you drift from the required workflow, stop immediately, say so plainly, and return to the project-path solution.
- If two attempts in a row fail, stop and report:
  - current root cause,
  - evidence gathered,
  - the single narrow next fix to try.

## Project Goal

- Convert Obsidian NPC/monster markdown into Foundry VTT dnd5e Actor JSON.
- Supported sources currently include Chinese YAML/Markdown and English bestiary-style markdown.

## Core Rules

- Preserve the current architecture unless the task explicitly calls for a redesign.
- Any parser bug fix must add or update a fixture-backed test.
- Any structural output change must be validated with `assertEqualStructure()` or a stricter equivalent.
- Keep tasks narrow. Do not combine bug fixes, refactors, and new features in one pass unless tests force it.
- Avoid network dependence in tests unless the test is specifically about translation.
- Do not expand the user's requested behavior.
- For generated actor JSON, “generated successfully”, “tests pass”, and “JSON parses” are never sufficient by themselves for correctness claims.

## Baseline Commands

- Run all tests: `bun test`
- Run coverage: `bun test --coverage`
- Run one file: `bun test src/core/generator/__tests__/phase1-validation.test.ts`
- Convert one markdown file: `bun run src/index.ts "obsidian/dnd数据转fvttjson/input/example.md" -o "obsidian/dnd数据转fvttjson/output/example.json"`
- Sync the Obsidian vault: `bun run src/index.ts --sync --vault "obsidian/dnd数据转fvttjson"`
- Translate pending JSON in place: `bun run src/index.ts --translate-json --translate-dir "data/need_tran"`

## Paths

- Workspace root: `I:\OpenCode\fvttV12JsonGenerator`
- Obsidian vault: `I:\OpenCode\fvttV12JsonGenerator\obsidian\dnd数据转fvttjson`
- Default input dir: `I:\OpenCode\fvttV12JsonGenerator\obsidian\dnd数据转fvttjson\input`
- Default output dir: `I:\OpenCode\fvttV12JsonGenerator\obsidian\dnd数据转fvttjson\output`
- Main CLI entry: `I:\OpenCode\fvttV12JsonGenerator\src\index.ts`
- Actor generator: `I:\OpenCode\fvttV12JsonGenerator\src\core\generator\actor.ts`
- Chinese action parser: `I:\OpenCode\fvttV12JsonGenerator\src\core\parser\action.ts`
- English action parser: `I:\OpenCode\fvttV12JsonGenerator\src\core\parser\englishAction.ts`

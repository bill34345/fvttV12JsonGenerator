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
- Do not switch from "fix the project flow" to "produce something usable however possible".
- Do not claim completion or correctness until the target JSON has been regenerated through the project flow and checked against the source markdown using `docs/generated-actor-verification.md`.
- If you drift from the required workflow, stop immediately, say so plainly, and return to the project-path solution.
- If the working tree has uncommitted changes, treat the current workspace as the source of truth. Do not create a worktree from `HEAD` for plan execution unless the user confirms or the relevant dirty changes are migrated into the worktree first.
- If two attempts in a row fail, stop and report:
  - current root cause,
  - evidence gathered,
  - the single narrow next fix to try.

## Project Goal

- Convert Obsidian NPC/monster markdown into Foundry VTT dnd5e Actor JSON.
- Supported sources currently include Chinese YAML/Markdown and English bestiary-style markdown.

## Long-Running Project Hardening Program

- For the remediation program started on 2026-07-15, read and maintain `docs/remediation/2026-07-15-project-hardening/EXECPLAN.md` before changing code.
- Treat that ExecPlan as the authoritative finding ledger, progress record, decision log, evidence index, and cross-session recovery document. Chat summaries, Goal text, memories, and checkpoints are supporting context only.
- At every stopping point, update the ExecPlan's progress, discoveries, decisions, finding states, verification evidence, and exact remaining work.
- Do not close a finding until both mechanical verification and semantic acceptance are recorded. Continue to the next authorized milestone without asking for a generic next step; pause only for a material product choice, new authority, irreversible action, credentials, or an external-state dependency.

## Workflow Layers

- Root instructions cover project-wide gates and route work to the right workflow.
- Actor JSON generation workflow: source markdown in `obsidian/dnd数据转fvttjson/input` -> project CLI -> generated JSON in `obsidian/dnd数据转fvttjson/output`; follow `docs/generated-actor-verification.md`.
- Site crawl workflow: `src/tools/crawlSites.ts` and `src/core/crawl/*` collect source-site artifacts under `obsidian/dnd数据转fvttjson/crawls/...`, then convert `records.json` to plaintext before entering existing ingest/generator flows.
- Keep site-crawl logic decoupled from `src/index.ts` unless the user explicitly asks to join the flows.
- Use directory-specific AGENTS files for specialized rules: `src/core/generator/AGENTS.md` for generator anti-overfit, `src/core/crawl/AGENTS.md` for crawler and crawl-to-plaintext rules, and `src/web/AGENTS.md` for Web/API/VPS deployment rules.

## Project Understanding Index

- When the user asks for project understanding, architecture review, impact analysis, or codebase orientation, `project-understanding` may create or update `.pui/` under the workspace root without separate edit authorization.
- `.pui/` is local tooling cache, not source code or a generated deliverable.
- Do not modify source files while running project-understanding unless the latest user message explicitly authorizes code changes.

## Target Runtime Versions

Unless the user explicitly changes the target, generated Foundry JSON must target:

- Foundry VTT: v12
- dnd5e system: 4.3.9
- Default effect profile: core
- Modded effect profile: modded-v12
- MIDI-QOL: v12.4.27.1
- DAE: v12.0.18
- Times Up: v11.3.20
- Item Macro: v2.2.0

When implementing or reviewing behavior that depends on Foundry, dnd5e, MIDI-QOL, DAE, Times Up, Item Macro, or any other module API:

- Do not use latest documentation by default.
- Prefer locked local references under `references/` for the exact target version.
- If local references are missing, use Context7 with a version-specific library ID when available.
- If Context7 cannot confirm the exact version, consult the official package page or source repository for the target version before coding.
- Do not infer module flags, hook names, macro pass names, Active Effect fields, or compatibility behavior from memory.
- Final verification notes must state which versioned source was checked for module-dependent behavior.

For module-integrated JSON, "tests pass", "JSON parses", and "generated successfully" are not enough. The generated JSON must be checked against the target module version's documented flags, effects, hooks, or workflow behavior.

## Core Rules

- Preserve the current architecture unless the task explicitly calls for a redesign.
- Any parser bug fix must add or update a fixture-backed test.
- Any structural output change must be validated with `assertEqualStructure()` or a stricter equivalent.
- Keep tasks narrow. Do not combine bug fixes, refactors, and new features in one pass unless tests force it.
- Avoid network dependence in tests unless the test is specifically about translation.
- Do not expand the user's requested behavior.
- For generated actor JSON, follow `docs/generated-actor-verification.md`; "generated successfully", "tests pass", and "JSON parses" are never sufficient by themselves for correctness claims.

## Anti-Overfit Gate

- Before implementing parser, generator, or inference logic, classify each new rule as one of:
  - `schema-derived`: required by the target Foundry/dnd5e/module schema or versioned reference.
  - `source-derived`: directly parsed from source markdown, YAML, structured action data, or explicit item/actor input.
  - `corpus-derived`: generalized from multiple source examples with positive and negative coverage.
  - `explicit-exception`: a narrow exception explicitly authorized by the user and documented at the call site.
- Do not add creature-, action-, or item-name mechanics branches unless they are `explicit-exception`.
- Do not bind mechanics from action-name semantics alone. Save DC source abilities, damage, AC, uses, recovery, and effects must come from source data, schema rules, generalized corpus rules, or explicit exceptions.
- If multiple mechanical candidates match, use a documented stable order or keep the literal value. Do not add ad hoc semantic filters that only make the current actor pass.
- Before finishing parser/generator work, run a generalization check: identify at least two examples the rule should handle, one close negative it should not handle, and one unrelated actor or item that should remain unchanged.
- Final responses for parser/generator changes must state which real inputs or generated JSON outputs were checked. Do not report only that tests passed.
- Run `bun run audit:anti-overfit` for parser/generator changes. If it reports a finding, either remove the pattern or document a valid `anti-overfit: allow <source-kind> - <reason>` exception.

## Baseline Commands

- Run all tests: `bun test`
- Run coverage: `bun test --coverage`
- Run one file: `bun test src/core/generator/__tests__/phase1-validation.test.ts`
- Convert one markdown file: `bun run src/index.ts "obsidian/dnd数据转fvttjson/input/example.md" -o "obsidian/dnd数据转fvttjson/output/example.json"`
- Sync the Obsidian vault: `bun run src/index.ts --sync --vault "obsidian/dnd数据转fvttjson"`
- Translate pending JSON in place: `bun run src/index.ts --translate-json --translate-dir "data/need_tran"`
- Crawl Goddess Fantasy board: `bun run src/tools/crawlSites.ts goddessfantasy-board --board-url "<url>" --out-dir "obsidian/dnd数据转fvttjson/crawls/goddessfantasy/board-<id>"`
- Convert crawl records to plaintext: `bun run src/tools/crawlSites.ts records-to-plaintext --records "obsidian/dnd数据转fvttjson/crawls/goddessfantasy/board-<id>/records.json" --out-dir "obsidian/dnd数据转fvttjson/crawls/goddessfantasy/board-<id>/plaintext/monsters"`
- Run crawl tests: `bun test src/core/crawl/__tests__/goddessfantasy.test.ts src/core/crawl/__tests__/recordsToPlaintext.test.ts`

## Paths

- Workspace root: the directory containing this `AGENTS.md`.
- All project-relative paths below are relative to the workspace root.
- Local Foundry v14 application root: `.local/foundry-v14/app/14.364`.
- Local Foundry v14 server entry: `.local/foundry-v14/app/14.364/main.js`.
- Local Foundry v14 test data path: `.local/foundry-v14/data/server-mirror`.
- Local Foundry v14 test modules: `.local/foundry-v14/data/server-mirror/Data/modules`.
- Local Foundry v14 test systems: `.local/foundry-v14/data/server-mirror/Data/systems`.
- Local Foundry v14 test worlds: `.local/foundry-v14/data/server-mirror/Data/worlds`.
- For local Foundry runtime or module work, use the project-local `server-mirror` paths above first; do not rediscover them by scanning the machine unless a listed path is missing or the user asks for a fresh inventory.
- `C:\Users\Administrator\AppData\Local\FoundryVTT` is the desktop-default data shell on this machine, not the populated project test mirror; as last verified on 2026-07-14, its `Data/modules` contained no installed modules.
- The project-local mirror is not the production server. Do not inspect or modify production merely because a task refers to "local Foundry", "FVTT", or "mods".
- Obsidian vault: `obsidian/dnd数据转fvttjson`
- Default input dir: `obsidian/dnd数据转fvttjson/input`
- Default output dir: `obsidian/dnd数据转fvttjson/output`
- Default crawl artifacts: `obsidian/dnd数据转fvttjson/crawls`
- Main CLI entry: `src/index.ts`
- Site crawl tool: `src/tools/crawlSites.ts`
- Crawl core: `src/core/crawl`
- Plaintext ingest: `src/core/ingest/plaintext.ts`
- Actor generator: `src/core/generator/actor.ts`
- Chinese action parser: `src/core/parser/action.ts`
- English action parser: `src/core/parser/englishAction.ts`

## Target-World Spell Resolver Hard Gate

- Only Actors carrying a valid resolver manifest are eligible.
- Only module-owned embedded Spells and module-owned Cast Activities in an explicitly linked generated feature may be changed.
- Never mutate compendiums, patch Foundry/dnd5e prototypes, delete by name, or run an automatic world-wide migration.
- Hydration is Actor-level all-or-nothing with compensating rollback.
- Manual edits require Keep, Overwrite, or Cancel; closing the review is Cancel.
- Runtime acceptance uses the project-local Foundry mirror first. Production requires separate authorization.

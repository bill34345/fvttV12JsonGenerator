# Precommit Review Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this review task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Review the current dirty workspace after the NPC/monster parser stabilization and item AI normalizer network-isolation fixes, then produce a clear submit/no-submit recommendation with commit grouping.

**Architecture:** This is a review-only plan. Do not implement new feature behavior, do not hand-author actor JSON, and do not create a clean worktree from `HEAD`; the dirty workspace is the source of truth for this review. The reviewer should inspect the current diff, verify the generated Actor JSON came from the project CLI, and identify any defects, scope leaks, or commit-boundary issues before staging.

**Tech Stack:** Bun test runner, TypeScript, project CLI at `src/index.ts`, Obsidian vault paths under `obsidian/dnd数据转fvttjson`, Foundry VTT dnd5e Actor JSON.

---

## Mandatory Context

- `AGENTS.md` is in effect for the whole review.
- Workspace root: `I:\OpenCode\fvttV12JsonGenerator`
- Default source Markdown location: `obsidian/dnd数据转fvttjson/input`
- Default final JSON location: `obsidian/dnd数据转fvttjson/output`
- Do not manually edit final Actor JSON.
- Do not claim correctness unless the target JSON is regenerated through the project CLI and manually checked against source Markdown.
- Current known dirty files at plan creation:
  - Modified: `AGENTS.md`
  - Modified: `README.md`
  - Modified: `docs/manual.md`
  - Modified: `obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json`
  - Modified: `src/core/ingest/item-ai-normalizer.ts`
  - Modified: `src/core/parser/__tests__/action.test.ts`
  - Modified: `src/core/parser/__tests__/yaml.test.ts`
  - Modified: `src/core/parser/action.ts`
  - Modified: `src/core/parser/yaml.ts`
  - Modified: `tests/core/ingest/item-ai-normalizer.test.ts`
  - Untracked: `docs/superpowers/plans/2026-04-27-item-ai-normalizer-network-isolation.md`
  - Untracked: `docs/superpowers/plans/2026-04-27-npc-monster-parser-stabilization.md`
  - Untracked: `src/core/parser/__tests__/fixtures/yaml-legacy-actions.md`

## Review Scope

Review only these completed work streams:

1. NPC/monster parser stabilization
   - `src/core/parser/action.ts`
   - `src/core/parser/yaml.ts`
   - `src/core/parser/__tests__/action.test.ts`
   - `src/core/parser/__tests__/yaml.test.ts`
   - `src/core/parser/__tests__/fixtures/yaml-legacy-actions.md`

2. Item AI normalizer test isolation
   - `src/core/ingest/item-ai-normalizer.ts`
   - `tests/core/ingest/item-ai-normalizer.test.ts`

3. Workflow documentation and generated verification output
   - `README.md`
   - `docs/manual.md`
   - `AGENTS.md`
   - `docs/superpowers/plans/*.md`
   - `obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json`

Do not expand the review into new item-generation functionality. If you find item-generation gaps outside `ItemAiNormalizer`, record them as follow-up work instead of fixing them.

---

### Task 1: Establish Review Baseline

**Files:**
- Inspect: all dirty files listed in Mandatory Context
- Do not modify files in this task

- [ ] **Step 1: Confirm working directory and dirty tree**

Run:

```powershell
pwd
git status --short
```

Expected:

```text
Path
----
I:\OpenCode\fvttV12JsonGenerator
```

Expected `git status --short` includes the dirty files listed in Mandatory Context. If additional files appear, include them in the review report under "Unexpected workspace changes".

- [ ] **Step 2: Capture the diff summary**

Run:

```powershell
git diff --stat
git diff --name-only
```

Expected: changed files match the review scope plus the generated output JSON. If unrelated files appear, do not revert them; list them as scope risks.

- [ ] **Step 3: Confirm no final deliverable was hand-authored during review**

Run:

```powershell
git diff -- obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json
```

Expected: JSON diff may exist because the CLI regenerated it. The reviewer must not manually edit this file. If the file needs to change, regenerate it in Task 5.

---

### Task 2: Review NPC/Monster Parser Stabilization

**Files:**
- Review: `src/core/parser/action.ts`
- Review: `src/core/parser/yaml.ts`
- Review: `src/core/parser/__tests__/action.test.ts`
- Review: `src/core/parser/__tests__/yaml.test.ts`
- Review: `src/core/parser/__tests__/fixtures/yaml-legacy-actions.md`

- [ ] **Step 1: Inspect the parser diff**

Run:

```powershell
git diff -- src/core/parser/action.ts src/core/parser/yaml.ts src/core/parser/__tests__/action.test.ts src/core/parser/__tests__/yaml.test.ts src/core/parser/__tests__/fixtures/yaml-legacy-actions.md
```

Check:

- `ActionParser` uses existing `parseDamage()` for multi-damage attack strings before falling back to the old single-type path.
- `YamlParser` only invokes `StructuredActionParser` when the section actually looks like a structured action section.
- Legacy object-style action fixtures stay on `result.actions`.
- `result.structuredActions` remains `undefined` for legacy object-style actions.

- [ ] **Step 2: Run focused parser tests**

Run:

```powershell
bun test src/core/parser/__tests__/action.test.ts src/core/parser/__tests__/yaml.test.ts
```

Expected:

```text
0 fail
```

If a parser test fails, stop the review and report:

- the failing test name,
- the changed file most likely responsible,
- the narrowest next fix to attempt.

- [ ] **Step 3: Assess parser risk**

In the review report, answer these exact questions:

- Does the structured-action detection risk sending valid structured actions down the legacy path?
- Does the new damage parsing preserve previous single-damage behavior?
- Is the new legacy fixture representative enough for the bug being fixed?
- Are there parser behavior changes without fixture-backed tests?

---

### Task 3: Review Item AI Normalizer Isolation

**Files:**
- Review: `src/core/ingest/item-ai-normalizer.ts`
- Review: `tests/core/ingest/item-ai-normalizer.test.ts`

- [ ] **Step 1: Inspect the item normalizer diff**

Run:

```powershell
git diff -- src/core/ingest/item-ai-normalizer.ts tests/core/ingest/item-ai-normalizer.test.ts
```

Check:

- `ItemAiNormalizerHttpClient` is exported and typed as `(url: string, init: RequestInit) => Promise<Response>`.
- `ItemAiNormalizerOptions` accepts optional `httpClient`.
- Constructor uses `options.httpClient ?? fetch.bind(globalThis)`.
- Tests no longer patch private internals with `(normalizer as any)`.
- Tests do not require network access.
- Error and non-2xx response paths return `abilities: []`.

- [ ] **Step 2: Run focused item normalizer tests**

Run:

```powershell
bun test tests/core/ingest/item-ai-normalizer.test.ts
```

Expected:

```text
8 pass
0 fail
```

Expected stderr may include logged fallback errors for simulated network and 401 cases. Treat those logs as acceptable if the tests pass and they come from the mocked failure cases.

- [ ] **Step 3: Assess item normalizer risk**

In the review report, answer these exact questions:

- Does the public `httpClient` option expose too much implementation detail, or is it acceptable as a test seam?
- Does the default runtime path still use global `fetch` exactly once per API request?
- Does this change avoid touching broader item generation behavior?
- Are there any tests that still depend on real network or real API keys?

---

### Task 4: Review Documentation and Plan Artifacts

**Files:**
- Review: `AGENTS.md`
- Review: `README.md`
- Review: `docs/manual.md`
- Review: `docs/superpowers/plans/2026-04-27-item-ai-normalizer-network-isolation.md`
- Review: `docs/superpowers/plans/2026-04-27-npc-monster-parser-stabilization.md`
- Review: `docs/superpowers/plans/2026-04-27-precommit-review-handoff.md`

- [ ] **Step 1: Inspect doc diffs**

Run:

```powershell
git diff -- AGENTS.md README.md docs/manual.md
Get-Content -LiteralPath "docs\superpowers\plans\2026-04-27-item-ai-normalizer-network-isolation.md" -TotalCount 120
Get-Content -LiteralPath "docs\superpowers\plans\2026-04-27-npc-monster-parser-stabilization.md" -TotalCount 120
Get-Content -LiteralPath "docs\superpowers\plans\2026-04-27-precommit-review-handoff.md" -TotalCount 120
```

Check:

- `README.md` and `docs/manual.md` describe plaintext ingestion as `middle -> input -> output`.
- Documentation does not imply manual construction of final Actor JSON is acceptable.
- `AGENTS.md` adds the dirty-worktree source-of-truth rule and does not weaken any hard gate.
- Plan documents match actual executed scope.

- [ ] **Step 2: Assess doc risk**

In the review report, answer these exact questions:

- Should `AGENTS.md` be committed as a project instruction update?
- Are the README/manual examples consistent with the actual CLI behavior?
- Do any docs still incorrectly say plaintext markdown only writes to `input`?
- Should the generated `slithering-bloodfin` output be committed as verification evidence, or left unstaged?

---

### Task 5: Regenerate and Manually Check Actor JSON

**Files:**
- Source: `obsidian/dnd数据转fvttjson/input/slithering-bloodfin__滑行血鳍.md`
- Generated: `obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json`

- [ ] **Step 1: Regenerate through the project CLI**

Run:

```powershell
bun run src/index.ts "obsidian/dnd数据转fvttjson/input/slithering-bloodfin__滑行血鳍.md" -o "obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json"
```

Expected:

```text
Validation passed: No issues detected.
Successfully generated obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json
Name: 滑行血鳍 (Slithering Bloodfin)
Items: 9
```

- [ ] **Step 2: Extract generated key fields**

Run:

```powershell
$env:ACTOR_JSON=(Resolve-Path -LiteralPath "obsidian\dnd数据转fvttjson\output\slithering-bloodfin__滑行血鳍.json").Path
node -e "const fs=require('fs'); const actor=JSON.parse(fs.readFileSync(process.env.ACTOR_JSON,'utf8')); const out={name:actor.name,type:actor.type,hp:actor.system?.attributes?.hp?.max,ac:actor.system?.attributes?.ac?.flat,acCalc:actor.system?.attributes?.ac?.calc,blindsight:actor.system?.attributes?.senses?.blindsight,cr:actor.system?.details?.cr,itemCount:actor.items?.length,itemNames:actor.items?.map(i=>i.name)}; console.log(JSON.stringify(out,null,2));"
```

Expected:

```json
{
  "name": "滑行血鳍 (Slithering Bloodfin)",
  "type": "npc",
  "hp": 143,
  "ac": 16,
  "acCalc": "natural",
  "blindsight": 100,
  "cr": 9,
  "itemCount": 9,
  "itemNames": [
    "血狂 (Blood Frenzy)",
    "扭滑 (Wriggly)",
    "死亡爆裂 (Death Burst)",
    "多重攻击 (Multiattack)",
    "啃咬 (Bite)",
    "尾击 (Tail Crash)",
    "吞咽 (Swallow)",
    "滑溜 (Slippery)",
    "远洋尖啸 (Pelagic Screech)"
  ]
}
```

- [ ] **Step 3: Manually compare with source Markdown**

Run:

```powershell
Get-Content -LiteralPath "obsidian\dnd数据转fvttjson\input\slithering-bloodfin__滑行血鳍.md" -TotalCount 220
```

Check source Markdown contains the same key facts:

- Name: `滑行血鳍 (Slithering Bloodfin)`
- Type: `npc`
- HP: `143`
- AC: `16`
- Blindsight: `100`
- CR: `9`
- Action/feature names corresponding to the 9 generated items.

If terminal encoding renders Chinese as mojibake, do not rewrite files. Use the generated JSON field extraction and existing tests as evidence, and record the terminal encoding limitation in the review report.

---

### Task 6: Run Full Verification

**Files:**
- No file edits

- [ ] **Step 1: Run NPC/monster regression slice**

Run:

```powershell
bun test tests/e2e.test.ts src/core/generator/__tests__/phase1-validation.test.ts src/core/parser/__tests__/yaml.test.ts src/core/parser/__tests__/action.test.ts src/core/ingest/__tests__/plaintext.test.ts src/core/workflow/__tests__/plainTextActor.test.ts tests/cli-plaintext-actors.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 2: Run full test suite**

Run:

```powershell
bun test
```

Expected:

```text
333 pass
0 fail
```

If the exact pass count changes because tests were added, accept the result only if there are `0 fail` and no unexpected skipped tests.

---

### Task 7: Produce Commit Boundary Recommendation

**Files:**
- Review only

- [ ] **Step 1: Propose staging groups**

Use these default groups unless review findings require a different split:

Commit 1, NPC/monster parser and workflow documentation:

```powershell
git add src/core/parser/action.ts src/core/parser/yaml.ts src/core/parser/__tests__/action.test.ts src/core/parser/__tests__/yaml.test.ts src/core/parser/__tests__/fixtures/yaml-legacy-actions.md README.md docs/manual.md AGENTS.md docs/superpowers/plans/2026-04-27-npc-monster-parser-stabilization.md obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json
git commit -m "fix: stabilize npc monster parser workflow"
```

Commit 2, item AI normalizer test isolation:

```powershell
git add src/core/ingest/item-ai-normalizer.ts tests/core/ingest/item-ai-normalizer.test.ts docs/superpowers/plans/2026-04-27-item-ai-normalizer-network-isolation.md
git commit -m "test: isolate item ai normalizer network calls"
```

Do not run these commit commands during review unless the user explicitly asks for commit execution. The review report should say whether this split is acceptable.

- [ ] **Step 2: Decide what to do with this review plan**

Default recommendation:

```powershell
git add docs/superpowers/plans/2026-04-27-precommit-review-handoff.md
```

Include this plan either in a separate docs commit or in the first commit if the user wants durable planning artifacts committed with the work.

---

## Required Review Report Format

Write the final review report in Chinese with these sections:

```markdown
**结论**
通过 / 不通过 / 有条件通过

**阻塞问题**
- 如果没有，写“无”。

**非阻塞风险**
- 列出具体文件和原因。

**验证结果**
- focused parser tests:
- focused item normalizer tests:
- NPC/monster regression:
- full bun test:
- CLI regeneration:
- manual source-vs-output check:

**提交建议**
- Commit 1:
- Commit 2:
- Review plan:

**下一步**
- 一句话说明应该提交、修复问题、还是继续 item 生成流程 plan。
```

Do not say "done" unless every required verification command has run and the CLI-generated Actor JSON has been manually checked against the source Markdown.

---

## Self-Review Notes

- This plan is review-only and does not ask the worker to implement new behavior.
- It preserves the dirty workspace as source of truth, matching `AGENTS.md`.
- It requires project CLI regeneration before correctness claims.
- It keeps item-generation follow-up work out of this review.
- It gives exact commands, expected results, file paths, and final report format.

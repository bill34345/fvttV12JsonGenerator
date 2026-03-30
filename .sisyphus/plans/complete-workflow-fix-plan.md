# Complete Workflow Fix Plan - fvttV12JsonGenerator

## Objective
Run the full pipeline on 10 creatures with zero data loss verification, fixing tool code when gaps are found.

**AGENTS.md is in effect** — Project: `fvttV12JsonGenerator` CLI workflow fix

---

## Target Creatures (10)
1. 蛇口蛮蟹 (Scuttling Serpentmaw)
2. 滑行血鳍 (Slithering Bloodfin)
3. 底栖魔鱼衍体 (Derro)
4. 底栖魔鱼"阿利克辛" (Aboleth "Alixine")
5. 腐化巨鲨 (Corrupted Giant Shark)
6. 噬光鮟鱇 (Light-Devouring Anglerfish)
7. 死亡之拥 (Death's Embrace)
8. 月蚀矿腐化虚寂者 (Eclipse Mine Corrupted Void Dweller)
9. 月蚀矿腐化尖啸者 (Eclipse Mine Corrupted Screamer)
10. 月蚀矿腐化孵育者 (Eclipse Mine Corrupted Brooder)

---

## Required Pipeline Command
```bash
bun run src/index.ts --ingest-plaintext-actors "obsidian/dnd数据转fvttjson/input/开发用数据.md" --vault "obsidian/dnd数据转fvttjson" --enable-ai-normalize --effect-profile modded-v12 --fvtt-version 12
```

---

## Rollback Protocol
If a fix breaks existing functionality:
1. Revert the specific code change
2. Re-run pipeline on a known-good creature (e.g., 蛇口蛮蟹)
3. Compare output against previously verified version
4. If regression found, revert and try alternative approach

---

## Execution Steps

### Step 1: Run Full Pipeline

**Action**: Execute the pipeline command exactly as specified.

**Command**:
```bash
cd "I:\OpenCode\fvttV12JsonGenerator" && bun run src/index.ts --ingest-plaintext-actors "obsidian/dnd数据转fvttjson/input/开发用数据.md" --vault "obsidian/dnd数据转fvttjson" --enable-ai-normalize --effect-profile modded-v12 --fvtt-version 12
```

**Verification**:
- [ ] Command completes without errors
- [ ] 10 JSON files generated in `obsidian/dnd数据转fvttjson/output/`
- [ ] Each JSON file is valid (parseable)
- [ ] Each JSON contains expected top-level keys (name, type, system, effects)

**If fails**: Check `src/index.ts` for argument parsing issues, verify vault path exists.

---

### Step 2: Compare Source vs Output for Each Creature

**Action**: For each creature, systematically compare source markdown against generated JSON.

**Comparison Checklist Per Creature**:

| Category | What to Check |
|----------|---------------|
| **Basic Info** | name, type, size, alignment, challenge rating |
| **Ability Scores** | str, dex, con, int, wis, cha — values and modifiers |
| **Hit Points** | current HP, max HP, temp HP |
| **Speed** | walk, swim, fly, climb, burrow speeds |
| **Skills** | all skills present with correct values |
| **Damage Vulnerabilities/Resistances/Immunities** | present and correct |
| **Senses** | passive Perception, darkvision, etc. |
| **Languages** | all languages present |
| **Actions** | all actions with correct attack/damage values |
| **Bonus Actions** | all bonus actions present |
| **Reactions** | all reactions present |
| **Legendary Actions** | all legendary actions present (if applicable) |
| **Special Traits** | special abilities with correct descriptions |
| **Activities** | sub-activities (brine-shock, needling-bite, vampiric-bite for Venomous Bite) |
| **Effects** | embedded effects on abilities/actions |

**Output Location**: Create comparison notes in `.sisyphus/plans/creature-reviews/` directory.

**Files to Create**:
```
.sisyphus/plans/creature-reviews/
  ├── 01-蛇口蛮蟹-comparison.md
  ├── 02-滑行血鳍-comparison.md
  ├── 03-底栖魔鱼衍体-comparison.md
  ├── 04-底栖魔鱼阿利克辛-comparison.md
  ├── 05-腐化巨鲨-comparison.md
  ├── 06-噬光鮟鱇-comparison.md
  ├── 07-死亡之拥-comparison.md
  ├── 08-月蚀矿腐化虚寂者-comparison.md
  ├── 09-月蚀矿腐化尖啸者-comparison.md
  └── 10-月蚀矿腐化孵育者-comparison.md
```

**Verification**:
- [ ] Each comparison file created
- [ ] All discrepancies documented with line-level references

---

### Step 3: Document All Gaps

**Action**: Aggregate all discrepancies found in Step 2 into a consolidated gap report.

**Output File**: `.sisyphus/plans/gap-report.md`

**Gap Report Template**:
```markdown
# Gap Report

## Pipeline Run Date: [DATE]
## Source: 开发用数据.md
## Output: obsidian/dnd数据转fvttjson/output/

## Summary
- Total creatures processed: 10
- Total gaps found: [N]
- Categories: [list categories]

## Gaps by Category

### Missing Actions
| Creature | Missing Action | Expected | Found In Source (line #) |
|----------|-----------------|----------|--------------------------|

### Missing Sub-Activities
| Creature | Parent Action | Missing Sub-Activity | Expected | Source Location |
|----------|---------------|---------------------|----------|-----------------|

### Incorrect Values
| Creature | Field | Expected | Actual | Source Location |
|----------|-------|----------|--------|-----------------|

### Missing Effects
| Creature | Ability/Action | Missing Effect | Source Description |
|----------|----------------|-----------------|-------------------|

### Parsing Errors
| Creature | Error Type | Source Location | Error Message |
|----------|------------|-----------------|---------------|
```

**Verification**:
- [ ] Gap report created
- [ ] Each gap has source line reference
- [ ] Gaps prioritized by severity (missing data > incorrect values)

---

### Step 4: Fix Tool Code

**Action**: Fix the source code in `src/core/` to address each gap. **DO NOT modify JSON output directly**.

**Fix Order** (by dependency):
1. **Parser fixes** (`src/core/parser/structuredAction.ts`) — if actions/activities missing
2. **Model fixes** (`src/core/models/action.ts`) — if data structure wrong
3. **Generator fixes** (`src/core/generator/actor.ts`) — if output format wrong
4. **Workflow fixes** (`src/core/workflow/plainTextActor.ts`) — if orchestration wrong

**Per-Fix Protocol**:
1. Identify the specific gap
2. Locate relevant source file
3. Write the code fix
4. Add or update a test in `src/core/generator/__tests__/` or `src/core/parser/__tests__/`
5. Run `bun test` to verify fix doesn't break existing functionality
6. Re-run pipeline for the affected creature only
7. Verify gap is closed

**Test Requirements**:
- Each parser fix MUST have a corresponding fixture-backed test
- Each generator fix MUST update or add a snapshot test
- All tests must pass before proceeding

**Verification**:
- [ ] Each gap has a corresponding code fix
- [ ] Each fix has a test
- [ ] All tests pass (`bun test`)
- [ ] LSP diagnostics clean (`lsp_diagnostics` on changed files)

---

### Step 5: Iteration Until Zero Data Loss

**Action**: Repeat Steps 1-4 until all gaps are closed.

**Iteration Log** (in `.sisyphus/plans/iteration-log.md`):
```markdown
# Iteration Log

## Iteration 1
- Date: [DATE]
- Fixes applied: [list]
- Gaps remaining: [list]
- Status: [OPEN/CLOSED]

## Iteration 2
...
```

**Exit Criteria**:
- Zero missing actions
- Zero missing sub-activities
- Zero incorrect values (ability scores, HP, damage, etc.)
- Zero missing effects
- All 10 creatures verified against source markdown

**Verification**:
- [ ] Iteration log updated
- [ ] Final gap count: 0
- [ ] Each creature JSON matches source markdown

---

### Step 6: Final Verification

**Action**: Complete end-to-end verification of all 10 creatures.

**Verification Commands**:
```bash
# 1. Run full pipeline
bun run src/index.ts --ingest-plaintext-actors "obsidian/dnd数据转fvttjson/input/开发用数据.md" --vault "obsidian/dnd数据转fvttjson" --enable-ai-normalize --effect-profile modded-v12 --fvtt-version 12

# 2. Run all tests
bun test

# 3. Check coverage
bun test --coverage
```

**Final Checklist**:
- [ ] Pipeline runs without errors
- [ ] All 10 JSON files valid and complete
- [ ] All tests pass
- [ ] No LSP errors on source files
- [ ] Build passes (if applicable)
- [ ] Gap report shows 0 gaps
- [ ] Each creature verified manually against source markdown

**Deliverable Confirmation**:
```
obsidian/dnd数据转fvttjson/output/
├── scuttling-serpentmaw__蛇口蛮蟹.json
├── slithering-bloodfin__滑行血鳍.json
├── derro__底栖魔鱼衍体.json
├── aboleth-alixine__底栖魔鱼阿利克辛.json
├── corrupted-giant-shark__腐化巨鲨.json
├── light-devouring-anglerfish__噬光鮟鱇.json
├── deaths-embrace__死亡之拥.json
├── eclipse-mine-corrupted-void-dweller__月蚀矿腐化虚寂者.json
├── eclipse-mine-corrupted-screamer__月蚀矿腐化尖啸者.json
└── eclipse-mine-corrupted-brooder__月蚀矿腐化孵育者.json
```

---

## Key Reference Files

| File | Purpose | Key Lines |
|------|---------|-----------|
| `src/core/parser/structuredAction.ts` | Parses action text → StructuredActionData | 245 lines |
| `src/core/models/action.ts` | StructuredActionData interface | 129 lines |
| `src/core/generator/actor.ts` | structuredActionToActivityData | 787-853 |
| `src/core/generator/actor.ts` | attachSubActivities | 855-880 |
| `src/core/workflow/plainTextActor.ts` | Workflow orchestration | - |
| `src/index.ts` | CLI entry point | - |

---

## Previous Work (Context)
- `.sisyphus/plans/chinese-template-two-step-parse.md` — 1125-line plan for two-step parsing (implemented)
- `.sisyphus/plans/fix-subaction-missing.md` — Previous fix for 3 missing subActions
- `obsidian/dnd数据转fvttjson/output/scuttling-serpentmaw__蛇口蛮蟹.json` — Reference output with Venomous Bite containing 3 sub-activities

---

## Start Execution

Execute Step 1 now.
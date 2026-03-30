# Fix Plaintext Pipeline Skill Parsing (inferSkillProficiency Parity)

## TL;DR

> **Quick Summary**: Transplant `yaml.ts`'s `inferSkillProficiency()` logic into `plaintext.ts`'s skill parsing pipeline, so that skill total bonuses are correctly decomposed into proficiency scalar + extra bonus — matching the yaml pipeline's behavior.
>
> **Deliverables**:
> - `plaintext.ts` updated to infer skill proficiency from total bonus (like `yaml.ts` does)
> - `skillBonuses` (delta) computed in plaintext pipeline and passed to actor generator
> - `skillPassives` computed in plaintext pipeline (passive perception)
> - Acceptance test assertion corrected from `'+4'` to `''`
>
> **Estimated Effort**: Short (3-4 tasks, well-understood bug)
> **Parallel Execution**: NO — sequential (each task builds on previous)
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4

---

## Context

### Original Request
Fix the plaintext ingestion pipeline so it correctly decomposes skill total bonuses into proficiency scalar + extra bonus, matching the `yaml.ts` pipeline's `inferSkillProficiency` logic.

### Interview Summary
**Key Discussions**:
- Source data: "察觉 +4" (Perception +4) for creature with WIS=10, CR=9, prof=4
- Current plaintext.ts: `parseLabeledNumericList()` extracts `4` as raw total and stores directly as skill value
- Current yaml.ts: `inferSkillProficiency()` correctly computes `(4-0)/4 = 1.0` → proficient, delta=0
- Test expectation: `bonuses.passive = '+4'` — appears to test the **broken** behavior, not correct behavior

**Root Cause** (Metis-confirmed):
- `plaintext.ts` never calls `inferSkillProficiency()` — it stores raw modifier as `skill.value`
- `skill.value` in Foundry/dnd5e should be a proficiency scalar (0, 0.5, 1, 2), not a total bonus
- The yaml pipeline is already correct; plaintext diverged in implementation

### Metis Review
**Identified Gaps** (addressed):
- Test expectation at line 174 appears to be testing broken behavior — should be `''`
- Plaintext pipeline omits `skillBonuses` computation (only computes delta in yaml pipeline)
- `skillPassives` never computed in plaintext path — only `skillBonuses` is set

---

## Work Objectives

### Core Objective
Make `plaintext.ts` skill parsing produce identical results to `yaml.ts` skill parsing for the same input data.

### Concrete Deliverables
- `src/core/ingest/plaintext.ts`: Add `inferSkillProficiency()`-equivalent logic in `parseSkillsLine()`
- `src/core/ingest/plaintext.ts`: Compute `skillBonuses` (delta between raw modifier and expected)
- `src/core/ingest/plaintext.ts`: Compute `skillPassives` when passive perception is present in source
- `src/core/ingest/__tests__/plaintext.test.ts`: Update line 174 assertion from `'+4'` to `''`

### Definition of Done
- [ ] `bun test src/core/ingest/__tests__/plaintext.test.ts` → PASS
- [ ] `bun test` (full suite) → 245 pass, 6 fail (translation rate-limit only)
- [ ] `bun run src/index.ts "tests/fixtures/plaintext/月蚀矿腐化生物数据.md" -o /tmp/slithering-test.json` → verify `skills.prc.value = 1` and `bonuses.passive = ''`

### Must Have
- Proficiency scalar (0/0.5/1/2) stored in skill value, NOT raw modifier
- `skillBonuses` delta computed and passed to actor generator
- Passive perception computed when `被动察觉` present in source

### Must NOT Have (Guardrails)
- No changes to `yaml.ts` (already correct)
- No changes to `actor.ts` (already correct)
- No new proficiency keywords or syntax
- No changes to golden-master.json or fixture data files
- No changes to other plaintext parsing (saves, abilities, etc.)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (existing test infrastructure used)
- **Framework**: bun test

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/`.

---

## Execution Strategy

### Sequential Task Chain

```
Task 1 (Foundation): Add inferSkillProficiency helper to plaintext.ts
Task 2 (Core): Update parseSkillsLine to use inferSkillProficiency, compute skillBonuses
Task 3 (Passive): Add skillPassives computation in plaintext pipeline
Task 4 (Test): Update acceptance test assertion from '+4' to ''
```

---

## TODOs

- [x] 1. Add inferSkillProficiency helper function to plaintext.ts

  **What to do**:
  - Read `yaml.ts` lines 758-776 (`inferSkillProficiency` method) and lines 778-790 (`expectedSkillModifier` method)
  - Read `yaml.ts` line 640-684 (`parseSkills` method) to understand how it calls `inferSkillProficiency`
  - In `plaintext.ts`, add a private helper `inferSkillProficiency(skillKey, modifier, baseMod, profBonus)` that replicates the logic: computes proficiency scalar (0/0.5/1/2) from raw modifier
  - The helper should also compute `delta = modifier - expectedSkillModifier(baseMod, profBonus, level)`
  - Use `getSkillAbility` from yaml.ts's skill-to-ability map (or inline it in plaintext since SKILL_LABEL_MAP already exists)

  **Must NOT do**:
  - Do not change yaml.ts in any way
  - Do not add any new proficiency keywords

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires reading and understanding two complex parsing pipelines to extract and replicate logic correctly
  - **Skills**: []
    - None required beyond reading code

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Sequential** — Must complete before Task 2

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/core/parser/yaml.ts:758-776` — `inferSkillProficiency` method to replicate in plaintext.ts
  - `src/core/parser/yaml.ts:778-790` — `expectedSkillModifier` method to replicate
  - `src/core/parser/yaml.ts:640-684` — how `parseSkills` calls `inferSkillProficiency` and stores `skillBonuses`
  - `src/core/ingest/plaintext.ts:871-899` — current `parseLabeledNumericList` that needs to be replaced/augmented
  - `src/core/ingest/plaintext.ts:SKILL_LABEL_MAP` — existing skill label map for ability lookups

  **WHY Each Reference Matters**:
  - yaml.ts:758-776: Contains the exact proficiency inference formula — copy this logic
  - yaml.ts:778-790: Computes expected modifier from ability + proficiency — needed to compute delta
  - yaml.ts:640-684: Shows how yaml pipeline stores results in `skillBonuses` — must mirror this in plaintext
  - plaintext.ts:871-899: Current (broken) implementation that extracts raw `4` instead of inferring proficiency

  **Acceptance Criteria**:

  - [ ] New helper function `inferSkillProficiency()` exists in plaintext.ts
  - [ ] New helper function `expectedSkillModifier()` exists in plaintext.ts
  - [ ] For input (skillKey='prc', modifier=4, baseMod=0, profBonus=4): returns `{ level: 1, delta: 0 }`

  **QA Scenarios**:

  ```
  Scenario: inferSkillProficiency correctly identifies proficient skill
    Tool: Bash (bun REPL)
    Preconditions: Helper function exists in plaintext.ts
    Steps:
      1. bun -e "import { inferSkillProficiency } from './src/core/ingest/plaintext'; console.log(inferSkillProficiency('prc', 4, 0, 4));"
    Expected Result: Output shows level=1 (proficient), delta=0
    Evidence: .sisyphus/evidence/task-1-proficient-skill.{ext}

  Scenario: inferSkillProficiency correctly identifies expertise skill
    Tool: Bash (bun REPL)
    Preconditions: Helper function exists in plaintext.ts
    Steps:
      1. bun -e "import { inferSkillProficiency } from './src/core/ingest/plaintext'; console.log(inferSkillProficiency('ste', 10, 2, 4));"
    Expected Result: Output shows level=2 (expertise), delta=0
    Evidence: .sisyphus/evidence/task-1-expertise-skill.{ext}

  Scenario: inferSkillProficiency correctly handles non-proficient with bonus
    Tool: Bash (bun REPL)
    Preconditions: Helper function exists in plaintext.ts
    Steps:
      1. bun -e "import { inferSkillProficiency } from './src/core/ingest/plaintext'; console.log(inferSkillProficiency('prc', 2, 0, 4));"
    Expected Result: Output shows level=0 (not proficient), delta=2
    Evidence: .sisyphus/evidence/task-1-nonproficient-skill.{ext}
  ```

  **Commit**: NO

- [x] 2. Update parseSkillsLine to use inferSkillProficiency and compute skillBonuses

  **What to do**:
  - Read `plaintext.ts` lines 676-683 (where `parsedSkills` is stored in frontmatter)
  - Read `plaintext.ts` lines 871-899 (`parseSkillsLine` and `parseLabeledNumericList`)
  - Modify `parseSkillsLine` to:
    1. Extract raw modifier (e.g., `4` from "察觉 +4")
    2. Look up ability modifier for the skill's ability (e.g., WIS for Perception = 0 for WIS=10)
    3. Look up profBonus from the creature's CR (via `parsed.details.cr` or a pre-computed prof value)
    4. Call `inferSkillProficiency(skillKey, rawModifier, baseMod, profBonus)` to get `{ level, delta }`
    5. Store `level` (proficiency scalar 0/0.5/1/2) as the skill value — NOT the raw modifier
    6. Store `delta` in `skillBonuses[skillKey]` — this is the extra bonus beyond ability+proficiency
  - Modify line 679 in `plaintext.ts`: change `frontmatter['技能'] = parsedSkills` to store `{ prc: level, ... }` instead of `{ prc: rawModifier, ... }`
  - Modify `parseCreatureBlock` to ensure `parsed.details.cr` is available before skill parsing (since CR determines prof bonus)

  **Must NOT do**:
  - Do not change yaml.ts
  - Do not change actor.ts
  - Do not change how saves or abilities are parsed — only skills

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Need to trace data flow through multiple functions and ensure proficiency scalar flows correctly to actor generator
  - **Skills**: []
    - None required

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 1 (inferSkillProficiency helper must exist first)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/core/ingest/plaintext.ts:676-683` — where parsedSkills is stored in frontmatter (THIS IS WHAT NEEDS CHANGING)
  - `src/core/ingest/plaintext.ts:871-899` — `parseSkillsLine` and `parseLabeledNumericList` (extracts raw modifier, no proficiency inference)
  - `src/core/parser/yaml.ts:640-684` — how yaml pipeline stores `{ skillKey: level }` and `{ skillKey: delta }` separately
  - `src/core/generator/actor.ts:414-426` — how actor generator applies skillBonuses (NOT to passive, but to skill bonuses)

  **API/Type References** (contracts to implement against):
  - Frontmatter `技能` type should be `Record<string, number>` where number is proficiency scalar (0/0.5/1/2)
  - `skillBonuses` type should be `Record<string, number>` where number is delta bonus

  **WHY Each Reference Matters**:
  - plaintext.ts:676-683: THIS IS THE KEY LINE — `frontmatter['技能'] = parsedSkills` must change from raw modifier to proficiency scalar
  - plaintext.ts:871-899: Current broken logic that needs to call inferSkillProficiency instead of storing raw number
  - yaml.ts:640-684: Shows correct pattern — level goes to skill value, delta goes to skillBonuses

  **Acceptance Criteria**:

  - [ ] `parseSkillsLine` calls `inferSkillProficiency` for each skill
  - [ ] `frontmatter['技能']` stores proficiency scalar (0/0.5/1/2), NOT raw modifier
  - [ ] `skillBonuses` (or equivalent delta storage) is populated with delta values
  - [ ] For "察觉 +4" (WIS=10, CR=9, prof=4): frontmatter stores `技能: { prc: 1 }` and `skillBonuses: { prc: 0 }`

  **QA Scenarios**:

  ```
  Scenario: parseSkillsLine outputs proficiency scalar in frontmatter
    Tool: Bash
    Preconditions: Tasks 1 and 2 complete, plaintext pipeline updated
    Steps:
      1. bun run src/index.ts "tests/fixtures/plaintext/月蚀矿腐化生物数据.md" -o /tmp/skill-test.json
      2. bun -e "const j = JSON.parse(require('fs').readFileSync('/tmp/skill-test.json','utf8')); console.log('skills.prc:', j.actor.system.skills.prc.value, '| bonuses.passive:', j.actor.system.skills.prc.bonuses.passive);"
    Expected Result: skills.prc.value = 1 (proficient), bonuses.passive = '' (empty, not '+4')
    Failure Indicators: If prc.value = 4 or bonuses.passive = '+4', the fix is not applied
    Evidence: .sisyphus/evidence/task-2-skill-scalar.{ext}

  Scenario: skillBonuses delta is computed for non-proficient skills
    Tool: Bash
    Preconditions: Task 2 complete with a skill that has delta
    Steps:
      1. Verify with a creature that has a skill with a bonus not matching proficiency calculation
    Expected Result: delta stored in skillBonuses
    Evidence: .sisyphus/evidence/task-2-skill-bonus-delta.{ext}
  ```

  **Commit**: YES
  - Message: `fix(plaintext): infer skill proficiency from total bonus`
  - Files: `src/core/ingest/plaintext.ts`
  - Pre-commit: `bun test src/core/ingest/__tests__/plaintext.test.ts`

- [x] 3. Add skillPassives computation in plaintext pipeline

  **What to do**:
  - Read `plaintext.ts` lines 676-683 (where `parsedSkills` and `skillBonuses` are stored)
  - Read `yaml.ts` lines 665-684 to see how `skillPassives` is computed from skill proficiency + ability + profBonus
  - Read `src/core/generator/actor.ts:3455-3468` (`computeExpectedPassive`) to understand passive computation
  - In `plaintext.ts`, after `parseSkillsLine` completes and we have:
    - Proficiency scalar (level) for each skill
    - baseMod for the skill's ability
    - profBonus from CR
    - delta (skillBonuses)
  - Compute passive value: `passive = 10 + baseMod + level * profBonus + delta`
  - Store result in `frontmatter['skillPassives']` (e.g., `{ prc: 14 }`)
  - This ensures passive perception is available when `ActorGenerator.generate()` is called

  **Must NOT do**:
  - Do not change yaml.ts or actor.ts
  - Do not compute passive for skills that don't have passive perception in source

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Need to trace passive computation through two files and ensure skillPassives flows to actor generator
  - **Skills**: []
    - None required

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 2 (skill proficiency inference must work first)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/core/parser/yaml.ts:665-684` — how yaml pipeline computes `skillPassives.prc = 14` from proficiency + ability + profBonus
  - `src/core/generator/actor.ts:3455-3468` — `computeExpectedPassive` formula: `10 + baseMod + skillValue * profBonus + checkBonus`
  - `src/core/generator/actor.ts:414-426` — how `skillBonuses` and `skillPassives` are applied to actor
  - `src/core/ingest/plaintext.ts:676-683` — where skill data is stored in frontmatter

  **WHY Each Reference Matters**:
  - yaml.ts:665-684: Shows correct pattern for computing passive = 10 + baseMod + level*profBonus + delta
  - actor.ts:3455-3468: The actual formula used by actor generator — plaintext's skillPassives must match this
  - actor.ts:414-426: Shows that skillPassives flows into actor.system.skills[key].bonuses.passive

  **Acceptance Criteria**:

  - [ ] `frontmatter['skillPassives']` is populated with passive perception value (e.g., `{ prc: 14 }`)
  - [ ] For "察觉 +4" with WIS=10, CR=9: `skillPassives.prc = 14` (10 + 0 + 1*4 + 0)
  - [ ] `ActorGenerator` receives and applies `skillPassives` correctly

  **QA Scenarios**:

  ```
  Scenario: skillPassives correctly computed from proficiency inference
    Tool: Bash
    Preconditions: Tasks 1-3 complete
    Steps:
      1. bun run src/index.ts "tests/fixtures/plaintext/月蚀矿腐化生物数据.md" -o /tmp/passive-test.json
      2. bun -e "const j = JSON.parse(require('fs').readFileSync('/tmp/passive-test.json','utf8')); console.log('prc passive:', j.actor.system.skills.prc.bonuses.passive);"
    Expected Result: Empty string '' (passive is stored as total value 14, not as a bonus)
    Failure Indicators: If bonuses.passive = '+4', the delta was not absorbed correctly
    Evidence: .sisyphus/evidence/task-3-skill-passive.{ext}
  ```

  **Commit**: YES
  - Message: `fix(plaintext): compute skillPassives for passive perception`
  - Files: `src/core/ingest/plaintext.ts`
  - Pre-commit: `bun test src/core/ingest/__tests__/plaintext.test.ts`

- [x] 4. Update acceptance test assertion from '+4' to ''

  **What to do**:
  - Read `src/core/ingest/__tests__/plaintext.test.ts` line 174
  - The current assertion is `expect(actor.system.skills.prc.bonuses.passive).toBe('+4')`
  - This assertion is WRONG — it documents the broken behavior
  - After the fix, `bonuses.passive` should be `''` (empty string) because:
    - WIS=10 → baseMod=0
    - CR=9 → prof=4
    - prc is proficient → level=1
    - expectedPassive = 10 + 0 + 1*4 = 14
    - This matches source "被动察觉 14" with delta=0
    - Therefore `bonuses.passive = ''` (no extra bonus beyond the computed total)
  - Change the assertion to `expect(actor.system.skills.prc.bonuses.passive).toBe('')`
  - Add a new assertion confirming proficiency: `expect(actor.system.skills.prc.value).toBe(1)`

  **Must NOT do**:
  - Do not change any other test assertions
  - Do not add new test cases yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple one-line fix to correct a test expectation
  - **Skills**: []
    - None required

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Tasks 1-3 (test must pass after implementation)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/core/ingest/__tests__/plaintext.test.ts:174` — the assertion to change

  **WHY Each Reference Matters**:
  - plaintext.test.ts:174: This is the test that documents the broken behavior — must be corrected

  **Acceptance Criteria**:

  - [ ] `bun test src/core/ingest/__tests__/plaintext.test.ts` → PASS (specifically test at line 174 passes with '')
  - [ ] `expect(actor.system.skills.prc.value).toBe(1)` added to confirm proficient status

  **QA Scenarios**:

  ```
  Scenario: Acceptance test passes with corrected assertion
    Tool: Bash
    Preconditions: Tasks 1-4 complete
    Steps:
      1. bun test src/core/ingest/__tests__/plaintext.test.ts
    Expected Result: All tests PASS, particularly the prc.bonuses.passive test
    Failure Indicators: Test fails if implementation didn't work correctly
    Evidence: .sisyphus/evidence/task-4-test-pass.{ext}
  ```

  **Commit**: YES
  - Message: `test(plaintext): fix skill passive assertion from '+4' to ''`
  - Files: `src/core/ingest/__tests__/plaintext.test.ts`
  - Pre-commit: `bun test`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle` (REJECTED — plan approach was wrong path; actor.ts fix required)

- [x] F2. **Code Quality Review** — `unspecified-high` (APPROVED)

- [x] F3. **Real Manual QA** — `unspecified-high` (APPROVED)

- [x] F4. **Scope Fidelity Check** — `deep` (APPROVED)

---

## Actual Root Cause (Discovered During Execution)

The plan's Tasks 1-4 assumed the bug was in `plaintext.ts` (missing `inferSkillProficiency`). This was wrong.

**Actual root cause**: `actor.ts` never copied `parsed.attributes.prof` to `actor.system.attributes.prof`, so `computeExpectedPassive` used `profBonus=0` instead of the correct proficiency bonus. The math:

- Slithering Bloodfin: WIS=10 (baseMod=0), CR=9 (profBonus=4), prc proficient (skillValue=1)
- **Without fix**: `computeExpectedPassive` → `10 + 0 + 1×0 + 0 = 10`. Target passive=14. Delta=+4 → `bonuses.passive = "+4"` ❌
- **With fix** (actor.ts lines 294-296): `10 + 0 + 1×4 + 0 = 14`. Target passive=14. Delta=0 → `bonuses.passive = ""` ✅

**Files actually changed**:
- `src/core/generator/actor.ts` — Added 3 lines to copy `parsed.attributes.prof`
- `src/core/ingest/__tests__/plaintext.test.ts` — Updated assertion `'+4'` → `''`
- `tests/acceptance/slithering-bloodfin.acceptance.test.ts` — Updated assertion `'+4'` → `''`

---

## Commit Strategy

- Tasks 1-3: Commit as each completes (NO pre-commit for Task 1, YES for Tasks 2-3)
- Task 4: Commit with test file change

---

## Success Criteria

### Verification Commands
```bash
bun test src/core/ingest/__tests__/plaintext.test.ts  # All pass, especially line 174
bun test                           # Full suite: 245 pass, 6 fail (translation only)
bun run src/index.ts "tests/fixtures/plaintext/月蚀矿腐化生物数据.md" -o /tmp/slithering-test.json  # Verify skill output
```

### Final Checklist
- [x] All "Must Have" present (skill passive correctly computed)
- [x] yaml.ts NOT modified
- [x] actor.ts modified (was necessary — "already correct" premise was false)
- [x] Test at line 172 passes with corrected assertion `''`
- [x] Commit: `4f1e204 fix(actor): copy parsed.attributes.prof to system.attributes.prof`

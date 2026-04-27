# NPC Monster Parser Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the existing NPC/monster parsing and generation path so YAML/template actions do not produce blank `structuredActions` and do produce Foundry actor action items.

**Architecture:** Keep the current parser/generator architecture. Treat legacy object-style action lists as legacy actions unless they use the explicit structured-action schema, then verify `YamlParser -> ActorGenerator -> CLI/workflow output` for representative NPC/monster sources. Preserve the already-correct `PlainTextIngestionWorkflow -> middle -> input -> output` flow.

**Tech Stack:** Bun test runner, TypeScript, `YamlParser`, `ActionParser`, `ActorGenerator`, project CLI `src/index.ts`, Foundry VTT dnd5e actor JSON.

---

## Why This Plan Exists

The previous plan file `docs/superpowers/plans/2026-04-27-item-ai-normalizer-network-isolation.md` targets item AI normalizer test isolation. That is a valid later stability issue, but it is not the next step requested here.

This plan is the corrected NPC/monster-only plan. Do not execute item AI normalizer work as part of this plan.

## Current Evidence To Reconfirm

Before changing code, rerun the current NPC/monster failure slice because another session may have already fixed part of it:

```powershell
bun test tests/e2e.test.ts src/core/generator/__tests__/phase1-validation.test.ts src/core/parser/__tests__/yaml.test.ts src/core/ingest/__tests__/plaintext.test.ts src/core/workflow/__tests__/plainTextActor.test.ts tests/cli-plaintext-actors.test.ts
```

Expected target state:

```text
0 fail
```

If this command is already green, the implementation work becomes regression hardening and workflow verification, not broad parser refactoring.

## Scope Boundary

In scope:
- `src/core/parser/yaml.ts`
- `src/core/parser/__tests__/yaml.test.ts`
- `src/core/parser/__tests__/fixtures/yaml-legacy-actions.md`
- `src/core/parser/action.ts`
- `src/core/parser/__tests__/action.test.ts`
- `tests/e2e.test.ts`
- `src/core/generator/__tests__/phase1-validation.test.ts`
- NPC/monster CLI regeneration from `obsidian/dnd数据转fvttjson/input`

Out of scope:
- `src/core/ingest/item-ai-normalizer.ts`
- `tests/core/ingest/item-ai-normalizer.test.ts`
- `src/core/ingest/items.ts`
- `src/core/parser/item-parser.ts`
- `src/core/generator/item-generator.ts`
- Item AI normalization and item-generation feature expansion
- Hand-authoring or hand-repairing final actor JSON

## File Structure

- Modify `src/core/parser/yaml.ts` only if legacy object-style actions still create blank `structuredActions`.
  - Responsibility: route YAML frontmatter sections either to legacy `actions` arrays or explicit `structuredActions`, never both for the same legacy object list.

- Modify `src/core/parser/__tests__/yaml.test.ts`
  - Responsibility: lock `YamlParser` behavior for template-style object actions and explicit structured actions.

- Modify or create `src/core/parser/__tests__/fixtures/yaml-legacy-actions.md`
  - Responsibility: fixture-backed regression for legacy object action entries.

- Modify `src/core/parser/action.ts` only if action item generation still fails for Chinese compact legacy action strings.
  - Responsibility: parse lines like `啮咬 [近战武器攻击]: +14命中, 触及10尺, 2d10+8穿刺 + 2d6火焰`.

- Modify `src/core/parser/__tests__/action.test.ts` only if compact action parsing is not already covered.
  - Responsibility: fixture-backed unit coverage for attack, save, recharge, and multi-damage compact syntax.

- Modify `tests/e2e.test.ts` only if the existing assertions are too weak or stale.
  - Responsibility: template-level integration check that generated actor contains concrete action items.

---

### Task 1: Reproduce And Classify Current NPC/Monster State

**Files:**
- No code changes.

- [ ] **Step 1: Run the NPC/monster regression slice**

Run:

```powershell
bun test tests/e2e.test.ts src/core/generator/__tests__/phase1-validation.test.ts src/core/parser/__tests__/yaml.test.ts src/core/ingest/__tests__/plaintext.test.ts src/core/workflow/__tests__/plainTextActor.test.ts tests/cli-plaintext-actors.test.ts
```

Expected if already fixed:

```text
0 fail
```

Expected if still broken:

```text
End-to-End Conversion > should convert template to valid actor JSON
Received: undefined
```

or:

```text
Parsed structuredActions contains blank utility actions
```

- [ ] **Step 2: Inspect parsed template output**

Run:

```powershell
bun -e "import { readFileSync } from 'node:fs'; import { YamlParser } from './src/core/parser/yaml'; const parsed = new YamlParser().parse(readFileSync('templates/npc-example.md','utf8')); console.log(JSON.stringify({actions: parsed.actions, structuredActions: parsed.structuredActions}, null, 2));"
```

Expected:

```json
{
  "actions": [
    {
      "啮咬 [近战武器攻击]": "+14命中, 触及10尺, 2d10+8穿刺 + 2d6火焰"
    }
  ]
}
```

The actual output has more action entries. The critical expectation is:

```text
structuredActions is undefined
```

If `structuredActions` exists and contains entries with empty `name` or empty `describe`, continue to Task 2.

If `actions` is present and `structuredActions` is absent, skip Task 2 and continue to Task 3.

---

### Task 2: Keep Legacy Object Actions Out Of Structured Actions

**Files:**
- Modify: `src/core/parser/__tests__/yaml.test.ts`
- Create or modify: `src/core/parser/__tests__/fixtures/yaml-legacy-actions.md`
- Modify only if test fails: `src/core/parser/yaml.ts`

- [ ] **Step 1: Add or confirm the legacy fixture**

Ensure `src/core/parser/__tests__/fixtures/yaml-legacy-actions.md` contains:

```markdown
---
名称: Legacy Action Test
类型: npc
动作:
  - "Bite [Melee Weapon Attack]": "+5 to hit, reach 5 ft., one target. Hit: 1d8+3 piercing damage."
---
```

If the repository stores mojibake Chinese keys in fixtures, use the existing mapped keys from `templates/npc-example.md` or `FIELD_MAPPING` rather than introducing a second encoding style.

- [ ] **Step 2: Add the failing parser regression**

In `src/core/parser/__tests__/yaml.test.ts`, add this test inside `describe('YamlParser', ...)`:

```ts
it('keeps legacy object-style actions on the legacy action path instead of creating blank structured actions', () => {
  const yaml = readFileSync('src/core/parser/__tests__/fixtures/yaml-legacy-actions.md', 'utf-8');

  const result = parser.parse(yaml);

  expect(result.actions).toEqual([
    {
      'Bite [Melee Weapon Attack]':
        '+5 to hit, reach 5 ft., one target. Hit: 1d8+3 piercing damage.',
    },
  ]);
  expect(result.structuredActions).toBeUndefined();
});
```

Also ensure this import exists at the top:

```ts
import { readFileSync } from 'node:fs';
```

- [ ] **Step 3: Run the focused parser test**

Run:

```powershell
bun test src/core/parser/__tests__/yaml.test.ts
```

Expected before implementation if still broken:

```text
expect(result.structuredActions).toBeUndefined()
Received: { ... blank utility actions ... }
```

If this test already passes, do not edit `src/core/parser/yaml.ts`; mark Task 2 complete and continue.

- [ ] **Step 4: Implement the minimal structured-action guard**

In `src/core/parser/yaml.ts`, add a private guard method on `YamlParser` if it does not already exist:

```ts
private isStructuredActionSection(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  const structuredKeys = new Set([
    '名称',
    'name',
    '类型',
    'type',
    '描述',
    'describe',
    '子活动',
    '内嵌效果',
    '攻击类型',
    'attackType',
    '命中',
    'toHit',
    '范围',
    'range',
    '伤害',
    'DC',
    'AoE',
    'aoe',
    '目标',
    'target',
    '充能',
    'recharge',
    '每日',
    'perLongRest',
    '专注',
    'concentration',
    '失败效果',
    '成功效果',
    '特殊效果',
    'specialEffects',
  ]);

  return value.some((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }

    return Object.keys(entry as Record<string, unknown>).some((key) => structuredKeys.has(key));
  });
}
```

If the file uses mojibake keys in the current mapping, include the existing mojibake key spellings already present in `src/core/parser/yaml.ts` in the `structuredKeys` set. Do not remove readable Chinese keys if they are already used by tests.

- [ ] **Step 5: Gate structured parsing with the guard**

In `YamlParser.applyField`, the structured action block must follow this shape:

```ts
if (
  ['特性', '动作', '附赠动作', '反应', '传奇动作'].includes(internalKey) &&
  this.isStructuredActionSection(processedValue)
) {
  const structuredParser = new StructuredActionParser();
  const sectionMap: Record<string, string> = {
    特性: '特性',
    动作: '动作',
    附赠动作: '附赠动作',
    反应: '反应',
    传奇动作: '传奇动作',
  };
  const mapped = sectionMap[internalKey];
  if (mapped) {
    result.structuredActions = result.structuredActions ?? {};
    const sa = result.structuredActions as Record<string, StructuredActionData[]>;
    sa[mapped] = structuredParser.parseStructuredSection(processedValue, internalKey);
  }
}
```

If the file uses mojibake internal keys, keep the current keys and only add the `this.isStructuredActionSection(processedValue)` condition. Do not rewrite the whole parser.

- [ ] **Step 6: Re-run parser tests**

Run:

```powershell
bun test src/core/parser/__tests__/yaml.test.ts
```

Expected:

```text
0 fail
```

---

### Task 3: Lock Compact Legacy Action Parsing

**Files:**
- Modify: `src/core/parser/__tests__/action.test.ts`
- Modify only if tests fail: `src/core/parser/action.ts`

- [ ] **Step 1: Add compact action parser coverage**

In `src/core/parser/__tests__/action.test.ts`, add tests like these:

```ts
it('parses compact Chinese melee weapon attacks from template object actions', () => {
  const parser = new ActionParser();

  const action = parser.parse('啮咬 [近战武器攻击]: +14命中, 触及10尺, 2d10+8穿刺 + 2d6火焰');

  expect(action).toEqual(
    expect.objectContaining({
      name: '啮咬',
      type: 'attack',
      attack: expect.objectContaining({
        type: 'mwak',
        toHit: 14,
        reach: '10',
      }),
    }),
  );
  expect(action?.attack?.damage).toEqual([
    { formula: '2d10+8', type: 'piercing' },
    { formula: '2d6', type: 'fire' },
  ]);
});

it('parses compact Chinese save object actions with recharge headers', () => {
  const parser = new ActionParser();

  const action = parser.parse('火焰吐息 [充能5-6]: { 豁免: DC21敏捷, 失败: 18d6火焰, 成功: 减半 }');

  expect(action).toEqual(
    expect.objectContaining({
      name: '火焰吐息',
      type: 'save',
      recharge: { value: 5, charged: true },
      save: expect.objectContaining({
        dc: 21,
        ability: 'dex',
      }),
      damage: [{ formula: '18d6', type: 'fire' }],
    }),
  );
});
```

If current source files use mojibake strings, add the readable Chinese tests only if the project already normalizes readable Chinese in tests. Otherwise use the exact strings printed by:

```powershell
bun -e "import { readFileSync } from 'node:fs'; import { YamlParser } from './src/core/parser/yaml'; const parsed = new YamlParser().parse(readFileSync('templates/npc-example.md','utf8')); console.log(JSON.stringify(parsed.actions?.[0])); console.log(JSON.stringify(parsed.actions?.[4]));"
```

- [ ] **Step 2: Run the action parser tests**

Run:

```powershell
bun test src/core/parser/__tests__/action.test.ts
```

Expected if already fixed:

```text
0 fail
```

Expected if broken:

```text
Received: null
```

or damage parts only use one damage type.

- [ ] **Step 3: Implement minimal parsing fixes only if needed**

If compact melee attack parsing fails in `src/core/parser/action.ts`, update the standard attack regex branch so it accepts:

```text
<name> [<attack type>]: +<toHit>命中, 触及<reach>尺, <damage formula><damage type> + <damage formula><damage type>
```

The implementation must:

```ts
const formulaRegex = /(\d+d\d+(?:\s*[+\-]\s*\d+)?)(?:\s*)([\u4e00-\u9fa5A-Za-z]+)/g;
const damages: Damage[] = [];
for (const match of dmgPart.matchAll(formulaRegex)) {
  const formula = match[1]?.trim();
  const rawType = match[2]?.trim();
  if (!formula || !rawType) continue;
  const typeKey = i18n.getKey(rawType);
  const type = typeKey ? typeKey.replace('DND5E.Damage', '').toLowerCase() : rawType.toLowerCase();
  damages.push({ formula, type });
}
```

Do not rewrite unrelated English parsing.

- [ ] **Step 4: Re-run action parser tests**

Run:

```powershell
bun test src/core/parser/__tests__/action.test.ts
```

Expected:

```text
0 fail
```

---

### Task 4: Verify Template Actor Item Generation

**Files:**
- Modify only if existing assertions are missing: `tests/e2e.test.ts`

- [ ] **Step 1: Ensure template e2e asserts concrete generated items**

In `tests/e2e.test.ts`, keep or add assertions equivalent to:

```ts
const bite = actor.items.find((i: any) => i.name === '啮咬');
expect(bite).toBeDefined();
expect(bite.type).toBe('weapon');

const attackAct = Object.values(bite.system.activities).find((a: any) => a.type === 'attack');
expect(attackAct).toBeDefined();
```

Also ensure multi-damage is covered either here or in `src/core/generator/__tests__/phase1-validation.test.ts`:

```ts
expect(attackAct.damage.parts.length).toBeGreaterThanOrEqual(2);
```

If current files use mojibake names, use the exact existing name literals in the test. Do not change production behavior just to make readable string assertions pass.

- [ ] **Step 2: Run the template e2e and phase1 validation tests**

Run:

```powershell
bun test tests/e2e.test.ts src/core/generator/__tests__/phase1-validation.test.ts
```

Expected:

```text
0 fail
```

---

### Task 5: Verify Plaintext Workflow Still Uses Middle Correctly

**Files:**
- No code changes expected.

- [ ] **Step 1: Run the plaintext workflow slice**

Run:

```powershell
bun test src/core/ingest/__tests__/plaintext.test.ts src/core/workflow/__tests__/plainTextActor.test.ts tests/cli-plaintext-actors.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 2: Confirm dry-run reports middle as markdown dir**

Run:

```powershell
bun run src/index.ts --ingest-plaintext-actors "tests/fixtures/plaintext/月蚀矿腐化生物数据.md" --vault "$env:TEMP\fvtt-cli-npc-plan-check" --dry-run
```

Expected output includes:

```text
Markdown dir: ...\middle
JSON dir: ...\output
Detected creatures: 7
Dry run: yes
```

---

### Task 6: Regenerate And Manually Check Representative Actor JSON

**Files:**
- Generated by CLI: `obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json`

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

- [ ] **Step 2: Parse the generated JSON with Node**

Run:

```powershell
$env:ACTOR_JSON=(Resolve-Path -LiteralPath "obsidian\dnd数据转fvttjson\output\slithering-bloodfin__滑行血鳍.json").Path
node -e "const fs=require('fs'); const actor=JSON.parse(fs.readFileSync(process.env.ACTOR_JSON,'utf8')); console.log(JSON.stringify({name:actor.name,type:actor.type,hp:actor.system?.attributes?.hp,ac:actor.system?.attributes?.ac,blindsight:actor.system?.attributes?.senses?.blindsight,cr:actor.system?.details?.cr,itemCount:actor.items?.length,itemNames:actor.items?.map(i=>i.name)}, null, 2));"
```

Expected values:

```json
{
  "name": "滑行血鳍 (Slithering Bloodfin)",
  "type": "npc",
  "hp": {
    "value": 143,
    "max": 143
  },
  "ac": {
    "flat": 16,
    "calc": "natural"
  },
  "blindsight": 100,
  "cr": 9,
  "itemCount": 9
}
```

The printed `itemNames` must include:

```text
Bite
Tail Crash
Swallow
Pelagic Screech
```

Localized Chinese names are acceptable if the English source names appear in parentheses or match the current expected localized output.

---

### Task 7: Full Test Classification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run all tests**

Run:

```powershell
bun test
```

Expected ideal result:

```text
0 fail
```

Acceptable result for this NPC/monster-only plan:

```text
All NPC/monster tests pass.
Only item AI normalizer tests fail.
```

If item AI normalizer tests still fail, classify them as out of scope and do not fix them in this plan.

- [ ] **Step 2: Stop if a new NPC/monster failure appears**

If any of these files fail, stop and report root cause before making more changes:

```text
tests/e2e.test.ts
src/core/generator/__tests__/phase1-validation.test.ts
src/core/parser/__tests__/yaml.test.ts
src/core/parser/__tests__/action.test.ts
src/core/ingest/__tests__/plaintext.test.ts
src/core/workflow/__tests__/plainTextActor.test.ts
tests/cli-plaintext-actors.test.ts
```

Report format:

```text
Current root cause:
Evidence gathered:
Single narrow next fix:
```

---

## Completion Criteria

- `YamlParser` does not create blank `structuredActions` from legacy object-style action lists.
- Template actions in `templates/npc-example.md` generate concrete actor items, including `啮咬` as a weapon attack.
- Compact legacy action parsing supports melee attack multi-damage and recharge save examples used by the template.
- `PlainTextIngestionWorkflow` still writes intermediate markdown to `middle`.
- `PlainTextActorWorkflow` still promotes generated markdown to `input` and writes actor JSON to `output`.
- Representative Slithering Bloodfin actor JSON is regenerated through the project CLI and manually spot-checked.
- Full `bun test` is either green or only fails on item AI normalizer tests explicitly left out of this NPC/monster plan.

## Self-Review

- Spec coverage: This plan matches the user request to continue only NPC/monster work and specifically covers `YamlParser`, template action parsing, blank `structuredActions`, missing action items, and the existing middle workflow.
- Placeholder scan: No `TBD`, `TODO`, `implement later`, or `fill in details` entries are used as implementation instructions.
- Type consistency: Parser tests use `YamlParser` and `ActionParser`; generator verification uses `ActorGenerator` only through existing tests and project CLI.

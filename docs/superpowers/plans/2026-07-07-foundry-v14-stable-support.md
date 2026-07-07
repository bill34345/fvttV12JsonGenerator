# Foundry V14 Stable Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stable, evidence-backed Foundry VTT v14 support for project-generated Actor and Item JSON without weakening the existing v12 workflow.

**Architecture:** Introduce an explicit target-version layer that maps each supported Foundry target to its dnd5e system version, reference roots, stats metadata, supported effect profiles, and validation rules. Keep parsing source-derived and version-neutral where possible; put schema differences in target adapters and fixture-backed tests.

**Tech Stack:** Bun, TypeScript, Foundry VTT v12/v14, dnd5e 4.3.9 and 5.3.x references, project CLI at `src/index.ts`, Obsidian vault workflow, `docs/generated-actor-verification.md`.

---

## Completion Criteria

- `--fvtt-version 14` is accepted by CLI, crawl pipeline, Web API, Web UI, and workflow APIs.
- v12 output remains unchanged for representative actor and item fixtures.
- v14 output is generated against locked local references for Foundry v14 and dnd5e 5.3.x or a later explicitly chosen v14-compatible dnd5e release.
- Actor and Item `_stats`, reference templates, activity schemas, active effects, flags, and supported effect profiles match the selected v14 target.
- Generated v14 JSON is regenerated only through project CLI/workflows, then semantically checked against source markdown using `docs/generated-actor-verification.md`.
- Final verification separates mechanical checks from real acceptance, including a real Foundry v14 import smoke test or an explicitly documented blocker.

## Current Evidence

- `AGENTS.md` currently locks the default target to Foundry VTT v12 and dnd5e 4.3.9.
- `src/index.ts`, `src/core/workflow/singleFileConversion.ts`, `src/core/workflow/plainTextActor.ts`, `src/core/workflow/obsidianSync.ts`, `src/tools/goddessFantasyPipeline.ts`, and Web types currently allow only `12 | 13`.
- `src/core/generator/actor.ts` writes fallback `_stats.coreVersion = 12.331` and `_stats.systemVersion = 4.3.9`.
- `src/core/generator/activity.ts` and `src/core/generator/item-generator.ts` still contain hard-coded v12/dnd5e 4.x metadata or reference paths.
- `references/` currently contains `dnd5e-4.3.9`, `foundry-v12-api-*`, and indexes, but no v14/dnd5e 5.3.x local reference.
- Official Foundry/dnd5e sources indicate dnd5e 5.3.x is the v14-compatible line; dnd5e 4.3.9 is not verified for Foundry v14.

## File Structure

- Create `src/core/foundryTarget.ts`: target metadata, target parsing, supported target constants, versioned stats helpers, reference path helpers.
- Modify `src/core/workflow/singleFileConversion.ts`: use `FvttTargetVersion` from `foundryTarget.ts`; allow `14`.
- Modify `src/core/workflow/plainTextActor.ts`: allow `14`.
- Modify `src/core/workflow/obsidianSync.ts`: allow `14`; include target metadata in manifest cache keys.
- Modify `src/index.ts`: parse target via shared helper; update help text and errors.
- Modify `src/tools/goddessFantasyPipeline.ts` and `src/tools/crawlSites.ts`: allow `14` and route through shared helper.
- Modify `src/web/client/api.ts`, `src/web/client/App.tsx`, `src/web/server/api.ts`, `src/web/server/jobs/jobRunner.ts`: expose and preserve v14 instead of coercing unknown values to v12.
- Modify `src/core/generator/actor.ts`: replace literal `_stats` fallback with target metadata; pass target into activity/effect generation where schema differs.
- Modify `src/core/generator/activity.ts`: accept target metadata; keep v12 output unchanged; add v14-specific schema transforms only when supported by v14/dnd5e references.
- Modify `src/core/generator/item-generator.ts`: load item templates from target-specific dnd5e reference roots.
- Modify `src/tools/referenceIndex.ts`: index multiple dnd5e reference versions and Foundry API versions.
- Create or modify tests under `src/core/**/__tests__`, `src/tools/__tests__`, and `src/web/server/__tests__` for target parsing, v14 propagation, reference selection, output metadata, and representative generated JSON.
- Modify `AGENTS.md`, `docs/REFERENCE_INDEX.md`, `docs/generated-actor-verification.md`, and `docs/manual.md` after behavior is implemented.

---

### Task 1: Lock V14 Reference Sources

**Files:**
- Create/update: `references/dnd5e-5.3.3/`
- Create/update: `references/foundry-v14-api-core/` or `references/foundry-v14-api-notes/`
- Modify: `docs/REFERENCE_INDEX.md`

- [ ] **Step 1: Choose the exact v14 target**

Use official package evidence to choose the first stable target:

```text
Foundry VTT: v14
dnd5e system: 5.3.3
Effect profile: core initially; module profile deferred until module versions are verified for v14
```

- [ ] **Step 2: Mirror official dnd5e 5.3.3 source**

Run:

```powershell
New-Item -ItemType Directory -Force references\dnd5e-5.3.3 | Out-Null
Invoke-WebRequest -Uri "https://github.com/foundryvtt/dnd5e/archive/refs/tags/release-5.3.3.zip" -OutFile "references\dnd5e-5.3.3\release-5.3.3.zip"
Expand-Archive -Path "references\dnd5e-5.3.3\release-5.3.3.zip" -DestinationPath "references\dnd5e-5.3.3\tmp" -Force
Move-Item -Path "references\dnd5e-5.3.3\tmp\dnd5e-release-5.3.3" -Destination "references\dnd5e-5.3.3\repo"
Invoke-WebRequest -Uri "https://github.com/foundryvtt/dnd5e/releases/download/release-5.3.3/system.json" -OutFile "references\dnd5e-5.3.3\system.json"
```

Expected: `references/dnd5e-5.3.3/repo/system.json` or `references/dnd5e-5.3.3/system.json` confirms compatibility with Foundry 13.351+ and verified 14.

- [ ] **Step 3: Capture Foundry v14 core reference source**

Use the most precise available official source. If a full v14 API mirror is not locally available, save official release/API notes under `references/foundry-v14-api-notes/` and document the gap.

Expected: the reference directory states whether it is full API docs, release notes, or targeted extracts.

- [ ] **Step 4: Update reference documentation**

Add `dnd5e 5.3.3` and Foundry v14 source notes to `docs/REFERENCE_INDEX.md`.

- [ ] **Step 5: Verify reference provenance**

Run:

```powershell
Get-FileHash references\dnd5e-5.3.3\release-5.3.3.zip
Get-Content references\dnd5e-5.3.3\repo\system.json -TotalCount 40
```

Expected: hashes are recorded in notes or commit message; system version and compatibility are visible.

---

### Task 2: Introduce Shared Target Metadata

**Files:**
- Create: `src/core/foundryTarget.ts`
- Test: `src/core/__tests__/foundryTarget.test.ts`
- Modify: `src/core/workflow/singleFileConversion.ts`

- [ ] **Step 1: Write failing target metadata tests**

Test:

```ts
import { describe, expect, it } from 'bun:test';
import { parseFvttTargetVersion, getFoundryTarget } from '../foundryTarget';

describe('foundryTarget', () => {
  it('accepts v12, v13, and v14 targets', () => {
    expect(parseFvttTargetVersion('12')).toBe('12');
    expect(parseFvttTargetVersion('13')).toBe('13');
    expect(parseFvttTargetVersion('14')).toBe('14');
  });

  it('describes v14 as dnd5e 5.3.3 with v14 stats defaults', () => {
    const target = getFoundryTarget('14');
    expect(target.dnd5eVersion).toBe('5.3.3');
    expect(target.stats.systemVersion).toBe('5.3.3');
    expect(target.reference.dnd5eRepo).toContain('references/dnd5e-5.3.3/repo');
  });

  it('rejects unsupported targets explicitly', () => {
    expect(() => parseFvttTargetVersion('15')).toThrow('Unsupported Foundry target');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
bun test src/core/__tests__/foundryTarget.test.ts
```

Expected: FAIL because `foundryTarget.ts` does not exist.

- [ ] **Step 3: Implement target metadata**

Create `src/core/foundryTarget.ts` with:

```ts
export type FvttTargetVersion = '12' | '13' | '14';

export interface FoundryTarget {
  fvttVersion: FvttTargetVersion;
  dnd5eVersion: string;
  stats: {
    coreVersion: string;
    systemId: 'dnd5e';
    systemVersion: string;
  };
  reference: {
    dnd5eRepo: string;
  };
  effectProfiles: readonly string[];
}
```

Use `4.3.9` for existing v12/v13 behavior and `5.3.3` for v14.

- [ ] **Step 4: Run the target tests**

Run:

```powershell
bun test src/core/__tests__/foundryTarget.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/foundryTarget.ts src/core/__tests__/foundryTarget.test.ts
git commit -m "feat: add Foundry target metadata"
```

---

### Task 3: Propagate V14 Through CLI, Workflows, and Web

**Files:**
- Modify: `src/index.ts`
- Modify: `src/core/workflow/singleFileConversion.ts`
- Modify: `src/core/workflow/plainTextActor.ts`
- Modify: `src/core/workflow/obsidianSync.ts`
- Modify: `src/tools/goddessFantasyPipeline.ts`
- Modify: `src/tools/crawlSites.ts`
- Modify: `src/web/client/api.ts`
- Modify: `src/web/client/App.tsx`
- Modify: `src/web/server/api.ts`
- Modify: `src/web/server/jobs/jobRunner.ts`
- Test: related existing workflow/Web tests

- [ ] **Step 1: Add failing CLI/API tests for v14**

Update existing tests to expect:

```ts
expect(normalizeFvttVersion('14')).toBe('14');
expect(optionFvttVersion({ fvttVersion: '14' })).toBe('14');
```

Add CLI test coverage if current test structure supports it; otherwise cover parser helpers directly.

- [ ] **Step 2: Run targeted failing tests**

Run:

```powershell
bun test src/web/server/__tests__/api.test.ts src/tools/__tests__/goddessFantasyPipeline.test.ts
```

Expected: FAIL where v14 is rejected or coerced to v12.

- [ ] **Step 3: Replace local union types with shared `FvttTargetVersion`**

Import from `src/core/foundryTarget.ts` and remove duplicated `'12' | '13'` definitions.

- [ ] **Step 4: Update visible UX**

Add `<option value="14">v14</option>` in `src/web/client/App.tsx`.

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
bun test src/web/server/__tests__/api.test.ts src/tools/__tests__/goddessFantasyPipeline.test.ts src/core/workflow/__tests__/plainTextActor.test.ts
```

Expected: PASS with v14 flowing through all entrypoints.

- [ ] **Step 6: Commit**

```powershell
git add src/index.ts src/core/workflow src/tools src/web
git commit -m "feat: propagate Foundry v14 target"
```

---

### Task 4: Make Generator Output Target-Aware

**Files:**
- Modify: `src/core/generator/actor.ts`
- Modify: `src/core/generator/activity.ts`
- Modify: `src/core/generator/item-generator.ts`
- Test: `src/core/generator/__tests__/actor_bilingual_integration.test.ts`
- Test: `src/core/generator/__tests__/item-generator.test.ts`
- Test: add `src/core/generator/__tests__/foundryTargetOutput.test.ts`

- [ ] **Step 1: Write failing v14 metadata tests**

Add tests that generate a small NPC and item with `fvttVersion: '14'` and assert:

```ts
expect(actor._stats.coreVersion).toMatch(/^14\./);
expect(actor._stats.systemVersion).toBe('5.3.3');
expect(item._stats?.systemVersion).toBe('5.3.3');
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
bun test src/core/generator/__tests__/foundryTargetOutput.test.ts
```

Expected: FAIL because generator still writes v12/dnd5e 4.x defaults.

- [ ] **Step 3: Inject target metadata into `ActorGenerator`**

Use `getFoundryTarget(this.fvttVersion)` inside constructor or generation methods. Replace literal `_stats` values with target stats.

- [ ] **Step 4: Inject target metadata into `ActivityGenerator`**

Add constructor options:

```ts
interface ActivityGeneratorOptions {
  target?: FoundryTarget;
}
```

Keep default target v12. Replace passive-effect `_stats` literals with target stats.

- [ ] **Step 5: Make `ItemGenerator` use target reference roots**

Replace the `REFERENCES_PATH` constant with a target-aware path from `FoundryTarget.reference.dnd5eRepo`.

- [ ] **Step 6: Run generator tests**

Run:

```powershell
bun test src/core/generator/__tests__/foundryTargetOutput.test.ts src/core/generator/__tests__/actor_bilingual_integration.test.ts src/core/generator/__tests__/item-generator.test.ts
```

Expected: PASS; existing v12 expectations remain unchanged.

- [ ] **Step 7: Commit**

```powershell
git add src/core/generator
git commit -m "feat: make generator output target-aware"
```

---

### Task 5: Validate V14 Schema Differences Before Claiming Support

**Files:**
- Create: `src/core/generator/__tests__/v14-schema-regression.test.ts`
- Modify: `src/tools/actorVerification.ts`
- Modify: `docs/generated-actor-verification.md`

- [ ] **Step 1: Compare generated v14 JSON against dnd5e 5.3.3 templates**

Use reference files under `references/dnd5e-5.3.3/repo/packs/_source` and document differences for:

```text
Actor npc core fields
weapon item fields
feat item fields
activity attack/save/utility/cast fields
ActiveEffect fields
prototypeToken fields
```

- [ ] **Step 2: Write schema regression tests**

Tests should load representative generated JSON and assert required v14 fields exist, deprecated v12-only fields are absent only when references prove they are invalid, and source mechanics are preserved.

- [ ] **Step 3: Run regression tests**

Run:

```powershell
bun test src/core/generator/__tests__/v14-schema-regression.test.ts
```

Expected: FAIL until adapter changes are made.

- [ ] **Step 4: Implement minimal target adapters**

Only add transforms classified as `schema-derived` from dnd5e 5.3.3 or Foundry v14 references. Do not infer mechanics from item/action names.

- [ ] **Step 5: Run anti-overfit audit**

Run:

```powershell
bun run audit:anti-overfit
```

Expected: PASS or only documented valid exceptions.

- [ ] **Step 6: Commit**

```powershell
git add src/core/generator src/tools/actorVerification.ts docs/generated-actor-verification.md
git commit -m "feat: validate v14 output schema"
```

---

### Task 6: Add End-To-End V14 Generation Acceptance

**Files:**
- Test: `tests/acceptance/*.test.ts` or nearest existing acceptance test location
- Output: `obsidian/dnd数据转fvttjson/output/*.json`
- Docs: `docs/acceptance/v14-*.md`

- [ ] **Step 1: Pick representative source markdown**

Use at least:

```text
one simple attack-only NPC
one save/effect NPC
one legendary/reaction/bonus-action NPC
one item source if item generation is in scope
```

- [ ] **Step 2: Regenerate through CLI**

Run:

```powershell
bun run src/index.ts "obsidian/dnd数据转fvttjson/input/<source>.md" -o "obsidian/dnd数据转fvttjson/output/<source>.v14.json" --fvtt-version 14 --effect-profile core
```

Expected: JSON is written by project CLI, not manually edited.

- [ ] **Step 3: Run actor verification**

Run:

```powershell
bun run src/tools/actorVerification.ts --source "obsidian/dnd数据转fvttjson/input/<source>.md" --actor "obsidian/dnd数据转fvttjson/output/<source>.v14.json"
```

Expected: verification summary matches source identity, stats, traits, actions, saves, and descriptions.

- [ ] **Step 4: Manual semantic review**

Read the source markdown and generated JSON. Fill out `docs/generated-actor-verification.md` checks in `docs/acceptance/v14-<fixture>.md`.

- [ ] **Step 5: Real Foundry v14 import smoke test**

In a backed-up or throwaway Foundry v14 world with dnd5e 5.3.3:

```text
Import generated actor JSON
Open NPC sheet
Open each generated item
Click at least one attack activity
Click at least one save/effect activity where present
Confirm no console/schema errors
Confirm values shown on sheet match source markdown
```

Expected: no import/sheet/activity errors; semantic values match source.

- [ ] **Step 6: Commit acceptance artifacts**

```powershell
git add tests docs/acceptance obsidian/dnd数据转fvttjson/output
git commit -m "test: add v14 generation acceptance"
```

---

### Task 7: Update Project Policy and User Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/manual.md`
- Modify: `docs/REFERENCE_INDEX.md`
- Modify: `docs/generated-actor-verification.md`

- [ ] **Step 1: Update target runtime policy**

Document supported targets separately:

```text
Legacy stable: Foundry VTT v12 + dnd5e 4.3.9
Current stable: Foundry VTT v14 + dnd5e 5.3.3
```

Do not delete v12 rules unless the user explicitly retires v12 support.

- [ ] **Step 2: Document effect profile limits**

If module-integrated v14 behavior has not been checked against MIDI-QOL/DAE/Times Up/Item Macro v14-compatible versions, mark `modded-v12` as v12-only and keep v14 default `core`.

- [ ] **Step 3: Update CLI examples**

Add:

```powershell
bun run src/index.ts "obsidian/dnd数据转fvttjson/input/example.md" -o "obsidian/dnd数据转fvttjson/output/example.v14.json" --fvtt-version 14 --effect-profile core
```

- [ ] **Step 4: Commit docs**

```powershell
git add AGENTS.md docs
git commit -m "docs: document Foundry v14 support"
```

---

### Task 8: Full Verification

**Files:**
- No new files unless failures require fixes.

- [ ] **Step 1: Run targeted tests**

Run:

```powershell
bun test src/core/__tests__/foundryTarget.test.ts src/core/generator/__tests__/foundryTargetOutput.test.ts src/core/generator/__tests__/v14-schema-regression.test.ts src/web/server/__tests__/api.test.ts src/tools/__tests__/goddessFantasyPipeline.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```powershell
bun test
```

Expected: PASS or known unrelated baseline failures documented with exact failure text.

- [ ] **Step 3: Run anti-overfit audit**

Run:

```powershell
bun run audit:anti-overfit
```

Expected: PASS.

- [ ] **Step 4: Run v12 regression generation**

Regenerate one v12 fixture and compare against the previous accepted structure using `assertEqualStructure()` or the stricter existing equivalent.

Expected: v12 structure is unchanged except explicitly documented metadata timestamps.

- [ ] **Step 5: Run v14 CLI generation and semantic verification**

Run the v14 acceptance source through CLI and `verify:actor`.

Expected: mechanical checks pass and manual semantic review confirms source fidelity.

- [ ] **Step 6: Record real Foundry v14 result**

Document the import smoke test outcome in `docs/acceptance/v14-*.md`.

Expected: stable support is only claimed if real import/sheet/activity behavior passes.

---

## Risk Register

- dnd5e 5.3.x may migrate v12-like fields silently during import; relying on this is not stable support. Prefer v14-native fields where references prove the schema.
- Module automation is a separate support target. `modded-v12` must not be renamed or treated as v14-compatible without versioned module evidence.
- Item template paths can differ between dnd5e 4.3.9 and 5.3.3. Template lookup must fail loudly in tests when a requested target reference is missing.
- A JSON parse success or no CLI error is mechanical validation only. Real acceptance requires source-to-output semantic review and v14 import behavior.

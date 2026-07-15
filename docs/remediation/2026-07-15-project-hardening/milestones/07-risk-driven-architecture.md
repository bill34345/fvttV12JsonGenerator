# Milestone 7 Risk-Driven Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents because the active project instructions do not authorize delegation.

**Goal:** Reduce `ActorGenerator` change coupling by extracting two already-characterized responsibilities—English localization and target-version document normalization—without changing generated v12/v14 Actor semantics.

**Architecture:** `ActorGenerator` remains the orchestration boundary. A stateful `ActorLocalizer` owns optional translation/local fallback and receives only translation service plus parser route; pure target-version helpers own recursive `_stats`/uses normalization and receive the explicit Foundry target. Each extraction is completed and verified independently before the next begins.

**Tech Stack:** TypeScript 5.9, Bun 1.3.8 tests, Foundry VTT v12/v14 target metadata, dnd5e 4.3.9/5.3.3, repository `assertEqualStructure()` normalization.

## Global Constraints

- Current dirty workspace is the source of truth; preserve `.ruler/AGENTS.md`, root `AGENTS.md`, and `docs/baileywiki-mass-edit-guide.zh-CN.md` as unrelated user-owned state.
- Refactoring may move behavior but may not add SEM-005 Item features, change parser inference, or alter Actor JSON values.
- Structural checks must cover both Foundry v12/dnd5e 4.3.9 and Foundry v14/dnd5e 5.3.3.
- Keep ordinary Actor generation offline; ambient credentials must not create a translation service.
- Run `bun run audit:anti-overfit` after production source movement and the full aggregate gate before closing ARCH-001.
- Generated acceptance artifacts remain workflow outputs under the ignored vault output tree; do not hand-edit Actor JSON.

---

## Selection evidence

| Candidate | Lines | Methods/functions | Recent path commits | Decision |
|---|---:|---:|---:|---|
| `src/core/generator/actor.ts` | 3,514 | 157 private methods | 22 | Select: highest measured change coupling and already has characterization suites. |
| `src/core/parser/item-parser.ts` | 1,424 | 42 private methods | 2 | Defer: SEM-005 requires feature changes; mixing them with refactor would obscure acceptance. |
| `src/core/ingest/plaintext.ts` | 1,286 | 5 class methods plus 31 helpers | 6 | Defer: responsibilities are broad but less coupled than Actor generation. |
| `src/web/client/App.tsx` | 831 | one stateful component plus presentation helpers | 3 | Defer until the Web security milestone stabilizes deployment behavior. |

The first extraction owns lines 3130-3322 of `actor.ts`; the second owns lines 3447-3498 plus the target-specific `normalizeUses()` call at line 1233. They do not overlap semantic mechanics extraction.

### Task 1: Extract English Actor localization

**Files:**

- Create: `src/core/generator/actor-localizer.ts`
- Create: `src/core/generator/__tests__/actor-localizer.test.ts`
- Modify: `src/core/generator/actor.ts`
- Verify: `src/core/generator/__tests__/actor_bilingual_integration.test.ts`

**Interfaces:**

- Produces:

```ts
export interface TranslationServiceLike {
  translate(text: string, context?: TranslationContext): Promise<{ text: string } | string>;
}

export interface ActorLocalizerOptions {
  translationService?: TranslationServiceLike;
  route: ParserRoute;
}

export class ActorLocalizer {
  constructor(options: ActorLocalizerOptions);
  localize(actor: any): Promise<any>;
}
```

- `ActorGeneratorOptions.translationService` continues using the exported `TranslationServiceLike` type.
- `ActorGenerator.generateForRoute()` calls `new ActorLocalizer({ translationService, route }).localize(actor)` only for the English route, preserving the current call boundary.

- [ ] **Step 1: Write characterization tests before moving implementation**

Create three tests: local fallback makes the Actor name bilingual while keeping imported English item names source-faithful; an injected service localizes Actor/item names and descriptions with the same namespaces; a thrown provider call preserves source text. Use a minimal imported item with `system.source.custom = 'Imported'` and assert the exact Actor projection with `assertEqualStructure()`.

- [ ] **Step 2: Run the focused tests and confirm the new module is missing**

Run:

```powershell
bun test src/core/generator/__tests__/actor-localizer.test.ts --max-concurrency 4
```

Expected: fail because `../actor-localizer` does not exist.

- [ ] **Step 3: Move localization behavior without changing it**

Move `LOCAL_NAME_TRANSLATIONS`, `LOCAL_DESCRIPTION_REPLACEMENTS`, `SPELLCASTING_TERM_REPLACEMENTS`, and the methods from `localizeEnglishActor()` through `extractDescriptionLines()` into `ActorLocalizer`. Keep the exact provider failure fallback, bilingual formatting, `Imported` item boundary, spellcasting list handling, and route-specific English item-name behavior.

- [ ] **Step 4: Replace ActorGenerator's local methods with the narrow collaborator**

Import `ActorLocalizer` and `TranslationServiceLike`; remove the moved constants/methods and the now-unused `TranslationContext` import. Do not move skill/passive calculation or any generation mechanics.

- [ ] **Step 5: Verify focused and existing behavioral suites**

Run:

```powershell
bun test src/core/generator/__tests__/actor-localizer.test.ts src/core/generator/__tests__/actor_bilingual_integration.test.ts src/core/translation/__tests__/service.test.ts --max-concurrency 4
bun run typecheck:production
bun run typecheck:all
```

Expected: all tests pass and both typechecks report zero diagnostics.

- [ ] **Step 6: Review the extraction diff**

Confirm `actor.ts` contains orchestration only for localization, the new module has no Foundry mechanics inference, and no Item/parser files changed in this task.

### Task 2: Extract target-version document metadata normalization

**Files:**

- Create: `src/core/generator/actor-target-metadata.ts`
- Create: `src/core/generator/__tests__/actor-target-metadata.test.ts`
- Modify: `src/core/generator/actor.ts`
- Verify: `src/core/generator/__tests__/foundry-v14-target.test.ts`

**Interfaces:**

- Produces:

```ts
export function normalizeTargetUses(
  uses: Record<string, unknown>,
  fvttVersion: FvttTargetVersion,
): Record<string, unknown>;

export function applyActorTargetMetadata(
  actor: any,
  fvttVersion: FvttTargetVersion,
): void;
```

- `normalizeTargetUses()` returns the same object for v12/v13; for v14 it clones, removes legacy `value`/`per`, and converts numeric `max` to a string.
- `applyActorTargetMetadata()` stamps Actor, Item, and Active Effect `_stats`; removes legacy Item activation only for v14; and normalizes Item/Activity uses.

- [ ] **Step 1: Write v12/v14 structural characterization tests**

Use one minimal Actor containing Actor effects, one Item effect, legacy Item activation/uses, and Activity uses. Assert v12 retains legacy fields while both targets receive exact locked target stats; assert v14 removes only the known legacy fields, stringifies numeric max, and leaves unrelated fields unchanged. Use `assertEqualStructure()` for the unrelated projection.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
bun test src/core/generator/__tests__/actor-target-metadata.test.ts --max-concurrency 4
```

Expected: fail because the target metadata module does not exist.

- [ ] **Step 3: Implement the pure target helpers**

Move the current recursive logic exactly, obtain stats through `getFoundryTarget(fvttVersion).stats`, and keep null/non-object guards. Do not add schema repair beyond the existing normalization contract.

- [ ] **Step 4: Rewire ActorGenerator**

Replace `applyTargetDocumentMetadata(actor)` with `applyActorTargetMetadata(actor, this.fvttVersion)` and replace `this.normalizeUses(uses)` in `createDailyUses()` with `normalizeTargetUses(uses, this.fvttVersion)`. Remove only the private methods made unused; retain `targetStats()` because reset/default/effect construction still consumes it.

- [ ] **Step 5: Verify target and semantic regressions**

Run:

```powershell
bun test src/core/generator/__tests__/actor-target-metadata.test.ts src/core/generator/__tests__/foundry-v14-target.test.ts src/core/generator/__tests__/actor.test.ts --max-concurrency 4
bun run typecheck:production
bun run typecheck:all
bun run audit:anti-overfit
```

Expected: all tests and typechecks pass; the audit reports a nonzero changed-source count and no findings.

- [ ] **Step 6: Regenerate structural controls through the CLI**

Generate one unchanged real Actor for v12 and v14 core under `obsidian/dnd数据转fvttjson/output/remediation-m7/`, then compare normalized outputs against pre-extraction controls using `assertEqualStructure()` with only volatile IDs/timestamps ignored. Inspect names, activities, effects, target metadata, and uses rather than relying on JSON parse success.

### Task 3: Close architecture acceptance

**Files:**

- Modify: `docs/remediation/2026-07-15-project-hardening/EXECPLAN.md`
- Modify: this plan

- [ ] **Step 1: Record objective metrics**

Record final `actor.ts` line/method counts, new module sizes, test counts, and diff scope. The acceptance claim is responsibility separation plus stable output, not a line-count target.

- [ ] **Step 2: Run the aggregate gate**

Run:

```powershell
bun run ci:verify
git diff --check
```

Expected: production/broad typechecks zero; all tests/coverage pass; 99-source audit, hygiene, locked reference verification, Web build, and offline smoke pass; no whitespace errors.

- [ ] **Step 3: Perform semantic acceptance**

Read the normalized v12/v14 Actor controls and confirm identity, stats, items, Activity fields, effects, flags, and uses are unchanged. Confirm ordinary generation remains zero-network and provider failure fallback remains source-faithful.

- [ ] **Step 4: Update the authoritative ledger**

Close ARCH-001 only if both extractions and the semantic comparison pass. Record any newly discovered behavior as a separate finding rather than changing it inside this refactor.

## Self-review

- Spec coverage: selection evidence, cohesive extraction boundaries, RED/GREEN characterization, v12/v14 structural comparison, anti-overfit, aggregate verification, and semantic acceptance are all assigned.
- Placeholder scan: no TBD/TODO or unspecified implementation step remains.
- Type consistency: `TranslationServiceLike`, `ActorLocalizerOptions`, `normalizeTargetUses()`, and `applyActorTargetMetadata()` have one definition and matching consumers.

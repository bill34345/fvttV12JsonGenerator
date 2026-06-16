# Compound Rider & Hit Dice Robustness Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` recommended, or `superpowers:executing-plans`, to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove creature-specific compound rider mechanics inference and make hit-dice outcomes source-derived across similar markdown inputs.

**Architecture:** Segment compound riders from markdown/list structure, then parse mechanics from each segment's source text. Preserve legacy metadata for one release by deriving it from the typed outcome IR.

**Tech Stack:** Bun, TypeScript, Foundry VTT v12 / dnd5e 4.3.9, existing actor generator, existing anti-overfit audit.

---

### Task 1: 通用 compound rider segmentation

- [x] Add failing tests for generic bold bullet rider segmentation, non-Scuttling Chinese compound riders, and no production `RIDER_MARKERS`.
- [x] Replace hardcoded rider markers with generic markdown/list header segmentation.
- [x] Remove obsolete Scuttling-specific helpers from `actor.ts`.

### Task 2: 移除 `riderKey` 机制分支

- [x] Add failing tests for non-Needling extra damage die and Bleeding-only negative coverage.
- [x] Parse extra damage die from source text and base damage only.

### Task 3: Hit dice outcome IR 泛化

- [x] Add failing tests for `hitDiceChange` loss/gain, source-derived temp HP targets, conditional temp HP, and name-only negatives.
- [x] Replace primary hit-dice outcome shape with `hitDiceChange`; keep legacy loose flags derived from IR.

### Task 4: Macro compiler 安全路径收紧

- [x] Confirm local references for dnd5e hit dice storage; fallback when not confirmed.
- [x] Update macro spec/compiler tests and implementation to consume `hitDiceChange`.

### Task 5: Anti-overfit audit 加固

- [x] Add tests for named rider marker tables and mechanics key branches.
- [x] Implement audit rules so changed and all-production audits catch this pattern.

### Task 6: Real output verification

- [x] Regenerate Scuttling Serpentmaw via CLI.
- [x] Run `verify:actor`, targeted tests, and anti-overfit audits.
- [ ] Run full `bun test` with no failures.
- [x] Run full `bun test` and record current result: 391 pass, 2 existing `ItemGenerator Golden Master Verification` failures.
- [x] Verify generated Scuttling JSON has 3 rider saves, `hitDiceChange lose unspent 1`, source-derived temp HP 10, manual follow-up save, no generated `riderKey`, no dedicated names in macro/spec, and no macro HD storage write path.
- [x] Verify production `src/core/generator` and `src/core/mechanics` have no `RIDER_MARKERS`, `riderKey`, or Brine/Needling/Vampiric mechanics branches.

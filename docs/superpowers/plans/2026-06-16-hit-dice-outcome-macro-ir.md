# Hit Dice Outcome Macro IR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` recommended, or `superpowers:executing-plans`, to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Treat hit-dice-related outcomes as source-derived mechanics that can generate visible activities, safe metadata, and soft-intrusive macros in actor JSON without creature-specific branches.

**Architecture:** Extend the mechanics extraction layer with typed outcome IR, then compile that IR into activities and guarded macro data. Names may locate rider segments, but hit dice loss, temp HP, follow-up saves, and triggers must come from source text or structured input evidence.

**Tech Stack:** Bun, TypeScript, Foundry VTT v12 / dnd5e 4.3.9, existing `ActivityGenerator`, existing `macroData.command` / `midiProperties` pattern, optional midi-qol / Item Macro runtime.

---

### Task 1: Typed Hit Dice Outcome IR

**Files:**
- Modify: `src/core/mechanics/mechanicsExtraction.ts`
- Test: `src/core/mechanics/__tests__/mechanicsExtraction.test.ts`

- [x] Add failing tests for hit-dice loss, temp HP, follow-up save trigger, a non-Scuttling hit-dice source, and name-only negative coverage.
- [x] Add `outcomes[]` with `hitDieLoss`, `tempHp`, and `followupSave` entries.
- [x] Preserve transitional metadata fields for existing callers.

### Task 2: Macro Spec Compiler

**Files:**
- Create: `src/core/generator/hitDiceOutcomeAutomation.ts`
- Test: `src/core/generator/__tests__/hitDiceOutcomeAutomation.test.ts`

- [x] Build serializable hit-dice outcome specs from extracted outcomes and generated activity ids.
- [x] Generate guarded macro code that checks midi/workflow/target and falls back to GM guidance when safe HD data is unavailable.
- [x] Keep code deterministic and spec-driven; no creature/action-name checks.

### Task 3: Actor Activity Generation

**Files:**
- Modify: `src/core/generator/actor.ts`
- Test: `tests/acceptance/scuttling-serpentmaw.acceptance.test.ts`
- Test: `tests/acceptance/generic-riders.acceptance.test.ts`

- [x] Generate `Lose Hit Die` utility, `Gain Temporary HP` heal, and conditional follow-up save/utility activities from outcome IR.
- [x] Attach activity-level `midiProperties`, `macroData`, and source evidence using existing project conventions.
- [x] Store the serializable spec under `flags.fvttJsonGenerator.hitDiceOutcome`.

### Task 4: Verification

- [x] Run targeted tests.
- [x] Run anti-overfit audits.
- [x] Regenerate real Scuttling Serpentmaw output through CLI.
- [x] Run `verify:actor` and inspect the generated Venomous Bite JSON.
- [ ] Run full `bun test` with no failures. Current run still fails in the pre-existing item-generator golden master weapon/consumable type expectations.

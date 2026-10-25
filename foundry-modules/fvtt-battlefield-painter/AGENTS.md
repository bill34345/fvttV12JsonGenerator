# Battlefield Painter Module Notes

## Scope

- This directory owns the standalone `fvtt-battlefield-painter` Foundry VTT module.
- The accepted P0 baseline is fire, frost, and brambles. Add subsequent effects one at a time within the user's selected scope; do not expand the whole catalog implicitly.
- Browser runtime code must remain Foundry-core-only and must not import Node, Bun, Windows, repository tooling, or dnd5e internals.
- Generated scene documents must be identifiable and reversible through module-owned flags.

## Entrypoints

- `src/main.ts` registers Foundry hooks and the module API.
- `src/painter-controller.ts` owns pointer interaction and scene mutations.
- `src/catalog.ts` is the authoritative terrain catalog.
- `src/geometry.ts` and `src/scene-plan.ts` are pure, testable behavior boundaries.
- `scripts/build.ts` creates the distributable folder and ZIP.

## Acceptance

- For adding or revising one terrain effect, use the project [Battlefield effect workflow](../../.agents/skills/battlefield-effect-workflow/SKILL.md). The user requested agent self-review on 2026-09-09; routine art approval is no longer a mandatory pause. Actual visual and runtime evidence remains required.
- For a continuation, read [the current handoff](docs/CONTINUATION.md) and verify its workspace/runtime snapshot before acting. It does not grant publication or production authority.

- During implementation, select the affected tests through the repository's safe package entrypoint. Run this module's `bun run test:coverage`, `bun run typecheck`, and `bun run build` at its integration boundary; preserve sufficient results until relevant inputs change. Helper/report fixes do not trigger the whole terrain/grid/player matrix.
- Static checks do not establish Foundry runtime compatibility.
- Exact 14.368/6.0.6 has scoped one-cell Fire I transaction, movement-cost Region/linked falling, reload, non-GM denial and owned-cleanup acceptance. Linked falling uses Actor flag `dnd5e.lastMovedToken`; other effects/grid combinations, long sessions and production remain unaccepted.
- The original target is Foundry `14.364` / dnd5e `5.3.3`. A 2026-09-24 real-canvas square Fire stroke, movement-cost Region, light, visual reload, and task-owned cleanup passed on the historical ServerNext pair `14.368` / `6.0.2`. On 2026-10-01 exact pair `14.368` / `6.0.5` independently passed the existing two-cell Square Fire I visible-animation/Region/light slice and normal GM reload after row/column and media-start fixes; exact task-owned cleanup is reported separately in the restoration review.
- Hex-grid painting, other terrain/stages, module Undo/Redo, mature bramble walls, player permissions, and exact Region collection persistence still require separate real-canvas verification before being reported as accepted. Native UI deletion in the Fire test is not module Undo.

## Mirror Core patch continuation (2026-10-03)

The user authorized Mirror Foundry `14.368` with dnd5e `5.3.3`. Runtime gates now include this exact pair while preserving the previous supported pairs; this does not accept other Core/system combinations. Record actual new-Core behavior separately from legacy tests and historical Next evidence. Current maintenance and acceptance: [Mirror patch review](../../docs/reviews/2026-10-03-foundry-14-365-mirror-upgrade-and-tile-arsenal.md). The new pair overrides older exact-364-only wording for this scoped continuation; existing authority and data protections remain applicable.

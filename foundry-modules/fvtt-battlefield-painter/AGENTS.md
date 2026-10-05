# Battlefield Painter Module Notes

## Scope

- This directory owns the standalone `fvtt-battlefield-painter` Foundry VTT module.
- P0 is limited to three original terrain configurations: fire, frost, and brambles.
- Browser runtime code must remain Foundry-core-only and must not import Node, Bun, Windows, repository tooling, or dnd5e internals.
- Generated scene documents must be identifiable and reversible through module-owned flags.

## Entrypoints

- `src/main.ts` registers Foundry hooks and the module API.
- `src/painter-controller.ts` owns pointer interaction and scene mutations.
- `src/catalog.ts` is the authoritative terrain catalog.
- `src/geometry.ts` and `src/scene-plan.ts` are pure, testable behavior boundaries.
- `scripts/build.ts` creates the distributable folder and ZIP.

## Acceptance

- During implementation, select the affected tests through the repository's safe package entrypoint. Run this module's `bun run test:coverage`, `bun run typecheck`, and `bun run build` at its integration boundary; preserve sufficient results until relevant inputs change. Helper/report fixes do not trigger the whole terrain/grid/player matrix.
- Static checks do not establish Foundry runtime compatibility.
- The original target is Foundry `14.364` / dnd5e `5.3.3`. A 2026-09-24 real-canvas square Fire stroke, movement-cost Region, light, visual reload, and task-owned cleanup passed on the historical ServerNext pair `14.368` / `6.0.2`. On 2026-10-01 exact pair `14.368` / `6.0.5` independently passed the existing two-cell Square Fire I visible-animation/Region/light slice and normal GM reload after row/column and media-start fixes; exact task-owned cleanup is reported separately in the restoration review.
- Hex-grid painting, other terrain/stages, module Undo/Redo, mature bramble walls, player permissions, and exact Region collection persistence still require separate real-canvas verification before being reported as accepted. Native UI deletion in the Fire test is not module Undo.

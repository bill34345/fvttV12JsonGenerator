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

- Run `bun run test:coverage`, `bun run typecheck`, and `bun run build` from this directory.
- Static checks do not establish Foundry runtime compatibility.
- Runtime acceptance must use exact Foundry `14.364`; the repository default system target is dnd5e `5.3.3`.
- Square-grid and hex-grid painting, stage changes, erase/rollback, movement-cost Regions, fire light, and bramble walls require real-canvas verification before being reported as accepted.


# P0/P1 Architecture and Decisions

## Document bundle

One drag stroke is one logical bundle. `src/scene-plan.ts` converts the sampled grid cells into a declarative plan:

- one Tile per occupied cell;
- one Region containing one polygon shape per cell;
- zero or one AmbientLight for a fire bundle;
- exterior Walls only for stage-II brambles.

Each source is tagged under `flags.fvtt-battlefield-painter` with a `bundleId`, terrain ID, stage, role, and—on Tiles—the grid cell key and `{i,j}` offset. The offset is intentionally stored instead of pixel geometry so a bundle can be reconstructed through Foundry's current grid API.

P0 creation order is Tile → Region → AmbientLight → Wall; P2 inserts AmbientSound before Wall. If a later document fails validation, already-created documents are deleted in reverse order. Erase and stage-switch operations snapshot the owned Tile offsets, delete the full bundle, recreate the replacement, and restore the original if replacement fails.

## Grid handling

`src/grid-adapter.ts` is the only grid boundary. It calls core `getOffset`, `getCenterPoint`, and `getVertices`. Tiles use the core center for v14 `x/y` plus the resulting vertex bounds for width/height; Regions use the exact vertex polygon. Bramble Walls are derived by canonicalizing every polygon edge and removing edges shared by two adjacent cells. This allows the same pure geometry path to handle square and hex grids.

## Movement behavior

The P0 does not hard-code a guessed v14 `modifyMovementCost.system` shape. `src/movement.ts` reads `CONFIG.RegionBehavior.dataModels.modifyMovementCost` and `CONFIG.Token.movement.actions` at runtime, excludes actions whose difficulty is derived by core, validates the system data with the live DataModel, and fails closed if core does not expose the expected contract.

This is deliberately conservative: a missing Region contract prevents the stroke rather than silently painting a Tile that has no promised tactical effect.

## UI

The tool panel is a Foundry v14 `ApplicationV2` using `HandlebarsApplicationMixin`. The visual direction is a compact tactical material tray rather than a generic settings form: three illustrated terrain cards, two stage selectors, three explicit modes, and one activation control. Reduced-motion preferences disable any future transition.

Pointer events are attached only while the GM activates the painter and are removed when deactivated or when the canvas tears down. A stroke is committed only on pointer release, limiting document churn during drag.

## P1 brush geometry and preview

`src/brush-engine.ts` keeps geometry independent from document mutation. Free brush samples the current cell, line delegates rasterization to core `getDirectPath`, and fill covers the inclusive offset rectangle between the drag endpoints. Radius 0–4 expands seed cells through core `getAdjacentOffsets`, so square and hex adjacency remain a Foundry responsibility.

`src/preview-renderer.ts` draws normalized cell polygons with the v14-shaped PIXI Graphics API. The renderer is created only after an active canvas is available, destroyed on deactivation/canvas teardown, and fails closed when the required graphics or interface layer is absent.

## P1 history and development phases

`src/scene-history.ts` snapshots only documents carrying valid Battlefield Painter ownership flags. Each successful mutation records before/after sources; undo and redo delete only current owned bundles and recreate the selected snapshot, preserving foreign Scene documents. History is per active Scene, bounded to 20 entries, and clears redo after a new mutation.

The internal P0/P1/P2 phase gate defaults to mutable only for this alpha. Disabling P1 forces free shape/radius 0 and hides P1 UI; disabling P2 selects static media and hides clear UI; disabling P0 requires both P1 and P2 to be off and prevents activation. A release must set `DEVELOPMENT_PHASE_CONTROLS_MUTABLE` to `false`, which also removes the mutation switch from the module API.

## Known P0 trade-offs

- Stage change acts on a complete original stroke bundle even if only one cell is targeted.
- Overlap with another Battlefield Painter Tile is skipped; foreign Tiles are ignored.
- One Region polygon per painted cell is simple and robust but may need batching/union optimization for very large maps.
- P0 fallback uses one fire light for the stroke bounding center; P2 uses deterministic clusters for long irregular strokes.
- Static WebP remains the P0/P2-off fallback; P2 adds transparent WebM loops without changing the thumbnail path.

## P2 addendum

P2 extends the same bundle contract with `AmbientSound`. When P2 is enabled, cells are sorted and grouped by Foundry adjacency into deterministic clusters of at most 16 cells. Fire receives one light per cluster and every terrain receives one wall-attenuated ambience source per cluster. P2 selects the generated transparent WebM texture; disabling P2 selects the original WebP and creates no sound documents.

The scene document order is now Tile, Region, AmbientLight, AmbientSound, Wall. Ownership flags, transaction rollback, history snapshots, audit counts, erase, stage changes, clear, undo, and redo all include AmbientSound. The clear preview counts only valid module-owned documents and rejects a stale document-ID fingerprint before mutation. A controller mutation queue serializes paint, clear, undo, and redo.

The P0/P1/P2 gate is alpha-only. P1 and P2 can be disabled independently, while P0 remains required by either. A release sets `DEVELOPMENT_PHASE_CONTROLS_MUTABLE` to `false` and removes the phase setter from the public API.

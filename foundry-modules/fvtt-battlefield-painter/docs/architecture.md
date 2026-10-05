# P0/P1 Architecture and Decisions

## Document bundle

One new drag stroke creates one logical bundle; a later selected-cell stage change can split it into two bundles. `src/scene-plan.ts` converts the sampled grid cells into a declarative plan:

- one Tile per occupied cell;
- native Stage-I Frost adds one owned detail Tile above its base; only the base represents the logical cell during rebuilds;
- one Region containing one polygon shape per cell;
- one AmbientLight per new `fire-static-v2` cell; legacy Fire retains its original single/clustered source path;
- exterior Walls only for stage-II brambles.

Each source is tagged under `flags.fvtt-battlefield-painter` with a `bundleId`, terrain ID, stage, role, and—on Tiles—the grid cell key and `{i,j}` offset. The offset is intentionally stored instead of pixel geometry so a bundle can be reconstructed through Foundry's current grid API.

New Fire uses approved static PNGs and native Torch lighting on both Square and Hex grids. Its `fire-static-v2` marker preserves stable cell-derived variants, rotation and sort across rebuilds; both logical stages currently share the approved profile. Legacy `fire-field-v1` videos load only while that scene contains old marked Tiles. The historical renderer descriptions below remain compatibility documentation; see [native Fire acceptance](fire-native-integration-2026-09-08.md) for the current creation path.

New Frost uses `frost-static-v2`: Stage I is a 20%-alpha ice base plus a separately owned grain detail, Stage II is one ice base. Both use one native cold light per cell at speed3. `visualLayer: base/detail` prevents duplicate movement polygons while allowing ownership/history/clear to include both Tiles. The stable detail sort keeps every grain layer above ice bases. Legacy `frost-field-v1` still uses its old renderer. See [native Frost acceptance](frost-native-integration-2026-09-08.md).

P0/P2 creation order is Tile → Region → AmbientLight → Wall; the ordered transaction contract retains an empty AmbientSound slot for compatibility with old scenes. New plans never populate that slot. If a later document fails validation, already-created documents are deleted in reverse order. Erase and stage-switch operations collect all affected bundles, prebuild original and replacement plans before any mutation, then replace the whole operation as one recovery boundary. A selected-cell stage change preserves the remainder at its old stage. If deletion or creation fails, affected survivors are removed and all originals are restored; a second recovery failure is reported explicitly.

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

`src/preview-renderer.ts` uses Foundry 14.364's public `canvas.interface.grid` highlight layer and `canvas.grid.getTopLeftPoint` boundary. Core performs the square/hex shape rendering; the module supplies offsets, color, border, and alpha. The renderer is created only after an active canvas is available, destroyed on deactivation/canvas teardown, and activation fails closed when the exact highlight API is absent.

## P1 history and development phases

`src/scene-history.ts` snapshots only documents carrying valid Battlefield Painter ownership flags. Each successful mutation records before/after sources; undo and redo delete only current owned bundles and recreate the selected snapshot, preserving foreign Scene documents. History is per active Scene, bounded to 20 entries, and clears redo after a new mutation.

The internal P0/P1/P2 phase gate defaults to mutable only for this alpha. Disabling P1 forces free shape/radius 0 and hides P1 UI; disabling P2 selects static media and hides clear UI; disabling P0 requires both P1 and P2 to be off and prevents activation. A release must set `DEVELOPMENT_PHASE_CONTROLS_MUTABLE` to `false`, which also removes the mutation switch from the module API.

## Known P0 trade-offs

- Stage change affects only selected cells, but rebuilding the affected bundles can write more documents than the selected-cell count.
- Overlap with another Battlefield Painter Tile is skipped; foreign Tiles are ignored.
- One Region polygon per painted cell is simple and robust but may need batching/union optimization for very large maps.
- P0 fallback uses one fire light for the stroke bounding center; P2 uses deterministic clusters for long irregular strokes.
- Static WebP remains the P0/P2-off fallback. P2 Square Fire keeps `fire.webp` as a logical/compatibility Tile source with `alpha=0`; P2 Square Frost uses `frost-film-v1.webp` as its visible thin-ice Tile. Both add separate module-owned field renderers. Hex Frost, Brambles, and marker-free old Scenes retain their compatibility media paths.

## P2 addendum

The September 2026 repair keeps logical ownership unchanged but clips each fire lobe against the union of neighboring cells at the same stage, retaining continuous UV coordinates across the pieces. World-anchored jitter and rotation break the old rows of identical silhouettes; screen blending and density-normalized emission remove dark cutout rims without obscuring Tokens. The fire ticker reads its actual elapsed time because PIXI 7 supplies a numeric delta argument. Hex fire uses the visible compatibility Tile path, never a hidden Square-only field marker.

Submitted strokes capture their cells, selected configuration/stage and target Scene before entering the mutation queue. Pending writes recheck Scene and GM identity. History rejects stale undo/redo instead of overwriting later terrain changes, excludes regenerated core metadata from the content fingerprint, and attempts to recover the current state if a restore fails. This is optimistic conflict protection, not a distributed client lock.

When P2 is enabled, cells are sorted and grouped by Foundry adjacency into deterministic clusters of at most 16 cells for fire lights. New Square fire Tiles persist `visualEffect: "fire-field-v1"`, keep `fire.webp` only as a hidden logical/compatibility source, and are rendered by one world-space mesh per active Scene. The mesh uses one shared ticker time, world-anchored emitter quads, and two shared black-keyed 2×2 variant videos: `fire-stage-i.webm` is the sparse Stage I field and `fire-stage-ii.webm` is the dense Stage II field. Emitter quads are clipped to occupied logical squares, so L-shaped holes and diagonal-only cells do not become a bounding-box fill; no video or shader instance is created per Tile.

New Square Frost Tiles persist `visualEffect: "frost-field-v1"` and display `frost-film-v1.webp` as a thin-ice Tile (`alpha=0.48` for Stage I and `0.62` for Stage II). One Frost container adds a subtle world-space shimmer mesh over all occupied Frost cells. Stage II additionally creates one emitter mesh backed by four phase-synchronized views of `frost-mist-v1.webm`; Stage I creates no mist media. A runtime mask clips both meshes to actual occupied cells and restricts mist to Stage II. Fire and Frost use separate renderers and tickers, but neither creates per-Tile videos, shaders, or filters.

New painting selects the user-approved native Fire, Frost and Brambles profiles or the self-reviewed native Acid artwork, including when the internal P2 developer gate is off. Existing unmarked Scene documents preserve their original Tile source during rebuilds. No path creates new AmbientSound documents.

Acid added on 2026-09-09 persists `acid-static-v1` and uses two original PNG textures through the existing Tile plan, stage, ownership and history paths. It has one Tile per cell, 15% visual expansion and stable 0/180-degree orientation. Its movement multiplier is 1; `scene-plan` omits Region creation for neutral visual terrain so it cannot mask another movement modifier. Acid introduces no damage automation, Wall, Light, Sound or custom renderer. These are this project's explicit behavior choices; the third-party internal configuration remains unknown. See [Acid acceptance](acid-integration-2026-09-09.md).

`runtime-bootstrap` mounts both renderers only after the exact Foundry `14.364` / dnd5e `5.3.3` compatibility gate. Each owns one `PrimaryCanvasContainer` at the Tiles sort layer, debounces Tile document hooks, rebuilds geometry on Scene changes, removes its ticker, PIXI objects, video textures, and video elements on teardown, and fails closed without showing its field when Square-grid, shader/mesh, browser video, or media APIs are unavailable. `auditEffects()` and `auditFrostEffects()` expose read-only diagnostics; neither exposes shader or write handles.

The scene document order retains Tile, Region, AmbientLight, AmbientSound, Wall so old module-owned AmbientSound documents can still be audited and removed in reverse dependency order. `scene-history` deliberately excludes AmbientSound from snapshots and restoration, so explicit legacy cleanup cannot be undone or resurrected. The clear preview still counts valid module-owned documents and rejects a stale document-ID fingerprint before mutation. A separate GM-only legacy-sound cleanup uses its own sorted sound-ID fingerprint and never touches foreign sounds. A controller mutation queue serializes paint, clear, undo, and redo.

The P0/P1/P2 gate is alpha-only. P1 and P2 can be disabled independently, while P0 remains required by either. A release sets `DEVELOPMENT_PHASE_CONTROLS_MUTABLE` to `false` and removes the phase setter from the public API.

Acid now applies a restrained 10-second material animation through `PrimaryBaseSamplerShader` on its native Tile mesh. The inherited occlusion/depth pipeline remains intact; RGB is locally displaced but alpha is sampled at the original coordinates. The native render clock drives it without another ticker. Tile destruction and canvas teardown release the module's material references. This unbatched material adds per-Tile draw overhead; no large-area performance claim is made. Details: [motion acceptance](acid-motion-2026-09-09.md).

## Approved default brambles (2026-09-09)

`bramble-static.ts` selects the approved stage texture and a deterministic 90-degree rotation from cell offsets. New paints persist `brambles-static-v2`; each cell is one native Tile at alpha1 and white tint, with 35% visual expansion that never enlarges Region or Wall geometry. The retired client setting and connected/micro-motion renderer have no runtime entrypoint. Existing client preferences are ignored, so GM and players render the same selected artwork. `auditBrambleEffects()` reports native loaded Tiles and legacy Tile counts without creating meshes or timers. The earlier [connected-preview record](brambles-connected-2026-09-08.md) is historical evidence, not the current default.

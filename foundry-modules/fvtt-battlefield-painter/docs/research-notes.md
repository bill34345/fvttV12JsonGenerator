# External Research Notes

Checked on 2026-08-13. These notes are kept in the worktree so implementation decisions can be revisited without repeating the first research pass.

## Product-level inspiration and copyright boundary

The public Tile Arsenal storefront describes a broad content/product concept: many terrain presets and hand-painted assets, placement/paint/erase tools, square and hex support, stages, color variations, lights, audio, walls, and movement-cost Regions. Battlefield Painter reimplements only the high-level workflow for personal use. It does not extract, download, inspect, or reproduce the paid module's code, configuration data, or artwork. The six P0 images were independently generated; exact prompts and processing are in `asset-provenance.md`.

Source: [Tile Arsenal storefront](https://www.foundryvtt.store/products/tile-arsenal)

## Foundry API contracts used

- `getSceneControlButtons` supports adding a custom tool to a control group's `tools` record.
- `Canvas#canvasCoordinatesFromClient` converts browser client coordinates into canvas coordinates.
- `BaseGrid#getOffset`, `getCenterPoint`, and `getVertices` expose the active square/hex grid geometry.
- P1 uses `BaseGrid#getAdjacentOffsets` for radius rings and `getDirectPath` for line cells instead of implementing grid-specific adjacency or line math.
- Scene embedded documents can be created and deleted in batches with `createEmbeddedDocuments` and `deleteEmbeddedDocuments`.
- v14 Region documents own `shapes` and `behaviors`; Region behavior sources use `type` and `system`.
- Core exposes Region behavior data models through `CONFIG.RegionBehavior.dataModels`; the `modifyMovementCost` system model includes `difficulties`.
- Terrain difficulty applies to configurable Token movement actions, while derived actions must not be overridden.
- AmbientLight and Wall are native Scene embedded documents.
- v14 `AmbientSoundData` exposes `easing` for distance-based volume adjustment, `repeat` for looping, and `walls` for wall-constrained playback; P2 sets all three explicitly. See the [AmbientSoundData API](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.AmbientSoundData.html).
- Foundry v14's migration guide documents the Tile origin change: `x/y` are the Tile center, and the historical top-left coordinates are offset by half the Tile width/height. P0 therefore supplies grid-cell centers from `getCenterPoint`.

Primary documentation reviewed:

- [Foundry VTT v14 Scene Controls](https://foundryvtt.com/api/v14/modules/hookEvents.html#getSceneControlButtons)
- [Foundry VTT v14 Canvas](https://foundryvtt.com/api/v14/classes/foundry.canvas.Canvas.html)
- [Foundry VTT v14 BaseGrid](https://foundryvtt.com/api/v14/classes/foundry.grid.BaseGrid.html)
- [Foundry VTT v14 Canvas Interface Canvas Group](https://foundryvtt.com/api/v14/classes/foundry.canvas.groups.InterfaceCanvasGroup.html)
- [Foundry VTT v14 Scene](https://foundryvtt.com/api/v14/classes/foundry.documents.Scene.html)
- [Foundry VTT v14 RegionData](https://foundryvtt.com/api/v14/classes/foundry.data.RegionData.html)
- [Foundry VTT v14 RegionBehaviorData](https://foundryvtt.com/api/v14/classes/foundry.data.RegionBehaviorData.html)
- [Foundry VTT v14 ModifyMovementCostRegionBehaviorTypeData](https://foundryvtt.com/api/v14/classes/foundry.data.regionBehaviors.ModifyMovementCostRegionBehaviorTypeData.html)
- [Foundry VTT v14 TokenMovementActionConfigDescriptor](https://foundryvtt.com/api/v14/interfaces/foundry.config.TokenMovementActionConfigDescriptor.html)
- [Foundry VTT v14 Migration Guide](https://foundryvtt.com/article/v14-migration-guide/)
- [Foundry VTT Regions Knowledge Base](https://foundryvtt.com/article/scene-regions/)
- [Foundry VTT Media Optimization Guide](https://foundryvtt.com/article/media/)
- [Foundry VTT Ambient Sounds](https://foundryvtt.com/article/ambient-sound)
- [Foundry VTT Lighting](https://foundryvtt.com/article/lighting/)

## Version caveat

The current public v14 API site may serve a later v14 patch than the exact target `14.364`. For that reason the manifest is pinned to `14.364`, runtime-sensitive Region behavior data is derived from live `CONFIG`, and static tests are not recorded as real Foundry acceptance. Exact `14.364` canvas behavior, Tile positioning, Region source validation, and movement measurement still require the local Lab checklist.

## Useful next research

- Measure document and render costs at 25, 100, and 300 painted cells.
- Verify whether region polygons should be unioned for performance or event semantics.
- Compare static WebP plus native lighting against transparent WebM loops at Foundry's recommended codecs and frame rates.
- Decide whether audio should use per-bundle AmbientSound, scene-wide mixing, or a client-local soundscape.

## P2 implementation evidence

- Six generated WebM files report VP9 with `ALPHA_MODE=1`, 512x512, 24 FPS, and four-second duration after FFmpeg finalization; explicit `libvpx-vp9` alpha extraction reports both transparent and opaque pixels in every file.
- Three generated OGG files report Opus, 48 kHz, mono, and approximately 20 seconds.
- Cluster light and sound radii convert the pixel-space cluster bounding-box half-diagonal through the live grid `size` and Scene grid `distance`, then add one grid distance; Foundry documents both light radii and AmbientSound radius in Scene/grid distance units. Static tests use a one-unit fallback and exact runtime attenuation remains part of the final Lab pass.
- `ffmpeg-static@5.2.0` is a development-only dependency used by the generator; it is not imported by browser code and is not copied into the module ZIP.
- P2 real-canvas behavior remains deliberately unverified until the final multi-phase acceptance pass.

The earlier open audio decision is now resolved for P2: use one module-owned AmbientSound per deterministic cluster, with stage-specific volume and wall attenuation. Exact `14.364` source validation remains a final runtime acceptance item.

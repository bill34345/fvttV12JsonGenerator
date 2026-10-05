# External Research Notes

Checked on 2026-08-13. These notes are kept in the worktree so implementation decisions can be revisited without repeating the first research pass.

## Product-level inspiration and copyright boundary

The public Tile Arsenal storefront describes a broad content/product concept: many terrain presets and hand-painted assets, placement/paint/erase tools, square and hex support, stages, color variations, lights, audio, walls, and movement-cost Regions. Battlefield Painter reimplements only the high-level workflow for personal use. It does not extract, download, inspect, or reproduce the paid module's code, configuration data, or artwork. The three canonical P0 images were independently generated; exact prompts and processing are in `asset-provenance.md`.

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
- If audio is ever reconsidered, start a new design decision; the rejected AmbientSound experiment is historical evidence, not an open implementation choice.

## P2 implementation evidence

- Three generated WebM files report VP9 with `ALPHA_MODE=1`, 512x512, 24 FPS, and four-second duration after FFmpeg finalization; explicit `libvpx-vp9` alpha extraction reports both transparent and opaque pixels in every file.
- The three historical OGG files reported Opus, 48 kHz, mono, and approximately 20 seconds, but are no longer shipped or referenced after the white-noise failure.
- Fire light clusters still convert the pixel-space cluster bounding-box half-diagonal through the live grid `size` and Scene grid `distance`. The former sound-cluster design is retired and retained only in historical acceptance records.
- `ffmpeg-static@5.2.0` is a development-only dependency used by the generator; it is not imported by browser code and is not copied into the module ZIP.
- The Fire and Frost runtimes use the exact v14.364 public `PrimaryCanvasContainer`, `PrimaryCanvasGroup.SORT_LAYERS`, `AbstractBaseShader`, `PIXI.Geometry`, and `PIXI.Mesh` exports. Each renderer builds shared world-space geometry for its marked Tiles and exposes read-only diagnostics.
- Offline tests cover exact occupancy masks, emitter determinism, lifecycle cleanup, fail-closed API checks, and 15×15 object-count contracts. These are implementation facts, not blanket visual or performance acceptance.
- B13 Fire Canvas acceptance remains pending. B14 Frost visual acceptance and its deliberately narrower evidence boundary are recorded separately.

The earlier audio decision is resolved in the opposite direction: new Battlefield Painter builds create no AmbientSound and ship no OGG. AmbientSound remains in ownership/audit contracts only so a GM can explicitly remove old module-owned scene documents.
# Historical note: audio retirement

The AmbientSound research and design decision below document the original P2 experiment. New Battlefield Painter builds no longer generate, reference, or create audio because runtime playback produced unacceptable white noise. The remaining ownership and cleanup references describe compatibility for old scenes only.

## 2026-09-07 用户认可轻量基线与 Tile Arsenal 复查

用户看过当前Fire/Frost实景图后明确认可保留当前版本，用作轻量效果方向；希望高画质参考最初的收费模块Tile Arsenal。此次只补充荆棘实景展示与公开资料研究，不改渲染器或素材，不宣称两档切换已经实现。

重新读取官方商店 https://www.foundryvtt.store/products/tile-arsenal ，并在浏览器查看公开71秒演示的20、34、40秒画面和阶段对照图。官方确认36种配置、300多幅素材、阶段变化及部分专用六角素材；未找到官方对自动拼接算法的说明。画面中可观察到规则铺设、阶段素材差异及部分重复纹样，不能据此断言使用邻接自动选图、特定shader或无缝融合算法。高画质路线可研究邻接边缘/角落处理、减少周期重复、独立阶段形态，但这些是本项目建议，不是Tile Arsenal已证实的内部实现。官方当前商店标示1.1.0最低Foundry14.365，本Lab仍锁定14.364，未安装或升级第三方模块。

荆棘补图：本地Foundry14.364/dnd5e5.3.3实际画笔各绘制9格阶段I/II，18Tiles、2Regions、阶段II外周12Walls。手工看图确认藤蔓可见，但纹样重复、格缝明显，阶段差异主要深浅，尚不具明显棘墙形态。两张432x432未修图截图保存于本任务visualizations的battlefield-painter-review/brambles-stage-i.png和brambles-stage-ii.png。此轮未重复移动阻挡测试，不把截图当成低配硬件性能验证。

预览Scene FhEusvWAiEybiG7C（BP-BRAMBLES-20260907-Preview）已通过Scene API删除；恢复原视图k0tDQjWqrbvHbjdu及paused=true，server active Scene未改变。仅本轮启动的Lab PID60852已停止。

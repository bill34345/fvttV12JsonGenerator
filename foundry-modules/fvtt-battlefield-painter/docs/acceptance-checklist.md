# Battlefield Painter 接受入口

## 当前候选与实际边界（2026-10-04）

当前候选为`0.3.0-alpha.2`，Mirror目标为用户指定的`14.368 / dnd5e 5.3.3`；既有`14.364 / 5.3.3`和Next切片证据单独保留。当前真实状态以[接续入口](CONTINUATION.md)、[升级与原版对照](../../../docs/reviews/2026-10-03-foundry-14-365-mirror-upgrade-and-tile-arsenal.md)和[V3接入](audio-v3-integration-2026-10-04.md)为准。下面的alpha.1/P2清单是历史规划，不把旧无音效、阶段形态、版本、组合或长时要求自动套到当前默认美术。

- 已接受：当前服务与模块身份、原版独立安装、保存开关完整性、来源代码必要兼容、Core条件/优先级/Injury窄接受；五组旧音源原版对照与V3七独立音源的加载/播放进度/循环、近远、主音量参数、Fire撤销重做/刷新/擦除及最终恢复。
- 继续补核：三格型代表交互、纵列六角26个basic配置/36阶段，阶段模式、Region孔洞/去重、Shift收起恢复、真实拖拽/玩家可见与播放器、最终一次清理和全部非任务文档保持。
- 当前阶段模式只改命中格位；`advanceCellKeys`会保留同笔未命中格位并拆出下一阶段，不以面板的未来绘制stage字段代替实际Tile/Region读回。阶段10的第一次尝试收据为`active=false`，不能作为已启用画笔的阶段交互接受。
- 本轮保持批准美术、默认关闭声音和能量原文件；狂野魔法/裂隙仅已有basic视觉，不追加深玩法。无用户主观音色接受、弱GPU/大面积/四小时或生产接受，不新增这些运行。
- 使用同一组标记夹具与当前官方Chrome；Readonly观察工具与完整Initializer分开，最终重导完整工具后恢复/清理。GM/SY权限按实际读回，只对本任务Macro授予必要的文档访问，不改全局账号权限。

## 历史 Exact Foundry 14.364 Acceptance Checklist

Static checks and build output do not satisfy this checklist. Run these in the approved local Lab with Foundry `14.364` and dnd5e `5.3.3`, using a disposable test Scene. Record screenshots, console errors, document counts from `api.auditScene()`, and any recovery action.

## Environment identity

- [ ] Confirm executable/build reports Foundry `14.364`.
- [ ] Confirm world reports dnd5e `5.3.3`.
- [ ] Confirm destination is under `F:\FoundryLab\foundry-v14\data\server-mirror\Data\modules\fvtt-battlefield-painter`.
- [ ] Confirm module `0.3.0-alpha.1` appears and enables without manifest warning.
- [ ] Confirm no browser console error during `init`, `ready`, Scene load, or canvas teardown.

## Square grid

- [ ] Open the Tiles control group; confirm the GM-only painter button appears.
- [ ] Open ApplicationV2 panel; confirm the three terrain previews, Chinese labels, stage controls, and active states render.
- [ ] Confirm free/line/fill controls, radius 0–4, and undo/redo disabled states render correctly.
- [ ] Move the pointer without painting; confirm preview follows cells, respects radius, and disappears on canvas leave/deactivation.
- [ ] Paint radius 0 and 4 strokes; verify no duplicate owned cell is created.
- [ ] Drag a line in both directions; verify the preview and committed cells match core direct-path behavior.
- [ ] Drag fill in all four endpoint directions; verify the inclusive offset area matches the preview.
- [ ] Paint connected and disconnected cells for each terrain/stage.
- [ ] Confirm Tiles exactly cover their grid cells and preserve transparent edges.
- [ ] Move a token through every Region; verify measured cost is ×2 for supported movement actions.
- [ ] Confirm stage-I and stage-II fire create the intended native light and torch animation.
- [ ] Confirm only stage-II brambles block movement; sight/light/sound remain unblocked.
- [ ] Erase one cell from the middle of a multi-cell stroke; verify the remainder survives and Region/Wall geometry is rebuilt.
- [ ] Target one cell with stage-switch; verify the complete original stroke cycles stage.
- [ ] Paint over an owned cell; verify it is skipped instead of duplicated.
- [ ] Deactivate the painter; verify normal Foundry canvas controls resume.
- [ ] Undo and redo paint, erase, and stage-switch; verify foreign documents remain unchanged.
- [ ] Undo, then make a new edit; verify redo is cleared.

## Hex grid

- [ ] Repeat all three terrain paints on a hex-row Scene.
- [ ] Repeat all three terrain paints on a hex-column Scene.
- [ ] Confirm Tile bounds do not displace the artwork relative to cell centers.
- [ ] Confirm Region polygons match all six vertices.
- [ ] Confirm adjacent bramble cells remove their shared Wall edge.
- [ ] Confirm erase and stage-switch reconstruct the same hex offsets.
- [ ] Repeat radius, line, fill, preview, undo, and redo on hex-row and hex-column Scenes.

## Failure and recovery

- [ ] Temporarily provide invalid Region behavior data in a disposable fixture; confirm Tile creation rolls back.
- [ ] Verify `auditScene()` counts match visible owned documents.
- [ ] Reload the world and confirm ownership flags still support erase and stage-switch.
- [ ] Disable the module and confirm foreign Scene documents are untouched.
- [ ] In alpha, disable P1 through `api.setDevelopmentPhase("p1", false)` and confirm the panel falls back to free radius 0 without preview/history controls.
- [ ] Re-enable P1 and confirm the controls return; then verify release packaging with phase controls immutable before formal release.
- [ ] Remove all P0 test documents before ending acceptance.

## Deferred until final unified runtime acceptance

- legacy-sound cleanup and no-new-audio request checks;
- transparent WebM animation;
- very large battlefields and long-session memory/performance;
- production environment installation;
- four-hour real-session soak.

## P2 final-pass additions

Run these only in the final unified environment pass after all development phases are complete. Clear module-owned documents between phase combinations; do not treat static tests as runtime acceptance.

- [ ] Confirm the module reports `0.3.0-alpha.1`; canonical compatibility media plus Fire/Frost field media remain valid in the build inventory. New P2 Square Fire/Frost must not request `fire.webm` / `frost.webm`.
- [ ] Run with `P0` only; confirm static WebP tiles, the P0 fire light, and no AmbientSound documents.
- [ ] Run with `P0+P1`; repeat radius, line, fill, preview, erase, stage, undo, and redo behavior.
- [ ] Run with `P0+P2`; confirm P2 fire uses hidden logical `fire.webp` plus `visualEffect: "fire-field-v1"`, mounts one continuous video-backed fire mesh, and does not request `fire.webm`. Confirm Square Frost uses `frost-film-v1.webp` plus `visualEffect: "frost-field-v1"`, adds Stage II mist without requesting `frost.webm`, while Brambles remains on its current WebM path. All terrain creates zero new AmbientSound documents or Battlefield Painter audio requests.
- [ ] Confirm `api.auditFrostEffects()` reports one film mesh, at most one Stage II mist mesh, shared ticker time, actual Frost cell/stage counts, and no persistent rebuild/object growth.
- [ ] For a Square Scene, confirm `api.auditEffects()` reports one mesh covering the actual fire cells, shared ticker time, correct 15×15 counts, and no persistent rebuild/object growth; inspect single, 1×3, 3×3, L-shaped, gap, stage-boundary, erase, undo/redo, Token-layer, and pan/zoom behavior manually.
- [ ] Run with `P0+P1+P2`; confirm complete interaction, zero new owned sounds, and at most 16 cells per fire-light cluster.
- [ ] On a fixture containing old module-owned and foreign AmbientSound documents, confirm the GM cleanup dialog lists only owned IDs, cancel is safe, stale fingerprints reject deletion, and confirmation leaves foreign sounds untouched.
- [ ] Paint 25, 100, and 300 connected cells; record Tile, Region, Light, zero-new-Sound, and Wall document counts and visible performance.
- [ ] Open scene clear preview; confirm only module-owned documents are counted and foreign documents are excluded.
- [ ] Change the Scene after opening the clear preview; confirm the stale fingerprint blocks deletion and asks for a new preview.
- [ ] Confirm clear is one undoable history operation and foreign documents survive clear, undo, redo, and reload.
- [ ] Repeat P2 media, zero-new-audio, clustering, legacy cleanup, and clear checks on square, hex-row, and hex-column Scenes.
- [ ] After runtime acceptance, set release phase controls immutable and verify the phase setter is absent from the public API.

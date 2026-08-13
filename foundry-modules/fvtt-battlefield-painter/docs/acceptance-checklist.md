# Exact Foundry 14.364 Acceptance Checklist

Static checks and build output do not satisfy this checklist. Run these in the approved local Lab with Foundry `14.364` and dnd5e `5.3.3`, using a disposable test Scene. Record screenshots, console errors, document counts from `api.auditScene()`, and any recovery action.

## Environment identity

- [ ] Confirm executable/build reports Foundry `14.364`.
- [ ] Confirm world reports dnd5e `5.3.3`.
- [ ] Confirm destination is under `F:\FoundryLab\foundry-v14\data\server-mirror\Data\modules\fvtt-battlefield-painter`.
- [ ] Confirm module `0.2.0-alpha.1` appears and enables without manifest warning.
- [ ] Confirm no browser console error during `init`, `ready`, Scene load, or canvas teardown.

## Square grid

- [ ] Open the Tiles control group; confirm the GM-only painter button appears.
- [ ] Open ApplicationV2 panel; confirm all six previews, Chinese labels, and active states render.
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

## Not yet accepted by P0

- audio;
- transparent WebM animation;
- very large battlefields and long-session memory/performance;
- production environment installation;
- four-hour real-session soak.

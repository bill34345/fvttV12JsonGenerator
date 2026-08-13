# Exact Foundry 14.364 Acceptance Checklist

Static checks and build output do not satisfy this checklist. Run these in the approved local Lab with Foundry `14.364` and dnd5e `5.3.3`, using a disposable test Scene. Record screenshots, console errors, document counts from `api.auditScene()`, and any recovery action.

## Environment identity

- [ ] Confirm executable/build reports Foundry `14.364`.
- [ ] Confirm world reports dnd5e `5.3.3`.
- [ ] Confirm destination is under `F:\FoundryLab\foundry-v14\data\server-mirror\Data\modules\fvtt-battlefield-painter`.
- [ ] Confirm module `0.1.0-alpha.1` appears and enables without manifest warning.
- [ ] Confirm no browser console error during `init`, `ready`, Scene load, or canvas teardown.

## Square grid

- [ ] Open the Tiles control group; confirm the GM-only painter button appears.
- [ ] Open ApplicationV2 panel; confirm all six previews, Chinese labels, and active states render.
- [ ] Paint connected and disconnected cells for each terrain/stage.
- [ ] Confirm Tiles exactly cover their grid cells and preserve transparent edges.
- [ ] Move a token through every Region; verify measured cost is ×2 for supported movement actions.
- [ ] Confirm stage-I and stage-II fire create the intended native light and torch animation.
- [ ] Confirm only stage-II brambles block movement; sight/light/sound remain unblocked.
- [ ] Erase one cell from the middle of a multi-cell stroke; verify the remainder survives and Region/Wall geometry is rebuilt.
- [ ] Target one cell with stage-switch; verify the complete original stroke cycles stage.
- [ ] Paint over an owned cell; verify it is skipped instead of duplicated.
- [ ] Deactivate the painter; verify normal Foundry canvas controls resume.

## Hex grid

- [ ] Repeat all three terrain paints on a hex-row Scene.
- [ ] Repeat all three terrain paints on a hex-column Scene.
- [ ] Confirm Tile bounds do not displace the artwork relative to cell centers.
- [ ] Confirm Region polygons match all six vertices.
- [ ] Confirm adjacent bramble cells remove their shared Wall edge.
- [ ] Confirm erase and stage-switch reconstruct the same hex offsets.

## Failure and recovery

- [ ] Temporarily provide invalid Region behavior data in a disposable fixture; confirm Tile creation rolls back.
- [ ] Verify `auditScene()` counts match visible owned documents.
- [ ] Reload the world and confirm ownership flags still support erase and stage-switch.
- [ ] Disable the module and confirm foreign Scene documents are untouched.
- [ ] Remove all P0 test documents before ending acceptance.

## Not yet accepted by P0

- audio;
- transparent WebM animation;
- very large battlefields and long-session memory/performance;
- production environment installation;
- four-hour real-session soak.

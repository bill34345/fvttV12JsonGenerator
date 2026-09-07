# P2 Execution Plan

This is the implementation record for the same Battlefield Painter module and the same topic branch as P0/P1. P2 is not a separate product, worktree, or branch. Runtime and visual acceptance are tracked per micro-batch rather than inferred from this implementation record.

## Scope

- Three original transparent VP9 WebM loops remain in the spike/build inventory for marker-free or legacy terrain paths. New P2 Square Fire/Frost do not request `fire.webm` / `frost.webm`.
- Three canonical transparent WebP base images: fire, frost, and brambles. The two stage records keep their own runtime alpha, Tint, light, and Wall semantics while sharing media paths.
- Independent P2 Square field media: two black-keyed Fire stage videos, one Frost thin-ice WebP, and one transparent 2×2 Frost mist WebM.
- New audio generation and playback are retired after runtime white-noise evidence; old AmbientSound ownership remains only for explicit GM cleanup.
- P2 phase gate and static-versus-animated media selection.
- Deterministic clusters of at most 16 adjacent cells for fire lights.
- Legacy AmbientSound audit and stale-fingerprint cleanup without history restoration.
- GM-only scene clear preview with an ownership-only document count and an ID fingerprint re-check.
- A controller mutation queue so paint, clear, undo, and redo cannot overlap.

## Media pipeline

The historical media pipeline still renders 512x512 canvas animations at 24 FPS from the three module-local WebP base images, using only a small deterministic source-layer drift rather than independent particles or extra effect shapes. `scripts/generate-media.mjs` drives Chrome through the DevTools protocol, records three four-second VP9 WebM loops, applies each source WebP's alpha mask before final encoding, and uses the pinned `ffmpeg-static@5.2.0` development dependency for video finalization. These scripts are never copied into the browser bundle or the install ZIP. This runtime spike does not use that generated fire loop for new marked P2 fire Tiles; it remains until a later post-visual-acceptance cleanup batch.

The three WebP files remain the panel thumbnails and P0 fallback. Both stage cards for a terrain intentionally resolve to the same thumbnail. The build validates the canonical loops plus Fire/Frost field media, the absence of retired audio assets, and deterministic ZIP output. Historical audio provenance and hashes are kept in `asset-provenance.md`.

## Square visual continuity

`buildScenePlan` accepts an optional `visualBleed` fraction. The live controller passes `0.08` only when Foundry's public `canvas.grid.type`/`CONST.GRID_TYPES.SQUARE` (or the v14 `grid.isSquare` getter) identifies a square grid. A missing or unrecognized type passes `0`. The value expands only Tile width and height; Tile centers, stage flags, cell keys, Region vertices, and mature bramble Wall segments remain unchanged. No hex-specific art or visual expansion is part of this batch.

## Phase semantics

The alpha gate exposes `{p0, p1, p2}` and defaults all three to `true`. P0 cannot be disabled while either P1 or P2 is enabled. P1 and P2 may be disabled independently for the eventual single-environment test matrix.

- P2 off: static WebP Tiles, the P0 single fire light, no fire effect marker, and no AmbientSound documents.
- P2 on fire: static `fire.webp` Tiles with `visualEffect: "fire-field-v1"`, one shared world-space field mesh, deterministic clustered fire lights, and zero new AmbientSound documents.
- P2 on Square Frost: `frost-film-v1.webp` Tiles with `visualEffect: "frost-field-v1"`, one shared film mesh, Stage II-only shared mist media/mesh, and zero new AmbientSound documents.
- P2 on Hex Frost or Brambles: the marker-free compatibility media path and zero new AmbientSound documents.
- Existing Scene documents are not migrated when a phase changes. Missing markers keep their old semantics, including their original Tile source during erase, stage advance, bundle rebuild, failure recovery, and undo/redo.
- Release builds make phase controls immutable and remove the setter from the public module API.

## Scene and clear behavior

`AmbientSound` remains in the ordered Scene document contract and module ownership flags solely for legacy cleanup. New scene plans leave the slot empty. The cleanup flow uses a sorted owned-sound ID fingerprint, rejects stale confirmation, deletes only module-owned AmbientSound documents, and is not part of SceneHistory.

New builds contain no OGG assets. A legacy-owned AmbientSound may therefore request a missing resource until a GM explicitly confirms cleanup in the Painter UI; the module warns once per Scene/fingerprint and never auto-migrates or deletes these documents.

## Continuous Fire and Frost field runtimes

The Fire runtime is independent of the `fire.webp` pixels. On an exact supported v14 canvas it scans active-Scene Tiles carrying `visualEffect: "fire-field-v1"` and builds one indexed emitter-quad mesh over actual occupied squares. Stage I and Stage II sample their own shared 2×2 variant videos; emitter position, scale, rotation, variant, and phase derive from world coordinates rather than Tile or bundle identity. L-shaped holes, erased cells, and disconnected regions remain empty instead of being filled by a bounding box. One shared `uTime` drives local fire-shape playback; there is no per-cell video, texture clock, or whole-block UV translation.

The Frost runtime scans `frost-field-v1` Tiles into one exact occupancy/stage mask, one film mesh, and—only when Stage II cells exist—one world-anchored mist emitter mesh. The visible Tile is the approved thin-ice film; the shader adds only a subtle slow shimmer. Four synchronized views of the same 2×2 mist video provide deterministic phase groups without per-Tile playback. Stage I creates no mist media.

Both renderers are deliberately fail-closed for non-Square grids, missing public Foundry/PIXI exports, shader creation failures, media failures, and geometry failures. They preserve terrain documents and record diagnostics without falling back to the legacy Fire/Frost WebM. B13 Fire Canvas acceptance remains pending. B14 Frost visual acceptance passed under the user-approved scope recorded in `B14-frost-field-square.md`; Network, full layout, and 15×15 performance claims remain explicitly unverified.

The clear button first creates a read-only preview over valid module-owned flags. It confirms only when the preview is non-empty, rechecks the sorted document-ID fingerprint immediately before mutation, and records the deletion as one SceneHistory operation. Foreign Tiles, Regions, lights, sounds, and Walls are excluded from counts and deletion.

## Verification boundary

Mechanical verification includes module tests, coverage, typecheck, build, media signatures, browser-bundle inspection, and diff/security checks. Runtime evidence and user visual decisions remain separate and are recorded in the runtime-acceptance micro-batches. Brambles independent visual work is intentionally deferred to the next development stage; release controls remain mutable until the remaining release gates are explicitly closed.

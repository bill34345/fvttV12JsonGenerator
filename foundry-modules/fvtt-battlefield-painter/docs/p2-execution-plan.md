# P2 Execution Plan

This is the implementation record for the same Battlefield Painter module and the same topic branch as P0/P1. P2 is not a separate product, worktree, or branch. Real Foundry acceptance is intentionally deferred until all development phases are complete.

## Scope

- Six original transparent VP9 WebM loops: one for each terrain and stage.
- Three original OGG/Opus ambience loops shared by the two stages of each terrain.
- P2 phase gate and static-versus-animated media selection.
- Deterministic clusters of at most 16 adjacent cells for fire lights and ambience sources.
- Module-owned AmbientSound documents, including transaction rollback, erase, stage changes, undo/redo, audit, and deletion.
- GM-only scene clear preview with an ownership-only document count and an ID fingerprint re-check.
- A controller mutation queue so paint, clear, undo, and redo cannot overlap.

## Media pipeline

`scripts/generate-media.html` uses a fixed deterministic seed to render 512x512 canvas animations at 24 FPS. `scripts/generate-media.mjs` drives Chrome through the DevTools protocol, records four-second VP9 WebM loops, applies each source WebP's alpha mask before final encoding, records 20-second Opus WebM audio, and uses the pinned `ffmpeg-static@5.2.0` development dependency to produce 48 kHz mono OGG/Opus files. These scripts are never copied into the browser bundle or the install ZIP.

The six WebP files remain the panel thumbnails and P0 fallback. The build validates the WebM EBML signature plus `alpha_mode=1`, the OGG `OggS` signature, the complete nine-file media set, and deterministic ZIP output. Asset provenance and hashes are kept in `asset-provenance.md`.

## Phase semantics

The alpha gate exposes `{p0, p1, p2}` and defaults all three to `true`. P0 cannot be disabled while either P1 or P2 is enabled. P1 and P2 may be disabled independently for the eventual single-environment test matrix.

- P2 off: static WebP tiles, the P0 single fire light, and no AmbientSound documents.
- P2 on: animated WebM tiles, deterministic clustered fire lights, and one wall-attenuated AmbientSound per cluster.
- Existing Scene documents are not migrated when a phase changes; a test combination starts from cleared module-owned documents.
- Release builds make phase controls immutable and remove the setter from the public module API.

## Scene and clear behavior

`AmbientSound` is part of the ordered Scene document contract and module ownership flags. Cluster ordering is based on sorted cell keys and Foundry adjacency, so the same cells produce the same sources regardless of pointer order. A cluster is capped at 16 cells; the next cluster starts with the remaining lowest key. Light and sound coverage converts the cluster's pixel-space half-diagonal through the live grid size and Scene grid distance, then adds one grid distance; sound values are clamped to two through twelve grid distances. P2 sets AmbientSound `repeat`, `easing`, and `walls` explicitly for looping, distance attenuation, and wall blocking.

The clear button first creates a read-only preview over valid module-owned flags. It confirms only when the preview is non-empty, rechecks the sorted document-ID fingerprint immediately before mutation, and records the deletion as one SceneHistory operation. Foreign Tiles, Regions, lights, sounds, and Walls are excluded from counts and deletion.

## Verification boundary

P2 verification on this computer is mechanical: module tests, coverage, typecheck, build, media signatures, browser-bundle inspection, frozen-lockfile installation, and diff/security checks. No Foundry runtime is started during P2 implementation.

After all phases are implemented, the other computer will run one complete acceptance pass with phase combinations P0, P0+P1, P0+P2, and P0+P1+P2 on square, hex-row, and hex-column Scenes. Runtime findings will be fixed on this same branch before release controls are locked.

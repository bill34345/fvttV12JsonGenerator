# `0.3.0-alpha.1` Release Notes

Status: packaged for personal evaluation; real Foundry runtime acceptance pending.

## Included

- Fire, frost, and bramble terrain, each with two stages and original transparent WebP art.
- Square/hex grid adapter based on Foundry core grid coordinates and vertices.
- GM-only ApplicationV2 painter with paint, erase, and stage-cycle modes.
- Reversible module-owned Tile/Region/AmbientLight/Wall bundles.
- Runtime-derived `modifyMovementCost` behavior, fire lighting, and stage-II bramble walls.
- Transaction rollback and recovery-oriented bundle replacement.
- Exact runtime gate for Foundry `14.364` and dnd5e `5.3.3`.
- Brush radius 0–4 using core grid adjacency.
- Free, direct-path line, and inclusive offset-area fill tools.
- Cell-polygon cursor preview bound to the active canvas interface layer.
- Per-Scene, module-owned undo/redo history bounded to 20 entries.
- Internal P0/P1/P2 diagnostic phase controls, with independent P1/P2 switches and an immutable release path.
- Six original transparent VP9 WebM loops and three original OGG/Opus ambience loops.
- Deterministic clustered fire lights, wall-attenuated AmbientSound sources, and ownership-only scene clear preview.
- Serialized paint/clear/undo/redo mutations to prevent overlapping Scene writes.
- Empty-target-only local Lab installation with no replacement or old-copy creation.

## Static runtime evidence

- Browser bundle imports successfully in a Foundry-shaped global sandbox.
- `init`, `ready`, `getSceneControlButtons`, and `canvasTearDown` lifecycle registration is exercised.
- Supported GM receives painter controls and mutation API.
- Unsupported versions and non-GM users receive only a diagnostic API.
- ApplicationV2 class construction and opening is exercised with a public-API-shaped test double.
- Simulated Scene document creation, rollback, erase/rebuild, stage switching, ownership, square/hex geometry, manifest, assets, and packaging are covered by automated tests.

These checks establish packaging and bootstrap confidence only. They do not prove actual canvas placement, movement measurement, PIXI interaction, lighting appearance, wall collision, persistence, or Foundry document validation.

## Required before calling P2 runtime-accepted

Run `acceptance-checklist.md` in Foundry `14.364` with dnd5e `5.3.3`. Until that happens:

- do not describe this build as production-ready;
- preserve any failure evidence and update `research-notes.md` with exact runtime differences.

## Distribution

- Installable artifact: `dist/fvtt-battlefield-painter.zip`.
- No commit, merge, remote push, marketplace publication, or production installation is part of alpha preparation.

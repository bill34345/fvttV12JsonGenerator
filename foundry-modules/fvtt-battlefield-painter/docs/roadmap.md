# Roadmap After P0

## P1 candidates

- Cursor/brush preview rendered through the current PIXI canvas API.
- Brush radius and fill/line tools.
- Transparent WebM loops for fire, arcane frost, and creeping vines.
- Per-bundle environmental audio with explicit volume and wall attenuation.
- Clustered light placement for long fire strokes.
- Stroke history and undo/redo beyond failure rollback.
- Safe batch deletion UI with a dry-run document count.

## P2 candidates

- Color variants and user-authored catalog entries.
- Scene objective markers and non-terrain tactical effects.
- Optional damage/condition hooks through documented integrations, kept outside core runtime.
- Region polygon union and document-count optimization.
- Socket-backed collaborative locking if non-GM painting is ever allowed.
- Import/export of configuration metadata without bundling third-party copyrighted assets.

Promotion from P0 should follow evidence from the exact-version acceptance checklist, especially Region movement semantics, square/hex Tile placement, and document-count performance.


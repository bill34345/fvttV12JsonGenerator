# Battlefield Painter Roadmap

## Implemented in the continuous development worktree

- P0 fire, frost, and bramble terrain with original static art.
- Square and hex grid geometry through Foundry core adapters.
- GM-only painting, erase, stage changes, movement Regions, fire light, and mature bramble Walls.
- P1 brush radius, line/fill tools, cursor preview, bounded SceneHistory, and undo/redo.
- P0/P1/P2 internal phase switches with an immutable release path.
- P2 original transparent WebM loops and OGG/Opus ambience assets.
- P2 deterministic clustered fire lights and AmbientSound sources.
- P2 ownership-only scene clear preview, fingerprint re-check, and serialized mutations.

## Later candidates

- Color variants and user-authored catalog entries.
- Scene objective markers and non-terrain tactical effects.
- Optional damage/condition hooks through documented integrations, kept outside core runtime.
- Region polygon union and document-count optimization.
- Socket-backed collaborative locking if non-GM painting is ever allowed.
- Import/export of configuration metadata without bundling third-party copyrighted assets.

## Acceptance policy

P2 development does not start Foundry or perform partial runtime acceptance. After all development phases are complete, the exact Foundry `14.364` / dnd5e `5.3.3` checklist is run once across P0, P0+P1, P0+P2, and P0+P1+P2 on square, hex-row, and hex-column Scenes. Runtime findings are fixed on this same branch before release controls are locked.

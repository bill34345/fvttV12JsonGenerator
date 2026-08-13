# P1 Development Checkpoint and Remote Test Handoff

Recorded on 2026-08-13 so later work does not need to repeat the design and environment investigation.

## Git state and scope

- Topic branch: `codex/20260813-095900-battlefield-painter-p0`.
- P0 alpha checkpoint: commit `8037de9` (`feat(foundry): add battlefield painter P0 alpha`).
- P1 and the continuing P2 implementation remain uncommitted until separately authorized.
- No push and no merge are part of this checkpoint.
- P1 scope is limited to brush radius, line/fill geometry, cursor preview, undo/redo, and internal development phase switches.

## Decisions that should not be rediscovered

- Radius is an adjacency-ring count from 0 through 4. It uses `BaseGrid#getAdjacentOffsets` and deduplicates offsets.
- Line uses `BaseGrid#getDirectPath([start, end])`.
- Fill is the inclusive offset rectangle between start and end. It is deterministic and map-content independent; it is not pixel-color flood fill.
- Preview uses each normalized cell's exact vertices and is bound lazily to the currently active `canvas.interface` layer.
- History captures only documents with valid module ownership flags. It preserves foreign Tile/Region/AmbientLight/Wall documents and is bounded to 20 entries per active Scene.
- Alpha exposes `developmentPhases()` and GM-only `setDevelopmentPhase()`. Release must set `DEVELOPMENT_PHASE_CONTROLS_MUTABLE = false`, after which the setter is not exposed.

## Evidence boundary on this computer

- Automated geometry, history, preview, ApplicationV2, lifecycle, version-gate, and browser-bundle tests are mechanical evidence only.
- The configured `F:\FoundryLab\foundry-v14` path and even an `F:` drive are absent on this computer. No local Foundry runtime acceptance has been performed.
- Public Foundry v14 API documentation confirms the candidate BaseGrid methods, but the public v14 docs may represent a later v14 patch. Exact `14.364` behavior must be checked on the other computer.
- The delivery checkpoint adds the `fvtt-battlefield-painter` workspace to the root `bun.lock`, allowing a fresh checkout to use `bun install --frozen-lockfile` and the module-local `bun run typecheck` without borrowing dependencies from another checkout.

## Remote test sequence after a later authorized push

1. After all development phases are complete, obtain explicit commit/push authorization, then push the topic branch without merging it.
2. On the Foundry computer, fetch and check out that exact branch; record `git rev-parse HEAD`.
3. Build the module ZIP from the checked-out source and record its SHA-256.
4. Confirm Foundry `14.364`, dnd5e `5.3.3`, target data path, process, port, and world before installation.
5. Install only into an empty test-module destination under the authorized local Lab. `install:local` now refuses any existing destination and does not replace, move, or preserve an old module tree.
6. Run every phase combination and grid orientation in `acceptance-checklist.md`, preserving screenshots, console errors, module API output, and document counts as test evidence rather than backups.
7. Report square, hex-row, and hex-column results separately. Do not call static checks or a successful module load real semantic acceptance.

## Known risks to target first

- Confirm the exact `14.364` PIXI Graphics chain and `canvas.interface` lifecycle.
- Confirm `getDirectPath` endpoint inclusion on all three grid orientations.
- Confirm fill's offset-rectangle semantics are intuitive on hex-row and hex-column grids.
- Stress undo/redo after mixed paint, erase, and stage changes; verify IDs may change while ownership and visible semantics remain stable.
- Measure preview and history behavior at radius 4 and at 25, 100, and 300 owned cells.

## Continuation policy

P2 continues in this same worktree and topic branch. The earlier P1 checkpoint is a historical commit boundary, not a request to create another worktree or branch. P0/P1/P2 switches are internal diagnostic controls for one final unified Foundry acceptance pass; no partial runtime test is required during P2 implementation.

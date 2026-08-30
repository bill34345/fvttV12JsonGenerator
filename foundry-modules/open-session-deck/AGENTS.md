# Open Session Deck module rules

## Purpose / 用途与范围

This directory owns the GM-only Open Session Deck browser module. It presents dnd5e party and encounter state in an in-Foundry ApplicationV2 panel and a same-session browser popout.

## Runtime boundary

- The shipped browser bundle may use Foundry and dnd5e browser APIs only. It must not import Node, Bun, generator packages, server tools, or another module at runtime.
- v0.1 support is exact: Foundry `14.364` and dnd5e `5.3.3`. Unsupported versions fail closed.
- The popout is a presentation surface controlled by the already authenticated GM window. It must not load a Foundry world URL, Canvas, or a second socket client.
- All UI entrypoints and commands re-check `game.user.isGM`. Do not rely on hidden buttons as a permission boundary.
- dnd5e damage/healing uses `Actor5e.applyDamage`, temporary HP uses the system method, statuses use `toggleStatusEffect`, and combat progression uses native Combat methods.

## Editing, validation, and acceptance / 编辑、验证与验收

- Keep controller, store, system adapter, and rendering surfaces separate and test their contracts with synthetic fixtures.
- No optimistic document writes. Re-resolve UUID targets before each command and fail visibly.
- Build, install, and hash verification are mechanical evidence only. Runtime completion requires authenticated GM/player Foundry acceptance and visual inspection.
- Run `bun run test:open-session-deck`, `bun run build:open-session-deck`, `bun run typecheck:foundry-modules`, and relevant repository gates before handoff.

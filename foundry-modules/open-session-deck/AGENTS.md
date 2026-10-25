# Open Session Deck module rules

## Purpose / 用途与范围

This directory owns the GM-only Open Session Deck browser module. It presents dnd5e party and encounter state in an in-Foundry ApplicationV2 panel and a same-session browser popout.

## Runtime boundary

- The shipped browser bundle may use Foundry and dnd5e browser APIs only. It must not import Node, Bun, generator packages, server tools, or another module at runtime.
- Runtime gates retain the exact pairs in `src/constants.ts`, including scoped 14.368/6.0.6 GM HP/exhaustion, same-session popout, TempHP busy/disabled, stale target removal and player-entry denial acceptance; other GM commands and the full matrix remain unaccepted. The 2026-10-01 native exhaustion panel acceptance remains bound to 6.0.5; D1/D2 UI evidence has its own target and scope in the suite ledger. Crossed and future pairs fail closed.
- The popout is a presentation surface controlled by the already authenticated GM window. It must not load a Foundry world URL, Canvas, or a second socket client.
- All UI entrypoints and commands re-check `game.user.isGM`. Do not rely on hidden buttons as a permission boundary.
- dnd5e damage/healing uses `Actor5e.applyDamage`, temporary HP uses the system method, statuses use `toggleStatusEffect`, and combat progression uses native Combat methods.
- dnd5e6.0.2 exhaustion reads `system.conditions.exhaustion`; 6.0.5/6.0.6 read `actor.effects.get("dnd5eexhaustion0").system.level`, using the native padded staticID. All write through `toggleStatusEffect("exhaustion", { levels })`; native6 must not write the derived `system.attributes.exhaustion` field directly.

## Editing, validation, and acceptance / 编辑、验证与验收

- Keep controller, store, system adapter, and rendering surfaces separate and test their contracts with synthetic fixtures.
- No optimistic document writes. Re-resolve UUID targets before each command and fail visibly.
- Build, install, and hash verification are mechanical evidence only. Runtime completion requires authenticated GM/player Foundry acceptance and visual inspection.
- Run `bun run test:open-session-deck`, `bun run build:open-session-deck`, `bun run typecheck:foundry-modules`, and relevant repository gates before handoff.

## Mirror Core patch continuation (2026-10-03)

The user authorized Mirror Foundry `14.368` with dnd5e `5.3.3`. Runtime gates now include this exact pair while preserving the previous supported pairs; this does not accept other Core/system combinations. Record actual new-Core behavior separately from legacy tests and historical Next evidence. Current maintenance and acceptance: [Mirror patch review](../../docs/reviews/2026-10-03-foundry-14-365-mirror-upgrade-and-tile-arsenal.md). The new pair overrides older exact-364-only wording for this scoped continuation; existing authority and data protections remain applicable.

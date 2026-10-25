# Open Session Deck

Open Session Deck is a GM-only Foundry VTT dashboard for a second display. It renders from the GM's existing authenticated browser session, so the popout does not load another Foundry client, Canvas, login, or module socket.

## Supported runtime

- Foundry VTT `14.364` with dnd5e `5.3.3` (runtime accepted)
- Foundry VTT `14.368` with dnd5e `5.3.3` (existing Mirror compatibility candidate; see the scoped acceptance records)
- Foundry VTT `14.368` with dnd5e `6.0.2` (historical static migration candidate; in-world acceptance pending)
- Foundry VTT `14.368` with dnd5e `6.0.5` (native exhaustion panel slice accepted; remaining commands and GM/player matrix untested)
- Foundry VTT `14.368` with dnd5e `6.0.6` (bounded GM panel/popout, TempHP busy/disabled, stale target removal and player-entry denial accepted; remaining commands and the full matrix untested)

Other versions, crossed version pairs, and systems fail closed. Daggerheart support is planned for a later release and is not claimed by this release.

The 6.0.5 and 6.0.6 adapter path reads exhaustion from dnd5e's `dnd5eexhaustion0` Active Effect (the 16-character ID produced by `staticID`) and adjusts it with the native `toggleStatusEffect` API. On 2026-10-01 the same owned Actor's 6.0.5 panel and native readback passed 3→4→3, normal GM reload and exact fixture cleanup. The 6.0.6 pair has scoped real GM HP/exhaustion, panel/same-session popout, TempHP busy/disabled, stale target removal and player-entry denial evidence. General stale branches, other GM commands and the full matrix remain unaccepted; see the [current suite ledger](../../docs/plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md). Historical scope remains in see the [bounded restoration review](../../docs/reviews/2026-10-01-next-605-custom-module-restoration.md).

## Features

- Shared in-Foundry panel and same-session browser popout
- World-level Actor-folder party source with optional descendant folders
- Direct current/base/effective/temporary HP, maximum and AC modifiers, inspiration, exhaustion, statuses, concentration, and death saves
- Focused batch workspace limited to HP and explicit add-to-all/remove-from-all status actions
- Compact party placeholders in the encounter and complete operational cards for NPCs
- Decimal initiative editing and swapping, private individual or missing-NPC rolls, and GM visibility control
- Progressive first-round friendly initiative reveal in the official player Combat Tracker; hostile combatants hidden by default
- Active encounter overview, previous/next turn, and main-canvas token location
- English and Simplified Chinese UI

Player initiative concealment is ordinary UI presentation and is not claimed as secrecy against clients inspecting document data. The module does not include a separate player dashboard, action automation, a second map, AI features, or custom networking.

## Help

The Help button in the panel and same-session popout opens this module's entry in an active Suite handbook with a matching help API. If Suite is absent, disabled or unavailable, Deck opens its own bundled read-only help. Both surfaces use the single `docs/manual.json` entry source. Deck 0.2.0 exposes a GM-checked `api.openHelp()`; help does not save preferences or execute game commands. The bounded H3 acceptance is tracked in the [suite ledger](../../docs/plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md).

## Development

```text
bun run test:open-session-deck
bun run build:open-session-deck
bun run typecheck:foundry-modules
```

Build and install verification do not prove in-world behavior. Runtime acceptance requires an authenticated GM/player test in the exact supported Foundry and dnd5e versions.

Licensed under the MIT License. No dnd5e or Daggerheart artwork, logos, or rules text is redistributed.

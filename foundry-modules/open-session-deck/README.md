# Open Session Deck

Open Session Deck is a GM-only Foundry VTT dashboard for a second display. It renders from the GM's existing authenticated browser session, so the popout does not load another Foundry client, Canvas, login, or module socket.

## Supported runtime

- Foundry VTT `14.364` with dnd5e `5.3.3` (runtime accepted)
- Foundry VTT `14.368` with dnd5e `6.0.2` (historical static migration candidate; in-world acceptance pending)
- Foundry VTT `14.368` with dnd5e `6.0.5` (native exhaustion panel slice accepted; remaining commands and GM/player matrix untested)

Other versions, crossed version pairs, and systems fail closed. Daggerheart support is planned for a later release and is not claimed by this release.

The 6.0.5 adapter reads exhaustion from dnd5e's `dnd5eexhaustion0` Active Effect (the 16-character ID produced by `staticID`) and adjusts it with the native `toggleStatusEffect` API. On 2026-10-01 the same owned Actor's panel and native readback passed 3→4→3, normal GM reload and exact fixture cleanup. This does not accept the other commands, popout or full GM/player matrix; see the [bounded restoration review](../../docs/reviews/2026-10-01-next-605-custom-module-restoration.md).

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

## Development

```text
bun run test:open-session-deck
bun run build:open-session-deck
bun run typecheck:foundry-modules
```

Build and install verification do not prove in-world behavior. Runtime acceptance requires an authenticated GM/player test in the exact supported Foundry and dnd5e versions.

Licensed under the MIT License. No dnd5e or Daggerheart artwork, logos, or rules text is redistributed.

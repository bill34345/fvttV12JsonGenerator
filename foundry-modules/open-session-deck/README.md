# Open Session Deck

Open Session Deck is a GM-only Foundry VTT dashboard for a second display. It renders from the GM's existing authenticated browser session, so the popout does not load another Foundry client, Canvas, login, or module socket.

## Supported runtime

- Foundry VTT `14.364`
- dnd5e `5.3.3`

Other versions and systems fail closed. Daggerheart support is planned for a later release and is not claimed by v0.1.

## Features

- Shared in-Foundry panel and same-session browser popout
- Automatic player-character roster plus world-level pinned/hidden actors
- Rule-aware damage, healing, temporary HP, inspiration, exhaustion, and status controls
- Active encounter overview, previous/next turn, and main-canvas token location
- English and Simplified Chinese UI

The module does not include player dashboards, dice or action automation, a second map, AI features, or custom networking.

## Development

```text
bun run test:open-session-deck
bun run build:open-session-deck
bun run typecheck:foundry-modules
```

Build and install verification do not prove in-world behavior. Runtime acceptance requires an authenticated GM/player test in the exact supported Foundry and dnd5e versions.

Licensed under the MIT License. No dnd5e or Daggerheart artwork, logos, or rules text is redistributed.

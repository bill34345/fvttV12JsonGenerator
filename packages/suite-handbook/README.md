# Shared suite handbook reader

This private workspace package provides the content contract, pure search/routing model, and a root-local DOM reader shared by the offline handbook and a future Foundry host.

```ts
import { mountHandbook } from '@fvtt-json-generator/suite-handbook';

const reader = mountHandbook(element, content, host);
reader.navigate('open-session-deck', 'steps');
reader.dispose();
```

Content is a `schemaVersion: 1` snapshot produced by `docs/handbook/build.mjs`; the package does not read files or fetch content. `entryId` is the stable handbook ID, `ownerDirectory` identifies its content owner, and `foundryModuleId` is the actual manifest ID or null. User text, original documents and commands render as text. Commands are only copied after an explicit click.

Without a host, routing and theme stay in the supplied root. Host ports opt into URL navigation, title/theme changes, clipboard access and external subscriptions. Programmatic `navigate` renders without notifying `onNavigate`, so a Foundry host never needs to change the world's hash. Global shortcuts are opt-in; root keyboard handling ignores editing fields.

Mounting a second reader on the same root disposes the first. Dispose releases root listeners, host subscriptions and pending search timers. Call it before a host closes or replaces a view. In-flight clipboard results are ignored after disposal, remount or navigation. Two readers can coexist with distinct generated element IDs; only the single standalone page chooses an empty `idPrefix` for legacy IDs.

Use the root `bun run test:suite-handbook` and package typecheck. See [handbook maintenance](../../docs/runbooks/handbook-maintenance.md) for content/review/build rules. This package supplies no Foundry entry, module installer, persistent settings or business operations.

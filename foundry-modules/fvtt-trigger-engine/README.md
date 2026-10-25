# FVTT Trigger Engine

`fvtt-trigger-engine` is the generic event and macro-dispatch layer for Foundry VTT 14.364 / dnd5e 5.3.3 and Mirror 14.368 / 5.3.3, with scoped local acceptance on the exact 14.368 / 6.0.5 pair for the four-module migration. It handles Actor document updates, Combat turn start and Combat turn end events, GM-only execution, per-Actor queues, causal recursion guards, and validated world trigger definitions. Actor update events include `capturedModifiedTime` from the native post-update Hook so subscribers can identify persisted HP transitions without trusting queue-delivery time.

The owned Next at 14.368 / 6.0.6 has scoped acceptance for normal first save, Manager display, single-GM disabled/nonmatching zero actions and one matching action, in-flight unsubscribe, ordinary client reload and exact cleanup. Zero persisted Setting rows are a normal unused default; first save creates the row. This does not establish cross-client atomic saves. A separate Custom Conditions HP/injury consumer chain is accepted; WMP external attacks, multiple GMs and complete Combat branches still need their own acceptance. The new `flags.dnd5e.lastMovedToken` Actor update is filtered by each trigger's watched paths; an HP-only trigger does not run for that flag.

The module does not implement individual conditions. Install `fvtt-custom-conditions` for the Drakkenheim condition definitions and their parameterized runtime behavior.

The public API exposes CRUD for trigger definitions and `api.subscribe(listener)` for browser-safe event consumption by another module. Events are delivered only by the active GM client. Macro actions receive a `triggerContext` containing the document snapshots, event metadata, and a causal `updateDocument` helper.

Calling the unsubscribe function returned by `subscribe` or `subscribeExternal` skips callbacks that have not started, including those already captured for the current delivery. It does not cancel a running callback or reverse its side effects.

The active GM sees a warning when stored trigger data cannot be safely rewritten. The manager keeps a failed edit in its text area and shows the save error. If existing world trigger data uses a future schema, contains invalid entries, or has unknown fields, valid definitions remain readable but edits are refused so the original setting is preserved for review. Definition changes from one client are serialized; Foundry settings do not provide an atomic compare-and-swap across clients or direct setting writes.

Actor event `before`/`after` remain source snapshots. Characters with automatic hit points may persist `hp.max: null`; HP consumers use the optional synchronously captured `preparedHp.before`/`preparedHp.after` numeric pair. Embedded Item and ActiveEffect changes refresh that separate prepared snapshot without replacing a pending Actor HP transition.

The runtime rechecks active-GM authority after awaited subscribers, turn callbacks, and Macro resolution, before subsequent actions, and when the causal update helper is used. It cannot interrupt an already-running user Macro; direct document writes inside that Macro remain the author's responsibility. Focused regressions cover these handoff boundaries; ServerNext multi-GM runtime acceptance is still pending.

Build and test with `bun run build:trigger-engine`, `bun run test:trigger-engine`, and `bun run typecheck:foundry-modules`.

Historical 5.3.3 evidence on server-mirror covers manager CRUD/toggle operations, real Actor/Combat events, and single execution with two connected GMs and after active-GM handoff. Forge currently owns that instance; this refactor does not access or restart it. Current acceptance uses only the owned server-next on loopback30002 at14.368/6.0.6, with source, build, installation and module behavior recorded separately. This does not establish compatibility with historical serverNext/dnd5e6.0.2. See the suite execution ledger and the dated `docs/reviews/2026-09-21-custom-conditions-release-readiness.md` for their respective scopes.

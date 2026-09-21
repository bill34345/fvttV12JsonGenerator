# FVTT Trigger Engine

`fvtt-trigger-engine` is the generic event and macro-dispatch layer for Foundry VTT 14.364 and dnd5e 5.3.3. It handles Actor document updates, Combat turn start and Combat turn end events, GM-only execution, per-Actor queues, causal recursion guards, and validated world trigger definitions.

The module does not implement individual conditions. Install `fvtt-custom-conditions` for the Drakkenheim condition definitions and their parameterized runtime behavior.

The public API exposes CRUD for trigger definitions and `api.subscribe(listener)` for browser-safe event consumption by another module. Events are delivered only by the active GM client. Macro actions receive a `triggerContext` containing the document snapshots, event metadata, and a causal `updateDocument` helper.

Build and test with `bun run build:trigger-engine`, `bun run test:trigger-engine`, and `bun run typecheck:foundry-modules`.

Runtime evidence on server-mirror covers manager CRUD/toggle operations, real Actor/Combat events, and single execution with two connected GMs and after active-GM handoff. The resident local service is kept running until user shutdown. This does not establish compatibility with serverNext/dnd5e 6.0.2. See the repository's `docs/reviews/2026-09-21-custom-conditions-release-readiness.md` for the current acceptance scope.

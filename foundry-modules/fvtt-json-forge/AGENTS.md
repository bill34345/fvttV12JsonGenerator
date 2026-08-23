# FVTT JSON Forge module

This module is the Foundry 14 GM-facing Actor workflow. It may call the public browser runtime and Foundry Document APIs only.

- Do not import Node/Bun modules, read local files, or edit LevelDB.
- The module must enforce GM authority and the exact Foundry 14.364 / dnd5e 5.3.3 target before generation and before creation.
- Only a decoded `accepted` Forge response may reach the world-document adapter.
- Creation is one final `Actor.create()` with the complete verified artifact and Forge identity, followed by readback. Cancellation is honored before submission; the short world-write interval is non-cancellable. Ordinary readback failures attempt to delete only that newly created Actor. A browser crash after the server commits may leave the complete identified Actor; the UI and product revision must state this boundary honestly.
- The deterministic world Document ID is keyed by `sourceId`, so concurrent windows cannot create different artifacts for the same source identity.
- API keys are client-local browser settings and must never enter world data, logs, diagnostics, or Forge responses.

Mechanical acceptance: typecheck, browser bundle, forbidden-import scan, module-manifest tests, and module runtime tests. Semantic acceptance: local Foundry GM preview/create/readback with Chinese and English sources.

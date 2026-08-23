# FVTT JSON Forge module

## 用途与范围

This module contains parallel Foundry 14 GM-facing Actor and bounded world Item create-only workflows. It may call the public browser runtime and Foundry Document APIs only.

- Do not import Node/Bun modules, read local files, or edit LevelDB.
- The module must enforce GM authority and the exact Foundry 14.364 / dnd5e 5.3.3 target before generation and before creation.
- Only a decoded `accepted` Actor or Item Forge response may reach its type-specific world-document adapter. Actor and Item request, response, preview, and adapter types remain separate.
- Creation is one final `Actor.create()` or `Item.create()` with the complete verified artifact and Forge identity, followed by readback. Cancellation is honored before submission; the short world-write/readback interval is non-cancellable. Ordinary readback failures attempt to delete only that operation's newly created document. A browser crash after the server commits may leave the complete identified document; the UI and product revision must state this boundary honestly.
- Each workflow derives its deterministic world Document ID from its type-specific `sourceId`, so concurrent windows cannot create different artifacts for the same source identity. Item operations must not change the world Actor count.
- API keys are client-local browser settings and must never enter world data, logs, diagnostics, or Forge responses.

## 验证与验收

Mechanical acceptance: typecheck, browser bundle, forbidden-import scan, module-manifest tests, and separate Actor/Item runtime tests. Semantic acceptance: local Foundry GM Actor regression plus bounded Item preview/create/readback, duplicate reuse, multi-stage blocking, dynamic submit state, and exact cleanup.

# FVTT JSON Forge module

## 用途与范围

This module contains parallel Foundry 14 GM-facing Actor, bounded world Item, and explicitly reviewed encounter-package create-only workflows. It may call the public browser runtime and Foundry Document APIs only.

- Do not import Node/Bun modules, read local files, or edit LevelDB.
- The module must enforce GM authority and the exact Foundry 14.364 / dnd5e 5.3.3 target before generation and before creation.
- Only a decoded `accepted` Actor or Item Forge response may reach its type-specific world-document adapter. Actor and Item request, response, preview, and adapter types remain separate.
- The separate reviewed encounter-package adapter regenerates Actor sources through the formal browser workflow. It may expose explicit `GEN_GM_ASSISTANCE_REQUIRED` / `GEN_EXTERNAL_RULE_REVIEW_REQUIRED` cases, plus `GEN_LITERAL_REVIEW_REQUIRED` only for literal behavior mechanics with gm-assisted/external-rule execution, to package-level GM review when every required mechanic has one bound companion macro. Unknown diagnostics, failed sources and unbound coverage remain blocked. This does not change the single Actor/Item adapters or promote historical Review Bundles.
- Human Markdown encounter generation uses source-scoped Monster Intake IR validation, deterministic rendering and formal generation for every discovered Actor, then extracts and reviews a closed version-2 capability configuration. AI never writes executable code. The tool compiles a fixed module entry; unsupported rules remain explicit. Creation and first enablement require the GM action; enabled, identity-checked fixed configurations resume after refresh, without executing stored arbitrary commands. Caller cancellation, stale-source rejection, secret-free reports and the shared AI job gate apply to this entry too.
- Encounter imports store macros without executing them; startup is a separate GM action with command-hash and binding checks. Deterministic package Document IDs, full conflict preflight, semantic readback and owned-document cleanup are mandatory; uploaded content-addressed assets may remain for retry after failure.
- Creation is one final `Actor.create()` or `Item.create()` with the complete verified artifact and Forge identity, followed by readback. Cancellation is honored before submission; the short world-write/readback interval is non-cancellable. Ordinary readback failures attempt to delete only that operation's newly created document. A browser crash after the server commits may leave the complete identified document; the UI and product revision must state this boundary honestly.
- Each workflow derives its deterministic world Document ID from its type-specific `sourceId`, so concurrent windows cannot create different artifacts for the same source identity. Item operations must not change the world Actor count.
- API keys are client-local browser settings and must never enter world data, logs, diagnostics, or Forge responses.

## 验证与验收

Mechanical acceptance: typecheck, browser bundle, forbidden-import scan, module-manifest tests, and separate Actor/Item runtime tests. Semantic acceptance: local Foundry GM Actor regression plus bounded Item preview/create/readback, duplicate reuse, multi-stage blocking, dynamic submit state, and exact cleanup.

## Mirror Core patch continuation (2026-10-03)

The user authorized Mirror Foundry `14.368` with dnd5e `5.3.3`. Runtime gates now include this exact pair while preserving the previous supported pairs; this does not accept other Core/system combinations. Record actual new-Core behavior separately from legacy tests and historical Next evidence. Current maintenance and acceptance: [Mirror patch review](../../docs/reviews/2026-10-03-foundry-14-365-mirror-upgrade-and-tile-arsenal.md). The new pair overrides older exact-364-only wording for this scoped continuation; existing authority and data protections remain applicable.

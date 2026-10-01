# midi-qol Snapshot

## Local request-handler adaptation, 2026-10-01

The reviewed local build is based on upstream commit `4338eeab85041cd71b76ede36818e2265cbf06ae`, with preserved existing local.9 changes. The narrow [request-bonus patch](patches/2026-10-01-request-bonus.patch) adds owner Activity bonus resolution to the Check and Save request handlers. Its interface reference is the exact dnd5e 6.0.5 checkout at `3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc`, `module/documents/activity/check.mjs` and `save.mjs`.

This patch is an incremental source artifact, not a complete replacement for the local build. Explicit TypeScript and archive builds, the bounded local deployment, real Check/Save request rolls with modifier +4 and exact fixture cleanup passed for local.10. This does not accept the complete privacy/workflow or gameplay matrix. The [current review](../../../docs/reviews/2026-10-01-next-605-midi-request-bonus-gap.md) records the source chain, preserved local changes, artifact hashes and acceptance boundary. The public-document notes below describe the earlier snapshot and do not establish current v14 compatibility.

Source links:
- Foundry package page: <https://foundryvtt.com/packages/midi-qol>
- GitHub README: <https://github.com/tposney/midi-qol>

What matters for this project:
- The package page currently lists a newer v13 line, but also shows recent v12 releases such as `12.4.64`.
- The README documents item and actor `OnUse` macros and describes them as workflow hooks that let an item customize behavior during rolling.
- The README also documents `ItemMacro` support and explains that OnUse macros run inside the item workflow, which is the right integration point for conditional post-hit logic.

Relevant excerpts summarized:
- `ItemMacro` can be called from midi's on-use or damage-bonus macro fields.
- `OnUse` macros are intended to customize how a particular item behaves during the workflow.
- These macros can inspect workflow state and are awaited, which makes them a good fit for `Heavy Hit` style "if attack total exceeds AC by N" checks.

Implementation guidance captured from the docs:
- Put the conditional trigger on the primary attack activity.
- Keep extra branches as separate activities.
- Use activity identifiers and macro code to trigger the right branch after the hit is known.

Why this repo uses it:
- dnd5e activities can model attack/save/damage/effect structure.
- midi-qol provides the workflow hook needed for margin-based triggers that dnd5e cannot express declaratively.

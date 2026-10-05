# Restored workflow item regression — local.5 preparation

## Runtime failure

The independent A–G Chrome task reproduced two errors when using the permitted manual Damage control on a normal miss: Workflow.item could not find an item UUID, then onUseMacros dereferenced a null item. The miss itself had an empty hit set, no damage roll and unchanged target HP; that evidence is not reclassified as an automatic-hit failure.

Passive readback confirms that the original Item still exists, `flags.dnd5e` is absent, and `system.item` / `system.activity` contain valid UUIDs. Native `getAssociatedItem()` and `getAssociatedActivity()` resolve them. SaveToChatCard and UseWeakReferences are enabled. Evidence is in the private batch6K directory: `g-midi-miss-manual-damage-error.evidence.json` and `g-midi-miss-chatcard-diagnostic.evidence.json`.

## Source proof and upstream check

`Workflow.fromChatCardUuid` reconstructs the workflow with a chat-card UUID and no cached item. `Workflow.item` reads only `flags.dnd5e.item.uuid`. The manual Damage action first binds the current activity to the workflow, then `rollDamage` reads `onUseMacros`, which calls `this.item.getFlag`.

Installed dnd5e 6.0.2 `ChatMessage5e.getAssociatedItem` (dnd5e.mjs around line 56082) supports `system.item.uuid`, the legacy flag and deleted/synthetic Item snapshots; it also supports scaled items. Use that contract rather than rewriting the data model or disabling OnUse macros. The existing `isDnd5e53` boolean means newer than 5.2.99 and is also true for 6.x, so it cannot be negated to identify dnd5e 6.

The official module advisory check at 2026-09-20T08:39:29Z still identifies dnd6 SHA `4338eeab85041cd71b76ede36818e2265cbf06ae` and V14 release `v14.0.12`. A second exact-code audit queried all ten branch heads: dnd6/master/v14/v13/wfrefactor and the applicable patch branch retain the old getter; historical dnd3 has no file at this path and test has no matching getter. Open MRs 434/435 matched broader OnUse keywords but add macro passes, not item reconstruction. No applicable fix was found. Full branch SHA/getter/diff evidence is in batch6K `upstream-manual-damage-audit.json`.

## Minimal change and verification scope

Preserve the existing cached item and all 5.x behavior. For dnd5e 6+, prefer the item on the already-bound activity (including native scaling), then use the native associated-item resolver with scaling. Keep the original legacy fallback and diagnostics for genuinely unavailable sources. Patch 0001 remains unchanged; this is separate patch 0002.

Local.4 built successfully (ZIP SHA-256 `38F9433E53E38F5F40473E22D7778B7A78B359AC951DEEC82F3E8CFC65D46194`) but was rejected in source review before any installation. Its item getter preferred a cached activity whose existing getter still restored without `system.scaling`; activity/actor-before-item access could therefore return an unscaled item. Local.5 also restores the dnd5e 6 activity through the native scaled association API, bypassing the old manual flags-scaling clone on that branch, while retaining the 5.x branch. Tests must execute the actual getters in both orders, not just bind an already-scaled mock activity.

Regression tests must execute the actual getters and OnUse macro access, including system-only cards, bound scaled activities, native associated/synthetic items, activity/actor-before-item access, legacy flags, cached items, missing sources and unchanged 5.x behavior. Reverting only patch 0002 must reproduce the old null.getFlag failure; reverting only the activity restoration must expose the scaling-order failure. Browser verification must then retry the preserved failing chat card and a scaled activity, verifying manual damage completion, unchanged miss hit sets/automatic HP behavior, and no new related Console/Troubleshooter errors. Local.5 is not accepted merely because these source tests or its package build pass.

## Verification and deployment result

The root completed the unfinished test helper and added the actual-getter regression cases. All 58 module tests passed with 219 assertions; TypeScript checks passed, including pristine/candidate checks at exit 0. Native association methods are hash-verified and extracted from the installed dnd5e source; Item/Actor boundaries are explicit shims. Three accessor orders preserve scaling, and two targeted reverts reproduce the original item failure and local.4 scaling failure. Astra reviewed the tests and closed the scaling P2.

Local.5 ZIP SHA-256 is `9096FD772DC5FA6AAA440DCE392A0D688FCAD58650E4C55E03895F57DD1A29EA`. Restricted three-file apply passed with disk and HTTP bundle SHA-256 `0EC5DB3B8FBF927DB1CF8652A1FBA6215BE9FA749843CD8A6C2D60F0404A0964`; PID stayed 11188. No service restart, pack replacement, database edit or publication occurred. Browser acceptance of the fix remains pending and is part of the continuing A–G task.

# midi-qol Snapshot

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

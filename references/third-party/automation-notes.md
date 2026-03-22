# Automation Notes

Current project stance:
- Use plain dnd5e item/activity data for structure.
- Use midi-qol only where runtime workflow context is required.
- Do not depend on showcase-community at runtime; use it as a modeling reference.

Current Heavy Hit design:
1. Main attack remains a normal attack activity.
2. Extra outcomes are emitted as separate activities.
3. The main attack carries midi-qol macro metadata.
4. The macro checks `attackTotal - targetAC >= 5`.
5. If the condition passes, it rolls `1dX` and triggers one branch activity.

This pattern is reusable for similar "conditional follow-up branch" monster features.

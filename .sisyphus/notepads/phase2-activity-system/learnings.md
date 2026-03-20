# Learnings

- Chinese regex patterns for D&D 5e actions:
  - Recharge: `\[充能\s*(\d+)(?:-(\d+))?\]`
  - AOE Target/Area: `(?:覆盖\s*)?(\d+)\s*尺(锥形|线形|球形|立方体|圆柱形)(?:区域)?`
  - Reach: `触及\s*(\d+)\s*尺`
  - Range: `射程\s*(\d+)(?:\s*\/\s*(\d+))?\s*尺`
  - Versatile Damage: `双手使用时(?:为|造成)?\s*\d+\s*\(([^)]+)\)`
  - Half Damage on Save: `豁免成功(?:则)?伤害减半`
  - Damage: `(\d+)\s*\(([^)]+)\)(?:点)?(.*?)伤害`

## Normalization Utility (2026-03-20)
- Created `src/core/parser/utils/normalize.ts` to handle Chinese punctuation normalization.
- Converts full-width punctuation (：, （, ）, ，, 。, ！, ？, ；, “, ”, ‘, ’, 【, 】) to half-width equivalents.
- Normalizes spaces by converting full-width spaces to half-width, replacing multiple spaces with a single space, and trimming.
- Verified with `npx bun test src/core/parser/__tests__/utils/normalize.test.ts`.
- Example: `命中：+5（钝击）` -> `命中:+5(钝击)`.

## ActionParser Updates (2026-03-20)
- Extracted `ActionData` and `Damage` interfaces to `src/core/models/action.ts` to avoid circular dependencies and improve organization.
- Updated `ActionData` to include `reach`, `versatile` (under `attack`), and `target` fields.
- Integrated `normalizeChineseText` and `CHINESE_ACTION_REGEX` into `ActionParser.parse()`.
- Successfully extracted `recharge`, `reach`, `range`, `versatile`, and `target` (AOE) from Chinese action descriptions.
- Verified with `npx bun test src/core/parser/__tests__/chinese-robustness.test.ts`.

## ActivityGenerator Updates (2026-03-20)
- Mapped `actionData.recharge` to `uses.recovery` and `uses.max` on the activity level.
- Mapped `actionData.target` to `target.template` with `type`, `size`, and `units`.
- Mapped `actionData.attack.reach` to `range.value` for melee attacks (`mwak`).
- Mapped `actionData.attack.versatile` to a versatile damage part using `formatDamage`.
- Verified with `npx bun test src/core/generator/__tests__/activity.test.ts`.

## End-to-End JSON Generation Verification
- Successfully verified the end-to-end JSON generation for complex Chinese monster actions.
- `uses.recovery` is correctly populated for recharge actions (e.g., `[充能 5-6]`).
- `target.template` is correctly populated for AOE actions (e.g., `覆盖 90 尺锥形区域`).
- `range.value` is correctly populated for reach actions (e.g., `触及10尺`).
- `versatile` damage is correctly populated for versatile weapons (e.g., `双手使用时为 17 (2d8+8) 挥砍伤害`).
- The generated JSON structure perfectly matches the expected dnd5e 4.3.x format.

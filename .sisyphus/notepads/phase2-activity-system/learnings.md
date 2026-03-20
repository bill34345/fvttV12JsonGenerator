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

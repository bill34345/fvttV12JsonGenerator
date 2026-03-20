export const CHINESE_ACTION_REGEX = {
  RECHARGE: /\[充能\s*(\d+)(?:-(\d+))?\]/,
  AOE: /(?:覆盖\s*)?(\d+)\s*尺(锥形|线形|球形|立方体|圆柱形)(?:区域)?/,
  REACH: /触及\s*(\d+)\s*尺/,
  RANGE: /射程\s*(\d+)(?:\s*\/\s*(\d+))?\s*尺/,
  VERSATILE_DAMAGE: /双手使用时(?:为|造成)?\s*\d+\s*\(([^)]+)\)/,
  HALF_DAMAGE_ON_SAVE: /豁免成功(?:则)?伤害减半/,
  DAMAGE: /(\d+)\s*\(([^)]+)\)(?:点)?(.*?)伤害/
};

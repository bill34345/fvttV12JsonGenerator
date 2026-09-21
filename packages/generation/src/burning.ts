import { isSafeConditionFormula } from '@fvtt-json-generator/contracts/conditions';
import { mapDamageType } from './actor-text';

const BURNING_TEXT = /\bburning\b|燃烧|燃燒/giu;
const DICE_FORMULA = /(?<![A-Za-z0-9])\d+d\d+(?:\s*[+-]\s*\d+)?/giu;
const DAMAGE_TYPE = /\b(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\b|酸蚀|強酸|强酸|钝击|寒冷|冷冻|火焰|力场|闪电|雷鸣|黯蚀|暗蚀|死灵|穿刺|毒素|毒性|心灵|光耀|挥砍/iu;
const OTHER_CONDITION = /\b(?:bleeding|frozen|jinxed|valor)\b|流血|冻结|凍結|厄运|厄運|英勇/iu;

export interface BurningSpecOverrides {
  formula?: string;
  damageType?: string;
}

export interface BurningSpec {
  formula: string;
  damageType: string;
  timing: 'turnStart' | 'turnEnd';
}

/**
 * Extract Burning only when the source explicitly pairs its formula and type
 * with the condition. It never borrows a hit's damage formula or type from
 * before the Burning clause.
 */
export function extractBurningSpec(text: string, overrides: BurningSpecOverrides = {}): BurningSpec | undefined {
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!source.trim()) return undefined;

  const formulaOverride = normalizeFormula(overrides.formula);
  const typeOverride = overrides.damageType === undefined ? undefined : normalizeDamageType(overrides.damageType);
  let formula = formulaOverride;
  let damageType = typeOverride;

  if ((!formula && overrides.formula === undefined) || (!damageType && overrides.damageType === undefined)) {
    const extracted = extractFormulaAndTypeNearBurning(source);
    formula ??= extracted?.formula;
    damageType ??= extracted?.damageType;
  }
  if (!formula || !damageType || !isSafeConditionFormula(formula)) return undefined;

  return { formula, damageType, timing: extractTimingForBurning(source) };
}

function extractFormulaAndTypeNearBurning(source: string): { formula: string; damageType: string } | undefined {
  for (const marker of source.matchAll(BURNING_TEXT)) {
    if (marker.index === undefined || !marker[0]) continue;
    const sentenceStart = Math.max(
      source.lastIndexOf('.', marker.index - 1),
      source.lastIndexOf('!', marker.index - 1),
      source.lastIndexOf('?', marker.index - 1),
      source.lastIndexOf('。', marker.index - 1),
      source.lastIndexOf(';', marker.index - 1),
      source.lastIndexOf('；', marker.index - 1),
      source.lastIndexOf('\n', marker.index - 1),
    ) + 1;
    const sentenceEnd = ['.', '!', '?', '。', ';', '；', '\n']
      .map((separator) => source.indexOf(separator, marker.index + marker[0].length))
      .filter((index) => index >= 0)
      .reduce((end, index) => Math.min(end, index), source.length);
    const sentence = source.slice(sentenceStart, sentenceEnd);
    const relativeMarkerEnd = marker.index + marker[0].length - sentenceStart;
    const tail = sentence.slice(relativeMarkerEnd);
    const nextCondition = tail.search(OTHER_CONDITION);
    const conditionClause = nextCondition < 0 ? tail : tail.slice(0, nextCondition);
    const formulaMatch = [...conditionClause.matchAll(DICE_FORMULA)][0];
    if (!formulaMatch?.[0] || formulaMatch.index === undefined) continue;
    const normalizedFormula = formulaMatch[0].replace(/\s+/g, '');
    if (!isSafeConditionFormula(normalizedFormula)) continue;
    const beforeFormula = conditionClause.slice(Math.max(0, formulaMatch.index - 40), formulaMatch.index);
    const nextFormula = [...conditionClause.slice(formulaMatch.index + formulaMatch[0].length).matchAll(DICE_FORMULA)][0];
    const nextFormulaIndex = nextFormula?.index;
    const afterFormulaEnd = nextFormulaIndex === undefined
      ? conditionClause.length
      : formulaMatch.index + formulaMatch[0].length + nextFormulaIndex;
    const afterFormula = conditionClause.slice(formulaMatch.index + formulaMatch[0].length, afterFormulaEnd);
    const typeMatch = afterFormula.match(DAMAGE_TYPE) ?? beforeFormula.match(DAMAGE_TYPE);
    if (!typeMatch?.[0]) continue;
    const damageType = normalizeDamageType(typeMatch[0]);
    if (!damageType) continue;
    return { formula: normalizedFormula, damageType };
  }
  return undefined;
}

function extractTimingForBurning(source: string): BurningSpec['timing'] {
  const marker = new RegExp(BURNING_TEXT.source, 'iu').exec(source);
  if (!marker || marker.index === undefined) return 'turnEnd';
  const sentenceStart = Math.max(
    source.lastIndexOf('.', marker.index - 1),
    source.lastIndexOf('!', marker.index - 1),
    source.lastIndexOf('?', marker.index - 1),
    source.lastIndexOf('。', marker.index - 1),
    source.lastIndexOf(';', marker.index - 1),
    source.lastIndexOf('；', marker.index - 1),
    source.lastIndexOf('\n', marker.index - 1),
  ) + 1;
  const sentenceEnd = ['.', '!', '?', '。', ';', '；', '\n']
    .map((separator) => source.indexOf(separator, marker.index + marker[0].length))
    .filter((index) => index >= 0)
    .reduce((end, index) => Math.min(end, index), source.length);
  const localRule = source.slice(Math.max(sentenceStart, marker.index - 100), sentenceEnd + 1);
  return extractTiming(localRule);
}

function extractTiming(source: string): BurningSpec['timing'] {
  const start = /(?:at|on)\s+(?:the\s+)?(?:start|beginning)\s+of\s+(?:(?:each|every)\s+(?:of\s+)?)?(?:its|their|the\s+target's|the\s+creature's|a\s+creature's|your)?\s*turns?|(?:each|every)\s+turn(?:'s)?\s+(?:start|beginning)|(?:每个|每一|其每个|目标每个|每)回合开始(?:时)?/giu;
  const end = /(?:at|on)\s+(?:the\s+)?(?:end|finish)\s+of\s+(?:(?:each|every)\s+(?:of\s+)?)?(?:its|their|the\s+target's|the\s+creature's|a\s+creature's|your)?\s*turns?|(?:each|every)\s+turn(?:'s)?\s+(?:end|finish)|(?:每个|每一|其每个|目标每个|每)回合结束(?:时)?/giu;
  const firstStart = start.exec(source)?.index ?? Number.POSITIVE_INFINITY;
  const firstEnd = end.exec(source)?.index ?? Number.POSITIVE_INFINITY;
  if (firstStart === Number.POSITIVE_INFINITY && firstEnd === Number.POSITIVE_INFINITY) return 'turnEnd';
  return firstStart < firstEnd ? 'turnStart' : 'turnEnd';
}

function normalizeFormula(value: string | undefined): string | undefined {
  const formula = value?.replace(/\s+/g, '').trim();
  return formula || undefined;
}

function normalizeDamageType(value: string): string | undefined {
  const type = mapDamageType(value.trim().toLowerCase());
  return type || undefined;
}

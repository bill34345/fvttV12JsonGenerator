import {
  buildConditionFlag,
  createConditionInstance,
  isSafeConditionFormula,
  type ConditionParams,
} from '@fvtt-json-generator/contracts/conditions';
import { mapDamageType } from './actor-text';

/**
 * Source-derived bleeding extraction for the Trigger Engine contract.
 *
 * A bleeding status can be described without a repeatable settlement rule.
 * This extractor therefore fails closed unless the source explicitly gives a
 * formula; an omitted timing uses the Drakkenheim turn-end default, while an
 * explicit source timing is preserved.
 */

const DICE_FORMULA = /(?<![A-Za-z0-9])\d+d\d+(?:\s*[+-]\s*\d+)?/gi;
const BLEEDING_TEXT = /\bbleed(?:ing)?\b|流血/iu;
const OTHER_PARAMETERIZED_CONDITION_TEXT = /\bburning\b|\bfrozen\b|\bjinxed\b|\bvalor\b|燃烧|燃燒|冻结|凍結|厄运|厄運|英勇/iu;
const ENGLISH_DAMAGE_TYPES = /\b(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\s+damage\b/iu;
const CHINESE_DAMAGE_TYPES = /(酸蚀|强酸|钝击|寒冷|冷冻|火焰|力场|闪电|雷鸣|黯蚀|暗蚀|死灵|穿刺|毒素|毒性|心灵|光耀|挥砍)伤害/u;

const TURN_TIMING_PATTERNS: Array<{ timing: GeneratedBleedingSpec['timing']; pattern: RegExp }> = [
  {
    timing: 'turnStart',
    pattern: /(?:at|on)\s+(?:the\s+)?(?:start|beginning)\s+of\s+(?:(?:each|every)\s+(?:of\s+)?)?(?:its|their|the\s+target's|the\s+creature's|a\s+creature's|your)?\s*turns?/giu,
  },
  { timing: 'turnStart', pattern: /(?:each|every)\s+turn(?:'s)?\s+(?:start|beginning)/giu },
  { timing: 'turnStart', pattern: /(?:每个|每一|其每个|目标每个|每)回合开始(?:时)?/gu },
  {
    timing: 'turnEnd',
    pattern: /(?:at|on)\s+(?:the\s+)?(?:end|finish)\s+of\s+(?:(?:each|every)\s+(?:of\s+)?)?(?:its|their|the\s+target's|the\s+creature's|a\s+creature's|your)?\s*turns?/giu,
  },
  { timing: 'turnEnd', pattern: /(?:each|every)\s+turn(?:'s)?\s+(?:end|finish)/giu },
  { timing: 'turnEnd', pattern: /(?:每个|每一|其每个|目标每个|每)回合结束(?:时)?/gu },
];

const BLEEDING_END_PATTERNS: RegExp[] = [
  /(?:若|如果)[^。.!?\n]*(?:结束|终止|解除|消失)[^。.!?\n]*(?:。|[.!?]|$)/u,
  /\b(?:if|when|unless)\b[^.!?\n]*(?:the\s+)?(?:effect|bleeding|wound)[^.!?\n]*(?:ends?|stops?|is\s+removed)[^.!?\n]*(?:[.!?]|$)/iu,
  /\b(?:the\s+)?(?:effect|bleeding|wound)\s+(?:ends?|stops?|is\s+removed)[^.!?\n]*(?:[.!?]|$)/iu,
];

export interface BleedingSpecOverrides {
  formula?: string;
  damageType?: string;
}

export interface BleedingSpec {
  schemaVersion: 1;
  formula: string;
  mode: 'damage' | 'hpLoss';
  damageType: string;
  stacking: 'highest';
  endOnHealing: boolean;
  endCondition: string;
}

export type GeneratedBleedingSpec = BleedingSpec & { timing: 'turnStart' | 'turnEnd' };

interface FormulaMatch {
  formula: string;
  index: number;
  end: number;
  conditionStart: number;
  conditionEnd: number;
}

interface TurnTimingEvidence {
  index: number;
  timing: GeneratedBleedingSpec['timing'];
}

export function buildBleedingFlag(spec: BleedingSpec): Record<string, Record<string, unknown>> {
  const validated = parseBleedingSpec(spec);
  const instance = createConditionInstance('bleeding', {
    formula: validated.formula,
    mode: validated.mode,
    damageType: validated.damageType,
    timing: (spec as GeneratedBleedingSpec).timing ?? 'turnEnd',
    stacking: validated.stacking,
    endOnHealing: validated.endOnHealing,
    endCondition: validated.endCondition,
  } satisfies ConditionParams, { instanceId: 'template-bleeding', template: true });
  return buildConditionFlag(instance);
}

/**
 * Extract a validated BleedingSpec from source prose.  `overrides` is only
 * for explicit structured fields such as EmbeddedEffect.damageFormula and
 * EmbeddedEffect.damageType; explicit source timing takes precedence over
 * the default turn-end settlement time.
 */
export function extractBleedingSpec(
  text: string,
  overrides: BleedingSpecOverrides = {},
): GeneratedBleedingSpec | undefined {
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!source.trim()) return undefined;

  const formulaOverride = normalizeFormula(overrides.formula);
  const formulaMatch = formulaOverride ? undefined : findBleedingFormula(source);
  const formula = formulaOverride ?? formulaMatch?.formula;
  if (!formula) return undefined;
  if (!BLEEDING_TEXT.test(source) && formulaOverride === undefined) return undefined;

  const sourceMention = formulaMatch ?? findFirstBleedingMention(source);
  const evidence = findNearbyBleedingTiming(source, sourceMention?.conditionStart, sourceMention?.conditionEnd);
  const anchorIndex = evidence?.index ?? formulaMatch?.index ?? 0;
  const context = source.slice(Math.max(0, anchorIndex - 320), Math.min(source.length, anchorIndex + 900));

  const damageType = overrides.damageType !== undefined
    ? normalizeExplicitDamageType(overrides.damageType)
    : formulaMatch ? extractBleedingDamageType(source, formulaMatch) : '';
  const modeStart = sourceMention?.conditionStart ?? Math.max(0, anchorIndex - 48);
  const modeEnd = formulaMatch ? formulaClauseEnd(source, formulaMatch) : Math.min(source.length, anchorIndex + 150);
  const modeEvidence = source.slice(modeStart, modeEnd);
  const explicitHpLoss = /(?:hit\s*points?|\bHP\b|生命值)[^.!?。\n]{0,100}(?:lose|lost|loss|reduce|减少|失去|扣除)|(?:lose|lost|loss|reduce|减少|失去|扣除)[^.!?。\n]{0,100}(?:hit\s*points?|\bHP\b|生命值)/iu.test(modeEvidence)
    || /(?:失去|扣除)[^。.!?\n]{0,80}(?:生命值|HP)|(?:生命值|HP)[^。.!?\n]{0,80}(?:失去|扣除)/iu.test(modeEvidence);
  const explicitDamage = /\bdamage\b|伤害/iu.test(modeEvidence);
  const mode: BleedingSpec['mode'] = explicitHpLoss ? 'hpLoss' : (explicitDamage || Boolean(damageType)) ? 'damage' : 'hpLoss';
  const endCondition = extractEndCondition(context);
  const timing = evidence?.timing ?? 'turnEnd';
  const spec: GeneratedBleedingSpec = {
    schemaVersion: 1,
    formula,
    mode,
    damageType,
    stacking: 'highest',
    endOnHealing: true,
    endCondition,
    timing,
  };

  try {
    return { ...parseBleedingSpec(spec), timing };
  } catch {
    return undefined;
  }
}

export function parseBleedingSpec(value: unknown): BleedingSpec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Bleeding must be an object.');
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1) throw new TypeError('Unsupported bleeding schemaVersion.');
  if (typeof input.formula !== 'string' || !isSafeConditionFormula(input.formula)) throw new TypeError('Invalid bleeding formula.');
  if (input.mode !== 'damage' && input.mode !== 'hpLoss') throw new TypeError('Invalid bleeding mode.');
  if (typeof input.damageType !== 'string' || !/^[a-z]*$/u.test(input.damageType)) throw new TypeError('Invalid bleeding damage type.');
  if (input.mode === 'hpLoss' && input.damageType) throw new TypeError('HP loss cannot have a damage type.');
  if (input.stacking !== 'highest' && !['stack', 'replace', 'ignore', 'unspecified'].includes(String(input.stacking))) throw new TypeError('Invalid bleeding stacking policy.');
  if (typeof input.endOnHealing !== 'boolean' || typeof input.endCondition !== 'string' || input.endCondition.length > 4000) throw new TypeError('Invalid bleeding end condition.');
  return {
    schemaVersion: 1,
    formula: input.formula.trim(),
    mode: input.mode,
    damageType: input.damageType,
    stacking: 'highest',
    endOnHealing: input.endOnHealing,
    endCondition: input.endCondition,
  };
}

/** Return true when the source contains a matching die reserved for timed bleeding. */
export function hasDelayedBleedingFormula(text: string, formula: string): boolean {
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  const normalizedFormula = normalizeFormula(formula);
  if (!normalizedFormula) return false;
  return findBleedingFormula(source)?.formula === normalizedFormula;
}

function findNearbyBleedingTiming(
  source: string,
  conditionStart?: number,
  conditionEnd?: number,
): TurnTimingEvidence | undefined {
  if (conditionStart === undefined || conditionEnd === undefined) return undefined;
  const candidates: TurnTimingEvidence[] = [];
  for (const { timing, pattern } of TURN_TIMING_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      if (match.index === undefined || !match[0]) continue;
      const index = match.index;
      if (index < conditionStart) {
        const between = source.slice(index, conditionStart);
        if (/[.!?。；;\n]/u.test(between) || conditionStart - index > 100) continue;
      } else {
        const between = source.slice(conditionEnd, index);
        if (OTHER_PARAMETERIZED_CONDITION_TEXT.test(between) || index - conditionEnd > 260) continue;
      }
      candidates.push({ index, timing });
    }
  }

  return candidates.sort((left, right) =>
    Math.abs(left.index - conditionEnd) - Math.abs(right.index - conditionEnd) || left.index - right.index,
  )[0];
}

function findBleedingFormula(text: string): FormulaMatch | undefined {
  const candidates = [...text.matchAll(DICE_FORMULA)].flatMap((match) => {
    if (match.index === undefined || !match[0]) return [];
    const index = match.index;
    const end = index + match[0].length;
    const condition = findNearestBleedingMentionBefore(text, index);
    if (!condition) return [];
    const conditionDistance = index - condition.end;
    if (conditionDistance > 260) return [];
    const between = text.slice(condition.end, index);
    if (OTHER_PARAMETERIZED_CONDITION_TEXT.test(between)) return [];
    if (/[.!?。；;\n]/u.test(between) && !containsExplicitTurnTiming(between)) return [];

    const formula: FormulaMatch = {
      formula: match[0].replace(/\s+/g, ''),
      index,
      end,
      conditionStart: condition.start,
      conditionEnd: condition.end,
    };
    const timing = findNearbyBleedingTiming(text, condition.start, condition.end);
    const timingDistance = timing ? Math.abs(timing.index - (formula.index + formula.end) / 2) : Number.POSITIVE_INFINITY;
    return [{ formula, conditionDistance, timingRank: timing ? 0 : 1, timingDistance }];
  });

  candidates.sort((left, right) =>
    left.timingRank - right.timingRank
    || left.timingDistance - right.timingDistance
    || left.conditionDistance - right.conditionDistance
    || left.formula.index - right.formula.index,
  );
  return candidates[0]?.formula;
}

function findNearestBleedingMentionBefore(text: string, formulaIndex: number): { start: number; end: number } | undefined {
  const mentions = [...text.matchAll(new RegExp(BLEEDING_TEXT.source, `${BLEEDING_TEXT.flags}g`))]
    .flatMap((match) => match.index === undefined || match.index >= formulaIndex
      ? []
      : [{ start: match.index, end: match.index + match[0].length }])
    .filter((mention) => !OTHER_PARAMETERIZED_CONDITION_TEXT.test(text.slice(mention.end, formulaIndex)));
  return mentions.sort((left, right) => right.end - left.end)[0];
}

function findFirstBleedingMention(text: string): { conditionStart: number; conditionEnd: number } | undefined {
  const match = new RegExp(BLEEDING_TEXT.source, BLEEDING_TEXT.flags).exec(text);
  if (!match || match.index === undefined) return undefined;
  return { conditionStart: match.index, conditionEnd: match.index + match[0].length };
}

function extractBleedingDamageType(source: string, formula: FormulaMatch): string {
  const typeEvidence = source.slice(formula.conditionEnd, formulaClauseEnd(source, formula));
  const english = typeEvidence.match(ENGLISH_DAMAGE_TYPES)?.[1];
  if (english) return mapDamageType(english);
  const chinese = typeEvidence.match(CHINESE_DAMAGE_TYPES)?.[1];
  return chinese ? mapDamageType(chinese) : '';
}

function containsExplicitTurnTiming(text: string): boolean {
  return TURN_TIMING_PATTERNS.some(({ pattern }) =>
    new RegExp(pattern.source, pattern.flags.replace('g', '')).test(text),
  );
}

function formulaClauseEnd(source: string, formula: FormulaMatch): number {
  const candidates = ['.', '!', '?', '。', ';', '；', '\n']
    .map((separator) => source.indexOf(separator, formula.end))
    .filter((index) => index >= 0);
  const nextFormula = [...source.slice(formula.end).matchAll(DICE_FORMULA)][0];
  const nextCondition = [...source.slice(formula.end).matchAll(new RegExp(OTHER_PARAMETERIZED_CONDITION_TEXT.source, `${OTHER_PARAMETERIZED_CONDITION_TEXT.flags}g`))][0];
  if (nextFormula?.index !== undefined) candidates.push(formula.end + nextFormula.index);
  if (nextCondition?.index !== undefined) candidates.push(formula.end + nextCondition.index);
  return candidates.length ? Math.min(...candidates) : source.length;
}

function normalizeFormula(value: string | undefined): string | undefined {
  const formula = value?.replace(/\s+/g, '').trim();
  return formula || undefined;
}

function normalizeExplicitDamageType(value: string): string {
  const normalized = mapDamageType(value);
  return normalized || '';
}

function extractEndCondition(context: string): string {
  for (const pattern of BLEEDING_END_PATTERNS) {
    const match = context.match(pattern);
    if (match?.[0]) return cleanSourceText(match[0]);
  }
  return '';
}

function cleanSourceText(value: string): string {
  return value
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

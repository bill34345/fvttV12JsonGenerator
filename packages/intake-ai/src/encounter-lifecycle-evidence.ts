import type { StatusLifecycleParameters } from '@fvtt-json-generator/contracts/status-lifecycle';

/** Selection-only provenance; never part of the executable runtime parameters. */
export interface LifecycleSourceEvidence {
  application: string;
  duration: string;
  repeatSave: string;
  timing: string;
  optionality: string;
  removal: string;
}

const EVIDENCE_KEYS = ['application', 'duration', 'repeatSave', 'timing', 'optionality', 'removal'] as const;
export function decodeLifecycleSourceEvidence(value: unknown): LifecycleSourceEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Status lifecycle source evidence must be plain data.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== EVIDENCE_KEYS.length
    || Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !EVIDENCE_KEYS.includes(key as any)
      || !descriptors[key]?.enumerable || !('value' in descriptors[key]!))) throw new TypeError('Status lifecycle source evidence contains missing or unsupported fields.');
  const result = {} as LifecycleSourceEvidence;
  for (const key of EVIDENCE_KEYS) {
    const text = descriptors[key]!.value;
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new TypeError('Status lifecycle source evidence must contain bounded verbatim excerpts.');
    result[key] = text;
  }
  return result;
}

const EN_NUMBERS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
const EN_NUMBER_PATTERN = new RegExp(`\\b(?:${Object.keys(EN_NUMBERS).join('|')})(?:[ -]+(?:${Object.keys(EN_NUMBERS).join('|')}))*\\b`, 'giu');
const ZH_DIGITS: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function sourceNumbers(text: string): number[] {
  const numbers: number[] = [];
  const normalized = text.replace(/[０-９]/gu, char => String(char.charCodeAt(0) - 0xff10));
  if (/[+−-]\s*\d|\b(?:minus|negative)\b|负/iu.test(normalized)) return [NaN];
  // Word/dice boundaries prevent DC 13 from matching 130 or a damage die.
  // A terminal full stop is punctuation; a dot followed by a digit is decimal.
  for (const match of normalized.matchAll(/(?<![a-z\d.])\d+(?:\.\d+)?(?![a-z\d]|\.\d)/giu)) numbers.push(Number(match[0]));
  for (const match of normalized.matchAll(/\bDC\s*(\d+(?:\.\d+)?)(?![a-z\d]|\.\d)/giu)) numbers.push(Number(match[1]));
  for (const match of normalized.matchAll(EN_NUMBER_PATTERN)) {
    let total = 0;
    for (const word of match[0].toLowerCase().split(/[ -]+/u)) total = word === 'hundred' ? Math.max(total, 1) * 100 : total + EN_NUMBERS[word]!;
    numbers.push(total);
  }
  for (const match of normalized.matchAll(/[零〇一二两三四五六七八九十百]+/gu)) {
    const token = match[0]; let total = 0; let digit = 0;
    for (const char of token) {
      if (char === '十' || char === '百') { total += (digit || 1) * (char === '十' ? 10 : 100); digit = 0; }
      else digit = ZH_DIGITS[char]!;
    }
    numbers.push(total + digit);
  }
  return [...new Set(numbers)];
}

const ABILITIES: Record<string, RegExp> = {
  str: /\b(?:strength|STR)\b|力量/iu, dex: /\b(?:dexterity|DEX)\b|敏捷/iu, con: /\b(?:constitution|CON)\b|体质/iu,
  int: /\b(?:intelligence|INT)\b|智力/iu, wis: /\b(?:wisdom|WIS)\b|感知/iu, cha: /\b(?:charisma|CHA)\b|魅力/iu,
};

/** Mechanical grounding only. Complete-source semantic review remains mandatory. */
export function assertLifecycleSourceEvidence(quote: string, evidence: LifecycleSourceEvidence, parameters: StatusLifecycleParameters, sourceNames: string[]): void {
  for (const excerpt of Object.values(evidence)) {
    const at = quote.indexOf(excerpt);
    if (at < 0 || quote.indexOf(excerpt, at + 1) >= 0) throw new TypeError('Status lifecycle evidence must uniquely belong to the same complete feature quote.');
  }
  const names = sourceNames.filter(name => name && (/[\p{Script=Han}]/u.test(name)
    ? evidence.application.toLocaleLowerCase('en-US').includes(name.toLocaleLowerCase('en-US'))
    : new RegExp(`(?<![a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![a-z0-9])`, 'iu').test(evidence.application)));
  if (!names.length) throw new TypeError('Status lifecycle application evidence lacks the selected registered status name.');
  const minute = /\bminutes?\b|分钟/iu.test(evidence.duration);
  const round = /\brounds?\b|轮/iu.test(evidence.duration);
  const durationNumbers = sourceNumbers(evidence.duration);
  if (!durationNumbers.length && /\b(?:a|an) minute\b|\b(?:a|an) round\b/iu.test(evidence.duration)) durationNumbers.push(1);
  if (minute === round || (minute ? 'minute' : 'round') !== parameters.duration.unit
    || durationNumbers.length !== 1 || durationNumbers[0] !== parameters.duration.value) throw new TypeError('Status lifecycle duration evidence differs from the normalized value or unit.');
  const dcNumbers = sourceNumbers(evidence.repeatSave);
  const abilities = Object.entries(ABILITIES).filter(([, expression]) => expression.test(evidence.repeatSave)).map(([ability]) => ability);
  if (dcNumbers.length !== 1 || dcNumbers[0] !== parameters.repeatSave.dc || abilities.length !== 1 || abilities[0] !== parameters.repeatSave.ability) {
    throw new TypeError('Status lifecycle repeat-save evidence differs from the normalized DC or ability.');
  }
}

/**
 * Browser safe condition contracts shared by the generator and the Foundry
 * custom-conditions module. The contract deliberately contains data only.
 */
export const CONDITION_SCHEMA_VERSION = 1 as const;
export const CUSTOM_CONDITIONS_MODULE_ID = 'fvtt-custom-conditions' as const;
export const CONDITION_FLAG = 'condition' as const;

export const CUSTOM_CONDITION_IDS = [
  'addled',
  'bewildered',
  'bleeding',
  'burning',
  'clumsy',
  'dazed',
  'defenseless',
  'distracted',
  'enfeebled',
  'frozen',
  'helpless',
  'immobilized',
  'jinxed',
  'shocked',
  'sickened',
  'slowed',
  'staggered',
  'valor',
  'weakened',
] as const;

export type ConditionId = (typeof CUSTOM_CONDITION_IDS)[number];
export type ConditionValue = string | number | boolean;
export type ConditionParams = Record<string, ConditionValue>;
export type ConditionStacking = 'highest' | 'stack' | 'replace' | 'ignore' | 'unspecified';
export type ConditionTiming = 'none' | 'turnStart' | 'turnEnd' | 'documentUpdate';

export interface ConditionParameterDefinition {
  id: string;
  label: string;
  type: 'formula' | 'number' | 'select' | 'boolean' | 'text';
  required?: boolean;
  default?: ConditionValue;
  options?: readonly string[];
  min?: number;
  max?: number;
  maxLength?: number;
}

export interface ConditionDefinition {
  id: ConditionId;
  label: string;
  icon: string;
  description: string;
  timing: ConditionTiming;
  parameters: readonly ConditionParameterDefinition[];
  defaultStacking: ConditionStacking;
  composite?: readonly ConditionId[];
  generatedTemplate: boolean;
}

export interface ConditionInstance {
  schemaVersion: typeof CONDITION_SCHEMA_VERSION;
  instanceId: string;
  conditionId: ConditionId;
  params: ConditionParams;
  enabled: boolean;
  /** True for an Item ActiveEffect template that has not been applied to an Actor. */
  template?: boolean;
  source?: string;
  origin?: string;
  createdAt?: number;
}

const FORMULA_PARAMETER = (id: string, label: string): ConditionParameterDefinition => ({
  id, label, type: 'formula', required: true, maxLength: 200,
});

const END_CONDITION_PARAMETER: ConditionParameterDefinition = {
  id: 'endCondition', label: '结束条件', type: 'text', maxLength: 4000, default: '',
};

export const CONDITION_DEFINITIONS: Readonly<Record<ConditionId, ConditionDefinition>> = {
  addled: {
    id: 'addled', label: 'Addled', icon: 'systems/dnd5e/icons/svg/statuses/stunned.svg',
    description: 'Intelligence、Wisdom、Charisma 的攻击、属性检定与豁免检定具有劣势。',
    timing: 'none', parameters: [], defaultStacking: 'replace', generatedTemplate: true,
  },
  bewildered: {
    id: 'bewildered', label: 'Bewildered', icon: 'systems/dnd5e/icons/svg/statuses/stunned.svg',
    description: '不能施法，仅可施放施法时间为 1 Action 的 cantrip。',
    timing: 'none', parameters: [], defaultStacking: 'replace', generatedTemplate: true,
  },
  bleeding: {
    id: 'bleeding', label: 'Bleeding', icon: 'systems/dnd5e/icons/svg/statuses/bleeding.svg',
    description: '默认在自身回合结束时失去参数 X 点生命值；同一目标只保留数值最高的一项。',
    timing: 'turnEnd', parameters: [
      FORMULA_PARAMETER('formula', '每次结算的骰式 X'),
      { id: 'mode', label: '结算方式', type: 'select', required: true, default: 'hpLoss', options: ['damage', 'hpLoss'] },
      { id: 'damageType', label: '伤害类型', type: 'text', default: '', maxLength: 32 },
      { id: 'timing', label: '结算时机', type: 'select', required: true, default: 'turnEnd', options: ['turnStart', 'turnEnd'] },
      { id: 'stacking', label: '重复施加（固定保留最高值）', type: 'select', required: true, default: 'highest', options: ['highest'] },
      { id: 'endOnHealing', label: '恢复生命值后解除', type: 'boolean', required: true, default: true },
      END_CONDITION_PARAMETER,
    ], defaultStacking: 'highest', generatedTemplate: true,
  },
  burning: {
    id: 'burning', label: 'Burning', icon: 'systems/dnd5e/icons/svg/statuses/burning.svg',
    description: '默认在自身回合结束时受到指定骰式与伤害类型的伤害；同一目标只保留数值最高的一项。',
    timing: 'turnEnd', parameters: [
      FORMULA_PARAMETER('formula', '每次结算的骰式 X'),
      { id: 'damageType', label: '伤害类型', type: 'text', required: true, maxLength: 32 },
      { id: 'timing', label: '结算时机', type: 'select', required: true, default: 'turnEnd', options: ['turnStart', 'turnEnd'] },
      { id: 'stacking', label: '重复施加（固定保留最高值）', type: 'select', required: true, default: 'highest', options: ['highest'] },
      END_CONDITION_PARAMETER,
    ], defaultStacking: 'highest', generatedTemplate: true,
  },
  clumsy: {
    id: 'clumsy', label: 'Clumsy', icon: 'systems/dnd5e/icons/svg/statuses/encumbered.svg',
    description: 'Dexterity 的攻击、属性检定与豁免检定具有劣势。',
    timing: 'none', parameters: [], defaultStacking: 'replace', generatedTemplate: true,
  },
  dazed: {
    id: 'dazed', label: 'Dazed', icon: 'systems/dnd5e/icons/svg/statuses/stunned.svg',
    description: '自己的回合中只能在移动和执行 Action 之间选择一个，且不能执行 Bonus Action。',
    timing: 'none', parameters: [], defaultStacking: 'replace', generatedTemplate: true,
  },
  defenseless: {
    id: 'defenseless', label: 'Defenseless', icon: 'systems/dnd5e/icons/svg/statuses/cursed.svg',
    description: '针对你的攻击检定具有优势。',
    timing: 'none', parameters: [], defaultStacking: 'replace', generatedTemplate: true,
  },
  distracted: {
    id: 'distracted', label: 'Distracted', icon: 'systems/dnd5e/icons/svg/statuses/cursed.svg',
    description: '不能执行 Reaction。',
    timing: 'none', parameters: [], defaultStacking: 'replace', generatedTemplate: true,
  },
  enfeebled: {
    id: 'enfeebled', label: 'Enfeebled', icon: 'systems/dnd5e/icons/svg/statuses/encumbered.svg',
    description: 'Strength 的攻击、属性检定与豁免检定具有劣势。',
    timing: 'none', parameters: [], defaultStacking: 'replace', generatedTemplate: true,
  },
  frozen: {
    id: 'frozen', label: 'Frozen', icon: 'systems/dnd5e/icons/svg/statuses/restrained.svg',
    description: '同时获得 Immobilized 与 Defenseless；对使用钝击伤害武器的攻击还视为 Helpless。',
    timing: 'none', parameters: [
      { id: 'escapeDC', label: '解除 DC', type: 'number', required: true, min: 1, max: 50 },
      { id: 'breakDamage', label: '钝击或火焰累计伤害', type: 'number', required: true, default: 20, min: 1, max: 1000 },
      { id: 'breakDamageTaken', label: '已累计钝击或火焰伤害', type: 'number', required: false, default: 0, min: 0, max: 1000 },
      END_CONDITION_PARAMETER,
    ], defaultStacking: 'replace', composite: ['immobilized', 'defenseless'], generatedTemplate: true,
  },
  helpless: {
    id: 'helpless', label: 'Helpless', icon: 'systems/dnd5e/icons/svg/statuses/incapacitated.svg',
    description: '任何命中你的攻击都算 Critical Hit。',
    timing: 'none', parameters: [], defaultStacking: 'replace', generatedTemplate: true,
  },
  immobilized: {
    id: 'immobilized', label: 'Immobilized', icon: 'systems/dnd5e/icons/svg/statuses/restrained.svg',
    description: 'Speed 变为 0，且不能受益于任何速度加值。飞行中的目标会坠落。',
    timing: 'none', parameters: [], defaultStacking: 'replace', generatedTemplate: true,
  },
  jinxed: {
    id: 'jinxed', label: 'Jinxed', icon: 'systems/dnd5e/icons/svg/statuses/cursed.svg',
    description: '每次进行攻击检定或豁免检定时，额外掷 X 并从结果中减去该骰值。',
    timing: 'none', parameters: [FORMULA_PARAMETER('formula', '惩罚骰式 X')], defaultStacking: 'replace', generatedTemplate: true,
  },
  shocked: {
    id: 'shocked', label: 'Shocked', icon: 'systems/dnd5e/icons/svg/statuses/stunned.svg',
    description: '同时视为 Dazed 与 Defenseless，并立刻掉落手中物品。拿取或拔出物品需要 1 Action。',
    timing: 'none', parameters: [], defaultStacking: 'replace', composite: ['dazed', 'defenseless'], generatedTemplate: true,
  },
  sickened: {
    id: 'sickened', label: 'Sickened', icon: 'systems/dnd5e/icons/svg/statuses/poisoned.svg',
    description: 'Constitution 豁免检定具有劣势。',
    timing: 'none', parameters: [], defaultStacking: 'replace', generatedTemplate: true,
  },
  slowed: {
    id: 'slowed', label: 'Slowed', icon: 'systems/dnd5e/icons/svg/statuses/encumbered.svg',
    description: 'Speed 减半。',
    timing: 'none', parameters: [], defaultStacking: 'replace', generatedTemplate: true,
  },
  staggered: {
    id: 'staggered', label: 'Staggered', icon: 'systems/dnd5e/icons/svg/statuses/prone.svg',
    description: '自己的回合内最多只能进行一次 weapon attack。',
    timing: 'none', parameters: [], defaultStacking: 'replace', generatedTemplate: true,
  },
  valor: {
    id: 'valor', label: 'Valor', icon: 'systems/dnd5e/icons/svg/statuses/marked.svg',
    description: '将条件指定的骰加入攻击检定与豁免检定。',
    timing: 'none', parameters: [FORMULA_PARAMETER('formula', '加值骰式 X')], defaultStacking: 'replace', generatedTemplate: true,
  },
  weakened: {
    id: 'weakened', label: 'Weakened', icon: 'systems/dnd5e/icons/svg/statuses/encumbered.svg',
    description: '武器攻击与法术造成的伤害减半。',
    timing: 'none', parameters: [], defaultStacking: 'replace', generatedTemplate: true,
  },
};

export function getConditionDefinition(id: string): ConditionDefinition | undefined {
  return isConditionId(id) ? CONDITION_DEFINITIONS[id] : undefined;
}

export function isConditionId(value: unknown): value is ConditionId {
  return typeof value === 'string' && (CUSTOM_CONDITION_IDS as readonly string[]).includes(value);
}

export function isSafeConditionFormula(value: string): boolean {
  if (!value || value.length > 200) return false;
  const text = value.replace(/\s+/g, '').toLowerCase();
  const tokens = text.match(/\d+d\d+|\d+(?:\.\d+)?|[()+*/-]/g);
  if (!tokens || tokens.join('') !== text) return false;
  const tokenList = tokens;
  let index = 0;
  let diceCount = 0;
  function atom(): boolean {
    if (tokenList[index] === '+' || tokenList[index] === '-') index += 1;
    const token = tokenList[index++];
    if (token === '(') return expression() && tokenList[index++] === ')';
    if (!token) return false;
    const dice = /^(\d+)d(\d+)$/.exec(token);
    if (dice) {
      const count = Number(dice[1]);
      const faces = Number(dice[2]);
      diceCount += count;
      return Number.isSafeInteger(count) && count >= 1 && diceCount <= 1000
        && Number.isSafeInteger(faces) && faces >= 1 && faces <= 100000;
    }
    return /^\d+(?:\.\d+)?$/.test(token) && Number.isFinite(Number(token));
  }
  function term(): boolean {
    if (!atom()) return false;
    while (tokenList[index] === '*' || tokenList[index] === '/') { index += 1; if (!atom()) return false; }
    return true;
  }
  function expression(): boolean {
    if (!term()) return false;
    while (tokenList[index] === '+' || tokenList[index] === '-') { index += 1; if (!term()) return false; }
    return true;
  }
  return expression() && index === tokenList.length;
}

/**
 * Calculate exact expected value for the supported linear subset of safe dice
 * formulas. Each die is replaced with its arithmetic mean; addition,
 * subtraction, scalar multiplication and scalar division preserve expectation.
 * Products or divisors involving random terms are unsupported and return
 * undefined so callers can report that the formulas could not be ordered.
 */
export function expectedConditionFormulaValue(formula: string): number | undefined {
  if (!isSafeConditionFormula(formula)) return undefined;
  const text = formula.replace(/\s+/g, '').toLowerCase();
  const tokens = text.match(/\d+d\d+|\d+(?:\.\d+)?|[()+*/-]/g);
  if (!tokens) return undefined;
  const tokenList = tokens;

  interface ExpectedTerm { value: number; random: boolean; }
  let index = 0;
  const finite = (value: number): number | undefined => Number.isFinite(value) ? value : undefined;

  function atom(): ExpectedTerm | undefined {
    let sign = 1;
    if (tokenList[index] === '+' || tokenList[index] === '-') {
      if (tokenList[index] === '-') sign = -1;
      index += 1;
    }

    const token = tokenList[index++];
    if (token === '(') {
      const nested = expression();
      if (!nested || tokenList[index++] !== ')') return undefined;
      const value = finite(sign * nested.value);
      return value === undefined ? undefined : { value, random: nested.random };
    }

    if (!token) return undefined;
    const dice = /^(\d+)d(\d+)$/.exec(token);
    const value = dice
      ? Number(dice[1]) * (Number(dice[2]) + 1) / 2
      : Number(token);
    const signed = finite(sign * value);
    return signed === undefined ? undefined : { value: signed, random: Boolean(dice) };
  }

  function term(): ExpectedTerm | undefined {
    let left = atom();
    if (!left) return undefined;
    while (tokenList[index] === '*' || tokenList[index] === '/') {
      const operator = tokenList[index++];
      const right = atom();
      if (!right) return undefined;
      if (operator === '*' && left.random && right.random) return undefined;
      if (operator === '/' && (right.random || right.value === 0)) return undefined;
      const value = finite(operator === '*' ? left.value * right.value : left.value / right.value);
      if (value === undefined) return undefined;
      left = { value, random: left.random || right.random };
    }
    return left;
  }

  function expression(): ExpectedTerm | undefined {
    let left = term();
    if (!left) return undefined;
    while (tokenList[index] === '+' || tokenList[index] === '-') {
      const operator = tokenList[index++];
      const right = term();
      if (!right) return undefined;
      const value = finite(operator === '+' ? left.value + right.value : left.value - right.value);
      if (value === undefined) return undefined;
      left = { value, random: left.random || right.random };
    }
    return left;
  }

  const result = expression();
  return result && index === tokenList.length ? result.value : undefined;
}

/** Compare formula strength by expected value; undefined means unsupported. */
export function compareConditionFormulaStrength(left: string, right: string): -1 | 0 | 1 | undefined {
  const leftValue = expectedConditionFormulaValue(left);
  const rightValue = expectedConditionFormulaValue(right);
  if (leftValue === undefined || rightValue === undefined) return undefined;
  const tolerance = Number.EPSILON * 16 * Math.max(1, Math.abs(leftValue), Math.abs(rightValue));
  if (Math.abs(leftValue - rightValue) <= tolerance) return 0;
  return leftValue > rightValue ? 1 : -1;
}

export function parseConditionInstance(input: unknown): ConditionInstance {
  if (!isRecord(input)) throw new TypeError('Condition instance must be an object.');
  if (input.schemaVersion !== CONDITION_SCHEMA_VERSION) throw new TypeError('Unsupported condition schemaVersion.');
  const instanceId = readIdentifier(input.instanceId, 'instanceId');
  if (!isConditionId(input.conditionId)) throw new TypeError('Unknown custom condition ID.');
  const definition = CONDITION_DEFINITIONS[input.conditionId];
  if (!isRecord(input.params)) throw new TypeError('Condition params must be an object.');
  const params: ConditionParams = {};
  for (const parameter of definition.parameters) {
    const supplied = input.params[parameter.id];
    const fixedHighest = (input.conditionId === 'bleeding' || input.conditionId === 'burning')
      && parameter.id === 'stacking'
      && (supplied === undefined || ['highest', 'stack', 'replace', 'ignore', 'unspecified'].includes(String(supplied)));
    const raw = fixedHighest ? 'highest' : supplied ?? parameter.default;
    if (raw === undefined && parameter.required) throw new TypeError(`Missing condition parameter: ${parameter.id}.`);
    if (raw === undefined) continue;
    validateParameter(parameter, raw);
    params[parameter.id] = raw;
  }
  for (const key of Object.keys(input.params)) {
    if (!definition.parameters.some((parameter) => parameter.id === key)) throw new TypeError(`Unknown condition parameter: ${key}.`);
  }
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new TypeError('Condition enabled must be a boolean.');
  const source = optionalString(input.source, 'source');
  const origin = optionalString(input.origin, 'origin');
  const createdAt = input.createdAt === undefined ? undefined : finiteNumber(input.createdAt, 'createdAt');
  return {
    schemaVersion: CONDITION_SCHEMA_VERSION,
    instanceId,
    conditionId: input.conditionId,
    params,
    enabled: input.enabled ?? true,
    ...(input.template === true ? { template: true } : {}),
    ...(source ? { source } : {}),
    ...(origin ? { origin } : {}),
    ...(createdAt === undefined ? {} : { createdAt }),
  };
}

export function createConditionInstance(conditionId: ConditionId, params: ConditionParams, options: Partial<Omit<ConditionInstance, 'schemaVersion' | 'conditionId' | 'params'>> = {}): ConditionInstance {
  return parseConditionInstance({
    schemaVersion: CONDITION_SCHEMA_VERSION,
    instanceId: options.instanceId ?? randomInstanceId(),
    conditionId,
    params,
    enabled: options.enabled ?? true,
    ...(options.template ? { template: true } : {}),
    ...(options.source ? { source: options.source } : {}),
    ...(options.origin ? { origin: options.origin } : {}),
    ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
  });
}

export function readConditionInstance(document: any): ConditionInstance | undefined {
  const value = document?.flags?.[CUSTOM_CONDITIONS_MODULE_ID]?.[CONDITION_FLAG];
  if (value === undefined) return undefined;
  try { return parseConditionInstance(value); } catch { return undefined; }
}

export function buildConditionFlag(instance: ConditionInstance): Record<string, Record<string, ConditionInstance>> {
  const value = parseConditionInstance(instance);
  return { [CUSTOM_CONDITIONS_MODULE_ID]: { [CONDITION_FLAG]: value } };
}

function validateParameter(parameter: ConditionParameterDefinition, value: unknown): asserts value is ConditionValue {
  if (parameter.type === 'formula') {
    if (typeof value !== 'string' || !isSafeConditionFormula(value)) throw new TypeError(`Invalid formula for ${parameter.id}.`);
  } else if (parameter.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (parameter.min !== undefined && value < parameter.min) || (parameter.max !== undefined && value > parameter.max)) throw new TypeError(`Invalid number for ${parameter.id}.`);
  } else if (parameter.type === 'select') {
    if (typeof value !== 'string' || !parameter.options?.includes(value)) throw new TypeError(`Invalid option for ${parameter.id}.`);
  } else if (parameter.type === 'boolean') {
    if (typeof value !== 'boolean') throw new TypeError(`Invalid boolean for ${parameter.id}.`);
  } else if (typeof value !== 'string' || (parameter.maxLength !== undefined && value.length > parameter.maxLength)) {
    throw new TypeError(`Invalid text for ${parameter.id}.`);
  }
}

function readIdentifier(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(value)) throw new TypeError(`Invalid ${path}.`);
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 4000) throw new TypeError(`Invalid ${path}.`);
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`Invalid ${path}.`);
  return value;
}

function randomInstanceId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random?.replace(/-/g, '').slice(0, 32) ?? `condition-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

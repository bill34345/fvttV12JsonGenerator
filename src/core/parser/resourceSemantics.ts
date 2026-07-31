import type {
  ActorResourceActivation,
  ActorResourceBinding,
  ActorResourceDefinition,
  ActorResourceDerived,
  ActorResourceItemRef,
  ActorResourceMutation,
  ActorResourceOperation,
  ActorResourceRecovery,
  ActorResourceSection,
  ActorResourceSemantics,
  ActorResourceTransition,
} from '../models/resource';

const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;
const SAFE_FORMULA = /^(?:\d+|\d+d\d+(?:\s*[+-]\s*\d+)?)$/i;
const SECTIONS = new Set<ActorResourceSection>(['特性', '动作', '附赠动作', '反应', '传奇动作']);
const ACTIVATIONS = new Set<ActorResourceActivation>(['special', 'action', 'bonus', 'reaction']);
const RECOVERIES = new Set<ActorResourceRecovery>(['none', 'lr', 'sr', 'day']);
const DAMAGE_TYPES = new Set([
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
]);

function fail(path: string, message: string): never {
  throw new Error(`InvalidResourceSemantics: ${path}: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'expected an object');
  }
  return value as Record<string, unknown>;
}

function exactKeys(raw: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(raw)) {
    if (!allowedSet.has(key)) fail(`${path}.${key}`, 'unknown field');
  }
}

function list(value: unknown, path: string, required = false): unknown[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) fail(path, 'expected an array');
  if (required && value.length === 0) fail(path, 'must not be empty');
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'expected a non-empty string');
  return value.trim();
}

function optionalText(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : text(value, path);
}

function integer(value: unknown, path: string, min = 0): number {
  if (!Number.isInteger(value) || Number(value) < min) {
    fail(path, `expected an integer >= ${min}`);
  }
  return Number(value);
}

function boolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') fail(path, 'expected a boolean');
  return value;
}

function id(value: unknown, path: string): string {
  const result = text(value, path);
  if (!SAFE_ID.test(result)) fail(path, 'must match /^[a-z0-9][a-z0-9-]*$/');
  return result;
}

function unique(value: string, seen: Set<string>, path: string): void {
  if (seen.has(value)) fail(path, `duplicate ID "${value}"`);
  seen.add(value);
}

function enumValue<T extends string>(value: unknown, values: Set<T>, path: string): T {
  const result = text(value, path) as T;
  if (!values.has(result)) fail(path, `unsupported value "${result}"`);
  return result;
}

function itemRef(value: unknown, path: string): ActorResourceItemRef {
  const raw = record(value, path);
  exactKeys(raw, ['分区', '名称'], path);
  return {
    section: enumValue(raw['分区'], SECTIONS, `${path}.分区`),
    name: text(raw['名称'], `${path}.名称`),
  };
}

function parseOperation(value: unknown, path: string, seen: Set<string>): ActorResourceOperation {
  const raw = record(value, path);
  exactKeys(raw, ['ID', '名称', '英文名', '激活', '模式', '数量', '条件'], path);
  const operationId = id(raw.ID, `${path}.ID`);
  unique(operationId, seen, `${path}.ID`);
  const mode = enumValue(
    raw['模式'],
    new Set<ActorResourceOperation['mode']>(['gain', 'spend', 'clear', 'restoreAll']),
    `${path}.模式`,
  );
  const amount = raw['数量'] === undefined ? undefined : integer(raw['数量'], `${path}.数量`, 1);
  if ((mode === 'gain' || mode === 'spend') && amount === undefined) {
    fail(`${path}.数量`, `${mode} requires an amount`);
  }
  if ((mode === 'clear' || mode === 'restoreAll') && amount !== undefined) {
    fail(`${path}.数量`, `${mode} must not declare an amount`);
  }
  return {
    id: operationId,
    name: text(raw['名称'], `${path}.名称`),
    englishName: optionalText(raw['英文名'], `${path}.英文名`),
    activation: enumValue(raw['激活'], ACTIVATIONS, `${path}.激活`),
    mode,
    amount,
    condition: optionalText(raw['条件'], `${path}.条件`),
  };
}

function parseDerived(
  value: unknown,
  path: string,
  resourceMax: number,
  seen: Set<string>,
): ActorResourceDerived {
  const raw = record(value, path);
  exactKeys(raw, ['ID', '类型', '档位'], path);
  const derivedId = id(raw.ID, `${path}.ID`);
  unique(derivedId, seen, `${path}.ID`);
  const type = enumValue(raw['类型'], new Set<ActorResourceDerived['type']>(['ac']), `${path}.类型`);
  const tiers = list(raw['档位'], `${path}.档位`, true).map((entry, index) => {
    const tierPath = `${path}.档位[${index}]`;
    const tier = record(entry, tierPath);
    exactKeys(tier, ['最小', '最大', '值'], tierPath);
    const min = integer(tier['最小'], `${tierPath}.最小`);
    const max = integer(tier['最大'], `${tierPath}.最大`);
    if (max < min) fail(tierPath, 'maximum must be >= minimum');
    return { min, max, value: integer(tier['值'], `${tierPath}.值`, 1) };
  }).sort((left, right) => left.min - right.min);
  let expected = 0;
  for (const tier of tiers) {
    if (tier.min !== expected) fail(`${path}.档位`, `tiers must cover 0..${resourceMax} without gaps or overlap`);
    expected = tier.max + 1;
  }
  if (expected !== resourceMax + 1) {
    fail(`${path}.档位`, `tiers must cover 0..${resourceMax} without gaps or overlap`);
  }
  return { id: derivedId, type, tiers };
}

function parseResource(
  value: unknown,
  path: string,
  resourceIds: Set<string>,
  operationIds: Set<string>,
  derivedIds: Set<string>,
): ActorResourceDefinition {
  const raw = record(value, path);
  exactKeys(raw, ['ID', '名称', '英文名', '载体', '初始', '最大', '恢复', '操作', '派生'], path);
  const resourceId = id(raw.ID, `${path}.ID`);
  unique(resourceId, resourceIds, `${path}.ID`);
  const max = integer(raw['最大'], `${path}.最大`, 1);
  const initial = integer(raw['初始'], `${path}.初始`);
  if (initial > max) fail(`${path}.初始`, 'must not exceed maximum');
  return {
    id: resourceId,
    name: text(raw['名称'], `${path}.名称`),
    englishName: optionalText(raw['英文名'], `${path}.英文名`),
    carrier: itemRef(raw['载体'], `${path}.载体`),
    initial,
    max,
    recovery: enumValue(raw['恢复'], RECOVERIES, `${path}.恢复`),
    operations: list(raw['操作'], `${path}.操作`).map((entry, index) =>
      parseOperation(entry, `${path}.操作[${index}]`, operationIds)),
    derived: list(raw['派生'], `${path}.派生`).map((entry, index) =>
      parseDerived(entry, `${path}.派生[${index}]`, max, derivedIds)),
  };
}

function parseBinding(
  value: unknown,
  path: string,
  resourceIds: Set<string>,
  bindingIds: Set<string>,
  resources: Map<string, ActorResourceDefinition>,
): ActorResourceBinding {
  const raw = record(value, path);
  exactKeys(raw, ['ID', '资源', '来源', '模式', '数量', '最小', '最大', '可选', '额外活动', '缩放'], path);
  const bindingId = id(raw.ID, `${path}.ID`);
  unique(bindingId, bindingIds, `${path}.ID`);
  const resourceId = id(raw['资源'], `${path}.资源`);
  if (!resourceIds.has(resourceId)) fail(`${path}.资源`, `unknown resource "${resourceId}"`);
  const resource = resources.get(resourceId)!;
  const mode = enumValue(raw['模式'], new Set<ActorResourceBinding['mode']>(['fixed', 'variable']), `${path}.模式`);
  const result: ActorResourceBinding = {
    id: bindingId,
    resourceId,
    source: itemRef(raw['来源'], `${path}.来源`),
    mode,
  };
  if (mode === 'fixed') {
    result.amount = integer(raw['数量'], `${path}.数量`, 1);
    if (result.amount > resource.max) fail(`${path}.数量`, 'must not exceed resource maximum');
  } else {
    result.min = integer(raw['最小'], `${path}.最小`, 1);
    result.max = integer(raw['最大'], `${path}.最大`, 1);
    if (result.min !== 1 || result.max < result.min || result.max > resource.max) {
      fail(path, 'the current native amount-scaling contract requires 1 = min <= max <= resource maximum');
    }
    result.optional = boolean(raw['可选'], `${path}.可选`);
    if (raw['额外活动'] !== undefined) {
      const supplemental = record(raw['额外活动'], `${path}.额外活动`);
      exactKeys(supplemental, ['名称', '英文名'], `${path}.额外活动`);
      result.supplementalActivity = {
        name: text(supplemental['名称'], `${path}.额外活动.名称`),
        englishName: optionalText(supplemental['英文名'], `${path}.额外活动.英文名`),
      };
    }
    if (result.optional !== true || !result.supplementalActivity) {
      fail(path, 'the current variable binding contract requires 可选: true and a distinct supplemental Activity');
    }
  }
  if (raw['缩放'] !== undefined) {
    const scaling = record(raw['缩放'], `${path}.缩放`);
    exactKeys(scaling, ['伤害', '范围'], `${path}.缩放`);
    result.scaling = {};
    if (scaling['伤害'] !== undefined) {
      const damage = record(scaling['伤害'], `${path}.缩放.伤害`);
      exactKeys(damage, ['基础', '每额外层', '类型'], `${path}.缩放.伤害`);
      const base = text(damage['基础'], `${path}.缩放.伤害.基础`);
      const perStep = text(damage['每额外层'], `${path}.缩放.伤害.每额外层`);
      if (!SAFE_FORMULA.test(base) || !SAFE_FORMULA.test(perStep)) {
        fail(`${path}.缩放.伤害`, 'damage formulas must be a positive integer or a simple dice formula');
      }
      const damageType = text(damage['类型'], `${path}.缩放.伤害.类型`).toLowerCase();
      if (!DAMAGE_TYPES.has(damageType)) fail(`${path}.缩放.伤害.类型`, 'unsupported damage type');
      result.scaling.damage = { base, perStep, type: damageType };
    }
    if (scaling['范围'] !== undefined) {
      const range = record(scaling['范围'], `${path}.缩放.范围`);
      exactKeys(range, ['基础', '每额外层'], `${path}.缩放.范围`);
      result.scaling.range = {
        base: integer(range['基础'], `${path}.缩放.范围.基础`, 1),
        perStep: integer(range['每额外层'], `${path}.缩放.范围.每额外层`, 1),
      };
    }
    if (!result.scaling.damage && !result.scaling.range) fail(`${path}.缩放`, 'must declare damage or range scaling');
  }
  return result;
}

function parseMutation(
  value: unknown,
  path: string,
  resourceIds: Set<string>,
): ActorResourceMutation {
  const raw = record(value, path);
  exactKeys(raw, ['类型', '资源', '目标', '模式', '数量'], path);
  const type = enumValue(raw['类型'], new Set<ActorResourceMutation['type']>(['resource', 'itemUses']), `${path}.类型`);
  const amount = integer(raw['数量'], `${path}.数量`, 1);
  if (type === 'resource') {
    const resourceId = id(raw['资源'], `${path}.资源`);
    if (!resourceIds.has(resourceId)) fail(`${path}.资源`, `unknown resource "${resourceId}"`);
    return {
      type,
      resourceId,
      mode: enumValue(raw['模式'], new Set(['spend', 'gain'] as const), `${path}.模式`),
      amount,
    };
  }
  return {
    type,
    target: itemRef(raw['目标'], `${path}.目标`),
    mode: enumValue(raw['模式'], new Set(['spend', 'recover'] as const), `${path}.模式`),
    amount,
  };
}

function parseTransition(
  value: unknown,
  path: string,
  resourceIds: Set<string>,
  transitionIds: Set<string>,
): ActorResourceTransition {
  const raw = record(value, path);
  exactKeys(raw, ['ID', '名称', '英文名', '载体', '激活', '条件', '变化'], path);
  const transitionId = id(raw.ID, `${path}.ID`);
  unique(transitionId, transitionIds, `${path}.ID`);
  return {
    id: transitionId,
    name: text(raw['名称'], `${path}.名称`),
    englishName: optionalText(raw['英文名'], `${path}.英文名`),
    carrier: itemRef(raw['载体'], `${path}.载体`),
    activation: enumValue(raw['激活'], ACTIVATIONS, `${path}.激活`),
    condition: optionalText(raw['条件'], `${path}.条件`),
    mutations: list(raw['变化'], `${path}.变化`, true).map((entry, index) =>
      parseMutation(entry, `${path}.变化[${index}]`, resourceIds)),
  };
}

export function parseActorResourceSemantics(value: unknown): ActorResourceSemantics {
  const raw = record(value, '资源机制');
  exactKeys(raw, ['资源', '消费', '转换'], '资源机制');
  const resourceIds = new Set<string>();
  const operationIds = new Set<string>();
  const derivedIds = new Set<string>();
  const bindingIds = new Set<string>();
  const transitionIds = new Set<string>();
  const resources = list(raw['资源'], '资源机制.资源', true).map((entry, index) =>
    parseResource(entry, `资源机制.资源[${index}]`, resourceIds, operationIds, derivedIds));
  const resourceMap = new Map(resources.map((resource) => [resource.id, resource]));
  const bindings = list(raw['消费'], '资源机制.消费').map((entry, index) =>
    parseBinding(entry, `资源机制.消费[${index}]`, resourceIds, bindingIds, resourceMap));
  const transitions = list(raw['转换'], '资源机制.转换').map((entry, index) =>
    parseTransition(entry, `资源机制.转换[${index}]`, resourceIds, transitionIds));
  return { resources, bindings, transitions };
}

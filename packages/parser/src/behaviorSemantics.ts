import type {
  ActorBehaviorCapacity,
  ActorBehaviorChoicePool,
  ActorBehaviorEffectChange,
  ActorBehaviorExecutionMode,
  ActorBehaviorExpressionCoverage,
  ActorBehaviorFrequency,
  ActorBehaviorKind,
  ActorBehaviorMechanic,
  ActorBehaviorOperation,
  ActorBehaviorOperationKind,
  ActorBehaviorReference,
  ActorBehaviorRuleSource,
  ActorBehaviorSemantics,
  ActorBehaviorState,
  ActorBehaviorTrigger,
} from '@fvtt-json-generator/models/behavior';
import type {
  ActorResourceActivation,
  ActorResourceItemRef,
  ActorResourceSection,
} from '@fvtt-json-generator/models/resource';

const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;
const SAFE_CHANGE_KEY = /^system\.[A-Za-z0-9_.]+$/;
const SECTIONS = new Set<ActorResourceSection>(['特性', '动作', '附赠动作', '反应', '传奇动作']);
const ACTIVATIONS = new Set<ActorResourceActivation>(['special', 'action', 'bonus', 'reaction']);
const KINDS = new Set<ActorBehaviorKind>([
  'relation', 'lifecycle', 'trigger', 'stage', 'capacity', 'choicePool', 'area', 'externalRule',
]);
const COVERAGE = new Set<ActorBehaviorExpressionCoverage>(['structured', 'literal', 'missing']);
const EXECUTION = new Set<ActorBehaviorExecutionMode>([
  'automatic', 'core-operable', 'gm-assisted', 'external-rule',
]);
const RULE_SOURCES = new Set<ActorBehaviorRuleSource>([
  'schema-derived', 'source-derived', 'corpus-derived',
]);
const EVENTS = new Set<ActorBehaviorTrigger['event']>([
  'turnStart', 'turnEnd', 'damageTaken', 'attackHit', 'attackMiss', 'saveSuccess',
  'saveFailure', 'hpThreshold', 'enterArea', 'leaveArea', 'activityUsed', 'manual',
]);
const FREQUENCIES = new Set<ActorBehaviorFrequency>([
  'unlimited', 'oncePerTurn', 'oncePerRound', 'oncePerEncounter', 'firstOccurrence',
]);
const OPERATION_KINDS = new Set<ActorBehaviorOperationKind>([
  'apply', 'remove', 'forward', 'choose', 'consume', 'reset', 'mark', 'move',
  'template', 'manual',
]);
const STATUSES = new Set([
  'blinded', 'charmed', 'deafened', 'diseased', 'exhaustion', 'frightened',
  'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
  'prone', 'restrained', 'stunned', 'unconscious',
]);

function fail(path: string, message: string): never {
  throw new Error(`InvalidBehaviorSemantics: ${path}: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
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
  if (!Number.isInteger(value) || Number(value) < min) fail(path, `expected an integer >= ${min}`);
  return Number(value);
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'expected a boolean');
  return value;
}

function enumValue<T extends string>(value: unknown, values: Set<T>, path: string): T {
  const result = text(value, path) as T;
  if (!values.has(result)) fail(path, `unsupported value "${result}"`);
  return result;
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

function strings(value: unknown, path: string): string[] {
  return list(value, path).map((entry, index) => text(entry, `${path}[${index}]`));
}

function ids(value: unknown, path: string): string[] {
  const seen = new Set<string>();
  return list(value, path).map((entry, index) => {
    const result = id(entry, `${path}[${index}]`);
    unique(result, seen, `${path}[${index}]`);
    return result;
  });
}

function itemRef(value: unknown, path: string): ActorResourceItemRef {
  const raw = record(value, path);
  exactKeys(raw, ['分区', '名称'], path);
  return {
    section: enumValue(raw['分区'], SECTIONS, `${path}.分区`),
    name: text(raw['名称'], `${path}.名称`),
  };
}

function parseTrigger(value: unknown, path: string): ActorBehaviorTrigger | undefined {
  if (value === undefined) return undefined;
  const raw = record(value, path);
  exactKeys(raw, ['事件', '频率', '条件'], path);
  return {
    event: enumValue(raw['事件'], EVENTS, `${path}.事件`),
    frequency: enumValue(raw['频率'], FREQUENCIES, `${path}.频率`),
    condition: optionalText(raw['条件'], `${path}.条件`),
  };
}

function parseReference(
  value: unknown,
  path: string,
  seen: Set<string>,
): ActorBehaviorReference {
  const raw = record(value, path);
  exactKeys(raw, ['ID', '角色', '项目'], path);
  const referenceId = id(raw.ID, `${path}.ID`);
  unique(referenceId, seen, `${path}.ID`);
  return {
    id: referenceId,
    role: text(raw['角色'], `${path}.角色`),
    item: itemRef(raw['项目'], `${path}.项目`),
  };
}

function parseChange(value: unknown, path: string): ActorBehaviorEffectChange {
  const raw = record(value, path);
  exactKeys(raw, ['键', '模式', '值', '阶段'], path);
  const key = text(raw['键'], `${path}.键`);
  if (!SAFE_CHANGE_KEY.test(key)) fail(`${path}.键`, 'must be a system.* data path');
  const mode = integer(raw['模式'], `${path}.模式`) as 2 | 5;
  if (mode !== 2 && mode !== 5) fail(`${path}.模式`, 'only add (2) and override (5) are supported');
  const phase = raw['阶段'] === undefined
    ? undefined
    : enumValue(raw['阶段'], new Set(['initial', 'final'] as const), `${path}.阶段`);
  return { key, mode, value: text(raw['值'], `${path}.值`), phase };
}

function parseState(value: unknown, path: string, seen: Set<string>): ActorBehaviorState {
  const raw = record(value, path);
  exactKeys(raw, ['ID', '名称', '英文名', '目标', '状态', '变化', '持续', '解除'], path);
  const stateId = id(raw.ID, `${path}.ID`);
  unique(stateId, seen, `${path}.ID`);
  const statuses = strings(raw['状态'], `${path}.状态`);
  for (const [index, status] of statuses.entries()) {
    if (!STATUSES.has(status)) fail(`${path}.状态[${index}]`, `unsupported dnd5e status "${status}"`);
  }
  let duration: ActorBehaviorState['duration'];
  if (raw['持续'] !== undefined) {
    const durationRaw = record(raw['持续'], `${path}.持续`);
    exactKeys(durationRaw, ['轮', '回合', '秒', '特殊'], `${path}.持续`);
    duration = {
      rounds: durationRaw['轮'] === undefined ? undefined : integer(durationRaw['轮'], `${path}.持续.轮`, 1),
      turns: durationRaw['回合'] === undefined ? undefined : integer(durationRaw['回合'], `${path}.持续.回合`, 1),
      seconds: durationRaw['秒'] === undefined ? undefined : integer(durationRaw['秒'], `${path}.持续.秒`, 1),
      special: optionalText(durationRaw['特殊'], `${path}.持续.特殊`),
    };
    if (!duration.rounds && !duration.turns && !duration.seconds && !duration.special) {
      fail(`${path}.持续`, 'must declare a duration');
    }
  }
  return {
    id: stateId,
    name: text(raw['名称'], `${path}.名称`),
    englishName: optionalText(raw['英文名'], `${path}.英文名`),
    target: enumValue(raw['目标'], new Set(['self', 'selected'] as const), `${path}.目标`),
    statuses,
    changes: list(raw['变化'], `${path}.变化`).map((entry, index) =>
      parseChange(entry, `${path}.变化[${index}]`)),
    duration,
    removal: strings(raw['解除'], `${path}.解除`),
  };
}

function parseTemplate(value: unknown, path: string): ActorBehaviorOperation['template'] {
  if (value === undefined) return undefined;
  const raw = record(value, path);
  exactKeys(raw, ['形状', '尺寸', '宽度', '单位'], path);
  return {
    shape: enumValue(
      raw['形状'],
      new Set(['cone', 'cube', 'cylinder', 'line', 'radius', 'sphere'] as const),
      `${path}.形状`,
    ),
    size: integer(raw['尺寸'], `${path}.尺寸`, 1),
    width: raw['宽度'] === undefined ? undefined : integer(raw['宽度'], `${path}.宽度`, 1),
    units: enumValue(raw['单位'], new Set(['ft'] as const), `${path}.单位`),
  };
}

function parseOperation(value: unknown, path: string, seen: Set<string>): ActorBehaviorOperation {
  const raw = record(value, path);
  exactKeys(raw, ['ID', '名称', '英文名', '激活', '类型', '状态', '引用', '说明', '模板'], path);
  const operationId = id(raw.ID, `${path}.ID`);
  unique(operationId, seen, `${path}.ID`);
  return {
    id: operationId,
    name: text(raw['名称'], `${path}.名称`),
    englishName: optionalText(raw['英文名'], `${path}.英文名`),
    activation: enumValue(raw['激活'], ACTIVATIONS, `${path}.激活`),
    kind: enumValue(raw['类型'], OPERATION_KINDS, `${path}.类型`),
    stateIds: ids(raw['状态'], `${path}.状态`),
    referenceIds: ids(raw['引用'], `${path}.引用`),
    description: text(raw['说明'], `${path}.说明`),
    template: parseTemplate(raw['模板'], `${path}.模板`),
  };
}

function parseCapacity(value: unknown, path: string): ActorBehaviorCapacity | undefined {
  if (value === undefined) return undefined;
  const raw = record(value, path);
  exactKeys(raw, ['槽位', '体型限制', '逃脱DC', '获取', '释放'], path);
  return {
    slots: integer(raw['槽位'], `${path}.槽位`, 1),
    sizeLimit: optionalText(raw['体型限制'], `${path}.体型限制`),
    escapeDc: raw['逃脱DC'] === undefined ? undefined : integer(raw['逃脱DC'], `${path}.逃脱DC`, 1),
    acquire: text(raw['获取'], `${path}.获取`),
    release: text(raw['释放'], `${path}.释放`),
  };
}

function parseChoicePool(value: unknown, path: string): ActorBehaviorChoicePool | undefined {
  if (value === undefined) return undefined;
  const raw = record(value, path);
  exactKeys(raw, ['选择数', '互异', '重置', '候选'], path);
  const optionIds = new Set<string>();
  const options = list(raw['候选'], `${path}.候选`, true).map((entry, index) => {
    const optionPath = `${path}.候选[${index}]`;
    const option = record(entry, optionPath);
    exactKeys(option, ['ID', '名称', '英文名', '说明'], optionPath);
    const optionId = id(option.ID, `${optionPath}.ID`);
    unique(optionId, optionIds, `${optionPath}.ID`);
    return {
      id: optionId,
      name: text(option['名称'], `${optionPath}.名称`),
      englishName: optionalText(option['英文名'], `${optionPath}.英文名`),
      description: text(option['说明'], `${optionPath}.说明`),
    };
  });
  const choose = integer(raw['选择数'], `${path}.选择数`, 1);
  if (choose > options.length) fail(`${path}.选择数`, 'must not exceed candidate count');
  return {
    choose,
    distinct: boolean(raw['互异'], `${path}.互异`),
    reset: enumValue(
      raw['重置'],
      new Set(['turnStart', 'turnEnd', 'shortRest', 'longRest', 'manual'] as const),
      `${path}.重置`,
    ),
    options,
  };
}

function parseExternalRule(
  value: unknown,
  path: string,
): ActorBehaviorMechanic['externalRule'] {
  if (value === undefined) return undefined;
  const raw = record(value, path);
  exactKeys(raw, ['名称', 'DC', '属性', '结果'], path);
  return {
    name: text(raw['名称'], `${path}.名称`),
    dc: raw.DC === undefined ? undefined : integer(raw.DC, `${path}.DC`, 1),
    ability: raw['属性'] === undefined
      ? undefined
      : enumValue(raw['属性'], new Set(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const), `${path}.属性`),
    result: text(raw['结果'], `${path}.结果`),
  };
}

function parseMechanic(
  value: unknown,
  path: string,
  mechanicIds: Set<string>,
  globalReferenceIds: Set<string>,
  globalStateIds: Set<string>,
  globalOperationIds: Set<string>,
): ActorBehaviorMechanic {
  const raw = record(value, path);
  exactKeys(raw, [
    'ID', '类型', '名称', '英文名', '载体', '表达覆盖', '执行模式', '规则来源', '触发',
    '条件', '引用', '状态', '操作', 'GM步骤', '容量', '选择池', '外部规则',
  ], path);
  const mechanicId = id(raw.ID, `${path}.ID`);
  unique(mechanicId, mechanicIds, `${path}.ID`);
  const kind = enumValue(raw['类型'], KINDS, `${path}.类型`);
  const coverage = enumValue(raw['表达覆盖'], COVERAGE, `${path}.表达覆盖`);
  const executionMode = enumValue(raw['执行模式'], EXECUTION, `${path}.执行模式`);
  const references = list(raw['引用'], `${path}.引用`).map((entry, index) =>
    parseReference(entry, `${path}.引用[${index}]`, globalReferenceIds));
  const states = list(raw['状态'], `${path}.状态`).map((entry, index) =>
    parseState(entry, `${path}.状态[${index}]`, globalStateIds));
  const operations = list(raw['操作'], `${path}.操作`).map((entry, index) =>
    parseOperation(entry, `${path}.操作[${index}]`, globalOperationIds));
  const referenceIds = new Set(references.map((entry) => entry.id));
  const stateIds = new Set(states.map((entry) => entry.id));
  for (const [operationIndex, operation] of operations.entries()) {
    for (const stateId of operation.stateIds) {
      if (!stateIds.has(stateId)) {
        fail(`${path}.操作[${operationIndex}].状态`, `unknown local state "${stateId}"`);
      }
    }
    for (const referenceId of operation.referenceIds) {
      if (!referenceIds.has(referenceId)) {
        fail(`${path}.操作[${operationIndex}].引用`, `unknown local reference "${referenceId}"`);
      }
    }
  }
  const gmSteps = strings(raw['GM步骤'], `${path}.GM步骤`);
  const capacity = parseCapacity(raw['容量'], `${path}.容量`);
  const choicePool = parseChoicePool(raw['选择池'], `${path}.选择池`);
  const externalRule = parseExternalRule(raw['外部规则'], `${path}.外部规则`);
  if (kind === 'capacity' && !capacity) fail(`${path}.容量`, 'capacity mechanics require 容量');
  if (kind !== 'capacity' && capacity) fail(`${path}.容量`, 'only capacity mechanics may declare 容量');
  if (kind === 'choicePool' && !choicePool) fail(`${path}.选择池`, 'choicePool mechanics require 选择池');
  if (kind !== 'choicePool' && choicePool) fail(`${path}.选择池`, 'only choicePool mechanics may declare 选择池');
  if (kind === 'externalRule' && !externalRule) fail(`${path}.外部规则`, 'externalRule mechanics require 外部规则');
  if (executionMode === 'external-rule' && !externalRule) fail(`${path}.外部规则`, 'external-rule mode requires 外部规则');
  if ((executionMode === 'gm-assisted' || executionMode === 'external-rule') && gmSteps.length === 0) {
    fail(`${path}.GM步骤`, `${executionMode} mechanics require explicit GM steps`);
  }
  if (executionMode === 'automatic') {
    fail(`${path}.执行模式`, 'automatic behavior requires a separately verified runtime projector and is not supported by core');
  }
  if (coverage === 'missing') fail(`${path}.表达覆盖`, 'declared behavior may not be missing');
  if (coverage === 'structured' && operations.length === 0 && states.length === 0 && !capacity && !choicePool) {
    fail(path, 'structured behavior requires an operation, state, capacity, or choice pool');
  }
  return {
    id: mechanicId,
    kind,
    name: text(raw['名称'], `${path}.名称`),
    englishName: optionalText(raw['英文名'], `${path}.英文名`),
    carrier: itemRef(raw['载体'], `${path}.载体`),
    coverage,
    executionMode,
    ruleSource: enumValue(raw['规则来源'], RULE_SOURCES, `${path}.规则来源`),
    trigger: parseTrigger(raw['触发'], `${path}.触发`),
    conditions: strings(raw['条件'], `${path}.条件`),
    references,
    states,
    operations,
    gmSteps,
    capacity,
    choicePool,
    externalRule,
  };
}

export function parseActorBehaviorSemantics(value: unknown): ActorBehaviorSemantics {
  const raw = record(value, '行为机制');
  exactKeys(raw, ['版本', '机制'], '行为机制');
  if (raw['版本'] !== 1) fail('行为机制.版本', 'only schema version 1 is supported');
  const mechanicIds = new Set<string>();
  const referenceIds = new Set<string>();
  const stateIds = new Set<string>();
  const operationIds = new Set<string>();
  return {
    schemaVersion: 1,
    mechanics: list(raw['机制'], '行为机制.机制', true).map((entry, index) =>
      parseMechanic(
        entry,
        `行为机制.机制[${index}]`,
        mechanicIds,
        referenceIds,
        stateIds,
        operationIds,
      )),
  };
}

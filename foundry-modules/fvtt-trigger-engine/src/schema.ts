import {
  TRIGGER_SCHEMA_VERSION,
  type ConditionGroup,
  type ConditionOperand,
  type ComparisonOperator,
  type JsonValue,
  type MacroAction,
  type TriggerCondition,
  type TriggerDefinition,
  type TriggerEvent,
  type TriggerStore,
} from './types.ts';

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ParsedTrigger {
  success: boolean;
  data?: TriggerDefinition;
  issues: ValidationIssue[];
}

export interface ParsedTriggerStore {
  success: boolean;
  data: TriggerStore;
  issues: ValidationIssue[];
}

const VALID_OPERATORS = new Set<ComparisonOperator>(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']);
const PATH_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.(?:[A-Za-z_$][A-Za-z0-9_$]*|[0-9]+))*$/;

export const DEFAULT_TRIGGER_STORE: TriggerStore = {
  schemaVersion: TRIGGER_SCHEMA_VERSION,
  triggers: [],
};

/**
 * Parse and normalize one trigger.  The parser returns no data on failure so
 * callers cannot accidentally pass a malformed definition to the runtime.
 */
export function parseTriggerDefinition(input: unknown): ParsedTrigger {
  const issues: ValidationIssue[] = [];
  const value = parseJsonInput(input, 'trigger', issues);
  if (!isRecord(value)) {
    issues.push({ path: 'trigger', message: 'must be an object' });
    return { success: false, issues };
  }

  const id = readString(value.id, 'id', issues, { trim: true, nonEmpty: true });
  const name = readString(value.name, 'name', issues, { trim: true, nonEmpty: true });
  const enabled = value.enabled;
  if (typeof enabled !== 'boolean') issues.push({ path: 'enabled', message: 'must be a boolean' });

  const event = parseEvent(value.event, issues);
  const conditions = parseConditionGroup(value.conditions, issues);
  const actions = parseActions(value.actions, issues);

  if (issues.length || id === undefined || name === undefined || event === undefined || actions === undefined) {
    return { success: false, issues };
  }
  return {
    success: true,
    data: {
      id,
      name,
      enabled,
      event,
      conditions,
      actions,
    },
    issues: [],
  };
}

/** Throwing form for API and persistence boundaries. */
export function validateTriggerDefinition(input: unknown): TriggerDefinition {
  const parsed = parseTriggerDefinition(input);
  if (!parsed.success || !parsed.data) throw validationError('trigger', parsed.issues);
  return parsed.data;
}

export function isValidTriggerDefinition(input: unknown): input is TriggerDefinition {
  return parseTriggerDefinition(input).success;
}

/** Backwards-friendly alias for callers that use predicate naming. */
export const isTriggerDefinition = isValidTriggerDefinition;

/**
 * Parse the world setting. Invalid trigger entries are omitted from `data`
 * and returned as issues. This is the runtime's fail-closed loading path.
 */
export function parseTriggerStore(input: unknown): ParsedTriggerStore {
  const issues: ValidationIssue[] = [];
  const value = parseJsonInput(input, 'store', issues);
  if (!isRecord(value)) {
    issues.push({ path: 'store', message: 'must be an object' });
    return { success: false, data: cloneTriggerStore(DEFAULT_TRIGGER_STORE), issues };
  }
  if (value.schemaVersion !== TRIGGER_SCHEMA_VERSION) {
    issues.push({ path: 'schemaVersion', message: `must be ${TRIGGER_SCHEMA_VERSION}` });
    return { success: false, data: cloneTriggerStore(DEFAULT_TRIGGER_STORE), issues };
  }
  if (!Array.isArray(value.triggers)) {
    issues.push({ path: 'triggers', message: 'must be an array' });
    return { success: false, data: cloneTriggerStore(DEFAULT_TRIGGER_STORE), issues };
  }

  const triggers: TriggerDefinition[] = [];
  const seenIds = new Set<string>();
  for (const [index, candidate] of value.triggers.entries()) {
    const parsed = parseTriggerDefinition(candidate);
    if (!parsed.success || !parsed.data) {
      for (const issue of parsed.issues) issues.push({ path: `triggers[${index}].${issue.path}`, message: issue.message });
      continue;
    }
    if (seenIds.has(parsed.data.id)) {
      issues.push({ path: `triggers[${index}].id`, message: `duplicate trigger ID: ${parsed.data.id}` });
      continue;
    }
    seenIds.add(parsed.data.id);
    triggers.push(parsed.data);
  }
  return {
    success: issues.length === 0,
    data: { schemaVersion: TRIGGER_SCHEMA_VERSION, triggers },
    issues,
  };
}

export function sanitizeTriggerStore(input: unknown): { store: TriggerStore; issues: ValidationIssue[] } {
  const parsed = parseTriggerStore(input);
  return { store: parsed.data, issues: parsed.issues };
}

/** Read valid definitions while recording fields a schema-1 rewrite would discard. */
export function inspectStoredTriggerStore(input: unknown): { store: TriggerStore; issues: ValidationIssue[] } {
  const parsed = sanitizeTriggerStore(input);
  return { store: parsed.store, issues: [...parsed.issues, ...unsupportedStoredFields(input)] };
}

function unsupportedStoredFields(input: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let value = input;
  if (typeof value === 'string') {
    try { value = JSON.parse(value) as unknown; } catch { return issues; }
  }
  try {
    const check = (object: unknown, allowed: readonly string[], path: string): void => {
      if (!isRecord(object)) return;
      for (const key of Reflect.ownKeys(object)) {
        const field = typeof key === 'string' ? key : String(key);
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (!descriptor || !('value' in descriptor) || typeof key !== 'string' || !allowed.includes(key)) {
          issues.push({ path: `${path}.${field}`, message: 'unsupported or non-data field would be lost on save' });
        }
      }
    };
    if (!isRecord(value)) return issues;
    check(value, ['schemaVersion', 'triggers'], 'store');
    if (!Array.isArray(value.triggers)) return issues;
    value.triggers.forEach((candidate: unknown, index: number) => {
      const path = `triggers[${index}]`;
      if (!isRecord(candidate)) return;
      check(candidate, ['id', 'name', 'enabled', 'event', 'conditions', 'actions'], path);
      const event = candidate.event;
      if (isRecord(event)) check(event,
        event.type === 'documentUpdate' ? ['type', 'documentType', 'watchedPaths'] : ['type', 'documentType'],
        `${path}.event`);
      const conditions = candidate.conditions;
      if (isRecord(conditions)) {
        check(conditions, ['mode', 'conditions'], `${path}.conditions`);
        if (Array.isArray(conditions.conditions)) conditions.conditions.forEach((condition: unknown, conditionIndex: number) => {
          const conditionPath = `${path}.conditions.conditions[${conditionIndex}]`;
          if (!isRecord(condition)) return;
          check(condition, ['left', 'right', 'operator', 'operands', 'op'], conditionPath);
          if (condition.op !== undefined && condition.operator !== undefined && condition.op !== condition.operator) {
            issues.push({ path: `${conditionPath}.op`, message: 'conflicting legacy operator would be lost on save' });
          }
          for (const side of ['left', 'right'] as const) {
            const operand = condition[side];
            if (isRecord(operand)) check(operand,
              operand.type === 'literal' ? ['type', 'value'] : ['type', 'path'],
              `${conditionPath}.${side}`);
          }
          if (condition.operands !== undefined) {
            if (!Array.isArray(condition.operands) || condition.operands.length > 2) {
              issues.push({ path: `${conditionPath}.operands`, message: 'unsupported legacy operands would be lost on save' });
            } else condition.operands.forEach((operand: unknown, operandIndex: number) => {
              const issuesBefore = issues.length;
              if (isRecord(operand)) check(operand,
                operand.type === 'literal' ? ['type', 'value'] : ['type', 'path'],
                `${conditionPath}.operands[${operandIndex}]`);
              const canonical = operandIndex === 0 ? condition.left : condition.right;
              if (issues.length === issuesBefore && canonical !== undefined && !sameStoredValue(canonical, operand)) {
                issues.push({ path: `${conditionPath}.operands[${operandIndex}]`, message: 'conflicting legacy operand would be lost on save' });
              }
            });
          }
        });
      }
      if (Array.isArray(candidate.actions)) candidate.actions.forEach((action: unknown, actionIndex: number) => {
        if (isRecord(action)) check(action, ['type', 'macroUuid'], `${path}.actions[${actionIndex}]`);
      });
    });
  } catch {
    issues.push({ path: 'store', message: 'stored fields could not be inspected safely' });
  }
  return issues;
}

/** Object property order is irrelevant to JSON values; array order remains meaningful. */
function sameStoredValue(left: unknown, right: unknown, visiting = new WeakSet<object>()): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== typeof right || typeof left !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || visiting.has(left)) return false;
    visiting.add(left);
    const same = left.every((value, index) => sameStoredValue(value, right[index], visiting));
    visiting.delete(left);
    return same;
  }
  if (!isRecord(left) || !isRecord(right) || visiting.has(left)) return false;
  visiting.add(left);
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  const same = leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameStoredValue(left[key], right[key], visiting));
  visiting.delete(left);
  return same;
}

export function validateTriggerStore(input: unknown): TriggerStore {
  const parsed = parseTriggerStore(input);
  if (!parsed.success) throw validationError('store', parsed.issues);
  return parsed.data;
}

export function isJsonValue(value: unknown): value is JsonValue {
  return isJsonValueInternal(value, new WeakSet<object>());
}

function isJsonValueInternal(value: unknown, seen: WeakSet<object>): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    const valid = value.every((entry) => isJsonValueInternal(entry, seen));
    seen.delete(value);
    return valid;
  }
  if (!isRecord(value)) {
    seen.delete(value);
    return false;
  }
  const valid = Object.values(value).every((entry) => isJsonValueInternal(entry, seen));
  seen.delete(value);
  return valid;
}

export function cloneTrigger(trigger: TriggerDefinition): TriggerDefinition {
  return cloneValue(trigger) as TriggerDefinition;
}

export function cloneTriggerStore(store: TriggerStore): TriggerStore {
  return cloneValue(store) as TriggerStore;
}

function parseEvent(value: unknown, issues: ValidationIssue[]): TriggerEvent | undefined {
  if (!isRecord(value)) {
    issues.push({ path: 'event', message: 'must be an object' });
    return undefined;
  }
  if (value.type !== 'documentUpdate' && value.type !== 'combatTurnStart' && value.type !== 'combatTurnEnd') {
    issues.push({ path: 'event.type', message: 'must be documentUpdate, combatTurnStart, or combatTurnEnd' });
    return undefined;
  }
  if (value.documentType !== 'Actor') {
    issues.push({ path: 'event.documentType', message: 'must be Actor' });
    return undefined;
  }
  if (value.type === 'combatTurnStart' || value.type === 'combatTurnEnd') {
    return { type: value.type, documentType: 'Actor' };
  }
  if (!Array.isArray(value.watchedPaths)) {
    issues.push({ path: 'event.watchedPaths', message: 'must be an array' });
    return undefined;
  }
  const watchedPaths: string[] = [];
  for (const [index, path] of value.watchedPaths.entries()) {
    if (typeof path !== 'string' || !PATH_PATTERN.test(path.trim())) {
      issues.push({ path: `event.watchedPaths[${index}]`, message: 'must be a dotted document path' });
      continue;
    }
    watchedPaths.push(path.trim());
  }
  if (!watchedPaths.length) issues.push({ path: 'event.watchedPaths', message: 'must contain at least one path' });
  return issues.some((issue) => issue.path.startsWith('event.'))
    ? undefined
    : { type: 'documentUpdate', documentType: 'Actor', watchedPaths: unique(watchedPaths) };
}

function parseConditionGroup(value: unknown, issues: ValidationIssue[]): ConditionGroup | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    issues.push({ path: 'conditions', message: 'must be null or an object' });
    return null;
  }
  if (value.mode !== 'ALL' && value.mode !== 'ANY') {
    issues.push({ path: 'conditions.mode', message: 'must be ALL or ANY' });
  }
  if (!Array.isArray(value.conditions)) {
    issues.push({ path: 'conditions.conditions', message: 'must be an array' });
    return null;
  }
  const conditions: TriggerCondition[] = [];
  for (const [index, candidate] of value.conditions.entries()) {
    const condition = parseCondition(candidate, `conditions.conditions[${index}]`, issues);
    if (condition) conditions.push(condition);
  }
  if (value.mode !== 'ALL' && value.mode !== 'ANY') return null;
  return { mode: value.mode, conditions };
}

function parseCondition(value: unknown, path: string, issues: ValidationIssue[]): TriggerCondition | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return undefined;
  }
  const left = parseOperand(value.left ?? value.operands?.[0], `${path}.left`, issues);
  const right = parseOperand(value.right ?? value.operands?.[1], `${path}.right`, issues);
  const operator = value.operator ?? value.op;
  if (typeof operator !== 'string' || !VALID_OPERATORS.has(operator as ComparisonOperator)) {
    issues.push({ path: `${path}.operator`, message: 'must be one of eq, ne, gt, gte, lt, lte' });
  }
  if (!left || !right || typeof operator !== 'string' || !VALID_OPERATORS.has(operator as ComparisonOperator)) return undefined;
  return { left, operator: operator as ComparisonOperator, right };
}

function parseOperand(value: unknown, path: string, issues: ValidationIssue[]): ConditionOperand | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') {
    issues.push({ path, message: 'must be a before-path, after-path, or literal operand' });
    return undefined;
  }
  if (value.type === 'before-path' || value.type === 'after-path') {
    if (typeof value.path !== 'string' || !PATH_PATTERN.test(value.path.trim())) {
      issues.push({ path: `${path}.path`, message: 'must be a dotted document path' });
      return undefined;
    }
    return { type: value.type, path: value.path.trim() };
  }
  if (value.type === 'literal') {
    if (!isJsonValue(value.value)) {
      issues.push({ path: `${path}.value`, message: 'must be JSON data' });
      return undefined;
    }
    return { type: 'literal', value: cloneValue(value.value) as JsonValue };
  }
  issues.push({ path: `${path}.type`, message: 'must be before-path, after-path, or literal' });
  return undefined;
}

function parseActions(value: unknown, issues: ValidationIssue[]): MacroAction[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({ path: 'actions', message: 'must be an array' });
    return undefined;
  }
  if (!value.length) issues.push({ path: 'actions', message: 'must contain at least one action' });
  const actions: MacroAction[] = [];
  for (const [index, candidate] of value.entries()) {
    if (!isRecord(candidate) || candidate.type !== 'macro') {
      issues.push({ path: `actions[${index}]`, message: 'must be a macro action' });
      continue;
    }
    const macroUuid = readString(candidate.macroUuid, `actions[${index}].macroUuid`, issues, { trim: true, nonEmpty: true });
    if (macroUuid !== undefined) actions.push({ type: 'macro', macroUuid });
  }
  return actions;
}

function readString(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  options: { trim: boolean; nonEmpty: boolean },
): string | undefined {
  if (typeof value !== 'string') {
    issues.push({ path, message: 'must be a string' });
    return undefined;
  }
  const output = options.trim ? value.trim() : value;
  if (options.nonEmpty && !output) {
    issues.push({ path, message: 'must not be empty' });
    return undefined;
  }
  return output;
}

function parseJsonInput(value: unknown, path: string, issues: ValidationIssue[]): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    issues.push({ path, message: 'must contain valid JSON' });
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch { /* fall through for test doubles */ }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function validationError(path: string, issues: ValidationIssue[]): TypeError {
  const details = issues.length ? issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ') : 'invalid value';
  return new TypeError(`Invalid ${path}: ${details}`);
}

import type { ConditionGroup, ConditionOperand, TriggerCondition, TriggerContextEvent, TriggerDefinition } from './types.ts';

/** Resolve a dotted path without evaluating expressions or invoking methods. */
export function getPathValue(source: unknown, path: string): unknown {
  if (!path) return undefined;
  if (isRecord(source) && Object.prototype.hasOwnProperty.call(source, path)) return source[path];
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (Array.isArray(current) && /^[0-9]+$/.test(segment)) {
      const index = Number(segment);
      if (!Number.isSafeInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
      continue;
    }
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

/**
 * Return the paths actually changed by a Foundry update diff. Foundry may
 * deliver either dotted keys (`system.attributes.hp.value`) or nested objects.
 * Nested container objects are traversal structure, so they are not reported
 * as changes unless the container itself is the terminal value.
 */
export function extractChangedPaths(changed: unknown): string[] {
  const paths = new Set<string>();
  if (Array.isArray(changed)) {
    for (const value of changed) if (typeof value === 'string') paths.add(normalizePath(value));
    return [...paths].filter(Boolean);
  }
  if (!isRecord(changed)) return [];

  const visit = (value: unknown, prefix: string): void => {
    if (!isRecord(value)) {
      if (prefix) paths.add(prefix);
      return;
    }
    const entries = Object.entries(value);
    if (prefix && entries.length === 0) {
      paths.add(prefix);
      return;
    }
    for (const [rawKey, child] of entries) {
      const key = normalizePath(rawKey);
      if (!key) continue;
      const childPath = prefix ? `${prefix}.${key}` : key;
      visit(child, childPath);
    }
  };
  visit(changed, '');
  return [...paths];
}

export function pathsAreRelated(left: string, right: string): boolean {
  const a = normalizePath(left);
  const b = normalizePath(right);
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}

export function watchedPathsMatch(watchedPaths: readonly string[], changed: unknown): boolean {
  const changedPaths = extractChangedPaths(changed);
  return watchedPaths.some((watched) => changedPaths.some((changedPath) => pathsAreRelated(watched, changedPath)));
}

/** Aliases make the small pure helper convenient for external test harnesses. */
export const isWatchedPathRelevant = watchedPathsMatch;
export const watchedPathsIntersect = watchedPathsMatch;

/** Pure eligibility decision; the runtime retains GM checks, causal guards and execution order. */
export function triggerMatchesEvent(
  trigger: TriggerDefinition,
  event: TriggerContextEvent,
  before: unknown,
  after: unknown,
  changed?: unknown,
): boolean {
  if (!trigger.enabled || trigger.event.type !== event.type || trigger.event.documentType !== event.documentType) return false;
  if (trigger.event.type === 'documentUpdate' && !watchedPathsMatch(trigger.event.watchedPaths, changed)) return false;
  return evaluateConditionGroup(trigger.conditions, before, after);
}

export function evaluateConditionGroup(group: ConditionGroup | null | undefined, before: unknown, after: unknown): boolean {
  if (!group) return true;
  // A post-update hook cannot reconstruct a trustworthy before value for an
  // Actor that was not present at ready. Do not let a `ne`/ordering operator
  // turn that missing snapshot into a successful condition.
  if (before === undefined && group.conditions.some(condition =>
    condition.left.type === 'before-path' || condition.right.type === 'before-path')) return false;
  const values = group.conditions.map((condition) => evaluateCondition(condition, before, after));
  return group.mode === 'ANY' ? values.some(Boolean) : values.every(Boolean);
}

export function evaluateCondition(condition: TriggerCondition, before: unknown, after: unknown): boolean {
  const left = resolveOperand(condition.left, before, after);
  const right = resolveOperand(condition.right, before, after);
  switch (condition.operator) {
    case 'eq': return deepEqual(left, right);
    case 'ne': return !deepEqual(left, right);
    case 'gt': return relationalCompare(left, right, (a, b) => a > b);
    case 'gte': return relationalCompare(left, right, (a, b) => a >= b);
    case 'lt': return relationalCompare(left, right, (a, b) => a < b);
    case 'lte': return relationalCompare(left, right, (a, b) => a <= b);
    default: return false;
  }
}

export const conditionsMatch = evaluateConditionGroup;

function resolveOperand(operand: ConditionOperand, before: unknown, after: unknown): unknown {
  if (operand.type === 'literal') return operand.value;
  return getPathValue(operand.type === 'before-path' ? before : after, operand.path);
}

function relationalCompare(left: unknown, right: unknown, compare: (a: number | string, b: number | string) => boolean): boolean {
  if (typeof left === 'number' && Number.isFinite(left) && typeof right === 'number' && Number.isFinite(right)) return compare(left, right);
  if (typeof left === 'string' && typeof right === 'string') return compare(left, right);
  return false;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => deepEqual(value, right[index]));
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(leftRecord[key], rightRecord[key]));
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  return trimmed.startsWith('-=') ? trimmed.slice(2) : trimmed;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

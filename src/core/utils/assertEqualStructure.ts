import { deepStrictEqual } from 'node:assert/strict';
import { normalizeActor } from './normalization';

export interface StructureComparisonOptions {
  ignorePaths?: string[];
  mode?: 'value' | 'shape';
}

export function prepareStructureForComparison(
  value: unknown,
  options: StructureComparisonOptions = {},
): unknown {
  const normalized = normalizeActor(value);
  const cloned = JSON.parse(JSON.stringify(normalized));

  for (const rawPath of options.ignorePaths ?? []) {
    const segments = parsePath(rawPath);
    if (segments.length > 0) {
      removeAtPath(cloned, segments);
    }
  }

  if (options.mode === 'shape') {
    return toShape(cloned);
  }

  return cloned;
}

export function assertEqualStructure(
  actual: unknown,
  expected: unknown,
  options: StructureComparisonOptions = {},
): void {
  deepStrictEqual(
    prepareStructureForComparison(actual, options),
    prepareStructureForComparison(expected, options),
  );
}

function parsePath(path: string): string[] {
  return path
    .replace(/\[(\*|\d+)\]/g, '.$1')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function removeAtPath(node: unknown, segments: string[]): void {
  if (!node || segments.length === 0) {
    return;
  }

  const [head, ...tail] = segments;
  if (!head) {
    return;
  }

  if (Array.isArray(node)) {
    if (head === '*') {
      for (const item of node) {
        removeAtPath(item, tail);
      }
      return;
    }

    const index = Number.parseInt(head, 10);
    if (Number.isNaN(index) || index < 0 || index >= node.length) {
      return;
    }

    if (tail.length === 0) {
      delete node[index];
      return;
    }

    removeAtPath(node[index], tail);
    return;
  }

  if (typeof node !== 'object') {
    return;
  }

  const record = node as Record<string, unknown>;
  if (head === '*') {
    for (const key of Object.keys(record)) {
      if (tail.length === 0) {
        delete record[key];
        continue;
      }
      removeAtPath(record[key], tail);
    }
    return;
  }

  if (!(head in record)) {
    return;
  }

  if (tail.length === 0) {
    delete record[head];
    return;
  }

  removeAtPath(record[head], tail);
}

function toShape(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => toShape(entry));
  }

  if (value === null) {
    return 'null';
  }

  if (value instanceof Date) {
    return 'date';
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = toShape(entry);
    }
    return out;
  }

  return typeof value;
}

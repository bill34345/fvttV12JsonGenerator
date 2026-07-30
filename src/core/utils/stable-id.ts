import { createHash } from 'node:crypto';

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function createStableDocumentId(logicalPath: unknown): string {
  return createHash('sha256')
    .update(stableSerialize(logicalPath))
    .digest('hex')
    .slice(0, 16);
}

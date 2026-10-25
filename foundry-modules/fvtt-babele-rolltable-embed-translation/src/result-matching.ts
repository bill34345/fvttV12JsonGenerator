export interface RollTableResultData {
  _id?: string;
  range?: [number, number] | number[];
  type?: string;
  name?: string | null;
  description?: string | null;
  documentUuid?: string | null;
  drawn?: boolean;
  [key: string]: unknown;
}

/** Display translations cannot retarget a document or change its roll range/state. */
export function applyResultTranslation(source: RollTableResultData, translation: unknown): RollTableResultData {
  if (typeof translation === 'string') return { ...source, description: translation };
  if (!translation || typeof translation !== 'object' || Array.isArray(translation)) return source;
  const input = translation as Record<string, unknown>;
  const display: Pick<RollTableResultData, 'name' | 'description'> = {};
  for (const field of ['name', 'description'] as const) {
    if (typeof input[field] === 'string' || input[field] === null) display[field] = input[field];
  }
  return { ...source, ...display };
}

export function resultRangeKey(result: Pick<RollTableResultData, 'range'>): string | null {
  if (!Array.isArray(result.range) || result.range.length !== 2) return null;
  const [low, high] = result.range;
  if (!Number.isFinite(low) || !Number.isFinite(high) || low! > high!) return null;
  return `${low}-${high}`;
}

export function compareResultRanges(left: Pick<RollTableResultData, 'range'>, right: Pick<RollTableResultData, 'range'>): number {
  return Number(left.range?.[0] ?? 0) - Number(right.range?.[0] ?? 0);
}

function indexUnique(rows: readonly RollTableResultData[], keyFor: (row: RollTableResultData) => string | null | undefined) {
  const result = new Map<string, RollTableResultData | null>();
  for (const row of rows) {
    const key = keyFor(row);
    if (key) result.set(key, result.has(key) ? null : row);
  }
  return result;
}

/** Exact ID wins. A range fallback must identify one source and one candidate. */
export function alignTranslatedResults(sourceResults: readonly RollTableResultData[], translatedResults: readonly RollTableResultData[]): RollTableResultData[] {
  const byId = indexUnique(translatedResults, row => row._id);
  const sourceIds = indexUnique(sourceResults, row => row._id);
  const byRange = indexUnique(translatedResults, resultRangeKey);
  const sourceRanges = indexUnique(sourceResults, resultRangeKey);
  return [...sourceResults].sort(compareResultRanges).map(source => {
    if (source._id && byId.has(source._id)) {
      if (!sourceIds.get(source._id)) return source;
      return applyResultTranslation(source, byId.get(source._id));
    }
    const range = resultRangeKey(source);
    return range && sourceRanges.get(range) ? applyResultTranslation(source, byRange.get(range)) : source;
  });
}

export function translateResultEntries(sourceResults: readonly RollTableResultData[], translations: Record<string, unknown> | null | undefined): RollTableResultData[] {
  const entries = translations && typeof translations === 'object' && !Array.isArray(translations) ? translations : {};
  const sourceIds = indexUnique(sourceResults, row => row._id);
  const sourceRanges = indexUnique(sourceResults, resultRangeKey);
  return [...sourceResults].sort(compareResultRanges).map(source => {
    if (source._id && Object.hasOwn(entries, source._id)) {
      return sourceIds.get(source._id) ? applyResultTranslation(source, entries[source._id]) : source;
    }
    const range = resultRangeKey(source);
    return range && sourceRanges.get(range) && Object.hasOwn(entries, range)
      ? applyResultTranslation(source, entries[range]) : source;
  });
}

export type IconMode = 'off' | 'safe';

export type IconResolutionSource =
  | 'override'
  | 'existing'
  | 'compendium-exact'
  | 'semantic'
  | 'type-default';

export type IconConfidence = 'exact' | 'high' | 'fallback';

export interface V14IconCatalogTarget {
  foundryVersion: '14.364';
  systemId: 'dnd5e';
  systemVersion: '5.3.3';
}

export interface V14IconCatalogEntry {
  id: string;
  name: string;
  img: string;
  type: string;
  identifier?: string;
  rules?: '2014' | '2024';
  pack: string;
  packPriority: number;
  tokens: string[];
}

export interface V14IconFileEntry {
  path: string;
  source: 'core' | 'dnd5e';
  tokens: string[];
}

export interface V14IconCatalog {
  schemaVersion: 1;
  target: V14IconCatalogTarget;
  provenance: {
    api: 'CompendiumCollection#getIndex';
    packIndexSha256: string;
    coreFilesSha256: string;
    dnd5eFilesSha256: string;
    packs: Array<{ id: string; count: number }>;
  };
  typeDefaults: Record<string, string>;
  compendium: V14IconCatalogEntry[];
  files: V14IconFileEntry[];
}

export interface V14IconOverrideSelector {
  itemType: string;
  englishName?: string;
  name?: string;
  actorEnglishName?: string;
  actorName?: string;
}

export interface V14IconOverrideEntry {
  selector: V14IconOverrideSelector;
  img: string;
}

export interface V14IconOverrideFile {
  schemaVersion: 1;
  target: V14IconCatalogTarget;
  entries: V14IconOverrideEntry[];
}

export interface IconCandidate {
  path: string;
  name: string;
  source: string;
  score: number;
  reasons: string[];
}

export interface IconResolution {
  selectedPath: string;
  source: IconResolutionSource;
  confidence: IconConfidence;
  reasons: string[];
  alternatives: IconCandidate[];
  overrideKey?: string;
}

export interface IconReviewEntry {
  actorName?: string;
  itemName: string;
  englishName?: string;
  itemType: string;
  previousPath: string;
  selectedPath: string;
  source: IconResolutionSource;
  confidence: IconConfidence;
  reasons: string[];
  alternatives: IconCandidate[];
  overrideKey?: string;
}

export interface IconReviewReport {
  schemaVersion: 1;
  target: V14IconCatalogTarget;
  mode: 'safe';
  entries: IconReviewEntry[];
  summary: {
    total: number;
    override: number;
    existing: number;
    exact: number;
    semantic: number;
    fallback: number;
  };
}

/** Read the existing v1 report at a trust boundary without accepting extra wire fields. */
export function decodeIconReviewReport(value: unknown): IconReviewReport {
  const record = closedRecord(value, ['schemaVersion', 'target', 'mode', 'entries', 'summary']);
  const target = closedRecord(record.target, ['foundryVersion', 'systemId', 'systemVersion']);
  if (record.schemaVersion !== 1 || record.mode !== 'safe'
    || target.foundryVersion !== '14.364' || target.systemId !== 'dnd5e' || target.systemVersion !== '5.3.3') {
    throw new TypeError('Invalid icon review version or target.');
  }
  const entries = boundedArray(record.entries, 10000).map(readEntry);
  const summary = closedRecord(record.summary, ['total', 'override', 'existing', 'exact', 'semantic', 'fallback']);
  const expected = {
    total: entries.length,
    override: entries.filter(entry => entry.source === 'override').length,
    existing: entries.filter(entry => entry.source === 'existing').length,
    exact: entries.filter(entry => entry.source === 'compendium-exact').length,
    semantic: entries.filter(entry => entry.source === 'semantic').length,
    fallback: entries.filter(entry => entry.source === 'type-default').length,
  };
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (summary[key] !== expected[key]) throw new TypeError('Icon review summary does not match its entries.');
  }
  return { schemaVersion: 1, target: { foundryVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3' },
    mode: 'safe', entries, summary: expected };
}

function readEntry(value: unknown): IconReviewEntry {
  const record = closedRecord(value, ['actorName', 'itemName', 'englishName', 'itemType', 'previousPath',
    'selectedPath', 'source', 'confidence', 'reasons', 'alternatives', 'overrideKey']);
  const source = readChoice(record.source, ['override', 'existing', 'compendium-exact', 'semantic', 'type-default'] as const);
  const confidence = readChoice(record.confidence, ['exact', 'high', 'fallback'] as const);
  const optionalText = (key: string) => record[key] === undefined ? {} : { [key]: readText(record[key]) };
  return {
    ...optionalText('actorName'), ...optionalText('englishName'), ...optionalText('overrideKey'),
    itemName: readText(record.itemName), itemType: readText(record.itemType),
    previousPath: readText(record.previousPath, true), selectedPath: readIconPath(record.selectedPath),
    source, confidence, reasons: readReasons(record.reasons),
    alternatives: boundedArray(record.alternatives, 128).map(value => {
      const candidate = closedRecord(value, ['path', 'name', 'source', 'score', 'reasons']);
      if (typeof candidate.score !== 'number' || !Number.isFinite(candidate.score)) throw new TypeError('Invalid icon score.');
      return { path: readIconPath(candidate.path), name: readText(candidate.name), source: readText(candidate.source),
        score: candidate.score, reasons: readReasons(candidate.reasons) };
    }),
  };
}

function closedRecord(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Icon review object required.');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !keys.includes(key))) throw new TypeError('Undeclared icon review field.');
  return record;
}

function boundedArray(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new TypeError('Invalid icon review list.');
  return value;
}

function readText(value: unknown, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > 8192
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new TypeError('Invalid icon review text.');
  return value;
}

function readIconPath(value: unknown): string {
  const path = readText(value);
  if (!/^(?:icons\/|systems\/dnd5e\/icons\/)[A-Za-z0-9_./-]+\.(?:svg|webp|png|jpe?g|gif)$/i.test(path)
    || path.split('/').some(part => part === '.' || part === '..')) throw new TypeError('Invalid catalog icon path.');
  return path;
}

function readReasons(value: unknown): string[] {
  return boundedArray(value, 64).map(value => readText(value));
}

function readChoice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new TypeError('Invalid icon review choice.');
  return value as T;
}


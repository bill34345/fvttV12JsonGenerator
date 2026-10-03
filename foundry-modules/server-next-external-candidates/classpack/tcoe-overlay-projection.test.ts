import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectTcoeInitializations, TCOE_OVERLAY_SOURCE } from './tcoe-overlay-projection';

type Source = { type: string; system: { source?: { rules?: string }; identifier?: string; advancement?: Array<Record<string, unknown>> } };
type Difference = { type: string; pack: string; key: string; originalRecord: Source };
type NativeMismatch = { type: string; pack: string; key: string; actual: unknown };

const analysisPath = join(import.meta.dir, '../../../.local/classpack-next-20261002/full-source-difference-analysis.json');
const nativePath = 'F:/FoundryLab/foundry-v14/evidence/server-next-migration/classpack-next-20261002-b322ea20/all-source-differences-native.json';
const analysis = JSON.parse(readFileSync(analysisPath, 'utf8')) as { rows: Difference[] };
const native = JSON.parse(readFileSync(nativePath, 'utf8')) as { mismatches: NativeMismatch[] };

function advancementById(source: Source): Record<string, Record<string, unknown>> {
  const advancement = source.system?.advancement ?? [];
  return Array.isArray(advancement)
    ? Object.fromEntries(advancement.map(entry => [String(entry._id), entry]))
    : advancement as Record<string, Record<string, unknown>>;
}

function advancementIds(source: Source): string[] {
  return Object.keys(advancementById(source)).sort();
}

function activeUuids(source: Source): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  const walk = (entry: unknown, path: string) => {
    if (!entry || typeof entry !== 'object') return;
    for (const [key, child] of Object.entries(entry)) {
      const next = `${path}.${key}`;
      if (key === 'uuid' && typeof child === 'string') found.push([next, child]);
      else walk(child, next);
    }
  };
  walk(advancementById(source), 'system.advancement');
  walk((source.system as Record<string, unknown>).activities, 'system.activities');
  walk((source.system as Record<string, unknown>).spells, 'system.spells');
  return found.sort(([left], [right]) => left.localeCompare(right));
}

describe('exact installed TCoE initializeItemSource overlay', () => {
  test('projects all 14 observed 2014 class and subclass records from original sources', () => {
    const rows = analysis.rows.filter(row => row.type === 'advancementIds');
    expect(rows).toHaveLength(14);
    expect(TCOE_OVERLAY_SOURCE.version).toBe('4.0.0');
    let addedIds = 0;
    for (const row of rows) {
      const original = row.originalRecord;
      const originalSnapshot = structuredClone(original);
      const projected = projectTcoeInitializations(original);
      const actualIds = native.mismatches.find(entry =>
        entry.type === 'advancementIds' && entry.pack === row.pack && entry.key === row.key)?.actual;
      const actualUuids = native.mismatches.find(entry =>
        entry.type === 'activeUuids' && entry.pack === row.pack && entry.key === row.key)?.actual;
      expect(actualIds).toBeDefined();
      expect(actualUuids).toBeDefined();
      expect(advancementIds(projected)).toEqual(actualIds);
      expect(activeUuids(projected)).toEqual(actualUuids);
      const originalIds = advancementIds(original);
      addedIds += advancementIds(projected).length - originalIds.length;
      expect(originalIds.every(id => advancementIds(projected).includes(id))).toBe(true);
      const projectedUuids = activeUuids(projected).map(([, uuid]) => uuid);
      expect(activeUuids(original).every(([, uuid]) => projectedUuids.includes(uuid))).toBe(true);
      expect(original).toEqual(originalSnapshot);
    }
    expect(addedIds).toBe(37);
  });

  test('guards 2024 rules, disabled setting, absent advancement and unrelated items', () => {
    const original = analysis.rows.find(row => row.type === 'advancementIds')!.originalRecord;
    const cases: Source[] = [
      { ...structuredClone(original), system: { ...structuredClone(original.system), source: { rules: '2024' } } },
      { ...structuredClone(original), system: { ...structuredClone(original.system), advancement: [] } },
      { ...structuredClone(original), system: { ...structuredClone(original.system), identifier: 'not-a-tcoe-class' } },
      { ...structuredClone(original), type: 'feat' },
    ];
    for (const item of cases) expect(projectTcoeInitializations(item)).toEqual(item);
    expect(projectTcoeInitializations(original, false)).toEqual(original);
  });
});

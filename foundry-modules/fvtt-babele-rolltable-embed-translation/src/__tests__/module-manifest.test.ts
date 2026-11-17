import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

describe('Babele RollTable embed compatibility declaration', () => {
  test('keeps verified baselines while admitting Core 14, dnd5e 6 and newer dependency releases', async () => {
    const manifest = JSON.parse(await readFile(resolve(import.meta.dir, '../module.json'), 'utf8'));
    expect(manifest.compatibility).toEqual({ minimum: '14.368', verified: '14.368', maximum: '14.999' });
    expect(manifest.relationships.systems[0].compatibility).toEqual({ minimum: '6.0.2', verified: '6.0.2', maximum: '6.999.999' });
    expect(manifest.relationships.requires.map(({ id, compatibility }: { id: string; compatibility: { minimum: string; verified: string; maximum?: string } }) => ({ id, compatibility }))).toEqual([
      { id: 'babele', compatibility: { minimum: '2.9.1', verified: '2.9.1' } },
      { id: 'lib-wrapper', compatibility: { minimum: '1.13.5.1', verified: '1.13.5.1' } },
    ]);
  });
});

import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('pinned Foundry 14.368 / dnd5e 6.0.2 actual source migration', () => {
  test('preserves the local.2 failure contrast and proves local.3 survives core cleanup and dnd5e migration', () => {
    const result = JSON.parse(execFileSync('F:/FoundryLab/foundry-v14/runtime/node-v24.17.0-win-x64/node.exe',
      [resolve(import.meta.dir, 'helpers/effect-model-probe.mjs')], { encoding: 'utf8', timeout: 15_000 }));
    expect(result.coreSchemaFields).toEqual(['changes']);
    expect(result.coreCleaned).toEqual({ changes: [] });
    expect(result.local2CoreCleanedSystem).toEqual({ changes: [] });
    expect(result.coreInvalid).toBe(false);
    expect(result.clientBackendProof).toEqual({
      cleansBeforeConstructor: true,
      activeEffectHasIdField: true,
      documentIdFieldPreserved: true,
    });
    expect(result.observations).toEqual([
      { name: 'local1-with-idless-status', type: 'condition', systemType: null, id: null },
      { name: 'local2-with-idless-status', type: 'condition', systemType: 'base', id: null },
      { name: 'local2-after-core-clean-with-idless-status', type: 'condition', systemType: null, id: null },
      { name: 'local3-fresh-id-control', type: 'base', systemType: null, id: 'a1b2c3d4e5f6g7h8' },
      { name: 'fully-identified-statuses-control', type: 'base', systemType: null, id: null },
      { name: 'legitimate-status-migration', type: 'condition', systemType: 'poisoned', id: 'status0000000001' },
    ]);
  });
});

import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

test('locked dnd5e 6 id-less ActiveEffect creation receives an ID before migration', () => {
  const report = JSON.parse(execFileSync('F:/FoundryLab/foundry-v14/runtime/node-v24.17.0-win-x64/node.exe',
    [resolve(import.meta.dir, 'helpers/effect-create-id-probe.mjs')], {encoding: 'utf8', timeout: 30_000}));
  expect(report.candidateVersion).toBe('14.6.0-beta.4338eeab.local.9');
  expect(report.cleanCreatePath).toEqual({cleanedBeforeConstruct: true, creationOption: true});
  expect(report.cleanedBaseEffectSystem).toEqual({changes: []});
  expect(report.observations).toHaveLength(7);
});

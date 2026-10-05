import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { legacyNextInputPath } from './helpers/legacy-next-inputs.mjs';

const repositoryRoot = resolve('fixture-current'), inputRoot = resolve('fixture-retained');
const options = { repositoryRoot, inputRoot };
test('historical input reuse redirects caches while preserving their exact relative identity', () => {
  for (const name of ['.local/midi-qol/source/src/module/Workflow.ts', '.local/midi-qol/test-sources/dnd5e-6.0.2/dnd5e.mjs',
    'foundry-modules/server-next-external-candidates/classpack/dist/dnd5e_classpack/module.json']) {
    expect(legacyNextInputPath(resolve(repositoryRoot, name), options)).toBe(resolve(inputRoot, name));
  }
});
test('historical input reuse cannot redirect current implementations, locks, patches or outside paths', () => {
  for (const name of ['foundry-modules/midi-qol/upstream.lock.json', 'foundry-modules/midi-qol/patches/fix.patch',
    'foundry-modules/server-next-external-candidates/classpack/next-migration.mjs', '.local/private/credentials.json', '../escape']) {
    expect(() => legacyNextInputPath(resolve(repositoryRoot, name), options)).toThrow('Not a relocatable');
  }
});
test('historical input roots must be explicit absolute paths', () => {
  expect(() => legacyNextInputPath(resolve(repositoryRoot, '.local/midi-qol/source'), {repositoryRoot,inputRoot:'relative'})).toThrow('absolute');
});

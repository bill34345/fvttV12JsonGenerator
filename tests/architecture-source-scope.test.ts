import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const require = createRequire(import.meta.url);
const config = require('../.dependency-cruiser.cjs');
const excluded = new RegExp(config.options.exclude.path);

test('architecture excludes nested dependencies and declared immutable archives, while retaining owned candidate code', () => {
  for (const file of [
    'node_modules/x/index.js',
    'foundry-modules/server-next-external-candidates/vision-macro/sources/vision/node_modules/zod/index.js',
    'foundry-modules/server-next-external-candidates/vision-macro/upstream/item-macro/package/scripts/main.mjs',
    'foundry-modules/server-next-external-candidates/item-piles/dist-local2/module/item-piles.js',
  ]) expect(excluded.test(file)).toBe(true);
  for (const file of [
    'foundry-modules/server-next-external-candidates/dae/phase-patch.mjs',
    'foundry-modules/server-next-external-candidates/icons/repair-runtime.js',
    'foundry-modules/server-next-external-candidates/vision-macro/patcher.mjs',
    'tools/foundry-ops/src/player-item-repair/core.mjs',
    'packages/blood-hunter-v14/src/source.ts',
  ]) expect(excluded.test(file)).toBe(false);
});

test('the recovery exception permits only its public metadata facade and keeps other operator imports forbidden', () => {
  const general = config.forbidden.find((r: { name: string }) => r.name === 'foundry-ops-product-boundary');
  const recovery = config.forbidden.find((r: { name: string }) => r.name === 'blood-hunter-recovery-public-metadata-only');
  const caller = 'tools/foundry-ops/src/player-item-repair/recover-blood-hunter.mjs';
  expect(new RegExp(general.from.pathNot).test(caller)).toBe(true);
  expect(new RegExp(general.from.pathNot).test('tools/foundry-ops/src/routing.ts')).toBe(false);
  expect(new RegExp(recovery.from.path).test(caller)).toBe(true);
  expect(new RegExp(recovery.to.pathNot).test('packages/blood-hunter-v14/src/source-metadata.ts')).toBe(true);
  expect(new RegExp(recovery.to.pathNot).test('packages/blood-hunter-v14/src/source.ts')).toBe(false);
  expect(new RegExp(recovery.to.pathNot).test('packages/blood-hunter-v14/src/compiler.ts')).toBe(false);
  const source = readFileSync(resolve(root, caller), 'utf8');
  expect(source).toContain("from '../../../../packages/blood-hunter-v14/src/source-metadata.ts'");
  expect(source).not.toContain('packages/blood-hunter-v14/src/source.ts');
});

test('the published source-metadata surface exposes only the unchanged read-only functions', async () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'packages/blood-hunter-v14/package.json'), 'utf8'));
  expect(manifest.exports['./source-metadata']).toBe('./src/source-metadata.ts');
  const api = await import('../packages/blood-hunter-v14/src/source-metadata');
  expect(Object.keys(api).sort()).toEqual([
    'assertBloodHunterSourceBytes', 'collectBloodHunterFeatures', 'validateBloodHunterEnrichedSource',
  ]);
  expect(api.validateBloodHunterEnrichedSource({}).ok).toBe(false);
  expect(() => api.assertBloodHunterSourceBytes('untrusted source')).toThrow('SHA-256');
});

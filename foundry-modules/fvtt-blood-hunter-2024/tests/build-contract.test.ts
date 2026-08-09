import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'bun:test';

import {
  EXPECTED_ACTIVITY_COUNT,
  EXPECTED_DND5E_EXTERNAL_UUIDS,
  EXPECTED_EFFECT_CHANGE_COUNT,
  EXPECTED_LEDGER_COUNT,
  assertExternalReferenceCompleteness,
  assertZipMatchesModule,
  buildBloodHunterModule,
  collectExternalDnd5eUuids,
  createDeterministicZip,
  projectEffectForFoundryV14Pack,
  writeLevelDbPack,
} from '../build.ts';
import { MIGRATION_APP_TITLE } from '../src/runtime.ts';
import {
  compileBloodHunterV14Package,
  type NativeBloodHunterPackage,
} from '../../../packages/blood-hunter-v14/src/index.ts';
import { makeBloodHunter2024Fixture } from '../../../packages/blood-hunter-v14/tests/fixture.ts';
import { createLabConfig } from '../labConfig.ts';

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('module release contract', () => {
  test('manifest locks the exact Foundry/system versions and Item packs', async () => {
    const manifest = JSON.parse(await Bun.file(resolve(import.meta.dir, '../src/module.json')).text()) as Record<string, any>;
    expect(manifest.id).toBe('fvtt-blood-hunter-2024');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.title).toBe('血猎手 2024');
    expect(manifest.compatibility).toEqual({ minimum: '14.364', verified: '14.364', maximum: '14.364' });
    expect(manifest.relationships.systems).toEqual([{
      id: 'dnd5e', type: 'system', compatibility: { minimum: '5.3.3', verified: '5.3.3', maximum: '5.3.3' },
    }]);
    expect(manifest.relationships.requires ?? []).toEqual([]);
    expect(manifest.relationships.recommends.map((entry: any) => [entry.id, entry.compatibility.verified])).toEqual([
      ['midi-qol', '14.0.11'], ['dae', '14.0.12'],
    ]);
    expect(manifest.packs).toHaveLength(3);
    expect(manifest.packs.map((pack: any) => [pack.name, pack.path, pack.type, pack.system])).toEqual([
      ['classes', 'packs/classes', 'Item', 'dnd5e'],
      ['subclasses', 'packs/subclasses', 'Item', 'dnd5e'],
      ['features', 'packs/features', 'Item', 'dnd5e'],
    ]);
    expect(JSON.stringify(manifest).toLocaleLowerCase('en-US')).not.toContain('plutonium');
    expect(JSON.stringify(manifest).toLocaleLowerCase('en-US')).not.toContain('classpack');
    expect(MIGRATION_APP_TITLE).toBe('血猎手 2024：角色迁移');
  });

  test('release count constants reflect the frozen public compiler output without pinning logicalHash', () => {
    expect([EXPECTED_ACTIVITY_COUNT, EXPECTED_LEDGER_COUNT, EXPECTED_EFFECT_CHANGE_COUNT]).toEqual([117, 94, 72]);
    expect(EXPECTED_DND5E_EXTERNAL_UUIDS).toHaveLength(12);
    expect(new Set(EXPECTED_DND5E_EXTERNAL_UUIDS)).toEqual(new Set(EXPECTED_DND5E_EXTERNAL_UUIDS));
    expect((buildBloodHunterModule as unknown as { toString(): string }).toString()).not.toContain('c680500ac8eb09058e91559811344ebecced02c2f74b1ce9547ec0ffd0cc3728');
  });

  test('recursive UUID collection is exact and the locked YAML/JSON reference cache is fail-closed', async () => {
    const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), 'fvtt-bh-reference-test-'));
    temporaryRoots.push(root);
    const sourceRoot = join(root, 'dnd5e', '5.3.3', 'repo', 'packs', '_source');
    await mkdir(sourceRoot, { recursive: true });
    const packageValue = { nested: EXPECTED_DND5E_EXTERNAL_UUIDS.map((uuid) => ({ uuid, deep: [uuid] })) } as unknown as NativeBloodHunterPackage;
    expect(collectExternalDnd5eUuids(packageValue)).toEqual([...EXPECTED_DND5E_EXTERNAL_UUIDS].sort());
    for (const [index, uuid] of EXPECTED_DND5E_EXTERNAL_UUIDS.entries()) {
      const id = uuid.split('.').at(-1)!;
      await writeFile(join(sourceRoot, `document-${index}.yml`), `_id: ${id}\nname: test\n`, 'utf8');
    }
    const config = { referenceCacheRoot: root } as Parameters<typeof assertExternalReferenceCompleteness>[1];
    expect(await assertExternalReferenceCompleteness(packageValue, config)).toEqual([...EXPECTED_DND5E_EXTERNAL_UUIDS].sort());
    await unlink(join(sourceRoot, 'document-0.yml'));
    await expect(assertExternalReferenceCompleteness(packageValue, config)).rejects.toThrow(/missing external Item UUIDs/);
  });

  test('deterministic ZIP is complete and is independently checked against module files', async () => {
    const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), 'fvtt-bh-zip-test-'));
    temporaryRoots.push(root);
    const moduleRoot = join(root, 'module');
    await mkdir(join(moduleRoot, 'data'), { recursive: true });
    await writeFile(join(moduleRoot, 'module.json'), '{"id":"fvtt-blood-hunter-2024"}\n', 'utf8');
    await writeFile(join(moduleRoot, 'data', 'identity.json'), '{"logicalHash":"from-compiler"}\n', 'utf8');
    const first = createDeterministicZip(moduleRoot);
    const firstBytes = await first;
    const zipPath = join(root, 'module.zip');
    await writeFile(zipPath, firstBytes);
    await assertZipMatchesModule(zipPath, moduleRoot);
    const secondBytes = await createDeterministicZip(moduleRoot);
    expect(hash(firstBytes)).toBe(hash(secondBytes));
    const broken = firstBytes.slice();
    broken[broken.length - 1] = 1;
    await writeFile(zipPath, broken);
    await expect(assertZipMatchesModule(zipPath, moduleRoot)).rejects.toThrow();
  });

  test('raw-byte source and validator boundary fail closed before any module publication', async () => {
    const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), 'fvtt-bh-build-gate-'));
    temporaryRoots.push(root);
    const sourcePath = join(root, 'synthetic-source.json');
    await writeFile(sourcePath, JSON.stringify(makeBloodHunter2024Fixture()), 'utf8');
    const labRoot = join(root, 'lab');
    await mkdir(labRoot, { recursive: true });
    const config = createLabConfig(resolve(import.meta.dir, '../../..'), {
      FVTT_OPS_LAB_ROOT: labRoot,
      FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY: 'F:\\FoundryLab\\foundry-v14\\app\\14.364\\node_modules\\classic-level\\index.js',
      FVTT_REFERENCE_CACHE_ROOT: root,
    });
    await expect(buildBloodHunterModule({ sourcePath, config, publish: false })).rejects.toThrow(/SHA-256|source/);
  });

  test('writes v14 embedded ActiveEffects into items.effects and preserves Dawn Rite references', async () => {
    const output = compileBloodHunterV14Package(makeBloodHunter2024Fixture());
    const dawn = output.features.find((item) => item.name === '破晓血仪');
    expect(dawn).toBeDefined();
    expect(dawn!.effects).toHaveLength(2);
    const projected = dawn!.effects.map((effect) => projectEffectForFoundryV14Pack(effect));
    expect(projected.every((effect) => !Object.prototype.hasOwnProperty.call(effect, 'changes'))).toBe(true);
    expect(projected.every((effect) => Array.isArray((effect.system as Record<string, unknown>).changes))).toBe(true);
    expect((projected[0]!.system as Record<string, any>).changes[0]).toMatchObject({ key: 'system.damage.parts', type: 'add' });

    const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), 'fvtt-bh-embedded-effects-'));
    temporaryRoots.push(root);
    const labRoot = join(root, 'lab');
    await mkdir(labRoot, { recursive: true });
    const config = createLabConfig(resolve(import.meta.dir, '../../..'), {
      FVTT_OPS_LAB_ROOT: labRoot,
      FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY: 'F:\\FoundryLab\\foundry-v14\\app\\14.364\\node_modules\\classic-level\\index.js',
      FVTT_REFERENCE_CACHE_ROOT: root,
    });
    const packPath = join(root, 'pack');
    await writeLevelDbPack(packPath, [dawn!], config);
    const { ClassicLevel } = await import(pathToFileURL(config.classicLevelEntry).href) as { ClassicLevel: any };
    const database = new ClassicLevel(packPath, { createIfMissing: false, readOnly: true, keyEncoding: 'utf8', valueEncoding: 'json' });
    await database.open();
    try {
      const items = database.sublevel('items', { keyEncoding: 'utf8', valueEncoding: 'json' });
      const embeddedEffects = database.sublevel('items.effects', { keyEncoding: 'utf8', valueEncoding: 'json' });
      const stored = await items.get(dawn!._id) as Record<string, any>;
      expect(stored.effects).toEqual(dawn!.effects.map((effect) => effect._id));
      for (const effect of dawn!.effects) {
        const child = await embeddedEffects.get(`${dawn!._id}.${effect._id}`) as Record<string, any>;
        expect(child._id).toBe(effect._id);
      }
    } finally {
      await database.close();
    }
  });
});

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

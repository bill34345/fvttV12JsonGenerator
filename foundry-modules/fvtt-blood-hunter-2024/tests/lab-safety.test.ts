import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'bun:test';

import { createDeterministicZip, inspectModuleTree, moduleUuid } from '../build.ts';
import {
  bloodHunterLabPaths,
  dryRunBloodHunterInstall,
  installBloodHunterModule,
  parseBloodHunterLabCliArgs,
  verifyBloodHunterInstall,
} from '../lab.ts';
import {
  assertInsideRoot,
  assertNoReparsePathComponents,
  createLabConfig,
} from '../labConfig.ts';
import { EXPECTED_DND5E_EXTERNAL_UUIDS } from '../build.ts';

const CLASSIC_LEVEL_ENTRY = process.env.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY?.trim()
  || 'F:\\FoundryLab\\foundry-v14\\app\\14.364\\node_modules\\classic-level\\index.js';
const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('Blood Hunter Lab safety boundary', () => {
  test('CLI modes require exact source/apply syntax', () => {
    expect(parseBloodHunterLabCliArgs(['dry-run'])).toEqual({ action: 'dry-run', apply: false });
    expect(parseBloodHunterLabCliArgs(['build', '--source=C:\\source.json'])).toEqual({ action: 'build', apply: false, sourcePath: 'C:\\source.json' });
    expect(parseBloodHunterLabCliArgs(['install', '--apply'])).toEqual({ action: 'install', apply: true });
    expect(parseBloodHunterLabCliArgs(['verify-install'])).toEqual({ action: 'verify-install', apply: false });
    expect(() => parseBloodHunterLabCliArgs(['install', '--apply', '--apply'])).toThrow();
    expect(() => parseBloodHunterLabCliArgs(['build'])).toThrow(/source/);
    expect(() => parseBloodHunterLabCliArgs(['verify-install', '--source=C:\\source.json'])).toThrow();
  });

  test('production, 8080, and lexical path escapes are rejected before Lab operations', async () => {
    const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), 'fvtt-bh-path-test-'));
    temporaryRoots.push(root);
    const repo = join(root, 'repo');
    await mkdir(repo, { recursive: true });
    expect(() => createLabConfig(repo, { FVTT_OPS_LAB_ROOT: join(root, 'production-lab') })).toThrow(/production/);
    expect(() => createLabConfig(repo, { FVTT_OPS_LAB_ROOT: join(root, 'lab'), FVTT_OPS_EVIDENCE_ROOT: join(root, '8080-evidence') })).toThrow(/8080/);
    expect(() => assertInsideRoot(join(root, 'lab'), join(root, 'lab', '..', 'escape'), 'test target')).toThrow(/escapes/);
  });

  test('reparse/junction components are refused when the host permits creating the test junction', async () => {
    const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), 'fvtt-bh-reparse-test-'));
    temporaryRoots.push(root);
    const approved = join(root, 'approved');
    const outside = join(root, 'outside');
    const junction = join(approved, 'junction');
    await mkdir(approved, { recursive: true });
    await mkdir(outside, { recursive: true });
    try {
      await symlink(outside, junction, 'junction');
    } catch {
      // Windows hosts without junction privileges still exercise the lexical escape gate above.
      return;
    }
    expect(() => assertNoReparsePathComponents(approved, join(junction, 'child'), 'test junction')).toThrow(/unsafe|reparse|escapes/i);
  });

  test('random temporary Lab install keeps static and Item-pack content consistent', async () => {
    const sandbox = await makeSandbox();
    const first = await installBloodHunterModule(sandbox.config, { apply: true, now: () => new Date('2026-08-04T01:02:03.000Z') });
    expect(first.changed).toBe(true);
    expect(first.backupPath).toBeUndefined();
    const verified = await verifyBloodHunterInstall(sandbox.config);
    expect(verified.manifestConsistent).toBe(true);
    expect(verified.packConsistent).toBe(true);
    expect(verified.staticConsistent).toBe(true);
    const dryRun = await dryRunBloodHunterInstall(sandbox.config);
    expect(dryRun.changed).toBe(false);
    expect(dryRun.manifestConsistent).toBe(true);
    expect(dryRun.packConsistent).toBe(true);
    expect(dryRun.staticConsistent).toBe(true);
    const paths = bloodHunterLabPaths(sandbox.config);
    expect(paths.destination.startsWith(sandbox.labRoot)).toBe(true);
  });

  test('Item packs use the v14 items sublevel, reject root pseudo-indexes, and tolerate equivalent runtime LevelDB layout changes', async () => {
    const sandbox = await makeSandbox();
    const paths = bloodHunterLabPaths(sandbox.config);
    const classPack = join(paths.buildRoot, 'packs', 'classes');
    const initialLayout = await readPackLayout(classPack);
    expect(initialLayout.rootKeys).toEqual(['!items!aaaaaaaaaaaaaaaa']);
    expect(initialLayout.itemKeys).toEqual(['aaaaaaaaaaaaaaaa']);
    expect(initialLayout.rootKeys).not.toContain('!index');

    await writeRootPseudoIndex(classPack);
    await expect(inspectModuleTree(paths.buildRoot, sandbox.config, true)).rejects.toThrow(/root-level !index pseudo-index/);

    const clean = await makeSandbox();
    const cleanPaths = bloodHunterLabPaths(clean.config);
    await installBloodHunterModule(clean.config, { apply: true, now: () => new Date('2026-08-04T04:00:00.000Z') });
    const beforeRuntimeRewrite = await inspectModuleTree(cleanPaths.destination, clean.config, true);
    await rewriteItemPackLayout(join(cleanPaths.destination, 'packs', 'classes'));
    const afterRuntimeRewrite = await inspectModuleTree(cleanPaths.destination, clean.config, true);
    expect(afterRuntimeRewrite.hash).not.toBe(beforeRuntimeRewrite.hash);

    const verified = await verifyBloodHunterInstall(clean.config);
    expect(verified.staticConsistent).toBe(true);
    expect(verified.manifestConsistent).toBe(true);
    expect(verified.packConsistent).toBe(true);
    expect(verified.buildHash).not.toBe(verified.installHash);
    expect((await dryRunBloodHunterInstall(clean.config)).changed).toBe(false);
  });

  test('owned pre-v14 pack layout is backed up and replaced instead of blocking reinstall', async () => {
    const sandbox = await makeSandbox();
    await installBloodHunterModule(sandbox.config, { apply: true, now: () => new Date('2026-08-04T05:00:00.000Z') });
    const paths = bloodHunterLabPaths(sandbox.config);
    await writeRootPseudoIndex(join(paths.destination, 'packs', 'classes'));

    const result = await installBloodHunterModule(sandbox.config, { apply: true, now: () => new Date('2026-08-04T05:01:00.000Z') });
    expect(result.changed).toBe(true);
    expect(result.backupPath).toBe(join(sandbox.config.backupRoot, 'fvtt-blood-hunter-2024', '2026-08-04T05-01-00-000Z', 'module'));
    expect(await readFile(join(result.backupPath!, 'data', 'owned-marker.json'), 'utf8')).toContain('fvtt-blood-hunter-2024');
    expect((await verifyBloodHunterInstall(sandbox.config)).packConsistent).toBe(true);
  });

  test('foreign same-ID and LevelDB LOCK targets are fail-closed', async () => {
    const foreign = await makeSandbox();
    const foreignPaths = bloodHunterLabPaths(foreign.config);
    await mkdir(join(foreignPaths.destination, 'data'), { recursive: true });
    await writeFile(join(foreignPaths.destination, 'data', 'owned-marker.json'), JSON.stringify({ owned: false, moduleId: 'other-module' }), 'utf8');
    await expect(dryRunBloodHunterInstall(foreign.config)).rejects.toThrow(/Foreign same-ID/);

    const locked = await makeSandbox();
    const lockedPaths = bloodHunterLabPaths(locked.config);
    await mkdir(join(lockedPaths.destination, 'data'), { recursive: true });
    await writeFile(join(lockedPaths.destination, 'data', 'owned-marker.json'), JSON.stringify({ owned: true, moduleId: 'fvtt-blood-hunter-2024', version: '1.0.0' }), 'utf8');
    await writeFile(join(lockedPaths.destination, 'LOCK'), 'synthetic lock', 'utf8');
    await expect(dryRunBloodHunterInstall(locked.config)).rejects.toThrow(/LOCK|occupied/);
  });

  test('failed atomic replacement restores the owned destination from backup', async () => {
    const sandbox = await makeSandbox();
    await installBloodHunterModule(sandbox.config, { apply: true, now: () => new Date('2026-08-04T02:00:00.000Z') });
    const paths = bloodHunterLabPaths(sandbox.config);
    const destinationBefore = await inspectModuleTree(paths.destination, sandbox.config, true);
    await writeFile(join(paths.buildRoot, 'scripts', 'index.js'), 'export const fixtureVersion = 2;\n', 'utf8');
    await writeFile(paths.zipPath, await createDeterministicZip(paths.buildRoot));
    const buildAfter = await inspectModuleTree(paths.buildRoot, sandbox.config, true);
    let renameCalls = 0;
    await expect(installBloodHunterModule(sandbox.config, {
      apply: true,
      now: () => new Date('2026-08-04T03:00:00.000Z'),
      rename: async (from, to) => {
        renameCalls += 1;
        if (renameCalls === 2) throw new Error('synthetic stage swap failure');
        const fs = await import('node:fs/promises');
        await fs.rename(from, to);
      },
    })).rejects.toThrow(/install failed|stage swap/);
    const destinationAfter = await inspectModuleTree(paths.destination, sandbox.config, true);
    expect(destinationAfter.hash).toBe(destinationBefore.hash);
    expect(destinationAfter.hash).not.toBe(buildAfter.hash);
    expect(renameCalls).toBeGreaterThanOrEqual(3);
  });
});

interface Sandbox {
  root: string;
  repoRoot: string;
  labRoot: string;
  config: ReturnType<typeof createLabConfig>;
}

async function makeSandbox(): Promise<Sandbox> {
  const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), 'fvtt-bh-lab-test-'));
  temporaryRoots.push(root);
  const repoRoot = join(root, 'repo');
  const labRoot = join(root, 'lab');
  await mkdir(repoRoot, { recursive: true });
  await mkdir(labRoot, { recursive: true });
  const config = createLabConfig(repoRoot, {
    FVTT_OPS_LAB_ROOT: labRoot,
    FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY: CLASSIC_LEVEL_ENTRY,
    FVTT_REFERENCE_CACHE_ROOT: join(root, 'reference-cache'),
  });
  const paths = bloodHunterLabPaths(config);
  await mkdir(join(paths.buildRoot, 'data'), { recursive: true });
  await mkdir(join(paths.buildRoot, 'scripts'), { recursive: true });
  await mkdir(join(paths.buildRoot, 'styles'), { recursive: true });
  await writeFile(join(paths.buildRoot, 'module.json'), await readFile(resolve(import.meta.dir, '../src/module.json')));
  await writeFile(join(paths.buildRoot, 'scripts', 'index.js'), 'export const fixtureVersion = 1;\n', 'utf8');
  await writeFile(join(paths.buildRoot, 'styles', 'migration.css'), '.fixture {}\n', 'utf8');
  const documents = {
    classes: [{ _id: 'aaaaaaaaaaaaaaaa', name: 'Fixture Class', type: 'class', img: 'icons/svg/book.svg', system: { activities: {} }, effects: [], flags: {} }],
    subclasses: [{ _id: 'bbbbbbbbbbbbbbbb', name: 'Fixture Subclass', type: 'subclass', img: 'icons/svg/book.svg', system: { activities: {} }, effects: [], flags: {} }],
    features: [{ _id: 'cccccccccccccccc', name: 'Fixture Feature', type: 'feat', img: 'icons/svg/book.svg', system: { activities: {} }, effects: [], flags: {} }],
  } as const;
  const identityDocuments = Object.entries(documents).flatMap(([pack, entries]) => entries.map((document) => ({ pack, id: document._id, uuid: moduleUuid(pack, document._id), name: document.name, type: document.type })));
  const identity = {
    schemaVersion: 1,
    moduleId: 'fvtt-blood-hunter-2024',
    version: '1.0.0',
    target: { foundry: '14.364', dnd5e: '5.3.3', rules: '2024', effectProfile: 'modded-v14' },
    sourceSha256: 'fixture-source',
    logicalHash: 'fixture-logical-hash',
    counts: { classes: 1, subclasses: 1, features: 1, ledger: 0, activities: 0 },
    packs: Object.entries(documents).map(([name, entries]) => ({ name, type: 'Item', documentIds: entries.map((entry) => entry._id), uuids: entries.map((entry) => moduleUuid(name, entry._id)) })),
    documents: identityDocuments,
    externalDnd5eUuids: [...EXPECTED_DND5E_EXTERNAL_UUIDS].sort(),
    externalReferenceContracts: [],
    activityCount: 0,
  };
  await writeFile(join(paths.buildRoot, 'data', 'identity-manifest.json'), `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  await writeFile(join(paths.buildRoot, 'data', 'owned-marker.json'), JSON.stringify({ schemaVersion: 1, owned: true, moduleId: 'fvtt-blood-hunter-2024', version: '1.0.0', logicalHash: identity.logicalHash }), 'utf8');
  await writeFile(join(paths.buildRoot, 'data', 'canonical-package.json'), '{}\n', 'utf8');
  await writeFile(join(paths.buildRoot, 'data', 'migration-contract.json'), '{}\n', 'utf8');
  await writeFile(join(paths.buildRoot, 'data', 'coverage-ledger.json'), '[]\n', 'utf8');
  await writeFile(join(paths.buildRoot, 'data', 'review.json'), '{}\n', 'utf8');
  for (const [pack, entries] of Object.entries(documents)) await writeLevelDbPack(join(paths.buildRoot, 'packs', pack), entries);
  await writeFile(paths.zipPath, await createDeterministicZip(paths.buildRoot));
  return { root, repoRoot, labRoot, config };
}

async function writeLevelDbPack(path: string, documents: readonly Record<string, unknown>[]): Promise<void> {
  const imported = await import(pathToFileURL(CLASSIC_LEVEL_ENTRY).href) as { ClassicLevel: new (path: string, options?: Record<string, unknown>) => any };
  const database = new imported.ClassicLevel(path, { createIfMissing: true, errorIfExists: true, keyEncoding: 'utf8', valueEncoding: 'json' });
  await database.open();
  try {
    const items = database.sublevel('items', { keyEncoding: 'utf8', valueEncoding: 'json' });
    for (const document of documents) await items.put(String(document._id), document);
  } finally {
    await database.close();
  }
  const fs = await import('node:fs/promises');
  await fs.unlink(join(path, 'LOCK')).catch(() => undefined);
}

async function readPackLayout(path: string): Promise<{ rootKeys: string[]; itemKeys: string[] }> {
  const imported = await import(pathToFileURL(CLASSIC_LEVEL_ENTRY).href) as { ClassicLevel: new (path: string, options?: Record<string, unknown>) => any };
  const database = new imported.ClassicLevel(path, { createIfMissing: false, readOnly: true, keyEncoding: 'utf8', valueEncoding: 'json' });
  await database.open();
  try {
    const items = database.sublevel('items', { keyEncoding: 'utf8', valueEncoding: 'json' });
    const rootKeys: string[] = [];
    for await (const [key] of database.iterator()) rootKeys.push(key);
    const itemKeys: string[] = [];
    for await (const [key] of items.iterator()) itemKeys.push(key);
    return { rootKeys: rootKeys.sort(), itemKeys: itemKeys.sort() };
  } finally {
    await database.close();
    await removeLevelDbLock(path);
  }
}

async function writeRootPseudoIndex(path: string): Promise<void> {
  const imported = await import(pathToFileURL(CLASSIC_LEVEL_ENTRY).href) as { ClassicLevel: new (path: string, options?: Record<string, unknown>) => any };
  const database = new imported.ClassicLevel(path, { createIfMissing: false, keyEncoding: 'utf8', valueEncoding: 'json' });
  await database.open();
  try {
    await database.put('!index', []);
  } finally {
    await database.close();
    await removeLevelDbLock(path);
  }
}

async function rewriteItemPackLayout(path: string): Promise<void> {
  const imported = await import(pathToFileURL(CLASSIC_LEVEL_ENTRY).href) as { ClassicLevel: new (path: string, options?: Record<string, unknown>) => any };
  const database = new imported.ClassicLevel(path, { createIfMissing: false, keyEncoding: 'utf8', valueEncoding: 'json' });
  await database.open();
  try {
    const items = database.sublevel('items', { keyEncoding: 'utf8', valueEncoding: 'json' });
    const entries = await items.iterator().all();
    const [key, value] = entries[0] ?? [];
    if (typeof key !== 'string') throw new Error('Synthetic runtime rewrite fixture needs an Item document.');
    await items.put(key, value);
  } finally {
    await database.close();
    await removeLevelDbLock(path);
  }
}

async function removeLevelDbLock(path: string): Promise<void> {
  const fs = await import('node:fs/promises');
  await fs.unlink(join(path, 'LOCK')).catch(() => undefined);
}

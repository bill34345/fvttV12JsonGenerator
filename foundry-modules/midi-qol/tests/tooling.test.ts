import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertArchiveEntryNames,
  assertInstallRuntimeIdle,
  assertPhysicalInstallPaths,
  assertWorkflowEffectContract,
  processesUsingDataRoot,
  validateTarget,
  verifyArchive,
  type TargetPolicy,
} from '../tooling';

const ownedRoots: string[] = [];
afterEach(async () => {
  for (const root of ownedRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('Midi-QOL patch scope (not runtime acceptance)', () => {
  test('patch is additive and limited to the three intended constructors', async () => {
    const patch = await readFile(resolve(import.meta.dir, '../patches/0001-dnd5e6-active-effect-base-type.patch'), 'utf8');
    const added = patch.split(/\r?\n/u).filter((line) => line.startsWith('+') && !line.startsWith('+++'));
    const removed = patch.split(/\r?\n/u).filter((line) => line.startsWith('-') && !line.startsWith('---'));
    expect(removed).toEqual([]);
    expect(added.filter((line) => line.includes('_id: foundry.utils.randomID()'))).toHaveLength(3);
    expect(added.filter((line) => line.includes('type: "base"'))).toHaveLength(3);
    expect(added.filter((line) => line.includes('system: { changes: [] }'))).toHaveLength(3);
    expect(added.some((line) => line.includes('system.type'))).toBe(false);
    expect(patch.split(/\r?\n/u).filter((line) => line.startsWith('diff --git '))).toEqual([
      'diff --git a/src/module/Workflow.ts b/src/module/Workflow.ts',
    ]);
  });

  test('build contract accepts local.3 cleanup constructors and rejects the local.2 system discriminator', () => {
    const source = [
      'async setupTemplateCleanup() { const effectData: ActiveEffect.CreateData = { _id: foundry.utils.randomID(), type: "base", system: { changes: [] } }; await actor.createEmbeddedDocuments("ActiveEffect", [effectData]); }',
      'const summonString = "Summon"; let effectData: ActiveEffect.CreateData; effectData = { _id: foundry.utils.randomID(), type: "base", system: { changes: [] } }; await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);',
      'const transformString = "Transform"; let effectData: ActiveEffect.CreateData; effectData = { _id: foundry.utils.randomID(), type: "base", system: { changes: [] } }; await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);',
    ].join('\n');
    expect(() => assertWorkflowEffectContract(source)).not.toThrow();
    expect(() => assertWorkflowEffectContract(source.replaceAll('system: { changes: [] }', 'system: { type: "base", changes: [] }')))
      .toThrow('template cleanup must create a base ActiveEffect with a fresh _id and changes-only system data.');
    expect(() => assertWorkflowEffectContract(source.replaceAll('_id: foundry.utils.randomID(), ', '')))
      .toThrow('template cleanup must create a base ActiveEffect with a fresh _id and changes-only system data.');
  });

});

describe('ServerNext install identity gate', () => {
  test.skipIf(process.platform !== 'win32')('detects a real process that references the data root in its command line', async () => {
    const root = resolve(tmpdir(), `midi-qol-process-${crypto.randomUUID()}`);
    const forwardRoot = root.replaceAll('\\', '/');
    ownedRoots.push(root);
    await mkdir(root, { recursive: true });
    const child = Bun.spawn([process.execPath, '-e', 'setTimeout(() => {}, 5000)', forwardRoot], {
      stdout: 'ignore', stderr: 'ignore',
    });
    try {
      const deadline = Date.now() + 3000;
      let matches: Awaited<ReturnType<typeof processesUsingDataRoot>> = [];
      do {
        matches = await processesUsingDataRoot(root);
        if (matches.some((item) => item.processId === child.pid)) break;
        await Bun.sleep(100);
      } while (Date.now() < deadline);
      expect(matches.map((item) => item.processId)).toContain(child.pid);
    } finally {
      child.kill();
      await child.exited;
    }
  });

  test('rejects a modules junction and preserves the external sentinel', async () => {
    const root = resolve(tmpdir(), `midi-qol-junction-${crypto.randomUUID()}`);
    const dataRoot = resolve(root, 'server-next');
    const outside = resolve(root, 'outside-modules');
    const sentinel = resolve(outside, 'sentinel.txt');
    ownedRoots.push(root);
    await mkdir(resolve(dataRoot, 'Data'), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(sentinel, 'preserve');
    await symlink(outside, resolve(dataRoot, 'Data/modules'), 'junction');
    await expect(assertPhysicalInstallPaths(dataRoot, resolve(dataRoot, 'Data/modules/midi-qol')))
      .rejects.toThrow(/symlink|junction|reparse/u);
    expect(await readFile(sentinel, 'utf8')).toBe('preserve');
  });

  test('rejects lock, listener, and data-root process ownership independently', () => {
    expect(() => assertInstallRuntimeIdle({ lockExists: true, portListening: false, processes: [] })).toThrow('options lock');
    expect(() => assertInstallRuntimeIdle({ lockExists: false, portListening: true, processes: [] })).toThrow('Port 30002');
    expect(() => assertInstallRuntimeIdle({
      lockExists: false, portListening: false, processes: [{ processId: 42, name: 'node.exe' }],
    })).toThrow('42');
    expect(() => assertInstallRuntimeIdle({ lockExists: false, portListening: false, processes: [] })).not.toThrow();
  });

  test('accepts the exact identity and rejects server-mirror', async () => {
    const root = resolve(tmpdir(), `midi-qol-target-${crypto.randomUUID()}`);
    const nextRoot = resolve(root, 'data/server-next');
    const mirrorRoot = resolve(root, 'data/server-mirror');
    ownedRoots.push(root);
    for (const dataRoot of [nextRoot, mirrorRoot]) {
      await mkdir(resolve(dataRoot, 'Data/worlds/cor-cotn'), { recursive: true });
      await mkdir(resolve(dataRoot, 'Data/systems/dnd5e'), { recursive: true });
      await writeFile(resolve(dataRoot, 'Data/worlds/cor-cotn/world.json'), JSON.stringify({
        id: 'cor-cotn', coreVersion: '14.368', systemVersion: '6.0.2',
      }));
      await writeFile(resolve(dataRoot, 'Data/systems/dnd5e/system.json'), JSON.stringify({ id: 'dnd5e', version: '6.0.2' }));
    }
    const policy: TargetPolicy = {
      dataRoot: nextRoot, world: 'cor-cotn', foundry: '14.368', dnd5e: '6.0.2', port: 30002,
    };
    await expect(validateTarget(nextRoot, policy)).resolves.toMatchObject({ world: 'cor-cotn', dnd5e: '6.0.2' });
    await expect(validateTarget(mirrorRoot, policy)).rejects.toThrow('Only the exact ServerNext data root');
  });

  test('rejects version drift', async () => {
    const root = resolve(tmpdir(), `midi-qol-version-${crypto.randomUUID()}`);
    ownedRoots.push(root);
    await mkdir(resolve(root, 'Data/worlds/cor-cotn'), { recursive: true });
    await mkdir(resolve(root, 'Data/systems/dnd5e'), { recursive: true });
    await writeFile(resolve(root, 'Data/worlds/cor-cotn/world.json'), JSON.stringify({
      id: 'cor-cotn', coreVersion: '14.368', systemVersion: '6.0.1',
    }));
    await writeFile(resolve(root, 'Data/systems/dnd5e/system.json'), JSON.stringify({ id: 'dnd5e', version: '6.0.1' }));
    const policy: TargetPolicy = { dataRoot: root, world: 'cor-cotn', foundry: '14.368', dnd5e: '6.0.2', port: 30002 };
    await expect(validateTarget(root, policy)).rejects.toThrow('world identity');
  });
});

describe('candidate archive gate', () => {
  test('rejects traversal, reserved, duplicate, and file-prefix conflicts', () => {
    expect(() => assertArchiveEntryNames(['midi-qol/', 'midi-qol/../evil'])).toThrow('Unsafe');
    expect(() => assertArchiveEntryNames(['midi-qol/', 'midi-qol/CON.txt'])).toThrow('reserved Windows');
    expect(() => assertArchiveEntryNames(['midi-qol/A.js', 'midi-qol/a.js'])).toThrow('duplicate');
    expect(() => assertArchiveEntryNames(['midi-qol/file', 'midi-qol/file/child'])).toThrow('conflicts');
  });

  test('rejects a manifest that references a missing resource', async () => {
    const root = resolve(tmpdir(), `midi-qol-archive-${crypto.randomUUID()}`);
    const module = resolve(root, 'midi-qol');
    const zip = resolve(root, 'candidate.zip');
    ownedRoots.push(root);
    await mkdir(module, { recursive: true });
    await writeFile(resolve(module, 'module.json'), JSON.stringify({
      id: 'midi-qol', version: 'test-version', esmodules: ['midi-qol.js'], styles: ['missing.css'],
    }));
    await writeFile(resolve(module, 'midi-qol.js'), 'export {};');
    await writeFile(resolve(module, 'LICENSE'), 'MIT');
    const tar = Bun.spawn(['tar', '-a', '-cf', zip, 'midi-qol'], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    expect(await tar.exited).toBe(0);
    await expect(verifyArchive(zip, 'test-version')).rejects.toThrow('missing file: missing.css');
  });
});

import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  CLASSPACK_MACRO_SENTINEL,
  CLASSPACK_PACK_IDENTITIES,
  CLASSPACK_RUNTIME_ENTRY,
  CLASSPACK_V14_VERSION,
  assertCompatibleMacroCommand,
  normalizeClasspackRuntimeSource,
  patchClasspackManifest,
  rewriteLegacySavingThrow,
  rewriteMidiMoveTokenOptions,
  rewritePixiPointerEvent,
  rewriteRollEvaluation,
  setClasspackActivation,
} from '../classpackV14';

describe('dnd5e classpack v14 compatibility workflow', () => {
  const exactRelationships = {
    systems: [{ id: 'dnd5e', type: 'system', compatibility: {} }],
    recommends: [{ id: 'midi-qol', type: 'module', compatibility: {} }],
  };

  test('converts the manifest into a local v14 fork without changing pack identities', () => {
    const packs = CLASSPACK_PACK_IDENTITIES.map(identity => ({ ...identity }));
    const original = {
      id: 'dnd5e_classpack',
      version: '4.3.4',
      compatibility: { minimum: '12', verified: '12', maximum: '13' },
      manifest: 'https://example.test/module.json',
      download: 'https://example.test/module.zip',
      packs,
      relationships: exactRelationships,
      flags: { dnd5e: { sourceBooks: {} } },
    };

    const patched = patchClasspackManifest(original);

    expect(patched.version).toBe(CLASSPACK_V14_VERSION);
    expect(patched.compatibility).toEqual({
      minimum: '14.364',
      verified: '14.364',
      maximum: '14.364',
    });
    expect(patched.manifest).toBeUndefined();
    expect(patched.download).toBeUndefined();
    expect(patched.esmodules).toEqual([CLASSPACK_RUNTIME_ENTRY]);
    expect(patched.packs).toEqual(packs);
    expect(patched.relationships).toEqual({
      systems: [{
        id: 'dnd5e',
        type: 'system',
        compatibility: { minimum: '5.3.3', verified: '5.3.3', maximum: '5.3.3' },
      }],
      recommends: [
        {
          id: 'midi-qol',
          type: 'module',
          compatibility: { minimum: '14.0.11', verified: '14.0.11', maximum: '14.0.11' },
        },
        {
          id: 'dae',
          type: 'module',
          compatibility: { minimum: '14.0.12', verified: '14.0.12', maximum: '14.0.12' },
        },
      ],
    });
    expect((patched.flags?.classpackV14 as Record<string, unknown>).backupCreated).toBe(false);
    expect((patched.flags?.classpackV14 as Record<string, unknown>).dataMigrationComplete).toBe(false);
  });

  test('preserves a completed runtime migration marker during repeat preparation', () => {
    const packs = CLASSPACK_PACK_IDENTITIES.map(identity => ({ ...identity }));
    const patched = patchClasspackManifest({
      id: 'dnd5e_classpack',
      version: '4.3.4-v14.1',
      packs,
      relationships: exactRelationships,
      flags: { classpackV14: { dataMigrationComplete: true } },
    });

    expect((patched.flags?.classpackV14 as Record<string, unknown>).dataMigrationComplete).toBe(true);
  });

  test('rejects a changed upstream pack surface', () => {
    const packs: Array<{ name: string; path: string; type: string; system: string }> =
      CLASSPACK_PACK_IDENTITIES.map(identity => ({ ...identity }));
    packs[0] = { ...CLASSPACK_PACK_IDENTITIES[0], path: 'packs/renamed-rtable' };
    expect(() => patchClasspackManifest({
      id: 'dnd5e_classpack',
      version: '4.3.4',
      packs,
      relationships: exactRelationships,
    })).toThrow('identity surface');
  });

  test('normalizes runtime assets so Windows checkouts remain dry-run stable', () => {
    expect(normalizeClasspackRuntimeSource('one\r\ntwo\r\n')).toBe('one\ntwo\n');
    expect(normalizeClasspackRuntimeSource('one\ntwo\n')).toBe('one\ntwo\n');
  });

  test('rewrites positional saving throws and preserves cancellation', () => {
    const source = '  const save = await actor.rollAbilitySave("dex", { flavor: `Save DC ${dc}` });\n  use(save.total);';
    const patched = rewriteLegacySavingThrow(source);

    expect(patched).toContain('const [save] = (await actor.rollSavingThrow(');
    expect(patched).toContain('{ ability: "dex" }');
    expect(patched).toContain('{ flavor: `Save DC ${dc}` }');
    expect(patched).toContain('if (!save) return;');
    expect(patched).not.toContain('rollAbilitySave');
  });

  test('rewrites Foundry and MIDI positional compatibility layers', () => {
    expect(rewritePixiPointerEvent('event.data.getLocalPosition(canvas.app.stage)'))
      .toBe('event.getLocalPosition(canvas.app.stage)');
    expect(rewriteRollEvaluation('new Roll("1d6").roll({async: true})', 1))
      .toBe('new Roll("1d6").evaluate()');
    expect(rewriteMidiMoveTokenOptions(
      'await MidiQOL.moveToken(token, { x: 1, y: 2 }, false);',
      0,
      1,
    )).toContain('{ teleport: true }');
    expect(rewriteMidiMoveTokenOptions(
      'await MidiQOL.moveToken(token, { x: 1, y: 2 }, Boolean(animate));',
      1,
      0,
    )).toContain('{ animate: Boolean(animate) }');
  });

  test('fails closed when an expected source shape drifts', () => {
    expect(() => rewriteLegacySavingThrow('actor.rollAbilitySave("dex")')).toThrow('expected 1');
    expect(() => rewritePixiPointerEvent('event.getLocalPosition(canvas.app.stage)')).toThrow('expected 1');
  });

  test('syntax-checks patched macro commands and rejects removed APIs', () => {
    const compatible = `// ${CLASSPACK_MACRO_SENTINEL}\n(async () => { const [save] = (await actor.rollSavingThrow({ ability: "con" })) ?? []; if (!save) return; })();`;
    expect(() => assertCompatibleMacroCommand(compatible, 'compatible')).not.toThrow();
    expect(() => assertCompatibleMacroCommand(
      '(async () => actor.rollAbilitySave("con"))();',
      'legacy',
    )).toThrow('removed rollAbilitySave');
  });

  test('runtime entry parent can be created for content-only upstream modules', async () => {
    const root = await mkdtemp(join(tmpdir(), 'classpack-v14-runtime-'));
    const runtimeFile = join(root, 'scripts', 'v14-migration.mjs');
    try {
      await mkdir(join(root, 'scripts'), { recursive: true });
      await writeFile(runtimeFile, '// runtime\n', 'utf8');
      expect(await readFile(runtimeFile, 'utf8')).toBe('// runtime\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('changes only classpack activation in the disposable world configuration', () => {
    const before = { dae: true, 'midi-qol': false, other: true };
    const after = setClasspackActivation(before, true);

    expect(after).toEqual({
      dae: true,
      'midi-qol': false,
      other: true,
      dnd5e_classpack: true,
    });
    expect(before).toEqual({ dae: true, 'midi-qol': false, other: true });
  });

  test('can restore only the disposable matrix MIDI state', () => {
    const before = { dae: true, 'midi-qol': true, dnd5e_classpack: true };
    const after = setClasspackActivation(before, undefined, false);

    expect(after).toEqual({
      dae: true,
      'midi-qol': false,
      dnd5e_classpack: true,
    });
  });

  test('runtime waits for DAE only when its auto-migration setting is enabled', async () => {
    const source = await readFile(
      join(process.cwd(), 'tools/foundry-ops/src/lab/assets/dnd5e-classpack-v14.mjs'),
      'utf8',
    );
    expect(source).toContain('game.settings.get("dae", "enableAutoMigration")');
    expect(source).toContain('|| !daeAutoMigration');
  });

  test('runtime skips completed data migration unless force is explicitly requested', async () => {
    const source = await readFile(
      join(process.cwd(), 'tools/foundry-ops/src/lab/assets/dnd5e-classpack-v14.mjs'),
      'utf8',
    );
    expect(source).toContain('dataMigrationComplete === true');
    expect(source).toContain('async function migrate({ force = false } = {})');
    expect(source).toContain('if (migrationComplete() && !force)');
    expect(source).toContain('migrationSkipped');
    expect(source).toContain('duplicatedTransferredEffectUuids');
    expect(source).toContain('removedDuplicateEffects');
    expect(source).toContain('Unexpected classpack identity change');
    expect(source).toContain('game.version !== EXPECTED_FOUNDRY_VERSION');
    expect(source).toContain('game.system.version !== EXPECTED_DND5E_VERSION');
    expect(source).toContain('daeModule.version !== EXPECTED_DAE_VERSION');
    expect(source).toContain('assertMigrationRuntime();');
  });
});

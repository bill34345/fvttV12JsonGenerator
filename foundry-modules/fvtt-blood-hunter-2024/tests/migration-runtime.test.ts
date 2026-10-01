import { describe, expect, test } from 'bun:test';

import {
  applyActorMigrationPlan,
  planActorMigration,
  validateMigratedActorProjection,
} from '../src/migration.ts';
import {
  applyOriginalMigration,
  actorToData,
  createMigratedCopy,
  type FoundryActorDocument,
} from '../src/runtime.ts';
import { clone } from '../src/migration.ts';
import { callumFixtureActor, dawnTarget, fixtureContract, fixturePackage } from './helpers.ts';
import type { ActorLike, RuntimeDocument } from '../src/contracts.ts';
import { projectRuntimeDocuments } from '../build.ts';
import { BLOOD_HUNTER_DND6_TARGET, BLOOD_HUNTER_V14_TARGET, compileBloodHunterV14Package } from '../../../packages/blood-hunter-v14/src/index.ts';
import { projectDnd6Advancements } from '../../../packages/blood-hunter-v14/src/dnd6-projection.ts';

const realSourcePath = process.env.FVTT_BLOOD_HUNTER_REAL_SOURCE_PATH;

function documentFor(actor: ActorLike, failFirstUpdate = false): { document: FoundryActorDocument; state: ActorLike; updates: unknown[][] } {
  let state = clone(actor);
  let shouldFail = failFirstUpdate;
  const updates: unknown[][] = [];
  const document = {
    _id: state._id,
    id: state._id,
    name: state.name,
    toObject: () => clone(state),
    update: async (data: { items: unknown[] }) => {
      updates.push(clone(data.items) as unknown[]);
      state.items = clone(data.items);
      if (shouldFail) {
        shouldFail = false;
        throw new Error('synthetic Foundry update failure');
      }
      return document;
    },
  } as FoundryActorDocument;
  return { document, get state() { return state; }, updates } as unknown as { document: FoundryActorDocument; state: ActorLike; updates: unknown[][] };
}

describe('Blood Hunter migration contract and runtime boundary', () => {
  test('copy restores only Foundry preCreate auto-filled blank identifier, then rechecks the whole system', async () => {
    const contract = fixtureContract(fixturePackage());
    const { actor } = callumFixtureActor(contract);
    (actor.system as Record<string, unknown>).identifier = '';
    const original = clone(actor);
    const plan = planActorMigration(actor, contract);
    const calls: string[] = [];
    const makeCopy = (data: ActorLike, extraSystem?: Record<string, unknown>, failUpdate: false | true | 'no-result' = false): FoundryActorDocument => {
      const state = clone(data);
      state._id = 'autofilledcopy01';
      (state.system as Record<string, unknown>).identifier = 'generated-from-copy-name';
      Object.assign(state.system as Record<string, unknown>, extraSystem);
      const document = {
        ...state,
        toObject: () => clone(state),
        update: async (changes: { 'system.identifier'?: string }) => {
          calls.push('update-identifier');
          if (failUpdate === true) throw new Error('synthetic update failure');
          if (failUpdate === 'no-result') return undefined;
          (state.system as Record<string, unknown>).identifier = changes['system.identifier'];
          return document;
        },
      } as FoundryActorDocument;
      return document;
    };
    const dependencies = {
      root: { game: { user: { isGM: true } } },
      saveJsonBackup: async () => { calls.push('backup'); },
      createActor: async (data: ActorLike) => { calls.push('create'); return makeCopy(data); },
    };
    const proof = await createMigratedCopy(actor as FoundryActorDocument, contract, plan, {}, dependencies);
    expect(proof.validation.ok).toBe(true);
    expect((proof.migratedData.system as Record<string, unknown>).identifier).toBe('');
    expect(calls).toEqual(['backup', 'create', 'update-identifier']);
    expect(actor).toEqual(original);

    calls.length = 0;
    await expect(createMigratedCopy(actor as FoundryActorDocument, contract, plan, {}, {
      ...dependencies,
      createActor: async (data) => makeCopy(data, { zzzOtherSavedField: 'changed' }),
    })).rejects.toThrow(/ACTOR_SYSTEM_CHANGED@system.zzzOtherSavedField/);
    expect(calls).toContain('update-identifier');
    expect(actor).toEqual(original);

    calls.length = 0;
    await expect(createMigratedCopy(actor as FoundryActorDocument, contract, plan, {}, {
      ...dependencies,
      createActor: async (data) => makeCopy(data, undefined, 'no-result'),
    })).rejects.toThrow(/identifier 恢复失败/);
    expect(calls).toContain('update-identifier');
    expect(actor).toEqual(original);

    calls.length = 0;
    await expect(createMigratedCopy(actor as FoundryActorDocument, contract, plan, {}, {
      ...dependencies,
      createActor: async (data) => makeCopy(data, undefined, true),
    })).rejects.toThrow(/identifier 恢复失败/);
    expect(calls).toContain('update-identifier');
    expect(actor).toEqual(original);
  });

  test('Foundry source snapshots ignore derived getters but still reject any saved Actor system change', () => {
    const source: ActorLike = {
      _id: 'sourceactor00001', name: 'Source test',
      system: { attributes: { hp: { value: 23, max: 30 } }, details: { level: 1 } }, items: [],
    };
    const transformed: ActorLike = clone(source);
    (transformed.system as any).details.level = 12;
    (transformed.system as any).attributes.hp.derived = 'computed';
    const document = { toObject: (raw = true) => clone(raw ? source : transformed) } as FoundryActorDocument;
    expect(actorToData(document)).toEqual(source);
    const changed = clone(source);
    (changed.system as any).attributes.hp.value = 24;
    const result = validateMigratedActorProjection(actorToData(document), changed, fixtureContract());
    const systemFinding = result.findings.find((finding) => finding.code === 'ACTOR_SYSTEM_CHANGED');
    expect(systemFinding?.path).toBe('system.attributes.hp.value');
    expect(systemFinding?.message).toContain('number → number');
    expect(systemFinding?.message).not.toContain('23');
    expect(systemFinding?.message).not.toContain('24');
  });

  test('copy validation reports the first saved system difference without revealing values', async () => {
    const contract = fixtureContract(fixturePackage());
    const { actor } = callumFixtureActor(contract);
    const plan = planActorMigration(actor, contract);
    let message = '';
    try {
      await createMigratedCopy(actor as FoundryActorDocument, contract, plan, {}, {
        root: { game: { user: { isGM: true } } },
        saveJsonBackup: async () => undefined,
        createActor: async (data) => {
          const created = clone(data);
          created._id = 'changedcopy00001';
          ((created.system as any).attributes.hp as Record<string, unknown>).value = 99;
          return { ...created, toObject: () => clone(created) } as FoundryActorDocument;
        },
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('ACTOR_SYSTEM_CHANGED@system.attributes.hp.value');
    expect(message).toContain('number → number');
    expect(message).not.toContain('99');
  });

  test('Foundry 14 creates a copy through game.actors.documentClass after the backup trigger', async () => {
    const contract = fixtureContract(fixturePackage());
    const { actor } = callumFixtureActor(contract);
    const plan = planActorMigration(actor, contract);
    const calls: string[] = [];
    const root = {
      game: { user: { isGM: true }, actors: { get: () => undefined, documentClass: { create: async (data: ActorLike) => {
        calls.push('ActorClass.create');
        const created = { ...clone(data), _id: 'copyv14actor001', id: 'copyv14actor001' };
        return { ...created, toObject: () => clone(created) } as FoundryActorDocument;
      } } } },
      foundry: { utils: { saveDataToFile: (data: string, type: string, name: string) => {
        expect(data).toContain('Callum');
        expect(type).toBe('application/json');
        expect(name).toMatch(/-backup\.json$/);
        calls.push('backup');
      } } },
    };
    const proof = await createMigratedCopy(actor as FoundryActorDocument, contract, plan, {}, { root });
    expect(calls).toEqual(['backup', 'ActorClass.create']);
    expect(proof.copyId).toBe('copyv14actor001');

    calls.length = 0;
    await expect(createMigratedCopy(actor as FoundryActorDocument, contract, plan, {}, {
      root,
      saveJsonBackup: async () => { calls.push('backup'); throw new Error('download unavailable'); },
    })).rejects.toThrow(/download unavailable/);
    expect(calls).toEqual(['backup']);

    calls.length = 0;
    await expect(createMigratedCopy(actor as FoundryActorDocument, contract, plan, {}, {
      root: { game: { user: { isGM: true }, actors: { get: () => undefined } } },
      saveJsonBackup: async () => { calls.push('backup'); },
    })).rejects.toThrow(/Actor Document API/);
    expect(calls).toEqual([]);
  });

  (realSourcePath ? test : test.skip)('real effect-only 幻惑 upgrades once after final Effect projection', async () => {
    const bytes = new Uint8Array(await Bun.file(realSourcePath!).arrayBuffer());
    const oldPackage = compileBloodHunterV14Package({ source: bytes, target: BLOOD_HUNTER_V14_TARGET });
    const newPackage = compileBloodHunterV14Package({ source: bytes, target: BLOOD_HUNTER_DND6_TARGET });
    const id = '05f48e10ec753fab';
    const oldItem = oldPackage.features.find((item) => item._id === id)!;
    expect(oldItem.name).toContain('幻惑');
    expect(Object.keys(oldItem.system.advancement ?? {})).toHaveLength(0);
    expect(oldItem.effects.length).toBeGreaterThan(0);
    // The prior installed pack already projected Effects, but retained the pre-projection Item hash.
    const oldInstalled = projectRuntimeDocuments([oldItem])[0]!;
    const oldHash = ((oldItem.flags as any).fvttJsonGenerator.bloodHunter2024 as Record<string, unknown>).logicalHash;
    ((oldInstalled.flags as any).fvttJsonGenerator.bloodHunter2024 as Record<string, unknown>).logicalHash = oldHash;
    const contract = fixtureContract(newPackage);
    contract.target = { foundry: '14.368', dnd5e: '6.0.2', rules: '2024', effectProfile: 'modded-v14' };
    contract.documents = projectRuntimeDocuments([...newPackage.classes, ...newPackage.subclasses, ...newPackage.features])
      .map((item) => clone(item) as unknown as RuntimeDocument);
    const oldClass = clone(contract.documents.find((item) => item._id === oldPackage.classes[0]!._id)!) as RuntimeDocument;
    ((oldClass.flags as any).fvttJsonGenerator.bloodHunter2024 as Record<string, unknown>).logicalHash =
      ((oldPackage.classes[0]!.flags as any).fvttJsonGenerator.bloodHunter2024 as Record<string, unknown>).logicalHash;
    expect(oldClass.system.levels).toBe(1);
    const actor: ActorLike = {
      _id: 'effectOnlyActor01', name: 'Effect migration',
      system: { attributes: { hp: { value: 23, max: 30 } } },
      items: [oldClass, clone(oldInstalled)],
    };
    const first = planActorMigration(actor, contract);
    expect(first.actions.find((action) => action.canonicalId === id)?.action).toBe('update');
    expect(first.actions.find((action) => action.canonicalId === oldClass._id)?.action).toBe('update');
    expect(first.actions.filter((action) => action.action === 'add')).toHaveLength(0);
    const migrated = applyActorMigrationPlan(actor, first);
    expect(migrated.items).toHaveLength(2);
    expect(migrated.system).toEqual(actor.system);
    expect((migrated.items as RuntimeDocument[]).find((item) => item._id === oldClass._id)?.system.levels).toBe(1);
    const updated = (migrated.items as RuntimeDocument[]).find((item) => item._id === id)!;
    expect(updated.effects.every((effect) => !('changes' in effect) && Array.isArray((effect.system as Record<string, unknown>).changes))).toBe(true);
    const second = planActorMigration(migrated, contract);
    expect(second.actions.find((action) => action.canonicalId === id)?.action).toBe('keep');
    expect(second.actions.find((action) => action.canonicalId === oldClass._id)?.action).toBe('keep');
  });

  test('Actor migration keeps projected Effect changes that Foundry 14 applies', () => {
    const pkg = fixturePackage();
    const contract = fixtureContract(pkg);
    contract.documents = projectRuntimeDocuments([...pkg.classes, ...pkg.subclasses, ...pkg.features])
      .map((item) => clone(item) as unknown as RuntimeDocument);
    const { actor, dawnId } = callumFixtureActor(contract);
    const plan = planActorMigration(actor, contract);
    const migrated = applyActorMigrationPlan(actor, plan);
    const dawn = (migrated.items as RuntimeDocument[]).find((item) => item._id === dawnId)!;
    expect(dawn.effects).toHaveLength(2);
    expect(dawn.effects.every((effect) => !('changes' in effect) && Array.isArray((effect.system as Record<string, unknown>).changes))).toBe(true);
    expect(dawn.effects.reduce((total, effect) => total + ((effect.system as Record<string, unknown>).changes as unknown[]).length, 0)).toBeGreaterThan(0);
  });

  test('old class and subclass are updated for dnd5e 6 Advancement shape, then stay current', () => {
    const oldPackage = fixturePackage();
    const newPackage = clone(oldPackage);
    newPackage.target = { ...BLOOD_HUNTER_DND6_TARGET, rules: '2024' };
    projectDnd6Advancements(newPackage);
    const contract = fixtureContract(newPackage);
    contract.target = { foundry: '14.368', dnd5e: '6.0.2', rules: '2024', effectProfile: 'modded-v14' };
    const oldClass = oldPackage.classes[0]!;
    const oldSubclass = oldPackage.subclasses[0]!;
    const actor: ActorLike = {
      _id: 'bloodhunteractor', name: 'Blood Hunter migration test', system: {},
      items: [clone(oldClass), clone(oldSubclass)],
    };
    const plan = planActorMigration(actor, contract);
    expect(plan.conflicts).toEqual([]);
    for (const oldItem of [oldClass, oldSubclass]) {
      const action = plan.actions.find((entry) => entry.canonicalId === oldItem._id);
      expect(action?.action).toBe('update');
      expect(action?.existingItemIds).toEqual([oldItem._id]);
    }
    const migrated = applyActorMigrationPlan(actor, plan);
    const after = planActorMigration(migrated, contract);
    for (const oldItem of [oldClass, oldSubclass]) {
      expect(after.actions.find((entry) => entry.canonicalId === oldItem._id)?.action).toBe('keep');
    }
  });

  test('Callum legacy Dawn preview is read-only and copy receives 5 Activities/2 Effects', async () => {
    const contract = fixtureContract(fixturePackage());
    const { actor, dawnId, nonBloodHunterId } = callumFixtureActor(contract);
    const before = clone(actor);
    const plan = planActorMigration(actor, contract);
    expect(plan.eligible).toBe(true);
    expect(plan.actions.find((action) => action.existingItemIds.includes(dawnId))?.action).toBe('update');

    const copyBackups: string[] = [];
    let createdCopy: FoundryActorDocument | undefined;
    const root = { game: { user: { isGM: true } } };
    const proof = await createMigratedCopy(
      actor as FoundryActorDocument,
      contract,
      plan,
      {},
      {
        root,
        saveJsonBackup: async (_data, fileName) => { copyBackups.push(fileName); },
        createActor: async (data) => {
          const copyData = { ...clone(data), _id: 'callum-copy0001', id: 'callum-copy0001' };
          createdCopy = {
            ...copyData,
            toObject: () => clone(copyData),
          } as FoundryActorDocument;
          return createdCopy;
        },
      },
    );

    expect(actor).toEqual(before);
    expect(copyBackups).toHaveLength(1);
    expect(proof.copyId).toBe('callum-copy0001');
    const copiedDawn = (proof.migratedData.items as Array<Record<string, unknown>>).find((item) => item._id === dawnId)!;
    expect(Object.keys((copiedDawn.system as Record<string, unknown>).activities as Record<string, unknown>)).toHaveLength(5);
    expect(copiedDawn.effects).toHaveLength(2);
    expect((proof.migratedData.items as Array<Record<string, unknown>>).find((item) => item._id === nonBloodHunterId)).toEqual((before.items as Array<Record<string, unknown>>).find((item) => item._id === nonBloodHunterId));
    expect(proof.validation.ok).toBe(true);
    expect(createdCopy).toBeDefined();
  });

  test('Apply original requires exact name, copy proof and JSON backup, and preserves projection', async () => {
    const contract = fixtureContract(fixturePackage());
    const { actor, dawnId } = callumFixtureActor(contract);
    const plan = planActorMigration(actor, contract);
    const backups: string[] = [];
    let copy: FoundryActorDocument | undefined;
    const root: Record<string, any> = { game: { user: { isGM: true }, actors: { get: () => copy } } };
    const proof = await createMigratedCopy(actor as FoundryActorDocument, contract, plan, {}, {
      root,
      saveJsonBackup: async (_data, fileName) => { backups.push(fileName); },
      createActor: async (data) => {
        const copyData = { ...clone(data), _id: 'callum-copy0002', id: 'callum-copy0002' };
        copy = { ...copyData, toObject: () => clone(copyData) } as FoundryActorDocument;
        return copy;
      },
    });
    await expect(applyOriginalMigration(actor as FoundryActorDocument, contract, proof, 'wrong', {}, { root })).rejects.toThrow();

    const originalDocument = documentFor(actor);
    const result = await applyOriginalMigration(originalDocument.document, contract, proof, 'Callum', {}, {
      root,
      saveJsonBackup: async (_data, fileName) => { backups.push(fileName); },
    });
    expect(result.validation.ok).toBe(true);
    expect(backups).toHaveLength(2);
    const afterDawn = (originalDocument.state.items as Array<Record<string, unknown>>).find((item) => item._id === dawnId)!;
    expect(Object.keys((afterDawn.system as Record<string, unknown>).activities as Record<string, unknown>)).toHaveLength(5);
    expect(afterDawn.effects).toHaveLength(2);
    expect(originalDocument.updates).toHaveLength(1);
  });

  test('Apply failure compensates through the Document API and restores the original item projection', async () => {
    const contract = fixtureContract(fixturePackage());
    const { actor } = callumFixtureActor(contract);
    const plan = planActorMigration(actor, contract);
    const documentState = documentFor(actor, true);
    const copy = { _id: 'copy-for-rollback', id: 'copy-for-rollback', name: 'Callum copy', items: actor.items, system: actor.system } as FoundryActorDocument;
    const root = { game: { user: { isGM: true }, actors: { get: () => copy } } };
    const proof = {
      actorId: String(actor._id),
      actorName: String(actor.name),
      copyId: 'copy-for-rollback',
      backup: clone(actor),
      backupFileName: 'copy-backup.json',
      migratedData: applyActorMigrationPlan(actor, plan),
      plan,
      validation: validateMigratedActorProjection(actor, applyActorMigrationPlan(actor, plan), contract),
    };
    await expect(applyOriginalMigration(documentState.document, contract, proof, 'Callum', {}, {
      root,
      saveJsonBackup: async () => undefined,
    })).rejects.toThrow(/rolled back|回滚|compensation|Apply/i);
    expect(documentState.updates).toHaveLength(2);
    expect(documentState.state.items).toEqual(actor.items);
  });

  test('Flagged hand edits stop until each conflict is explicitly Keep or Overwrite; Cancel stays fail-closed', () => {
    const contract = fixtureContract(fixturePackage());
    const target = dawnTarget(contract);
    const edited = clone(target);
    edited._id = 'edited-dawn00001';
    (edited.flags as any).fvttJsonGenerator.bloodHunter2024 = { canonicalId: target._id };
    edited.system.description = { value: 'GM hand edit' };
    const actor: ActorLike = { _id: 'edited-actor', name: 'Edited', system: {}, items: [edited] };
    const plan = planActorMigration(actor, contract);
    expect(plan.conflicts.some((conflict) => conflict.path === 'system.description')).toBe(true);
    expect(() => applyActorMigrationPlan(actor, plan)).toThrow();
    const keep = applyActorMigrationPlan(actor, plan, Object.fromEntries(plan.conflicts.map((conflict) => [`${conflict.itemId}:${conflict.path}`, 'Keep'])));
    expect((keep.items as Array<Record<string, unknown>>).find((item) => item._id === edited._id)!.system).toMatchObject({ description: { value: 'GM hand edit' } });
    expect(() => applyActorMigrationPlan(actor, plan, Object.fromEntries(plan.conflicts.map((conflict) => [`${conflict.itemId}:${conflict.path}`, 'Cancel'])))).toThrow();
  });

  test('Duplicate canonical or ambiguous legacy matches stop rather than deleting by name', () => {
    const contract = fixtureContract(fixturePackage());
    const target = dawnTarget(contract);
    const first = clone(target);
    const second = clone(target);
    first._id = 'duplicate-one0001';
    second._id = 'duplicate-two0001';
    const targetMetadata = (target.flags as any).fvttJsonGenerator.bloodHunter2024;
    (first.flags as any).fvttJsonGenerator.bloodHunter2024 = { ...clone(targetMetadata), canonicalId: target._id };
    (second.flags as any).fvttJsonGenerator.bloodHunter2024 = { ...clone(targetMetadata), canonicalId: target._id };
    const actor: ActorLike = { _id: 'duplicate-actor', name: 'Duplicate', system: {}, items: [first, second] };
    const plan = planActorMigration(actor, contract);
    const action = plan.actions.find((candidate) => candidate.canonicalId === target._id)!;
    expect(action.action).toBe('conflict');
    expect(() => applyActorMigrationPlan(actor, plan, { [`${first._id}:system.description`]: 'Keep', [`${second._id}:system.description`]: 'Keep' })).toThrow();
  });

  test('GM gate is enforced before copy creation', async () => {
    const contract = fixtureContract(fixturePackage());
    const { actor } = callumFixtureActor(contract);
    const plan = planActorMigration(actor, contract);
    await expect(createMigratedCopy(actor as FoundryActorDocument, contract, plan, {}, { root: { game: { user: { isGM: false } } } })).rejects.toThrow(/GM/);
  });

  test('stale Preview and migrated-copy proofs cannot authorize a changed Actor', async () => {
    const contract = fixtureContract(fixturePackage());
    const { actor } = callumFixtureActor(contract);
    const root = { game: { user: { isGM: true } } };
    const plan = planActorMigration(actor, contract);
    const changedAfterPreview = clone(actor);
    (changedAfterPreview.system as any).attributes.hp.value = 16;
    await expect(createMigratedCopy(changedAfterPreview as FoundryActorDocument, contract, plan, {}, {
      root,
      saveJsonBackup: async () => undefined,
      createActor: async () => { throw new Error('must not create from stale Preview'); },
    })).rejects.toThrow(/重新 Preview/);

    const proof = await createMigratedCopy(actor as FoundryActorDocument, contract, plan, {}, {
      root,
      saveJsonBackup: async () => undefined,
      createActor: async (data) => ({ ...clone(data), _id: 'copy-stale-proof', id: 'copy-stale-proof', toObject: () => ({ ...clone(data), _id: 'copy-stale-proof' }) }) as FoundryActorDocument,
    });
    const changedDocument = documentFor(actor);
    (changedDocument.state.system as any).attributes.hp.value = 15;
    await expect(applyOriginalMigration(changedDocument.document, contract, proof, 'Callum', {}, {
      root,
      saveJsonBackup: async () => undefined,
    })).rejects.toThrow(/创建迁移副本后 Actor 内容已变化/);
    expect(changedDocument.updates).toHaveLength(0);
  });
});

import { describe, expect, test } from 'bun:test';

import {
  applyActorMigrationPlan,
  planActorMigration,
  validateMigratedActorProjection,
} from '../src/migration.ts';
import {
  applyOriginalMigration,
  createMigratedCopy,
  type FoundryActorDocument,
} from '../src/runtime.ts';
import { clone } from '../src/migration.ts';
import { callumFixtureActor, dawnTarget, fixtureContract, fixturePackage } from './helpers.ts';
import type { ActorLike } from '../src/contracts.ts';

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

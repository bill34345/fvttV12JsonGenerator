import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildForgeItemRequest, convertFinalItemSource } from '@fvtt-json-generator/forge-browser-runtime';
import {
  hashArtifact,
  projectForgeItemDocument,
  type ForgeItemResponse,
  type ForgeItemSourceId,
  type JsonObject,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  createAcceptedForgeItem,
  forgeItemDocumentId,
  ForgeTemporaryItemCleanupError,
} from '../src/itemRuntime';

const SHIELD_SOURCE = readFileSync(resolve('obsidian/dnd数据转fvttjson/input/items/骑士之盾.md'), 'utf8');
let acceptedResponse: ForgeItemResponse;

beforeAll(async () => {
  acceptedResponse = await convertFinalItemSource(buildForgeItemRequest({
    content: SHIELD_SOURCE,
    sourceId: 'item:v1:123e4567-e89b-42d3-a456-426614174000' as ForgeItemSourceId,
    displayName: 'Shield',
    requestId: 'item-runtime-test',
    fvttVersion: '14.364',
    systemVersion: '5.3.3',
  }));
  if (!('result' in acceptedResponse) || acceptedResponse.result.status !== 'accepted') {
    throw new Error(`Expected accepted Item fixture: ${JSON.stringify(acceptedResponse)}`);
  }
});

describe('Forge world Item adapter', () => {
  test('creates once, readbacks complete flags, reuses exactly, and never changes Actor count', async () => {
    const world = makeWorld();
    const actorCount = world.game.actors.contents.length;
    const first = await createAcceptedForgeItem({ game: world.game, response: acceptedResponse });
    expect(first.status).toBe('created');
    expect(first.uuid).toBe(`Item.${first.item.id}`);
    expect(world.createCalls).toBe(1);
    expect(world.game.actors.contents).toHaveLength(actorCount);
    const flags = (first.item.toObject() as any).flags['fvtt-json-forge'];
    expect(flags).toEqual({
      protocolVersion: 1,
      requestId: acceptedResponse.requestId,
      sourceId: (acceptedResponse as any).result.sourceIdentity.sourceId,
      sourceHash: (acceptedResponse as any).result.sourceIdentity.sourceHash,
      artifactHash: (acceptedResponse as any).result.artifactHash,
      target: (acceptedResponse as any).result.target,
    });

    const second = await createAcceptedForgeItem({ game: world.game, response: acceptedResponse });
    expect(second.status).toBe('existing');
    expect(second.uuid).toBe(first.uuid);
    expect(world.createCalls).toBe(1);
    expect(world.game.actors.contents).toHaveLength(actorCount);
  });

  test('accepts Foundry V14 readback after dnd5e moves Item effect changes into system.changes', async () => {
    const world = makeWorld();
    world.mutateCreated = (data) => {
      const changed = clone(data) as Record<string, any>;
      for (const effect of changed.effects ?? []) {
        const legacyChanges = Array.isArray(effect.changes) ? effect.changes : [];
        const canonicalChanges = Array.isArray(effect.system?.changes) ? effect.system.changes : [];
        const normalizedChanges = (canonicalChanges.length > 0
          ? canonicalChanges
          : legacyChanges.map((change: Record<string, unknown>) => ({
            key: change.key,
            type: change.mode,
            value: change.value,
            phase: change.priority,
          }))).map((change: Record<string, unknown>) => ({
            ...change,
            mode: change.type === 'add' ? 2 : change.type === 'override' ? 5 : change.mode,
          }));
        effect.system = {
          ...(effect.system ?? {}),
          changes: normalizedChanges,
        };
        effect.changes = normalizedChanges;
      }
      return changed;
    };

    const first = await createAcceptedForgeItem({ game: world.game, response: acceptedResponse });
    expect(first.status).toBe('created');
    const second = await createAcceptedForgeItem({ game: world.game, response: acceptedResponse });
    expect(second.status).toBe('existing');
    expect(second.uuid).toBe(first.uuid);
    expect(world.createCalls).toBe(1);
  });

  test('normalizes Foundry-added non-override Activity defaults without hiding active semantics', () => {
    if (!('result' in acceptedResponse) || acceptedResponse.result.status !== 'accepted') {
      throw new Error('Missing accepted fixture.');
    }
    const expected = clone(acceptedResponse.result.artifact) as Record<string, any>;
    const activity = Object.values(expected.system.activities)[0] as Record<string, any>;
    delete activity.description;
    activity.range = { override: false };
    activity.target = { override: false, template: { units: '' }, affects: { type: 'self' } };
    const readback = clone(expected) as Record<string, any>;
    const readbackActivity = Object.values(readback.system.activities)[0] as Record<string, any>;
    readbackActivity.description = {};
    readbackActivity.range.units = 'self';
    readbackActivity.target.template.units = 'ft';
    expected.system.armor.magicalBonus = null;
    delete readback.system.armor.magicalBonus;

    expect(projectForgeItemDocument(readback)).toEqual(projectForgeItemDocument(expected));
    expect(projectForgeItemDocument(readback).activities[0]?.target).toMatchObject({
      override: false,
      affects: { type: 'self' },
    });
  });

  test('fails closed when legacy and canonical Item effect changes conflict', async () => {
    const world = makeWorld();
    world.mutateCreated = (data) => {
      const changed = clone(data) as Record<string, any>;
      const effect = changed.effects?.[0];
      if (effect) {
        effect.system = {
          ...(effect.system ?? {}),
          changes: [{ key: 'system.attributes.ac.bonus', type: 'add', value: '+1', phase: 'initial' }],
        };
        effect.changes = [{ key: 'system.attributes.ac.bonus', mode: 'add', value: '+2', priority: 'initial' }];
      }
      return changed;
    };

    await expect(createAcceptedForgeItem({ game: world.game, response: acceptedResponse }))
      .rejects.toThrow(/cannot be projected/u);
    expect(world.items).toEqual([]);
    expect(world.deletedIds).toHaveLength(1);
  });

  test('reuses the atomic deterministic-ID winner after a concurrent create rejection', async () => {
    const world = makeWorld();
    world.onCreate = async (data) => {
      const winner = world.addExisting(data);
      throw Object.assign(new Error('duplicate deterministic id'), { winner });
    };
    const result = await createAcceptedForgeItem({ game: world.game, response: acceptedResponse });
    expect(result.status).toBe('existing');
    expect(world.createCalls).toBe(1);
    expect(world.items).toHaveLength(1);
  });

  test('rejects same-source hash conflicts, duplicate claims, and foreign deterministic-ID collisions without writes', async () => {
    const conflictingResponse = changedAcceptedResponse();

    const sourceConflict = makeWorld();
    const existing = await createAcceptedForgeItem({ game: sourceConflict.game, response: acceptedResponse });
    await expect(createAcceptedForgeItem({ game: sourceConflict.game, response: conflictingResponse })).rejects.toThrow(/different artifact hash/u);
    expect(sourceConflict.items.map((item) => item.uuid)).toEqual([existing.uuid]);
    expect(sourceConflict.createCalls).toBe(1);

    const duplicate = makeWorld();
    const created = await createAcceptedForgeItem({ game: duplicate.game, response: acceptedResponse });
    duplicate.addExisting(created.item.toObject() as Record<string, unknown>, 'second-claim-id');
    await expect(createAcceptedForgeItem({ game: duplicate.game, response: acceptedResponse })).rejects.toThrow(/Multiple existing Items/u);
    expect(duplicate.createCalls).toBe(1);

    const foreign = makeWorld();
    const sourceId = (acceptedResponse as any).result.sourceIdentity.sourceId;
    foreign.addExisting({ _id: forgeItemDocumentId(sourceId), name: 'Foreign Item', flags: {} });
    await expect(createAcceptedForgeItem({ game: foreign.game, response: acceptedResponse })).rejects.toThrow(/occupied/u);
    expect(foreign.createCalls).toBe(0);
  });

  test('rejects a matching source claim at the wrong deterministic ID without writes or cleanup', async () => {
    const seed = makeWorld();
    const created = await createAcceptedForgeItem({ game: seed.game, response: acceptedResponse });
    const world = makeWorld();
    const actorCount = world.game.actors.contents.length;
    const wrongIdClaim = world.addExisting(created.item.toObject() as Record<string, unknown>, 'wrong-source-claim');

    await expect(createAcceptedForgeItem({ game: world.game, response: acceptedResponse }))
      .rejects.toThrow(/instead of its deterministic ID/u);
    expect(world.createCalls).toBe(0);
    expect(world.items).toEqual([wrongIdClaim]);
    expect(world.deletedIds).toEqual([]);
    expect(world.game.actors.contents).toHaveLength(actorCount);
  });

  test('rejects needs_review, failed, wrong runtime, and non-GM input before world creation', async () => {
    const world = makeWorld();
    const needsReview = responseWithStatus('needs_review');
    const failed = responseWithStatus('failed');
    await expect(createAcceptedForgeItem({ game: world.game, response: needsReview })).rejects.toThrow(/accepted/u);
    await expect(createAcceptedForgeItem({ game: world.game, response: failed })).rejects.toThrow(/accepted/u);
    world.game.user.isGM = false;
    await expect(createAcceptedForgeItem({ game: world.game, response: acceptedResponse })).rejects.toThrow(/GM/u);
    world.game.user.isGM = true;
    world.game.version = '14.365';
    await expect(createAcceptedForgeItem({ game: world.game, response: acceptedResponse })).rejects.toThrow(/14\.364/u);
    expect(world.createCalls).toBe(0);
    expect(world.items).toHaveLength(0);
  });

  test('deletes only the newly created Item after readback drift', async () => {
    const world = makeWorld();
    const preexisting = world.addExisting({ _id: 'preexisting-item', name: 'Keep Me', flags: {} });
    world.mutateCreated = (data) => ({ ...data, name: 'Readback Drift' });
    await expect(createAcceptedForgeItem({ game: world.game, response: acceptedResponse })).rejects.toThrow(/readback does not match/u);
    expect(world.items).toEqual([preexisting]);
    expect(world.deletedIds).toHaveLength(1);
    expect(world.deletedIds).not.toContain('preexisting-item');
  });

  test('rejects and cleans up newly created Items when Item or Activity descriptions drift', async () => {
    const mutations: Array<(data: Record<string, any>) => void> = [
      (data) => { data.system.description.value = 'Truncated Item description'; },
      (data) => {
        const firstActivity = Object.values(data.system.activities)[0] as Record<string, any>;
        firstActivity.description.chatFlavor = 'Truncated Activity description';
      },
    ];
    for (const mutate of mutations) {
      const world = makeWorld();
      const actorCount = world.game.actors.contents.length;
      world.mutateCreated = (data) => {
        const changed = clone(data) as Record<string, any>;
        mutate(changed);
        return changed;
      };
      await expect(createAcceptedForgeItem({ game: world.game, response: acceptedResponse }))
        .rejects.toThrow(/readback does not match/u);
      expect(world.items).toEqual([]);
      expect(world.deletedIds).toHaveLength(1);
      expect(world.game.actors.contents).toHaveLength(actorCount);
    }
  });

  test('rejects and cleans up a created Item when Foundry changes normalized Activity semantics', async () => {
    const world = makeWorld();
    const actorCount = world.game.actors.contents.length;
    world.mutateCreated = (data) => {
      const changed = clone(data) as Record<string, any>;
      const bash = Object.values(changed.system.activities)
        .find((activity: any) => activity.name === '强力猛击 (Forceful Bash)') as Record<string, any>;
      bash.activation.type = 'reaction';
      bash.range.value = '10';
      return changed;
    };

    await expect(createAcceptedForgeItem({ game: world.game, response: acceptedResponse }))
      .rejects.toThrow(/readback does not match/u);
    expect(world.items).toEqual([]);
    expect(world.deletedIds).toHaveLength(1);
    expect(world.game.actors.contents).toHaveLength(actorCount);
  });

  test('surfaces the exact Item UUID when cleanup of a failed readback also fails', async () => {
    const world = makeWorld();
    world.mutateCreated = (data) => ({ ...data, name: 'Readback Drift' });
    world.deleteFails = true;
    let caught: unknown;
    try {
      await createAcceptedForgeItem({ game: world.game, response: acceptedResponse });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ForgeTemporaryItemCleanupError);
    expect((caught as ForgeTemporaryItemCleanupError).itemUuid).toMatch(/^Item\.[A-Za-z0-9]{16}$/u);
    expect((caught as Error).message).toContain((caught as ForgeTemporaryItemCleanupError).itemUuid);
  });

  test('leaves the world unchanged on an ordinary create failure', async () => {
    const world = makeWorld();
    const preexisting = world.addExisting({ _id: 'keep-item', name: 'Keep', flags: {} });
    world.onCreate = async () => { throw new Error('create failed'); };
    await expect(createAcceptedForgeItem({ game: world.game, response: acceptedResponse })).rejects.toThrow(/create failed/u);
    expect(world.items).toEqual([preexisting]);
    expect(world.deletedIds).toEqual([]);
  });
});

function changedAcceptedResponse(): ForgeItemResponse {
  if (!('result' in acceptedResponse) || acceptedResponse.result.status !== 'accepted') throw new Error('Missing accepted fixture.');
  const artifact = { ...acceptedResponse.result.artifact, name: `${acceptedResponse.result.artifact.name} changed` } as JsonObject;
  return {
    ...acceptedResponse,
    result: {
      ...acceptedResponse.result,
      artifact,
      artifactHash: hashArtifact(artifact),
      itemVerification: { ...acceptedResponse.result.itemVerification, name: String(artifact.name) },
      itemDocument: { ...acceptedResponse.result.itemDocument, name: String(artifact.name) },
    },
  };
}

function responseWithStatus(status: 'needs_review' | 'failed'): ForgeItemResponse {
  if (!('result' in acceptedResponse) || acceptedResponse.result.status !== 'accepted') throw new Error('Missing accepted fixture.');
  const diagnostic = status === 'failed'
    ? { code: 'FAILED', severity: 'error' as const, stage: 'semantic' as const, path: 'item' as const, message: 'Failed.' }
    : { code: 'REVIEW', severity: 'warning' as const, stage: 'semantic' as const, path: 'item' as const, message: 'Review.' };
  const { artifactHash: _artifactHash, ...withoutHash } = acceptedResponse.result;
  return {
    protocolVersion: 1,
    requestId: acceptedResponse.requestId,
    result: {
      ...withoutHash,
      ...(status === 'failed' ? { artifact: undefined } : {}),
      status,
      diagnostics: [diagnostic],
      verification: { status, mechanicsCoverage: [] },
    } as any,
  };
}

function makeWorld() {
  const items: FakeItem[] = [];
  const deletedIds: string[] = [];
  const state: any = {
    items,
    deletedIds,
    createCalls: 0,
    deleteFails: false,
    mutateCreated: undefined as ((data: Record<string, unknown>) => Record<string, unknown>) | undefined,
    onCreate: undefined as ((data: Record<string, unknown>) => Promise<FakeItem>) | undefined,
  };
  const collection = {
    contents: items,
    get: (id: string) => items.find((item) => item.id === id),
    documentClass: {
      create: async (data: Record<string, unknown>) => {
        state.createCalls += 1;
        if (state.onCreate) return state.onCreate(data);
        return state.addExisting(state.mutateCreated ? state.mutateCreated(clone(data)) : data);
      },
    },
  };
  state.addExisting = (data: Record<string, unknown>, overrideId?: string) => {
    const payload = clone(data);
    if (overrideId) payload._id = overrideId;
    const item = new FakeItem(payload, () => {
      if (state.deleteFails) throw new Error('delete failed');
      const index = items.indexOf(item);
      if (index >= 0) items.splice(index, 1);
      deletedIds.push(item.id!);
    });
    items.push(item);
    return item;
  };
  state.game = {
    version: '14.364',
    system: { id: 'dnd5e', version: '5.3.3' },
    user: { isGM: true },
    items: collection,
    actors: { contents: [{ id: 'control-actor' }] },
  };
  return state as {
    items: FakeItem[];
    deletedIds: string[];
    createCalls: number;
    deleteFails: boolean;
    mutateCreated?: (data: Record<string, unknown>) => Record<string, unknown>;
    onCreate?: (data: Record<string, unknown>) => Promise<FakeItem>;
    addExisting: (data: Record<string, unknown>, overrideId?: string) => FakeItem;
    game: any;
  };
}

class FakeItem {
  public readonly id: string;
  public readonly uuid: string;
  public readonly flags: Record<string, unknown>;

  public constructor(private readonly data: Record<string, unknown>, private readonly onDelete: () => void) {
    this.id = String(data._id);
    this.uuid = `Item.${this.id}`;
    this.flags = (data.flags ?? {}) as Record<string, unknown>;
  }

  public toObject(): unknown { return clone(this.data); }
  public async delete(): Promise<void> { this.onDelete(); }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

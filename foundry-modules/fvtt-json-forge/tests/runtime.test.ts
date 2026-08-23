import { beforeAll, describe, expect, test } from 'bun:test';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { hashArtifact, type ForgeActorResponse, type JsonObject } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  createAcceptedForgeActor,
  ForgeTemporaryActorCleanupError,
  MODULE_ID,
  type ForgeActorCreateResult,
  type ForgeActorCollectionLike,
  type ForgeActorLike,
  type ForgeGameLike,
} from '../src/runtime';

let acceptedResponse: ForgeActorResponse;

beforeAll(async () => {
  const source = await Bun.file('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md').text();
  acceptedResponse = await convertFinalActorSource(buildForgeActorRequest({
    content: source,
    displayName: 'Forge Actor',
    requestId: 'runtime-test',
    fvttVersion: '14.364',
    systemVersion: '5.3.3',
  }));
  if (!('result' in acceptedResponse) || acceptedResponse.result.status !== 'accepted') {
    throw new Error(`Expected an accepted response fixture: ${JSON.stringify(acceptedResponse)}`);
  }
});

describe('Foundry Forge Actor creation boundary', () => {
  test('uses one final world write for the complete identified Actor and verifies readback', async () => {
    const collection = new FakeActorCollection();
    const game = supportedGame(collection);
    const result = await createAcceptedForgeActor({ game, response: acceptedResponse });

    expect(result.status).toBe('created');
    expect(result.uuid).toMatch(/^Actor\.[0-9a-f]{16}$/u);
    expect(collection.contents).toHaveLength(1);
    expect(collection.createInputs[0]).toMatchObject({
      name: expect.any(String),
      items: expect.any(Array),
      flags: { [MODULE_ID]: { sourceId: result.sourceId, artifactHash: result.artifactHash } },
    });
    expect(collection.createInputs[0]?.name).not.toBe('[Forge import pending]');
    expect(collection.contents[0]!.toObject()).toMatchObject({
      flags: {
        [MODULE_ID]: {
          protocolVersion: 1,
          requestId: acceptedResponse.requestId,
          sourceId: result.sourceId,
          sourceHash: expect.any(String),
          artifactHash: result.artifactHash,
        },
      },
    });
  });

  test('does not use a recovery journal or a partially populated world Actor', async () => {
    const collection = new FakeActorCollection();
    await createAcceptedForgeActor({ game: supportedGame(collection), response: acceptedResponse });
    expect(collection.createInputs).toHaveLength(1);
    expect(collection.createInputs[0]).toMatchObject({
      name: expect.any(String),
      type: 'npc',
      system: expect.any(Object),
      items: expect.any(Array),
      flags: { [MODULE_ID]: { sourceId: expect.any(String), artifactHash: expect.any(String) } },
    });
    expect(JSON.stringify(collection.createInputs[0])).not.toContain('[Forge import pending]');
  });

  test('returns the same Actor on repeated confirmation and rejects a same-source hash conflict', async () => {
    const collection = new FakeActorCollection();
    const game = supportedGame(collection);
    const first = await createAcceptedForgeActor({ game, response: acceptedResponse });
    const existing = await createAcceptedForgeActor({ game, response: acceptedResponse });
    expect(existing.status).toBe('existing');
    expect(existing.uuid).toBe(first.uuid);
    expect(collection.createCount).toBe(1);

    const conflicting = conflictingResponse(acceptedResponse);
    await expect(createAcceptedForgeActor({ game, response: conflicting })).rejects.toThrow(/different artifact hash/u);
    expect(collection.createCount).toBe(1);
  });

  test('reuses the existing Actor after a fresh conversion of the same final source', async () => {
    if (!('result' in acceptedResponse) || acceptedResponse.result.status !== 'accepted') {
      throw new Error('Accepted response fixture required.');
    }
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md').text();
    const common = {
      content: source,
      sourceId: acceptedResponse.result.sourceIdentity.sourceId,
      displayName: 'Forge Actor',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    } as const;
    const firstResponse = await convertFinalActorSource(buildForgeActorRequest({ ...common, requestId: 'fresh-first' }));
    await Bun.sleep(25);
    const secondResponse = await convertFinalActorSource(buildForgeActorRequest({ ...common, requestId: 'fresh-second' }));
    if (!('result' in firstResponse) || firstResponse.result.status !== 'accepted') throw new Error('First fresh response was not accepted.');
    if (!('result' in secondResponse) || secondResponse.result.status !== 'accepted') throw new Error('Second fresh response was not accepted.');
    expect(secondResponse.result.artifactHash).toBe(firstResponse.result.artifactHash);

    const collection = new FakeActorCollection();
    const game = supportedGame(collection);
    const created = await createAcceptedForgeActor({ game, response: firstResponse });
    const reused = await createAcceptedForgeActor({ game, response: secondResponse });
    expect(reused).toMatchObject({ status: 'existing', uuid: created.uuid });
    expect(collection.createCount).toBe(1);
    expect(collection.contents).toHaveLength(1);
  });

  test('rejects a matching-flags existing Actor when its readback semantics are corrupt', async () => {
    const collection = new FakeActorCollection();
    const game = supportedGame(collection);
    await createAcceptedForgeActor({ game, response: acceptedResponse });
    collection.contents[0]!.data.name = 'CORRUPT';

    await expect(createAcceptedForgeActor({ game, response: acceptedResponse })).rejects.toThrow(/failed readback verification/u);
    expect(collection.createCount).toBe(1);
    expect(collection.contents).toHaveLength(1);
    expect(collection.contents[0]!.deleted).toBe(false);
  });

  test.each([
    ['creature type', (actor: FakeActor) => { actor.data.system.details.type = { value: 'construct' }; }],
    ['ability score', (actor: FakeActor) => { actor.data.system.abilities.str.value += 1; }],
  ] as const)('rejects reusable Actor readback with corrupt %s', async (_name, corrupt) => {
    const collection = new FakeActorCollection();
    const game = supportedGame(collection);
    await createAcceptedForgeActor({ game, response: acceptedResponse });
    corrupt(collection.contents[0]!);

    await expect(createAcceptedForgeActor({ game, response: acceptedResponse })).rejects.toThrow(/failed readback verification/u);
    expect(collection.createCount).toBe(1);
    expect(collection.contents[0]!.deleted).toBe(false);
  });

  test('uses one deterministic database ID so concurrent confirmations cannot create duplicates', async () => {
    const createStarted = deferred<void>();
    const releaseCreate = deferred<void>();
    const collection = new FakeActorCollection({
      createGate: releaseCreate.promise,
      onCreateStarted: () => createStarted.resolve(),
    });
    const game = supportedGame(collection);

    const first = createAcceptedForgeActor({ game, response: acceptedResponse });
    await createStarted.promise;
    const second = createAcceptedForgeActor({ game, response: acceptedResponse });
    releaseCreate.resolve();
    const settled = await Promise.allSettled([first, second]);

    expect(settled.every((entry) => entry.status === 'fulfilled')).toBe(true);
    const fulfilled = settled.filter((entry): entry is PromiseFulfilledResult<ForgeActorCreateResult> => entry.status === 'fulfilled');
    expect(fulfilled.map((entry) => entry.value.status).sort()).toEqual(['created', 'existing']);
    expect(new Set(fulfilled.map((entry) => entry.value.uuid)).size).toBe(1);
    expect(collection.createCount).toBe(1);
    expect(collection.contents).toHaveLength(1);
  });

  test('uses the same sourceId claim for concurrent different artifacts', async () => {
    const createStarted = deferred<void>();
    const releaseCreate = deferred<void>();
    const collection = new FakeActorCollection({
      createGate: releaseCreate.promise,
      onCreateStarted: () => createStarted.resolve(),
    });
    const game = supportedGame(collection);
    const conflicting = conflictingResponse(acceptedResponse);

    const first = createAcceptedForgeActor({ game, response: acceptedResponse });
    await createStarted.promise;
    const second = createAcceptedForgeActor({ game, response: conflicting });
    releaseCreate.resolve();
    const settled = await Promise.allSettled([first, second]);

    expect(settled.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter((entry) => entry.status === 'rejected')).toHaveLength(1);
    expect(collection.createCount).toBe(1);
    expect(collection.contents).toHaveLength(1);
  });

  test('rejects a foreign Actor occupying the deterministic ID without modifying or deleting it', async () => {
    if (!('result' in acceptedResponse) || acceptedResponse.result.status !== 'accepted') throw new Error('Accepted response fixture required.');
    const { sourceId } = acceptedResponse.result.sourceIdentity;
    const documentId = hashArtifact({ sourceId }).slice(0, 16);
    const collection = new FakeActorCollection();
    const foreign = collection.seed({ _id: documentId, name: 'Existing non-Forge Actor', type: 'npc' });

    await expect(createAcceptedForgeActor({ game: supportedGame(collection), response: acceptedResponse })).rejects.toThrow(/already occupied/u);
    expect(collection.createCount).toBe(0);
    expect(collection.contents).toEqual([foreign]);
    expect(foreign.deleted).toBe(false);
  });

  test('adapts one thrown long range to the Foundry parent Item without changing the protocol artifact', async () => {
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/white-tusk-orc.md').text();
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: source,
      displayName: 'White Tusk Orc',
      requestId: 'runtime-thrown-range',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }));
    if (!('result' in response) || response.result.status !== 'accepted') {
      throw new Error(`Expected an accepted thrown-range response: ${JSON.stringify(response)}`);
    }
    const sourceArtifact = response.result.artifact;
    const javelinArtifact = (sourceArtifact.items as Array<Record<string, any>>).find((item) => item.name === 'Javelin');
    if (!javelinArtifact) throw new Error('Expected the White Tusk Orc fixture to contain a Javelin item.');
    expect(javelinArtifact?.system?.range?.long).toBeNull();
    expect(javelinArtifact?.system?.activities).toMatchObject({
      [Object.keys(javelinArtifact.system.activities)[0]!]: { range: { value: 30, long: 120 } },
    });

    const collection = new FakeActorCollection();
    const result = await createAcceptedForgeActor({ game: supportedGame(collection), response });
    const imported = collection.contents[0]!.toObject() as Record<string, any>;
    const javelinImported = (imported.items as Array<Record<string, any>>).find((item) => item.name === 'Javelin');
    expect(result.status).toBe('created');
    expect(javelinImported?.system?.range?.long).toBe(120);
    expect(Object.values(javelinImported?.system?.activities ?? {})[0]).not.toHaveProperty('range.long');
    expect(hashArtifact(sourceArtifact)).toBe(response.result.artifactHash);
  });

  test.each([
    ['Fireball', '23af52db33017be0', 'Compendium.dnd5e.spells.Item.ztgcdrWPshKRpFd0'],
    ['AlterSelf', 'e2de216f26943e8b', 'Compendium.dnd5e.spells.Item.8RTDOt80u8aBv9qx'],
  ] as const)('qualifies the %s legacy spell ID only in the Foundry import copy and preserves the protocol artifact', async (spellName, legacyUuid, foundryUuid) => {
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md').text();
    const casterSource = source.replace('背景: |-', `施法:\n  - "随意: ${spellName}"\n背景: |-`);
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: casterSource,
      displayName: `Nightgaunt ${spellName}`,
      requestId: `runtime-legacy-spell-${spellName}`,
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }));
    if (!('result' in response) || response.result.status !== 'accepted') {
      throw new Error(`Expected an accepted caster response: ${JSON.stringify(response)}`);
    }
    const sourceArtifact = response.result.artifact;
    const spellcastingArtifact = (sourceArtifact.items as Array<Record<string, any>>).find((item) => item.name === '施法');
    const activity = Object.values(spellcastingArtifact?.system?.activities ?? {})[0] as Record<string, any> | undefined;
    expect(activity?.spell?.uuid).toBe(legacyUuid);

    const collection = new FakeActorCollection();
    const result = await createAcceptedForgeActor({ game: supportedGame(collection), response });
    const imported = collection.contents[0]!.toObject() as Record<string, any>;
    const spellcastingImported = (imported.items as Array<Record<string, any>>).find((item) => item.name === '施法');
    const importedActivity = Object.values(spellcastingImported?.system?.activities ?? {})[0] as Record<string, any> | undefined;
    expect(result.status).toBe('created');
    expect(importedActivity?.spell?.uuid).toBe(foundryUuid);
    expect(hashArtifact(sourceArtifact)).toBe(response.result.artifactHash);
  });

  test('deletes only the newly created Actor when readback fails', async () => {
    const failure = 'readback' as const;
    const collection = new FakeActorCollection({ failure });
    const game = supportedGame(collection);
    await expect(createAcceptedForgeActor({ game, response: acceptedResponse })).rejects.toThrow();
    expect(collection.contents).toHaveLength(0);
    expect(collection.created[0]?.deleted).toBe(true);
  });

  test('fails closed for non-GM and exact runtime mismatch before world creation', async () => {
    const nonGmCollection = new FakeActorCollection();
    await expect(createAcceptedForgeActor({
      game: { ...supportedGame(nonGmCollection), user: { isGM: false } },
      response: acceptedResponse,
    })).rejects.toThrow(/GM/u);
    expect(nonGmCollection.createCount).toBe(0);

    const wrongVersionCollection = new FakeActorCollection();
    await expect(createAcceptedForgeActor({
      game: { ...supportedGame(wrongVersionCollection), version: '15.0.0' },
      response: acceptedResponse,
    })).rejects.toThrow(/14\.364/u);
    expect(wrongVersionCollection.createCount).toBe(0);
  });

  test('rejects an accepted response generated for v12 before any v14 world write', async () => {
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md').text();
    const legacyResponse = await convertFinalActorSource(buildForgeActorRequest({
      content: source,
      displayName: 'Legacy Target Actor',
      requestId: 'legacy-target',
      fvttVersion: '12.331',
      systemVersion: '4.3.9',
    }));
    if (!('result' in legacyResponse) || legacyResponse.result.status !== 'accepted') {
      throw new Error(`Expected an accepted v12 response fixture: ${JSON.stringify(legacyResponse)}`);
    }
    expect(legacyResponse.result.target.systemVersionObserved).toBe('4.3.9');
    const collection = new FakeActorCollection();
    await expect(createAcceptedForgeActor({
      game: supportedGame(collection),
      response: legacyResponse,
    })).rejects.toThrow(/target/u);
    expect(collection.createCount).toBe(0);
  });

  test('rejects an unresolved legacy spell response before any world write', async () => {
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md').text();
    const casterSource = source.replace('背景: |-', '施法:\n  - "随意: ArcaneGate"\n背景: |-');
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: casterSource,
      displayName: 'Nightgaunt Unresolved Spell',
      requestId: 'runtime-unresolved-legacy-spell',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }));
    if (!('result' in response)) throw new Error(`Expected an unresolved spell result: ${JSON.stringify(response)}`);
    expect(response.result.status).toBe('needs_review');
    const collection = new FakeActorCollection();
    await expect(createAcceptedForgeActor({ game: supportedGame(collection), response })).rejects.toThrow(/accepted/u);
    expect(collection.createCount).toBe(0);
  });

  test('cancellation before world submission prevents creation', async () => {
    const collection = new FakeActorCollection();
    const controller = new AbortController();
    controller.abort();

    await expect(createAcceptedForgeActor({
      game: supportedGame(collection),
      response: acceptedResponse,
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(collection.createCount).toBe(0);
    expect(collection.contents).toHaveLength(0);
  });

  test('cancellation after world submission does not retract a complete claimed Actor', async () => {
    const createStarted = deferred<void>();
    const releaseCreate = deferred<void>();
    const collection = new FakeActorCollection({ createGate: releaseCreate.promise, onCreateStarted: () => createStarted.resolve() });
    const controller = new AbortController();
    const pending = createAcceptedForgeActor({
      game: supportedGame(collection),
      response: acceptedResponse,
      signal: controller.signal,
    });

    await createStarted.promise;
    controller.abort();
    releaseCreate.resolve();

    await expect(pending).resolves.toMatchObject({ status: 'created' });
    expect(collection.contents).toHaveLength(1);
    expect(collection.created[0]?.deleted).toBe(false);
  });

  test('reports a cleanup failure after readback failure instead of hiding a possible complete Actor', async () => {
    const collection = new FakeActorCollection({ failure: 'readback-delete' });
    const pending = createAcceptedForgeActor({ game: supportedGame(collection), response: acceptedResponse });
    await expect(pending).rejects.toBeInstanceOf(ForgeTemporaryActorCleanupError);
    await expect(pending).rejects.toThrow(/may remain in the world/u);
    expect(collection.contents).toHaveLength(1);
    expect(collection.created[0]?.deleted).toBe(false);
  });
});

class FakeActor implements ForgeActorLike {
  public deleted = false;
  public data: Record<string, any>;

  public constructor(
    private readonly collection: FakeActorCollection,
    private readonly number: number,
    private readonly failure?: FakeActorCollectionOptions['failure'],
    data: Record<string, unknown> = {},
  ) {
    this.data = { ...data, _id: data._id ?? `forge-test-${number}` };
  }

  public get id(): string { return String(this.data._id); }
  public get uuid(): string { return `Actor.${this.id}`; }
  public get flags(): Record<string, unknown> { return this.data.flags ?? {}; }

  public async delete(): Promise<unknown> {
    if (this.failure === 'delete' || this.failure === 'readback-delete') throw new Error('fake delete failed');
    this.deleted = true;
    this.collection.contents = this.collection.contents.filter((entry) => entry !== this);
    return this;
  }

  public toObject(): unknown {
    if (this.failure === 'readback' || this.failure === 'readback-delete') return { ...structuredClone(this.data), name: 'readback drift' };
    return structuredClone(this.data);
  }
}

interface FakeActorCollectionOptions {
  failure?: 'readback' | 'delete' | 'readback-delete';
  createGate?: Promise<void>;
  onCreateStarted?: () => void;
}

class FakeActorCollection implements ForgeActorCollectionLike {
  public contents: FakeActor[] = [];
  public created: FakeActor[] = [];
  public createInputs: Array<Record<string, any>> = [];
  public createCount = 0;
  private readonly reservedIds = new Set<string>();
  public documentClass = {
    create: async (data: Record<string, unknown>, options?: Record<string, unknown>): Promise<FakeActor> => this.createActor(data, options),
  };

  public constructor(private readonly options: FakeActorCollectionOptions = {}) {}

  public get(id: string): FakeActor | undefined {
    return this.contents.find((actor) => actor.id === id);
  }

  public seed(data: Record<string, unknown>): FakeActor {
    const actor = new FakeActor(this, 0, undefined, data);
    this.contents.push(actor);
    return actor;
  }

  private async createActor(data: Record<string, unknown>, options?: Record<string, unknown>): Promise<FakeActor> {
    if (options?.keepId !== true || typeof data._id !== 'string') throw new Error('fake create requires a preserved deterministic ID');
    const id = data._id;
    if (this.reservedIds.has(id) || this.get(id)) throw new Error(`duplicate fake Actor ID: ${id}`);
    this.reservedIds.add(id);
    this.options.onCreateStarted?.();
    try {
      if (this.options.createGate) await this.options.createGate;
      this.createInputs.push(structuredClone(data));
      const persisted = {
        ...structuredClone(data),
        items: Array.isArray(data.items)
          ? data.items.map((item, index) => simulateDnd5eImport({
            ...item,
            _id: asRecord(item)._id ?? `foundry-item-${index + 1}`,
          }))
          : data.items,
      };
      const actor = new FakeActor(this, this.createCount + 1, this.options.failure, persisted);
      this.contents.push(actor);
      this.created.push(actor);
      this.createCount += 1;
      return actor;
    } finally {
      this.reservedIds.delete(id);
    }
  }
}

function supportedGame(actors: FakeActorCollection): ForgeGameLike {
  return { version: '14.364', system: { id: 'dnd5e', version: '5.3.3' }, user: { isGM: true }, actors };
}

function conflictingResponse(response: ForgeActorResponse): ForgeActorResponse {
  if (!('result' in response) || response.result.status !== 'accepted') throw new Error('Accepted response fixture required.');
  const artifact = { ...response.result.artifact, name: 'Conflicting Forge Actor' } as JsonObject;
  return {
    ...response,
    result: {
      ...response.result,
      artifact,
      artifactHash: hashArtifact(artifact),
    },
  };
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function simulateDnd5eImport(item: Record<string, any>): Record<string, any> {
  const system = asRecord(item.system);
  const activities = asRecord(system.activities);
  return {
    ...item,
    system: {
      ...system,
      activities: Object.fromEntries(Object.entries(activities).map(([id, activity]) => {
        const value = asRecord(activity);
        const range = asRecord(value.range);
        if (!Object.prototype.hasOwnProperty.call(range, 'reach') && !Object.prototype.hasOwnProperty.call(range, 'long')) return [id, activity];
        const { reach: _reach, long: _long, ...rangeWithoutFoundryOnlyFields } = range;
        return [id, { ...value, range: rangeWithoutFoundryOnlyFields }];
      })),
    },
  };
}

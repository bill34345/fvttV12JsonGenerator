import { beforeAll, describe, expect, test } from 'bun:test';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { analyzePlaintextActorSource } from '@fvtt-json-generator/forge-browser-runtime/plaintext';
import { hashArtifact, type ForgeActorResponse, type JsonObject } from '@fvtt-json-generator/forge-gateway-protocol';
import { splitCollection } from '@fvtt-json-generator/ingest-plaintext/plaintext-core';
import {
  createAcceptedForgeActor,
  createReviewedForgeActorCandidate,
  forgeActorCandidateReviewHash,
  assertActorSemantics,
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
  test('native chat-flavor StringField trims only boundary whitespace and preserves the source body',()=>{
    if(!('result'in acceptedResponse)||acceptedResponse.result.status!=='accepted')throw Error('Expected accepted fixture');
    const expected:any=structuredClone(acceptedResponse.result.artifact);
    const item=expected.items.find((entry:any)=>Object.keys(entry.system?.activities??{}).length),key=Object.keys(item.system.activities)[0]!;
    const text='\r\nLegendary Resistance. If the dragon fails a saving throw,\nit can choose to succeed instead.\r\n';
    item.system.activities[key].description={chatFlavor:text};
    const actual=structuredClone(expected),activity=actual.items[expected.items.indexOf(item)].system.activities[key],before=hashArtifact(expected);
    activity.description.chatFlavor=text.trim();
    expect(()=>assertActorSemantics(expected,actual)).not.toThrow();expect(hashArtifact(expected)).toBe(before);
    activity.description.chatFlavor=text.trim().replace('succeed','fail');
    expect(()=>assertActorSemantics(expected,actual)).toThrow('description.chatFlavor');
    activity.description.chatFlavor=text.trim().replace('\n',' ');
    expect(()=>assertActorSemantics(expected,actual)).toThrow('description.chatFlavor');
  });
  test('normalizes only native StringField activation-condition whitespace and still rejects changed rule text',()=>{
    if(!('result'in acceptedResponse)||acceptedResponse.result.status!=='accepted')throw Error('Expected accepted fixture');
    for(const condition of ['  Only while hidden.  ','Actions\n\nRend. Melee Attack Roll: +11.\n','\r\n仅当目标可见。\r\n']){
      const expected:any=structuredClone(acceptedResponse.result.artifact);
      const index=expected.items.findIndex((item:any)=>Object.keys(item.system?.activities??{}).length);
      const key=Object.keys(expected.items[index].system.activities)[0]!;
      expected.items[index].system.activities[key].activation.condition=condition;
      const actual=structuredClone(expected);actual.items[index].system.activities[key].activation.condition=condition.trim();
      const before=hashArtifact(expected);
      expect(()=>assertActorSemantics(expected,actual)).not.toThrow();
      expect(hashArtifact(expected)).toBe(before);
      actual.items[index].system.activities[key].activation.condition='The source condition was lost.';
      expect(()=>assertActorSemantics(expected,actual)).toThrow('activation.condition');
    }
  });
  test('imports explicitly reviewed candidates while preserving failed or needs-review verdicts', async () => {
    for (const strictStatus of ['needs_review', 'failed'] as const) {
      const response = reviewedCandidateResponse(strictStatus);
      const collection = new FakeActorCollection();
      const game = { ...supportedGame(collection), user: { isGM: true, id: 'candidate-gm' } };
      const approval = candidateApproval(response);
      await expect(createAcceptedForgeActor({ game, response })).rejects.toThrow(/accepted/u);
      const created = await createReviewedForgeActorCandidate({ game, response, reviewApproval: approval });
      expect(created.status).toBe('created');
      expect(collection.createInputs).toHaveLength(1);
      const sourceResult = 'result' in response ? response.result : undefined;
      expect(collection.contents[0]!.data.flags[MODULE_ID].candidateReview).toMatchObject({
        version: 1, gmId: 'candidate-gm', strictStatus,
        sourceHash: approval.sourceHash, artifactHash: approval.artifactHash,
        diagnostics: sourceResult!.diagnostics, verification: sourceResult!.verification,
      });
      expect(collection.contents[0]!.data.items).toHaveLength((sourceResult!.artifact!.items as unknown[]).length);
      expect((await createReviewedForgeActorCandidate({ game, response, reviewApproval: approval })).status).toBe('existing');
      expect(collection.createCount).toBe(1);
      collection.contents[0]!.data.flags[MODULE_ID].candidateReview.strictStatus = 'accepted';
      await expect(createReviewedForgeActorCandidate({ game, response, reviewApproval: approval })).rejects.toThrow(/failed readback verification/u);
      expect(collection.createCount).toBe(1);
    }
  });

  test('rejects stale GM candidate approvals, wrong identities and malformed candidates before writes', async () => {
    const response = reviewedCandidateResponse('failed');
    const approval = candidateApproval(response);
    const collection = new FakeActorCollection();
    const game = { ...supportedGame(collection), user: { isGM: true, id: 'candidate-gm' } };
    for (const changed of [
      { ...approval, gmId: 'another-gm' }, { ...approval, sourceHash: hashArtifact({ changed: 'source' }) },
      { ...approval, artifactHash: hashArtifact({ changed: 'artifact' }) }, { ...approval, findingsHash: hashArtifact({ changed: 'findings' }) },
    ]) await expect(createReviewedForgeActorCandidate({ game, response, reviewApproval: changed })).rejects.toThrow(/approval/u);
    const changedReport = structuredClone(response);
    if (!('result' in changedReport)) throw new Error('Candidate fixture result required.');
    changedReport.result.diagnostics[0]!.message = 'Additional source concern.';
    await expect(createReviewedForgeActorCandidate({ game, response: changedReport, reviewApproval: approval })).rejects.toThrow(/approval/u);
    await expect(createReviewedForgeActorCandidate({ game: { ...game, user: { id: 'candidate-gm', isGM: false } }, response, reviewApproval: approval })).rejects.toThrow(/GM/u);
    await expect(createReviewedForgeActorCandidate({ game: { ...game, version: '14.368' }, response, reviewApproval: approval })).rejects.toThrow(/response target/u);
    const malformed = structuredClone(response);
    if (!('result' in malformed)) throw new Error('Candidate fixture result required.');
    malformed.result.artifact!.items = 'invalid';
    await expect(createReviewedForgeActorCandidate({ game, response: malformed, reviewApproval: approval })).rejects.toThrow(/decoded/u);
    const parseFailure = structuredClone(response);
    if (!('result' in parseFailure)) throw new Error('Candidate fixture result required.');
    parseFailure.result.diagnostics[0]!.stage = 'parse';
    await expect(createReviewedForgeActorCandidate({ game, response: parseFailure, reviewApproval: candidateApproval(parseFailure) })).rejects.toThrow(/structural or parsing/u);
    expect(collection.createCount).toBe(0);
  });

  test('cleans only its new candidate when semantic or approval readback changes', async () => {
    const response = reviewedCandidateResponse('failed');
    for (const failure of ['readback', 'candidate-review-readback'] as const) {
      const collection = new FakeActorCollection({ failure });
      const game = { ...supportedGame(collection), user: { isGM: true, id: 'candidate-gm' } };
      const baseline = collection.seed({ _id: 'baseline', name: 'Protected Actor' });
      await expect(createReviewedForgeActorCandidate({ game, response, reviewApproval: candidateApproval(response) })).rejects.toThrow();
      expect(collection.createCount).toBe(1);
      expect(collection.contents).toEqual([baseline]);
      expect(baseline.deleted).toBe(false);
      expect(collection.created[0]!.deleted).toBe(true);
    }
  });

  test('rejects lost embedded Item artwork during Actor readback', () => {
    if (!('result' in acceptedResponse) || acceptedResponse.result.status !== 'accepted') throw new Error('Fixture is not accepted.');
    const artifact = acceptedResponse.result.artifact;
    const changed = structuredClone(artifact) as Record<string, any>;
    changed.items[0].img = 'icons/svg/mystery-man.svg';
    expect(() => assertActorSemantics(artifact, changed)).toThrow(/semantics.*img/u);
  });
  test('creates a formally generated 368 artifact only in the matching reviewed Mirror runtime', async () => {
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md').text();
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: source, displayName: 'Mirror 368 Actor', requestId: 'mirror-core368-runtime',
      fvttVersion: '14.368', systemVersion: '5.3.3',
    }));
    if (!('result' in response) || response.result.status !== 'accepted') throw new Error('Formal 368 source generation failed');
    expect(response.result.target.fvttRuntimeVersion).toBe('14.368');
    const collection = new FakeActorCollection();
    const game = { ...supportedGame(collection), version: '14.368' };
    expect((await createAcceptedForgeActor({ game, response })).status).toBe('created');
    const crossed = new FakeActorCollection();
    await expect(createAcceptedForgeActor({ game: supportedGame(crossed), response })).rejects.toThrow('response target');
    expect(crossed.createCount).toBe(0);
    const stale = new FakeActorCollection();
    await expect(createAcceptedForgeActor({ game: { ...supportedGame(stale), version: '14.368' }, response: acceptedResponse })).rejects.toThrow('response target');
    expect(stale.createCount).toBe(0);
  });
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

  test('accepts Foundry v14 migration of legacy ActiveEffect changes and rejects readback drift', async () => {
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/scuttling-serpentmaw__蛇口蛮蟹.md').text();
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: source,
      displayName: 'Scuttling Serpentmaw',
      requestId: 'runtime-v14-effect-change-value',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }));
    if (!('result' in response) || response.result.status !== 'accepted') {
      throw new Error(`Expected an accepted Scuttling Serpentmaw response: ${JSON.stringify(response)}`);
    }

    const brittleShell = (response.result.artifact.items as Array<Record<string, any>>)
      .find((item) => item.name === '脆壳反震 Brittle Shell');
    expect(brittleShell?.effects?.[0]?.changes?.[0]?.mode).toBe(5);
    expect(brittleShell?.effects?.[0]?.changes?.[0]?.value).toBe('14');

    const collection = new FakeActorCollection();
    const result = await createAcceptedForgeActor({ game: supportedGame(collection), response });
    const imported = collection.contents[0]!.toObject() as Record<string, any>;
    const importedBrittleShell = (imported.items as Array<Record<string, any>>)
      .find((item) => item.name === '脆壳反震 Brittle Shell');
    const importedEffect = importedBrittleShell?.effects?.[0] as Record<string, any>;

    expect(result.status).toBe('created');
    expect(importedEffect?.system?.changes?.[0]?.type).toBe('override');
    expect(importedEffect?.system?.changes?.[0]).not.toHaveProperty('mode');
    expect(importedEffect?.system?.changes?.[0]?.value).toBe(14);

    const persistedBrittleShell = (collection.contents[0]!.data.items as Array<Record<string, any>>)
      .find((item) => item.name === '脆壳反震 Brittle Shell');
    const persistedEffect = persistedBrittleShell?.effects?.[0] as Record<string, any>;
    const canonicalChanges = structuredClone(persistedEffect.system.changes);
    delete persistedEffect.system.changes;
    persistedEffect.changes = canonicalChanges.map((change: Record<string, any>) => ({ ...change, value: '14' }));
    await expect(createAcceptedForgeActor({ game: supportedGame(collection), response }))
      .rejects.toThrow(/failed readback verification/u);

    delete persistedEffect.changes;
    persistedEffect.system.changes = canonicalChanges.map((change: Record<string, any>) => ({ ...change, value: 15 }));
    await expect(createAcceptedForgeActor({ game: supportedGame(collection), response }))
      .rejects.toThrow(/failed readback verification/u);

    persistedEffect.system.changes = canonicalChanges.map((change: Record<string, any>) => ({ ...change, type: 'add' }));
    await expect(createAcceptedForgeActor({ game: supportedGame(collection), response }))
      .rejects.toThrow(/failed readback verification/u);
    expect(collection.createCount).toBe(1);
    expect(collection.contents).toHaveLength(1);

    const canonicalResponse = withCanonicalEffectChanges(response, '脆壳反震 Brittle Shell');
    const canonicalCollection = new FakeActorCollection();
    await expect(createAcceptedForgeActor({ game: supportedGame(canonicalCollection), response: canonicalResponse }))
      .resolves.toMatchObject({ status: 'created' });
    const canonicalImportedItem = (canonicalCollection.contents[0]!.data.items as Array<Record<string, any>>)
      .find((item) => item.name === '脆壳反震 Brittle Shell');
    expect(canonicalImportedItem?.effects?.[0]?.system?.changes?.[0]?.type).toBe('override');
    expect(canonicalImportedItem?.effects?.[0]?.system?.changes?.[0]).not.toHaveProperty('mode');
    expect(canonicalImportedItem?.effects?.[0]?.system?.changes?.[0]?.value).toBe('14');
  });

  test('materializes embedded feat attack reach in the v14 Activity RangeField before Actor readback', async () => {
    const source = await Bun.file('tests/fixtures/plaintext/月蚀矿腐化生物数据.md').text();
    const block = splitCollection(source).find((entry) => entry.englishName === 'Slithering Bloodfin');
    if (!block) throw new Error('Slithering Bloodfin plaintext fixture block was not found.');
    const analysis = analyzePlaintextActorSource(block.rawBlock);
    if (analysis.status !== 'ready_to_generate' || !analysis.canonicalSource) {
      throw new Error(`Expected a ready Slithering Bloodfin analysis: ${JSON.stringify(analysis)}`);
    }
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: analysis.canonicalSource,
      displayName: 'Slithering Bloodfin',
      requestId: 'runtime-v14-embedded-feat-reach',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }));
    if (!('result' in response) || response.result.status !== 'accepted') {
      throw new Error(`Expected an accepted Slithering Bloodfin response: ${JSON.stringify(response)}`);
    }

    const swallow = (response.result.artifact.items as Array<Record<string, any>>)
      .find((item) => item.name === '吞咽 Swallow');
    const attackEntry = Object.entries(asRecord(swallow?.system?.activities))
      .find(([, activity]) => asRecord(activity).type === 'attack');
    if (!attackEntry) throw new Error('Swallow attack Activity was not found.');
    const [attackId, attack] = attackEntry;
    expect(asRecord(attack).range).toMatchObject({ override: true, value: 5, units: 'ft' });
    expect(asRecord(attack).range).not.toHaveProperty('reach');

    const collection = new FakeActorCollection();
    const result = await createAcceptedForgeActor({ game: supportedGame(collection), response });
    const imported = collection.contents[0]!.toObject() as Record<string, any>;
    expect(result.status).toBe('created');
    expect(findActivity(imported, '吞咽 Swallow', attackId).range)
      .toMatchObject({ override: true, value: 5, units: 'ft' });
  });

  test('ignores only inactive Activity template unit defaults and rejects active-template unit drift', async () => {
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/scuttling-serpentmaw__蛇口蛮蟹.md').text();
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: source,
      displayName: 'Scuttling Serpentmaw',
      requestId: 'runtime-v14-inactive-template-units',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }));
    if (!('result' in response) || response.result.status !== 'accepted') {
      throw new Error(`Expected an accepted Scuttling Serpentmaw response: ${JSON.stringify(response)}`);
    }

    const venomousBite = (response.result.artifact.items as Array<Record<string, any>>)
      .find((item) => item.name === '毒液咬击 Venomous Bite');
    const utilityActivity = Object.values(asRecord(venomousBite?.system?.activities))
      .map(asRecord)
      .find((activity) => activity.name === 'Gain Temporary HP');
    expect(utilityActivity?.target?.template).toMatchObject({ type: '', size: '', units: '' });

    const collection = new FakeActorCollection();
    await expect(createAcceptedForgeActor({ game: supportedGame(collection), response }))
      .resolves.toMatchObject({ status: 'created' });
    const importedUtility = findActivity(collection.contents[0]!.data, '毒液咬击 Venomous Bite', utilityActivity!._id);
    expect(importedUtility.target.template.units).toBe('ft');

    const activeResponse = withActiveActivityTemplate(response, '毒液咬击 Venomous Bite', utilityActivity!._id);
    const activeCollection = new FakeActorCollection();
    await expect(createAcceptedForgeActor({ game: supportedGame(activeCollection), response: activeResponse }))
      .resolves.toMatchObject({ status: 'created' });
    const activeImported = findActivity(activeCollection.contents[0]!.data, '毒液咬击 Venomous Bite', utilityActivity!._id);
    activeImported.target.template.units = 'm';
    await expect(createAcceptedForgeActor({ game: supportedGame(activeCollection), response: activeResponse }))
      .rejects.toThrow(/failed readback verification/u);
    expect(activeCollection.createCount).toBe(1);
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
    if (this.failure === 'candidate-review-readback') {
      const changed = structuredClone(this.data);
      delete changed.flags[MODULE_ID].candidateReview;
      return changed;
    }
    return structuredClone(this.data);
  }
}

interface FakeActorCollectionOptions {
  failure?: 'readback' | 'delete' | 'readback-delete' | 'candidate-review-readback';
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

function reviewedCandidateResponse(status: 'needs_review' | 'failed'): ForgeActorResponse {
  if (!('result' in acceptedResponse) || acceptedResponse.result.status !== 'accepted') throw new Error('Accepted source fixture required.');
  const { artifactHash: _artifactHash, ...base } = structuredClone(acceptedResponse.result);
  return { protocolVersion: 1, requestId: acceptedResponse.requestId, result: { ...base, status,
    verification: { ...base.verification, status }, diagnostics: [{ code: 'SOURCE_REVIEW_REQUIRED',
      severity: status === 'failed' ? 'error' : 'warning', stage: 'semantic', path: 'actor', message: 'Source rules need GM review.' }] } };
}

function candidateApproval(response: ForgeActorResponse) {
  if (!('result' in response) || !response.result.artifact) throw new Error('Candidate source fixture required.');
  return { gmId: 'candidate-gm', sourceHash: response.result.sourceIdentity.sourceHash,
    artifactHash: hashArtifact(response.result.artifact), findingsHash: forgeActorCandidateReviewHash(response) };
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

function withCanonicalEffectChanges(response: ForgeActorResponse, itemName: string): ForgeActorResponse {
  if (!('result' in response) || response.result.status !== 'accepted') throw new Error('Accepted response fixture required.');
  const artifact = structuredClone(response.result.artifact) as Record<string, any>;
  const item = (artifact.items as Array<Record<string, any>>).find((entry) => entry.name === itemName);
  const effect = item?.effects?.[0] as Record<string, any>;
  const changes = structuredClone(effect.changes).map(simulateFoundryV14LegacyEffectChangeMode);
  delete effect.changes;
  effect.system = { ...asRecord(effect.system), changes };
  return {
    ...response,
    result: {
      ...response.result,
      artifact,
      artifactHash: hashArtifact(artifact),
    },
  };
}

function withActiveActivityTemplate(
  response: ForgeActorResponse,
  itemName: string,
  activityId: string,
): ForgeActorResponse {
  if (!('result' in response) || response.result.status !== 'accepted') throw new Error('Accepted response fixture required.');
  const artifact = structuredClone(response.result.artifact) as Record<string, any>;
  const item = (artifact.items as Array<Record<string, any>>).find((entry) => entry.name === itemName);
  const activity = asRecord(item?.system?.activities?.[activityId]);
  const target = asRecord(activity.target);
  activity.target = {
    ...target,
    template: {
      ...asRecord(target.template),
      type: 'sphere',
      size: '10',
      units: 'ft',
    },
  };
  return {
    ...response,
    result: {
      ...response.result,
      artifact,
      artifactHash: hashArtifact(artifact),
    },
  };
}

function findActivity(actor: Record<string, any>, itemName: string, activityId: string): Record<string, any> {
  const item = (actor.items as Array<Record<string, any>>).find((entry) => entry.name === itemName);
  return asRecord(item?.system?.activities?.[activityId]);
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
    effects: Array.isArray(item.effects)
      ? item.effects.map(simulateFoundryV14EffectImport)
      : item.effects,
    system: {
      ...system,
      activities: Object.fromEntries(Object.entries(activities).map(([id, activity]) => {
        const value = asRecord(activity);
        const range = asRecord(value.range);
        const target = asRecord(value.target);
        const template = asRecord(target.template);
        const importedTarget = Object.keys(target).length === 0
          ? value.target
          : {
            ...target,
            template: Object.keys(template).length === 0
              ? target.template
              : { ...template, units: template.units === '' ? 'ft' : template.units },
          };
        if (!Object.prototype.hasOwnProperty.call(range, 'reach') && !Object.prototype.hasOwnProperty.call(range, 'long')) {
          return [id, { ...value, target: importedTarget }];
        }
        const { reach: _reach, long: _long, ...rangeWithoutFoundryOnlyFields } = range;
        return [id, { ...value, range: rangeWithoutFoundryOnlyFields, target: importedTarget }];
      })),
    },
  };
}

function simulateFoundryV14EffectImport(effectValue: unknown): Record<string, any> {
  const effect = asRecord(effectValue);
  const effectSystem = asRecord(effect.system);
  const usesCanonicalChanges = Array.isArray(effectSystem.changes);
  const sourceChanges = usesCanonicalChanges ? effectSystem.changes : effect.changes;
  const { changes: _legacyChanges, system: _system, ...effectWithoutLegacyChanges } = effect;
  return {
    ...effectWithoutLegacyChanges,
    system: {
      ...effectSystem,
      changes: Array.isArray(sourceChanges)
        ? sourceChanges.map((changeValue: unknown) => {
          const change = asRecord(changeValue);
          return usesCanonicalChanges ? change : simulateFoundryV14LegacyEffectChange(change);
        })
        : sourceChanges,
    },
  };
}

const FOUNDRY_V14_EFFECT_TYPES_BY_MODE: Readonly<Record<number, string>> = {
  0: 'custom',
  1: 'multiply',
  2: 'add',
  3: 'downgrade',
  4: 'upgrade',
  5: 'override',
};

function simulateFoundryV14LegacyEffectChange(change: Record<string, any>): Record<string, any> {
  const normalized = simulateFoundryV14LegacyEffectChangeMode(change);
  normalized.value = simulateFoundryV14EffectChangeValue(normalized.value);
  return normalized;
}

function simulateFoundryV14LegacyEffectChangeMode(change: Record<string, any>): Record<string, any> {
  const normalized = { ...change };
  if (!Object.hasOwn(normalized, 'type') && typeof normalized.mode === 'number') {
    normalized.type = FOUNDRY_V14_EFFECT_TYPES_BY_MODE[normalized.mode] ?? `custom.${normalized.mode}`;
    delete normalized.mode;
  }
  return normalized;
}

function simulateFoundryV14EffectChangeValue(value: unknown): unknown {
  if (typeof value !== 'string' || value === '') return value;
  try {
    return simulateFoundryV14EffectChangeValue(JSON.parse(value));
  } catch {
    return value;
  }
}

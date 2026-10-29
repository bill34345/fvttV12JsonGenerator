import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  hashManagedProjection,
  logicalSpellRefKey,
  planSpellHydration,
  RESOLVER_MODULE_ID,
  sha256,
  type PortableSpellManifest,
  type SpellCandidateMetadata,
  type SpellHydrationPlan,
} from '../../../../src/core/spell-resolution';
import { generatedResolverDocumentId,computeManagedSourceHash } from '../cast-activity';
import { createResolverActorService } from '../hooks';
import {conditionalSpellFixture} from './conditional-spell-fixture';
import {
  executeHydrationTransaction as executeHydrationTransactionRuntime,
  projectCurrentManagedContent,
  HydrationTransactionError,
  type HydrationFailureStage,
  type ExecuteHydrationTransactionInput,
} from '../transaction';

// These FakeActors run outside Foundry, even when another suite installed a fake client.
const fixtureGlobalNames = ['game', 'foundry', 'Hooks'] as const;
let originalGlobals: Array<[string, PropertyDescriptor | undefined]> = [];
beforeEach(() => {
  originalGlobals = fixtureGlobalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of fixtureGlobalNames) Reflect.deleteProperty(globalThis, name);
});
afterEach(() => {
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

const fieldReplacement = { create: (value: unknown) => ({ __forcedReplacement: value }) };
function executeHydrationTransaction(input: ExecuteHydrationTransactionInput) {
  return executeHydrationTransactionRuntime({ fieldReplacement, ...input });
}

// Foundry 14.364 common/abstract/document.mjs 863-905 is the public Actor
// create/update/delete embedded-document contract. dnd5e.mjs 23830-23835 is
// the public feature.deleteActivity(id) boundary; v14 uses _del internally, so
// resolver code must not guess/depend on the deprecated "-=" object-key form.

function manifest(): PortableSpellManifest {
  const refs = [
    { refId: 'light-ref', identifier: 'light', originalName: 'Light', uuid: 'aaaaaaaaaaaaaaaa' },
    { refId: 'darkness-ref', identifier: 'darkness', originalName: 'Darkness', uuid: 'bbbbbbbbbbbbbbbb' },
  ];
  return {
    schemaVersion: 1, manifestId: 'transaction-manifest', sourceSha256: 'c'.repeat(64), rulesPreference: '2024',
    spellcastingGroups: [{
      groupId: 'innate-cha', featureItemKey: 'innate-feature', ability: 'cha', saveDc: 12, attackBonus: 4,
      spellRefs: refs.map((ref, index) => ({
        refId: ref.refId, identifier: ref.identifier, originalName: ref.originalName, englishName: ref.originalName,
        aliases: [], method: index === 0 ? 'at-will' : 'innate',
        ...(index === 0 ? {} : { uses: { value: 1, recovery: 'day' as const, shared: false } }),
        ignoresMaterialComponents: true, restrictions: [], evidence: [{ start: index * 10, end: index * 10 + ref.originalName.length, quote: ref.originalName }],
      })),
    }],
  };
}

function readyPlan(
  actor?: TransactionActor,
  decision?: 'keep' | 'overwrite',
  lightId = 'aaaaaaaaaaaaaaaa',
  inputManifest = manifest(),
  decisionRef='light-ref',
): SpellHydrationPlan {
  const candidates: SpellCandidateMetadata[] = [
    inputManifest.spellcastingGroups[0]!.spellRefs[0]!.identifier === 'geas'
      ? { id:'phbsplGeas000000',uuid:'Compendium.dnd-players-handbook.spells.Item.phbsplGeas000000',packageId:'dnd-players-handbook',packId:'spells',name:'Geas',identifier:'geas',rules:'2024' }
      :inputManifest.spellcastingGroups[0]!.spellRefs[0]!.identifier === 'disguise-self'
      ? { id: 'phbsplDisguiseSe', uuid: 'Compendium.dnd-players-handbook.spells.Item.phbsplDisguiseSe', packageId: 'dnd-players-handbook', packId: 'spells', name: 'Disguise Self', identifier: 'disguise-self', rules: '2024' }
      : { id: lightId, uuid: `Compendium.dnd5e.spells24.Item.${lightId}`, packageId: 'dnd5e', packId: 'spells24', name: 'Light', identifier: 'light', rules: '2024' },
    { id: 'bbbbbbbbbbbbbbbb', uuid: 'Compendium.dnd5e.spells24.Item.bbbbbbbbbbbbbbbb', packageId: 'dnd5e', packId: 'spells24', name: 'Darkness', identifier: 'darkness', rules: '2024' },
  ];
  const currentManagedProjection = actor ? projectCurrentManagedContent(actor, manifest().manifestId) : [];
  const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', decisionRef);
  const result = planSpellHydration({
    manifest: inputManifest, candidates, sourceInventoryHash: (lightId === 'aaaaaaaaaaaaaaaa' ? 'd' : 'e').repeat(64),
    currentManagedProjection: currentManagedProjection.map((entry) => entry.logicalRefKey === lightKey && decision
      ? { ...entry, manualConflict: true }
      : entry),
    manualDecisions: decision ? [{ logicalRefKey: lightKey, decision }] : [],
  });
  if (result.status !== 'ready') throw new Error(`Fixture plan was not ready: ${result.status}`);
  return result.plan;
}

describe('Actor-local atomic hydration transaction', () => {
  test.each(['owned','timestamps-only','unknown-item-field','outside-stats-time','changed-stats-version','other-actor','other-source','saved-other-source','changed-effect','added-effect','changed-id','write-rejected'] as const)(
    'failed conditional maintenance compensates only the proven snapshot source-to-owned Effect origin remapping: %s', async variant => {
      const actor = new TransactionActor(true), inputManifest = manifest(), hooks = new TransactionHookBus();
      actor.lifecycleHooks = hooks;
      Object.assign(inputManifest.spellcastingGroups[0]!.spellRefs[0]!, {identifier:'geas',originalName:'Geas',englishName:'Geas',method:'innate',uses:{value:1,recovery:'day',shared:false}});
      actor.flags[RESOLVER_MODULE_ID].spellManifest = inputManifest; actor.withConditionalDamage = true;
      const gameDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'game');
      Object.defineProperty(globalThis, 'game', {configurable:true,value:{system:{version:'6.0.2'},modules:new Map()}});
      try {
        await executeHydrationTransaction({actor,manifest:inputManifest,plan:readyPlan(actor,undefined,undefined,inputManifest),lifecycleHooks:hooks});
        const cache = actor.items.find(item => item.type === 'spell' && item.flags[RESOLVER_MODULE_ID].refId === 'light-ref');
        cache.effects[0].origin = variant === 'saved-other-source' ? 'Compendium.other.spells.Item.OtherSource00001' : cache._stats.compendiumSource;
        cache._stats = {...cache._stats,createdTime:1,modifiedTime:2,lastModifiedBy:'OriginalUser0001'};
        for (const effect of cache.effects) effect._stats = {coreVersion:'14.368',createdTime:1,modifiedTime:2,lastModifiedBy:'OriginalUser0001'};
        cache.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(activitySource(cache));
        actor.managedActivities()[0]!.uses.spent = 1; cache.system.uses.spent = 2;
        actor.items[0]!.system.uses = {spent:3,max:'4',recovery:[]};
        const before = actor.fullProjection(), otherBefore = actor.foreignProjection();
        actor.snapshotEffectMutation = item => {
          if (item.flags[RESOLVER_MODULE_ID].refId !== 'light-ref') return;
          Object.defineProperty(item, 'uuid', {value:`${actor.uuid}.Item.${item.id}`});
          if (variant === 'timestamps-only') {
            Object.assign(item._stats,{createdTime:7,modifiedTime:8,lastModifiedBy:'RecreateUser0001'});
            for (const effect of item.effects) Object.assign(effect._stats,{createdTime:7,modifiedTime:8,lastModifiedBy:'RecreateUser0001'});
            return;
          }
          if (variant === 'unknown-item-field') {item.unlistedBusinessField={condition:'must remain blocked'};return;}
          if (variant === 'outside-stats-time') {item.createdTime='a real unlisted business value';return;}
          if (variant === 'changed-stats-version') {item._stats.systemVersion='different pinned source';return;}
          item.effects[0].origin = variant === 'other-actor' ? `Actor.OtherActor000001.Item.${item.id}`
            : variant === 'other-source' ? 'Compendium.other.spells.Item.OtherSource00001' : item.uuid;
          if (variant === 'changed-effect') item.effects[0].statuses = ['frightened'];
          if (variant === 'added-effect') item.effects.push({_id:'AddedEffect00001',type:'base',statuses:['charmed']});
          if (variant === 'changed-id') item.effects[0]._id = 'ChangedEffect001';
        };
        actor.snapshotOriginWriteRejected = variant === 'write-rejected';
        Object.defineProperty(globalThis, 'game', {configurable:true,value:{system:{version:'5.3.3'},modules:new Map()}});
        try {
          await executeHydrationTransaction({actor,manifest:inputManifest,plan:readyPlan(actor,undefined,undefined,inputManifest),completeSourceCache:true,lifecycleHooks:hooks,
            failureInjector(stage) {if(stage === 'after-partial-cache-creation') throw Error('Observed conditional maintenance failure');}});
          throw Error('Expected maintenance failure');
        } catch (error) {
          expect(error).toBeInstanceOf(HydrationTransactionError);
          const failure = error as HydrationTransactionError;
          if (variant === 'owned' || variant === 'timestamps-only') expect({restored:failure.rollbackSucceeded,residual:failure.residualDifferences}).toEqual({restored:true,residual:[]});
          else expect(failure.rollbackSucceeded).toBe(false);
          if (variant === 'owned') {expect(failure.residualDifferences).toEqual([]);expect(actor.fullProjection()).toEqual(before);}
          else if (variant === 'timestamps-only') {
            const expected = structuredClone(before), spell = expected.spells.find((item:any) => item._id === cache.id);
            Object.assign(spell._stats,{createdTime:7,modifiedTime:8,lastModifiedBy:'RecreateUser0001'});
            for (const effect of spell.effects) Object.assign(effect._stats,{createdTime:7,modifiedTime:8,lastModifiedBy:'RecreateUser0001'});
            expect(actor.fullProjection()).toEqual(expected);
            expect(before.spells.find((item:any) => item._id === cache.id)._stats.createdTime).toBe(1);
          } else if (['unknown-item-field','outside-stats-time','changed-stats-version'].includes(variant)) {
            expect(failure.residualDifferences.some(diff => diff.path === `/managed/spells/${cache.id}`)).toBe(true);
          } else expect(failure.residualDifferences.some(diff => diff.path === '/rollback/errors')).toBe(true);
        }
        expect(actor.foreignProjection()).toEqual(otherBefore);
        const writes = actor.calls.filter(call => call[0] === 'snapshotOriginUpdate');
        expect(writes).toHaveLength(variant === 'owned' || variant === 'write-rejected' ? 1 : 0);
      } finally {
        if(gameDescriptor)Object.defineProperty(globalThis,'game',gameDescriptor);else delete(globalThis as any).game;
      }
    });
  test.each(['overwrite','none','keep','other-ref'] as const)('real source-cache maintenance transaction authorizes the exact edited conditional ref: %s',async decision=>{
    const actor=new TransactionActor(true),inputManifest=manifest(),ref=inputManifest.spellcastingGroups[0]!.spellRefs[0]!;
    Object.assign(ref,{identifier:'geas',originalName:'Geas',englishName:'Geas',method:'innate',uses:{value:1,recovery:'day',shared:false}});actor.flags[RESOLVER_MODULE_ID].spellManifest=inputManifest;
    const gameDescriptor=Object.getOwnPropertyDescriptor(globalThis,'game'),hooksDescriptor=Object.getOwnPropertyDescriptor(globalThis,'Hooks'),hooks=new TransactionHookBus();actor.lifecycleHooks=hooks;
    Object.defineProperty(globalThis,'game',{configurable:true,value:{system:{version:'5.3.3'},modules:new Map()}});Object.defineProperty(globalThis,'Hooks',{configurable:true,value:hooks});
    try{
      await executeHydrationTransaction({actor,manifest:inputManifest,plan:readyPlan(actor,undefined,undefined,inputManifest)});
      actor.withConditionalDamage=true;
      const cache=actor.items.find(item=>item.type==='spell'&&item.flags[RESOLVER_MODULE_ID].refId==='light-ref'),cast=actor.managedActivities().find(a=>a.flags[RESOLVER_MODULE_ID].refId==='light-ref')!;
      cache.system={...cache.system,...conditionalSpellFixture().system};cache.effects.unshift(...conditionalSpellFixture().effects);
      cache.flags[RESOLVER_MODULE_ID].generatedContentHash=computeManagedSourceHash(activitySource(cache));cache.system.description.value+='<p>Existing GM annotation</p>';
      cast.uses.spent=1;cache.system.uses.spent=2;actor.items[0]!.system.uses={spent:3,max:'4',recovery:[]};
      const other=actor.managedActivities().find(a=>a.flags[RESOLVER_MODULE_ID].refId==='darkness-ref')!,otherCache=actor.items.find(item=>item.type==='spell'&&item.flags[RESOLVER_MODULE_ID].refId==='darkness-ref');other.uses.spent=1;otherCache.system.uses.spent=4;
      const castBefore=activitySource(cast),otherBefore=activitySource(other),otherCacheBefore=activitySource(otherCache),before=actor.fullProjection(),raw=actor.rawItemProjection();
      const plan=readyPlan(actor,decision==='none'?undefined:decision==='keep'?'keep':'overwrite',undefined,inputManifest,decision==='other-ref'?'darkness-ref':'light-ref');
      const run=executeHydrationTransaction({actor,manifest:inputManifest,plan,completeSourceCache:true});
      if(decision!=='overwrite'){
        await expect(run).rejects.toThrow(decision==='keep'?'Keep cannot silently separate':'explicit Keep or Overwrite');expect(actor.fullProjection()).toEqual(before);expect(actor.rawItemProjection()).toEqual(raw);
      }else{
        expect((await run).status).toBe('committed');const done=actor.items.find(item=>item.id===cache.id);
        expect(done.system.description.value).toContain('Existing GM annotation');expect(Object.values(done.system.activities)).toHaveLength(2);expect(done.system.activities.dnd5eactivity000.damage.parts).toEqual([]);
        expect(activitySource(cast)).toEqual(castBefore);expect(activitySource(other)).toEqual(otherBefore);expect(activitySource(otherCache)).toEqual(otherCacheBefore);expect(done.system.uses.spent).toBe(2);expect(actor.items[0]!.system.uses.spent).toBe(3);
      }
    }finally{
      if(gameDescriptor)Object.defineProperty(globalThis,'game',gameDescriptor);else delete(globalThis as any).game;if(hooksDescriptor)Object.defineProperty(globalThis,'Hooks',hooksDescriptor);else delete(globalThis as any).Hooks;
    }
  });
  test.each([false,true])('owned usage chat projection remains atomic on a later failure, auto-cache=%s',async autoCache=>{
    const actor=new TransactionActor(autoCache);actor.withUsageChat=true;const inputManifest=manifest(),text='The recipient remains unaware; resolve this exception manually.';
    inputManifest.spellcastingGroups[0]!.spellRefs[0]!.restrictions=[{kind:'other',text,evidence:[{start:0,end:text.length,quote:text}]}];actor.flags[RESOLVER_MODULE_ID].spellManifest=inputManifest;
    const before=actor.fullProjection(),rawBefore=actor.rawItemProjection();let observed=false;
    await expect(executeHydrationTransaction({actor,manifest:inputManifest,plan:readyPlan(actor,undefined,undefined,inputManifest),failureInjector(stage){if(stage!=='after-partial-cache-creation')return;const cache=actor.items.find(item=>item.type==='spell');expect(cache.system.activities.SaveActivity0001.description.chatFlavor).toContain(text);observed=true;throw Error('after source chat projection');}})).rejects.toMatchObject({rollbackSucceeded:true,residualDifferences:[]});
    expect(observed).toBe(true);expect(actor.fullProjection()).toEqual(before);expect(actor.rawItemProjection()).toEqual(rawBefore);
  });
  test('explicit same-plan cache completion updates missing GM notes while old managed hashes remain valid',async()=>{
    const actor=new TransactionActor(true);actor.withUsageChat=true;const inputManifest=manifest(),text='Cannot repeat this action until its next turn.';
    inputManifest.spellcastingGroups[0]!.spellRefs[0]!.restrictions=[{kind:'other',text,evidence:[{start:0,end:text.length,quote:text}]}];actor.flags[RESOLVER_MODULE_ID].spellManifest=inputManifest;
    await executeHydrationTransaction({actor,manifest:inputManifest,plan:readyPlan(actor,undefined,undefined,inputManifest)});
    const oldCache=actor.items.find(item=>item.type==='spell'&&item.flags[RESOLVER_MODULE_ID].refId==='light-ref');oldCache.system.activities.SaveActivity0001.description.chatFlavor='Original native subtitle';
    oldCache.flags[RESOLVER_MODULE_ID].generatedContentHash=computeManagedSourceHash(activitySource(oldCache));
    actor.items[0]!.system.uses={spent:1,max:'1',recovery:[{period:'recharge',formula:'5'}]};
    const daily=actor.managedActivities().find(activity=>activity.flags[RESOLVER_MODULE_ID].refId==='darkness-ref')!;daily.uses.spent=1;oldCache.system.uses.spent=2;
    const dailyCache=actor.items.find(item=>item.type==='spell'&&item.flags[RESOLVER_MODULE_ID].refId==='darkness-ref');dailyCache.system.uses.spent=3;
    const dailyBefore=activitySource(daily),dailyCacheBefore=activitySource(dailyCache),callStart=actor.calls.length;
    const canonical=(value:any):any=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
    const plan=readyPlan(actor,undefined,undefined,inputManifest);actor.flags[RESOLVER_MODULE_ID].spellResolution.planHash=plan.planHash;actor.flags[RESOLVER_MODULE_ID].spellResolution.managedProjectionHash=sha256(JSON.stringify(canonical(projectCurrentManagedContent(actor,inputManifest.manifestId).sort((a,b)=>a.logicalRefKey.localeCompare(b.logicalRefKey,'en')))));
    const result=await executeHydrationTransaction({actor,manifest:inputManifest,plan,completeSourceCache:true});expect(result.status).toBe('committed');
    const cache=actor.items.find(item=>item.type==='spell'&&item.flags[RESOLVER_MODULE_ID].refId==='light-ref');expect(cache.system.activities.SaveActivity0001.description.chatFlavor).toContain(text);
    expect(cache.system.description.value).toBe('Official spell body');expect(cache.flags[RESOLVER_MODULE_ID].generatedContentHash).toBe(computeManagedSourceHash(activitySource(cache)));
    expect(actor.items[0]!.system.uses.spent).toBe(1);expect(cache.system.uses.spent).toBe(2);expect(activitySource(daily)).toEqual(dailyBefore);expect(activitySource(dailyCache)).toEqual(dailyCacheBefore);
    expect(actor.calls.slice(callStart).some(call=>call[0]==='createEmbeddedDocuments'||call[0]==='deleteEmbeddedDocuments')).toBe(false);
    const changedIds=actor.calls.slice(callStart).filter(call=>call[0]==='updateEmbeddedDocuments').flatMap(call=>(call[2] as any[]).map(update=>update._id));expect(changedIds.every(id=>id===cache.id)).toBe(true);
    cache.system.description.value='Manual kept body';cache.system.activities.SaveActivity0001.description.chatFlavor='Manual kept subtitle';
    await executeHydrationTransaction({actor,manifest:inputManifest,plan:readyPlan(actor,'keep',undefined,inputManifest),completeSourceCache:true});
    const kept=actor.items.find(item=>item.id===cache.id);expect(kept.system.description.value).toBe('Manual kept body');expect(kept.system.activities.SaveActivity0001.description.chatFlavor).toStartWith('Manual kept subtitle\n');expect(kept.flags[RESOLVER_MODULE_ID].protected).toBe(true);expect(kept.system.uses.spent).toBe(2);
  });
  test.each(['before','after'] as const)('source cache completion public write rejection %s commit restores all prior documents and counters',async phase=>{
    const actor=new TransactionActor(true);actor.withUsageChat=true;const inputManifest=manifest();actor.flags[RESOLVER_MODULE_ID].spellManifest=inputManifest;
    await executeHydrationTransaction({actor,manifest:inputManifest,plan:readyPlan(actor,undefined,undefined,inputManifest)});
    const text='This action cannot be repeated until the next turn.';inputManifest.spellcastingGroups[0]!.spellRefs[0]!.restrictions=[{kind:'other',text,evidence:[{start:0,end:text.length,quote:text}]}];
    actor.chatWriteFailure=phase;const before=actor.fullProjection(),raw=actor.rawItemProjection();
    await expect(executeHydrationTransaction({actor,manifest:inputManifest,plan:readyPlan(actor,undefined,undefined,inputManifest),completeSourceCache:true})).rejects.toMatchObject({rollbackSucceeded:true,residualDifferences:[]});
    expect(actor.fullProjection()).toEqual(before);expect(actor.rawItemProjection()).toEqual(raw);
  });
  test('requires exact field recovery before any document write', async () => {
    const actor = new TransactionActor();
    const before = actor.fullProjection();
    await expect(executeHydrationTransactionRuntime({
      actor, manifest: manifest(), plan: readyPlan(), fieldReplacement: {} as any,
    })).rejects.toThrow('ForcedReplacement');
    await expect(executeHydrationTransaction({
      actor, manifest: manifest(), plan: readyPlan(), fieldReplacement: { create() { throw new Error('replacement unavailable'); } },
    })).rejects.toThrow('replacement unavailable');
    expect(actor.calls).toEqual([]);
    expect(actor.fullProjection()).toEqual(before);
  });

  test.each(['veto', 'missing-report'] as const)('rejects an unconfirmed final commit (%s) and restores the prior state', async (mode) => {
    const actor = new TransactionActor();
    const before = actor.fullProjection();
    const foreignBefore = actor.foreignProjection();
    const update = actor.update.bind(actor);
    const commitKey = `flags.${RESOLVER_MODULE_ID}.spellResolution`;
    let commitAttempts = 0;
    Object.assign(actor, { update: async (change: Record<string, any>) => {
      if (Object.hasOwn(change, commitKey)) {
        commitAttempts++;
        expect(actor.managedActivities()).toHaveLength(2);
        // Core 14.368 filters vetoed preUpdate requests and may resolve undefined.
        if (mode === 'veto') return undefined;
        // A pre-update adapter may also mutate its input: expected commit data
        // must be kept separately rather than blessed by that same mutation.
        delete change[commitKey].report;
        return update(change);
      }
      return update(change);
    } });

    const result = await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() })
      .then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
    expect(result.value).toBeUndefined();
    expect(result.error).toBeInstanceOf(HydrationTransactionError);
    expect(result.error.rollbackSucceeded).toBe(true);
    expect(result.error.diagnostic.phase).toBe('commit');
    expect(commitAttempts).toBe(1);
    expect(actor.fullProjection()).toEqual(before);
    expect(actor.foreignProjection()).toEqual(foreignBefore);
  });

  test('rejects managed content drift during final commit and restores the prior state', async () => {
    const actor = new TransactionActor();
    const before = actor.fullProjection();
    const foreignBefore = actor.foreignProjection();
    const update = actor.update.bind(actor);
    Object.assign(actor, { update: async (change: Record<string, any>) => {
      const result = await update(change);
      if (Object.hasOwn(change, `flags.${RESOLVER_MODULE_ID}.spellResolution`)) {
        actor.managedActivities()[0]!.spell.challenge.attack = '99';
      }
      return result;
    } });
    const result = await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() })
      .then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
    expect(result.value).toBeUndefined();
    expect(result.error).toBeInstanceOf(HydrationTransactionError);
    expect(result.error.rollbackSucceeded).toBe(true);
    expect(result.error.diagnostic.phase).toBe('commit');
    expect(actor.fullProjection()).toEqual(before);
    expect(actor.foreignProjection()).toEqual(foreignBefore);
  });

  test.each([[false], [true]] as const)('commits atomically with native auto-cache=%s, serializes, and use spending is a no-op', async (autoCache) => {
    const actor = new TransactionActor(autoCache);
    const foreignBefore = actor.foreignProjection();
    const plan = readyPlan();
    const [first, second] = await Promise.all([
      executeHydrationTransaction({ actor, manifest: manifest(), plan }),
      executeHydrationTransaction({ actor, manifest: manifest(), plan }),
    ]);

    expect([first.status, second.status].sort()).toEqual(['committed', 'noop']);
    expect(actor.maxConcurrentMutations).toBe(1);
    expect(actor.items.filter((item) => item.type === 'spell')).toHaveLength(2);
    expect(actor.managedActivities()).toHaveLength(2);
    expect(actor.foreignProjection()).toEqual(foreignBefore);
    const resolution = actor.flags[RESOLVER_MODULE_ID].spellResolution;
    expect(resolution).toMatchObject({
      status: 'hydrated', planHash: plan.planHash, manifestHash: plan.manifestHash,
      resolutionConfigHash: plan.resolutionConfigHash,
      report: { selections: plan.selections.map((entry) => expect.objectContaining({
        logicalRefKey: entry.logicalRefKey, selectedUuid: entry.uuid, rules: entry.rules, selectionOrigin: entry.selectionOrigin,
      })) },
    });
    expect(resolution.undoSnapshot).toBeDefined();
    expect(resolution.generatedProjection).toHaveLength(2);
    expect(resolution.generatedProjection.every((entry: any) => entry.activities.length === 1 && entry.cachedSpells.length === 1)).toBe(true);
    expect(resolution.generatedProjection.map((entry: any) => entry.logicalRefKey)).toEqual(
      [...plan.selections.map((entry) => entry.logicalRefKey)].sort(),
    );
    expect(JSON.stringify(resolution.generatedProjection)).not.toMatch(/description\.value|effects|preparedSpellDefault/);
    expect(resolution.generatedProjection[0].cachedSpells[0]).toMatchObject({
      type: 'spell', compendiumSource: expect.stringContaining('Compendium.dnd5e.spells24.Item.'),
      resolver: { managed: true, documentType: 'spell' },
    });
    expect(Array.isArray(resolution.report.literalRestrictions)).toBe(true);

    const daily = actor.managedActivities().find((activity) => activity.uses?.max === '1')!;
    daily.uses.spent = 1;
    const dailyCache = actor.items.find((item) => item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey
      === daily.flags[RESOLVER_MODULE_ID].logicalRefKey && item.type === 'spell')!;
    dailyCache.system.uses.spent = 1;
    const callCount = actor.calls.length;
    const noop = await executeHydrationTransaction({ actor, manifest: manifest(), plan });
    expect(noop.status).toBe('noop');
    expect(actor.calls).toHaveLength(callCount);
    expect(daily.uses.spent).toBe(1);
    expect(dailyCache.system.uses.spent).toBe(1);
    expect(actor.items.filter((item) => item.type === 'spell')).toHaveLength(2);
  });

  test('replaces the single undo snapshot on a second commit without nesting prior history', async () => {
    const actor = new TransactionActor();
    const first = await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
    expect(first.status).toBe('committed');

    const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
    const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    activity.description = { chatFlavor: 'second commit' };
    const second = await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan(actor, 'overwrite') });
    expect(second.status).toBe('committed');

    const serializedFlags = JSON.stringify(actor.flags[RESOLVER_MODULE_ID]);
    expect(serializedFlags.match(/\"undoSnapshot\"/g)).toHaveLength(1);
    expect(actor.flags[RESOLVER_MODULE_ID].spellResolution.undoSnapshot.resolverFlags?.spellResolution?.undoSnapshot).toBeUndefined();
  });

  test('restores the exact prior resolver namespace when a second commit fails', async () => {
    const actor = new TransactionActor();
    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
    const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
    const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    activity.description = { chatFlavor: 'preserve on failed re-resolution' };
    const plan = readyPlan(actor, 'overwrite');
    const before = actor.fullProjection();
    const resolverFlagsBefore = structuredClone(actor.flags[RESOLVER_MODULE_ID]);

    await expect(executeHydrationTransaction({
      actor, manifest: manifest(), plan,
      failureInjector(stage) { if (stage === 'after-feature-update') throw new Error('second commit failed'); },
    })).rejects.toMatchObject({ rollbackSucceeded: true, residualDifferences: [] });
    expect(actor.fullProjection()).toEqual(before);
    expect(actor.flags[RESOLVER_MODULE_ID]).toEqual(resolverFlagsBefore);
  });

  test('6.0.2 same-UUID failed Overwrite restores the exact system.changes cache snapshot', async () => {
    const actor = new TransactionActor(false, 'system');
    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
    const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
    const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    const cache = actor.items.find((item) => item.type === 'spell'
      && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)!;
    activity.spell.challenge.attack = '9';
    const manualChanges = [{ key: 'flags.user.manual', mode: 5, value: 'restore-after-failure' }];
    cache.effects.find((effect: any) => effect.type === 'enchantment').system.changes = structuredClone(manualChanges);
    const before = actor.fullProjection();
    const rawBefore = actor.rawItemProjection();

    await expect(executeHydrationTransaction({
      actor, manifest: manifest(), plan: readyPlan(actor, 'overwrite'),
      failureInjector(stage) { if (stage === 'after-partial-cache-creation') throw new Error('force 6.0.2 rollback'); },
    })).rejects.toMatchObject({ rollbackSucceeded: true, residualDifferences: [] });

    expect(actor.fullProjection()).toEqual(before);
    expect(actor.rawItemProjection()).toEqual(rawBefore);
    const restored = actor.items.find((item) => item.id === cache.id)!;
    expect(restored.effects.find((effect: any) => effect.type === 'enchantment').system.changes).toEqual(manualChanges);
  });

  test.each([[false], [true]] as const)(
    'overwrites destination UUID A to B by deleting the old cache and leaving one new cache with native auto-cache=%s',
    async (autoCache) => {
      const actor = new TransactionActor(autoCache);
      await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
      const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
      const oldCache = actor.items.find((item) => item.type === 'spell'
        && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)!;
      const destinationB = 'cccccccccccccccc';
      const callStart = actor.calls.length;

      const result = await executeHydrationTransaction({
        actor,
        manifest: manifest(),
        plan: readyPlan(actor, 'overwrite', destinationB),
      });

      expect(result.status).toBe('committed');
      const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
      const caches = actor.items.filter((item) => item.type === 'spell'
        && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey);
      expect(activity.spell.uuid).toBe(`Compendium.dnd5e.spells24.Item.${destinationB}`);
      expect(activity.flags[RESOLVER_MODULE_ID].selectedUuid).toBe(activity.spell.uuid);
      expect(caches).toHaveLength(1);
      expect(caches[0]!._stats.compendiumSource).toBe(activity.spell.uuid);
      expect(caches[0]!.flags[RESOLVER_MODULE_ID].selectedUuid).toBe(activity.spell.uuid);
      expect(actor.items.includes(oldCache)).toBe(false);
      expect(caches[0]).not.toBe(oldCache);
      const reResolveCalls = actor.calls.slice(callStart);
      const createdDestinationB = reResolveCalls.some((call: any) => call[0] === 'createEmbeddedDocuments'
        && call[2].includes(`Compendium.dnd5e.spells24.Item.${destinationB}`));
      if (autoCache) {
        expect(reResolveCalls).toContainEqual(['nativeDeleteCachedSpell', oldCache.id]);
        expect(createdDestinationB).toBe(false);
      } else {
        expect(reResolveCalls).toContainEqual(['deleteEmbeddedDocuments', 'Item', [oldCache.id]]);
        expect(createdDestinationB).toBe(true);
      }
    },
  );

  test.each([[false], [true]] as const)(
    'restores UUID A and its single cache when A to B overwrite fails with native auto-cache=%s',
    async (autoCache) => {
      const actor = new TransactionActor(autoCache);
      await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
      const before = actor.fullProjection();
      const rawItemsBefore = actor.rawItemProjection();
      let injected = false;

      await expect(executeHydrationTransaction({
        actor,
        manifest: manifest(),
        plan: readyPlan(actor, 'overwrite', 'cccccccccccccccc'),
        failureInjector(stage) {
          if (stage !== 'after-partial-cache-creation') return;
          injected = true;
          throw new Error('A to B failed');
        },
      })).rejects.toMatchObject({ rollbackSucceeded: true, residualDifferences: [] });

      expect(injected).toBe(true);
      expect(actor.fullProjection()).toEqual(before);
      expect(actor.rawItemProjection()).toEqual(rawItemsBefore);
      const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
      const caches = actor.items.filter((item) => item.type === 'spell'
        && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey);
      expect(caches).toHaveLength(1);
      expect(caches[0]!._stats.compendiumSource).toBe('Compendium.dnd5e.spells24.Item.aaaaaaaaaaaaaaaa');
    },
  );

  test.each(([
    'after-feature-update', 'after-partial-cache-creation', 'during-cleanup',
  ] as HydrationFailureStage[]).flatMap((stage) => [[stage, false], [stage, true]] as const))(
    'compensates the complete Actor after injected failure at %s with native auto-cache=%s', async (stage, autoCache) => {
    const actor = new TransactionActor(autoCache);
    if (stage === 'during-cleanup') actor.installStaleManagedPair();
    const before = actor.fullProjection();
    const rawItemsBefore = actor.rawItemProjection();
    const foreignBefore = actor.foreignProjection();
    await expect(executeHydrationTransaction({
      actor, manifest: manifest(), plan: readyPlan(actor),
      failureInjector: (current) => { if (current === stage) throw new Error(`injected ${stage}`); },
    })).rejects.toMatchObject({ rollbackSucceeded: true, residualDifferences: [] });
    expect(actor.fullProjection()).toEqual(before);
    expect(actor.rawItemProjection()).toEqual(rawItemsBefore);
    expect(actor.foreignProjection()).toEqual(foreignBefore);
  });

  test.each([false, true])('an adapted source effect duration remains atomic on later failure, native auto-cache=%s', async autoCache => {
    const actor = new TransactionActor(autoCache); actor.withDurationEffect = true;
    const inputManifest = manifest();
    Object.assign(inputManifest.spellcastingGroups[0]!.spellRefs[0]!, { identifier: 'disguise-self', originalName: 'Disguise Self', englishName: 'Disguise Self' });
    inputManifest.spellcastingGroups[0]!.spellRefs[0]!.restrictions = [{ kind: 'casting', text: '持续24小时', value: 24, evidence: [{ start: 0, end: 6, quote: '持续24小时' }] }];
    actor.flags[RESOLVER_MODULE_ID].spellManifest = inputManifest;
    const before = actor.fullProjection(), rawBefore = actor.rawItemProjection();
    let sawAdaptedCache = false;
    await expect(executeHydrationTransaction({
      actor, manifest: inputManifest, plan: readyPlan(actor, undefined, undefined, inputManifest),
      failureInjector(stage) {
        if (stage !== 'after-partial-cache-creation') return;
        const spell = actor.items.find(item => item.type === 'spell');
        expect(spell?.effects.find((effect: any) => effect._id === 'SrIb7dbaZs5F4zi9')?.duration.value).toBe(86400);
        sawAdaptedCache = true;
        throw Error('fail after source duration adaptation');
      },
    })).rejects.toMatchObject({ rollbackSucceeded: true, residualDifferences: [] });
    expect(sawAdaptedCache).toBe(true);
    expect(actor.fullProjection()).toEqual(before); expect(actor.rawItemProjection()).toEqual(rawBefore);
  });

  test.each(['before', 'after'] as const)('source effect duration public write rejection %s commit restores the complete prior Actor', async failure => {
    const actor = new TransactionActor(true); actor.withDurationEffect = true; actor.durationWriteFailure = failure;
    const inputManifest = manifest();
    Object.assign(inputManifest.spellcastingGroups[0]!.spellRefs[0]!, { identifier: 'disguise-self', originalName: 'Disguise Self', englishName: 'Disguise Self' });
    inputManifest.spellcastingGroups[0]!.spellRefs[0]!.restrictions = [{ kind: 'casting', text: '持续24小时', value: 24, evidence: [{ start: 0, end: 6, quote: '持续24小时' }] }];
    actor.flags[RESOLVER_MODULE_ID].spellManifest = inputManifest;
    const before = actor.fullProjection(), rawBefore = actor.rawItemProjection();
    await expect(executeHydrationTransaction({ actor, manifest: inputManifest, plan: readyPlan(actor, undefined, undefined, inputManifest) }))
      .rejects.toMatchObject({ rollbackSucceeded: true, residualDifferences: [] });
    expect(actor.fullProjection()).toEqual(before); expect(actor.rawItemProjection()).toEqual(rawBefore);
  });

  test('waits for delayed public createItem completion while restoring snapshot Activities during rollback', async () => {
    const actor = new TransactionActor(true);
    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
    const before = actor.rawItemProjection();
    const hooks = new TransactionHookBus();
    actor.lifecycleHooks = hooks;
    actor.nativeCreateDelayMs = 450;
    const startedAt = Date.now();

    await expect(executeHydrationTransaction({
      actor, manifest: manifest(), plan: readyPlan(actor), lifecycleHooks: hooks,
      failureInjector(stage) {
        if (stage === 'after-partial-cache-creation') throw new Error('force snapshot restore');
      },
    })).rejects.toMatchObject({ rollbackSucceeded: true, residualDifferences: [] });

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(800);
    expect(actor.rawItemProjection()).toEqual(before);
  }, 10_000);

  test('reports exact residual differences when rollback cannot fully restore', async () => {
    const actor = new TransactionActor(true);
    actor.installStaleManagedPair();
    let originalFailureSeen = false;
    try {
      await executeHydrationTransaction({
        actor, manifest: manifest(), plan: readyPlan(actor),
        failureInjector(stage) {
          if (stage === 'during-cleanup') {
            originalFailureSeen = true;
            throw new Error('cleanup failed');
          }
          if (stage === 'during-rollback') actor.failSnapshotRecreate = true;
        },
      });
      throw new Error('Expected transaction failure.');
    } catch (error) {
      expect(originalFailureSeen).toBe(true);
      expect(error).toBeInstanceOf(HydrationTransactionError);
      const transactionError = error as HydrationTransactionError;
      expect(transactionError.rollbackSucceeded).toBe(false);
      expect(transactionError.residualDifferences.length).toBeGreaterThan(0);
      expect(transactionError.residualDifferences.every((entry) => entry.path.startsWith('/managed/')
        || entry.path.startsWith('/flags/') || entry.path.startsWith('/items/')
        || entry.path === '/rollback/errors')).toBe(true);
      expect(transactionError.diagnostic!.phase).toBe('cleanup');
      expect(transactionError.diagnostic).toMatchObject({ selectionIndex: null, selectionCount: null, ownership: null });
      expect(transactionError.diagnostic!.residualPaths).toEqual([...new Set(transactionError.residualDifferences.map((entry) => entry.path))]);
      expect(transactionError.message).toContain('residual paths:');
      expect(transactionError.message).toContain('cleanup failed');
    }
  });

  test('reports the selection and missing ownership shape while safely rolling back the exact native cache', async () => {
    const actor = new TransactionActor(true, 'system');
    actor.stripNextSpellOwnership = true;
    try {
      await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
      throw new Error('Expected ownership failure.');
    } catch (error) {
      expect(error).toBeInstanceOf(HydrationTransactionError);
      const failure = error as HydrationTransactionError;
      expect(failure.diagnostic).toMatchObject({
        phase: 'selection', selectionIndex: 1, selectionCount: 2,
        ownership: { code: 'RESOLVER_OWNERSHIP_MISSING', expectedType: 'spell', namespacePresent: false,
          managed: false, documentType: '<missing>' },
      });
      expect(failure.rollbackSucceeded).toBe(true);
      expect(failure.diagnostic!.residualPaths).toEqual([...new Set(failure.residualDifferences.map((entry) => entry.path))]);
      expect(actor.items.some((item) => item.type === 'spell' && item.flags?.dnd5e?.cachedFor)).toBe(false);
    }
  });

  test('does not declare rollback restored when a compensating operation itself reports an error', async () => {
    const actor = new TransactionActor();
    try {
      await executeHydrationTransaction({
        actor, manifest: manifest(), plan: readyPlan(),
        failureInjector(stage) {
          if (stage === 'after-feature-update') throw new Error('original failure');
          if (stage === 'during-rollback') throw new Error('rollback operation failed');
        },
      });
      throw new Error('Expected transaction failure.');
    } catch (error) {
      expect(error).toBeInstanceOf(HydrationTransactionError);
      const transactionError = error as HydrationTransactionError;
      expect(transactionError.rollbackSucceeded).toBe(false);
      expect(transactionError.residualDifferences).toContainEqual({
        path: '/rollback/errors', after: ['rollback operation failed'],
      });
    }
  });

  test('a public lifecycle timeout is failed recovery with an exact rollback error, never a silent success', async () => {
    const actor = new TransactionActor(false);
    const hooks = new TransactionHookBus();
    try {
      await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan(), lifecycleHooks: hooks });
      throw new Error('Expected lifecycle timeout.');
    } catch (error) {
      expect(error).toBeInstanceOf(HydrationTransactionError);
      const transactionError = error as HydrationTransactionError;
      expect(transactionError.rollbackSucceeded).toBe(false);
      expect(transactionError.residualDifferences).toContainEqual(expect.objectContaining({
        path: '/rollback/errors',
      }));
      expect(JSON.stringify(transactionError.residualDifferences)).toContain('Timed out waiting for public Foundry createItem');
    }
  }, 10_000);

  test('rollback preserves and reports a same-provenance native cache whose getter projection changed', async () => {
    const actor = new TransactionActor(true);
    let changed = false;
    try {
      await executeHydrationTransaction({
        actor, manifest: manifest(), plan: readyPlan(),
        failureInjector(stage) {
          if (stage !== 'after-feature-update') return;
          const cache = actor.items.find((item) => item.type === 'spell' && item.flags?.[RESOLVER_MODULE_ID]?.managed);
          if (!cache) throw new Error('expected adopted native cache');
          cache.name = 'Projection changed after adoption';
          changed = true;
          throw new Error('projection changed after adoption');
        },
      });
      throw new Error('Expected projection-safe rollback failure.');
    } catch (error) {
      expect(error).toBeInstanceOf(HydrationTransactionError);
      expect(changed).toBe(true);
      const transactionError = error as HydrationTransactionError;
      expect(transactionError.rollbackSucceeded).toBe(false);
      expect(transactionError.residualDifferences.some((entry) => entry.path === '/rollback/errors')).toBe(true);
      expect(actor.items.some((item) => item.type === 'spell' && item.name === 'Projection changed after adoption')).toBe(true);
    }
  });

  test('does not use name matching and leaves foreign items, activities, effects, flags, and feature data deep-equal', async () => {
    const actor = new TransactionActor();
    actor.items.push({
      id: 'ForeignSpell0001', _id: 'ForeignSpell0001', type: 'spell', name: 'Light', parent: actor, actor,
      flags: { foreign: { keep: true } }, effects: [{ _id: 'ForeignEffect001', keep: true }], system: { uses: { spent: 7 } },
    });
    const before = actor.foreignProjection();
    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
    expect(actor.foreignProjection()).toEqual(before);
  });

  test.each(['keep', 'overwrite'] as const)('executes explicit %s semantics for managed structural drift', async (decision) => {
    const actor = new TransactionActor();
    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
    const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
    const priorGenerated = structuredClone(actor.flags[RESOLVER_MODULE_ID].spellResolution.generatedProjection
      .find((entry: any) => entry.logicalRefKey === lightKey));
    const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    const cache = actor.items.find((item) => item.flags?.[RESOLVER_MODULE_ID]?.documentType === 'spell'
      && item.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    activity.spell.challenge.attack = '9';
    activity.description = { chatFlavor: 'manual activity field' };
    cache.system.manualField = { keep: true };
    activity.flags.foreign = { nested: { activity: true } };
    activity.flags.dnd5e = { runtimeOnly: { activity: true } };
    cache.flags.foreign = { nested: { cache: true } };
    cache.flags.dnd5e.runtimeOnly = { cache: true };
    const foreignFlags = {
      activity: structuredClone({ foreign: activity.flags.foreign, dnd5e: activity.flags.dnd5e }),
      cache: structuredClone({ foreign: cache.flags.foreign, runtimeOnly: cache.flags.dnd5e.runtimeOnly }),
    };

    const result = await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan(actor, decision) });
    expect(result.status).toBe('committed');
    const keptActivity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    const keptCache = actor.items.find((item) => item.flags?.[RESOLVER_MODULE_ID]?.documentType === 'spell'
      && item.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    const committedGenerated = actor.flags[RESOLVER_MODULE_ID].spellResolution.generatedProjection
      .find((entry: any) => entry.logicalRefKey === lightKey);
    expect({ foreign: keptActivity.flags.foreign, dnd5e: keptActivity.flags.dnd5e }).toEqual(foreignFlags.activity);
    expect({ foreign: keptCache.flags.foreign, runtimeOnly: keptCache.flags.dnd5e.runtimeOnly }).toEqual(foreignFlags.cache);
    if (decision === 'keep') {
      expect(keptActivity.spell.challenge.attack).toBe('9');
      expect(keptActivity.description).toEqual({ chatFlavor: 'manual activity field' });
      expect(keptCache.system.manualField).toEqual({ keep: true });
      expect(keptActivity.flags[RESOLVER_MODULE_ID].protected).toBe(true);
      expect(keptCache.flags[RESOLVER_MODULE_ID].protected).toBe(true);
      expect(committedGenerated).toEqual(priorGenerated);
      expect(committedGenerated.activities[0].spell.challenge.attack).toBe('4');
    } else {
      expect(keptActivity.spell.challenge.attack).toBe('4');
      expect(keptActivity.description).toBeUndefined();
      expect(keptCache.system.manualField).toBeUndefined();
      expect(keptActivity.flags[RESOLVER_MODULE_ID].protected).toBeUndefined();
      expect(keptCache.flags[RESOLVER_MODULE_ID].protected).toBeUndefined();
      expect(committedGenerated.activities[0].spell.challenge.attack).toBe('4');
    }
  });

  test('Keep without a prior generated baseline leaves Last generated unavailable', async () => {
    const actor = new TransactionActor();
    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
    const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
    delete actor.flags[RESOLVER_MODULE_ID].spellResolution.generatedProjection;
    const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    activity.spell.challenge.attack = '9';

    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan(actor, 'keep') });
    const generated = actor.flags[RESOLVER_MODULE_ID].spellResolution.generatedProjection;
    expect(generated.some((entry: any) => entry.logicalRefKey === lightKey)).toBe(false);
    expect(activity.spell.challenge.attack).toBe('9');
  });

  test('Overwrite after Keep is the only transaction path that clears protection and restores deterministic content', async () => {
    const actor = new TransactionActor();
    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
    const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
    const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    activity.spell.challenge.attack = '9';
    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan(actor, 'keep') });
    const keptActivity = actor.managedActivities()
      .find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    expect(keptActivity.flags[RESOLVER_MODULE_ID].protected).toBe(true);
    expect(keptActivity.spell.challenge.attack).toBe('9');

    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan(actor, 'overwrite') });
    const overwrittenActivity = actor.managedActivities()
      .find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    const overwrittenCache = actor.items.find((item) => item.type === 'spell'
      && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)!;
    expect(overwrittenActivity.spell.challenge.attack).toBe('4');
    expect(overwrittenActivity.flags[RESOLVER_MODULE_ID].protected).toBeUndefined();
    expect(overwrittenCache.flags[RESOLVER_MODULE_ID].protected).toBeUndefined();
  });

  test.each([[false], [true]] as const)(
    'Keep restores the exact manual cached Spell after both dnd5e Activity lifecycle writes with native auto-cache=%s',
    async (autoCache) => {
      const actor = new TransactionActor(autoCache);
      await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
      const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
      const cache = actor.items.find((item) => item.type === 'spell'
        && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)!;
      const enchantment = cache.effects.find((effect: any) => effect._id === 'dnd5espellchang')!;
      enchantment.changes = [{ key: 'flags.user.manual', mode: 5, value: 'keep-me', priority: 42 }];
      cache.effects.push({
        _id: 'UserEffect000001', name: 'Manual effect', transfer: false,
        changes: [{ key: 'system.bonuses.mwak.attack', mode: 2, value: '+1', priority: 20 }],
        flags: { foreign: { nested: true } },
      });
      cache.system.manualField = { nested: { keep: true } };
      cache.flags.foreign = { nested: { cache: true } };
      cache.flags.dnd5e.runtimeOnly = { nested: true };
      const before = keptCacheProjection(cache);
      const callStart = actor.calls.length;

      const result = await executeHydrationTransaction({
        actor,
        manifest: manifest(),
        plan: readyPlan(actor, 'keep'),
      });

      expect(result.status).toBe('committed');
      const caches = actor.items.filter((item) => item.type === 'spell'
        && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey);
      expect(caches).toHaveLength(1);
      expect(keptCacheProjection(caches[0])).toEqual(before);
      expect(caches[0]!.flags[RESOLVER_MODULE_ID].protected).toBe(true);
      expect(actor.calls.slice(callStart).filter((call: any) => call[0] === 'nativeRefreshCachedEnchantment'
        && call[1] === cache.id)).toHaveLength(2);
    },
  );

  test.each([[false], [true]] as const)(
    'Keep has restored manual cached Spell content before a later failure and rollback with native auto-cache=%s',
    async (autoCache) => {
      const actor = new TransactionActor(autoCache);
      await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
      const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
      const cache = actor.items.find((item) => item.type === 'spell'
        && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)!;
      cache.effects.find((effect: any) => effect._id === 'dnd5espellchang')!.changes = [
        { key: 'flags.user.rollback', mode: 5, value: 'keep-me', priority: 41 },
      ];
      cache.effects.push({ _id: 'UserEffect000002', name: 'Rollback manual effect', changes: [] });
      cache.system.manualField = { rollback: { keep: true } };
      cache.flags.foreign = { rollback: { keep: true } };
      const keptBefore = keptCacheProjection(cache);
      const fullBefore = actor.fullProjection();
      const rawItemsBefore = actor.rawItemProjection();
      let restoredBeforeFailure = false;

      await expect(executeHydrationTransaction({
        actor,
        manifest: manifest(),
        plan: readyPlan(actor, 'keep'),
        failureInjector(stage) {
          if (stage !== 'after-partial-cache-creation') return;
          const current = actor.items.find((item) => item.type === 'spell'
            && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)!;
          restoredBeforeFailure = JSON.stringify(keptCacheProjection(current)) === JSON.stringify(keptBefore);
          throw new Error('fail after kept cache restoration');
        },
      })).rejects.toMatchObject({ rollbackSucceeded: true, residualDifferences: [] });

      expect(restoredBeforeFailure).toBe(true);
      expect(actor.fullProjection()).toEqual(fullBefore);
      expect(actor.rawItemProjection()).toEqual(rawItemsBefore);
    },
  );

  test('validates complete unique manifest selections before the first Actor write', async () => {
    for (const mutate of [
      (plan: SpellHydrationPlan) => { plan.selections.pop(); },
      (plan: SpellHydrationPlan) => { plan.selections.push(structuredClone(plan.selections[0]!)); },
    ]) {
      const actor = new TransactionActor();
      const plan = structuredClone(readyPlan());
      mutate(plan);
      plan.planHash = sha256(canonicalPlan(plan));
      await expect(executeHydrationTransaction({ actor, manifest: manifest(), plan })).rejects.toThrow(/every manifest ref|duplicate/i);
      expect(actor.calls).toEqual([]);
    }
  });

  test('reports an unowned post-snapshot Item as an exact residual instead of deleting or overlooking it', async () => {
    const actor = new TransactionActor();
    try {
      await executeHydrationTransaction({
        actor, manifest: manifest(), plan: readyPlan(),
        failureInjector(stage) {
          if (stage !== 'after-feature-update') return;
          actor.items.push({
            id: 'UnownedCache0001', _id: 'UnownedCache0001', type: 'spell', parent: actor, actor,
            flags: { dnd5e: { cachedFor: '.hostile' } }, system: {}, effects: [],
          });
          throw new Error('hostile post-snapshot cache');
        },
      });
      throw new Error('Expected residual failure.');
    } catch (error) {
      expect(error).toBeInstanceOf(HydrationTransactionError);
      const transactionError = error as HydrationTransactionError;
      expect(transactionError.rollbackSucceeded).toBe(false);
      expect(transactionError.residualDifferences).toContainEqual(expect.objectContaining({ path: '/items/UnownedCache0001' }));
      expect(actor.items.some((item) => item.id === 'UnownedCache0001')).toBe(true);
    }
  });

  test('service Overwrite rebuilds a wholly deleted persisted pair through the real transaction', async () => {
    const actor = new TransactionActor();
    const candidates: SpellCandidateMetadata[] = [
      {
        id: 'aaaaaaaaaaaaaaaa', uuid: 'Compendium.dnd5e.spells24.Item.aaaaaaaaaaaaaaaa',
        packageId: 'dnd5e', packId: 'spells24', name: 'Light', identifier: 'light', rules: '2024',
      },
      {
        id: 'bbbbbbbbbbbbbbbb', uuid: 'Compendium.dnd5e.spells24.Item.bbbbbbbbbbbbbbbb',
        packageId: 'dnd5e', packId: 'spells24', name: 'Darkness', identifier: 'darkness', rules: '2024',
      },
    ];
    const runtime: any = {
      moduleId: RESOLVER_MODULE_ID,
      compatibility: { supported: true, foundry: '14.364', dnd5e: '5.3.3', diagnostics: [] },
      canMutate: true,
      diagnostics: [],
      sourceIndex: {
        candidates,
        sourcePackages: [{ packageId: 'dnd5e', version: '5.3.3' }],
        diagnostics: [],
        candidateMetadataHash: 'b'.repeat(64),
        sourceInventoryHash: 'd'.repeat(64),
      },
    };
    const reviews: any[] = [];
    const notifications: any[] = [];
    const service = createResolverActorService({
      getRuntime: () => runtime,
      getSetting: (key) => key === 'sourcePriority' ? [{ packageId: 'dnd5e', packId: 'spells24' }] : {},
      setSetting: async () => {},
      fetchSelectedDocument: async (uuid) => {
        const candidate = candidates.find((entry) => entry.uuid === uuid)!;
        return {
          documentName: 'Item', type: 'spell', uuid, name: candidate.name,
          system: { identifier: candidate.identifier, source: { rules: candidate.rules } },
        };
      },
      execute: (target, targetManifest, plan) => executeHydrationTransaction({ actor: target, manifest: targetManifest, plan }),
      openReview: async (model) => {
        reviews.push(model);
        const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
        expect(model.spells.find((spell) => spell.logicalRefKey === lightKey)).toMatchObject({
          manualConflict: { keepable: false, explanation: expect.any(String) },
          candidateDecisionRequired: false,
          blocking: true,
        });
        return reviews.length === 1
          ? { action: 'cancel' }
          : { action: 'apply', manualDecisions: [{ logicalRefKey: lightKey, decision: 'overwrite' }], candidateSelections: [] };
      },
      renderTemplate: async (_path, context) => String(context.content ?? ''),
      showDocument: async () => {},
      exportJson: () => {},
      notify: (...args) => notifications.push(args),
    });

    // Pending with no managed documents must remain the ordinary automatic path.
    await service.processActor(actor);
    expect(reviews).toHaveLength(0);
    expect(actor.flags[RESOLVER_MODULE_ID].spellResolution.status).toBe('hydrated');
    runtime.sourceIndex.sourceInventoryHash = actor.flags[RESOLVER_MODULE_ID].spellResolution.report.sourceInventoryHash;
    runtime.sourceIndex.candidateMetadataHash = actor.flags[RESOLVER_MODULE_ID].spellResolution.report.candidateMetadataHash;

    const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
    const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    const cache = actor.items.find((item) => item.type === 'spell'
      && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)!;
    const feature = actor.items[0]!;
    await feature.deleteActivity(activity.id);
    await actor.deleteEmbeddedDocuments('Item', [cache.id]);
    const cancelCallCount = actor.calls.length;

    expect(service.status(actor)).toBe('needs_review');
    await service.resolve(actor);
    expect(reviews).toHaveLength(1);
    expect(actor.calls).toHaveLength(cancelCallCount);
    expect(service.status(actor)).toBe('needs_review');

    await service.resolve(actor);
    expect(reviews).toHaveLength(2);
    expect(actor.flags[RESOLVER_MODULE_ID].spellResolution.status).toBe('hydrated');
    expect(service.isAlreadyApplied(actor)).toBe(true);
    expect(actor.managedActivities().filter((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)).toHaveLength(1);
    expect(actor.items.filter((item) => item.type === 'spell'
      && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)).toHaveLength(1);
    expect(notifications.some(([level]) => level === 'error')).toBe(false);
  });
});

class TransactionHookBus {
  private nextId = 1;
  private readonly callbacks = new Map<string, Map<number, (...args: any[]) => void>>();
  on(name: string, callback: (...args: any[]) => void): number {
    const id = this.nextId++;
    const entries = this.callbacks.get(name) ?? new Map();
    entries.set(id, callback);
    this.callbacks.set(name, entries);
    return id;
  }
  off(name: string, id: number): void { this.callbacks.get(name)?.delete(id); }
  emit(name: string, ...args: any[]): void {
    for (const callback of this.callbacks.get(name)?.values() ?? []) callback(...args);
  }
}

// Foundry's ObjectField applies ordinary object updates recursively. Only the
// public ForcedReplacement operation replaces the exact target subtree.
function mergeActorFlagValue(current: any, patch: any): any {
  if (patch && typeof patch === 'object' && Object.hasOwn(patch, '__forcedReplacement')) {
    return structuredClone(patch.__forcedReplacement);
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return structuredClone(patch);
  const result = current && typeof current === 'object' && !Array.isArray(current) ? structuredClone(current) : {};
  for (const [key, value] of Object.entries(patch)) result[key] = mergeActorFlagValue(result[key], value);
  return result;
}

class TransactionActor {
  readonly id = 'ActorTransact001';
  get uuid() { return `Actor.${this.id}`; }
  readonly documentName = 'Actor';
  readonly type = 'npc';
  readonly calls: unknown[][] = [];
  flags: Record<string, any> = { [RESOLVER_MODULE_ID]: { spellManifest: manifest(), spellResolution: { status: 'pending', manifestHash: readyPlan().manifestHash } }, foreign: { keep: { nested: true } } };
  items: any[];
  sourcedItems = new Map<string, any[]>();
  maxConcurrentMutations = 0;
  failSnapshotRecreate = false;
  stripNextSpellOwnership = false;
  lifecycleHooks?: TransactionHookBus;
  nativeCreateDelayMs = 0;
  withDurationEffect = false;
  withUsageChat = false;
  withConditionalDamage = false;
  chatWriteFailure?:'before'|'after';
  durationWriteFailure?: 'before' | 'after';
  snapshotEffectMutation?: (item:any) => void;
  snapshotOriginWriteRejected = false;
  private activeMutations = 0;
  private nativeCacheSequence = 0;
  constructor(private readonly autoCache = false, private readonly nativeEffectLayout: 'legacy' | 'system' = 'legacy') {
    const feature: any = {
      id: 'FeatureTransact1', _id: 'FeatureTransact1', type: 'feat', parent: this, actor: this, name: 'Same Display Name',
      flags: {
        fvttJsonGenerator: { spellcastingFeatureKey: 'innate-feature' },
        [RESOLVER_MODULE_ID]: { featureItemKey: 'innate-feature', groupId: 'innate-cha' },
        foreign: { feature: true },
      },
      system: { identifier: 'innate-feature', activities: new Map(), untouched: { deep: true } },
    };
    feature.system.parent = feature;
    feature.deleteActivity = async (id: string) => {
      this.calls.push(['deleteActivity', id]);
      const activity = feature.system.activities.get(id);
      const cache = activity && this.items.find((item) => item.flags?.dnd5e?.cachedFor === activity.relativeUUID);
      feature.system.activities.delete(id);
      if (cache) {
        this.items = this.items.filter((item) => item !== cache);
        this.refreshSourcedItems();
        this.lifecycleHooks?.emit('deleteItem', cache, {}, 'CurrentUser00001');
      }
      return feature;
    };
    this.items = [feature, {
      id: 'ForeignItem00001', _id: 'ForeignItem00001', type: 'feat', name: 'Same Display Name', parent: this, actor: this,
      flags: { foreign: { keep: true } }, system: { activities: new Map([['ForeignAct000001', { id: 'ForeignAct000001', type: 'cast', keep: true }]]) },
      effects: [{ _id: 'ForeignEffect001', keep: true }],
    }];
  }

  async updateEmbeddedDocuments(name: string, updates: any[]) {
    await this.withMutation(async () => {
      this.calls.push(['updateEmbeddedDocuments', name, structuredClone(updates)]);
      for (const update of updates) {
        const item = this.items.find((entry) => entry.id === update._id);
        if (!item) throw new Error(`Missing item ${update._id}`);
        const activityEntry = Object.entries(update).find(([key]) => key.startsWith('system.activities.'));
        if(item?.type==='spell'&&activityEntry){
          if(this.chatWriteFailure==='before'){this.chatWriteFailure=undefined;throw Error('Source chat write rejected before commit');}
          for(const[path,value]of Object.entries(update))if(path.startsWith('system.activities.')){
            const keys=path.slice('system.activities.'.length).split('.'),id=keys.shift()!;
            if(!keys.length){item.system.activities[id]=structuredClone(value);continue;}
            let child=item.system.activities[id];for(const key of keys.slice(0,-1)){child[key]??={};child=child[key];}child[keys.at(-1)!]=structuredClone(value);
          }
          if(this.chatWriteFailure==='after'){this.chatWriteFailure=undefined;throw Error('Source chat write rejected after commit');}
          continue;
        }
        if (activityEntry) {
          const [path, source] = activityEntry;
          const activityPath = path.slice('system.activities.'.length).split('.');
          const id = activityPath.shift()!;
          if (activityPath.join('.') === `flags.${RESOLVER_MODULE_ID}.generatedContentHash`) {
            item.system.activities.get(id).flags[RESOLVER_MODULE_ID].generatedContentHash = source;
            this.mutateCachedEnchantment(item.system.activities.get(id));
            continue;
          }
          if(activityPath.join('.')===`flags.${RESOLVER_MODULE_ID}.protected`){item.system.activities.get(id).flags[RESOLVER_MODULE_ID].protected=source;continue;}
          if (activityPath.length) throw new Error(`Unsupported fake Activity update path: ${path}`);
          const previousActivity = item.system.activities.get(id);
          const previousCache = previousActivity
            ? this.items.find((entry) => entry.flags?.dnd5e?.cachedFor === previousActivity.relativeUUID)
            : undefined;
          if (this.autoCache && previousCache && previousActivity.spell.uuid !== (source as any).spell.uuid) {
            this.items = this.items.filter((entry) => entry !== previousCache);
            this.calls.push(['nativeDeleteCachedSpell', previousCache.id]);
            this.refreshSourcedItems();
            this.lifecycleHooks?.emit('deleteItem', previousCache, {}, 'CurrentUser00001');
          }
          const activity = this.preparedActivity(item, source as any);
          item.system.activities.set(id, activity);
          if (this.autoCache && !this.items.some((entry) => entry.flags?.dnd5e?.cachedFor === activity.relativeUUID)) {
            const native = await activity.getCachedSpellData();
            native._id = this.nextNativeCacheId();
            native.system.preparedSpellDefault = 'dnd5e-normalized';
            const install = () => {
              const document = { ...native, id: native._id, parent: this, actor: this };
              this.items.push(document);
              this.refreshSourcedItems();
              this.lifecycleHooks?.emit('createItem', document, {}, 'CurrentUser00001');
            };
            if (this.nativeCreateDelayMs > 0) setTimeout(install, this.nativeCreateDelayMs);
            else install();
          }
          this.mutateCachedEnchantment(activity);
        }
        const resolverFlags = update[`flags.${RESOLVER_MODULE_ID}`];
        if (resolverFlags) {
          if (this.stripNextSpellOwnership && item.type === 'spell') this.stripNextSpellOwnership = false;
          else item.flags[RESOLVER_MODULE_ID] = structuredClone(resolverFlags);
        }
        const preparedHash = update[`flags.${RESOLVER_MODULE_ID}.generatedContentHash`];
        if (preparedHash) item.flags[RESOLVER_MODULE_ID].generatedContentHash = preparedHash;
        if(update[`flags.${RESOLVER_MODULE_ID}.protected`]===true)item.flags[RESOLVER_MODULE_ID].protected=true;
        const fullItemKeys = Object.keys(update).filter((key) => key !== '_id'
          && !key.startsWith('system.activities.') && !key.startsWith('flags.'));
        if (fullItemKeys.length) {
          for (const [key, value] of Object.entries(update)) {
            if (key === '_id' || key.startsWith('system.activities.') || key.startsWith('flags.')) continue;
            item[key] = structuredClone(value);
          }
          if (Object.prototype.hasOwnProperty.call(update, 'flags')) item.flags = structuredClone(update.flags);
          this.refreshSourcedItems();
        }
      }
    });
    return updates;
  }

  async createEmbeddedDocuments(name: string, sources: any[], operation: any = {}) {
    await this.withMutation(async () => {
      this.calls.push(['createEmbeddedDocuments', name, sources.map((source) => source._stats?.compendiumSource), operation]);
      if (this.failSnapshotRecreate && operation.keepId === true) throw new Error('snapshot recreate failed');
      for (const source of sources) {
        const item = {
        ...structuredClone(source),
        id: source._id,
        parent: this,
        actor: this,
        ...(source.type === 'spell' ? {
          system: { ...structuredClone(source.system), preparedSpellDefault: 'dnd5e-normalized' },
        } : {}),
        };
        this.snapshotEffectMutation?.(item);
        this.items.push(item);
      }
      this.refreshSourcedItems();
    });
    return sources.map((source) => this.items.find((item) => item.id === source._id));
  }

  async deleteEmbeddedDocuments(name: string, ids: string[]) {
    await this.withMutation(async () => {
      this.calls.push(['deleteEmbeddedDocuments', name, [...ids]]);
      const deleted = this.items.filter((item) => ids.includes(item.id));
      this.items = this.items.filter((item) => !ids.includes(item.id));
      this.refreshSourcedItems();
      for (const item of deleted) this.lifecycleHooks?.emit('deleteItem', item, {}, 'CurrentUser00001');
    });
    return [];
  }

  async update(change: Record<string, any>) {
    await this.withMutation(async () => {
      this.calls.push(['update', structuredClone(change)]);
      const resolution = change[`flags.${RESOLVER_MODULE_ID}.spellResolution`];
      if (resolution !== undefined) this.flags[RESOLVER_MODULE_ID].spellResolution = mergeActorFlagValue(this.flags[RESOLVER_MODULE_ID].spellResolution, resolution);
      const resolver = change[`flags.${RESOLVER_MODULE_ID}`];
      if (resolver !== undefined) this.flags[RESOLVER_MODULE_ID] = mergeActorFlagValue(this.flags[RESOLVER_MODULE_ID], resolver);
    });
    return this;
  }

  managedActivities() {
    return [...this.items[0]!.system.activities.values()].filter((activity: any) => activity.flags?.[RESOLVER_MODULE_ID]?.managed);
  }

  installStaleManagedPair() {
    const feature = this.items[0]!;
    const identity = {
      manifestId: 'transaction-manifest', groupId: 'innate-cha', refId: 'light-ref', featureId: feature.id,
      logicalRefKey: logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref'),
      selectedUuid: 'Compendium.dnd5e.spells24.Item.aaaaaaaaaaaaaaaa', activityId: 'StaleActivity001',
    };
    const activity = this.preparedActivity(feature, {
      _id: identity.activityId, type: 'cast', name: 'Stale', spell: { uuid: identity.selectedUuid },
      flags: { [RESOLVER_MODULE_ID]: { managed: true, documentType: 'activity', ...identity } },
      consumption: { spellSlot: false, targets: [] },
    });
    activity.flags[RESOLVER_MODULE_ID].generatedContentHash = hashManagedProjection(activitySource(activity));
    feature.system.activities.set(activity.id, activity);
    const cache = {
      _id: 'StaleCache000001', id: 'StaleCache000001', type: 'spell', parent: this, actor: this,
      system: { preparedSpellDefault: 'dnd5e-normalized' }, effects: [], _stats: { compendiumSource: identity.selectedUuid },
      flags: { dnd5e: { cachedFor: activity.relativeUUID }, [RESOLVER_MODULE_ID]: { managed: true, documentType: 'spell', ...identity } },
    } as any;
    cache.flags[RESOLVER_MODULE_ID].generatedContentHash = hashManagedProjection(activitySource(cache));
    this.items.push(cache);
    this.refreshSourcedItems();
  }

  fullProjection() {
    return structuredClone({
      resolver: this.flags[RESOLVER_MODULE_ID],
      activities: this.managedActivities().map((activity: any) => activitySource(activity)).sort(sortById),
      spells: this.items.filter((item) => item.type === 'spell' && item.flags?.[RESOLVER_MODULE_ID]?.managed).map(activitySource).sort(sortById),
    });
  }

  foreignProjection() {
    return structuredClone({
      actorFlags: this.flags.foreign,
      featureForeign: this.items[0]!.flags.foreign,
      featureUntouched: this.items[0]!.system.untouched,
      foreignItems: this.items.filter((item) => !item.flags?.[RESOLVER_MODULE_ID]?.managed && item.id !== 'FeatureTransact1').map(activitySource),
    });
  }

  rawItemProjection() {
    return this.items.map(activitySource).sort(sortById);
  }

  private preparedActivity(feature: any, source: any) {
    const actor = this;
    const activity: any = {
      ...structuredClone(source),
      activation: source.activation ?? { type: '', value: null, condition: '' },
      id: source._id, parent: feature.system,
      relativeUUID: `.Item.${feature.id}.Activity.${source._id}`,
      async getCachedSpellData() {
        return {
          _id: generatedResolverDocumentId({
            manifestId: source.flags[RESOLVER_MODULE_ID].manifestId,
            groupId: source.flags[RESOLVER_MODULE_ID].groupId,
            refId: source.flags[RESOLVER_MODULE_ID].refId,
            featureId: feature.id,
          }, 'spell'),
          name: source.name, type: 'spell', system: { sourceItem: 'feat:innate-feature', uses: { spent: 0 }, ...(actor.withConditionalDamage&&source.flags[RESOLVER_MODULE_ID].refId==='light-ref'?conditionalSpellFixture().system:{}), ...(actor.withUsageChat?{description:{value:'Official spell body',chat:''},activities:{SaveActivity0001:{type:'save',description:{chatFlavor:'Original native subtitle'}}}}:{}), ...(actor.withDurationEffect ? {
            identifier: 'disguise-self', duration: { value: '1', units: 'hour' }, activities: { utility: { type: 'utility', effects: [{ _id: 'SrIb7dbaZs5F4zi9' }] } },
          } : {}) },
          effects: [...(actor.withConditionalDamage&&source.flags[RESOLVER_MODULE_ID].refId==='light-ref'?conditionalSpellFixture().effects:[]),...(actor.withDurationEffect ? [{ _id: 'SrIb7dbaZs5F4zi9', type: 'base', transfer: false, duration: { value: 3600, units: 'seconds' } }] : []), actor.nativeEffectLayout === 'system'
            ? { _id: 'dnd5espellchang', type: 'enchantment', system: { origin: { activity: activity.relativeUUID }, changes: [] }, transfer: true }
            : { _id: 'dnd5espellchang', type: 'enchantment', origin: activity.relativeUUID, changes: [] }],
          flags: { dnd5e: { cachedFor: activity.relativeUUID } }, _stats: { compendiumSource: source.spell.uuid },
        };
      },
    };
    Object.defineProperties(activity, {
      constructor: { value: { ENCHANTMENT_ID: 'dnd5espellchang' } },
      item: { get: () => activity.parent?.parent },
      actor: { get: () => activity.item?.parent ?? null },
    });
    Object.defineProperty(activity, 'cachedSpell', { get: () => actor.items.find((item) => item.flags?.dnd5e?.cachedFor === activity.relativeUUID) });
    return activity;
  }

  private refreshSourcedItems() {
    for (const item of this.items) if (item.type === 'spell') exposeFakeEffectApi(this, item);
    const map = new Map<string, any[]>();
    for (const item of this.items) {
      const uuid = item._stats?.compendiumSource;
      if (!uuid) continue;
      map.set(uuid, [...(map.get(uuid) ?? []), item]);
    }
    this.sourcedItems = map;
  }

  private mutateCachedEnchantment(activity: any) {
    const cache = this.items.find((item) => item.flags?.dnd5e?.cachedFor === activity.relativeUUID);
    const enchantment = cache?.effects?.find((effect: any) => effect._id === 'dnd5espellchang');
    if (!cache || !enchantment) return;
    if (this.nativeEffectLayout === 'system') enchantment.system.changes = [];
    else enchantment.changes = [];
    const changes = this.nativeEffectLayout === 'system' ? enchantment.system.changes : enchantment.changes;
    this.calls.push(['nativeRefreshCachedEnchantment', cache.id]);
    this.lifecycleHooks?.emit('updateActiveEffect', {
      ...structuredClone(enchantment), id: enchantment._id, parent: cache,
    }, this.nativeEffectLayout === 'system'
      ? { system: { changes: structuredClone(changes) } }
      : { changes: structuredClone(changes) }, {}, 'CurrentUser00001');
  }

  private nextNativeCacheId() {
    this.nativeCacheSequence += 1;
    return `NativeCache${String(this.nativeCacheSequence).padStart(5, '0')}`;
  }

  private async withMutation(operation: () => void | Promise<void>) {
    this.activeMutations++;
    this.maxConcurrentMutations = Math.max(this.maxConcurrentMutations, this.activeMutations);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1));
      await operation();
    } finally {
      this.activeMutations--;
    }
  }
}

function activitySource(value: any): any {
  const source: Record<string, any> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (['parent', 'actor', 'item', 'relativeUUID', 'id'].includes(key) || typeof entry === 'function') continue;
    if (key === 'system' && entry && typeof entry === 'object' && (entry as any).activities instanceof Map) {
      const system = { ...(entry as any) };
      delete system.parent;
      system.activities = Object.fromEntries([...(entry as any).activities.entries()]
        .map(([id, activity]: [string, any]) => [id, activitySource(activity)]));
      source[key] = structuredClone(system);
    } else source[key] = structuredClone(entry);
  }
  return source;
}

function keptCacheProjection(cache: any): any {
  const source = activitySource(cache);
  const resolver = source.flags?.[RESOLVER_MODULE_ID];
  if (resolver) {
    delete resolver.generatedContentHash;
    delete resolver.transactionId;
    delete resolver.protected;
  }
  return source;
}

function sortById(left: any, right: any) { return String(left._id).localeCompare(String(right._id), 'en'); }

function canonicalPlan(plan: SpellHydrationPlan): string {
  const { planHash: _ignored, ...withoutHash } = plan;
  const canonicalize = (value: any): any => Array.isArray(value)
    ? value.map(canonicalize)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
      : value;
  return JSON.stringify(canonicalize(withoutHash));
}

expect(hashManagedProjection({ uses: { spent: 0, max: '1' } }))
  .toBe(hashManagedProjection({ uses: { spent: 1, max: '1' } }));


function exposeFakeEffectApi(actor: any, item: any) {
  Object.defineProperty(item, 'updateEmbeddedDocuments', { configurable: true, value: async (type: string, updates: any[]) => {
    if (type !== 'ActiveEffect') throw Error('Expected targeted ActiveEffect update');
    if (updates.every(update => Object.keys(update).sort().join(',') === '_id,origin')) {
      actor.calls.push(['snapshotOriginUpdate',item.id,structuredClone(updates)]);
      if (actor.snapshotOriginWriteRejected) throw Error('Snapshot origin public write rejected');
      for (const update of updates) item.effects.find((effect:any) => effect._id === update._id).origin = update.origin;
      return updates;
    }
    actor.calls.push(['targetedEffectUpdate', item.id, structuredClone(updates)]);
    if (actor.durationWriteFailure === 'before') { actor.durationWriteFailure = undefined; throw Error('duration write rejected before commit'); }
    for (const update of updates) {
      const effect = item.effects.find((entry: any) => entry._id === update._id);
      if (!effect || Object.keys(update).some(key => !['_id', 'duration.value'].includes(key))) throw Error('Unexpected targeted effect update');
      effect.duration.value = update['duration.value'];
    }
    if (actor.durationWriteFailure === 'after') { actor.durationWriteFailure = undefined; throw Error('duration write rejected after commit'); }
    return updates;
  } });
}

test('source reuse bound to another document is rejected before any Actor write',async()=>{
 const value=manifest(),parent=value.spellcastingGroups[0]!,ref=structuredClone(parent.spellRefs[0]!);
 ref.refId='legendary-light-ref';ref.reuseOf={groupId:parent.groupId,refId:parent.spellRefs[0]!.refId};
 ref.evidence=[{start:50,end:55,quote:'Light'}];
 value.spellcastingGroups.push({...structuredClone(parent),groupId:'legendary-reuse',featureItemKey:'legendary-feature',spellRefs:[ref]});
 const actor=new TransactionActor();actor.flags[RESOLVER_MODULE_ID].spellManifest=structuredClone(value);
 const plan=readyPlan(actor,undefined,undefined,value);
 plan.selections.find(s=>s.refId==='legendary-light-ref')!.uuid='Compendium.dnd5e.spells24.Item.cccccccccccccccc';
 plan.planHash=sha256(canonicalPlan(plan));
 await expect(executeHydrationTransaction({actor,manifest:value,plan})).rejects.toThrow('Referenced spell bindings disagree');
 expect(actor.calls).toHaveLength(0);
});

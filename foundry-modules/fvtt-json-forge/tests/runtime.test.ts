import { beforeAll, describe, expect, test } from 'bun:test';
import { buildForgeActorRequest, convertFinalActorSource, FORGE_NATIVE_606_TARGET, isForgeRuntimeTargetSupported } from '@fvtt-json-generator/forge-browser-runtime';
import { projectNativeDocument } from '@fvtt-json-generator/workflows/native-projection';
import { createEncounterAutomationLifecycle } from '../src/encounterAutomationLifecycle';
import { assertExactRuntime } from '../src/runtime';
import { nativeProjectionForGame } from '../src/nativeProjection';
import { isForgeAutomationTargetCompatible } from '../src/mirror-core-compatibility';
import { projectionForRuntime } from '../../../packages/forge-browser-runtime/src/nativeTarget';
import { installEncounterDamageBridge, installPassiveActivityLockGuard } from '../src/encounterAutomationRuntime';
import { actorRulePresentation } from '../../../packages/forge-browser-runtime/src/actorRulePresentationContext';
import { assertRulePresentationPlan } from '@fvtt-json-generator/generation/rule-presentation';
import { prepareForgeActorForNativeProjection } from '../../../packages/forge-browser-runtime/src/artifact';
import { analyzePlaintextActorSource } from '@fvtt-json-generator/forge-browser-runtime/plaintext';
import { decodeForgeActorResponse, hashArtifact, type ForgeActorResponse, type JsonObject } from '@fvtt-json-generator/forge-gateway-protocol';
import { splitCollection } from '@fvtt-json-generator/ingest-plaintext/plaintext-core';
import {
  createAcceptedForgeActor,
  createReviewedForgeActorCandidate,
  prepareFoundryImportArtifact,
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

describe('native 606 projection contract', () => {
  test('runtime admission uses native6 major ranges and refuses retired runtime pairs', () => {
    for (const [core, system] of [['14.370','6.0.6'],['14.368','6.0.6'],['14.369','6.0.6+local.3'],['14.370','6.0.7'],['14.999','6.1.0']])
      expect(() => assertExactRuntime({ version:core, system:{id:'dnd5e',version:system} })).not.toThrow();
    for (const [core, system] of [['14.364','5.3.3'],['14.368','5.3.3'],['14.367','6.0.6'],['14.370','6.0.5'],['15.0','6.0.6'],['14.369','7.0.0']])
      expect(isForgeRuntimeTargetSupported(core,system)).toBe(false);
  });

  test('runtime admission retains native construction and exact automation bindings on later releases', () => {
    let constructions = 0;
    class NativeDocument {
      constructor(private source: JsonObject, options: { strict: boolean }) {
        expect(options.strict).toBe(true);
        constructions += 1;
      }
      validate(options: { strict: boolean }) { expect(options.strict).toBe(true); return true; }
      toObject() { return this.source; }
    }
    const game = { version: '14.370', system: { id: 'dnd5e', version: '6.1.0' }, actors: { documentClass: NativeDocument } };
    const projection = nativeProjectionForGame(game);
    expect(projection).toBeDefined();
    expect(projection!.runtime).toEqual({coreVersion:'14.370',systemId:'dnd5e',systemVersion:'6.1.0'});
    expect(projectionForRuntime(game.version, game.system.version, projection)).toBe(projection);
    expect(projectionForRuntime('14.368', '5.3.3', projection)).toBeUndefined();
    const projected = projection!.project('Actor', { name: 'Native constructor fixture', items: [] });
    expect(projected._stats).toEqual(FORGE_NATIVE_606_TARGET.stats);
    expect(constructions).toBe(1);
    expect(() => prepareFoundryImportArtifact({ name: 'Old 533 artifact' }, game)).toThrow('native schema');
    const target = { foundry: game.version, system: 'dnd5e', systemVersion: game.system.version, effectProfile: 'core' };
    expect(isForgeAutomationTargetCompatible(game, target)).toBeTrue();
    expect(isForgeAutomationTargetCompatible(game, { ...target, foundry: '14.369', systemVersion: '6.0.6' })).toBeTrue();
    expect(isForgeAutomationTargetCompatible(game, { ...target, foundry: '14.369+local.1', systemVersion: '6.0.6+local.1' })).toBeTrue();
    expect(isForgeAutomationTargetCompatible(game, { ...target, foundry: '14.371' })).toBeTrue();
    expect(isForgeAutomationTargetCompatible(game, { ...target, systemVersion: '6.2.0' })).toBeTrue();
    expect(isForgeAutomationTargetCompatible(game, { ...target, foundry: '15.0' })).toBeFalse();
    expect(isForgeAutomationTargetCompatible(game, { ...target, systemVersion: '7.0.0' })).toBeFalse();
    expect(isForgeAutomationTargetCompatible(game, { ...target, system: 'pathfinder2e' })).toBeFalse();
    expect(isForgeAutomationTargetCompatible(game, { ...target, effectProfile: 'midi' })).toBeFalse();
    expect(isForgeAutomationTargetCompatible(game, undefined)).toBeFalse();
  });

  test('runtime admission creates a formally projected Actor on a later native6 runtime', async () => {
    for (const requestRuntime of [{fvttVersion:'14.370',systemVersion:'6.1.0'},{fvttVersion:'14.369',systemVersion:'6.0.6'}]) {
    const collection = new FakeActorCollection();
    const game = { ...supportedGame(collection), version: '14.370', system: { id: 'dnd5e', version: '6.1.0' } };
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md').text();
    const request = buildForgeActorRequest({ content: source, displayName: 'Nightgaunt', requestId: 'future-native-actor', ...requestRuntime });
    const response: any = await convertFinalActorSource(request, { nativeProjection: {
      target: FORGE_NATIVE_606_TARGET,
      runtime: { coreVersion: game.version, systemId: 'dnd5e', systemVersion: game.system.version },
      project(_kind, input) {
        for (const effect of input.items.flatMap((item: any) => item.effects ?? [])) {
          expect(effect.duration).toHaveProperty('value');
        }
        return input;
      },
    } });
    expect(response.result.target.fvttRuntimeVersion).toBe(game.version);
    expect(response.result.target.systemVersionObserved).toBe(game.system.version);
    expect(response.result.artifact._stats).toMatchObject(FORGE_NATIVE_606_TARGET.stats);
    const result = await createAcceptedForgeActor({ game, response });
    expect(result.status).toBe('created');
    expect(collection.contents).toHaveLength(1);
    expect((result.actor.toObject() as any).flags[MODULE_ID].sourceId).toBe(request.source.sourceId);
    expect((result.actor.toObject() as any)._stats).toMatchObject(FORGE_NATIVE_606_TARGET.stats);
    }
  });

  test('offline generation and failed receiver normalization retain the complete native6 candidate', async () => {
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md').text();
    const request=buildForgeActorRequest({content:source,displayName:'Nightgaunt',requestId:'native606-missing',fvttVersion:'14.369',systemVersion:'6.0.6'});
    for (const nativeProjection of [undefined,{target:FORGE_NATIVE_606_TARGET,project(){throw new Error('Native validation rejected candidate');}}]) {
      const response:any=await convertFinalActorSource(request,{nativeProjection});
      expect(response.result.artifact.items.length).toBeGreaterThan(0);
      expect(response.result.target.systemVersionObserved).toBe('6.0.6');
      expect(response.result.artifact._stats.systemVersion).toBe('6.0.6');
      expect(response.result.diagnostics.some((entry:any)=>entry.code.startsWith('NATIVE_PROJECTION'))).toBe(Boolean(nativeProjection));
      expect(()=>prepareFoundryImportArtifact(response.result.artifact,{version:'14.369',system:{id:'dnd5e',version:'6.0.6'}})).not.toThrow();
    }
  });

  test('preserves stable member identities, source and finite uses without mutating caller input',async()=>{
    const source:any={name:'Port contract fixture',type:'npc',system:{source:{rules:'2024'}},items:[{name:'Limited feature',type:'feat',system:{uses:{max:'3',spent:1,recovery:[{period:'day',type:'recoverAll'}]},activities:{AAAAAAAAAAAAAAAA:{_id:'AAAAAAAAAAAAAAAA',type:'utility',uses:{max:'2',spent:0,recovery:[]},consumption:{targets:[]}}}},effects:[{name:'Owned effect',disabled:true,duration:{value:60,units:'seconds',expiry:'turnStart',expired:false},changes:[{key:'system.bonuses.abilities.save',mode:2,value:'1',phase:'final'}]}]}],effects:[]};
    const original=structuredClone(source);
    const port={target:FORGE_NATIVE_606_TARGET,project:(_kind:any,value:any)=>value};
    const first=await projectNativeDocument(port,'Actor',source),second=await projectNativeDocument(port,'Actor',source);
    expect(first).toEqual(second);expect(source).toEqual(original);
    const reordered={...source,items:source.items.map(({name,type,...rest}:any)=>({...rest,type,name}))};
    expect(await projectNativeDocument(port,'Actor',reordered)).toEqual(first);
    expect(first.items[0]._id).toMatch(/^[a-f0-9]{16}$/u);
    expect(first.items[0].effects[0]._id).toMatch(/^[a-f0-9]{16}$/u);
    expect(first.items[0].system.uses).toEqual(source.items[0].system.uses);
    for (const breakProjection of [
      (value:any)=>{value.items=[];},
      (value:any)=>{value.items[0].system.activities={};},
      (value:any)=>{value.items[0].effects=[];},
      (value:any)=>{value.items[0].effects[0].changes[0].phase='initial';},
      (value:any)=>{value.items[0].system.uses.max='';},
      (value:any)=>{value.system.source.rules='2014';},
    ]) await expect(projectNativeDocument({target:FORGE_NATIVE_606_TARGET,project(_kind,value){breakProjection(value);return value;}},'Actor',source)).rejects.toThrow('Native projection');
  });

  test('native migration guard accepts exact schema representations and rejects changed mechanics',async()=>{
    const cases:any[]=[
      {kind:'Actor',before:{name:'Flat fixture',type:'npc',system:{abilities:{str:{value:14,bonuses:{save:'2'}}},attributes:{ac:{calc:'flat',flat:12},movement:{walk:30,units:'ft'}}}},
        after:{abilities:{str:{value:14,save:{roll:{bonus:'2'}}}},attributes:{ac:{override:12},movement:{speeds:{walk:'30'},units:'ft'}}}},
      {kind:'Actor',before:{name:'Formula fixture',type:'npc',system:{attributes:{ac:{calc:'custom',formula:'10 + @abilities.dex.mod'}}}},
        after:{attributes:{ac:{formulas:[{formula:'10 + @abilities.dex.mod'}]}}}},
      {kind:'Item',before:{name:'Equipment fixture',type:'equipment',system:{armor:{value:14,magicalBonus:3},rarity:'veryRare',uses:{max:'@prof',spent:0,recovery:[]}}},
        after:{armor:{value:14,magicalBonus:'3'},rarities:['veryRare'],uses:{max:'@prof',spent:0,recovery:[]}}},
    ];
    for(const entry of cases){
      const result=await projectNativeDocument({target:FORGE_NATIVE_606_TARGET,project(_kind,input){input.system=structuredClone(entry.after);return input;}},entry.kind,entry.before);
      expect(result.system).toEqual(entry.after);
    }
    await expect(projectNativeDocument({target:FORGE_NATIVE_606_TARGET,project(_kind,input){input.system=structuredClone(cases[2].after);input.system.armor.magicalBonus='@prof';return input;}},'Item',cases[2].before)).rejects.toThrow('armor/magicalBonus');
  });

  test('native606: legacy permanent, timed and combat durations retain their canonical duration and start',async()=>{
    const cases=[
      {before:{startTime:null,seconds:null,combat:null,rounds:null,turns:null,startRound:null,startTurn:null},duration:{value:null,units:'seconds',expiry:null,expired:false},start:null},
      {before:{startTime:600,seconds:60,combat:null,startRound:2,startTurn:1},duration:{value:60,units:'seconds',expiry:'turnStart',expired:false},start:{combat:null,time:600,round:2,turn:1}},
      {before:{startTime:null,rounds:2,turns:null},duration:{value:2,units:'rounds',expiry:'turnStart',expired:false},start:null},
      {before:{startTime:null,rounds:2,turns:1},duration:{value:1,units:'turns',expiry:'turnStart',expired:false},start:null},
      {before:{seconds:60,value:5,units:'minutes',expiry:'turnEnd'},duration:{value:5,units:'minutes',expiry:'turnEnd',expired:false},start:null},
    ];
    for(const entry of cases){
      const source={name:'Duration contract',type:'npc',effects:[{name:'Effect',duration:entry.before,changes:[]}]};
      const port={target:FORGE_NATIVE_606_TARGET,project(_kind:any,input:any){input.effects[0].duration=entry.duration;input.effects[0].start=entry.start;return input;}};
      const result=await projectNativeDocument(port,'Actor',source);expect(result.effects[0].duration).toEqual(entry.duration);
      await expect(projectNativeDocument({target:FORGE_NATIVE_606_TARGET,project(_kind,input){input.effects[0].duration={...entry.duration,value:999};input.effects[0].start=entry.start;return input;}},'Actor',source)).rejects.toThrow('/duration/value');
    }
  });

  test('native606: source-preserving preclean keeps natural reach, thrown long range and inactive template defaults',async()=>{
    const activity=(range:any)=>({_id:'AAAAAAAAAAAAAAAA',type:'attack',range,target:{template:{type:'',count:'',size:'',width:'',height:'',units:''}}});
    const source:any={name:'Range contract',type:'npc',items:[
      {name:'Natural',type:'feat',system:{activities:{AAAAAAAAAAAAAAAA:activity({reach:10,override:false,units:'ft'})}}},
      {name:'Thrown',type:'weapon',system:{range:{value:30,long:null,units:'ft'},activities:{AAAAAAAAAAAAAAAA:activity({value:30,long:120,override:false,units:'ft'})}}},
      {name:'Melee',type:'weapon',system:{range:{value:5,reach:5,long:null,units:'ft'},activities:{AAAAAAAAAAAAAAAA:activity({value:null,reach:5,override:false,units:'ft'})}}},
    ]};
    const input=prepareForgeActorForNativeProjection(source);
    expect((input.items as any[])[0].system.activities.AAAAAAAAAAAAAAAA.range).toMatchObject({override:true,value:10});
    expect((input.items as any[])[1].system.range.long).toBe(120);
    expect((input.items as any[])[2].system.activities.AAAAAAAAAAAAAAAA.range).not.toHaveProperty('value');
    const clean=(_kind:any,value:any)=>{for(const item of value.items)for(const activity of Object.values(item.system.activities) as any[]){
      expect(activity.target.template).not.toHaveProperty('units');activity.target.template.units='ft';
      delete activity.range.reach;delete activity.range.long;if(activity.range.value!==undefined)activity.range.value=String(activity.range.value);
    }return value;};
    const result=await projectNativeDocument({target:FORGE_NATIVE_606_TARGET,project:clean},'Actor',input);
    expect(result.items[0].system.activities.AAAAAAAAAAAAAAAA.range.value).toBe('10');
    expect(result.items[1].system.range.long).toBe(120);
    expect(result.items[2].system.range.reach).toBe(5);
    expect(source.items[0].system.activities.AAAAAAAAAAAAAAAA.range.reach).toBe(10);
  });

  test('native606: native target FormulaFields keep literal count and dimensions and reject changed size',async()=>{
    const source:any={name:'Area contract',type:'feat',system:{activities:{AAAAAAAAAAAAAAAA:{_id:'AAAAAAAAAAAAAAAA',type:'save',target:{template:{count:1,type:'cone',size:30,width:5,height:10,units:'ft'},affects:{count:2}}}}}};
    const target={template:{count:'1',type:'cone',size:'30',width:'5',height:'10',units:'ft'},affects:{count:'2'}};
    const result=await projectNativeDocument({target:FORGE_NATIVE_606_TARGET,project(_kind,input){input.system.activities.AAAAAAAAAAAAAAAA.target=structuredClone(target);return input;}},'Item',source);
    expect(result.system.activities.AAAAAAAAAAAAAAAA.target).toEqual(target);
    await expect(projectNativeDocument({target:FORGE_NATIVE_606_TARGET,project(_kind,input){input.system.activities.AAAAAAAAAAAAAAAA.target=structuredClone(target);input.system.activities.AAAAAAAAAAAAAAAA.target.template.size='31';return input;}},'Item',source)).rejects.toThrow('/target/template/size');
  });

  test('saved controllers refuse a different runtime target before installing or persisting', async()=>{
    for(const {version,systemVersion,target} of [
      {version:'14.369',systemVersion:'6.0.6',target:undefined},
      {version:'14.369',systemVersion:'6.0.6',target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'}},
      {version:'14.368',systemVersion:'5.3.3',target:{foundry:'14.369',system:'dnd5e',systemVersion:'6.0.6',effectProfile:'core'}},
    ]){
      let installed=0,written=0;
      const saved={version:1,enabled:true,context:{packageId:'old',...(target?{target}:{})},config:{version:1,rules:[],legendaryRecovery:[]}};
      const env:any={game:{version,system:{id:'dnd5e',version:systemVersion},user:{id:'gm',isGM:true},macros:{contents:[{flags:{[MODULE_ID]:{fixedAutomation:saved}},setFlag(){written++;}}]}},canvas:{ready:true},ui:{notifications:{warn(){}}}};
      const before=structuredClone(saved);
      const lifecycle=createEncounterAutomationLifecycle(env,async()=>{installed++;throw Error('must not install');});
      await lifecycle.resume();expect(installed).toBe(0);expect(written).toBe(0);expect(saved).toEqual(before);
    }
  });

  test('a caller port runs between formal generation and target verification', async()=>{
    const source=await Bun.file('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md').text();
    const request=buildForgeActorRequest({content:source,displayName:'Nightgaunt',requestId:'native606-port-contract',fvttVersion:'14.369',systemVersion:'6.0.6'});
    let calls=0;
    const response:any=await convertFinalActorSource(request,{captureRulePresentation:true,nativeProjection:{target:FORGE_NATIVE_606_TARGET,project(kind,input){
      calls++;expect(kind).toBe('Actor');expect(input.system.attributes.hp.max).toBe(136);expect(input.items.length).toBeGreaterThan(0);
      // Contract double: native schema behavior is accepted separately in Foundry.
      for(const effect of input.items.flatMap((item:any)=>item.effects??[])){
        expect(effect.duration).toHaveProperty('units');
        expect(effect.duration).toHaveProperty('value');
      }
      return input;
    }}});
    expect(calls).toBe(1);expect(response.result.target.systemVersionObserved).toBe('6.0.6');
    expect(response.result.artifact._stats.coreVersion).toBe('14.370');
    expect(response.result.sourceIdentity).toEqual({sourceId:request.source.sourceId,sourceHash:request.source.utf8Sha256});
    expect(response.result.diagnostics.filter((entry:any)=>entry.code==='NATIVE_PROJECTION_INCOMPLETE')).toEqual([]);
    const plan=actorRulePresentation(response);
    expect(plan).toBeDefined();expect(()=>assertRulePresentationPlan(plan,response.result.artifact,request.source.content)).not.toThrow();
  });

  test('native606: omitted empty uses maxima preserve senses through formal conversion and response decoding', async () => {
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md').text();
    const request = buildForgeActorRequest({ content: source, displayName: 'Nightgaunt', requestId: 'native606-optional-fields', fvttVersion: '14.369', systemVersion: '6.0.6' });
    let itemUses = 0, activityUses = 0;
    const response: any = await convertFinalActorSource(request, { nativeProjection: { target: FORGE_NATIVE_606_TARGET, project(_kind, input) {
      // Contract double for the exact UsesField and SensesField shapes read from native 6.0.6.


      for (const item of input.items) {
        expect(item.system.uses?.max ?? '').toBe('');
        item.system.uses = { spent: 0, recovery: [] }; itemUses++;
        for (const activity of Object.values(item.system.activities ?? {}) as any[]) {
          expect(activity.uses?.max ?? '').toBe('');
          activity.uses = { spent: 0, recovery: [] }; activityUses++;
        }
        for (const effect of item.effects ?? []) {
          expect(effect.duration).toHaveProperty('units');
          expect(effect.duration).toHaveProperty('value');
        }
      }
      return input;
    } } });
    expect(itemUses).toBe(6); expect(activityUses).toBe(6);
    expect(response.result.diagnostics).toEqual([]);
    expect(response.result.status).toBe('accepted');
    expect(response.result.actorVerification.actor.senses.units).toBe('ft');
    for (const item of response.result.artifact.items) {
      expect(item.system.uses).toEqual({ spent: 0, recovery: [] });
      for (const activity of Object.values(item.system.activities) as any[]) expect(activity.uses).toEqual({ spent: 0, recovery: [] });
    }
    const decoded = decodeForgeActorResponse(JSON.parse(JSON.stringify(response)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || !('result' in decoded.value)) throw new Error('Expected the formally converted native field shapes to decode.');
    expect(decoded.value.result.status).toBe('accepted');
    expect(decoded.value.result.actorVerification.actor.senses.units).toBe('ft');
  });

  test('new global hooks ignore old controller claims without altering them',()=>{
    const handlers=new Map<string,Function>();let writes=0;
    const oldState={packageId:'old',packageHash:'oldhash',disabledActivities:{rule:[{itemId:'item',activityId:'activity'}]},fixedNativeClaims:{stunned:[{groupId:'oldgroup',removeOnDamage:true}]}};
    const actor:any={id:'actor',uuid:'Actor.actor',flags:{[MODULE_ID]:{encounter:{version:1,kind:'Actor',packageId:'old',packageHash:'oldhash'},encounterAutomation:oldState}},effects:[],system:{attributes:{hp:{value:0,temp:0,tempmax:0}}},setFlag(){writes++;}};
    const env:any={game:{version:'14.369',system:{id:'dnd5e',version:'6.0.6'},user:{id:'gm',isGM:true}},Hooks:{on(name:string,fn:Function){handlers.set(name,fn);return name;}}};
    const before=structuredClone(actor.flags);
    installEncounterDamageBridge(env);installPassiveActivityLockGuard(env);
    const updates={'system.attributes.hp.value':0,'system.attributes.hp.temp':0,'system.attributes.hp.tempmax':0},options={};
    handlers.get('dnd5e.preApplyDamage')!(actor,3,updates,options);
    handlers.get('dnd5e.applyDamage')!(actor,3,options);
    expect(handlers.get('dnd5e.preUseActivity')!({id:'activity',item:{id:'item',actor}})).toBeUndefined();
    expect(Object.keys(updates)).toHaveLength(3);expect(writes).toBe(0);expect(actor.flags).toEqual(before);
  });

  test('native606: only an unlinked nonattack null default is equivalent to no other Activity',()=>{
    const artifact:any=structuredClone((acceptedResponse as any).result.artifact),item=artifact.items[0],text='Separate damage source.';
    artifact._stats={...artifact._stats,...FORGE_NATIVE_606_TARGET.stats};
    item.flags={fvttJsonGenerator:{manualRule:{mode:'native-with-gm',sourceText:text,sourceOperations:[{id:'damage'}]}}};
    item.system.activities={AAAAAAAAAAAAAAAA:{_id:'AAAAAAAAAAAAAAAA',type:'damage',damage:{parts:[]},
      midiProperties:{otherActivityCompatible:false,triggeredActivityId:'none'},
      flags:{fvttJsonGenerator:{sourceOperation:{id:'damage',role:'damage',damageMode:'ordinary',sourceText:text}}}}};
    const actual=structuredClone(artifact);actual.items[0].system.activities.AAAAAAAAAAAAAAAA.otherActivityId=null;
    expect(()=>assertActorSemantics(artifact,actual)).not.toThrow();
    actual.items[0].system.activities.AAAAAAAAAAAAAAAA.otherActivityId='linked';
    expect(()=>assertActorSemantics(artifact,actual)).toThrow('Midi safety');
    actual.items[0].system.activities.AAAAAAAAAAAAAAAA.otherActivityId=null;
    artifact._stats.systemVersion='5.3.3';expect(()=>assertActorSemantics(artifact,actual)).toThrow('Midi safety');
  });
  test('native6 effect readback rejects changed duration value, unit and expiry',()=>{
    const artifact:any=structuredClone((acceptedResponse as any).result.artifact);
    artifact.items[0].effects=[{_id:'duration-effect',name:'Timed condition',system:{changes:[]},statuses:['blinded'],
      duration:{value:1,units:'minutes',expiry:'turnEnd',expired:false},start:null}];
    for(const patch of [{value:2},{units:'rounds'},{expiry:'turnStart'}]){
      const actual=structuredClone(artifact);Object.assign(actual.items[0].effects[0].duration,patch);
      expect(()=>assertActorSemantics(artifact,actual)).toThrow('effects');
    }
    expect(()=>assertActorSemantics(artifact,structuredClone(artifact))).not.toThrow();
  });
});

beforeAll(async () => {
  const source = await Bun.file('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md').text();
  acceptedResponse = await convertFinalActorSource(buildForgeActorRequest({
    content: source,
    displayName: 'Forge Actor',
    requestId: 'runtime-test',
    fvttVersion: '14.370',
    systemVersion: '6.0.6',
  }));
  if (!('result' in acceptedResponse) || acceptedResponse.result.status !== 'accepted') {
    throw new Error(`Expected an accepted response fixture: ${JSON.stringify(acceptedResponse)}`);
  }
});

describe('Foundry Forge Actor creation boundary', () => {
  test('actor delivery: the normal create action accepts generated Actors with content findings',async()=>{
    for(const status of ['needs_review','failed'] as const){
      const response=reviewedCandidateResponse(status),collection=new FakeActorCollection();
      const before=structuredClone(response);
      const result=await createAcceptedForgeActor({game:supportedGame(collection),response});
      expect(result.status).toBe('created');expect(collection.createCount).toBe(1);
      expect(()=>assertActorSemantics((response as any).result.artifact,collection.contents[0]!.toObject())).not.toThrow();
      expect(response).toEqual(before);
    }
  });
  test('actor delivery: adapter issues retain both neutral damage modes, ranges and unresolved spell activity',()=>{
    const artifact:any=structuredClone((acceptedResponse as any).result.artifact);
    const item=artifact.items[0],sourceText='A complete rule with ordinary and alternative damage.';
    item.flags={fvttJsonGenerator:{manualRule:{mode:'native-with-gm',sourceText,sourceOperations:[{id:'bite'}]}}};
    const marker=(role:string,damageMode?:string)=>({fvttJsonGenerator:{sourceOperation:{id:'bite',role,damageMode,sourceText}}});
    item.system.range={value:20,long:null,units:'ft'};
    item.system.activities={
      roll:{type:'utility',flags:marker('attack-roll'),range:{value:20,long:60}},
      ordinary:{type:'damage',flags:marker('damage','ordinary'),damage:{parts:[{formula:'1d8+3'},{formula:'1d8'}]},range:{long:60}},
      alternative:{type:'damage',flags:marker('damage','alternative'),damage:{parts:[{formula:'2d8+3'},{formula:'1d8'}]},range:{long:120},spell:{uuid:'ffffffffffffffff'}},
    };
    const warnings:string[]=[],result:any=prepareFoundryImportArtifact(artifact,{modules:{get:()=>({active:true,version:'future'})}},warnings);
    expect(Object.keys(result.items[0].system.activities)).toEqual(['roll','ordinary','alternative']);
    expect(result.items[0].system.activities.ordinary.damage.parts).toHaveLength(2);
    expect(result.items[0].system.activities.alternative.damage.parts).toHaveLength(2);
    expect(result.items[0].system.activities.alternative.spell.uuid).toBe('ffffffffffffffff');
    expect(result.items[0].system.range.long).toBeNull();expect(warnings).toHaveLength(3);
    expect(artifact.items[0].system.activities.roll.midiProperties).toBeUndefined();
  });
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
      await expect(createAcceptedForgeActor({game,response})).resolves.toMatchObject({status:'created'});
      const created = await createReviewedForgeActorCandidate({ game, response, reviewApproval: approval });
      expect(created.status).toBe('existing');
      expect(collection.createInputs).toHaveLength(1);
      const sourceResult = 'result' in response ? response.result : undefined;
      expect(collection.contents[0]!.data.flags[MODULE_ID].candidateReview).toBeUndefined();
      expect(sourceResult!.status).toBe(strictStatus);
      expect(sourceResult!.diagnostics.length).toBeGreaterThan(0);
      expect(collection.contents[0]!.data.items).toHaveLength((sourceResult!.artifact!.items as unknown[]).length);
      expect((await createReviewedForgeActorCandidate({ game, response, reviewApproval: approval })).status).toBe('existing');
      expect(collection.createCount).toBe(1);
      collection.contents[0]!.data.name = 'changed after import';
      await expect(createReviewedForgeActorCandidate({ game, response, reviewApproval: approval })).resolves.toMatchObject({status:'existing',readbackWarnings:expect.arrayContaining([expect.any(String)])});
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
    await expect(createReviewedForgeActorCandidate({ game, response: malformed, reviewApproval: approval })).rejects.toThrow(/approval/u);
    const parseFailure = structuredClone(response);
    if (!('result' in parseFailure)) throw new Error('Candidate fixture result required.');
    parseFailure.result.diagnostics[0]!.stage = 'parse';
    expect(collection.createCount).toBe(0);
    expect((await createReviewedForgeActorCandidate({ game, response: parseFailure, reviewApproval: candidateApproval(parseFailure) })).status).toBe('created');
    expect(collection.createCount).toBe(1);
  });

  test('retains its new candidate and reports content differences without changing baseline actors', async () => {
    const response = reviewedCandidateResponse('failed');
    for (const failure of ['readback'] as const) {
      const collection = new FakeActorCollection({ failure });
      const game = { ...supportedGame(collection), user: { isGM: true, id: 'candidate-gm' } };
      const baseline = collection.seed({ _id: 'baseline', name: 'Protected Actor' });
      const result=await createReviewedForgeActorCandidate({ game, response, reviewApproval: candidateApproval(response) });
      expect(result.readbackWarnings?.join(' ')).toContain('readback drift');
      expect(collection.createCount).toBe(1);
      expect(collection.contents).toEqual([baseline,collection.created[0]!]);
      expect(baseline.deleted).toBe(false);
      expect(collection.created[0]!.deleted).toBe(false);
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
      fvttVersion: '14.368', systemVersion: '6.0.6',
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
      fvttVersion: '14.370',
      systemVersion: '6.0.6',
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

  test('accepts Foundry v14 migration of legacy ActiveEffect changes and reports readback drift', async () => {
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/scuttling-serpentmaw__蛇口蛮蟹.md').text();
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: source,
      displayName: 'Scuttling Serpentmaw',
      requestId: 'runtime-v14-effect-change-value',
      fvttVersion: '14.370',
      systemVersion: '6.0.6',
    }));
    if (!('result' in response) || response.result.status !== 'accepted') {
      throw new Error(`Expected an accepted Scuttling Serpentmaw response: ${JSON.stringify(response)}`);
    }

    const brittleShell = (response.result.artifact.items as Array<Record<string, any>>)
      .find((item) => item.name === '脆壳反震 Brittle Shell');
    expect(brittleShell?.effects?.[0]?.system?.changes?.[0]?.type).toBe('override');
    expect(brittleShell?.effects?.[0]?.system?.changes?.[0]?.value).toBe('14');

    const collection = new FakeActorCollection();
    const result = await createAcceptedForgeActor({ game: supportedGame(collection), response });
    const imported = collection.contents[0]!.toObject() as Record<string, any>;
    const importedBrittleShell = (imported.items as Array<Record<string, any>>)
      .find((item) => item.name === '脆壳反震 Brittle Shell');
    const importedEffect = importedBrittleShell?.effects?.[0] as Record<string, any>;

    expect(result.status).toBe('created');
    expect(importedEffect?.system?.changes?.[0]?.type).toBe('override');
    expect(importedEffect?.system?.changes?.[0]).not.toHaveProperty('mode');
    expect(importedEffect?.system?.changes?.[0]?.value).toBe('14');

    const persistedBrittleShell = (collection.contents[0]!.data.items as Array<Record<string, any>>)
      .find((item) => item.name === '脆壳反震 Brittle Shell');
    const persistedEffect = persistedBrittleShell?.effects?.[0] as Record<string, any>;
    const canonicalChanges = structuredClone(persistedEffect.system.changes);
    delete persistedEffect.system.changes;
    persistedEffect.changes = canonicalChanges.map((change: Record<string, any>) => ({ ...change, value: '14' }));
    const equivalent=await createAcceptedForgeActor({ game: supportedGame(collection), response });
    expect(equivalent.status).toBe('existing');expect(equivalent.readbackWarnings??[]).toEqual([]);

    delete persistedEffect.changes;
    persistedEffect.system.changes = canonicalChanges.map((change: Record<string, any>) => ({ ...change, value: 15 }));
    await expect(createAcceptedForgeActor({ game: supportedGame(collection), response }))
      .resolves.toMatchObject({status:'existing',readbackWarnings:expect.arrayContaining([expect.any(String)])});

    persistedEffect.system.changes = canonicalChanges.map((change: Record<string, any>) => ({ ...change, type: 'add' }));
    await expect(createAcceptedForgeActor({ game: supportedGame(collection), response }))
      .resolves.toMatchObject({status:'existing',readbackWarnings:expect.arrayContaining([expect.any(String)])});
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
      fvttVersion: '14.370',
      systemVersion: '6.0.6',
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
    expect(asRecord(attack).range).toMatchObject({ override: true, value: '5', units: 'ft' });
    expect(asRecord(attack).range).not.toHaveProperty('reach');

    const collection = new FakeActorCollection();
    const result = await createAcceptedForgeActor({ game: supportedGame(collection), response });
    const imported = collection.contents[0]!.toObject() as Record<string, any>;
    expect(result.status).toBe('created');
    expect(findActivity(imported, '吞咽 Swallow', attackId).range)
      .toMatchObject({ override: true, value: '5', units: 'ft' });
  });

  test('ignores only inactive Activity template unit defaults and rejects active-template unit drift', async () => {
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/scuttling-serpentmaw__蛇口蛮蟹.md').text();
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: source,
      displayName: 'Scuttling Serpentmaw',
      requestId: 'runtime-v14-inactive-template-units',
      fvttVersion: '14.370',
      systemVersion: '6.0.6',
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
      .resolves.toMatchObject({status:'existing',readbackWarnings:expect.arrayContaining([expect.any(String)])});
    expect(activeCollection.createCount).toBe(1);
  });

  test('reports content differences when reusing an Actor with matching source identity', async () => {
    const collection = new FakeActorCollection();
    const game = supportedGame(collection);
    await createAcceptedForgeActor({ game, response: acceptedResponse });
    collection.contents[0]!.data.name = 'CORRUPT';

    await expect(createAcceptedForgeActor({ game, response: acceptedResponse })).resolves.toMatchObject({status:'existing',readbackWarnings:expect.arrayContaining([expect.any(String)])});
    expect(collection.createCount).toBe(1);
    expect(collection.contents).toHaveLength(1);
    expect(collection.contents[0]!.deleted).toBe(false);
  });

  test.each([
    ['creature type', (actor: FakeActor) => { actor.data.system.details.type = { value: 'construct' }; }],
    ['ability score', (actor: FakeActor) => { actor.data.system.abilities.str.value += 1; }],
  ] as const)('reports reusable Actor readback with changed %s', async (_name, corrupt) => {
    const collection = new FakeActorCollection();
    const game = supportedGame(collection);
    await createAcceptedForgeActor({ game, response: acceptedResponse });
    corrupt(collection.contents[0]!);

    await expect(createAcceptedForgeActor({ game, response: acceptedResponse })).resolves.toMatchObject({status:'existing',readbackWarnings:expect.arrayContaining([expect.any(String)])});
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
      fvttVersion: '14.370',
      systemVersion: '6.0.6',
    }));
    if (!('result' in response) || response.result.status !== 'accepted') {
      throw new Error(`Expected an accepted thrown-range response: ${JSON.stringify(response)}`);
    }
    const sourceArtifact = response.result.artifact;
    const javelinArtifact = (sourceArtifact.items as Array<Record<string, any>>).find((item) => item.name === 'Javelin');
    if (!javelinArtifact) throw new Error('Expected the White Tusk Orc fixture to contain a Javelin item.');
    expect(javelinArtifact?.system?.range?.long).toBe(120);
    const attacks=Object.values(javelinArtifact.system.activities) as any[];
    expect(attacks.find(activity=>activity.attack?.type?.value==='melee')?.range).toMatchObject({value:'5'});
    expect(attacks.find(activity=>activity.attack?.type?.value==='ranged')?.range).toMatchObject({value:'30'});

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
    ['Fireball', '23af52db33017be0', 'Compendium.dnd5e.spells24.Item.phbsplFireball00'],
    ['Alter Self', 'e2de216f26943e8b', 'Compendium.dnd5e.spells24.Item.phbsplAlterSelf0'],
  ] as const)('qualifies a saved %s legacy reference and preserves the formally generated 2024 artifact', async (spellName, legacyUuid, foundryUuid) => {
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md').text();
    const casterSource = source.replace('背景: |-', `施法属性: int\n施法:\n  - "随意: ${spellName}"\n背景: |-`);
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: casterSource,
      displayName: `Nightgaunt ${spellName}`,
      requestId: `runtime-legacy-spell-${spellName}`,
      fvttVersion: '14.370',
      systemVersion: '6.0.6',
    }));
    if (!('result' in response) || response.result.status !== 'accepted') {
      throw new Error(`Expected an accepted caster response: ${JSON.stringify(response)}`);
    }
    const sourceArtifact = response.result.artifact;
    const spellcastingArtifact = (sourceArtifact.items as Array<Record<string, any>>).find((item) => item.name === '施法 Spellcasting');
    const activity = Object.values(spellcastingArtifact?.system?.activities ?? {})[0] as Record<string, any> | undefined;
    expect(activity?.spell?.uuid).toBe(foundryUuid);
    const savedLegacy=structuredClone(sourceArtifact) as any;
    const savedFeature=savedLegacy.items.find((item:any)=>item.name==='施法 Spellcasting');
    (Object.values(savedFeature.system.activities)[0] as any).spell.uuid=legacyUuid;
    const savedHash=hashArtifact(savedLegacy),importCopy:any=prepareFoundryImportArtifact(savedLegacy,supportedGame(new FakeActorCollection()));
    expect((Object.values(importCopy.items.find((item:any)=>item.name==='施法 Spellcasting').system.activities)[0] as any).spell.uuid).toBe(foundryUuid);
    expect(hashArtifact(savedLegacy)).toBe(savedHash);

    const collection = new FakeActorCollection();
    const result = await createAcceptedForgeActor({ game: supportedGame(collection), response });
    const imported = collection.contents[0]!.toObject() as Record<string, any>;
    const spellcastingImported = (imported.items as Array<Record<string, any>>).find((item) => item.name === '施法 Spellcasting');
    const importedActivity = Object.values(spellcastingImported?.system?.activities ?? {})[0] as Record<string, any> | undefined;
    expect(result.status).toBe('created');
    expect(importedActivity?.spell?.uuid).toBe(foundryUuid);
    expect(hashArtifact(sourceArtifact)).toBe(response.result.artifactHash);
  });

  test('retains the newly created Actor and reports a changed name', async () => {
    const failure = 'readback' as const;
    const collection = new FakeActorCollection({ failure });
    const game = supportedGame(collection);
    const result=await createAcceptedForgeActor({ game, response: acceptedResponse });
    expect(result.readbackWarnings?.join(' ')).toContain('readback drift');
    expect(collection.contents).toHaveLength(1);
    expect(collection.created[0]?.deleted).toBe(false);
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
    })).rejects.toThrow(/Core 14/u);
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

  test('retains an Actor with an unresolved legacy spell and its findings', async () => {
    const source = await Bun.file('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md').text();
    const casterSource = source.replace('背景: |-', '施法:\n  - "随意: ArcaneGate"\n背景: |-');
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: casterSource,
      displayName: 'Nightgaunt Unresolved Spell',
      requestId: 'runtime-unresolved-legacy-spell',
      fvttVersion: '14.370',
      systemVersion: '6.0.6',
    }));
    if (!('result' in response)) throw new Error(`Expected an unresolved spell result: ${JSON.stringify(response)}`);
    expect(response.result.status).toBe('needs_review');
    const collection = new FakeActorCollection();
    await expect(createAcceptedForgeActor({game:supportedGame(collection),response})).resolves.toMatchObject({status:'created'});
    expect(collection.createCount).toBe(1);
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

  test('reports a cleanup failure after source identity loss instead of hiding a possible complete Actor', async () => {
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
    if (this.failure === 'readback') return { ...structuredClone(this.data), name: 'readback drift' };
    if (this.failure === 'readback-delete') { const value=structuredClone(this.data);delete value.flags[MODULE_ID];return value; }
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
  return { version: '14.370', system: { id: 'dnd5e', version: '6.0.6' }, user: { isGM: true }, actors };
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
  const changes = structuredClone(effect.system?.changes??effect.changes).map(simulateFoundryV14LegacyEffectChangeMode);
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

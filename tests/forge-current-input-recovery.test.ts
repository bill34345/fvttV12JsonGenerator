import {describe,test,expect} from 'bun:test';
import yaml from 'js-yaml';
import {hashSource,hashArtifact,type ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {normalizeMonsterIntakeProposal,OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {renderMonsterIntakeMarkdown,renderMonsterFeatureName} from '@fvtt-json-generator/intake-ai/renderer';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import {analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import captured from './fixtures/forge-current-input-recovery.json';
import brass from './fixtures/forge-2024-brass-dragon-full-ir-v48.json';

const SOURCE_ID='actor:v1:71ebf592-2eb2-4af3-ad27-f55d86892814' as ForgeSourceId;
const source=(id:string)=>captured.cases.find(entry=>entry.id===id)!;
const stop=async():Promise<never>=>{throw Error('This recovery test forbids model, review and repair calls');};
const provider={providerName:'frozen-current-first-reply',extractionModel:'frozen',reviewModel:'disabled',discover:stop,extract:stop,review:stop,repair:stop};
async function formal(record:{source:string;ir:unknown},name:string){
  const input={source:record.source,sourceName:name,sourceScope:'single' as const,sourceId:SOURCE_ID,requestId:'current-input-'+name,fvttVersion:'14.368',systemVersion:'5.3.3'};
  const analysis=analyzeBrowserActorIntakeDraft(input,structuredClone(record.ir) as MonsterIntakeIR,provider);
  const generated=await generateBrowserActorIntakeCandidate(input,analysis,provider);
  return{input,analysis,generated,actor:generated.actorProjection as any};
}
function manifest(actor:any){return actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;}
function declarations(record:any){return(Array.isArray(record.ir.creature.spellcasting)?record.ir.creature.spellcasting:[record.ir.creature.spellcasting]).filter(Boolean);}
function expectSpellFidelity(actor:any,groups:any[]){
  const actual=manifest(actor).spellcastingGroups;
  expect(actual).toHaveLength(groups.length);
  for(const group of groups){const projected=actual.find((entry:any)=>entry.groupId===group.groupId);expect(projected).toBeDefined();expect(projected.ability).toBe(group.ability);
    const carriers=actor.items.filter((item:any)=>item.flags?.fvttJsonGenerator?.spellcastingFeatureKey===projected.featureItemKey);expect(carriers).toHaveLength(1);
    expect(carriers[0].system.description.value.replace(/<[^>]*>/gu,' ').replace(/\s+/gu,' ')).toContain(group.description.replace(/\s+/gu,' '));
    if(group.saveDc!==undefined)expect(projected.saveDc).toBe(group.saveDc);
    const refs=group.usageGroups.flatMap((usage:any)=>usage.spellRefs.map((ref:any)=>({usage,ref})));
    const shared=group.usageGroups.find((usage:any)=>usage.usage==='daily-shared');
    if(shared)expect(carriers[0].system.uses).toMatchObject({max:String(shared.count),recovery:[{period:'day',type:'recoverAll'}]});
    expect(projected.spellRefs).toHaveLength(refs.length);
    for(const {usage,ref}of refs){const found=projected.spellRefs.find((entry:any)=>entry.refId===ref.refId);expect(found.originalName).toBe(ref.originalName);expect(found.restrictions).toEqual(ref.restrictions);
      if(usage.usage==='daily-shared'||usage.usage==='daily-each')expect(found.uses).toEqual({value:usage.count,recovery:'day',shared:usage.usage==='daily-shared'});
    }
  }
}
describe('new current first replies recover through the formal workflow without model calls',()=>{
  test('mechanically selected first source/reply/IR identities remain frozen',()=>{
    for(const record of captured.cases){expect<string>(hashSource(record.source)).toBe(record.sourceSha256);expect<string>(hashSource(record.rawReply)).toBe(record.rawReplySha256);expect<string>(hashSource(JSON.stringify(record.ir))).toBe(record.irSha256);expect(record.ir.source).toEqual({sha256:record.sourceSha256,length:record.source.length});}
  });
  test('existing explicit-lair Brass retains its complete formal Actor artifact',async()=>{
    const result=await formal(brass,'brass-control');expect(result.generated.intakeVerificationStatus).toBe('accepted');expect(result.generated.findings).toEqual([]);
    expect(result.actor.system.resources.legres).toEqual({max:3,spent:0});expect(result.actor.flags.fvttJsonGenerator.sourceLegendaryLedger).toMatchObject({max:3,lairMax:4,resistanceMax:3,resistanceLairMax:4});
    const sleep=result.actor.items[5];expect(sleep.name).toBe('Sleep Breath');
    const activity=sleep.system.activities.ea765c5d65735a9b;expect(activity.type).toBe('save');
    expect(sleep.effects).toHaveLength(2);
    const first=sleep.effects.find((effect:any)=>effect.name==='失能 Incapacitated'),second=sleep.effects.find((effect:any)=>effect.name==='昏迷 Unconscious');
    expect(first.statuses).toEqual(['incapacitated']);expect(first.duration.seconds).toBeNull();
    expect(second.statuses).toEqual(['unconscious','incapacitated']);expect(second.duration.seconds).toBe(600);
    for(const effect of [first,second]){expect(effect.flags.fvttJsonGenerator.sourceOperationId).toBe('sleep-breath-save');expect(effect.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');}
    expect(first.flags.fvttJsonGenerator.conditionLifecycle.condition).toContain('Failure:');expect(first.flags.fvttJsonGenerator.conditionLifecycle.condition.replace(/\s+/gu,' ')).toContain('at which point it repeats the save');
    expect(second.flags.fvttJsonGenerator.conditionLifecycle.condition).toBe('Second Failure: The target has the Unconscious condition for 10 minutes.');
    expect(second.description).toContain('takes damage');expect(second.description).toContain('wake it');
    expect(activity.effects).toEqual([{_id:first._id,onSave:false},{_id:second._id,onSave:false}]);
    // Compare the complete deterministic workflow result and every original
    // ability rather than freezing a hash of an obsolete presentation format.
    const replay=await formal(brass,'brass-control');expect(replay.actor).toEqual(result.actor);
    expect(verifyMonsterIntake(brass.source,result.analysis.ir!,result.generated.markdown!,result.actor).findings).toEqual([]);
    const visible=(text:string)=>text.replace(/<br\s*\/?\s*>/giu,' ').replace(/<[^>]*>/gu,' ').replace(/\s+/gu,' ').trim();
    const features=['traits','actions','bonusActions','reactions','legendaryActions','mythicActions'].flatMap(section=>(brass.ir.creature as any)[section]??[]);
    const groups=brass.ir.creature.spellcasting;
    expect(result.actor.items).toHaveLength(features.length+groups.length);
    for(const feature of features){const items=result.actor.items.filter((item:any)=>item.name===renderMonsterFeatureName(feature));expect(items,feature.name).toHaveLength(1);expect(visible(items[0].system.description.value)).toContain(visible(feature.description));}
    expectSpellFidelity(result.actor,groups);

  });
  test('Unicorn first reply preserves native resistance3 without invented lair, all nine abilities and nine spells',async()=>{
    const record=source('unicorn'),before=JSON.stringify(record),result=await formal(record,'unicorn');
    const expected=structuredClone(record.ir) as any;expected.creature.spellcasting[1].componentWaivers=[];
    expect(result.analysis.ir).toEqual(expected);expect(result.analysis.status).toBe('ready_to_generate');expect(result.generated.findings).toEqual([]);expect(result.generated.intakeVerificationStatus).toBe('accepted');
    expect(result.actor.system.resources.legres).toEqual({max:3,spent:0});expect(result.actor.system.resources.legact).toEqual({max:3,spent:0});
    expect(result.actor.system.resources.lair.value).toBe(false);expect(result.actor.flags.fvttJsonGenerator.sourceLegendaryLedger).toBeUndefined();
    const groups=declarations(record),features=['traits','actions','bonusActions','reactions','legendaryActions','mythicActions'].flatMap(section=>(record.ir.creature as any)[section]??[]);
    expect(features.length+groups.length).toBe(9);
    for(const feature of features){const item=result.actor.items.find((entry:any)=>entry.name===renderMonsterFeatureName(feature));expect(item,feature.name).toBeDefined();
      expect(item.system.description.value.replace(/<[^>]*>/gu,' ').replace(/\s+/gu,' ')).toContain(feature.description.replace(/\s+/gu,' '));}
    expectSpellFidelity(result.actor,groups);expect(manifest(result.actor).spellcastingGroups.flatMap((group:any)=>group.spellRefs)).toHaveLength(9);
    expect(manifest(result.actor).spellcastingGroups.find((group:any)=>group.groupId==='unicorns-blessing').spellRefs.every((ref:any)=>ref.ignoresMaterialComponents===false)).toBe(true);
    expect(result.actor.items.find((item:any)=>item.name==='Legendary Resistance (3/Day)').system.uses?.max).not.toBe('3');
    const shield=result.actor.items.find((item:any)=>item.name==='Shimmering Shield'),heal=Object.values<any>(shield.system.activities).find(activity=>activity.type==='heal');
    expect(heal.healing).toMatchObject({types:['temphp'],number:3,denomination:6});
    expect(heal.range).toMatchObject({override:true,value:60,units:'ft'});
    expect(result.generated.calls).toEqual({discovery:0,extraction:0,review:0,repair:0});expect(JSON.stringify(record)).toBe(before);
  });
  test('Spirit Naga complete singleton spell group becomes one group without changing its eight grants or restrictions',async()=>{
    const record=source('spirit-naga'),before=JSON.stringify(record),result=await formal(record,'spirit-naga');
    const expected=structuredClone(record.ir) as any,group=expected.creature.spellcasting;expected.creature.spellcasting=[group];
    for(const usage of group.usageGroups)for(const ref of usage.spellRefs)if(ref.identifier===undefined)ref.identifier=ref.originalName;
    expect(result.analysis.ir).toEqual(expected);expect(result.analysis.status).toBe('ready_to_generate');expect(result.generated.intakeVerificationStatus).toBe('accepted');expect(result.generated.findings).toEqual([]);
    expectSpellFidelity(result.actor,[group]);const refs=manifest(result.actor).spellcastingGroups[0].spellRefs;expect(refs).toHaveLength(8);
    const daily=group.usageGroups.filter((usage:any)=>usage.usage==='daily-each');expect(daily).toHaveLength(1);expect(daily[0].count).toBe(2);
    expect(refs.find((ref:any)=>ref.originalName==='Hold Person').restrictions).toContainEqual(expect.objectContaining({kind:'casting',text:'level 3 version',value:3}));
    expect(refs.find((ref:any)=>ref.originalName==='Lightning Bolt').restrictions).toContainEqual(expect.objectContaining({kind:'casting',text:'level 4 version',value:4}));
    expect(result.generated.calls).toEqual({discovery:0,extraction:0,review:0,repair:0});expect(JSON.stringify(record)).toBe(before);
  });
  for(const id of ['unicorn','spirit-naga'])test(id+' original raw reply also passes the real provider normalizer with only a fake HTTP response',async()=>{
    const record=source(id),before=structuredClone(record),responses:any[]=[];let requests=0;const actual=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://offline.invalid/v1',apiKey:'fake-only',model:'frozen',reviewModel:'disabled',timeoutMs:1000,repairTimeoutMs:1000,maxAttempts:1,responseEvidence:{record:row=>{responses.push(row);}},
      httpClient:async()=>{requests++;return new Response(JSON.stringify({choices:[{message:{content:record.rawReply}}]}));}});
    const ir=await actual.extract({source:record.source,sourceSha256:record.sourceSha256,candidate:{id,label:id,start:0,end:record.source.length,quote:record.source}});
    expect(validateMonsterIntakeIR(record.source,ir).findings).toEqual([]);
    const working=structuredClone(ir),expected=normalizeMonsterIntakeProposal(record.source,record.ir as any),original=JSON.parse(record.rawReply);
    expect(working.creature.candidateReview?.findings).toEqual([]);
    expect(working.creature.candidateReview?.proposal).toEqual({prior:null,original});
    expect(original.creature.traits[0].evidence[0]).toMatchObject({start:-1,end:-1});
    delete working.creature.candidateReview;if(expected.creature.candidateReview?.findings.length===0)delete expected.creature.candidateReview;
    expect(working).toEqual(expected);expect(responses[0].content).toBe(record.rawReply);
    const generated=await formal({source:record.source,ir},id+'-raw-first-reply');expect(generated.generated.findings).toEqual([]);expect(generated.generated.intakeVerificationStatus).toBe('accepted');
    const control=await formal(record,id+'-canonical-control');expect(generated.actor).toEqual(control.actor);
    expectSpellFidelity(generated.actor,declarations(record));
    expect(generated.generated.calls).toEqual({discovery:0,extraction:0,review:0,repair:0});
    expect(requests).toBe(1);expect(record).toEqual(before);
  });
});

describe('closed normalization and explicit base-only resistance projection',()=>{
  test('missing component-waiver list means none; explicit arrays and illegal null/object values survive unchanged',()=>{
    const record=source('unicorn'),raw=structuredClone(record.ir) as any;
    const normalized=normalizeMonsterIntakeProposal(record.source,raw);expect(normalized.creature.spellcasting![1]!.componentWaivers).toEqual([]);
    expect(normalized.creature.spellcasting![0]!.componentWaivers).toEqual(raw.creature.spellcasting[0].componentWaivers);expect(Object.hasOwn(raw.creature.spellcasting[1],'componentWaivers')).toBe(false);
    for(const invalid of [null,{},'material']){const copy=structuredClone(raw);copy.creature.spellcasting[1].componentWaivers=invalid;const after=normalizeMonsterIntakeProposal(record.source,copy);
      expect((after.creature.spellcasting![1] as any).componentWaivers).toEqual([]);expect(after.creature.candidateReview).toBeDefined();expect(JSON.stringify(after.creature.candidateReview)).toContain(JSON.stringify(invalid));}
  });
  test('partial singleton notation preserves the original group data and other creature abilities',async()=>{
    const record=source('spirit-naga'),raw=structuredClone(record.ir) as any;
    for(const invalid of [null,{}, {Spellcasting:raw.creature.spellcasting}, {...raw.creature.spellcasting,unrecognized:true}, {...raw.creature.spellcasting,ability:undefined}, {...raw.creature.spellcasting,usageGroups:undefined}]){
      const copy=structuredClone(raw);copy.creature.spellcasting=invalid;const after=normalizeMonsterIntakeProposal(record.source,copy);
      expect(Array.isArray(after.creature.spellcasting)).toBe(true);const result=await formal({source:record.source,ir:copy},'partial-singleton');expect(result.generated.candidateAvailable).toBe(true);expect(result.actor.items.length).toBeGreaterThan(0);expect(copy.creature.spellcasting).toEqual(invalid);
    }
  });
  test('base capacity is independent, but a declared lair resistance still requires a valid explicit base/pair',()=>{
    const record=source('unicorn'),ir=normalizeMonsterIntakeProposal(record.source,record.ir as any);
    expect(validateMonsterIntakeIR(record.source,ir).blocking).toEqual([]);
    for(const value of [0,-1,1.5,null,'3',Number.NaN,Number.POSITIVE_INFINITY]){const bad=structuredClone(ir);(bad.creature.legendary as any).resistanceMax=value;expect(validateMonsterIntakeIR(record.source,bad).blocking.some(finding=>finding.path==='/creature/legendary/resistanceMax')).toBe(true);}
    const missing=structuredClone(ir);delete missing.creature.legendary!.resistanceMax;missing.creature.legendary!.resistanceLairMax=4;
    expect(validateMonsterIntakeIR(record.source,missing).blocking.length).toBeGreaterThan(0);
    const wrong=structuredClone(ir);Object.assign(wrong.creature.legendary!,{lairMax:4,resistanceLairMax:5});expect(validateMonsterIntakeIR(record.source,wrong).blocking.length).toBeGreaterThan(0);
  });
  test('standard resistance field supports LF/CRLF and strict literal positive integer values without guessing text',async()=>{
    const canonical=(value:unknown)=>['---','名称: Counter Control','类型: npc','护甲等级: 14','生命值: 30','传奇抗性次数: '+JSON.stringify(value),'---'].join('\n');
    const parser=new YamlParser();for(const value of [1,3,'9']){const text=canonical(value),parsed=parser.parse(text);expect(parsed.attributes.legres).toEqual({value:Number(value),max:Number(value)});expect(parser.parse(text.replaceAll('\n','\r\n'))).toEqual(parsed);
      const generated=await convertMarkdownContentToJson({content:text,fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null});expect((generated.rawJson as any).system.resources.legres).toEqual({max:Number(value),spent:0});}
    for(const invalid of [0,-1,1.5,'3/day','3e0','3 uses','',null,true,{},[]]){const parsed=parser.parse(canonical(invalid));expect(parsed.attributes.legres).toBeUndefined();expect(parsed.candidateReview).toBeDefined();}
    const repeated=parser.parse(canonical(3).replace('\n---','\nAttributes:\n  传奇抗性次数: 4\n---'));expect(repeated.attributes.legres).toEqual({value:3,max:3});expect(repeated.candidateReview).toBeDefined();
  });
  test('lair ledger and an explicitly conflicting standard counter cannot overwrite one another',()=>{
    const ir=normalizeMonsterIntakeProposal(brass.source,brass.ir as any),doc=yaml.load(renderMonsterIntakeMarkdown(ir).slice(4,-4)) as any;
    doc.传奇抗性次数=3;const compatible=new YamlParser().parse(yaml.dump(doc));
    expect(compatible.attributes.legres).toEqual({value:3,max:3});expect(compatible.sourceLegendaryLedger).toMatchObject({resistanceMax:3,resistanceLairMax:4});
    const missing=structuredClone(doc);delete missing['intake-legendary-ledger'].resistanceMax;delete missing['intake-legendary-ledger'].resistanceLairMax;
    expect(new YamlParser().parse(yaml.dump(missing)).attributes.legres).toEqual({value:3,max:3});
    doc.传奇抗性次数=2;const conflicting=new YamlParser().parse(yaml.dump(doc));expect(conflicting.attributes.legres).toEqual({value:2,max:2});expect(conflicting.sourceLegendaryLedger?.resistanceMax).toBe(3);
  });
  test('native lair mode cannot silently increase an undeclared resistance lair capacity',async()=>{
    // Synthetic projection control, never a repaired or re-scored Brass reply:
    // 5.3.3 increments both native counters with the same lair checkbox. The
    // missing resistance declaration must remain an error, never a filled 4.
    const ir=structuredClone(brass.ir) as any;delete ir.creature.legendary.resistanceLairMax;
    const result=await formal({source:brass.source,ir},'synthetic-missing-lair-counter');
    expect(result.analysis.status).toBe('needs_review');
    expect(result.analysis.findings).toContainEqual(expect.objectContaining({code:'INVALID_STRUCTURE',path:'/creature/legendary/resistanceLairMax',blocking:true}));
    expect(result.analysis.ir!.creature.legendary!.resistanceLairMax).toBeUndefined();expect(result.generated.status).toBe('ready_for_gm_review');
    expect(result.generated.candidateAvailable).toBe(true);expect(result.actor.system.resources.legres).toEqual({max:3,spent:0});expect(result.actor.system.resources.lair.value).toBe(false);expect(result.generated.analysis.ir).toEqual(result.analysis.ir);
    expect(result.generated.calls.review).toBe(0);expect(ir.creature.legendary.resistanceLairMax).toBeUndefined();
  });
  test('explicit healing distances including zero stay separate from an omitted GM range',async()=>{
    const record=source('unicorn');
    for(const range of [0,undefined]){const ir=structuredClone(record.ir) as any,op=ir.creature.legendaryActions[1].sourceOperations[0];
      if(range===undefined)delete op.range;else op.range=range;
      const result=await formal({source:record.source,ir},'synthetic-heal-range-'+String(range));
      expect(result.generated.findings).toEqual([]);const item=result.actor.items.find((entry:any)=>entry.name==='Shimmering Shield');
      const activity=Object.values<any>(item.system.activities).find(entry=>entry.type==='heal');
      if(range===undefined){expect(activity.range.units).toBe('spec');expect(activity.range.value).toBeUndefined();}
      else expect(activity.range).toMatchObject({override:true,value:0,units:'ft'});
    }
  });
  test('verifier detects base-only max/spent/type/lair tampering without reading a capacity from prose',async()=>{
    const record=source('unicorn'),result=await formal(record,'unicorn-corruption');expect(result.generated.intakeVerificationStatus,JSON.stringify(result.generated.findings)).toBe('accepted');
    for(const mutate of [(actor:any)=>{actor.system.resources.legres.max=0;},(actor:any)=>{actor.system.resources.legres.spent=1;},
      (actor:any)=>{actor.system.resources.legres.max='3';},(actor:any)=>{delete actor.system.resources.legres.spent;},(actor:any)=>{actor.system.resources.lair.value=true;}]){
      const actor=structuredClone(result.actor);mutate(actor);expect(verifyMonsterIntake(record.source,result.analysis.ir!,result.generated.markdown!,actor).findings.some(finding=>finding.code==='ACTOR_LEGENDARY_RESISTANCE_DRIFT')).toBe(true);}
  });
});

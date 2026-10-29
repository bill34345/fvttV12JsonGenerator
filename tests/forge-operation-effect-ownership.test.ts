import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import type {ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import type {SourceOperation} from '@fvtt-json-generator/models/source-operations';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';

const noCall=async():Promise<never>=>{throw Error('Effect ownership regression tests forbid model requests');};
const provider={providerName:'effect-ownership',extractionModel:'none',reviewModel:'disabled',discover:noCall,extract:noCall,repair:noCall,review:noCall};
async function generate(features:any[],options:{ir?:any;source?:string}={}){
  const ir=options.ir??buildValidLurkerIr();
  if(!options.ir){ir.creature.traits=[];ir.creature.actions=features;ir.creature.bonusActions=[];ir.creature.reactions=[];ir.creature.legendaryActions=[];ir.claims=[];ir.coverage=[];}
  const before=structuredClone(ir),source=options.source??LURKER_SOURCE+'\n'+features.map(feature=>feature.description).join('\n');
  const input={source,sourceName:'Operation effect ownership',sourceScope:'single' as const,requestId:'operation-effect-ownership',sourceId:'actor:v1:f87b16ef-4f83-4537-979d-cf01a1e4e5f8' as ForgeSourceId,fvttVersion:'14.368',systemVersion:'5.3.3'};
  const analysis=analyzeBrowserActorIntakeDraft(input,ir,provider),result=await generateBrowserActorIntakeCandidate(input,analysis,provider);
  expect(result.candidateAvailable).toBe(true);expect(ir).toEqual(before);
  const actor=(result.candidateResponse as any)?.result?.artifact;expect(actor).toBeDefined();return actor;
}
const acts=(item:any)=>Object.values<any>(item.system.activities);
const opActivity=(item:any,id:string)=>acts(item).find(activity=>activity.flags?.fvttJsonGenerator?.sourceOperation?.id===id);
function linkedStatuses(item:any,id:string):string[]{return(opActivity(item,id)?.effects??[]).flatMap((link:any)=>item.effects.find((effect:any)=>effect._id===link._id)?.statuses??[]);}
function persistentFeature(qualifier:string,statuses:string[],extra=''){
  const first='Dexterity Saving Throw: DC 14. Failure: the target enters the enclosing field.';
  const pulse=`${qualifier}, the target has the ${statuses.join(' and ')} ${statuses.length===1?'condition':'conditions'}, and takes 7 (2d6) Acid damage at the start of each of its turns.${extra}`;
  const description=first+' '+pulse;
  const operations:SourceOperation[]=[
    {id:'entry',name:'Entry Save',type:'save',relationship:'primary',sourceText:description,save:{dc:14,abilities:['dex'],choice:'single',outcome:'none'},appliedConditions:[{statuses:statuses.map(status=>status.toLowerCase()),condition:qualifier}],proof:{save:first}},
    {id:'pulse',name:'Pulse Damage',type:'damage',relationship:'follow-up',sourceText:description,condition:qualifier+', at the start of each of its turns',damage:[{formula:'2d6',type:'acid',relationship:'base'}],proof:{damage:[pulse]}},
  ];
  return {name:'Persistent field',description,sourceOperations:operations};
}

for(const [qualifier,statuses]of [
  ['While enclosed',['Blinded','Restrained']],
  ['While held in the web',['Restrained']],
  ['Until released',['Frightened']],
] as Array<[string,string[]]>)test('operation effects: persistent state stays on its explicit entry stage: '+qualifier,async()=>{
  const feature=persistentFeature(qualifier,statuses),actor=await generate([feature]),item=actor.items[0];
  expect(acts(item).map(activity=>activity.type)).toEqual(['save','damage']);
  expect(linkedStatuses(item,'entry').sort()).toEqual(statuses.map(status=>status.toLowerCase()).sort());
  expect(opActivity(item,'pulse').effects).toEqual([]);expect(item.effects).toHaveLength(1);
  expect(opActivity(item,'pulse').damage.parts).toMatchObject([{number:2,denomination:6,types:['acid']}]);
  expect(opActivity(item,'pulse').consumption.targets).toEqual([]);
  expect(item.system.description.value).toContain(feature.description);
  expect(item.effects[0].flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');
  expect(item.effects[0].flags.fvttJsonGenerator.sourceOperationId).toBe('entry');
});

test('operation effects: a pulse can still explicitly apply the same status',async()=>{
  const feature=persistentFeature('While enclosed',['Blinded']);
  feature.sourceOperations[1]!.appliedConditions=[{statuses:['blinded'],condition:'The damage reapplies the status.'}];
  const item=(await generate([feature])).items[0];expect(linkedStatuses(item,'entry')).toEqual(['blinded']);expect(linkedStatuses(item,'pulse')).toEqual(['blinded']);expect(item.effects).toHaveLength(2);
});

test('operation effects: a later genuine new state on ongoing damage is retained',async()=>{
  const feature=persistentFeature('While enclosed',['Blinded'],' After taking this damage, the target becomes Blinded for 1 minute.');
  const item=(await generate([feature])).items[0];expect(linkedStatuses(item,'entry')).toEqual(['blinded']);expect(linkedStatuses(item,'pulse')).toEqual(['blinded']);
  expect(opActivity(item,'pulse').description.chatFlavor).toContain('After taking this damage, the target becomes Blinded for 1 minute.');
});

test('operation effects: a different newly applied status shares the pulse without inheriting the entry status',async()=>{
  const feature=persistentFeature('While enclosed',['Restrained'],' After taking this damage, the target becomes Poisoned for 1 minute.');
  const item=(await generate([feature])).items[0];expect(linkedStatuses(item,'entry')).toEqual(['restrained']);expect(linkedStatuses(item,'pulse')).toEqual(['poisoned']);
  expect(item.effects).toHaveLength(2);
});

test('operation effects: a continuous state without another declared owner remains available',async()=>{
  const feature=persistentFeature('While enclosed',['Blinded']);delete feature.sourceOperations[0]!.appliedConditions;
  const item=(await generate([feature])).items[0];expect(linkedStatuses(item,'pulse')).toEqual(['blinded']);
});

test('operation effects: two independent attacks may each infer the same status',async()=>{
  const first='Melee Weapon Attack: +4 to hit. Hit: the target is Poisoned for 1 minute.';
  const second='Ranged Weapon Attack: +4 to hit. Hit: the target is Poisoned for 1 minute.';
  const feature={name:'Two strikes',description:first+' '+second,sourceOperations:[
    {id:'first',name:'First',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:4},damage:[{formula:'1d4',type:'piercing',relationship:'base'}],proof:{attack:'Melee Weapon Attack: +4 to hit.'}},
    {id:'second',name:'Second',type:'attack',relationship:'alternative',attack:{type:'rwak',toHit:4},damage:[{formula:'1d4',type:'piercing',relationship:'base'}],proof:{attack:'Ranged Weapon Attack: +4 to hit.'}},
  ]};
  const item=(await generate([feature])).items[0];expect(linkedStatuses(item,'first')).toEqual(['poisoned']);expect(linkedStatuses(item,'second')).toEqual(['poisoned']);expect(item.effects).toHaveLength(2);
});

test('operation effects: an unrelated Item stays byte-equivalent beside a persistent multi-operation feature',async()=>{
  const control={name:'Independent strike',description:'Melee Weapon Attack: +4 to hit. Hit: 5 (1d4 + 3) Piercing damage.',attack:{type:'mwak',toHit:4,reach:5},damage:[{formula:'1d4+3',type:'piercing',relationship:'base'}]};
  const before=(await generate([control])).items[0],after=(await generate([control,persistentFeature('While enclosed',['Restrained'])])).items[0];
  expect(after).toEqual(before);
});

const freshRoot=process.env.FORGE_SIX_FRESH_ROOT;
test.skipIf(!freshRoot)('operation effects: actual frozen Behir keeps entry conditions and exit Prone away from acid',async()=>{
  const analysis=JSON.parse(readFileSync(join(freshRoot!,'results/behir/analysis.json'),'utf8'));
  const actor=await generate([],{ir:analysis.ir,source:analysis.rawSource}),item=actor.items.find((entry:any)=>entry.name==='Swallow');
  expect(item).toBeDefined();expect(linkedStatuses(item,'operation-1').sort()).toEqual(['blinded','restrained']);
  expect(linkedStatuses(item,'operation-2')).toEqual([]);expect(linkedStatuses(item,'operation-3')).toEqual([]);
  expect(opActivity(item,'operation-2')).toMatchObject({type:'damage',activation:{type:'special'},damage:{parts:[{number:6,denomination:6,types:['acid']}]}});
  expect(opActivity(item,'operation-3')).toMatchObject({type:'save',save:{ability:['con'],dc:{formula:'14'}}});
  const exit=acts(item).find(activity=>activity.flags?.fvttJsonGenerator?.sourceConditionStage);
  expect(exit).toBeDefined();expect(exit.type).toBe('utility');expect(exit.consumption.targets).toEqual([]);
  expect(exit.effects.flatMap((link:any)=>item.effects.find((effect:any)=>effect._id===link._id).statuses)).toEqual(['prone']);
  expect(item.effects).toHaveLength(2);
  for(const effect of item.effects)expect(effect.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');
});

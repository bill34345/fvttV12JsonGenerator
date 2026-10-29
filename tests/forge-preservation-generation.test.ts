import {expect,test} from 'bun:test';
import yaml from 'js-yaml';
import {analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {buildForgeActorRequest,convertFinalActorSource} from '@fvtt-json-generator/forge-browser-runtime';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import type {ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';

const noCall=async():Promise<never>=>{throw Error('No model or network calls in preservation tests.');};
const provider={providerName:'preservation-fixture',extractionModel:'none',reviewModel:'disabled',discover:noCall,extract:noCall,repair:noCall,review:noCall};
const input={sourceName:'Preserved activities',displayName:'Preserved activities',requestId:'preserved-activities',sourceScope:'single' as const,sourceId:'actor:v1:22c247c7-3074-4c46-8989-c562c5622aa4' as ForgeSourceId,fvttVersion:'14.368',systemVersion:'5.3.3'};
function proposal(features:any[]){
  const ir:any=buildValidLurkerIr();
  ir.creature.traits=[];ir.creature.actions=features;ir.creature.bonusActions=[];ir.creature.reactions=[];ir.creature.legendaryActions=[];ir.claims=[];ir.coverage=[];
  return ir;
}
async function generate(features:any[]){
  const source=LURKER_SOURCE+'\n'+features.map(feature=>feature.description).join('\n'),current={...input,source};
  const analysis=analyzeBrowserActorIntakeDraft(current,proposal(features),provider);
  const generated=await generateBrowserActorIntakeCandidate(current,analysis,provider);
  expect(generated.candidateAvailable).toBe(true);
  const actor=(generated.candidateResponse as any)?.result?.artifact;expect(actor).toBeDefined();
  return {actor,analysis,generated,source};
}
const activities=(item:any)=>Object.values<any>(item.system.activities);
const states=(item:any)=>item.effects.flatMap((effect:any)=>effect.statuses);
function links(item:any,status:string){
  const effects=item.effects.filter((effect:any)=>effect.statuses.includes(status));expect(effects.length).toBeGreaterThan(0);
  const ids=new Set(effects.map((effect:any)=>effect._id));
  return activities(item).filter(activity=>activity.effects.some((link:any)=>ids.has(link._id)));
}

test('preservation: existing state target qualifiers do not create new effects',async()=>{
  for(const description of [
    '将30尺内因其另一个动作陷入束缚的一名生物向直线拉近至多25尺。',
    '将陷入中毒状态的一名生物移动10尺。',
    '拉近受到恐慌状态影响的一名生物。',
    'The creature pulls a target that has the Frightened condition 10 feet closer.',
    'The target no longer has the Poisoned condition.',
    'It moves a creature who is Restrained by its web.',
    'Hit: 8 piercing damage, or 12 piercing damage if the target is Grappled.',
    '命中：造成穿刺伤害，若目标已经陷入束缚状态则伤害增加。',
  ]){
    const {actor}=await generate([{name:'Target movement',description,executionMode:'gm-manual',activityType:'utility'}]);
    const item=actor.items[0];expect(item.effects).toEqual([]);expect(activities(item)).toHaveLength(1);
    expect(activities(item)[0].type).toBe('utility');expect(activities(item)[0].effects??[]).toEqual([]);
  }
});

test('preservation: real applying predicates still create their declared state templates',async()=>{
  for(const[description,status]of [
    ['目标陷入中毒状态，直至其下个回合结束。','poisoned'],
    ['目标受到恐慌状态影响，直至其下个回合结束。','frightened'],
    ['The target has the Prone condition for 1 minute.','prone'],
    ['The target becomes Restrained until the web is destroyed.','restrained'],
  ] as const){
    const {actor}=await generate([{name:'Apply state',description,executionMode:'gm-manual',activityType:'utility'}]);
    const item=actor.items[0];expect(states(item)).toEqual([status]);expect(links(item,status).map(activity=>activity.type)).toEqual(['utility']);
  }
});

test('preservation: modern coordinated conditions share the declared failed Save and lifecycle',async()=>{
  for(const[consequence,declared,seconds]of [
    ['the target has the Frightened and Incapacitated conditions until the start of its next turn.',['frightened','incapacitated'],undefined],
    ['the creature has the Poisoned and Blinded conditions for 1 minute.',['poisoned','blinded'],60],
    ['the target has the Prone, Frightened, and Incapacitated conditions until it escapes.',['prone','frightened','incapacitated'],undefined],
  ] as const){
    const description='Wisdom Saving Throw: DC 15. Failure: '+consequence;
    const {actor}=await generate([{name:'Coordinated result',description,sourceOperations:[{id:'save',name:'Save',type:'save',relationship:'primary',save:{dc:15,abilities:['wis'],choice:'single',outcome:'none'},proof:{save:'Wisdom Saving Throw: DC 15.'}}]}]);
    const item=actor.items[0];expect([...new Set(states(item))].sort()).toEqual([...declared].sort());expect(activities(item)).toHaveLength(1);
    for(const status of declared){
      const owner=links(item,status);expect(owner).toHaveLength(1);expect(owner[0]).toMatchObject({type:'save',save:{ability:['wis'],dc:{formula:'15'}}});
      const effect=item.effects.find((entry:any)=>entry.statuses.includes(status));expect(owner[0].effects).toContainEqual({_id:effect._id,onSave:false});
      if(seconds!==undefined)expect(effect.duration.seconds).toBe(seconds);
      else expect(effect.description).toContain(consequence);
    }
  }
});

function damageChoice(extra:Record<string,unknown>={}){
  const attack='Melee Attack Roll: +5, reach 5 ft.',damage='Hit: 6 (1d6+3) piercing damage, or 10 (2d6+3) piercing damage if the target is Grappled.';
  return{name:'Choice strike',description:attack+' '+damage,sourceOperations:[
    {id:'attack',name:'Strike',type:'attack',relationship:'primary',attack:{type:'melee',toHit:5,reach:5},damage:[{formula:'1d6+3',type:'piercing',relationship:'base'}],proof:{attack,damage:[damage]}},
    {id:'replacement',name:'Replacement',type:'damage',relationship:'alternative',condition:'Only against the already Grappled target.',damage:[{formula:'2d6+3',type:'piercing',relationship:'replacement'}],proof:{damage:[damage]},...extra},
  ]};
}

test('preservation: pure damage choices retain both modes without an extra state',async()=>{
  const {actor}=await generate([damageChoice()]);
  const item=actor.items[0];expect(item.effects).toEqual([]);expect(activities(item)).toHaveLength(3);
  expect(activities(item).map(activity=>activity.flags.fvttJsonGenerator.sourceOperation.damageMode).filter(Boolean)).toEqual(['ordinary','alternative']);
});

test('preservation: independently declared replacement states retain their own activity and qualifier',async()=>{
  for(const extra of [
    {appliedConditions:[{statuses:['prone'],condition:'Only the replacement makes the target Prone.'}]},
    {failureStatuses:['blinded']},
    {appliedConditions:[{statuses:['poisoned'],duration:'1 minute',condition:'Only after this replacement damage.'}]},
  ]){
    const {actor,analysis,generated,source}=await generate([damageChoice(extra)]),item=actor.items[0];
    const state=extra.failureStatuses?.[0]??extra.appliedConditions![0]!.statuses[0]!;
    const owner=links(item,state);expect(owner).toHaveLength(1);expect(owner[0].type).toBe('damage');
    expect(owner[0].flags.fvttJsonGenerator.sourceOperation.id).toBe('replacement');
    expect(activities(item).filter(activity=>activity.flags.fvttJsonGenerator.sourceOperation.id==='attack').every(activity=>activity.effects.length===0)).toBe(true);
    expect(generated.findings.filter(finding=>finding.code==='ACTOR_SOURCE_OPERATION_STATUS_DRIFT')).toEqual([]);
    const corrupted=structuredClone(actor);for(const activity of activities(corrupted.items[0]))activity.effects=[];
    expect(verifyMonsterIntake(source,analysis.ir!,generated.finalSource!,corrupted).findings.some(finding=>finding.code==='ACTOR_SOURCE_OPERATION_STATUS_DRIFT'&&finding.path.includes('replacement'))).toBe(true);
  }
});

test('preservation: mixed canonical child Saves retain their effects and do not consume the parent pool twice',async()=>{
  const description='Melee Weapon Attack: +5 to hit. Hit: 6 (1d6+3) piercing damage and the target is Prone.';
  const feature={name:'Parent strike',description,executionMode:'native-with-gm',nativeRuleText:description,attack:{type:'mwak',toHit:5},damage:[{formula:'1d6+3',type:'piercing',relationship:'base'}],uses:{max:3,period:'day'},appliedConditions:[{statuses:['prone']}],sourceOperations:[{id:'strike',name:'Strike',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:5},damage:[{formula:'1d6+3',type:'piercing',relationship:'base'}],proof:{attack:'Melee Weapon Attack: +5 to hit.'}}]};
  const source=LURKER_SOURCE+'\n'+description,ir=proposal([feature]);
  const document=yaml.load(renderMonsterIntakeMarkdown(ir,source).replace(/^---\s*\n/u,'').replace(/\n---\s*$/u,'')) as any;
  expect(document.动作[0].sourceOperations).toHaveLength(1);
  document.动作[0].子活动=[{名称:'Follow-up Save',类型:'save',触发:'special',DC:15,属性:'体质',描述:'The target is Frightened for 1 minute.',内嵌效果:[{类型:'frightened',状态:['frightened'],描述:'The target is Frightened for 1 minute.',条件:'Only after the hit.',持续:'1 minute'}]}];
  const children:any[]=[];
  for(const withOperations of [true,false]){
    const current=structuredClone(document);if(!withOperations)delete current.动作[0].sourceOperations;
    const markdown='---\n'+yaml.dump(current,{lineWidth:-1})+'---\n';
    const response=await convertFinalActorSource(buildForgeActorRequest({...input,content:markdown}));
    expect('result'in response).toBe(true);if(!('result'in response))throw Error('Expected Actor');
    const actor:any=response.result.artifact,item=actor.items[0],list=activities(item),save=list.find(activity=>activity.type==='save');
    expect(list).toHaveLength(2);expect(save).toMatchObject({name:'Follow-up Save',activation:{type:'special'},save:{ability:['con'],dc:{formula:'15'}},consumption:{targets:[]}});
    expect(save.description.chatFlavor).toContain('The target is Frightened for 1 minute.');expect(save.description.chatFlavor).not.toContain('piercing damage');
    expect(links(item,'prone').map(activity=>activity.type)).toEqual(['attack']);expect(links(item,'frightened')).toEqual([save]);
    const fear=item.effects.find((effect:any)=>effect.statuses.includes('frightened'));expect(fear.duration.seconds).toBe(60);expect(fear.flags.fvttJsonGenerator.conditionLifecycle.condition).toContain('Only after the hit.');
    expect(String(item.system.uses.max)).toBe('3');expect(list.filter(activity=>activity.consumption.targets.length)).toHaveLength(1);
    expect(save.flags.fvttJsonGenerator.sourceResourceRole).toBe('follow-up');
    children.push({activity:save,effect:fear});
  }
  expect(children[1]).toEqual(children[0]);
});

test('preservation: an unrelated ordinary attack retains its complete single activity',async()=>{
  const {actor}=await generate([{name:'Ordinary strike',description:'Melee Weapon Attack: +4 to hit. Hit: 7 (1d8+3) slashing damage.',sourceOperations:[{id:'strike',name:'Ordinary strike',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:4},damage:[{formula:'1d8+3',type:'slashing',relationship:'base'}],proof:{}}]}]);
  const item=actor.items[0];expect(item.effects).toEqual([]);expect(activities(item)).toHaveLength(1);
  expect(activities(item)[0]).toMatchObject({type:'attack',attack:{bonus:'4'},damage:{parts:[{number:1,denomination:8,bonus:'3',types:['slashing']}]},consumption:{targets:[]}});
});

test('preservation: flat and operation damage aliases share one roll while distinct damage remains available',async()=>{
  for(const[damage,expectedCount,expectedExtra]of [
    [{formula:'1d6+3',type:'piercing'},1,undefined],
    [{formula:'1d6+3',type:'fire'},2,{number:1,denomination:6,bonus:'3',types:['fire']}],
    [{formula:'2d6+3',type:'piercing'},2,{number:2,denomination:6,bonus:'3',types:['piercing']}],
  ] as const){
    const description='Melee Weapon Attack: +5 to hit. Hit: 6 (1d6+3) piercing damage.';
    const feature={name:'Mixed damage',description,executionMode:'native-with-gm',nativeRuleText:description,attack:{type:'mwak',toHit:5},damage:[damage],sourceOperations:[{id:'strike',name:'Strike',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:5},damage:[{formula:'1d6+3',type:'piercing',relationship:'base'}],proof:{}}]};
    const source=LURKER_SOURCE+'\n'+description,document=yaml.load(renderMonsterIntakeMarkdown(proposal([feature]),source).replace(/^---\s*\n/u,'').replace(/\n---\s*$/u,'')) as any;
    expect(document.动作[0].sourceOperations[0].damage[0].type).toBe('piercing');
    expect(document.动作[0].伤害[0].类型).toBe(damage.type);
    document.动作[0].伤害[0].类型=damage.type==='fire'?'火焰':'穿刺';
    const response=await convertFinalActorSource(buildForgeActorRequest({...input,content:'---\n'+yaml.dump(document,{lineWidth:-1})+'---\n'}));
    expect('result'in response).toBe(true);if(!('result'in response))throw Error('Expected Actor');
    const item=(response.result.artifact as any).items[0],list=activities(item);
    expect(list).toHaveLength(expectedCount);expect(list.find(activity=>activity.type==='attack').damage.parts[0]).toMatchObject({number:1,denomination:6,bonus:'3',types:['piercing']});
    if(expectedExtra)expect(list.find(activity=>activity.type==='damage').damage.parts[0]).toMatchObject(expectedExtra);
    expect(item.effects).toEqual([]);
  }
});

test('preservation: parent and child Saves keep separate states even when the same status has different lifecycles',async()=>{
  const description='Wisdom Saving Throw: DC 15. Failure: the target is Prone for 1 minute.';
  const feature={name:'Parent Save',description,executionMode:'native-with-gm',nativeRuleText:description,activityType:'save',save:{dc:15,ability:'wis'},uses:{max:3,period:'day'},appliedConditions:[{statuses:['prone'],duration:'1 minute'}],sourceOperations:[{id:'parent-save',name:'Parent Save',type:'save',relationship:'primary',save:{dc:15,abilities:['wis'],choice:'single',outcome:'none'},proof:{save:'Wisdom Saving Throw: DC 15.'}}]};
  const source=LURKER_SOURCE+'\n'+description;
  const document=yaml.load(renderMonsterIntakeMarkdown(proposal([feature]),source).replace(/^---\s*\n/u,'').replace(/\n---\s*$/u,'')) as any;
  expect(document.动作[0].sourceOperations).toHaveLength(1);
  for(const childStatus of ['frightened','prone'])for(const withOperations of [true,false]){
    const current=structuredClone(document),childDescription=`The target is ${childStatus} for 2 rounds.`;
    if(!withOperations)delete current.动作[0].sourceOperations;
    current.动作[0].子活动=[{名称:'Child Save',类型:'save',触发:'special',DC:12,属性:'体质',描述:childDescription,内嵌效果:[{类型:childStatus,状态:[childStatus],描述:childDescription,条件:'Only after the parent Save.',持续:'2 rounds'}]}];
    const response=await convertFinalActorSource(buildForgeActorRequest({...input,content:'---\n'+yaml.dump(current,{lineWidth:-1})+'---\n'}));
    expect('result'in response).toBe(true);if(!('result'in response))throw Error('Expected Actor');
    const actor:any=response.result.artifact,item=actor.items[0],list=activities(item);
    const parent=list.find(activity=>activity.save?.ability?.includes('wis')),child=list.find(activity=>activity.name==='Child Save');
    expect(list).toHaveLength(2);expect(item.effects).toHaveLength(2);
    expect(parent).toMatchObject({type:'save',save:{dc:{formula:'15'},ability:['wis']}});
    expect(child).toMatchObject({type:'save',save:{dc:{formula:'12'},ability:['con']},consumption:{targets:[]}});
    expect(parent.effects).toHaveLength(1);expect(child.effects).toHaveLength(1);expect(parent.effects[0]._id).not.toBe(child.effects[0]._id);
    const parentEffect=item.effects.find((effect:any)=>effect._id===parent.effects[0]._id),childEffect=item.effects.find((effect:any)=>effect._id===child.effects[0]._id);
    expect(parentEffect.statuses).toEqual(['prone']);expect(parentEffect.duration.seconds).toBe(60);expect(parentEffect.description).not.toContain('Only after the parent Save.');
    expect(childEffect.statuses).toEqual([childStatus]);expect(childEffect.duration.rounds).toBe(2);expect(childEffect.flags.fvttJsonGenerator.conditionLifecycle.condition).toBe('Only after the parent Save.');
    expect(parent.effects[0].onSave).toBe(false);expect(child.effects[0].onSave).toBe(false);
    expect(list.filter(activity=>activity.consumption?.targets?.length)).toHaveLength(1);
  }
});

test('preservation: a qualified target can receive a different state from the main applying predicate',async()=>{
  for(const[description,declared]of [
    ['The target that is Grappled has the Restrained condition until the grapple ends.',['restrained']],
    ['The target that is Grappled becomes Restrained until the grapple ends.',['restrained']],
    ['The target that has the Poisoned condition has the Restrained condition until the poison ends.',['restrained']],
    ['A creature which has the Poisoned condition becomes Prone for 1 minute.',['prone']],
    ['A target who is already Restrained has the Frightened and Incapacitated conditions until it escapes.',['frightened','incapacitated']],
  ] as const){
    const {actor}=await generate([{name:'Qualified application',description,executionMode:'gm-manual',activityType:'utility'}]),item=actor.items[0];
    expect([...new Set(states(item))].sort()).toEqual([...declared].sort());
    for(const effect of item.effects){expect(effect.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(effect.flags.fvttJsonGenerator.conditionLifecycle.condition).toContain(description);}
    for(const status of declared)expect(links(item,status).map(activity=>activity.type)).toEqual(['utility']);
  }
});

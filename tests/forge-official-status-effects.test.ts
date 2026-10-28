import {expect,test,setSystemTime} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {buildForgeItemRequest,convertFinalItemSource} from '@fvtt-json-generator/forge-browser-runtime';
import type {ForgeSourceId,ForgeItemSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';

const noCall=async():Promise<never>=>{throw Error('Model requests and review are forbidden');};
const provider={providerName:'frozen-statuses',extractionModel:'none',reviewModel:'disabled',discover:noCall,extract:noCall,repair:noCall,review:noCall};
async function generate(features:any[],options:{ir?:any;source?:string}={}){
  const ir=options.ir??buildValidLurkerIr();if(!options.ir){ir.creature.traits=[];ir.creature.actions=features;ir.creature.bonusActions=[];ir.creature.reactions=[];ir.creature.legendaryActions=[];ir.claims=[];ir.coverage=[];}
  const source=options.source??LURKER_SOURCE+'\n'+features.map(feature=>feature.description).join('\n');
  const input={source,sourceName:'Official status projection',sourceScope:'single' as const,requestId:'official-state-test',sourceId:'actor:v1:339870d7-4c56-43d9-9104-abc743d70022' as ForgeSourceId,fvttVersion:'14.368',systemVersion:'5.3.3'};
  const analysis=analyzeBrowserActorIntakeDraft(input,ir,provider),result=await generateBrowserActorIntakeCandidate(input,analysis,provider);
  expect(result.candidateAvailable).toBe(true);const actor=(result.candidateResponse as any)?.result?.artifact;expect(actor).toBeDefined();
  return{actor,result,analysis};
}
const acts=(item:any)=>Object.values<any>(item.system.activities);
function effect(item:any,status:string){const found=item.effects.find((entry:any)=>entry.statuses.includes(status));expect(found).toBeDefined();return found;}
function linked(item:any,state:any){return acts(item).filter(activity=>activity.effects?.some((link:any)=>link._id===state._id));}
function nativeTemplate(state:any){expect(state).toMatchObject({type:'base',transfer:false,disabled:false,changes:[]});expect(state._id).toMatch(/^[A-Za-z0-9]{16}$/u);expect(state.img).toContain('statuses/');expect(state.flags.fvttJsonGenerator.conditionLifecycle.version).toBe(1);expect(['native','gm']).toContain(state.flags.fvttJsonGenerator.conditionLifecycle.mode);}

test('official effects: an ordinary native hit has one optional state on its Attack and preserves all damage and resource data',async()=>{
  const text='Melee Weapon Attack: +5 to hit, reach 5 ft. Hit: 6 (1d6+3) piercing damage and the target is Prone.';
  const {actor,result}=await generate([{name:'Strike',description:text,uses:{max:3,period:'day'},sourceOperations:[{id:'strike',name:'Strike',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:5,reach:5},damage:[{formula:'1d6+3',type:'piercing',relationship:'base'}],appliedConditions:[{statuses:['prone']}],proof:{attack:'Melee Weapon Attack: +5 to hit, reach 5 ft.'}}]}]);
  const item=actor.items[0],state=effect(item,'prone');nativeTemplate(state);expect(item.effects).toHaveLength(1);expect(state.name).toBe('倒地 Prone');
  const [activity]=linked(item,state);expect(activity.type).toBe('attack');expect(activity.effects).toEqual([{_id:state._id}]);expect(state.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('native');
  expect(activity.attack.bonus).toBe('5');expect(activity.damage.parts).toHaveLength(1);expect(item.system.uses.max).toBe('3');expect(activity.consumption.targets).toHaveLength(1);
  expect(result.findings.filter(finding=>/CONDITION|STATUS_DRIFT|COUNT_DRIFT/u.test(finding.code))).toEqual([]);
});

test('official effects: a follow-up failed Save owns its timed repeat-save template while the earlier Attack keeps only its hit state',async()=>{
  const attack='Melee Weapon Attack: +5 to hit. Hit: the target is Prone.',save='Wisdom Saving Throw: DC 14. Failure: the target is Frightened for 1 minute. The target repeats the save at the end of each turn, ending the effect on success.';
  const {actor}=await generate([{name:'Strike and fear',description:attack+' '+save,sourceOperations:[
    {id:'hit',name:'Strike',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:5},damage:[{formula:'1d6+3',type:'piercing',relationship:'base'}],proof:{attack:'Melee Weapon Attack: +5 to hit.'}},
    {id:'fear',name:'Fear save',type:'save',relationship:'follow-up',save:{dc:14,abilities:['wis'],choice:'single',outcome:'none'},appliedConditions:[{statuses:['frightened'],duration:'1 minute',condition:'The target repeats the save at the end of each turn, ending the effect on success.'}],proof:{save:'Wisdom Saving Throw: DC 14.'}},
  ]}]);
  const item=actor.items[0],prone=effect(item,'prone'),fear=effect(item,'frightened');nativeTemplate(fear);
  expect(linked(item,prone).map(activity=>activity.type)).toEqual(['attack']);expect(linked(item,fear).map(activity=>activity.type)).toEqual(['save']);
  expect(fear.duration.seconds).toBe(60);expect(fear.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(fear.description).toContain('ending the effect on success');
  const saveActivity=linked(item,fear)[0];expect(saveActivity.effects).toEqual([{_id:fear._id,onSave:false}]);expect(saveActivity.save.dc.formula).toBe('14');expect(saveActivity.consumption.targets).toEqual([]);
});

test('official effects: feature-level same-sentence states follow their own Hit or Save clause',async()=>{
  for(const[rule,proneOwner,fearOwner]of[
    ['Hit: the target is Prone and must succeed on a DC 14 Wisdom saving throw or be Frightened.','attack','save'],
    ['Hit: the target is Frightened and must succeed on a DC 14 Wisdom saving throw or be Prone.','save','attack'],
    ['Hit: the target is Prone and Frightened, and must succeed on a DC 14 Wisdom saving throw to resist the extra damage.','attack','attack'],
  ] as const){
    const description='Melee Weapon Attack: +5 to hit. '+rule;
    const {actor,result}=await generate([{name:'Same sentence states',description,appliedConditions:[{statuses:['prone']},{statuses:['frightened']}],sourceOperations:[
      {id:'hit',name:'Strike',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:5},damage:[{formula:'1d6+3',type:'piercing',relationship:'base'},{formula:'1d4',type:'fire',relationship:'additional'}],proof:{attack:'Melee Weapon Attack: +5 to hit.'}},
      {id:'follow-up',name:'Follow-up Save',type:'save',relationship:'follow-up',save:{dc:14,abilities:['wis'],choice:'single',outcome:'none'},proof:{save:'must succeed on a DC 14 Wisdom saving throw'}},
    ]}]);
    const item=actor.items[0],activities=acts(item),attack=activities.find(activity=>activity.type==='attack'),save=activities.find(activity=>activity.type==='save');
    expect(activities.map(activity=>activity.type)).toEqual(['attack','save']);expect(attack.attack.bonus).toBe('5');expect(attack.damage.parts).toHaveLength(2);expect(save.save).toMatchObject({ability:['wis'],dc:{formula:'14'}});expect(save.consumption.targets).toEqual([]);
    expect(item.effects).toHaveLength(2);
    for(const[status,owner]of[['prone',proneOwner],['frightened',fearOwner]] as const){const state=effect(item,status);nativeTemplate(state);expect(linked(item,state).map(activity=>activity.type)).toEqual([owner]);expect(linked(item,state)[0].effects).toContainEqual({_id:state._id,...(owner==='save'?{onSave:false}:{})});}
    expect(result.findings.filter(finding=>/CONDITION|STATUS_DRIFT|COUNT_DRIFT/u.test(finding.code))).toEqual([]);
  }
});

test('official effects: a neutral GM hit puts its declared state on post-hit damage, never its attack roll',async()=>{
  const {actor}=await generate([{name:'Neutral',description:'Melee Attack Roll: +4. Hit: the target is Poisoned.',sourceOperations:[{name:'Neutral',type:'attack',relationship:'primary',attack:{type:'melee',toHit:4},damage:[{formula:'2d6',type:'poison',relationship:'base'}],failureStatuses:['poisoned'],proof:{}}]}]);
  const item=actor.items[0],state=effect(item,'poisoned');nativeTemplate(state);expect(state.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');
  expect(linked(item,state).map(activity=>activity.flags.fvttJsonGenerator.sourceOperation.role)).toEqual(['damage']);
  expect(acts(item).find(activity=>activity.flags?.fvttJsonGenerator?.sourceOperation?.role==='attack-roll')?.effects).toEqual([]);
});

test('official effects: existing flat canonical Save conditions and missing old condition fields both retain available templates',async()=>{
  for(const explicit of [true,false]){
    const {actor,result}=await generate([{name:'Flat poison',description:'Constitution Saving Throw: DC 14. Failure: the target is Poisoned for 1 minute.',activityType:'save',save:{dc:14,ability:'con'},...(explicit?{appliedConditions:[{statuses:['poisoned'],duration:'1 minute'}]}:{})}]);
    const item=actor.items[0],state=effect(item,'poisoned');nativeTemplate(state);expect(state.duration.seconds).toBe(60);expect(linked(item,state).map(activity=>activity.type)).toEqual(['save']);
    expect(linked(item,state)[0].effects).toContainEqual({_id:state._id,onSave:false});expect(result.findings.filter(finding=>finding.code==='GEN_CONDITION_LIFECYCLE_INVALID')).toEqual([]);
  }
});

test('official effects: an existing feature-level qualified state is not erased or duplicated by its source-operation carrier',async()=>{
  const {actor}=await generate([{name:'Existing qualified effect',description:'Melee Weapon Attack: +4. Hit: the target is Poisoned for 1 minute, ending early when the target takes damage.',appliedConditions:[{statuses:['poisoned'],duration:'1 minute',condition:'ends early when the target takes damage'}],sourceOperations:[{name:'Strike',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:4},damage:[{formula:'1d4',type:'piercing',relationship:'base'}],proof:{}}]}]);
  const item=actor.items[0],state=effect(item,'poisoned');expect(item.effects).toHaveLength(1);expect(state.duration.seconds).toBe(60);expect(state.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(state.description).toContain('ends early when the target takes damage');expect(linked(item,state).map(activity=>activity.type)).toEqual(['attack']);
});

test('official effects: an explicit or old unstructured state on a GM rule uses its existing Utility without inventing a roll',async()=>{
  for(const explicit of [true,false]){
    const description='A Huge or smaller creature adhered to the surface also has the Grappled condition (escape DC 13) until it escapes.';
    const {actor,result}=await generate([{name:'Adhesive rule',description,activityType:'utility',executionMode:'gm-manual',...(explicit?{appliedConditions:[{statuses:['grappled'],escapeDc:13,condition:'until it escapes'}]}:{})}]);
    const item=actor.items[0],state=effect(item,'grappled');nativeTemplate(state);expect(acts(item)).toHaveLength(1);expect(linked(item,state)[0].type).toBe('utility');expect(linked(item,state)[0].effects).toEqual([{_id:state._id}]);
    expect(state.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(state.description).toContain('escape DC 13');expect(acts(item).some(activity=>activity.attack||activity.save||activity.roll?.formula)).toBe(false);
    expect(result.findings.filter(finding=>/ACTOR_MANUAL_RULE|GEN_CONDITION/u.test(finding.code))).toEqual([]);
  }
});

test('official effects: distinct failed-save stages retain separate templates and their own activity links',async()=>{
  const first='First Wisdom Saving Throw: DC 13. On a failed save, the target is Restrained.',second='Second Constitution Saving Throw: DC 15. On a second failed save, the target becomes Petrified until freed.';
  const {actor}=await generate([{name:'Stages',description:first+' '+second,sourceOperations:[
    {id:'first',name:'First save',type:'save',relationship:'primary',save:{dc:13,abilities:['wis'],choice:'single',outcome:'none'},proof:{save:'First Wisdom Saving Throw: DC 13.'}},
    {id:'second',name:'Second save',type:'save',relationship:'follow-up',condition:'Only after the first failed Save',save:{dc:15,abilities:['con'],choice:'single',outcome:'none'},proof:{save:'Second Constitution Saving Throw: DC 15.'}},
  ]}]);
  const item=actor.items[0],firstState=effect(item,'restrained'),secondState=effect(item,'petrified');
  expect(linked(item,firstState).map(activity=>activity.name)).toEqual(['First save']);expect(linked(item,secondState).map(activity=>activity.name)).toEqual(['Second save']);
  expect(secondState.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(secondState.description).toContain('Only after the first failed Save');
  expect(firstState.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(secondState.statuses).toEqual(['petrified','incapacitated']);
});

test('official effects: First Failure and Second Failure keep both templates GM-owned on the one declared Save',async()=>{
  const description='Petrifying Gaze (Recharge 5–6). Constitution Saving \r\nThrow: DC 13, each creature in a 30-foot Cone. If the \r\nmedusa sees its reflection in the Cone, the medusa \r\nmust make this save. First Failure: The target has the \r\nRestrained condition and repeats the save at the end of \r\nits next turn if it is still Restrained, ending the effect on \r\nitself on a success. Second Failure: The target has the \r\nPetrified condition instead of the Restrained condition.\r\n';
  for(const explicit of [false,true]){
    const {actor,result}=await generate([{name:'Staged gaze',description,recharge:[5,6],sourceOperations:[{id:'gaze-save',name:'Gaze Save',type:'save',relationship:'primary',save:{dc:13,abilities:['con'],choice:'single',outcome:'none'},aoe:{shape:'cone',radius:30},proof:{save:'Constitution Saving \r\nThrow: DC 13, each creature in a 30-foot Cone.'},...(explicit?{appliedConditions:[{statuses:['restrained']},{statuses:['petrified']}]}:{})}]}]);
    const item=actor.items[0],activities=acts(item);expect(activities).toHaveLength(1);expect(activities[0]).toMatchObject({type:'save',save:{dc:{formula:'13'},ability:['con']}});
    expect(item.effects).toHaveLength(2);
    for(const[status,stage]of [['restrained','First Failure:'],['petrified','Second Failure:']] as const){
      const state=effect(item,status);nativeTemplate(state);expect(state.flags.fvttJsonGenerator.conditionLifecycle).toMatchObject({mode:'gm',staged:true});expect(state.flags.fvttJsonGenerator.conditionLifecycle.condition).toContain(stage);expect(state.description).toContain(description.slice(description.indexOf('Constitution')).trim());expect(linked(item,state)).toEqual(activities);expect(activities[0].effects).toContainEqual({_id:state._id,onSave:false});
    }
    expect(effect(item,'petrified').statuses).toEqual(['petrified','incapacitated']);expect(activities[0].effects).toHaveLength(2);expect(item.system.uses).toMatchObject({max:'1',recovery:[{period:'recharge',formula:'5'}]});
    expect(result.findings.filter(finding=>/CONDITION|STATUS_DRIFT|COUNT_DRIFT/u.test(finding.code))).toEqual([]);
  }
});

test('official effects: a modern HAS-condition failed Save retains its template and numeric duration',async()=>{
  const {actor}=await generate([{name:'Modern save',description:'Wisdom Saving Throw: DC 14. Failure: the target has the Charmed condition for 1 minute.',sourceOperations:[{name:'Save',type:'save',relationship:'primary',save:{dc:14,abilities:['wis'],choice:'single',outcome:'none'},proof:{save:'Wisdom Saving Throw: DC 14.'}}]}]);
  const item=actor.items[0],state=effect(item,'charmed');nativeTemplate(state);expect(state.duration.seconds).toBe(60);expect(linked(item,state)[0].type).toBe('save');expect(linked(item,state)[0].effects).toEqual([{_id:state._id,onSave:false}]);
});

test('official effects: unconscious includes only its official same-lifecycle implication, not its separate Prone rider',async()=>{
  const {actor}=await generate([{name:'Unconscious result',description:'Wisdom Saving Throw: DC 14. Failure: the target is Unconscious until it takes damage.',sourceOperations:[{name:'Save',type:'save',relationship:'primary',save:{dc:14,abilities:['wis'],choice:'single',outcome:'none'},appliedConditions:[{statuses:['unconscious'],condition:'until it takes damage'}],proof:{}}]}]);
  const item=actor.items[0],state=effect(item,'unconscious');expect(state.statuses).toEqual(['unconscious','incapacitated']);expect(state.statuses).not.toContain('prone');expect(state.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(linked(item,state)[0].effects).toEqual([{_id:state._id,onSave:false}]);
});

test('official effects: a conditional death result remains a GM-selectable failed-save template without changing target HP',async()=>{
  const {actor}=await generate([{name:'Conditional death',description:'Constitution Saving Throw: DC 14. Failure: the target dies if its hit point maximum is reduced to 0.',sourceOperations:[{name:'Save',type:'save',relationship:'primary',save:{dc:14,abilities:['con'],choice:'single',outcome:'none'},proof:{save:'Constitution Saving Throw: DC 14.'}}]}]);
  const item=actor.items[0],state=effect(item,'dead');nativeTemplate(state);expect(state.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(state.description).toContain('maximum is reduced to 0');expect(state.changes).toEqual([]);expect(linked(item,state)[0].effects).toEqual([{_id:state._id,onSave:false}]);
});

for(const description of ['If the target is Grappled, it takes extra damage.','The target is already Poisoned.','The target is immune to the Poisoned condition.','目标不再陷入中毒状态。','The creature has advantage on checks made to escape the grappled condition.','The target gains immunity to Exhaustion.','When the target dies, another creature gains temporary hit points.'])test('official effects: prerequisites, existing states, immunity and removal do not apply a new state: '+description,async()=>{
  const {actor}=await generate([{name:'No state application',description,sourceOperations:[{name:'Strike',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:4},damage:[{formula:'1d4',type:'piercing',relationship:'base'}],proof:{}}]}]);
  expect(actor.items[0].effects).toEqual([]);expect(acts(actor.items[0]).map(activity=>activity.type)).toEqual(['attack']);
});

test('official effects: exhaustion is an independent GM template with an optional source increase, without changing Actor exhaustion',async()=>{
  for(const exhaustionLevels of [2,undefined]){
    const {actor}=await generate([{name:'Exhausting save',description:'Constitution Saving Throw: DC 14. Failure: the target is Poisoned and gains Exhaustion.',sourceOperations:[{name:'Save',type:'save',relationship:'primary',save:{dc:14,abilities:['con'],choice:'single',outcome:'none'},appliedConditions:[{statuses:['poisoned','exhaustion'],...(exhaustionLevels?{exhaustionLevels}:{})}],proof:{}}]}]);
    const item=actor.items[0],state=effect(item,'exhaustion');nativeTemplate(state);expect(state.statuses).toEqual(['exhaustion']);expect(state.flags.fvttJsonGenerator.conditionLifecycle).toMatchObject({mode:'gm'});
    expect(state.flags.fvttJsonGenerator.conditionLifecycle.exhaustionLevels).toBe(exhaustionLevels);expect(state.flags.dnd5e?.exhaustionLevel).toBeUndefined();expect(actor.system.attributes.exhaustion??0).toBe(0);
    expect(linked(item,state)[0].effects).toContainEqual({_id:state._id,onSave:false});expect(effect(item,'poisoned').statuses).toEqual(['poisoned']);
  }
});

test('official effects: all fifteen official declared IDs and compatible Dead have bilingual names, native icons and failed-save links',async()=>{
  for(const[status,name]of[
    ['blinded','目盲 Blinded'],['charmed','魅惑 Charmed'],['deafened','耳聋 Deafened'],['exhaustion','力竭 Exhaustion'],
    ['frightened','恐慌 Frightened'],['grappled','受擒 Grappled'],['incapacitated','失能 Incapacitated'],['invisible','隐形 Invisible'],
    ['paralyzed','麻痹 Paralyzed'],['petrified','石化 Petrified'],['poisoned','中毒 Poisoned'],['prone','倒地 Prone'],
    ['restrained','束缚 Restrained'],['stunned','震慑 Stunned'],['unconscious','昏迷 Unconscious'],['dead','死亡 Dead'],
  ]){
    const {actor}=await generate([{name:'Declared official state',description:'Declared failed-save state.',sourceOperations:[{name:'Save',type:'save',relationship:'primary',save:{dc:14,abilities:['con'],choice:'single',outcome:'none'},appliedConditions:[{statuses:[status]}],proof:{}}]}]);
    const item=actor.items[0],state=effect(item,status!);nativeTemplate(state);expect(state.name).toBe(name);expect(state.img).toBe(`systems/dnd5e/icons/svg/statuses/${status}.svg`);
    expect(state.statuses).toContain(status);expect(new Set(state.statuses).size).toBe(state.statuses.length);expect(item.effects).toHaveLength(1);expect(linked(item,state)[0].effects).toEqual([{_id:state._id,onSave:false}]);
    if(['paralyzed','petrified','stunned','unconscious'].includes(status!))expect(state.statuses).toContain('incapacitated');
  }
});

test('official effects: unrelated independent Item output is identical before and after Actor template projection',async()=>{
  setSystemTime(new Date('2026-10-27T00:00:00Z'));
  try{
    const content=readFileSync('obsidian/dnd数据转fvttjson/input/items/骑士之盾.md','utf8'),request=buildForgeItemRequest({content,sourceId:'item:v1:339870d7-4c56-43d9-9104-abc743d70022' as ForgeItemSourceId,displayName:'Knight Shield',requestId:'status-unrelated-item',fvttVersion:'14.364',systemVersion:'5.3.3'});
    const before=await convertFinalItemSource(request);
    await generate([{name:'Actor state',description:'The target is Prone.',sourceOperations:[{name:'Save',type:'save',relationship:'primary',save:{dc:13,abilities:['str'],choice:'single',outcome:'none'},appliedConditions:[{statuses:['prone']}],proof:{}}]}]);
    const after=await convertFinalItemSource(request);expect(after).toEqual(before);expect('result'in after).toBe(true);
  }finally{setSystemTime();}
});

const frozen=process.env.FORGE_STATUS_FROZEN_ROOT;
test.skipIf(!frozen)('official effects: the actual Phase Spider first answer retains HP0 Poisoned/while-Poisoned Paralyzed as one one-hour optional template without inventing a Save',async()=>{
  const path=join(frozen!,'results','phase-spider','raw-answer.txt'),raw=readFileSync(path,'utf8'),ir=JSON.parse(raw),source=readFileSync(join(frozen!,'sources-r2','phase-spider.md'),'utf8');
  const {actor}=await generate([],{ir,source}),item=actor.items.find((item:any)=>item.name.includes('Bite')),state=effect(item,'poisoned');
  expect(state.statuses).toEqual(['poisoned','paralyzed','incapacitated']);expect(item.effects).toHaveLength(1);expect(state.duration.seconds).toBe(3600);expect(state.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');
  expect(state.description).toContain('生命值降至0');expect(state.description).toContain('中毒期间');expect(acts(item).some(activity=>activity.type==='save')).toBe(false);
  const damage=linked(item,state)[0];expect(damage.type).toBe('damage');expect(damage.damage.parts).toHaveLength(2);expect(acts(item).find(activity=>activity.roll)?.effects).toEqual([]);expect(readFileSync(path,'utf8')).toBe(raw);
});

const otyughFrozen=process.env.FORGE_STATUS_OTYUGH_ROOT;
test.skipIf(!otyughFrozen)('official effects: explicit operation status retains full source when its old proof cannot locate a scope',async()=>{
  const path=join(otyughFrozen!,'raw-answer.txt'),raw=readFileSync(path,'utf8'),ir=JSON.parse(raw),source=JSON.parse(readFileSync(join(otyughFrozen!,'analysis.json'),'utf8')).candidate.quote;
  const {actor}=await generate([],{ir,source}),bite=actor.items.find((item:any)=>item.name==='Bite'),state=effect(bite,'poisoned');
  expect(bite.effects).toHaveLength(1);expect(state.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(state.flags.fvttJsonGenerator.conditionLifecycle.sourceText).toContain('Whenever the Poisoned target finishes a Long Rest');
  expect(state.description).toContain('Constitution Saving Throw: DC 15.');expect(state.description).toContain('Success: The Poisoned condition ends.');expect(state.description).toContain('Hit Point maximum decreases by 5 (1d10)');
  expect(linked(bite,state).map(activity=>activity.flags.fvttJsonGenerator.sourceOperation.role)).toEqual(['damage']);
  expect(acts(bite).find(activity=>activity.type==='save')?.save).toMatchObject({ability:['con'],dc:{formula:'15'}});expect(acts(bite).find(activity=>activity.roll)?.effects).toEqual([]);expect(readFileSync(path,'utf8')).toBe(raw);
});

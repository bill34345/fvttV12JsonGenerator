import {describe,expect,test} from 'bun:test';
import {analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {verifyGeneratedDocument} from '@fvtt-json-generator/generation/verification';
import {adaptParsedActorToCanonical} from '@fvtt-json-generator/generation/adapters';
import {applyActorResourceSemantics} from '@fvtt-json-generator/generation/actor-resource-semantics';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {createForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';
import type {SourceOperation} from '@fvtt-json-generator/models/source-operations';

const noCall=async():Promise<never>=>{throw Error('Consumer checks forbid model calls');};
const provider={providerName:'stage-consumers',extractionModel:'fixed',reviewModel:'disabled',discover:noCall,extract:noCall,review:noCall,repair:noCall};
async function generated(stage=false,damage=false,pool=false,shape:'op'|'gm'|'flat'='op',exitSource?:string){
  const description=stage
    ? 'Dexterity Saving Throw: DC 13. Failure: The target has the Blinded and Restrained conditions while swallowed. '+(exitSource??'If the carrier takes damage, it regurgitates the creature, which falls nearby and has the Prone condition. If the carrier dies, a creature can escape from its corpse, exiting Prone.')
    : 'Melee Attack Roll: +4, reach 5 feet. Hit: The target has the Poisoned condition until the end of its next turn.';
  const op:SourceOperation=stage
    ? {id:'entry-save',name:'Entry',type:'save',relationship:'primary',save:{dc:13,abilities:['dex'],choice:'single',outcome:'none'},sourceText:description,proof:{save:'Dexterity Saving Throw: DC 13.'}}
    : {id:'source-hit',name:'Hit',type:'attack',relationship:'primary',attack:{type:'melee',toHit:4,reach:5},sourceText:description,proof:{attack:'Melee Attack Roll: +4, reach 5 feet.'},appliedConditions:[{statuses:['poisoned'],condition:'Only after the confirmed hit.'}],...(damage?{damage:[{formula:'1d4',type:'piercing',relationship:'base'}]}:{})};
  const source=LURKER_SOURCE+'\n'+description+(pool?'\nShared stage pool: 3 uses per day. Stage Carrier and Other Entry each spend one use from this same pool.':''),ir=buildValidLurkerIr();
  ir.creature.traits[0]={name:'阶段载体',englishName:'Stage Carrier',description,activityType:'utility',executionMode:'native-with-gm',sourceFeatureId:'51a6e5a0e0000001',sourceOperations:[op]};
  if(shape!=='op'){
    delete ir.creature.traits[0]!.sourceOperations;
    ir.creature.traits[0]!.uses={max:3,period:'day'};
    if(shape==='gm')ir.creature.traits[0]!.executionMode='gm-manual';
    else{ir.creature.traits[0]!.activityType='save';ir.creature.traits[0]!.save={dc:13,ability:'dex'};ir.creature.traits[0]!.nativeRuleText=description;ir.creature.traits[0]!.manualRemainder=description;}
  }
  if(pool){
    ir.creature.traits[0]!.uses={max:3,period:'day'};
    ir.creature.traits[1]={name:'另一入口',englishName:'Other Entry',description:'Other Entry spends one use from the shared stage pool.',activityType:'utility',executionMode:'gm-manual',sourceFeatureId:'51a6e5a0e0000003',uses:{max:3,period:'day'}};
    ir.creature.sourceResourcePools=[{id:'51a6e5a0e0000002',name:'Shared stage pool',max:3,period:'day',members:[{collection:'traits',index:0,featureId:'51a6e5a0e0000001',cost:1},{collection:'traits',index:1,featureId:'51a6e5a0e0000003',cost:1}],evidence:[]}];
  }
  const input={source,sourceName:'stage consumers',sourceScope:'single' as const,requestId:'stage-consumer-check',sourceId:createForgeSourceId(()=> '57a6846d-62f0-4934-a0a4-6e91e310d906'),fvttVersion:'14.368',systemVersion:'5.3.3'};
  const analysis=analyzeBrowserActorIntakeDraft(input,ir,provider),result=await generateBrowserActorIntakeCandidate(input,analysis,provider);
  expect(analysis.validation?.findings.filter(finding=>finding.origin==='schema'&&finding.blocking),JSON.stringify(analysis.validation?.findings)).toEqual([]);
  expect(result.candidateAvailable).toBe(true);
  const actor=result.actorProjection as any,item=actor.items.find((entry:any)=>entry.name==='阶段载体 Stage Carrier');expect(item).toBeDefined();
  const markdown=result.markdown!,canonical=adaptParsedActorToCanonical(new YamlParser().parse(markdown),{sourceText:markdown});
  return {actor,item,analysis,source,markdown,canonical,result};
}
const stageOf=(item:any)=>Object.values<any>(item.system.activities).find(activity=>activity.flags?.fvttJsonGenerator?.sourceConditionStage);

describe('five mechanisms consumer verification',()=>{
  test('a no-damage GM hit retains valid templates in both real verifiers',async()=>{
    const result=await generated();
    const checked=verifyMonsterIntake(result.source,result.analysis.ir!,result.markdown,result.actor);
    expect(checked.findings.filter(finding=>/GM_ATTACK_IDENTITY_DRIFT|SOURCE_OPERATION_STATUS_DRIFT|CONDITION_LINK_DRIFT/u.test(finding.code))).toEqual([]);
    expect(verifyGeneratedDocument({canonical:result.canonical,output:result.actor,target:'14',effectProfile:'core'}).diagnostics.filter(finding=>/CONDITION_LIFECYCLE_INVALID/u.test(finding.code))).toEqual([]);
  });
  test('an attack with damage still cannot apply a second copy from its attack roll',async()=>{
    const result=await generated(false,true),actor=structuredClone(result.actor),item=actor.items.find((entry:any)=>entry.name==='阶段载体 Stage Carrier');
    const roll=Object.values<any>(item.system.activities).find(activity=>activity.flags.fvttJsonGenerator.sourceOperation.role==='attack-roll');
    roll.effects=[{_id:item.effects[0]._id}];
    expect(verifyMonsterIntake(result.source,result.analysis.ir!,result.markdown,actor).findings.some(finding=>finding.code==='ACTOR_GM_ATTACK_IDENTITY_DRIFT')).toBe(true);
  });
  test('a no-damage roll cannot borrow another operation template',async()=>{
    const result=await generated(),actor=structuredClone(result.actor),item=actor.items.find((entry:any)=>entry.name==='阶段载体 Stage Carrier');
    item.effects[0].flags.fvttJsonGenerator.sourceOperationId='foreign-operation';
    expect(verifyMonsterIntake(result.source,result.analysis.ir!,result.markdown,actor).findings.some(finding=>finding.code==='ACTOR_GM_ATTACK_IDENTITY_DRIFT')).toBe(true);
  });
  test('a source-proven GM stage is excluded from source-operation counting only after validation',async()=>{
    const result=await generated(true);expect(stageOf(result.item)).toBeDefined();
    expect(verifyMonsterIntake(result.source,result.analysis.ir!,result.markdown,result.actor).findings.filter(finding=>/CONDITION_STAGE_DRIFT|SOURCE_OPERATION_COUNT_DRIFT|SOURCE_OPERATION_IDENTITY_DRIFT/u.test(finding.code))).toEqual([]);
    expect(verifyGeneratedDocument({canonical:result.canonical,output:result.actor,target:'14',effectProfile:'core'}).diagnostics.filter(finding=>finding.code==='GEN_CONDITION_STAGE_INVALID')).toEqual([]);
  });
  test('schema-default empty roll and uses remain inert stage controls',async()=>{
    const result=await generated(true),actor=structuredClone(result.actor),item=actor.items.find((entry:any)=>entry.name==='阶段载体 Stage Carrier'),stage=stageOf(item);
    stage.roll={formula:'',name:'',prompt:false,visible:true};stage.uses={max:'',spent:0,recovery:[]};
    expect(verifyMonsterIntake(result.source,result.analysis.ir!,result.markdown,actor).findings.some(finding=>finding.code==='ACTOR_CONDITION_STAGE_DRIFT')).toBe(false);
    expect(verifyGeneratedDocument({canonical:result.canonical,output:actor,target:'14',effectProfile:'core'}).diagnostics.some(finding=>finding.code==='GEN_CONDITION_STAGE_INVALID')).toBe(false);
  });
  for(const shape of ['gm','flat']as const)test('a '+shape+' primary keeps its counter and one source activity beside a stage',async()=>{
    const result=await generated(true,false,false,shape),stage=stageOf(result.item);expect(stage).toBeDefined();expect(stage.consumption.targets).toEqual([]);
    const checked=verifyMonsterIntake(result.source,result.analysis.ir!,result.markdown,result.actor);
    expect(checked.findings.filter(finding=>/CONDITION_STAGE_DRIFT|MANUAL_RULE_EXECUTION_DRIFT|MIXED_RULE_EXECUTION_DRIFT/u.test(finding.code))).toEqual([]);
    expect(verifyGeneratedDocument({canonical:result.canonical,output:result.actor,target:'14',effectProfile:'core'}).diagnostics.filter(finding=>/CONDITION_STAGE_INVALID|MECHANIC_NOT_PROJECTED/u.test(finding.code)&&finding.path.includes('/uses'))).toEqual([]);
    expect(String(result.item.system.uses.max)).toBe('3');
  });
  for(const mutation of ['roll','uses','consumption','source','owner','native'] as const)test('a stage marker cannot hide '+mutation+' drift',async()=>{
    const result=await generated(true),actor=structuredClone(result.actor),item=actor.items.find((entry:any)=>entry.name==='阶段载体 Stage Carrier'),stage=stageOf(item);
    if(mutation==='roll')stage.roll={formula:'1d20'};
    if(mutation==='uses')stage.uses={max:'3',spent:0,recovery:[]};
    if(mutation==='consumption')stage.consumption.targets=[{type:'itemUses',target:'',value:'1'}];
    if(mutation==='source')stage.flags.fvttJsonGenerator.sourceConditionStage.source='An unrelated source rule.';
    if(mutation==='owner')stage.flags.fvttJsonGenerator.sourceConditionStage.sourceOperationId='other-source-operation';
    if(mutation==='native')item.effects.find((effect:any)=>effect._id===stage.effects[0]._id).flags.fvttJsonGenerator.conditionLifecycle.mode='native';
    expect(verifyMonsterIntake(result.source,result.analysis.ir!,result.markdown,actor).findings.some(finding=>finding.code==='ACTOR_CONDITION_STAGE_DRIFT')).toBe(true);
    expect(verifyGeneratedDocument({canonical:result.canonical,output:actor,target:'14',effectProfile:'core'}).diagnostics.some(finding=>finding.code==='GEN_CONDITION_STAGE_INVALID')).toBe(true);
  });
  test('a missing stage controller is not silently accepted',async()=>{
    const result=await generated(true),actor=structuredClone(result.actor),item=actor.items.find((entry:any)=>entry.name==='阶段载体 Stage Carrier');delete item.system.activities[stageOf(item)._id];
    expect(verifyMonsterIntake(result.source,result.analysis.ir!,result.markdown,actor).findings.some(finding=>finding.code==='ACTOR_CONDITION_STAGE_DRIFT')).toBe(true);
  });
  test('the formal shared resource chain charges the Save once and never its stage',async()=>{
    const result=await generated(true,false,true),stage=stageOf(result.item),primary=Object.values<any>(result.item.system.activities).find(activity=>activity.type==='save');
    expect(stage.consumption.targets).toEqual([]);expect(primary.consumption.targets).toHaveLength(1);expect(primary.consumption.targets[0].type).toBe('itemUses');
    expect(String(result.item.system.uses.max)).toBe('3');
    expect(JSON.stringify(result.actor.flags?.fvttJsonGenerator?.candidateReview?.findings??[])).not.toContain('source-operation roles must cover');
  });
  for(const mode of ['fixed','variable'] as const)test('literal '+mode+' resource binding selects the real Save instead of its stage',async()=>{
    const result=await generated(true),actor=structuredClone(result.actor),item=actor.items.find((entry:any)=>entry.name==='阶段载体 Stage Carrier');
    const carrier={_id:'StagePool0000001',name:'Pool',type:'feat',flags:{'tidy5e-sheet':{section:'特性'}},system:{activities:{},uses:{}},effects:[]};actor.items.push(carrier);
    applyActorResourceSemantics(actor,{resources:[{id:'pool',name:'Pool',carrier:{section:'特性',name:'Pool'},initial:3,max:3,recovery:'day',operations:[],derived:[]}],bindings:[{id:'stage-member-cost',resourceId:'pool',source:{section:'特性',name:item.name},mode,...(mode==='fixed'?{amount:1}:{min:1,max:3})}],transitions:[]},'14');
    expect(stageOf(item).consumption.targets).toEqual([]);
    expect(Object.values<any>(item.system.activities).some(activity=>activity.type==='save'&&activity.consumption?.targets?.some((target:any)=>target.target===carrier._id))).toBe(true);
    expect(JSON.stringify(actor.flags?.fvttJsonGenerator?.candidateReview?.findings??[])).not.toContain('must resolve to exactly one source Activity');
  });
});

describe('five mechanisms consumer compound stage identity',()=>{
  for(const [exit,keys]of [
    ['When the creature exits, it has the Frightened and Incapacitated conditions.',['frightened','incapacitated']],
    ['When the creature exits, it has the Stunned condition.',['stunned']],
    ['When the creature exits, it has the Stunned and Incapacitated conditions.',['stunned','incapacitated']],
  ]as const)test('each source stage is matched by its own complete status identity: '+exit,async()=>{
    const result=await generated(true,false,false,'op',exit);
    const stages=Object.values<any>(result.item.system.activities).filter(activity=>activity.flags?.fvttJsonGenerator?.sourceConditionStage);
    expect(stages.map(stage=>stage.flags.fvttJsonGenerator.sourceLogicalPath.split('/condition-stage/')[1]).sort()).toEqual([...keys].sort());
    expect(verifyMonsterIntake(result.source,result.analysis.ir!,result.markdown,result.actor).findings.filter(finding=>finding.code==='ACTOR_CONDITION_STAGE_DRIFT')).toEqual([]);
    expect(verifyGeneratedDocument({canonical:result.canonical,output:result.actor,target:'14',effectProfile:'core'}).diagnostics.filter(finding=>finding.code==='GEN_CONDITION_STAGE_INVALID')).toEqual([]);
  });
  for(const key of ['frightened','incapacitated'])for(const removed of ['controller','template','both'])test('removing '+key+' '+removed+' cannot be covered by the other same-source stage',async()=>{
    const result=await generated(true,false,false,'op','When the creature exits, it has the Frightened and Incapacitated conditions.');
    const actor=structuredClone(result.actor),item=actor.items.find((entry:any)=>entry.name==='阶段载体 Stage Carrier');
    const stage=Object.values<any>(item.system.activities).find(activity=>activity.flags?.fvttJsonGenerator?.sourceLogicalPath?.endsWith('/condition-stage/'+key));
    if(removed!=='template')delete item.system.activities[stage._id];
    if(removed!=='controller')item.effects=item.effects.filter((effect:any)=>effect._id!==stage.effects[0]._id);
    expect(verifyMonsterIntake(result.source,result.analysis.ir!,result.markdown,actor).findings.some(finding=>finding.code==='ACTOR_CONDITION_STAGE_DRIFT')).toBe(true);
    expect(verifyGeneratedDocument({canonical:result.canonical,output:actor,target:'14',effectProfile:'core'}).diagnostics.some(finding=>finding.code==='GEN_CONDITION_STAGE_INVALID')).toBe(true);
  });
  test('an official companion status is part of the complete stage identity',async()=>{
    const result=await generated(true,false,false,'op','When the creature exits, it has the Stunned condition.'),actor=structuredClone(result.actor),item=actor.items.find((entry:any)=>entry.name==='阶段载体 Stage Carrier'),stage=stageOf(item);
    item.effects.find((effect:any)=>effect._id===stage.effects[0]._id).statuses=['stunned'];
    expect(verifyMonsterIntake(result.source,result.analysis.ir!,result.markdown,actor).findings.some(finding=>finding.code==='ACTOR_CONDITION_STAGE_DRIFT')).toBe(true);
    expect(verifyGeneratedDocument({canonical:result.canonical,output:actor,target:'14',effectProfile:'core'}).diagnostics.some(finding=>finding.code==='GEN_CONDITION_STAGE_INVALID')).toBe(true);
  });
});

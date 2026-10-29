import {describe, expect, test} from 'bun:test';
import {anchorIrEvidenceSourceAudit} from '@fvtt-json-generator/intake-ai/orchestrator';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import {buildValidLurkerIr, LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';
import {analyzeBrowserActorIntakeDraft, generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {createForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import type {SourceOperation} from '@fvtt-json-generator/models/source-operations';
import {conditionEffectGroups, prepareManualConditionEffectsForMidi} from '../foundry-modules/fvtt-json-forge/src/manualConditionEffects';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import {normalizeMonsterIntakeProposal, OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import currentReplies from './fixtures/forge-current-input-recovery.json';

const noCall=async():Promise<never>=>{throw Error('These mechanism checks forbid model service calls');};
const provider={providerName:'existing-frozen-mechanisms',extractionModel:'fixed',reviewModel:'disabled',discover:noCall,extract:noCall,review:noCall,repair:noCall};
async function statusItem(description:string,operations?:SourceOperation[],fields:Partial<MonsterIntakeIR['creature']['traits'][number]>={}) {
  const source=LURKER_SOURCE+'\n'+description,ir=buildValidLurkerIr();
  ir.creature.traits[0]={name:'状态边界',englishName:'Status Boundary',description,activityType:'utility',executionMode:'gm-manual',...fields};
  if(operations)ir.creature.traits[0]!.sourceOperations=operations;
  const before=structuredClone(ir);
  const input={source,sourceName:'five mechanisms',sourceScope:'single' as const,requestId:'five-mechanisms',sourceId:createForgeSourceId(()=> '765b87ae-9898-47ef-921d-8b583ff90473'),fvttVersion:'14.368',systemVersion:'5.3.3'};
  const analysis=analyzeBrowserActorIntakeDraft(input,ir,provider),generated=await generateBrowserActorIntakeCandidate(input,analysis,provider);
  expect(generated.candidateAvailable).toBe(true);expect(ir).toEqual(before);
  const actor=generated.actorProjection as any,item=actor.items.find((entry:any)=>entry.name==='状态边界 Status Boundary');
  expect(item).toBeDefined();return {actor,item,analysis,generated};
}

describe('five mechanisms N01 source-owned temporary hit point recipients', () => {
  for (const description of [
    'When the trigger occurs, this creature gains 6 temporary hit points.',
    'When the trigger occurs, the Lurker in the Dark gains 1d6 temporary hit points.',
    '当触发条件发生时，此生物会获得6点临时生命值。',
  ]) test('a source-confirmed self recipient survives the legacy formal chain: '+description, async () => {
    const source=LURKER_SOURCE+'\n'+description, ir=buildValidLurkerIr();
    ir.creature.traits[0]={name:'Recipient boundary',description,activityType:'utility',activationType:'special'};
    const before=structuredClone(ir);
    const anchored=anchorIrEvidenceSourceAudit(source,{id:'recipient',label:'Recipient',start:0,end:source.length,quote:source},ir);
    const generated=await convertMarkdownContentToJson({content:renderMonsterIntakeMarkdown(anchored),fvttVersion:'14',effectProfile:'core',translationService:null});
    const item=(generated.rawJson as any).items.find((entry:any)=>entry.name==='Recipient boundary');
    const activity=Object.values<any>(item.system.activities)[0];
    expect(anchored.creature.traits[0]!.healing?.target).toEqual({type:'self',count:1,special:''});
    expect(activity.target.affects).toEqual({type:'self',count:'1',choice:false,special:''});
    expect(activity.range).toBeUndefined();
    expect(ir).toEqual(before);
  });

  for (const description of [
    'When the trigger occurs, one creature gains 6 temporary hit points.',
    'When the trigger occurs, the target gains 6 temporary hit points.',
    'When the target fails its saving throw, it gains 6 temporary hit points.',
    'When an ally is hit, it gains 6 temporary hit points.',
    '当目标豁免失败时，它将获得6点临时生命值。',
  ]) test('an unproven recipient stays unresolved: '+description, async () => {
    const source=LURKER_SOURCE+'\n'+description, ir=buildValidLurkerIr();
    ir.creature.traits[0]={name:'Recipient boundary',description,activityType:'utility',activationType:'special'};
    const anchored=anchorIrEvidenceSourceAudit(source,{id:'recipient',label:'Recipient',start:0,end:source.length,quote:source},ir);
    const generated=await convertMarkdownContentToJson({content:renderMonsterIntakeMarkdown(anchored),fvttVersion:'14',effectProfile:'core',translationService:null});
    const item=(generated.rawJson as any).items.find((entry:any)=>entry.name==='Recipient boundary');
    const activity=Object.values<any>(item.system.activities)[0];
    expect(anchored.creature.traits[0]!.healing?.target).toBeUndefined();
    expect(activity.target.affects).toMatchObject({type:'any',count:''});
    expect(activity.range.units).toBe('spec');
  });

  test('an explicit recipient is retained even when the source self clause conflicts', async () => {
    const description='When the trigger occurs, it gains 6 temporary hit points.';
    const source=LURKER_SOURCE+'\n'+description, ir=buildValidLurkerIr();
    const target={type:'creature' as const,count:2,special:'two explicitly supplied allies'};
    ir.creature.traits[0]={name:'Recipient boundary',description,activityType:'heal',activationType:'special',healing:{formula:'6',type:'temphp',target}};
    const before=structuredClone(ir);
    const anchored=anchorIrEvidenceSourceAudit(source,{id:'recipient',label:'Recipient',start:0,end:source.length,quote:source},ir);
    expect(anchored.creature.traits[0]!.healing?.target).toEqual(target);
    expect(ir).toEqual(before);
  });
});

describe('five mechanisms E03 independent exit condition stages', () => {
  const exits=[
    'If the carrier takes damage, it regurgitates the creature, which falls in a space within 10 feet and has the Prone condition. If the carrier dies, a swallowed creature can escape from the corpse by using 15 feet of movement, exiting Prone.',
    'When the creature escapes from the carrier, it becomes Prone.',
    '若该生物被吐出，它陷入倒地状态。',
  ];
  for(const [index,exit] of exits.entries())test('later result is a separate GM-only group: '+exit,async()=>{
    const save='Dexterity Saving Throw: DC 13. Failure: The target has the Blinded and Restrained conditions while inside the carrier.';
    const description=save+' '+exit;
    const operations:SourceOperation[]=[{id:'entry-save',name:'Entry',type:'save',relationship:'primary',save:{dc:13,abilities:['dex'],choice:'single',outcome:'none'},sourceText:description,proof:{save:'Dexterity Saving Throw: DC 13.'}}];
    const {item}=await statusItem(description,index===1?undefined:operations),activities=Object.values<any>(item.system.activities);
    const stage=activities.find(activity=>activity.flags?.fvttJsonGenerator?.sourceLogicalPath?.includes('/condition-stage/'));
    expect(stage).toBeDefined();expect(stage.type).toBe('utility');expect(stage.activation.type).toBe('special');
    expect(stage.consumption.targets).toEqual([]);expect(stage.damage).toBeUndefined();expect(stage.roll).toBeUndefined();expect(stage.uses).toBeUndefined();
    const prone=item.effects.filter((effect:any)=>effect.statuses.includes('prone'));expect(prone).toHaveLength(1);
    expect(prone[0].flags.fvttJsonGenerator.conditionLifecycle).toMatchObject({mode:'gm',staged:true});
    expect(prone[0].description.replace(/\s+/gu,' ')).toContain(exit);
    expect(stage.description.chatFlavor.replace(/<[^>]*>/gu,' ').replace(/\s+/gu,' ')).toContain(exit);
    expect(stage.effects).toEqual([{_id:prone[0]._id}]);
    expect(activities.filter(activity=>activity!==stage).every(activity=>!(activity.effects??[]).some((link:any)=>link._id===prone[0]._id))).toBe(true);
    const mapped={effects:new Map(item.effects.map((effect:any)=>[effect._id,effect])),system:{activities:new Map(activities.map(activity=>[activity._id,activity]))}};
    const groups=conditionEffectGroups(mapped);expect(groups).toHaveLength(2);
    expect(groups.find(group=>group.activity===stage)!.effects).toEqual(prone);
    expect(groups.find(group=>group.activity!==stage)!.effects.flatMap(effect=>effect.statuses).sort()).toEqual(['blinded','restrained']);
    const adapted=structuredClone(item);prepareManualConditionEffectsForMidi(adapted);
    expect(adapted.system.activities[stage._id].effectConditionText).toBe('false');
    expect(adapted.effects.find((effect:any)=>effect._id===prone[0]._id).flags.dae.dontApply).toBe(true);
  });

  for(const description of ['Until the creature escapes, it has the Poisoned condition.','除非目标逃出，否则它陷入中毒状态。'])test('an ending condition is not a later application stage: '+description,async()=>{
    const {item}=await statusItem(description);
    expect(Object.values<any>(item.system.activities).some(activity=>activity.flags?.fvttJsonGenerator?.sourceLogicalPath?.includes('/condition-stage/'))).toBe(false);
    const poisoned=item.effects.find((effect:any)=>effect.statuses.includes('poisoned'));expect(poisoned).toBeDefined();
    expect(poisoned.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');
  });

  for(const description of [
    'Dexterity Saving Throw: DC 13. Failure: The target has the Blinded condition, and when the creature exits, it becomes Prone.',
    'Dexterity Saving Throw: DC 13. Failure: The target cannot escape and has the Poisoned condition for 1 minute.',
    'Melee Attack Roll: +4. Hit: The target has the Grappled condition (escape DC 14) and has the Poisoned condition until the grapple ends.',
    'Failure: The target has disadvantage on escape checks and has the Poisoned condition for 1 minute.',
  ])test('immediate states survive a nearby exit mention: '+description,async()=>{
    const {item}=await statusItem(description),activities=Object.values<any>(item.system.activities);
    const stage=activities.find(activity=>activity.flags?.fvttJsonGenerator?.sourceConditionStage);
    const linked=(status:string)=>activities.filter(activity=>item.effects.some((effect:any)=>effect.statuses.includes(status)&&activity.effects?.some((link:any)=>link._id===effect._id)));
    if(description.includes('becomes Prone')){
      expect(linked('blinded')).toHaveLength(1);expect(linked('blinded')[0]).not.toBe(stage);
      expect(linked('prone')).toEqual([stage]);
    }else{expect(stage).toBeUndefined();expect(linked('poisoned')).toHaveLength(1);}
  });

  test('a trail is not an exit event',async()=>{
    const {item}=await statusItem('The creature leaves a trail, and the target becomes Prone.');
    expect(Object.values<any>(item.system.activities).some(activity=>activity.flags?.fvttJsonGenerator?.sourceConditionStage)).toBe(false);
    expect(item.effects.some((effect:any)=>effect.statuses.includes('prone'))).toBe(true);
  });

  test('an earlier escape-check noun does not hide a later real exit',async()=>{
    const {item}=await statusItem('Failure: The target has disadvantage on escape checks and has the Poisoned condition, and when the creature exits, it becomes Prone.');
    const activities=Object.values<any>(item.system.activities),stage=activities.find(activity=>activity.flags?.fvttJsonGenerator?.sourceConditionStage);
    const poison=item.effects.find((effect:any)=>effect.statuses.includes('poisoned')),prone=item.effects.find((effect:any)=>effect.statuses.includes('prone'));
    expect(stage.effects).toEqual([{_id:prone._id}]);
    expect(activities.filter(activity=>activity!==stage).some(activity=>activity.effects?.some((link:any)=>link._id===poison._id))).toBe(true);
  });

  test('a retained single candidate counter charges the source Save but never its later stage',async()=>{
    const description='Dexterity Saving Throw: DC 13. Failure: The target has the Blinded condition while inside. When the creature escapes from inside, it becomes Prone.';
    const operations:SourceOperation[]=[{id:'entry-save',name:'Entry',type:'save',relationship:'primary',save:{dc:13,abilities:['dex'],choice:'single',outcome:'none'},sourceText:description,proof:{save:'Dexterity Saving Throw: DC 13.'}}];
    const {item}=await statusItem(description,operations,{candidateReview:{version:1,findings:[{code:'RETAINED_COUNTER',path:'uses',message:'Preserve the declared shared uses for GM review.'}],proposal:{uses:'3/day'}},candidateCounters:[{name:'Source counter',max:3,recovery:'day'}]});
    const activities=Object.values<any>(item.system.activities),stage=activities.find(activity=>activity.flags?.fvttJsonGenerator?.sourceConditionStage);
    expect(stage).toBeDefined();expect(stage.consumption.targets).toEqual([]);expect(item.system.uses.max).toBe('3');
    expect(activities.filter(activity=>activity.consumption?.targets?.length)).toHaveLength(1);
    expect(activities.find(activity=>activity.consumption?.targets?.length).type).toBe('save');
  });
});

describe('five mechanisms E02 no-damage attack condition ownership', () => {
  for(const [type,declared] of [['melee',false],['ranged',true]] as const)test(type+' attack retains only its own hit-result templates without invented damage',async()=>{
    const description=(type==='melee'?'Melee Attack Roll: +4, reach 5 feet.':'Ranged Attack Roll: +4, range 30 feet.')+' Hit: The target has the Grappled and Poisoned conditions until it escapes.';
    const op:SourceOperation={id:'condition-only-hit',name:'Condition hit',type:'attack',relationship:'primary',attack:{type,toHit:4,...(type==='melee'?{reach:5}:{range:30})},sourceText:description,proof:{attack:description},...(declared?{appliedConditions:[{statuses:['grappled','poisoned'],condition:'Only after the GM confirms this hit.'}]}:{})};
    const {item}=await statusItem(description,[op]),activities=Object.values<any>(item.system.activities);
    expect(activities).toHaveLength(1);expect(activities[0].type).toBe('utility');
    expect(activities[0].flags.fvttJsonGenerator.sourceOperation.role).toBe('attack-roll');
    expect(activities[0].roll.formula).toBe('1d20+4');
    expect([...new Set(item.effects.flatMap((effect:any)=>effect.statuses))].sort()).toEqual(['grappled','poisoned']);
    expect(activities[0].effects.map((link:any)=>link._id).sort()).toEqual(item.effects.map((effect:any)=>effect._id).sort());
    for(const effect of item.effects){expect(effect.flags.fvttJsonGenerator.sourceOperationId).toBe(op.id);expect(effect.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(effect.description).toContain('已命中');}
    expect(activities[0].damage).toBeUndefined();expect(activities[0].effects.every((link:any)=>!Object.hasOwn(link,'onSave'))).toBe(true);
  });

  for(const withDamage of [false,true])test('a separate Save cannot take hit effects; damage exists='+withDamage,async()=>{
    const hit='Melee Attack Roll: +4, reach 5 feet. Hit: The target has the Poisoned condition until the end of its next turn.';
    const save='Wisdom Saving Throw: DC 13. Failure: The target has the Frightened condition until the end of its next turn.';
    const operations:SourceOperation[]=[{id:'primary-hit',name:'Hit',type:'attack',relationship:'primary',attack:{type:'melee',toHit:4,reach:5},sourceText:hit,proof:{attack:hit},...(withDamage?{damage:[{formula:'1d4',type:'piercing',relationship:'base' as const}]}:{})},{id:'later-save',name:'Later save',type:'save',relationship:'follow-up',save:{dc:13,abilities:['wis'],choice:'single',outcome:'none'},sourceText:save,proof:{save}}];
    const {item}=await statusItem(hit+'\n'+save,operations),activities=Object.values<any>(item.system.activities);
    const poisoned=item.effects.find((effect:any)=>effect.statuses.includes('poisoned')),frightened=item.effects.find((effect:any)=>effect.statuses.includes('frightened'));
    const linked=(id:string)=>activities.filter(activity=>activity.effects?.some((link:any)=>link._id===id));
    expect(linked(poisoned._id)).toHaveLength(1);expect(linked(poisoned._id)[0].flags.fvttJsonGenerator.sourceOperation.id).toBe('primary-hit');
    expect(linked(poisoned._id)[0].flags.fvttJsonGenerator.sourceOperation.role).toBe(withDamage?'damage':'attack-roll');
    expect(linked(frightened._id)).toHaveLength(1);expect(linked(frightened._id)[0].type).toBe('save');
    expect(linked(frightened._id)[0].effects).toContainEqual({_id:frightened._id,onSave:false});
  });
});

describe('five mechanisms E01 applying predicates own their result states', () => {
  for (const description of [
    'The warrior has Advantage on an attack roll against a creature if at least one of its allies is within 5 feet of the creature and the ally doesn’t have the Incapacitated condition.',
    'The warrior has Advantage against a creature if an ally is within 5 feet and the ally does not have the Incapacitated condition.',
    'The creature is within 5 feet of an ally that has the Incapacitated condition.',
    'The creature is within 5 feet of an ally and the ally has the Incapacitated condition.',
  ]) test('a qualifying participant state never becomes a new target effect: '+description, async () => {
    const {item}=await statusItem(description);expect(item.effects).toEqual([]);
    expect(Object.values<any>(item.system.activities).every(activity=>!(activity.effects??[]).length)).toBe(true);
    expect(item.system.description.value).toContain(description);
  });

  for (const [description,statuses] of [
    ['The target does not have the Poisoned condition and becomes Prone.',['prone']],
    ['A creature which has the Poisoned condition becomes Prone for 1 minute.',['prone']],
    ['The target has the Frightened and Incapacitated conditions until the end of its next turn.',['frightened','incapacitated']],
    ['The target is pushed 10 feet and knocked Prone.',['prone']],
    ['The target and its ally have the Frightened condition until the end of their next turn.',['frightened']],
    ['The target and an ally become Prone.',['prone']],
    ['The target is both Blinded and Deafened.',['blinded','deafened']],
  ] as const) test('a real result survives adjacent qualifiers: '+description, async () => {
    const {item}=await statusItem(description);
    expect([...new Set(item.effects.flatMap((effect:any)=>effect.statuses))].sort()).toEqual([...statuses].sort());
    for(const effect of item.effects)expect(Object.values<any>(item.system.activities).some(activity=>activity.effects?.some((link:any)=>link._id===effect._id))).toBe(true);
  });
});

describe('five mechanisms R01 evidence repair history and unresolved evidence are separate',()=>{
  for(const variant of ['missing-offsets','wrong-offsets','missing-quote'] as const)test('successful '+variant+' retains history without an incomplete finding',()=>{
    const record=currentReplies.cases.find(entry=>entry.id==='unicorn')!;
    const ir=normalizeMonsterIntakeProposal(record.source,structuredClone(record.ir) as unknown as MonsterIntakeIR),group=ir.creature.spellcasting![0]!;
    const known=group.evidence![0]!;
    group.evidence=[(variant==='missing-quote'?{start:known.start,end:known.end}:{...known,start:variant==='missing-offsets'?-1:0,end:variant==='missing-offsets'?-1:1}) as typeof known];
    const before=structuredClone(ir),normalized=normalizeMonsterIntakeProposal(record.source,ir);
    expect(normalized.creature.spellcasting![0]!.evidence).toEqual([known]);
    expect(normalized.creature.candidateReview?.findings??[]).toEqual([]);
    expect((normalized.creature.candidateReview!.proposal as {original:unknown}).original).toEqual(before);
    expect(normalized.uncertainties.filter(issue=>issue.code==='FIELD_PROJECTION_INCOMPLETE')).toEqual([]);
    expect(normalizeMonsterIntakeProposal(record.source,normalized)).toEqual(normalized);expect(ir).toEqual(before);
  });

  for(const invalid of [null,{start:-1,end:-1,quote:'This evidence does not occur in this source.'}])test('unresolved evidence remains a concrete problem: '+JSON.stringify(invalid),()=>{
    const record=currentReplies.cases.find(entry=>entry.id==='unicorn')!;
    const ir=normalizeMonsterIntakeProposal(record.source,structuredClone(record.ir) as unknown as MonsterIntakeIR);
    const group=ir.creature.spellcasting![0]!,known=structuredClone(group.evidence![0]!);
    group.evidence=[known,invalid] as typeof group.evidence;
    const before=structuredClone(ir),normalized=normalizeMonsterIntakeProposal(record.source,ir);
    expect(normalized.creature.spellcasting![0]!.evidence).toEqual([known]);
    expect(normalized.creature.candidateReview!.findings).toContainEqual(expect.objectContaining({code:'FIELD_PROJECTION_INCOMPLETE',path:'/creature/spellcasting/0/evidence'}));
    expect((normalized.creature.candidateReview!.proposal as {original:unknown}).original).toEqual(before);expect(ir).toEqual(before);
  });

  for(const id of ['unicorn','spirit-naga'])test(id+' original reply keeps its Actor and original offsets without false incomplete messages',async()=>{
    const record=currentReplies.cases.find(entry=>entry.id===id)!,responses:any[]=[];
    const actual=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://offline.invalid',apiKey:'frozen',model:'frozen',reviewModel:'disabled',maxAttempts:1,timeoutMs:10000,repairTimeoutMs:10000,responseEvidence:{record:value=>{responses.push(value);}},httpClient:async()=>Response.json({choices:[{message:{content:record.rawReply}}]})});
    const input={source:record.source,sourceName:id,sourceScope:'single' as const,requestId:'five-evidence-'+id,sourceId:createForgeSourceId(()=> '765b87ae-9898-47ef-921d-8b583ff90473'),fvttVersion:'14.368',systemVersion:'5.3.3'};
    const raw=await actual.extract({source:record.source,sourceSha256:record.sourceSha256,candidate:{id,label:id,start:0,end:record.source.length,quote:record.source}});
    expect(raw.creature.candidateReview?.findings??[]).toEqual([]);expect(responses[0].content).toBe(record.rawReply);
    const original=(raw.creature.candidateReview!.proposal as {original:any}).original;
    expect(JSON.stringify(original)).toContain('"start":-1');
    const rawAnalysis=analyzeBrowserActorIntakeDraft(input,raw,provider),draftAnalysis=analyzeBrowserActorIntakeDraft(input,structuredClone(record.ir) as unknown as MonsterIntakeIR,provider);
    const rawActor=await generateBrowserActorIntakeCandidate(input,rawAnalysis,provider),draftActor=await generateBrowserActorIntakeCandidate(input,draftAnalysis,provider);
    expect(rawActor.candidateAvailable).toBe(true);expect(rawActor.actorProjection).toEqual(draftActor.actorProjection);
    expect(rawActor.findings.filter(finding=>finding.code==='FIELD_PROJECTION_INCOMPLETE')).toEqual([]);
  });
});

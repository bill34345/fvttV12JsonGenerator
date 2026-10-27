import {afterAll,expect,test} from 'bun:test';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {normalizeMonsterIntakeProposal,OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {analyzeBrowserActorIntakeDraft,analyzeBrowserActorSourceWithAi,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {normalizeCreatureFeatureInput,sourceOperationStructureErrors} from '@fvtt-json-generator/models/source-operations';
import {StructuredActionParser} from '@fvtt-json-generator/parser';
import {hashSource,type ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';

const noCall=async():Promise<never>=>{throw Error('This regression forbids model and network requests');};
const originalFetch=globalThis.fetch;globalThis.fetch=noCall as typeof fetch;afterAll(()=>{globalThis.fetch=originalFetch;});
const provider={providerName:'field-policy',extractionModel:'frozen',reviewModel:'disabled',discover:noCall,extract:noCall,review:noCall,repair:noCall};
const extra='\nRestoration. The creature regains 10 Hit Points.\n';
const source=LURKER_SOURCE+extra;
const input={source,sourceName:'field policy',sourceScope:'single' as const,requestId:'field-policy-regression',sourceId:'actor:v1:ce7b17fa-9447-49a7-bf18-d4cf2eead852' as ForgeSourceId,fvttVersion:'14.368',systemVersion:'5.3.3',autoCorrect:false};
function base():any{const ir=buildValidLurkerIr();ir.source={sha256:hashSource(source),length:source.length};return ir;}
function feature(carrier:'operations'|'flat',special?:unknown):any{
 const healing={formula:'10',type:'healing',target:{type:'self',count:1,...(special===undefined?{}:{special})}};
 return carrier==='flat'?{name:'Restoration',description:extra.trim(),activityType:'heal',healing}
  :{name:'Restoration',description:extra.trim(),sourceOperations:[{id:'restore',name:'Restoration',type:'heal',relationship:'primary',healing,proof:{healing:extra.trim()}}]};
}
async function generate(ir:any,current=input){const analysis=analyzeBrowserActorIntakeDraft(current,ir,provider),generation=await generateBrowserActorIntakeCandidate(current,analysis,provider);return{analysis,generation,actor:(generation.candidateResponse as any)?.result?.artifact};}

test('input field policy: both carriers treat omitted/empty recipient notes identically through formal Actor generation',async()=>{
 for(const carrier of ['operations','flat'] as const){let expected:any;
   for(const special of [undefined,'']){const ir=base();ir.creature.traits.push(feature(carrier,special));const before=structuredClone(ir),result=await generate(ir);
   expect(result.analysis.validation?.blocking).toEqual([]);expect(result.generation.candidateAvailable).toBe(true);expect(result.actor).toBeDefined();
   if(expected)expect(result.actor).toEqual(expected);else expected=result.actor;
   const item=result.actor.items.find((entry:any)=>entry.name==='Restoration'),heal=Object.values(item.system.activities).find((entry:any)=>entry.type==='heal') as any;
   expect(heal.target.affects).toMatchObject({type:'self',count:'1',special:''});expect(heal.healing.custom).toMatchObject({enabled:true,formula:'10'});expect(ir).toEqual(before);
  }
 }
});

test('input field policy: previously legal empty or whitespace notes retain their exact stored representation',async()=>{
 for(const special of ['',' \t ']){
  const ir=base();ir.creature.traits.push(feature('operations',special));ir.creature.defenses.vulnerabilitiesCustom=special;
  const normalized=normalizeMonsterIntakeProposal(source,ir);expect(normalized.creature.traits.at(-1)!.sourceOperations![0]!.healing!.target.special).toBe(special);expect(normalized.creature.defenses.vulnerabilitiesCustom).toBe(special);
  const result=await generate(ir),heal=Object.values(result.actor.items.find((entry:any)=>entry.name==='Restoration').system.activities).find((entry:any)=>entry.type==='heal') as any;
  expect(result.generation.candidateAvailable).toBe(true);expect(heal.target.affects.special).toBe(special);expect(result.actor.system.traits.dv.custom).toBe(special);
 }
});

test('input field policy: two language presentations and line endings use the same legacy and operation rules',()=>{
 for(const [name,description] of [['Restoration','The creature regains 10 Hit Points.'],['恢复 Restoration','该生物恢复10点生命值。']])for(const eol of ['\n','\r\n']){
  const record={名称:name,描述:description+eol,类型:'heal',治疗:{formula:'10',type:'healing',target:{type:'self',count:1}}};
  const parsed=new StructuredActionParser().parseStructuredSection([record],'特性')[0]!;
  expect(parsed.healing).toEqual({formula:'10',type:'healing',target:{type:'self',count:1,special:''}});expect(record.治疗.target).toEqual({type:'self',count:1});
 }
});

test('input field policy: optional text is handled by category while nonempty rules are untouched',()=>{
 const absent=base(),blank=base();
 for(const ir of [absent,blank]){delete ir.creature.identity.englishName;delete ir.creature.identity.alignment;delete ir.creature.languages.custom;delete ir.creature.attributes.hp.formula;}
 Object.assign(blank.creature.identity,{englishName:'',creatureTypeCustom:' ',sourceSize:'\t',alignment:''});
 blank.creature.attributes.acNote=' ';blank.creature.attributes.hp.formula=' ';blank.creature.senses.special='';blank.creature.languages.custom='\n';
 for(const ir of [absent,blank])ir.creature.traits.push(feature('operations'));
 Object.assign(blank.creature.traits.at(-1),{englishName:'',sourceQualifier:' ',activationCondition:'',targetSpecial:'\t'});
 Object.assign(blank.creature.traits.at(-1).sourceOperations[0],{condition:' ',targetSpecial:''});
 const normalized=normalizeMonsterIntakeProposal(source,blank),expected=normalizeMonsterIntakeProposal(source,absent);
 expect(normalized).toEqual(expected);expect(normalizeMonsterIntakeProposal(source,normalized)).toEqual(normalized);
 const nonempty=feature('operations',' only this declared recipient ');nonempty.activationCondition=' At the start of its turn ';nonempty.sourceOperations[0].condition=' if it has 1+ HP ';
 const before=structuredClone(nonempty);normalizeCreatureFeatureInput(nonempty,nonempty.description);
 expect(nonempty.activationCondition).toBe(before.activationCondition);expect(nonempty.sourceOperations[0].condition).toBe(before.sourceOperations[0].condition);expect(nonempty.sourceOperations[0].healing.target.special).toBe(before.sourceOperations[0].healing.target.special);
});

test('input field policy: empty containers are materialized without inferring any mechanic',()=>{
 const ir=base();ir.claims=[];ir.coverage=[];for(const key of ['saves','skills','defenses','senses','languages','traits','actions','bonusActions','reactions','legendaryActions'])delete ir.creature[key];
 const normalized=normalizeMonsterIntakeProposal(source,ir),c=normalized.creature;
 expect(c.saves).toEqual({});expect(c.skills).toEqual({});expect(c.senses).toEqual({});expect(c.languages).toEqual({values:[]});
 expect(c.defenses).toEqual({resistances:[],immunities:[],vulnerabilities:[],conditionImmunities:[]});
 expect(c.actions).toEqual([]);expect(normalized.normalizedEmptyFields).toContain('/creature/skills');expect(normalized.normalizedEmptyFields).toContain('/creature/defenses/resistances');
 expect(validateMonsterIntakeIR(source,normalized).blocking).toEqual([]);expect(validateMonsterIntakeIR(source,normalized).warnings.length).toBeGreaterThan(0);
 expect(c.attributes).toEqual(ir.creature.attributes);expect(c.abilities).toEqual(ir.creature.abilities);
 for(const key of ['skills','defenses','senses','languages'])for(const invalid of [null,42,'invalid']){const wrong=base();wrong.creature[key]=invalid;const next=normalizeMonsterIntakeProposal(source,wrong);expect((next.creature as any)[key]).not.toEqual(invalid);expect(next.creature.candidateReview?.findings.some(finding=>finding.path==='/creature/'+key)).toBe(true);expect(wrong.creature[key]).toEqual(invalid);}
});

test('input field policy: optional evidence/index lists do not require model-authored empty placeholders',()=>{
 const ir=base();ir.uncertainties=[{id:'question',code:'QUESTION',path:'/creature',message:'An actual source question',blocking:false}];
 ir.creature.spellcasting=[{featureName:'Declared spells',description:'The creature casts Light.',ability:'wis',usageGroups:[{usage:'at-will',spellRefs:[{originalName:'Light',restrictions:[{kind:'target',text:'Only itself'}]}]}]}];
 const normalized=normalizeMonsterIntakeProposal(source,ir),group=normalized.creature.spellcasting![0]!,usage=group.usageGroups[0]!,ref=usage.spellRefs[0]!;
 expect(group.evidence).toEqual([]);expect(group.abilityEvidence).toEqual([]);expect(group.componentWaivers).toEqual([]);expect(usage.evidence).toEqual([]);expect(ref.aliases).toEqual([]);expect(ref.evidence).toEqual([]);expect(ref.restrictions[0]!.evidence).toEqual([]);
 expect(ref.restrictions[0]!.text).toBe('Only itself');expect(normalized.uncertainties[0]!.message).toBe(ir.uncertainties[0].message);expect(normalized.uncertainties[0]!.evidence).toEqual([]);
 expect(validateMonsterIntakeIR(source,normalized).blocking).toEqual([]);
 for(const invalid of [null,{},'invalid']){const wrong=structuredClone(ir);wrong.creature.spellcasting[0].usageGroups[0].spellRefs[0].aliases=invalid;const next=normalizeMonsterIntakeProposal(source,wrong);expect((next.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0] as any).aliases).toEqual([]);expect(next.creature.candidateReview).toBeDefined();expect(wrong.creature.spellcasting[0].usageGroups[0].spellRefs[0].aliases).toEqual(invalid);}
 const missingGrants=structuredClone(ir);delete missingGrants.creature.spellcasting[0].usageGroups;expect(normalizeMonsterIntakeProposal(source,missingGrants).creature.spellcasting![0]!.usageGroups).toEqual([]);expect(Object.hasOwn(missingGrants.creature.spellcasting[0],'usageGroups')).toBe(false);
});

test('input field policy: a complete singleton uses array defaults while malformed singleton proposals are unchanged',()=>{
 const group={featureName:'Declared spells',description:'The creature casts Light.',ability:'wis',usageGroups:[{usage:'at-will',spellRefs:[{originalName:'Light'}]}]};
 const singleton=base(),array=base();singleton.creature.spellcasting=structuredClone(group);array.creature.spellcasting=[structuredClone(group)];
 const before=structuredClone(singleton);expect(normalizeMonsterIntakeProposal(source,singleton)).toEqual(normalizeMonsterIntakeProposal(source,array));expect(singleton).toEqual(before);
 for(const invalid of [null,{}, {...group,unknown:1},{...group,ability:undefined},{...group,usageGroups:undefined},{...group,evidence:null}]){
  const ir=base();ir.creature.spellcasting=structuredClone(invalid);const normalized=normalizeMonsterIntakeProposal(source,ir);
  expect(Array.isArray(normalized.creature.spellcasting)).toBe(true);expect(ir.creature.spellcasting).toEqual(invalid);expect(normalized.creature.attributes).toEqual(ir.creature.attributes);
 }
 const identified=base();identified.creature.spellcasting=[{...structuredClone(group),groupId:'kept-group'}];identified.creature.spellcasting[0].usageGroups[0].spellRefs[0].refId='kept-ref';
 const dangling={groupId:'missing-group',refId:'missing-spell'};identified.creature.spellcasting[0].usageGroups[0].spellRefs[0].reuseOf=dangling;
 const normalized=normalizeMonsterIntakeProposal(source,identified);expect(normalized.creature.spellcasting![0]!.groupId).toBe('kept-group');expect(normalized.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0]!.refId).toBe('kept-ref');expect(normalized.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0]!.reuseOf).toEqual(dangling);
 expect(validateMonsterIntakeIR(source,normalized).blocking.some(f=>f.path.endsWith('/reuseOf'))).toBe(true);
});

test('input field policy: program operation records are completed without inventing quotes or changing explicit IDs',()=>{
 const record=feature('operations');delete record.sourceOperations[0].id;delete record.sourceOperations[0].proof;
 record.sourceOperations.push({id:'operation-1',name:'Second',type:'heal',relationship:'follow-up',healing:{formula:'10',type:'healing',target:{type:'self',count:1}},proof:{}});
 normalizeCreatureFeatureInput(record,record.description);
 expect(record.sourceOperations[0].id).toBe('operation-1-2');expect(record.sourceOperations[1].id).toBe('operation-1');expect(record.sourceOperations[0].proof).toEqual({});
 expect(record.sourceOperations[0].sourceText).toBe(record.description);expect(sourceOperationStructureErrors(record.sourceOperations)).toEqual([]);
 for(const invalid of [null,[],'invalid']){const wrong=feature('operations');wrong.sourceOperations[0].proof=invalid;normalizeCreatureFeatureInput(wrong,wrong.description);expect(wrong.sourceOperations[0].proof).toEqual({});expect(wrong.candidateReview).toBeDefined();expect(sourceOperationStructureErrors(wrong.sourceOperations)).toEqual([]);}
});

test('input field policy: only inert empty effect lists are omitted; local operation issues retain their fields as GM notes without rejecting other operations',()=>{
 const attack:any={name:'Strike',description:'Melee Attack Roll: +5. Hit: 1d6 damage.',sourceOperations:[{id:'strike',name:'Strike',type:'attack',relationship:'primary',attack:{type:'melee',toHit:5},damage:[{formula:'1d6',type:'piercing',types:[],relationship:'base'}],failureStatuses:[],proof:{}}],appliedConditions:[],nativeFailureStatuses:[],damage:[],spellUseRecords:[]};
 normalizeCreatureFeatureInput(attack,attack.description);expect(attack.sourceOperations[0].failureStatuses).toBeUndefined();expect(attack.sourceOperations[0].damage[0].types).toBeUndefined();expect(attack.appliedConditions).toBeUndefined();expect(attack.damage).toBeUndefined();expect(sourceOperationStructureErrors(attack.sourceOperations)).toEqual([]);
 const invalid=structuredClone(attack);invalid.sourceOperations[0].failureStatuses=['stunned'];normalizeCreatureFeatureInput(invalid,invalid.description);expect(sourceOperationStructureErrors(invalid.sourceOperations)).toEqual([]);expect(invalid.description).toContain('stunned');expect(invalid.sourceOperations[0].attack.toHit).toBe(5);
 const empty={name:'No operation',description:'Source still exists',sourceOperations:[]};normalizeCreatureFeatureInput(empty,empty.description);expect(empty.sourceOperations).toBeUndefined();expect(empty.description).toBe('Source still exists');
 const badDamage=structuredClone(attack);badDamage.sourceOperations[0].damage[0].relationship='conditional';badDamage.sourceOperations[0].damage[0].condition='if the target is grappled';expect(sourceOperationStructureErrors(badDamage.sourceOperations)).toContain('0/damage/0/independent-damage-required');
 for(const invalid of [null,{},42]){const wrong=feature('operations',invalid);normalizeCreatureFeatureInput(wrong,wrong.description);expect(wrong.sourceOperations[0].healing.target.special).toBe(JSON.stringify(invalid));expect(wrong.candidateReview).toBeDefined();expect(sourceOperationStructureErrors(wrong.sourceOperations)).toEqual([]);}
 const missingAmount=feature('operations');missingAmount.sourceOperations[0].healing.formula='';normalizeCreatureFeatureInput(missingAmount,missingAmount.description);expect(missingAmount.sourceOperations).toBeUndefined();expect(missingAmount.candidateReview).toBeDefined();
});

const frozen=process.env.FORGE_CONTRACT_FROZEN_ROOT;
test.skipIf(!frozen)('input field policy: untouched real Shield Guardian first answer reaches the full provider and formal Actor path',async()=>{
 const sourcePath=join(frozen!,'sources/shield-guardian/source.md'),replyPath=join(frozen!,'results/single-shield-guardian/raw-answer.txt');
 const sourceBytes=readFileSync(sourcePath),replyBytes=readFileSync(replyPath),actualSource=sourceBytes.toString('utf8'),raw=replyBytes.toString('utf8');
 let responses=0;const evidence:any[]=[];
 const real=new OpenAICompatibleMonsterIntakeProvider({baseUrl:'https://frozen.invalid',apiKey:'fixture',model:'frozen',maxAttempts:1,timeoutMs:10000,repairTimeoutMs:10000,
  responseEvidence:{record:row=>{evidence.push(row);}},httpClient:async()=>{responses++;return Response.json({choices:[{message:{content:raw}}]});}});
 const current={...input,source:actualSource,sourceName:'Shield Guardian'},analysis=await analyzeBrowserActorSourceWithAi(current,real),generation=await generateBrowserActorIntakeCandidate(current,analysis,provider),actor=(generation.candidateResponse as any)?.result?.artifact;
 expect(responses).toBe(1);expect(evidence[0].content).toBe(raw);expect(analysis.validation?.blocking).toEqual([]);expect(generation.findings).toEqual([]);expect(generation.candidateAvailable).toBe(true);
 expect(actor.system.attributes.hp.value).toBe(142);expect(actor.system.attributes.ac.flat).toBe(17);expect(actor.system.details.cr).toBe(7);expect(actor.items).toHaveLength(6);
 const regen=actor.items.find((item:any)=>item.name==='Regeneration'),heal=Object.values(regen.system.activities).find((entry:any)=>entry.type==='heal') as any;expect(heal.target.affects.type).toBe('self');
 expect(actor.items.some((item:any)=>item.type==='spell')).toBe(false);expect(actor.items.find((item:any)=>item.name==='Spell Storing').system.description.value).toContain('parameters set by the original caster');
 expect(readFileSync(sourcePath)).toEqual(sourceBytes);expect(readFileSync(replyPath)).toEqual(replyBytes);expect(JSON.parse(raw).creature.traits[1].sourceOperations[0].healing.target.special).toBeUndefined();
 if(process.env.FORGE_CONTRACT_EVIDENCE_ROOT){const root=process.env.FORGE_CONTRACT_EVIDENCE_ROOT;writeFileSync(join(root,'shield-regenerated.json'),JSON.stringify({sourceHash:hashSource(actualSource),rawReplyHash:hashSource(raw),analysis,generation,actor},null,2)+'\n');writeFileSync(join(root,'shield-replay-receipt.json'),JSON.stringify({status:'PASS',actualNetwork:0,modelCalls:0,review:0,repair:0,responses,rawReplyUnchanged:true,candidateAvailable:true,findings:generation.findings},null,2)+'\n');}
});

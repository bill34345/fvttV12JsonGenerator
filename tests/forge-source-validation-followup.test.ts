import {describe,test,expect} from 'bun:test';
import yaml from 'js-yaml';
import {existsSync,readFileSync} from 'node:fs';
import {bindSourceOperations,sourceOperationClauses,sourceOperationErrors,sourceFeatureResources,sourceOperationSelfArea,sourceFeatureBasicOmissions,materializeSourceOperationEvidence,sourceHealingOperations} from '@fvtt-json-generator/models/source-operations';
import healingFixture from './fixtures/forge-regenerate-healing.json';
import {sourceSingleSpellAction} from '@fvtt-json-generator/models/source-rule-facts';
import {isSourceCandidateReview,isSourceCandidateCounters} from '@fvtt-json-generator/models/source-operations';
import {sourceOperationFeatureErrors} from '../packages/intake-ai/src/staged-feature-mechanics';
import {validateMonsterIntakeIR,auditMonsterIntakeSource} from '@fvtt-json-generator/intake-ai/validator';
import {buildRatWarlockIr,RAT_WARLOCK_SOURCE} from '../src/core/intake/__tests__/fixtures/rat-warlock';
import {nativeAreaShape} from '@fvtt-json-generator/models/source-operations';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';

const review=()=>({version:1 as const,findings:[{code:'UNRESOLVED_SOURCE',path:'/feature',message:'The original proposal still needs review.'}],proposal:{original:true}});

describe('source-bound scalar proof list recovery',()=>{
  const quote='At the end of each of the sentinel’s turns, each creature in a 10-foot Emanation originating from the sentinel takes 5 (1d10) Fire damage.';
  const source='Pulse. '+quote;
  const proposal=(aoe:unknown):any[]=>[{id:'pulse',name:'Pulse',type:'damage',relationship:'primary',damage:[{formula:'1d10',type:'fire',relationship:'conditional'}],aoe:{shape:'radius',radius:10},proof:{damage:[quote],aoe}}];
  test('a complete singleton area quote produces the same operation and Self origin as its scalar form',()=>{
    const raw=proposal([quote]),before=structuredClone(raw),bound=bindSourceOperations(source,raw);
    expect(bound).toEqual(bindSourceOperations(source,proposal(quote)));
    expect(bound[0]!.proof.aoe).toBe(quote);expect(bound[0]!.proof.damage).toEqual([quote]);
    expect(sourceOperationSelfArea(source,bound[0]!,'sentinel')).toBe(true);
    expect(sourceOperationErrors(source,bound)).toEqual([]);expect(raw).toEqual(before);
    expect(bindSourceOperations(source,bound)).toEqual(bound);
  });
  for(const [label,proof] of [
    ['empty',[]],['multiple',[quote,quote]],['nested',[[quote]]],['number',[10]],['null',[null]],['blank',['']],
    ['clipped',['each creature in a 10-foot Emanation originating from the sentinel']],
    ['changed',[quote.replace('10-foot','20-foot')]],
    ['other ability',['Each creature in a 10-foot Emanation originating from a different creature takes 5 (1d10) Fire damage.']],
  ] as const)test('keeps invalid '+label+' proof visible',()=>{
    const raw=proposal(proof),before=structuredClone(raw),bound:any=materializeSourceOperationEvidence(source,raw);
    expect(bound[0].proof.aoe).toEqual(proof);expect(sourceOperationErrors(source,bound)).toContain('0/proof/aoe');
    expect(raw).toEqual(before);
  });
  test('a duplicated source sentence is ambiguous, and missing proofs are not invented',()=>{
    const raw=proposal([quote]),duplicate=source+' '+quote,bound:any=materializeSourceOperationEvidence(duplicate,raw);
    expect(bound[0].proof.aoe).toEqual([quote]);expect(sourceOperationErrors(duplicate,bound)).toContain('0/proof/aoe');
    const missing=proposal(undefined);delete missing[0].proof.aoe;
    expect((materializeSourceOperationEvidence(source,missing) as any)[0].proof.aoe).toBeUndefined();
    expect(()=>bindSourceOperations(source,missing)).toThrow('proof/aoe');
  });
  test('wrong facts and foreign origins remain independently checked after format recovery',()=>{
    for(const mutate of [(op:any)=>{op.aoe.radius=20;},(op:any)=>{op.damage[0].formula='2d10';}]){
      const raw=proposal([quote]);mutate(raw[0]);const bound:any=materializeSourceOperationEvidence(source,raw);
      expect(bound[0].proof.aoe).toBe(quote);expect(sourceOperationErrors(source,bound).length).toBeGreaterThan(0);
    }
    const foreign=source.replaceAll('the sentinel','the other creature'),foreignQuote=quote.replaceAll('the sentinel','the other creature'),bound=bindSourceOperations(foreign,proposal([foreignQuote]).map(op=>({...op,proof:{aoe:[foreignQuote],damage:[foreignQuote]}})));
    expect(sourceOperationSelfArea(foreign,bound[0]!,'sentinel')).toBe(false);
  });
  test('damage lists and unknown proof fields are not coerced to scalars',()=>{
    const raw=proposal([quote]);raw[0].proof.damage=quote;raw[0].proof.unknown=[quote];
    const bound:any=materializeSourceOperationEvidence(source,raw);
    expect(bound[0].proof.damage).toBe(quote);expect(bound[0].proof.unknown).toEqual([quote]);
    expect(sourceOperationErrors(source,bound).length).toBeGreaterThan(0);
  });
  test('neutral Attack and target proof wrappers retain the exact bonus, reach and recipient',()=>{
    const attack='Melee Attack Roll: +6, reach 5 ft., one creature.',hit='Hit: 5 (1d6 + 2) Piercing damage.',parent='Claw. '+attack+' '+hit;
    const raw=[{id:'claw',name:'Claw',type:'attack',relationship:'primary',attack:{type:'melee',toHit:6,reach:5},targetSpecial:'one creature',damage:[{formula:'1d6 + 2',type:'piercing',relationship:'base'}],proof:{attack:[attack],target:[attack],damage:[hit]}}],before=structuredClone(raw);
    const bound=bindSourceOperations(parent,raw);expect(bound[0]!.proof).toEqual({attack,target:attack,damage:[hit]});expect(raw).toEqual(before);
    const wrong=structuredClone(raw);wrong[0]!.attack.toHit=7;expect(()=>bindSourceOperations(parent,wrong)).toThrow('attack/type-or-bonus');
  });
  test('Save and range wrappers retain independent DC and distance checks',()=>{
    const save='Constitution Saving Throw: DC 17, each creature in a 10-foot-radius Sphere centered on a point within 60 feet.',parent='Burst. '+save;
    const raw=[{id:'burst',name:'Burst',type:'save',relationship:'primary',save:{dc:17,abilities:['con'],choice:'single',outcome:'none'},range:60,aoe:{shape:'sphere',radius:10},proof:{save:[save],range:[save],aoe:[save]}}],before=structuredClone(raw);
    const bound=bindSourceOperations(parent,raw);expect(bound[0]!.proof).toEqual({save,range:save,aoe:save});expect(raw).toEqual(before);
    for(const mutate of [(op:any)=>{op.save.dc=18;},(op:any)=>{op.range=90;}]){const wrong=structuredClone(raw);mutate(wrong[0]);expect(()=>bindSourceOperations(parent,wrong)).toThrow();}
  });
  test('both healing proofs recover without changing formulas, recipients or timing',()=>{
    const parent=healingFixture.case.features[0]!.text,ops=sourceHealingOperations(parent)!,raw:any=structuredClone(ops);
    for(const op of raw)op.proof.healing=[op.proof.healing];const before=structuredClone(raw);
    expect(bindSourceOperations(parent,raw)).toEqual(bindSourceOperations(parent,ops));expect(raw).toEqual(before);
    raw[1].healing.formula='99';expect(()=>bindSourceOperations(parent,raw)).toThrow();
  });
});

describe('timed GM rolls distinguish missing operations from field conflicts',()=>{
  test('an empty list is missing operations; a malformed or oversized list is a structural conflict',()=>{
    const source='Pulse. Each creature takes 3d8 Fire damage.';
    expect(sourceFeatureBasicOmissions(source,{sourceOperations:[]} as any)).toEqual(['operations']);
    for(const operations of [{},Array(17).fill({id:'pulse'})]){
      expect(sourceOperationErrors(source,operations)).toEqual(['operations']);
      expect(sourceFeatureBasicOmissions(source,{sourceOperations:operations} as any)).toEqual([]);
    }
  });
  for(const timing of ['At the end of each of the sentinel’s turns','At the start of each of the sentinel’s turns','The first time a creature enters the area on a turn'])test('a present timed damage button is not reported missing: '+timing,()=>{
    const quote=timing+', each creature in a 5-foot Emanation originating from the sentinel takes 13 (3d8) Fire damage.',source='Pulse. '+quote;
    const proposed=[{id:'pulse',name:'Pulse',type:'damage',relationship:'primary',damage:[{formula:'3d8',type:'fire',relationship:'base'}],aoe:{shape:'radius',radius:5},proof:{damage:[quote],aoe:quote}}];
    const operations=materializeSourceOperationEvidence(source,proposed),before=structuredClone(operations);
    expect(sourceOperationErrors(source,operations)).toEqual(['0/damage/0/condition']);
    expect(sourceFeatureBasicOmissions(source,{sourceOperations:operations} as any)).toEqual([]);
    expect(operations).toEqual(before);
    const conditional=structuredClone(proposed);conditional[0]!.damage[0]!.relationship='conditional';
    const bound=bindSourceOperations(source,conditional);
    expect(bound[0]!.relationship).toBe('primary');expect(bound[0]!.condition).toBe(source);expect(bound[0]!.damage![0]!.condition).toBe(source);
    expect(sourceOperationErrors(source,bound)).toEqual([]);
  });
  test('recurring damage and a later Save remain independently required, without reusing the initial Save',()=>{
    const initial='Dexterity Saving Throw: DC 18, one creature.',damage='While swallowed, a creature takes 21 (6d6) Acid damage at the start of each of the sentinel’s turns.',later='If the sentinel takes 30 damage or more on a single turn from the swallowed creature, the sentinel must succeed on a DC 14 Constitution saving throw at the end of that turn or regurgitate the creature.';
    const source='Engulf. '+initial+' Failure: The sentinel swallows the target. '+damage+' '+later;
    const primary={id:'engulf',name:'Engulf',type:'save',relationship:'primary',save:{dc:18,abilities:['dex'],choice:'single',outcome:'none'},proof:{save:initial}};
    const acid={id:'acid',name:'Recurring acid (GM)',type:'damage',relationship:'follow-up',damage:[{formula:'6d6',type:'acid',relationship:'conditional'}],proof:{damage:[damage]}};
    const con={id:'con',name:'Regurgitation (GM)',type:'save',relationship:'follow-up',save:{dc:14,abilities:['con'],choice:'single',outcome:'none'},proof:{save:later}};
    const prepare=(ops:unknown)=>materializeSourceOperationEvidence(source,ops);
    expect(sourceFeatureBasicOmissions(source,{sourceOperations:prepare([primary])} as any)).toEqual(['inventory/damage-omitted','inventory/save-omitted']);
    expect(sourceOperationErrors(source,prepare([primary,acid]))).toEqual(['inventory/save-omitted']);
    expect(sourceOperationErrors(source,prepare([primary,con]))).toEqual(['inventory/damage-omitted']);
    const bound=bindSourceOperations(source,[primary,acid,con]);
    expect(sourceOperationErrors(source,bound)).toEqual([]);expect(bound.map(op=>op.relationship)).toEqual(['primary','follow-up','follow-up']);
    expect(bound[0]!.damage).toBeUndefined();expect(bound[1]!.damage).toMatchObject([{formula:'6d6',type:'acid',relationship:'conditional'}]);expect(bound[2]!.save).toMatchObject({dc:14,abilities:['con']});
    const wrong=structuredClone(bound);wrong[2]!.save!.dc=18;expect(sourceOperationErrors(source,wrong).length).toBeGreaterThan(0);
  });
});

describe('explicit 2024 Emanations use native radius without rewriting model data',()=>{
  const rule='Pulse. Dexterity Saving Throw: DC 15, each creature in a 10-foot Emanation originating from the sentinel. Failure: 7 (2d6) Fire damage. Success: Half damage.';
  function areaIr(description=rule,legacy=false,distance=10):MonsterIntakeIR{
    const clauses=sourceOperationClauses(description),save=clauses.find(q=>q.startsWith('Dexterity'))!,hit=clauses.find(q=>q.startsWith('Failure:'))!;
    const operations=bindSourceOperations(description,[{id:'pulse',name:'Pulse',type:'save',relationship:'primary',save:{dc:15,abilities:['dex'],choice:'single',outcome:'half'},damage:[{formula:'2d6',type:'fire',relationship:'base'}],aoe:{shape:'sphere',radius:distance},proof:{save,damage:[hit],aoe:save}}]);
    const feature:any={name:'Pulse',description,activityType:legacy?'save':'utility',executionMode:'native-with-gm',nativeRuleText:description,manualRemainder:description,evidence:[{start:0,end:description.length,quote:description}],...(legacy?{save:{dc:15,ability:'dex',outcome:'half'},damage:[{formula:'2d6',type:'fire',relationship:'base'}],aoe:{shape:'sphere',radius:distance}}:{sourceOperations:operations})};
    return{schemaVersion:1,source:{sha256:hashSource(description),length:description.length},claims:[],coverage:[],uncertainties:[],creature:{identity:{name:'Scope Sentinel',size:'medium',creatureType:'construct'},abilities:{str:10,dex:10,con:16,int:10,wis:10,cha:10},attributes:{ac:12,hp:{value:30,formula:'4d8 + 12'},movement:{walk:30},cr:1},saves:{},skills:{},defenses:{resistances:[],immunities:[],vulnerabilities:[],conditionImmunities:[]},senses:{},languages:{values:[]},traits:[],actions:[feature],bonusActions:[],reactions:[],legendaryActions:[]}};
  }
  async function actor(markdown:string){
    const result=await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',translationService:null,iconOptions:{mode:'off'}});
    expect(result.rawJson).toBeDefined();return result.rawJson as any;
  }
  const saveActivity=(output:any)=>Object.values<any>(output.items[0].system.activities).find(a=>a.type==='save')!;
  test('SourceOP proof maps the native area while all formulas, distances and raw fields survive',async()=>{
    const ir=areaIr(),before=structuredClone(ir),markdown=renderMonsterIntakeMarkdown(ir),output=await actor(markdown),activity=saveActivity(output);
    expect(activity.target.template).toMatchObject({type:'radius',size:'10',units:'ft'});expect(activity.range.units).toBe('self');
    expect(activity.save).toEqual({ability:['dex'],dc:{calculation:'',formula:'15'}});expect(activity.damage.onSave).toBe('half');
    expect(activity.damage.parts).toMatchObject([{number:2,denomination:6,types:['fire']}]);expect(ir).toEqual(before);
    const findings=verifyMonsterIntake(rule,ir,markdown,output).findings;
    expect(findings.filter(f=>f.code==='ACTOR_SOURCE_OPERATION_AREA_DRIFT'||f.path.endsWith('/aoe'))).toEqual([]);
    for(const type of ['sphere','cone']){const bad=structuredClone(output);saveActivity(bad).target.template.type=type;expect(verifyMonsterIntake(rule,ir,markdown,bad).findings.some(f=>f.code==='ACTOR_SOURCE_OPERATION_AREA_DRIFT')).toBe(true);}
  });
  test('legacy flat AoE also maps when parsed from a sphere-labelled standard document',async()=>{
    const ir=areaIr(rule,true),before=structuredClone(ir),markdown=renderMonsterIntakeMarkdown(ir),data=yaml.load(markdown.slice(4,markdown.lastIndexOf('---'))) as any;
    // Test-authored legacy input, never a patch to a generated Actor.
    const entry=data.动作[0];entry.AoE.形状='球形';
    const output=await actor('---\n'+yaml.dump(data,{lineWidth:-1})+'---\n');
    expect(saveActivity(output).target.template.type).toBe('radius');expect(saveActivity(output).target.template.size).toBe(10);expect(ir).toEqual(before);
  });
  test('a genuine Sphere remains a Sphere through the same formal workflow',async()=>{
    const description=rule.replace('10-foot Emanation originating from the sentinel','10-foot-radius Sphere centered on a point'),ir=areaIr(description),before=structuredClone(ir);
    const output=await actor(renderMonsterIntakeMarkdown(ir));expect(saveActivity(output).target.template).toMatchObject({type:'sphere',size:'10'});expect(ir).toEqual(before);
  });
  test('explicit Emanation formats and an already-correct radius have stable representations',()=>{
    for(const text of ['Each creature in a 10-foot Emanation originating from you.','Each creature in a 10-foot\r\n**Emanation** originating from you.','An aura radiates from you in a 10-foot Emanation for the duration.','You create a 10-foot Emanation originating from you that does not affect Constructs or Undead.']){
      expect(nativeAreaShape('sphere',10,text)).toBe('radius');expect(nativeAreaShape('radius',10,text)).toBe('radius');
    }
  });
  // Isolate the CHM area wording from unchanged save/damage grammar. These
  // are regression fixtures, not complete translated monster stat blocks.
  for(const [distance,phrase] of [
    [30,'源自炎魔的30尺光环区域'],
    [5,'源自炎魔5尺 \n光环 区域'],
    [15,'保护性的灵体环绕在你的周围15尺光环区域内飞舞'],
  ] as const)test('CHM 2024 area wording survives formal generation: '+phrase,async()=>{
    const description=rule.replace('10-foot Emanation originating from the sentinel',phrase),ir=areaIr(description,false,distance);
    ir.creature.identity.name='炎魔';
    const before=structuredClone(ir),operations=ir.creature.actions[0]!.sourceOperations!;
    expect(sourceOperationErrors(description,operations).filter(error=>error.includes('/aoe'))).toEqual([]);
    const markdown=renderMonsterIntakeMarkdown(ir),output=await actor(markdown),activity=saveActivity(output);
    expect(activity.target.template).toMatchObject({type:'radius',size:String(distance),units:'ft'});
    expect(activity.range.units).toBe('self');expect(activity.damage.parts).toMatchObject([{number:2,denomination:6,types:['fire']}]);
    expect(ir).toEqual(before);
    expect(verifyMonsterIntake(description,ir,markdown,output).findings.filter(f=>f.code==='ACTOR_SOURCE_OPERATION_AREA_DRIFT'||f.code==='ACTOR_SOURCE_OPERATION_RANGE_DRIFT')).toEqual([]);
  });
  test('CHM 球状 with a descriptive noun is Sphere, and 半径 does not prove radius',async()=>{
    const description=rule.replace('10-foot Emanation originating from the sentinel','半径20尺的黄色恶心气体云团球状区域'),ir=areaIr(description,false,20),before=structuredClone(ir);
    const operations=ir.creature.actions[0]!.sourceOperations!;
    expect(sourceOperationErrors(description,operations).filter(error=>error.includes('/aoe'))).toEqual([]);
    const output=await actor(renderMonsterIntakeMarkdown(ir));expect(saveActivity(output).target.template).toMatchObject({type:'sphere',size:'20',units:'ft'});expect(ir).toEqual(before);
    const wrong=structuredClone(operations);wrong[0]!.aoe!.shape='radius';
    expect(sourceOperationErrors(description,wrong)).toContain('0/aoe');
  });
  test('CHM self origin is tied to its emitter rather than to any nearby Actor name',()=>{
    const description=rule.replace('10-foot Emanation originating from the sentinel','源自炎魔的10尺光环区域'),op=areaIr(description).creature.actions[0]!.sourceOperations![0]!;
    expect(sourceOperationSelfArea(description,op,'炎魔')).toBe(true);
    expect(sourceOperationSelfArea(description,op,'其他恶魔')).toBe(false);
    expect(nativeAreaShape('sphere',10,'在10尺光环区域内，不影响不死生物。')).toBe('radius');
  });
  for(const description of ['这不是10尺光环区域。','10尺光环区域不存在。','10尺光环与半径20尺的球状区域重叠。'])test('CHM invalid radius proof remains a finding: '+description,()=>{
    const complete=rule.replace('10-foot Emanation originating from the sentinel',description.replace(/。$/u,'')),save=sourceOperationClauses(complete).find(q=>q.startsWith('Dexterity'))!;
    // An intentionally invalid proposal must not go through the strict binder
    // before the negative assertion gets to inspect its actual source error.
    const operations=materializeSourceOperationEvidence(complete,[{id:'invalid-area',name:'Invalid area',type:'save',relationship:'primary',save:{dc:15,abilities:['dex'],choice:'single',outcome:'half'},damage:[{formula:'2d6',type:'fire',relationship:'base'}],aoe:{shape:'radius',radius:10},proof:{save,aoe:save,damage:[sourceOperationClauses(complete).find(q=>q.startsWith('Failure:'))!]}}]);
    expect(sourceOperationErrors(complete,operations)).toContain('0/aoe');
  });
  for(const text of [
    'Fire Aura. Each creature in a 10-foot-radius Sphere takes damage.',
    'A 10-foot Emanation and a 30-foot Sphere overlap.',
    'The area is a 10-foot-radius Sphere; creatures in a 10-foot Emanation around you are immune.',
    'This is not considered a 10-foot Emanation.',
    'A 10-foot Emanation does not appear.',
    'This is not a 10-foot Emanation.',
    'An aura of light surrounds the creature.',
    'Each creature in a 20-foot Emanation originating from you.',
    '火焰灵光。在半径10尺的球状区域内造成伤害。',
    '这不是10尺光环区域。',
    '10尺光环区域不存在。',
    '10尺光环与半径20尺的球状区域重叠。',
    '只有5尺光环区域。',
  ])test('conservative near-counterexample keeps sphere: '+text,()=>expect(nativeAreaShape('sphere',10,text)).toBe('sphere'));
});

test('one neutral operation proves both source geometries without concealing wrong facts',()=>{
  const source='Javelin. Melee or Ranged Attack Roll: +6, reach 10 ft. or range 30/90 ft. Hit: 12 (2d8 + 3) Piercing damage.';
  const proof=source.slice(source.indexOf('Melee'));
  const op={id:'throw',name:'Javelin',type:'attack',relationship:'primary',sourceText:source,
    attack:{type:'melee',toHit:6,reach:10,range:30,longRange:90},damage:[{formula:'2d8 + 3',type:'piercing',relationship:'base'}],
    proof:{attack:proof,damage:[proof],range:proof}};
  const before=JSON.stringify(op);expect(sourceOperationErrors(source,[op])).toEqual([]);expect(JSON.stringify(op)).toBe(before);
  expect(sourceOperationErrors(source,[{...op,attack:{...op.attack,type:'ranged'}}])).toEqual([]);
  for(const edit of [(x:any)=>{x.attack.toHit=7;},(x:any)=>{x.attack.reach=5;},(x:any)=>{x.attack.range=60;},(x:any)=>{x.attack.longRange=120;},(x:any)=>{delete x.attack.range;},(x:any)=>{x.attack.type='mwak';},(x:any)=>{x.damage[0].formula='1d6';}]){
    const changed=structuredClone(op);edit(changed);expect(sourceOperationErrors(source,[changed]).length).toBeGreaterThan(0);
  }
  expect(sourceOperationErrors(source,[op,{...structuredClone(op),id:'duplicate'}]).length).toBeGreaterThan(0);
});

const mageSeed='.local/forge-candidate-followup-20261022/candidate-seed.json';
test.skipIf(!existsSync(mageSeed))('frozen Mage findings distinguish malformed proposal from a separately source-proven revision',()=>{
  const original=readFileSync(mageSeed,'utf8'),seed=JSON.parse(original),source=seed.source;
  const raw=validateMonsterIntakeIR(source,seed.ir);
  const actionFindings=raw.blocking.filter(f=>f.path.startsWith('/creature/actions/1'));
  expect(actionFindings.filter(f=>f.code==='SOURCE_OPERATION_FACT_CONFLICT').map(f=>f.path)).toEqual([
    '/creature/actions/1/sourceOperations/0/sourceText',
    '/creature/actions/1/sourceOperations/inventory/attack-choice-omitted',
    '/creature/actions/1/sourceOperations/inventory/damage-omitted',
    '/creature/actions/1/sourceOperations/inventory/attack-omitted',
  ]);
  expect(actionFindings.some(f=>f.code==='SOURCE_BASIC_OPERATION_OMITTED')).toBe(true);
  expect(actionFindings.some(f=>f.code==='MIXED_FEATURE_SOURCE_CONFLICT')).toBe(false);
  expect(seed.ir.creature.actions[1].candidateReview.findings[0].code).toBe('V2_ATTACK_MODE_CONFLICT');
  expect(raw.blocking.filter(f=>f.code==='SPELL_REFERENCE_SOURCE_MISMATCH')).toHaveLength(2);
  // Counterfactual validator fixture only. This is not an edit/regrade of the
  // saved reply, a new model result or a generated Actor delivered to a user.
  const revised=structuredClone(seed.ir),feature=revised.creature.actions[1];
  const quote=sourceOperationClauses(feature.description).find((q:string)=>q.includes('Attack Roll:'))!;
  const common={name:feature.name,type:'attack' as const,condition:feature.description.trim(),
    damage:[{formula:'3d8+3',type:'force',relationship:'base' as const}],proof:{attack:quote,damage:[quote]}};
  feature.sourceOperations=bindSourceOperations(feature.description,[
    {...common,id:'near',relationship:'primary',attack:{type:'melee',toHit:6,reach:5}},
    {...common,id:'far',relationship:'alternative',attack:{type:'ranged',toHit:6,range:120}},
  ],feature.evidence[0].start);
  delete feature.candidateReview;
  const dcEvidence=revised.creature.spellcasting[0].saveDcEvidence;
  expect(revised.creature.spellcasting[0].saveDc).toBe(14);
  for(const child of revised.creature.spellcasting.slice(1)){child.saveDc=14;child.saveDcEvidence=structuredClone(dcEvidence);}
  // Fixing source facts in a separate proposal does not erase the original
  // top-level unresolved review note or silently promote it to accepted.
  expect(validateMonsterIntakeIR(source,revised).blocking.map(f=>f.code)).toEqual(['V2_ATTACK_MODE_CONFLICT']);
  const wrong=structuredClone(revised);wrong.creature.spellcasting[1].saveDc=99;
  expect(validateMonsterIntakeIR(source,wrong).blocking.some(f=>f.code==='SPELL_REFERENCE_SOURCE_MISMATCH')).toBe(true);
  const omitted=structuredClone(revised);omitted.creature.actions[1].sourceOperations.pop();
  expect(validateMonsterIntakeIR(source,omitted).blocking.some(f=>f.code==='SOURCE_BASIC_OPERATION_OMITTED')).toBe(true);
  expect(readFileSync(mageSeed,'utf8')).toBe(original);
  expect(validateMonsterIntakeIR(source,seed.ir).blocking).toEqual(raw.blocking);
});

describe('source proof and inert candidate review are independent',()=>{
  for(const [name,kind,bonus,dice,damage] of [['Chill','Melee',5,'2d6','Cold'],['Spark','Ranged',7,'1d8+3','Fire'],['Knock','Melee',4,'1d4+2','Bludgeoning']] as const){
    test(`${name}: valid review metadata cannot become a legacy mechanic conflict`,()=>{
      const distance=kind==='Melee'?'reach 5 ft.':'range 60 ft.';
      const source=`${name}. ${kind} Attack Roll: +${bonus}, ${distance} Hit: 7 (${dice}) ${damage} damage.`;
      const clause=sourceOperationClauses(source).find(q=>q.includes('Attack Roll:'))!;
      const operations=bindSourceOperations(source,[{id:'hit',name,type:'attack',relationship:'primary',
        attack:{type:kind==='Melee'?'melee':'ranged',toHit:bonus,...(kind==='Melee'?{reach:5}:{range:60})},
        damage:[{formula:dice,type:damage.toLowerCase(),relationship:'base'}],proof:{attack:clause,damage:[clause]}}]);
      const feature={name,description:source,activityType:'utility' as const,executionMode:'native-with-gm' as const,
        nativeRuleText:source,manualRemainder:source,sourceOperations:operations,candidateReview:review()};
      expect(sourceOperationErrors(source,operations)).toEqual([]);
      expect(sourceOperationFeatureErrors(feature)).toEqual([]);
      const wrong=structuredClone(operations);wrong[0]!.attack!.toHit++;
      expect(sourceOperationErrors(source,wrong).length).toBeGreaterThan(0);
      expect(sourceOperationFeatureErrors({...feature,damage:[{formula:'99d6',type:'fire',relationship:'base'}]}).some(e=>e.field==='damage')).toBe(true);
    });
  }
  test('closed review metadata is recognized on a spell group without suppressing its actual findings',()=>{
    const ir=buildRatWarlockIr();
    expect(ir.creature.spellcasting?.length).toBeGreaterThan(0);
    const baseline=validateMonsterIntakeIR(RAT_WARLOCK_SOURCE,ir);
    ir.creature.spellcasting![0]!.candidateReview=review();
    const result=validateMonsterIntakeIR(RAT_WARLOCK_SOURCE,ir);
    expect(result.findings.filter(f=>f.code==='UNKNOWN_SPELLCASTING_PROPERTY')).toEqual(baseline.findings.filter(f=>f.code==='UNKNOWN_SPELLCASTING_PROPERTY'));
    expect(result.findings.map(f=>[f.code,f.path])).toEqual(baseline.findings.map(f=>[f.code,f.path]));
    ir.creature.spellcasting![0]!.saveDc=99;
    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE,ir).blocking.some(f=>f.path.includes('saveDc'))).toBe(false);
    expect(auditMonsterIntakeSource(RAT_WARLOCK_SOURCE,ir).blocking.some(f=>f.code==='SPELL_SAVE_DC_EVIDENCE_MISMATCH'&&f.path==='/creature/spellcasting/0/saveDc')).toBe(true);
  });
  test('review metadata cannot smuggle unknown fields or malformed findings',()=>{
    expect(isSourceCandidateReview(review())).toBe(true);
    expect(isSourceCandidateReview({...review(),execute:'attack'})).toBe(false);
    expect(isSourceCandidateReview({...review(),findings:[{...review().findings[0],execute:'attack'}]})).toBe(false);
    expect(isSourceCandidateCounters([{name:'Unresolved cadence',max:2,recovery:'weekly'}])).toBe(true);
    expect(isSourceCandidateCounters([{name:'Unresolved cadence',max:2,recovery:'weekly',execute:'attack'}])).toBe(false);
    const ir=buildRatWarlockIr();
    (ir.creature.spellcasting![0] as any).candidateReview={...review(),execute:'attack'};
    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE,ir).blocking.some(f=>f.code==='INVALID_STRUCTURE'&&f.path==='/creature/spellcasting/0/candidateReview')).toBe(true);
    expect(auditMonsterIntakeSource(RAT_WARLOCK_SOURCE,ir).blocking.some(f=>f.code==='INVALID_CANDIDATE_REVIEW'&&f.path==='/creature/spellcasting/0/candidateReview')).toBe(true);
  });
});

describe('conditional lair quota never becomes an unconditional Item counter',()=>{
  for(const [owner,subject,max] of [['Adult Brass Dragon','the dragon',3],['Granite Sentinel','the sentinel',2],['Dream Arbiter','the arbiter',4]] as const){
    test(`${owner}: the conditional rule cannot create a second Item counter`,()=>{
      const name=`Resolve (${max}/Day, or ${max+1}/Day in Lair)`;
      const source=`${name}. If ${subject} fails a saving throw, it can choose to succeed instead.`;
      expect(sourceFeatureResources(name,source,owner).uses).toBeUndefined();
      expect(sourceFeatureResources(name,source.replace(subject,'the intruder'),owner).uses).toBeUndefined();
      expect(sourceFeatureResources(name,source.replace('fails a saving throw','takes damage'),owner).uses).toBeUndefined();
    });
  }
  test('an unrelated conditional counter still has no unconditional daily pool',()=>{
    const name='Veil (3/Day while in Darkness)';
    expect(sourceFeatureResources(name,`${name}. The sentinel becomes invisible.`,'Granite Sentinel').uses).toBeUndefined();
    expect(sourceFeatureResources('Arrow (2/Day)','Arrow (2/Day). The sentinel fires an arrow.','Granite Sentinel').uses).toEqual({max:2,period:'day'});
  });
});

describe('an optional use of existing Spellcasting is not a new independent grant',()=>{
  for(const source of [
    'Multiattack. The dragon makes three Rend attacks. It can replace one attack with a use of (A) Sleep Breath or (B) Spellcasting to cast Scorching Ray.',
    'Routine. The sentinel makes two strikes. It can replace one attack with a use of Spellcasting to cast Light.',
    'Sequence. The arbiter makes four attacks. It can replace 1 attack with a use of Spellcasting to cast Fog Cloud.',
  ])test(source.split('.')[0]!,()=>expect(sourceSingleSpellAction(source)).toBeUndefined());
  test('direct grants and references to a different ability remain visible',()=>{
    expect(sourceSingleSpellAction('Spellcasting. The sentinel casts Light.')).toMatchObject({name:'Light'});
    expect(sourceSingleSpellAction('Routine. It can replace one attack with a use of Fireburst to cast Fireball.')).toMatchObject({name:'Fireball'});
  });
});

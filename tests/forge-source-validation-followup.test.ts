import {describe,test,expect} from 'bun:test';
import {existsSync,readFileSync} from 'node:fs';
import {bindSourceOperations,sourceOperationClauses,sourceOperationErrors,sourceFeatureResources} from '@fvtt-json-generator/models/source-operations';
import {sourceSingleSpellAction} from '@fvtt-json-generator/models/source-rule-facts';
import {isSourceCandidateReview,isSourceCandidateCounters} from '@fvtt-json-generator/models/source-operations';
import {sourceOperationFeatureErrors} from '../packages/intake-ai/src/staged-feature-mechanics';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {buildRatWarlockIr,RAT_WARLOCK_SOURCE} from '../src/core/intake/__tests__/fixtures/rat-warlock';

const review=()=>({version:1 as const,findings:[{code:'UNRESOLVED_SOURCE',path:'/feature',message:'The original proposal still needs review.'}],proposal:{original:true}});

const mageSeed='.local/forge-candidate-followup-20261022/candidate-seed.json';
test.skipIf(!existsSync(mageSeed))('frozen Mage findings distinguish malformed proposal from a separately source-proven revision',()=>{
  const original=readFileSync(mageSeed,'utf8'),seed=JSON.parse(original),source=seed.source;
  const raw=validateMonsterIntakeIR(source,seed.ir);
  expect(raw.blocking.filter(f=>f.path.startsWith('/creature/actions/1'))).toHaveLength(6);
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
      expect(sourceOperationFeatureErrors({...feature,damage:[{formula:'99d6',type:'fire'}]}).some(e=>e.field==='damage')).toBe(true);
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
    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE,ir).blocking.some(f=>f.path.includes('saveDc'))).toBe(true);
  });
  test('review metadata cannot smuggle unknown fields or malformed findings',()=>{
    expect(isSourceCandidateReview(review())).toBe(true);
    expect(isSourceCandidateReview({...review(),execute:'attack'})).toBe(false);
    expect(isSourceCandidateReview({...review(),findings:[{...review().findings[0],execute:'attack'}]})).toBe(false);
    expect(isSourceCandidateCounters([{name:'Unresolved cadence',max:2,recovery:'weekly'}])).toBe(true);
    expect(isSourceCandidateCounters([{name:'Unresolved cadence',max:2,recovery:'weekly',execute:'attack'}])).toBe(false);
    const ir=buildRatWarlockIr();
    (ir.creature.spellcasting![0] as any).candidateReview={...review(),execute:'attack'};
    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE,ir).findings.some(f=>f.code==='INVALID_CANDIDATE_REVIEW')).toBe(true);
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

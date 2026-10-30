import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { analyzeBrowserActorIntakeDraft } from '@fvtt-json-generator/forge-browser-runtime/ai';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { actorRulePresentation } from '../packages/forge-browser-runtime/src/actorRulePresentationContext';
import { assertRulePresentationPlan } from '@fvtt-json-generator/generation/rule-presentation';
import { localizationFormulaSpans, localizationRequest, localizationText, protectLocalizationText, validateLocalizationDraft } from '@fvtt-json-generator/contracts/localization';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { sourceCompletenessFindings } from '../packages/intake-ai/src/source-completeness';
import { normalizeMonsterSourceFacts } from '@fvtt-json-generator/intake-ai/source-facts';
import { auditMonsterIntakeSource } from '@fvtt-json-generator/intake-ai/validator';
import type { MonsterIntakeIR, MonsterIntakeAiProvider } from '@fvtt-json-generator/intake-ai/types';
import saved from './fixtures/forge-raw-contracts.json';

// Exact saved first/final IR and source; provenance hashes identify the frozen
// originals. Mutations below are explicitly test-authored negative/format cases.
const forbidden=async():Promise<never>=>{throw new Error('Saved-input contracts make zero model calls.');};
const provider:MonsterIntakeAiProvider={providerName:'saved-raw-offline',extractionModel:'disabled',reviewModel:'disabled',
  discover:forbidden,extract:forbidden,repair:forbidden,review:forbidden};
function sample(caseId:string,first=false){
  const row=saved.find(row=>row.caseId===caseId)!;
  return {source:row.source,ir:structuredClone(first?row.firstIr:row.finalIr) as unknown as MonsterIntakeIR};
}
function auditSource(data:ReturnType<typeof sample>){
  const ir=structuredClone(data.ir);
  normalizeMonsterSourceFacts(ir,data.source,{start:0,end:data.source.length});
  const audit=auditMonsterIntakeSource(data.source,ir);
  return {...audit,ir};
}
function normalize(data:ReturnType<typeof sample>){normalizeMonsterSourceFacts(data.ir,data.source,{start:0,end:data.source.length});return data;}
function variant(data:ReturnType<typeof sample>,from:string,to:string){
  const original=data.source,positions=[...original.matchAll(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&'),'gu'))].map(match=>match.index!);
  if(!positions.length)throw new Error('Variant must change a real source occurrence.');
  const offset=(at:number)=>at+positions.filter(start=>start<at).length*(to.length-from.length);
  const source=original.replaceAll(from,to);
  const walk=(value:any):any=>{
    if(typeof value==='string')return value.replaceAll(from,to);
    if(!value||typeof value!=='object')return value;
    if(Array.isArray(value))return value.map(walk);
    const result=Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,walk(entry)]));
    if(Number.isInteger(value.start)&&Number.isInteger(value.end)&&typeof value.quote==='string'){
      result.start=offset(value.start);result.end=offset(value.end);result.quote=source.slice(result.start,result.end);
    }
    return result;
  };
  const ir=walk(data.ir) as MonsterIntakeIR;ir.source.sha256=hashSource(source);ir.source.length=source.length;
  return {source,ir};
}

describe('explicit offline audit of frozen raw-input source contracts',()=>{
  test('fixtures keep the exact recorded source identities and uncleaned first failures',()=>{
    for(const row of saved)expect(String(hashSource(row.source))).toBe(row.sourceSha256);
    expect((sample('sea-hag-auntie',true).ir.creature.actions[3]!.save as any).ability).toBe('intelligence or wisdom');
    expect(Object.hasOwn(sample('baernaloths',true).ir.creature.actions[5]!,'use')).toBe(true);
  });
  test('the default draft preserves AI rules and reports issues without source-derived completion',()=>{
    const data=sample('gazer'),before=structuredClone(data.ir);
    const result=analyzeBrowserActorIntakeDraft({source:data.source,sourceName:'Default saved raw contract',requestId:'default-raw-contract',fvttVersion:'14.364',systemVersion:'5.3.3'},data.ir,provider);
    expect(result.ir!.creature.actions).toEqual(before.creature.actions);
    expect(result.ir!.creature.actions.every(feature=>feature.range===undefined)).toBe(true);
    expect(result.ir!.claims).toEqual(before.claims);
    expect(result.calls).toEqual({discovery:0,extraction:0,repair:0,review:0});
    expect(data.ir).toEqual(before);
  });
  test('Sea final short claim proves its choice but still needs the missing basic Save re-extracted',()=>{
    const data=sample('sea-hag-auntie'),before=structuredClone(data.ir);
    expect(data.ir.claims.find(claim=>claim.path==='/creature/actions/3')!.evidence[0]!.quote).not.toContain('DC 15');
    const result=auditSource(data);
    expect(result.blocking.length).toBeGreaterThan(0);expect(result.findings.some(finding=>finding.code==='SOURCE_BASIC_OPERATION_OMITTED'&&finding.path==='/creature/actions/3')).toBe(true);
    expect(result.ir!.uncertainties).toContainEqual(expect.objectContaining({code:'SOURCE_VERIFIED_TARGET_CHOICE_MANUAL',blocking:false}));
    expect(result.ir!.claims).toEqual(before.claims);expect(result.ir!.coverage).toEqual(before.coverage);
    expect(data.ir).toEqual(before);
    expect(auditSource({source:data.source,ir:result.ir!}).ir).toEqual(result.ir);
  });
  test('Sea actual first malformed fields and coverage remain rejected',()=>{
    const result=auditSource(sample('sea-hag-auntie',true));
    expect(result.blocking.length).toBeGreaterThan(0);
    expect(result.findings.some(f=>f.code==='INVALID_FEATURE_SAVE_ABILITY')).toBe(true);
    expect(result.findings.some(f=>f.code==='EVIDENCE_OUT_OF_RANGE')).toBe(true);
  });
  test('complete coverage cannot hide missing chooser, clauses, conflicts or an unrelated finding',()=>{
    for(const change of [(data:ReturnType<typeof sample>)=>{data.ir.creature.actions[3]!.description=data.ir.creature.actions[3]!.description.replace(' (Save Ends at end of turn)','');return data;},
      (data:ReturnType<typeof sample>)=>variant(data,'Target’s Choice','Caster’s Choice'),
      (data:ReturnType<typeof sample>)=>{data.ir.creature.actions[3]!.save={dc:16,ability:'wis'};return data;},
      (data:ReturnType<typeof sample>)=>{data.ir.uncertainties.push({id:'unknown',code:'UNKNOWN_BRANCH',path:'/creature/actions/3',message:'Unknown',blocking:true,evidence:[]});return data;},
      (data:ReturnType<typeof sample>)=>{data.ir.claims.push({path:'/creature/actions/3/save/ability',value:'wis',valueKind:'explicit',confidence:'high',evidence:data.ir.claims.find(c=>c.path==='/creature/actions/3')!.evidence});return data;}])
      expect(auditSource(change(sample('sea-hag-auntie'))).blocking.length).toBeGreaterThan(0);
    const wrong=sample('sea-hag-auntie');wrong.ir.coverage.find(c=>c.start===1569)!.quote+=' forged';
    expect(auditSource(wrong).blocking.length).toBeGreaterThan(0);
    const scope=sample('sea-hag-auntie');normalizeMonsterSourceFacts(scope.ir,scope.source,{start:1800,end:scope.source.length});
    expect(scope.ir.uncertainties.some(u=>u.code==='AMBIGUOUS_SAVE_ABILITY'&&u.blocking)).toBe(true);
  });
  test('Charon prose continuations are not titles; omitted real titles still fail',()=>{
    for(const first of [true,false]){
      const data=sample('charon',first);
      expect(sourceCompletenessFindings(data.source,data.ir).filter(f=>f.code==='SOURCE_FEATURE_OMITTED')).toEqual([]);
    }
    const missing=sample('charon');missing.ir.creature.actions.splice(3,1);
    expect(sourceCompletenessFindings(missing.source,missing.ir).some(f=>f.code==='SOURCE_FEATURE_OMITTED')).toBe(true);
  });
  test('complete delayed/conditional Utility rules retain an explicit GM boundary',()=>{
    const data=normalize(sample('charon'));
    for(const index of [3,5]){
      expect(data.ir.creature.actions[index]!.save).toBeUndefined();
      expect(data.ir.uncertainties).toContainEqual(expect.objectContaining({path:`/creature/actions/${index}`,code:'SOURCE_VERIFIED_CONDITIONAL_RULE_MANUAL',blocking:false}));
      expect(data.ir.uncertainties.some(u=>u.path===`/creature/actions/${index}`&&u.code==='SOURCE_STRUCTURED_RULE_MISMATCH'&&u.blocking)).toBe(false);
    }
    const empty=sample('charon');empty.ir.creature.actions[3]!.description='';
    expect(auditSource(empty).blocking.length).toBeGreaterThan(0);
    const wrong=sample('charon');wrong.ir.creature.actions[3]!.save={dc:21,ability:'cha'};
    expect(auditSource(wrong).findings.some(f=>f.code==='SOURCE_STRUCTURED_RULE_MISMATCH')).toBe(true);
  });
  test('explicit spell levels survive in visible English names, with no global caster invention',()=>{
    for(const first of [true,false]){
      const data=sample('ultroloths',first);
      expect(sourceCompletenessFindings(data.source,data.ir).filter(f=>f.code==='SOURCE_SPELL_LEVEL_OMITTED')).toEqual([]);
      expect(auditSource(data).findings.filter(f=>f.code==='SOURCE_FORMULA_MISMATCH')).toEqual([]);
    }
    const missing=sample('ultroloths');missing.ir.creature.actions[3]!.englishName='Lava Geyser';
    expect(sourceCompletenessFindings(missing.source,missing.ir).some(f=>f.code==='SOURCE_SPELL_LEVEL_OMITTED')).toBe(true);
    const data=normalize(sample('baernaloths'));
    expect(data.ir.creature.spellcasting).toBeUndefined();
    expect(data.ir.uncertainties).toContainEqual(expect.objectContaining({code:'SOURCE_EXPLICIT_SPELL_FEATURES_MANUAL',blocking:false}));
    const first=auditSource(sample('baernaloths',true));expect(first.blocking.length).toBeGreaterThan(0);
    expect(first.findings.some(f=>f.code==='INVALID_FEATURE_USES_FIELD')).toBe(true);
    const unknown=sample('baernaloths');unknown.ir.uncertainties[0]!.code='UNKNOWN_CASTING_BRANCH';
    expect(auditSource(unknown).findings.some(f=>f.code==='UNKNOWN_CASTING_BRANCH'&&f.blocking)).toBe(true);
  });
  test('saved manual resolutions must prove the complete source again after field tampering',()=>{
    const conditional=normalize(sample('charon'));
    conditional.ir.creature.actions[3]!.description=conditional.ir.creature.actions[3]!.description.replace(/Success:[\s\S]*/iu,'');
    const rechecked=auditSource(conditional);
    expect(rechecked.blocking.length).toBeGreaterThan(0);
    expect(rechecked.findings.some(f=>f.code==='SOURCE_CONDITIONAL_RECHECK_REQUIRED'&&f.blocking)).toBe(true);
    const spells=normalize(sample('baernaloths'));
    for(const feature of [...spells.ir.creature.actions,...spells.ir.creature.bonusActions]){
      for(const field of ['name','englishName','sourceQualifier','description'] as const)
        if(feature[field])feature[field]=feature[field]!.replace(/Level\s+\d+\s+Spell/giu,'');
    }
    expect(auditSource(spells).findings.some(f=>f.code==='AMBIGUOUS_SPELLCASTING'&&f.blocking)).toBe(true);
    const collision=sample('charon');
    collision.ir.uncertainties.push({id:'source-conditional:/creature/actions/3',code:'UNKNOWN_SOURCE_TARGET',
      path:'/creature/actions/3',blocking:true,message:'Unresolved target identity conflict',
      evidence:collision.ir.claims.find(claim=>claim.path==='/creature/actions/3')!.evidence});
    expect(auditSource(collision).findings.some(f=>f.code==='UNKNOWN_SOURCE_TARGET'&&f.blocking)).toBe(true);
  });
});

describe('numeric role boundaries',()=>{
  test('metadata units preserve ordered values after leaving the arithmetic grammar',()=>{
    for(const [source,good,bad] of [['Range 30/60 feet.','射程30/60尺。','射程60/30尺。'],
      ['Recharge 5-6.','充能5-6。','充能6-5。'],['Recharge 5–6.','充能5–6。','充能6–5。'],
      ['Level 1-3 Spells.','1-3环法术。','3-1环法术。']]){
      const input=localizationRequest(hashSource(source!),[localizationText('body',source!)]);
      const candidate=(text:string)=>({texts:[{id:input.texts[0]!.id,text}]});
      expect(()=>validateLocalizationDraft(input,candidate(good!))).not.toThrow();
      expect(()=>validateLocalizationDraft(input,candidate(bad!))).toThrow('改变数字');
      const protectedValue=protectLocalizationText(source!);
      expect([...protectedValue.text.matchAll(/⟦\d+⟧/gu)]).toHaveLength(1);
      expect(protectedValue.restore(protectedValue.text)).toBe(source!);
    }
  });
  test.each(['Recharge 5-6, Level 7 Spell. Damage: 73 (6d10 + 40).','充能 5-6。伤害：73 (6d10 + 40)。',
    'range 30-60 feet; Level 1-3 Spells. Roll (6d10 + 40).',
    'range 150/600 feet. Damage (6d10 + 40).','射程150/600尺。伤害(6d10 + 40)。'])('recognizes metadata intervals in %s',source=>{
      expect(localizationFormulaSpans(source).map(span=>span.signature)).toEqual(['(6d10+40)']);
    });
  test.each(['5-6','Roll 5 - 6.','Recharge 5-6. Roll 5-6.','Damage: (6d10 + 40) - 5.'])('retains arithmetic %s',source=>{
    expect(localizationFormulaSpans(source).length).toBeGreaterThan(0);
  });
  test('actual Grey Fate still rejects operands, operator, order, duplicates and structured damage drift',()=>{
    for(const value of ['6d10 + 41','40 + 6d10','6d10 - 40','6d10 + 40 + 40']){
      const data=sample('ultroloths');data.ir.creature.actions[4]!.description=data.ir.creature.actions[4]!.description.replace('6d10 + 40',value);
      expect(auditSource(data).findings.some(f=>f.code==='SOURCE_FORMULA_MISMATCH')).toBe(true);
    }
    const data=sample('ultroloths');data.ir.creature.actions[4]!.damage![0]!.formula='6d10 + 41';
    expect(auditSource(data).findings.some(f=>f.code==='SOURCE_STRUCTURED_RULE_MISMATCH')).toBe(true);
  });
});

describe('explicit offline source-bound shared target/range audit',()=>{
  test('an omitted numbered child cannot be excused by the parent summary or ignored coverage',()=>{
    const data=sample('gazer');
    data.ir.creature.actions.splice(4,1);
    data.ir.claims=data.ir.claims.filter(claim=>!claim.path.startsWith('/creature/actions/4'));
    for(const coverage of data.ir.coverage)if(coverage.claimPaths.includes('/creature/actions/4')){
      coverage.classification='ignored-with-reason';coverage.reason='Preserved by parent eye ray summary';coverage.claimPaths=[];
    }
    expect(auditSource(data).findings.some(f=>f.code==='SOURCE_FEATURE_OMITTED'&&f.message.includes('Force Ray'))).toBe(true);
  });
  test('a same-value claim with a valid unrelated quote cannot fabricate range or visibility',()=>{
    const data=sample('gazer');
    Object.assign(data.ir.creature.traits[0]!,{range:999,targetSpecial:'any creature anywhere'});
    const evidence=data.ir.claims.find(claim=>claim.path==='/creature/traits/0')!.evidence;
    for(const [field,value] of [['range',999],['targetSpecial','any creature anywhere']] as const)
      data.ir.claims.push({path:'/creature/traits/0/'+field,value,valueKind:'derived',confidence:'high',evidence});
    expect(auditSource(data).findings.filter(f=>f.code==='UNBOUND_FEATURE_TARGET')).toHaveLength(2);
    const sibling=normalize(sample('gazer'));
    const wrong=sibling.ir.claims.find(claim=>claim.path==='/creature/actions/1/range')!;
    wrong.evidence[1]=sibling.ir.claims.find(claim=>claim.path==='/creature/actions/2')!.evidence[0]!;
    expect(auditSource(sibling).findings.some(f=>f.code==='UNBOUND_FEATURE_TARGET'&&f.path==='/creature/actions/1/range')).toBe(true);
  });
  test('actual first/final numbered rules inherit once with both parent and child provenance',()=>{
    for(const first of [true,false]){
      const data=sample('gazer',first);expect(data.ir.creature.actions.every(f=>f.range===undefined)).toBe(true);
      const result=auditSource(data);expect(result.blocking.length).toBeGreaterThan(0);
      expect(result.findings).toEqual([expect.objectContaining({code:'SOURCE_UNSUPPORTED_STATIC_FACT',path:'/creature/identity/size'})]);
      for(const [index,feature] of result.ir!.creature.actions.entries()){
        expect(feature.range).toBe(60);expect(feature.targetSpecial).toBe('targets it can see');
        const claim=result.ir!.claims.find(c=>c.path===`/creature/actions/${index}/range`)!;
        expect(claim.evidence).toHaveLength(index?2:1);
        for(const ref of claim.evidence)expect(data.source.slice(ref.start,ref.end)).toBe(ref.quote);
      }
      expect(auditSource({source:data.source,ir:result.ir!}).ir).toEqual(result.ir);
    }
  });
  test('renaming, HTML descriptions, CRLF and physical wrapping do not alter inheritance',()=>{
    const renamed=variant(variant(sample('gazer'),'Eye Rays','Prism Bursts'),'Dazing Ray','Binding Arc');
    for(const data of [renamed,variant(sample('gazer'),'\n','\r\n'),variant(sample('gazer'),'within 60 feet','within\n60 feet')]){
      data.ir.creature.actions.forEach(f=>f.description='<p>'+f.description+'</p>');
      expect(auditSource(data).ir!.creature.actions.map(f=>f.range)).toEqual([60,60,60,60,60]);
    }
  });
  test('conflicting child fields, broken numbering, missing visibility and context boundaries do not bleed',()=>{
    const conflict=sample('gazer');conflict.ir.creature.actions[2]!.range=30;
    const result=auditSource(conflict);expect(result.blocking.length).toBeGreaterThan(0);
    expect(result.ir!.creature.actions[2]!.range).toBe(30);
    const target=sample('gazer');target.ir.creature.actions[1]!.targetSpecial='any target';
    expect(auditSource(target).blocking.length).toBeGreaterThan(0);
    const prose=variant(sample('gazer'),'The target must make a','A target within 30 feet must make a');
    expect(auditSource(prose).findings.some(f=>f.code==='SOURCE_SHARED_TARGET_CONFLICT'&&f.path==='/creature/actions/4')).toBe(true);
    const missing=variant(sample('gazer'),'targets it\ncan see','targets');
    expect(auditSource(missing).ir!.creature.actions.every(f=>f.range===undefined)).toBe(true);
    const boundary=variant(sample('gazer'),'2. Fear Ray','Fear Ray');
    expect(auditSource(boundary).ir!.creature.actions.slice(2).every(f=>f.range===undefined)).toBe(true);
    const fake=sample('gazer');fake.ir.claims.find(c=>c.path==='/creature/actions/0')!.evidence[0]!.quote+=' forged';
    expect(auditSource(fake).ir!.creature.actions.every(f=>f.range===undefined)).toBe(true);
  });
  test('formal workflow retains inherited range and visibility while reporting missing state projection',async()=>{
    const result=auditSource(sample('gazer'));
    const markdown=renderMonsterIntakeMarkdown(result.ir!);
    const response=await convertFinalActorSource(buildForgeActorRequest({content:markdown,displayName:'Saved Gazer',requestId:'saved-range-workflow',
      fvttVersion:'14.368',systemVersion:'5.3.3'}),{captureRulePresentation:true});
    // Range inheritance is independently observable on this retained candidate;
    // its unprojected state findings still prevent a successful strict verdict.
    expect('result'in response&&response.result.status).toBe('failed');
    if(!('result'in response)||!('artifact' in response.result)||!response.result.artifact)throw new Error('Formal saved-input generation failed');
    expect(response.result.diagnostics.map(entry=>entry.code)).toEqual(['GEN_MECHANIC_NOT_PROJECTED','GEN_MECHANIC_NOT_PROJECTED','GEN_LITERAL_REVIEW_REQUIRED']);
    const actor:any=response.result.artifact;
    expect(actor.items).toHaveLength(7);
    expect(actor.items.flatMap((item:any)=>Object.values(item.system.activities??{}))).toHaveLength(7);
    for(const item of actor.items.filter((item:any)=>result.ir!.creature.actions.some(f=>item.name.includes(f.name)))){
      const activity:any=Object.values(item.system.activities)[0];
      expect(Number(activity.range.value)).toBe(60);expect(activity.range.units).toBe('ft');
      expect(activity.target.affects.special).toBe('targets it can see');
      expect(item.img).not.toBe('icons/svg/item-bag.svg');
    }
    const plan = actorRulePresentation(response);
    expect(plan).toBeDefined();
    expect(() => assertRulePresentationPlan(plan!, actor, markdown)).not.toThrow();
    for(const feature of result.ir!.creature.actions){
      const item=actor.items.find((item:any)=>item.name.includes(feature.name));
      expect(item.system.description.value).toContain(feature.description.replaceAll('\n',' '));
    }
    const drift=structuredClone(result.ir!);drift.creature.actions[1]!.range=30;
    expect(auditMonsterIntakeSource(sample('gazer').source,drift).findings.some(f=>f.code==='UNBOUND_FEATURE_TARGET')).toBe(true);
  });
});

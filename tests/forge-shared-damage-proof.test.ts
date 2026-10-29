import {expect,test} from 'bun:test';
import {materializeStructuredSourceOperations,sourceOperationStructureErrors} from '@fvtt-json-generator/models/source-operations';
import {normalizeMonsterIntakeProposal} from '@fvtt-json-generator/intake-ai/provider';
import {analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import type {ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import fixture from './fixtures/forge-2024-ankheg-shared-proof.json';

const base=()=>structuredClone(fixture.ir) as any;
const bite=(ir:any)=>ir.creature.actions[0];
const operation=()=>structuredClone(bite(base()).sourceOperations[0]);
const parent=()=>bite(base()).description;
const normalize=(ir:any=base(),source=fixture.source)=>normalizeMonsterIntakeProposal(source,ir);

test('a real current reply retains every value while one owned damage citation expands',()=>{
  const original=base(),before=structuredClone(original),next=normalize(original),expected=structuredClone(before);
  expected.creature.actions[0].sourceOperations[0].proof.damage.push(expected.creature.actions[0].sourceOperations[0].proof.damage[0]);
  expect(next).toEqual(expected);expect(original).toEqual(before);expect(normalize(next)).toEqual(next);
  expect(sourceOperationStructureErrors(bite(next).sourceOperations)).toEqual([]);
});

test('already parallel citations and unrelated operations remain unchanged',()=>{
  const ir=base();bite(ir).sourceOperations[0].proof.damage.push(bite(ir).sourceOperations[0].proof.damage[0]);
  expect(normalize(ir)).toEqual(ir);
});

test('input field policy: an empty optional damage proof matches omission without inventing a citation',async()=>{
 const empty=base(),omitted=base();bite(empty).sourceOperations[0].proof.damage=[];delete bite(omitted).sourceOperations[0].proof.damage;
 const before=structuredClone(empty),emptyNormalized=normalize(empty),omittedNormalized=normalize(omitted);
 expect(emptyNormalized).toEqual(omittedNormalized);expect(empty).toEqual(before);expect(bite(emptyNormalized).sourceOperations[0].proof.damage).toBeUndefined();
 expect(sourceOperationStructureErrors(bite(emptyNormalized).sourceOperations)).toEqual([]);
 const forbidden=async()=>{throw Error('No model permitted');},provider:any={providerName:'frozen',extractionModel:'frozen',reviewModel:'disabled',discover:forbidden,extract:forbidden,review:forbidden,repair:forbidden};
 const input={source:fixture.source,sourceName:'Ankheg',sourceScope:'single' as const,fvttVersion:'14.368',systemVersion:'5.3.3',requestId:'optional-empty-proof',sourceId:'actor:v1:17fa7d9b-9f7e-4e55-b627-48bb26937048' as ForgeSourceId};
 const results=[];
 for(const ir of [empty,omitted]){const analysis=analyzeBrowserActorIntakeDraft(input,ir,provider),generation=await generateBrowserActorIntakeCandidate(input,analysis,provider);expect(generation.candidateAvailable).toBe(true);expect(generation.findings).toEqual([]);results.push(generation.candidateResponse);}
 expect(results[0]).toEqual(results[1]);
});

for(const [label,mutate] of [
  ['empty quote',(op:any)=>op.proof.damage=['']],
  ['non-string',(op:any)=>op.proof.damage=[17]],['partial citation array',(op:any)=>{op.damage.push({...op.damage[1]});op.proof.damage.push(op.proof.damage[0]);}],
  ['conditional part',(op:any)=>op.damage[1].relationship='conditional'],['replacement part',(op:any)=>op.damage[1].relationship='replacement'],
  ['part condition',(op:any)=>op.damage[1].condition='When chosen by the GM.'],
  ['operation condition',(op:any)=>op.condition='When chosen by the GM.'],['alternative',(op:any)=>op.relationship='alternative'],
  ['upgrade',(op:any)=>op.proof.upgrade='A distinct source rule.'],['adjustment',(op:any)=>op.damageAdjustment={mode:'half'}],
  ['unknown field',(op:any)=>op.damage[1].invented=1],['invalid formula',(op:any)=>op.damage[1].formula='NaN'],
  ['invalid type',(op:any)=>op.damage[1].type='invented'],['foreign citation',(op:any)=>op.proof.damage=['Failure: 14 (4d6) Acid damage.']],
  ['clipped citation',(op:any)=>op.proof.damage=['Slashing damage plus 3 (1d6) Acid damage.']],
] as const){
  test(`shared citation refuses ${label}`,()=>{
    const op=operation();mutate(op);const supplied=structuredClone(op.proof.damage);
    const result=materializeStructuredSourceOperations(parent(),[op],undefined,parent()) as any[];
    expect(result[0].proof.damage).toEqual(supplied);
  });
}

test('shared citation supports more than twelve declared damage parts without truncation',()=>{
 const op=operation();op.damage=Array.from({length:13},()=>({...op.damage[0]}));
 const result=materializeStructuredSourceOperations(parent(),[op],undefined,parent()) as any[];
 expect(result[0].damage).toHaveLength(13);expect(result[0].proof.damage).toHaveLength(13);
});

test('ambiguous or unbound owner cannot lend a shared citation',()=>{
  const op=operation(),quote=op.proof.damage[0];
  for(const owner of [undefined,parent()+' '+quote,'Another ability has no shared sentence.']){
    const result=materializeStructuredSourceOperations(parent(),[op],undefined,owner) as any[];
    expect(result[0].proof.damage).toEqual(op.proof.damage);
  }
  const bad=base();bite(bad).evidence[0]={start:0,end:5,quote:'wrong'};
  expect(bite(normalize(bad)).sourceOperations[0].proof.damage).toHaveLength(1);
  const duplicate=base();delete bite(duplicate).evidence;
  expect(bite(normalize(duplicate,fixture.source+'\n'+fixture.source)).sourceOperations[0].proof.damage).toHaveLength(1);
});

test('whitespace alignment is allowed, but a changed source word is not',()=>{
  const ir=base();delete bite(ir).evidence;
  expect(bite(normalize(ir,fixture.source.replaceAll('\n','\r\n'))).sourceOperations[0].proof.damage).toHaveLength(2);
  expect(bite(normalize(ir,fixture.source.replace('Slashing damage plus','Cold damage plus'))).sourceOperations[0].proof.damage).toHaveLength(1);
});

test('format recovery neither corrects nor claims truth for an AI numerical error',()=>{
  const ir=base();bite(ir).sourceOperations[0].damage[1].formula='99d99';
  const result=normalize(ir);
  expect(bite(result).sourceOperations[0].damage).toEqual(bite(ir).sourceOperations[0].damage);
  expect(bite(result).sourceOperations[0].proof.damage).toHaveLength(2);
});

test('the saved real Ankheg reply completes the formal chain with no model calls',async()=>{
  let calls=0;const forbidden=async()=>{calls++;throw Error('No model permitted');};
  const provider:any={id:'offline',model:'saved-reply',reviewModel:'saved-reply',promptVersion:'frozen-real',
    discover:forbidden,extract:forbidden,review:forbidden,repair:forbidden};
  const input={source:fixture.source,sourceName:'Ankheg 2024 frozen first response',sourceScope:'single' as const,
    fvttVersion:'14.368' as const,systemVersion:'5.3.3',requestId:'shared-proof-regression'};
  const analysis=analyzeBrowserActorIntakeDraft(input,base(),provider);
  expect(analysis.findings).toEqual([]);
  const result=await generateBrowserActorIntakeCandidate(input,analysis,provider);
  expect(result.findings).toEqual([]);expect(result.formalStatus).toBe('accepted');expect(calls).toBe(0);
  const actor:any=(result.candidateResponse as any).result.artifact;
  const item=actor.items.find((item:any)=>item.name==='Bite');
  const activities=Object.values<any>(item.system.activities);
  expect(activities.some(a=>a.roll?.formula==='1d20 + 5'||a.roll?.formula==='1d20+5')).toBe(true);
  expect(activities.find(a=>a.type==='damage')?.damage.parts).toHaveLength(2);
  expect(item.system.description.value).toContain('escape DC 13');
  expect(item.system.description.value).toContain('with Advantage if the target is Grappled by the ankheg');
  expect(item.effects.flatMap((effect:any)=>effect.statuses)).toEqual(['grappled']);
  const grapple=item.effects.find((effect:any)=>effect.statuses.includes('grappled'));
  expect(activities.filter(activity=>activity.effects?.some((link:any)=>link._id===grapple._id)).map(activity=>activity.flags.fvttJsonGenerator.sourceOperation.role)).toEqual(['damage']);
});

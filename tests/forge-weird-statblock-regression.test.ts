import {describe,test,expect} from 'bun:test';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {runStagedMonsterExtraction} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {anchorIrEvidence,anchorIrEvidenceSourceAudit} from '@fvtt-json-generator/intake-ai/orchestrator';
import {sourceStatHeader} from '@fvtt-json-generator/intake-ai/staged-source';
import {auditMonsterIntakeSource} from '@fvtt-json-generator/intake-ai/validator';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {auditMonsterIntakeSourceProjection} from '@fvtt-json-generator/intake-ai/verifier';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import {bindSourceOperations,sourceOperationErrors,sourceOperationClauses} from '@fvtt-json-generator/models/source-operations';
import data from './fixtures/forge-weird-statblock-research-cases.json';

const cases:any[]=data.cases;
const req=(source:string)=>({source,sourceSha256:hashSource(source),candidate:{id:'weird-regression',label:'Synthetic regression',start:0,end:source.length,quote:source}});
const get=(value:any,path:string[])=>path.reduce((next,key)=>next?.[key],value);
function set(value:any,path:string[],next:any){const parent=path.slice(0,-1).reduce((next,key)=>next[key],value);parent[path.at(-1)!]=structuredClone(next);}
async function correct(c:any){
 return runStagedMonsterExtraction(req(c.source),async call=>{
  await call.onAttempt(1);
  if(call.stage==='base')return{schemaVersion:1,creature:structuredClone(c.creature),uncertainties:[]};
  if(call.stage==='source'){
   let next=0;return{schemaVersion:1,units:c.units.map((u:any)=>{const count=u.text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/gu).filter(Boolean).length,firstLine=next;next+=count;return{firstLine,lastLine:next-1,destination:u.destination,...(u.destination==='feature'?{section:u.section,name:u.name}:{})};})};
  }
  const f=c.features.find((f:any)=>f.name===call.payload.name||f.text===String(call.payload.source).trim());
  if(!f)throw Error('Unknown fixture ability');
  return{schemaVersion:1,unitId:call.unitId,mode:f.operations.length?'native-with-gm':'manual',facts:f.operations.length?{sourceOperations:structuredClone(f.operations)}:{}};
 },{baseMode:'facts',featureMode:'auto'});
}
async function ordinary(source:string,raw:any){
 const provider=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'offline-only',baseUrl:'https://offline.invalid/v1',model:'fixture',reviewModel:'fixture',maxAttempts:1,timeoutMs:10000,repairTimeoutMs:10000,httpClient:async()=>({ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(raw)}}]})})});
 return anchorIrEvidence(source,req(source).candidate,await provider.extract(req(source)));
}
async function diagnosedAndRetained(source:string,raw:any,path:string[]){
 const before=structuredClone(raw),ir=await ordinary(source,raw),validation=auditMonsterIntakeSource(source,ir,{coverageRange:req(source).candidate});
 expect(raw).toEqual(before);expect(get(ir.creature,path)).toEqual(get(before.creature,path));
 return validation.blocking.length>0;
}
describe('source-backed unusual stat blocks retain exact source and report guessed numbers',()=>{
 for(const c of cases.filter(c=>c.expectation!=='review-required')){
  test('correct ordinary and staged facts: '+c.id,async()=>{
   const staged=await correct(c),ir=await ordinary(c.source,staged);
   for(const result of [staged,ir]){
    expect(auditMonsterIntakeSource(c.source,result).blocking).toEqual([]);
    expect(result.creature.attributes.hp.value).toBe(c.creature.attributes.hp.value);
    expect(result.creature.abilities).toEqual(c.creature.abilities);
    expect(result.coverage.map(e=>e.quote).join('')).toBe(c.source);
    for(const e of result.claims.flatMap(claim=>claim.evidence))expect(c.source.slice(e.start,e.end)).toBe(e.quote);
   }
  });
  for(const mutation of c.mutations.filter((m:any)=>!['traits','actions','bonusActions','reactions','legendaryActions'].includes(m.path[0])))test(c.id+' retains and reports '+mutation.id,async()=>{
   const raw=await correct(c);
   expect(auditMonsterIntakeSource(c.source,raw).blocking).toEqual([]);
   set(raw.creature,mutation.path,mutation.value);
   expect(await diagnosedAndRetained(c.source,raw,mutation.path)).toBe(true);
  });
 }
 const seed=cases.find(c=>c.id==='control-sentinel');
 for(const [before,after,path,guess]of[
  ['Speed 30 ft.','Speed S0 ft.',['attributes','movement','walk'],30],
  ['INT 3','INT l',['abilities','int'],3],
  ['INT 3','Cognition l',['abilities','int'],3],
  ['HP 30','HP 3O',['attributes','hp','value'],3],
  ['HP 30','HP 0.5',['attributes','hp','value'],0],
  ['XP 450','XP 450l',['attributes','xp'],450],
  ['XP 450','l450XP',['attributes','xp'],450],
 ] as Array<[string,string,string[],number]>)test('OCR cannot prove a guessed numeric prefix: '+after,async()=>{
  const original=await correct(seed),raw=structuredClone(original),source=seed.source.replace(before,after),rewrite=(value:string)=>value.replace(before,after),seen=new WeakSet<object>();
  const visit=(value:any)=>{
   if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
   if(typeof value.start==='number'&&typeof value.end==='number'&&typeof value.quote==='string'){
    value.start=rewrite(seed.source.slice(0,value.start)).length;value.end=rewrite(seed.source.slice(0,value.end)).length;value.quote=source.slice(value.start,value.end);
   }
   for(const [key,next]of Object.entries(value)){if(['description','biography','nativeRuleText','manualRemainder'].includes(key)&&typeof next==='string')value[key]=rewrite(next);else visit(next);}
  };
  visit(raw);raw.source={sha256:hashSource(source),length:source.length};set(raw.creature,path,guess);
  // A guess can equal the old value; actual source proof is still required.
  const ir=await ordinary(source,raw);expect(get(ir.creature,path)).toBe(guess);expect(auditMonsterIntakeSource(source,ir).blocking.length).toBeGreaterThan(0);
 });
 test('the header cannot borrow HP from a later ability or another candidate',async()=>{
  const c=cases.find(c=>c.id==='wrapped-title'),source=c.source+'Aftermath. The target regains HP 99.\n';
  const header=sourceStatHeader(req(source));expect(header.quote).toBe(c.units[0].text);expect(header.quote).not.toContain('HP 99');
  const raw=await correct(c);raw.creature.attributes.hp.value=99;
  expect(await diagnosedAndRetained(c.source,raw,['attributes','hp','value'])).toBe(true);
 });
 test('an omitted PB follows the existing CR rule, while arbitrary guesses remain blocked',async()=>{
  const c=structuredClone(seed);c.source=c.source.replace(' PB +2','');c.units[0].text=c.units[0].text.replace(' PB +2','');
  const ir=await correct(c);expect(auditMonsterIntakeSource(c.source,ir).blocking).toEqual([]);
  ir.creature.attributes.proficiencyBonus=5;
  expect(await diagnosedAndRetained(c.source,ir,['attributes','proficiencyBonus'])).toBe(true);
 });
 test('an explicitly printed PB remains authoritative even when it differs from CR-derived PB',async()=>{
  const c=structuredClone(seed);c.source=c.source.replace('PB +2','PB +3');c.units[0].text=c.units[0].text.replace('PB +2','PB +3');c.creature.attributes.proficiencyBonus=3;
  const ir=await correct(c);expect(auditMonsterIntakeSource(c.source,ir).blocking).toEqual([]);expect(ir.creature.attributes.proficiencyBonus).toBe(3);
 });
 test('a missing initiative stays in the proposal and source audit reports a conflicting number',async()=>{
  const c=structuredClone(seed);c.source=c.source.replace('AC 15','AC 15 Initiative +4');c.units[0].text=c.units[0].text.replace('AC 15','AC 15 Initiative +4');c.creature.attributes.initiative=4;
  const ir:any=await correct(c);ir.creature.attributes.initiative=null;ir.claims=ir.claims.filter((claim:any)=>claim.path!=='/creature/attributes/initiative');
  const retained=await ordinary(c.source,ir);expect(retained.creature.attributes.initiative).toBeNull();expect(retained.creature.actions).toEqual(ir.creature.actions);
  ir.creature.attributes.initiative=99;expect(await diagnosedAndRetained(c.source,ir,['attributes','initiative'])).toBe(true);
 });
 test('source-audit anchoring retains a Unicode-minus initiative with exact evidence',async()=>{
  const c=structuredClone(seed);c.source=c.source.replace('AC 15','AC 15 Initiative −2');c.units[0].text=c.units[0].text.replace('AC 15','AC 15 Initiative −2');c.creature.attributes.initiative=-2;
  const ir:any=await correct(c);ir.creature.attributes.initiative=null;const restored=anchorIrEvidenceSourceAudit(c.source,req(c.source).candidate,await ordinary(c.source,ir));expect(restored.creature.attributes.initiative).toBe(-2);expect(auditMonsterIntakeSource(c.source,restored).blocking).toEqual([]);
 });
 test('absent sense defaults do not become senses, and a missing printed sense does not pass',async()=>{
  const ir:any=await correct(seed);ir.creature.senses.blindsight=null;ir.creature.senses.special='';expect(auditMonsterIntakeSource(seed.source,ir).blocking).toEqual([]);
  ir.creature.senses.darkvision=null;expect(auditMonsterIntakeSource(seed.source,ir).blocking.length).toBeGreaterThan(0);
 });
 test('explicit source-audit normalization restores a missing language restriction and reports conflicting notes',async()=>{
  const c=cases.find(c=>c.id==='understands-cannot-speak'),ir=await correct(c);delete ir.creature.languages.custom;
  const retained=await ordinary(c.source,ir);expect(retained.creature.languages.custom).toBeUndefined();const restored=anchorIrEvidenceSourceAudit(c.source,req(c.source).candidate,retained);expect(restored.creature.languages.custom).toBe('understands Common but cannot speak');expect(auditMonsterIntakeSource(c.source,restored).blocking).toEqual([]);
  ir.creature.languages.custom='speaks every language';expect(await diagnosedAndRetained(c.source,ir,['languages','custom'])).toBe(true);
 });
});

describe('complete Save proof retains source ownership across full-word feet',()=>{
 const c=cases.find(c=>c.id==='two-failures'),source=c.features[0].text,op=c.features[0].operations[0];
 test('feet ends a sentence while ft. inside an Attack remains an abbreviation',()=>{
  expect(sourceOperationClauses(source)[1]).toBe(op.proof.save);
  expect(sourceOperationClauses('Claw. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 3 damage.')[1]).toContain('ft., one target.');
 });
 test('short and adjacent complete result proof bind the same Save without losing later results',()=>{
  const short=bindSourceOperations(source,[op])[0]!,long=bindSourceOperations(source,cases.find(c=>c.id==='two-failures-expanded-proof').features[0].operations)[0]!;
  expect(long.proof.save).toBe(short.proof.save);expect(long.sourceText).toBe(source);expect(long.sourceText).toContain('Second Failure:');
 });
 test('complete adjacent result proof tolerates wrapped source whitespace but not changed words',()=>{
  const wrapped=source.replace('DC 13,','DC\n13,').replace('feet. First','feet.\nFirst'),value=structuredClone(cases.find(c=>c.id==='two-failures-expanded-proof').features[0].operations);
  expect(bindSourceOperations(wrapped,value)[0]!.proof.save).toContain('DC\n13');value[0].proof.save=value[0].proof.save.replace('Restrained','Blinded');expect(sourceOperationErrors(wrapped,bindSourceOperations(wrapped,value))).toContain('0/save/dc-or-ability');
 });
 for(const suffix of ['First Failure: The target has the Restrained','Only if the target is already Restrained.','First Failure: The target must make a DC 19 Dexterity saving throw.'])test('cannot trim partial/conditional/other-roll proof: '+suffix,()=>{
  const other=op.proof.save+' '+suffix,text='Stone Glance. '+other+(suffix.endsWith('Restrained')?' condition.':'');
  expect(sourceOperationErrors(text,bindSourceOperations(text,[{...op,proof:{save:other}}]))).toContain('0/save/dc-or-ability');
 });
 test('longer complete proof cannot override a wrong DC',()=>{
  const value=structuredClone(cases.find(c=>c.id==='two-failures-expanded-proof').features[0].operations);value[0].save.dc=19;
  expect(sourceOperationErrors(source,bindSourceOperations(source,value))).toContain('0/save/dc-or-ability');
 });
});

test('a bounded sense restriction must survive source, IR and final visible Actor text',async()=>{
 const c=cases.find(c=>c.id==='blind-beyond-radius'),ir=await correct(c),markdown=renderMonsterIntakeMarkdown(ir),output=await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null});
 expect(auditMonsterIntakeSourceProjection(c.source,ir,markdown,output.rawJson).status).toBe('accepted');
 const missing=structuredClone(ir);missing.creature.biography=missing.creature.biography!.replace('(blind beyond this radius)','');
 const lostMarkdown=renderMonsterIntakeMarkdown(missing),lost=await convertMarkdownContentToJson({content:lostMarkdown,fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null});
 const codes=auditMonsterIntakeSourceProjection(c.source,missing,lostMarkdown,lost.rawJson).findings.map(f=>f.code);
 expect(codes).toContain('SOURCE_SENSE_QUALIFIER_OMITTED');expect(codes).toContain('ACTOR_SENSE_QUALIFIER_LOSS');
});

import {describe,expect,test} from 'bun:test';
import {modelReply,ordinary,staged,chain,request,requireAcceptedChain as requireAccepted} from './helpers/forge-semantic-chain';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {auditMonsterIntakeSource} from '@fvtt-json-generator/intake-ai/validator';
import data from './fixtures/forge-native-attack-cases.json';
import earlier from './fixtures/forge-weird-semantics-research-cases.json';
import {prepareFoundryImportArtifact,assertActorSemantics} from '../foundry-modules/fvtt-json-forge/src/runtime';
const cases:any[]=data.cases;
const parts=(values:any[])=>values.map(part=>({formula:String(part.custom?.enabled?part.custom.formula:part.number===undefined?'':`${part.number}d${part.denomination}${part.bonus?String(part.bonus).startsWith('-')?part.bonus:'+'+part.bonus:''}`).replace(/\s/gu,''),types:part.types}));
const expectedPart=(formula:string,type:string)=>({formula,types:[type]});
const featureName=(name:string)=>name.replace(/\s*\(?Recharge\s+\d[–-]\d\)?/iu,'');
const control=(c:any,path:string)=>chain(c,()=>path==='ordinary'?ordinary(c,modelReply(c)):staged(c));
// Source truth is an explicit offline audit; normal generation above keeps
// its Actor and checks only the declared IR-to-output projection.
async function sourceAuditChain(c:any,run:()=>Promise<any>){
 const result=await chain(c,run);
 if(!result.ir)return result;
 const audit=auditMonsterIntakeSource(c.source,result.ir,{coverageRange:request(c.source).candidate});
 return audit.blocking.length?{...result,status:'blocked',stage:'explicit-source-audit',findings:audit.blocking}:result;
}
function assertOutput(c:any,result:any){
 requireAccepted(result);
 const e=c.expected,item=result.actor.items.find((i:any)=>featureName(i.name)===featureName(c.features[0].name)),activities=Object.values(item.system.activities) as any[],attacks=activities.filter(a=>a.type==='attack'),saves=activities.filter(a=>a.type==='save');
 expect(item.system.description.value).toContain(c.features[0].text.replaceAll("'",'&#39;'));
 expect(activities.every(a=>a.activation.condition.includes(c.features[0].text))).toBe(true);
 expect(result.ir.coverage.map((ref:any)=>ref.quote).join('')).toBe(c.source);
 expect(result.actor.system.attributes.hp.value).toBe(c.creature.attributes.hp.value);
 const common=e.shared?[expectedPart(e.shared[0],e.shared[1])]:[];
 if(e.kind==='versatile'){
  expect(item.type).toBe('weapon');expect(item.system.properties).toContain('ver');expect(attacks).toHaveLength(1);
  expect(parts([item.system.damage.base])).toEqual([expectedPart(e.normal,e.type)]);
  expect(parts([item.system.damage.versatile])).toEqual([expectedPart(e.alternative,e.altType)]);
  expect(parts(attacks[0].damage.parts)).toEqual(common);
  expect(attacks[0].damage.includeBase).toBe(true);expect(attacks[0].attack.ability).toBe('none');
  expect(item.system.range).toEqual({value:e.thrown?20:null,long:e.thrown?60:null,reach:e.reach,units:'ft'});
  if(e.thrown)expect(item.system.properties).toContain('thr');
  if(c.features[0].name.startsWith('Spear'))expect(item.system.type).toEqual({value:'simpleM',baseItem:'spear'});
  if(c.features[0].name==='Warhammer')expect(item.system.type).toEqual({value:'martialM',baseItem:'warhammer'});
 }else if(e.kind==='conditional'){
  expect(attacks).toHaveLength(2);expect(activities.filter(a=>a.type==='damage')).toHaveLength(0);
  expect(parts(attacks[0].damage.parts)).toEqual([expectedPart(e.normal,e.type),...common]);
  expect(parts(attacks[1].damage.parts)).toEqual([expectedPart(e.alternative,e.altType),...common]);
  expect(attacks.every(a=>a.damage.includeBase===false)).toBe(true);
  expect(attacks[0].consumption).toEqual(attacks[1].consumption);
 }else if(e.kind==='gm-branches'){
  expect(item.type).toBe('feat');expect(attacks).toHaveLength(1);expect(activities.filter(a=>a.type==='damage')).toHaveLength(3);
  expect(item.system.properties??[]).not.toContain('ver');
 }else{
  expect(attacks).toHaveLength(1);expect(activities).toHaveLength(1);expect(item.system.properties??[]).not.toContain('ver');
 }
 for(const attack of attacks){
  expect(attack.attack.flat).toBe(true);expect(Number(attack.attack.bonus)).toBe(e.toHit);expect(attack.activation.type).toBe('action');
  if(e.kind!=='versatile')expect(attack.range.value).toBe(e.ranged?60:e.reach);
  expect(attack.target.affects.special).toBe('one target');
  if(e.recharge)expect(attack.consumption.targets).toEqual([{type:'itemUses',target:'',value:'1',scaling:{mode:'',formula:''}}]);
 }
 if(e.save){
  expect(saves).toHaveLength(1);expect(saves[0].damage.onSave).toBe('half');expect(parts(saves[0].damage.parts)).toEqual([expectedPart('2d8','poison')]);
  expect(saves[0].activation.type).toBe('special');expect(saves[0].consumption.targets).toEqual([]);
 }else expect(saves).toHaveLength(0);
 expect(new Set(activities.map(a=>a._id)).size).toBe(activities.length);
 return item;
}

describe('source-backed native damage modes retain their numbers, owner and conditions',()=>{
 for(const id of ['alternative-1-sentinel','guard-spear-sentinel','azer-hammer-sentinel'])for(const path of ['ordinary','staged-auto'])test('offline source audit rejects swapped ordinary/replacement numbers: '+id+' '+path,async()=>{
  const c=cases.find(c=>c.id===id),raw=modelReply(c),ops=raw.creature.actions[0].sourceOperations;
  const a=ops.find((op:any)=>op.id==='ordinary').damage[0],b=ops.find((op:any)=>op.id==='replacement').damage[0];[a.formula,b.formula]=[b.formula,a.formula];
  const result=await sourceAuditChain(c,()=>path==='ordinary'?ordinary(c,raw):staged(c,{path:['actions','0','sourceOperations'],value:ops}));expect(result.status).toBe('blocked');
 });
 for(const path of ['ordinary','staged-auto'])test('source may print the conditional branch first and otherwise second '+path,async()=>{
  const c=structuredClone(cases.find(c=>c.id==='alternative-1-sentinel')),f=c.features[0];
  const old=f.text.slice(f.text.indexOf('Hit:')),hit='Hit: 5 (2d4) piercing damage if the creature has half its hit points or fewer, or 10 (4d4) piercing damage otherwise.';
  f.text=f.text.replace(old,hit);for(const op of f.operations)if(op.proof.damage)op.proof.damage=op.proof.damage.map(()=>hit);
  c.units.find((u:any)=>u.destination==='feature').text=f.text+'\n';c.source=c.units.map((u:any)=>u.text).join('');
  const result=await control(c,path);requireAccepted(result);assertOutput(c,result);
 });
 test('native weapon and swarm semantics survive the existing core/Midi import adapter, with readback corruption rejected',async()=>{
  for(const c of [cases.find(c=>c.id==='guard-spear-sentinel'),cases.find(c=>c.id==='hp-poison-save-sentinel'),(earlier.cases as any[]).find(c=>c.id==='swarm-individual-size')]){
   const result=await control(c,'ordinary');requireAccepted(result);
   for(const midi of [false,true]){
    const artifact=prepareFoundryImportArtifact(result.actor,{modules:new Map([['midi-qol',{active:midi,version:'14.0.11'}]])} as any) as any;
    expect(()=>assertActorSemantics(artifact,structuredClone(artifact))).not.toThrow();
    const changed=structuredClone(artifact);changed.system.traits.size='grg';
    expect(()=>assertActorSemantics(artifact,changed)).toThrow('readback');
    const item=artifact.items.find((i:any)=>i.type==='weapon');
    if(item)for(const mutate of [(i:any)=>{delete i.system.damage.versatile;},(i:any)=>{i.system.damage.base.number=99;},(i:any)=>{i.system.properties=[];},(i:any)=>{i.system.type.baseItem='other';}]){
      const changed=structuredClone(artifact);mutate(changed.items.find((i:any)=>i.type==='weapon'));expect(()=>assertActorSemantics(artifact,changed)).toThrow('readback');
    }
    if(midi)expect(artifact.items.flatMap((i:any)=>Object.values(i.system.activities)).filter((a:any)=>a.type==='attack').every((a:any)=>a.otherActivityId==='none'&&a.midiProperties.otherActivityCompatible===false)).toBe(true);
   }
  }
 });
 for(const c of cases)for(const path of ['ordinary','staged-auto'])test(c.id+' '+path,async()=>{
  const before=JSON.stringify(c),result=await control(c,path);requireAccepted(result);const item=assertOutput(c,result);
  expect(JSON.stringify(c)).toBe(before);
  // Independent final-output corruption proves preservation alone is not
  // enough: wrong dice, wrong mode totals and wrong costs must fail verifier.
  const changed=structuredClone(result.actor),target=changed.items.find((i:any)=>i.name===item.name),activity=Object.values(target.system.activities).find((a:any)=>a.type==='attack') as any;
  activity.attack.bonus=String(c.expected.toHit+1);
  expect(verifyMonsterIntake(c.source,result.ir,result.markdown,changed,request(c.source).candidate).findings.some(f=>f.blocking)).toBe(true);
  if(c.expected.kind==='versatile'){
   const changed=structuredClone(result.actor),weapon=changed.items.find((i:any)=>i.name===item.name);
   if(weapon.system.damage.versatile.custom?.enabled)weapon.system.damage.versatile.custom.formula='99d12+99';else weapon.system.damage.versatile.number=99;
   expect(verifyMonsterIntake(c.source,result.ir,result.markdown,changed,request(c.source).candidate).findings.some(f=>f.code==='ACTOR_NATIVE_VERSATILE_DRIFT')).toBe(true);
  }else if(c.expected.kind==='conditional'){
   const changed=structuredClone(result.actor),i=changed.items.find((i:any)=>i.name===item.name),alternatives=Object.values(i.system.activities).filter((a:any)=>a.type==='attack') as any[];
   alternatives[1].damage.parts=[...alternatives[0].damage.parts,...alternatives[1].damage.parts];
   expect(verifyMonsterIntake(c.source,result.ir,result.markdown,changed,request(c.source).candidate).findings.some(f=>f.code==='ACTOR_SOURCE_OPERATION_DAMAGE_DRIFT')).toBe(true);
  }
 });
 for(const c of cases.filter(c=>c.expected.kind!=='unchanged'))for(const path of ['ordinary','staged-auto'])test('offline source audit: '+c.id+' rejects wrong source attack '+path,async()=>{
  const raw=modelReply(c);raw.creature.actions[0].sourceOperations[0].attack.toHit++;
  const result=await sourceAuditChain(c,()=>path==='ordinary'?ordinary(c,raw):staged(c,{path:['actions','0','sourceOperations','0','attack','toHit'],value:c.expected.toHit+1}));
  expect(result.status).toBe('blocked');
 });
 for(const c of cases.filter(c=>c.expected.kind==='conditional'||c.expected.kind==='versatile'))test('offline source audit: '+c.id+' rejects omitted condition',async()=>{
  const raw=modelReply(c),f=raw.creature.actions[0];
  for(const key of ['description','nativeRuleText','manualRemainder'])if(f[key])f[key]=f[key].replace(c.dropText,'');
  const result=await sourceAuditChain(c,()=>ordinary(c,raw));expect(result.status).toBe('blocked');
 });
 test('old 24-case research sources preserve explicit fields and literal rules',async()=>{
  for(const c of earlier.cases as any[])for(const path of ['ordinary','staged-auto']){
   const result=await control(c,path);requireAccepted(result);
   if(c.id==='half-hp-replacement')expect(Object.values(result.actor.items[0].system.activities).map((a:any)=>a.type)).toEqual(['attack','attack']);
   if(c.id==='two-handed-replacement')expect(result.actor.items[0].type).toBe('weapon');
   if(c.id==='swarm-individual-size'){
    expect(result.ir.creature.identity.swarmSize).toBe(path==='staged-auto'?'tiny':undefined);expect(result.actor.system.traits.size).toBe('med');expect(result.actor.system.details.type.swarm).toBe(path==='staged-auto'?'tiny':'');expect(result.actor.system.details.type.value).toBe('beast');
    expect(result.actor.items.find((item:any)=>item.name==='Swarm').system.description.value).toContain(c.features[0].text.replaceAll("'",'&#39;'));
   }
  }
 });
 test('an explicit swarm individual size is projected without changing its Actor size',async()=>{
  const c=(earlier.cases as any[]).find(entry=>entry.id==='swarm-individual-size'),before=JSON.stringify(c),raw=modelReply(c);
  raw.creature.identity.swarmSize='tiny';
  const result=await chain(c,()=>ordinary(c,raw));requireAccepted(result);
  expect(result.actor.system.details.type).toMatchObject({swarm:'tiny',value:'beast'});expect(result.actor.system.traits.size).toBe('med');expect(JSON.stringify(c)).toBe(before);
 });
});

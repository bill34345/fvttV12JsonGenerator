import {expect,test} from 'bun:test';
import fixture from './fixtures/forge-damage-upgrade.json';
import realReplies from './fixtures/forge-damage-upgrade-provider-replies.json';
import freshFirstReplies from './fixtures/forge-a-fresh-first-replies.json';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {legacyStagedProvider} from './helpers/forge-legacy-provider';
import {chain as defaultChain,modelReply,ordinary,staged,requireAcceptedChain,request} from './helpers/forge-semantic-chain';
import {anchorIrEvidenceSourceAudit} from '@fvtt-json-generator/intake-ai/orchestrator';
import {sourceDamageUpgradeOperations,sourceOperationErrors} from '@fvtt-json-generator/models/source-operations';
import {auditMonsterIntakeSourceProjection as verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {auditMonsterIntakeSource as validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {splitStagedMonsterSource} from '@fvtt-json-generator/intake-ai/staged-source';
import {assembleStagedFeature} from '@fvtt-json-generator/intake-ai/staged-extraction';

// These historical reconstruction controls opt into source auditing; the
// current full-IR route is compared independently below without restoration.
async function chain(c:any,run:()=>Promise<any>){
 const result=await defaultChain(c,async()=>{const extracted=await run();return{...extracted,ir:anchorIrEvidenceSourceAudit(c.source,request(c.source).candidate,extracted.ir)};});
 if(!result.ir)return result;
 const audit=validateMonsterIntakeIR(c.source,result.ir,{coverageRange:request(c.source).candidate});
 return audit.blocking.length?{...result,status:'blocked',stage:'explicit-source-audit',findings:audit.blocking}:result;
}
const run=(c:any,route:string)=>chain(c,()=>route==='ordinary'?ordinary(c,modelReply(c)):staged(c));
function reshape(change:(c:any)=>void){
 const c:any=structuredClone(fixture.case);change(c);
 const prefix=c.units.filter((u:any)=>u.destination!=='feature');
 c.units=[...prefix,...c.features.map((f:any)=>({destination:'feature',section:f.section,name:f.name,text:f.text+'\n\n'}))];
 c.source=c.units.map((u:any)=>u.text).join('');return c;
}
function expectUpgrade(r:any,c:any){
 requireAcceptedChain(r);
 const base=r.actor.items.find((i:any)=>i.name===c.features[0].name),upgrade=r.actor.items.find((i:any)=>i.name===c.features[1].name);
 const acts:any[]=Object.values(base.system.activities);
 expect(acts).toHaveLength(1);expect(acts[0].type).toBe('damage');
 expect(acts[0].damage.parts).toEqual([{number:2,denomination:8,bonus:'',types:['cold','fire','lightning','thunder'],custom:{enabled:false,formula:''},scaling:{mode:'whole',number:1,formula:''}}]);
 expect(acts[0].activation.type).toBe('special');expect(acts[0].target.affects.type).toBe('creature');
 expect(acts[0].consumption.targets).toEqual([]);expect(base.effects).toEqual([]);
 for(const text of [c.features[0].text,c.features[1].text])expect(acts[0].activation.condition).toContain(text);
 expect(Object.values<any>(upgrade.system.activities).map(a=>a.type)).toEqual(['utility']);
 expect(r.ir.creature.traits.map((f:any)=>f.description.startsWith(f.name)?f.description:f.name+'\n'+f.description)).toEqual(c.features.map((f:any)=>f.text));
 expect(base.flags.fvttJsonGenerator.manualRule.sourceOperations[0].proof.upgrade.sourceText.trim()).toBe(c.features[1].text);
 expect(base.system.description.value).toContain('300');
}

for(const route of ['ordinary','staged'])test(`existing two complete rules upgrade the actual ${route} damage operation`,async()=>{
 const c:any=structuredClone(fixture.case);expectUpgrade(await run(c,route),c);
});

for(const route of ['ordinary','staged'])test(`${route} keeps existing base-only damage unchanged without an upgrade`,async()=>{
 const c=reshape(c=>{c.features.pop();}),r=await run(c,route);requireAcceptedChain(r);
 const activities:any[]=Object.values(r.actor.items[0].system.activities);
 expect(activities).toHaveLength(1);expect(activities[0].damage.parts[0].number).toBe(1);
 expect(r.ir.creature.traits[0]!.sourceOperations![0]!.proof.upgrade).toBeUndefined();
});

for(const route of ['ordinary','staged'])test(`${route} program binds a missing base operation from the complete two-parent proof`,async()=>{
 const c=reshape(c=>{c.features[0].operations=[];});expectUpgrade(await run(c,route),c);
});

test('physical Level headings remain distinct with LF/CRLF and without inserted punctuation',()=>{
 for(const newline of ['\n','\r\n']){
  const source=fixture.case.source.replace(/\n/gu,newline),p=splitStagedMonsterSource(request(source));
  expect(p.features).toHaveLength(2);
  expect(p.features.map(f=>f.name)).toEqual(fixture.case.features.map(f=>f.name));
  for(const unit of p.units)expect(source.slice(unit.start,unit.end)).toBe(unit.quote);
 }
});

for(const route of ['ordinary','staged'])test(`${route} synthetic controls bind names from source and preserve a different typed formula`,async()=>{
 const c=reshape(c=>{for(const feature of c.features){
  feature.text=feature.text.replaceAll('Elemental Fury','Storm Gift').replaceAll('Primal Strike','Thunder Lash').replaceAll('1d8','1d6').replaceAll('2d8','3d6 + 2').replaceAll('Cold, Fire, Lightning, or Thunder','Force');
  feature.name=feature.text.split('\n')[0];feature.operations=[];
 }});
 const r=await run(c,route);requireAcceptedChain(r);
 const a:any=Object.values(r.actor.items[0].system.activities)[0];
 expect(a.type).toBe('damage');expect(a.damage.parts[0]).toMatchObject({number:3,denomination:6,bonus:'2',types:['force']});
 expect(a.target.affects).toMatchObject({type:'creature',count:'1'});expect(a.activation.condition).toContain('Thunder Lash');
});

for(const route of ['ordinary','staged'])test(`${route} relation follows the actual named parent even when source order is reversed`,async()=>{
 const c=reshape(c=>{c.features.reverse();}),r=await run(c,route);requireAcceptedChain(r);
 const base=r.actor.items.find((i:any)=>i.name===fixture.case.features[0]!.name);
 expect(Object.values<any>(base.system.activities)[0].damage.parts[0].number).toBe(2);
 expect(r.ir.creature.traits[1]!.sourceOperations![0]!.proof.upgrade).toBeDefined();
});

test('same-source upgrade identity and conditional mechanics remain independently guarded',()=>{
 const base=fixture.case.features[0]!.text,context=fixture.case.features[1]!.text;
 const valid=sourceDamageUpgradeOperations(base,[context])!;expect(valid).toHaveLength(1);
 expect(sourceOperationErrors(base,valid,[context])).toEqual([]);
 for(const mutate of [
  (x:any[])=>{x[0].damage[0].formula='1d8';},(x:any[])=>{x[0].damage[0].formula='99d8';},
  (x:any[])=>{x[0].damage[0].types=['force'];x[0].damage[0].type='force';},
  (x:any[])=>{x[0].damage[0].types.pop();},(x:any[])=>{x[0].condition='';},
  (x:any[])=>{x[0].relationship='primary';},(x:any[])=>{x[0].damage[0].relationship='base';},
  (x:any[])=>{x[0].proof.damage[0]=x[0].proof.damage[0].replace('Once on each of your turns ','');},
  (x:any[])=>{x[0].proof.upgrade.quote='The extra damage increases to 2d8.';},
  (x:any[])=>{x[0].range=300;},(x:any[])=>{x.push(structuredClone(x[0]));},
 ]){const bad=structuredClone(valid);mutate(bad);expect(sourceOperationErrors(base,bad,[context]).length).toBeGreaterThan(0);}
 expect(sourceOperationErrors(base,valid,[]).length).toBeGreaterThan(0);
 for(const wrong of [context.replace('your Primal Strike','your Other Strike'),context.replace('for Elemental Fury','for Other Fury'),context.replace('increases to','does not increase to')])expect(sourceDamageUpgradeOperations(base,[wrong])).toBeUndefined();
 expect(sourceDamageUpgradeOperations(base,[context,context])).toBeUndefined();
});

for(const route of ['ordinary','staged'])test(`${route} conflicting explicit base proposals are preserved and rejected`,async()=>{
 for(const mutate of [(c:any)=>{c.features[0].operations[0].damage[0].formula='99d8';},(c:any)=>{c.features[0].operations[0].damage[0].types=['force'];}]){
  const c=reshape(mutate);
  if(route==='staged'){
   // Known pairs no longer ask for an already proven feature proposal.
   // Keep this negative on the actual strict proposal consumer.
   const plan=splitStagedMonsterSource(request(c.source)),unit=plan.features[0]!;
   const feature=assembleStagedFeature(plan,unit,{schemaVersion:1,unitId:unit.id,mode:'native-with-gm',facts:{sourceOperations:c.features[0].operations}},c.creature.identity.name);
   expect(sourceOperationErrors(unit.quote,feature.sourceOperations).length).toBeGreaterThan(0);
  }else expect((await run(c,route)).status).toBe('blocked');
 }
});

test('recorded first ordinary real reply restores two complete parents despite separate names and plain section coverage',async()=>{
 const c:any=structuredClone(fixture.case);
 const r=await chain(c,()=>ordinary(c,structuredClone(realReplies.ordinaryIr)));
 expectUpgrade(r,c);
 const trimmed:any=structuredClone(realReplies.ordinaryAnchoredIrBeforeFix);
 for(const ref of [...trimmed.coverage,...trimmed.claims.flatMap((claim:any)=>claim.evidence??[]),...trimmed.creature.traits.flatMap((f:any)=>f.evidence??[])]){
  const tail=ref.quote.length-ref.quote.trimEnd().length;ref.end-=tail;ref.quote=ref.quote.trimEnd();
 }
 expectUpgrade(await chain(c,()=>ordinary(c,trimmed)),c);
 for(const mutate of [
  (ir:any)=>{ir.creature.traits[0].description=ir.creature.traits[0].description.replace('Once on each of your turns ','');},
  (ir:any)=>{ir.creature.traits[0].nativeRuleText='Unconditionally deal 99d8 damage';ir.creature.traits[0].manualRemainder='';},
  (ir:any)=>{ir.creature.traits[0].description=ir.creature.traits[0].description.replace('1d8','99d8');},
 ]){const raw:any=structuredClone(realReplies.ordinaryIr);mutate(raw);expect((await chain(c,()=>ordinary(c,raw))).status).toBe('blocked');}
});

test('explicit historical staged chain consumes only the saved real base reply for the independently proven complete pair',async()=>{
 let calls=0;
 const provider=legacyStagedProvider({authMode:'api-key',apiKey:'offline',baseUrl:'https://offline.invalid/v1',model:'saved-real-base',reviewModel:'saved-real-base',maxAttempts:1,timeoutMs:10000,repairTimeoutMs:10000,stagedExtraction:{baseMode:'facts',featureMode:'auto'},httpClient:async()=>{
  if(++calls>1)throw Error('Unnecessary feature proposal');return{ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(realReplies.stagedBaseResponse)}}]})};
 }});
 const r=await chain(fixture.case,async()=>({ir:await provider.extract(request(fixture.case.source))}));expectUpgrade(r,fixture.case);expect(calls).toBe(1);
 const plan=splitStagedMonsterSource(request(fixture.case.source));
 const invalid=assembleStagedFeature(plan,plan.features[0]!,realReplies.invalidStagedFeature,fixture.case.creature.identity.name);
 expect(sourceOperationErrors(plan.features[0]!.quote,invalid.sourceOperations).length).toBeGreaterThan(0);
});

test('independent validator exposes the old Utility-only real result instead of treating it as upgraded native success',()=>{
 expect(validateMonsterIntakeIR(fixture.case.source,realReplies.ordinaryAnchoredIrBeforeFix).blocking.some(f=>f.code==='SOURCE_DAMAGE_UPGRADE_OMITTED')).toBe(true);
});

test('source validation rejects a forged/dropped relation and Actor verification rejects changed output',async()=>{
 const c:any=structuredClone(fixture.case),r=await run(c,'ordinary');requireAcceptedChain(r);
 for(const mutate of [
  (ir:any)=>{ir.creature.traits[0].sourceContext=[];},
  (ir:any)=>{ir.creature.traits[0].sourceOperations[0].damage[0].formula='1d8';delete ir.creature.traits[0].sourceOperations[0].proof.upgrade;},
  (ir:any)=>{ir.creature.traits[0].sourceContext[0]=ir.creature.traits[0].sourceContext[0].replace('2d8','99d8');},
  (ir:any)=>{ir.creature.traits[1].description=ir.creature.traits[1].description.replace('for Elemental Fury','for Other Fury');},
 ]){const bad=structuredClone(r.ir);mutate(bad);expect(validateMonsterIntakeIR(c.source,bad).blocking.length).toBeGreaterThan(0);}
 for(const mutate of [
  (a:any)=>{Object.values<any>(a.items[0].system.activities)[0].damage.parts[0].number=1;},
  (a:any)=>{Object.values<any>(a.items[0].system.activities)[0].damage.parts[0].types=['force'];},
  (a:any)=>{Object.values<any>(a.items[0].system.activities)[0].activation.condition='';},
  (a:any)=>{Object.values<any>(a.items[0].system.activities)[0].consumption.targets=[{type:'itemUses',value:'1'}];},
  (a:any)=>{Object.values<any>(a.items[0].system.activities)[0].target.affects.type='self';},
  (a:any)=>{const acts=a.items[0].system.activities;acts.extra={...structuredClone(Object.values<any>(acts)[0]),_id:'extra'};},
 ]){const bad=structuredClone(r.actor);mutate(bad);expect(verifyMonsterIntake(c.source,r.ir,r.markdown,bad,request(c.source).candidate).status).toBe('needs_review');}
});

test('upgrade restoration cannot erase explicit conflicting carrier fields',async()=>{
 const c:any=structuredClone(fixture.case);
 const raw=modelReply(c);raw.creature.traits[0].nativeRuleText='Unconditionally deal 99d8 damage';raw.creature.traits[0].manualRemainder='';
 const result=await chain(c,()=>ordinary(c,raw));expect(result.status).toBe('blocked');
 const plan=splitStagedMonsterSource(request(c.source)),unit=plan.features[0]!;
 expect(()=>assembleStagedFeature(plan,unit,{schemaVersion:1,unitId:unit.id,mode:'native-with-gm',facts:{sourceOperations:c.features[0].operations,nativeRuleText:'Unconditionally deal 99d8 damage'}},c.creature.identity.name)).toThrow();
});

test('default full IR keeps its declared damage and complete candidate before an explicit source upgrade audit',async()=>{
 const c:any=structuredClone(fixture.case),raw=modelReply(c);
 raw.creature.traits[0].executionMode='gm-manual';
 const extracted=await ordinary(c,raw),before=structuredClone(extracted.ir);
 const retained=await defaultChain(c,async()=>extracted);requireAcceptedChain(retained);
 expect(retained.ir).toEqual(before);expect(extracted.ir).toEqual(before);
 expect(raw.creature.traits[0].executionMode).toBe('gm-manual');
 expect(retained.ir.creature.traits[0]!.sourceOperations![0]!.damage![0]!.formula).toBe('1d8');
 expect(retained.actor.items).toHaveLength(2);
 expect(Object.values<any>(retained.actor.items[0].system.activities)[0].damage.parts[0].number).toBe(1);
 expect(validateMonsterIntakeIR(c.source,before).blocking.some(finding=>finding.code==='SOURCE_DAMAGE_UPGRADE_OMITTED')).toBe(true);
 expectUpgrade(await chain(c,async()=>extracted),c);
});

// A-baseline behavior records: an expected rejection here is explicitly not
// a successful ordinary generation or an overall product acceptance verdict.
test('explicit source audit retains the historical empty-spellcasting finding and generated Actor',async()=>{
 expect(String(hashSource(fixture.case.source))).toBe(freshFirstReplies.sourceSha256);
 expect(String(hashSource(freshFirstReplies.ordinary.content))).toBe(freshFirstReplies.ordinary.contentSha256);
 const r=await chain(fixture.case,()=>ordinary(fixture.case,JSON.parse(freshFirstReplies.ordinary.content)));
 expect(r.status).toBe('blocked');expect(r.stage).toBe('explicit-source-audit');
 expect(r.findings?.map((f:any)=>f.code)).toEqual(['INVALID_SPELLCASTING_GROUPS']);
 expect(r.actor).toBeDefined();
 const op=r.ir!.creature.traits[0]!.sourceOperations![0]!;
 expect(op.damage![0]).toMatchObject({formula:'2d8',types:['cold','fire','lightning','thunder']});
 expect(op.condition).toContain('Once on each of your turns');
 expect(op.proof.upgrade!.sourceText).toContain('The option you chose for Elemental Fury');
});

test('A baseline replays the latest fresh staged base response through the full conditional damage chain',async()=>{
 expect(String(hashSource(freshFirstReplies.staged.content))).toBe(freshFirstReplies.staged.contentSha256);
 let calls=0;
 const provider=legacyStagedProvider({authMode:'api-key',apiKey:'offline',baseUrl:'https://offline.invalid/v1',model:'frozen-fresh-A-base',reviewModel:'frozen-fresh-A-base',maxAttempts:1,timeoutMs:10000,repairTimeoutMs:10000,stagedExtraction:{baseMode:'facts',featureMode:'auto'},httpClient:async()=>{
  if(++calls>1)throw Error('Unexpected feature request');return{ok:true,status:200,json:async()=>({choices:[{message:{content:freshFirstReplies.staged.content}}]})};
 }});
 const r=await chain(fixture.case,async()=>({ir:await provider.extract(request(fixture.case.source))}));
 expectUpgrade(r,fixture.case);expect(calls).toBe(1);
});

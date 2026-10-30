import {describe,test,expect} from 'bun:test';
import yaml from 'js-yaml';
import {decodeCategoryFormV2} from '../packages/intake-ai/src/category-form-v2';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {runWholeVampireContract,wholeVampireSource,wholeVampireCandidate} from './helpers/whole-vampire-contract';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {validateMonsterIntakeIR,auditMonsterIntakeSource} from '@fvtt-json-generator/intake-ai/validator';
import {assertDefaultFullIrReplay} from './helpers/forge-legacy-provider';
import {serializeForgeEncounterPackage} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';

const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const plain=(value:string)=>value.replace(/<[^>]*>/gu,' ').replace(/\s+/gu,' ').trim();
const activities=(item:any)=>Object.values<any>(item.system.activities??{});
const allFeatures=(ir:any)=>['traits','actions','bonusActions','reactions','legendaryActions','mythicActions'].flatMap(section=>(ir.creature[section]??[]).map((feature:any,index:number)=>({feature,path:`/creature/${section}/${index}`})));
function assertFrozenEvidence(){
  const manifest=JSON.parse(readFileSync(resolve('.local/forge-repeat-v2-trial-20261020/first-evidence-freeze.json'),'utf8')) as Record<string,string>;
  for(const [path,sha]of Object.entries(manifest))expect(hash(readFileSync(path))).toBe(sha);
  expect(Object.keys(manifest)).toHaveLength(343);return Object.keys(manifest).length;
}

/** Explicit opt-in, exact task directory, new filenames only. Every exported
 * Actor and rendered Markdown is produced by the real formal pipeline. */
function recordEvidence(reference:string,run:Awaited<ReturnType<typeof runWholeVampireContract>>,coverage:any[],tamperChecks:any[]){
  if(process.env.FORGE_WHOLE_VAMPIRE_EVIDENCE!=='1')return;
  const directory=resolve('.local/forge-v2-bw-integration-20261020');if(!existsSync(directory))throw Error('Task evidence directory must already exist');
  const prefix='historical-srd51-vampire-projection-'+reference+'-'+new Date().toISOString().replace(/[:.]/gu,'-'),entry=run.result.report.actors[0]!,prepared=run.result.prepared!;
  const content:Record<string,string>={
    'source.md':wholeVampireSource.source,'ir.json':JSON.stringify(entry.analysis.ir,null,2)+'\n','form.json':JSON.stringify(run.forms[0],null,2)+'\n',
    'rendered.md':prepared.bundle.actors[0]!.source,'actor.json':JSON.stringify(prepared.actors[0]!.artifact,null,2)+'\n',
    'encounter.json':serializeForgeEncounterPackage(prepared.bundle),'report.json':JSON.stringify(run.result.report,null,2)+'\n','mock-requests.json':JSON.stringify(run.requests,null,2)+'\n',
  };
  const files=Object.entries(content).map(([suffix,text])=>{const path=join(directory,prefix+'.'+suffix);writeFileSync(path,text,{flag:'wx'});return {path,sha256:hash(text)};});
  const implementationPaths=['tests/helpers/whole-vampire-contract.ts','tests/forge-whole-vampire-contract.test.ts','tests/fixtures/forge-template-repeat-v2-srd.json',
    'tests/fixtures/forge-v2-bw-base-facts.json','packages/intake-ai/src/source-completeness.ts','packages/intake-ai/src/category-form-v2-identity.ts',
    'packages/intake-ai/src/category-form-v2-adapter.ts','packages/intake-ai/src/category-form-v2-healing.ts','packages/intake-ai/src/staged-extraction.ts','packages/intake-ai/src/staged-source.ts',
    'packages/intake-ai/src/validator.ts','packages/intake-ai/src/verifier.ts','packages/intake-ai/src/renderer.ts','packages/generation/src/actor.ts',
    'packages/forge-browser-runtime/src/encounterIntake.ts','packages/forge-browser-runtime/src/encounterPreparation.ts'];
  const receipt={scope:'historical-srd51-2014-legacy-transport-and-projection-not-2024-quality-acceptance',reference,status:run.result.report.status,packageStatus:'prepared',
    sourceSha256:hash(wholeVampireSource.source),sourceUrl:wholeVampireSource.sourceUrl,sourcePdfPages:wholeVampireSource.pdfPages,sourceUnitCoverage:coverage,expectedOriginalUnits:14,qualifiedHeaderPreserved:true,
    modelHttp:run.modelHttp,fakeTransportCalls:run.requests.length,transportStages:run.requests.map(payload=>payload.lines?'source':payload.template?'whole-feature':'base'),
    packageHash:prepared.hash,artifactHash:prepared.actors[0]!.artifactHash,tamperChecks,originalFrozenFiles:assertFrozenEvidence(),
    runtimeAcceptance:'NOT_EXECUTED',originalFrozenR4Status:'blocked-not-rescored',bunVersion:Bun.version,
    targetBoundary:{nativeCount:'',recipient:'creature',completeOneCreatureAlternatives:'preserved-in-special',execution:'GM selects one qualifying creature; native count enforcement is not claimed'},
    implementationHashes:Object.fromEntries(implementationPaths.map(path=>[path,hash(readFileSync(resolve(path)))])),files};
  const receiptPath=join(directory,prefix+'.receipt.json');writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log('Whole Vampire evidence: '+receiptPath);
}

describe('historical SRD 5.1 / 2014 Vampire legacy transport and projection compatibility; not 2024 quality acceptance',()=>{
for(const reference of ['id','name'] as const)test('legacy whole-form '+reference+' and current fixed full-IR replay retain the formal projection',async()=>{
  const run=await runWholeVampireContract(reference),{result,plan,requests}=run;
  expect(plan.features).toHaveLength(14);
  expect(plan.features.map(unit=>({name:unit.name,quote:unit.quote.trim(),section:String(unit.section)}))).toEqual(wholeVampireSource.units.map(unit=>({name:unit.name,quote:unit.quote.trim(),section:unit.section})));
  expect(result.report.actors.flatMap(entry=>entry.analysis.findings)).toEqual([]);
  expect(result.report.findings).toEqual([]);expect(result.report.status).toBe('ready_for_gm_review');
  expect(result.prepared?.actors).toHaveLength(1);expect(requests.length).toBe(plan.linePartition?3:2);expect(run.forms).toHaveLength(1);
  const entry=result.report.actors[0]!,ir=entry.analysis.ir!,generation=entry.generation!,prepared=result.prepared!,actor=prepared.actors[0]!.artifact as any;
  expect(ir.source).toEqual({sha256:wholeVampireSource.sourceSha256,length:wholeVampireSource.source.length});
  expect(generation.formalStatus).toBe('accepted');expect(generation.intakeVerificationStatus).toBe('accepted');
  expect(generation.modelReviewStatus).toBe('not_requested');expect(generation.calls.review).toBe(0);
  expect(auditMonsterIntakeSource(wholeVampireSource.source,ir).blocking).toEqual([]);
  await assertDefaultFullIrReplay(wholeVampireSource.source,ir,{actor,markdown:prepared.bundle.actors[0]!.source,discoveryCalls:1});
  expect(actor.name).toBe('Vampire');expect(actor.system.attributes.hp.max).toBe(144);expect(actor.system.attributes.ac.flat).toBe(16);expect(actor.system.abilities.str.value).toBe(18);
  const coverage=plan.features.map(unit=>{
    const candidates=allFeatures(ir).filter(({feature})=>feature.name===unit.name&&feature.description===unit.quote.trim());expect(candidates).toHaveLength(1);
    const {feature,path}=candidates[0]!;expect(feature.evidence).toEqual([{start:unit.start,end:unit.end,quote:unit.quote}]);
    expect(ir.coverage).toContainEqual(expect.objectContaining({start:unit.start,end:unit.end,quote:unit.quote,classification:'mechanical',claimPaths:[path]}));
    const items=actor.items.filter((item:any)=>item.name===unit.name&&plain(item.system?.description?.value??'').includes(plain(unit.quote)));expect(items,unit.name).toHaveLength(1);
    expect(plain(items[0].system.description.value)).toContain(plain(unit.quote));
    return {unitId:unit.id,name:unit.name,section:unit.section,path,sourceSha256:hash(unit.quote),itemId:items[0]._id,mode:feature.executionMode};
  });
  expect(actor.items).toHaveLength(15);
  const item=(name:string)=>{const rows=actor.items.filter((value:any)=>value.name===name);expect(rows).toHaveLength(1);return rows[0];};
  const qualified=item('Damage Resistances');expect(qualified.flags.fvttJsonGenerator.manualRule.mode).toBe('gm-manual');
  expect(qualified.flags.fvttJsonGenerator.manualRule.sourceText).toContain('and slashing from nonmagical attacks');
  expect(actor.system.traits.dr.value).toEqual(['necrotic']);expect(qualified.effects).toEqual([]);
  expect(actor.system.resources.legact.max).toBe(3);expect(ir.creature.legendary?.max).toBe(3);
  const preamble=wholeVampireSource.units.find(unit=>unit.section==='legendary')!.context[0]!;
  expect(ir.creature.legendary?.preamble.trim()).toBe(preamble.trim());expect(plain(actor.system.details.biography.value)).toContain(plain(preamble));
  for(const [name,cost]of [['Move',1],['Unarmed Strike',1],['Bite (Costs 2 Actions)',2]] as const){
    const selected=item(name);expect(selected.system.type.subtype).toBe('legendary');expect(selected.system.uses).toBeUndefined();
    expect(activities(selected)).toHaveLength(1);expect(activities(selected)[0].activation).toMatchObject({type:'legendary',value:cost});
    // The established 2014 contract leaves unlabelled one-action costs implicit.
    expect(ir.creature.legendaryActions.find(feature=>feature.name===name)?.legendaryCost??1).toBe(cost);
  }
  expect(actor.system.resources.legres).toMatchObject({spent:0,max:3});
  expect(item('Legendary Resistance (3/Day)').system.uses).toMatchObject({max:'',recovery:[]});
  expect(activities(item('Legendary Resistance (3/Day)'))[0].consumption.targets).toEqual([{type:'attribute',target:'resources.legres.value',value:'1',scaling:{mode:'',formula:''}}]);
  expect(item('Children of the Night (1/Day)').system.uses).toMatchObject({max:'1',recovery:[{period:'day',type:'recoverAll'}]});
  const bite=item('Bite (Bat or Vampire Form Only)'),biteAttack=activities(bite)[0]!;
  expect(activities(bite)).toHaveLength(1);expect(biteAttack.type).toBe('attack');expect(biteAttack.attack.bonus).toBe('9');expect(biteAttack.range.value).toBe(5);
  expect(biteAttack.damage.parts).toMatchObject([{number:1,denomination:6,bonus:'4',types:['piercing']},{number:3,denomination:6,types:['necrotic']}]);
  // Existing compound-recipient projection keeps the complete literal slot;
  // the GM enforces its one-creature alternatives, without native count claims.
  expect(biteAttack.target.affects).toMatchObject({count:'',type:'creature'});
  expect(biteAttack.target.affects.special).toBe('one willing creature, or a creature that is grappled by the vampire, incapacitated, or restrained');
  expect(activities(bite).some(value=>value.type==='heal')).toBe(false);
  const unarmed=activities(item('Unarmed Strike (Vampire Form Only)'))[0]!;
  expect(unarmed.type).toBe('attack');expect(unarmed.attack.bonus).toBe('9');expect(unarmed.damage.parts).toMatchObject([{number:1,denomination:8,bonus:'4',types:['bludgeoning']}]);
  const charm=activities(item('Charm'))[0]!;expect(charm.type).toBe('save');expect(charm.save).toMatchObject({ability:['wis'],dc:{formula:'17'}});expect(charm.range.value).toBe(30);
  expect(charm.target.affects.special).toContain('one humanoid it can see');expect(charm.activation.condition).toContain('If the target can see the vampire');
  const weakness=item('Vampire Weaknesses');expect(activities(weakness)).toHaveLength(2);
  expect(activities(weakness).sort((a,b)=>a.damage.parts[0].types[0].localeCompare(b.damage.parts[0].types[0])).map(value=>value.damage.parts)).toMatchObject([[{custom:{enabled:true,formula:'20'},types:['acid']}],[{custom:{enabled:true,formula:'20'},types:['radiant']}]]);
  expect(activities(weakness).find(value=>value.damage.parts[0].types.includes('acid')).activation.condition).toContain('running water');
  expect(activities(weakness).find(value=>value.damage.parts[0].types.includes('radiant')).activation.condition).toContain('sunlight');
  expect(weakness.effects).toEqual([]);expect(activities(weakness).every(value=>value.activation.type==='special'&&value.consumption.targets.length===0)).toBe(true);
  const tamperChecks:any[]=[];
  for(const [name,mutate]of [
    ['bite-damage',(bad:any)=>{activities(bad.items.find((value:any)=>value.name===bite.name))[0].damage.parts[1].number=99;}],
    ['legendary-budget',(bad:any)=>{bad.system.resources.legact.max=9;}],
    ['legendary-default-cost',(bad:any)=>{activities(bad.items.find((value:any)=>value.name==='Move'))[0].activation.value=2;}],
    ['legendary-bite-cost',(bad:any)=>{activities(bad.items.find((value:any)=>value.name==='Bite (Costs 2 Actions)'))[0].activation.value=1;}],
    ['daily-resistance',(bad:any)=>{bad.system.resources.legres.max=99;}],
    ['resistance-consumption',(bad:any)=>{activities(bad.items.find((value:any)=>value.name==='Legendary Resistance (3/Day)'))[0].consumption.targets=[];}],
    ['qualified-header',(bad:any)=>{bad.items.find((value:any)=>value.name==='Damage Resistances').system.description.value='Resistant to all damage';}],
  ] as Array<[string,(bad:any)=>void]>){
    const bad=structuredClone(actor);mutate(bad);const findings=verifyMonsterIntake(wholeVampireSource.source,ir,prepared.bundle.actors[0]!.source,bad,wholeVampireCandidate).findings;
    tamperChecks.push({name,rejected:findings.some(finding=>finding.blocking),codes:findings.filter(finding=>finding.blocking).map(finding=>finding.code)});
  }
  for(const [name,mutate]of [
    ['truncated-header',(bad:any)=>{bad.creature.traits[0].description='Damage Resistances necrotic';}],
    ['wrong-header-qualifier',(bad:any)=>{bad.creature.traits[0].description=bad.creature.traits[0].description.replace('nonmagical','magical');}],
    ['body-header-borrowing',(bad:any)=>{
      const unit=plan.features.find(feature=>feature.name==='Shapechanger')!,evidence={start:unit.start,end:unit.end,quote:unit.quote};
      bad.creature.traits[0].description=unit.quote.trim();bad.creature.traits[0].evidence=[evidence];
      bad.claims.find((claim:any)=>claim.path==='/creature/traits/0').evidence=[evidence];
      for(const row of bad.coverage){row.claimPaths=row.claimPaths.filter((path:string)=>path!=='/creature/traits/0');if(row.start===unit.start&&row.end===unit.end)row.claimPaths.push('/creature/traits/0');}
    }],
    ['missing-qualified-header',(bad:any)=>{
      bad.creature.traits.shift();const remap=(path:string)=>path.replace(/^\/creature\/traits\/(\d+)(?=\/|$)/u,(_whole,index)=>'/creature/traits/'+(Number(index)-1));
      bad.claims=bad.claims.filter((claim:any)=>!/^\/creature\/traits\/0(?:\/|$)/u.test(claim.path)).map((claim:any)=>({...claim,path:remap(claim.path)}));
      bad.coverage=bad.coverage.map((row:any)=>({...row,claimPaths:row.claimPaths.filter((path:string)=>!/^\/creature\/traits\/0(?:\/|$)/u.test(path)).map(remap)}));
    }],
    ['IR-legendary-budget',(bad:any)=>{bad.creature.legendary.max=9;bad.claims.find((claim:any)=>claim.path==='/creature/legendary/max').value=9;}],
    ['IR-legendary-budget-omitted',(bad:any)=>{
      delete bad.creature.legendary;bad.claims=bad.claims.filter((claim:any)=>claim.path!=='/creature/legendary/max');
      bad.coverage=bad.coverage.map((row:any)=>({...row,claimPaths:row.claimPaths.filter((path:string)=>path!=='/creature/legendary/max')}));
    }],
    ['IR-legendary-default-cost',(bad:any)=>{bad.creature.legendaryActions.find((feature:any)=>feature.name==='Move').legendaryCost=2;}],
    ['stale-source',(bad:any)=>{bad.source.sha256='0'.repeat(64);}],
  ] as Array<[string,(bad:any)=>void]>){
    const bad=structuredClone(ir);mutate(bad);
    // Content comparisons are an explicit source audit. Stale identity remains
    // a default structural rejection; no source judge is reintroduced there.
    const validation=(name==='stale-source'?validateMonsterIntakeIR:auditMonsterIntakeSource)(wholeVampireSource.source,bad,{coverageRange:{start:0,end:wholeVampireSource.source.length}});
    if(['truncated-header','wrong-header-qualifier','body-header-borrowing','missing-qualified-header'].includes(name))expect(validation.blocking.some(finding=>finding.code==='SOURCE_HEADER_RULE_OMITTED')).toBe(true);
    tamperChecks.push({name,rejected:validation.blocking.length>0,codes:validation.blocking.map(finding=>finding.code)});
  }
  expect(tamperChecks.filter(check=>!check.rejected)).toEqual([]);
  recordEvidence(reference,run,coverage,tamperChecks);
});

for(const [change,code]of [
  ['wrong-reference','V2_HEALING_EVENT_REFERENCE_CONFLICT'],['stale-reference','V2_REFERENCE_UNPROVEN'],['unbound-owner','V2_HEALING_TARGET_REVIEW_REQUIRED'],
  ['missing-target','V2_TARGET_OMITTED'],['wrong-count','V2_TARGET_COUNT'],['wrong-budget','V2_LEGENDARY_BUDGET_CONFLICT'],['missing-unit','V2_MISSING_UNITS'],
] as const)test('full Vampire retains '+change+' findings without silently repairing or accepting source errors',async()=>{
  const run=await runWholeVampireContract('id',form=>{
    const bite=form.动作.find((row:any)=>row.名称==='Bite (Bat or Vampire Form Only)');
    if(change==='wrong-reference')bite.治疗[0].取值依据='等于目标因该次[Children of the Night (1/Day)]所受死灵伤害的实际数值';
    if(change==='stale-reference')bite.治疗[0].取值依据='等于目标因该次[old-source-feature-9]所受死灵伤害的实际数值';
    if(change==='unbound-owner')bite.治疗[0].目标='吸血鬼';
    if(change==='missing-target')bite.攻击.目标限制=null;
    if(change==='wrong-count')bite.攻击.目标数量=2;
    if(change==='wrong-budget')form.传奇动作[0].共享资源.上限=9;
    if(change==='missing-unit')form.特性.splice(form.特性.findIndex((row:any)=>row.名称==='Spider Climb'),1);
  });
  if(change==='missing-unit'){
    expect(run.result.prepared).toBeUndefined();expect(run.result.report.status).toBe('needs_review');
    expect(()=>decodeCategoryFormV2({markdown:yaml.dump(run.forms[0])},run.plan)).toThrow(code);
  }else{
    expect(run.result.prepared).toBeDefined();
    const actor=run.result.prepared!.actors[0]!.artifact as any;
    const item=actor.items.find((entry:any)=>entry.name==='Bite (Bat or Vampire Form Only)');
    expect(Object.values<any>(item.system.activities).some(activity=>activity.type==='attack'&&activity.damage.parts.length===2)).toBe(true);
    expect(run.result.report.actors[0]!.analysis.ir!.uncertainties.some(f=>f.blocking)).toBe(true);
  }
  if(change!=='missing-unit')expect(run.result.report.findings.join('\n')).toContain(code);expect(run.modelHttp).toBe(0);
});
});

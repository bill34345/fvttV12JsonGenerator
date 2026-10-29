import {afterAll,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import yaml from 'js-yaml';
import {analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {buildForgeActorRequest,convertFinalActorSource} from '@fvtt-json-generator/forge-browser-runtime';
import {normalizeMonsterIntakeProposal} from '@fvtt-json-generator/intake-ai/provider';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {ParserFactory} from '@fvtt-json-generator/parser/router';
import {validateActorSpellManifestStructure,validatePortableSpellManifestStructure,RESOLVER_MODULE_ID} from '@fvtt-json-generator/spell-manifest-contracts';
import {planSpellHydration,hashSourceInventoryMetadata,type SpellCandidateMetadata} from '../src/core/spell-resolution';
import {buildCastActivitySource} from '../foundry-modules/monster-spell-resolver/src/cast-activity';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';

const frozen=JSON.parse(readFileSync('tests/fixtures/forge-ordinary-protocol-failures.json','utf8')).ordinary;
const denied=async():Promise<never>=>{throw Error('Preservation regression forbids model calls');};
const provider={providerName:'frozen-preservation',extractionModel:'frozen',reviewModel:'disabled',discover:denied,extract:denied,repair:denied,review:denied};
const originalFetch=globalThis.fetch;
let networkCalls=0;
globalThis.fetch = Object.assign((async()=>{networkCalls++;throw Error('Preservation regression forbids network');}), {preconnect: () => { throw Error('Frozen tests forbid network preconnect.'); }});
afterAll(()=>{globalThis.fetch=originalFetch;expect(networkCalls).toBe(0);});

async function generate(ir:any,source=frozen.source){
  const input={source,sourceName:'preservation contract',sourceScope:'single' as const,requestId:'preservation-content',sourceId:'actor:v1:36e185d4-2cf0-4071-b840-513eaa1efc15' as any,fvttVersion:'14.368',systemVersion:'5.3.3'};
  const analysis=analyzeBrowserActorIntakeDraft(input,ir,provider);
  const generated=await generateBrowserActorIntakeCandidate(input,analysis,provider);
  expect(generated.candidateAvailable).toBe(true);
  const actor=(generated.candidateResponse as any)?.result?.artifact;
  expect(actor).toBeDefined();return{analysis,generated,actor,manifest:actor.flags?.[RESOLVER_MODULE_ID]?.spellManifest};
}

function refs(manifest:any):any[]{return manifest.spellcastingGroups.flatMap((group:any)=>group.spellRefs);}

test('preservation content: missing per-spell and restriction evidence preserves every spell through the real Actor planner and Cast builder',async()=>{
  const ir=JSON.parse(frozen.content);
  for(const group of ir.creature.spellcasting)for(const usage of group.usageGroups)for(const ref of usage.spellRefs){ref.evidence=[];ref.restrictions.push({kind:'other',text:'A retained literal restriction.',evidence:[]});}
  const before=structuredClone(ir),{manifest,actor}=await generate(ir);
  expect(refs(manifest).map(ref=>ref.originalName)).toEqual(['Alarm','Blur','Invisibility','Mirror Image','Mage Hand']);
  expect(validatePortableSpellManifestStructure(manifest).ok).toBe(false);
  expect(validateActorSpellManifestStructure(manifest).ok).toBe(true);
  const candidates:SpellCandidateMetadata[]=refs(manifest).map((ref,index)=>({id:String(index+1).padStart(16,'0'),uuid:'Compendium.dnd-players-handbook.spells.Item.'+String(index+1).padStart(16,'0'),packageId:'dnd-players-handbook',packId:'spells',name:ref.originalName,identifier:ref.identifier,rules:'2024',sourceBook:'PHB',level:1,school:'abj'}));
  const planned=planSpellHydration({manifest,candidates,sourceInventoryHash:hashSourceInventoryMetadata(candidates)});
  expect(planned.status).toBe('ready');if(planned.status!=='ready')throw Error(JSON.stringify(planned.findings));
  expect(planned.plan.selections).toHaveLength(5);
  for(const group of manifest.spellcastingGroups)for(const ref of group.spellRefs){
    const selected=planned.plan.selections.find(selection=>selection.groupId===group.groupId&&selection.refId===ref.refId)!;
    const result=buildCastActivitySource({manifestId:manifest.manifestId,group,ref,selectedUuid:selected.uuid,featureId:'Feature000000001'});
    expect(result.activity.type).toBe('cast');expect(result.activity.spell.ability).toBe('int');
    expect(result.activity.description?.chatFlavor).toContain('A retained literal restriction.');
  }
  expect(actor.system.details.biography.value).toContain('来源引文记录未提供');
  expect(ir).toEqual(before);
});

test('preservation content: missing casting ability retains refs and uses without choosing a replacement ability',async()=>{
  const ir=JSON.parse(frozen.content);for(const group of ir.creature.spellcasting)delete group.ability;
  const {manifest}=await generate(ir);
  expect(refs(manifest)).toHaveLength(5);
  expect(manifest.spellcastingGroups.every((group:any)=>group.ability===undefined)).toBe(true);
  expect(refs(manifest).filter(ref=>ref.uses?.shared).map(ref=>ref.uses.value)).toEqual([1,1,2,2]);
  const group=manifest.spellcastingGroups[0],ref=group.spellRefs[0];
  const cast=buildCastActivitySource({manifestId:manifest.manifestId,group,ref,selectedUuid:'Compendium.dnd-players-handbook.spells.Item.0000000000000001',featureId:'Feature000000001'}).activity;
  expect(cast.spell.ability).toBeUndefined();
});

test('preservation content: duplicate spell and group technical IDs are rebuilt before rendering without dropping refs',async()=>{
  const ir=JSON.parse(frozen.content);
  for(const group of ir.creature.spellcasting){group.groupId='same';for(const usage of group.usageGroups)for(const ref of usage.spellRefs)ref.refId='same';}
  const {manifest}=await generate(ir);
  expect(manifest.spellcastingGroups).toHaveLength(3);expect(refs(manifest)).toHaveLength(5);
  const ids=[manifest.manifestId,...manifest.spellcastingGroups.map((group:any)=>group.groupId),...refs(manifest).map(ref=>ref.refId)];
  expect(new Set(ids).size).toBe(ids.length);
});

test('preservation content: canonical YAML recovers malformed evidence and duplicate ref IDs without altering strict portable validation',async()=>{
  const normalized=normalizeMonsterIntakeProposal(frozen.source,JSON.parse(frozen.content));
  const document=yaml.load(renderMonsterIntakeMarkdown(normalized,frozen.source).slice(4,-4)) as any;
  const group=document.法术清单.spellcastingGroups[0];
  group.spellRefs[0].evidence=[{start:0,end:9,quote:'wrong'}];group.spellRefs[1].refId=group.spellRefs[0].refId;
  const source='---\n'+yaml.dump(document,{lineWidth:-1,noRefs:true})+'---\n';
  const parsed=new ParserFactory().parse(source);
  expect(parsed.spellManifest?.spellcastingGroups.flatMap(group=>group.spellRefs)).toHaveLength(5);
  const repaired=parsed.spellManifest!.spellcastingGroups[0]!;
  expect(repaired.spellRefs[0]!.evidence).toEqual([]);expect(repaired.spellRefs[0]!.refId).not.toBe(repaired.spellRefs[1]!.refId);
  expect(parsed.biographyPresentation?.sourceText).toBe(document.传记.slice(0,document['intake-biography-presentation'].sourceLength));
  expect(parsed.biographyPresentation?.programNotes.join('\n')).toContain('来源引文');
});

for(const mode of ['gm-manual','bad-mode',undefined])test('preservation content: explicit operations survive execution mode '+String(mode),async()=>{
  const ir=JSON.parse(frozen.content),feature=ir.creature.actions.find((entry:any)=>entry.name==='Prismatic Gaze');
  feature.executionMode=mode;
  const {analysis,actor}=await generate(ir),gaze=actor.items.find((item:any)=>item.name==='Prismatic Gaze');
  expect(analysis.ir!.creature.actions.find((entry:any)=>entry.name==='Prismatic Gaze')!.sourceOperations).toHaveLength(1);
  expect(analysis.ir!.creature.actions.find((entry:any)=>entry.name==='Prismatic Gaze')!.description).toBe(feature.description);
  const saves=Object.values(gaze.system.activities).filter((activity:any)=>activity.type==='save') as any[];
  expect(saves.length).toBeGreaterThan(0);expect(saves[0]!.save.dc.formula).toBe('16');
  expect(saves[0]!.damage.parts).toHaveLength(1);
});

for(const id of [undefined,'explicit-pool','shared_pool'])test('preservation content: shared resource identity '+String(id)+' keeps one pool and consumes only main activities',async()=>{
  const ir=JSON.parse(frozen.content);ir.creature.sourceResourcePools[0].id=id;
  const {actor}=await generate(ir),pulse=actor.items.find((item:any)=>item.name==='Force Pulse'),mark=actor.items.find((item:any)=>item.name==='Soul Mark');
  expect(pulse.system.uses).toEqual({spent:0,max:'3',recovery:[{period:'day',type:'recoverAll'}]});
  const pulseActivity=Object.values(pulse.system.activities)[0] as any;
  const attack=Object.values(mark.system.activities).find((activity:any)=>activity.type==='attack') as any;
  const save=Object.values(mark.system.activities).find((activity:any)=>activity.type==='save') as any;
  expect(pulseActivity.consumption.targets).toHaveLength(1);expect(attack.consumption.targets).toHaveLength(1);
  expect(pulseActivity.consumption.targets[0].target).toBe(pulse._id);expect(attack.consumption.targets[0].target).toBe(pulse._id);
  expect(save.consumption.targets).toEqual([]);expect(mark.system.uses?.max).toBeUndefined();
  expect(actor.flags.fvttJsonGenerator?.candidateReview?.findings?.some((finding:any)=>finding.message.includes('exactly one source Activity'))??false).toBe(false);
});

test('preservation content: bad member technical identities are reassigned consistently to resource members and feature carriers',async()=>{
  const ir=JSON.parse(frozen.content);for(const member of ir.creature.sourceResourcePools[0].members)member.featureId='bad_identity';
  const {analysis,actor}=await generate(ir),pool=analysis.ir!.creature.sourceResourcePools![0]!;
  expect(new Set(pool.members.map(member=>member.featureId)).size).toBe(2);
  expect(pool.members.every(member=>/^[a-z0-9][a-z0-9-]*$/u.test(member.featureId!))).toBe(true);
  expect(actor.items.find((item:any)=>item.name==='Soul Mark').system.activities).toBeDefined();
  const mark=actor.items.find((item:any)=>item.name==='Soul Mark'),attack=Object.values(mark.system.activities).find((activity:any)=>activity.type==='attack') as any;
  expect(attack.consumption.targets).toHaveLength(1);
});

test('preservation content: canonical resource technical IDs are rebound without deleting their existing member links',()=>{
  const normalized=normalizeMonsterIntakeProposal(frozen.source,JSON.parse(frozen.content));
  const document=yaml.load(renderMonsterIntakeMarkdown(normalized,frozen.source).slice(4,-4)) as any;
  const records=document.资源机制,original=records.资源[0].ID;records.资源[0].ID='canonical_pool';
  for(const binding of records.消费)if(binding.资源===original){binding.资源='canonical_pool';binding.ID='binding_'+binding.ID;}
  const source='---\n'+yaml.dump(document,{lineWidth:-1,noRefs:true})+'---\n';
  const parsed=new ParserFactory().parse(source),semantics=parsed.resourceSemantics!;
  expect(semantics.resources).toHaveLength(1);expect(semantics.bindings).toHaveLength(2);
  expect(semantics.bindings.map(binding=>binding.resourceId)).toEqual([semantics.resources[0]!.id,semantics.resources[0]!.id]);
  expect(semantics.resources[0]!.max).toBe(3);expect(semantics.resources[0]!.recovery).toBe('day');
});

test('preservation content: a malformed component-waiver entry preserves every spell, good waiver and source record',async()=>{
  const ir=JSON.parse(frozen.content),group=ir.creature.spellcasting[0];
  const validWaivers=structuredClone(group.componentWaivers);
  group.componentWaivers.unshift(null);const {analysis,manifest,actor}=await generate(ir);
  expect(refs(manifest)).toHaveLength(5);
  expect(analysis.ir!.creature.spellcasting![0]!.componentWaivers).toEqual(validWaivers);
  expect(JSON.stringify(analysis.ir!.creature.candidateReview?.proposal)).toContain('componentWaivers');
  expect(actor.items.find((item:any)=>item.name==='Force Pulse').system.uses.max).toBe('3');
});

test('preservation content: ambiguous duplicate canonical resource identities retain both pools without assigning consumers to the first pool',()=>{
  const normalized=normalizeMonsterIntakeProposal(frozen.source,JSON.parse(frozen.content));
  const document=yaml.load(renderMonsterIntakeMarkdown(normalized,frozen.source).slice(4,-4)) as any,records=document.资源机制;
  records.资源.push(structuredClone(records.资源[0]));
  const source='---\n'+yaml.dump(document,{lineWidth:-1,noRefs:true})+'---\n',parsed=new ParserFactory().parse(source);
  expect(parsed.resourceSemantics!.resources).toHaveLength(2);
  expect(parsed.resourceSemantics!.bindings).toEqual([]);
  expect(parsed.candidateReview!.findings.some(finding=>finding.message.includes('不选择任意一个资源'))).toBe(true);
});

test('preservation content: unrelated non-spell creature and pure manual feature retain their mechanical boundary',async()=>{
  const ir=buildValidLurkerIr();ir.creature.traits[0]!.executionMode='gm-manual';
  const {actor,manifest}=await generate(ir,LURKER_SOURCE);
  expect(manifest).toBeUndefined();expect(actor.system.attributes.hp.value).toBe(65);
  const manual=actor.items.find((item:any)=>item.name.includes('Nightmarish Contortion'));
  expect(Object.values(manual.system.activities).map((activity:any)=>activity.type)).toEqual(['utility']);
  expect(actor.items.find((item:any)=>item.name.includes('Claw')).system.activities).toBeDefined();
});

test('preservation content: the Actor manifest entry still rejects world identifiers and invalid mechanics',()=>{
  const normalized=normalizeMonsterIntakeProposal(frozen.source,JSON.parse(frozen.content));
  const document=yaml.load(renderMonsterIntakeMarkdown(normalized,frozen.source).slice(4,-4)) as any,manifest=document.法术清单;
  manifest.spellcastingGroups[0].spellRefs[0].evidence=[];
  manifest.spellcastingGroups[0].spellRefs[0].identifier='Actor.1234567890abcdef.Item.1234567890abcdef';
  expect(validateActorSpellManifestStructure(manifest).ok).toBe(false);
  const invalid=structuredClone(document.法术清单);invalid.spellcastingGroups[0].spellRefs[0].uses.value=-1;
  expect(validateActorSpellManifestStructure(invalid).ok).toBe(false);
});

test('preservation content: Actor evidence tolerance keeps safe array shape and preserves explicit source reuse',()=>{
  const normalized=normalizeMonsterIntakeProposal(frozen.source,JSON.parse(frozen.content));
  const document=yaml.load(renderMonsterIntakeMarkdown(normalized,frozen.source).slice(4,-4)) as any,manifest=document.法术清单;
  const first=manifest.spellcastingGroups.at(-1),ref=first.spellRefs[0];ref.evidence=[];
  const second=structuredClone(first);second.groupId='reused-group';second.featureItemKey='reused-feature';
  second.spellRefs[0].refId='reused-ref';second.spellRefs[0].reuseOf={groupId:first.groupId,refId:ref.refId};manifest.spellcastingGroups.push(second);
  expect(validateActorSpellManifestStructure(manifest).ok).toBe(true);
  expect(validatePortableSpellManifestStructure(manifest).ok).toBe(false);
  const malformed=structuredClone(manifest);malformed.spellcastingGroups[0].spellRefs[0].evidence=null;
  expect(validateActorSpellManifestStructure(malformed).ok).toBe(false);
});

const dustRoot=process.env.FORGE_PRESERVATION_DUST_ROOT;
for(const location of ['group','ref','restriction'] as const)test.skipIf(!dustRoot)('preservation content frozen Dust: malformed '+location+' evidence member retains Sleep through the public Actor chain',async()=>{
  const saved=JSON.parse(readFileSync(join(dustRoot!,'analysis.json'),'utf8')),
    ir=structuredClone(saved.ir),source=saved.rawSource??saved.candidate.quote,
    group=ir.creature.spellcasting[0],ref=group.usageGroups[0].spellRefs[0];
  if(location==='group')group.evidence=[null];
  else if(location==='ref')ref.evidence=[null];
  else ref.restrictions[0].evidence=[null];
  const original=structuredClone(ir),{analysis,manifest,actor}=await generate(ir,source);
  expect(refs(manifest).map(ref=>ref.englishName)).toEqual(['Sleep']);
  expect(refs(manifest)[0].uses).toEqual({value:1,recovery:'day',shared:false});
  const retained=analysis.ir!.creature.spellcasting![0]!,retainedRef=retained.usageGroups[0]!.spellRefs[0]!;
  expect(location==='group'?retained.evidence:location==='ref'?retainedRef.evidence:retainedRef.restrictions[0]!.evidence).toEqual([]);
  expect(JSON.stringify(analysis.ir!.creature.candidateReview?.proposal)).toContain('null');
  expect(actor.items).toHaveLength(4);expect(ir).toEqual(original);
});

for(const location of ['ref','restriction'] as const)test.skipIf(!dustRoot)('preservation content frozen Dust: canonical '+location+' evidence shape preserves the same portable spell',async()=>{
  const saved=JSON.parse(readFileSync(join(dustRoot!,'analysis.json'),'utf8')),source=saved.rawSource??saved.candidate.quote;
  const normalized=normalizeMonsterIntakeProposal(source,saved.ir),document=yaml.load(renderMonsterIntakeMarkdown(normalized,source).slice(4,-4)) as any;
  const ref=document.法术清单.spellcastingGroups[0].spellRefs[0];
  if(location==='ref')ref.evidence=[null];else ref.restrictions[0].evidence=[null];
  const canonical='---\n'+yaml.dump(document,{lineWidth:-1,noRefs:true})+'---\n',parsed=new ParserFactory().parse(canonical);
  expect(refs(parsed.spellManifest)).toHaveLength(1);
  const response=await convertFinalActorSource(buildForgeActorRequest({content:canonical,sourceId:'actor:v1:36e185d4-2cf0-4071-b840-513eaa1efc15' as any,displayName:'Dust evidence shape',requestId:'canonical-evidence-shape',fvttVersion:'14.368',systemVersion:'5.3.3'}));
  expect('result'in response).toBe(true);if(!('result'in response))throw Error(JSON.stringify(response));
  const actor=response.result.artifact as any,manifest=actor.flags[RESOLVER_MODULE_ID].spellManifest;
  expect(refs(manifest).map(ref=>ref.englishName)).toEqual(['Sleep']);
  expect(location==='ref'?refs(manifest)[0].evidence:refs(manifest)[0].restrictions[0].evidence).toEqual([]);
  expect(JSON.stringify(parsed.candidateReview)).toContain('null');
});

import {afterAll, beforeAll, expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {buildForgeActorRequest, convertFinalActorSource} from '@fvtt-json-generator/forge-browser-runtime';
import {decodeForgeEncounterPackageText, encounterPackageFindings, serializeForgeEncounterPackage} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {fixedEncounterCommand} from '@fvtt-json-generator/intake-ai/encounter-capabilities';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {hashArtifact, hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {buildValidLurkerIr} from '../src/core/intake/__tests__/fixtures/lurker';
import {createForgeEncounterApplicationClass} from '../foundry-modules/fvtt-json-forge/src/encounterApplication';
import {importForgeEncounter, startForgeEncounterMacro} from '../foundry-modules/fvtt-json-forge/src/encounterRuntime';
import {actorReadbackWarnings,createAcceptedForgeActor} from '../foundry-modules/fvtt-json-forge/src/runtime';
import {decodeForgeActorResponse} from '@fvtt-json-generator/forge-gateway-protocol';
import Handlebars from 'handlebars';
import {JSDOM} from 'jsdom';
import {normalizeMonsterIntakeProposal} from '@fvtt-json-generator/intake-ai/provider';

let response:any;
let source:string;
let timedArtifact:any;
let resourceArtifact:any;
const previousFetch=globalThis.fetch;
let networkAttempts=0;
globalThis.fetch = Object.assign((async()=>{networkAttempts++;throw Error('Preservation delivery tests forbid network/model requests.');}), {preconnect: () => { throw Error('Frozen tests forbid network preconnect.'); }});
beforeAll(async()=>{
  source=renderMonsterIntakeMarkdown(buildValidLurkerIr());
  response=await convertFinalActorSource(buildForgeActorRequest({displayName:'Preservation delivery',content:source,requestId:'preservation-delivery',fvttVersion:'14.364',systemVersion:'5.3.3'}));
  expect(response.result?.artifact).toBeDefined();
  const timed=buildValidLurkerIr();
  timed.creature.actions[1]!.description='Melee Attack Roll: +6, reach 10 ft. Hit: 9 (1d10+4) Slashing damage. The target has the Poisoned condition for 2 rounds.';
  timed.creature.actions[1]!.appliedConditions=[{statuses:['poisoned'],duration:'2 rounds'}];
  const generated=await convertFinalActorSource(buildForgeActorRequest({displayName:'Preservation delivery',content:renderMonsterIntakeMarkdown(timed),requestId:'preservation-lifecycle-control',fvttVersion:'14.364',systemVersion:'5.3.3'}));
  expect('result'in generated).toBe(true);timedArtifact=(generated as any).result.artifact;
  const ordinary=JSON.parse(readFileSync('tests/fixtures/forge-ordinary-protocol-failures.json','utf8')).ordinary;
  const normalized=normalizeMonsterIntakeProposal(ordinary.source,JSON.parse(ordinary.content),ordinary.candidate);
  const resource=await convertFinalActorSource(buildForgeActorRequest({displayName:'Preservation delivery',content:renderMonsterIntakeMarkdown(normalized,ordinary.source),requestId:'preservation-readback-range',fvttVersion:'14.364',systemVersion:'5.3.3'}));
  expect('result'in resource).toBe(true);resourceArtifact=(resource as any).result.artifact;
});
afterAll(()=>{globalThis.fetch=previousFetch;expect(networkAttempts).toBe(0);});

function bundle():any{
  const command='void forgeEncounter.actors.main;';
  return{schema:'fvtt-json-forge-encounter',version:1,id:'preservation-delivery',label:'Preservation delivery fixture',
    target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'},primaryActorKey:'main',
    actors:['main','summon'].map(key=>({key,label:key,source,sourceHash:hashSource(source),artifact:structuredClone(response.result.artifact),artifactHash:hashArtifact(response.result.artifact)})),
    macros:[{key:'control',name:'Inert reviewed control',command,commandHash:hashSource(command),bindings:{main:'main',summon:'summon'},covers:[],notes:'Contract fixture only.'}],assets:[]};
}
function runtime(){
  let executions=0;
  const collection=(kind:string)=>{
    const documents=new Map<string,any>();
    const api:any={get:(id:string)=>documents.get(id),get contents(){return[...documents.values()];},createCount:0,
      documentClass:{async create(data:any){
        api.createCount++;
        const document:any={id:data._id,uuid:`${kind}.${data._id}`,name:data.name,data:structuredClone(data),
          toObject(){return structuredClone(this.data);},async update(changes:Record<string,unknown>){for(const[path,value]of Object.entries(changes)){const parts=path.split('.');let owner=this.data;for(const part of parts.slice(0,-1))owner=owner[part]??={};owner[parts.at(-1)!]=value;}return this;},
          async delete(){documents.delete(this.id);return this;},async execute(){executions++;}};
        documents.set(document.id,document);return document;
      }}};
    return api;
  };
  const game:any={version:'14.364',system:{id:'dnd5e',version:'5.3.3'},world:{id:'preservation-fixture'},user:{id:'gm',isGM:true},actors:collection('Actor'),macros:collection('Macro')};
  return{game,get executions(){return executions;},assets:{async ensure(){throw Error('No fixture asset upload expected.');}}};
}
function appFor(game:any,prepared:any):any{
  class Base{element:any={querySelector:()=>null,querySelectorAll:()=>[]};render(){return this;}async close(){return this;}}
  const App=createForgeEncounterApplicationClass({game,foundry:{applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}},
    getAiOptions:()=>{throw Error('No model options permitted.');},getRecoverySecrets:()=>({apiKey:'',baseUrl:''}),
    recoveryStore:{load:async()=>undefined,save:async()=>{},clear:async()=>{}}});
  const app:any=new App();app.prepared=prepared;app.reviewed=true;return app;
}

test('preservation F09: invalid member metadata preserves exact artifacts and a stable recoverable record',async()=>{
  const raw=bundle(),hashes=raw.actors.map((actor:any)=>hashArtifact(actor.artifact));
  raw.actors[1].key='';raw.actors[1].label=null;raw.actors[1].sourceHash='original-bad-hash';
  const decoded=decodeForgeEncounterPackageText(JSON.stringify(raw));
  expect(decoded.actors).toHaveLength(2);
  expect(decoded.actors.map(actor=>hashArtifact(actor.artifact!))).toEqual(hashes);
  expect(decoded.actors[1]!.key).toMatch(/^actor-2-/u);
  expect(decoded.actors[1]!.label).toBe(response.result.artifact.name);
  expect(decoded.actors[1]!.reviewFindings?.join('\n')).toContain('原始值：""');
  expect(decoded.actors[1]!.reviewFindings?.join('\n')).toContain('原始值：null');
  expect(decoded.actors[1]!.reviewFindings?.join('\n')).toContain('原始值："original-bad-hash"');
  const restored=decodeForgeEncounterPackageText(serializeForgeEncounterPackage(decoded));
  expect(restored).toEqual(decoded);
  const prepared=await prepareForgeEncounter(JSON.stringify(raw));
  expect(prepared.actors.map(actor=>hashArtifact(actor.artifact))).toEqual(hashes);
});

test('preservation F09: unreadable members remain traceable while complete members continue',async()=>{
  const raw=bundle();raw.actors[1]=null;
  const decoded=decodeForgeEncounterPackageText(JSON.stringify(raw));
  expect(decoded.actors).toHaveLength(2);
  expect(decoded.actors[1]!.reviewFindings?.join('\n')).toContain('原始成员记录：null');
  expect(decodeForgeEncounterPackageText(serializeForgeEncounterPackage(decoded))).toEqual(decoded);
  const prepared=await prepareForgeEncounter(JSON.stringify(raw));
  expect(prepared.actors).toHaveLength(1);
  expect(prepared.actors[0]!.artifactHash).toBe(hashArtifact(raw.actors[0].artifact));
  expect(prepared.reviewFindings?.join('\n')).toContain('null');
  expect(prepared.macros).toHaveLength(0);
  const env=runtime(),app=appFor(env.game,prepared);
  await app.apply();
  expect(env.game.actors.createCount).toBe(1);
  expect(app.result.documents.filter((document:any)=>document.kind==='Actor')).toHaveLength(1);
  expect(app.result.failures).toEqual([expect.objectContaining({key:decoded.actors[1]!.key,kind:'Actor',message:expect.stringContaining('尚未完成')})]);
  expect(app.status).toContain('1 个成功角色');expect(app.status).toContain('未完成');
});

test('preservation F09: an invalid saved artifact retains its original value and recovers through its complete source',async()=>{
  const raw=bundle();raw.actors[1].artifact=['unreadable saved artifact'];
  const prepared=await prepareForgeEncounter(JSON.stringify(raw));
  expect(prepared.actors).toHaveLength(2);
  expect(prepared.bundle.actors[1]!.reviewFindings?.join('\n')).toContain('["unreadable saved artifact"]');
  expect(prepared.actors[1]!.artifact.items).toHaveLength(response.result.artifact.items.length);
  expect(prepared.actors[0]!.artifactHash).toBe(hashArtifact(raw.actors[0].artifact));
});

test('preservation F09: duplicate original keys never bind companion records to an arbitrary member',()=>{
  const raw=bundle();raw.actors[1].key='main';
  raw.macros[0].bindings={main:'main'};
  const decoded=decodeForgeEncounterPackageText(JSON.stringify(raw));
  expect(decoded.actors).toHaveLength(2);
  expect(new Set(decoded.actors.map(actor=>actor.key)).size).toBe(2);
  expect(decoded.macros).toHaveLength(0);
  expect(encounterPackageFindings(decoded).join('\n')).toContain('归属不明确');
});

for(const [name,breakArtifact] of [
  ['missing system',(actor:any)=>({name:'bad',type:'npc'})],
  ['non-array Items',(actor:any)=>({...actor,items:{saved:'unreadable ability list'}})],
  ['null Item',(actor:any)=>({...actor,items:[null,...actor.items]})],
] as const)test(`preservation F09 display: ${name} only limits its own card and retains exact JSON`,async()=>{
  const raw=bundle(),broken=breakArtifact(structuredClone(response.result.artifact));
  raw.actors[1].artifact=broken;raw.actors[1].artifactHash=hashArtifact(broken);
  const prepared=await prepareForgeEncounter(JSON.stringify(raw));
  expect(prepared.actors).toHaveLength(2);
  const before=JSON.stringify(prepared.actors[1]!.artifact),app=appFor(runtime().game,prepared);
  const context=await app._prepareContext();
  expect(context.actors).toHaveLength(2);
  const normal=context.actors.find((actor:any)=>actor.key==='main'),partial=context.actors.find((actor:any)=>actor.key==='summon');
  expect(normal.hp).toBe(response.result.artifact.system.attributes.hp.max);
  expect(normal.ac).toBe(response.result.artifact.system.attributes.ac.flat);
  expect(normal.cr).toBe(response.result.artifact.system.details.cr);
  expect(normal.abilities.map((item:any)=>item.name)).toEqual(response.result.artifact.items.map((item:any)=>item.name));
  expect(normal.previewIssues).toEqual([]);
  expect(partial.previewIssues.length).toBeGreaterThan(0);
  if(name==='missing system'){expect(partial.hp).toBe('未提供');expect(partial.ac).toBe('未提供');expect(partial.cr).toBe('未提供');}
  expect(JSON.parse(partial.artifact)).toEqual(broken);
  const html=Handlebars.compile(readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-encounter.hbs','utf8'))(context),dom=new JSDOM(html);
  const normalButton=dom.window.document.querySelector('[data-export-actor="main"]'),partialButton=dom.window.document.querySelector('[data-export-actor="summon"]');
  expect(normalButton).not.toBeNull();expect(partialButton).not.toBeNull();
  const partialCard=partialButton!.closest('details')!;
  expect(partialCard.textContent).toContain('原始 Actor JSON 仍可查看和下载');
  expect([...partialCard.querySelectorAll('pre code')].at(-1)!.textContent).toBe(JSON.stringify(broken,null,2));
  expect(JSON.stringify(prepared.actors[1]!.artifact)).toBe(before);
});

test('preservation F09 display: complete cards and their source and export controls remain intact',async()=>{
  const raw=bundle(),prepared=await prepareForgeEncounter(JSON.stringify(raw)),app=appFor(runtime().game,prepared);
  const context=await app._prepareContext();
  expect(context.actors).toHaveLength(2);
  for(const card of context.actors){expect(card.previewIssues).toEqual([]);expect(card.source).toBe(source);expect(card.artifact).toBe(JSON.stringify(response.result.artifact,null,2));expect(card.abilities).toHaveLength(response.result.artifact.items.length);}
});

test('preservation F10: malformed fixed macros fail individually through the real App import and never execute',async()=>{
  const raw=bundle();
  raw.macros[0].command=fixedEncounterCommand({version:1,rules:[],legendaryRecovery:[]}).replace('"version":1','"version":2');
  raw.macros[0].commandHash=hashSource(raw.macros[0].command);
  const prepared=await prepareForgeEncounter(JSON.stringify(raw));
  expect(prepared.actors).toHaveLength(2);expect(prepared.macros).toHaveLength(1);
  const env=runtime(),app=appFor(env.game,prepared);
  expect(await app._prepareContext()).toBeDefined();
  await app.apply();
  expect(env.game.actors.createCount).toBe(2);expect(env.game.macros.createCount).toBe(0);
  expect(app.result.documents.filter((document:any)=>document.kind==='Actor')).toHaveLength(2);
  expect(app.result.failures).toEqual([expect.objectContaining({key:'control',kind:'Macro',message:expect.stringContaining('Unsupported automation')})]);
  expect(app.error).toContain('Unsupported automation');expect(env.executions).toBe(0);
});

test('preservation F10: a previously stored malformed fixed configuration is rejected before macro execute',async()=>{
  const raw=bundle();raw.macros[0].command=fixedEncounterCommand({version:1,rules:[],legendaryRecovery:[]});raw.macros[0].commandHash=hashSource(raw.macros[0].command);
  const env=runtime(),prepared=await prepareForgeEncounter(JSON.stringify(raw));
  const imported=await importForgeEncounter({...env,prepared,reviewed:true});
  const macro=env.game.macros.get(imported.documents.find(row=>row.kind==='Macro')!.id);
  macro.data.command=macro.data.command.replace('"version":1','"version":2');
  macro.data.flags['fvtt-json-forge'].encounter.commandHash=hashSource(macro.data.command);
  await expect(startForgeEncounterMacro(env.game,macro.id)).rejects.toThrow('Unsupported automation');
  expect(env.executions).toBe(0);expect(env.game.actors.contents).toHaveLength(2);
});

test('preservation D01: source resources, immunities, resistance and movement losses each produce a concrete warning',()=>{
  const actor=response.result.artifact;
  for(const path of [['system','resources'],['system','traits','di'],['system','traits','dr'],['system','traits','ci'],['system','attributes','movement']]){
    const changed=structuredClone(actor);let owner=changed;for(const key of path.slice(0,-1))owner=owner[key];delete owner[path.at(-1)!];
    const warnings=actorReadbackWarnings(actor,changed);
    expect(warnings.length).toBeGreaterThan(0);expect(warnings.join('\n')).toContain(path.at(-1)==='di'?'damageImmunity':path.at(-1)==='dr'?'damageResistance':path.at(-1)==='ci'?'conditionImmunity':path.at(-1)!);
  }
});

test('preservation D01: Item rule text and Effect duration, disabled state and lifecycle remain in readback comparison',()=>{
  const sourceItem=timedArtifact.items.find((item:any)=>item.effects?.some((effect:any)=>effect.statuses?.includes('poisoned')));
  expect(sourceItem).toBeDefined();
  expect(sourceItem.effects.find((effect:any)=>effect.statuses.includes('poisoned')).duration.rounds).toBe(2);
  for(const field of ['description','duration','disabled','conditionLifecycle']){
    const changed=structuredClone(timedArtifact),item=changed.items.find((entry:any)=>entry.name===sourceItem.name),effect=item.effects.find((entry:any)=>entry.statuses.includes('poisoned'));
    if(field==='description')item.system.description.value='<p>Lost source rule.</p>';
    else if(field==='disabled')effect.disabled=true;
    else if(field==='conditionLifecycle')delete effect.flags.fvttJsonGenerator.conditionLifecycle;
    else delete effect.duration;
    expect(actorReadbackWarnings(timedArtifact,changed).join('\n')).toContain(field);
  }
});

test('preservation D01: native defaults, numeric FormulaFields, unordered sets and duration start markers are equivalent',()=>{
  const actual=structuredClone(timedArtifact);
  actual.system.attributes.movement.walk=String(actual.system.attributes.movement.walk);
  actual.system.traits.ci.value=new Set([...actual.system.traits.ci.value].reverse());
  actual.system.traits.languages.communication={};
  for(const item of actual.items)for(const effect of item.effects??[]){effect.statuses=new Set([...effect.statuses].reverse());effect.duration={...effect.duration,startTime:3456,startRound:6,startTurn:2};}
  expect(actorReadbackWarnings(timedArtifact,actual)).toEqual([]);
});

test('preservation D01 range: inherited Activity payload is inactive while Item and overridden range drift remain visible',()=>{
  const actor=resourceArtifact,item=actor.items.find((entry:any)=>entry.name==='Soul Mark'),activity=Object.values(item.system.activities).find((entry:any)=>entry.type==='attack') as any;
  expect(item.system.range.value).toBe(5);expect(activity.range).toMatchObject({override:false,reach:5});
  const cleaned=structuredClone(actor),cleanedItem=cleaned.items.find((entry:any)=>entry.name===item.name);
  cleanedItem.system.activities[activity._id].range={override:false,units:'ft',special:''};
  expect(actorReadbackWarnings(actor,cleaned)).toEqual([]);
  const missingParent=structuredClone(cleaned);delete missingParent.items.find((entry:any)=>entry.name===item.name).system.range.value;
  expect(actorReadbackWarnings(actor,missingParent).join('\n')).toContain('距离');
  const changedParent=structuredClone(cleaned);changedParent.items.find((entry:any)=>entry.name===item.name).system.range.value=30;
  expect(actorReadbackWarnings(actor,changedParent).join('\n')).toContain('距离');
  const overridden=structuredClone(actor);overridden.items.find((entry:any)=>entry.name===item.name).system.activities[activity._id].range={override:true,value:5,units:'ft',special:''};
  const changedOverride=structuredClone(overridden);changedOverride.items.find((entry:any)=>entry.name===item.name).system.activities[activity._id].range.value=50;
  expect(actorReadbackWarnings(overridden,changedOverride).join('\n')).toContain('距离');
});

test('preservation D01 HTML: native entity serialization is equivalent without changing text nodes, words or links',()=>{
  const actor=structuredClone(resourceArtifact),index=actor.items.findIndex((entry:any)=>entry.name==='Prismatic Gaze');
  expect(actor.items[index].system.description.value).toContain('target&#39;s');
  const native=structuredClone(actor);native.items[index].system.description.value=native.items[index].system.description.value.replaceAll('&#39;',"'");
  const originalArtifact=JSON.stringify(actor),originalReadback=JSON.stringify(native);
  expect(actorReadbackWarnings(actor,native)).toEqual([]);
  expect(JSON.stringify(actor)).toBe(originalArtifact);expect(JSON.stringify(native)).toBe(originalReadback);
  for(const field of ['value','chat']){
    const expected=structuredClone(actor),actual=structuredClone(actor);
    expected.items[index].system.description[field]='<p>target&#39;s rule</p>';actual.items[index].system.description[field]="<p>target's rule</p>";
    expect(actorReadbackWarnings(expected,actual)).toEqual([]);
    for(const [expectedHtml,actualHtml]of[
    ['<p>literal &lt;span&gt;word&lt;/span&gt;</p>','<p>literal <span>word</span></p>'],
    ['<p>literal &amp;lt;span&amp;gt;</p>','<p>literal &lt;span&gt;</p>'],
    ['<p>retained word</p>','<p>changed word</p>'],
    ['<p><a href="/rules/original">rule</a></p>','<p><a href="/rules/other">rule</a></p>'],
    ]){
      expected.items[index].system.description[field]=expectedHtml;actual.items[index].system.description[field]=actualHtml;
      expect(actorReadbackWarnings(expected,actual).join('\n')).toContain('description');
    }
  }
  const sourceExpected=structuredClone(actor),sourceActual=structuredClone(actor);
  sourceExpected.items[index].flags.fvttJsonGenerator.manualRule={sourceText:'target&#39;s rule'};
  sourceActual.items[index].flags.fvttJsonGenerator.manualRule={sourceText:"target's rule"};
  expect(actorReadbackWarnings(sourceExpected,sourceActual).join('\n')).toContain('sourceRules');
});

test('preservation D02: invalid decoded source identity preserves candidate retrieval and never starts a world write',async()=>{
  for(const identity of [undefined,{sourceId:'bad',sourceHash:'bad'},{sourceId:response.result.sourceIdentity.sourceId,sourceHash:'not-a-hash'}]){
    const candidate=structuredClone(response);candidate.result.sourceIdentity=identity;
    const decoded=decodeForgeActorResponse(candidate);expect(decoded.ok).toBe(true);
    if(!decoded.ok||!('result'in decoded.value))throw Error('Expected preserved Actor response');
    expect(hashArtifact(decoded.value.result.artifact!)).toBe(hashArtifact(response.result.artifact));
    const env=runtime();
    await expect(createAcceptedForgeActor({game:env.game,response:decoded.value})).rejects.toThrow('source identity');
    expect(env.game.actors.createCount).toBe(0);
  }
});

test('preservation D02: valid needs-review and failed candidates still create their complete Actor',async()=>{
  for(const status of ['needs_review','failed']){
    const candidate=structuredClone(response);candidate.result.status=status;
    const before=structuredClone(candidate),env=runtime();
    const created=await createAcceptedForgeActor({game:env.game,response:candidate});
    expect(created.status).toBe('created');expect(env.game.actors.createCount).toBe(1);expect(candidate).toEqual(before);
  }
});

const frozenRoot=process.env.FORGE_PRESERVATION_FROZEN_ROOT;
if(frozenRoot)test('preservation F09/F10: the existing frozen two-Actor package retains both exact artifacts',async()=>{
  const path=join(frozenRoot,'forge-46-remediation/mirror-fixture/forge46-20261027-macrofail.json');
  const original=readFileSync(path,'utf8'),raw=JSON.parse(original),hashes=raw.actors.map((actor:any)=>hashArtifact(actor.artifact));
  raw.actors[1].key='';
  const prepared=await prepareForgeEncounter(JSON.stringify(raw));
  expect(prepared.actors.map(actor=>hashArtifact(actor.artifact))).toEqual(hashes);
  const broken=JSON.parse(original);
  broken.macros[0].command=broken.macros[0].command.replace('"version":1','"version":2');broken.macros[0].commandHash=hashSource(broken.macros[0].command);
  const env=runtime(),app=appFor(env.game,await prepareForgeEncounter(JSON.stringify(broken)));
  await app.apply();expect(env.game.actors.createCount).toBe(2);expect(env.game.macros.createCount).toBe(0);
  expect(app.result.failures.some((failure:any)=>failure.kind==='Macro')).toBe(true);
  expect(readFileSync(path,'utf8')).toBe(original);
});

if(frozenRoot)test('preservation D01: the frozen Dust and Unicorn missing fields are reported and the actual saved Dust remains equivalent',()=>{
  const latest=join(frozenRoot,'forge-four-mechanisms-20261028');
  const dust=JSON.parse(readFileSync(join(latest,'results/dust-mephit/actor.json'),'utf8'));
  const unicorn=JSON.parse(readFileSync(join(frozenRoot,'forge-46-remediation/frozen-verified/unicorn/actor.json'),'utf8'));
  expect(unicorn.system.resources.legact.max).toBe(3);expect(unicorn.system.resources.legres.max).toBe(3);
  const missingResources=structuredClone(unicorn);delete missingResources.system.resources;
  expect(actorReadbackWarnings(unicorn,missingResources).join('\n')).toContain('resources');
  for(const key of ['di','ci']){const changed=structuredClone(dust);delete changed.system.traits[key];expect(actorReadbackWarnings(dust,changed).length).toBeGreaterThan(0);}
  const missingManifest=structuredClone(dust);delete missingManifest.flags['fvtt-json-generator-spell-resolver'].spellManifest;
  expect(actorReadbackWarnings(dust,missingManifest).join('\n')).toContain('spellManifest');
  const saved=JSON.parse(readFileSync(join(latest,'chrome/post-refresh.json'),'utf8')).actors.find((actor:any)=>actor.name===dust.name);
  expect(saved).toBeDefined();expect(saved.items.length).toBe(dust.items.length+1);
  expect(actorReadbackWarnings(dust,saved)).toEqual([]);
});

const runtimeRoot=process.env.FORGE_PRESERVATION_RUNTIME_ROOT;
if(runtimeRoot)test('preservation D01 runtime: the exact saved resource Actor has no range or HTML representation warning',async()=>{
  const sourcePath=join(runtimeRoot,'mirror-fixture/resource-original.md'),snapshotPath=join(runtimeRoot,'chrome/post-refresh.json');
  const canonical=readFileSync(sourcePath,'utf8'),snapshot=readFileSync(snapshotPath,'utf8');
  const actual=JSON.parse(snapshot).actors.find((actor:any)=>actor._id==='4986d085322e00c6');expect(actual).toBeDefined();
  const generated=await convertFinalActorSource(buildForgeActorRequest({displayName:'Preservation delivery',content:canonical,requestId:'actual-resource-readback',fvttVersion:'14.368',systemVersion:'5.3.3'}));
  expect('result'in generated).toBe(true);
  expect(actorReadbackWarnings((generated as any).result.artifact,actual)).toEqual([]);
  expect(readFileSync(sourcePath,'utf8')).toBe(canonical);expect(readFileSync(snapshotPath,'utf8')).toBe(snapshot);
});

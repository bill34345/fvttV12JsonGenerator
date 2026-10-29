import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {hashArtifact,hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {compileEncounterSelection,buildEncounterMacroCommand} from '@fvtt-json-generator/intake-ai/encounter-automation';
import {serializeForgeEncounterPackage} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
const evidence=process.env.FORGE_46_EVIDENCE_ROOT??'H:/CodexData/visualizations/2026/10/27/01a17bee-ceb9-7eb3-8fce-a8320e15295f/forge-46-remediation';
const output=join(evidence,'mirror-fixture'),frozen=join(evidence,'frozen-pass-2');
const originals=new Map<string,string>();
const sha=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const read=(path:string)=>{const bytes=readFileSync(path);originals.set(path,sha(bytes));return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u,''));};
const actorKeys=['unicorn','mimic'] as const;
const readActorCase=(key:typeof actorKeys[number])=>({actor:read(join(frozen,key,'actor.json')),generation:read(join(frozen,key,'generation.json')),analysis:read(join(frozen,key,'analysis.json'))});
const data={unicorn:readActorCase('unicorn'),mimic:readActorCase('mimic')};
const captured=read('H:/CodexData/visualizations/2026/10/25/01a1720b-4563-7511-82df-e8cb00ed7e53/forge-review-disabled-next-batch/browser/first-answer-final-capture.json');
const rawSources={unicorn:captured.cases.find((entry:any)=>entry.id==='unicorn').capture.source,mimic:data.mimic.analysis.candidate.quote};
const request={source:rawSources.unicorn+'\n\n'+rawSources.mimic,actors:actorKeys.map(key=>({key,source:rawSources[key],ir:data[key].analysis.ir,artifact:data[key].actor}))};
const feature=data.unicorn.analysis.ir.creature.traits.find((entry:any)=>entry.name==='Magic Resistance');
if(!feature)throw Error('Expected the frozen Unicorn Magic Resistance feature');
const automation=compileEncounterSelection({version:2,name:'Forge46 GM manual control',notes:'This fixed control is prepared only for the authorized macro creation failure acceptance; never execute it.',
  manualSteps:[],legendaryRecovery:[],rules:[{id:'manual-unicorn',kind:'gm-manual',actorKey:'unicorn',featureName:feature.name,section:'trait',quote:feature.description,
    gmSteps:['GM reads the complete Magic Resistance source on the Unicorn.','GM applies the stated Advantage manually and decides the applicable spell or magical effect.'],parameters:{}}]},request);
const command=buildEncounterMacroCommand(automation);
const bundle={schema:'fvtt-json-forge-encounter' as const,version:1 as const,id:'forge46-20261027-macrofail',label:'Forge46 Unicorn and Mimic macro-failure acceptance',
  target:{foundry:'14.364' as const,system:'dnd5e' as const,systemVersion:'5.3.3' as const,effectProfile:'core' as const},primaryActorKey:'unicorn',
  actors:actorKeys.map(key=>({key,label:data[key].actor.name,source:data[key].generation.finalSource,sourceHash:hashSource(data[key].generation.finalSource),
    artifact:data[key].actor,artifactHash:hashArtifact(data[key].actor),reviewFindings:data[key].generation.findings.map((entry:any)=>`${entry.code}：${entry.message}`)})),
  macros:[{key:'battle-control',name:automation.name,command,commandHash:hashSource(command),bindings:{unicorn:'unicorn',mimic:'mimic'},covers:[],
    notes:'Existing frozen Actors contain no companion behavior markers. Empty covers makes no invented coverage claim; this valid fixed GM-manual configuration is stored but will not be executed.'}],assets:[]};
const serialized=serializeForgeEncounterPackage(bundle),prepared=await prepareForgeEncounter(serialized);
if(prepared.actors.length!==2||prepared.macros.length!==1)throw Error('The normal preparation interface did not retain two Actors and one Macro');
for(const key of actorKeys)if(!isDeepStrictEqual(prepared.actors.find(actor=>actor.key===key)!.artifact,data[key].actor))throw Error('Actor content changed during cached preparation: '+key);
if(!data.unicorn.actor.flags?.['fvtt-json-generator-spell-resolver']?.spellManifest)throw Error('Unicorn has no original spell manifest');
const unchanged=[...originals].map(([path,hash])=>({path,sha256:hash,unchanged:sha(readFileSync(path))===hash}));
if(unchanged.some(row=>!row.unchanged))throw Error('An original frozen file changed');
mkdirSync(output,{recursive:true});
const packagePath=join(output,'forge46-20261027-macrofail.json');
if(existsSync(packagePath)&&readFileSync(packagePath,'utf8')!==serialized)throw Error('Existing fixture differs; refusing to overwrite');
if(!existsSync(packagePath))writeFileSync(packagePath,serialized);
const receipt={packagePath,packageId:bundle.id,packageSha256:sha(serialized),packageHash:prepared.hash,macro:{key:'battle-control',name:automation.name,commandHash:hashSource(command),covers:[],bindings:bundle.macros[0]!.bindings},
  actorHashes:prepared.actors.map(actor=>({key:actor.key,name:actor.name,artifactHash:actor.artifactHash,unchanged:true})),unicornSpellManifest:true,actualNetwork:0,modelCalls:0,macroExecution:0,originalFiles:unchanged,reviewFindings:prepared.reviewFindings};
writeFileSync(join(output,'macrofail-package-receipt.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt,null,2));

/** Fixed fake-provider replies; all Actors still use the public workflow. */
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {runStagedMonsterExtraction} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {anchorIrEvidence} from '@fvtt-json-generator/intake-ai/orchestrator';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai';
export function requireAcceptedChain(result:any):asserts result is {status:'accepted';actor:Record<string,any>;ir:MonsterIntakeIR;markdown:string}{
 if(result.status!=='accepted'||!result.actor||!result.ir||typeof result.markdown!=='string')throw Error(JSON.stringify({stage:result.stage,error:result.error,findings:result.findings}));
}
export const request=(source:string)=>({source,sourceSha256:hashSource(source),candidate:{id:'weird-format',label:'Synthetic provenance-backed text audit',start:0,end:source.length,quote:source}});
export const collections:Record<string,string>={trait:'traits',action:'actions',bonus:'bonusActions',reaction:'reactions',legendary:'legendaryActions'};
const get=(o:any,path:string[])=>path.reduce((v,k)=>v?.[k],o);
const stable=(v:any):string=>JSON.stringify(v,(_k,e)=>e&&typeof e==='object'&&!Array.isArray(e)?Object.fromEntries(Object.keys(e).sort().map(k=>[k,e[k]])):e);
const same=(a:any,b:any)=>stable(a)===stable(b);
function set(o:any,path:string[],value:any){for(const [index,key]of path.slice(0,-1).entries()){if(o[key]===undefined)o[key]=/^\d+$/u.test(path[index+1]??'')?[]:{};o=o[key];}o[path.at(-1)!]=structuredClone(value);}
const visible=(s:string)=>s.replace(/<[^>]*>/gu,' ').replace(/&nbsp;/gu,' ').replace(/&amp;/gu,'&').replace(/&#39;|&apos;/gu,"'").replace(/&quot;/gu,'"').replace(/\s+/gu,' ').trim();
const normalize=(s:string)=>visible(s).replace(/[*_]/gu,'');
const featureIdentity=(s:string)=>normalize(s).replace(/\s*\(?Recharge\s+\d[–-]\d\)?/iu,'').trim();

// Only constructs an injected model reply. No parser, source validator or staged
// extractor is called here; ordinary extraction remains independent of staging.
export function modelReply(c:any){
 const creature:any={...structuredClone(c.ordinaryCreature??c.creature),traits:[],actions:[],bonusActions:[],reactions:[],legendaryActions:[],biography:c.units.filter((u:any)=>u.destination!=='feature').map((u:any)=>u.text.trim()).join('\n\n')};
 const ir:any={schemaVersion:1,source:{sha256:hashSource(c.source),length:c.source.length},creature,claims:[],coverage:[],uncertainties:[]};
 for(const header of c.headerFeatures??[]){const start=c.source.indexOf(header.text);if(start<0)throw Error('HarnessMissingHeaderRule');const evidence={start,end:start+header.text.length,quote:header.text};creature.traits.push({name:header.name,description:header.text,executionMode:'gm-manual',activityType:'utility',evidence:[evidence]});ir.claims.push({path:'/creature/traits/'+(creature.traits.length-1),valueKind:'preserved-literal',confidence:'high',evidence:[evidence]});}
 let offset=0,index=0,context:string[]=[];
 for(const unit of c.units){
  const evidence={start:offset,end:offset+unit.text.length,quote:unit.text};offset=evidence.end;
  let paths:string[]=[];
  if(unit.destination==='base')paths=[...Object.keys(creature.identity).map(k=>'/creature/identity/'+k),'/creature/abilities',...Object.keys(creature.attributes).map(k=>'/creature/attributes/'+k),...['saves','skills','defenses','senses','languages','biography'].map(k=>'/creature/'+k),...creature.traits.map((_f:any,i:number)=>'/creature/traits/'+i)];
  else if(unit.destination==='context'){
   context=[unit.text];paths=['/creature/biography'];
   if(unit.legendaryMax){const preamble=unit.text.slice(unit.text.indexOf('\n')+1).trim(),start=c.source.indexOf(preamble,evidence.start);creature.legendary={max:unit.legendaryMax,preamble,evidence:[{start,end:start+preamble.length,quote:preamble}]};paths.push('/creature/legendary');}
  }
  else {
   const f=c.features[index++],collection=collections[f.section]!,path='/creature/'+collection+'/'+creature[collection].length;
   // Corpus contexts contain section labels only, no shared substantive rules.
   // Their literal source is already covered by the biography field claim.
   const feature:any={name:f.name,description:f.text,evidence:[evidence],activationType:f.section==='trait'?undefined:f.section==='legendary'?'legendary':f.section,activityType:'utility',executionMode:f.operations.length?'native-with-gm':'gm-manual',...(f.recharge?{recharge:f.recharge}:{}),...(f.legendaryCost!==undefined?{legendaryCost:f.legendaryCost}:{})};
   if(f.operations.length){feature.nativeRuleText=f.text;feature.manualRemainder=f.text;feature.sourceOperations=structuredClone(f.operations);}
   if(f.legacy)Object.assign(feature,structuredClone(f.legacy));
   creature[collection].push(feature);paths=[path];
  }
  for(const path of paths)if(!ir.claims.some((claim:any)=>claim.path===path))ir.claims.push({path,valueKind:path.endsWith('biography')||unit.destination==='feature'?'preserved-literal':'explicit',confidence:'high',evidence:[structuredClone(evidence)]});
  ir.coverage.push({...evidence,classification:unit.destination==='context'&&!unit.legendaryMax?'narrative':'mechanical',claimPaths:paths});
 }
 return ir;
}
function partition(c:any){let next=0;return{schemaVersion:1,units:c.units.map((u:any)=>{const count=u.text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/gu)!.filter(Boolean).length,firstLine=next;next+=count;return{firstLine,lastLine:next-1,destination:u.destination,...(u.destination==='feature'?{section:u.section,name:u.name}:{})};})};}
export async function ordinary(c:any,raw:any){let calls=0;const provider=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'offline-only',baseUrl:'https://offline.invalid/v1',model:'injected-fixture',reviewModel:'injected-fixture',timeoutMs:10000,repairTimeoutMs:10000,maxAttempts:1,httpClient:async()=>{calls++;return{ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(raw)}}]})};}});const ir=await provider.extract(request(c.source));if(calls!==1)throw Error('HarnessUnexpectedProviderCalls');return{ir,calls:['ordinary']};}
export async function staged(c:any,mutation?:any){
 const facts=structuredClone(c.creature),features=structuredClone(c.features),calls:string[]=[];
 if(mutation){const first=mutation.path[0];if(!Object.values(collections).includes(first))set(facts,mutation.path,mutation.value);else{const section=Object.entries(collections).find(([,v])=>v===first)![0],feature=features.filter((f:any)=>f.section===section)[Number(mutation.path[1])];set(feature,mutation.path.slice(2).map((k:string)=>k==='sourceOperations'?'operations':k),mutation.value);}}
 const ir=await runStagedMonsterExtraction(request(c.source),async call=>{
  calls.push(call.stage);await call.onAttempt(1);
  if(call.stage==='source')return partition(c);
  if(call.stage==='base')return{schemaVersion:1,creature:facts,uncertainties:[]};
  const feature=features.find((f:any)=>f.name===call.payload.name);
  if(!feature)throw Error('HarnessUnknownFeature:'+String(call.payload.name));
  return{schemaVersion:1,unitId:call.unitId,mode:feature.operations.length?'native-with-gm':'manual',facts:feature.operations.length?{sourceOperations:feature.operations}:{}};
 },{baseMode:'facts',featureMode:'auto'});
 return{ir,calls};
}
export async function chain(c:any,run:()=>Promise<any>){
 try{
  const extracted=await run(),ir=anchorIrEvidence(c.source,request(c.source).candidate,extracted.ir);
  const validation=validateMonsterIntakeIR(c.source,ir,{coverageRange:request(c.source).candidate});
  if(validation.blocking.length)return{status:'blocked',stage:'validator',calls:extracted.calls,findings:validation.blocking,ir};
  const markdown=renderMonsterIntakeMarkdown(ir),conversion=await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null}),actor=conversion.rawJson;
  const verification=verifyMonsterIntake(c.source,ir,markdown,actor,request(c.source).candidate),findings=verification.findings.filter(f=>f.blocking);
  return{status:findings.length?'blocked':'accepted',stage:findings.length?'verifier':'formal-output',calls:extracted.calls,findings,ir,markdown,actor};
 }catch(error:any){return{status:'blocked',stage:'extraction',error:error.message,diagnostic:error.stagedDiagnostic??error.details,code:error.code,name:error.name};}
}

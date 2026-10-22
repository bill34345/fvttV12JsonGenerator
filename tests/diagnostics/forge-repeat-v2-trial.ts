/** Predeclared 3x paired repetition, separate from every earlier frozen trial. */
import { readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { requestIntakeProvider } from '@fvtt-json-generator/intake-ai/transport';
import { parseStrictJson } from '@fvtt-json-generator/intake-ai/provider';
import { prepareCategoryMdExtraction } from '@fvtt-json-generator/intake-ai/category-md-extraction';
import { MeasuredHttp,safeReply } from './forge-category-md-real-ab-high';
import { makeBatches,decodeReply,prompt,type Unit } from './forge-template-batches-v2';
import { evaluate } from './forge-repeat-v2-checks';
import newSources from '../fixtures/forge-template-repeat-v2-srd.json';
import rubric from '../fixtures/forge-template-repeat-v2-rubric.json';

const sha=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const load=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/u,''));
const save=(p:string,v:unknown,exclusive=true)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n',{encoding:'utf8',flag:exclusive?'wx':'w'});
const git=(r:string,...a:string[])=>execFileSync('git',['-C',r,...a],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function snapshot(root:string) {
  const state=execFileSync('git',['-C',root,'status','--porcelain=v1','-z','-uall']).toString('utf8').split('\0').filter(Boolean);
  return {head:git(root,'rev-parse','HEAD'),state,files:Object.fromEntries(state.map(v=>[v.slice(3),sha(readFileSync(join(root,v.slice(3))))]))};
}
function hashes(root:string) {
  return Object.fromEntries(readdirSync(root,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>{const p=join(e.parentPath,e.name);return [p,sha(readFileSync(p))];}));
}
export function prepareCases() {
  const old=resolve('.local/forge-ab-high-first-pass-20261019');
  const cases=['S1','S2'].map((id,i)=>{
    const source=readFileSync(join(old,id+'-A/source.md'),'utf8');
    const plan=prepareCategoryMdExtraction({source,sourceSha256:sha(source),candidate:{id,label:id,start:0,end:source.length,quote:source}},load(join(old,id+'-A/base-facts.json'))).plan;
    return {id:'R'+(i+1),source,sourceSha256:sha(source),baseContext:plan.base.quote,
      units:plan.features.map(u=>({id:u.id,name:u.name!,section:u.section!,quote:u.quote,context:(u.contextIds??[]).map(cid=>plan.units.find(x=>x.id===cid)!.quote)}))};
  });
  return [...cases,...newSources.cases].map(c=>{
    assert.equal(sha(c.source),c.sourceSha256);
    for(const u of c.units)assert.ok(c.source.includes(u.quote));
    const requirements=(rubric.cases as any)[c.id];
    assert.deepEqual(c.units.map(u=>[u.id,u.name]),requirements.map((r:any)=>[r.id,r.name]));
    return {...c,units:c.units as Unit[],category:makeBatches(c.units as Unit[],'category'),whole:makeBatches(c.units as Unit[],'whole')};
  });
}
export function schedule() {
  const result:Array<{caseId:string;repeat:number;arm:'BC'|'BW'}>=[];
  const orders=[['R1','R2','R3','R4'],['R3','R4','R1','R2'],['R2','R1','R4','R3']];
  orders.forEach((order,index)=>order.forEach(cid=>{
    const first=(Number(cid.slice(1))+index)%2===1?'BC':'BW';
    for(const arm of [first,first==='BC'?'BW':'BC'] as const)result.push({caseId:cid,repeat:index+1,arm});
  }));return result;
}
async function main() {
  const root=process.cwd(),out=resolve('.local/forge-repeat-v2-trial-20261020'),baseline='f637f77f28c086e34297513e5293f98b3835f2e9';
  assert.equal(git(root,'rev-parse','HEAD'),baseline);
  const cases=prepareCases(),order=schedule();
  assert.deepEqual(cases.map(c=>[c.units.length,c.category.length]),[[3,2],[7,3],[10,3],[14,3]]);
  const maximumHttp=45;
  const manifest={baseline,model:'deepseek-flash',reasoning_effort:'high',thinking:{type:'enabled'},maximumHttp,repeats:3,order,
    sourceBaseCalls:0,retries:0,repairs:0,formalGeneration:'NOT_EXECUTED_FORM_TRIAL',promptSha256:sha(prompt),rubric,
    sources:cases.map(c=>({id:c.id,sourceSha256:c.sourceSha256,source:c.source,baseContext:c.baseContext,units:c.units})),
    pricing:'Frozen 2026-10-19 offpeak unit rates for normalized comparison; retain per-request clock-window estimate; actual billing unknown'};
  mkdirSync(out,{recursive:true});
  if(!process.argv.includes('--execute')) {
    save(join(out,'dry-run.json'),{...manifest,batches:cases.map(c=>({id:c.id,category:c.category,whole:c.whole}))},false);
    console.log(JSON.stringify({status:'DRY_RUN_ZERO_NETWORK',sources:4,runs:24,parentsPerArm:102,http:45,BC:33,BW:12}));return;
  }
  if(existsSync(join(out,'started.json')))throw Error('TRIAL_ALREADY_STARTED_DO_NOT_REPEAT');
  let key:unknown=process.env.DEEPSEEK_API_KEY;
  if(!key&&process.env.FVTT_LOCAL_DS_KEY_FILE)key=load(process.env.FVTT_LOCAL_DS_KEY_FILE);
  assert.ok(typeof key==='string'&&key.trim(),'CREDENTIAL_UNAVAILABLE');
  const original='I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample';
  const before=snapshot(original);
  const frozen={...hashes(resolve('.local/forge-ab-first-pass-20261019')),...hashes(resolve('.local/forge-ab-high-first-pass-20261019')),...hashes(resolve('.local/forge-template-batch-trial-20261020')),
    ...Object.fromEntries(['tests/diagnostics/forge-template-batches.ts','tests/diagnostics/forge-template-batches-v2.ts','tests/diagnostics/forge-repeat-v2-checks.ts','tests/diagnostics/forge-repeat-v2-trial.ts',
      'tests/fixtures/forge-template-repeat-v2-srd.json','tests/fixtures/forge-template-repeat-v2-rubric.json','tests/diagnostics/forge-category-md-real-ab-high.ts',
      'packages/intake-ai/src/category-md.ts','packages/intake-ai/src/category-md-extraction.ts','package.json','bun.lock'].map(p=>[resolve(p),sha(readFileSync(p))]))};
  const checkFrozen=()=>{assert.equal(git(root,'rev-parse','HEAD'),baseline);for(const [p,h]of Object.entries(frozen))assert.equal(sha(readFileSync(p)),h,'Frozen candidate/evidence drift');};
  checkFrozen();save(join(out,'intent.json'),manifest);save(join(out,'frozen-before.json'),{original,before,frozen});save(join(out,'started.json'),{at:new Date().toISOString(),maximumHttp});
  const stop=new AbortController();process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
  const meter=new MeasuredHttp(out,key,maximumHttp,fetch,checkFrozen),results:any[]=[];
  for(const task of order) {
    if(stop.signal.aborted||meter.fatal)break;
    const c=cases.find(c=>c.id===task.caseId)!,batches=task.arm==='BC'?c.category:c.whole;
    const identity=`${task.caseId}-t${task.repeat}`,folder=join(out,`${identity}-${task.arm}`);mkdirSync(folder);
    const start=performance.now(),rows:any[]=[],errors:any[]=[];
    for(const batch of batches) {
      if(stop.signal.aborted||meter.fatal)break;
      const user={baseContext:c.baseContext,units:batch.units,sourceInventory:c.units,template:batch.template};save(join(folder,`input-${batch.id}.json`),user);
      try {
        const response=await requestIntakeProvider({baseUrl:'https://api.deepseek.com',apiKey:key,model:'deepseek-flash',protocol:'openai-chat',authScheme:'bearer',reasoning:'high',structuredOutput:{mode:'json_object'},
          systemPrompt:prompt,userContent:JSON.stringify(user),signal:AbortSignal.any([stop.signal,AbortSignal.timeout(600_000)]),
          httpClient:(url,init)=>meter.send(url,init,{case:identity,arm:task.arm as any,unit:batch.id,unitIds:batch.units.map(u=>u.id),promptVersion:'simple-form-v2-frozen'})});
        const decoded=decodeReply(parseStrictJson(response.content),batch);rows.push(...decoded.rows);
        writeFileSync(join(folder,`reply-${batch.id}.yaml`),decoded.markdown,{encoding:'utf8',flag:'wx'});save(join(folder,`decoded-${batch.id}.json`),decoded.rows);
      }catch(error:any){errors.push({batch:batch.id,unitIds:batch.units.map(u=>u.id),error:safeReply({name:error?.name,message:String(error?.message??error)},key)});}
    }
    const calls=meter.records.filter(r=>r.case===identity&&r.arm===task.arm);
    const numerical=evaluate(rows,(rubric.cases as any)[c.id]);
    const result={...task,status:errors.length||rows.length!==c.units.length?'FORMAT_OR_TRANSPORT_FAILED':'FORM_PARSED_PENDING_SOURCE_REVIEW',wallMs:performance.now()-start,calls:calls.length,
      httpWaitMs:calls.reduce((s,r)=>s+r.httpWaitMs,0),requestIndices:calls.map(r=>r.index),rows,errors,numerical,
      normalizedEstimatedUSD:calls.every(r=>r.usage)?calls.reduce((s,r)=>s+(r.usage.prompt_cache_hit_tokens*.003+r.usage.prompt_cache_miss_tokens*.15+r.usage.completion_tokens*.6)/1e6,0):null};
    save(join(folder,'result.json'),result);results.push(result);save(join(out,'first-results.json'),results,false);
    console.log(JSON.stringify({event:'candidate-finished',...task,calls:calls.length,rows:rows.length,formatErrors:errors.length,numericFailures:numerical.flatMap(r=>r.numericalChecks).filter(x=>!x.pass).length,ms:Math.round(result.wallMs)}));
  }
  checkFrozen();const after=snapshot(original);save(join(out,'original-after.json'),after);assert.deepEqual(after,before);
  save(join(out,'run-summary.json'),{status:'FINISHED_PENDING_BLINDED_SOURCE_REVIEW',http:meter.records.length,candidates:results.length,results,originalUnchanged:true,frozenUnchanged:true});
  save(join(out,'first-evidence-freeze.json'),hashes(out));console.log(JSON.stringify({status:'FINISHED_PENDING_BLINDED_SOURCE_REVIEW',http:meter.records.length,candidates:results.length}));
}
if(import.meta.main)main().catch(e=>{console.error(JSON.stringify({status:'STOPPED_NO_RETRY',code:/^[A-Z_]+$/u.test(e?.message??'')?e.message:'HARNESS_ERROR'}));process.exitCode=1;});

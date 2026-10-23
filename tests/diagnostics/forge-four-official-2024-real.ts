/** Opt-in single-pass live DeepSeek through the ordinary Forge AI entry. No saved/model
 * replies are injected. Default is a zero-network preflight; --execute spends
 * at most the normal discovery/extraction requests for these four sources. */
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {analyzeBrowserActorSourceWithAi,generateBrowserActorIntakeCandidate,createBrowserAiProvider} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {readLocalIntakeSettings} from '../../foundry-modules/fvtt-json-forge/src/settings';
import {INTAKE_PROMPT_VERSIONS} from '@fvtt-json-generator/intake-ai/provider';

const ROOT=resolve(import.meta.dir,'../..');
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const git=(...args:string[])=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim();
const save=(path:string,value:unknown)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
function sources(): Array<{id:string;name:string;source:string}>{
  const at=process.argv.indexOf('--sources');if(at<0||!process.argv[at+1])throw Error('Expected --sources manifest.');
  const manifest=JSON.parse(readFileSync(resolve(process.argv[at+1]!),'utf8').replace(/^\uFEFF/u,''));
  const expected=['lion','gladiator','priest','medusa'];
  if(manifest.ruleVersion!=='2024'||!Array.isArray(manifest.cases)||manifest.cases.length!==4||manifest.cases.some((row:any,i:number)=>row.id!==expected[i]))throw Error('Expected four frozen official2024 cases in declared order.');
  return manifest.cases.map((row:any)=>{const source=readFileSync(row.sourcePath,'utf8');if(sha(source)!==row.sourceHash)throw Error('Frozen source identity changed.');return{id:row.id as string,name:row.name as string,source};});
}
function sanitize(value:any,key:string):any{
  if(typeof value==='string')return value.replaceAll(key,'[redacted]').replace(/<(think|analysis|reasoning)\b[^>]*>[\s\S]*?<\/\1>/giu,'[reasoning omitted]');
  if(Array.isArray(value))return value.map(row=>sanitize(row,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([name])=>!['reasoning_content','reasoning_text','encrypted_content','analysis'].includes(name)).map(([name,next])=>[name,sanitize(next,key)]));
  return value;
}
export async function run(){
  const arg=process.argv.indexOf('--out'),out=arg<0?'':resolve(process.argv[arg+1]!);
  if(!out||!out.startsWith('H:\\CodexData\\visualizations\\2026\\10\\22\\01a163d8-f3e5-7663-bd1b-25d55bfdac88\\forge-four-2024-'))throw Error('Expected a new exact task evidence directory via --out.');
  mkdirSync(out,{recursive:true});
  const settings=readLocalIntakeSettings('127.0.0.1',undefined),rows=sources();
  if(INTAKE_PROMPT_VERSIONS.extract!=='monster-intake-extract-v39-source-grant-references')throw Error('Final v39 prompt changed.');
  const intent={baseline:git('rev-parse','HEAD'),branch:git('branch','--show-current'),workflow:'ordinary Forge AI: real discover/extract -> current validation/render/formal workflow/verifier; no staged auto or frozen answers',
    model:settings.model,protocol:settings.protocol,reasoning:settings.reasoning,structuredOutput:settings.structuredOutput,promptVersions:INTAKE_PROMPT_VERSIONS,
    autoCorrect:false,separateReview:false,initialMaximumRequests:rows.length*2,
    sources:rows.map(row=>({id:row.id,name:row.name,sourceHash:sha(row.source),bytes:Buffer.byteLength(row.source)}))};
  const manifest=join(out,'intent.json');
  if(existsSync(manifest)){if(JSON.stringify(JSON.parse(readFileSync(manifest,'utf8')))!==JSON.stringify(intent))throw Error('Preflight identity changed.');}else save(manifest,intent);
  const credentialFile=process.env.FVTT_LOCAL_DS_KEY_FILE;
  if(!credentialFile||!existsSync(credentialFile))throw Error('Existing DS key file unavailable.');
  const key=JSON.parse(readFileSync(credentialFile,'utf8').replace(/^\uFEFF/u,''));
  if(typeof key!=='string'||!key.trim())throw Error('Invalid existing DS credential.');
  if(!process.argv.includes('--execute')){console.log(JSON.stringify({status:'PREFLIGHT_PASS',...intent,credentialAvailable:true,networkCalls:0}));return;}
  if(existsSync(join(out,'started.json')))throw Error('Refuse repeating an already started live attempt.');
  save(join(out,'started.json'),{at:new Date().toISOString(),intentSha256:sha(readFileSync(manifest)),authorization:'Current user: four official2024 creatures, exactly one processing each with final prompt, no fix-and-rerun.'});
  const originalFetch=globalThis.fetch,requests:any[]=[],pending:Promise<void>[]=[],results:any[]=[];
  let active='',localRequest=0;
  const pathFor=(caseId:string,name:string)=>join(out,caseId,name);
  globalThis.fetch=Object.assign(async(input:any,init:any)=>{
    const url=new URL(typeof input==='string'?input:input.url);
    if(url.origin!=='https://api.deepseek.com'||url.pathname!=='/responses'||requests.length>=rows.length*2||++localRequest>2)throw Error('Unexpected endpoint or first-pass request count.');
    const body=JSON.parse(init.body),index=requests.length+1,folder=pathFor(active,`request-${localRequest}`);mkdirSync(folder);
    if(body.model!==settings.model||body.stream!==true)throw Error('Not the current DS profile request.');
    save(join(folder,'request.json'),sanitize(body,key));
    const record:any={index,case:active,request:localRequest,requestHash:sha(init.body),startedAt:new Date().toISOString(),status:'sending'};
    requests.push(record);writeFileSync(join(out,'requests.json'),JSON.stringify(requests,null,2));
    console.log(JSON.stringify({event:'real-ai-start',case:active,index,model:body.model,protocol:settings.protocol}));
    const start=performance.now();
    try{
      const response=await originalFetch(input,{...init,redirect:'error'});record.httpStatus=response.status;
      const clone=response.clone();
      pending.push((async()=>{
        try{
          const text=await clone.text();record.responseHash=sha(text);let envelope:any;
          if(text.trim().startsWith('{'))try{envelope=JSON.parse(text);}catch{}
          else for(const block of text.split(/\r?\n\r?\n/u))for(const line of block.split(/\r?\n/u))if(line.startsWith('data:'))try{const item=JSON.parse(line.slice(5).trim());if(item.type==='response.completed'||item.type==='response.failed'||item.type==='response.incomplete')envelope=item.response;}catch{}
          record.actualModel=envelope?.model??null;record.usage=envelope?.usage??null;record.responseStatus=envelope?.status??null;
          record.status=response.ok?'received':'http_error';
          if(!response.ok)save(join(folder,'http-error.json'),sanitize(envelope??{status:response.status},key));
        }catch(error:any){record.status='capture_failed';record.captureError=String(error?.name??'Error');}
        finally{record.elapsedMs=performance.now()-start;record.completedAt=new Date().toISOString();save(join(folder,'transport.json'),record);writeFileSync(join(out,'requests.json'),JSON.stringify(requests,null,2));}
      })());
      return response;
    }catch(error:any){record.status='network_error';record.errorName=error?.name??'Error';throw error;}
  },{preconnect:originalFetch.preconnect});
  try{
    for(const row of rows){
      active=row.id;localRequest=0;mkdirSync(join(out,row.id));writeFileSync(pathFor(row.id,'source.md'),row.source,{flag:'wx'});
      try {
      let replyIndex=0;const input={source:row.source,sourceName:row.name,displayName:row.name,requestId:`ds-four-${row.id}-${Date.now()}`,fvttVersion:'14.368',systemVersion:'5.3.3',autoCorrect:false};
      const provider=createBrowserAiProvider({apiKey:key,baseUrl:settings.endpoint,model:settings.model,providerId:'deepseek',protocol:settings.protocol,authScheme:settings.authScheme,reasoning:settings.reasoning,structuredOutput:settings.structuredOutput,autoCorrect:false,
        responseEvidence:{record:evidence=>save(pathFor(row.id,`reply-${++replyIndex}-${evidence.stage}.json`),sanitize(evidence,key))},
        onActivity:activity=>{if(['sending','completed','failed'].includes(activity.phase))console.log(JSON.stringify({event:'ai-activity',case:row.id,phase:activity.phase,elapsedMs:activity.elapsedMs}));}});
      const analysis=await analyzeBrowserActorSourceWithAi(input,provider);save(pathFor(row.id,'analysis.json'),sanitize(analysis,key));
      const generation=analysis.ir?await generateBrowserActorIntakeCandidate(input,analysis,provider):undefined;
      if(generation)save(pathFor(row.id,'generation.json'),sanitize(generation,key));
      const response=generation?.candidateResponse??generation?.response,result=response&&'result'in response?response.result:undefined;
      if(result?.artifact)save(pathFor(row.id,'actor.json'),result.artifact);
      if(generation?.markdown)writeFileSync(pathFor(row.id,'rendered.md'),generation.markdown,{flag:'wx'});
      if(analysis.ir)save(pathFor(row.id,'ir.json'),analysis.ir);
      const summary={case:row.id,analysis:analysis.status,candidateAvailable:generation?.candidateAvailable??false,formalStatus:result?.status??'not_generated',intakeStatus:generation?.intakeVerificationStatus??null,findings:generation?.findings??analysis.findings,calls:generation?.calls??analysis.calls,actualHttp:localRequest};
      results.push(summary);save(pathFor(row.id,'summary.json'),summary);console.log(JSON.stringify({event:'case-complete',...summary}));
      } catch(error:any) {
        const failure={case:row.id,formalStatus:'run_error',candidateAvailable:false,actualHttp:localRequest,error:sanitize(String(error?.message??error),key)};
        results.push(failure);save(pathFor(row.id,'summary.json'),failure);console.log(JSON.stringify({event:'case-failed-no-retry',...failure}));
      }
    }
  }finally{globalThis.fetch=originalFetch;await Promise.allSettled(pending);save(join(out,'result.json'),{completedAt:new Date().toISOString(),intent,requests,results,networkCalls:requests.length});}
}

if(import.meta.main)await run();

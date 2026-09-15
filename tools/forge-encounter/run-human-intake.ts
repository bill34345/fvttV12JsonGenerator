import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadMonsterIntakeConfig} from '@fvtt-json-generator/intake-ai/config';
import {createEncounterIntakeProviders,generateEncounterFromHumanMarkdown,assertEncounterSecretsAbsent} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {encodeForgeEncounterPackageZip,serializeForgeEncounterPackage} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';

const [sourcePath,outputPath,...flags]=process.argv.slice(2);let mode:string|undefined,resumePath:string|undefined,feedbackPath:string|undefined;
if(!sourcePath||!outputPath)throw new Error('Usage: bun run tools/forge-encounter/run-human-intake.ts <human.md> <new-output-directory> [--local-ds|--configured-provider] [--resume-draft <review.json>] [--review-feedback <feedback.json>]');
for(let i=0;i<flags.length;i++){if(['--local-ds','--configured-provider'].includes(flags[i]!)&&!mode)mode=flags[i];else if(flags[i]==='--resume-draft'&&!resumePath&&flags[i+1]&&!flags[i+1]!.startsWith('--'))resumePath=flags[++i];else if(flags[i]==='--review-feedback'&&!feedbackPath&&flags[i+1]&&!flags[i+1]!.startsWith('--'))feedbackPath=flags[++i];else throw new Error('Unknown or duplicate option; local Intake uses DS Flash, not a Luna bridge.');}
const source=await readFile(resolve(sourcePath),'utf8');
const localDs=mode!=='--configured-provider';
let localKey=process.env.DEEPSEEK_API_KEY??'';
if(localDs&&!localKey&&process.env.FVTT_LOCAL_DS_KEY_FILE){
  const stored=JSON.parse(await readFile(resolve(process.env.FVTT_LOCAL_DS_KEY_FILE),'utf8'));
  if(typeof stored!=='string'||!stored.trim())throw new Error('Local DS credential file has an unsupported format.');
  localKey=stored;
}
const config=localDs?loadMonsterIntakeConfig({MONSTER_INTAKE_AUTH_MODE:'api-key',MONSTER_INTAKE_API_KEY:localKey,
  MONSTER_INTAKE_BASE_URL:'https://api.deepseek.com',MONSTER_INTAKE_MODEL:'deepseek-flash',MONSTER_INTAKE_REASONING_EFFORT:'low',
  MONSTER_INTAKE_TIMEOUT_MS:'300000',MONSTER_INTAKE_REPAIR_TIMEOUT_MS:'300000'}):loadMonsterIntakeConfig();
localKey='';
const label=source.match(/^#\s+(.+)$/m)?.[1]??'多生物战斗资料';
assertEncounterSecretsAbsent(source,[config.apiKey,config.baseUrl]);
assertEncounterSecretsAbsent(label,[config.apiKey,config.baseUrl]);
let drafts:any[]|undefined,draftParentHash:string|undefined,sourceFeedback:Array<{actorKey:string;path:string;message:string}>|undefined;
if(resumePath){
  if((await stat(resolve(resumePath))).size>32*1024*1024)throw new Error('Draft report is too large');
  const reportText=await readFile(resolve(resumePath),'utf8');assertEncounterSecretsAbsent(reportText,[config.apiKey,config.baseUrl]);
  const prior=JSON.parse(reportText);
  if(prior.version!==1||prior.source!==source||prior.sourceHash!==hashSource(source)||!Array.isArray(prior.actors))throw new Error('Draft report does not match the current raw source');
  drafts=prior.actors.filter((a:any)=>a?.analysis?.ir).map((a:any)=>({key:a.key,source:a.source,ir:a.analysis.ir}));
  if(!drafts?.length)throw new Error('Draft report contains no extracted IR');draftParentHash=hashSource(reportText);
}
if(feedbackPath){
  if(!draftParentHash||(await stat(resolve(feedbackPath))).size>100000)throw new Error('Review feedback requires a matching draft and bounded file');
  const feedbackText=await readFile(resolve(feedbackPath),'utf8');assertEncounterSecretsAbsent(feedbackText,[config.apiKey,config.baseUrl]);
  const feedback=JSON.parse(feedbackText);
  if(feedback.sourceHash!==hashSource(source)||feedback.parentReportHash!==draftParentHash||!Array.isArray(feedback.findings))throw new Error('Review feedback does not match the raw source and draft report');
  sourceFeedback=feedback.findings;
}
const output=resolve(outputPath);await mkdir(output,{recursive:false});
const options={baseUrl:config.baseUrl,apiKey:config.apiKey,model:config.model,reviewModel:config.reviewModel,
  reasoning:config.reasoningEffort,protocol:localDs?'openai-responses' as const:'openai-chat' as const,structuredOutput:'json_object' as const,
  timeoutMs:config.timeoutMs,repairTimeoutMs:config.repairTimeoutMs,allowLocalBridge:false,
};
const controller=new AbortController();process.once('SIGINT',()=>controller.abort());
const providers=createEncounterIntakeProviders(options,controller.signal);
const result=await generateEncounterFromHumanMarkdown({source,label,...providers,drafts,draftParentHash,sourceFeedback,signal:controller.signal,
  onProgress:message=>console.log(JSON.stringify({at:new Date().toISOString(),message})),
  onReport:report=>{const text=JSON.stringify(report,null,2);assertEncounterSecretsAbsent(text,[config.apiKey,config.baseUrl]);writeFileSync(resolve(output,'review.json'),text);}});
if(!result.prepared){console.log(JSON.stringify({status:result.report.status,findings:result.report.findings}));process.exitCode=1;}
else{
  for(const actor of result.prepared.actors){await writeFile(resolve(output,`${actor.key}.json`),JSON.stringify(actor.artifact,null,2));await writeFile(resolve(output,`${actor.key}.md`),result.prepared.bundle.actors.find(a=>a.key===actor.key)!.source);}
  await writeFile(resolve(output,'encounter.forge-encounter.json'),serializeForgeEncounterPackage(result.prepared.bundle));
  await writeFile(resolve(output,'encounter.forge-encounter.zip'),await encodeForgeEncounterPackageZip(result.prepared.bundle));
  console.log(JSON.stringify({status:result.report.status,sourceHash:result.report.sourceHash,packageHash:result.prepared.hash,
    model:options.model,reasoning:options.reasoning,actors:result.prepared.actors.map(a=>({key:a.key,name:a.name})),macros:result.prepared.bundle.macros.length}));
}

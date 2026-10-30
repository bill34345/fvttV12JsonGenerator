import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadMonsterIntakeConfig} from '@fvtt-json-generator/intake-ai/config';
import {createEncounterIntakeProviders,generateEncounterFromHumanMarkdown,assertEncounterSecretsAbsent,encounterActorCandidate,
  type EncounterIntakeInput,type EncounterIntakeReport} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {encodeForgeEncounterPackageZip,serializeForgeEncounterPackage} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';

const [sourcePath,outputPath,...flags]=process.argv.slice(2);let mode:string|undefined,resumePath:string|undefined,feedbackPath:string|undefined,outputLanguage:'source'|'zh-CN'='source';
if(!sourcePath||!outputPath)throw new Error('Usage: bun run tools/forge-encounter/run-human-intake.ts <human.md> <new-output-directory> [--local-ds|--configured-provider] [--language zh-CN] [--resume-draft <review.json>] [--review-feedback <feedback.json>]');
for(let i=0;i<flags.length;i++){if(['--local-ds','--configured-provider'].includes(flags[i]!)&&!mode)mode=flags[i];else if(flags[i]==='--language'&&flags[i+1]==='zh-CN'&&outputLanguage==='source'){outputLanguage='zh-CN';i++;}else if(flags[i]==='--resume-draft'&&!resumePath&&flags[i+1]&&!flags[i+1]!.startsWith('--'))resumePath=flags[++i];else if(flags[i]==='--review-feedback'&&!feedbackPath&&flags[i+1]&&!flags[i+1]!.startsWith('--'))feedbackPath=flags[++i];else throw new Error('Unknown or duplicate option; local Intake uses DS Flash, not a Luna bridge.');}
const requestedSource=await readFile(resolve(sourcePath),'utf8');
const findings:string[]=[];
let previousReport:EncounterIntakeReport|undefined;
if(resumePath){
  const reportText=await readFile(resolve(resumePath),'utf8');assertEncounterSecretsAbsent(reportText,[]);
  previousReport=JSON.parse(reportText) as EncounterIntakeReport;
}
const source=typeof previousReport?.source==='string'?previousReport.source:requestedSource;
if(previousReport&&(previousReport.sourceHash!==hashSource(source)||previousReport.version!==1)){
  findings.push('保存报告的版本或来源指纹记录不同，已按保存的原始来源整理程序记录；原报告文件未改动。');
  previousReport={...previousReport,version:1,source,sourceHash:hashSource(source)};
}
if(previousReport&&source!==requestedSource)findings.push('当前输入与保存报告不同；本次继续使用保存报告的原始来源快照，已有角色仍可获取。');
const label=source.match(/^#\s+(.+)$/m)?.[1]??'多生物战斗资料';
const drafts=previousReport?.actors?.filter(actor=>actor?.analysis?.ir).map(actor=>({key:actor.key,source:actor.source,ir:actor.analysis.ir!}));
// Keep the full report fingerprint; the shared recovery core independently verifies it.
const draftParentHash=previousReport?new Bun.CryptoHasher('sha256').update(JSON.stringify(previousReport)).digest('hex'):undefined;
let sourceFeedback:EncounterIntakeInput['sourceFeedback'];
if(feedbackPath){
  const feedbackText=await readFile(resolve(feedbackPath),'utf8');assertEncounterSecretsAbsent(feedbackText,[]);
  const feedback=JSON.parse(feedbackText);
  if(draftParentHash&&feedback.sourceHash===hashSource(source)&&feedback.parentReportHash===draftParentHash&&Array.isArray(feedback.findings))sourceFeedback=feedback.findings;
  else findings.push('审阅反馈与保存报告身份不同，未应用该反馈；保存角色继续保留。');
}
const controller=new AbortController();process.once('SIGINT',()=>controller.abort());
let providers:Pick<EncounterIntakeInput,'provider'|'automationProvider'|'translationService'|'requestedOptions'>;
let model=previousReport?.model??'saved-intake',reasoning:unknown=previousReport?.requestedOptions?.reasoning;
let forbiddenValues:string[]=[];
if(previousReport){
  const localUnavailable=async()=>{throw new Error('保存资料尚缺少此项 AI 回答；本次仅本地恢复，未发起请求。');};
  providers={provider:{providerName:'saved-intake',extractionModel:previousReport.model,reviewModel:previousReport.reviewModel,
    discover:localUnavailable,extract:localUnavailable,repair:localUnavailable,review:localUnavailable},
    automationProvider:{generate:localUnavailable,review:localUnavailable},requestedOptions:{...previousReport.requestedOptions,
      protocol:previousReport.requestedOptions?.protocol,reasoning:previousReport.requestedOptions?.reasoning,autoCorrect:false}};
  findings.push('本次仅从保存资料进行本地恢复；缺少回答的成员和配套内容仍待明确请求，没有调用 AI。');
}else{
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
  localKey='';forbiddenValues=[config.apiKey,config.baseUrl];model=config.model;reasoning=config.reasoningEffort;
  providers=createEncounterIntakeProviders({baseUrl:config.baseUrl,apiKey:config.apiKey,model:config.model,reviewModel:config.reviewModel,
    reasoning:config.reasoningEffort,protocol:'openai-chat',structuredOutput:'json_object',timeoutMs:config.timeoutMs,
    repairTimeoutMs:config.repairTimeoutMs,allowLocalBridge:false},controller.signal);
}
assertEncounterSecretsAbsent(source,forbiddenValues);assertEncounterSecretsAbsent(label,forbiddenValues);
const output=resolve(outputPath);await mkdir(output,{recursive:false});
if(previousReport)writeFileSync(resolve(output,'review.json'),JSON.stringify(previousReport,null,2));
const result=await generateEncounterFromHumanMarkdown({source,label,...providers,drafts,draftParentHash,previousReport,sourceFeedback,outputLanguage,signal:controller.signal,
  onProgress:message=>console.log(JSON.stringify({at:new Date().toISOString(),message})),
  onReport:report=>{const text=JSON.stringify(report,null,2);assertEncounterSecretsAbsent(text,forbiddenValues);writeFileSync(resolve(output,'review.json'),text);}});
findings.push(...result.report.findings);
if(result.continuationRejected)findings.push(`保存报告的本地继续尚未完成：${result.continuationRejected}；已有角色继续导出。`);
const reports=[result.report,...(previousReport?[previousReport]:[])];
const actors=new Map<string,{key:string;name:string;artifact:unknown;source:string}>();
for(const actor of result.prepared?.actors??[]){
  const source=result.prepared!.bundle.actors.find(entry=>entry.key===actor.key)?.source??'';
  actors.set(actor.key,{key:actor.key,name:actor.name,artifact:actor.artifact,source});
}
for(const report of reports)for(const actor of report.actors??[]){
  if(actors.has(actor.key))continue;
  try{
    const candidate=encounterActorCandidate(report,actor.key);
    actors.set(actor.key,{key:actor.key,name:String(candidate.artifact.name??candidate.label),artifact:candidate.artifact,source:candidate.finalSource});
    findings.push(...candidate.findings);
  }catch{/* A member with no saved Actor remains visible in the report and pending request list. */}
}
const exported:Array<{key:string;name:string;actorPath:string;markdownPath:string}>=[];
const fileNames=new Set<string>();
for(const actor of actors.values()){
  const base=actor.key.replace(/[^a-zA-Z0-9_-]+/gu,'-')||`actor-${exported.length+1}`;let fileName=base,suffix=2;
  while(fileNames.has(fileName))fileName=`${base}-${suffix++}`;
  fileNames.add(fileName);
  const actorPath=resolve(output,`${fileName}.json`),markdownPath=resolve(output,`${fileName}.md`);
  const text=JSON.stringify(actor.artifact,null,2);assertEncounterSecretsAbsent(text,forbiddenValues);
  await writeFile(actorPath,text);await writeFile(markdownPath,actor.source);
  exported.push({key:actor.key,name:actor.name,actorPath,markdownPath});
}
let packageHash:string|undefined,macros=0;
if(result.prepared)try{
  await writeFile(resolve(output,'encounter.forge-encounter.json'),serializeForgeEncounterPackage(result.prepared.bundle));
  await writeFile(resolve(output,'encounter.forge-encounter.zip'),await encodeForgeEncounterPackageZip(result.prepared.bundle));
  packageHash=result.prepared.hash;macros=result.prepared.bundle.macros.length;
}catch(error){findings.push(`配套导入文件未完成：${error instanceof Error?error.message:String(error)}；已导出的角色保留。`);}
const pendingRequests=[...new Map(reports.flatMap(report=>(report.members??[]).filter(member=>!actors.has(member.key)&&!report.actors?.some(actor=>actor.key===member.key&&(actor.analysis?.ir||actor.analysis?.canonicalSource||actor.analysis?.sourceText)))
  .map(member=>[member.key,{key:member.key,label:member.label,message:'保存资料缺少此成员的完整回答，仍待明确发起 AI 请求。'}] as const))).values()];
const report=result.continuationRejected&&previousReport?previousReport:result.report;
const finalReport={...report,findings:[...new Set([...(report.findings??[]),...findings])]};
assertEncounterSecretsAbsent(JSON.stringify(finalReport),forbiddenValues);
await writeFile(resolve(output,'review.json'),JSON.stringify(finalReport,null,2));
console.log(JSON.stringify({status:result.continuationRejected?'needs_review':result.report.status,sourceHash:report.sourceHash,packageHash,
  model,reasoning,actors:exported,macros,pendingRequests,findings:finalReport.findings}));
if(!result.prepared)process.exitCode=exported.length?2:1;

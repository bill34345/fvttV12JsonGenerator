import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {OpenAICompatibleMonsterIntakeProvider,INTAKE_PROMPT_VERSIONS,type ProviderResponseEvidence} from '@fvtt-json-generator/intake-ai/provider';
import {analyzeBrowserActorSourceWithAi,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {hashSource,hashArtifact,type ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';

globalThis.fetch=(async()=>{throw Error('This evidence export prohibits network access.');}) as typeof fetch;
const frozen=resolve(process.env.FORGE_CHM_FROZEN_ROOT??'H:/CodexData/visualizations/2026/10/27/01a17bee-ceb9-7eb3-8fce-a8320e15295f/forge-four-chm-first-pass-20261027');
const output=resolve(process.env.FORGE_CHM_FIX_ROOT??'H:/CodexData/visualizations/2026/10/27/01a17bee-ceb9-7eb3-8fce-a8320e15295f/forge-four-chm-fixes-20261027','berserker');
const originalRunner=resolve(process.env.FORGE_CHM_ORIGINAL_RUNNER??'.local/forge-four-chm-first-pass-20261027/runner.ts');
const originLabel='SYNTHETIC_COMPLETED_INPUT_FROM_TRUNCATED_FAILURE_EVIDENCE_EXCERPT';
const digest=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const sourcePath=join(frozen,'sources-r2','berserker.md'),answerPath=join(frozen,'results','berserker','raw-answer.txt');
const source=readFileSync(sourcePath,'utf8'),answer=readFileSync(answerPath,'utf8'),runnerText=readFileSync(originalRunner,'utf8');
const identitySource=runnerText.match(/function sourceId\(id:string\):ForgeSourceId\{[\s\S]*?\n\}/u)?.[0];
if(!identitySource)throw Error('The prior runner source identity helper was not found.');
// Importing the live runner would execute its entry point; load only its pure identity helper.
const identityJs=new Bun.Transpiler({loader:'ts'}).transformSync(identitySource);
const sourceId=Function('hashSource',identityJs+';return sourceId("berserker");')(hashSource) as ForgeSourceId;
const historical=JSON.parse(readFileSync(join(frozen,'results','berserker','response-evidence-1.json'),'utf8'));
const events:ProviderResponseEvidence[]=[];let syntheticCalls=0;
const provider=new OpenAICompatibleMonsterIntakeProvider({baseUrl:'https://offline-fixture.invalid',apiKey:'offline-fixture',model:'frozen-visible-excerpt',reviewModel:'disabled',timeoutMs:1000,repairTimeoutMs:1000,maxAttempts:1,
  transport:{protocol:'openai-responses',stream:true},structuredOutput:{mode:'json_object'},responseEvidence:{record:event=>{events.push(event);}},
  httpClient:async()=>{if(++syntheticCalls!==1)throw Error('Only one synthetic response is allowed.');
    const event={type:'response.completed',sequence_number:0,response:{id:'synthetic-excerpt-response',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:answer}]}]}};
    return new Response('event: response.completed\ndata: '+JSON.stringify(event)+'\n\n',{status:200,headers:{'content-type':'text/event-stream'}});
  }});
const forbidden=async():Promise<never>=>{throw Error('No additional extraction, review, discovery or repair is authorized.');};
const allowed={providerName:provider.providerName,extractionModel:provider.extractionModel,reviewModel:'disabled',discover:forbidden,extract:provider.extract.bind(provider),extractAnswer:provider.extractAnswer.bind(provider),review:forbidden,repair:forbidden};
const input={source,sourceName:'狂战士 Berserker',sourceScope:'single' as const,requestId:'four-chm-20261027-berserker',sourceId,fvttVersion:'14.368',systemVersion:'5.3.3',autoCorrect:false};
const analysis=await analyzeBrowserActorSourceWithAi(input,allowed),generation=await generateBrowserActorIntakeCandidate(input,analysis,{...allowed,extract:forbidden,extractAnswer:forbidden});
const response=generation.candidateResponse;
if(!response||!('result'in response)||!response.result.artifact||!generation.finalSource)throw Error('The local reception path did not produce the required Actor/source; original inputs remain untouched.');
const actor=response.result.artifact;
mkdirSync(output,{recursive:true});
const save=(name:string,value:unknown)=>writeFileSync(join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
save('analysis.json',analysis);save('generation.json',generation);save('actor.json',actor);
writeFileSync(join(output,'generated-source.md'),generation.finalSource,{flag:'wx'});
save('response-evidence.json',{origin:originLabel,actualExternalHttp:0,syntheticCompletedEnvelope:true,evidence:events});
const receipt={origin:originLabel,originalRealRequestWasNotRepeated:true,originalTerminalEnvelopeIsUnavailable:true,
  input:{sourcePath,sourceSha256:digest(source),answerPath,answerSha256:digest(answer),originalRunner,runnerSha256:digest(runnerText),identityHelperSha256:digest(identitySource),sourceId},
  historicalFailure:{kind:historical.kind,transportFailure:historical.transportFailure,responseHash:historical.responseHash},
  current:{promptVersion:INTAKE_PROMPT_VERSIONS.extract,model:'frozen-visible-excerpt',actualExternalHttp:0,syntheticHttpClientCalls:syntheticCalls,analysisStatus:analysis.status,generationStatus:generation.status,formalStatus:generation.formalStatus,candidateAvailable:generation.candidateAvailable,artifactHash:hashArtifact(actor),finalSourceHash:hashSource(generation.finalSource),calls:analysis.calls},
  outputs:['analysis.json','generation.json','actor.json','generated-source.md','response-evidence.json','receipt.json'],
  limitation:'This exports a normally generated Actor from a labelled synthetic completed response containing the saved failure-evidence excerpt. It does not establish what the original real completed envelope contained or that the historical HTTP request succeeded.'};
save('receipt.json',receipt);
console.log(JSON.stringify({output,origin:originLabel,actualExternalHttp:0,syntheticCalls,sourceId,candidateAvailable:generation.candidateAvailable,actorName:actor.name,artifactHash:receipt.current.artifactHash,promptVersion:INTAKE_PROMPT_VERSIONS.extract}));

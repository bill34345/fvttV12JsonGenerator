/** Offline-only replay through the exact browser provider and formal workflow.
 * Never imports answers from the rubric and never sends a network request. */
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import yaml from 'js-yaml';
import {createEncounterIntakeProviders} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {analyzeBrowserActorSourceWithAi,analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate,type BrowserActorIntakeInput} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {renderEncounterActorSource} from '@fvtt-json-generator/intake-ai/encounter-automation';
import {splitStagedMonsterSource,stagedSourceLines,assembleStagedLinePartition} from '@fvtt-json-generator/intake-ai/staged-source';
import {parseStrictJson} from '@fvtt-json-generator/intake-ai/provider';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {validateStagedBaseFacts,assembleStagedFeature,assembleStagedMonsterIntake} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {decodeCategoryFormV2,makeWholeCategoryForm} from '../../packages/intake-ai/src/category-form-v2';
import {adaptCategoryFormV2,inspectCategoryFormV2} from '../../packages/intake-ai/src/category-form-v2-adapter';
import {sourceFeatureBasicOmissions} from '@fvtt-json-generator/models/source-operations';
import {prepareCases} from './forge-repeat-v2-trial';
import headerFixtures from '../fixtures/forge-v2-bw-base-facts.json';

const hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const json=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/u,''));
export const frozenRoot=resolve('.local/forge-repeat-v2-trial-20261020');
const implementationPaths=['packages/intake-ai/src/category-form-v2.ts','packages/intake-ai/src/category-form-v2-adapter.ts',
  'packages/intake-ai/src/category-form-v2-healing.ts','packages/models/src/sourceOperations.ts',
  'packages/intake-ai/src/category-form-v2-identity.ts','packages/intake-ai/src/category-form-v2-damage-adjustment.ts',
  'packages/models/src/sourceOperationTypes.ts','packages/models/src/sourceAttackAdjustment.ts',
  'packages/generation/src/actor.ts','packages/generation/src/gm-attack-activities.ts','packages/generation/src/structured-rule-summary.ts','packages/intake-ai/src/verifier.ts',
  'packages/intake-ai/src/provider.ts','packages/intake-ai/src/staged-source.ts','packages/intake-ai/src/source-completeness.ts','packages/forge-browser-runtime/src/ai.ts',
  'packages/intake-ai/src/staged-extraction.ts','packages/intake-ai/src/staged-feature-contract.ts','packages/intake-ai/src/base-source-numbers.ts',
  'packages/intake-ai/src/staged-feature-mechanics.ts','packages/forge-browser-runtime/src/encounterIntake.ts','packages/models/package.json',
  'tests/diagnostics/forge-v2-bw-replay.ts'];
const implementationHashes=()=>Object.fromEntries(implementationPaths.map(path=>[path,hash(readFileSync(resolve(path)))]));
export function verifyFrozenFiles(){
  const manifest=json(join(frozenRoot,'first-evidence-freeze.json')) as Record<string,string>;
  for(const [path,expected] of Object.entries(manifest)){
    if(!existsSync(path)||hash(readFileSync(path))!==expected)throw Error('Frozen evidence changed: '+path);
  }
  return Object.keys(manifest).length;
}
function linePartition(c:ReturnType<typeof prepareCases>[number]){
  const request={source:c.source,sourceSha256:c.sourceSha256,candidate:{id:c.id,label:c.id,start:0,end:c.source.length,quote:c.source}};
  try{splitStagedMonsterSource(request);return undefined;}catch{
    // The trial already froze complete feature spans and shared preambles.
    // Reconstruct their LINE OWNERSHIP only; never regenerate or change prose.
    const events:any[]=[{start:0,destination:'base'}],seen=new Set<number>([0]);
    const startOf=(quote:string)=>{
      const matches=[...c.source.matchAll(new RegExp(quote.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&'),'gu'))]
        .map(m=>m.index!).filter(at=>at===0||c.source[at-1]==='\n');
      if(matches.length!==1)throw Error('Frozen span is not unique at line boundary');return matches[0]!;
    };
    for(const unit of c.units){
      for(const context of unit.context){const start=startOf(context);if(!seen.has(start)){seen.add(start);events.push({start,destination:'context'});}}
      const start=startOf(unit.quote);if(seen.has(start))throw Error('Overlapping frozen ownership');seen.add(start);
      events.push({start,destination:'feature',section:unit.section,name:unit.name});
    }
    for(const match of c.source.matchAll(/^(?:Actions|Bonus Actions|Reactions|Legendary Actions|Mythic Actions)\r?$/gmu)){
      const start=match.index!;if(!seen.has(start)){seen.add(start);events.push({start,destination:'context'});}
    }
    events.sort((a,b)=>a.start-b.start);
    const lines=stagedSourceLines(request),offsets:number[]=[];let at=0;for(const line of lines){offsets.push(at);at+=line.text.length;}
    const units=events.map((event,index)=>{
      const firstLine=offsets.indexOf(event.start),next=events[index+1]?.start??c.source.length,lastLine=offsets.findLastIndex(n=>n<next);
      if(firstLine<0)throw Error('Frozen boundary is not a complete line');
      return {firstLine,lastLine,destination:event.destination,...(event.section?{section:event.section,name:event.name}:{})};
    });
    const proposal={schemaVersion:1,units};assembleStagedLinePartition(request,proposal);return proposal;
  }
}

/** Explicit capability slice: exact frozen base and feature prose/filled values,
 * with a new source identity and only its identity field remapped. This is not
 * a corrected original candidate and cannot promote its failed whole status. */
async function projectCapability(c:ReturnType<typeof prepareCases>[number],unit:any,row:any,base:any,provider:any){
  const sections:Record<string,string>={action:'Actions',bonus:'Bonus Actions',trait:'Traits',reaction:'Reactions',legendary:'Legendary Actions'};
  if(!sections[unit.section])throw Error('Unsupported capability section');
  const source=c.baseContext.trimEnd()+'\n'+sections[unit.section]+'\n'+unit.quote.trimEnd()+'\n';
  const candidate={id:'capability',label:unit.name,start:0,end:source.length,quote:source};
  const plan=splitStagedMonsterSource({source,sourceSha256:hash(source),candidate});
  if(plan.features.length!==1)throw Error('Capability must have exactly one complete feature');
  const template=yaml.load(String(makeWholeCategoryForm(plan).payload.template)) as any;
  const {source:boundSource,category:_programCategory,...filled}=row;
  for(const rows of Object.values(template) as any[][])if(rows.length)rows[0]={...filled,编号:plan.features[0]!.id};
  const decoded=decodeCategoryFormV2({markdown:yaml.dump(template,{noRefs:true,lineWidth:-1})},plan),baseIr=validateStagedBaseFacts(plan,base);
  const ir=assembleStagedMonsterIntake(plan,baseIr,adaptCategoryFormV2(plan,baseIr,decoded),{sourceProvenSelfArea:true});
  const input:BrowserActorIntakeInput={source,sourceName:unit.name,requestId:'capability-'+unit.id,fvttVersion:'14.364',systemVersion:'5.3.3',renderMarkdown:value=>renderEncounterActorSource(value,[],source)};
  const analysis=analyzeBrowserActorIntakeDraft(input,ir,provider);
  const generated=await generateBrowserActorIntakeCandidate(input,analysis,provider);
  const actor=generated.actorProjection as any;
  const activities=actor?.items?.flatMap((item:any)=>Object.values<any>(item.system?.activities??{}))??[];
  const activity=activities.find((item:any)=>item.type==='save'&&item.name===unit.name);
  let tamperedActorRejected=false;
  if(generated.status==='ready_for_gm_review'){
    if(!activity||activity.flags?.fvttJsonGenerator?.sourceOperation?.sourceText!==unit.quote.trim())throw Error('Capability lost the complete original source rule');
    const damage=activity.damage.parts.map((part:any)=>[part.number,part.denomination,...part.types]);
    if(unit.name==='Toxic Emission'&&(activity.save.dc.formula!=='17'||JSON.stringify(activity.save.ability)!=='["con"]'||activity.damage.onSave!=='half'
      ||JSON.stringify(damage)!=='[[4,8,"poison"]]'||activity.range.units!=='self'||activity.target.template.size!=='10'||activity.activation.type!=='bonus'
      ||!activity.flags.fvttJsonGenerator.sourceOperation.sourceText.includes('until the end\nof its next turn')))throw Error('Toxic source/native readback conflict');
    if(unit.name==='Charm'&&(activity.save.dc.formula!=='17'||JSON.stringify(activity.save.ability)!=='["wis"]'||activity.range.value!==30
      ||!activity.target.affects.special.startsWith('one humanoid it can see')||!activity.activation.condition.includes('If the target can see the vampire')||damage.length))throw Error('Charm source/native readback conflict');
    if(unit.name==='Weaverot Volley'&&(activity.save.dc.formula!=='18'||JSON.stringify(activity.save.ability)!=='["dex"]'||activity.range.value!==60
      ||activity.target.template.type!=='sphere'||activity.target.template.size!=='15'||JSON.stringify(damage)!=='[[4,6,"piercing"],[2,10,"necrotic"]]'))throw Error('Weaverot source/native readback conflict');
    const corrupt=structuredClone(actor),save=corrupt.items.flatMap((item:any)=>Object.values<any>(item.system.activities??{})).find((item:any)=>item._id===activity._id);
    save.save.dc.formula='99';
    tamperedActorRejected=verifyMonsterIntake(source,ir,generated.markdown!,corrupt,candidate).findings.some(f=>f.blocking);
  }
  let packageStatus='not-prepared';
  if(generated.status==='ready_for_gm_review'){
    await prepareForgeEncounter(JSON.stringify({schema:'fvtt-json-forge-encounter',version:1,id:'capability-'+unit.id,label:unit.name,primaryActorKey:'actor',target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'},actors:[{key:'actor',label:unit.name,source:generated.markdown,sourceHash:hash(generated.markdown!)}],macros:[],assets:[]}));
    packageStatus='prepared';
  }
  return{scope:'derived-single-feature-capability-not-original-candidate',source,sourceSha256:hash(source),sourceFeatureSha256:hash(unit.quote),originalFeatureSha256:hash(boundSource),status:generated.status,
    findings:generated.findings,packageStatus,tamperedActorRejected,activities,actor,markdown:generated.markdown};
}
export async function replayFrozenForms(outputDir?:string){
  const selected=process.env.FORGE_V2_BW_CASES?.split(',');
  const codeBefore=implementationHashes();
  const frozenFiles=verifyFrozenFiles(),cases=prepareCases().filter(c=>!selected||selected.includes(c.id)),results:any[]=[],receipts=json(join(frozenRoot,'http-requests.json')) as any[];
  const priorFetch=globalThis.fetch;
  let transportCalls=0;
  try{
    for(const c of cases){
      const base=c.id==='R1'||c.id==='R2'?json(resolve('.local/forge-ab-high-first-pass-20261019',c.id==='R1'?'S1-A/base-facts.json':'S2-A/base-facts.json'))
        :structuredClone(headerFixtures[c.id as 'R3'|'R4']);
      for(let repeat=1;repeat<=3;repeat++)for(const arm of ['BC','BW'] as const){
        const rawReplies:any[]=[],replyTexts:string[]=[];
        for(const b of arm==='BW'?c.whole:c.category){
          const receipt=receipts.find(r=>r.case===`${c.id}-t${repeat}`&&r.arm===arm&&r.unit===b.id);
          if(!receipt)throw Error('Missing frozen HTTP identity');
          const content=readFileSync(join(frozenRoot,'requests',String(receipt.index).padStart(3,'0'),'reply.txt'),'utf8');
          replyTexts.push(content);
          const markdown=String((parseStrictJson(content) as any).markdown).trim().replace(/^```(?:yaml|yml)?\s*\n([\s\S]*?)\n```$/iu,'$1');
          rawReplies.push(yaml.load(markdown,{schema:yaml.JSON_SCHEMA}));
        }
        const form=Object.assign({},...rawReplies),reply={markdown:yaml.dump(form,{noRefs:true,lineWidth:-1})},stages:any[]=[],requests:any[]=[],evidence:any[]=[],identityMappings:any[]=[],fixtureErrors:string[]=[];
        const partition=linePartition(c);let featureReply:string|undefined;
        globalThis.fetch=Object.assign(async (_url:any,init?:RequestInit)=>{
          transportCalls++;
          const body=JSON.parse(String(init?.body)),messages=body.messages??[],prompt=String(messages[0]?.content??''),payload=JSON.parse(String(messages[1]?.content??'{}'));
          requests.push({prompt,payload});
          let answer:any=Array.isArray(payload.units)&&payload.template?reply:typeof payload.source==='string'&&payload.source.trim()===c.baseContext.trim()?base:payload.lines?partition:undefined;
          if(!answer)throw Error('Unexpected network operation during offline replay');
          let content=answer===reply&&arm==='BW'?replyTexts[0]:JSON.stringify(answer);
          if(answer===reply){
            const mapped=structuredClone(form);let changed=false;
            for(const rows of Object.values(mapped) as any[][])for(const row of rows){
              const saved=c.units.find(u=>u.id===row.编号),current=saved&&payload.units.filter((u:any)=>u.name===saved.name&&String(u.quote).replace(/\s+/gu,' ').trim()===saved.quote.replace(/\s+/gu,' ').trim());
              if(!saved||current?.length!==1){fixtureErrors.push(JSON.stringify({frozenId:row.编号,savedName:saved?.name,currentUnits:payload.units.map((u:any)=>({id:u.id,name:u.name,quoteHash:hash(u.quote)})),savedQuoteHash:saved?hash(saved.quote):null}));throw Error('Frozen identity cannot map uniquely to actual request');}
              if(row.编号!==current[0].id){identityMappings.push({from:row.编号,to:current[0].id});row.编号=current[0].id;changed=true;}
            }
            if(changed)content=JSON.stringify({markdown:yaml.dump(mapped,{noRefs:true,lineWidth:-1})});
            featureReply=content;
          }
          return new Response(JSON.stringify({choices:[{message:{content}}]}),{status:200,headers:{'Content-Type':'application/json'}});
        },{preconnect:priorFetch.preconnect});
        const providers=createEncounterIntakeProviders({baseUrl:'https://frozen.invalid/v1',apiKey:'offline-fixture',model:'frozen-model',protocol:'openai-chat',timeoutMs:10000,
          onExtractionStage:stage=>{stages.push(stage);},responseEvidence:{record:entry=>{evidence.push(entry);}}});
        const candidate={id:c.id,label:c.id,start:0,end:c.source.length,quote:c.source};
        const actual=providers.provider;
        const provider={providerName:actual.providerName,extractionModel:actual.extractionModel,reviewModel:actual.reviewModel,
          discover:async()=>({schemaVersion:1 as const,candidates:[candidate]}),extract:actual.extract.bind(actual),review:actual.review.bind(actual),repair:actual.repair.bind(actual)};
        const input:BrowserActorIntakeInput={source:c.source,sourceName:c.id,requestId:`frozen-${c.id}-${repeat}-${arm}`,fvttVersion:'14.364',systemVersion:'5.3.3',
          renderMarkdown:ir=>renderEncounterActorSource(ir,[],c.source)};
        let result:any;
        try{
          const analysis=await analyzeBrowserActorSourceWithAi(input,provider);
          result={caseId:c.id,repeat,arm,status:analysis.status,findings:analysis.findings,errorCode:analysis.errorCode,ir:analysis.ir};
          if(analysis.status==='ready_to_generate'){
            const generation=await generateBrowserActorIntakeCandidate(input,analysis,provider);
            result={...result,status:generation.status,formalStatus:generation.formalStatus,findings:generation.findings,markdown:generation.markdown,actor:generation.actorProjection};
            if(generation.status==='ready_for_gm_review'){
              const bundle={schema:'fvtt-json-forge-encounter',version:1,id:`frozen-${c.id}-${repeat}-${arm}`.toLowerCase(),label:c.id,primaryActorKey:'actor-1',target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'},
                actors:[{key:'actor-1',label:c.id,source:generation.markdown,sourceHash:hash(generation.markdown!)}],macros:[],assets:[]};
              try{const prepared=await prepareForgeEncounter(JSON.stringify(bundle));result.packageStatus='prepared';result.packageHash=prepared.hash;}catch(error){result.packageStatus='blocked';result.packageError=String(error);}
              const actor=structuredClone(generation.actorProjection) as any;
              const activity=actor?.items?.flatMap((i:any)=>Object.values<any>(i.system?.activities??{})).find((a:any)=>a.damage?.parts?.length);
              if(activity){activity.damage.parts[0].number=99;result.tamperedActorRejected=verifyMonsterIntake(c.source,analysis.ir!,generation.markdown!,actor,candidate).findings.some(f=>f.blocking);}
            }
          }
        }catch(error){result={caseId:c.id,repeat,arm,status:'precondition-failed',error:String(error)};}
        // Inspect the same raw/identity-mapped form at the feature boundary.
        // This exposes capabilities masked by a different rejected feature;
        // it never changes the whole-candidate status or prepares partial IR.
        if(featureReply){
          const request={source:c.source,sourceSha256:c.sourceSha256,candidate};
          const sourcePlan=partition?assembleStagedLinePartition(request,partition):splitStagedMonsterSource(request);
          const baseIr=validateStagedBaseFacts(sourcePlan,base),decoded=decodeCategoryFormV2(featureReply,sourcePlan);
          result.featureDiagnostics=inspectCategoryFormV2(sourcePlan,baseIr,decoded).map(entry=>{
            const unit=sourcePlan.features.find(unit=>unit.id===entry.unitId)!;
            if(entry.error)return{unitId:unit.id,name:unit.name,status:'adapter-blocked',...entry.error};
            try{
              const feature=assembleStagedFeature(sourcePlan,unit,entry.proposal,baseIr.creature.identity.name,undefined,{sourceProvenSelfArea:true});
              const omissions=sourceFeatureBasicOmissions(unit.quote.trim(),feature);
              return{unitId:unit.id,name:unit.name,status:omissions.length?'omission-blocked':'feature-assembled-not-whole-accepted',omissions,feature};
            }catch(error){return{unitId:unit.id,name:unit.name,status:'assembly-blocked',error:String(error)};}
          });
          for(const entry of result.featureDiagnostics){
            if(entry.status==='feature-assembled-not-whole-accepted'&&/^(?:Toxic Emission|Weaverot Volley|Charm)$/u.test(entry.name)){
              const unit=sourcePlan.features.find(unit=>unit.id===entry.unitId)!,row=decoded.rows.find(row=>row.编号===unit.id)!;
              try{entry.formalCapability=await projectCapability(c,unit,row,base,provider);}
              catch(error){entry.formalCapability={scope:'derived-single-feature-capability-not-original-candidate',status:'blocked',error:String(error)};}
            }
          }
        }
        result.requests=requests;result.stages=stages;result.responseEvidenceCount=evidence.length;
        result.frozenReplyHashes=replyTexts.map(hash);
        result.identityMappings=identityMappings;result.sourcePartitionFixture=partition?'frozen-inventory-line-ownership':'existing-program-split';
        result.fixtureErrors=fixtureErrors;
        result.replayMode=arm==='BW'?(identityMappings.length?'frozen-whole-first-reply-with-explicit-identity-only-map':'exact-frozen-whole-first-reply'):'offline-merge-of-frozen-category-first-replies-not-measured-BW';
        result.baseFixtureOrigin=c.id==='R1'||c.id==='R2'?'saved-base-facts':'source-derived-header-fixture-not-model-response';
        results.push(result);
      }
    }
  }finally{globalThis.fetch=priorFetch;}
  if(JSON.stringify(codeBefore)!==JSON.stringify(implementationHashes()))throw Error('Implementation changed during replay');
  if(results.length!==cases.length*6||results.some(row=>row.fixtureErrors.length))throw Error('Replay coverage or fixture identity is incomplete');
  if(results.some(row=>row.status==='ready_for_gm_review'&&(row.packageStatus!=='prepared'||row.tamperedActorRejected!==true)))throw Error('An accepted source lacks package preparation or the independent tamper rejection');
  if(results.some(row=>row.featureDiagnostics?.some((feature:any)=>feature.formalCapability&&(feature.formalCapability.status!=='ready_for_gm_review'||feature.formalCapability.packageStatus!=='prepared'||feature.formalCapability.tamperedActorRejected!==true))))throw Error('A selected capability lacks the formal readback/package/tamper gate');
  const report={status:'OFFLINE_FORMAL_REPLAY',selectedCases:cases.map(c=>c.id),implementationHashes:codeBefore,modelHttp:0,fakeTransportCalls:transportCalls,frozenFiles,results};
  verifyFrozenFiles();
  if(outputDir){
    const target=resolve(outputDir),allowed=resolve('.local/forge-v2-bw-integration-20261020');
    if(target!==allowed)throw Error('Evidence output must stay in the exact task-owned directory');
    mkdirSync(target,{recursive:true});
    const path=join(target,`formal-replay-${new Date().toISOString().replace(/[:.]/gu,'-')}.json`);
    writeFileSync(path,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('Evidence: '+path);
  }
  return report;
}
if(import.meta.main){
  const report=await replayFrozenForms(process.env.FORGE_V2_BW_EVIDENCE_DIR);
  console.log(JSON.stringify({status:report.status,frozenFiles:report.frozenFiles,modelHttp:report.modelHttp,fakeTransportCalls:report.fakeTransportCalls,
    results:report.results.map(({caseId,repeat,arm,status,formalStatus,packageStatus,findings,error,stages,fixtureErrors}:any)=>({caseId,repeat,arm,status,formalStatus,packageStatus,
      findings:findings?.map((f:any)=>`${f.code} ${f.path}: ${f.message}`),error,stageCode:stages.at(-1)?.errorCode,fixtureErrors}))},null,2));
}

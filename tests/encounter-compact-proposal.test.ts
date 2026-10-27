import {afterEach,describe,expect,test} from 'bun:test';
import captured from './fixtures/forge-gazer-config-intake.json';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import {compileEncounterSelection,createEncounterAutomationProvider,renderEncounterActorSource,
  EncounterAutomationSelectionNeedsReviewError,type EncounterAutomationRequest} from '@fvtt-json-generator/intake-ai/encounter-automation';
import {encounterProposalContext,expandEncounterProposal,compactEncounterSelection} from '../packages/intake-ai/src/encounter-proposal';
import {compilerRejectionEvidence} from '../packages/intake-ai/src/encounter-compiler-evidence';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';
import {buildRatWarlockIr,RAT_WARLOCK_SOURCE} from '../src/core/intake/__tests__/fixtures/rat-warlock';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';

const fetchBefore=globalThis.fetch;
afterEach(()=>{globalThis.fetch=fetchBefore;});
const options={baseUrl:'https://provider.example',apiKey:'unit-secret-key',model:'test',structuredOutput:'json_object' as const};
async function gazerRequest(inputSource=captured.source,inputIr=captured.ir as MonsterIntakeIR):Promise<EncounterAutomationRequest>{
  const ir=structuredClone(inputIr);
  const feature=ir.creature.actions[4]!;
  const quote=ir.claims.find(claim=>claim.path==='/creature/actions/4')!.evidence[0]!.quote;
  const source=renderEncounterActorSource(ir,[{actorKey:'actor-1',section:'action',featureName:feature.name,quote,mechanicId:'pending-push',
    capabilityKind:'gm-manual',gmSteps:['GM uses the native save; the push is manual.',feature.description]}],inputSource);
  const converted=await convertMarkdownContentToJson({content:source,fvttVersion:'14',effectProfile:'core',translationService:null});
  if(!converted.rawJson)throw Error('Formal fixture generation failed');
  return {source:inputSource,actors:[{key:'actor-1',source:inputSource,ir,artifact:converted.rawJson}]};
}
function proposal(context:ReturnType<typeof encounterProposalContext>,name='Force Ray'):any{
  const feature=context.bindings.find(binding=>binding.feature.name===name)!;
  return {version:3,rules:[{featureRef:feature.ref,kind:'gm-manual',parameters:{},gmSteps:['GM rolls the native save.','GM manually resolves the complete push from the bound Item.']}],legendaryRecovery:[],unresolved:[]};
}
function fake(replies:any[],seen:any[]=[]){globalThis.fetch=(async(_url:string|URL|Request,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body));seen.push(body);
  const reply=replies.shift();return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(typeof reply==='function'?reply(body):reply)}}]}),{status:200});
}) as unknown as typeof fetch;}

describe('compact source-bound configuration handoff',()=>{
  test('the captured Gazer keeps its native data and compiles the AI-selected GM push after one provider request',async()=>{
    const request=await gazerRequest();const before=structuredClone(request);
    const context=encounterProposalContext(request,[]),value=proposal(context),seen:any[]=[];
    fake([value],seen);
    const actual=await createEncounterAutomationProvider(options).generate(request);
    expect(actual).toEqual(compileEncounterSelection(expandEncounterProposal(value,context),request));
    expect(seen).toHaveLength(1);expect(request).toEqual(before);
    expect(actual.rules[0]!.quote).toContain('STRENGTH SAVING THROW: DC 12');
    const item:any=(request.actors[0]!.artifact as any).items.find((item:any)=>item.name==='Force Ray');
    expect(Object.values(item.system.activities).filter((activity:any)=>activity.type==='save')).toHaveLength(1);
    expect(item.effects).toEqual([]);
  });
  test('changed source phrasing and explicit AI findings still go through the actual capability request',async()=>{
    const request=await gazerRequest();
    for(const mutate of [
      (value:any)=>{value.actors[0].source=value.actors[0].source.replace('25 (1d10 x 5)','25');},
      (value:any)=>{value.actors[0].ir.creature.actions[0].activationType='special';},
      (value:any)=>{value.actors[0].ir.creature.actions[0].uses={max:1,period:'day'};},
      (value:any)=>{value.findings=['An automatic trigger requires AI review.'];},
    ]){
      const changed=structuredClone(request);mutate(changed);
      const actor=changed.actors[0]!;actor.ir.source={sha256:hashSource(actor.source),length:actor.source.length};changed.source=actor.source;
      const context=encounterProposalContext(changed,[]),value=proposal(context),seen:any[]=[];fake([value],seen);
      const result=await createEncounterAutomationProvider(options).generate(changed);
      expect(seen).toHaveLength(1);
      const payload=JSON.parse(seen[0].messages[1].content);
      expect(payload.source).toBe(changed.source);
      expect(payload.findings).toEqual(changed.findings);
      expect(result.selection?.rules[0]?.kind).toBe('gm-manual');
    }
  });
  test.each([
    ['Repulsion','The creature must make a DC 12 Strength saving throw. FAILURE: The creature is pushed 10 feet away from the source.'],
    ['Gust','The target must make a\nSTRENGTH SAVING THROW: DC 12.\nFAILURE: The target is pushed 20 (2d4 x 5) feet away from the gazer.'],
  ])('%s uses an actual AI capability request and retains complete native semantics',async(name,description)=>{
    const ir=structuredClone(captured.ir) as MonsterIntakeIR;
    const ref=ir.claims.find(claim=>claim.path==='/creature/actions/4')!.evidence[0]!;
    const start=ref.start,end=ref.end,quote=`4. ${name}. ${description}`;
    const source=captured.source.slice(0,start)+quote+captured.source.slice(end),delta=quote.length-(end-start);
    const walk=(value:any):void=>{if(!value||typeof value!=='object')return;
      if(typeof value.start==='number'&&typeof value.end==='number'&&typeof value.quote==='string'){
        if(value.start>=end)value.start+=delta;if(value.end>=end)value.end+=delta;value.quote=source.slice(value.start,value.end);
      }for(const child of Object.values(value))walk(child);};walk(ir);
    const feature=ir.creature.actions[4]!;feature.name=name;feature.englishName=name;feature.description=description;
    for(const claim of ir.claims){if(claim.path==='/creature/actions/4')claim.value=structuredClone(feature);
      if(claim.path==='/creature/actions/4/description')claim.value=description;
      if(['/creature/actions/4/name','/creature/actions/4/englishName'].includes(claim.path))claim.value=name;}
    ir.source={...ir.source,sha256:hashSource(source),length:source.length};
    const request=await gazerRequest(source,ir),context=encounterProposalContext(request,[]),seen:any[]=[];
    fake([proposal(context,name)],seen);
    const result=await createEncounterAutomationProvider(options).generate(request);
    expect(seen).toHaveLength(1);expect(result.rules[0]!.featureName).toBe(name);
    expect(result.rules[0]!.quote).toContain(description);expect(result.selection!.rules[0]!.kind).toBe('gm-manual');
  });
  test('compact AI selection sends the complete source and native summaries, then restores tool-owned bindings',async()=>{
    const request=await gazerRequest();request.findings=['Verify this configuration against the complete source.'];
    const context=encounterProposalContext(request,[]),value=proposal(context),seen:any[]=[];
    fake([value],seen);
    const result=await createEncounterAutomationProvider(options).generate(request);
    expect(seen).toHaveLength(1);
    const payload=JSON.parse(seen[0].messages[1].content);
    expect(payload.source).toBe(request.source);
    expect(seen[0].messages[0].content).toContain('at least two separate');
    expect(seen[0].messages[0].content).not.toContain('"sourceEvidence":{}');
    expect(payload.actors[0].ir).toBeUndefined();expect(payload.actors[0].artifact).toBeUndefined();expect(payload.actors[0].source).toBeUndefined();
    expect(payload.actors[0].features.find((feature:any)=>feature.name==='Force Ray').native.activities[0].save.ability).toEqual(['str']);
    const oldPayload=JSON.stringify({source:request.source,actors:request.actors,configuredConditions:[]});
    expect(seen[0].messages[1].content.length).toBeLessThan(oldPayload.length*.5);
    expect(result).toEqual(compileEncounterSelection(expandEncounterProposal(value,context),request));
    const incomplete=structuredClone(value);incomplete.rules[0]!.gmSteps=incomplete.rules[0]!.gmSteps.slice(0,1);
    expect(()=>compileEncounterSelection(expandEncounterProposal(incomplete,context),request)).toThrow('GM adjudication requires');
    expect(result.selection!.rules[0]!.id).toBe('rule-feature-1-action-5');
    expect(result.rules[0]!.quote).toBe(context.bindings.find(binding=>binding.feature.name==='Force Ray')!.quote!);
    expect(result.command).toContain('"itemName":"Force Ray"');
  });
  test('unknown, duplicate, wrong kind and unresolved references stay blocked and rejection data identifies the field',async()=>{
    const request=await gazerRequest();request.findings=['Review configuration'];
    const context=encounterProposalContext(request,[]);
    for(const [edit,code,path] of [
      [(value:any)=>{value.rules[0].featureRef='feature-99-action-1';},'INVALID_FEATURE_REF','/rules/0/featureRef'],
      [(value:any)=>{value.rules.push(structuredClone(value.rules[0]));},'INVALID_FEATURE_REF','/rules/1/featureRef'],
      [(value:any)=>{value.rules[0].kind='arbitrary-script';},'INVALID_CAPABILITY','/rules/0/kind'],
      [(value:any)=>{value.unresolved=[{featureRef:value.rules[0].featureRef,reason:'Unknown source branch'}];},'UNRESOLVED_SOURCE_RULE','/unresolved'],
    ] as const){
      const value=proposal(context);edit(value);const seen:any[]=[],rejected:any[]=[];fake([value,value],seen);
      let caught:unknown;try{await createEncounterAutomationProvider({...options,autoCorrect:true,onCompilationRejected:e=>rejected.push(e)}).generate(request);}catch(error){caught=error;}
      expect(caught).toBeInstanceOf(EncounterAutomationSelectionNeedsReviewError);
      expect(rejected[0].diagnostic).toEqual(expect.objectContaining({code,path}));
      expect(rejected[0].proposal).toEqual(value);
      expect(seen).toHaveLength(code==='UNRESOLVED_SOURCE_RULE'?1:2);
    }
  });
  test('rejection snapshots redact credentials and stay bounded; secrets never enter the correction prior',async()=>{
    const request=await gazerRequest();request.findings=['Review configuration'];const context=encounterProposalContext(request,[]);
    const value=proposal(context);value.rules[0].gmSteps[0]=options.apiKey;
    const seen:any[]=[],records:any[]=[];fake([value,value],seen);
    await expect(createEncounterAutomationProvider({...options,autoCorrect:true,onCompilationRejected:e=>records.push(e)}).generate(request)).rejects.toBeInstanceOf(EncounterAutomationSelectionNeedsReviewError);
    expect(records).toHaveLength(2);expect(records[0].diagnostic.code).toBe('SENSITIVE_PROPOSAL');
    expect(JSON.stringify(records)).not.toContain(options.apiKey);
    expect(JSON.parse(seen[1].messages[1].content).prior).toBeUndefined();
    const bounded=compilerRejectionEvidence({huge:'x'.repeat(100_000),authorization:'Bearer another-secret'},new TypeError('Failure'),1,[options.apiKey]);
    expect(bounded.truncated).toBe(true);expect(JSON.stringify(bounded).length).toBeLessThan(49_000);
  });
  test('malformed configuration JSON retains bounded redacted data without a second request',async()=>{
    const request=await gazerRequest();request.findings=['Review configuration'];let calls=0;const records:any[]=[];
    globalThis.fetch=(async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'{"version":3,"apiKey":"another-secret","rules":['}}]}),{status:200});}) as unknown as typeof fetch;
    await expect(createEncounterAutomationProvider({...options,autoCorrect:true,onCompilationRejected:e=>records.push(e)}).generate(request)).rejects.toBeInstanceOf(EncounterAutomationSelectionNeedsReviewError);
    expect(calls).toBe(1);expect(records).toHaveLength(1);
    expect(records[0].proposal).toContain('"version":3');
    expect(records[0].proposal).not.toContain('another-secret');
    expect(records[0].proposal).toContain('[redacted]');
  });
  test('caller prior and reciprocal reference parameters roundtrip through the same compact protocol',async()=>{
    const request=await gazerRequest(),context=encounterProposalContext(request,[]);
    const f1=context.bindings[0]!,f2=context.bindings[1]!;
    const prior:any={version:2,name:'Existing control',notes:'',manualSteps:[],legendaryRecovery:[],rules:[
      {id:'ward-old',kind:'threshold-ward',actorKey:f1.actorKey,featureName:f1.feature.name,section:f1.section,quote:f1.quote,gmSteps:['Read source'],parameters:{threshold:10,fullReduction:'half-floor',weakenedReduction:'proficiency',breakRuleId:'break-old'}},
      {id:'break-old',kind:'ward-break',actorKey:f2.actorKey,featureName:f2.feature.name,section:f2.section,quote:f2.quote,gmSteps:['Read source'],parameters:{wardRuleId:'ward-old',until:'own-next-turn-start',whenDepleted:'weakened'}},
    ]};
    const compact:any=compactEncounterSelection(prior,context),expanded:any=expandEncounterProposal(compact,context);
    expect(compact.rules[0].parameters.breakRuleId).toBe(f2.ref);
    expect(expanded.rules[0].parameters.breakRuleId).toBe(expanded.rules[1].id);
    expect(expanded.rules[1].parameters.wardRuleId).toBe(expanded.rules[0].id);
    request.prior={version:1,name:'Existing',notes:'',rules:[],manualSteps:[],command:'',selection:prior};request.findings=['ward-old requires correction'];
    const seen:any[]=[];fake([{version:3,rules:[],legendaryRecovery:[],unresolved:[]}],seen);
    await createEncounterAutomationProvider(options).generate(request);
    const payload=JSON.parse(seen[0].messages[1].content);
    expect(payload.prior).toEqual(compact);
    expect(payload.priorRuleReferences).toContainEqual({id:'ward-old',featureRef:f1.ref});
  });
  test('a structurally valid legacy proposal with a stale carrier still receives the one bounded correction',async()=>{
    const request=await gazerRequest();request.findings=['Review configuration'];const context=encounterProposalContext(request,[]);
    const correct=proposal(context),legacy:any=expandEncounterProposal(correct,context);legacy.rules[0].featureName='Missing carrier';
    const seen:any[]=[],records:any[]=[];fake([legacy,correct],seen);
    const result=await createEncounterAutomationProvider({...options,autoCorrect:true,onCompilationRejected:e=>records.push(e)}).generate(request);
    expect(seen).toHaveLength(2);expect(records).toHaveLength(1);
    expect(records[0].diagnostic.path).toBe('/rules/0/featureName');
    expect(JSON.parse(seen[1].messages[1].content).prior).toBeUndefined();
    expect(result.rules[0]!.featureName).toBe('Force Ray');
  });
  test('a native automatic area capability remains automatic and retains its complete parameters',async()=>{
    const ir=buildValidLurkerIr();
    const description='At its turn start, Pulse affects all other creatures within 15 feet. Each makes a DC 13 Dexterity save, taking 2d6 piercing on failure and no damage on success.';
    const quote=`Pulse. ${description}`,source=`${LURKER_SOURCE}\n\n${quote}`,start=source.indexOf(quote);
    ir.creature.actions=[{name:'Pulse',description,activityType:'save',activationType:'special',save:{dc:13,ability:'dex'},aoe:{shape:'sphere',radius:15},
      damage:[{formula:'2d6',type:'piercing',relationship:'base'}],evidence:[{start,end:start+quote.length,quote}]}];
    ir.source={sha256:hashSource(source),length:source.length};
    const formal=await convertMarkdownContentToJson({content:renderEncounterActorSource(ir,[],source),fvttVersion:'14',effectProfile:'core',translationService:null});
    const request={source,actors:[{key:'one',source,ir,artifact:formal.rawJson}]},context=encounterProposalContext(request,[]);
    const value=proposal(context,'Pulse');value.rules[0].kind='turn-start-area';value.rules[0].parameters={radiusFeet:15,excludeSelf:true,aliveOnly:true};
    const before=structuredClone(formal.rawJson),seen:any[]=[];fake([value],seen);
    const compiled=await createEncounterAutomationProvider(options).generate(request);
    expect(seen).toHaveLength(1);expect(compiled.selection!.rules[0]!.kind).toBe('turn-start-area');
    expect(compiled.selection!.rules[0]!.parameters).toEqual(value.rules[0].parameters);
    expect(formal.rawJson).toEqual(before);
    const bad=structuredClone(value);bad.rules[0].parameters.radiusFeet=20;
    expect(()=>compileEncounterSelection(expandEncounterProposal(bad,context),request)).toThrow('radius');
    const cross={...context.bindings.find(binding=>binding.feature.name==='Pulse')!,ref:'feature-2-action-1',actorKey:'other'};
    context.bindings.push(cross);bad.rules[0].parameters.radiusFeet=15;bad.rules[0].parameters.followupRuleId=cross.ref;
    expect(()=>expandEncounterProposal(bad,context)).toThrow('same actor');
  });
  test('exact prose references distinguish feature 1 from feature 10 and do not reprocess inserted names',async()=>{
    const request=await gazerRequest();const context=encounterProposalContext(request,[]);
    const first=context.bindings.find(binding=>binding.feature.name==='Force Ray')!;
    const tenth={...first,ref:'feature-1-action-10',feature:{...first.feature,name:'Tenth ability'}};
    context.bindings.push(tenth);first.feature={...first.feature,name:'Name containing feature-1-action-10'};
    const value=proposal(context,first.feature.name);value.rules[0].gmSteps=[`Read ${first.ref} and ${tenth.ref}.`,'GM handles the rule.'];
    const expanded:any=expandEncounterProposal(value,context);
    expect(expanded.rules[0].gmSteps[0]).toBe('Read Name containing feature-1-action-10 and Tenth ability.');
  });
  test('spellcasting carriers keep trait binding and a distinct source reference',async()=>{
    const ir=buildRatWarlockIr(),profile=ir.creature.spellcasting![0]!;
    const source=renderEncounterActorSource(ir,[],RAT_WARLOCK_SOURCE);
    const formal=await convertMarkdownContentToJson({content:source,fvttVersion:'14',effectProfile:'core',translationService:null});
    const request={source:RAT_WARLOCK_SOURCE,actors:[{key:'caster',source:RAT_WARLOCK_SOURCE,ir,artifact:formal.rawJson}]};
    const context=encounterProposalContext(request,[]),binding=context.bindings.find(binding=>binding.ref==='feature-1-spellcasting-1')!;
    expect(binding.section).toBe('trait');expect(binding.feature.name).toBe(profile.featureName);expect(binding.quote).toBeTruthy();
    const value=proposal(context,profile.featureName);
    const compiled=compileEncounterSelection(expandEncounterProposal(value,context),request);
    expect(compiled.rules[0]!.featureName).toBe(profile.featureName);
    expect(compiled.rules[0]!.section).toBe('trait');
  });
  test('41 manual rules preserve per-rule steps without exceeding the existing global step limit',async()=>{
    const ir=buildValidLurkerIr();let source=LURKER_SOURCE;
    for(let index=1;index<=41;index++){
      const name=`Manual rule ${index}`,description='The GM resolves this unusual consequence from the source.',quote=`${name}. ${description}`,start=source.length+2;
      source+=`\n\n${quote}`;ir.creature.actions.push({name,description,activityType:'utility',evidence:[{start,end:start+quote.length,quote}]});
    }
    ir.source={sha256:hashSource(source),length:source.length};
    const formal=await convertMarkdownContentToJson({content:renderEncounterActorSource(ir,[],source),fvttVersion:'14',effectProfile:'core',translationService:null});
    const request={source,actors:[{key:'one',source,ir,artifact:formal.rawJson}]},context=encounterProposalContext(request,[]);
    const values=context.bindings.filter(binding=>binding.feature.name.startsWith('Manual rule ')).map(binding=>({featureRef:binding.ref,kind:'gm-manual',parameters:{},gmSteps:['GM reads complete source.','GM manually resolves its consequence.']}));
    const compiled=compileEncounterSelection(expandEncounterProposal({version:3,rules:values,legendaryRecovery:[],unresolved:[]},context),request);
    expect(compiled.rules).toHaveLength(41);expect(compiled.manualSteps).toHaveLength(1);
    expect(compiled.rules.every(rule=>rule.gmSteps.length===2)).toBe(true);
  });
});

import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { compileEncounterSelection, compileEncounterSelectionSourceAudit, renderEncounterActorSource, encounterStagedConditionRequirements, encounterManualConditionRequirements, EncounterAutomationSelectionNeedsReviewError } from '@fvtt-json-generator/intake-ai/encounter-automation';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import { decodeEncounterRuntimeConfiguration } from '@fvtt-json-generator/intake-ai/encounter-capabilities';
import { prepareForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { serializeForgeEncounterPackage } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { generateEncounterFromHumanMarkdown } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';
import { LURKER_SOURCE, buildValidLurkerIr } from '../src/core/intake/__tests__/fixtures/lurker';
import { RAT_WARLOCK_SOURCE, buildRatWarlockIr } from '../src/core/intake/__tests__/fixtures/rat-warlock';

function fixture(name:string,description:string,conditions:any[]){
  const source=`${LURKER_SOURCE}\n\n${name}. ${description}`;
  const quote={start:LURKER_SOURCE.length+2,end:source.length,quote:source.slice(LURKER_SOURCE.length+2)};
  const ir=buildValidLurkerIr();
  const index=ir.creature.actions.length;
  ir.source={sha256:hashSource(source),length:source.length};
  ir.creature.actions.push({name,description,activityType:'save',activationType:'action',save:{dc:13,ability:'wis'},appliedConditions:conditions,evidence:[quote]});
  ir.claims.push({path:`/creature/actions/${index}`,valueKind:'explicit',confidence:'high',evidence:[quote]});
  ir.coverage.push({...quote,classification:'mechanical',claimPaths:[`/creature/actions/${index}`]});
  const selection={version:2,name:'Source adjudication',notes:'Special consequences are resolved by GM, not automatically.',manualSteps:['GM handles special results from the original rule.'],legendaryRecovery:[],
    rules:[{id:'manual',kind:'gm-manual',actorKey:'actor-1',featureName:name,section:'action',quote:quote.quote,parameters:{},gmSteps:['GM reads the complete source and rolls the native save.','GM adjudicates and applies/ends the stated consequences; no automatic special effect.']}]};
  return {source,ir,selection,index};
}
async function preparedCase(name:string,description:string,conditions:any[]){
  const {source,ir,selection,index}=fixture(name,description,conditions);
  const initialSource=renderEncounterActorSource(ir,[],source);
  const initial=await convertMarkdownContentToJson({content:initialSource,fvttVersion:'14',effectProfile:'core',translationService:null});
  const automation=compileEncounterSelection(selection,{source,actors:[{key:'actor-1',source,ir,artifact:initial.rawJson}]});
  const rules=automation.rules.map((rule,i)=>({...rule,mechanicId:`encounter-rule-${i+1}`,capabilityKind:automation.selection!.rules[i]!.kind}));
  const finalSource=renderEncounterActorSource(ir,rules,source);
  const covers=[...rules.map(rule=>({actorKey:'actor-1',mechanicId:rule.mechanicId})),...encounterStagedConditionRequirements(ir,source).map(rule=>({actorKey:'actor-1',mechanicId:rule.mechanicId})),...encounterManualConditionRequirements(ir,rules).map(rule=>({actorKey:'actor-1',mechanicId:rule.mechanicId}))];
  const bundle:any={schema:'fvtt-json-forge-encounter',version:1,id:'gm-manual-test',label:'GM adjudication',target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'},primaryActorKey:'actor-1',
    actors:[{key:'actor-1',label:'Source actor',source:finalSource,sourceHash:hashSource(finalSource)}],macros:[{key:'control',name:automation.name,command:automation.command,commandHash:hashSource(automation.command),bindings:{'actor-1':'actor-1'},covers,notes:automation.notes}],assets:[]};
  const prepared=await prepareForgeEncounter(serializeForgeEncounterPackage(bundle));
  return {source,ir,index,finalSource,bundle,prepared};
}

describe('source-complete GM adjudication',()=>{
  const cases=[
    ['Margin Charm','Target makes a DC 13 Wisdom save. Failure: Charmed. Failure by 5 or more: Dominated.',[{statuses:['charmed'],condition:'Failure'},{statuses:['dominated'],condition:'Failure by 5 or more',staged:true}]],
    ['Sleep Pulse','Target makes a DC 13 Wisdom save. Failure: Unconscious for one minute; damage or an action wakes it.',[{statuses:['unconscious'],condition:'Failure',duration:'one minute'}]],
    ['Dazed Pulse','Target makes a DC 13 Wisdom save. Failure: Dazed for one minute, repeating the save at each turn end.',[{statuses:['dazed'],condition:'Failure',duration:'one minute'}]],
    ['Slow Pulse','Target makes a DC 13 Wisdom save. On a failed save, the target is Slowed for one minute.',[{statuses:['slowed'],condition:'Failure',duration:'one minute'}]],
    ['Weak Pulse','Target makes a DC 13 Wisdom save. On a failed save, the target is Enfeebled for one minute.',[{statuses:['enfeebled'],condition:'Failure',duration:'one minute'}]],
    ['Alias Slow Pulse','Target makes a DC 13 Wisdom save. On a failed save, the target is Slowed for one minute.',[{statuses:['减速'],condition:'Failure',duration:'one minute'}]],
    ['Bilingual Weak Pulse','Target makes a DC 13 Wisdom save. On a failed save, the target is Enfeebled for one minute.',[{statuses:['衰弱 Enfeebled'],condition:'Failure',duration:'one minute'}]],
  ] as const;
  for(const [name,description,conditions] of cases){
    test(`${name} keeps native Save and complete rules, without applying special conditions`,async()=>{
      const data=await preparedCase(name,description,structuredClone(conditions) as any);
      const item=(data.prepared.actors[0]!.artifact.items as any[]).find(item=>item.name===name);
      expect(item.effects).toEqual([]);
      const saves=Object.values(item.system.activities).filter((activity:any)=>activity.type==='save') as any[];
      expect(saves).toHaveLength(1);
      expect(saves[0].save).toEqual({ability:['wis'],dc:{calculation:'',formula:'13'}});
      expect(saves[0].effects??[]).toEqual([]);
      expect(saves[0].description.chatFlavor).toBe(`<p>${description}</p>`);
      const report=verifyMonsterIntake(data.source,data.ir,data.finalSource,data.prepared.actors[0]!.artifact);
      const expectedDiagnostics = name === 'Margin Charm'
        ? [{code:'INVALID_STRUCTURE',path:'/creature/actions/2/appliedConditions/1/statuses/0'}]
        : ['Alias Slow Pulse','Bilingual Weak Pulse'].includes(name)
          ? [{code:'INVALID_STRUCTURE',path:'/creature/actions/2/appliedConditions/0/statuses/0'}]
          : [...(name === 'Sleep Pulse' ? [{code:'ACTOR_CONDITION_DRIFT',path:'/creature/actions/2/appliedConditions/0'}] : []),
            {code:'MARKDOWN_IR_PROJECTION_DRIFT',path:'/markdown/动作/2/内嵌效果'}];
      expect(report.status).toBe('needs_review');
      expect(report.findings.filter(finding=>finding.blocking).map(({code,path})=>({code,path}))).toEqual(expectedDiagnostics);
      const ordinary=(data.prepared.actors[0]!.artifact.items as any[]).find(item=>item.name.includes('爪击'));
      expect(ordinary.effects.some((effect:any)=>effect.statuses.includes('grappled'))).toBe(true);
      const unbound=structuredClone(data.bundle);unbound.macros[0].covers.pop();
      const retained=await prepareForgeEncounter(serializeForgeEncounterPackage(unbound));
      expect(retained.actors).toHaveLength(1);
      if(!retained.reviewFindings)throw new Error('Expected unbound-controller review findings.');
      expect(retained.reviewFindings.join(' ')).toContain('没有唯一配套控制');
      expect(retained.actors[0]!.artifact.items).toEqual(data.prepared.actors[0]!.artifact.items);
    });
  }
  test('single-Actor staged rules retain the complete candidate and diagnostics without automatic AI review',async()=>{
    const data=fixture('Margin Charm','Target makes a DC 13 Wisdom save. Failure: Charmed. Failure by 5 or more: Dominated.',[{statuses:['charmed'],condition:'Failure'},{statuses:['dominated'],condition:'Failure by 5 or more',staged:true}]);
    let reviewCalls=0,automationCalls=0;
    const provider:any={providerName:'fixture',extractionModel:'fixture',reviewModel:'fixture',discover:async()=>({schemaVersion:1,candidates:[{id:'one',label:'One source actor',start:0,end:data.source.length,quote:data.source}]}),extract:async()=>data.ir,repair:async()=>{throw Error('No automatic repair');},review:async()=>{reviewCalls++;throw Error('No automatic review');}};
    const automationProvider:any={generate:async()=>{automationCalls++;throw Error('Unresolved Actor findings retain the native candidate');},review:async()=>{reviewCalls++;throw Error('No automatic review');}};
    const result=await generateEncounterFromHumanMarkdown({source:data.source,label:'One creature',provider,automationProvider});
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.report.generationRoute).toBe('actors-only');
    expect(result.prepared?.actors).toHaveLength(1);
    expect(result.report.automation).toBeUndefined();
    expect(result.report.automationReview).toEqual({status:'not_requested'});
    expect(result.report.actors[0]?.generation?.formalStatus).toBe('needs_review');
    expect(result.report.actors[0]?.generation?.findings).toContainEqual(expect.objectContaining({code:'INVALID_STRUCTURE',path:'/creature/actions/2/appliedConditions/1/statuses/0'}));
    const item=(result.prepared!.actors[0]!.artifact.items as any[]).find(item=>item.name==='Margin Charm');
    expect(item.system.description.value).toContain(data.ir.creature.actions.at(-1)!.description);
    expect(Object.values(item.system.activities)).toContainEqual(expect.objectContaining({type:'save',save:{ability:['wis'],dc:{calculation:'',formula:'13'}}}));
    expect(reviewCalls).toBe(0);expect(automationCalls).toBe(0);
  });
  test('an unsupported condition retains the native Save, complete rule and a GM-only manual requirement',async()=>{
    const data=fixture('Curse Tide','The target makes a DC 13 Wisdom save. On a failed save, the target is Cursed for one minute.',[{statuses:['cursed'],condition:'Failure',duration:'one minute'}]);
    let actorReviews=0,automationCalls=0;
    const provider:any={providerName:'fixture',extractionModel:'fixture',reviewModel:'fixture',
      discover:async()=>({schemaVersion:1,candidates:[{id:'one',label:'One source actor',start:0,end:data.source.length,quote:data.source}]}),
      extract:async()=>data.ir,repair:async()=>{throw Error('No automatic repair');},review:async()=>{actorReviews++;throw Error('No automatic review');}};
    const automationProvider:any={generate:async()=>{automationCalls++;throw Error('No configuration for an unresolved Actor');},review:async()=>{throw Error('No automatic review');}};
    const result=await generateEncounterFromHumanMarkdown({source:data.source,label:'Curse case',provider,automationProvider});
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.report.generationRoute).toBe('actors-only');
    expect(automationCalls).toBe(0);expect(actorReviews).toBe(0);
    expect(result.report.actors[0]?.generation?.formalStatus).toBe('needs_review');
    expect(result.report.actors[0]?.generation?.findings).toContainEqual(expect.objectContaining({code:'INVALID_STRUCTURE',path:'/creature/actions/2/appliedConditions/0/statuses/0'}));
    expect(result.report.actors[0]?.analysis.ir?.creature.actions.at(-1)?.appliedConditions?.[0]?.statuses).toEqual(['cursed']);
    const item=(result.prepared!.actors[0]!.artifact.items as any[]).find(item=>item.name==='Curse Tide');
    expect(item.effects).toEqual([]);
    expect(Object.values(item.system.activities)).toContainEqual(expect.objectContaining({type:'save',save:{ability:['wis'],dc:{calculation:'',formula:'13'}},description:expect.objectContaining({chatFlavor:`<p>${data.ir.creature.actions.at(-1)!.description}</p>`})}));
    expect(result.prepared!.macros).toEqual([]);
    expect(result.prepared!.requirements).toContainEqual(expect.objectContaining({name:'Curse Tide',mode:'gm-assisted',gmSteps:expect.arrayContaining([data.ir.creature.actions.at(-1)!.description])}));
    const findings=result.prepared!.reviewFindings;
    if(!findings)throw new Error('Expected retained manual-condition review findings.');
    expect(findings.join(' ')).toContain('没有唯一配套控制');
  });
  test('native non-staged condition retains its ordinary Actor effect in the real intake entry',async()=>{
    const data=fixture('Charm Tide','The target makes a DC 13 Wisdom save. On a failed save, the target is Charmed for one minute.',[{statuses:['charmed'],condition:'Failure',duration:'one minute'}]);
    const selection={...data.selection,rules:[]};
    const provider:any={providerName:'fixture',extractionModel:'fixture',reviewModel:'fixture',
      discover:async()=>({schemaVersion:1,candidates:[{id:'one',label:'One source actor',start:0,end:data.source.length,quote:data.source}]}),
      extract:async()=>data.ir,repair:async()=>data.ir,review:async()=>({schemaVersion:1,verdict:'accepted',findings:[]})};
    const result=await generateEncounterFromHumanMarkdown({source:data.source,label:'Native case',provider,
      automationProvider:{generate:async(request:any)=>compileEncounterSelection(selection,request),review:async()=>({verdict:'accepted',findings:[]})}});
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.report.actors[0]?.generation?.findings.map(f=>f.code)).not.toContain('ACTOR_CONDITION_REQUIRES_GM');
    const items=result.prepared?.actors[0]?.artifact.items;
    if(!Array.isArray(items))throw new Error('Expected prepared Actor items.');
    const item=(items as Array<{name:string;effects:Array<{statuses:string[]}>}>).find(entry=>entry.name==='Charm Tide');
    expect(item?.effects.some((effect:any)=>effect.statuses.includes('charmed'))).toBe(true);
  });
  test('a typed automation selection failure retains both completed Actor candidates and the exact configuration finding',async()=>{
    const source=`${LURKER_SOURCE}${RAT_WARLOCK_SOURCE}`;
    let automationCalls=0,reviewCalls=0;
    const provider:any={providerName:'fixture',extractionModel:'fixture',reviewModel:'fixture',
      discover:async()=>({schemaVersion:1,candidates:[{id:'lurker',label:'Lurker',start:0,end:LURKER_SOURCE.length,quote:LURKER_SOURCE},{id:'rat',label:'Rat',start:LURKER_SOURCE.length,end:source.length,quote:RAT_WARLOCK_SOURCE}]}),
      extract:async(request:any)=>request.source===LURKER_SOURCE?buildValidLurkerIr():buildRatWarlockIr(),
      repair:async()=>{throw Error('No automatic repair');},review:async()=>{reviewCalls++;throw Error('No automatic review');}};
    const result=await generateEncounterFromHumanMarkdown({source,label:'Selection review',provider,
      automationProvider:{generate:async()=>{automationCalls++;throw new EncounterAutomationSelectionNeedsReviewError('Source-bound configuration remains unresolved.');},
        review:async()=>{reviewCalls++;throw Error('No automatic review');}}});
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.report.generationRoute).toBe('actors-only');
    expect(result.report.findings).toContain('Source-bound configuration remains unresolved.');
    expect(result.report.findings.join(' ')).toContain('原生候选与完整来源仍可获取');
    expect(result.prepared?.actors).toHaveLength(2);
    expect(result.prepared!.actors.map(actor=>actor.artifact.name)).toEqual(['暗影潜妖 Lurker in the Dark','鼠神邪术师 Warlock of the Rat God']);
    expect(result.prepared!.macros).toEqual([]);
    expect(result.report.actors.every(actor=>actor.generation?.candidateAvailable===true)).toBe(true);
    expect(automationCalls).toBe(1);expect(reviewCalls).toBe(0);
  });
  test('source-identity and controller binding errors remain explicit while the readable Actor is retained',async()=>{
    const data=fixture('Curse Tide','The target makes a DC 13 Wisdom save. On a failed save, the target is Cursed for one minute.',[{statuses:['cursed'],condition:'Failure',duration:'one minute'}]);
    const initial=await convertMarkdownContentToJson({content:renderEncounterActorSource(data.ir,[],data.source),fvttVersion:'14',effectProfile:'core',translationService:null});
    const request={source:data.source,actors:[{key:'actor-1',source:data.source,ir:data.ir,artifact:initial.rawJson}]};
    const invalid=structuredClone(data.ir);invalid.source.sha256='0'.repeat(64);
    expect(()=>compileEncounterSelection(data.selection,{...request,actors:[{...request.actors[0]!,ir:invalid}]})).toThrow('source identity differs');
    const wrongActor=structuredClone(data.selection);wrongActor.rules[0]!.actorKey='actor-2';
    expect(()=>compileEncounterSelection(wrongActor,request)).toThrow('actorKey does not reference an encounter actor');
    const automatic=structuredClone(data.selection);automatic.rules[0]!.kind='save-failure-effect';
    automatic.rules[0]!.parameters={effect:'blinded',expiry:'next-source-turn-start',minFailureMargin:1,removeOnDamage:false};
    expect(()=>compileEncounterSelectionSourceAudit(automatic,request)).toThrow();
    const wrongCarrier=structuredClone(request);(wrongCarrier.actors[0]!.artifact as any).items=[];
    expect(()=>compileEncounterSelection(data.selection,wrongCarrier)).toThrow('Capability carrier must match one formally generated Item');
    const wrongSave=structuredClone(request);
    const item=(wrongSave.actors[0]!.artifact as any).items.find((item:any)=>item.name==='Curse Tide');
    Object.values(item.system.activities).forEach((activity:any)=>{if(activity.type==='save')activity.save.dc.formula='99';});
    expect(()=>compileEncounterSelection(automatic,wrongSave)).toThrow('Generated Save Activity DC or ability differs from the AI IR');
    let repairCalls=0,reviewCalls=0;
    const provider:any={providerName:'fixture',extractionModel:'fixture',reviewModel:'fixture',
      discover:async()=>({schemaVersion:1,candidates:[{id:'one',label:'Source Actor',start:0,end:data.source.length,quote:data.source}]}),extract:async()=>invalid,
      repair:async()=>{repairCalls++;throw Error('No automatic repair');},review:async()=>{reviewCalls++;throw Error('No automatic review');}};
    const result=await generateEncounterFromHumanMarkdown({source:data.source,label:'Invalid source metadata',provider,automationProvider:{generate:async()=>{throw Error('No controller');},review:async()=>{throw Error('No review');}}});
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.prepared?.actors).toHaveLength(1);
    expect(result.report.actors[0]!.generation!.findings).toContainEqual(expect.objectContaining({code:'FIELD_PROJECTION_INCOMPLETE',message:'来源技术记录已按本次输入重建；原记录保留。'}));
    expect(result.report.actors[0]!.generation!.formalStatus).toBe('needs_review');
    expect(repairCalls).toBe(0);expect(reviewCalls).toBe(0);
  });
  test('cancellation during extraction does not create a prepared package or start review',async()=>{
    const data=fixture('Curse Tide','The target makes a DC 13 Wisdom save. On a failed save, the target is Cursed for one minute.',[{statuses:['cursed'],condition:'Failure',duration:'one minute'}]);
    const controller=new AbortController();
    const provider:any={providerName:'fixture',extractionModel:'fixture',reviewModel:'fixture',
      discover:async()=>({schemaVersion:1,candidates:[{id:'one',label:'Source Actor',start:0,end:data.source.length,quote:data.source}]}),
      extract:async()=>{controller.abort();return data.ir;},repair:async()=>{throw Error('No repair');},review:async()=>{throw Error('No review');}};
    const result=await generateEncounterFromHumanMarkdown({source:data.source,label:'Cancelled',provider,signal:controller.signal,
      automationProvider:{generate:async()=>{throw Error('No controller');},review:async()=>{throw Error('No review');}}});
    expect(result.report.status).toBe('failed');expect(result.prepared).toBeUndefined();
    expect(result.report.findings.join(' ')).toContain('任务已取消');
  });
  test('empty manual parameters cannot accept code or effect paths',()=>{
    expect(()=>decodeEncounterRuntimeConfiguration({version:1,rules:[{id:'bad',kind:'gm-manual',actorKey:'one',itemName:'Sleep',parameters:{script:'alert(1)'}}],legendaryRecovery:[]})).toThrow('unsupported fields');
  });
});

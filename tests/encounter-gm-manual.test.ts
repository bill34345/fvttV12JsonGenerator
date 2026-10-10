import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { compileEncounterSelection, renderEncounterActorSource, encounterStagedConditionRequirements, encounterManualConditionRequirements, EncounterAutomationSelectionNeedsReviewError } from '@fvtt-json-generator/intake-ai/encounter-automation';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import { decodeEncounterRuntimeConfiguration } from '@fvtt-json-generator/intake-ai/encounter-capabilities';
import { prepareForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { serializeForgeEncounterPackage } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { generateEncounterFromHumanMarkdown } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';
import { LURKER_SOURCE, buildValidLurkerIr } from '../src/core/intake/__tests__/fixtures/lurker';

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
    ['Bilingual Weak Pulse','Target makes a DC 13 Wisdom save. On a failed save, the target is Enfeebled for one minute.',[{statuses:['衰弱 (Enfeebled)'],condition:'Failure',duration:'one minute'}]],
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
      expect(saves[0].description.chatFlavor).toBe(description);
      const report=verifyMonsterIntake(data.source,data.ir,data.finalSource,data.prepared.actors[0]!.artifact);
      expect(report.findings.filter(finding=>finding.blocking).every(finding=>['ACTOR_STAGED_CONDITION_REQUIRES_COMPANION','ACTOR_CONDITION_REQUIRES_GM'].includes(finding.code))).toBe(true);
      const ordinary=(data.prepared.actors[0]!.artifact.items as any[]).find(item=>item.name.includes('爪击'));
      expect(ordinary.effects.some((effect:any)=>effect.statuses.includes('grappled'))).toBe(true);
      const unbound=structuredClone(data.bundle);unbound.macros[0].covers.pop();
      await expect(prepareForgeEncounter(serializeForgeEncounterPackage(unbound))).rejects.toThrow('唯一配套宏');
    });
  }
  test('single-Actor encounter uses current source validation and reviews both Actor and manual configuration',async()=>{
    const data=fixture('Margin Charm','Target makes a DC 13 Wisdom save. Failure: Charmed. Failure by 5 or more: Dominated.',[{statuses:['charmed'],condition:'Failure'},{statuses:['dominated'],condition:'Failure by 5 or more',staged:true}]);
    const provider:any={providerName:'fixture',extractionModel:'fixture',reviewModel:'fixture',discover:async()=>({schemaVersion:1,candidates:[{id:'one',label:'One source actor',start:0,end:data.source.length,quote:data.source}]}),extract:async()=>data.ir,repair:async()=>data.ir,review:async()=>({schemaVersion:1,verdict:'accepted',findings:[]})};
    const automationProvider:any={generate:async(request:any)=>compileEncounterSelection(data.selection,request),review:async()=>({verdict:'accepted',findings:[]})};
    const result=await generateEncounterFromHumanMarkdown({source:data.source,label:'One reviewed creature',provider,automationProvider});
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.prepared?.actors).toHaveLength(1);
    expect(result.report.automation?.selection?.rules[0]?.kind).toBe('gm-manual');
  });
  test('unsupported non-staged condition reaches automation only after source-complete Actor review and requires the final manual binding',async()=>{
    const data=fixture('Curse Tide','The target makes a DC 13 Wisdom save. On a failed save, the target is Cursed for one minute.',[{statuses:['cursed'],condition:'Failure',duration:'one minute'}]);
    let actorReviews=0,automationCalls=0;
    const provider:any={providerName:'fixture',extractionModel:'fixture',reviewModel:'fixture',
      discover:async()=>({schemaVersion:1,candidates:[{id:'one',label:'One source actor',start:0,end:data.source.length,quote:data.source}]}),
      extract:async()=>data.ir,repair:async()=>data.ir,review:async()=>{actorReviews++;return {schemaVersion:1,verdict:'accepted',findings:[]};}};
    const automationProvider:any={generate:async(request:any)=>{automationCalls++;expect(actorReviews).toBe(1);return compileEncounterSelection(data.selection,request);},
      review:async()=>({verdict:'accepted',findings:[]})};
    const result=await generateEncounterFromHumanMarkdown({source:data.source,label:'Curse case',provider,automationProvider});
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(automationCalls).toBe(1);
    expect(result.report.actors[0]?.generation?.findings.map(f=>f.code)).toContain('ACTOR_CONDITION_REQUIRES_GM');
    expect(result.report.actors[0]?.generation?.findings.map(f=>f.code)).not.toContain('ACTOR_CONDITION_DRIFT');
    expect(result.report.actors[0]?.analysis.ir?.creature.actions.at(-1)?.appliedConditions?.[0]?.statuses).toEqual(['cursed']);
    const curseItems=result.prepared?.actors[0]?.artifact.items;
    if(!Array.isArray(curseItems))throw new Error('Expected prepared Actor items.');
    const curseItem=(curseItems as Array<{name:string;effects:unknown[];system:{activities:Record<string,{description:{chatFlavor:string}}>}}>).find(item=>item.name==='Curse Tide');
    expect(curseItem?.effects).toEqual([]);
    expect(curseItem?.system.activities && Object.values(curseItem.system.activities).some((activity:any)=>activity.description.chatFlavor===data.ir.creature.actions.at(-1)?.description)).toBe(true);
    const absent=structuredClone(data.selection);absent.rules=[];
    const blocked=await generateEncounterFromHumanMarkdown({source:data.source,label:'Curse case',provider,
      automationProvider:{...automationProvider,generate:async(request:any)=>compileEncounterSelection(absent,request)}});
    expect(blocked.report.status).toBe('needs_review');
    expect(blocked.prepared).toBeUndefined();
    expect(blocked.report.findings.join(' ')).toContain('缺少来源绑定');
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
  test('a typed automation selection failure retains completed Actor evidence for GM review',async()=>{
    const data=fixture('Charm Tide','The target makes a DC 13 Wisdom save. On a failed save, the target is Charmed for one minute.',[{statuses:['charmed'],condition:'Failure',duration:'one minute'}]);
    const provider:any={providerName:'fixture',extractionModel:'fixture',reviewModel:'fixture',
      discover:async()=>({schemaVersion:1,candidates:[{id:'one',label:'One source actor',start:0,end:data.source.length,quote:data.source}]}),
      extract:async()=>data.ir,repair:async()=>data.ir,review:async()=>({schemaVersion:1,verdict:'accepted',findings:[]})};
    const result=await generateEncounterFromHumanMarkdown({source:data.source,label:'Selection review',provider,
      automationProvider:{generate:async()=>{throw new EncounterAutomationSelectionNeedsReviewError('Source-bound configuration remains unresolved.');},
        review:async()=>{throw Error('Review must not run');}}});
    expect(result.report.status).toBe('needs_review');
    expect(result.report.findings).toEqual(['Source-bound configuration remains unresolved.']);
    expect(result.report.actors[0]?.generation?.status).toBe('accepted');
    expect(result.report.actors[0]?.analysis.ir).toBeTruthy();
    expect(result.prepared).toBeUndefined();
  });
  test('invalid IR, wrong carrier, non-manual selection and rejected reviews never approve manual preparation',async()=>{
    const data=fixture('Curse Tide','The target makes a DC 13 Wisdom save. On a failed save, the target is Cursed for one minute.',[{statuses:['cursed'],condition:'Failure',duration:'one minute'}]);
    const provider:any={providerName:'fixture',extractionModel:'fixture',reviewModel:'fixture',
      discover:async()=>({schemaVersion:1,candidates:[{id:'one',label:'One source actor',start:0,end:data.source.length,quote:data.source}]}),
      extract:async()=>data.ir,repair:async()=>data.ir,review:async()=>({schemaVersion:1,verdict:'accepted',findings:[]})};
    let calls=0;
    const manual:any={generate:async(request:any)=>{calls++;return compileEncounterSelection(data.selection,request);},review:async()=>({verdict:'accepted',findings:[]})};
    const invalid=structuredClone(data.ir);invalid.source.sha256='0'.repeat(64);
    const badIr=await generateEncounterFromHumanMarkdown({source:data.source,label:'Invalid',provider:{...provider,extract:async()=>invalid,repair:async()=>invalid},automationProvider:manual});
    expect(badIr.prepared).toBeUndefined();expect(calls).toBe(0);
    const other=structuredClone(data.selection);
    other.rules[0]!.featureName=data.ir.creature.actions[0]!.name;
    other.rules[0]!.quote=data.ir.claims.find(claim=>claim.path==='/creature/actions/0')!.evidence[0]!.quote;
    const wrongItem=await generateEncounterFromHumanMarkdown({source:data.source,label:'Wrong item',provider,automationProvider:{...manual,generate:async(request:any)=>compileEncounterSelection(other,request)}});
    expect(wrongItem.prepared).toBeUndefined();expect(wrongItem.report.status).not.toBe('ready_for_gm_review');
    const wrongActor=structuredClone(data.selection);wrongActor.rules[0]!.actorKey='actor-2';
    const mismatched=await generateEncounterFromHumanMarkdown({source:data.source,label:'Wrong actor',provider,automationProvider:{...manual,
      generate:async(request:any)=>compileEncounterSelection(wrongActor,request)}});
    expect(mismatched.prepared).toBeUndefined();expect(mismatched.report.status).not.toBe('ready_for_gm_review');
    const automatic=structuredClone(data.selection);automatic.rules[0]!.kind='save-failure-effect';
    automatic.rules[0]!.parameters={effect:'blinded',expiry:'next-source-turn-start',minFailureMargin:1,removeOnDamage:false};
    const mismatchedKind=await generateEncounterFromHumanMarkdown({source:data.source,label:'Wrong capability',provider,automationProvider:{...manual,
      generate:async(request:any)=>compileEncounterSelection(automatic,request)}});
    expect(mismatchedKind.prepared).toBeUndefined();expect(mismatchedKind.report.status).not.toBe('ready_for_gm_review');
    const legacy=await generateEncounterFromHumanMarkdown({source:data.source,label:'Unclassified rule',provider,automationProvider:{...manual,
      generate:async(request:any)=>{const automation=compileEncounterSelection(data.selection,request);const {selection:_,...unclassified}=automation;return unclassified;}}});
    expect(legacy.report.status).not.toBe('ready_for_gm_review');expect(legacy.prepared).toBeUndefined();
    const actorRejected=await generateEncounterFromHumanMarkdown({source:data.source,label:'Actor rejected',provider:{...provider,
      review:async()=>({schemaVersion:1,verdict:'revise',findings:[{code:'SOURCE_MISMATCH',path:'/creature/actions/0',message:'Source mismatch',blocking:true}]})},automationProvider:manual});
    expect(actorRejected.prepared).toBeUndefined();expect(calls).toBe(0);
    const configRejected=await generateEncounterFromHumanMarkdown({source:data.source,label:'Config rejected',provider,automationProvider:{...manual,
      review:async()=>({verdict:'needs_review',findings:['Manual steps omit the duration.']})}});
    expect(configRejected.report.status).toBe('needs_review');expect(configRejected.prepared).toBeUndefined();
    const controller=new AbortController();
    const cancelled=await generateEncounterFromHumanMarkdown({source:data.source,label:'Cancelled',provider,signal:controller.signal,automationProvider:{...manual,
      generate:async(request:any)=>{controller.abort();return compileEncounterSelection(data.selection,request);}}});
    expect(cancelled.report.status).toBe('failed');expect(cancelled.prepared).toBeUndefined();
  });
  test('empty manual parameters cannot accept code or effect paths',()=>{
    expect(()=>decodeEncounterRuntimeConfiguration({version:1,rules:[{id:'bad',kind:'gm-manual',actorKey:'one',itemName:'Sleep',parameters:{script:'alert(1)'}}],legendaryRecovery:[]})).toThrow('unsupported fields');
  });
});

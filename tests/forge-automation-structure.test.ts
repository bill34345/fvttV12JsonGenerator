import { describe, expect, test } from 'bun:test';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import {
  compileEncounterSelection, compileEncounterSelectionSourceAudit, decodeEncounterAutomation,
  renderEncounterActorSource, type EncounterAutomationRequest,
} from '@fvtt-json-generator/intake-ai/encounter-automation';
import { readFixedEncounterConfiguration } from '@fvtt-json-generator/intake-ai/encounter-capabilities';
import { encounterProposalContext, expandEncounterProposal } from '../packages/intake-ai/src/encounter-proposal';
import { buildValidLurkerIr } from '../src/core/intake/__tests__/fixtures/lurker';

function fixture(prose='原文用甲顺序说明距离九百尺、DC 99；定位。') {
  const ir=buildValidLurkerIr();
  ir.source={sha256:sha256(prose),length:prose.length};
  ir.creature.actions=[{name:'Pulse',description:'AI 已整理的完整能力。',activityType:'save',
    save:{dc:17,ability:'dex'},aoe:{shape:'sphere',radius:25}}];
  const artifact={name:ir.creature.identity.name,items:[{name:'Pulse',system:{activities:{save:{
    type:'save',save:{ability:['dex'],dc:{formula:'17'}},range:{value:25,units:'ft'},
    target:{template:{type:'sphere',size:25,units:'ft'}},
  }}}}]};
  const request:EncounterAutomationRequest={source:prose,actors:[{key:'one',source:prose,ir,artifact}]};
  const selection:any={version:2,name:'Control',notes:'AI selection',manualSteps:[],legendaryRecovery:[],rules:[{
    id:'pulse',kind:'turn-start-area',actorKey:'one',featureName:'Pulse',section:'action',quote:'定位',
    gmSteps:['GM 确认目标。'],parameters:{radiusFeet:25,excludeSelf:true,aliveOnly:true},
  }]};
  return {request,selection};
}

describe('AI encounter selection structural compilation',()=>{
  test('keeps identical AI parameters when source word order and numbers change with updated identity',()=>{
    const first=fixture(),second=fixture('先列 DC 777，再列距离三尺，最后说明：定位。');
    const before=structuredClone(first.request.actors[0]!.artifact);
    const compiled=compileEncounterSelection(first.selection,first.request);
    expect(compileEncounterSelection(second.selection,second.request)).toEqual(compiled);
    expect(compiled.selection).toEqual(first.selection);
    expect(readFixedEncounterConfiguration(compiled.command)?.rules[0]?.parameters.radiusFeet).toBe(25);
    expect(first.request.actors[0]!.artifact).toEqual(before);
    expect(decodeEncounterAutomation(compiled,first.request)).toEqual(compiled);
  });

  test('retains AI lifecycle DC, duration and optionality without a source grammar or semantic excerpt parser',()=>{
    const {request,selection}=fixture('定位：数字999，任意顺序的完整来源。');
    const feature=request.actors[0]!.ir.creature.actions[0] as any;
    feature.activityType='attack';delete feature.save;
    feature.attack={type:'mwak',toHit:6,reach:5};
    feature.appliedConditions=[{statuses:['frightened']}];
    (request.actors[0]!.artifact as any).items[0].system.activities={attack:{type:'attack',attack:{}}};
    selection.rules[0]={...selection.rules[0],kind:'status-lifecycle',parameters:{trigger:'attack-hit',status:'frightened',
      duration:{value:3,unit:'round'},repeatSave:{ability:'wis',dc:19,timing:'target-turn-end',optional:false}},
      sourceEvidence:Object.fromEntries(['application','duration','repeatSave','timing','optionality','removal'].map(key=>[key,'定位']))};
    const compiled=compileEncounterSelection(selection,request);
    expect(readFixedEncounterConfiguration(compiled.command)?.rules[0]?.parameters).toEqual(selection.rules[0].parameters);
    expect(()=>compileEncounterSelectionSourceAudit(selection,request)).toThrow();
  });

  test('rejects unsupported kinds, scripts, raw paths, hidden fields and non-finite values',()=>{
    const {request,selection}=fixture();
    const mutations=[
      (value:any)=>{value.command='return arbitraryScript();';},
      (value:any)=>{value.rules[0].kind='run-script';},
      (value:any)=>{value.rules[0].parameters.script='game.actors.deleteAll();';},
      (value:any)=>{value.rules[0].parameters.path='system.attributes.hp';},
      (value:any)=>{value.rules[0].parameters.radiusFeet=Infinity;},
      (value:any)=>{Object.defineProperty(value.rules[0].parameters,'effect',{value:{changes:[]}});},
    ];
    for(const mutate of mutations){const value=structuredClone(selection);mutate(value);expect(()=>compileEncounterSelection(value,request)).toThrow();}
    let executed=false;
    const accessor=structuredClone(selection);
    Object.defineProperty(accessor.rules,0,{enumerable:true,get(){executed=true;throw Error('must not execute');}});
    expect(()=>compileEncounterSelection(accessor,request)).toThrow('array data');
    expect(executed).toBe(false);
    expect(()=>decodeEncounterAutomation({version:1,name:'Script',command:'return 1;',notes:'',rules:[],manualSteps:[]},request)).toThrow();
    const compiled=compileEncounterSelection(selection,request);
    expect(()=>decodeEncounterAutomation({...compiled,command:compiled.command+'\nreturn 1;'},request)).toThrow();
  });

  test('rejects stale source identity, missing or ambiguous references and wrong actor IDs',()=>{
    const {request,selection}=fixture();
    const wrongActor=structuredClone(selection);wrongActor.rules[0].actorKey='Actor.unknown';
    expect(()=>compileEncounterSelection(wrongActor,request)).toThrow();
    const missing=structuredClone(selection);missing.rules[0].featureName='Missing';
    expect(()=>compileEncounterSelection(missing,request)).toThrow();
    const duplicate=structuredClone(request);duplicate.actors[0]!.ir.creature.actions.push(duplicate.actors[0]!.ir.creature.actions[0]!);
    expect(()=>compileEncounterSelection(selection,duplicate)).toThrow('unique');
    const duplicateItem=structuredClone(request);(duplicateItem.actors[0]!.artifact as any).items.push((duplicateItem.actors[0]!.artifact as any).items[0]);
    expect(()=>compileEncounterSelection(selection,duplicateItem)).toThrow('one formally generated Item');
    const stale=structuredClone(request);stale.actors[0]!.source+='changed';
    expect(()=>compileEncounterSelection(selection,stale)).toThrow('source identity');
    const summoned=structuredClone(selection);summoned.rules[0].kind='save-summon';
    summoned.rules[0].parameters={summonedActorKey:'absent',count:1,placement:'adjacent-target',outcome:'always'};
    expect(()=>compileEncounterSelection(summoned,request)).toThrow('Summon actor');
    const dangling=structuredClone(selection);dangling.rules[0].parameters.followupRuleId='absent';
    expect(()=>compileEncounterSelection(dangling,request)).toThrow('Followup');
  });

  test('rejects AI IR to compiler or generated Activity mismatches without rewriting them',()=>{
    const {request,selection}=fixture();
    const changed=structuredClone(selection);changed.rules[0].parameters.radiusFeet=30;
    expect(()=>compileEncounterSelection(changed,request)).toThrow('Area radius');
    const badSave=structuredClone(request);(badSave.actors[0]!.artifact as any).items[0].system.activities.save.save.dc.formula='18';
    expect(()=>compileEncounterSelection(selection,badSave)).toThrow('DC or ability');
    expect(selection.rules[0].parameters.radiusFeet).toBe(25);
  });

  test('keeps AI daily uses and reciprocal ward references while rejecting lost native consumption',()=>{
    const {request,selection}=fixture();
    request.actors[0]!.ir.creature.traits=[{name:'Ward',description:'AI ward',activityType:'utility'}];
    request.actors[0]!.ir.creature.actions=[{name:'Break',description:'AI break',activityType:'utility',uses:{max:4,period:'day'}}];
    (request.actors[0]!.artifact as any).items=[{name:'Ward',system:{activities:{}}},{name:'Break',system:{uses:{max:'4',recovery:[{period:'day'}]},
      activities:{use:{type:'utility',consumption:{targets:[{type:'itemUses',value:'1',target:''}]}}}}}];
    selection.rules=[{...selection.rules[0],id:'ward',kind:'threshold-ward',featureName:'Ward',section:'trait',
      parameters:{threshold:21,fullReduction:'half-floor',weakenedReduction:'proficiency',breakRuleId:'break'}},
      {...selection.rules[0],id:'break',kind:'ward-break',featureName:'Break',parameters:{wardRuleId:'ward',until:'own-next-turn-start',whenDepleted:'weakened'}}];
    const compiled=compileEncounterSelection(selection,request);
    expect(compiled.selection?.rules).toEqual(selection.rules);
    (request.actors[0]!.artifact as any).items[1].system.uses.max='3';
    expect(()=>compileEncounterSelection(selection,request)).toThrow('daily uses');
  });

  test('does not require a macro when unsupported staged content is preserved as GM text',()=>{
    const {request}=fixture();
    const feature=request.actors[0]!.ir.creature.actions[0]!;
    feature.appliedConditions=[{statuses:['exhaustion'],staged:true,condition:'AI 保留的复杂分支。'}];
    const empty={version:2,name:'Manual only',notes:'GM handles complex consequences',manualSteps:['GM 按完整文字处理。'],legendaryRecovery:[],rules:[]};
    expect(compileEncounterSelection(empty,request).selection?.rules).toEqual([]);
    const rendered=renderEncounterActorSource(request.actors[0]!.ir,[],request.actors[0]!.source);
    expect(rendered).toContain(feature.description);
    expect(rendered).toContain('由GM按原文裁定');
  });

  test('retains explicit AI manual steps and accepts repeated locator text',()=>{
    const {request,selection}=fixture('定位。复杂移动和授予效果由 GM 处理。定位。');
    selection.rules[0]={...selection.rules[0],kind:'gm-manual',parameters:{},gmSteps:[
      'GM 按 AI 整理的完整条款核对合法目标、移动和授予条件。',
      '特殊效果不自动执行，GM 手动记录并结束。',
    ]};
    const result=compileEncounterSelection(selection,request);
    expect(result.rules[0]?.gmSteps).toEqual(selection.rules[0].gmSteps);
    expect(result.selection?.rules[0]).toEqual(selection.rules[0]);
  });

  test('proposal citations do not need headings, number syntax or a matching IR paraphrase',()=>{
    const {request}=fixture('未识别句式，仅保留完整来源，数字123。');
    const context=encounterProposalContext(request,[]);
    const feature=context.bindings.find(binding=>binding.feature.name==='Pulse')!;
    const expanded=expandEncounterProposal({version:3,rules:[{featureRef:feature.ref,kind:'turn-start-area',
      parameters:{radiusFeet:25,excludeSelf:true,aliveOnly:true},gmSteps:['GM 确认位置。']}],legendaryRecovery:[],unresolved:[]},context);
    expect(compileEncounterSelection(expanded,request).selection?.rules[0]?.quote).toBe(request.source);
  });
});

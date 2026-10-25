import {describe,test,expect} from 'bun:test';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {compileEncounterSelection,compileEncounterSelectionSourceAudit,decodeEncounterAutomation,renderEncounterActorSource} from '@fvtt-json-generator/intake-ai/encounter-automation';
import {decodeEncounterRuntimeConfiguration} from '@fvtt-json-generator/intake-ai/encounter-capabilities';
import {convertMarkdownContentToJson} from '../src/core/workflow/singleFileConversion';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';
import {buildForgeActorRequest,convertFinalActorSource} from '@fvtt-json-generator/forge-browser-runtime';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';

async function fixture(){
  const ir=buildValidLurkerIr();
  const quote='At its turn start, Pulse affects all other creatures within 15 feet. Each makes a DC 13 Dexterity save, taking 2d6 piercing on failure and no damage on success.';
  const source=LURKER_SOURCE+'\n'+quote,start=source.indexOf(quote);
  ir.source={sha256:hashSource(source),length:source.length};
  ir.creature.actions=[{name:'Pulse',description:quote,activityType:'save',activationType:'special',save:{dc:13,ability:'dex'},aoe:{shape:'sphere',radius:15},damage:[{formula:'2d6',type:'piercing',relationship:'base'}],evidence:[{start,end:start+quote.length,quote}]}];
  const generated=await convertMarkdownContentToJson({content:renderEncounterActorSource(ir,[],source),fvttVersion:'14',effectProfile:'core',translationService:null});
  const request={source,actors:[{key:'creature',source,ir,artifact:generated.rawJson}]};
  const selection:any={version:2,name:'Pulse control',notes:'Fixed turn trigger',manualSteps:[],legendaryRecovery:[],rules:[{id:'pulse',kind:'turn-start-area',actorKey:'creature',featureName:'Pulse',section:'action',quote,gmSteps:['GM verifies scene placement.'],parameters:{radiusFeet:15,excludeSelf:true,aliveOnly:true}}]};
  return {request,selection};
}
describe('fixed capability selection and compilation',()=>{
  test('explicit source audit binds a complete numbered ray list and rejects a source-unlisted Save Item',async()=>{
    const ir=buildValidLurkerIr();
    const baseSource=LURKER_SOURCE;
    const permission='While the creature is Bloodied, a creature that scores a Critical Hit against it can disable one of its eye rays of its choice.';
    const parent='The creature shoots three of the following magical eye rays at random, choosing visible targets within 120 feet:';
    const rows=Array.from({length:10},(_,index)=>`${index+1}. Listed Ray ${index+1}. Wisdom Saving Throw: DC 13. Failure: no effect.`);
    const suffix=`\n\nLock Carrier. ${permission}\nRay List. ${parent}\n${rows.join('\n')}\nForeign Pulse. Wisdom Saving Throw: DC 13. Failure: no effect.`;
    const source=baseSource+suffix;
    const ref=(quote:string)=>({start:source.indexOf(quote),end:source.indexOf(quote)+quote.length,quote});
    ir.source={sha256:hashSource(source),length:source.length};
    ir.creature.traits.push({name:'Lock Carrier',description:permission,activityType:'utility',evidence:[ref(`Lock Carrier. ${permission}`)]});
    ir.creature.actions.push({name:'Ray List',description:parent,activityType:'utility',evidence:[ref(`Ray List. ${parent}`)]});
    for(const [index,quote] of rows.entries())ir.creature.actions.push({name:`Listed Ray ${index+1}`,description:'Wisdom Saving Throw: DC 13. Failure: no effect.',activityType:'save',save:{dc:13,ability:'wis'},evidence:[ref(quote)]});
    ir.creature.actions.push({name:'Foreign Pulse',description:'Wisdom Saving Throw: DC 13. Failure: no effect.',activityType:'save',save:{dc:13,ability:'wis'},evidence:[ref('Foreign Pulse. Wisdom Saving Throw: DC 13. Failure: no effect.')]});
    const rendered=renderMonsterIntakeMarkdown(ir);
    const generated=await convertMarkdownContentToJson({content:rendered,fvttVersion:'14',effectProfile:'core',translationService:null});
    const request={source,actors:[{key:'one',source,ir,artifact:generated.rawJson}]};
    const selection={version:2,name:'Listed source lock',notes:'GM control only',manualSteps:[],legendaryRecovery:[],rules:[{id:'list',kind:'gm-activity-lock',actorKey:'one',featureName:'Lock Carrier',section:'trait',quote:`Lock Carrier. ${permission}`,gmSteps:['GM confirms Bloodied and Critical Hit, then selects the ray.'],parameters:{activityItemNames:rows.map((_,index)=>`Listed Ray ${index+1}`)}}]};
    expect(compileEncounterSelectionSourceAudit(selection,request).selection?.rules[0]?.parameters.activityItemNames).toHaveLength(10);
    const wrong=structuredClone(selection);wrong.rules[0]!.parameters.activityItemNames[9]='Foreign Pulse';
    expect(()=>compileEncounterSelectionSourceAudit(wrong,request)).toThrow('absent from quoted source evidence');
  });
  test('rejects misspelled or invalid resource fields instead of accepting lost source counters',()=>{
    const ir=buildValidLurkerIr();(ir.creature.traits[0] as any).use={max:2,period:'day'};
    expect(validateMonsterIntakeIR(LURKER_SOURCE,ir).blocking).toContainEqual(expect.objectContaining({code:'UNKNOWN_PROPERTY',path:'/creature/traits/0/use'}));
    delete (ir.creature.traits[0] as any).use;
    for(const [uses,path] of [[{max:0,period:'day'},'max'],[{max:2.5,period:'day'},'max'],[{max:2,period:'forever'},'period'],[{max:2,period:'day',value:2},'value']] as const){
      ir.creature.traits[0]!.uses=uses as any;
      expect(validateMonsterIntakeIR(LURKER_SOURCE,ir).blocking).toContainEqual(expect.objectContaining({path:`/creature/traits/0/uses/${path}`,origin:'schema'}));
    }
  });
  test('a supported bilingual source alias remains accepted and retains the actual candidate',async()=>{
    const ir=buildValidLurkerIr();ir.creature.traits[0]={name:'两次能力 [2/日]（Daily Power）',englishName:'Daily Power',description:'This power is used twice per day.',activityType:'utility'};
    const result=await convertFinalActorSource(buildForgeActorRequest({content:renderMonsterIntakeMarkdown(ir),displayName:'Name warning test',requestId:'name-warning',fvttVersion:'14.364',systemVersion:'5.3.3'}));
    if(!('result' in result))throw Error('Missing formal result');
    expect(result.result.status).toBe('accepted');expect(result.result.diagnostics.some(d=>d.code==='FORGE_ACTOR_VERIFICATION_WARNING')).toBe(false);
    expect(result.result.diagnostics.some(d=>d.code==='FORGE_WORKFLOW_FAILED')).toBe(false);
    expect('artifact' in result.result&&result.result.artifact?.name).toBeTruthy();
  });
  test('uses formal native Item identity and emits only one fixed module call',async()=>{
    const {request,selection}=await fixture();const result=compileEncounterSelection(selection,request);
    expect(result.selection).toEqual(selection);expect(result.rules).toEqual(selection.rules.map(({id,kind,parameters,...r}:any)=>r));
    expect(result.command).toContain("api.startEncounterAutomation(forgeEncounter,");expect(result.command).toContain('"itemName":"Pulse"');
    expect(result.command).not.toContain('2d6');expect(decodeEncounterAutomation(result,request)).toEqual(result);
    const changed=structuredClone(result);changed.command+='\nalert(1)';expect(()=>decodeEncounterAutomation(changed,request)).toThrow();
  });
  test('rejects executable fields, unsupported capabilities, wrong sources, wrong radius and missing formal carriers',async()=>{
    const {request,selection}=await fixture();
    for(const mutate of [
      (x:any)=>{x.command='return 1';},(x:any)=>{x.rules[0].kind='run-script';},(x:any)=>{x.rules[0].parameters.script='evil';},
      (x:any)=>{x.rules[0].parameters.radiusFeet=20;},(x:any)=>{x.rules[0].quote='not in source';},(x:any)=>{x.rules[0].actorKey='absent';},
      (x:any)=>{x.rules.push(structuredClone(x.rules[0]));},
    ]){const changed=structuredClone(selection);mutate(changed);expect(()=>compileEncounterSelection(changed,request)).toThrow();}
    expect(()=>compileEncounterSelection(selection,{...request,actors:[{...request.actors[0]!,artifact:{items:[]}}]})).toThrow('formally generated');
  });
  test('rejects arbitrary paths and dangling or cross-actor references before execution',()=>{
    const corrupt={id:'corrupt',kind:'staged-corruption',actorKey:'one',itemName:'Corrupt',parameters:{marker:'corruption',label:'Corruption',repeatExhaustion:1}};
    const pulse={id:'pulse',kind:'turn-start-area',actorKey:'one',itemName:'Pulse',parameters:{radiusFeet:10,excludeSelf:true,aliveOnly:true,followupRuleId:'corrupt'}};
    const config:any={version:1,rules:[pulse,corrupt],legendaryRecovery:[]};expect(decodeEncounterRuntimeConfiguration(config)).toEqual(config);
    expect(()=>decodeEncounterRuntimeConfiguration({...config,rules:[pulse]})).toThrow();
    expect(()=>decodeEncounterRuntimeConfiguration({...config,rules:[pulse,{...corrupt,actorKey:'two'}]})).toThrow();
    expect(()=>decodeEncounterRuntimeConfiguration({...config,rules:[{...corrupt,parameters:{...corrupt.parameters,path:'system.attributes.hp'}}]})).toThrow();
    const bad:any={version:1,rules:[],legendaryRecovery:[]};Object.defineProperty(bad,'rules',{enumerable:true,get(){throw Error('getter executed');}});
    expect(()=>decodeEncounterRuntimeConfiguration(bad)).toThrow('plain data');
  });
  test('binds the four closed failure effects to matching source timing and native Save carriers',async()=>{
    const cases:[string,any][]=[
      ['FAILURE: Blinded until the start of the eye\'s next turn.',{effect:'blinded',expiry:'next-source-turn-start',minFailureMargin:1,removeOnDamage:false}],
      ['FAILURE: Speed is halved until the end of its next turn.',{effect:'slowed',expiry:'next-target-turn-end',minFailureMargin:1,removeOnDamage:false}],
      ['FAILURE: Paralyzed until the end of the eye\'s next turn, or until it takes any damage.',{effect:'paralyzed',expiry:'next-source-turn-end',minFailureMargin:1,removeOnDamage:true}],
      ['FAILURE BY 5 OR MORE: Disadvantage on d20 Tests that use Strength or Dexterity until it regains any Hit Points.',{effect:'str-dex-disadvantage',expiry:'hp-recovery',minFailureMargin:5,removeOnDamage:false}],
    ];
    for(const [quote,parameters] of cases){
      const {request,selection}=await fixture();
      const actor=request.actors[0]!;const start=request.source.length+1;
      request.source+=`\n${quote}`;actor.source=request.source;
      actor.ir.creature.identity.name='Eye';
      actor.ir.creature.actions[0]!.description=quote;
      actor.ir.creature.actions[0]!.evidence=[{start,end:start+quote.length,quote}];
      actor.ir.source={sha256:hashSource(actor.source),length:actor.source.length};
      selection.rules[0]={...selection.rules[0],kind:'save-failure-effect',quote,gmSteps:['GM selects every legal target in the native area.'],parameters};
      expect(compileEncounterSelection(selection,request).command).toContain('save-failure-effect');
      const wrong=structuredClone(selection);wrong.rules[0].quote=cases.find(([text])=>text!==quote)![0];
      expect(()=>compileEncounterSelection(wrong,request)).toThrow();
      const utility=structuredClone(request);(utility.actors[0]!.artifact as any).items.find((item:any)=>item.name==='Pulse').system.activities={only:{type:'utility'}};
      expect(()=>compileEncounterSelection(selection,utility)).toThrow('native Save Activity');
      if(parameters.effect==='blinded')for(const incorrect of ["FAILURE: Blinded until the start of the target's next turn.",'FAILURE: Blinded until the start of its next turn.']){
        const wrongRequest=structuredClone(request),wrongSelection=structuredClone(selection);
        const at=wrongRequest.source.length+1;wrongRequest.source+=`\n${incorrect}`;wrongRequest.actors[0]!.source=wrongRequest.source;
        wrongRequest.actors[0]!.ir.creature.actions[0]!.evidence=[{start:at,end:at+incorrect.length,quote:incorrect}];
        wrongSelection.rules[0].quote=incorrect;
        expect(()=>compileEncounterSelectionSourceAudit(wrongSelection,wrongRequest)).toThrow('expiry');
      }
    }
  });
  test('GM activity lock requires the source trait, bloodied critical hit and both named rays',async()=>{
    const {request,selection}=await fixture();
    const quote="While the eye is Bloodied, a creature that scores a Critical Hit against it can disable the eye's Glacial Ray or Paroxysm Ray.";
    const start=request.source.length+1;request.source+=`\n${quote}`;
    const actor=request.actors[0]!;actor.source=request.source;
    actor.ir.source={sha256:hashSource(actor.source),length:actor.source.length};
    actor.ir.creature.traits.push({name:'Eyestalks',description:quote,activityType:'utility',evidence:[{start,end:start+quote.length,quote}]});
    (actor.artifact as any).items.push({name:'Eyestalks',system:{activities:{utility:{type:'utility'}}}});
    for(const name of ['Glacial Ray','Paroxysm Ray'])(actor.artifact as any).items.push({name,system:{activities:{save:{type:'save',save:{ability:['dex'],dc:{formula:'15'}}}}}});
    selection.rules=[{id:'eyes',kind:'gm-activity-lock',actorKey:'creature',featureName:'Eyestalks',section:'trait',quote,
      gmSteps:['GM confirms Bloodied and Critical Hit before selecting a ray.','Only GM explicitly restores it.'],parameters:{activityItemNames:['Glacial Ray','Paroxysm Ray']}}];
    expect(compileEncounterSelection(selection,request).command).toContain('gm-activity-lock');
    const bad=structuredClone(selection);bad.rules[0].gmSteps=['GM chooses a ray.'];
    expect(()=>compileEncounterSelectionSourceAudit(bad,request)).toThrow('GM confirmation');
  });
});

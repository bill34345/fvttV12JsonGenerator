import {describe,test,expect} from 'bun:test';
import {compileEncounterSelection,decodeEncounterAutomation,renderEncounterActorSource} from '@fvtt-json-generator/intake-ai/encounter-automation';
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
  ir.creature.actions=[{name:'Pulse',description:quote,activityType:'save',activationType:'special',save:{dc:13,ability:'dex'},aoe:{shape:'sphere',radius:15},damage:[{formula:'2d6',type:'piercing',relationship:'base'}],evidence:[{start,end:start+quote.length,quote}]}];
  const generated=await convertMarkdownContentToJson({content:renderEncounterActorSource(ir,[],source),fvttVersion:'14',effectProfile:'core',translationService:null});
  const request={source,actors:[{key:'creature',source,ir,artifact:generated.rawJson}]};
  const selection:any={version:2,name:'Pulse control',notes:'Fixed turn trigger',manualSteps:[],legendaryRecovery:[],rules:[{id:'pulse',kind:'turn-start-area',actorKey:'creature',featureName:'Pulse',section:'action',quote,gmSteps:['GM verifies scene placement.'],parameters:{radiusFeet:15,excludeSelf:true,aliveOnly:true}}]};
  return {request,selection};
}
describe('fixed capability selection and compilation',()=>{
  test('rejects misspelled or invalid resource fields instead of accepting lost source counters',()=>{
    const ir=buildValidLurkerIr();(ir.creature.traits[0] as any).use={max:2,period:'day'};
    expect(validateMonsterIntakeIR(LURKER_SOURCE,ir).blocking).toContainEqual(expect.objectContaining({code:'INVALID_FEATURE_USES_FIELD'}));
    delete (ir.creature.traits[0] as any).use;
    for(const uses of [{max:0,period:'day'},{max:2.5,period:'day'},{max:2,period:'forever'},{max:2,period:'day',value:2}]){
      ir.creature.traits[0]!.uses=uses as any;
      expect(validateMonsterIntakeIR(LURKER_SOURCE,ir).blocking).toContainEqual(expect.objectContaining({code:'INVALID_FEATURE_USES'}));
    }
  });
  test('a source name warning uses a closed Actor diagnostic namespace and retains the actual candidate',async()=>{
    const ir=buildValidLurkerIr();ir.creature.traits[0]={name:'两次能力 [2/日]（Daily Power）',englishName:'Daily Power',description:'This power is used twice per day.',activityType:'utility'};
    const result=await convertFinalActorSource(buildForgeActorRequest({content:renderMonsterIntakeMarkdown(ir),displayName:'Name warning test',requestId:'name-warning',fvttVersion:'14.364',systemVersion:'5.3.3'}));
    if(!('result' in result))throw Error('Missing formal result');
    expect(result.result.status).toBe('needs_review');expect(result.result.diagnostics).toContainEqual(expect.objectContaining({code:'FORGE_ACTOR_VERIFICATION_WARNING',path:'actor'}));
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
});

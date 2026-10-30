import {describe,expect,test} from 'bun:test';
import saved from './fixtures/forge-raw-contracts.json';
import {buildValidLurkerIr} from '../src/core/intake/__tests__/fixtures/lurker';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows';

// Isolate the unchanged saved ability mechanics from unrelated malformed
// historical fields. The frozen full responses remain covered by raw contracts.
async function fixture(caseId:string){
  const row=saved.find(row=>row.caseId===caseId)!,ir=buildValidLurkerIr();
  ir.source=structuredClone(row.finalIr.source);ir.claims=[];ir.coverage=[];ir.uncertainties=[];
  ir.creature.traits=[];ir.creature.actions=[];ir.creature.bonusActions=[];ir.creature.reactions=[];ir.creature.legendaryActions=[];
  if(caseId==='baernaloths')ir.creature.bonusActions=[structuredClone(row.finalIr.creature.bonusActions[0]) as any];
  else {ir.creature.legendaryActions=[structuredClone(row.finalIr.creature.legendaryActions[0]) as any];ir.creature.legendary=structuredClone(row.finalIr.creature.legendary) as any;}
  const markdown=renderMonsterIntakeMarkdown(ir),generated=await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',translationService:null});
  expect(generated.rawJson).toBeDefined();return{source:row.source,ir,markdown,actor:generated.rawJson as any};
}
const findings=(data:Awaited<ReturnType<typeof fixture>>)=>verifyMonsterIntake(data.source,data.ir,data.markdown,data.actor).findings;
const item=(data:Awaited<ReturnType<typeof fixture>>,name:string)=>data.actor.items.find((entry:any)=>entry.name===name);
const helper=(entry:any):any=>Object.values<any>(entry.system.activities).find(activity=>activity.flags?.fvttJsonGenerator?.literalDamage);

describe('literal branches retain complete explicit GM activities',()=>{
  for(const [caseId,name,number,denomination,type] of [
    ['baernaloths','Premonition of Pain',3,6,'psychic'],['charon','Nothing for Nothing',1,10,'necrotic'],
  ] as const)test(caseId+' retains conditional damage as a separate GM roll with its full trigger',async()=>{
    const data=await fixture(caseId),actual=item(data,name),roll=helper(actual);
    expect(roll).toMatchObject({type:'damage',activation:{type:'special',override:true},consumption:{targets:[],spellSlot:false},effects:[],damage:{parts:[{number,denomination,bonus:'',types:[type]}]}});
    const feature=caseId==='charon'?data.ir.creature.legendaryActions[0]!:data.ir.creature.bonusActions[0]!;
    expect(roll.activation.condition).toBe(feature.damage![0]!.condition);
    expect(roll.flags.fvttJsonGenerator.literalDamage.part).toEqual(feature.damage![0]);
    expect(actual.system.description.value.replaceAll('&#39;',"'")).toContain(feature.description.split('\n')[0]);
    const carriers=Object.values<any>(actual.system.activities).filter(activity=>activity!==roll);
    expect(carriers).toHaveLength(1);expect(carriers[0]).toMatchObject({type:'utility',activation:{type:caseId==='charon'?'legendary':'bonus'}});
    expect(carriers[0].damage).toBeUndefined();
    expect(findings(data)).toEqual([]);
    const withoutText=structuredClone(data),omitted=item(withoutText,name);omitted.system.description.value='';
    for(const activity of Object.values<any>(omitted.system.activities))activity.description={chatFlavor:''};
    expect(findings(withoutText)).toContainEqual(expect.objectContaining({code:'ACTOR_DESCRIPTION_LOSS'}));
    const immediate=structuredClone(data);helper(item(immediate,name)).activation.type='action';
    expect(findings(immediate)).toContainEqual(expect.objectContaining({code:'ACTOR_DAMAGE_HELPER_BOUNDARY_DRIFT'}));
    const wrong=structuredClone(data);helper(item(wrong,name)).damage.parts[0]={number:2,denomination:6,bonus:'',types:['fire'],custom:{enabled:false,formula:''}};
    expect(findings(wrong)).toContainEqual(expect.objectContaining({code:'ACTOR_DAMAGE_HELPER_ROLL_DRIFT'}));
  });
  test('a post-damage0HP save retains its exact AI fields as an independent GM helper',async()=>{
    const row=saved.find(row=>row.caseId==='baernaloths')!,data=await fixture('baernaloths');
    const feature=structuredClone(row.finalIr.creature.actions[1]) as any;
    // The saved empty status list describes a transformation in prose, not a
    // native condition. Keep that full prose while supplying the roll contract.
    data.ir.creature.actions=[{name:feature.name,englishName:feature.englishName,description:feature.description,activityType:feature.activityType,activationType:feature.activationType,attack:feature.attack,damage:feature.damage,save:feature.save}];
    data.markdown=renderMonsterIntakeMarkdown(data.ir);
    data.actor=(await convertMarkdownContentToJson({content:data.markdown,fvttVersion:'14',effectProfile:'core',translationService:null})).rawJson;
    const touch=item(data,'Deranging Touch'),activities=Object.values<any>(touch.system.activities),attack=activities.find(activity=>activity.type==='attack'),save=activities.find(activity=>activity.type==='save');
    expect(attack).toMatchObject({attack:{bonus:'12',flat:true},damage:{parts:[{number:8,denomination:6,bonus:'6',types:['psychic']}]}});
    expect(save).toMatchObject({save:{ability:['cha'],dc:{formula:'20'}},activation:{type:'special'},consumption:{targets:[],spellSlot:false}});
    expect(attack.save).toBeUndefined();expect(save.description.chatFlavor).toContain('reduced to 0 Hit Points');
    expect(findings(data)).toEqual([]);
    const wrong=structuredClone(data);Object.values<any>(item(wrong,'Deranging Touch').system.activities).find(activity=>activity.type==='save').save.dc.formula='21';
    expect(findings(wrong)).toContainEqual(expect.objectContaining({code:'ACTOR_SAVE_DC_DRIFT'}));
    const missing=structuredClone(data);item(missing,'Deranging Touch').system.description.value='';
    expect(findings(missing)).toContainEqual(expect.objectContaining({code:'ACTOR_DESCRIPTION_LOSS'}));
    for(const mutate of [(activity:any)=>{activity.activation.type='action';},(activity:any)=>{activity.activation.condition='Invented trigger';},(activity:any)=>{activity.consumption.targets=[{type:'itemUses',target:'',value:'1'}];}]){const changed=structuredClone(data);mutate(Object.values<any>(item(changed,'Deranging Touch').system.activities).find(activity=>activity.type==='save'));expect(findings(changed)).toContainEqual(expect.objectContaining({code:'ACTOR_SAVE_HELPER_BOUNDARY_DRIFT'}));}
  });
});

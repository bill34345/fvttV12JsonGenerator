import {describe,test,expect} from 'bun:test';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import {projectActor} from '@fvtt-json-generator/intake-ai/verifier';

// Synthetic source headers isolate the existing dnd5e passive FormulaField
// semantics. The real saved Skymaster failure is separately replayed unchanged.
function source(passive:number,perception:number,cr:number){return [
  '---','名称: Passive Proof','类型: npc','体型: 巨型','生物类型: 天界生物',
  '能力:','  力量: 23','  敏捷: 16','  体质: 20','  智力: 8','  感知: 17','  魅力: 17',
  '护甲等级: 16','生命值: 207 (18d12 + 90)','速度: 步行 15 尺, 飞行 50 尺',
  `挑战等级: ${cr}`,'技能:',`  察觉: ${perception}`,'  求生: 11','感官:',
  '  黑暗视觉: 60',`  被动察觉: ${passive}`,'---',
].join('\n');}
async function generate(passive:number,perception:number,cr:number){
  const result=await convertMarkdownContentToJson({content:source(passive,perception,cr),fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null});
  return result.rawJson as any;
}
describe('Intake verifier respects source-explicit passive perception',()=>{
  for(const row of [
    {passive:20,perception:11,cr:11,bonus:'-1',name:'expertise with a lower printed passive'},
    {passive:26,perception:11,cr:11,bonus:'+5',name:'expertise with a higher printed passive'},
    {passive:11,perception:3,cr:2,bonus:'-2',name:'untrained perception with a lower printed passive'},
    {passive:21,perception:11,cr:11,bonus:'',name:'printed passive equals the unadjusted score'},
  ])test(row.name,async()=>{
    const actor=await generate(row.passive,row.perception,row.cr);
    expect(actor.system.skills.prc.bonuses.passive).toBe(row.bonus);
    const projection=projectActor(actor,{skillKeys:['perception','survival']}) as any;
    expect(projection.senses.passivePerception).toBe(row.passive);
    expect(projection.skills.perception).toBe(row.perception);
    expect(projection.skills.survival).toBe(11);
    expect(actor.effects).toEqual([]);
  });
  test('changing a passive bonus changes the checked fact but not skill totals or other source fields',async()=>{
    const actor=await generate(20,11,11),before=projectActor(actor) as any;
    const wrong=structuredClone(actor);wrong.system.skills.prc.bonuses.passive='+1';
    const after=projectActor(wrong) as any;
    expect(after.senses.passivePerception).toBe(22);
    expect(after.skills).toEqual(before.skills);
    expect(after.abilities).toEqual(before.abilities);
    expect(after.movement).toEqual(before.movement);
    expect(after.hp).toBe(before.hp);
    expect(after.cr).toBe(before.cr);
  });
  test('a different skills passive bonus never alters Perception',async()=>{
    const actor=await generate(20,11,11);
    actor.system.skills.sur.bonuses.passive='+9';
    expect((projectActor(actor).senses as any).passivePerception).toBe(20);
  });
});

import {describe,test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {projectActor,verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import capturedIr from './fixtures/forge-faldric-intake.json';
import {assertActorSemantics} from '../foundry-modules/fvtt-json-forge/src/runtime';

const source=readFileSync(new URL('../obsidian/dnd数据转fvttjson/input/faldric-the-archer.md',import.meta.url),'utf8');
async function generated(){
  const ir=structuredClone(capturedIr) as MonsterIntakeIR;
  const markdown=renderMonsterIntakeMarkdown(ir);
  const output=await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',translationService:null,iconOptions:{mode:'off'}});
  return{ir,markdown,actor:output.rawJson as any};
}
function projection(ability:string,score:number|undefined,bonus='@mod'){
  const activity={type:'attack',activation:{type:'reaction'},
    attack:{ability,flat:false,bonus:'',type:{value:'rwak'}},
    damage:{includeBase:false,parts:[{number:1,denomination:8,bonus,types:['piercing'],custom:{enabled:false,formula:''}}]}};
  const artifact={system:{abilities:score===undefined?{}:{[ability]:{value:score}},attributes:{},details:{}},
    items:[{name:'Counterstrike',type:'feat',system:{activities:{reaction:activity}}}]};
  return(projectActor(artifact).items as any[])[0];
}
describe('three-blocker reaction damage projection',()=>{
  test('replays the actual accepted IR through the formal workflow and strict source verifier',async()=>{
    const {ir,markdown,actor}=await generated();
    const report=verifyMonsterIntake(source,ir,markdown,actor);
    expect(report.findings).toEqual([]);
    const reaction=actor.items.find((i:any)=>i.name==='Pelliton’s Archer');
    const activity=Object.values(reaction.system.activities)[0] as any;
    expect(reaction).toMatchObject({type:'weapon',system:{range:{value:150,long:600},damage:{base:{number:1,denomination:8,bonus:'',types:['piercing']}}}});
    expect(activity).toMatchObject({type:'attack',activation:{type:'reaction'},attack:{ability:'dex'},damage:{includeBase:true,parts:[]}});
    expect((projectActor(actor).items as any[]).find(i=>i.name==='Pelliton’s Archer').damageFormula).toBe('1d8+3');
  });
  test.each([['dex',16,'1d8+3'],['str',8,'1d8-1'],['wis',10,'1d8']] as const)('resolves only the bound %s ability modifier', (ability,score,expected)=>{
    expect(projection(ability,score).damageFormula).toBe(expected);
  });
  test('keeps unbound, unknown and nontrivial variable bonuses unresolved',()=>{
    expect(projection('dex',undefined).damageFormula).toBe('1d8+@mod');
    expect(projection('unknown',undefined).damageFormula).toBe('1d8+@mod');
    expect(projection('dex',16,'@mod+1').damageFormula).toBe('1d8+@mod+1');
    expect(projection('dex',16,'3').damageFormula).toBe('1d8+3');
  });
  test('each supplementary activity uses its own explicit ability and leaves custom damage unresolved',()=>{
    const part=(number:number,denomination:number,custom=false)=>({number,denomination,bonus:'@mod',types:['piercing'],custom:{enabled:custom,formula:custom?'1d8+@mod':''}});
    const attack=(ability:string,damage:any)=>({type:'attack',attack:{ability,flat:false},damage:{includeBase:false,parts:[damage]}});
    const artifact={system:{abilities:{dex:{value:16},str:{value:8}},attributes:{},details:{}},items:[{
      name:'Mixed counters',type:'feat',system:{activities:{
        ranged:attack('dex',part(1,8)),melee:attack('str',part(1,6)),
        unbound:{type:'damage',damage:{parts:[part(1,4)]}},custom:attack('dex',part(1,8,true)),
      }},
    }]};
    const original=JSON.stringify(artifact);
    const item=(projectActor(artifact).items as any[])[0];
    expect(item.damageFormulas).toEqual(['1d8+3','1d6-1','1d4+@mod','1d8+@mod']);
    expect(item.activities.map((a:any)=>a.damageFormulas)).toEqual([['1d8+3'],['1d6-1'],['1d4+@mod'],['1d8+@mod']]);
    expect(JSON.stringify(artifact)).toBe(original);
  });
  test('still rejects actual damage/ability drift instead of accepting the description',async()=>{
    const {ir,markdown,actor}=await generated();
    const reaction=actor.items.find((i:any)=>i.name==='Pelliton’s Archer');
    const activity=Object.values(reaction.system.activities)[0] as any;
    const part=reaction.system.damage.base;
    part.number=2;
    expect(verifyMonsterIntake(source,ir,markdown,actor).findings.some(f=>f.code==='ACTOR_DAMAGE_FORMULA_DRIFT')).toBe(true);
    part.number=1;activity.attack.ability='str';
    expect(verifyMonsterIntake(source,ir,markdown,actor).findings.some(f=>f.code==='ACTOR_DAMAGE_FORMULA_DRIFT')).toBe(true);
  });
});

// The installed 5.3.3 RangeField contains value/units/special/override, not
// reach/long. The existing runtime comparison may reconstruct those fields only
// from a real parent Item range; it must never ignore their source values.
function rangeFieldReadback(actor:any){
  const readback=structuredClone(actor);
  for(const item of readback.items)for(const activity of Object.values(item.system.activities??{}) as any[]){
    delete activity.range?.long;delete activity.range?.reach;
  }
  return readback;
}
const bonusThrow=`---
名称: 投掷者
类型: npc
体型: 中型
生物类型: 类人生物
能力: {力量: 14, 敏捷: 10, 体质: 12, 智力: 10, 感知: 10, 魅力: 10}
护甲等级: 12
生命值: 20
挑战等级: 1
熟练加值: 2
附赠动作:
  - 名称: 反手投掷
    类型: attack
    攻击类型: mwak
    命中: 4
    范围: 触及 5 尺或射程 20/60 尺
    伤害: [{公式: 1d6+2, 类型: piercing}]
    描述: 作为附赠动作进行一次投掷攻击，触及5尺或射程20/60尺，命中造成1d6+2穿刺伤害。
---
`;
const englishCounter=`---
layout: creature
name: Watcher
armor_class: 12
hit_points: 20
challenge: 1
dex: 16
str: 10
con: 10
int: 10
wis: 10
cha: 10
---
### Reactions
***Counter Shot.*** Ranged Weapon Attack: +5 to hit, range 80/320 ft., one target. Hit: 6 (1d6 + 3) piercing damage.
`;
const bonusRanged=bonusThrow.replace('力量: 14, 敏捷: 10','力量: 10, 敏捷: 14')
  .replace('攻击类型: mwak','攻击类型: rwak').replace('触及 5 尺或射程 20/60 尺','20/60 尺')
  .replace('投掷攻击，触及5尺或射程20/60尺','远程武器攻击，射程20/60尺');
describe('three-blocker native long-range readback',()=>{
  test.each([
    ['captured structured reaction',():string=>renderMonsterIntakeMarkdown(structuredClone(capturedIr) as MonsterIntakeIR),'Pelliton’s Archer','reaction',150,600],
    ['structured ranged bonus',():string=>bonusRanged,'反手投掷','bonus',20,60],
    ['English reaction',():string=>englishCounter,'Counter Shot','reaction',80,320],
  ] as const)('%s preserves source long range through the supported parent schema',async(_label,content,name,activation,normal,long):Promise<void>=>{
    const output=await convertMarkdownContentToJson({content:content(),fvttVersion:'14',effectProfile:'core',translationService:null,iconOptions:{mode:'off'}});
    const actor=output.rawJson as any,item=actor.items.find((i:any)=>i.name===name);
    expect(()=>assertActorSemantics(actor,rangeFieldReadback(actor))).not.toThrow();
    expect(item).toMatchObject({type:'weapon',system:{equipped:true,range:{value:normal,long},damage:{base:{bonus:''}}}});
    const activity=Object.values(item.system.activities)[0] as any;
    expect(activity).toMatchObject({type:'attack',attack:{flat:false},activation:{type:activation},damage:{includeBase:true,parts:[]}});
    const wrong=rangeFieldReadback(actor);wrong.items.find((i:any)=>i.name===name).system.range.long=long/2;
    expect(()=>assertActorSemantics(actor,wrong)).toThrow('range');
  });
  test('keeps a melee-only reaction as a feat and legacy ranged reactions unchanged',async()=>{
    const melee=bonusThrow.replace('附赠动作:','反应:').replace('触及 5 尺或射程 20/60 尺','触及 5 尺');
    const meleeOutput=await convertMarkdownContentToJson({content:melee,fvttVersion:'14',effectProfile:'core',translationService:null});
    expect((meleeOutput.rawJson as any).items.find((i:any)=>i.name==='反手投掷').type).toBe('feat');
    const legacy=await convertMarkdownContentToJson({content:englishCounter,fvttVersion:'12',effectProfile:'core',translationService:null});
    expect((legacy.rawJson as any).items.find((i:any)=>i.name==='Counter Shot').type).toBe('feat');
    const flat=await convertMarkdownContentToJson({content:bonusRanged.replace('命中: 4','命中: 9'),fvttVersion:'14',effectProfile:'core',translationService:null});
    expect((flat.rawJson as any).items.find((i:any)=>i.name==='反手投掷').type).toBe('feat');
    const unsupportedThrow=await convertMarkdownContentToJson({content:bonusThrow,fvttVersion:'14',effectProfile:'core',translationService:null});
    expect((unsupportedThrow.rawJson as any).items.find((i:any)=>i.name==='反手投掷').type).toBe('feat');
  });
});

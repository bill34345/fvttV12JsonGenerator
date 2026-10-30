import {describe,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {ItemParser} from '@fvtt-json-generator/parser/item-parser';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {generateActorArtifact} from '@fvtt-json-generator/workflows/generation-pipeline';
import {generateItemArtifacts} from '@fvtt-json-generator/workflows/item-generation';
import {enforceCoreConditionLifecycles,extractExplicitlyInflictedStatuses,inferredAppliedConditions} from '@fvtt-json-generator/generation/actor-effects';
import {verifyGeneratedDocument} from '@fvtt-json-generator/generation/verification';
import type {ParsedItem} from '@fvtt-json-generator/models/item';
import {dump} from 'js-yaml';

function sourceActor(status:string,first:string,second:string):string{
  return `---
名称: Effect Source Keeper
类型: npc
体型: 中型
生物类型: 怪兽
护甲等级: 12
生命值: 30
能力: {力量: 12, 敏捷: 12, 体质: 12, 智力: 12, 感知: 12, 魅力: 12}
挑战等级: 1
动作:
  - 名称: Layered Condition
    类型: save
    DC: 14
    DC来源: literal
    属性: 感知
    描述: On a failed save, the target becomes ${status}.
    内嵌效果:
      - 类型: ${status}
        描述: ${first}
        持续: 1 minute
      - 类型: ${status}
        描述: ${second}
        持续: 2 rounds
---
`;
}

describe('source Effect descriptions and versioned passive Item verification',()=>{
  for(const status of ['frightened','blinded','poisoned'])test(`retains independent ${status} descriptions and idempotent complete Actor processing`,async()=>{
    const first=`First ${status} lasts 1 minute.`,second=`Second ${status} lasts 2 rounds.`;
    const source=sourceActor(status,first,second),parsed=new YamlParser().parse(source);
    const generated=await generateActorArtifact({sourceText:source,parsed,route:'chinese',fvttVersion:'14',effectProfile:'core'});
    const actor=generated.actor,item=actor.items.find((entry:any)=>entry.name.includes('Layered Condition'));
    expect(item.effects).toHaveLength(2);
    expect(item.effects[0].description).toContain(first);expect(item.effects[0].description).not.toContain(second);
    expect(item.effects[1].description).toContain(second);expect(item.effects[1].description).not.toContain(first);
    expect(item.effects.map((effect:any)=>effect.duration)).toEqual([expect.objectContaining({seconds:60}),expect.objectContaining({rounds:2})]);
    expect(new Set(item.effects.map((effect:any)=>effect._id)).size).toBe(2);
    const activity=Object.values(item.system.activities)[0] as any;
    expect(activity.effects.map((effect:any)=>effect._id)).toEqual(item.effects.map((effect:any)=>effect._id));
    const sourceByItem=new Map([[actor.items.indexOf(item),`On a failed save, the target becomes ${status}.`]]);
    const before=structuredClone(actor);enforceCoreConditionLifecycles(actor,sourceByItem);enforceCoreConditionLifecycles(actor,sourceByItem);
    expect(actor).toEqual(before);
  });

  test('recognizes the real V12 staged Item passive AC effects without changing its generated mechanics',async()=>{
    const source=readFileSync('obsidian/dnd数据转fvttjson/input/items/三祷之坠.md','utf8');
    const artifacts=await generateItemArtifacts(new ItemParser().parse(source),{sourceText:source,fvttVersion:'12',effectProfile:'core'});
    expect(artifacts).toHaveLength(3);
    expect(artifacts.flatMap(artifact=>artifact.diagnostics.filter(diagnostic=>diagnostic.severity==='error'))).toEqual([]);
    expect(artifacts.map(artifact=>(artifact.item.effects as any[]).find(effect=>effect.transfer)?.changes[0].value)).toEqual(['+1','+2','+3']);
  });

  for(const version of ['12','13','14'] as const)test(`strictly verifies ${version} passive AC shape, value and transfer`,async()=>{
    const parsed:ParsedItem={name:'Versioned Guard',type:'equipment',description:'Wearing this charm grants +2 AC.',structuredActions:{effects:[{
      name:'Guard Bonus',type:'effect',passiveEffect:{type:'acBonus',value:2,description:'Wearing this charm grants +2 AC.'},
    }]}};
    const [generated]=await generateItemArtifacts(parsed,{fvttVersion:version,effectProfile:'core'});
    expect(generated!.verification.diagnostics.filter(diagnostic=>diagnostic.severity==='error')).toEqual([]);
    const before=structuredClone(generated!.item);
    const verify=(output:any)=>verifyGeneratedDocument({canonical:generated!.canonical,output,target:version,effectProfile:'core'});
    const changes=(item:any)=>version==='14'?item.effects[0].system.changes:item.effects[0].changes;
    for(const mutate of [
      (item:any)=>{item.effects=[];},
      (item:any)=>{item.effects[0].transfer=false;},
      (item:any)=>{changes(item)[0].value=9;},
      (item:any)=>{changes(item)[0].key='system.attributes.hp.max';},
      (item:any)=>{if(version==='14')changes(item)[0].type='override';else changes(item)[0].mode=5;},
    ]){const wrong=structuredClone(generated!.item);mutate(wrong);expect(verify(wrong).status).toBe('failed');}
    if(version!=='14'){
      const wrong=structuredClone(generated!.item),effect=wrong.effects?.[0];
      if(!effect)throw new Error('The positive passive AC fixture must contain its Effect.');
      effect.disabled=true;expect(verify(wrong).status).toBe('failed');
    }
    expect(generated!.item).toEqual(before);
  });

  test('an unrelated Item keeps its complete output through verification',async()=>{
    const [generated]=await generateItemArtifacts({name:'Plain Token',type:'loot',description:'A plain token with no mechanical benefit.'},{fvttVersion:'12',effectProfile:'core'});
    const before=structuredClone(generated!.item);
    expect(verifyGeneratedDocument({canonical:generated!.canonical,output:generated!.item,target:'12',effectProfile:'core'}).status).toBe('accepted');
    expect(generated!.item).toEqual(before);
  });

  test('an unrelated Actor keeps its complete output through lifecycle processing',async()=>{
    const source=sourceActor('frightened','Unused first.','Unused second.').split('动作:')[0]+'---\n';
    const generated=await generateActorArtifact({sourceText:source,parsed:new YamlParser().parse(source),route:'chinese',fvttVersion:'14',effectProfile:'core'});
    const before=structuredClone(generated.actor);enforceCoreConditionLifecycles(generated.actor);
    expect(generated.actor).toEqual(before);
  });

  test('negative status prose supplies no inferred condition declaration',()=>{
    const source='The target is not blinded.';
    expect(extractExplicitlyInflictedStatuses(source,true)).toEqual([]);
    expect(inferredAppliedConditions(source)).toEqual([]);
  });

  test.each([
    ['The target is charmed until it dies or the effect is dispelled.',['charmed']],
    ['The target is frightened until it is blinded.',['frightened']],
    ['The effect lasts until the creature dies.',[]],
    ['目标陷入魅惑，直到它死亡或效果被解除。',['charmed']],
    ['目标陷入恐慌，直至目标陷入中毒。',['frightened']],
  ] as const)('termination clauses do not apply their mentioned status: %s',(source,expected)=>{
    expect(extractExplicitlyInflictedStatuses(source,true)).toEqual([...expected]);
    expect(inferredAppliedConditions(source).flatMap(entry=>entry.statuses)).toEqual([...expected]);
  });

  test.each([
    'The target immediately dies.',
    'On a failed save, the creature dies.',
    'If this curse is removed, the creature dies.',
    '目标立即死亡。',
  ])('an explicit death consequence still supplies its native template: %s',source=>{
    expect(extractExplicitlyInflictedStatuses(source,true)).toEqual(['dead']);
    expect(inferredAppliedConditions(source).flatMap(entry=>entry.statuses)).toEqual(['dead']);
  });

  test('the saved conditional touch keeps its GM consequence without a death template',async()=>{
    const consequence='The creature shape-shifts into a Lemure Aspirant that is hostile to all creatures until it dies or the effect is dispelled.';
    const description='Melee Spell Attack: +12, reach 5 ft. Hit: 34 (8d6 + 6) Psychic damage. A creature reduced to 0 Hit Points by this damage must make a Charisma Saving Throw: DC 20. Failure: '+consequence;
    const source='---\n'+dump({名称:'Conditional Touch Keeper',类型:'npc',护甲等级:12,生命值:40,挑战等级:1,
      能力:{力量:14,敏捷:12,体质:14,智力:10,感知:10,魅力:10},动作:[{
        名称:'Conditional Touch',类型:'attack',攻击类型:'msak',命中:12,范围:'触及 5 尺',
        伤害:[{公式:'8d6+6',类型:'psychic'}],描述:description,执行模式:'native-with-gm',nativeRuleText:description,manualRemainder:description,
        gmTriggeredSave:{dc:20,ability:'cha',trigger:'A creature reduced to 0 Hit Points by this damage',failureStatuses:[],sourceText:description},
      }]},{lineWidth:-1})+'---\n';
    const generated=await generateActorArtifact({sourceText:source,parsed:new YamlParser().parse(source),route:'chinese',fvttVersion:'14',effectProfile:'core'});
    const item=generated.actor.items.find((entry:any)=>entry.name.includes('Conditional Touch'));
    expect(item.effects).toEqual([]);
    expect((Object.values(item.system.activities) as any[]).map(activity=>activity.type).sort()).toEqual(['attack','save']);
    expect(item.system.description.value).toContain(consequence);
    expect(generated.diagnostics.filter(diagnostic=>diagnostic.severity==='error')).toEqual([]);
  });
});

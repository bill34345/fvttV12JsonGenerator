import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { ActorGenerator } from '@fvtt-json-generator/generation/actor';

async function generated(languages:string[]){
  const content=`---\n${yaml.dump({名称:'Language source fixture',类型:'npc',护甲等级:12,生命值:30,
    能力:{力量:10,敏捷:12,体质:14,智力:10,感知:10,魅力:10},语言:languages,
    动作:[{名称:'Fixture strike',类型:'attack',激活:'action',攻击类型:'mwak',命中:3,范围:'触及 5 尺',伤害:[{公式:'1d6',类型:'slashing'}]}]},{lineWidth:-1})}---\n`;
  const response=await convertFinalActorSource(buildForgeActorRequest({content,displayName:'Language source fixture',requestId:'all-language-fixture',fvttVersion:'14.364',systemVersion:'5.3.3'}));
  expect('result' in response).toBe(true);if(!('result' in response))throw new Error('Formal language fixture failed.');
  if(response.result.status!=='accepted')throw new Error(`Formal language fixture was ${response.result.status}.`);
  expect(response.result.status).toBe('accepted');return response.result.artifact as any;
}

describe('locked v14 all-language schema key',()=>{
  test('maps the source word, the canonical code and the existing Chinese label to ALL through the formal workflow',async()=>{
    const baseline=await generated(['ALL']);
    for(const source of ['All','all','ALL','泛语言']){
      const actor=await generated([source]);
      expect(actor.system.traits.languages).toEqual({value:['ALL'],custom:''});
      expect(actor).toEqual(baseline);
    }
  });
  test('does not treat a partial or unknown language phrase as all languages',async()=>{
    const actor=await generated(['common','All but Draconic','Allied signs']);
    expect(actor.system.traits.languages.value).toEqual(['common','All but Draconic','Allied signs']);
    const baseline=await generated(['common']);
    const normalized=structuredClone(actor);normalized.system.traits.languages.value=['common'];
    expect(normalized).toEqual(baseline);
  });
  test('leaves the legacy target language mapping unchanged',()=>{
    const actor=new ActorGenerator({fvttVersion:'12'}).generate({name:'Legacy language fixture',type:'npc',abilities:{},attributes:{},details:{},
      traits:{languages:['泛语言','All']},skills:{},saves:[],items:[]} as any);
    expect(actor.system.traits.languages.value).toEqual(['all','All']);
  });
});

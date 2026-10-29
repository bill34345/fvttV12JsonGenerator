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
  test('normalizes known English language labels in source casing through the formal v14 workflow',async()=>{
    for(const [source,codes] of [
      [['Aquan','Common','Giant'],['aquan','common','giant']],
      [['AURAN','IGNAN','TERRAN'],['auran','ignan','terran']],
      [['通用语','DrAcOnIc','水族语'],['common','draconic','aquan']],
    ]){
      const actor=await generated(source!);
      const baseline=await generated(codes!);
      expect(actor.system.traits.languages).toEqual({value:codes,custom:''});
      expect(actor).toEqual(baseline);
    }
  });
  test('maps every supported v14 code and known aliases without altering the Actor shape', async () => {
    // The complete leaf/code set in locked dnd5e 5.3.3 module/config.mjs.
    const codes = ['aarakocra','abyssal','aquan','auran','cant','celestial','common','deep','draconic','druidic','dwarvish','elvish','giant','gith','gnoll','gnomish','goblin','halfling','ignan','infernal','orc','primordial','sign','sylvan','terran','undercommon'];
    const actor = await generated(codes.map(code => code.toUpperCase()));
    const baseline = await generated(codes);
    expect(actor.system.traits.languages).toEqual({ value: codes, custom: '' });
    expect(actor).toEqual(baseline);
    const aliases = await generated(['Abyssal','深渊语','深语','Deep Speech','Dwarven','侏儒语','原初语']);
    expect(aliases.system.traits.languages.value).toEqual(['abyssal','abyssal','deep','deep','dwarvish','gnomish','primordial']);
    expect(aliases).toEqual(await generated(['abyssal','abyssal','deep','deep','dwarvish','gnomish','primordial']));
    const rareAliases = await generated(['手语','盗贼黑话','德鲁伊语','吉斯语','豺狼人语','鸟人语']);
    expect(rareAliases.system.traits.languages.value).toEqual(['sign','cant','druidic','gith','gnoll','aarakocra']);
  });
  test('preserves similar unknown phrases and every unrelated actor field',async()=>{
    const actor=await generated(['Aquan signs','All but Draconic']);
    expect(actor.system.traits.languages).toEqual({value:[],custom:'Aquan signs; All but Draconic'});
    const baseline=await generated([]);
    const normalized=structuredClone(actor);normalized.system.traits.languages.custom='';
    expect(normalized).toEqual(baseline);
  });
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
    expect(actor.system.traits.languages).toEqual({value:['common'],custom:'All but Draconic; Allied signs'});
    const baseline=await generated(['common']);
    const normalized=structuredClone(actor);normalized.system.traits.languages.custom='';
    expect(normalized).toEqual(baseline);
  });
  test('leaves the legacy target language mapping unchanged',()=>{
    const actor=new ActorGenerator({fvttVersion:'12'}).generate({name:'Legacy language fixture',type:'npc',abilities:{},attributes:{},details:{},
      traits:{languages:['泛语言','All','Aquan']},skills:{},saves:[],items:[]} as any);
    expect(actor.system.traits.languages.value).toEqual(['all','All','Aquan']);
  });
});

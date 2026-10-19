import {describe,test,expect} from 'bun:test';
import {localizationRequest,localizationText,validateLocalizationDraft} from '@fvtt-json-generator/contracts/localization';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';

function check(source:string,text:string){
  const field=localizationText('body',source),request=localizationRequest(hashSource(source),[field]);
  return validateLocalizationDraft(request,{texts:[{id:field.id,text}]}).texts[0]!.text;
}
describe('source-bound experience-point display labels',()=>{
  test('retains a grouped printed amount while completing the XP header in Chinese',()=>{
    expect(check('<p>Proof Beast<br>XP 1,100<br>Actions</p>','<p>测试怪物<br>XP 1,100<br>动作</p>'))
      .toBe('<p>测试怪物<br>经验值 1,100<br>动作</p>');
  });
  test('handles a plain stat line and keeps its original whitespace and number',()=>{
    expect(check('XP 700\nProof Beast','XP 700\n测试怪物')).toBe('经验值 700\n测试怪物');
  });
  test('preserves a Chinese grouping comma from the real saved Sea Hag draft',()=>{
    expect(check('<p>XP 2,900 Proficiency Bonus +3</p>','<p>XP 2，900 熟练加值 +3</p>'))
      .toBe('<p>经验值 2，900 熟练加值 +3</p>');
  });
  test('completes the XP suffix in a source-explicit Challenge annotation',()=>{
    expect(check('<p>Challenge 2 (450 XP)</p>','<p>挑战等级 2 (450 XP)</p>')).toBe('<p>挑战等级 2 (450 经验值)</p>');
  });
  test('keeps an already complete translation identical',()=>{
    const text='<p>经验值 1,100</p>';
    expect(check('<p>XP 1,100</p>',text)).toBe(text);
  });
  test('does not hide a wrong amount or unrelated unfinished English',()=>{
    expect(()=>check('<p>XP 1,100</p>','<p>XP 1,200</p>')).toThrow();
    expect(()=>check('<p>XP 1,100<br>Proof Beast</p>','<p>XP 1,100<br>测试 Beast</p>')).toThrow('未完成中文化');
    expect(()=>check('<p>Proof Beast 700</p>','<p>测试怪物 XP 700</p>')).toThrow('未完成中文化');
  });
  test('never normalizes an XP proper name or a title',()=>{
    expect(()=>check('The XP Guard protects 700 coins.','XP 守卫保护 700 枚钱币。')).toThrow('未完成中文化');
    const field=localizationText('title','XP 700'),request=localizationRequest(hashSource(field.source),[field]);
    expect(()=>validateLocalizationDraft(request,{texts:[{id:field.id,text:'XP 700 怪物'}]})).toThrow('未完成中文化');
  });
});
describe('source-bound original size label in complete Chinese',()=>{
  for(const row of [
    {source:'<p>Size Colossal</p>',text:'<p>体型 庞巨</p>',expected:'<p>体型 庞巨（Colossal）</p>'},
    {source:'<p>Size Colossal (45 ft. tall)</p>',text:'<p>体型 庞巨（45 尺高）</p>',expected:'<p>体型 庞巨（Colossal）（45 尺高）</p>'},
    {source:'Size Colossal (60 ft. long)\n原文尺寸：Colossal (60 ft. long)。尺寸相关规则由 GM 手动判断。',
      text:'体型：庞巨（60 尺长）\n原文尺寸：庞巨（60 尺长）。尺寸相关规则由 GM 手动判断。',
      expected:'体型：庞巨（Colossal）（60 尺长）\n原文尺寸：庞巨（Colossal）（60 尺长）。尺寸相关规则由 GM 手动判断。'},
  ])test(row.source,()=>{expect(check(row.source,row.text)).toBe(row.expected);expect(check(row.source,row.expected)).toBe(row.expected);});
  test('rejects an unrelated proper name, an extra occurrence, changed dimensions and other residual English',()=>{
    expect(()=>check('The Colossal Guard waits.','Colossal 守卫等待。')).toThrow('未完成中文化');
    expect(()=>check('Size Colossal (45 ft. tall)','体型 庞巨（46 尺高）')).toThrow('改变数字');
    expect(()=>check('Size Colossal','体型 庞巨（Colossal） Colossal')).toThrow('完整保留原文尺寸');
    expect(()=>check('Size Colossal','体型 庞巨 Guard')).toThrow('未完成中文化');
  });
  test('keeps ordinary source size translations unchanged',()=>{
    expect(check('Size Huge (12 ft. tall)','体型 巨型（12 尺高）')).toBe('体型 巨型（12 尺高）');
  });
  test('preserves the original label without relabeling the approved native maximum or the GM instruction',()=>{
    const source='<p>Size Colossal (45 ft. tall)<br>原文尺寸：Colossal (45 ft. tall)。角色卡使用最大原生尺寸 gargantuan（超巨型）；尺寸相关规则由 GM 手动判断。</p>';
    const translated='<p>体型 庞巨（45 尺高）<br>原文尺寸：庞巨（45 尺高）。角色卡使用最大原生尺寸 超巨型；尺寸相关规则由 GM 手动判断。</p>';
    expect(check(source,translated)).toBe('<p>体型 庞巨（Colossal）（45 尺高）<br>原文尺寸：庞巨（Colossal）（45 尺高）。角色卡使用最大原生尺寸 超巨型；尺寸相关规则由 GM 手动判断。</p>');
  });
});

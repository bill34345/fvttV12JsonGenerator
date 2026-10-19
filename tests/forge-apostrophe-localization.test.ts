import {describe,test,expect} from 'bun:test';
import {localizationText,localizationRequest,validateLocalizationDraft,protectLocalizationText,normalizeLocalizationBodyProse,localizationMeaningFindings,approveLocalizationByGm} from '@fvtt-json-generator/contracts/localization';
import {createReviewedTranslationService} from '@fvtt-json-generator/intake-ai/localization';
function check(source:string,text:string,kind:'body'|'title'='body'){
 const field=localizationText(kind,source),request=localizationRequest('apostrophe-boundary-source',[field]);
 return validateLocalizationDraft(request,{texts:[{id:field.id,text}]}).texts[0]!.text;
}

describe('source-bound Chinese display prose cleanup',()=>{
 test('does not normalize unchanged author-owned Chinese text',()=>{
  const text='<p>### 作者自己的标题<br>**原样保留。**</p>';
  expect(normalizeLocalizationBodyProse(text,text)).toBe(text);
 });
 test('cleans only source grammatical apostrophes and literal prose Markdown',()=>{
  const source='<p>The sentinel&#39;s watch.</p>',text="<p>### 哨兵'守望<br>**保持警惕。**</p>";
  expect(normalizeLocalizationBodyProse(source,text)).toBe('<p>哨兵守望<br>保持警惕。</p>');
  expect(source).toBe('<p>The sentinel&#39;s watch.</p>');
 });
 test('real quoted words, attributes and URLs are preserved',()=>{
  const source='<p title="watch">The word &#39;Ward&#39; is used. https://example.org/rule#part</p>';
  const text='<p title="watch">使用&#39;守护&#39;一词。 https://example.org/rule#part</p>';
  expect(normalizeLocalizationBodyProse(source,text)).toBe(text);
  const attribute='<p title="sentinel&#39;s">守望。</p>';
  expect(normalizeLocalizationBodyProse(attribute,attribute)).toBe(attribute);
 });
 test('does not hide excess protected punctuation or rewrite numeric formulas',()=>{
  const source='<p>The sentinel&#39;s watch deals 2 (1d6) Fire damage.</p>';
  const text='<p>哨兵&#39;&#39;守望造成2（1d6）火焰伤害。</p>';
  expect(normalizeLocalizationBodyProse(source,text)).toBe(text);
  expect(()=>check(source,text)).toThrow();
 });
 test('does not erase paired quotations or Latin names within a grammatical punctuation budget',()=>{
  const source='<p>The sentinel&#39;s watch and the keeper&#39;s warning.</p>';
  for(const text of ["<p>使用'守护'一词。</p>",'<p>使用&#39;守护&#39;一词。</p>',"<p>O'Neill守望。</p>"]){
   expect(normalizeLocalizationBodyProse(source,text)).toBe(text);
  }
 });
 test('plural possessives do not disable cleanup of a complete multi-paragraph body',()=>{
  const source='<p>For expediency&#39;s sake.<br>The books&#39; allies arrive.<br>The caster&#39;s save.</p>';
  const text='<p>为方便起见。&#39;<br>这些书&#39;的盟友到来。<br>施法者&#39;的豁免。</p>';
  const clean='<p>为方便起见。<br>这些书的盟友到来。<br>施法者的豁免。</p>';
  expect(normalizeLocalizationBodyProse(source,text)).toBe(clean);
  expect(check(source,clean)).toBe(clean);
  const field=localizationText('body',source),request=localizationRequest('generic-prose-approval',[field]);
  const draft={texts:[{id:field.id,text}]};
  expect(()=>validateLocalizationDraft(request,draft)).not.toThrow();
  expect(localizationMeaningFindings(request,draft).some(f=>f.includes('撇号'))).toBe(true);
  expect(()=>approveLocalizationByGm(request,draft,'fixture-gm')).toThrow('撇号');
  expect(()=>approveLocalizationByGm(request,{texts:[{id:field.id,text:clean}]},'fixture-gm')).not.toThrow();
 });
 test('inline HTML cannot turn a paired quotation into two disposable orphan marks',()=>{
  const source='<p>The keeper&#39;s <em>book</em> and sentinel&#39;s watch.</p>';
  const text="<p>称为'<em>守护</em>'的文字。</p>";
  expect(normalizeLocalizationBodyProse(source,text)).toBe(text);
 });
 test('plural possessives do not license deletion of real source quotations',()=>{
  const source='<p>The books&#39; keeper uses &#39;Ward&#39;.</p>';
  const text='<p>这些书&#39;的守卫使用&#39;守护&#39;。</p>';
  expect(normalizeLocalizationBodyProse(source,text)).toBe(text);
  expect(check(source,text)).toBe(text);
 });
 test('a PDF line wrap does not hide an isolated grammatical mark before Chinese continuation',()=>{
  const source='<p>The creature&#39;s turn.<br>One item of the<br>ally&#39;s choice.</p>';
  const text='<p>该生物&#39;的回合。<br>由其<br>    &#39;选择的一件物品。</p>';
  const expected='<p>该生物的回合。<br>由其<br>    选择的一件物品。</p>';
  expect(normalizeLocalizationBodyProse(source,text)).toBe(expected);
  expect(check(source,expected)).toBe(expected);
  const quotedSource='<p>The creature&#39;s choice is called &#39;Last<br>Wish&#39;.</p>';
  const quoted='<p>该生物&#39;的选择称为&#39;最终<br>愿望&#39;。</p>';
  expect(normalizeLocalizationBodyProse(quotedSource,quoted)).toBe(quoted);
 });
 test('cleans complete Markdown emphasis and source-owned quotation prefixes in translated prose',()=>{
  const source='<p>&gt; &gt; ### Watch<br>&gt; &gt; ***Warning.*** The watch ends.<br>A value is &gt; 5.</p>';
  const text='<p>&gt; &gt; ### 守望<br>&gt; &gt; ***警告。*** 守望结束。<br>一个值 &gt; 5。</p>';
  const clean='<p>守望<br>警告。 守望结束。<br>一个值 &gt; 5。</p>';
  expect(normalizeLocalizationBodyProse(source,text)).toBe(clean);
  expect(check(source,clean)).toBe(clean);
  expect(()=>check(source,clean.replace(' &gt; 5',' 5'))).toThrow();
  const comparison='<p>A value is &gt; 5.</p>';
  expect(normalizeLocalizationBodyProse(comparison,'<p>一个值 &gt; 5。</p>')).toBe('<p>一个值 &gt; 5。</p>');
  for(const prefix of ['&gt; 5','&gt; -5','&gt; &gt; 5']){
   const original='<p>'+prefix+' damage.</p>',translated='<p>'+prefix+'点伤害。</p>';
   expect(normalizeLocalizationBodyProse(original,translated)).toBe(translated);
   expect(()=>check(original,translated.replaceAll('&gt; ',''))).toThrow();
  }
 });
});
describe('source-bound English grammatical apostrophes in Chinese body',()=>{
 for(const row of [
  ["<p>The fiend&#39;s head is horned.</p>",'<p>该邪魔的头上有角。</p>'],
  ["<p>The creature can&#39;t regain 10 HP.</p>",'<p>该生物不能恢复10 HP。</p>'],
  ["<p>At the creature&#39;s turn, the spell&#39;s caster takes 2 (1d6) Fire damage.</p>",'<p>在该生物的回合，法术的施法者受到2（1d6）火焰伤害。</p>'],
 ])test(row[0]!,()=>{expect(check(row[0]!,row[1]!)).toBe(row[1]!);});
 test('retained historical apostrophe spelling stays accepted without mutation',()=>{
  const text='<p>该邪魔&#39;的头上有角。</p>';expect(check("<p>The fiend&#39;s head is horned.</p>",text)).toBe(text);
 });
 test('quotes, attributes, literal HTML entities and enrichers cannot be dropped or injected',()=>{
  expect(()=>check('<p>The word &#39;Ward&#39; is used.</p>','<p>这里使用守护这个词。</p>')).toThrow();
  expect(()=>check('<p title="fiend&#39;s">A head.</p>','<p title="邪魔">头部。</p>')).toThrow();
  expect(()=>check("<p>The fiend&#39;s &lt;b&gt;sign&lt;/b&gt; remains.</p>",'<p>该邪魔的记号保留。</p>')).toThrow();
  expect(()=>check("<p>The fiend&#39;s head.</p>",'<p title="&#39;">该邪魔的头。</p>')).toThrow('受保护标记');
  expect(()=>check("<p>The fiend&#39;s head.</p>",'<p>该邪魔的头。@UUID[Macro.evil]</p>')).toThrow();
 });
 test('numbers, dice, markup and title rules remain strict',()=>{
  expect(()=>check("<p>The spell&#39;s caster takes 10 Fire damage.</p>",'<p>法术施法者受到11火焰伤害。</p>')).toThrow('改变数字');
  expect(()=>check("<p>The spell&#39;s caster takes 2 (1d6) Fire damage.</p>",'<p>法术施法者受到2（1d8）火焰伤害。</p>')).toThrow();
  expect(()=>check("<p>The fiend&#39;s head.</p>",'<div>该邪魔的头。</div>')).toThrow();
  expect(()=>check('Fiend&#39;s Head','邪魔之首','title')).toThrow();
  expect(()=>check("<p>The fiend&#39;s head.</p>",'<p>该邪魔&#39;&#39;的头。</p>')).toThrow('撇号实体');
 });
 test('unrelated localized prose is unchanged',()=>{
  const text='<p>目标受到10火焰伤害。</p>';expect(check('<p>The target takes 10 Fire damage.</p>',text)).toBe(text);
 });
});

describe('actual translation transport leaves grammatical body apostrophes translatable',()=>{
 test('actual service cleans a retained source possessive without changing markup or making another request',async()=>{
  const field=localizationText('body','<p>The sentinel&#39;s watch.</p>'),request=localizationRequest('cleanup-service',[field]);let calls=0;
  const service=createReviewedTranslationService({baseUrl:'https://fixture.invalid',apiKey:'fake-only',model:'fixture',
   httpClient:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({texts:[{id:field.id,text:"⟦0⟧### 哨兵'守望。⟦1⟧"}]})}}]}));}});
  const result=await service.translate(request);
  expect(result.texts[0]!.text).toBe('<p>哨兵守望。</p>');expect(calls).toBe(1);
  expect(()=>validateLocalizationDraft(request,result)).not.toThrow();
 });
 for(const [source,chinese] of [
  ['<p>The fiend&#39;s head is horned.</p>','<p>该邪魔头部有角。</p>'],
  ['<p>The creature can&#x27;t regain 10 HP.</p>','<p>该生物不能恢复10 HP。</p>'],
  ['<p>The spell&apos;s effect ends.</p>','<p>该法术的效果结束。</p>'],
 ])test(source!,async()=>{
  let calls=0;
  const field=localizationText('body',source!),request=localizationRequest('transport-body-fixture',[field]);
  const service=createReviewedTranslationService({baseUrl:'https://fixture.invalid',apiKey:'fake-only',model:'fixture',
   httpClient:async(_url,init)=>{
    calls++;const payload=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    expect(payload.texts[0].source).toMatch(/'(?:s|t)\b/u);
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({texts:[{id:field.id,text:protectLocalizationText(chinese!).text}]})}}]}));
   }});
  const output=await service.translate(request);
  expect(output.texts[0]!.text).toBe(chinese!);expect(calls).toBe(1);
  expect(()=>validateLocalizationDraft(request,output)).not.toThrow();
 });
 test('quoted words, attributes and links stay locked; default title protection is unchanged',()=>{
  for(const source of ['<p>The word &#39;Ward&#39; is used.</p>','<p title="fiend&#39;s">A head.</p>',
   '<p>The fiend&#39;s head. @UUID[Item.test]</p>']){
   const locked=protectLocalizationText(source,{grammaticalApostrophes:'translatable'});
   expect(()=>locked.restore('中文')).toThrow();
   expect(locked.restore(locked.text)).toContain(source.includes('@UUID')?'@UUID[Item.test]':source);
  }
  const title=protectLocalizationText('Fiend&#39;s Head');
  expect(title.text).toContain('⟦0⟧');expect(title.restore(title.text)).toBe('Fiend&#39;s Head');
 });
});

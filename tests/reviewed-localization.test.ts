import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  acceptLocalization, approveLocalizationByGm, assertReviewedLocalization, localizationRequest, localizationText, protectLocalizationText,
  validateLocalizationDraft, FACT_LOCALIZATION_POLICY, LOCALIZATION_TERMS, LEGACY_LOCALIZATION_POLICY, LOCALIZATION_POLICY, localizationHash, decodeEncounterLocalization, type LocalizationPolicy, type LocalizationRequest, type LocalizationDraft,
} from '@fvtt-json-generator/contracts/localization';
import { createActorLocalizationRequest, projectReviewedActorLocalization, formatReviewedTitle } from '@fvtt-json-generator/generation/reviewed-localization';
import {createEncounterTextRequest} from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import {buildActorVerificationSummaryFromValues} from '@fvtt-json-generator/workflows/actor-verification';
import {buildBrowserActorVerificationSummary} from '../packages/forge-browser-runtime/src/actorVerification';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { prepareForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { assertForgeEncounterLocalizationDraft, approveForgeEncounterLocalization, draftForgeEncounterLocalization,
  reviewForgeEncounterLocalizationDraft, reviseForgeEncounterLocalizationBody, verifiedEncounterLocalizationProgress } from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import { serializeForgeEncounterPackage, type ForgeEncounterPackage } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { fixedEncounterCommand, readFixedEncounterConfiguration } from '@fvtt-json-generator/intake-ai/encounter-capabilities';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { normalizeForgeActorArtifact } from '../packages/forge-browser-runtime/src/artifact';
import { createReviewedTranslationService } from '@fvtt-json-generator/intake-ai/localization';
import foodFailure from './fixtures/localization-food-retention-failure.json';
import {normalizeLocalizationBodyProse,localizationMeaningFindings} from '@fvtt-json-generator/contracts/localization';

test('known participant-category contradictions need no provider review request',async()=>{
 const field=localizationText('body','<p>The sentinel watches creatures that enter.</p>'),request=localizationRequest('generic-participant-review',[field]);
 let calls=0;
 const service=createReviewedTranslationService({baseUrl:'https://fixture.invalid',apiKey:'fake-only',model:'fixture',
  httpClient:async()=>{calls++;throw Error('A known local contradiction must not request AI review');}});
 const result=await service.review(request,{texts:[{id:field.id,text:'<p>守卫监视进入的建筑。</p>'}]});
 expect(result.verdict).toBe('needs_review');expect(result.findings.join(' ')).toContain('对象类别');expect(calls).toBe(0);
});

test('translation and review share the display-mode rule while request identities remain unchanged',async()=>{
  const field=localizationText('body','执行模式：gm-assisted；外部边界：external-rule。'),input=localizationRequest('display-mode-review',[field]);
  const original=structuredClone(input),prompts:string[]=[];
  const service=createReviewedTranslationService({baseUrl:'https://fixture.invalid/v1',apiKey:'fixture-only',model:'fixture',
    httpClient:async(_url,init)=>{const payload=JSON.parse(String(init?.body)),system=payload.messages[0].content;prompts.push(system);
      const user=JSON.parse(payload.messages[1].content),review=Object.hasOwn(user.texts[0],'translation');
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(review?{verdict:'accepted',findings:[]}:{texts:[{id:field.id,text:'执行模式：GM辅助处理；外部边界：外部规则裁定。'}]})}}]}));}});
  const draft=await service.translate(input);await expect(service.review(input,draft)).resolves.toEqual({verdict:'accepted',findings:[]});
  expect(prompts).toHaveLength(2);
  for(const system of prompts){expect(system).toContain('gm-assisted');expect(system).toContain('GM辅助处理');expect(system).toContain('外部规则裁定');}
  expect(input).toEqual(original);expect(draft.texts[0]!.id).toBe(field.id);
});

describe('source-owned public URLs stay exact without hiding untranslated prose',()=>{
 const check=(source:string,text:string)=>{const field=localizationText('body',source);
  return validateLocalizationDraft(localizationRequest('generic-url-fixture',[field]),{texts:[{id:field.id,text}]}).texts[0]!.text;};
 for(const url of ['https://docs.example.org/rules/entry','http://reference.example.net/v2?q=17#section',
  'https://archive.example.com/Advantage/3d8?dc=16&amp;part=2#Dazed','https://例子.test/规则/第3章'])
  test(`same exact source URL: ${url}`,()=>{expect(check(`<p>Source: ${url}</p>`,`<p>来源：${url}</p>`)).toBe(`<p>来源：${url}</p>`);});
 test('a URL-only body remains metadata, with no fabricated Chinese requirement',()=>{
  const url='https://docs.example.org/Appendix';expect(check(`<p>${url}</p>`,`<p>${url}</p>`)).toBe(`<p>${url}</p>`);
 });
 test('an entity inside an exact URL does not consume the prose apostrophe budget',()=>{
  const url='https://docs.example.org/a&apos;s';
  expect(check(`<p>The fiend&#39;s note. Source: ${url}</p>`,`<p>该邪魔的便条。来源：${url}</p>`)).toContain(url);
 });
 test('two sources and repeated citations retain their count and order',()=>{
  const a='https://a.example/rules',b='https://b.example/context';
  expect(check(`<p>Sources: ${a} ${b} ${a}</p>`,`<p>来源：${a} ${b} ${a}</p>`)).toContain(b);
  expect(()=>check(`<p>Sources: ${a} ${b}</p>`,`<p>来源：${b} ${a}</p>`)).toThrow('来源网址');
 });
 test('Markdown destination parentheses do not swallow following Chinese rules or dice',()=>{
  const url='https://reference.example.net/rules';
  expect(check(`<p>It begins [Burning](${url}) (1d10).</p>`,`<p>它开始[燃烧](${url})（1d10）。</p>`)).toContain('1d10');
  expect(()=>check(`<p>Read [rules](${url}) then wait.</p>`,`<p>阅读[规则](${url}) untranslated rules。</p>`)).toThrow('未完成中文化');
 });
 test('balanced path parentheses remain part of the exact address',()=>{
  const url='https://reference.example.net/a_(b)';
  expect(check(`<p>Source: [rules](${url})</p>`,`<p>来源：[规则](${url})</p>`)).toContain(url);
  expect(()=>check(`<p>Source: ${url}</p>`,'<p>来源：https://reference.example.net/a_(c)</p>')).toThrow('来源网址');
 });
 for(const changed of ['http://docs.example.org/rules?x=1#top','https://docs.example.org/other?x=1#top',
  'https://docs.example.org/rules?x=2#top','https://docs.example.org/rules?x=1#bottom','https://evil.example/rules?x=1#top'])
  test(`source URL mutation rejected: ${changed}`,()=>{
   expect(()=>check('<p>Source: https://docs.example.org/rules?x=1#top</p>',`<p>来源：${changed}</p>`)).toThrow('来源网址');
  });
 test('missing, duplicated and invented URLs are rejected',()=>{
  const url='https://docs.example.org/rules';
  expect(()=>check(`<p>Source: ${url}</p>`,'<p>来源。</p>')).toThrow('来源网址');
  expect(()=>check(`<p>Source: ${url}</p>`,`<p>来源：${url} ${url}</p>`)).toThrow('来源网址');
  expect(()=>check('<p>A quiet hall.</p>',`<p>安静大厅，来源：${url}</p>`)).toThrow('来源网址');
 });
 test('real untranslated text beside a valid citation still fails',()=>{
  const source='<p>The target cannot move. Source: https://docs.example.org/rules</p>';
  expect(()=>check(source,'<p>The target cannot move. 来源：https://docs.example.org/rules</p>')).toThrow('未完成中文化');
  expect(()=>check(source,'<p>目标不能移动。untranslated prose https://docs.example.org/rules</p>')).toThrow('未完成中文化');
  expect(()=>check(source,'<p>目标不能移动。https://docs.example.org/rules/untranslated-prose</p>')).toThrow('来源网址');
 });
 test('HTML hrefs remain structural and labels still need translation',()=>{
  const source='<p>Read <a href="https://docs.example.org/rules">the rules</a>.</p>';
  expect(check(source,'<p>阅读<a href="https://docs.example.org/rules">规则</a>。</p>')).toContain('规则');
  expect(()=>check(source,'<p>阅读<a href="https://evil.example/rules">规则</a>。</p>')).toThrow();
  expect(()=>check(source,'<p>阅读<a href="https://docs.example.org/rules">the rules</a>。</p>')).toThrow('未完成中文化');
 });
 test('numbers outside URLs and unrelated no-URL cases retain existing checks',()=>{
  const source='<p>Take 10 damage. Source: https://docs.example.org/20</p>';
  expect(()=>check(source,'<p>受到20伤害。来源：https://docs.example.org/20</p>')).toThrow('改变数字');
  expect(check('<p>A quiet hall.</p>','<p>安静的大厅。</p>')).toBe('<p>安静的大厅。</p>');
 });
 test('the actual translation service sends a URL as one protected unit and restores it',async()=>{
  const url='https://archive.example.org/3d8?dc=16#rule';let calls=0;
  const field=localizationText('body',`<p>Read ${url} for 1 minute.</p>`),input=localizationRequest('url-transport',[field]);
  const chinese=`<p>阅读${url}，持续1分钟。</p>`;
  const service=createReviewedTranslationService({baseUrl:'https://fixture.invalid',apiKey:'fixture-only',model:'fixture',
   httpClient:async(_url,init)=>{calls++;const payload=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    expect(payload.texts[0].source).not.toContain('archive.example.org');expect(payload.texts[0].source).not.toContain('3d8');
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({texts:[{id:field.id,text:protectLocalizationText(chinese).text}]})}}]}));}});
  const output=await service.translate(input);expect(output.texts[0]!.text).toBe(chinese);expect(calls).toBe(1);
  expect(()=>validateLocalizationDraft(input,output)).not.toThrow();
 });
});

describe('source-bound food retention meaning', () => {
  const input = foodFailure.request as LocalizationRequest;
  const captured = foodFailure.draft;
  const originalHash = localizationHash(foodFailure);
  const correct = {texts: captured.texts.map(entry => ({...entry,
    text: entry.text.replace('咽下固体食物', '让吃下的固体食物不被吐出')}))};
  const source = 'It can keep solid food down only if washed down with sea water.';
  const candidate = (text: string, english = source) => {
    const request = localizationRequest('food-retention-test', [localizationText('body', english)]);
    return {request, draft: {texts: [{id: request.texts[0]!.id, text}]}};
  };
  test('rejects the exact recorded HTML translation without altering either original field', () => {
    expect(() => validateLocalizationDraft(input, captured)).toThrow('食物留存');
    expect(localizationHash(foodFailure)).toBe(originalHash);
  });
  test('the real translation service carries the meaning guidance and cannot make the captured wrong prose pass', async () => {
    let calls = 0;
    const service = createReviewedTranslationService({baseUrl: 'https://provider.example/v1', apiKey: 'fixture-only', model: 'fixture',
      httpClient: async (_url, init) => {
        calls++;
        const payload = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
        expect(payload.referenceGuidance).toContain('retaining food without vomiting');
        expect(payload.referenceGuidance).toContain('necessary seawater condition');
        expect(payload.texts[0].source).toContain('keep solid food');
        return new Response(JSON.stringify({choices: [{message: {content: JSON.stringify({texts: [{
          id: input.texts[0]!.id, text: protectLocalizationText(captured.texts[0]!.text).text,
        }]})}}]}), {status: 200});
      }});
    const output = await service.translate(input);
    expect(output).toEqual(captured);
    expect(calls).toBe(1);
    expect(() => validateLocalizationDraft(input, output)).toThrow('食物留存');
  });
  test('the public GM approval and imported approval gates reject the same wrong meaning', () => {
    expect(() => approveLocalizationByGm(input, captured, 'fixture-only')).toThrow('食物留存');
    const valid = approveLocalizationByGm(input, correct, 'fixture-only');
    const stale = {...valid, texts: structuredClone(captured.texts), approval: {...valid.approval,
      translationHash: localizationHash({requestHash: valid.requestHash, texts: captured.texts})}};
    expect(() => assertReviewedLocalization(input, stale)).toThrow('食物留存');
  });
  test('correct food retention survives the original HTML split and source/name variants', () => {
    expect(validateLocalizationDraft(input, correct)).toEqual(correct);
    for (const english of [source, source.replace('It can', 'The creature can'), source.replace('food down', 'food\r\ndown'),
      '<p>It can keep solid food</p><p>down only if washed down with sea water.</p>']) {
      const translated = english.startsWith('<p>')
        ? '<p>只有用海水送服，吃下的固体食物</p><p>才不会吐出。</p>'
        : '只有用海水送服，吃下的固体食物才不会吐出。';
      const value = candidate(translated, english);
      expect(validateLocalizationDraft(value.request, value.draft)).toEqual(value.draft);
    }
    const renamed = structuredClone(input);
    renamed.texts[0]!.source = renamed.texts[0]!.source.replace('Merthirst', 'Salt Affliction');
    expect(validateLocalizationDraft(renamed, correct)).toEqual(correct);
  });
  test('accepts explicit equivalent retention wording without prescribing one stylistic translation', () => {
    for (const text of ['它只有用海水送服，才能让吃下的固体食物不被吐出。',
      '只有用海水送服，它才不会吐出吃下的固体食物。',
      '它只有用海水送服，才能留住吃下的固体食物而不呕吐。',
      '固体食物必须用海水送服，否则会吐出。']) {
      const value = candidate(text); expect(validateLocalizationDraft(value.request, value.draft)).toEqual(value.draft);
    }
  });
  test('rejects swallowing alone, missing or inverted conditions, changed liquid and extra exceptions', () => {
    for (const text of ['它只有用海水送服才能咽下固体食物。', '它能留住固体食物而不吐出。',
      '它只有用淡水送服，吃下的固体食物才不会吐出。', '它只有不用海水送服，吃下的固体食物才不会吐出。',
      '只有用海水送服，吃下的固体食物才会吐出。', '只要用海水送服，吃下的固体食物就不会吐出。',
      '只有用海水送服，吃下的固体食物才不会吐出，淡水也可以。']) {
      const value = candidate(text); expect(() => validateLocalizationDraft(value.request, value.draft)).toThrow('食物留存');
    }
  });
  test('does not infer seawater from ambiguous or changed source and keeps existing token checks', () => {
    for (const english of [source.replace('sea water', 'fresh water'), source.replace('only if', 'even if'),
      source.replace('sea water.', 'sea water or fresh water.')]) {
      const value = candidate('只有用海水送服，吃下的固体食物才不会吐出。', english);
      expect(() => validateLocalizationDraft(value.request, value.draft)).toThrow('食物留存');
    }
    const number = structuredClone(correct); number.texts[0]!.text = number.texts[0]!.text.replace('15', '16');
    expect(() => validateLocalizationDraft(input, number)).toThrow('改变数字');
    const markup = structuredClone(correct); markup.texts[0]!.text = markup.texts[0]!.text.replace('<ul>', '<ol>');
    expect(() => validateLocalizationDraft(input, markup)).toThrow('改变数字');
    const unrelated = candidate('它只有用海水送服才能咽下固体食物。', 'It can swallow solid food only if washed down with sea water.');
    expect(validateLocalizationDraft(unrelated.request, unrelated.draft)).toEqual(unrelated.draft);
  });
});

const accepted = { verdict: 'accepted' as const, findings: [] };
function request(source = '<p>DC 16: 3d8 damage; Paralyzed until the end of its next turn.</p>') {
  return localizationRequest('fixture-source', [localizationText('body', source)]);
}
function draft(input: LocalizationRequest, text: string): LocalizationDraft { return { texts: input.texts.map(entry => ({ id: entry.id, text })) }; }

/** Deliberately fake prose: these tests prove structural boundaries, not translation quality. */
function fakeTranslation(input: LocalizationRequest): LocalizationDraft {
  return { texts: input.texts.map(entry => {
    const protectedText = protectLocalizationText(entry.source);
    let text = protectedText.restore(protectedText.text.replace(/[A-Za-z]+/gu, '译文'));
    for (const term of LOCALIZATION_TERMS) if (new RegExp(`\\b${term.english}s?\\b`, 'i').test(entry.source)) text += term.chinese;
    return { id: entry.id, text };
  }) };
}
const fakeService = { model: 'fixture-only', reviewModel: 'independent-fixture-only', translate: async (input: LocalizationRequest) => fakeTranslation(input), review: async () => accepted };

describe('reviewed Chinese display contract', () => {
  test('GM approval records bind request and translation without claiming model acceptance', () => {
    const input = request('A guardian waits.');
    const candidate = draft(input, '守卫等待。');
    const approved = approveLocalizationByGm(input, candidate, 'gm-42');
    expect(approved.version).toBe(2);
    expect(approved.approval).toMatchObject({ kind: 'gm', gmId: 'gm-42' });
    expect((approved as any).review).toBeUndefined();
    expect(assertReviewedLocalization(input, approved)).toEqual(approved);
    const changed = { ...input, sourceHash: 'another-source' };
    expect(() => assertReviewedLocalization(changed, approved)).toThrow();
    expect(() => assertReviewedLocalization(input, { ...approved, texts: [{ ...approved.texts[0], text: '守卫逃走。' }] })).toThrow();
    expect(() => approveLocalizationByGm(input, candidate, '')).toThrow();
  });
  test('real Echo word-count fragments keep the strict literal gate while allowing equivalent Chinese words',()=>{
    const cases=JSON.parse(readFileSync('tests/fixtures/encounter-localization-word-counts.json','utf8')) as Array<{case:string;source:string;rejected:string;corrected:string}>;
    expect(cases).toHaveLength(4);
    for(const entry of cases){
      const input=request(entry.source);
      expect(()=>validateLocalizationDraft(input,draft(input,entry.rejected))).toThrow('改变数字');
      expect(validateLocalizationDraft(input,draft(input,entry.corrected)).texts[0]!.text).toBe(entry.corrected);
    }
    const first=cases[0]!;const input=request(first.source);
    for(const changed of [first.corrected.replace('DC 10','DC 11'),first.corrected.replace('1d6','2d6'),
      `${first.corrected}3`,first.corrected.replace('<p>','<div>')])
      expect(()=>validateLocalizationDraft(input,draft(input,changed))).toThrow('改变数字');
  });
  test('package display R2/R3 and explanatory configured namespace translate without Latin leakage',()=>{
    const cases=JSON.parse(readFileSync('tests/fixtures/encounter-localization-display-labels.json','utf8')) as Array<{case:string;source:string;rejected:string;corrected:string}>;
    expect(cases).toHaveLength(4);
    for(const entry of cases){
      const input=localizationRequest('package-display-fixture',[localizationText(entry.source.includes('Recovery')?'title':'body',entry.source)]);
      expect(()=>validateLocalizationDraft(input,draft(input,entry.rejected))).toThrow('未完成中文化');
      expect(validateLocalizationDraft(input,draft(input,entry.corrected)).texts[0]!.text).toBe(entry.corrected);
    }
    const r2=localizationRequest('package-display-fixture',[localizationText('title',cases[0]!.source)]);
    expect(()=>validateLocalizationDraft(r2,draft(r2,cases[0]!.corrected.replace('第2轮','第3轮')))).toThrow('改变数字');
  });
  test('repair treats a rejected title as an unapproved draft, then shares only its corrected name',async()=>{
    const title=localizationText('title','Chrome Recovery R2 input');
    const notes=localizationText('body','No registered custom conditions exist in this request, so no configured.* status is used.');
    const input=localizationRequest('package-display-fixture',[title,notes]);
    const payloads:Array<{system:string;user:any}>=[];
    const service=createReviewedTranslationService({baseUrl:'https://provider.example/v1',apiKey:'fixture-only',model:'fixture',
      httpClient:async(_url,init)=>{
        const body=JSON.parse(String(init?.body)),system=String(body.messages[0].content),user=JSON.parse(body.messages[1].content);
        payloads.push({system,user});
        const translated={texts:user.texts.map((entry:any)=>({id:entry.id,text:entry.kind==='title'?'浏览器恢复第⟦0⟧轮输入':'本请求中不存在已注册的自定义状态，因此未使用任何已配置的自定义状态。'}))};
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(translated)}}]}),{status:200});
      }});
    const prior={draft:{texts:[{id:title.id,text:'浏览器恢复 R2 输入'},{id:notes.id,text:'本请求未使用 configured.* 状态。'}]},
      findings:[`${title.id}：残留英文 R`,`${notes.id}：残留英文 configured`]};
    const corrected=await service.translate(input,undefined,undefined,prior);
    expect(validateLocalizationDraft(input,corrected)).toEqual(corrected);
    expect(payloads).toHaveLength(2);
    expect(payloads[0]!.system).toContain('render an R⟦n⟧ revision or round label in Chinese');
    expect(payloads[0]!.user.instruction).toContain('prior draft itself is not an approved glossary');
    expect(payloads[0]!.user.consistentNames).toEqual([]);
    expect(payloads[1]!.user.consistentNames).toEqual([{english:title.source,chinese:'浏览器恢复第2轮输入'}]);
    expect(payloads[1]!.system).toContain('configured.* status means 已配置的自定义状态');
  });
  test('translation and repair prompts keep word counts written and honor the supplied title policy',async()=>{
    const payloads:Array<{system:string;user:any}>=[];
    const service=createReviewedTranslationService({baseUrl:'https://provider.example/v1',apiKey:'fixture-only',model:'fixture',
      httpClient:async(_url,init)=>{
        const body=JSON.parse(String(init?.body));const system=String(body.messages[0].content),user=JSON.parse(body.messages[1].content);
        payloads.push({system,user});
        const response=system.startsWith('Independently audit')?accepted
          :{texts:user.texts.map((entry:any)=>({id:entry.id,text:'效果持续一分钟。'}))};
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]}),{status:200});
      }});
    const field=localizationText('body','The effect lasts one-minute.');
    const current=localizationRequest('word-count-fixture',[field]);
    const translated=await service.translate(current,undefined,undefined,{draft:{texts:[{id:field.id,text:'效果持续1分钟。'}]},findings:[`${field.id}：译文改变数字`]});
    expect(validateLocalizationDraft(current,translated)).toEqual(translated);
    expect(await service.review(current,translated)).toEqual(accepted);
    expect(payloads[0]!.system).toContain('one-minute as 一分钟');
    expect(payloads[0]!.system).toContain('two rounds as 两轮');
    expect(payloads[0]!.user.policy).toBe(LOCALIZATION_POLICY);
    expect(payloads[0]!.user.instruction).toContain('remove that digit');
    expect(payloads[1]!.user.policy).toBe(LOCALIZATION_POLICY);
    const legacy=localizationRequest('word-count-fixture',[field],LEGACY_LOCALIZATION_POLICY);
    await service.translate(legacy);
    expect(payloads[2]!.user.policy).toBe(LEGACY_LOCALIZATION_POLICY);
    expect(payloads[2]!.system).toContain('legacy bilingual titles use full-width parentheses');
  });
  test('each review chunk receives full formal descriptions already bound in the request',async()=>{
    const formal='<p>The target drops to 0 Hit Points. '+ 'Source evidence. '.repeat(600)+'</p>';
    const input=localizationRequest('context-fixture',[localizationText('body',formal),localizationText('body','The drop-to-0 special death consequence.')]);
    const payloads:any[]=[];
    const service=createReviewedTranslationService({baseUrl:'https://provider.example/v1',apiKey:'fixture-only',model:'fixture',
      httpClient:async(_url,init)=>{const body=JSON.parse(String(init?.body));payloads.push(JSON.parse(body.messages[1].content));
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(accepted)}}]}),{status:200});}});
    const translated=fakeTranslation(input);translated.texts[1]!.text='生命值降至0的特殊后果。';
    expect(await service.review(input,translated)).toEqual(accepted);
    expect(payloads).toHaveLength(2);
    for(const payload of payloads){
      expect(payload.formalSourceDescriptions).toEqual([{source:formal}]);
      expect(payload.formalSourceDescriptions[0].id).toBeUndefined();
      expect(payload.evidenceOrder).toContain('same verified request');
      expect(payload.referenceGuidance).toContain('Half Cover is 半身掩护');
      expect(payload.referenceGuidance).toContain('inclusive lower bound');
    }
    const changed=structuredClone(input);changed.texts[0]=localizationText('body',formal.replace('0 Hit Points','1 Hit Point'));
    expect(localizationHash(changed)).not.toBe(localizationHash(input));
  });
  test('keeps English compound hyphens outside numeric tokens and rejects invented negative values',()=>{
    for(const [source,translated,bad] of [
      ['The failure-margin-5 consequence.','失败差值为5的后果。','失败差值为-5的后果。'],
      ['The drop-to-0 consequence.','降至0的后果。','降至-0的后果。'],
      ['A spell-level-4 restriction.','4级法术限制。','-4级法术限制。'],
      ['A margin-1 consequence.','差值为1的后果。','差值为-1的后果。'],
    ]){
      const input=request(source),locked=protectLocalizationText(source!);
      expect(locked.restore(locked.text)).toBe(source!);
      expect(locked.restore(translated!.replace(/\d+/u,'⟦0⟧'))).toBe(translated!);
      expect(validateLocalizationDraft(input,draft(input,translated!)).texts[0]!.text).toBe(translated!);
      expect(()=>validateLocalizationDraft(input,draft(input,bad!))).toThrow('改变数字');
    }
    for(const [source,translated,bad] of [
      ['A modifier of -5.','调整值为-5。','调整值为5。'],
      ['HP-5 remains a literal subtraction.','生命值-5仍为字面减法。','生命值5仍为字面减法。'],
      ['Speed −10.','速度−10。','速度10。'],
      ['Damage is 2d8 - 5.','伤害为2d8 - 5。','伤害为2d8 + 5。'],
    ]){
      const input=request(source),locked=protectLocalizationText(source!);
      expect(locked.restore(locked.text)).toBe(source!);
      expect(validateLocalizationDraft(input,draft(input,translated!)).texts).toHaveLength(1);
      expect(()=>validateLocalizationDraft(input,draft(input,bad!))).toThrow('改变数字');
    }
  });
  test('protects numeric literals, dice and HTML, while rejecting missing tokens or injected enrichers', () => {
    const protectedText = protectLocalizationText('<p>DC 16: 3d8 + 4 damage</p>');
    expect(protectedText.restore(protectedText.text.replace('damage', '伤害'))).toBe('<p>DC 16: 3d8 + 4 伤害</p>');
    expect(() => protectedText.restore(protectedText.text.replace('⟦1⟧', ''))).toThrow();
    expect(() => protectedText.restore(protectedText.text + '@UUID[Macro.evil]')).toThrow();
    expect(() => protectedText.restore(protectedText.text.replace(/⟦[03]⟧/gu, token => token === '⟦0⟧' ? '⟦3⟧' : '⟦0⟧'))).toThrow();
  });
  test('rejects numeric drift, omitted Chinese, unsupported output fields and incorrect status terms', () => {
    const input = request();
    const valid = draft(input, '<p>DC 16：3d8伤害；麻痹，直到其下一回合结束。</p>');
    expect(validateLocalizationDraft(input, valid)).toEqual(valid);
    expect(validateLocalizationDraft(input, draft(input, '<p>DC16：3d8伤害；麻痹，直到其下一回合结束。</p>')).texts).toHaveLength(1);
    for (const text of ['<p>DC 17：3d8伤害；麻痹，直到其下一回合结束。</p>', '<p>DC 16：3d8伤害；震慑，直到其下一回合结束。</p>', input.texts[0]!.source]) {
      expect(() => validateLocalizationDraft(input, draft(input, text))).toThrow();
    }
    expect(() => validateLocalizationDraft(input, { ...valid, status: 'paralyzed' })).toThrow();
    const dazed = request('The target is Dazed.');
    expect(() => validateLocalizationDraft(dazed, draft(dazed, '目标陷入震慑。'))).toThrow('Dazed');
    const dominated=request('The target is Dominated by the guardian.');
    expect(validateLocalizationDraft(dominated,draft(dominated,'目标受守卫支配。')).texts).toHaveLength(1);
    expect(()=>validateLocalizationDraft(dominated,draft(dominated,'目标被守卫魅惑。'))).toThrow('Dominated');
  });
  test('source, terminology, translated text and independent verdict are all part of acceptance', () => {
    const input = request(); const translated = draft(input, '<p>DC 16：3d8伤害；麻痹，直到其下一回合结束。</p>');
    const reviewed = acceptLocalization(input, translated, accepted, 'review-fixture');
    expect(assertReviewedLocalization(input, reviewed)).toEqual(reviewed);
    for (const changed of [ { ...input, sourceHash: 'different' }, request(input.texts[0]!.source.replace('end', 'start')) ]) {
      expect(() => assertReviewedLocalization(changed, reviewed)).toThrow();
    }
    const edited = structuredClone(reviewed); edited.texts[0]!.text = edited.texts[0]!.text.replace('结束', '开始');
    expect(() => assertReviewedLocalization(input, edited)).toThrow('重新审核');
    expect(() => assertReviewedLocalization(input, { ...reviewed, terminology: 'stale' })).toThrow();
    expect(() => acceptLocalization(input, translated, { verdict: 'needs_review', findings: ['来源和目标互换'] }, 'review')).toThrow();
    expect(() => validateLocalizationDraft(input, { texts: [] })).toThrow('覆盖');
  });
  test('uses space-separated titles and preserves the English source qualifier', () => {
    for (const [original, chinese, expected] of [
      ['Guardian', '守卫', '守卫 Guardian'],
      ['麻痹射线（Paralyzing Ray）', '麻痹射线', '麻痹射线 Paralyzing Ray'],
      ['麻痹射线 Paralyzing Ray', '麻痹射线', '麻痹射线 Paralyzing Ray'],
      ['冰冷射线 Cold Ray (Recharge 5–6)', '冰冷射线', '冰冷射线 Cold Ray (Recharge 5–6)'],
      ['操作：Watcher Ray', '观测射线', '观测射线 Watcher Ray'],
      ['Eye of the Deep (EYE OF THE DEEP)', '深海之眼', '深海之眼 EYE OF THE DEEP'],
      ['Ray (Cold)', '冰冷射线', '冰冷射线 Ray (Cold)'],
      ['守卫', '守卫', '守卫'],
    ]) expect(formatReviewedTitle(original!, chinese!, LOCALIZATION_POLICY)).toBe(expected!);
    expect(formatReviewedTitle('Guardian', '守卫', LEGACY_LOCALIZATION_POLICY)).toBe('守卫（Guardian）');
  });
  test('binds the naming policy into approval instead of borrowing approval from another format', () => {
    const texts = [localizationText('title', 'Guardian')];
    const current = localizationRequest('same-source', texts);
    const legacy = localizationRequest('same-source', texts, LEGACY_LOCALIZATION_POLICY);
    expect(current.policy).toBe(LOCALIZATION_POLICY);
    expect(localizationHash(current)).not.toBe(localizationHash(legacy));
    const reviewed = acceptLocalization(legacy, { texts: [{ id: texts[0]!.id, text: '守卫' }] }, accepted, 'review');
    expect(assertReviewedLocalization(legacy, reviewed).policy).toBe(LEGACY_LOCALIZATION_POLICY);
    expect(() => assertReviewedLocalization(current, reviewed)).toThrow();
    expect(() => assertReviewedLocalization(current, { ...reviewed, policy: LOCALIZATION_POLICY })).toThrow();
  });
  test.each(['source-next-turn-end', 'target-next-turn-end', 'damage-removal'])('changes only enumerated prose and explicit carrier names: %s', variant => {
    const actor: any = { name: 'Guardian', _stats: { coreVersion: '14.364', systemVersion: '5.3.3' }, prototypeToken: { name: 'Guardian' },
      system: { attributes: { hp: { value: 45, max: 45 } } }, items: [{ _id: 'item000000000001', name: 'Watcher Ray', flags: { 'tidy5e-sheet': { section: '动作' }, fvttJsonGenerator: {
        behaviorMechanics: [{ id: 'encounter-rule-1', name: 'Watcher Ray', carrier: { name: 'Watcher Ray', section: '动作' }, gmSteps: ['GM handles duration.'], conditions: ['encounter-staged:/creature/actions/0/appliedConditions/0'], references: [], executionMode: 'gm-assisted' }] } },
        system: { description: { value: '<p>Paralyzed on failure.</p>' }, uses: { max: '2', spent: 0 }, activities: { activity00000001: { _id: 'activity00000001', name: 'Watcher Ray', type: 'save', save: { ability: ['con'], dc: { formula: '16', calculation: '' } }, effects: [{ _id: 'effect0000000001' }] } } },
        effects: [{ _id: 'effect0000000001', name: 'Paralyzed', statuses: ['paralyzed'], duration: { rounds: 1 }, flags: { lifecycle: variant } }] }] };
    if(variant==='target-next-turn-end'){
      actor.system.details={biography:{value:'<p>The guardian waits.</p>'},type:{value:'aberration',subtype:'Watcher'}};
      actor.items[0].flags.fvttJsonGenerator.behaviorMechanics[0].trigger={event:'turn-end',frequency:'every-turn',condition:'When the target ends its turn.'};
    }else if(variant==='damage-removal'){
      actor.effects=[{_id:'actorEffect00001',name:'Blinded',description:'Ends on damage.',statuses:['blinded'],changes:[]}];
      actor.items[0].system.requirements='Requires line of sight.';
      actor.items[0].flags['tidy5e-sheet'].section='Legendary Actions';
      actor.items[0].flags.fvttJsonGenerator.behaviorMechanics[0].carrier.section='传奇动作';
    }
    const before = structuredClone(actor), input = createActorLocalizationRequest(actor, 'exact source');
    const reviewed = acceptLocalization(input, fakeTranslation(input), accepted, 'review');
    const localized = projectReviewedActorLocalization(actor, 'exact source', reviewed).actor;
    expect(actor).toEqual(before);
    expect(localized.name).toBe('译文 Guardian');
    expect(localized.items[0].name).toBe('译文 译文 Watcher Ray');
    const activities = structuredClone(localized.items[0].system.activities);
    expect(activities.activity00000001.name).toBe('译文 译文 Watcher Ray');
    activities.activity00000001.name = before.items[0].system.activities.activity00000001.name;
    expect(activities).toEqual(actor.items[0].system.activities);
    expect(localized.items[0].system.uses).toEqual(actor.items[0].system.uses);
    expect(localized.items[0].flags.fvttJsonGenerator.behaviorMechanics[0]).toMatchObject({
      id: 'encounter-rule-1', executionMode: 'gm-assisted', carrier: { name: localized.items[0].name, section: variant==='damage-removal'?'传奇动作':'动作' }, conditions: before.items[0].flags.fvttJsonGenerator.behaviorMechanics[0].conditions,
    });
    expect(localized.items[0].effects[0].name).toBe('麻痹 Paralyzed');
    expect(localized.items[0].flags.fvttJsonGenerator.behaviorMechanics[0].name).toBe(localized.items[0].name);
    const effects = structuredClone(localized.items[0].effects); effects[0].name = before.items[0].effects[0].name;
    expect(effects).toEqual(before.items[0].effects);
    const normalizedItems=normalizeForgeActorArtifact(localized, '14', actor).items;
    if(!Array.isArray(normalizedItems))throw new Error('Expected normalized Actor items.');
    expect(normalizedItems[0]).toBeDefined();
    const englishEffect = (normalizeForgeActorArtifact(actor, '14').items as any[])[0].effects[0];
    const chineseEffect = (normalizeForgeActorArtifact(localized, '14', actor).items as any[])[0].effects[0];
    expect(chineseEffect._id).toBe(englishEffect._id);
    if(variant==='target-next-turn-end'){expect(localized.system.details.biography.value).not.toContain('guardian');expect(localized.items[0].flags.fvttJsonGenerator.behaviorMechanics[0].trigger.event).toBe('turn-end');}
    if(variant==='damage-removal'){expect(localized.effects[0].statuses).toEqual(['blinded']);expect(localized.effects[0]._id).toBe('actorEffect00001');expect(localized.items[0].system.requirements).not.toContain('Requires');}
  });
  test('provider work IDs are scoped to the current chunk while approved names are context only',async()=>{
    const payloads:any[]=[];const input=localizationRequest('transport-fixture',[localizationText('body','The guardian waits.'),localizationText('title','Guardian')]);
    const service=createReviewedTranslationService({baseUrl:'https://provider.example/v1',apiKey:'fixture-only',model:'fixture',httpClient:async(_url,init)=>{
      const body=JSON.parse(String(init?.body));const payload=JSON.parse(body.messages[1].content);payloads.push(payload);
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({texts:payload.texts.map((text:any)=>({id:text.id,text:text.source.replace(/[A-Za-z]+/gu,'译文')}))})}}]}),{status:200});
    }});
    const translated=await service.translate(input);expect(translated.texts).toHaveLength(2);expect(payloads).toHaveLength(2);
    expect(payloads[0].texts.every((text:any)=>text.kind==='title')).toBe(true);expect(payloads[1].texts.every((text:any)=>text.kind==='body')).toBe(true);
    expect(payloads[1].sourceNames).toEqual(['Guardian']);expect(payloads[1].consistentNames).toEqual([{english:'Guardian',chinese:'译文'}]);
    expect(payloads[1].titles).toBeUndefined();
  });
});

const source = ['---', 'layout: creature', 'name: Marsh Guard', 'type: aberration', 'size: Medium', 'armor_class: 12', 'hit_points: 10', 'challenge: 1', 'speed: 30', '---', '### Actions', '- Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6+2) piercing damage.'].join('\n');
function sourcePackage(): ForgeEncounterPackage {
  const command = fixedEncounterCommand({ version: 1, rules: [{ id: 'manual', kind: 'gm-manual', actorKey: 'guard', itemName: 'Bite', parameters: {} }], legendaryRecovery: [] });
  return { schema: 'fvtt-json-forge-encounter', version: 1, id: 'localization-fixture', label: 'Guard package', target: { foundry: '14.364', system: 'dnd5e', systemVersion: '5.3.3', effectProfile: 'core' }, primaryActorKey: 'guard',
    actors: [{ key: 'guard', label: 'Marsh Guard', source, sourceHash: hashSource(source) }], macros: [{ key: 'control', name: 'Guard control', command, commandHash: hashSource(command), bindings: { guard: 'guard' }, covers: [], notes: 'GM handles timing.' }], assets: [] };
}
async function approvedFixture(policy: LocalizationPolicy) {
  const bundle = sourcePackage();
  const original = await prepareForgeEncounter(serializeForgeEncounterPackage(bundle));
  const actor = original.actors[0]!;
  const actorRequest = createActorLocalizationRequest(actor.artifact, source, policy);
  const translation = acceptLocalization(actorRequest, fakeTranslation(actorRequest), accepted, 'fixture-review');
  const preview = projectReviewedActorLocalization(actor.artifact, source, translation).actor;
  const packageRequest = createEncounterTextRequest(bundle, [{ artifact: preview }], policy);
  const packageText = acceptLocalization(packageRequest, fakeTranslation(packageRequest), accepted, 'fixture-review');
  const localization = { sourcePackageId: bundle.id, actors: [{ key: actor.key, translation }], packageText };
  return {
    original, localization, actorRequest, packageRequest,
    bundle: { ...bundle, id: `${bundle.id}-zh-cn-${localizationHash(localization).slice(0, 16)}`, localization },
  };
}
describe('formal source to localized encounter', () => {
  test('food retention failure blocks real draft preparation and invalidates cached draft reuse without review', async () => {
    const original = sourcePackage();
    const english = 'It can keep solid food down only if washed down with sea water.';
    const actorSource = original.actors[0]!.source.replace('### Actions', '### Traits\n- Brine Affliction. ' + english + '\n### Actions');
    const bundle = {...original, actors: [{...original.actors[0]!, source: actorSource, sourceHash: hashSource(actorSource)}]};
    const prepared = await prepareForgeEncounter(serializeForgeEncounterPackage(bundle));
    const before = localizationHash(prepared);
    const receipts: any[] = [];
    let reviews = 0;
    const translated = (input: LocalizationRequest, sentence: string) => {
      const candidate = fakeTranslation(input);
      for (const field of input.texts.filter(field => field.source.includes(english))) {
        candidate.texts.find(text => text.id === field.id)!.text = field.source.replace('Brine Affliction', '盐水病').replace(english, sentence);
      }
      return candidate;
    };
    const wrong = '它只有用海水送服才能咽下固体食物。';
    const review = async (): Promise<never> => { reviews++; throw new Error('Paid review must stay disabled'); };
    await expect(draftForgeEncounterLocalization({prepared, onReview: entry => receipts.push(entry),
      service: {model: 'fixture-only', reviewModel: 'disabled', translate: async input => translated(input, wrong), review}})).rejects.toThrow('食物留存');
    const failed = receipts.findLast(entry => entry.status === 'needs_review');
    expect(failed.findings.every((message: string) => message.includes('食物留存'))).toBe(true);
    const badIds = failed.request.texts.filter((field: any) => field.source.includes(english)).map((field: any) => field.id).sort();
    expect(badIds.length).toBeGreaterThan(0);
    expect(failed.draft.texts.filter((field: any) => badIds.includes(field.id)).every((field: any) => field.text.includes('咽下'))).toBe(true);
    const sent: string[][] = [];
    const resumed = await draftForgeEncounterLocalization({prepared,
      priorDrafts: [{...failed, status: 'draft_ready', findings: []}],
      service: {model: 'fixture-only', reviewModel: 'disabled', translate: async input => { sent.push(input.texts.map(field => field.id).sort());
        return translated(input, '只有用海水送服，吃下的固体食物才不会吐出。'); }, review}});
    expect(sent[0]).toEqual(badIds);
    expect(() => assertForgeEncounterLocalizationDraft(prepared, resumed)).not.toThrow();
    expect(localizationHash(prepared)).toBe(before);
    expect(reviews).toBe(0);
  });
  test('local prose corrections retain source, titles and untouched fields while rebinding only the corrected draft part',async()=>{
    const prepared=await prepareForgeEncounter(serializeForgeEncounterPackage(sourcePackage()));
    const original=await draftForgeEncounterLocalization({prepared,service:fakeService});
    const actor=original.actors[0]!,field=actor.request.texts.find(entry=>entry.kind==='body')!;
    const previous=actor.draft.texts.find(entry=>entry.id===field.id)!;
    const next=reviseForgeEncounterLocalizationBody({prepared,draft:original,actorKey:actor.key,textId:field.id,text:previous.text+'（人工核对。）'});
    expect(next.sourcePackageHash).toBe(original.sourcePackageHash);
    expect(next.actors[0]!.request).toEqual(actor.request);
    expect(next.actors[0]!.translationHash).not.toBe(actor.translationHash);
    expect(next.packageText).toEqual(original.packageText);
    expect(next.actors[0]!.draft.texts.filter(entry=>entry.id!==field.id)).toEqual(actor.draft.texts.filter(entry=>entry.id!==field.id));
    expect(original.actors[0]!.draft.texts.find(entry=>entry.id===field.id)).toEqual(previous);
    const packageField=next.packageText.request.texts.find(entry=>entry.kind==='body')!;
    const packageText=next.packageText.draft.texts.find(entry=>entry.id===packageField.id)!.text;
    const last=reviseForgeEncounterLocalizationBody({prepared,draft:next,textId:packageField.id,text:packageText+'（人工核对。）'});
    expect(last.actors).toEqual(next.actors);expect(last.packageText.translationHash).not.toBe(next.packageText.translationHash);
    assertForgeEncounterLocalizationDraft(prepared,last);
    expect(prepared.bundle.localization).toBeUndefined();
  });
  test('local corrections reject changed numbers, titles, unknown ownership and stale source binding',async()=>{
    const prepared=await prepareForgeEncounter(serializeForgeEncounterPackage(sourcePackage()));
    const draft=await draftForgeEncounterLocalization({prepared,service:fakeService});
    const part=draft.actors[0]!,field=part.request.texts.find(entry=>entry.kind==='body'&&entry.source.includes('1d6'))!;
    const original=part.draft.texts.find(entry=>entry.id===field.id)!.text;
    expect(()=>reviseForgeEncounterLocalizationBody({prepared,draft,actorKey:part.key,textId:field.id,text:original.replace('1d6','2d6')})).toThrow('改变数字');
    expect(()=>reviseForgeEncounterLocalizationBody({prepared,draft,actorKey:part.key,textId:part.request.texts.find(entry=>entry.kind==='title')!.id,text:'改名'})).toThrow('正文');
    expect(()=>reviseForgeEncounterLocalizationBody({prepared,draft,actorKey:'other-actor',textId:field.id,text:original})).toThrow('正文');
    const changed={...sourcePackage(),id:'localization-fixture-changed'};
    const other=await prepareForgeEncounter(serializeForgeEncounterPackage(changed));
    expect(()=>reviseForgeEncounterLocalizationBody({prepared:other,draft,actorKey:part.key,textId:field.id,text:original})).toThrow('不一致');
    assertForgeEncounterLocalizationDraft(prepared,draft);
  });
  test('default Chinese draft translates without review; actual GM identity approves through formal preparation', async () => {
    const prepared = await prepareForgeEncounter(serializeForgeEncounterPackage(sourcePackage()));
    const counts = { translate: 0, review: 0 };
    const progress: any[] = [];
    const service = { ...fakeService, translate: async (input: LocalizationRequest) => { counts.translate++; return fakeTranslation(input); },
      review: async () => { counts.review++; return accepted; } };
    const draft = await draftForgeEncounterLocalization({ prepared, service, onReview: entry => progress.push(entry) });
    expect(counts.translate).toBe(2); expect(counts.review).toBe(0);
    expect(progress.filter(entry => entry.status === 'draft_ready')).toHaveLength(2);
    expect(progress.some(entry => entry.status === 'accepted' || entry.translation)).toBe(false);
    expect(draft.sourcePackageHash).toBe(prepared.hash);
    assertForgeEncounterLocalizationDraft(prepared, structuredClone(draft));
    const localized = await approveForgeEncounterLocalization({ prepared, draft, gmId: 'gm-real-user-42' });
    expect(counts).toEqual({ translate: 2, review: 0 });
    expect(localized.bundle.localization?.actors[0]?.translation).toMatchObject({ version: 2,
      approval: { kind: 'gm', gmId: 'gm-real-user-42' } });
    expect((localized.bundle.localization?.actors[0]?.translation as any).review).toBeUndefined();
    expect(localized.actors[0]!.name).toContain('译文');
    const restored = await prepareForgeEncounter(serializeForgeEncounterPackage(localized.bundle));
    expect(restored.hash).toBe(localized.hash);
  });
  for(const priorStatus of ['draft_ready','needs_review'] as const)test(`saved prose cleanup resumes locally from ${priorStatus} without retranslating`,async()=>{
    const originalBundle=sourcePackage();
    const editedSource=originalBundle.actors[0]!.source.replace('### Actions',"The sentinel&#39;s watch warns creatures that enter.\n### Actions");
    const bundle:ForgeEncounterPackage={...originalBundle,actors:originalBundle.actors.map(actor=>({...actor,source:editedSource,sourceHash:hashSource(editedSource)}))};
    const prepared=await prepareForgeEncounter(serializeForgeEncounterPackage(bundle)),progress:any[]=[];
    const original=await draftForgeEncounterLocalization({prepared,service:fakeService,onReview:entry=>progress.push(entry)});
    expect(localizationMeaningFindings(original.actors[0]!.request,original.actors[0]!.draft).some(f=>f.includes('撇号'))).toBe(true);
    const saved=progress.filter(entry=>['draft_ready','needs_review'].includes(entry.status)).map(entry=>({...entry,
      status:priorStatus,findings:priorStatus==='needs_review'?localizationMeaningFindings(entry.request,entry.draft):[]}));
    const frozen=structuredClone(saved);let calls=0,reviews=0;
    const verified=verifiedEncounterLocalizationProgress(prepared.bundle,prepared.actors,saved);
    expect(verified).toEqual(saved);
    const resumed=await draftForgeEncounterLocalization({prepared,priorDrafts:verified,service:{
      ...fakeService,translate:async()=>{calls++;throw Error('Locally repairable prose must not call translation');},
      review:async()=>{reviews++;throw Error('No paid review');}}});
    expect(calls).toBe(0);expect(reviews).toBe(0);expect(saved).toEqual(frozen);
    expect(resumed.actors[0]!.draft.texts).toEqual(original.actors[0]!.draft.texts.map(entry=>{
      const field=original.actors[0]!.request.texts.find(f=>f.id===entry.id)!;
      return {...entry,text:field.kind==='body'?normalizeLocalizationBodyProse(field.source,entry.text):entry.text};
    }));
    expect(resumed.actors[0]!.translationHash).not.toBe(original.actors[0]!.translationHash);
    expect(localizationMeaningFindings(resumed.actors[0]!.request,resumed.actors[0]!.draft)).toEqual([]);
    expect(resumed.sourcePackageHash).toBe(original.sourcePackageHash);
    expect((resumed as any).approval).toBeUndefined();
    await expect(approveForgeEncounterLocalization({prepared,draft:resumed,gmId:'offline-prose-test'})).resolves.toBeDefined();
  });
  for(const findingKind of ['external','participant'] as const)test(`local prose cleanup keeps unresolved ${findingKind} review findings`,async()=>{
    const originalBundle=sourcePackage();
    const editedSource=originalBundle.actors[0]!.source.replace('### Actions',"The sentinel&#39;s watch warns creatures that enter.\n### Actions");
    const bundle:ForgeEncounterPackage={...originalBundle,actors:originalBundle.actors.map(actor=>({...actor,source:editedSource,sourceHash:hashSource(editedSource)}))};
    const prepared=await prepareForgeEncounter(serializeForgeEncounterPackage(bundle)),progress:any[]=[];
    await draftForgeEncounterLocalization({prepared,service:fakeService,onReview:entry=>progress.push(entry)});
    const saved=progress.filter(entry=>['draft_ready','needs_review'].includes(entry.status));
    const actor=saved.find(entry=>entry.actorKey==='guard'),id=actor.request.texts.find((f:any)=>f.kind==='body'&&f.source.includes('sentinel')).id;
    actor.status='needs_review';
    if(findingKind==='external')actor.findings.push(`${id}：另一个尚未解决的含义问题。`);
    else{
      const field=actor.request.texts.find((f:any)=>f.id===id);
      const candidate={...field,source:field.source.replace('The sentinel&#39;s watch warns creatures that enter.','哨兵&#39;的守望警告靠近的建筑。')};
      actor.draft.texts.find((t:any)=>t.id===id).text=fakeTranslation({...actor.request,texts:[candidate]}).texts[0]!.text;
      actor.findings=localizationMeaningFindings(actor.request,actor.draft);
      expect(actor.findings.some((f:string)=>f.includes('对象类别'))).toBe(true);
    }
    let requested:string[]=[];
    await expect(draftForgeEncounterLocalization({prepared,priorDrafts:saved,service:{...fakeService,
      translate:async input=>{requested=input.texts.map(t=>t.id);throw Error('Unresolved review still requires translation');}}})).rejects.toThrow('Unresolved review');
    expect(requested).toEqual([id]);
  });
  test('saved draft progress restores as unapproved and never carries model or GM approval', async () => {
    const prepared = await prepareForgeEncounter(serializeForgeEncounterPackage(sourcePackage()));
    let translates = 0, reviews = 0;
    const service = { ...fakeService, translate: async (input: LocalizationRequest) => { translates++; return fakeTranslation(input); },
      review: async () => { reviews++; return accepted; } };
    const progress: any[] = [];
    await draftForgeEncounterLocalization({ prepared, service, onReview: entry => progress.push(entry) });
    const saved = progress.filter(entry => entry.status === 'draft_ready');
    const verified = verifiedEncounterLocalizationProgress(prepared.bundle, prepared.actors, structuredClone(saved));
    expect(verified.map(entry => entry.status)).toEqual(['draft_ready', 'draft_ready']);
    const restored = await draftForgeEncounterLocalization({ prepared, service, priorDrafts: verified });
    expect(translates).toBe(2); expect(reviews).toBe(0);
    expect(restored.actors[0]!.draft).toBeDefined();
    expect((restored as any).approval).toBeUndefined();
    const stale = verifiedEncounterLocalizationProgress(prepared.bundle, prepared.actors,
      [{ ...saved[0], request: { ...saved[0].request, sourceHash: 'changed' } }]);
    expect(stale[0]?.status).toBe('needs_review'); expect(stale[0]?.draft).toBeUndefined();
  });
  test('invalid actor draft cannot bind package progress even when its request is current',async()=>{
    const prepared=await prepareForgeEncounter(serializeForgeEncounterPackage(sourcePackage())),progress:any[]=[];
    await draftForgeEncounterLocalization({prepared,service:fakeService,onReview:entry=>progress.push(entry)});
    const saved=structuredClone(progress.filter(entry=>entry.status==='draft_ready'));
    const actor=saved.find(entry=>entry.actorKey==='guard');actor.status='needs_review';actor.findings=['待核数值'];
    actor.draft.texts.find((entry:any)=>entry.text.includes('1d6')).text='错误数字2d6';
    const checked=verifiedEncounterLocalizationProgress(prepared.bundle,prepared.actors,saved);
    const packageProgress=checked.find(entry=>!entry.actorKey);
    expect(packageProgress?.status).toBe('needs_review');expect(packageProgress?.draft).toBeUndefined();
    expect(packageProgress?.request.texts).toEqual([]);
  });
  test('draft-only retry requests only the failed field and preserves every valid text byte', async () => {
    const prepared = await prepareForgeEncounter(serializeForgeEncounterPackage(sourcePackage()));
    const progress: any[] = []; let rejectedId = '', reviews = 0;
    await expect(draftForgeEncounterLocalization({ prepared, onReview: entry => progress.push(entry),
      service: { ...fakeService, translate: async input => {
        const candidate = fakeTranslation(input);
        const field = input.texts.find(entry => /\d/u.test(entry.source))!;
        expect(field).toBeDefined(); rejectedId = field.id;
        candidate.texts.find(entry => entry.id === rejectedId)!.text += '999';
        return candidate;
      }, review: async () => { reviews++; return accepted; } },
    })).rejects.toThrow('改变数字');
    const failed = progress.findLast(entry => entry.status === 'needs_review' && entry.actorKey === 'guard');
    expect(failed.findings).toContainEqual(expect.stringContaining(rejectedId));
    const kept = failed.draft.texts.filter((entry: any) => entry.id !== rejectedId);
    const requested: string[][] = [];
    const draft = await draftForgeEncounterLocalization({ prepared, priorDrafts: progress,
      service: { ...fakeService, translate: async input => { requested.push(input.texts.map(entry => entry.id)); return fakeTranslation(input); },
        review: async () => { reviews++; return accepted; } },
    });
    expect(requested[0]).toEqual([rejectedId]);
    expect(draft.actors[0]!.draft.texts.filter(entry => entry.id !== rejectedId)).toEqual(kept);
    assertForgeEncounterLocalizationDraft(prepared, draft);
    expect(reviews).toBe(0);
  });
  test('an interrupted onDraft partial resumes only missing fields', async () => {
    const prepared = await prepareForgeEncounter(serializeForgeEncounterPackage(sourcePackage()));
    const progress: any[] = []; let actorFields = 0, retained: any;
    await expect(draftForgeEncounterLocalization({ prepared, onReview: entry => progress.push(entry),
      service: { ...fakeService, translate: async (input: LocalizationRequest, _signal?: AbortSignal,
        onDraft?: (draft: LocalizationDraft) => void) => {
        actorFields = input.texts.length; expect(actorFields).toBeGreaterThan(1);
        retained = fakeTranslation(input).texts[0]!;
        onDraft?.({ texts: [retained] });
        throw new Error('interrupted');
      } },
    })).rejects.toThrow('interrupted');
    const partial = progress.findLast(entry => entry.status === 'translating' && entry.draft?.texts.length);
    expect(partial.draft.texts).toEqual([retained]);
    const calls: number[] = []; let reviews = 0;
    const resumed = await draftForgeEncounterLocalization({ prepared, priorDrafts: progress,
      service: { ...fakeService, translate: async input => { calls.push(input.texts.length); return fakeTranslation(input); },
        review: async () => { reviews++; return accepted; } },
    });
    expect(calls[0]).toBe(actorFields - 1);
    expect(resumed.actors[0]!.draft.texts).toContainEqual(retained);
    assertForgeEncounterLocalizationDraft(prepared, resumed);
    expect(reviews).toBe(0);
  });
  test('draft retry does not borrow text from another policy or source', async () => {
    const bundle = sourcePackage();
    const prepared = await prepareForgeEncounter(serializeForgeEncounterPackage(bundle));
    const progress: any[] = [];
    await draftForgeEncounterLocalization({ prepared, service: fakeService, onReview: entry => progress.push(entry) });
    const saved = progress.filter(entry => entry.status === 'draft_ready');
    const oldPolicy = saved.map(entry => ({ ...entry, request: { ...entry.request, policy: LEGACY_LOCALIZATION_POLICY } }));
    const oldPolicyCalls: number[] = [];
    await draftForgeEncounterLocalization({ prepared, priorDrafts: oldPolicy,
      service: { ...fakeService, translate: async input => { oldPolicyCalls.push(input.texts.length); return fakeTranslation(input); } } });
    expect(oldPolicyCalls[0]).toBe(saved[0].request.texts.length);
    const changedSource = bundle.actors[0]!.source.replace('hit_points: 10', 'hit_points: 12');
    const changed: ForgeEncounterPackage = { ...bundle, actors: bundle.actors.map((actor, index) => index === 0
      ? { ...actor, source: changedSource, sourceHash: hashSource(changedSource) } : actor) };
    const current = await prepareForgeEncounter(serializeForgeEncounterPackage(changed));
    const changedCalls: number[] = [];
    await draftForgeEncounterLocalization({ prepared: current, priorDrafts: saved,
      service: { ...fakeService, translate: async input => { changedCalls.push(input.texts.length); return fakeTranslation(input); } } });
    expect(changedCalls[0]).toBeGreaterThan(0);
  });
  test('stale source, changed numbers, forged hashes and cancellation cannot approve or review drafts [review disabled]', async () => {
    const prepared = await prepareForgeEncounter(serializeForgeEncounterPackage(sourcePackage()));
    let reviews = 0;
    const service = { ...fakeService, review: async () => { reviews++; return accepted; } };
    const draft = await draftForgeEncounterLocalization({ prepared, service });
    const numeric: any = structuredClone(draft);
    const field = numeric.actors[0].request.texts.find((entry: any) => /\d/u.test(entry.source));
    expect(field).toBeDefined();
    numeric.actors[0].draft.texts.find((entry: any) => entry.id === field.id).text += '999';
    await expect(approveForgeEncounterLocalization({ prepared, draft: numeric, gmId: 'gm-real-user-42' })).rejects.toThrow();
    const forged: any = structuredClone(draft); forged.packageText.requestHash = 'a'.repeat(64);
    await expect(reviewForgeEncounterLocalizationDraft({ prepared, draft: forged, service })).rejects.toThrow();
    const mutated: any = structuredClone(draft);
    await expect(reviewForgeEncounterLocalizationDraft({ prepared, draft: mutated,
      service: { ...service, review: async (_request, candidate) => { candidate.texts[0]!.text += '变更'; return accepted; } },
    })).rejects.toThrow('AI 内容复核已暂时关闭');
    const original = sourcePackage();
    const changedSource = original.actors[0]!.source.replace('hit_points: 10', 'hit_points: 12');
    const changed: ForgeEncounterPackage = { ...original, actors: original.actors.map((actor, index) => index === 0
      ? { ...actor, source: changedSource, sourceHash: hashSource(changedSource) } : actor) };
    const changedPrepared = await prepareForgeEncounter(serializeForgeEncounterPackage(changed));
    expect(() => assertForgeEncounterLocalizationDraft(changedPrepared, draft)).toThrow();
    const controller = new AbortController(); controller.abort();
    await expect(reviewForgeEncounterLocalizationDraft({ prepared, draft, service, signal: controller.signal })).rejects.toThrow();
    expect(reviews).toBe(0);
  });
  test('regenerates a language-bound artifact and recompiles only display bindings, retaining original source evidence [review disabled]', async () => {
    const original = sourcePackage(); const before = await prepareForgeEncounter(serializeForgeEncounterPackage(original));
    let packageContext:any;
    const localized = await localizeForgeEncounterWithGm({ bundle: original, service: {...fakeService,translate:async(input:LocalizationRequest)=>{if(input.sourceRuleContext)packageContext=input.sourceRuleContext;return fakeTranslation(input);}} });
    expect(packageContext).toBeDefined();expect(JSON.stringify(packageContext)).toContain('命中加值+4');expect(JSON.stringify(packageContext)).toContain('+4');
    expect(localized.bundle.actors).toEqual(original.actors);
    expect(localized.bundle.macros).toEqual(original.macros);
    expect(localized.bundle.id).toContain('-zh-cn-'); expect(localized.hash).not.toBe(before.hash);
    expect(localized.actors[0]!.artifact.system).toEqual(before.actors[0]!.artifact.system);
    const oldItem = (before.actors[0]!.artifact.items as any[])[0], newItem = (localized.actors[0]!.artifact.items as any[])[0];
    expect(newItem.name).toBe('译文 Bite');
    expect(localized.label).toBe('译文 译文 Guard package');
    expect(localized.macros[0]!.name).toBe('译文 译文 Guard control');
    const glossary = createEncounterTextRequest(original, localized.actors).nameGlossary!;
    expect(glossary).toContainEqual({ english: 'Bite', chinese: '译文' });
    expect(glossary.every(entry => !entry.chinese.includes(entry.english))).toBe(true);
    expect(newItem.system.damage).toEqual(oldItem.system.damage);
    const oldActivity = Object.values(oldItem.system.activities)[0] as any, newActivity = Object.values(newItem.system.activities)[0] as any;
    expect(newActivity.attack).toEqual(oldActivity.attack); expect(newActivity.damage).toEqual(oldActivity.damage); expect(newActivity._id).toBe(oldActivity._id);
    expect(readFixedEncounterConfiguration(localized.macros[0]!.command)!.rules[0]!.itemName).toBe(newItem.name);
    const regenerated = await prepareForgeEncounter(serializeForgeEncounterPackage(localized.bundle));
    expect(regenerated.actors.map(actor=>actor.artifact)).toEqual(localized.actors.map(actor=>actor.artifact)); expect(regenerated.macros).toEqual(localized.macros);
    const repeat = await prepareForgeEncounter(serializeForgeEncounterPackage(original)); expect(repeat.actors.map(actor=>actor.artifact)).toEqual(before.actors.map(actor=>actor.artifact));
  });
  test('retains portable v1 approval and titles while rejecting mixed-format packages', async () => {
    const legacy = await approvedFixture(LEGACY_LOCALIZATION_POLICY);
    expect(decodeEncounterLocalization(legacy.localization)).toEqual(legacy.localization);
    const prepared = await prepareForgeEncounter(serializeForgeEncounterPackage(legacy.bundle));
    expect(prepared.actors[0]!.name).toBe('译文 译文（Marsh Guard）');
    expect((prepared.actors[0]!.artifact.items as any[])[0].name).toBe('译文（Bite）');
    expect(prepared.label).toBe('译文 译文（Guard package）');
    expect(prepared.macros[0]!.name).toBe('译文 译文（Guard control）');
    expect(readFixedEncounterConfiguration(prepared.macros[0]!.command)!.rules[0]!.itemName).toBe('译文（Bite）');
    expect(createEncounterTextRequest(legacy.bundle, prepared.actors, LEGACY_LOCALIZATION_POLICY)).toEqual(legacy.packageRequest);
    const current = await approvedFixture(LOCALIZATION_POLICY);
    expect(current.bundle.id).not.toBe(legacy.bundle.id);
    expect(() => decodeEncounterLocalization({ ...legacy.localization, packageText: current.localization.packageText })).toThrow('名称格式');
  });
  test('does not resume v1 approvals or drafts under the new default naming policy [review disabled]', async () => {
    const legacy = await approvedFixture(LEGACY_LOCALIZATION_POLICY);
    const priorReviews = [
      { status: 'accepted' as const, actorKey: 'guard', request: legacy.actorRequest, translation: legacy.localization.actors[0]!.translation, draft: { texts: legacy.localization.actors[0]!.translation.texts } },
      { status: 'accepted' as const, request: legacy.packageRequest, translation: legacy.localization.packageText, draft: { texts: legacy.localization.packageText.texts } },
    ];
    const policies: string[] = []; let reviews = 0;
    const current = await localizeForgeEncounterWithGm({ bundle: sourcePackage(), priorReviews, service: { ...fakeService,
      translate: async input => { policies.push(input.policy); return fakeTranslation(input); },
      review: async () => { reviews++; return accepted; },
    } });
    expect(policies).toEqual([FACT_LOCALIZATION_POLICY, FACT_LOCALIZATION_POLICY]);
    expect(reviews).toBe(0);
    expect(current.bundle.id).not.toBe(legacy.bundle.id);
    expect((current.actors[0]!.artifact.items as any[])[0].name).toBe('译文 Bite');
  });
  test('both source verifiers recognize the appended English name without hiding an absent capability', () => {
    for (const name of ['Bite', '啮咬（Bite）', '啮咬 Bite', '冰冷射线 Cold Ray (Recharge 5–6)', '不存在 Missing Ray']) {
      const actor = { name: 'Guard', type: 'npc', items: [{ name, type: 'weapon', system: {} }] };
      const text = `${source}\nCold Ray (Recharge 5–6).`;
      const node = buildActorVerificationSummaryFromValues({ source: text, actor });
      const browser = buildBrowserActorVerificationSummary(text, actor);
      for (const summary of [node, browser]) expect(summary.warnings.filter(warning => warning.startsWith('Item name not found'))).toHaveLength(name.includes('Missing') ? 1 : 0);
    }
  });
  test('source-bound draft reuse and flagged text retry require a new current GM approval [review disabled]',async()=>{
    const receipts:any[]=[];
    const bundle=sourcePackage();await localizeForgeEncounterWithGm({bundle,service:fakeService,onReview:entry=>receipts.push(entry)});
    let calls=0;
    await localizeForgeEncounterWithGm({bundle,service:{...fakeService,translate:async request=>{calls++;return fakeTranslation(request);},review:async()=>{calls++;return accepted;}},priorReviews:receipts});
    expect(calls).toBe(0);
    const approved=receipts.findLast(entry=>entry.actorKey==='guard'&&entry.translation);
    const id=approved.draft.texts[0].id;
    const prior={...approved,status:'needs_review',findings:[`${id} 需重新核对这个标题`]};
    const translatedCounts:number[]=[];let reviewCalls=0;
    await localizeForgeEncounterWithGm({bundle,service:{...fakeService,translate:async request=>{translatedCounts.push(request.texts.length);return fakeTranslation(request);},review:async()=>{reviewCalls++;return accepted;}},priorReviews:[...receipts,prior]});
    expect(translatedCounts[0]).toBe(1);expect(reviewCalls).toBe(0);
    // A different source cannot borrow either the translated candidate or its approval.
    const changed:any=structuredClone(bundle);changed.actors[0].source=changed.actors[0].source.replace('hit_points: 10','hit_points: 12');changed.actors[0].sourceHash=hashSource(changed.actors[0].source);
    let newTexts=0;await localizeForgeEncounterWithGm({bundle:changed,service:{...fakeService,translate:async request=>{newTexts+=request.texts.length;return fakeTranslation(request);}},priorReviews:receipts});
    expect(newTexts).toBeGreaterThan(1);
  });
  test('deterministic draft failure reports its exact field and retries only that field [review disabled]',async()=>{
    const receipts:any[]=[];let badId='',badText='',reviewCalls=0;
    await expect(localizeForgeEncounterWithGm({bundle:sourcePackage(),onReview:entry=>receipts.push(entry),service:{...fakeService,
      translate:async input=>{
        const candidate=fakeTranslation(input);const field=input.texts.find(entry=>entry.kind==='body')??input.texts[0]!;
        badId=field.id;const changed=candidate.texts.find(entry=>entry.id===badId)!;
        changed.text+='1';badText=changed.text;return candidate;
      },review:async()=>{reviewCalls++;return accepted;},
    }})).rejects.toThrow('改变数字');
    expect(reviewCalls).toBe(0);
    const failed=receipts.findLast(entry=>entry.status==='needs_review'&&entry.actorKey==='guard');
    expect(failed?.findings).toContainEqual(expect.stringContaining(badId));
    expect(failed?.draft.texts.find((entry:any)=>entry.id===badId).text).toBe(badText);
    const translatedCounts:number[]=[];
    await localizeForgeEncounterWithGm({bundle:sourcePackage(),priorReviews:receipts,service:{...fakeService,
      translate:async input=>{translatedCounts.push(input.texts.length);return fakeTranslation(input);},
      review:async()=>{reviewCalls++;return accepted;},
    }});
    expect(translatedCounts[0]).toBe(1);
    expect(reviewCalls).toBe(0);
  });
  test('two approved Actors remain byte-identical while only two rejected package display fields are retried [review disabled]',async()=>{
    const original=sourcePackage();
    const secondSource=source.replace('Marsh Guard','Marsh Sentinel');
    const notes='No registered custom conditions exist in this request, so no configured.* status is used.';
    const bundle:ForgeEncounterPackage={...original,label:'Chrome Recovery R2 input',
      actors:[...original.actors,{key:'sentinel',label:'Marsh Sentinel',source:secondSource,sourceHash:hashSource(secondSource)}],
      macros:[{...original.macros[0]!,bindings:{guard:'guard',sentinel:'sentinel'},notes}]};
    const priorReviews:any[]=[];
    const first=await localizeForgeEncounterWithGm({bundle,service:fakeService,onReview:entry=>priorReviews.push(entry)});
    const modelBindings=(actors:NonNullable<typeof first.bundle.localization>['actors'])=>actors.map(actor=>{
      if(actor.translation.version!==2)throw new Error('Expected current explicit GM approval.');
      return {key:actor.key,requestHash:actor.translation.requestHash,
        translationHash:actor.translation.approval.translationHash};
    });
    const approvedActors=modelBindings(first.bundle.localization!.actors);
    expect(approvedActors).toHaveLength(2);
    const acceptedPackage=priorReviews.findLast(entry=>!entry.actorKey&&entry.status==='accepted');
    const labelId=localizationText('title',bundle.label).id,notesId=localizationText('body',notes).id;
    const failedDraft={texts:acceptedPackage.draft.texts.map((entry:any)=>({...entry,
      text:entry.id===labelId?'浏览器恢复 R2 输入':entry.id===notesId?'本请求未使用 configured.* 状态。':entry.text}))};
    const failed={...acceptedPackage,status:'needs_review',translation:undefined,draft:failedDraft,
      findings:[`${labelId}：残留英文 R`,`${notesId}：残留英文 configured`]};
    const translatedCounts:number[]=[];let reviewCalls=0;
    const resumed=await localizeForgeEncounterWithGm({bundle,priorReviews:[...priorReviews,failed],service:{...fakeService,
      translate:async input=>{translatedCounts.push(input.texts.length);return{texts:input.texts.map(entry=>({id:entry.id,
        text:entry.id===labelId?'浏览器恢复第2轮输入':'本请求中不存在已注册的自定义状态，因此未使用任何已配置的自定义状态。'}))};},
      review:async()=>{reviewCalls++;return accepted;},
    }});
    expect(translatedCounts).toEqual([2]);expect(reviewCalls).toBe(0);
    expect(modelBindings(resumed.bundle.localization!.actors)).toEqual(approvedActors);
  });
  test('does not discard unknown provider IDs when assembling resumed drafts [review disabled]',async()=>{
    await expect(localizeForgeEncounterWithGm({bundle:sourcePackage(),service:{...fakeService,translate:async request=>({texts:[...fakeTranslation(request).texts,{id:'text-'+'f'.repeat(24),text:'未知字段'}]})}})).rejects.toThrow('额外');
  });
  test('the ordinary Actor entry stays source-language and the workflow rejects a stale localization', async () => {
    const input = buildForgeActorRequest({ content: source, displayName: 'Source', requestId: 'language-test', fvttVersion: '14.364', systemVersion: '5.3.3' });
    const before = await convertFinalActorSource(input);
    if (!('result' in before) || !('artifact' in before.result)) throw new Error('Source generation failed');
    expect(before.result.artifact!.name).toBe('Marsh Guard');
    const request = createActorLocalizationRequest(before.result.artifact, input.source.content);
    const reviewed = acceptLocalization(request, fakeTranslation(request), accepted, 'review');
    reviewed.texts[0]!.text += '变更';
    const changed = await convertFinalActorSource(input, { reviewedLocalization: reviewed });
    expect('result' in changed && changed.result.status).toBe('failed');
  });
  test('rejects a bilingual runtime binding over 256 characters during preparation, without shortening source identity [review disabled]', async () => {
    const name='A'.repeat(200); const bundle:any=sourcePackage();
    bundle.actors[0].source=source.replaceAll('Bite',name);bundle.actors[0].sourceHash=hashSource(bundle.actors[0].source);
    const config=readFixedEncounterConfiguration(bundle.macros[0].command)!;config.rules[0]!.itemName=name;
    bundle.macros[0].command=fixedEncounterCommand(config);bundle.macros[0].commandHash=hashSource(bundle.macros[0].command);
    await prepareForgeEncounter(serializeForgeEncounterPackage(bundle));
    const service={...fakeService,translate:async(input:LocalizationRequest)=>{const value=fakeTranslation(input);for(const entry of input.texts)if(entry.kind==='title'&&entry.source===name)value.texts.find(text=>text.id===entry.id)!.text='长'.repeat(60);return value;}};
    await expect(localizeForgeEncounterWithGm({bundle,service})).rejects.toThrow('256');
  });
});

test('both Actor source summaries preserve compound count qualifiers across bracket presentation',()=>{
 const source='Last Stand (3/Day, or 4/Day in Lair). It can choose to succeed instead.';
 for(const [name,missing]of [['Last Stand 3/Day, or 4/Day in Lair',false],['Last Stand（3/Day, or 4/Day in Lair）',false],['Last Stand 5/Day, or 4/Day in Lair',true],['Last Stand 3/Long Rest, or 4/Day in Lair',true],['Unknown Stand 3/Day, or 4/Day in Lair',true]]as const){
  const actor={name:'Guard',type:'npc',items:[{name,type:'feat',system:{}}]};
  for(const summary of [buildActorVerificationSummaryFromValues({source,actor}),buildBrowserActorVerificationSummary(source,actor)])expect(summary.warnings.filter(w=>w.startsWith('Item name not found'))).toHaveLength(missing?1:0);
 }
});

/** Test orchestration of the supported UI steps: public draft generation,
 * explicit fixture GM confirmation, then formal regeneration. No model review
 * or copied private localization implementation is used. */
async function localizeForgeEncounterWithGm(input:{bundle:ForgeEncounterPackage;service:any;signal?:AbortSignal;onReview?:(entry:any)=>void;priorReviews?:readonly any[]}){
  const prepared=await prepareForgeEncounter(serializeForgeEncounterPackage(input.bundle),input.signal);
  const draft=await draftForgeEncounterLocalization({prepared,service:input.service,signal:input.signal,
    priorDrafts:input.priorReviews,onReview:input.onReview});
  const approved=await approveForgeEncounterLocalization({prepared,draft,gmId:'fixture-gm',signal:input.signal});
  for(const part of draft.actors)input.onReview?.({status:'accepted',actorKey:part.key,request:part.request,draft:part.draft,
    translation:approved.bundle.localization!.actors.find(entry=>entry.key===part.key)!.translation});
  input.onReview?.({status:'accepted',request:draft.packageText.request,draft:draft.packageText.draft,translation:approved.bundle.localization!.packageText});
  return approved;
}

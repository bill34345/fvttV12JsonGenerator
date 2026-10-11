import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  acceptLocalization, approveLocalizationByGm, assertReviewedLocalization, localizationRequest, localizationText, protectLocalizationText,
  validateLocalizationDraft, LOCALIZATION_TERMS, LEGACY_LOCALIZATION_POLICY, LOCALIZATION_POLICY, localizationHash, decodeEncounterLocalization, type LocalizationPolicy, type LocalizationRequest, type LocalizationDraft,
} from '@fvtt-json-generator/contracts/localization';
import { createActorLocalizationRequest, projectReviewedActorLocalization, formatReviewedTitle } from '@fvtt-json-generator/generation/reviewed-localization';
import {createEncounterTextRequest} from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import {buildActorVerificationSummaryFromValues} from '@fvtt-json-generator/workflows/actor-verification';
import {buildBrowserActorVerificationSummary} from '../packages/forge-browser-runtime/src/actorVerification';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { prepareForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { assertForgeEncounterLocalizationDraft, approveForgeEncounterLocalization, draftForgeEncounterLocalization,
  localizeForgeEncounter, reviewForgeEncounterLocalizationDraft, verifiedEncounterLocalizationProgress } from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import { serializeForgeEncounterPackage, type ForgeEncounterPackage } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { fixedEncounterCommand, readFixedEncounterConfiguration } from '@fvtt-json-generator/intake-ai/encounter-capabilities';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { normalizeForgeActorArtifact } from '../packages/forge-browser-runtime/src/artifact';
import { createReviewedTranslationService } from '@fvtt-json-generator/intake-ai/localization';

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
    expect(localized.items[0].effects[0].name).toBe('译文麻痹 Paralyzed');
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
  test('explicit model review uses only current draft and preserves negative findings', async () => {
    const prepared = await prepareForgeEncounter(serializeForgeEncounterPackage(sourcePackage()));
    let translates = 0, reviews = 0;
    const service = { ...fakeService, translate: async (input: LocalizationRequest) => { translates++; return fakeTranslation(input); },
      review: async () => { reviews++; return accepted; } };
    const draft = await draftForgeEncounterLocalization({ prepared, service });
    const translated = translates;
    const localized = await reviewForgeEncounterLocalizationDraft({ prepared, draft, service });
    expect({ translates, reviews }).toEqual({ translates: translated, reviews: 2 });
    expect(localized.bundle.localization?.packageText.version).toBe(1);
    const findings: string[] = [];
    await expect(reviewForgeEncounterLocalizationDraft({ prepared, draft,
      service: { ...service, review: async () => ({ verdict: 'needs_review' as const, findings: ['含义有误'] }) },
      onReview: entry => findings.push(...entry.findings ?? []),
    })).rejects.toThrow('含义有误');
    expect(findings).toContain('含义有误');
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
  test('stale source, changed numbers, forged hashes and cancellation cannot approve or review drafts', async () => {
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
    })).rejects.toThrow('译文身份');
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
  test('regenerates a language-bound artifact and recompiles only display bindings, retaining original source evidence', async () => {
    const original = sourcePackage(); const before = await prepareForgeEncounter(serializeForgeEncounterPackage(original));
    let packageContext:any;
    const localized = await localizeForgeEncounter({ bundle: original, service: {...fakeService,review:async(input)=>{if(input.sourceRuleContext)packageContext=input.sourceRuleContext;return accepted;}} });
    expect(packageContext).toBeDefined();expect(JSON.stringify(packageContext)).toContain('Bite');expect(JSON.stringify(packageContext)).toContain('+4');
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
  test('does not resume v1 approvals or drafts under the new default naming policy', async () => {
    const legacy = await approvedFixture(LEGACY_LOCALIZATION_POLICY);
    const priorReviews = [
      { status: 'accepted' as const, actorKey: 'guard', request: legacy.actorRequest, translation: legacy.localization.actors[0]!.translation, draft: { texts: legacy.localization.actors[0]!.translation.texts } },
      { status: 'accepted' as const, request: legacy.packageRequest, translation: legacy.localization.packageText, draft: { texts: legacy.localization.packageText.texts } },
    ];
    const policies: string[] = []; let reviews = 0;
    const current = await localizeForgeEncounter({ bundle: sourcePackage(), priorReviews, service: { ...fakeService,
      translate: async input => { policies.push(input.policy); return fakeTranslation(input); },
      review: async () => { reviews++; return accepted; },
    } });
    expect(policies).toEqual([LOCALIZATION_POLICY, LOCALIZATION_POLICY]);
    expect(reviews).toBe(2);
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
  test('does not return a Chinese package after rejected independent review or cancellation', async () => {
    await expect(localizeForgeEncounter({ bundle: sourcePackage(), service: { ...fakeService, review: async () => ({ verdict: 'needs_review', findings: ['期限主语发生变化'] }) } })).rejects.toThrow('期限');
    const controller = new AbortController(); controller.abort();
    await expect(localizeForgeEncounter({ bundle: sourcePackage(), service: fakeService, signal: controller.signal })).rejects.toThrow();
  });
  test('resumes source-bound drafts and fixes only failed text, while a semantic rejection invalidates prior approval',async()=>{
    const receipts:any[]=[];
    const bundle=sourcePackage();await localizeForgeEncounter({bundle,service:fakeService,onReview:entry=>receipts.push(entry)});
    let calls=0;
    await localizeForgeEncounter({bundle,service:{...fakeService,translate:async request=>{calls++;return fakeTranslation(request);},review:async()=>{calls++;return accepted;}},priorReviews:receipts});
    expect(calls).toBe(0);
    const approved=receipts.findLast(entry=>entry.actorKey==='guard'&&entry.translation);
    const id=approved.draft.texts[0].id;
    const prior={...approved,status:'needs_review',findings:[`${id} 需重新核对这个标题`]};
    const translatedCounts:number[]=[];let reviewCalls=0;
    await localizeForgeEncounter({bundle,service:{...fakeService,translate:async request=>{translatedCounts.push(request.texts.length);return fakeTranslation(request);},review:async()=>{reviewCalls++;return accepted;}},priorReviews:[...receipts,prior]});
    expect(translatedCounts[0]).toBe(1);expect(reviewCalls).toBeGreaterThan(0);
    // A different source cannot borrow either the translated candidate or its approval.
    const changed:any=structuredClone(bundle);changed.actors[0].source=changed.actors[0].source.replace('hit_points: 10','hit_points: 12');changed.actors[0].sourceHash=hashSource(changed.actors[0].source);
    let newTexts=0;await localizeForgeEncounter({bundle:changed,service:{...fakeService,translate:async request=>{newTexts+=request.texts.length;return fakeTranslation(request);}},priorReviews:receipts});
    expect(newTexts).toBeGreaterThan(1);
  });
  test('deterministic draft failure reports its exact field and retries only that field',async()=>{
    const receipts:any[]=[];let badId='',badText='',reviewCalls=0;
    await expect(localizeForgeEncounter({bundle:sourcePackage(),onReview:entry=>receipts.push(entry),service:{...fakeService,
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
    await localizeForgeEncounter({bundle:sourcePackage(),priorReviews:receipts,service:{...fakeService,
      translate:async input=>{translatedCounts.push(input.texts.length);return fakeTranslation(input);},
      review:async()=>{reviewCalls++;return accepted;},
    }});
    expect(translatedCounts[0]).toBe(1);
    expect(reviewCalls).toBeGreaterThan(0);
  });
  test('two approved Actors remain byte-identical while only two rejected package display fields are retried',async()=>{
    const original=sourcePackage();
    const secondSource=source.replace('Marsh Guard','Marsh Sentinel');
    const notes='No registered custom conditions exist in this request, so no configured.* status is used.';
    const bundle:ForgeEncounterPackage={...original,label:'Chrome Recovery R2 input',
      actors:[...original.actors,{key:'sentinel',label:'Marsh Sentinel',source:secondSource,sourceHash:hashSource(secondSource)}],
      macros:[{...original.macros[0]!,bindings:{guard:'guard',sentinel:'sentinel'},notes}]};
    const priorReviews:any[]=[];
    const first=await localizeForgeEncounter({bundle,service:fakeService,onReview:entry=>priorReviews.push(entry)});
    const modelBindings=(actors:NonNullable<typeof first.bundle.localization>['actors'])=>actors.map(actor=>{
      if(actor.translation.version!==1)throw new Error('Expected the legacy v1 model review record.');
      return {key:actor.key,requestHash:actor.translation.requestHash,
        translationHash:actor.translation.review.translationHash};
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
    const resumed=await localizeForgeEncounter({bundle,priorReviews:[...priorReviews,failed],service:{...fakeService,
      translate:async input=>{translatedCounts.push(input.texts.length);return{texts:input.texts.map(entry=>({id:entry.id,
        text:entry.id===labelId?'浏览器恢复第2轮输入':'本请求中不存在已注册的自定义状态，因此未使用任何已配置的自定义状态。'}))};},
      review:async()=>{reviewCalls++;return accepted;},
    }});
    expect(translatedCounts).toEqual([2]);expect(reviewCalls).toBe(1);
    expect(modelBindings(resumed.bundle.localization!.actors)).toEqual(approvedActors);
  });
  test('does not discard unknown provider IDs when assembling resumed drafts',async()=>{
    await expect(localizeForgeEncounter({bundle:sourcePackage(),service:{...fakeService,translate:async request=>({texts:[...fakeTranslation(request).texts,{id:'text-'+'f'.repeat(24),text:'未知字段'}]})}})).rejects.toThrow('额外');
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
  test('rejects a bilingual runtime binding over 256 characters during preparation, without shortening source identity', async () => {
    const name='A'.repeat(200); const bundle:any=sourcePackage();
    bundle.actors[0].source=source.replaceAll('Bite',name);bundle.actors[0].sourceHash=hashSource(bundle.actors[0].source);
    const config=readFixedEncounterConfiguration(bundle.macros[0].command)!;config.rules[0]!.itemName=name;
    bundle.macros[0].command=fixedEncounterCommand(config);bundle.macros[0].commandHash=hashSource(bundle.macros[0].command);
    await prepareForgeEncounter(serializeForgeEncounterPackage(bundle));
    const service={...fakeService,translate:async(input:LocalizationRequest)=>{const value=fakeTranslation(input);for(const entry of input.texts)if(entry.kind==='title'&&entry.source===name)value.texts.find(text=>text.id===entry.id)!.text='长'.repeat(60);return value;}};
    await expect(localizeForgeEncounter({bundle,service})).rejects.toThrow('256');
  });
});

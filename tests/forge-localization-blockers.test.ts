import { describe, expect, test } from 'bun:test';
import { approveLocalizationByGm, localizationHash, localizationRequest, localizationText, validateLocalizationDraft, LOCALIZATION_POLICY } from '@fvtt-json-generator/contracts/localization';
import { createEncounterTextRequest } from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import { localizedEncounterId, localizedEncounterPresentation } from '../packages/forge-browser-runtime/src/encounterLocalizationProjection';
import { serializeForgeEncounterPackage, type ForgeEncounterPackage } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { fixedEncounterCommand, readFixedEncounterConfiguration } from '@fvtt-json-generator/intake-ai/encounter-capabilities';
import { createReviewedTranslationService } from '@fvtt-json-generator/intake-ai/localization';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';

const actorSource = ['---', 'layout: creature', 'name: Marsh Guard', 'type: aberration', 'size: Medium',
  'armor_class: 12', 'hit_points: 10', 'challenge: 1', 'speed: 30', '---', '### Actions',
  '- Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6+2) piercing damage.',
].join('\n');

function packageWithRuleReferences(notes: string, rules: Array<{ id: string; itemName: string; actorKey?: string }> = [{ id: 'seed-terror', itemName: 'Bite' }],actorKey='guard'): ForgeEncounterPackage {
  const command = fixedEncounterCommand({ version: 1,
    rules: rules.map(rule => ({ id: rule.id, itemName: rule.itemName, kind: 'gm-manual', actorKey: rule.actorKey ?? actorKey, parameters: {} })), legendaryRecovery: [] });
  return {
    schema: 'fvtt-json-forge-encounter', version: 1, id: 'rule-reference-fixture', label: 'Guard package',
    target: { foundry: '14.364', system: 'dnd5e', systemVersion: '5.3.3', effectProfile: 'core' },
    primaryActorKey: actorKey, actors: [{ key: actorKey, label: 'Marsh Guard', source: actorSource, sourceHash: hashSource(actorSource) }],
    macros: [{ key: 'control', name: 'Guard control', command, commandHash: hashSource(command), bindings: { [actorKey]:actorKey }, covers: [], notes }],
    assets: [],
  };
}

describe('Forge first-pass localization blockers', () => {
  test('package prose resolves declared Actor keys and fixed configuration vocabulary without changing raw identity',()=>{
    const bundle=packageWithRuleReferences('actor-1 has no legendary actions, so legendaryRecovery is empty.',[{id:'bound-rule',itemName:'Bite',actorKey:'actor-1'}],'actor-1');
    const raw=serializeForgeEncounterPackage(bundle),request=createEncounterTextRequest(bundle);
    const body=request.texts.find(field=>field.kind==='body')!.source;
    expect(body).toBe('Marsh Guard has no legendary actions, so legendary action recovery is empty.');
    expect(serializeForgeEncounterPackage(bundle)).toBe(raw);
    expect(request.sourceHash).toBe(hashSource(raw));
    expect(bundle.macros[0]!.command).toContain('legendaryRecovery');
    expect(()=>createEncounterTextRequest({...bundle,macros:[{...bundle.macros[0]!,notes:'actor-2 has no legendaryRecovery.'}]})).toThrow('角色引用');
  });
  test('an approved rule-title request from before Actor vocabulary projection keeps its exact identity and presentation',()=>{
    const bundle=packageWithRuleReferences('actor-1 resolves the save (see rule id bound-rule); legendaryRecovery is empty.',[{id:'bound-rule',itemName:'Bite',actorKey:'actor-1'}],'actor-1');
    const actor={key:'actor-1',artifact:{name:'守卫 Marsh Guard',flags:{fvttJsonGenerator:{localization:{sourceName:'Marsh Guard',policy:LOCALIZATION_POLICY,itemNames:[{source:'Bite',display:'啃咬 Bite'}]}}}}};
    const current=createEncounterTextRequest(bundle,[actor]);
    const legacy={...current,texts:current.texts.map(field=>field.kind==='body'
      ?localizationText('body','actor-1 resolves the save (see rule “Bite”); legendaryRecovery is empty.'):field)};
    const approval=approveLocalizationByGm(legacy,{texts:legacy.texts.map(field=>({id:field.id,text:field.kind==='body'?'守卫-1按规则“啃咬”处理豁免，无传奇动作恢复。':'守卫'}))},'gm-fixture');
    const localization={sourcePackageId:bundle.id,actors:[{key:'actor-1',translation:approval}],packageText:approval};
    const approved={...bundle,id:localizedEncounterId(bundle.id,localization),localization};
    expect(createEncounterTextRequest(approved,[actor])).toEqual(legacy);
    expect(localizedEncounterPresentation(approved,[actor]).macros[0]!.notes).toBe('守卫-1按规则“啃咬”处理豁免，无传奇动作恢复。');
  });
  test('source-bound package notes show a bound rule title without exposing an internal rule ID to translation', () => {
    const bundle = packageWithRuleReferences('GM resolves the failed save (see rule id seed-terror).');
    const original = serializeForgeEncounterPackage(bundle);
    const request = createEncounterTextRequest(bundle);
    const notes = request.texts.find(entry => entry.kind === 'body')!;
    expect(notes.source).toContain('see rule “Bite”');
    expect(notes.source).not.toContain('seed-terror');
    expect(serializeForgeEncounterPackage(bundle)).toBe(original);
    expect(bundle.macros[0]!.notes).toContain('seed-terror');
    expect(bundle.macros[0]!.command).toContain('"id":"seed-terror"');
    expect(request.sourceHash).toBe(hashSource(original));
  });

  test('source-bound display references reject unknown and ambiguous IDs', () => {
    expect(() => createEncounterTextRequest(packageWithRuleReferences('See rule id unbound.'))).toThrow('规则引用');
    expect(() => createEncounterTextRequest(packageWithRuleReferences('See rule id missing-actor.', [
      { id: 'missing-actor', itemName: 'Bite', actorKey: 'absent' },
    ]))).toThrow('规则引用');
    expect(() => createEncounterTextRequest(packageWithRuleReferences('See rule id seed-terror.', [
      { id: 'seed-terror', itemName: 'Bite' }, { id: 'second', itemName: 'Bite' },
    ]))).toThrow('规则引用');
  });

  test('same item title on two bound Actors is disambiguated by its Actor label', () => {
    const base = packageWithRuleReferences('See rule id wolf-bite.', [
      { id: 'wolf-bite', itemName: 'Bite', actorKey: 'guard' },
      { id: 'rat-bite', itemName: 'Bite', actorKey: 'rat' },
    ]);
    const ratSource = actorSource.replaceAll('Marsh Guard', 'Rat');
    const bundle: ForgeEncounterPackage = { ...base, actors: [...base.actors,
      { key: 'rat', label: 'Rat', source: ratSource, sourceHash: hashSource(ratSource) }] };
    const original = serializeForgeEncounterPackage(bundle);
    const request = createEncounterTextRequest(bundle);
    expect(request.texts.find(field => field.kind === 'body')!.source).toBe('See rule “Marsh Guard：Bite”.');
    expect(serializeForgeEncounterPackage(bundle)).toBe(original);
    expect(bundle.macros[0]!.command).toContain('"id":"wolf-bite"');
    expect(bundle.macros[0]!.command).toContain('"id":"rat-bite"');
  });

  test('several distinct rule references use their own fixed bindings', () => {
    const bindings = [
      { id: 'seed-terror', itemName: 'Seed Terror' },
      { id: 'steal-passion', itemName: 'Steal Passion' },
      { id: 'bilebrine', itemName: 'Bilebrine' },
      { id: 'sargassum-grasp', itemName: 'Sargassum Grasp' },
      { id: 'death-glare', itemName: 'Death Glare' },
    ];
    const notes = bindings.map(rule => `See rule id ${rule.id}.`).join('\n');
    const bundle = packageWithRuleReferences(notes, bindings);
    const displayed = createEncounterTextRequest(bundle).texts.find(field => field.kind === 'body')!.source;
    for (const rule of bindings) expect(displayed).toContain(`See rule “${rule.itemName}”.`);
    expect(displayed).not.toMatch(/\brule\s+id\b/iu);
    expect(bundle.macros[0]!.notes).toBe(notes);
  });

  test('an existing raw-notes approval keeps its original request ID and hash', () => {
    const bundle = packageWithRuleReferences('GM resolves the failed save (see rule id seed-terror).');
    const projected = createEncounterTextRequest(bundle);
    const raw = { ...projected, texts: projected.texts.map(field => field.kind === 'body'
      ? localizationText('body', bundle.macros[0]!.notes) : field) };
    const oldApproval = approveLocalizationByGm(raw, { texts: raw.texts.map(field => ({ id: field.id,
      text: field.kind === 'body' ? 'GM结算失败的豁免（见规则“啃咬”）。' : '守卫' })) }, 'gm-fixture');
    const approvedBundle = { ...bundle, localization: { sourcePackageId: bundle.id,
      actors: [{ key: 'guard', translation: oldApproval }], packageText: oldApproval } };
    const readback = createEncounterTextRequest(approvedBundle);
    expect(readback).toEqual(raw);
    expect(localizationHash(readback)).toBe(oldApproval.requestHash);
    expect(readback.texts.find(field => field.kind === 'body')!.id).not.toBe(projected.texts.find(field => field.kind === 'body')!.id);
  });

  test('new approved display uses the translated title while fixed rule identity stays exact', () => {
    const bundle = packageWithRuleReferences('GM resolves the failed save (see rule id seed-terror).');
    const artifact = { name: '守卫 Marsh Guard', flags: { fvttJsonGenerator: { localization: {
      sourceName: 'Marsh Guard', policy: LOCALIZATION_POLICY,
      itemNames: [{ source: 'Bite', display: '啃咬 Bite' }],
    } } } };
    const actor = { key: 'guard', artifact };
    const request = createEncounterTextRequest(bundle, [actor]);
    const packageText = approveLocalizationByGm(request, { texts: request.texts.map(field => ({ id: field.id,
      text: field.kind === 'body' ? 'GM结算失败的豁免（见规则“啃咬”）。'
        : field.source === bundle.label ? '守卫战斗包' : '守卫控制',
    })) }, 'gm-fixture');
    const actorRequest = localizationRequest(hashSource(actorSource), [localizationText('title', 'Marsh Guard')]);
    const actorTranslation = approveLocalizationByGm(actorRequest, { texts: [{ id: actorRequest.texts[0]!.id, text: '守卫' }] }, 'gm-fixture');
    const localization = { sourcePackageId: bundle.id, actors: [{ key: 'guard', translation: actorTranslation }], packageText };
    const localizedBundle = { ...bundle, id: localizedEncounterId(bundle.id, localization), localization };
    const presentation = localizedEncounterPresentation(localizedBundle, [actor]);
    expect(presentation.macros[0]!.notes).toBe('GM结算失败的豁免（见规则“啃咬”）。');
    const fixed = readFixedEncounterConfiguration(presentation.macros[0]!.command)!;
    expect(fixed.rules[0]!.id).toBe('seed-terror');
    expect(fixed.rules[0]!.itemName).toBe('啃咬 Bite');
    expect(bundle.macros[0]!.command).toContain('"id":"seed-terror"');
  });

  test('the original DM abbreviation becomes GM in the existing one-request body transport without changing source identity', async () => {
    const source = '<ul><li>聚群啃咬命中：12（3d6+2）穿刺伤害；目标一件魔法物品的同调（由DM决定）强行结束。@UUID[Compendium.example.DM]</li></ul>';
    const input = localizationRequest('source-with-DM', [localizationText('body', source)]);
    const originalHash = localizationHash(input);
    let calls = 0;
    let providerSource = '';
    const service = createReviewedTranslationService({ baseUrl: 'https://provider.example/v1', apiKey: 'fixture-only', model: 'fixture',
      httpClient: async (_url, init) => {
        calls++;
        const body = JSON.parse(String(init?.body));
        const payload = JSON.parse(body.messages[1].content);
        const field = payload.texts[0];
        providerSource = field.source;
        const result = { texts: [{ id: field.id, text: field.source }] };
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), { status: 200 });
      },
    });
    const translated = await service.translate(input);
    expect(calls).toBe(1);
    expect(providerSource).toContain('由GM决定');
    expect(providerSource).not.toContain('由DM决定');
    expect(translated.texts[0]!.text).toContain('由GM决定');
    expect(translated.texts[0]!.text).toContain('@UUID[Compendium.example.DM]');
    expect(validateLocalizationDraft(input, translated)).toEqual(translated);
    expect(localizationHash(input)).toBe(originalHash);
    expect(input.texts[0]!.source).toBe(source);
  });
});

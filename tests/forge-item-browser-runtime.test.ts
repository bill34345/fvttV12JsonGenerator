import { describe, expect, test } from 'bun:test';
import { createBundledIconResolutionSession } from '@fvtt-json-generator/assets-icons/icon-browser';
import { iconWorkflowAdapter } from '@fvtt-json-generator/assets-icons/icon-adapter';
import { readFileSync } from 'node:fs';
import { NATIVE_RECEIVER_CAPTURE } from './helpers/forge-native-receiver';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  decodeForgeItemResponse,
  hashArtifact,
  hashSource,
  type ForgeItemRequest,
  type ForgeItemResponse,
  type ForgeItemSourceId,
  type JsonObject,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  buildForgeItemRequest,
  convertFinalItemSource,
  FORGE_NATIVE_606_TARGET,
} from '@fvtt-json-generator/forge-browser-runtime';
import { conversionApplication } from '../src/core/application/conversion';
import { normalizeForgeItemArtifact } from '../packages/forge-browser-runtime/src/artifact';
import { buildBrowserBundle } from '../foundry-modules/fvtt-json-forge/build';
import { analyzeBrowserItemSourceWithAi, generateBrowserItemIntakeCandidate,
  reviewBrowserItemIntakeCandidate, approveBrowserItemIntakeCandidateForGm } from '@fvtt-json-generator/forge-browser-runtime/item-intake';
import { buildJewelOfThreePrayersIr, jewelCandidate, JEWEL_OF_THREE_PRAYERS_SOURCE } from '../src/core/intake/__tests__/fixtures/jewel-of-three-prayers';
import { itemFixture, splitPoolRingItem } from '../src/core/intake/__tests__/fixtures/item-p0-cast';

const ITEM_SOURCE_ID = 'item:v1:123e4567-e89b-42d3-a456-426614174000' as ForgeItemSourceId;
const SHIELD_SOURCE = readFileSync(resolve('obsidian/dnd数据转fvttjson/input/items/骑士之盾.md'), 'utf8');
const JEWEL_SOURCE = readFileSync(resolve('obsidian/dnd数据转fvttjson/input/items/三祷之坠.md'), 'utf8');

describe('browser Forge Item runtime', () => {

  test.each([
    {
      layout: 'two named inline lists in prose',
      rules: [
        '**Echo.** While wearing the ring, you can expend charges to cast one of these spells, using your spell save DC: *Hex* (one charge), Bane (2 charges).',
        '**Light.** You may cast the following spell from it: Bless (3 charges).',
      ],
      quotes: ['*Hex* (one charge)', 'Bane (2 charges)', 'Bless (3 charges)'],
    },
    {
      layout: 'spell-cost table',
      rules: [
        'You can cast one of the spells on the following table from it.',
        '| Spell | Charge Cost |\n| --- | --- |\n| Hex | 1 |\n| Bane | 2 |\n| Bless | 3 |',
      ],
      quotes: ['| Hex | 1 |', '| Bane | 2 |', '| Bless | 3 |'],
    },
    {
      layout: 'Foundry HTML spell-cost table and level qualifier',
      rules: [
        'You can cast one of the spells on this table from the ring.',
        '<table><tr><th>Spell</th><th>Charge Cost</th></tr>'
          + '<tr><td>Enlarge/Reduce</td><td>1</td></tr><tr><td>Bane (level 2 version)</td><td>2</td></tr>'
          + '<tr><td>Bless</td><td>3</td></tr></table>',
      ],
      quotes: ['<tr><td>Enlarge/Reduce</td><td>1</td></tr>', 'Bane (level 2 version)', '<tr><td>Bless</td><td>3</td></tr>'],
      firstSpell: { identifier: 'enlarge-reduce', name: 'Enlarge/Reduce' },
      baneLevel: 2,
    },
    {
      layout: 'multiple costs in one sentence and a postposed cost',
      rules: [
        'You can cast Hex for 1 charge, Bane for 2 charges, or Bless from the ring by spending 3 charges.',
      ],
      quotes: ['Hex for 1 charge', 'Bane for 2 charges', 'Bless from the ring by spending 3 charges'],
    },
    {
      layout: 'separately priced English and bilingual grants',
      rules: [
        'You can expend 1 charge to cast Hex from it.',
        '你可以消耗 2 次充能施放 灾祸术 Bane。',
        'You may cast Bless for 3 charges.',
      ],
      quotes: ['You can expend 1 charge to cast Hex from it.', '你可以消耗 2 次充能施放 灾祸术 Bane。', 'You may cast Bless for 3 charges.'],
    },
    {
      layout: 'Markdown bullet list with a bilingual spell label',
      rules: [
        'You can cast one of these spells:\n\n- 施咒 Hex（1 点充能）\n- Bane (2 charges)\n- Bless (3 charges)',
      ],
      quotes: ['施咒 Hex（1 点充能）', 'Bane (2 charges)', 'Bless (3 charges)'],
    },
  ])('checks every charged Cast against the source ($layout)', async ({ rules, quotes, baneLevel, firstSpell }) => {
    const first = firstSpell ?? { identifier: 'hex', name: 'Hex' };
    const pool = 'The ring has 6 charges and regains 1d4+2 expended charges daily at dusk.';
    const { source, candidate, ir } = itemFixture('Spellring', 'Ring', [
      pool,
      ...rules,
      'The wearer learns Guidance. The gem resembles a Fireball (5 charges) icon.',
    ], {
      pool: { max: 6, recovery: [{ period: 'dusk', type: 'formula', formula: '1d4+2' }], quote: pool },
      abilities: [
        { id: first.identifier, kind: 'spell', activation: firstSpell ? 'action' : 'bonus', consumption: 1, spell: first, quote: quotes[0]! },
        { id: 'bane', kind: 'spell', activation: 'action', consumption: 2, level: baneLevel,
          spell: { identifier: 'bane', name: 'Bane' }, quote: quotes[1]! },
        { id: 'bless', kind: 'spell', activation: 'action', consumption: 3, spell: { identifier: 'bless', name: 'Bless' }, quote: quotes[2]! },
      ],
    });
    const input = { source, sourceName: 'Spellring', requestId: 'charged-list',
      fvttVersion: '14.370', systemVersion: '6.0.6' };
    const provider = {
      providerName: 'fixture', extractionModel: 'fixture', reviewModel: 'fixture',
      discover: async () => ({ schemaVersion: 1 as const, candidates: [candidate] }),
      extract: async () => ir, repair: async () => ir,
      review: async () => { throw new Error('Review must stay disabled'); },
    };

    const complete = structuredClone(ir.item.abilities);
    ir.item.abilities = [];
    const missingAll = await analyzeBrowserItemSourceWithAi(input, provider);
    expect(missingAll.status).toBe('needs_review');
    expect(missingAll.findings.map(({ code }) => code)).toEqual(Array(3).fill('MISSING_CHARGED_SPELL_ACTIVITY'));
    expect(missingAll.findings.map(({ message }) => message)).toEqual([
      expect.stringContaining(first.name), expect.stringContaining('Bane'), expect.stringContaining('Bless'),
    ]);
    expect((await generateBrowserItemIntakeCandidate(input, missingAll, provider)).status).toBe('needs_review');

    ir.item.abilities = [complete[0]!, complete[2]!];
    const missingOne = await analyzeBrowserItemSourceWithAi(input, provider);
    expect(missingOne.status).toBe('needs_review');
    expect(missingOne.findings).toEqual([
      expect.objectContaining({ code: 'MISSING_CHARGED_SPELL_ACTIVITY', message: expect.stringContaining('Bane') }),
    ]);

    ir.item.abilities = structuredClone(complete);
    const wrongCost = ir.item.abilities[1]!;
    if (wrongCost.kind !== 'spell') throw new Error('Expected the Bane Cast.');
    wrongCost.consumption = 1;
    const mismatched = await analyzeBrowserItemSourceWithAi(input, provider);
    expect(mismatched.status).toBe('needs_review');
    expect(mismatched.findings).toContainEqual(expect.objectContaining({
      code: 'CHARGED_SPELL_COST_MISMATCH', message: expect.stringContaining('Bane'),
    }));

    ir.item.abilities = complete;
    const ready = await analyzeBrowserItemSourceWithAi(input, provider);
    expect(ready.findings).toEqual([]);
    expect(ready.status).toBe('ready_to_generate');
    const result = await generateBrowserItemIntakeCandidate(input, ready, provider);
    expect(result.status).toBe('ready_for_gm_review');
    const item = result.itemProjection as { system: { activities: Record<string, unknown> } };
    expect(Object.values(item.system.activities)).toEqual([1, 2, 3].map(cost => expect.objectContaining({
      type: 'cast',
      consumption: expect.objectContaining({
        spellSlot: false,
        targets: [expect.objectContaining({ type: 'itemUses', value: String(cost) })],
      }),
    })));
  });

  test('keeps each spell at one common charge price and resolves only omitted casting times', async () => {
    const pool = 'The staff has 4 charges.';
    const rule = 'You may spend one charge to cast Hex, Bane, or Bless.';
    const { source, candidate, ir } = itemFixture('Shared Price Staff', 'Staff', [pool, rule], {
      pool: { max: 4, recovery: [], quote: pool },
      abilities: [{
        id: 'hex', kind: 'spell', activation: 'action', consumption: 1,
        spell: { identifier: 'hex', name: 'Hex' }, quote: rule,
      }],
    });
    const provider = {
      providerName: 'fixture', extractionModel: 'fixture', reviewModel: 'fixture',
      discover: async () => ({ schemaVersion: 1 as const, candidates: [candidate] }),
      extract: async () => ir, repair: async () => ir,
      review: async () => { throw new Error('Review must stay disabled'); },
    };
    const result = await analyzeBrowserItemSourceWithAi({
      source, sourceName: 'Shared Price Staff', requestId: 'shared-price', fvttVersion: '14.370', systemVersion: '6.0.6',
    }, provider);
    expect(result.ir?.item.abilities[0]).toMatchObject({ activation: 'bonus' });
    expect(result.findings).toEqual(['Bane', 'Bless'].map(name => expect.objectContaining({
      code: 'MISSING_CHARGED_SPELL_ACTIVITY', message: expect.stringContaining(name),
    })));
  });

  test('diagnoses an unresolved named charged spell without treating mere references as Casts', async () => {
    const { source, candidate, ir } = itemFixture('Double Prism', 'Wondrous Item', [
      'The prism has 4 charges.',
      'You may cast Mote of Glass (2 charges). An engraving reads: Fireball (4 charges).',
    ], { pool: { max: 4, recovery: [], quote: 'The prism has 4 charges.' } });
    const result = await analyzeBrowserItemSourceWithAi({
      source, sourceName: 'Double Prism', requestId: 'unknown-cast', fvttVersion: '14.370', systemVersion: '6.0.6',
    }, {
      providerName: 'fixture', extractionModel: 'fixture', reviewModel: 'fixture',
      discover: async () => ({ schemaVersion: 1, candidates: [candidate] }),
      extract: async () => ir, repair: async () => ir,
      review: async () => { throw new Error('Review must stay disabled'); },
    });
    expect(result.status).toBe('needs_review');
    expect(result.findings).toEqual([expect.objectContaining({
      code: 'MISSING_CHARGED_SPELL_ACTIVITY', message: expect.stringContaining('Mote of Glass'),
    })]);
  });

  test.each([
    { grant: 'You can cast the following spells from the staff.', status: 'ready_to_generate' },
    { grant: '你可以从法杖施放下表中的法术，两次施法之间的限制持续 1 小时。', status: 'ready_to_generate' },
    { grant: 'As a bonus action, you can cast the following spells from the staff.', status: 'needs_review' },
    { grant: 'You can spend 1 minute to cast one of the following spells.', status: 'needs_review' },
  ])('uses the selected spell timing and base level only when the item supplies no override ($grant)', async ({ grant, status }) => {
    const pool = 'The staff has 5 charges.';
    const row = '| Fireball | 3 |';
    const fixture = itemFixture('Quarterstaff of Embers', 'Staff', [
      pool, 'The word Staff is inscribed along the grip.', 'While attuned, you can use a bonus action to light the gem for 1 hour.', grant,
      ['| Spell | Charge Cost |', '| --- | --- |', row].join('\n'),
    ], {
      pool: { max: 5, recovery: [], quote: pool },
      abilities: [{ id: 'fireball', kind: 'spell', activation: 'action', consumption: 3, level: 3,
        spell: { identifier: 'fireball', name: 'Fireball' }, quote: row }],
    });
    Object.assign(fixture.ir.item.abilities[0]!, { activation: 'special', activationOverride: false });
    fixture.ir.claims.find(claim => claim.path === '/item/type')!.evidence = [{ start: 0, end: 5, quote: 'Staff' }];
    const input = { ...fixture, sourceName: 'Quarterstaff of Embers', requestId: 'inherit-spell-casting',
      fvttVersion: '14.370', systemVersion: '6.0.6' };
    const provider = {
      providerName: 'fixture', extractionModel: 'fixture', reviewModel: 'fixture',
      discover: async () => ({ schemaVersion: 1 as const, candidates: [fixture.candidate] }),
      extract: async () => fixture.ir, repair: async () => fixture.ir,
      review: async () => { throw new Error('Review must stay disabled'); },
    };
    const result = await analyzeBrowserItemSourceWithAi(input, provider);
    expect(result.status).toBe(status);
    expect(result.ir?.claims.find(claim => claim.path === '/item/type')?.evidence[0]?.quote).toBe('*Staff, Rare*');
    expect(result.findings.some(finding => finding.code === 'SPELL_LEVEL_NOT_EXPLICIT')).toBe(false);
    if (status === 'ready_to_generate') {
      expect(result.ir?.item.abilities[0]).toMatchObject({ level: 3, activation: 'action' });
      const generated = await generateBrowserItemIntakeCandidate(input, result, provider);
      expect(generated.status).toBe('ready_for_gm_review');
      Object.assign(fixture.ir.item.abilities[0]!, { level: 4 });
      expect((await analyzeBrowserItemSourceWithAi(input, provider)).findings)
        .toContainEqual(expect.objectContaining({ code: 'SPELL_LEVEL_NOT_EXPLICIT', blocking: true }));
    } else {
      expect(result.findings).toContainEqual(expect.objectContaining({ code: 'INVALID_SPELL_ACTIVATION', blocking: true }));
    }
  });

  test('binds an explicit 2024 compendium Spell and scales a two-charge base to the stated level cap', async () => {
    const uuid = 'Compendium.dnd-heroes-faerun.options.Item.hofDoomtide00000';
    const fixed = '| @UUID[' + uuid + ']{Doomtide} (psychic damage version) | 4 |';
    const scaled = '| Scorching Ray | 2，每额外消耗1充能可以升1环，至多升至3环 |';
    const pool = 'The staff has 10 charges and regains 1d6+4 expended charges at dawn.';
    const { source, candidate, ir } = itemFixture('Compendium casting staff', 'Staff', [
      pool,
      ['| Spell | Charge Cost |', '| --- | --- |', fixed, scaled].join('\n'),
    ], {
      pool: { max: 10, recovery: [{ period: 'dawn', type: 'formula', formula: '1d6+4' }], quote: pool },
      abilities: [
        { id: 'doomtide', kind: 'spell', activation: 'action', consumption: 4, spell: { identifier: 'doomtide', name: 'Doomtide' }, quote: fixed },
        { id: 'ray', kind: 'spell', activation: 'action', consumption: 2, spell: { identifier: 'scorching-ray', name: 'Scorching Ray' }, quote: scaled },
      ],
    });
    let rules = '2024';
    let damageType = 'psychic';
    const nativeProjection = {
      target: FORGE_NATIVE_606_TARGET,
      project(_kind: 'Actor' | 'Item', input: unknown) { return input; },
      async readItemSpell(requested: string) {
        if (requested !== uuid) return undefined;
        return { uuid, name: 'Doomtide', identifier: 'doomtide', level: 4, rules,
          castingTime: { type: 'action' as const, value: null }, damageTypes: [damageType] };
      },
    };
    const input = { source, sourceName: 'Compendium staff', requestId: 'verified-binding',
      fvttVersion: '14.370', systemVersion: '6.0.6', nativeProjection };
    const provider = {
      providerName: 'fixture', extractionModel: 'fixture', reviewModel: 'fixture',
      discover: async () => ({ schemaVersion: 1 as const, candidates: [candidate] }),
      extract: async () => ir, repair: async () => ir,
      review: async () => { throw new Error('Review must stay disabled'); },
    };
    const analysis = await analyzeBrowserItemSourceWithAi(input, provider);
    expect(analysis.findings).toEqual([]);
    expect(analysis.ir?.item.abilities[1]).toMatchObject({ level: 2, maxCharges: 3 });
    const generated = await generateBrowserItemIntakeCandidate(input, analysis, provider);
    if (generated.status !== 'ready_for_gm_review') throw new Error(JSON.stringify(generated.findings));
    expect(generated.markdown).toContain('uuid: ' + uuid);
    const output = generated.itemProjection as { system: { uses: unknown; activities: Record<string, any> } };
    const [bound, ray] = Object.values(output.system.activities);
    expect(bound.spell).toMatchObject({ uuid, level: 4 });
    expect(bound.consumption).toMatchObject({ spellSlot: false, targets: [{ type: 'itemUses', value: '4' }] });
    expect(ray.spell).toMatchObject({ level: 2 });
    expect(ray.consumption).toMatchObject({ spellSlot: false,
      targets: [{ type: 'itemUses', value: '2', scaling: { mode: 'amount' } }],
      scaling: { allowed: true, max: 'min(@item.uses.value-1,2)' },
    });
    expect(output.system.uses).toMatchObject({ max: '10' });

    ir.uncertainties.push({
      id: 'variant-assumption', code: 'UNRESOLVED_SPELL_VARIANT', path: '/item/abilities/doomtide',
      message: 'The damage adjustment has not been verified.', blocking: true, evidence: ir.item.abilities[0]!.evidence,
    });
    const variantReconciled = await analyzeBrowserItemSourceWithAi(input, provider);
    expect(variantReconciled.status).toBe('ready_to_generate');
    expect(variantReconciled.findings).toContainEqual(expect.objectContaining({ code: 'VERIFIED_ITEM_SPELL_VARIANT', blocking: false }));

    damageType = 'necrotic';
    const wrongVariant = await analyzeBrowserItemSourceWithAi(input, provider);
    expect(wrongVariant.findings).toContainEqual(expect.objectContaining({
      code: 'ITEM_SPELL_BINDING_REQUIRED', message: expect.stringContaining('伤害类型'),
    }));
    expect(wrongVariant.findings).toContainEqual(expect.objectContaining({ code: 'UNRESOLVED_SPELL_VARIANT', blocking: true }));
    expect((await generateBrowserItemIntakeCandidate(input, analysis, provider)).status).not.toBe('ready_for_gm_review');
    damageType = 'psychic';
    rules = '2014';
    const legacyAnalysis = await analyzeBrowserItemSourceWithAi(input, provider);
    expect(legacyAnalysis.status).toBe('ready_to_generate');
    expect(legacyAnalysis.findings).toContainEqual(expect.objectContaining({
      code: 'ITEM_SPELL_RULES_NOTICE', message: expect.stringContaining('Doomtide'), blocking: false,
    }));
    const legacyCandidate = await generateBrowserItemIntakeCandidate(input, legacyAnalysis, provider);
    if (legacyCandidate.status !== 'ready_for_gm_review') throw new Error(JSON.stringify(legacyCandidate.findings));
    expect(legacyCandidate.findings).toContainEqual(expect.objectContaining({
      code: 'ITEM_SPELL_RULES_NOTICE', message: expect.stringContaining('2014'), blocking: false,
    }));
    // Changing a spell document after analysis still requires reviewing the updated binding.
    expect((await generateBrowserItemIntakeCandidate(input, analysis, provider)).status).not.toBe('ready_for_gm_review');
  });

  test('keeps the holder DC and fixed table price separate from another spell and item property', async () => {
    const pool = 'The staff has 8 charges.';
    const fixed = '| Fireball | 3 |';
    const scaled = '| Hex | 1, spend 1 charge per additional spell level, up to level 3 |';
    const resistance = 'You gain resistance to cold damage.';
    const ritual = 'The activation ritual requires a DC 18 Charisma saving throw.';
    const { source, candidate, ir } = itemFixture('Chillfire Staff', 'Staff', [
      pool, ritual, resistance, 'As an action, you can cast one spell from this table using your own spell save DC.',
      ['| Spell | Charge Cost |', '| --- | --- |', fixed, scaled].join('\n'),
    ], {
      pool: { max: 8, recovery: [], quote: pool },
      abilities: [
        { id: 'fireball', kind: 'spell', activation: 'action', consumption: 3, level: 3, saveDc: 18, maxCharges: 5,
          spell: { identifier: 'fireball', name: 'Fireball' }, quote: fixed },
        { id: 'hex', kind: 'spell', activation: 'action', activationOverride: true, consumption: 1, saveDc: 18,
          spell: { identifier: 'hex', name: 'Hex' }, quote: scaled },
        { id: 'resistance', kind: 'passive-resistance', damageType: 'cold', quote: ritual },
      ],
    });
    const ref = (quote: string) => ({ quote, start: source.indexOf(quote), end: source.indexOf(quote) + quote.length });
    ir.item.abilities[0]!.evidence.push(ref(ritual), ref(scaled));
    ir.item.abilities[1]!.evidence.push(ref(ritual));
    const input = { source, sourceName: 'Chillfire Staff', requestId: 'scoped-spell-config',
      fvttVersion: '14.370', systemVersion: '6.0.6' };
    const provider = {
      providerName: 'fixture', extractionModel: 'fixture', reviewModel: 'fixture',
      discover: async () => ({ schemaVersion: 1 as const, candidates: [candidate] }),
      extract: async () => ir, repair: async () => ir,
      review: async () => { throw new Error('Review must stay disabled'); },
    };
    const analysis = await analyzeBrowserItemSourceWithAi(input, provider);
    expect(analysis.findings).toEqual([]);
    expect(analysis.ir?.item.abilities[2]?.evidence[0]?.quote).toContain(resistance.slice(0, -1));
    const result = await generateBrowserItemIntakeCandidate(input, analysis, provider);
    expect(result.status).toBe('ready_for_gm_review');
    const item = result.itemProjection as { system: { activities: Record<string, any> } };
    const [fireball, hex] = Object.values(item.system.activities);
    expect(fireball.spell.challenge?.override).not.toBe(true);
    expect(hex.spell.challenge?.override).not.toBe(true);
    expect(fireball.consumption.scaling.allowed).toBe(false);
    expect(hex.consumption.scaling.allowed).toBe(true);
  });

  test('prefers a same-name 2024 compendium spell and uses an older spell with a nonblocking notice when needed', async () => {
    const name = "Tasha's Mind Whip";
    const identifier = 'tashas-mind-whip';
    const row = '| 塔莎心灵鞭 Tasha’s Mind Whip | 2，每额外消耗1充能可以升1环，至多升至3环 |';
    const pool = 'The staff has 10 charges and regains 1d6+4 expended charges at dawn.';
    const { source, candidate, ir } = itemFixture('Mind Whip Staff', 'Staff', [
      pool, ['| Spell | Charge Cost |', '| --- | --- |', row].join('\n'),
    ], {
      pool: { max: 10, recovery: [{ period: 'dawn', type: 'formula', formula: '1d6+4' }], quote: pool },
      abilities: [{ id: identifier, kind: 'spell', activation: 'action', consumption: 2, level: 2, maxCharges: 3,
        spell: { name, identifier }, quote: row }],
    });
    const older = 'Compendium.dnd-tashas-cauldron.tcoe-character-options.Item.tcoeTashasMindWh';
    const newer = 'Compendium.test-pack.spells.Item.abcdefghijklmnop';
    let haveNewer = true;
    const input = { source, sourceName: 'Mind Whip Staff', requestId: 'item-edition-default',
      fvttVersion: '14.370', systemVersion: '6.0.6', nativeProjection: {
        target: FORGE_NATIVE_606_TARGET,
        project(_kind: 'Actor' | 'Item', data: unknown) { return data; },
        async findItemSpellUuids(matches: (name: string) => boolean) {
          return matches('塔莎心灵鞭 Tasha’s Mind Whip') ? haveNewer ? [older, newer] : [older] : [];
        },
        async readItemSpell(uuid: string) {
          if (uuid !== older && uuid !== newer) return undefined;
          return { uuid, name, identifier, rules: uuid === newer ? '2024' : '2014', level: 2,
            castingTime: { type: 'action' as const, value: null }, damageTypes: ['psychic'] };
        },
      } };
    const provider = {
      providerName: 'fixture', extractionModel: 'fixture', reviewModel: 'fixture',
      discover: async () => ({ schemaVersion: 1 as const, candidates: [candidate] }),
      extract: async (request: { spellCatalog?: unknown }) => {
        expect(request.spellCatalog).toEqual([{ name, identifier, level: 2, activation: 'action' }]);
        return ir;
      },
      repair: async () => ir,
      review: async () => { throw new Error('Review must stay disabled'); },
    };
    for (const expectedUuid of [newer, older]) {
      const analysis = await analyzeBrowserItemSourceWithAi(input, provider);
      if (analysis.status !== 'ready_to_generate') throw new Error(JSON.stringify(analysis.findings));
      const generated = await generateBrowserItemIntakeCandidate(input, analysis, provider);
      if (generated.status !== 'ready_for_gm_review') throw new Error(JSON.stringify(generated.findings));
      const item = generated.itemProjection as { system: { activities: Record<string, any> } };
      const [cast] = Object.values(item.system.activities);
      expect(cast.spell).toMatchObject({ uuid: expectedUuid, level: 2 });
      expect(cast.consumption).toMatchObject({ spellSlot: false, targets: [{ type: 'itemUses', value: '2' }],
        scaling: { allowed: true, max: 'min(@item.uses.value-1,2)' } });
      expect(generated.findings.some(finding => finding.code === 'ITEM_SPELL_RULES_NOTICE')).toBe(!haveNewer);
      const standardSource = generated.finalSource!.replace(/^\s+uuid: .*\r?\n/mu, '');
      const standard = await convertFinalItemSource(buildForgeItemRequest({
        content: standardSource, displayName: input.sourceName, requestId: input.requestId,
        fvttVersion: input.fvttVersion, systemVersion: input.systemVersion,
      }), { nativeProjection: input.nativeProjection });
      if (!('result' in standard) || standard.result.status !== 'accepted') throw new Error(JSON.stringify(standard));
      expect(standard.result.diagnostics.some(entry => entry.code === 'ITEM_SPELL_RULES_NOTICE')).toBe(!haveNewer);
      expect(standard.result.itemDocument.activities[0]?.spell?.uuid).toBe(expectedUuid);
      haveNewer = false;
    }
  });

  test('scopes quoted casting time and restores only independently anchored narrative', async () => {
    const source = JEWEL_OF_THREE_PRAYERS_SOURCE;
    const candidate = jewelCandidate();
    const ir = buildJewelOfThreePrayersIr();
    const start = source.indexOf('三祷之坠是一件');
    const end = source.indexOf('佩戴者的 AC +1');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const range = (start: number, end: number) => ({ start, end, quote: source.slice(start, end) });
    ir.item.abilities.find(ability => ability.kind === 'spell')!.evidence = [range(end, source.length)];
    const story = { ...range(start, end), quote: source.slice(start, end).replace('三祷之坠是一件', '这件坠饰是一件'),
      classification: 'ignored-with-reason' as const, claimPaths: ['/item/stages'], reason: 'Appearance and stage heading.' };
    ir.coverage = [
      { ...range(0, start), classification: 'mechanical', claimPaths: ['/item/name', '/item/type'] },
      story,
      { ...range(end, source.length), classification: 'mechanical', claimPaths: ['/item/abilities/invisibility'] },
    ];
    const input = { source, sourceName: 'Jewel', requestId: 'staged-evidence', fvttVersion: '14.370', systemVersion: '6.0.6' };
    const run = () => analyzeBrowserItemSourceWithAi(input, {
      providerName: 'fixture', extractionModel: 'fixture', reviewModel: 'fixture',
      discover: async () => ({ schemaVersion: 1, candidates: [candidate] }),
      extract: async () => ir, repair: async () => ir,
      review: async () => { throw Error('Review disabled'); },
    });
    const result = await run();
    expect(result.status).toBe('ready_to_generate');
    expect(result.ir?.coverage[1]?.quote).toBe(source.slice(start, end));
    expect(story.quote).not.toBe(source.slice(start, end));
    story.claimPaths = ['/item/uses/max'];
    expect((await run()).findings.some(entry => entry.code === 'INVALID_EVIDENCE')).toBe(true);
  });

  test('reanchors coverage-only line breaks between Chinese sentences without accepting rewritten mechanics', async () => {
    const { source, candidate, ir } = splitPoolRingItem();
    const input = { source, sourceName: 'Starseal Ring', requestId: 'item-coverage-line-break',
      fvttVersion: '14.370', systemVersion: '6.0.6' };
    const run = (quote: string) => analyzeBrowserItemSourceWithAi(input, {
      providerName: 'fixture', extractionModel: 'fixture', reviewModel: 'fixture',
      discover: async () => ({ schemaVersion: 1, candidates: [candidate] }),
      extract: async () => ({ ...ir, coverage: [{ ...ir.coverage[0]!, end: quote.length, quote }] }),
      repair: async () => ir,
      review: async () => { throw new Error('Review must stay disabled'); },
    });
    const wrapped = source.replace('充能。黎明', '充能。\n黎明').replace('Invisibility。这项', 'Invisibility。\n这项');
    const analysis = await run(wrapped);
    expect(analysis.status).toBe('ready_to_generate');
    expect(analysis.ir?.coverage).toEqual(ir.coverage);
    const modified = await run(wrapped.replace('恢复所有', '恢复一半'));
    expect(modified.status).toBe('needs_review');
    expect(modified.findings.map(({ code }) => code)).toContain('INVALID_EVIDENCE');
  });

  test('round-trips the complete captured native receiver Item through the closed response codec',async()=>{
    const captured=NATIVE_RECEIVER_CAPTURE.cases.find(entry=>entry.kind==='Item')!,runtime=NATIVE_RECEIVER_CAPTURE.provenance;let observedInputHash:string|undefined;
    expect(String(hashArtifact(captured.input))).toBe(captured.inputHash);expect(String(hashArtifact(captured.output))).toBe(captured.outputHash);
    const response=await convertFinalItemSource(buildForgeItemRequest({content:captured.source,displayName:captured.key,requestId:'captured-shield',fvttVersion:runtime.core,systemVersion:runtime.systemVersion}),{
      nativeProjection:{target:FORGE_NATIVE_606_TARGET,runtime:{coreVersion:runtime.core,systemId:runtime.systemId,systemVersion:runtime.systemVersion},project(kind,input){
        expect(kind).toBe('Item');observedInputHash=hashArtifact(input);return structuredClone(captured.output);
      }},
    });
    expect(observedInputHash).toBe(captured.inputHash);expect(decodeForgeItemResponse(response)).toMatchObject({ok:true});
    if(!('result' in response)||response.result.status!=='accepted')throw Error(JSON.stringify(response));
    expect(response.result.status).toBe('accepted');expect(response.result.diagnostics).toEqual([]);
    expect(response.result.artifact).toEqual(normalizeForgeItemArtifact(captured.output,'14'));
    expect(response.result.artifactHash).toBe(hashArtifact(response.result.artifact));
    expect(String(hashArtifact(captured.output))).toBe(captured.outputHash);
  });

  test('native606: formal Item projection keeps FormulaField literals, all rarity labels and true target',async()=>{
    const request=buildForgeItemRequest({content:SHIELD_SOURCE,sourceId:ITEM_SOURCE_ID,displayName:'Shield',requestId:'native606-item-port',fvttVersion:'14.369',systemVersion:'6.0.6'});
    let calls=0;
    const response:any=await convertFinalItemSource(request,{nativeProjection:{target:FORGE_NATIVE_606_TARGET,project(kind,input){
      calls++;expect(kind).toBe('Item');expect(input.system.armor.magicalBonus).toBe('2');
      // Contract double for exact field-reader tests; actual construction is a separate Foundry check.
      for(const effect of input.effects){expect(effect.duration).toMatchObject({value:null,units:'seconds',expiry:null});
        effect.duration={value:null,units:'seconds',expiry:null,expired:false};effect.start=null;}
      input.system.armor.magicalBonus='2';input.system.rarities=['veryRare'];delete input.system.rarity;
      return input;
    }}});
    expect(calls).toBe(1);expect(response.result.target.systemVersionObserved).toBe('6.0.6');
    if(!response.result.artifact)throw Error(JSON.stringify(response.result.diagnostics));
    expect(response.result.artifact.system.armor.magicalBonus).toBe('2');
    expect(response.result.artifact.system.rarities).toEqual(['veryRare']);
    expect(response.result.itemDocument.rarity).toBe('veryRare');
    expect(response.result.diagnostics.some((entry:any)=>entry.code==='GEN_ITEM_ARMOR_MISMATCH')).toBe(false);
  });
  test('native606: a rejected receiver normalization preserves the native6 review candidate',async()=>{
    const request=buildForgeItemRequest({content:SHIELD_SOURCE,sourceId:ITEM_SOURCE_ID,displayName:'Shield',requestId:'native606-item-rejected',fvttVersion:'14.369',systemVersion:'6.0.6'});
    const response:any=await convertFinalItemSource(request,{nativeProjection:{target:FORGE_NATIVE_606_TARGET,project(){throw Error('Native item fixture rejected');}}});
    expect(response.result.status).toBe('needs_review');expect(response.result.target.systemVersionObserved).toBe('6.0.6');
    expect(response.result.artifact.system.armor.magicalBonus).toBe('2');
    expect(response.result.diagnostics.some((entry:any)=>entry.code==='NATIVE_PROJECTION_INCOMPLETE')).toBe(true);
    const removed:any=await convertFinalItemSource(request,{nativeProjection:{target:FORGE_NATIVE_606_TARGET,project(_kind,input){input.effects=[];return input;}}});
    expect(removed.result.status).toBe('needs_review');expect(removed.result.artifact).toBeDefined();
    expect(removed.result.diagnostics.find((entry:any)=>entry.code==='NATIVE_PROJECTION_INCOMPLETE').message).not.toMatch(/[\\/]/u);
  });
  test('disabled Item review preserves a strict local candidate for GM approval [review disabled]', async () => {
    const source = JEWEL_OF_THREE_PRAYERS_SOURCE;
    const input = { source, sourceName: 'Jewel', displayName: 'Jewel', requestId: 'item-optional-review',
      fvttVersion: '14.370', systemVersion: '6.0.6' };
    let reviews = 0;
    const provider = { providerName: 'fixture', extractionModel: 'fixture', reviewModel: 'fixture',
      discover: async () => ({ schemaVersion: 1 as const, candidates: [jewelCandidate()] }),
      extract: async () => buildJewelOfThreePrayersIr(), repair: async (request: any) => request.ir,
      review: async () => { reviews += 1; return { schemaVersion: 1 as const, verdict: 'needs_review' as const,
        findings: [{ id: 'advice', code: 'CHECK_SOURCE', path: '/item/description', message: 'GM should check this wording.',
          blocking: true, origin: 'ai-review' as const }] }; },
    };
    const analysis = await analyzeBrowserItemSourceWithAi(input, provider);
    const candidate = await generateBrowserItemIntakeCandidate(input, analysis, provider);
    expect(candidate.status).toBe('ready_for_gm_review');
    expect(candidate.modelReviewStatus).toBe('not_requested');
    expect(candidate.calls.review).toBe(0);
    expect(reviews).toBe(0);
    expect(candidate.response).toBeUndefined();
    const manual = approveBrowserItemIntakeCandidateForGm(input, candidate, 'gm');
    expect(manual.status).toBe('accepted');
    expect(manual.gmApproval?.modelReviewStatus).toBe('not_requested');
    const saved=structuredClone(candidate);
    await expect(reviewBrowserItemIntakeCandidate(input,candidate,provider)).rejects.toThrow('AI 内容复核已暂时关闭');
    expect(reviews).toBe(0);expect(candidate).toEqual(saved);expect(manual.response).toEqual(candidate.candidateResponse);
    expect(()=>approveBrowserItemIntakeCandidateForGm(input,{...candidate,candidateHash:'0'.repeat(64) as any},'gm')).toThrow(/变化/u);
  });
  test.each(['', ' \t '])('falls back from blank Item display name %j before formal generation', async (displayName) => {
    const input = { source: JEWEL_OF_THREE_PRAYERS_SOURCE, sourceName: 'Jewel', displayName,
      requestId: 'item-blank-display', fvttVersion: '14.368', systemVersion: '6.0.6' };
    const provider = { providerName: 'fixture', extractionModel: 'fixture', reviewModel: 'fixture',
      discover: async () => ({ schemaVersion: 1 as const, candidates: [jewelCandidate()] }),
      extract: async () => buildJewelOfThreePrayersIr(), repair: async (request: any) => request.ir,
      review: async () => { throw new Error('optional model review must not run'); },
    };
    const analysis = await analyzeBrowserItemSourceWithAi(input, provider);
    expect(analysis.status).toBe('ready_to_generate');
    const candidate = await generateBrowserItemIntakeCandidate(input, analysis, provider);
    expect(candidate.status).toBe('ready_for_gm_review');
    expect(candidate.calls).toEqual({ discovery: 1, extraction: 1, repair: 0, review: 0 });
    expect(approveBrowserItemIntakeCandidateForGm(input, candidate, 'gm').status).toBe('accepted');
  });
  test('keeps Item generation blocked when both display and source names are blank', async () => {
    const input = { source: JEWEL_OF_THREE_PRAYERS_SOURCE, sourceName: '', displayName: ' ',
      requestId: 'item-no-name', fvttVersion: '14.368', systemVersion: '6.0.6' };
    const provider = { providerName: 'fixture', extractionModel: 'fixture', reviewModel: 'fixture',
      discover: async () => ({ schemaVersion: 1 as const, candidates: [jewelCandidate()] }),
      extract: async () => buildJewelOfThreePrayersIr(), repair: async (request: any) => request.ir,
      review: async () => { throw new Error('optional model review must not run'); },
    };
    const analysis = await analyzeBrowserItemSourceWithAi(input, provider);
    expect(analysis.status).toBe('ready_to_generate');
    const candidate = await generateBrowserItemIntakeCandidate(input, analysis, provider);
    expect(candidate.status).toBe('failed');
    expect(candidate.candidateResponse).toBeUndefined();
    expect(candidate.calls).toEqual({ discovery: 1, extraction: 1, repair: 0, review: 0 });
  });
  test.each([
    ['12.331', '12', '4.3.9'],
    ['13.340', '12', '4.3.9'],
    ['14.370', '14', '6.0.6'],
  ] as const)('matches the formal Node Shield artifact for FVTT %s', async (fvttVersion, workflowTarget, systemVersion) => {
    const request = buildForgeItemRequest({
      content: SHIELD_SOURCE,
      sourceId: ITEM_SOURCE_ID,
      displayName: 'Shield',
      requestId: `shield-${fvttVersion}`,
      fvttVersion,
      systemVersion,
    });
    expect(request.source.sourceId).toBe(ITEM_SOURCE_ID);
    expect(request.source.utf8Sha256).toBe(hashSource(request.source.content));

    const nodeResponse = await convertFinalItemSource(request);
    const browserResponse = await (await browserRuntime()).convertFinalItemSource(request);
    const decoded = decodeForgeItemResponse(browserResponse);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || !('result' in decoded.value) || decoded.value.result.status !== 'accepted') {
      throw new Error(`Expected accepted Item response: ${JSON.stringify(browserResponse)}`);
    }
    expect(browserResponse).toEqual(nodeResponse);

    const formal = await conversionApplication.convertContent({
      content: request.source.content,
      fvttVersion: workflowTarget,
      effectProfile: 'core',
      iconOptions: { mode: request.resolvedTarget.iconMode },
      iconWorkflow: { ...iconWorkflowAdapter, createResolutionSession: createBundledIconResolutionSession },
    });
    expect(formal.kind).toBe('item');
    expect(formal.status).toBe('accepted');
    const normalized = normalizeForgeItemArtifact(formal.rawJson, workflowTarget);
    expect(decoded.value.result.artifact).toEqual(normalized);
    expect(decoded.value.result.artifactHash).toBe(hashArtifact(normalized));
    expect(decoded.value.result.target.systemVersionObserved).toBe(systemVersion);
    expect(JSON.stringify(browserResponse)).not.toMatch(/sourcePath|localCache|workflow|canonical|dnd5eRepo|reference/u);
    const bash = Object.values(((normalized.system as JsonObject).activities as JsonObject))
      .find((entry) => (entry as JsonObject).name === '强力猛击 Forceful Bash') as JsonObject;
    if (workflowTarget === '14') {
      expect(bash.activation).toEqual({ type: 'action', override: false });
      expect(bash.range).toEqual({ override: true, value: '5', units: 'ft', special: '' });
    } else {
      expect(bash.activation).toBeUndefined();
      expect(bash.consumption).toBeUndefined();
      expect(bash.duration).toBeUndefined();
      expect(bash.uses).toBeUndefined();
      expect(bash.range).toEqual({ override: false, value: null, long: null, reach: 5, units: 'ft', special: '' });
    }
  });

  test('returns a byte-stable Shield response across time without freezing clocks or randomness', async () => {
    const request = buildForgeItemRequest({
      content: SHIELD_SOURCE,
      sourceId: ITEM_SOURCE_ID,
      displayName: 'Stable Shield',
      requestId: 'stable-shield',
      fvttVersion: '14.370',
      systemVersion: '6.0.6',
    });
    const runtime = await browserRuntime();
    const first = await runtime.convertFinalItemSource(request);
    await Bun.sleep(30);
    const second = await runtime.convertFinalItemSource(request);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    if (!('result' in first) || first.result.status !== 'accepted' || !('artifact' in first.result)) {
      throw new Error(`Expected accepted stable Item response: ${JSON.stringify(first)}`);
    }
    expect((first.result.artifact._stats as Record<string, unknown>)?.createdTime).toBeNull();
    expect((first.result.artifact._stats as Record<string, unknown>)?.modifiedTime).toBeNull();
  });

  test('preserves Shield source semantics in the accepted closed summaries', async () => {
    const response = await convertFinalItemSource(buildForgeItemRequest({
      content: SHIELD_SOURCE,
      sourceId: ITEM_SOURCE_ID,
      displayName: 'Shield',
      requestId: 'shield-semantics',
      fvttVersion: '14.370',
      systemVersion: '6.0.6',
    }));
    if (!('result' in response) || response.result.status !== 'accepted') {
      throw new Error(`Expected accepted Shield: ${JSON.stringify(response)}`);
    }
    expect(response.result.diagnostics).toEqual([]);
    expect(response.result.itemDocument).toMatchObject({
      description: {
        value: expect.stringContaining('强力猛击'),
        chat: '',
      },
      rarity: 'veryRare',
      attunement: 'required',
      armor: { value: 2, magicalBonus: '2' },
      itemType: { value: 'shield', baseItem: 'shield' },
      properties: ['mgc'],
      weight: { value: 6, units: 'lb' },
    });
    const bash = response.result.itemDocument.activities.find((entry) => entry.name.includes('Forceful Bash'));
    const field = response.result.itemDocument.activities.find((entry) => entry.name.includes('Protective Field'));
    expect(bash).toMatchObject({
      type: 'attack',
      description: { chatFlavor: expect.stringContaining('2d6 + 2') },
      activation: { type: 'action', override: false },
      attack: { ability: 'str' },
      damage: { parts: [{ custom: { formula: '2d6+2+@mod' }, types: ['force'] }] },
      range: { value: '5', units: 'ft', override: true },
      consumption: { targets: [], scaling: { allowed: false }, spellSlot: true },
      duration: { units: 'inst', concentration: false, override: false },
      uses: { spent: 0, max: '', recovery: [] },
    });
    const bashArtifact = Object.values(
      ((response.result.artifact.system as JsonObject).activities as JsonObject),
    ).find((entry) => (entry as JsonObject).name === '强力猛击 Forceful Bash') as JsonObject;
    expect(bashArtifact.range).toEqual({ override: true, value: '5', units: 'ft', special: '' });
    expect(bashArtifact.activation).toEqual({ type: 'action', override: false });
    expect(bash?.effectIds).toHaveLength(1);
    expect(response.result.itemDocument.effects).toContainEqual(expect.objectContaining({
      id: bash?.effectIds[0],
      statuses: ['prone'],
    }));
    expect(field).toMatchObject({
      type: 'utility',
      description: { chatFlavor: expect.stringMatching(/5 尺内[\s\S]*次日黎明/) },
      activation: { type: 'reaction' },
      range: { override: false },
      uses: { max: '1', recovery: [{ period: 'dawn', type: 'recoverAll' }] },
      duration: { value: '1', units: 'minute', concentration: true },
      target: { override: false, template: { type: 'radius', size: '5' } },
    });
  });

  test('blocks multi-stage Jewel output without choosing an artifact or returning a hash', async () => {
    const response = await (await browserRuntime()).convertFinalItemSource(buildForgeItemRequest({
      content: JEWEL_SOURCE,
      sourceId: ITEM_SOURCE_ID,
      displayName: 'Jewel',
      requestId: 'jewel-multi-stage',
      fvttVersion: '14.370',
      systemVersion: '6.0.6',
    }));
    const decoded = decodeForgeItemResponse(response);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || !('result' in decoded.value)) throw new Error('Expected decoded multi-stage response.');
    expect(decoded.value.result.status).toBe('needs_review');
    expect(decoded.value.result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'FORGE_ITEM_MULTIPLE_ARTIFACTS_UNSUPPORTED',
      severity: 'warning',
    }));
    expect('artifact' in decoded.value.result).toBe(false);
    expect('artifactHash' in decoded.value.result).toBe(false);
  });

  test('creates one independently identified, cumulative Jewel variant per explicit stage', async () => {
    const runtime = await browserRuntime();
    const request = (index: number, content = JEWEL_SOURCE) => buildForgeItemRequest({
      content, sourceId: content === JEWEL_SOURCE ? ITEM_SOURCE_ID : undefined, stageIndex: index,
      displayName: 'Jewel', requestId: 'jewel-stage', fvttVersion: '14.370', systemVersion: '6.0.6',
    });
    const [dormant, awakened, exalted] = [request(0), request(1), request(2)];
    expect(new Set([dormant, awakened, exalted].map(entry => entry.source.sourceId)).size).toBe(3);
    expect(request(0, exalted.source.content).source).toEqual(dormant.source);
    for (const [index, entry] of [dormant, awakened, exalted].entries()) {
      const response = await runtime.convertFinalItemSource(entry);
      expect(decodeForgeItemResponse(response).ok).toBe(true);
      if (!('result' in response) || response.result.status !== 'accepted') throw Error(JSON.stringify(response));
      const { itemDocument } = response.result;
      expect(itemDocument.stage?.index).toBe(index);
      expect(itemDocument.uses).toEqual({ max: String(3 + 2 * index), spent: 0, recovery: [{ period: 'dawn', type: 'recoverAll' }] });
      expect(itemDocument.effects.flatMap(effect => effect.changes).filter(change => change.key === 'system.attributes.ac.bonus'))
        .toEqual([expect.objectContaining({ mode: 'add', value: String(index + 1) })]);
      const cast = itemDocument.activities.find(activity => activity.type === 'cast');
      expect(cast?.spell?.uuid).toBe('Compendium.dnd5e.spells24.Item.phbsplInvisibili');
      expect(cast?.consumption?.targets).toEqual([expect.objectContaining({ type: 'itemUses', value: '1' })]);
      expect(itemDocument.effects.flatMap(effect => effect.changes))
        .toContainEqual(expect.objectContaining({ key: 'token.light.dim', value: '30' }));
      expect(itemDocument.description.value).toContain('"诀别遗物 Vestiges of Divergence"');
      expect(String(itemDocument.description.value).includes('重新进行豁免')).toBe(index >= 1);
      expect(String(itemDocument.description.value).includes('4d10')).toBe(index >= 2);
      expect(itemDocument.activities.map(activity => activity.name).filter(name => /End a Condition|Reroll a Save|Teleport/u.test(name))).toHaveLength([0, 2, 3][index]!);
    }
    const bad = await runtime.convertFinalItemSource(request(3));
    expect('result' in bad && bad.result.status).toBe('failed');
  });

  test('applies an explicit stage bonus through the native shield field once', async () => {
    const source = [
      '---', 'layout: item', '名称: 星盾', '英文名: Star Shield', '类型: 盾牌', '稀有度: 珍稀', '---',
      '这面盾牌具有 2 发充能，并且在每天黎明恢复所有被消耗的充能。',
      '### 休眠态 Dormant', '- 当佩戴这面盾牌时，你的 AC 获得 +1 加值。',
      '### 觉醒态 Awakened', '- 盾牌提供的额外 AC 加值增加到 +2。',
    ].join('\n');
    const response = await (await browserRuntime()).convertFinalItemSource(buildForgeItemRequest({
      content: source, stageIndex: 1, displayName: 'Star Shield', requestId: 'stage-shield',
      fvttVersion: '14.370', systemVersion: '6.0.6',
    }));
    if (!('result' in response) || response.result.status !== 'accepted') throw Error(JSON.stringify(response));
    const { itemDocument } = response.result;
    expect(itemDocument.armor).toMatchObject({ magicalBonus: '2', value: 2 });
    expect(itemDocument.uses).toEqual({ max: '2', spent: 0, recovery: [{ period: 'dawn', type: 'recoverAll' }] });
    expect(itemDocument.effects.flatMap(effect => effect.changes)).toEqual([]);
  });

  test('keeps normal CLI/Web workflow output unnormalized and outside the Forge projection', async () => {
    const formal = await conversionApplication.convertContent({ content: SHIELD_SOURCE, fvttVersion: '14', effectProfile: 'core' });
    const raw = formal.rawJson as Record<string, any>;
    expect(raw._stats.createdTime).toEqual(expect.any(Number));
    expect(raw._stats.modifiedTime).toEqual(expect.any(Number));
    const normalized = normalizeForgeItemArtifact(raw, '14');
    expect((normalized._stats as Record<string, unknown>).createdTime).toBeNull();
    expect((normalized._stats as Record<string, unknown>).modifiedTime).toBeNull();
    expect(raw._stats.createdTime).toEqual(expect.any(Number));
  });
});

let builtBrowserRuntime: Promise<{
  convertFinalItemSource: (request: ForgeItemRequest) => Promise<ForgeItemResponse>;
}> | undefined;

async function browserRuntime(): Promise<{
  convertFinalItemSource: (request: ForgeItemRequest) => Promise<ForgeItemResponse>;
}> {
  if (!builtBrowserRuntime) {
    builtBrowserRuntime = (async () => {
      const outdir = await mkdtemp(resolve(tmpdir(), 'fvtt-json-forge-item-browser-'));
      try {
        const entrypoint = resolve('foundry-modules/fvtt-json-forge/tests/fixtures/browser-runtime-entry.ts');
        const bundlePath = await buildBrowserBundle({ entrypoint, outdir, naming: 'runtime.js' });
        const bundle = await readFile(bundlePath, 'utf8');
        expect(bundle).not.toMatch(/process\.env|\bBun\.|(?:from|require)\s*\(?\s*["'](?:node:|fs|path|sharp|crawlee)/iu);
        return await import(pathToFileURL(bundlePath).href) as {
          convertFinalItemSource: (request: ForgeItemRequest) => Promise<ForgeItemResponse>;
        };
      } finally {
        await rm(outdir, { recursive: true });
      }
    })();
  }
  return builtBrowserRuntime;
}

import { fireballWandItem, itemFixture, splitPoolRingItem } from '../src/core/intake/__tests__/fixtures/item-p0-cast';
import { describe, expect, test } from 'bun:test';
import { sha256 } from '@fvtt-json-generator/contracts';
import { DND5E_V14_SYSTEM_VERSION } from '@fvtt-json-generator/contracts/target';
import { getFoundryTarget } from '@fvtt-json-generator/generation/target';
import { OpenAICompatibleItemIntakeProvider, ITEM_INTAKE_PROMPT_VERSIONS } from '@fvtt-json-generator/intake-ai/item-provider';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';
import { ItemParser } from '@fvtt-json-generator/parser/item-parser';
import { ActivityGenerator } from '@fvtt-json-generator/generation/activity';
import { adaptParsedItemToCanonical } from '@fvtt-json-generator/generation/adapters';
import { verifyGeneratedDocument } from '@fvtt-json-generator/generation/verification';
import { resolveLockedDnd5eV14Spell } from '@fvtt-json-generator/generation/v14-spell-catalog';
import { runItemIntake } from '@fvtt-json-generator/intake-ai/item-orchestrator';
import { buildForgeItemRequest, convertFinalItemSource, FORGE_NATIVE_606_TARGET } from '@fvtt-json-generator/forge-browser-runtime';
import { decodeForgeItemResponse } from '@fvtt-json-generator/forge-gateway-protocol';
import { renderItemIntakeMarkdown } from '@fvtt-json-generator/intake-ai/item-renderer';
import { normalizeItemCandidates, normalizeItemIntakeIR } from '@fvtt-json-generator/intake-ai/item-core';
import type { StoredItemSpell } from '@fvtt-json-generator/models/item';
import { validateItemIntakeIR } from '@fvtt-json-generator/intake-ai/item-validator';
import type { ItemIntakeAiProvider, ItemIntakeIR, ItemIntakeRecovery } from '@fvtt-json-generator/intake-ai/item-types';
import {
  buildJewelOfThreePrayersIr,
  jewelCandidate,
  JEWEL_OF_THREE_PRAYERS_SOURCE,
} from '../src/core/intake/__tests__/fixtures/jewel-of-three-prayers';

describe('AI Item Intake V14 mechanics', () => {
  const spellItems: Array<{
    label: string; type: string; subtype: string; rule: string;
    uses?: { max: number; recovery: ItemIntakeRecovery[] }; cost: number;
  }> = [
    { label: '长夜之戒', type: '戒指（Ring）', subtype: 'ring', rule: '直到下一次长休后才能再次使用。',
      uses: { max: 1, recovery: [{ period: 'lr', type: 'recoverAll' }] }, cost: 1 },
    { label: 'Evenfall Wand', type: 'Wand', subtype: 'wand', rule: 'It has 4 charges and regains 1d4 expended charges at dusk.',
      uses: { max: 4, recovery: [{ period: 'dusk', type: 'formula', formula: '1d4' }] }, cost: 1 },
    { label: 'Traveler’s Ring', type: 'Ring', subtype: 'ring', rule: 'The ring has 2 charges and recovers all uses when you finish a Short Rest.',
      uses: { max: 2, recovery: [{ period: 'sr', type: 'recoverAll' }] }, cost: 1 },
    { label: 'Rod of the Distant Sky', type: 'Rod', subtype: 'rod', rule: 'You can use it once per day.',
      uses: { max: 1, recovery: [{ period: 'day', type: 'recoverAll' }] }, cost: 1 },
    { label: 'Ring of the Night Sky', type: 'Ring', subtype: 'ring', rule: 'You can cast it at will.', cost: 0 },
    { label: 'Finite Wand', type: 'Wand', subtype: 'wand', rule: 'It has 5 charges and cannot recover charges.',
      uses: { max: 5, recovery: [] }, cost: 1 },
  ];

  function spellItemFixture(entry: typeof spellItems[number]) {
    const spellText = 'You can use an action to cast Darkness.';
    const source = `## ${entry.label}\n*${entry.type}, Rare (Requires Attunement)*\n\n${spellText} ${entry.rule}`;
    const evidence = (quote: string) => {
      const start = source.indexOf(quote);
      return { start, end: start + quote.length, quote };
    };
    const candidate = { ...evidence(source), id: 'item', label: entry.label };
    const claims: ItemIntakeIR['claims'] = [
      { path: '/item/name', valueKind: 'explicit', value: entry.label, evidence: [evidence(entry.label)] },
      { path: '/item/type', valueKind: 'explicit', value: entry.type, evidence: [evidence(entry.type)] },
      { path: '/item/abilities/cast', valueKind: 'explicit', value: 'Darkness', evidence: [evidence(spellText)] },
    ];
    if (entry.uses) claims.push({ path: '/item/uses/max', valueKind: 'explicit', value: entry.uses.max, evidence: [evidence(entry.rule)] });
    const ir: ItemIntakeIR = {
      schemaVersion: 1, source: { sha256: sha256(source), length: source.length },
      item: {
        name: entry.label, type: entry.type, rarity: 'rare', attunement: 'required',
        ...(entry.uses ? { uses: structuredClone(entry.uses) } : {}),
        abilities: [{ kind: 'spell', id: 'cast', activation: 'action', consumption: entry.cost,
          spell: { identifier: 'darkness', name: 'Darkness' }, evidence: [evidence(spellText)] }],
      },
      claims, coverage: [{ ...evidence(source), classification: 'mechanical', claimPaths: claims.map(({ path }) => path) }],
      uncertainties: [],
    };
    return { source, candidate, ir };
  }

  async function generateItemFixture(fixture: ReturnType<typeof itemFixture>) {
    const markdown = renderItemIntakeMarkdown(fixture.source, fixture.candidate, fixture.ir);
    const result = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core' });
    expect(result.status).toBe('accepted');
    return { markdown, item: result.rawJson as any };
  }

  test.each([
    ['Wondrous Item', 'The bag holds up to 500 pounds, not exceeding a volume of 64 cubic feet. It weighs 5 pounds regardless of its contents.',
      { weight: { value: 500, units: 'lb' }, volume: { value: 64, units: 'cubicFoot' }, itemWeight: { value: 5, units: 'lb' }, weightlessContents: true }],
    ['Container', 'The case holds 6 items and weighs 1 kilogram.',
      { count: 6, itemWeight: { value: 1, units: 'kg' }, weightlessContents: false }],
    ['Container', 'The urn has a capacity of 12 liters.',
      { volume: { value: 12, units: 'liter' }, weightlessContents: false }],
  ] as const)('projects a source-backed native container for %s', async (type, quote, configuration) => {
    const fixture = itemFixture('Storage', type, [quote], {
      abilities: [{ id: 'storage', kind: 'container', quote, ...configuration }],
    });
    fixture.ir.item.rarity = '非普通 Uncommon';
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking).toEqual([]);
    const { item } = await generateItemFixture(fixture);
    const { itemWeight, weightlessContents, ...expected } = configuration as import('@fvtt-json-generator/models/item').ItemContainerData;
    expect(item.type).toBe('container');
    expect(item.system.rarities).toEqual(['uncommon']);
    expect(item.system.attunement).toBe('');
    expect(item.system.capacity).toEqual(expected);
    if (itemWeight) expect(item.system.weight).toEqual(itemWeight);
    expect(item.system.properties.includes('weightlessContents')).toBe(weightlessContents);
    expect(item.system.activities).toBeUndefined();
    expect(item.system.uses).toBeUndefined();
  });

  test('does not confuse container weight or dimensions with a capacity limit', () => {
    const quote = 'The bag holds 50 pounds. It weighs 5 pounds and is 4 feet deep.';
    const fixture = itemFixture('Storage', 'Container', [quote], {
      abilities: [{ id: 'storage', kind: 'container', quote, weight: { value: 5, units: 'lb' },
        volume: { value: 4, units: 'cubicFoot' }, itemWeight: { value: 5, units: 'lb' }, weightlessContents: false }],
    });
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking.map(entry => entry.path))
      .toEqual(expect.arrayContaining(['/item/abilities/0/weight', '/item/abilities/0/volume']));
  });

  test.each([
    ['Fireball', 'fireball', 3, '15', '7'],
    ['Chromatic Orb', 'chromatic-orb', 1, '13', '5'],
    [null, null, 2, null, null],
  ] as const)('keeps the standard Spell Scroll configuration for %s', async (name, identifier, level, save, attack) => {
    const quote = `Spell Scroll, level ${level}${name ? `; it contains ${name}.` : '.'}`;
    const fixture = itemFixture(name ?? 'Unbound Spell Scroll', 'Spell Scroll', [quote], {
      abilities: [{ id: 'scroll', kind: 'spell-scroll', level, ...(name && identifier ? { spell: { name, identifier } } : {}), quote }],
    });
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking).toEqual([]);
    const { item } = await generateItemFixture(fixture);
    expect(item.type).toBe('consumable');
    expect(item.system.type.value).toBe('scroll');
    expect(item.flags.dnd5e.spellLevel).toEqual({ base: level, value: level });
    expect(item.system.uses).toEqual({ max: '1', spent: 0, recovery: [], autoDestroy: true });
    const activities = Object.values(item.system.activities);
    if (name && identifier) {
      expect(activities).toEqual([expect.objectContaining({
        type: 'cast',
        spell: expect.objectContaining({
          uuid: resolveLockedDnd5eV14Spell(identifier, name)?.uuid,
          level, challenge: { override: true, save, attack }, properties: ['vocal', 'somatic', 'material'],
        }),
        consumption: expect.objectContaining({ spellSlot: false, targets: [expect.objectContaining({ type: 'itemUses', value: '1' })] }),
      })]);
    } else expect(activities).toEqual([]);
  });

  test('blocks a claimed Scroll spell that disagrees with its source or locked level', () => {
    const quote = 'A level 1 Spell Scroll contains the spell Fireball.';
    const fixture = itemFixture('Scroll', 'Scroll', [quote], {
      abilities: [{ id: 'scroll', kind: 'spell-scroll', quote, level: 1, spell: { identifier: 'fireball', name: 'Fireball' } }],
    });
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking.map(entry => entry.path))
      .toContain('/item/abilities/0/level');
  });

  const spellStorageRules = 'This ring can store up to 5 levels worth of spells at a time. When found, the GM chooses 1d6 − 1 levels of spells. The attuned wearer uses the actual slot level, save DC, spell attack bonus and spellcasting ability of the original caster. The spell is removed after it is used.';
  const storedFireball: StoredItemSpell = {
    spell: { identifier: 'fireball', name: 'Fireball' }, level: 3, ability: 'int', saveDc: 15, attackBonus: 7,
  };
  const storedOrb: StoredItemSpell = {
    spell: { identifier: 'chromatic-orb', name: 'Chromatic Orb' }, level: 2, ability: 'cha', saveDc: 14, attackBonus: 6,
  };
  const storedIntOrb: StoredItemSpell = { ...storedOrb, level: 1, ability: 'int', saveDc: 13, attackBonus: 5 };

  function spellStorageFixture(...spells: StoredItemSpell[]) {
    const inventory = spells.map(entry => `Currently stores level ${entry.level} ${entry.spell.name}, original caster ${entry.ability}, save DC ${entry.saveDc}, spell attack bonus ${entry.attackBonus < 0 ? '' : '+'}${entry.attackBonus}.`);
    const fixture = itemFixture('Ring of Spell Storing', 'Ring', [spellStorageRules, ...inventory], {
      abilities: [{ kind: 'spell-storage', id: 'storage', capacity: 5, foundLevels: '1d6-1', spells, quote: spellStorageRules }],
    });
    fixture.ir.item.attunement = 'required';
    fixture.ir.item.rarity = 'rare';
    fixture.ir.item.abilities[0]!.evidence = [fixture.candidate];
    return fixture;
  }

  test('keeps an unspecified five-level ring inventory empty', async () => {
    const fixture = spellStorageFixture();
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking).toEqual([]);
    const { item } = await generateItemFixture(fixture);
    expect(item).toMatchObject({ type: 'equipment', system: { type: { value: 'ring' }, equipped: false,
      attunement: 'required', rarities: ['rare'], activities: {}, uses: { max: '', spent: 0, recovery: [] } },
      flags: { fvttJsonGenerator: { spellStorage: { capacity: 5, foundLevels: '1d6-1' } } } });
  });

  test.each([[storedFireball, storedOrb], [storedOrb, storedIntOrb]])('preserves separate stored casts and their original slot levels', async (...spells) => {
    const fixture = spellStorageFixture(...spells);
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking).toEqual([]);
    const { item, markdown } = await generateItemFixture(fixture);
    const activities = Object.values(item.system.activities) as any[];
    expect(new Set(activities.map(({ _id }) => _id)).size).toBe(2);
    expect(activities).toEqual(spells.map(entry => expect.objectContaining({
      type: 'cast', uses: { max: '1', spent: 0, recovery: [] }, activation: expect.objectContaining({ override: false }),
      spell: { uuid: resolveLockedDnd5eV14Spell(entry.spell.identifier, entry.spell.name)?.uuid, level: entry.level, ability: entry.ability,
        properties: ['vocal', 'somatic', 'material'],
        challenge: { override: true, attack: String(entry.attackBonus), save: String(entry.saveDc) } },
      consumption: { spellSlot: false, scaling: { allowed: false, max: '' }, targets: [
        { type: 'activityUses', target: '', value: '1', scaling: { mode: '', formula: '' } },
      ] },
    })));
    const response = decodeForgeItemResponse(await convertFinalItemSource(buildForgeItemRequest({
      content: markdown, displayName: item.name, requestId: 'spell-storage', fvttVersion: '14.370', systemVersion: '6.0.6',
    })));
    expect(response).toMatchObject({ ok: true, value: { result: {
      status: 'accepted', itemDocument: { spellStorage: { capacity: 5, foundLevels: '1d6-1' } },
    } } });
    activities[0].consumption.targets[0].type = 'itemUses';
    const verification = verifyGeneratedDocument({ canonical: adaptParsedItemToCanonical(new ItemParser().parse(markdown)),
      output: item, effectProfile: 'core', target: '14' });
    expect(verification.diagnostics.map(entry => entry.code)).toContain('GEN_ITEM_SPELL_STORAGE_MISMATCH');
  });

  test('rejects an overfilled store, invented DC, and an omitted stored spell', () => {
    const invalid = [
      [spellStorageFixture(storedFireball, storedFireball), 'INVALID_SPELL_STORAGE'],
      [spellStorageFixture(storedFireball, storedOrb), 'STORED_SPELL_VALUES_NOT_EXPLICIT'],
      [spellStorageFixture(storedOrb), 'SPELL_STORAGE_INVENTORY_MISMATCH'],
    ] as const;
    (invalid[1][0].ir.item.abilities[0] as any).spells[0] = { ...storedFireball, saveDc: 11 };
    (invalid[2][0].ir.item.abilities[0] as any).spells = [];
    for (const [fixture, code] of invalid) {
      expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking.map(entry => entry.code)).toContain(code);
    }
    const empty = spellStorageFixture();
    const end = empty.source.lastIndexOf(' The spell is removed');
    const truncated = { ...empty.candidate, end, quote: empty.source.slice(0, end) };
    empty.ir.item.abilities[0]!.evidence = [truncated];
    empty.ir.coverage[0] = { ...empty.ir.coverage[0]!, end, quote: truncated.quote };
    expect(validateItemIntakeIR(empty.source, empty.ir, truncated).blocking.map(entry => entry.code))
      .toContain('SPELL_STORAGE_RELEASE_NOT_PRESERVED');
  });

  const bootRule = 'While wearing these boots, as a Bonus Action you click your heels together to double your Speed. If you click again, the boots end the effect. After a total of 10 minutes of use, the magic stops until you finish a Long Rest.';
  function timedSpeedFixture(rule: string, seconds: number) {
    const fixture = itemFixture('Swift Boots', 'Wondrous Item', [rule], {
      abilities: [{ kind: 'timed-speed', id: 'speed', seconds, quote: rule }],
    });
    fixture.ir.item.rarity = 'rare';
    fixture.ir.item.attunement = 'required';
    return fixture;
  }

  test.each([
    [bootRule, 600],
    [bootRule.replace('10 minutes', '90 seconds'), 90],
    ['佩戴时用附赠动作碰击靴跟，使移动速度翻倍。再次碰击靴跟会结束效果。累计使用 5 分钟后，直到完成长休才能再次使用。', 300],
  ] as const)('projects the source cumulative budget and a bounded self toggle', async (rule, seconds) => {
    const fixture = timedSpeedFixture(rule, seconds);
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking).toEqual([]);
    const { item, markdown } = await generateItemFixture(fixture);
    const [activity] = Object.values(item.system.activities) as any[];
    const [profile, rider] = item.effects;
    expect(item.system.uses).toEqual({ max: String(seconds), spent: 0, recovery: [{ period: 'lr', type: 'recoverAll' }] });
    expect(item.flags.dnd5e.riders.effect).toEqual([rider._id]);
    expect(activity).toMatchObject({
      type: 'enchant', enchant: { self: true }, activation: { type: 'bonus', value: 1 },
      effects: [{ _id: profile._id, riders: { effect: [rider._id] } }], consumption: { targets: [], spellSlot: false },
    });
    expect(profile).toMatchObject({ disabled: true, transfer: false, duration: { value: seconds, units: 'seconds', expiry: 'turnStart' } });
    expect(rider.system.changes.map(({ key, type, value }: any) => [key.split('.').at(-1), type, value])).toEqual(
      ['walk', 'fly', 'climb', 'burrow', 'swim'].map(key => [key, 'multiply', 2]));
    const response = decodeForgeItemResponse(await convertFinalItemSource(buildForgeItemRequest({
      content: markdown, displayName: item.name, requestId: 'timed-speed', fvttVersion: '14.370', systemVersion: '6.0.6',
    })));
    expect(response).toMatchObject({ ok: true, value: { result: { status: 'accepted', itemDocument: {
      timedSpeed: { units: 'seconds' }, effects: expect.arrayContaining([
        expect.objectContaining({ duration: { value: seconds, units: 'seconds', expiry: 'turnStart' } }),
      ]),
    } } } });
  });

  test.each([
    [bootRule.replace('your Speed', 'your walking speed'), 600],
    [bootRule.replace('finish a Long Rest', 'finish a Short Rest'), 600],
    [bootRule, 10],
  ] as const)('rejects a narrower speed, wrong recovery trigger or wrong time unit', (rule, seconds) => {
    const fixture = timedSpeedFixture(rule, seconds);
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking.map(entry => entry.code))
      .toContain('TIMED_SPEED_EVIDENCE_MISMATCH');
  });

  const griffonUuid = 'Compendium.dnd5e.actors24.Actor.mmGriffon0000000';
  const figurineRule = `用一个魔法动作把塑像掷到 60 尺内未占据的地面，使它变成一只 @UUID[${griffonUuid}]{狮鹫 Griffon}，最多 6 小时。它会在时限届满或提前结束时变回塑像。变回塑像后，必须等满 5 天才能再用。`;
  function summonFixture(rule = figurineRule, actorUuid = griffonUuid, cooldownDays = 5) {
    return itemFixture('青铜狮鹫异能塑像 Bronze Griffon Figurine', 'Wondrous Item', [rule], {
      abilities: [{ kind: 'summon-creature', id: 'summon-griffon', actorName: '狮鹫 Griffon',
        actorUuid, rangeFeet: 60, durationHours: 6, cooldownDays, quote: rule }],
    });
  }

  test('round-trips a fixed native Summon and a cooldown starting on reversion', async () => {
    const fixture = summonFixture();
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking).toEqual([]);
    const { item, markdown } = await generateItemFixture(fixture);
    expect(item.system.uses).toEqual({ max: '1', spent: 0, recovery: [] });
    expect(item.system.attunement).toBe('');
    expect(Object.values(item.system.activities)).toEqual([expect.objectContaining({
      type: 'summon', activation: { type: 'action', value: 1, override: false, condition: '魔法动作 Magic Action' },
      range: expect.objectContaining({ value: '60', units: 'ft' }),
      duration: expect.objectContaining({ value: '6', units: 'hour', concentration: false }),
      target: expect.objectContaining({ affects: expect.objectContaining({ type: 'space', special: 'unoccupied space' }) }),
      profiles: [expect.objectContaining({ uuid: griffonUuid, count: '1', name: '狮鹫 Griffon' })],
      consumption: expect.objectContaining({ spellSlot: false, targets: [expect.objectContaining({ type: 'itemUses', value: '1' })] }),
    })]);
    const result = decodeForgeItemResponse(await convertFinalItemSource(buildForgeItemRequest({
      content: markdown, displayName: item.name, requestId: 'summon-griffon', fvttVersion: '14.370', systemVersion: '6.0.6',
    })));
    expect(result).toMatchObject({ ok: true, value: { result: { status: 'accepted', itemDocument: {
      summonCooldown: { days: 5 }, activities: [expect.objectContaining({
        type: 'summon', summonProfiles: [expect.objectContaining({ uuid: griffonUuid, count: '1' })],
      })],
    } } } });
  });

  test('rejects an invented summon Actor and changed expiry evidence', () => {
    const cases = [summonFixture(figurineRule, 'Compendium.dnd5e.actors24.Actor.h052EIIUmRwJum65'),
      summonFixture(figurineRule, griffonUuid, 4), summonFixture(figurineRule.replace(/@UUID\[[^\]]+\]\{([^}]+)\}/u, '$1'))];
    for (const { source, ir, candidate } of cases) {
      expect(validateItemIntakeIR(source, ir, candidate).blocking.map(entry => entry.code)).toContain('ITEM_SUMMON_EVIDENCE_MISMATCH');
    }
  });

  const summonTableUuid = 'Compendium.example.tables.RollTable.BeastTable000000';
  const tableActorUuids = [
    'Compendium.example.actors.Actor.Weasel0000000000',
    'Compendium.example.actors.Actor.Boar000000000000',
  ];
  const summonRows = [
    '### 1d2 Creature',
    '',
    `1. @UUID[${tableActorUuids[0]}]{鼬鼠 Weasel}`,
    `2. @UUID[${tableActorUuids[1]}]{野猪 Boar}`,
    '',
    `@Embed[${summonTableUuid} rollable]`,
  ].join('\n');
  const tableSummonRule = 'Take a Magic action to throw the ball up to 20 feet. It transforms into a creature you determine by rolling 1d2 and consulting the table. The creature vanishes at the next dawn or when reduced to 0 Hit Points. Once two balls have been drawn, you cannot use this item until the next dawn.';

  test.each([
    [tableSummonRule, '2', '20', false],
    [tableSummonRule.replace('rolling 1d2 and consulting the table', 'rolling on the table'), '2', '20', false],
    ['用一个魔法动作把绒球投到 30 尺内。掷 1d2 并查表，绒球化作光芒并变成一只生物。该生物在下一个黎明或生命值降至 0 时消失。该生物对你和你的盟友友善。取出 3 个绒球后，直到下一个黎明才能再次使用。', '3', '30', true],
  ] as const)('preserves a table-based Summon with source-bound results and recovery', async (rule, uses, feet, friendly) => {
    const fixture = itemFixture('Summoning Pouch', 'Wondrous Item', [rule, summonRows]);
    const { item, markdown } = await generateItemFixture(fixture);
    expect(item.system.uses).toEqual({ max: uses, spent: 0, recovery: [{ period: 'dawn', type: 'recoverAll' }] });
    expect(item.system.attunement).toBe('');
    expect(item.effects).toEqual([]);
    expect(item.flags.fvttJsonGenerator.randomSummon).toEqual({ tableUuid: summonTableUuid, formula: '1d2' });
    expect(item.system.description.value).toContain(`@Embed[${summonTableUuid} rollable]`);
    const [activity] = Object.values(item.system.activities) as any[];
    expect(Object.values(item.system.activities)).toEqual([expect.objectContaining({
      type: 'summon', activation: { type: 'action', value: 1, override: false, condition: '魔法动作 Magic Action' },
      range: expect.objectContaining({ value: feet, units: 'ft' }),
      target: expect.objectContaining({ affects: { count: '1', type: 'space', choice: false } }),
      duration: { units: 'spec', special: '直到下一个黎明或生命值降至 0', concentration: false, override: false },
      profiles: [
        expect.objectContaining({ uuid: tableActorUuids[0], name: '1. 鼬鼠 Weasel', count: '1' }),
        expect.objectContaining({ uuid: tableActorUuids[1], name: '2. 野猪 Boar', count: '1' }),
      ],
      summon: { mode: '', prompt: true },
      match: expect.objectContaining({ disposition: friendly }),
      consumption: expect.objectContaining({ spellSlot: false, targets: [{ type: 'itemUses', value: '1', target: '' }] }),
    })]);
    const result = decodeForgeItemResponse(await convertFinalItemSource(buildForgeItemRequest({
      content: markdown, displayName: item.name, requestId: 'summon-table', fvttVersion: '14.370', systemVersion: '6.0.6',
    })));
    expect(result).toMatchObject({ ok: true, value: { result: { status: 'accepted', itemDocument: {
      randomSummon: { tableUuid: summonTableUuid, formula: '1d2' },
      activities: [expect.objectContaining({ summonMatch: { disposition: friendly }, duration: expect.objectContaining({ units: 'spec' }) })],
    } } } });
    activity.profiles.reverse();
    const canonical = adaptParsedItemToCanonical(new ItemParser().parse(markdown));
    expect(verifyGeneratedDocument({ canonical, output: item, target: '14', effectProfile: 'core' }).diagnostics.map(entry => entry.code))
      .toContain('GEN_ITEM_RANDOM_SUMMON_MISMATCH');
  });

  test.each(['\n', '\r\n'])('recovers only a complete adjacent source-linked table after discovery (%p)', newline => {
    const fixture = itemFixture('Summoning Pouch', 'Wondrous Item', [tableSummonRule, summonRows.replaceAll('\n', newline)]);
    const end = fixture.source.indexOf('### 1d2') - 2;
    const quote = fixture.source.slice(0, end);
    const partial = { ...fixture.candidate, end, quote };
    const [candidate] = normalizeItemCandidates(fixture.source, [partial]);
    expect(candidate?.quote).toBe(fixture.source);
    fixture.ir.coverage[0] = { ...fixture.ir.coverage[0]!, end, quote };
    const resolver = { resolveSpell: () => undefined, resolveActivation: () => undefined };
    const normalized = normalizeItemIntakeIR(fixture.source, candidate!, fixture.ir, resolver);
    expect(normalized.coverage[1]?.quote).toBe(fixture.source.slice(end));
    expect(validateItemIntakeIR(fixture.source, normalized, candidate!).blocking).toEqual([]);
    const incomplete = fixture.source.replace('2. @UUID', '1. @UUID');
    expect(normalizeItemCandidates(incomplete, [partial])).toEqual([partial]);
    expect(validateItemIntakeIR(fixture.source, fixture.ir, partial).blocking.map(entry => entry.code))
      .toContain('ITEM_RANDOM_SUMMON_BINDINGS_REQUIRED');
    const separated = quote + '\n\n## Separate Item\n' + fixture.source.slice(end);
    expect(normalizeItemCandidates(separated, [partial])).toEqual([partial]);
  });

  const enchantmentWeaponRule = 'Uncommon (+1), Rare (+2), or Very Rare (+3). You gain this bonus to attack rolls and damage rolls with the weapon.';
  const enchantmentArmorRule = 'Rare (Requires Attunement). You have resistance to one type of damage while you wear the armor. The GM chooses the type.\n\n| d10 | Damage Type |\n| --- | --- |\n| 1 | Cold |\n| 2 | Fire |\n| 3 | Force |';

  function enchantmentFixture(armor: boolean, subset = false) {
    const category = armor ? 'Armor (Any Light, Medium, or Heavy)' : 'Weapon (Any Simple or Martial)';
    const rule = armor ? enchantmentArmorRule : subset ? enchantmentWeaponRule.replace('Uncommon (+1), Rare (+2), or ', 'Rare (+2) or ') : enchantmentWeaponRule;
    const fixture = itemFixture(armor ? 'Ward Template' : 'Weapon Template', category, [rule], {
      abilities: [armor ? { id: 'ward', kind: 'enchant-armor-resistance', quote: rule, damageTypes: ['cold', 'fire', 'force'] }
        : { id: 'enhance', kind: 'enchant-weapon-bonus', quote: rule, bonuses: subset ? [2, 3] : [1, 2, 3] }],
    });
    fixture.ir.item.abilities[0]!.evidence = [fixture.candidate];
    if (armor) {
      fixture.ir.item.attunement = 'required';
      fixture.ir.item.rarity = 'rare';
    }
    return fixture;
  }

  test.each([false, true])('creates ordered native weapon profiles with correct tier rarity (subset %p)', async subset => {
    const fixture = enchantmentFixture(false, subset);
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking).toEqual([]);
    const { item } = await generateItemFixture(fixture);
    const activity = Object.values(item.system.activities)[0] as any;
    expect(item.system.type).toEqual({ value: '', baseItem: '' });
    expect(item.system.rarities).toEqual([]);
    expect(activity).toMatchObject({ type: 'enchant', enchant: { self: false },
      restrictions: { type: 'weapon', allowMagical: false, categories: ['simpleM', 'simpleR', 'martialM', 'martialR'], properties: [] },
      consumption: { spellSlot: false, targets: [] } });
    const effects = activity.effects.map(({ _id }: { _id: string }) => item.effects.find((effect: any) => effect._id === _id));
    expect(effects.map((effect: any) => {
      expect(effect).toMatchObject({ type: 'enchantment', disabled: true, transfer: false, duration: { value: null } });
      return effect.system.changes.filter((change: any) => ['system.magicalBonus', 'system.rarities'].includes(change.key))
        .map(({ value }: { value: string | number }) => value);
    })).toEqual(subset ? [[2, 'rare'], [3, 'veryRare']] : [[1, 'uncommon'], [2, 'rare'], [3, 'veryRare']]);
  });

  test('keeps each native armor resistance in its own rider and rejects a cross-linked rider', async () => {
    const fixture = enchantmentFixture(true);
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking).toEqual([]);
    const { item, markdown } = await generateItemFixture(fixture);
    const activity = Object.values(item.system.activities)[0] as any;
    expect(item.system.attunement).toBe('required');
    expect(activity.restrictions).toEqual({ type: 'equipment', allowMagical: false, categories: ['light', 'medium', 'heavy'], properties: [] });
    const ids = item.flags.dnd5e.riders.effect;
    expect(activity.effects.map((profile: any) => profile.riders.effect)).toEqual(ids.map((id: string) => [id]));
    expect(ids.map((id: string) => {
      const effect = item.effects.find((effect: any) => effect._id === id);
      expect(effect).toMatchObject({ type: 'base', transfer: true, disabled: false });
      return effect.system.changes[0].value;
    })).toEqual(['cold', 'fire', 'force']);

    const response = decodeForgeItemResponse(await convertFinalItemSource(buildForgeItemRequest({
      content: markdown, requestId: 'enchantment-armor', displayName: fixture.ir.item.name,
      fvttVersion: '14.370', systemVersion: '6.0.6',
    }), { nativeProjection: { target: FORGE_NATIVE_606_TARGET, project(_kind, source) {
      for (const effect of source.effects) effect.origin = null;
      return source;
    } } }));
    expect(response).toMatchObject({ ok: true, value: { result: {
      status: 'accepted', verification: { mechanicsCoverage: [expect.objectContaining({ kind: 'item-enchantment' })] },
      itemDocument: { riderEffectIds: expect.any(Array), activities: [expect.objectContaining({ type: 'enchant', enchantmentProfiles: expect.any(Array) })] },
    } } });

    const canonical = adaptParsedItemToCanonical(await new ItemParser().parse(markdown));
    activity.effects[0].riders.effect = [ids[1]];
    const verification = verifyGeneratedDocument({ canonical, output: item, effectProfile: 'core', target: '14' });
    expect(verification.diagnostics.map(finding => finding.code)).toContain('GEN_ITEM_ENCHANTMENT_MISMATCH');
  });

  test('rejects omitted enchantment choices and an armor template labeled as a shield', () => {
    const weapon = enchantmentFixture(false);
    (weapon.ir.item.abilities[0] as any).bonuses = [1, 3];
    expect(validateItemIntakeIR(weapon.source, weapon.ir, weapon.candidate).blocking.map(entry => entry.code))
      .toContain('ENCHANTMENT_EVIDENCE_MISMATCH');
    const armor = enchantmentFixture(true);
    armor.ir.item.type = 'Shield';
    expect(validateItemIntakeIR(armor.source, armor.ir, armor.candidate).blocking.map(entry => entry.code))
      .toContain('INVALID_ENCHANTMENT_CATEGORY');
  });

  test.each(['\n', '\r\n'])('anchors the closing Item table pipe only in coverage (%p)', newline => {
    const rule = ['| Tier |', '| --- |', '| Uncommon (+1) |'].join(newline);
    const fixture = itemFixture('Weapon Template', 'Weapon (Any Simple or Martial)', [rule]);
    const resolver = { resolveSpell: () => undefined, resolveActivation: () => undefined };
    fixture.ir.coverage[0]!.quote = fixture.source.slice(0, -1);
    const normalized = normalizeItemIntakeIR(fixture.source, fixture.candidate, fixture.ir, resolver);
    expect(normalized.coverage[0]?.quote).toBe(fixture.source);
    fixture.ir.coverage[0]!.quote = fixture.source.slice(0, -5);
    const omitted = normalizeItemIntakeIR(fixture.source, fixture.candidate, fixture.ir, resolver);
    expect(validateItemIntakeIR(fixture.source, omitted, fixture.candidate).blocking.map(entry => entry.code))
      .toContain('COVERAGE_INCOMPLETE');
  });

  test('healing potion preserves the exact amount, timing, recipient and one-bottle lifecycle', async () => {
    const quote = 'As a bonus action, you can drink the potion or administer it to another creature within 5 feet. The drinker regains 2d4 + 2 Hit Points.';
    const heal = { kind: 'heal' as const, id: 'heal', quote, activation: 'bonus' as const,
      formula: '2d4+2', target: 'creature' as const, range: 5, consumption: 1 as const };
    const fixture = itemFixture('Healing Potion', 'Potion', [quote], { abilities: [heal] });
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking).toEqual([]);
    const { item } = await generateItemFixture(fixture);
    expect(item.system.uses).toMatchObject({ max: '1', spent: 0, autoDestroy: true });
    const activities = Object.values(item.system.activities);
    expect(activities).toHaveLength(1);
    expect(activities).toEqual(expect.arrayContaining([expect.objectContaining({
      type: 'heal', activation: expect.objectContaining({ type: 'bonus' }),
      healing: expect.objectContaining({ number: 2, denomination: 4, bonus: '2' }),
      range: expect.objectContaining({ value: '5', units: 'ft' }),
    })]));

    const wrong = itemFixture('Healing Potion', 'Potion', [quote], { abilities: [{ ...heal, formula: '2d4', range: 10 }] });
    expect(validateItemIntakeIR(wrong.source, wrong.ir, wrong.candidate).blocking.map(entry => entry.path))
      .toEqual(expect.arrayContaining(['/item/abilities/0/formula', '/item/abilities/0/target']));
  });

  test('validates a combined AC and save bonus without losing the save or automating an armor restriction', async () => {
    const quote = 'While you wear this cloak, you gain a +1 bonus to Armor Class and saving throws.';
    const ac = { kind: 'passive-ac' as const, id: 'ac', quote, value: 1 };
    const save = { kind: 'passive-save' as const, id: 'save', quote, value: 1 };
    const fixture = itemFixture('Cloak of Protection', 'Wondrous Item', [quote], { abilities: [ac, save] });
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking).toEqual([]);
    const { item } = await generateItemFixture(fixture);
    expect(item.effects).toHaveLength(2);
    expect(item.effects.every((effect: { transfer: boolean }) => effect.transfer)).toBe(true);
    const incomplete = itemFixture('Cloak of Protection', 'Wondrous Item', [quote], { abilities: [ac] });
    expect(validateItemIntakeIR(incomplete.source, incomplete.ir, incomplete.candidate).blocking.map(entry => entry.code))
      .toContain('MISSING_PASSIVE_SAVE');
    const restricted = 'If you are wearing no armor, you gain a +2 bonus to Armor Class.';
    const unsafe = itemFixture('Bracers of Defense', 'Wondrous Item', [restricted], {
      abilities: [{ ...ac, quote: restricted, value: 2 }],
    });
    expect(validateItemIntakeIR(unsafe.source, unsafe.ir, unsafe.candidate).blocking.map(entry => entry.code))
      .toContain('CONDITIONAL_PASSIVE_UNSUPPORTED');
  });

  test('Forge Item Wand preserves the fixed save DC, charged upcast cap, and manual consequence', async () => {
    const fixture = fireballWandItem();
    const validation = validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate);
    expect(validation.blocking).toEqual([]);
    expect(validation.warnings.map(({ code }) => code)).toEqual(['LAST_CHARGE_REQUIRES_GM']);
    const { item } = await generateItemFixture(fixture);
    expect(item.system.uses).toEqual({ max: '7', spent: 0, recovery: [{ period: 'dawn', type: 'formula', formula: '1d6 + 1' }] });
    const [cast] = Object.values(item.system.activities) as any[];
    expect(cast).toMatchObject({
      type: 'cast',
      spell: { uuid: 'Compendium.dnd5e.spells24.Item.phbsplFireball00', level: 3, challenge: { override: true, save: '15' } },
      activation: { type: 'action', value: 1, override: false },
    });
    expect(cast.consumption).toEqual({
      spellSlot: false, scaling: { allowed: true, max: 'min(@item.uses.value,3)' },
      targets: [{ type: 'itemUses', target: '', value: '1', scaling: { mode: 'amount', formula: '' } }],
    });
    expect(cast.uses).toBeUndefined();
    expect(item.effects).toEqual([]);
    expect(item.system.description.value).toContain('crumbles into ashes');
    expect(item.system.description.value).toContain('[[/r 1d20]]');
    expect(item.flags.fvttJsonGenerator.lastChargeCheck).toEqual({ formula: '1d20', destroyOn: 1 });
  });

  test('last-charge check requires the spent-final-charge trigger and exact destruction result', async () => {
    const fixture = fireballWandItem();
    const { markdown, item } = await generateItemFixture(fixture);
    const parser = new ItemParser();
    expect(parser.parse(markdown.replace('wand’s last charge', 'wand')).lastChargeCheck).toBeUndefined();
    expect(parser.parse(markdown.replace('crumbles into ashes and is destroyed', 'retains only its attack bonus')).lastChargeCheck).toBeUndefined();
    expect(parser.parse(markdown.replace('roll 1d20', 'roll 1d20 + 2')).lastChargeCheck).toBeUndefined();
    const canonical = adaptParsedItemToCanonical(parser.parse(markdown));
    for (const mutate of [
      (output: any) => { output.system.uses.autoDestroy = true; },
      (output: any) => { output.flags.fvttJsonGenerator.lastChargeCheck.destroyOn = 2; },
      (output: any) => { output.system.description.value = output.system.description.value.replace('[[/r 1d20]]', '1d20'); },
    ]) {
      const output = structuredClone(item);
      mutate(output);
      expect(verifyGeneratedDocument({ canonical, output, target: '14', effectProfile: 'core' }).diagnostics.map(entry => entry.code))
        .toContain('GEN_ITEM_LAST_CHARGE_CHECK_MISMATCH');
    }
    const result = decodeForgeItemResponse(await convertFinalItemSource(buildForgeItemRequest({
      content: markdown, displayName: item.name, requestId: 'last-charge', fvttVersion: '14.370', systemVersion: '6.0.6',
    })));
    expect(result).toMatchObject({ ok: true, value: { result: { status: 'accepted',
      itemDocument: { lastChargeCheck: { formula: '1d20', destroyOn: 1 } } } } });
  });

  test('Forge Item treats a Chinese comma inside Wand scaling as part of the increment', () => {
    const pool = '这根魔杖有 7 次共享充能，每日黎明恢复 1d6 + 1 次已消耗的充能。';
    const rule = '消耗 1 次充能施放 3 环火球术 Fireball，每多消耗 1 次充能，施放的法术就提高 1 环。每次施放最多消耗 3 次充能，因此最高施放 5 环火球术。';
    const fixture = itemFixture('火球魔杖 Wand of Fireballs', '魔杖（Wand）', [pool, rule], {
      pool: { max: 7, recovery: [{ period: 'dawn', type: 'formula', formula: '1d6 + 1' }], quote: pool },
      abilities: [{ id: 'fireball', kind: 'spell', activation: 'action', consumption: 1, level: 3, maxCharges: 3,
        spell: { identifier: 'fireball', name: 'Fireball' }, quote: rule }],
    });
    const validate = () => validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate);
    expect(validate().blocking).toEqual([]);
    const cast = fixture.ir.item.abilities[0]!;
    if (cast.kind !== 'spell') throw new Error('Expected the Fireball Cast.');
    cast.level = 4;
    expect(validate().blocking.map(({ code }) => code)).toContain('SPELL_LEVEL_NOT_EXPLICIT');
  });

  test('Forge Item Ring keeps independent, shared and at-will Casts separate and honors an explicit casting time', async () => {
    const fixture = splitPoolRingItem();
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking).toEqual([]);
    const { item } = await generateItemFixture(fixture);
    expect(item.system.uses).toEqual({ max: '3', spent: 0, recovery: [{ period: 'dawn', type: 'recoverAll' }] });
    const casts = Object.values(item.system.activities) as any[];
    const castOf = (name: string) => casts.find(({ name: value }) => value.includes(name));
    const independent = castOf('Invisibility');
    expect(independent.uses).toEqual({ max: '1', spent: 0, recovery: [{ period: 'lr', type: 'recoverAll' }] });
    expect(independent.consumption).toEqual({
      spellSlot: false, scaling: { allowed: false, max: '' },
      targets: [{ type: 'activityUses', target: '', value: '1', scaling: { mode: '', formula: '' } }],
    });
    const shared = castOf('Magic Missile');
    expect(shared.spell).toEqual({ uuid: 'Compendium.dnd5e.spells24.Item.phbsplMagicMissi', level: 2 });
    expect(shared.activation).toEqual({ type: 'bonus', value: 1, override: true });
    expect(shared.uses).toBeUndefined();
    expect(shared.consumption).toEqual({
      spellSlot: false, scaling: { allowed: false, max: '' },
      targets: [{ type: 'itemUses', target: '', value: '1', scaling: { mode: '', formula: '' } }],
    });
    const atWill = castOf('Mage Hand');
    expect(atWill.consumption).toEqual({ spellSlot: false, scaling: { allowed: false, max: '' }, targets: [] });
    expect(atWill.uses).toBeUndefined();
  });

  test('Forge Item own-use Cast never invents an Item pool from the same rule', async () => {
    const rule = 'While wearing it, you can take an action to cast Etherealness from the armor. Once this property is used, it can’t be used again until the next dawn.';
    const fixture = itemFixture('Armor of Etherealness', 'Armor', [rule], {
      abilities: [{ id: 'etherealness', kind: 'spell', activation: 'action', consumption: 1,
        spell: { identifier: 'etherealness', name: 'Etherealness' },
        activityUses: { max: 1, recovery: [{ period: 'dawn', type: 'recoverAll' }] }, quote: rule }],
    });
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking).toEqual([]);
    const { markdown, item } = await generateItemFixture(fixture);
    expect(new ItemParser().parse(markdown).uses).toBeUndefined();
    expect(item.system.uses?.max || '').toBe('');
    const [cast] = Object.values(item.system.activities) as any[];
    expect(cast.uses).toEqual({ max: '1', spent: 0, recovery: [{ period: 'dawn', type: 'recoverAll' }] });
    expect(cast.consumption.targets).toEqual([{ type: 'activityUses', target: '', value: '1', scaling: { mode: '', formula: '' } }]);
  });

  test('Forge Item rejects invented spell facts, scope swaps and ungrounded manual notes', () => {
    const wand = fireballWandItem();
    const fireball = wand.ir.item.abilities[0]!;
    if (fireball.kind !== 'spell') throw new Error('Expected a spell');
    const blocked = () => validateItemIntakeIR(wand.source, wand.ir, wand.candidate).blocking.map(({ code }) => code);
    fireball.level = 4;
    fireball.saveDc = 16;
    fireball.maxCharges = 4;
    wand.ir.uncertainties[0]!.evidence[0]!.quote += ' altered';
    expect(blocked()).toEqual(expect.arrayContaining([
      'SPELL_LEVEL_NOT_EXPLICIT', 'SPELL_SAVE_DC_NOT_EXPLICIT', 'SPELL_SCALING_NOT_EXPLICIT', 'INVALID_EVIDENCE',
    ]));
    const ring = splitPoolRingItem();
    const [independent, shared] = ring.ir.item.abilities;
    if (independent?.kind !== 'spell' || shared?.kind !== 'spell') throw new Error('Expected two spells');
    shared.activityUses = independent.activityUses;
    delete independent.activityUses;
    delete shared.activationOverride;
    expect(validateItemIntakeIR(ring.source, ring.ir, ring.candidate).blocking.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'SPELL_ACTIVITY_POOL_OMITTED', 'SPELL_ACTIVITY_POOL_NOT_EXPLICIT', 'SPELL_ACTIVATION_MISMATCH',
    ]));
  });

  test('Forge Item verification rejects scope, recovery, DC, level, cap, and any doubled or slot payment', async () => {
    const verify = async (fixture: ReturnType<typeof itemFixture>, name: string, changes: Array<(cast: any, item: any) => void>) => {
      const { markdown, item } = await generateItemFixture(fixture);
      const canonical = adaptParsedItemToCanonical(new ItemParser().parse(markdown));
      for (const change of changes) {
        const output = structuredClone(item);
        const cast = (Object.values(output.system.activities) as any[]).find((activity) => activity.name.includes(name));
        change(cast, output);
        expect(verifyGeneratedDocument({ canonical, output, target: '14', effectProfile: 'core' }).diagnostics.map(({ code }) => code))
          .toContain('GEN_ITEM_SPELL_ACTIVITY_MISMATCH');
      }
    };
    await verify(fireballWandItem(), 'Fireball', [
      (cast) => { cast.spell.level = 4; },
      (cast) => { cast.spell.challenge.save = '16'; },
      (cast) => { cast.consumption.scaling.max = 'min(@item.uses.value,4)'; },
      (cast) => { cast.consumption.targets[0].scaling.formula = '2'; },
      (cast) => { cast.consumption.targets.push({ ...cast.consumption.targets[0], type: 'spellSlots' }); },
      (cast) => { cast.consumption.spellSlot = true; },
      (_, item) => { item.system.uses.max = '2'; },
    ]);
    await verify(splitPoolRingItem(), 'Invisibility', [
      (cast) => { cast.consumption.targets[0].type = 'itemUses'; },
      (cast) => { delete cast.uses; },
      (cast) => { cast.uses.recovery[0].period = 'dawn'; },
      (cast) => { cast.consumption.targets[0].target = 'otheractivity000'; },
    ]);
    const wand = fireballWandItem();
    const markdown = renderItemIntakeMarkdown(wand.source, wand.candidate, wand.ir);
    expect(() => new ItemParser().parse(markdown.replace('maxCharges: 3', 'maxCharges: 8'))).toThrow(/maxCharges/);
    expect(() => new ItemParser().parse(markdown.replace('类型: Wand', '类型: String'))).toThrow(/Unsupported item-mechanics source type/);
  });

  test.each([
    ['奇物（Wondrous Item）', 'equipment', 'wondrous', ''],
    ['Armor (Shield)', 'equipment', 'shield', 'shield'],
    ['药水（Potion）', 'consumable', 'potion', undefined],
    ['卷轴（Scroll）', 'consumable', 'scroll', undefined],
    ['法杖（Staff）', 'weapon', 'simpleM', 'quarterstaff'],
    ['容器（Container）', 'container', undefined, undefined],
    ['Loot', 'loot', 'gear', undefined],
  ])('Forge Item preserves explicit %s category without inventing an Activity', async (category, documentType, subtype, baseItem) => {
    const fixture = itemFixture('A named object', category, ['A plain description.']);
    expect(validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking).toEqual([]);
    const { item } = await generateItemFixture(fixture);
    expect(item.type).toBe(documentType);
    expect(item.system.type?.value).toBe(subtype);
    expect(item.system.type?.baseItem).toBe(baseItem);
    expect(Object.keys(item.system.activities ?? {})).toEqual([]);
  });

  test('Forge Item rejects both unknown types and a known category substituted for the exact source type', () => {
    const fixture = itemFixture('An object', 'String', ['A plain description.']);
    const codes = () => validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate).blocking.map(({ code }) => code);
    expect(codes()).toContain('UNSUPPORTED_ITEM_TYPE');
    fixture.ir.item.type = 'Loot';
    expect(codes()).toContain('ITEM_TYPE_NOT_EXPLICIT');
  });

  test.each(spellItems)('projects Item subtype and source-backed Cast resource for $label', async (entry) => {
    const { source, candidate, ir } = spellItemFixture(entry);
    expect(validateItemIntakeIR(source, ir, candidate).blocking).toEqual([]);
    const markdown = renderItemIntakeMarkdown(source, candidate, ir);
    const result = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core' });
    expect(result.status).toBe('accepted');
    const item = result.rawJson as any;
    expect(item.type).toBe('equipment');
    expect(item.system.type).toEqual({ value: entry.subtype, baseItem: '' });
    expect(item.system.rarities).toEqual(['rare']);
    expect(item.system.attunement).toBe('required');
    expect(item.system.uses).toMatchObject({ max: String(entry.uses?.max ?? ''), recovery: entry.uses?.recovery ?? [] });
    expect(Object.values(item.system.activities)).toEqual([expect.objectContaining({
      type: 'cast',
      spell: { uuid: 'Compendium.dnd5e.spells24.Item.phbsplDarkness00', level: 2 },
      consumption: { targets: entry.cost ? [expect.objectContaining({ type: 'itemUses', value: '1' })] : [],
        spellSlot: false, scaling: { allowed: false, max: '' } },
    })]);
  });

  test('Forge Item distinguishes numeric partial recovery from full recovery for both pools', () => {
    const cases = [
      {
        item: 'The ring has 3 charges and regains 2 expended charges at dawn.',
        activity: 'Use an action to cast Darkness. This spell has its own 3 uses and restores 2 spent uses at the end of a Long Rest.',
        expected: ['/item/uses/recovery/0', '/item/abilities/0/activityUses/recovery/0'],
      },
      {
        item: '这枚戒指有 3 次充能，每天黎明恢复 2 次已消耗的充能。',
        activity: '用一个动作施放黑暗术 Darkness，具有独立的 3 次使用次数，并在长休后恢复 2 次已消耗的使用次数。',
        expected: ['/item/uses/recovery/0', '/item/abilities/0/activityUses/recovery/0'],
      },
      {
        item: 'The ring has 3 charges and regains all 3 expended charges at dawn.',
        activity: '用一个动作施放黑暗术 Darkness，具有独立的 3 次使用次数，并在长休后恢复全部 3 次已消耗的使用次数。',
        expected: [],
      },
    ];
    for (const { item, activity, expected } of cases) {
      const fixture = itemFixture('Test Ring', 'Ring', [item, activity], {
        pool: { max: 3, recovery: [{ period: 'dawn', type: 'recoverAll' }], quote: item },
        abilities: [{ id: 'darkness', kind: 'spell', activation: 'action', consumption: 1,
          spell: { identifier: 'darkness', name: 'Darkness' }, quote: activity,
          activityUses: { max: 3, recovery: [{ period: 'lr', type: 'recoverAll' }] } }],
      });
      const validate = () => validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate);
      expect(validate().blocking.map(({ code, path }) => [code, path])).toEqual(
        expected.map((path) => ['USES_NUMERIC_RECOVERY_AS_FULL', path]),
      );
      if (expected.length) {
        fixture.ir.item.uses!.recovery = [{ period: 'dawn', type: 'formula', formula: '2' }];
        const cast = fixture.ir.item.abilities[0]!;
        if (cast.kind !== 'spell') throw new Error('Expected the Darkness Cast.');
        cast.activityUses!.recovery = [{ period: 'lr', type: 'formula', formula: '2' }];
        expect(validate().blocking).toEqual([]);
      }
    }
  });

  test('checks annotated charge-table rows and keeps other rest and die rules out of shared charges', () => {
    const pool = '这根魔杖具有10充能。黎明重获1d6+4已消耗的充能。';
    const fixture = itemFixture('Shared pool and spell options', 'Wand', [
      pool,
      '| 法术 | 充能消耗 |\n| --- | --- |\n| 魔法飞弹 Magic Missile（雷鸣伤害版本） | 1，每额外消耗1充能可以升1环，至多升至3环 |\n| 灼热射线 Scorching Ray | 2，每额外消耗1充能可以升1环，至多升至3环 |\n| 黑暗术 Darkness\\* | 3 |\n| 火球术 Fireball | 等于施法者等级 |',
      '每长休一次，无视指定抗性。你可以恢复一个法术位，长休前不能再次使用。若骰值为20，恢复1d8+2充能。',
    ], { pool: { max: 10, recovery: [{ period: 'dawn', type: 'formula', formula: '1d6+4' }], quote: pool } });
    fixture.ir.claims.find(claim => claim.path === '/item/uses/max')!.evidence = [fixture.candidate];
    const check = () => validateItemIntakeIR(fixture.source, fixture.ir, fixture.candidate);
    expect(check().blocking.map(({ code, message }) => [code, message])).toEqual([
      ['MISSING_CHARGED_SPELL_ACTIVITY', expect.stringContaining('Magic Missile')],
      ['MISSING_CHARGED_SPELL_ACTIVITY', expect.stringContaining('Scorching Ray')],
      ['MISSING_CHARGED_SPELL_ACTIVITY', expect.stringContaining('Darkness')],
      ['CHARGED_SPELL_TABLE_ROW_NEEDS_REVIEW', expect.stringContaining('Fireball')],
    ]);
    fixture.ir.item.uses!.recovery = [];
    expect(check().blocking).toContainEqual(expect.objectContaining({ code: 'USES_RECOVERY_OMITTED', message: expect.stringContaining('dawn') }));
    fixture.ir.item.uses!.recovery = [{ period: 'lr', type: 'recoverAll' }];
    expect(check().blocking).toContainEqual(expect.objectContaining({ code: 'USES_RECOVERY_PERIOD_NOT_EXPLICIT' }));
  });

  test('blocks an Item period switch, a fabricated recovery roll and a charge that has no pool', () => {
    const rest = spellItemFixture(spellItems[0]!);
    rest.ir.item.uses!.recovery = [{ period: 'dawn', type: 'recoverAll' }];
    expect(validateItemIntakeIR(rest.source, rest.ir, rest.candidate).blocking.map(({ code }) => code))
      .toContain('USES_RECOVERY_PERIOD_NOT_EXPLICIT');
    const dice = spellItemFixture(spellItems[1]!);
    dice.ir.item.uses!.recovery = [{ period: 'dusk', type: 'formula', formula: '1d6' }];
    expect(validateItemIntakeIR(dice.source, dice.ir, dice.candidate).blocking.map(({ code }) => code))
      .toContain('USES_RECOVERY_FORMULA_NOT_EXPLICIT');
    dice.ir.item.uses!.recovery = [{ period: 'dusk', type: 'recoverAll' }];
    expect(validateItemIntakeIR(dice.source, dice.ir, dice.candidate).blocking.map(({ code }) => code))
      .toContain('USES_DICE_RECOVERY_AS_FULL');
    delete rest.ir.item.uses;
    expect(validateItemIntakeIR(rest.source, rest.ir, rest.candidate).blocking.map(({ code }) => code))
      .toContain('SPELL_COST_OUTSIDE_ITEM_POOL');
  });

  test('a bare Item Ring is recognized while prose and unrelated accessories keep their original types', () => {
    const parser = new ItemParser();
    expect(parser.classifyItemType('Ring')).toBe('equipment');
    expect(parser.classifyItemType('戒指（Ring）')).toBe('equipment');
    expect(parser.classifyItemType('饰物（戒指）')).toBe('equipment');
    expect(parser.classifyItemType('String')).toBe('loot');
    expect(parser.classifyItemType('earring')).toBe('loot');
    expect(parser.classifyItemType('奇物')).toBe('equipment');
  });
  test('sends the current v14 catalog and transferable AC Effect contract to Item AI', async () => {
    const prompts: string[] = [];
    const auditVersions: string[] = [];
    const ir = buildJewelOfThreePrayersIr();
    const candidate = jewelCandidate();
    const provider = new OpenAICompatibleItemIntakeProvider({
      authMode: 'api-key', apiKey: 'fixture-key', baseUrl: 'https://provider.example/v1', model: 'fixture-model', reviewModel: 'fixture-model',
      timeoutMs: 1000, repairTimeoutMs: 1000,
      audit: event => auditVersions.push(event.promptVersion),
      httpClient: async (_url, request) => {
        const body = JSON.parse(request.body);
        prompts.push(body.messages[0].content);
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: {
          content: JSON.stringify(prompts.length === 2 ? { schemaVersion: 1, verdict: 'accepted', findings: [] } : ir),
        } }] }) };
      },
    });
    await provider.extract({ source: JEWEL_OF_THREE_PRAYERS_SOURCE, sourceSha256: ir.source.sha256, candidate });
    const review = { source: JEWEL_OF_THREE_PRAYERS_SOURCE, candidate, ir, markdown: '', itemProjection: {}, deterministicFindings: [] };
    await provider.review(review);
    await provider.repair(review);
    for (const prompt of prompts) {
      expect(prompt).toContain(`locked dnd5e ${DND5E_V14_SYSTEM_VERSION}`);
      expect(prompt).not.toContain('5.3.3');
    }
    expect(prompts[1]).toContain('a base Effect with transfer true');
    expect(prompts[1]).toContain('"value":1,"phase":"initial"');
    expect(auditVersions).toEqual([ITEM_INTAKE_PROMPT_VERSIONS.extract, ITEM_INTAKE_PROMPT_VERSIONS.review, ITEM_INTAKE_PROMPT_VERSIONS.repair]);
  });

  test('excludes the preserved-source heading from a monolingual Item name', async () => {
    const fixture = itemFixture('Gloaming Deep Ring', 'Ring', ['A single-language source.']);
    const { item } = await generateItemFixture(fixture);
    expect(item.name).toBe('Gloaming Deep Ring');
    expect(item.system.description.value).not.toContain('Intake 保留');
  });

  test('preserves a source Item image and exact HTML description through formal Markdown generation', async () => {
    const sourceImage = 'worlds/cor-cotn/packs/%E4%B8%89%E7%A5%B7%E4%B9%8B%E5%9D%A0%201.png';
    const sourceDescription = '<div><p>奇物，传说（需同调）</p></div><div><p>三祷之坠是一件诀别遗物。</p></div><div><p>一面闪闪发光的黄金圆盘，系在一条精致的金链上。链条可以魔法般调整大小，变成适合佩戴者的项链尺寸。</p><p></p></div><div><p>在<span style="color:blue">休眠态Dormant状态</span>下，这件坠饰有着以下属性：</p></div><div><ul><li><p>佩戴者的 AC +1。</p></li><li><p>当佩戴或手握这件坠饰时，你可以以一个<span style="color:blue">动作</span>令它发出 15 尺半径的明亮光照和在此之外 15 尺的微光光照。光照会持续到你将其熄灭（无需动作）。</p></li><li><p>这件饰物具有 <strong>3</strong> 发充能，并且在每天黎明恢复所有被消耗的充能。</p><div><p>坠饰额外获得以下属性，当你手持或佩戴它时，你可以：</p><ul><li><p>消耗 1 发充能施展 隐形术 invisibility。</p></li></ul></div></li></ul></div><div><p></p></div>';
    const markdown = [
      '---',
      'layout: item',
      '名称: 三祷之坠 Jewel of Three Prayers',
      '类型: 饰物',
      '稀有度: 传说',
      '需同调: true',
      `img: "${sourceImage}"`,
      'item-mechanics:',
      '  schemaVersion: 1',
      '  uses:',
      '    max: 3',
      '    recovery:',
      '      - period: dawn',
      '        type: recoverAll',
      '  abilities:',
      '    - id: ac-plus-one',
      '      kind: passive-ac',
      '      value: 1',
      '    - id: light',
      '      kind: light',
      '      activation: action',
      '      consumption: 0',
      '      bright: 15',
      '      dim: 30',
      '      extinguish: disable-effect',
      '    - id: invisibility',
      '      kind: spell',
      '      activation: action',
      '      consumption: 1',
      '      spell:',
      '        identifier: invisibility',
      '        name: Invisibility',
      '---',
      '## 三祷之坠 Jewel of Three Prayers',
      sourceDescription,
    ].join('\n');

    const parsed = new ItemParser().parse(markdown);
    expect(parsed.img).toBe(sourceImage);
    expect(parsed.description).toBe(sourceDescription);

    const result = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core' });
    expect(result.status).toBe('accepted');
    const item = result.rawJson as any;
    expect(item.img).toBe(sourceImage);
    expect(item.system.description.value).toBe(sourceDescription);
    expect(item.system.properties).toContain('mgc');
    expect(Object.values(item.system.activities).some((activity: any) => activity.type === 'utility')).toBe(true);
    expect(Object.values(item.system.activities).some((activity: any) => activity.type === 'cast' && activity.consumption.spellSlot === false && activity.consumption.targets?.some((target: any) => target.type === 'itemUses' && target.value === '1'))).toBe(true);
  });

  test('projects Moonweaver spear source mechanics into native V14 weapon, light, save, and charge scaling fields', async () => {
    const markdown = [
      '---',
      'layout: item',
      '名称: 织月者之矛',
      "英文名: MOONWEAVER'S SPEAR",
      '类型: 武器',
      '稀有度: 稀有',
      'require-attunement: true',
      'item-mechanics:',
      '  schemaVersion: 1',
      '  uses:',
      '    max: 3',
      '    recovery:',
      '      - period: dawn',
      '        type: recoverAll',
      '  abilities:',
      '    - id: moonlight',
      '      name: 月光',
      '      kind: light',
      '      activation: bonus',
      '      consumption: 0',
      '      bright: 10',
      '      dim: 20',
      '      extinguish: disable-effect',
      '    - id: moonweavers-touch',
      '      name: 织月者之触',
      "      englishName: Moonweaver's Touch",
      '      kind: save',
      '      activation: action',
      '      consumption: 1',
      '      scale-consumption: true',
      '      scale-max: 3',
      '      dc: 15',
      '      ability: con',
      '      outcome: half',
      '      range:',
      '        value: 30',
      '        units: ft',
      '      target:',
      '        type: creature',
      '        count: 1',
      '        special: 你能看见的生物',
      '      duration:',
      '        value: 1',
      '        units: minute',
      '        concentration: true',
      '      damage:',
      '        formula: 2d8',
      '        type: radiant',
      '        scaling:',
      '          mode: whole',
      '          number: 2',
      '      description: 失败时变形成由你选择的挑战等级0微型野兽，并在每回合结束重复豁免。',
      '---',
      '## 织月者之矛（MOONWEAVER\'S SPEAR）',
      '*武器（长矛），稀有（需要同调）*',
      '',
      '这柄魔法长矛散发着微弱的银色光芒。',
      '',
      '当你手持这柄长矛时，可以使用一个**附赠动作**，令其散发：',
      '',
      '- 半径10尺的明亮光照；',
      '- 再向外10尺的微光光照。',
      '',
      '你也可以使用附赠动作熄灭这些光芒。',
      '',
      "### 织月者之触（Moonweaver's Touch）",
      '',
      '长矛拥有 **3发充能**，并在每天黎明时恢复所有已消耗的充能。',
      '',
      '当你手持长矛时，可以使用一个动作并消耗**1发或更多充能**，向你能看见的30尺内一个生物射出一道月光。',
      '',
      '目标必须进行一次 **DC 15 体质豁免**。',
      '',
      '每消耗1发充能：',
      '',
      '- **豁免失败：**受到 **2d8光耀伤害**；',
      '- **豁免成功：**受到一半伤害。',
      '',
      '如果豁免失败，目标还会变形成一只由你选择的、**挑战等级0的微型野兽**，持续1分钟，如同受到 *变形术（Polymorph）* 影响，而此期间你需要维持专注，如同你专注一个法术一般。',
      '',
      '目标可以在自己的每个回合结束时重复该豁免，成功则提前结束自身受到的变形效果。',
    ].join('\n');

    const result = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core' });
    expect(result.status).toBe('accepted');
    const item = result.rawJson as any;
    expect(item.type).toBe('weapon');
    expect(item.system.type).toEqual({ value: 'simpleM', baseItem: 'spear' });
    expect(item.system.damage.base).toEqual(expect.objectContaining({ number: 1, denomination: 6, bonus: '', types: ['piercing'] }));
    expect(item.system.damage.versatile).toEqual(expect.objectContaining({ number: 1, denomination: 8, types: ['piercing'] }));
    expect(item.system.range).toEqual(expect.objectContaining({ value: 20, long: 60, units: 'ft' }));
    expect(item.system.properties).toEqual(expect.arrayContaining(['mgc', 'thr', 'ver']));
    expect(item.system.uses).toEqual({ max: '3', spent: 0, recovery: [{ period: 'dawn', type: 'recoverAll' }] });

    const activities = Object.values(item.system.activities) as any[];
    const light = activities.find((activity) => activity.type === 'utility' && activity.activation?.type === 'bonus');
    expect(light).toBeDefined();
    const lightEffect = item.effects.find((effect: any) => effect.transfer === false);
    expect(lightEffect.system.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'token.light.bright', value: 10 }),
      expect.objectContaining({ key: 'token.light.dim', value: 20 }),
    ]));

    const touch = activities.find((activity) => activity.type === 'save');
    expect(touch).toEqual(expect.objectContaining({
      activation: expect.objectContaining({ type: 'action' }),
      consumption: expect.objectContaining({
        targets: [{ type: 'itemUses', target: '', value: '1', scaling: { mode: 'amount', formula: '' } }],
        scaling: { allowed: true, max: '3' },
        spellSlot: false,
      }),
      save: { ability: ['con'], dc: { calculation: '', formula: '15' } },
      damage: expect.objectContaining({
        onSave: 'half',
        parts: [expect.objectContaining({ number: 2, denomination: 8, types: ['radiant'], scaling: { mode: 'whole', number: 2, formula: '' } })],
      }),
      range: expect.objectContaining({ value: '30', units: 'ft' }),
      duration: expect.objectContaining({ value: '1', units: 'minute', concentration: true }),
      target: expect.objectContaining({ affects: { count: 1, type: 'creature', choice: false, special: '你能看见的生物' } }),
    }));
    expect(activities.filter((activity) => activity.type === 'cast')).toEqual([]);
    expect(item.system.description.value).toContain("<h3>织月者之触（Moonweaver's Touch）</h3>");
    expect(item.system.description.value).toContain('<ul><li><strong>豁免失败：</strong>受到 <strong>2d8光耀伤害</strong>；</li>');
    expect(item.system.description.value).toContain('<em>变形术（Polymorph）</em>');
    expect(item.system.description.value).not.toContain('###');
    expect(item.system.description.value).not.toContain('**');
    expect(item.system.description.value).not.toContain('\n- ');
    expect(item._stats).toEqual(expect.objectContaining(getFoundryTarget('14').stats));
  });

  test('rejects a V14 Item whose description regresses to raw Markdown', async () => {
    const markdown = [
      '---',
      'layout: item',
      '名称: 描述格式门禁',
      '类型: 奇物',
      '---',
      '### 功能',
      '**重要。** 这是正文。',
    ].join('\n');
    const parsed = new ItemParser().parse(markdown);
    const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core' });
    const item = structuredClone(generated.rawJson) as any;
    item.system.description.value = parsed.description;

    const verification = verifyGeneratedDocument({
      canonical: adaptParsedItemToCanonical(parsed), output: item, target: '14', effectProfile: 'core',
    });

    expect(verification.status).toBe('failed');
    expect(verification.diagnostics.map((entry) => entry.code)).toContain('GEN_V14_ITEM_DESCRIPTION_NOT_HTML');
  });

  test('marks every generated Item type as magical, including items without an attunement phrase', async () => {
    const cases = [
      ['魔法武器', '武器'],
      ['魔法饰物', '饰物'],
      ['魔法消耗品', '消耗品'],
    ] as const;

    for (const [name, type] of cases) {
      const markdown = [
        '---',
        'layout: item',
        `名称: ${name}`,
        `类型: ${type}`,
        '---',
        '普通外观描述，没有同调标记。',
      ].join('\n');
      const result = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core' });
      expect(result.status).toBe('accepted');
      expect((result.rawJson as any).system.properties).toContain('mgc');
    }
  });

  test('resolves a formal spell only when its identifier and English name agree in the current v14 catalog', () => {
    expect(resolveLockedDnd5eV14Spell('INVISIBILITY', 'inVisibility')).toEqual({
      identifier: 'invisibility',
      name: 'Invisibility',
      uuid: 'Compendium.dnd5e.spells24.Item.phbsplInvisibili',
      level: 2,
      activation: 'action',
      castingTime: { type: 'action', value: 1 },
    });
    expect(resolveLockedDnd5eV14Spell('invisibility', 'Fireball')).toBeUndefined();
  });

  test('renders the raw Jewel TXT to accepted V14 JSON with exact AC, light, uses, and cast semantics', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-item-intake-'));
    try {
      const candidate = jewelCandidate();
      const ir = buildJewelOfThreePrayersIr();
      expect(validateItemIntakeIR(JEWEL_OF_THREE_PRAYERS_SOURCE, ir, candidate).blocking).toEqual([]);
      const markdown = renderItemIntakeMarkdown(JEWEL_OF_THREE_PRAYERS_SOURCE, candidate, ir);
      expect(markdown).toContain('item-mechanics:');
      // The Intake contract owns mechanics, but source prose (including the
      // Dormant state) remains intact for a human reviewer and future stage
      // expansion instead of being silently flattened away.
      expect(markdown).toContain('Dormant');
      expect(markdown).toContain('**3** 发充能');
      const outputPath = join(root, 'jewel.json');
      const result = await convertMarkdownContentToJson({
        content: markdown,
        sourcePath: join(root, 'jewel.md'),
        outputPath,
        fvttVersion: '14',
        effectProfile: 'core',
      });
      expect(result.status).toBe('accepted');
      expect(existsSync(outputPath)).toBe(true);
      const item = JSON.parse(readFileSync(outputPath, 'utf-8')) as any;
      expect(item.system.uses).toEqual({ max: '3', spent: 0, recovery: [{ period: 'dawn', type: 'recoverAll' }] });
      const ac = item.effects.find((effect: any) => effect.transfer === true);
      expect(ac.type).toBe('base');
      expect(ac.changes).toBeUndefined();
      expect(ac.system.changes).toEqual([{ _id: expect.stringMatching(/^[A-Za-z0-9]{16}$/), key: 'system.attributes.ac.bonus', type: 'add', value: 1, phase: 'initial', priority: null }]);
      const lightEffect = item.effects.find((effect: any) => effect.transfer === false);
      expect(lightEffect.system.changes).toEqual(expect.arrayContaining([
        { _id: expect.stringMatching(/^[A-Za-z0-9]{16}$/), key: 'token.light.bright', type: 'override', value: 15, phase: 'initial', priority: null },
        { _id: expect.stringMatching(/^[A-Za-z0-9]{16}$/), key: 'token.light.dim', type: 'override', value: 30, phase: 'initial', priority: null },
      ]));
      const activities = Object.values(item.system.activities) as any[];
      const light = activities.find((activity) => activity.effects?.some((reference: any) => reference._id === lightEffect._id));
      expect(light).toEqual(expect.objectContaining({ type: 'utility', activation: expect.objectContaining({ type: 'action' }) }));
      expect(light.consumption).toEqual(expect.objectContaining({ targets: [], spellSlot: false }));
      const invisibility = activities.find((activity) => activity.type === 'cast');
      expect(invisibility).toEqual(expect.objectContaining({
        spell: { uuid: 'Compendium.dnd5e.spells24.Item.phbsplInvisibili', level: 2 },
        activation: { type: 'action', value: 1, override: false },
      }));
      expect(invisibility.consumption).toEqual(expect.objectContaining({ spellSlot: false }));
      expect(invisibility.consumption.targets).toEqual([{ type: 'itemUses', target: '', value: '1', scaling: { mode: '', formula: '' } }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('formal orchestration writes Markdown, accepted JSON, reports, and audit-ready bundle only after review accepts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-item-intake-run-'));
    const candidate = jewelCandidate();
    const provider: ItemIntakeAiProvider = {
      providerName: 'fake-item-intake', extractionModel: 'fake', reviewModel: 'fake',
      discover: async () => ({ schemaVersion: 1, candidates: [candidate] }),
      extract: async () => buildJewelOfThreePrayersIr(),
      review: async () => ({ schemaVersion: 1, verdict: 'accepted', findings: [] }),
      repair: async () => buildJewelOfThreePrayersIr(),
    };
    try {
      const result = await runItemIntake({
        source: JEWEL_OF_THREE_PRAYERS_SOURCE,
        sourceName: 'jewel.txt',
        runRoot: join(root, 'runs'),
        vaultPath: join(root, 'vault'),
        fvttVersion: '14',
        effectProfile: 'core',
      }, provider);
      expect(result.status).toBe('succeeded');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.status).toBe('accepted');
      expect(existsSync(join(result.runPath, 'source.txt'))).toBe(true);
      expect(existsSync(join(result.runPath, 'discovery.json'))).toBe(true);
      expect(existsSync(join(result.items[0]!.bundlePath, 'intake-ir.json'))).toBe(true);
      expect(existsSync(join(result.items[0]!.bundlePath, 'standard.md'))).toBe(true);
      expect(existsSync(join(result.items[0]!.bundlePath, 'deterministic-report.json'))).toBe(true);
      expect(existsSync(result.items[0]!.markdownPath!)).toBe(true);
      expect(existsSync(result.items[0]!.itemPath!)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('canonicalizes bounded UTF-16 and whitespace-only evidence drift before validation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-item-intake-normalize-'));
    const drifted = structuredClone(buildJewelOfThreePrayersIr());
    drifted.source.length += 2;
    const shifted = (ref: { start: number; end: number; quote: string }) => ({
      ...ref,
      start: ref.start + 1,
      end: ref.end + 1,
    });
    drifted.item.stages = drifted.item.stages?.map((stage) => ({ ...stage, evidence: stage.evidence.map(shifted) }));
    drifted.item.abilities = drifted.item.abilities.map((ability) => ({
      ...ability,
      evidence: ability.evidence.map((ref) => ({ ...shifted(ref), ...(ability.id === 'ac-bonus' ? { quote: `${ref.quote}\r` } : {}) })),
    })) as typeof drifted.item.abilities;
    drifted.claims = drifted.claims.map((claim) => ({ ...claim, evidence: claim.evidence.map(shifted) }));
    drifted.coverage = drifted.coverage.map((entry) => ({ ...entry, ...shifted(entry) }));
    try {
      const candidate = jewelCandidate();
      const provider: ItemIntakeAiProvider = {
        providerName: 'fake-item-intake-normalize', extractionModel: 'fake', reviewModel: 'fake',
        discover: async () => ({ schemaVersion: 1, candidates: [candidate] }),
        extract: async () => drifted,
        review: async () => ({ schemaVersion: 1, verdict: 'accepted', findings: [] }),
        repair: async () => drifted,
      };
      const result = await runItemIntake({
        source: JEWEL_OF_THREE_PRAYERS_SOURCE,
        sourceName: 'jewel-drifted.txt',
        runRoot: join(root, 'runs'),
        vaultPath: join(root, 'vault'),
        fvttVersion: '14',
        effectProfile: 'core',
      }, provider);
      expect(result.status).toBe('succeeded');
      const normalized = JSON.parse(readFileSync(join(result.items[0]!.bundlePath, 'intake-ir.json'), 'utf8')) as any;
      expect(normalized.source.length).toBe(JEWEL_OF_THREE_PRAYERS_SOURCE.length);
      expect(normalized.item.abilities[0].evidence[0].quote).toBe(JEWEL_OF_THREE_PRAYERS_SOURCE.slice(104, 115));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('does not turn decorative shine, AC totals, gems, no-action extinguishing, or an unknown spell into supported mechanics', () => {
    const parserSource = [
      '---',
      'layout: item',
      '名称: 反例护符',
      '类型: 饰物',
      '---',
      '黄金圆盘闪闪发光。AC 为 15。它有三颗宝石。熄灭无需动作。',
    ].join('\n');
    const parsed = new ItemParser().parse(parserSource);
    expect(parsed.uses).toBeUndefined();
    expect(parsed.structuredActions).toBeUndefined();

    const boldChargeSource = [
      '---', 'layout: item', '名称: 粗体充能物品', '类型: 奇物', '---',
      '这件饰物具有 **3** 发充能，并且在每天黎明恢复所有被消耗的充能。',
    ].join('\n');
    expect(new ItemParser().parse(boldChargeSource).uses).toEqual({
      max: '3', spent: 0, recovery: [{ period: 'dawn', type: 'recoverAll' }],
    });

    const ir = buildJewelOfThreePrayersIr();
    const spell = ir.item.abilities.find((ability) => ability.kind === 'spell');
    if (spell?.kind === 'spell') spell.spell.identifier = 'not-a-real-spell';
    const validation = validateItemIntakeIR(JEWEL_OF_THREE_PRAYERS_SOURCE, ir, jewelCandidate());
    expect(validation.blocking.map((finding) => finding.code)).toContain('UNRESOLVED_SPELL');
    expect(() => new ActivityGenerator({ fvttVersion: '14' }).generate({
      name: 'Unknown Spell', type: 'spell', spellName: 'Unknown Spell', spellIdentifier: 'not-a-real-spell',
      useAction: { activation: 'action', consumption: 1 },
    })).toThrow(/Unable to uniquely resolve/);
  });

  test('verifier rejects a mutated V14 light, AC, and spell projection instead of accepting any Effect or Activity', async () => {
    const candidate = jewelCandidate();
    const markdown = renderItemIntakeMarkdown(JEWEL_OF_THREE_PRAYERS_SOURCE, candidate, buildJewelOfThreePrayersIr());
    const parsed = new ItemParser().parse(markdown);
    const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core' });
    const item = structuredClone(generated.rawJson) as any;
    const activities = Object.values(item.system.activities) as any[];
    const light = activities.find((activity) => activity.type === 'utility');
    light.consumption.targets = [{ type: 'itemUses', target: '', value: '1' }];
    item.effects.find((effect: any) => effect.transfer === true).system.changes[0].value = '+2';
    activities.find((activity) => activity.type === 'cast').consumption.spellSlot = true;
    const verification = verifyGeneratedDocument({
      canonical: adaptParsedItemToCanonical(parsed), output: item, target: '14', effectProfile: 'core',
    });
    expect(verification.status).toBe('failed');
    expect(verification.diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      'GEN_ITEM_AC_EFFECT_MISMATCH',
      'GEN_ITEM_LIGHT_ACTIVITY_MISMATCH',
      'GEN_ITEM_SPELL_ACTIVITY_MISMATCH',
    ]));
  });
});

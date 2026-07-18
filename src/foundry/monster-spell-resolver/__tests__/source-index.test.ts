import { describe, expect, test } from 'bun:test';
import {
  ITEM_INDEX_FIELDS,
  buildSpellSourceIndex,
  fetchSelectedSpellDocument,
  type FoundryItemPackRef,
  type FoundrySpellSourceAdapter,
} from '../source-index';

type Row = Record<string, unknown>;

class FakeAdapter implements FoundrySpellSourceAdapter {
  readonly indexCalls: Array<{ collection: string; fields: string[] }> = [];
  readonly documentCalls: string[] = [];

  constructor(
    private readonly packs: FoundryItemPackRef[],
    private readonly rows: Map<string, Row[] | Error>,
  ) {}

  getRuntimeVersions() {
    return { foundry: '14.364', dnd5e: '5.3.3' };
  }

  async listEnabledReadableItemPacks() {
    return this.packs;
  }

  async getItemIndex(pack: FoundryItemPackRef, fields: string[]) {
    this.indexCalls.push({ collection: pack.collection, fields });
    const value = this.rows.get(pack.collection) ?? [];
    if (value instanceof Error) throw value;
    return value;
  }

  async getItemDocument(uuid: string) {
    this.documentCalls.push(uuid);
    return { uuid, type: 'spell' };
  }
}

function pack(
  collection: string,
  packageId: string,
  packageVersion: string,
  options: Partial<FoundryItemPackRef> = {},
): FoundryItemPackRef {
  return {
    collection,
    packageId,
    packageVersion,
    packId: collection.split('.').at(-1)!,
    documentName: 'Item',
    enabled: true,
    readable: true,
    ...options,
  };
}

const spell = (
  id: string,
  name: string,
  rules: string,
  extra: Record<string, unknown> = {},
): Row => ({
  _id: id,
  name,
  type: 'spell',
  system: {
    identifier: name.toLowerCase().replaceAll(' ', '-'),
    source: { rules, book: 'PHB' },
    level: 1,
    school: 'evo',
  },
  ...extra,
});

describe('destination spell source index', () => {
  test('indexes actual Spells from every enabled readable Item pack without trusting hints', async () => {
    const packs = [
      pack('dnd5e.spells24', 'dnd5e', '5.3.3', { typeHints: ['spell'] }),
      pack('heroes-options.spells', 'heroes-options', '1.4.0', { typeHints: undefined, hasOptionsHint: true }),
      pack('empty-hint.items', 'empty-hint', '2.0.0', { typeHints: [] }),
      pack('misleading.spells', 'misleading', '1.0.0', { typeHints: ['spell'] }),
      pack('mixed.items', 'mixed', '3.0.0', { typeHints: ['loot'] }),
      pack('disabled.items', 'disabled', '1.0.0', { enabled: false }),
      pack('unreadable.items', 'unreadable', '1.0.0', { readable: false }),
      pack('midi.items', 'midi', '14.0.9'),
      pack('broken.items', 'broken', '1.0.0'),
    ];
    const rows = new Map<string, Row[] | Error>([
      ['dnd5e.spells24', [spell('aaaaaaaaaaaaaaaa', 'Magic Missile', '2024')]],
      ['heroes-options.spells', [spell('bbbbbbbbbbbbbbbb', 'Arcane Vigor', '2024')]],
      ['empty-hint.items', [spell('cccccccccccccccc', 'Empty Hint Spell', '2024')]],
      ['misleading.spells', [{ _id: 'dddddddddddddddd', name: 'Sword', type: 'weapon' }]],
      ['mixed.items', [spell('eeeeeeeeeeeeeeee', 'Future Spell', '2027'), { _id: 'ffffffffffffffff', name: 'Gem', type: 'loot' }]],
      ['disabled.items', [spell('gggggggggggggggg', 'Disabled Spell', '2024')]],
      ['unreadable.items', [spell('hhhhhhhhhhhhhhhh', 'Unreadable Spell', '2024')]],
      ['midi.items', [spell('iiiiiiiiiiiiiiii', 'Misty Step', '2024'), spell('jjjjjjjjjjjjjjjj', 'Misty Step', '2014')]],
      ['broken.items', new Error('permission denied')],
    ]);
    const adapter = new FakeAdapter(packs, rows);

    const result = await buildSpellSourceIndex(adapter);

    expect(result.candidates.map((candidate) => [candidate.name, candidate.rules])).toEqual([
      ['Magic Missile', '2024'],
      ['Empty Hint Spell', '2024'],
      ['Arcane Vigor', '2024'],
      ['Misty Step', '2014'],
      ['Misty Step', '2024'],
      ['Future Spell', '2027'],
    ]);
    expect(result.candidates[0]?.uuid).toBe('Compendium.dnd5e.spells24.Item.aaaaaaaaaaaaaaaa');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'PACK_INDEX_FAILED',
      'PACK_DISABLED',
      'PACK_UNREADABLE',
    ]);
    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.blocking])).toEqual([
      ['PACK_INDEX_FAILED', true],
      ['PACK_DISABLED', false],
      ['PACK_UNREADABLE', false],
    ]);
    expect(adapter.indexCalls.map((call) => call.collection)).toEqual([
      'broken.items',
      'dnd5e.spells24',
      'empty-hint.items',
      'heroes-options.spells',
      'midi.items',
      'misleading.spells',
      'mixed.items',
    ]);
    expect(adapter.indexCalls.every((call) => JSON.stringify(call.fields) === JSON.stringify(ITEM_INDEX_FIELDS))).toBe(true);
    expect(adapter.documentCalls).toEqual([]);
    expect(result.sourcePackages).toEqual([
      { packageId: 'broken', version: '1.0.0' },
      { packageId: 'dnd5e', version: '5.3.3' },
      { packageId: 'empty-hint', version: '2.0.0' },
      { packageId: 'heroes-options', version: '1.4.0' },
      { packageId: 'midi', version: '14.0.9' },
      { packageId: 'misleading', version: '1.0.0' },
      { packageId: 'mixed', version: '3.0.0' },
    ]);
  });

  test('is invariant to pack, row, and object insertion order', async () => {
    const one = pack('alpha.spells', 'alpha', '1.0.0');
    const two = pack('beta.items', 'beta', '2.0.0');
    const alphaRows = [spell('aaaaaaaaaaaaaaaa', 'Alpha', '2024'), spell('bbbbbbbbbbbbbbbb', 'Beta', '2014')];
    const betaRow = spell('cccccccccccccccc', 'Gamma', '2024');
    const forward = await buildSpellSourceIndex(new FakeAdapter([one, two], new Map([
      [one.collection, alphaRows],
      [two.collection, [betaRow]],
    ])));
    const reorderedBeta = {
      system: { school: 'evo', level: 1, source: { book: 'PHB', rules: '2024' }, identifier: 'gamma' },
      type: 'spell',
      name: 'Gamma',
      _id: 'cccccccccccccccc',
    };
    const reverse = await buildSpellSourceIndex(new FakeAdapter([two, one], new Map([
      [two.collection, [reorderedBeta]],
      [one.collection, [...alphaRows].reverse()],
    ])));

    expect(reverse.candidates).toEqual(forward.candidates);
    expect(reverse.candidateMetadataHash).toBe(forward.candidateMetadataHash);
    expect(reverse.sourceInventoryHash).toBe(forward.sourceInventoryHash);
  });

  test('package-version-only changes affect the authoritative hash but not metadata hash', async () => {
    const rows = new Map<string, Row[] | Error>([['alpha.spells', [spell('aaaaaaaaaaaaaaaa', 'Alpha', '2024')]]]);
    const before = await buildSpellSourceIndex(new FakeAdapter([pack('alpha.spells', 'alpha', '1.0.0')], rows));
    const after = await buildSpellSourceIndex(new FakeAdapter([pack('alpha.spells', 'alpha', '1.0.1')], rows));

    expect(after.candidateMetadataHash).toBe(before.candidateMetadataHash);
    expect(after.sourceInventoryHash).not.toBe(before.sourceInventoryHash);
  });

  test('fetches a full document only after a concrete selected UUID exists', async () => {
    const ref = pack('alpha.spells', 'alpha', '1.0.0');
    const adapter = new FakeAdapter([ref], new Map([[ref.collection, [spell('aaaaaaaaaaaaaaaa', 'Alpha', '2024')]]]));
    const result = await buildSpellSourceIndex(adapter);
    expect(adapter.documentCalls).toEqual([]);

    await fetchSelectedSpellDocument(adapter, result.candidates[0]!.uuid);
    expect(adapter.documentCalls).toEqual(['Compendium.alpha.spells.Item.aaaaaaaaaaaaaaaa']);
    await expect(fetchSelectedSpellDocument(adapter, 'Item.aaaaaaaaaaaaaaaa')).rejects.toThrow('selected Compendium Item UUID');
  });

  test('rejects malformed spell rows without letting one row poison valid packs', async () => {
    const ref = pack('alpha.spells', 'alpha', '1.0.0');
    const adapter = new FakeAdapter([ref], new Map([[ref.collection, [
      spell('aaaaaaaaaaaaaaaa', 'Alpha', '2024'),
      { _id: '', name: 'Missing ID', type: 'spell' },
      { _id: 'short', name: 'Short ID', type: 'spell' },
      { _id: 'bad id!!!!!!!!!!', name: 'Symbol ID', type: 'spell' },
      { _id: 'bbbbbbbbbbbbbbbb', name: '', type: 'spell' },
    ]]]));
    const result = await buildSpellSourceIndex(adapter);

    expect(result.candidates).toHaveLength(1);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'INVALID_SPELL_INDEX_ROW',
      'INVALID_SPELL_INDEX_ROW',
      'INVALID_SPELL_INDEX_ROW',
      'INVALID_SPELL_INDEX_ROW',
    ]);
    expect(result.diagnostics.every((diagnostic) => diagnostic.blocking)).toBe(true);
  });
});

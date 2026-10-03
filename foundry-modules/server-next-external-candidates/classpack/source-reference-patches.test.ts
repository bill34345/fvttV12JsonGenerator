import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { patchSourceEstablishedReferences } from './source-reference-patches.ts';

test('source-established Goodberry grant and display link resolve while provenance and rules stay unchanged', () => {
  const old = 'Compendium.dnd5e_classpack.new-icon.Item.AmuFE4xAoWlzjjQU';
  const original = { _id: 'vIeHGZ1GdlXINSP8', name: '德鲁伊 Druid',
    system: { advancement: [{ _id: 'vjFrZtzEk1WzB23Z', configuration: { items: [{ uuid: old }] } }],
      description: { value: '@UUID[Compendium.dnd5e_classpack.new-icon.AmuFE4xAoWlzjjQU]{神莓术 Goodberry}' },
      level: 1, ability: 'wis' }, _stats: { compendiumSource: old }, flags: { core: { sourceId: old } } };
  const { document, reports } = patchSourceEstablishedReferences('classes-new', '!items!vIeHGZ1GdlXINSP8', original);
  expect(reports).toHaveLength(2);
  expect(document.system.advancement[0].configuration.items[0].uuid)
    .toBe('Compendium.dnd5e_classpack.new-icon.Item.YBMBbBku5PW3IuGc');
  expect(document.system.description.value)
    .toBe('@UUID[Compendium.dnd5e_classpack.new-icon.Item.YBMBbBku5PW3IuGc]{神莓术 Goodberry}');
  expect(document._stats).toEqual(original._stats);
  expect(document.flags).toEqual(original.flags);
  expect(document.system.level).toBe(1);
  expect(document.system.ability).toBe('wis');
  expect(original.system.advancement[0].configuration.items[0].uuid).toBe(old);
});

test('missing custom summon/helper UUIDs are deliberately retained for the user-deferred work', () => {
  const original = { _id: 'QHD9S9sWWIpPnykD', system: { activities: { summon: { profiles: [
    { uuid: 'Compendium.dnd5e_classpack.monsterspack.Actor.BXIr2v67pAg3A49z' },
  ] } } } };
  const result = patchSourceEstablishedReferences('new-icon', '!items!QHD9S9sWWIpPnykD', original);
  expect(result.document).toBe(original);
  expect(result.reports).toEqual([]);
});

test('MPMM Goliath reuses the existing PB-per-long-rest trait with two exact guarded links', () => {
  const rows = JSON.parse(readFileSync(join(import.meta.dir, '../../../.local/classpack-next-20261002/last-world-grant-and-trance-sources.json'), 'utf8'));
  const original = rows.find((row: any) => row.value._id === 'dI68QjTEhKniIhvL').value;
  const snapshot = structuredClone(original);
  const result = patchSourceEstablishedReferences('races-item', '!items!dI68QjTEhKniIhvL', original);
  const target = 'Compendium.dnd5e_classpack.racial-traits.Item.BAX4NWZ6iTLGgf31';
  expect(result.reports).toHaveLength(2);
  const patched = result.document as any;
  expect(patched.system.advancement[3]._id).toBe(original.system.advancement[3]._id);
  expect(patched.system.advancement[3].configuration.items[2].uuid).toBe(target);
  expect(patched.system.description.value).toContain(`@UUID[${target}]{石之坚韧 Stone's Endurance}`);
  expect(patched.system.source).toEqual(original.system.source);
  expect(original).toEqual(snapshot);
  expect(patchSourceEstablishedReferences('other', '!items!dI68QjTEhKniIhvL', original).reports).toEqual([]);
  const drift = structuredClone(original); drift.system.description.value += '<p>Changed rule</p>';
  expect(() => patchSourceEstablishedReferences('races-item', '!items!dI68QjTEhKniIhvL', drift)).toThrow('source hash differs');
});

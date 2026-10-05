import { legacyNextInputPath } from '../../../tests/helpers/legacy-next-inputs.mjs';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { patchSourceEstablishedReferences } from './source-reference-patches.ts';

type EstablishedReferenceDocument = {
  _stats: Record<string, unknown>;
  flags: Record<string, unknown>;
  system: {
    advancement: Array<{ configuration: { items: Array<{ uuid: string }> } }>;
    description: { value: string };
    level: number;
    ability: string;
  };
};

test('source-established Goodberry grant and display link resolve while provenance and rules stay unchanged', () => {
  const old = 'Compendium.dnd5e_classpack.new-icon.Item.AmuFE4xAoWlzjjQU';
  const original = { _id: 'vIeHGZ1GdlXINSP8', name: '德鲁伊 Druid',
    system: { advancement: [{ _id: 'vjFrZtzEk1WzB23Z', configuration: { items: [{ uuid: old }] } }],
      description: { value: '@UUID[Compendium.dnd5e_classpack.new-icon.AmuFE4xAoWlzjjQU]{神莓术 Goodberry}' },
      level: 1, ability: 'wis' }, _stats: { compendiumSource: old }, flags: { core: { sourceId: old } } };
  const { document, reports } = patchSourceEstablishedReferences('classes-new', '!items!vIeHGZ1GdlXINSP8', original);
  const patchedDocument = document as EstablishedReferenceDocument;
  const advancement = patchedDocument.system.advancement[0];
  if (!advancement) throw new Error('Patched Goodberry Advancement is missing');
  const item = advancement.configuration.items[0];
  if (!item) throw new Error('Patched Goodberry Advancement item is missing');
  expect(reports).toHaveLength(2);
  expect(item.uuid)
    .toBe('Compendium.dnd5e_classpack.new-icon.Item.YBMBbBku5PW3IuGc');
  expect(patchedDocument.system.description.value)
    .toBe('@UUID[Compendium.dnd5e_classpack.new-icon.Item.YBMBbBku5PW3IuGc]{神莓术 Goodberry}');
  expect(patchedDocument._stats).toEqual(original._stats);
  expect(patchedDocument.flags).toEqual(original.flags);
  expect(patchedDocument.system.level).toBe(1);
  expect(patchedDocument.system.ability).toBe('wis');
  const originalAdvancement = original.system.advancement[0];
  if (!originalAdvancement) throw new Error('Original Goodberry Advancement is missing');
  const originalItem = originalAdvancement.configuration.items[0];
  if (!originalItem) throw new Error('Original Goodberry Advancement item is missing');
  expect(originalItem.uuid).toBe(old);
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
  const rows = JSON.parse(readFileSync(legacyNextInputPath(join(import.meta.dir, '../../../.local/classpack-next-20261002/last-world-grant-and-trance-sources.json')), 'utf8'));
  const sourceRow = rows.find((row: { value: { _id: string } }) => row.value._id === 'dI68QjTEhKniIhvL');
  if (!sourceRow) throw new Error('MPMM Goliath source record is missing');
  const original = sourceRow.value;
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

import { expect, test } from 'bun:test';
import { fakeWorldFolders } from '../../../tests/helpers/forge-world-folders';
import { FORGE_ARCHIVE_SETTINGS, resolveForgeWorldFolder } from '../src/worldFolder';

test('Forge rebuilds the deleted parent without using or moving folders promoted by Foundry', async () => {
  const original = fakeWorldFolders();
  const originalSpell = await resolveForgeWorldFolder({ folders: original }, 'Spell');
  const originalItem = await resolveForgeWorldFolder({ folders: original }, 'Item');
  const originalRoot = original.get(originalSpell)!.folder!.id;
  const promoted = fakeWorldFolders([
    { ...original.get(originalItem)!, folder: null },
    { ...original.get(originalSpell)!, folder: null },
  ]);

  const spell = await resolveForgeWorldFolder({ folders: promoted }, 'Spell');
  const item = await resolveForgeWorldFolder({ folders: promoted }, 'Item');
  expect(spell).not.toBe(originalSpell);
  expect(item).not.toBe(originalItem);
  expect(promoted.get(spell)).toMatchObject({ name: 'Spell', folder: { id: originalRoot } });
  expect(promoted.get(item)).toMatchObject({ name: 'Item', folder: { id: originalRoot } });
  expect(promoted.get(originalSpell)?.folder).toBeNull();
  expect(promoted.get(originalItem)?.folder).toBeNull();
  expect(await resolveForgeWorldFolder({ folders: promoted }, 'Spell')).toBe(spell);
  expect(promoted.contents).toHaveLength(5);
});

test('custom destinations follow folder IDs across a rename and report removal without a default fallback', async () => {
  const settings = {
    get(scope: string, key: string) {
      expect([scope, key]).toEqual(['fvtt-json-forge', FORGE_ARCHIVE_SETTINGS]);
      return { Actor: 'actors-a', Item: 'items-a', Spell: 'items-b' };
    },
    async set() {},
  };
  const actors = { id: 'actors-a', name: 'Actors', type: 'Actor' };
  const items = { id: 'items-a', name: 'Items', type: 'Item' };
  const spells = { id: 'items-b', name: 'Renamed Spells', type: 'Item', folder: items };
  const folders = fakeWorldFolders([actors, items, spells]);
  expect(await resolveForgeWorldFolder({ settings, folders }, 'Actor')).toBe(actors.id);
  expect(await resolveForgeWorldFolder({ settings, folders }, 'Item')).toBe(items.id);
  expect(await resolveForgeWorldFolder({ settings, folders }, 'Spell')).toBe(spells.id);
  const afterRemoval = fakeWorldFolders([actors, items, { ...spells, id: 'different-folder' }]);
  await expect(resolveForgeWorldFolder({ settings, folders: afterRemoval }, 'Spell')).rejects.toThrow('请在 Forge「归档位置」重新选择');
  expect(afterRemoval.contents).toHaveLength(3);
});

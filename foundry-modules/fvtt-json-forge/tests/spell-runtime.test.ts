import { expect, mock, spyOn, test } from 'bun:test';
import { fakeWorldFolders } from '../../../tests/helpers/forge-world-folders';

test('a missing configured Spell folder pauses world creation and preserves the preview', async () => {
  const artifact = await generateSpellArtifact(readFileSync('tests/fixtures/forge-spells/fire-bolt.md', 'utf8'));
  const create = mock(async () => { throw Error('Must reselect before creating'); });
  const game = {
    version: '14.370', system: { id: 'dnd5e', version: '6.0.6' }, user: { isGM: true },
    folders: fakeWorldFolders(),
    settings: { get: () => ({ Spell: 'deleted-folder' }), async set() {} },
    items: { documentClass: { create } },
  };
  await expect(createVerifiedForgeSpell(game, artifact, { path: 'systems/dnd5e/icons/svg/items/spell.svg' }, {}))
    .rejects.toThrow('法术的自选文件夹已删除或不可用。请在 Forge「归档位置」重新选择。');
  expect(create).not.toHaveBeenCalled();
  expect(game.folders.contents).toHaveLength(0);
});
import { readFileSync } from 'node:fs';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { generateSpellArtifact } from '@fvtt-json-generator/forge-browser-runtime/spell';
import { createVerifiedForgeSpell } from '../src/spellRuntime';

test('Forge saves a user-selected spell icon through Foundry before creating the world Spell', async () => {
  const artifact = await generateSpellArtifact(readFileSync('tests/fixtures/forge-spells/fire-bolt.md', 'utf8'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII=', 'base64');
  const path = 'fvtt-json-forge/items/' + sha256(png) + '.png';
  let uploaded: File | undefined;
  const fetchAsset = spyOn(globalThis, 'fetch').mockImplementation(Object.assign(async (requested: RequestInfo | URL) => {
    expect(requested).toBe(path);
    return uploaded ? new Response(uploaded) : new Response(null, { status: 404 });
  }, { preconnect: fetch.preconnect }));
  const foundry = { applications: { apps: { FilePicker: { implementation: {
    browse: async () => ({ dirs: ['fvtt-json-forge', 'fvtt-json-forge/items'] }),
    upload: async (source: string, directory: string, image: File) => {
      expect(source).toBe('data');
      expect(directory).toBe('fvtt-json-forge/items');
      expect(image.type).toBe('image/png');
      expect(image.name).toBe(path.split('/').at(-1)!);
      uploaded = image;
    },
  } } } } };
  const forgeItems = { id: 'forge-items', name: 'Forge', type: 'Item' };
  const game = {
    version: '14.370', system: { id: 'dnd5e', version: '6.0.6+local.3' }, user: { isGM: true },
    folders: fakeWorldFolders([
      { id: 'actor-folder', name: 'Forge', type: 'Actor' },
      forgeItems,
      { id: 'wrong-spell-folder', name: 'Spell', type: 'Item' },
      { id: 'forge-spell-folder', name: 'Spell', type: 'Item', folder: forgeItems },
    ]),
    items: { documentClass: {
      async create(data: Record<string, unknown>) {
        expect(uploaded).toBeDefined();
        expect(data.img).toBe(path);
        return { id: String(data._id), uuid: 'Item.' + data._id,
          delete: async () => { throw Error('A verified saved Spell must not be deleted.'); },
          toObject: () => structuredClone(data) };
      },
    } },
  };
  try {
    await expect(createVerifiedForgeSpell(game, artifact, { path: 'wrong.png', png }, foundry)).rejects.toThrow('图标与预览不一致');
    expect(fetchAsset).not.toHaveBeenCalled();
    const result = await createVerifiedForgeSpell(game, artifact, { path, png }, foundry);
    expect(result.status).toBe('created');
    expect(fetchAsset).toHaveBeenCalledTimes(2);
    expect(result.item.toObject()).toMatchObject({ type: 'spell', img: path, folder: 'forge-spell-folder' });
    expect(game.folders.contents).toHaveLength(5);
    expect(game.folders.contents.at(-1)).toMatchObject({ name: 'Item', folder: { id: forgeItems.id } });
  } finally {
    fetchAsset.mockRestore();
  }
});

import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { fakeWorldFolders } from '../../../tests/helpers/forge-world-folders';
import { openForgeArchiveSettings } from '../src/archiveSettings';

test('the archive dialog persists the rendered controls and identifies an unavailable choice', async () => {
  const { window } = new JSDOM('<!doctype html>');
  const document = window.document;
  const records: unknown[] = [];
  const actor = { id: 'actor-folder', name: 'NPCs', type: 'Actor' };
  const item = { id: 'item-folder', name: 'Gear', type: 'Item' };
  const spell = { id: 'spell-folder', name: 'Renamed', type: 'Item', folder: item };
  const game = {
    version: '14.370', system: { id: 'dnd5e', version: '6.0.6' }, user: { isGM: true },
    folders: fakeWorldFolders([actor, item, spell]),
    settings: { get: () => ({ Actor: actor.id, Spell: 'missing-id' }), async set(...args: unknown[]) { records.push(args); } },
  };
  const foundry = { applications: { api: { DialogV2: { async wait({ content, buttons }: any) {
    const rendered = document.createElement('form');
    // Core 14 renders the supplied HTMLDivElement by serializing it.
    rendered.innerHTML = content.outerHTML;
    const field = (name: string) => rendered.elements.namedItem(name) as HTMLSelectElement;
    expect(field('Actor').value).toBe(actor.id);
    expect([...field('Actor').options].map(option => option.value)).toEqual(['', actor.id]);
    expect(field('Spell').selectedOptions[0]?.textContent).toContain('请重新选择');
    expect([...field('Item').options].map(option => option.textContent)).toContain('Gear / Renamed');
    field('Actor').value = '';
    field('Item').value = item.id;
    field('Spell').value = spell.id;
    const save = document.createElement('button');
    rendered.append(save);
    return buttons[0].callback(new window.Event('submit'), save);
  } } } } };
  await openForgeArchiveSettings(game, foundry, document);
  expect(records).toEqual([['fvtt-json-forge', 'archiveFolders', { Item: item.id, Spell: spell.id }]]);
  window.close();
});

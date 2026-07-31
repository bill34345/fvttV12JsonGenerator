import { describe, expect, test } from 'bun:test';
import { IconConfigurationError, loadV14IconOverrides } from '../resources';
import type { V14IconCatalog, V14IconOverrideFile } from '../types';

const catalog: V14IconCatalog = {
  schemaVersion: 1,
  target: { foundryVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3' },
  provenance: {
    api: 'CompendiumCollection#getIndex',
    packIndexSha256: '',
    coreFilesSha256: '',
    dnd5eFilesSha256: '',
    packs: [],
  },
  typeDefaults: { feat: 'systems/dnd5e/icons/svg/items/feature.svg' },
  compendium: [],
  files: [
    { path: 'systems/dnd5e/icons/svg/items/feature.svg', source: 'dnd5e', tokens: [] },
    { path: 'icons/svg/aura.svg', source: 'core', tokens: [] },
  ],
};

function file(entries: V14IconOverrideFile['entries']): V14IconOverrideFile {
  return { schemaVersion: 1, target: catalog.target, entries };
}

describe('v14 icon override validation', () => {
  test('accepts one version-locked core path', () => {
    expect(loadV14IconOverrides({
      mode: 'safe',
      overrides: file([{
        selector: { itemType: 'feat', englishName: 'Flyby' },
        img: 'icons/svg/aura.svg',
      }]),
    }, catalog).entries).toHaveLength(1);
  });

  test.each([
    ['duplicate selector', file([
      { selector: { itemType: 'feat', englishName: 'Flyby' }, img: 'icons/svg/aura.svg' },
      { selector: { itemType: 'feat', englishName: 'Flyby' }, img: 'icons/svg/aura.svg' },
    ])],
    ['both item names', file([
      { selector: { itemType: 'feat', englishName: 'Flyby', name: '飞掠' }, img: 'icons/svg/aura.svg' },
    ])],
    ['module path', file([
      { selector: { itemType: 'feat', englishName: 'Flyby' }, img: 'modules/example/icon.webp' },
    ])],
    ['unknown path', file([
      { selector: { itemType: 'feat', englishName: 'Flyby' }, img: 'icons/not-real.webp' },
    ])],
  ])('rejects %s', (_label, overrides) => {
    expect(() => loadV14IconOverrides({ mode: 'safe', overrides }, catalog))
      .toThrow(IconConfigurationError);
  });

  test('rejects case-equivalent duplicates and malformed optional names', () => {
    expect(() => loadV14IconOverrides({
      mode: 'safe',
      overrides: file([
        { selector: { itemType: 'feat', englishName: 'Flyby' }, img: 'icons/svg/aura.svg' },
        { selector: { itemType: 'feat', englishName: 'flyby' }, img: 'icons/svg/aura.svg' },
      ]),
    }, catalog)).toThrow('Duplicate v14 icon override selector');

    expect(() => loadV14IconOverrides({
      mode: 'safe',
      overrides: file([{
        selector: {
          itemType: 'feat',
          englishName: 'Flyby',
          actorEnglishName: ' Nightgaunt',
        },
        img: 'icons/svg/aura.svg',
      }]),
    }, catalog)).toThrow('must be a non-empty trimmed string');
  });
});

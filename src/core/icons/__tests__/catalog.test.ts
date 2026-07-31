import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { V14IconCatalog } from '../types';

const CATALOG_PATH = resolve(process.cwd(), 'references/foundry-v14-icons/catalog.json');

describe('tracked Foundry v14 icon catalog', () => {
  test('is deterministic, version locked, and contains the known 2024 Flyby entry', () => {
    const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as V14IconCatalog;
    const paths = catalog.files.map((entry) => entry.path);
    const sortedCompendium = [...catalog.compendium].sort((left, right) =>
      left.packPriority - right.packPriority
      || left.name.localeCompare(right.name, 'en')
      || left.id.localeCompare(right.id, 'en'));

    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.target).toEqual({
      foundryVersion: '14.364',
      systemId: 'dnd5e',
      systemVersion: '5.3.3',
    });
    expect(catalog.provenance.api).toBe('CompendiumCollection#getIndex');
    expect(catalog.provenance.packs).toEqual([
      { id: 'dnd5e.monsterfeatures24', count: 391 },
      { id: 'dnd5e.monsterfeatures', count: 252 },
      { id: 'dnd5e.items', count: 872 },
      { id: 'dnd5e.spells', count: 319 },
    ]);
    expect(catalog.files).toHaveLength(7337);
    expect(catalog.compendium).toHaveLength(1834);
    expect(paths).toEqual([...paths].sort((left, right) => left.localeCompare(right, 'en')));
    expect(catalog.compendium).toEqual(sortedCompendium);

    const flyby = catalog.compendium.find((entry) =>
      entry.pack === 'dnd5e.monsterfeatures24'
      && entry.name === 'Flyby'
      && entry.type === 'feat');
    expect(flyby).toMatchObject({
      img: 'icons/creatures/abilities/wings-birdlike-blue.webp',
      identifier: 'flyby',
      rules: '2024',
      packPriority: 0,
    });
    expect(flyby).toBeDefined();
    expect(paths).toContain(flyby!.img);
    for (const path of Object.values(catalog.typeDefaults)) {
      expect(paths).toContain(path);
    }
  });
});

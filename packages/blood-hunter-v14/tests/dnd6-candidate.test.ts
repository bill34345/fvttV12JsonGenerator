import { describe, expect, test } from 'bun:test';
import { compileBloodHunterV14Package, validateNativeBloodHunterPackage } from '../src/index';
import { BLOOD_HUNTER_DND6_TARGET, addDnd6FightingStyleEligibility } from '../src/compiler';
import { projectDnd6Advancements } from '../src/dnd6-projection';
import { sha256 } from '../src/internals';
import type { NativeBloodHunterPackage } from '../src/types';
import { makeBloodHunter2024Fixture } from './fixture';

const FIGHTING_STYLE_UUIDS = [
  'Compendium.dnd5e.feats24.Item.phbfstArchery000',
  'Compendium.dnd5e.feats24.Item.phbfstDefense000',
  'Compendium.dnd5e.feats24.Item.phbfstGreatWeapo',
  'Compendium.dnd5e.feats24.Item.phbfstTwoWeaponF',
] as const;

describe('Blood Hunter dnd5e 6.0.2 candidate', () => {
  test('projects Advancement fields and choice pools while keeping document, advancement and grant IDs', () => {
    const legacy = compileBloodHunterV14Package(makeBloodHunter2024Fixture());
    const candidate = structuredClone(legacy) as NativeBloodHunterPackage;
    candidate.target = { ...BLOOD_HUNTER_DND6_TARGET, rules: '2024' };
    projectDnd6Advancements(candidate);
    const { logicalHash: _discard, ...withoutHash } = candidate;
    candidate.logicalHash = sha256(withoutHash);
    const oldDocs = [...legacy.classes, ...legacy.subclasses, ...legacy.features];
    const newDocs = [...candidate.classes, ...candidate.subclasses, ...candidate.features];
    expect(newDocs.map((item) => item._id)).toEqual(oldDocs.map((item) => item._id));
    expect(candidate.grantGraph).toEqual(legacy.grantGraph);
    for (const [index, item] of newDocs.entries()) {
      const before = oldDocs[index]!.system.advancement as Record<string, any> | undefined;
      const after = item.system.advancement as Record<string, any> | undefined;
      expect(Object.keys(after ?? {})).toEqual(Object.keys(before ?? {}));
      const oldHash = (oldDocs[index]!.flags as any).fvttJsonGenerator.bloodHunter2024.logicalHash;
      const newHash = (item.flags as any).fvttJsonGenerator.bloodHunter2024.logicalHash;
      if (Object.keys(after ?? {}).length > 0) expect(newHash).not.toBe(oldHash);
      else expect(newHash).toBe(oldHash);
      for (const [id, advancement] of Object.entries(after ?? {})) {
        expect(advancement.name).toBe(before![id]!.title);
        expect(advancement).not.toHaveProperty('title');
        if (advancement.type === 'ItemChoice') {
          expect(advancement.configuration.pool).toEqual(before![id]!.configuration.pool.map((uuid: string) => ({ uuid })));
        }
      }
    }
    expect(validateNativeBloodHunterPackage(candidate).findings.map((finding) => finding.code))
      .toContain('FIGHTING_STYLE_ELIGIBILITY_MISSING');
    const bad = structuredClone(candidate);
    const first = Object.values(bad.classes[0]!.system.advancement as Record<string, any>).find((a: any) => a.type === 'ItemChoice') as any;
    first.configuration.pool[0] = first.configuration.pool[0].uuid;
    expect(validateNativeBloodHunterPackage(bad).findings.map((finding) => finding.code)).toContain('ITEM_CHOICE_POOL_SHAPE_MISMATCH');
  });

  test('grants the source-backed Fighting Style prerequisite before dnd6 level 2 choices', () => {
    const source = makeBloodHunter2024Fixture();
    const legacy = compileBloodHunterV14Package(source);
    const candidate = structuredClone(legacy) as NativeBloodHunterPackage;
    candidate.target = { ...BLOOD_HUNTER_DND6_TARGET, rules: '2024' };
    addDnd6FightingStyleEligibility(candidate, source);
    projectDnd6Advancements(candidate);
    const { logicalHash: _discard, ...withoutHash } = candidate;
    candidate.logicalHash = sha256(withoutHash);
    expect(legacy.features).toHaveLength(76);
    expect(candidate.features).toHaveLength(77);
    const marker = candidate.features.find((item) => item.system.identifier === 'fighting-style');
    expect(marker).toBeDefined();
    expect(marker!.name).toBe('战斗风格');
    expect((marker!.system.type as Record<string, unknown>).value).toBe('class');
    expect(String((marker!.system.description as Record<string, unknown>).value).length).toBeGreaterThan(0);
    const markerUuid = `Compendium.fvtt-blood-hunter-2024.features.Item.${marker!._id}`;
    const advancements = Object.values(candidate.classes[0]!.system.advancement as Record<string, any>);
    const grant = advancements.find((item: any) => item.type === 'ItemGrant' && item.level === 2) as any;
    const choice = advancements.find((item: any) => item.type === 'ItemChoice' && item.name === '战斗风格') as any;
    expect(grant).toBeDefined();
    expect(choice).toBeDefined();
    expect(advancements.indexOf(grant)).toBeLessThan(advancements.indexOf(choice));
    expect(grant.configuration.items).toContainEqual({ uuid: markerUuid, optional: false });
    expect(candidate.grantGraph.find((node) => node.id === grant._id)?.references.some((reference) => reference.uuid === markerUuid)).toBe(true);
    expect(choice.configuration.pool).toEqual(expect.arrayContaining([
      ...FIGHTING_STYLE_UUIDS.map((uuid) => ({ uuid })),
      { uuid: `Compendium.fvtt-blood-hunter-2024.features.Item.${legacy.features.find((item) => item.name === '诱变武者')!._id}` },
    ]));
    expect(validateNativeBloodHunterPackage(candidate)).toEqual({ ok: true, findings: [] });

    const missingGrant = structuredClone(candidate);
    const broken = Object.values(missingGrant.classes[0]!.system.advancement as Record<string, any>)
      .find((item: any) => item.type === 'ItemGrant' && item.level === 2) as any;
    broken.configuration.items = broken.configuration.items.filter((item: any) => item.uuid !== markerUuid);
    expect(validateNativeBloodHunterPackage(missingGrant).findings.map((finding) => finding.code))
      .toContain('FIGHTING_STYLE_ELIGIBILITY_MISSING');
  });

  test('rejects cross-paired target versions before reading source bytes', () => {
    for (const [foundry, dnd5e] of [['14.364', '6.0.2'], ['14.368', '5.3.3']] as const) {
      expect(() => compileBloodHunterV14Package({ source: '{}', target: { foundry, dnd5e, effectProfile: 'modded-v14' } })).toThrow(/target/);
    }
  });
});

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  compileCanonicalSpecies,
  compileSpeciesMarkdown,
  SPECIES_V14_368_TARGET,
  validateNativeSpeciesPackage,
} from '@fvtt-json-generator/generation/species';
import { parseSpeciesMarkdown } from '@fvtt-json-generator/parser/species-parser';

const markdown = readFileSync(resolve('obsidian/dnd数据转fvttjson/input/species/ogre.md'), 'utf8');

describe('Species Foundry 14.368 / dnd5e 6.0.2 static candidate projector', () => {
  test('projects exact dnd5e 6 race fields and preserves established identities', () => {
    const next = compileSpeciesMarkdown(markdown, { fvttVersion: '14.368' });
    const old = compileSpeciesMarkdown(markdown, { fvttVersion: '14' });
    const publishedOld = JSON.parse(readFileSync(resolve('obsidian/dnd数据转fvttjson/output/species/ogre.json'), 'utf8'));
    expect(old).toEqual(publishedOld);
    expect(next.target).toEqual(SPECIES_V14_368_TARGET);
    expect(next.logicalHash).not.toBe(old.logicalHash);
    expect(validateNativeSpeciesPackage(next, '14.368')).toEqual({ ok: true, findings: [] });
    expect(validateNativeSpeciesPackage(next, '14').findings.map((finding) => finding.code)).toContain('TARGET');
    expect(next.species.system.movement).toEqual({ speeds: { burrow: null, climb: null, fly: null, swim: null, walk: 40 }, units: 'ft', hover: false });
    expect(next.species.system.senses).toEqual({ ranges: { darkvision: 60, blindsight: null, tremorsense: null, truesight: null }, units: 'ft', special: '' });
    expect(next.species.system.advancement.map((entry: any) => entry.name)).toEqual(['', '食人魔（Ogre）特性', '食人魔（Ogre）特性']);
    expect(next.species.system.advancement.every((entry: any) => !Object.hasOwn(entry, 'title'))).toBeTrue();
    const utility = next.features.flatMap((feature) => Object.values(feature.system.activities))[0] as any;
    expect(utility.effects).toEqual([]);
    expect(utility).not.toHaveProperty('appliedEffects');
    expect([next.species._id, ...next.features.map((item) => item._id)].sort()).toEqual([old.species._id, ...old.features.map((item) => item._id)].sort());
    expect(next.species.system.advancement.flatMap((entry: any) => entry.configuration?.items?.map((item: any) => item.uuid) ?? []).sort())
      .toEqual(old.species.system.advancement.flatMap((entry: any) => entry.configuration?.items?.map((item: any) => item.uuid) ?? []).sort());
    for (const identifier of ['ogre-toughness', 'ogre-clumsiness']) {
      const feature = next.features.find((item) => item.system.identifier === identifier)!;
      const oldFeature = old.features.find((item) => item.system.identifier === identifier)!;
      const effect = feature.effects[0];
      const oldEffect = oldFeature.effects[0];
      const { changes: legacyChanges, duration: legacyDuration, system: legacySystem, ...unchanged } = oldEffect;
      expect(legacyChanges).toHaveLength(1);
      expect(legacyDuration).toHaveProperty('startTime', null);
      expect(legacySystem).toEqual({});
      expect(effect).toEqual({
        ...unchanged,
        system: {
          changes: [{
            _id: expect.stringMatching(/^[a-f0-9]{16}$/u),
            key: legacyChanges[0].key, type: 'add', value: legacyChanges[0].value,
            phase: 'initial', priority: null, conditions: '{}', replacement: '',
          }],
          origin: {}, conditions: '{}', magical: false, rider: { statuses: [] },
        },
        start: null,
        duration: { value: null, units: 'seconds', expiry: null, expired: false },
        showIcon: 1,
        folder: null,
      });
      expect(effect).not.toHaveProperty('changes');
      expect(effect.duration).not.toHaveProperty('startTime');
      expect(effect.system.changes[0]).not.toHaveProperty('mode');
      expect(effect.system.changes[0]._id).toBe(compileSpeciesMarkdown(markdown, { fvttVersion: '14.368' })
        .features.find((item) => item.system.identifier === identifier)!.effects[0].system.changes[0]._id);
    }
  });

  test('projects an independent positive hp bonus through the native effect schema', () => {
    const canonical = parseSpeciesMarkdown(markdown);
    canonical.identifier = 'sturdy-giant';
    canonical.features = [{ id: 'sturdy-frame', name: '坚实身躯', description: '每级生命值增加 5。', parts: [{
      id: 'sturdy-frame-hp', level: 0, automation: 'native', mechanics: [{ kind: 'hp-per-level', value: 5 }],
    }] }];
    const result = compileCanonicalSpecies(canonical, { fvttVersion: '14.368' });
    expect(validateNativeSpeciesPackage(result)).toEqual({ ok: true, findings: [] });
    const feature = result.features[0];
    if (!feature) throw new Error('Sturdy Frame feature was not projected');
    const effect = feature.effects[0];
    if (!effect) throw new Error('Sturdy Frame effect was not projected');
    const change = effect.system.changes[0];
    if (!change) throw new Error('Sturdy Frame effect change was not projected');
    expect(change).toMatchObject({
      key: 'system.attributes.hp.bonuses.level', type: 'add', value: '5', phase: 'initial',
    });
    expect(effect.origin).toBe(`Compendium.fvtt-homebrew-species.features.Item.${feature._id}`);
  });

  test('uses the same exact target fields for a different speed, senses and grant level', () => {
    const canonical = parseSpeciesMarkdown(markdown);
    canonical.identifier = 'watchful-giant';
    canonical.movement.walk = 25;
    canonical.senses.darkvision = undefined;
    canonical.features = [{ id: 'watchful-step', name: '警觉步伐', description: '3级起每次短休可使用一次。', parts: [{ id: 'watchful-step-use', level: 3, automation: 'native', mechanics: [{ kind: 'limited-utility', activation: 'reaction', uses: { max: 1, recovery: 'sr' }, consumption: 1, chatFlavor: '按原规则手动处理结果。' }] }] }];
    const result = compileCanonicalSpecies(canonical, { fvttVersion: '14.368' });
    expect(validateNativeSpeciesPackage(result)).toEqual({ ok: true, findings: [] });
    expect(result.species.system.movement.speeds.walk).toBe(25);
    expect(result.species.system.senses.ranges.darkvision).toBeNull();
    expect(result.species.system.advancement.find((entry: any) => entry.type === 'ItemGrant')).toMatchObject({ level: 3, name: `${canonical.displayName}特性` });
  });

  test('keeps manual-only mechanics free of invented activities and effects', () => {
    const canonical = parseSpeciesMarkdown(markdown);
    canonical.identifier = 'quiet-giant';
    canonical.features = [{ id: 'quiet-rule', name: '沉默规则', description: '完整保留原文并由GM执行。', parts: [{ id: 'quiet-rule-manual', level: 0, automation: 'gm-assisted', mechanics: [{ kind: 'gm-assisted', boundaries: ['由GM执行。'] }] }] }];
    const result = compileCanonicalSpecies(canonical, { fvttVersion: '14.368' });
    expect(validateNativeSpeciesPackage(result).ok).toBeTrue();
    expect(result.features[0]).toMatchObject({ effects: [], system: { activities: {} } });
  });

  test('rejects near-valid old fields even when logical hash is recomputed', () => {
    const root = compileSpeciesMarkdown(markdown, { fvttVersion: '14.368' });
    const mutate = (change: (pkg: any) => void) => {
      const pkg = structuredClone(root);
      change(pkg);
      pkg.logicalHash = new Bun.CryptoHasher('sha256').update(canonicalJson({ schemaVersion: pkg.schemaVersion, moduleId: pkg.moduleId, target: pkg.target, sourceSha256: pkg.sourceSha256, species: pkg.species, features: pkg.features, coverageLedger: pkg.coverageLedger })).digest('hex');
      return validateNativeSpeciesPackage(pkg).findings.map((finding) => finding.code);
    };
    expect(mutate((pkg) => { pkg.species.system.movement.walk = 40; })).toContain('V14_368_MOVEMENT');
    expect(mutate((pkg) => { pkg.species.system.senses.darkvision = 60; })).toContain('V14_368_SENSES');
    expect(mutate((pkg) => { pkg.species.system.advancement[0].title = ''; })).toContain('V14_368_ADVANCEMENT');
    expect(mutate((pkg) => { const utility = pkg.features.flatMap((feature: any) => Object.values(feature.system.activities))[0] as any; utility.appliedEffects = []; })).toContain('V14_368_ACTIVITY_FIELD');
    expect(mutate((pkg) => { pkg.features.find((item: any) => item.system.identifier === 'ogre-toughness').effects[0].changes = [{ key: 'system.attributes.hp.bonuses.level', mode: 2, value: '3', priority: null }]; })).toContain('V14_368_FIELD');
    expect(mutate((pkg) => { pkg.features.find((item: any) => item.system.identifier === 'ogre-toughness').effects[0].system.changes[0].mode = 2; })).toContain('V14_368_FIELD');
    expect(mutate((pkg) => { pkg.features.find((item: any) => item.system.identifier === 'ogre-toughness').effects[0].system.changes[0].type = 'override'; })).toContain('V14_368_EFFECT_CHANGE');
    expect(mutate((pkg) => { pkg.features.find((item: any) => item.system.identifier === 'ogre-toughness').effects[0].duration = { startTime: null, seconds: null }; })).toContain('V14_368_EFFECT_DOCUMENT');
    expect(mutate((pkg) => { pkg.features.find((item: any) => item.system.identifier === 'ogre-toughness').effects[0].system.changes = []; })).toContain('EFFECT_COVERAGE_MISMATCH');
    expect(mutate((pkg) => { pkg.target.dnd5e = '5.3.3'; })).toContain('TARGET');
  });
});

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

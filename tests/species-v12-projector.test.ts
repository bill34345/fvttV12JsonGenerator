import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  compileCanonicalSpecies,
  compileSpeciesMarkdown,
  compileSpeciesMarkdownV14,
  validateNativeSpeciesPackage,
} from '@fvtt-json-generator/generation/species';
import {
  compileSpeciesMarkdownV12,
  SPECIES_V12_TARGET,
  validateNativeSpeciesPackage as validateNativeSpeciesPackageV12,
  type NativeSpeciesPackage as NativeSpeciesPackageV12,
} from '@fvtt-json-generator/generation/species-v12';
import {
  compileSpeciesMarkdownV14 as compileSpeciesMarkdownV14Locked,
  SPECIES_V14_TARGET,
  validateNativeSpeciesPackage as validateNativeSpeciesPackageV14,
  type NativeSpeciesPackage as NativeSpeciesPackageV14,
} from '@fvtt-json-generator/generation/species-v14';
import { parseSpeciesMarkdown } from '@fvtt-json-generator/parser/species-parser';

const ogreMarkdown = readFileSync(resolve('obsidian/dnd数据转fvttjson/input/species/ogre.md'), 'utf8');

describe('Species V12 static candidate projector', () => {
  test('locks wrapper validators and public package targets to their Foundry versions', () => {
    const v12 = compileSpeciesMarkdownV12(ogreMarkdown);
    const v14 = compileSpeciesMarkdownV14Locked(ogreMarkdown);
    const v12Package: NativeSpeciesPackageV12 = v12;
    const v14Package: NativeSpeciesPackageV14 = v14;
    const v12Target: typeof SPECIES_V12_TARGET = v12Package.target;
    const v14Target: typeof SPECIES_V14_TARGET = v14Package.target;
    // @ts-expect-error The V12 facade must not accept a V14 package type.
    const v12TypeMismatch: NativeSpeciesPackageV12 = v14Package;
    // @ts-expect-error The V14 facade must not accept a V12 package type.
    const v14TypeMismatch: NativeSpeciesPackageV14 = v12Package;

    expect(v12Target).toEqual(SPECIES_V12_TARGET);
    expect(v14Target).toEqual(SPECIES_V14_TARGET);
    expect(validateNativeSpeciesPackageV12(v12Package)).toEqual({ ok: true, findings: [] });
    expect(validateNativeSpeciesPackageV14(v14Package)).toEqual({ ok: true, findings: [] });
    expect(validateNativeSpeciesPackageV12(v14Package as unknown as NativeSpeciesPackageV12).findings.map((finding) => finding.code)).toEqual(['TARGET']);
    expect(validateNativeSpeciesPackageV14(v12Package as unknown as NativeSpeciesPackageV14).findings.map((finding) => finding.code)).toEqual(['TARGET']);
  });

  test('projects the complete Ogre rules without inventing automation', () => {
    const pkg = compileSpeciesMarkdown(ogreMarkdown, { fvttVersion: '12' });
    expect(validateNativeSpeciesPackage(pkg)).toEqual({ ok: true, findings: [] });
    expect(pkg.target).toEqual({ foundry: '12.331', dnd5e: '4.3.9', effectProfile: 'core', rules: '2024' });
    expect(pkg.species.type).toBe('race');
    expect(pkg.species.system.type).toEqual({ value: 'giant', custom: '', subtype: 'Ogre' });
    expect(pkg.species.system.movement.walk).toBe(40);
    expect(pkg.species.system.senses.darkvision).toBe(60);
    expect(pkg.species.system.advancement.find((entry: any) => entry.type === 'Size')).toMatchObject({ level: 0, configuration: { sizes: ['lg'] }, value: { size: '' } });
    expect(pkg.species.system.advancement.filter((entry: any) => entry.type === 'ItemGrant').map((entry: any) => [entry.level, entry.configuration.items.length])).toEqual([[0, 4], [5, 1]]);

    const manual = pkg.features.find((item) => item.system.identifier === 'giant-weapon-use')!;
    expect(manual.system.activities).toEqual({});
    expect(manual.effects).toEqual([]);
    expect(manual.flags).toEqual({});
    const escape = pkg.features.find((item) => item.system.identifier === 'powerful-build-bonus-action-escape')!;
    expect(escape.system.uses).toEqual({ spent: 0, recovery: [{ period: 'lr', type: 'recoverAll' }], max: '2' });
    const activity = Object.values(escape.system.activities)[0] as any;
    expect(activity.activation.type).toBe('bonus');
    expect(activity.consumption).toMatchObject({ spellSlot: false, targets: [{ type: 'itemUses', target: '', value: '1', scaling: { mode: '', formula: '' } }] });
    expect(activity.effects).toEqual([]);
    expect(activity).not.toHaveProperty('appliedEffects');
    expect(activity.description.chatFlavor).toContain('不选择属性或技能');
    expect(activity.description.chatFlavor).toContain('不自动移除受擒状态');
    expect(activity.target).toMatchObject({ affects: { type: 'self' }, prompt: false });

    const toughness = pkg.features.find((item) => item.system.identifier === 'ogre-toughness')!;
    expect(toughness.effects[0].changes).toEqual([{ key: 'system.attributes.hp.bonuses.level', mode: 2, value: '3', priority: null }]);
    const clumsy = pkg.features.find((item) => item.system.identifier === 'ogre-clumsiness')!;
    expect(clumsy.effects[0].changes).toEqual([{ key: 'system.attributes.ac.bonus', mode: 2, value: '-2', priority: null }]);
    expect(clumsy.system.description.value).toContain('花费全部速度站起来');
    expect(JSON.stringify(pkg)).not.toMatch(/ability-score|language|reach|carrying|weaponProficien|unarmed|resistance/iu);
  });

  test('supports a description-only Species without activities, effects, or flags', () => {
    const canonical = parseSpeciesMarkdown(ogreMarkdown);
    canonical.identifier = 'quiet-giant';
    canonical.displayName = '沉默巨人（Quiet Giant）';
    canonical.name = '沉默巨人';
    canonical.englishName = 'Quiet Giant';
    canonical.features = [{
      id: 'quiet-rule', name: '沉默规则', description: '完整保留原文并由GM执行。',
      parts: [{ id: 'quiet-rule-manual', level: 0, automation: 'gm-assisted', mechanics: [{ kind: 'gm-assisted', boundaries: ['由GM执行。'] }] }],
    }];
    const pkg = compileCanonicalSpecies(canonical, { fvttVersion: '12' });
    expect(validateNativeSpeciesPackage(pkg).ok).toBeTrue();
    expect(pkg.features[0]).toMatchObject({ effects: [], flags: {}, system: { activities: {} } });
  });

  test('supports another legal recovery period and a non-Ogre grant level', () => {
    const canonical = parseSpeciesMarkdown(ogreMarkdown);
    canonical.identifier = 'watchful-giant';
    canonical.features = [{
      id: 'watchful-step', name: '警觉步伐', description: '3级起每次短休可使用一次。',
      parts: [{ id: 'watchful-step-use', level: 3, automation: 'native', mechanics: [{ kind: 'limited-utility', activation: 'reaction', uses: { max: 1, recovery: 'sr' }, consumption: 1, chatFlavor: '按原规则手动处理结果。' }] }],
    }];
    const pkg = compileCanonicalSpecies(canonical, { fvttVersion: '12' });
    expect(validateNativeSpeciesPackage(pkg).ok).toBeTrue();
    expect(pkg.species.system.advancement.find((entry: any) => entry.type === 'ItemGrant')).toMatchObject({ level: 3 });
    expect(pkg.features).toHaveLength(1);
    expect(pkg.features[0]!.system.uses).toEqual({ spent: 0, recovery: [{ period: 'sr', type: 'recoverAll' }], max: '1' });
  });

  test('rejects near-valid V14 fields, arbitrary mechanics, wrong targets, and mixed grant levels', () => {
    const root = compileSpeciesMarkdown(ogreMarkdown, { fvttVersion: '12' });
    const mutate = (apply: (pkg: any) => void) => {
      const pkg = structuredClone(root);
      apply(pkg);
      rehash(pkg);
      return validateNativeSpeciesPackage(pkg).findings.map((finding) => finding.code);
    };
    expect(mutate((pkg) => { const activity = Object.values(pkg.features.find((item: any) => item.system.identifier === 'powerful-build-bonus-action-escape').system.activities)[0] as any; activity.appliedEffects = []; })).toContain('V14_ACTIVITY_FIELD');
    expect(mutate((pkg) => { pkg.features[0].flags['midi-qol'] = {}; })).toContain('CORE_PROFILE_MODULE_LEAKAGE');
    expect(mutate((pkg) => { pkg.features.find((item: any) => item.system.identifier === 'ogre-toughness').effects[0].changes[0].key = 'system.attributes.hp.max'; })).toContain('EFFECT_KEY');
    expect(mutate((pkg) => { const activity = Object.values(pkg.features.find((item: any) => item.system.identifier === 'powerful-build-bonus-action-escape').system.activities)[0] as any; activity.target.affects.type = 'creature'; })).toContain('INVALID_UTILITY_TARGET');
    expect(mutate((pkg) => { pkg.coverageLedger.find((entry: any) => entry.featureId === 'ogre-clumsiness' && entry.partId.endsWith('standing')).level = 5; })).toContain('MIXED_FEATURE_GRANT_LEVEL');
  });

  test('preserves the complete established V14 Ogre projection and cross-target document identities', () => {
    const expected = JSON.parse(readFileSync(resolve('obsidian/dnd数据转fvttjson/output/species/ogre.json'), 'utf8'));
    const v14 = compileSpeciesMarkdownV14(ogreMarkdown);
    const v12 = compileSpeciesMarkdown(ogreMarkdown, { fvttVersion: '12' });
    expect(v14).toEqual(expected);
    expect([v12.species._id, ...v12.features.map((item) => item._id)].sort()).toEqual([v14.species._id, ...v14.features.map((item) => item._id)].sort());
    expect(v12.species.system.advancement.flatMap((entry: any) => entry.configuration?.items?.map((item: any) => item.uuid) ?? []).sort())
      .toEqual(v14.species.system.advancement.flatMap((entry: any) => entry.configuration?.items?.map((item: any) => item.uuid) ?? []).sort());
  });

  test('locks the V12 Species projection to dnd5e 4.3.9 primary-source contracts', () => {
    const contract = JSON.parse(readFileSync(resolve('references/dnd5e-4.3.9/species-contract.json'), 'utf8'));
    const system = JSON.parse(readFileSync(resolve('references/dnd5e-4.3.9/system.json'), 'utf8'));
    expect(system.version).toBe('4.3.9');
    expect(system.compatibility.minimum).toBe('12.331');
    expect(contract.target).toEqual({ foundry: '12.331', dnd5e: '4.3.9' });
    expect(contract.race).toMatchObject({ itemType: 'race', advancementTypes: ['Size', 'ItemGrant'], sizeValue: { size: '' } });
    expect(contract.utilityActivity).toMatchObject({ type: 'utility', effectField: 'effects', forbiddenFields: ['appliedEffects'], consumptionType: 'itemUses' });
    expect(contract.uses).toMatchObject({ recoveryPeriods: ['lr', 'sr'], recoveryType: 'recoverAll' });
    expect(contract.raceLevelAdvancement.raceFlowAtCharacterLevel).toBeTrue();
    expect(contract.effects).toMatchObject({ hpPerLevelPath: 'system.attributes.hp.bonuses.level', hpUsesTotalCharacterLevel: true, acBonusPath: 'system.attributes.ac.bonus', acIncludedInFinalValue: true });
  });
});

function rehash(pkg: any): void {
  const logical = { schemaVersion: pkg.schemaVersion, moduleId: pkg.moduleId, target: pkg.target, sourceSha256: pkg.sourceSha256, species: pkg.species, features: pkg.features, coverageLedger: pkg.coverageLedger };
  pkg.logicalHash = new Bun.CryptoHasher('sha256').update(canonicalJson(logical)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

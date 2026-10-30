import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ActorGenerator } from '@fvtt-json-generator/generation/actor';
import { adaptParsedActorToCanonical, adaptParsedItemToCanonical } from '@fvtt-json-generator/generation/adapters';
import { ItemGenerator } from '@fvtt-json-generator/generation/item-generator';
import { projectWeaponProperties } from '@fvtt-json-generator/generation/weapon-properties';
import { verifyGeneratedDocument } from '@fvtt-json-generator/generation/verification';
import { ItemParser } from '@fvtt-json-generator/parser/item-parser';
import { YamlParser } from '@fvtt-json-generator/parser/yaml';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';
import type { ParsedItem } from '@fvtt-json-generator/models/item';
import type { ParsedNPC } from '@fvtt-json-generator/parser/mapping';
import type { WeaponConfiguration } from '@fvtt-json-generator/contracts/weapon-properties';

const source = readFileSync(resolve('tests/fixtures/weapon-mastery-spear.md'), 'utf8');
const actorSource = readFileSync(resolve('tests/fixtures/weapon-mastery-actor.md'), 'utf8');
const twoWeaponActorSource = readFileSync(resolve('tests/fixtures/weapon-mastery-two-weapons.md'), 'utf8');
const deadlyConfiguration: WeaponConfiguration = {
  schemaVersion: 1,
  enabled: true,
  mastery: 'native',
  grantMastery: false,
  rules: [{
    ruleId: 'house.deadly',
    kind: 'deadly',
    label: 'Deadly d8',
    params: { dice: 1, die: 8 },
    stackingGroup: 'house.deadly',
  }],
};

function firstAttack(item: any): any {
  return Object.values(item?.system?.activities ?? {})
    .find((activity: any) => activity?.type === 'attack');
}

describe('weapon mastery and property formal generation', () => {
  test('parses explicit native mastery/config and projects standalone Item through workflow', async () => {
    const parsed = new ItemParser().parse(source);
    expect(parsed.nativeMastery).toBe('graze');
    expect(parsed.weapon?.mastery).toBe('graze');
    expect(parsed.weaponConfiguration).toEqual(deadlyConfiguration);

    const result = await convertMarkdownContentToJson({
      content: source,
      fvttVersion: '14',
      effectProfile: 'core',
    });
    expect(result.status).toBe('accepted');
    const item = result.rawJson as any;
    expect(item.system.mastery).toBe('graze');
    expect(firstAttack(item)?.damage?.critical?.bonus).toBe('1d8');
    expect(Object.keys(item.system.activities)).toHaveLength(1);
    expect(firstAttack(item)).toMatchObject({
      type: 'attack',
      attack: { type: { value: 'melee', classification: 'weapon' }, flat: true },
      damage: { includeBase: false, parts: [{ number: 1, denomination: 6, types: ['piercing'] }] },
    });
    expect(item.flags?.['fvtt-weapon-mastery-properties']).toBeUndefined();
    expect(firstAttack(item).flags.fvttJsonGenerator.weaponPropertyBase).toMatchObject({ schemaVersion: 1, partIndex: 0 });
    expect(result.verification.mechanicsCoverage.some((entry) => entry.kind === 'weapon-properties' && entry.status === 'projected')).toBe(true);
  });

  test('keeps LF and CRLF source semantics identical and rejects malformed explicit config', () => {
    const lf = new ItemParser().parse(source);
    const crlf = new ItemParser().parse(source.replace(/\n/g, '\r\n'));
    expect(crlf).toEqual(lf);
    expect(() => new ItemParser().parse(source.replace('schemaVersion: 1', 'schemaVersion: 99')))
      .toThrow(/InvalidWeaponConfiguration/u);
  });

  test('does not infer mastery from a near-negative weapon label or alter an unrelated Item', async () => {
    const nearNegative = source
      .replace('原生精通: graze\n', '')
      .replace(/weapon-properties:[\s\S]*?item-mechanics:/u, 'item-mechanics:')
      .replace(/  schemaVersion: 1\n  abilities:/u, '  schemaVersion: 1\n  abilities:');
    const parsed = new ItemParser().parse(nearNegative);
    expect(parsed.nativeMastery).toBeUndefined();
    expect(parsed.weaponConfiguration).toBeUndefined();
    const generated = await convertMarkdownContentToJson({ content: nearNegative, fvttVersion: '14', effectProfile: 'core' });
    expect(generated.status).toBe('accepted');
    const generatedItem = generated.rawJson as any;
    expect(generatedItem.system.mastery).toBeUndefined();
    expect(generatedItem.flags?.['fvtt-weapon-mastery-properties']).toBeUndefined();
    expect(Object.values(generatedItem.system.activities ?? {}).some((activity: any) => activity?.damage?.critical)).toBe(false);
    expect(firstAttack(generatedItem).flags?.fvttJsonGenerator?.weaponPropertyBase).toBeUndefined();

    const unrelated = await convertMarkdownContentToJson({
      content: '---\nlayout: item\n名称: 普通盾牌\n类型: 盾牌\n---\n*护甲（盾牌），珍稀*\n',
      fvttVersion: '14',
      effectProfile: 'core',
    });
    const shield = unrelated.rawJson as any;
    expect(unrelated.status).toBe('accepted');
    expect(shield.system.mastery).toBeUndefined();
    expect(shield.flags?.['fvtt-weapon-mastery-properties']).toBeUndefined();
    expect(Object.values(shield.system.activities ?? {}).some((activity: any) => activity?.damage?.critical)).toBe(false);
  });

  test('keeps Deadly idempotent while preserving an existing critical bonus', () => {
    const item: any = {
      system: {
        activities: {
          attack: {
            type: 'attack',
            damage: { parts: [], includeBase: true, critical: { bonus: '1d6' } },
          },
        },
      },
      flags: {},
    };
    projectWeaponProperties(item, {
      configuration: deadlyConfiguration,
      effectProfile: 'core',
      targetVersion: '14',
    });
    projectWeaponProperties(item, {
      configuration: deadlyConfiguration,
      effectProfile: 'core',
      targetVersion: '14',
    });
    expect(item.system.activities.attack.damage.critical.bonus).toBe('1d6 + 1d8');
  });

  test('uses provenance rather than dice text to update or remove its own contribution', () => {
    const item: any = {
      system: {
        activities: {
          attack: {
            type: 'attack',
            damage: { parts: [], includeBase: true, critical: { bonus: '1d8' } },
          },
        },
      },
      flags: {},
    };
    projectWeaponProperties(item, {
      configuration: deadlyConfiguration,
      effectProfile: 'core',
      targetVersion: '14',
    });
    // The pre-existing 1d8 is independent; the owned contribution is added.
    expect(item.system.activities.attack.damage.critical.bonus).toBe('1d8 + 1d8');
    projectWeaponProperties(item, {
      configuration: { ...deadlyConfiguration, rules: [{ ...deadlyConfiguration.rules[0]!, params: { dice: 1, die: 10 } }] },
      effectProfile: 'core',
      targetVersion: '14',
    });
    expect(item.system.activities.attack.damage.critical.bonus).toBe('1d8 + 1d10');
    projectWeaponProperties(item, {
      effectProfile: 'core',
      targetVersion: '14',
    });
    expect(item.system.activities.attack.damage.critical.bonus).toBe('1d8');
  });

  test('verifies exact baseline plus one Deadly die and rejects duplicate or unproven output', async () => {
    const parsed: ParsedItem = {
      name: 'Existing Critical Bonus Spear',
      type: 'weapon',
      weaponConfiguration: deadlyConfiguration,
      activities: {
        attack: {
          _id: 'attack',
          type: 'attack',
          attack: {ability: 'none', bonus: '', flat: false, type: {value: 'melee', classification: 'weapon'}},
          damage: {
            parts: [],
            includeBase: true,
            critical: { bonus: '1d8' },
          },
        },
      },
    };
    const item = await new ItemGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(parsed);
    const canonical = adaptParsedItemToCanonical(parsed);
    const accepted = verifyGeneratedDocument({ canonical, output: item, target: '14', effectProfile: 'core' });
    expect(accepted.status,JSON.stringify(accepted.diagnostics)).toBe('accepted');
    const attack = firstAttack(item);
    attack.damage.critical.bonus = '1d8 + 1d8 + 1d8';
    const duplicate = verifyGeneratedDocument({ canonical, output: item, target: '14', effectProfile: 'core' });
    expect(duplicate.status).toBe('failed');
    expect(duplicate.diagnostics.map((entry) => entry.code)).toContain('GEN_WEAPON_CRITICAL_BONUS_MISMATCH');

    attack.damage.critical.bonus = '1d8 + 1d8';
    delete attack.flags.fvttJsonGenerator.weaponPropertyContributions.deadly;
    const unproven = verifyGeneratedDocument({ canonical, output: item, target: '14', effectProfile: 'core' });
    expect(unproven.status).toBe('failed');
    expect(unproven.diagnostics.map((entry) => entry.code)).toContain('GEN_WEAPON_CRITICAL_BONUS_MISMATCH');
  });

  test('verifies each Attack Activity against its own critical baseline', async () => {
    for (const secondBonus of ['1d10', undefined]) {
      const parsed: ParsedItem = {
        name: 'Two Attack Critical Spear',
        englishName: 'Dual Critical Spear',
        type: 'weapon',
        weaponConfiguration: deadlyConfiguration,
        activities: {
          first: {
            _id: 'first', type: 'attack', attack: {ability: 'none', bonus: '', flat: false, type: {value: 'melee', classification: 'weapon'}},
            damage: { parts: [], includeBase: true, critical: { bonus: '1d6' } },
          },
          second: {
            _id: 'second', type: 'attack', attack: {ability: 'none', bonus: '', flat: false, type: {value: 'ranged', classification: 'weapon'}},
            damage: { parts: [], includeBase: true, ...(secondBonus ? { critical: { bonus: secondBonus } } : {}) },
          },
        },
      };
      const item = await new ItemGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(parsed);
      const canonical = adaptParsedItemToCanonical(parsed);
      const attacks = Object.values(item.system.activities).filter((activity: any) => activity.type === 'attack') as any[];
      expect(attacks).toHaveLength(2);
      expect(attacks[0]?.damage?.critical?.bonus).toBe('1d6 + 1d8');
      expect(attacks[1]?.damage?.critical?.bonus).toBe(secondBonus ? `${secondBonus} + 1d8` : '1d8');
      const verification=verifyGeneratedDocument({ canonical, output: item, target: '14', effectProfile: 'core' });
      expect(verification.status,JSON.stringify(verification.diagnostics)).toBe('accepted');

      attacks[1].damage.critical.bonus = '1d6 + 1d8';
      const corrupted = verifyGeneratedDocument({ canonical, output: item, target: '14', effectProfile: 'core' });
      expect(corrupted.status).toBe('failed');
      expect(corrupted.diagnostics.map((entry) => entry.code)).toContain('GEN_WEAPON_CRITICAL_BONUS_MISMATCH');
    }
  });

  test('core preserves Fatal and critical bleeding as reviewable semantics', async () => {
    const parsed = new ItemParser().parse(source);
    const configuration: WeaponConfiguration = {
      schemaVersion: 1,
      enabled: true,
      mastery: 'native',
      grantMastery: false,
      rules: [{
        ruleId: 'house.fatal',
        kind: 'fatal',
        label: 'Fatal d10',
        params: { die: 10 },
        stackingGroup: 'house.fatal',
      }],
    };
    const fatal: ParsedItem = { ...parsed, weaponConfiguration: configuration };
    const itemResult = await convertMarkdownContentToJson({
      content: source.replace('house.deadly', 'house.fatal').replace('kind: deadly', 'kind: fatal').replace('Deadly d8', 'Fatal d10').replace('dice: 1\n        die: 8', 'die: 10'),
      fvttVersion: '14',
      effectProfile: 'core',
    });
    expect(itemResult.status).toBe('needs_review');
    expect((itemResult.rawJson as any).flags?.['fvtt-weapon-mastery-properties']).toBeUndefined();
    expect((itemResult.rawJson as any).system.description.value).toContain('Fatal changes only the weapon base die');
    expect((itemResult.rawJson as any).system.damage.base.denomination).toBe(6);
    expect(fatal.weaponConfiguration).toEqual(configuration);
  });

  test('modded V14 projects the self-owned module flag and embedded Actor weapon path', () => {
    const parsed: ParsedNPC = {
      name: 'Weapon Mastery NPC',
      type: 'npc',
      abilities: { str: 16, dex: 10, con: 12, int: 10, wis: 10, cha: 10 },
      attributes: { hp: { value: 10, max: 10 }, ac: { value: 12, calc: 'flat' }, prof: 3 },
      details: {},
      traits: {},
      items: [],
      structuredActions: {
        动作: [{
          name: 'Configured Spear',
          type: 'attack',
          attackType: 'mwak',
          toHit: 5,
          range: 'reach 5 ft.',
          damage: [{ formula: '1d6', type: 'piercing' }],
          nativeMastery: 'vex',
          weaponConfiguration: deadlyConfiguration,
        }],
      },
    };
    const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'modded-v14' }).generate(parsed);
    const item = actor.items.find((candidate: any) => candidate.name.includes('Configured Spear'));
    expect(item).toBeDefined();
    expect(item.system.mastery).toBe('vex');
    expect(item.flags?.['fvtt-weapon-mastery-properties']?.weapon).toEqual(deadlyConfiguration);
    expect(firstAttack(item)?.damage?.critical?.bonus).toBe('1d8');

    const verification = verifyGeneratedDocument({
      canonical: adaptParsedActorToCanonical(parsed),
      output: actor,
      target: '14',
      effectProfile: 'modded-v14',
    });
    expect(verification.status).toBe('accepted');
  });

  test('parses the formal textual Actor fixture before projecting its embedded weapon', async () => {
    const parsed = new YamlParser().parse(actorSource);
    const action = parsed.structuredActions?.动作?.[0];
    expect(action?.nativeMastery).toBe('vex');
    expect(action?.weaponConfiguration).toEqual(deadlyConfiguration);

    const result = await convertMarkdownContentToJson({
      content: actorSource,
      fvttVersion: '14',
      effectProfile: 'modded-v14',
    });
    expect(result.kind).toBe('actor');
    expect(result.status).toBe('accepted');
    const actor = result.rawJson as any;
    const item = actor.items.find((candidate: any) => candidate.name.includes('配置长矛'));
    expect(item?.system?.mastery).toBe('vex');
    expect(item?.flags?.['fvtt-weapon-mastery-properties']?.weapon).toEqual(deadlyConfiguration);
    expect(firstAttack(item)?.damage?.critical?.bonus).toBe('1d8');
    const verification = verifyGeneratedDocument({
      canonical: adaptParsedActorToCanonical(parsed, { sourceText: actorSource }),
      output: actor,
      target: '14',
      effectProfile: 'modded-v14',
    });
    expect(verification.status).toBe('accepted');
  });

  test('accepts an Actor weapon with only explicit native mastery and verifies its value', async () => {
    const nativeOnlySource = actorSource.replace(/    weapon-properties:\r?\n[\s\S]*?(?=    伤害:)/u, '');
    expect(nativeOnlySource).not.toBe(actorSource);
    const parsed = new YamlParser().parse(nativeOnlySource);
    expect(parsed.structuredActions?.动作?.[0]?.nativeMastery).toBe('vex');
    expect(parsed.structuredActions?.动作?.[0]?.weaponConfiguration).toBeUndefined();

    const result = await convertMarkdownContentToJson({
      content: nativeOnlySource,
      fvttVersion: '14',
      effectProfile: 'core',
    });
    expect(result.kind).toBe('actor');
    expect(result.status).toBe('accepted');
    const actor = structuredClone(result.rawJson as any);
    const weapon = actor.items.find((item: any) => item.name.includes('配置长矛'));
    expect(weapon?.system?.mastery).toBe('vex');
    expect(weapon?.flags?.fvttJsonGenerator?.weaponProperties).toBeUndefined();
    expect(weapon?.flags?.fvttJsonGenerator?.weaponPropertiesSource?.logicalPath).toMatch(/^structuredActions\/动作\/0\/配置长矛$/u);

    const canonical = adaptParsedActorToCanonical(parsed, { sourceText: nativeOnlySource });
    expect(verifyGeneratedDocument({ canonical, output: actor, target: '14', effectProfile: 'core' }).status).toBe('accepted');
    weapon.system.mastery = 'graze';
    const corrupted = verifyGeneratedDocument({ canonical, output: actor, target: '14', effectProfile: 'core' });
    expect(corrupted.status).toBe('failed');
    expect(corrupted.diagnostics.map((entry) => entry.code)).toContain('GEN_WEAPON_NATIVE_MASTERY_MISMATCH');
  });

  test('binds reordered Actor weapon mechanics by source identity and isolates corruption to one source', async () => {
    const parsed = new YamlParser().parse(twoWeaponActorSource);
    expect(parsed.structuredActions?.动作).toHaveLength(2);
    const result = await convertMarkdownContentToJson({
      content: twoWeaponActorSource,
      fvttVersion: '14',
      effectProfile: 'modded-v14',
    });
    expect(result.status).toBe('accepted');
    const actor = structuredClone(result.rawJson as any);
    actor.items.reverse();

    const canonical = adaptParsedActorToCanonical(parsed, { sourceText: twoWeaponActorSource });
    const reorderedVerification = verifyGeneratedDocument({
      canonical,
      output: actor,
      target: '14',
      effectProfile: 'modded-v14',
    });
    expect(reorderedVerification.status).toBe('accepted');
    const deadlyItem = actor.items.find((item: any) => item.name.includes('Deadly'));
    const fatalItem = actor.items.find((item: any) => item.name.includes('Fatal'));
    expect(deadlyItem?.system?.mastery).toBe('graze');
    expect(fatalItem?.system?.mastery).toBe('vex');
    expect(firstAttack(deadlyItem)?.damage?.critical?.bonus).toBe('1d8');
    expect(firstAttack(fatalItem)?.damage?.critical?.bonus).toBeUndefined();
    for (const [item, faces, type] of [[deadlyItem, 6, 'piercing'], [fatalItem, 8, 'bludgeoning']] as const) {
      const attack = firstAttack(item);
      expect(attack.damage).toEqual({ includeBase: false, parts: [{ number: 1, denomination: faces, bonus: '',
        types: [type], custom: { enabled: false, formula: '' }, scaling: { mode: 'whole', number: 1, formula: '' } }],
        ...(item === deadlyItem ? { critical: { bonus: '1d8' } } : {}) });
      expect(attack.flags.fvttJsonGenerator.weaponPropertyBase).toMatchObject({ schemaVersion: 1, partIndex: 0 });
    }

    fatalItem.flags['fvtt-weapon-mastery-properties'].weapon.schemaVersion = 99;
    const corruptVerification = verifyGeneratedDocument({
      canonical,
      output: actor,
      target: '14',
      effectProfile: 'modded-v14',
    });
    expect(corruptVerification.status).toBe('failed');
    const weaponDiagnostics = corruptVerification.diagnostics.filter((entry) => entry.code.startsWith('GEN_WEAPON_'));
    expect(weaponDiagnostics.length).toBeGreaterThan(0);
    expect(weaponDiagnostics.every((entry) => entry.path.includes('documents/0'))).toBe(true);
    expect(weaponDiagnostics.some((entry) => entry.path.includes('documents/1'))).toBe(false);
  });

  test('rejects a corrupt projected configuration instead of accepting the mechanic', async () => {
    const parsed = new ItemParser().parse(source);
    const result = await convertMarkdownContentToJson({ content: source, fvttVersion: '14', effectProfile: 'modded-v14' });
    const output = result.rawJson as any;
    output.flags['fvtt-weapon-mastery-properties'].weapon.schemaVersion = 99;
    const verification = verifyGeneratedDocument({
      canonical: adaptParsedItemToCanonical(parsed),
      output,
      target: '14',
      effectProfile: 'modded-v14',
    });
    expect(verification.status).toBe('failed');
    expect(verification.diagnostics.map((entry) => entry.code)).toContain('GEN_WEAPON_CONFIGURATION_MISSING');
  });

  test('formal verifier rejects a lost literal binding and accidental Item-base duplication', async () => {
    const result = await convertMarkdownContentToJson({ content: source, fvttVersion: '14', effectProfile: 'modded-v14' });
    expect(result.status).toBe('accepted');
    for (const corrupt of ['binding', 'include-base']) {
      const output: any = structuredClone(result.rawJson);
      const activity = firstAttack(output);
      if (corrupt === 'binding') delete activity.flags.fvttJsonGenerator.weaponPropertyBase;
      else activity.damage.includeBase = true;
      const checked = verifyGeneratedDocument({ canonical: adaptParsedItemToCanonical(new ItemParser().parse(source)),
        output, target: '14', effectProfile: 'modded-v14' });
      expect(checked.status).toBe('failed');
      expect(checked.diagnostics.map(entry => entry.code)).toContain('GEN_WEAPON_BASE_DAMAGE_UNBOUND');
    }
  });

  test('an unambiguous native weapon keeps its native base and ability modifier instead of a literal binding', async () => {
    const nativeSource = actorSource.replace('熟练加值: 3', '熟练加值: 2').replace('公式: 1d6', '公式: 1d6+3');
    const result = await convertMarkdownContentToJson({ content: nativeSource, fvttVersion: '14', effectProfile: 'modded-v14' });
    expect(result.status).toBe('accepted');
    const item = (result.rawJson as any).items.find((entry: any) => entry.type === 'weapon');
    const activity = firstAttack(item);
    expect(activity.attack).toMatchObject({ ability: 'str', flat: false });
    expect(activity.damage).toEqual({ includeBase: true, parts: [], critical: { bonus: '1d8' } });
    expect(item.system.damage.base).toEqual({ number: 1, denomination: 6, bonus: '', types: ['piercing'],
      custom: { enabled: false, formula: '' }, scaling: { mode: 'whole', number: 1, formula: '' } });
    expect(activity.flags.fvttJsonGenerator.weaponPropertyBase).toBeUndefined();
  });

  test('configured v14 ranged attacks use the native ranged discriminator, not the legacy rwak value', async () => {
    const rangedSource = source.replace('attackType: mwak', 'attackType: rwak').replace('range: reach 5 ft.', 'range: range 30/120 ft.');
    const result = await convertMarkdownContentToJson({ content: rangedSource, fvttVersion: '14', effectProfile: 'modded-v14' });
    expect(result.status).toBe('accepted');
    expect(firstAttack(result.rawJson).attack).toMatchObject({ type: { value: 'ranged', classification: 'weapon' }, flat: true, bonus: '5' });
  });
});

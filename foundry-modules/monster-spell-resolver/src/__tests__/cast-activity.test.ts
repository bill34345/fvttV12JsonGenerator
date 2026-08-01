import { describe, expect, test } from 'bun:test';
import { renderMonsterIntakeMarkdown } from '../../../../src/core/intake/renderer';
import { buildRatWarlockIr } from '../../../../src/core/intake/__tests__/fixtures/rat-warlock';
import { YamlParser } from '../../../../src/core/parser/yaml';
import type { PortableSpellRef } from '../../../../src/core/spell-resolution';
import {
  buildCastActivitySource,
  computeManagedSourceHash,
  generatedResolverDocumentId,
} from '../cast-activity';

// Locked runtime evidence (dnd5e 5.3.3): dnd5e.mjs 15579-15605 defines the
// native Cast schema; 11510-11524 defines Activity uses; 3818-3829 defines
// activityUses consumption. NumberField._cast in Foundry 14.364
// common/data/fields.mjs 1467-1502 normalizes raw "4"/"12" to 4/12 when the
// prepared DataModel is constructed. The builder contract intentionally stays
// at the raw source boundary required by the implementation plan.

function ratCases() {
  const parsed = new YamlParser().parse(renderMonsterIntakeMarkdown(buildRatWarlockIr()));
  const manifest = parsed.spellManifest!;
  const group = manifest.spellcastingGroups[0]!;
  return group.spellRefs.map((ref, index) => ({
    ref,
    built: buildCastActivitySource({
      manifestId: manifest.manifestId,
      featureId: 'RatFeature000001',
      group,
      ref,
      selectedUuid: `Compendium.dnd5e.spells24.Item.${String(index).padStart(16, '0')}`,
    }),
  }));
}

describe('native dnd5e 5.3.3 Cast Activity source', () => {
  test('uses native Actor spell slots for a source-leveled prepared spell', () => {
    const base = structuredClone(ratCases()[0]!.ref);
    const ref: PortableSpellRef = {
      ...base,
      refId: 'prepared-command',
      identifier: 'command',
      originalName: '命令术command',
      englishName: 'Command',
      method: 'prepared',
      castingLevel: 1,
      restrictions: [],
      evidence: [],
    };
    delete ref.uses;
    const built = buildCastActivitySource({
      manifestId: 'prepared-priest',
      featureId: 'PriestFeature001',
      group: { groupId: 'prepared-wisdom', featureItemKey: 'prepared-wisdom', ability: 'wis', spellRefs: [ref] },
      ref,
      selectedUuid: 'Compendium.dnd5e.spells24.Item.abcdefghijklmnop',
    });

    expect(built.activity.consumption).toEqual({ spellSlot: true, targets: [] });
    expect(built.activity.uses).toBeUndefined();
    expect(built.activity.spell).toMatchObject({ ability: 'wis', level: 1, spellbook: true });
  });

  test('projects all ten real Rat refs to native Cast source without destination rewrites or macros', () => {
    const cases = ratCases();
    expect(cases).toHaveLength(10);

    for (const { built } of cases) {
      expect(built.activity).toMatchObject({
        type: 'cast',
        consumption: { spellSlot: false },
        spell: {
          ability: 'cha',
          challenge: { override: true, attack: '4', save: '12' },
        },
      });
      expect(built.activity.spell.uuid).toMatch(/^Compendium\.dnd5e\.spells24\.Item\.[A-Za-z0-9]{16}$/);
      expect(built.activity._id).toMatch(/^[A-Za-z0-9]{16}$/);
      expect(JSON.stringify(built.activity)).not.toMatch(/item.?macro|midi|dae|times.?up|runtime.?macro/i);
    }

    const atWill = cases.filter(({ ref }) => ref.uses === undefined);
    const daily = cases.filter(({ ref }) => ref.uses?.recovery === 'day');
    expect(atWill).toHaveLength(4);
    expect(daily).toHaveLength(6);
    for (const { built } of atWill) {
      expect(built.activity.uses).toBeUndefined();
      expect(built.activity.consumption.targets).toEqual([]);
    }
    for (const { built } of daily) {
      expect(built.activity.uses).toEqual({ spent: 0, max: '1', recovery: [{ period: 'day', type: 'recoverAll' }] });
      expect(built.activity.consumption.targets).toEqual([{ type: 'activityUses', value: '1' }]);
      expect(built.activity.flags['fvtt-json-generator-spell-resolver'].generatedContentHash)
        .toBe(computeManagedSourceHash(built.activity));
      const spent = structuredClone(built.activity);
      spent.uses!.spent = 1 as 0;
      expect(computeManagedSourceHash(spent)).toBe(computeManagedSourceHash(built.activity));
      const structural = structuredClone(built.activity);
      structural.spell.ability = 'wis';
      expect(computeManagedSourceHash(structural)).not.toBe(computeManagedSourceHash(built.activity));
    }

    expect(cases.every(({ built }) => built.activity.spell.properties?.includes('material'))).toBe(true);
    const mageArmor = cases.find(({ ref }) => ref.identifier === 'mage-armor')!;
    expect(mageArmor.built.activity.target).toMatchObject({ override: true, affects: { type: 'self' } });
    expect(cases.flatMap(({ built }) => built.literalRestrictions).map((entry) => entry.text)).toEqual(
      expect.arrayContaining([
        cases.find(({ ref }) => ref.identifier === 'eldritch-blast')!.ref.restrictions[0]!.text,
        cases.find(({ ref }) => ref.identifier === 'conjure-animals')!.ref.restrictions[0]!.text,
      ]),
    );

    // A Compendium UUID remains the Cast destination. Cached embedded UUIDs
    // are never substituted here and the Compendium source is never edited.
    for (const { built } of cases) expect(built.activity.spell.uuid).toStartWith('Compendium.');
  });

  test('uses source-derived self restrictions, not spell or creature names', () => {
    const base = ratCases()[0]!.ref;
    const build = (ref: PortableSpellRef) => buildCastActivitySource({
      manifestId: 'generalization-manifest',
      featureId: 'FeatureGeneral01',
      group: { groupId: 'general', featureItemKey: 'general', ability: 'cha', spellRefs: [ref] },
      ref,
      selectedUuid: 'Compendium.dnd5e.spells24.Item.abcdefghijklmnop',
    });
    const withRestriction = (text: string, value?: string | number | boolean): PortableSpellRef => ({
      ...structuredClone(base),
      refId: `ref-${text}`,
      identifier: `not-mage-armor-${text}`,
      originalName: `Unrelated ${text}`,
      restrictions: [{ kind: 'target', text, ...(value === undefined ? {} : { value }), evidence: [] }],
    });

    expect(build(withRestriction('self', 'self')).activity.target?.affects.type).toBe('self');
    expect(build(withRestriction('仅自身')).activity.target?.affects.type).toBe('self');
    expect(build(withRestriction('self or one ally')).activity.target).toBeUndefined();
    expect(build(withRestriction('one willing creature', true)).activity.target).toBeUndefined();
    expect(build({ ...structuredClone(base), refId: 'unrelated', identifier: 'mage-armor', restrictions: [] }).activity.target)
      .toBeUndefined();
  });

  test('derives stable 16-character IDs from manifest/group/ref/feature identity, never display names', () => {
    const identity = { manifestId: 'manifest-a', groupId: 'group-a', refId: 'ref-a', featureId: 'FeatureGeneral01' };
    expect(generatedResolverDocumentId(identity, 'activity')).toBe(generatedResolverDocumentId(identity, 'activity'));
    expect(generatedResolverDocumentId(identity, 'activity')).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(generatedResolverDocumentId(identity, 'activity')).not.toBe(generatedResolverDocumentId({ ...identity, refId: 'ref-b' }, 'activity'));
    expect(generatedResolverDocumentId(identity, 'activity')).not.toBe(generatedResolverDocumentId(identity, 'spell'));
    expect(() => generatedResolverDocumentId({ ...identity, featureId: 'short' }, 'activity')).toThrow(/16-character/i);
  });
});

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { ParsedNPC } from '../../../config/mapping';
import { buildRatWarlockIr, RAT_WARLOCK_SOURCE } from '../../intake/__tests__/fixtures/rat-warlock';
import { renderMonsterIntakeMarkdown } from '../../intake/renderer';
import { YamlParser } from '../../parser/yaml';
import {
  hashManifest,
  RESOLVER_MODULE_ID,
  type PortableSpellManifest,
} from '../../spell-resolution';
import { assertEqualStructure } from '../../utils/assertEqualStructure';
import { ActorGenerator, actorGenerationDiagnostics } from '../actor';

function baseParsed(name = 'Portable Caster'): ParsedNPC {
  return {
    name,
    type: 'npc',
    abilities: {},
    attributes: {},
    details: {},
    traits: {},
    skills: {},
    saves: [],
    items: [],
  };
}

function oneSpellManifest(
  groupId: string,
  featureItemKey: string,
  ability: 'int' | 'wis' | 'cha' = 'cha',
): PortableSpellManifest {
  return {
    schemaVersion: 1,
    manifestId: `manifest-${groupId}`,
    sourceSha256: '0'.repeat(64),
    rulesPreference: '2024',
    spellcastingGroups: [{
      groupId,
      featureItemKey,
      ability,
      spellRefs: [{
        refId: `${groupId}-light`,
        identifier: 'light',
        originalName: 'Light',
        englishName: 'Light',
        aliases: [],
        method: 'at-will',
        restrictions: [],
        evidence: [{ start: 0, end: 5, quote: 'Light' }],
      }],
    }],
  };
}

function spellcastingTrait(featureItemKey: string, name: string, description: string) {
  return {
    name,
    englishName: `${name} English`,
    type: 'utility' as const,
    describe: description,
    spellcastingFeatureKey: featureItemKey,
  };
}

describe('portable Actor spell manifest boundary', () => {
  it('retains localized Actor content and reports an english localization target-world UUID', async () => {
    const parsed = baseParsed('Portable English Caster');
    parsed.spellManifest = oneSpellManifest('group-a', 'feature-a');
    parsed.structuredActions = {
      特性: [spellcastingTrait('feature-a', 'Spellcasting Source', 'A safe source description.')],
    };
    const translationService = {
      async translate(text: string, context?: { namespace?: string }) {
        if (context?.namespace === 'item.description') {
          return { text: 'Compendium.dnd5e.spells.Item.abcdefghijklmnop' };
        }
        return { text };
      },
    };

    const actor = await new ActorGenerator({ fvttVersion: '14', translationService }).generateForRoute(parsed, 'english');
    expect(actorGenerationDiagnostics(actor).map(issue => issue.message).join('\n')).toMatch(/SPELL_ACTOR_FORBIDDEN_TARGET_WORLD_IDENTIFIER.*\/items\/0\/system\/description\/value/);
    expect(actor.items[0].system.description.value).toContain('Compendium.dnd5e.spells.Item.abcdefghijklmnop');
    expect(actor.flags[RESOLVER_MODULE_ID].spellManifest).toEqual(parsed.spellManifest);
  });

  it('keeps ordinary english localization valid for a portable Actor', async () => {
    const parsed = baseParsed('Portable English Caster');
    parsed.spellManifest = oneSpellManifest('group-a', 'feature-a');
    parsed.structuredActions = {
      特性: [spellcastingTrait('feature-a', 'Spellcasting Source', 'A safe source description.')],
    };
    const translationService = {
      async translate(text: string, context?: { namespace?: string }) {
        if (context?.namespace === 'item.description') {
          return { text: '安全的本地化描述。' };
        }
        return { text };
      },
    };

    const actor = await new ActorGenerator({ fvttVersion: '14', translationService })
      .generateForRoute(parsed, 'english');

    expect(actor.flags[RESOLVER_MODULE_ID].spellResolution.status).toBe('pending');
    expect(actor.items[0].system.description.value).toBe('<p>安全的本地化描述。</p>');
  });

  it('generates the Rat v14 Actor with an exact pending manifest and explicit source feature link', async () => {
    const markdown = renderMonsterIntakeMarkdown(buildRatWarlockIr());
    const parsed = new YamlParser().parse(markdown);
    const actor = await new ActorGenerator({ fvttVersion: '14' }).generateForRoute(parsed, 'chinese');
    const manifest = parsed.spellManifest!;
    const resolver = actor.flags[RESOLVER_MODULE_ID];
    const linked = actor.items.filter((item: any) => item.flags?.[RESOLVER_MODULE_ID]?.featureItemKey);

    expect(resolver.spellManifest).toEqual(manifest);
    expect(resolver.spellResolution).toEqual({ status: 'pending', manifestHash: hashManifest(manifest) });
    expect(linked).toHaveLength(1);
    expect(linked[0].flags[RESOLVER_MODULE_ID]).toEqual({
      featureItemKey: 'innate-charisma',
      groupId: 'innate-charisma',
    });
    expect(linked[0].flags.fvttJsonGenerator.spellcastingFeatureKey).toBe('innate-charisma');
    expect(linked[0].system.description.value).toContain('Innate Spellcasting');
    expect(actor.items.filter((item: any) => item.type === 'spell')).toHaveLength(0);
    expect(actor.items.flatMap((item: any) => Object.values(item.system?.activities ?? {}))
      .filter((activity: any) => activity.type === 'cast')).toHaveLength(0);
    expect(JSON.stringify(actor)).not.toMatch(/Compendium\.|Item\.[A-Za-z0-9]{16}/);
    expect(manifest.spellcastingGroups.flatMap((group) => group.spellRefs)).toHaveLength(10);
    expect(RAT_WARLOCK_SOURCE).toContain('法术豁免DC12');
  });

  it('uses explicit keys rather than item order or translated/display names', () => {
    const manifest = oneSpellManifest('group-a', 'feature-a');
    const parsed = baseParsed('Reordered Caster');
    parsed.spellManifest = manifest;
    parsed.structuredActions = {
      特性: [
        { name: 'Same Display Name', type: 'utility', describe: 'A same-shaped non-spell trait.' },
        spellcastingTrait('feature-a', 'A translated unrelated label', 'Source-faithful spell grant.'),
      ],
    };

    const actor = new ActorGenerator({ fvttVersion: '14' }).generate(parsed, { route: 'chinese' });
    expect(actor.items[0].flags?.[RESOLVER_MODULE_ID]).toBeUndefined();
    expect(actor.items[0].flags?.fvttJsonGenerator?.spellcastingFeatureKey).toBeUndefined();
    expect(actor.items[0].system.description.value).toContain('same-shaped non-spell trait');
    expect(actor.items[1].flags[RESOLVER_MODULE_ID]).toEqual({ featureItemKey: 'feature-a', groupId: 'group-a' });
    expect(actor.items[1].flags.fvttJsonGenerator.spellcastingFeatureKey).toBe('feature-a');
  });

  it('supports a second two-group caster and links each source group independently', () => {
    const parsed = baseParsed('Two Group Caster');
    const first = oneSpellManifest('group-a', 'feature-a', 'int');
    const second = oneSpellManifest('group-b', 'feature-b', 'int').spellcastingGroups[0]!;
    second.spellRefs[0] = { ...second.spellRefs[0]!, refId: 'group-b-darkness', identifier: 'darkness', originalName: 'Darkness', englishName: 'Darkness', evidence: [{ start: 0, end: 8, quote: 'Darkness' }] };
    parsed.spellManifest = { ...first, manifestId: 'two-group-manifest', spellcastingGroups: [first.spellcastingGroups[0]!, second] };
    parsed.structuredActions = {
      特性: [
        spellcastingTrait('feature-b', 'Second source feature', 'Darkness group.'),
        spellcastingTrait('feature-a', 'First source feature', 'Light group.'),
      ],
    };

    const actor = new ActorGenerator({ fvttVersion: '14' }).generate(parsed, { route: 'chinese' });
    expect(actor.items.map((item: any) => item.flags[RESOLVER_MODULE_ID])).toEqual([
      { featureItemKey: 'feature-b', groupId: 'group-b' },
      { featureItemKey: 'feature-a', groupId: 'group-a' },
    ]);
    expect(actor.items.map((item: any) => item.flags.fvttJsonGenerator.spellcastingFeatureKey)).toEqual([
      'feature-b',
      'feature-a',
    ]);
  });

  it('supports a third distinct one-group Wisdom caster without name inference', () => {
    const parsed = baseParsed('Wisdom Caster');
    parsed.spellManifest = oneSpellManifest('wisdom-group', 'wisdom-feature', 'wis');
    parsed.structuredActions = { 特性: [spellcastingTrait('wisdom-feature', 'Untranslated Glyphs', 'Wisdom source group.')] };

    const actor = new ActorGenerator({ fvttVersion: '14' }).generate(parsed, { route: 'chinese' });
    expect(actor.flags[RESOLVER_MODULE_ID].spellManifest.spellcastingGroups[0].ability).toBe('wis');
    expect(actor.items[0].flags[RESOLVER_MODULE_ID].groupId).toBe('wisdom-group');
    expect(actor.items[0].flags.fvttJsonGenerator.spellcastingFeatureKey).toBe('wisdom-feature');
  });

  it.each([
    ['missing', []],
    ['duplicate', [spellcastingTrait('feature-a', 'One', 'One.'), spellcastingTrait('feature-a', 'Two', 'Two.')]],
    ['unknown', [spellcastingTrait('feature-a', 'Known', 'Known.'), spellcastingTrait('feature-extra', 'Unknown', 'Unknown.')]],
  ])('retains the Actor and reports %s source feature linkage', (_label, traits) => {
    const parsed = baseParsed();
    parsed.spellManifest = oneSpellManifest('group-a', 'feature-a');
    parsed.structuredActions = { 特性: traits };

    const actor = new ActorGenerator({ fvttVersion: '14' }).generate(parsed, { route: 'chinese' });
    expect(actor.flags.fvttJsonGenerator.candidateReview.findings.map((issue:any)=>issue.message).join('\n')).toContain('SPELL_FEATURE_LINK_'+_label.toUpperCase());
    expect(actor.flags.fvttJsonGenerator.candidateReview.proposal.unresolved.length).toBeGreaterThan(0);
    expect(actor.items.map((item:any)=>item.name)).toEqual(traits.map(item=>item.name+' '+item.englishName));
    expect(actor.items.map((item:any)=>item.system.description.value)).toEqual(traits.map(item=>'<p>'+item.describe+'</p>'));
  });

  it('retains a v12 Actor without unsupported spell placeholders and reports the target', () => {
    const parsed = baseParsed('Unsupported Caster');
    parsed.spellManifest = oneSpellManifest('group-a', 'feature-a');
    parsed.spellcasting = ['At will: Unknown Spell That Would Become A Placeholder'];

    const actor = new ActorGenerator({ fvttVersion: '12' }).generate(parsed, { route: 'chinese' });
    expect(actorGenerationDiagnostics(actor).map(issue=>issue.message).join('\n')).toContain('SPELL_MANIFEST_UNSUPPORTED_TARGET: Portable spell manifests require Foundry v14; requested v12.');
    expect(actor.name).toBe(parsed.name);
    expect(actor.items).toEqual([]);
  });

  it('retains orphaned source feature content and reports missing manifest linkage', () => {
    const parsed = baseParsed('Orphaned Link');
    parsed.structuredActions = {
      特性: [spellcastingTrait('orphaned-feature', 'Orphaned Feature', 'No manifest exists.')],
    };

    const actor = new ActorGenerator({ fvttVersion: '14' }).generate(parsed, { route: 'chinese' });
    expect(actorGenerationDiagnostics(actor).map(issue=>issue.message).join('\n')).toContain('SPELL_FEATURE_LINK_ORPHANED');
    expect(actor.items[0].system.description.value).toContain('No manifest exists.');
  });

  it.each([
    ['a legendary section', { 传奇动作: [spellcastingTrait('feature-a', 'Action Link', 'Wrong section.')] }, 'SPELL_FEATURE_LINK_INVALID_SECTION'],
    ['a special activation', {
      特性: [{
        ...spellcastingTrait('feature-a', 'Active Link', 'Wrong activation.'),
        activation: { type: 'special' as const, explicit: true },
      }],
    }, 'SPELL_FEATURE_LINK_INVALID_ACTIVATION'],
  ])('retains explicit source linkage on %s without fabricating a Cast', (_label, structuredActions, code) => {
    const parsed = baseParsed('Invalid Link');
    parsed.spellManifest = oneSpellManifest('group-a', 'feature-a');
    parsed.structuredActions = structuredActions;

    const actor = new ActorGenerator({ fvttVersion: '14' }).generate(parsed, { route: 'chinese' });
    expect(actorGenerationDiagnostics(actor)).toEqual([]);
    expect(actor.flags[RESOLVER_MODULE_ID].spellManifest).toEqual(parsed.spellManifest);
    expect(actor.items[0].flags[RESOLVER_MODULE_ID]).toMatchObject({featureItemKey:'feature-a',groupId:'group-a'});
    expect(actor.items[0].system.description.value).toContain(_label==='a legendary section'?'Wrong section.':'Wrong activation.');
    expect(Object.values<any>(actor.items[0].system.activities).some(activity=>activity.type==='cast')).toBe(false);
  });

  it('preserves and reports a target-world UUID hidden in the linked source feature description', () => {
    const parsed = baseParsed('UUID Description');
    parsed.spellManifest = oneSpellManifest('group-a', 'feature-a');
    parsed.structuredActions = {
      特性: [spellcastingTrait(
        'feature-a',
        'Source Feature',
        'Source text names Compendium.dnd5e.spells.Item.abcdefghijklmnop.',
      )],
    };

    const actor = new ActorGenerator({ fvttVersion: '14' }).generate(parsed, { route: 'chinese' });
    expect(actorGenerationDiagnostics(actor).map(issue=>issue.message).join('\n')).toMatch(/SPELL_ACTOR_FORBIDDEN_TARGET_WORLD_IDENTIFIER: .*\/items\/0\/system\/description\/value/);
    expect(actor.items[0].system.description.value).toContain(parsed.structuredActions!.特性![0]!.describe!);
  });

  it('preserves and reports a bare target-world Actor UUID hidden in generated portable Actor content', () => {
    const parsed = baseParsed('Bare Actor UUID Description');
    parsed.spellManifest = oneSpellManifest('group-a', 'feature-a');
    parsed.structuredActions = {
      特性: [spellcastingTrait(
        'feature-a',
        'Source Feature',
        'Source text names Actor.abcdefghijklmnop.',
      )],
    };

    const actor = new ActorGenerator({ fvttVersion: '14' }).generate(parsed, { route: 'chinese' });
    expect(actorGenerationDiagnostics(actor).map(issue=>issue.message).join('\n')).toMatch(/SPELL_ACTOR_FORBIDDEN_TARGET_WORLD_IDENTIFIER: .*\/items\/0\/system\/description\/value.*Actor\.abcdefghijklmnop/);
    expect(actor.items[0].system.description.value).toContain(parsed.structuredActions!.特性![0]!.describe!);
  });

  it('does not reject ordinary item and compendium prose in a linked source feature', () => {
    const parsed = baseParsed('Ordinary Prose');
    parsed.spellManifest = oneSpellManifest('group-a', 'feature-a');
    parsed.structuredActions = {
      特性: [spellcastingTrait('feature-a', 'Source Feature', 'This item appears in a compendium index.')],
    };

    const actor = new ActorGenerator({ fvttVersion: '14' }).generate(parsed, { route: 'chinese' });
    expect(actor.items[0].system.description.value).toContain('item appears in a compendium');
  });

  it('does not scan a no-manifest legacy Actor for target-world identifier text', () => {
    const parsed = baseParsed('Legacy UUID Prose');
    parsed.structuredActions = {
      特性: [{
        name: 'Legacy Reference',
        type: 'utility',
        describe: 'Legacy text names Compendium.dnd5e.spells.Item.abcdefghijklmnop.',
      }],
    };

    const actor = new ActorGenerator({ fvttVersion: '14' }).generate(parsed, { route: 'chinese' });
    expect(actor.items[0].system.description.value).toContain('Compendium.dnd5e.spells.Item.abcdefghijklmnop');
    expect(actor.flags?.[RESOLVER_MODULE_ID]).toBeUndefined();
  });

  it('preserves legacy no-manifest v12/v14 behavior and an unrelated actor', () => {
    const legacy = baseParsed('Legacy Caster');
    legacy.spellcasting = ['At will: Unknown Legacy Spell'];
    const v12 = new ActorGenerator({ fvttVersion: '12' }).generate(legacy, { route: 'chinese' });
    const v14 = new ActorGenerator({ fvttVersion: '14' }).generate(legacy, { route: 'chinese' });
    expect(v12.flags?.[RESOLVER_MODULE_ID]).toBeUndefined();
    expect(v14.flags?.[RESOLVER_MODULE_ID]).toBeUndefined();
    expect(v12.items.some((item: any) => item.type === 'spell')).toBe(true);
    expect(v14.items.some((item: any) => item.type === 'spell')).toBe(true);

    const lurker = baseParsed('Lurker');
    lurker.structuredActions = { 特性: [{ name: 'False Appearance', type: 'utility', describe: 'The lurker is indistinguishable from stone.' }] };
    const before = new ActorGenerator({ fvttVersion: '14' }).generate(lurker, { route: 'chinese' });
    const after = new ActorGenerator({ fvttVersion: '14' }).generate(structuredClone(lurker), { route: 'chinese' });
    assertEqualStructure(after, before);
    expect(after.flags?.[RESOLVER_MODULE_ID]).toBeUndefined();
  });

  it('matches the checked v14 structural fixture', () => {
    const markdown = readFileSync('src/core/parser/__tests__/fixtures/yaml-spell-manifest.md', 'utf-8');
    const parsed = new YamlParser().parse(markdown);
    const actor = new ActorGenerator({ fvttVersion: '14' }).generate(parsed, { route: 'chinese' });

    assertEqualStructure({
      actorFlags: actor.flags[RESOLVER_MODULE_ID],
      items: actor.items.map((item: any) => ({
        name: item.name,
        type: item.type,
        resolver: item.flags?.[RESOLVER_MODULE_ID],
        generatorKey: item.flags?.fvttJsonGenerator?.spellcastingFeatureKey,
      })),
    }, {
      actorFlags: {
        spellManifest: parsed.spellManifest,
        spellResolution: { status: 'pending', manifestHash: hashManifest(parsed.spellManifest!) },
      },
      items: [
        { name: 'Arcane Ward', type: 'feat', resolver: undefined, generatorKey: undefined },
        {
          name: 'Innate Magic',
          type: 'feat',
          resolver: { featureItemKey: 'innate-wisdom-feature', groupId: 'innate-wisdom' },
          generatorKey: 'innate-wisdom-feature',
        },
      ],
    });
  });
});

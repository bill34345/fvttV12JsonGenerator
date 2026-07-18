import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { renderMonsterIntakeMarkdown } from '../renderer';
import { validateMonsterIntakeIR } from '../validator';
import { buildRatWarlockIr, RAT_WARLOCK_SOURCE, ratEvidence } from './fixtures/rat-warlock';

const EXPECTED_GROUPS = [
  { usage: 'at-will', spells: ['eldritch-blast', 'mage-armor', 'minor-illusion', 'thaumaturgy'] },
  { usage: '1/day-each', spells: ['augury', 'burning-hands', 'conjure-animals', 'faerie-fire', 'invisibility', 'misty-step'] },
];

describe('source-evidenced spellcasting intake', () => {
  test('represents Rat Warlock spellcasting facts and exact evidence', () => {
    const ir = buildRatWarlockIr();
    const group = (ir.creature as any).spellcasting[0];

    expect(group.ability).toBe('cha');
    expect(group.saveDc).toBe(12);
    expect(group.attackBonus).toBe(4);
    expect(group.componentWaivers).toEqual([{ component: 'material', evidence: [ratEvidence('无需材料成分')] }]);
    expect(group.usageGroups.map((usage: any) => ({
      usage: usage.usage,
      spells: usage.spellRefs.map((ref: any) => ref.identifier),
    }))).toEqual(EXPECTED_GROUPS);

    const refs = group.usageGroups.flatMap((usage: any) => usage.spellRefs);
    expect(refs.filter((ref: any) => ref.restrictions.length > 0).map((ref: any) => [
      ref.identifier,
      ref.restrictions[0].text,
    ])).toEqual([
      ['eldritch-blast', '2条射线'],
      ['mage-armor', '仅自身'],
      ['conjure-animals', '仅限巨鼠Giant Rat'],
    ]);
    for (const ref of refs) expectExactEvidence(ref.evidence);
    for (const restriction of refs.flatMap((ref: any) => ref.restrictions)) expectExactEvidence(restriction.evidence);
    expectExactEvidence(group.saveDcEvidence);
    expectExactEvidence(group.attackBonusEvidence);
    expectExactEvidence(group.componentWaivers[0].evidence);
    for (const usage of group.usageGroups) {
      expect(usage.evidence[0].quote).toContain(usage.usage === 'at-will' ? '魔能爆eldritch blast' : '卜筮术augury');
      for (const ref of usage.spellRefs) {
        expect(usage.evidence.some((grant: any) => ref.evidence.every((item: any) => containedBy(item, grant)))).toBe(true);
        for (const restriction of ref.restrictions) {
          expect(usage.evidence.some((grant: any) => restriction.evidence.every((item: any) => containedBy(item, grant)))).toBe(true);
        }
      }
    }
    const mageArmor = refs.find((ref: any) => ref.identifier === 'mage-armor');
    expect(mageArmor.evidence[0].start).toBeGreaterThan(RAT_WARLOCK_SOURCE.indexOf('随意：'));
  });

  test('partitions Rat lore as narrative and the statblock as mechanical exactly once', () => {
    const ir = buildRatWarlockIr();
    expect(ir.coverage).toHaveLength(2);
    expect(ir.coverage.map((entry) => entry.classification)).toEqual(['narrative', 'mechanical']);
    expect(ir.coverage.map((entry) => entry.quote).join('')).toBe(RAT_WARLOCK_SOURCE);
    expect(ir.coverage[0]!.quote).toContain('许多鼠怪都崇拜着');
    expect(ir.coverage[0]!.claimPaths).toEqual([]);
    expect(ir.coverage[1]!.quote.startsWith('鼠神邪术师 Warlock of the Rat God')).toBe(true);
    expect(ir.coverage[1]!.claimPaths).toContain('/creature/spellcasting/0');
  });

  test('validates and renders a deterministic portable Markdown contract', () => {
    const ir = buildRatWarlockIr();
    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking).toEqual([]);

    const first = renderMonsterIntakeMarkdown(ir);
    const second = renderMonsterIntakeMarkdown(structuredClone(ir));
    const parsed = yaml.load(first.slice(4, -4)) as Record<string, any>;
    const manifest = parsed.法术清单;
    const group = manifest.spellcastingGroups[0];

    expect(second).toBe(first);
    expect(manifest).toMatchObject({ schemaVersion: 1, rulesPreference: '2024' });
    expect(group).toMatchObject({ groupId: 'innate-charisma', featureItemKey: 'innate-charisma', ability: 'cha', saveDc: 12, attackBonus: 4 });
    expect(group.spellRefs).toHaveLength(10);
    expect(group.spellRefs.slice(0, 4).every((ref: any) => ref.method === 'at-will' && ref.uses === undefined)).toBe(true);
    expect(group.spellRefs.slice(4).every((ref: any) => ref.method === 'innate'
      && ref.uses?.value === 1 && ref.uses?.recovery === 'day' && ref.uses?.shared === false)).toBe(true);
    expect(group.spellRefs.every((ref: any) => ref.ignoresMaterialComponents === true)).toBe(true);
    expect(first).toContain('天生施法Innate Spellcasting');
    expect(first).not.toMatch(/expectedLevel|expectedSchool|sourceBookHint|castingLevel|uuid|damage|effects/i);
  });

  test('derives stable manifest IDs that distinguish creatures and groups in one source', () => {
    const first = buildRatWarlockIr();
    const secondCreature = structuredClone(first);
    secondCreature.creature.identity.name = '第二位邪术师';
    secondCreature.creature.identity.englishName = 'Second Rat Warlock';
    const secondGroup = structuredClone(first);
    secondGroup.creature.spellcasting![0]!.groupId = 'pact-charisma';

    const manifestId = (ir: typeof first) => {
      const markdown = renderMonsterIntakeMarkdown(ir);
      return (yaml.load(markdown.slice(4, -4)) as Record<string, any>).法术清单.manifestId;
    };

    expect(manifestId(first)).toBe(manifestId(structuredClone(first)));
    expect(manifestId(secondCreature)).not.toBe(manifestId(first));
    expect(manifestId(secondGroup)).not.toBe(manifestId(first));
  });

  test('blocks a lore-only spell mention that is not explicitly granted', () => {
    const source = '传说这只鼠怪见过迷踪步misty step。';
    const ir = buildRatWarlockIr() as any;
    ir.source = { sha256: '', length: source.length };
    ir.creature.spellcasting[0].usageGroups = [{
      usage: 'at-will',
      evidence: [{ start: 0, end: source.length, quote: source }],
      spellRefs: [{
        refId: 'misty-step', identifier: 'misty-step', originalName: '迷踪步misty step', englishName: 'misty step', chineseName: '迷踪步', aliases: [], restrictions: [],
        evidence: [{ start: source.indexOf('迷踪步'), end: source.indexOf('迷踪步') + '迷踪步misty step'.length, quote: '迷踪步misty step' }],
      }],
    }];
    ir.claims = [];
    ir.coverage = [];

    expect(validateMonsterIntakeIR(source, ir).blocking.map((finding) => finding.code)).toContain('SPELL_NOT_EXPLICITLY_GRANTED');
  });

  test('blocks a granted-list ref whose evidence points only to an earlier non-grant mention', () => {
    const ir = buildRatWarlockIr() as any;
    const atWillLine = '随意：魔能爆eldritch blast（2条射线），法师护甲mage armor（仅自身），次级幻象minor illusion，奇术thaumaturgy';
    ir.creature.spellcasting[0].usageGroups[0].evidence = [ratEvidence(atWillLine)];
    ir.creature.spellcasting[0].usageGroups[0].spellRefs[1].evidence = [ratEvidence('法师护甲mage armor', 0)];

    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'SPELL_EVIDENCE_OUTSIDE_GRANT',
      path: '/creature/spellcasting/0/usageGroups/0/spellRefs/1/evidence',
    }));
  });

  test('blocks a whole-source grant span that swallows an earlier non-grant mention', () => {
    const ir = buildRatWarlockIr() as any;
    const usage = ir.creature.spellcasting[0].usageGroups[0];
    usage.evidence = [{ start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE }];
    usage.spellRefs[1].evidence = [ratEvidence('法师护甲mage armor', 0)];

    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'INVALID_SPELL_GRANT_SPAN',
      path: '/creature/spellcasting/0/usageGroups/0/evidence/0',
    }));
  });

  test('blocks a grant span that starts at the label but swallows later unrelated text', () => {
    const ir = buildRatWarlockIr() as any;
    const usage = ir.creature.spellcasting[0].usageGroups[0];
    const start = usage.evidence[0].start;
    usage.evidence = [{ start, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE.slice(start) }];

    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'INVALID_SPELL_GRANT_SPAN',
      path: '/creature/spellcasting/0/usageGroups/0/evidence/0',
    }));
  });

  test('blocks an extra usage evidence ref that is not a self-contained grant for that group', () => {
    const ir = buildRatWarlockIr() as any;
    const usage = ir.creature.spellcasting[0].usageGroups[0];
    usage.evidence.push(ir.creature.spellcasting[0].usageGroups[1].evidence[0]);

    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'INVALID_SPELL_GRANT_SPAN',
      path: '/creature/spellcasting/0/usageGroups/0/evidence/1',
    }));
  });

  test('blocks a grant span that contains every spell but omits the source usage label', () => {
    const ir = buildRatWarlockIr() as any;
    const usage = ir.creature.spellcasting[0].usageGroups[0];
    const fullGrant = usage.evidence[0];
    const start = fullGrant.start + '随意：'.length;
    usage.evidence = [{
      start,
      end: fullGrant.end,
      quote: RAT_WARLOCK_SOURCE.slice(start, fullGrant.end),
    }];

    const findings = validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking;
    expect(findings).toContainEqual(expect.objectContaining({
      code: 'SPELL_NOT_EXPLICITLY_GRANTED',
      path: '/creature/spellcasting/0/usageGroups/0',
    }));
    expect(findings.map((finding) => finding.code)).not.toContain('SPELL_EVIDENCE_OUTSIDE_GRANT');
  });

  test('accepts a generalized multiline English At Will grant with Markdown list markers', () => {
    const ir = buildRatWarlockIr() as any;
    const usage = ir.creature.spellcasting[0].usageGroups[0];
    const englishLine = `**At Will:**\n${usage.spellRefs.map((ref: any, index: number) => {
      const restriction = ref.restrictions[0]?.text;
      const conjunction = index === usage.spellRefs.length - 1 ? 'and ' : '';
      return `- ${conjunction}${ref.originalName}${restriction ? `（${restriction}）` : ''}`;
    }).join('\n')}`;
    const source = `${RAT_WARLOCK_SOURCE}\n${englishLine}`;
    const start = source.length - englishLine.length;
    usage.evidence = [{ start, end: source.length, quote: englishLine }];
    for (const ref of usage.spellRefs) {
      const refStart = source.indexOf(ref.originalName, start);
      ref.evidence = [{ start: refStart, end: refStart + ref.originalName.length, quote: ref.originalName }];
      for (const restriction of ref.restrictions) {
        const restrictionStart = source.indexOf(restriction.text, refStart);
        restriction.evidence = [{
          start: restrictionStart,
          end: restrictionStart + restriction.text.length,
          quote: restriction.text,
        }];
      }
    }
    ir.source = { sha256: createHash('sha256').update(source).digest('hex'), length: source.length };
    const mechanical = ir.coverage.find((entry: any) => entry.classification === 'mechanical');
    mechanical.end = source.length;
    mechanical.quote = source.slice(mechanical.start);

    expect(validateMonsterIntakeIR(source, ir).blocking).toEqual([]);
  });

  test.each([
    '伪造：造成8d6火焰伤害。',
    '伪造目标：Compendium.dnd5e.spells.Item.abcdefghijklmnop',
    '伪造 effects 与 rules text。',
  ])('blocks a visible spellcasting description not exactly backed by group evidence: %s', (fabrication) => {
    const ir = buildRatWarlockIr() as any;
    ir.creature.spellcasting[0].description += fabrication;

    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'UNSUPPORTED_SPELLCASTING_DESCRIPTION',
      path: '/creature/spellcasting/0/description',
    }));
  });

  test('blocks duplicated structured spellcasting as an ordinary trait', () => {
    const ir = buildRatWarlockIr() as any;
    ir.creature.traits.unshift({
      name: '天生施法',
      englishName: 'Innate Spellcasting',
      description: ir.creature.spellcasting[0].description,
    });

    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking.map((finding) => finding.code)).toContain('DUPLICATE_STRUCTURED_SPELLCASTING');
  });

  test('blocks renamed ordinary-trait duplication with the same sourced description', () => {
    const ir = buildRatWarlockIr() as any;
    ir.creature.traits.unshift({
      name: '契约奥秘',
      englishName: 'Pact Mystery',
      description: ir.creature.spellcasting[0].description,
    });

    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'DUPLICATE_STRUCTURED_SPELLCASTING',
      path: '/creature/traits/0',
    }));
  });

  test('blocks unsupported ambiguous shared daily uses', () => {
    const ir = buildRatWarlockIr() as any;
    ir.creature.spellcasting[0].usageGroups[1].usage = '1/day-shared';

    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking.map((finding) => finding.code)).toContain('INVALID_SPELL_USE_GROUP');
  });

  test('blocks missing spell evidence and mechanical spellcasting coverage', () => {
    const ir = buildRatWarlockIr() as any;
    ir.creature.spellcasting[0].usageGroups[0].spellRefs[0].evidence = [];
    const mechanical = ir.coverage.find((entry: any) => entry.classification === 'mechanical');
    mechanical.claimPaths = mechanical.claimPaths.filter((path: string) => path !== '/creature/spellcasting/0');

    const codes = validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking.map((finding) => finding.code);
    expect(codes).toContain('MISSING_EVIDENCE');
    expect(codes).toContain('UNCOVERED_SPELLCASTING_MECHANIC');
  });

  test.each(['expectedLevel', 'expectedSchool', 'sourceBookHint', 'uuid', 'rulesText', 'damage', 'effects'])(
    'blocks destination or fabricated spell field %s in source IR',
    (field) => {
      const ir = buildRatWarlockIr() as any;
      ir.creature.spellcasting[0].usageGroups[0].spellRefs[0][field] = field === 'expectedLevel' ? 0 : 'invented';

      expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking).toContainEqual(expect.objectContaining({
        code: 'UNSUPPORTED_SOURCE_SPELL_FIELD',
        path: `/creature/spellcasting/0/usageGroups/0/spellRefs/0/${field}`,
      }));
    },
  );

  test('blocks spellcasting schema and call-budget extensions from untrusted source data', () => {
    const ir = buildRatWarlockIr() as any;
    const group = ir.creature.spellcasting[0];
    group.callBudget = 99;
    group.usageGroups[0].shared = true;
    group.componentWaivers[0].components = ['material'];
    group.usageGroups[0].spellRefs[0].restrictions[0].uuid = 'Compendium.fake';

    const findings = validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking;
    expect(findings).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_SPELLCASTING_PROPERTY', path: '/creature/spellcasting/0/callBudget' }));
    expect(findings).toContainEqual(expect.objectContaining({ code: 'INVALID_SPELL_USE_GROUP', path: '/creature/spellcasting/0/usageGroups/0/shared' }));
    expect(findings).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_SPELLCASTING_PROPERTY', path: '/creature/spellcasting/0/componentWaivers/0/components' }));
    expect(findings).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_SPELLCASTING_PROPERTY', path: '/creature/spellcasting/0/usageGroups/0/spellRefs/0/restrictions/0/uuid' }));
  });

  test('fails closed instead of throwing on malformed spellcasting envelope fields', () => {
    const ir = buildRatWarlockIr() as any;
    delete ir.source;
    delete ir.creature.traits;
    ir.creature.spellcasting[0].usageGroups[0].evidence = [null];

    expect(() => validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir)).not.toThrow();
    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking.length).toBeGreaterThan(0);
  });

  test('fails closed when the structured spellcasting claim has malformed evidence', () => {
    const ir = buildRatWarlockIr() as any;
    ir.claims.find((claim: any) => claim.path === '/creature/spellcasting/0').evidence = null;
    ir.claims.unshift(null);

    expect(() => validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir)).not.toThrow();
    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'MISSING_EVIDENCE',
    }));
  });

  test.each([
    {
      label: 'null creature',
      mutate: (ir: any) => { ir.creature = null; },
      code: 'MISSING_CREATURE',
      path: '/creature',
    },
    {
      label: 'null trait entry',
      mutate: (ir: any) => { ir.creature.traits = [null]; },
      code: 'MISSING_FEATURE_NAME',
      path: '/creature/traits/0/name',
    },
    {
      label: 'null coverage entry',
      mutate: (ir: any) => { ir.coverage = [null]; },
      code: 'EVIDENCE_OUT_OF_RANGE',
      path: '/coverage/0',
    },
    {
      label: 'null spellcasting group evidence',
      mutate: (ir: any) => { ir.creature.spellcasting[0].evidence = [null]; },
      code: 'EVIDENCE_OUT_OF_RANGE',
      path: '/creature/spellcasting/0/evidence/0',
    },
    {
      label: 'object spellcasting description',
      mutate: (ir: any) => { ir.creature.spellcasting[0].description = {}; },
      code: 'MISSING_FEATURE_DESCRIPTION',
      path: '/creature/spellcasting/0/description',
    },
    {
      label: 'object spellcasting section',
      mutate: (ir: any) => { ir.creature.spellcasting = {}; },
      code: 'INVALID_SPELLCASTING_GROUPS',
      path: '/creature/spellcasting',
    },
    {
      label: 'object traits section',
      mutate: (ir: any) => { ir.creature.traits = {}; },
      code: 'INVALID_FEATURE_SECTION',
      path: '/creature/traits',
    },
    {
      label: 'object actions section',
      mutate: (ir: any) => { ir.creature.actions = {}; },
      code: 'INVALID_FEATURE_SECTION',
      path: '/creature/actions',
    },
  ])('fails closed with an exact finding for $label', ({ mutate, code, path }) => {
    const ir = buildRatWarlockIr() as any;
    mutate(ir);

    expect(() => validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir)).not.toThrow();
    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking).toContainEqual(expect.objectContaining({ code, path }));
  });
});

function expectExactEvidence(evidence: Array<{ start: number; end: number; quote: string }>): void {
  expect(evidence.length).toBeGreaterThan(0);
  for (const ref of evidence) expect(RAT_WARLOCK_SOURCE.slice(ref.start, ref.end)).toBe(ref.quote);
}

function containedBy(
  child: { start: number; end: number },
  parent: { start: number; end: number },
): boolean {
  return child.start >= parent.start && child.end <= parent.end;
}

import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { convertMarkdownContentToJson } from '../../workflow/singleFileConversion';
import { anchorIrEvidence } from '../orchestrator';
import { renderMonsterIntakeMarkdown, renderPreparedSpellcastingProfile } from '../renderer';
import { verifyMonsterIntake } from '../verifier';
import { validateMonsterIntakeIR } from '../validator';
import { buildRatWarlockIr, RAT_WARLOCK_SOURCE, ratEvidence } from './fixtures/rat-warlock';
import { buildValidLurkerIr, LURKER_SOURCE } from './fixtures/lurker';

const EXPECTED_GROUPS = [
  { usage: 'at-will', spells: ['eldritch-blast', 'mage-armor', 'minor-illusion', 'thaumaturgy'] },
  { usage: '1/day-each', spells: ['augury', 'burning-hands', 'conjure-animals', 'faerie-fire', 'invisibility', 'misty-step'] },
];

describe('source-evidenced spellcasting intake', () => {
  test('accepts a source-evidenced level-5 prepared caster with cantrips and 4/3/2 slots', () => {
    const { source, ir } = buildPreparedCasterCase();

    expect(validateMonsterIntakeIR(source, ir).blocking).toEqual([]);
    expect((ir as any).creature.spellcasting[0]).toMatchObject({
      ability: 'wis',
      casterLevel: 5,
      usageGroups: [
        { usage: 'prepared-cantrip' },
        { usage: 'prepared-slots', level: 1, slots: 4 },
        { usage: 'prepared-slots', level: 2, slots: 3 },
        { usage: 'prepared-slots', level: 3, slots: 2 },
      ],
    });
  });

  test('merges compatible prepared groups and fails closed on conflicting native Actor profiles', () => {
    const { source, ir } = buildPreparedCasterCase();
    const first = ir.creature.spellcasting![0]!;
    const second = structuredClone(first);
    first.usageGroups = first.usageGroups.slice(0, 2);
    second.groupId = 'prepared-wisdom-secondary';
    second.featureName = 'Secondary Spellcasting';
    second.usageGroups = second.usageGroups.slice(2);
    ir.creature.spellcasting!.push(second);

    expect(renderPreparedSpellcastingProfile(ir.creature)).toEqual({
      ability: 'wis', casterLevel: 5, slots: { 1: 4, 2: 3, 3: 2 },
    });

    for (const [label, mutate, expectedCode] of [
      ['ability', (group: any) => { group.ability = 'cha'; }, 'CONFLICTING_PREPARED_SPELLCASTING_PROFILE'],
      ['caster level', (group: any) => { group.casterLevel = 6; }, 'CONFLICTING_PREPARED_SPELLCASTING_PROFILE'],
      ['same-level slots', (group: any) => {
        group.usageGroups = [structuredClone(first.usageGroups[1])];
        group.usageGroups[0].slots = 3;
      }, 'CONFLICTING_PREPARED_SPELL_SLOTS'],
    ] as const) {
      const conflicted = structuredClone(ir);
      mutate(conflicted.creature.spellcasting![1]);
      expect(() => renderPreparedSpellcastingProfile(conflicted.creature), label).toThrow();
      expect(validateMonsterIntakeIR(source, conflicted).findings, label).toContainEqual(expect.objectContaining({ code: expectedCode }));
    }
  });

  test('expands bare prepared-slot numbers to the unique source-explicit level and slot labels', () => {
    const { source, ir } = buildPreparedCasterCase();
    const usage = ir.creature.spellcasting![0]!.usageGroups[1] as any;
    const levelStart = source.indexOf('1st level', usage.evidence[0].start);
    const slotStart = source.indexOf('4 slots', usage.evidence[0].start);
    usage.levelEvidence = [{ start: levelStart, end: levelStart + 1, quote: '1' }];
    usage.slotsEvidence = [{ start: slotStart, end: slotStart + 1, quote: '4' }];

    const anchored = anchorIrEvidence(source, {
      id: 'prepared-caster', label: 'Prepared Caster', start: 0, end: source.length, quote: source,
    }, ir);
    const anchoredUsage = anchored.creature.spellcasting![0]!.usageGroups[1] as any;

    expect(anchoredUsage.levelEvidence[0].quote).toBe('1st level');
    expect(anchoredUsage.slotsEvidence[0].quote).toBe('4 slots');
    expect(validateMonsterIntakeIR(source, anchored).blocking).toEqual([]);
  });

  test('renders prepared spellcasting through standard Markdown into native v14 Actor slots and a pending manifest', async () => {
    const { source, ir } = buildPreparedCasterCase();
    const markdown = renderMonsterIntakeMarkdown(ir);
    const frontmatter = yaml.load(markdown.slice(4, markdown.lastIndexOf('---'))) as any;

    expect(frontmatter.施法属性).toBe('wis');
    expect(frontmatter.施法者等级).toBe(5);
    expect(frontmatter.法术位).toEqual({ 1: 4, 2: 3, 3: 2 });
    expect(frontmatter.法术清单.spellcastingGroups[0].spellRefs.map((ref: any) => ({
      identifier: ref.identifier,
      method: ref.method,
      castingLevel: ref.castingLevel,
    }))).toEqual([
      { identifier: 'light', method: 'at-will', castingLevel: undefined },
      { identifier: 'sacred-flame', method: 'at-will', castingLevel: undefined },
      { identifier: 'spare-the-dying', method: 'at-will', castingLevel: undefined },
      { identifier: 'command', method: 'prepared', castingLevel: 1 },
      { identifier: 'cure-wounds', method: 'prepared', castingLevel: 1 },
      { identifier: 'guiding-bolt', method: 'prepared', castingLevel: 1 },
      { identifier: 'lesser-restoration', method: 'prepared', castingLevel: 2 },
      { identifier: 'spiritual-weapon', method: 'prepared', castingLevel: 2 },
      { identifier: 'dispel-magic', method: 'prepared', castingLevel: 3 },
      { identifier: 'revivify', method: 'prepared', castingLevel: 3 },
    ]);

    const generated = await convertMarkdownContentToJson({
      content: markdown,
      fvttVersion: '14',
      effectProfile: 'core',
      translationService: null,
    });
    const actor = generated.rawJson as any;
    expect(actor.system.attributes.spellcasting).toBe('wis');
    expect(actor.system.details.spellLevel).toBe(5);
    expect(actor.system.spells.spell1).toMatchObject({ value: 4, override: null });
    expect(actor.system.spells.spell2).toMatchObject({ value: 3, override: null });
    expect(actor.system.spells.spell3).toMatchObject({ value: 2, override: null });
    expect(actor.flags['fvtt-json-generator-spell-resolver'].spellResolution.status).toBe('pending');

    expect(verifyMonsterIntake(source, ir, markdown, actor).status).toBe('accepted');
    for (const [label, mutate, code, path] of [
      ['ability', (value: any) => { value.system.attributes.spellcasting = 'cha'; }, 'PREPARED_SPELLCASTING_ABILITY_DRIFT', '/actor/system/attributes/spellcasting'],
      ['caster level', (value: any) => { value.system.details.spellLevel = 6; }, 'PREPARED_SPELLCASTER_LEVEL_DRIFT', '/actor/system/details/spellLevel'],
      ['slot pool', (value: any) => { value.system.spells.spell1.value = 9; }, 'PREPARED_SPELL_SLOT_DRIFT', '/actor/system/spells/spell1/value'],
    ] as const) {
      const drifted = structuredClone(actor);
      mutate(drifted);
      expect(verifyMonsterIntake(source, ir, markdown, drifted).findings, label).toContainEqual(expect.objectContaining({ code, path }));
    }
  });

  test.each([
    {
      label: 'missing caster-level evidence',
      mutate: (ir: any) => { ir.creature.spellcasting[0].casterLevelEvidence = []; },
      code: 'SPELLCASTER_LEVEL_EVIDENCE_MISMATCH',
      path: '/creature/spellcasting/0/casterLevel',
    },
    {
      label: 'contradictory caster level',
      mutate: (ir: any) => { ir.creature.spellcasting[0].casterLevel = 6; },
      code: 'SPELLCASTER_LEVEL_EVIDENCE_MISMATCH',
      path: '/creature/spellcasting/0/casterLevel',
    },
    {
      label: 'missing slot-level evidence',
      mutate: (ir: any) => { ir.creature.spellcasting[0].usageGroups[1].levelEvidence = []; },
      code: 'SPELL_SLOT_LEVEL_EVIDENCE_MISMATCH',
      path: '/creature/spellcasting/0/usageGroups/1/level',
    },
    {
      label: 'contradictory slot level',
      mutate: (ir: any) => { ir.creature.spellcasting[0].usageGroups[1].level = 2; },
      code: 'SPELL_SLOT_LEVEL_EVIDENCE_MISMATCH',
      path: '/creature/spellcasting/0/usageGroups/1/level',
    },
    {
      label: 'missing slot-count evidence',
      mutate: (ir: any) => { ir.creature.spellcasting[0].usageGroups[1].slotsEvidence = []; },
      code: 'SPELL_SLOT_COUNT_EVIDENCE_MISMATCH',
      path: '/creature/spellcasting/0/usageGroups/1/slots',
    },
    {
      label: 'contradictory slot count',
      mutate: (ir: any) => { ir.creature.spellcasting[0].usageGroups[1].slots = 9; },
      code: 'SPELL_SLOT_COUNT_EVIDENCE_MISMATCH',
      path: '/creature/spellcasting/0/usageGroups/1/slots',
    },
  ])('blocks prepared casting with $label', ({ mutate, code, path }) => {
    const { source, ir } = buildPreparedCasterCase();
    mutate(ir);

    expect(validateMonsterIntakeIR(source, ir).blocking).toContainEqual(expect.objectContaining({ code, path }));
  });

  test.each([
    ['zero slots', (ir: any) => { ir.creature.spellcasting[0].usageGroups[1].slots = 0; }, '/creature/spellcasting/0/usageGroups/1/slots'],
    ['shared extension', (ir: any) => { ir.creature.spellcasting[0].usageGroups[1].shared = true; }, '/creature/spellcasting/0/usageGroups/1/shared'],
  ])('rejects an unsupported prepared slot pool: %s', (_label, mutate, path) => {
    const { source, ir } = buildPreparedCasterCase();
    mutate(ir);

    expect(validateMonsterIntakeIR(source, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'INVALID_SPELL_USE_GROUP',
      path,
    }));
  });

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

  test('accepts the standard Chinese 1次/每日 statblock label as independent 1/day-each uses', () => {
    const source = RAT_WARLOCK_SOURCE.replace('每项1/日', '1次/每日');
    const ir = JSON.parse(JSON.stringify(buildRatWarlockIr()).replaceAll('每项1/日', '1次/每日')) as any;
    ir.source = { sha256: createHash('sha256').update(source).digest('hex'), length: source.length };

    expect(validateMonsterIntakeIR(source, ir).blocking).toEqual([]);
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

  test.each([
    {
      label: 'spell identity',
      mutate: (ir: any) => {
        Object.assign(ir.creature.spellcasting[0].usageGroups[0].spellRefs[0], {
          refId: 'fireball', identifier: 'fireball', originalName: 'Fireball', englishName: 'Fireball',
          chineseName: '火球术', aliases: ['Fireball', '火球术'],
        });
      },
      code: 'SPELL_REF_EVIDENCE_MISMATCH',
      path: '/creature/spellcasting/0/usageGroups/0/spellRefs/0',
    },
    {
      label: 'spellcasting ability',
      mutate: (ir: any) => { ir.creature.spellcasting[0].ability = 'wis'; },
      code: 'SPELL_ABILITY_EVIDENCE_MISMATCH', path: '/creature/spellcasting/0/ability',
    },
    {
      label: 'save DC',
      mutate: (ir: any) => { ir.creature.spellcasting[0].saveDc = 99; },
      code: 'SPELL_SAVE_DC_EVIDENCE_MISMATCH', path: '/creature/spellcasting/0/saveDc',
    },
    {
      label: 'spell attack bonus',
      mutate: (ir: any) => { ir.creature.spellcasting[0].attackBonus = 99; },
      code: 'SPELL_ATTACK_BONUS_EVIDENCE_MISMATCH', path: '/creature/spellcasting/0/attackBonus',
    },
    {
      label: 'material component waiver',
      mutate: (ir: any) => {
        const group = ir.creature.spellcasting[0];
        group.description = group.description.replace(group.componentWaivers[0].evidence[0].quote, '');
        group.componentWaivers = [];
      },
      code: 'SPELL_COMPONENT_WAIVER_MISSING', path: '/creature/spellcasting/0/componentWaivers',
    },
  ])('blocks a $label claim that is not entailed by its exact source evidence', ({ mutate, code, path }) => {
    const ir = buildRatWarlockIr() as any;
    mutate(ir);

    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking).toContainEqual(expect.objectContaining({ code, path }));
  });

  test.each([
    ['施法关键属性是感知', false],
    ['关键属性是感知', true],
  ])('recognizes Chinese prepared-caster ability wording without accepting an unrelated attribute phrase: %s', (phrase, shouldBlock) => {
    const prepared = buildPreparedCasterCase();
    const source = `${prepared.source}\n${phrase}`;
    const ir = prepared.ir as any;
    const phraseStart = source.lastIndexOf(phrase);
    const group = ir.creature.spellcasting[0];
    group.description = source.slice(group.evidence[0].start);
    group.evidence = [{ start: group.evidence[0].start, end: source.length, quote: group.description }];
    group.abilityEvidence = [{ start: phraseStart, end: source.length, quote: phrase }];
    ir.source = { sha256: createHash('sha256').update(source).digest('hex'), length: source.length };
    const mechanical = ir.coverage.find((entry: any) => entry.classification === 'mechanical');
    mechanical.end = source.length;
    mechanical.quote = source.slice(mechanical.start);

    const codes = validateMonsterIntakeIR(source, ir).blocking.map((finding) => finding.code);
    expect(codes.includes('SPELL_ABILITY_EVIDENCE_MISMATCH')).toBe(shouldBlock);
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
    const { source, ir } = buildEnglishCasterCase({ multilineUsage: true });

    expect(validateMonsterIntakeIR(source, ir).blocking).toEqual([]);
  });

  test('blocks an exact usage grant from an unrelated source block outside its spellcasting group evidence', () => {
    const ir = buildRatWarlockIr() as any;
    const usage = ir.creature.spellcasting[0].usageGroups[0];
    const originalGrant = usage.evidence[0];
    const unrelated = `\n\nUnrelated feature with narrative text.\n${originalGrant.quote}`;
    const source = `${RAT_WARLOCK_SOURCE}${unrelated}`;
    const outsideStart = source.lastIndexOf(originalGrant.quote);
    const delta = outsideStart - originalGrant.start;
    usage.evidence = [{ start: outsideStart, end: outsideStart + originalGrant.quote.length, quote: originalGrant.quote }];
    for (const ref of usage.spellRefs) {
      for (const evidence of ref.evidence) {
        evidence.start += delta;
        evidence.end += delta;
      }
      for (const restriction of ref.restrictions) {
        for (const evidence of restriction.evidence) {
          evidence.start += delta;
          evidence.end += delta;
        }
      }
    }
    ir.source = { sha256: createHash('sha256').update(source).digest('hex'), length: source.length };
    ir.coverage.push({
      start: RAT_WARLOCK_SOURCE.length,
      end: source.length,
      quote: source.slice(RAT_WARLOCK_SOURCE.length),
      classification: 'narrative',
      claimPaths: [],
    });

    expect(validateMonsterIntakeIR(source, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'SPELL_USAGE_OUTSIDE_GROUP',
      path: '/creature/spellcasting/0/usageGroups/0/evidence/0',
    }));
  });

  test('accepts a non-Rat English caster with a distinct instance refId and an explicit evidenced alias', () => {
    const { source, ir } = buildEnglishCasterCase();

    expect(validateMonsterIntakeIR(source, ir).blocking).toEqual([]);
  });

  test.each([
    {
      label: 'English ability-first syntax',
      abilityClause: 'It uses Wisdom as spellcasting ability',
      materialClause: 'It requires no material components',
    },
    {
      label: 'Chinese ability-first and broad component-waiver syntax',
      abilityClause: '它使用智力作为施法属性',
      ability: 'int' as const,
      materialClause: '它无需任何材料成分',
    },
    {
      label: 'Chinese canonical ability and all-spell-component waiver syntax',
      abilityClause: '它的施法属性为感知',
      ability: 'wis' as const,
      materialClause: '它无需法术成分',
    },
    {
      label: 'Chinese source wording for material components',
      abilityClause: '它的施法属性为感知',
      ability: 'wis' as const,
      materialClause: '它无需任何构材',
    },
  ])('accepts generalized evidenced spellcasting syntax: $label', ({ abilityClause, materialClause, ability }) => {
    const { source, ir } = buildEnglishCasterCase({ abilityClause, materialClause, ability });

    expect(validateMonsterIntakeIR(source, ir).blocking).toEqual([]);
  });

  test('rejects a spoof identifier when englishName is omitted instead of treating refId as name evidence', () => {
    const { source, ir } = buildEnglishCasterCase();
    const ref = (ir as any).creature.spellcasting[0].usageGroups[0].spellRefs[0];
    delete ref.englishName;
    ref.identifier = 'fireball';
    ref.refId = 'instance-sacred-flame-1';

    expect(validateMonsterIntakeIR(source, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'SPELL_REF_EVIDENCE_MISMATCH',
      path: '/creature/spellcasting/0/usageGroups/0/spellRefs/0',
    }));
  });

  test('accepts a missing englishName only when the stable identifier is bound to the evidenced English originalName', () => {
    const { source, ir } = buildEnglishCasterCase();
    const ref = (ir as any).creature.spellcasting[0].usageGroups[0].spellRefs[0];
    delete ref.englishName;

    expect(validateMonsterIntakeIR(source, ir).blocking).toEqual([]);
  });

  test('rejects a mixed-script originalName and identifier as the fallback English identity', () => {
    const { source, ir } = buildEnglishCasterCase({ spellName: '火球 Sacred Flame' });
    const ref = (ir as any).creature.spellcasting[0].usageGroups[0].spellRefs[0];
    delete ref.englishName;
    ref.identifier = '火球-sacred-flame';

    expect(validateMonsterIntakeIR(source, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'SPELL_REF_EVIDENCE_MISMATCH',
      path: '/creature/spellcasting/0/usageGroups/0/spellRefs/0',
    }));
  });

  test('rejects a mixed-script explicit englishName and identifier even when exactly evidenced', () => {
    const { source, ir } = buildEnglishCasterCase({ spellName: '火球 Sacred Flame' });
    const ref = (ir as any).creature.spellcasting[0].usageGroups[0].spellRefs[0];
    ref.englishName = '火球 Sacred Flame';
    ref.identifier = '火球-sacred-flame';

    expect(validateMonsterIntakeIR(source, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'SPELL_REF_EVIDENCE_MISMATCH',
      path: '/creature/spellcasting/0/usageGroups/0/spellRefs/0',
    }));
  });

  test.each([
    {
      label: 'unrelated Chinese attribute use',
      abilityClause: '它使用感知进行调查，魅力才是施法属性',
      materialClause: '它无需任何材料成分',
      expectedCode: 'SPELL_ABILITY_EVIDENCE_MISMATCH',
    },
    {
      label: 'non-material component waiver',
      abilityClause: '它使用感知作为施法属性',
      materialClause: '它无需任何言语成分',
      expectedCode: 'SPELL_COMPONENT_WAIVER_EVIDENCE_MISMATCH',
    },
    {
      label: 'non-component action waiver',
      abilityClause: '它使用感知作为施法属性',
      materialClause: '它无需任何施法动作',
      expectedCode: 'SPELL_COMPONENT_WAIVER_EVIDENCE_MISMATCH',
    },
  ])('rejects close generalized syntax negative: $label', ({ abilityClause, materialClause, expectedCode }) => {
    const { source, ir } = buildEnglishCasterCase({ abilityClause, materialClause });

    expect(validateMonsterIntakeIR(source, ir).blocking).toContainEqual(expect.objectContaining({ code: expectedCode }));
  });

  test.each([
    {
      label: 'claimed Fire from evidence for Faerie Fire',
      build: () => buildEnglishCasterCase({ spellName: 'Faerie Fire', explicitAlias: 'Fey Flame' }),
      mutate: (ir: any) => Object.assign(ir.creature.spellcasting[0].usageGroups[0].spellRefs[0], {
        identifier: 'fire', originalName: 'Fire', englishName: 'Fire', aliases: [],
      }),
    },
    {
      label: 'short alias Fire from evidence for Sacred Fire',
      build: () => buildEnglishCasterCase(),
      mutate: (ir: any) => { ir.creature.spellcasting[0].usageGroups[0].spellRefs[0].aliases.push('Fire'); },
    },
    {
      label: 'punctuation-only alias whose normalized form is empty',
      build: () => buildEnglishCasterCase(),
      mutate: (ir: any) => { ir.creature.spellcasting[0].usageGroups[0].spellRefs[0].aliases.push('---'); },
    },
  ])('rejects substring or empty-normalization spell evidence: $label', ({ build, mutate }) => {
    const { source, ir } = build();
    mutate(ir);

    expect(validateMonsterIntakeIR(source, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'SPELL_REF_EVIDENCE_MISMATCH',
      path: '/creature/spellcasting/0/usageGroups/0/spellRefs/0',
    }));
  });

  test.each([
    ['ability word elsewhere', (ir: any) => { ir.creature.spellcasting[0].ability = 'cha'; }, 'SPELL_ABILITY_EVIDENCE_MISMATCH'],
    ['unrelated DC-sized number', (ir: any) => { ir.creature.spellcasting[0].saveDc = 99; }, 'SPELL_SAVE_DC_EVIDENCE_MISMATCH'],
    ['unrelated signed number', (ir: any) => { ir.creature.spellcasting[0].attackBonus = 99; }, 'SPELL_ATTACK_BONUS_EVIDENCE_MISMATCH'],
  ])('rejects a close English negative based on an $label', (_label, mutate, code) => {
    const { source, ir } = buildEnglishCasterCase();
    mutate(ir);

    expect(validateMonsterIntakeIR(source, ir).blocking).toContainEqual(expect.objectContaining({ code }));
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

  test('does not misclassify incidental claim-boundary overlap as duplicated spellcasting', () => {
    const ir = buildRatWarlockIr() as any;
    const groupStart = ir.creature.spellcasting[0].evidence[0].start;
    const traitClaim = ir.claims.find((claim: any) => claim.path === '/creature/traits/0');
    traitClaim.evidence = [{
      start: groupStart - 8,
      end: groupStart + 8,
      quote: RAT_WARLOCK_SOURCE.slice(groupStart - 8, groupStart + 8),
    }];

    expect(validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking).not.toContainEqual(expect.objectContaining({
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

  test('rejects provider-style literal and literalValue restriction aliases instead of normalizing them', () => {
    const ir = buildRatWarlockIr() as any;
    const restriction = ir.creature.spellcasting[0].usageGroups[0].spellRefs[0].restrictions[0];
    restriction.literal = restriction.text;
    restriction.literalValue = restriction.text;

    const findings = validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir).blocking;
    expect(findings).toContainEqual(expect.objectContaining({
      code: 'UNKNOWN_SPELLCASTING_PROPERTY',
      path: '/creature/spellcasting/0/usageGroups/0/spellRefs/0/restrictions/0/literal',
    }));
    expect(findings).toContainEqual(expect.objectContaining({
      code: 'UNKNOWN_SPELLCASTING_PROPERTY',
      path: '/creature/spellcasting/0/usageGroups/0/spellRefs/0/restrictions/0/literalValue',
    }));
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

function buildEnglishCasterCase(
  options: {
    spellName?: string;
    explicitAlias?: string;
    abilityClause?: string;
    materialClause?: string;
    ability?: 'wis' | 'int';
    multilineUsage?: boolean;
  } = {},
): { source: string; ir: ReturnType<typeof buildValidLurkerIr> } {
  const spellName = options.spellName ?? 'Sacred Flame';
  const explicitAlias = options.explicitAlias ?? 'Sacred Fire';
  const identifier = spellName.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
  const spellGrant = `${spellName} (alias: "${explicitAlias}")`;
  const abilityClause = options.abilityClause ?? 'Its spellcasting ability is Wisdom';
  const materialClause = options.materialClause ?? 'It requires no material components';
  const usageGrant = options.multilineUsage
    ? `**At Will:**\n- ${spellGrant}`
    : `At Will: ${spellGrant}`;
  const description = `Innate Spellcasting. Its lore records +99 and trap DC 99; Charisma appears only in its lore. ${abilityClause} (spell save DC 13, +5 to hit with spell attacks). ${materialClause}.\n${usageGrant}`;
  const source = `${LURKER_SOURCE}\n${description}`;
  const ir = buildValidLurkerIr() as any;
  const start = source.length - description.length;
  const evidence = (quote: string) => {
    const quoteStart = source.indexOf(quote, start);
    return { start: quoteStart, end: quoteStart + quote.length, quote };
  };
  ir.source = { sha256: createHash('sha256').update(source).digest('hex'), length: source.length };
  ir.creature.spellcasting = [{
    groupId: 'innate-wisdom', featureName: 'Innate Spellcasting', description,
    evidence: [{ start, end: source.length, quote: description }],
    ability: options.ability ?? 'wis', abilityEvidence: [evidence(abilityClause)],
    saveDc: 13, saveDcEvidence: [evidence('spell save DC 13')],
    attackBonus: 5, attackBonusEvidence: [evidence('+5 to hit with spell attacks')],
    componentWaivers: [{ component: 'material', evidence: [evidence(materialClause)] }],
    usageGroups: [{
      usage: 'at-will', evidence: [evidence(usageGrant)],
      spellRefs: [{
        refId: `instance-${identifier}-1`, identifier, originalName: spellName,
        englishName: spellName, aliases: [spellName, explicitAlias],
        restrictions: [], evidence: [evidence(spellGrant)],
      }],
    }],
  }];
  ir.claims.push({
    path: '/creature/spellcasting/0', valueKind: 'explicit', confidence: 'high',
    evidence: [{ start, end: source.length, quote: description }],
  });
  const mechanical = ir.coverage.find((entry: any) => entry.classification === 'mechanical');
  mechanical.end = source.length;
  mechanical.quote = source.slice(mechanical.start);
  mechanical.claimPaths.push('/creature/spellcasting/0');
  return { source, ir };
}

function buildPreparedCasterCase(): { source: string; ir: ReturnType<typeof buildValidLurkerIr> } {
  const description = [
    'Spellcasting. The priest is a 5th-level spellcaster. Its spellcasting ability is Wisdom (spell save DC 13, +5 to hit with spell attacks). The priest has the following cleric spells prepared:',
    'Cantrips (at will): light, sacred flame, spare the dying',
    '1st level (4 slots): command, cure wounds, guiding bolt',
    '2nd level (3 slots): lesser restoration, spiritual weapon',
    '3rd level (2 slots): dispel magic, revivify',
  ].join('\n');
  const source = `${LURKER_SOURCE}\n${description}`;
  const ir = buildValidLurkerIr() as any;
  const start = source.length - description.length;
  const evidence = (quote: string) => {
    const quoteStart = source.indexOf(quote, start);
    return { start: quoteStart, end: quoteStart + quote.length, quote };
  };
  const spellRef = (name: string) => ({
    refId: `prepared-${name.replace(/\s+/gu, '-')}`,
    identifier: name.replace(/\s+/gu, '-'),
    originalName: name,
    englishName: name,
    aliases: [],
    restrictions: [],
    evidence: [evidence(name)],
  });
  const preparedSlots = (level: number, slots: number, names: string[]) => {
    const ordinal = level === 1 ? '1st' : level === 2 ? '2nd' : '3rd';
    const grant = `${ordinal} level (${slots} slots): ${names.join(', ')}`;
    return {
      usage: 'prepared-slots',
      level,
      levelEvidence: [evidence(`${ordinal} level (${slots} slots)`)],
      slots,
      slotsEvidence: [evidence(`${ordinal} level (${slots} slots)`)],
      evidence: [evidence(grant)],
      spellRefs: names.map(spellRef),
    };
  };
  const cantripGrant = 'Cantrips (at will): light, sacred flame, spare the dying';
  ir.source = { sha256: createHash('sha256').update(source).digest('hex'), length: source.length };
  ir.creature.spellcasting = [{
    groupId: 'prepared-wisdom',
    featureName: 'Spellcasting',
    description,
    evidence: [{ start, end: source.length, quote: description }],
    ability: 'wis',
    abilityEvidence: [evidence('Its spellcasting ability is Wisdom')],
    casterLevel: 5,
    casterLevelEvidence: [evidence('The priest is a 5th-level spellcaster')],
    saveDc: 13,
    saveDcEvidence: [evidence('spell save DC 13')],
    attackBonus: 5,
    attackBonusEvidence: [evidence('+5 to hit with spell attacks')],
    componentWaivers: [],
    usageGroups: [{
      usage: 'prepared-cantrip',
      evidence: [evidence(cantripGrant)],
      spellRefs: ['light', 'sacred flame', 'spare the dying'].map(spellRef),
    },
    preparedSlots(1, 4, ['command', 'cure wounds', 'guiding bolt']),
    preparedSlots(2, 3, ['lesser restoration', 'spiritual weapon']),
    preparedSlots(3, 2, ['dispel magic', 'revivify'])],
  }];
  ir.claims.push({
    path: '/creature/spellcasting/0', valueKind: 'explicit', confidence: 'high',
    evidence: [{ start, end: source.length, quote: description }],
  });
  const mechanical = ir.coverage.find((entry: any) => entry.classification === 'mechanical');
  mechanical.end = source.length;
  mechanical.quote = source.slice(mechanical.start);
  mechanical.claimPaths.push('/creature/spellcasting/0');
  return { source, ir };
}

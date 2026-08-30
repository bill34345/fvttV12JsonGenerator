import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  convertMarkdownContentToJson as convertWithPackageWorkflow,
} from '@fvtt-json-generator/workflows/single-file-conversion';
import { adjudicateReview, anchorIrEvidence, chunkSource, normalizeDiscovery, partitionDiscoveryCandidates, resumeMonsterIntake, runMonsterIntake } from '../orchestrator';
import { renderMonsterIntakeMarkdown } from '../renderer';
import type {
  AiReviewResult,
  DiscoveryRequest,
  DiscoveryResult,
  ExtractionRequest,
  MonsterIntakeAiProvider,
  MonsterIntakeIR,
  RepairRequest,
  ReviewRequest,
} from '../types';
import { buildValidLurkerIr, LURKER_SOURCE } from './fixtures/lurker';
import { buildRatWarlockIr, RAT_WARLOCK_SOURCE, ratEvidence } from './fixtures/rat-warlock';

class FakeProvider implements MonsterIntakeAiProvider {
  readonly providerName = 'fake';
  readonly extractionModel = 'fake-extract';
  readonly reviewModel = 'fake-review';
  discoveryCalls = 0;
  extractionCalls = 0;
  reviewCalls = 0;
  repairCalls = 0;
  repairRequests: RepairRequest[] = [];
  reviewVerdicts: AiReviewResult['verdict'][] = ['accepted'];

  async discover(request: DiscoveryRequest): Promise<DiscoveryResult> {
    this.discoveryCalls += 1;
    const full = LURKER_SOURCE;
    return { schemaVersion: 1, candidates: request.chunkStart === 0 ? [{ id: 'lurker', label: '暗影潜妖', start: 0, end: full.length, quote: full }] : [] };
  }
  async extract(_request: ExtractionRequest): Promise<MonsterIntakeIR> { this.extractionCalls += 1; return buildValidLurkerIr(); }
  async review(_request: ReviewRequest): Promise<AiReviewResult> {
    const verdict = this.reviewVerdicts[Math.min(this.reviewCalls, this.reviewVerdicts.length - 1)]!;
    this.reviewCalls += 1;
    return { schemaVersion: 1, verdict, findings: verdict === 'accepted' ? [] : [{ id: 'review-revise', code: 'REVIEW_REVISE', path: '/creature', message: 'revise', blocking: true, origin: 'ai-review' }] };
  }
  async repair(request: RepairRequest): Promise<MonsterIntakeIR> {
    this.repairCalls += 1;
    this.repairRequests.push(request);
    return buildValidLurkerIr();
  }
}

class RatWarlockProvider implements MonsterIntakeAiProvider {
  readonly providerName = 'fake';
  readonly extractionModel = 'fake-extract';
  readonly reviewModel = 'fake-review';
  reviewVerdict: AiReviewResult['verdict'] = 'accepted';
  async discover(): Promise<DiscoveryResult> {
    return {
      schemaVersion: 1,
      candidates: [{ id: 'rat-warlock', label: 'Warlock of the Rat God', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE }],
    };
  }
  async extract(): Promise<MonsterIntakeIR> { return buildRatWarlockIr(); }
  async review(): Promise<AiReviewResult> {
    return {
      schemaVersion: 1,
      verdict: this.reviewVerdict,
      findings: this.reviewVerdict === 'accepted' ? [] : [{
        id: 'biography-review', code: 'BIOGRAPHY_REVIEW', path: '/creature/biography',
        message: 'Biography wording needs review.', blocking: true, origin: 'ai-review',
      }],
    };
  }
  async repair(): Promise<MonsterIntakeIR> { return buildRatWarlockIr(); }
}

function roots() {
  const root = mkdtempSync(join(tmpdir(), 'monster-intake-'));
  return { runRoot: join(root, 'runs'), vaultPath: join(root, 'vault') };
}

function buildDeterministicallyInvalidLurkerIr(): MonsterIntakeIR {
  const ir = buildValidLurkerIr();
  ir.claims = ir.claims.filter((claim) => claim.path !== '/creature/attributes/ac');
  return ir;
}

function structuredSpellcastingEvidence(ir: MonsterIntakeIR): Array<{
  category: 'group' | 'ability' | 'saveDc' | 'attackBonus' | 'componentWaiver' | 'usageGrant' | 'spellRef' | 'restriction';
  ref: { start: number; end: number; quote: string };
}> {
  const evidence: ReturnType<typeof structuredSpellcastingEvidence> = [];
  for (const group of ir.creature.spellcasting ?? []) {
    for (const ref of group.evidence) evidence.push({ category: 'group', ref });
    for (const ref of group.abilityEvidence) evidence.push({ category: 'ability', ref });
    for (const ref of group.saveDcEvidence ?? []) evidence.push({ category: 'saveDc', ref });
    for (const ref of group.attackBonusEvidence ?? []) evidence.push({ category: 'attackBonus', ref });
    for (const waiver of group.componentWaivers) {
      for (const ref of waiver.evidence) evidence.push({ category: 'componentWaiver', ref });
    }
    for (const usageGroup of group.usageGroups) {
      for (const ref of usageGroup.evidence) evidence.push({ category: 'usageGrant', ref });
      for (const spellRef of usageGroup.spellRefs) {
        for (const ref of spellRef.evidence) evidence.push({ category: 'spellRef', ref });
        for (const restriction of spellRef.restrictions) {
          for (const ref of restriction.evidence) evidence.push({ category: 'restriction', ref });
        }
      }
    }
  }
  return evidence;
}

describe('AI monster intake orchestrator', () => {
  test('replaces provider-owned source bookkeeping with the immutable request metadata', () => {
    const expectedSource = buildValidLurkerIr().source;
    const ir = buildValidLurkerIr();
    ir.source = { sha256: 'provider-drift', length: LURKER_SOURCE.length + 340 };

    const anchored = anchorIrEvidence(LURKER_SOURCE, {
      id: 'lurker', label: 'lurker', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE,
    }, ir);

    expect(anchored.source).toEqual(expectedSource);
  });

  test('rebuilds feature evidence and keeps mythic actions separate from legendary actions', () => {
    const source = [
      'Traits',
      'Trait One. A source-backed trait.',
      'Actions',
      'Action One. A source-backed action.',
      'Legendary Actions',
      'The creature can take 2 legendary actions.',
      'Legendary One. A source-backed legendary action.',
      'Mythic Actions',
      'Mythic One. A source-backed mythic action.',
    ].join('\n');
    const ir = buildValidLurkerIr();
    ir.creature.traits = [{ name: 'Trait One', description: 'A source-backed trait.' }];
    ir.creature.actions = [{ name: 'Action One', description: 'A source-backed action.' }];
    ir.creature.legendaryActions = [
      { name: 'Legendary One', description: 'A source-backed legendary action.' },
      { name: 'Mythic One', description: 'A source-backed mythic action.' },
    ];
    ir.creature.mythicActions = undefined;
    ir.creature.legendary = { max: 2, preamble: 'provider typo', evidence: [] };
    ir.claims = [];
    ir.coverage = [{ start: 0, end: source.length, quote: source, classification: 'mechanical', claimPaths: [] }];

    const anchored = anchorIrEvidence(source, {
      id: 'test', label: 'test', start: 0, end: source.length, quote: source,
    }, ir);

    expect(anchored.creature.legendaryActions.map((feature) => feature.name)).toEqual(['Legendary One']);
    expect(anchored.creature.mythicActions?.map((feature) => feature.name)).toEqual(['Mythic One']);
    expect(anchored.creature.legendary?.preamble).toBe('Legendary Actions\nThe creature can take 2 legendary actions.');
    expect(anchored.creature.traits[0]?.evidence?.[0]?.quote).toBe('Trait One. A source-backed trait.');
    expect(anchored.creature.mythicActions?.[0]?.evidence?.[0]?.quote).toBe('Mythic One. A source-backed mythic action.');
    expect(anchored.claims.map((claim) => claim.path)).toEqual(expect.arrayContaining([
      '/creature/traits/0',
      '/creature/actions/0',
      '/creature/legendaryActions/0',
      '/creature/mythicActions/0',
    ]));
  });

  test('anchors qualified feature labels without merging adjacent source spans', () => {
    const source = [
      'Traits',
      'Implacable. The creature may turn a failed save into a success.',
      'DomainIntrusion(MythicTrait,1/Day). The creature resets its hit points.',
      'Mythic Actions',
      'DreamofCreation(Concentration). The creature summons an ally.',
      'DreamofPerfection(1/Round). The creature regains hit points.',
    ].join('\n');
    const ir = buildValidLurkerIr();
    ir.creature.traits = [
      { name: 'Implacable', description: 'The creature may turn a failed save into a success.' },
      { name: 'DomainIntrusion(MythicTrait,1/Day)', description: 'The creature resets its hit points.' },
    ];
    ir.creature.actions = [];
    ir.creature.legendaryActions = [];
    ir.creature.mythicActions = [
      { name: 'DreamofCreation(Concentration)', description: 'The creature summons an ally.' },
      { name: 'DreamofPerfection(1/Round)', description: 'The creature regains hit points.' },
    ];
    ir.claims = [];
    ir.coverage = [{ start: 0, end: source.length, quote: source, classification: 'mechanical', claimPaths: [] }];

    const anchored = anchorIrEvidence(source, {
      id: 'qualified', label: 'qualified', start: 0, end: source.length, quote: source,
    }, ir);

    expect(anchored.creature.traits.map((feature) => feature.evidence?.[0]?.quote)).toEqual([
      'Implacable. The creature may turn a failed save into a success.',
      'DomainIntrusion(MythicTrait,1/Day). The creature resets its hit points.',
    ]);
    expect(anchored.creature.mythicActions?.map((feature) => feature.evidence?.[0]?.quote)).toEqual([
      'DreamofCreation(Concentration). The creature summons an ally.',
      'DreamofPerfection(1/Round). The creature regains hit points.',
    ]);
    expect(anchored.creature.traits[1]).toMatchObject({ name: 'DomainIntrusion', sourceQualifier: 'MythicTrait,1/Day' });
    expect(anchored.creature.mythicActions?.map((feature) => ({ name: feature.name, qualifier: feature.sourceQualifier }))).toEqual([
      { name: 'DreamofCreation', qualifier: 'Concentration' },
      { name: 'DreamofPerfection', qualifier: '1/Round' },
    ]);
  });

  test('chunks long UTF-16 source with the fixed overlap and deduplicates overlapping boundary discoveries', () => {
    const source = `${'a'.repeat(23_500)}MONSTER${'b'.repeat(25_500)}`;
    const chunks = chunkSource(source);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.end - chunks[1]!.start).toBe(1_000);
    const start = source.indexOf('MONSTER') - 20;
    const end = source.indexOf('MONSTER') + 40;
    const candidates = normalizeDiscovery(source, [
      { id: 'one', label: 'Monster', start, end, quote: source.slice(start, end) },
      { id: 'duplicate', label: 'Monster', start: start + 2, end: end - 2, quote: source.slice(start + 2, end - 2) },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ start, end });
  });

  test('deterministically re-anchors a discovery candidate when its exact quote is unique', () => {
    const source = 'preface\nMONSTER BLOCK\nafterword';
    const candidates = normalizeDiscovery(source, [{
      id: 'monster',
      label: 'Monster',
      start: 0,
      end: 7,
      quote: 'MONSTER BLOCK',
    }]);

    expect(candidates).toEqual([{
      id: 'monster',
      label: 'Monster',
      start: 8,
      end: 21,
      quote: 'MONSTER BLOCK',
    }]);
  });

  test('partitions the full source so truncated discovery cannot hide later mechanics', () => {
    const source = 'preface\nMONSTER ONE\nCR 1\nActions\nClaw\nMONSTER TWO\nCR 2\nActions\nBite\n';
    const secondStart = source.indexOf('MONSTER TWO');
    const candidates = partitionDiscoveryCandidates(source, [
      { id: 'one', label: 'One', start: source.indexOf('MONSTER ONE'), end: source.indexOf('Actions'), quote: 'MONSTER ONE\nCR 1\n' },
      { id: 'two', label: 'Two', start: secondStart, end: source.indexOf('Actions', secondStart), quote: 'MONSTER TWO\nCR 2\n' },
    ]);

    expect(candidates[0]).toMatchObject({ start: 0, end: secondStart });
    expect(candidates[0]!.quote).toContain('Actions\nClaw');
    expect(candidates[1]).toMatchObject({ start: secondStart, end: source.length });
    expect(candidates[1]!.quote).toContain('Actions\nBite');
  });

  test('deterministically anchors a unique evidence quote but leaves ambiguous quotes invalid', () => {
    const ir = buildValidLurkerIr();
    ir.claims[0]!.evidence[0]!.start = 999;
    ir.claims[0]!.evidence[0]!.end = 1000;
    const anchored = anchorIrEvidence(LURKER_SOURCE, { id: 'lurker', label: 'lurker', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE }, ir);
    expect(LURKER_SOURCE.slice(anchored.claims[0]!.evidence[0]!.start, anchored.claims[0]!.evidence[0]!.end)).toBe('暗影潜妖');

    anchored.claims[0]!.evidence[0] = { start: 999, end: 1000, quote: '潜妖' };
    const ambiguous = anchorIrEvidence(LURKER_SOURCE, { id: 'lurker', label: 'lurker', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE }, anchored);
    expect(ambiguous.claims[0]!.evidence[0]!.start).toBe(999);
  });

  test('anchors a repeated evidence quote to the nearest reported source position', () => {
    const source = 'Repeated title\nintroductory narrative\nRepeated title\nstat block';
    const secondStart = source.lastIndexOf('Repeated title');
    const ir = buildValidLurkerIr();
    ir.claims[0]!.evidence[0] = {
      start: secondStart + 6,
      end: secondStart + 8,
      quote: 'Repeated title',
    };

    const anchored = anchorIrEvidence(source, {
      id: 'repeated',
      label: 'Repeated',
      start: 0,
      end: source.length,
      quote: source,
    }, ir);

    expect(anchored.claims[0]!.evidence[0]).toEqual({
      start: secondStart,
      end: secondStart + 'Repeated title'.length,
      quote: 'Repeated title',
    });
  });

  test('repairs only the end offset when a short repeated quote starts at an exact occurrence', () => {
    const source = 'Mage lore\nMage stat block';
    const secondStart = source.lastIndexOf('Mage');
    const ir = buildValidLurkerIr();
    ir.claims[0]!.evidence[0] = {
      start: secondStart,
      end: secondStart + 1,
      quote: 'Mage',
    };

    const anchored = anchorIrEvidence(source, {
      id: 'mage', label: 'Mage', start: 0, end: source.length, quote: source,
    }, ir);

    expect(anchored.claims[0]!.evidence[0]).toEqual({
      start: secondStart,
      end: secondStart + 'Mage'.length,
      quote: 'Mage',
    });
  });

  test('anchors a repeated exact quote when one occurrence is clearly nearer despite large model offset drift', () => {
    const source = 'Repeated title\nintroductory narrative that is deliberately long\nRepeated title\nstat block';
    const secondStart = source.lastIndexOf('Repeated title');
    const reportedStart = secondStart + 'Repeated title'.length * 3;
    const ir = buildValidLurkerIr();
    ir.claims[0]!.evidence[0] = {
      start: reportedStart,
      end: reportedStart + 1,
      quote: 'Repeated title',
    };
    ir.coverage[0] = {
      ...ir.coverage[0]!,
      start: reportedStart,
      end: reportedStart + 1,
      quote: 'Repeated title',
    };

    const anchored = anchorIrEvidence(source, {
      id: 'repeated', label: 'Repeated', start: 0, end: source.length, quote: source,
    }, ir);

    expect(anchored.claims[0]!.evidence[0]!.start).toBe(secondStart);
    expect(anchored.coverage[0]!.start).toBe(secondStart);
  });

  test('re-anchors every nested Rat spellcasting evidence kind after provider offset drift', () => {
    const ir = buildRatWarlockIr();
    // Real provider JSON has no shared object identity between the group and its grouping claim.
    ir.creature.spellcasting![0]!.evidence[0] = { ...ir.creature.spellcasting![0]!.evidence[0]! };
    const before = structuredSpellcastingEvidence(ir);
    expect(new Set(before.map(({ category }) => category))).toEqual(new Set([
      'group', 'ability', 'saveDc', 'attackBonus', 'componentWaiver', 'usageGrant', 'spellRef', 'restriction',
    ]));
    for (const { ref } of before) {
      ref.start += 7;
      ref.end = ref.start + 1;
    }
    expect(before.every(({ ref }) => RAT_WARLOCK_SOURCE.slice(ref.start, ref.end) !== ref.quote)).toBe(true);

    const anchored = anchorIrEvidence(RAT_WARLOCK_SOURCE, {
      id: 'rat-warlock', label: 'Rat Warlock', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE,
    }, ir);

    expect(structuredSpellcastingEvidence(anchored)
      .filter(({ ref }) => RAT_WARLOCK_SOURCE.slice(ref.start, ref.end) !== ref.quote)
      .map(({ category, ref }) => `${category}:${ref.quote}`)).toEqual([]);
  });

  test('canonicalizes uniquely sourced spell identity and restriction evidence into disjoint child ranges', () => {
    const ir = buildRatWarlockIr() as any;
    const spell = ir.creature.spellcasting[0].usageGroups[0].spellRefs[0];
    spell.evidence = [ratEvidence('魔能爆eldritch blast（2条射线）')];
    spell.restrictions[0].evidence = [{ start: 999, end: 1000, quote: '2条射线' }];

    const anchored = anchorIrEvidence(RAT_WARLOCK_SOURCE, {
      id: 'rat-warlock', label: 'Rat Warlock', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE,
    }, ir);

    expect(anchored.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0]!.evidence).toEqual([
      ratEvidence('魔能爆eldritch blast'),
    ]);
    expect(anchored.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0]!.restrictions[0]!.evidence).toEqual([
      ratEvidence('2条射线'),
    ]);
  });

  test('canonicalizes a non-Rat English spell and limitation only when each literal is unique in its grant', () => {
    const source = 'Innate Spellcasting.\nAt Will: Arc Bolt (self only)';
    const ir = buildRatWarlockIr() as any;
    const group = ir.creature.spellcasting[0];
    group.evidence = [{ start: 0, end: source.length, quote: source }];
    group.usageGroups = [{
      usage: 'at-will',
      evidence: [{ start: source.indexOf('At Will:'), end: source.length, quote: 'At Will: Arc Bolt (self only)' }],
      spellRefs: [{
        refId: 'arc-bolt', identifier: 'arc-bolt', originalName: 'Arc Bolt', englishName: 'Arc Bolt', aliases: [],
        evidence: [{ start: 0, end: source.length, quote: source }],
        restrictions: [{ kind: 'target', text: 'self only', evidence: [{ start: 0, end: 1, quote: 'x' }] }],
      }],
    }];

    const anchored = anchorIrEvidence(source, {
      id: 'arc-caster', label: 'Arc Caster', start: 0, end: source.length, quote: source,
    }, ir);

    const ref = anchored.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0]!;
    expect(ref.evidence).toEqual([{
      start: source.indexOf('Arc Bolt'), end: source.indexOf('Arc Bolt') + 'Arc Bolt'.length, quote: 'Arc Bolt',
    }]);
    expect(ref.restrictions[0]!.evidence).toEqual([{
      start: source.indexOf('self only'), end: source.indexOf('self only') + 'self only'.length, quote: 'self only',
    }]);
  });

  test('does not guess between repeated long spell literals or rewrite confirmed resume evidence', () => {
    const source = 'At Will: Magic Missile, Magic Missile';
    const ir = buildRatWarlockIr() as any;
    const group = ir.creature.spellcasting[0];
    group.evidence = [{ start: 0, end: source.length, quote: source }];
    const secondStart = source.lastIndexOf('Magic Missile');
    const existing = { start: secondStart + 3, end: secondStart + 4, quote: 'Magic Missile' };
    group.usageGroups = [{
      usage: 'at-will', evidence: [{ start: 0, end: source.length, quote: source }],
      spellRefs: [{
        refId: 'magic-missile', identifier: 'magic-missile', originalName: 'Magic Missile', englishName: 'Magic Missile', aliases: [],
        evidence: [existing], restrictions: [],
      }],
    }];
    const candidate = { id: 'blink-caster', label: 'Blink Caster', start: 0, end: source.length, quote: source };

    expect(anchorIrEvidence(source, candidate, ir).creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0]!.evidence)
      .toEqual([existing]);

    const uniqueSource = 'At Will: Blink';
    const confirmed = structuredClone(ir);
    confirmed.creature.spellcasting![0]!.evidence = [{ start: 0, end: uniqueSource.length, quote: uniqueSource }];
    confirmed.creature.spellcasting![0]!.usageGroups[0]!.evidence = [{ start: 0, end: uniqueSource.length, quote: uniqueSource }];
    const userEvidence = { start: 0, end: 7, quote: 'At Will' };
    confirmed.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0]!.evidence = [userEvidence];
    confirmed.creature.senses.blindsight = 0;
    confirmed.creature.actions[0]!.attack!.range = 0;
    const resumed = anchorIrEvidence(uniqueSource, {
      id: 'confirmed', label: 'Confirmed', start: 0, end: uniqueSource.length, quote: uniqueSource,
    }, confirmed, { canonicalizeModelSpellEvidence: false, normalizeAbsentOptionalZeroes: false });
    expect(resumed.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0]!.evidence).toEqual([userEvidence]);
    expect(resumed.creature.senses.blindsight).toBe(0);
    expect(resumed.creature.actions[0]!.attack!.range).toBe(0);
  });

  test('anchors a short nested quote to its unique verified group scope even when the model points at an outside occurrence', () => {
    const ir = buildRatWarlockIr();
    const spellcastingStart = RAT_WARLOCK_SOURCE.indexOf('天生施法Innate Spellcasting');
    const abilityStart = RAT_WARLOCK_SOURCE.indexOf('魅力', spellcastingStart);
    const outsideAbilityStart = RAT_WARLOCK_SOURCE.indexOf('魅力');
    expect(outsideAbilityStart).toBeLessThan(spellcastingStart);
    ir.creature.spellcasting![0]!.abilityEvidence = [{
      start: outsideAbilityStart, end: outsideAbilityStart + '魅力'.length, quote: '魅力',
    }];

    const anchored = anchorIrEvidence(RAT_WARLOCK_SOURCE, {
      id: 'rat-warlock', label: 'Rat Warlock', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE,
    }, ir);

    expect(anchored.creature.spellcasting![0]!.abilityEvidence[0]).toEqual({
      start: abilityStart, end: abilityStart + '魅力'.length, quote: '魅力',
    });
  });

  test('leaves a short nested quote invalid when it repeats inside its verified group scope', () => {
    const ir = buildRatWarlockIr();
    const firstPlusFour = RAT_WARLOCK_SOURCE.indexOf('+4');
    const spellcastingPlusFour = RAT_WARLOCK_SOURCE.indexOf('+4', RAT_WARLOCK_SOURCE.indexOf('天生施法Innate Spellcasting'));
    ir.creature.spellcasting![0]!.evidence = [{
      start: firstPlusFour,
      end: spellcastingPlusFour + '+4'.length,
      quote: RAT_WARLOCK_SOURCE.slice(firstPlusFour, spellcastingPlusFour + '+4'.length),
    }];
    const reportedStart = spellcastingPlusFour - 2;
    ir.creature.spellcasting![0]!.attackBonusEvidence = [{ start: reportedStart, end: reportedStart + 1, quote: '+4' }];

    const anchored = anchorIrEvidence(RAT_WARLOCK_SOURCE, {
      id: 'rat-warlock', label: 'Rat Warlock', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE,
    }, ir);

    expect(anchored.creature.spellcasting![0]!.attackBonusEvidence![0]).toEqual({
      start: reportedStart, end: reportedStart + 1, quote: '+4',
    });
  });

  test('relocates exact usage evidence from an unrelated candidate location into its verified group scope', () => {
    const ir = buildRatWarlockIr();
    const usage = ir.creature.spellcasting![0]!.usageGroups[0]!;
    const originalStart = usage.evidence[0]!.start;
    const unrelated = `\n\nUnrelated feature.\n${usage.evidence[0]!.quote}`;
    const source = `${RAT_WARLOCK_SOURCE}${unrelated}`;
    const outsideStart = source.lastIndexOf(usage.evidence[0]!.quote);
    usage.evidence = [{ start: outsideStart, end: outsideStart + usage.evidence[0]!.quote.length, quote: usage.evidence[0]!.quote }];

    const anchored = anchorIrEvidence(source, {
      id: 'rat-warlock', label: 'Rat Warlock', start: 0, end: source.length, quote: source,
    }, ir);

    expect(anchored.creature.spellcasting![0]!.usageGroups[0]!.evidence[0]!.start).toBe(originalStart);
  });

  test('normalizes model-overloaded AC notes and feature activity types into stable IR fields', () => {
    const ir = buildValidLurkerIr();
    (ir.creature.attributes as unknown as { acKind: string }).acKind = '（有法师护甲时15）';
    (ir.creature.actions[1] as unknown as { activityType: string }).activityType = 'action';
    (ir.creature.traits[2] as unknown as { activityType: string }).activityType = 'bonus';
    ir.creature.languages.values = ['通用语', '深渊语'];
    (ir.creature.languages as any).custom = [];
    ir.creature.actions[1]!.damage![0]!.type = '穿刺';
    ir.creature.senses.blindsight = 0;
    ir.creature.senses.tremorsense = 0;
    ir.creature.senses.truesight = 0;
    (ir.creature.senses as any).special = [];
    ir.creature.actions[1]!.attack!.range = 0;
    ir.creature.actions[1]!.attack!.longRange = 0;

    const anchored = anchorIrEvidence(LURKER_SOURCE, {
      id: 'lurker',
      label: 'lurker',
      start: 0,
      end: LURKER_SOURCE.length,
      quote: LURKER_SOURCE,
    }, ir);

    expect(anchored.creature.attributes.acKind).toBeUndefined();
    expect(anchored.creature.attributes.acNote).toBe('（有法师护甲时15）');
    expect(anchored.creature.actions[1]!.activityType).toBe('attack');
    expect(anchored.creature.traits[2]!.activityType).toBe('utility');
    expect(anchored.creature.traits[2]!.activationType).toBe('bonus');
    expect(anchored.creature.languages.values).toEqual(['common', 'deep']);
    expect(anchored.creature.languages.custom).toBeUndefined();
    expect(anchored.creature.actions[1]!.damage![0]!.type).toBe('piercing');
    expect(anchored.creature.senses.blindsight).toBeUndefined();
    expect(anchored.creature.senses.tremorsense).toBeUndefined();
    expect(anchored.creature.senses.truesight).toBeUndefined();
    expect(anchored.creature.senses.special).toBeUndefined();
    expect(anchored.creature.actions[1]!.attack!.range).toBeUndefined();
    expect(anchored.creature.actions[1]!.attack!.longRange).toBeUndefined();
  });

  test('normalizes an attack label without an attack payload to literal utility instead of inventing an attack roll', () => {
    const ir = buildValidLurkerIr();
    ir.creature.actions[0]!.activityType = 'attack';

    const anchored = anchorIrEvidence(LURKER_SOURCE, {
      id: 'multiattack', label: 'Multiattack', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE,
    }, ir);

    expect(anchored.creature.actions[0]!.attack).toBeUndefined();
    expect(anchored.creature.actions[0]!.activityType).toBe('utility');
  });

  test('drops absent optional spellcasting and alignment bookkeeping without spending an AI repair call', () => {
    const ir = buildValidLurkerIr();
    delete ir.creature.identity.alignment;
    ir.creature.spellcasting = [];
    ir.uncertainties.push({
      id: 'alignment-missing', code: 'missing-source-value', path: '/creature/identity/alignment',
      message: 'Source does not state an alignment.', blocking: true, evidence: [],
    });

    const anchored = anchorIrEvidence(LURKER_SOURCE.replace('中立邪恶', ''), {
      id: 'optional-omissions', label: 'Optional Omissions', start: 0, end: LURKER_SOURCE.length - 4,
      quote: LURKER_SOURCE.replace('中立邪恶', ''),
    }, ir);

    expect(anchored.creature.spellcasting).toBeUndefined();
    expect(anchored.uncertainties).toEqual([]);
  });

  test('keeps an empty spellcasting collection for review when the source explicitly contains a spellcasting block', () => {
    const source = `${LURKER_SOURCE}\nInnate Spellcasting. The creature casts detect magic at will.`;
    const ir = buildValidLurkerIr();
    ir.creature.spellcasting = [];

    const anchored = anchorIrEvidence(source, {
      id: 'missing-spellcasting', label: 'Missing Spellcasting', start: 0, end: source.length, quote: source,
    }, ir);

    expect(anchored.creature.spellcasting).toEqual([]);
  });

  test('retains hover only when the exact movement claim explicitly states it', () => {
    const hoverLine = 'Speed fly 40 ft. (hover).';
    const source = `${LURKER_SOURCE}\n${hoverLine}`;
    const makeIr = () => {
      const ir = buildValidLurkerIr();
      ir.creature.attributes.movement = { fly: 40, hover: true };
      const movementClaim = ir.claims.find((claim) => claim.path === '/creature/attributes/movement')!;
      const start = source.indexOf(hoverLine);
      movementClaim.evidence = [{ start, end: start + hoverLine.length, quote: hoverLine }];
      return ir;
    };
    const candidate = { id: 'hover', label: 'Hover', start: 0, end: source.length, quote: source };

    expect(anchorIrEvidence(source, candidate, makeIr()).creature.attributes.movement.hover).toBe(true);

    const withoutHover = source.replace(' (hover)', '');
    const unsupported = makeIr();
    const claim = unsupported.claims.find((value) => value.path === '/creature/attributes/movement')!;
    const plainLine = 'Speed fly 40 ft..';
    const plainStart = withoutHover.indexOf(plainLine);
    claim.evidence = [{ start: plainStart, end: plainStart + plainLine.length, quote: plainLine }];
    expect(anchorIrEvidence(withoutHover, {
      ...candidate, end: withoutHover.length, quote: withoutHover,
    }, unsupported).creature.attributes.movement.hover).toBeUndefined();
  });

  test('drops a provider-invented empty-container claim whose evidence is not an exact source slice', () => {
    const ir = buildValidLurkerIr();
    ir.creature.defenses = { resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: [] };
    ir.claims = ir.claims.filter((claim) => claim.path !== '/creature/defenses');
    ir.claims.push({
      path: '/creature/defenses', valueKind: 'explicit', confidence: 'low',
      value: structuredClone(ir.creature.defenses),
      evidence: [{ start: 0, end: LURKER_SOURCE.length, quote: `unrelated ${LURKER_SOURCE}` }],
    });

    const anchored = anchorIrEvidence(LURKER_SOURCE, {
      id: 'empty-default', label: 'Empty Default', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE,
    }, ir);

    expect(anchored.claims.some((claim) => claim.path === '/creature/defenses')).toBe(false);
  });

  test('re-anchors the exact legendary preamble and preserves its conditional availability', () => {
    const preamble = 'Only while fully controlled, the creature can take 2 legendary actions.';
    const source = `${LURKER_SOURCE}\n${preamble}`;
    const ir = buildValidLurkerIr();
    ir.creature.legendary = {
      max: 2,
      preamble,
      evidence: [{ start: 0, end: preamble.length, quote: preamble }],
    };

    const anchored = anchorIrEvidence(source, {
      id: 'conditional-legendary', label: 'Conditional Legendary', start: 0, end: source.length, quote: source,
    }, ir);
    const start = source.indexOf(preamble);

    expect(anchored.creature.legendary!.evidence).toEqual([{ start, end: start + preamble.length, quote: preamble }]);
    expect(anchored.creature.legendary!.preamble).toBe(preamble);
  });

  test('keeps a literal save DC but drops unsupported structured save automation for an unknown effect when the source omits the ability', () => {
    const description = 'Creatures in the sphere are affected by an unknown magical effect (save DC 12).';
    const source = `${LURKER_SOURCE}\n${description}`;
    const ir = buildValidLurkerIr() as any;
    ir.creature.legendaryActions.push({
      name: 'Zone of Calamity', description, activityType: 'save', activationType: 'legendary',
      save: { dc: 12, ability: 'unknown', condition: 'affected by confusion' },
    });
    ir.uncertainties.push({
      id: 'ambiguous-save-ability', code: 'ambiguous-save-ability',
      path: '/creature/legendaryActions/0/save/ability',
      message: 'The source gives DC 12 but does not name a save ability.', blocking: true,
      evidence: [{ start: source.indexOf(description), end: source.length, quote: description }],
    });

    const anchored = anchorIrEvidence(source, {
      id: 'literal-save-dc', label: 'Literal Save DC', start: 0, end: source.length, quote: source,
    }, ir);
    const feature = anchored.creature.legendaryActions[0]!;

    expect(feature.description).toContain('save DC 12');
    expect(feature.save).toBeUndefined();
    expect(feature.activityType).toBe('utility');
    expect(anchored.uncertainties).toHaveLength(0);
  });

  test.each([
    {
      label: 'English',
      description: 'A magical sphere with a 15-foot radius appears at a point within 60 feet. Each creature that starts its turn there is affected by the confusion spell (save DC 13). The sphere lasts for 1 minute while the creature concentrates.',
    },
    {
      label: 'Chinese',
      description: '一个半径15英尺的魔法球体出现在60尺内。每个在该区域内开始其回合的生物都受到困惑术 confusion 的影响（豁免 DC 13）。只要保持专注，球体持续1分钟。',
    },
  ])('projects a source-explicit $label confusion reference as a usable save, template, and linked effect', async ({ description }) => {
    const source = `${LURKER_SOURCE}\n${description}`;
    const ir = buildValidLurkerIr() as any;
    ir.creature.legendaryActions.push({
      name: 'Zone of Calamity',
      description,
      activityType: 'utility',
      activationType: 'legendary',
      legendaryCost: 2,
    });

    const anchored = anchorIrEvidence(source, {
      id: 'confusion-zone', label: 'Confusion Zone', start: 0, end: source.length, quote: source,
    }, ir);
    const feature = anchored.creature.legendaryActions[0]!;
    const markdown = renderMonsterIntakeMarkdown(anchored);
    const generated = await convertWithPackageWorkflow({
      content: markdown,
      fvttVersion: '14',
      effectProfile: 'core',
      translationService: null,
    });
    const actor = generated.rawJson as any;
    const item = actor.items.find((entry: any) => entry.name.includes('Zone of Calamity'));
    const activity = Object.values(item.system.activities)[0] as any;

    expect(feature).toMatchObject({
      activityType: 'save',
      save: { dc: 13, ability: 'wis' },
      aoe: { shape: 'sphere', radius: 15 },
      activationCondition: 'Concentration',
      appliedConditions: [{ statuses: [], condition: 'Confused', duration: '1 minute' }],
    });
    expect(generated.status).toBe('accepted');
    expect(markdown).toContain('类型: save');
    expect(markdown).toContain('形状: 球形');
    expect(markdown).toContain('范围: 15');
    expect(activity).toMatchObject({
      type: 'save',
      activation: { type: 'legendary', value: 2 },
      save: { ability: ['wis'], dc: { calculation: '', formula: '13' } },
      range: { value: 60, units: 'ft' },
      target: { template: { type: 'sphere', size: 15, units: 'ft' } },
    });
    expect(item.system.concentration).toBe(true);
    expect(item.effects).toHaveLength(1);
    expect(item.effects[0]).toMatchObject({ name: 'Confused', duration: { seconds: 60 }, statuses: [] });
    expect(activity.effects).toEqual([{ _id: item.effects[0]._id, onSave: false }]);
  });

  test.each([
    {
      label: 'English fixed temporary hit points',
      name: 'Dark Boon',
      description: 'Dark Boon. When the creature reduces a hostile creature to 0 hit points, it gains 6 temporary hit points.',
      formula: '6',
    },
    {
      label: 'Chinese fixed temporary hit points',
      name: '黑暗赐福',
      description: '黑暗赐福.当该生物将一个敌对生物的生命值归零时，它将获得6点临时生命值。',
      formula: '6',
    },
    {
      label: 'dice-based temporary hit points',
      name: 'Shadow Reward',
      description: 'Shadow Reward. When the trigger occurs, the creature gains 1d6 temporary hit points.',
      formula: '1d6',
    },
  ])('projects $label as a special heal activity that grants temphp', async ({ name, description, formula }) => {
    const source = `${LURKER_SOURCE}\n${description}`;
    const ir = buildValidLurkerIr();
    ir.creature.traits[0] = {
      name,
      description,
      activityType: 'utility',
      activationType: 'special',
    };

    const anchored = anchorIrEvidence(source, {
      id: 'temporary-hit-points', label: name, start: 0, end: source.length, quote: source,
    }, ir);
    const markdown = renderMonsterIntakeMarkdown(anchored);
    const generated = await convertWithPackageWorkflow({
      content: markdown,
      fvttVersion: '14',
      effectProfile: 'core',
      translationService: null,
    });
    const actor = generated.rawJson as any;
    const item = actor.items.find((entry: any) => entry.name.includes(name));
    const activity = Object.values(item.system.activities)[0] as any;

    expect(anchored.creature.traits[0]).toMatchObject({
      activityType: 'heal',
      healing: { formula, type: 'temphp' },
    });
    expect(generated.status).toBe('accepted');
    expect(activity).toMatchObject({
      type: 'heal',
      activation: { type: 'special' },
      target: { affects: { type: 'self' } },
    });
    expect(activity.healing).toEqual(formula.includes('d') ? {
      number: 1,
      denomination: 6,
      bonus: '',
      types: ['temphp'],
      custom: { enabled: false, formula: '' },
      scaling: { mode: 'whole', number: 1, formula: '' },
    } : {
      number: null,
      denomination: null,
      bonus: '',
      types: ['temphp'],
      custom: { enabled: true, formula },
      scaling: { mode: 'whole', number: null, formula: '' },
    });
    expect(activity.target).toEqual({
      override: false,
      prompt: false,
      template: { count: '', contiguous: false, type: '', size: '', width: '', height: '', units: 'ft' },
      affects: { count: '1', type: 'self', choice: false, special: '' },
    });
    const renderedFormula = activity.healing.custom?.enabled
      ? activity.healing.custom.formula
      : `${activity.healing.number}d${activity.healing.denomination}`;
    expect(renderedFormula).toBe(formula);
  });

  test('does not turn a temporary-hit-point prohibition into a heal activity', () => {
    const description = "Null Ward. The creature can't gain temporary hit points.";
    const source = `${LURKER_SOURCE}\n${description}`;
    const ir = buildValidLurkerIr();
    ir.creature.traits[0] = {
      name: 'Null Ward', description, activityType: 'utility', activationType: 'special',
    };

    const anchored = anchorIrEvidence(source, {
      id: 'no-temporary-hit-points', label: 'Null Ward', start: 0, end: source.length, quote: source,
    }, ir);

    expect(anchored.creature.traits[0]).toMatchObject({ activityType: 'utility' });
    expect((anchored.creature.traits[0] as any).healing).toBeUndefined();
  });

  test('does not discard a valid explicit save ability or an unrelated uncertainty', () => {
    const ir = buildValidLurkerIr();
    const anchored = anchorIrEvidence(LURKER_SOURCE, {
      id: 'lurker', label: 'Lurker', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE,
    }, ir);

    expect(anchored.creature.bonusActions.find((feature) => feature.save)?.save?.ability).toBe('cha');
    expect(anchored.uncertainties).toEqual(ir.uncertainties);
  });

  test('normalizes localized and full-English save abilities but does not guess an unknown ability', () => {
    const ir = buildValidLurkerIr() as any;
    ir.creature.bonusActions[0].save.ability = '\u611f\u77e5';
    ir.creature.actions[1].save = { dc: 12, ability: 'Strength', condition: 'failure' };
    ir.creature.actions[1].description += ' Strength saving throw DC 12.';
    ir.creature.reactions.push({
      name: 'Unknown Save', description: 'The target makes a Luck saving throw DC 12.',
      activityType: 'save', save: { dc: 12, ability: 'Luck', condition: 'failure' },
    });

    const anchored = anchorIrEvidence(LURKER_SOURCE, {
      id: 'ability-aliases', label: 'Ability Aliases', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE,
    }, ir);

    expect(anchored.creature.bonusActions[0]!.save!.ability).toBe('wis');
    expect(anchored.creature.actions[1]!.save!.ability).toBe('str');
    expect(anchored.creature.reactions[0]!.save).toBeUndefined();
  });

  test('normalizes source-proven statblock conventions instead of retaining false AI ambiguities', () => {
    const hybrid = 'Dagger. Melee or Ranged Weapon Attack: reach 5 ft. or range 20/60 ft.';
    const zone = 'Zone of Calamity (Costs 2 Actions). Creatures are affected (save DC 12).';
    const mace = 'Mace. Hit: 3 (1d6) bludgeoning damage.';
    const race = 'Medium humanoid (any race), any alignment.';
    const source = `${LURKER_SOURCE}\n${hybrid}\n${zone}\n${mace}\n${race}`;
    const ir = buildValidLurkerIr() as any;
    Object.assign(ir.creature.actions[1], {
      name: 'Dagger', description: hybrid,
      attack: { type: 'mwak', toHit: 4, reach: 5, range: 20, longRange: 60 },
      damage: [{ formula: '1d4+2', type: 'piercing', relationship: 'base' }],
    });
    ir.creature.actions.push({
      name: 'Mace', description: mace, activityType: 'attack',
      attack: { type: 'mwak', toHit: 2, reach: 5 },
      damage: [{ formula: '1d6', type: 'bludgeoning', relationship: 'base' }],
    });
    ir.creature.legendaryActions.push({ name: 'Zone of Calamity (Costs 2 Actions)', description: zone, activityType: 'utility', activationType: 'legendary' });
    ir.creature.identity.creatureType = 'humanoid';
    ir.creature.identity.creatureTypeCustom = 'any race';
    ir.uncertainties = [
      { id: 'hybrid', code: 'attack-type-ambiguous', path: '/creature/actions/1/attack/type', message: 'hybrid', blocking: true, evidence: [] },
      { id: 'save', code: 'save-ability-unstated', path: '/creature/legendaryActions/0/save', message: 'no ability', blocking: true, evidence: [] },
      { id: 'cost', code: 'legendary-cost-not-structured', path: '/creature/legendaryActions/0', message: 'cost', blocking: true, evidence: [] },
      { id: 'average', code: 'attack-damage-total-vs-formula', path: '/creature/actions/2/damage/0', message: 'average', blocking: true, evidence: [] },
      { id: 'race', code: 'creature-type-custom-not-standardized', path: '/creature/identity/creatureType', message: 'race', blocking: true, evidence: [] },
    ];

    const anchored = anchorIrEvidence(source, {
      id: 'statblock-conventions', label: 'Statblock Conventions', start: 0, end: source.length, quote: source,
    }, ir);

    expect(anchored.creature.legendaryActions[0]!.legendaryCost).toBe(2);
    expect(anchored.uncertainties).toEqual([]);
  });

  test('retains close negative ambiguities when the source does not prove the convention', () => {
    const ir = buildValidLurkerIr() as any;
    ir.creature.actions[1].attack = { type: 'mwak', toHit: 4, reach: 5 };
    ir.creature.actions[1].description = 'Dagger. Melee or Ranged Weapon Attack.';
    ir.uncertainties = [{
      id: 'hybrid', code: 'attack-type-ambiguous', path: '/creature/actions/1/attack/type',
      message: 'The ranged distance is absent.', blocking: true, evidence: [],
    }];

    const anchored = anchorIrEvidence(LURKER_SOURCE, {
      id: 'unproven-hybrid', label: 'Unproven Hybrid', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE,
    }, ir);

    expect(anchored.uncertainties).toHaveLength(1);
  });

  test('preserves explicit zero nullable distances from leaf claims across feature sections', () => {
    const suffix = '\nSenses: blindsight 0 ft.\nNeedle. Ranged Weapon Attack. Range 0 ft. Long range 0 ft.\nSnap. Ranged Spell Attack. Range 0 ft.';
    const source = `${LURKER_SOURCE}${suffix}`;
    const ir = buildValidLurkerIr() as any;
    ir.creature.senses.blindsight = 0;
    ir.creature.actions[1].attack.range = 0;
    ir.creature.actions[1].attack.longRange = 0;
    ir.creature.reactions.push({
      name: 'Snap', description: 'Ranged Spell Attack. Range 0 ft.', activityType: 'attack', activationType: 'reaction',
      attack: { type: 'rsak', toHit: 0, range: 0 }, damage: [],
    });
    const sensesQuote = 'Senses: blindsight 0 ft.';
    const attackQuote = 'Needle. Ranged Weapon Attack. Range 0 ft. Long range 0 ft.';
    const reactionQuote = 'Snap. Ranged Spell Attack. Range 0 ft.';
    const evidence = (quote: string) => ({ start: source.indexOf(quote), end: source.indexOf(quote) + quote.length, quote });
    ir.claims.push({ path: '/creature/senses/blindsight', valueKind: 'explicit', confidence: 'high', value: 0, evidence: [evidence(sensesQuote)] });
    ir.claims.push({ path: '/creature/actions/1/attack/range', valueKind: 'explicit', confidence: 'high', value: 0, evidence: [evidence(attackQuote)] });
    ir.claims.push({ path: '/creature/actions/1/attack/longRange', valueKind: 'explicit', confidence: 'high', value: 0, evidence: [evidence(attackQuote)] });
    ir.claims.push({ path: '/creature/reactions/0/attack/range', valueKind: 'explicit', confidence: 'high', value: 0, evidence: [evidence(reactionQuote)] });

    const anchored = anchorIrEvidence(source, {
      id: 'zero-caster', label: 'Zero Caster', start: 0, end: source.length, quote: source,
    }, ir);

    expect(anchored.creature.senses.blindsight).toBe(0);
    expect(anchored.creature.actions[1]!.attack!.range).toBe(0);
    expect(anchored.creature.actions[1]!.attack!.longRange).toBe(0);
    expect(anchored.creature.reactions[0]!.attack!.range).toBe(0);
  });

  test.each([
    { field: 'blindsight', sourceText: 'Senses: blindsight 0.5 ft.', path: '/creature/senses/blindsight' },
    { field: 'range', sourceText: 'Needle. Range 05 ft.', path: '/creature/actions/1/attack/range' },
    { field: 'longRange', sourceText: 'Needle. Long range 0-30 ft.', path: '/creature/actions/1/attack/longRange' },
  ])('does not preserve zero from nonzero numeric prefix evidence: $sourceText', ({ field, sourceText, path }) => {
    const source = `${LURKER_SOURCE}\n${sourceText}`;
    const ir = buildValidLurkerIr() as any;
    if (field === 'blindsight') ir.creature.senses.blindsight = 0;
    else ir.creature.actions[1].attack[field] = 0;
    const start = source.indexOf(sourceText);
    ir.claims.push({
      path, valueKind: 'explicit', confidence: 'high', value: 0,
      evidence: [{ start, end: start + sourceText.length, quote: sourceText }],
    });

    const anchored = anchorIrEvidence(source, {
      id: 'numeric-prefix', label: 'Numeric Prefix', start: 0, end: source.length, quote: source,
    }, ir);

    if (field === 'blindsight') expect(anchored.creature.senses.blindsight).toBeUndefined();
    else expect((anchored.creature.actions[1]!.attack as any)[field]).toBeUndefined();
  });

  test('drops only unanchorable whitespace coverage while preserving invalid mechanical coverage', () => {
    const ir = buildValidLurkerIr();
    ir.coverage.push({
      start: 999,
      end: 1001,
      quote: ' \n',
      classification: 'ignored-with-reason',
      claimPaths: [],
      reason: 'formatting',
    });
    ir.coverage.push({
      start: 999,
      end: 1005,
      quote: 'WRONG!',
      classification: 'mechanical',
      claimPaths: ['/creature/identity/name'],
    });

    const anchored = anchorIrEvidence(
      LURKER_SOURCE,
      { id: 'lurker', label: 'lurker', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE },
      ir,
    );

    expect(anchored.coverage.some((entry) => entry.quote === ' \n')).toBe(false);
    expect(anchored.coverage.some((entry) => entry.quote === 'WRONG!')).toBe(true);
  });

  test('removes a whole-source offset uncertainty only when exact evidence and coverage disprove it', () => {
    const ir = buildRatWarlockIr();
    ir.uncertainties = [{
      id: 'offset-conflict', code: 'coverage-offset-conflict', path: '/coverage',
      message: `Candidate end ${RAT_WARLOCK_SOURCE.length} conflicts with source length 999.`,
      blocking: true, evidence: [ir.coverage.at(-1)!],
    }];
    const candidate = {
      id: 'rat-warlock', label: 'Rat Warlock', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE,
    };

    expect(anchorIrEvidence(RAT_WARLOCK_SOURCE, candidate, ir).uncertainties).toEqual([]);
    expect(anchorIrEvidence(RAT_WARLOCK_SOURCE, candidate, ir, {
      removeDisprovedProcessUncertainties: false,
    }).uncertainties).toHaveLength(1);

    const whitespaceOnlyGap = structuredClone(ir);
    whitespaceOnlyGap.coverage[0]!.end -= 3;
    whitespaceOnlyGap.coverage[0]!.quote = RAT_WARLOCK_SOURCE.slice(
      whitespaceOnlyGap.coverage[0]!.start,
      whitespaceOnlyGap.coverage[0]!.end,
    );
    expect(RAT_WARLOCK_SOURCE.slice(
      whitespaceOnlyGap.coverage[0]!.end,
      whitespaceOnlyGap.coverage[1]!.start,
    )).toMatch(/^\s+$/u);
    expect(anchorIrEvidence(RAT_WARLOCK_SOURCE, candidate, whitespaceOnlyGap).uncertainties).toEqual([]);

    const invalid = structuredClone(ir);
    invalid.claims[0]!.evidence[0] = { start: 999, end: 1000, quote: '鼠' };
    expect(anchorIrEvidence(RAT_WARLOCK_SOURCE, candidate, invalid).uncertainties).toHaveLength(1);

    const uncoveredText = structuredClone(ir);
    uncoveredText.coverage[1]!.start += 1;
    uncoveredText.coverage[1]!.quote = RAT_WARLOCK_SOURCE.slice(
      uncoveredText.coverage[1]!.start,
      uncoveredText.coverage[1]!.end,
    );
    expect(anchorIrEvidence(RAT_WARLOCK_SOURCE, candidate, uncoveredText).uncertainties).toHaveLength(1);
  });

  test('removes a whole-source span uncertainty after deterministic feature evidence is exact', () => {
    const ir = buildRatWarlockIr();
    ir.uncertainties = [{
      id: 'incomplete-span', code: 'incomplete_source_span', path: '/creature',
      message: 'The candidate source span lacks token-level evidence boundaries.', blocking: true,
      evidence: [{ start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE }],
    }];

    const anchored = anchorIrEvidence(RAT_WARLOCK_SOURCE, {
      id: 'rat-warlock', label: 'Rat Warlock', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE,
    }, ir);

    expect(anchored.uncertainties).toEqual([]);
  });

  test('keeps genuine semantic uncertainty even when whole-source evidence is exact', () => {
    const ir = buildRatWarlockIr();
    ir.uncertainties = [{
      id: 'shared-use', code: 'AMBIGUOUS_SHARED_USE', path: '/creature/spellcasting/0/usageGroups',
      message: 'The source is ambiguous about whether daily uses are shared.', blocking: true,
      evidence: [ir.creature.spellcasting![0]!.usageGroups[1]!.evidence[0]!],
    }];

    const anchored = anchorIrEvidence(RAT_WARLOCK_SOURCE, {
      id: 'rat-warlock', label: 'Rat Warlock', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE,
    }, ir);

    expect(anchored.uncertainties).toHaveLength(1);
    expect(anchored.uncertainties[0]!.code).toBe('AMBIGUOUS_SHARED_USE');
  });

  test('removes only a standard 2024 initiative-score uncertainty proven by exact source evidence', () => {
    const candidate = {
      id: 'lurker', label: 'Lurker in the Dark', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE,
    };
    const standard = buildValidLurkerIr();
    const standardQuote = 'AC 14 先攻 +4（14）';
    const standardStart = LURKER_SOURCE.indexOf(standardQuote);
    const standardDisplay = '先攻 +4（14）';
    const standardDisplayStart = LURKER_SOURCE.indexOf(standardDisplay);
    standard.claims.find((claim) => claim.path === '/creature/attributes/initiative')!.evidence = [{
      start: standardDisplayStart,
      end: standardDisplayStart + standardDisplay.length,
      quote: standardDisplay,
    }];
    standard.uncertainties = [{
      id: 'initiative-parenthetical', code: 'initiative-parenthetical', path: '/creature/attributes/initiative',
      message: 'The parenthetical initiative score was not encoded.', blocking: true,
      evidence: [{ start: standardStart, end: standardStart + standardQuote.length, quote: standardQuote }],
      candidates: [4, 14],
    }];

    expect(anchorIrEvidence(LURKER_SOURCE, candidate, standard).uncertainties).toEqual([]);

    const negativeSource = LURKER_SOURCE.replace('先攻 +4（14）', '先攻 -2（8）');
    const negative = buildValidLurkerIr();
    negative.creature.attributes.initiative = -2;
    const negativeDisplay = '先攻 -2（8）';
    const negativeDisplayStart = negativeSource.indexOf(negativeDisplay);
    negative.claims.find((claim) => claim.path === '/creature/attributes/initiative')!.evidence = [{
      start: negativeDisplayStart,
      end: negativeDisplayStart + negativeDisplay.length,
      quote: negativeDisplay,
    }];
    negative.uncertainties = [{
      id: 'initiative-negative-parenthetical', code: 'initiative-parenthetical', path: '/creature/attributes/initiative',
      message: 'The negative initiative display was not encoded.', blocking: true,
      evidence: [{ start: negativeDisplayStart, end: negativeDisplayStart + negativeDisplay.length, quote: negativeDisplay }],
      candidates: [-2, 8],
    }];

    expect(anchorIrEvidence(negativeSource, {
      ...candidate, end: negativeSource.length, quote: negativeSource,
    }, negative).uncertainties).toEqual([]);

    const unrelatedCode = buildValidLurkerIr();
    unrelatedCode.claims.find((claim) => claim.path === '/creature/attributes/initiative')!.evidence = [{
      start: standardDisplayStart,
      end: standardDisplayStart + standardDisplay.length,
      quote: standardDisplay,
    }];
    unrelatedCode.uncertainties = [{
      id: 'initiative-semantic', code: 'ambiguous-initiative-source', path: '/creature/attributes/initiative',
      message: 'A semantic initiative ambiguity remains.', blocking: true,
      evidence: [{ start: standardDisplayStart, end: standardDisplayStart + standardDisplay.length, quote: standardDisplay }],
    }];

    expect(anchorIrEvidence(LURKER_SOURCE, candidate, unrelatedCode).uncertainties).toHaveLength(1);

    const conflictingSource = `${LURKER_SOURCE}\nAlternate form: Initiative +3 (13)`;
    const conflicting = buildValidLurkerIr();
    conflicting.claims.find((claim) => claim.path === '/creature/attributes/initiative')!.evidence = [{
      start: standardDisplayStart,
      end: standardDisplayStart + standardDisplay.length,
      quote: standardDisplay,
    }];
    conflicting.uncertainties = [{
      id: 'initiative-conflicting-displays', code: 'initiative-parenthetical', path: '/creature/attributes/initiative',
      message: 'The source contains conflicting initiative displays.', blocking: true,
      evidence: [{ start: standardDisplayStart, end: standardDisplayStart + standardDisplay.length, quote: standardDisplay }],
    }];

    expect(anchorIrEvidence(conflictingSource, {
      ...candidate, end: conflictingSource.length, quote: conflictingSource,
    }, conflicting).uncertainties).toHaveLength(1);

    const inconsistentSource = LURKER_SOURCE.replace('先攻 +4（14）', '先攻 +4（15）');
    const inconsistent = buildValidLurkerIr();
    const inconsistentQuote = 'AC 14 先攻 +4（15）';
    const inconsistentStart = inconsistentSource.indexOf(inconsistentQuote);
    inconsistent.uncertainties = [{
      id: 'initiative-conflict', code: 'initiative-parenthetical', path: '/creature/attributes/initiative',
      message: 'The parenthetical initiative score conflicts with the modifier.', blocking: true,
      evidence: [{ start: inconsistentStart, end: inconsistentStart + inconsistentQuote.length, quote: inconsistentQuote }],
      candidates: [4, 15],
    }];

    expect(anchorIrEvidence(inconsistentSource, {
      ...candidate, end: inconsistentSource.length, quote: inconsistentSource,
    }, inconsistent).uncertainties).toHaveLength(1);
  });

  test('keeps semantic target-offset uncertainty despite exact whole-source evidence', () => {
    const ir = buildRatWarlockIr();
    ir.uncertainties = [{
      id: 'target-offset', code: 'AMBIGUOUS_TARGET_OFFSET', path: '/creature/actions/0',
      message: 'The target position is ambiguous because it may be offset from the caster.', blocking: true,
      evidence: [ir.claims.find((claim) => claim.path === '/creature/actions/0')!.evidence[0]!],
    }];

    const anchored = anchorIrEvidence(RAT_WARLOCK_SOURCE, {
      id: 'rat-warlock', label: 'Rat Warlock', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE,
    }, ir);

    expect(anchored.uncertainties).toHaveLength(1);
    expect(anchored.uncertainties[0]!.code).toBe('AMBIGUOUS_TARGET_OFFSET');
  });

  test.each([
    { label: 'non-array evidence container', evidence: { start: 0, end: 1, quote: RAT_WARLOCK_SOURCE.slice(0, 1) } },
    { label: 'empty evidence object', evidence: [{}] },
    {
      label: 'out-of-range empty quote',
      evidence: [{ start: RAT_WARLOCK_SOURCE.length + 1, end: RAT_WARLOCK_SOURCE.length + 2, quote: '' }],
    },
  ])('keeps process uncertainty when IR contains $label', ({ evidence }) => {
    const ir = buildRatWarlockIr() as any;
    ir.uncertainties = [{
      id: 'offset-conflict', code: 'coverage-offset-conflict', path: '/coverage',
      message: 'Candidate end conflicts with source length.', blocking: true,
      evidence: [ir.coverage.at(-1)],
    }];
    ir.claims[0].evidence = evidence;

    const anchored = anchorIrEvidence(RAT_WARLOCK_SOURCE, {
      id: 'rat-warlock', label: 'Rat Warlock', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE,
    }, ir);

    expect(anchored.uncertainties).toHaveLength(1);
  });

  test('keeps process uncertainty when nested abilityEvidence is malformed', () => {
    const ir = buildRatWarlockIr() as any;
    ir.uncertainties = [{
      id: 'offset-conflict', code: 'coverage-offset-conflict', path: '/coverage',
      message: 'Candidate end conflicts with source length.', blocking: true,
      evidence: [ir.coverage.at(-1)],
    }];
    ir.creature.spellcasting[0].abilityEvidence = [{}];

    const anchored = anchorIrEvidence(RAT_WARLOCK_SOURCE, {
      id: 'rat-warlock', label: 'Rat Warlock', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE,
    }, ir);

    expect(anchored.uncertainties).toHaveLength(1);
  });

  test('dry run validates and estimates without calling a provider or writing a bundle', async () => {
    const result = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt', dryRun: true });
    expect(result.status).toBe('dry_run');
    expect(result.discoveryCount).toBe(1);
    expect(result.estimatedMaxCalls).toBeGreaterThan(0);
    expect(result.runPath).toBe('');
  });

  test.each(['12', '14'] as const)('accepts, bundles, and promotes through the project workflow for v%s', async (fvttVersion) => {
    const provider = new FakeProvider();
    const paths = roots();
    const result = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt', fvttVersion, effectProfile: 'core', ...paths }, provider);
    expect(result.status).toBe('succeeded');
    expect(result.creatures).toHaveLength(1);
    expect(result.creatures[0]!.status).toBe('accepted');
    expect(existsSync(join(result.runPath, 'source.txt'))).toBe(true);
    expect(existsSync(join(result.runPath, 'creatures/lurker/intake-ir.json'))).toBe(true);
    expect(existsSync(join(result.runPath, 'creatures/lurker/standard.md'))).toBe(true);
    expect(existsSync(join(result.runPath, 'creatures/lurker/candidate-actor.json'))).toBe(true);
    expect(existsSync(join(result.runPath, 'creatures/lurker/actor.json'))).toBe(true);
    expect(result.creatures[0]!.markdownPath).toEndWith('lurker-in-the-dark.md');
    expect(result.creatures[0]!.actorPath).toEndWith('lurker-in-the-dark.json');
    expect(JSON.parse(readFileSync(result.creatures[0]!.actorPath!, 'utf-8')).name).toContain('暗影潜妖');
  });

  test('uses the injected conversion port for both candidate verification and final promotion', async () => {
    const calls: Array<string | undefined> = [];
    const result = await runMonsterIntake({
      source: LURKER_SOURCE,
      sourceName: 'lurker.txt',
      fvttVersion: '14',
      effectProfile: 'core',
      ...roots(),
    }, new FakeProvider(), {
      async convertMarkdownContentToJson(options) {
        calls.push(options.outputPath);
        return convertWithPackageWorkflow(options);
      },
    });

    expect(result.status).toBe('succeeded');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEndWith('candidate-actor.json');
    expect(calls[1]).toBe(result.creatures[0]!.actorPath);
  });

  test('promotes the exact workflow Actor after Intake accepts literal-review-only diagnostics', async () => {
    const calls: Array<string | undefined> = [];
    const result = await runMonsterIntake({
      source: LURKER_SOURCE,
      sourceName: 'lurker-literal-review.md',
      fvttVersion: '14',
      effectProfile: 'core',
      ...roots(),
    }, new FakeProvider(), {
      async convertMarkdownContentToJson(options) {
        calls.push(options.outputPath);
        const conversion = await convertWithPackageWorkflow({ ...options, outputPath: undefined });
        return {
          ...conversion,
          status: 'needs_review',
          diagnostics: [{
            code: 'GEN_LITERAL_REVIEW_REQUIRED', severity: 'warning', stage: 'semantic',
            path: 'actor/test', message: 'Literal source mechanic needs Intake review.', evidence: [],
          }],
        };
      },
    });

    expect(result.status).toBe('succeeded');
    expect(calls).toHaveLength(2);
    expect(existsSync(result.creatures[0]!.actorPath!)).toBe(true);
    expect(JSON.parse(readFileSync(result.creatures[0]!.actorPath!, 'utf-8')).name).toContain('Lurker');
  });

  test('keeps an accepted Rat Warlock portable while exposing spell resolution as pending', async () => {
    const result = await runMonsterIntake({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'rat-warlock.raw.txt',
      fvttVersion: '14',
      effectProfile: 'core',
      ...roots(),
    }, new RatWarlockProvider());

    expect(result.status).toBe('succeeded');
    expect(result.creatures[0]).toMatchObject({
      status: 'accepted',
      spellResolution: {
        required: true,
        status: 'pending',
        spellCount: 10,
      },
    });
    const actor = JSON.parse(readFileSync(result.creatures[0]!.actorPath!, 'utf-8'));
    expect(actor.flags['fvtt-json-generator-spell-resolver'].spellResolution.status).toBe('pending');
    expect(actor.items.filter((item: any) => item.type === 'spell')).toEqual([]);
  });

  test('adjudicates a duplicate-spellcasting reviewer finding when IR and projection prove one generated feat only', async () => {
    const provider = new RatWarlockProvider();
    provider.review = async () => ({
      schemaVersion: 1,
      verdict: 'revise',
      findings: [{
        id: 'false-duplicate', code: 'SPELL_GROUP_DUPLICATED_AS_TRAIT', path: '/markdown/traits',
        message: 'The generated visible spellcasting feat is duplicated.', blocking: true, origin: 'ai-review',
      }, {
        id: 'false-skill-label', code: 'MARKDOWN_SKILL_DRIFT', path: '/markdown/skills/localized-label',
        message: 'A canonical localized skill label changed.', blocking: true, origin: 'ai-review',
      }, {
        id: 'false-usage-boundary', code: 'SPELL_USAGE_EVIDENCE_INCOMPLETE',
        path: '/ir/creature/spellcasting/0/usageGroups/0',
        message: 'The exact grant allegedly omits a line terminator.', blocking: true, origin: 'ai-review',
      }],
    });

    const intake = await runMonsterIntake({
      source: RAT_WARLOCK_SOURCE, sourceName: 'rat-warlock.txt', fvttVersion: '14', effectProfile: 'core', ...roots(),
    }, provider);

    expect(intake.status).toBe('succeeded');
    expect(JSON.parse(readFileSync(join(intake.creatures[0]!.bundlePath, 'ai-review.raw.json'), 'utf-8')).verdict).toBe('revise');
    expect(JSON.parse(readFileSync(join(intake.creatures[0]!.bundlePath, 'ai-review.json'), 'utf-8'))).toEqual({
      schemaVersion: 1, verdict: 'accepted', findings: [],
    });
  });

  test('keeps a reviewer component-waiver finding when the original candidate source still states the omitted waiver', () => {
    const ir = buildRatWarlockIr();
    const group = ir.creature.spellcasting![0]!;
    group.componentWaivers = [];
    group.description = group.description.replace('无需材料成分', '');
    const review: AiReviewResult = {
      schemaVersion: 1,
      verdict: 'revise',
      findings: [{
        id: 'lost-waiver', code: 'SPELL_COMPONENT_WAIVER_LOST',
        path: '/creature/spellcasting/0/componentWaivers',
        message: 'The source material waiver was omitted from the IR and Actor.',
        blocking: true, origin: 'ai-review',
      }],
    };

    const adjudicated = adjudicateReview(RAT_WARLOCK_SOURCE, {
      id: 'rat-warlock', label: 'Rat Warlock', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE,
    }, ir, {}, review);

    expect(adjudicated.verdict).toBe('revise');
    expect(adjudicated.findings).toContainEqual(expect.objectContaining({ id: 'lost-waiver', blocking: true }));
  });

  test('adjudicates Foundry legendary activation as the supported mythic representation only when the mythic section survives', () => {
    const ir = buildValidLurkerIr();
    ir.creature.mythicActions = [{ name: 'Dream of Creation', description: 'The creature summons an ally.' }];
    const review: AiReviewResult = {
      schemaVersion: 1,
      verdict: 'revise',
      findings: [{
        id: 'mythic-activation', code: 'ACTOR_ACTION_ECONOMY_DRIFT', path: '/actorProjection/items/0/activation',
        message: 'Mythic action uses legendary activation.', blocking: true, origin: 'ai-review',
      }],
    };
    const candidate = { id: 'lurker', label: 'Lurker', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE };

    expect(adjudicateReview(LURKER_SOURCE, candidate, ir, {
      items: [{ name: 'Dream of Creation', activation: 'legendary', section: '\u795e\u8bdd\u52a8\u4f5c' }],
    }, review)).toMatchObject({ verdict: 'accepted', findings: [] });

    expect(adjudicateReview(LURKER_SOURCE, candidate, ir, {
      items: [{ name: 'Dream of Creation', activation: 'legendary', section: 'Legendary Actions' }],
    }, review)).toMatchObject({ verdict: 'revise', findings: [{ id: 'mythic-activation' }] });
  });

  test('keeps deterministic spell resolution pending when an unrelated AI biography finding needs review', async () => {
    const provider = new RatWarlockProvider();
    provider.reviewVerdict = 'needs_review';
    const result = await runMonsterIntake({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'rat-warlock.raw.txt',
      fvttVersion: '14',
      effectProfile: 'core',
      ...roots(),
    }, provider);

    expect(result.status).toBe('needs_review');
    expect(result.creatures[0]!.findings).toContainEqual(expect.objectContaining({ code: 'BIOGRAPHY_REVIEW' }));
    expect(result.creatures[0]!.spellResolution).toMatchObject({ required: true, status: 'pending', spellCount: 10 });
  });

  test('keeps spell resolution pending when deterministic validation blocks only an unrelated actor field', async () => {
    const provider = new RatWarlockProvider();
    const invalidIr = () => {
      const ir = buildRatWarlockIr() as any;
      ir.creature.identity.name = '';
      return ir;
    };
    provider.extract = async () => invalidIr();
    provider.repair = async () => invalidIr();

    const result = await runMonsterIntake({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'rat-warlock.raw.txt',
      fvttVersion: '14',
      effectProfile: 'core',
      ...roots(),
    }, provider);

    expect(result.status).toBe('needs_review');
    expect(result.creatures[0]!.findings).toContainEqual(expect.objectContaining({
      path: '/creature/identity/name',
      blocking: true,
    }));
    expect(result.creatures[0]!.spellResolution).toMatchObject({ required: true, status: 'pending', spellCount: 10 });
  });

  test('marks spell resolution needs_review when AI review blocks a spell-specific path', async () => {
    const provider = new RatWarlockProvider();
    provider.review = async () => ({
      schemaVersion: 1,
      verdict: 'needs_review',
      findings: [{
        id: 'spell-review',
        code: 'SPELL_REVIEW',
        path: '/creature/spellcasting/0/usageGroups/0',
        message: 'The explicit spell grant needs human review.',
        blocking: true,
        origin: 'ai-review',
      }],
    });

    const result = await runMonsterIntake({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'rat-warlock.raw.txt',
      fvttVersion: '14',
      effectProfile: 'core',
      ...roots(),
    }, provider);

    expect(result.status).toBe('needs_review');
    expect(result.creatures[0]!.spellResolution).toMatchObject({ required: true, status: 'needs_review', spellCount: 10 });
  });

  test('re-verifies an identical promoted caster Actor and requires explicit replace before regeneration', async () => {
    const paths = roots();
    const first = await runMonsterIntake({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'rat-warlock.raw.txt',
      fvttVersion: '14',
      effectProfile: 'core',
      ...paths,
    }, new RatWarlockProvider());
    const actorPath = first.creatures[0]!.actorPath!;
    const mutatedActor = JSON.parse(readFileSync(actorPath, 'utf-8'));
    mutatedActor.flags['fvtt-json-generator-spell-resolver'].spellResolution.status = 'hydrated';
    mutatedActor.items.push({ name: 'Placeholder: Fireball', type: 'spell', system: {} });
    writeFileSync(actorPath, JSON.stringify(mutatedActor, null, 2));

    const blocked = await runMonsterIntake({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'rat-warlock.raw.txt',
      fvttVersion: '14',
      effectProfile: 'core',
      ...paths,
    }, new RatWarlockProvider());

    expect(blocked.status).toBe('needs_review');
    expect(blocked.creatures[0]!.findings).toContainEqual(expect.objectContaining({ code: 'TARGET_CONFLICT' }));
    expect(blocked.creatures[0]!.spellResolution).toMatchObject({ required: true, status: 'pending', spellCount: 10 });
    expect(JSON.parse(readFileSync(actorPath, 'utf-8')).items.some((item: any) => item.type === 'spell')).toBe(true);

    const decisionsPath = join(blocked.runPath, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify({
      runId: blocked.runId,
      sourceSha256: blocked.sourceSha256,
      decisions: [{ issueId: 'target-conflict:rat-warlock', action: 'select', value: 'replace' }],
    }));
    const resumed = await resumeMonsterIntake(blocked.runPath, decisionsPath, new RatWarlockProvider(), paths.vaultPath);
    const regenerated = JSON.parse(readFileSync(resumed.creatures[0]!.actorPath!, 'utf-8'));

    expect(resumed.status).toBe('succeeded');
    expect(regenerated.flags['fvtt-json-generator-spell-resolver'].spellResolution.status).toBe('pending');
    expect(regenerated.items.some((item: any) => item.type === 'spell')).toBe(false);
    expect(regenerated.items.some((item: any) => Object.values(item.system?.activities ?? {}).some((activity: any) => (
      activity.type === 'cast'
      || activity.flags?.['fvtt-json-generator-spell-resolver']?.managed === true
    )))).toBe(false);
  });

  test('requires canonical generated-Actor equality before reusing a published target', async () => {
    const paths = roots();
    const first = await runMonsterIntake({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'rat-warlock.raw.txt',
      fvttVersion: '14',
      effectProfile: 'core',
      ...paths,
    }, new RatWarlockProvider());
    const actorPath = first.creatures[0]!.actorPath!;
    const actor = JSON.parse(readFileSync(actorPath, 'utf-8'));
    actor.items.push({
      name: 'User-added harmless feature',
      type: 'feat',
      system: { description: { value: 'Not represented by this intake source.' }, activities: {} },
      effects: [],
      flags: {},
    });
    writeFileSync(actorPath, JSON.stringify(actor, null, 2));

    const blocked = await runMonsterIntake({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'rat-warlock.raw.txt',
      fvttVersion: '14',
      effectProfile: 'core',
      ...paths,
    }, new RatWarlockProvider());

    expect(blocked.status).toBe('needs_review');
    expect(blocked.creatures[0]!.findings).toContainEqual(expect.objectContaining({
      code: 'TARGET_CONFLICT',
      message: expect.stringContaining('/items'),
    }));
    expect(JSON.parse(readFileSync(actorPath, 'utf-8')).items.some((item: any) => item.name === 'User-added harmless feature')).toBe(true);

    const decisionsPath = join(blocked.runPath, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify({
      runId: blocked.runId,
      sourceSha256: blocked.sourceSha256,
      decisions: [{ issueId: 'target-conflict:rat-warlock', action: 'select', value: 'replace' }],
    }));
    const resumed = await resumeMonsterIntake(blocked.runPath, decisionsPath, new RatWarlockProvider(), paths.vaultPath);

    expect(resumed.status).toBe('succeeded');
    expect(JSON.parse(readFileSync(actorPath, 'utf-8')).items.some((item: any) => item.name === 'User-added harmless feature')).toBe(false);
  });

  test('blocks reuse when the published caster JSON has only a premature Cast Activity', async () => {
    const paths = roots();
    const first = await runMonsterIntake({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'rat-warlock.raw.txt',
      fvttVersion: '14',
      effectProfile: 'core',
      ...paths,
    }, new RatWarlockProvider());
    const actorPath = first.creatures[0]!.actorPath!;
    const actor = JSON.parse(readFileSync(actorPath, 'utf-8'));
    const item = actor.items.find((candidate: any) => Object.keys(candidate.system?.activities ?? {}).length > 0);
    (Object.values(item.system.activities)[0] as any).type = 'cast';
    writeFileSync(actorPath, JSON.stringify(actor, null, 2));

    const blocked = await runMonsterIntake({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'rat-warlock.raw.txt',
      fvttVersion: '14',
      effectProfile: 'core',
      ...paths,
    }, new RatWarlockProvider());

    expect(blocked.status).toBe('needs_review');
    expect(blocked.creatures[0]!.findings).toContainEqual(expect.objectContaining({
      code: 'TARGET_CONFLICT',
      message: expect.stringContaining('PORTABLE_ACTOR_CAST_ACTIVITY'),
    }));
    expect(blocked.creatures[0]!.spellResolution.status).toBe('pending');
    expect(JSON.parse(readFileSync(actorPath, 'utf-8')).items.some((candidate: any) => candidate.type === 'spell')).toBe(false);
  });

  test('leaves non-caster intake acceptance unchanged with spell resolution not required', async () => {
    const result = await runMonsterIntake({
      source: LURKER_SOURCE,
      sourceName: 'lurker.txt',
      fvttVersion: '14',
      effectProfile: 'core',
      ...roots(),
    }, new FakeProvider());

    expect(result.creatures[0]).toMatchObject({
      status: 'accepted',
      spellResolution: { required: false, status: 'not-required', spellCount: 0 },
    });
  });

  test('reports malformed caster intake as spell resolution needing review without crashing', async () => {
    const provider = new RatWarlockProvider();
    const invalidIr = () => {
      const ir = buildRatWarlockIr() as any;
      ir.creature.spellcasting = [null];
      return ir;
    };
    provider.extract = async () => invalidIr();
    provider.repair = async () => invalidIr();

    const result = await runMonsterIntake({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'rat-warlock.raw.txt',
      fvttVersion: '14',
      effectProfile: 'core',
      ...roots(),
    }, provider);

    expect(result.status).toBe('needs_review');
    expect(result.creatures[0]!.spellResolution).toMatchObject({ required: true, status: 'needs_review', spellCount: 0 });
  });

  test('performs at most one semantic repair and then requires review', async () => {
    const provider = new FakeProvider();
    provider.reviewVerdicts = ['revise', 'revise'];
    const result = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt', ...roots() }, provider);
    expect(result.status).toBe('needs_review');
    expect(provider.extractionCalls).toBe(1);
    expect(provider.reviewCalls).toBe(2);
    expect(provider.repairCalls).toBe(1);
    expect(result.creatures[0]!.calls).toEqual({ extraction: 1, review: 2, repair: 1 });
  });

  test('uses the single repair budget for initial deterministic blockers before rendering', async () => {
    const provider = new FakeProvider();
    provider.extract = async () => {
      provider.extractionCalls += 1;
      return buildDeterministicallyInvalidLurkerIr();
    };

    const result = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt', ...roots() }, provider);

    expect(result.status).toBe('succeeded');
    expect(result.creatures[0]!.calls).toEqual({ extraction: 1, review: 1, repair: 1 });
    expect(provider.repairRequests).toHaveLength(1);
    expect(provider.repairRequests[0]).toMatchObject({
      stage: 'deterministic-validation',
      source: LURKER_SOURCE,
      deterministicFindings: expect.arrayContaining([expect.objectContaining({
        code: 'MISSING_REQUIRED_CLAIM', path: '/creature/attributes/ac', blocking: true,
      })]),
    });
    expect(provider.repairRequests[0]).not.toHaveProperty('markdown');
    expect(provider.repairRequests[0]).not.toHaveProperty('actorProjection');
    expect(provider.repairRequests[0]).not.toHaveProperty('review');
  });

  test('returns needs_review without rendering when deterministic repair is still invalid', async () => {
    const provider = new FakeProvider();
    provider.extract = async () => buildDeterministicallyInvalidLurkerIr();
    provider.repair = async (request) => {
      provider.repairCalls += 1;
      provider.repairRequests.push(request);
      return buildDeterministicallyInvalidLurkerIr();
    };

    const result = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt', ...roots() }, provider);
    const creature = result.creatures[0]!;

    expect(result.status).toBe('needs_review');
    expect(creature.calls).toEqual({ extraction: 1, review: 0, repair: 1 });
    expect(existsSync(join(creature.bundlePath, 'standard.md'))).toBe(false);
    expect(existsSync(join(creature.bundlePath, 'candidate-actor.json'))).toBe(false);
  });

  test('does not make a second repair when deterministic repair is followed by reviewer revise', async () => {
    const provider = new FakeProvider();
    provider.extract = async () => buildDeterministicallyInvalidLurkerIr();
    provider.reviewVerdicts = ['revise'];

    const result = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt', ...roots() }, provider);

    expect(result.status).toBe('needs_review');
    expect(result.creatures[0]!.calls).toEqual({ extraction: 1, review: 1, repair: 1 });
    expect(provider.repairRequests).toHaveLength(1);
    expect(provider.repairRequests[0]).toMatchObject({ stage: 'deterministic-validation' });
  });

  test('fails closed when the deterministic repair provider call fails', async () => {
    const provider = new FakeProvider();
    provider.extract = async () => buildDeterministicallyInvalidLurkerIr();
    provider.repair = async (request) => {
      provider.repairCalls += 1;
      provider.repairRequests.push(request);
      throw new Error('repair provider unavailable');
    };

    const result = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt', ...roots() }, provider);
    const creature = result.creatures[0]!;

    expect(result.status).toBe('failed');
    expect(creature.calls).toEqual({ extraction: 1, review: 0, repair: 1 });
    expect(creature.findings).toContainEqual(expect.objectContaining({
      code: 'PROVIDER_FAILURE', message: 'repair provider unavailable', blocking: true,
    }));
    expect(existsSync(join(creature.bundlePath, 'standard.md'))).toBe(false);
  });

  test('reuses identical promoted content but blocks a conflicting target', async () => {
    const paths = roots();
    const first = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt', ...paths }, new FakeProvider());
    const second = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt', ...paths }, new FakeProvider());
    expect(second.status).toBe('succeeded');
    writeFileSync(first.creatures[0]!.markdownPath!, 'different user content');
    const conflict = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt', ...paths }, new FakeProvider());
    expect(conflict.status).toBe('needs_review');
    expect(conflict.creatures[0]!.findings.some((finding) => finding.code === 'TARGET_CONFLICT')).toBe(true);
    expect(existsSync(join(conflict.runPath, 'creatures/lurker/actor.json'))).toBe(false);
  });

  test('fails rather than silently accepting zero discovered monsters', async () => {
    const provider = new FakeProvider();
    provider.discover = async () => ({ schemaVersion: 1, candidates: [] });
    await expect(runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt', ...roots() }, provider))
      .rejects.toThrow('discovered 0 monsters');
  });

  test('resumes a target-conflict decision, backs up, and regenerates instead of patching JSON', async () => {
    const paths = roots();
    const first = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt', ...paths }, new FakeProvider());
    writeFileSync(first.creatures[0]!.markdownPath!, 'existing conflicting markdown');
    writeFileSync(first.creatures[0]!.actorPath!, '{"name":"existing actor"}');
    const blocked = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt', ...paths }, new FakeProvider());
    const storedIrPath = join(blocked.runPath, 'creatures/lurker/intake-ir.json');
    const storedIr = JSON.parse(readFileSync(storedIrPath, 'utf-8'));
    storedIr.creature.actions[1].activityType = 'action';
    writeFileSync(storedIrPath, JSON.stringify(storedIr, null, 2));
    const decisionsPath = join(blocked.runPath, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify({
      runId: blocked.runId,
      sourceSha256: blocked.sourceSha256,
      decisions: [{ issueId: 'target-conflict:lurker', action: 'select', value: 'replace' }],
    }));
    const resumed = await resumeMonsterIntake(blocked.runPath, decisionsPath, new FakeProvider(), paths.vaultPath);
    expect(resumed.status).toBe('succeeded');
    expect(JSON.parse(readFileSync(storedIrPath, 'utf-8')).creature.actions[1].activityType).toBe('attack');
    expect(JSON.parse(readFileSync(resumed.creatures[0]!.actorPath!, 'utf-8')).name).toContain('暗影潜妖');
    expect(readFileSync(join(blocked.runPath, 'backups/lurker/lurker-in-the-dark.md'), 'utf-8')).toBe('existing conflicting markdown');
    expect(readFileSync(join(blocked.runPath, 'backups/lurker/lurker-in-the-dark.json'), 'utf-8')).toContain('existing actor');
  });

  test('does not use deterministic AI repair to overwrite a user-confirmed resumed IR', async () => {
    const paths = roots();
    const initialProvider = new FakeProvider();
    initialProvider.reviewVerdicts = ['needs_review'];
    const blocked = await runMonsterIntake(
      { source: LURKER_SOURCE, sourceName: 'lurker.txt', ...paths },
      initialProvider,
    );
    const storedIrPath = join(blocked.runPath, 'creatures/lurker/intake-ir.json');
    const storedIr = JSON.parse(readFileSync(storedIrPath, 'utf-8')) as MonsterIntakeIR;
    storedIr.claims = storedIr.claims.filter((claim) => claim.path !== '/creature/attributes/ac');
    storedIr.uncertainties.push({
      id: 'resume-user-choice',
      code: 'USER_CHOICE',
      path: '/creature/biography',
      message: 'Choose the literal biography handling.',
      blocking: true,
      evidence: [{ start: 0, end: 4, quote: LURKER_SOURCE.slice(0, 4) }],
      candidates: ['preserve this literal choice'],
    });
    writeFileSync(storedIrPath, JSON.stringify(storedIr, null, 2));
    const decisionsPath = join(blocked.runPath, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify({
      runId: blocked.runId,
      sourceSha256: blocked.sourceSha256,
      decisions: [{ issueId: 'resume-user-choice', action: 'select', value: 'preserve this literal choice' }],
    }));
    const resumeProvider = new FakeProvider();

    const resumed = await resumeMonsterIntake(blocked.runPath, decisionsPath, resumeProvider, paths.vaultPath);
    const resumedIr = JSON.parse(readFileSync(storedIrPath, 'utf-8')) as MonsterIntakeIR;

    expect(resumed.status).toBe('needs_review');
    expect(resumed.creatures[0]!.calls).toEqual({ extraction: 0, review: 0, repair: 0 });
    expect(resumeProvider.repairCalls).toBe(0);
    expect(resumedIr.claims).toContainEqual(expect.objectContaining({
      path: '/creature/biography',
      valueKind: 'user-confirmed',
      value: 'preserve this literal choice',
      decisionId: 'resume-user-choice',
    }));
    expect(resumedIr.claims.some((claim) => claim.path === '/creature/attributes/ac')).toBe(false);
  });

  test('does not use semantic AI repair to overwrite a deterministically valid resumed IR', async () => {
    const paths = roots();
    const initialProvider = new FakeProvider();
    initialProvider.reviewVerdicts = ['needs_review'];
    const blocked = await runMonsterIntake(
      { source: LURKER_SOURCE, sourceName: 'lurker.txt', ...paths },
      initialProvider,
    );
    const storedIrPath = join(blocked.runPath, 'creatures/lurker/intake-ir.json');
    const storedIr = JSON.parse(readFileSync(storedIrPath, 'utf-8')) as MonsterIntakeIR;
    const confirmedClaim = storedIr.claims.find((claim) => claim.path === '/creature/identity/name')!;
    confirmedClaim.valueKind = 'user-confirmed';
    confirmedClaim.value = storedIr.creature.identity.name;
    confirmedClaim.decisionId = 'resume-confirmed-name';
    writeFileSync(storedIrPath, JSON.stringify(storedIr, null, 2));
    const decisionsPath = join(blocked.runPath, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify({
      runId: blocked.runId,
      sourceSha256: blocked.sourceSha256,
      decisions: [],
    }));
    const resumeProvider = new FakeProvider();
    resumeProvider.reviewVerdicts = ['revise'];

    const resumed = await resumeMonsterIntake(blocked.runPath, decisionsPath, resumeProvider, paths.vaultPath);
    const resumedIr = JSON.parse(readFileSync(storedIrPath, 'utf-8')) as MonsterIntakeIR;

    expect(resumed.status).toBe('needs_review');
    expect(resumed.creatures[0]!.calls).toEqual({ extraction: 0, review: 1, repair: 0 });
    expect(resumeProvider.repairCalls).toBe(0);
    expect(resumedIr.claims).toContainEqual(expect.objectContaining({
      path: '/creature/identity/name',
      valueKind: 'user-confirmed',
      value: storedIr.creature.identity.name,
      decisionId: 'resume-confirmed-name',
    }));
  });

  test('rejects resume decisions for a different source hash', async () => {
    const paths = roots();
    const provider = new FakeProvider();
    provider.reviewVerdicts = ['needs_review'];
    const blocked = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt', ...paths }, provider);
    const decisionsPath = join(blocked.runPath, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify({ runId: blocked.runId, sourceSha256: 'wrong', decisions: [] }));
    await expect(resumeMonsterIntake(blocked.runPath, decisionsPath, new FakeProvider(), paths.vaultPath))
      .rejects.toThrow('sourceSha256');
  });
});

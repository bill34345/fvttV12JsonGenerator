import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { anchorIrEvidence, chunkSource, normalizeDiscovery, partitionDiscoveryCandidates, resumeMonsterIntake, runMonsterIntake } from '../orchestrator';
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
import { buildRatWarlockIr, RAT_WARLOCK_SOURCE } from './fixtures/rat-warlock';

class FakeProvider implements MonsterIntakeAiProvider {
  readonly providerName = 'fake';
  readonly extractionModel = 'fake-extract';
  readonly reviewModel = 'fake-review';
  discoveryCalls = 0;
  extractionCalls = 0;
  reviewCalls = 0;
  repairCalls = 0;
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
  async repair(_request: RepairRequest): Promise<MonsterIntakeIR> { this.repairCalls += 1; return buildValidLurkerIr(); }
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

describe('AI monster intake orchestrator', () => {
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

  test('normalizes model-overloaded AC notes and feature activity types into stable IR fields', () => {
    const ir = buildValidLurkerIr();
    (ir.creature.attributes as unknown as { acKind: string }).acKind = '（有法师护甲时15）';
    (ir.creature.actions[1] as unknown as { activityType: string }).activityType = 'action';
    (ir.creature.traits[2] as unknown as { activityType: string }).activityType = 'bonus';
    ir.creature.languages.values = ['通用语'];
    ir.creature.actions[1]!.damage![0]!.type = '穿刺';

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
    expect(anchored.creature.languages.values).toEqual(['common']);
    expect(anchored.creature.actions[1]!.damage![0]!.type).toBe('piercing');
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
    provider.extract = async () => {
      const ir = buildRatWarlockIr() as any;
      ir.creature.spellcasting = [null];
      return ir;
    };

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

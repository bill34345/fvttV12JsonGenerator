import { afterEach, describe, expect, test } from 'bun:test';
import type {
  AiReviewResult,
  DiscoveryRequest,
  DiscoveryResult,
  ExtractionRequest,
  MonsterIntakeAiProvider,
  MonsterIntakeIR,
  RepairRequest,
  ReviewRequest,
} from '../../../../../../src/core/intake/types';
import { buildValidLurkerIr, LURKER_SOURCE } from '../../../../../../src/core/intake/__tests__/fixtures/lurker';
import { buildRatWarlockIr, RAT_WARLOCK_SOURCE } from '../../../../../../src/core/intake/__tests__/fixtures/rat-warlock';
import { createJob, getJob, resetJobsForTests } from '../jobStore';
import { runJob } from '../jobRunner';

class WebFakeProvider implements MonsterIntakeAiProvider {
  readonly providerName = 'fake';
  readonly extractionModel = 'fake';
  readonly reviewModel = 'fake-review';
  constructor(private readonly verdict: AiReviewResult['verdict'] = 'accepted') {}
  async discover(_request: DiscoveryRequest): Promise<DiscoveryResult> {
    return { schemaVersion: 1, candidates: [{ id: 'lurker', label: '暗影潜妖', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE }] };
  }
  async extract(_request: ExtractionRequest): Promise<MonsterIntakeIR> { return buildValidLurkerIr(); }
  async review(_request: ReviewRequest): Promise<AiReviewResult> {
    return {
      schemaVersion: 1,
      verdict: this.verdict,
      findings: this.verdict === 'accepted' ? [] : [{ id: 'human-choice', code: 'AMBIGUOUS_VALUE', path: '/creature/attributes/ac', message: '需要确认 AC', blocking: true, origin: 'ai-review', candidates: [14, 15], evidence: [{ start: LURKER_SOURCE.indexOf('AC 14'), end: LURKER_SOURCE.indexOf('AC 14') + 5, quote: 'AC 14' }] }],
    };
  }
  async repair(_request: RepairRequest): Promise<MonsterIntakeIR> { return buildValidLurkerIr(); }
}

class WebRatWarlockProvider implements MonsterIntakeAiProvider {
  readonly providerName = 'fake';
  readonly extractionModel = 'fake';
  readonly reviewModel = 'fake-review';
  ir: MonsterIntakeIR = buildRatWarlockIr();
  async discover(): Promise<DiscoveryResult> {
    return {
      schemaVersion: 1,
      candidates: [{ id: 'rat-warlock', label: '鼠神邪术师', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE }],
    };
  }
  async extract(): Promise<MonsterIntakeIR> { return structuredClone(this.ir); }
  async review(): Promise<AiReviewResult> { return { schemaVersion: 1, verdict: 'accepted', findings: [] }; }
  async repair(): Promise<MonsterIntakeIR> { return buildRatWarlockIr(); }
}

afterEach(() => resetJobsForTests());

describe('Web AI monster intake job', () => {
  test('registers formal Actor JSON only for accepted creatures', async () => {
    const job = createJob('ai-monster-intake', 'test');
    await runJob(job, { type: 'ai-monster-intake', fileName: 'lurker.txt', content: LURKER_SOURCE, options: { fvttVersion: '14', effectProfile: 'core' } }, { monsterIntakeProvider: new WebFakeProvider() });
    const finished = getJob(job.id)!;
    expect(finished.status).toBe('succeeded');
    expect(finished.files.some((file) => file.fileName.endsWith('-actor.json'))).toBe(true);
    expect(finished.files.some((file) => file.fileName.includes('candidate-actor'))).toBe(false);
  });

  test('registers a portable caster Actor without claiming target-world hydration', async () => {
    const job = createJob('ai-monster-intake', 'test');
    await runJob(job, {
      type: 'ai-monster-intake',
      fileName: 'rat-warlock.txt',
      content: RAT_WARLOCK_SOURCE,
      options: { fvttVersion: '14', effectProfile: 'core' },
    }, { monsterIntakeProvider: new WebRatWarlockProvider() });
    const finished = getJob(job.id)!;
    const creature = (finished.summary?.creatures as any[])[0];
    const actorFile = finished.files.find((file) => file.fileName === 'rat-warlock-actor.json');
    const actor = JSON.parse(await Bun.file(actorFile!.path).text());

    expect(finished.status).toBe('succeeded');
    expect(creature.status).toBe('accepted');
    expect(creature.spellResolution).toEqual({
      required: true,
      status: 'pending',
      spellCount: 10,
      manifestId: actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.manifestId,
    });
    expect(actor.flags['fvtt-json-generator-spell-resolver'].spellResolution.status).toBe('pending');
    expect(actor.items.some((item: any) => item.type === 'spell')).toBe(false);
    expect(actor.items.some((item: any) => Object.values(item.system?.activities ?? {}).some((activity: any) => (
      activity.type === 'cast'
      || activity.flags?.['fvtt-json-generator-spell-resolver']?.managed === true
    )))).toBe(false);
    expect(JSON.stringify(finished.summary)).not.toContain('"status":"hydrated"');
    expect(JSON.stringify(finished.summary)).not.toContain('reportPath');
    expect(JSON.stringify(finished.summary)).not.toContain('bundlePath');
    expect(JSON.stringify(finished.summary)).not.toContain(finished.files[0]!.path);
  });

  test('does not expose local report paths in registered downloadable deterministic reports', async () => {
    const provider = new WebRatWarlockProvider();
    (provider.ir.creature.spellcasting as any) = [null];
    provider.repair = async () => structuredClone(provider.ir);
    const job = createJob('ai-monster-intake', 'test');
    await runJob(job, {
      type: 'ai-monster-intake',
      fileName: 'rat-warlock-invalid.txt',
      content: RAT_WARLOCK_SOURCE,
      options: { fvttVersion: '14', effectProfile: 'core' },
    }, { monsterIntakeProvider: provider });
    const finished = getJob(job.id)!;
    const reportFiles = finished.files.filter((file) => /deterministic-report\.(?:json|md)$/u.test(file.fileName));

    expect(finished.status).toBe('needs_review');
    expect((finished.summary?.creatures as any[])[0]?.calls.repair).toBe(1);
    expect(reportFiles).toHaveLength(2);
    for (const file of reportFiles) {
      const content = await Bun.file(file.path).text();
      expect(content).not.toContain('reportPath');
      expect(content).not.toContain('bundlePath');
      expect(content).not.toContain(file.path.replace(/deterministic-report\.(?:json|md)$/u, ''));
    }
  });

  test('exposes the review bundle and evidence but gates candidate Actor JSON', async () => {
    const job = createJob('ai-monster-intake', 'test');
    await runJob(job, { type: 'ai-monster-intake', fileName: 'lurker.txt', content: LURKER_SOURCE }, { monsterIntakeProvider: new WebFakeProvider('needs_review') });
    const finished = getJob(job.id)!;
    expect(finished.status).toBe('needs_review');
    expect(finished.files.some((file) => file.fileName.endsWith('-actor.json'))).toBe(false);
    expect(finished.files.some((file) => file.fileName.includes('candidate-actor'))).toBe(false);
    expect(finished.files.some((file) => file.fileName.includes('intake-ir'))).toBe(true);
    expect(JSON.stringify(finished.summary)).toContain('AC 14');
    expect(finished.logs.at(-1)?.message).toContain('需要人工确认');
  });

});

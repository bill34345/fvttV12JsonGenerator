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
} from '../../../../core/intake/types';
import { buildValidLurkerIr, LURKER_SOURCE } from '../../../../core/intake/__tests__/fixtures/lurker';
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

  test('legacy Web plaintext job fails on zero discovered monsters', async () => {
    const job = createJob('ingest-plaintext', 'test');
    await runJob(job, { type: 'ingest-plaintext', fileName: 'lurker.txt', content: LURKER_SOURCE });
    expect(getJob(job.id)?.status).toBe('failed');
    expect(getJob(job.id)?.error?.message).toContain('detected 0 monsters');
  });
});

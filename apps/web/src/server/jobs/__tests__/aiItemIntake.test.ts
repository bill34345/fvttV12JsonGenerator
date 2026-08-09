import { afterEach, describe, expect, test } from 'bun:test';
import type {
  ItemAiReviewResult,
  ItemDiscoveryRequest,
  ItemDiscoveryResult,
  ItemExtractionRequest,
  ItemIntakeAiProvider,
  ItemIntakeIR,
  ItemRepairRequest,
  ItemReviewRequest,
} from '@fvtt-json-generator/intake-ai/item-types';
import {
  buildJewelOfThreePrayersIr,
  jewelCandidate,
  JEWEL_OF_THREE_PRAYERS_SOURCE,
} from '../../../../../../src/core/intake/__tests__/fixtures/jewel-of-three-prayers';
import { createJob, getJob, resetJobsForTests } from '../jobStore';
import { runJob } from '../jobRunner';

class WebItemProvider implements ItemIntakeAiProvider {
  readonly providerName = 'fake-item';
  readonly extractionModel = 'fake';
  readonly reviewModel = 'fake-review';
  async discover(_request: ItemDiscoveryRequest): Promise<ItemDiscoveryResult> {
    return { schemaVersion: 1, candidates: [jewelCandidate()] };
  }
  async extract(_request: ItemExtractionRequest): Promise<ItemIntakeIR> { return buildJewelOfThreePrayersIr(); }
  async review(_request: ItemReviewRequest): Promise<ItemAiReviewResult> { return { schemaVersion: 1, verdict: 'accepted', findings: [] }; }
  async repair(_request: ItemRepairRequest): Promise<ItemIntakeIR> { return buildJewelOfThreePrayersIr(); }
}

afterEach(() => resetJobsForTests());

describe('Web AI Item Intake job', () => {
  test('registers only accepted Item JSON plus reviewable Markdown and bundle evidence', async () => {
    const job = createJob('ai-item-intake', 'test');
    await runJob(job, {
      type: 'ai-item-intake',
      fileName: 'jewel.txt',
      content: JEWEL_OF_THREE_PRAYERS_SOURCE,
      options: { fvttVersion: '14', effectProfile: 'core' },
    }, { itemIntakeProvider: new WebItemProvider() });
    const finished = getJob(job.id)!;
    expect(finished.status).toBe('succeeded');
    expect((finished.summary?.items as any[])[0]).toEqual(expect.objectContaining({ id: 'jewel-of-three-prayers', status: 'accepted' }));
    expect(finished.files.some((file) => file.fileName === 'jewel-of-three-prayers-item.json')).toBe(true);
    expect(finished.files.some((file) => file.fileName === 'jewel-of-three-prayers.md')).toBe(true);
    expect(finished.files.some((file) => file.fileName.includes('candidate-item'))).toBe(false);
    expect(finished.files.some((file) => file.fileName.includes('intake-ir'))).toBe(true);
  });

  test('rejects non-V14/core Item Intake jobs before calling the provider', async () => {
    const job = createJob('ai-item-intake', 'test');
    await runJob(job, {
      type: 'ai-item-intake', fileName: 'jewel.txt', content: JEWEL_OF_THREE_PRAYERS_SOURCE,
      options: { fvttVersion: '12', effectProfile: 'core' },
    }, { itemIntakeProvider: new WebItemProvider() });
    expect(getJob(job.id)?.status).toBe('failed');
    expect(getJob(job.id)?.error?.message).toContain('Foundry V14');
  });
});

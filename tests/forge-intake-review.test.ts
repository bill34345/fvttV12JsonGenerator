import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  buildForgeIntakeReviewBundle,
  createForgeIntakeSnapshot,
  sameForgeIntakeSnapshot,
  serializeForgeIntakeReviewBundle,
  transitionForgeIntakeReviewStatus,
} from '../packages/forge-browser-runtime/src/intakeReview';

describe('Forge Intake review state and safe export', () => {
  test('enforces the review-required state machine without an override transition', () => {
    expect(transitionForgeIntakeReviewStatus('empty', 'analyze')).toBe('analyzing');
    expect(transitionForgeIntakeReviewStatus('analyzing', 'analysis_ready')).toBe('ready_to_generate');
    expect(transitionForgeIntakeReviewStatus('ready_to_generate', 'generate')).toBe('generating_and_reviewing');
    expect(transitionForgeIntakeReviewStatus('generating_and_reviewing', 'generation_needs_review')).toBe('needs_review');
    expect(transitionForgeIntakeReviewStatus('needs_review', 'repair')).toBe('repairing');
    expect(transitionForgeIntakeReviewStatus('repairing', 'repair_ready')).toBe('ready_to_generate');
    expect(transitionForgeIntakeReviewStatus('needs_review', 'regenerate')).toBe('regenerating');
    expect(transitionForgeIntakeReviewStatus('regenerating', 'regeneration_started')).toBe('analyzing');
    expect(transitionForgeIntakeReviewStatus('needs_review', 'reject')).toBe('rejected');
    expect(() => transitionForgeIntakeReviewStatus('needs_review', 'generation_accepted')).toThrow(/Invalid/u);
    expect(() => transitionForgeIntakeReviewStatus('rejected', 'generation_accepted')).toThrow(/Invalid/u);
  });

  test('invalidates source, display, mode, endpoint, model, object kind, and target without storing a key', () => {
    const base = {
      source: 'raw source',
      displayName: 'Rat',
      mode: 'ai-monster' as const,
      objectKind: 'actor' as const,
      endpoint: 'https://provider.example/v1?secret=query',
      model: 'extractor',
      reviewModel: 'reviewer',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
      effectProfile: 'core',
      iconMode: 'off',
    };
    const snapshot = createForgeIntakeSnapshot(base);
    expect(JSON.stringify(snapshot)).not.toContain('provider.example');
    expect(JSON.stringify(snapshot)).not.toContain('secret=query');
    expect(sameForgeIntakeSnapshot(snapshot, createForgeIntakeSnapshot({ ...base }))).toBe(true);
    for (const changed of [
      { source: 'changed' },
      { displayName: 'Changed' },
      { mode: 'plaintext-actor' as const },
      { endpoint: 'https://other.example/v1' },
      { endpoint: 'https://provider.example/v1?secret=changed' },
      { model: 'other' },
      { reviewModel: 'other' },
      { objectKind: 'item' as const, mode: 'ai-item' as const },
      { fvttVersion: '14.365' },
      { systemVersion: '5.3.4' },
      { effectProfile: 'modded-v14' },
      { iconMode: 'safe' },
    ]) {
      expect(sameForgeIntakeSnapshot(snapshot, createForgeIntakeSnapshot({ ...base, ...changed }))).toBe(false);
    }
  });

  test('strictly projects a stable Actor review bundle and drops unknown/internal/provider fields', () => {
    const rawSource = 'Rat source';
    const canonicalSource = '---\nname: Rat\n---\n';
    const input = {
      objectKind: 'actor' as const,
      mode: 'ai-monster' as const,
      requestId: 'request-1',
      attemptId: 'attempt-1',
      status: 'accepted' as const,
      rawSource,
      rawSourceHash: hashSource(rawSource),
      candidate: { id: 'rat', label: 'Rat', start: 0, end: 3, quote: 'Rat', ignored: 'secret' },
      evidence: {
        source: { sha256: hashSource(rawSource), length: rawSource.length, path: 'C:\\internal' },
        claims: [{ path: '/name', valueKind: 'explicit', value: 'Rat', evidence: [{ start: 0, end: 3, quote: 'Rat', cookie: 'secret' }] }],
        coverage: [{ start: 0, end: rawSource.length, quote: rawSource, classification: 'mechanical', claimPaths: ['/name'], rawPayload: 'secret' }],
        uncertainties: [],
        cache: 'secret',
      },
      deterministicFindings: [],
      aiReviewFindings: [],
      reviewVerdict: 'accepted' as const,
      provider: {
        name: 'fake',
        extractionModel: 'extract',
        reviewModel: 'review',
        promptVersions: { discover: 'd1', extract: 'e1', review: 'r1', repair: 'p1', rawRequest: 'secret' },
        endpoint: 'https://provider.example/v1',
        apiKey: 'secret-key',
      },
      calls: { discovery: 1, extraction: 1, review: 1, repair: 0 },
      repairCount: 0,
      canonicalSource,
      sourceIdentity: { sourceId: 'forge-src:00000000-0000-4000-8000-000000000001', finalSourceHash: hashSource(canonicalSource) },
      candidateResponse: {
        requestId: 'request-1',
        status: 'accepted' as const,
        artifactHash: hashSource('accepted artifact'),
        verificationStatus: 'accepted' as const,
        diagnostics: [],
      },
      history: [{ sequence: 0, action: 'regenerate' as const, attemptId: 'attempt-1', resultingStatus: 'analyzing' as const, timestamp: 'secret' }],
      authorization: 'Bearer secret',
      world: { actors: ['secret'] },
    };
    const bundle = buildForgeIntakeReviewBundle(input);
    const first = serializeForgeIntakeReviewBundle(bundle);
    const second = serializeForgeIntakeReviewBundle(buildForgeIntakeReviewBundle(input));
    expect(first).toBe(second);
    expect(first).toContain(rawSource);
    expect(first).not.toMatch(/secret-key|Bearer secret|provider\.example|C:\\\\internal|rawPayload|rawRequest|authorization|world|timestamp|cache|cookie|ignored/u);
    expect(bundle.objectKind).toBe('actor');
    expect(bundle.mode).toBe('ai-monster');
  });

  test('keeps Actor and Item bundle identities disjoint and validates source hashes', () => {
    const rawSource = 'Item source';
    const item = buildForgeIntakeReviewBundle({
      objectKind: 'item',
      mode: 'ai-item',
      requestId: 'item-request',
      attemptId: 'item-attempt',
      status: 'needs_review',
      rawSource,
      rawSourceHash: hashSource(rawSource),
    });
    expect(item.objectKind).toBe('item');
    expect(item.mode).toBe('ai-item');
    expect(() => buildForgeIntakeReviewBundle({
      objectKind: 'actor',
      mode: 'ai-item',
      requestId: 'bad',
      attemptId: 'bad',
      status: 'failed',
      rawSource,
      rawSourceHash: hashSource(rawSource),
    })).toThrow(/object kind/u);
    expect(() => buildForgeIntakeReviewBundle({
      objectKind: 'item',
      mode: 'ai-item',
      requestId: 'bad-hash',
      attemptId: 'bad-hash',
      status: 'failed',
      rawSource,
      rawSourceHash: hashSource('different'),
    })).toThrow(/raw source hash/u);
  });

  test('binds candidate response, verification, artifact hash, request, and every top-level status', () => {
    const rawSource = 'review-required source';
    const base = {
      objectKind: 'actor',
      mode: 'ai-monster',
      requestId: 'non-accepted-hash',
      attemptId: 'attempt-1',
      rawSource,
      rawSourceHash: hashSource(rawSource),
    } as const;
    const acceptedResponse = {
      requestId: base.requestId,
      status: 'accepted' as const,
      artifactHash: hashSource('accepted artifact'),
      verificationStatus: 'accepted' as const,
      diagnostics: [],
    };
    for (const status of [
      'empty', 'analyzing', 'ready_to_generate', 'generating_and_reviewing', 'repairing',
      'regenerating', 'needs_review', 'failed', 'rejected',
    ] as const) {
      expect(() => buildForgeIntakeReviewBundle({ ...base, status, candidateResponse: acceptedResponse })).toThrow(/forbidden.*top-level/u);
    }
    for (const status of ['accepted', 'committing_and_reading_back'] as const) {
      expect(buildForgeIntakeReviewBundle({ ...base, status, candidateResponse: acceptedResponse }).candidateResponse).toEqual(acceptedResponse);
      expect(() => buildForgeIntakeReviewBundle({ ...base, status })).toThrow(/requires one accepted candidate response/u);
      expect(() => buildForgeIntakeReviewBundle({
        ...base,
        status,
        candidateResponse: { ...acceptedResponse, status: 'needs_review', verificationStatus: 'needs_review' },
      })).toThrow(/requires accepted response, verification, and artifactHash/u);
      expect(() => buildForgeIntakeReviewBundle({
        ...base,
        status,
        candidateResponse: { ...acceptedResponse, artifactHash: undefined },
      })).toThrow(/requires accepted response, verification, and artifactHash/u);
      expect(() => buildForgeIntakeReviewBundle({
        ...base,
        status,
        candidateResponse: { ...acceptedResponse, requestId: 'other-request' },
      })).toThrow(/requestId does not match/u);
    }
  });
});

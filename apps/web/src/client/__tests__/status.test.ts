import { describe, expect, it } from 'bun:test';
import { isFormalArtifactReady, reviewBlockerCount, statusLabel } from '../App';

describe('Web job status labels', () => {
  it('shows needs_review as an explicit human-review state', () => {
    expect(statusLabel('needs_review')).toBe('待人工确认');
  });

  it('shows accepted intake creatures as accepted instead of pending', () => {
    expect(statusLabel('accepted')).toBe('已接受');
  });

  it('keeps a single conversion with semantic warnings out of formal download', () => {
    const singleResult = {
      status: 'needs_review' as const,
      diagnostics: [{
        code: 'GEN_LEGACY_VALIDATOR_WARNING',
        severity: 'warning' as const,
        stage: 'semantic' as const,
        path: 'legacy-validator/0',
        message: 'Name mismatch',
      }],
    };

    expect(reviewBlockerCount(singleResult, null)).toBe(1);
    expect(isFormalArtifactReady(singleResult, null)).toBe(false);
  });

  it('marks only an accepted single conversion or succeeded job as formally ready', () => {
    expect(isFormalArtifactReady({ status: 'accepted' }, null)).toBe(true);
    expect(isFormalArtifactReady(null, { status: 'succeeded' })).toBe(true);
    expect(isFormalArtifactReady(null, { status: 'needs_review' })).toBe(false);
  });
});

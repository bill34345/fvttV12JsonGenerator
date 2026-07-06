import { describe, expect, it } from 'bun:test';
import { DeterministicTokenCropCandidateProvider } from '../tokenCropCandidates';
import type { TokenReviewItem } from '../tokenReview';

describe('DeterministicTokenCropCandidateProvider', () => {
  it('returns bounded candidates that require human approval', async () => {
    const provider = new DeterministicTokenCropCandidateProvider();
    const candidates = await provider.suggest({
      item: reviewItem({
        reasons: ['shared-source-without-slug-crop', 'extreme-source-aspect-ratio'],
      }),
    });

    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.requiresHumanApproval).toBe(true);
      expect(candidate.crop.left).toBeGreaterThanOrEqual(0);
      expect(candidate.crop.top).toBeGreaterThanOrEqual(0);
      expect(candidate.crop.left + candidate.crop.width).toBeLessThanOrEqual(1);
      expect(candidate.crop.top + candidate.crop.height).toBeLessThanOrEqual(1);
    }
  });
});

function reviewItem(overrides: Partial<TokenReviewItem> = {}): TokenReviewItem {
  return {
    slug: 'relentless-slasher',
    displayName: 'Relentless Slasher',
    actorJsonPath: 'actor.json',
    sourceHash: 'cbd5322a',
    tokenUrl: 'http://example.test/tokens/relentless-slasher__cbd5322a.webp',
    localTokenPath: 'token.webp',
    cropStatus: 'missing',
    visualHints: {
      positionHints: ['从左前方起顺时针依次为：无情梦魇、无情撕裂者、无情主宰'],
      appearanceHints: [],
      captionHints: [],
      weakHints: [],
    },
    reasons: ['shared-source-without-slug-crop'],
    status: 'needs_review',
    ...overrides,
  };
}

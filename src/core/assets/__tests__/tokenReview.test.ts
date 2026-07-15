import { describe, expect, it } from 'bun:test';
import { classifyTokenReviewItems } from '../tokenReview';

const hints = {
  positionHints: [],
  appearanceHints: [],
  captionHints: [],
  weakHints: [],
};

describe('token review risk classification', () => {
  it('marks shared source images without slug-specific crop overrides', () => {
    const result = classifyTokenReviewItems({
      generatedAt: '2026-06-24T00:00:00.000Z',
      items: [
        item({ slug: 'one', sourceHash: 'aaaaaaaa', cropStatus: 'source-hash', cropKey: 'aaaaaaaa', tokenImageHash: 'hash-one' }),
        item({ slug: 'two', sourceHash: 'aaaaaaaa', cropStatus: 'source-hash', cropKey: 'aaaaaaaa', tokenImageHash: 'hash-two' }),
      ],
    });

    expect(result.items[0]?.reasons).toContain('shared-source-without-slug-crop');
    expect(result.items[1]?.reasons).toContain('shared-source-without-slug-crop');
  });

  it('marks duplicate tokens, extreme aspect ratios, and unconfirmed tokens', () => {
    const result = classifyTokenReviewItems({
      items: [
        item({ slug: 'duplicate-a', tokenImageHash: 'same', confirmed: true }),
        item({ slug: 'duplicate-b', tokenImageHash: 'same', confirmed: true }),
        item({ slug: 'portrait', tokenImageHash: 'portrait', sourceAspectRatio: 3, confirmed: true }),
        item({ slug: 'unconfirmed', tokenImageHash: 'unconfirmed', confirmed: false }),
      ],
    });

    expect(result.items[0]?.reasons).toContain('duplicate-token-image');
    expect(result.items[1]?.reasons).toContain('duplicate-token-image');
    expect(result.items[2]?.reasons).toContain('extreme-source-aspect-ratio');
    expect(result.items[3]?.reasons).toContain('unconfirmed-token');
  });

  it('does not mark confirmed exact slug crops as unconfirmed', () => {
    const result = classifyTokenReviewItems({
      items: [
        item({
          slug: 'relentless-slasher',
          sourceHash: 'cbd5322a',
          cropKey: 'relentless-slasher__cbd5322a',
          cropStatus: 'slug-specific',
          tokenImageHash: 'unique',
          confirmed: true,
        }),
      ],
    });

    expect(result.items[0]?.reasons).not.toContain('unconfirmed-token');
    expect(result.items[0]?.status).toBe('ok');
  });

  it('marks missing or unreadable token images as failed', () => {
    const result = classifyTokenReviewItems({
      items: [
        item({ slug: 'missing', tokenUrl: undefined, localTokenPath: undefined }),
        item({ slug: 'unreadable', tokenImageHash: undefined }),
      ],
    });

    expect(result.items[0]?.reasons).toContain('missing-token');
    expect(result.items[0]?.status).toBe('failed');
    expect(result.items[1]?.reasons).toContain('token-unreadable');
    expect(result.items[1]?.status).toBe('failed');
  });

  it('marks type-only captions as weak visual hints', () => {
    const result = classifyTokenReviewItems({
      items: [
        item({
          slug: 'type-only',
          confirmed: true,
          visualHints: {
            positionHints: [],
            appearanceHints: [],
            captionHints: ['Shoggoth Huge aberration, chaotic evil'],
            weakHints: ['Shoggoth Huge aberration, chaotic evil'],
          },
        }),
      ],
    });

    expect(result.items[0]?.reasons).toContain('weak-visual-hints');
    expect(result.items[0]?.status).toBe('needs_review');
  });
});

function item(overrides: Partial<Parameters<typeof classifyTokenReviewItems>[0]['items'][number]> = {}): Parameters<typeof classifyTokenReviewItems>[0]['items'][number] {
  return {
    slug: 'actor',
    displayName: 'Actor',
    actorJsonPath: 'actor.json',
    sourceImageUrl: 'http://example.test/actors/actor__12345678.png',
    sourceHash: '12345678',
    tokenUrl: 'http://example.test/tokens/actor__12345678.webp',
    localTokenPath: 'actor.webp',
    cropKey: 'actor__12345678',
    cropStatus: 'slug-specific',
    visualHints: hints,
    tokenImageHash: 'unique',
    sourceAspectRatio: 1,
    confirmed: true,
    ...overrides,
  };
}

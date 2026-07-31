import type { VisualHints } from './visualHints';

export type TokenReviewStatus = 'ok' | 'needs_review' | 'failed';

export type TokenReviewReason =
  | 'shared-source-without-slug-crop'
  | 'duplicate-token-image'
  | 'extreme-source-aspect-ratio'
  | 'unconfirmed-token'
  | 'missing-token'
  | 'token-unreadable'
  | 'weak-visual-hints';

export interface TokenReviewItem {
  slug: string;
  displayName: string;
  actorJsonPath: string;
  sourceImageUrl?: string;
  sourceHash?: string;
  tokenUrl?: string;
  localTokenPath?: string;
  cropKey?: string;
  cropStatus: 'slug-specific' | 'source-hash' | 'missing';
  visualHints: VisualHints;
  reasons: TokenReviewReason[];
  status: TokenReviewStatus;
}


import type { ImageTokenCrop } from './imageAssets';
import type { TokenReviewItem } from './tokenReviewTypes';

export interface TokenCropCandidate {
  crop: ImageTokenCrop;
  label: string;
  rationale: string;
  provider: 'deterministic' | 'vision-ai';
  confidence?: number;
  requiresHumanApproval: true;
}

export interface TokenCropCandidateInput {
  item: TokenReviewItem;
}

export interface TokenCropCandidateProvider {
  suggest(input: TokenCropCandidateInput): Promise<TokenCropCandidate[]>;
}

export class DeterministicTokenCropCandidateProvider implements TokenCropCandidateProvider {
  public async suggest(input: TokenCropCandidateInput): Promise<TokenCropCandidate[]> {
    const candidates: TokenCropCandidate[] = [];
    const hints = [
      ...input.item.visualHints.positionHints,
      ...input.item.visualHints.appearanceHints,
      ...input.item.visualHints.captionHints,
    ].join(' ');

    if (input.item.reasons.includes('shared-source-without-slug-crop') || /左|右|上方|下方|前方|后方|顺时针/.test(hints)) {
      candidates.push(
        candidate('left subject', { left: 0, top: 0, width: 0.45, height: 1 }, 'Shared-source image may need a left-side subject crop.'),
        candidate('center subject', { left: 0.25, top: 0, width: 0.5, height: 1 }, 'Shared-source image may need a centered subject crop.'),
        candidate('right subject', { left: 0.55, top: 0, width: 0.45, height: 1 }, 'Shared-source image may need a right-side subject crop.'),
      );
    }

    if (input.item.reasons.includes('extreme-source-aspect-ratio')) {
      candidates.push(
        candidate('upper portrait', { left: 0, top: 0, width: 1, height: 0.45 }, 'Tall portrait crops often need the upper subject area.'),
        candidate('middle portrait', { left: 0, top: 0.25, width: 1, height: 0.45 }, 'Tall portrait crops sometimes need the central face/body area.'),
        candidate('full contain', { left: 0, top: 0, width: 1, height: 1, fit: 'contain' }, 'Contain mode can preserve oversized subjects for manual review.'),
      );
    }

    return dedupeCandidates(candidates);
  }
}

function candidate(label: string, crop: ImageTokenCrop, rationale: string): TokenCropCandidate {
  return {
    label,
    crop,
    rationale,
    provider: 'deterministic',
    requiresHumanApproval: true,
  };
}

function dedupeCandidates(candidates: TokenCropCandidate[]): TokenCropCandidate[] {
  const seen = new Set<string>();
  const result: TokenCropCandidate[] = [];
  for (const item of candidates) {
    const key = JSON.stringify(item.crop);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

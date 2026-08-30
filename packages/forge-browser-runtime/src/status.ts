import type { AiReviewResult } from '@fvtt-json-generator/intake-ai/types';

export function resolveActorIntakeStatus(
  formalStatus: 'accepted' | 'needs_review' | 'failed',
  reviewVerdict: AiReviewResult['verdict'],
  intakeVerificationStatus: 'accepted' | 'needs_review',
): 'accepted' | 'needs_review' | 'failed' {
  if (formalStatus === 'failed') return 'failed';
  return formalStatus === 'accepted'
    && reviewVerdict === 'accepted'
    && intakeVerificationStatus === 'accepted'
    ? 'accepted'
    : 'needs_review';
}

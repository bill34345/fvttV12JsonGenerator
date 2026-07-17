import { describe, expect, it } from 'bun:test';
import { createDecisionDraft, isReviewFindingActionable } from '../intakeReview';

describe('AI Intake review decisions', () => {
  it('does not pretend validator findings are directly actionable', () => {
    const finding = {
      id: 'evidence_mismatch:/coverage/0',
      code: 'EVIDENCE_MISMATCH',
      path: '/coverage/0',
      message: 'bad offset',
      blocking: true,
      origin: 'evidence',
    };

    expect(isReviewFindingActionable(finding)).toBe(false);
    expect(createDecisionDraft(finding)).toEqual({ action: 'unresolved', value: '' });
  });

  it('defaults real semantic uncertainties and target conflicts to valid choices', () => {
    const uncertainty = {
      id: 'conditional-ac',
      code: 'CONDITIONAL_AC',
      path: '/creature/attributes/ac',
      message: 'choose AC',
      blocking: true,
      origin: 'semantic',
      candidates: [12, 15],
    };
    const conflict = {
      id: 'target-conflict:rat-warlock',
      code: 'TARGET_CONFLICT',
      path: '/promotion',
      message: 'replace?',
      blocking: true,
      origin: 'conflict',
      candidates: ['replace', 'keep-existing'],
    };

    expect(createDecisionDraft(uncertainty)).toEqual({ action: 'select', value: '12' });
    expect(createDecisionDraft(conflict)).toEqual({ action: 'select', value: 'replace' });
  });
});

export interface IntakeReviewFindingLike {
  id: string;
  code: string;
  path: string;
  message: string;
  blocking: boolean;
  origin?: string;
  candidates?: unknown[];
}

export type IntakeDecisionDraft = {
  action: 'unresolved' | 'select' | 'set' | 'preserve-literal' | 'exclude';
  value: string;
};

export function isReviewFindingActionable(finding: IntakeReviewFindingLike): boolean {
  return finding.origin === 'semantic' || finding.code === 'TARGET_CONFLICT';
}

export function createDecisionDraft(finding: IntakeReviewFindingLike): IntakeDecisionDraft {
  if (!isReviewFindingActionable(finding)) return { action: 'unresolved', value: '' };
  if (finding.candidates?.length) {
    return { action: 'select', value: stringifyDecisionValue(finding.candidates[0]) };
  }
  return { action: 'preserve-literal', value: '' };
}

function stringifyDecisionValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

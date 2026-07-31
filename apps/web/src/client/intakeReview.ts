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

export interface PortableSpellResolutionLike {
  required: boolean;
  status: 'not-required' | 'pending' | 'hydrated' | 'needs_review' | 'failed';
  spellCount: number;
  manifestId?: string;
}

export function describePortableSpellResolution(resolution: PortableSpellResolutionLike | undefined): string | null {
  if (!resolution?.required || resolution.status === 'not-required') return null;
  if (resolution.status === 'pending') return `资料已整理，法术将在目标世界解析（${resolution.spellCount} 项）`;
  if (resolution.status === 'needs_review') return `法术资料需要复核（${resolution.spellCount} 项）`;
  if (resolution.status === 'failed') return `法术资料验证失败（${resolution.spellCount} 项）`;
  return `法术状态异常：Intake 不能声明目标世界解析已完成（${resolution.spellCount} 项）`;
}

export function intakeActorDownloadLabel(
  label: string,
  resolution: PortableSpellResolutionLike | undefined,
): string {
  if (!resolution?.required) return label;
  const suffix = resolution.status === 'pending'
    ? '便携 Actor JSON（法术待目标世界解析）'
    : '便携 Actor JSON（Intake 未验证法术可用性）';
  return label.replace(/Actor JSON$/u, suffix);
}

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

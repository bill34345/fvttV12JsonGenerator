import { describe, expect, it } from 'bun:test';
import {
  createDecisionDraft,
  describePortableSpellResolution,
  intakeActorDownloadLabel,
  isReviewFindingActionable,
} from '../intakeReview';

describe('AI Intake review decisions', () => {
  it('truthfully describes a portable caster as pending target-world resolution', () => {
    const resolution = { required: true, status: 'pending' as const, spellCount: 10, manifestId: 'rat-spells' };

    expect(describePortableSpellResolution(resolution)).toBe('资料已整理，法术将在目标世界解析（10 项）');
    expect(intakeActorDownloadLabel('鼠神邪术师 · Actor JSON', resolution)).toBe(
      '鼠神邪术师 · 便携 Actor JSON（法术待目标世界解析）',
    );
  });

  it('does not change existing non-caster status or Actor download copy', () => {
    const resolution = { required: false, status: 'not-required' as const, spellCount: 0 };

    expect(describePortableSpellResolution(resolution)).toBeNull();
    expect(intakeActorDownloadLabel('暗影潜妖 · Actor JSON', resolution)).toBe('暗影潜妖 · Actor JSON');
  });

  it('never presents an Intake-side hydrated claim as a functional Actor download', () => {
    const invalid = { required: true, status: 'hydrated' as const, spellCount: 10 };

    expect(describePortableSpellResolution(invalid)).toBe('法术状态异常：Intake 不能声明目标世界解析已完成（10 项）');
    expect(intakeActorDownloadLabel('鼠神邪术师 · Actor JSON', invalid)).toBe(
      '鼠神邪术师 · 便携 Actor JSON（Intake 未验证法术可用性）',
    );
  });

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

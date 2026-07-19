import { describe, expect, test } from 'bun:test';
import type { SpellResolutionFinding } from '../../../core/spell-resolution';
import {
  createResolverReviewSession,
  openResolverReviewDialog,
  renderResolverReviewHtml,
  type ResolverReviewModel,
} from '../review-app';

const longChinese = '这是用于验证长中文证据不会挤压控制按钮的文本。'.repeat(30);
const uuid = 'Compendium.dnd-players-handbook.spells.Item.abcdefghijklmnop';
const path = '/spellcastingGroups/0/spellRefs/0/restrictions/0/value/deeply/nested/path';
const finding: SpellResolutionFinding = {
  code: 'MANUAL_CONFLICT_UNDECIDED', path, message: `结构错误 ${longChinese}`, blocking: true,
  evidence: [{ start: 123, end: 456, quote: 'source evidence' }],
};

function model(keepable = true): ResolverReviewModel {
  return {
    manifestId: 'manifest-review', findingHash: 'f'.repeat(64), title: '法术解析检查',
    findings: [finding],
    spells: [{
      logicalRefKey: 'manifest-review/innate/mage-armor', refId: 'mage-armor', originalName: '法师护甲',
      evidence: [{ start: 123, end: 456, quote: 'source evidence' }],
      candidates: [{ packageId: 'dnd-players-handbook', packId: 'spells', sourceBook: 'PHB', rules: '2024', level: 1, uuid }],
      current: { managedContentHash: 'a'.repeat(64), diff: { [path]: longChinese } },
      proposed: { selectedUuid: uuid, operation: 'replace-native-cast-and-cache' },
      manualConflict: { keepable, explanation: keepable ? undefined : `不能保留：${path} 缺少严格所有权` },
      warnings: ['FVTTJSONSPELL.Review.Fallback2014'],
      literalRestrictions: [{ kind: 'target', text: longChinese }],
      blocking: true,
    }],
  };
}

describe('resolver review model and dialog semantics', () => {
  const zh: Record<string, string> = {
    'FVTTJSONSPELL.Review.Unknown': '未知', 'FVTTJSONSPELL.Review.Source': '目标来源',
    'FVTTJSONSPELL.Review.SelectSource': '选择一个具体来源', 'FVTTJSONSPELL.Review.ManualConflict': '人工修改冲突',
    'FVTTJSONSPELL.Review.ManualConflictInvalid': '当前结构无法保留', 'FVTTJSONSPELL.Review.KeepManual': '保留人工修改',
    'FVTTJSONSPELL.Review.Overwrite': '覆盖生成内容', 'FVTTJSONSPELL.Review.Evidence': '来源证据',
    'FVTTJSONSPELL.Review.Candidates': '目标候选项', 'FVTTJSONSPELL.Review.ProjectionDiff': '三态投影差异',
    'FVTTJSONSPELL.Review.LastGenerated': '上次生成', 'FVTTJSONSPELL.Review.Current': '当前状态',
    'FVTTJSONSPELL.Review.Proposed': '拟应用状态', 'FVTTJSONSPELL.Review.NoProjection': '没有投影',
    'FVTTJSONSPELL.Review.LiteralRestrictions': '仅保留原文的限制', 'FVTTJSONSPELL.Review.Fallback2014': '2014 回退提示',
    'FVTTJSONSPELL.Review.Restriction.target': '目标限制',
    'FVTTJSONSPELL.Finding.MANUAL_CONFLICT_UNDECIDED': '请选择如何处理人工修改',
  };
  const localize = (key: string) => key === 'FVTTJSONSPELL.Review.RebuildIndex'
    ? 'Rebuild the source index, then retry.'
    : zh[key] ?? key;
  test('exposes exactly Keep manual, Overwrite, and whole-Actor Cancel behavior', () => {
    const session = createResolverReviewSession(model());
    expect(session.manualChoices).toEqual(['keep', 'overwrite', 'cancel']);
    expect(session.canApply()).toBe(false);
    session.decideManual('manifest-review/innate/mage-armor', 'keep');
    expect(session.canApply()).toBe(true);
    expect(session.apply()).toEqual({
      action: 'apply', manualDecisions: [{ logicalRefKey: 'manifest-review/innate/mage-armor', decision: 'keep' }], candidateSelections: [],
    });
    expect(createResolverReviewSession(model()).cancel()).toEqual({ action: 'cancel' });
    expect(createResolverReviewSession(model()).close()).toEqual({ action: 'cancel' });
  });

  test('does not allow invalid current managed structure to be kept', () => {
    const session = createResolverReviewSession(model(false));
    expect(() => session.decideManual('manifest-review/innate/mage-armor', 'keep')).toThrow(/cannot be kept/i);
    expect(session.canApply()).toBe(false);
    session.decideManual('manifest-review/innate/mage-armor', 'overwrite');
    expect(session.canApply()).toBe(true);
  });

  test('requires a real UUID selection for ambiguity and leaves missing-without-candidates blocking', () => {
    const ambiguous = model();
    ambiguous.spells[0]!.manualConflict = undefined;
    ambiguous.spells[0]!.candidateDecisionRequired = true;
    const session = createResolverReviewSession(ambiguous);
    expect(session.canApply()).toBe(false);
    session.selectCandidate(ambiguous.spells[0]!.logicalRefKey, uuid);
    expect(session.canApply()).toBe(true);
    expect(session.apply()).toMatchObject({ action: 'apply', candidateSelections: [{ selectedUuid: uuid }] });
    expect(renderResolverReviewHtml(ambiguous, localize)).toContain('select data-logical-ref-key');

    const missing = structuredClone(ambiguous);
    missing.spells[0]!.candidates = [];
    expect(createResolverReviewSession(missing).canApply()).toBe(false);
  });

  test('requires both manual-conflict and candidate decisions, and blank selection clears prior choice', () => {
    const dual = model();
    dual.spells[0]!.candidateDecisionRequired = true;
    const session = createResolverReviewSession(dual);
    session.decideManual(dual.spells[0]!.logicalRefKey, 'overwrite');
    expect(session.canApply()).toBe(false);
    session.selectCandidate(dual.spells[0]!.logicalRefKey, uuid);
    expect(session.canApply()).toBe(true);
    session.selectCandidate(dual.spells[0]!.logicalRefKey, '');
    expect(session.canApply()).toBe(false);
  });

  test('full-document drift with no alternative candidate blocks on Rebuild Index without a dead select', () => {
    const stale = model();
    stale.findings = [{
      code: 'INVALID_SELECTED_SPELL_DOCUMENT', path: stale.spells[0]!.logicalRefKey,
      message: 'Selected Spell changed after indexing.', blocking: true, evidence: [],
    }];
    stale.spells[0]!.manualConflict = undefined;
    stale.spells[0]!.candidates = [];
    stale.spells[0]!.candidateDecisionRequired = false;
    stale.spells[0]!.warnings = ['FVTTJSONSPELL.Review.RebuildIndex'];

    const session = createResolverReviewSession(stale);
    const html = renderResolverReviewHtml(stale, localize);
    expect(session.canApply()).toBe(false);
    expect(html).toContain('Rebuild the source index, then retry.');
    expect(html).not.toContain('select data-logical-ref-key');
    expect(html).not.toContain('FVTTJSONSPELL.Review.RebuildIndex');
  });

  test('renders complete evidence/candidate/current/proposed/fallback/literal data with escaped long-content wrappers', () => {
    const html = renderResolverReviewHtml(model(false), localize);
    for (const expected of ['法师护甲', '123-456', 'source evidence', 'dnd-players-handbook', 'PHB', '2024', '1', uuid, path,
      'replace-native-cast-and-cache', '2014 回退提示', '当前结构无法保留', '仅保留原文的限制', '保留人工修改', '覆盖生成内容']) {
      expect(html).toContain(expected);
    }
    expect(html).not.toMatch(/Keep manual|Overwrite|Select a concrete source|Current \/ proposed diff|hash only|literal-only/);
    expect(html).toContain('fvtt-json-generator-spell-resolver-scroll');
    expect(html).toContain('fvtt-json-generator-spell-resolver-break');
    expect(html).not.toContain('<script>');
  });

  test('renders the source quote with offsets and escapes hostile quote markup', () => {
    const hostile = model();
    hostile.spells[0]!.sourceEvidence = [{ start: 12, end: 34, quote: '<img src=x onerror="attack()">长证据' }];
    const html = renderResolverReviewHtml(hostile, localize);
    expect(html).toContain('12-34');
    expect(html).toContain('&lt;img src=x onerror=&quot;attack()&quot;&gt;长证据');
    expect(html).not.toContain('<img src=x');
  });

  test('falls back to the original long finding message when no localization key exists', () => {
    const unknown = model();
    const message = `未收录的动态错误：${longChinese}`;
    unknown.findings = [{ code: 'FUTURE_DYNAMIC_CODE', path: '/deep/future/path', message, blocking: true, evidence: [] }];
    const html = renderResolverReviewHtml(unknown, localize);
    expect(html).toContain(message);
    expect(html).not.toContain('FVTTJSONSPELL.Finding.FUTURE_DYNAMIC_CODE');
    expect(html).toMatch(/<li class="fvtt-json-generator-spell-resolver-break"><code>\/deep\/future\/path<\/code>/);
  });

  test('uses real DialogV2 wait semantics: Apply disabled initially; Cancel, close, title close, and Esc resolve Cancel without mutation', async () => {
    const calls: any[] = [];
    const templateCalls: any[] = [];
    const renderTemplate = async (templatePath: string, context: any) => {
      templateCalls.push([templatePath, context]);
      expect(templatePath).toBe('modules/fvtt-json-generator-spell-resolver/templates/review.hbs');
      expect(context.content).toContain('123-456');
      return `<template-shell>${context.content}</template-shell>`;
    };
    const wait = async (config: any) => {
      calls.push(config);
      expect(config.content).toContain('<template-shell>');
      expect(config.rejectClose).toBe(false);
      expect(config.buttons.map((button: any) => [button.action, button.disabled])).toEqual([['apply', true], ['cancel', false]]);
      expect(config.close()).toEqual({ action: 'cancel' });
      return null; // DialogV2.wait returns null for Esc/title-bar dismiss.
    };
    const before = structuredClone(model());
    const result = await openResolverReviewDialog(model(), { wait, renderTemplate });
    expect(result).toEqual({ action: 'cancel' });
    expect(model()).toEqual(before);
    expect(calls).toHaveLength(1);
    expect(templateCalls).toHaveLength(1);
  });
});

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
      warnings: ['2014 fallback is visible'],
      literalRestrictions: [{ kind: 'target', text: longChinese }],
      blocking: true,
    }],
  };
}

describe('resolver review model and dialog semantics', () => {
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
    const session = createResolverReviewSession(ambiguous);
    expect(session.canApply()).toBe(false);
    session.selectCandidate(ambiguous.spells[0]!.logicalRefKey, uuid);
    expect(session.canApply()).toBe(true);
    expect(session.apply()).toMatchObject({ action: 'apply', candidateSelections: [{ selectedUuid: uuid }] });
    expect(renderResolverReviewHtml(ambiguous)).toContain('select data-logical-ref-key');

    const missing = structuredClone(ambiguous);
    missing.spells[0]!.candidates = [];
    expect(createResolverReviewSession(missing).canApply()).toBe(false);
  });

  test('renders complete evidence/candidate/current/proposed/fallback/literal data with escaped long-content wrappers', () => {
    const html = renderResolverReviewHtml(model(false));
    for (const expected of ['法师护甲', '123–456', 'source evidence', 'dnd-players-handbook', 'PHB', '2024', '1', uuid, path,
      'replace-native-cast-and-cache', '2014 fallback', '不能保留', 'literal-only', 'Keep manual', 'Overwrite']) {
      expect(html).toContain(expected);
    }
    expect(html).toContain('fvtt-json-generator-spell-resolver-scroll');
    expect(html).toContain('fvtt-json-generator-spell-resolver-break');
    expect(html).not.toContain('<script>');
  });

  test('renders the source quote with offsets and escapes hostile quote markup', () => {
    const hostile = model();
    hostile.spells[0]!.sourceEvidence = [{ start: 12, end: 34, quote: '<img src=x onerror="attack()">长证据' }];
    const html = renderResolverReviewHtml(hostile);
    expect(html).toContain('12–34');
    expect(html).toContain('&lt;img src=x onerror=&quot;attack()&quot;&gt;长证据');
    expect(html).not.toContain('<img src=x');
  });

  test('uses real DialogV2 wait semantics: Apply disabled initially; Cancel, close, title close, and Esc resolve Cancel without mutation', async () => {
    const calls: any[] = [];
    const templateCalls: any[] = [];
    const renderTemplate = async (templatePath: string, context: any) => {
      templateCalls.push([templatePath, context]);
      expect(templatePath).toBe('modules/fvtt-json-generator-spell-resolver/templates/review.hbs');
      expect(context.content).toContain('123–456');
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

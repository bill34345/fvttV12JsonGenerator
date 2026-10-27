import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DownloadPanel, SingleConversionReview, hasGeneratedArtifact, reviewBlockerCount, statusLabel } from '../App';
import type { ConversionResult } from '../api';

describe('Web job status labels', () => {
  it('shows needs_review as an explicit human-review state', () => {
    expect(statusLabel('needs_review')).toBe('待人工确认');
  });

  it('shows accepted intake creatures as accepted instead of pending', () => {
    expect(statusLabel('accepted')).toBe('已接受');
  });

  it('keeps an Actor with semantic warnings downloadable without clearing its issues', () => {
    const singleResult = {
      kind: 'actor' as const,
      status: 'needs_review' as const,
      downloadUrl: '/api/jobs/actor/download/actor.json',
      diagnostics: [{
        code: 'GEN_LEGACY_VALIDATOR_WARNING',
        severity: 'warning' as const,
        stage: 'semantic' as const,
        path: 'legacy-validator/0',
        message: 'Name mismatch',
      }],
    };

    expect(reviewBlockerCount(singleResult, null)).toBe(1);
    expect(hasGeneratedArtifact(singleResult, null)).toBe(true);
  });

  it('renders the real Actor download link for needs-review and failed reports', () => {
    for (const status of ['needs_review', 'failed'] as const) {
      const singleResult = {kind: 'actor', status, name: 'Retained creature', outputPath: 'actor.json',
        downloadUrl: '/api/jobs/actor/download/actor.json'} as ConversionResult;
      const markup = renderToStaticMarkup(createElement(DownloadPanel, {singleResult, job: null}));
      expect(markup).toContain('href="/api/jobs/actor/download/actor.json"');
      expect(markup).toContain('下载 JSON');
      expect(markup).not.toContain('暂不提供下载');
      const review = renderToStaticMarkup(createElement(SingleConversionReview, {
        result: {...singleResult, diagnostics: [{code: 'LOCAL_REPORT', severity: 'error', stage: 'semantic', path: 'actor', message: '保留具体问题'}]},
        onReturnToInput: () => {},
      }));
      expect(review).toContain('Actor 已生成，可获取完整 JSON');
      expect(review).toContain('保留具体问题');
      expect(review).not.toContain('不能当作正式 JSON 下载');
    }
  });

  it('uses actual output presence and retains the independent Item contract', () => {
    expect(hasGeneratedArtifact({kind: 'actor', status: 'failed', downloadUrl: ''}, null)).toBe(false);
    expect(hasGeneratedArtifact({kind: 'item', status: 'needs_review', downloadUrl: '/item.json'}, null)).toBe(false);
    expect(hasGeneratedArtifact({kind: 'item', status: 'accepted', downloadUrl: '/item.json'}, null)).toBe(true);
    expect(hasGeneratedArtifact(null, {status: 'succeeded', files: [], summary: null})).toBe(false);
    const file = {id: 'actor', fileName: 'one-actor.json', contentType: 'application/json', label: 'Actor JSON', size: 12, downloadUrl: '/actor.json'};
    expect(hasGeneratedArtifact(null, {status: 'failed', files: [file], summary: null})).toBe(true);
    expect(hasGeneratedArtifact(null, {status: 'needs_review', files: [{...file, fileName: 'discovery.json'}], summary: null})).toBe(false);
  });
});

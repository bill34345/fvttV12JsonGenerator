import { describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ParsedItem } from '../../models/item';
import { generateItemArtifacts } from '../itemGenerationWorkflow';
import { convertMarkdownContentToJson } from '../singleFileConversion';

function stagedItem(): ParsedItem {
  const dormantRequirement = 'The shield has 2 charges.';
  const awakenedRequirement = 'The shield has 4 charges.';
  return {
    name: 'Source Staged Shield',
    type: 'armor',
    description: 'A staged shield.',
    uses: {
      max: '2',
      spent: 0,
      recovery: [{ period: 'dawn', type: 'recoverAll' }],
    },
    stages: [
      { name: 'Dormant', requirements: [dormantRequirement] },
      { name: 'Awakened', requirements: [awakenedRequirement] },
    ],
    structuredActions: {
      uses: [
        {
          name: 'Dormant Charges',
          type: 'use',
          desc: dormantRequirement,
          useAction: {
            consumption: 1,
            activation: 'action',
            limitedUses: {
              spent: 0,
              max: '2',
              recovery: [{ period: 'dawn', type: 'recoverAll' }],
            },
          },
        },
        {
          name: 'Awakened Charges',
          type: 'use',
          desc: awakenedRequirement,
          useAction: {
            consumption: 1,
            activation: 'action',
            limitedUses: {
              spent: 0,
              max: '4',
              recovery: [{ period: 'dawn', type: 'recoverAll' }],
            },
          },
        },
      ],
    },
  };
}

describe('shared Item generation workflow', () => {
  it('expands every entry from source mechanics without stage-name or 3/5/7 inference', async () => {
    const artifacts = await generateItemArtifacts(stagedItem(), {
      fvttVersion: '14',
      effectProfile: 'core',
    });

    expect(artifacts).toHaveLength(2);
    expect(artifacts.map((entry) => entry.item.system.uses.max)).toEqual(['2', '4']);
    expect(artifacts[0]?.item.name).toBe('Source Staged Shield');
    expect(artifacts[1]?.item.name).toBe('Source Staged Shield (Awakened)');
    expect(artifacts.map((entry) => entry.item.flags?.fvttJsonGenerator?.stage.name))
      .toEqual(['Dormant', 'Awakened']);
    expect(JSON.stringify(artifacts)).not.toContain('"max":"3"');
    expect(JSON.stringify(artifacts)).not.toContain('"max":"5"');
    expect(JSON.stringify(artifacts)).not.toContain('"max":"7"');
  });

  it('keeps a stage literal and emits a review diagnostic when source mechanics are absent', async () => {
    const parsed = stagedItem();
    parsed.stages![1] = {
      name: 'Unresolved',
      description: 'The item changes, but no structured mechanics were supplied.',
    };

    const artifacts = await generateItemArtifacts(parsed, {
      fvttVersion: '14',
      effectProfile: 'core',
    });

    expect(artifacts[1]?.item.system.description.value).toContain('no structured mechanics');
    expect(artifacts[1]?.diagnostics.some((entry) =>
      entry.code === 'GEN_STAGE_LITERAL_REVIEW_REQUIRED'
      && entry.severity === 'warning')).toBe(true);
  });

  it('does not write formal output when the unified pipeline returns needs_review', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'fvtt-item-review-'));
    const outputPath = join(temp, 'review-item.json');
    try {
      const result = await convertMarkdownContentToJson({
        content: [
          '---',
          'layout: item',
          '名称: Review Relic',
          '类型: 奇物',
          '---',
          '## Review Relic',
          '**休眠态（Dormant State）.** The relic changes, but no structured mechanics are supplied.',
          '在休眠状态下，这件遗物有着以下属性：',
        ].join('\n'),
        outputPath,
        fvttVersion: '14',
        effectProfile: 'core',
      });

      expect(result.status).toBe('needs_review');
      expect(result.outputPath).toBeUndefined();
      expect(existsSync(outputPath)).toBe(false);
      expect(result.diagnostics.some((entry) => entry.code === 'GEN_STAGE_LITERAL_REVIEW_REQUIRED')).toBe(true);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});

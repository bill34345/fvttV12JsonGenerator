import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { IconReviewReport } from '../src/core/icons/types';

const CLI = resolve(process.cwd(), 'src/index.ts');
const NIGHTGAUNT = resolve(
  process.cwd(),
  'obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md',
);

describe('CLI v14 safe icon mode', () => {
  test('regenerates an Actor and writes a review report through the project workflow', () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-cli-icons-'));
    const outputPath = join(root, 'nightgaunt.json');
    const reportPath = join(root, 'nightgaunt.icon-review.json');

    try {
      const result = spawnSync(
        'bun',
        [
          'run',
          CLI,
          NIGHTGAUNT,
          '--output',
          outputPath,
          '--fvtt-version',
          '14',
          '--effect-profile',
          'core',
          '--icon-mode',
          'safe',
        ],
        { cwd: process.cwd(), encoding: 'utf-8', timeout: 4_000 },
      );

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(existsSync(outputPath)).toBe(true);
      expect(existsSync(reportPath)).toBe(true);

      const actor = JSON.parse(readFileSync(outputPath, 'utf-8')) as {
        _stats?: { coreVersion?: string; systemVersion?: string };
        items: Array<{ name: string; img: string }>;
      };
      const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as IconReviewReport;
      const flyby = actor.items.find((item) => item.name.includes('Flyby'));

      expect(actor._stats).toMatchObject({ coreVersion: '14.364', systemVersion: '5.3.3' });
      expect(flyby?.img).toBe('icons/creatures/abilities/wings-birdlike-blue.webp');
      expect(actor.items.every((item) =>
        !['icons/svg/mystery-man.svg', 'icons/svg/sword.svg', 'icons/svg/item-bag.svg'].includes(item.img)))
        .toBe(true);
      expect(report.summary).toEqual({
        total: 6,
        override: 0,
        existing: 0,
        exact: 3,
        semantic: 0,
        fallback: 3,
      });
      expect(report.entries.find((entry) => entry.englishName === 'Flyby')).toMatchObject({
        source: 'compendium-exact',
        confidence: 'exact',
        selectedPath: 'icons/creatures/abilities/wings-birdlike-blue.webp',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('fails closed outside Foundry v14 and does not create output', () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-cli-icons-'));
    const outputPath = join(root, 'nightgaunt-v12.json');

    try {
      const result = spawnSync(
        'bun',
        [
          'run',
          CLI,
          NIGHTGAUNT,
          '--output',
          outputPath,
          '--fvtt-version',
          '12',
          '--icon-mode',
          'safe',
        ],
        { cwd: process.cwd(), encoding: 'utf-8', timeout: 4_000 },
      );

      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        '--icon-mode safe requires --fvtt-version 14',
      );
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

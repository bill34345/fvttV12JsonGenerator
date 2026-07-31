import { describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  conversionApplication,
  convertMarkdownContentToJson,
  convertMarkdownPathToOutput,
} from '../conversion';
import {
  convertMarkdownContentToJson as convertLegacyMarkdownContentToJson,
} from '../../workflow/singleFileConversion';
import { assertEqualStructure } from '../../utils/assertEqualStructure';

const NIGHTGAUNT_SOURCE = resolve(
  'obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md',
);

describe('conversion application facade', () => {
  test('preserves the legacy result contract for a real v14 Actor source', async () => {
    const content = readFileSync(NIGHTGAUNT_SOURCE, 'utf-8');
    const options = {
      content,
      sourcePath: NIGHTGAUNT_SOURCE,
      fvttVersion: '14' as const,
      effectProfile: 'core' as const,
    };

    const [legacy, facade] = await Promise.all([
      convertLegacyMarkdownContentToJson(options),
      convertMarkdownContentToJson(options),
    ]);

    assertEqualStructure(facade.rawJson, legacy.rawJson, {
      ignorePaths: [
        'items.*.effects.*._id',
        'items.*.system.activities.*.effects.*._id',
      ],
    });
    expect({
      kind: facade.kind,
      sourcePath: facade.sourcePath,
      outputPath: facade.outputPath,
      fvttVersion: facade.fvttVersion,
      effectProfile: facade.effectProfile,
      name: facade.name,
      itemCount: facade.itemCount,
      status: facade.status,
      diagnostics: facade.diagnostics,
      warnings: facade.warnings,
      verification: facade.verification,
      actorVerification: facade.actorVerification,
      iconReview: facade.iconReview,
      iconReviewPath: facade.iconReviewPath,
    }).toEqual({
      kind: legacy.kind,
      sourcePath: legacy.sourcePath,
      outputPath: legacy.outputPath,
      fvttVersion: legacy.fvttVersion,
      effectProfile: legacy.effectProfile,
      name: legacy.name,
      itemCount: legacy.itemCount,
      status: legacy.status,
      diagnostics: legacy.diagnostics,
      warnings: legacy.warnings,
      verification: legacy.verification,
      actorVerification: legacy.actorVerification,
      iconReview: legacy.iconReview,
      iconReviewPath: legacy.iconReviewPath,
    });
    expect(facade.kind).toBe('actor');
    expect(facade.status).toBe('accepted');
    expect(facade.fvttVersion).toBe('14');
    expect(facade.verification.target.stats.coreVersion).toBe('14.364');
    expect(facade.verification.target.stats.systemVersion).toBe('5.3.3');
    expect(facade.actorVerification?.warnings).toEqual([]);
    expect(facade.itemCount).toBe(6);
  });

  test('keeps path conversion, artifact writing, and output identity behind the port', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-conversion-facade-'));
    const sourcePath = join(root, 'nightgaunt.md');
    const outputPath = join(root, 'output', 'nightgaunt.json');

    try {
      writeFileSync(sourcePath, readFileSync(NIGHTGAUNT_SOURCE, 'utf-8'), 'utf-8');
      const result = await conversionApplication.convertPath({
        sourcePath,
        outputPath,
        fvttVersion: '12',
        effectProfile: 'core',
      });

      expect(result.status).toBe('accepted');
      expect(result.outputPath).toBe(resolve(outputPath));
      expect(existsSync(outputPath)).toBe(true);
      expect(JSON.parse(readFileSync(outputPath, 'utf-8'))).toEqual(result.rawJson);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('preserves fail-closed missing-source behavior', async () => {
    const missingPath = join(tmpdir(), `fvtt-missing-${randomUUID()}.md`);

    expect(() => conversionApplication.assertPathExists(missingPath)).toThrow(
      `Path does not exist: ${missingPath}`,
    );
    await expect(convertMarkdownPathToOutput({ sourcePath: missingPath })).rejects.toThrow();
  });
});

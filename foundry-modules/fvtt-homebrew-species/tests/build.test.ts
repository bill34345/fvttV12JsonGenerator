import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileSpeciesMarkdownV14 } from '@fvtt-json-generator/generation/species-v14';
import { renderSpeciesIntakeMarkdown } from '@fvtt-json-generator/intake-ai/species-renderer';
import type { SpeciesIntakeIR } from '@fvtt-json-generator/intake-ai/species-types';
import { buildHomebrewSpeciesModule } from '../build';
import { verifyHomebrewSpeciesArtifact } from '../verify';
import { installHomebrewSpeciesToLab, resolveSpeciesInstallTarget } from '../install';

function sha(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function prepareVault(root: string): string {
  const vault = join(root, 'vault'); const source = '测试种族\n- 生物类型：巨人。\n- 特性：规则完整保留。';
  const candidate = { id: 'test-species', label: '测试种族', start: 0, end: source.length, quote: source };
  const evidence = { start: 0, end: source.length, quote: source };
  const ir: SpeciesIntakeIR = {
    schemaVersion: 1, source: { sha256: sha(source), length: source.length },
    species: {
      name: '测试种族', englishName: 'Test Species', displayName: '测试种族（Test Species）', identifier: 'test-species', rules: '2024',
      creatureType: { value: 'giant', subtype: 'Test Species' }, size: { options: ['lg'], hint: '大型' }, movement: { walk: 40 }, senses: { darkvision: 60 }, source: { kind: 'private-homebrew', sha256: sha(source), irRevision: 1 },
      features: [{ id: 'test-feature', name: '测试特性', description: '规则完整保留。', parts: [{ id: 'test-feature-passive', level: 0, automation: 'descriptive', mechanics: [{ kind: 'descriptive-passive' }] }] }],
    }, claims: [{ path: '/species', evidence: [evidence] }], coverage: [{ ...evidence, classification: 'mechanical', claimPaths: ['/species'] }], uncertainties: [],
  };
  const markdown = renderSpeciesIntakeMarkdown(source, candidate, ir); const pkg = compileSpeciesMarkdownV14(markdown);
  const input = join(vault, 'input/species/test-species.md'); const output = join(vault, 'output/species/test-species.json'); const ledger = join(vault, 'output/species/accepted-ledger.json');
  mkdirSync(resolve(input, '..'), { recursive: true }); mkdirSync(resolve(output, '..'), { recursive: true });
  writeFileSync(input, markdown); writeFileSync(output, `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(ledger, `${JSON.stringify({ schemaVersion: 1, moduleId: 'fvtt-homebrew-species', entries: [{ identifier: 'test-species', markdownPath: 'input/species/test-species.md', packagePath: 'output/species/test-species.json', markdownSha256: sha(markdown), sourceSha256: pkg.sourceSha256, irRevision: 1, logicalHash: pkg.logicalHash, acceptedRunId: 'test-run' }] }, null, 2)}\n`);
  return vault;
}

describe('fvtt-homebrew-species deterministic artifact', () => {
  test('builds two closed content packs and rejects stale Markdown', async () => {
    const root = mkdtempSync(join(tmpdir(), 'homebrew-species-build-')); const vault = prepareVault(root);
    const classicLevelEntry = process.env.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY?.trim()
      || resolve(process.env.FVTT_OPS_LAB_ROOT!, 'app/14.364/node_modules/classic-level/index.js');
    const first = await buildHomebrewSpeciesModule({ vaultPath: vault, distRoot: join(root, 'dist-a'), classicLevelEntry });
    const second = await buildHomebrewSpeciesModule({ vaultPath: vault, distRoot: join(root, 'dist-b'), classicLevelEntry });
    expect(first.logicalHash).toBe(second.logicalHash); expect(first.zipSha256).toBe(second.zipSha256); expect(first.counts).toEqual({ species: 1, features: 1 });
    expect(first.uuids).toEqual(second.uuids); expect(first.uuids).toHaveLength(2);
    const verified = await verifyHomebrewSpeciesArtifact(first.distRoot);
    expect(verified.counts).toEqual({ species: 1, features: 1 }); expect(verified.zipSha256).toBe(first.zipSha256);
    const manifest = JSON.parse(readFileSync(join(first.moduleRoot, 'module.json'), 'utf8'));
    expect(manifest.packs.map((pack: any) => pack.name)).toEqual(['species', 'features']); expect(manifest.esmodules).toBeUndefined();
    expect(manifest.compatibility).toEqual({ minimum: '14.364', verified: '14.364', maximum: '14.364' });
    const labRoot = mkdtempSync(join(tmpdir(), 'homebrew-species-install-'));
    const installed = await installHomebrewSpeciesToLab({ labRoot, distRoot: first.distRoot }, true);
    expect(installed.applied).toBeTrue();
    await expect(installHomebrewSpeciesToLab({ labRoot, distRoot: first.distRoot }, false)).resolves.toMatchObject({ applied: false, target: installed.target });
    const markerPath = join(installed.target, 'data/identity-manifest.json'); const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    writeFileSync(markerPath, `${JSON.stringify({ ...marker, moduleId: 'foreign-module' }, null, 2)}\n`);
    await expect(installHomebrewSpeciesToLab({ labRoot, distRoot: first.distRoot }, false)).rejects.toThrow('foreign same-ID');
    const markdownPath = join(vault, 'input/species/test-species.md'); writeFileSync(markdownPath, `${readFileSync(markdownPath, 'utf8')}\n`);
    await expect(buildHomebrewSpeciesModule({ vaultPath: vault, distRoot: join(root, 'dist-stale'), classicLevelEntry })).rejects.toThrow('stale');
  });

  test('install target is exact and cannot escape the configured local Lab', () => {
    const labRoot = mkdtempSync(join(tmpdir(), 'homebrew-species-lab-'));
    const exact = resolveSpeciesInstallTarget({ labRoot });
    expect(exact.target).toBe(resolve(labRoot, 'data/server-mirror/Data/modules/fvtt-homebrew-species'));
    expect(() => resolveSpeciesInstallTarget({ labRoot, targetPath: resolve(labRoot, '../production/Data/modules/fvtt-homebrew-species') })).toThrow('refuses');
    expect(() => resolveSpeciesInstallTarget({ labRoot, targetPath: resolve(labRoot, 'data/server-mirror/Data/modules/foreign') })).toThrow('refuses');
  });
});

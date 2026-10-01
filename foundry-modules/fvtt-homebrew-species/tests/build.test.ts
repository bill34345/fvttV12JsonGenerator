import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileSpeciesMarkdown, compileSpeciesMarkdownV14 } from '@fvtt-json-generator/generation/species';
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

function prepareDualTargetVault(root: string): string {
  const vault = prepareVault(root);
  const markdownPath = join(vault, 'input/species/test-species.md');
  const markdown = readFileSync(markdownPath, 'utf8');
  const v14 = compileSpeciesMarkdown(markdown, { fvttVersion: '14' });
  const v12 = compileSpeciesMarkdown(markdown, { fvttVersion: '12' });
  const v12Path = join(vault, 'output/species/v12/test-species.json');
  mkdirSync(resolve(v12Path, '..'), { recursive: true });
  writeFileSync(v12Path, `${JSON.stringify(v12, null, 2)}\n`);
  const base = { identifier: 'test-species', effectProfile: 'core', rules: '2024', markdownPath: 'input/species/test-species.md', markdownSha256: sha(markdown), sourceSha256: v14.sourceSha256, irRevision: 1, acceptedRunId: 'test-run' };
  writeFileSync(join(vault, 'output/species/accepted-ledger.json'), `${JSON.stringify({ schemaVersion: 2, moduleId: 'fvtt-homebrew-species', entries: [
    { ...base, fvttVersion: '12', packagePath: 'output/species/v12/test-species.json', logicalHash: v12.logicalHash },
    { ...base, fvttVersion: '14', packagePath: 'output/species/test-species.json', logicalHash: v14.logicalHash },
  ] }, null, 2)}\n`);
  return vault;
}

function prepareNextTargetVault(root: string): string {
  const vault = prepareVault(root);
  const markdownPath = join(vault, 'input/species/test-species.md');
  const markdown = readFileSync(markdownPath, 'utf8');
  const next = compileSpeciesMarkdown(markdown, { fvttVersion: '14.368' });
  const packagePath = join(vault, 'output/species/v14-368/test-species.json');
  mkdirSync(resolve(packagePath, '..'), { recursive: true });
  writeFileSync(packagePath, `${JSON.stringify(next, null, 2)}\n`);
  const old = JSON.parse(readFileSync(join(vault, 'output/species/accepted-ledger.json'), 'utf8'));
  const existing = old.entries[0];
  writeFileSync(join(vault, 'output/species/accepted-ledger.json'), `${JSON.stringify({ schemaVersion: 2, moduleId: 'fvtt-homebrew-species', entries: [
    { ...existing, fvttVersion: '14', effectProfile: 'core', rules: '2024' },
    { ...existing, fvttVersion: '14.368', effectProfile: 'core', rules: '2024', packagePath: 'output/species/v14-368/test-species.json', logicalHash: next.logicalHash },
  ] }, null, 2)}\n`);
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
    expect(JSON.parse(readFileSync(join(vault, 'output/species/accepted-ledger.json'), 'utf8')).schemaVersion).toBe(1);
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

  test('builds a deterministic V12 static candidate with the same UUIDs as V14', async () => {
    const root = mkdtempSync(join(tmpdir(), 'homebrew-species-v12-build-'));
    const vault = prepareDualTargetVault(root);
    const classicLevelEntry = process.env.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY?.trim()
      || resolve(process.env.FVTT_OPS_LAB_ROOT!, 'app/14.364/node_modules/classic-level/index.js');
    const previous = process.env.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY;
    process.env.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY = classicLevelEntry;
    try {
      const v12a = await buildHomebrewSpeciesModule({ vaultPath: vault, distRoot: join(root, 'dist-v12-a'), classicLevelEntry, fvttVersion: '12' });
      const v12b = await buildHomebrewSpeciesModule({ vaultPath: vault, distRoot: join(root, 'dist-v12-b'), classicLevelEntry, fvttVersion: '12' });
      const v14 = await buildHomebrewSpeciesModule({ vaultPath: vault, distRoot: join(root, 'dist-v14'), classicLevelEntry, fvttVersion: '14' });
      expect(v12a.logicalHash).toBe(v12b.logicalHash);
      expect(v12a.zipSha256).toBe(v12b.zipSha256);
      expect(v12a.uuids).toEqual(v12b.uuids);
      expect(v12a.uuids).toEqual(v14.uuids);
      const verified = await verifyHomebrewSpeciesArtifact(v12a.distRoot);
      expect(verified).toMatchObject({ zipSha256: v12a.zipSha256, logicalHash: v12a.logicalHash, counts: { species: 1, features: 1 } });
      const manifest = JSON.parse(readFileSync(join(v12a.moduleRoot, 'module.json'), 'utf8'));
      expect(manifest.compatibility).toEqual({ minimum: '12.331', verified: '12.331', maximum: '12.331' });
      expect(manifest.relationships.systems[0].compatibility).toEqual({ minimum: '4.3.9', verified: '4.3.9', maximum: '4.3.9' });
      expect(manifest.esmodules).toBeUndefined();
      expect(manifest.scripts).toBeUndefined();
      const identity = JSON.parse(readFileSync(join(v12a.moduleRoot, 'data/identity-manifest.json'), 'utf8'));
      expect(identity).toMatchObject({ supportStatus: 'static-candidate', target: { foundry: '12.331', dnd5e: '4.3.9', effectProfile: 'core', rules: '2024' }, counts: { species: 1, features: 1 } });
      const accepted = JSON.parse(readFileSync(join(v12a.moduleRoot, 'data/accepted-packages.json'), 'utf8'));
      expect(accepted[0].target).toEqual({ foundry: '12.331', dnd5e: '4.3.9', effectProfile: 'core', rules: '2024' });
      expect(JSON.parse(readFileSync(join(v12a.moduleRoot, 'data/coverage-ledger.json'), 'utf8'))).toHaveLength(1);
    } finally {
      if (previous === undefined) delete process.env.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY;
      else process.env.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY = previous;
    }
  });

  test('requires independent acceptance and builds a deterministic Foundry 14.368 static candidate', async () => {
    const root = mkdtempSync(join(tmpdir(), 'homebrew-species-next-build-'));
    const vault = prepareVault(root);
    const previousTestEntry = process.env.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY;
    const injectedClassicLevelEntry = previousTestEntry?.trim();
    const classicLevelEntry = injectedClassicLevelEntry
      ? resolve(injectedClassicLevelEntry)
      : resolve(process.env.FVTT_OPS_LAB_ROOT!, 'app/14.368/node_modules/classic-level/index.js');
    await expect(buildHomebrewSpeciesModule({ vaultPath: vault, distRoot: join(root, 'blocked'), classicLevelEntry, fvttVersion: '14.368' })).rejects.toThrow('requires accepted 14.368/core/2024 packages');
    const ledgerPath = join(vault, 'output/species/accepted-ledger.json');
    const v1 = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    writeFileSync(ledgerPath, `${JSON.stringify({ ...v1, entries: v1.entries.map((entry: any) => ({ ...entry, fvttVersion: '14.368' })) }, null, 2)}\n`);
    await expect(buildHomebrewSpeciesModule({ vaultPath: vault, distRoot: join(root, 'forged'), classicLevelEntry, fvttVersion: '14.368' })).rejects.toThrow('Schema v1 Species ledger cannot contain explicit target identities');
    prepareNextTargetVault(root);
    const first = await buildHomebrewSpeciesModule({ vaultPath: vault, distRoot: join(root, 'dist-next-a'), classicLevelEntry, fvttVersion: '14.368', dnd5eRuntimeMaximum: '6.0.5' });
    const second = await buildHomebrewSpeciesModule({ vaultPath: vault, distRoot: join(root, 'dist-next-b'), classicLevelEntry, fvttVersion: '14.368', dnd5eRuntimeMaximum: '6.0.5' });
    const oldClassicLevelEntry = injectedClassicLevelEntry
      ? resolve(injectedClassicLevelEntry)
      : resolve(process.env.FVTT_OPS_LAB_ROOT!, 'app/14.364/node_modules/classic-level/index.js');
    const old = await buildHomebrewSpeciesModule({ vaultPath: vault, distRoot: join(root, 'dist-old'), classicLevelEntry: oldClassicLevelEntry, fvttVersion: '14' });
    expect(first.zipSha256).toBe(second.zipSha256);
    expect(first.logicalHash).toBe(second.logicalHash);
    expect(first.logicalHash).not.toBe(old.logicalHash);
    expect(first.uuids).toEqual(old.uuids);
    const verified = await verifyHomebrewSpeciesArtifact(first.distRoot, '6.0.5');
    expect(verified).toMatchObject({ zipSha256: first.zipSha256, logicalHash: first.logicalHash, counts: { species: 1, features: 1 } });
    await expect(verifyHomebrewSpeciesArtifact(first.distRoot)).rejects.toThrow(/exact requested runtime maximum 6\.0\.2/);
    if (injectedClassicLevelEntry) {
      const previousLabRoot = process.env.FVTT_OPS_LAB_ROOT;
      const labWithoutNextRuntime = join(root, 'lab-without-14.368');
      mkdirSync(labWithoutNextRuntime, { recursive: true });
      delete process.env.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY;
      process.env.FVTT_OPS_LAB_ROOT = labWithoutNextRuntime;
      try {
        await expect(buildHomebrewSpeciesModule({ vaultPath: vault, distRoot: join(root, 'reject-unversioned-entry'), classicLevelEntry, fvttVersion: '14.368', dnd5eRuntimeMaximum: '6.0.5' }))
          .rejects.toThrow('requires the read-only Foundry 14.368 classic-level entry');
        await expect(verifyHomebrewSpeciesArtifact(first.distRoot, '6.0.5'))
          .rejects.toThrow('A read-only Foundry 14.368 classic-level entry is required.');
      } finally {
        if (previousTestEntry === undefined) delete process.env.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY;
        else process.env.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY = previousTestEntry;
        if (previousLabRoot === undefined) delete process.env.FVTT_OPS_LAB_ROOT;
        else process.env.FVTT_OPS_LAB_ROOT = previousLabRoot;
      }
    }
    const manifest = JSON.parse(readFileSync(join(first.moduleRoot, 'module.json'), 'utf8'));
    const identity = JSON.parse(readFileSync(join(first.moduleRoot, 'data/identity-manifest.json'), 'utf8'));
    expect(manifest.compatibility).toEqual({ minimum: '14.368', verified: '14.368', maximum: '14.368' });
    expect(manifest.relationships.systems[0].compatibility).toEqual({ minimum: '6.0.2', verified: '6.0.2', maximum: '6.0.5' });
    expect(identity).toMatchObject({ supportStatus: 'static-candidate', target: { foundry: '14.368', dnd5e: '6.0.2', effectProfile: 'core', rules: '2024' } });
    expect(JSON.parse(readFileSync(join(first.moduleRoot, 'data/accepted-packages.json'), 'utf8'))[0].target.dnd5e).toBe('6.0.2');
    const labRoot = mkdtempSync(join(tmpdir(), 'homebrew-species-next-install-'));
    await expect(installHomebrewSpeciesToLab({ labRoot, distRoot: first.distRoot }, false)).rejects.toThrow('static candidates cannot use');
    const acceptedPath = join(first.moduleRoot, 'data/accepted-packages.json');
    const accepted = JSON.parse(readFileSync(acceptedPath, 'utf8'));
    accepted[0].target.dnd5e = '5.3.3';
    writeFileSync(acceptedPath, `${JSON.stringify(accepted, null, 2)}\n`);
    await expect(verifyHomebrewSpeciesArtifact(first.distRoot, '6.0.5')).rejects.toThrow('accepted packages do not match the exact target');
  });

  test('install target is exact and cannot escape the configured local Lab', () => {
    const labRoot = mkdtempSync(join(tmpdir(), 'homebrew-species-lab-'));
    const exact = resolveSpeciesInstallTarget({ labRoot });
    expect(exact.target).toBe(resolve(labRoot, 'data/server-mirror/Data/modules/fvtt-homebrew-species'));
    expect(() => resolveSpeciesInstallTarget({ labRoot, targetPath: resolve(labRoot, '../production/Data/modules/fvtt-homebrew-species') })).toThrow('refuses');
    expect(() => resolveSpeciesInstallTarget({ labRoot, targetPath: resolve(labRoot, 'data/server-mirror/Data/modules/foreign') })).toThrow('refuses');
  });
});

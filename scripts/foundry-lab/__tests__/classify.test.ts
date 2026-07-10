import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyActivePackages, writePackagePlan } from '../classify';
import { createLabConfig } from '../config';
import type { ActiveModuleEntry, ModuleInventoryEntry } from '../types';

const active = (id: string, version = '1.0.0'): ActiveModuleEntry => ({
  id,
  title: id,
  version,
});

const disk = (overrides: Partial<ModuleInventoryEntry> = {}): ModuleInventoryEntry => ({
  folder: 'sample',
  id: 'sample',
  title: 'sample',
  version: '1.0.0',
  compatibility: {},
  manifest: 'https://example.test/module.json',
  download: 'https://example.test/1.0.0.zip',
  requires: [],
  conflicts: [],
  protected: false,
  persistentStorage: false,
  manifestSha256: 'a'.repeat(64),
  parseError: null,
  ...overrides,
});

function inventory(): ModuleInventoryEntry[] {
  return Array.from({ length: 249 }, (_, index) => disk({
    folder: index === 0 ? 'sample' : `module-${index}`,
    id: index === 0 ? 'sample' : `module-${index}`,
  }));
}

async function writeInputs(
  repoRoot: string,
  diskSnapshot: unknown,
  activeSnapshot: unknown,
): Promise<void> {
  const config = createLabConfig(repoRoot);
  await mkdir(config.inventoryRoot, { recursive: true });
  await writeFile(
    join(config.inventoryRoot, 'production-disk.json'),
    `${JSON.stringify(diskSnapshot, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    join(config.inventoryRoot, 'production-active.json'),
    `${JSON.stringify(activeSnapshot, null, 2)}\n`,
    'utf8',
  );
}

describe('active package classification', () => {
  it('classifies an exact public release with its installed manifest HTTPS download', () => {
    const result = classifyActivePackages([disk()], [active('sample')])[0]!;

    expect(result.packageClass).toBe('upstream-exact');
    expect(result.disk?.download).toBe('https://example.test/1.0.0.zip');
    expect(result.reasons.join(' ')).toContain('exact installed manifest');
  });

  it('routes protected content through the authorized account before considering its download', () => {
    const result = classifyActivePackages(
      [disk({ protected: true, download: 'https://example.test/protected.zip' })],
      [active('sample')],
    )[0]!;

    expect(result.packageClass).toBe('account-protected');
    expect(result.reasons.join(' ')).toContain('authorized');
  });

  it('requires server transfer with a concrete reason when no download exists', () => {
    const result = classifyActivePackages(
      [disk({ download: null, manifest: null })],
      [active('sample')],
    )[0]!;

    expect(result.packageClass).toBe('server-only');
    expect(result.reasons.join(' ')).toContain('no download URL');
    expect(result.reasons.join(' ')).toContain('sample');
  });

  it('does not treat malformed or non-HTTPS download text as upstream-exact', () => {
    for (const download of ['not a URL', 'http://example.test/module.zip', 'https://']) {
      const result = classifyActivePackages([disk({ download })], [active('sample')])[0]!;
      expect(result.packageClass).toBe('server-only');
      expect(result.reasons.join(' ')).toContain('not a usable HTTPS URL');
    }
  });

  it('does not guess when disk and active versions differ', () => {
    const result = classifyActivePackages(
      [disk({ version: '2.0.0' })],
      [active('sample', '1.0.0')],
    )[0]!;

    expect(result.packageClass).toBe('manual-review');
    expect(result.reasons.join(' ')).toContain('1.0.0');
    expect(result.reasons.join(' ')).toContain('2.0.0');
  });

  it('gives concrete manual-review reasons for missing and unparseable manifests', () => {
    const missing = classifyActivePackages([], [active('missing')])[0]!;
    const unparseable = classifyActivePackages(
      [disk({ parseError: 'Unexpected token at line 4' })],
      [active('sample')],
    )[0]!;

    expect(missing.packageClass).toBe('manual-review');
    expect(missing.reasons.join(' ')).toContain('missing');
    expect(unparseable.packageClass).toBe('manual-review');
    expect(unparseable.reasons.join(' ')).toContain('Unexpected token at line 4');
  });

  it('sorts the transfer plan stably by active package id', () => {
    const result = classifyActivePackages(
      [disk({ folder: 'zeta', id: 'zeta' }), disk({ folder: 'alpha', id: 'alpha' })],
      [active('zeta'), active('alpha')],
    );

    expect(result.map((entry) => entry.active.id)).toEqual(['alpha', 'zeta']);
  });
});

describe('package-plan persistence', () => {
  it('reads validated snapshots and atomically writes only package-plan.json', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-classify-valid-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    try {
      await writeInputs(config.repoRoot, inventory(), {
        capturedAt: '2026-07-10T00:00:00.000Z',
        coreVersion: '14.364',
        modules: [active('sample')],
        systemId: 'dnd5e',
        systemVersion: '5.3.3',
      });

      const result = await writePackagePlan(config);
      const outputPath = join(config.inventoryRoot, 'package-plan.json');

      expect(result).toHaveLength(1);
      expect(JSON.parse(await readFile(outputPath, 'utf8'))).toEqual(result);
      expect(existsSync(config.cacheRoot)).toBe(false);
      expect(existsSync(`${outputPath}.tmp`)).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects missing or invalid input without replacing an existing plan', async () => {
    for (const scenario of ['missing-active', 'invalid-active', 'invalid-disk'] as const) {
      const tempRoot = await mkdtemp(join(tmpdir(), `foundry-classify-${scenario}-`));
      const config = createLabConfig(join(tempRoot, 'repo'));
      const outputPath = join(config.inventoryRoot, 'package-plan.json');
      const sentinel = Buffer.from('{"sentinel":"existing-plan"}\n', 'utf8');
      try {
        await mkdir(config.inventoryRoot, { recursive: true });
        await writeFile(outputPath, sentinel);
        if (scenario !== 'invalid-disk') {
          await writeFile(
            join(config.inventoryRoot, 'production-disk.json'),
            `${JSON.stringify(inventory())}\n`,
            'utf8',
          );
        } else {
          await writeFile(join(config.inventoryRoot, 'production-disk.json'), '{broken', 'utf8');
        }
        if (scenario === 'invalid-active') {
          await writeFile(
            join(config.inventoryRoot, 'production-active.json'),
            JSON.stringify({ modules: [{ id: 'sample', title: 'sample', version: 1 }] }),
            'utf8',
          );
        } else if (scenario === 'invalid-disk') {
          await writeFile(
            join(config.inventoryRoot, 'production-active.json'),
            JSON.stringify({ modules: [active('sample')] }),
            'utf8',
          );
        }

        const beforeStat = await stat(outputPath, { bigint: true });
        const beforeHash = createHash('sha256').update(sentinel).digest('hex');
        await expect(writePackagePlan(config)).rejects.toThrow();
        const after = await readFile(outputPath);
        const afterStat = await stat(outputPath, { bigint: true });

        expect(createHash('sha256').update(after).digest('hex')).toBe(beforeHash);
        expect(after).toEqual(sentinel);
        expect(afterStat.mtimeNs).toBe(beforeStat.mtimeNs);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    }
  });
});

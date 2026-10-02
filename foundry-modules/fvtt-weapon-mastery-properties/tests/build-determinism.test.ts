import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeBunSourceBanners } from '../build';

const moduleDirectory = resolve(import.meta.dir, '..');
const repositoryDirectory = resolve(moduleDirectory, '../..');
const buildScript = resolve(moduleDirectory, 'build.ts');
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

async function buildFrom(cwd: string): Promise<{ files: Record<string, string>; zip: string }> {
  // Bun.build must run outside bun:test when bundling this workspace module.
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'run', buildScript],
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) throw new Error(`Build failed from ${cwd}: ${new TextDecoder().decode(result.stderr)}`);
  const output = new TextDecoder().decode(result.stdout);
  const built = JSON.parse(output.slice(output.indexOf('{'))) as {
    moduleRoot: string;
    zipPath: string;
    files: string[];
  };
  const files = Object.fromEntries(await Promise.all(built.files.map(async (name) => [
    name,
    sha256(new Uint8Array(await readFile(resolve(built.moduleRoot, name)))),
  ])));
  return { files, zip: sha256(new Uint8Array(await readFile(built.zipPath))) };
}

test('build emits identical module files and ZIP from repository and module directories', async () => {
  const repositoryBuild = await buildFrom(repositoryDirectory);
  const moduleBuild = await buildFrom(moduleDirectory);
  expect(Object.keys(repositoryBuild.files)).toHaveLength(8);
  expect(moduleBuild.files).toEqual(repositoryBuild.files);
  expect(moduleBuild.zip).toBe(repositoryBuild.zip);
});

test('normalizes only real Bun comments and preserves banner-shaped template text', () => {
  const banner = '// foundry-modules/fvtt-weapon-mastery-properties/src/runtime.ts';
  const code = [
    'const raw = String.raw`before',
    banner,
    'after`;',
    'const interpolated = `value ${2}',
    banner,
    'end`;',
    '// foundry-modules/fvtt-weapon-mastery-properties/src/index.ts',
    '// ../../packages/contracts/src/conditions.ts',
  ].join('\n');
  const normalized = normalizeBunSourceBanners(code);
  expect(normalized).toContain(`String.raw\`before\n${banner}\nafter\``);
  expect(normalized).toContain(`\`value ${'${2}'}\n${banner}\nend\``);
  expect(normalized).toContain('\n// src/index.ts\n// packages/contracts/src/conditions.ts');
  expect(new Function(`${normalized}\nreturn { raw, interpolated };`)()).toEqual({
    raw: `before\n${banner}\nafter`,
    interpolated: `value 2\n${banner}\nend`,
  });
});

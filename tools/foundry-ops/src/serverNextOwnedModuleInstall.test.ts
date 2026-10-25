import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { installServerNextOwnedModule, runServerNextOwnedModuleInstallCli } from './serverNextOwnedModuleInstall';
import { resolveFoundryOpsRoute } from './routing';

const MODULE_ID = 'fvtt-injury-fading-spirits';
const VERSION = '1.0.1';
let temporary: string;
let repoRoot: string;
let labRoot: string;
let source: string;
let modulesRoot: string;
let stagingRoot: string;

function options(apply = false) {
  return { repoRoot, labRoot, moduleId: MODULE_ID, version: VERSION, apply };
}

beforeEach(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'server-next-owned-install-'));
  repoRoot = resolve(temporary, 'repo');
  labRoot = resolve(temporary, 'lab');
  source = resolve(repoRoot, 'foundry-modules/fvtt-injury-fading-spirits/dist/module');
  modulesRoot = resolve(labRoot, 'data/server-next/Data/modules');
  stagingRoot = resolve(labRoot, 'evidence/server-next-module-install-staging');
  await mkdir(resolve(repoRoot, 'foundry-modules/fvtt-injury-fading-spirits/src'), { recursive: true });
  await mkdir(resolve(source, 'scripts'), { recursive: true });
  await mkdir(resolve(source, 'styles'), { recursive: true });
  await mkdir(resolve(source, 'lang'), { recursive: true });
  await mkdir(modulesRoot, { recursive: true });
  const manifest = JSON.stringify({
    id: MODULE_ID, version: VERSION,
    compatibility: { maximum: '14.368', minimum: '14.364' },
    esmodules: ['scripts/index.js'],
    styles: [{ src: 'styles/module.css' }],
    languages: [{ lang: 'en', path: 'lang/en.json' }],
  });
  await writeFile(resolve(repoRoot, 'foundry-modules/fvtt-injury-fading-spirits/src/module.json'), manifest);
  await writeFile(resolve(source, 'module.json'), manifest);
  await writeFile(resolve(source, 'scripts/index.js'), 'export const ready = true;\n');
  await writeFile(resolve(source, 'styles/module.css'), ':root {}\n');
  await writeFile(resolve(source, 'lang/en.json'), '{}\n');
});

afterEach(async () => { await rm(temporary, { recursive: true }); });

describe('ServerNext repository-owned module installer', () => {
  it.each(['fvtt-trigger-engine', 'fvtt-custom-conditions', 'fvtt-weapon-mastery-properties', 'fvtt-suite-console'])('previews and installs the exact %s candidate without replacing existing files', async (moduleId) => {
    const version = ['fvtt-weapon-mastery-properties', 'fvtt-suite-console'].includes(moduleId) ? '0.1.0' : '0.2.0';
    const owner = resolve(repoRoot, 'foundry-modules', moduleId);
    const build = resolve(owner, 'dist/module');
    await mkdir(resolve(owner, 'src'), { recursive: true });
    await mkdir(resolve(build, 'scripts'), { recursive: true });
    const manifest = { id: moduleId, version, esmodules: ['scripts/index.js'],
      compatibility: { minimum: '14.364', maximum: '14.368' },
      relationships: { systems: [{ id: 'dnd5e', compatibility: { minimum: '5.3.3', maximum: '6.0.5' } }] } };
    await writeFile(resolve(owner, 'src/module.json'), JSON.stringify(manifest));
    await writeFile(resolve(build, 'module.json'), JSON.stringify(manifest));
    await writeFile(resolve(build, 'scripts/index.js'), 'export const candidate = true;\n');
    const request = { repoRoot, labRoot, moduleId, version };
    const dry = await installServerNextOwnedModule(request);
    expect(dry.status).toBe('dry-run');
    expect(await readdir(modulesRoot)).toEqual([]);
    await expect(lstat(stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(installServerNextOwnedModule({ ...request, version: '0.2.1', apply: true })).rejects.toThrow('id/version differs');
    manifest.relationships.systems[0]!.compatibility.maximum = '6.0.6';
    await writeFile(resolve(owner, 'src/module.json'), JSON.stringify(manifest));
    await expect(installServerNextOwnedModule({ ...request, apply: true })).rejects.toThrow('manifest differs');
    expect(await readdir(modulesRoot)).toEqual([]);
    manifest.relationships.systems[0]!.compatibility.maximum = '6.0.5';
    await writeFile(resolve(owner, 'src/module.json'), JSON.stringify(manifest));
    const installed = await installServerNextOwnedModule({ ...request, apply: true });
    expect(installed.status).toBe('installed');
    expect(installed.inventorySha256).toBe(dry.inventorySha256);
    expect(await readFile(resolve(installed.destination, 'scripts/index.js'), 'utf8')).toBe('export const candidate = true;\n');
    await expect(installServerNextOwnedModule({ ...request, apply: true })).rejects.toThrow('replacement is forbidden');
  });

  it('routes as a local mutation and derives only the ServerNext destination in dry-run', async () => {
    expect(resolveFoundryOpsRoute(['lab', 'install-server-next-owned-module']).command.id)
      .toBe('lab.install-server-next-owned-module');
    const result = await installServerNextOwnedModule(options());
    expect(result.status).toBe('dry-run');
    expect(result.destination).toBe(resolve(modulesRoot, MODULE_ID));
    expect(result.destination).not.toContain('server-mirror');
    expect(result.fileCount).toBe(4);
    expect(await readdir(modulesRoot)).toEqual([]);
    await expect(lstat(stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('requires an explicit Lab root and concrete module id/version', async () => {
    await expect(runServerNextOwnedModuleInstallCli([`--module-id=${MODULE_ID}`, `--version=${VERSION}`], {}, repoRoot))
      .rejects.toThrow('FVTT_OPS_LAB_ROOT');
    await expect(runServerNextOwnedModuleInstallCli([`--module-id=${MODULE_ID}`], { FVTT_OPS_LAB_ROOT: labRoot }, repoRoot))
      .rejects.toThrow('exact local Lab root');
    await expect(runServerNextOwnedModuleInstallCli([`--module-id=${MODULE_ID}`, `--version=${VERSION}`, '--unknown=x'], { FVTT_OPS_LAB_ROOT: labRoot }, repoRoot))
      .rejects.toThrow('Unsupported');
  });

  it('rejects a foreign id and a stale or mismatched build before writing', async () => {
    await expect(installServerNextOwnedModule({ ...options(true), moduleId: 'JB2A_DnD5e' }))
      .rejects.toThrow('approved repository-owned list');
    await expect(installServerNextOwnedModule({ ...options(true), version: '1.0.0' }))
      .rejects.toThrow('id/version differs');
    await writeFile(resolve(source, 'module.json'), JSON.stringify({ id: 'other-module', version: VERSION }));
    await expect(installServerNextOwnedModule(options(true))).rejects.toThrow('id/version differs');
    expect(await readdir(modulesRoot)).toEqual([]);
  });

  it('compares the complete normalized manifest, including same-version compatibility changes', async () => {
    const sourceManifest = resolve(repoRoot, 'foundry-modules/fvtt-injury-fading-spirits/src/module.json');
    const current = JSON.parse(await readFile(sourceManifest, 'utf8'));
    const reordered = { languages: current.languages, styles: current.styles, esmodules: current.esmodules,
      compatibility: { minimum: '14.364', maximum: '14.368' }, version: VERSION, id: MODULE_ID };
    await writeFile(sourceManifest, JSON.stringify(reordered));
    await expect(installServerNextOwnedModule(options())).resolves.toMatchObject({ status: 'dry-run' });
    reordered.compatibility.maximum = '14.999';
    await writeFile(sourceManifest, JSON.stringify(reordered));
    await expect(installServerNextOwnedModule(options(true))).rejects.toThrow('manifest differs');
    expect(await readdir(modulesRoot)).toEqual([]);
  });

  it('rejects missing, malformed, and escaping manifest resources before writing', async () => {
    await rm(resolve(source, 'styles/module.css'));
    await expect(installServerNextOwnedModule(options(true))).rejects.toThrow('styles is missing');
    await writeFile(resolve(source, 'styles/module.css'), ':root {}\n');
    const manifestPath = resolve(source, 'module.json');
    const sourceManifest = resolve(repoRoot, 'foundry-modules/fvtt-injury-fading-spirits/src/module.json');
    const manifest = JSON.parse(await readFile(sourceManifest, 'utf8'));
    manifest.esmodules = ['../outside.js'];
    await writeFile(manifestPath, JSON.stringify(manifest));
    await writeFile(sourceManifest, JSON.stringify(manifest));
    await expect(installServerNextOwnedModule(options(true))).rejects.toThrow('Unsafe esmodules path');
    expect(await readdir(modulesRoot)).toEqual([]);
  });

  it('never replaces an existing module, including an empty one', async () => {
    const destination = resolve(modulesRoot, MODULE_ID);
    await mkdir(destination);
    await expect(installServerNextOwnedModule(options(true))).rejects.toThrow('replacement is forbidden');
    expect(await readdir(destination)).toEqual([]);
  });

  it('rejects links inside the build and in the target path', async () => {
    await symlink(resolve(source, 'scripts/index.js'), resolve(source, 'linked.js'), 'file');
    await expect(installServerNextOwnedModule(options(true))).rejects.toThrow('symlink or junction');
    await rm(resolve(source, 'linked.js'));
    const next = resolve(labRoot, 'data/server-next');
    await rm(next, { recursive: true });
    await mkdir(resolve(labRoot, 'elsewhere/Data/modules'), { recursive: true });
    await symlink(resolve(labRoot, 'elsewhere'), next, 'junction');
    await expect(installServerNextOwnedModule(options(true))).rejects.toThrow('symlink');
  });

  it('rejects a reparse point at the off-scan staging root', async () => {
    await mkdir(resolve(labRoot, 'evidence'), { recursive: true });
    await mkdir(resolve(labRoot, 'elsewhere'), { recursive: true });
    await symlink(resolve(labRoot, 'elsewhere'), stagingRoot, 'junction');
    await expect(installServerNextOwnedModule(options(true))).rejects.toThrow('symlink');
    expect(await readdir(modulesRoot)).toEqual([]);
  });

  it('uses House Rules dist root rather than dist/module, with the same manifest and hash gates', async () => {
    const owner = resolve(repoRoot, 'foundry-modules/fvtt-house-rules');
    const build = resolve(owner, 'dist');
    await mkdir(resolve(owner, 'src'), { recursive: true });
    await mkdir(resolve(build, 'scripts'), { recursive: true });
    await mkdir(resolve(build, 'styles'), { recursive: true });
    const manifest = JSON.stringify({
      id: 'fvtt-house-rules', version: '0.1.1',
      esmodules: ['scripts/module.js'], styles: ['styles/house-rules.css'],
    });
    await writeFile(resolve(owner, 'src/module.json'), manifest);
    await writeFile(resolve(build, 'module.json'), manifest);
    await writeFile(resolve(build, 'scripts/module.js'), 'export {};\n');
    await writeFile(resolve(build, 'styles/house-rules.css'), ':root {}\n');
    const result = await installServerNextOwnedModule({
      repoRoot, labRoot, moduleId: 'fvtt-house-rules', version: '0.1.1', apply: true,
    });
    expect(result.source).toBe(build);
    expect(result.destination).toBe(resolve(modulesRoot, 'fvtt-house-rules'));
    expect(await readdir(modulesRoot)).toEqual(['fvtt-house-rules']);
    expect(await readdir(stagingRoot)).toEqual([]);
  });

  it('allows the approved Open Session Deck dist/module build and rejects same-version stale manifest', async () => {
    const owner = resolve(repoRoot, 'foundry-modules/open-session-deck');
    const build = resolve(owner, 'dist/module');
    await mkdir(resolve(owner, 'src'), { recursive: true });
    await mkdir(resolve(build, 'scripts'), { recursive: true });
    await mkdir(resolve(build, 'styles'), { recursive: true });
    await mkdir(resolve(build, 'lang'), { recursive: true });
    const manifest = {
      id: 'open-session-deck', version: '0.1.1',
      compatibility: { maximum: '14.368' },
      esmodules: ['scripts/index.js'], styles: ['styles/open-session-deck.css'],
      languages: [{ lang: 'en', path: 'lang/en.json' }],
    };
    await writeFile(resolve(owner, 'src/module.json'), JSON.stringify(manifest));
    await writeFile(resolve(build, 'module.json'), JSON.stringify(manifest));
    await writeFile(resolve(build, 'scripts/index.js'), 'export {};\n');
    await writeFile(resolve(build, 'styles/open-session-deck.css'), ':root {}\n');
    await writeFile(resolve(build, 'lang/en.json'), '{}\n');
    const request = { repoRoot, labRoot, moduleId: 'open-session-deck', version: '0.1.1' };
    const preview = await installServerNextOwnedModule(request);
    expect(preview.source).toBe(build);
    expect(preview.destination).toBe(resolve(modulesRoot, 'open-session-deck'));
    manifest.compatibility.maximum = '14.999';
    await writeFile(resolve(owner, 'src/module.json'), JSON.stringify(manifest));
    await expect(installServerNextOwnedModule({ ...request, apply: true })).rejects.toThrow('manifest differs');
    expect(await readdir(modulesRoot)).toEqual([]);
  });

  it('accepts the Spell Resolver build only when its source manifest and declared assets match', async () => {
    const owner = resolve(repoRoot, 'foundry-modules/monster-spell-resolver');
    const build = resolve(owner, 'dist/module');
    await mkdir(resolve(owner, 'src'), { recursive: true });
    await mkdir(resolve(build, 'scripts'), { recursive: true });
    await mkdir(resolve(build, 'styles'), { recursive: true });
    await mkdir(resolve(build, 'lang'), { recursive: true });
    const manifest = {
      id: 'fvtt-json-generator-spell-resolver', version: '0.1.1',
      esmodules: ['scripts/index.js'], styles: [{ src: 'styles/resolver.css' }],
      languages: [{ lang: 'en', path: 'lang/en.json' }],
    };
    await writeFile(resolve(owner, 'src/module.json'), JSON.stringify(manifest));
    await writeFile(resolve(build, 'module.json'), JSON.stringify(manifest));
    await writeFile(resolve(build, 'scripts/index.js'), 'export {};\n');
    await writeFile(resolve(build, 'styles/resolver.css'), ':root {}\n');
    await writeFile(resolve(build, 'lang/en.json'), '{}\n');
    const request = { repoRoot, labRoot, moduleId: manifest.id, version: manifest.version };
    const preview = await installServerNextOwnedModule(request);
    expect(preview.status).toBe('dry-run');
    expect(preview.source).toBe(build);
    await rm(resolve(build, 'styles/resolver.css'));
    await expect(installServerNextOwnedModule({ ...request, apply: true }))
      .rejects.toThrow('styles is missing from build');
    expect(await readdir(modulesRoot)).toEqual([]);
  });

  it('installs the Selected Token Sync 6.0.5 candidate only with an identical source manifest', async () => {
    const owner = resolve(repoRoot, 'foundry-modules/fvtt-selected-token-sync');
    const build = resolve(owner, 'dist/module');
    await mkdir(resolve(owner, 'src'), { recursive: true });
    await mkdir(resolve(build, 'scripts'), { recursive: true });
    const manifest = {
      id: 'fvtt-selected-token-sync', version: '0.2.0',
      compatibility: { minimum: '14.368', verified: '14.368', maximum: '14.368' },
      relationships: { systems: [{ id: 'dnd5e', compatibility: { minimum: '6.0.5', verified: '6.0.5', maximum: '6.0.5' } }] },
      esmodules: ['scripts/index.js'],
    };
    const sourceManifest = resolve(owner, 'src/module.json');
    await writeFile(sourceManifest, JSON.stringify(manifest));
    await writeFile(resolve(build, 'module.json'), JSON.stringify(manifest));
    await writeFile(resolve(build, 'scripts/index.js'), 'export {};\n');
    const request = { repoRoot, labRoot, moduleId: manifest.id, version: manifest.version };
    manifest.relationships.systems[0]!.compatibility.maximum = '6.0.6';
    await writeFile(sourceManifest, JSON.stringify(manifest));
    await expect(installServerNextOwnedModule({ ...request, apply: true })).rejects.toThrow('manifest differs');
    expect(await readdir(modulesRoot)).toEqual([]);
    manifest.relationships.systems[0]!.compatibility.maximum = '6.0.5';
    await writeFile(sourceManifest, JSON.stringify(manifest));
    const result = await installServerNextOwnedModule({ ...request, apply: true });
    expect(result.source).toBe(build);
    expect(result.destination).toBe(resolve(modulesRoot, manifest.id));
    expect(result.status).toBe('installed');
    expect(await readdir(modulesRoot)).toEqual([manifest.id]);
    expect(await readdir(stagingRoot)).toEqual([]);
    await expect(installServerNextOwnedModule({ ...request, apply: true })).rejects.toThrow('replacement is forbidden');
  });

  it('copies an absent module once, checks all hashes, and keeps staging outside the module scan', async () => {
    const result = await installServerNextOwnedModule(options(true));
    expect(result.status).toBe('installed');
    expect(result.fileCount).toBe(4);
    expect(result.inventorySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(resolve(result.destination, 'scripts/index.js'), 'utf8'))
      .toBe('export const ready = true;\n');
    expect(await readdir(modulesRoot)).toEqual([MODULE_ID]);
    expect(await readdir(stagingRoot)).toEqual([]);
    await expect(installServerNextOwnedModule(options(true))).rejects.toThrow('replacement is forbidden');
  });
});

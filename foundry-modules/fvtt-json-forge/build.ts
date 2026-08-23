import { cp, lstat, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

export const MODULE_ID = 'fvtt-json-forge' as const;
export const MODULE_VERSION = '0.1.0' as const;

const packageRoot = resolve(import.meta.dir);
const sourceRoot = resolve(packageRoot, 'src');
const distRoot = resolve(packageRoot, 'dist');
const moduleRoot = resolve(distRoot, 'module');
const repoRoot = resolve(packageRoot, '../..');

const browserAdapterAliases = new Map([
  [bunPath(resolve(repoRoot, 'packages/parser/src/i18n.ts')), bunPath(resolve(repoRoot, 'packages/forge-browser-runtime/src/adapters/i18n.ts'))],
  [bunPath(resolve(repoRoot, 'packages/generation/src/resources.ts')), bunPath(resolve(repoRoot, 'packages/forge-browser-runtime/src/adapters/resources.ts'))],
  [bunPath(resolve(repoRoot, 'packages/generation/src/stableId.ts')), bunPath(resolve(repoRoot, 'packages/forge-browser-runtime/src/adapters/stableId.ts'))],
  [bunPath(resolve(repoRoot, 'packages/generation/src/spellsMapper.ts')), bunPath(resolve(repoRoot, 'packages/forge-browser-runtime/src/adapters/spellsMapper.ts'))],
  [bunPath(resolve(repoRoot, 'packages/generation/src/v14SpellCatalog.ts')), bunPath(resolve(repoRoot, 'packages/forge-browser-runtime/src/adapters/v14SpellCatalog.ts'))],
]);

export async function buildModule(): Promise<{ moduleRoot: string; files: string[] }> {
  if (await exists(distRoot)) await rm(distRoot, { recursive: true });
  await mkdir(resolve(moduleRoot, 'scripts'), { recursive: true });
  await buildBrowserBundle({
    entrypoint: resolve(sourceRoot, 'index.ts'),
    outdir: resolve(moduleRoot, 'scripts'),
    naming: 'index.js',
  });

  await mkdir(resolve(moduleRoot, 'templates'), { recursive: true });
  await mkdir(resolve(moduleRoot, 'styles'), { recursive: true });
  await cp(resolve(sourceRoot, 'module.json'), resolve(moduleRoot, 'module.json'));
  await cp(resolve(sourceRoot, 'templates/forge-actor.hbs'), resolve(moduleRoot, 'templates/forge-actor.hbs'));
  await cp(resolve(sourceRoot, 'styles/fvtt-json-forge.css'), resolve(moduleRoot, 'styles/fvtt-json-forge.css'));

  const manifest = JSON.parse(await readFile(resolve(moduleRoot, 'module.json'), 'utf8')) as Record<string, unknown>;
  validateManifest(manifest);
  const browserText = await readFile(resolve(moduleRoot, 'scripts/index.js'), 'utf8');
  assertBrowserBundleSafe(browserText);

  const files = await collectFiles(moduleRoot);
  return { moduleRoot, files: files.map((file) => relative(moduleRoot, file).replace(/\\/g, '/')) };
}

export interface BrowserBundleOptions {
  entrypoint: string;
  outdir: string;
  naming: string;
}

export async function buildBrowserBundle(options: BrowserBundleOptions): Promise<string> {
  const workspaceAliases = await loadWorkspaceAliases();
  const bundle = await Bun.build({
    entrypoints: [options.entrypoint],
    outdir: options.outdir,
    naming: options.naming,
    target: 'browser',
    format: 'esm',
    splitting: false,
    minify: false,
    sourcemap: 'none',
    plugins: [browserAdapterPlugin(workspaceAliases)],
  });
  if (!bundle.success) throw new Error(`FVTT JSON Forge browser build failed: ${bundle.logs.map((log) => log.message).join('; ')}`);
  return resolve(options.outdir, options.naming);
}

export function validateManifest(manifest: Record<string, unknown>): void {
  if (manifest.id !== MODULE_ID || manifest.version !== MODULE_VERSION) throw new Error('FVTT JSON Forge manifest identity/version drifted.');
  const compatibility = asRecord(manifest.compatibility);
  if (compatibility.minimum !== '14.364' || compatibility.verified !== '14.364' || compatibility.maximum !== '14.364') {
    throw new Error('FVTT JSON Forge supports exactly Foundry 14.364.');
  }
  if (JSON.stringify(manifest.esmodules) !== JSON.stringify(['scripts/index.js'])) throw new Error('FVTT JSON Forge browser entry drifted.');
  const systems = Array.isArray(asRecord(manifest.relationships).systems) ? asRecord(manifest.relationships).systems : [];
  const dnd5e = systems.map((entry: unknown) => asRecord(entry)).find((entry: Record<string, any>) => entry.id === 'dnd5e');
  const systemCompatibility = asRecord(dnd5e?.compatibility);
  if (systemCompatibility.minimum !== '5.3.3' || systemCompatibility.verified !== '5.3.3' || systemCompatibility.maximum !== '5.3.3') {
    throw new Error('FVTT JSON Forge supports exactly dnd5e 5.3.3.');
  }
  if (manifest.socket !== false) throw new Error('FVTT JSON Forge must not declare a socket.');
}

export function assertBrowserBundleSafe(bundle: string): void {
  const forbidden = [
    /(?:from\s*["']|import\s*\(\s*["']|require\s*\(\s*["'])(?:node:|fs|path|os|url|crypto|child_process|sharp|crawlee|ssh)/iu,
    /(?:^|["'\s])node:(?:fs|path|os|url|crypto|child_process)/iu,
    /process\.env/iu,
    /\bBun\./u,
  ];
  const match = forbidden.find((pattern) => pattern.test(bundle));
  if (match) throw new Error(`FVTT JSON Forge browser bundle contains a forbidden server dependency: ${String(match)}`);
}

async function loadWorkspaceAliases(): Promise<Map<string, string>> {
  const packageNames = [
    'contracts',
    'forge-browser-runtime',
    'forge-gateway-protocol',
    'generation',
    'intake-ai',
    'models',
    'parser',
    'spell-manifest-contracts',
    'workflows',
  ];
  const aliases = new Map<string, string>();
  for (const packageName of packageNames) {
    const packageRoot = resolve(repoRoot, 'packages', packageName);
    const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')) as {
      name?: string;
      exports?: Record<string, string>;
    };
    if (!manifest.name || !manifest.exports) continue;
    for (const [subpath, target] of Object.entries(manifest.exports)) {
      if (typeof target !== 'string') continue;
      const specifier = subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2)}`;
      aliases.set(specifier, resolve(packageRoot, target));
    }
  }
  const jsYamlImport = resolve(repoRoot, 'packages/parser/node_modules/js-yaml/dist/js-yaml.mjs');
  if (await exists(jsYamlImport)) aliases.set('js-yaml', await realpath(jsYamlImport));
  const openccImport = resolve(repoRoot, 'packages/parser/node_modules/opencc-js/dist/esm/full.js');
  if (await exists(openccImport)) aliases.set('opencc-js', await realpath(openccImport));
  return aliases;
}

export function browserAdapterPlugin(workspaceAliases: ReadonlyMap<string, string>): any {
  return {
    name: 'fvtt-json-forge-browser-adapters',
    setup(build: any) {
      build.onResolve({ filter: /.*/ }, (args: { path: string; resolveDir: string }) => {
        if (args.path === 'node:crypto' || args.path === 'crypto') {
          return { path: bunPath(resolve(repoRoot, 'packages/forge-browser-runtime/src/adapters/crypto.ts')) };
        }
        const workspaceReplacement = workspaceAliases.get(args.path);
        if (workspaceReplacement) {
          const adapter = browserAdapterAliases.get(bunPath(workspaceReplacement));
          return { path: bunPath(adapter ?? workspaceReplacement) };
        }
        const candidate = resolve(args.resolveDir, args.path);
        const replacement = findBrowserAdapter(candidate);
        return replacement ? { path: replacement } : undefined;
      });
    },
  };
}

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const file = resolve(current, entry.name);
      const stats = await lstat(file);
      if (stats.isSymbolicLink()) throw new Error(`FVTT JSON Forge build contains a symlink: ${file}`);
      if (stats.isDirectory()) await visit(file);
      else if (stats.isFile()) files.push(file);
    }
  }
  await visit(directory);
  return files;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

async function exists(path: string): Promise<boolean> {
  return Boolean(await lstat(path).catch(() => undefined));
}

function bunPath(path: string): string {
  return path.replace(/\\/g, '/');
}

function findBrowserAdapter(candidate: string): string | undefined {
  for (const path of [candidate, `${candidate}.ts`, `${candidate}.tsx`, resolve(candidate, 'index.ts')]) {
    const replacement = browserAdapterAliases.get(bunPath(path));
    if (replacement) return replacement;
  }
  return undefined;
}

if (import.meta.main) console.log(JSON.stringify({ ok: true, ...(await buildModule()) }, null, 2));

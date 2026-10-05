import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const modulePrefix = 'foundry-modules/fvtt-json-forge/src/';
const helperImport = "import { isForgeCoreVersionSupported } from './mirror-core-compatibility';\n";
type Replacement = readonly [string, string, number];

/** Narrow source adaptation for the installed 0.4.0 lineage; unknown source shapes fail closed. */
export function adaptMirrorForgeSource(path: string, original: string): string {
  const replacements: Replacement[] = [];
  let source = original;
  if (path === `${modulePrefix}runtime.ts`) {
    source = helperImport + source;
    replacements.push(
      ['game.version !== EXPECTED_FOUNDRY_VERSION', '!isForgeCoreVersionSupported(game.version)', 1],
      ['Forge Actor requires Foundry ${EXPECTED_FOUNDRY_VERSION}.', 'Forge Actor requires Foundry ${EXPECTED_FOUNDRY_VERSION} or 14.368.', 1],
      ['fvttRuntimeVersion: EXPECTED_FOUNDRY_VERSION,', 'fvttRuntimeVersion: game.version,', 1],
      ['function assertResponseTarget(', 'export function assertResponseTarget(', 1],
    );
  } else if (path === `${modulePrefix}itemRuntime.ts`) {
    replacements.push(
      ['  assertExactRuntime,', '  assertExactRuntime,\n  assertResponseTarget,', 1],
      ['  const result = decoded.value.result;', '  const result = decoded.value.result;\n  assertResponseTarget(result.target, input.game);', 1],
    );
  } else if (path === `${modulePrefix}itemApplication.ts` || path === `${modulePrefix}intakeApplication.ts`) {
    source = helperImport + source;
    const intake = path.endsWith('/intakeApplication.ts');
    replacements.push(['result.target.fvttRuntimeVersion === EXPECTED_FOUNDRY_VERSION', 'isForgeCoreVersionSupported(result.target.fvttRuntimeVersion)', intake ? 2 : 1]);
    if (intake) replacements.push(
      ['target.fvttVersion === EXPECTED_FOUNDRY_VERSION', 'isForgeCoreVersionSupported(target.fvttVersion)', 1],
      ['当前 Foundry 14.364 / dnd5e 5.3.3 安全边界', '当前 Foundry 14.364 或 14.368 / dnd5e 5.3.3 安全边界', 1],
    );
  } else if (path === `${modulePrefix}encounterAutomationRuntime.ts`) {
    replacements.push(["env.game.version !== '14.364'", "(env.game.version !== '14.364' && env.game.version !== '14.368')", 1]);
  } else if (path === 'packages/forge-browser-runtime/src/batchQueue.ts') {
    replacements.push(["candidate.target.fvttVersion !== '14.364'", "(candidate.target.fvttVersion !== '14.364' && candidate.target.fvttVersion !== '14.368')", 1]);
  } else if (path === 'packages/intake-ai/src/encounter-automation.ts') {
    replacements.push(["if (game.version !== '14.364') throw new Error('This encounter requires Foundry 14.364.');", "if (game.version !== '14.364' && game.version !== '14.368') throw new Error('This encounter requires Foundry 14.364 or 14.368.');", 1]);
  } else return original;
  for (const [before, after, expectedCount] of replacements) {
    if (source.split(before).length - 1 !== expectedCount) throw new Error(`Forge compatibility source drift: ${path}: ${before}`);
    source = source.replaceAll(before, after);
  }
  return source;
}

const adaptedPaths = [
  'runtime.ts', 'itemRuntime.ts', 'itemApplication.ts', 'intakeApplication.ts', 'encounterAutomationRuntime.ts',
].map(name => modulePrefix + name).concat([
  'packages/forge-browser-runtime/src/batchQueue.ts', 'packages/intake-ai/src/encounter-automation.ts',
]);

/** Build two new overlay files. This function never installs or edits the source checkout. */
export async function prepareMirrorForgeOverlay(options: {
  repoRoot: string; sourceWorkspace: string; baselineModuleRoot: string; expectedScriptHash: string; outputRoot: string;
}) {
  for (const path of [options.repoRoot, options.sourceWorkspace, options.baselineModuleRoot, options.outputRoot]) {
    if (!isAbsolute(path)) throw new Error('Forge overlay paths must be absolute');
  }
  const outputRelative = relative(resolve(options.repoRoot, '.local'), resolve(options.outputRoot));
  if (!outputRelative || outputRelative.startsWith('..') || isAbsolute(outputRelative)) throw new Error('Forge overlay output must stay in task-local build output');
  const manifest = JSON.parse(await readFile(resolve(options.baselineModuleRoot, 'module.json'), 'utf8'));
  if (manifest.id !== 'fvtt-json-forge' || manifest.version !== '0.4.0' || manifest.compatibility.maximum !== '14.364') throw new Error('Expected the identified installed Forge 0.4.0 baseline');
  const installed = await readFile(resolve(options.baselineModuleRoot, 'scripts/index.js'), 'utf8');
  if (hash(installed) !== options.expectedScriptHash) throw new Error('Installed Forge source identity changed');
  const source = resolve(options.sourceWorkspace);
  const builder = await import(pathToFileURL(resolve(source, 'foundry-modules/fvtt-json-forge/build.ts')).href);
  const baselineFile = await builder.buildBrowserBundle({ entrypoint: resolve(source, modulePrefix, 'index.ts'), outdir: resolve(options.outputRoot, 'source-check'), naming: 'index.js' });
  const normalize = (text: string) => text.replace(new RegExp(`^// \\.\\./${source.split(/[\\/]/).at(-1)}/`, 'gm'), '// ');
  if (normalize(await readFile(baselineFile, 'utf8')) !== installed) throw new Error('The source checkout no longer reproduces the installed Forge code');
  const overrides = new Map<string, { contents: string; path: string; sourceHash: string }>();
  for (const path of adaptedPaths) {
    const original = await readFile(resolve(source, path), 'utf8');
    overrides.set(resolve(source, path).toLowerCase(), { contents: adaptMirrorForgeSource(path, original), path, sourceHash: hash(original) });
  }
  const aliases = new Map<string, string>();
  for (const name of ['contracts', 'forge-browser-runtime', 'forge-gateway-protocol', 'generation', 'ingest-plaintext', 'intake-ai', 'models', 'parser', 'spell-manifest-contracts', 'workflows']) {
    const root = resolve(source, 'packages', name);
    const definition = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
    for (const [subpath, target] of Object.entries(definition.exports ?? {})) {
      if (typeof target === 'string') aliases.set(subpath === '.' ? definition.name : `${definition.name}/${subpath.slice(2)}`, resolve(root, target));
    }
  }
  for (const [name, file] of [['js-yaml', 'js-yaml/dist/js-yaml.mjs'], ['opencc-js', 'opencc-js/dist/esm/full.js']]) {
    const path = resolve(source, 'packages/parser/node_modules', file!);
    aliases.set(name!, await realpath(path));
  }
  const overlayRoot = resolve(options.outputRoot, 'overlay');
  await mkdir(resolve(overlayRoot, 'scripts'), { recursive: true });
  const result = await Bun.build({
    entrypoints: [resolve(source, modulePrefix, 'index.ts')], outdir: resolve(overlayRoot, 'scripts'), naming: 'index.js',
    target: 'browser', format: 'esm', splitting: false, minify: false, sourcemap: 'none',
    plugins: [{ name: 'reviewed-mirror-core-pair', setup(build) {
      build.onResolve({ filter: /mirror-core-compatibility$/ }, () => ({ path: resolve(options.repoRoot, modulePrefix, 'mirror-core-compatibility.ts') }));
      build.onLoad({ filter: /\.(?:ts|tsx)$/ }, args => {
        const override = overrides.get(resolve(args.path).toLowerCase());
        return override ? { contents: override.contents, loader: 'ts' } : undefined;
      });
    } }, builder.browserAdapterPlugin(aliases)],
  });
  if (!result.success) throw new Error(result.logs.map(log => log.message).join('\n'));
  const entry = await readFile(resolve(overlayRoot, 'scripts/index.js'), 'utf8');
  builder.assertBrowserBundleSafe(entry);
  for (const override of overrides.values()) {
    if (hash(await readFile(resolve(source, override.path), 'utf8')) !== override.sourceHash) throw new Error(`Source changed during compilation: ${override.path}`);
  }
  manifest.compatibility.maximum = '14.368';
  await writeFile(resolve(overlayRoot, 'module.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const receipt = {
    sourceWorkspace: source, installedScriptHash: options.expectedScriptHash, sourceCodeReproduced: true,
    overlayRoot, scriptHash: hash(entry), target: { foundry: '14.368', dnd5e: '5.3.3' },
    adaptedSources: [...overrides.values()].map(({ path, sourceHash }) => ({ path, sourceHash })),
    installed: false,
  };
  await writeFile(resolve(options.outputRoot, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receipt;
}

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { patchTooltipLifecycle, tooltipUpstream } from './tooltip-lifecycle.mjs';
import { patchActivityTemplateExpiry, expiryUpstream } from './activity-template-expiry.mjs';
import { patchInventoryResize, inventoryUpstream } from './inventory-resize.mjs';
import { initiativeSourcePath, patchInitiativePrecheck } from './initiative-precheck.mjs';

const { values } = parseArgs({ options: {
  'source-root': { type: 'string' }, 'compiler-root': { type: 'string' },
  'official-system-root': { type: 'string' }, output: { type: 'string' },
  'initiative-precheck': { type: 'boolean' }
} });
const sourceRoot = requiredPath('source-root');
const compilerRoot = requiredPath('compiler-root');
const officialRoot = requiredPath('official-system-root');
const output = requiredPath('output');
const candidateVersion = '6.0.6+local.3';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const initiativePrecheck = values['initiative-precheck'] === true;

await validateInputs();
await mkdir(output);
const { rollup } = await import(pathToFileURL(join(compilerRoot, 'node_modules/rollup/dist/es/rollup.js')));
const { nodeResolve } = await import(pathToFileURL(join(compilerRoot, 'node_modules/@rollup/plugin-node-resolve/dist/es/index.js')));
const baselineDir = join(output, 'baseline');
const candidateDir = join(output, 'dnd5e');
await mkdir(baselineDir);
await mkdir(candidateDir);
const warnings = [];
await buildCode(baselineDir, false);
const baseline = await readFile(join(baselineDir, 'dnd5e-compiled.mjs'));
const official = await readFile(join(officialRoot, 'dnd5e.mjs'));
if (!baseline.equals(official)) throw new Error('Official source/toolchain does not reproduce the installed official bundle');
const baselineMapBytes = await readFile(join(baselineDir, 'dnd5e-compiled.mjs.map'));
const officialMapBytes = await readFile(join(officialRoot, 'dnd5e-compiled.mjs.map'));
if (!baselineMapBytes.equals(officialMapBytes)) throw new Error('Official source/toolchain does not reproduce the inspected official source map');
await buildCode(candidateDir, true);
const generated = await readFile(join(candidateDir, 'dnd5e-compiled.mjs'));
await writeFile(join(candidateDir, 'dnd5e.mjs'), generated);
const manifest = JSON.parse(await readFile(join(officialRoot, 'system.json'), 'utf8'));
manifest.version = candidateVersion;
await writeFile(join(candidateDir, 'system.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const files = [];
for (const path of ['dnd5e.mjs', 'dnd5e-compiled.mjs.map', 'system.json']) {
  const bytes = await readFile(join(candidateDir, path));
  const before = await readFile(join(officialRoot, path)).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  files.push({ path, bytes: bytes.length, sha256: hash(bytes), beforeSha256: before ? hash(before) : null });
}
const source = await readFile(join(sourceRoot, tooltipUpstream.sourcePath), 'utf8');
const expirySource = await readFile(join(sourceRoot, expiryUpstream.sourcePath), 'utf8');
const inventorySource = await readFile(join(sourceRoot, inventoryUpstream.sourcePath), 'utf8');
const baselineMap = JSON.parse(baselineMapBytes);
const candidateMap = JSON.parse(await readFile(join(candidateDir, 'dnd5e-compiled.mjs.map'), 'utf8'));
if (JSON.stringify(baselineMap.sources) !== JSON.stringify(candidateMap.sources)) {
  throw new Error('Candidate source-map module list differs from the official baseline');
}
const sourceMapChangedPaths = baselineMap.sources.filter((path, index) =>
  baselineMap.sourcesContent[index] !== candidateMap.sourcesContent[index]).sort();
const expectedSourcePaths = [tooltipUpstream.sourcePath, expiryUpstream.sourcePath, inventoryUpstream.sourcePath];
const initiativeReceipts = [];
if (initiativePrecheck) {
  expectedSourcePaths.push(initiativeSourcePath);
  const original = await readFile(join(sourceRoot, initiativeSourcePath), 'utf8');
  initiativeReceipts.push({ path: initiativeSourcePath, originalLfSha256: hash(original.replaceAll('\r\n', '\n')),
    patchedLfSha256: hash(patchInitiativePrecheck(original)) });
}
if (JSON.stringify(sourceMapChangedPaths) !== JSON.stringify(expectedSourcePaths.sort())) {
  throw new Error('Candidate changes source-map content outside the expected locked runtime sources');
}
const receipt = {
  system: 'dnd5e', upstreamVersion: tooltipUpstream.version, candidateVersion,
  commit: tooltipUpstream.commit, sourceRoot, compiler: { rollup: '4.62.2', nodeResolve: '16.0.3' },
  officialRoot, candidateRoot: candidateDir, files, baselineByteEqual: true, baselineSha256: hash(baseline),
  baselineMapByteEqual: true, baselineMapSha256: hash(baselineMapBytes), sourceMapChangedPaths,
  sourcePatch: { path: tooltipUpstream.sourcePath, originalLfSha256: hash(source.replaceAll('\r\n', '\n')),
    patchedLfSha256: hash(patchTooltipLifecycle(source)) },
  additionalSourcePatches: [{path: expiryUpstream.sourcePath,
    originalLfSha256: hash(expirySource.replaceAll('\r\n', '\n')),
    patchedLfSha256: hash(patchActivityTemplateExpiry(expirySource))},
    {path: inventoryUpstream.sourcePath,
      originalLfSha256: hash(inventorySource.replaceAll('\r\n', '\n')),
    patchedLfSha256: hash(patchInventoryResize(inventorySource))}, ...initiativeReceipts],
  warnings, installsOrWorldWrites: false, runtimeValidation: 'NOT_EXECUTED'
};
await writeFile(join(output, 'candidate-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);

function requiredPath(name) {
  if (!values[name]) throw new Error(`Missing --${name}`);
  return resolve(values[name]);
}

async function validateInputs() {
  try {
    await stat(output);
    throw new Error('Output must be a new directory; existing artifacts are preserved');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const head = spawnSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  const dirty = spawnSync('git', ['-C', sourceRoot, 'status', '--porcelain'], { encoding: 'utf8' });
  if (head.status || dirty.status || head.stdout.trim() !== tooltipUpstream.commit || dirty.stdout.trim()) {
    throw new Error('Source checkout must be clean and match the pinned official commit');
  }
  const manifest = JSON.parse(await readFile(join(officialRoot, 'system.json'), 'utf8'));
  if (manifest.id !== 'dnd5e' || manifest.version !== '6.0.6') throw new Error('Official installed system identity differs');
  const actual = hash(await readFile(join(officialRoot, 'dnd5e.mjs')));
  if (actual !== '010222ee48222228f4e0c9173bc8be840cfa080c552319872b34b71d18fa07e4') {
    throw new Error('Official installed bundle differs from the inspected 6.0.6 baseline');
  }
  for (const [module, version] of [['rollup', '4.62.2'], ['@rollup/plugin-node-resolve', '16.0.3']]) {
    const pkg = JSON.parse(await readFile(join(compilerRoot, 'node_modules', module, 'package.json'), 'utf8'));
    if (pkg.version !== version) throw new Error(`Compiler version mismatch: ${module}`);
  }
  patchTooltipLifecycle(await readFile(join(sourceRoot, tooltipUpstream.sourcePath), 'utf8'));
  patchActivityTemplateExpiry(await readFile(join(sourceRoot, expiryUpstream.sourcePath), 'utf8'));
  patchInventoryResize(await readFile(join(sourceRoot, inventoryUpstream.sourcePath), 'utf8'));
  if (initiativePrecheck) patchInitiativePrecheck(await readFile(join(sourceRoot, initiativeSourcePath), 'utf8'));
}

async function buildCode(directory, patched) {
  const tooltip = resolve(sourceRoot, tooltipUpstream.sourcePath);
  const expiry = resolve(sourceRoot, expiryUpstream.sourcePath);
  const inventory = resolve(sourceRoot, inventoryUpstream.sourcePath);
  const initiative = resolve(sourceRoot, initiativeSourcePath);
  const bundle = await rollup({
    input: join(sourceRoot, 'dnd5e.mjs'),
    plugins: [{
      name: 'pinned-official-source',
      async load(id) {
        if (!id.startsWith(sourceRoot) || !id.endsWith('.mjs')) return null;
        const text = (await readFile(id, 'utf8')).replaceAll('\r\n', '\n');
        if (patched && resolve(id) === tooltip) return patchTooltipLifecycle(text);
        if (patched && resolve(id) === expiry) return patchActivityTemplateExpiry(text);
        if (patched && resolve(id) === inventory) return patchInventoryResize(text);
        if (patched && initiativePrecheck && resolve(id) === initiative) return patchInitiativePrecheck(text);
        return text;
      }
    }, nodeResolve()],
    onwarn: warning => warnings.push({ build: patched ? 'candidate' : 'baseline', code: warning.code })
  });
  try {
    await bundle.write({
      file: join(directory, 'dnd5e-compiled.mjs'), format: 'es', sourcemap: true,
      sourcemapFile: join(directory, 'dnd5e.mjs'),
      sourcemapPathTransform(path) {
        const normalized = path.replaceAll('\\', '/');
        const marker = sourceRoot.replaceAll('\\', '/') + '/';
        const index = normalized.indexOf(marker);
        return index >= 0 ? normalized.slice(index + marker.length) : normalized;
      }
    });
  } finally {
    await bundle.close();
  }
}

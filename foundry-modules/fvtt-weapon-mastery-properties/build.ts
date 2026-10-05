import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import * as ts from 'typescript';

export const MODULE_ID = 'fvtt-weapon-mastery-properties' as const;
export const MODULE_VERSION = '0.1.0' as const;

const root = resolve(import.meta.dir);
const source = resolve(root, 'src');
const dist = resolve(root, 'dist');
const moduleRoot = resolve(dist, 'module');
const repoRoot = resolve(root, '../..');
const identityPath = resolve(dist, 'build-identity.json');

export interface FileDigest { path: string; sha256: string }
export interface BuildIdentity {
  format: 1;
  buildId: string;
  runtimeCodeSha256: string;
  distributionTreeSha256: string;
  sourceFiles: FileDigest[];
  files: FileDigest[];
  zipSha256: string;
  toolchain: { bun: string; typescript: string };
}
export type SourceIdentity = Pick<BuildIdentity, 'buildId' | 'sourceFiles' | 'toolchain'>;

function sha256(bytes: Uint8Array | string): string { return createHash('sha256').update(bytes).digest('hex'); }

async function sourceFiles(): Promise<FileDigest[]> {
  const paths = [
    resolve(repoRoot, 'bun.lock'), resolve(repoRoot, 'bunfig.toml'), resolve(repoRoot, 'package.json'),
    resolve(repoRoot, 'tsconfig.json'), resolve(repoRoot, 'packages/contracts/package.json'),
    resolve(repoRoot, 'packages/contracts/tsconfig.json'), resolve(root, 'package.json'),
    resolve(root, 'tsconfig.json'), resolve(root, 'build.ts'),
    resolve(root, 'e2e/fixture-macro.js'), resolve(root, 'e2e/evidence.ts'),
    resolve(root, 'e2e/receipt-evidence.ts'),
    ...await collectFiles(source),
    ...['conditions.ts', 'weapon-properties.ts', 'weapon-effects.ts'].map((name) => resolve(repoRoot, 'packages/contracts/src', name)),
    resolve(root, 'README.md'), resolve(root, 'README.zh-CN.md'),
  ];
  return Promise.all(paths.sort((a, b) => a.localeCompare(b, 'en')).map(async (path) => ({
    path: relative(repoRoot, path).replace(/\\/g, '/'), sha256: sha256(await readFile(path)),
  })));
}

export function computeBuildId(inputs: readonly FileDigest[], toolchain: SourceIdentity['toolchain']): string {
  return sha256(JSON.stringify({ inputs, toolchain }));
}

export function assertMatchingSourceIdentity(recorded: SourceIdentity, current: SourceIdentity): void {
  if (recorded.buildId !== current.buildId || JSON.stringify(recorded.sourceFiles) !== JSON.stringify(current.sourceFiles)
    || JSON.stringify(recorded.toolchain) !== JSON.stringify(current.toolchain)) {
    throw new Error('Frozen build is stale: source, config, lockfile, dependency, or toolchain changed.');
  }
}

async function sourceIdentity(): Promise<SourceIdentity> {
  const inputs = await sourceFiles();
  const toolchain = { bun: Bun.version, typescript: ts.version };
  return { buildId: computeBuildId(inputs, toolchain), sourceFiles: inputs, toolchain };
}

export async function buildModule(): Promise<{ moduleRoot: string; zipPath: string; files: string[] }> {
  const identity = await sourceIdentity();
  if (await exists(dist)) await rm(dist, { recursive: true });
  await mkdir(resolve(moduleRoot, 'scripts'), { recursive: true });
  const result = await Bun.build({
    entrypoints: [resolve(source, 'index.ts')],
    outdir: resolve(moduleRoot, 'scripts'),
    naming: 'index.js',
    target: 'browser',
    format: 'esm',
    splitting: false,
    minify: false,
    sourcemap: 'none',
    define: { __WMP_BUILD_ID__: JSON.stringify(identity.buildId) },
  });
  if (!result.success) throw new Error(`Browser build failed: ${result.logs.map(String).join('; ')}`);

  // Bun emits source-path comments relative to the invocation cwd.
  const bundlePath = resolve(moduleRoot, 'scripts/index.js');
  const bundled = await readFile(bundlePath, 'utf8');
  const normalized = normalizeBunSourceBanners(bundled);
  if (normalized !== bundled) await writeFile(bundlePath, normalized);

  await cp(resolve(source, 'module.json'), resolve(moduleRoot, 'module.json'));
  for (const directory of ['lang', 'styles', 'templates']) {
    await cp(resolve(source, directory), resolve(moduleRoot, directory), { recursive: true });
  }
  for (const readme of ['README.md', 'README.zh-CN.md']) {
    await cp(resolve(root, readme), resolve(moduleRoot, readme));
  }

  const manifest = JSON.parse(await readFile(resolve(moduleRoot, 'module.json'), 'utf8')) as Record<string, any>;
  validateManifest(manifest);
  validatePackagedAssets(moduleRoot);
  const browserText = await readFile(resolve(moduleRoot, 'scripts/index.js'), 'utf8');
  const forbidden = [/node:/i, /process\.env/i, /from ['"](?:node:|fs|path|os)/i];
  const match = forbidden.find((pattern) => pattern.test(browserText));
  if (match) throw new Error(`Browser bundle contains a server-only dependency: ${String(match)}`);

  const files = await collectFiles(moduleRoot);
  const entries = await Promise.all(files.map(async (path) => ({
    name: relative(moduleRoot, path).replace(/\\/g, '/'),
    bytes: new Uint8Array(await readFile(path)),
  })));
  const zipPath = resolve(dist, `${MODULE_ID}.zip`);
  await writeFile(zipPath, createStoredZip(entries));
  const fileDigests = entries.map((entry) => ({ path: entry.name, sha256: sha256(entry.bytes) }));
  const buildIdentity: BuildIdentity = {
    format: 1, ...identity,
    runtimeCodeSha256: fileDigests.find((entry) => entry.path === 'scripts/index.js')!.sha256,
    distributionTreeSha256: sha256(JSON.stringify(fileDigests)),
    files: fileDigests, zipSha256: sha256(await readFile(zipPath)),
  };
  await writeFile(identityPath, `${JSON.stringify(buildIdentity, null, 2)}\n`);
  return { moduleRoot, zipPath, files: entries.map((entry) => entry.name) };
}

/** Read-only validation of the exact build selected by an explicit build command. */
export async function requireFrozenBuild(): Promise<{ moduleRoot: string; zipPath: string; files: string[]; identity: BuildIdentity }> {
  const rebuild = `Run bun run ${resolve(root, 'build.ts')} to create a fresh frozen artifact.`;
  let identity: BuildIdentity;
  try {
    const stats = await lstat(identityPath);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('unsafe identity path');
    identity = JSON.parse(await readFile(identityPath, 'utf8')) as BuildIdentity;
  }
  catch { throw new Error(`Frozen build identity is missing or invalid. ${rebuild}`); }
  if (identity.format !== 1 || !/^[a-f0-9]{64}$/.test(identity.buildId) || !Array.isArray(identity.files)) {
    throw new Error(`Frozen build identity is invalid. ${rebuild}`);
  }
  const current = await sourceIdentity();
  try { assertMatchingSourceIdentity(identity, current); }
  catch (error) { throw new Error(`${String(error)} ${rebuild}`); }
  const zipPath = resolve(dist, `${MODULE_ID}.zip`);
  try {
    const moduleStats = await lstat(moduleRoot);
    const zipStats = await lstat(zipPath);
    if (!moduleStats.isDirectory() || moduleStats.isSymbolicLink() || !zipStats.isFile() || zipStats.isSymbolicLink()) {
      throw new Error('module or ZIP path is unsafe');
    }
    const files = await collectFiles(moduleRoot);
    const entries = await Promise.all(files.map(async (path) => ({
      name: relative(moduleRoot, path).replace(/\\/g, '/'), bytes: new Uint8Array(await readFile(path)),
    })));
    const actual = entries.map((entry) => ({ path: entry.name, sha256: sha256(entry.bytes) }));
    if (JSON.stringify(actual) !== JSON.stringify(identity.files)) throw new Error('file hashes differ');
    if (identity.runtimeCodeSha256 !== actual.find((entry) => entry.path === 'scripts/index.js')?.sha256) throw new Error('runtime code hash differs');
    if (identity.distributionTreeSha256 !== sha256(JSON.stringify(actual))) throw new Error('distribution tree hash differs');
    const zipSha256 = sha256(await readFile(zipPath));
    if (identity.zipSha256 !== zipSha256 || zipSha256 !== sha256(createStoredZip(entries))) throw new Error('ZIP hash differs');
    validateManifest(JSON.parse(await readFile(resolve(moduleRoot, 'module.json'), 'utf8')) as Record<string, any>);
    validatePackagedAssets(moduleRoot);
    return { moduleRoot, zipPath, files: actual.map((entry) => entry.path), identity };
  } catch (error) {
    throw new Error(`Frozen build artifact is missing or altered (${String(error)}). ${rebuild}`);
  }
}

export function normalizeBunSourceBanners(bundle: string): string {
  const sourceFile = ts.createSourceFile('bundle.js', bundle, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const comments = new Map<number, ts.CommentRange>();
  function visit(node: ts.Node): void {
    for (const range of ts.getLeadingCommentRanges(bundle, node.pos) ?? []) comments.set(range.pos, range);
    for (const range of ts.getTrailingCommentRanges(bundle, node.end) ?? []) comments.set(range.pos, range);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  for (const range of comments.values()) {
    if (range.kind !== ts.SyntaxKind.SingleLineCommentTrivia) continue;
    if (range.pos !== 0 && bundle[range.pos - 1] !== '\n') continue;
    const original = bundle.slice(range.pos, range.end);
    const replacement = original
      .replace(/^\/\/ (?:foundry-modules\/fvtt-weapon-mastery-properties\/)?(src\/[\w./-]+\.ts)$/, '// $1')
      .replace(/^\/\/ (?:foundry-modules\/fvtt-weapon-mastery-properties\/)?(e2e\/[\w./-]+\.[jt]s)$/, '// $1')
      .replace(/^\/\/ (?:\.\.\/\.\.\/)?(packages\/contracts\/src\/[\w./-]+\.ts)$/, '// $1');
    if (replacement !== original) edits.push({ start: range.pos, end: range.end, replacement });
  }
  let normalized = bundle;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    normalized = normalized.slice(0, edit.start) + edit.replacement + normalized.slice(edit.end);
  }
  return normalized;
}

export function validateManifest(manifest: Record<string, any>): void {
  if (manifest.id !== MODULE_ID || manifest.version !== MODULE_VERSION) throw new Error('Manifest identity/version mismatch.');
  const core = manifest.compatibility ?? {};
  if (core.minimum !== '14.364' || core.verified !== '14.368' || core.maximum !== '14.368') {
    throw new Error('Foundry manifest must bound the reviewed 14.364 and 14.368 pairs.');
  }
  const dnd5e = (manifest.relationships?.systems ?? []).find((entry: any) => entry.id === 'dnd5e');
  const system = dnd5e?.compatibility ?? {};
  if (system.minimum !== '5.3.3' || system.verified !== '6.0.5' || system.maximum !== '6.0.5') {
    throw new Error('dnd5e manifest must bound the reviewed 5.3.3 and 6.0.5 pairs.');
  }
  if (JSON.stringify(manifest.esmodules) !== JSON.stringify(['scripts/index.js'])) throw new Error('Browser entry contract drifted.');
  if (JSON.stringify(manifest.styles) !== JSON.stringify([{ src: 'styles/weapon-mastery-properties.css' }])) throw new Error('Style asset contract drifted.');
  if (JSON.stringify(manifest.languages) !== JSON.stringify([
    { lang: 'en', name: 'English', path: 'lang/en.json' },
    { lang: 'cn', name: '简体中文（Foundry 中文包）', path: 'lang/zh-CN.json' },
    { lang: 'zh-CN', name: '简体中文', path: 'lang/zh-CN.json' },
  ])) throw new Error('Language asset contract drifted.');
  if (manifest.socket !== false) throw new Error('This module must not declare a socket.');
  const required = new Map<string, any>((manifest.relationships?.requires ?? []).map((entry: any) => [entry.id, entry]));
  for (const id of ['fvtt-custom-conditions', 'fvtt-trigger-engine']) {
    const compatibility = required.get(id)?.compatibility ?? {};
    if (compatibility.minimum !== '0.1.1' || compatibility.verified !== '0.2.0' || compatibility.maximum !== '0.2.0') {
      throw new Error(`Required module ${id} must declare the bounded 0.1.1 through 0.2.0 compatibility range.`);
    }
  }
}

export function validatePackagedAssets(rootDirectory: string): void {
  for (const path of [
    'styles/weapon-mastery-properties.css',
    'lang/en.json',
    'lang/zh-CN.json',
    'templates/weapon-manager.hbs',
  ]) {
    if (!Bun.file(resolve(rootDirectory, path)).size) throw new Error(`Required packaged asset is missing or empty: ${path}`);
  }
}

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) throw new Error(`Build tree contains a symlink/junction: ${path}`);
      if (stats.isDirectory()) await visit(path);
      else if (stats.isFile()) files.push(path);
    }
  }
  await visit(directory);
  return files;
}

interface ZipEntry { name: string; bytes: Uint8Array }

export function createStoredZip(entries: ZipEntry[]): Uint8Array {
  const ordered = [...entries].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of ordered) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length + entry.bytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, entry.bytes.length, true); lv.setUint32(22, entry.bytes.length, true); lv.setUint16(26, name.length, true);
    local.set(name, 30); local.set(entry.bytes, 30 + name.length); locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, entry.bytes.length, true); cv.setUint32(24, entry.bytes.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    central.set(name, 46); centrals.push(central); offset += local.length;
  }
  const centralSize = centrals.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, ordered.length, true); ev.setUint16(10, ordered.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return concat([...locals, ...centrals, end]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!;
  return (crc ^ 0xffffffff) >>> 0;
}

async function exists(path: string): Promise<boolean> { return Boolean(await lstat(path).catch(() => undefined)); }

if (import.meta.main) console.log(JSON.stringify({ ok: true, ...(await buildModule()) }, null, 2));

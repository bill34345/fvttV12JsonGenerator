import { lstatSync, readdirSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const MODULE_ID = 'fvtt-json-generator-spell-resolver';
const REPO_ROOT = resolve(import.meta.dir, '..');
const STATIC_FILES = [
  'module.json',
  'lang/en.json',
  'lang/zh-CN.json',
  'styles/resolver.css',
  'templates/report.hbs',
  'templates/review.hbs',
  'templates/settings.hbs',
] as const;
const FORBIDDEN_TEXT = [
  /node:/i,
  /sourceMappingURL/i,
  /[A-Za-z]:[\\/]/,
  /\.local[\\/]/i,
  /OPENAI_API_KEY/i,
  /rat-warlock/i,
];

export interface SpellResolverBuildResult {
  outputDir: string;
  zipPath: string;
  archiveEntries: string[];
}

export async function buildSpellResolverPackage(): Promise<SpellResolverBuildResult> {
  return buildSpellResolverPackageForRepo(REPO_ROOT);
}

export async function buildSpellResolverPackageForRepo(repoRoot: string): Promise<SpellResolverBuildResult> {
  const paths = assertSpellResolverBuildMutationBoundary(repoRoot);
  assertSpellResolverBuildMutationBoundary(repoRoot);
  await rm(paths.outputDir, { recursive: true, force: true });
  assertSpellResolverBuildMutationBoundary(repoRoot);
  await rm(paths.zipPath, { force: true });
  assertSpellResolverBuildMutationBoundary(repoRoot);
  await mkdir(resolve(paths.outputDir, 'scripts'), { recursive: true });
  assertSpellResolverBuildMutationBoundary(repoRoot);

  await buildBrowserBundleInSubprocess(paths);

  for (const path of STATIC_FILES) {
    assertSpellResolverBuildMutationBoundary(repoRoot);
    await copyFileDeterministically(
      resolve(paths.sourceRoot, path),
      resolve(paths.outputDir, path),
      () => assertSpellResolverBuildMutationBoundary(repoRoot),
    );
  }
  await validateBuiltManifest(paths.outputDir);
  const entries = await collectFiles(paths.outputDir);
  await scanFiles(entries, paths.outputDir);
  const zip = createDeterministicZip(await Promise.all(entries.map(async (path) => ({
    name: normalizeArchivePath(relative(paths.outputDir, path)),
    bytes: new Uint8Array(await readFile(path)),
  }))));
  assertSpellResolverBuildMutationBoundary(repoRoot);
  await writeFile(paths.zipPath, zip);
  scanBytes(zip, 'archive');
  const archiveEntries = listZipEntries(zip);
  const expectedEntries = entries.map((path) => normalizeArchivePath(relative(paths.outputDir, path)));
  if (JSON.stringify(archiveEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error('ZIP directory does not exactly match the deterministic build tree.');
  }
  return {
    outputDir: paths.outputDir,
    zipPath: paths.zipPath,
    archiveEntries,
  };
}

async function buildBrowserBundleInSubprocess(paths: SpellResolverBuildPaths): Promise<void> {
  const child = Bun.spawn(
    [process.execPath, resolve(paths.repoRoot, 'scripts/buildSpellResolver.ts'), '--bundle-only', paths.repoRoot],
    {
      cwd: paths.repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `Spell resolver browser build subprocess failed (${exitCode}).\n${stderr || stdout}`,
    );
  }
}

async function buildBrowserBundle(paths: SpellResolverBuildPaths): Promise<void> {
  const build = await Bun.build({
    entrypoints: [resolve(paths.sourceRoot, 'index.ts')],
    outdir: resolve(paths.outputDir, 'scripts'),
    root: paths.repoRoot,
    naming: 'index.js',
    target: 'browser',
    format: 'esm',
    splitting: false,
    minify: false,
    sourcemap: 'none',
  });
  if (!build.success) {
    throw new Error(`Spell resolver browser build failed:\n${build.logs.map((log) => String(log)).join('\n')}`);
  }
}

async function validateBuiltManifest(outputDir: string): Promise<void> {
  const manifestPath = resolve(outputDir, 'module.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    id?: string;
    esmodules?: string[];
    styles?: Array<string | { src?: string }>;
    languages?: Array<{ path?: string }>;
  };
  if (manifest.id !== MODULE_ID) throw new Error(`Built module ID must be ${MODULE_ID}.`);
  const referenced = [
    ...(manifest.esmodules ?? []),
    ...(manifest.styles ?? []).map((style) => typeof style === 'string' ? style : (style.src ?? '')),
    ...(manifest.languages ?? []).map((language) => language.path ?? ''),
  ];
  for (const path of referenced) {
    if (!isSafeArchivePath(path)) throw new Error(`Unsafe or empty module asset path: ${path}`);
    await readFile(resolve(outputDir, path));
  }
}

async function copyFileDeterministically(
  source: string,
  destination: string,
  assertMutationBoundary: () => void,
): Promise<void> {
  const bytes = await readFile(source);
  assertMutationBoundary();
  await mkdir(dirname(destination), { recursive: true });
  assertMutationBoundary();
  await writeFile(destination, bytes);
}

async function collectFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error(`Unsupported build output entry: ${path}`);
    }
  }
  await visit(root);
  return files.sort((left, right) => normalizeArchivePath(relative(root, left)).localeCompare(normalizeArchivePath(relative(root, right)), 'en'));
}

async function scanFiles(files: string[], outputDir: string): Promise<void> {
  for (const path of files) scanBytes(new Uint8Array(await readFile(path)), normalizeArchivePath(relative(outputDir, path)));
}

function scanBytes(bytes: Uint8Array, label: string): void {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  for (const pattern of FORBIDDEN_TEXT) {
    if (pattern.test(text)) throw new Error(`Forbidden local or runtime-incompatible material in ${label}: ${pattern}`);
  }
}

function createDeterministicZip(entries: Array<{ name: string; bytes: Uint8Array }>): Uint8Array {
  const ordered = [...entries].sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of ordered) {
    if (!isSafeArchivePath(entry.name)) throw new Error(`Unsafe ZIP entry path: ${entry.name}`);
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.bytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const local = new DataView(localHeader.buffer);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x0021, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, entry.bytes.length, true);
    local.setUint32(22, entry.bytes.length, true);
    local.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, entry.bytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const central = new DataView(centralHeader.buffer);
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, 0, true);
    central.setUint16(14, 0x0021, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, entry.bytes.length, true);
    central.setUint32(24, entry.bytes.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(38, 0x81a40000, true);
    central.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + entry.bytes.length;
  }

  if (ordered.length > 0xffff) throw new Error('ZIP entry count exceeds the classic ZIP limit.');
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, ordered.length, true);
  endView.setUint16(10, ordered.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return concatBytes([...localParts, ...centralParts, end]);
}

function listZipEntries(bytes: Uint8Array): string[] {
  if (bytes.length < 22) throw new Error('ZIP archive is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = bytes.length - 22;
  if (view.getUint32(endOffset, true) !== 0x06054b50) throw new Error('ZIP end directory is missing.');
  const count = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  const entries: string[] = [];
  for (let index = 0; index < count; index++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error(`ZIP central entry ${index} is invalid.`);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (!isSafeArchivePath(name)) throw new Error(`ZIP central directory contains an unsafe path: ${name}`);
    entries.push(name);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== endOffset) throw new Error('ZIP central directory has unexpected trailing data.');
  return entries;
}

function isSafeArchivePath(path: string): boolean {
  return path.length > 0
    && !path.startsWith('/')
    && !path.startsWith('\\')
    && !/^[A-Za-z]:/.test(path)
    && !path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..' || segment.includes('\\'));
}

function normalizeArchivePath(path: string): string {
  return path.split(sep).join('/');
}

export interface SpellResolverBuildPaths {
  repoRoot: string;
  sourceRoot: string;
  distRoot: string;
  outputDir: string;
  zipPath: string;
}

export function assertSpellResolverBuildMutationBoundary(repoRoot: string): SpellResolverBuildPaths {
  const root = resolve(repoRoot);
  const paths: SpellResolverBuildPaths = {
    repoRoot: root,
    sourceRoot: resolve(root, 'src/foundry/monster-spell-resolver'),
    distRoot: resolve(root, 'dist'),
    outputDir: resolve(root, 'dist', MODULE_ID),
    zipPath: resolve(root, 'dist', `${MODULE_ID}.zip`),
  };
  const rootStats = lstatSync(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error(`Spell resolver build repository root is unsafe: ${root}`);
  }
  for (const [label, target] of [
    ['dist root', paths.distRoot],
    ['output directory', paths.outputDir],
    ['ZIP path', paths.zipPath],
  ] as const) {
    const rel = relative(root, target);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(`Spell resolver build ${label} is outside the repository: ${target}`);
    }
    assertBuildPathHasNoReparse(root, target, label);
  }
  assertBuildTreeHasNoReparse(paths.outputDir);
  return paths;
}

function assertBuildPathHasNoReparse(root: string, target: string, label: string): void {
  let current = root;
  for (const segment of relative(root, target).split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    try {
      const stats = lstatSync(current);
      if (stats.isSymbolicLink()) {
        throw new Error(`Spell resolver build ${label} contains a symlink, junction, or reparse point: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function assertBuildTreeHasNoReparse(root: string): void {
  let rootStats;
  try {
    rootStats = lstatSync(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (rootStats.isSymbolicLink()) {
    throw new Error(`Spell resolver build output contains a symlink, junction, or reparse point: ${root}`);
  }
  if (!rootStats.isDirectory()) {
    throw new Error(`Spell resolver build output must be a directory when present: ${root}`);
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) {
      throw new Error(`Spell resolver build output contains a symlink, junction, or reparse point: ${path}`);
    }
    if (stats.isDirectory()) assertBuildTreeHasNoReparse(path);
    else if (!stats.isFile()) throw new Error(`Unsupported spell resolver build output entry: ${path}`);
  }
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]!;
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = createCrcTable();

if (import.meta.main) {
  const bundleOnlyIndex = process.argv.indexOf('--bundle-only');
  if (bundleOnlyIndex >= 0) {
    const repoRoot = process.argv[bundleOnlyIndex + 1];
    if (!repoRoot) throw new Error('Missing repository root for --bundle-only.');
    const paths = assertSpellResolverBuildMutationBoundary(repoRoot);
    await mkdir(resolve(paths.outputDir, 'scripts'), { recursive: true });
    await buildBrowserBundle(paths);
  } else {
    const result = await buildSpellResolverPackage();
    console.log(JSON.stringify(result, null, 2));
  }
}

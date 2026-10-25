import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { assertNoReparsePathComponents } from '../../tools/foundry-ops/src/config';
import { run } from '../../docs/handbook/build.mjs';
import { MODULE_ID, MODULE_VERSION, SUPPORTED_CORE } from './src/runtime';

const repo = resolve(import.meta.dir, '../..');
const owner = resolve(repo, 'foundry-modules/fvtt-suite-console');
const output = resolve(owner, 'dist/module');
const digest = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export const shippedFiles = ['module.json', 'scripts/index.js', 'styles/suite-handbook.css', 'README.zh-CN.md', 'build-identity.json'] as const;

export function assertBrowserBundle(text: string): void {
  const source = ts.createSourceFile('index.js', text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier)
      || (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && ['eval', 'require', 'Function'].includes(node.expression.text))))
      || (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function')) {
      throw new Error('Handbook bundle contains runtime loading or code execution.');
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

export function validateManifest(manifest: Record<string, any>): void {
  if (manifest.id !== MODULE_ID || manifest.version !== MODULE_VERSION) throw new Error('Handbook manifest identity/version mismatch.');
  const core = manifest.compatibility;
  if (core?.minimum !== SUPPORTED_CORE || core?.verified !== SUPPORTED_CORE || core?.maximum !== SUPPORTED_CORE) throw new Error('Handbook Core compatibility is not the exact accepted target.');
  if (JSON.stringify(manifest.esmodules) !== JSON.stringify(['scripts/index.js'])
    || JSON.stringify(manifest.styles) !== JSON.stringify(['styles/suite-handbook.css'])
    || manifest.socket !== false || manifest.relationships || manifest.packs) throw new Error('Handbook must be an independent read-only browser module.');
}

export async function assertPlainBuildTree(directory: string, base = directory): Promise<void> {
  const stat = await lstat(directory).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (!stat) return;
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Build target must be a plain directory: ' + directory);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const child = await lstat(path);
    if (child.isSymbolicLink()) throw new Error('Build target contains a link: ' + path);
    if (child.isDirectory()) {
      if (!['scripts', 'styles'].includes(path.slice(base.length + 1).replaceAll('\\', '/'))) throw new Error('Unknown build directory; refusing to overwrite: ' + path);
      await assertPlainBuildTree(path, base);
    }
    else if (!child.isFile() || child.nlink !== 1 || !(shippedFiles as readonly string[]).includes(path.slice(base.length + 1).replaceAll('\\', '/'))) {
      throw new Error('Unknown build payload; refusing to overwrite: ' + path);
    }
  }
}

export async function buildModule() {
  run(repo, ['check']);
  run(repo, ['export', '--surface=foundry']);
  const contentText = await readFile(resolve(repo, 'dist/handbook/content.foundry.json'), 'utf8');
  const content = JSON.parse(contentText);
  const projectionText = await readFile(resolve(repo, 'dist/handbook/projection.foundry.json'), 'utf8');
  const projection = JSON.parse(projectionText);
  const includedEntryIds = content.entries?.map((entry: { entryId: string }) => entry.entryId);
  if (content.schemaVersion !== 1 || projection.schemaVersion !== 1 || projection.surface !== 'foundry'
    || !Array.isArray(includedEntryIds) || !Array.isArray(projection.entryIds) || !Array.isArray(projection.omittedEntryIds)
    || !Array.isArray(projection.sourcePaths) || !Array.isArray(projection.excludedSourcePaths)
    || JSON.stringify(includedEntryIds) !== JSON.stringify(projection.entryIds)
    || !Number.isSafeInteger(projection.catalogEntryCount)
    || projection.catalogEntryCount !== includedEntryIds.length + projection.omittedEntryIds.length
    || new Set([...includedEntryIds, ...projection.omittedEntryIds]).size !== projection.catalogEntryCount) {
    throw new Error('Foundry handbook projection does not match exported content.');
  }
  const contentDigest = digest(JSON.stringify(content));
  const manifestText = await readFile(resolve(owner, 'src/module.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  validateManifest(manifest);
  const pkg = JSON.parse(await readFile(resolve(owner, 'package.json'), 'utf8'));
  if (pkg.version !== MODULE_VERSION) throw new Error('Workspace package version differs from the manifest.');
  assertNoReparsePathComponents(owner, output, 'Handbook build output');
  await assertPlainBuildTree(output);
  await mkdir(resolve(output, 'scripts'), { recursive: true });
  await mkdir(resolve(output, 'styles'), { recursive: true });
  const result = await Bun.build({
    entrypoints: [resolve(owner, 'src/index.ts')],
    target: 'browser', format: 'esm', splitting: false, minify: false, sourcemap: 'none',
    define: { __SUITE_HANDBOOK_CONTENT__: JSON.stringify(content), __SUITE_HANDBOOK_DIGEST__: JSON.stringify(contentDigest) },
  });
  if (!result.success || result.outputs.length !== 1) throw new Error('Handbook browser build failed: ' + result.logs.map(String).join('; '));
  const browserText = await result.outputs[0]!.text();
  assertBrowserBundle(browserText);
  const css = await readFile(resolve(owner, 'src/styles/suite-handbook.css'), 'utf8');
  const handbookPath = resolve(repo, '工具手册.html');
  const handbookStat = await lstat(handbookPath);
  if (!handbookStat.isFile() || handbookStat.isSymbolicLink() || handbookStat.nlink !== 1) throw new Error('Offline handbook source must be a plain independent file.');
  const handbookHtml = await readFile(handbookPath);
  const identity = { moduleId: MODULE_ID, version: MODULE_VERSION, surface: 'foundry', catalogEntryCount: projection.catalogEntryCount,
    includedEntryIds, omittedEntryIds: projection.omittedEntryIds, projectionSha256: digest(projectionText), contentDigest,
    browserSha256: digest(browserText), stylesheetSha256: digest(css), handbookHtmlSha256: digest(handbookHtml) };
  await writeFile(resolve(output, 'scripts/index.js'), browserText);
  await writeFile(resolve(output, 'module.json'), manifestText);
  await writeFile(resolve(output, 'styles/suite-handbook.css'), css);
  await writeFile(resolve(output, 'README.zh-CN.md'), await readFile(resolve(owner, 'docs/INSTALL.zh-CN.md')));
  await writeFile(resolve(output, 'build-identity.json'), JSON.stringify(identity, null, 2) + '\n');
  await assertPlainBuildTree(output);
  return { output, ...identity };
}
if (import.meta.main) console.log(JSON.stringify(await buildModule(), null, 2));

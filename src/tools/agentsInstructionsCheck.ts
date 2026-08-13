import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';

const workspaceRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const maxInstructionChainBytes = 32 * 1024;

/** The exact flags used by the repository's local Ruler invocation. */
export const rulerApplyArgs = [
  'apply',
  '--agents',
  'agentsmd',
  '--local-only',
  '--no-nested',
  '--no-skills',
  '--no-subagents',
  '--no-mcp',
  '--no-gitignore',
  '--no-backup',
] as const;

/** Runtime AGENTS files required by the repository governance contract. */
export const requiredAgentsFiles = [
  'AGENTS.md',
  'packages/AGENTS.md',
  'packages/parser/AGENTS.md',
  'packages/generation/AGENTS.md',
  'packages/workflows/AGENTS.md',
  'packages/intake-ai/AGENTS.md',
  'packages/ingest-documents/AGENTS.md',
  'packages/ingest-plaintext/AGENTS.md',
  'packages/crawl-goddessfantasy/AGENTS.md',
  'packages/assets-icons/AGENTS.md',
  'packages/spell-manifest-contracts/AGENTS.md',
  'packages/blood-hunter-v14/AGENTS.md',
  'apps/AGENTS.md',
  'apps/cli/AGENTS.md',
  'apps/web/AGENTS.md',
  'foundry-modules/AGENTS.md',
  'foundry-modules/chat-memory-guard/AGENTS.md',
  'foundry-modules/session-monitor/AGENTS.md',
  'foundry-modules/monster-spell-resolver/AGENTS.md',
  'foundry-modules/fvtt-babele-rolltable-embed-translation/AGENTS.md',
  'foundry-modules/fvtt-battlefield-painter/AGENTS.md',
  'foundry-modules/fvtt-blood-hunter-2024/AGENTS.md',
  'foundry-modules/fvtt-homebrew-species/AGENTS.md',
  'foundry-modules/fvtt-house-rules/AGENTS.md',
  'foundry-modules/fvtt-injury-fading-spirits/AGENTS.md',
  'tools/AGENTS.md',
  'tools/foundry-ops/AGENTS.md',
] as const;

const ancestorAgentsFiles = new Set([
  'packages/AGENTS.md',
  'apps/AGENTS.md',
  'foundry-modules/AGENTS.md',
  'tools/AGENTS.md',
]);

/** Explicit leaf list; this must stay tracked and must never include .local. */
export const requiredLeafAgentsFiles = requiredAgentsFiles.filter(
  (path) => path !== 'AGENTS.md' && !ancestorAgentsFiles.has(path),
);

export const routedFromRoot = [
  'packages/AGENTS.md',
  'apps/AGENTS.md',
  'foundry-modules/AGENTS.md',
  'tools/AGENTS.md',
] as const;

export type FileSnapshot = ReadonlyMap<string, Buffer>;

export type ApplyRuler = (projectRoot: string, workspaceRoot: string) => void;

export interface AgentsInstructionsCheckOptions {
  workspaceRoot?: string;
  requiredFiles?: readonly string[];
  requiredLeafFiles?: readonly string[];
  routedFiles?: readonly string[];
  verifyTracked?: boolean;
  applyRuler?: ApplyRuler;
  rulerBinaryPath?: string;
  tempParent?: string;
}

export interface AgentsInstructionsCheckResult {
  ok: boolean;
  errors: string[];
  requiredFileCount: number;
}

function pathFor(root: string, relativePath: string): string {
  return join(root, ...relativePath.split('/'));
}

function normalizeRelativePath(path: string): string {
  return path.split(sep).join('/');
}

function readWorkspaceFile(root: string, path: string): string {
  return readFileSync(pathFor(root, path), 'utf8');
}

function collectFileSnapshot(root: string): Map<string, Buffer> {
  const snapshot = new Map<string, Buffer>();
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      const relativePath = normalizeRelativePath(relative(root, absolutePath));
      if (entry.isSymbolicLink()) {
        throw new Error(`临时 Ruler 目录出现链接，拒绝把链接当作产物：${relativePath}`);
      }
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        snapshot.set(relativePath, readFileSync(absolutePath));
      }
    }
  };
  visit(root);
  return snapshot;
}

export function compareSnapshots(first: FileSnapshot, second: FileSnapshot): string[] {
  const changed: string[] = [];
  const paths = new Set([...first.keys(), ...second.keys()]);
  for (const path of [...paths].sort()) {
    const before = first.get(path);
    const after = second.get(path);
    if (!before || !after || !before.equals(after)) changed.push(path);
  }
  return changed;
}

function resolveLocalRulerBinary(root: string): string | undefined {
  const candidates = process.platform === 'win32'
    ? ['ruler.exe', 'ruler.cmd', 'ruler.bunx']
    : ['ruler'];
  for (const candidate of candidates) {
    const path = join(root, 'node_modules', '.bin', candidate);
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return undefined;
}

export function applyProjectLocalRuler(
  projectRoot: string,
  root: string,
  rulerBinaryPath = resolveLocalRulerBinary(root),
): void {
  if (!rulerBinaryPath) {
    throw new Error('缺少项目本地 Ruler binary：node_modules/.bin/ruler');
  }
  const result = spawnSync(rulerBinaryPath, [...rulerApplyArgs, '--project-root', projectRoot], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(`项目本地 Ruler 启动失败：${result.error.message}`);
  }
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`项目本地 Ruler apply 失败（exit ${result.status}）：${output}`);
  }
}

function isGitWorktree(root: string): boolean {
  return existsSync(join(root, '.git'));
}

function trackedAgentsFiles(root: string): string[] | undefined {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'buffer', windowsHide: true });
  if (result.error || result.status !== 0) return undefined;
  return result.stdout
    .toString('utf8')
    .split('\0')
    .filter((path) => path && path !== '.ruler/AGENTS.md' && !path.startsWith('.local/'))
    .filter((path) => path === 'AGENTS.md' || path.endsWith('/AGENTS.md'));
}

function validateRequiredFiles(
  root: string,
  requiredFiles: readonly string[],
  errors: string[],
): void {
  for (const path of requiredFiles) {
    if (path.startsWith('.local/') || path.includes('\\.local\\')) {
      errors.push(`必需说明文件清单不得包含 .local 路径：${path}`);
      continue;
    }
    const absolutePath = pathFor(root, path);
    if (!existsSync(absolutePath) || !lstatSync(absolutePath).isFile()) {
      errors.push(`缺少必需说明文件：${path}`);
      continue;
    }

    if (path !== 'AGENTS.md') {
      const content = readWorkspaceFile(root, path);
      if (!/^#\s+\S/m.test(content)) {
        errors.push(`${path} 缺少可识别的文档标题。`);
      }
      if (!/(用途|范围|负责|做什么|\bScope\b)/i.test(content)) {
        errors.push(`${path} 缺少用途或作用范围说明。`);
      }
      if (!/(验证|测试|验收|\bAcceptance\b|\bVerification\b|\bTesting\b)/i.test(content)) {
        errors.push(`${path} 缺少验证或验收说明。`);
      }

      const scopeDirectory = join(root, dirname(path));
      if (!existsSync(scopeDirectory) || !statSync(scopeDirectory).isDirectory()) {
        errors.push(`${path} 对应的功能目录不存在：${relative(root, scopeDirectory)}`);
      }
    }
  }
}

function validateTrackedExplicitFiles(
  root: string,
  requiredFiles: readonly string[],
  errors: string[],
): void {
  const tracked = trackedAgentsFiles(root);
  if (!tracked) {
    errors.push('无法读取 Git tracked AGENTS 清单。');
    return;
  }
  const requiredSet = new Set(requiredFiles);
  for (const path of requiredFiles) {
    if (!tracked.includes(path)) errors.push(`必需说明文件未被 Git tracked：${path}`);
  }
  for (const path of tracked) {
    if (!requiredSet.has(path)) errors.push(`Git tracked AGENTS 文件未列入显式清单：${path}`);
  }
}

function validateInstructionChains(
  root: string,
  leafFiles: readonly string[],
  errors: string[],
): void {
  for (const leafFile of leafFiles) {
    if (leafFile.startsWith('.local/') || leafFile.includes('\\.local\\')) {
      errors.push(`leaf 清单不得包含 .local 路径：${leafFile}`);
      continue;
    }
    const scope = dirname(leafFile);
    const segments = scope.split(/[\\/]+/).filter(Boolean);
    const chain = ['AGENTS.md'];
    let current = root;
    for (const segment of segments) {
      current = join(current, segment);
      const candidate = join(current, 'AGENTS.md');
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        chain.push(normalizeRelativePath(relative(root, candidate)));
      }
    }
    const chainBytes = chain.reduce((sum, path) => sum + Buffer.byteLength(readWorkspaceFile(root, path), 'utf8'), 0);
    if (chainBytes > maxInstructionChainBytes) {
      errors.push(`${scope} 的 AGENTS 指令链为 ${chainBytes} bytes，超过默认 32 KiB：${chain.join(' -> ')}`);
    }
  }
}

function validateRootRoutes(root: string, routedFiles: readonly string[], errors: string[]): void {
  if (!existsSync(join(root, 'AGENTS.md'))) return;
  const rootContent = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  for (const route of routedFiles) {
    if (!rootContent.includes(route)) errors.push(`根 AGENTS.md 没有路由到 ${route}。`);
  }
}

function validateRetiredPaths(root: string, errors: string[]): void {
  const retiredGeneratorAgents = join(root, 'src', 'core', 'generator', 'AGENTS.md');
  if (existsSync(retiredGeneratorAgents)) {
    errors.push('旧 src/core/generator/AGENTS.md 仍存在，会与 packages/generation/AGENTS.md 形成重复 owner。');
  }
  const retiredSpellResolverRoot = join(root, 'src', 'foundry', 'monster-spell-resolver');
  if (existsSync(retiredSpellResolverRoot)) {
    errors.push('旧 src/foundry/monster-spell-resolver 仍存在，会与 foundry-modules/monster-spell-resolver 形成重复 owner。');
  }
}

function copyRulerSource(root: string, tempRoot: string): void {
  const source = join(root, '.ruler');
  const destination = join(tempRoot, '.ruler');
  cpSync(source, destination, { recursive: true, errorOnExist: false, force: false });
}

function validateGeneratedArtifacts(
  root: string,
  options: AgentsInstructionsCheckOptions,
  errors: string[],
): void {
  const sourceDirectory = join(root, '.ruler');
  const sourceFile = join(sourceDirectory, 'AGENTS.md');
  const configFile = join(sourceDirectory, 'ruler.toml');
  const trackedRoot = join(root, 'AGENTS.md');
  if (!existsSync(sourceFile) || !lstatSync(sourceFile).isFile()) return;
  if (!existsSync(configFile) || !lstatSync(configFile).isFile()) {
    errors.push('缺少 .ruler/ruler.toml，无法锁定本地 Ruler 行为。');
    return;
  }
  if (!existsSync(trackedRoot) || !lstatSync(trackedRoot).isFile()) return;

  const tempParent = options.tempParent ?? tmpdir();
  const tempRoot = mkdtempSync(join(tempParent, 'fvtt-ruler-check-'));
  try {
    copyRulerSource(root, tempRoot);
    const before = collectFileSnapshot(tempRoot);
    const apply = options.applyRuler ?? ((projectRoot: string, projectRootOwner: string) => {
      applyProjectLocalRuler(projectRoot, projectRootOwner, options.rulerBinaryPath);
    });
    apply(tempRoot, root);
    const first = collectFileSnapshot(tempRoot);
    apply(tempRoot, root);
    const second = collectFileSnapshot(tempRoot);

    const changed = compareSnapshots(first, second);
    if (changed.length > 0) errors.push(`Ruler 连续 apply 不是字节幂等：${changed.join(', ')}`);

    const expected = new Set([...before.keys(), 'AGENTS.md']);
    const actual = new Set(first.keys());
    const missing = [...expected].filter((path) => !actual.has(path));
    const extra = [...actual].filter((path) => !expected.has(path));
    if (missing.length > 0) errors.push(`Ruler 临时输出缺少文件：${missing.join(', ')}`);
    if (extra.length > 0) errors.push(`Ruler 临时输出产生额外产物：${extra.join(', ')}`);

    const generated = first.get('AGENTS.md');
    const tracked = readFileSync(trackedRoot);
    if (!generated || !generated.equals(tracked)) {
      errors.push('临时 Ruler 生成的 AGENTS.md 与 tracked 根文件不一致。');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    try {
      rmSync(tempRoot, { recursive: true, force: false });
    } catch (error) {
      errors.push(`清理 Ruler 临时目录失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export function runAgentsInstructionsCheck(
  options: AgentsInstructionsCheckOptions = {},
): AgentsInstructionsCheckResult {
  const root = resolve(options.workspaceRoot ?? workspaceRoot);
  const requiredFiles = options.requiredFiles ?? requiredAgentsFiles;
  const leafFiles = options.requiredLeafFiles ?? requiredLeafAgentsFiles;
  const routedFiles = options.routedFiles ?? routedFromRoot;
  const errors: string[] = [];

  const source = join(root, '.ruler', 'AGENTS.md');
  const trackedRoot = join(root, 'AGENTS.md');
  if (!existsSync(source)) errors.push('缺少根说明源文件 .ruler/AGENTS.md。');
  if (!existsSync(trackedRoot)) errors.push('缺少生成后的根 AGENTS.md。');

  validateRequiredFiles(root, requiredFiles, errors);
  if (options.verifyTracked ?? isGitWorktree(root)) validateTrackedExplicitFiles(root, requiredFiles, errors);
  validateRootRoutes(root, routedFiles, errors);
  validateRetiredPaths(root, errors);
  validateInstructionChains(root, leafFiles, errors);
  validateGeneratedArtifacts(root, options, errors);

  return { ok: errors.length === 0, errors, requiredFileCount: requiredFiles.length };
}

function runCli(): void {
  const result = runAgentsInstructionsCheck();
  if (!result.ok) {
    console.error('AGENTS.md 分层检查失败：');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`AGENTS.md 分层检查通过：${result.requiredFileCount} 个必需文件，Ruler 生成幂等、tracked 根一致、无额外产物，所有根路由和指令链均有效。`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();

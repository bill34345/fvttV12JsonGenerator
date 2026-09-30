import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { assertNoReparsePathComponents, resolveThroughExistingAncestor } from '../config';
import { AcceptanceError, type AcceptanceContract, type FileIdentity } from './model';

export const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AcceptanceError('evidence', 'Expected a JSON object.');
  return value as Record<string, unknown>;
}

export function exactPath(path: string, root?: string): string {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new AcceptanceError('precondition', `Absolute path required: ${path}`);
  const lexical = resolve(path);
  try {
    assertNoReparsePathComponents(parse(lexical).root, lexical, 'Acceptance path');
    const absolute = resolveThroughExistingAncestor(lexical);
    if (root) assertNoReparsePathComponents(root, absolute, 'Acceptance workspace');
    return absolute;
  } catch (error) { throw new AcceptanceError('precondition', error instanceof Error ? error.message : String(error)); }
}

export function fileIdentity(path: string, root?: string): FileIdentity {
  const absolutePath = exactPath(path, root);
  if (!lstatSync(absolutePath).isFile()) throw new AcceptanceError('precondition', `Ordinary file required: ${absolutePath}`);
  return { absolutePath, sha256: sha256(readFileSync(absolutePath)) };
}

export function readJson(path: string): unknown { return JSON.parse(readFileSync(exactPath(path), 'utf8')); }
export function writeNewJson(path: string, value: unknown): void {
  exactPath(path);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function git(root: string, args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  if (result.error || result.status !== 0) throw new AcceptanceError('precondition', `Git identity check failed: ${args.join(' ')}`);
  return result.stdout.trim();
}

export function workspaceIdentity(root: string): AcceptanceContract['workspace'] {
  const absoluteRoot = exactPath(root);
  if (relative(absoluteRoot, exactPath(git(absoluteRoot, ['rev-parse', '--show-toplevel'])))) {
    throw new AcceptanceError('precondition', 'workspaceRoot must be the exact Git worktree root.');
  }
  return {
    absoluteRoot,
    branch: git(root, ['symbolic-ref', '--short', 'HEAD']),
    head: git(root, ['rev-parse', 'HEAD']),
    instructionBaseline: git(root, ['log', '-1', '--format=%H', '--', '.ruler/AGENTS.md', 'AGENTS.md', 'docs/runbooks/development-feedback-loop.md']),
  };
}

export function instructionFiles(root: string, candidates: FileIdentity[]): FileIdentity[] {
  const paths = new Set([join(root, 'AGENTS.md'), join(root, '.ruler/AGENTS.md'), join(root, 'docs/runbooks/development-feedback-loop.md')]);
  for (const candidate of candidates) {
    let directory = dirname(candidate.absolutePath);
    while (relative(root, directory)) {
      const instruction = join(directory, 'AGENTS.md');
      if (existsSync(instruction)) paths.add(instruction);
      directory = dirname(directory);
    }
  }
  return [...paths].sort().map(path => fileIdentity(path, root));
}

export function assertCurrent(contract: AcceptanceContract): void {
  const current = workspaceIdentity(contract.workspace.absoluteRoot);
  if (JSON.stringify(current) !== JSON.stringify(contract.workspace)) throw new AcceptanceError('precondition', 'Workspace branch, HEAD or instruction baseline changed. Prepare a new contract.');
  for (const identity of [...contract.candidates, ...contract.instructions]) {
    if (fileIdentity(identity.absolutePath, current.absoluteRoot).sha256 !== identity.sha256) {
      throw new AcceptanceError('precondition', `Candidate or instruction changed: ${identity.absolutePath}`);
    }
  }
  for (const identity of contract.executables) {
    if (fileIdentity(identity.absolutePath).sha256 !== identity.sha256) throw new AcceptanceError('precondition', `Check executable changed: ${identity.absolutePath}`);
  }
}

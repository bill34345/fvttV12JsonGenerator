import { spawnSync } from 'node:child_process';
import { relative } from 'node:path';
import { exactPath, fileIdentity, record, workspaceIdentity } from './files';
import { AcceptanceError, type FileIdentity } from './model';

export function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f]/.test(value)) throw new AcceptanceError('evidence', `Missing or invalid ${label}.`);
  return value;
}

export function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new AcceptanceError('evidence', `Expected ${label} array.`);
  return value;
}

/** Reads bytes only; a digest proves identity, not the meaning or authority of a document. */
export function readback(value: unknown): FileIdentity {
  const expected = record(value);
  const actual = fileIdentity(requiredText(expected.absolutePath, 'evidence absolutePath'));
  if (actual.sha256 !== expected.sha256) throw new AcceptanceError('evidence', `Readback mismatch: ${actual.absolutePath}`);
  return actual;
}

export function gitRead(root: string, args: string[]): Buffer {
  const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', root, ...args], { timeout: 15000, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) throw new AcceptanceError('evidence', `Git read failed: ${args[0]}`);
  return result.stdout;
}

export interface RetainedCommit { repositoryRoot: string; ref: string; commit: string }
export function retainedCommit(value: unknown): RetainedCommit {
  const target = record(value);
  const repositoryRoot = workspaceIdentity(requiredText(target.repositoryRoot, 'repositoryRoot')).absoluteRoot;
  const ref = requiredText(target.ref, 'retained ref');
  const commit = requiredText(target.commit, 'retained commit');
  if (!/^refs\/(heads|tags)\/.+/.test(ref) || !/^[a-f0-9]{40}$/.test(commit)) throw new AcceptanceError('evidence', 'Use a local branch/tag and full pinned commit; remote cache is not publication proof.');
  if (gitRead(repositoryRoot, ['rev-parse', '--verify', `${ref}^{commit}`]).toString().trim() !== commit) throw new AcceptanceError('evidence', 'Retained ref changed.');
  gitRead(repositoryRoot, ['cat-file', 'commit', commit]);
  return { repositoryRoot, ref, commit };
}

export function integratedCommit(value: unknown, head: string): RetainedCommit {
  const retained = retainedCommit(value);
  gitRead(retained.repositoryRoot, ['merge-base', '--is-ancestor', head, retained.commit]);
  return retained;
}

export function samePath(left: string, right: string): boolean { return !relative(exactPath(left), exactPath(right)); }

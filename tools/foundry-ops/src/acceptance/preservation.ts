import { existsSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { exactPath, fileIdentity, readJson, record, sha256, workspaceIdentity } from './files';
import { AcceptanceError } from './model';
import { gitRead, integratedCommit, list, requiredText, retainedCommit } from './inspection';

type ContentKind = 'index' | 'worktree' | 'untracked' | 'ignored';
interface Content { kind: ContentKind; path: string }
function paths(root: string, args: string[]): string[] { return gitRead(root, args).toString('utf8').split('\0').filter(Boolean); }
function filePath(value: unknown): string {
  const path = requiredText(value, 'repository relative file path');
  if (isAbsolute(path) || path.includes('\\') || path.split('/').some(part => !part || part === '..' || part === '.') || path.includes(':')) throw new AcceptanceError('evidence', 'Use an exact slash-separated repository file path.');
  return path;
}
function outside(root: string, path: string): void {
  const delta = relative(root, exactPath(path));
  if (!delta || (!delta.startsWith('..' + '/') && !delta.startsWith('..' + '\\') && !isAbsolute(delta))) throw new AcceptanceError('evidence', 'Recovery is inside the proposed removal scope.');
}
function inventory(root: string): Content[] {
  const commands: Array<[ContentKind, string[]]> = [
    ['index', ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', 'HEAD', '--']],
    ['worktree', ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', '--']],
    ['untracked', ['ls-files', '--others', '--exclude-standard', '-z']],
    ['ignored', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z']],
  ];
  return commands.flatMap(([kind, args]) => paths(root, args).map(path => ({ kind, path })));
}

/** No copy, save, reset, remove, archive, prune, service operation or command from the input. */
export function inspectPreservation(path: string) {
  const request = record(readJson(path));
  if (request.template === true || request.protocolVersion !== 1) throw new AcceptanceError('evidence', 'An actual protocolVersion 1 preservation request is required.');
  const taskId = requiredText(request.taskId, 'taskId');
  requiredText(request.ownerThreadId, 'ownerThreadId');
  const declared = record(request.workspace);
  const workspace = workspaceIdentity(requiredText(declared.absoluteRoot, 'workspace.absoluteRoot'));
  if (workspace.head !== declared.head || workspace.branch !== declared.branch) throw new AcceptanceError('evidence', 'Preservation workspace baseline changed.');
  const unknowns = list(request.unknowns, 'unknowns').map(value => requiredText(value, 'unknown item'));
  const issues: string[] = [...unknowns];
  const evidence: unknown[] = [];
  try {
    const retained = integratedCommit(request.integration, workspace.head);
    outside(workspace.absoluteRoot, retained.repositoryRoot);
    const gitDirectory = gitRead(retained.repositoryRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir']).toString().trim();
    outside(workspace.absoluteRoot, gitDirectory);
    evidence.push({ kind: 'committed', status: 'READ_BACK_INTEGRATED', ...retained });
  } catch (error) { issues.push(`Committed content: ${error instanceof Error ? error.message : String(error)}`); }
  const before = inventory(workspace.absoluteRoot);
  for (const flags of [['--cached'], []]) {
    const changes = paths(workspace.absoluteRoot, ['diff', ...flags, '--no-ext-diff', '--no-textconv', '--no-renames', '--raw', '-z', '--']);
    if (changes.some(change => {
      const modes = /^:(\d{6}) (\d{6}) /.exec(change);
      // Added executables have no retained HEAD mode; matching bytes do not preserve that intent.
      return modes && modes[1] !== modes[2] && modes[2] !== '000000'
        && (modes[1] !== '000000' || modes[2] === '100755');
    })) issues.push('File mode changes require separate intent review.');
  }
  if (paths(workspace.absoluteRoot, ['ls-files', '-v', '-z']).some(item => /^[a-zS] /.test(item))) issues.push('Assume-unchanged or skip-worktree entries require separate content review.');
  const entries = list(request.entries, 'entries').map(record);
  const actualKeys = new Set(before.map(item => `${item.kind}:${item.path}`));
  const keys = new Set<string>();
  const byKey = new Map<string, Record<string, unknown>>();
  for (const entry of entries) {
    const key = `${entry.kind}:${filePath(entry.path)}`;
    if (keys.has(key) || !actualKeys.has(key)) throw new AcceptanceError('evidence', `Duplicate or stale inventory entry: ${key}`);
    keys.add(key);
    byKey.set(key, entry);
  }
  for (const item of before) {
    const label = `${item.kind}:${item.path}`;
    const entry = byKey.get(label);
    if (!entry) { issues.push(`Unclassified ${label}`); continue; }
    try {
      requiredText(entry.reason, 'disposition reason');
      const sourcePath = exactPath(join(workspace.absoluteRoot, filePath(item.path)), workspace.absoluteRoot);
      if (entry.disposition === 'regenerable' && (item.kind === 'ignored' || item.kind === 'untracked')) {
        evidence.push({ ...item, status: 'DECLARED_REGENERABLE', reason: entry.reason });
        continue;
      }
      if (entry.disposition !== 'retain') throw new AcceptanceError('evidence', 'Unresolved disposition; tracked changes need byte preservation.');
      let sourceSha256: string;
      if (item.kind === 'index') {
        const indexEntry = gitRead(workspace.absoluteRoot, ['ls-files', '--stage', '-z', '--', item.path]).toString();
        if (!/^100(?:644|755) [a-f0-9]+ 0\t/.test(indexEntry)) throw new AcceptanceError('evidence', 'Deleted, conflicted or non-file index entry needs separate intent review.');
        sourceSha256 = sha256(gitRead(workspace.absoluteRoot, ['show', `:${item.path}`]));
      } else {
        if (!existsSync(sourcePath)) throw new AcceptanceError('evidence', 'Missing/deleted working file needs separate intent review.');
        sourceSha256 = fileIdentity(sourcePath).sha256;
      }
      const recovery = record(entry.recovery);
      let recoverySha256: string;
      if (recovery.kind === 'file') {
        const identity = fileIdentity(requiredText(recovery.absolutePath, 'recovery.absolutePath'));
        outside(workspace.absoluteRoot, identity.absolutePath);
        recoverySha256 = identity.sha256;
      } else if (recovery.kind === 'git') {
        const retained = retainedCommit(recovery);
        outside(workspace.absoluteRoot, retained.repositoryRoot);
        outside(workspace.absoluteRoot, gitRead(retained.repositoryRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir']).toString().trim());
        recoverySha256 = sha256(gitRead(retained.repositoryRoot, ['show', `${retained.commit}:${filePath(recovery.path)}`]));
      } else throw new AcceptanceError('evidence', 'Recovery must be an existing file or reachable Git path.');
      if (sourceSha256 !== recoverySha256) throw new AcceptanceError('evidence', 'Preserved bytes do not match.');
      evidence.push({ ...item, status: 'READ_BACK_MATCH', sha256: sourceSha256, recovery });
    } catch (error) { issues.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (gitRead(workspace.absoluteRoot, ['ls-files', '--stage', '-z']).toString().split('\0').some(line => /^(160000|120000) /.test(line))) issues.push('Submodule or tracked link content requires separate scope review.');
  if (JSON.stringify(before) !== JSON.stringify(inventory(workspace.absoluteRoot)) || workspaceIdentity(workspace.absoluteRoot).head !== workspace.head) issues.push('Inventory changed during inspection.');
  return { ok: !issues.length, status: issues.length ? 'INCOMPLETE' : 'EVIDENCE_COMPLETE', taskId, workspace, counts: Object.fromEntries(['index', 'worktree', 'untracked', 'ignored'].map(kind => [kind, before.filter(item => item.kind === kind).length])), evidence, unknowns: issues, deletionAuthorized: false, publication: 'NOT_CHECKED', note: 'Read-only evidence check. Regenerability and scope decisions are declarations; this result never grants deletion authority. Unknown history remains unknown.' };
}

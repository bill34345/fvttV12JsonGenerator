import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../publishGithub.ts', import.meta.url));

test('publishes selected local changes and verified conflict resolutions while rejecting extra content', () => {
  const root = mkdtempSync(join(tmpdir(), 'fvtt scoped publish '));
  const repo = join(root, 'local');
  const remote = join(root, 'public.git');
  const globalConfig = join(root, 'gitconfig');
  writeFileSync(globalConfig, '');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1', GIT_ALLOW_PROTOCOL: 'file' };

  function run(command: string, args: string[], cwd = repo) {
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', windowsHide: true });
    if (result.error) throw result.error;
    return result;
  }

  function gitAt(cwd: string, ...args: string[]) {
    const result = run('git', args, cwd);
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    return result.stdout.trim();
  }

  function git(...args: string[]) {
    return gitAt(repo, ...args);
  }

  function tool(...args: string[]) {
    return run(process.execPath, [script, ...args]);
  }

  function commit(file: string, content: string, cwd = repo) {
    writeFileSync(join(cwd, file), content);
    gitAt(cwd, 'add', file);
    gitAt(cwd, 'commit', '-m', file);
    return gitAt(cwd, 'rev-parse', 'HEAD');
  }

  try {
    mkdirSync(repo);
    git('init', '-b', 'master');
    git('config', 'user.name', 'Temporary fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    const initial = commit('base.txt', 'public baseline\n');
    git('clone', '--bare', repo, remote);
    git('remote', 'add', 'origin', remote);

    const checkoutHook = join(repo, '.git', 'hooks', 'post-checkout');
    writeFileSync(checkoutHook, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    expect(tool('install', '--apply').status).toBe(0);
    expect(tool('install', '--apply').status).toBe(0);
    expect(readFileSync(checkoutHook, 'utf8')).toBe('#!/bin/sh\nexit 0\n');

    git('switch', '-c', 'shared-fix');
    const base = commit('base.txt', 'shared fix\n');
    const beforeMerge = run('git', ['push', 'origin', 'HEAD:master']);
    expect(beforeMerge.status).toBe(1);
    expect(beforeMerge.stderr).toContain('缺少');
    expect(git('--git-dir', remote, 'rev-parse', 'master')).toBe(initial);
    git('switch', 'master');
    git('merge', '--ff-only', 'shared-fix');
    git('push', 'origin', 'master');
    expect(git('--git-dir', remote, 'rev-parse', 'master')).toBe(base);

    const formerPrivateTip = commit('private.txt', 'local-only notes\n');
    git('switch', '-c', 'feature');
    const selected = commit('sample.txt', 'publish me\n');
    const unmerged = tool(selected, '--apply');
    expect(unmerged.status).toBe(1);
    expect(unmerged.stderr).toContain('尚未合入本地 master');
    const rawPush = run('git', ['push', 'origin', 'HEAD:master']);
    expect(rawPush.status).toBe(1);
    expect(rawPush.stderr).toContain('缺少');

    const verifiedLookingTip = git('commit-tree', git('rev-parse', 'HEAD^{tree}'), '-p', base,
      '-m', `A candidate\n\nLocal-Master-Source: ${selected}`);
    const direct = run('git', ['push', 'origin', `${verifiedLookingTip}:master`]);
    expect(direct.status).toBe(1);
    expect(direct.stderr).toContain('尚未合入本地 master');
    expect(git('--git-dir', remote, 'rev-parse', 'master')).toBe(base);

    git('switch', 'master');
    expect(git('rev-parse', 'HEAD')).toBe(formerPrivateTip);
    git('merge', '--ff-only', 'feature');
    const localTip = commit('later.txt', 'also local only\n');
    const preview = tool(selected);
    expect(preview.status).toBe(0);
    expect(preview.stdout).toContain('sample.txt');
    expect(git('--git-dir', remote, 'rev-parse', 'master')).toBe(base);

    const extra = git('commit-tree', git('rev-parse', 'HEAD^{tree}'), '-p', base,
      '-m', `Extra content\n\nLocal-Master-Source: ${selected}`);
    const changed = run('git', ['push', 'origin', `${extra}:master`]);
    expect(changed.status).toBe(1);
    expect(changed.stderr).toContain('内容不一致');

    const linked = join(root, 'linked');
    git('worktree', 'add', '--detach', linked, base);
    const published = run(process.execPath, [script, selected, '--apply'], linked);
    if (published.status !== 0) throw new Error(published.stderr || published.stdout);
    expect(published.stdout).toContain('公开 master 已更新');
    expect(git('--git-dir', remote, 'rev-list', '--count', `${base}..master`)).toBe('1');
    expect(git('--git-dir', remote, 'ls-tree', '-r', '--name-only', 'master').split('\n')).toEqual(['base.txt', 'sample.txt']);
    expect(git('--git-dir', remote, 'show', 'master:sample.txt')).toBe('publish me');
    expect(git('rev-parse', 'master')).toBe(localTip);
    expect(git('status', '--porcelain')).toBe('');
    expect(tool(selected, '--apply').stdout).toContain('内容已在发布基线上');
    expect(git('--git-dir', remote, 'rev-list', '--count', `${base}..master`)).toBe('1');

    const publicClone = join(root, 'public');
    git('clone', remote, publicClone);
    gitAt(publicClone, 'config', 'user.name', 'Temporary fixture');
    gitAt(publicClone, 'config', 'user.email', 'fixture@example.invalid');
    commit('public-only.txt', 'keep the public change\n', publicClone);
    const publicTip = commit('base.txt', 'public edit\n', publicClone);
    gitAt(publicClone, 'push', 'origin', 'master');

    writeFileSync(join(repo, 'scope.txt'), 'selected details\n');
    git('add', 'scope.txt');
    const conflicting = commit('base.txt', 'local edit\n');
    const blocked = tool(conflicting, '--apply');
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain('base.txt');
    expect(git('--git-dir', remote, 'rev-parse', 'master')).toBe(publicTip);

    gitAt(linked, 'switch', '--detach', publicTip);
    expect(run('git', ['cherry-pick', conflicting], linked).status).toBe(1);
    writeFileSync(join(linked, 'base.txt'), 'public edit and local edit\n');
    gitAt(linked, 'add', 'base.txt');
    gitAt(linked, '-c', 'core.editor=true', 'cherry-pick', '--continue');
    const resolved = gitAt(linked, 'rev-parse', 'HEAD');
    writeFileSync(join(linked, 'scope.txt'), 'unexpected edit to a non-conflicting file\n');
    gitAt(linked, 'add', 'scope.txt');
    gitAt(linked, 'commit', '--amend', '--no-edit');
    const tampered = gitAt(linked, 'rev-parse', 'HEAD');
    const refused = tool(`${conflicting}=${tampered}`, '--apply');
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('解决结果改变了非冲突文件：scope.txt');
    expect(git('--git-dir', remote, 'rev-parse', 'master')).toBe(publicTip);

    const adapted = tool(`${conflicting}=${resolved}`, '--apply');
    if (adapted.status !== 0) throw new Error(adapted.stderr || adapted.stdout);
    expect(git('--git-dir', remote, 'rev-list', '--count', `${publicTip}..master`)).toBe('1');
    expect(git('--git-dir', remote, 'show', 'master:base.txt')).toBe('public edit and local edit');
    expect(git('--git-dir', remote, 'show', 'master:scope.txt')).toBe('selected details');
    expect(git('--git-dir', remote, 'show', 'master:public-only.txt')).toBe('keep the public change');
    expect(git('--git-dir', remote, 'ls-tree', '-r', '--name-only', 'master').split('\n')).toEqual([
      'base.txt', 'public-only.txt', 'sample.txt', 'scope.txt',
    ]);
    expect(git('rev-parse', 'master')).toBe(conflicting);
    expect(git('status', '--porcelain')).toBe('');
  } finally {
    rmSync(root, { recursive: true });
  }
}, 60_000);

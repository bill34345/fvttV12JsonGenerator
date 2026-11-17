import { accessSync, constants, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireGitText, runGitCommand } from './gitCommand';

const master = 'refs/heads/master';
const remoteMaster = 'refs/remotes/origin/master';
const sourceTrailer = 'Local-Master-Source: ';
const hookMarker = '# fvttV12JsonGenerator scoped GitHub publication';
const objectId = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;

function isAncestor(source: string, tip: string): boolean {
  return runGitCommand(['merge-base', '--is-ancestor', source, tip]).ok;
}

function singleParent(commit: string): string {
  const [, parent, ...otherParents] = requireGitText(['rev-list', '--parents', '-n', '1', commit]).split(' ');
  if (!parent || otherParents.length) throw new Error(`${commit} 需要是有一个父提交的普通提交，请选具体功能提交。`);
  return parent;
}

function requireLocalSource(commit: string, localTip: string): string {
  if (!objectId.test(commit) || !isAncestor(commit, localTip)) {
    throw new Error(`${commit} 尚未合入本地 master。`);
  }
  return singleParent(commit);
}

function publicationTree(source: string, sourceParent: string, targetParent: string, resolved?: string): string {
  const result = runGitCommand(
    ['merge-tree', '--write-tree', '-z', '--name-only', '--no-messages', `--merge-base=${sourceParent}`, targetParent, source],
    { preserveStdout: true },
  );
  const [merged, ...paths] = result.stdout.split('\0').filter(Boolean);
  if ((!result.ok && result.status !== 1) || !merged || !objectId.test(merged)) {
    throw new Error(`无法重放 ${source}，请确认 Git 支持 merge-tree --merge-base。\n${result.stderr}`);
  }
  if (result.ok && !resolved) return merged;
  if (!resolved) {
    throw new Error(`${source} 与公开基线有冲突：${paths.join('、')}。解决冲突后用 ${source}=<解决后提交> 预览。`);
  }

  if (tree(singleParent(resolved)) !== tree(targetParent)) {
    throw new Error(`${resolved} 的父提交内容与本次公开基线不同，请更新解决结果。`);
  }
  const changes = requireGitText(['diff', '--no-renames', '--name-only', '-z', merged, resolved], { preserveStdout: true })
    .split('\0').filter(Boolean);
  const outsideConflict = changes.filter(path => !paths.includes(path));
  if (outsideConflict.length) {
    throw new Error(`解决结果改变了非冲突文件：${outsideConflict.join('、')}。`);
  }
  return tree(resolved);
}

function tree(commit: string): string {
  return requireGitText(['rev-parse', `${commit}^{tree}`]);
}

function hookPath(): string {
  const path = requireGitText(['rev-parse', '--path-format=absolute', '--git-path', 'hooks']);
  return join(path, 'pre-push');
}

function hookInstalled(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return readFileSync(path, 'utf8').startsWith(`#!/bin/sh\n${hookMarker}\n`);
  } catch {
    return false;
  }
}

function shellPath(path: string): string {
  return "'" + path.replaceAll('\\', '/').replaceAll("'", "'\"'\"'") + "'";
}

function install(apply: boolean): void {
  const commonDir = requireGitText(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const path = hookPath();
  if (path !== join(commonDir, 'hooks', 'pre-push')) {
    throw new Error('当前仓库配置了自定义 hooksPath，请保留现有配置并先检查如何接入。');
  }
  const script = fileURLToPath(import.meta.url);
  const body = `#!/bin/sh\n${hookMarker}\nexec ${shellPath(process.execPath)} ${shellPath(script)} hook "$@"\n`;
  if (!apply) {
    console.log(`安装目标 ${path}。加 --apply 安装。`);
    return;
  }
  try {
    writeFileSync(path, body, { flag: 'wx', mode: 0o755 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (readFileSync(path, 'utf8') !== body) {
      throw new Error('已有不同的 pre-push 检查，原文件已保留。');
    }
  }
  if (!hookInstalled(path)) throw new Error('pre-push 安装读回失败。');
  console.log(`推送前检查已安装 ${path}`);
}

function checkPush(remote: string, location: string, updates: string): void {
  const origin = runGitCommand(['remote', 'get-url', '--push', '--all', 'origin']);
  if (remote !== 'origin' && (!origin.ok || !origin.stdout.split('\n').includes(location))) return;

  for (const line of updates.split(/\r?\n/u).filter(Boolean)) {
    const [sourceRef, tip, ref, previous] = line.split(' ');
    if (ref !== master) continue;
    if (!tip || !previous || !objectId.test(tip) || !objectId.test(previous) || !isAncestor(previous, tip)) {
      throw new Error('公开 master 只接受基于当前远端提交的快进发布。');
    }

    const localTip = requireGitText(['rev-parse', '--verify', master]);
    if (sourceRef === master && tip === localTip) continue;
    const commits = requireGitText(['rev-list', '--reverse', `${previous}..${tip}`]).split('\n').filter(Boolean);
    let parent = previous;
    for (const commit of commits) {
      const message = requireGitText(['show', '-s', '--format=%B', commit]);
      const trailer = message.split('\n').at(-1) ?? '';
      if (!trailer.startsWith(sourceTrailer)) {
        throw new Error(`推送缺少 ${commit} 的本地来源。先合入本地 master，再用 bun run publish:github 选提交。`);
      }
      const [source, resolved, ...extra] = trailer.slice(sourceTrailer.length).split(' ');
      if (!source || (resolved && !objectId.test(resolved)) || extra.length) {
        throw new Error(`${commit} 的发布来源记录无效。`);
      }
      const sourceParent = requireLocalSource(source, localTip);
      if (singleParent(commit) !== parent || tree(commit) !== publicationTree(source, sourceParent, parent, resolved)) {
        throw new Error(`${commit} 与选中的本地提交 ${source} 内容不一致。`);
      }
      parent = commit;
    }
  }
}

function resolveCommit(id: string): string {
  if (!/^[a-f0-9]{7,64}$/iu.test(id)) throw new Error(`请传入提交编号：${id}`);
  return requireGitText(['rev-parse', '--verify', '--end-of-options', `${id}^{commit}`]);
}

function publish(selected: string[], apply: boolean): void {
  const localTip = requireGitText(['rev-parse', '--verify', master]);
  const sources = selected.map(selection => {
    const [id, resolution, ...extra] = selection.split('=');
    if (!id || resolution === '' || extra.length) throw new Error(`提交选择无效：${selection}`);
    const commit = resolveCommit(id);
    return { commit, parent: requireLocalSource(commit, localTip), resolved: resolution && resolveCommit(resolution) };
  });
  if (apply && !hookInstalled(hookPath())) {
    throw new Error('请先从主工作区运行 bun run publish:github -- install --apply。');
  }

  const fetchUrl = requireGitText(['remote', 'get-url', 'origin']);
  const pushUrl = requireGitText(['remote', 'get-url', '--push', '--all', 'origin']);
  if (fetchUrl !== pushUrl) throw new Error('origin 的拉取地址和推送目标需一致，才能确认发布基线。');
  requireGitText(['fetch', '--no-tags', '--no-write-fetch-head', 'origin', `+${master}:${remoteMaster}`]);
  const base = requireGitText(['rev-parse', '--verify', remoteMaster]);
  let tip = base;
  for (const { commit, parent, resolved } of sources) {
    const candidate = publicationTree(commit, parent, tip, resolved);
    if (candidate === tree(tip)) {
      console.log(`${commit} 的内容已在发布基线上。`);
      continue;
    }
    const message = requireGitText(['show', '-s', '--format=%B', commit]);
    const provenance = resolved ? `${commit} ${resolved}` : commit;
    tip = requireGitText(['commit-tree', candidate, '-p', tip, '-m', `${message}\n\n${sourceTrailer}${provenance}`]);
    console.log(`${commit} → ${tip}`);
  }

  if (tip === base) return;
  console.log(requireGitText(['diff', '--name-status', base, tip]));
  if (!apply) {
    console.log('发布预览。加 --apply 才推送。');
    return;
  }
  const pushed = runGitCommand(['push', '--no-follow-tags', 'origin', `${tip}:${master}`]);
  if (!pushed.ok) throw new Error(pushed.stderr || 'Git 推送失败。');
  const remote = requireGitText(['ls-remote', '--exit-code', 'origin', master]).split('\t')[0];
  if (remote !== tip) throw new Error('已推送，远端 master 的读回与本次发布提交不同，请检查。');
  console.log(`公开 master 已更新至 ${tip}`);
}

function main(args: string[]): void {
  const [action, remote, location] = args;
  if (action === 'hook' && remote && location && args.length === 3) {
    checkPush(remote, location, readFileSync(0, 'utf8'));
    return;
  }
  const apply = args.includes('--apply');
  const selected = args.filter(arg => arg !== '--apply');
  if (selected.length === 1 && selected[0] === 'install') {
    install(apply);
  } else if (selected.length && !selected.includes('--help')) {
    publish(selected, apply);
  } else {
    console.log('bun run publish:github -- install [--apply]\nbun run publish:github -- <提交编号>[=<解决后提交>]... [--apply]');
  }
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

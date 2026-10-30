import { afterEach, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const installer = resolve(import.meta.dir, 'install-worktree-init.py');
const helperSource = resolve(import.meta.dir, 'worktree_init.py');
const roots: string[] = [];
const template = ['foundry-mirror', 'foundry-next', 'foundry-production-readonly', 'foundry'].map(name =>
  `[mcp_servers.${name}]\ncommand = "fixture-unused"\nenabled = ${name === 'foundry'}\n`,
).join('\n');

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('mcp-worktree-init-test-')) throw new Error('Unsafe test cleanup');
    await rm(root, { recursive: true });
  }
});

// Bun 1.3.14's Windows sync loop can retain a stale clock after idle time.
// Async spawn keeps the same deadline without retrying the real command.
async function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeout = 15_000) {
  return await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, timeout });
    let stdout = '', stderr = '';
    child.stdin.end();
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    child.once('error', reject);
    child.once('close', (status, signal) => {
      if (signal) reject(new Error(`Fixture subprocess terminated (${signal}): ${command}`));
      else resolveResult({ status, stdout, stderr });
    });
  });
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'mcp-worktree-init-test-')); roots.push(root);
  const repo = join(root, 'primary checkout'); await mkdir(repo);
  const globalConfig = join(root, 'empty-git-config'); await writeFile(globalConfig, '');
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: globalConfig };
  const git = async (...args: string[]) => {
    const result = await run('git', args, repo, env);
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  await git('init', '--initial-branch=fixture');
  await git('config', 'user.name', 'Foundry fixture'); await git('config', 'user.email', 'fixture@example.invalid'); await git('config', 'commit.gpgsign', 'false');
  await writeFile(join(repo, '.gitignore'), '/.codex/\n/.worktreeinclude\n');
  await git('add', '.gitignore'); await git('commit', '-m', 'Fixture seed');
  await mkdir(join(repo, '.codex')); await writeFile(join(repo, '.codex/config.toml'), template);
  const hooks = join(repo, '.git/hooks');
  const install = (apply = false) => run(process.env.PYTHON ?? 'python', [installer, '--repo', repo, ...(apply ? ['--apply'] : [])], repo, env);
  return { root, repo, env, git, hooks, install };
}

test('default plan writes nothing; applied install initializes a real new worktree', async () => {
  const f = await fixture();
  const plan = await f.install(); expect(plan.status).toBe(0); expect(JSON.parse(plan.stdout).filesToWrite).toBe(2);
  expect(await Bun.file(join(f.hooks, 'post-checkout')).exists()).toBe(false);
  expect(await Bun.file(join(f.hooks, 'codex-foundry-mcp-worktree.py')).exists()).toBe(false);
  expect((await f.install(true)).status).toBe(0);
  const worktree = join(f.root, 'new worktree'); await f.git('worktree', 'add', '--detach', worktree, 'HEAD');
  expect(Bun.TOML.parse(await readFile(join(worktree, '.codex/config.toml'), 'utf8'))).toEqual(Bun.TOML.parse(template));
  expect(await readFile(join(worktree, '.worktreeinclude'), 'utf8')).toBe('.codex/config.toml\n');
  expect(await readFile(join(f.repo, '.codex/config.toml'), 'utf8')).toBe(template);
  const worktreePlan = await run(process.env.PYTHON ?? 'python', [installer, '--repo', worktree], worktree, f.env);
  expect(worktreePlan.status).toBe(0); expect(JSON.parse(worktreePlan.stdout).primaryCheckout).toBe(await realpath(f.repo));
  expect(JSON.parse((await f.install(true)).stdout).filesToWrite).toBe(0);
}, 20_000);

test('checkout preserves unrelated configuration and repeated checkout leaves exact bytes', async () => {
  const f = await fixture(); const worktree = join(f.root, 'existing worktree');
  await f.git('worktree', 'add', '--detach', worktree, 'HEAD');
  const config = join(worktree, '.codex/config.toml'); await mkdir(dirname(config));
  const unrelated = '[mcp_servers.fixture-other]\ncommand = "unused"\nenabled = false\n';
  await writeFile(config, unrelated); await writeFile(join(worktree, '.worktreeinclude'), 'keep-me.txt\n');
  expect((await f.install(true)).status).toBe(0);
  const checkout = () => run('git', ['checkout', '--detach', 'HEAD'], worktree, f.env);
  expect((await checkout()).status).toBe(0);
  const after = await readFile(config, 'utf8'); expect(after.startsWith(unrelated)).toBe(true);
  const parsed = Bun.TOML.parse(after) as any;
  expect(parsed.mcp_servers.foundry.enabled).toBe(true); expect(parsed.mcp_servers['fixture-other'].enabled).toBe(false);
  expect(parsed.mcp_servers['foundry-mirror'].enabled).toBe(false);
  const manifest = await readFile(join(worktree, '.worktreeinclude'), 'utf8');
  expect(manifest).toBe('keep-me.txt\n.codex/config.toml\n');
  expect((await checkout()).status).toBe(0);
  expect(await readFile(config, 'utf8')).toBe(after); expect(await readFile(join(worktree, '.worktreeinclude'), 'utf8')).toBe(manifest);
}, 20_000);

test('known existing launcher is updated to the installing Python interpreter', async () => {
  const f = await fixture();
  await writeFile(join(f.hooks, 'codex-foundry-mcp-worktree.py'), await readFile(helperSource));
  await writeFile(join(f.hooks, 'post-checkout'), '#!/bin/sh\n# Repository-local Foundry MCP initialization; does not change service state.\nhook_dir="$(git rev-parse --path-format=absolute --git-common-dir)/hooks"\nexec "C:/fixture/python.exe" -I -B "$hook_dir/codex-foundry-mcp-worktree.py" "$@"\n');
  const result = await f.install(true); expect(result.status).toBe(0); expect(JSON.parse(result.stdout).filesToWrite).toBe(1);
  expect(await readFile(join(f.hooks, 'post-checkout'), 'utf8')).not.toContain('C:/fixture/python.exe');
  await f.git('worktree', 'add', '--detach', join(f.root, 'new'), 'HEAD');
}, 20_000);

test.each(['post-checkout', 'codex-foundry-mcp-worktree.py'])('unknown existing %s is refused before any installation', async name => {
  const f = await fixture(); const unknown = '# fixture-owned custom hook\n';
  await writeFile(join(f.hooks, name), unknown);
  for (const apply of [false, true]) {
    const result = await f.install(apply); expect(result.status).toBe(1); expect(result.stderr).toContain('Existing hook differs');
  }
  expect(await readFile(join(f.hooks, name), 'utf8')).toBe(unknown);
  const other = name === 'post-checkout' ? 'codex-foundry-mcp-worktree.py' : 'post-checkout';
  expect(await Bun.file(join(f.hooks, other)).exists()).toBe(false);
}, 20_000);

test('existing conflicting Foundry entry is left unchanged by the actual hook', async () => {
  const f = await fixture(); const worktree = join(f.root, 'conflicting');
  await f.git('worktree', 'add', '--detach', worktree, 'HEAD');
  const config = join(worktree, '.codex/config.toml'); await mkdir(dirname(config));
  const existing = '[mcp_servers.foundry]\ncommand = "custom"\nenabled = true\n'; await writeFile(config, existing);
  expect((await f.install(true)).status).toBe(0);
  const result = await run('git', ['checkout', '--detach', 'HEAD'], worktree, f.env);
  expect(result.status).toBe(1); expect(result.stderr).toContain('Existing Foundry MCP entry differs');
  expect(await readFile(config, 'utf8')).toBe(existing);
  expect(await Bun.file(join(worktree, '.worktreeinclude')).exists()).toBe(false);
}, 20_000);

test('custom hooksPath is preserved and refused without creating default hooks', async () => {
  const f = await fixture(); const custom = join(f.root, 'custom hooks'); await mkdir(custom);
  await f.git('config', 'core.hooksPath', custom);
  const result = await f.install(true); expect(result.status).toBe(1); expect(result.stderr).toContain('custom hooksPath');
  expect(await Bun.file(join(f.hooks, 'post-checkout')).exists()).toBe(false);
  expect(await Bun.file(join(custom, 'post-checkout')).exists()).toBe(false);
}, 20_000);

test('fixture subprocess deadlines stay valid after the sync loop is idle and still terminate a hang', async () => {
  const warmup = spawnSync(process.execPath, ['-e', 'process.exit(0)'], { windowsHide: true });
  expect(warmup.status).toBe(0);
  await Bun.sleep(1600);
  const result = await run(process.execPath, ['-e', 'console.log("ready")'], process.cwd(), process.env, 1000);
  expect(result.status).toBe(0); expect(result.stdout.trim()).toBe('ready');
  await expect(run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], process.cwd(), process.env, 100)).rejects.toThrow('SIGTERM');
}, 5000);

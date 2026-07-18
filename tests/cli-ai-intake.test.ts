import { describe, expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildRatWarlockIr, RAT_WARLOCK_SOURCE } from '../src/core/intake/__tests__/fixtures/rat-warlock';

const SOURCE = resolve('src/core/intake/__tests__/fixtures/lurker-in-the-dark.raw.txt');

describe('AI monster intake CLI', () => {
  test('dry-run does not require AI configuration or write a run bundle', () => {
    const proc = Bun.spawnSync({
      cmd: ['bun', 'run', 'src/index.ts', '--intake-monsters', SOURCE, '--dry-run', '--fvtt-version', '14', '--effect-profile', 'core'],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
      env: withoutIntakeEnv(),
    });
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain('Status: dry_run');
    expect(proc.stdout.toString()).toContain('Estimated worst-case provider calls:');
    expect(proc.stderr.toString()).toBe('');
  });

  test('fails closed without dedicated provider configuration outside dry-run', () => {
    const proc = Bun.spawnSync({
      cmd: ['bun', 'run', 'src/index.ts', '--intake-monsters', SOURCE],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
      env: withoutIntakeEnv(),
    });
    expect(proc.exitCode).toBe(1);
    expect(proc.stderr.toString()).toContain('MONSTER_INTAKE_API_KEY');
    expect(proc.stderr.toString()).not.toContain('OPENAI_API_KEY');
  });

  test('reports accepted portable caster spells separately as pending target-world resolution', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = await request.json() as any;
        const system = String(body.messages?.[0]?.content ?? '');
        const content = system.includes('Find monster or NPC stat-block boundaries')
          ? { schemaVersion: 1, candidates: [{ id: 'rat-warlock', label: '鼠神邪术师', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE }] }
          : system.includes('Extract exactly one monster')
            ? buildRatWarlockIr()
            : { schemaVersion: 1, verdict: 'accepted', findings: [] };
        return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
      },
    });
    const root = mkdtempSync(join(tmpdir(), 'monster-intake-cli-'));
    mkdirSync(join(root, 'data'), { recursive: true });
    copyFileSync(resolve('data/cn.json'), join(root, 'data/cn.json'));
    copyFileSync(resolve('data/spells.ldb'), join(root, 'data/spells.ldb'));
    copyFileSync(resolve('data/golden-master.json'), join(root, 'data/golden-master.json'));
    try {
      const proc = Bun.spawn({
        cmd: [
          'bun', 'run', resolve('src/index.ts'),
          '--intake-monsters', resolve('src/core/intake/__tests__/fixtures/rat-warlock.raw.txt'),
          '--vault', join(root, 'vault'),
          '--fvtt-version', '14',
          '--effect-profile', 'core',
        ],
        cwd: root,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          MONSTER_INTAKE_API_KEY: 'test-key',
          MONSTER_INTAKE_BASE_URL: server.url.toString(),
          MONSTER_INTAKE_MODEL: 'test-model',
        },
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: expect.any(String), stderr: '' });
      expect(stdout).toContain('鼠神邪术师: accepted');
      expect(stdout).toContain('法术：已整理 10 项；目标世界解析待完成（需 FVTT v14 解析模块）');
      expect(stdout).not.toContain('法术：hydrated');
      const actorPath = stdout.match(/Actor JSON:\s*(.+\.json)\s*$/mu)?.[1]?.trim();
      expect(actorPath).toBeDefined();
      const actor = JSON.parse(readFileSync(actorPath!, 'utf-8'));
      expect(actor.flags['fvtt-json-generator-spell-resolver'].spellResolution.status).toBe('pending');
      expect(actor.items.some((item: any) => item.type === 'spell')).toBe(false);
      expect(actor.items.some((item: any) => Object.values(item.system?.activities ?? {}).some((activity: any) => (
        activity.type === 'cast'
        || activity.flags?.['fvtt-json-generator-spell-resolver']?.managed === true
      )))).toBe(false);
    } finally {
      server.stop(true);
    }
  }, 20_000);

  test('legacy raw ingestion fails when the rule-based splitter finds zero monsters', () => {
    const proc = Bun.spawnSync({
      cmd: ['bun', 'run', 'src/index.ts', '--ingest-plaintext', SOURCE, '--dry-run'],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
    });
    expect(proc.exitCode).toBe(1);
    expect(proc.stdout.toString()).toContain('Detected creatures: 0');
    expect(proc.stderr.toString()).toContain('[Legacy rule-based]');
    expect(proc.stderr.toString()).toContain('detected 0 monsters');
  });
});

function withoutIntakeEnv(): Record<string, string> {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  delete env.MONSTER_INTAKE_API_KEY;
  delete env.MONSTER_INTAKE_BASE_URL;
  delete env.MONSTER_INTAKE_MODEL;
  delete env.MONSTER_INTAKE_REVIEW_MODEL;
  return env;
}

import { describe, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveReferenceCacheRoot } from '../src/tools/referencePaths';
import {
  buildJewelOfThreePrayersIr,
  jewelCandidate,
  JEWEL_OF_THREE_PRAYERS_SOURCE,
} from '../src/core/intake/__tests__/fixtures/jewel-of-three-prayers';

const REFERENCE_CACHE_ROOT = resolveReferenceCacheRoot(process.cwd(), process.env);

describe('AI Item Intake CLI', () => {
  test('converts raw TXT through formal Markdown and accepted V14 Item JSON with a configured provider', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = await request.json() as any;
        const prompt = String(body.messages?.[0]?.content ?? '');
        const content = prompt.includes('Find every distinct Item boundary')
          ? { schemaVersion: 1, candidates: [jewelCandidate()] }
          : prompt.includes('Extract one candidate')
            ? buildJewelOfThreePrayersIr()
            : { schemaVersion: 1, verdict: 'accepted', findings: [] };
        return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
      },
    });
    const root = mkdtempSync(join(tmpdir(), 'fvtt-item-intake-cli-'));
    mkdirSync(join(root, 'data'), { recursive: true });
    for (const file of ['cn.json', 'spells.ldb', 'golden-master.json']) {
      copyFileSync(resolve('data', file), join(root, 'data', file));
    }
    try {
      const proc = Bun.spawn({
        cmd: [
          'bun', '--no-env-file', 'run', resolve('src/index.ts'),
          '--intake-items', resolve('src/core/intake/__tests__/fixtures/jewel-of-three-prayers.raw.txt'),
          '--vault', join(root, 'vault'),
          '--fvtt-version', '14',
          '--effect-profile', 'core',
        ],
        cwd: root,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...withoutIntakeEnv(),
          MONSTER_INTAKE_AUTH_MODE: 'api-key',
          MONSTER_INTAKE_API_KEY: 'test-key',
          MONSTER_INTAKE_BASE_URL: server.url.toString(),
          MONSTER_INTAKE_MODEL: 'test-model',
          FVTT_REFERENCE_CACHE_ROOT: REFERENCE_CACHE_ROOT,
        },
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      expect({ exitCode, stdout, stderr }).toEqual({
        exitCode: 0,
        stdout: expect.any(String),
        stderr: '',
      });
      expect(stdout).toContain('三祷之坠: accepted');
      const markdownPath = stdout.match(/Markdown:\s*(.+\.md)\s*$/mu)?.[1]?.trim();
      const itemPath = stdout.match(/Item JSON:\s*(.+\.json)\s*$/mu)?.[1]?.trim();
      expect(markdownPath).toBeDefined();
      expect(itemPath).toBeDefined();
      expect(existsSync(markdownPath!)).toBe(true);
      expect(existsSync(itemPath!)).toBe(true);
      const markdown = readFileSync(markdownPath!, 'utf-8');
      const item = JSON.parse(readFileSync(itemPath!, 'utf-8')) as any;
      expect(markdown).toContain('item-mechanics:');
      expect(item.system.uses.max).toBe('3');
      expect(item.effects.some((effect: any) => effect.transfer === false)).toBe(true);
      expect(Object.values(item.system.activities).some((activity: any) => activity.type === 'cast' && activity.consumption.spellSlot === false)).toBe(true);
      const bundle = stdout.match(/Review bundle:\s*(.+)\s*$/mu)?.[1]?.trim();
      expect(bundle).toBeDefined();
      expect(existsSync(join(bundle!, 'provider-audit.json'))).toBe(true);
    } finally {
      server.stop(true);
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  test('fails closed without shared provider configuration outside dry-run', () => {
    const proc = Bun.spawnSync({
      cmd: ['bun', '--no-env-file', 'run', 'src/index.ts', '--intake-items', resolve('src/core/intake/__tests__/fixtures/jewel-of-three-prayers.raw.txt'), '--fvtt-version', '14'],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', env: withoutIntakeEnv(),
    });
    expect(proc.exitCode).toBe(1);
    expect(proc.stderr.toString()).toContain('MONSTER_INTAKE_API_KEY');
  }, 30_000);

  test('dry-run is provider-free and enforces the V14/core boundary', () => {
    const proc = Bun.spawnSync({
      cmd: ['bun', '--no-env-file', 'run', 'src/index.ts', '--intake-items', resolve('src/core/intake/__tests__/fixtures/jewel-of-three-prayers.raw.txt'), '--dry-run', '--fvtt-version', '14', '--effect-profile', 'core'],
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', env: withoutIntakeEnv(),
    });
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain('Status: dry_run');
  });
});

function withoutIntakeEnv(): Record<string, string> {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  for (const key of [
    'MONSTER_INTAKE_API_KEY', 'MONSTER_INTAKE_BASE_URL', 'MONSTER_INTAKE_MODEL', 'MONSTER_INTAKE_REVIEW_MODEL',
    'MONSTER_INTAKE_AUTH_MODE', 'MONSTER_INTAKE_CODEX_OAUTH_BASE_URL', 'MONSTER_INTAKE_CODEX_OAUTH_BRIDGE_TOKEN',
  ]) delete env[key];
  return env;
}

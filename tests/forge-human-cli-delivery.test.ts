import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { generateEncounterFromHumanMarkdown } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import type { MonsterIntakeAiProvider } from '@fvtt-json-generator/intake-ai/types';
import { buildValidLurkerIr, LURKER_SOURCE } from '../src/core/intake/__tests__/fixtures/lurker';
import { runTestProcess } from './helpers/subprocess';

const worktree = resolve(import.meta.dir, '..');
const entry = resolve(worktree, 'tools/forge-encounter/run-human-intake.ts');
const forbidden = async (): Promise<never> => { throw Error('Offline fixture stage is unavailable'); };

async function savedReport(partial = false, sourceText?: string) {
  const source = partial ? `${LURKER_SOURCE}\n\n${LURKER_SOURCE}` : LURKER_SOURCE;
  const secondStart = LURKER_SOURCE.length + 2;
  const provider: MonsterIntakeAiProvider = {
    providerName: 'offline-fixture', extractionModel: 'saved-fixture', reviewModel: 'disabled',
    discover: async () => ({ schemaVersion: 1, candidates: partial ? [
      { id: 'one', label: 'First Lurker', start: 0, end: secondStart, quote: source.slice(0, secondStart) },
      { id: 'two', label: 'Pending Lurker', start: secondStart, end: source.length, quote: source.slice(secondStart) },
    ] : [{ id: 'one', label: 'Lurker', start: 0, end: source.length, quote: source }] }),
    extract: async request => {
      if (partial && request.source === LURKER_SOURCE) throw Error('The second creature has no saved AI reply');
      return buildValidLurkerIr();
    }, review: forbidden, repair: forbidden,
  };
  if (sourceText) provider.extractAnswer = async () => ({ kind: 'source-text', sourceText });
  const result = await generateEncounterFromHumanMarkdown({ source, label: 'CLI saved fixture', provider,
    automationProvider: { generate: forbidden, review: forbidden }, outputLanguage: 'source' });
  expect(result.report.actors.some(actor => actor.generation?.candidateAvailable)).toBe(true);
  return { source, report: result.report };
}

function isolatedEnv(root: string): Record<string, string> {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  for (const key of Object.keys(env)) if (key.startsWith('MONSTER_INTAKE_') || key.startsWith('DEEPSEEK_') || key === 'FVTT_LOCAL_DS_KEY_FILE') delete env[key];
  env.FVTT_LOCAL_DS_KEY_FILE = join(root, 'credential-file-must-not-be-read.json');
  return env;
}

async function runResume(root: string, source: string, report: unknown) {
  const sourcePath = join(root, 'source.md'), reportPath = join(root, 'saved-review.json'), output = join(root, 'output');
  writeFileSync(sourcePath, source); writeFileSync(reportPath, JSON.stringify(report));
  const networkGuard = join(root, 'deny-network.ts');
  writeFileSync(networkGuard, `globalThis.fetch = async () => { throw Error('UNEXPECTED_NETWORK_IN_SAVED_RESUME'); };`);
  const result = await runTestProcess({ cmd: [process.execPath, 'run', '--no-env-file', `--preload=${networkGuard}`, entry,
    sourcePath, output, '--resume-draft', reportPath], cwd: worktree, env: isolatedEnv(root) }, 30_000);
  const summaryLine = result.stdout.split(/\r?\n/u).reverse().find(line => {
    try { return Array.isArray(JSON.parse(line).actors); } catch { return false; }
  });
  if (!summaryLine) throw Error(JSON.stringify(result));
  return { ...result, summary: JSON.parse(summaryLine!), output, reportPath };
}

describe('human creature CLI saved Actor delivery', () => {
  test('resumes a complete saved report locally without a key or a credential-file read', async () => {
    const fixture = await savedReport();
    const root = mkdtempSync(join(tmpdir(), 'forge-human-cli-resume-'));
    const result = await runResume(root, fixture.source, fixture.report);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.summary.actors).toHaveLength(1);
    expect(result.summary.pendingRequests).toEqual([]);
    const original = fixture.report.actors[0]!.generation!.candidateResponse as any;
    expect(JSON.parse(readFileSync(result.summary.actors[0].actorPath, 'utf8'))).toEqual(original.result.artifact);
    expect(existsSync(join(result.output, 'encounter.forge-encounter.zip'))).toBe(true);
  }, 30_000);

  test('continues a saved canonical source without an IR, a key or another model reply', async () => {
    const fixture = await savedReport(false, renderMonsterIntakeMarkdown(buildValidLurkerIr()));
    const prior = structuredClone(fixture.report);
    delete prior.actors[0]!.generation;
    delete prior.actors[0]!.analysis.sourceText;
    expect(prior.actors[0]!.analysis.ir).toBeUndefined();
    expect(prior.actors[0]!.analysis.canonicalSource).toBeDefined();
    const root = mkdtempSync(join(tmpdir(), 'forge-human-cli-source-resume-'));
    const result = await runResume(root, fixture.source, prior);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.summary.pendingRequests).toEqual([]);
    const actor = JSON.parse(readFileSync(result.summary.actors[0].actorPath, 'utf8'));
    expect(actor.name).toContain('Lurker');
    expect(actor.items.some((item: any) => item.name.includes('Claw'))).toBe(true);
  }, 30_000);

  test('exports the saved Actor with its original snapshot despite changed metadata and a report larger than 32 MiB', async () => {
    const fixture = await savedReport();
    const root = mkdtempSync(join(tmpdir(), 'forge-human-cli-large-'));
    const prior = { ...fixture.report, sourceHash: '0'.repeat(64), padding: ' '.repeat(32 * 1024 * 1024) };
    const result = await runResume(root, 'Edited input must not replace the saved source', prior);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.summary.actors).toHaveLength(1);
    const original = fixture.report.actors[0]!.generation!.candidateResponse as any;
    expect(JSON.parse(readFileSync(result.summary.actors[0].actorPath, 'utf8'))).toEqual(original.result.artifact);
    const saved = JSON.parse(readFileSync(join(result.output, 'review.json'), 'utf8'));
    expect(saved.source).toBe(fixture.source);
    expect(saved.findings.join(' ')).toContain('原始来源快照');
    expect(saved.findings.join(' ')).toContain('来源指纹');
    expect(JSON.parse(readFileSync(result.reportPath, 'utf8')).sourceHash).toBe('0'.repeat(64));
  }, 30_000);

  test('keeps a delivered member and explicitly lists missing replies without spending on resumed extraction', async () => {
    const fixture = await savedReport(true);
    const root = mkdtempSync(join(tmpdir(), 'forge-human-cli-partial-'));
    const result = await runResume(root, fixture.source, fixture.report);
    expect([0, 2]).toContain(result.exitCode);
    expect(result.stderr).toBe('');
    expect(result.summary.actors).toHaveLength(1);
    expect(result.summary.pendingRequests).toContainEqual(expect.objectContaining({ key: 'actor-2', message: expect.stringContaining('待明确') }));
    expect(JSON.parse(readFileSync(result.summary.actors[0].actorPath, 'utf8')).items.length).toBeGreaterThan(0);
    expect(result.summary.findings.join(' ')).toContain('没有调用 AI');
  }, 30_000);

  test('fresh generation still uses the explicitly configured provider path with only an in-memory response', async () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-human-cli-fresh-'));
    const sourcePath = join(root, 'source.md'), output = join(root, 'output'), irPath = join(root, 'fixture-ir.json');
    writeFileSync(sourcePath, LURKER_SOURCE); writeFileSync(irPath, JSON.stringify(buildValidLurkerIr()));
    const stub = join(root, 'stub-provider.ts');
    writeFileSync(stub, `import {readFileSync} from 'node:fs';
      const ir = JSON.parse(readFileSync(${JSON.stringify(irPath)}, 'utf8'));
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init.body));
        const input = JSON.parse(body.messages.find(message => message.role === 'user').content);
        const reply = Array.isArray(input.sourceLines) ? {schemaVersion:1,candidates:[{id:'lurker',label:'Lurker',firstLineId:input.sourceLines[0].id,lastLineId:input.sourceLines.at(-1).id}]} : ir;
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(reply)}}]}), {headers:{'Content-Type':'application/json'}});
      };`);
    const env = { ...isolatedEnv(root), MONSTER_INTAKE_AUTH_MODE: 'api-key', MONSTER_INTAKE_API_KEY: 'offline-fixture-key',
      MONSTER_INTAKE_BASE_URL: 'https://offline.invalid/v1', MONSTER_INTAKE_MODEL: 'offline-fixture' };
    const result = await runTestProcess({ cmd: [process.execPath, 'run', '--no-env-file', `--preload=${stub}`, entry,
      sourcePath, output, '--configured-provider'], cwd: worktree, env }, 30_000);
    if (result.exitCode !== 0) throw Error(JSON.stringify(result));
    expect(result.stderr).toBe('');
    if (!existsSync(join(output, 'actor-1.json'))) throw Error(JSON.stringify(result));
    expect(JSON.parse(readFileSync(join(output, 'actor-1.json'), 'utf8')).items.length).toBeGreaterThan(0);
    expect(result.stdout).not.toContain('offline-fixture-key');
  }, 30_000);
});

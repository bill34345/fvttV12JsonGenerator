/** A bounded opt-in 12-call form trial, intentionally outside production generation. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { requestIntakeProvider } from '@fvtt-json-generator/intake-ai/transport';
import { parseStrictJson } from '@fvtt-json-generator/intake-ai/provider';
import { prepareCategoryMdExtraction } from '@fvtt-json-generator/intake-ai/category-md-extraction';
import { MeasuredHttp, safeReply } from './forge-category-md-real-ab-high';
import { makeBatches, decodeReply, prompt, type Unit } from './forge-template-batches';
import partition from '../fixtures/forge-category-md-angel-partition.json';

const sha = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
const load = (p: string) => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/u, ''));
const save = (p: string, value: unknown, exclusive = true) => writeFileSync(p, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: exclusive ? 'wx' : 'w' });
const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
function snapshot(root: string) {
  const state = execFileSync('git', ['-C', root, 'status', '--porcelain=v1', '-z', '-uall']).toString('utf8').split('\0').filter(Boolean);
  return { head: git(root, 'rev-parse', 'HEAD'), state, files: Object.fromEntries(state.map(v => [v.slice(3), sha(readFileSync(join(root, v.slice(3))))])) };
}
function treeHashes(root: string) {
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => {
    const p = join(e.parentPath, e.name); return [p, sha(readFileSync(p))];
  }));
}

async function main() {
  const root = process.cwd(), out = resolve('.local/forge-template-batch-trial-20261020');
  const baseline = 'f637f77f28c086e34297513e5293f98b3835f2e9';
  assert.equal(git(root, 'rev-parse', 'HEAD'), baseline);
  const old = resolve('.local/forge-ab-high-first-pass-20261019');
  const cases = ['S1','S2','S3'].map(id => {
    const source = readFileSync(join(old, id + '-A/source.md'), 'utf8');
    const request = { source, sourceSha256: sha(source), candidate: { id, label: id, start: 0, end: source.length, quote: source } };
    const baseFacts = load(join(old, id + '-A/base-facts.json'));
    const prepared = prepareCategoryMdExtraction(request, baseFacts, id === 'S3' ? partition.partition : undefined);
    const units: Unit[] = prepared.plan.features.map(u => ({ id: u.id, name: u.name!, section: u.section!, quote: u.quote }));
    return { id, source, baseFacts, baseContext: prepared.plan.base.quote, units, category: makeBatches(units, 'category'), whole: makeBatches(units, 'whole') };
  });
  assert.deepEqual(cases.map(c => c.units.length), [3,7,8]);
  assert.deepEqual(cases.map(c => c.category.length), [2,3,4]);
  const manifest = { baseline, model: 'deepseek-flash', reasoning_effort: 'high', thinking: { type: 'enabled' }, maximumHttp: 12,
    sourceBaseModelCalls: 0, retries: 0, repairCalls: 0, formalGeneration: 'NOT_EXECUTED_SEMANTIC_FORM_TRIAL',
    pricing: 'Frozen 2026-10-19 public pricing snapshot; estimate only, account deduction unknown',
    candidates: { BC: 'category', BW: 'whole' }, promptSha256: sha(prompt),
    inputs: cases.map(c => ({ id: c.id, sourceSha256: sha(c.source), units: c.units, baseFacts: c.baseFacts, baseContext: c.baseContext,
      categoryBatches: c.category, wholeBatches: c.whole })) };
  mkdirSync(out, { recursive: true });
  if (!process.argv.includes('--execute')) {
    save(join(out, 'dry-run.json'), manifest, false);
    console.log(JSON.stringify({ status: 'DRY_RUN_ZERO_NETWORK', totalPlannedHttp: 12, unitsPerArm: 18, whole: 3, category: 9 })); return;
  }
  if (existsSync(join(out, 'started.json'))) throw Error('TRIAL_ALREADY_STARTED_DO_NOT_REPEAT');
  let key: unknown = process.env.DEEPSEEK_API_KEY;
  if (!key && process.env.FVTT_LOCAL_DS_KEY_FILE) key = load(process.env.FVTT_LOCAL_DS_KEY_FILE);
  assert.ok(typeof key === 'string' && key.trim(), 'CREDENTIAL_UNAVAILABLE');
  const original = 'I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample';
  const before = snapshot(original);
  const frozen = { ...treeHashes(old), ...treeHashes(resolve('.local/forge-ab-first-pass-20261019')),
    ...Object.fromEntries(['tests/diagnostics/forge-template-batches.ts', 'tests/diagnostics/forge-template-batch-trial.ts',
      'tests/diagnostics/forge-category-md-real-ab-high.ts', 'tests/diagnostics/forge-category-md-real-ab.ts',
      'packages/intake-ai/src/category-md.ts','packages/intake-ai/src/category-md-extraction.ts','bun.lock'].map(p => [resolve(p), sha(readFileSync(p))])) };
  const checkFrozen = () => {
    assert.equal(git(root, 'rev-parse', 'HEAD'), baseline);
    for (const [p,h] of Object.entries(frozen)) assert.equal(sha(readFileSync(p)), h, 'Frozen evidence or implementation drift');
  };
  checkFrozen();
  save(join(out, 'intent.json'), manifest); save(join(out, 'frozen-before.json'), { original, before, frozen });
  save(join(out, 'started.json'), { at: new Date().toISOString(), maximumHttp: 12 });
  const stop = new AbortController();
  process.once('SIGINT', () => stop.abort()); process.once('SIGTERM', () => stop.abort());
  const meter = new MeasuredHttp(out, key, 12, fetch, checkFrozen);
  const results: any[] = [];
  for (const [caseId, arm] of [['S1','BC'],['S1','BW'],['S2','BW'],['S2','BC'],['S3','BC'],['S3','BW']] as const) {
    if (stop.signal.aborted || meter.fatal) break;
    const c = cases.find(c => c.id === caseId)!, batches = arm === 'BC' ? c.category : c.whole;
    const folder = join(out, `${caseId}-${arm}`); mkdirSync(folder);
    const start = performance.now(), rows: any[] = [], errors: any[] = [];
    for (const batch of batches) {
      if (stop.signal.aborted || meter.fatal) break;
      const user = { baseContext: c.baseContext, units: batch.units, sourceInventory: c.units, template: batch.template };
      save(join(folder, `input-${batch.id}.json`), user);
      try {
        const response = await requestIntakeProvider({ baseUrl: 'https://api.deepseek.com', apiKey: key, model: 'deepseek-flash',
          protocol: 'openai-chat', authScheme: 'bearer', reasoning: 'high', structuredOutput: { mode: 'json_object' },
          systemPrompt: prompt, userContent: JSON.stringify(user), signal: AbortSignal.any([stop.signal, AbortSignal.timeout(600_000)]),
          httpClient: (url, init) => meter.send(url, init, { case: caseId, arm: arm as any, unit: batch.id, unitIds: batch.units.map(u => u.id), promptVersion: 'simple-form-v1' }),
        });
        const decoded = decodeReply(parseStrictJson(response.content), batch);
        writeFileSync(join(folder, `reply-${batch.id}.yaml`), decoded.markdown, { encoding: 'utf8', flag: 'wx' });
        rows.push(...decoded.rows);
        save(join(folder, `decoded-${batch.id}.json`), decoded.rows);
      } catch (error: any) {
        errors.push({ batch: batch.id, units: batch.units.map(u => u.id), error: safeReply({ name: error?.name, message: String(error?.message ?? error) }, key) });
      }
    }
    const calls = meter.records.filter(r => r.case === caseId && r.arm === arm);
    const result = { case: caseId, arm, status: errors.length || rows.length !== c.units.length ? 'FORMAT_OR_TRANSPORT_FAILED' : 'FORM_PARSED_PENDING_SOURCE_REVIEW',
      wallMs: performance.now() - start, calls: calls.length, httpWaitMs: calls.reduce((s,r) => s + r.httpWaitMs, 0),
      estimatedUSDLow: calls.reduce((s,r) => s + (r.cost?.usdLow ?? 0), 0), estimatedUSDHigh: calls.reduce((s,r) => s + (r.cost?.usdHigh ?? 0), 0),
      rows, errors, usage: calls.map(r => r.usage) };
    save(join(folder, 'result.json'), result); results.push(result); save(join(out, 'first-results.json'), results, false);
    console.log(JSON.stringify({ event: 'form-arm-finished', case: caseId, arm, calls: calls.length, rows: rows.length, errors: errors.map(e => e.error.message), ms: Math.round(result.wallMs) }));
  }
  checkFrozen(); const after = snapshot(original); save(join(out, 'original-after.json'), after); assert.deepEqual(after, before);
  save(join(out, 'run-summary.json'), { status: 'FINISHED_PENDING_SOURCE_REVIEW', originalUnchanged: true, frozenUnchanged: true, http: meter.records.length, results });
  save(join(out, 'first-evidence-freeze.json'), treeHashes(out));
  console.log(JSON.stringify({ status: 'FINISHED_PENDING_SOURCE_REVIEW', http: meter.records.length, originalUnchanged: true }));
}
if (import.meta.main) main().catch(error => { console.error(JSON.stringify({ status: 'STOPPED_NO_RETRY', code: /^[A-Z_]+$/u.test(error?.message ?? '') ? error.message : 'HARNESS_ERROR' })); process.exitCode = 1; });

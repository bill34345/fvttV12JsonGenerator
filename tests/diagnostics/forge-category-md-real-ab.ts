/** Opt-in first pass only. Default is offline preflight; --execute spends requests. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { OpenAICompatibleMonsterIntakeProvider, parseStrictJson } from '@fvtt-json-generator/intake-ai/provider';
import { requestIntakeProvider } from '@fvtt-json-generator/intake-ai/transport';
import type { HttpClient, HttpRequest, HttpResponse } from '@fvtt-json-generator/intake-ai/http';
import { prepareCategoryMdExtraction, runCategoryMdMonsterExtraction } from '@fvtt-json-generator/intake-ai/category-md-extraction';
import { anchorIrEvidence } from '@fvtt-json-generator/intake-ai/orchestrator';
import { validateMonsterIntakeIR } from '@fvtt-json-generator/intake-ai/validator';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';
import { buildActorVerificationSummaryFromValues } from '../../src/core/verification/actorVerification';
import partition from '../fixtures/forge-category-md-angel-partition.json';

const BASELINE = 'f637f77f28c086e34297513e5293f98b3835f2e9';
const MODEL = 'deepseek-flash', BASE_URL = 'https://api.deepseek.com', TIMEOUT = 600_000;
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, ''));
const save = (path: string, value: unknown, exclusive = false) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: exclusive ? 'wx' : 'w' });
const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function safeReply(value: unknown, key: string): unknown {
  if (typeof value === 'string') return (key ? value.replaceAll(key, '[REDACTED]') : value)
    .replace(/<(think|analysis|reasoning)\b[^>]*>[\s\S]*?<\/\1>/giu, '[REASONING_OMITTED]');
  if (Array.isArray(value)) return value.map(entry => safeReply(entry, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['reasoning_content', 'reasoning', 'analysis'].includes(key)).map(([name, entry]) => [name, safeReply(entry, key)]));
  return value;
}

/** Public-list USD estimate. No claim about account credits or invoice charges. */
export function estimatedCost(usage: any, startedAt: string) {
  if (!usage || !Number.isFinite(usage.prompt_tokens) || !Number.isFinite(usage.completion_tokens)) return { status: 'UNKNOWN', usd: null };
  const date = new Date(startedAt), h = date.getUTCHours(), weekday = date.getUTCDay() >= 1 && date.getUTCDay() <= 5;
  // Outside these windows always off-peak, including holidays. Inside a weekday
  // window holiday status is not guessed: retain a price interval instead.
  const possiblePeak = weekday && (h >= 1 && h < 4 || h >= 6 && h < 10);
  const prompt = usage.prompt_tokens, output = usage.completion_tokens;
  let hit = usage.prompt_cache_hit_tokens, miss = usage.prompt_cache_miss_tokens;
  if (Number.isFinite(hit) && !Number.isFinite(miss)) miss = prompt - hit;
  if (Number.isFinite(miss) && !Number.isFinite(hit)) hit = prompt - miss;
  const split = Number.isFinite(hit) && Number.isFinite(miss) && hit >= 0 && miss >= 0 && hit + miss === prompt;
  const low = ((split ? hit * .003 + miss * .15 : prompt * .003) + output * .6) / 1e6;
  const high = ((split ? hit * .003 + miss * .15 : prompt * .15) + output * .6) / 1e6 * (possiblePeak ? 2 : 1);
  return { status: low === high ? 'ESTIMATED_PUBLIC_LIST_PRICE' : 'ESTIMATED_RANGE', usd: low === high ? low : null,
    usdLow: low, usdHigh: high, rateWindow: possiblePeak ? 'WEEKDAY_PEAK_WINDOW_HOLIDAY_UNVERIFIED' : 'OFF_PEAK', cacheSplitKnown: split };
}

export type RequestContext = { case: string; arm: 'A' | 'B'; unit: string; unitIds: string[]; promptVersion: string };
export class MeasuredHttp {
  records: any[] = [];
  fatal: string | undefined;
  private identities = new Set<string>();
  private actualModels = new Set<string>();
  constructor(readonly root: string, private key: string, private maximum: number,
    private fetcher: typeof fetch = fetch, private checkFrozen: () => void = () => {}) {
    mkdirSync(join(root, 'requests'), { recursive: true });
  }
  async send(url: string, init: HttpRequest, context: RequestContext): Promise<HttpResponse> {
    this.checkFrozen();
    if (this.fatal) throw Error(this.fatal);
    if (this.records.length >= this.maximum) throw Error('HTTP_BUDGET_EXHAUSTED');
    const identity = `${context.case}/${context.arm}/${context.unit}`;
    if (this.identities.has(identity)) throw Error('REPEATED_REQUEST_FORBIDDEN');
    this.identities.add(identity);
    const index = this.records.length + 1, folder = join(this.root, 'requests', String(index).padStart(3, '0'));
    mkdirSync(folder);
    const body = JSON.parse(init.body);
    assert.equal(body.model, MODEL); assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.temperature, 0); assert.equal(body.response_format?.type, 'json_object');
    save(join(folder, 'request-body.json'), safeReply(body, this.key), true);
    const record: any = { index, ...context, attempt: 1, startedAt: new Date().toISOString(), startedAtMs: Date.now(),
      requestBodySha256: sha(init.body), status: 'SENDING' };
    this.records.push(record); save(join(this.root, 'http-requests.json'), this.records);
    console.log(JSON.stringify({ event: 'http-start', index, case: context.case, arm: context.arm, unit: context.unit }));
    const start = performance.now();
    try {
      const response = await this.fetcher(url, { ...init, redirect: 'error' });
      record.headersAt = new Date().toISOString(); record.httpStatus = response.status;
      const raw = await response.text(); record.responseCompletedAt = new Date().toISOString(); record.responseBytes = Buffer.byteLength(raw);
      record.httpWaitMs = performance.now() - start; record.responseSha256 = sha(raw);
      let envelope: any;
      try { envelope = JSON.parse(raw); }
      catch {
        // Invalid envelope evidence is safe text without credentials/reasoning.
        const safe = String(safeReply(raw, this.key)).replace(/"reasoning_content"\s*:\s*"(?:\\.|[^"\\])*"/gu, '"reasoning_content":"[OMITTED]"')
          .replace(/"reasoning_content"\s*:\s*"[\s\S]*$/u, '"reasoning_content":"[OMITTED_INCOMPLETE]"');
        writeFileSync(join(folder, 'invalid-envelope.txt'), safe, { flag: 'wx' }); throw Error('INVALID_PROVIDER_ENVELOPE');
      }
      save(join(folder, 'response-envelope.json'), safeReply(envelope, this.key), true);
      const content = envelope.choices?.[0]?.message?.content;
      if (typeof content === 'string') writeFileSync(join(folder, 'reply.txt'), String(safeReply(content, this.key)), { encoding: 'utf8', flag: 'wx' });
      record.model = envelope.model ?? null; record.finishReason = envelope.choices?.[0]?.finish_reason ?? null;
      record.usage = envelope.usage ?? null; record.cost = estimatedCost(record.usage, record.startedAt);
      if (typeof envelope.model === 'string') this.actualModels.add(envelope.model);
      if (this.actualModels.size > 1) { this.fatal = 'ACTUAL_MODEL_IDENTITY_CHANGED'; throw Error(this.fatal); }
      record.status = response.ok ? 'RESPONSE_RECEIVED' : 'HTTP_ERROR';
      return { ok: response.ok, status: response.status, json: async () => envelope };
    } catch (error: any) {
      record.status = 'FAILED'; record.error = safeReply({ name: error?.name ?? 'Error', code: error?.code ?? null, message: String(error?.message ?? error) }, this.key);
      throw error;
    } finally {
      record.httpWaitMs ??= performance.now() - start; record.completedAt = new Date().toISOString();
      save(join(folder, 'audit.json'), record, true); save(join(this.root, 'http-requests.json'), this.records);
      console.log(JSON.stringify({ event: 'http-end', index, case: context.case, arm: context.arm, status: record.status, ms: Math.round(record.httpWaitMs) }));
    }
  }
}

const inputs = [
  { id: 'S1', name: 'Giant Boar', count: 3, categories: 2,
    source: '.local/forge-staged-manual-20261013/v4-srd-source/Giant-Boar-source.txt', sourceHash: '5469c971d591c04da7a1e8f6e566708de9cb28d3bb527dc56bc64da66dafa7b0',
    base: '.local/forge-staged-manual-20261013/fresh-srd-v4/v4-srd-control-1/latest-report.json', baseHash: 'bc75f71be13747ca72bae10ec243613f8336a4f62feda500f740dc4d8350186e' },
  { id: 'S2', name: 'Mezzoloth Company', count: 7, categories: 3,
    source: '.local/forge-mezzoloth-company-20261017/source/Mezzoloth-Company-layout-v2.md', sourceHash: '4468a368378447825b92b44f583ab7acb631f79fcae17ababa77abc374f07761',
    base: '.local/forge-mezzoloth-company-20261017/normal-deepseek-run-3/intake-ir.json', baseHash: 'b309cbaff8597ab42991c8ece7fa18ad50a68acdfa3d56c8cecc775bdc417fd4' },
  { id: 'S3', name: 'Angel of Obsession', count: 8, categories: 4,
    source: '.local/forge-common-contract-repair-20261017/unseen-chm-1/source.md', sourceHash: 'afc142b63f09c2ba0fcd52525bd4bbae3a909dc5305d16a56db7bc86a89441e2',
    base: '.local/forge-common-contract-repair-20261017/normal-run-8/actor-1-intake-ir.json', baseHash: 'b376905b903b88c67ec177b60d90b29ed7a981381242e41903021a37d4d72451' },
];
const protectedSources = ['packages/intake-ai/src/category-md.ts', 'packages/intake-ai/src/category-md-extraction.ts',
  'tests/fixtures/forge-category-md-angel-partition.json', 'tests/diagnostics/forge-category-md-real-ab.ts',
  'packages/intake-ai/package.json', 'bun.lock'];

function snapshotOriginal(root: string) {
  const status = execFileSync('git', ['-C', root, 'status', '--porcelain=v1', '-z', '-uall']).toString('utf8').split('\0').filter(Boolean);
  return { root, head: git(root, 'rev-parse', 'HEAD'), status,
    dirtyFiles: Object.fromEntries(status.map(entry => [entry.slice(3), sha(readFileSync(join(root, entry.slice(3))))])) };
}
function requestFor(source: string, id: string) { return { source, sourceSha256: sha(source), candidate: { id, label: id, start: 0, end: source.length, quote: source } }; }

async function main() {
  const execute = process.argv.includes('--execute'), root = process.cwd();
  assert.equal(git(root, 'rev-parse', 'HEAD'), BASELINE);
  const original = 'I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample';
  const output = resolve('.local/forge-ab-first-pass-20261019');
  if (existsSync(join(output, 'started.json'))) throw Error('FIRST_PASS_ALREADY_STARTED_DO_NOT_RERUN');
  mkdirSync(output, { recursive: true });
  const before = snapshotOriginal(original), hashes = Object.fromEntries(protectedSources.map(file => [file, sha(readFileSync(join(root, file)))]));
  const checkFrozen = () => {
    assert.equal(git(root, 'rev-parse', 'HEAD'), BASELINE);
    assert.deepEqual(git(root, 'diff', '--name-only', 'HEAD').split('\n').filter(Boolean).sort(), ['package.json', 'packages/intake-ai/package.json']);
    for (const [file, hash] of Object.entries(hashes)) assert.equal(sha(readFileSync(join(root, file))), hash, 'Candidate drift: ' + file);
  };
  checkFrozen();
  const prepared = inputs.map(input => {
    const sourceBytes = readFileSync(join(original, input.source)), baseBytes = readFileSync(join(original, input.base));
    assert.equal(sha(sourceBytes), input.sourceHash); assert.equal(sha(baseBytes), input.baseHash);
    const source = sourceBytes.toString('utf8'), stored = JSON.parse(baseBytes.toString('utf8'));
    const creature = input.id === 'S1' ? stored.actors[0].analysis.ir.creature : stored.creature;
    const baseFacts = { schemaVersion: 1, creature: Object.fromEntries(['identity', 'abilities', 'attributes', 'saves', 'skills', 'defenses', 'senses', 'languages'].map(key => [key, structuredClone(creature[key])])), uncertainties: [] };
    const request = requestFor(source, input.id), linePartition = input.id === 'S3' ? partition.partition : undefined;
    const plan = prepareCategoryMdExtraction(request, baseFacts, linePartition);
    assert.equal(plan.plan.features.length, input.count); assert.equal(plan.batches.length, input.categories);
    return { ...input, source, request, baseFacts, linePartition, ...plan };
  });
  let key: unknown = process.env.DEEPSEEK_API_KEY;
  if (!key && process.env.FVTT_LOCAL_DS_KEY_FILE) key = json(process.env.FVTT_LOCAL_DS_KEY_FILE);
  assert.ok(typeof key === 'string' && key.trim(), 'Existing DeepSeek credential is unavailable');
  const order = [['S1', 'A'], ['S1', 'B'], ['S2', 'B'], ['S2', 'A'], ['S3', 'A'], ['S3', 'B']] as const;
  const intent = { baseline: BASELINE, worktree: root, model: MODEL, protocol: 'openai-chat', reasoning: 'low', structuredOutput: 'json_object',
    temperature: 0, requestTimeoutMs: TIMEOUT, maximumHttp: 27, retries: 0, repairCalls: 0, order, sourceBaseModelCalls: 0,
    sources: prepared.map(c => ({ id: c.id, name: c.name, sourceSha256: c.sourceHash, baseFileSha256: c.baseHash,
      baseFactsSha256: sha(JSON.stringify(c.baseFacts)), commonValidatedBase: c.base.creature, features: c.plan.features.map(unit => ({ id: unit.id, name: unit.name, section: unit.section })),
      categories: c.batches.map(batch => ({ category: batch.category, units: batch.units.map(unit => unit.id), promptHash: sha(batch.prompt), templateHash: sha(batch.template) })),
      reusedSourcePartition: !!c.linePartition })), sourceHashes: hashes,
    costSource: 'https://api-docs.deepseek.com/quick_start/pricing/', billingScope: 'public list USD estimate; actual invoice unknown' };
  if (existsSync(join(output, 'intent.json'))) assert.deepEqual(json(join(output, 'intent.json')), intent, 'Dry-run candidate changed');
  else save(join(output, 'intent.json'), intent, true);
  if (!execute) { console.log(JSON.stringify({ status: 'DRY_RUN_PASS_ZERO_HTTP', sourceCount: 3, parentFeatures: 18, categories: 9, maximumHttp: 27, credentialPresent: true })); return; }
  save(join(output, 'started.json'), { at: new Date().toISOString(), authorization: 'One real first-pass A/B, no retries or repairs', intentSha256: sha(readFileSync(join(output, 'intent.json'))) }, true);
  save(join(output, 'original-worktree-before.json'), before, true);
  const recorder = new MeasuredHttp(output, key as string, 27, fetch, checkFrozen), results: any[] = [];
  const cancellation = new AbortController(); process.once('SIGINT', () => cancellation.abort());
  for (const [caseId, arm] of order) {
    if (recorder.fatal || cancellation.signal.aborted) break;
    checkFrozen();
    const c = prepared.find(c => c.id === caseId)!, folder = join(output, `${caseId}-${arm}`); mkdirSync(folder);
    writeFileSync(join(folder, 'source.md'), c.source); save(join(folder, 'base-facts.json'), c.baseFacts);
    const replayed: string[] = [], stageEvents: unknown[] = [], first = recorder.records.length;
    let ir: any, markdown: string | undefined, actor: any, phase = 'extraction', extractionWallMs = 0, formalMs = 0, formalStarted: number | undefined;
    const started = performance.now(), startedAt = new Date().toISOString();
    console.log(JSON.stringify({ event: 'arm-start', case: caseId, arm }));
    const result: any = { case: caseId, name: c.name, arm, status: 'FAILED', stage: phase, startedAt };
    try {
      if (arm === 'A') {
        const client: HttpClient = async (url, init) => {
          const body = JSON.parse(init.body), payload = JSON.parse(body.messages.find((message: any) => message.role === 'user').content);
          if (!payload.unitId) {
            const stage = payload.lines ? 'source' : 'base';
            assert.ok(stage === 'source' ? !!c.linePartition : Object.keys(payload).length === 1 && typeof payload.source === 'string');
            replayed.push(stage);
            return { ok: true, status: 200, json: async () => ({ model: MODEL, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(stage === 'source' ? c.linePartition : c.baseFacts) } }] }) };
          }
          const event: any = stageEvents.at(-1);
          return recorder.send(url, init, { case: caseId, arm, unit: String(payload.unitId), unitIds: [String(payload.unitId)], promptVersion: event?.promptVersion ?? 'A-existing-feature-prompt' });
        };
        const provider = new OpenAICompatibleMonsterIntakeProvider({ authMode: 'api-key', apiKey: key as string, baseUrl: BASE_URL,
          model: MODEL, reviewModel: MODEL, timeoutMs: TIMEOUT, repairTimeoutMs: TIMEOUT, maxAttempts: 1,
          evidenceAnchoring: 'exact-quotes', signal: cancellation.signal, httpClient: client,
          transport: { protocol: 'openai-chat', authScheme: 'bearer', reasoning: 'low', structuredOutput: { mode: 'json_object' } },
          stagedExtraction: { baseMode: 'facts', featureMode: 'auto', onStage: metadata => { stageEvents.push({ ...metadata, at: new Date().toISOString() }); } },
        });
        ir = await provider.extract(c.request);
      } else {
        const extracted = await runCategoryMdMonsterExtraction({ request: c.request, baseFacts: c.baseFacts, linePartition: c.linePartition,
          signal: cancellation.signal, call: async batch => {
            save(join(folder, `request-${batch.category}.json`), batch, true);
            const response = await requestIntakeProvider({ baseUrl: BASE_URL, apiKey: key as string, model: MODEL,
              protocol: 'openai-chat', authScheme: 'bearer', reasoning: 'low', structuredOutput: { mode: 'json_object' },
              systemPrompt: batch.prompt, userContent: JSON.stringify({ schemaVersion: 1, category: batch.category,
                baseContext: batch.baseContext, units: batch.units, sourceInventory: batch.sourceInventory, template: batch.template }),
              signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(TIMEOUT)]),
              httpClient: (url, init) => recorder.send(url, init, { case: caseId, arm, unit: batch.category,
                unitIds: batch.units.map(unit => unit.id), promptVersion: batch.promptVersion }),
            });
            const parsed: any = parseStrictJson(response.content);
            save(join(folder, `reply-${batch.category}.json`), safeReply(parsed, key as string), true);
            if (typeof parsed.markdown === 'string') writeFileSync(join(folder, `reply-${batch.category}.md`), String(safeReply(parsed.markdown, key as string)), { encoding: 'utf8', flag: 'wx' });
            return parsed;
          } });
        ir = extracted.ir;
      }
      extractionWallMs = performance.now() - started; phase = 'validation';
      const formalStart = performance.now(); formalStarted = formalStart;
      ir = anchorIrEvidence(c.source, c.request.candidate, ir); save(join(folder, 'ir.json'), ir, true);
      const validation = validateMonsterIntakeIR(c.source, ir, { coverageRange: c.request.candidate });
      save(join(folder, 'validation.json'), validation, true);
      if (validation.blocking.length) { result.findings = validation.blocking; throw Error('COMMON_SOURCE_VALIDATION_BLOCKED'); }
      phase = 'generation'; markdown = renderMonsterIntakeMarkdown(ir); writeFileSync(join(folder, 'rendered.md'), markdown, { encoding: 'utf8', flag: 'wx' });
      const conversion = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core', iconOptions: { mode: 'off' }, translationService: null });
      actor = conversion.rawJson; save(join(folder, 'actor.json'), actor, true);
      phase = 'verification'; const intake = verifyMonsterIntake(c.source, ir, markdown, actor, c.request.candidate);
      const actorCheck = buildActorVerificationSummaryFromValues({ source: markdown, actor, sourcePath: join(folder, 'rendered.md'), actorPath: join(folder, 'actor.json') });
      save(join(folder, 'verify-intake.json'), intake, true); save(join(folder, 'verify-actor.json'), actorCheck, true);
      result.findings = intake.findings.filter(finding => finding.blocking); result.actorWarnings = actorCheck.warnings;
      result.actorSourceIntegrityErrors = actorCheck.sourceIntegrityErrors;
      formalMs = performance.now() - formalStart;
      if (result.findings.length || actorCheck.warnings.length || actorCheck.sourceIntegrityErrors.length) throw Error('COMMON_FORMAL_VERIFICATION_BLOCKED');
      result.status = 'PASS_MACHINE_GATES_PENDING_SOURCE_REVIEW'; result.stage = 'complete';
    } catch (error: any) {
      if (!extractionWallMs) extractionWallMs = performance.now() - started;
      result.stage = phase; result.error = safeReply({ name: error?.name, code: error?.code, message: String(error?.message ?? error), stagedDiagnostic: error?.stagedDiagnostic, details: error?.details }, key as string);
    }
    if (formalStarted !== undefined) formalMs = performance.now() - formalStarted;
    const calls = recorder.records.slice(first), waitMs = calls.reduce((total, row) => total + row.httpWaitMs, 0);
    Object.assign(result, { completedAt: new Date().toISOString(), extractionWallMs, httpWaitMs: waitMs,
      localExtractionRemainderMs: Math.max(0, extractionWallMs - waitMs), formalMs, actualHttp: calls.length,
      requestIndices: calls.map(row => row.index), replayed, parentFeatures: c.plan.features.map(unit => ({ id: unit.id, name: unit.name, section: unit.section,
        requestReceived: calls.some(row => row.unitIds.includes(unit.id)), completeCandidateProduced: result.status.startsWith('PASS') })),
      laterCallsAfterFailure: 0, repairCalls: 0, retries: 0 });
    save(join(folder, 'stage-events.json'), stageEvents, true); save(join(folder, 'result.json'), result, true);
    results.push(result); save(join(output, 'first-results.json'), results);
    console.log(JSON.stringify({ event: 'arm-end', case: caseId, arm, status: result.status, http: calls.length, extractionMs: Math.round(extractionWallMs), error: result.error?.stagedDiagnostic ?? result.error?.code }));
  }
  checkFrozen(); const after = snapshotOriginal(original); save(join(output, 'original-worktree-after.json'), after, true);
  assert.deepEqual(after, before, 'Original worktree changed');
  const costs = recorder.records.map(record => record.cost);
  save(join(output, 'run-summary.json'), { status: 'FIRST_PASS_FINISHED_PENDING_SOURCE_REVIEW', completedAt: new Date().toISOString(),
    baseline: BASELINE, resultCount: results.length, actualHttp: recorder.records.length, maximumHttp: 27, retries: 0, repairCalls: 0,
    fatal: recorder.fatal ?? null, cancelled: cancellation.signal.aborted, originalWorktreeUnchanged: true,
    responseModels: [...new Set(recorder.records.map(record => record.model))],
    cost: costs.every(cost => cost?.usd !== null && cost?.usd !== undefined) ? { status: 'ESTIMATED_PUBLIC_LIST_PRICE', usd: costs.reduce((total, cost) => total + cost.usd, 0) } : { status: 'UNKNOWN_OR_RANGE', usd: null },
    results }, true);
  console.log(JSON.stringify({ event: 'run-finished', results: results.length, actualHttp: recorder.records.length, originalUnchanged: true }));
}
if (import.meta.main) main().catch(error => {
  // Never dump arbitrary error objects, headers, URL or credentials to stdout.
  const code = /^[A-Z][A-Z0-9_]+$/u.test(String(error?.message)) ? error.message : 'PREFLIGHT_OR_HARNESS_ERROR';
  console.error(JSON.stringify({ status: 'STOPPED_NO_AUTOMATIC_RETRY', name: error?.name ?? 'Error', code }));
  process.exitCode = 1;
});

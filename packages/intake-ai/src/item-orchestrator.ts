import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  convertMarkdownContentToJson as defaultConvertMarkdownContentToJson,
  type ConversionResult,
  type ConvertMarkdownContentOptions,
} from '@fvtt-json-generator/workflows/single-file-conversion';
import {
  resolveLockedDnd5eV14Spell,
  resolveLockedDnd5eV14SpellActivation,
} from '@fvtt-json-generator/generation/v14-spell-catalog';
import { renderItemIntakeMarkdown } from './item-renderer';
import type {
  ItemAiReviewResult,
  ItemDiscoveryCandidate,
  ItemIntakeAiProvider,
  ItemIntakeDecisionsFile,
  ItemIntakeFinding,
  ItemIntakeIR,
  ItemIntakeOptions,
  ItemIntakeResultEntry,
  ItemIntakeRunResult,
} from './item-types';
import {
  itemCandidateBoundaryIssue,
  normalizeItemCandidates,
  normalizeItemIntakeIR,
} from './item-core';
import { validateItemIntakeIR } from './item-validator';

const NODE_ITEM_CORE_RESOLVER = {
  resolveSpell: resolveLockedDnd5eV14Spell,
  resolveActivation: resolveLockedDnd5eV14SpellActivation,
};

export const ITEM_INTAKE_LIMITS = {
  maxSourceLength: 200_000,
  maxItems: 50,
} as const;

export interface ItemIntakeDependencies {
  convertMarkdownContentToJson(options: ConvertMarkdownContentOptions): Promise<ConversionResult>;
}

const defaultDependencies: ItemIntakeDependencies = Object.freeze({
  convertMarkdownContentToJson: defaultConvertMarkdownContentToJson,
});

interface ItemRunManifest {
  schemaVersion: 1;
  runId: string;
  sourceName: string;
  sourceSha256: string;
  sourceLength: number;
  fvttVersion: '14';
  effectProfile: 'core';
  status: ItemIntakeRunResult['status'];
  createdAt: string;
  completedAt?: string;
  items: ItemIntakeResultEntry[];
}

/**
 * Formal Item Intake.  Raw text is never promoted directly: it must pass
 * source evidence validation, native Item projection verification, and one
 * bounded AI review before its Markdown/JSON can enter the vault.
 */
export async function runItemIntake(
  options: ItemIntakeOptions,
  provider?: ItemIntakeAiProvider,
  dependencies: ItemIntakeDependencies = defaultDependencies,
): Promise<ItemIntakeRunResult> {
  validateOptions(options);
  const sourceSha256 = sha256(options.source);
  if (options.dryRun) {
    return {
      runId: 'dry-run', sourceSha256, runPath: '', status: 'dry_run', items: [],
      discoveryCount: estimateItemCount(options.source), estimatedMaxCalls: estimateItemCount(options.source) * 4,
    };
  }
  if (!provider) throw new Error('AI Item Intake provider is required outside --dry-run. Configure the shared AI Intake provider first.');

  const runId = `item-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const runPath = resolve(options.runRoot ?? '.local/item-intake-runs', runId);
  mkdirSync(join(runPath, 'items'), { recursive: true });
  writeFileSync(join(runPath, 'source.txt'), options.source, 'utf-8');
  const manifest: ItemRunManifest = {
    schemaVersion: 1,
    runId,
    sourceName: options.sourceName,
    sourceSha256,
    sourceLength: options.source.length,
    fvttVersion: '14',
    effectProfile: 'core',
    status: 'failed',
    createdAt: new Date().toISOString(),
    items: [],
  };
  writeJson(join(runPath, 'manifest.json'), manifest);

  try {
    const discovery = await provider.discover({ source: options.source, sourceSha256 });
    const candidates = normalizeItemCandidates(options.source, discovery?.candidates ?? []);
    writeJson(join(runPath, 'discovery.json'), { schemaVersion: 1, candidates });
    if (candidates.length === 0) {
      const entry = discoveryFailure(runPath, 'DISCOVERY_EMPTY', 'AI Item Intake found no recognizable Item boundary.');
      return finish(manifest, runPath, sourceSha256, [entry], 'needs_review', 0);
    }
    if (candidates.length > ITEM_INTAKE_LIMITS.maxItems) {
      const entry = discoveryFailure(runPath, 'DISCOVERY_LIMIT', `AI Item Intake found more than ${ITEM_INTAKE_LIMITS.maxItems} Items.`);
      return finish(manifest, runPath, sourceSha256, [entry], 'needs_review', candidates.length);
    }
    const boundaryIssue = itemCandidateBoundaryIssue(options.source, candidates);
    if (boundaryIssue) {
      const entry = discoveryFailure(runPath, boundaryIssue.code, boundaryIssue.message);
      return finish(manifest, runPath, sourceSha256, [entry], 'needs_review', candidates.length);
    }
    const items: ItemIntakeResultEntry[] = [];
    for (const candidate of candidates) {
      items.push(await processCandidate(options, provider, runPath, sourceSha256, candidate, dependencies));
    }
    return finish(manifest, runPath, sourceSha256, items, aggregateStatus(items), candidates.length);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    manifest.status = 'failed';
    manifest.completedAt = new Date().toISOString();
    writeJson(join(runPath, 'manifest.json'), { ...manifest, error: message });
    throw error;
  }
}

export async function resumeItemIntake(
  runPathValue: string,
  decisionsPath: string,
  provider: ItemIntakeAiProvider,
  vaultPath?: string,
  dependencies: ItemIntakeDependencies = defaultDependencies,
): Promise<ItemIntakeRunResult> {
  const runPath = resolve(runPathValue);
  const manifest = readJson<ItemRunManifest>(join(runPath, 'manifest.json'));
  const source = readFileSync(join(runPath, 'source.txt'), 'utf-8');
  const decisions = readJson<ItemIntakeDecisionsFile>(resolve(decisionsPath));
  if (manifest.schemaVersion !== 1 || decisions.runId !== manifest.runId || decisions.sourceSha256 !== manifest.sourceSha256 || sha256(source) !== manifest.sourceSha256) {
    throw new Error('Item Intake resume decisions do not match the immutable review bundle source.');
  }
  const unsupported = decisions.decisions.filter(
    (decision) => !decision.issueId.startsWith('target-conflict:') || decision.action !== 'replace',
  );
  if (unsupported.length > 0) {
    throw new Error(
      'Item Intake resume only accepts explicit replace decisions for target-conflict findings. '
      + 'Source evidence or mechanics findings require a corrected source and a new Intake run; they cannot be overridden by a decision file.',
    );
  }
  writeJson(join(runPath, 'resume-decisions.json'), decisions);
  const discovery = readJson<{ candidates: ItemDiscoveryCandidate[] }>(join(runPath, 'discovery.json'));
  const options: ItemIntakeOptions = {
    source,
    sourceName: manifest.sourceName,
    vaultPath,
    runRoot: dirname(runPath),
    fvttVersion: '14',
    effectProfile: 'core',
    replaceConflicts: new Set(decisions.decisions.filter((decision) => decision.action === 'replace').map((decision) => decision.issueId.replace(/^target-conflict:/, ''))),
  };
  const items: ItemIntakeResultEntry[] = [];
  for (const candidate of discovery.candidates) {
    const bundle = join(runPath, 'items', safeId(candidate.id));
    const irPath = join(bundle, 'intake-ir.json');
    if (!existsSync(irPath)) {
      items.push(discoveryFailure(runPath, 'RESUME_IR_MISSING', `Cannot resume ${candidate.id}: intake-ir.json is missing.`));
      continue;
    }
    items.push(await processIr(options, provider, runPath, candidate, readJson<ItemIntakeIR>(irPath), {
      discovery: 0, extraction: 0, review: 0, repair: 0,
    }, dependencies));
  }
  return finish(manifest, runPath, manifest.sourceSha256, items, aggregateStatus(items), discovery.candidates.length);
}

async function processCandidate(
  options: ItemIntakeOptions,
  provider: ItemIntakeAiProvider,
  runPath: string,
  sourceSha256: string,
  candidate: ItemDiscoveryCandidate,
  dependencies: ItemIntakeDependencies,
): Promise<ItemIntakeResultEntry> {
  const calls = { discovery: 1, extraction: 1, review: 0, repair: 0 };
  try {
    const ir = await provider.extract({ source: options.source, sourceSha256, candidate });
    return processIr(options, provider, runPath, candidate, ir, calls, dependencies);
  } catch (error) {
    return failedCandidate(runPath, candidate, calls, error);
  }
}

async function processIr(
  options: ItemIntakeOptions,
  provider: ItemIntakeAiProvider,
  runPath: string,
  candidate: ItemDiscoveryCandidate,
  initialIr: ItemIntakeIR,
  calls: ItemIntakeResultEntry['calls'],
  dependencies: ItemIntakeDependencies,
): Promise<ItemIntakeResultEntry> {
  const bundlePath = join(runPath, 'items', safeId(candidate.id));
  mkdirSync(bundlePath, { recursive: true });
  let ir = normalizeItemIntakeIR(options.source, candidate, initialIr, NODE_ITEM_CORE_RESOLVER);
  while (true) {
    writeJson(join(bundlePath, 'intake-ir.json'), ir);
    const deterministic = validateItemIntakeIR(options.source, ir, candidate);
    if (deterministic.blocking.length > 0) {
      if (calls.repair === 0) {
        calls.repair += 1;
        try {
          ir = normalizeItemIntakeIR(options.source, candidate, await provider.repair({ source: options.source, candidate, ir, deterministicFindings: deterministic.findings }), NODE_ITEM_CORE_RESOLVER);
          continue;
        } catch (error) {
          return failedCandidate(runPath, candidate, calls, error, deterministic.findings);
        }
      }
      writeReport(bundlePath, 'needs_review', deterministic.findings);
      return result(candidate, bundlePath, 'needs_review', deterministic.findings, calls);
    }

    const markdown = renderItemIntakeMarkdown(options.source, candidate, ir);
    const standardPath = join(bundlePath, 'standard.md');
    const candidateJsonPath = join(bundlePath, 'candidate-item.json');
    writeFileSync(standardPath, markdown, 'utf-8');
    let generated: ConversionResult;
    try {
      generated = await dependencies.convertMarkdownContentToJson({
        content: markdown,
        sourcePath: standardPath,
        outputPath: candidateJsonPath,
        fvttVersion: '14',
        effectProfile: 'core',
        translationService: null,
        iconOptions: options.iconOptions,
      });
    } catch (error) {
      return failedCandidate(runPath, candidate, calls, error);
    }
    const generationFindings = generated.status === 'accepted' && !Array.isArray(generated.rawJson)
      ? []
      : generated.diagnostics.length > 0
        ? generated.diagnostics.map((diagnostic, index) => finding(
          `GENERATION_${diagnostic.code}_${index}`,
          diagnostic.path,
          diagnostic.message,
          'semantic',
        ))
        : [finding('GENERATION_NOT_ACCEPTED', '/', `Item projection status is ${generated.status}; formal output was not written.`, 'semantic')];
    if (generationFindings.length > 0) {
      writeReport(bundlePath, 'needs_review', generationFindings, generated);
      return result(candidate, bundlePath, 'needs_review', generationFindings, calls);
    }
    calls.review += 1;
    let review: ItemAiReviewResult;
    try {
      review = await provider.review({ source: options.source, candidate, ir, markdown, itemProjection: generated.rawJson, deterministicFindings: deterministic.findings });
    } catch (error) {
      return failedCandidate(runPath, candidate, calls, error);
    }
    writeJson(join(bundlePath, 'ai-review.json'), review);
    const reviewFindings = Array.isArray(review.findings) ? review.findings : [];
    if (review.verdict === 'revise' && calls.repair === 0) {
      calls.repair += 1;
      try {
        ir = normalizeItemIntakeIR(options.source, candidate, await provider.repair({ source: options.source, candidate, ir, deterministicFindings: deterministic.findings, review }), NODE_ITEM_CORE_RESOLVER);
        continue;
      } catch (error) {
        return failedCandidate(runPath, candidate, calls, error, reviewFindings);
      }
    }
    if (review.verdict !== 'accepted' || reviewFindings.some((entry) => entry.blocking)) {
      writeReport(bundlePath, 'needs_review', reviewFindings, generated);
      return result(candidate, bundlePath, 'needs_review', reviewFindings, calls);
    }
    const promoted = promoteAccepted(options, candidate, ir, markdown, candidateJsonPath);
    if (promoted.findings.length > 0) {
      writeReport(bundlePath, 'needs_review', promoted.findings, generated);
      return result(candidate, bundlePath, 'needs_review', promoted.findings, calls);
    }
    writeReport(bundlePath, 'accepted', [], generated);
    return {
      ...result(candidate, bundlePath, 'accepted', [], calls),
      markdownPath: promoted.markdownPath,
      itemPath: promoted.itemPath,
    };
  }
}

function promoteAccepted(
  options: ItemIntakeOptions,
  candidate: ItemDiscoveryCandidate,
  ir: ItemIntakeIR,
  markdown: string,
  candidateJsonPath: string,
): { markdownPath: string; itemPath: string; findings: ItemIntakeFinding[] } {
  const vault = resolve(options.vaultPath ?? 'obsidian/dnd数据转fvttjson');
  const slug = slugify(ir.item.englishName ?? ir.item.name, candidate.id);
  const markdownPath = join(vault, 'input', 'items', `${slug}.md`);
  const itemPath = join(vault, 'output', 'items', `${slug}.json`);
  const conflicts: string[] = [];
  if (existsSync(markdownPath) && readFileSync(markdownPath, 'utf-8') !== markdown) conflicts.push(markdownPath);
  if (existsSync(itemPath) && !options.replaceConflicts?.has(candidate.id)) conflicts.push(itemPath);
  if (conflicts.length > 0 && !options.replaceConflicts?.has(candidate.id)) {
    return {
      markdownPath,
      itemPath,
      findings: [finding(`target-conflict:${candidate.id}`, '/promotion', `Existing target conflicts: ${conflicts.join(', ')}`, 'conflict')],
    };
  }
  mkdirSync(dirname(markdownPath), { recursive: true });
  mkdirSync(dirname(itemPath), { recursive: true });
  writeFileSync(markdownPath, markdown, 'utf-8');
  copyFileSync(candidateJsonPath, itemPath);
  return { markdownPath, itemPath, findings: [] };
}

function validateOptions(options: ItemIntakeOptions): void {
  if (!options.source.trim()) throw new Error('AI Item Intake source is empty.');
  if (options.source.length > ITEM_INTAKE_LIMITS.maxSourceLength) throw new Error(`AI Item Intake source exceeds ${ITEM_INTAKE_LIMITS.maxSourceLength} UTF-16 characters.`);
  if ((options.fvttVersion ?? '14') !== '14' || (options.effectProfile ?? 'core') !== 'core') {
    throw new Error('AI Item Intake currently supports only Foundry VTT 14 / dnd5e 5.3.3 / core profile.');
  }
}

function finish(manifest: ItemRunManifest, runPath: string, sourceSha256: string, items: ItemIntakeResultEntry[], status: ItemIntakeRunResult['status'], discoveryCount: number): ItemIntakeRunResult {
  Object.assign(manifest, { status, items, completedAt: new Date().toISOString() });
  writeJson(join(runPath, 'manifest.json'), manifest);
  writeJson(join(runPath, 'decisions.template.json'), {
    runId: manifest.runId,
    sourceSha256,
    decisions: items.flatMap((item) => item.findings
      .filter((finding) => finding.blocking && finding.id.startsWith('target-conflict:'))
      .map((finding) => ({ issueId: finding.id, action: 'replace', value: 'replace', note: finding.message }))),
  } satisfies ItemIntakeDecisionsFile);
  return { runId: manifest.runId, sourceSha256, runPath, status, items, discoveryCount };
}

function aggregateStatus(items: ItemIntakeResultEntry[]): ItemIntakeRunResult['status'] {
  if (items.every((item) => item.status === 'accepted')) return 'succeeded';
  if (items.some((item) => item.status === 'accepted')) return 'partial';
  if (items.some((item) => item.status === 'needs_review')) return 'needs_review';
  return 'failed';
}

function failedCandidate(runPath: string, candidate: ItemDiscoveryCandidate, calls: ItemIntakeResultEntry['calls'], error: unknown, prior: ItemIntakeFinding[] = []): ItemIntakeResultEntry {
  const bundlePath = join(runPath, 'items', safeId(candidate.id));
  mkdirSync(bundlePath, { recursive: true });
  const message = error instanceof Error ? error.message : String(error);
  const findings = [...prior, finding('ITEM_INTAKE_PROVIDER_FAILURE', '/', message, 'provider')];
  writeReport(bundlePath, 'failed', findings);
  return result(candidate, bundlePath, 'failed', findings, calls);
}

function discoveryFailure(runPath: string, code: string, message: string): ItemIntakeResultEntry {
  const bundlePath = join(runPath, 'items', '_discovery');
  mkdirSync(bundlePath, { recursive: true });
  const findings = [finding(code, '/discovery', message, 'semantic')];
  writeReport(bundlePath, 'needs_review', findings);
  return { id: '_discovery', label: 'Discovery', status: 'needs_review', bundlePath, findings, calls: { discovery: 1, extraction: 0, review: 0, repair: 0 } };
}

function result(candidate: ItemDiscoveryCandidate, bundlePath: string, status: ItemIntakeResultEntry['status'], findings: ItemIntakeFinding[], calls: ItemIntakeResultEntry['calls']): ItemIntakeResultEntry {
  return { id: candidate.id, label: candidate.label, status, bundlePath, findings, calls };
}

function writeReport(bundlePath: string, status: ItemIntakeResultEntry['status'], findings: ItemIntakeFinding[], generated?: ConversionResult): void {
  writeJson(join(bundlePath, 'deterministic-report.json'), {
    schemaVersion: 1,
    status,
    findings,
    ...(generated ? { conversion: { status: generated.status, verification: generated.verification, diagnostics: generated.diagnostics } } : {}),
  });
}

function finding(id: string, path: string, message: string, origin: ItemIntakeFinding['origin']): ItemIntakeFinding {
  return { id, code: id.split(':')[0] || id, path, message, blocking: true, origin };
}

function sha256(source: string): string { return createHash('sha256').update(source).digest('hex'); }
function writeJson(path: string, value: unknown): void { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8'); }
function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, 'utf-8')) as T; }
function safeId(value: string): string { return value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 96) || 'item'; }
function slugify(value: string, fallback: string): string {
  const normalized = value.normalize('NFKC').toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  // Keep readable Unicode names when the filesystem supports them; if the
  // normalized value is not an ASCII-safe slug, use the already ASCII-safe
  // discovery id instead of turning every CJK character into a bare dash.
  return normalized && /^[a-z0-9][a-z0-9._-]*$/iu.test(normalized) ? normalized : safeId(fallback);
}
function estimateItemCount(source: string): number { return Math.min(ITEM_INTAKE_LIMITS.maxItems, Math.max(1, (source.match(/(?:^|\n)#{1,3}\s+/g) ?? []).length)); }

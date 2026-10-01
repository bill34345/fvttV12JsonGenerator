import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  compileSpeciesMarkdown,
  parseAndCompileSpeciesMarkdown,
  SPECIES_V12_TARGET,
  SPECIES_V14_TARGET,
  SPECIES_V14_368_TARGET,
  validateNativeSpeciesPackage,
  type NativeSpeciesPackage,
  type SpeciesTargetVersion,
} from '@fvtt-json-generator/generation/species';
import { renderSpeciesIntakeMarkdown } from './species-renderer';
import type {
  SpeciesAcceptedLedger,
  SpeciesAiReviewResult,
  SpeciesDiscoveryCandidate,
  SpeciesIntakeAiProvider,
  SpeciesIntakeDecisionsFile,
  SpeciesIntakeFinding,
  SpeciesIntakeIR,
  SpeciesIntakeOptions,
  SpeciesIntakeResultEntry,
  SpeciesIntakeRunResult,
} from './species-types';
import { validateSpeciesIntakeIR } from './species-validator';

export const SPECIES_INTAKE_LIMITS = { maxSourceLength: 200_000, maxSpecies: 50 } as const;

interface SpeciesRunManifest {
  schemaVersion: 1;
  runId: string;
  sourceName: string;
  sourceSha256: string;
  sourceLength: number;
  fvttVersion: SpeciesTargetVersion;
  effectProfile: 'core';
  rules: '2024';
  target: ReturnType<typeof speciesRunTarget>;
  status: SpeciesIntakeRunResult['status'];
  createdAt: string;
  completedAt?: string;
  resumedFromRunId?: string;
  decisionsSha256?: string;
  species: SpeciesIntakeResultEntry[];
}

export async function runSpeciesIntake(options: SpeciesIntakeOptions, provider?: SpeciesIntakeAiProvider): Promise<SpeciesIntakeRunResult> {
  validateOptions(options);
  const fvttVersion = options.fvttVersion ?? '14';
  const target = speciesRunTarget(fvttVersion);
  const sourceSha256 = sha256(options.source);
  const isMarkdown = /^---[\s\S]*?^layout\s*:\s*['"]?species['"]?\s*$/imu.test(options.source);
  if (options.dryRun) return { runId: 'dry-run', sourceSha256, runPath: '', status: 'dry_run', species: [], discoveryCount: isMarkdown ? 1 : estimateSpeciesCount(options.source), estimatedMaxCalls: isMarkdown ? 1 : estimateSpeciesCount(options.source) * 4 };
  if (!provider) throw new Error('AI Species Intake provider is required outside --dry-run.');
  const runId = `species-${new Date().toISOString().replace(/[-:.TZ]/gu, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const runPath = resolve(options.runRoot ?? '.local/species-intake-runs', runId);
  mkdirSync(join(runPath, 'species'), { recursive: true });
  writeFileSync(join(runPath, isMarkdown ? 'source.md' : 'source.txt'), options.source, 'utf8');
  const manifest: SpeciesRunManifest = { schemaVersion: 1, runId, sourceName: options.sourceName, sourceSha256, sourceLength: options.source.length, fvttVersion, effectProfile: 'core', rules: '2024', target, status: 'failed', createdAt: new Date().toISOString(), ...(options.resumeContext ?? {}), species: [] };
  writeJson(join(runPath, 'manifest.json'), manifest);
  try {
    let candidates: SpeciesDiscoveryCandidate[];
    if (isMarkdown) {
      candidates = [{ id: 'markdown-revision', label: options.sourceName, start: 0, end: options.source.length, quote: options.source }];
    } else {
      const discovery = await provider.discover({ source: options.source, sourceSha256 });
      candidates = normalizeCandidates(options.source, discovery?.candidates ?? []);
    }
    writeJson(join(runPath, 'discovery.json'), { schemaVersion: 1, candidates });
    const discoveryFinding = validateDiscovery(options.source, candidates);
    if (discoveryFinding) {
      const entry = failureEntry(runPath, discoveryFinding.code, discoveryFinding.message, 'needs_review');
      return finish(manifest, runPath, [entry], 'needs_review', candidates.length);
    }
    const entries: SpeciesIntakeResultEntry[] = [];
    for (const candidate of candidates) entries.push(await processCandidate(options, provider, runPath, runId, candidate, isMarkdown));
    return finish(manifest, runPath, entries, aggregateStatus(entries), candidates.length);
  } catch (error) {
    manifest.status = 'failed'; manifest.completedAt = new Date().toISOString();
    writeJson(join(runPath, 'manifest.json'), { ...manifest, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function resumeSpeciesIntake(
  runPathValue: string,
  decisionsPath: string,
  provider: SpeciesIntakeAiProvider,
  vaultPath?: string,
  requestedTarget?: { fvttVersion: SpeciesTargetVersion; effectProfile: 'core' },
): Promise<SpeciesIntakeRunResult> {
  const runPath = resolve(runPathValue);
  const manifest = readJson<SpeciesRunManifest>(join(runPath, 'manifest.json'));
  if (requestedTarget) assertSpeciesResumeTargetManifest(manifest, requestedTarget);
  const sourcePath = existsSync(join(runPath, 'source.md')) ? join(runPath, 'source.md') : join(runPath, 'source.txt');
  const source = readFileSync(sourcePath, 'utf8');
  const decisionsBytes = readFileSync(resolve(decisionsPath), 'utf8');
  const decisions = JSON.parse(decisionsBytes) as SpeciesIntakeDecisionsFile;
  const manifestVersion = speciesResumeTarget(manifest).fvttVersion;
  if (decisions.runId !== manifest.runId || decisions.sourceSha256 !== manifest.sourceSha256 || sha256(source) !== manifest.sourceSha256) throw new Error('Species Intake decisions do not match the immutable run source.');
  if (decisions.decisions.some((decision) => decision.action !== 'replace' || !decision.issueId.startsWith('target-conflict:'))) throw new Error('Species Intake decisions may only replace an exact target conflict; source semantics cannot be overridden.');
  writeJson(join(runPath, 'resume-decisions.json'), decisions);
  return runSpeciesIntake({ source, sourceName: manifest.sourceName, vaultPath, runRoot: dirname(runPath), fvttVersion: manifestVersion, effectProfile: 'core', replaceConflicts: new Set(decisions.decisions.map((decision) => decision.issueId.replace(/^target-conflict:/u, ''))), resumeContext: { resumedFromRunId: manifest.runId, decisionsSha256: sha256(decisionsBytes) } }, provider);
}

export function assertSpeciesResumeTarget(
  runPathValue: string,
  requestedTarget: { fvttVersion: SpeciesTargetVersion; effectProfile: 'core' },
): void {
  const manifest = readJson<SpeciesRunManifest>(join(resolve(runPathValue), 'manifest.json'));
  assertSpeciesResumeTargetManifest(manifest, requestedTarget);
}

function assertSpeciesResumeTargetManifest(
  manifest: SpeciesRunManifest,
  requestedTarget: { fvttVersion: SpeciesTargetVersion; effectProfile: 'core' },
): void {
  const target = speciesResumeTarget(manifest);
  if (requestedTarget.fvttVersion !== target.fvttVersion || requestedTarget.effectProfile !== target.effectProfile) {
    throw new Error(`Species Intake resume target mismatch: run is ${target.fvttVersion}/${target.effectProfile}/2024, request is ${requestedTarget.fvttVersion}/${requestedTarget.effectProfile}/2024.`);
  }
}

async function processCandidate(options: SpeciesIntakeOptions, provider: SpeciesIntakeAiProvider, runPath: string, runId: string, candidate: SpeciesDiscoveryCandidate, markdownRevision: boolean): Promise<SpeciesIntakeResultEntry> {
  const calls = { discovery: markdownRevision ? 0 : 1, extraction: markdownRevision ? 0 : 1, review: 0, repair: 0 };
  const bundlePath = join(runPath, 'species', safeId(candidate.id));
  mkdirSync(bundlePath, { recursive: true });
  try {
    let ir: SpeciesIntakeIR;
    let markdown: string;
    if (markdownRevision) {
      const canonical = parseAndCompileSpeciesMarkdown(options.source, { fvttVersion: options.fvttVersion ?? '14' }).canonical;
      ir = irFromMarkdown(options.source, canonical);
      markdown = options.source;
    } else {
      ir = await provider.extract({ source: options.source, sourceSha256: sha256(options.source), candidate });
      const firstFindings = validateSpeciesIntakeIR(options.source, ir, candidate);
      if (firstFindings.some((finding) => finding.blocking)) {
        calls.repair += 1;
        ir = await provider.repair({ source: options.source, candidate, ir, deterministicFindings: firstFindings });
      }
      markdown = '';
    }
    writeJson(join(bundlePath, 'intake-ir.json'), ir);
    const deterministic = markdownRevision ? [] : validateSpeciesIntakeIR(options.source, ir, candidate);
    if (deterministic.some((finding) => finding.blocking)) return record(bundlePath, candidate, 'needs_review', deterministic, calls);
    if (!markdownRevision) markdown = renderSpeciesIntakeMarkdown(options.source, candidate, ir);
    writeFileSync(join(bundlePath, 'standard.md'), markdown, 'utf8');
    let projection = compileSpeciesMarkdown(markdown, { fvttVersion: options.fvttVersion ?? '14' });
    const projectionValidation = validateNativeSpeciesPackage(projection);
    writeJson(join(bundlePath, 'candidate-package.json'), projection);
    if (!projectionValidation.ok) return record(bundlePath, candidate, 'needs_review', projectionValidation.findings.map((finding) => makeFinding(`PROJECTION_${finding.code}`, finding.path, finding.message, 'projection')), calls);
    calls.review += 1;
    let review = await provider.review({ source: options.source, candidate, ir, markdown, jsonProjection: projection, deterministicFindings: deterministic });
    writeJson(join(bundlePath, 'ai-review.json'), review);
    if (review.verdict === 'revise' && calls.repair === 0 && !markdownRevision) {
      calls.repair += 1;
      ir = await provider.repair({ source: options.source, candidate, ir, deterministicFindings: deterministic, review });
      writeJson(join(bundlePath, 'intake-ir.json'), ir);
      const repairedFindings = validateSpeciesIntakeIR(options.source, ir, candidate);
      if (repairedFindings.some((finding) => finding.blocking)) return record(bundlePath, candidate, 'needs_review', repairedFindings, calls);
      markdown = renderSpeciesIntakeMarkdown(options.source, candidate, ir);
      writeFileSync(join(bundlePath, 'standard.md'), markdown, 'utf8');
      projection = compileSpeciesMarkdown(markdown, { fvttVersion: options.fvttVersion ?? '14' });
      writeJson(join(bundlePath, 'candidate-package.json'), projection);
      calls.review += 1;
      review = await provider.review({ source: options.source, candidate, ir, markdown, jsonProjection: projection, deterministicFindings: repairedFindings });
      writeJson(join(bundlePath, 'ai-review.json'), review);
    }
    const reviewFindings = Array.isArray(review.findings) ? review.findings : [];
    if (review.verdict !== 'accepted' || reviewFindings.some((finding) => finding.blocking)) return record(bundlePath, candidate, 'needs_review', reviewFindings, calls);
    const promoted = promote(options, runId, projection, markdown, markdownRevision);
    if (promoted.findings.length) return record(bundlePath, candidate, 'needs_review', promoted.findings, calls);
    const accepted = record(bundlePath, candidate, 'accepted', [], calls);
    writeJson(join(bundlePath, 'deterministic-report.json'), { status: 'accepted', findings: [], target: projection.target, logicalHash: projection.logicalHash });
    return { ...accepted, markdownPath: promoted.markdownPath, packagePath: promoted.packagePath };
  } catch (error) {
    const finding = makeFinding('SPECIES_PROCESSING_FAILED', '/', error instanceof Error ? error.message : String(error), 'provider');
    return record(bundlePath, candidate, 'failed', [finding], calls);
  }
}

function promote(options: SpeciesIntakeOptions, runId: string, projection: NativeSpeciesPackage, markdown: string, markdownRevision: boolean): { markdownPath: string; packagePath: string; findings: SpeciesIntakeFinding[] } {
  const vault = resolve(options.vaultPath ?? 'obsidian/dnd数据转fvttjson');
  const identifier = projection.species.system.identifier as string;
  const fvttVersion = options.fvttVersion ?? '14';
  const targetSubdirectory = fvttVersion === '12' ? 'v12' : fvttVersion === '14.368' ? 'v14-368' : undefined;
  const markdownPath = targetSubdirectory
    ? join(vault, 'input', 'species', targetSubdirectory, `${identifier}.md`)
    : join(vault, 'input', 'species', `${identifier}.md`);
  const packagePath = targetSubdirectory
    ? join(vault, 'output', 'species', targetSubdirectory, `${identifier}.json`)
    : join(vault, 'output', 'species', `${identifier}.json`);
  const ledgerPath = join(vault, 'output', 'species', 'accepted-ledger.json');
  const ledger = readLedger(ledgerPath);
  const existing = ledger.entries.find((entry) => sameLedgerTarget(entry, identifier, fvttVersion));
  const conflict = (!markdownRevision && ((existsSync(markdownPath) && readFileSync(markdownPath, 'utf8') !== markdown) || (existsSync(packagePath) && !existing)));
  if (conflict && !options.replaceConflicts?.has(identifier)) return { markdownPath, packagePath, findings: [makeFinding(`target-conflict:${identifier}`, '/promotion', `Existing Species target conflicts for ${identifier}.`, 'conflict')] };
  mkdirSync(dirname(markdownPath), { recursive: true }); mkdirSync(dirname(packagePath), { recursive: true });
  writeFileSync(markdownPath, markdown, 'utf8'); writeJson(packagePath, projection);
  const entry = { identifier, fvttVersion, effectProfile: 'core' as const, rules: '2024' as const, markdownPath: relativeVault(vault, markdownPath), packagePath: relativeVault(vault, packagePath), markdownSha256: sha256(markdown), sourceSha256: projection.sourceSha256, irRevision: Number(projection.species.system.source.revision), logicalHash: projection.logicalHash, acceptedRunId: runId, ...(options.resumeContext ?? {}) };
  ledger.entries = [...ledger.entries.filter((item) => !sameLedgerTarget(item, identifier, fvttVersion)), entry]
    .sort((a, b) => ledgerIdentity(a).localeCompare(ledgerIdentity(b), 'en'));
  writeJsonAtomic(ledgerPath, ledger);
  return { markdownPath, packagePath, findings: [] };
}

function irFromMarkdown(markdown: string, canonical: ReturnType<typeof parseAndCompileSpeciesMarkdown>['canonical']): SpeciesIntakeIR {
  const evidence = { start: 0, end: markdown.length, quote: markdown };
  const { schemaVersion: _schemaVersion, rawSource: _rawSource, ...species } = canonical;
  const claimPaths = ['/species/name', '/species/englishName', '/species/displayName', '/species/identifier', '/species/rules', '/species/creatureType', '/species/size', '/species/movement', '/species/senses', ...canonical.features.map((_, index) => `/species/features/${index}`)];
  return { schemaVersion: 1, source: { sha256: sha256(markdown), length: markdown.length, originalSha256: canonical.source.sha256 }, species, claims: claimPaths.map((path) => ({ path, evidence: [evidence] })), coverage: [{ ...evidence, classification: 'mechanical', claimPaths }], uncertainties: [] };
}

function validateOptions(options: SpeciesIntakeOptions): void {
  if (!options.source || options.source.length > SPECIES_INTAKE_LIMITS.maxSourceLength) throw new Error(`Species Intake source must contain 1-${SPECIES_INTAKE_LIMITS.maxSourceLength} characters.`);
  if (!['12', '14', '14.368'].includes(options.fvttVersion ?? '14') || (options.effectProfile ?? 'core') !== 'core') throw new Error('Species Intake only supports target 12|14|14.368 with core / 2024 rules.');
}
function normalizeCandidates(source: string, candidates: SpeciesDiscoveryCandidate[]): SpeciesDiscoveryCandidate[] {
  const sorted = candidates
    .filter((candidate) => candidate && typeof candidate.id === 'string' && typeof candidate.label === 'string' && Number.isInteger(candidate.start) && Number.isInteger(candidate.end) && candidate.start >= 0 && candidate.end > candidate.start && candidate.end <= source.length && source.slice(candidate.start, candidate.end) === candidate.quote)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  return sorted.map((candidate, index) => {
    const nextStart = sorted[index + 1]?.start ?? source.length;
    const gap = source.slice(candidate.end, nextStart);
    const hasFeatureContinuation = /(?:^|\r?\n)\s*(?:[-*+]\s+|\d+[.)]\s+|(?:生物类型|体型|速度|移动|黑暗视觉|特性)\s*[:：])/iu.test(gap);
    const end = candidate.end <= nextStart && hasFeatureContinuation ? nextStart : candidate.end;
    return { ...candidate, end, quote: source.slice(candidate.start, end) };
  });
}
function validateDiscovery(source: string, candidates: SpeciesDiscoveryCandidate[]): { code: string; message: string } | undefined {
  if (!candidates.length) return { code: 'DISCOVERY_EMPTY', message: 'No Species candidate was discovered.' };
  if (candidates.length > SPECIES_INTAKE_LIMITS.maxSpecies) return { code: 'DISCOVERY_LIMIT', message: `At most ${SPECIES_INTAKE_LIMITS.maxSpecies} Species candidates are allowed.` };
  const ids = new Set<string>(); let end = -1;
  for (const candidate of candidates) { if (ids.has(candidate.id)) return { code: 'DISCOVERY_DUPLICATE_ID', message: `Duplicate candidate id: ${candidate.id}.` }; ids.add(candidate.id); if (candidate.start < end) return { code: 'DISCOVERY_OVERLAP', message: 'Species candidates must not overlap.' }; if (source.slice(candidate.start, candidate.end) !== candidate.quote) return { code: 'DISCOVERY_RANGE', message: 'Species discovery evidence must be exact.' }; end = candidate.end; }
  return undefined;
}
function finish(manifest: SpeciesRunManifest, runPath: string, species: SpeciesIntakeResultEntry[], status: SpeciesIntakeRunResult['status'], discoveryCount: number): SpeciesIntakeRunResult { manifest.status = status; manifest.species = species; manifest.completedAt = new Date().toISOString(); writeJson(join(runPath, 'manifest.json'), manifest); return { runId: manifest.runId, sourceSha256: manifest.sourceSha256, runPath, status, species, discoveryCount }; }
function aggregateStatus(entries: SpeciesIntakeResultEntry[]): SpeciesIntakeRunResult['status'] { const accepted = entries.filter((entry) => entry.status === 'accepted').length; const failed = entries.filter((entry) => entry.status === 'failed').length; const review = entries.filter((entry) => entry.status === 'needs_review').length; if (accepted === entries.length) return 'succeeded'; if (accepted > 0) return 'partial'; if (review > 0) return 'needs_review'; return failed > 0 ? 'failed' : 'needs_review'; }
function record(bundlePath: string, candidate: SpeciesDiscoveryCandidate, status: SpeciesIntakeResultEntry['status'], findings: SpeciesIntakeFinding[], calls: SpeciesIntakeResultEntry['calls']): SpeciesIntakeResultEntry { writeJson(join(bundlePath, 'deterministic-report.json'), { status, findings }); return { id: candidate.id, label: candidate.label, status, bundlePath, findings, calls }; }
function failureEntry(runPath: string, code: string, message: string, status: SpeciesIntakeResultEntry['status']): SpeciesIntakeResultEntry { return { id: 'discovery', label: 'Discovery', status, bundlePath: runPath, findings: [makeFinding(code, '/discovery', message, 'evidence')], calls: { discovery: 1, extraction: 0, review: 0, repair: 0 } }; }
function makeFinding(code: string, path: string, message: string, origin: SpeciesIntakeFinding['origin']): SpeciesIntakeFinding { return { id: `${code}:${path}`, code, path, message, blocking: true, origin }; }
function estimateSpeciesCount(source: string): number { return Math.max(1, Math.min(50, (source.match(/(?:^|\n)\s*(?:种族|Species)\s*[:：]?/giu) ?? []).length || 1)); }
function readLedger(path: string): SpeciesAcceptedLedger {
  if (!existsSync(path)) return { schemaVersion: 2, moduleId: 'fvtt-homebrew-species', entries: [] };
  const ledger = readJson<any>(path);
  if (ledger.moduleId !== 'fvtt-homebrew-species' || !Array.isArray(ledger.entries) || ![1, 2].includes(ledger.schemaVersion)) throw new Error('Species accepted ledger is invalid.');
  if (ledger.schemaVersion === 1) {
    if (ledger.entries.some((entry: any) => entry?.fvttVersion !== undefined || entry?.effectProfile !== undefined || entry?.rules !== undefined)) {
      throw new Error('Schema v1 Species ledger cannot contain explicit target identities.');
    }
    return {
      schemaVersion: 2,
      moduleId: 'fvtt-homebrew-species',
      entries: ledger.entries.map((entry: any) => ({ ...entry, fvttVersion: '14', effectProfile: 'core', rules: '2024' })),
    };
  }
  for (const entry of ledger.entries) if (!['12', '14', '14.368'].includes(entry.fvttVersion) || entry.effectProfile !== 'core' || entry.rules !== '2024') throw new Error('Species accepted ledger target identity is invalid.');
  return ledger as SpeciesAcceptedLedger;
}
function sameLedgerTarget(entry: SpeciesAcceptedLedger['entries'][number], identifier: string, fvttVersion: SpeciesTargetVersion): boolean { return entry.identifier === identifier && entry.fvttVersion === fvttVersion && entry.effectProfile === 'core' && entry.rules === '2024'; }
function ledgerIdentity(entry: SpeciesAcceptedLedger['entries'][number]): string { return `${entry.identifier}\0${entry.fvttVersion}\0${entry.effectProfile}\0${entry.rules}`; }
function speciesResumeTarget(manifest: SpeciesRunManifest): { fvttVersion: SpeciesTargetVersion; effectProfile: 'core' } {
  const fvttVersion = manifest.fvttVersion ?? (manifest.target?.foundry === '12.331' ? '12' : manifest.target?.foundry === '14.368' ? '14.368' : '14');
  const expected = speciesRunTarget(fvttVersion);
  if (!['12', '14', '14.368'].includes(fvttVersion) || manifest.target?.foundry !== expected.foundry || manifest.target?.dnd5e !== expected.dnd5e
    || manifest.target?.effectProfile !== expected.effectProfile || manifest.target?.rules !== expected.rules) throw new Error('Species Intake run target identity is invalid.');
  return { fvttVersion, effectProfile: manifest.effectProfile ?? 'core' };
}
function speciesRunTarget(fvttVersion: SpeciesTargetVersion): typeof SPECIES_V12_TARGET | typeof SPECIES_V14_TARGET | typeof SPECIES_V14_368_TARGET {
  return fvttVersion === '12' ? SPECIES_V12_TARGET : fvttVersion === '14.368' ? SPECIES_V14_368_TARGET : SPECIES_V14_TARGET;
}
function writeJson(path: string, value: unknown): void { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function writeJsonAtomic(path: string, value: unknown): void { const temp = `${path}.${process.pid}.tmp`; writeJson(temp, value); renameSync(temp, path); }
function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, 'utf8')) as T; }
function safeId(value: string): string { return value.replace(/[^a-z0-9_-]/giu, '-').slice(0, 80) || 'species'; }
function relativeVault(vault: string, path: string): string { return path.slice(vault.length + 1).replace(/\\/gu, '/'); }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }

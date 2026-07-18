import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { convertMarkdownContentToJson } from '../workflow/singleFileConversion';
import { renderMonsterIntakeMarkdown } from './renderer';
import type {
  AiReviewResult,
  DiscoveryCandidate,
  IntakeDecision,
  IntakeDecisionsFile,
  IntakeFinding,
  MonsterIntakeAiProvider,
  MonsterIntakeCreatureResult,
  MonsterIntakeIR,
  MonsterIntakeOptions,
  MonsterIntakeRunResult,
  PortableSpellResolutionStatus,
} from './types';
import { renderIntakeVerificationMarkdown, verifyMonsterIntake } from './verifier';
import { validateMonsterIntakeIR } from './validator';

export const INTAKE_LIMITS = {
  maxSourceLength: 200_000,
  maxCreatures: 50,
  maxCandidateLength: 25_000,
  chunkLength: 24_000,
  chunkOverlap: 1_000,
  extractionConcurrency: 2,
} as const;

interface Manifest {
  schemaVersion: 1;
  runId: string;
  sourceName: string;
  sourceSha256: string;
  sourceLength: number;
  fvttVersion: '12' | '14';
  effectProfile: string;
  status: MonsterIntakeRunResult['status'];
  createdAt: string;
  completedAt?: string;
  creatures: MonsterIntakeCreatureResult[];
}

export async function runMonsterIntake(
  options: MonsterIntakeOptions,
  provider?: MonsterIntakeAiProvider,
): Promise<MonsterIntakeRunResult> {
  validateOptions(options);
  const sourceSha256 = sha256(options.source);
  if (options.dryRun) {
    const estimate = estimateMonsterCount(options.source);
    return {
      runId: 'dry-run', sourceSha256, runPath: '', status: 'dry_run', creatures: [],
      discoveryCount: estimate, estimatedMaxCalls: estimate * 6 + chunkSource(options.source).length * 2,
    };
  }
  if (!provider) throw new Error('AI monster intake provider is required outside --dry-run.');

  const runId = createRunId();
  const runPath = resolve(options.runRoot ?? '.local/intake-runs', runId);
  mkdirSync(join(runPath, 'creatures'), { recursive: true });
  writeFileSync(join(runPath, 'source.txt'), options.source);
  const manifest: Manifest = {
    schemaVersion: 1, runId, sourceName: options.sourceName, sourceSha256, sourceLength: options.source.length,
    fvttVersion: options.fvttVersion ?? '12', effectProfile: options.effectProfile ?? 'core',
    status: 'failed', createdAt: new Date().toISOString(), creatures: [],
  };
  writeJson(join(runPath, 'manifest.json'), manifest);

  try {
    const discovered: DiscoveryCandidate[] = [];
    for (const chunk of chunkSource(options.source)) {
      const result = await provider.discover({
        source: chunk.text,
        sourceSha256,
        chunkStart: chunk.start,
        chunkEnd: chunk.end,
      });
      if (result?.schemaVersion !== 1 || !Array.isArray(result.candidates)) throw new Error('Discovery response is not schemaVersion 1.');
      discovered.push(...result.candidates);
    }
    const candidates = partitionDiscoveryCandidates(options.source, normalizeDiscovery(options.source, discovered));
    writeJson(join(runPath, 'discovery.json'), { schemaVersion: 1, candidates });
    if (candidates.length === 0) throw new Error('AI monster intake discovered 0 monsters.');
    if (candidates.length > INTAKE_LIMITS.maxCreatures) throw new Error(`AI monster intake found more than ${INTAKE_LIMITS.maxCreatures} monsters.`);

    const creatures = await mapWithConcurrency(candidates, INTAKE_LIMITS.extractionConcurrency, (candidate) =>
      processCandidate(options, provider, runPath, sourceSha256, candidate));
    const status = aggregateStatus(creatures);
    const result = { runId, sourceSha256, runPath, status, creatures, discoveryCount: candidates.length } satisfies MonsterIntakeRunResult;
    Object.assign(manifest, { status, creatures, completedAt: new Date().toISOString() });
    writeJson(join(runPath, 'manifest.json'), manifest);
    writeDecisionTemplate(runPath, manifest);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Object.assign(manifest, { status: 'failed', completedAt: new Date().toISOString(), error: message });
    writeJson(join(runPath, 'manifest.json'), manifest);
    throw error;
  }
}

export async function resumeMonsterIntake(
  runPathValue: string,
  decisionsPath: string,
  provider: MonsterIntakeAiProvider,
  vaultPath?: string,
): Promise<MonsterIntakeRunResult> {
  const runPath = resolve(runPathValue);
  const manifest = readJson<Manifest>(join(runPath, 'manifest.json'));
  const source = readFileSync(join(runPath, 'source.txt'), 'utf-8');
  const decisions = readJson<IntakeDecisionsFile>(resolve(decisionsPath));
  if (decisions.runId !== manifest.runId) throw new Error('Decisions runId does not match the review bundle.');
  if (decisions.sourceSha256 !== manifest.sourceSha256 || sha256(source) !== manifest.sourceSha256) {
    throw new Error('Decisions sourceSha256 does not match the immutable source.');
  }
  const discovery = readJson<{ candidates: DiscoveryCandidate[] }>(join(runPath, 'discovery.json'));
  const byIssue = new Map(decisions.decisions.map((decision) => [decision.issueId, decision]));
  const replaceConflicts = new Set(
    decisions.decisions.filter((decision) => decision.issueId.startsWith('target-conflict:') && decision.value === 'replace').map((decision) => decision.issueId.slice('target-conflict:'.length)),
  );
  const options: MonsterIntakeOptions = {
    source, sourceName: manifest.sourceName, runRoot: dirname(runPath), vaultPath,
    fvttVersion: manifest.fvttVersion, effectProfile: manifest.effectProfile as MonsterIntakeOptions['effectProfile'], replaceConflicts,
  };
  const results: MonsterIntakeCreatureResult[] = [];
  for (const candidate of discovery.candidates) {
    const creaturePath = join(runPath, 'creatures', safeId(candidate.id));
    const oldIr = readJson<MonsterIntakeIR>(join(creaturePath, 'intake-ir.json'));
    const decidedIr = anchorIrEvidence(source, candidate, applyDecisions(oldIr, byIssue));
    results.push(await processExistingIr(options, provider, runPath, candidate, decidedIr));
  }
  const status = aggregateStatus(results);
  Object.assign(manifest, { status, creatures: results, completedAt: new Date().toISOString() });
  writeJson(join(runPath, 'manifest.json'), manifest);
  writeDecisionTemplate(runPath, manifest);
  return { runId: manifest.runId, sourceSha256: manifest.sourceSha256, runPath, status, creatures: results, discoveryCount: discovery.candidates.length };
}

async function processCandidate(
  options: MonsterIntakeOptions,
  provider: MonsterIntakeAiProvider,
  runPath: string,
  sourceSha256: string,
  candidate: DiscoveryCandidate,
): Promise<MonsterIntakeCreatureResult> {
  const bundlePath = join(runPath, 'creatures', safeId(candidate.id));
  mkdirSync(bundlePath, { recursive: true });
  const calls = { extraction: 1, review: 0, repair: 0 };
  try {
    const ir = anchorIrEvidence(options.source, candidate, await provider.extract({ source: options.source, sourceSha256, candidate }));
    return await processIr(options, provider, runPath, candidate, ir, calls);
  } catch (error) {
    const finding = providerFinding(error);
    writeJson(join(bundlePath, 'deterministic-report.json'), { schemaVersion: 1, status: 'failed', findings: [finding] });
    return {
      id: candidate.id,
      label: candidate.label,
      status: 'failed',
      bundlePath,
      findings: [finding],
      calls,
      spellResolution: { required: false, status: 'failed', spellCount: 0 },
    };
  }
}

async function processExistingIr(
  options: MonsterIntakeOptions,
  provider: MonsterIntakeAiProvider,
  runPath: string,
  candidate: DiscoveryCandidate,
  ir: MonsterIntakeIR,
): Promise<MonsterIntakeCreatureResult> {
  return processIr(options, provider, runPath, candidate, ir, { extraction: 0, review: 0, repair: 0 });
}

async function processIr(
  options: MonsterIntakeOptions,
  provider: MonsterIntakeAiProvider,
  runPath: string,
  candidate: DiscoveryCandidate,
  initialIr: MonsterIntakeIR,
  calls: { extraction: number; review: number; repair: number },
): Promise<MonsterIntakeCreatureResult> {
  const bundlePath = join(runPath, 'creatures', safeId(candidate.id));
  mkdirSync(bundlePath, { recursive: true });
  let ir = initialIr;
  for (let pass = 0; pass < 2; pass++) {
    writeJson(join(bundlePath, 'intake-ir.json'), ir);
    const validation = validateMonsterIntakeIR(options.source, ir, { coverageRange: candidate });
    if (validation.blocking.length > 0) {
      const spellResolution = spellResolutionFromIr(ir, 'needs_review', bundlePath);
      writeReports(bundlePath, { schemaVersion: 1, status: 'needs_review', findings: validation.findings, projection: {}, spellResolution });
      return result(candidate, bundlePath, 'needs_review', validation.findings, calls, spellResolution);
    }
    const markdown = renderMonsterIntakeMarkdown(ir);
    writeFileSync(join(bundlePath, 'standard.md'), markdown);
    const candidateActorPath = join(bundlePath, 'candidate-actor.json');
    const generated = await convertMarkdownContentToJson({
      content: markdown, sourcePath: join(bundlePath, 'standard.md'), outputPath: candidateActorPath,
      fvttVersion: options.fvttVersion ?? '12', effectProfile: options.effectProfile ?? 'core', translationService: null,
    });
    const report = verifyMonsterIntake(options.source, ir, markdown, generated.rawJson, candidate);
    writeReports(bundlePath, report);
    calls.review += 1;
    const review = await provider.review({ source: options.source, ir, markdown, actorProjection: report.projection, deterministicFindings: report.findings });
    writeJson(join(bundlePath, 'ai-review.json'), review);
    const combined = combineFindings(report.findings, review);
    if (review.verdict === 'revise' && pass === 0) {
      calls.repair += 1;
      ir = anchorIrEvidence(options.source, candidate, await provider.repair({ source: options.source, ir, markdown, actorProjection: report.projection, deterministicFindings: report.findings, review }));
      continue;
    }
    if (review.verdict !== 'accepted' || combined.some((finding) => finding.blocking)) {
      return result(candidate, bundlePath, 'needs_review', combined, calls, withSpellStatus(report.spellResolution, 'needs_review', bundlePath));
    }
    const promoted = await promoteAccepted(options, runPath, candidate, ir, markdown);
    if (promoted.findings.length > 0) {
      return result(candidate, bundlePath, 'needs_review', promoted.findings, calls, withSpellStatus(report.spellResolution, 'needs_review', bundlePath));
    }
    copyFileSync(promoted.actorPath, join(bundlePath, 'actor.json'));
    return {
      ...result(candidate, bundlePath, 'accepted', [], calls, withSpellStatus(report.spellResolution, report.spellResolution.status, bundlePath)),
      markdownPath: promoted.markdownPath,
      actorPath: promoted.actorPath,
    };
  }
  return result(candidate, bundlePath, 'needs_review', [{
    id: 'repair-limit', code: 'REPAIR_LIMIT', path: '/', message: 'One automatic semantic repair did not produce an accepted result.', blocking: true, origin: 'ai-review',
  }], calls, spellResolutionFromIr(ir, 'needs_review', bundlePath));
}

async function promoteAccepted(
  options: MonsterIntakeOptions,
  runPath: string,
  candidate: DiscoveryCandidate,
  ir: MonsterIntakeIR,
  markdown: string,
): Promise<{ markdownPath: string; actorPath: string; findings: IntakeFinding[] }> {
  const vault = resolve(options.vaultPath ?? 'obsidian/dnd数据转fvttjson');
  const slug = slugify(ir.creature.identity.englishName ?? ir.creature.identity.name, candidate.id);
  const markdownPath = join(vault, 'input', `${slug}.md`);
  const actorPath = join(vault, 'output', `${slug}.json`);
  const sameMarkdown = existsSync(markdownPath) && readFileSync(markdownPath, 'utf-8') === markdown;
  if (sameMarkdown && existsSync(actorPath) && !options.replaceConflicts?.has(candidate.id)) {
    return { markdownPath, actorPath, findings: [] };
  }
  const conflict = [
    existingConflict(markdownPath, markdown),
  ].filter(Boolean) as string[];
  if (existsSync(actorPath) && !options.replaceConflicts?.has(candidate.id)) conflict.push(actorPath);
  if (conflict.length > 0 && !options.replaceConflicts?.has(candidate.id)) {
    return {
      markdownPath, actorPath,
      findings: [{ id: `target-conflict:${candidate.id}`, code: 'TARGET_CONFLICT', path: '/promotion', message: `Target file content conflicts: ${conflict.join(', ')}`, blocking: true, origin: 'conflict', candidates: ['replace', 'keep-existing'] }],
    };
  }
  mkdirSync(dirname(markdownPath), { recursive: true });
  mkdirSync(dirname(actorPath), { recursive: true });
  if (options.replaceConflicts?.has(candidate.id)) {
    const backupDir = join(runPath, 'backups', candidate.id);
    mkdirSync(backupDir, { recursive: true });
    if (existsSync(markdownPath)) copyFileSync(markdownPath, join(backupDir, basename(markdownPath)));
    if (existsSync(actorPath)) copyFileSync(actorPath, join(backupDir, basename(actorPath)));
  }
  atomicWrite(markdownPath, markdown);
  await convertMarkdownContentToJson({ content: markdown, sourcePath: markdownPath, outputPath: actorPath, fvttVersion: options.fvttVersion ?? '12', effectProfile: options.effectProfile ?? 'core', translationService: null });
  return { markdownPath, actorPath, findings: [] };
}

function applyDecisions(ir: MonsterIntakeIR, decisions: Map<string, IntakeDecision>): MonsterIntakeIR {
  const next = structuredClone(ir);
  for (const uncertainty of ir.uncertainties) {
    const decision = decisions.get(uncertainty.id);
    if (!decision) continue;
    if (decision.action === 'exclude') {
      if (isRequiredPath(uncertainty.path)) throw new Error(`Required core field cannot be excluded: ${uncertainty.path}`);
      next.uncertainties = next.uncertainties.filter((value) => value.id !== uncertainty.id);
      continue;
    }
    const value = decision.action === 'select' && typeof decision.value === 'number'
      ? uncertainty.candidates?.[decision.value]
      : decision.value;
    if (decision.action !== 'preserve-literal' && value === undefined) throw new Error(`Decision ${uncertainty.id} requires a value.`);
    if (value !== undefined) setJsonPointer(next, uncertainty.path, value);
    next.claims.push({ path: uncertainty.path, valueKind: 'user-confirmed', evidence: uncertainty.evidence, confidence: 'high', value, decisionId: uncertainty.id });
    next.uncertainties = next.uncertainties.filter((item) => item.id !== uncertainty.id);
  }
  return next;
}

export function normalizeDiscovery(source: string, candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const valid = candidates.map((candidate, index) => {
    const offsetsValid = Number.isInteger(candidate.start)
      && Number.isInteger(candidate.end)
      && candidate.start >= 0
      && candidate.end > candidate.start
      && candidate.end <= source.length;
    let start = candidate.start;
    let end = candidate.end;
    if (!offsetsValid || source.slice(start, end) !== candidate.quote) {
      const first = typeof candidate.quote === 'string' && candidate.quote.length > 0
        ? source.indexOf(candidate.quote)
        : -1;
      const unique = first >= 0 && source.indexOf(candidate.quote, first + 1) < 0;
      if (!unique) {
        if (!offsetsValid) throw new Error(`Discovery candidate ${index} has invalid source offsets.`);
        throw new Error(`Discovery candidate ${index} quote does not match source offsets and cannot be uniquely anchored.`);
      }
      start = first;
      end = first + candidate.quote.length;
    }
    if (end - start > INTAKE_LIMITS.maxCandidateLength) throw new Error(`Discovery candidate ${index} exceeds ${INTAKE_LIMITS.maxCandidateLength} characters.`);
    return { ...candidate, start, end, id: safeId(candidate.id || `monster-${index + 1}`), label: candidate.label || `Monster ${index + 1}` };
  }).sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: DiscoveryCandidate[] = [];
  for (const candidate of valid) {
    const previous = merged.at(-1);
    if (previous && candidate.start < previous.end) {
      const overlap = previous.end - candidate.start;
      const ratio = overlap / Math.min(previous.end - previous.start, candidate.end - candidate.start);
      if (ratio >= 0.5) {
        const start = Math.min(previous.start, candidate.start);
        const end = Math.max(previous.end, candidate.end);
        merged[merged.length - 1] = { ...previous, start, end, quote: source.slice(start, end) };
        continue;
      }
      throw new Error(`Discovery candidates overlap ambiguously: ${previous.label} / ${candidate.label}.`);
    }
    merged.push(candidate);
  }
  return merged;
}

export function chunkSource(source: string): Array<{ start: number; end: number; text: string }> {
  if (source.length <= INTAKE_LIMITS.chunkLength) return [{ start: 0, end: source.length, text: source }];
  const chunks = [];
  const step = INTAKE_LIMITS.chunkLength - INTAKE_LIMITS.chunkOverlap;
  for (let start = 0; start < source.length; start += step) {
    const end = Math.min(source.length, start + INTAKE_LIMITS.chunkLength);
    chunks.push({ start, end, text: source.slice(start, end) });
    if (end === source.length) break;
  }
  return chunks;
}

export function partitionDiscoveryCandidates(source: string, candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  return candidates.map((candidate, index) => {
    const start = index === 0 ? 0 : candidate.start;
    const end = candidates[index + 1]?.start ?? source.length;
    if (end <= start) throw new Error(`Discovery candidate ${index} cannot be assigned a non-empty source partition.`);
    if (end - start > INTAKE_LIMITS.maxCandidateLength) {
      throw new Error(`Discovery candidate ${index} partition exceeds ${INTAKE_LIMITS.maxCandidateLength} characters.`);
    }
    return { ...candidate, start, end, quote: source.slice(start, end) };
  });
}

function validateOptions(options: MonsterIntakeOptions): void {
  if (!options.source.trim()) throw new Error('AI monster intake source is empty.');
  if (options.source.length > INTAKE_LIMITS.maxSourceLength) throw new Error(`AI monster intake source exceeds ${INTAKE_LIMITS.maxSourceLength} characters.`);
  const version = options.fvttVersion ?? '12';
  const profile = options.effectProfile ?? 'core';
  if (!['12', '14'].includes(version)) throw new Error('AI monster intake supports only Foundry v12 and v14.');
  if (!['core', version === '12' ? 'modded-v12' : 'modded-v14'].includes(profile)) throw new Error(`Effect profile ${profile} is not valid for Foundry v${version}.`);
}

function estimateMonsterCount(source: string): number {
  const crLines = source.match(/(?:^|\n)\s*(?:CR|挑战等级)\s*[:：]?\s*(?:\d|1\/)/gi)?.length ?? 0;
  return Math.min(INTAKE_LIMITS.maxCreatures, Math.max(1, crLines));
}

function aggregateStatus(creatures: MonsterIntakeCreatureResult[]): MonsterIntakeRunResult['status'] {
  const failed = creatures.filter((value) => value.status === 'failed').length;
  if (failed === creatures.length) return 'failed';
  if (failed > 0) return 'partial';
  if (creatures.some((value) => value.status === 'needs_review')) return 'needs_review';
  return 'succeeded';
}

function combineFindings(deterministic: IntakeFinding[], review: AiReviewResult): IntakeFinding[] {
  return [...deterministic, ...(Array.isArray(review.findings) ? review.findings.map((finding) => ({ ...finding, origin: 'ai-review' as const })) : [])];
}

function result(
  candidate: DiscoveryCandidate,
  bundlePath: string,
  status: MonsterIntakeCreatureResult['status'],
  findings: IntakeFinding[],
  calls: MonsterIntakeCreatureResult['calls'],
  spellResolution: PortableSpellResolutionStatus,
): MonsterIntakeCreatureResult {
  return { id: candidate.id, label: candidate.label, status, bundlePath, findings, calls, spellResolution };
}

function spellResolutionFromIr(
  ir: MonsterIntakeIR,
  status: PortableSpellResolutionStatus['status'],
  bundlePath: string,
): PortableSpellResolutionStatus {
  const groups: unknown[] = Array.isArray(ir.creature.spellcasting) ? ir.creature.spellcasting : [];
  const spellCount = groups.reduce<number>((count, group) => {
    if (!group || typeof group !== 'object' || !Array.isArray((group as { usageGroups?: unknown }).usageGroups)) return count;
    return count + (group as { usageGroups: unknown[] }).usageGroups.reduce<number>((usageCount, usage) => {
      if (!usage || typeof usage !== 'object' || !Array.isArray((usage as { spellRefs?: unknown }).spellRefs)) return usageCount;
      return usageCount + (usage as { spellRefs: unknown[] }).spellRefs.length;
    }, 0);
  }, 0);
  if (groups.length === 0) return { required: false, status: status === 'failed' ? 'failed' : 'not-required', spellCount: 0 };
  return { required: true, status, spellCount, reportPath: join(bundlePath, 'deterministic-report.md') };
}

function withSpellStatus(
  resolution: PortableSpellResolutionStatus,
  status: PortableSpellResolutionStatus['status'],
  bundlePath: string,
): PortableSpellResolutionStatus {
  if (!resolution.required) return resolution;
  return { ...resolution, status, reportPath: join(bundlePath, 'deterministic-report.md') };
}

function writeReports(bundlePath: string, report: Parameters<typeof renderIntakeVerificationMarkdown>[0]): void {
  writeJson(join(bundlePath, 'deterministic-report.json'), report);
  writeFileSync(join(bundlePath, 'deterministic-report.md'), renderIntakeVerificationMarkdown(report));
}

function writeDecisionTemplate(runPath: string, manifest: Manifest): void {
  const issues = manifest.creatures.flatMap((creature) => creature.findings.filter((finding) => finding.blocking).map((finding) => ({ issueId: finding.id, action: 'select', value: finding.code === 'TARGET_CONFLICT' ? 'replace' : undefined, note: '' })));
  writeJson(join(runPath, 'decisions.template.json'), { runId: manifest.runId, sourceSha256: manifest.sourceSha256, decisions: issues });
}

function existingConflict(path: string, expected: string): string | undefined {
  return existsSync(path) && readFileSync(path, 'utf-8') !== expected ? path : undefined;
}

function providerFinding(error: unknown): IntakeFinding {
  return { id: 'provider-failure', code: 'PROVIDER_FAILURE', path: '/', message: error instanceof Error ? error.message : String(error), blocking: true, origin: 'provider' };
}

function isRequiredPath(path: string): boolean {
  return ['/creature/identity/name', '/creature/identity/size', '/creature/identity/creatureType', '/creature/attributes/ac', '/creature/attributes/hp', '/creature/attributes/movement', '/creature/attributes/cr', '/creature/abilities'].some((required) => path === required || path.startsWith(`${required}/`));
}

function setJsonPointer(target: unknown, pointer: string, value: unknown): void {
  const parts = pointer.split('/').slice(1).map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cursor = target as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!next || typeof next !== 'object') throw new Error(`Decision path does not exist: ${pointer}`);
    cursor = next as Record<string, unknown>;
  }
  cursor[parts.at(-1)!] = value;
}

export function anchorIrEvidence(source: string, candidate: DiscoveryCandidate, ir: MonsterIntakeIR): MonsterIntakeIR {
  const next = structuredClone(ir);
  normalizeModelIr(next);
  const refs = [
    ...next.claims.flatMap((claim) => claim.evidence),
    ...next.coverage,
    ...next.uncertainties.flatMap((uncertainty) => uncertainty.evidence),
  ];
  for (const ref of refs) {
    if (Number.isInteger(ref.start) && Number.isInteger(ref.end) && source.slice(ref.start, ref.end) === ref.quote) continue;
    if (!ref.quote) continue;
    const local = source.slice(candidate.start, candidate.end);
    const offsets: number[] = [];
    for (let offset = local.indexOf(ref.quote); offset >= 0; offset = local.indexOf(ref.quote, offset + 1)) {
      offsets.push(candidate.start + offset);
    }
    if (offsets.length === 0) continue;
    const ranked = offsets
      .map((offset) => ({ offset, distance: Math.abs(offset - ref.start) }))
      .sort((left, right) => left.distance - right.distance || left.offset - right.offset);
    const nearest = ranked[0]!;
    const nextNearest = ranked[1];
    const unambiguous = ranked.length === 1
      || (ref.quote.length >= 8
        && nextNearest !== undefined
        && nearest.distance < nextNearest.distance
        && nextNearest.distance - nearest.distance >= Math.max(4, Math.ceil(ref.quote.length / 2)));
    if (!unambiguous) continue;
    ref.start = nearest.offset;
    ref.end = ref.start + ref.quote.length;
  }
  next.coverage = next.coverage.filter((entry) => (
    source.slice(entry.start, entry.end) === entry.quote || /\S/u.test(entry.quote)
  ));
  return next;
}

function normalizeModelIr(ir: MonsterIntakeIR): void {
  const attributes = ir.creature.attributes as MonsterIntakeIR['creature']['attributes'] & { acKind?: unknown; initiative?: number | null };
  if (typeof attributes.acKind === 'string' && !['flat', 'natural', 'default'].includes(attributes.acKind)) {
    attributes.acNote = attributes.acNote?.trim() || attributes.acKind;
    delete attributes.acKind;
  }
  if (attributes.initiative === null) delete attributes.initiative;
  ir.creature.languages.values = ir.creature.languages.values.map(normalizeLanguageValue);
  for (const section of ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions'] as const) {
    for (const feature of ir.creature[section]) {
      const overloadedActivityType = String(feature.activityType);
      if (['action', 'bonus', 'reaction', 'legendary', 'special'].includes(overloadedActivityType)) {
        feature.activationType = overloadedActivityType as NonNullable<typeof feature.activationType>;
        feature.activityType = undefined;
      }
      if (!['attack', 'save', 'damage', 'utility'].includes(String(feature.activityType))) {
        feature.activityType = feature.attack ? 'attack' : feature.save ? 'save' : feature.damage?.length ? 'damage' : 'utility';
      }
      for (const damage of feature.damage ?? []) damage.type = normalizeDamageValue(damage.type);
    }
  }
}

function normalizeLanguageValue(value: string): string {
  return ({ 通用语: 'common', 矮人语: 'dwarvish', 精灵语: 'elvish', 巨人语: 'giant', 地精语: 'goblin' } as Record<string, string>)[value]
    ?? value.toLowerCase();
}

function normalizeDamageValue(value: string): string {
  return ({ 强酸: 'acid', 钝击: 'bludgeoning', 冷冻: 'cold', 火焰: 'fire', 力场: 'force', 闪电: 'lightning', 黯蚀: 'necrotic', 穿刺: 'piercing', 毒素: 'poison', 心灵: 'psychic', 光耀: 'radiant', 挥砍: 'slashing', 雷鸣: 'thunder' } as Record<string, string>)[value]
    ?? value.toLowerCase();
}

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]!);
    }
  }));
  return results;
}

function createRunId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
}

function safeId(value: string): string {
  const safe = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || randomUUID().slice(0, 8);
}

function slugify(value: string, fallback: string): string {
  const slug = value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || safeId(fallback);
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function writeJson(path: string, value: unknown): void { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2)); }
function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, 'utf-8')) as T; }
function atomicWrite(path: string, content: string): void { const temp = `${path}.tmp-${randomUUID()}`; writeFileSync(temp, content); renameSync(temp, path); }

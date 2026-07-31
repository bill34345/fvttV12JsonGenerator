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
  EvidenceRef,
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
  iconMode?: 'off' | 'safe';
  iconOverridePath?: string;
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
    iconMode: options.iconOptions?.mode ?? 'off',
    ...(options.iconOptions?.overridePath ? { iconOverridePath: options.iconOptions.overridePath } : {}),
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
    iconOptions: {
      mode: manifest.iconMode ?? 'off',
      ...(manifest.iconOverridePath ? { overridePath: manifest.iconOverridePath } : {}),
    },
  };
  const results: MonsterIntakeCreatureResult[] = [];
  for (const candidate of discovery.candidates) {
    const creaturePath = join(runPath, 'creatures', safeId(candidate.id));
    const oldIr = readJson<MonsterIntakeIR>(join(creaturePath, 'intake-ir.json'));
    // Refresh provider-owned evidence and source-proven normalizations first. User decisions are
    // applied afterward and then protected from canonical rewrites by the conservative pass.
    const refreshedIr = anchorIrEvidence(source, candidate, oldIr);
    const decidedIr = anchorIrEvidence(source, candidate, applyDecisions(refreshedIr, byIssue), {
      canonicalizeModelSpellEvidence: false,
      normalizeAbsentOptionalZeroes: false,
      removeDisprovedProcessUncertainties: false,
    });
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
  while (true) {
    writeJson(join(bundlePath, 'intake-ir.json'), ir);
    const validation = validateMonsterIntakeIR(options.source, ir, { coverageRange: candidate });
    if (validation.blocking.length > 0) {
      if (calls.extraction === 1 && calls.repair === 0) {
        calls.repair += 1;
        ir = anchorIrEvidence(options.source, candidate, await provider.repair({
          stage: 'deterministic-validation',
          source: options.source,
          ir,
          deterministicFindings: validation.findings,
        }));
        continue;
      }
      const spellResolution = spellResolutionForFindings(
        spellResolutionFromIr(ir, 'pending', bundlePath),
        validation.findings,
        bundlePath,
      );
      writeReports(bundlePath, { schemaVersion: 1, status: 'needs_review', findings: validation.findings, projection: {}, spellResolution });
      return result(candidate, bundlePath, 'needs_review', validation.findings, calls, spellResolution);
    }
    const markdown = renderMonsterIntakeMarkdown(ir);
    writeFileSync(join(bundlePath, 'standard.md'), markdown);
    const candidateActorPath = join(bundlePath, 'candidate-actor.json');
    const generated = await convertMarkdownContentToJson({
      content: markdown, sourcePath: join(bundlePath, 'standard.md'), outputPath: candidateActorPath,
      fvttVersion: options.fvttVersion ?? '12', effectProfile: options.effectProfile ?? 'core', translationService: null,
      iconOptions: options.iconOptions,
    });
    const report = verifyMonsterIntake(options.source, ir, markdown, generated.rawJson, candidate);
    writeReports(bundlePath, report);
    calls.review += 1;
    const rawReview = await provider.review({ source: options.source, ir, markdown, actorProjection: report.projection, deterministicFindings: report.findings });
    writeJson(join(bundlePath, 'ai-review.raw.json'), rawReview);
    const review = adjudicateReview(options.source, candidate, ir, report.projection, rawReview);
    writeJson(join(bundlePath, 'ai-review.json'), review);
    const combined = combineFindings(report.findings, review);
    if (review.verdict === 'revise' && calls.extraction === 1 && calls.repair === 0) {
      calls.repair += 1;
      ir = anchorIrEvidence(options.source, candidate, await provider.repair({
        stage: 'semantic-review',
        source: options.source,
        ir,
        markdown,
        actorProjection: report.projection,
        deterministicFindings: report.findings,
        review,
      }));
      continue;
    }
    if (review.verdict !== 'accepted' || combined.some((finding) => finding.blocking)) {
      return result(
        candidate,
        bundlePath,
        'needs_review',
        combined,
        calls,
        spellResolutionForFindings(report.spellResolution, combined, bundlePath),
      );
    }
    const promoted = await promoteAccepted(options, runPath, candidate, ir, markdown, generated.rawJson);
    if (promoted.findings.length > 0) {
      return result(candidate, bundlePath, 'needs_review', promoted.findings, calls, withReportPath(report.spellResolution, bundlePath));
    }
    copyFileSync(promoted.actorPath, join(bundlePath, 'actor.json'));
    return {
      ...result(candidate, bundlePath, 'accepted', [], calls, withReportPath(report.spellResolution, bundlePath)),
      markdownPath: promoted.markdownPath,
      actorPath: promoted.actorPath,
    };
  }
}

async function promoteAccepted(
  options: MonsterIntakeOptions,
  runPath: string,
  candidate: DiscoveryCandidate,
  ir: MonsterIntakeIR,
  markdown: string,
  generatedActor: unknown,
): Promise<{ markdownPath: string; actorPath: string; findings: IntakeFinding[] }> {
  const vault = resolve(options.vaultPath ?? 'obsidian/dnd数据转fvttjson');
  const slug = slugify(ir.creature.identity.englishName ?? ir.creature.identity.name, candidate.id);
  const markdownPath = join(vault, 'input', `${slug}.md`);
  const actorPath = join(vault, 'output', `${slug}.json`);
  const sameMarkdown = existsSync(markdownPath) && readFileSync(markdownPath, 'utf-8') === markdown;
  if (sameMarkdown && existsSync(actorPath) && !options.replaceConflicts?.has(candidate.id)) {
    try {
      const existingActor = JSON.parse(readFileSync(actorPath, 'utf-8')) as unknown;
      const existingReport = verifyMonsterIntake(options.source, ir, markdown, existingActor, candidate);
      if (existingReport.status === 'accepted') {
        const difference = firstPromotionDifference(existingActor, generatedActor);
        if (!difference) return { markdownPath, actorPath, findings: [] };
        return {
          markdownPath,
          actorPath,
          findings: [{
            id: `target-conflict:${candidate.id}`,
            code: 'TARGET_CONFLICT',
            path: '/promotion',
            message: `Existing Actor differs from this run's canonical generated Actor at ${difference}: ${actorPath}`,
            blocking: true,
            origin: 'conflict',
            candidates: ['replace', 'keep-existing'],
          }],
        };
      }
      return {
        markdownPath,
        actorPath,
        findings: [{
          id: `target-conflict:${candidate.id}`,
          code: 'TARGET_CONFLICT',
          path: '/promotion',
          message: `Existing Actor is not the exact portable project output (${existingReport.findings.map((finding) => finding.code).join(', ')}): ${actorPath}`,
          blocking: true,
          origin: 'conflict',
          candidates: ['replace', 'keep-existing'],
        }],
      };
    } catch (error) {
      return {
        markdownPath,
        actorPath,
        findings: [{
          id: `target-conflict:${candidate.id}`,
          code: 'TARGET_CONFLICT',
          path: '/promotion',
          message: `Existing Actor cannot be verified as portable project output (${error instanceof Error ? error.message : String(error)}): ${actorPath}`,
          blocking: true,
          origin: 'conflict',
          candidates: ['replace', 'keep-existing'],
        }],
      };
    }
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
  await convertMarkdownContentToJson({ content: markdown, sourcePath: markdownPath, outputPath: actorPath, fvttVersion: options.fvttVersion ?? '12', effectProfile: options.effectProfile ?? 'core', translationService: null, iconOptions: options.iconOptions });
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

export function adjudicateReview(
  source: string,
  candidate: DiscoveryCandidate,
  ir: MonsterIntakeIR,
  projection: Record<string, unknown>,
  review: AiReviewResult,
): AiReviewResult {
  const findings = review.findings.filter((finding) => !(
    isDisprovedDuplicateSpellcastingFinding(ir, projection, finding)
    || isDisprovedSpellcastingDescriptionFinding(ir, projection, finding)
    || isDisprovedComponentWaiverFinding(source, candidate, ir, finding)
    || isDisprovedSkillLabelFinding(ir, projection, finding)
    || isDisprovedAcNoteFormatFinding(ir, projection, finding)
    || isDisprovedUsageEvidenceFinding(source, ir, finding)
    || isOutsideCandidateFinding(source, candidate, ir, finding)
  ));
  return {
    ...review,
    verdict: findings.some((finding) => finding.blocking) ? review.verdict : 'accepted',
    findings,
  };
}

function isDisprovedAcNoteFormatFinding(
  ir: MonsterIntakeIR,
  projection: Record<string, unknown>,
  finding: AiReviewResult['findings'][number],
): boolean {
  if (finding.code !== 'MARKDOWN_FRONTMATTER_ACNOTE_FORMAT' || !ir.creature.attributes.acNote?.trim()) return false;
  const note = ir.creature.attributes.acNote.trim();
  const literalNote = /^[（(]/u.test(note) ? note : `（${note}）`;
  return String(projection.biography ?? '').includes(`护甲等级：${ir.creature.attributes.ac}${literalNote}`);
}

function isDisprovedComponentWaiverFinding(
  source: string,
  candidate: DiscoveryCandidate,
  ir: MonsterIntakeIR,
  finding: AiReviewResult['findings'][number],
): boolean {
  if (finding.code.toUpperCase() !== 'SPELL_COMPONENT_WAIVER_LOST') return false;
  const groupIndex = finding.path.match(/^\/creature\/spellcasting\/(\d+)\/componentWaivers$/u)?.[1];
  const group = groupIndex === undefined ? undefined : ir.creature.spellcasting?.[Number(groupIndex)];
  if (!group || group.componentWaivers.length > 0) return false;
  const candidateSource = source.slice(candidate.start, candidate.end);
  return !textStatesMaterialWaiver(candidateSource) && !textStatesMaterialWaiver(group.description);
}

function isDisprovedSkillLabelFinding(
  ir: MonsterIntakeIR,
  projection: Record<string, unknown>,
  finding: AiReviewResult['findings'][number],
): boolean {
  if (finding.code !== 'MARKDOWN_SKILL_DRIFT') return false;
  const projected = asRecord(projection.skills) ?? {};
  return Object.entries(ir.creature.skills).every(([skill, total]) => projected[skill] === total)
    && Object.keys(projected).every((skill) => ir.creature.skills[skill] === projected[skill]);
}

function textStatesMaterialWaiver(value: string): boolean {
  const text = value.normalize('NFKC').toLocaleLowerCase('en-US');
  return /(?:without|requires?\s+no|requiring\s+no)\s+material\s+components?/iu.test(text)
    || /(?:无需|不需|不需要)\s*(?:任何|任意|全部|所有)?\s*(?:(?:材料|法术)成分|构材)/u.test(text);
}

function isDisprovedSpellcastingDescriptionFinding(
  ir: MonsterIntakeIR,
  projection: Record<string, unknown>,
  finding: AiReviewResult['findings'][number],
): boolean {
  if (finding.code !== 'ACTOR_SPELLCASTING_DESCRIPTION_DRIFT') return false;
  const items = Array.isArray(projection.items) ? projection.items : [];
  return (ir.creature.spellcasting ?? []).every((group) => items.some((value) => {
    const item = asRecord(value) ?? {};
    const name = String(item.name ?? '');
    return (name.includes(group.featureName)
      || (group.featureEnglishName !== undefined && name.includes(group.featureEnglishName)))
      && item.description === group.description;
  }));
}

function isOutsideCandidateFinding(
  source: string,
  candidate: DiscoveryCandidate,
  ir: MonsterIntakeIR,
  finding: AiReviewResult['findings'][number],
): boolean {
  const evidence = finding.evidence ?? [];
  if (evidence.length > 0 && evidence.every((ref) => ref.end <= candidate.start || ref.start >= candidate.end)) return true;
  if (finding.code !== 'UNCOVERED_SOURCE_ENTRY' || (candidate.start === 0 && candidate.end === source.length)) return false;
  if (evidence.some((ref) => ref.start < candidate.end && ref.end > candidate.start)) return false;
  const ordered = [...ir.coverage].sort((left, right) => left.start - right.start || left.end - right.end);
  return ordered.length > 0
    && ordered[0]!.start === candidate.start
    && ordered.at(-1)!.end === candidate.end
    && ordered.every((entry, index) => source.slice(entry.start, entry.end) === entry.quote
      && (index === 0 || ordered[index - 1]!.end === entry.start));
}

function isDisprovedDuplicateSpellcastingFinding(
  ir: MonsterIntakeIR,
  projection: Record<string, unknown>,
  finding: AiReviewResult['findings'][number],
): boolean {
  const code = finding.code.toUpperCase();
  if (!code.startsWith('DUPLICATE_SPELLCASTING_')
    && code !== 'SPELL_GROUP_DUPLICATED_AS_TRAIT'
    && code !== 'SPELLCASTING_GROUP_DUPLICATED_AS_TRAIT') return false;
  const groups = ir.creature.spellcasting ?? [];
  if (groups.length === 0) return false;
  if (groups.some((group) => ir.creature.traits.some((trait) => (
    trait.description === group.description
    || trait.name === group.featureName
    || (group.featureEnglishName !== undefined && trait.englishName === group.featureEnglishName)
  )))) return false;
  const items = Array.isArray(projection.items) ? projection.items : [];
  return groups.every((group) => items.filter((value) => {
    const item = asRecord(value) ?? {};
    const name = String(item.name ?? '');
    return name.includes(group.featureName)
      || (group.featureEnglishName !== undefined && name.includes(group.featureEnglishName));
  }).length === 1);
}

function isDisprovedUsageEvidenceFinding(
  source: string,
  ir: MonsterIntakeIR,
  finding: AiReviewResult['findings'][number],
): boolean {
  if (finding.code !== 'SPELL_USAGE_EVIDENCE_INCOMPLETE') return false;
  const match = finding.path.match(/^\/ir\/creature\/spellcasting\/(\d+)\/usageGroups\/(\d+)$/u);
  if (!match) return false;
  const usage = ir.creature.spellcasting?.[Number(match[1])]?.usageGroups[Number(match[2])];
  if (!usage || usage.evidence.length === 0) return false;
  return usage.evidence.every((grant) => {
    if (source.slice(grant.start, grant.end) !== grant.quote) return false;
    const childEvidence = usage.spellRefs.flatMap((spell) => [
      ...spell.evidence,
      ...spell.restrictions.flatMap((restriction) => restriction.evidence),
    ]);
    if (childEvidence.length === 0 || childEvidence.some((ref) => (
      source.slice(ref.start, ref.end) !== ref.quote || ref.start < grant.start || ref.end > grant.end
    ))) return false;
    const lineEnd = source.indexOf('\n', grant.end);
    const trailing = source.slice(grant.end, lineEnd < 0 ? source.length : lineEnd);
    return !/\S/u.test(trailing);
  });
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

function spellResolutionForFindings(
  base: PortableSpellResolutionStatus,
  findings: IntakeFinding[],
  bundlePath: string,
): PortableSpellResolutionStatus {
  if (!base.required || base.status === 'failed') return withReportPath(base, bundlePath);
  const needsReview = findings.some((finding) => finding.blocking && isSpellSpecificFinding(finding));
  return withReportPath({ ...base, status: needsReview ? 'needs_review' : 'pending' }, bundlePath);
}

function isSpellSpecificFinding(finding: IntakeFinding): boolean {
  if (finding.path === '/creature/spellcasting' || finding.path.startsWith('/creature/spellcasting/')) return true;
  if (finding.path.startsWith(`/actor/flags/fvtt-json-generator-spell-resolver/`)) return true;
  return /^(?:SPELL_|PORTABLE_SPELL_|PORTABLE_ACTOR_(?:EMBEDDED_SPELL|CAST_ACTIVITY|MANAGED_ACTIVITY)|PREMATURE_SPELL_|RENDERED_SPELL_|FORBIDDEN_TARGET_WORLD_IDENTIFIER)/u.test(finding.code);
}

function withReportPath(
  resolution: PortableSpellResolutionStatus,
  bundlePath: string,
): PortableSpellResolutionStatus {
  if (!resolution.required) return resolution;
  return { ...resolution, reportPath: join(bundlePath, 'deterministic-report.md') };
}

function writeReports(bundlePath: string, report: Parameters<typeof renderIntakeVerificationMarkdown>[0]): void {
  const { reportPath: _reportPath, ...spellResolution } = report.spellResolution;
  const portableReport = { ...report, spellResolution };
  writeJson(join(bundlePath, 'deterministic-report.json'), portableReport);
  writeFileSync(join(bundlePath, 'deterministic-report.md'), renderIntakeVerificationMarkdown(portableReport));
}

function writeDecisionTemplate(runPath: string, manifest: Manifest): void {
  const issues = manifest.creatures.flatMap((creature) => creature.findings.filter((finding) => finding.blocking).map((finding) => ({ issueId: finding.id, action: 'select', value: finding.code === 'TARGET_CONFLICT' ? 'replace' : undefined, note: '' })));
  writeJson(join(runPath, 'decisions.template.json'), { runId: manifest.runId, sourceSha256: manifest.sourceSha256, decisions: issues });
}

function existingConflict(path: string, expected: string): string | undefined {
  return existsSync(path) && readFileSync(path, 'utf-8') !== expected ? path : undefined;
}

// Exhaustive published-output comparison. The only ignored data is generated afresh by
// the project workflow: Actor timestamps, generated activity map IDs, and generated
// Active Effect IDs. Item order and every semantic field remain part of the comparison.
function promotionProjection(value: unknown, path = ''): unknown {
  if (Array.isArray(value)) return value.map((entry, index) => promotionProjection(entry, `${path}/${index}`));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (path.endsWith('/system/activities')) {
    return Object.values(record)
      .map((activity, index) => promotionProjection(activity, `${path}/<activity-${index}>`))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  return Object.fromEntries(Object.keys(record).sort().flatMap((key) => {
    const childPath = `${path}/${key}`;
    if (path.endsWith('/_stats') && (key === 'createdTime' || key === 'modifiedTime')) return [];
    if (key === '_id' && (
      /\/system\/activities\/<activity-\d+>$/u.test(path)
      || /\/system\/activities\/<activity-\d+>\/effects\/\d+$/u.test(path)
      || /\/items\/\d+\/effects\/\d+$/u.test(path)
    )) return [];
    return [[key, promotionProjection(record[key], childPath)]];
  }));
}

function firstPromotionDifference(existing: unknown, generated: unknown): string | undefined {
  const left = promotionProjection(existing);
  const right = promotionProjection(generated);
  return firstCanonicalDifference(left, right, '') ?? undefined;
}

function firstCanonicalDifference(left: unknown, right: unknown, path: string): string | null {
  if (Object.is(left, right)) return null;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return path || '/';
    for (let index = 0; index < left.length; index += 1) {
      const difference = firstCanonicalDifference(left[index], right[index], `${path}/${index}`);
      if (difference) return difference;
    }
    return null;
  }
  if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
    for (const key of keys) {
      if (!(key in leftRecord) || !(key in rightRecord)) return `${path}/${key}` || '/';
      const difference = firstCanonicalDifference(leftRecord[key], rightRecord[key], `${path}/${key}`);
      if (difference) return difference;
    }
    return null;
  }
  return path || '/';
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

export function anchorIrEvidence(
  source: string,
  candidate: DiscoveryCandidate,
  ir: MonsterIntakeIR,
  options: {
    canonicalizeModelSpellEvidence?: boolean;
    normalizeAbsentOptionalZeroes?: boolean;
    removeDisprovedProcessUncertainties?: boolean;
  } = {},
): MonsterIntakeIR {
  const next = structuredClone(ir);
  // Request-owned bookkeeping is deterministic and must not drift with provider output.
  next.source = { sha256: sha256(source), length: source.length };
  const candidateScope = [{ start: candidate.start, end: candidate.end }];
  for (const ref of collectGeneralEvidenceRefs(next)) anchorEvidenceRef(source, candidateScope, ref);
  normalizeModelIr(next, source, options.normalizeAbsentOptionalZeroes ?? true);
  anchorSpellcastingEvidence(source, candidateScope, next, options.canonicalizeModelSpellEvidence ?? true);
  if (options.removeDisprovedProcessUncertainties ?? true) {
    next.uncertainties = next.uncertainties.filter((uncertainty) => !isDisprovedWholeSourceOffsetUncertainty(
      source,
      candidate,
      next,
      uncertainty,
    ));
  }
  next.coverage = next.coverage.filter((entry) => (
    source.slice(entry.start, entry.end) === entry.quote || /\S/u.test(entry.quote)
  ));
  return next;
}

function isDisprovedWholeSourceOffsetUncertainty(
  source: string,
  candidate: DiscoveryCandidate,
  ir: MonsterIntakeIR,
  uncertainty: MonsterIntakeIR['uncertainties'][number],
): boolean {
  const processText = `${uncertainty.code} ${uncertainty.path} ${uncertainty.message}`;
  const processCoordinateSignature = /(?:utf[ -]?16|(?:source|candidate|evidence|coverage)[\s:_-]*(?:offset|length|range|end|slice)|(?:offset|length|range|end|slice)[\s:_-]*(?:source|candidate|evidence|coverage))/iu;
  if (!processCoordinateSignature.test(processText)) return false;
  if (candidate.start !== 0 || candidate.end !== source.length || candidate.quote !== source) return false;
  if (ir.source?.length !== source.length || ir.source.sha256 !== sha256(source)) return false;
  if (!hasExactCompleteCoverage(source, candidate, ir.coverage)) return false;
  return allEvidenceRefsExact(source, ir);
}

function hasExactCompleteCoverage(
  source: string,
  candidate: DiscoveryCandidate,
  coverage: MonsterIntakeIR['coverage'],
): boolean {
  if (!Array.isArray(coverage) || coverage.length === 0) return false;
  const ordered = [...coverage].sort((left, right) => left.start - right.start || left.end - right.end);
  let cursor = candidate.start;
  for (const entry of ordered) {
    if (!Number.isInteger(entry.start) || !Number.isInteger(entry.end) || entry.start < cursor || entry.end < entry.start) return false;
    if (/\S/u.test(source.slice(cursor, entry.start))) return false;
    if (source.slice(entry.start, entry.end) !== entry.quote) return false;
    cursor = entry.end;
  }
  return !/\S/u.test(source.slice(cursor, candidate.end));
}

function allEvidenceRefsExact(source: string, value: unknown, context = ''): boolean {
  if (context === 'evidence' || context === 'coverage' || /Evidence$/u.test(context)) {
    return Array.isArray(value) && value.length > 0 && value.every((entry) => isExactEvidenceRef(source, entry));
  }
  if (Array.isArray(value)) {
    return value.every((entry) => allEvidenceRefsExact(source, entry));
  }
  if (!value || typeof value !== 'object') return true;
  const record = value as Record<string, unknown>;
  return Object.entries(record).every(([key, entry]) => allEvidenceRefsExact(source, entry, key));
}

function isExactEvidenceRef(source: string, value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  return Number.isInteger(ref.start)
    && Number.isInteger(ref.end)
    && (ref.start as number) >= 0
    && (ref.end as number) >= (ref.start as number)
    && (ref.end as number) <= source.length
    && typeof ref.quote === 'string'
    && ref.quote.length > 0
    && source.slice(ref.start as number, ref.end as number) === ref.quote;
}

interface EvidenceScope {
  start: number;
  end: number;
}

function anchorEvidenceRef(source: string, scopes: EvidenceScope[], ref: EvidenceRef): void {
  if (typeof ref.quote !== 'string' || ref.quote.length === 0) return;
  const exactInsideScope = Number.isInteger(ref.start)
    && Number.isInteger(ref.end)
    && source.slice(ref.start, ref.end) === ref.quote
    && scopes.some((scope) => ref.start >= scope.start && ref.end <= scope.end);
  if (exactInsideScope) return;

  const offsets = new Set<number>();
  for (const scope of scopes) {
    const local = source.slice(scope.start, scope.end);
    for (let offset = local.indexOf(ref.quote); offset >= 0; offset = local.indexOf(ref.quote, offset + 1)) {
      offsets.add(scope.start + offset);
    }
  }
  if (offsets.size === 0) return;
  const hasReportedStart = Number.isInteger(ref.start);
  const ranked = [...offsets]
    .map((offset) => ({ offset, distance: hasReportedStart ? Math.abs(offset - ref.start) : Number.POSITIVE_INFINITY }))
    .sort((left, right) => left.distance - right.distance || left.offset - right.offset);
  const nearest = ranked[0]!;
  const nextNearest = ranked[1];
  const reportedStartMatchesExactOccurrence = hasReportedStart && offsets.has(ref.start);
  const unambiguous = reportedStartMatchesExactOccurrence
    || ranked.length === 1
    || (ref.quote.length >= 8
      && nextNearest !== undefined
      && nearest.distance < nextNearest.distance
      && nextNearest.distance - nearest.distance >= Math.max(4, Math.ceil(ref.quote.length / 2)));
  if (!unambiguous) return;
  ref.start = nearest.offset;
  ref.end = ref.start + ref.quote.length;
}

function anchorSpellcastingEvidence(
  source: string,
  candidateScopes: EvidenceScope[],
  ir: MonsterIntakeIR,
  canonicalizeModelSpellEvidence: boolean,
): void {
  const spellcasting = asRecord(ir.creature)?.spellcasting;
  if (!Array.isArray(spellcasting)) return;
  for (const groupValue of spellcasting) {
    const group = asRecord(groupValue);
    if (!group) continue;
    const groupEvidence = evidenceArray(group.evidence);
    for (const ref of groupEvidence) anchorEvidenceRef(source, candidateScopes, ref);
    const groupScopes = exactEvidenceScopes(source, candidateScopes, groupEvidence);
    for (const ref of evidenceArray(group.abilityEvidence)) anchorEvidenceRef(source, groupScopes, ref);
    for (const ref of evidenceArray(group.casterLevelEvidence)) anchorEvidenceRef(source, groupScopes, ref);
    for (const ref of evidenceArray(group.saveDcEvidence)) anchorEvidenceRef(source, groupScopes, ref);
    for (const ref of evidenceArray(group.attackBonusEvidence)) anchorEvidenceRef(source, groupScopes, ref);
    if (Array.isArray(group.componentWaivers)) {
      for (const waiver of group.componentWaivers) {
        for (const ref of evidenceArray(asRecord(waiver)?.evidence)) anchorEvidenceRef(source, groupScopes, ref);
      }
    }
    if (!Array.isArray(group.usageGroups)) continue;
    for (const usageValue of group.usageGroups) {
      const usage = asRecord(usageValue);
      if (!usage) continue;
      const usageEvidence = evidenceArray(usage.evidence);
      for (const ref of usageEvidence) anchorEvidenceRef(source, groupScopes, ref);
      const usageScopes = exactEvidenceScopes(source, groupScopes, usageEvidence);
      if (canonicalizeModelSpellEvidence && usage.usage === 'prepared-slots') {
        canonicalizePreparedNumericEvidence(source, usageScopes, usage, 'level', 'levelEvidence');
        canonicalizePreparedNumericEvidence(source, usageScopes, usage, 'slots', 'slotsEvidence');
      }
      for (const ref of evidenceArray(usage.levelEvidence)) anchorEvidenceRef(source, usageScopes, ref);
      for (const ref of evidenceArray(usage.slotsEvidence)) anchorEvidenceRef(source, usageScopes, ref);
      if (!Array.isArray(usage.spellRefs)) continue;
      for (const spellValue of usage.spellRefs) {
        const spell = asRecord(spellValue);
        if (!spell) continue;
        const spellCanonicalization = canonicalizeModelSpellEvidence
          ? canonicalizeEvidenceFromLiteral(source, usageScopes, spell, 'originalName')
          : 'unavailable';
        if (spellCanonicalization !== 'ambiguous') {
          for (const ref of evidenceArray(spell.evidence)) anchorEvidenceRef(source, usageScopes, ref);
        }
        if (!Array.isArray(spell.restrictions)) continue;
        for (const restriction of spell.restrictions) {
          const restrictionRecord = asRecord(restriction);
          if (!restrictionRecord) continue;
          const restrictionCanonicalization = canonicalizeModelSpellEvidence
            ? canonicalizeEvidenceFromLiteral(source, usageScopes, restrictionRecord, 'text')
            : 'unavailable';
          if (restrictionCanonicalization !== 'ambiguous') {
            for (const ref of evidenceArray(restrictionRecord.evidence)) anchorEvidenceRef(source, usageScopes, ref);
          }
        }
      }
    }
  }
}

function canonicalizePreparedNumericEvidence(
  source: string,
  scopes: EvidenceScope[],
  usage: Record<string, unknown>,
  valueKey: 'level' | 'slots',
  evidenceKey: 'levelEvidence' | 'slotsEvidence',
): void {
  const value = usage[valueKey];
  if (!Number.isInteger(value) || (value as number) < 1) return;
  const number = String(value);
  const pattern = valueKey === 'level'
    ? new RegExp(`\\b${number}(?:st|nd|rd|th)?[\\s-]*level\\b|${number}\\s*环`, 'giu')
    : new RegExp(`\\b${number}\\s*(?:spell\\s+)?slots?\\b|${number}\\s*法位`, 'giu');
  const matches = new Map<number, EvidenceRef>();
  for (const scope of scopes) {
    const local = source.slice(scope.start, scope.end);
    pattern.lastIndex = 0;
    for (let match = pattern.exec(local); match; match = pattern.exec(local)) {
      const start = scope.start + match.index;
      matches.set(start, { start, end: start + match[0].length, quote: match[0] });
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }
  if (matches.size === 1) usage[evidenceKey] = [[...matches.values()][0]!];
}

function canonicalizeEvidenceFromLiteral(
  source: string,
  scopes: EvidenceScope[],
  target: Record<string, unknown>,
  literalKey: string,
): 'canonicalized' | 'ambiguous' | 'unavailable' {
  const literal = target[literalKey];
  if (typeof literal !== 'string' || literal.length === 0) return 'unavailable';
  const offsets = new Set<number>();
  for (const scope of scopes) {
    const local = source.slice(scope.start, scope.end);
    for (let offset = local.indexOf(literal); offset >= 0; offset = local.indexOf(literal, offset + 1)) {
      offsets.add(scope.start + offset);
    }
  }
  if (offsets.size > 1) return 'ambiguous';
  if (offsets.size === 0) return 'unavailable';
  const start = [...offsets][0]!;
  target.evidence = [{ start, end: start + literal.length, quote: literal }];
  return 'canonicalized';
}

function exactEvidenceScopes(
  source: string,
  parentScopes: EvidenceScope[],
  evidence: EvidenceRef[],
): EvidenceScope[] {
  return evidence.filter((ref) => (
    Number.isInteger(ref.start)
    && Number.isInteger(ref.end)
    && source.slice(ref.start, ref.end) === ref.quote
    && parentScopes.some((scope) => ref.start >= scope.start && ref.end <= scope.end)
  ));
}

function evidenceArray(value: unknown): EvidenceRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is EvidenceRef => Boolean(entry && typeof entry === 'object'));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function collectGeneralEvidenceRefs(ir: MonsterIntakeIR): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  const addEvidenceArray = (value: unknown): void => {
    refs.push(...evidenceArray(value));
  };

  for (const claim of Array.isArray(ir.claims) ? ir.claims : []) addEvidenceArray(asRecord(claim)?.evidence);
  addEvidenceArray(ir.coverage);
  for (const uncertainty of Array.isArray(ir.uncertainties) ? ir.uncertainties : []) {
    addEvidenceArray(asRecord(uncertainty)?.evidence);
  }
  addEvidenceArray(ir.creature.legendary?.evidence);
  return refs;
}

function normalizeModelIr(ir: MonsterIntakeIR, source: string, normalizeAbsentOptionalZeroes: boolean): void {
  if (Array.isArray(ir.claims)) {
    ir.claims = ir.claims.filter((claim) => !isUnsupportedEmptyContainerClaim(ir, source, claim));
  }
  const attributes = ir.creature.attributes as MonsterIntakeIR['creature']['attributes'] & { acKind?: unknown; initiative?: number | null };
  if (typeof attributes.acKind === 'string' && !['flat', 'natural', 'default'].includes(attributes.acKind)) {
    attributes.acNote = attributes.acNote?.trim() || attributes.acKind;
    delete attributes.acKind;
  }
  if (attributes.initiative === null) delete attributes.initiative;
  if (normalizeAbsentOptionalZeroes) {
    const senses = ir.creature.senses as MonsterIntakeIR['creature']['senses'] & Record<string, unknown>;
    const senseZeroLabels: Array<[keyof typeof senses, RegExp]> = [
      ['blindsight', /(?:blindsight|盲视|盲感)\s*[:：]?\s*0(?![\d.,\-–—])(?:\s*(?:ft|feet|尺))?/iu],
      ['tremorsense', /(?:tremorsense|震颤感知)\s*[:：]?\s*0(?![\d.,\-–—])(?:\s*(?:ft|feet|尺))?/iu],
      ['truesight', /(?:truesight|真实视觉)\s*[:：]?\s*0(?![\d.,\-–—])(?:\s*(?:ft|feet|尺))?/iu],
    ];
    for (const [field, explicitZero] of senseZeroLabels) {
      if (senses[field] === 0 && !hasExactClaimEvidence(ir, source, [`/creature/senses/${String(field)}`, '/creature/senses'], explicitZero)) {
        delete senses[field];
      }
    }
  }
  const languages = ir.creature.languages as MonsterIntakeIR['creature']['languages'] & { custom?: unknown };
  if (Array.isArray(languages.custom) && languages.custom.length === 0) delete languages.custom;
  languages.values = languages.values.map(normalizeLanguageValue);
  for (const section of ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions'] as const) {
    for (const [featureIndex, feature] of ir.creature[section].entries()) {
      const overloadedActivityType = String(feature.activityType);
      if (['action', 'bonus', 'reaction', 'legendary', 'special'].includes(overloadedActivityType)) {
        feature.activationType = overloadedActivityType as NonNullable<typeof feature.activationType>;
        feature.activityType = undefined;
      }
      if (!['attack', 'save', 'damage', 'utility'].includes(String(feature.activityType))) {
        feature.activityType = feature.attack ? 'attack' : feature.save ? 'save' : feature.damage?.length ? 'damage' : 'utility';
      }
      if (feature.activityType === 'attack' && !feature.attack) {
        feature.activityType = feature.damage?.length ? 'damage' : 'utility';
      }
      if (section === 'legendaryActions' && feature.legendaryCost === undefined) {
        const costMatch = `${feature.name}\n${feature.description}`.match(/(?:costs?|uses?|需要)\s*(\d+)\s*(?:legendary\s+actions?|actions?|动作)/iu);
        const cost = Number(costMatch?.[1]);
        if (Number.isInteger(cost) && cost > 0) feature.legendaryCost = cost;
      }
      if (feature.save && !['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(String(feature.save.ability))) {
        const dcIsLiteral = descriptionStatesSaveDc(feature.description, feature.save.dc);
        const abilityIsLiteral = descriptionStatesSaveAbility(feature.description);
        if (dcIsLiteral && !abilityIsLiteral) {
          delete feature.save;
          if (feature.activityType === 'save') feature.activityType = feature.damage?.length ? 'damage' : 'utility';
          const abilityPath = `/creature/${section}/${featureIndex}/save/ability`;
          ir.uncertainties = ir.uncertainties.filter((uncertainty) => !(
            uncertainty.path === abilityPath
            && uncertainty.code.toLocaleLowerCase('en-US').replace(/[_\s]+/gu, '-') === 'ambiguous-save-ability'
          ));
        }
      }
      if (feature.attack && normalizeAbsentOptionalZeroes) {
        const featurePath = `/creature/${section}/${featureIndex}`;
        const zeroBoundary = '(?![\\d.,\\-–—])';
        if (feature.attack.range === 0 && !hasExactClaimEvidence(
          ir,
          source,
          [`${featurePath}/attack/range`, featurePath],
          new RegExp(`(?:range|射程)\\s*[:：]?\\s*0${zeroBoundary}(?:\\s*(?:ft|feet|尺))?`, 'iu'),
        )) {
          delete feature.attack.range;
        }
        if (feature.attack.longRange === 0 && !hasExactClaimEvidence(
          ir,
          source,
          [`${featurePath}/attack/longRange`, featurePath],
          new RegExp(`(?:long\\s+range|long-range|远距|长射程)\\s*[:：]?\\s*0${zeroBoundary}(?:\\s*(?:ft|feet|尺))?`, 'iu'),
        )) {
          delete feature.attack.longRange;
        }
      }
      for (const damage of feature.damage ?? []) damage.type = normalizeDamageValue(damage.type);
    }
  }
  ir.uncertainties = ir.uncertainties.filter((uncertainty) => !isDisprovedStatblockUncertainty(ir, source, uncertainty));
}

function isUnsupportedEmptyContainerClaim(ir: MonsterIntakeIR, source: string, claim: MonsterIntakeIR['claims'][number]): boolean {
  if (!['/creature/saves', '/creature/skills', '/creature/defenses'].includes(claim.path)) return false;
  const empty = claim.path === '/creature/saves' ? Object.keys(ir.creature.saves).length === 0
    : claim.path === '/creature/skills' ? Object.keys(ir.creature.skills).length === 0
      : Object.values(ir.creature.defenses).every((value) => value.length === 0);
  if (!empty) return false;
  return !claim.evidence.some((ref) => source.slice(ref.start, ref.end) === ref.quote);
}

function isDisprovedStatblockUncertainty(
  ir: MonsterIntakeIR,
  source: string,
  uncertainty: MonsterIntakeIR['uncertainties'][number],
): boolean {
  const code = uncertainty.code.toLocaleLowerCase('en-US').replace(/[_\s]+/gu, '-');
  if (code === 'creature-type-custom-not-standardized') {
    return uncertainty.path === '/creature/identity/creatureType'
      && ir.creature.identity.creatureType === 'humanoid'
      && Boolean(ir.creature.identity.creatureTypeCustom?.trim())
      && /(?:任意种族|any\s+race)/iu.test(source);
  }
  const featureMatch = uncertainty.path.match(/^\/creature\/(traits|actions|bonusActions|reactions|legendaryActions)\/(\d+)(?:\/(.*))?$/u);
  if (!featureMatch) return false;
  const section = featureMatch[1] as 'traits' | 'actions' | 'bonusActions' | 'reactions' | 'legendaryActions';
  const feature = ir.creature[section][Number(featureMatch[2])];
  if (!feature) return false;
  if (code === 'attack-type-ambiguous') {
    return featureMatch[3] === 'attack/type'
      && Boolean(feature.attack?.reach && feature.attack.range)
      && /(?:melee\s+or\s+ranged|近战或远程)/iu.test(feature.description);
  }
  if (code === 'save-ability-unstated') {
    return featureMatch[3]?.startsWith('save') === true
      && feature.save === undefined
      && /(?:save|豁免)[^\n\d]{0,20}DC\s*[:：]?\s*\d+/iu.test(feature.description.normalize('NFKC'));
  }
  if (code === 'legendary-cost-not-structured') {
    return section === 'legendaryActions' && Number.isInteger(feature.legendaryCost) && feature.legendaryCost! > 0;
  }
  if (code === 'attack-damage-total-vs-formula') {
    const damageIndex = featureMatch[3]?.match(/^damage\/(\d+)$/u)?.[1];
    const damage = damageIndex === undefined ? undefined : feature.damage?.[Number(damageIndex)];
    return damage !== undefined && descriptionAverageMatchesFormula(feature.description, damage.formula);
  }
  return false;
}

function descriptionAverageMatchesFormula(description: string, formula: string): boolean {
  const compactFormula = formula.replace(/\s+/gu, '');
  const dice = compactFormula.match(/^(\d+)d(\d+)([+-]\d+)?$/iu);
  if (!dice) return false;
  const escaped = compactFormula.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\+/gu, '\\s*\\+\\s*').replace(/-/gu, '\\s*-\\s*');
  const stated = description.normalize('NFKC').match(new RegExp(`(\\d+)\\s*[（(]\\s*${escaped}\\s*[）)]`, 'iu'));
  if (!stated) return false;
  const average = Math.floor(Number(dice[1]) * (Number(dice[2]) + 1) / 2 + Number(dice[3] ?? 0));
  return Number(stated[1]) === average;
}

function descriptionStatesSaveDc(description: string, dc: number): boolean {
  const value = String(dc).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:save|豁免)[^\\n\\d]{0,20}DC\\s*[:：]?\\s*${value}(?!\\d)|DC\\s*[:：]?\\s*${value}(?!\\d)`, 'iu').test(description.normalize('NFKC'));
}

function descriptionStatesSaveAbility(description: string): boolean {
  const text = description.normalize('NFKC');
  return /(?:strength|dexterity|constitution|intelligence|wisdom|charisma)\s+(?:saving throw|save)(?![\p{L}\p{N}])/iu.test(text)
    || /(?:力量|敏捷|体质|智力|感知|魅力)\s*豁免/u.test(text);
}

function hasExactClaimEvidence(
  ir: MonsterIntakeIR,
  source: string,
  claimPaths: string[],
  explicitValue: RegExp,
): boolean {
  return ir.claims.some((claim) => claimPaths.includes(claim.path) && claim.evidence.some((ref) => (
    source.slice(ref.start, ref.end) === ref.quote && explicitValue.test(ref.quote)
  )));
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

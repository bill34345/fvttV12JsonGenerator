import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resumeSpeciesIntake, runSpeciesIntake } from '@fvtt-json-generator/intake-ai/species-orchestrator';
import type { SpeciesDiscoveryCandidate, SpeciesIntakeAiProvider, SpeciesIntakeIR } from '@fvtt-json-generator/intake-ai/species-types';
import { validateSpeciesIntakeIR } from '@fvtt-json-generator/intake-ai/species-validator';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
function irFor(source: string, candidate: SpeciesDiscoveryCandidate, suffix = ''): SpeciesIntakeIR {
  const id = candidate.id;
  const claimPaths = ['/species/name', '/species/englishName', '/species/displayName', '/species/identifier', '/species/rules', '/species/creatureType', '/species/size', '/species/movement', '/species/senses', '/species/features/0'];
  return {
    schemaVersion: 1, source: { sha256: sha(source), length: source.length },
    species: {
      name: candidate.label, englishName: `Species ${id}`, displayName: `${candidate.label}（Species ${id}）`, identifier: id, rules: '2024',
      creatureType: { value: 'giant', subtype: `Species ${id}` }, size: { options: ['lg'], hint: '大型' }, movement: { walk: 30 }, senses: {}, source: { kind: 'private-homebrew', sha256: sha(candidate.quote), irRevision: 1 },
      features: [{ id: `${id}-trait`, name: `${candidate.label}特性`, description: `规则完整保留${suffix}。`, parts: [{ id: `${id}-trait-part`, level: 0, automation: 'gm-assisted', mechanics: [{ kind: 'gm-assisted', boundaries: ['由GM执行未自动化规则。'] }] }] }],
    },
    claims: claimPaths.map((path) => ({ path, evidence: [candidate] })),
    coverage: [{ start: candidate.start, end: candidate.end, quote: candidate.quote, classification: 'mechanical', claimPaths }], uncertainties: [],
  };
}

class Provider implements SpeciesIntakeAiProvider {
  providerName = 'fake'; extractionModel = 'fake'; reviewModel = 'fake';
  constructor(readonly source: string, readonly candidates: SpeciesDiscoveryCandidate[], readonly behavior: { reviewSecond?: boolean; fail?: boolean; badCoverage?: boolean; badEvidence?: boolean; duplicateFeature?: boolean; suffix?: string } = {}) {}
  async discover() { return { schemaVersion: 1 as const, candidates: this.candidates }; }
  async extract(request: any) { if (this.behavior.fail) throw new Error('provider down'); return this.mutate(irFor(this.source, request.candidate, this.behavior.suffix)); }
  async repair(request: any) { return this.mutate(irFor(this.source, request.candidate, this.behavior.suffix)); }
  async review(request: any) { return this.behavior.reviewSecond && request.candidate.id === 'beta' ? { schemaVersion: 1 as const, verdict: 'needs_review' as const, findings: [{ id: 'review-beta', code: 'REVIEW_BETA', path: '/', message: 'review', blocking: true, origin: 'ai-review' as const }] } : { schemaVersion: 1 as const, verdict: 'accepted' as const, findings: [] }; }
  private mutate(ir: SpeciesIntakeIR): SpeciesIntakeIR {
    if (this.behavior.badCoverage) ir.coverage = [];
    if (this.behavior.badEvidence) ir.claims[0]!.evidence[0] = { start: 0, end: 1, quote: '错误' };
    if (this.behavior.duplicateFeature) ir.species.features.push(structuredClone(ir.species.features[0]!));
    return ir;
  }
}

function splitCandidates(source: string): SpeciesDiscoveryCandidate[] {
  const delimiter = source.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
  const separator = source.indexOf(delimiter); const slices = [[0, separator], [separator + delimiter.length, source.length]] as const;
  return slices.map(([start, end], index) => ({ id: index ? 'beta' : 'alpha', label: index ? '贝塔' : '阿尔法', start, end, quote: source.slice(start, end) }));
}

describe('Species Intake deterministic gates', () => {
  test('aggregates multi-Species accepted plus review as partial', async () => {
    const source = '种族：阿尔法\r\n特性：甲\r\n\r\n种族：贝塔\r\n特性：乙'; const candidates = splitCandidates(source);
    const root = mkdtempSync(join(tmpdir(), 'species-gates-'));
    const result = await runSpeciesIntake({ source, sourceName: 'two.txt', runRoot: join(root, 'runs'), vaultPath: join(root, 'vault'), fvttVersion: '14', effectProfile: 'core' }, new Provider(source, candidates, { reviewSecond: true }));
    expect(result.status).toBe('partial'); expect(result.species.map((entry) => entry.status)).toEqual(['accepted', 'needs_review']);
  });

  test('preserves an exact CRLF candidate including leading and trailing whitespace', async () => {
    const source = 'prefix\r\n  种族：阿尔法\r\n特性：甲  \r\n\r\nsuffix';
    const start = source.indexOf('  种族'); const end = source.indexOf('\r\n\r\nsuffix');
    const candidate = { id: 'alpha', label: '阿尔法', start, end, quote: source.slice(start, end) };
    const root = mkdtempSync(join(tmpdir(), 'species-gates-'));
    const result = await runSpeciesIntake({ source, sourceName: 'whitespace.txt', runRoot: join(root, 'runs'), vaultPath: join(root, 'vault'), fvttVersion: '14', effectProfile: 'core' }, new Provider(source, [candidate]));
    expect(result.status).toBe('succeeded');
    const markdown = readFileSync(result.species[0]!.markdownPath!, 'utf8');
    expect(markdown).toContain(`<!-- species-raw-source-body -->\n${candidate.quote}\n`);
  });

  test('expands a title-only discovery through immediately following feature lines', async () => {
    const source = '食人魔Ogre\n- 生物类型：巨人。\n- 速度：40尺。';
    const heading = '食人魔Ogre';
    const candidate = { id: 'ogre', label: '食人魔', start: 0, end: heading.length, quote: heading };
    const root = mkdtempSync(join(tmpdir(), 'species-gates-'));
    let extractedCandidate: SpeciesDiscoveryCandidate | undefined;
    class CapturingProvider extends Provider {
      override async extract(request: any) { extractedCandidate = request.candidate; return super.extract(request); }
    }
    const result = await runSpeciesIntake({ source, sourceName: 'ogre.txt', runRoot: join(root, 'runs'), vaultPath: join(root, 'vault'), fvttVersion: '14', effectProfile: 'core' }, new CapturingProvider(source, [candidate]));
    expect(result.status).toBe('succeeded');
    expect(extractedCandidate).toEqual({ ...candidate, end: source.length, quote: source });
  });

  test('rejects empty creature subtype and mixed grant levels before Markdown rendering', () => {
    const source = '种族：食人魔\n- 特性：规则';
    const candidate = { id: 'ogre', label: '食人魔', start: 0, end: source.length, quote: source };
    const ir = irFor(source, candidate);
    ir.species.creatureType.subtype = '';
    ir.species.features[0]!.parts.push({
      id: 'ogre-later-benefit',
      level: 5,
      automation: 'native',
      mechanics: [{ kind: 'limited-utility', activation: 'bonus', uses: { max: 2, recovery: 'lr' }, consumption: 1, chatFlavor: '按原规则检定。' }],
    });
    const codes = validateSpeciesIntakeIR(source, ir, candidate).map((finding) => finding.code);
    expect(codes).toContain('CREATURE_TYPE');
    expect(codes).toContain('MIXED_FEATURE_GRANT_LEVELS');
  });

  test('accepts preserved gm-assisted ambiguity when it is explicitly non-blocking', () => {
    const source = '种族：食人魔\n- 推动体型不超过你二级的生物。';
    const candidate = { id: 'ogre', label: '食人魔', start: 0, end: source.length, quote: source };
    const ir = irFor(source, candidate);
    ir.species.features[0]!.description = '推动体型不超过你二级的生物。';
    ir.species.features[0]!.parts[0]!.mechanics = [{ kind: 'gm-assisted', boundaries: ['不解释“体型不超过你二级”；由GM按原文裁定。'] }];
    ir.uncertainties = [{ id: 'ogre-size-wording', code: 'SOURCE_WORDING', path: '/species/features/0', message: '原文不解释“二级”。', blocking: false, evidence: [candidate] }];
    expect(validateSpeciesIntakeIR(source, ir, candidate)).toEqual([]);
  });

  test('rejects overlapping or duplicate candidate identities before extraction', async () => {
    const source = '种族：阿尔法\n特性：甲'; const exact = { id: 'alpha', label: '阿尔法', start: 0, end: source.length, quote: source };
    const root = mkdtempSync(join(tmpdir(), 'species-gates-'));
    const result = await runSpeciesIntake({ source, sourceName: 'bad.txt', runRoot: join(root, 'runs'), vaultPath: join(root, 'vault'), fvttVersion: '14', effectProfile: 'core' }, new Provider(source, [exact, { ...exact }]));
    expect(result.status).toBe('needs_review'); expect(result.species[0]?.findings[0]?.code).toBe('DISCOVERY_DUPLICATE_ID');
  });

  test('keeps coverage gaps review-gated after the one repair budget', async () => {
    const source = '种族：阿尔法\n特性：甲'; const candidate = { id: 'alpha', label: '阿尔法', start: 0, end: source.length, quote: source };
    const root = mkdtempSync(join(tmpdir(), 'species-gates-'));
    const result = await runSpeciesIntake({ source, sourceName: 'gap.txt', runRoot: join(root, 'runs'), vaultPath: join(root, 'vault'), fvttVersion: '14', effectProfile: 'core' }, new Provider(source, [candidate], { badCoverage: true }));
    expect(result.status).toBe('needs_review'); expect(result.species[0]?.calls.repair).toBe(1); expect(result.species[0]?.findings.some((finding) => finding.code === 'COVERAGE_INCOMPLETE')).toBeTrue();
  });

  test('rejects incorrect evidence intervals and duplicate stable feature ids', async () => {
    const source = '种族：阿尔法\n特性：甲'; const candidate = { id: 'alpha', label: '阿尔法', start: 0, end: source.length, quote: source };
    const root = mkdtempSync(join(tmpdir(), 'species-gates-'));
    const evidence = await runSpeciesIntake({ source, sourceName: 'evidence.txt', runRoot: join(root, 'runs-a'), vaultPath: join(root, 'vault-a'), fvttVersion: '14', effectProfile: 'core' }, new Provider(source, [candidate], { badEvidence: true }));
    expect(evidence.status).toBe('needs_review'); expect(evidence.species[0]?.findings.some((finding) => finding.code === 'INVALID_EVIDENCE')).toBeTrue();
    const duplicate = await runSpeciesIntake({ source, sourceName: 'duplicate.txt', runRoot: join(root, 'runs-b'), vaultPath: join(root, 'vault-b'), fvttVersion: '14', effectProfile: 'core' }, new Provider(source, [candidate], { duplicateFeature: true }));
    expect(duplicate.status).toBe('needs_review'); expect(duplicate.species[0]?.findings.some((finding) => finding.code === 'DUPLICATE_FEATURE_ID')).toBeTrue();
  });

  test('requires field claims and bidirectional coverage references', async () => {
    const source = '种族：阿尔法\n特性：甲'; const candidate = { id: 'alpha', label: '阿尔法', start: 0, end: source.length, quote: source };
    const root = mkdtempSync(join(tmpdir(), 'species-gates-'));
    class WeakClaimsProvider extends Provider {
      override async extract(request: any) { const ir = await super.extract(request); ir.claims = [{ path: '/species', evidence: [candidate] }]; ir.coverage[0]!.claimPaths = ['/species']; return ir; }
      override async repair(request: any) { return this.extract(request); }
    }
    const result = await runSpeciesIntake({ source, sourceName: 'weak.txt', runRoot: join(root, 'runs'), vaultPath: join(root, 'vault'), fvttVersion: '14', effectProfile: 'core' }, new WeakClaimsProvider(source, [candidate]));
    expect(result.status).toBe('needs_review'); expect(result.species[0]?.findings.some((finding) => finding.code === 'MISSING_FIELD_CLAIM')).toBeTrue();
  });

  test('does not promote a non-Species lookalike or provider failure', async () => {
    const source = '这是一个怪物数据块，不是玩家种族。'; const root = mkdtempSync(join(tmpdir(), 'species-gates-'));
    const empty = await runSpeciesIntake({ source, sourceName: 'monster.txt', runRoot: join(root, 'runs-a'), vaultPath: join(root, 'vault-a'), fvttVersion: '14', effectProfile: 'core' }, new Provider(source, []));
    expect(empty.status).toBe('needs_review'); expect(empty.species[0]?.findings[0]?.code).toBe('DISCOVERY_EMPTY');
    const candidate = { id: 'alpha', label: '阿尔法', start: 0, end: source.length, quote: source };
    const failed = await runSpeciesIntake({ source, sourceName: 'failure.txt', runRoot: join(root, 'runs-b'), vaultPath: join(root, 'vault-b'), fvttVersion: '14', effectProfile: 'core' }, new Provider(source, [candidate], { fail: true }));
    expect(failed.status).toBe('failed'); expect(failed.species[0]?.status).toBe('failed');
  });

  test('protects a changed existing target', async () => {
    const source = '种族：阿尔法\n特性：甲'; const candidate = { id: 'alpha', label: '阿尔法', start: 0, end: source.length, quote: source };
    const root = mkdtempSync(join(tmpdir(), 'species-gates-')); const base = { source, sourceName: 'alpha.txt', runRoot: join(root, 'runs'), vaultPath: join(root, 'vault'), fvttVersion: '14' as const, effectProfile: 'core' as const };
    expect((await runSpeciesIntake(base, new Provider(source, [candidate]))).status).toBe('succeeded');
    const conflict = await runSpeciesIntake(base, new Provider(source, [candidate], { suffix: '（改动）' }));
    expect(conflict.status).toBe('needs_review'); expect(conflict.species[0]?.findings[0]?.code).toBe('target-conflict:alpha');
    const decisionsPath = join(root, 'decisions.json');
    const decisionsBytes = `${JSON.stringify({ runId: conflict.runId, sourceSha256: conflict.sourceSha256, decisions: [{ issueId: 'target-conflict:alpha', action: 'replace' }] }, null, 2)}\n`;
    writeFileSync(decisionsPath, decisionsBytes, 'utf8');
    const resumed = await resumeSpeciesIntake(conflict.runPath, decisionsPath, new Provider(source, [candidate], { suffix: '（改动）' }), base.vaultPath);
    expect(resumed.status).toBe('succeeded');
    const resumedManifest = JSON.parse(readFileSync(join(resumed.runPath, 'manifest.json'), 'utf8'));
    expect(resumedManifest.resumedFromRunId).toBe(conflict.runId); expect(resumedManifest.decisionsSha256).toBe(sha(decisionsBytes));
    const ledger = JSON.parse(readFileSync(join(base.vaultPath, 'output/species/accepted-ledger.json'), 'utf8'));
    expect(ledger.entries[0]).toMatchObject({ acceptedRunId: resumed.runId, resumedFromRunId: conflict.runId, decisionsSha256: sha(decisionsBytes) });
  });

  test('re-reviews an edited accepted Markdown and refreshes its ledger hash', async () => {
    const source = '种族：阿尔法\n特性：甲'; const candidate = { id: 'alpha', label: '阿尔法', start: 0, end: source.length, quote: source };
    const root = mkdtempSync(join(tmpdir(), 'species-gates-')); const vaultPath = join(root, 'vault');
    const first = await runSpeciesIntake({ source, sourceName: 'alpha.txt', runRoot: join(root, 'runs'), vaultPath, fvttVersion: '14', effectProfile: 'core' }, new Provider(source, [candidate]));
    const markdownPath = first.species[0]!.markdownPath!;
    const edited = readFileSync(markdownPath, 'utf8').replace('规则完整保留。', '规则由人工确认后完整保留。');
    writeFileSync(markdownPath, edited, 'utf8');
    const second = await runSpeciesIntake({ source: edited, sourceName: 'alpha.md', runRoot: join(root, 'runs'), vaultPath, fvttVersion: '14', effectProfile: 'core' }, new Provider(edited, []));
    expect(second.status).toBe('succeeded'); expect(second.species[0]?.calls).toEqual({ discovery: 0, extraction: 0, review: 1, repair: 0 });
    const ledger = JSON.parse(readFileSync(join(vaultPath, 'output/species/accepted-ledger.json'), 'utf8'));
    expect(ledger.entries[0].markdownSha256).toBe(sha(edited)); expect(ledger.entries[0].acceptedRunId).toBe(second.runId);
  });
});

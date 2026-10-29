import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resumeMonsterIntake, runMonsterIntake } from '@fvtt-json-generator/intake-ai/orchestrator';
import { materializeDiscoveryLines, resolveDiscoveryCandidates } from '@fvtt-json-generator/intake-ai/discovery';
import { runMonsterIntake as runApplicationMonsterIntake, resumeMonsterIntake as resumeApplicationMonsterIntake } from '../src/core/application/workflows';
import { splitCollection, canonicalizeCreatureSourceText } from '@fvtt-json-generator/ingest-plaintext/plaintext-core';
import { OpenAICompatibleMonsterIntakeProvider } from '@fvtt-json-generator/intake-ai/provider';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import type { MonsterIntakeAiProvider, MonsterIntakeIR } from '@fvtt-json-generator/intake-ai/types';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';
import { ActorValidator } from '@fvtt-json-generator/generation/validator';
import { buildValidLurkerIr, LURKER_SOURCE } from '../src/core/intake/__tests__/fixtures/lurker';

function fixtureProvider(ir: MonsterIntakeIR = buildValidLurkerIr()) {
  const calls = { extract: 0, review: 0, repair: 0 };
  const provider: MonsterIntakeAiProvider = {
    providerName: 'offline-fixture', extractionModel: 'offline-fixture', reviewModel: 'disabled',
    discover: async () => ({ schemaVersion: 1, candidates: [{ id: 'lurker', label: 'Lurker', start: 0,
      end: LURKER_SOURCE.length, quote: LURKER_SOURCE }] }),
    extract: async () => { calls.extract++; return structuredClone(ir); },
    review: async () => { calls.review++; throw Error('Review must not run'); },
    repair: async () => { calls.repair++; throw Error('Repair must not run'); },
  };
  return { provider, calls };
}

function roots() {
  const path = mkdtempSync(join(tmpdir(), 'forge-cli-delivery-'));
  return { runRoot: join(path, 'runs'), vaultPath: join(path, 'vault') };
}

describe('Actor delivery without content vetoes', () => {
  test('returns the real generated Actor despite a blocking finding without review or repair', async () => {
    const ir = buildValidLurkerIr();
    ir.uncertainties.push({ id: 'retained-question', code: 'RETAINED_QUESTION', path: '/creature/biography',
      message: 'GM should inspect this wording.', blocking: true, evidence: [] });
    const { provider, calls } = fixtureProvider(ir);
    const result = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt',
      fvttVersion: '14', effectProfile: 'core', ...roots() }, provider);
    const creature = result.creatures[0]!;
    expect(creature.status).toBe('needs_review');
    expect(creature.actorPath).toEndWith('candidate-actor.json');
    expect(existsSync(creature.actorPath!)).toBe(true);
    const actor = JSON.parse(readFileSync(creature.actorPath!, 'utf8'));
    expect(actor.name).toContain('Lurker');
    expect(actor.items.length).toBeGreaterThan(0);
    expect(creature.findings.some(finding => finding.code === 'RETAINED_QUESTION')).toBe(true);
    expect(calls).toEqual({ extract: 1, review: 0, repair: 0 });
  });

  test('a target conflict keeps the old file and exposes the new candidate without regenerating', async () => {
    const paths = roots();
    const first = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt',
      fvttVersion: '14', effectProfile: 'core', ...paths }, fixtureProvider().provider);
    const target = first.creatures[0]!.actorPath!;
    const original = JSON.parse(readFileSync(target, 'utf8'));
    original.name = 'Existing user Actor';
    const originalText = JSON.stringify(original);
    writeFileSync(target, originalText);
    let conversions = 0;
    const second = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'lurker.txt',
      fvttVersion: '14', effectProfile: 'core', ...paths }, fixtureProvider().provider, {
      convertMarkdownContentToJson: async options => { conversions++; return convertMarkdownContentToJson(options); },
    });
    expect(second.creatures[0]!.findings.some(finding => finding.code === 'TARGET_CONFLICT')).toBe(true);
    expect(second.creatures[0]!.actorPath).toEndWith('candidate-actor.json');
    expect(JSON.parse(readFileSync(second.creatures[0]!.actorPath!, 'utf8')).name).toContain('Lurker');
    expect(readFileSync(target, 'utf8')).toBe(originalText);
    expect(conversions).toBe(1);
  });

  test('resuming a delivered Actor keeps the original discovery issue visible without model calls', async () => {
    const paths = roots();
    const { provider } = fixtureProvider();
    const discover = provider.discover;
    provider.discover = async request => {
      const result = await discover(request);
      result.candidates.push({ id: 'unlocated', label: 'Unlocated', start: -1, end: -1, quote: 'not in this source' });
      return result;
    };
    const original = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'partial-discovery.txt',
      fvttVersion: '14', effectProfile: 'core', ...paths }, provider);
    const decisions = join(original.runPath, 'decisions.json');
    writeFileSync(decisions, JSON.stringify({ runId: original.runId, sourceSha256: original.sourceSha256, decisions: [] }));
    const resumed = await resumeMonsterIntake(original.runPath, decisions, provider, paths.vaultPath);
    expect(resumed.status).toBe('needs_review');
    expect(resumed.discoveryFindings).toEqual(original.discoveryFindings);
    expect(resumed.creatures[0]!.calls).toEqual({ extraction: 0, review: 0, repair: 0 });
    expect(JSON.parse(readFileSync(resumed.creatures[0]!.actorPath!, 'utf8')).items.length).toBeGreaterThan(0);
  });

  test('resumes later delivered Actors when an earlier AI failure has no saved IR', async () => {
    const paths = roots();
    const prefix = 'Failed creature.\n', source = prefix + LURKER_SOURCE;
    let modelCalls = 0;
    const { provider } = fixtureProvider();
    provider.discover = async () => {
      modelCalls++;
      return { schemaVersion: 1, candidates: [
        { id: 'failed', label: 'Failed creature', start: 0, end: prefix.length, quote: prefix },
        { id: 'lurker', label: 'Lurker', start: prefix.length, end: source.length, quote: LURKER_SOURCE },
      ] };
    };
    provider.extract = async request => {
      modelCalls++;
      if (request.candidate.id === 'failed') throw Error('AI did not return a reply');
      return buildValidLurkerIr();
    };
    const first = await runMonsterIntake({ source, sourceName: 'two-creatures.txt',
      fvttVersion: '14', effectProfile: 'core', ...paths }, provider);
    expect(first.creatures[0]!.status).toBe('failed');
    expect(existsSync(join(first.creatures[0]!.bundlePath, 'intake-ir.json'))).toBe(false);
    expect(first.creatures[1]!.actorPath).toBeDefined();
    const originalActor = JSON.parse(readFileSync(first.creatures[1]!.actorPath!, 'utf8'));
    const beforeResume = modelCalls;
    const decisions = join(first.runPath, 'decisions.json');
    writeFileSync(decisions, JSON.stringify({ runId: first.runId, sourceSha256: first.sourceSha256, decisions: [] }));
    const resumed = await resumeMonsterIntake(first.runPath, decisions, provider, paths.vaultPath);
    expect(modelCalls).toBe(beforeResume);
    expect(resumed.status).toBe('partial');
    expect(resumed.creatures[0]!.status).toBe('failed');
    expect(resumed.creatures[0]!.findings).toContainEqual(expect.objectContaining({ message: 'AI did not return a reply' }));
    expect(resumed.creatures.every(creature => creature.calls.extraction === 0 && creature.calls.review === 0 && creature.calls.repair === 0)).toBe(true);
    const retainedActor = JSON.parse(readFileSync(resumed.creatures[1]!.actorPath!, 'utf8'));
    expect(retainedActor.name).toBe(originalActor.name);
    expect(retainedActor.items.map((item: any) => item.name)).toEqual(originalActor.items.map((item: any) => item.name));
  });

  test('a post-generation validator exception retains the complete requested Actor file', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'forge-report-delivery-')), 'actor.json');
    const original = ActorValidator.prototype.validate;
    ActorValidator.prototype.validate = () => { throw Error('LOCAL_REPORT_FAILURE'); };
    try {
      const result = await convertMarkdownContentToJson({ content: renderMonsterIntakeMarkdown(buildValidLurkerIr()),
        outputPath: path, fvttVersion: '14', effectProfile: 'core', translationService: null });
      expect(result.status).toBe('failed');
      expect(result.outputPath).toBe(path);
      expect(result.diagnostics.some(diagnostic => diagnostic.code === 'GEN_LEGACY_VALIDATOR_INCOMPLETE')).toBe(true);
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(result.rawJson);
      expect((result.rawJson as any).items.length).toBeGreaterThan(0);
    } finally { ActorValidator.prototype.validate = original; }
  });
});

describe('AI source-text answers through the existing CLI workflow', () => {
  test('uses one real provider response for a complete Markdown card and resumes without a fabricated IR', async () => {
    const markdown = renderMonsterIntakeMarkdown(buildValidLurkerIr());
    const sourceText = `\`\`\`markdown\n${markdown}\n\`\`\``;
    let requests = 0;
    const provider = new OpenAICompatibleMonsterIntakeProvider({ authMode: 'api-key', baseUrl: 'https://offline.invalid/v1', apiKey: 'offline-only',
      model: 'offline-fixture', reviewModel: 'disabled', timeoutMs: 1000, repairTimeoutMs: 1000,
      httpClient: async () => { requests++; return { ok: true, status: 200,
        json: async () => ({ choices: [{ message: { content: sourceText } }] }) }; } });
    provider.discover = fixtureProvider().provider.discover;
    const paths = roots();
    const intake = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'source-text-answer.txt',
      fvttVersion: '14', effectProfile: 'core', ...paths }, provider,
      { convertMarkdownContentToJson, canonicalizeSourceText: canonicalizeCreatureSourceText });
    const creature = intake.creatures[0]!;
    expect(requests).toBe(1);
    expect(creature.calls).toEqual({ extraction: 1, review: 0, repair: 0 });
    expect(existsSync(join(creature.bundlePath, 'intake-ir.json'))).toBe(false);
    expect(readFileSync(creature.sourceTextPath!, 'utf8')).toBe(sourceText);
    expect(readFileSync(creature.markdownPath!, 'utf8')).toBe(markdown);
    const actor = JSON.parse(readFileSync(creature.actorPath!, 'utf8'));
    const expected = (await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null })).rawJson as any;
    expect(actor.name).toBe(expected.name);
    expect(actor.system).toEqual(expected.system);
    expect(actor.items.map((item: any) => ({ name: item.name, type: item.type, system: item.system, effects: item.effects })))
      .toEqual(expected.items.map((item: any) => ({ name: item.name, type: item.type, system: item.system, effects: item.effects })));
    const decisions = join(intake.runPath, 'decisions.json');
    writeFileSync(decisions, JSON.stringify({ runId: intake.runId, sourceSha256: intake.sourceSha256, decisions: [] }));
    const resumed = await resumeMonsterIntake(intake.runPath, decisions, provider, paths.vaultPath,
      { convertMarkdownContentToJson, canonicalizeSourceText: canonicalizeCreatureSourceText });
    expect(requests).toBe(1);
    expect(resumed.creatures[0]!.calls).toEqual({ extraction: 0, review: 0, repair: 0 });
    expect(readFileSync(resumed.creatures[0]!.sourceTextPath!, 'utf8')).toBe(sourceText);
    expect(JSON.parse(readFileSync(resumed.creatures[0]!.actorPath!, 'utf8')).system).toEqual(actor.system);
  });

  test('converts an already canonical source answer without requiring a normalization port', async () => {
    const markdown = renderMonsterIntakeMarkdown(buildValidLurkerIr());
    const { provider, calls } = fixtureProvider();
    provider.extractAnswer = async () => { calls.extract++; return { kind: 'source-text', sourceText: markdown }; };
    const intake = await runMonsterIntake({ source: LURKER_SOURCE, sourceName: 'canonical-answer.txt',
      fvttVersion: '14', effectProfile: 'core', ...roots() }, provider);
    const actor = JSON.parse(readFileSync(intake.creatures[0]!.actorPath!, 'utf8'));
    expect(actor.name).toContain('Lurker');
    expect(actor.items.some((item: any) => item.name.includes('Claw'))).toBe(true);
    expect(calls).toEqual({ extract: 1, review: 0, repair: 0 });
    expect(existsSync(join(intake.creatures[0]!.bundlePath, 'intake-ir.json'))).toBe(false);
  });

  test.each(['standard', 'legacy'] as const)('the production CLI/Web composition root converts and resumes %s source answers', async format => {
    const source = format === 'standard' ? renderMonsterIntakeMarkdown(buildValidLurkerIr())
      : splitCollection(readFileSync(resolve('src/core/ingest/__tests__/fixtures/live-crawl-semantic-statlines.md'), 'utf8'))[0]!.quote;
    const sourceText = format === 'standard' ? `\`\`\`markdown\n${source}\n\`\`\`` : source;
    const calls = { extract: 0, review: 0, repair: 0 };
    const provider: MonsterIntakeAiProvider = {
      providerName: 'offline-fixture', extractionModel: 'fixture', reviewModel: 'disabled',
      discover: async () => ({ schemaVersion: 1, candidates: [{ id: 'text', label: 'Source answer', start: 0, end: source.length, quote: source }] }),
      extract: async () => { throw Error('The source-answer interface must be used'); },
      extractAnswer: async () => { calls.extract++; return { kind: 'source-text', sourceText }; },
      review: async () => { calls.review++; throw Error('Review must not run'); },
      repair: async () => { calls.repair++; throw Error('Repair must not run'); },
    };
    const paths = roots();
    const intake = await runApplicationMonsterIntake({ source, sourceName: `${format}-answer.txt`,
      fvttVersion: '14', effectProfile: 'core', ...paths }, provider);
    const creature = intake.creatures[0]!;
    const canonicalSource = canonicalizeCreatureSourceText(sourceText);
    expect(readFileSync(creature.markdownPath!, 'utf8')).toBe(canonicalSource);
    const actor = JSON.parse(readFileSync(creature.actorPath!, 'utf8'));
    const expected = (await convertMarkdownContentToJson({ content: canonicalSource, fvttVersion: '14', effectProfile: 'core', translationService: null })).rawJson as any;
    expect(actor.system).toEqual(expected.system);
    expect(actor.items.length).toBeGreaterThan(0);
    expect(existsSync(join(creature.bundlePath, 'intake-ir.json'))).toBe(false);
    const decisions = join(intake.runPath, 'decisions.json');
    writeFileSync(decisions, JSON.stringify({ runId: intake.runId, sourceSha256: intake.sourceSha256, decisions: [] }));
    const resumed = await resumeApplicationMonsterIntake(intake.runPath, decisions, provider, paths.vaultPath);
    expect(JSON.parse(readFileSync(resumed.creatures[0]!.actorPath!, 'utf8')).system).toEqual(actor.system);
    expect(calls).toEqual({ extract: 1, review: 0, repair: 0 });
  });

  test.each(['plain', 'kind-only', 'kind-and-source-text'] as const)('keeps the %s JSON answer on the IR conversion path with one response', async variant => {
    let requests = 0;
    const reply = { ...buildValidLurkerIr(),
      ...(variant !== 'plain' ? { kind: 'source-text' } : {}),
      ...(variant === 'kind-and-source-text' ? { sourceText: '# Do not replace the structured creature with this extra metadata' } : {}),
    };
    const provider = new OpenAICompatibleMonsterIntakeProvider({ authMode: 'api-key', baseUrl: 'https://offline.invalid/v1', apiKey: 'offline-only',
      model: 'offline-fixture', reviewModel: 'disabled', timeoutMs: 1000, repairTimeoutMs: 1000,
      httpClient: async () => { requests++; return { ok: true, status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(reply) } }] }) }; } });
    provider.discover = fixtureProvider().provider.discover;
    const options = { source: LURKER_SOURCE, sourceName: 'json-answer.txt', fvttVersion: '14' as const, effectProfile: 'core' as const };
    const normal = await runMonsterIntake({ ...options, ...roots() }, fixtureProvider().provider);
    const current = await runMonsterIntake({ ...options, ...roots() }, provider);
    const actor = JSON.parse(readFileSync(current.creatures[0]!.actorPath!, 'utf8'));
    const expected = JSON.parse(readFileSync(normal.creatures[0]!.actorPath!, 'utf8'));
    expect(requests).toBe(1);
    expect(current.creatures[0]!.calls).toEqual({ extraction: 1, review: 0, repair: 0 });
    expect(existsSync(join(current.creatures[0]!.bundlePath, 'intake-ir.json'))).toBe(true);
    expect(current.creatures[0]!.sourceTextPath).toBeUndefined();
    if (variant !== 'plain') {
      const saved = JSON.parse(readFileSync(join(current.creatures[0]!.bundlePath, 'intake-ir.json'), 'utf8'));
      expect(saved.kind).toBe('source-text');
      if (variant === 'kind-and-source-text') expect(saved.sourceText).toBe(reply.sourceText);
    }
    expect(actor.system).toEqual(expected.system);
    expect(actor.items).toEqual(expected.items);
  });
});

describe('per-creature discovery delivery', () => {
  test('keeps located creatures and exposes a bad selection plus unassigned original text', () => {
    const source = 'First creature.\nUnresolved creature.\nThird creature.';
    const first = 'First creature.', third = 'Third creature.';
    const result = resolveDiscoveryCandidates(source, [
      { id: 'first', label: 'First', start: 0, end: first.length, quote: first },
      { id: 'bad', label: 'Bad', start: -1, end: -1, quote: 'Not in this source' },
      { id: 'third', label: 'Third', start: source.indexOf(third), end: source.length, quote: third },
    ]);
    expect(result.candidates.map(candidate => candidate.id)).toEqual(['first', 'third']);
    expect(result.candidates[0]!.quote).toBe(first);
    expect(result.findings.map(finding => finding.code)).toContain('DISCOVERY_CANDIDATE_UNLOCATED');
    expect(result.unassigned.map(range => range.quote).join('')).toContain('Unresolved creature.');
  });

  test('an invalid line selection cannot expand its neighbor across the unlocated creature', () => {
    const source = 'First creature.\nUnresolved creature.';
    const discovered = materializeDiscoveryLines({ source, sourceSha256: '0'.repeat(64), chunkStart: 0, chunkEnd: source.length }, {
      schemaVersion: 1, candidates: [
        { id: 'first', label: 'First', firstLineId: 'L1', lastLineId: 'L1' },
        { id: 'bad', label: 'Bad', firstLineId: 'unknown', lastLineId: 'L2' },
      ],
    });
    const result = resolveDiscoveryCandidates(source, discovered.candidates, discovered.findings);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.quote).toBe('First creature.\n');
    expect(result.unassigned[0]!.quote).toBe('Unresolved creature.');
  });

  test('ambiguous overlap leaves those source ranges visible while independent creatures continue', () => {
    const source = 'abcdefghij\nIndependent';
    const result = resolveDiscoveryCandidates(source, [
      { id: 'a', label: 'A', start: 0, end: 7, quote: source.slice(0, 7) },
      { id: 'b', label: 'B', start: 5, end: 10, quote: source.slice(5, 10) },
      { id: 'c', label: 'Independent', start: 11, end: source.length, quote: source.slice(11) },
    ]);
    expect(result.candidates.map(candidate => candidate.id)).toEqual(['c']);
    expect(result.findings.map(finding => finding.code)).toContain('DISCOVERY_OVERLAP_UNRESOLVED');
    expect(result.unassigned[0]!.quote).toContain('abcdefghij');
  });

  test.each(['shared-id', 'shared-label'])('does not merge partially overlapping creatures by %s', identity => {
    const source = 'First creature.Second creature.\nIndependent';
    const independent = source.indexOf('Independent');
    const result = resolveDiscoveryCandidates(source, [
      { id: 'same', label: 'First', start: 0, end: 20, quote: source.slice(0, 20) },
      { id: identity === 'shared-id' ? 'same' : 'other', label: identity === 'shared-label' ? 'First' : 'Second',
        start: 15, end: independent - 1, quote: source.slice(15, independent - 1) },
      { id: 'independent', label: 'Independent', start: independent, end: source.length, quote: source.slice(independent) },
    ]);
    expect(result.candidates.map(candidate => candidate.id)).toEqual(['independent']);
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'DISCOVERY_OVERLAP_UNRESOLVED' }));
    expect(result.unassigned.map(range => range.quote).join('')).toBe(source.slice(0, independent));
  });

  test('assigns distinct technical IDs to separately located creatures without dropping either', () => {
    const source = 'One creature.\nTwo creature.';
    const result = resolveDiscoveryCandidates(source, [
      { id: 'same', label: 'One', start: 0, end: 13, quote: source.slice(0, 13) },
      { id: 'same', label: 'Two', start: 14, end: source.length, quote: source.slice(14) },
    ]);
    expect(result.candidates.map(candidate => candidate.id)).toEqual(['same', 'same-2']);
    expect(result.candidates.map(candidate => candidate.quote).join('')).toBe(source);
  });

  test('does not reject a located creature because its source exceeds an arbitrary candidate length', () => {
    const source = 'A'.repeat(26_000);
    const result = resolveDiscoveryCandidates(source, [{ id: 'large', label: 'Large', start: 0, end: source.length, quote: source }]);
    expect(result.candidates[0]!.quote).toBe(source);
    expect(result.findings).toEqual([]);
  });
});

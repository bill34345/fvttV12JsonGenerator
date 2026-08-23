import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  attachForgeSourceId,
  decodeForgeActorRequest,
  decodeForgeActorResponse,
  hashArtifact,
  hashSource,
  type ForgeActorRequest,
  type ForgeActorResponse,
  type ForgeSourceId,
  type JsonObject,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  buildForgeActorRequest,
  convertFinalActorSource,
  resolveFoundrySpellUuid,
  resolveLegacySpellUuid,
} from '@fvtt-json-generator/forge-browser-runtime';
import { LEGACY_BROWSER_SPELLS } from '../packages/forge-browser-runtime/src/browser-legacy-spell-data';
import { LOCKED_DND5E_V14_SPELLS } from '../packages/forge-browser-runtime/src/browser-v14-spell-data';
import {
  buildV14SpellSnapshot,
  renderV14SpellSnapshot,
} from '../packages/forge-browser-runtime/scripts/generate-v14-spell-data';
import { SpellsMapper } from '@fvtt-json-generator/generation/spells-mapper';
import { resolveLockedDnd5eV14Spell as resolveNodeV14Spell } from '@fvtt-json-generator/generation/v14-spell-catalog';
import {
  createBrowserAiProvider,
  convertRawActorSourceWithAi,
} from '@fvtt-json-generator/forge-browser-runtime/ai';
import type {
  DiscoveryResult,
  MonsterIntakeAiProvider,
  MonsterIntakeIR,
} from '@fvtt-json-generator/intake-ai/types';
import { conversionApplication } from '../src/core/application/conversion';
import { RAT_WARLOCK_SOURCE, buildRatWarlockIr } from '../src/core/intake/__tests__/fixtures/rat-warlock';
import { buildBrowserBundle } from '../foundry-modules/fvtt-json-forge/build';
import { resolveActorIntakeStatus } from '../packages/forge-browser-runtime/src/status';
import { normalizeForgeActorArtifact } from '../packages/forge-browser-runtime/src/artifact';

const SOURCE_ID = 'actor:v1:123e4567-e89b-42d3-a456-426614174000' as ForgeSourceId;
const NIGHTGAUNT_SOURCE = readFileSync(resolve('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md'), 'utf8');
const BOLBARA_SOURCE = readFileSync(resolve('obsidian/dnd数据转fvttjson/input/bolbara.md'), 'utf8');
const ENGLISH_SOURCE = [
  '---',
  'layout: creature',
  `forge-source-id: ${SOURCE_ID}`,
  'name: Forge English Actor',
  'type: aberration',
  'size: Medium',
  'armor_class: 12',
  'hit_points: 10',
  'challenge: 1',
  'speed: 30',
  '---',
  '### Actions',
  '- Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6+2) piercing damage.',
].join('\n');
const NIGHTGAUNT_CASTER_SOURCE = NIGHTGAUNT_SOURCE.replace('背景: |-', '施法:\n  - "随意: Fireball"\n背景: |-');

describe('browser Forge Actor runtime', () => {
  test.each([
    ['12.331', '12', '4.3.9'],
    ['13.340', '12', '4.3.9'],
    ['14.364', '14', '5.3.3'],
  ] as const)('matches the formal Node artifact hash for FVTT %s', async (fvttVersion, workflowTarget, systemVersion) => {
    const finalSource = attachForgeSourceId(NIGHTGAUNT_SOURCE, SOURCE_ID).content;
    const request = buildForgeActorRequest({
      content: NIGHTGAUNT_SOURCE,
      sourceId: SOURCE_ID,
      displayName: 'Forge Actor',
      requestId: `browser-${fvttVersion}`,
      fvttVersion,
      systemVersion,
    });
    expect(request.source.content).toBe(finalSource);
    expect(request.source.utf8Sha256).toBe(hashSource(finalSource));

    const browserResponse = await (await browserRuntime()).convertFinalActorSource(request);
    const decoded = decodeForgeActorResponse(browserResponse);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || !('result' in decoded.value) || decoded.value.result.status !== 'accepted') {
      throw new Error(`Expected accepted browser response: ${JSON.stringify(browserResponse)}`);
    }

    const nodeResult = await conversionApplication.convertContent({
      content: finalSource,
      fvttVersion: workflowTarget,
      effectProfile: 'core',
    });
    expect(nodeResult.status).toBe('accepted');
    const normalizedNodeArtifact = normalizeForgeActorArtifact(nodeResult.rawJson);
    expect(decoded.value.result.sourceIdentity.sourceHash).toBe(hashSource(finalSource));
    expect(decoded.value.result.artifact).toEqual(normalizedNodeArtifact);
    expect(decoded.value.result.artifactHash).toBe(hashArtifact(normalizedNodeArtifact));
    expect((nodeResult.rawJson as Record<string, any>)._stats?.createdTime).toEqual(expect.any(Number));
    expect((normalizedNodeArtifact._stats as Record<string, any>)?.createdTime).toBeNull();
    expect((normalizedNodeArtifact._stats as Record<string, any>)?.modifiedTime).toBeNull();
    expect(decoded.value.result.target.fvttRuntimeVersion).toBe(fvttVersion);
    expect(decoded.value.result.target.systemVersionObserved).toBe(systemVersion);
    expect(JSON.stringify(browserResponse)).not.toMatch(/sourcePath|actorPath|localCache|dnd5eRepo|reference/u);
  });

  test('the actual browser bundle returns one stable Forge artifact for repeated conversion of identical final bytes', async () => {
    const request = buildForgeActorRequest({
      content: NIGHTGAUNT_SOURCE,
      sourceId: SOURCE_ID,
      displayName: 'Stable Nightgaunt',
      requestId: 'stable-browser-artifact',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    });
    const runtime = await browserRuntime();
    const first = await runtime.convertFinalActorSource(request);
    await Bun.sleep(25);
    const second = await runtime.convertFinalActorSource(request);
    if (!('result' in first) || first.result.status !== 'accepted' || !('artifact' in first.result)) {
      throw new Error(`Expected first accepted response: ${JSON.stringify(first)}`);
    }
    if (!('result' in second) || second.result.status !== 'accepted' || !('artifact' in second.result)) {
      throw new Error(`Expected second accepted response: ${JSON.stringify(second)}`);
    }
    expect(second.result.artifactHash).toBe(first.result.artifactHash);
    expect(second.result.artifact).toEqual(first.result.artifact);
    expect((second.result.artifact._stats as Record<string, any>)?.createdTime).toBeNull();
    expect((second.result.artifact._stats as Record<string, any>)?.modifiedTime).toBeNull();
  });

  test('browser legacy spell snapshot is exactly the final Node mapper output', () => {
    expect(LEGACY_BROWSER_SPELLS).toEqual(new SpellsMapper().entries());
    expect(LEGACY_BROWSER_SPELLS).toHaveLength(205);
    expect(LEGACY_BROWSER_SPELLS.find((spell) => spell.name === 'Fireball')).toEqual({
      name: 'Fireball',
      uuid: '23af52db33017be0',
      sourceId: 'Compendium.dnd5e.spells.Item.23af52db33017be0',
    });
  });

  test('classifies every legacy spell reference as uniquely mapped or explicitly unresolved for dnd5e 5.3.3', () => {
    const mapped = LEGACY_BROWSER_SPELLS.filter((spell) => resolveFoundrySpellUuid(spell.uuid));
    const unresolved = LEGACY_BROWSER_SPELLS.filter((spell) => !resolveFoundrySpellUuid(spell.uuid));
    expect(mapped).toHaveLength(160);
    expect(unresolved).toHaveLength(45);
    for (const spell of mapped) {
      const foundryUuid = resolveFoundrySpellUuid(spell.uuid);
      expect(foundryUuid).toBeTruthy();
      expect(resolveLegacySpellUuid(foundryUuid!)).toBe(spell.uuid);
    }
    expect(resolveFoundrySpellUuid('e2de216f26943e8b')).toBe('Compendium.dnd5e.spells.Item.8RTDOt80u8aBv9qx');
    expect(resolveFoundrySpellUuid('23af52db33017be0')).toBe('Compendium.dnd5e.spells.Item.ztgcdrWPshKRpFd0');
  });

  test('checked-in v14 spell data is a deterministic full snapshot of the locked dnd5e 5.3.3 cache', async () => {
    const referenceCacheRoot = process.env.FVTT_REFERENCE_CACHE_ROOT?.trim();
    if (!referenceCacheRoot) throw new Error('FVTT_REFERENCE_CACHE_ROOT is required for v14 spell snapshot parity.');
    const snapshot = await buildV14SpellSnapshot(referenceCacheRoot);
    expect(snapshot.entries).toEqual(LOCKED_DND5E_V14_SPELLS);
    expect(snapshot.entries).toHaveLength(319);
    expect(renderV14SpellSnapshot(snapshot)).toBe(readFileSync(
      'packages/forge-browser-runtime/src/browser-v14-spell-data.ts',
      'utf8',
    ));
  });

  test('the actual browser-built v14 adapter matches the Node resolver for all 319 locked spells', async () => {
    const runtime = await browserRuntime();
    for (const spell of LOCKED_DND5E_V14_SPELLS) {
      expect(runtime.resolveLockedDnd5eV14Spell(spell.identifier, spell.name)).toEqual({
        identifier: spell.identifier,
        name: spell.name,
        uuid: spell.uuid,
      });
      expect(resolveNodeV14Spell(spell.identifier, spell.name)).toEqual({
        identifier: spell.identifier,
        name: spell.name,
        uuid: spell.uuid,
      });
    }
  });

  test.each([
    ['accepted', 'accepted', 'accepted', 'accepted'],
    ['needs_review', 'accepted', 'accepted', 'needs_review'],
    ['accepted', 'needs_review', 'accepted', 'needs_review'],
    ['accepted', 'accepted', 'needs_review', 'needs_review'],
    ['failed', 'accepted', 'accepted', 'failed'],
  ] as const)('AI outer status never becomes more optimistic (%s/%s/%s)', (formal, review, intake, expected) => {
    expect(resolveActorIntakeStatus(formal, review, intake)).toBe(expected);
  });

  test('browser-built v12 caster preserves legacy spell Activity linkage and artifact hash', async () => {
    const request = buildForgeActorRequest({
      content: NIGHTGAUNT_CASTER_SOURCE,
      displayName: 'Nightgaunt Caster',
      requestId: 'browser-caster-v12',
      fvttVersion: '12.331',
      systemVersion: '4.3.9',
    });
    const nodeResponse = await convertFinalActorSource(request);
    const browserResponse = await browserRuntime().then((runtime) => runtime.convertFinalActorSource(request));
    if (!('result' in nodeResponse) || nodeResponse.result.status !== 'accepted' || !('artifact' in nodeResponse.result)) {
      throw new Error(`Expected accepted Node caster response: ${JSON.stringify(nodeResponse)}`);
    }
    if (!('result' in browserResponse) || browserResponse.result.status !== 'accepted' || !('artifact' in browserResponse.result)) {
      throw new Error(`Expected accepted browser caster response: ${JSON.stringify(browserResponse)}`);
    }
    const nodeSpellcasting = (nodeResponse.result.artifact.items as Array<Record<string, any>>).find((item) => item.name === '施法');
    const browserSpellcasting = (browserResponse.result.artifact.items as Array<Record<string, any>>).find((item) => item.name === '施法');
    const nodeActivity = Object.values(nodeSpellcasting?.system?.activities ?? {})[0] as Record<string, any> | undefined;
    expect(nodeActivity).toMatchObject({ type: 'cast', spell: { uuid: '23af52db33017be0' } });
    expect(browserSpellcasting?.system?.activities).toEqual(nodeSpellcasting?.system?.activities);
    expect(browserResponse.result.artifactHash).toBe(nodeResponse.result.artifactHash);
  });

  test('browser-built v14 caster preserves locked Fireball Activity linkage and artifact hash', async () => {
    const request = buildForgeActorRequest({
      content: NIGHTGAUNT_CASTER_SOURCE,
      displayName: 'Nightgaunt V14 Caster',
      requestId: 'browser-caster-v14',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    });
    const nodeResponse = await convertFinalActorSource(request);
    const browserResponse = await browserRuntime().then((runtime) => runtime.convertFinalActorSource(request));
    if (!('result' in nodeResponse) || nodeResponse.result.status !== 'accepted' || !('artifact' in nodeResponse.result)) {
      throw new Error(`Expected accepted Node v14 caster response: ${JSON.stringify(nodeResponse)}`);
    }
    if (!('result' in browserResponse) || browserResponse.result.status !== 'accepted' || !('artifact' in browserResponse.result)) {
      throw new Error(`Expected accepted browser v14 caster response: ${JSON.stringify(browserResponse)}`);
    }
    const nodeSpellcasting = (nodeResponse.result.artifact.items as Array<Record<string, any>>).find((item) => item.name === '施法');
    const browserSpellcasting = (browserResponse.result.artifact.items as Array<Record<string, any>>).find((item) => item.name === '施法');
    const nodeActivity = Object.values(nodeSpellcasting?.system?.activities ?? {})[0] as Record<string, any> | undefined;
    expect(nodeActivity).toMatchObject({ type: 'cast', spell: { uuid: '23af52db33017be0' } });
    expect(browserSpellcasting?.system?.activities).toEqual(nodeSpellcasting?.system?.activities);
    expect(browserResponse.result.artifactHash).toBe(nodeResponse.result.artifactHash);
  });

  test('browser-built runtime downgrades an accepted legacy cast when dnd5e 5.3.3 has no unique Item target', async () => {
    const unresolvedCaster = NIGHTGAUNT_SOURCE.replace('背景: |-', '施法:\n  - "随意: ArcaneGate"\n背景: |-');
    const response = await (await browserRuntime()).convertFinalActorSource(buildForgeActorRequest({
      content: unresolvedCaster,
      displayName: 'Nightgaunt Unresolved Caster',
      requestId: 'browser-unresolved-caster-v14',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }));
    const decoded = decodeForgeActorResponse(response);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || !('result' in decoded.value)) throw new Error('Expected a decoded unresolved caster response.');
    expect(decoded.value.result.status).toBe('needs_review');
    expect(decoded.value.result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'FORGE_LEGACY_SPELL_TARGET_UNRESOLVED',
      severity: 'warning',
    }));
    expect('artifactHash' in decoded.value.result).toBe(false);
  });

  test('parses an English source with Forge metadata and keeps the output applyable', async () => {
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: ENGLISH_SOURCE,
      sourceId: SOURCE_ID,
      displayName: 'Forge English Actor',
      requestId: 'english-browser',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }));
    const decoded = decodeForgeActorResponse(response);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || !('result' in decoded.value)) throw new Error('Expected a decoded English Actor response.');
    expect(decoded.value.result.status).toBe('accepted');
    expect(decoded.value.result.actorVerification.actor.name).toBe('Forge English Actor');
    expect(decoded.value.result.diagnostics).toEqual([]);
  });

  test('generates a Forge ID when structured input does not already carry one', () => {
    const request = buildForgeActorRequest({
      content: NIGHTGAUNT_SOURCE,
      displayName: 'generated-id',
      requestId: 'generated-id',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    });
    expect(request.source.content).toMatch(/forge-source-id:\s*actor:v1:[0-9a-f-]{36}/u);
    expect(request.source.sourceId).toBeTruthy();
    expect(request.source.utf8Sha256).toBe(hashSource(request.source.content));
  });

  test('preserves a formal needs-review result and never projects it as accepted', async () => {
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: BOLBARA_SOURCE,
      sourceId: SOURCE_ID,
      displayName: 'Bolbara',
      requestId: 'needs-review-browser',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }));
    const decoded = decodeForgeActorResponse(response);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || !('result' in decoded.value)) throw new Error('Expected a decoded Bolbara response.');
    expect(decoded.value.result.status).toBe('needs_review');
    expect(decoded.value.result.diagnostics.some((diagnostic) => diagnostic.severity === 'warning')).toBe(true);
    expect('artifactHash' in decoded.value.result).toBe(false);
  });

  test('rejects empty and oversized input before parsing, while accepting the exact UTF-8 boundary', () => {
    expect(() => buildForgeActorRequest({
      content: ' \n\t ',
      sourceId: SOURCE_ID,
      displayName: 'empty',
      requestId: 'empty',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    })).toThrow(/empty/u);

    const exact = boundarySource(200_000);
    const exactDecoded = decodeForgeActorRequest(makeRequest(exact));
    expect(exactDecoded.ok).toBe(true);

    const oversized = boundarySource(200_001);
    const oversizedResponsePromise = convertFinalActorSource(makeRequest(oversized));
    return oversizedResponsePromise.then((response) => {
      expect('error' in response).toBe(true);
      if ('error' in response) expect(response.error.code).toBe('FORGE_INPUT_TOO_LARGE');
    });
  });

  test('runs discover, deterministic repair, render, review, and final browser conversion with one fake provider', async () => {
    const valid = buildRatWarlockIr();
    const invalid = {
      ...valid,
      source: { ...valid.source, sha256: 'not-the-source-hash' },
    } as MonsterIntakeIR;
    const calls = { discover: 0, extract: 0, repair: 0, review: 0 };
    const provider: MonsterIntakeAiProvider = {
      providerName: 'fake-browser-provider',
      extractionModel: 'fake-extract',
      reviewModel: 'fake-review',
      discover: async (): Promise<DiscoveryResult> => {
        calls.discover += 1;
        return {
          schemaVersion: 1,
          candidates: [{ id: 'rat-warlock', label: '鼠神邪术师', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE }],
        };
      },
      extract: async () => {
        calls.extract += 1;
        return invalid;
      },
      repair: async () => {
        calls.repair += 1;
        return valid;
      },
      review: async () => {
        calls.review += 1;
        return { schemaVersion: 1, verdict: 'accepted', findings: [] };
      },
    };

    const stageEvents: string[] = [];
    const result = await convertRawActorSourceWithAi({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'rat-warlock.raw.txt',
      displayName: '鼠神邪术师',
      requestId: 'fake-ai-browser',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
      sourceId: SOURCE_ID,
      onStage: (stage) => stageEvents.push(`${stage.stage}:${stage.status}`),
    }, provider);

    expect(calls).toEqual({ discover: 1, extract: 1, repair: 1, review: 1 });
    expect(result.status).toBe('accepted');
    expect(result.rawSourceHash).toBe(hashSource(RAT_WARLOCK_SOURCE));
    expect(result.finalSource).toContain(`forge-source-id: ${SOURCE_ID}`);
    expect(result.finalSourceHash).toBe(hashSource(result.finalSource!));
    expect(result.response && 'result' in result.response ? result.response.result.status : 'failed').toBe('accepted');
    expect(result.findings.some((finding) => finding.blocking)).toBe(false);
    expect(result.findings.map((finding) => finding.code)).not.toContain('SOURCE_HASH_MISMATCH');
    expect(result.findings.map((finding) => finding.code)).not.toContain('INVALID_SOURCE_SHA256');
    expect(result.stages.map((stage) => stage.stage)).toEqual(['discover', 'extract', 'validate', 'repair', 'generate', 'review', 'finalize']);
    expect(stageEvents[0]).toBe('discover:running');
    expect(stageEvents.at(-1)).toBe('finalize:completed');
    expect(result.evidence).toMatchObject({
      candidate: { start: 0, end: RAT_WARLOCK_SOURCE.length },
      source: { sha256: hashSource(RAT_WARLOCK_SOURCE), length: RAT_WARLOCK_SOURCE.length },
      claims: expect.any(Array),
      coverage: expect.any(Array),
    });
    expect(JSON.stringify(result)).not.toContain('fake-api-key');
  });

  test('never turns multiple discovery candidates or cancellation into an Actor response', async () => {
    let extractionCalls = 0;
    const provider: MonsterIntakeAiProvider = {
      providerName: 'fake-boundary-provider',
      extractionModel: 'fake',
      reviewModel: 'fake',
      discover: async () => ({
        schemaVersion: 1,
        candidates: [
          { id: 'a', label: 'a', start: 0, end: 1, quote: RAT_WARLOCK_SOURCE.slice(0, 1) },
          { id: 'b', label: 'b', start: 1, end: 2, quote: RAT_WARLOCK_SOURCE.slice(1, 2) },
        ],
      }),
      extract: async () => {
        extractionCalls += 1;
        return buildRatWarlockIr();
      },
      repair: async () => buildRatWarlockIr(),
      review: async () => ({ schemaVersion: 1, verdict: 'accepted', findings: [] }),
    };
    const multiple = await convertRawActorSourceWithAi({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'multiple',
      requestId: 'multiple',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }, provider);
    expect(multiple.status).toBe('needs_review');
    expect(multiple.errorCode).toBe('multiple_entities');
    expect(multiple.response).toBeUndefined();
    expect(extractionCalls).toBe(0);

    const controller = new AbortController();
    controller.abort();
    const cancelled = await convertRawActorSourceWithAi({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'cancelled',
      requestId: 'cancelled',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }, provider, controller.signal);
    expect(cancelled.status).toBe('failed');
    expect(cancelled.errorCode).toBe('cancelled');
    expect(cancelled.response).toBeUndefined();
  });

  test('normalizes overlapping chunk discoveries exactly like the formal Node Intake', async () => {
    const longSource = `${RAT_WARLOCK_SOURCE}\n${'x'.repeat(24_500 - RAT_WARLOCK_SOURCE.length - 1)}`;
    let extractionCalls = 0;
    const provider: MonsterIntakeAiProvider = {
      providerName: 'fake-overlap-provider',
      extractionModel: 'fake',
      reviewModel: 'fake',
      discover: async (request) => request.chunkStart === 0
        ? { schemaVersion: 1, candidates: [{ id: 'same-actor', label: 'same', start: 0, end: 24_000, quote: longSource.slice(0, 24_000) }] }
        : { schemaVersion: 1, candidates: [{ id: 'same-actor', label: 'same', start: 23_000, end: longSource.length, quote: longSource.slice(23_000) }] },
      extract: async () => {
        extractionCalls += 1;
        return buildRatWarlockIr();
      },
      repair: async () => buildRatWarlockIr(),
      review: async () => ({ schemaVersion: 1, verdict: 'accepted', findings: [] }),
    };

    const result = await convertRawActorSourceWithAi({
      source: longSource,
      sourceName: 'overlap',
      requestId: 'overlap',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }, provider);

    expect(extractionCalls).toBe(1);
    expect(result.errorCode).not.toBe('multiple_entities');
  });

  test('never reports accepted when the final AI review still carries a blocking finding', async () => {
    const provider: MonsterIntakeAiProvider = {
      providerName: 'fake-blocking-review-provider',
      extractionModel: 'fake',
      reviewModel: 'fake',
      discover: async () => ({
        schemaVersion: 1,
        candidates: [{ id: 'rat-warlock', label: '鼠神邪术师', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE }],
      }),
      extract: async () => buildRatWarlockIr(),
      repair: async () => buildRatWarlockIr(),
      review: async () => ({
        schemaVersion: 1,
        verdict: 'accepted',
        findings: [{
          id: 'blocking-review',
          code: 'AI_REVIEW_BLOCKING',
          path: '/actor',
          message: 'Review still found a blocking mismatch.',
          blocking: true,
          origin: 'ai-review',
        }],
      }),
    };

    const result = await convertRawActorSourceWithAi({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'blocking-review',
      requestId: 'blocking-review',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
      sourceId: SOURCE_ID,
    }, provider);

    expect(result.status).toBe('needs_review');
    expect(result.findings).toContainEqual(expect.objectContaining({ id: 'blocking-review', blocking: true }));
  });

  test('fails closed when any discovered Actor candidate does not match the exact source', async () => {
    let extractionCalls = 0;
    const provider: MonsterIntakeAiProvider = {
      providerName: 'fake-invalid-candidate-provider',
      extractionModel: 'fake',
      reviewModel: 'fake',
      discover: async () => ({
        schemaVersion: 1,
        candidates: [
          { id: 'first', label: 'first', start: 0, end: 1, quote: RAT_WARLOCK_SOURCE.slice(0, 1) },
          { id: 'second', label: 'second', start: 99_999, end: 100_000, quote: '\u0000-not-in-source' },
        ],
      }),
      extract: async () => {
        extractionCalls += 1;
        return buildRatWarlockIr();
      },
      repair: async () => buildRatWarlockIr(),
      review: async () => ({ schemaVersion: 1, verdict: 'accepted', findings: [] }),
    };

    const result = await convertRawActorSourceWithAi({
      source: RAT_WARLOCK_SOURCE,
      sourceName: 'invalid-second-candidate',
      requestId: 'invalid-second-candidate',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }, provider);

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('invalid_response');
    expect(result.response).toBeUndefined();
    expect(extractionCalls).toBe(0);
  });

  test('does not hash invalid raw AI input before enforcing the browser byte policy', async () => {
    const unusedProvider = {} as MonsterIntakeAiProvider;
    const empty = await convertRawActorSourceWithAi({
      source: ' \n\t ',
      sourceName: 'empty',
      requestId: 'empty-ai',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }, unusedProvider);
    expect(empty.status).toBe('failed');
    expect(empty.errorCode).toBe('input_empty');
    expect(empty.rawSourceHash).toBeUndefined();

    const tooLarge = await convertRawActorSourceWithAi({
      source: '中'.repeat(100_001),
      sourceName: 'large',
      requestId: 'large-ai',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }, unusedProvider);
    expect(tooLarge.status).toBe('failed');
    expect(tooLarge.errorCode).toBe('input_too_large');
    expect(tooLarge.rawSourceHash).toBeUndefined();
  });

  test('reports HTTPS, auth, rate-limit, timeout, invalid-response, and honest browser transport failures safely', async () => {
    expect(() => createBrowserAiProvider({
      apiKey: 'secret-key',
      baseUrl: 'http://insecure.example/v1',
      model: 'extractor',
    })).toThrow(/HTTPS/u);

    const originalFetch = globalThis.fetch;
    try {
      const cases = [
        { name: '401', status: 401, errorCode: 'http_error', message: /HTTP 401/u },
        { name: '403', status: 403, errorCode: 'http_error', message: /HTTP 403/u },
        { name: '429', status: 429, errorCode: 'rate_limited', message: /rate limited/u },
      ] as const;
      for (const scenario of cases) {
        globalThis.fetch = (async () => new Response('', { status: scenario.status })) as unknown as typeof fetch;
        const result = await convertRawActorSourceWithAi({
          source: RAT_WARLOCK_SOURCE,
          sourceName: scenario.name,
          requestId: `provider-${scenario.name}`,
          fvttVersion: '14.364',
          systemVersion: '5.3.3',
        }, createBrowserAiProvider({
          apiKey: 'secret-key',
          baseUrl: 'https://provider.example/v1',
          model: 'extractor',
        }));
        expect(result.status).toBe('failed');
        expect(result.errorCode).toBe(scenario.errorCode);
        expect(result.stages.at(-1)?.message).toMatch(scenario.message);
        expect(JSON.stringify(result)).not.toContain('secret-key');
      }

      globalThis.fetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
      const invalid = await convertRawActorSourceWithAi({
        source: RAT_WARLOCK_SOURCE,
        sourceName: 'invalid-response',
        requestId: 'provider-invalid-response',
        fvttVersion: '14.364',
        systemVersion: '5.3.3',
      }, createBrowserAiProvider({
        apiKey: 'secret-key',
        baseUrl: 'https://provider.example/v1',
        model: 'extractor',
      }));
      expect(invalid.status).toBe('failed');
      expect(invalid.errorCode).toBe('invalid_response');
      expect(invalid.stages.at(-1)?.message).toMatch(/invalid schema/u);

      let transportCalls = 0;
      globalThis.fetch = (async () => {
        transportCalls += 1;
        throw new TypeError('Failed to fetch');
      }) as unknown as typeof fetch;
      const transport = await convertRawActorSourceWithAi({
        source: RAT_WARLOCK_SOURCE,
        sourceName: 'browser-transport',
        requestId: 'provider-browser-transport',
        fvttVersion: '14.364',
        systemVersion: '5.3.3',
      }, createBrowserAiProvider({
        apiKey: 'secret-key',
        baseUrl: 'https://provider.example/v1',
        model: 'extractor',
      }));
      expect(transport.status).toBe('failed');
      expect(transport.errorCode).toBe('browser_transport');
      expect(transport.stages.at(-1)?.message).toMatch(/unreachable or blocked by CORS/u);
      expect(transportCalls).toBe(2);
      expect(JSON.stringify(transport)).not.toContain('secret-key');

      globalThis.fetch = ((_request: RequestInfo | URL, init?: RequestInit) => new Promise<never>((_resolve, reject) => {
        const signal = init?.signal;
        const rejectAborted = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
        if (signal?.aborted) rejectAborted();
        else signal?.addEventListener('abort', rejectAborted, { once: true });
      })) as unknown as typeof fetch;
      const timeout = await convertRawActorSourceWithAi({
        source: RAT_WARLOCK_SOURCE,
        sourceName: 'timeout',
        requestId: 'provider-timeout',
        fvttVersion: '14.364',
        systemVersion: '5.3.3',
      }, createBrowserAiProvider({
        apiKey: 'secret-key',
        baseUrl: 'https://provider.example/v1',
        model: 'extractor',
        timeoutMs: 1,
        repairTimeoutMs: 1,
      }));
      expect(timeout.status).toBe('failed');
      expect(timeout.errorCode).toBe('timeout');
      expect(timeout.stages.at(-1)?.message).toMatch(/timed out/u);
      expect(JSON.stringify(timeout)).not.toContain('secret-key');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  test('stops a cancelled browser provider request without starting a retry', async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    let calls = 0;
    try {
      globalThis.fetch = ((_request: RequestInfo | URL, init?: RequestInit) => {
        calls += 1;
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          const rejectAborted = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
          if (signal?.aborted) rejectAborted();
          else signal?.addEventListener('abort', rejectAborted, { once: true });
        });
      }) as unknown as typeof fetch;

      const provider = createBrowserAiProvider({
        apiKey: 'secret-key',
        baseUrl: 'https://provider.example/v1',
        model: 'extractor',
      }, controller.signal);
      const pending = provider.discover({
        source: RAT_WARLOCK_SOURCE,
        sourceSha256: hashSource(RAT_WARLOCK_SOURCE),
        chunkStart: 0,
        chunkEnd: RAT_WARLOCK_SOURCE.length,
      });
      await Promise.resolve();
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function makeRequest(content: string): ForgeActorRequest {
  return {
    protocolVersion: 1,
    capabilityId: 'actor.standard.generate.v1',
    requestId: 'boundary',
    source: {
      displayName: 'Boundary Actor',
      content,
      sourceId: SOURCE_ID,
      utf8Sha256: hashSource(content),
    },
    foundryRuntime: { fvttVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3' },
    resolvedTarget: { generatorProfile: 'v14', effectProfile: 'core', iconMode: 'off' },
  };
}

function boundarySource(byteLength: number): string {
  const prefix = `---\nforge-source-id: ${SOURCE_ID}\n名称: Boundary\n---\n`;
  const remaining = byteLength - new TextEncoder().encode(prefix).byteLength;
  if (remaining < 0) throw new Error('Boundary fixture prefix is larger than the requested byte length.');
  return prefix + '中'.repeat(Math.floor(remaining / 3)) + 'x'.repeat(remaining % 3);
}

let builtBrowserRuntime: Promise<{
  convertFinalActorSource: (request: ForgeActorRequest) => Promise<ForgeActorResponse>;
  resolveLockedDnd5eV14Spell: (identifier: string, name: string) => { identifier: string; name: string; uuid: string } | undefined;
}> | undefined;

async function browserRuntime(): Promise<{
  convertFinalActorSource: (request: ForgeActorRequest) => Promise<ForgeActorResponse>;
  resolveLockedDnd5eV14Spell: (identifier: string, name: string) => { identifier: string; name: string; uuid: string } | undefined;
}> {
  if (!builtBrowserRuntime) {
    builtBrowserRuntime = (async () => {
      const outdir = await mkdtemp(resolve(tmpdir(), 'fvtt-json-forge-browser-'));
      try {
        const entrypoint = resolve('foundry-modules/fvtt-json-forge/tests/fixtures/browser-runtime-entry.ts');
        const bundlePath = await buildBrowserBundle({ entrypoint, outdir, naming: 'runtime.js' });
        const bundle = await readFile(bundlePath, 'utf8');
        expect(bundle).not.toMatch(/process\.env|\bBun\.|(?:from|require)\s*\(?\s*["'](?:node:|fs|path|sharp|crawlee)/iu);
        return await import(pathToFileURL(bundlePath).href) as {
          convertFinalActorSource: (request: ForgeActorRequest) => Promise<ForgeActorResponse>;
          resolveLockedDnd5eV14Spell: (identifier: string, name: string) => { identifier: string; name: string; uuid: string } | undefined;
        };
      } finally {
        await rm(outdir, { recursive: true });
      }
    })();
  }
  return builtBrowserRuntime;
}

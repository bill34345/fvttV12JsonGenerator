import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  attachForgeSourceId,
  decodeForgeActorRequest,
  decodeForgeActorResponse,
  hashArtifact,
  hashSource,
  projectForgeDiagnostics,
  projectForgeVerification,
  requireForgeAcceptedVerification,
  resolveForgeTarget,
  type ForgeActorResponse,
  type ForgeSourceId,
  type JsonObject,
  type JsonValue,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  conversionApplication,
  type ConversionResult,
} from '../src/core/application/conversion';
import { EnglishBestiaryParser } from '@fvtt-json-generator/parser/english';
import { YamlParser } from '@fvtt-json-generator/parser/yaml';

const NIGHTGAUNT_SOURCE = resolve('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md');
const BOLBARA_SOURCE = resolve('obsidian/dnd数据转fvttjson/input/bolbara.md');
const OPTIONAL_HIT_DICE_OUTCOME_SOURCES = [
  resolve('obsidian/dnd数据转fvttjson/input/deaths-embrace__死亡之拥.md'),
  resolve('obsidian/dnd数据转fvttjson/input/开发用数据.md'),
] as const;
const SOURCE_ID = 'actor:v1:123e4567-e89b-42d3-a456-426614174000' as ForgeSourceId;
const SOURCE_CONTENT = readFileSync(NIGHTGAUNT_SOURCE, 'utf8');
const FINAL_SOURCE = attachForgeSourceId(SOURCE_CONTENT, SOURCE_ID).content;
const ENGLISH_SOURCE = attachForgeSourceId([
  '---',
  'layout: creature',
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
].join('\n'), SOURCE_ID).content;

describe('Forge protocol/workflow conformance', () => {
  test.each([
    ['12.331', '12', '12.331', '4.3.9'],
    ['13.340', '13', '13.340', '4.3.9'],
    ['14.364', '14', '14.364', '5.3.3'],
  ] as const)('passes one final Nightgaunt source through request, workflow, and response for FVTT %s', async (runtimeVersion, workflowTargetVersion, expectedCoreVersion, systemVersion) => {
    const request = actorRequest(FINAL_SOURCE, runtimeVersion, systemVersion);
    const decodedRequest = decodeForgeActorRequest(request);
    expect(decodedRequest.ok).toBe(true);
    if (!decodedRequest.ok) throw new Error('Expected the final Forge source request to decode.');

    const finalContent = decodedRequest.value.source.content;
    expect(finalContent).toBe(FINAL_SOURCE);
    expect(decodedRequest.value.source.utf8Sha256).toBe(hashSource(finalContent));

    const route = resolveForgeTarget(runtimeVersion);
    const generated = await conversionApplication.convertContent({
      content: finalContent,
      fvttVersion: route.workflowTargetVersion,
      effectProfile: 'core',
    });

    expect(route.workflowTargetVersion).toBe(workflowTargetVersion);
    expect(generated.kind).toBe('actor');
    expect(generated.status).toBe('accepted');
    expect(generated.verification.target.stats.coreVersion).toBe(expectedCoreVersion);

    const response = toForgeAcceptedResponse(
      generated,
      runtimeVersion,
      route.generatorProfile,
      decodedRequest.value.source.sourceId,
      finalContent,
    );
    const decodedResponse = decodeForgeActorResponse(response);
    expect(decodedResponse.ok).toBe(true);
    if (!decodedResponse.ok || !('result' in decodedResponse.value)) {
      throw new Error('Expected the accepted Forge response to decode.');
    }
    if (decodedResponse.value.result.status !== 'accepted') {
      throw new Error(`Expected accepted Forge result, received ${decodedResponse.value.result.status}.`);
    }

    expect(decodedResponse.value.result.sourceIdentity.sourceId).toBe(decodedRequest.value.source.sourceId);
    expect(decodedResponse.value.result.sourceIdentity.sourceHash).toBe(decodedRequest.value.source.utf8Sha256);
    expect(decodedResponse.value.result.artifactHash).toBe(hashArtifact(requireJsonObject(generated.rawJson)));
    expect(JSON.stringify(response)).not.toMatch(/sourcePath|actorPath|localCache|dnd5eRepo|reference/u);
  });

  test('accepts an English Actor source carrying the same Forge identity field', async () => {
    const request = actorRequest(ENGLISH_SOURCE, '14.364', '5.3.3');
    const decodedRequest = decodeForgeActorRequest(request);
    expect(decodedRequest.ok).toBe(true);
    if (!decodedRequest.ok) throw new Error('Expected the English Forge source request to decode.');

    const generated = await conversionApplication.convertContent({
      content: decodedRequest.value.source.content,
      fvttVersion: '14',
      effectProfile: 'core',
    });
    expect(generated.status).toBe('accepted');
    expect(generated.actorVerification?.warnings).toEqual([]);

    const response = toForgeAcceptedResponse(
      generated,
      '14.364',
      'v14',
      decodedRequest.value.source.sourceId,
      decodedRequest.value.source.content,
    );
    expect(decodeForgeActorResponse(response).ok).toBe(true);
  });

  test('keeps optional hit-dice outcomes JSON-safe through the full Forge response', async () => {
    for (const sourcePath of OPTIONAL_HIT_DICE_OUTCOME_SOURCES) {
      const finalSource = attachForgeSourceId(readFileSync(sourcePath, 'utf8'), SOURCE_ID).content;
      const decodedRequest = decodeForgeActorRequest(actorRequest(finalSource, '14.364', '5.3.3'));
      expect(decodedRequest.ok).toBe(true);
      if (!decodedRequest.ok) throw new Error(`Expected ${sourcePath} Forge request to decode.`);

      const generated = await conversionApplication.convertContent({
        content: decodedRequest.value.source.content,
        fvttVersion: '14',
        effectProfile: 'core',
      });
      expect(generated.status).toBe('accepted');
      const response = toForgeAcceptedResponse(
        generated,
        '14.364',
        'v14',
        decodedRequest.value.source.sourceId,
        decodedRequest.value.source.content,
      );
      expect(decodeForgeActorResponse(response).ok).toBe(true);
    }
  });

  test('projects existing accepted Actors with empty creature type and heal activities', async () => {
    const cases = [
      ['obsidian/dnd数据转fvttjson/input/white-tusk-shaman.md', 'empty-creature-type'],
      ['obsidian/dnd数据转fvttjson/input/scuttling-serpentmaw__蛇口蛮蟹.md', 'heal-activity'],
    ] as const;

    for (const [sourcePath, expectation] of cases) {
      const finalSource = attachForgeSourceId(readFileSync(resolve(sourcePath), 'utf8'), SOURCE_ID).content;
      const decodedRequest = decodeForgeActorRequest(actorRequest(finalSource, '14.364', '5.3.3'));
      expect(decodedRequest.ok).toBe(true);
      if (!decodedRequest.ok) throw new Error(`Expected ${sourcePath} to decode as a Forge request.`);

      const generated = await conversionApplication.convertContent({
        content: decodedRequest.value.source.content,
        fvttVersion: '14',
        effectProfile: 'core',
      });
      expect(generated.status).toBe('accepted');
      expect(generated.actorVerification?.warnings).toEqual([]);
      if (generated.status !== 'accepted' || generated.actorVerification === null) {
        throw new Error(`Expected ${sourcePath} to produce accepted Actor verification.`);
      }

      const projection = projectForgeVerification({
        verification: generated.verification,
        actorVerification: generated.actorVerification,
      });
      if (expectation === 'empty-creature-type') {
        expect(generated.actorVerification.actor.creatureType).toBe('');
        expect(projection.actorVerification.actor.creatureType).toBe('');
      } else {
        expect(generated.actorVerification.items.some((item) => item.activityTypes.includes('heal'))).toBe(true);
        expect(projection.actorVerification.items.some((item) => item.activityTypes.includes('heal'))).toBe(true);
      }

      const response = toForgeAcceptedResponse(
        generated,
        '14.364',
        'v14',
        decodedRequest.value.source.sourceId,
        decodedRequest.value.source.content,
      );
      const decodedResponse = decodeForgeActorResponse(response);
      expect(decodedResponse.ok).toBe(true);
      if (expectation === 'empty-creature-type') {
        if (!decodedResponse.ok || !('result' in decodedResponse.value)) {
          throw new Error(`Expected ${sourcePath} to produce a decoded Forge result.`);
        }
        expect(decodedResponse.value.result.actorVerification.actor.creatureType).toBe('');
      }
    }
  });

  test('carries a real needs-review Actor through the safe response without making it applyable', async () => {
    const finalSource = attachForgeSourceId(readFileSync(BOLBARA_SOURCE, 'utf8'), SOURCE_ID).content;
    const decodedRequest = decodeForgeActorRequest(actorRequest(finalSource, '14.364', '5.3.3'));
    expect(decodedRequest.ok).toBe(true);
    if (!decodedRequest.ok) throw new Error('Expected Bolbara Forge request to decode.');

    const generated = await conversionApplication.convertContent({
      content: decodedRequest.value.source.content,
      fvttVersion: '14',
      effectProfile: 'core',
    });
    expect(generated.status).toBe('needs_review');
    if (generated.status !== 'needs_review' || generated.actorVerification === null) {
      throw new Error('Expected Bolbara to produce a review-gated Actor result.');
    }
    const projection = projectForgeVerification({
      verification: generated.verification,
      actorVerification: generated.actorVerification,
    });
    const response: ForgeActorResponse = {
      protocolVersion: 1,
      requestId: 'conformance-request',
      result: {
        sourceIdentity: {
          sourceId: decodedRequest.value.source.sourceId,
          sourceHash: decodedRequest.value.source.utf8Sha256,
        },
        target: {
          fvttRuntimeVersion: '14.364',
          generatorProfile: 'v14',
          generatorVersion: '0.1.0',
          systemId: 'dnd5e',
          systemVersionObserved: generated.verification.target.stats.systemVersion,
          effectProfile: 'core',
          iconMode: 'off',
        },
        diagnostics: projectForgeDiagnostics(generated.diagnostics),
        verification: projection.verification,
        actorVerification: projection.actorVerification,
        status: 'needs_review',
      },
    };
    const decodedResponse = decodeForgeActorResponse(response);
    expect(decodedResponse.ok).toBe(true);
    if (!decodedResponse.ok || !('result' in decodedResponse.value)) {
      throw new Error('Expected the review-gated Forge response to decode.');
    }
    expect(decodedResponse.value.result.status).toBe('needs_review');
    expect(Object.prototype.hasOwnProperty.call(decodedResponse.value.result, 'artifactHash')).toBe(false);
  });

  test('parsers consume only a valid root Forge identity field and reject invalid metadata', () => {
    const yamlParser = new YamlParser();
    const chinese = yamlParser.parse([
      '---',
      `forge-source-id: ${SOURCE_ID}`,
      '名称: 元数据测试生物',
      '类型: npc',
      '---',
      '正文',
    ].join('\n'));
    expect(chinese.name).toBe('元数据测试生物');
    expect(Object.prototype.hasOwnProperty.call(chinese, 'forge-source-id')).toBe(false);

    const englishParser = new EnglishBestiaryParser();
    const english = englishParser.parse(ENGLISH_SOURCE);
    expect(english.name).toBe('Forge English Actor');

    expect(() => yamlParser.parse([
      '---',
      'forge-source-id: actor:v1:not-a-uuid',
      '名称: 非法 ID',
      '---',
    ].join('\n'))).toThrow(/forge-source-id/u);
    expect(() => englishParser.parse(ENGLISH_SOURCE.replace(SOURCE_ID, 'actor:v1:not-a-uuid'))).toThrow(/forge-source-id/u);
    expect(() => yamlParser.parse([
      '---',
      `forge-source-id: ${SOURCE_ID}`,
      `forge-source-id: ${SOURCE_ID}`,
      '名称: 重复 ID',
      '---',
    ].join('\n'))).toThrow();
    expect(() => yamlParser.parse([
      '---',
      `forge-source-id: ${SOURCE_ID}`,
      '未声明叶子字段: 不应静默接受',
      '---',
    ].join('\n'))).toThrow(/Unknown field/u);
  });

  test('keeps source identity and artifact semantics separate when adding Forge metadata', async () => {
    const original = await convertWithStableVolatileFields(SOURCE_CONTENT);
    const withIdentity = await convertWithStableVolatileFields(FINAL_SOURCE);

    expect(original.status).toBe('accepted');
    expect(withIdentity.status).toBe('accepted');
    expect(hashSource(SOURCE_CONTENT)).not.toBe(hashSource(FINAL_SOURCE));
    expect(hashArtifact(requireJsonObject(original.rawJson))).toBe(hashArtifact(requireJsonObject(withIdentity.rawJson)));
  });

  test('reports forward fallback before a dnd5e version warning without claiming v15 support', () => {
    const decoded = decodeForgeActorRequest(actorRequest(FINAL_SOURCE, '15.0.0', '4.3.9'));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('Expected FVTT 15 to use the v14 fallback.');
    expect(decoded.value.resolvedTarget.generatorProfile).toBe('v14');
    expect(decoded.warnings?.map((warning) => warning.code)).toEqual([
      'FORGE_FORWARD_FALLBACK',
      'FORGE_SYSTEM_VERSION_UNVERIFIED',
    ]);
    expect(decoded.warnings?.[0]?.path).toBe('$/foundryRuntime/fvttVersion');
  });
});

async function convertWithStableVolatileFields(content: string): Promise<ConversionResult> {
  // The existing generator assigns random effect IDs and wall-clock metadata.
  // Freeze those unrelated fields so this test compares the raw artifact hash
  // produced by the two otherwise identical parser inputs.
  const originalRandom = Math.random;
  const originalNow = Date.now;
  let randomState = 0x12345678;
  Math.random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x100000000;
  };
  Date.now = () => 1_800_000_000_000;
  try {
    return await conversionApplication.convertContent({
      content,
      fvttVersion: '14',
      effectProfile: 'core',
    });
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
  }
}

function actorRequest(content: string, runtimeVersion: string, systemVersion: string): Record<string, unknown> {
  const route = resolveForgeTarget(runtimeVersion);
  return {
    protocolVersion: 1,
    capabilityId: 'actor.standard.generate.v1',
    requestId: 'conformance-request',
    source: {
      displayName: 'Forge Actor',
      content,
      sourceId: SOURCE_ID,
      utf8Sha256: hashSource(content),
    },
    foundryRuntime: {
      fvttVersion: runtimeVersion,
      systemId: 'dnd5e',
      systemVersion,
    },
    resolvedTarget: {
      generatorProfile: route.generatorProfile,
      effectProfile: 'core',
      iconMode: 'off',
    },
  };
}

function toForgeAcceptedResponse(
  generated: ConversionResult,
  runtimeVersion: string,
  generatorProfile: 'v12' | 'v14',
  sourceId: ForgeSourceId,
  sourceContent: string,
): ForgeActorResponse {
  if (generated.status !== 'accepted' || generated.actorVerification === null) {
    throw new Error('Accepted Actor workflow result with actor verification is required.');
  }
  const artifact = requireJsonObject(generated.rawJson);
  const projection = projectForgeVerification({
    verification: generated.verification,
    actorVerification: generated.actorVerification,
  });
  return {
    protocolVersion: 1,
    requestId: 'conformance-request',
    result: {
      sourceIdentity: {
        sourceId,
        sourceHash: hashSource(sourceContent),
      },
      target: {
        fvttRuntimeVersion: runtimeVersion,
        generatorProfile,
        generatorVersion: '0.1.0',
        systemId: 'dnd5e',
        systemVersionObserved: generated.verification.target.stats.systemVersion,
        effectProfile: 'core',
        iconMode: 'off',
      },
      diagnostics: projectForgeDiagnostics(generated.diagnostics),
      verification: requireForgeAcceptedVerification(projection.verification),
      actorVerification: projection.actorVerification,
      status: 'accepted',
      artifact,
      artifactHash: hashArtifact(artifact),
    },
  };
}

function requireJsonObject(value: unknown): JsonObject {
  if (!isJsonObject(value)) throw new Error('Expected workflow artifact to be a JSON object.');
  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return isJsonValue(value) && typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown, stack = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || stack.has(value)) return false;
  if (Array.isArray(value)) {
    if (value.some((_, index) => !Object.prototype.hasOwnProperty.call(value, index))) return false;
  } else if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    return false;
  }
  stack.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isJsonValue(entry, stack))
    : Object.values(value).every((entry) => isJsonValue(entry, stack));
  stack.delete(value);
  return valid;
}

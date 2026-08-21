import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decodeForgeActorResponse,
  attachForgeSourceId,
  hashArtifact,
  hashSource,
  resolveForgeTarget,
  type ForgeActorResponse,
  type ForgeSourceId,
  type JsonObject,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  conversionApplication,
  type ConversionResult,
} from '../src/core/application/conversion';

const NIGHTGAUNT_SOURCE = resolve('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md');
const SOURCE_ID = 'actor:v1:123e4567-e89b-42d3-a456-426614174000' as ForgeSourceId;
const SOURCE_CONTENT = readFileSync(NIGHTGAUNT_SOURCE, 'utf8');
const FINAL_SOURCE = attachForgeSourceId(SOURCE_CONTENT, SOURCE_ID).content;

describe('Forge protocol/workflow conformance', () => {
  test.each([
    ['12.331', '12', '12.331'],
    ['13.340', '13', '13.340'],
    ['14.364', '14', '14.364'],
  ] as const)('adapts the existing accepted workflow result for FVTT %s', async (runtimeVersion, workflowTargetVersion, expectedCoreVersion) => {
    const content = SOURCE_CONTENT;
    const route = resolveForgeTarget(runtimeVersion);
    const generated = await conversionApplication.convertContent({
      content,
      fvttVersion: route.workflowTargetVersion,
      effectProfile: 'core',
    });

    expect(route.workflowTargetVersion).toBe(workflowTargetVersion);
    expect(generated.kind).toBe('actor');
    expect(generated.status).toBe('accepted');
    expect(generated.verification.target.stats.coreVersion).toBe(expectedCoreVersion);

    const response = toForgeAcceptedResponse(generated, runtimeVersion, route.generatorProfile, FINAL_SOURCE);
    const decoded = decodeForgeActorResponse(response);
    expect(decoded.ok).toBe(true);
  });

  test('keeps higher runtime routing explicit without claiming a v15 generator', () => {
    expect(resolveForgeTarget('15.0.0')).toMatchObject({
      generatorProfile: 'v14',
      workflowTargetVersion: '14',
      compatibility: 'forward-fallback',
    });
  });
});

function toForgeAcceptedResponse(
  generated: ConversionResult,
  runtimeVersion: string,
  generatorProfile: 'v12' | 'v14',
  sourceContent: string,
): ForgeActorResponse {
  const artifact = generated.rawJson as JsonObject;
  if (generated.actorVerification === null) throw new Error('Actor workflow must provide actorVerification.');
  const actorVerification = JSON.parse(JSON.stringify(generated.actorVerification)) as JsonObject;
  return {
    protocolVersion: 1,
    requestId: 'conformance-request',
    result: {
      sourceIdentity: {
        sourceId: 'actor:v1:123e4567-e89b-42d3-a456-426614174000' as ForgeSourceId,
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
      diagnostics: generated.diagnostics,
      verification: generated.verification as unknown as JsonObject,
      actorVerification,
      status: 'accepted',
      artifact,
      artifactHash: hashArtifact(artifact),
    },
  };
}

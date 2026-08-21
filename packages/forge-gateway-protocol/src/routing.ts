import type { FvttTargetVersion } from '@fvtt-json-generator/contracts/target';
import {
  FORGE_CAPABILITY_IDS,
  FORGE_GENERATOR_PROFILES,
  FORGE_PROTOCOL_VERSION,
  FORGE_SERVICE_ID,
  type ForgeActorCapability,
  type ForgeCapability,
  type ForgeGeneratorProfile,
  type ForgeSourceCreateCapability,
  type ForgeTargetResolution,
} from './types';

const VERSION_PATTERN = /^(0|[1-9]\d*)(?:\.\d+)*(?:[-+][0-9A-Za-z.-]+)?$/u;
const FORWARD_COMPATIBILITY_MESSAGE = '当前 FVTT 高于已开发版本，使用 v14 generator';

export const FORGE_VERSION_ROUTING = Object.freeze([
  { fvttMajor: 12, generatorProfile: 'v12', workflowTargetVersion: '12' },
  { fvttMajor: 13, generatorProfile: 'v12', workflowTargetVersion: '13' },
  { fvttMajor: 14, generatorProfile: 'v14', workflowTargetVersion: '14' },
] as const);

export const FORGE_DND5E_VERSION_BY_PROFILE = Object.freeze({
  v12: '4.3.9',
  v14: '5.3.3',
} as const);

export const FORGE_ACTOR_CAPABILITY: ForgeActorCapability = Object.freeze({
  id: 'actor.standard.generate.v1',
  systemId: 'dnd5e',
  generatorProfiles: FORGE_GENERATOR_PROFILES,
  versionRouting: FORGE_VERSION_ROUTING.map((entry) => ({
    fvttVersion: `${entry.fvttMajor}.x`,
    generatorProfile: entry.generatorProfile,
  })),
  maxInputUtf8Bytes: 200_000,
  maxConcurrentJobs: 1,
});

export const FORGE_SOURCE_CREATE_CAPABILITY: ForgeSourceCreateCapability = Object.freeze({
  id: 'source.actor.create.v1',
  sourceKind: 'actor',
  maxInputUtf8Bytes: 200_000,
  maxConcurrentJobs: 1,
});

export const FORGE_CAPABILITIES: readonly ForgeCapability[] = Object.freeze([
  FORGE_ACTOR_CAPABILITY,
  FORGE_SOURCE_CREATE_CAPABILITY,
]);

export const FORGE_PROTOCOL_INFO = Object.freeze({
  protocolVersion: FORGE_PROTOCOL_VERSION,
  service: FORGE_SERVICE_ID,
  capabilityIds: FORGE_CAPABILITY_IDS,
});

export function resolveForgeTarget(runtimeVersion: string): ForgeTargetResolution {
  if (typeof runtimeVersion !== 'string' || !VERSION_PATTERN.test(runtimeVersion)) {
    throw new Error('Unsupported Foundry runtime version: ' + String(runtimeVersion));
  }

  const runtimeMajor = Number.parseInt(runtimeVersion.split('.')[0]!, 10);
  if (!Number.isSafeInteger(runtimeMajor) || runtimeMajor < 12) {
    throw new Error('Unsupported Foundry runtime version: ' + runtimeVersion);
  }

  const direct = FORGE_VERSION_ROUTING.find((entry) => entry.fvttMajor === runtimeMajor);
  if (direct) {
    return {
      runtimeVersion,
      runtimeMajor,
      generatorProfile: direct.generatorProfile,
      workflowTargetVersion: direct.workflowTargetVersion,
      compatibility: 'supported',
      compatibilityMessage: undefined,
    };
  }

  return {
    runtimeVersion,
    runtimeMajor,
    generatorProfile: 'v14',
    workflowTargetVersion: '14',
    compatibility: 'forward-fallback',
    compatibilityMessage: FORWARD_COMPATIBILITY_MESSAGE,
  };
}

export function assertForgeTargetProfile(
  runtimeVersion: string,
  generatorProfile: ForgeGeneratorProfile,
): ForgeTargetResolution {
  const target = resolveForgeTarget(runtimeVersion);
  if (target.generatorProfile !== generatorProfile) {
    throw new Error(
      'Generator profile ' + generatorProfile + ' does not match FVTT ' + runtimeVersion
        + '; expected ' + target.generatorProfile + '.',
    );
  }
  return target;
}

export function getForgeDnd5eVersionWarning(runtimeVersion: string, observedSystemVersion: string): string | undefined {
  const target = resolveForgeTarget(runtimeVersion);
  const expectedSystemVersion = FORGE_DND5E_VERSION_BY_PROFILE[target.generatorProfile];
  if (observedSystemVersion === expectedSystemVersion) return undefined;
  return 'Observed dnd5e ' + observedSystemVersion + ' for FVTT ' + runtimeVersion
    + '; the ' + target.generatorProfile + ' generator is pinned to dnd5e ' + expectedSystemVersion
    + '. The generator mapping is unchanged.';
}

export type ForgeWorkflowTargetVersion = FvttTargetVersion;

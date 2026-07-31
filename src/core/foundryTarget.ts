import type { FvttTargetVersion, FoundryTarget } from './contracts/target';

export type { FvttTargetVersion, FoundryTarget } from './contracts/target';

const TARGETS: Record<FvttTargetVersion, FoundryTarget> = {
  '12': {
    fvttVersion: '12',
    dnd5eVersion: '4.3.9',
    stats: {
      coreVersion: '12.331',
      systemId: 'dnd5e',
      systemVersion: '4.3.9',
    },
    reference: {
      dnd5eRepo: 'references/dnd5e-4.3.9/repo',
    },
    effectProfiles: ['core', 'modded-v12'],
  },
  '13': {
    fvttVersion: '13',
    dnd5eVersion: '4.3.9',
    stats: {
      coreVersion: '13.340',
      systemId: 'dnd5e',
      systemVersion: '4.3.9',
    },
    reference: {
      dnd5eRepo: 'references/dnd5e-4.3.9/repo',
    },
    effectProfiles: ['core', 'modded-v12'],
  },
  '14': {
    fvttVersion: '14',
    dnd5eVersion: '5.3.3',
    stats: {
      coreVersion: '14.364',
      systemId: 'dnd5e',
      systemVersion: '5.3.3',
    },
    reference: {
      dnd5eRepo: '.local/references/dnd5e/5.3.3/repo',
      localCache: '.local/references/dnd5e/5.3.3/repo',
      requiredForGeneration: false,
    },
    modules: {
      midiQol: '14.0.11',
      dae: '14.0.12',
      timesUp: null,
      itemMacro: null,
    },
    effectProfiles: ['core', 'modded-v14'],
  },
};

export function parseFvttTargetVersion(value: unknown): FvttTargetVersion {
  const version = String(value ?? '12');
  if (version === '12' || version === '13' || version === '14') {
    return version;
  }

  throw new Error(`Unsupported Foundry target: ${version}. Use 12, 13, or 14.`);
}

export function getFoundryTarget(version: FvttTargetVersion): FoundryTarget {
  return TARGETS[version];
}

export function assertEffectProfileForTarget(version: FvttTargetVersion, profile: string): void {
  const target = getFoundryTarget(version);
  if (!target.effectProfiles.includes(profile)) {
    throw new Error(
      `Effect profile '${profile}' is not supported for Foundry v${version}. Use ${target.effectProfiles.join(' or ')}.`,
    );
  }
}

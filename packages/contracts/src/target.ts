export type FvttTargetVersion = '12' | '13' | '14';

/** Generation identity; a receiving runtime reports its own installed versions. */
export const FOUNDRY_V14_CORE_VERSION = '14.370' as const;
export const DND5E_V14_SYSTEM_VERSION = '6.0.6' as const;

export type EffectProfile = 'core' | 'modded-v12' | 'modded-v14';

export interface FoundryTarget {
  fvttVersion: FvttTargetVersion;
  dnd5eVersion: string;
  stats: {
    coreVersion: string;
    systemId: 'dnd5e';
    systemVersion: string;
  };
  reference: {
    dnd5eRepo: string;
    localCache?: string;
    requiredForGeneration?: boolean;
  };
  modules?: {
    midiQol: string | null;
    dae: string | null;
    timesUp: string | null;
    itemMacro: string | null;
  };
  effectProfiles: readonly string[];
}

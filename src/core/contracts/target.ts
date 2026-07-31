export type FvttTargetVersion = '12' | '13' | '14';

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

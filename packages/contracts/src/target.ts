export type FvttTargetVersion = '12' | '13' | '14';

/** Generation identity; a receiving runtime reports its own installed versions. */
export const FOUNDRY_V14_CORE_VERSION = '14.370' as const;
export const DND5E_V14_SYSTEM_VERSION = '6.0.6' as const;

/** dnd5e 6.0.6 spellScrollValues and equipment24 rarities, indexed by spell level. */
export const DND5E_V14_SPELL_SCROLL_LEVELS = [
  [13, 5, 'common'], [13, 5, 'common'], [13, 5, 'uncommon'], [15, 7, 'uncommon'], [15, 7, 'rare'],
  [17, 9, 'rare'], [17, 9, 'veryRare'], [18, 10, 'veryRare'], [18, 10, 'veryRare'], [19, 11, 'legendary'],
] as const;

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

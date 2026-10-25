import {
  WEAPON_MASTERY_IDS,
  officialMasteryRule,
  type WeaponMasteryId,
} from '@fvtt-json-generator/contracts/weapon-properties';

export const MODULE_ID = 'fvtt-weapon-mastery-properties' as const;
export const MODULE_VERSION = '0.1.0' as const;
export const MODULE_TITLE = '武器精通与特性 / Weapon Mastery & Properties' as const;
export const FOUNDRY_VERSION = '14.364' as const;
export const DND5E_VERSION = '5.3.3' as const;
export const NEXT_FOUNDRY_VERSION = '14.368' as const;
export const NEXT_DND5E_VERSION = '6.0.5' as const;
export const CURRENT_DND5E_VERSION = '6.0.6' as const;
export function isNative6Dnd5eVersion(version: unknown): boolean {
  return version === NEXT_DND5E_VERSION || version === CURRENT_DND5E_VERSION;
}

export const OFFICIAL_MASTERY_IDS = WEAPON_MASTERY_IDS;
export type OfficialMasteryId = WeaponMasteryId;
export const OFFICIAL_MASTERY_RULE_IDS = Object.fromEntries(
  WEAPON_MASTERY_IDS.map((kind) => [kind, officialMasteryRule(kind).ruleId]),
) as Readonly<Record<OfficialMasteryId, `dnd2024.${OfficialMasteryId}`>>;

export const HOUSE_RULE_KINDS = ['deadly', 'fatal', 'criticalBleeding'] as const;
export type HouseRuleKind = typeof HOUSE_RULE_KINDS[number];

/** Stable page IDs from the locked dnd5e 5.3.3 content24 appendix cache. */
export const OFFICIAL_RULE_REFERENCE_PAGE_IDS = {
  cleave: 'ULDpodOdTxTTiNEx',
  graze: 'PPnaXKPsQvAZp0J4',
  nick: 'l0uao3UVco5ptQso',
  push: 'BPD7ScnLyuPwl145',
  sap: 'fPkZQ7TkKCCA3nTc',
  slow: 'OQQ7hAp6OAxX1rXY',
  topple: 'IMnpuysdrSalmZJg',
  vex: 'hg3adn9O1O5Z2QxL',
} as const satisfies Record<OfficialMasteryId, string>;

export const DEFAULT_CLEAVE_DISTANCE_FEET = 5 as const;
export const DEFAULT_CLEAVE_MAX_USES = 1 as const;
export const DEFAULT_PUSH_DISTANCE_FEET = 10 as const;
export const DEFAULT_PUSH_MAX_SIZE_RANK = 3 as const;
export const DEFAULT_SLOW_REDUCTION_FEET = 10 as const;
export const DEFAULT_ONCE_PER_TURN = 1 as const;
export const MIN_DAMAGE_AMOUNT = 0 as const;

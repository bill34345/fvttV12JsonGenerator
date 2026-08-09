export const MODULE_ID = "fvtt-house-rules" as const;
export const MODULE_VERSION = "0.1.0" as const;
export const FOUNDRY_VERSION = "14.364" as const;
export const DND5E_VERSION = "5.3.3" as const;
export const MIDI_QOL_VERSION = "14.0.11" as const;
export const DAE_VERSION = "14.0.12" as const;

export const FLAG = {
  ledger: "ledger",
  ammoLedger: "ammoLedger",
  hpGamble: "hpGamble",
  stealth: "stealth",
  potion: "potion",
  potionSnapshot: "potionSnapshot",
  ammo: "ammo",
  weaponPenalty: "weaponPenalty",
  naturalRequest: "naturalRequest"
} as const;

export const SETTING = {
  schemaVersion: "schemaVersion",
  setupSeen: "setupSeen",
  potion: "featurePotion",
  hpGamble: "featureHpGamble",
  lowAbility: "featureLowAbility",
  ammo: "featureAmmo",
  stealth: "featureStealth",
  naturalOne: "featureNaturalOne",
  naturalTwenty: "featureNaturalTwenty",
  lowAbilityThreshold: "lowAbilityThreshold",
  consequenceMultiplier: "consequenceMultiplier",
  consequenceOtherTable: "consequenceOtherTable",
  stealthRogueLevel: "stealthRogueLevel"
} as const;

export const SCHEMA_VERSION = 1;
export const MAX_LEDGER_ENTRIES = 500;

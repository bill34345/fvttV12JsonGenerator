export const MODULE_ID = "fvtt-house-rules" as const;
export const MODULE_VERSION = "0.1.3" as const;
export const SUPPORTED_RUNTIMES = [
  { foundry: "14.364", dnd5e: "5.3.3" },
  { foundry: "14.368", dnd5e: "6.0.2" },
  { foundry: "14.368", dnd5e: "6.0.5" },
  { foundry: "14.368", dnd5e: "5.3.3" },
] as const;
export const MIDI_QOL_VERSIONS = ["14.0.11", "14.6.0-beta.4338eeab.local.9", null, "14.0.11"] as const;
export const DAE_VERSIONS = ["14.0.12", "14.0.14", null, "14.0.12"] as const;
export const DICE_SO_NICE_VERSIONS = ["6.2.9", "6.3.1", null, "6.2.9"] as const;

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

export const MODULE_ID = 'fvtt-injury-fading-spirits' as const;
export const MODULE_VERSION = '1.0.0' as const;
export const SCHEMA_VERSION = 1 as const;
export const INJURY_STATUS_ID = 'fvtt-injury' as const;
export const MAX_INJURY_STACKS = 3 as const;
export const SOCKET_NAME = `module.${MODULE_ID}` as const;
export const MAX_TRANSACTION_IDS = 128;
export const MAX_ATTEMPT_HISTORY = 100;

export const SETTINGS = {
  enabled: 'enabled',
  manageNpcs: 'manageNpcs',
  setupComplete: 'setupComplete',
} as const;

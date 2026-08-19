export const MODULE_ID = 'fvtt-selected-token-sync' as const;
export const MODULE_VERSION = '0.1.0' as const;
export const SETTING_ENABLED = 'enabled' as const;
export const SYNC_OPTION_KEY = `${MODULE_ID}.transaction` as const;
export const INTENT_TTL_MS = 10_000;

export type SyncKind = 'status' | 'movement';

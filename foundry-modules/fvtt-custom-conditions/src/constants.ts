export const MODULE_ID = 'fvtt-custom-conditions' as const;
export const MODULE_VERSION = '0.2.0' as const;
export const TRIGGER_ENGINE_MODULE_ID = 'fvtt-trigger-engine' as const;
export const CONDITION_MANAGER_MENU_KEY = 'conditionManager' as const;
export const CONDITION_MANAGER_CONTROL_NAME = 'openConditionManager' as const;

export const conditionFlagPath = (instanceId: string): string =>
  `flags.${MODULE_ID}.turns.${instanceId}`;

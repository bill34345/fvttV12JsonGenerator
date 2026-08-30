export const MODULE_ID = 'open-session-deck' as const;
export const MODULE_VERSION = '0.1.0' as const;
export const SUPPORTED_FOUNDRY_VERSION = '14.364' as const;
export const SUPPORTED_SYSTEM_ID = 'dnd5e' as const;
export const SUPPORTED_SYSTEM_VERSION = '5.3.3' as const;
export const TEMPLATE_PATH = `modules/${MODULE_ID}/templates/deck.hbs` as const;
export const STYLESHEET_PATH = `modules/${MODULE_ID}/styles/open-session-deck.css` as const;
export const POPOUT_NAME = 'open-session-deck' as const;

export const SETTINGS = {
  pinnedActors: 'pinnedActors',
  hiddenActors: 'hiddenActors',
  lastOpenMode: 'lastOpenMode',
  cardDensity: 'cardDensity',
  activeTab: 'activeTab',
} as const;

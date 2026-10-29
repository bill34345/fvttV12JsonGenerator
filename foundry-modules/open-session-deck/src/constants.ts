export const MODULE_ID = 'open-session-deck' as const;
export const MODULE_VERSION = '0.2.0' as const;
export const SUPPORTED_FOUNDRY_VERSION = '14.364' as const;
export const SUPPORTED_SYSTEM_ID = 'dnd5e' as const;
export const SUPPORTED_SYSTEM_VERSION = '5.3.3' as const;
export const SERVER_NEXT_FOUNDRY_VERSION = '14.368' as const;
export const SERVER_NEXT_SYSTEM_VERSIONS = ['6.0.2', '6.0.5', '6.0.6'] as const;
// ActiveEffect5e.ID.EXHAUSTION uses staticID(), which pads this seed to 16 characters.
export const SERVER_NEXT_EXHAUSTION_EFFECT_ID = 'dnd5eexhaustion0' as const;
export const TEMPLATE_PATH = `modules/${MODULE_ID}/templates/deck.hbs` as const;
export const POPOUT_DOCUMENT_PATH = `modules/${MODULE_ID}/templates/popout.html` as const;
export const STYLESHEET_PATH = `modules/${MODULE_ID}/styles/open-session-deck.css` as const;
export const POPOUT_NAME = 'open-session-deck' as const;

export const SETTINGS = {
  partyFolderId: 'partyFolderId',
  includePartySubfolders: 'includePartySubfolders',
  pinnedActors: 'pinnedActors',
  hiddenActors: 'hiddenActors',
  lastOpenMode: 'lastOpenMode',
  cardDensity: 'cardDensity',
  activeTab: 'activeTab',
} as const;

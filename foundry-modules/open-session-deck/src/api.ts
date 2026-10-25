import type { DeckCloseMode, DeckModuleApi } from './types.ts';

export function createDeckApi(resolveController: () => DeckModuleApi | undefined, isGm: () => boolean): DeckModuleApi {
  function requireController(): DeckModuleApi {
    if (!isGm()) throw new Error('Open Session Deck is available to GMs only.');
    const controller = resolveController();
    if (!controller) throw new Error('Open Session Deck is not ready.');
    return controller;
  }

  return Object.freeze({
    openPanel: () => requireController().openPanel(),
    openPopout: () => requireController().openPopout(),
    openHelp: () => requireController().openHelp(),
    focusPopout: () => requireController().focusPopout(),
    close: (mode: DeckCloseMode) => requireController().close(mode),
    refresh: () => requireController().refresh(),
  });
}

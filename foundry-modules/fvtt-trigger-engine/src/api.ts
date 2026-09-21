import type { TriggerDefinition, TriggerEventListener, TriggerStore } from './types.ts';

export interface TriggerEngineController {
  listTriggers(): TriggerDefinition[];
  triggerStore(): TriggerStore;
  createTrigger(input: TriggerDefinition): Promise<TriggerDefinition>;
  updateTrigger(id: string, patch: Partial<TriggerDefinition>): Promise<TriggerDefinition>;
  copyTrigger(id: string): Promise<TriggerDefinition>;
  setTriggerEnabled(id: string, enabled: boolean): Promise<TriggerDefinition>;
  deleteTrigger(id: string): Promise<void>;
  reload(): Promise<TriggerStore>;
  subscribe?(listener: TriggerEventListener): () => void;
}

export interface TriggerEngineApi {
  subscribe(listener: TriggerEventListener): () => void;
  list(): TriggerDefinition[];
  listTriggers(): TriggerDefinition[];
  getStore(): TriggerStore;
  create(input: TriggerDefinition): Promise<TriggerDefinition>;
  createTrigger(input: TriggerDefinition): Promise<TriggerDefinition>;
  update(id: string, patch: Partial<TriggerDefinition>): Promise<TriggerDefinition>;
  updateTrigger(id: string, patch: Partial<TriggerDefinition>): Promise<TriggerDefinition>;
  copy(id: string): Promise<TriggerDefinition>;
  copyTrigger(id: string): Promise<TriggerDefinition>;
  setEnabled(id: string, enabled: boolean): Promise<TriggerDefinition>;
  setTriggerEnabled(id: string, enabled: boolean): Promise<TriggerDefinition>;
  enable(id: string): Promise<TriggerDefinition>;
  disable(id: string): Promise<TriggerDefinition>;
  delete(id: string): Promise<void>;
  deleteTrigger(id: string): Promise<void>;
  reload(): Promise<TriggerStore>;
  openManager(): Promise<unknown>;
}

export function createTriggerApi(
  resolveController: () => TriggerEngineController | undefined,
  isActiveGM: () => boolean,
  openManager: () => Promise<unknown> | unknown = async () => undefined,
): TriggerEngineApi {
  function requireController(): TriggerEngineController {
    if (!isActiveGM()) throw new Error('FVTT Trigger Engine is available to active GMs only.');
    const controller = resolveController();
    if (!controller) throw new Error('FVTT Trigger Engine is not ready.');
    return controller;
  }

  return Object.freeze({
    subscribe: (listener: TriggerEventListener) => {
      const controller = resolveController();
      if (!controller) throw new Error('FVTT Trigger Engine is not ready.');
      if (!controller.subscribe) throw new Error('Trigger event subscriptions are unavailable.');
      return controller.subscribe(listener);
    },
    list: () => requireController().listTriggers(),
    listTriggers: () => requireController().listTriggers(),
    getStore: () => requireController().triggerStore(),
    create: (input: TriggerDefinition) => requireController().createTrigger(input),
    createTrigger: (input: TriggerDefinition) => requireController().createTrigger(input),
    update: (id: string, patch: Partial<TriggerDefinition>) => requireController().updateTrigger(id, patch),
    updateTrigger: (id: string, patch: Partial<TriggerDefinition>) => requireController().updateTrigger(id, patch),
    copy: (id: string) => requireController().copyTrigger(id),
    copyTrigger: (id: string) => requireController().copyTrigger(id),
    setEnabled: (id: string, enabled: boolean) => requireController().setTriggerEnabled(id, enabled),
    setTriggerEnabled: (id: string, enabled: boolean) => requireController().setTriggerEnabled(id, enabled),
    enable: (id: string) => requireController().setTriggerEnabled(id, true),
    disable: (id: string) => requireController().setTriggerEnabled(id, false),
    delete: (id: string) => requireController().deleteTrigger(id),
    deleteTrigger: (id: string) => requireController().deleteTrigger(id),
    reload: () => requireController().reload(),
    openManager: async () => openManagerForActiveGM(requireController, openManager),
  });
}

async function openManagerForActiveGM(
  requireController: () => TriggerEngineController,
  openManager: () => Promise<unknown> | unknown,
): Promise<unknown> {
  requireController();
  return openManager();
}

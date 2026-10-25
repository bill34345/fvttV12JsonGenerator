import {
  cloneTriggerStore,
  DEFAULT_TRIGGER_STORE,
  inspectStoredTriggerStore,
  sanitizeTriggerStore,
  validateTriggerStore,
  type ValidationIssue,
} from './schema.ts';
import { MODULE_ID } from './constants.ts';
import type { TriggerStore } from './types.ts';

export const TRIGGER_SETTING_KEY = 'triggers' as const;

export interface TriggerStorage {
  load(): TriggerStore | Promise<TriggerStore>;
  save(store: TriggerStore): void | Promise<void>;
}

/** In-memory storage seam used by tests and by callers embedding the engine. */
export class MemoryTriggerStorage implements TriggerStorage {
  #store: TriggerStore;
  issues: ValidationIssue[] = [];

  constructor(initial: unknown = DEFAULT_TRIGGER_STORE) {
    const result = sanitizeTriggerStore(initial);
    this.#store = result.store;
    this.issues = result.issues;
  }

  load(): TriggerStore {
    return cloneTriggerStore(this.#store);
  }

  save(store: TriggerStore): void {
    this.#store = cloneTriggerStore(validateTriggerStore(store));
    this.issues = [];
  }

  raw(): TriggerStore {
    return cloneTriggerStore(this.#store);
  }
}

/** Adapter for Foundry's world-scoped game.settings object. */
export class FoundryTriggerStorage implements TriggerStorage {
  readonly game: any;
  issues: ValidationIssue[] = [];

  constructor(gameLike: any = (globalThis as any).game) {
    this.game = gameLike;
  }

  load(): TriggerStore {
    const raw = this.game?.settings?.get?.(MODULE_ID, TRIGGER_SETTING_KEY);
    const result = inspectStoredTriggerStore(raw);
    this.issues = result.issues;
    return result.store;
  }

  async save(store: TriggerStore): Promise<void> {
    const valid = validateTriggerStore(store);
    const getter = this.game?.settings?.get;
    const setter = this.game?.settings?.set;
    if (typeof getter !== 'function' || typeof setter !== 'function') throw new Error('Foundry world settings are unavailable.');
    const current = inspectStoredTriggerStore(getter.call(this.game.settings, MODULE_ID, TRIGGER_SETTING_KEY));
    this.issues = current.issues;
    if (current.issues.length) {
      const paths = current.issues.slice(0, 5).map((issue) => issue.path).join(', ');
      throw new Error(`Existing Trigger Engine world setting contains unsupported or invalid data (${paths}); review the original value before saving.`);
    }
    await setter.call(this.game.settings, MODULE_ID, TRIGGER_SETTING_KEY, cloneTriggerStore(valid));
    this.issues = [];
  }
}

export const WorldTriggerStorage = FoundryTriggerStorage;
export const InMemoryTriggerStorage = MemoryTriggerStorage;
export const WorldSettingTriggerStorage = FoundryTriggerStorage;

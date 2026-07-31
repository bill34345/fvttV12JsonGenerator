import {
  createSettingsApplicationClass,
  MODULE_ID,
  registerSettings,
  type FoundrySettingsApi,
} from './settings';
import { ChatMemoryGuardRuntime } from './runtime';

interface RuntimeLike {
  start(): void;
  refresh(): Promise<void>;
  getStats(): unknown;
}

export interface ChatMemoryGuardEnvironment {
  hooks: { once(name: string, callback: () => void): unknown };
  game: any;
  createSettingsApplication(): unknown;
  createRuntime(): RuntimeLike;
}

export function initializeChatMemoryGuard(environment: ChatMemoryGuardEnvironment): void {
  let runtime: RuntimeLike | undefined;
  environment.hooks.once('init', () => {
    registerSettings(
      environment.game.settings as FoundrySettingsApi,
      environment.createSettingsApplication(),
      () => { if (runtime) void runtime.refresh(); },
    );
  });
  environment.hooks.once('ready', () => {
    runtime = environment.createRuntime();
    runtime.start();
    const module = environment.game.modules?.get?.(MODULE_ID);
    if (module) module.api = Object.freeze({ getStats: () => runtime?.getStats() });
  });
}

export function bootstrapChatMemoryGuard(globalEnvironment: any): boolean {
  if (!globalEnvironment.Hooks) return false;
  initializeChatMemoryGuard({
    hooks: globalEnvironment.Hooks,
    get game() {
      return globalEnvironment.game;
    },
    createSettingsApplication: createSettingsApplicationClass,
    createRuntime: () => new ChatMemoryGuardRuntime({
      game: globalEnvironment.game,
      hooks: globalEnvironment.Hooks,
      ui: globalEnvironment.ui,
    }),
  });
  return true;
}

bootstrapChatMemoryGuard(globalThis as any);

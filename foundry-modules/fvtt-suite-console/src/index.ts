import type { HandbookContent } from '@fvtt-json-generator/suite-handbook';
import { createSuiteHandbook, MODULE_ID, type ApplicationConstructor } from './runtime';

declare const __SUITE_HANDBOOK_CONTENT__: HandbookContent;
declare const __SUITE_HANDBOOK_DIGEST__: string;

const globals = globalThis as unknown as {
  foundry: { applications: { api: { ApplicationV2: ApplicationConstructor } } };
  game: {
    version: string;
    user?: { isGM?: boolean };
    settings: { registerMenu(id: string, key: string, config: Record<string, unknown>): void };
    modules: Map<string, { api?: unknown; active?: boolean; version?: string }>;
  };
  Hooks: { once(event: string, callback: () => void): void };
};
globals.Hooks.once('init', () => {
  const module = globals.game.modules.get(MODULE_ID);
  if (!module) throw new Error('Suite handbook module registration is unavailable.');
  const suite = createSuiteHandbook({
    ApplicationV2: globals.foundry.applications.api.ApplicationV2,
    state: () => ({ coreVersion: globals.game.version, isGM: Boolean(globals.game.user?.isGM) }),
    registerMenu: (id, key, config) => globals.game.settings.registerMenu(id, key, config),
    readModuleState: id => {
      const module = globals.game.modules.get(id);
      if (!module) return Object.freeze({ state: 'missing' });
      const state = module.active === true ? 'enabled' : module.active === false ? 'disabled' : 'unknown';
      return Object.freeze({ state, version: typeof module.version === 'string' ? module.version : undefined });
    },
  }, __SUITE_HANDBOOK_CONTENT__, __SUITE_HANDBOOK_DIGEST__);
  suite.register();
  module.api = suite.api;
});

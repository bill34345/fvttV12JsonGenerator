import { MODULE_ID } from './constants.ts';
import { publicApi, runtime } from './runtime.ts';
import { openActorDashboard } from './ui.ts';

Hooks.once('init', () => {
  runtime.initialize();
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = publicApi;
});

Hooks.once('ready', () => {
  (globalThis as any).fvttInjuryFadingSpirits = Object.freeze({ ...publicApi, openActorDashboard });
});

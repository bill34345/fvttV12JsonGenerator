import { attachModuleApi, SessionMonitorRuntime } from './runtime';
import { MODULE_ID } from './schema';

let runtime: SessionMonitorRuntime | null = null;

export function registerMarkJankKeybinding(
  globals: any,
  getRuntime: () => Pick<SessionMonitorRuntime, 'getStatus' | 'markJank'> | null = () => runtime,
): void {
  const keybindings = globals?.game?.keybindings;
  if (typeof keybindings?.register !== 'function') return;
  keybindings.register(MODULE_ID, 'markJank', {
    name: 'FSM.Keybinding.markJank',
    hint: 'FSM.Keybinding.markJankHint',
    editable: [],
    uneditable: [],
    restricted: true,
    onDown: () => {
      const current = getRuntime();
      if (!current || current.getStatus().enabled !== true || current.getStatus().state !== 'active') return false;
      void current.markJank();
      return true;
    },
  });
}

export function initializeSessionMonitor(globals: any = globalThis): SessionMonitorRuntime | null {
  if (!globals.Hooks?.once) return null;
  globals.Hooks.once('init', () => {
    try {
      registerMarkJankKeybinding(globals);
    } catch (error) {
      console.error('FVTT Session Monitor keybinding registration failed.', error);
    }
  });
  globals.Hooks.once('ready', async () => {
    runtime = new SessionMonitorRuntime(globals);
    try {
      await runtime.initialize();
      // Do not expose getStatus/startSession until IndexedDB recovery has
      // finished. Otherwise a companion connecting during Foundry startup can
      // observe a transient idle state and create a second active session.
      attachModuleApi(globals.game, runtime);
    } catch (error) {
      console.error('FVTT Session Monitor failed to initialize.', error);
    }
  });
  return runtime;
}

initializeSessionMonitor();

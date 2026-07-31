import { attachModuleApi, SessionMonitorRuntime } from './runtime';

let runtime: SessionMonitorRuntime | null = null;

export function initializeSessionMonitor(globals: any = globalThis): SessionMonitorRuntime | null {
  if (!globals.Hooks?.once) return null;
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

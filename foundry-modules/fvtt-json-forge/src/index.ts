import { createForgeConnectionApplicationClass } from './connectionApplication';
import { createForgeWorkspaceApplicationClass, type ForgeWorkspaceMode } from './workspaceApplication';
import { createForgeGuideApplicationClass } from './guideApplication';
import {createEncounterAutomationLifecycle} from './encounterAutomationLifecycle';
import {installEncounterDamageBridge,installPassiveActivityLockGuard} from './encounterAutomationRuntime';
import {
  assertExactRuntime,
  assertGm,
  EXPECTED_FOUNDRY_VERSION,
  EXPECTED_SYSTEM_VERSION,
  MODULE_ID,
} from './runtime';

export function openForgeActor(): unknown { return openForgeWorkspace('Actor', globalThis, 'structured'); }
export function openForgeItem(): unknown { return openForgeWorkspace('Item', globalThis, 'structured'); }

const workspaces = new WeakMap<object, Map<string, any>>();
const openingWorkspaces = new WeakSet<object>();

function focusWorkspace(environment: any, key: string, create: () => any, mode?: ForgeWorkspaceMode): unknown {
  let windows = workspaces.get(environment);
  if (!windows) { windows = new Map(); workspaces.set(environment, windows); }
  const existing = windows.get(key);
  if (existing && (existing.rendered || openingWorkspaces.has(existing))) { if (mode) existing.selectMode?.(mode); existing.bringToFront?.(); return existing; }
  const application = create();
  windows.set(key, application);
  openingWorkspaces.add(application);
  try {
    const result = application.render(true);
    void Promise.resolve(result).then(() => openingWorkspaces.delete(application), () => {
      openingWorkspaces.delete(application);
      if (windows?.get(key) === application) windows.delete(key);
    });
    return result;
  } catch (error) { openingWorkspaces.delete(application); windows.delete(key); throw error; }
}

export function openForgeConnectionSettings(environment: any = globalThis): unknown {
  assertGm(environment.game); assertExactRuntime(environment.game);
  return focusWorkspace(environment, 'connection', () => {
    const Application = createForgeConnectionApplicationClass(environment);
    return new Application();
  });
}

export function openForgeGuide(environment: any = globalThis): unknown {
  assertGm(environment.game); assertExactRuntime(environment.game);
  return focusWorkspace(environment, 'guide', () => {
    const Application = createForgeGuideApplicationClass(environment);
    return new Application();
  });
}

export function openForgeWorkspace(kind: 'Actor' | 'Item', environment: any = globalThis, mode?: ForgeWorkspaceMode): unknown {
  if (kind !== 'Actor' && kind !== 'Item') throw new Error('请选择角色或物品目录。');
  assertGm(environment.game); assertExactRuntime(environment.game);
  return focusWorkspace(environment, kind, () => {
    const Application = createForgeWorkspaceApplicationClass({
      game: environment.game, ui: environment.ui, foundry: environment.foundry,
      window: environment.window, hooks: environment.Hooks, directoryKind: kind, initialMode: mode,
      openConnectionSettings: () => openForgeConnectionSettings(environment),
      openGuide: () => openForgeGuide(environment),
    });
    return new Application();
  }, mode);
}

/** Compatibility entry: new callers should use the Actor or Item directory. */
export function openForgeIntake(): unknown { return openForgeWorkspace('Actor', globalThis, 'ai'); }

export function mountForgeDirectoryButton(kind: 'Actor' | 'Item', html: any, environment: any = globalThis): void {
  const root = html?.querySelector ? html : html?.[0];
  if (!root?.querySelector) return;
  const previous = root.querySelector('[data-forge-directory-entry]');
  if (environment.game?.user?.isGM !== true) { previous?.remove?.(); return; }
  try { assertExactRuntime(environment.game); } catch { previous?.remove?.(); return; }
  if (previous) return;
  const host = root.querySelector('.header-actions') ?? root.querySelector('.directory-header')
    ?? root.querySelector('header');
  const document = root.ownerDocument ?? environment.document;
  if (!host || !document?.createElement) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'forge-directory-entry';
  button.dataset.forgeDirectoryEntry = kind;
  button.title = kind === 'Actor' ? '从规则资料生成或导入生物，包含能力关联的召唤生物或物件' : '从规则资料生成或导入物品';
  const icon = document.createElement('i'); icon.className = 'fas fa-hammer'; icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.textContent = kind === 'Actor' ? 'Forge 生物' : 'Forge 物品';
  button.append(icon, label);
  button.onclick = () => {
    try { openForgeWorkspace(kind, environment); }
    catch (error) { environment.ui?.notifications?.error?.(error instanceof Error ? error.message : String(error)); }
  };
  host.append(button);
}

export function initializeForgeModule(globalEnvironment: any = globalThis): void {
  if (!globalEnvironment.Hooks) return;
  const automation = createEncounterAutomationLifecycle(globalEnvironment);
  globalEnvironment.Hooks.on?.('canvasReady', () => {
    installPassiveActivityLockGuard(globalEnvironment);
    installEncounterDamageBridge(globalEnvironment);
    void automation.resume();
  });
  globalEnvironment.Hooks.on?.('renderActorDirectory', (_app: unknown, html: unknown) => mountForgeDirectoryButton('Actor', html, globalEnvironment));
  globalEnvironment.Hooks.on?.('renderItemDirectory', (_app: unknown, html: unknown) => mountForgeDirectoryButton('Item', html, globalEnvironment));
  let registered = false;
  let retries = 0;
  const registerSettings = () => {
    if (registered || !globalEnvironment.game?.settings?.registerMenu) return;
    try {
      const type = createForgeConnectionApplicationClass(globalEnvironment);
      globalEnvironment.game.settings.registerMenu(MODULE_ID, 'connection', {
        name: 'Forge · AI 连接', label: '配置 AI 连接',
        hint: '设置 Provider、API Key 和模型。生成与导入请使用角色或物品目录中的 Forge 按钮。',
        icon: 'fas fa-sliders', type, restricted: true,
      });
      registered = true;
    } catch (error) {
      globalEnvironment.console?.error?.('Forge connection settings are waiting for ApplicationV2.', error);
    }
  };
  const retry = () => {
    if (registered || retries >= 20 || typeof globalEnvironment.setTimeout !== 'function') return;
    retries += 1;
    globalEnvironment.setTimeout(() => { registerSettings(); retry(); }, 100);
  };
  globalEnvironment.Hooks.once('init', registerSettings);
  globalEnvironment.Hooks.once('ready', async () => {
    registerSettings();
    const game = globalEnvironment.game;
    installPassiveActivityLockGuard(globalEnvironment);
    installEncounterDamageBridge(globalEnvironment);
    const module = game?.modules?.get?.(MODULE_ID);
    if (module) module.api = Object.freeze({ openForgeActor, openForgeItem, openForgeIntake,
      openForgeWorkspace: (kind: 'Actor' | 'Item') => openForgeWorkspace(kind, globalEnvironment),
      openForgeConnectionSettings: () => openForgeConnectionSettings(globalEnvironment),
      openForgeGuide: () => openForgeGuide(globalEnvironment),
      startEncounterAutomation: automation.start, stopEncounterAutomation: automation.stop,
      encounterAutomationRuntimes: automation.runtimes });
    if (game?.user?.isGM !== true) return;
    try {
      assertExactRuntime(game); await automation.resume();
      for (const [kind, directory] of [['Actor', globalEnvironment.ui?.actors], ['Item', globalEnvironment.ui?.items]] as const) {
        if (directory?.element) mountForgeDirectoryButton(kind, directory.element, globalEnvironment);
      }
    } catch (error) { globalEnvironment.ui?.notifications?.warn?.(error instanceof Error ? error.message : String(error)); }
  });
  registerSettings(); retry();
}

initializeForgeModule();

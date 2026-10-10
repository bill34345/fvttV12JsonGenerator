import { createForgeActorApplicationClass, type ForgeApplicationEnvironment } from './application';
import { createForgeItemApplicationClass, type ForgeItemApplicationEnvironment } from './itemApplication';
import { createForgeIntakeApplicationClass, type ForgeIntakeApplicationEnvironment } from './intakeApplication';
import { assertExactRuntime, assertGm } from './runtime';
import { isForgeSessionConnectionReady, readForgeSessionSettings } from './settings';
import type { ForgePaneState, ForgeWorkspacePane } from './workspacePane';

export type ForgeWorkspaceMode = 'blueprint' | 'structured' | 'ai';
export interface ForgeWorkspaceEnvironment {
  game: any;
  foundry?: any;
  ui?: any;
  window?: ForgeApplicationEnvironment['window'];
  hooks?: ForgeApplicationEnvironment['hooks'];
  directoryKind: 'Actor' | 'Item';
  initialMode?: ForgeWorkspaceMode;
  openConnectionSettings?: () => unknown;
  openGuide?: () => unknown;
  actor?: Partial<ForgeApplicationEnvironment>;
  item?: Partial<ForgeItemApplicationEnvironment>;
  intake?: Partial<ForgeIntakeApplicationEnvironment>;
}

/** One native window owns navigation; each pane retains its type-specific workflow. */
export function createForgeWorkspaceApplicationClass(environment: ForgeWorkspaceEnvironment): any {
  const foundryGlobal = environment.foundry ?? (globalThis as any).foundry;
  const api = foundryGlobal?.applications?.api;
  if (!api?.ApplicationV2 || typeof api.HandlebarsApplicationMixin !== 'function') {
    throw new Error('Foundry 14 ApplicationV2 and HandlebarsApplicationMixin are required.');
  }
  const kind = environment.directoryKind;
  const modes: ForgeWorkspaceMode[] = kind === 'Actor' ? ['blueprint', 'structured', 'ai'] : ['structured', 'ai'];
  const Base = api.HandlebarsApplicationMixin(api.ApplicationV2);
  return class ForgeWorkspaceApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: `fvtt-json-forge-workspace-${kind.toLowerCase()}`,
      classes: ['fvtt-json-forge', 'forge-unified-window'],
      position: { width: kind === 'Actor' ? 1440 : 960, height: 900 },
      window: { title: kind === 'Actor' ? 'Forge · 生物工作台' : 'Forge · 物品工作台', resizable: true },
    };
    static PARTS = {
      navigation: { template: 'modules/fvtt-json-forge/templates/forge-workspace.hbs' },
      formal: { template: `modules/fvtt-json-forge/templates/forge-${kind === 'Actor' ? 'actor' : 'item'}.hbs` },
      intake: { template: 'modules/fvtt-json-forge/templates/forge-intake.hbs' },
    };

    private mode: ForgeWorkspaceMode = modes.includes(environment.initialMode as ForgeWorkspaceMode)
      ? environment.initialMode! : kind === 'Actor' ? 'blueprint' : 'ai';
    private formal!: ForgeWorkspacePane;
    private intake!: ForgeWorkspacePane;
    private drafts = new Map<string, Record<string, string>>();

    constructor(...args: any[]) {
      super(...args);
      const common = { game: environment.game, ui: environment.ui, foundry: foundryGlobal,
        window: environment.window, hooks: environment.hooks };
      const pane = { active: () => this.mode !== 'ai', changed: () => this.refreshNavigation() };
      const Formal = kind === 'Actor' ? createForgeActorApplicationClass({ ...common, ...environment.actor, pane })
        : createForgeItemApplicationClass({ ...common, ...environment.item, pane });
      this.formal = new Formal();
      const Intake = createForgeIntakeApplicationClass({ ...common, ...environment.intake,
        directoryKind: kind, initialMode: kind === 'Actor' ? 'ai-monster' : 'ai-item',
        openConnectionSettings: environment.openConnectionSettings,
        openStructuredImport: () => this.selectMode('structured'),
        pane: { active: () => this.mode === 'ai', changed: () => this.refreshNavigation() } });
      this.intake = new Intake();
    }

    async _prepareContext() {
      // ApplicationV2 can replace templates on rerender. Preserve source inputs, never credentials.
      for (const key of ['formal', 'intake']) {
        const root = this.paneRoot(key);
        if (!root) continue;
        const draft: Record<string, string> = {};
        for (const name of ['source', 'displayName', 'mode', 'blueprintLibrarySearch']) {
          const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
          if (input) draft[name] = input.value;
        }
        this.drafts.set(key, draft);
      }
      return { ...(await this.intake._prepareContext()), isActorWorkspace: kind === 'Actor' };
    }

    _onRender(_context: unknown, _options: unknown): void {
      const root = this.element as HTMLElement | undefined;
      if (!root) return;
      for (const [key, pane] of [['formal', this.formal], ['intake', this.intake]] as const) {
        const paneRoot = this.paneRoot(key);
        if (!paneRoot) continue;
        for (const [name, value] of Object.entries(this.drafts.get(key) ?? {})) {
          const input = paneRoot.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
          if (input) input.value = value;
        }
        pane.mount(paneRoot);
      }
      root.querySelectorAll<HTMLButtonElement>('[data-forge-mode]').forEach(button => {
        button.onclick = () => this.selectMode(button.dataset.forgeMode as ForgeWorkspaceMode);
      });
      const connection = root.querySelector<HTMLButtonElement>('[data-workspace-connection]');
      if (connection) connection.onclick = () => {
        try { assertGm(environment.game); assertExactRuntime(environment.game); environment.openConnectionSettings?.(); }
        catch (error) { this.report(error); }
      };
      const encounter = root.querySelector<HTMLButtonElement>('[data-workspace-encounter]');
      if (encounter) encounter.onclick = () => {
        if (this.locked()) return;
        this.paneRoot('intake')?.querySelector<HTMLButtonElement>('[data-action="encounter-open"]')?.click();
      };
      const guide = root.querySelector<HTMLButtonElement>('[data-workspace-guide]');
      if (guide) guide.onclick = () => {
        try {
          assertGm(environment.game); assertExactRuntime(environment.game);
          if (!environment.openGuide) throw new Error('图解手册入口尚未就绪。');
          environment.openGuide();
        } catch (error) { this.report(error); }
      };
      this.synchronizeFormalMode();
      this.refreshNavigation();
    }

    /** Changing views never transfers source text, accepted responses or creation authority. */
    selectMode(mode: ForgeWorkspaceMode): boolean {
      if (!modes.includes(mode)) return false;
      try { assertGm(environment.game); assertExactRuntime(environment.game); }
      catch (error) { this.report(error); return false; }
      if (mode === this.mode) return true;
      if (this.locked()) {
        this.report(new Error('当前资料正在保存或提交，请等回读完成后切换。'));
        return false;
      }
      if (!this.formal.suspend() || !this.intake.suspend()) return false;
      this.mode = mode;
      this.synchronizeFormalMode();
      this.refreshNavigation();
      return true;
    }

    async close(options?: unknown) {
      if (this.locked()) {
        this.report(new Error('当前资料正在保存或提交，完成前不能关闭工作台。'));
        return this;
      }
      await this.formal.dispose();
      await this.intake.dispose();
      return super.close(options);
    }

    private paneRoot(key: string): HTMLElement | null {
      return (this.element as HTMLElement | undefined)?.querySelector(`[data-forge-pane="${key}"]`) ?? null;
    }
    private locked(): boolean {
      return Boolean(this.formal?.workspaceState().locked || this.intake?.workspaceState().locked);
    }
    private synchronizeFormalMode(): void {
      if (kind !== 'Actor' || this.mode === 'ai') return;
      const input = this.paneRoot('formal')?.querySelector<HTMLSelectElement>('[name="mode"]');
      if (!input || input.value === this.mode) return;
      input.value = this.mode;
      const EventClass = input.ownerDocument.defaultView?.Event ?? Event;
      input.dispatchEvent(new EventClass('change', { bubbles: true }));
    }
    private refreshNavigation(): void {
      const root = this.element as HTMLElement | undefined;
      if (!root) return;
      const active = this.mode === 'ai' ? this.intake : this.formal;
      const state: ForgePaneState = active?.workspaceState() ?? { stage: 'input', locked: false };
      const locked = this.locked();
      const connection = root.querySelector<HTMLElement>('[data-workspace-connection-summary]');
      if (connection) {
        const settings = readForgeSessionSettings();
        connection.textContent = isForgeSessionConnectionReady()
          ? `AI 已连接 · ${settings.model}` : settings.model ? `AI 待测试 · ${settings.model}` : 'AI 尚未配置';
      }
      root.querySelectorAll<HTMLButtonElement>('[data-forge-mode]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.forgeMode === this.mode));
        button.disabled = locked;
      });
      const formal = this.paneRoot('formal'), intake = this.paneRoot('intake');
      if (formal) formal.hidden = this.mode === 'ai';
      if (intake) intake.hidden = this.mode !== 'ai';
      root.querySelectorAll<HTMLElement>('[data-workspace-stage]').forEach(step => {
        if (step.dataset.workspaceStage === state.stage) step.setAttribute('aria-current', 'step');
        else step.removeAttribute('aria-current');
      });
      const encounter = root.querySelector<HTMLButtonElement>('[data-workspace-encounter]');
      if (encounter) encounter.disabled = locked;
    }
    private report(error: unknown): void {
      environment.ui?.notifications?.error?.(error instanceof Error ? error.message : String(error));
    }
  };
}

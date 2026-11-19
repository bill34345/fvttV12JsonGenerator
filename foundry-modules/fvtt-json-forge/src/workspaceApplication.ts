import { createForgeActorApplicationClass, type ForgeApplicationEnvironment } from './application';
import { createForgeItemApplicationClass, type ForgeItemApplicationEnvironment } from './itemApplication';
import { createForgeIntakeApplicationClass, type ForgeIntakeApplicationEnvironment } from './intakeApplication';
import { assertExactRuntime, assertGm } from './runtime';
import { forgeConnectionSetupMessage, isForgeSessionConnectionReady, readForgeSessionSettings, subscribeForgeSessionSettings } from './settings';
import type { ForgeWorkspacePane } from './workspacePane';
import { ForgeSpellPane } from './spellPane';
import { openForgeArchiveSettings } from './archiveSettings';
import { describeForgeWorldFolder } from './worldFolder';

export type ForgeWorkspaceMode = 'blueprint' | 'structured' | 'ai' | 'spell';
type Directory = 'Actor' | 'Item';
type ForgeObject = Directory | 'Spell';
type PaneKey = 'actor' | 'item' | 'actorIntake' | 'itemIntake';
type RecordsPane = ForgeWorkspacePane & {
  showRecords(view: 'editor' | 'saved' | 'batch'): void;
  openEncounter(): void;
  openSavedSource(id: string): Promise<boolean>;
};
const directories = ['Actor', 'Item'] as const;
const paneKeys = ['actor', 'item', 'actorIntake', 'itemIntake'] as const;
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
  const Base = api.HandlebarsApplicationMixin(api.ApplicationV2);
  return class ForgeWorkspaceApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: 'fvtt-json-forge-workspace',
      classes: ['fvtt-json-forge', 'forge-unified-window'],
      position: { width: 1040, height: 800 },
      window: { title: 'Forge · 工作台', resizable: true },
    };
    static PARTS = {
      navigation: { template: 'modules/fvtt-json-forge/templates/forge-workspace.hbs' },
      actor: { template: 'modules/fvtt-json-forge/templates/forge-actor.hbs' },
      item: { template: 'modules/fvtt-json-forge/templates/forge-item.hbs' },
      actorIntake: { template: 'modules/fvtt-json-forge/templates/forge-intake.hbs' },
      itemIntake: { template: 'modules/fvtt-json-forge/templates/forge-intake.hbs' },
      spell: { template: 'modules/fvtt-json-forge/templates/forge-spell.hbs' },
    };

    private object: ForgeObject = environment.initialMode === 'spell' && environment.directoryKind === 'Item'
      ? 'Spell' : environment.directoryKind;
    private directory: Directory = environment.directoryKind;
    private modes: Record<Directory, Exclude<ForgeWorkspaceMode, 'spell'>> = { Actor: 'blueprint', Item: 'structured' };
    private records?: 'saved' | 'batch';
    private panes: Record<PaneKey, ForgeWorkspacePane>;
    private spell: ForgeSpellPane;
    private unsubscribeSession?: () => void;
    private drafts = new Map<PaneKey, Record<string, string>>();

    constructor(...args: any[]) {
      super(...args);
      const initial = environment.initialMode;
      if (initial === 'ai' || initial === 'structured' || (initial === 'blueprint' && this.directory === 'Actor')) {
        this.modes[this.directory] = initial;
      }
      const common = { game: environment.game, ui: environment.ui, foundry: foundryGlobal,
        window: environment.window, hooks: environment.hooks };
      const pane = (key: PaneKey) => ({
        active: () => this.activePane === key,
        changed: () => this.refreshNavigation(),
      });
      const Actor = createForgeActorApplicationClass({ ...common, ...environment.actor, pane: pane('actor') });
      const Item = createForgeItemApplicationClass({ ...common, ...environment.item, pane: pane('item') });
      const intake = (kind: Directory, key: PaneKey) => createForgeIntakeApplicationClass({
        ...common, ...environment.intake, directoryKind: kind, initialMode: kind === 'Actor' ? 'ai-monster' : 'ai-item',
        openConnectionSettings: environment.openConnectionSettings,
        openStructuredImport: () => this.selectObject(kind, 'structured'),
        openOtherLibrarySource: (directory, id) => this.openOtherLibrarySource(directory, id),
        onRecordsViewChange: (view, returnToPrevious) => {
          if (!this.records || key !== this.intakeKey || view !== 'editor') return;
          this.records = undefined;
          if (!returnToPrevious) {
            this.object = this.directory;
            this.modes[this.directory] = 'ai';
          }
          this.refreshNavigation();
        },
        pane: pane(key),
      });
      const ActorIntake = intake('Actor', 'actorIntake');
      const ItemIntake = intake('Item', 'itemIntake');
      this.panes = { actor: new Actor(), item: new Item(), actorIntake: new ActorIntake(), itemIntake: new ItemIntake() };
      this.spell = new ForgeSpellPane(environment.game, foundryGlobal, () => this.refreshNavigation());
    }

    private get intakeKey(): 'actorIntake' | 'itemIntake' { return this.directory === 'Actor' ? 'actorIntake' : 'itemIntake'; }

    private get activePane(): PaneKey | 'spell' {
      if (this.records || (this.object !== 'Spell' && this.modes[this.directory] === 'ai')) return this.intakeKey;
      if (this.object === 'Spell') return 'spell';
      return this.object === 'Actor' ? 'actor' : 'item';
    }

    private canOpenItems(): boolean {
      try { assertGm(environment.game); assertExactRuntime(environment.game); return true; }
      catch { return false; }
    }

    async _prepareContext() {
      // ApplicationV2 can replace templates on rerender. Preserve inputs independently for each pane.
      for (const key of paneKeys) {
        const root = this.paneRoot(key);
        if (!root) continue;
        const draft: Record<string, string> = {};
        for (const name of ['source', 'displayName', 'mode', 'blueprintLibrarySearch']) {
          const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
          if (input) draft[name] = input.value;
        }
        this.drafts.set(key, draft);
      }
      return { canOpenItems: this.canOpenItems() };
    }

    async _preparePartContext(partId: string, context: Record<string, unknown>, options: unknown) {
      const part = super._preparePartContext ? await super._preparePartContext(partId, { ...context }, options) : context;
      if (partId === 'actorIntake' || partId === 'itemIntake') return { ...part, ...(await this.panes[partId]._prepareContext()) };
      return part;
    }

    _onRender(_context: unknown, _options: unknown): void {
      const root = this.element as HTMLElement | undefined;
      if (!root) return;
      for (const key of paneKeys) {
        const pane = this.panes[key];
        const paneRoot = this.paneRoot(key);
        if (!paneRoot) continue;
        for (const [name, value] of Object.entries(this.drafts.get(key) ?? {})) {
          const input = paneRoot.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
          if (input) input.value = value;
        }
        pane.mount(paneRoot);
      }
      const spellRoot = this.paneRoot('spell');
      if (spellRoot) this.spell?.mount(spellRoot);
      root.querySelectorAll<HTMLButtonElement>('[data-forge-mode]').forEach(button => {
        button.onclick = () => this.selectMode(button.dataset.forgeMode as ForgeWorkspaceMode);
      });
      root.querySelectorAll<HTMLButtonElement>('[data-workspace-object]').forEach(button => {
        button.onclick = () => this.selectObject(button.dataset.workspaceObject as ForgeObject);
      });
      const library = root.querySelector<HTMLButtonElement>('[data-workspace-library]');
      if (library) library.onclick = () => this.openRecords('saved');
      const batch = root.querySelector<HTMLButtonElement>('[data-workspace-batch]');
      if (batch) batch.onclick = () => this.openRecords('batch');
      this.unsubscribeSession ??= subscribeForgeSessionSettings(() => this.refreshNavigation());
      root.querySelectorAll<HTMLButtonElement>('[data-workspace-connection]').forEach(button => button.onclick = () => {
        try { assertGm(environment.game); assertExactRuntime(environment.game); environment.openConnectionSettings?.(); }
        catch (error) { this.report(error); }
      });
      const archive = root.querySelector<HTMLButtonElement>('[data-workspace-archive]');
      if (archive) {
        archive.hidden = environment.game.user?.isGM !== true;
        archive.onclick = () => {
          if (this.locked()) return;
          void openForgeArchiveSettings(environment.game, foundryGlobal, root.ownerDocument)
            .then(() => this.refreshNavigation(), error => this.report(error));
        };
      }
      const encounter = root.querySelector<HTMLButtonElement>('[data-workspace-encounter]');
      if (encounter) encounter.onclick = () => {
        if (this.locked()) return;
        (this.panes.actorIntake as RecordsPane).openEncounter();
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

    /** Changing workflows never transfers source text, accepted responses or creation authority. */
    selectMode(mode: ForgeWorkspaceMode): boolean {
      if (mode === 'spell') return this.selectObject('Spell');
      return this.selectObject(this.directory, mode);
    }

    selectObject(object: ForgeObject, requested?: Exclude<ForgeWorkspaceMode, 'spell'>): boolean {
      if (object !== 'Spell' && !directories.includes(object)) return false;
      if (requested && !['blueprint', 'structured', 'ai'].includes(requested)) return false;
      if (requested === 'blueprint' && object !== 'Actor') return false;
      if (object !== 'Actor' && !this.canOpenItems()) {
        this.report(new Error('当前世界无法打开物品或法术创建。'));
        return false;
      }
      if (!this.records && object === this.object && (!requested || requested === this.modes[this.directory])) return true;
      if (!this.leavePane()) return false;
      this.records = undefined;
      this.object = object;
      this.directory = object === 'Actor' ? 'Actor' : 'Item';
      if (requested) this.modes[this.directory] = requested;
      if (this.activePane === this.intakeKey) (this.panes[this.intakeKey] as RecordsPane).showRecords('editor');
      this.synchronizeFormalMode();
      this.refreshNavigation();
      return true;
    }

    private openRecords(view: 'saved' | 'batch'): void {
      if (this.locked()) return;
      this.records = view;
      (this.panes[this.intakeKey] as RecordsPane).showRecords(view);
      this.refreshNavigation();
    }

    private async openOtherLibrarySource(directory: Directory, id: string): Promise<boolean> {
      if (this.locked()) return false;
      if (directory === 'Item' && !this.canOpenItems()) {
        this.report(new Error('当前世界无法打开物品资料。'));
        return false;
      }
      const pane = this.panes[directory === 'Actor' ? 'actorIntake' : 'itemIntake'] as RecordsPane;
      if (!await pane.openSavedSource(id)) return false;
      this.records = undefined;
      this.object = this.directory = directory;
      this.modes[directory] = 'ai';
      this.refreshNavigation();
      return true;
    }

    private leavePane(): boolean {
      if (this.locked()) {
        this.report(new Error('当前资料正在保存或提交，请等回读完成后切换。'));
        return false;
      }
      const current = this.activePane;
      if (current === 'spell') { this.spell.suspend(); return true; }
      if (this.records) return true;
      return this.panes[current].suspend();
    }

    async close(options?: unknown) {
      if (this.locked()) {
        this.report(new Error('当前资料正在保存或提交，完成前不能关闭工作台。'));
        return this;
      }
      this.unsubscribeSession?.();
      this.unsubscribeSession = undefined;
      this.spell.dispose();
      for (const pane of Object.values(this.panes)) await pane.dispose();
      return super.close(options);
    }

    private paneRoot(key: string): HTMLElement | null {
      return (this.element as HTMLElement | undefined)?.querySelector(`[data-application-part="${key}"]`) ?? null;
    }
    private locked(): boolean {
      return Boolean(this.spell?.locked || Object.values(this.panes ?? {}).some(pane => pane.workspaceState().locked));
    }
    private synchronizeFormalMode(): void {
      if (this.activePane !== 'actor') return;
      const input = this.paneRoot('actor')?.querySelector<HTMLSelectElement>('[name="mode"]');
      if (!input || input.value === this.modes.Actor) return;
      input.value = this.modes.Actor;
      const EventClass = input.ownerDocument.defaultView?.Event ?? Event;
      input.dispatchEvent(new EventClass('change', { bubbles: true }));
    }
    private refreshNavigation(): void {
      const root = this.element as HTMLElement | undefined;
      if (!root) return;
      const locked = this.locked();
      const settings = readForgeSessionSettings();
      const ready = isForgeSessionConnectionReady();
      const notice = root.querySelector<HTMLElement>('[data-workspace-connection-notice]');
      const guidance = root.querySelector<HTMLElement>('[data-workspace-connection-guidance]');
      const connection = root.querySelector<HTMLElement>('[data-workspace-connection-summary]');
      const settingsButton = root.querySelector<HTMLButtonElement>('.forge-workspace-tools [data-workspace-connection]');
      const ai = !this.records && this.activePane === this.intakeKey;
      if (notice) notice.hidden = ready || !ai;
      if (settingsButton) settingsButton.hidden = !ready || !ai;
      if (guidance) guidance.textContent = ready ? '' : forgeConnectionSetupMessage(settings);
      if (connection) {
        connection.hidden = !ready || !ai;
        connection.textContent = ready ? 'AI 已连接' : '';
        connection.title = connection.textContent;
      }
      root.querySelectorAll<HTMLButtonElement>('[data-workspace-object]').forEach(button => {
        button.setAttribute('aria-pressed', String(!this.records && button.dataset.workspaceObject === this.object));
        button.disabled = locked;
      });
      const library = root.querySelector<HTMLButtonElement>('[data-workspace-library]');
      if (library) { library.setAttribute('aria-pressed', String(this.records === 'saved')); library.disabled = locked; }
      const batch = root.querySelector<HTMLButtonElement>('[data-workspace-batch]');
      if (batch) { batch.setAttribute('aria-pressed', String(this.records === 'batch')); batch.disabled = locked; }
      const method = root.querySelector<HTMLElement>('[data-workspace-method]');
      if (method) method.hidden = Boolean(this.records) || this.object === 'Spell';
      root.querySelectorAll<HTMLButtonElement>('[data-forge-mode]:not([data-workspace-object])').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.forgeMode === this.modes[this.directory]));
        button.hidden = button.dataset.forgeMode === 'blueprint' && this.object !== 'Actor';
        button.disabled = locked;
      });
      for (const key of [...paneKeys, 'spell'] as const) {
        const pane = this.paneRoot(key);
        if (pane) pane.hidden = key !== this.activePane;
      }
      const destination = this.paneRoot(this.activePane)?.querySelector<HTMLElement>('[data-forge-destination="Spell"]');
      if (destination) destination.textContent = describeForgeWorldFolder(environment.game, 'Spell');
      const encounter = root.querySelector<HTMLButtonElement>('[data-workspace-encounter]');
      if (encounter) encounter.disabled = locked;
    }
    private report(error: unknown): void {
      environment.ui?.notifications?.error?.(error instanceof Error ? error.message : String(error));
    }
  };
}

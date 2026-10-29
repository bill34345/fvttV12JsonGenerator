import { createHandbookModel, mountHandbook, type HandbookContent, type HandbookHandle, type HandbookModuleState, type HandbookTheme } from '@fvtt-json-generator/suite-handbook';

export const MODULE_ID = 'fvtt-suite-console';
export const MODULE_VERSION = '0.3.0';
export const HELP_API_VERSION = 1;
export const WINDOW_ID = 'fvtt-suite-handbook';
export const SUPPORTED_CORE = '14.368';

export interface HelpRequest { readonly entryId?: string; readonly section?: string }
export interface ApplicationInstance {
  readonly id: string;
  readonly element: HTMLElement;
  readonly rendered: boolean;
  render(options?: Record<string, unknown>): Promise<this>;
  close(options?: Record<string, unknown>): Promise<this>;
  maximize(): Promise<void>;
  bringToFront(): void;
  _canRender(options: unknown): boolean | void;
  _renderHTML(context: unknown, options: unknown): Promise<unknown>;
  _replaceHTML(result: unknown, content: HTMLElement, options: unknown): void;
  _onRender(context: unknown, options: unknown): Promise<void>;
  _preClose(options: unknown): Promise<void>;
  _onClose(options: unknown): void;
}
export type ApplicationConstructor = new (options?: Record<string, unknown>) => ApplicationInstance;
export interface SuiteEnvironment {
  readonly ApplicationV2: ApplicationConstructor;
  state(): { readonly isGM: boolean; readonly coreVersion: string };
  registerMenu(id: string, key: string, config: Record<string, unknown>): void;
  readModuleState?(moduleId: string): HandbookModuleState;
}
export interface SuiteApi {
  readonly moduleId: string;
  readonly apiVersion: number;
  readonly version: string;
  readonly contentDigest: string;
  openHelp(request?: HelpRequest): Promise<void>;
  closeHelp(): Promise<void>;
}

/** Host ports contain presentation capabilities only: no document or setting writes. */
export function createSuiteHandbook(environment: SuiteEnvironment, input: HandbookContent, contentDigest: string) {
  const content = createHandbookModel(input).content;
  const Base = environment.ApplicationV2;
  if (typeof Base !== 'function') throw new Error('Foundry ApplicationV2 is unavailable.');
  let singleton: SuiteHandbookApplication | undefined;

  function assertCanOpen(): void {
    const state = environment.state();
    if (!state.isGM) throw new Error('统一操作手册仅限 GM 打开。');
    if (state.coreVersion !== SUPPORTED_CORE) throw new Error('当前手册窗口仅适配 Foundry ' + SUPPORTED_CORE + '。');
  }

  class SuiteHandbookApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: WINDOW_ID,
      classes: ['fvtt-suite-console'],
      tag: 'div',
      window: { title: '统一操作手册', icon: 'fa-solid fa-book-open', resizable: true, minimizable: true, controls: [], contentTag: 'section' },
      position: { width: 1000, height: 720 },
    };
    #reader: HandbookHandle | undefined;
    #route = 'home';
    #section: string | undefined;
    #theme: HandbookTheme | undefined;

    constructor(options: Record<string, unknown> = {}) {
      if (singleton) return singleton;
      super(options);
      singleton = this;
    }

    override _canRender(_options: unknown): void { assertCanOpen(); }

    override async _renderHTML(_context: unknown, _options: unknown): Promise<HTMLElement> {
      const root = this.element.ownerDocument.createElement('div');
      root.className = 'suite-handbook-host';
      return root;
    }

    override _replaceHTML(result: unknown, contentElement: HTMLElement, _options: unknown): void {
      this.#reader?.dispose();
      this.#reader = undefined;
      contentElement.replaceChildren(result as HTMLElement);
    }

    override async _onRender(context: unknown, options: unknown): Promise<void> {
      await super._onRender(context, options);
      assertCanOpen();
      const root = this.element.querySelector<HTMLElement>('.suite-handbook-host');
      if (!root) throw new Error('Handbook root is missing from the application.');
      if (!this.#theme) {
        const themed = this.element.closest('.theme-light, .theme-dark')
          ?? this.element.ownerDocument.querySelector('body.theme-light, body.theme-dark');
        this.#theme = themed?.classList.contains('theme-light') ? 'light' : 'dark';
      }
      this.#reader = mountHandbook(root, content, {
        surface: 'foundry',
        initialRoute: this.#route,
        initialTheme: this.#theme,
        contentDigest: contentDigest.slice(0, 12),
        readModuleState: id => environment.readModuleState?.(id) ?? { state: 'unknown' },
        onNavigate: route => { this.#route = route; this.#section = undefined; },
        onThemeChange: theme => { this.#theme = theme; },
        scrollToTop: main => { main.scrollTop = 0; },
        copyText(text) {
          const clipboard = root.ownerDocument.defaultView?.navigator.clipboard;
          if (!clipboard?.writeText) throw new Error('clipboard unavailable');
          return clipboard.writeText(text);
        },
      });
      if (this.#section) this.#reader.navigate(this.#route, this.#section);
    }

    override async _preClose(options: unknown): Promise<void> {
      this.#reader?.dispose();
      this.#reader = undefined;
      await super._preClose(options);
    }

    override _onClose(options: unknown): void {
      this.#reader?.dispose();
      this.#reader = undefined;
      super._onClose(options);
    }

    async openHelp(request: HelpRequest = {}): Promise<void> {
      assertCanOpen();
      if (!request || typeof request !== 'object'
        || (request.entryId !== undefined && typeof request.entryId !== 'string')
        || (request.section !== undefined && typeof request.section !== 'string')) throw new TypeError('Invalid help request.');
      if (request.entryId !== undefined) {
        this.#route = request.entryId ? 'tool/' + request.entryId : 'home';
        this.#section = request.section;
      }
      // Core queues render behind close, including the awaited pre-close phase
      // during which rendered may still be true and our reader is already disposed.
      await this.render({ force: true });
      assertCanOpen();
      await this.maximize();
      this.bringToFront();
    }
  }

  const api: SuiteApi = Object.freeze({
    moduleId: MODULE_ID,
    apiVersion: HELP_API_VERSION,
    version: MODULE_VERSION,
    contentDigest,
    async openHelp(request?: HelpRequest) {
      assertCanOpen();
      await new SuiteHandbookApplication().openHelp(request);
    },
    async closeHelp() {
      assertCanOpen();
      if (singleton) await singleton.close();
    },
  });

  function register(): void {
    environment.registerMenu(MODULE_ID, 'handbook', {
      name: '统一操作手册',
      label: '打开手册',
      hint: '搜索工具用途、阅读步骤与版本限制。阅读和复制不会执行命令或修改世界。',
      icon: 'fa-solid fa-book-open',
      type: SuiteHandbookApplication,
      restricted: true,
    });
  }

  return { api, Application: SuiteHandbookApplication, register };
}

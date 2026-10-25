import { renderModuleManual } from '@fvtt-json-generator/suite-handbook';
import manual from '../docs/manual.json';

const SUITE_MODULE_ID = 'fvtt-suite-console';
export interface ChatGuardHelpEnvironment {
  isGM(): boolean;
  suiteModule(): { active?: unknown; api?: any } | undefined;
  applicationV2(): any;
}

export class ChatGuardHelp {
  #fallback: any;
  #pending: Promise<void> | undefined;
  constructor(private readonly environment: ChatGuardHelpEnvironment = {
    isGM: () => (globalThis as any).game?.user?.isGM === true,
    suiteModule: () => (globalThis as any).game?.modules?.get?.(SUITE_MODULE_ID),
    applicationV2: () => (globalThis as any).foundry?.applications?.api?.ApplicationV2,
  }) {}

  open(): Promise<void> {
    if (!this.#pending) this.#pending = this.#open().finally(() => { this.#pending = undefined; });
    return this.#pending;
  }

  async #open(): Promise<void> {
    if (this.environment.isGM()) {
      const suite = this.environment.suiteModule();
      const api = suite?.api;
      if (suite?.active === true && api?.moduleId === SUITE_MODULE_ID && api?.apiVersion === 1 && typeof api.openHelp === 'function') {
        try { await api.openHelp({ entryId: manual.id }); return; }
        catch { /* The same-source bundled help remains available independently. */ }
      }
    }
    if (!this.#fallback) {
      const Base = this.environment.applicationV2();
      if (typeof Base !== 'function') throw new Error('Foundry ApplicationV2 is unavailable.');
      this.#fallback = new (class ChatMemoryGuardHelpApplication extends Base {
        static DEFAULT_OPTIONS = {
          id: 'chat-memory-guard-help', classes: ['chat-memory-guard-help'], tag: 'div',
          window: { title: manual.title, icon: 'fa-solid fa-circle-question', resizable: true, minimizable: true, controls: [], contentTag: 'section' },
          position: { width: 720, height: 660 },
        };
        async _renderHTML(): Promise<HTMLElement> { return renderModuleManual(this.element.ownerDocument, manual); }
        _replaceHTML(result: HTMLElement, content: HTMLElement): void { content.replaceChildren(result); }
      })();
    }
    await this.#fallback.render({ force: true });
    await this.#fallback.maximize();
    this.#fallback.bringToFront();
  }
}

const chatGuardHelp = new ChatGuardHelp();
export function openChatGuardHelp(): Promise<void> { return chatGuardHelp.open(); }

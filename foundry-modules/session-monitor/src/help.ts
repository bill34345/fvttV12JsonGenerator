import { renderModuleManual } from '@fvtt-json-generator/suite-handbook';
import { MODULE_ID } from './schema';
import manual from '../docs/manual.json';

const SUITE_MODULE_ID = 'fvtt-suite-console';

export interface MonitorHelpEnvironment {
  isGM(): boolean;
  suiteModule(): { active?: unknown; api?: any } | undefined;
  applicationV2(): any;
}

export class MonitorHelp {
  #fallback: any;
  #pending: Promise<void> | undefined;

  constructor(private readonly environment: MonitorHelpEnvironment = {
    isGM: () => (globalThis as any).game?.user?.isGM === true,
    suiteModule: () => (globalThis as any).game?.modules?.get?.(SUITE_MODULE_ID),
    applicationV2: () => (globalThis as any).foundry?.applications?.api?.ApplicationV2,
  }) {}

  #assertGM(): void {
    if (!this.environment.isGM()) throw new Error('Session Monitor help is available to GMs only.');
  }

  open(): Promise<void> {
    this.#assertGM();
    if (!this.#pending) this.#pending = this.#open().finally(() => { this.#pending = undefined; });
    return this.#pending;
  }

  async #open(): Promise<void> {
    const suite = this.environment.suiteModule();
    const api = suite?.api;
    if (suite?.active === true && api?.moduleId === SUITE_MODULE_ID && api?.apiVersion === 1 && typeof api.openHelp === 'function') {
      try {
        // Handbook IDs describe entries; this module's runtime ID is different.
        await api.openHelp({ entryId: manual.id });
        this.#assertGM();
        return;
      } catch { /* Keep independent reading available when the optional Suite cannot open. */ }
    }
    this.#assertGM();
    if (!this.#fallback) {
      const Base = this.environment.applicationV2();
      if (typeof Base !== 'function') throw new Error('Foundry ApplicationV2 is unavailable.');
      const assertGM = () => this.#assertGM();
      this.#fallback = new (class SpellMonitorHelpApplication extends Base {
        static DEFAULT_OPTIONS = {
          id: `${MODULE_ID}-help`, classes: ['fvtt-session-monitor-help'], tag: 'div',
          window: { title: manual.title, icon: 'fa-solid fa-circle-question', resizable: true, minimizable: true, controls: [], contentTag: 'section' },
          position: { width: 760, height: 680 },
        };
        _canRender(): void { assertGM(); }
        async _renderHTML(): Promise<HTMLElement> { return renderModuleManual(this.element.ownerDocument, manual); }
        _replaceHTML(result: HTMLElement, content: HTMLElement): void { content.replaceChildren(result); }
      })();
    }
    await this.#fallback.render({ force: true });
    this.#assertGM();
    await this.#fallback.maximize();
    this.#assertGM();
    this.#fallback.bringToFront();
  }
}

const readers = new WeakMap<object, MonitorHelp>();
export function openMonitorHelp(globals: any = globalThis): Promise<void> {
  let reader = readers.get(globals);
  if (!reader) {
    reader = new MonitorHelp({
      isGM: () => globals.game?.user?.isGM === true,
      suiteModule: () => globals.game?.modules?.get?.(SUITE_MODULE_ID),
      applicationV2: () => globals.foundry?.applications?.api?.ApplicationV2,
    });
    readers.set(globals, reader);
  }
  return reader.open();
}

import { renderModuleManual } from '@fvtt-json-generator/suite-handbook';
import manual from '../docs/manual.json';
import { MODULE_ID } from './constants.ts';

const SUITE_MODULE_ID = 'fvtt-suite-console';

export interface TokenSyncHelpEnvironment {
  isGM(): boolean;
  suiteModule(): { active?: unknown; api?: any } | undefined;
  applicationV2(): any;
}

/** All roles can read the bundled manual; the optional Suite reader is GM-only. */
export class TokenSyncHelp {
  #fallback: any;
  #pending: Promise<void> | undefined;

  constructor(private readonly environment: TokenSyncHelpEnvironment) {}

  open(): Promise<void> {
    if (!this.#pending) this.#pending = this.#open().finally(() => { this.#pending = undefined; });
    return this.#pending;
  }

  async #open(): Promise<void> {
    if (this.environment.isGM()) {
      const suite = this.environment.suiteModule();
      const api = suite?.api;
      if (suite?.active === true && api?.moduleId === SUITE_MODULE_ID && api?.apiVersion === 1 && typeof api.openHelp === 'function') {
        try {
          await api.openHelp({ entryId: MODULE_ID });
          return;
        } catch { /* Independent reading remains available if the Suite cannot open. */ }
      }
    }
    if (!this.#fallback) {
      const Base = this.environment.applicationV2();
      if (typeof Base !== 'function') throw new Error('Foundry ApplicationV2 is unavailable.');
      this.#fallback = new (class SelectedTokenSyncHelpApplication extends Base {
        static DEFAULT_OPTIONS = {
          id: `${MODULE_ID}-help`,
          classes: ['fvtt-selected-token-sync-help'],
          tag: 'div',
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

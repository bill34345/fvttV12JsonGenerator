import manual from '../docs/manual.json';

const SUITE_MODULE_ID = 'fvtt-suite-console';
const HELP_WINDOW_ID = 'open-session-deck-help';

function assertGm(): void {
  if (!game.user?.isGM) throw new Error('Open Session Deck is available to GMs only.');
}

function addText(parent: HTMLElement, tag: string, value: string): HTMLElement {
  const element = parent.ownerDocument.createElement(tag);
  element.textContent = value;
  parent.append(element);
  return element;
}

function addList(parent: HTMLElement, title: string, values: readonly string[]): void {
  const section = parent.ownerDocument.createElement('section');
  addText(section, 'h2', title);
  const list = section.ownerDocument.createElement('ul');
  for (const value of values) addText(list, 'li', value);
  section.append(list);
  parent.append(section);
}

function renderManual(doc: Document): HTMLElement {
  const root = doc.createElement('article');
  root.className = 'osd-help-root';
  addText(root, 'h1', manual.title);
  addText(root, 'p', manual.summary).className = 'osd-help-summary';
  addText(root, 'p', manual.when);
  addList(root, '使用前准备', manual.requires);
  const steps = doc.createElement('section');
  addText(steps, 'h2', '操作步骤');
  const ordered = doc.createElement('ol');
  for (const step of manual.steps) {
    const item = doc.createElement('li');
    addText(item, 'h3', step.title);
    addText(item, 'p', step.text);
    ordered.append(item);
  }
  steps.append(ordered);
  root.append(steps);
  addList(root, '输出', manual.outputs);
  addList(root, '限制', manual.limits);
  return root;
}

/** Read-only Deck help. The bundled local manual is also the shared handbook entry source. */
export class DeckHelp {
  #fallback: any;
  #pending: Promise<void> | undefined;

  open(): Promise<void> {
    assertGm();
    if (!this.#pending) this.#pending = this.#open().finally(() => { this.#pending = undefined; });
    return this.#pending;
  }

  async #open(): Promise<void> {
    const suite = game.modules?.get?.(SUITE_MODULE_ID);
    const api = suite?.api;
    if (suite?.active === true && api?.moduleId === SUITE_MODULE_ID && api?.apiVersion === 1 && typeof api.openHelp === 'function') {
      try {
        await api.openHelp({ entryId: 'open-session-deck' });
        return;
      } catch { /* The bundled manual remains available when Suite cannot open. */ }
    }
    await this.#openFallback();
  }

  async #openFallback(): Promise<void> {
    assertGm();
    if (!this.#fallback) {
      const Base = (globalThis as any).foundry?.applications?.api?.ApplicationV2;
      if (typeof Base !== 'function') throw new Error('Foundry ApplicationV2 is unavailable.');
      this.#fallback = new (class OpenSessionDeckHelpApplication extends Base {
        static DEFAULT_OPTIONS = {
          id: HELP_WINDOW_ID,
          classes: ['open-session-deck-help'],
          tag: 'div',
          window: { title: manual.title, icon: 'fa-solid fa-circle-question', resizable: true, minimizable: true, controls: [], contentTag: 'section' },
          position: { width: 760, height: 680 },
        };

        _canRender(): void { assertGm(); }
        async _renderHTML(): Promise<HTMLElement> { return renderManual(this.element.ownerDocument); }
        _replaceHTML(result: HTMLElement, content: HTMLElement): void { content.replaceChildren(result); }
      })();
    }
    await this.#fallback.render({ force: true });
    // Core's forced render starts maximize asynchronously; await it so a
    // minimized or covered help window is visible when this method resolves.
    assertGm();
    await this.#fallback.maximize();
    assertGm();
    this.#fallback.bringToFront();
  }
}

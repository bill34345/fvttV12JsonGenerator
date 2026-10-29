/** Keep list content on one line while preserving the full text in its tooltip. */
export class DeckListEllipsis {
  #observer?: ResizeObserver;
  #generation = 0;
  #context?: CanvasRenderingContext2D | null;

  constructor(private readonly measure?: (text: string, element: HTMLElement) => number) {}

  bind(root: HTMLElement): void {
    this.dispose();
    const generation = this.#generation;
    const elements = [...root.querySelectorAll<HTMLElement>('[data-osd-ellipsis]')];
    if (!elements.length) return;
    const names = new Map(elements.filter((element) => element.hasAttribute('data-osd-name'))
      .map((element) => [element, element.dataset.osdName || element.querySelector('.osd-ellipsis-content')?.textContent || '']));
    const update = () => {
      if (generation !== this.#generation) return;
      for (const element of elements) {
        const content = element.querySelector<HTMLElement>('.osd-ellipsis-content');
        const marker = element.querySelector<HTMLElement>('.osd-ellipsis-marker');
        if (!content || !marker) continue;
        if (!element.clientWidth) continue;
        const fullName = names.get(element);
        const children = [...content.children] as HTMLElement[];
        if (fullName === undefined) for (const child of children) child.hidden = false;
        marker.hidden = true;
        const overflowing = (fullName === undefined ? content.scrollWidth : this.#textWidth(fullName, content)) > element.clientWidth + .5;
        element.dataset.osdOverflow = String(overflowing);
        marker.hidden = !overflowing;
        if (fullName !== undefined) {
          const characters = [...fullName];
          let count = characters.length;
          if (overflowing) {
            let low = 0, high = characters.length;
            const available = element.clientWidth - marker.getBoundingClientRect().width;
            while (low < high) {
              const middle = Math.ceil((low + high) / 2);
              if (this.#textWidth(characters.slice(0, middle).join(''), content) <= available) low = middle;
              else high = middle - 1;
            }
            count = low;
          }
          content.textContent = characters.slice(0, count).join('');
        } else if (overflowing) {
          const available = element.clientWidth - marker.getBoundingClientRect().width;
          const gap = parseFloat(content.ownerDocument.defaultView!.getComputedStyle(content).gap) || 0;
          let used = 0, omitted = false;
          for (const child of children) {
            const width = child.getBoundingClientRect().width + (used ? gap : 0);
            omitted ||= used + width > available;
            child.hidden = omitted;
            if (!omitted) used += width;
          }
        }
      }
    };
    const Observer = (root.ownerDocument.defaultView as any)?.ResizeObserver ?? globalThis.ResizeObserver;
    if (typeof Observer === 'function') {
      // Popout observers must use that window's rendering cycle while the GM tab is in the background.
      const observer: ResizeObserver = new Observer(update);
      this.#observer = observer;
      for (const element of elements) observer.observe(element);
    }
    update();
    void root.ownerDocument.fonts?.ready.then(update);
  }

  dispose(): void { this.#generation++; this.#observer?.disconnect(); this.#observer = undefined; }

  #textWidth(text: string, element: HTMLElement): number {
    if (this.measure) return this.measure(text, element);
    if (!this.#context) {
      const canvas = element.ownerDocument.createElement('canvas');
      canvas.width = canvas.height = 1;
      this.#context = canvas.getContext('2d');
    }
    const style = element.ownerDocument.defaultView!.getComputedStyle(element);
    this.#context!.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return this.#context!.measureText(text).width;
  }
}

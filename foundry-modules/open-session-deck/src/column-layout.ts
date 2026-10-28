const DEFAULT_SHARE = 55;

/** Keep sizing local to each surface across snapshot renders. */
export class DeckColumnLayout {
  #share = DEFAULT_SHARE;
  #cleanup?: () => void;

  bind(root: HTMLElement): void {
    this.dispose();
    const columns = root.querySelector<HTMLElement>('.osd-columns');
    const handle = root.querySelector<HTMLElement>('[data-osd-column-resizer]');
    if (!columns || !handle) return;
    let pointerId: number | undefined;
    let grabOffset = 0;

    const bounds = () => {
      const width = columns.getBoundingClientRect().width - handle.getBoundingClientRect().width;
      return {
        width,
        min: Math.min(45, Math.max(25, 420 / width * 100)),
        max: Math.max(55, Math.min(75, (width - 320) / width * 100)),
      };
    };
    const apply = (requested = this.#share) => {
      const { width, min, max } = bounds();
      if (width <= 0) return;
      this.#share = Math.min(max, Math.max(min, requested));
      columns.style.setProperty('--osd-party-track', `${this.#share}fr`);
      columns.style.setProperty('--osd-encounter-track', `${100 - this.#share}fr`);
      handle.setAttribute('aria-valuemin', String(Math.round(min)));
      handle.setAttribute('aria-valuemax', String(Math.round(max)));
      handle.setAttribute('aria-valuenow', String(Math.round(this.#share)));
    };
    const stop = () => {
      const captured = pointerId;
      pointerId = undefined;
      columns.classList.remove('osd-resizing');
      if (captured !== undefined && handle.hasPointerCapture(captured)) handle.releasePointerCapture(captured);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      grabOffset = event.clientX - handle.getBoundingClientRect().left;
      pointerId = event.pointerId;
      handle.setPointerCapture(event.pointerId);
      handle.focus({ preventScroll: true });
      columns.classList.add('osd-resizing');
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const { width } = bounds();
      if (width > 0) apply((event.clientX - columns.getBoundingClientRect().left - grabOffset) / width * 100);
    };
    const end = (event: PointerEvent) => { if (event.pointerId === pointerId) stop(); };
    const reset = () => apply(DEFAULT_SHARE);
    const key = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 10 : 2;
      const { min, max } = bounds();
      const next = event.key === 'ArrowLeft' ? this.#share - step
        : event.key === 'ArrowRight' ? this.#share + step
          : event.key === 'Home' ? min : event.key === 'End' ? max
            : event.key === 'Enter' ? DEFAULT_SHARE : undefined;
      if (next === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      apply(next);
    };
    const keyup = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(event.key)) event.stopPropagation();
    };
    handle.addEventListener('pointerdown', down);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
    handle.addEventListener('keydown', key);
    handle.addEventListener('keyup', keyup);
    handle.addEventListener('dblclick', reset);
    const observer = new ResizeObserver(() => apply());
    observer.observe(columns);
    this.#cleanup = () => {
      stop();
      observer.disconnect();
      handle.removeEventListener('pointerdown', down);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      handle.removeEventListener('lostpointercapture', end);
      handle.removeEventListener('keydown', key);
      handle.removeEventListener('keyup', keyup);
      handle.removeEventListener('dblclick', reset);
    };
    apply();
  }

  dispose(): void {
    this.#cleanup?.();
    this.#cleanup = undefined;
  }
}

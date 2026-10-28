import { buildOperationPlan, type DeckOperationId, type DeckOperationPayload } from './operation-planner.ts';
import { DeckOperationSelection, fittingSelectionTags } from './operation-selection.ts';
import { runDeckUiAction } from './ui-errors.ts';
import type { DeckCommand, DeckSnapshot } from './types.ts';

/** Per-surface operation targets are independent of the creature being inspected. */
export class DeckRosterView {
  readonly selection = new DeckOperationSelection();
  #snapshot?: DeckSnapshot;
  #root?: HTMLElement;
  #cleanup?: () => void;
  #busy = new Set<string>();
  #values = new Map<string, string>();
  #portraitThumbnail?: (source: string) => string;

  update(snapshot: DeckSnapshot): void { this.#snapshot = snapshot; this.selection.update(snapshot); }
  setBusy(keys: ReadonlySet<string>): void { this.#busy = new Set(keys); this.#syncOperations(); }

  bind(root: HTMLElement, snapshot?: DeckSnapshot, executeBatch: (commands: readonly DeckCommand[]) => Promise<void> = async () => {}, portraitThumbnail?: (source: string) => string): void {
    this.dispose();
    const deck = root.querySelector<HTMLElement>('[data-osd-deck]');
    if (!deck || !snapshot) return;
    this.#root = deck;
    this.#portraitThumbnail = portraitThumbnail;
    this.update(snapshot);
    for (const input of deck.querySelectorAll<HTMLInputElement>('[data-osd-operation-input]')) {
      const value = this.#values.get(input.dataset.osdOperationInput!);
      if (value !== undefined) input.value = value;
    }
    const change = (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (input.matches('[data-osd-select-target]')) {
        this.selection.toggle(input.value, input.checked); this.#apply();
      } else if (input.matches('[data-osd-select-scope]')) {
        for (const target of deck.querySelectorAll<HTMLInputElement>(`[data-osd-select-target][data-osd-scope="${input.dataset.osdSelectScope}"]`)) this.selection.toggle(target.value, input.checked);
        this.#apply();
      }
    };
    const input = (event: Event) => {
      const element = event.target as HTMLInputElement;
      if (element.matches('[data-osd-operation-input]')) this.#values.set(element.dataset.osdOperationInput!, element.value);
    };
    const click = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button');
      if (!button || button.disabled) return;
      if (button.hasAttribute('data-osd-select-all-party')) {
        for (const input of deck.querySelectorAll<HTMLInputElement>('[data-osd-select-target][data-osd-scope="party"]')) this.selection.toggle(input.value, true);
        this.#apply();
      } else if (button.dataset.osdInspect !== undefined) this.#inspect(button);
      else if (button.dataset.osdRemoveSelection) { this.selection.toggle(button.dataset.osdRemoveSelection, false); this.#apply(); }
      else if (button.hasAttribute('data-osd-clear-selection')) { this.selection.clear(); this.#apply(); }
      else if (button.dataset.osdStepInput) {
        event.preventDefault();
        const field = button.dataset.osdStepInput;
        const input = deck.querySelector<HTMLInputElement>(`[data-osd-operation-input="${field}"]`)!;
        if (button.dataset.osdStep === '1') input.stepUp(); else input.stepDown();
        this.#values.set(field, input.value);
      }
      else if (button.dataset.osdOperation && this.#snapshot) {
        const plan = buildOperationPlan(this.#snapshot, this.selection.selected.map((entry) => entry.card), button.dataset.osdOperation as DeckOperationId, this.#payload(button));
        if (plan.commands.length) runDeckUiAction(() => executeBatch(plan.commands));
      }
    };
    deck.addEventListener('change', change); deck.addEventListener('input', input); deck.addEventListener('click', click);
    const viewport = deck.ownerDocument.defaultView!;
    const resize = () => this.#fitTags();
    const tags = deck.querySelector<HTMLElement>('[data-osd-selected-tags]');
    const observer = viewport.ResizeObserver ? new viewport.ResizeObserver(resize) : undefined;
    if (tags) observer?.observe(tags);
    for (const list of deck.querySelectorAll<HTMLElement>('.osd-roster,.osd-encounter-list')) observer?.observe(list);
    viewport.addEventListener('resize', resize);
    this.#cleanup = () => {
      deck.removeEventListener('change', change); deck.removeEventListener('input', input); deck.removeEventListener('click', click);
      viewport.removeEventListener('resize', resize); observer?.disconnect();
    };
    this.#apply();
  }

  #apply(): void {
    const deck = this.#root;
    if (!deck) return;
    for (const input of deck.querySelectorAll<HTMLInputElement>('[data-osd-select-target]')) {
      input.checked = this.selection.keys.has(input.value);
      input.closest('[data-osd-target-row]')?.classList.toggle('selected', input.checked);
    }
    for (const row of deck.querySelectorAll<HTMLElement>('[data-osd-target-row]')) {
      const state = row.querySelector<HTMLElement>('[data-osd-inspection-selected]');
      if (state) state.textContent = localize(row.querySelector<HTMLInputElement>('[data-osd-select-target]')?.checked ? 'OSD.Selection.Checked' : 'OSD.Selection.Unchecked');
    }
    for (const input of deck.querySelectorAll<HTMLInputElement>('[data-osd-select-scope]')) {
      const targets = [...deck.querySelectorAll<HTMLInputElement>(`[data-osd-select-target][data-osd-scope="${input.dataset.osdSelectScope}"]`)];
      input.checked = targets.length > 0 && targets.every((target) => target.checked);
      input.indeterminate = targets.some((target) => target.checked) && !input.checked;
    }
    const selected = this.selection.selected;
    const operations = deck.querySelector<HTMLElement>('[data-osd-operations]');
    if (operations) operations.hidden = selected.length === 0;
    const count = deck.querySelector<HTMLElement>('[data-osd-selection-count]');
    if (count) count.textContent = localize('OSD.Selection.Count').replace('{count}', String(selected.length));
    const track = deck.querySelector<HTMLElement>('[data-osd-tag-track]');
    const list = deck.querySelector<HTMLElement>('[data-osd-selected-list]');
    track?.replaceChildren(); list?.replaceChildren();
    for (const { key, card } of selected) {
      for (const [container, className] of [[track, 'osd-selected-tag'], [list, 'osd-selected-list-item']] as const) {
        if (!container) continue;
        const button = deck.ownerDocument.createElement('button');
        button.type = 'button'; button.className = className; button.dataset.osdRemoveSelection = key;
        button.title = `${localize('OSD.Selection.Remove')} ${card.name}`; button.setAttribute('aria-label', button.title);
        const portrait = deck.ownerDocument.createElement('img');
        portrait.src = card.portraitSource && this.#portraitThumbnail ? this.#portraitThumbnail(card.portraitSource) : card.img;
        portrait.alt = ''; portrait.decoding = 'async';
        if (card.portraitSource) portrait.dataset.osdPortraitSource = card.portraitSource;
        const name = deck.ownerDocument.createElement('span'); name.textContent = card.name;
        const icon = deck.ownerDocument.createElement('i'); icon.className = 'fa-solid fa-xmark'; icon.setAttribute('aria-hidden', 'true');
        button.append(portrait, name, icon); container.append(button);
      }
    }
    this.#fitTags(); this.#syncOperations();
  }

  #fitTags(): void {
    const deck = this.#root;
    const host = deck?.querySelector<HTMLElement>('[data-osd-selected-tags]');
    const track = deck?.querySelector<HTMLElement>('[data-osd-tag-track]');
    const overflow = deck?.querySelector<HTMLDetailsElement>('[data-osd-selection-overflow]');
    if (!host || !track || !overflow) return;
    const tags = [...track.children] as HTMLElement[];
    for (const tag of tags) tag.hidden = false;
    overflow.hidden = false;
    const summary = overflow.querySelector<HTMLElement>('summary')!;
    summary.textContent = `+${tags.length}`;
    const widths = tags.map((tag) => tag.getBoundingClientRect().width);
    const gap = Number.parseFloat(host.ownerDocument.defaultView!.getComputedStyle(track).gap) || 6;
    const clearWidth = host.querySelector<HTMLElement>('[data-osd-clear-selection]')!.getBoundingClientRect().width;
    const available = host.getBoundingClientRect().width - clearWidth - gap;
    const visible = fittingSelectionTags(widths, available, gap, summary.getBoundingClientRect().width);
    for (let index = visible; index < tags.length; index += 1) tags[index]!.hidden = true;
    const remaining = tags.length - visible;
    summary.textContent = `+${remaining}`;
    summary.title = this.selection.selected.map((entry) => entry.card.name).join('、');
    summary.setAttribute('aria-label', localize('OSD.Selection.More').replace('{count}', String(remaining)));
    overflow.hidden = remaining === 0;
    if (!remaining) overflow.open = false;
    for (const popup of deck!.querySelectorAll<HTMLElement>('[data-osd-inspection]')) {
      if (typeof popup.showPopover !== 'function' || !popup.matches(':popover-open')) continue;
      const button = popup.closest('[data-osd-target-row]')?.querySelector<HTMLButtonElement>('[data-osd-inspect]');
      if (button) this.#positionInspection(button, popup);
    }
  }

  #payload(button: HTMLButtonElement): DeckOperationPayload {
    const data = button.dataset;
    const payload: DeckOperationPayload = {};
    if (data.active !== undefined) payload.active = data.active === 'true';
    if (data.delta !== undefined) payload.delta = Number(data.delta);
    if (data.statusId) payload.statusId = data.statusId;
    if (data.field) payload.field = data.field as 'success' | 'failure';
    if (data.value !== undefined) payload.value = Number(data.value);
    if (data.valueInput) {
      const input = this.#root?.querySelector<HTMLInputElement>(`[data-osd-operation-input="${data.valueInput}"]`);
      if (data.osdOperation === 'actor.damage' || data.osdOperation === 'actor.heal' || data.osdOperation === 'actor.temp-hp') payload.amount = Number(input?.value);
      else payload.value = Number(input?.value);
    }
    return payload;
  }

  #syncOperations(): void {
    if (!this.#root || !this.#snapshot) return;
    const cards = this.selection.selected.map((entry) => entry.card);
    const busy = this.#busy.size > 0;
    for (const count of this.#root.querySelectorAll<HTMLElement>('[data-osd-applicable-count]')) {
      const plan = buildOperationPlan(this.#snapshot, cards, count.dataset.osdApplicableCount as DeckOperationId);
      count.textContent = String(plan.eligibleCount);
    }
    for (const button of this.#root.querySelectorAll<HTMLButtonElement>('button[data-osd-operation]')) {
      const plan = buildOperationPlan(this.#snapshot, cards, button.dataset.osdOperation as DeckOperationId, this.#payload(button));
      button.disabled = busy || plan.eligibleCount === 0;
      button.dataset.osdEligibleCount = String(plan.eligibleCount); button.setAttribute('aria-busy', String(busy));
      const count = button.querySelector<HTMLElement>('[data-osd-eligible]');
      if (count) count.textContent = String(plan.eligibleCount);
      button.title = `${button.dataset.osdLabel ?? button.textContent?.trim()} · ${localize('OSD.Selection.Eligible').replace('{count}', String(plan.eligibleCount))}`;
    }
  }

  #inspect(button: HTMLButtonElement): void {
    const popup = button.closest('[data-osd-target-row]')?.querySelector<HTMLElement>('[data-osd-inspection]');
    if (!popup) return;
    popup.setAttribute('popover', 'auto');
    if (typeof popup.showPopover === 'function') popup.showPopover(); else popup.hidden = false;
    this.#positionInspection(button, popup);
    const selected = popup.querySelector<HTMLElement>('[data-osd-inspection-selected]');
    const target = button.closest('[data-osd-target-row]')?.querySelector<HTMLInputElement>('[data-osd-select-target]');
    if (selected) selected.textContent = localize(target?.checked ? 'OSD.Selection.Checked' : 'OSD.Selection.Unchecked');
  }

  #positionInspection(button: HTMLButtonElement, popup: HTMLElement): void {
    const row = button.getBoundingClientRect(), viewport = popup.ownerDocument.defaultView!;
    const list = this.selection.selected.length ? button.closest('.osd-roster,.osd-encounter-list')?.getBoundingClientRect() : undefined;
    const dock = this.selection.selected.length ? this.#root?.querySelector<HTMLElement>('[data-osd-operations]')?.getBoundingClientRect() : undefined;
    const left = Math.max(12, list?.left ?? 12);
    const right = Math.min(viewport.innerWidth - 12, list?.right ?? viewport.innerWidth - 12);
    const bottom = Math.min(viewport.innerHeight - 12, list?.bottom ?? viewport.innerHeight - 12, dock ? dock.top - 8 : viewport.innerHeight - 12);
    const top = Math.max(12, Math.min(list?.top ?? 12, bottom - 320));
    popup.style.maxWidth = `${Math.max(0, right - left)}px`;
    popup.style.maxHeight = `${Math.max(0, Math.min(560, viewport.innerHeight * .75, bottom - top))}px`;
    const bounds = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(left, Math.min(row.right + 8, right - bounds.width))}px`;
    popup.style.top = `${Math.max(top, Math.min(row.top, bottom - bounds.height))}px`;
  }

  dispose(): void { this.#cleanup?.(); this.#cleanup = undefined; this.#root = undefined; }
}

function localize(key: string): string { return game.i18n.localize(key); }

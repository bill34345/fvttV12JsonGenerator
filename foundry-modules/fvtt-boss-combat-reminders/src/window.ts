import type { Choice, ReminderCard, ReminderGroup, ReminderKind, RemindersUI } from './types.ts';

interface WindowBase {
  render(options: { force: boolean }): Promise<unknown>;
  close(options?: object): Promise<unknown>;
}
type AppConstructor = new (options: object) => WindowBase;

const eventIcons: Record<ReminderKind, string> = {
  legendary: 'fa-crown',
  resistance: 'fa-shield-halved',
  lair: 'fa-dungeon',
  bloodied: 'fa-droplet',
  death: 'fa-skull',
};

export function createRemindersWindow(Application: AppConstructor, tr: (key: string) => string, error: (message: string) => void): RemindersUI {
  const cards = new Map<string, ReminderCard>();
  let busy = false;
  const redraw = async () => {
    if (!cards.size) await app.close();
    else await app.render({ force: true });
  };

  class BossReminderWindow extends Application {
    override async close(options?: object): Promise<unknown> {
      cards.clear();
      return super.close(options);
    }

    async _renderHTML(): Promise<HTMLElement> {
      const list = document.createElement('section');
      list.className = 'boss-reminder-cards';
      list.setAttribute('aria-label', tr('Window.Title'));
      for (const card of cards.values()) {
        const section = document.createElement('section');
        section.className = 'boss-reminder-card';
        section.dataset.kind = card.kind;
        section.setAttribute('aria-label', card.title);

        const header = node('header', 'boss-reminder-heading');
        const title = node('div', 'boss-reminder-title');
        title.append(node('h2', '', card.title));
        if (card.timing) title.append(node('p', 'boss-reminder-timing', card.timing));
        const skip = node('button', 'boss-reminder-skip', tr('Window.Skip'));
        skip.type = 'button';
        skip.addEventListener('click', () => {
          cards.delete(card.id);
          void redraw();
        });
        header.append(icon(eventIcons[card.kind], 'boss-reminder-emblem'), title, skip);
        section.append(header);

        for (const group of card.groups) {
          const groupNode = node('div', 'boss-reminder-group');
          groupNode.setAttribute('role', 'group');
          groupNode.setAttribute('aria-label', group.label);
          const identity = node('div', 'boss-reminder-identity');
          identity.append(
            artwork(group.portrait, 'fa-dragon', 'boss-reminder-portrait'),
            node('h3', '', group.label),
          );
          if (group.remaining) identity.append(node('span', 'boss-reminder-remaining', group.remaining));
          const actions = node('ul', 'boss-reminder-actions');
          for (const choice of group.choices) {
            const row = document.createElement('li');
            const button = node('button', 'boss-reminder-action');
            button.type = 'button';
            button.disabled = busy;
            const copy = node('span', 'boss-reminder-choice');
            copy.append(node('span', 'boss-reminder-choice-name', choice.label));
            if (choice.facts?.length) {
              const facts = node('span', 'boss-reminder-facts');
              for (const label of choice.facts) facts.append(node('span', 'boss-reminder-fact', label));
              copy.append(facts);
            }
            button.append(artwork(choice.image, eventIcons[card.kind], 'boss-reminder-action-image'), copy);
            if (choice.cost) button.append(node('span', 'boss-reminder-cost', choice.cost));
            button.append(icon('fa-chevron-right', 'boss-reminder-chevron'));
            button.addEventListener('click', event => {
              for (const item of list.querySelectorAll<HTMLButtonElement>('.boss-reminder-action')) item.disabled = true;
              button.setAttribute('aria-busy', 'true');
              void choose(card, group, choice, event);
            });
            row.append(button);
            actions.append(row);
          }
          groupNode.append(identity, actions);
          section.append(groupNode);
        }
        list.append(section);
      }
      return list;
    }

    _replaceHTML(result: HTMLElement, content: HTMLElement): void {
      content.replaceChildren(result);
    }
  }

  const width = 396;
  const app = new BossReminderWindow({
    id: 'fvtt-boss-combat-reminders-window',
    window: { title: tr('Window.Title'), icon: 'fa-solid fa-dragon', resizable: true },
    position: { width, top: 80, left: Math.max(16, globalThis.innerWidth - width - 368) },
  });

  return {
    show(card) {
      const existing = cards.get(card.id);
      if (!existing) cards.set(card.id, card);
      else {
        const present = new Set(existing.groups.map(group => group.id));
        existing.groups.push(...card.groups.filter(group => !present.has(group.id)));
      }
      void redraw();
    },
    remove(id) {
      if (cards.delete(id)) void redraw();
    },
    removeGroup(id, group) {
      const card = cards.get(id);
      if (!card || !card.groups.some(entry => entry.id === group)) return;
      card.groups = card.groups.filter(entry => entry.id !== group);
      if (!card.groups.length) cards.delete(id);
      void redraw();
    },
    clear() {
      if (!cards.size) return;
      cards.clear();
      void redraw();
    },
  };

  async function choose(card: ReminderCard, group: ReminderGroup, choice: Choice, event: Event): Promise<void> {
    if (busy || cards.get(card.id) !== card) return;
    busy = true;
    try {
      if (!await choice.run(event) || cards.get(card.id) !== card) return;
      if (group.oneChoice) group.choices = [];
      else group.choices = group.choices.filter(option => option.id !== choice.id);
      card.groups = card.groups.filter(option => option.choices.length);
      if (!card.groups.length) cards.delete(card.id);
    } catch (cause) {
      console.error('[Boss Combat Reminders] Native activity failed', cause);
      error(tr('Window.Failed'));
    } finally {
      busy = false;
      await redraw();
    }
  }
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function icon(glyph: string, className: string): HTMLElement {
  const element = node('i', `fa-solid ${glyph} ${className}`);
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function artwork(url: string | undefined, fallback: string, className: string): HTMLElement {
  if (!url) return icon(fallback, className);
  const image = node('img', className);
  image.alt = '';
  image.addEventListener('error', () => image.replaceWith(icon(fallback, className)), { once: true });
  image.src = url;
  return image;
}

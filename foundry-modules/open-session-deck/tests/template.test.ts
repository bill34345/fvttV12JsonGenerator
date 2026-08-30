import { beforeAll, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Handlebars from 'handlebars';

let render: Handlebars.TemplateDelegate;
let english: Record<string, string>;

beforeAll(async () => {
  const source = await readFile(resolve(import.meta.dir, '../src/templates/deck.hbs'), 'utf8');
  english = JSON.parse(await readFile(resolve(import.meta.dir, '../src/lang/en.json'), 'utf8'));
  Handlebars.registerHelper('localize', (key: string) => english[key] ?? key);
  render = Handlebars.compile(source);
});

function enabled(tooltipKey: string) { return { enabled: true, tooltipKey }; }
function disabled(tooltipKey: string) { return { enabled: false, tooltipKey }; }

function actorCard(overrides: Record<string, unknown> = {}) {
  return {
    uuid: 'Actor.hero', id: 'hero', name: 'Hero', img: '/hero.webp', type: 'character',
    players: [
      { id: 'alice', name: 'Alice', active: false },
      { id: 'bob', name: 'Bob', active: true },
    ],
    hp: { value: 10, max: 20, temp: 2, percent: 50 }, ac: 15,
    inspiration: true, exhaustion: 0, death: null, concentrating: false,
    statuses: [], inCombat: true, sources: ['automatic'],
    commands: {
      damage: enabled('OSD.Actions.Damage'), heal: enabled('OSD.Actions.Heal'), tempHp: enabled('OSD.Actions.TempHP'),
      toggleInspiration: enabled('OSD.Actions.Inspiration'),
      exhaustionDown: disabled('OSD.Errors.ExhaustionMinimum'), exhaustionUp: enabled('OSD.Actions.ExhaustionUp'),
      toggleStatus: disabled('OSD.Errors.NoControllableStatuses'), openSheet: enabled('OSD.Actions.OpenSheet'),
      locate: disabled('OSD.Errors.TokenNotActive'),
    },
    ...overrides,
  };
}

function context() {
  const combatant = actorCard({ current: true, tokenUuid: 'Scene.scene.Token.hero' });
  return {
    supported: true, world: { title: 'World' }, system: { id: 'dnd5e', version: '5.3.3' }, scene: { name: 'Scene' }, onlineUsers: 1,
    party: [actorCard()], hasParty: true, statusOptions: [], rosterManager: [], stalePinned: [], staleHidden: [], staleCount: 0,
    encounter: {
      active: true, uuid: 'Combat.one', round: 1, displayTurn: 1, combatants: [combatant],
      commands: {
        previousTurn: enabled('OSD.Actions.PreviousTurn'), nextTurn: enabled('OSD.Actions.NextTurn'), focusCurrent: enabled('OSD.Actions.FocusCurrent'),
      },
    },
    hasEncounterCards: true, activeTab: 'party', partyTabActive: true, encounterTabActive: false, compact: false, isPopout: false,
  };
}

describe('Deck template semantics', () => {
  test('renders per-player presence and explicit inspiration and encounter text', () => {
    const html = render(context());
    expect(html).toContain('Alice <span class="osd-player-state">(offline)</span>');
    expect(html).toContain('Bob <span class="osd-player-state">(online)</span>');
    expect(html).toContain('Inspired');
    expect(html).toContain('In encounter');
  });

  test('renders unavailable operations disabled with localized reasons', () => {
    const html = render(context());
    expect(html).toMatch(/data-delta="-1"[^>]*disabled[^>]*title="Exhaustion is already at its minimum\."/);
    expect(html).toMatch(/data-osd-status disabled title="No controllable statuses are available\."/);
    expect(html).toMatch(/data-osd-command="actor\.toggle-status"[^>]*disabled[^>]*title="No controllable statuses are available\."/);
    expect(html).toMatch(/data-osd-command="token\.locate"[^>]*disabled[^>]*title="This token is not on the active scene\."/);
  });

  test('gives icon-only controls native and Foundry tooltip metadata', () => {
    const html = render(context());
    expect(html).toMatch(/data-osd-command="combat\.previous-turn"[^>]*title="Previous turn"[^>]*data-tooltip="OSD\.Actions\.PreviousTurn"/);
    expect(html).toMatch(/data-osd-command="combat\.next-turn"[^>]*title="Next turn"[^>]*data-tooltip="OSD\.Actions\.NextTurn"/);
    expect(html).toMatch(/data-osd-command="actor\.open-sheet"[^>]*title="Open sheet"[^>]*data-tooltip="OSD\.Actions\.OpenSheet"/);
  });
});

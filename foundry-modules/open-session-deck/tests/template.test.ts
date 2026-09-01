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
    playerNames: 'Alice, Bob', anyPlayerActive: true,
    hp: { value: 10, max: 25, baseMax: 20, maxModifier: 5, maxModifierDisplay: '+5', effectiveMax: 25, temp: 2, percent: 40 }, ac: 15, acModifier: 0,
    inspiration: true, exhaustion: 0, death: null, concentrating: false,
    statuses: [], statusChoices: [{ id: 'poisoned', label: 'Poisoned', active: false }], inCombat: true, sources: ['folder'],
    commands: {
      damage: enabled('OSD.Actions.Damage'), heal: enabled('OSD.Actions.Heal'), tempHp: enabled('OSD.Actions.TempHP'),
      toggleInspiration: enabled('OSD.Actions.Inspiration'),
      exhaustionDown: disabled('OSD.Errors.ExhaustionMinimum'), exhaustionUp: enabled('OSD.Actions.ExhaustionUp'),
      toggleStatus: disabled('OSD.Errors.NoControllableStatuses'), openSheet: enabled('OSD.Actions.OpenSheet'),
      locate: disabled('OSD.Errors.TokenNotActive'),
      setHp: enabled('OSD.Actions.SetHP'), setTempHp: enabled('OSD.Actions.SetTempHP'), setMaxModifier: enabled('OSD.Actions.SetMaxModifier'),
      setAcModifier: enabled('OSD.Actions.SetACModifier'), toggleConcentration: enabled('OSD.Actions.ToggleConcentration'),
      setDeathSave: enabled('OSD.Actions.SetDeathSave'), setInitiative: enabled('OSD.Actions.SetInitiative'),
      rollInitiative: enabled('OSD.Actions.RollInitiative'), toggleVisibility: enabled('OSD.Actions.ToggleVisibility'),
    },
    ...overrides,
  };
}

function context() {
  const combatant = actorCard({ current: true, partyMember: true, combatantId: 'hero-turn', initiative: 18.14, hasInitiative: true, tokenUuid: 'Scene.scene.Token.hero' });
  return {
    supported: true, world: { title: 'World' }, system: { id: 'dnd5e', version: '5.3.3' }, scene: { name: 'Scene' }, onlineUsers: 1,
    party: [actorCard()], hasParty: true, statusOptions: [{ id: 'poisoned', label: 'Poisoned' }], partyFolder: { selectedId: 'party', selectedName: 'Party', includeDescendants: true, missing: false, options: [] }, rosterManager: [], stalePinned: [], staleHidden: [], staleCount: 0,
    encounter: {
      active: true, uuid: 'Combat.one', round: 1, displayTurn: 1, combatants: [combatant],
      commands: {
        previousTurn: enabled('OSD.Actions.PreviousTurn'), nextTurn: enabled('OSD.Actions.NextTurn'), focusCurrent: enabled('OSD.Actions.FocusCurrent'),
        swapInitiative: enabled('OSD.Actions.SwapInitiative'), rollNpcInitiative: enabled('OSD.Actions.RollNpcInitiative'),
      },
    },
    currentCombatant: combatant, hasCurrentCombatant: true, hasEncounterCards: true, activeTab: 'party', partyTabActive: true, encounterTabActive: false, compact: false, isPopout: false,
  };
}

describe('Deck template semantics', () => {
  test('renders direct party controls and keeps the same party member compact in encounter', () => {
    const html = render(context());
    expect(html).toContain('Alice, Bob');
    expect(html).toContain('Remove inspiration');
    expect(html).toContain('data-osd-direct-command="actor.set-hp"');
    expect(html).toContain('value="+5" data-osd-direct-command="actor.set-max-modifier"');
    expect(html).toContain('class="osd-combatant-placeholder current"');
    expect(html).not.toContain('class="osd-npc-row current"');
  });

  test('renders unavailable operations disabled with localized reasons', () => {
    const html = render(context());
    expect(html).toMatch(/data-delta="-1"[^>]*disabled[^>]*title="Exhaustion is already at its minimum\."/);
    expect(html).toMatch(/data-osd-status-choice[^>]*disabled/);
    expect(html).toMatch(/data-osd-command="token\.locate"[^>]*disabled[^>]*title="This token is not on the active scene\."/);
  });

  test('gives icon-only controls native and Foundry tooltip metadata', () => {
    const html = render(context());
    expect(html).toMatch(/data-osd-command="combat\.previous-turn"[^>]*title="Previous turn"[^>]*data-tooltip="OSD\.Actions\.PreviousTurn"/);
    expect(html).toMatch(/data-osd-command="combat\.next-turn"[^>]*title="Next turn"[^>]*data-tooltip="OSD\.Actions\.NextTurn"/);
    expect(html).toMatch(/data-osd-command="actor\.open-sheet"[^>]*title="Open sheet"[^>]*data-tooltip="OSD\.Actions\.OpenSheet"/);
  });

  test('keeps NPC encounter controls complete while reserving inspiration and exhaustion for character Actors', () => {
    const value = context();
    const npc = actorCard({ uuid: 'Actor.npc', id: 'npc', name: 'Goblin', type: 'npc', partyMember: false, characterControls: false, combatantId: 'npc-turn', current: false });
    const character = actorCard({ uuid: 'Actor.guest', id: 'guest', name: 'Guest', partyMember: false, characterControls: true, combatantId: 'guest-turn', current: false });
    value.encounter.combatants = [npc, character];
    value.hasEncounterCards = true;
    const html = render(value);
    const npcStart = html.indexOf('data-combatant-id="npc-turn"');
    const characterStart = html.indexOf('data-combatant-id="guest-turn"');
    const npcHtml = html.slice(npcStart, characterStart);
    const characterHtml = html.slice(characterStart);

    expect(npcHtml).toContain('data-osd-direct-command="actor.set-ac-modifier"');
    expect(npcHtml).toContain('data-osd-command="actor.toggle-concentration"');
    expect(npcHtml).not.toContain('data-osd-command="actor.toggle-inspiration"');
    expect(npcHtml).not.toContain('data-osd-command="actor.adjust-exhaustion"');
    expect(characterHtml).toContain('data-osd-command="actor.toggle-inspiration"');
    expect(characterHtml).toContain('data-osd-command="actor.adjust-exhaustion"');
  });

  test('keeps batch operations in a focused layer limited to HP and statuses', () => {
    const html = render(context());
    const batchStart = html.indexOf('data-osd-layer="batch"');
    const swapStart = html.indexOf('data-osd-layer="swap"');
    const batchHtml = html.slice(batchStart, swapStart);

    expect(batchHtml).toContain('data-batch-command="actor.damage"');
    expect(batchHtml).toContain('data-batch-command="actor.set-status"');
    expect(batchHtml).not.toContain('actor.toggle-inspiration');
    expect(batchHtml).not.toContain('actor.adjust-exhaustion');
    expect(batchHtml).not.toContain('actor.toggle-concentration');
    expect(batchHtml).not.toContain('actor.set-ac-modifier');
  });

  test('keeps encounter controls rendered but disabled with an explicit no-combat reason', () => {
    const value = context();
    value.encounter = {
      active: false, uuid: '', round: 0, displayTurn: 0, combatants: [],
      commands: {
        previousTurn: disabled('OSD.Errors.NoActiveCombat'),
        nextTurn: disabled('OSD.Errors.NoActiveCombat'),
        focusCurrent: disabled('OSD.Errors.NoActiveCombat'),
        swapInitiative: disabled('OSD.Errors.NoActiveCombat'),
        rollNpcInitiative: disabled('OSD.Errors.NoActiveCombat'),
      },
    };
    value.hasEncounterCards = false;
    const html = render(value);
    expect(html).toMatch(/data-osd-command="combat\.previous-turn"[^>]*disabled[^>]*title="There is no active encounter\."[^>]*data-tooltip="OSD\.Errors\.NoActiveCombat"[^>]*aria-label="There is no active encounter\."/);
    expect(html).toMatch(/data-osd-action="focus-current"[^>]*disabled[^>]*title="There is no active encounter\."[^>]*data-tooltip="OSD\.Errors\.NoActiveCombat"[^>]*aria-label="There is no active encounter\."/);
    expect(html).toMatch(/data-osd-command="combat\.next-turn"[^>]*disabled[^>]*title="There is no active encounter\."[^>]*data-tooltip="OSD\.Errors\.NoActiveCombat"[^>]*aria-label="There is no active encounter\."/);
    expect(html).toContain('Start or activate a combat in Foundry to populate this column.');
  });
});

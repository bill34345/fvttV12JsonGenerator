import { beforeAll, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Handlebars from 'handlebars';
import { JSDOM } from 'jsdom';

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
    characterControls: true, exhaustionControls: true,
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
      toggleDefeated: enabled('OSD.Actions.ToggleDefeated'),
    },
    ...overrides,
  };
}

function context() {
  const combatant = actorCard({ current: true, partyMember: true, combatantId: 'hero-turn', initiative: 18.14, hasInitiative: true, tokenUuid: 'Scene.scene.Token.hero' });
  return {
    supported: true, coreVersion: '14.368', world: { title: 'World' }, system: { id: 'dnd5e', version: '5.3.3' }, scene: { name: 'Scene' }, onlineUsers: 1,
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
  test('shows an avatar-free read-only inspector with depleted slots and separate inventory counts', () => {
    const value=context();value.party=[actorCard({death:{success:0,failure:0},inspection:{
      passives:{perception:17,insight:13,investigation:11},
      slots:[{key:'spell1',level:1,pact:false,value:0,max:3,depleted:true},{key:'pact',level:2,pact:true,value:1,max:2,depleted:false}],
      abilities:[{key:'rage',name:'Rage',uses:{value:0,max:2,depleted:true}}],
      inventory:[{key:'wand',name:'Wand',quantity:{value:2,depleted:false},uses:{value:3,max:7,depleted:false}},{key:'ammo',name:'Arrows',quantity:{value:0,depleted:true}}],
    }})];
    const document=new JSDOM(render(value)).window.document,popup=document.querySelector('[data-osd-party-row] [data-osd-inspection]')!;
    expect(popup.querySelector('img')).toBeNull();
    expect(popup.querySelector('.osd-inspection-passives')?.textContent).toContain('17');
    expect(popup.querySelectorAll('.osd-inspection-slots li')).toHaveLength(2);
    expect(popup.textContent).toContain('Pact Magic');expect(popup.textContent).toContain('Depleted');
    expect(popup.querySelector('.osd-inspection-resource-values')?.textContent).toContain('0 / 2');
    expect(popup.textContent).toContain('Quantity 2');expect(popup.textContent).toContain('Charges 3 / 7');
    expect(popup.querySelector('.osd-inspection-body')?.querySelector('button,input,select,[data-osd-operation]')).toBeNull();
    expect(popup.querySelectorAll('footer button')).toHaveLength(2);
    expect(popup.querySelector('.osd-inspection-secondary')?.textContent).toContain('Death saves');
  });
  test('shows party inspiration and exhaustion without selection in both surfaces, including zero and higher levels', () => {
    for (const isPopout of [false, true]) {
      const value = context();
      value.party = [
        actorCard({ uuid: 'Actor.none', inspiration: false, exhaustion: 0 }),
        actorCard({ uuid: 'Actor.active', inspiration: true, exhaustion: 3 }),
        actorCard({ uuid: 'Actor.maximum', inspiration: false, exhaustion: 6 }),
        actorCard({ uuid: 'Actor.npc', type: 'npc', characterControls: false, exhaustionControls: true, exhaustion: 2 }),
      ];
      const document = new JSDOM(render({ ...value, isPopout })).window.document;
      for (const [uuid, inspiration, level] of [['none', false, 0], ['active', true, 3], ['maximum', false, 6]] as const) {
        const row = document.querySelector(`[data-osd-party-row="Actor.${uuid}"]`)!;
        const heroic = row.querySelector<HTMLElement>('[data-osd-inspiration]')!;
        const exhaustion = row.querySelector<HTMLElement>('[data-osd-exhaustion]')!;
        expect(heroic.dataset.osdInspiration).toBe(String(inspiration));
        expect(heroic.title).toBe(english[inspiration ? 'OSD.Actor.HasHeroicInspiration' : 'OSD.Actor.NoHeroicInspiration']!);
        expect(heroic.closest('[hidden]')).toBeNull();
        expect(exhaustion.dataset.osdExhaustion).toBe(String(level));
        expect(exhaustion.querySelector('.osd-resource-value')?.textContent).toBe(String(level));
        expect(exhaustion.title).toContain(String(level));
        expect(exhaustion.closest('[hidden]')).toBeNull();
        expect(row.querySelector('.osd-person-info > strong')?.getAttribute('data-osd-name')).toBe('Hero');
      }
      const npc = document.querySelector('[data-osd-party-row="Actor.npc"]')!;
      expect(npc.querySelector('[data-osd-inspiration]')).toBeNull();
      expect(npc.querySelector('[data-osd-exhaustion]')?.getAttribute('data-osd-exhaustion')).toBe('2');
    }
  });

  test('groups the amount with Damage and Heal in the shared dock and keeps temporary HP independent', () => {
    const document=new JSDOM(render(context())).window.document, amount=document.querySelector<HTMLInputElement>('[data-osd-amount]')!;
    expect(amount.value).toBe('5');expect(amount.getAttribute('aria-label')).toBe('Damage / healing amount');expect(amount.closest<HTMLElement>('.osd-number-field')?.title).toContain('Temporary HP is set separately');
    const group=amount.closest('.osd-health-actions')!;
    expect(group.querySelector('[data-osd-operation="actor.damage"]')).not.toBeNull();expect(group.querySelector('[data-osd-operation="actor.heal"]')).not.toBeNull();expect(group.closest('[data-osd-operations]')).not.toBeNull();
    const temp=document.querySelector<HTMLInputElement>('[data-osd-operation-input="temp"]')!;
    const tempGroup=temp.closest('.osd-temp-actions')!;
    const tempButton=tempGroup.querySelector<HTMLButtonElement>('[data-osd-operation="actor.set-temp-hp"]')!;
    expect(temp).not.toBe(amount);expect(temp.value).toBe('0');expect(tempButton.getAttribute('data-value-input')).toBe('temp');
    expect(tempGroup.children[0]).toBe(tempButton);expect(tempGroup.children[1]).toBe(temp);
    expect(tempGroup.querySelectorAll('[data-osd-operation]')).toHaveLength(1);expect(tempGroup.querySelectorAll('[data-osd-step-input="temp"]')).toHaveLength(2);expect(tempButton.querySelector('.fa-shield-halved')).not.toBeNull();
    expect(tempButton.textContent).toContain('+ Temporary HP');expect(tempButton.textContent).not.toContain('Apply');
    expect(tempButton.getAttribute('data-osd-label')).toBe('Set temporary HP');expect(tempButton.getAttribute('aria-label')).toBe('Set temporary HP');
    expect(document.querySelector('[data-osd-party-editor]')).toBeNull();expect(document.querySelector('[data-osd-combatant-actions]')).toBeNull();
  });

  test('shares an accessible undo entry and never requests a browser modal', () => {
    for (const isPopout of [false, true]) {
      const document = new JSDOM(render({ ...context(), isPopout, undo: { count: 2, available: true, label: 'End concentration · Hero' } })).window.document;
      const undo = document.querySelector<HTMLButtonElement>('[data-osd-action="undo"]')!;
      expect(undo.disabled).toBeFalse();
      expect(undo.textContent?.trim()).toBe('Undo');
      expect(undo.title).toContain('End concentration · Hero');
      expect(document.querySelector('[data-confirm]')).toBeNull();
    }
    const document = new JSDOM(render(context())).window.document;
    expect(document.querySelector<HTMLButtonElement>('[data-osd-action="undo"]')!.disabled).toBeTrue();
  });

  test('keeps the total AC for non-party NPCs and the current scene available in both surfaces', () => {
    for (const isPopout of [false, true]) {
      const value = context();
      value.isPopout = isPopout;
      value.scene = { name: 'Current map' };
      value.encounter.combatants = [actorCard({ uuid: 'Actor.npc', id: 'npc', name: 'Goblin', ac: 19, acModifier: 2, type: 'npc', partyMember: false, characterControls: false, exhaustionControls: false, combatantId: 'npc-turn' })];
      const document = new JSDOM(render(value)).window.document;
      const npc = document.querySelector('[data-osd-combatant-row="npc-turn"]')!;
      expect(npc.querySelector('.osd-inspection')?.textContent).toContain('Armor Class19');
      expect(document.querySelector('[data-osd-operation="actor.set-ac-modifier"]')).not.toBeNull();
      expect(document.querySelector('[data-osd-current-scene]')?.textContent).toBe('Current scene: Current map');
    }
  });

  test('exposes row visibility and unrolled initiative without selecting, with native icons and accessible labels', () => {
    for (const isPopout of [false, true]) {
      const value = context();
      value.encounter.combatants = [
        actorCard({ partyMember: true, combatantId: 'unrolled', initiative: null, hasInitiative: false, hidden: true }),
        actorCard({ partyMember: false, combatantId: 'rolled', initiative: 0, hasInitiative: true, hidden: false, defeated: true }),
      ];
      const document = new JSDOM(render({ ...value, isPopout, initiativeIcon: { icon: '../icons/svg/d20.svg' } })).window.document;
      expect(document.querySelector('.osd-encounter-tools')).toBeNull();
      const shortcuts = document.querySelector('.osd-encounter-shortcuts')!;
      expect(shortcuts.querySelector('[data-target-layer="swap"]')?.getAttribute('title')).toBe('Swap initiative');
      expect(shortcuts.querySelector('[data-osd-command="combat.roll-npc-initiative"] i')?.classList.contains('fa-users-cog')).toBeTrue();
      const unrolled = document.querySelector('[data-osd-combatant-row="unrolled"]')!;
      const roll = unrolled.querySelector<HTMLButtonElement>('[data-osd-command="combat.roll-initiative"]')!;
      expect(roll.closest('[hidden]')).toBeNull();
      expect(roll.title).toBe('Roll private initiative');
      expect(roll.querySelector('.osd-native-d20')?.getAttribute('style')).toContain('../icons/svg/d20.svg');
      expect(unrolled.querySelector('[data-osd-direct-command="combat.set-initiative"]')).toBeNull();
      const show = unrolled.querySelector<HTMLButtonElement>('[data-osd-command="combat.toggle-visibility"]')!;
      expect(show.closest('[hidden]')).toBeNull();
      expect(show.title).toBe('Show combatant to players');
      expect(show.getAttribute('aria-pressed')).toBe('true');
      const rolled = document.querySelector('[data-osd-combatant-row="rolled"]')!;
      expect(rolled.querySelector('[data-osd-command="combat.roll-initiative"]')).toBeNull();
      expect(rolled.querySelector<HTMLInputElement>('[data-osd-direct-command="combat.set-initiative"]')!.value).toBe('0');
      expect(rolled.querySelector('[data-osd-command="combat.toggle-visibility"]')?.getAttribute('title')).toBe('Hide combatant from players');
      const defeat = document.querySelector('[data-osd-operation="combat.toggle-defeated"][data-active="false"]')!;
      expect(defeat.closest('[hidden]')).not.toBeNull();
      expect(defeat.textContent).toContain('Unmark defeated');
      expect(defeat.querySelector('i')?.classList.contains('fa-rotate-left')).toBeTrue();
    }
  });

  test('keeps full names/status tooltips and preserves death-save controls as selected-only detail', () => {
    const value = context();
    const name = '非常长的角色姓名'.repeat(12);
    const statuses = Array.from({ length: 12 }, (_, index) => ({ id: `state-${index}`, label: `状态${index}`, icon: '/state.svg' }));
    value.party = [actorCard({ name, showDeath: true, hp: { value: 0, effectiveMax: 9999, temp: 9999 }, death: { success: 2, failure: 3 }, statuses })];
    const document = new JSDOM(render(value)).window.document;
    const row = document.querySelector('[data-osd-party-row]')!;
    expect(row.querySelector('[data-osd-name]')?.getAttribute('data-osd-name')).toBe(name);
    const status = row.querySelector('.osd-status-icons')!;
    expect(status.getAttribute('title')).toContain(statuses.map(s => s.label).join('、'));
    expect(status.getAttribute('title')).toContain('Death saves');
    expect(status.getAttribute('title')).toContain('2');expect(status.getAttribute('title')).toContain('3');
    expect(status.querySelector('img')?.hasAttribute('title')).toBeFalse();
    expect(status.querySelector('.osd-death-summary')?.textContent?.trim()).toBe('');
    expect(status.querySelector('.osd-death-summary')?.getAttribute('title')).toContain('2');
    expect(status.querySelector('.osd-death-summary')?.getAttribute('title')).toContain('3');
    expect(row.querySelector('[data-osd-party-details]')).toBeNull();expect(row.querySelector('.osd-inspection')?.textContent).toContain('Death saves');
    expect(document.querySelectorAll('[data-osd-operation="actor.set-death-save"]')).toHaveLength(8);
    expect(row.querySelector('.osd-hp-readout')?.getAttribute('title')).toContain('0 / 9999');
    expect(row.querySelector('.osd-hp-readout')?.getAttribute('title')).toContain('+9999');
  });

  test('shows only status icons with localized hover names, including missing-image fallback, in both lists and surfaces', () => {
    for (const isPopout of [false, true]) {
      const value = context();
      const statuses = [{ id: 'concentrating', label: '专注', icon: '/concentrating.svg' }, { id: 'custom', label: '自定义状态' }];
      value.party = [actorCard({ statuses })];
      value.encounter.combatants = [actorCard({ combatantId: 'hero-turn', statuses })];
      const document = new JSDOM(render({ ...value, isPopout })).window.document;
      for (const list of ['.osd-roster', '.osd-encounter-list']) {
        const status = document.querySelector(`${list} [data-status-id="concentrating"]`)!;
        expect(status.getAttribute('title')).toBe('专注');
        expect(status.getAttribute('data-tooltip')).toBe('专注');
        expect(status.getAttribute('aria-label')).toBe('专注');
        expect(status.textContent?.trim()).toBe('');
        expect(status.querySelector('.osd-status-label')).toBeNull();
        expect(status.querySelector('img')!.getAttribute('alt')).toBe('');
        const fallback = document.querySelector(`${list} [data-status-id="custom"]`)!;
        expect(fallback.querySelector('.fa-circle-question')).not.toBeNull();
        expect(fallback.getAttribute('title')).toBe('自定义状态');
        expect(fallback.textContent?.trim()).toBe('');
      }
    }
  });

  test('keeps the HP headings in the same scrollable column width as their rows', () => {
    const document = new JSDOM(render(context())).window.document;
    const partyHeader = document.querySelector('.osd-grid-header')!;
    const partyRow = document.querySelector('.osd-party-row')!;
    expect(partyHeader.parentElement).toBe(partyRow.parentElement);
    expect(partyHeader.parentElement!.classList.contains('osd-roster')).toBeTrue();
    const encounterHeader = document.querySelector('.osd-queue-header')!;
    const encounterRow = document.querySelector('.osd-combatant-placeholder')!;
    expect(encounterHeader.parentElement).toBe(encounterRow.parentElement);
    expect(encounterHeader.parentElement!.classList.contains('osd-encounter-list')).toBeTrue();
  });

  test('shows the actual runtime pair and support state in both surfaces', () => {
    const supported = render(context());
    const popout = render({ ...context(), isPopout: true });
    expect(supported).toContain('Current runtime: Core 14.368 · dnd5e 5.3.3 · Supported pair');
    expect(popout).toContain('Current runtime: Core 14.368 · dnd5e 5.3.3 · Supported pair');
    const unsupported = render({ ...context(), supported: false, coreVersion: '14.369', system: { id: 'dnd5e', version: '6.0.6' }, supportError: 'Unsupported pair' });
    expect(unsupported).toContain('Core 14.369 · dnd5e 6.0.6 · Unsupported pair');
    expect(unsupported).toContain('Unsupported pair</div>');
  });

  test('puts existing availability reasons on every direct-edit input', () => {
    const value = context();
    value.party = [actorCard({ commands: { ...actorCard().commands, setHp: disabled('OSD.Errors.NativeApiUnavailable') } })];
    const html = render(value);
    const inputs = [...html.matchAll(/<input[^>]*data-osd-direct-command="[^"]+"[^>]*>/g)].map(([input]) => input);
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input).toContain('title="');
      expect(input).toContain('data-tooltip="');
    }
    const directLabels = [...html.matchAll(/<label[^>]*>[\s\S]*?<\/label>/g)].map(([label]) => label).filter((label) => label.includes('data-osd-direct-command='));
    expect(directLabels).toHaveLength(inputs.length);
    for (const label of directLabels) {
      expect(label.slice(0, label.indexOf('>'))).toContain('title="');
      expect(label.slice(0, label.indexOf('>'))).toContain('data-tooltip="');
    }
    expect(inputs.find((input) => input.includes('data-osd-direct-command="actor.set-hp"'))).toContain('title="The required dnd5e operation is unavailable for this Actor."');
  });
  test('keeps the localized help control in both shared panel and popout toolbars', () => {
    const panel = render(context());
    const popout = render({ ...context(), isPopout: true });
    expect(panel).toContain('data-osd-action="open-help"');
    expect(popout).toContain('data-osd-action="open-help"');
    expect(panel).toContain('>Help</button>');
    expect(popout).toContain('>Help</button>');
  });

  test('keeps full accessible names when the popout uses a short panel tab and icon-only close', () => {
    const document = new JSDOM(render({ ...context(), isPopout: true })).window.document;
    const panel = document.querySelector<HTMLButtonElement>('[data-osd-action="open-panel"]')!;
    const close = document.querySelector<HTMLButtonElement>('[data-osd-action="close-popout"]')!;
    expect(panel.textContent?.trim()).toBe('Panel');
    expect(panel.getAttribute('aria-label')).toBe(english['OSD.Actions.OpenPanel']!);
    expect(panel.title).toBe(english['OSD.Actions.OpenPanel']!);
    expect(close.textContent?.trim()).toBe('');
    expect(close.getAttribute('aria-label')).toBe(english['OSD.Actions.ClosePopout']!);
    expect(close.title).toBe(english['OSD.Actions.ClosePopout']!);
    expect(close.classList.contains('osd-popout-close')).toBeTrue();
    expect(close.querySelector('i')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('exposes a keyboard-accessible divider and labels stats when the party column narrows', () => {
    const html = render(context());
    expect(html).toMatch(/data-osd-column-resizer[^>]*role="separator"[^>]*tabindex="0"[^>]*aria-orientation="vertical"/);
    expect(html).toContain('aria-label="Party and encounter divider"');
    expect(html).toMatch(/data-osd-column-resizer data-keyboard-focus role="separator"/);
    expect(html).toContain('data-label="Base max"');
    expect(html).toContain('osd-sr-only osd-stat-label');
  });

  test('renders direct party controls and keeps the same party member compact in encounter', () => {
    const html = render(context());
    expect(html).toContain('Alice, Bob');
    expect(html).toContain('Remove inspiration');
    expect(html).toContain('data-osd-direct-command="actor.set-hp"');
    expect(html).toContain('data-osd-operation="actor.set-max-modifier"');expect(new JSDOM(html).window.document.querySelector('[data-osd-inspection] output[data-label="Modifier"]')?.textContent).toBe('+5');
    expect(html).toContain('class="osd-combatant-placeholder current"');
    expect(html).not.toContain('class="osd-npc-row current"');
  });

  test('renders unavailable operations disabled with localized reasons', () => {
    const html = render(context());
    const minus = new JSDOM(html).window.document.querySelector<HTMLButtonElement>('[data-delta="-1"]')!;
    expect(minus.disabled).toBeTrue();
    expect(minus.getAttribute('data-osd-operation')).toBe('actor.adjust-exhaustion');
    expect(html).toMatch(/data-osd-operation="actor.set-status" disabled/);
    const locate = new JSDOM(html).window.document.querySelector<HTMLButtonElement>('[data-osd-command="token.locate"]')!;expect(locate.disabled).toBeTrue();expect(locate.title).toBe('This token is not on the active scene.');
  });

  test('gives icon-only controls native and Foundry tooltip metadata', () => {
    const html = render(context());
    expect(html).toMatch(/data-osd-command="combat\.previous-turn"[^>]*title="Previous turn"[^>]*data-tooltip="OSD\.Actions\.PreviousTurn"/);
    expect(html).toMatch(/data-osd-command="combat\.next-turn"[^>]*title="Next turn"[^>]*data-tooltip="OSD\.Actions\.NextTurn"/);
    expect(html).toMatch(/data-osd-command="actor\.open-sheet"[^>]*title="Open sheet"[^>]*data-tooltip="OSD\.Actions\.OpenSheet"/);
  });

  test('keeps NPC and character rows compact with shared access to every operation category', () => {
    const value=context();value.encounter.combatants=[actorCard({uuid:'Actor.npc',name:'Goblin',type:'npc',partyMember:false,characterControls:false,combatantId:'npc-turn'}),actorCard({uuid:'Actor.guest',name:'Guest',combatantId:'guest-turn',partyMember:false})];
    const document=new JSDOM(render(value)).window.document;
    for(const id of ['npc-turn','guest-turn']) {const row=document.querySelector(`[data-osd-combatant-row="${id}"]`)!;expect(row.querySelector('[data-osd-select-target]')).not.toBeNull();expect(row.querySelector('[data-osd-inspection]')).not.toBeNull();expect(row.querySelector('[data-actor-card]')).toBeNull();expect(row.querySelector('[data-osd-operation]')).toBeNull();}
    for(const operation of ['actor.set-ac-modifier','actor.toggle-concentration','actor.toggle-inspiration','actor.adjust-exhaustion'])expect(document.querySelector(`[data-osd-operations] [data-osd-operation="${operation}"]`)).not.toBeNull();
  });

  test('keeps a party NPC resource summary without pretending it has heroic inspiration', () => {
    const value=context();value.party=[actorCard({type:'npc',characterControls:false,exhaustionControls:true})];const document=new JSDOM(render(value)).window.document,row=document.querySelector('[data-osd-party-row]')!;
    expect(row.querySelector('[data-osd-inspiration]')).toBeNull();expect(row.querySelector('[data-osd-exhaustion]')).not.toBeNull();expect(document.querySelector('[data-osd-operation="actor.adjust-exhaustion"][data-delta="1"]')).not.toBeNull();
  });

  test('places all five categories in one shared dock collapsed until targets are selected', () => {
    const document=new JSDOM(render(context())).window.document,dock=document.querySelector<HTMLElement>('[data-osd-operations]')!;
    expect(dock.hidden).toBeTrue();expect(dock.querySelectorAll('.osd-operation-group')).toHaveLength(5);expect(document.querySelector('[data-osd-layer="batch"]')).toBeNull();
    for(const command of ['actor.damage','actor.heal','actor.set-temp-hp','actor.set-status','actor.toggle-inspiration','actor.adjust-exhaustion','actor.toggle-concentration','actor.set-ac-modifier','actor.set-max-modifier','actor.set-hp','actor.set-death-save','combat.toggle-visibility','combat.toggle-defeated'])expect(dock.querySelector(`[data-osd-operation="${command}"]`)).not.toBeNull();
    expect(dock.querySelector('summary [data-osd-applicable-count="actor.toggle-inspiration"]')).not.toBeNull();expect(dock.querySelector('h3 [data-osd-applicable-count="combat.toggle-visibility"]')).not.toBeNull();
    expect(dock.querySelector('[data-osd-selected-tags]')).not.toBeNull();expect(dock.querySelector('[data-osd-selection-overflow]')).not.toBeNull();expect(document.querySelector('[data-osd-scope="party"]')).not.toBeNull();expect(document.querySelector('[data-osd-scope="encounter"]')).not.toBeNull();
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

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { INJURY_STATUS_ID, MODULE_ID } from '../src/constants.ts';
import { decorateInjuryTokenActionHud, decorateInjuryTokenHud, injuryBaseIcon, injuryIcon, nextInjuryStacks, projectInjuryStatus, registerInjuryStatus, statusPresentation } from '../src/projection.ts';
import { createActorModuleState } from '../src/state.ts';

const previous = new Map<string, unknown>();

beforeEach(() => {
  for (const key of ['game', 'CONFIG', 'CONST']) previous.set(key, (globalThis as any)[key]);
  (globalThis as any).game = {
    user: { isGM: true },
    i18n: {
      localize: (key: string) => key === 'DND5E.Rule.Type.Condition' ? '状态'
        : key.endsWith('.Description') ? '角色的生命值首次从正数降至 0 时开启伤势。' : '伤势',
      format: (_key: string, values: Record<string, number>) => `伤势 ${values.stacks}/${values.max}`,
    },
  };
  (globalThis as any).CONFIG = { statusEffects: [] };
  (globalThis as any).CONST = { ACTIVE_EFFECT_SHOW_ICON: { ALWAYS: 2 } };
});

afterEach(() => {
  for (const [key, value] of previous) (globalThis as any)[key] = value;
  previous.clear();
});

describe('injury status projection', () => {
  test('registers again after dnd5e replaces the status array without duplicating entries', () => {
    registerInjuryStatus();
    registerInjuryStatus();
    expect((globalThis as any).CONFIG.statusEffects).toHaveLength(1);
    expect((globalThis as any).CONFIG.statusEffects[0]).toMatchObject({ id: INJURY_STATUS_ID, hud: true, img: injuryBaseIcon() });
    (globalThis as any).CONFIG.statusEffects = [];
    registerInjuryStatus();
    expect((globalThis as any).CONFIG.statusEffects).toHaveLength(1);
  });

  test('uses distinct level icons and clamps left/right HUD changes to zero through three', () => {
    expect(injuryBaseIcon()).toEndWith('injury.svg');
    expect(injuryIcon(1)).toEndWith('injury-1.svg');
    expect(injuryIcon(2)).toEndWith('injury-2.svg');
    expect(injuryIcon(3)).toEndWith('injury-3.svg');
    expect(injuryIcon(4)).toEndWith('injury-3.svg');
    expect(nextInjuryStacks(0, 0)).toBe(1);
    expect(nextInjuryStacks(2, 0)).toBe(3);
    expect(nextInjuryStacks(3, 0)).toBe(3);
    expect(nextInjuryStacks(3, 2)).toBe(2);
    expect(nextInjuryStacks(0, 2)).toBe(0);
  });

  test('creates one always-visible Active Effect using the normalized icon and mirrored stack', async () => {
    const created: any[] = [];
    const actor = {
      effects: [],
      async createEmbeddedDocuments(_type: string, entries: any[]) { created.push(...entries); },
      async updateEmbeddedDocuments() {},
      async deleteEmbeddedDocuments() {},
    };
    await projectInjuryStatus(actor, 4);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      img: injuryIcon(3),
      statuses: [INJURY_STATUS_ID],
      showIcon: 2,
      flags: { [MODULE_ID]: { injuryProjection: true, stacks: 3 } },
    });
  });

  test('updates one owned projection and deletes duplicate injury effects', async () => {
    const updated: any[] = [];
    const deleted: string[][] = [];
    const effect = (id: string) => ({ id, statuses: new Set([INJURY_STATUS_ID]), flags: {} });
    const actor = {
      effects: [effect('first'), effect('duplicate')],
      async createEmbeddedDocuments() {},
      async updateEmbeddedDocuments(_type: string, entries: any[]) { updated.push(...entries); },
      async deleteEmbeddedDocuments(_type: string, ids: string[]) { deleted.push(ids); },
    };
    await projectInjuryStatus(actor, 2);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ _id: 'first', img: injuryIcon(2), showIcon: 2 });
    expect(deleted).toEqual([['duplicate']]);
  });

  test('decorates the Token HUD with the current stack icon, tooltip, and active state', () => {
    const state = createActorModuleState();
    state.injury.stacks = 2;
    const attributes: Record<string, string> = {};
    let active = false;
    const element = {
      dataset: {} as Record<string, string>,
      style: { objectPosition: 'old', background: 'old' },
      setAttribute: (key: string, value: string) => { attributes[key] = value; },
      classList: { toggle: (_name: string, value: boolean) => { active = value; } },
    };
    decorateInjuryTokenHud(
      { object: { actor: { flags: { [MODULE_ID]: state } } } },
      { querySelector: () => element },
    );
    expect(attributes.src).toBe(injuryIcon(2));
    expect(element.dataset.tooltipText).toContain('伤势 2/3');
    expect(element.dataset.tooltipText).toContain('伤势');
    expect(attributes.title).toContain('伤势');
    expect(element.style).toEqual({ objectPosition: '', background: '' });
    expect(active).toBe(true);
  });

  test('registers an already-localized name and complete rule description for public HUD consumers', () => {
    const presentation = statusPresentation();
    registerInjuryStatus();
    expect(presentation).toEqual({
      id: INJURY_STATUS_ID,
      name: '伤势',
      description: expect.stringContaining('首次从正数降至 0'),
      img: injuryBaseIcon(),
    });
    expect((globalThis as any).CONFIG.statusEffects[0]).toMatchObject({
      id: INJURY_STATUS_ID,
      name: '伤势',
      label: '伤势',
      description: presentation.description,
    });
  });

  test('presents the Chinese injury trigger and recovery rule without the internal episode term', async () => {
    const locale = JSON.parse(await readFile(new URL('../src/lang/zh-CN.json', import.meta.url), 'utf8')) as Record<string, string>;
    (globalThis as any).game.i18n.localize = (key: string) => locale[key] ?? key;
    const action: any = { system: { actionType: 'condition', actionId: INJURY_STATUS_ID }, info1: {} };

    decorateInjuryTokenActionHud({ actions: [action] }, { actor: actorWithStacks(1), tooltipsSetting: 'full' });

    expect(action.tooltip.content.match(/<p>/g)).toHaveLength(4);
    expect(action.tooltip.content).toContain('首次从正数降至 0 时，开启一次伤势过程');
    expect(action.tooltip.content).toContain('恢复到正生命值会增加 1 层伤势');
    expect(action.tooltip.content).toContain('</p><p>伤势层数为 0 到 3 层');
    expect(action.tooltip.content).not.toMatch(/episode/i);
  });

  test('preserves the English rule groups as separate paragraphs', async () => {
    const locale = JSON.parse(await readFile(new URL('../src/lang/en.json', import.meta.url), 'utf8')) as Record<string, string>;
    (globalThis as any).game.i18n.localize = (key: string) => locale[key] ?? key;
    const action: any = { system: { actionType: 'condition', actionId: INJURY_STATUS_ID }, info1: {} };

    decorateInjuryTokenActionHud({ actions: [action] }, { actor: actorWithStacks(1), tooltipsSetting: 'full' });

    expect(action.tooltip.content.match(/<p>/g)).toHaveLength(4);
    expect(action.tooltip.content).toContain('</p><p>Injury stacks range from 0 to 3');
    expect(action.tooltip.content).toContain('</p><p>A retained natural 19 or 20');
  });

  test('decorates only the injury Token Action HUD condition and respects none/nameOnly/full tooltip modes', () => {
    const action: any = {
      id: INJURY_STATUS_ID,
      name: '伤势',
      tooltip: '伤势',
      info1: { text: '', title: 'stack count', class: '', icon: '' },
      system: { actionType: 'condition', actionId: INJURY_STATUS_ID },
    };
    const other: any = { id: INJURY_STATUS_ID, name: 'unrelated', tooltip: 'unrelated', system: { actionType: 'item', actionId: INJURY_STATUS_ID } };
    const actor = actorWithStacks(2);
    (globalThis as any).game.settings = { get: () => 'nameOnly' };
    const hud = { groups: { lists: [{ actions: [action, other] }] } };
    decorateInjuryTokenActionHud(hud, { actor });
    expect(action.name).toBe('伤势');
    expect(action.tooltip).toEqual({ content: '伤势' });
    expect(action.info1).toMatchObject({ text: '', title: '', icon: '<span class="ifs-injury-stack-badge" aria-hidden="true">2/3</span>' });
    expect((action.info1.title || action.info1.text)).toBe('');
    expect(other).toEqual({ id: INJURY_STATUS_ID, name: 'unrelated', tooltip: 'unrelated', system: { actionType: 'item', actionId: INJURY_STATUS_ID } });

    (globalThis as any).game.settings = { get: () => 'full' };
    decorateInjuryTokenActionHud(hud, { actor });
    expect(action.tooltip).toMatchObject({ class: 'dnd5e2 dnd5e-tooltip rule-tooltip ifs-injury-rule-tooltip' });
    expect(action.tooltip.content).toBe('<section class="content"><section class="header"><h2>伤势</h2><ul class="pills"><li class="pill condition">状态</li></ul></section><section class="description"><p>角色的生命值首次从正数降至 0 时开启伤势。</p></section></section>');
    expect(action.tooltip.content).not.toContain('<img');
    expect(action.info1.icon).toContain('2/3');

    (globalThis as any).game.settings = { get: () => 'none' };
    decorateInjuryTokenActionHud(hud, { actor });
    expect(action.tooltip).toBe('');
    expect(action.info1.icon).toContain('2/3');
    expect(action.info1.title).toBe('');
    expect(action.info1.text).toBe('');
  });

  test('escapes localized rule-card text and falls back to the condition category', () => {
    (globalThis as any).game.i18n.localize = (key: string) => ({
      'IFS.Status.Injury.Name': '<伤势 & "test">',
      'IFS.Status.Injury.Description': '失去 <b>生命值</b> & 恢复\n\n额外 <script>危险</script>',
    } as Record<string, string>)[key] ?? key;
    const action: any = { system: { actionType: 'condition', actionId: INJURY_STATUS_ID }, info1: {} };
    decorateInjuryTokenActionHud({ actions: [action] }, { actor: actorWithStacks(1), tooltipsSetting: 'full' });

    expect(action.tooltip.content).toContain('<h2>&lt;伤势 &amp; &quot;test&quot;&gt;</h2>');
    expect(action.tooltip.content).toContain('<li class="pill condition">Condition</li>');
    expect(action.tooltip.content).toContain('<p>失去 &lt;b&gt;生命值&lt;/b&gt; &amp; 恢复</p>');
    expect(action.tooltip.content).toContain('<p>额外 &lt;script&gt;危险&lt;/script&gt;</p>');
    expect(action.tooltip.content.match(/<p>/g)).toHaveLength(2);
    expect(action.tooltip.content).not.toContain('<b>生命值</b>');
    expect(action.tooltip.content).not.toContain('<script>');
    expect(action.info1.icon).toContain('1/3');
  });

  test('shows every canonical injury stack value through the info1 icon without a badge tooltip', () => {
    for (const stacks of [0, 1, 2, 3]) {
      const action: any = {
        system: { actionType: 'condition', actionId: INJURY_STATUS_ID },
        info1: { text: 'stale', title: 'count', class: 'existing-class', icon: 'existing-icon' },
      };
      const hud = { groups: [{ actions: [action] }] };

      decorateInjuryTokenActionHud(hud, { actor: actorWithStacks(stacks) });

      expect(action.info1).toEqual({
        text: '',
        title: '',
        class: 'existing-class',
        icon: `<span class="ifs-injury-stack-badge" aria-hidden="true">${stacks}/3</span>`,
      });
      // Re-rendering keeps the badge markup stable.
      decorateInjuryTokenActionHud(hud, { actor: actorWithStacks(stacks) });
      expect(action.info1.icon).toBe(`<span class="ifs-injury-stack-badge" aria-hidden="true">${stacks}/3</span>`);
    }
  });

  test('uses the unlinked token Actor flags instead of a base Actor with a different count', () => {
    const baseActor = actorWithStacks(1);
    const tokenActor = actorWithStacks(3);
    let worldActorLookups = 0;
    (globalThis as any).game.actors = { get: () => { worldActorLookups += 1; return baseActor; } };
    const action: any = { system: { actionType: 'condition', actionId: INJURY_STATUS_ID }, info1: {} };

    decorateInjuryTokenActionHud(
      { groups: [{ actions: [action] }] },
      { actor: baseActor, token: { actor: tokenActor, actorId: 'base-actor-id' } },
    );

    expect(action.info1.icon).toContain('3/3');
    expect(worldActorLookups).toBe(0);
  });

  test('reads the linked token Actor and suppresses the numeric badge for multi-select', () => {
    const linkedActor = actorWithStacks(1);
    const linkedAction: any = { system: { actionType: 'condition', actionId: INJURY_STATUS_ID }, info1: {} };
    decorateInjuryTokenActionHud(
      { groups: [{ actions: [linkedAction] }] },
      { actor: linkedActor, token: { actor: linkedActor } },
    );
    expect(linkedAction.info1.icon).toContain('1/3');

    const baseActor = actorWithStacks(2);
    const multiSelectAction: any = {
      system: { actionType: 'condition', actionId: INJURY_STATUS_ID },
      tooltip: 'unchanged tooltip',
      info1: { text: 'stale count', title: 'count', class: '', icon: '' },
    };
    (globalThis as any).game.actors = { get: () => baseActor };
    (globalThis as any).game.settings = { get: () => 'none' };
    decorateInjuryTokenActionHud(
      { groups: [{ actions: [multiSelectAction] }] },
      { actor: null, token: null },
    );
    expect(multiSelectAction.info1).toMatchObject({ text: '', title: '', icon: '' });
    expect(multiSelectAction.tooltip).toBe('');
  });

});

function actorWithStacks(stacks: number): any {
  const state = createActorModuleState();
  state.injury.stacks = stacks;
  return { flags: { [MODULE_ID]: state } };
}

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { INJURY_STATUS_ID, MODULE_ID } from '../src/constants.ts';
import { decorateInjuryTokenHud, injuryBaseIcon, injuryIcon, nextInjuryStacks, projectInjuryStatus, registerInjuryStatus } from '../src/projection.ts';
import { createActorModuleState } from '../src/state.ts';

const previous = new Map<string, unknown>();

beforeEach(() => {
  for (const key of ['game', 'CONFIG', 'CONST']) previous.set(key, (globalThis as any)[key]);
  (globalThis as any).game = {
    user: { isGM: true },
    i18n: {
      localize: () => '伤势',
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
    expect(element.dataset.tooltipText).toBe('伤势 2/3');
    expect(element.style).toEqual({ objectPosition: '', background: '' });
    expect(active).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { isDeepStrictEqual } from 'node:util';
import nativeFixture from './fixtures/potion-native-606.json';
import { configurePotion } from '../src/runtime';
import { FLAG, MODULE_ID } from '../src/constants';

type AnyRecord = Record<string, any>;
const globals = globalThis as AnyRecord;
const previous = new Map<string, unknown>();
const nativeActivities = nativeFixture.activities as AnyRecord;
const clone = <T>(value: T): T => structuredClone(value);
let constructorCalls: Array<{ source: AnyRecord; parent: unknown }>;

beforeEach(() => {
  for (const key of ['game', 'foundry', 'CONFIG']) previous.set(key, globals[key]);
  const gm = { id: 'gm', active: true, isGM: true };
  globals.game = { version: '14.368', system: { id: 'dnd5e', version: '6.0.6' }, user: gm, users: [gm],
    settings: { get: () => true }, i18n: { localize: (key: string) => ({
      'FVTT_HOUSE_RULES.Potion.Quick': nativeActivities.hrPotionQuick.name,
      'FVTT_HOUSE_RULES.Potion.Max': nativeActivities.hrPotionMax.name,
      'FVTT_HOUSE_RULES.Potion.Feed': nativeActivities.hrPotionFeed.name,
    }[key] ?? key) } };
  globals.foundry = { utils: { equals: isDeepStrictEqual },
    data: { operators: { ForcedReplacement: { create: (value: unknown) => ({ __forcedReplacement: value }) } } } };
  constructorCalls = [];
  // A narrow seam based on the actual registered HealActivity output captured
  // from Next. The constructor is not a fake version of the potion matcher.
  globals.CONFIG = { DND5E: { activityTypes: { heal: { documentClass: class {
    source: AnyRecord;
    constructor(source: AnyRecord, options: { parent: unknown }) {
      constructorCalls.push({ source: clone(source), parent: options.parent });
      const native = Object.values(nativeActivities).find((row) => row._id === source._id);
      if (!native) throw Error('Unknown source Activity ID');
      this.source = clone(native);
    }
    toObject() { return clone(this.source); }
  } } } } };
});
afterEach(() => { for (const [key, value] of previous) globals[key] = value; previous.clear(); });

function potion() {
  const writes: AnyRecord[] = [], flagWrites: unknown[] = [];
  const item: AnyRecord = { type: 'consumable', uuid: 'Actor.owned.Item.potion', isOwner: true,
    flags: { [MODULE_ID]: { [FLAG.potion]: { healing: true, dice: { number: 2, denomination: 4, bonus: '2' } } } },
    activities: {},
    getFlag: (_scope: string, key: string) => item.flags[MODULE_ID][key],
    async setFlag(_scope: string, key: string, value: unknown) { flagWrites.push(value); item.flags[MODULE_ID][key] = JSON.parse(JSON.stringify(value)); },
    async unsetFlag(_scope: string, key: string) { delete item.flags[MODULE_ID][key]; },
    toObject: () => ({ system: { activities: clone(item.activities) } }),
    async update(change: AnyRecord) {
      writes.push(change);
      if (change['system.activities']?.__forcedReplacement) item.activities = clone(change['system.activities'].__forcedReplacement);
      else item.activities = clone(nativeActivities);
      return item;
    } };
  return { item, writes, flagWrites };
}

describe('potion native normalization', () => {
  test('accepts the retained 6.0.6 native/Midi Activity source and stores its full schema2 snapshot', async () => {
    const { item, writes } = potion();
    expect(await configurePotion(item, 'apply')).toMatchObject({ applied: true });
    expect(constructorCalls).toHaveLength(3);
    expect(constructorCalls.every((call) => call.parent === item)).toBeTrue();
    expect(item.flags[MODULE_ID][FLAG.potionSnapshot]).toEqual({ schema: 2, activities: {}, appliedActivities: nativeActivities });
    expect(writes).toHaveLength(1);
    expect(await configurePotion(item, 'restore')).toEqual({ restored: true });
    expect(item.activities).toEqual({});
    expect(item.getFlag(MODULE_ID, FLAG.potionSnapshot)).toBeUndefined();
  });
  test('fails closed before any snapshot or Item update when the registered Activity model is missing', async () => {
    const { item, writes, flagWrites } = potion();
    globals.CONFIG.DND5E.activityTypes.heal = undefined;
    expect(await configurePotion(item, 'apply')).toBeNull();
    expect(writes).toHaveLength(0); expect(flagWrites).toHaveLength(0);
  });
  test('fails closed before persistence when the registered model rejects the planned source', async () => {
    const { item, writes, flagWrites } = potion();
    globals.CONFIG.DND5E.activityTypes.heal.documentClass = class { constructor() { throw Error('Schema validation failed'); } };
    expect(await configurePotion(item, 'apply')).toBeNull();
    expect(writes).toHaveLength(0); expect(flagWrites).toHaveLength(0);
  });
  test('still refuses a real healing edit made while the native update is awaited', async () => {
    const { item } = potion(), update = item.update;
    item.update = async (change: AnyRecord) => { const result = await update(change);
      item.activities.hrPotionQuick.healing.bonus = '999'; return result; };
    expect(await configurePotion(item, 'apply')).toBeNull();
    expect(item.activities.hrPotionQuick.healing.bonus).toBe('999');
    expect(item.getFlag(MODULE_ID, FLAG.potionSnapshot)).toEqual({ schema: 1, activities: {} });
  });
  test('preserves full-source restore protection for a later Midi-field edit', async () => {
    const { item } = potion();
    expect(await configurePotion(item, 'apply')).toMatchObject({ applied: true });
    item.activities.hrPotionFeed.midiProperties.forceConsumeDialog = 'always';
    expect(await configurePotion(item, 'restore')).toBeNull();
    expect(item.activities.hrPotionFeed.midiProperties.forceConsumeDialog).toBe('always');
    expect(item.getFlag(MODULE_ID, FLAG.potionSnapshot).schema).toBe(2);
  });
});

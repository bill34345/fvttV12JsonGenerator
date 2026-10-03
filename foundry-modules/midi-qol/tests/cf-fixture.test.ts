import { describe, expect, test } from 'bun:test';
import { CF_ACTIVITY_ID, makeCfItemData, assertCfActivity } from '../cf-fixture.mjs';

describe('C/F fixture must reach ordinary template cleanup', () => {
  test('prepared Item and effective Activity agree on duration, geometry, and creature targets', () => {
    const item = makeCfItemData();
    const activity = item.system.activities[CF_ACTIVITY_ID];
    expect(assertCfActivity(activity)).toBe(true);
    expect(item.system.duration).toEqual({ value: '1', units: 'minute' });
    expect(item.system.target.template).toEqual(activity.target.template);
    expect(item.system.target.affects).toEqual(activity.target.affects);
    expect(item.system.properties).not.toContain('concentration');
    expect(activity.effects).toEqual([]);
    expect(activity.consumption.spellSlot).toBe(false);
  });

  for (const [label, mutate] of [
    ['instantaneous duration', (a: any) => { a.duration.units = 'inst'; }],
    ['inherited duration', (a: any) => { a.duration.override = false; }],
    ['concentration bypass', (a: any) => { a.duration.concentration = true; }],
    ['no template prompt', (a: any) => { a.target.prompt = false; }],
    ['Self instead of creature', (a: any) => { a.target.affects.type = 'self'; }],
    ['wrong template', (a: any) => { a.target.template.type = 'cone'; }],
    ['wrong radius', (a: any) => { a.target.template.size = '5'; }],
  ] as const) {
    test(`rejects ${label} before activity.use`, () => {
      const activity = makeCfItemData().system.activities[CF_ACTIVITY_ID];
      mutate(activity);
      expect(() => assertCfActivity(activity)).toThrow('C/F PRECHECK FAILED');
    });
  }
});

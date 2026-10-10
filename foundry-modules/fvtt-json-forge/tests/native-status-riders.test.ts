import { expect, test } from 'bun:test';
import { ensureNativeStatusRiders } from '../src/nativeStatusRiders';

test('an immune independent rider may be absent after native/DAE processing without invalidating the primary', async () => {
  for (const value of [['prone'], new Set(['prone'])]) {
    let nativeCalls = 0;
    const events: any[] = [];
    await expect(ensureNativeStatusRiders({
      actor: { uuid: 'Actor.target', system: { traits: { ci: { value } } }, effects: { contents: [] } },
      primary: { active: true, async createRiderConditions() { nativeCalls++; } }, status: 'unconscious',
      configurationFor: id => id === 'unconscious' ? { riders: ['prone'] } : { _id: 'canonical-prone' },
      dae: { active: true, version: '14.0.12' }, assertLive() {}, record: (type, detail) => events.push({ type, ...detail }),
    })).resolves.toBeUndefined();
    expect(nativeCalls).toBe(0);
    expect(events).toEqual([{ type: 'status-lifecycle-rider-immune', status: 'unconscious', rider: 'prone', actorUuid: 'Actor.target' }]);
  }
});

test('immunity to a different condition cannot hide a missing required independent rider', async () => {
  await expect(ensureNativeStatusRiders({
    actor: { system: { traits: { ci: { value: new Set(['restrained']) } } }, effects: { contents: [] } },
    primary: { active: true, async createRiderConditions() {} }, status: 'unconscious',
    configurationFor: id => id === 'unconscious' ? { riders: ['prone'] } : { _id: 'canonical-prone' },
    dae: { active: true, version: '14.0.12' }, assertLive() {}, record() {},
  })).rejects.toThrow('未就绪');
});

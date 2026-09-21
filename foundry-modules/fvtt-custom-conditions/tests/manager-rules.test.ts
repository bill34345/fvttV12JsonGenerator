import { describe, expect, test } from 'bun:test';
import { createConditionManagerApplicationClass } from '../src/manager.ts';

function setup() {
  const actor = { uuid: 'Actor.frozen', name: 'Frozen target' };
  const helper = { uuid: 'Actor.helper' };
  const calls: any[] = [];
  const errors: string[] = [];
  const api: any = {
    list: () => [{ id: 'ice', disabled: false, instance: { conditionId: 'frozen', params: { escapeDC: 15 } } }],
    escapeFrozen: async (...args: any[]) => { calls.push(args); },
  };
  const globals: any = {
    foundry: { applications: { api: { ApplicationV2: class { async render() {} } } } },
    game: { user: { targets: new Set([{ actor }]) } },
    canvas: { tokens: { controlled: [] } },
    ui: { notifications: { error: (message: string) => errors.push(message) } },
  };
  const Application = createConditionManagerApplicationClass(api, globals);
  const manager = new Application();
  const button = { dataset: { actorUuid: actor.uuid, effectId: 'ice' } };
  return { actor, helper, calls, errors, globals, Application, manager, button };
}

describe('Condition manager rule controls', () => {
  test('uses highest bleeding defaults and exposes escape only on active Frozen', async () => {
    const { manager } = setup();
    expect(JSON.parse(manager.paramsJson)).toMatchObject({ stacking: 'highest', timing: 'turnEnd' });
    const context = await manager._prepareContext();
    expect(context.actors[0].conditions[0].canEscapeFrozen).toBe(true);
  });

  test('routes self escape and one controlled helper to the Frozen public API', async () => {
    const { actor, helper, calls, globals, Application, manager, button } = setup();
    await Application.escapeFrozen.call(manager, undefined, button);
    globals.canvas.tokens.controlled = [{ actor: helper }, { actor: helper }];
    await Application.escapeFrozen.call(manager, undefined, button);
    expect(calls).toEqual([[actor, 'ice', actor], [actor, 'ice', helper]]);
  });

  test('does not silently choose among multiple helpers or launch duplicate rolls', async () => {
    const { helper, calls, errors, globals, Application, manager, button } = setup();
    globals.canvas.tokens.controlled = [{ actor: helper }, { actor: { uuid: 'Actor.other' } }];
    await Application.escapeFrozen.call(manager, undefined, button);
    expect(calls).toHaveLength(0);
    expect(errors).toHaveLength(1);
    manager.escaping = true;
    await Application.escapeFrozen.call(manager, undefined, button);
    expect(calls).toHaveLength(0);
  });
});

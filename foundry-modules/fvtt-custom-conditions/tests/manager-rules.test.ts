import { describe, expect, test } from 'bun:test';
import { createConditionManagerApplicationClass } from '../src/manager.ts';
import { ConditionRuntime } from '../src/runtime.ts';

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
  test.each([
    ['14.364', '5.3.3', 'dnd5e', true],
    ['14.368', '6.0.5', 'dnd5e', true],
    ['14.368', '6.0.6', 'dnd5e', false],
    ['14.367', '6.0.5', 'dnd5e', false],
    ['14.368', '5.3.3', 'dnd5e', true],
    ['14.364', '5.3.3', 'pf2e', false],
  ])('manager render and submit share the actual supported pair %s/%s/%s', async (core, system, systemId, available) => {
    const target = { uuid: 'Actor.manager-pinned', documentName: 'Actor', name: 'Pinned actor', effects: [] };
    const foreign = { uuid: 'Actor.manager-foreign', documentName: 'Actor', name: 'Foreign target' };
    const calls: any[] = [];
    const globals: any = {
      foundry: { applications: { api: { ApplicationV2: class { async render() {} } } } },
      game: { version: core, system: { id: systemId, version: system }, user: { targets: new Set([{ actor: foreign }]) } },
      canvas: { tokens: { controlled: [] } },
    };
    const api: any = { list: () => [], apply: async (...args: any[]) => calls.push(args) };
    const Application = createConditionManagerApplicationClass(api, globals);
    const manager = new Application({ context: { actor: target, conditionId: 'jinxed' } });
    const context = await manager._prepareContext();
    expect(context.genericAvailable).toBe(available);
    expect(context.conditionId).toBe('jinxed');
    expect(context.actors.map((actor: any) => actor.uuid)).toEqual([target.uuid]);
    await Application.onSubmit.call(manager, undefined, undefined, {
      object: { conditionId: 'jinxed', paramsJson: '{"formula":"1d6"}' },
    });
    if (available) {
      expect(calls).toHaveLength(1);
      expect(calls[0]?.slice(0, 3)).toEqual([target, 'jinxed', { formula: '1d6' }]);
    } else expect(calls).toEqual([]);
    expect(foreign).not.toHaveProperty('effects');
  });


  test('HUD shortcuts for every parameterized condition leave its required inputs invalid until submitted', async () => {
    const target: any = { uuid: 'Actor.hud-param', documentName: 'Actor', effects: [] };
    const unrelated: any = { uuid: 'Actor.other', documentName: 'Actor' };
    const errors: string[] = [];
    const globals: any = {
      foundry: { applications: { api: { ApplicationV2: class { async render() {} } } } },
      game: { user: { targets: new Set([{ actor: unrelated }]) } },
      canvas: { tokens: { controlled: [] } },
      ui: { notifications: { error: (message: string) => errors.push(message) } },
    };
    const api: any = { list: () => [], apply: async () => { throw new Error('Invalid HUD draft was applied'); } };
    const Application = createConditionManagerApplicationClass(api, globals);
    for (const conditionId of ['bleeding', 'burning', 'frozen', 'jinxed', 'valor'] as const) {
      const manager = new Application({ context: { actor: target, conditionId } });
      const params = JSON.parse(manager.paramsJson);
      expect(manager.actors).toEqual([target]);
      expect((await manager._prepareContext()).conditionId).toBe(conditionId);
      if (conditionId === 'frozen') expect(params.escapeDC).toBe('');
      else expect(params.formula).toBe('');
      if (conditionId === 'burning') expect(params.damageType).toBe('');
      await Application.onSubmit.call(manager, undefined, undefined, { object: { conditionId, paramsJson: manager.paramsJson } });
    }
    expect(errors).toHaveLength(5);
    expect(target.effects).toEqual([]);
    expect(unrelated).not.toHaveProperty('effects');
  });

  test('HUD Burning context pins one Actor, preselects blank required fields, and never applies invalid parameters', async () => {
    const target: any = {
      uuid: 'Actor.hud-burning', documentName: 'Actor', name: 'HUD target', effects: [],
      async createEmbeddedDocuments(_type: string, data: any[]) {
        const created = data.map((entry) => ({ ...entry, id: 'created-burning', parent: this }));
        this.effects.push(...created);
        return created;
      },
    };
    const unrelated = { uuid: 'Actor.unrelated', documentName: 'Actor', name: 'Other target' };
    const errors: string[] = [];
    const globals: any = {
      foundry: { applications: { api: { ApplicationV2: class { async render() {} } } } },
      game: { user: { isGM: true, active: true, targets: new Set([{ actor: unrelated }]) }, users: { activeGM: null } },
      canvas: { tokens: { controlled: [] } },
      ui: { notifications: { error: (message: string) => errors.push(message) } },
    };
    globals.game.users.activeGM = globals.game.user;
    const runtime = new ConditionRuntime(globals, () => true);
    const api: any = {
      list: (actor: any) => runtime.list(actor),
      apply: (actor: any, conditionId: any, params: any) => runtime.apply(actor, conditionId, params),
    };
    const Application = createConditionManagerApplicationClass(api, globals);
    expect(() => new Application({ context: { actor: unrelated as any, conditionId: 'burning' } })).not.toThrow();
    expect(() => new Application({ context: { actor: {}, conditionId: 'burning' } })).toThrow('requires one Actor');
    const manager = new Application({ context: { actor: target, conditionId: 'burning' } });
    expect(manager.actors).toEqual([target]);
    expect((await manager._prepareContext()).conditionId).toBe('burning');
    expect(JSON.parse(manager.paramsJson)).toMatchObject({ formula: '', damageType: '' });
    await Application.refresh.call(manager);
    expect(manager.actors).toEqual([target]);

    for (const params of [{}, { formula: '', damageType: '' }, { formula: '1d6', damageType: '' }]) {
      await Application.onSubmit.call(manager, undefined, undefined, {
        object: { conditionId: 'burning', paramsJson: JSON.stringify(params) },
      });
      expect(target.effects).toHaveLength(0);
    }
    expect(errors).toHaveLength(3);
    await Application.onSubmit.call(manager, undefined, undefined, {
      object: { conditionId: 'burning', paramsJson: JSON.stringify({ formula: '1d6', damageType: 'fire' }) },
    });
    expect(target.effects).toHaveLength(1);
    expect(target.effects[0].flags['fvtt-custom-conditions'].condition).toMatchObject({
      conditionId: 'burning', params: { formula: '1d6', damageType: 'fire' },
    });
    expect(unrelated).not.toHaveProperty('effects');
  });

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

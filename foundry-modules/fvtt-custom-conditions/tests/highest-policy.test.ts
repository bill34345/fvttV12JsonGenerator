import { describe, expect, test } from 'bun:test';
import { createConditionInstance, buildConditionFlag } from '@fvtt-json-generator/contracts/conditions';
import { ConditionRuntime } from '../src/runtime.ts';

function fixture() {
  let sequence = 0;
  const actor: any = {
    id: 'target', uuid: 'Actor.target', documentName: 'Actor', name: 'Target',
    effects: [], flags: {}, system: { attributes: { hp: { value: 20 } } },
    async createEmbeddedDocuments(_type: string, data: any[]) {
      const created = data.map((entry) => ({ ...structuredClone(entry), id: `effect${++sequence}`, parent: actor }));
      actor.effects.push(...created);
      return created;
    },
    async updateEmbeddedDocuments(_type: string, updates: any[]) {
      for (const update of updates) {
        const effect = actor.effects.find((entry: any) => entry.id === update._id);
        if (effect) assign(effect, update);
      }
      return actor.effects;
    },
    async deleteEmbeddedDocuments(_type: string, ids: string[]) {
      actor.effects = actor.effects.filter((entry: any) => !ids.includes(entry.id));
      return [];
    },
    async update(update: any) { assign(actor, update); return actor; },
  };
  const rolled: string[] = [];
  const runtime = new ConditionRuntime({
    game: { user: { id: 'gm', isGM: true } },
    Roll: class {
      total: number;
      constructor(formula: string) { rolled.push(formula); this.total = formula === '2d6' ? 7 : 3; }
      async evaluate() { return this; }
    },
  }, () => true);
  return { actor, runtime, rolled };
}

function assign(target: any, changes: any) {
  for (const [path, value] of Object.entries(changes)) {
    const segments = path.split('.');
    let current = target;
    for (const segment of segments.slice(0, -1)) current = current[segment] ??= {};
    current[segments.at(-1)!] = structuredClone(value);
  }
}

describe('highest-only condition rules', () => {
  test('Bleeding chooses strength globally, preserves ties, and ignores legacy stack requests', async () => {
    const { actor, runtime } = fixture();
    const first = await runtime.apply(actor, 'bleeding', { formula: '1d6', stacking: 'stack' }, { origin: 'Item.A' });
    await runtime.apply(actor, 'bleeding', { formula: '1d4' }, { origin: 'Item.B', stacking: 'stack' });
    expect(runtime.list(actor)).toHaveLength(1);
    expect(runtime.list(actor)[0]?.id).toBe(first.id);
    await runtime.apply(actor, 'bleeding', { formula: '2d6' }, { origin: 'Item.C' });
    await runtime.apply(actor, 'bleeding', { formula: '1d13' }, { origin: 'Item.tie' });
    expect(runtime.list(actor)).toHaveLength(1);
    expect(runtime.list(actor)[0]).toMatchObject({ origin: 'Item.C', instance: { params: { formula: '2d6', stacking: 'highest' } } });
  });

  test('Burning carries the winning type and never downgrades or switches type on a tie', async () => {
    const { actor, runtime } = fixture();
    await runtime.apply(actor, 'burning', { formula: '1d4', damageType: 'acid' }, { origin: 'Item.acid' });
    await runtime.apply(actor, 'burning', { formula: '2d6', damageType: 'fire' }, { origin: 'Item.fire' });
    await runtime.apply(actor, 'burning', { formula: '1d4', damageType: 'acid' }, { origin: 'Item.acid2' });
    await runtime.apply(actor, 'burning', { formula: '1d13', damageType: 'acid' }, { origin: 'Item.tie' });
    expect(runtime.list(actor)).toHaveLength(1);
    expect(runtime.list(actor)[0]).toMatchObject({ origin: 'Item.fire', instance: { params: { formula: '2d6', damageType: 'fire', timing: 'turnEnd' } } });
  });

  test('unsupported strength comparison rejects the new value without deleting the old condition', async () => {
    const { actor, runtime } = fixture();
    const old = await runtime.apply(actor, 'bleeding', { formula: '1d6' });
    await expect(runtime.apply(actor, 'bleeding', { formula: '1d6 / 1d4' })).rejects.toThrow();
    expect(runtime.list(actor)).toHaveLength(1);
    expect(runtime.list(actor)[0]?.id).toBe(old.id);
    expect(runtime.list(actor)[0]?.instance.params.formula).toBe('1d6');
  });

  test('legacy multiple origins settle just the strongest once per turn end', async () => {
    const { actor, runtime, rolled } = fixture();
    for (const [formula, origin] of [['1d6', 'Item.A'], ['2d6', 'Item.B']]) {
      const instance = createConditionInstance('bleeding', { formula: formula! }, { origin });
      await actor.createEmbeddedDocuments('ActiveEffect', [{ name: 'Bleeding', origin, flags: buildConditionFlag(instance) }]);
    }
    const event = { event: { type: 'combatTurnEnd', documentType: 'Actor' }, document: actor, combatUuid: 'Combat.test', key: 'Combat.test:end:1:0', round: 1, turn: 0 };
    await runtime.handleTriggerEvent(event);
    await runtime.handleTriggerEvent(event);
    expect(rolled).toEqual(['2d6']);
    expect(actor.system.attributes.hp.value).toBe(13);
    expect(runtime.list(actor)).toHaveLength(1);
  });

  test('reenabling an old instance and editing another condition cannot create active duplicates', async () => {
    const { actor, runtime } = fixture();
    await runtime.apply(actor, 'bleeding', { formula: '1d4' });
    const instance = createConditionInstance('bleeding', { formula: '2d6' }, { enabled: false, origin: 'Item.old' });
    const [old] = await actor.createEmbeddedDocuments('ActiveEffect', [{ name: 'Bleeding', disabled: true, origin: 'Item.old', flags: buildConditionFlag(instance) }]);
    await runtime.setEnabled(actor, old.id, true);
    expect(runtime.list(actor).filter((entry) => !entry.disabled)).toHaveLength(1);
    expect(runtime.list(actor)[0]?.instance.params.formula).toBe('2d6');
    const unrelated = await runtime.apply(actor, 'jinxed', { formula: '1d4' });
    await runtime.update(actor, unrelated.id, 'bleeding', { formula: '1d4' });
    expect(runtime.list(actor)).toHaveLength(1);
    expect(runtime.list(actor)[0]?.instance.params.formula).toBe('2d6');
  });

  test('failed replacement creation keeps the prior disabled effect', async () => {
    const { actor, runtime } = fixture();
    const old = await runtime.apply(actor, 'bleeding', { formula: '1d4' });
    await runtime.setEnabled(actor, old.id, false);
    actor.createEmbeddedDocuments = async () => { throw new Error('create failed'); };
    await expect(runtime.apply(actor, 'bleeding', { formula: '2d6' })).rejects.toThrow('create failed');
    expect(runtime.list(actor)).toHaveLength(1);
    expect(runtime.list(actor)[0]).toMatchObject({ id: old.id, disabled: true });
  });
});

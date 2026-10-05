import { describe, expect, test } from 'bun:test';
import { createWeaponEffectsApi } from '../src/api.ts';
import { WeaponEffectRuntime } from '../src/weapon-effects.ts';

function fixture() {
  let counter = 0;
  const writes: any[] = [];
  const source: any = { uuid: 'Actor.native-source', documentName: 'Actor', effects: [] };
  const target: any = {
    uuid: 'Actor.native-target', documentName: 'Actor', effects: [],
    system: { attributes: { movement: { units: 'ft', speeds: { walk: '30', fly: '60' } } } },
    async createEmbeddedDocuments(_kind: string, data: any[]) {
      const created = data.map(entry => ({
        ...structuredClone(entry), id: 'effect-' + counter++, parent: target,
      }));
      for (const effect of created) {
        effect.system.changes = effect.system.changes.map((row: any) => ({
          _id: String(counter++).padStart(16, '0'), ...row,
        }));
      }
      target.effects.push(...created);
      return created;
    },
    async updateEmbeddedDocuments(_kind: string, updates: any[]) {
      writes.push(structuredClone(updates));
      for (const update of updates) {
        const effect = target.effects.find((e: any) => e.id === update._id);
        for (const [path, value] of Object.entries(update)) {
          if (path === '_id') continue;
          const keys = path.split('.');
          const leaf = keys.pop()!;
          let object = effect;
          for (const key of keys) object = object[key] ??= {};
          if (leaf.startsWith('-=')) delete object[leaf.slice(2)];
          else if (path === 'system.changes') object[leaf] = (value as any[]).map(row => ({
            _id: String(counter++).padStart(16, '0'), ...row,
          }));
          else if (value && typeof value === 'object' && !Array.isArray(value)) object[leaf] = { ...object[leaf], ...structuredClone(value) };
          else object[leaf] = value;
        }
      }
      return target.effects;
    },
    async deleteEmbeddedDocuments(_kind: string, ids: string[]) {
      target.effects = target.effects.filter((e: any) => !ids.includes(e.id));
      return [];
    },
  };
  const gm = { id: 'gm', isGM: true, active: true };
  const globals: any = {
    game: { version: '14.368', system: { id: 'dnd5e', version: '6.0.5' },
      user: gm, users: { activeGM: gm }, actors: [source, target], scenes: [],
      combat: { uuid: 'Combat.native', round: 1, turn: 0, turns: [{ actor: source }, { actor: target }] } },
  };
  const runtime = new WeaponEffectRuntime(globals);
  const input = (reduction: number) => ({
    effectKind: 'slow' as const, source: { actorUuid: source.uuid, itemUuid: source.uuid + '.Item.weapon' },
    target: { actorUuid: target.uuid }, params: { speedReduction: reduction }, stackingGroup: 'dnd2024.slow',
  });
  return { globals, source, target, runtime, input, writes };
}

describe('reviewed native6 weapon writer', () => {
  test('persists canonical rows, selects only strongest Slow and preserves row IDs at an unchanged turn', async () => {
    const { globals, source, target, runtime, input, writes } = fixture();
    const api = createWeaponEffectsApi(runtime);
    expect(api.version).toBe(1);
    expect(api.capabilities.native6Effects).toBe(1);
    const strongest = await api.apply(target, input(10));
    const weaker = await api.apply(target, input(5));
    expect(strongest.changes).toBeUndefined();
    expect(strongest.system.changes).toHaveLength(5);
    expect(strongest.system.changes).toContainEqual(expect.objectContaining({
      type: 'add', key: 'system.attributes.movement.speeds.walk', value: '-10',
    }));
    expect(weaker.system.changes).toEqual([]);
    const rowIds = strongest.system.changes.map((row: any) => row._id);
    const writesBefore = writes.length;
    await runtime.handleTriggerEvent({
      event: { type: 'combatTurnStart', documentType: 'Actor' }, document: source,
      combat: globals.game.combat, combatUuid: 'Combat.native', round: 1, turn: 0,
    });
    expect(writes).toHaveLength(writesBefore);
    expect(strongest.system.changes.map((row: any) => row._id)).toEqual(rowIds);
    await api.setEnabled(target, strongest.id, false);
    expect(strongest.system.changes).toEqual([]);
    expect(weaker.system.changes).toContainEqual(expect.objectContaining({ type: 'add', value: '-5' }));
    expect(writes.some(batch => batch.some((update: any) => 'system.changes' in update))).toBeTrue();
    expect(writes.every(batch => batch.every((update: any) => !('changes' in update)))).toBeTrue();
    await api.remove(target, strongest.id);
    await api.remove(target, weaker.id);
    expect(target.effects).toEqual([]);
    expect(target.system.attributes.movement.speeds).toEqual({ walk: '30', fly: '60' });
  });

  test('advertises native capability only on the exact pair and rejects crossed or unreviewed writes', async () => {
    for (const [core, system, id, supported, native] of [
      ['14.364', '5.3.3', 'dnd5e', true, false],
      ['14.368', '6.0.5', 'dnd5e', true, true],
      ['14.364', '6.0.5', 'dnd5e', false, false],
      ['14.368', '5.3.3', 'dnd5e', false, false],
      ['14.368', '6.0.6', 'dnd5e', false, false],
      ['14.368', '6.0.5', 'pf2e', false, false],
    ] as const) {
      const { globals, runtime, target, input } = fixture();
      globals.game.version = core;
      globals.game.system = { id, version: system };
      expect(runtime.isSupported()).toBe(supported);
      expect(createWeaponEffectsApi(runtime).capabilities.native6Effects).toBe(native ? 1 : undefined);
      if (!supported) await expect(runtime.apply(target, input(10))).rejects.toThrow('exact reviewed');
      expect(target.effects).toEqual([]);
    }
  });
});

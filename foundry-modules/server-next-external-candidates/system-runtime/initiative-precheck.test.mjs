import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { initiativeSourcePath, patchInitiativePrecheck } from './initiative-precheck.mjs';

const sourceRoot = process.env.SYSTEM_RUNTIME_SOURCE_ROOT
  ?? (process.env.FVTT_REFERENCE_CACHE_ROOT && join(process.env.FVTT_REFERENCE_CACHE_ROOT, 'dnd5e/6.0.6/repo'));
assert(sourceRoot, 'Set SYSTEM_RUNTIME_SOURCE_ROOT to the pinned dnd5e 6.0.6 checkout');
const original = (await readFile(join(sourceRoot, initiativeSourcePath), 'utf8')).replaceAll('\r\n', '\n');
const candidate = patchInitiativePrecheck(original);

async function roll(source, entries, ids, started = false) {
  const rolls = [];
  const groupingChecks = [];
  class Combat {
    async rollInitiative(rolledIds) {
      for (const id of rolledIds) {
        rolls.push(id);
        this.combatants.get(id).initiative = 10 + rolls.length;
      }
    }
  }
  const context = vm.createContext({ Combat, dnd5e: { settings: { initiativeGroupRoll: true } } });
  vm.runInContext(source.replace('export default class Combat5e', 'globalThis.Combat5e = class Combat5e'), context);
  const combat = new context.Combat5e();
  combat.started = started;
  combat.combatants = new Map(entries.map(([id, group, initiative]) => [id, {
    id, initiative,
    getInitiativeGroupingKey() {
      groupingChecks.push(id);
      return group;
    }
  }]));
  combat.combatants.find = callback => Array.from(combat.combatants.values()).find(callback);
  combat.updateEmbeddedDocuments = async (_type, updates) => {
    for (const entry of updates) combat.combatants.get(entry._id).initiative = entry.initiative;
  };
  combat._recoverUses = async () => {};
  await combat.rollInitiative(ids);
  return { rolls, groupingChecks, values: Array.from(combat.combatants.values(), row => row.initiative) };
}

test('fresh independent rolls build only the six needed grouping keys', async () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const entries = ids.map(id => [id, id, null]);
  const before = await roll(original, entries, ids);
  const after = await roll(candidate, entries, ids);
  assert.equal(before.groupingChecks.length, 42);
  assert.deepEqual(after.groupingChecks, ids);
  assert.deepEqual(after.rolls, before.rolls);
  assert.deepEqual(after.values, before.values);
});

test('finite donor at zero and same-batch group reuse keep native results', async () => {
  const entries = [['a', 'shared', null], ['donor', 'shared', 0], ['b', 'other', null], ['c', 'other', null]];
  const ids = ['a', 'b', 'c'];
  const before = await roll(original, entries, ids);
  const after = await roll(candidate, entries, ids);
  assert.deepEqual(after.rolls, ['b']);
  assert.deepEqual(after.values, [0, 0, 11, 11]);
  assert.deepEqual(after.values, before.values);
});

test('once started the method still only shares among the current batch', async () => {
  const entries = [['a', 'shared', null], ['donor', 'shared', 4], ['b', 'shared', null]];
  const after = await roll(candidate, entries, ['a', 'b'], true);
  assert.deepEqual(after.rolls, ['a']);
  assert.deepEqual(after.values, [11, 4, 11]);
});

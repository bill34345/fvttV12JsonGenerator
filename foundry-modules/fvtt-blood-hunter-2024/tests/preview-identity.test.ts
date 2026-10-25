import { expect, test } from 'bun:test';
import { applyActorMigrationPlan, clone, planActorMigration } from '../src/migration';
import { dawnTarget, fixtureContract } from './helpers';
import type { ActorLike } from '../src/contracts';

test.each(['description', 'activities', 'effects'])('Preview detects %s edits even when the source logicalHash is unchanged', (field) => {
  const contract = fixtureContract();
  const item = clone(dawnTarget(contract));
  if (field === 'effects') item.effects.push({ _id: 'manual-effect', name: 'GM effect' });
  else if (field === 'description') item.system.description = { value: 'GM edited description' };
  else item.system.activities = { ...(item.system.activities as object), manual: { type: 'utility', name: 'GM activity' } };
  const actor = { _id: 'synthetic', name: 'Synthetic', system: {}, items: [item] } as ActorLike;
  const before = clone(actor);
  const plan = planActorMigration(actor, contract);
  const action = plan.actions.find(entry => entry.canonicalId === item._id);
  expect(action?.action).toBe('conflict');
  expect(action?.conflicts.map(entry => entry.path)).toContain(field === 'effects' ? 'effects' : `system.${field}`);
  expect(actor).toEqual(before);
});

test('Preview ignores spent uses and advancement selections without changing them', () => {
  const contract = fixtureContract();
  const item = clone(dawnTarget(contract));
  const uses = item.system.uses as Record<string, unknown>;
  if (uses) uses.spent = 2;
  for (const activity of Object.values(item.system.activities as Record<string, any>)) {
    if (activity.uses) activity.uses.spent = 1;
  }
  item.system.levels = 7;
  const actor = { _id: 'synthetic', name: 'Synthetic', system: {}, items: [item] } as ActorLike;
  const before = clone(actor);
  const action = planActorMigration(actor, contract).actions.find(entry => entry.canonicalId === item._id);
  expect(action?.action).toBe('keep');
  expect(actor).toEqual(before);
});

test.each(['name', 'system-property'])('same-revision %s edits outside the decision fields keep the entire Item', (field) => {
  const contract = fixtureContract();
  const item = clone(dawnTarget(contract));
  if (field === 'name') item.name = 'GM custom feature name';
  else item.system.customRule = 'GM custom rule';
  item.system.description = { value: 'Also edited by GM' };
  const actor = { _id: 'synthetic', name: 'Synthetic', system: {}, items: [item] } as ActorLike;
  const plan = planActorMigration(actor, contract);
  const action = plan.actions.find(entry => entry.canonicalId === item._id);
  expect(action?.action).toBe('skip');
  expect(action?.reason).toContain('保留整个 Item');
  expect(applyActorMigrationPlan(actor, plan).items).toEqual(actor.items);
});

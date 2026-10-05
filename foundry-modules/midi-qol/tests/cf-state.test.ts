import { expect, test } from 'bun:test';
import { beginCfCast, currentCastLink, assertKnownSceneDocuments } from '../cf-state.mjs';

test('new cast clears previous cascade success; cancellation cannot reuse old linked objects', () => {
  const state: any = { casts: 1, deletion: { cascadePass: true } };
  const effects = [{ uuid: 'effect-old', type: 'base' }];
  const regions = [{ uuid: 'region-old', dependentOn: 'effect-old' }];
  beginCfCast(state, effects, regions);
  state.castEvidence.useResult = 'FALSE';
  expect(state.deletion).toBeUndefined();
  expect(state.casts).toBe(2);
  expect(currentCastLink(state, effects, regions)).toBe(false);
});

test('only new base effect and new matching region from current use are linked', () => {
  const state: any = { casts: 0 };
  beginCfCast(state, [], []);
  state.castEvidence.createdEffects = ['effect']; state.castEvidence.createdRegions = ['region'];
  state.castEvidence.useResult = 'RETURNED';
  expect(currentCastLink(state, [{ uuid: 'effect', type: 'base' }], [{ uuid: 'region', dependentOn: 'effect' }])).toBe(true);
  expect(currentCastLink(state, [{ uuid: 'effect', type: 'condition' }], [{ uuid: 'region', dependentOn: 'effect' }])).toBe(false);
  expect(currentCastLink(state, [{ uuid: 'effect', type: 'base' }], [{ uuid: 'region-old', dependentOn: 'effect' }])).toBe(false);
  for (const result of ['PENDING', 'ERROR', 'UNDEFINED', 'FALSE']) {
    state.castEvidence.useResult = result;
    expect(currentCastLink(state, [{ uuid: 'effect', type: 'base' }], [{ uuid: 'region', dependentOn: 'effect' }])).toBe(false);
  }
});

test('unrecorded non-token documents prevent scene deletion', () => {
  expect(() => assertKnownSceneDocuments(['Token:own', 'Region:own'], ['Token:own', 'Region:own'])).not.toThrow();
  for (const type of ['Region', 'Drawing', 'Tile', 'Wall']) {
    expect(() => assertKnownSceneDocuments(['Token:own'], ['Token:own', `${type}:another-task`])).toThrow('unowned embedded documents');
  }
});

import { expect, test } from 'bun:test';
import { requireNextVmCleanupOwnership, type NextVmCleanupBinding, type NextVmCleanupSnapshot } from './next-vm-cleanup';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { buildNextVmCleanupGuard } from './next-vm-cleanup-bundle';

// Synthetic protocol vector based on the saved real diagnosis; no live world access or deletes.
const binding: NextVmCleanupBinding = { sourceDispatchId: 'synthetic-batch', actors: [
  { id: 'observer', type: 'character', createdTime: 1000, itemIds: ['macro-item'], effectIds: ['magical'] },
  { id: 'target', type: 'npc', createdTime: 1010, itemIds: ['weapon'], effectIds: ['silent-input'] },
], automaticCondition: { actorId: 'target', id: 'dnd5einaudible00', inputEffectId: 'silent-input', status: 'inaudible', createdTime: 1165 } };
const owned = (id: string, parentId: string, extra = {}) => ({ id, parentId, marker: 'synthetic-batch', sourceMarker: 'synthetic-batch', ...extra });
function snapshot(): NextVmCleanupSnapshot {
  return { sourceDispatchId: 'synthetic-batch', sourcePhase: 'prepared', initialActorsAbsent: true, dae: { active: true, version: '14.0.14' }, actors: [
    { ...owned('observer', ''), type: 'character', createdTime: 1000, sourceIds: ['macro-item', 'magical'], items: [owned('macro-item', 'observer')], effects: [owned('magical', 'observer')] },
    { ...owned('target', ''), type: 'npc', createdTime: 1010, sourceIds: ['weapon', 'silent-input', 'dnd5einaudible00'], items: [owned('weapon', 'target')], effects: [
      owned('silent-input', 'target', { statuses: ['inaudible'], createdTime: 1150 }),
      { id: 'dnd5einaudible00', parentId: 'target', type: 'condition', systemType: 'inaudible', statuses: ['inaudible'], marker: null, sourceMarker: null,
        autoCreated: true, sourceAutoCreated: true, createdTime: 1165 },
    ] },
  ] };
}
test('exact automatic condition lineage is accepted without adding an ownership marker', () => {
  const value = snapshot(), before = JSON.stringify(value);
  expect(requireNextVmCleanupOwnership(value, binding).ready).toBe(true); expect(JSON.stringify(value)).toBe(before);
});
test('manual condition, missing flag and runtime-only claimed flag are refused', () => {
  for (const patch of [{ autoCreated: false }, { sourceAutoCreated: null }, { marker: 'another-owner' }]) {
    const value = snapshot(); Object.assign(value.actors[1]!.effects![1]!, patch);
    expect(() => requireNextVmCleanupOwnership(value, binding)).toThrow('automatic condition provenance');
  }
});
test('preexisting or wrong actor, disabled/wrong DAE and missing owned input are refused', () => {
  const variants: Array<(value: NextVmCleanupSnapshot) => void> = [
    value => { value.initialActorsAbsent = false; }, value => { value.dae.active = false; }, value => { value.dae.version = 'other'; },
    value => { value.actors[1]!.sourceMarker = null; }, value => { value.actors[1]!.effects![0]!.statuses = []; },
  ];
  for (const change of variants) { const value = snapshot(); change(value); expect(() => requireNextVmCleanupOwnership(value, binding)).toThrow(); }
});
test('additional persisted or runtime documents cannot be hidden by the exception', () => {
  for (const where of ['source', 'effects', 'items']) {
    const value = snapshot(), target = value.actors[1]!;
    if (where === 'source') target.sourceIds!.push('foreign');
    else if (where === 'effects') target.effects!.push(owned('foreign', 'target', { marker: null }));
    else target.items!.push(owned('foreign', 'target', { marker: null }));
    expect(() => requireNextVmCleanupOwnership(value, binding)).toThrow('embedded/source set');
  }
});
test('wrong parent, status or birth timestamps refuse deletion readiness', () => {
  for (const patch of [{ parentId: 'other' }, { statuses: ['invisible'] }, { createdTime: 2000 }, { systemType: 'other' }]) {
    const value = snapshot(); Object.assign(value.actors[1]!.effects![1]!, patch);
    expect(() => requireNextVmCleanupOwnership(value, binding)).toThrow();
  }
});
test('old real IIFE build lacks a namespace despite successful compilation', async () => {
  const old = await Bun.build({ entrypoints: [resolve(import.meta.dir, 'next-vm-cleanup.ts')], target: 'browser', format: 'iife', minify: false });
  expect(old.success).toBe(true);
  const body = await old.outputs[0]!.text();
  expect(() => runInNewContext(`${body}\nNextVmCleanup.requireNextVmCleanupOwnership(snapshot, binding)`, { snapshot: snapshot(), binding }, { timeout: 1000 })).toThrow('NextVmCleanup');
});
test('actual compiled namespace executes the readiness entry and still refuses a manual effect', async () => {
  const body = await buildNextVmCleanupGuard();
  const value = snapshot();
  expect(runInNewContext(`${body}\nNextVmCleanup.requireNextVmCleanupOwnership(snapshot, binding)`, { snapshot: value, binding }, { timeout: 1000 }).ready).toBe(true);
  value.actors[1]!.effects![1]!.autoCreated = false;
  expect(() => runInNewContext(`${body}\nNextVmCleanup.requireNextVmCleanupOwnership(snapshot, binding)`, { snapshot: value, binding }, { timeout: 1000 })).toThrow('automatic condition provenance');
});

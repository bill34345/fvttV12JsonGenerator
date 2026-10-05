import { expect, test } from 'bun:test';
import { useMidiActivityUntilAttack, useMidiActivityUntilTerminal } from '../src/adapters/midi-activity.ts';

function setup() {
  const handlers = new Map<string, Set<(workflow: any) => void>>();
  const restored: string[][] = [];
  const user: any = { targets: new Set([{ id: 'primary' }]) };
  const canvas = { scene: { id: 'test-scene' }, tokens: {
    setTargets(ids: string[], options: { mode: string }) {
      expect(options).toEqual({ mode: 'replace' });
      restored.push(ids);
      user.targets = new Set(ids.map(id => ({ id })));
    },
  } };
  const hooks = {
    on(name: string, handler: (workflow: any) => void) {
      const set = handlers.get(name) ?? new Set(); set.add(handler); handlers.set(name, set); return handler;
    },
    off(name: string, handler: (workflow: any) => void) { handlers.get(name)?.delete(handler); },
  };
  const emit = (name: string, workflow: any) => [...(handlers.get(name) ?? [])].forEach(handler => handler(workflow));
  const count = () => [...handlers.values()].reduce((total, set) => total + set.size, 0);
  const calls: any[] = [];
  const activity: any = { uuid: 'Actor.source.Item.weapon.Activity.attack', use: async (...args: any[]) => {
    calls.push(args); user.targets = new Set([{ id: 'secondary' }]); return { message: { id: 'child-card' } };
  } };
  const input = { activity, sequenceId: 'cleave-child-use',
    usage: { midiOptions: { targetsToUse: new Set([{ id: 'secondary' }]), workflowOptions: { parentAttackId: 'parent' } } },
    globals: { Hooks: hooks, game: { user }, canvas } };
  return { activity, input, user, canvas, restored, emit, count, calls };
}

test('a created child card remains pending until its exact terminal event, preserving parent identity', async () => {
  const s = setup();
  let resolved = false;
  const waiting = useMidiActivityUntilTerminal(s.input).then(result => { resolved = true; return result; });
  await Promise.resolve();
  expect(resolved).toBeFalse();
  expect(s.count()).toBe(2);
  expect(s.calls[0][0]).toMatchObject({ sequenceId: 'cleave-child-use',
    midiOptions: { workflowOptions: { parentAttackId: 'parent', forceCompletion: true } } });
  expect(s.input.usage.midiOptions.workflowOptions).toEqual({ parentAttackId: 'parent' });
  s.emit(`midi-qol.postCleanup.${s.activity.uuid}`, { sequenceId: 'other-use' });
  await Promise.resolve();
  expect(resolved).toBeFalse();
  const workflow = { sequenceId: 'cleave-child-use', attackRoll: { total: 17 } };
  s.emit(`midi-qol.postCleanup.${s.activity.uuid}`, workflow);
  expect(await waiting).toBe(workflow);
  expect(s.count()).toBe(0);
  expect(s.restored).toEqual([['primary']]);
  expect([...s.user.targets]).toEqual([{ id: 'primary' }]);
});

test('v14 targeting restores an initially empty selection after a child abort', async () => {
  const s = setup();
  s.user.targets.clear();
  const waiting = useMidiActivityUntilTerminal(s.input);
  s.emit(`midi-qol.preAbort.${s.activity.uuid}`, { sequenceId: 'cleave-child-use', aborted: true });
  await waiting;
  expect(s.restored).toEqual([[]]);
  expect(s.user.targets.size).toBe(0);
});

test('target restoration never uses token IDs from a scene that has since been replaced', async () => {
  for (const change of ['scene', 'layer']) {
    const s = setup();
    const waiting = useMidiActivityUntilTerminal(s.input);
    if (change === 'scene') s.canvas.scene = { id: 'other-scene' };
    else s.canvas.tokens = { ...s.canvas.tokens };
    s.emit(`midi-qol.postCleanup.${s.activity.uuid}`, { sequenceId: 'cleave-child-use' });
    await waiting;
    expect(s.restored).toEqual([]);
    expect([...s.user.targets]).toEqual([{ id: 'secondary' }]);
    expect(s.count()).toBe(0);
  }
});

test('actual child abort completes once and does not restore over a later user target choice', async () => {
  const s = setup();
  const waiting = useMidiActivityUntilTerminal(s.input);
  s.user.targets = new Set([{ id: 'unrelated-choice' }]);
  const aborted = { sequenceId: 'cleave-child-use', aborted: true };
  s.emit(`midi-qol.preAbort.${s.activity.uuid}`, aborted);
  expect(await waiting).toBe(aborted);
  expect(s.count()).toBe(0);
  expect(s.restored).toEqual([]);
});

test('startup refusal and exceptions remove listeners rather than leave phantom child observers', async () => {
  for (const mode of ['refusal', 'sync-error', 'async-error']) {
    const s = setup();
    s.activity.use = mode === 'refusal' ? () => false : mode === 'sync-error'
      ? () => { throw new Error('use-failed'); } : async () => { throw new Error('use-failed'); };
    const result = useMidiActivityUntilTerminal(s.input);
    if (mode === 'refusal') expect(await result).toBeFalse();
    else await expect(result).rejects.toThrow('use-failed');
    expect(s.count()).toBe(0);
  }
});

test('stopping observation cleans listeners and preserves uncertainty instead of reporting cancellation', async () => {
  const s = setup();
  const controller = new AbortController();
  const waiting = useMidiActivityUntilTerminal({ ...s.input, signal: controller.signal });
  controller.abort();
  await expect(waiting).rejects.toThrow('reconcile before retry');
  expect(s.count()).toBe(0);
});

test('missing lifecycle hooks or an already stopped observer never starts the Activity', async () => {
  const s = setup();
  await expect(useMidiActivityUntilTerminal({ ...s.input, globals: {} })).rejects.toThrow('lifecycle hooks');
  const controller = new AbortController(); controller.abort();
  await expect(useMidiActivityUntilTerminal({ ...s.input, signal: controller.signal })).rejects.toThrow('reconcile');
  expect(s.calls).toHaveLength(0);
});

test('attack observation returns at the exact attack boundary even when manual damage is still pending', async () => {
  const s = setup();
  let settled = false;
  const waiting = useMidiActivityUntilAttack({ ...s.input, dialog: { configure: false } })
    .then(result => { settled = true; return result; });
  await Promise.resolve();
  expect(s.calls[0][1]).toEqual({ configure: false });
  s.emit('midi-qol.AttackRollComplete', { sequenceId: s.input.sequenceId, activity: { uuid: 'another-activity' } });
  await Promise.resolve();
  expect(settled).toBeFalse();
  const workflow = { sequenceId: s.input.sequenceId, activity: s.activity, attackRoll: { total: 17 } };
  s.emit('midi-qol.AttackRollComplete', workflow);
  const result = await waiting;
  expect(result.event).toBe('attack');
  expect(result.workflow).toBe(workflow);
  expect(result.results).toEqual({ message: { id: 'child-card' } });
  expect(s.count()).toBe(0);
});

test('attack observation records preAbort before Midi has set the aborted flag', async () => {
  const s = setup();
  const waiting = useMidiActivityUntilAttack(s.input);
  const workflow = { sequenceId: s.input.sequenceId, aborted: false };
  s.emit('midi-qol.preAbort.' + s.activity.uuid, workflow);
  const result = await waiting;
  expect(result.event).toBe('abort');
  expect(result.workflow?.aborted).toBeFalse();
  expect(result.results).toEqual({ message: { id: 'child-card' } });
  expect(s.count()).toBe(0);
});

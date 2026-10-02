import { describe, expect, test } from 'bun:test';
import {
  applyCriticalBleedingAction,
  applyPushAction,
  resolveToppleAction,
  selectCleaveSecondary,
  type ActionContext,
} from '../src/adapters/actions.ts';

function actor(id: string, size = 'med', extra: Record<string, unknown> = {}): any {
  return {
    id,
    uuid: `Actor.${id}`,
    documentName: 'Actor',
    name: id,
    system: { traits: { size, ci: { value: new Set<string>() } } },
    ...extra,
  };
}

function token(id: string, value: any, x: number, y: number, extra: Record<string, unknown> = {}): any {
  const updates: any[] = [];
  const document: any = {
    id,
    uuid: `Scene.scene.Token.${id}`,
    documentName: 'Token',
    x,
    y,
    elevation: 0,
    parent: { id: 'scene' },
    async update(changes: any, options?: any) {
      updates.push({ changes, options });
      Object.assign(document, changes);
      return document;
    },
  };
  return { id, uuid: document.uuid, documentName: 'Token', actor: value, document, updates, checkCollision: () => false, ...extra };
}

function environment(options: { dialogResult?: unknown; collision?: boolean; modules?: Map<string, any> } = {}): any {
  const dialogCalls: any[] = [];
  const globals: any = {
    canvas: {
      dimensions: { size: 100, sceneRect: { x: 0, y: 0, width: 1000, height: 1000 } },
      grid: {
        size: 100,
        measurePath(points: any[]) {
          const [from, to] = points;
          return { distance: Math.hypot(to.x - from.x, to.y - from.y) / 20 };
        },
      },
    },
    CONFIG: { Canvas: { polygonBackends: { move: { testCollision: () => Boolean(options.collision) } } } },
    game: { user: { targets: new Set() }, modules: options.modules ?? new Map() },
    foundry: { applications: { api: { DialogV2: { wait: async (config: any) => { dialogCalls.push(config); return options.dialogResult; } } } } },
  };
  globals.dialogCalls = dialogCalls;
  return globals;
}

function baseContext(overrides: Partial<ActionContext> = {}, globals = environment()): ActionContext {
  const sourceActor = actor('source', 'med');
  const targetActor = actor('target', 'med');
  return {
    sourceActor,
    sourceToken: token('source-token', sourceActor, 0, 0),
    targetActor,
    targetToken: token('target-token', targetActor, 100, 0),
    item: { uuid: 'Item.weapon' },
    activity: { uuid: 'Actor.source.Item.weapon.Activity.attack' },
    globals,
    ...overrides,
  };
}

describe('weapon action adapters', () => {
  test('Push validates straight-away movement, scene distance, collision, and updates TokenDocument', async () => {
    const context = baseContext();
    const collisionCalls: any[] = [];
    context.targetToken.checkCollision = (...args: any[]) => { collisionCalls.push(args); return false; };
    const result = await applyPushAction({ ...context, destination: { x: 200, y: 0 }, rule: { distanceFeet: 10 } });
    expect(result).toMatchObject({ ok: true, status: 'applied', value: { distanceFeet: 5, destination: { x: 200, y: 0 } } });
    expect(collisionCalls[0]?.[1]).toEqual({ type: 'move', mode: 'any' });
    expect(context.targetToken.updates).toHaveLength(1);
    expect(context.targetToken.updates[0].changes).toEqual({ x: 200, y: 0 });
  });

  test('Push rejects diagonal, over-range, and blocked destinations without writing', async () => {
    const diagonal = baseContext();
    expect((await applyPushAction({ ...diagonal, destination: { x: 200, y: 100 }, rule: { distanceFeet: 10 } })).status).toBe('invalid');
    expect(diagonal.targetToken.updates).toHaveLength(0);

    const overRange = baseContext();
    expect((await applyPushAction({ ...overRange, destination: { x: 400, y: 0 }, rule: { distanceFeet: 10 } })).status).toBe('invalid');
    expect(overRange.targetToken.updates).toHaveLength(0);

    const blocked = baseContext({}, environment({ collision: true }));
    blocked.targetToken.checkCollision = () => true;
    expect((await applyPushAction({ ...blocked, destination: { x: 200, y: 0 }, rule: { distanceFeet: 10 } })).status).toBe('invalid');
    expect(blocked.targetToken.updates).toHaveLength(0);
  });

  test('Push never silently accepts an illegal manually supplied point or cancelled DialogV2 choice', async () => {
    const manual = baseContext();
    const manualResult = await applyPushAction({ ...manual, destination: { x: 200, y: 100 }, rule: { distanceFeet: 10 } });
    expect(manualResult.status).toBe('invalid');
    expect(manual.globals.dialogCalls).toHaveLength(0);

    const cancelledGlobals = environment({ dialogResult: undefined });
    const cancelled = baseContext({}, cancelledGlobals);
    const cancelledResult = await applyPushAction({ ...cancelled, rule: { distanceFeet: 10 } });
    expect(cancelledResult).toMatchObject({ ok: false, status: 'cancelled' });
    expect(cancelled.targetToken.updates).toHaveLength(0);
    expect(cancelledGlobals.dialogCalls).toHaveLength(1);
  });

  test('Cleave filters by primary distance and weapon reach and requires an explicit target choice', async () => {
    const globals = environment({ dialogResult: undefined });
    const context = baseContext({}, globals);
    const candidateActor = actor('secondary', 'lg');
    const candidate = token('secondary-token', candidateActor, 200, 0);
    const farActor = actor('far', 'med');
    const far = token('far-token', farActor, 400, 0);
    const cancelled = await selectCleaveSecondary({
      ...context,
      candidates: [candidate, far],
      reachFeet: 15,
      distanceFeet: 5,
    });
    expect(cancelled).toMatchObject({ ok: false, status: 'cancelled' });
    expect(globals.dialogCalls).toHaveLength(1);

    const selectedGlobals = environment({ dialogResult: candidate });
    const selected = await selectCleaveSecondary({
      ...context,
      globals: selectedGlobals,
      candidates: [candidate, far],
      reachFeet: 15,
      distanceFeet: 5,
    });
    expect(selected).toMatchObject({ ok: true, status: 'selected', value: { target: candidate, actor: candidateActor, token: candidate } });
  });

  test('Cleave rejects a manually selected candidate outside the exact geometry', async () => {
    const context = baseContext();
    const invalidActor = actor('invalid', 'med');
    const invalid = token('invalid-token', invalidActor, 400, 0);
    const result = await selectCleaveSecondary({ ...context, selected: invalid, candidates: [invalid], reachFeet: 15, distanceFeet: 5 });
    expect(result).toMatchObject({ ok: false, status: 'invalid' });
    expect(context.globals.dialogCalls).toHaveLength(0);
  });

  test('Topple calls the exact dnd5e 5.3.3 Actor.rollSavingThrow API and toggles native Prone on failure', async () => {
    const calls: any[] = [];
    const toggles: any[] = [];
    const target = actor('target', 'med', {
      async rollSavingThrow(...args: any[]) { calls.push(args); return [{ total: 8 }]; },
      async toggleStatusEffect(...args: any[]) { toggles.push(args); return {}; },
    });
    const context = baseContext({ targetActor: target }, environment());
    const failure = await resolveToppleAction({ ...context, dc: 10, dialog: { fastForward: true }, message: { flavor: 'Topple' } });
    expect(failure).toMatchObject({ ok: true, status: 'failure', value: { total: 8, dc: 10, condition: 'prone' } });
    expect(calls).toEqual([[{ ability: 'con', target: 10 }, { fastForward: true }, { flavor: 'Topple' }]]);
    expect(toggles).toEqual([['prone', { active: true }]]);
  });

  test('Topple reports save success, cancellation, and Prone immunity without applying a fallback effect', async () => {
    const toggles: any[] = [];
    const successActor = actor('success', 'med', {
      async rollSavingThrow() { return [{ total: 12 }]; },
      async toggleStatusEffect(...args: any[]) { toggles.push(args); },
    });
    const success = await resolveToppleAction({ ...baseContext({ targetActor: successActor }), dc: 10 });
    expect(success).toMatchObject({ ok: true, status: 'success' });
    expect(toggles).toHaveLength(0);

    const cancelledActor = actor('cancelled', 'med', { async rollSavingThrow() { return null; } });
    expect((await resolveToppleAction({ ...baseContext({ targetActor: cancelledActor }), dc: 10 })).status).toBe('cancelled');

    const immuneActor = actor('immune', 'med', { system: { traits: { size: 'med', ci: { value: new Set(['prone']) } } }, async rollSavingThrow() { throw new Error('must not roll'); } });
    expect((await resolveToppleAction({ ...baseContext({ targetActor: immuneActor }), dc: 10 })).status).toBe('immune');
  });

  test('critical bleeding uses the public custom-conditions apply(target, bleeding, params, options) call', async () => {
    const calls: any[] = [];
    const modules = new Map([['fvtt-custom-conditions', { api: { apply: async (...args: any[]) => { calls.push(args); return { id: 'bleed-effect' }; } } }]]);
    const globals = environment({ modules });
    const context = baseContext({}, globals);
    const result = await applyCriticalBleedingAction({
      ...context,
      rule: { formula: '1d6', mode: 'damage', damageType: 'slashing', endOnHealing: true },
    });
    expect(result).toMatchObject({ ok: true, status: 'applied', value: { result: { id: 'bleed-effect' } } });
    expect(calls).toEqual([[context.targetActor, 'bleeding', {
      formula: '1d6', mode: 'damage', damageType: 'slashing', timing: 'turnEnd', stacking: 'highest', endOnHealing: true,
    }, { source: 'Actor.source', origin: 'Actor.source.Item.weapon.Activity.attack' }]]);
  });
});

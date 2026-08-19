import { describe, expect, test } from 'bun:test';
import {
  canSelectMovementAction,
  collectTargets,
  createIntentStore,
  dedupeActors,
  normalizeMovementAction,
  validateTargets,
  type MovementIntent,
  type StatusIntent,
} from '../src/core.ts';

function token(uuid: string, actor: any, name = uuid, canUpdate = true) {
  const document = {
    uuid,
    id: uuid.split('.').at(-1),
    name,
    actor,
    canUserModify: () => canUpdate,
  };
  return { uuid, name, actor, document };
}

function baseIntent(kind: 'status' | 'movement', createdAt = 100): StatusIntent | MovementIntent {
  const actor = { uuid: 'Actor.source', id: 'source', canUserModify: () => true };
  const source = token('Scene.test.Token.source', actor, 'Source');
  const targets = collectTargets([source], source);
  if (kind === 'status') {
    return {
      transactionId: 'tx-status', kind, sourceTokenKey: targets[0]!.tokenKey, sourceActorKey: targets[0]!.actorKey,
      userId: 'user', targets, createdAt, statusId: 'poisoned', active: true, overlay: false,
    };
  }
  return {
    transactionId: 'tx-movement', kind, sourceTokenKey: targets[0]!.tokenKey, sourceActorKey: targets[0]!.actorKey,
    userId: 'user', targets, createdAt, movementAction: 'swim',
  };
}

describe('selected token sync core', () => {
  test('collects the HUD source and deduplicates repeated token references', () => {
    const actor = { uuid: 'Actor.a' };
    const first = token('Scene.test.Token.a', actor, 'A');
    const targets = collectTargets([first, first], first);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.actorKey).toBe('actor:uuid:Actor.a');
  });

  test('deduplicates linked actors but keeps synthetic actors separate', () => {
    const linked = { uuid: 'Actor.linked' };
    const syntheticA = { uuid: 'Scene.test.Token.a.Actor' };
    const syntheticB = { uuid: 'Scene.test.Token.b.Actor' };
    const targets = collectTargets([
      token('Scene.test.Token.1', linked, 'linked 1'),
      token('Scene.test.Token.2', linked, 'linked 2'),
      token('Scene.test.Token.3', syntheticA, 'synthetic A'),
      token('Scene.test.Token.4', syntheticB, 'synthetic B'),
    ], null);
    expect(dedupeActors(targets)).toHaveLength(3);
  });

  test('normalizes the v14 default movement option to null', () => {
    expect(normalizeMovementAction(undefined)).toBeNull();
    expect(normalizeMovementAction('')).toBeNull();
    expect(normalizeMovementAction('swim')).toBe('swim');
  });

  test('checks dynamic movement action descriptors and canSelect', () => {
    const document = {};
    const actions = {
      swim: { canSelect: () => true },
      blink: { canSelect: () => false },
    };
    expect(canSelectMovementAction('swim', document, actions)).toBe(true);
    expect(canSelectMovementAction('blink', document, actions)).toBe(false);
    expect(canSelectMovementAction('unknown', document, actions)).toBe(false);
    expect(canSelectMovementAction(null, document, actions)).toBe(true);
  });

  test('fails closed when any selected target is not editable', () => {
    const actor = { uuid: 'Actor.a', canUserModify: () => true };
    const targets = collectTargets([
      token('Scene.test.Token.a', actor, 'A'),
      token('Scene.test.Token.b', actor, 'B', false),
    ], null);
    const failures = validateTargets(targets, 'movement', { id: 'user' }, 'fly', { fly: {} });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.target.label).toBe('B');
  });

  test('consumes matching intents once and expires stale intents', () => {
    let now = 100;
    const store = createIntentStore(10, () => now);
    const status = baseIntent('status', now);
    const movement = baseIntent('movement', now);
    store.add(status);
    store.add(movement);
    expect(store.size).toBe(2);
    expect(store.consume((intent) => intent.kind === 'movement')?.transactionId).toBe('tx-movement');
    expect(store.size).toBe(1);
    now = 111;
    expect(store.consume(() => true)).toBeUndefined();
    expect(store.size).toBe(0);
  });
});

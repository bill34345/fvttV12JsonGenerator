import { describe, expect, test } from 'bun:test';
import { ChatWindowController } from '../chat-window';

function createHarness(count: number, retainedMessages = 3) {
  const ids = Array.from({ length: count }, (_, index) => `m${index + 1}`);
  const deleteCalls: string[] = [];
  let atBottom = true;
  let now = 0;
  const controller = new ChatWindowController({
    getMessageIds: () => [...ids],
    isAtBottom: () => atBottom,
    deleteMessage: async (id) => { deleteCalls.push(id); },
    retainedMessages: () => retainedMessages,
    now: () => now,
  });
  return {
    controller,
    ids,
    deleteCalls,
    setAtBottom(value: boolean) { atBottom = value; },
    advance(ms: number) { now += ms; },
  };
}

describe('chat DOM window convergence', () => {
  test('submits oldest messages once and waits for actual DOM removal', async () => {
    const h = createHarness(6);
    await h.controller.reconcile();
    expect(h.deleteCalls).toEqual(['m1', 'm2', 'm3']);
    await h.controller.reconcile();
    expect(h.deleteCalls).toEqual(['m1', 'm2', 'm3']);

    h.ids.splice(0, 3);
    await h.controller.onDomMutation();
    expect(h.controller.getStats()).toMatchObject({ renderedMessages: 3, pendingRemovals: 0, trimmedMessages: 3 });
  });

  test('pauses while reading history and resumes when the user returns to bottom', async () => {
    const h = createHarness(6);
    h.setAtBottom(false);
    await h.controller.reconcile();
    expect(h.deleteCalls).toEqual([]);
    h.setAtBottom(true);
    await h.controller.reconcile();
    expect(h.deleteCalls).toEqual(['m1', 'm2', 'm3']);
  });

  test('recovers stale pending removals and converges after the animation deadline', async () => {
    const h = createHarness(5);
    await h.controller.reconcile();
    expect(h.deleteCalls).toEqual(['m1', 'm2']);
    h.advance(1_001);
    await h.controller.reconcile();
    expect(h.deleteCalls).toEqual(['m1', 'm2', 'm1', 'm2']);
    expect(h.controller.getStats().staleRemovalRetries).toBe(2);
  });
});

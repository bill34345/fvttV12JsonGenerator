import { describe, expect, test } from 'bun:test';
import { legendaryReminder } from '../src/opportunities.ts';

describe('Legendary action reminders', () => {
  test('after a creature ends its turn, eligible bosses share one card with their own options and points', () => {
    const strike = { id: 'strike', name: 'Tail Strike', image: 'icons/strike.webp', available: true, cost: 1 };
    const move = { id: 'move', name: 'Shadow Leap', available: true, cost: 2 };
    const bosses = [
      { id: 'ended', name: 'Outgoing Boss', eligible: true, remaining: 2, actions: [strike] },
      { id: 'dragon', name: 'Dragon', portrait: 'tokens/dragon.webp', eligible: true, remaining: 1, actions: [strike, move] },
      { id: 'lich', name: 'Lich', eligible: true, remaining: 2, actions: [move] },
      { id: 'exhausted', name: 'Spent Boss', eligible: true, remaining: 0, actions: [strike] },
      { id: 'stunned', name: 'Stunned Boss', eligible: false, remaining: 2, actions: [strike] },
    ];

    expect(legendaryReminder('ended', bosses)).toEqual([
      { id: 'dragon', name: 'Dragon', portrait: 'tokens/dragon.webp', remaining: 1, actions: [strike] },
      { id: 'lich', name: 'Lich', portrait: undefined, remaining: 2, actions: [move] },
    ]);
  });
});

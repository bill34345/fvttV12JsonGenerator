import { describe, expect, it } from 'bun:test';
import { adjacentSquares, nextTargetRound, permittedStatuses, rectanglesOverlap, shouldOfferDefiance, tokenFootprint, wardDamage } from './battle-control.mjs';

describe('source-authored Crystalbleed runtime rules', () => {
  it('respects target condition immunities without suppressing non-condition state markers', () => {
    expect(permittedStatuses(['frightened'], new Set(['frightened']))).toEqual([]);
    expect(permittedStatuses(['dazed'], new Set(['stunned', 'paralyzed']))).toEqual(['dazed']);
    expect(permittedStatuses(['dazed'], new Set(['dazed']))).toEqual([]);
    expect(permittedStatuses([], new Set(['frightened']))).toEqual([]);
  });
  it('uses committed token coordinates while movement animation is still in flight', () => {
    expect(tokenFootprint({ x: 0, y: 0, w: 100, h: 100, document: { x: 500, y: 400, width: 3, height: 2 } }, 100))
      .toEqual({ x: 500, y: 400, w: 300, h: 200 });
  });
  it('offers defiance only before resolving a failed save with remaining charges', () => {
    expect(shouldOfferDefiance(false, true, 2)).toBe(true);
    expect(shouldOfferDefiance(false, true, 1)).toBe(true);
    expect(shouldOfferDefiance(true, true, 2)).toBe(false);
    expect(shouldOfferDefiance(false, false, 2)).toBe(false);
    expect(shouldOfferDefiance(false, true, 0)).toBe(false);
  });
  it('uses a strict threshold, halves once, preserves low damage and healing', () => {
    expect([0, 1, 20, 21, 22, 41, -10].map(value => wardDamage(value, 'full'))).toEqual([0, 1, 20, 10, 11, 20, -10]);
    expect(wardDamage(12 + 14, 'full')).toBe(13);
    expect(wardDamage(100, 'broken')).toBe(100);
    expect(wardDamage(20, 'weakened')).toBe(20);
    expect(wardDamage(21, 'weakened')).toBe(16);
    expect(wardDamage(25, 'weakened', 4)).toBe(21);
  });
  it('enumerates only the eight adjacent cells for a one-cell target', () => {
    const target = { x: 100, y: 100, w: 100, h: 100 };
    const candidates = adjacentSquares(target, 100);
    expect(candidates).toHaveLength(8);
    expect(candidates.every(candidate => !rectanglesOverlap(candidate, target))).toBe(true);
    expect(new Set(candidates.map(candidate => `${candidate.x},${candidate.y}`)).size).toBe(8);
  });
  it('supports large tokens without placing the crystal inside their footprint', () => {
    const target = { x: 400, y: 300, w: 300, h: 200 };
    const candidates = adjacentSquares(target, 100);
    expect(candidates).toHaveLength(14);
    expect(candidates.every(candidate => !rectanglesOverlap(candidate, target))).toBe(true);
    expect(rectanglesOverlap(candidates[0], { ...candidates[0] })).toBe(true);
  });
  it('expires after the next target turn, not the current target turn or the next global turn', () => {
    expect(nextTargetRound(3, 1, 3)).toBe(3);
    expect(nextTargetRound(3, 3, 1)).toBe(4);
    expect(nextTargetRound(3, 2, 2)).toBe(4);
    expect(nextTargetRound(0, 0, 0)).toBe(1);
  });
});

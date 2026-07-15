import { describe, expect, it } from 'bun:test';
import { hasCompleteNormalizedCropRect } from '../tokenCrop';

describe('hasCompleteNormalizedCropRect', () => {
  it('accepts a complete finite normalized rectangle', () => {
    expect(hasCompleteNormalizedCropRect({ left: 0.1, top: 0.2, width: 0.5, height: 0.6 })).toBe(true);
  });

  it('rejects missing, non-finite, negative, and over-one coordinates', () => {
    expect(hasCompleteNormalizedCropRect({ left: 0, top: 0, width: 1 })).toBe(false);
    expect(hasCompleteNormalizedCropRect({ left: 0, top: 0, width: Number.NaN, height: 1 })).toBe(false);
    expect(hasCompleteNormalizedCropRect({ left: -0.1, top: 0, width: 1, height: 1 })).toBe(false);
    expect(hasCompleteNormalizedCropRect({ left: 0, top: 0, width: 1.1, height: 1 })).toBe(false);
  });
});

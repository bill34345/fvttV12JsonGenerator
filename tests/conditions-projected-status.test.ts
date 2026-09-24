import { describe, expect, it } from 'bun:test';
import { CUSTOM_CONDITION_IDS, CUSTOM_CONDITIONS_MODULE_ID, projectedConditionStatusId } from '@fvtt-json-generator/contracts/conditions';

describe('projected custom condition status IDs', () => {
  it('gives all nineteen semantic conditions distinct module-owned status IDs', () => {
    const projected = CUSTOM_CONDITION_IDS.map(projectedConditionStatusId);
    expect(new Set(projected).size).toBe(CUSTOM_CONDITION_IDS.length);
    expect(projected).toEqual(CUSTOM_CONDITION_IDS.map((id) => `${CUSTOM_CONDITIONS_MODULE_ID}.${id}`));
    for (const nativeId of ['bleeding', 'burning', 'dazed']) {
      expect(projected).not.toContain(nativeId);
    }
  });
});

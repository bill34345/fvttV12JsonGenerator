import { describe, it, expect } from 'bun:test';
import { normalizeActor } from '../normalization';

describe('Normalization', () => {
  it('should remove volatile fields', () => {
    const input = {
      _id: '123',
      name: 'Test',
      sort: 1000,
      ownership: { default: 0 },
      items: [
        { _id: 'abc', name: 'Item', sort: 100 }
      ]
    };
    
    const output = normalizeActor(input);
    expect(output._id).toBeUndefined();
    expect(output.sort).toBeUndefined();
    expect(output.ownership).toBeUndefined();
    expect(output.name).toBe('Test');
    expect(output.items[0]._id).toBeUndefined();
    expect(output.items[0].sort).toBeUndefined();
  });

  it('should sort items by name', () => {
    const input = {
      items: [
        { name: 'B' },
        { name: 'A' }
      ]
    };
    const output = normalizeActor(input);
    expect(output.items[0].name).toBe('A');
    expect(output.items[1].name).toBe('B');
  });
});

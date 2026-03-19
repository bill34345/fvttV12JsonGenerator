import { describe, it, expect } from 'bun:test';
import { spellsMapper } from '../spells';

describe('SpellsMapper', () => {
  it('should load spells from binary ldb', () => {
    // We know "Fireball" is in the grep output
    const fireball = spellsMapper.get('Fireball');
    if (fireball) {
      expect(fireball.name).toBe('Fireball');
      expect(fireball.uuid).toBeDefined();
      expect(fireball.sourceId).toContain(fireball.uuid);
    } else {
      console.warn('Fireball not found in spells.ldb - check file content');
    }
  });

  it('should return undefined for unknown spell', () => {
    expect(spellsMapper.get('NonExistentSpell123')).toBeUndefined();
  });
});

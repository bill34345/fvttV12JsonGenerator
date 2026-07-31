import { describe, expect, test } from 'bun:test';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import {
  RESOLVER_MODULE_ID,
  validatePortableSpellManifest,
  validatePortableSpellManifestStructure,
  type PortableSpellManifest,
} from '..';

const source = 'At will: mage armor (self only).';

function manifest(): PortableSpellManifest {
  const quote = 'mage armor';
  const start = source.indexOf(quote);
  return {
    schemaVersion: 1,
    manifestId: 'contract-package-test',
    sourceSha256: sha256(source),
    rulesPreference: '2024',
    spellcastingGroups: [{
      groupId: 'at-will',
      featureItemKey: 'innate-spellcasting',
      ability: 'cha',
      spellRefs: [{
        refId: 'mage-armor',
        identifier: 'mage-armor',
        originalName: 'Mage Armor',
        aliases: [],
        method: 'at-will',
        restrictions: [],
        evidence: [{ start, end: start + quote.length, quote }],
      }],
    }],
  };
}

describe('portable spell manifest package boundary', () => {
  test('validates a source-backed portable manifest without resolver runtime code', () => {
    const value = manifest();
    expect(RESOLVER_MODULE_ID).toBe('fvtt-json-generator-spell-resolver');
    expect(validatePortableSpellManifest(value, source)).toEqual({ ok: true, value });
  });

  test('rejects destination-world identifiers structurally', () => {
    const value = structuredClone(manifest());
    value.spellcastingGroups[0]!.spellRefs[0]!.originalName = 'Actor.abcdefghijklmnop';

    const result = validatePortableSpellManifestStructure(value);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected structural validation to fail.');
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'FORBIDDEN_TARGET_WORLD_IDENTIFIER',
      path: '/spellcastingGroups/0/spellRefs/0/originalName',
    }));
  });
});

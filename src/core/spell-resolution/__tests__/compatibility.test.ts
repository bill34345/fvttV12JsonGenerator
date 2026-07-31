import { describe, expect, test } from 'bun:test';
import {
  FORBIDDEN_TARGET_WORLD_IDENTIFIER,
  findForbiddenTargetWorldIdentifiers,
} from '../forbidden-target-identifier';
import { listUnknownManifestProperties } from '../schema';
import { sha256 } from '../sha256';
import { RESOLVER_MODULE_ID } from '../types';
import { validatePortableSpellManifestStructure } from '../validator';

describe('legacy spell contract import adapters', () => {
  test('remain behaviorally linked to the workspace packages', () => {
    expect(RESOLVER_MODULE_ID).toBe('fvtt-json-generator-spell-resolver');
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(listUnknownManifestProperties({ future: true })).toEqual([
      { key: 'future', path: '/future' },
    ]);
    expect(findForbiddenTargetWorldIdentifiers('Actor.abcdefghijklmnop')).toEqual([
      {
        code: FORBIDDEN_TARGET_WORLD_IDENTIFIER,
        path: '/',
        match: 'Actor.abcdefghijklmnop',
      },
    ]);
    expect(validatePortableSpellManifestStructure({}).ok).toBe(false);
  });
});

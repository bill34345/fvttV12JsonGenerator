import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { sha256 } from '../sha256';

describe('browser-safe SHA-256', () => {
  test.each([
    '',
    'abc',
    '鼠神邪术师 / 2024-first',
    JSON.stringify({ z: [3, 2, 1], a: { ü: true } }),
  ])('matches Node crypto for UTF-8 input %#', (value) => {
    expect(sha256(value)).toBe(createHash('sha256').update(value).digest('hex'));
  });

  test('matches the published abc vector and accepts bytes', () => {
    expect(sha256(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

import { sha256 } from '@fvtt-json-generator/contracts/hash';

export function createHash(algorithm: string): {
  update(value: string | Uint8Array): { digest(format: 'hex'): string };
} {
  if (algorithm !== 'sha256') throw new TypeError(`Unsupported browser hash algorithm: ${algorithm}`);
  let input: string | Uint8Array = '';
  return {
    update(value: string | Uint8Array) {
      input = value;
      return { digest: (format: 'hex') => format === 'hex' ? sha256(input) : sha256(input) };
    },
  };
}

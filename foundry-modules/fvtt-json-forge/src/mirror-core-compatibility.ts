/** Reviewed Mirror Core builds; system, authority and artifact identity are checked separately. */
export function isForgeCoreVersionSupported(value: unknown): value is '14.364' | '14.368' {
  return value === '14.364' || value === '14.368';
}

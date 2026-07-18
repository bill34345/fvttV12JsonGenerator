/**
 * Schema-derived identity normalization for spell metadata.
 *
 * This deliberately performs no translation, stemming, or semantic inference.
 * NFKC folds Unicode width, then whitespace/punctuation are removed and only
 * ASCII A-Z case is folded.
 */
export function normalizeSpellIdentity(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
    .replace(/[\p{White_Space}\p{Punctuation}]/gu, '');
}

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

/** Candidate-side identity only. A complete Chinese display name is an exact
 * alias only when its complete English side independently confirms this same
 * candidate's existing identifier. No translation or substring is inferred. */
export function localizedSpellCandidateAlias(name: string, identifier: string | undefined): string | undefined {
  if (!identifier) return;
  const visible = name.normalize('NFKC').trim();
  const match = /^(.+?)\s*(?:\(\s*([A-Za-z][A-Za-z0-9\s'’:\-–—&.,]*)\s*\)|([A-Za-z][A-Za-z0-9\s'’:\-–—&.,]*))$/u.exec(visible);
  if (!match) return;
  const localized = match[1]!.trim(), english = (match[2] ?? match[3])!.trim();
  if (!/\p{Script=Han}/u.test(localized) || !/^[\p{Script=Han}\p{N}\p{White_Space}·・'’\-–—]+$/u.test(localized)) return;
  return normalizeSpellIdentity(english) === normalizeSpellIdentity(identifier) ? localized : undefined;
}

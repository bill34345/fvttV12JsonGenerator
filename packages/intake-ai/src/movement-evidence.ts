import type { EvidenceRef } from './types';

const MOVEMENT_PATHS = new Set(['/creature/attributes/movement', '/creature/attributes/movement/fly', '/creature/attributes/movement/hover']);
// Fullwidth decimal presentation has the same meaning while direct matching
// preserves the exact original UTF-16 evidence span.
const POSITIVE_HOVER = /(?:(?:\bfly|ﬂy)(?:ing)?\b|飞行)\s*[:：]?\s*[\d０-９]+(?:[.．][\d０-９]+)?\s*(?:ft\.?|feet|尺)[\s\S]{0,40}[(（]\s*(?:hover(?:ing)?|悬停|悬浮)\s*[)）]/iu;
const SECTION_BOUNDARY = /(?:^|\n)\s*(?:Traits|Actions|Bonus Actions|Reactions|Legendary Actions|Mythic Actions|特性|动作|附赠动作|反应|传奇动作|神话动作)\s*(?:\r?\n|$)/iu;

/** Recover only a positive movement qualifier proven by exact, nearby references in this candidate. */
export function explicitMovementHoverEvidence(
  source: string,
  claims: unknown,
  scope: { start: number; end: number } = { start: 0, end: source.length },
): EvidenceRef | undefined {
  if (!Array.isArray(claims) || !Number.isInteger(scope.start) || !Number.isInteger(scope.end)
    || scope.start < 0 || scope.end > source.length || scope.start >= scope.end) return undefined;
  const refs = claims.filter(claim => claim && MOVEMENT_PATHS.has(claim.path) && Array.isArray(claim.evidence))
    .flatMap(claim => claim.evidence)
    .filter((ref): ref is EvidenceRef => Boolean(ref) && Number.isInteger(ref.start) && Number.isInteger(ref.end)
      && ref.start >= scope.start && ref.end <= scope.end && ref.start < ref.end
      && typeof ref.quote === 'string' && source.slice(ref.start, ref.end) === ref.quote)
    .sort((left, right) => left.start - right.start);
  const spans: Array<{ start: number; end: number }> = [];
  for (const ref of refs) {
    const previous = spans.at(-1);
    // Rejoin short layout gaps with original source bytes, never by inventing quote text.
    if (previous && ref.start <= previous.end + 40) previous.end = Math.max(previous.end, ref.end);
    else spans.push({ start: ref.start, end: ref.end });
  }
  for (const span of spans) {
    const match = POSITIVE_HOVER.exec(source.slice(span.start, span.end));
    if (!match || SECTION_BOUNDARY.test(match[0])) continue;
    const start = span.start + match.index;
    return { start, end: start + match[0].length, quote: match[0] };
  }
  return undefined;
}

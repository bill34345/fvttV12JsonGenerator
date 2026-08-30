import type { DiscoveryCandidate } from './types';

export const INTAKE_LIMITS = {
  maxSourceLength: 200_000,
  maxCreatures: 50,
  maxCandidateLength: 25_000,
  chunkLength: 24_000,
  chunkOverlap: 1_000,
  extractionConcurrency: 2,
} as const;

export function normalizeDiscovery(source: string, candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const valid = candidates.map((candidate, index) => {
    const offsetsValid = Number.isInteger(candidate.start)
      && Number.isInteger(candidate.end)
      && candidate.start >= 0
      && candidate.end > candidate.start
      && candidate.end <= source.length;
    let start = candidate.start;
    let end = candidate.end;
    if (!offsetsValid || source.slice(start, end) !== candidate.quote) {
      const first = typeof candidate.quote === 'string' && candidate.quote.length > 0
        ? source.indexOf(candidate.quote)
        : -1;
      const unique = first >= 0 && source.indexOf(candidate.quote, first + 1) < 0;
      if (!unique) {
        if (!offsetsValid) throw new Error(`Discovery candidate ${index} has invalid source offsets.`);
        throw new Error(`Discovery candidate ${index} quote does not match source offsets and cannot be uniquely anchored.`);
      }
      start = first;
      end = first + candidate.quote.length;
    }
    if (end - start > INTAKE_LIMITS.maxCandidateLength) {
      throw new Error(`Discovery candidate ${index} exceeds ${INTAKE_LIMITS.maxCandidateLength} characters.`);
    }
    return {
      ...candidate,
      start,
      end,
      id: safeId(candidate.id || `monster-${index + 1}`),
      label: candidate.label || `Monster ${index + 1}`,
    };
  }).sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: DiscoveryCandidate[] = [];
  for (const candidate of valid) {
    const previous = merged.at(-1);
    if (previous && candidate.start < previous.end) {
      const overlap = previous.end - candidate.start;
      const ratio = overlap / Math.min(previous.end - previous.start, candidate.end - candidate.start);
      if (ratio >= 0.5) {
        const start = Math.min(previous.start, candidate.start);
        const end = Math.max(previous.end, candidate.end);
        merged[merged.length - 1] = { ...previous, start, end, quote: source.slice(start, end) };
        continue;
      }
      throw new Error(`Discovery candidates overlap ambiguously: ${previous.label} / ${candidate.label}.`);
    }
    merged.push(candidate);
  }
  return merged;
}

export function chunkSource(source: string): Array<{ start: number; end: number; text: string }> {
  if (source.length <= INTAKE_LIMITS.chunkLength) return [{ start: 0, end: source.length, text: source }];
  const chunks = [];
  const step = INTAKE_LIMITS.chunkLength - INTAKE_LIMITS.chunkOverlap;
  for (let start = 0; start < source.length; start += step) {
    const end = Math.min(source.length, start + INTAKE_LIMITS.chunkLength);
    chunks.push({ start, end, text: source.slice(start, end) });
    if (end === source.length) break;
  }
  return chunks;
}

export function partitionDiscoveryCandidates(source: string, candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  return candidates.map((candidate, index) => {
    const start = index === 0 ? 0 : candidate.start;
    const end = candidates[index + 1]?.start ?? source.length;
    if (end <= start) throw new Error(`Discovery candidate ${index} cannot be assigned a non-empty source partition.`);
    if (end - start > INTAKE_LIMITS.maxCandidateLength) {
      throw new Error(`Discovery candidate ${index} partition exceeds ${INTAKE_LIMITS.maxCandidateLength} characters.`);
    }
    return { ...candidate, start, end, quote: source.slice(start, end) };
  });
}

function safeId(value: string): string {
  const safe = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || globalThis.crypto.randomUUID().slice(0, 8);
}

import type { DiscoveryCandidate, DiscoveryRequest, DiscoveryResult, EvidenceRef, IntakeFinding } from './types';

export const INTAKE_LIMITS = {
  maxSourceLength: 200_000,
  maxCreatures: 50,
  maxCandidateLength: 25_000,
  chunkLength: 24_000,
  chunkOverlap: 1_000,
  extractionConcurrency: 2,
} as const;

/** A conservative local envelope, never a guess from a creature's name. The
 * complete source is retained, including preface and trailing definitions. */
export function singleCreatureSourceCandidate(source: string): DiscoveryCandidate | undefined {
  const count = (pattern: RegExp) => [...source.matchAll(pattern)].length;
  const acLines=[...source.matchAll(/^(?:[ \t]*[-*][ \t]+)?\*{0,3}(?:Armor Class|AC|armor_class|护甲等级)\*{0,3}[ \t]*[:：]?[ \t]*\*{0,3}['"]?\d/gimu)];
  if (acLines.length !== 1
    || count(/^(?:[ \t]*[-*][ \t]+)?\*{0,3}(?:Hit Points|HP|hit_points|生命值)\*{0,3}[ \t]*[:：]?[ \t]*\*{0,3}['"]?\d/gimu) !== 1) return undefined;
  if (!/\bspeed\b|速度/iu.test(source) || !/\b(?:challenge|cr)\b|挑战等级/iu.test(source)) return undefined;
  for (const ability of [/\b(?:STR|strength)\b|力量/iu,/\b(?:DEX|dexterity)\b|敏捷/iu,/\b(?:CON|constitution)\b|体质/iu,
    /\b(?:INT|intelligence)\b|智力/iu,/\b(?:WIS|wisdom)\b|感知/iu,/\b(?:CHA|charisma)\b|魅力/iu]) if (!ability.test(source)) return undefined;
  const ac=acLines[0]!.index!;
  const numbered=[...source.matchAll(/^#{1,3}[ \t]+(?:生物[一二三四五六七八九十\d]*|Creature[ \t]+\d+)[ \t]*[:：]/gimu)];
  if (numbered.length > 1 || numbered.some(heading=>heading.index!>ac)) return undefined;
  const frontmatter = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1];
  let label = frontmatter?.match(/^(?:name|名称)[ \t]*:[ \t]*(.+)$/mu)?.[1]?.trim().replace(/^(['"])(.*)\1$/u,'$2');
  const prefix = source.slice(0, ac);
  label ??= [...prefix.matchAll(/^([^\r\n]{1,150}?)\s+CR\s+\d+(?:\/\d+)?\s*$/gimu)].at(-1)?.[1]?.trim();
  label ??= [...prefix.matchAll(/^#{1,3}[ \t]+([^\r\n]+)$/gmu)].at(-1)?.[1]?.trim();
  label=label?.replace(/^#{1,3}[ \t]+/u,'').replace(/^(?:生物[一二三四五六七八九十\d]*|Creature[ \t]+\d+)[ \t]*[:：][ \t]*/iu,'');
  if (!label || /^(?:traits?|actions?|referenced|引用|补充)/iu.test(label)) return undefined;
  return {id:'single-creature',label,start:0,end:source.length,quote:source};
}

export interface ResolvedDiscovery {
  candidates: DiscoveryCandidate[];
  findings: IntakeFinding[];
  unassigned: EvidenceRef[];
}

/** A bad selection remains visible without discarding independently located creatures. */
function locateDiscoveryCandidates(source: string, candidates: DiscoveryCandidate[]): Pick<ResolvedDiscovery, 'candidates' | 'findings'> {
  const findings: IntakeFinding[] = [];
  const valid: DiscoveryCandidate[] = [];
  const add = (code: string, message: string, index: number) => findings.push({
    id: `discovery:${index}:${code}`, code, path: `/discovery/${index}`, message, blocking: false, origin: 'evidence',
  });
  for (const [index, candidate] of candidates.entries()) {
    try { valid.push(locateDiscoveryCandidate(source, candidate, index)); }
    catch (error) { add('DISCOVERY_CANDIDATE_UNLOCATED', error instanceof Error ? error.message : String(error), index); }
  }
  valid.sort((a, b) => a.start - b.start || b.end - a.end);
  const located: DiscoveryCandidate[] = [];
  for (let index = 0; index < valid.length;) {
    const group = [valid[index++]!];
    let end = group[0]!.end;
    while (index < valid.length && valid[index]!.start < end) {
      const next = valid[index++]!;
      group.push(next); end = Math.max(end, next.end);
    }
    const first = group[0]!;
    if (group.length > 1 && !group.every(candidate => candidate.start === first.start && candidate.end === first.end)) {
      add('DISCOVERY_OVERLAP_UNRESOLVED', `Discovery selections overlap: ${group.map(candidate => candidate.label).join(' / ')}. Their source remains unassigned.`, index - group.length);
      continue;
    }
    located.push({ ...first, end, quote: source.slice(first.start, end) });
  }
  const ids = new Set<string>();
  for (const candidate of located) {
    const base = candidate.id; let suffix = 2;
    while (ids.has(candidate.id)) candidate.id = `${base}-${suffix++}`;
    ids.add(candidate.id);
  }
  return { candidates: located, findings };
}

export function resolveDiscoveryCandidates(source: string, candidates: DiscoveryCandidate[], priorFindings: readonly IntakeFinding[] = []): ResolvedDiscovery {
  const located = locateDiscoveryCandidates(source, candidates);
  located.findings.unshift(...priorFindings);
  const resolved = located.findings.length ? located.candidates : partitionDiscoveryCandidates(source, located.candidates);
  const unassigned: EvidenceRef[] = [];
  let cursor = 0;
  for (const candidate of resolved) {
    if (candidate.start > cursor && source.slice(cursor, candidate.start).trim()) {
      unassigned.push({ start: cursor, end: candidate.start, quote: source.slice(cursor, candidate.start) });
    }
    cursor = candidate.end;
  }
  if (cursor < source.length && source.slice(cursor).trim()) unassigned.push({ start: cursor, end: source.length, quote: source.slice(cursor) });
  return { candidates: resolved, findings: located.findings, unassigned };
}

export function normalizeDiscovery(source: string, candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  return locateDiscoveryCandidates(source, candidates).candidates;
}

function locateDiscoveryCandidate(source: string, candidate: DiscoveryCandidate, index: number): DiscoveryCandidate {
  if (!candidate || typeof candidate !== 'object') throw new Error(`Discovery candidate ${index} is not a source selection.`);
  const offsetsValid = Number.isInteger(candidate.start) && Number.isInteger(candidate.end)
    && candidate.start >= 0 && candidate.end > candidate.start && candidate.end <= source.length;
  let start = candidate.start, end = candidate.end;
  if (!offsetsValid || source.slice(start, end) !== candidate.quote) {
    const quote = typeof candidate.quote === 'string' ? candidate.quote : '';
    let first = quote ? source.indexOf(quote) : -1;
    let anchoredEnd = first + quote.length;
    let unique = first >= 0 && source.indexOf(quote, first + 1) < 0;
    if (!unique && quote) {
      const target = quote.replace(/\s+/gu, ' ').trim();
      const rawOffsets: number[] = [], rawEnds: number[] = [], characters: string[] = [];
      for (let offset = 0; offset < source.length;) {
        const from = offset;
        if (/\s/u.test(source[offset]!)) {
          while (offset < source.length && /\s/u.test(source[offset]!)) offset++;
          characters.push(' ');
        } else { characters.push(source[offset]!); offset++; }
        rawOffsets.push(from); rawEnds.push(offset);
      }
      const normalized = characters.join(''), at = target ? normalized.indexOf(target) : -1;
      if (at >= 0 && normalized.indexOf(target, at + 1) < 0) {
        const from = /^\s/u.test(quote) && normalized[at - 1] === ' ' ? at - 1 : at;
        const tail = at + target.length - 1;
        const through = /\s$/u.test(quote) && normalized[tail + 1] === ' ' ? tail + 1 : tail;
        first = rawOffsets[from]!; anchoredEnd = rawEnds[through]!; unique = true;
      }
    }
    if (!unique) throw new Error(`Discovery candidate ${index} cannot be uniquely located in the original source.`);
    start = first; end = anchoredEnd;
  }
  return { ...candidate, start, end, id: safeId(typeof candidate.id === 'string' ? candidate.id : `monster-${index + 1}`),
    label: typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label : `Monster ${index + 1}`, quote: source.slice(start, end) };
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
    return { ...candidate, start, end, quote: source.slice(start, end) };
  });
}

interface DiscoverySourceLine { id:string; text:string; start:number; end:number }

/** Source positions and exact text belong to the program. The model only
 * selects supplied line IDs; it never has to copy a statblock or count text. */
function discoverySourceLines(request:DiscoveryRequest):DiscoverySourceLine[]{
  const {source,chunkStart,chunkEnd}=request;
  if(typeof source!=='string'||!Number.isInteger(chunkStart)||!Number.isInteger(chunkEnd)
    ||chunkStart<0||chunkEnd<chunkStart||chunkEnd>source.length)
    throw new Error('Invalid discovery source chunk.');
  const lines:DiscoverySourceLine[]=[];
  let start=chunkStart;
  while(start<chunkEnd){
    let textEnd=start;
    while(textEnd<chunkEnd&&source[textEnd]!=='\n'&&source[textEnd]!=='\r')textEnd++;
    let end=textEnd;
    if(end<chunkEnd){
      end++;
      if(source[textEnd]==='\r'&&end<chunkEnd&&source[end]==='\n')end++;
    }
    lines.push({id:`L${lines.length+1}`,text:source.slice(start,textEnd),start,end});
    start=end;
  }
  return lines;
}

export function discoveryLinePayload(request:DiscoveryRequest):{
  sourceSha256:string; sourceLines:Array<{id:string;text:string}>;
}{
  return {sourceSha256:request.sourceSha256,sourceLines:discoverySourceLines(request).map(({id,text})=>({id,text}))};
}

export function materializeDiscoveryLines(request: DiscoveryRequest, value: unknown): DiscoveryResult {
  const result = value as Record<string, unknown> | null;
  const entries = result && typeof result === 'object' && Array.isArray(result.candidates) ? result.candidates : [];
  const lines = new Map(discoverySourceLines(request).map(line => [line.id, line]));
  const candidates: DiscoveryCandidate[] = [], findings: IntakeFinding[] = [];
  for (const [index, entry] of entries.entries()) {
    const item = entry as Record<string, unknown> | null;
    const first = item && typeof item.firstLineId === 'string' ? lines.get(item.firstLineId) : undefined;
    const last = item && typeof item.lastLineId === 'string' ? lines.get(item.lastLineId) : undefined;
    if (!first || !last || first.start > last.start || !request.source.slice(first.start, last.end).trim()) {
      findings.push({ id: `discovery-lines:${index}`, code: 'DISCOVERY_SOURCE_LINES_UNLOCATED', path: `/discovery/${index}`,
        message: `Discovery selection ${index + 1} has unknown, reversed or empty source lines; its original source remains available.`, blocking: false, origin: 'evidence' });
      continue;
    }
    candidates.push({ id: typeof item!.id === 'string' && item!.id.trim() ? item!.id : `monster-${index + 1}`,
      label: typeof item!.label === 'string' && item!.label.trim() ? item!.label : `Monster ${index + 1}`,
      start: first.start, end: last.end, quote: request.source.slice(first.start, last.end) });
  }
  if (!entries.length) findings.push({ id: 'discovery-lines:empty', code: 'DISCOVERY_NO_SELECTION', path: '/discovery',
    message: 'The discovery answer did not locate a creature; the complete source remains available.', blocking: false, origin: 'evidence' });
  return { schemaVersion: 1, candidates, ...(findings.length ? { findings } : {}) };
}

function safeId(value: string): string {
  const safe = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || globalThis.crypto.randomUUID().slice(0, 8);
}

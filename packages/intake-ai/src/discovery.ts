import type { DiscoveryCandidate, DiscoveryRequest, DiscoveryResult } from './types';

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
  if (source.length > INTAKE_LIMITS.chunkLength) return undefined;
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
  if (!label || label.length > 160 || /^(?:traits?|actions?|referenced|引用|补充)/iu.test(label)) return undefined;
  return {id:'single-creature',label,start:0,end:source.length,quote:source};
}

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
      let first = typeof candidate.quote === 'string' && candidate.quote.length > 0
        ? source.indexOf(candidate.quote)
        : -1;
      let anchoredEnd = first + candidate.quote.length;
      let unique = first >= 0 && source.indexOf(candidate.quote, first + 1) < 0;
      if (!unique && typeof candidate.quote === 'string') {
        // Only whitespace runs may differ. Keep token separators, numbers,
        // punctuation and negation exact; return the untouched source slice.
        const target=candidate.quote.replace(/\s+/gu,' ').trim();
        const rawOffsets:number[]=[];const rawEnds:number[]=[];const characters:string[]=[];
        for(let offset=0;offset<source.length;){
          const start=offset;
          if(/\s/u.test(source[offset]!)){
            while(offset<source.length&&/\s/u.test(source[offset]!))offset++;
            characters.push(' ');
          }else{characters.push(source[offset]!);offset++;}
          rawOffsets.push(start);rawEnds.push(offset);
        }
        const normalized=characters.join('');
        const at=target?normalized.indexOf(target):-1;
        if(at>=0&&normalized.indexOf(target,at+1)<0){
          const from=/^\s/u.test(candidate.quote)&&normalized[at-1]===' '?at-1:at;
          const tail=at+target.length-1;
          const through=/\s$/u.test(candidate.quote)&&normalized[tail+1]===' '?tail+1:tail;
          first=rawOffsets[from]!;anchoredEnd=rawEnds[through]!;unique=true;
        }
      }
      if (!unique) {
        if (!offsetsValid) throw new Error(`Discovery candidate ${index} has invalid source offsets.`);
        throw new Error(`Discovery candidate ${index} quote does not match source offsets and cannot be uniquely anchored.`);
      }
      start = first;
      end = anchoredEnd;
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
      quote: source.slice(start,end),
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

interface DiscoverySourceLine { id:string; text:string; start:number; end:number }

/** Source positions and exact text belong to the program. The model only
 * selects supplied line IDs; it never has to copy a statblock or count text. */
function discoverySourceLines(request:DiscoveryRequest):DiscoverySourceLine[]{
  const {source,chunkStart,chunkEnd}=request;
  if(typeof source!=='string'||!Number.isInteger(chunkStart)||!Number.isInteger(chunkEnd)
    ||chunkStart<0||chunkEnd<chunkStart||chunkEnd>source.length||chunkEnd-chunkStart>INTAKE_LIMITS.chunkLength)
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

export function materializeDiscoveryLines(request:DiscoveryRequest,value:unknown):DiscoveryResult{
  const result=value as Record<string,unknown>|null;
  if(!result||typeof result!=='object'||result.schemaVersion!==1||!Array.isArray(result.candidates)
    ||result.candidates.length>INTAKE_LIMITS.maxCreatures)throw new Error('Invalid discovery line selection.');
  const lines=new Map(discoverySourceLines(request).map(line=>[line.id,line]));
  const candidates=result.candidates.map((entry:unknown)=>{
    const item=entry as Record<string,unknown>|null;
    if(!item||typeof item!=='object'||Array.isArray(item)
      ||typeof item.id!=='string'||!item.id.trim()||item.id.length>160
      ||typeof item.label!=='string'||!item.label.trim()||item.label.length>160
      ||typeof item.firstLineId!=='string'||typeof item.lastLineId!=='string'
      ||['start','end','quote'].some(key=>Object.hasOwn(item,key)))throw new Error('Invalid discovery line selection.');
    const first=lines.get(item.firstLineId),last=lines.get(item.lastLineId);
    if(!first||!last||first.start>last.start)throw new Error('Unknown or reversed discovery source lines.');
    const quote=request.source.slice(first.start,last.end);
    if(!quote.trim())throw new Error('Empty discovery source selection.');
    return {id:item.id,label:item.label,start:first.start,end:last.end,quote};
  });
  return {schemaVersion:1,candidates};
}

function safeId(value: string): string {
  const safe = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || globalThis.crypto.randomUUID().slice(0, 8);
}

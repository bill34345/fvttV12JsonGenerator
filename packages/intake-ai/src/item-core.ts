import { DND5E_V14_SYSTEM_VERSION } from '@fvtt-json-generator/contracts/target';
import { itemRandomSummonAppendixLength, resolveFormalItemCategory } from '@fvtt-json-generator/models/item';
import { exactChargedSpellOption, sourceChargedSpellOptions, spellCastingTiming, spellUsesCasterSaveDc } from './item-charged-spell-evidence';
import { sourcePassiveResistanceEvidence } from './item-p1-evidence';
import { ITEM_ACTIVATION_TYPES } from './item-types';
import type {
  ItemIntakeAbility,
  ItemIntakeCoverage,
  ItemDiscoveryCandidate,
  ItemIntakeIR,
} from './item-types';

export { chargedSpellNameKey, sourceChargedSpellOptions } from './item-charged-spell-evidence';

export interface ItemCoreSpellResolver {
  resolveSpell(identifier: string, name: string): { identifier: string; name: string; level?: number; castingTime?: { type: string; value: number | null } } | undefined;
  resolveActivation(identifier: string, name: string): string | undefined;
}

export function normalizeItemCandidates(source: string, candidates: unknown[]): ItemDiscoveryCandidate[] {
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate): ItemDiscoveryCandidate[] => {
    const value = structuredClone(candidate) as ItemDiscoveryCandidate;
    if (typeof value?.id !== 'string' || typeof value.label !== 'string' || typeof value.quote !== 'string' || !value.quote) return [];
    if (Number.isInteger(value.start) && Number.isInteger(value.end)
      && value.start >= 0 && value.end > value.start && value.end <= source.length
      && source.slice(value.start, value.end) === value.quote) return [value];

    const firstStart = source.indexOf(value.quote);
    if (firstStart < 0 || source.indexOf(value.quote, firstStart + value.quote.length) >= 0) return [];
    value.start = firstStart;
    value.end = firstStart + value.quote.length;
    return [value];
  }).sort((left, right) => left.start - right.start || left.end - right.end).map((candidate, index, sorted) => {
    const trailing = source.slice(candidate.end, sorted[index + 1]?.start ?? source.length);
    const length = itemRandomSummonAppendixLength(candidate.quote, trailing);
    if (!length) return candidate;
    const end = candidate.end + length;
    return { ...candidate, end, quote: source.slice(candidate.start, end) };
  });
}

export function itemCandidateBoundaryIssue(
  source: string,
  candidates: ItemDiscoveryCandidate[],
): { code: string; message: string } | undefined {
  const ids = new Set<string>();
  let end = -1;
  for (const candidate of candidates) {
    if (ids.has(candidate.id)) return { code: 'DISCOVERY_DUPLICATE_ID', message: `Discovery returned duplicate Item id ${candidate.id}.` };
    if (candidate.start < 0 || candidate.end <= candidate.start || candidate.end > source.length || candidate.start < end) {
      return { code: 'DISCOVERY_AMBIGUOUS_BOUNDARY', message: 'Item candidates overlap or do not form distinct source boundaries.' };
    }
    ids.add(candidate.id);
    end = candidate.end;
  }
  return undefined;
}

/** Canonicalize only mechanically derivable drift; ambiguous evidence remains unchanged and blocking. */
export function normalizeItemIntakeIR(
  source: string,
  candidate: ItemDiscoveryCandidate,
  initial: ItemIntakeIR,
  resolver: ItemCoreSpellResolver,
): ItemIntakeIR {
  const next = structuredClone(initial);
  if (next.source) next.source.length = source.length;
  if (Array.isArray(next.item?.stages)) {
    next.item.stages = next.item.stages.map((stage) => ({
      ...stage,
      evidence: normalizeEvidenceRefs(source, candidate, stage.evidence),
    }));
  }
  if (Array.isArray(next.item?.abilities)) {
    const chargedOptions = sourceChargedSpellOptions(candidate);
    next.item.abilities = next.item.abilities.map((ability) => {
      if (!ability || typeof ability !== 'object' || Array.isArray(ability)) return ability;
      const normalized = {
        ...ability,
        evidence: normalizeEvidenceRefs(source, candidate, (ability as any).evidence),
      } as ItemIntakeAbility;
      if (normalized.kind === 'container') {
        for (const key of ['count', 'weight', 'volume', 'itemWeight'] as const) {
          if (normalized[key] === null) delete normalized[key];
        }
      }
      if (normalized.kind === 'spell-scroll') {
        if (normalized.level === null) delete normalized.level;
        if (normalized.spell === null) delete normalized.spell;
      }
      if (normalized.kind === 'light' && Array.isArray(normalized.evidence)) {
        const radii = deriveLightRadii(normalized.evidence.map((ref) => ref.quote).join('\n'));
        if (radii) Object.assign(normalized, radii);
      }
      if (normalized.kind === 'passive-resistance') {
        const cited = sourcePassiveResistanceEvidence(candidate, normalized.damageType);
        if (cited) normalized.evidence = [cited];
      }
      if (normalized.kind === 'spell') {
        for (const key of ['activityUses', 'level', 'saveDc', 'maxCharges', 'activationOverride'] as const) {
          if (normalized[key] === null) delete normalized[key];
        }
        if (Object.is(normalized.activationOverride, false)) delete normalized.activationOverride;
        const spell = normalized.spell;
        if (spell && typeof spell === 'object' && !Array.isArray(spell)
          && typeof spell.identifier === 'string' && typeof spell.name === 'string') {
          const resolved = resolver.resolveSpell(spell.identifier, spell.name);
          if (resolved) {
            normalized.spell = { identifier: resolved.identifier, name: resolved.name };
            const option = exactChargedSpellOption(chargedOptions, normalized);
            if (option && spellUsesCasterSaveDc(option, candidate.quote)) delete normalized.saveDc;
            if (option?.fixedChargeCost) delete normalized.maxCharges;
            if (normalized.activationOverride === undefined && option) {
              const text = Array.isArray(normalized.evidence) ? normalized.evidence.map(ref => ref?.quote ?? '').join('\n') : '';
              const timing = spellCastingTiming(text, option);
              const canonical = resolver.resolveActivation(resolved.identifier, resolved.name);
              const activation = ITEM_ACTIVATION_TYPES.find(type => type === canonical);
              if (activation && !timing.unsupported && timing.activations.size === 0) normalized.activation = activation;
            }
            if (option?.scaling?.extraCharge === 1 && option.cost !== undefined && resolved.level !== undefined) {
              const baseLevel = normalized.level ?? resolved.level;
              normalized.level ??= baseLevel;
              normalized.maxCharges ??= option.cost + option.scaling.maxLevel - baseLevel;
            }
          }
        }
      }
      if (normalized.kind === 'attack' || normalized.kind === 'save' || normalized.kind === 'utility' || normalized.kind === 'heal') {
        for (const key of ['name', 'englishName', 'range', 'target', 'ability', 'toHit', 'scaleMax', 'duration', 'trigger'] as const) {
          const fields = normalized as unknown as Record<string, unknown>;
          if (fields[key] === null) delete fields[key];
        }
        if (normalized.kind !== 'heal' && normalized.target) {
          if (normalized.target.special === null) delete normalized.target.special;
          if (normalized.kind === 'utility' && normalized.target.template === null) delete normalized.target.template;
        }
        if ((normalized.kind === 'attack' || normalized.kind === 'save') && Array.isArray(normalized.damage)) {
          for (const part of normalized.damage) if (part?.scaling === null) delete part.scaling;
        }
      }
      return normalized;
    }) as ItemIntakeAbility[];
  }
  if (Array.isArray(next.claims)) {
    next.claims = next.claims.map((claim) => ({
      ...claim,
      evidence: normalizeEvidenceRefs(source, candidate, claim.evidence),
    }));
    restoreItemCategoryCitation(source, candidate, next);
  }
  if (Array.isArray(next.uncertainties)) {
    next.uncertainties = next.uncertainties.map((uncertainty) => ({
      ...uncertainty,
      evidence: normalizeEvidenceRefs(source, candidate, uncertainty.evidence),
    }));
    next.uncertainties = next.uncertainties.map((uncertainty, index) => {
      const ability = spellAbilityForActivationPath(next.item.abilities, uncertainty.path);
      const spell = ability?.kind === 'spell' ? (ability as any).spell : undefined;
      if (uncertainty.blocking && (uncertainty.code === 'UNSPECIFIED_ACTIVATION' || uncertainty.code === 'UNSUPPORTED_ACTIVATION')
        && ability?.kind === 'spell'
        && spell && typeof spell === 'object' && !Array.isArray(spell)
        && typeof spell.identifier === 'string' && typeof spell.name === 'string'
        && resolver.resolveActivation(spell.identifier, spell.name) === ability.activation) {
        return {
          ...uncertainty,
          id: `DERIVED_SPELL_ACTIVATION:${uncertainty.path}:${index}`,
          code: 'DERIVED_SPELL_ACTIVATION',
          blocking: false,
          message: `Spell activation ${ability.activation} is derived from the uniquely resolved locked dnd5e ${DND5E_V14_SYSTEM_VERSION} spell record; source prose did not repeat the casting time.`,
        };
      }
      return uncertainty;
    });
  }
  if (Array.isArray(next.claims) && Array.isArray(next.item?.abilities)) {
    const claimPaths = new Set(next.claims.map((claim) => claim.path));
    for (const ability of next.item.abilities) {
      if (!ability || typeof ability !== 'object' || Array.isArray(ability) || typeof (ability as any).id !== 'string') continue;
      const path = `/item/abilities/${ability.id}`;
      if (claimPaths.has(path)) continue;
      next.claims.push({ path, valueKind: 'explicit', value: ability.kind, evidence: ability.evidence });
      claimPaths.add(path);
    }
  }
  if (Array.isArray(next.coverage)) next.coverage = normalizeCoverage(source, candidate, next.coverage);
  return next;
}

export function itemCategoryOnLine(line: string) {
  const label = (line.match(/^(?:[^,，(（]|\([^)]*\)|（[^）]*）)+/u)?.[0] ?? '').replace(/^\s*[*_#]+|[*_]+\s*$/gu, '').trim();
  return resolveFormalItemCategory(label);
}

function restoreItemCategoryCitation(source: string, candidate: ItemDiscoveryCandidate, ir: ItemIntakeIR): void {
  const claim = ir.claims.find(entry => entry.path === '/item/type');
  if (!claim || !Array.isArray(claim.evidence)) return;
  const category = typeof ir.item?.type === 'string' ? resolveFormalItemCategory(ir.item.type) : undefined;
  const [, metadata] = [...candidate.quote.matchAll(/^[^\r\n]*\S[^\r\n]*$/gmu)];
  if (!category || !metadata) return;
  const quote = metadata[0];
  const cited = itemCategoryOnLine(quote);
  if (cited?.type !== category.type || cited.subtype !== category.subtype) return;
  claim.evidence = claim.evidence.map(ref => {
    if (!isEvidenceRef(ref) || (ref.start >= candidate.start && ref.end <= candidate.end
      && source.slice(ref.start, ref.end) === ref.quote)) return ref;
    const repeatedLabel = itemCategoryOnLine(ref.quote);
    if (repeatedLabel?.type !== category.type || repeatedLabel.subtype !== category.subtype
      || !quote.includes(ref.quote.trim())) return ref;
    const start = candidate.start + metadata.index;
    return { start, end: start + quote.length, quote };
  });
}

export function deriveItemLightRadii(text: string): { bright: number; dim: number } | undefined {
  return deriveLightRadii(text);
}

function deriveLightRadii(text: string): { bright: number; dim: number } | undefined {
  const chinese = text.match(/(\d+)\s*尺(?:半径)?的明亮光照和在此之外\s*(\d+)\s*尺的微光光照/iu);
  if (chinese) {
    const bright = Number(chinese[1]);
    return { bright, dim: bright + Number(chinese[2]) };
  }
  const english = text.match(/(\d+)\s*(?:ft|feet)\b[^.\n]{0,80}?bright(?:\s+light)?[^.\n]{0,80}?outside\s+(\d+)\s*(?:ft|feet)\b[^.\n]{0,40}?dim(?:\s+light)?/iu);
  if (english) {
    const bright = Number(english[1]);
    return { bright, dim: bright + Number(english[2]) };
  }
  return undefined;
}

function spellAbilityForActivationPath(
  abilities: ItemIntakeAbility[],
  path: string,
): Extract<ItemIntakeAbility, { kind: 'spell' }> | undefined {
  const match = /^\/item\/abilities\/([^/]+)\/activation$/u.exec(path);
  if (!match) return undefined;
  const key = match[1]!;
  const ability = Number.isInteger(Number(key)) ? abilities[Number(key)] : abilities.find((entry) => entry.id === key);
  return ability?.kind === 'spell' ? ability : undefined;
}

function normalizeEvidenceRefs(
  source: string,
  candidate: ItemDiscoveryCandidate,
  refs: unknown,
): any[] {
  if (!Array.isArray(refs)) return refs as any[];
  return refs.map((ref) => {
    if (!isEvidenceRef(ref)) return ref;
    const match = findEvidenceMatch(source, candidate, ref, candidate.start);
    return match ? { ...ref, start: match.start, end: match.end, quote: source.slice(match.start, match.end) } : ref;
  });
}

function normalizeCoverage(
  source: string,
  candidate: ItemDiscoveryCandidate,
  coverage: ItemIntakeCoverage[],
): ItemIntakeCoverage[] {
  const normalized: ItemIntakeCoverage[] = [];
  let cursor = candidate.start;
  for (const [index, entry] of coverage.entries()) {
    if (!isEvidenceRef(entry) || typeof entry.classification !== 'string') {
      normalized.push(entry);
      continue;
    }
    const quote = entry.quote.trim();
    if (!quote) {
      if (cursor < candidate.end && /\s/u.test(source[cursor] ?? '')) {
        const end = consumeWhitespace(source, cursor, candidate.end);
        normalized.push({ ...entry, start: cursor, end, quote: source.slice(cursor, end) });
        cursor = end;
      }
      continue;
    }
    const match = findEvidenceMatch(source, candidate, entry, cursor, true)
      ?? narrativeCoverageRange(source, entry, coverage[index + 1], cursor);
    if (!match) {
      normalized.push(entry);
      continue;
    }
    const start = match.start > cursor && source.slice(cursor, match.start).trim() === '' ? cursor : match.start;
    const end = match.end;
    normalized.push({ ...entry, start, end, quote: source.slice(start, end) });
    cursor = end;
  }
  const last = normalized.at(-1);
  if (last?.end === cursor && cursor < candidate.end) {
    const tail = source.slice(cursor, candidate.end).trim();
    // Extend coverage over a closing table delimiter only after matching the row contents verbatim.
    const tableClosure = tail === '|' && coverage.at(-1)?.end === candidate.end
      && /(?:^|\n)[ \t]*\|(?:[ \t]*:?-{3,}:?[ \t]*\|)+[ \t]*\r?\n(?:[ \t]*\|[^\r\n]*\r?\n)*[ \t]*\|[^\r\n]*(?<!\\)\|$/u
        .test(source.slice(candidate.start, candidate.end).trimEnd());
    if (!tail || tableClosure) {
      last.end = candidate.end;
      last.quote = source.slice(last.start, candidate.end);
    } else {
      const trailing = source.slice(cursor, candidate.end);
      const appendixLength = itemRandomSummonAppendixLength(source.slice(candidate.start, cursor), trailing);
      if (appendixLength && !trailing.slice(appendixLength).trim()) {
        normalized.push({
          start: cursor, end: candidate.end, quote: trailing, classification: 'mechanical',
          claimPaths: [], reason: 'Numbered NPC and RollTable bindings verified directly from the source.',
        });
      }
    }
  }
  return normalized;
}

// Coverage describes source slices. Only independent, anchored narrative slices can use their original bytes.
function narrativeCoverageRange(source: string, entry: ItemIntakeCoverage, next: ItemIntakeCoverage | undefined, cursor: number) {
  if (!['narrative', 'ignored-with-reason'].includes(entry.classification)
    || !Array.isArray(entry.claimPaths) || entry.claimPaths.some(path => path !== '/item/stages')
    || entry.start !== cursor || entry.end <= cursor || entry.quote.length !== entry.end - cursor
    || !next || next.start !== entry.end || source.slice(next.start, next.end) !== next.quote) return undefined;
  return { start: cursor, end: entry.end };
}

function findEvidenceMatch(
  source: string,
  candidate: ItemDiscoveryCandidate,
  ref: { start: number; end: number; quote: string },
  minimumStart: number,
  coverage = false,
): { start: number; end: number } | undefined {
  const rangeStart = Math.max(candidate.start, Number.isInteger(minimumStart) ? minimumStart : candidate.start);
  const rangeEnd = candidate.end;
  const exactMatch = chooseEvidenceMatch(findStringMatches(source, ref.quote, rangeStart, rangeEnd), ref);
  if (exactMatch) return exactMatch;
  const trimmed = ref.quote.trim();
  if (!trimmed) return undefined;
  const trimmedMatch = chooseEvidenceMatch(findStringMatches(source, trimmed, rangeStart, rangeEnd), ref);
  if (trimmedMatch) return trimmedMatch;
  const pattern = whitespaceTolerantPattern(trimmed, coverage);
  if (!pattern) return undefined;
  const bounded = source.slice(rangeStart, rangeEnd);
  const matches: Array<{ start: number; end: number }> = [];
  for (const match of bounded.matchAll(new RegExp(pattern, 'gu'))) {
    if (match.index === undefined || !match[0]) continue;
    matches.push({ start: rangeStart + match.index, end: rangeStart + match.index + match[0].length });
  }
  return chooseEvidenceMatch(matches, ref);
}

function findStringMatches(source: string, value: string, start: number, end: number): Array<{ start: number; end: number }> {
  if (!value) return [];
  const matches: Array<{ start: number; end: number }> = [];
  let cursor = Math.max(0, start);
  while (cursor <= end - value.length) {
    const index = source.indexOf(value, cursor);
    if (index < 0 || index + value.length > end) break;
    matches.push({ start: index, end: index + value.length });
    cursor = index + Math.max(1, value.length);
  }
  return matches;
}

function chooseEvidenceMatch(
  matches: Array<{ start: number; end: number }>,
  ref: { start: number; end: number },
): { start: number; end: number } | undefined {
  if (matches.length === 1) return matches[0];
  if (matches.length === 0 || !Number.isInteger(ref.start) || !Number.isInteger(ref.end)) return undefined;
  const ranked = matches
    .map((match) => ({ match, distance: Math.abs(match.start - ref.start) + Math.abs(match.end - ref.end) }))
    .sort((left, right) => left.distance - right.distance);
  if (ranked[0]!.distance <= 4 && ranked[0]!.distance < (ranked[1]?.distance ?? Number.POSITIVE_INFINITY)) return ranked[0]!.match;
  return undefined;
}

function consumeWhitespace(source: string, start: number, end: number): number {
  let cursor = start;
  while (cursor < end && /\s/u.test(source[cursor] ?? '')) cursor += 1;
  return cursor;
}

function whitespaceTolerantPattern(value: string, coverage: boolean): string {
  const parts = value.split(/(\s+)/u);
  return parts.map((part, index) => {
    if (index % 2 === 0) return escapeRegExp(part);
    // The coverage reply may insert a line break between adjacent Chinese sentences.
    if (coverage && /[\r\n]/u.test(part) && /[。！？；]$/u.test(parts[index - 1]!)) return '\\s*';
    return '\\s+';
  }).join('');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function isEvidenceRef(value: unknown): value is { start: number; end: number; quote: string } {
  return Boolean(value) && typeof value === 'object'
    && Number.isInteger((value as any).start)
    && Number.isInteger((value as any).end)
    && typeof (value as any).quote === 'string';
}

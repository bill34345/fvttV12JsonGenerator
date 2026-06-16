import type { Damage } from '../parser/action';

export type EvidenceKind = 'direct' | 'inherited' | 'schema-derived' | 'ai-suggested';

export interface SourceEvidence {
  text: string;
  startOffset: number;
  endOffset: number;
  kind: EvidenceKind;
}

export interface ExtractedSave {
  dc: number;
  ability: string;
  evidence: SourceEvidence;
}

export type HitDiceOutcome =
  | {
      kind: 'hitDiceChange';
      direction: 'lose' | 'gain';
      count: number;
      pool: 'unspent' | 'spent' | 'any';
      target: 'target' | 'failedSaveTarget' | 'self';
      evidence?: SourceEvidence;
    }
  | {
      kind: 'tempHp';
      amount: number;
      target: 'self' | 'target';
      condition?: 'hitDiceChangeApplied';
      evidence?: SourceEvidence;
    }
  | {
      kind: 'followupSave';
      label: string;
      trigger: 'targetHitDiceReducedToZero';
      target: 'target' | 'failedSaveTarget';
      evidence?: SourceEvidence;
    };

export interface ExtractedRider {
  key: string;
  name: string;
  englishName: string;
  text: string;
  evidence: SourceEvidence;
  save?: ExtractedSave;
  damage: Damage[];
  statuses: string[];
  metadata: Record<string, unknown>;
  outcomes: HitDiceOutcome[];
}

export interface CompoundRiderExtraction {
  sharedSave?: ExtractedSave;
  dailyUsePerRider: boolean;
  bloodiedTargetSaveDisadvantage: boolean;
  riders: ExtractedRider[];
  issues: string[];
}

interface ExtractOptions {
  baseDamage?: Damage;
}

const ABILITY_MAP: Record<string, string> = {
  力量: 'str',
  Strength: 'str',
  敏捷: 'dex',
  Dexterity: 'dex',
  体质: 'con',
  Constitution: 'con',
  智力: 'int',
  Intelligence: 'int',
  感知: 'wis',
  Wisdom: 'wis',
  魅力: 'cha',
  Charisma: 'cha',
};

const DAMAGE_TYPE_MAP: Record<string, string> = {
  酸蚀: 'acid',
  钝击: 'bludgeoning',
  冷冻: 'cold',
  寒冷: 'cold',
  火焰: 'fire',
  力场: 'force',
  闪电: 'lightning',
  雷鸣: 'thunder',
  黯蚀: 'necrotic',
  死灵: 'necrotic',
  穿刺: 'piercing',
  毒素: 'poison',
  毒性: 'poison',
  心灵: 'psychic',
  光耀: 'radiant',
  挥砍: 'slashing',
  acid: 'acid',
  bludgeoning: 'bludgeoning',
  cold: 'cold',
  fire: 'fire',
  force: 'force',
  lightning: 'lightning',
  necrotic: 'necrotic',
  piercing: 'piercing',
  poison: 'poison',
  psychic: 'psychic',
  radiant: 'radiant',
  slashing: 'slashing',
  thunder: 'thunder',
};

export function extractCompoundRiderMechanics(
  sourceText: string,
  options: ExtractOptions = {},
): CompoundRiderExtraction {
  const text = sourceText.replace(/\r\n/g, '\n');
  const sharedSave = extractSharedSave(text);
  const dailyUsePerRider = /每次长休[^。\n]*每种[^。\n]*(?:各)?一次|once[^.\n]*each[^.\n]*(?:long|short)\s+rest/i.test(text);
  const bloodiedTargetSaveDisadvantage =
    /(?:重伤|濒血|Bloodied)[\s\S]{0,80}(?:劣势|Disadvantage)/i.test(text);
  const hasCompoundGroupEvidence =
    Boolean(sharedSave) ||
    dailyUsePerRider ||
    bloodiedTargetSaveDisadvantage ||
    hasCompoundRiderGroupCue(text);
  const segments = hasRandomBranchTableCue(text) && !hasCompoundGroupEvidence ? [] : splitRiderSegments(text);
  const riders = segments.map((segment) =>
    extractRider(segment, {
      baseDamage: options.baseDamage,
      sharedSave,
    }),
  );

  return {
    ...(sharedSave ? { sharedSave } : {}),
    dailyUsePerRider,
    bloodiedTargetSaveDisadvantage,
    riders,
    issues: riders.length === 0 ? ['No compound rider segment headers were found.'] : [],
  };
}

function hasCompoundRiderGroupCue(text: string): boolean {
  return /(?:following rider effects?|each of the following rider effects?|以下(?:每种|各)[^。\n]*(?:效果|毒液))/i.test(text);
}

function hasRandomBranchTableCue(text: string): boolean {
  return /(?:roll\s+(?:a\s*)?1?d\d+|one of the following|random(?:ly)?|以下(?:一种|其中一种)[^。\n]*效果|随机)/i.test(text);
}

function splitRiderSegments(text: string): Array<{
  key: string;
  name: string;
  englishName: string;
  text: string;
  startOffset: number;
  endOffset: number;
}> {
  const headerMatches = [
    ...[...text.matchAll(/^(\s*)[-*]\s+\*\*([^*\n]+?)\*\*\s*[:：]/gim)].map((match) => ({
      rawName: match[2]?.trim() ?? '',
      indent: match[1]?.length ?? 0,
      index: match.index ?? 0,
    })),
    ...[...text.matchAll(/^(\s*)(?:[-*]\s*)?([^：:\n]{1,80}\([^)]+\))\s*[:：]/gim)].map((match) => ({
      rawName: match[2]?.trim() ?? '',
      indent: match[1]?.length ?? 0,
      index: match.index ?? 0,
    })),
  ];
  const generic = headerMatches
    .filter((entry, index, entries) =>
      entries.findIndex((candidate) => candidate.index === entry.index && candidate.rawName === entry.rawName) === index,
    )
    .map((entry) => {
      const rawName = entry.rawName;
      const englishName = rawName.match(/\(([^)]+)\)/)?.[1]?.trim() ?? rawName;
      const name = rawName.replace(/\s*\([^)]+\)\s*$/, '').trim() || englishName;
      return {
        key: slugify(englishName || name),
        name,
        englishName,
        indent: entry.indent,
        hasAsciiParenthetical: /\([^)]+\)/.test(rawName),
        index: entry.index,
      };
    })
    .sort((left, right) => left.index - right.index);

  const structuralHeaders = generic.filter((entry) => entry.hasAsciiParenthetical);
  const headerPool = structuralHeaders.length > 0 ? structuralHeaders : generic;
  const minimumIndent = Math.min(...headerPool.map((entry) => entry.indent));
  const selected = headerPool.filter((entry) => entry.indent === minimumIndent);

  if (selected.length > 0) {
    const seenKeys = new Map<string, number>();
    return selected.map((entry, index) => {
      const next = selected[index + 1];
      const endOffset = next?.index ?? text.length;
      const seen = seenKeys.get(entry.key) ?? 0;
      seenKeys.set(entry.key, seen + 1);
      const key = seen === 0 ? entry.key : `${entry.key}-${seen + 1}`;
      return {
        key,
        name: entry.name,
        englishName: entry.englishName,
        text: text.slice(entry.index, endOffset).trim(),
        startOffset: entry.index,
        endOffset,
      };
    });
  }

  if (/(?:Hit Dice?|HD|\u751f\u547d\u9ab0|\u751f\u547d\u9aa8)/i.test(text)) {
    return [{
      key: 'hit-dice-outcome',
      name: 'Hit Dice Outcome',
      englishName: 'Hit Dice Outcome',
      text: text.trim(),
      startOffset: 0,
      endOffset: text.length,
    }];
  }

  return [];
}

function extractRider(
  segment: ReturnType<typeof splitRiderSegments>[number],
  context: { baseDamage?: Damage; sharedSave?: ExtractedSave },
): ExtractedRider {
  const localSave = extractExplicitSave(segment.text);
  const save = localSave ?? inheritSave(context.sharedSave);
  const damage = extractRiderDamage(segment.text, context.baseDamage);
  const statuses = extractStatuses(segment.text);
  const outcomes = extractHitDiceOutcomes(segment.text, Boolean(save));
  const metadata = extractRiderMetadata(segment.text, outcomes);

  return {
    key: segment.key,
    name: segment.name,
    englishName: segment.englishName,
    text: segment.text,
    evidence: evidence(segment.text, segment.startOffset, segment.endOffset, 'direct'),
    ...(save ? { save } : {}),
    damage,
    statuses,
    metadata,
    outcomes,
  };
}

function extractSharedSave(text: string): ExtractedSave | undefined {
  const patterns = [
    /((?:以下|这些|每种|各)[^。\n]*(力量|敏捷|体质|智力|感知|魅力)\s*豁免\s*DC\s*(?:均为|为|是)?\s*\**(\d+)\**)/,
    /((?:Each|All|The following)[^.\n]*(?:DC\s*)\**(\d+)\**\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw)/i,
    /((?:Each|All|The following)[^.\n]*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw\s+DC\s*(\d+))/i,
  ];

  return extractSaveFromPatterns(text, patterns);
}

function extractExplicitSave(text: string): ExtractedSave | undefined {
  const patterns = [
    /((力量|敏捷|体质|智力|感知|魅力)\s*豁免\s*DC\s*(?:为|是)?\s*\**(\d+)\**)/,
    /((?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw\s+DC\s*(\d+))/i,
    /((?:DC\s*)\**(\d+)\**\s*(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw)/i,
    /((?:DC\s*)\**(\d+)\**\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma))/i,
    /((?:DC\s*)\**(\d+)\**\s*的?\s*(力量|敏捷|体质|智力|感知|魅力)\s*(?:\([^)]+\))?\s*豁免)/,
  ];
  return extractSaveFromPatterns(text, patterns);
}

function inheritSave(sharedSave: ExtractedSave | undefined): ExtractedSave | undefined {
  if (!sharedSave) {
    return undefined;
  }
  return {
    dc: sharedSave.dc,
    ability: sharedSave.ability,
    evidence: {
      ...sharedSave.evidence,
      kind: 'inherited',
    },
  };
}

function extractSaveFromPatterns(text: string, patterns: RegExp[]): ExtractedSave | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[0] || match.index === undefined) {
      continue;
    }

    const groups = match.slice(2).filter(Boolean);
    const rawAbility = groups.find((group) => ABILITY_MAP[group]);
    const rawDc = groups.find((group) => /^\d+$/.test(group));
    const ability = rawAbility ? ABILITY_MAP[rawAbility] : undefined;
    const dc = rawDc ? Number.parseInt(rawDc, 10) : NaN;
    if (!ability || !Number.isFinite(dc)) {
      continue;
    }

    return {
      dc,
      ability,
      evidence: evidence(match[0], match.index, match.index + match[0].length, 'direct'),
    };
  }

  return undefined;
}

function extractRiderDamage(text: string, baseDamage?: Damage): Damage[] {
  const extraDie = /(?:1\s*颗伤害骰|one\s+(?:additional\s+)?damage\s+die)/i.test(text);
  const baseDie = baseDamage?.formula.match(/\d+d(\d+)/i)?.[1];
  if (extraDie && baseDie && baseDamage?.type) {
    return [{ formula: `1d${baseDie}`, type: baseDamage.type }];
  }

  const direct = extractFirstDamage(text);
  return direct ? [direct] : [];
}

function extractFirstDamage(text: string): Damage | undefined {
  const formulaMatch = text.match(/`?(\d+d\d+(?:\s*[+\-]\s*\d+)?)`?/i);
  if (!formulaMatch?.[1] || formulaMatch.index === undefined) {
    return undefined;
  }

  const beforeFormula = text.slice(Math.max(0, formulaMatch.index - 90), formulaMatch.index);
  const afterFormula = text.slice(formulaMatch.index, formulaMatch.index + 180);
  const damageContext = `${beforeFormula}${afterFormula}`;
  const directDamageBeforeFormula = /(?:damage|伤害|受到|造成|deals?|takes?)/i.test(beforeFormula);
  if (/(?:Bleed|Bleeding|流血)/i.test(beforeFormula) && !directDamageBeforeFormula) {
    return undefined;
  }
  if (!/(?:damage|伤害|受到|造成|deals?|takes?)/i.test(damageContext)) {
    return undefined;
  }

  const type =
    normalizeDamageType(afterFormula.match(/\(([A-Za-z]+)\s+Damage\)/i)?.[1]) ||
    normalizeDamageType(afterFormula.match(/\b([A-Za-z]+)\s+damage\b/i)?.[1]) ||
    normalizeDamageType(afterFormula.match(/([一-龥]{1,4})伤害/)?.[1]) ||
    '';

  return {
    formula: formulaMatch[1].replace(/\s+/g, ''),
    type,
  };
}

function extractStatuses(text: string): string[] {
  const statuses: string[] = [];
  if (/(?:中毒|Poisoned)/i.test(text)) {
    statuses.push('poisoned');
  }
  if (/(?:流血|Bleeding|Bleed)/i.test(text)) {
    statuses.push('bleeding');
  }
  return statuses;
}

function extractRiderMetadata(text: string, outcomes: HitDiceOutcome[]): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  const bleedingMatch = text.match(/(?:流血|Bleeding|Bleed)[^。\n]*`?(\d+d\d+(?:\s*[+\-]\s*\d+)?)`?/i);
  if (bleedingMatch?.[1]) {
    metadata.bleeding = { formula: bleedingMatch[1].replace(/\s+/g, '') };
  }

  const hitDiceLoss = outcomes.find(
    (outcome): outcome is Extract<HitDiceOutcome, { kind: 'hitDiceChange' }> =>
      outcome.kind === 'hitDiceChange' && outcome.direction === 'lose',
  );
  const tempHp = outcomes.find(
    (outcome): outcome is Extract<HitDiceOutcome, { kind: 'tempHp' }> => outcome.kind === 'tempHp',
  );
  const followup = outcomes.find(
    (outcome): outcome is Extract<HitDiceOutcome, { kind: 'followupSave' }> => outcome.kind === 'followupSave',
  );
  if (hitDiceLoss) {
    metadata.hitDieLoss = hitDiceLoss.count;
    metadata.hitDiceOutcomeLegacy = { sourceDerived: true };
  }
  if (tempHp) {
    metadata.grantsTempHp = tempHp.amount;
    metadata.hitDiceOutcomeLegacy = { sourceDerived: true };
  }
  if (followup) {
    metadata.followupSave = followup.label;
    metadata.followupSaveTrigger = followup.trigger;
    metadata.hitDiceOutcomeLegacy = { sourceDerived: true };
  }

  return metadata;
}

function extractHitDiceOutcomes(text: string, hasSave: boolean): HitDiceOutcome[] {
  const outcomes: HitDiceOutcome[] = [];
  const target = hasSave ? 'failedSaveTarget' : 'target';
  const hitDiceChange =
    text.match(/(?:loses?|lose|gains?|gain)\s*\**(\d+)\**\s*(unspent|spent|expended|consumed)?\s*Hit Di(?:e|ce)/i) ??
    text.match(/(?:\u5931\u53bb|\u83b7\u5f97)\s*\**(\d+)\s*\u9897?[^\u3002\n]*(\u672a\u6d88\u8017|\u5df2\u6d88\u8017)?[^\u3002\n]*(?:\u751f\u547d\u9ab0|\u751f\u547d\u9aa8|Hit Die)/i);

  if (hitDiceChange?.[1]) {
    const rawPool =
      hitDiceChange[2] ??
      hitDiceChange[0].match(/\u672a\u6d88\u8017|\u5df2\u6d88\u8017|unspent|spent|expended|consumed/i)?.[0] ??
      '';
    outcomes.push({
      kind: 'hitDiceChange',
      direction: /gain|gains|\u83b7\u5f97/i.test(hitDiceChange[0]) ? 'gain' : 'lose',
      count: Number.parseInt(hitDiceChange[1], 10),
      pool: normalizeHitDicePool(rawPool),
      target,
      evidence: evidence(
        hitDiceChange[0],
        hitDiceChange.index ?? 0,
        (hitDiceChange.index ?? 0) + hitDiceChange[0].length,
        'direct',
      ),
    });
  }

  const tempHp =
    text.match(/(?:gains?|gain)\s*\**(\d+)\**\s*temporary hit points?/i) ??
    text.match(/\u83b7\u5f97\s*\**(\d+)\**\s*\u70b9\u4e34\u65f6\u751f\u547d\u503c/i);
  if (tempHp?.[1]) {
    const tempHpOutcome: Extract<HitDiceOutcome, { kind: 'tempHp' }> = {
      kind: 'tempHp',
      amount: Number.parseInt(tempHp[1], 10),
      target: resolveTempHpTarget(text, tempHp.index ?? 0),
      evidence: evidence(tempHp[0], tempHp.index ?? 0, (tempHp.index ?? 0) + tempHp[0].length, 'direct'),
    };
    if (hasHitDiceAppliedCondition(text, tempHp.index ?? 0) && outcomes.some((outcome) => outcome.kind === 'hitDiceChange')) {
      tempHpOutcome.condition = 'hitDiceChangeApplied';
    }
    outcomes.push(tempHpOutcome);
  }

  const followup =
    text.match(/(?:0\s*Hit Dice?)[^.。\n]*?(?:make|must make)[^.。\n]*?\b([A-Z][A-Za-z ]+?)\s+saving throw/i) ??
    text.match(/(?:Hit Dice?)[^.。\n]*?(?:to|reduced to)\s*0[^.。\n]*?\b([A-Z][A-Za-z ]+?)\s+saving throw/i) ??
    text.match(/\u751f\u547d(?:\u9ab0|\u9aa8)[^\u3002\n]*0[^\u3002\n]*\u5bf9\u6297\**([^*（(]+?)\s*\(([^)]+)\)\**\s*\u7684\u8c41\u514d\u68c0\u5b9a/);
  if (followup?.[1] || followup?.[2]) {
    outcomes.push({
      kind: 'followupSave',
      label: normalizeFollowupSaveLabel(followup[2] ?? followup[1] ?? ''),
      trigger: 'targetHitDiceReducedToZero',
      target,
      evidence: evidence(followup[0], followup.index ?? 0, (followup.index ?? 0) + followup[0].length, 'direct'),
    });
  }

  return outcomes;
}

function resolveTempHpTarget(text: string, tempHpStart: number): 'self' | 'target' {
  const leadingText = text.slice(Math.max(0, tempHpStart - 80), tempHpStart);
  if (/(?:目标|target)\s*$/i.test(leadingText)) {
    return 'target';
  }
  if (/(?:该生物|此生物|the creature|it)\s*$/i.test(leadingText)) {
    return 'self';
  }
  return 'self';
}

function hasHitDiceAppliedCondition(text: string, tempHpStart: number): boolean {
  const leadingText = text.slice(Math.max(0, tempHpStart - 140), tempHpStart);
  return /(?:以此方式|this way|loses?\s+a?\s*Hit Die|gains?\s+a?\s*Hit Die|失去生命骰|获得生命骰)/i.test(leadingText);
}

function normalizeHitDicePool(raw: string): 'unspent' | 'spent' | 'any' {
  if (/unspent|\u672a\u6d88\u8017|鏈秷鑰?/i.test(raw)) {
    return 'unspent';
  }
  if (/spent|expended|consumed|\u5df2\u6d88\u8017|宸叉秷鑰?/i.test(raw)) {
    return 'spent';
  }
  return 'any';
}

function normalizeFollowupSaveLabel(raw: string): string {
  return raw.trim().replace(/^(?:a|an)\s+/i, '');
}

function slugify(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'compound-rider';
}

function normalizeDamageType(raw: string | undefined): string {
  if (!raw) {
    return '';
  }
  const normalized = raw.trim().replace(/\s+damage$/i, '').toLowerCase();
  return DAMAGE_TYPE_MAP[raw.trim()] ?? DAMAGE_TYPE_MAP[normalized] ?? normalized;
}

function evidence(text: string, startOffset: number, endOffset: number, kind: EvidenceKind): SourceEvidence {
  return {
    text,
    startOffset,
    endOffset,
    kind,
  };
}

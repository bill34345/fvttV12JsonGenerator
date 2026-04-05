import { i18n } from '../mapper/i18n';
import type { ActionData, Damage } from '../parser/action';

/**
 * Extract damage parts from text by parsing dice formulas and damage types.
 */
export function extractDamagePartsFromText(text: string): Damage[] {
  const formulaMatches = [...text.matchAll(/`?(\d+d\d+(?:\s*[+\-]\s*\d+)?)`?/gi)];
  if (formulaMatches.length === 0) {
    return [];
  }

  const typeMatches = [...text.matchAll(/点([一-龥]{2,4})伤害/g)];
  const fallbackType = mapDamageType(typeMatches[0]?.[1] ?? '');

  return formulaMatches.map((match, index) => ({
    formula: match[1]!.replace(/\s+/g, ''),
    type: mapDamageType(typeMatches[index]?.[1] || '') || fallbackType || 'bludgeoning',
  }));
}

/**
 * Extract primary damage parts from the "Hit:" clause of text.
 */
export function extractPrimaryDamagePartsFromText(text: string): Damage[] {
  const hitClause = text.match(/命中[：:]\s*([^。]+(?:点[一-龥]{2,4}伤害)?[^。]*)/);
  const primaryText = hitClause?.[1]?.trim() ? hitClause[1].trim() : text;
  return extractDamagePartsFromText(primaryText);
}

/**
 * Map a Chinese damage type string to a DND5E damage type key.
 */
export function mapDamageType(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned) {
    return '';
  }

  const key = i18n.getKey(cleaned);
  if (!key) {
    return '';
  }

  return key.replace('DND5E.Damage', '').toLowerCase();
}

/**
 * Extract a single saving throw from text.
 */
export function extractSavingThrowFromText(text: string): ActionData['save'] | undefined {
  return extractSavingThrowsWithInheritedDcFromText(text)[0] ?? extractSavingThrowsFromText(text)[0];
}

/**
 * Extract saving throws with DC inherited from context.
 */
export function extractSavingThrowsWithInheritedDcFromText(text: string): Array<NonNullable<ActionData['save']>> {
  const saves: Array<NonNullable<ActionData['save']>> = [];
  const abilityRegex =
    /[^()\n]{0,24}\((Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\)\s*(?:\u8c41\u514d(?:\u68c0\u5b9a)?|saving throw)?/gi;

  let inheritedDc: number | undefined;
  for (const match of text.matchAll(abilityRegex)) {
    const rawAbility = match[1];
    const matchIndex = match.index ?? 0;
    const lookbehind = text.slice(Math.max(0, matchIndex - 40), matchIndex + match[0].length);
    const rawDc = lookbehind.match(/DC\s*(\d+)/i)?.[1];
    if (rawDc) {
      inheritedDc = Number.parseInt(rawDc, 10);
    }
    if (!rawAbility || inheritedDc === undefined) {
      continue;
    }

    const ability = rawAbility.toLowerCase().slice(0, 3);
    const previous = saves[saves.length - 1];
    if (previous?.ability === ability && previous.dc === inheritedDc) {
      continue;
    }

    saves.push({ dc: inheritedDc, ability });
  }

  return saves;
}

/**
 * Extract saving throws with explicit DC values.
 */
export function extractSavingThrowsFromText(text: string): Array<NonNullable<ActionData['save']>> {
  const abilityMap: Record<string, string> = {
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

  const saves: Array<NonNullable<ActionData['save']>> = [];
  let inheritedDc: number | undefined;
  const regex =
    /(?:(?:DC\s*(\d+)\s*(?:的)?\s*)?(力量|敏捷|体质|智力|感知|魅力|Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?:\s*\([A-Za-z]+\))?\s*(?:豁免(?:检定)?|saving throw))/gi;

  for (const match of text.matchAll(regex)) {
    const rawDc = match[1];
    const rawAbility = match[2];
    if (!rawAbility) {
      continue;
    }

    if (rawDc) {
      inheritedDc = Number.parseInt(rawDc, 10);
    }

    if (inheritedDc === undefined) {
      continue;
    }

    const ability = abilityMap[rawAbility];
    if (!ability) {
      continue;
    }

    const previous = saves[saves.length - 1];
    if (previous && previous.ability === ability && previous.dc === inheritedDc) {
      continue;
    }

    saves.push({
      dc: inheritedDc,
      ability,
    });
  }

  return saves;
}

/**
 * Extract area radius in feet from text.
 */
export function extractAreaRadiusFeet(text: string): number | null {
  const patterns = [
    /(\d+)\s*(?:feet|foot|ft)\s*radius/i,
    /radius\s+of\s+(\d+)\s*(?:feet|foot|ft)/i,
    /(\d+)\s*尺半径/i,
    /半径\s*(\d+)\s*尺/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
  }

  return null;
}

/**
 * Extract narrative range in feet (for save effects without explicit range).
 */
export function extractNarrativeRangeFeet(text: string): number | null {
  const matches: number[] = [];
  const patterns = [
    /within\s+(\d+)\s*(?:feet|foot|ft)/gi,
    /(\d+)\s*(?:feet|foot|ft)\s+within/gi,
    /(\d+)\s*尺内/g,
    /(\d+)\s*尺范围内/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) {
        matches.push(Number.parseInt(match[1], 10));
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  return Math.max(...matches);
}

/**
 * Extract narrative range in feet with additional patterns for fixed range text.
 */
export function extractNarrativeRangeFeetFixed(text: string): number | null {
  const base = extractNarrativeRangeFeet(text);
  const extraPatterns = [
    /range\s+(\d+)\s*(?:feet|foot|ft)/gi,
    /\u5c04\u7a0b\s*(\d+)\s*\u5c3a/g,
  ];
  const matches: number[] = [];
  if (base !== null) {
    matches.push(base);
  }

  for (const pattern of extraPatterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) {
        matches.push(Number.parseInt(match[1], 10));
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  return Math.max(...matches);
}

/**
 * Check if text indicates half damage on successful save.
 */
export function hasHalfDamageOnSave(text: string): boolean {
  return /(?:half\s+as\s+much\s+damage|half\s+damage|\u4f24\u5bb3\u51cf\u534a)/i.test(text);
}

/**
 * Extract threshold effects based on save DC.
 */
export function extractThresholdEffects(text: string): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  for (const match of text.matchAll(/(?:\u82e5.*?(?:save|豁免).*?(\d+)\s*(?:or lower|\u6216\u66f4\u4f4e)[^.:：]*[:：]\s*([^。]+))/giu)) {
    const maxSaveTotal = match[1] ? Number.parseInt(match[1], 10) : null;
    const clause = match[2]?.trim() ?? '';
    if (!maxSaveTotal || !clause) {
      continue;
    }

    if (/\bdazed\b|\u604d\u60da/i.test(clause)) {
      results.push({ maxSaveTotal, statuses: ['dazed'] });
      continue;
    }

    if (/\bvulnerability\b|\u6613\u4f24/i.test(clause)) {
      results.push({
        maxSaveTotal,
        kind: 'vulnerability',
        damageType: /\bbludgeoning\b|\u949d\u51fb/i.test(clause) ? 'bludgeoning' : undefined,
      });
    }
  }

  return results;
}

/**
 * Extract on-hit riders (disease, vulnerability, etc).
 */
export function extractOnHitRiders(text: string): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  const saveMatch =
    text.match(/DC\s*(\d+)[^()]{0,20}\((Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\)/i) ??
    text.match(/DC\s*(\d+)[^\u4e00-\u9fff]{0,10}(\u529b\u91cf|\u654f\u6377|\u4f53\u8d28|\u667a\u529b|\u611f\u77e5|\u9b45\u529b)/i);

  if (/\bdisease\b|\u75be\u75c5/i.test(text)) {
    results.push({
      kind: 'disease',
      ...(saveMatch?.[1] ? { saveDc: Number.parseInt(saveMatch[1], 10) } : {}),
      ...(saveMatch?.[2] ? { saveAbility: normalizeAbility(saveMatch[2]) } : {}),
    });
  }

  for (const effect of extractThresholdEffects(text)) {
    if (effect.kind === 'vulnerability') {
      results.push(effect);
    }
  }

  return results;
}

/**
 * Extract on-failed-save riders (push, save penalty).
 */
export function extractOnFailedSaveRiders(text: string): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  const pushMatch = text.match(/(?:push(?:ed)?|推开)\s*(\d+)\s*(?:feet|foot|ft|\u5c3a)/i);
  if (pushMatch?.[1]) {
    results.push({
      kind: 'push',
      distance: Number.parseInt(pushMatch[1], 10),
      units: 'ft',
    });
  }

  const savePenaltyMatch =
    text.match(/(?:next\s+saving\s+throw[^.]*?subtract\s*`?(\d+d\d+)`?|豁免检定[^。]*?减去\s*`?(\d+d\d+)`?)/i);
  const dice = savePenaltyMatch?.[1] ?? savePenaltyMatch?.[2];
  if (dice) {
    results.push({
      kind: 'savePenalty',
      dice: dice.replace(/\s+/g, ''),
    });
  }
  return results;
}

/**
 * Normalize an ability name to its 3-letter abbreviation.
 */
export function normalizeAbility(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'constitution' || normalized === '\u4f53\u8d28') return 'con';
  if (normalized === 'strength' || normalized === '\u529b\u91cf') return 'str';
  if (normalized === 'dexterity' || normalized === '\u654f\u6377') return 'dex';
  if (normalized === 'intelligence' || normalized === '\u667a\u529b') return 'int';
  if (normalized === 'wisdom' || normalized === '\u611f\u77e5') return 'wis';
  if (normalized === 'charisma' || normalized === '\u9b45\u529b') return 'cha';
  return normalized.slice(0, 3);
}

/**
 * Extract legendary action cost from text (e.g., "Costs 2 Actions").
 */
export function extractLegendaryCostFixed(text: string): number | undefined {
  const match =
    text.match(/(?:\u6d88\u8017|Cost(?:s)?)\s*(\d+)\s*(?:\u52a8\u4f5c|Actions?)?/i) ??
    text.match(/Costs?\s*(\d+)\s*Actions?/i);
  if (!match?.[1]) {
    return undefined;
  }

  return Number.parseInt(match[1], 10);
}

/**
 * Extract uses per long rest from text (e.g., "Daily 3" or "[3/Day]").
 */
export function extractUsesPerLongRestFixed(text: string): number | undefined {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const dailyMatch =
    normalized.match(/(?:\u6bcf\u65e5|daily)\s*(\d+)\s*(?:\u6b21|uses?)?/i) ??
    normalized.match(/(\d+)\s*(?:\u6b21)?\s*\/\s*(?:\u65e5|day)/i) ??
    normalized.match(/\[(\d+)\s*\/\s*(?:\u65e5|day)\]/i);
  if (!dailyMatch?.[1]) {
    return undefined;
  }

  return Number.parseInt(dailyMatch[1], 10);
}

/**
 * Extract legendary action count from lines (e.g., "can take 3 legendary actions").
 */
export function extractLegendaryActionCountFromLines(lines: string[]): number | undefined {
  for (const line of lines) {
    const normalized =
      typeof line === 'string'
        ? line.replace(/\s+/g, ' ').trim()
        : JSON.stringify(line).replace(/\s+/g, ' ').trim();
    const match =
      normalized.match(/(\d+)\s*(?:\u6b21|\u4e2a)?\s*\u4f20\u5947\u52a8\u4f5c/i) ??
      normalized.match(/(\d+)\s+legendary\s+actions?/i);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
  }

  return undefined;
}

/**
 * Check if text indicates concentration requirement.
 */
export function extractRequiresConcentration(text: string): boolean {
  return /(?:\u9700\u4e13\u6ce8|concentration)/i.test(text);
}

/**
 * Extract target condition from text (e.g., "charmed target only").
 */
export function extractTargetCondition(text: string): string | undefined {
  if (
    /(?:\u4ec5\u9650\u88ab\u9b45\u60d1\u7684\u76ee\u6807|charmed target only)/i.test(text) ||
    /^(?:[^.。]*?)(?:\u88ab.*?\u9b45\u60d1|\u88ab\u9b45\u60d1).*?(?:\u76ee\u6807|\u751f\u7269)/i.test(text) ||
    /^(?:[^.。]*?)\bcharmed\b.*?(?:target|creature)/i.test(text)
  ) {
    return 'charmed';
  }

  return undefined;
}

/**
 * Extract semantic description by cutting at per-rest usage clauses.
 */
export function extractSemanticDescription(action: { desc?: string | null; attack?: ActionData['attack'] }): string {
  const desc = String(action.desc ?? '').replace(/\s+/g, ' ').trim();
  if (!desc || !action.attack) {
    return desc;
  }

  const cutIndexes = [
    desc.search(/(?:每次(?:长|短)休|可分别使用以下|以下毒液效果)/),
    desc.search(/(?:each|once per)\s+(?:long|short)\s+rest/i),
  ].filter((index) => index >= 0);

  if (cutIndexes.length === 0) {
    return desc;
  }

  return desc.slice(0, Math.min(...cutIndexes)).trim();
}

/**
 * Extract inline feature lines from biography text.
 */
export function extractInlineFeatureLinesFromBiography(
  biography: unknown,
  route: 'chinese' | 'english'
): { biography: string; features: string[] } {
  if (typeof biography !== 'string' || !biography.trim()) {
    return { biography: '', features: [] };
  }

  const lines = biography
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const features: string[] = [];
  const remaining: string[] = [];
  let currentFeature: string | null = null;

  const flushCurrentFeature = () => {
    if (!currentFeature) {
      return;
    }
    features.push(currentFeature);
    currentFeature = null;
  };

  const markdownFeaturePattern = /^\*{2,3}\s*([^*]+?)\s*\*{2,3}\s*[\u3002\uFF1A.:\s]+\s*(.+)$/;
  const plainFeaturePattern = /^([^\u3002\uFF1A:.]+(?:\s*\([^)]*\))?)\s*[\u3002\uFF1A:]\s*(.+)$/;

  for (const line of lines) {
    const normalized = line.replace(/^[-*+]\s*/, '').trim();

    const markdownMatch = normalized.match(markdownFeaturePattern);
    if (markdownMatch?.[1] && markdownMatch[2]) {
      flushCurrentFeature();
      currentFeature = `${markdownMatch[1].trim().replace(/[.\s]+$/g, '')}: ${markdownMatch[2].trim()}`;
      continue;
    }

    const plainMatch = normalized.match(plainFeaturePattern);
    if (plainMatch?.[1] && plainMatch[2] && /\([A-Za-z][^)]*\)/.test(plainMatch[1])) {
      flushCurrentFeature();
      currentFeature = `${plainMatch[1].trim().replace(/[.\s]+$/g, '')}: ${plainMatch[2].trim()}`;
      continue;
    }

    if (currentFeature) {
      currentFeature = `${currentFeature} ${normalized}`;
      continue;
    }

    remaining.push(line);
  }

  flushCurrentFeature();

  return {
    biography: route === 'english' ? remaining.join('\n').trim() : biography.trim(),
    features,
  };
}

/**
 * Format structured HTML from raw text.
 */
export function formatStructuredHtml(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }

  const normalized = raw
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!normalized) {
    return '';
  }

  const lineSegments = normalized
    .split(/\n+/)
    .map((segment) => cleanDescriptionSegment(segment))
    .filter(Boolean);

  if (lineSegments.length > 1) {
    return `<ul>${lineSegments.map((segment) => `<li>${segment}</li>`).join('')}</ul>`;
  }

  const segments = splitStructuredSegments(lineSegments[0] ?? '');
  if (segments.length <= 1) {
    return `<ul><li>${segments[0] ?? normalized}</li></ul>`;
  }

  const [lead, ...rest] = segments;
  return `<p>${lead}</p><ul>${rest.map((segment) => `<li>${segment}</li>`).join('')}</ul>`;
}

/**
 * Split structured segments at action/condition boundaries.
 */
export function splitStructuredSegments(raw: string): string[] {
  return raw
    .replace(
      /\s+(?=(?:命中|豁免失败|豁免成功|强击|Bleed|Dazed|流血创口|震荡冲击|击退|Heavy Hit|Hit:|Failure:|Success:)[：:（(]?)/g,
      '\n',
    )
    .split(/\n+/)
    .map((segment) => cleanDescriptionSegment(segment))
    .filter(Boolean);
}

/**
 * Clean a description segment by normalizing whitespace and bullets.
 */
export function cleanDescriptionSegment(segment: string): string {
  return segment
    .replace(/\s+/g, ' ')
    .replace(/^\s*[-*+]\s*/, '')
    .trim();
}

/**
 * Split a bilingual name into Chinese and English parts.
 */
export function splitBilingualName(raw: string): { name: string; englishName?: string } {
  const match = raw.match(/^(.+?)\s*\(\s*([A-Za-z][A-Za-z0-9\s&:'-]+?)\s*\)\s*$/);
  if (match?.[1] && match[2]) {
    return { name: match[1].trim(), englishName: match[2].trim() };
  }
  return { name: raw.trim() };
}

/**
 * Parse a localized attack line (Chinese format).
 */
export function parseLocalizedAttackLine(
  line: string,
  splitHeadlineAndBody: (text: string) => { raw: string; header: string; body: string } | null
): ActionData | null {
  const split = splitHeadlineAndBody(line);
  if (!split?.header || !split.body) {
    return null;
  }

  const header = split.header;
  const desc = split.body;
  const attackPrefixMatch = desc.match(/^(近战或远程武器攻击|近战武器攻击|远程武器攻击|近战法术攻击|远程法术攻击)[:：]/);
  if (!attackPrefixMatch?.[1]) {
    return null;
  }

  const toHitMatch = desc.match(/命中\s*\+?\s*(\d+)/);
  if (!toHitMatch?.[1]) {
    return null;
  }

  const reachMatch = desc.match(/触及\s*(\d+)\s*尺/);
  const rangeMatch = desc.match(/射程\s*(\d+)(?:\s*\/\s*(\d+))?\s*尺/);
  const damage = extractPrimaryDamagePartsFromText(desc);

  const { name, englishName } = splitBilingualName(header);
  const isRanged = attackPrefixMatch[1].includes('远程') && !attackPrefixMatch[1].includes('近战或远程');

  return {
    name,
    englishName,
    type: 'attack',
    desc,
    attack: {
      type: isRanged ? 'rwak' : 'mwak',
      toHit: Number.parseInt(toHitMatch[1], 10),
      range: rangeMatch?.[1] ? `${rangeMatch[1]}${rangeMatch[2] ? `/${rangeMatch[2]}` : ''}` : (reachMatch?.[1] ?? '5'),
      ...(reachMatch?.[1] ? { reach: reachMatch[1] } : {}),
      damage,
    },
  };
}

/**
 * Extract a delimited segment from text between start and end patterns.
 */
export function extractDelimitedSegment(text: string, startPattern: RegExp, endPatterns: RegExp[]): string {
  const startMatch = startPattern.exec(text);
  if (!startMatch || startMatch.index === undefined) {
    return text.trim();
  }

  const afterStart = text.slice(startMatch.index).trim();
  const endIndexes = endPatterns
    .map((pattern) => afterStart.search(pattern))
    .filter((index) => index > 0);

  const raw = endIndexes.length > 0 ? afterStart.slice(0, Math.min(...endIndexes)) : afterStart;
  return raw.trim();
}

/**
 * Create a custom effect object.
 */
export function createCustomEffect(options: {
  name: string;
  img: string;
  statuses?: string[];
  changes?: Array<Record<string, unknown>>;
  duration?: Record<string, unknown>;
  flags?: Record<string, unknown>;
}): any {
  return {
    _id: createRandomId(),
    name: options.name,
    type: 'base',
    system: {},
    changes: options.changes ?? [],
    disabled: false,
    duration: options.duration ?? {
      startTime: null,
      seconds: null,
      combat: null,
      rounds: null,
      turns: null,
      startRound: null,
      startTurn: null,
    },
    description: '',
    origin: null,
    tint: '#ffffff',
    transfer: false,
    img: options.img,
    statuses: options.statuses ?? [],
    ...(options.flags ? { flags: options.flags } : {}),
  };
}

/**
 * Create a random 16-character hex ID.
 */
export function createRandomId(): string {
  const chars = 'abcdef0123456789';
  let res = '';
  for (let i = 0; i < 16; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

import { createRequire } from 'node:module';
import type { ParsedNPC } from '../../config/mapping';
import { i18n } from '../mapper/i18n';
import type { ParserStrategy } from './types';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml') as { load: (input: string) => unknown };

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
type AbilityKey = (typeof ABILITIES)[number];

const ABILITY_ALIASES: Record<string, AbilityKey> = {
  str: 'str',
  strength: 'str',
  dex: 'dex',
  dexterity: 'dex',
  con: 'con',
  constitution: 'con',
  int: 'int',
  intelligence: 'int',
  wis: 'wis',
  wisdom: 'wis',
  cha: 'cha',
  charisma: 'cha',
};

const SKILL_ALIASES: Record<string, string> = {
  acr: 'acr',
  acrobatics: 'acr',
  ani: 'ani',
  animalhandling: 'ani',
  animalhandlingchecks: 'ani',
  arc: 'arc',
  arcana: 'arc',
  ath: 'ath',
  athletics: 'ath',
  dec: 'dec',
  deception: 'dec',
  his: 'his',
  history: 'his',
  ins: 'ins',
  insight: 'ins',
  itm: 'itm',
  intimidation: 'itm',
  inv: 'inv',
  investigation: 'inv',
  med: 'med',
  medicine: 'med',
  nat: 'nat',
  nature: 'nat',
  prc: 'prc',
  perception: 'prc',
  prf: 'prf',
  performance: 'prf',
  per: 'per',
  persuasion: 'per',
  rel: 'rel',
  religion: 'rel',
  slt: 'slt',
  sleightofhand: 'slt',
  ste: 'ste',
  stealth: 'ste',
  sur: 'sur',
  survival: 'sur',
};

const SKILL_TO_ABILITY: Record<string, AbilityKey> = {
  acr: 'dex',
  ani: 'wis',
  arc: 'int',
  ath: 'str',
  dec: 'cha',
  his: 'int',
  ins: 'wis',
  itm: 'cha',
  inv: 'int',
  med: 'wis',
  nat: 'int',
  prc: 'wis',
  prf: 'cha',
  per: 'cha',
  rel: 'int',
  slt: 'dex',
  ste: 'dex',
  sur: 'wis',
};

const SIZE_ALIASES: Record<string, string> = {
  tiny: 'tiny',
  sm: 'sm',
  small: 'sm',
  med: 'med',
  medium: 'med',
  lg: 'lg',
  large: 'lg',
  huge: 'huge',
  grg: 'grg',
  gargantuan: 'grg',
};

const DAMAGE_ALIASES: Record<string, string> = {
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

const CONDITION_ALIASES: Record<string, string> = {
  blinded: 'blinded',
  charmed: 'charmed',
  deafened: 'deafened',
  exhaustion: 'exhaustion',
  frightened: 'frightened',
  grappled: 'grappled',
  incapacitated: 'incapacitated',
  invisible: 'invisible',
  paralyzed: 'paralyzed',
  petrified: 'petrified',
  poisoned: 'poisoned',
  prone: 'prone',
  restrained: 'restrained',
  stunned: 'stunned',
  unconscious: 'unconscious',
};

const LANGUAGE_ALIASES: Record<string, string> = {
  abyssal: 'abyssal',
  celestial: 'celestial',
  common: 'common',
  deepSpeech: 'deep',
  deepspeech: 'deep',
  draconic: 'draconic',
  dwarvish: 'dwarvish',
  dwarven: 'dwarvish',
  elvish: 'elvish',
  giant: 'giant',
  gnomish: 'gnomish',
  goblin: 'goblin',
  halfling: 'halfling',
  infernal: 'infernal',
  orc: 'orc',
  primordial: 'primordial',
  sylvan: 'sylvan',
  terran: 'terran',
  undercommon: 'undercommon',
};

const SENSE_ALIASES: Record<string, string> = {
  blindsight: 'blindsight',
  darkvision: 'darkvision',
  tremorsense: 'tremorsense',
  truesight: 'truesight',
  passiveperception: 'passive',
};

type BodySectionKey =
  | 'actions'
  | 'bonus_actions'
  | 'reactions'
  | 'legendary_actions'
  | 'lair_actions'
  | 'spellcasting';

interface BodyExtractionResult {
  biography: string;
  actions: string[];
  bonus_actions: string[];
  reactions: string[];
  legendary_actions: string[];
  lair_actions: string[];
  spellcasting: string[];
}

export class EnglishBestiaryParser implements ParserStrategy {
  public readonly type = 'english' as const;

  public parse(content: string): ParsedNPC {
    const { frontmatter, body } = this.splitContent(content);
    const raw = this.loadFrontmatter(frontmatter);

    const result: ParsedNPC = {
      name: typeof raw.name === 'string' ? raw.name : '',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
    };

    this.applyFrontmatter(raw, result);

    if (body.trim()) {
      const extracted = this.extractBodySections(body);

      if (extracted.biography) {
        result.details.biography = extracted.biography;
      }
      if (extracted.actions.length > 0) {
        result.actions = extracted.actions;
      }
      if (extracted.bonus_actions.length > 0) {
        result.bonus_actions = extracted.bonus_actions;
      }
      if (extracted.reactions.length > 0) {
        result.reactions = extracted.reactions;
      }
      if (extracted.legendary_actions.length > 0) {
        result.legendary_actions = extracted.legendary_actions;
      }
      if (extracted.lair_actions.length > 0) {
        result.lair_actions = extracted.lair_actions;
      }
      if (extracted.spellcasting.length > 0) {
        result.spellcasting = extracted.spellcasting;
      }
    }

    return result;
  }

  private splitContent(content: string): { frontmatter: string; body: string } {
    const normalized = content.trim();
    const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      return { frontmatter: match[1], body: match[2] };
    }

    const separatorIndex = normalized.indexOf('\n---\n');
    if (separatorIndex !== -1) {
      return {
        frontmatter: normalized.substring(0, separatorIndex),
        body: normalized.substring(separatorIndex + 5),
      };
    }

    return { frontmatter: normalized, body: '' };
  }

  private extractBodySections(body: string): BodyExtractionResult {
    const sectionLines: Record<BodySectionKey, string[]> = {
      actions: [],
      bonus_actions: [],
      reactions: [],
      legendary_actions: [],
      lair_actions: [],
      spellcasting: [],
    };
    const biographyLines: string[] = [];

    let currentSection: BodySectionKey | undefined;
    let currentSectionLevel = 0;
    let currentSectionHasContent = false;
    let currentSectionLastLineBlank = false;
    let currentSectionSawListLike = false;

    for (const rawLine of body.split(/\r?\n/)) {
      const inlineSection = this.parseInlineSectionMarker(rawLine);
      if (inlineSection) {
        currentSection = inlineSection.section;
        currentSectionLevel = 7;
        currentSectionHasContent = false;
        currentSectionLastLineBlank = false;
        currentSectionSawListLike = false;

        if (inlineSection.remainder) {
          sectionLines[currentSection].push(inlineSection.remainder);
          currentSectionHasContent = true;
        }
        continue;
      }

      const heading = this.parseMarkdownHeading(rawLine);
      if (heading) {
        if (currentSection && heading.level > currentSectionLevel) {
          sectionLines[currentSection].push(rawLine);
          continue;
        }

        const detectedSection = this.classifyBodySectionHeading(heading.title);
        if (detectedSection) {
          currentSection = detectedSection;
          currentSectionLevel = heading.level;
          currentSectionHasContent = false;
          currentSectionLastLineBlank = false;
          currentSectionSawListLike = false;
        } else {
          currentSection = undefined;
          currentSectionLevel = 0;
          currentSectionHasContent = false;
          currentSectionLastLineBlank = false;
          currentSectionSawListLike = false;
          biographyLines.push(rawLine);
        }
        continue;
      }

      if (currentSection) {
        const trimmed = rawLine.trim();
        const isBlankLine = trimmed.length === 0;
        const isListLikeLine = this.isMarkdownListLine(rawLine);

        if (
          !isBlankLine &&
          currentSectionHasContent &&
          currentSectionLastLineBlank &&
          currentSectionSawListLike &&
          !isListLikeLine
        ) {
          currentSection = undefined;
          currentSectionLevel = 0;
          currentSectionHasContent = false;
          currentSectionLastLineBlank = false;
          currentSectionSawListLike = false;
          biographyLines.push(rawLine);
          continue;
        }

        if (!isBlankLine) {
          currentSectionHasContent = true;
        }
        if (isListLikeLine) {
          currentSectionSawListLike = true;
        }
        currentSectionLastLineBlank = isBlankLine;
        sectionLines[currentSection].push(rawLine);
      } else {
        biographyLines.push(rawLine);
      }
    }

    return {
      biography: biographyLines.join('\n').trim(),
      actions: this.normalizeBodySectionLines(sectionLines.actions, 'actions'),
      bonus_actions: this.normalizeBodySectionLines(sectionLines.bonus_actions, 'bonus_actions'),
      reactions: this.normalizeBodySectionLines(sectionLines.reactions, 'reactions'),
      legendary_actions: this.normalizeBodySectionLines(sectionLines.legendary_actions, 'legendary_actions'),
      lair_actions: this.normalizeBodySectionLines(sectionLines.lair_actions, 'lair_actions'),
      spellcasting: this.normalizeBodySectionLines(sectionLines.spellcasting, 'spellcasting'),
    };
  }

  private parseMarkdownHeading(line: string): { level: number; title: string } | undefined {
    const match = line.match(/^\s{0,3}(#{1,6})\s*(.+?)\s*#*\s*$/);
    if (!match?.[1] || !match[2]) {
      return undefined;
    }

    return {
      level: match[1].length,
      title: match[2].trim(),
    };
  }

  private classifyBodySectionHeading(title: string): BodySectionKey | undefined {
    const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!normalized) {
      return undefined;
    }

    if (normalized.includes('legendary actions')) {
      return 'legendary_actions';
    }

    if (normalized.includes('lair actions')) {
      return 'lair_actions';
    }

    if (normalized.includes('bonus actions') || normalized.includes('bonus action')) {
      return 'bonus_actions';
    }

    if (normalized.includes('reactions') || normalized.includes('reaction')) {
      return 'reactions';
    }

    if (normalized.includes('spellcasting')) {
      return 'spellcasting';
    }

    if (/^actions?\b/.test(normalized)) {
      return 'actions';
    }

    return undefined;
  }

  private parseInlineSectionMarker(line: string): { section: BodySectionKey; remainder: string } | undefined {
    const match = line.match(/^\s*\*{2,3}\s*([^*]+?)\s*\*{2,3}\s*(.*)$/);
    if (!match?.[1]) {
      return undefined;
    }

    const title = match[1].trim().replace(/[.:\s]+$/g, '');
    const section = this.classifyBodySectionHeading(title);
    if (!section) {
      return undefined;
    }

    return {
      section,
      remainder: match[2]?.trim() ?? '',
    };
  }

  private normalizeBodySectionLines(lines: string[], section: BodySectionKey): string[] {
    const cleanedLines: string[] = [];

    for (const line of lines) {
      const cleaned = this.cleanBodySectionLine(line);
      if (cleaned) {
        cleanedLines.push(cleaned);
      }
    }

    if (section === 'spellcasting') {
      return cleanedLines;
    }

    const merged: string[] = [];
    for (const line of cleanedLines) {
      const previous = merged[merged.length - 1];
      if (this.shouldMergeBodySectionLine(previous, line)) {
        merged[merged.length - 1] = `${previous} ${line}`.replace(/\s+/g, ' ').trim();
        continue;
      }

      merged.push(line);
    }

    return merged;
  }

  private cleanBodySectionLine(line: string): string {
    let text = line.trim();
    if (!text) {
      return '';
    }

    while (text.startsWith('>')) {
      text = text.slice(1).trimStart();
    }

    text = text.replace(/^[-*+]\s*/, '');
    text = text.replace(/^\d+[.)]\s*/, '');

    const nestedHeading = this.parseMarkdownHeading(text);
    if (nestedHeading) {
      text = nestedHeading.title;
    }

    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/\*/g, '');

    return text.trim();
  }

  private shouldMergeBodySectionLine(previous: string | undefined, current: string): boolean {
    if (!previous) {
      return false;
    }

    const trimmedPrev = previous.trim();
    const trimmedCurrent = current.trim();
    if (!trimmedCurrent) {
      return false;
    }

    if (!/[.!?)]$/.test(trimmedPrev)) {
      return true;
    }

    if (/^[a-z]/.test(trimmedCurrent)) {
      return true;
    }

    if (/^(\d|\(|\+|-)/.test(trimmedCurrent)) {
      return true;
    }

    return /^or\b/i.test(trimmedCurrent);
  }

  private isMarkdownListLine(line: string): boolean {
    let text = line.trimStart();

    while (text.startsWith('>')) {
      text = text.slice(1).trimStart();
    }

    return /^([-*+]|\d+[.)])\s*/.test(text);
  }

  private applyFrontmatter(raw: Record<string, unknown>, result: ParsedNPC): void {
    const name = this.readString(raw, ['name']);
    if (name) result.name = name;

    const size = this.normalizeSize(this.readString(raw, ['size']));
    if (size) result.traits.size = size;

    const alignment = this.readString(raw, ['alignment']);
    if (alignment) result.details.alignment = alignment;

    const creatureType = this.readString(raw, ['type', 'creature_type']);
    if (creatureType && creatureType.toLowerCase() !== 'npc') {
      result.details.creatureType = creatureType.toLowerCase();
    }

    for (const ability of ABILITIES) {
      const value = this.getValue(raw, [ability, this.abilityLongName(ability)]);
      const score = this.parseInteger(value);
      if (score !== undefined) {
        result.abilities[ability] = score;
      }
    }

    const ac = this.parseAC(this.getValue(raw, ['armor_class', 'ac']));
    if (ac) result.attributes.ac = ac;

    const hp = this.parseHP(this.getValue(raw, ['hit_points', 'hp']));
    if (hp) result.attributes.hp = hp;

    const movement = this.parseMovement(this.getValue(raw, ['speed', 'movement']));
    if (Object.keys(movement).length > 0) {
      result.attributes.movement = movement;
    }

    const challenge = this.parseChallenge(this.getValue(raw, ['challenge', 'cr']));
    if (challenge.cr !== undefined) result.details.cr = challenge.cr;
    if (challenge.xp !== undefined) result.details.xp = challenge.xp;

    const xp = this.parseInteger(this.getValue(raw, ['xp', 'experience_points']));
    if (xp !== undefined) result.details.xp = xp;

    const saves = this.parseSavingThrows(this.getValue(raw, ['saving_throws', 'saves']));
    if (saves.length > 0) result.saves = saves;

    const skills = this.parseSkills(this.getValue(raw, ['skills']), result);
    if (Object.keys(skills).length > 0) result.skills = skills;

    const senses = this.parseSenses(this.getValue(raw, ['senses']));
    if (Object.keys(senses).length > 0) result.traits.senses = senses;

    const languages = this.parseTerms(this.getValue(raw, ['languages']), LANGUAGE_ALIASES);
    if (languages.length > 0) result.traits.languages = languages;

    const dr = this.parseTerms(this.getValue(raw, ['damage_resistances']), DAMAGE_ALIASES);
    if (dr.length > 0) result.traits.dr = dr;

    const dv = this.parseTerms(this.getValue(raw, ['damage_vulnerabilities']), DAMAGE_ALIASES);
    if (dv.length > 0) result.traits.dv = dv;

    const di = this.parseTerms(this.getValue(raw, ['damage_immunities']), DAMAGE_ALIASES);
    if (di.length > 0) result.traits.di = di;

    const ci = this.parseTerms(this.getValue(raw, ['condition_immunities']), CONDITION_ALIASES);
    if (ci.length > 0) result.traits.ci = ci;
  }

  private loadFrontmatter(frontmatter: string): Record<string, unknown> {
    const loaded = yaml.load(frontmatter);
    if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
      return loaded as Record<string, unknown>;
    }
    return {};
  }

  private getValue(data: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
      if (Object.hasOwn(data, key)) {
        return data[key];
      }
    }
    return undefined;
  }

  private readString(data: Record<string, unknown>, keys: string[]): string | undefined {
    const value = this.getValue(data, keys);
    if (typeof value === 'string') return this.stripQuoted(value).trim();
    if (typeof value === 'number') return String(value);
    return undefined;
  }

  private parseInteger(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }

    if (typeof value !== 'string') return undefined;
    const match = value.match(/[-+]?\d[\d,]*/);
    if (!match) return undefined;
    const parsed = Number.parseInt(match[0].replace(/,/g, ''), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private parseAC(value: unknown): ParsedNPC['attributes']['ac'] | undefined {
    const acValue = this.parseInteger(value);
    if (acValue === undefined) return undefined;

    const text = typeof value === 'string' ? value.toLowerCase() : '';
    const calc = text.includes('natural') ? 'natural' : 'flat';
    return { value: acValue, calc };
  }

  private parseHP(value: unknown): ParsedNPC['attributes']['hp'] | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { value: Math.trunc(value), max: Math.trunc(value) };
    }

    if (typeof value !== 'string') return undefined;
    const match = value.match(/^\s*(\d[\d,]*)\s*(?:\(([^)]+)\))?/);
    if (!match?.[1]) return undefined;

    const hpValue = Number.parseInt(match[1].replace(/,/g, ''), 10);
    if (Number.isNaN(hpValue)) return undefined;

    const formula = match[2]?.trim();
    return formula ? { value: hpValue, max: hpValue, formula } : { value: hpValue, max: hpValue };
  }

  private parseMovement(value: unknown): Record<string, number> {
    const movement: Record<string, number> = {};

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [rawType, rawDistance] of Object.entries(value)) {
        const type = this.normalizeMovementType(rawType);
        const distance = this.parseInteger(rawDistance);
        if (!type || distance === undefined) continue;
        movement[type] = distance;
      }
      return movement;
    }

    if (typeof value !== 'string') return movement;

    const parts = value.split(/[,;，]/).map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      const distance = this.parseInteger(part);
      if (distance === undefined) continue;
      const type = this.normalizeMovementType(part) ?? 'walk';
      movement[type] = distance;
    }

    return movement;
  }

  private parseChallenge(value: unknown): { cr?: number; xp?: number } {
    const result: { cr?: number; xp?: number } = {};

    if (typeof value === 'number' && Number.isFinite(value)) {
      result.cr = value;
      return result;
    }

    if (typeof value !== 'string') return result;

    const crMatch = value.trim().match(/^([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+)/);
    if (crMatch?.[1]) {
      const cr = this.parseCrValue(crMatch[1]);
      if (cr !== undefined) result.cr = cr;
    }

    const xpMatch = value.match(/([0-9][0-9,]*)\s*XP/i);
    if (xpMatch?.[1]) {
      const xp = Number.parseInt(xpMatch[1].replace(/,/g, ''), 10);
      if (!Number.isNaN(xp)) result.xp = xp;
    }

    return result;
  }

  private parseCrValue(value: string): number | undefined {
    const trimmed = value.trim();
    if (trimmed.includes('/')) {
      const [numRaw, denRaw] = trimmed.split('/');
      const num = Number.parseFloat(numRaw ?? '');
      const den = Number.parseFloat(denRaw ?? '');
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return undefined;
      return num / den;
    }

    const parsed = Number.parseFloat(trimmed);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private parseSavingThrows(value: unknown): string[] {
    const saves = new Set<string>();

    if (Array.isArray(value)) {
      for (const entry of value) {
        const ability = this.normalizeAbility(entry);
        if (ability) saves.add(ability);
      }
      return Array.from(saves);
    }

    if (typeof value === 'object' && value !== null) {
      for (const key of Object.keys(value)) {
        const ability = this.normalizeAbility(key);
        if (ability) saves.add(ability);
      }
      return Array.from(saves);
    }

    if (typeof value !== 'string') return [];

    const entries = value.split(/[,;，]/).map((entry) => entry.trim()).filter(Boolean);
    for (const entry of entries) {
      const ability = this.normalizeAbility(entry);
      if (ability) saves.add(ability);
    }

    return Array.from(saves);
  }

  private parseSkills(value: unknown, result: ParsedNPC): Record<string, number> {
    const entries: Array<{ skill: string; rawValue: unknown }> = [];

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [key, rawValue] of Object.entries(value)) {
        const skill = this.normalizeSkill(key);
        if (skill) entries.push({ skill, rawValue });
      }
    } else if (typeof value === 'string') {
      const parts = value.split(/[,;，]/).map((part) => part.trim()).filter(Boolean);
      for (const part of parts) {
        const signMatch = part.match(/^(.+?)\s*([+-]?\d[\d,]*)$/);
        if (signMatch?.[1]) {
          const skill = this.normalizeSkill(signMatch[1]);
          if (skill) {
            entries.push({ skill, rawValue: signMatch[2] });
          }
          continue;
        }

        const colonMatch = part.match(/^(.+?)\s*:\s*(.+)$/);
        if (colonMatch?.[1]) {
          const skill = this.normalizeSkill(colonMatch[1]);
          if (skill) {
            entries.push({ skill, rawValue: colonMatch[2] });
          }
        }
      }
    }

    if (entries.length === 0) return {};

    const out: Record<string, number> = {};
    const profBonus = this.getProficiencyBonus(result.details.cr);
    for (const entry of entries) {
      const prof = this.parseSkillProficiency(entry.skill, entry.rawValue, result, profBonus);
      if (prof !== undefined) {
        out[entry.skill] = prof;
      }
    }
    return out;
  }

  private parseSkillProficiency(
    skill: string,
    rawValue: unknown,
    result: ParsedNPC,
    profBonus: number | undefined,
  ): number | undefined {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      if (rawValue >= 0 && rawValue <= 2) {
        return rawValue;
      }
      return this.inferProficiencyFromModifier(skill, rawValue, result, profBonus);
    }

    if (typeof rawValue !== 'string') return undefined;

    const normalized = this.normalizeTerm(rawValue);
    if (normalized.includes('expertise') || normalized.includes('专精')) return 2;
    if (normalized.includes('proficient') || normalized.includes('熟练')) return 1;
    if (normalized.includes('halfproficient') || normalized.includes('half') || normalized.includes('半熟练')) {
      return 0.5;
    }

    const numeric = this.parseInteger(rawValue);
    if (numeric === undefined) return undefined;
    if (numeric >= 0 && numeric <= 2) return numeric;

    return this.inferProficiencyFromModifier(skill, numeric, result, profBonus);
  }

  private inferProficiencyFromModifier(
    skill: string,
    modifier: number,
    result: ParsedNPC,
    profBonus: number | undefined,
  ): number {
    const ability = SKILL_TO_ABILITY[skill];
    if (!ability || !profBonus) return 1;

    const abilityScore = result.abilities[ability];
    const baseMod = this.abilityModifier(abilityScore ?? 10);
    const level = (modifier - baseMod) / profBonus;

    if (!Number.isFinite(level)) return 1;

    if (level >= 1.75) return 2;
    if (level >= 0.75) return 1;
    if (level >= 0.25) return 0.5;
    return 0;
  }

  private parseSenses(value: unknown): Record<string, number> {
    const senses: Record<string, number> = {};

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [rawSense, rawDistance] of Object.entries(value)) {
        const sense = this.normalizeSense(rawSense);
        const distance = this.parseInteger(rawDistance);
        if (!sense || distance === undefined) continue;
        senses[sense] = distance;
      }
      return senses;
    }

    if (typeof value !== 'string') return senses;

    const parts = value.split(/[,;，]/).map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      const sense = this.normalizeSense(part);
      const distance = this.parseInteger(part);
      if (!sense || distance === undefined) continue;
      senses[sense] = distance;
    }

    return senses;
  }

  private parseTerms(value: unknown, aliases: Record<string, string>): string[] {
    if (value === undefined || value === null) return [];

    const terms = new Set<string>();
    const addTerm = (candidate: string) => {
      const normalized = this.normalizeAlias(candidate, aliases);
      if (normalized) {
        terms.add(normalized);
      }
    };

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          for (const token of item.split(/[,;，]/)) {
            addTerm(token);
          }
        }
      }
      return Array.from(terms);
    }

    if (typeof value === 'string') {
      for (const token of value.split(/[,;，]/)) {
        addTerm(token);
      }
    }

    return Array.from(terms);
  }

  private normalizeAbility(value: unknown): AbilityKey | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = this.normalizeTerm(value);

    for (const [alias, key] of Object.entries(ABILITY_ALIASES)) {
      if (normalized.includes(alias)) return key;
    }

    const i18nKey = i18n.getKey(value);
    if (i18nKey?.startsWith('DND5E.Ability')) {
      const suffix = i18nKey.replace('DND5E.Ability', '').toLowerCase();
      if (suffix in ABILITY_ALIASES) return ABILITY_ALIASES[suffix as keyof typeof ABILITY_ALIASES];
    }

    return undefined;
  }

  private normalizeSkill(value: string): string | undefined {
    const normalized = this.normalizeTerm(value);
    if (normalized in SKILL_ALIASES) return SKILL_ALIASES[normalized as keyof typeof SKILL_ALIASES];

    const i18nKey = i18n.getKey(value);
    if (i18nKey?.startsWith('DND5E.Skill')) {
      return i18nKey.replace('DND5E.Skill', '').toLowerCase();
    }

    return undefined;
  }

  private normalizeMovementType(value: string): string | undefined {
    const normalized = this.normalizeTerm(value);
    if (!normalized) return undefined;
    if (normalized.includes('climb')) return 'climb';
    if (normalized.includes('fly')) return 'fly';
    if (normalized.includes('swim')) return 'swim';
    if (normalized.includes('burrow')) return 'burrow';
    if (normalized.includes('walk') || normalized.includes('speed')) return 'walk';
    if (/^\d/.test(normalized)) return 'walk';
    return undefined;
  }

  private normalizeSense(value: string): string | undefined {
    const normalized = this.normalizeTerm(value);
    if (!normalized) return undefined;

    for (const [alias, key] of Object.entries(SENSE_ALIASES)) {
      if (normalized.includes(alias)) return key;
    }

    return undefined;
  }

  private normalizeAlias(value: string, aliases: Record<string, string>): string | undefined {
    const normalized = this.normalizeTerm(value);
    if (!normalized || normalized === 'none' || normalized === '-') return undefined;

    if (normalized in aliases) {
      return aliases[normalized as keyof typeof aliases];
    }

    for (const [alias, canonical] of Object.entries(aliases)) {
      if (normalized.includes(alias)) {
        return canonical;
      }
    }

    return undefined;
  }

  private normalizeSize(value?: string): string | undefined {
    if (!value) return undefined;
    const normalized = this.normalizeTerm(value);
    const exact = SIZE_ALIASES[normalized as keyof typeof SIZE_ALIASES];
    if (exact) {
      return exact;
    }

    const aliases = Object.entries(SIZE_ALIASES).sort((a, b) => b[0].length - a[0].length);
    for (const [alias, canonical] of aliases) {
      if (normalized.includes(alias)) {
        return canonical;
      }
    }

    return undefined;
  }

  private normalizeTerm(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  private abilityLongName(value: AbilityKey): string {
    switch (value) {
      case 'str':
        return 'strength';
      case 'dex':
        return 'dexterity';
      case 'con':
        return 'constitution';
      case 'int':
        return 'intelligence';
      case 'wis':
        return 'wisdom';
      case 'cha':
        return 'charisma';
    }
  }

  private abilityModifier(score: number): number {
    return Math.floor((score - 10) / 2);
  }

  private getProficiencyBonus(cr?: number): number | undefined {
    if (cr === undefined || !Number.isFinite(cr)) return undefined;
    if (cr < 5) return 2;
    if (cr < 9) return 3;
    if (cr < 13) return 4;
    if (cr < 17) return 5;
    if (cr < 21) return 6;
    if (cr < 25) return 7;
    if (cr < 29) return 8;
    return 9;
  }

  private stripQuoted(value: string): string {
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }
}

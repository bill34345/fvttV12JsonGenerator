import type { Damage, ActionData } from '@fvtt-json-generator/models/action';
import {
  createCustomEffect as createCustomEffectFromText,
  createRandomId as createRandomIdFromText,
  extractDamagePartsFromText,
  mapDamageType,
} from './actor-text';

type GeneratedActionData = ActionData & {
  legendaryCost?: number;
  usesPerLongRest?: number;
  requiresConcentration?: boolean;
  targetCondition?: string;
};

export interface OverTimeSpec {
  formula?: string;
  damageType?: string;
  label: string;
  saveDc?: number;
  saveAbility?: string;
  saveRemove?: boolean;
}

const STATUS_ICON_OVERRIDES: Record<string, string> = {
  bleed: 'blood',
  bleeding: 'blood',
  blood: 'blood',
  dazed: 'daze',
};

const CUSTOM_STATUS_ICON_NAMES = new Set(['blood', 'daze']);

const EXPLICIT_STATUS_PATTERNS: Array<{ status: string; pattern: RegExp }> = [
  { status: 'poisoned', pattern: /\bpoisoned\b|\u4e2d\u6bd2/i },
  { status: 'paralyzed', pattern: /\bparaly[sz]ed\b|\u9ebb\u75f9/i },
  { status: 'stunned', pattern: /\bstunned\b|\u9707\u6151/i },
  { status: 'charmed', pattern: /\bcharmed\b|\u9b45\u60d1/i },
  { status: 'frightened', pattern: /\bfrightened\b|\u6050\u614c/i },
  { status: 'prone', pattern: /\bprone\b|\u5012\u5730/i },
  { status: 'restrained', pattern: /\brestrained\b|\u675f\u7f1a|\u53d7\u9650/i },
  { status: 'blinded', pattern: /\bblinded\b|\u76ee\u76f2/i },
  { status: 'deafened', pattern: /\bdeafened\b|\u8033\u804b/i },
  { status: 'invisible', pattern: /\binvisible\b|\u9690\u5f62/i },
  { status: 'petrified', pattern: /\bpetrified\b|\u77f3\u5316/i },
  { status: 'exhaustion', pattern: /\bexhaust(?:ed|ion)\b|\u529b\u7aed/i },
  { status: 'unconscious', pattern: /\bunconscious\b|\u660f\u8ff7/i },
  { status: 'grappled', pattern: /\bgrappled\b|\u64d2\u62b1|\u88ab\u64d2\u62b1/i },
  { status: 'dazed', pattern: /\bdazed\b|\u604d\u60da|\u7729\u6655/i },
  { status: 'bleeding', pattern: /\bbleed(?:ing)?\b|\u6d41\u8840/i },
];

export function statusIconPath(status: string): string {
  const normalized = status.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  const iconName = STATUS_ICON_OVERRIDES[normalized] ?? (normalized || 'unknown');
  const basePath = CUSTOM_STATUS_ICON_NAMES.has(iconName)
    ? 'icons/svg'
    : 'systems/dnd5e/icons/svg/statuses';
  return `${basePath}/${iconName}.svg`;
}

/**
 * source-derived: return statuses only from clauses that explicitly apply a
 * condition to a target/creature. Bare mentions, prerequisites, immunity text,
 * and actor-state termination clauses are not target effects.
 */
export function extractExplicitlyInflictedStatuses(text: string): string[] {
  if (hasStagedSaveOutcomes(text)) {
    return [];
  }
  const statuses = new Set<string>();
  const sentences = text.split(/[.!?;\u3002\uFF1B]+/).map((part) => part.trim()).filter(Boolean);

  for (const sentence of sentences) {
    const hasTargetContext = /\b(?:target|creature|enemy|foe)\b|\u76ee\u6807|\u751f\u7269/i.test(sentence);
    const hasOutcomeContext = /\b(?:hit|on\s+a\s+fail(?:ure|ed\s+save)|failed\s+save|instead)\s*[:：]?|(?:\u547d\u4e2d|\u8c41\u514d\u5931\u8d25|\u5931\u8d25|\u6539\u4e3a|\u5426\u5219)\s*[:：]?/i.test(sentence);
    if (!(hasTargetContext || hasOutcomeContext)) {
      continue;
    }

    const clauses = sentence.split(/,|\uFF0C|\bbut\b/i).map((part) => part.trim()).filter(Boolean);
    for (const clause of clauses) {
      const predicates: string[] = [];
      const englishApplication = clause.match(
        /\b(?:target|creature|enemy|foe|it|they)\b[\s\S]{0,120}?\b(?:is|are|becomes?|be|falls?|starts?)\s+([\s\S]+)/i,
      );
      if (englishApplication?.[1]) {
        predicates.push(englishApplication[1]);
      }

      const saveFailureApplication = clause.match(
        /\bor\s+(?:is|are|becomes?|be|falls?|starts?)\s+([\s\S]+)/i,
      );
      if (saveFailureApplication?.[1]) {
        predicates.push(saveFailureApplication[1]);
      }

      const chineseApplication = clause.match(
        /(?:\u9677\u5165|\u53d8\u4e3a|\u6210\u4e3a|\u53d7\u5230|\u5f00\u59cb)([\s\S]+)/,
      );
      if (chineseApplication?.[1]) {
        predicates.push(chineseApplication[1]);
      }

      const chinesePassiveApplication = clause.match(
        /(?:\u76ee\u6807|\u751f\u7269|\u5b83|\u5176)\s*\u88ab(?:\u9b54\u6cd5)?([\s\S]+)/,
      );
      if (chinesePassiveApplication?.[1]) {
        predicates.push(chinesePassiveApplication[1]);
      }

      for (const predicate of predicates) {
        if (/^\s*(?:already|not|no\s+longer|immune\s+to|unaffected\s+by)\b/i.test(predicate)) {
          continue;
        }
        for (const entry of EXPLICIT_STATUS_PATTERNS) {
          if (entry.pattern.test(predicate)) {
            statuses.add(entry.status);
          }
        }
      }
    }
  }

  return [...statuses];
}

function hasStagedSaveOutcomes(text: string): boolean {
  const hasInitialStage = /首次失败|第一次失败|\bfirst\s+failed\s+save\b|\bon\s+a\s+failed\s+save\b/i.test(text);
  const hasLaterStage = /再次失败|第二次失败|又一次失败|\bsecond\s+failed\s+save\b|\bfails?(?:\s+this|\s+the)?\s+save\s+again\b/i.test(text);
  if (!(hasInitialStage && hasLaterStage)) return false;

  const mentionedStatuses = new Set(
    EXPLICIT_STATUS_PATTERNS
      .filter((entry) => entry.pattern.test(text))
      .map((entry) => entry.status),
  );
  return mentionedStatuses.size >= 2;
}

export function extractSwallowDamage(action: GeneratedActionData): Damage | undefined {
  const attackDamages = action.attack?.damage ?? [];
  const explicitNecrotic = attackDamages.find((damage: Damage) => damage.type === 'necrotic');
  if (explicitNecrotic) {
    return explicitNecrotic;
  }

  const desc = action.desc ?? '';
  const englishNecrotic = desc.match(/\b(\d+d\d+(?:\s*[+\-]\s*\d+)?)\s*\)?\s*necrotic\s+damage/i);
  if (englishNecrotic?.[1]) {
    return {
      formula: englishNecrotic[1].replace(/\s+/g, ''),
      type: 'necrotic',
    };
  }

  const extracted = extractDamagePartsFromText(desc);
  return extracted.find((damage: Damage) => damage.type === 'necrotic') ?? extracted[0];
}

export function createRandomId(): string {
  return createRandomIdFromText();
}

export function createCustomEffect(options: {
  name: string;
  img: string;
  statuses?: string[];
  changes?: Array<Record<string, unknown>>;
  duration?: Record<string, unknown>;
  flags?: Record<string, unknown>;
}): any {
  return createCustomEffectFromText(options);
}

export function buildOverTimeFlag(spec: OverTimeSpec): Record<string, string> {
  const formula = spec.formula?.replace(/\s+/g, '');
  const damageType = spec.damageType?.trim();
  if (!formula || !damageType) {
    return {};
  }

  const parts = [
    'turn=start',
    `damageRoll=${formula}`,
    `damageType=${damageType}`,
    `label=${spec.label}`,
  ];
  if (typeof spec.saveDc === 'number' && spec.saveAbility) {
    parts.push(`saveDC=${spec.saveDc}`);
    parts.push(`saveAbility=${spec.saveAbility}`);
    if (spec.saveRemove) {
      parts.push('saveRemove=True');
    }
  }
  return { 'midi-qol.OverTime': parts.join(',') };
}

function extractBleedingOverTimeSpec(text: string): OverTimeSpec | null {
  const bleedingIndex = text.search(/bleed|bleeding|流血/i);
  if (bleedingIndex === -1) {
    return null;
  }

  const clause = text.slice(bleedingIndex, bleedingIndex + 180);
  const formula = clause.match(/`?(\d+d\d+(?:\s*[+\-]\s*\d+)?)`?/i)?.[1]?.replace(/\s+/g, '');
  const damageType =
    clause.match(/\b(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\s+damage\b/i)?.[1]?.toLowerCase()
    ?? mapDamageType(clause.match(/([一-龥]{2,4})伤害/)?.[1] ?? '');
  if (!formula || !damageType) {
    return null;
  }

  return {
    formula,
    damageType,
    label: /流血/.test(clause) ? '流血 (Bleeding)' : 'Bleeding',
  };
}

export function generateConditionEffects(desc: string, activities: any, actionName?: string): any[] {
  const effects: any[] = [];
  if (!desc) return effects;

  const conditionMap: Record<string, { en: string; enLabel: string }> = {
    '中毒':     { en: 'poisoned',   enLabel: 'Poisoned' },
    '麻痹':     { en: 'paralyzed',  enLabel: 'Paralyzed' },
    '眩晕':     { en: 'stunned',    enLabel: 'Stunned' },
    '魅惑':     { en: 'charmed',    enLabel: 'Charmed' },
    '恐慌':     { en: 'frightened', enLabel: 'Frightened' },
    '倒地':     { en: 'prone',      enLabel: 'Prone' },
    '束缚':     { en: 'restrained', enLabel: 'Restrained' },
    '目盲':     { en: 'blinded',    enLabel: 'Blinded' },
    '耳聋':     { en: 'deafened',   enLabel: 'Deafened' },
    '隐形':     { en: 'invisible',  enLabel: 'Invisible' },
    '石化':     { en: 'petrified',  enLabel: 'Petrified' },
    '力竭':     { en: 'exhaustion', enLabel: 'Exhaustion' },
    '昏迷':     { en: 'unconscious',enLabel: 'Unconscious' },
    '擒抱':     { en: 'grappled',   enLabel: 'Grappled' },
    '恍惚':     { en: 'dazed',      enLabel: 'Dazed' },
    '流血':     { en: 'bleeding',   enLabel: 'Bleeding' }
  };

  const generateId = () => {
    const chars = 'abcdef0123456789';
    let res = '';
    for (let i = 0; i < 16; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };

  const isSwallow = actionName && (
    actionName.includes('吞咽') || actionName.includes('Swallow')
  );
  const bleedingOverTime = extractBleedingOverTimeSpec(desc);
  const explicitlyInflicted = new Set(extractExplicitlyInflictedStatuses(desc));

  for (const [cn, info] of Object.entries(conditionMap)) {
    if (explicitlyInflicted.has(info.en)) {
      if (isSwallow && cn === '擒抱') continue;
      const flags = cn === '流血' && bleedingOverTime ? buildOverTimeFlag(bleedingOverTime) : {};
      effects.push({
        _id: generateId(),
        name: `${cn} (${info.enLabel})`,
        type: 'base',
        system: {},
        changes: [],
        disabled: false,
        duration: { startTime: null, seconds: null, combat: null, rounds: null, turns: null, startRound: null, startTurn: null },
        description: '',
        origin: null,
        tint: '#ffffff',
        transfer: false,
        img: statusIconPath(info.en),
        statuses: [info.en],
        flags
      });
    }
  }

  if (effects.length > 0 && activities && typeof activities === 'object') {
    for (const activity of Object.values(activities) as any[]) {
      if (activity && typeof activity === 'object') {
        if (!activity.effects) activity.effects = [];
        for (const effect of effects) {
          activity.effects.push({ _id: effect._id });
        }
      }
    }
  }
  return effects;
}

export function generateEnhancedConditionEffects(desc: string, activities: any, actionName?: string): any[] {
  const effects: any[] = [];
  if (!desc) return effects;

  const generateId = () => {
    const chars = 'abcdef0123456789';
    let res = '';
    for (let i = 0; i < 16; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };

  const isSwallow = Boolean(actionName && /Swallow|吞咽/.test(actionName));
  const conditionEntries = [
    { cn: '中毒', en: 'poisoned', label: 'Poisoned' },
    { cn: '麻痹', en: 'paralyzed', label: 'Paralyzed' },
    { cn: '震慑', en: 'stunned', label: 'Stunned' },
    { cn: '魅惑', en: 'charmed', label: 'Charmed' },
    { cn: '恐慌', en: 'frightened', label: 'Frightened' },
    { cn: '倒地', en: 'prone', label: 'Prone' },
    { cn: '束缚', en: 'restrained', label: 'Restrained' },
    { cn: '受限', en: 'restrained', label: 'Restrained' },
    { cn: '目盲', en: 'blinded', label: 'Blinded' },
    { cn: '耳聋', en: 'deafened', label: 'Deafened' },
    { cn: '隐形', en: 'invisible', label: 'Invisible' },
    { cn: '石化', en: 'petrified', label: 'Petrified' },
    { cn: '被擒抱', en: 'grappled', label: 'Grappled' },
    { cn: '擒抱', en: 'grappled', label: 'Grappled' },
    { cn: '眩晕', en: 'dazed', label: 'Dazed' },
    { cn: '恍惚', en: 'dazed', label: 'Dazed' },
    { cn: 'Dazed', en: 'dazed', label: 'Dazed' },
    { cn: '流血', en: 'bleeding', label: 'Bleeding' },
    { cn: '中毒', en: 'poisoned', label: 'Poisoned' },
    { cn: '麻痹', en: 'paralyzed', label: 'Paralyzed' },
    { cn: '震慑', en: 'stunned', label: 'Stunned' },
    { cn: '魅惑', en: 'charmed', label: 'Charmed' },
    { cn: '恐慌', en: 'frightened', label: 'Frightened' },
    { cn: '倒地', en: 'prone', label: 'Prone' },
    { cn: '受限', en: 'restrained', label: 'Restrained' },
    { cn: '目盲', en: 'blinded', label: 'Blinded' },
    { cn: '耳聋', en: 'deafened', label: 'Deafened' },
    { cn: '隐形', en: 'invisible', label: 'Invisible' },
    { cn: '石化', en: 'petrified', label: 'Petrified' },
    { cn: '力竭', en: 'exhaustion', label: 'Exhaustion' },
    { cn: '昏迷', en: 'unconscious', label: 'Unconscious' },
    { cn: '被擒抱', en: 'grappled', label: 'Grappled' },
    { cn: '恍惚', en: 'dazed', label: 'Dazed' },
    { cn: '流血', en: 'bleeding', label: 'Bleeding' },
  ] as const;

  const englishOnlyStatusLabels: Record<string, string> = {
    poisoned: '中毒',
    paralyzed: '麻痹',
    stunned: '震慑',
    charmed: '魅惑',
    frightened: '恐慌',
    prone: '倒地',
    restrained: '受限',
    blinded: '目盲',
    deafened: '耳聋',
    invisible: '隐形',
    petrified: '石化',
    exhaustion: '力竭',
    unconscious: '昏迷',
    grappled: '被擒抱',
    dazed: '恍惚',
    bleeding: '流血',
  };
  const bleedingOverTime = extractBleedingOverTimeSpec(desc);
  const explicitlyInflicted = new Set(extractExplicitlyInflictedStatuses(desc));
  const untilDamagedStatuses = extractUntilDamagedStatuses(desc, explicitlyInflicted);

  const generatedStatuses = new Set<string>();
  for (const entry of conditionEntries) {
    const hasLocalizedLabel = desc.includes(entry.cn);
    const hasEnglishStatus = desc.toLowerCase().includes(entry.en);
    if (!explicitlyInflicted.has(entry.en)) {
      continue;
    }
    if (isSwallow && (entry.en === 'grappled' || entry.en === 'prone')) {
      continue;
    }
    if (generatedStatuses.has(entry.en)) {
      continue;
    }
    generatedStatuses.add(entry.en);

    effects.push({
      _id: generateId(),
      name: `${hasEnglishStatus && !hasLocalizedLabel ? (englishOnlyStatusLabels[entry.en] ?? entry.cn) : entry.cn} (${entry.label})`,
      type: 'base',
      system: {},
      changes: [],
      disabled: false,
      duration: {
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
      img: statusIconPath(entry.en),
      statuses: [entry.en],
      flags: {
        ...(entry.en === 'bleeding' && bleedingOverTime ? buildOverTimeFlag(bleedingOverTime) : {}),
        ...(untilDamagedStatuses.has(entry.en) ? {
          fvttJsonGenerator: { sourceDuration: 'untilDamaged' },
        } : {}),
      },
    });
  }

  if (effects.length > 0 && activities && typeof activities === 'object') {
    const hasUntilDamagedEffect = effects.some(
      (effect) => effect.flags?.fvttJsonGenerator?.sourceDuration === 'untilDamaged',
    );
    for (const activity of Object.values(activities) as any[]) {
      if (activity && typeof activity === 'object') {
        if (!activity.effects) activity.effects = [];
        for (const effect of effects) {
          activity.effects.push({ _id: effect._id });
        }
        if (hasUntilDamagedEffect) {
          activity.duration = {
            ...(activity.duration ?? {}),
            units: 'spec',
            concentration: activity.duration?.concentration ?? false,
            override: activity.duration?.override ?? false,
          };
        }
      }
    }
  }
  return effects;
}

function extractUntilDamagedStatuses(
  desc: string,
  explicitlyInflicted: ReadonlySet<string>,
): Set<string> {
  const statuses = new Set<string>();
  const durationPatterns = [
    /(?:until|lasts?\s+until)[^.!?;]{0,80}(?:(?:the\s+)?target|it|that\s+creature|the\s+creature)\s+(?:takes?|suffers?|receives?)\s+(?:any\s+)?damage/i,
    /(?:直到|直至)[^。！？；.!?;]{0,48}(?:(?:目标|它|该生物|此生物)\s*)?(?:受到|承受)(?:任意|任何)?\s*伤害(?:为止)?/,
  ];
  const sentences = desc
    .split(/[.!?;。！？；]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index] ?? '';
    const durationMatch = durationPatterns
      .map((pattern) => pattern.exec(sentence))
      .find((match): match is RegExpExecArray => Boolean(match));
    if (!durationMatch) {
      continue;
    }

    const prefix = sentence.slice(0, durationMatch.index);
    const sameSentenceStatuses = EXPLICIT_STATUS_PATTERNS
      .filter((entry) => explicitlyInflicted.has(entry.status) && entry.pattern.test(prefix))
      .map((entry) => entry.status);
    if (sameSentenceStatuses.length > 0) {
      sameSentenceStatuses.forEach((status) => statuses.add(status));
      continue;
    }

    const refersToPreviousCondition = /\bthis\s+condition\s+lasts?\s+until\b/i.test(sentence)
      || /(?:该|此|这个?)?\s*(?:状态|效果)[^。！？]{0,16}(?:直到|直至)/.test(sentence);
    if (!refersToPreviousCondition || index === 0) {
      continue;
    }

    const previousStatuses = extractExplicitlyInflictedStatuses(sentences[index - 1] ?? '')
      .filter((status) => explicitlyInflicted.has(status));
    if (new Set(previousStatuses).size === 1) {
      statuses.add(previousStatuses[0]!);
    }
  }

  return statuses;
}

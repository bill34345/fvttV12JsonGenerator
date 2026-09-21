import type { Damage, ActionData } from '@fvtt-json-generator/models/action';

// Effect construction is owned by the generation package.
import {
  createCustomEffect as createCustomEffectFromText,
  createRandomId as createRandomIdFromText,
  extractDamagePartsFromText,
} from './actor-text';
import { createStableDocumentId } from './stableId';
import { buildConditionFlag, createConditionInstance, getConditionDefinition, type ConditionId, type ConditionParams } from '@fvtt-json-generator/contracts/conditions';
import { buildBleedingFlag, extractBleedingSpec } from './bleeding';
import { extractBurningSpec } from './burning';

type GeneratedActionData = ActionData & {
  legendaryCost?: number;
  usesPerLongRest?: number;
  requiresConcentration?: boolean;
  targetCondition?: string;
};

const STATUS_ICON_OVERRIDES: Record<string, string> = {
  bleed: 'blood',
  bleeding: 'blood',
  blood: 'blood',
  dazed: 'daze',
  addled: 'stunned',
  bewildered: 'stunned',
  burning: 'burning',
  clumsy: 'encumbered',
  defenseless: 'cursed',
  distracted: 'cursed',
  enfeebled: 'encumbered',
  frozen: 'restrained',
  helpless: 'incapacitated',
  immobilized: 'restrained',
  jinxed: 'cursed',
  shocked: 'stunned',
  sickened: 'poisoned',
  slowed: 'encumbered',
  staggered: 'prone',
  valor: 'marked',
  weakened: 'encumbered',
};

const CUSTOM_STATUS_ICON_NAMES = new Set(['blood', 'daze']);

const EXPLICIT_STATUS_PATTERNS: Array<{ status: string; pattern: RegExp }> = [
  { status: 'addled', pattern: /\baddled\b|心智混乱|心智混亂/i },
  { status: 'bewildered', pattern: /\bbewildered\b|迷乱|迷亂/i },
  { status: 'burning', pattern: /\bburning\b|燃烧|燃燒/i },
  { status: 'clumsy', pattern: /\bclumsy\b|笨拙/i },
  { status: 'defenseless', pattern: /\bdefenseless\b|无防备|無防備/i },
  { status: 'distracted', pattern: /\bdistracted\b|分心/i },
  { status: 'enfeebled', pattern: /\benfeebled\b|衰弱/i },
  { status: 'frozen', pattern: /\bfrozen\b|冻结|凍結/i },
  { status: 'helpless', pattern: /\bhelpless\b|无助|無助/i },
  { status: 'immobilized', pattern: /\bimmobilized\b|定身/i },
  { status: 'jinxed', pattern: /\bjinxed\b|厄运|厄運/i },
  { status: 'shocked', pattern: /\bshocked\b|电击|電擊|震击|震擊/i },
  { status: 'sickened', pattern: /\bsickened\b|病弱/i },
  { status: 'slowed', pattern: /\bslowed\b|减速|減速/i },
  { status: 'staggered', pattern: /\bstaggered\b|踉跄|踉蹌/i },
  { status: 'valor', pattern: /\bvalor\b|英勇/i },
  { status: 'weakened', pattern: /\bweakened\b|虚弱|虛弱/i },
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
      const predicates: Array<{ text: string; allowedStatuses?: ReadonlySet<string> }> = [];
      const englishApplication = clause.match(
        /\b(?:target|creature|enemy|foe|it|they)\b[\s\S]{0,120}?\b(?:is|are|becomes?|be|falls?|starts?)\s+([\s\S]+)/i,
      );
      if (englishApplication?.[1]) {
        predicates.push({ text: englishApplication[1] });
      }

      const gainedParameterizedCondition = clause.match(
        /\b(?:target|creature|enemy|foe|it|they)\b[\s\S]{0,120}?\b(?:gains?|receives?|acquires?)\s+([\s\S]+)/i,
      );
      if (gainedParameterizedCondition?.[1]) {
        predicates.push({ text: gainedParameterizedCondition[1], allowedStatuses: new Set(['bleeding', 'burning']) });
      }

      const saveFailureApplication = clause.match(
        /\bor\s+(?:is|are|becomes?|be|falls?|starts?)\s+([\s\S]+)/i,
      );
      if (saveFailureApplication?.[1]) {
        predicates.push({ text: saveFailureApplication[1] });
      }

      const chineseApplication = clause.match(
        /(?:\u9677\u5165|\u53d8\u4e3a|\u6210\u4e3a|\u53d7\u5230|\u5f00\u59cb)([\s\S]+)/,
      );
      if (chineseApplication?.[1]) {
        predicates.push({ text: chineseApplication[1] });
      }

      const gainedChineseParameterizedCondition = clause.match(
        /(?:\u76ee\u6807|\u751f\u7269|\u5b83|\u5176)?\s*(?:\u83b7\u5f97|\u7372\u5f97|\u9644\u52a0)\s*([\s\S]+)/,
      );
      if (gainedChineseParameterizedCondition?.[1]) {
        predicates.push({ text: gainedChineseParameterizedCondition[1], allowedStatuses: new Set(['bleeding', 'burning']) });
      }

      const chinesePassiveApplication = clause.match(
        /(?:\u76ee\u6807|\u751f\u7269|\u5b83|\u5176)\s*\u88ab(?:\u9b54\u6cd5)?([\s\S]+)/,
      );
      if (chinesePassiveApplication?.[1]) {
        predicates.push({ text: chinesePassiveApplication[1] });
      }

      for (const predicate of predicates) {
        if (/^\s*(?:already|not|no\s+longer|immune\s+to|unaffected\s+by)\b/i.test(predicate.text)) {
          continue;
        }
        for (const entry of EXPLICIT_STATUS_PATTERNS) {
          if (predicate.allowedStatuses && !predicate.allowedStatuses.has(entry.status)) continue;
          if (entry.pattern.test(predicate.text)) {
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
  const attackFormulas = new Set(attackDamages.map((damage: Damage) => damage.formula.replace(/\s+/gu, '')));
  return extracted.find((damage: Damage) => !attackFormulas.has(damage.formula.replace(/\s+/gu, '')))
    ?? extracted.find((damage: Damage) => damage.type === 'necrotic')
    ?? extracted[0];
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
  description?: string;
  showIcon?: number;
  flags?: Record<string, unknown>;
}): any {
  return createCustomEffectFromText(options);
}

export function buildConditionTemplateFlag(conditionId: ConditionId, params: ConditionParams = {}): Record<string, Record<string, unknown>> {
  return buildConditionFlag(createConditionInstance(conditionId, params, {
    instanceId: `template-${conditionId}`,
    template: true,
  }));
}

export function isGeneratedConditionId(value: string): value is ConditionId {
  return Boolean(getConditionDefinition(value));
}

export function conditionParamsForText(
  conditionId: string,
  text: string,
  overrides: { formula?: string; damageType?: string } = {},
): ConditionParams | undefined {
  const source = String(text ?? '');
  const markerPattern: Record<string, RegExp> = {
    burning: /burning|燃烧|燃燒/iu,
    frozen: /frozen|冻结|凍結/iu,
    jinxed: /jinxed|厄运|厄運/iu,
    valor: /valor|英勇/iu,
  };
  const marker = source.search(markerPattern[conditionId] ?? new RegExp(conditionId, 'iu'));
  const nearby = marker >= 0 ? source.slice(marker, marker + 240) : source;
  const formula = nearby.match(/(?<![A-Za-z0-9])\d+d\d+(?:\s*[+-]\s*\d+)?/i)?.[0]?.replace(/\s+/g, '');
  if (conditionId === 'bleeding') return undefined;
  if (conditionId === 'jinxed' || conditionId === 'valor') return formula ? { formula } : undefined;
  if (conditionId === 'burning') {
    const spec = extractBurningSpec(source, overrides);
    return spec ? { formula: spec.formula, damageType: spec.damageType, timing: spec.timing } : undefined;
  }
  if (conditionId === 'frozen') {
    const dc = nearby.match(/\bDC\s*(\d+)\b/i)?.[1] ?? nearby.match(/DC\s*(\d+)/i)?.[1];
    return dc ? { escapeDC: Number(dc) } : undefined;
  }
  if (isGeneratedConditionId(conditionId)) return {};
  return undefined;
}

export function generateConditionEffects(desc: string, activities: any, actionName?: string): any[] {
  const effects: any[] = [];
  if (!desc) return effects;

  const conditionMap: Record<string, { en: string; enLabel: string }> = {
    'Addled':    { en: 'addled',     enLabel: 'Addled' },
    'Bewildered':{ en: 'bewildered', enLabel: 'Bewildered' },
    '燃烧':      { en: 'burning',   enLabel: 'Burning' },
    '燃燒':      { en: 'burning',   enLabel: 'Burning' },
    'Clumsy':    { en: 'clumsy',     enLabel: 'Clumsy' },
    'Defenseless': { en: 'defenseless', enLabel: 'Defenseless' },
    'Distracted': { en: 'distracted', enLabel: 'Distracted' },
    'Enfeebled': { en: 'enfeebled', enLabel: 'Enfeebled' },
    'Frozen':    { en: 'frozen',     enLabel: 'Frozen' },
    'Helpless':  { en: 'helpless',   enLabel: 'Helpless' },
    'Immobilized': { en: 'immobilized', enLabel: 'Immobilized' },
    'Jinxed':    { en: 'jinxed',     enLabel: 'Jinxed' },
    'Shocked':   { en: 'shocked',    enLabel: 'Shocked' },
    'Sickened':  { en: 'sickened',   enLabel: 'Sickened' },
    'Slowed':    { en: 'slowed',    enLabel: 'Slowed' },
    'Staggered': { en: 'staggered', enLabel: 'Staggered' },
    'Valor':     { en: 'valor',     enLabel: 'Valor' },
    'Weakened':  { en: 'weakened',  enLabel: 'Weakened' },
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
  const bleedingSpec = extractBleedingSpec(desc);
  const explicitlyInflicted = new Set(extractExplicitlyInflictedStatuses(desc));

  for (const [cn, info] of Object.entries(conditionMap)) {
    if (explicitlyInflicted.has(info.en)) {
      if (isSwallow && cn === '擒抱') continue;
      const customParams = conditionParamsForText(info.en, desc);
      const flags = cn === '流血' && bleedingSpec
        ? buildBleedingFlag(bleedingSpec)
        : customParams !== undefined && isGeneratedConditionId(info.en)
          ? buildConditionTemplateFlag(info.en, customParams)
          : {};
      effects.push({
        _id: generateId(),
        name: `${cn} (${info.enLabel})`,
        type: 'base',
        system: {},
        changes: [],
        disabled: false,
        duration: { startTime: null, seconds: null, combat: null, rounds: null, turns: null, startRound: null, startTurn: null },
        description: cn === '流血' && bleedingSpec ? bleedingSpec.endCondition : '',
        origin: null,
        tint: '#ffffff',
        ...(isGeneratedConditionId(info.en) ? { showIcon: 2 } : {}),
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

export function generateEnhancedConditionEffects(
  desc: string,
  activities: any,
  actionName?: string,
  sourceLogicalPath?: string,
): any[] {
  const effects: any[] = [];
  if (!desc) return effects;

  const generateId = (conditionId: string) => createStableDocumentId({
    path: 'generatedConditionEffects',
    actionName: actionName ?? '',
    sourceLogicalPath: sourceLogicalPath ?? null,
    conditionId,
    sourceDescription: desc,
  });

  const isSwallow = Boolean(actionName && /Swallow|吞咽/.test(actionName));
  const conditionEntries = [
    { cn: 'Addled', en: 'addled', label: 'Addled' },
    { cn: 'Bewildered', en: 'bewildered', label: 'Bewildered' },
    { cn: 'Burning', en: 'burning', label: 'Burning' },
    { cn: 'Clumsy', en: 'clumsy', label: 'Clumsy' },
    { cn: 'Defenseless', en: 'defenseless', label: 'Defenseless' },
    { cn: 'Distracted', en: 'distracted', label: 'Distracted' },
    { cn: 'Enfeebled', en: 'enfeebled', label: 'Enfeebled' },
    { cn: 'Frozen', en: 'frozen', label: 'Frozen' },
    { cn: 'Helpless', en: 'helpless', label: 'Helpless' },
    { cn: 'Immobilized', en: 'immobilized', label: 'Immobilized' },
    { cn: 'Jinxed', en: 'jinxed', label: 'Jinxed' },
    { cn: 'Shocked', en: 'shocked', label: 'Shocked' },
    { cn: 'Sickened', en: 'sickened', label: 'Sickened' },
    { cn: 'Slowed', en: 'slowed', label: 'Slowed' },
    { cn: 'Staggered', en: 'staggered', label: 'Staggered' },
    { cn: 'Valor', en: 'valor', label: 'Valor' },
    { cn: 'Weakened', en: 'weakened', label: 'Weakened' },
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
  const bleedingSpec = extractBleedingSpec(desc);
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
      _id: generateId(entry.en),
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
      description: entry.en === 'bleeding' && bleedingSpec ? bleedingSpec.endCondition : '',
      origin: null,
      tint: '#ffffff',
      ...(entry.en === 'bleeding' && bleedingSpec ? { showIcon: 2 } : {}),
      transfer: false,
      img: statusIconPath(entry.en),
      statuses: [entry.en],
      flags: {
        ...(entry.en === 'bleeding' && bleedingSpec
          ? buildBleedingFlag(bleedingSpec)
          : conditionParamsForText(entry.en, desc) !== undefined && isGeneratedConditionId(entry.en)
            ? buildConditionTemplateFlag(entry.en, conditionParamsForText(entry.en, desc)!)
            : {}),
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

/**
 * Encounter staged-condition markers are emitted only by the companion source
 * renderer after it has verified the IR evidence. Their carrier text may still
 * pass through the legacy description inference earlier in generation, so
 * remove only that carrier's plain inferred standard-status effects and links.
 */
export function suppressEncounterStagedInferredEffects(actor: any): void {
  for (const item of Array.isArray(actor?.items) ? actor.items : []) {
    const statuses = encounterStagedMarkerStatuses(item);
    if (statuses.size === 0) continue;
    const effects = Array.isArray(item?.effects) ? item.effects : [];
    const removed = new Set(effects
      .filter((effect: any) => isPlainInferredStagedEffect(effect, statuses))
      .map((effect: any) => effect._id)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0));
    if (removed.size === 0) continue;
    item.effects = effects.filter((effect: any) => !removed.has(effect?._id));
    for (const activity of Object.values(item?.system?.activities ?? {}) as any[]) {
      if (Array.isArray(activity?.effects)) activity.effects = activity.effects.filter((effect: any) => !removed.has(effect?._id));
    }
  }
}

function encounterStagedMarkerStatuses(item: any): Set<string> {
  const mechanics = item?.flags?.fvttJsonGenerator?.behaviorMechanics;
  if (!Array.isArray(mechanics)) return new Set();
  const statuses = new Set<string>();
  for (const mechanic of mechanics) {
    const conditions: string[] = Array.isArray(mechanic?.conditions) ? mechanic.conditions.map(String) : [];
    if (!isCompleteEncounterStagedMarker(item, mechanic, conditions)) continue;
    for (const condition of conditions) {
      const match = condition.match(/^encounter-staged-status:([a-z-]+)$/u);
      if (match?.[1]) statuses.add(match[1]);
    }
  }
  return statuses;
}

function isCompleteEncounterStagedMarker(item: any, mechanic: any, conditions: readonly string[]): boolean {
  const match = /^encounter-staged-(trait|action|bonus|reaction|legendary)-(\d+)$/u.exec(String(mechanic?.id ?? ''));
  if (!match?.[1] || !match[2]) return false;
  const index = Number.parseInt(match[2], 10) - 1;
  const expected = ({
    trait: { carrier: '特性', source: 'traits' }, action: { carrier: '动作', source: 'actions' },
    bonus: { carrier: '附赠动作', source: 'bonusActions' }, reaction: { carrier: '反应', source: 'reactions' },
    legendary: { carrier: '传奇动作', source: 'legendaryActions' },
  } as Record<string, { carrier: string; source: string }>)[match[1]];
  if (!expected || index < 0) return false;
  const carrier = mechanic?.carrier;
  const itemSection = item?.flags?.['tidy5e-sheet']?.section ?? item?.flags?.['tidy5e-sheet']?.actionSection;
  const paths = conditions.filter((value) => value.startsWith('encounter-staged:/creature/'));
  const coverage = conditions.filter((value) => value.startsWith('encounter-staged-coverage:'));
  return mechanic.kind === 'lifecycle'
    && mechanic.coverage === 'literal'
    && mechanic.executionMode === 'gm-assisted'
    && mechanic.ruleSource === 'source-derived'
    && carrier?.section === expected.carrier
    && carrier?.name === item?.name
    && itemSection === expected.carrier
    && paths.length > 0
    && paths.every((path) => new RegExp(`^encounter-staged:/creature/${expected.source}/${index}/appliedConditions/(?:0|[1-9]\\d*)$`).test(path))
    && coverage.length === 1
    && coverage[0] === `encounter-staged-coverage:actor.${expected.source}`
    && Array.isArray(mechanic?.gmSteps)
    && mechanic.gmSteps.length >= 2
    && mechanic.gmSteps.every((step: unknown) => typeof step === 'string' && step.trim().length > 0);
}

function isPlainInferredStagedEffect(effect: any, stagedStatuses: ReadonlySet<string>): boolean {
  const statuses: string[] = Array.isArray(effect?.statuses) ? effect.statuses.map(String) : [];
  const flags = effect?.flags?.fvttJsonGenerator ?? {};
  return statuses.length > 0
    && statuses.every((status) => stagedStatuses.has(status))
    && effect?.disabled === false
    && effect?.description === ''
    && Array.isArray(effect?.changes) && effect.changes.length === 0
    && !flags.sourceDerivedEmbeddedEffect
    && !flags.behaviorState
    && !flags.sourceDerivedAcEffect;
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

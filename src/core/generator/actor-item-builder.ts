import type { ActionData } from '../parser/action';
import type { StructuredActionData } from '../models/action';
import type { ActivityGenerator } from './activity';

type GeneratedActionData = ActionData & {
  legendaryCost?: number;
  usesPerLongRest?: number;
  requiresConcentration?: boolean;
  targetCondition?: string;
};

/**
 * Create daily uses structure.
 */
export function createDailyUses(value: number): Record<string, unknown> {
  return {
    spent: 0,
    value,
    max: value,
    per: 'day',
    recovery: [{ period: 'day', type: 'recoverAll' }],
  };
}

/**
 * Resolve activation cost for an item.
 */
export function resolveItemActivationCost(
  activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' | 'special',
  legendaryCost?: number,
): number | null {
  if (!activationType || activationType === 'special') {
    return null;
  }
  return legendaryCost ?? 1;
}

/**
 * Build item range from action data.
 */
export function buildItemRange(action: GeneratedActionData): Record<string, number | string | null> {
  if (action.attack?.type === 'mwak') {
    return {
      value: null,
      long: null,
      reach: parseNumericDistance(action.attack.reach ?? action.attack.range) ?? 5,
      units: 'ft',
    };
  }

  const [value, long] = parseAttackRange(action.attack?.range);
  return {
    value,
    long,
    reach: null,
    units: 'ft',
  };
}

/**
 * Parse numeric distance from string.
 */
function parseNumericDistance(value: string | undefined): number | null {
  const match = value?.match(/(\d+)/);
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
}

/**
 * Parse attack range.
 */
function parseAttackRange(range: string | undefined): [number | null, number | null] {
  const match = range?.match(/(\d+)(?:\s*\/\s*(\d+))?/);
  if (!match?.[1]) {
    return [null, null];
  }
  return [Number.parseInt(match[1], 10), match[2] ? Number.parseInt(match[2], 10) : null];
}

/**
 * Map trigger type string to activity trigger type.
 */
export function mapTriggerType(trigger: string): string {
  const map: Record<string, string> = {
    '命中后': 'hit',
    '失败': 'saveFailure',
    '成功': 'saveSuccess',
    '低值': 'damageThreshold',
    '降至0': 'reduceHP',
    '濒血': 'halfHP',
    'special': 'special',
  };
  return map[trigger] || 'special';
}

/**
 * Resolve display section based on activation type.
 */
export function resolveDisplaySection(
  activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' | 'special',
  isPassive: boolean,
  route: 'chinese' | 'english' = 'chinese',
): string {
  const localized = route === 'chinese';
  if (isPassive || activationType === '' || activationType === 'special') {
    return localized ? '特性' : 'Traits';
  }
  if (activationType === 'bonus') {
    return localized ? '附赠动作' : 'Bonus Actions';
  }
  if (activationType === 'reaction') {
    return localized ? '反应' : 'Reactions';
  }
  if (activationType === 'lair') {
    return localized ? '巢穴效应' : 'Regional Effects';
  }
  return localized ? '动作' : 'Actions';
}

/**
 * Resolve display section for fixed activation types.
 */
export function resolveDisplaySectionFixed(
  activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' | 'special',
  isPassive: boolean,
  route: 'chinese' | 'english' = 'chinese',
): string {
  if (activationType === 'legendary') {
    return 'Legendary Actions';
  }
  return resolveDisplaySection(activationType, isPassive, route);
}

/**
 * Build item section flags.
 */
export function buildItemSectionFlags(
  activationType: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | '' | 'special',
  isPassive: boolean,
  route: 'chinese' | 'english' = 'chinese',
): Record<string, any> {
  const section = resolveDisplaySectionFixed(activationType, isPassive, route);
  return {
    'tidy5e-sheet': {
      section,
      actionSection: section,
    },
    fvttJsonGenerator: {
      effectHints: {},
    },
  };
}

/**
 * Convert structured action to activity data.
 */
export function structuredActionToActivityData(action: StructuredActionData): any {
  const base: any = {
    name: action.name,
    englishName: action.englishName,
    type: action.type,
    desc: action.describe || '',
  };

  if (action.type === 'attack' && action.attackType) {
    base.attack = { type: action.attackType };
    if (action.toHit !== undefined) base.attack.damage = [];
    if (action.damage && action.damage.length > 0) {
      base.attack.damage = action.damage.map(d => ({ formula: d.formula, type: d.type }));
    }
    if (action.toHit !== undefined) {
      base.attack.toHit = action.toHit;
    }
    if (action.range) base.range = action.range;
  }

  if ((action.type === 'save' || action.DC) && action.DC) {
    base.save = { dc: action.DC, ability: action.ability || 'str' };
    if (action.aoe) {
      base.save.dc = action.DC;
      base.aoe = { type: action.aoe.shape, template: { distance: action.aoe.range, type: action.aoe.shape } };
    }
  }

  if (action.target) {
    base.target = { count: action.target.count === 'all' ? 'all' : (typeof action.target.count === 'number' ? action.target.count : 1), type: action.target.type };
    if (action.target.special) base.target.affects = { text: action.target.special };
  }

  if (action.failEffects && action.failEffects.length > 0) {
    const failEffect = action.failEffects[0];
    if (failEffect?.formula) {
      base.damage = base.damage || [];
      base.damage.push({ formula: failEffect.formula, type: failEffect.type || 'damage' });
    }
    if (failEffect?.state) {
      base.saveFailure = failEffect.state;
    }
  }

  return base;
}

/**
 * Attach sub-activities to item.
 */
export function attachSubActivities(
  item: any,
  subActions: StructuredActionData['subActions'],
  activityGenerator: ActivityGenerator,
): void {
  if (!subActions || !subActions.length) return;
  const activities = item?.system?.activities;
  if (!activities) return;

  const mainActivityKey = Object.keys(activities)[0];
  if (!mainActivityKey) return;

  const mainActivity = activities[mainActivityKey];
  if (!mainActivity) return;

  for (const sub of subActions) {
    const subData = structuredActionToActivityData(sub as StructuredActionData);
    const subActivity = activityGenerator.generate(subData);
    const subKey = Object.keys(subActivity)[0];
    if (subKey && subActivity[subKey]) {
      activities[subKey] = subActivity[subKey];
      if (sub.trigger) {
        activities[subKey].trigger = { type: mapTriggerType(sub.trigger) };
      }
      if (sub.threshold !== undefined) {
        activities[subKey].damageThreshold = sub.threshold;
      }
    }
  }
}

/**
 * Attach embedded effects to item.
 */
export function attachEmbeddedEffects(item: any, embeddedEffects: StructuredActionData['embeddedEffects']): void {
  if (!embeddedEffects || !embeddedEffects.length) return;
}

/**
 * Resolve activation type from action.
 */
export function resolveActivationType(
  action: { name: string; desc?: string },
  fallback: 'action' | 'bonus' | 'reaction' | 'lair' | '',
): 'action' | 'bonus' | 'reaction' | 'lair' | '' {
  const text = `${action.name} ${action.desc ?? ''}`.toLowerCase();
  if (/\bbonus action\b/.test(text) || /as a bonus action/.test(text)) {
    return 'bonus';
  }
  if (/\breaction\b/.test(text) || /as a reaction/.test(text)) {
    return 'reaction';
  }
  return fallback;
}

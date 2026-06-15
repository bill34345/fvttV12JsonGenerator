import type { ActionData } from '../parser/action';
import { extractSavingThrowsWithInheritedDcFromText } from './actor-text';

type GeneratedActionData = ActionData & {
  legendaryCost?: number;
  usesPerLongRest?: number;
  requiresConcentration?: boolean;
  targetCondition?: string;
};

/**
 * Check if source text describes a swallow-like action.
 */
export function hasSwallowLikeText(action: GeneratedActionData): boolean {
  const text = `${action.name} ${action.englishName ?? ''} ${action.desc ?? ''}`;
  return /(?:Swallow|吞咽|吞下|被吞下)/i.test(text);
}

/**
 * Check if action is a death-triggered save trait.
 */
export function isDeathTriggeredSaveTrait(action: GeneratedActionData): boolean {
  if (action.attack) {
    return false;
  }

  const text = `${action.name} ${action.englishName ?? ''} ${action.desc ?? ''}`;
  return /(?:Death Burst|\u6b7b\u4ea1\u7206\u88c2|\u6b7b\u4ea1\u65f6|when .* dies|when .* die)/i.test(text)
    && extractSavingThrowsWithInheritedDcFromText(text).length > 0;
}

/**
 * Check if action is a status removal utility.
 */
export function isStatusRemovalUtility(action: GeneratedActionData): boolean {
  if (action.attack || action.save) {
    return false;
  }

  const text = `${action.name} ${action.englishName ?? ''} ${action.desc ?? ''}`;
  const mentionsStatus = /(?:grappled|restrained|poisoned|blinded|paralyzed|dazed|被擒抱|受限|中毒|目盲|麻痹|恍惚)/i.test(text);
  const indicatesRemoval = /(?:escape|end|remove|摆脱|结束|脱离|结束自身)/i.test(text);
  return mentionsStatus && indicatesRemoval;
}

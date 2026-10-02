import { calculateCriticalDamage } from '../core/critical.ts';
import { configuredRuleIds, evaluateMasteryEligibility, ruleTurnKey } from '../core/eligibility.ts';
import { settleConfiguredWeaponRules, settleWeaponRule } from '../core/settlement.ts';
import type {
  CriticalDamageInput,
  CriticalDamageResult,
} from '../core/critical.ts';
import type {
  RuleEligibility,
  WeaponRuleContext,
} from '../core/types.ts';

/**
 * The runtime only depends on this narrow, pure adapter.  Keeping the
 * browser boundary here lets the rules worker evolve its settlement module
 * without making Foundry globals part of the core rule package.
 */
export interface WeaponCoreAdapter {
  evaluate(context: WeaponRuleContext, ruleId: string): RuleEligibility;
  configuredRuleIds(context: WeaponRuleContext): readonly string[];
  turnKey(context: WeaponRuleContext): string | null;
  critical(input: CriticalDamageInput): CriticalDamageResult;
  settle(context: WeaponRuleContext, ruleId: string): ReturnType<typeof settleWeaponRule>;
  settleConfigured(context: WeaponRuleContext): ReturnType<typeof settleConfiguredWeaponRules>;
}

export const defaultWeaponCore: WeaponCoreAdapter = Object.freeze({
  evaluate: evaluateMasteryEligibility,
  configuredRuleIds,
  turnKey: ruleTurnKey,
  critical: calculateCriticalDamage,
  settle: settleWeaponRule,
  settleConfigured: settleConfiguredWeaponRules,
});

export type { CriticalDamageInput, CriticalDamageResult, RuleEligibility, WeaponRuleContext };

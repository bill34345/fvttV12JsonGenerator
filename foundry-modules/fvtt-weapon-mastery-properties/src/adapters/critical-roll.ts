import { readWeaponConfiguration, readLiteralWeaponBaseIndex, type WeaponRuleDefinition } from '@fvtt-json-generator/contracts/weapon-properties';

const APPLIED = 'fvttWeaponPropertyCritical';
export interface CriticalRollApplication { applied: boolean; reason: string; block?: boolean }

export function weaponBaseRollIndex(config: any): number | null {
  if (!Array.isArray(config?.rolls)) return null;
  const native = config.rolls.map((roll: any, index: number) => roll?.base === true ? index : -1).filter((index: number) => index >= 0);
  const literal = readLiteralWeaponBaseIndex(config.subject);
  if (config.subject?.flags?.fvttJsonGenerator?.weaponPropertyBase !== undefined && literal === null) return null;
  if (native.length > 1 || (literal !== null && native.length && native[0] !== literal)) return null;
  if (native.length === 1) return native[0];
  // A literal part maps by exact source position only while the native roll
  // configuration still has one roll per Activity part.
  return literal !== null && config.rolls.length === config.subject.damage.parts.length ? literal : null;
}

/** Modify only the uniquely tagged native weapon base, after native critical expansion. */
export function applyWeaponCriticalRolls(rolls: any[], config: any, globals: any = globalThis): CriticalRollApplication {
  const activity = config?.subject;
  const configuration = readWeaponConfiguration(activity?.item);
  if (!configuration?.enabled || activity?.type !== 'attack' || activity?.item?.type !== 'weapon') return idle('not-configured');
  const rules = configuration.rules.filter(rule => rule.kind === 'deadly' || rule.kind === 'fatal');
  if (rules.length !== 1) return idle('no-critical-property');
  if (!Array.isArray(rolls) || !rolls.some(roll => roll?.isCritical === true)) return idle('ordinary-damage');
  if (!Array.isArray(config?.rolls) || config.rolls.length !== rolls.length) return blocked('missing-native-base-map');
  const baseIndex = weaponBaseRollIndex(config);
  if (baseIndex === null) return blocked('ambiguous-native-base');
  const baseRoll = rolls[baseIndex];
  const rule = rules[0]!;
  // AttackData places its native critical bonus on the first roll even when base is elsewhere.
  const additionIndex = rule.kind === 'deadly' ? 0 : baseIndex;
  const additionRoll = rolls[additionIndex];
  if (!baseRoll || !additionRoll || baseRoll.isCritical !== true || additionRoll.isCritical !== true) return blocked('inconsistent-critical-rolls');
  if ([baseRoll, additionRoll].some(roll => roll._evaluated === true || !Array.isArray(roll.terms) || typeof roll.resetFormula !== 'function')) return blocked('already-evaluated-or-unsupported-roll');
  const existing = baseRoll.options?.[APPLIED];
  if (existing === rule.ruleId) return idle('already-applied');
  if (existing) return blocked('conflicting-critical-property');
  if (rule.kind === 'fatal' && baseRoll.options?.critical?.powerfulCritical) return blocked('powerful-critical-needs-explicit-adapter');

  const DieClass = globals?.foundry?.dice?.terms?.Die;
  const OperatorClass = globals?.foundry?.dice?.terms?.OperatorTerm;
  if (typeof DieClass !== 'function' || typeof OperatorClass !== 'function') return blocked('missing-native-dice-classes');
  const candidates = baseRoll.terms.map((term: any, index: number) => ({ term, index }))
    .filter(({ term }: any) => term instanceof DieClass && term.options?.criticalBonusDamage !== true);
  if (rule.kind === 'fatal' && candidates.length !== 1) return blocked('ambiguous-weapon-dice');
  const original = candidates[0]?.term;
  if (rule.kind === 'fatal' && (original?._evaluated === true || original?.results?.length)) return blocked('already-evaluated-weapon-dice');
  const bonus = `${rule.kind === 'deadly' ? rule.params.dice : 1}d${rule.params.die}`;
  const generated = rule.kind === 'deadly' && hasNativeOwnedBonus(activity, additionRoll, rule, bonus);
  const originalBase = [...baseRoll.terms];
  const originalAddition = [...additionRoll.terms];
  try {
    if (rule.kind === 'fatal') {
      const faces = Number(rule.params.die);
      const modifiers = [...(original.modifiers ?? [])].map((modifier: string) => /^critmax\d+$/.test(modifier) ? `critmax${faces}` : modifier);
      baseRoll.terms[candidates[0]!.index] = new DieClass({
        number: original.number, faces, method: original.method,
        modifiers, options: { ...original.options },
      });
    }
    if (!generated) {
      const options = { criticalBonusDamage: true, weaponPropertyRuleId: rule.ruleId };
      const extra = new DieClass({ number: rule.kind === 'deadly' ? Number(rule.params.dice) : 1, faces: Number(rule.params.die), options });
      if (additionRoll.terms.length) additionRoll.terms.push(new OperatorClass({ operator: '+', options }));
      additionRoll.terms.push(extra);
    }
    baseRoll.resetFormula();
    if (additionRoll !== baseRoll) additionRoll.resetFormula();
    baseRoll.options ??= {};
    baseRoll.options[APPLIED] = rule.ruleId;
    return { applied: true, reason: generated ? 'native-owned-bonus' : 'applied' };
  } catch {
    baseRoll.terms = originalBase;
    if (additionRoll !== baseRoll) additionRoll.terms = originalAddition;
    try { baseRoll.resetFormula(); if (additionRoll !== baseRoll) additionRoll.resetFormula(); } catch { /* cancel below */ }
    return blocked('native-dice-reconfiguration-failed');
  }
}

function hasNativeOwnedBonus(activity: any, roll: any, rule: WeaponRuleDefinition, bonus: string): boolean {
  const owned = activity?.flags?.fvttJsonGenerator?.weaponPropertyContributions?.deadly;
  const native = String(roll.options?.critical?.bonusDamage ?? '');
  return owned?.ruleId === rule.ruleId && owned?.bonus === bonus
    && native.split(/\s*\+\s*/).some(term => term.trim() === bonus);
}
function idle(reason: string): CriticalRollApplication { return { applied: false, reason }; }
function blocked(reason: string): CriticalRollApplication { return { applied: false, reason, block: true }; }

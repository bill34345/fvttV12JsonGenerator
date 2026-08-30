import {
  resolveLockedDnd5eV14Spell,
  resolveLockedDnd5eV14SpellActivation,
} from '@fvtt-json-generator/generation/v14-spell-catalog';
import type { ItemDiscoveryCandidate, ItemIntakeValidationResult } from './item-types';
import { validateItemIntakeIRWithResolver } from './item-validator-core';

/** Node adapter retaining the established Item Intake validator entrypoint. */
export function validateItemIntakeIR(
  source: string,
  value: unknown,
  candidate: ItemDiscoveryCandidate,
): ItemIntakeValidationResult {
  return validateItemIntakeIRWithResolver(source, value, candidate, {
    resolveSpell: resolveLockedDnd5eV14Spell,
    resolveActivation: resolveLockedDnd5eV14SpellActivation,
  });
}

export { validateItemIntakeIRWithResolver } from './item-validator-core';

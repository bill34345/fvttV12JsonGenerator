import type { SourceCoverageEntry } from './types';

/** A model-owned scope decision, not a name/keyword-based equipment parser. */
export const ORDINARY_GEAR_IGNORE_REASON = 'ordinary-gear-out-of-scope';

export const MONSTER_GEAR_POLICY = `Monster output scope: ordinary carried equipment and loot are intentionally not Item output.
Do not create equipment fields, inventory features, or uncertainties/findings just because ordinary weapons, shields,
armor, a holy symbol, or other mundane gear are not emitted. In an IR coverage ledger, cover a standalone ordinary inventory span as
ignored-with-reason with reason exactly "${ORDINARY_GEAR_IGNORE_REASON}" and claimPaths:[]; keep its exact source reference.
This scope marker belongs only on an ordinary inventory span, never a whole stat header, attack, Shield Bash,
spellcasting, trait, AC, or a paragraph mixing inventory with combat rules. Split their coverage owners.
Keep ALL printed attacks and combat abilities as Features with the monster's own attack modifiers, damage,
ranges, conditions and resources. Never substitute ordinary weapon damage or infer gear quantity from attack counts.
Keep the printed final AC as a fixed numeric value; do not calculate it from armor/shields or invent equipment effects.
Explicit magic weapons are an exception: retain their printed name and any explicit magical properties in the relevant
Feature or biography, and preserve all printed combat numbers without adding a bonus twice. Do not infer a magic weapon
merely from extra damage or a damage type. Never mark a magic weapon or its abilities as ordinary gear; unresolved
magical properties still need a concrete review finding. This does not request magic Item generation or import.
During review or repair, ordinary inventory omission under this scope is intentional, not lost mechanics.`;

export function isIntentionallyOmittedOrdinaryGear(entry: SourceCoverageEntry, source: string): boolean {
  return entry.classification === 'ignored-with-reason'
    && entry.reason === ORDINARY_GEAR_IGNORE_REASON
    && Array.isArray(entry.claimPaths) && entry.claimPaths.length === 0
    && Number.isInteger(entry.start) && Number.isInteger(entry.end)
    && entry.start >= 0 && entry.end > entry.start && entry.end <= source.length
    && source.slice(entry.start, entry.end) === entry.quote;
}

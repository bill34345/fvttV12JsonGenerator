import type { ParsedNPC } from '@fvtt-json-generator/parser/mapping';

// Actor validation is part of the generation package's public compatibility surface.

export class ActorValidator {
  public validate(parsed: ParsedNPC, actor: any): string[] {
    const warnings: string[] = [];

    const expectedName = parsed.name;
    if (actor.name !== expectedName && parsed.name) {
      warnings.push(`Name mismatch: Expected '${expectedName}', got '${actor.name}'`);
    }

    if (parsed.attributes.hp) {
      if (actor.system.attributes.hp.value !== parsed.attributes.hp.value) {
        warnings.push(`HP value mismatch: Expected ${parsed.attributes.hp.value}, got ${actor.system.attributes.hp.value}`);
      }
      if (actor.system.attributes.hp.max !== parsed.attributes.hp.max) {
        warnings.push(`HP max mismatch: Expected ${parsed.attributes.hp.max}, got ${actor.system.attributes.hp.max}`);
      }
    }

    if (parsed.attributes.ac) {
      const ac = actor?._stats?.systemVersion === '6.0.6' ? actor.system.attributes.ac.override ?? actor.system.attributes.ac.flat : actor.system.attributes.ac.flat;
      if (ac !== parsed.attributes.ac.value) {
        warnings.push(`AC mismatch: Expected ${parsed.attributes.ac.value}, got ${ac}`);
      }
    }

    if (parsed.details.cr !== undefined) {
      if (actor.system.details.cr !== parsed.details.cr) {
        warnings.push(`CR mismatch: Expected ${parsed.details.cr}, got ${actor.system.details.cr}`);
      }
    }

    const expectedMoves = Object.keys(parsed.attributes.movement || {});
    const actualMoves = (actor?._stats?.systemVersion === '6.0.6' ? actor.system.attributes.movement?.speeds : actor.system.attributes.movement) || {};
    for (const [k, v] of Object.entries(actualMoves)) {
      if (k !== 'units' && k !== 'hover' && v !== null && !(actor?._stats?.systemVersion === '6.0.6' && v === '')) {
        if (!expectedMoves.includes(k) && !(k === 'walk' && expectedMoves.length === 0)) {
           warnings.push(`Potential Leakage: Found unexpected movement speed '${k}: ${v}'`);
        }
      }
    }

    const expectedSenses = Object.keys(parsed.traits.senses || {});
    const rawSenses = actor.system.attributes.senses || {};
    const actualSenses = rawSenses.ranges && typeof rawSenses.ranges === 'object'
      ? { ...rawSenses.ranges, special: rawSenses.special, units: rawSenses.units }
      : rawSenses;
    for (const [k, v] of Object.entries(actualSenses)) {
      if (k !== 'units' && k !== 'special' && v !== 0 && v !== null) {
        if (!expectedSenses.includes(k)) {
          warnings.push(`Potential Leakage: Found unexpected sense '${k}: ${v}'`);
        }
      }
    }

    return warnings;
  }
}

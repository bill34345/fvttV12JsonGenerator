import type { ParsedNPC } from '../../config/mapping';

export class ActorValidator {
  public validate(parsed: ParsedNPC, actor: any): string[] {
    const warnings: string[] = [];

    if (actor.name !== parsed.name && parsed.name) {
      warnings.push(`Name mismatch: Expected '${parsed.name}', got '${actor.name}'`);
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
      if (actor.system.attributes.ac.flat !== parsed.attributes.ac.value) {
        warnings.push(`AC mismatch: Expected ${parsed.attributes.ac.value}, got ${actor.system.attributes.ac.flat}`);
      }
    }

    if (parsed.details.cr !== undefined) {
      if (actor.system.details.cr !== parsed.details.cr) {
        warnings.push(`CR mismatch: Expected ${parsed.details.cr}, got ${actor.system.details.cr}`);
      }
    }

    const expectedMoves = Object.keys(parsed.attributes.movement || {});
    const actualMoves = actor.system.attributes.movement || {};
    for (const [k, v] of Object.entries(actualMoves)) {
      if (k !== 'units' && k !== 'hover' && v !== null) {
        if (!expectedMoves.includes(k) && !(k === 'walk' && expectedMoves.length === 0)) {
           warnings.push(`Potential Leakage: Found unexpected movement speed '${k}: ${v}'`);
        }
      }
    }

    const expectedSenses = Object.keys(parsed.traits.senses || {});
    const actualSenses = actor.system.attributes.senses || {};
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


import type { ParsedNPC } from '../../config/mapping';
import type { StructuredActionData } from '../models/action';
import type { ParsedItem } from '../models/item';
import { createStableDocumentId } from '../utils/stable-id';
import { mapSourceItemTypeToFoundry } from './item-type-mapping';
import type {
  CanonicalActorDocument,
  CanonicalGenerationMechanic,
  CanonicalGenerationSource,
  CanonicalItemDocument,
  GenerationMechanicKind,
  MechanicProjectionState,
} from './types';
import { deriveExplicitSaveOutcome } from './save-outcome';

interface AdapterSource {
  sourcePath?: string;
  sourceText?: string;
}

function sourceFrom(options: AdapterSource): CanonicalGenerationSource {
  return {
    path: options.sourcePath ?? '<memory>',
    text: options.sourceText ?? '',
  };
}

function mechanic(
  kind: GenerationMechanicKind,
  path: string,
  value: unknown,
  projection: MechanicProjectionState = 'projected',
): CanonicalGenerationMechanic {
  return {
    id: createStableDocumentId({ kind, path }),
    kind,
    path,
    projection,
    evidence: [],
    value,
  };
}

function collectActionMechanics(
  action: StructuredActionData | Record<string, any>,
  path: string,
): CanonicalGenerationMechanic[] {
  const raw = action as Record<string, any>;
  const result: CanonicalGenerationMechanic[] = [];
  const attack = raw.attack ?? (raw.attackType ? {
    type: raw.attackType,
    toHit: raw.toHit,
    range: raw.range,
    damage: raw.damage,
  } : undefined);
  if (attack) result.push(mechanic('attack', `${path}/attack`, attack));
  if (raw.damage?.length || attack?.damage?.length) {
    result.push(mechanic('damage', `${path}/damage`, raw.damage ?? attack.damage));
  }
  if (raw.save || raw.DC) {
    const save = raw.save ?? {
      dc: raw.DC,
      ability: raw.ability,
      outcome: deriveExplicitSaveOutcome(raw),
    };
    const outcome = save.outcome;
    result.push(mechanic(
      'save',
      `${path}/save`,
      save,
      outcome === 'literal' ? 'literal-only' : 'projected',
    ));
  }
  if (raw.activation) result.push(mechanic('activation', `${path}/activation`, raw.activation));
  if (raw.useAction?.limitedUses || raw.perLongRest || raw.recharge) {
    result.push(mechanic('uses', `${path}/uses`, raw.useAction?.limitedUses ?? raw.perLongRest ?? raw.recharge));
  }
  if (raw.range || attack?.range) result.push(mechanic('range', `${path}/range`, raw.range ?? attack.range));
  for (const [index, effect] of (raw.embeddedEffects ?? []).entries()) {
    result.push(mechanic('effect', `${path}/effects/${index}`, effect));
  }
  return result;
}

export function adaptParsedActorToCanonical(
  parsed: ParsedNPC,
  options: AdapterSource = {},
): CanonicalActorDocument {
  const mechanics: CanonicalGenerationMechanic[] = [];
  for (const [section, actions] of Object.entries(parsed.structuredActions ?? {})) {
    if (!Array.isArray(actions)) continue;
    for (const [index, action] of actions.entries()) {
      mechanics.push(...collectActionMechanics(action, `actor/structuredActions/${section}/${index}`));
    }
  }
  for (const [index, resource] of (parsed.resourceSemantics?.resources ?? []).entries()) {
    mechanics.push(mechanic('resource', `actor/resourceSemantics/resources/${index}`, resource));
    for (const [derivedIndex, derived] of resource.derived.entries()) {
      mechanics.push(mechanic(
        'resource-derived',
        `actor/resourceSemantics/resources/${index}/derived/${derivedIndex}`,
        { ...derived, resourceId: resource.id },
      ));
    }
  }
  for (const [index, binding] of (parsed.resourceSemantics?.bindings ?? []).entries()) {
    mechanics.push(mechanic(
      'resource-consumption',
      `actor/resourceSemantics/bindings/${index}`,
      binding,
    ));
  }
  for (const [index, transition] of (parsed.resourceSemantics?.transitions ?? []).entries()) {
    mechanics.push(mechanic(
      'resource-transition',
      `actor/resourceSemantics/transitions/${index}`,
      transition,
    ));
  }
  for (const [index, behavior] of (parsed.behaviorSemantics?.mechanics ?? []).entries()) {
    const kind = `behavior-${behavior.kind === 'choicePool' ? 'choice-pool'
      : behavior.kind === 'externalRule' ? 'external-rule'
        : behavior.kind}` as GenerationMechanicKind;
    mechanics.push(mechanic(
      kind,
      `actor/behaviorSemantics/mechanics/${index}`,
      behavior,
      behavior.coverage === 'structured'
        ? 'projected'
        : behavior.coverage === 'literal'
          ? 'literal-only'
          : 'unsupported',
    ));
  }
  return {
    schemaVersion: 2,
    kind: 'actor',
    identity: { name: parsed.name ?? '' },
    source: sourceFrom(options),
    logicalPath: `actor/${parsed.name ?? 'unnamed'}`,
    mechanics,
    compatibilitySource: parsed,
  };
}

export function adaptParsedItemToCanonical(
  parsed: ParsedItem,
  options: AdapterSource = {},
): CanonicalItemDocument {
  const mechanics: CanonicalGenerationMechanic[] = [];
  for (const [group, actions] of Object.entries(parsed.structuredActions ?? {})) {
    if (!Array.isArray(actions)) continue;
    for (const [index, action] of actions.entries()) {
      mechanics.push(...collectActionMechanics(action, `item/structuredActions/${group}/${index}`));
    }
  }
  for (const [index, stage] of (parsed.stages ?? []).entries()) {
    mechanics.push(mechanic(
      'stage',
      `item/stages/${index}`,
      stage,
      stage.requirements?.length ? 'projected' : 'literal-only',
    ));
  }
  return {
    schemaVersion: 2,
    kind: 'item',
    identity: { name: parsed.name, englishName: parsed.englishName },
    source: sourceFrom(options),
    logicalPath: `item/${parsed.name}`,
    mechanics,
    sourceItemType: parsed.type,
    targetDocumentType: mapSourceItemTypeToFoundry(parsed.type),
    compatibilitySource: parsed,
  };
}

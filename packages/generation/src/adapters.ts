import { displayName } from '@fvtt-json-generator/models/display-name';
import type { ParsedNPC } from '@fvtt-json-generator/parser/mapping';
import type { StructuredActionData } from '@fvtt-json-generator/models/action';
import type { ParsedItem } from '@fvtt-json-generator/models/item';
import { createStableDocumentId } from './stableId';
import { mapSourceItemTypeToFoundry } from './item-type-mapping';
import type {
  CanonicalActorDocument,
  CanonicalGenerationMechanic,
  CanonicalGenerationSource,
  CanonicalItemDocument,
  GenerationMechanicKind,
  MechanicProjectionState,
} from './types';
import { conditionalAttackSaveTrigger, deriveExplicitSaveOutcome, normalizedSourceDamageParts } from './save-outcome';
import { parseWeaponConfiguration } from '@fvtt-json-generator/contracts/weapon-properties';

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
  const sourceAction = action as Record<string, any>;
  const raw:Record<string,any> = sourceAction.executionMode==='native-with-gm'
    ? {...sourceAction,describe:sourceAction.nativeRuleText,desc:sourceAction.nativeRuleText}:sourceAction;
  const result: CanonicalGenerationMechanic[] = [];
  const attack = raw.attack ?? (raw.attackType ? {
    type: raw.attackType,
    toHit: raw.toHit,
    range: raw.range,
    damage: raw.damage,
  } : undefined);
  if (raw.weaponConfiguration !== undefined || raw.nativeMastery !== undefined) {
    const configuration = raw.weaponConfiguration === undefined
      ? undefined
      : parseWeaponConfiguration(raw.weaponConfiguration);
    const rawCriticalBonus = raw.criticalBonus
      ?? raw.attack?.critical?.bonus
      ?? raw.damage?.critical?.bonus;
    result.push(mechanic(
      'weapon-properties',
      `${path}/weapon-properties`,
      {
        configuration: configuration ?? raw.weaponConfiguration,
        ...(typeof raw.nativeMastery === 'string' ? { nativeMastery: raw.nativeMastery } : {}),
        ...(typeof rawCriticalBonus === 'string' && rawCriticalBonus.trim()
          ? { criticalBaseline: rawCriticalBonus.trim() }
          : {}),
      },
      configuration || raw.nativeMastery !== undefined ? 'projected' : 'unsupported',
    ));
  }
  if (attack) result.push(mechanic('attack', `${path}/attack`, attack));
  const sourceDamage = normalizedSourceDamageParts(raw);
  if (sourceDamage) {
    // Source-derived: native settlement and conditional/manual consequences
    // are separate facts. Keeping a trigger never makes it unconditional damage.
    for (const [index, part] of sourceDamage.entries()) {
      const native = (part.relationship === 'base' || part.relationship === 'additional') && !part.condition
        && (raw.type !== 'utility' || raw.damage?.length);
      result.push(mechanic('damage', `${path}/damage/${index}`, part, native ? 'projected' : 'literal-only'));
    }
  } else if (raw.damage?.length || attack?.damage?.length) {
    result.push(mechanic('damage', `${path}/damage`, raw.damage ?? attack.damage));
  }
  if (raw.save || raw.DC) {
    const save = raw.save ?? {
      dc: raw.DC,
      ability: raw.ability,
      outcome: raw.executionMode==='native-with-gm' ? raw.saveOutcome??deriveExplicitSaveOutcome(raw):deriveExplicitSaveOutcome(raw),
    };
    const trigger = conditionalAttackSaveTrigger(raw);
    const outcome = save.outcome;
    result.push(mechanic(
      'save',
      `${path}/save`,
      {
        ...save,
        ...(trigger ? { condition: trigger } : {}),
        ...(raw.damage ? { damage: raw.damage } : {}),
        ...(raw.useAction ? { useAction: raw.useAction } : {}),
        ...(raw.activity ? { activity: raw.activity } : {}),
      },
      outcome === 'literal' || trigger ? 'literal-only' : 'projected',
    ));
  }
  if (raw.activation) result.push(mechanic('activation', `${path}/activation`, raw.activation));
  if (raw.light) {
    result.push(mechanic('light', `${path}/light`, raw.light));
    result.push(mechanic('activation', `${path}/light/activation`, raw.light.activation));
    result.push(mechanic('resource-consumption', `${path}/light/consumption`, {
      consumption: raw.light.consumption,
      resource: 'itemUses',
    }));
  }
  if (raw.type === 'spell' && raw.spellName) {
    result.push(mechanic('spell', `${path}/spell`, {
      identifier: raw.spellIdentifier,
      name: raw.englishName ?? raw.spellName,
      consumption: raw.useAction?.consumption ?? 0,
      activation: raw.useAction?.activation ?? 'action',
    }));
    result.push(mechanic('resource-consumption', `${path}/spell/consumption`, {
      consumption: raw.useAction?.consumption ?? 0,
      resource: 'itemUses',
    }));
  }
  if (raw.useAction?.limitedUses || raw.uses || raw.perLongRest || raw.recharge) {
    const value=raw.useAction?.limitedUses ?? raw.uses ?? raw.perLongRest ?? raw.recharge;
    result.push(mechanic('uses', `${path}/uses`, raw.uses&&raw.actorResource
      ? {...raw.uses,actorResource:raw.actorResource} : raw.executionMode==='gm-manual'&&raw.uses
      ? {...raw.uses,executionMode:'gm-manual',sourceText:raw.describe} : raw.uses&&raw.spellcastingFeatureKey?{...raw.uses,spellcastingFeatureKey:raw.spellcastingFeatureKey}:value));
  }
  if (raw.range || attack?.range) result.push(mechanic('range', `${path}/range`, raw.range ?? attack.range));
  if (raw.passiveEffect) result.push(mechanic('effect', `${path}/passiveEffect`, raw));
  for (const [index, effect] of (raw.embeddedEffects ?? []).entries()) {
    result.push(mechanic('effect', `${path}/effects/${index}`, { ...effect, sourceText: raw.describe }));
  }
  return result;
}

export function adaptParsedActorToCanonical(
  parsed: ParsedNPC,
  options: AdapterSource = {},
): CanonicalActorDocument {
  const mechanics: CanonicalGenerationMechanic[] = [];
  const resistanceMax=parsed.attributes.legres?.max??parsed.sourceLegendaryLedger?.resistanceMax;
  for (const [section, actions] of Object.entries(parsed.structuredActions ?? {})) {
    if (!Array.isArray(actions)) continue;
    for (const [index, action] of actions.entries()) {
      mechanics.push(...collectActionMechanics(action, `actor/structuredActions/${section}/${index}`));
      // Source-derived: the marker joins this trait to an explicit Actor
      // ledger; it does not manufacture an independent feature.uses field.
      if(action.actorResource==='legres'&&!action.uses&&Number.isSafeInteger(resistanceMax)&&resistanceMax!==undefined&&resistanceMax>0){
        mechanics.push(mechanic('uses',`actor/structuredActions/${section}/${index}/actorResource`,{
          max:resistanceMax,period:'day',actorResource:'legres',nativeResistanceLedgerOnly:true,
        }));
      }
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
    ...(parsed.candidateReview?{candidateReview:structuredClone(parsed.candidateReview)}:{}),
  };
}

export function adaptParsedItemToCanonical(
  parsed: ParsedItem,
  options: AdapterSource = {},
): CanonicalItemDocument {
  const mechanics: CanonicalGenerationMechanic[] = [];
  if (parsed.weaponConfiguration !== undefined) {
    const configuration = parseWeaponConfiguration(parsed.weaponConfiguration);
    const itemName = displayName(parsed.name, parsed.englishName);
    const criticalBaselinesByActivityId = Object.fromEntries(
      Object.entries(parsed.activities ?? {})
        .filter(([, activity]) => activity.type === 'attack')
        .map(([key, activity]) => [
          createStableDocumentId({ item: itemName, path: `activities/${key}`, activity }),
          typeof activity.damage?.critical?.bonus === 'string' ? activity.damage.critical.bonus.trim() : '',
        ]),
    );
    mechanics.push(mechanic(
      'weapon-properties',
      'item/weapon-properties',
      {
        configuration: configuration ?? parsed.weaponConfiguration,
        ...(parsed.nativeMastery ?? parsed.weapon?.mastery
          ? { nativeMastery: parsed.nativeMastery ?? parsed.weapon?.mastery }
          : {}),
        ...(Object.keys(criticalBaselinesByActivityId).length > 0 ? { criticalBaselinesByActivityId } : {}),
      },
      configuration ? 'projected' : 'unsupported',
    ));
  } else if (parsed.nativeMastery ?? parsed.weapon?.mastery) {
    mechanics.push(mechanic(
      'weapon-properties',
      'item/weapon-properties',
      { configuration: undefined, nativeMastery: parsed.nativeMastery ?? parsed.weapon?.mastery },
    ));
  }
  if (parsed.armor) mechanics.push(mechanic('armor', 'item/armor', parsed.armor));
  for (const [index, text] of (parsed.unresolvedMechanics ?? []).entries()) {
    mechanics.push(mechanic('armor', `item/armor/unresolved/${index}`, { text }, 'literal-only'));
  }
  if (parsed.uses) {
    mechanics.push(mechanic('uses', 'item/uses', parsed.uses));
  }
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

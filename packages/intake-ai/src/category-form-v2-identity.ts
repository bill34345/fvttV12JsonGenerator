import { sourceActorNameMatches } from '@fvtt-json-generator/models/source-operations';
import { assertStagedSourcePartition, StagedExtractionError, type StagedMonsterSource } from './staged-source';

export interface V2SelfReferenceBinding {
  recipient: 'self';
  /** A translated proper name is a review result, never an accepted alias. */
  targetStatus: 'verified' | 'unresolved-translation';
  proposedTarget: string;
}

export interface V2FeatureIdentityScope {
  readonly plan: StagedMonsterSource;
  readonly currentUnitId: string;
}

export interface V2SourceFeatureReference {
  sourceSha256: string;
  unitId: string;
  sourceName: string;
  sourceQuote: string;
}

const sourceReference = (value: string) => value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
function fail(code: string, path: string): never {
  throw new StagedExtractionError(code, path.split('/').map(part => part === '治疗' ? 'healing' : part).join('/'));
}

/** Existing source aliases are supplied by the caller. No monster/action
 * dictionary can turn a translated name into evidence of identity. */
export function bindV2SelfReference(value: string, actorNames: readonly string[], path: string): V2SelfReferenceBinding {
  const text = sourceReference(value);
  const result = (targetStatus: V2SelfReferenceBinding['targetStatus']): V2SelfReferenceBinding =>
    ({ recipient: 'self', targetStatus, proposedTarget: value });
  if (/^(?:self|yourself|自身|自己|本人)$/iu.test(text)) return result('verified');
  if (/\b(?:target|creature|ally|another|other)\b|目标|生物|盟友|其他|另一/iu.test(text))
    return fail('V2_HEALING_TARGET_CONFLICT', path);
  const owner = text.replace(/\s*(?:itself|self|自身|自己|本人)$/iu, '').trim();
  if (sourceActorNameMatches(owner, actorNames)) return result('verified');
  if (/^[\p{Script=Han}]+$/u.test(owner)) return result('unresolved-translation');
  return fail('V2_HEALING_TARGET_CONFLICT', path);
}

/** Scope is the immutable source partition from this request, not a registry
 * of names from previous sources or an AI-created alias table. */
export function makeV2FeatureIdentityScope(plan: StagedMonsterSource, currentUnitId: string): V2FeatureIdentityScope {
  assertStagedSourcePartition(plan);
  if (plan.features.filter(unit => unit.id === currentUnitId).length !== 1)
    fail('V2_REFERENCE_CURRENT_UNIT_UNPROVEN', '/features/' + currentUnitId);
  return Object.freeze({ plan, currentUnitId });
}

/** A reference must be an exact program-supplied ID or a unique full source
 * name. It does not permit a translated label, arbitrary suffix or ordinal. */
export function bindV2SourceFeatureReference(reference: string, scope: V2FeatureIdentityScope, path: string): V2SourceFeatureReference {
  assertStagedSourcePartition(scope.plan);
  if (scope.plan.features.filter(unit => unit.id === scope.currentUnitId).length !== 1)
    fail('V2_REFERENCE_CURRENT_UNIT_UNPROVEN', path);
  const value = sourceReference(reference);
  const units = scope.plan.features.filter(unit => unit.id === value || unit.name !== undefined && sourceReference(unit.name) === value);
  if (units.length === 0) fail('V2_REFERENCE_UNPROVEN', path);
  if (units.length !== 1) fail('V2_REFERENCE_AMBIGUOUS', path);
  const unit = units[0]!;
  return { sourceSha256: scope.plan.sourceSha256, unitId: unit.id, sourceName: unit.name!, sourceQuote: unit.quote };
}

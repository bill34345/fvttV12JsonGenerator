import type { ParsedNPC } from '../../config/mapping';
import type { ActorGeneratorOptions } from '../generator/actor';
import type { EffectProfile } from '../generator/effectProfileApplier';
import type { FvttTargetVersion, FoundryTarget } from '../foundryTarget';
import type { CanonicalMonster } from '../intake/types';
import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import type { GenerationDiagnostic } from '@fvtt-json-generator/contracts/diagnostics';
import type { ParsedItem, ItemType } from '../models/item';
import type { ParserRoute } from '../parser/types';
import type { V14IconResolver } from '../icons/resolver';
import type {
  ActorBehaviorExecutionMode,
  ActorBehaviorExpressionCoverage,
} from '../models/behavior';

export type { CanonicalFeature, CanonicalMonster } from '../intake/types';
export type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
export type { GenerationDiagnostic } from '@fvtt-json-generator/contracts/diagnostics';
export type GenerationDocumentKind = 'actor' | 'item';
export type GenerationMechanicKind =
  | 'activation'
  | 'attack'
  | 'damage'
  | 'save'
  | 'uses'
  | 'range'
  | 'effect'
  | 'stage'
  | 'resource'
  | 'resource-consumption'
  | 'resource-transition'
  | 'resource-derived'
  | 'behavior-relation'
  | 'behavior-lifecycle'
  | 'behavior-trigger'
  | 'behavior-stage'
  | 'behavior-capacity'
  | 'behavior-choice-pool'
  | 'behavior-area'
  | 'behavior-external-rule';
export type MechanicProjectionState = 'projected' | 'literal-only' | 'unsupported';

export interface CanonicalGenerationSource {
  path: string;
  text: string;
  evidence?: EvidenceRef[];
}

export interface CanonicalGenerationMechanic {
  id: string;
  kind: GenerationMechanicKind;
  path: string;
  projection: MechanicProjectionState;
  evidence: EvidenceRef[];
  value?: unknown;
}

interface CanonicalGenerationBase {
  schemaVersion: 2;
  kind: GenerationDocumentKind;
  identity: {
    name: string;
    englishName?: string;
  };
  source: CanonicalGenerationSource;
  logicalPath: string;
  mechanics: CanonicalGenerationMechanic[];
}

export interface CanonicalActorDocument extends CanonicalGenerationBase {
  kind: 'actor';
  actor?: CanonicalMonster;
  compatibilitySource: ParsedNPC;
}

export interface CanonicalItemDocument extends CanonicalGenerationBase {
  kind: 'item';
  sourceItemType: ItemType;
  targetDocumentType: string;
  compatibilitySource: ParsedItem;
}

export type CanonicalGenerationDocument = CanonicalActorDocument | CanonicalItemDocument;

export interface MechanicsCoverageEntry {
  mechanicId: string;
  kind: GenerationMechanicKind;
  sourcePath: string;
  status: 'projected' | 'literal-only' | 'unsupported' | 'missing' | 'duplicate';
  outputPaths: string[];
  expressionCoverage?: ActorBehaviorExpressionCoverage;
  executionMode?: ActorBehaviorExecutionMode;
}

export interface GenerationVerification {
  status: 'accepted' | 'needs_review' | 'failed';
  diagnostics: GenerationDiagnostic[];
  target: FoundryTarget;
  mechanicsCoverage: MechanicsCoverageEntry[];
}

export interface GenerationProjectionOptions {
  effectProfile: EffectProfile;
  targetVersion: FvttTargetVersion;
  route?: ParserRoute;
  translationService?: ActorGeneratorOptions['translationService'];
  iconResolver?: V14IconResolver;
}

export interface GenerationProjector {
  readonly targetVersions: readonly FvttTargetVersion[];
  readonly systemVersion: '4.3.9' | '5.3.3';
  project(
    document: CanonicalGenerationDocument,
    options: GenerationProjectionOptions,
  ): Promise<unknown>;
}

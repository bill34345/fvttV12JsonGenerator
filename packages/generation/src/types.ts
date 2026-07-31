import type { ParsedNPC } from '@fvtt-json-generator/parser/mapping';
import type { ActorGeneratorOptions } from './actor';
import type { EffectProfile } from './effectProfileApplier';
import type { FvttTargetVersion, FoundryTarget } from './target';
import type { CanonicalMonster } from '@fvtt-json-generator/models/canonical-monster';
import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import type { GenerationDiagnostic } from '@fvtt-json-generator/contracts/diagnostics';
import type { ParsedItem, ItemType } from '@fvtt-json-generator/models/item';
import type { ParserRoute } from '@fvtt-json-generator/parser/types';
import type { GenerationIconResolver } from './ports';
import type {
  ActorBehaviorExecutionMode,
  ActorBehaviorExpressionCoverage,
} from '@fvtt-json-generator/models/behavior';

export type { CanonicalFeature, CanonicalMonster } from '@fvtt-json-generator/models/canonical-monster';
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
  iconResolver?: GenerationIconResolver;
}

export interface GenerationProjector {
  readonly targetVersions: readonly FvttTargetVersion[];
  readonly systemVersion: '4.3.9' | '5.3.3';
  project(
    document: CanonicalGenerationDocument,
    options: GenerationProjectionOptions,
  ): Promise<unknown>;
}

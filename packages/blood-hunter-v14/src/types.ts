export type JsonObject = Record<string, unknown>;

export type BloodHunterFeatureGroup = 'classFeature' | 'subclassFeature' | 'optionalfeature';
export type BloodHunterAutomation = 'automatic' | 'assisted' | 'native' | 'external-rule';
export type NativeReferenceClassification = 'native' | 'external-rule';
export type GrantMode = 'grant' | 'choice' | 'container' | 'native';
export type GrantType = 'HitPoints' | 'Trait' | 'ItemGrant' | 'ItemChoice' | 'Subclass' | 'AbilityScoreImprovement' | 'ScaleValue';

export interface BloodHunterSourceEntry extends JsonObject {
  name: string;
  source: string;
  ENG_name?: string;
  entries?: unknown[];
  className?: string;
  classSource?: string;
  subclassShortName?: string;
  subclassSource?: string;
  shortName?: string;
  level?: number;
  featureType?: string | string[];
}

export interface BloodHunterSideData extends JsonObject {
  name: string;
  source?: string;
  className?: string;
  classSource?: string;
  subclassShortName?: string;
  subclassSource?: string;
  level?: number;
  system?: JsonObject;
  activities?: JsonObject[];
  effects?: JsonObject[];
  flags?: JsonObject;
}

/** The accepted enriched source boundary. Unknown source fields are intentionally retained outside this contract. */
export interface BloodHunterEnrichedSource extends JsonObject {
  _meta?: JsonObject;
  class: BloodHunterSourceEntry[];
  subclass: BloodHunterSourceEntry[];
  classFeature: BloodHunterSourceEntry[];
  subclassFeature: BloodHunterSourceEntry[];
  optionalfeature: BloodHunterSourceEntry[];
  foundryClass?: BloodHunterSideData[];
  foundryClassFeature?: BloodHunterSideData[];
  foundrySubclassFeature?: BloodHunterSideData[];
  foundryOptionalfeature?: BloodHunterSideData[];
  classFluff?: BloodHunterSourceEntry[];
}

export interface BloodHunterSourceIdentity {
  source: string;
  group: BloodHunterFeatureGroup | 'class' | 'subclass';
  className?: string;
  subclassShortName?: string;
  level?: number;
  normalizedName: string;
}

export interface NativeItemSource {
  _id: string;
  name: string;
  type: 'class' | 'subclass' | 'feat';
  img: string;
  system: JsonObject;
  effects: JsonObject[];
  flags: JsonObject;
}

export interface NativeReferenceContract {
  referenceKey: string;
  classification: NativeReferenceClassification;
  /** The complete UUID written into the persistent dnd5e advancement. */
  uuid: string;
  /** The terminal Foundry document id in `uuid`; always a strict 16-char id. */
  targetDocumentId: string;
  resolution: 'direct-uuid';
  source: 'module' | 'dnd5e';
  purpose: string;
}

export interface GrantGraphNode {
  id: string;
  ownerDocumentId: string;
  ownerKind: 'class' | 'subclass';
  level: number;
  type: GrantType;
  mode: GrantMode;
  references: NativeReferenceContract[];
}

export interface CoverageGrant {
  ownerDocumentId: string;
  level: number;
  mode: GrantMode;
  /** A source-level subclass trigger can deliberately route to all four real grants. */
  containerRoute?: {
    kind: 'subclass-level-grants';
    ownerDocumentIds: string[];
    advancementIds: string[];
  };
}

export interface CoverageActivitySummary {
  count: number;
  ids: string[];
  semantics: CoverageActivitySemantic[];
  passive: boolean;
  noActivityRationale?: string;
}

export interface CoverageEffectSummary {
  count: number;
  ids: string[];
  semantics: CoverageEffectSemantic[];
  passive: boolean;
  noEffectRationale?: string;
}

export interface CoverageActivitySemantic {
  id: string;
  name: string;
  type: string;
  activation: JsonObject;
  range: JsonObject;
  target: JsonObject;
  duration: JsonObject;
  uses: JsonObject;
  consumption: JsonObject;
  save: JsonObject;
  damage: JsonObject;
  healing: JsonObject;
  formula: string | null;
  effectIds: string[];
  classification: BloodHunterAutomation;
  boundary: string;
}

export interface CoverageEffectChangeSemantic {
  key: string;
  mode: number;
  modeLabel: string;
  value: string;
}

export interface CoverageEffectSemantic {
  id: string;
  name: string;
  type: string;
  transfer: boolean;
  disabled: boolean;
  duration: JsonObject;
  changes: CoverageEffectChangeSemantic[];
  statuses: string[];
  classification: BloodHunterAutomation;
  boundary: string;
}

export interface CoverageSemanticSummary {
  kind: 'document-mechanics' | 'passive-document' | 'advancement' | 'container';
  summary: string;
  classification: BloodHunterAutomation;
  boundary: string;
}

export interface BloodHunterCoverageLedgerEntry {
  sourceKey: string;
  sourceIdentity: BloodHunterSourceIdentity;
  sourceLocator: {
    group: BloodHunterFeatureGroup;
    index: number;
    sourceKey: string;
  };
  sourceText: {
    summary: string;
    renderedHash: string;
  };
  textHash: string;
  canonicalDocumentId?: string;
  advancementId?: string;
  grant: CoverageGrant;
  automation: BloodHunterAutomation;
  activities: CoverageActivitySummary;
  effects: CoverageEffectSummary;
  semanticSummary: CoverageSemanticSummary;
  unautomatedBoundary: string;
  review: {
    status: 'pass' | 'adjusted' | 'assisted';
    notes: string;
  };
}

export interface BloodHunterActivitySummary {
  sourceActivityCount: number;
  canonicalActivityCount: number;
  deduplicatedActivityCount: number;
  differenceReason: string;
}

export interface NativeBloodHunterPackage {
  moduleId: 'fvtt-blood-hunter-2024';
  version: '1.0.0';
  target: {
    foundry: '14.364';
    dnd5e: '5.3.3';
    rules: '2024';
    effectProfile: 'modded-v14';
  };
  classes: NativeItemSource[];
  subclasses: NativeItemSource[];
  features: NativeItemSource[];
  grantGraph: GrantGraphNode[];
  externalReferences: NativeReferenceContract[];
  coverageLedger: BloodHunterCoverageLedgerEntry[];
  activitySummary: BloodHunterActivitySummary;
  /** Present only for the byte-verified compile entrypoint. */
  sourceSha256?: string;
  logicalHash: string;
}

export interface BloodHunterV14CompileTarget {
  foundry: '14.364';
  dnd5e: '5.3.3';
  effectProfile: 'modded-v14';
}

export interface BloodHunterV14CompileOptions {
  /** Raw UTF-8 source text/bytes. This form is byte-locked before JSON parsing. */
  source: string | Uint8Array;
  target: BloodHunterV14CompileTarget;
}

export interface BloodHunterValidationFinding {
  code: string;
  path: string;
  message: string;
}

export interface BloodHunterValidationResult {
  ok: boolean;
  findings: BloodHunterValidationFinding[];
}

export interface MigrationMergePolicy {
  /** Runtime and non-Blood-Hunter data a future Foundry builder must retain on update. */
  preservePaths: string[];
  replacePaths: string[];
}

export interface ExistingFoundryItemLike extends JsonObject {
  _id: string;
  name: string;
  type: string;
  system?: JsonObject;
  effects?: JsonObject[];
  flags?: JsonObject;
  /** Optional adapter-normalized identity for legacy documents. */
  legacyIdentity?: Partial<BloodHunterSourceIdentity> & { source?: string; name?: string };
}

export interface NativeBloodHunterMigrationAction {
  action: 'add' | 'update' | 'keep' | 'conflict';
  canonicalId: string;
  targetItem: NativeItemSource;
  existingItemIds: string[];
  reason: string;
  mergePolicy: MigrationMergePolicy;
}

export interface NativeBloodHunterMigrationPlan {
  moduleId: 'fvtt-blood-hunter-2024';
  version: '1.0.0';
  actions: NativeBloodHunterMigrationAction[];
  mergePolicy: MigrationMergePolicy;
}

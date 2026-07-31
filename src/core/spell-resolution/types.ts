import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';

export type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';

export const RESOLVER_MODULE_ID = 'fvtt-json-generator-spell-resolver' as const;

export interface PortableSpellManifest {
  schemaVersion: 1;
  manifestId: string;
  sourceSha256: string;
  rulesPreference: '2024';
  spellcastingGroups: PortableSpellcastingGroup[];
}

export interface PortableSpellcastingGroup {
  groupId: string;
  featureItemKey: string;
  ability?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  saveDc?: number;
  attackBonus?: number;
  spellRefs: PortableSpellRef[];
}

/** Portable, system-independent school names used by the manifest contract. */
export type PortableSpellSchool =
  | 'abjuration'
  | 'conjuration'
  | 'divination'
  | 'enchantment'
  | 'evocation'
  | 'illusion'
  | 'necromancy'
  | 'transmutation';

export interface PortableSpellRef {
  refId: string;
  identifier: string;
  originalName: string;
  englishName?: string;
  chineseName?: string;
  aliases: string[];
  expectedLevel?: number;
  expectedSchool?: PortableSpellSchool;
  sourceBookHint?: string;
  method: 'innate' | 'prepared' | 'pact' | 'at-will';
  uses?: {
    value: number;
    recovery: 'day' | 'shortRest' | 'longRest';
    shared: boolean;
  };
  castingLevel?: number;
  ignoresMaterialComponents?: boolean;
  restrictions: PreservedSpellRestriction[];
  evidence: EvidenceRef[];
}

export interface PreservedSpellRestriction {
  kind: 'target' | 'summoning' | 'casting' | 'other';
  text: string;
  value?: string | number | boolean;
  evidence: EvidenceRef[];
}

export interface SpellResolutionFinding {
  code: string;
  path: string;
  message: string;
  blocking: boolean;
  evidence: EvidenceRef[];
  candidates?: unknown[];
}

export type ManifestValidationResult =
  | { ok: true; value: PortableSpellManifest }
  | { ok: false; findings: SpellResolutionFinding[] };

export type SpellRulesGeneration = '2024' | '2014';

/** Foundry-independent projection produced by the Task 6 source index. */
export interface SpellCandidateMetadata {
  id: string;
  uuid: string;
  packageId: string;
  packId: string;
  name: string;
  identifier?: string;
  rules?: string;
  sourceBook?: string;
  level?: number;
  school?: string;
}

export type SpellSelectionOrigin = 'automatic-2024' | 'fallback-2014' | 'manual-review';

export interface SavedSpellMapping {
  logicalRefKey: string;
  selectedUuid: string;
  rules: SpellRulesGeneration;
  sourceInventoryHash: string;
  candidateMetadataHash: string;
  resolutionConfigHash: string;
  selectionOrigin: SpellSelectionOrigin;
}

export interface SpellSourcePriority {
  packageId: string;
  packId?: string;
}

export interface SpellResolutionConfiguration {
  policyVersion: '2024-first-v1';
  sourcePriority: SpellSourcePriority[];
}

export interface SpellResolutionTraceEntry {
  code: string;
  message: string;
  candidateUuids: string[];
}

export interface ResolvedSpellSelection {
  logicalRefKey: string;
  groupId: string;
  refId: string;
  selected: SpellCandidateMetadata & { rules: SpellRulesGeneration };
  origin: SpellSelectionOrigin;
  trace: SpellResolutionTraceEntry[];
  findings: SpellResolutionFinding[];
  suggestions: SpellCandidateMetadata[];
  candidates?: SpellCandidateMetadata[];
  status: 'resolved';
}

export interface UnresolvedSpellSelection {
  logicalRefKey: string;
  groupId: string;
  refId: string;
  status: 'needs_review' | 'missing';
  trace: SpellResolutionTraceEntry[];
  findings: SpellResolutionFinding[];
  suggestions: SpellCandidateMetadata[];
  candidates?: SpellCandidateMetadata[];
}

export type SpellResolutionResult = ResolvedSpellSelection | UnresolvedSpellSelection;

export interface ManagedSpellProjection {
  logicalRefKey: string;
  manualConflict?: boolean;
  managedContentHash?: string;
}

export interface SpellManualDecision {
  logicalRefKey: string;
  decision: 'keep' | 'overwrite' | 'cancel';
}

export interface SpellHydrationSelection {
  logicalRefKey: string;
  groupId: string;
  refId: string;
  uuid: string;
  rules: SpellRulesGeneration;
  selectionOrigin: SpellSelectionOrigin;
  manualDecision?: 'keep' | 'overwrite';
}

export interface SpellHydrationPlan {
  manifestId: string;
  manifestHash: string;
  sourceInventoryHash: string;
  candidateMetadataHash: string;
  resolutionConfigHash: string;
  resolutionConfiguration: SpellResolutionConfiguration;
  currentManagedProjectionHash: string;
  manualDecisionsHash: string;
  selections: SpellHydrationSelection[];
  planHash: string;
}

export interface SpellResolutionReport {
  manifestId: string;
  sourceInventoryHash: string;
  candidateMetadataHash: string;
  resolutionConfigHash: string;
  currentManagedProjectionHash: string;
  manualDecisionsHash: string;
  results: SpellResolutionResult[];
  findings: SpellResolutionFinding[];
}

export type HydrationPreflight =
  | { status: 'ready'; plan: SpellHydrationPlan; report: SpellResolutionReport }
  | { status: 'needs_review'; findings: SpellResolutionFinding[]; report: SpellResolutionReport }
  | { status: 'incompatible'; findings: SpellResolutionFinding[]; report: SpellResolutionReport };

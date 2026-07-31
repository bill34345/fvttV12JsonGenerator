import type { AssetRebuildability, AssetRetention } from './model';

export const LOCAL_SCOPE_STATUSES = ['classified', 'privacy-excluded', 'pending-review'] as const;
export type LocalScopeStatus = (typeof LOCAL_SCOPE_STATUSES)[number];

export const LOCAL_SCOPE_CLASSES = [
  'registered-asset-root',
  'recovery-copy',
  'acceptance-evidence',
  'reference-cache',
  'external-tool-cache',
  'task-scratch',
  'private-session-state',
  'pending-owner',
] as const;
export type LocalScopeClass = (typeof LOCAL_SCOPE_CLASSES)[number];

export type LocalScopeMeasurement = 'recursive-metadata' | 'top-level-metadata' | 'asset-inventory-summary';
export type LocalScopeEntryKind = 'file' | 'directory' | 'link' | 'other';

export interface LocalScopeDeclaration {
  name: string;
  status: LocalScopeStatus;
  scopeClass: LocalScopeClass;
  producer: string;
  consumers: string[];
  sensitivity: string;
  rebuildability: AssetRebuildability;
  retention: AssetRetention;
  measurement: LocalScopeMeasurement;
  evidence: string[];
  rationale: string;
}

export interface LocalScopePolicy {
  localRoot: string;
  assetInventoryParent: string;
  defaultOutputParent: string;
  declarations: LocalScopeDeclaration[];
}

export interface LocalScopeMeasurementResult {
  kind: LocalScopeEntryKind;
  fileCount: number | null;
  directoryCount: number | null;
  totalBytes: number | null;
  skippedLinkCount: number | null;
  measurementSource: string;
  issues: string[];
}

export interface LocalScopeEntry extends LocalScopeDeclaration {
  exists: true;
  measurementResult: LocalScopeMeasurementResult;
}

export interface LocalScopeUnexpectedEntry {
  name: string;
  kind: LocalScopeEntryKind;
  bytes: number | null;
}

export interface LocalScopeCoverageResult {
  schemaVersion: 1;
  generatedAt: string;
  root: '$REPO_ROOT/.local';
  coverageComplete: boolean;
  measurementComplete: boolean;
  classificationComplete: boolean;
  presentEntryCount: number;
  classifiedCount: number;
  privacyExcludedCount: number;
  pendingReviewCount: number;
  entries: LocalScopeEntry[];
  unexpectedEntries: LocalScopeUnexpectedEntry[];
  missingDeclaredEntries: string[];
  note: string;
}

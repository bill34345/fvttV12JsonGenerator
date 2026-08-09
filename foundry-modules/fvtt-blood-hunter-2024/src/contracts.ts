export type JsonObject = Record<string, unknown>;

export interface RuntimeDocument extends JsonObject {
  _id: string;
  name: string;
  type: string;
  system: JsonObject;
  effects: JsonObject[];
  flags: JsonObject;
}

export interface RuntimeIdentity {
  source: string;
  group?: string;
  className?: string;
  subclassShortName?: string;
  level?: number;
  normalizedName: string;
}

export interface RuntimeMergePolicy {
  preservePaths: string[];
  replacePaths: string[];
}

export interface MigrationContract {
  schemaVersion: 1;
  moduleId: 'fvtt-blood-hunter-2024';
  version: '1.0.0';
  target: {
    foundry: '14.364';
    dnd5e: '5.3.3';
    rules: '2024';
    effectProfile: 'modded-v14';
  };
  logicalHash: string;
  documents: RuntimeDocument[];
  fixedGrantDocumentIds: string[];
  rootDocumentIds: string[];
  mergePolicy: RuntimeMergePolicy;
  externalDnd5eUuids: string[];
  activityCount: number;
}

export interface MigrationConflict {
  itemId: string;
  canonicalId: string;
  path: 'system.description' | 'system.activities' | 'effects';
  current: unknown;
  incoming: unknown;
  reason: string;
}

export type ConflictDecision = 'Keep' | 'Overwrite' | 'Cancel';

export interface MigrationAction {
  action: 'add' | 'update' | 'keep' | 'skip' | 'conflict';
  canonicalId: string;
  targetItem: RuntimeDocument;
  existingItemIds: string[];
  reason: string;
  legacy: boolean;
  conflicts: MigrationConflict[];
}

export interface ActorMigrationPlan {
  actorId: string;
  actorName: string;
  actorSnapshot: string;
  eligible: boolean;
  matchedBloodHunterItemIds: string[];
  actions: MigrationAction[];
  conflicts: MigrationConflict[];
}

export interface ProjectionFinding {
  code: string;
  path: string;
  message: string;
}

export interface ProjectionValidation {
  ok: boolean;
  findings: ProjectionFinding[];
}

export interface ActorLike extends JsonObject {
  _id?: string;
  id?: string;
  name?: string;
  items?: unknown[];
  system?: JsonObject;
}

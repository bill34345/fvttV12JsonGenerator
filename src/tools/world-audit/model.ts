export interface TreeEntry {
  relativePath: string;
  bytes: number;
  sha256: string;
}

export interface LevelRecord {
  collection: string;
  key: string;
  namespace: string;
  parentIds: string[];
  embeddedPath: string[];
  value: Record<string, unknown>;
}

export interface WorldSnapshot {
  sourceWorldRoot: string;
  snapshotWorldRoot: string;
  sourceTreeHashBefore: string;
  sourceTreeHashAfter: string;
  sourceTree: TreeEntry[];
  snapshotTree: TreeEntry[];
  collectionBytes: Record<string, number>;
  records: LevelRecord[];
}

export interface SnapshotOptions {
  sourceWorldRoot: string;
  snapshotWorldRoot: string;
  classicLevelEntry: string;
  expectedWorldId: "cor-cotn";
  expectedCoreVersion: "14.364";
  expectedSystem: "dnd5e";
}

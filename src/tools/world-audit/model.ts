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
  storageScope?: "world" | "pack";
  storageRelativePath?: string;
}

export interface OpenedSnapshotCollection {
  scope: "world" | "pack";
  relativePath: string;
  recordCount: number;
  logicalCollections: string[];
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
  openedCollections?: OpenedSnapshotCollection[];
}

export interface SnapshotOptions {
  sourceWorldRoot: string;
  snapshotWorldRoot: string;
  classicLevelEntry: string;
  expectedWorldId: "cor-cotn";
  expectedCoreVersion: "14.364";
  expectedSystem: "dnd5e";
}

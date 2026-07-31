export type PackageClass = 'upstream-exact' | 'account-protected' | 'server-only' | 'manual-review';

export interface ModuleInventoryEntry {
  folder: string;
  id: string | null;
  title: string | null;
  version: string | null;
  compatibility: { minimum?: string | number; verified?: string | number; maximum?: string | number };
  manifest: string | null;
  download: string | null;
  requires: string[];
  conflicts: string[];
  protected: boolean;
  persistentStorage: boolean;
  manifestSha256: string | null;
  parseError: string | null;
}

export interface ActiveModuleEntry {
  id: string;
  title: string;
  version: string;
}

export interface ClassifiedPackage {
  active: ActiveModuleEntry;
  disk: ModuleInventoryEntry | null;
  packageClass: PackageClass;
  reasons: string[];
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  commandLine: string;
}

export type IconMode = 'off' | 'safe';

export type IconResolutionSource =
  | 'override'
  | 'existing'
  | 'compendium-exact'
  | 'semantic'
  | 'type-default';

export type IconConfidence = 'exact' | 'high' | 'fallback';

export interface V14IconCatalogTarget {
  foundryVersion: '14.364';
  systemId: 'dnd5e';
  systemVersion: '5.3.3';
}

export interface V14IconCatalogEntry {
  id: string;
  name: string;
  img: string;
  type: string;
  identifier?: string;
  rules?: '2014' | '2024';
  pack: string;
  packPriority: number;
  tokens: string[];
}

export interface V14IconFileEntry {
  path: string;
  source: 'core' | 'dnd5e';
  tokens: string[];
}

export interface V14IconCatalog {
  schemaVersion: 1;
  target: V14IconCatalogTarget;
  provenance: {
    api: 'CompendiumCollection#getIndex';
    packIndexSha256: string;
    coreFilesSha256: string;
    dnd5eFilesSha256: string;
    packs: Array<{ id: string; count: number }>;
  };
  typeDefaults: Record<string, string>;
  compendium: V14IconCatalogEntry[];
  files: V14IconFileEntry[];
}

export interface V14IconOverrideSelector {
  itemType: string;
  englishName?: string;
  name?: string;
  actorEnglishName?: string;
  actorName?: string;
}

export interface V14IconOverrideEntry {
  selector: V14IconOverrideSelector;
  img: string;
}

export interface V14IconOverrideFile {
  schemaVersion: 1;
  target: V14IconCatalogTarget;
  entries: V14IconOverrideEntry[];
}

export interface IconCandidate {
  path: string;
  name: string;
  source: string;
  score: number;
  reasons: string[];
}

export interface IconResolution {
  selectedPath: string;
  source: IconResolutionSource;
  confidence: IconConfidence;
  reasons: string[];
  alternatives: IconCandidate[];
  overrideKey?: string;
}

export interface IconReviewEntry {
  actorName?: string;
  itemName: string;
  englishName?: string;
  itemType: string;
  previousPath: string;
  selectedPath: string;
  source: IconResolutionSource;
  confidence: IconConfidence;
  reasons: string[];
  alternatives: IconCandidate[];
  overrideKey?: string;
}

export interface IconReviewReport {
  schemaVersion: 1;
  target: V14IconCatalogTarget;
  mode: 'safe';
  entries: IconReviewEntry[];
  summary: {
    total: number;
    override: number;
    existing: number;
    exact: number;
    semantic: number;
    fallback: number;
  };
}

export interface IconWorkflowOptions {
  mode?: IconMode;
  overridePath?: string;
  catalog?: V14IconCatalog;
  overrides?: V14IconOverrideFile;
}

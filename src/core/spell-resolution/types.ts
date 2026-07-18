import type { EvidenceRef } from '../intake/types';

export type { EvidenceRef } from '../intake/types';

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

export interface PortableSpellRef {
  refId: string;
  identifier: string;
  originalName: string;
  englishName?: string;
  chineseName?: string;
  aliases: string[];
  expectedLevel?: number;
  expectedSchool?: string;
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

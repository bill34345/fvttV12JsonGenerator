import { RESOLVER_MODULE_ID } from '../../../src/core/spell-resolution/types';
import type { SpellSourceIndexDiagnostic, SpellSourceIndexResult } from './source-index';

export interface ResolverRuntimeVersions {
  foundry: string;
  dnd5e: string;
}

export interface ResolverCompatibilityDiagnostic {
  code: 'MISSING_RUNTIME_VERSION' | 'UNSUPPORTED_FOUNDRY_VERSION' | 'UNSUPPORTED_DND5E_VERSION' | 'SOURCE_INDEX_FAILED';
  message: string;
}

export interface ResolverCompatibility {
  supported: boolean;
  foundry: string;
  dnd5e: string;
  diagnostics: ResolverCompatibilityDiagnostic[];
}

export interface ResolverRuntimeApi {
  moduleId: typeof RESOLVER_MODULE_ID;
  compatibility: ResolverCompatibility;
  canMutate: boolean;
  sourceIndex?: SpellSourceIndexResult;
  diagnostics: Array<ResolverCompatibilityDiagnostic | SpellSourceIndexDiagnostic>;
  rebuildSourceIndex?: () => Promise<SpellSourceIndexResult>;
}

export interface ResolverRuntimeDiagnosticProjection {
  code: string;
  pack: string;
  path: string;
  message: string;
  blocking: boolean;
}

export function projectResolverRuntimeDiagnostics(
  runtime: ResolverRuntimeApi | undefined,
): ResolverRuntimeDiagnosticProjection[] {
  const diagnostics = runtime?.diagnostics ?? runtime?.sourceIndex?.diagnostics ?? [];
  return diagnostics.map((entry) => ({
    code: entry.code,
    pack: 'pack' in entry ? entry.pack : '',
    path: 'path' in entry ? entry.path : '',
    message: entry.message,
    blocking: 'blocking' in entry ? entry.blocking : entry.code === 'SOURCE_INDEX_FAILED',
  }));
}

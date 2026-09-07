import type { CanonicalSpecies } from '@fvtt-json-generator/models/species';
import {
  compileCanonicalSpecies,
  compileSpeciesMarkdown,
  parseAndCompileSpeciesMarkdown,
  validateNativeSpeciesPackage as validateNativeSpeciesPackageForAnyTarget,
} from './species';
import type { NativeSpeciesPackageForVersion, SpeciesPackageValidation } from './species';

export {
  HOMEBREW_SPECIES_MODULE_ID,
  SPECIES_FALLBACK_ICON,
  SPECIES_V12_TARGET,
} from './species';
export type {
  SpeciesPackageFinding,
  SpeciesPackageValidation,
} from './species';
export type NativeSpeciesPackage = NativeSpeciesPackageForVersion<'12'>;

export function compileSpeciesMarkdownV12(markdown: string): NativeSpeciesPackage {
  return compileSpeciesMarkdown(markdown, { fvttVersion: '12' });
}

export function parseAndCompileSpeciesMarkdownV12(markdown: string): { canonical: CanonicalSpecies; package: NativeSpeciesPackage } {
  return parseAndCompileSpeciesMarkdown(markdown, { fvttVersion: '12' });
}

export function compileCanonicalSpeciesV12(species: CanonicalSpecies, markdownSha256?: string): NativeSpeciesPackage {
  return compileCanonicalSpecies(species, { fvttVersion: '12' }, markdownSha256);
}

export function validateNativeSpeciesPackage(pkg: NativeSpeciesPackage): SpeciesPackageValidation {
  return validateNativeSpeciesPackageForAnyTarget(pkg, '12');
}

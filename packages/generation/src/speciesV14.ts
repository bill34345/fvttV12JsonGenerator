import { validateNativeSpeciesPackage as validateNativeSpeciesPackageForAnyTarget } from './species';
import type { NativeSpeciesPackageForVersion, SpeciesPackageValidation } from './species';

export {
  HOMEBREW_SPECIES_MODULE_ID,
  SPECIES_FALLBACK_ICON,
  SPECIES_V14_TARGET,
  compileCanonicalSpeciesV14,
  compileSpeciesMarkdownV14,
  parseAndCompileSpeciesMarkdownV14,
} from './species';

export type {
  SpeciesPackageFinding,
  SpeciesPackageValidation,
} from './species';
export type NativeSpeciesPackage = NativeSpeciesPackageForVersion<'14'>;

export function validateNativeSpeciesPackage(pkg: NativeSpeciesPackage): SpeciesPackageValidation {
  return validateNativeSpeciesPackageForAnyTarget(pkg, '14');
}

import { getFoundryTarget, type FoundryTarget } from '@fvtt-json-generator/generation/target';
import type { NativeDocumentProjection } from '@fvtt-json-generator/workflows/native-projection';
import { isVersionInMajor } from '@fvtt-json-generator/contracts/version-admission';

export type { NativeDocumentProjection } from '@fvtt-json-generator/workflows/native-projection';

export function isForgeRuntimeTargetSupported(core: unknown, system: unknown): boolean {
  return isNativeForgeRuntimeTargetSupported(core, system);
}

export function isNativeForgeRuntimeTargetSupported(core: unknown, system: unknown): boolean {
  return isVersionInMajor(core, '14.368') && isVersionInMajor(system, '6.0.6');
}

export const FORGE_NATIVE_606_TARGET: FoundryTarget = getFoundryTarget('14');

export function projectionForRuntime(core: string, system: string, port?: NativeDocumentProjection): NativeDocumentProjection | undefined {
  if (!isNativeForgeRuntimeTargetSupported(core, system)) return undefined;
  return port;
}

/** A successful native projection observes its receiver, not its locked source version. */
export function runtimeIdentityAfterProjection(projectedSystem: string,
  requested: { fvttVersion: string; systemVersion: string }, port?: NativeDocumentProjection): { fvttVersion: string; systemVersion: string } {
  if (projectedSystem === '6.0.6') {
    return { fvttVersion: port?.runtime?.coreVersion ?? requested.fvttVersion,
      systemVersion: port?.runtime?.systemVersion ?? requested.systemVersion };
  }
  return { fvttVersion: requested.fvttVersion, systemVersion: projectedSystem };
}

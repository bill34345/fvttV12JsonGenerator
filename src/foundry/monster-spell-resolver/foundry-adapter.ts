import { RESOLVER_MODULE_ID } from '../../core/spell-resolution/types';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { registerResolverSettings, type ResolverSettingDefinition, type ResolverSettingsMenuDefinition } from './settings';
import { createResolverSettingsApplicationClass } from './settings-app';
import {
  buildSpellSourceIndex,
  type FoundryItemPackRef,
  type FoundrySpellSourceAdapter,
  type SpellSourceIndexDiagnostic,
  type SpellSourceIndexResult,
} from './source-index';
import type {
  ResolverCompatibility,
  ResolverCompatibilityDiagnostic,
  ResolverRuntimeApi,
  ResolverRuntimeVersions,
} from './runtime-api';

export { projectResolverRuntimeDiagnostics } from './runtime-api';
export type {
  ResolverCompatibility,
  ResolverCompatibilityDiagnostic,
  ResolverRuntimeApi,
  ResolverRuntimeDiagnosticProjection,
  ResolverRuntimeVersions,
} from './runtime-api';

export const EXACT_FOUNDRY_VERSION = '14.364' as const;
export const EXACT_DND5E_VERSION = '5.3.3' as const;

export interface ResolverFoundryAdapter extends FoundrySpellSourceAdapter {
  registerSetting(definition: ResolverSettingDefinition): void;
  registerSettingsMenu(definition: ResolverSettingsMenuDefinition): void;
  getSetting(key: ResolverSettingDefinition['key']): unknown;
  setSetting(key: ResolverSettingDefinition['key'], value: unknown): Promise<void>;
  canPersistWorldSettings(): boolean;
  once(hook: 'init' | 'ready', callback: () => void | Promise<void>): void;
  exposeApi(api: ResolverRuntimeApi): void;
  logDebug(event: string, details: unknown): void;
}

export function evaluateRuntimeCompatibility(versions: ResolverRuntimeVersions): ResolverCompatibility {
  const diagnostics: ResolverCompatibilityDiagnostic[] = [];
  if (!versions.foundry || !versions.dnd5e) {
    diagnostics.push({ code: 'MISSING_RUNTIME_VERSION', message: 'Foundry and dnd5e runtime versions are required.' });
  } else {
    if (versions.foundry !== EXACT_FOUNDRY_VERSION) {
      diagnostics.push({
        code: 'UNSUPPORTED_FOUNDRY_VERSION',
        message: `Foundry ${versions.foundry} is unsupported; exact version ${EXACT_FOUNDRY_VERSION} is required.`,
      });
    }
    if (versions.dnd5e !== EXACT_DND5E_VERSION) {
      diagnostics.push({
        code: 'UNSUPPORTED_DND5E_VERSION',
        message: `dnd5e ${versions.dnd5e} is unsupported; exact version ${EXACT_DND5E_VERSION} is required.`,
      });
    }
  }
  return { supported: diagnostics.length === 0, ...versions, diagnostics };
}

export function registerResolverLifecycle(adapter: ResolverFoundryAdapter): void {
  adapter.once('init', () => registerResolverSettings(adapter));
  adapter.once('ready', async () => {
    const compatibility = evaluateRuntimeCompatibility(adapter.getRuntimeVersions());
    if (!compatibility.supported) {
      adapter.exposeApi({
        moduleId: RESOLVER_MODULE_ID,
        compatibility,
        canMutate: false,
        diagnostics: compatibility.diagnostics,
      });
      return;
    }

    let lastReadableIndex: SpellSourceIndexResult | undefined;
    const rebuildSourceIndex = async (): Promise<SpellSourceIndexResult> => {
      try {
        const sourceIndex = await buildSpellSourceIndex(adapter);
        if (adapter.canPersistWorldSettings()) {
          await adapter.setSetting('indexMetadata', {
            sourceInventoryHash: sourceIndex.sourceInventoryHash,
            candidateMetadataHash: sourceIndex.candidateMetadataHash,
            sourcePackages: sourceIndex.sourcePackages,
            sourcePacks: sourceIndex.sourcePacks,
            candidateCount: sourceIndex.candidates.length,
          });
        }
        lastReadableIndex = sourceIndex;
        adapter.exposeApi({
          moduleId: RESOLVER_MODULE_ID,
          compatibility,
          canMutate: !sourceIndex.diagnostics.some((diagnostic) => diagnostic.blocking),
          sourceIndex,
          diagnostics: sourceIndex.diagnostics,
          rebuildSourceIndex,
        });
        logSourceIndexDebug(adapter, 'source-index-rebuilt', sourceIndex, sourceIndex.diagnostics);
        return sourceIndex;
      } catch (error) {
        const diagnostic: ResolverCompatibilityDiagnostic = {
          code: 'SOURCE_INDEX_FAILED',
          message: `Source index rebuild failed: ${sanitizeError(error)}`,
        };
        adapter.exposeApi({
          moduleId: RESOLVER_MODULE_ID,
          compatibility,
          canMutate: false,
          ...(lastReadableIndex ? { sourceIndex: lastReadableIndex } : {}),
          diagnostics: [diagnostic],
          rebuildSourceIndex,
        });
        logSourceIndexDebug(adapter, 'source-index-rebuild-failed', lastReadableIndex, [diagnostic]);
        throw error;
      }
    };
    try {
      await rebuildSourceIndex();
    } catch { /* rebuildSourceIndex already exposed a retryable fail-closed API */ }
  });
}

export function createFoundryAdapter(): ResolverFoundryAdapter {
  return {
    getRuntimeVersions() {
      return {
        foundry: typeof game?.version === 'string' ? game.version : '',
        dnd5e: typeof game?.system?.version === 'string' ? game.system.version : '',
      };
    },
    async listEnabledReadableItemPacks() {
      const refs: FoundryItemPackRef[] = [];
      for (const pack of game?.packs ?? []) {
        if (pack.documentName !== 'Item') continue;
        const packageType = pack.metadata.packageType;
        const packageId = pack.metadata.packageName
          ?? (packageType === 'world' ? (game.world?.id ?? 'world') : 'unknown');
        const packageState = resolvePackageState(packageType, packageId);
        refs.push({
          collection: pack.collection,
          packageId,
          packageVersion: packageState.version,
          packId: pack.metadata.name ?? pack.collection.split('.').at(-1) ?? pack.collection,
          documentName: pack.documentName,
          enabled: packageState.enabled,
          readable: pack.visible === true,
          typeHints: readTypeHints(pack.metadata.flags),
          hasOptionsHint: hasOptionsHint(pack.metadata.flags),
        });
      }
      return refs;
    },
    async getItemIndex(pack, fields) {
      const runtimePack = game?.packs?.get(pack.collection);
      if (!runtimePack || runtimePack.documentName !== 'Item' || runtimePack.visible !== true) {
        throw new Error(`Item pack ${pack.collection} is unavailable or unreadable.`);
      }
      const index = await runtimePack.getIndex({ fields });
      if (isRecord(index) && Array.isArray(index.contents)) return index.contents;
      if (isIterable(index)) return [...index];
      throw new TypeError(`Item pack ${pack.collection} returned an unreadable index.`);
    },
    async getItemDocument(uuid) {
      return foundry?.utils?.fromUuid ? foundry.utils.fromUuid(uuid) : null;
    },
    registerSetting(definition) {
      if (!game?.settings) throw new Error('Foundry settings are unavailable during init.');
      const { key, ...config } = definition;
      game.settings.register(RESOLVER_MODULE_ID, key, config);
    },
    registerSettingsMenu(definition) {
      if (!game?.settings) throw new Error('Foundry settings are unavailable during init.');
      const { key, ...config } = definition;
      game.settings.registerMenu(RESOLVER_MODULE_ID, key, {
        ...config,
        type: createResolverSettingsApplicationClass(),
      });
    },
    getSetting(key) {
      return game?.settings?.get(RESOLVER_MODULE_ID, key);
    },
    async setSetting(key, value) {
      if (!game?.settings) throw new Error('Foundry settings are unavailable.');
      await game.settings.set(RESOLVER_MODULE_ID, key, value);
    },
    canPersistWorldSettings() {
      return game?.user?.isGM === true;
    },
    once(hook, callback) {
      Hooks.once(hook, callback);
    },
    exposeApi(api) {
      const module = game?.modules?.get(RESOLVER_MODULE_ID);
      if (module) module.api = Object.freeze(api);
    },
    logDebug(event, details) {
      console.debug(`[${RESOLVER_MODULE_ID}] ${event}`, details);
    },
  };
}

function logSourceIndexDebug(
  adapter: ResolverFoundryAdapter,
  event: 'source-index-rebuilt' | 'source-index-rebuild-failed',
  sourceIndex: SpellSourceIndexResult | undefined,
  diagnostics: Array<ResolverCompatibilityDiagnostic | SpellSourceIndexDiagnostic>,
): void {
  let enabled = false;
  try { enabled = adapter.getSetting('debugLogging') === true; }
  catch { return; }
  if (!enabled) return;
  adapter.logDebug(event, {
    candidateCount: sourceIndex?.candidates.length ?? 0,
    sourcePackageCount: sourceIndex?.sourcePackages.length ?? 0,
    sourcePackCount: sourceIndex?.sourcePacks.length ?? 0,
    retainedReadableIndex: event === 'source-index-rebuild-failed' && sourceIndex !== undefined,
    diagnostics: diagnostics.map((entry) => ({
      code: entry.code,
      pack: 'pack' in entry ? entry.pack : '',
      path: 'path' in entry ? entry.path : '',
      blocking: 'blocking' in entry ? entry.blocking : entry.code === 'SOURCE_INDEX_FAILED',
      errorHash: sha256(entry.message),
    })),
  });
}

function resolvePackageState(
  packageType: ResolverFoundryPack['metadata']['packageType'],
  packageId: string,
): { enabled: boolean; version: string } {
  if (packageType === 'system') {
    return { enabled: game?.system?.id === packageId, version: game?.system?.version ?? '' };
  }
  if (packageType === 'module') {
    const module = game?.modules?.get(packageId);
    return { enabled: module?.active === true, version: typeof module?.version === 'string' ? module.version : '' };
  }
  if (packageType === 'world') {
    return { enabled: true, version: game?.world?.version ?? 'world' };
  }
  return { enabled: false, version: '' };
}

function readTypeHints(flags: Record<string, unknown> | undefined): string[] | undefined {
  const dnd5e = isRecord(flags?.dnd5e) ? flags.dnd5e : undefined;
  return Array.isArray(dnd5e?.types) ? dnd5e.types.filter((entry): entry is string => typeof entry === 'string') : undefined;
}

function hasOptionsHint(flags: Record<string, unknown> | undefined): boolean {
  const dnd5e = isRecord(flags?.dnd5e) ? flags.dnd5e : undefined;
  return dnd5e !== undefined && 'options' in dnd5e;
}

function sanitizeError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/[\r\n]+/g, ' ').slice(0, 200) : 'unknown error';
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.iterator in value;
}

import { RESOLVER_MODULE_ID } from '../../core/spell-resolution/types';
import { registerResolverSettings, type ResolverSettingDefinition } from './settings';
import {
  buildSpellSourceIndex,
  type FoundryItemPackRef,
  type FoundrySpellSourceAdapter,
  type SpellSourceIndexDiagnostic,
  type SpellSourceIndexResult,
} from './source-index';

export const EXACT_FOUNDRY_VERSION = '14.364' as const;
export const EXACT_DND5E_VERSION = '5.3.3' as const;

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
}

export interface ResolverFoundryAdapter extends FoundrySpellSourceAdapter {
  registerSetting(definition: ResolverSettingDefinition): void;
  getSetting(key: ResolverSettingDefinition['key']): unknown;
  setSetting(key: ResolverSettingDefinition['key'], value: unknown): Promise<void>;
  canPersistWorldSettings(): boolean;
  once(hook: 'init' | 'ready', callback: () => void | Promise<void>): void;
  exposeApi(api: ResolverRuntimeApi): void;
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

    try {
      const sourceIndex = await buildSpellSourceIndex(adapter);
      if (adapter.canPersistWorldSettings()) {
        await adapter.setSetting('indexMetadata', {
          sourceInventoryHash: sourceIndex.sourceInventoryHash,
          candidateMetadataHash: sourceIndex.candidateMetadataHash,
          sourcePackages: sourceIndex.sourcePackages,
          candidateCount: sourceIndex.candidates.length,
        });
      }
      adapter.exposeApi({
        moduleId: RESOLVER_MODULE_ID,
        compatibility,
        canMutate: !sourceIndex.diagnostics.some((diagnostic) => diagnostic.blocking),
        sourceIndex,
        diagnostics: sourceIndex.diagnostics,
      });
    } catch (error) {
      const diagnostic: ResolverCompatibilityDiagnostic = {
        code: 'SOURCE_INDEX_FAILED',
        message: `Source index initialization failed: ${sanitizeError(error)}`,
      };
      adapter.exposeApi({
        moduleId: RESOLVER_MODULE_ID,
        compatibility,
        canMutate: false,
        diagnostics: [diagnostic],
      });
    }
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
  };
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

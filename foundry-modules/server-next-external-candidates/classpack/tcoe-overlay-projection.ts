import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/** Exact installed TCoE 4.0.0 hook used for this offline projection. */
export const TCOE_OVERLAY_SOURCE = Object.freeze({
  version: '4.0.0',
  scriptPath: 'F:/FoundryLab/foundry-v14/data/server-next/Data/modules/dnd-tashas-cauldron/scripts/modules/optional-features.mjs',
  sha256: '1d20c987899ff3c8d1fc67e2c9b91e93dbd942daeb1899250b3b14e4fed4d8af',
});

type JsonObject = Record<string, unknown>;

function property(object: unknown, path: string): unknown {
  if (!path) return object;
  return path.split('.').reduce<unknown>((value, key) =>
    value !== null && typeof value === 'object' ? (value as JsonObject)[key] : undefined, object);
}

function hasProperty(object: unknown, path: string): boolean {
  const keys = path.split('.');
  const parent = property(object, keys.slice(0, -1).join('.'));
  return parent !== null && typeof parent === 'object' && Object.hasOwn(parent, keys.at(-1)!);
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value) || typeof value === 'string') return value.length === 0;
  return typeof value === 'object' ? Object.keys(value).length === 0 : false;
}

/** Project the vendor's initializeItemSource overlay without importing or running Foundry. */
export function projectTcoeInitializations<T extends JsonObject>(source: T, enabled = true): T {
  const vendorSource = readFileSync(TCOE_OVERLAY_SOURCE.scriptPath, 'utf8');
  const digest = createHash('sha256').update(vendorSource).digest('hex');
  if (digest !== TCOE_OVERLAY_SOURCE.sha256) {
    throw new Error(`TCoE optional-features source changed: ${digest}`);
  }

  const callbacks: Array<(item: null, data: T) => void> = [];
  class ItemGrantAdvancement {
    constructor(private readonly data: JsonObject) {}
    toObject() { return { type: 'ItemGrant', ...this.data }; }
  }
  const context = vm.createContext({
    CONFIG: { DND5E: { advancementTypes: {} }, TCOE: {} },
    TCOEReplacementGrantAdvancement: class {},
    Hooks: {
      on: (name: string, callback: (item: null, data: T) => void) => {
        if (name === 'dnd5e.initializeItemSource') callbacks.push(callback);
      },
      once: () => {},
    },
    game: {
      dnd5e: { documents: { advancement: { ItemGrantAdvancement } } },
      i18n: { localize: (key: string) => key },
      settings: { get: (module: string, key: string) => {
        if (module !== 'dnd-tashas-cauldron' || key !== 'insertOptionals') throw new Error('Unexpected setting');
        return enabled;
      } },
    },
    dnd5e: { utils: { staticID: (id: string) => id.substring(0, 16).padEnd(16, '0') } },
    foundry: { utils: { getProperty: property, hasProperty, isEmpty } },
  });
  const script = vendorSource
    .replace(/^import \{ TCOEReplacementGrantAdvancement \} from "\.\/replacement-grant\.mjs";\r?\n/, '')
    .replace('export default function initialize()', 'function initialize()');
  vm.runInContext(`${script}\ninitialize();`, context, { filename: TCOE_OVERLAY_SOURCE.scriptPath, timeout: 1000 });
  if (callbacks.length !== 3) throw new Error(`Expected three TCoE item-source callbacks, got ${callbacks.length}`);

  const projected = structuredClone(source);
  for (const callback of callbacks) callback(null, projected);
  return projected;
}

import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { registerClasspackTcoeSourceInterop } from './tcoe-source-interop.mjs';
import { projectTcoeInitializations, TCOE_OVERLAY_SOURCE } from './tcoe-overlay-projection';

const analysis = JSON.parse(readFileSync(join(import.meta.dir,
  '../../../.local/classpack-next-20261002/full-source-difference-analysis.json'), 'utf8'));
const original = analysis.rows.find((row: any) => row.type === 'advancementIds'
  && row.pack === 'classes-new' && row.key === '!items!6Ce5hGue5OSI2jKj').originalRecord;
const targetPack = 'dnd5e_classpack.classes-new';

// dnd5e 6.0.5 AdvancementTemplate.#migrateStorage: array -> keyed object.
function coreMigrationProjection(source: any) {
  const data = structuredClone(source);
  if (Array.isArray(data.system.advancement)) {
    data.system.advancement = Object.fromEntries(data.system.advancement.map((entry: any) => [entry._id, entry]));
  }
  return data;
}

function harness(expectedAdvancementIds: string[], enabled = true) {
  const callbacks = new Map<string, Array<(...args: any[]) => void>>();
  const Hooks = {
    errors: [] as Error[],
    on(name: string, callback: (...args: any[]) => void) {
      callbacks.set(name, [...(callbacks.get(name) ?? []), callback]);
    },
    once(name: string, callback: (...args: any[]) => void) { this.on(name, callback); },
    // Core Hooks.callAll catches a handler error and continues to later hooks.
    call(name: string, ...args: any[]) {
      for (const callback of [...(callbacks.get(name) ?? [])]) {
        try { callback(...args); } catch (error) { this.errors.push(error as Error); }
      }
    },
  };
  const game = {
    modules: new Map([['dnd-tashas-cauldron', { active: true, version: '4.0.0' }]]),
    settings: { get: (_module: string, _key: string) => enabled, register: () => {} },
    dnd5e: { documents: { advancement: { ItemGrantAdvancement: class {
      constructor(private data: object) {}
      toObject() { return { type: 'ItemGrant', ...this.data }; }
    } } } },
    i18n: { localize: (key: string) => key },
  };
  const state = registerClasspackTcoeSourceInterop({ Hooks, getGame: () => game, expectedAdvancementIds });

  // Execute the pinned vendor's public hook registration after our pre-hook.
  const vendorSource = readFileSync(TCOE_OVERLAY_SOURCE.scriptPath, 'utf8');
  expect(createHash('sha256').update(vendorSource).digest('hex')).toBe(TCOE_OVERLAY_SOURCE.sha256);
  const script = vendorSource
    .replace(/^import \{ TCOEReplacementGrantAdvancement \} from "\.\/replacement-grant\.mjs";\r?\n/, '')
    .replace('export default function initialize()', 'function initialize()');
  const property = (obj: any, path: string) => path.split('.').reduce((value, key) => value?.[key], obj);
  const context = vm.createContext({
    Hooks, game, CONFIG: { DND5E: { advancementTypes: {} }, TCOE: {} },
    TCOEReplacementGrantAdvancement: class {},
    dnd5e: { utils: { staticID: (id: string) => id.substring(0, 16).padEnd(16, '0') } },
    foundry: { utils: {
      getProperty: property,
      hasProperty: (obj: any, path: string) => property(obj, path) !== undefined,
      isEmpty: (value: any) => value == null || (Array.isArray(value) ? !value.length : !Object.keys(value).length),
    } },
  });
  vm.runInContext(`${script}\ninitialize();`, context, { filename: TCOE_OVERLAY_SOURCE.scriptPath, timeout: 1000 });
  Hooks.call('setup'); // registers our post-hook after the vendor's three source callbacks
  const ownCallbacks = () => {
    const handlers = callbacks.get('dnd5e.initializeItemSource')!;
    return [handlers[0], handlers.at(-1)!];
  };
  return { Hooks, game, state, ownCallbacks };
}

const ids = (source: any) => Object.keys(coreMigrationProjection(source).system.advancement).sort();

describe('classpack TCoE source wire interop', () => {
  test('brackets the pinned vendor callbacks for the migrated Ranger map', () => {
    const expected = projectTcoeInitializations(original);
    const { Hooks, state } = harness(ids(expected));
    const source = coreMigrationProjection(original);
    expect(Array.isArray(source.system.advancement)).toBe(false);
    Hooks.call('dnd5e.initializeItemSource', null, source, { pack: targetPack });
    expect(Array.isArray(source.system.advancement)).toBe(false);
    expect(ids(source)).toEqual(ids(expected));
    expect(source.system.advancement).toEqual(coreMigrationProjection(expected).system.advancement);
    expect(state.assertValid()).toBe(true);
    expect(state.diagnostic()).toMatchObject({ preConverted: 1, postRestored: 1, pending: 0,
      failures: [], sourceWireCases: ['id-map'] });
  });

  test('original legacy array keeps the dnd5e migration flag truthful', () => {
    const expected = projectTcoeInitializations(original);
    const { Hooks, state } = harness(ids(expected));
    const source = structuredClone(original);
    Hooks.call('dnd5e.initializeItemSource', null, source, { pack: targetPack });
    expect(Array.isArray(source.system.advancement)).toBe(true);
    expect(source.system.advancement).toEqual(expected.system.advancement);
    expect(state.diagnostic()).toMatchObject({ preConverted: 0, postRestored: 0, sourceWireCases: ['legacy-array'] });
  });

  test('unrelated scope and disabled setting leave the map unbracketed', () => {
    for (const [pack, rules, enabled] of [
      ['other.pack', '2014', true], [targetPack, '2024', true], [targetPack, '2014', false],
    ] as const) {
      const { state, ownCallbacks } = harness(ids(projectTcoeInitializations(original)), enabled);
      const source = coreMigrationProjection(original);
      source.system.source.rules = rules;
      const before = structuredClone(source);
      // Other packages retain their own initialization behavior. Check that
      // this component's callbacks leave out-of-scope source data untouched.
      for (const callback of ownCallbacks()) callback(null, source, { pack });
      expect(source).toEqual(before);
      expect(state.diagnostic().preConverted).toBe(0);
    }
  });

  test('unexpected or missing post-overlay IDs stay diagnostic failures', () => {
    const expected = ids(projectTcoeInitializations(original));
    const { Hooks, state } = harness([...expected, 'missingExpectedID']);
    const source = coreMigrationProjection(original);
    Hooks.call('dnd5e.initializeItemSource', null, source, { pack: targetPack });
    expect(() => state.assertValid()).toThrow('missingExpectedID');
    expect(state.diagnostic()).toMatchObject({ preConverted: 1, postRestored: 0, pending: 1 });
    expect(Array.isArray(source.system.advancement)).toBe(true);
  });

  test('malformed source keys fail closed without changing the wire map', () => {
    const { Hooks, state } = harness(ids(projectTcoeInitializations(original)));
    const source = coreMigrationProjection(original);
    const [first] = Object.keys(source.system.advancement);
    source.system.advancement.bad = source.system.advancement[first];
    Hooks.call('dnd5e.initializeItemSource', null, source, { pack: targetPack });
    expect(() => state.assertValid()).toThrow('mismatched Advancement ID');
    expect(Array.isArray(source.system.advancement)).toBe(false);
  });
});

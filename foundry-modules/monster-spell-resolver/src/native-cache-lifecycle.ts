import { RESOLVER_MODULE_ID } from '../../../src/core/spell-resolution';
import { computeManagedSourceHash } from './cast-activity';
import {parseFragment,serialize} from 'parse5';

export interface ResolverDocumentHookBus {
  on(hook: 'createItem' | 'updateActiveEffect', callback: (...args: any[]) => void): unknown;
  off(hook: 'createItem' | 'updateActiveEffect', hookId: unknown): void;
}

export class NativeCacheLifecycleTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NativeCacheLifecycleTimeoutError';
  }
}

export interface NativeCacheExpectation {
  actor: any;
  cachedFor: string;
  selectedUuid: string;
  projection: Record<string, any>;
}

interface UpdatedEffectEvent {
  effect: any;
  changed: any;
  userId: unknown;
}

export type NativeEffectChangesLocation = 'changes' | 'system.changes';

export class NativeCacheLifecycleCapture {
  private readonly createdItems: any[] = [];
  private readonly updatedEffects: UpdatedEffectEvent[] = [];
  private readonly hookIds: Array<{ name: 'createItem' | 'updateActiveEffect'; id: unknown }> = [];
  private readonly waiters = new Set<() => void>();
  private projectionMismatch: string | undefined;

  constructor(private readonly hooks?: ResolverDocumentHookBus) {
    if (!hooks) return;
    this.listen('createItem', (item) => this.createdItems.push(item));
    this.listen('updateActiveEffect', (effect, changed, _options, userId) => {
      this.updatedEffects.push({ effect, changed, userId });
    });
  }

  get active(): boolean {
    return this.hooks !== undefined;
  }

  async waitForCreatedCache(expectation: NativeCacheExpectation, timeoutMs = 5_000): Promise<any> {
    return this.waitFor(() => {
      for (const item of this.createdItems) {
        if (item?.type !== 'spell' || item?.parent !== expectation.actor || item?.actor !== expectation.actor) continue;
        if (item?.flags?.dnd5e?.cachedFor !== expectation.cachedFor) continue;
        if (readCompendiumSource(item) !== expectation.selectedUuid) continue;
        try {
          assertNativeCacheProjectionMatches(expectation.projection, item);
          return item;
        } catch (error) {
          this.projectionMismatch = errorMessage(error);
        }
      }
      return undefined;
    }, `createItem for ${expectation.cachedFor}`, timeoutMs);
  }

  async waitForUpdatedEffect(
    actor: any,
    itemId: string,
    effectId: string,
    expectedChanges: unknown,
    location: NativeEffectChangesLocation,
    expectedUserId?: string,
    timeoutMs = 5_000,
  ): Promise<any> {
    return this.waitFor(
      () => this.updatedEffects.find(({ effect, changed, userId }) => documentId(effect) === effectId
        && documentId(effect?.parent) === itemId
        && (effect?.parent?.actor === actor || effect?.parent?.parent === actor)
        && (expectedUserId === undefined || userId === expectedUserId)
        && nativeEffectChangesEqual(normalizeNativeEffectHookChanges(changed), expectedChanges)
        && nativeEffectChangesEqual(readNativeEffectChanges(effect, location), expectedChanges))?.effect,
      `updateActiveEffect for ${itemId}/${effectId}`,
      timeoutMs,
    );
  }

  dispose(): void {
    if (!this.hooks) return;
    for (const { name, id } of this.hookIds.splice(0)) this.hooks.off(name, id);
    this.waiters.clear();
  }

  private listen(name: 'createItem' | 'updateActiveEffect', collect: (...args: any[]) => void): void {
    const id = this.hooks!.on(name, (...args) => {
      collect(...args);
      for (const wake of [...this.waiters]) wake();
    });
    this.hookIds.push({ name, id });
  }

  private async waitFor<T>(find: () => T | undefined, description: string, timeoutMs: number): Promise<T> {
    const immediate = find();
    if (immediate !== undefined) return immediate;
    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        this.waiters.delete(wake);
        if (timer !== undefined) clearTimeout(timer);
      };
      const wake = () => {
        const value = find();
        if (value === undefined) return;
        cleanup();
        resolve(value);
      };
      this.waiters.add(wake);
      timer = setTimeout(() => {
        cleanup();
        reject(new NativeCacheLifecycleTimeoutError(
          `Timed out waiting for public Foundry ${description}.${this.projectionMismatch ? ` ${this.projectionMismatch}` : ''}`,
        ));
      }, timeoutMs);
      wake();
    });
  }
}

export function resolverDocumentHooks(value?: ResolverDocumentHookBus): ResolverDocumentHookBus | undefined {
  if (value) return value;
  const hooks = (globalThis as any).Hooks;
  if (hooks && typeof hooks.on === 'function' && typeof hooks.off === 'function') return hooks;
  if ((globalThis as any).game !== undefined || (globalThis as any).foundry !== undefined) {
    throw new Error('Public Foundry Hooks are unavailable; native spell-cache lifecycle cannot be verified safely.');
  }
  return undefined;
}

export function captureNativeCacheProjection(source: any): Record<string, any> {
  const projection = documentSource(source);
  delete projection._id;
  delete projection.id;
  if (isRecord(projection.flags)) delete projection.flags[RESOLVER_MODULE_ID];
  normalizeNativeCacheRichText(projection);
  normalizeNativeCacheEffectChangeIds(projection);
  return projection;
}

export function nativeEffectChangesEqual(actual: unknown, expected: unknown): boolean {
  if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
  return computeManagedSourceHash({ effects: [{ changes: withoutNativeChangeRowIds(actual) }] })
    === computeManagedSourceHash({ effects: [{ changes: withoutNativeChangeRowIds(expected) }] });
}

/** The public cached source identifies the exact dnd5e effect schema in use. */
export function nativeEffectChangesLocation(effect: unknown): NativeEffectChangesLocation {
  const source = documentSource(effect);
  const legacy = Array.isArray(source.changes);
  const system = Array.isArray(source.system?.changes);
  if (legacy === system) throw new Error('Native Cast enchantment must have exactly one supported changes field.');
  return system ? 'system.changes' : 'changes';
}

export function readNativeEffectChanges(effect: unknown, location: NativeEffectChangesLocation): unknown {
  const source = documentSource(effect);
  return location === 'system.changes' ? source.system?.changes : source.changes;
}

/** Foundry update hooks may report a nested, dotted, or legacy update key. */
export function normalizeNativeEffectHookChanges(changed: unknown): unknown {
  if (!isRecord(changed)) return undefined;
  const candidates = [changed.system?.changes, changed['system.changes'], changed.changes]
    .filter((value) => value !== undefined);
  if (!candidates.length || !candidates.every((value) => nativeEffectChangesEqual(value, candidates[0]))) return undefined;
  return candidates[0];
}

/** Call only after strict ownership checks; unowned cache adoption still uses the native state alone. */
export function assertOwnedJournalCacheProjection(
  entry: { nativeProjection: Record<string, any>; ownedProjections?: Record<string, any>[] },
  cache: any,
): void {
  for (const projection of [entry.nativeProjection, ...(entry.ownedProjections ?? [])]) {
    try { assertNativeCacheProjectionMatches(projection, cache); return; } catch { /* Try the next complete planned state. */ }
  }
  throw Error('Owned cache does not match its original native or complete transaction-planned projection.');
}

export function assertNativeCacheProjectionMatches(expectedProjection: unknown, actualDocument: any, phase?: string): void {
  const expected = captureNativeCacheProjection(expectedProjection);
  const actual = captureNativeCacheProjection(actualDocument);
  const actualExpectedShape = retainExpectedShape(expected, actual);
  if (computeManagedSourceHash(expected) !== computeManagedSourceHash(actualExpectedShape)) {
    // Diagnostics deliberately use the same complete hash boundary as above.
    // Only paths are exposed; source text, effect values and flags stay private.
    const paths = changedManagedProjectionPaths(expected, actualExpectedShape);
    throw new Error('Native cache does not match the complete prepared Activity public getter projection.'
      + (phase ? ` Phase: ${phase}.` : '')
      + (paths.length ? ` Business paths: ${paths.join(', ')}.` : ''));
  }
}

function changedManagedProjectionPaths(expected: Record<string, any>, actual: unknown): string[] {
  const paths: string[] = [];
  const expectedHash = computeManagedSourceHash(expected);
  const visit = (left: unknown, right: unknown, path: string[]) => {
    if (paths.length >= 12 || Object.is(left, right)) return;
    if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
      left.forEach((value, index) => visit(value, right[index], [...path, String(index)]));
      return;
    }
    if (isRecord(left) && isRecord(right)) {
      for (const key of Object.keys(left)) visit(left[key], right[key], [...path, key]);
      return;
    }
    const candidate = structuredClone(expected);
    let parent: any = candidate;
    for (const key of path.slice(0, -1)) parent = parent[key];
    parent[path.at(-1)!] = right;
    if (computeManagedSourceHash(candidate) !== expectedHash) {
      paths.push('/' + path.map(key => key.replace(/~/gu, '~0').replace(/\//gu, '~1')).join('/'));
    }
  };
  visit(expected, actual, []);
  return paths;
}

function retainExpectedShape(expected: unknown, actual: unknown): unknown {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return actual;
    return expected.map((entry, index) => retainExpectedShape(entry, actual[index]));
  }
  if (!isRecord(expected)) return actual;
  if (!isRecord(actual)) return actual;
  return Object.fromEntries(Object.keys(expected).map((key) => [key, retainExpectedShape(expected[key], actual[key])]));
}

function documentSource(document: any): Record<string, any> {
  if (document && typeof document.toObject === 'function') return document.toObject();
  if (!isRecord(document)) return {};
  const source: Record<string, any> = {};
  for (const [key, value] of Object.entries(document)) {
    if (['parent', 'actor', 'item', 'id', 'relativeUUID', 'cachedSpell'].includes(key) || typeof value === 'function') continue;
    source[key] = structuredClone(value);
  }
  return source;
}

function readCompendiumSource(document: any): unknown {
  return documentSource(document)?._stats?.compendiumSource;
}

function normalizeNativeCacheRichText(projection: Record<string, any>): void {
  const description = projection.system?.description;
  if (isRecord(description)) {
    for (const key of ['value', 'chat']) {
      if (typeof description[key] === 'string') description[key] = normalizeNativeHtml(description[key]);
    }
  }
  if (!Array.isArray(projection.effects)) return;
  for (const effect of projection.effects) {
    if (isRecord(effect) && typeof effect.description === 'string') {
      effect.description = normalizeNativeHtml(effect.description);
    }
  }
}

function normalizeNativeCacheEffectChangeIds(projection: Record<string, any>): void {
  if (!Array.isArray(projection.effects)) return;
  for (const effect of projection.effects) {
    // Foundry assigns fresh row IDs while materializing the public Cast getter's
    // effect changes as an embedded Spell. Their order and mechanics must still match.
    for (const changes of [effect?.changes, effect?.system?.changes]) {
      if (!Array.isArray(changes)) continue;
      for (const change of changes) if (isRecord(change)) delete change._id;
    }
  }
}

function withoutNativeChangeRowIds(changes: unknown[]): unknown[] {
  return changes.map((change) => {
    if (!isRecord(change)) return change;
    const source = structuredClone(change);
    delete source._id;
    return source;
  });
}

function normalizeNativeHtml(value: string): string {
  // Source-derived native creation serializes a literal '<' before non-ASCII
  // text as '&lt;'. Compare inert HTML trees, not decoded strings: real tags,
  // text, attributes, comments, references and entity depth remain distinct.
  // parse5 has no DOM, script execution, resource loading, or Foundry writes.
  return serialize(parseFragment(value));
}

function documentId(document: any): string {
  return typeof document?.id === 'string' ? document.id : (typeof document?._id === 'string' ? document._id : '');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

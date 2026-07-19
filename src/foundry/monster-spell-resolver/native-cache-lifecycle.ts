import { RESOLVER_MODULE_ID } from '../../core/spell-resolution';
import { computeManagedSourceHash } from './cast-activity';

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
    expectedUserId?: string,
    timeoutMs = 5_000,
  ): Promise<any> {
    return this.waitFor(
      () => this.updatedEffects.find(({ effect, changed, userId }) => documentId(effect) === effectId
        && documentId(effect?.parent) === itemId
        && (effect?.parent?.actor === actor || effect?.parent?.parent === actor)
        && (expectedUserId === undefined || userId === expectedUserId)
        && nativeEffectChangesEqual(changed?.changes, expectedChanges))?.effect,
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
  return projection;
}

export function nativeEffectChangesEqual(actual: unknown, expected: unknown): boolean {
  return computeManagedSourceHash({ effects: [{ changes: actual }] })
    === computeManagedSourceHash({ effects: [{ changes: expected }] });
}

export function assertNativeCacheProjectionMatches(expectedProjection: unknown, actualDocument: any): void {
  const expected = captureNativeCacheProjection(expectedProjection);
  const actual = captureNativeCacheProjection(actualDocument);
  const actualExpectedShape = retainExpectedShape(expected, actual);
  if (computeManagedSourceHash(expected) !== computeManagedSourceHash(actualExpectedShape)) {
    throw new Error('Native cache does not match the complete prepared Activity public getter projection.');
  }
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
      if (typeof description[key] === 'string') description[key] = normalizeHtmlAmpersands(description[key]);
    }
  }
  if (!Array.isArray(projection.effects)) return;
  for (const effect of projection.effects) {
    if (isRecord(effect) && typeof effect.description === 'string') {
      effect.description = normalizeHtmlAmpersands(effect.description);
    }
  }
}

function normalizeHtmlAmpersands(value: string): string {
  return value.replaceAll('&amp;', '&');
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

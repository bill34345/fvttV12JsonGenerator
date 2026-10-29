import { MODULE_ID } from './constants.ts';
import type { Dnd5eRuntime } from './dnd5e-adapter.ts';
import type { DeckCommand } from './types.ts';

const TARGETS = [
  'CONFIG.Combat.documentClass.prototype._manageTurnEvents',
  'CONFIG.Combat.documentClass.prototype._recoverUses',
  'foundry.documents.ActiveEffect.registry.refresh',
  'game.time.onUpdateWorldTime',
  'foundry.abstract.Document.createDocuments',
  'foundry.abstract.Document.updateDocuments',
  'foundry.abstract.Document.deleteDocuments',
  'CONFIG.ActiveEffect.documentClass.fromStatusEffect',
  'CONFIG.ActiveEffect.documentClass.prototype._onUpdate',
  'CONFIG.Item.documentClass.prototype._onUpdate',
  'CONFIG.Item.documentClass.prototype._onDelete',
  'CONFIG.Item.documentClass.prototype.deleteActivity',
  'CONFIG.Actor.documentClass.prototype.endConcentration',
  'CONFIG.Actor.documentClass.prototype.toggleStatusEffect',
  'CONFIG.Actor.documentClass.prototype._onUpdate',
  'CONFIG.Actor.documentClass.prototype._onCreateDescendantDocuments',
  'CONFIG.Actor.documentClass.prototype._onUpdateDescendantDocuments',
  'CONFIG.Actor.documentClass.prototype._onDeleteDescendantDocuments',
] as const;
const CREATED_DOCUMENTS = ['Actor', 'Item', 'ActiveEffect', 'Combat', 'Combatant', 'CombatantGroup', 'Token', 'ActorDelta'] as const;

class NativeTaskScope {
  readonly created = new Set<string>();
  readonly observed = new Set<string>();
  #pending = new Set<Promise<unknown>>();
  #failures: unknown[] = [];
  revision = 0;

  observe(target: string, result: unknown): void {
    if (!result || typeof (result as Promise<unknown>).then !== 'function') return;
    this.observed.add(target);
    const pending = Promise.resolve(result);
    if (this.#pending.has(pending)) return;
    this.revision += 1;
    this.#pending.add(pending);
    void pending.then(() => this.#pending.delete(pending), (error) => {
      this.#failures.push(error); this.#pending.delete(pending);
      console.error(`Open Session Deck native completion failed at ${target}`, error);
    });
  }

  async settle(): Promise<void> {
    while (this.#pending.size) await Promise.allSettled([...this.#pending]);
    if (this.#failures.length) {
      const errors = this.#failures.splice(0);
      throw new AggregateError(errors, 'Native operation failed');
    }
  }
}

/** Observes original returned Promises; it never replaces the native calculation or its return value. */
export class NativeCompletion {
  #attempted = false;
  #installed = false;
  #scope?: NativeTaskScope;
  lastCreated: ReadonlySet<string> = new Set();
  lastObserved: ReadonlySet<string> = new Set();
  lastJournalFailed = false;

  constructor(private readonly runtime: Dnd5eRuntime) {}

  initialize(): void {
    if (this.#attempted) return;
    this.#attempted = true;
    const library = (globalThis as any).libWrapper;
    if (!this.runtime.game.modules?.get?.('lib-wrapper')?.active || !library?.register) return;
    const registrations: number[] = [];
    const completion = this;
    try {
      for (const target of TARGETS) registrations.push(library.register(MODULE_ID, target, function (wrapped: (...args: any[]) => any, ...args: any[]) {
        const result = wrapped(...args);
        completion.#scope?.observe(target, result);
        return result;
      }, 'WRAPPER'));
      this.#installed = true;
    } catch (error) {
      for (const id of registrations) library.unregister(MODULE_ID, id, false);
      console.warn('Open Session Deck could not observe native completion.', error);
    }
  }

  canCapture(commands: readonly DeckCommand[]): boolean {
    this.initialize();
    const user = this.runtime.game.user, activeGM = this.runtime.game.users?.activeGM;
    if (!activeGM || activeGM.id !== user?.id) return false;
    return this.#installed && !this.triggerBoundaryMissing;
  }

  get triggerBoundaryMissing(): boolean {
    const trigger = this.runtime.game.modules?.get?.('fvtt-trigger-engine');
    const conditions = this.runtime.game.modules?.get?.('fvtt-custom-conditions');
    return Boolean(trigger?.active && (trigger.api?.ready !== true || trigger.api?.capabilities?.awaitIdle !== 1
      || trigger.api?.capabilities?.combatRewind !== 1 || typeof trigger.api?.whenIdle !== 'function'
      || typeof trigger.api?.captureCombatUndo !== 'function' || typeof trigger.api?.reconcileCombatUndo !== 'function')
      || conditions?.active && (conditions.api?.capabilities?.combatRewind !== 1
        || conditions.api?.capabilities?.awaitIdle !== 1 || typeof conditions.api?.whenIdle !== 'function'));
  }

  async waitForIdle(): Promise<void> {
    const trigger = this.runtime.game.modules?.get?.('fvtt-trigger-engine');
    if (trigger?.active && !this.triggerBoundaryMissing && this.runtime.game.users?.activeGM?.id === this.runtime.game.user?.id) await trigger.api.whenIdle();
    const conditions = this.runtime.game.modules?.get?.('fvtt-custom-conditions');
    if (conditions?.active && !this.triggerBoundaryMissing && this.runtime.game.users?.activeGM?.id === this.runtime.game.user?.id) await conditions.api.whenIdle();
  }

  captureCombatUndo(combat: any): unknown {
    const trigger = this.runtime.game.modules?.get?.('fvtt-trigger-engine');
    return trigger?.active && !this.triggerBoundaryMissing ? trigger.api.captureCombatUndo(combat) : undefined;
  }

  async reconcileCombatUndo(combat: any, checkpoint: unknown): Promise<void> {
    const trigger = this.runtime.game.modules?.get?.('fvtt-trigger-engine');
    if (trigger?.active && !this.triggerBoundaryMissing) await trigger.api.reconcileCombatUndo(combat, checkpoint);
  }

  async flush(): Promise<void> { if (this.#scope) await this.#drain(this.#scope); }

  async #drain(scope: NativeTaskScope): Promise<void> {
    const failures: unknown[] = [];
    while (true) {
      try { await scope.settle(); } catch (error) { failures.push(error); }
      const revision = scope.revision;
      try { await this.waitForIdle(); } catch (error) { failures.push(error); }
      try { await scope.settle(); } catch (error) { failures.push(error); }
      if (revision === scope.revision) break;
    }
    if (failures.length) throw new AggregateError(failures, 'Native operation failed');
  }

  async run<T>(operation: () => Promise<T>, beforeWrite?: (document: any, created: ReadonlySet<string>) => void): Promise<T> {
    this.initialize();
    const scope = new NativeTaskScope();
    this.#scope = scope;
    const hooks = (globalThis as any).Hooks;
    const listeners: Array<[string, number]> = [];
    this.lastJournalFailed = false;
    if (hooks?.on && hooks?.off) for (const name of CREATED_DOCUMENTS) {
      const hook = `create${name}`;
      listeners.push([hook, hooks.on(hook, (document: any, _options: unknown, userId: string) => {
        if (userId === this.runtime.game.user.id) scope.created.add(String(document.uuid));
      })]);
      if (!beforeWrite) continue;
      for (const action of ['Update', 'Delete', 'Create']) {
        const event = `pre${action}${name}`;
        listeners.push([event, hooks.on(event, (document: any) => {
          try {
            let existing = action === 'Create' ? document.parent : document;
            if (existing?.documentName === 'ActorDelta') {
              beforeWrite(existing, scope.created);
              existing = existing.parent?.actor;
            }
            if (existing) {
              beforeWrite(existing, scope.created);
              if (existing.parent?.documentName === 'Combat') beforeWrite(existing.parent, scope.created);
            }
          } catch (error) {
            this.lastJournalFailed = true;
            console.error('Open Session Deck could not record a native change.', error);
          }
        })]);
      }
    }
    let result: T | undefined, failure: unknown;
    try {
      try { result = await operation(); } catch (error) { failure = error; }
      try { await this.#drain(scope); }
      catch (error) { failure = failure ? new AggregateError([failure, error], 'Operation and native completion failed') : error; }
      if (failure) throw failure;
      return result as T;
    } finally {
      for (const [hook, id] of listeners) hooks.off(hook, id);
      this.lastCreated = scope.created;
      this.lastObserved = scope.observed;
      this.#scope = undefined;
    }
  }
}

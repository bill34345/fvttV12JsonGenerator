import { supportError, type Dnd5eRuntime } from './dnd5e-adapter.ts';
import { waitForTrackerPrivacyWrites } from './tracker-privacy.ts';
import { NativeCompletion } from './native-completion.ts';
import type { DeckCommand } from './types.ts';

type Source = Record<string, any>;
interface DocumentRef { uuid: string; documentName: string; parentUuid?: string; id: string }
interface DocumentState extends DocumentRef {
  source: Source;
  fullSource: Source;
  documentClass: any;
  dependents: string[];
  sequence: number;
  siblingOrder?: string[];
  baseActorUuid?: string;
}
interface FieldChange { path: string; before: unknown; after: unknown }
interface UpdateChange { ref: DocumentRef; fields: FieldChange[] }
interface LinkChange { uuid: string; before: string[]; after: string[] }
interface InheritanceGuard { baseUuid: string; path: string; id?: string; value: unknown }
interface UndoEntry {
  label: string;
  roots: DocumentRef[];
  created: DocumentState[];
  deleted: DocumentState[];
  updated: UpdateChange[];
  links: LinkChange[];
  time?: { before: number; after: number };
  clock?: Map<string, Source>;
  inheritance?: InheritanceGuard[];
  turnProgression?: boolean;
  combatHistory?: Map<string, unknown>;
  recoveryReadFailed?: boolean;
  unavailable?: boolean;
}
export interface UndoCapture {
  label: string;
  roots: DocumentRef[];
  before: Map<string, DocumentState>;
  worldTime?: number;
  turnProgression: boolean;
  combatHistory: Map<string, unknown>;
}

const ACTION_LABELS: Record<string, string> = {
  'actor.damage': 'OSD.Actions.Damage', 'actor.heal': 'OSD.Actions.Heal',
  'actor.temp-hp': 'OSD.Actions.TempHP', 'actor.set-hp': 'OSD.Actions.SetHP',
  'actor.set-temp-hp': 'OSD.Actions.SetTempHP', 'actor.set-max-modifier': 'OSD.Actions.SetMaxModifier',
  'actor.set-ac-modifier': 'OSD.Actions.SetACModifier', 'actor.toggle-inspiration': 'OSD.Actions.Inspiration',
  'actor.adjust-exhaustion': 'OSD.Actor.Exhaustion', 'actor.toggle-status': 'OSD.Actions.Status',
  'actor.set-status': 'OSD.Actions.Status', 'actor.toggle-concentration': 'OSD.Actions.ToggleConcentration',
  'actor.set-death-save': 'OSD.Actor.DeathSaves', 'combat.previous-turn': 'OSD.Actions.PreviousTurn',
  'combat.next-turn': 'OSD.Actions.NextTurn', 'combat.set-initiative': 'OSD.Actions.SetInitiative',
  'combat.swap-initiative': 'OSD.Actions.SwapInitiative', 'combat.roll-initiative': 'OSD.Actions.RollInitiative',
  'combat.roll-npc-initiative': 'OSD.Actions.RollNpcInitiative', 'combat.toggle-visibility': 'OSD.Actions.ToggleVisibility',
  'combat.toggle-defeated': 'OSD.Actions.ToggleDefeated',
};
const RESTORE_OPTIONS = { openSessionDeckUndo: true, turnEvents: false, keepId: true, keepEmbeddedIds: true, keepOrigin: true };
let captureSequence = 0;

/** A GM-page history of local differences; neither a world backup nor an Actor replacement. */
export class DeckUndoHistory {
  #entries: UndoEntry[] = [];

  constructor(private readonly runtime: Dnd5eRuntime, private readonly completion = new NativeCompletion(runtime)) {}

  get count(): number { return this.#entries.length; }
  get label(): string { return this.#entries.at(-1)?.label ?? ''; }
  get available(): boolean { return this.count > 0 && !this.#entries.at(-1)?.unavailable; }
  get unavailableReason(): string { return this.#entries.at(-1)?.unavailable ? this.runtime.localize('OSD.Undo.RecordingUnavailable') : ''; }
  get readinessReason(): string { return this.completion.canCapture([]) ? '' : this.runtime.localize(this.completion.triggerBoundaryMissing
    ? 'OSD.Undo.TriggerCompletionUnavailable' : 'OSD.Undo.DependencyUnavailable'); }

  initialize(): void { this.completion.initialize(); }

  async record<T>(commands: readonly DeckCommand[], operation: () => Promise<T>): Promise<T> {
    const capture = await this.begin(commands);
    if (!capture) return operation();
    const reliable = this.completion.canCapture(commands);
    let result: T | undefined;
    let failure: unknown;
    try {
      result = await this.completion.run(operation, (document, created) => {
        if (capture.before.has(document.uuid) || isNewDocument(document.uuid, created)) return;
        for (const node of captureDocuments([document]).values()) {
          if (!capture.before.has(node.uuid) && !isNewDocument(node.uuid, created)) capture.before.set(node.uuid, node);
        }
      });
    } catch (error) { failure = error; }
    try { await this.finish(capture, this.completion.lastCreated, reliable && !this.completion.lastJournalFailed, this.completion.lastObserved); }
    catch (error) {
      if (failure) throw new AggregateError([failure, error], this.runtime.localize('OSD.Undo.RecordFailed'));
      throw error;
    }
    if (failure) throw failure;
    return result as T;
  }

  async begin(commands: readonly DeckCommand[]): Promise<UndoCapture | undefined> {
    const mutations = commands.filter((command) => ACTION_LABELS[command.id]);
    if (mutations.length === 0) return undefined;
    this.#assertAllowed();
    await waitForTrackerPrivacyWrites();
    await this.completion.waitForIdle();
    const documents: any[] = [];
    for (const command of mutations) {
      if (command.targetUuid) documents.push(await this.runtime.resolveUuid(command.targetUuid));
      if (command.id.startsWith('combat.')) {
        const combat = command.combatUuid ? await this.runtime.resolveUuid(command.combatUuid) : this.runtime.game.combat;
        documents.push(combat);
        if (combat) for (const combatant of combat.combatants.contents) {
          if (combatant.actor) documents.push(combatant.actor);
          if (combatant.token) documents.push(combatant.token);
        }
      }
    }
    if (mutations.some((command) => command.id.startsWith('combat.'))) documents.push(...this.#clockDocuments());
    this.#assertAllowed();
    if (documents.some((document) => !document)) throw this.#error('OSD.Undo.TargetMissing');
    const before = captureDocuments(documents);
    const roots = rootDocuments(before);
    const first = mutations[0]!;
    const label = mutations.length > 1
      ? `${this.runtime.localize('OSD.Actions.Batch')} · ${mutations.length}`
      : `${this.runtime.localize(ACTION_LABELS[first.id]!)} · ${documents[0]?.name ?? ''}`;
    const turnProgression = mutations.some((command) => command.id === 'combat.next-turn' || command.id === 'combat.previous-turn');
    const combatHistory = new Map<string, unknown>();
    if (turnProgression) for (const document of documents.filter((document) => document.documentName === 'Combat')) {
      combatHistory.set(document.uuid, this.completion.captureCombatUndo(document));
    }
    return {
      label, roots, before, turnProgression, combatHistory,
      ...(mutations.some((command) => command.id.startsWith('combat.')) ? { worldTime: this.runtime.game.time.worldTime } : {}),
    };
  }

  async finish(capture: UndoCapture | undefined, observedCreated: ReadonlySet<string> = new Set(), reliable = true,
    observed?: ReadonlySet<string>): Promise<void> {
    if (!capture) return;
    await waitForTrackerPrivacyWrites();
    completeBeforeSources(capture.before);
    capture.roots = rootDocuments(capture.before);
    const roots = [...capture.roots];
    for (const uuid of observedCreated) {
      const document = await this.runtime.resolveUuid(uuid);
      if (document) roots.push(documentRef(document));
    }
    const after = await this.#captureRoots(roots);
    const additions = [...after.values()].filter((node) => !capture.before.has(node.uuid));
    const created = additions.filter((node) => isNewDocument(node.uuid, observedCreated) || isInheritedCreation(node, after, observedCreated));
    const unknown = additions.length !== created.length;
    const { deleted, updated, links } = difference(capture.before, after);
    const time = capture.worldTime !== undefined && capture.worldTime !== this.runtime.game.time.worldTime
      ? { before: capture.worldTime, after: this.runtime.game.time.worldTime } : undefined;
    if (observed && capture.turnProgression && updated.some((change) => change.ref.documentName === 'Combat'
      && change.fields.some((field) => field.path === 'round' || field.path === 'turn'))
      && !observed.has('CONFIG.Combat.documentClass.prototype._manageTurnEvents')) reliable = false;
    if (observed && time && !observed.has('foundry.documents.ActiveEffect.registry.refresh')) reliable = false;
    if (created.length || deleted.length || updated.length || links.length || time || !reliable || unknown) {
      this.#entries.push({ label: capture.label, roots: rootDocuments(new Map([...capture.before, ...after])), created, deleted, updated, links,
        inheritance: inheritanceGuards(capture.before, after, updated),
        turnProgression: capture.turnProgression,
        combatHistory: capture.combatHistory,
        ...(time ? { time, clock: this.#clockState() } : {}), ...(!reliable || unknown ? { unavailable: true } : {}) });
    }
  }

  async undo(): Promise<string | undefined> {
    this.#assertAllowed();
    const entry = this.#entries.at(-1);
    if (!entry) return undefined;
    if (entry.unavailable) throw this.#error('OSD.Undo.RecordingUnavailable');
    if (!this.completion.canCapture([])) throw this.#error('OSD.Undo.DependencyUnavailable');
    await waitForTrackerPrivacyWrites();
    await this.completion.waitForIdle();
    const current = await this.#captureRoots(entry.roots);
    await this.#validateInheritance(entry);
    this.#validate(entry, current);
    this.#assertAllowed();
    const desired = desiredState(entry, current);
    const desiredTime = entry.time?.before;
    const undoCreated = new Set(entry.created.map((node) => node.uuid));
    let remaining = entry;
    // Native lifecycle callbacks can change another tracked document during restoration.
    // One correction pass restores those differences; a failed native write is never silently retried.
    for (let pass = 0; pass < 2; pass += 1) {
      let failure: unknown;
      try {
        await this.completion.run(() => this.#restoreEntry(remaining), (document, created) => {
          for (const node of captureDocuments([document]).values()) {
            if (!desired.has(node.uuid) && !isNewDocument(node.uuid, undoCreated)
              && !isNewDocument(node.uuid, created)) desired.set(node.uuid, node);
          }
        });
      } catch (error) { failure = error; }
      try {
        for (const uuid of this.completion.lastCreated) undoCreated.add(uuid);
        completeBeforeSources(desired);
        const roots = rootDocuments(new Map([...current, ...desired]));
        for (const uuid of this.completion.lastCreated) {
          const document = await this.runtime.resolveUuid(uuid);
          if (document) roots.push(documentRef(document));
        }
        for (const root of roots) (await this.runtime.resolveUuid(root.uuid))?.reset();
        const actual = await this.#captureRoots(roots);
        // Unknown pre-existing dependencies are preserved, never reclassified as newly created.
        for (const node of actual.values()) if (!desired.has(node.uuid) && !current.has(node.uuid)
          && !isNewDocument(node.uuid, undoCreated)) desired.set(node.uuid, node);
        const changes = difference(desired, actual);
        remaining = { label: entry.label, roots: rootDocuments(new Map([...desired, ...actual])),
          inheritance: inheritanceGuards(desired, actual, changes.updated),
          turnProgression: entry.turnProgression, combatHistory: entry.combatHistory, ...changes,
          ...(desiredTime !== undefined && desiredTime !== this.runtime.game.time.worldTime
            ? { time: { before: desiredTime, after: this.runtime.game.time.worldTime }, clock: this.#clockState() } : {}),
          ...(this.completion.lastJournalFailed ? { unavailable: true } : {}) };
        this.#entries[this.#entries.length - 1] = remaining;
      } catch (readError) {
        this.#entries[this.#entries.length - 1]!.recoveryReadFailed = true;
        throw failure ? new AggregateError([failure, readError], this.runtime.localize('OSD.Undo.RestoreIncomplete')) : readError;
      }
      if (failure) throw failure;
      if (remaining.unavailable) throw this.#error('OSD.Undo.RestoreIncomplete');
      if (!hasChanges(remaining)) break;
      if (pass === 1) throw this.#error('OSD.Undo.RestoreIncomplete');
    }
    if (entry.turnProgression) for (const root of entry.roots.filter((root) => root.documentName === 'Combat')) {
      const combat = await this.runtime.resolveUuid(root.uuid);
      this.#assertAllowed();
      if (combat) await this.completion.reconcileCombatUndo(combat, entry.combatHistory?.get(root.uuid));
    }
    this.#entries.pop();
    return entry.label;
  }

  async #restoreEntry(entry: UndoEntry): Promise<void> {
    if (entry.time && this.runtime.game.time.worldTime !== entry.time.before) {
      await this.runtime.game.time.set(entry.time.before);
      await this.completion.flush();
    }
    await this.#removeCreated(entry.created);
    for (const change of entry.updated.filter((change) => change.ref.documentName === 'Combat')) {
      const combat = await this.runtime.resolveUuid(change.ref.uuid);
      this.#assertAllowed();
      const round = change.fields.filter((field) => (field.path === 'round' || field.path === 'turn')
        && !sameValue(atPath(cleanSource(combat.toObject()), field.path), field.before));
      if (round.length) await combat.update(inverseFields(round), RESTORE_OPTIONS);
    }
    await this.#restoreDeleted(entry.deleted);
    await this.completion.flush();
    for (const node of entry.deleted) {
      const document = await this.runtime.resolveUuid(node.uuid);
      this.#assertAllowed();
      if (!document) throw this.#error('OSD.Undo.TargetMissing');
      const current = captureDocuments([document]).get(node.uuid)!;
      const refinements = fieldChanges(node.source, current.source);
      if (refinements.length) await this.#updateRestoredFields(document, refinements);
    }
    await this.completion.flush();
    // Initiative can change sorting; restore Combat round/turn after its children.
    const rank = (name: string) => name === 'Combat' ? 2 : name === 'ActorDelta' ? 1 : 0;
    const updates = [...entry.updated].sort((a, b) => rank(a.ref.documentName) - rank(b.ref.documentName));
    for (const change of updates) {
      if (change.ref.documentName === 'Combat' || change.ref.documentName === 'ActorDelta') await this.completion.flush();
      const document = await this.runtime.resolveUuid(change.ref.uuid);
      this.#assertAllowed();
      if (!document) throw this.#error('OSD.Undo.TargetMissing');
      const source = cleanSource(document.toObject());
      const remaining = change.fields.filter((field) => !sameValue(atPath(source, field.path), field.before));
      if (!remaining.length) continue;
      await this.#updateRestoredFields(document, remaining);
    }
    await waitForTrackerPrivacyWrites();
  }

  async #updateRestoredFields(document: any, fields: FieldChange[]): Promise<void> {
    if (document.documentName !== 'ActorDelta') {
      await document.update(inverseFields(fields), restoreOptions(document));
      return;
    }
    // Token's ActorDeltaField applies sparse Delta data directly; ActorDelta.update
    // first validates it as a full Actor and can materialize NPC defaults on 14.368.
    const current = cleanSource(document.toObject());
    for (const field of fields) setPath(current, field.path, field.before);
    const ForcedReplacement = (globalThis as any).foundry.data.operators.ForcedReplacement;
    const replacement = Object.fromEntries(Object.entries(current).map(([key, value]) => [key,
      isObject(value) || Array.isArray(value) ? ForcedReplacement.create(value) : value]));
    await document.parent.update({ delta: replacement }, { ...RESTORE_OPTIONS, isUndo: true, diff: false });
  }

  async #captureRoots(roots: readonly DocumentRef[]): Promise<Map<string, DocumentState>> {
    const documents = await Promise.all(roots.map((root) => this.runtime.resolveUuid(root.uuid)));
    return captureDocuments(documents.filter(Boolean));
  }

  #validate(entry: UndoEntry, current: Map<string, DocumentState>): void {
    if (entry.recoveryReadFailed) throw this.#error('OSD.Undo.RestoreIncomplete');
    for (const change of entry.updated) {
      const node = current.get(change.ref.uuid);
      if (!node || change.fields.some((field) => !sameValue(atPath(node.source, field.path), field.after))) throw this.#error('OSD.Undo.Conflict');
    }
    for (const node of entry.deleted) {
      const actual = current.get(node.uuid);
      if (actual) throw this.#error('OSD.Undo.Conflict');
    }
    for (const node of entry.created) {
      const actual = current.get(node.uuid);
      if (!actual || !sameValue(actual.fullSource, node.fullSource)
        || actual.dependents.some((uuid) => !node.dependents.includes(uuid))) throw this.#error('OSD.Undo.Conflict');
      for (const child of current.values()) if (child.uuid.startsWith(node.uuid + '.')
        && !entry.created.some((created) => created.uuid === child.uuid)) throw this.#error('OSD.Undo.Conflict');
      // A newly attached dependency must never be swept away by native Effect deletion.
      for (const dependent of reachableDependencies(node, current)) {
        const expected = entry.created.find((created) => created.uuid === dependent.uuid);
        if (!expected || !sameValue(dependent.source, expected.source)) throw this.#error('OSD.Undo.Conflict');
      }
    }
    for (const link of entry.links) if (!sameValue(current.get(link.uuid)?.dependents, link.after)) throw this.#error('OSD.Undo.Conflict');
    if (entry.time && (this.runtime.game.time.worldTime !== entry.time.after
      || !sameValue(Object.fromEntries(entry.clock ?? []), Object.fromEntries(this.#clockState())))) throw this.#error('OSD.Undo.Conflict');
  }

  async #validateInheritance(entry: UndoEntry): Promise<void> {
    const sources = new Map<string, Source>();
    for (const guard of entry.inheritance ?? []) {
      if (!sources.has(guard.baseUuid)) {
        const actor = await this.runtime.resolveUuid(guard.baseUuid);
        if (!actor) throw this.#error('OSD.Undo.Conflict');
        sources.set(guard.baseUuid, cleanSource(actor.toObject()));
      }
      let value = atPath(sources.get(guard.baseUuid)!, guard.path);
      if (guard.id) value = (value as Source[]).find((node) => node._id === guard.id);
      if (!sameValue(value, guard.value)) throw this.#error('OSD.Undo.Conflict');
    }
  }

  async #removeCreated(created: readonly DocumentState[]): Promise<void> {
    for (const node of [...created].sort((a, b) => depth(a) - depth(b))) {
      const document = await this.runtime.resolveUuid(node.uuid);
      this.#assertAllowed();
      // A preceding parent/Effect delete may already have removed this child through native cascade.
      if (document) await document.delete(restoreOptions(document));
    }
  }

  async #restoreDeleted(deleted: readonly DocumentState[]): Promise<void> {
    const pending = [...deleted].sort((a, b) => depth(a) - depth(b));
    while (pending.length) {
      const first = pending.shift()!;
      if (await this.runtime.resolveUuid(first.uuid)) continue;
      const parent = first.parentUuid ? await this.runtime.resolveUuid(first.parentUuid) : undefined;
      this.#assertAllowed();
      if (first.parentUuid && !parent) throw this.#error('OSD.Undo.TargetMissing');
      // Batch same-parent Effects so native static-ID riders are present before collectRiders runs.
      const group = [first];
      for (let index = 0; index < pending.length;) {
        const node = pending[index]!;
        if (node.parentUuid === first.parentUuid && node.documentName === first.documentName) {
          if (!await this.runtime.resolveUuid(node.uuid)) group.push(node);
          pending.splice(index, 1);
        } else index += 1;
      }
      this.#assertAllowed();
      if (parent) await parent.createEmbeddedDocuments(first.documentName, group.map((node) => node.fullSource), { ...RESTORE_OPTIONS });
      else await first.documentClass.createDocuments(group.map((node) => node.fullSource), { ...RESTORE_OPTIONS });
    }
  }

  #clockDocuments(): any[] {
    const registry = (globalThis as any).foundry?.documents?.ActiveEffect?.registry;
    const effects: any[] = registry ? [...registry] : [];
    for (const actor of this.runtime.game.actors?.contents ?? []) {
      for (const effect of actor.allApplicableEffects()) if (effect.isExpiryTrackable) effects.push(effect);
    }
    return [...new Map(effects.map((effect) => [effect.uuid, effect])).values()];
  }

  #clockState(): Map<string, Source> { return new Map(this.#clockDocuments().map((effect) => [effect.uuid, cleanSource(effect.toObject())])); }

  #error(key: string): Error { return new Error(this.runtime.localize(key)); }
  #assertAllowed(): void {
    if (!this.runtime.game.user?.isGM) throw this.#error('OSD.Errors.GmOnly');
    const error = supportError(this.runtime);
    if (error) throw new Error(error);
  }
}

function captureDocuments(roots: readonly any[]): Map<string, DocumentState> {
  const nodes = new Map<string, DocumentState>();
  const queue = [...roots];
  while (queue.length) {
    const document = queue.shift();
    if (!document || nodes.has(document.uuid)) continue;
    if (document.persisted === false && !document.isToken && document.documentName !== 'ActorDelta') {
      const property = document.parent?.constructor.metadata.embedded?.[document.documentName];
      if (!property || !document.parent[property]?.has?.(document.id)) continue;
    }
    const fullSource = cleanSource(document.toObject());
    const source = structuredClone(fullSource);
    for (const [_name, property] of Object.entries(document.documentName === 'ActorDelta' ? {} : document.constructor.metadata.embedded ?? {}) as Array<[string, string]>) {
      delete source[property];
      const embedded = document[property];
      if (embedded?.contents) queue.push(...embedded.contents);
      else if (embedded?.documentName) queue.push(embedded);
    }
    const dependents = typeof document.getDependents === 'function' ? [...document.getDependents()] : [];
    for (const dependent of dependents) {
      const owner = typeof dependent.getEmbeddedCollection === 'function' ? dependent : dependent.item ?? dependent.parent;
      if (owner) queue.push(owner);
    }
    if (document.documentName === 'Actor' && typeof document.getDependentTokens === 'function') queue.push(...document.getDependentTokens({ concreteOnly: true }));
    const parentProperty = document.parent?.constructor.metadata.embedded?.[document.documentName];
    const siblings = parentProperty ? document.parent[parentProperty]?.contents : undefined;
    nodes.set(document.uuid, {
      uuid: document.uuid, documentName: document.documentName, parentUuid: document.parent?.uuid,
      id: document.id, source, fullSource, documentClass: document.constructor,
      dependents: dependents.map((dependent: any) => String(dependent.uuid)).sort(),
      sequence: ++captureSequence,
      ...(document.documentName === 'Actor' && document.parent?.baseActor ? { baseActorUuid: document.parent.baseActor.uuid } : {}),
      ...(siblings ? { siblingOrder: siblings.map((sibling: any) => String(sibling.id)) } : {}),
    });
  }
  return nodes;
}

function isNewDocument(uuid: string, created: ReadonlySet<string>): boolean {
  return [...created].some((parent) => uuid === parent || uuid.startsWith(parent + '.'));
}

function isInheritedCreation(node: DocumentState, after: Map<string, DocumentState>, created: ReadonlySet<string>): boolean {
  if (node.documentName !== 'ActiveEffect' || !node.parentUuid) return false;
  const actor = after.get(node.parentUuid);
  if (actor?.documentName !== 'Actor' || !actor.baseActorUuid) return false;
  const baseEffect = after.get(`${actor.baseActorUuid}.ActiveEffect.${node.id}`);
  if (!baseEffect || !isNewDocument(baseEffect.uuid, created) || !sameValue(node.fullSource, baseEffect.fullSource)) return false;
  const delta = [...after.values()].find((entry) => entry.documentName === 'ActorDelta' && entry.parentUuid === actor.parentUuid);
  // An inherited view has no persisted Token effect. Do not claim an unjournalled local copy as ours.
  return Boolean(delta && !(delta.source.effects as Source[] | undefined)?.some((effect) => effect._id === node.id));
}

function difference(desired: Map<string, DocumentState>, actual: Map<string, DocumentState>) {
  const created = [...actual.values()].filter((node) => !desired.has(node.uuid));
  const deleted = [...desired.values()].filter((node) => !actual.has(node.uuid));
  const updated: UpdateChange[] = [], links: LinkChange[] = [];
  for (const [uuid, before] of desired) {
    const after = actual.get(uuid);
    if (!after) continue;
    const fields = fieldChanges(before.source, after.source);
    if (fields.length) updated.push({ ref: documentRef(before), fields });
    if (!sameValue(before.dependents, after.dependents)) links.push({ uuid, before: before.dependents, after: after.dependents });
  }
  return { created, deleted, updated, links };
}

function hasChanges(entry: UndoEntry): boolean {
  return Boolean(entry.created.length || entry.deleted.length || entry.updated.length || entry.links.length || entry.time);
}

function inheritanceGuards(before: Map<string, DocumentState>, after: Map<string, DocumentState>, updated: UpdateChange[]): InheritanceGuard[] {
  const guards: InheritanceGuard[] = [];
  for (const change of updated.filter((change) => change.ref.documentName === 'ActorDelta')) {
    const actor = [...before.values()].find((node) => node.documentName === 'Actor' && node.parentUuid === change.ref.parentUuid && node.baseActorUuid);
    if (!actor?.baseActorUuid) continue;
    // A shared base can be changed by this very batch (or already restored by a partial undo).
    const inherited = after.get(actor.baseActorUuid)?.fullSource ?? actor.fullSource;
    for (const field of change.fields) {
      if (field.path === 'items' || field.path === 'effects') {
        const previousIds = new Set((field.before as Source[]).map((node) => node._id));
        for (const node of field.after as Source[]) {
          if (previousIds.has(node._id)) continue;
          const original = actor.fullSource[field.path].find((item: Source) => item._id === node._id);
          if (original) guards.push({ baseUuid: actor.baseActorUuid, path: field.path, id: node._id,
            value: inherited[field.path].find((item: Source) => item._id === node._id) });
        }
      } else if (field.before === undefined) guards.push({ baseUuid: actor.baseActorUuid, path: field.path, value: atPath(inherited, field.path) });
    }
  }
  return guards;
}

function desiredState(entry: UndoEntry, current: Map<string, DocumentState>): Map<string, DocumentState> {
  const desired = new Map([...current].map(([uuid, node]) => [uuid,
    { ...node, source: structuredClone(node.source), fullSource: structuredClone(node.fullSource), dependents: [...node.dependents] }]));
  for (const node of entry.created) desired.delete(node.uuid);
  for (const node of entry.deleted) desired.set(node.uuid, { ...node, source: structuredClone(node.source), fullSource: structuredClone(node.fullSource) });
  for (const change of entry.updated) for (const field of change.fields) setPath(desired.get(change.ref.uuid)!.source, field.path, field.before);
  for (const link of entry.links) desired.get(link.uuid)!.dependents = [...link.before];
  return desired;
}

/** First-write snapshots can be taken at different times; compose parents from each child's original source. */
function completeBeforeSources(nodes: Map<string, DocumentState>): void {
  const rebuilt = new Map<string, Source>();
  const build = (node: DocumentState): Source => {
    if (rebuilt.has(node.uuid)) return rebuilt.get(node.uuid)!;
    const source = structuredClone(node.source);
    rebuilt.set(node.uuid, source);
    if (node.documentName === 'ActorDelta') return source;
    for (const [name, property] of Object.entries(node.documentClass.metadata.embedded ?? {}) as Array<[string, string]>) {
      if (name === 'ActorDelta') {
        const delta = [...nodes.values()].find((child) => child.parentUuid === node.uuid && child.documentName === name);
        if (delta) source[property] = build(delta);
        else if (node.fullSource[property] !== undefined) source[property] = structuredClone(node.fullSource[property]);
        continue;
      }
      if (!Array.isArray(node.fullSource[property])) {
        if (node.fullSource[property] !== undefined) source[property] = structuredClone(node.fullSource[property]);
        continue;
      }
      const children = [...nodes.values()].filter((child) => child.parentUuid === node.uuid && child.documentName === name);
      const orders = [{ sequence: node.sequence, ids: node.fullSource[property].map((child: any) => String(child._id)) },
        ...children.filter((child) => child.siblingOrder).map((child) => ({ sequence: child.sequence, ids: child.siblingOrder! }))];
      const order = orders.sort((first, second) => first.sequence - second.sequence)[0]!.ids;
      source[property] = children.sort((first, second) => order.indexOf(first.id) - order.indexOf(second.id)).map(build);
    }
    return source;
  };
  for (const node of nodes.values()) node.fullSource = build(node);
}

function cleanSource(value: any): any {
  if (Array.isArray(value)) return value.map(cleanSource);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '_stats').map(([key, child]) => [key, cleanSource(child)]));
}

function rootDocuments(nodes: Map<string, DocumentState>): DocumentRef[] {
  return [...nodes.values()].filter((node) => !node.parentUuid || !nodes.has(node.parentUuid)
    || (node.documentName === 'Actor' && nodes.get(node.parentUuid)?.documentName === 'Token')).map(documentRef);
}

function documentRef(node: DocumentRef): DocumentRef { return { uuid: node.uuid, documentName: node.documentName, parentUuid: node.parentUuid, id: node.id }; }
function restoreOptions(document: any): Source {
  return { ...RESTORE_OPTIONS,
    ...(document.documentName === 'Token' ? { isUndo: true } : {}),
    ...(document.documentName === 'ActiveEffect' && document.flags?.['fvtt-custom-conditions']?.injuryProjection === true
      ? { 'fvtt-custom-conditions': { injuryProjection: true } } : {}),
    // dnd5e levelled conditions require the same context as native increase/decrease.
    ...(document.documentName === 'ActiveEffect' && document.system?.hasLevels
      ? { dnd5e: { originalLevel: document.system.level } } : {}),
  };
}
function depth(node: DocumentRef): number { return node.uuid.split('.').length; }
function isObject(value: unknown): value is Source { return value !== null && typeof value === 'object' && !Array.isArray(value); }

function sameValue(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true;
  if (Array.isArray(first) && Array.isArray(second)) return first.length === second.length && first.every((value, index) => sameValue(value, second[index]));
  if (!isObject(first) || !isObject(second)) return false;
  return Object.keys(first).length === Object.keys(second).length && Object.keys(first).every((key) => Object.hasOwn(second, key) && sameValue(first[key], second[key]));
}

function fieldChanges(before: Source, after: Source, prefix = ''): FieldChange[] {
  // UUID-keyed flag maps contain literal dots; Foundry dotted update paths cannot address those keys.
  if (prefix && [...Object.keys(before), ...Object.keys(after)].some((key) => key.includes('.'))) {
    return sameValue(before, after) ? [] : [{ path: prefix, before, after }];
  }
  const result: FieldChange[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (sameValue(before[key], after[key])) continue;
    if (isObject(before[key]) && isObject(after[key])) result.push(...fieldChanges(before[key], after[key], path));
    else result.push({ path, before: before[key], after: after[key] });
  }
  return result;
}

function atPath(source: Source, path: string): unknown { return path.split('.').reduce((value, key) => value?.[key], source); }

function inverseFields(fields: readonly FieldChange[]): Source {
  const { ForcedDeletion, ForcedReplacement } = (globalThis as any).foundry.data.operators;
  return Object.fromEntries(fields.map((field) => [field.path, field.before === undefined ? new ForcedDeletion()
    : isObject(field.before) || Array.isArray(field.before) ? ForcedReplacement.create(structuredClone(field.before)) : structuredClone(field.before)]));
}

function setPath(source: Source, path: string, value: unknown): void {
  const parts = path.split('.');
  let target = source;
  for (const key of parts.slice(0, -1)) {
    if (!Object.hasOwn(target, key)) Object.defineProperty(target, key, { value: {}, writable: true, enumerable: true, configurable: true });
    target = target[key];
  }
  const key = parts.at(-1)!;
  if (value === undefined) delete target[key];
  else Object.defineProperty(target, key, { value: structuredClone(value), writable: true, enumerable: true, configurable: true });
}

function reachableDependencies(node: DocumentState, nodes: Map<string, DocumentState>): DocumentState[] {
  const result = new Map<string, DocumentState>();
  const queue = [...node.dependents];
  while (queue.length) {
    const uuid = queue.shift()!;
    if (result.has(uuid)) continue;
    const dependent = nodes.get(uuid);
    if (!dependent) continue;
    result.set(uuid, dependent);
    queue.push(...dependent.dependents);
    if (dependent.documentName === 'Item') for (const child of nodes.values()) if (child.parentUuid === dependent.uuid) queue.push(...child.dependents);
  }
  return [...result.values()];
}

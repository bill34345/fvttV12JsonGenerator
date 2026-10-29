import { afterEach, describe, expect, test } from 'bun:test';
import { DeckUndoHistory } from '../src/undo.ts';
import type { Dnd5eRuntime } from '../src/dnd5e-adapter.ts';
import type { DeckCommand } from '../src/types.ts';

const oldFoundry = (globalThis as any).foundry;
const oldLibWrapper = (globalThis as any).libWrapper;
const oldHooks = (globalThis as any).Hooks;
afterEach(() => { (globalThis as any).foundry = oldFoundry; (globalThis as any).libWrapper = oldLibWrapper; (globalThis as any).Hooks=oldHooks; });

class ForcedDeletion {}
class ForcedReplacement { constructor(readonly value: any) {} static create(value:any){return new ForcedReplacement(value);} }

/** In-memory Document persistence; operation semantics are exercised by the real history implementation. */
function worldFixture() {
  const documents = new Map<string, MemoryDocument>();
  const calls: Array<{ operation: string; uuid: string; data?: any; options: any }> = [];
  const wrappers = new Map<string, (...args: any[]) => any>();
  const listeners=new Map<string,Map<number,(...args:any[])=>void>>();
  let hookId=0;
  (globalThis as any).Hooks={
    on(event:string,callback:(...args:any[])=>void){const callbacks=listeners.get(event)??new Map();listeners.set(event,callbacks);callbacks.set(++hookId,callback);return hookId;},
    off(event:string,id:number){listeners.get(event)?.delete(id);},
  };
  const types: Record<string, typeof MemoryDocument> = {};
  const embeddings: Record<string, Record<string, string>> = {
    Actor: { Item: 'items', ActiveEffect: 'effects' }, Item: { ActiveEffect: 'effects' },
    ActiveEffect: {}, Combat: { Combatant: 'combatants', CombatantGroup: 'groups' },
    Combatant: {}, CombatantGroup: {}, Token: { ActorDelta: 'delta' }, ActorDelta: { Item:'items',ActiveEffect:'effects' }, ChatMessage: {},
  };
  class MemoryDocument {
    static metadata = { name: '', embedded: {} as Record<string, string> };
    source: Record<string, any>;
    constructor(source: Record<string, any>, readonly parent?: MemoryDocument) {
      this.source = structuredClone(source);
      documents.set(this.uuid, this);
      for (const [name, property] of Object.entries((this.constructor as typeof MemoryDocument).metadata.embedded)) {
        const children = this.source[property];
        delete this.source[property];
        Object.defineProperty(this, property, { get: () => this.getEmbeddedCollection(name) });
        if (Array.isArray(children)) for (const child of children) make(name, child, this);
      }
    }
    get documentName() { return (this.constructor as typeof MemoryDocument).metadata.name; }
    get id(): string { return this.source._id; }
    get uuid(): string { return `${this.parent ? this.parent.uuid + '.' : ''}${this.documentName}.${this.id}`; }
    get name(): string { return this.source.name ?? this.id; }
    get flags():Record<string,any>{return this.source.flags??{};}
    get actor(): MemoryDocument | undefined { return documents.get(this.source.actorUuid); }
    get token(): MemoryDocument | undefined { return documents.get(this.source.tokenUuid); }
    getEmbeddedCollection(name: string) { return { contents: [...documents.values()].filter((document) => document.parent === this && document.documentName === name) }; }
    toObject(): Record<string, any> {
      const result = structuredClone(this.source);
      for (const [name, property] of Object.entries((this.constructor as typeof MemoryDocument).metadata.embedded)) result[property] = this.getEmbeddedCollection(name).contents.map((child) => child.toObject());
      return result;
    }
    getDependents(): Set<any> {
      if (this.documentName !== 'ActiveEffect') return new Set();
      const result = new Set<any>([...documents.values()].filter((document) => document.source.flags?.dnd5e?.dependentOn === this.uuid));
      for (const item of documents.values()) if (item.documentName === 'Item') {
        for (const [id, source] of Object.entries(item.source.system?.activities ?? {}) as Array<[string, any]>) {
          if (source.flags?.dnd5e?.dependentOn === this.uuid) result.add({ item, id, uuid: `${item.uuid}.Activity.${id}` });
        }
      }
      return result;
    }
    async update(data: Record<string, any>, options: any = {}) {
      calls.push({ operation: 'update', uuid: this.uuid, data, options });
      for (const [path, value] of Object.entries(data)) {
        if(this.documentName==='Token'&&path==='delta'){
          const delta=this.getEmbeddedCollection('ActorDelta').contents[0];
          if(delta)await delta.update(value,options);
          continue;
        }
        const parts = path.split('.');
        let target = this.source;
        for (const key of parts.slice(0, -1)) target = target[key] ??= {};
        const key = parts.at(-1)!;
        if (value instanceof ForcedDeletion) delete target[key];
        else target[key] = structuredClone(value instanceof ForcedReplacement ? value.value : value);
      }
      if (this.documentName === 'Combat' && options.turnEvents !== false && ('round' in data || 'turn' in data)) {
        wrappers.get('CONFIG.Combat.documentClass.prototype._manageTurnEvents')?.(() => Promise.resolve());
      }
      return this;
    }
    async delete(options: any = {}) {
      calls.push({ operation: 'delete', uuid: this.uuid, options });
      for (const dependent of this.getDependents()) {
        if (dependent instanceof MemoryDocument) await dependent.delete(options);
        else await dependent.item.update({ [`system.activities.${dependent.id}`]: new ForcedDeletion() }, options);
      }
      for (const child of [...documents.values()].filter((document) => document.parent === this)) await child.delete(options);
      documents.delete(this.uuid);
    }
    async createEmbeddedDocuments(name: string, data: any[], options: any) {
      calls.push({ operation: 'create', uuid: this.uuid, data, options });
      return data.map((source) => make(name, source, this));
    }
    static async createDocuments(data: any[], options: any) {
      calls.push({ operation: 'create-root', uuid: this.metadata.name, data, options });
      return data.map((source) => make(this.metadata.name, source));
    }
    reset() {}
  }
  for (const [name, embedded] of Object.entries(embeddings)) {
    types[name] = class extends MemoryDocument { static override metadata = { name, embedded }; };
  }
  function make(name: string, data: any, parent?: MemoryDocument,userId='gm'): MemoryDocument {
    const document=new types[name]!(data,parent);
    for(const callback of listeners.get(`create${name}`)?.values()??[]) callback(document,{},userId);
    return document;
  }
  const game: any = { version: '14.368', system: { id: 'dnd5e', version: '6.0.6' }, user: { id: 'gm', isGM: true }, modules: new Map([['lib-wrapper', { active: true }]]), combat: null, time: { worldTime: 100, set: async (value: number) => { game.time.worldTime = value; wrappers.get('foundry.documents.ActiveEffect.registry.refresh')?.(() => Promise.resolve()); } } };
  game.users = { activeGM: game.user };
  (globalThis as any).libWrapper = { register: (_id: string, path: string, callback: (...args: any[]) => any) => { wrappers.set(path, callback); return wrappers.size; }, unregister: () => {} };
  const runtime: Dnd5eRuntime = { game, config: {}, canvas: {}, resolveUuid: async (uuid) => documents.get(uuid), localize: (key) => key };
  (globalThis as any).foundry = { data: { operators: { ForcedDeletion, ForcedReplacement } } };
  const actor = (id: string, hp = 20) => make('Actor', { _id: id, name: id, system: { attributes: { hp: { value: hp, temp: 3 }, death: { success: 0, failure: 0 } } }, flags: {}, effects: [], items: [] });
  return { actor, calls, documents, game, make, runtime, history: new DeckUndoHistory(runtime) };
}

function command(id: DeckCommand['id'], targetUuid: string): DeckCommand { return { id, targetUuid }; }

function sharedBaseFixture() {
  const f = worldFixture(), base = f.actor('base'), token = f.make('Token', { _id: 'token' });
  Object.defineProperty(token, 'baseActor', { value: base });
  (base as any).getDependentTokens = () => [token];
  const delta = f.make('ActorDelta', { _id: 'token', system: {}, effects: [], items: [] }, token);
  const synthetic = f.make('Actor', { _id: 'synthetic', system: { attributes: { hp: { value: 20, temp: 3 } } }, effects: [], items: [] }, token);
  const toObject = synthetic.toObject.bind(synthetic), update = synthetic.update.bind(synthetic);
  synthetic.toObject = () => {
    const source = toObject();
    source.system.attributes.hp.value = delta.source.system?.attributes?.hp?.value ?? base.source.system.attributes.hp.value;
    return source;
  };
  synthetic.update = async (data, options) => {
    const result = await update(data, options);
    if ('system.attributes.hp.value' in data) await delta.update({ 'system.attributes.hp.value': data['system.attributes.hp.value'] }, options);
    return result;
  };
  return { f, base, token, delta, synthetic };
}

describe('Deck undo history', () => {
  test('restores only changed numerical fields and preserves unrelated later edits', async () => {
    const f = worldFixture(), actor = f.actor('one');
    await f.history.record([command('actor.damage', actor.uuid)], () => actor.update({ 'system.attributes.hp.value': 12, 'system.attributes.hp.temp': 0 }));
    await actor.update({ name: 'Renamed later', 'flags.otherModule.note': 'Keep me' });
    expect(f.history.count).toBe(1);
    await f.history.undo();
    expect(actor.source.system.attributes.hp).toEqual({ value: 20, temp: 3 });
    expect(actor.name).toBe('Renamed later');
    expect(actor.source.flags.otherModule.note).toBe('Keep me');
    expect(f.history.count).toBe(0);
  });

  test('uses one history entry for a batch and supports repeated last-in-first-out undo', async () => {
    const f = worldFixture(), first = f.actor('first'), second = f.actor('second');
    await f.history.record([command('actor.set-temp-hp', first.uuid)], () => first.update({ 'system.attributes.hp.temp': 8 }));
    await f.history.record([command('actor.damage', first.uuid), command('actor.damage', second.uuid)], async () => {
      await first.update({ 'system.attributes.hp.value': 15 });
      await second.update({ 'system.attributes.hp.value': 15 });
    });
    expect(f.history.count).toBe(2);
    await f.history.undo();
    expect([first.source.system.attributes.hp.value, second.source.system.attributes.hp.value]).toEqual([20, 20]);
    expect(first.source.system.attributes.hp.temp).toBe(8);
    await f.history.undo();
    expect(first.source.system.attributes.hp.temp).toBe(3);
    expect(f.history.count).toBe(0);
  });

  test('does not record view operations or no-ops and retains changes from a partially failed batch', async () => {
    const f = worldFixture(), actor = f.actor('one');
    await f.history.record([command('actor.open-sheet', actor.uuid)], async () => {});
    await f.history.record([command('actor.set-hp', actor.uuid)], () => actor.update({ 'system.attributes.hp.value': 20 }));
    expect(f.history.count).toBe(0);
    await expect(f.history.record([command('actor.damage', actor.uuid)], async () => {
      await actor.update({ 'system.attributes.hp.value': 7 });
      throw new Error('Second target failed');
    })).rejects.toThrow('Second target failed');
    expect(f.history.count).toBe(1);
    await f.history.undo();
    expect(actor.source.system.attributes.hp.value).toBe(20);
  });

  test('rejects a conflicting later edit without overwriting it or consuming history', async () => {
    const f = worldFixture(), actor = f.actor('one');
    await f.history.record([command('actor.set-hp', actor.uuid)], () => actor.update({ 'system.attributes.hp.value': 10 }));
    await actor.update({ 'system.attributes.hp.value': 13 });
    const beforeCalls = f.calls.length;
    await expect(f.history.undo()).rejects.toThrow('OSD.Undo.Conflict');
    expect(f.calls.length).toBe(beforeCalls);
    expect(actor.source.system.attributes.hp.value).toBe(13);
    expect(f.history.count).toBe(1);
  });

  test('continues a partially completed undo without reapplying already restored fields', async () => {
    const f = worldFixture(), first = f.actor('first'), second = f.actor('second');
    await f.history.record([command('actor.damage', first.uuid), command('actor.damage', second.uuid)], async () => {
      await first.update({ 'system.attributes.hp.value': 10 });
      await second.update({ 'system.attributes.hp.value': 10 });
    });
    const update = second.update.bind(second);
    let fail = true;
    second.update = async (data, options) => { if (fail) { fail = false; throw new Error('One native update failed'); } return update(data, options); };
    await expect(f.history.undo()).rejects.toThrow('One native update failed');
    expect(first.source.system.attributes.hp.value).toBe(20);
    expect(second.source.system.attributes.hp.value).toBe(10);
    const firstWrites = f.calls.filter((call) => call.operation === 'update' && call.uuid === first.uuid).length;
    await f.history.undo();
    expect(second.source.system.attributes.hp.value).toBe(20);
    expect(f.calls.filter((call) => call.operation === 'update' && call.uuid === first.uuid).length).toBe(firstWrites);
    expect(f.history.count).toBe(0);
  });

  test('can continue after world time was restored but a later native document update failed', async () => {
    const f = worldFixture(), combat = f.make('Combat', { _id: 'battle', round: 1, turn: 0 });
    await f.history.record([{ id: 'combat.next-turn', combatUuid: combat.uuid }], async () => {
      await combat.update({ turn: 1 });
      await f.game.time.set(106);
    });
    const update = combat.update.bind(combat);
    let fail = true;
    combat.update = async (data, options) => { if (fail) { fail = false; throw new Error('Combat update failed once'); } return update(data, options); };
    await expect(f.history.undo()).rejects.toThrow('Combat update failed once');
    expect(f.game.time.worldTime).toBe(100);
    expect(combat.source.turn).toBe(1);
    await f.history.undo();
    expect(combat.source.turn).toBe(0);
    expect(f.history.count).toBe(0);
  });

  test('restores deleted concentration, cross-actor effects, item activities and dependency identity', async () => {
    const f = worldFixture(), caster = f.actor('caster'), target = f.actor('target');
    const concentration = f.make('ActiveEffect', { _id: 'concentration', origin: 'Actor.caster.Item.spell', statuses: ['concentrating'], duration: { startTime: 12, seconds: 600 } }, caster);
    const effect = f.make('ActiveEffect', { _id: 'target-effect', origin: concentration.uuid, flags: { dnd5e: { dependentOn: concentration.uuid } } }, target);
    const item = f.make('Item', { _id: 'item', flags: {}, system: { activities: { rider: { _id: 'rider', sort: 321, flags: { dnd5e: { dependentOn: effect.uuid } } } } } }, target);
    const before = { caster: caster.toObject(), target: target.toObject() };
    await f.history.record([command('actor.toggle-concentration', caster.uuid)], () => concentration.delete());
    expect(f.documents.has(effect.uuid)).toBeFalse();
    expect(item.source.system.activities.rider).toBeUndefined();
    await f.history.undo();
    expect(caster.toObject()).toEqual(before.caster);
    expect(target.toObject()).toEqual(before.target);
    const restoredRoot = f.documents.get(concentration.uuid)!;
    await restoredRoot.delete();
    expect(f.documents.has(effect.uuid)).toBeFalse();
    expect(item.source.system.activities.rider).toBeUndefined();
  });

  test('batches same-parent Effect restoration with stable IDs and preserved origin', async () => {
    const f = worldFixture(), actor = f.actor('one');
    const first = f.make('ActiveEffect', { _id: 'root', origin: 'Item.source' }, actor);
    const second = f.make('ActiveEffect', { _id: 'static-rider', flags: { dnd5e: { dependentOn: first.uuid } } }, actor);
    await f.history.record([command('actor.set-status', actor.uuid)], () => first.delete());
    await f.history.undo();
    const create = f.calls.find((call) => call.operation === 'create')!;
    expect(create.data.map((source: any) => source._id).sort()).toEqual(['root', 'static-rider']);
    expect(create.options).toMatchObject({ keepId: true, keepEmbeddedIds: true, keepOrigin: true });
    expect(f.documents.get(second.uuid)?.source.flags.dnd5e.dependentOn).toBe(first.uuid);
  });

  test('undoes a newly created status but refuses to delete a later attached dependency', async () => {
    const f = worldFixture(), actor = f.actor('one');
    let effect: any;
    await f.history.record([command('actor.set-status', actor.uuid)], async () => { effect = f.make('ActiveEffect', { _id: 'status', statuses: ['poisoned'] }, actor); });
    await f.history.undo();
    expect(f.documents.has(effect.uuid)).toBeFalse();
    await f.history.record([command('actor.set-status', actor.uuid)], async () => { effect = f.make('ActiveEffect', { _id: 'status', statuses: ['poisoned'] }, actor); });
    const item = f.make('Item', { _id: 'later', flags: { dnd5e: { dependentOn: effect.uuid } } }, actor);
    await expect(f.history.undo()).rejects.toThrow('OSD.Undo.Conflict');
    expect(f.documents.has(item.uuid)).toBeTrue();
    expect(f.documents.has(effect.uuid)).toBeTrue();
  });

  test('records defeat as one combat operation and restores both its flag and new actor overlay', async () => {
    const f = worldFixture(), actor = f.actor('one');
    const combat = f.make('Combat', { _id: 'battle', round: 1, turn: 0 });
    const combatant = f.make('Combatant', { _id: 'turn', actorUuid: actor.uuid, defeated: false }, combat);
    f.game.combat = combat;
    await f.history.record([{ id: 'combat.toggle-defeated', combatUuid: combat.uuid, combatantId: combatant.id }], async () => {
      await combatant.update({ defeated: true });
      f.make('ActiveEffect', { _id: 'defeated', statuses: ['dead'], flags: { core: { overlay: true } } }, actor);
    });
    expect(f.history.count).toBe(1);
    await f.history.undo();
    expect(combatant.source.defeated).toBeFalse();
    expect(actor.getEmbeddedCollection('ActiveEffect').contents).toHaveLength(0);
  });

  test('restores combat, group initiative, participant resources, expired effects, movement and time; keeps chat history', async () => {
    const f = worldFixture(), actor = f.actor('one');
    await actor.update({ 'system.resources.legact.spent': 2 });
    const item = f.make('Item', { _id: 'resource', system: { uses: { spent: 3 } } }, actor);
    const effect = f.make('ActiveEffect', { _id: 'expires', duration: { rounds: 1 } }, actor);
    const token = f.make('Token', { _id: 'token', _movementHistory: [{ x: 1, y: 2 }] });
    const combat = f.make('Combat', { _id: 'battle', round: 1, turn: 0 });
    const combatant = f.make('Combatant', { _id: 'turn', actorUuid: actor.uuid, tokenUuid: token.uuid, initiative: null, hidden: false, flags: {} }, combat);
    const group = f.make('CombatantGroup', { _id: 'group', initiative: null }, combat);
    f.game.combat = combat;
    await f.history.record([{ id: 'combat.roll-npc-initiative', combatUuid: combat.uuid }], async () => {
      await combat.update({ round: 2, turn: 1 });
      await combatant.update({ initiative: 22.16, hidden: true, 'flags.open-session-deck.revealed': false });
      await group.update({ initiative: 22.16 });
      await actor.update({ 'system.resources.legact.spent': 0 });
      await item.update({ 'system.uses.spent': 0 });
      await token.update({ _movementHistory: [] });
      await effect.delete();
      f.make('ChatMessage', { _id: 'roll', content: 'An actual roll occurred' });
      await f.game.time.set(106);
    });
    await f.history.undo();
    expect(combat.source).toMatchObject({ round: 1, turn: 0 });
    expect(combatant.source).toMatchObject({ initiative: null, hidden: false, flags: {} });
    expect(group.source.initiative).toBeNull();
    expect(actor.source.system.resources.legact.spent).toBe(2);
    expect(item.source.system.uses.spent).toBe(3);
    expect(f.documents.has(effect.uuid)).toBeTrue();
    expect(token.source._movementHistory).toEqual([{ x: 1, y: 2 }]);
    expect(f.game.time.worldTime).toBe(100);
    expect(f.documents.has('ChatMessage.roll')).toBeTrue();
    expect(f.calls.filter((call) => call.operation === 'update' && call.uuid === combat.uuid).at(-1)?.options.turnEvents).toBeFalse();
    expect(f.calls.filter((call) => call.operation === 'update' && call.uuid === token.uuid).at(-1)?.options.isUndo).toBeTrue();
  });

  test('keeps a synthetic Actor as a capture root when its Token is also tracked', async () => {
    const f = worldFixture(), token = f.make('Token', { _id: 'token' });
    const actor = f.make('Actor', { _id: 'synthetic', system: { attributes: { hp: { value: 12 } } } }, token);
    const combat = f.make('Combat', { _id: 'battle', round: 1, turn: 0 });
    f.make('Combatant', { _id: 'turn', actorUuid: actor.uuid, tokenUuid: token.uuid }, combat);
    await f.history.record([{ id: 'combat.next-turn', combatUuid: combat.uuid }], async () => {
      await actor.update({ 'system.attributes.hp.value': 8 });
      await combat.update({ turn: 1 });
    });
    await f.history.undo();
    expect(actor.source.system.attributes.hp.value).toBe(12);
    expect(combat.source.turn).toBe(0);
  });

  test('records initiative sorting that preserves the active combatant without firing turn lifecycle', async () => {
    const f=worldFixture(),combat=f.make('Combat',{_id:'battle',round:1,turn:0});
    const first=f.make('Combatant',{_id:'first',initiative:20.25},combat),second=f.make('Combatant',{_id:'second',initiative:15.19},combat);
    await f.history.record([{id:'combat.swap-initiative',combatUuid:combat.uuid}],async()=>{
      await first.update({initiative:15.19});await second.update({initiative:20.25});combat.source.turn=1;
    });
    expect(f.history.available).toBeTrue();await f.history.undo();
    expect(combat.source.turn).toBe(0);expect(first.source.initiative).toBe(20.25);expect(second.source.initiative).toBe(15.19);
  });

  test('restores synthetic Actor resource inheritance instead of leaving a redundant delta override', async () => {
    const f=worldFixture(),token=f.make('Token',{_id:'token'});
    const delta=f.make('ActorDelta',{_id:'token',system:{},items:[{_id:'existing-item',name:'Existing override'}]},token);
    const actor=f.make('Actor',{_id:'synthetic',system:{resources:{legact:{spent:2}}}},token);
    const update=actor.update.bind(actor);
    actor.update=async (data,options)=>{
      const result=await update(data,options);
      if ('system.resources.legact.spent' in data) await delta.update({'system.resources.legact.spent':data['system.resources.legact.spent']},options);
      return result;
    };
    const combat=f.make('Combat',{_id:'battle',round:1,turn:0});
    f.make('Combatant',{_id:'turn',actorUuid:actor.uuid,tokenUuid:token.uuid},combat);
    const before=delta.toObject();
    await f.history.record([{id:'combat.next-turn',combatUuid:combat.uuid}],async()=>{
      await actor.update({'system.resources.legact.spent':0});await combat.update({turn:1});
    });
    await delta.update({'flags.otherModule.keep':true});before.flags={otherModule:{keep:true}};
    await f.history.undo();
    expect(actor.source.system.resources.legact.spent).toBe(2);
    expect(delta.toObject()).toEqual(before);
    expect(f.calls.filter(call=>call.uuid===delta.uuid).at(-1)?.options).toMatchObject({diff:false});
    expect(f.history.count).toBe(0);
  });

  test('rejects a base Actor change hidden by a synthetic delta before any undo write', async () => {
    const f=worldFixture(),base=f.make('Actor',{_id:'base',system:{resources:{legact:{spent:2}}}}),token=f.make('Token',{_id:'token'});
    Object.defineProperty(token,'baseActor',{value:base});
    const delta=f.make('ActorDelta',{_id:'token',system:{}},token);
    const actor=f.make('Actor',{_id:'synthetic',system:{resources:{legact:{spent:2}}}},token);
    const combat=f.make('Combat',{_id:'battle',round:1,turn:0});
    f.make('Combatant',{_id:'turn',actorUuid:actor.uuid,tokenUuid:token.uuid},combat);
    await f.history.record([{id:'combat.next-turn',combatUuid:combat.uuid}],async()=>{
      await actor.update({'system.resources.legact.spent':0});await delta.update({'system.resources.legact.spent':0});await combat.update({turn:1});
    });
    await base.update({'system.resources.legact.spent':4});
    const writes=f.calls.length;
    await expect(f.history.undo()).rejects.toThrow('OSD.Undo.Conflict');
    expect(f.calls.length).toBe(writes);expect(actor.source.system.resources.legact.spent).toBe(0);expect(f.history.count).toBe(1);
  });

  test('undoes a batch that changed both a shared base Actor and its previously inherited Token HP', async () => {
    const { f, base, delta, synthetic } = sharedBaseFixture();
    const beforeDelta = delta.toObject();
    await f.history.record([command('actor.damage', synthetic.uuid), command('actor.damage', base.uuid)], async () => {
      await synthetic.update({ 'system.attributes.hp.value': 18 });
      await base.update({ 'system.attributes.hp.value': 18 });
    });
    expect(f.history.count).toBe(1);
    await f.history.undo();
    expect(base.source.system.attributes.hp.value).toBe(20);
    expect(synthetic.toObject().system.attributes.hp.value).toBe(20);
    expect(delta.toObject()).toEqual(beforeDelta);
    expect(f.history.count).toBe(0);
  });

  test('can finish the same shared-base undo after the base was restored but Delta restoration failed once', async () => {
    const { f, base, token, delta, synthetic } = sharedBaseFixture();
    const beforeDelta = delta.toObject();
    await f.history.record([command('actor.damage', synthetic.uuid), command('actor.damage', base.uuid)], async () => {
      await synthetic.update({ 'system.attributes.hp.value': 18 });
      await base.update({ 'system.attributes.hp.value': 18 });
    });
    const update = token.update.bind(token);
    let fail = true;
    token.update = async (data, options) => {
      if (fail && 'delta' in data) { fail = false; throw new Error('Delta restore failed once'); }
      return update(data, options);
    };
    await expect(f.history.undo()).rejects.toThrow('Delta restore failed once');
    expect(base.source.system.attributes.hp.value).toBe(20);
    expect(f.history.count).toBe(1);
    await f.history.undo();
    expect(delta.toObject()).toEqual(beforeDelta);
    expect(synthetic.toObject().system.attributes.hp.value).toBe(20);
    expect(f.history.count).toBe(0);
  });

  test('guards inherited condition copies against the base effect state produced by the same batch', async () => {
    const { f, base, delta, synthetic } = sharedBaseFixture();
    const baseEffect = f.make('ActiveEffect', { _id: 'dnd5eexhaustion0', system: { level: 2 } }, base);
    const tokenEffect = f.make('ActiveEffect', { _id: 'dnd5eexhaustion0', system: { level: 2 } }, synthetic);
    const beforeDelta = delta.toObject();
    await f.history.record([command('actor.adjust-exhaustion', synthetic.uuid), command('actor.adjust-exhaustion', base.uuid)], async () => {
      await tokenEffect.update({ 'system.level': 3 });
      await delta.update({ effects: [tokenEffect.toObject()] });
      await baseEffect.update({ 'system.level': 3 });
    });
    await f.history.undo();
    expect(baseEffect.source.system.level).toBe(2);
    expect(tokenEffect.source.system.level).toBe(2);
    expect(delta.toObject()).toEqual(beforeDelta);
    expect(f.history.count).toBe(0);
  });

  test('owns inherited effects created by a selected base without requiring its unselected synthetic combatant to create another effect', async () => {
    const { f, base, token, delta, synthetic } = sharedBaseFixture();
    const combat = f.make('Combat', { _id: 'battle', round: 1, turn: 0 });
    const selected = f.make('Combatant', { _id: 'base-turn', actorUuid: base.uuid, defeated: false }, combat);
    const unselected = f.make('Combatant', { _id: 'token-turn', actorUuid: synthetic.uuid, tokenUuid: token.uuid, defeated: false }, combat);
    const beforeDelta = delta.toObject();
    let baseEffect: any, inherited: any;
    await f.history.record([{ id: 'combat.toggle-defeated', combatUuid: combat.uuid, combatantId: selected.id, targetUuid: base.uuid, active: true }], async () => {
      const source = { _id: 'dnd5edead0000000', statuses: ['dead'], flags: { core: { overlay: true } } };
      baseEffect = f.make('ActiveEffect', source, base);
      // The synthetic view appears when the base changes, with no local creation journal or Delta entry.
      inherited = f.make('ActiveEffect', source, synthetic, 'not-a-local-create');
      const removeBase = baseEffect.delete.bind(baseEffect);
      baseEffect.delete = async (options: any) => { await removeBase(options); f.documents.delete(inherited.uuid); };
      await selected.update({ defeated: true });
    });
    expect(unselected.source.defeated).toBeFalse();
    expect(delta.toObject()).toEqual(beforeDelta);
    expect(f.history.available).toBeTrue();
    await f.history.undo();
    expect(f.documents.has(baseEffect.uuid)).toBeFalse();
    expect(f.documents.has(inherited.uuid)).toBeFalse();
    expect(selected.source.defeated).toBeFalse();
    expect(unselected.source.defeated).toBeFalse();
    expect(delta.toObject()).toEqual(beforeDelta);
    expect(f.history.count).toBe(0);
  });

  test('does not claim an unjournalled synthetic effect with different source or its own Delta entry', async () => {
    for (const localDelta of [false, true]) {
      const { f, base, token, delta, synthetic } = sharedBaseFixture();
      const combat = f.make('Combat', { _id: 'battle', round: 1, turn: 0 });
      f.make('Combatant', { _id: 'base-turn', actorUuid: base.uuid, defeated: false }, combat);
      f.make('Combatant', { _id: 'token-turn', actorUuid: synthetic.uuid, tokenUuid: token.uuid, defeated: false }, combat);
      await f.history.record([{ id: 'combat.toggle-defeated', combatUuid: combat.uuid, combatantId: 'base-turn', targetUuid: base.uuid, active: true }], async () => {
        const source = { _id: 'dnd5edead0000000', statuses: ['dead'], flags: { core: { overlay: true } } };
        f.make('ActiveEffect', source, base);
        const external = f.make('ActiveEffect', { ...source, ...(!localDelta ? { name: 'Another user effect' } : {}) }, synthetic, 'other-user');
        if (localDelta) f.make('ActiveEffect', external.toObject(), delta, 'other-user');
      });
      expect(f.history.available).toBeFalse();
      await expect(f.history.undo()).rejects.toThrow('OSD.Undo.RecordingUnavailable');
    }
  });

  test('restores a registered timed effect on an Actor outside the current combat', async () => {
    const f = worldFixture(), participant = f.actor('participant'), outsider = f.actor('outsider');
    const effect = f.make('ActiveEffect', { _id: 'expires-outside', duration: { seconds: 5, startTime: 100 } }, outsider);
    (globalThis as any).foundry.documents = { ActiveEffect: { registry: new Set([effect]) } };
    const combat = f.make('Combat', { _id: 'battle', round: 1, turn: 0 });
    f.make('Combatant', { _id: 'turn', actorUuid: participant.uuid }, combat);
    await f.history.record([{ id: 'combat.next-turn', combatUuid: combat.uuid }], async () => {
      await combat.update({ turn: 1 });
      await f.game.time.set(106);
      await effect.delete();
    });
    expect(f.documents.has(effect.uuid)).toBeFalse();
    await f.history.undo();
    expect(f.documents.get(effect.uuid)?.source.duration).toEqual({ seconds: 5, startTime: 100 });
    expect(f.game.time.worldTime).toBe(100);
  });

  test('rechecks GM permission after asynchronous reads and does not write on a player client', async () => {
    const f = worldFixture(), actor = f.actor('one');
    await f.history.record([command('actor.set-hp', actor.uuid)], () => actor.update({ 'system.attributes.hp.value': 10 }));
    const count = f.calls.length;
    f.runtime.resolveUuid = async (uuid) => { f.game.user.isGM = false; return f.documents.get(uuid); };
    await expect(f.history.undo()).rejects.toThrow('OSD.Errors.GmOnly');
    expect(f.calls.length).toBe(count);
    expect(actor.source.system.attributes.hp.value).toBe(10);
    expect(f.history.count).toBe(1);
  });

  test('corrects an incidental native expiry caused by restoring time itself', async () => {
    const f = worldFixture(), outsider = f.actor('outsider');
    const effect = f.make('ActiveEffect', { _id: 'clock-effect', start: { time: 95 }, duration: { value: 5, units: 'seconds' } }, outsider);
    (globalThis as any).foundry.documents = { ActiveEffect: { registry: new Set([effect]) } };
    const combat = f.make('Combat', { _id: 'battle', round: 2, turn: 0 });
    f.game.time.worldTime = 106;
    await f.history.record([{ id: 'combat.previous-turn', combatUuid: combat.uuid }], async () => {
      await combat.update({ round: 1 });
      await f.game.time.set(100);
    });
    const setTime = f.game.time.set;
    f.game.time.set = async (value: number) => { await setTime(value); if (value === 106) await effect.delete(); };
    await f.history.undo();
    expect(f.game.time.worldTime).toBe(106);
    expect(f.documents.get(effect.uuid)?.source).toEqual(effect.source);
    expect(combat.source.round).toBe(2);
    expect(f.history.count).toBe(0);
  });

  test('refuses a time undo after an unrelated timed effect was added', async () => {
    const f = worldFixture(), outsider = f.actor('outsider');
    const registry = new Set<any>();
    (globalThis as any).foundry.documents = { ActiveEffect: { registry } };
    const combat = f.make('Combat', { _id: 'battle', round: 1, turn: 0 });
    await f.history.record([{ id: 'combat.next-turn', combatUuid: combat.uuid }], async () => {
      await combat.update({ round: 2 }); await f.game.time.set(106);
    });
    registry.add(f.make('ActiveEffect', { _id: 'new-spell', duration: { value: 5, units: 'seconds' } }, outsider));
    const count = f.calls.length;
    await expect(f.history.undo()).rejects.toThrow('OSD.Undo.Conflict');
    expect(f.calls.length).toBe(count);
    expect(f.game.time.worldTime).toBe(106);
  });

  test('restores literal UUID keys as an atomic flag map', async () => {
    const f = worldFixture(), actor = f.actor('one');
    actor.source.flags.dnd5e = { dependents: { 'Actor.a.ActiveEffect.b': 'before' } };
    await f.history.record([command('actor.toggle-concentration', actor.uuid)], async () => {
      actor.source.flags.dnd5e.dependents = { 'Actor.c.ActiveEffect.d': 'after' };
    });
    await f.history.undo();
    expect(actor.source.flags.dnd5e.dependents).toEqual({ 'Actor.a.ActiveEffect.b': 'before' });
    expect(f.calls.at(-1)?.data['flags.dnd5e.dependents']).toBeInstanceOf(ForcedReplacement);
  });

  test('provides native originalLevel context when restoring an existing levelled condition', async () => {
    const f = worldFixture(), actor = f.actor('one');
    const effect = f.make('ActiveEffect', { _id: 'exhaustion', system: { level: 2 } }, actor);
    Object.defineProperty(effect, 'system', { get: () => ({ hasLevels: true, level: effect.source.system.level }) });
    const update=effect.update.bind(effect);
    effect.update=async (data,options) => {
      if (!Number.isFinite(options?.dnd5e?.originalLevel)) throw new Error('Native condition callback requires originalLevel');
      return update(data,options);
    };
    await f.history.record([command('actor.adjust-exhaustion',actor.uuid)],()=>effect.update({'system.level':3},{dnd5e:{originalLevel:2}}));
    await f.history.undo();
    expect(effect.source.system.level).toBe(2);
    expect(f.calls.at(-1)?.options.dnd5e.originalLevel).toBe(3);
    expect(f.history.count).toBe(0);
  });

  test('uses the Injury projection maintenance context when removing an undo-created projection',async()=>{
    const f=worldFixture(),actor=f.actor('one');let effect:any;
    await f.history.record([command('actor.set-status',actor.uuid)],async()=>{effect=f.make('ActiveEffect',{_id:'projection',flags:{'fvtt-custom-conditions':{injuryProjection:true}}},actor);});
    await f.history.undo();expect(f.calls.find(c=>c.operation==='delete'&&c.uuid===effect.uuid)?.options['fvtt-custom-conditions']).toEqual({injuryProjection:true});
  });

  test('retains ownership of an auto-created rider when its correction delete fails once', async () => {
    const f = worldFixture(), actor = f.actor('one');
    const completion: any = { initialize() {}, canCapture: () => true, lastCreated: new Set<string>(),
      lastObserved: new Set<string>(), lastJournalFailed: false, flush: async () => {}, waitForIdle:async()=>{},
      async run(operation: () => Promise<any>) { this.lastCreated = new Set(); return operation(); } };
    const history = new DeckUndoHistory(f.runtime, completion);
    const effect = f.make('ActiveEffect', { _id: 'original' }, actor);
    await history.record([command('actor.set-status', actor.uuid)], () => effect.delete());
    const create = actor.createEmbeddedDocuments.bind(actor);
    actor.createEmbeddedDocuments = async (name, data, options) => {
      const result = await create(name, data, options);
      const rider = f.make('ActiveEffect', { _id: 'extra-rider' }, actor);
      completion.lastCreated.add(rider.uuid);
      const remove = rider.delete.bind(rider);
      let fail = true;
      rider.delete = async (opts) => { if (fail) { fail = false; throw new Error('Rider delete failed once'); } return remove(opts); };
      return result;
    };
    await expect(history.undo()).rejects.toThrow('Rider delete failed once');
    expect(f.documents.has(`${actor.uuid}.ActiveEffect.extra-rider`)).toBeTrue();
    await history.undo();
    expect(f.documents.has(`${actor.uuid}.ActiveEffect.extra-rider`)).toBeFalse();
    expect(f.documents.has(effect.uuid)).toBeTrue();
    expect(history.count).toBe(0);
  });

  test('preserves native operations but does not expose an unreliable battle undo without a completion boundary', async () => {
    const f = worldFixture(), combat = f.make('Combat', { _id: 'battle', round: 1, turn: 0 });
    f.game.modules.get('lib-wrapper').active = false;
    await f.history.record([{ id: 'combat.next-turn', combatUuid: combat.uuid }], () => combat.update({ turn: 1 }));
    expect(combat.source.turn).toBe(1);
    expect(f.history.count).toBe(1);
    expect(f.history.available).toBeFalse();
    await expect(f.history.undo()).rejects.toThrow('OSD.Undo.RecordingUnavailable');
    expect(combat.source.turn).toBe(1);
  });

  test('never mistakes a newly observed pre-existing Actor for an Actor created by the operation', async () => {
    const f = worldFixture(), first = f.actor('first'), existing = f.actor('existing');
    await f.history.record([command('actor.set-status', first.uuid)], async () => {
      const effect = f.make('ActiveEffect', { _id: 'new-status' }, first);
      await existing.update({ 'flags.dnd5e.dependentOn': effect.uuid });
    });
    expect(f.history.available).toBeFalse();
    await expect(f.history.undo()).rejects.toThrow('OSD.Undo.RecordingUnavailable');
    expect(f.documents.has(existing.uuid)).toBeTrue();
  });

  test('does not claim another user new embedded status as its own undo deletion', async () => {
    const f=worldFixture(),actor=f.actor('one');
    let foreign:any;
    await f.history.record([command('actor.set-hp',actor.uuid)],async()=>{
      await actor.update({'system.attributes.hp.value':10});
      foreign=f.make('ActiveEffect',{_id:'other-user-effect'},actor,'player');
    });
    expect(f.history.available).toBeFalse();
    await expect(f.history.undo()).rejects.toThrow('OSD.Undo.RecordingUnavailable');
    expect(f.documents.has(foreign.uuid)).toBeTrue();
  });
});

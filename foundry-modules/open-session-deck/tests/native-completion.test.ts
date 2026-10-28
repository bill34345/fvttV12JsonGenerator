import { afterEach, describe, expect, test } from 'bun:test';
import { NativeCompletion } from '../src/native-completion.ts';
import type { Dnd5eRuntime } from '../src/dnd5e-adapter.ts';

const originalLibrary = Object.getOwnPropertyDescriptor(globalThis, 'libWrapper');
const originalHooks = Object.getOwnPropertyDescriptor(globalThis, 'Hooks');
afterEach(() => {
  for (const [key, descriptor] of [['libWrapper', originalLibrary], ['Hooks', originalHooks]] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as any)[key];
  }
});

function fixture() {
  const wrappers = new Map<string, (...args: any[]) => any>();
  const listeners = new Map<string, Map<number, (...args: any[]) => void>>();
  let sequence = 0;
  (globalThis as any).libWrapper = {
    register: (_id: string, path: string, callback: (...args: any[]) => any, type: string) => {
      expect(type).toBe('WRAPPER'); wrappers.set(path, callback); return ++sequence;
    }, unregister: () => {},
  };
  (globalThis as any).Hooks = {
    on: (event: string, callback: (...args: any[]) => void) => { const callbacks = listeners.get(event) ?? new Map(); listeners.set(event, callbacks); const id = ++sequence; callbacks.set(id, callback); return id; },
    off: (event: string, id: number) => { listeners.get(event)?.delete(id); },
  };
  const user = { id: 'gm', isGM: true };
  const runtime = { game: { user, users: { activeGM: user }, modules: new Map([['lib-wrapper', { active: true }]]) } } as unknown as Dnd5eRuntime;
  const completion = new NativeCompletion(runtime);
  completion.initialize();
  return { completion, runtime, wrappers, listeners };
}

describe('native completion observation', () => {
  test('waits for trigger subscribers and their subsequent native writes', async () => {
    const f=fixture();let triggerDone!:()=>void,writeDone!:()=>void,finished=false,first=true;
    const trigger=new Promise<void>(resolve=>{triggerDone=resolve;}),write=new Promise<void>(resolve=>{writeDone=resolve;});
    f.runtime.game.modules.set('fvtt-trigger-engine',{active:true,api:{ready:true,capabilities:{awaitIdle:1,combatRewind:1},captureCombatUndo:()=>({}),reconcileCombatUndo:async()=>{},whenIdle:async()=>{
      if(!first)return;first=false;await trigger;f.wrappers.get('foundry.abstract.Document.updateDocuments')!(()=>write);
    }}});
    const operation=f.completion.run(async()=>{}).then(()=>{finished=true;});
    await new Promise(resolve=>setTimeout(resolve,0));expect(finished).toBeFalse();triggerDone();
    await new Promise(resolve=>setTimeout(resolve,0));expect(finished).toBeFalse();writeDone();await operation;expect(finished).toBeTrue();
  });

  test('fails closed for undo if an active trigger engine has no completion capability',()=>{
    const f=fixture();f.runtime.game.modules.set('fvtt-trigger-engine',{active:true,api:{}});
    expect(f.completion.canCapture([])).toBeFalse();expect(f.completion.triggerBoundaryMissing).toBeTrue();
  });
  test('does not attribute another user created documents to this GM operation', async () => {
    const f=fixture();
    await f.completion.run(async()=>{
      const callbacks=f.listeners.get('createActor')!;
      for (const callback of callbacks.values()) {
        callback({uuid:'Actor.other'}, {}, 'player');
        callback({uuid:'Actor.own'}, {}, 'gm');
      }
    });
    expect([...f.completion.lastCreated]).toEqual(['Actor.own']);
  });
  test('waits for status construction before its subsequent native create starts', async () => {
    const f = fixture();
    let build!: () => void, persist!: () => void, finished = false;
    const building = new Promise<void>((resolve) => { build = resolve; });
    const persistence = new Promise<void>((resolve) => { persist = resolve; });
    const operation = f.completion.run(async () => {
      void (async () => {
        await f.wrappers.get('CONFIG.ActiveEffect.documentClass.fromStatusEffect')!(() => building);
        await f.wrappers.get('foundry.abstract.Document.createDocuments')!(() => persistence);
      })();
    }).then(() => { finished = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(finished).toBeFalse(); build();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(finished).toBeFalse(); persist(); await operation;
    expect(finished).toBeTrue();
  });
  test('returns the original result and waits for native children launched after the command returned', async () => {
    const f = fixture();
    let first!: () => void, second!: () => void, finished = false, recovered = false;
    const gate = new Promise<void>((resolve) => { first = resolve; });
    const recovery = new Promise<void>((resolve) => { second = resolve; });
    let originalCalls = 0, originalPromise: Promise<void> | undefined;
    const operation = f.completion.run(async () => {
      const native = async () => {
        await gate;
        f.wrappers.get('CONFIG.Combat.documentClass.prototype._recoverUses')!(async () => { await recovery; recovered = true; });
      };
      originalPromise = native();
      const returned = f.wrappers.get('CONFIG.Combat.documentClass.prototype._manageTurnEvents')!(() => { originalCalls += 1; return originalPromise; });
      expect(returned).toBe(originalPromise);
      return 'Combat update returned';
    }).then((value) => { finished = true; return value; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(finished).toBeFalse();
    first();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(finished).toBeFalse();
    expect(recovered).toBeFalse();
    second();
    expect(await operation).toBe('Combat update returned');
    expect(recovered).toBeTrue();
    expect(originalCalls).toBe(1);
    expect([...f.listeners.values()].every((listeners) => listeners.size === 0)).toBeTrue();
  });

  test('waits for effect-registry completion and reports native failure instead of calling it complete', async () => {
    const f = fixture();
    let release!: () => void;
    const registry = new Promise<void>((_resolve, reject) => { release = () => reject(new Error('Native expiry failed')); });
    const operation = f.completion.run(async () => {
      f.wrappers.get('foundry.documents.ActiveEffect.registry.refresh')!(() => registry);
    });
    release();
    await expect(operation).rejects.toThrow('Native operation failed');
    expect([...f.listeners.values()].every((listeners) => listeners.size === 0)).toBeTrue();
  });

  test('can explicitly drain registry work before restoring expired effects', async () => {
    const f = fixture();
    let release!: () => void, registryDone = false, effectsRestored = false;
    const registry = new Promise<void>((resolve) => { release = () => { registryDone = true; resolve(); }; });
    const operation = f.completion.run(async () => {
      f.wrappers.get('foundry.documents.ActiveEffect.registry.refresh')!(() => registry);
      await f.completion.flush();
      expect(registryDone).toBeTrue();
      effectsRestored = true;
    });
    await Promise.resolve();
    expect(effectsRestored).toBeFalse();
    release();
    await operation;
    expect(effectsRestored).toBeTrue();
  });

  test('waits for the delete Promise returned by native expiry callbacks after the registry update', async () => {
    const f = fixture();
    let deleteEffect!: () => void, finished = false, deleted = false;
    const deletion = new Promise<void>((resolve) => { deleteEffect = () => { deleted = true; resolve(); }; });
    const operation = f.completion.run(async () => {
      f.wrappers.get('foundry.documents.ActiveEffect.registry.refresh')!(async () => {
        f.wrappers.get('CONFIG.ActiveEffect.documentClass.prototype._onUpdate')!(() => deletion);
      });
    }).then(() => { finished = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(finished).toBeFalse();
    expect(deleted).toBeFalse();
    deleteEffect();
    await operation;
    expect(finished).toBeTrue();
    expect(deleted).toBeTrue();
  });

  test('does not pretend another GM or an environment without libWrapper has a full battle completion boundary', () => {
    const f = fixture();
    expect(f.completion.canCapture([{ id: 'combat.next-turn' }])).toBeTrue();
    f.runtime.game.users.activeGM = { id: 'other' };
    expect(f.completion.canCapture([{ id: 'actor.set-hp' }])).toBeFalse();
    f.runtime.game.users.activeGM = f.runtime.game.user;
    f.runtime.game.modules.get('lib-wrapper').active = false;
    const unavailable = new NativeCompletion(f.runtime);
    expect(unavailable.canCapture([{ id: 'combat.next-turn' }])).toBeFalse();
    expect(unavailable.canCapture([{ id: 'actor.set-hp' }])).toBeFalse();
  });
});

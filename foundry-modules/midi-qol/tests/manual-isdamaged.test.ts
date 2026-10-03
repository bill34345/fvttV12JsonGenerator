import { beforeAll, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadPreparedWorkflowSource } from './helpers/real-workflow-source';

const sourceRoot = resolve(import.meta.dir, '../../../.local/midi-qol/source');
let ts: any;
let workflow: any;
let component: any;

function method(file: any, owner: string, name: string): string {
  const declaration = file.statements.find((statement: any) => ts.isClassDeclaration(statement) && statement.name?.text === owner);
  const matches = declaration?.members.filter((member: any) => member.name?.getText(file) === name) ?? [];
  if (matches.length !== 1) throw new Error(`Expected exactly one ${owner}.${name}`);
  return matches[0].getText(file);
}

beforeAll(async () => {
  const prepared = await loadPreparedWorkflowSource();
  ts = prepared.typescript;
  workflow = ts.createSourceFile('Workflow.ts', prepared.sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const text = await readFile(resolve(sourceRoot, 'src/module/ChatClasses/DamageApplicationElementMidi.ts'), 'utf8');
  component = ts.createSourceFile('DamageApplicationElementMidi.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
});

function makeHarness({ mode = 'none', version = '6.0.2', damage = 13, temp = 0, cancel = false, cancelTarget = -1,
  rejectTarget = -1, flagFailure, expiryMode = 'delete',
  sourceMatches = true, mismatch = false, targets = 1 }: {
  mode?: string; version?: string; damage?: number; temp?: number; cancel?: boolean; cancelTarget?: number;
  rejectTarget?: number; flagFailure?: 'pending-reject' | 'pending-cancel' | 'complete-reject' | 'complete-cancel';
  expiryMode?: 'delete' | 'update';
  sourceMatches?: boolean; mismatch?: boolean; targets?: number;
} = {}) {
  const listeners = new Map<number, Function>();
  let nextListener = 0;
  const removed: string[][] = [];
  const marked: string[] = [];
  let failNextFlag = flagFailure;
  const applyError = new Error('later target apply rejected');
  const actors = Array.from({ length: targets }, (_, index) => ({
    uuid: `Actor.${index}`, system: { attributes: { hp: { value: 40, temp } } },
    flags: { 'midi-qol': {} as Record<string, unknown> },
    getFlag(scope: string, key: string) { return (this.flags as any)[scope]?.[key]; },
    effects: [{ uuid: `Effect.base.${index}`, flags: { dae: { specialDuration: ['isDamaged'] } } },
      { uuid: `Effect.typed.${index}`, flags: { dae: { specialDuration: ['isDamaged.piercing'] } } }],
  }));
  const tokens = actors.map((actor, index) => ({ uuid: `Scene.test.Token.${index}`, actor, isOwner: true }));
  const byUuid = new Map(tokens.map(token => [token.uuid, token]));
  const message: any = {
    id: 'ownCard', uuid: 'ChatMessage.ownCard', type: 'usage', flags: { 'midi-qol': { type: 0 } },
    rolls: [{ options: { 'midi-qol': { rollType: 'defaultDamage' } } }],
    getFlag(scope: string, key: string) { return this.flags[scope]?.[key]; },
    async setFlag() { throw new Error('Applying user does not own GM-authored chat card'); },
  };
  const Hooks = {
    on(_name: string, callback: Function) { const id = ++nextListener; listeners.set(id, callback); return id; },
    off(_name: string, id: number) { listeners.delete(id); },
  };
  const configSettings = { autoApplyDamage: mode };
  const game = { system: { version } };
  const foundry = { utils: { getProperty: (value: any, path: string) => path.split('.').reduce((current, part) => current?.[part], value) } };
  const code = `
    const manualDamageExpiryPending = new Set();
    const manualDamageExpiryCompleted = new Set();
    class NativeDamage {
      async _onApplyDamage(event) {
        event.preventDefault?.();
        for (const [index, target] of this.targetList.querySelectorAll('option').entries()) {
          const token = fromUuidSync(target.value);
          if (!token?.isOwner) continue;
          const actor = token.actor;
          if (index === rejectTarget) throw applyError;
          if (cancel || index === cancelTarget) continue;
          const absorbed = Math.min(actor.system.attributes.hp.temp, damage);
          actor.system.attributes.hp.temp -= absorbed;
          actor.system.attributes.hp.value = Math.max(0, actor.system.attributes.hp.value - (damage - absorbed));
          for (const callback of listeners.values()) callback(actor, damage, {
            originatingMessage: sourceMatches ? this.chatMessage : {uuid: 'Other'},
            origin: this.chatMessage
          });
          if (mismatch) actor.system.attributes.hp.value += 1;
        }
      }
    }
    class DamageApplicationElementMidi extends NativeDamage {
      ${method(component, 'DamageApplicationElementMidi', '_onApplyDamage')}
    }
    return DamageApplicationElementMidi;
  `;
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const makeDamageClass = () => new Function('fromUuidSync', 'listeners', 'cancel', 'cancelTarget', 'rejectTarget', 'applyError', 'damage', 'sourceMatches', 'mismatch', 'game',
    'configSettings', 'Hooks', 'foundry', 'MODULE_ID', 'getAppliedEffects', 'timedAwaitExecuteAsGM', js)(
      (uuid: string) => byUuid.get(uuid), listeners, cancel, cancelTarget, rejectTarget, applyError, damage, sourceMatches, mismatch, game,
      configSettings, Hooks, foundry, 'midi-qol',
      (actor: any) => actor.effects,
      async (action: string, args: any) => {
        if (action === '_gmSetFlag') {
          const failure = `${args.value.status}-${failNextFlag?.split('-')[1]}`;
          if (failNextFlag && failure === failNextFlag) {
            const selected = failNextFlag;
            failNextFlag = undefined;
            if (selected.endsWith('reject')) throw new Error(`GM flag ${selected}`);
            return;
          }
          const actor = actors.find(value => value.uuid === args.actorUuid)!;
          (actor.flags['midi-qol'] as Record<string, unknown>)[args.key] = args.value;
          marked.push(args.key);
          return;
        }
        expect(action).toBe('removeEffectUuids');
        removed.push(args.effects);
        const actor = actors.find(value => value.uuid === args.actorUuid)!;
        if (expiryMode === 'delete') actor.effects = actor.effects.filter(effect => !args.effects.includes(effect.uuid));
        else for (const effect of actor.effects.filter(effect => args.effects.includes(effect.uuid))) {
          (effect as any).duration = { expired: true };
        }
      },
    );
  const Damage = makeDamageClass();
  const tray = new Damage();
  tray.chatMessage = message;
  tray.damageType = 'defaultDamage';
  tray.targetList = { querySelectorAll: () => tokens.map(token => ({ value: token.uuid })) };
  const freshTray = () => {
    const NewDamage = makeDamageClass();
    const next = new NewDamage();
    next.chatMessage = message;
    next.damageType = tray.damageType;
    next.targetList = tray.targetList;
    return next;
  };
  return { tray, freshTray, actors, removed, marked, message, listeners, applyError };
}

test('manual Midi APPLY expires only base isDamaged after a real 40 to 27 write, once per actor', async () => {
  const h = makeHarness({ targets: 2 });
  expect(h.actors.map(actor => actor.system.attributes.hp.value)).toEqual([40, 40]);
  await h.tray._onApplyDamage({ preventDefault() {} });
  expect(h.actors.map(actor => actor.system.attributes.hp.value)).toEqual([27, 27]);
  expect(h.removed).toEqual([['Effect.base.0'], ['Effect.base.1']]);
  expect(h.marked).toEqual(Array(4).fill('manualIsDamagedExpired_ownCard_defaultDamage'));
  expect(h.actors.every(actor => (actor.flags['midi-qol'] as any).manualIsDamagedExpired_ownCard_defaultDamage.status === 'complete')).toBe(true);
  expect(h.actors.every(actor => actor.effects.some(effect => effect.uuid.startsWith('Effect.typed')))).toBe(true);
  expect(h.listeners.size).toBe(0);
  h.actors[0]!.effects.push({ uuid: 'Effect.new', flags: { dae: { specialDuration: ['isDamaged'] } } });
  const renderedAgain = new h.tray.constructor();
  renderedAgain.chatMessage = h.message;
  renderedAgain.damageType = h.tray.damageType;
  renderedAgain.targetList = h.tray.targetList;
  await renderedAgain._onApplyDamage({ preventDefault() {} });
  expect(h.actors[0]!.effects.some(effect => effect.uuid === 'Effect.new')).toBe(true);
  await h.tray._onApplyDamage({ preventDefault() {} });
  expect(h.removed).toHaveLength(2);
});

test('a later native APPLY rejection still finalizes an earlier confirmed target and rethrows the original error', async () => {
  const h = makeHarness({ targets: 2, rejectTarget: 1 });
  await expect(h.tray._onApplyDamage({ preventDefault() {} })).rejects.toBe(h.applyError);
  expect(h.actors.map(actor => actor.system.attributes.hp.value)).toEqual([27, 40]);
  expect(h.removed).toEqual([['Effect.base.0']]);
  expect(h.actors[1]!.effects).toHaveLength(2);
  expect(h.listeners.size).toBe(0);
});

test('separate cards use independently addressable Actor markers', async () => {
  const h = makeHarness();
  await h.tray._onApplyDamage({ preventDefault() {} });
  h.actors[0]!.effects.push({ uuid: 'Effect.second', flags: { dae: { specialDuration: ['isDamaged'] } } });
  const secondMessage = { ...h.message, id: 'nextCard', uuid: 'ChatMessage.nextCard' };
  const secondTray = new h.tray.constructor();
  secondTray.chatMessage = secondMessage;
  secondTray.damageType = h.tray.damageType;
  secondTray.targetList = h.tray.targetList;
  await secondTray._onApplyDamage({ preventDefault() {} });
  expect(h.removed).toEqual([['Effect.base.0'], ['Effect.second']]);
  expect(Object.keys(h.actors[0]!.flags['midi-qol']).sort()).toEqual([
    'manualIsDamagedExpired_nextCard_defaultDamage',
    'manualIsDamagedExpired_ownCard_defaultDamage',
  ]);
});

test.each(['pending-reject', 'pending-cancel'] as const)(
  '%s leaves effects untouched until a durable UUID snapshot is readable', async (flagFailure) => {
    const h = makeHarness({ flagFailure });
    if (flagFailure === 'pending-reject') {
      await expect(h.tray._onApplyDamage({ preventDefault() {} })).rejects.toThrow('GM flag pending-reject');
    } else {
      await h.tray._onApplyDamage({ preventDefault() {} });
    }
    expect(h.removed).toEqual([]);
    expect(h.actors[0]!.effects).toHaveLength(2);
    expect(h.actors[0]!.getFlag('midi-qol', 'manualIsDamagedExpired_ownCard_defaultDamage')).toBeUndefined();
    await h.freshTray()._onApplyDamage({ preventDefault() {} });
    expect(h.removed).toEqual([['Effect.base.0']]);
    expect((h.actors[0]!.getFlag('midi-qol', 'manualIsDamagedExpired_ownCard_defaultDamage') as any).status).toBe('complete');
  },
);

test.each(['complete-reject', 'complete-cancel'] as const)(
  '%s reconciles a fresh client from the durable UUID snapshot without removing a new effect', async (flagFailure) => {
    const h = makeHarness({ flagFailure, expiryMode: flagFailure === 'complete-reject' ? 'update' : 'delete' });
    if (flagFailure === 'complete-reject') {
      await expect(h.tray._onApplyDamage({ preventDefault() {} })).rejects.toThrow('GM flag complete-reject');
    } else {
      await h.tray._onApplyDamage({ preventDefault() {} });
    }
    expect(h.removed).toEqual([['Effect.base.0']]);
    const marker = 'manualIsDamagedExpired_ownCard_defaultDamage';
    expect(h.actors[0]!.getFlag('midi-qol', marker)).toEqual({ status: 'pending', effects: ['Effect.base.0'] });
    h.actors[0]!.effects.push({ uuid: 'Effect.new', flags: { dae: { specialDuration: ['isDamaged'] } } });
    await h.freshTray()._onApplyDamage({ preventDefault() {} });
    expect(h.removed).toEqual([['Effect.base.0']]);
    expect(h.actors[0]!.effects.some(effect => effect.uuid === 'Effect.new')).toBe(true);
    expect(h.actors[0]!.getFlag('midi-qol', marker)).toEqual({ status: 'complete', effects: ['Effect.base.0'] });
  },
);

test('fresh-client retry at HP zero completes a pending snapshot without a second damage change', async () => {
  const h = makeHarness({ damage: 40, flagFailure: 'complete-reject', expiryMode: 'update' });
  await expect(h.tray._onApplyDamage({ preventDefault() {} })).rejects.toThrow('GM flag complete-reject');
  expect(h.actors[0]!.system.attributes.hp.value).toBe(0);
  expect(h.removed).toEqual([['Effect.base.0']]);
  h.actors[0]!.effects.push({ uuid: 'Effect.after', flags: { dae: { specialDuration: ['isDamaged'] } } });
  await h.freshTray()._onApplyDamage({ preventDefault() {} });
  expect(h.actors[0]!.system.attributes.hp.value).toBe(0);
  expect(h.removed).toEqual([['Effect.base.0']]);
  expect(h.actors[0]!.effects.some(effect => effect.uuid === 'Effect.after')).toBe(true);
  expect((h.actors[0]!.getFlag('midi-qol', 'manualIsDamagedExpired_ownCard_defaultDamage') as any).status).toBe('complete');
});

test('temp HP loss counts as actual damage while an independently cancelled target keeps its effect', async () => {
  const h = makeHarness({ temp: 20, targets: 2, cancelTarget: 1 });
  await h.tray._onApplyDamage({ preventDefault() {} });
  expect(h.actors.map(actor => actor.system.attributes.hp)).toEqual([
    { value: 40, temp: 7 }, { value: 40, temp: 20 },
  ]);
  expect(h.removed).toEqual([['Effect.base.0']]);
  expect(h.actors[1]!.effects).toHaveLength(2);
});

test.each([
  ['cancelled', { cancel: true }],
  ['zero', { damage: 0 }],
  ['unrecognized source', { sourceMatches: false }],
  ['readback mismatch', { mismatch: true }],
])('%s APPLY leaves DAE effects in place', async (_label, options) => {
  const h = makeHarness(options);
  await h.tray._onApplyDamage({ preventDefault() {} });
  expect(h.removed).toEqual([]);
  expect(h.actors[0]!.effects).toHaveLength(2);
  expect(h.listeners.size).toBe(0);
});

test('unknown card ownership fails closed, while the native damage operation remains available', async () => {
  const h = makeHarness();
  delete h.message.flags['midi-qol'];
  await h.tray._onApplyDamage({ preventDefault() {} });
  expect(h.actors[0]!.system.attributes.hp.value).toBe(27);
  expect(h.removed).toEqual([]);
});

test('automatic mode takes the original native path without registering post-apply expiry', async () => {
  const h = makeHarness({ mode: 'yesCard' });
  await h.tray._onApplyDamage({ preventDefault() {} });
  expect(h.removed).toEqual([]);
  expect(h.listeners.size).toBe(0);
});

test('Workflow keeps manual calculation hooks but defers base and typed DAE expiry', async () => {
  const hooks: string[] = [], removed: string[][] = [];
  const settings = { autoApplyDamage: 'none', allowUseMacro: false };
  const code = `
    class Workflow {
      ${method(workflow, 'Workflow', 'callDamageHooksAndMacros')}
      ${method(workflow, 'Workflow', 'expireTargetEffects')}
    }
    return Workflow;
  `;
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const Workflow = new Function('configSettings', 'game', 'asyncHooksCallAll', 'foundry', 'midiFlag', 'OnUseMacros',
    'getAppliedEffects', 'timedAwaitExecuteAsGM', 'debugEnabled', js)(
      settings, { system: { version: '6.0.2' } }, async (name: string) => { hooks.push(name); },
      { utils: { getProperty: () => undefined } }, () => '', class {}, (actor: any) => actor.effects,
      async (_name: string, args: any) => { removed.push(args.effects); }, 0,
    );
  const actor: any = { uuid: 'Actor.target', effects: [
    { uuid: 'Effect.base', flags: { dae: { specialDuration: ['isDamaged'] } } },
    { uuid: 'Effect.typed', flags: { dae: { specialDuration: ['isDamaged.piercing'] } } },
  ] };
  const token: any = { actor, document: { uuid: 'Scene.test.Token.target' } };
  const entry = { targetUuid: token.document.uuid, hpDamage: 13, tempDamage: 0 };
  const w = new Workflow();
  Object.assign(w, { item: { flags: null }, workflowOptions: {}, hitTargets: new Set([token]),
    hitTargetsEC: new Set(), targets: new Set([token]), actor: { uuid: 'Actor.caster' },
    activity: { attack: true }, damageList: [entry], rawDamageDetail: [{ type: 'piercing' }] });
  await w.callDamageHooksAndMacros(entry, token);
  await w.expireTargetEffects(['isDamaged']);
  expect(hooks).toEqual(['midi-qol.preTargetDamageApplication', 'midi-qol.isDamaged']);
  expect(removed).toEqual([]);
  settings.autoApplyDamage = 'yesCard';
  await w.callDamageHooksAndMacros(entry, token);
  expect(removed).toEqual([['Effect.base']]);
});

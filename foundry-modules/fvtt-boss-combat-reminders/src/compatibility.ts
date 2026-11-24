import { effectActor } from './defeat.ts';
import { itemTrigger } from './health.ts';
import { MODULE_ID } from './types.ts';
import type { NativeActor, NativeEffect, NativeItem } from './types.ts';

const zeroExpiry = 'midi-qol:zeroHP';
const cprSource = 'chris-premades';
const cprMacro = 'useOnDeath';
const midiBundle = /\buntarget(?:Dead|All)Tokens\b[^\n]*\/modules\/midi-qol\/midi-qol\.js(?:\?[^:\n)]*)?:/;
const monkTurnBundle = /\/modules\/monks-combat-details\/js\/combat-turn\.js(?:\?[^:\n)]*)?:/;

type EffectOptions = Record<string, unknown>;
type TargetOptions = { releaseOthers?: boolean };
type SetTarget = (targeted?: boolean, options?: TargetOptions) => unknown;
interface Targetable {
  actor?: NativeActor;
  setTarget: SetTarget;
}
interface ActorToken {
  uuid: string;
  object?: Targetable;
}
interface CompatActor extends NativeActor {
  token?: ActorToken | null;
  getActiveTokens?(linked?: boolean, documents?: boolean): (ActorToken | Targetable)[];
}
interface CompatEffect extends NativeEffect {
  uuid?: string;
  disabled?: boolean;
  system?: { changes?: Iterable<{ key: string; value?: unknown }> };
}
interface DeathContext {
  document: NativeItem;
  options?: EffectOptions;
}
interface SuppressedMacros {
  actor: string;
  items: string[];
}
interface CatMacro {
  pass: string;
  priority?: number;
  macro(context: DeathContext): unknown;
}
interface CatApi {
  api?: { registerFnMacro?(data: object, overwrite: boolean): unknown };
  lib?: { constants?: { macros?: {
    getFnMacros(source: string, rules: string, identifier: string, type: string, pass: string): { macros: CatMacro[] } | undefined;
  } } };
  utils?: { workflowUtils?: {
    completeItemUse(item: NativeItem, targets: unknown[], options: object): Promise<unknown>;
  } };
}
interface CompatGlobals {
  game?: { user?: { id: string }; modules?: { get(id: string): { version?: string } | undefined } };
  DAE?: { expireEffect?(effect: NativeEffect, options: EffectOptions): Promise<unknown> };
  cat?: CatApi;
}

export function createDefeatCompatibility({ active, pending }: {
  active(id: string): boolean;
  pending(actor: NativeActor): boolean;
}) {
  const globals = globalThis as CompatGlobals;
  const deferred = new Map<string, Set<string>>();
  const protectedTargets = new WeakMap<Targetable, { replacement: SetTarget; previous?: PropertyDescriptor }>();
  const suppressDeathMacro = new Map<string, SuppressedMacros>();
  let cprReady = false;

  const installed = (id: string, version: string) => active(id) && globals.game?.modules?.get(id)?.version === version;
  const canHoldExpiry = () => installed('dae', '14.6.10.1') && installed('midi-qol', '14.7.0+local.1')
    && typeof globals.DAE?.expireEffect === 'function';

  function trackExpiry(actor: NativeActor): void {
    if (!canHoldExpiry()) return;
    if ((actor.system.attributes?.hp?.value ?? 0) > 0) {
      deferred.delete(actor.uuid);
      return;
    }
    if (!pending(actor) || deferred.has(actor.uuid)) return;
    const effects = [...(actor.appliedEffects ?? [])].flatMap(effect => {
      const document = effect as CompatEffect;
      return document.uuid && harmfulExpiry(document, actor) ? [document.uuid] : [];
    });
    deferred.set(actor.uuid, new Set(effects));
  }

  function holdEffectRemoval(effect: NativeEffect, options: EffectOptions): boolean {
    if (options['expiry-reason'] !== zeroExpiry || !canHoldExpiry()) return false;
    const actor = effectActor(effect);
    const document = effect as CompatEffect;
    if (!actor || !pending(actor) || !document.uuid || !harmfulExpiry(document, actor)) return false;
    const ids = deferred.get(actor.uuid) ?? new Set();
    ids.add(document.uuid);
    deferred.set(actor.uuid, ids);
    return true;
  }

  async function replayEffects(actor: NativeActor): Promise<void> {
    const ids = deferred.get(actor.uuid);
    if (!ids || !canHoldExpiry()) return;
    for (const effect of actor.appliedEffects ?? []) {
      const document = effect as CompatEffect;
      if (!document.uuid || !ids.has(document.uuid) || !harmfulExpiry(document, actor)) continue;
      await globals.DAE!.expireEffect!(document, { 'expiry-reason': zeroExpiry });
      ids.delete(document.uuid);
    }
    deferred.delete(actor.uuid);
  }

  function protectTarget(actor: NativeActor): void {
    trackExpiry(actor);
    if ((actor.system.attributes?.hp?.value ?? 0) > 0) suppressDeathMacro.delete(actor.uuid);
    const midiTargets = installed('midi-qol', '14.7.0+local.1');
    const monkTargets = installed('monks-combat-details', '14.03');
    if (!midiTargets && !monkTargets) return;
    const source = actor as CompatActor;
    const placeables = [source.token?.object, ...(source.getActiveTokens?.() ?? [])];
    for (const candidate of placeables) {
      if (!candidate || !('setTarget' in candidate)) continue;
      const token = candidate;
      const protectedTarget = protectedTargets.get(token);
      if (!pending(actor)) {
        if (protectedTarget) {
          if (token.setTarget === protectedTarget.replacement) {
            if (protectedTarget.previous) Object.defineProperty(token, 'setTarget', protectedTarget.previous);
            else Reflect.deleteProperty(token, 'setTarget');
          }
          protectedTargets.delete(token);
        }
        continue;
      }
      if (protectedTarget) continue;
      const setTarget = token.setTarget;
      const previous = Object.getOwnPropertyDescriptor(token, 'setTarget');
      const replacement: SetTarget = function (this: Targetable, targeted, options) {
        // These callers share their options with manual targeting. Match the installed call sites.
        if (targeted === false && this.actor && pending(this.actor)) {
          const caller = new Error().stack ?? '';
          if (midiTargets && options?.releaseOthers === false && midiBundle.test(caller)) return;
          if (monkTargets && monkTurnBundle.test(caller)) return;
        }
        return setTarget.call(this, targeted, options);
      };
      if (Reflect.defineProperty(token, 'setTarget', { configurable: true, writable: true, value: replacement })) {
        protectedTargets.set(token, { replacement, previous });
      }
    }
  }

  function installCpr(): boolean {
    if (cprReady) return true;
    if (!installed('cat', '0.1.9+local.1') || !installed(cprSource, '2.1.8+local.2') || !active('midi-qol')) return false;
    const cat = globals.cat;
    const descriptor = cat?.lib?.constants?.macros?.getFnMacros(cprSource, 'all', cprMacro, 'effect', 'actorCreated')?.macros[0];
    if (!descriptor || typeof cat?.api?.registerFnMacro !== 'function'
      || typeof cat.utils?.workflowUtils?.completeItemUse !== 'function') return false;
    cprReady = Boolean(cat.api.registerFnMacro({
      source: cprSource,
      rules: 'all',
      identifier: cprMacro,
      generic: true,
      documents: ['item'],
      effect: [{
        ...descriptor,
        macro(context: DeathContext) {
          const skipped = context.options?.[MODULE_ID] as SuppressedMacros | undefined;
          if (skipped?.actor === context.document.parent?.uuid && skipped?.items?.includes(context.document.id)) return;
          return descriptor.macro(context);
        },
      }],
    }, true));
    return cprReady;
  }

  function automatic(item: NativeItem): (() => Promise<unknown>) | undefined {
    if (!installCpr() || !hasDeathMacro(item)) return;
    return async () => {
      const result = await globals.cat!.utils!.workflowUtils!.completeItemUse(item, [], {
        userId: globals.game?.user?.id,
        options: { workflowOptions: { allowIncapacitated: true } },
      }) as { activity?: unknown; aborted?: boolean; outcome?: string } | undefined;
      return Boolean(result?.activity && !result.aborted && result.outcome !== 'invalid');
    };
  }

  function skipAutomatic(actor: NativeActor): void {
    if (!installCpr()) return;
    const items = [...actor.items].filter(item => hasDeathMacro(item) && hasDefeatReminder(item, actor.name)).map(item => item.id);
    if (items.length) suppressDeathMacro.set(actor.uuid, { actor: actor.uuid, items });
  }

  function markStatusCreation(effect: NativeEffect, data: { statuses?: string[] }, options: EffectOptions): void {
    const actor = effectActor(effect);
    if (!actor || ![...(data.statuses ?? effect.statuses ?? [])].includes('dead')) return;
    const skipped = suppressDeathMacro.get(actor.uuid);
    if (skipped) {
      options[MODULE_ID] = skipped;
      suppressDeathMacro.delete(actor.uuid);
    }
  }

  return { holdEffectRemoval, replayEffects, protectTarget, automatic, skipAutomatic, markStatusCreation };
}

function harmfulExpiry(effect: CompatEffect, actor: NativeActor): boolean {
  const duration = effect.getFlag?.('dae', 'specialDuration');
  if (effect.disabled || !Array.isArray(duration) || !duration.includes('zeroHP')) return false;
  const source = actor as CompatActor;
  const tokens = [source.token, ...(source.getActiveTokens?.(false, true) ?? [])];
  const uuids = new Set(tokens.flatMap(token => token && 'uuid' in token ? [token.uuid] : []));
  // Arbitrary off macros are not presumed to remove this Token.
  return [...(effect.system?.changes ?? effect.changes ?? [])].some(change =>
    change.key === 'flags.dae.deleteUuid' && typeof change.value === 'string' && uuids.has(change.value));
}

function hasDeathMacro(item: NativeItem): boolean {
  const equipped = (item.system as { equipped?: boolean }).equipped;
  const flags = item.getFlag('cat', 'macros') as { effect?: { source?: string; identifier?: string }[] } | undefined;
  return equipped !== false && Boolean(flags?.effect?.some(binding =>
    binding.source === cprSource && binding.identifier === cprMacro));
}

function hasDefeatReminder(item: NativeItem, actorName: string): boolean {
  const activities = [...(item.system.activities ?? [])];
  return (activities.length ? activities : [undefined]).some(activity => {
    const trigger = itemTrigger(item, activity, actorName);
    return trigger?.kind === 'zero' || trigger?.kind === 'death';
  });
}

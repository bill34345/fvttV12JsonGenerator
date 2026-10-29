import type { ConditionId, ConditionInstance, ConditionParams } from '@fvtt-json-generator/contracts/conditions';
import type {
  WeaponEffectInput,
  WeaponEffectInstance,
  WeaponEffectReservationInput,
  WeaponEffectReservationTicket,
} from '@fvtt-json-generator/contracts/weapon-effects';
import type { ConditionApplyOptions, ConditionEntry, ConditionRuntime } from './runtime.ts';
import type { WeaponEffectEntry, WeaponEffectRuntime } from './weapon-effects.ts';
import type { InjuryState } from './injury.ts';
import { ConfiguredConditionRuntime, type ConfiguredConditionEntry, type ConfiguredApplyOptions } from './configured-runtime.ts';
import type { ConfiguredConditionDefinition, ConfiguredConditionReference } from '@fvtt-json-generator/contracts/configured-conditions';

export interface WeaponEffectsApi {
  readonly version: 1;
  readonly capabilities: Readonly<{ native6Effects?: 1 }>;
  list(actor: any): WeaponEffectEntry[];
  apply(actor: any, input: WeaponEffectInput): Promise<any>;
  remove(actor: any, id: string): Promise<void>;
  setEnabled(actor: any, id: string, enabled: boolean): Promise<void>;
  reserve(actor: any, input: WeaponEffectReservationInput): Promise<WeaponEffectReservationTicket | undefined>;
  start(actor: any, ticket: WeaponEffectReservationTicket): Promise<WeaponEffectReservationTicket>;
  commit(actor: any, ticket: WeaponEffectReservationTicket): Promise<void>;
  cancel(actor: any, ticket: WeaponEffectReservationTicket): Promise<void>;
}

export interface ConditionManagerOpenContext {
  actor: any;
  conditionId?: ConditionId;
}

export interface CustomConditionsApi {
  readonly capabilities: Readonly<{ combatRewind: 1; awaitIdle: 1 }>;
  whenIdle(): Promise<void>;
  definitions(): ReturnType<ConditionRuntime['definitions']>;
  list(actor: any): ConditionEntry[];
  apply(actor: any, conditionId: ConditionId, params: ConditionParams, options?: ConditionApplyOptions): Promise<any>;
  update(actor: any, id: string, conditionId: ConditionId, params: ConditionParams): Promise<void>;
  remove(actor: any, id: string): Promise<void>;
  setEnabled(actor: any, id: string, enabled: boolean): Promise<void>;
  applyFromItem(item: any, actors: any[], effectId?: string, overrides?: ConditionParams): Promise<void>;
  escapeFrozen(actor: any, effectId: string, rollerActor?: any): ReturnType<ConditionRuntime['escapeFrozen']>;
  openManager(context?: ConditionManagerOpenContext): Promise<unknown>;
  configuredConditions: {
    readonly version: 1;
    catalog(): ConfiguredConditionDefinition[];
    save(definition: ConfiguredConditionDefinition): Promise<ConfiguredConditionDefinition>;
    delete(id: string): Promise<void>;
    apply(actor: any, ref: ConfiguredConditionReference, options?: ConfiguredApplyOptions): Promise<any>;
    list(actor: any): ConfiguredConditionEntry[];
    remove(actor: any, instanceId: string): Promise<void>;
    setEnabled(actor: any, instanceId: string, enabled: boolean): Promise<void>;
    openEditor(): Promise<unknown>;
    onRootDeleted(effect: any): Promise<void>;
    onRootUpdated(effect: any, changed: any, options: any): Promise<void>;
  };
  weaponEffects: WeaponEffectsApi;
  injury: {
    readonly owner: 'fvtt-custom-conditions';
    isEnabled(): boolean;
    getState(actor: any): InjuryState;
    setStacks(actor: any, stacks: number, reason?: string): Promise<void>;
    migrate(actor: any): Promise<InjuryState>;
    applyRest(actor: any, restType: 'short' | 'long', id: string): Promise<void>;
    suppressNextRecovery(actor: any, transactionId: string, reason: string): Promise<void>;
    withSuppressed<T>(actor: any, reason: string, callback: () => Promise<T> | T): Promise<T>;
  };
}

export function createConditionsApi(runtime: ConditionRuntime, openManager: (context?: ConditionManagerOpenContext) => Promise<unknown> | unknown,
  openEditor: () => Promise<unknown> | unknown = () => { throw new Error('Configured condition editor is unavailable.'); }): CustomConditionsApi {
  const weaponEffects = createWeaponEffectsApi(runtime.weaponEffects);
  const configured = new ConfiguredConditionRuntime(runtime.globals, runtime.isActiveGM, runtime);
  return Object.freeze({
    capabilities: Object.freeze({ combatRewind: 1 as const, awaitIdle: 1 as const }),
    whenIdle: () => runtime.whenIdle(),
    definitions: () => runtime.definitions(),
    list: (actor: any) => runtime.list(actor),
    apply: (actor: any, conditionId: ConditionId, params: ConditionParams, options?: ConditionApplyOptions) => runtime.apply(actor, conditionId, params, options),
    update: (actor: any, id: string, conditionId: ConditionId, params: ConditionParams) => runtime.update(actor, id, conditionId, params),
    remove: (actor: any, id: string) => runtime.remove(actor, id),
    setEnabled: (actor: any, id: string, enabled: boolean) => runtime.setEnabled(actor, id, enabled),
    applyFromItem: (item: any, actors: any[], effectId?: string, overrides?: ConditionParams) => runtime.applyFromItem(item, actors, effectId, overrides),
    escapeFrozen: (actor: any, effectId: string, rollerActor?: any) => runtime.escapeFrozen(actor, effectId, rollerActor),
    openManager: async (context?: ConditionManagerOpenContext) => openManager(context),
    configuredConditions: Object.freeze({
      version: 1 as const,
      catalog: () => configured.catalog(),
      save: (definition: ConfiguredConditionDefinition) => configured.save(definition),
      delete: (id: string) => configured.delete(id),
      apply: (actor: any, ref: ConfiguredConditionReference, options?: ConfiguredApplyOptions) => configured.apply(actor, ref, options),
      list: (actor: any) => configured.list(actor),
      remove: (actor: any, instanceId: string) => configured.remove(actor, instanceId),
      setEnabled: (actor: any, instanceId: string, enabled: boolean) => configured.setEnabled(actor, instanceId, enabled),
      openEditor: async () => openEditor(),
      onRootDeleted: (effect: any) => configured.onRootDeleted(effect),
      onRootUpdated: (effect: any, changed: any, options: any) => configured.onRootUpdated(effect, changed, options),
    }),
    weaponEffects,
    injury: Object.freeze({
      owner: 'fvtt-custom-conditions' as const,
      isEnabled: () => runtime.injury.enabled(),
      getState: (actor: any) => runtime.injury.getState(actor),
      setStacks: (actor: any, stacks: number, reason?: string) => runtime.injury.setStacks(actor, stacks, reason),
      migrate: (actor: any) => runtime.injury.migrate(actor),
      applyRest: (actor: any, restType: 'short' | 'long', id: string) => runtime.injury.applyRest(actor, restType, id),
      suppressNextRecovery: (actor: any, transactionId: string, reason: string) => runtime.injury.suppressNextRecovery(actor, transactionId, reason),
      withSuppressed: <T>(actor: any, reason: string, callback: () => Promise<T> | T) => runtime.injury.withSuppressed(actor, reason, callback),
    }),
  });
}

export function createWeaponEffectsApi(runtime: WeaponEffectRuntime): WeaponEffectsApi {
  return Object.freeze({
    version: 1 as const,
    capabilities: Object.freeze(runtime.isNative6Supported() ? { native6Effects: 1 as const } : {}),
    list: (actor: any) => runtime.list(actor),
    apply: (actor: any, input: WeaponEffectInput) => runtime.apply(actor, input),
    remove: (actor: any, id: string) => runtime.remove(actor, id),
    setEnabled: (actor: any, id: string, enabled: boolean) => runtime.setEnabled(actor, id, enabled),
    reserve: (actor: any, input: WeaponEffectReservationInput) => runtime.reserve(actor, input),
    start: (actor: any, ticket: WeaponEffectReservationTicket) => runtime.start(actor, ticket),
    commit: (actor: any, ticket: WeaponEffectReservationTicket) => runtime.commit(actor, ticket),
    cancel: (actor: any, ticket: WeaponEffectReservationTicket) => runtime.cancel(actor, ticket),
  });
}

export type { ConditionApplyOptions, ConditionEntry, ConditionRuntime } from './runtime.ts';
export type { WeaponEffectEntry, WeaponEffectRuntime } from './weapon-effects.ts';
export type { ConditionInstance, ConditionParams } from '@fvtt-json-generator/contracts/conditions';
export type { WeaponEffectInput, WeaponEffectInstance, WeaponEffectReservationInput, WeaponEffectReservationTicket } from '@fvtt-json-generator/contracts/weapon-effects';

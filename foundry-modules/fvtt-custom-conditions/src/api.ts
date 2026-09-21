import type { ConditionId, ConditionInstance, ConditionParams } from '@fvtt-json-generator/contracts/conditions';
import type { ConditionApplyOptions, ConditionEntry, ConditionRuntime } from './runtime.ts';

export interface CustomConditionsApi {
  definitions(): ReturnType<ConditionRuntime['definitions']>;
  list(actor: any): ConditionEntry[];
  apply(actor: any, conditionId: ConditionId, params: ConditionParams, options?: ConditionApplyOptions): Promise<any>;
  update(actor: any, id: string, conditionId: ConditionId, params: ConditionParams): Promise<void>;
  remove(actor: any, id: string): Promise<void>;
  setEnabled(actor: any, id: string, enabled: boolean): Promise<void>;
  applyFromItem(item: any, actors: any[], effectId?: string, overrides?: ConditionParams): Promise<void>;
  escapeFrozen(actor: any, effectId: string, rollerActor?: any): ReturnType<ConditionRuntime['escapeFrozen']>;
  openManager(): Promise<unknown>;
}

export function createConditionsApi(runtime: ConditionRuntime, openManager: () => Promise<unknown> | unknown): CustomConditionsApi {
  return Object.freeze({
    definitions: () => runtime.definitions(),
    list: (actor: any) => runtime.list(actor),
    apply: (actor: any, conditionId: ConditionId, params: ConditionParams, options?: ConditionApplyOptions) => runtime.apply(actor, conditionId, params, options),
    update: (actor: any, id: string, conditionId: ConditionId, params: ConditionParams) => runtime.update(actor, id, conditionId, params),
    remove: (actor: any, id: string) => runtime.remove(actor, id),
    setEnabled: (actor: any, id: string, enabled: boolean) => runtime.setEnabled(actor, id, enabled),
    applyFromItem: (item: any, actors: any[], effectId?: string, overrides?: ConditionParams) => runtime.applyFromItem(item, actors, effectId, overrides),
    escapeFrozen: (actor: any, effectId: string, rollerActor?: any) => runtime.escapeFrozen(actor, effectId, rollerActor),
    openManager: async () => openManager(),
  });
}

export type { ConditionApplyOptions, ConditionEntry, ConditionRuntime } from './runtime.ts';
export type { ConditionInstance, ConditionParams } from '@fvtt-json-generator/contracts/conditions';

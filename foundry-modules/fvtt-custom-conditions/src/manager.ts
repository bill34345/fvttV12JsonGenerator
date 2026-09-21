import {
  CONDITION_DEFINITIONS,
  createConditionInstance,
  type ConditionId,
  type ConditionParams,
} from '@fvtt-json-generator/contracts/conditions';
import { CONDITION_MANAGER_CONTROL_NAME, MODULE_ID } from './constants.ts';
import type { CustomConditionsApi } from './api.ts';

export function createConditionManagerApplicationClass(api?: CustomConditionsApi, globals: any = globalThis): any {
  const foundryApi = globals.foundry?.applications?.api;
  const ApplicationV2 = foundryApi?.ApplicationV2;
  const HandlebarsApplicationMixin = foundryApi?.HandlebarsApplicationMixin;
  if (typeof ApplicationV2 !== 'function') throw new Error('Foundry 14 ApplicationV2 is unavailable.');
  const Base = typeof HandlebarsApplicationMixin === 'function' ? HandlebarsApplicationMixin(ApplicationV2) : ApplicationV2;

  return class ConditionManagerApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-manager`, tag: 'form',
      window: { title: 'FVTTCONDITIONS.Manager.Title', contentClasses: ['standard-form'], icon: 'fa-solid fa-flask' },
      position: { width: 820, height: 720 },
      form: { closeOnSubmit: false, handler: this.onSubmit },
      actions: { refresh: this.refresh, remove: this.remove, toggle: this.toggle, edit: this.edit, escapeFrozen: this.escapeFrozen },
    };

    static PARTS = {
      body: { template: `modules/${MODULE_ID}/templates/condition-manager.hbs` },
      footer: { template: 'templates/generic/form-footer.hbs' },
    };

    api: CustomConditionsApi;
    actors = captureTargets(globals);
    conditionId: ConditionId = 'bleeding';
    paramsJson = JSON.stringify(createConditionInstance('bleeding', { formula: '1d6' }).params, null, 2);
    escaping = false;
    sourceName = '';
    origin = '';
    editing: { actorUuid: string; effectId: string } | null = null;

    constructor(options?: { api?: CustomConditionsApi }) {
      super();
      this.api = options?.api ?? api ?? globals.game?.modules?.get?.(MODULE_ID)?.api;
      if (!this.api) throw new Error('Custom Conditions API is unavailable.');
    }

    async _prepareContext() {
      const definitions = Object.values(CONDITION_DEFINITIONS).map((definition) => ({ ...definition, selected: definition.id === this.conditionId }));
      return {
        definitions,
        conditionId: this.conditionId,
        paramsJson: this.paramsJson,
        sourceName: this.sourceName,
        origin: this.origin,
        actors: this.actors.map((actor: any) => ({
          uuid: actor.uuid,
          name: actor.name,
          conditions: this.api.list(actor).map((entry) => ({
            ...entry,
            actorUuid: actor.uuid,
            canEscapeFrozen: entry.instance.conditionId === 'frozen' && !entry.disabled,
            instanceJson: JSON.stringify(entry.instance, null, 2),
            paramsJson: JSON.stringify(entry.instance.params, null, 2),
          })),
        })),
        buttons: [{ type: 'submit', icon: 'fa-solid fa-flask', label: 'FVTTCONDITIONS.Manager.Apply' }],
      };
    }

    static async refresh(this: any) {
      this.actors = captureTargets(globals);
      this.editing = null;
      await this.render({ force: true });
    }

    static async edit(this: any, _event: unknown, target: any) {
      const actor = this.actors.find((candidate: any) => candidate.uuid === target.dataset.actorUuid);
      const entry = actor && this.api.list(actor).find((candidate: any) => candidate.id === target.dataset.effectId);
      if (!entry) return;
      this.conditionId = entry.instance.conditionId;
      this.paramsJson = JSON.stringify(entry.instance.params, null, 2);
      this.sourceName = entry.name;
      this.origin = entry.origin;
      this.editing = { actorUuid: actor.uuid, effectId: entry.id };
      await this.render({ force: true });
    }

    static async remove(this: any, _event: unknown, target: any) {
      const actor = this.actors.find((candidate: any) => candidate.uuid === target.dataset.actorUuid);
      if (!actor) return;
      try { await this.api.remove(actor, target.dataset.effectId); await this.render({ force: true }); }
      catch (error) { notify(globals, error); }
    }

    static async escapeFrozen(this: any, _event: unknown, target: any) {
      if (this.escaping) return;
      const actor = this.actors.find((candidate: any) => candidate.uuid === target.dataset.actorUuid);
      if (!actor) return;
      this.escaping = true;
      try {
        const helpers = [...new Map<string, any>((globals.canvas?.tokens?.controlled ?? [])
          .map((token: any) => token.actor)
          .filter((candidate: any) => candidate && candidate.uuid !== actor.uuid)
          .map((candidate: any) => [candidate.uuid, candidate] as [string, any])).values()];
        if (helpers.length > 1) throw new Error(globals.game?.i18n?.localize?.('FVTTCONDITIONS.Manager.OneHelper') ?? '请选择至多一个协助者。');
        await this.api.escapeFrozen(actor, target.dataset.effectId, helpers[0] ?? actor);
        await this.render({ force: true });
      } catch (error) { notify(globals, error); }
      finally { this.escaping = false; }
    }

    static async toggle(this: any, _event: unknown, target: any) {
      const actor = this.actors.find((candidate: any) => candidate.uuid === target.dataset.actorUuid);
      const entry = actor && this.api.list(actor).find((candidate: any) => candidate.id === target.dataset.effectId);
      if (!actor || !entry) return;
      try { await this.api.setEnabled(actor, entry.id, entry.disabled); await this.render({ force: true }); }
      catch (error) { notify(globals, error); }
    }

    static async onSubmit(this: any, _event: unknown, _form: unknown, formData: any) {
      try {
        const data = formData?.object ?? formData;
        const conditionId = String(data.conditionId) as ConditionId;
        const params = JSON.parse(String(data.paramsJson ?? '{}')) as ConditionParams;
        if (!this.actors.length) throw new Error('请先标记或选中至少一个 Actor。');
        if (this.editing) {
          const actor = this.actors.find((candidate: any) => candidate.uuid === this.editing.actorUuid);
          if (!actor) throw new Error('编辑目标不再存在。');
          await this.api.update(actor, this.editing.effectId, conditionId, params);
        } else {
          for (const actor of this.actors) await this.api.apply(actor, conditionId, params, {
            name: String(data.sourceName ?? '').trim() || undefined,
            origin: String(data.origin ?? '').trim() || undefined,
          });
        }
        this.editing = null;
        this.paramsJson = JSON.stringify(params, null, 2);
        await this.render({ force: true });
      } catch (error) { notify(globals, error); }
    }
  };
}

export async function openConditionManager(api: CustomConditionsApi, globals: any = globalThis): Promise<unknown> {
  const Application = createConditionManagerApplicationClass(api, globals);
  return new Application({ api }).render({ force: true });
}

export function captureTargets(globals: any): any[] {
  const targets = [...(globals.game?.user?.targets?.values?.() ?? globals.game?.user?.targets ?? [])];
  if (targets.length) return targets.map((target: any) => target.actor ?? target.document?.actor).filter(Boolean);
  return [...(globals.canvas?.tokens?.controlled ?? [])].map((token: any) => token.actor).filter(Boolean);
}

function notify(globals: any, error: unknown): void {
  globals.ui?.notifications?.error?.(error instanceof Error ? error.message : String(error));
}

import { MODULE_ID } from './constants.ts';
import type { TriggerEngineApi } from './api.ts';
import type { TriggerDefinition } from './types.ts';

export const EMPTY_TRIGGER_DEFINITION: TriggerDefinition = {
  id: 'new-trigger',
  name: 'New Trigger',
  enabled: true,
  event: { type: 'documentUpdate', documentType: 'Actor', watchedPaths: ['system.attributes.hp.value'] },
  conditions: null,
  actions: [{ type: 'macro', macroUuid: 'Macro.example' }],
};

/** Create the v14 ApplicationV2 class only after Foundry globals are ready. */
export function createTriggerManagerApplicationClass(api?: TriggerEngineApi, globals: any = globalThis): any {
  const foundryApi = globals.foundry?.applications?.api;
  const ApplicationV2 = foundryApi?.ApplicationV2;
  const HandlebarsApplicationMixin = foundryApi?.HandlebarsApplicationMixin;
  if (typeof ApplicationV2 !== 'function') throw new Error('Foundry 14 ApplicationV2 is unavailable.');
  const Base = typeof HandlebarsApplicationMixin === 'function' ? HandlebarsApplicationMixin(ApplicationV2) : ApplicationV2;

  return class TriggerManagerApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-manager`,
      tag: 'form',
      window: {
        title: 'FVTTTRIGGER.Manager.Title',
        contentClasses: ['standard-form'],
        icon: 'fa-solid fa-bolt',
      },
      position: { width: 760, height: 640 },
      form: { closeOnSubmit: false, handler: this.onSubmit },
      actions: {
        create: this.create,
        edit: this.edit,
        copy: this.copy,
        toggle: this.toggle,
        delete: this.delete,
      },
    };

    static PARTS = {
      body: { template: `modules/${MODULE_ID}/templates/trigger-manager.hbs` },
      footer: { template: 'templates/generic/form-footer.hbs' },
    };

    api: TriggerEngineApi;
    editingId: string | null = null;
    editorJson = '';

    constructor(options?: { api?: TriggerEngineApi } | TriggerEngineApi) {
      super();
      const candidate = options && 'list' in options ? options : (options as { api?: TriggerEngineApi } | undefined)?.api;
      this.api = candidate ?? api ?? globals.game?.modules?.get?.(MODULE_ID)?.api;
      if (!this.api) throw new Error('FVTT Trigger Engine API is unavailable.');
    }

    async _prepareContext() {
      return {
        triggers: this.api.list(),
        editingId: this.editingId,
        editorJson: this.editorJson,
        buttons: [{ type: 'submit', icon: 'fa-solid fa-save', label: 'FVTTTRIGGER.Manager.Save' }],
      };
    }

    static async create(this: any) {
      this.editingId = null;
      this.editorJson = JSON.stringify(EMPTY_TRIGGER_DEFINITION, null, 2);
      await this.render({ force: true });
    }

    static async edit(this: any, _event: unknown, target: any) {
      const id = triggerIdFromTarget(target);
      if (!id) return;
      const trigger = this.api.list().find((entry: TriggerDefinition) => entry.id === id);
      if (!trigger) return;
      this.editingId = id;
      this.editorJson = JSON.stringify(trigger, null, 2);
      await this.render({ force: true });
    }

    static async copy(this: any, _event: unknown, target: any) {
      const id = triggerIdFromTarget(target);
      if (!id) return;
      await this.api.copy(id);
      await this.render({ force: true });
    }

    static async toggle(this: any, _event: unknown, target: any) {
      const id = triggerIdFromTarget(target);
      if (!id) return;
      const trigger = this.api.list().find((entry: TriggerDefinition) => entry.id === id);
      if (!trigger) return;
      await this.api.setEnabled(id, !trigger.enabled);
      await this.render({ force: true });
    }

    static async delete(this: any, _event: unknown, target: any) {
      const id = triggerIdFromTarget(target);
      if (!id) return;
      await this.api.delete(id);
      if (this.editingId === id) {
        this.editingId = null;
        this.editorJson = '';
      }
      await this.render({ force: true });
    }

    static async onSubmit(this: any, _event: unknown, _form: unknown, formData: any) {
      const raw = formData?.object?.definition ?? formData?.definition;
      try {
        const definition = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (this.editingId) await this.api.update(this.editingId, definition);
        else await this.api.create(definition);
        this.editingId = null;
        this.editorJson = '';
        await this.render({ force: true });
      } catch (error) {
        const notification = (globalThis as any).ui?.notifications?.error;
        if (typeof notification === 'function') notification.call((globalThis as any).ui.notifications, String(error));
        else console.error(`[${MODULE_ID}] manager save failed`, error);
      }
    }
  };
}

export async function openTriggerManager(api: TriggerEngineApi, isActiveGM: () => boolean, globals: any = globalThis): Promise<unknown> {
  if (!isActiveGM()) throw new Error('FVTT Trigger Engine manager is available to active GMs only.');
  const Application = createTriggerManagerApplicationClass(api, globals);
  const application = new Application({ api });
  return application.render({ force: true });
}

function triggerIdFromTarget(target: any): string | undefined {
  const direct = target?.dataset?.triggerId;
  if (typeof direct === 'string' && direct) return direct;
  const closest = target?.closest?.('[data-trigger-id]')?.dataset?.triggerId;
  return typeof closest === 'string' && closest ? closest : undefined;
}

import {
  CONDITION_DEFINITIONS,
  createConditionInstance,
  type ConditionId,
  type ConditionParams,
} from '@fvtt-json-generator/contracts/conditions';
import { CONDITION_MANAGER_CONTROL_NAME, MODULE_ID } from './constants.ts';
import type { ConditionManagerOpenContext, CustomConditionsApi } from './api.ts';
import { conditionIconPath, localizedConditionDefinitions, localize } from './localization.ts';

const INJURY_MODULE_ID = 'fvtt-injury-fading-spirits' as const;
const MAX_INJURY_STACKS = 3;
const injuryChangeQueues = new Map<string, Promise<void>>();

interface InjuryPresentation {
  id: string;
  name: string;
  description: string;
  img: string;
}

interface InjuryApi {
  getState: (actor: any) => unknown | Promise<unknown>;
  setStacks: (actor: any, stacks: number, reason: string) => Promise<unknown> | unknown;
}

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
      actions: {
        refresh: this.refresh,
        remove: this.remove,
        toggle: this.toggle,
        edit: this.edit,
        escapeFrozen: this.escapeFrozen,
        increaseInjury: this.increaseInjury,
        decreaseInjury: this.decreaseInjury,
        openInjuryWizard: this.openInjuryWizard,
      },
    };

    static PARTS = {
      body: { template: `modules/${MODULE_ID}/templates/condition-manager.hbs` },
      footer: { template: 'templates/generic/form-footer.hbs' },
    };

    api: CustomConditionsApi;
    fixedActor: any | undefined;
    actors = captureTargets(globals);
    conditionId: ConditionId = 'bleeding';
    paramsJson = JSON.stringify(createConditionInstance('bleeding', { formula: '1d6' }).params, null, 2);
    escaping = false;
    sourceName = '';
    origin = '';
    editing: { actorUuid: string; effectId: string } | null = null;

    constructor(options?: { api?: CustomConditionsApi; context?: ConditionManagerOpenContext }) {
      super();
      this.api = options?.api ?? api ?? globals.game?.modules?.get?.(MODULE_ID)?.api;
      if (!this.api) throw new Error('Custom Conditions API is unavailable.');
      if (options?.context) {
        if (options.context.actor?.documentName !== 'Actor') throw new TypeError('Condition manager requires one Actor.');
        this.fixedActor = options.context.actor;
        this.actors = [this.fixedActor];
        if (options.context.conditionId) this.conditionId = options.context.conditionId;
        if (options.context.conditionId) this.paramsJson = JSON.stringify(hudParameterDraft(this.conditionId), null, 2);
      }
    }

    async _prepareContext() {
      const definitions = localizedConditionDefinitions(globals).map((definition) => ({ ...definition, selected: definition.id === this.conditionId }));
      const actors = await Promise.all(this.actors.map(async (actor: any) => ({
        uuid: actor.uuid,
        name: actor.name,
        conditions: this.api.list(actor).map((entry) => ({
          ...entry,
          actorUuid: actor.uuid,
          conditionLabel: localizedConditionDefinitions(globals).find((definition) => definition.id === entry.instance.conditionId)?.label
            ?? entry.instance.conditionId,
          img: conditionIconPath(entry.instance.conditionId),
          canEscapeFrozen: entry.instance.conditionId === 'frozen' && !entry.disabled,
          instanceJson: JSON.stringify(entry.instance, null, 2),
          paramsJson: JSON.stringify(entry.instance.params, null, 2),
        })),
      })));
      return {
        genericAvailable: globals.game?.version === undefined
          || (globals.game.version === '14.364' && globals.game.system?.version === '5.3.3'),
        definitions,
        conditionId: this.conditionId,
        paramsJson: this.paramsJson,
        sourceName: this.sourceName,
        origin: this.origin,
        actors,
        injury: await prepareInjuryContext(globals, this.actors),
        buttons: [{ type: 'submit', icon: 'fa-solid fa-flask', label: 'FVTTCONDITIONS.Manager.Apply' }],
      };
    }

    static async refresh(this: any) {
      this.actors = this.fixedActor ? [this.fixedActor] : captureTargets(globals);
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

    static async increaseInjury(this: any, _event: unknown, target: any) {
      await changeInjury(this, target, 1, globals);
    }

    static async decreaseInjury(this: any, _event: unknown, target: any) {
      await changeInjury(this, target, -1, globals);
    }

    static async openInjuryWizard(this: any, _event: unknown, target: any) {
      const actor = this.actors.find((candidate: any) => candidate.uuid === target.dataset.actorUuid);
      const fadingModule = globals.game?.modules?.get?.(INJURY_MODULE_ID);
      const openResurrectionWizard = fadingModule?.active === true ? fadingModule.api?.openResurrectionWizard : undefined;
      if (!actor || typeof openResurrectionWizard !== 'function') return;
      try {
        await openResurrectionWizard(actor);
        await this.render({ force: true });
      } catch (error) { notify(globals, error); }
    }

    static async onSubmit(this: any, _event: unknown, _form: unknown, formData: any) {
      if (globals.game?.version !== undefined
        && (globals.game.version !== '14.364' || globals.game.system?.version !== '5.3.3')) return;
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

/** A HUD shortcut never supplies a required parameter on the GM's behalf. */
function hudParameterDraft(conditionId: ConditionId): ConditionParams {
  const params: ConditionParams = {};
  for (const parameter of CONDITION_DEFINITIONS[conditionId].parameters) {
    if (parameter.required && parameter.default === undefined) params[parameter.id] = '';
    else if (parameter.default !== undefined) params[parameter.id] = parameter.default;
  }
  return params;
}

export function readInjuryApi(globals: any = globalThis): InjuryApi | undefined {
  const module = globals.game?.modules?.get?.(MODULE_ID);
  const injuryApi = module?.active === true ? module.api?.injury : undefined;
  if (!injuryApi || typeof injuryApi !== 'object') return undefined;
  if (typeof injuryApi.getState !== 'function'
    || typeof injuryApi.setStacks !== 'function') return undefined;
  return injuryApi as InjuryApi;
}

export async function prepareInjuryContext(globals: any, actors: any[]): Promise<any> {
  const api = readInjuryApi(globals);
  if (!api) return { enabled: false, actors: [] };
  const presentation = injuryPresentation(globals);
  const entries = await Promise.all(actors.map(async (actor: any) => {
    try {
      const stacks = readInjuryStacks(await api.getState(actor), actor);
      return {
      actorUuid: actor.uuid,
      actorName: actor.name,
      stacks,
      maxStacks: MAX_INJURY_STACKS,
      canIncrease: stacks < MAX_INJURY_STACKS,
      canDecrease: stacks > 0,
      img: presentation.img,
      description: formatInjuryDescription(globals, stacks),
      };
    } catch (error) {
      return { actorUuid: actor.uuid, actorName: actor.name,
        error: error instanceof Error ? error.message : String(error) };
    }
  }));
  return {
    enabled: true,
    ...presentation,
    resurrectionAvailable: globals.game?.modules?.get?.(INJURY_MODULE_ID)?.active === true
      && typeof globals.game?.modules?.get?.(INJURY_MODULE_ID)?.api?.openResurrectionWizard === 'function',
    actors: entries,
  };
}

async function changeInjury(application: any, target: any, delta: number, globals: any): Promise<void> {
  const actor = application.actors.find((candidate: any) => candidate.uuid === target?.dataset?.actorUuid);
  if (!actor) return;
  const actorKey = String(actor.uuid ?? actor.id ?? '');
  if (!actorKey) return;
  const previous = injuryChangeQueues.get(actorKey) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(async () => {
    const injuryApi = readInjuryApi(globals);
    if (typeof injuryApi?.getState !== 'function' || typeof injuryApi.setStacks !== 'function') return;
    const stacks = readInjuryStacks(await injuryApi.getState(actor), actor);
    const next = Math.max(0, Math.min(MAX_INJURY_STACKS, stacks + delta));
    if (next !== stacks) await injuryApi.setStacks(actor, next, 'custom-conditions-manager');
    await application.render({ force: true });
  });
  const tail = run.then(() => undefined, () => undefined);
  injuryChangeQueues.set(actorKey, tail);
  void tail.finally(() => {
    if (injuryChangeQueues.get(actorKey) === tail) injuryChangeQueues.delete(actorKey);
  });
  try {
    await run;
  } catch (error) { notify(globals, error); }
}

function injuryPresentation(globals: any): InjuryPresentation {
  return {
    id: 'fvtt-injury',
    name: localize(globals, 'FVTTCONDITIONS.Injury.Name', 'Injury'),
    description: localize(globals, 'FVTTCONDITIONS.Injury.ManagerSummary',
      'Injury has 0–3 levels. Current levels are shown separately for each Actor below; the GM decides a third-level fall.'),
    img: `modules/${MODULE_ID}/icons/injury/injury-1.svg`,
  };
}

function formatInjuryDescription(globals: any, stacks: number): string {
  const description = localize(globals, 'FVTTCONDITIONS.Injury.Level', 'Injury {stacks}/{max}');
  const format = globals?.game?.i18n?.format;
  if (typeof format === 'function' && description.includes('{stacks}')) {
    try { return format.call(globals.game.i18n, 'FVTTCONDITIONS.Injury.Level', { stacks, max: MAX_INJURY_STACKS }); }
    catch { /* fall through to local placeholder replacement */ }
  }
  return description.replaceAll('{stacks}', String(stacks)).replaceAll('{max}', String(MAX_INJURY_STACKS));
}

function readInjuryStacks(state: any, actor: any): number {
  const raw = state?.stacks ?? actor?.flags?.[MODULE_ID]?.injury?.state?.stacks ?? 0;
  const value = Number(raw);
  return Number.isInteger(value) ? Math.max(0, Math.min(MAX_INJURY_STACKS, value)) : 0;
}

export async function openConditionManager(
  api: CustomConditionsApi,
  globals: any = globalThis,
  context?: ConditionManagerOpenContext,
): Promise<unknown> {
  const Application = createConditionManagerApplicationClass(api, globals);
  return new Application({ api, context }).render({ force: true });
}

export function captureTargets(globals: any): any[] {
  const targets = [...(globals.game?.user?.targets?.values?.() ?? globals.game?.user?.targets ?? [])];
  if (targets.length) return targets.map((target: any) => target.actor ?? target.document?.actor).filter(Boolean);
  return [...(globals.canvas?.tokens?.controlled ?? [])].map((token: any) => token.actor).filter(Boolean);
}

function notify(globals: any, error: unknown): void {
  globals.ui?.notifications?.error?.(error instanceof Error ? error.message : String(error));
}
